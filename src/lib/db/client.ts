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

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// PrismaClient constructor in Prisma 7 requires an options argument.
// The empty object is intentional — options are driven by prisma.config.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma = globalForPrisma.prisma ?? new PrismaClient({} as any)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
