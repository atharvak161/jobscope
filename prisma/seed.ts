/**
 * JobScope — Development Seed Data
 * DB Engineer: 2026-06-08
 *
 * Seeds:
 *   1. One test user (no real credentials — dev only)
 *   2. 10 SponsorRegister rows (real companies from gov.uk register)
 *
 * No job or application data is seeded — jobs come from live ingestion APIs
 * and applications are created by real user action. Seeding placeholders
 * produced false dashboard stats.
 *
 * Run: npx prisma db seed
 * (configured in package.json "prisma.seed")
 *
 * Safety: uses upsert throughout — idempotent, safe to run multiple times
 */

import { PrismaClient } from "../src/generated/prisma/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({} as any);

async function main() {
  console.log("🌱  Seeding JobScope development database...");

  // ─────────────────────────────────────────────────────────────────────────
  // 1. TEST USER
  // ─────────────────────────────────────────────────────────────────────────

  const testUser = await prisma.user.upsert({
    where: { email: "dev@jobscope.local" },
    update: {},
    create: {
      email: "dev@jobscope.local",
      name: "Dev User",
      emailVerified: new Date(),
    },
  });

  console.log(`  ✓ User: ${testUser.email} (id: ${testUser.id})`);

  // ─────────────────────────────────────────────────────────────────────────
  // 2. SPONSOR REGISTER ROWS
  // Real companies from the gov.uk Register of Licensed Sponsors (Skilled Worker)
  // nameNormalised: lowercase, no legal suffixes (Ltd/Limited/plc/LLP), no punctuation
  // ─────────────────────────────────────────────────────────────────────────

  const sponsorData = [
    {
      name: "NCC Group Limited",
      nameNormalised: "ncc group",
      townCity: "Manchester",
      county: "Greater Manchester",
      typeRating: "Worker",
      route: ["Skilled Worker"],
    },
    {
      name: "Deloitte LLP",
      nameNormalised: "deloitte",
      townCity: "London",
      county: "Greater London",
      typeRating: "Worker",
      route: ["Skilled Worker", "Intra-company Transfer"],
    },
    {
      name: "KPMG LLP",
      nameNormalised: "kpmg",
      townCity: "London",
      county: "Greater London",
      typeRating: "Worker",
      route: ["Skilled Worker", "Intra-company Transfer"],
    },
    {
      name: "BT Group plc",
      nameNormalised: "bt group",
      townCity: "London",
      county: "Greater London",
      typeRating: "Worker",
      route: ["Skilled Worker"],
    },
    {
      name: "Vodafone Limited",
      nameNormalised: "vodafone",
      townCity: "Newbury",
      county: "Berkshire",
      typeRating: "Worker",
      route: ["Skilled Worker", "Intra-company Transfer"],
    },
    {
      name: "HSBC Bank plc",
      nameNormalised: "hsbc bank",
      townCity: "London",
      county: "Greater London",
      typeRating: "Worker",
      route: ["Skilled Worker", "Intra-company Transfer"],
    },
    {
      name: "PricewaterhouseCoopers LLP",
      nameNormalised: "pricewaterhousecoopers",
      townCity: "London",
      county: "Greater London",
      typeRating: "Worker",
      route: ["Skilled Worker", "Intra-company Transfer"],
    },
    {
      name: "BAE Systems plc",
      nameNormalised: "bae systems",
      townCity: "London",
      county: "Greater London",
      typeRating: "Worker",
      route: ["Skilled Worker"],
    },
    {
      name: "Accenture (UK) Limited",
      nameNormalised: "accenture uk",
      townCity: "London",
      county: "Greater London",
      typeRating: "Worker",
      route: ["Skilled Worker", "Intra-company Transfer"],
    },
    {
      name: "Lloyds Bank plc",
      nameNormalised: "lloyds bank",
      townCity: "London",
      county: "Greater London",
      typeRating: "Worker",
      route: ["Skilled Worker"],
    },
  ];

  const sponsors: Record<string, string> = {};

  for (const s of sponsorData) {
    const sponsor = await prisma.sponsorRegister.upsert({
      where: {
        // SponsorRegister has no unique constraint on nameNormalised in schema
        // Use a synthetic unique check via findFirst + create/update
        id: (
          await prisma.sponsorRegister.findFirst({
            where: { nameNormalised: s.nameNormalised },
            select: { id: true },
          })
        )?.id ?? "00000000-0000-0000-0000-000000000000",
      },
      update: {
        name: s.name,
        lastSeenAt: new Date(),
        lastUpdated: new Date(),
      },
      create: {
        name: s.name,
        nameNormalised: s.nameNormalised,
        townCity: s.townCity,
        county: s.county,
        typeRating: s.typeRating,
        route: s.route,
        active: true,
        lastSeenAt: new Date(),
        lastUpdated: new Date(),
      },
    });
    sponsors[s.nameNormalised] = sponsor.id;
    console.log(`  ✓ Sponsor: ${sponsor.name}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NOTE: No job or application seed data.
  // Jobs are populated exclusively from live APIs (RemoteOK, Reed, Adzuna, etc.)
  // via the ingestion pipeline. Applications are created by real user action.
  // Seeding placeholder jobs/applications produced false dashboard stats, so
  // only the real SponsorRegister data above is seeded.
  // ─────────────────────────────────────────────────────────────────────────

  console.log("\n✅  Seed complete.");
  console.log(`    Users: 1`);
  console.log(`    SponsorRegister rows: ${sponsorData.length}`);
  console.log(`    Jobs: 0 (populated from live APIs)`);
  console.log(`    Applications: 0 (created by real user action)`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
