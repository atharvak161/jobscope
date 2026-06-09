/**
 * POST /api/resume/upload
 *
 * Accepts multipart/form-data with a 'file' field.
 * Returns { objectKey: string; uploadUrl: string }
 *
 * Flow:
 *   1. Authenticate session
 *   2. Parse multipart body to extract file metadata
 *   3. Validate file (type, size, filename safety)
 *   4. Generate R2 presigned upload URL (client uploads directly — server never buffers the file)
 *   5. Return key + URL to client
 *
 * Security: owner-scoped object key (IDOR prevention), session required
 * Ref: JOBSCOPE_ARCHITECTURE.md §6.2, §6.6
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { validateResumeFile } from '@/lib/resume/validate';
import { generateUploadPresignedUrl } from '@/lib/resume/store';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Auth ──────────────────────────────────────────────────────────────
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });
  }
  const userId = session.id;

  // ── 2. Parse form data ───────────────────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart/form-data body.' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing required field: file.' }, { status: 400 });
  }

  // ── 3. Validate ──────────────────────────────────────────────────────────
  const validation = validateResumeFile({
    name: file.name,
    size: file.size,
    type: file.type,
  });

  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 422 });
  }

  // ── 4. Generate presigned upload URL ─────────────────────────────────────
  let objectKey: string;
  let uploadUrl: string;

  try {
    const result = await generateUploadPresignedUrl(userId, file.name);
    objectKey = result.objectKey;
    uploadUrl = result.uploadUrl;
  } catch (err) {
    console.error('[resume/upload] Failed to generate presigned URL:', err);
    return NextResponse.json(
      { error: 'Storage service unavailable. Please try again later.' },
      { status: 503 },
    );
  }

  // ── 5. Return to client ──────────────────────────────────────────────────
  return NextResponse.json({ objectKey, uploadUrl }, { status: 200 });
}
