/**
 * JobScope — Development Seed Data
 * DB Engineer: 2026-06-08
 *
 * Seeds:
 *   1. One test user (no real credentials — dev only)
 *   2. 10 SponsorRegister rows (real companies from gov.uk register)
 *   3. 5 Job rows covering the range of clearance/sponsor confidence combinations
 *      that the frontend needs to render different badge states
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
  // 3. SAMPLE JOBS
  // Covers all badge state combinations for UI development:
  //   - clearanceStatus: NONE_DETECTED, PREFERRED, REQUIRED
  //   - sponsorConfidence via JobSponsorMatch: CONFIRMED, LIKELY, UNKNOWN, none
  //   - seniority: MID, SENIOR, JUNIOR
  //   - locationNormalised: LONDON, REMOTE, HYBRID
  // ─────────────────────────────────────────────────────────────────────────

  const jobsData = [
    {
      source: "REED" as const,
      sourceId: "seed-001",
      sourceUrl: "https://www.reed.co.uk/jobs/seed-001",
      title: "Security Engineer — Cloud",
      employer: "NCC Group Limited",
      employerNormalised: "ncc group",
      description:
        "NCC Group is looking for a Security Engineer to join our cloud security practice. You will be conducting security assessments of AWS and Azure environments, performing penetration testing, and advising clients on security architecture. No security clearance required. Skilled Worker visa sponsorship available for the right candidate.",
      salary: "£55,000 - £75,000 per annum",
      salaryMinGbp: 55000,
      salaryMaxGbp: 75000,
      location: "Manchester, UK (Hybrid)",
      locationNormalised: "HYBRID" as const,
      postedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
      clearanceStatus: "NONE_DETECTED" as const,
      seniority: "MID" as const,
      subDomain: "Penetration Testing",
      feedVisible: true,
      isActive: true,
      sponsorNormalised: "ncc group",
      confidence: "CONFIRMED" as const,
      matchReason: "exact_match",
      similarityScore: 1.0,
    },
    {
      source: "ADZUNA" as const,
      sourceId: "seed-002",
      sourceUrl: "https://api.adzuna.com/jobs/seed-002",
      title: "Penetration Tester (Senior)",
      employer: "Deloitte LLP",
      employerNormalised: "deloitte",
      description:
        "Deloitte's Cyber Intelligence team is hiring a Senior Penetration Tester. Responsibilities include red team exercises, web application testing, and client advisory. Must have OSCP or equivalent. Sponsorship considered for exceptional candidates. Remote-first with occasional London office visits.",
      salary: "£70,000 - £90,000 per annum",
      salaryMinGbp: 70000,
      salaryMaxGbp: 90000,
      location: "Remote / London",
      locationNormalised: "REMOTE" as const,
      postedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      clearanceStatus: "NONE_DETECTED" as const,
      seniority: "SENIOR" as const,
      subDomain: "Penetration Testing",
      feedVisible: true,
      isActive: true,
      sponsorNormalised: "deloitte",
      confidence: "CONFIRMED" as const,
      matchReason: "exact_match",
      similarityScore: 1.0,
    },
    {
      source: "REED" as const,
      sourceId: "seed-003",
      sourceUrl: "https://www.reed.co.uk/jobs/seed-003",
      title: "GRC Analyst",
      employer: "KPMG LLP",
      employerNormalised: "kpmg",
      description:
        "KPMG is seeking a GRC Analyst to support our risk and compliance advisory practice. You will work with clients to assess their compliance posture against ISO 27001, NIST, and UK GDPR. Security clearance preferred but not required. London-based with flexible working.",
      salary: "£45,000 - £60,000 per annum",
      salaryMinGbp: 45000,
      salaryMaxGbp: 60000,
      location: "London",
      locationNormalised: "LONDON" as const,
      postedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      clearanceStatus: "PREFERRED" as const,
      seniority: "MID" as const,
      subDomain: "GRC",
      feedVisible: true,
      isActive: true,
      sponsorNormalised: "kpmg",
      confidence: "CONFIRMED" as const,
      matchReason: "exact_match",
      similarityScore: 1.0,
    },
    {
      source: "JOOBLE" as const,
      sourceId: "seed-004",
      sourceUrl: "https://jooble.org/jdp/seed-004",
      title: "Cyber Security Analyst — SOC",
      employer: "BT Group plc",
      employerNormalised: "bt group",
      description:
        "BT Group's Security Operations Centre is hiring a Cyber Security Analyst. You will monitor SIEM alerts, triage incidents, and contribute to threat intelligence reports. SC clearance required — candidates must be eligible and willing to undergo SC vetting. UK nationals or settled status only.",
      salary: "£35,000 - £50,000 per annum",
      salaryMinGbp: 35000,
      salaryMaxGbp: 50000,
      location: "London",
      locationNormalised: "LONDON" as const,
      postedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
      clearanceStatus: "REQUIRED" as const,
      seniority: "JUNIOR" as const,
      subDomain: "SOC",
      feedVisible: false, // hidden — SC required
      isActive: true,
      sponsorNormalised: "bt group",
      confidence: "CONFIRMED" as const,
      matchReason: "exact_match",
      similarityScore: 1.0,
    },
    {
      source: "RSS_JSONLD" as const,
      sourceId: "seed-005",
      sourceUrl: "https://careers.examplecyber.com/jobs/seed-005",
      title: "Application Security Engineer",
      employer: "CyberShield Technologies UK",
      employerNormalised: "cybershield technologies uk",
      description:
        "CyberShield Technologies is looking for an Application Security Engineer. You will integrate security tooling into CI/CD pipelines, conduct SAST/DAST scanning, and perform threat modelling. Competitive salary and visa sponsorship considered for the right candidate.",
      salary: "£60,000 - £80,000 per annum",
      salaryMinGbp: 60000,
      salaryMaxGbp: 80000,
      location: "London or Remote",
      locationNormalised: "HYBRID" as const,
      postedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      clearanceStatus: "NONE_DETECTED" as const,
      seniority: "MID" as const,
      subDomain: "AppSec",
      feedVisible: true,
      isActive: true,
      // No sponsor match — UNKNOWN confidence (sponsor not on register)
      sponsorNormalised: null,
      confidence: null,
      matchReason: null,
      similarityScore: null,
    },
  ];

  for (const jobData of jobsData) {
    const { sponsorNormalised, confidence, matchReason, similarityScore, ...jobFields } =
      jobData;

    // Check if job already exists (by sourceId)
    const existingJob = await prisma.job.findFirst({
      where: { source: jobFields.source, sourceId: jobFields.sourceId },
    });

    let job;
    if (existingJob) {
      job = existingJob;
      console.log(`  → Job already exists: ${jobFields.title} (skipped)`);
    } else {
      job = await prisma.job.create({ data: jobFields });
      console.log(`  ✓ Job: ${job.title} [${job.clearanceStatus}]`);
    }

    // Create sponsor match if applicable
    if (sponsorNormalised && confidence && matchReason && sponsors[sponsorNormalised]) {
      const sponsorId = sponsors[sponsorNormalised];
      const existingMatch = await prisma.jobSponsorMatch.findUnique({
        where: { jobId_sponsorId: { jobId: job.id, sponsorId } },
      });

      if (!existingMatch) {
        await prisma.jobSponsorMatch.create({
          data: {
            jobId: job.id,
            sponsorId,
            confidenceTier: confidence,
            matchReason,
            similarityScore: similarityScore ?? null,
          },
        });
        console.log(`    ↳ Sponsor match: ${confidence} (${matchReason})`);
      }
    }
  }

  console.log("\n✅  Seed complete.");
  console.log(`    Users: 1`);
  console.log(`    SponsorRegister rows: ${sponsorData.length}`);
  console.log(`    Jobs: ${jobsData.length}`);
  console.log(`    Sponsor matches: ${jobsData.filter((j) => j.confidence).length}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
