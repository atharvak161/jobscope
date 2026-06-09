/**
 * POST /api/resume/parse
 *
 * Body: { objectKey: string }
 * Returns: { profile: ParsedProfile }
 *
 * Flow:
 *   1. Authenticate session
 *   2. Verify objectKey ownership (IDOR prevention — hard security requirement)
 *   3. Fetch file buffer from R2 (server-side, using AWS SDK GetObject)
 *   4. Extract text (pdf-parse or mammoth based on key extension)
 *   5. Parse with Claude API → ParsedProfile
 *   6. Store / upsert profile in UserProfile table
 *   7. Return profile to client
 *
 * Security: ownership verified before any R2 access
 * Ref: JOBSCOPE_ARCHITECTURE.md §6.2, §4
 */

import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSession } from '@/lib/auth';
import { verifyFileOwnership, AuthorizationError, StorageConfigError } from '@/lib/resume/store';
import { extractResumeText, ExtractionError } from '@/lib/resume/extract';
import { parseResumeWithClaude, type ParsedProfile } from '@/lib/resume/parse';
import { prisma } from '@/lib/db/client';

// ─────────────────────────────────────────────────────────────────────────────
// R2 fetch helper (server-side, not presigned — uses service credentials)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchFileFromR2(objectKey: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY;
  const secretAccessKey = process.env.R2_SECRET_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new StorageConfigError('R2 storage credentials are not fully configured.');
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const command = new GetObjectCommand({ Bucket: bucket, Key: objectKey });
  const response = await client.send(command);

  if (!response.Body) {
    throw new Error(`R2 returned empty body for key: ${objectKey}`);
  }

  // Convert readable stream to Buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  // Infer MIME type from object key extension (R2 may not always return ContentType)
  const mimeType =
    response.ContentType ??
    inferMimeTypeFromKey(objectKey);

  return { buffer, mimeType };
}

function inferMimeTypeFromKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  // Fallback — will be caught by extractResumeText
  return 'application/octet-stream';
}

// ─────────────────────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });
  }
  const userId = session.id;

  // ── 2. Parse body ────────────────────────────────────────────────────────
  let body: { objectKey?: unknown };
  try {
    body = (await request.json()) as { objectKey?: unknown };
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const objectKey = body.objectKey;
  if (typeof objectKey !== 'string' || !objectKey.trim()) {
    return NextResponse.json({ error: 'Missing required field: objectKey.' }, { status: 400 });
  }

  // ── 3. Verify ownership (IDOR prevention — hard security requirement) ────
  try {
    await verifyFileOwnership(userId, objectKey);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      // Log without PII — userId is UUID, safe to log
      console.warn(`[resume/parse] Ownership check failed for userId=${userId}`);
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
    }
    throw err;
  }

  // ── 4. Fetch file from R2 ────────────────────────────────────────────────
  let buffer: Buffer;
  let mimeType: string;

  try {
    const result = await fetchFileFromR2(objectKey);
    buffer = result.buffer;
    mimeType = result.mimeType;
  } catch (err) {
    if (err instanceof StorageConfigError) {
      console.error('[resume/parse] Storage config error:', err.message);
      return NextResponse.json(
        { error: 'Storage service is not configured.' },
        { status: 503 },
      );
    }
    console.error('[resume/parse] Failed to fetch file from R2:', err);
    return NextResponse.json({ error: 'Failed to retrieve file.' }, { status: 502 });
  }

  // ── 5. Extract text ──────────────────────────────────────────────────────
  let text: string;
  try {
    text = await extractResumeText(buffer, mimeType);
  } catch (err) {
    if (err instanceof ExtractionError) {
      console.warn('[resume/parse] Text extraction failed:', err.message);
      return NextResponse.json(
        { error: `Could not extract text from the resume: ${err.message}` },
        { status: 422 },
      );
    }
    throw err;
  }

  // ── 6. Parse with Claude ─────────────────────────────────────────────────
  let profile: ParsedProfile;
  try {
    profile = await parseResumeWithClaude(text);
  } catch (err) {
    console.error('[resume/parse] Claude parse failed:', err);
    return NextResponse.json(
      { error: 'Resume parsing failed. Please try again.' },
      { status: 502 },
    );
  }

  // ── 7. Store profile in UserProfile table ────────────────────────────────
  try {
    await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        resumeStorageKey: objectKey,
        resumeUploadedAt: new Date(),
        parseStatus: 'PENDING_REVIEW',
        skills: profile.skills,
        certifications: profile.certifications,
        subDomains: [],
        experienceYears: profile.experienceYears,
        rolesJson: profile.roles as object[],
        educationJson: profile.education as object[],
        salaryMin: profile.salaryExpectationMin,
        salaryMax: profile.salaryExpectationMax,
      },
      update: {
        resumeStorageKey: objectKey,
        resumeUploadedAt: new Date(),
        parseStatus: 'PENDING_REVIEW',
        skills: profile.skills,
        certifications: profile.certifications,
        subDomains: [],
        experienceYears: profile.experienceYears,
        rolesJson: profile.roles as object[],
        educationJson: profile.education as object[],
        salaryMin: profile.salaryExpectationMin,
        salaryMax: profile.salaryExpectationMax,
      },
    });
  } catch (err) {
    console.error('[resume/parse] Failed to upsert UserProfile:', err);
    return NextResponse.json(
      { error: 'Failed to save profile. Please try again.' },
      { status: 500 },
    );
  }

  // ── 8. Return parsed profile ─────────────────────────────────────────────
  return NextResponse.json({ profile }, { status: 200 });
}
