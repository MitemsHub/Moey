import type { Env } from './env'

// A closed vocabulary keeps skill extraction deterministic and reviewable. It is
// intentionally narrow: a skill that is not in this list is not silently guessed,
// it is simply absent from `matched`, which is the honest outcome for rules-only
// qualification.
export const SKILL_VOCAB = [
  'typescript', 'javascript', 'react', 'next.js', 'node.js', 'python', 'sql', 'postgresql', 'sqlite',
  'supabase', 'cloudflare', 'workers', 'd1', 'rust', 'go', 'java', 'c#', '.net', 'php', 'laravel',
  'django', 'flask', 'fastapi', 'graphql', 'rest', 'api', 'etl', 'data analysis', 'data engineering',
  'analytics', 'machine learning', 'llm', 'ai', 'automation', 'web scraping', 'crawling', 'playwright',
  'figma', 'design systems', 'ui design', 'ux', 'accessibility', 'seo', 'copywriting', 'technical writing',
  'project management', 'consulting', 'stakeholder management', 'dashboard', 'data visualisation',
  'devops', 'ci/cd', 'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'terraform', 'security',
  'mobile', 'ios', 'android', 'flutter', 'swift', 'kotlin', 'financial analysis', 'forecasting',
  'reporting', 'research', 'procurement', 'tender', 'proposal writing', 'grant writing',
] as const

export interface RuleResult {
  score: number
  matched: string[]
  missing: string[]
  rationale: string
  model: 'rules' | 'model'
  confidence: number
}

export interface ProfileForScoring {
  kind: 'individual' | 'business'
  name: string
  headline: string | null
  summary: string | null
  skills: string[]
  services: string[]
  eligibility: Record<string, string>
}

export interface OpportunityForScoring {
  title: string
  org: string | null
  body: string
  location: string | null
  remote: boolean | null
  deadline: number | null
  publishedAt: number | null
  pipeline: 'individual' | 'business'
  signal: 'explicit' | 'emerging'
  compMin: number | null
  compMax: number | null
  /** Adapter tags. `no-website` / `dead-website` mark a PROSPECT rather than a posting. */
  tags?: string[]
}

