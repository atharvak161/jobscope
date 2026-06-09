// JobScope shared TypeScript types
// These match the API contracts defined in JOBSCOPE_ARCHITECTURE.md §5
// and the Prisma schema models.

export type SponsorConfidence = "CONFIRMED" | "LIKELY" | "LOW_CONFIDENCE" | "UNKNOWN";
export type ClearanceStatus = "REQUIRED" | "PREFERRED" | "NONE_DETECTED";
export type LocationType = "LONDON" | "REMOTE" | "HYBRID" | "UK_OTHER" | "UNKNOWN";
export type Seniority = "JUNIOR" | "MID" | "SENIOR";
export type JobSource = "ADZUNA" | "REED" | "JOOBLE" | "RSS_JSONLD" | "GOV_UK";

export type ApplicationStatus =
  | "SAVED"
  | "APPLIED"
  | "APPLICATION_ACKNOWLEDGED"
  | "INTERVIEW_SCHEDULED"
  | "INTERVIEWING"
  | "OFFER"
  | "ACCEPTED"
  | "REJECTED"
  | "GHOSTED"
  | "WITHDRAWN";

export type ParseStatus =
  | "PENDING"
  | "PROCESSING"
  | "PENDING_REVIEW"
  | "ACTIVE"
  | "FAILED";

// ─── Job ──────────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  source: JobSource;
  sourceUrl?: string;
  title: string;
  employer: string;
  employerNormalised: string;
  description: string;
  salary?: string;
  salaryMinGbp?: number;
  salaryMaxGbp?: number;
  location?: string;
  locationNormalised: LocationType;
  postedAt?: string; // ISO string
  clearanceStatus: ClearanceStatus;
  seniority?: Seniority;
  subDomain?: string;
  feedVisible: boolean;
  isActive: boolean;
  // Joined from JobSponsorMatch
  sponsorConfidence: SponsorConfidence;
  sponsorMatchReason?: string;
}

export interface JobsApiResponse {
  jobs: Job[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface JobStatsApiResponse {
  newToday: number;
  totalEligible: number;
  confirmedSponsors: number;
  likelySponsors: number;
  unknownSponsors: number;
}

// ─── Application ──────────────────────────────────────────────────────────────

export interface Application {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  sponsorConfidenceAtApply?: SponsorConfidence;
  clearanceStatusAtApply?: ClearanceStatus;
  salaryOffered?: number;
  appliedAt?: string; // ISO string
  recruiterName?: string;
  recruiterEmail?: string;
  recruiterAgency?: string;
  notes?: string;
  ghostingFlaggedAt?: string; // ISO string
  createdAt: string;
  updatedAt: string;
  // Joined job fields for display
  job: Pick<
    Job,
    | "id"
    | "title"
    | "employer"
    | "salary"
    | "salaryMinGbp"
    | "salaryMaxGbp"
    | "location"
    | "locationNormalised"
    | "sponsorConfidence"
    | "clearanceStatus"
    | "seniority"
    | "subDomain"
    | "sourceUrl"
    | "postedAt"
  >;
}

export interface ApplicationsApiResponse {
  applications: Application[];
  total: number;
  page: number;
  limit: number;
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export interface RoleEntry {
  title: string;
  employer: string;
  start: string;
  end?: string;
}

export interface EducationEntry {
  degree: string;
  institution: string;
  year?: number;
}

export interface UserProfile {
  id: string;
  parseStatus: ParseStatus;
  resumeUploadedAt?: string;
  skills: string[];
  certifications: string[];
  subDomains: string[];
  experienceYears?: number;
  seniorityInferred?: Seniority;
  roles: RoleEntry[];
  education: EducationEntry[];
  salaryMin?: number;
  salaryMax?: number;
  locationPrefs: string[];
  seniorityPrefs: Seniority[];
  updatedAt: string;
}

// ─── API Filters ──────────────────────────────────────────────────────────────

export interface JobFilters {
  q?: string;
  sponsor_confidence?: SponsorConfidence[];
  clearance_status?: ClearanceStatus[];
  salary_min?: number;
  salary_max?: number;
  seniority?: Seniority[];
  sub_domain?: string[];
  location?: LocationType[];
  page?: number;
  limit?: number;
  sort?: "score" | "date";
}
