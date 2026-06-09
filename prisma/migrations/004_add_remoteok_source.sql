-- Add REMOTEOK to JobSource enum
-- Must run outside a transaction block (ALTER TYPE ADD VALUE is non-transactional in PostgreSQL)
ALTER TYPE "JobSource" ADD VALUE IF NOT EXISTS 'REMOTEOK';