export function extractSkills(text: string): string[] {
  // Dots are kept so `next.js` survives, but a sentence-final period must not turn
  // `SQL.` into a non-match — that quietly lost a real skill in testing.
  const haystack = ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9+#./ ]+/g, ' ')
    .replace(/(?<![a-z0-9])\.|\.(?![a-z0-9])/g, ' ')
    .replace(/\s+/g, ' ')} `
  const found = new Set<string>()
  for (const skill of SKILL_VOCAB) {
    const needle = ` ${skill} `
    if (haystack.includes(needle)) found.add(skill)
  }
  return [...found].slice(0, 24)
}

const BUSINESS_SIGNALS = {
  strong: ['request for proposal', 'rfp', 'tender', 'procurement', 'invitation to tender', 'framework agreement', 'statement of work'],
  medium: ['looking for a', 'seeking a', 'need help with', 'hiring a', 'vendor', 'contractor', 'consultant', 'agency'],
  weak: ['we are evaluating', 'considering', 'would like to', 'any recommendations', 'how do people', 'best tool for'],
}

const INDIVIDUAL_SIGNALS = {
  strong: ['apply now', 'job description', 'full-time', 'permanent', 'salary', 'benefits package'],
  medium: ['contract role', 'freelance', 'day rate', 'hourly rate', 'fixed price', 'remote position'],
  weak: ['we are hiring', 'open role', 'join our team'],
}

function hits(text: string, needles: string[]): string[] {
  const haystack = text.toLowerCase()
  return needles.filter((n) => haystack.includes(n))
}

type Gap = 'dead-website' | 'social-only' | 'no-website'

/** Each gap, worth, and the sentence that explains it in the rationale. */
const GAPS: Record<Gap, { points: number; reason: string }> = {
  'dead-website': { points: 15, reason: 'the website recorded in map data is dead or parked' },
  'social-only': { points: 8, reason: 'the only web presence recorded is a social profile' },
  'no-website': { points: 10, reason: 'no website recorded in public map data' },
}

/** A tag marks a row as a prospect rather than a posting. */
const isGap = (tag: string): tag is Gap => tag in GAPS

/**
 * A prospect is a business with a visible gap, not a posting with requirements, so
 * the skill-overlap model scores it at zero and it never surfaces. This basis scores
 * what actually matters here: whether we offer the thing that is missing, and whether
 * the business can be contacted at all.
 */
function scoreProspect(
  opp: OpportunityForScoring,
  profile: ProfileForScoring,
  gapTag: Gap,
): RuleResult {
  const tags = new Set(opp.tags ?? [])
  const { points, reason } = GAPS[gapTag]
  const offersWeb = /\b(web|website|site|design|crm|software|develop|app|automation|data)\b/.test(
    [...profile.services, ...profile.skills].join(' ').toLowerCase(),
  )
  const reasons: string[] = []

  let score = offersWeb ? 45 : 12
  if (offersWeb) reasons.push('profile offers a service that addresses this gap')
  score += points
  reasons.push(reason)

  // Contactability is the whole point: a prospect nobody can reach is not a lead. The
  // adapter tags what the upstream data actually had, so this never depends on how the
  // body text happens to be worded.
  if (tags.has('has-phone')) { score += 10; reasons.push('a phone number is recorded, so the business is reachable') }
  if (tags.has('has-address')) { score += 8; reasons.push('a street address is recorded') }

  reasons.push('observation from public map data, not a request — verify before contact')

  if (profile.kind === 'business' && !profile.eligibility.entityName) {
    score -= 12
    reasons.push('no registered entity recorded — contracts need one')
  }
  if (!offersWeb) {
    score = Math.min(score, 25)
    reasons.push("this profile lists no web, software or data service, so the gap does not map to an offer")
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    matched: offersWeb ? [gapTag] : [],
    missing: [],
    rationale: reasons.slice(0, 5).join('; '),
    model: 'rules',
    confidence: offersWeb ? 0.5 : 0.3,
  }
}

export function scoreByRules(opp: OpportunityForScoring, profile: ProfileForScoring): RuleResult {
  const now = Date.now()
  const text = `${opp.title}\n${opp.body}`

  const gap = (opp.tags ?? []).find(isGap)
  if (gap) return scoreProspect(opp, profile, gap)
  const profileSkills = new Set(profile.skills.map((s) => s.toLowerCase()))
  const serviceTerms = new Set(profile.services.map((s) => s.toLowerCase()))
  const detected = extractSkills(text)

  const matched = detected.filter((s) => profileSkills.has(s) || serviceTerms.has(s))
  const missing = detected.filter((s) => !profileSkills.has(s) && !serviceTerms.has(s)).slice(0, 8)

  const reasons: string[] = []
  let score = 0

  // Skill fit — the dominant term. Proportional, so a 2-of-30 overlap does not
  // read as a strong fit just because something matched.
  const coverage = detected.length ? matched.length / Math.min(detected.length, 8) : 0
  const skillPoints = Math.round(Math.min(1, coverage) * 45)
  score += skillPoints
  if (matched.length) reasons.push(`matches ${matched.length} known skill${matched.length === 1 ? '' : 's'} (${matched.slice(0, 4).join(', ')})`)
  else if (detected.length) reasons.push(`no overlap with ${profile.name}'s recorded skills`)

  // Demand language, weighted by pipeline. An "emerging" item requires explicit
  // problem language before it can score at all.
  const signals = opp.pipeline === 'business' ? BUSINESS_SIGNALS : INDIVIDUAL_SIGNALS
  const strong = hits(text, signals.strong)
  const medium = hits(text, signals.medium)
  const weak = hits(text, signals.weak)
  const demandPoints = Math.min(25, strong.length * 12 + medium.length * 6 + weak.length * 3)
  score += demandPoints
  if (strong.length) reasons.push(`explicit demand language: “${strong[0]}”`)
  else if (medium.length) reasons.push(`states a need: “${medium[0]}”`)

  // Freshness: a posting that is already three weeks old is usually gone.
  const stamp = opp.publishedAt ?? null
  if (stamp) {
    const ageDays = (now - stamp) / 86_400_000
    if (ageDays <= 2) { score += 12; reasons.push('published in the last 48 hours') }
    else if (ageDays <= 7) { score += 8; reasons.push('published this week') }
    else if (ageDays <= 21) { score += 3 }
    else if (ageDays > 45) { score -= 12; reasons.push('older than 45 days') }
  } else {
    // Unknown freshness must not be rewarded as if it were fresh.
    reasons.push('publication date unknown')
  }

  // Deadline pressure is only positive while it is still in the future.
  if (opp.deadline) {
    const daysLeft = (opp.deadline - now) / 86_400_000
    if (daysLeft < 0) { score -= 25; reasons.push('deadline has passed') }
    else if (daysLeft <= 14) { score += 8; reasons.push(`deadline in ${Math.max(1, Math.round(daysLeft))} days`) }
  }

  // Compensation visibility is a small honesty bonus: the terms are checkable.
  if (opp.compMin || opp.compMax) { score += 4; reasons.push('compensation stated') }

  // Eligibility gates. Missing facts are a penalty, not a pass.
  if (profile.kind === 'individual') {
    const facts = profile.eligibility
    if (!facts.rightToWork && !facts.basedIn) reasons.push('eligibility facts not set — treat as unconfirmed')
    if (facts.minimumAge && Number(facts.minimumAge) < 18) {
      reasons.push('operator under 18: paid platforms and contracts may not be lawfully applicable')
      score -= 10
    }
  } else {
    const facts = profile.eligibility
    if (opp.pipeline === 'business' && !facts.entityName) {
      reasons.push('no registered entity recorded — tenders and contracts need one')
      score -= 12
    }
  }

  if (opp.signal === 'emerging' && !strong.length) {
    score -= 8
    reasons.push('emerging signal without explicit demand language')
  }

  // Relevance requires overlap. Without this cap, an accountant role that happens
  // to say “full-time, salary, benefits” outranks a software role that actually
  // matches the profile — the single most damaging failure mode for a ranking tool.
  const titleLower = opp.title.toLowerCase()
  const matchedInTitle = matched.filter((skill) => titleLower.includes(skill))

  if (detected.length > 0 && matched.length === 0) {
    score = Math.min(score, 22)
    reasons.push('none of the detected skills appear in this profile')
  } else if (detected.length === 0) {
    score = Math.min(score, 30)
    // EU tender notices are frequently published in a language other than English,
    // and this vocabulary is English-only. Saying “not relevant” would be a lie.
    reasons.push(
      'no English skill vocabulary found — a non-English notice cannot be judged by rules; enable the model qualifier to score it',
    )
  } else if (matched.length === 1 && matchedInTitle.length === 0) {
    // One incidental mention in a long description is not evidence of fit. Require
    // either a second match or support in the title before the score can climb.
    score = Math.min(score, 20)
    reasons.push(`only one skill matches (“${matched[0]}”) and it is not in the title`)
  }

  score = Math.max(0, Math.min(100, Math.round(score)))

  return {
    score,
    matched,
    missing,
    rationale: reasons.slice(0, 5).join('; ') || 'no signal detected',
    model: 'rules',
    confidence: opp.signal === 'emerging' ? 0.35 : detected.length ? 0.62 : 0.4,
  }
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[]
}

