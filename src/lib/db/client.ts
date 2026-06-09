/**
 * Prisma client singleton — standard Next.js hot-reload pattern.
 *
 * In development, Next.js fast-refresh creates new module instances on every
 * save. Without this singleton, each reload opens a new PrismaClient
 * connection, exhausting the Postgres connection pool rapidly.
 *
 * The globalThis cache survives module re-evaluation and returns the same
 * PrismaClient instance across hot reloads.
 *
 * In production NODE_ENV, the global cache is intentionally skipped —
 * each long-lived process creates exactly one PrismaClient at startup.
 *
 * Ref: JOBSCOPE_ARCHITECTURE.md §2 (Prisma ORM)
 * Ref: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management
 */

import { PrismaClient } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// Prisma 7's `prisma-client` engine requires a driver adapter — a bare
// `new PrismaClient()` throws PrismaClientConstructorValidationError. We back
// the client with a node-postgres Pool wrapped in the PrismaPg adapter.
function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
