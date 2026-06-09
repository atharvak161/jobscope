/**
 * R2 object storage — resume upload and download via presigned URLs
 *
 * Security requirements (IDOR prevention — hard requirement from threat model):
 * - All object keys use format: resumes/{userId}/{uuid}/{sanitizedFileName}
 *   The userId in the key path is a structural guarantee: a key that doesn't
 *   start with the requesting user's ID cannot be signed.
 * - verifyFileOwnership() MUST be called before any download URL is generated.
 * - AuthorizationError is thrown (never silently skipped) on ownership mismatch.
 *
 * R2 is S3-compatible; we use AWS SDK v3 S3 client.
 * Ref: JOBSCOPE_ARCHITECTURE.md §6.2
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
// Typed errors
// ─────────────────────────────────────────────────────────────────────────────

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class StorageConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageConfigError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// S3/R2 client factory (lazy, per-request — avoids startup crashes in Next.js)
// ─────────────────────────────────────────────────────────────────────────────

function getS3Client(): S3Client {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY;
  const secretAccessKey = process.env.R2_SECRET_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new StorageConfigError(
      'R2 storage is not configured. Set CLOUDFLARE_R2_ACCOUNT_ID, R2_ACCESS_KEY, and R2_SECRET_KEY.',
    );
  }

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function getBucket(): string {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) {
    throw new StorageConfigError('R2_BUCKET environment variable is not set.');
  }
  return bucket;
}

// ─────────────────────────────────────────────────────────────────────────────
// Key utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitise a filename for use in an object key.
 * Strips path separators, null bytes, and limits to safe characters.
 */
function sanitiseFileName(name: string): string {
  return name
    .replace(/[/\\]/g, '_')       // path separators → underscore
    .replace(/\.\./g, '_')        // traversal sequences → underscore
    .replace(/[^\w.\-]/g, '_')    // non-word chars (except dot and hyphen) → underscore
    .replace(/^\./, '_')          // leading dot → underscore
    .slice(0, 200);               // length cap
}

/**
 * Build the canonical object key for a resume.
 * Format: resumes/{userId}/{uuid}/{sanitizedFileName}
 * The userId prefix is the primary IDOR control — ownership is structurally enforced.
 */
function buildObjectKey(userId: string, fileName: string): string {
  const uuid = randomUUID();
  const safe = sanitiseFileName(fileName);
  return `resumes/${userId}/${uuid}/${safe}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Signed URL TTL for uploads: 10 minutes */
const UPLOAD_URL_EXPIRY_SECONDS = 600;

/** Signed URL TTL for downloads: 15 minutes (per §6.3 PII handling) */
const DOWNLOAD_URL_EXPIRY_SECONDS = 900;

/**
 * Generate a presigned PUT URL for the client to upload directly to R2.
 * Returns the object key and the upload URL.
 * The key is stored in the DB — the URL is one-time use.
 */
export async function generateUploadPresignedUrl(
  userId: string,
  fileName: string,
): Promise<{ uploadUrl: string; objectKey: string }> {
  const client = getS3Client();
  const bucket = getBucket();
  const objectKey = buildObjectKey(userId, fileName);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: UPLOAD_URL_EXPIRY_SECONDS,
  });

  return { uploadUrl, objectKey };
}

/**
 * Generate a short-lived presigned GET URL for downloading a resume.
 * ALWAYS call verifyFileOwnership() before this function.
 */
export async function generateDownloadSignedUrl(
  userId: string,
  objectKey: string,
): Promise<string> {
  // Double-check ownership even though callers should verify first
  await verifyFileOwnership(userId, objectKey);

  const client = getS3Client();
  const bucket = getBucket();

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });

  return getSignedUrl(client, command, {
    expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS,
  });
}

/**
 * Verify that objectKey belongs to userId.
 * The key MUST start with `resumes/{userId}/` — any other prefix is rejected.
 * Throws AuthorizationError on mismatch — never returns false silently.
 */
export async function verifyFileOwnership(
  userId: string,
  objectKey: string,
): Promise<boolean> {
  const expectedPrefix = `resumes/${userId}/`;
  if (!objectKey.startsWith(expectedPrefix)) {
    throw new AuthorizationError(
      `Object key does not belong to user ${userId}. Access denied.`,
    );
  }
  return true;
}