/**
 * Optional model pass. Only called when OPENAI_API_KEY is configured AND the rule
 * score cleared the gate, so a scan cannot quietly spend money on every row.
 * Any failure degrades to the rule result — the model never blocks ingestion.
 */
export async function refineWithModel(
  env: Env,
  opp: OpportunityForScoring,
  profile: ProfileForScoring,
  base: RuleResult,
): Promise<RuleResult> {
  const key = env.OPENAI_API_KEY
  if (!key) return base
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(`${env.OPENAI_BASE_URL || 'https://freebuff.com/api/v1/paid'}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You score how well a published opportunity fits a profile. Reply with JSON only: ' +
              '{"score":0-100,"matched":string[],"missing":string[],"rationale":string}. ' +
              'Never invent facts that are not in the opportunity text. If the text is too thin to judge, lower the score and say so.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              profile: {
                kind: profile.kind,
                headline: profile.headline,
                skills: profile.skills,
                services: profile.services,
              },
              opportunity: {
                title: opp.title,
                org: opp.org,
                pipeline: opp.pipeline,
                signal: opp.signal,
                location: opp.location,
                deadline: opp.deadline ? new Date(opp.deadline).toISOString() : null,
                text: opp.body.slice(0, 6000),
              },
              rules_baseline: { score: base.score, matched: base.matched, rationale: base.rationale },
            }),
          },
        ],
      }),
    })
    if (!response.ok) return base
    const data = (await response.json()) as ChatResponse
    const content = data.choices?.[0]?.message?.content
    if (!content) return base
    const parsed = JSON.parse(content) as { score?: number; matched?: string[]; missing?: string[]; rationale?: string }
    if (typeof parsed.score !== 'number' || !Number.isFinite(parsed.score)) return base
    return {
      score: Math.max(0, Math.min(100, Math.round(parsed.score))),
      matched: Array.isArray(parsed.matched) ? parsed.matched.slice(0, 12).map(String) : base.matched,
      missing: Array.isArray(parsed.missing) ? parsed.missing.slice(0, 12).map(String) : base.missing,
      rationale: String(parsed.rationale ?? base.rationale).slice(0, 600),
      model: 'model',
      confidence: 0.72,
    }
  } catch {
    return base
  } finally {
    clearTimeout(timer)
  }
}

/** Rule scores below this are not worth a model call. */
export const MODEL_GATE = 35
