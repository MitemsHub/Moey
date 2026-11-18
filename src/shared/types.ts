// Contracts shared by the Worker (src/worker) and the app (src/app).

export type Pipeline = 'individual' | 'business'
export type SignalType = 'explicit' | 'emerging'
export type SourceKind = 'ats' | 'tender' | 'feed' | 'community' | 'gig' | 'bounty' | 'directory' | 'manual'
/** `idle` = configured and runnable, but has never run. Reporting `ok` before the
 *  first scan would be a claim we cannot make. */
export type SourceHealth = 'ok' | 'idle' | 'degraded' | 'failing' | 'unconfigured'
export type ProfileKind = 'individual' | 'business'

export type OpportunityStatus =
  | 'new'
  | 'reviewing'
  | 'shortlisted'
  | 'in_progress'
  | 'closed'
  | 'rejected'

export const OPPORTUNITY_STATUSES: { key: OpportunityStatus; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'closed', label: 'Closed' },
  { key: 'rejected', label: 'Rejected' },
]

export type LeadStage = 'qualifying' | 'contacted' | 'proposal' | 'won' | 'lost'

export const LEAD_STAGES: { key: LeadStage; label: string }[] = [
  { key: 'qualifying', label: 'Qualifying' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
]

export interface Source {
  id: string
  adapter: string
  label: string
  kind: SourceKind
  pipeline: Pipeline | 'both'
  enabled: boolean
  health: SourceHealth
  lastRunAt: number | null
  lastError: string | null
  note: string
  attributionLabel: string
  attributionUrl: string
  foundTotal: number
  insertedTotal: number
}

export interface SourceRun {
  id: string
  sourceId: string
  sourceLabel?: string
  startedAt: number
  finishedAt: number | null
  found: number
  inserted: number
  duplicates: number
  errors: number
  status: 'running' | 'ok' | 'partial' | 'failed'
  message: string | null
}

export interface Opportunity {
  id: string
  pipeline: Pipeline
  signalType: SignalType
  title: string
  org: string | null
  url: string
  sourceId: string | null
  sourceLabel?: string | null
  sourceAdapter?: string | null
  /** What the source is, so a gig board is not read as an employer posting. */
  sourceKind?: SourceKind | null
  /** Set only when the row itself declares contract/freelance work; null when the
   *  source states nothing about the engagement, so the row follows its source. */
  workType?: 'gig' | null
  location: string | null
  remote: boolean | null
  excerpt: string
  publishedAt: number | null
  deadline: number | null
  compMin: number | null
  compMax: number | null
  compCurrency: string | null
  status: OpportunityStatus
  score: number | null
  scoreModel: string | null
  scoreRationale: string | null
  confidence: number
  skills: string[]
  firstSeenAt: number
  lastSeenAt: number
}

export interface OpportunityDetail extends Opportunity {
  body: string
  matched: string[]
  missing: string[]
  provenance: ProvenanceStep[]
  activities: Activity[]
  application: Application | null
}

export interface ProvenanceStep {
  key: 'source' | 'fetched' | 'normalised' | 'qualified' | 'decision'
  label: string
  detail: string
  at: number | null
  state: 'done' | 'pending' | 'missing'
}

export interface Activity {
  id: string
  kind: string
  actor: 'human' | 'agent' | 'source'
  body: string
  createdAt: number
}

export interface Application {
  id: string
  opportunityId: string
  oppTitle?: string
  org?: string | null
  pipeline?: Pipeline
  score?: number | null
  stage: LeadStage
  position: number
  nextActionAt: number | null
  notes: string | null
  createdAt: number
  updatedAt: number
}

export interface KitProject {
  name: string
  url: string | null
  why: string
}

/** A generated CV + cover letter for one opportunity. Every line traces to the
 *  profile, the public repositories supplied, or the posting itself. */
export interface ApplicationKit {
  headline: string
  summary: string
  skills: string[]
  experience: { role: string; org: string; period: string | null; bullets: string[] }[]
  projects: KitProject[]
  coverLetter: string
  evidence: { claim: string; source: string }[]
  gaps: string[]
  /** Added with the outreach feature; absent on kits built before it. */
  email?: { subject: string; body: string }
  contact?: { emails: string[]; phones: string[] }
  /** Which book this draft was written for; absent on older kits (treat as individual). */
  audience?: Pipeline
  model: string
  generatedAt: number
  repoCount: number
  notes: string[]
}

export interface Profile {
  id: string
  kind: ProfileKind
  name: string
  headline: string | null
  summary: string | null
  location: string | null
  github: string | null
  experience: string | null
  isPrimary: boolean
  skills: string[]
  services: { service: string; summary: string | null; evidence: string | null }[]
  eligibility: Record<string, string>
  filled: boolean
}

export interface Me {
  user: { sub: string; name?: string; email?: string; picture?: string }
  workspace: { name: string; seededAt: number | null }
  profiles: { id: string; kind: ProfileKind; name: string; filled: boolean }[]
  capabilities: {
    database: boolean
    files: boolean
    auth: 'freebuff' | 'development'
    qualifier: 'rules' | 'model'
    provider: { id: string; label: string; model: string; keyless: boolean } | null
    ingest: boolean
  }
}

export interface HealthStrip {
  sources: { id: string; label: string; adapter: string; health: SourceHealth; lastRunAt: number | null }[]
  okCount: number
  attentionCount: number
  lastScanAt: number | null
}

export interface Overview {
  health: HealthStrip
  kpis: {
    newToday: number
    newThisWeek: number
    highFit: number
    awaitingReview: number
    emerging: number
    activeLeads: number
    openTenders: number
    averageScore: number
  }
  feed: Opportunity[]
  bySource: { sourceId: string | null; label: string; count: number; inserted: number }[]
  pipelineSplit: { pipeline: Pipeline; count: number; highFit: number }[]
  reviewQueue: Opportunity[]
  scanRuns: SourceRun[]
}

export interface OpportunityQuery {
  q?: string
  pipeline?: Pipeline
  signal?: SignalType
  status?: OpportunityStatus
  source?: string
  /** `only` keeps rows marked remote, or whose location says so. */
  remote?: 'only'
  /** Free-text match against the posting's location field. */
  location?: string
  /** `gig` keeps gig and contract sources plus any row the source itself tags
   *  contract/freelance; `job` keeps employer boards and job feeds minus those rows;
   *  `bounty` keeps only the contest lane, which neither of the other two includes. */
  work?: 'gig' | 'job' | 'bounty'
  minScore?: number
  sort?: 'recent' | 'score' | 'deadline'
  page?: number
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
