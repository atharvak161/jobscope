-- Add INDEED, MONSTER, REMOOTE to JobSource enum
-- Must run outside a transaction block (ALTER TYPE ADD VALUE is non-transactional in PostgreSQL)
ALTER TYPE "JobSource" ADD VALUE IF NOT EXISTS 'INDEED';
ALTER TYPE "JobSource" ADD VALUE IF NOT EXISTS 'MONSTER';
ALTER TYPE "JobSource" ADD VALUE IF NOT EXISTS 'REMOOTE';
