import { Hono } from 'hono'

import { privateJson } from '../auth'
import { id, now } from '../db'
import type { AppContext, Env } from '../env'

/**
 * The application kit: a CV and cover letter for one posting, assembled only from
 * the operator's stated profile, their public GitHub repositories and the posting
 * text. The model is allowed to choose emphasis and wording; it is not allowed to
 * add an employer, a date, a qualification or a number that is not in the input.
 * Anything the posting asks for that the input cannot evidence is reported as a
 * gap instead of being written into the letter.
 */
export const kit = new Hono<AppContext>()

export interface KitProject {
  name: string
  url: string | null
  why: string
}

export interface Kit {
  headline: string
  summary: string
  skills: string[]
  experience: { role: string; org: string; period: string | null; bullets: string[] }[]
  projects: KitProject[]
  coverLetter: string
  evidence: { claim: string; source: string }[]
  gaps: string[]
  model: string
  generatedAt: number
  repoCount: number
  notes: string[]
}

interface RepoFact {
  name: string
  description: string | null
  language: string | null
  topics: string[]
  url: string
  pushedAt: string | null
}

async function githubRepos(login: string): Promise<RepoFact[]> {
  if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(login)) return []
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12_000)
  try {
    const response = await fetch(`https://api.github.com/users/${login}/repos?per_page=40&sort=pushed`, {
      signal: controller.signal,
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'moey-opportunity-engine' },
    })
    if (!response.ok) return []
    const rows = (await response.json()) as {
      name?: string
      description?: string | null
      language?: string | null
      topics?: string[]
      html_url?: string
      pushed_at?: string | null
      fork?: boolean
      archived?: boolean
    }[]
    return rows
      .filter((row) => row.name && row.html_url && !row.fork && !row.archived)
      .slice(0, 30)
      .map((row) => ({
        name: String(row.name),
        description: row.description ? String(row.description).slice(0, 300) : null,
        language: row.language ? String(row.language) : null,
        topics: (row.topics ?? []).map(String).slice(0, 8),
        url: String(row.html_url),
        pushedAt: row.pushed_at ?? null,
      }))
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

interface KitProfile {
  name: string
  headline: string | null
  summary: string | null
  experience: string | null
  github: string | null
  location: string | null
  skills: string[]
  services: { service: string; summary: string | null; evidence: string | null }[]
  eligibility: Record<string, string>
}

async function loadKitProfile(db: D1Database, owner: string, kind: string): Promise<KitProfile | null> {
  const row = await db
    .prepare(`SELECT * FROM profiles WHERE owner_sub = ? AND kind = ?`)
    .bind(owner, kind)
    .first<Record<string, unknown>>()
  if (!row) return null
  const skills = await db
    .prepare(`SELECT skill FROM profile_skills WHERE owner_sub = ? AND profile_id = ? ORDER BY level DESC, skill`)
    .bind(owner, String(row.id))
    .all<{ skill: string }>()
  const services = await db
    .prepare(`SELECT service, summary, evidence FROM profile_services WHERE owner_sub = ? AND profile_id = ?`)
    .bind(owner, String(row.id))
    .all<{ service: string; summary: string | null; evidence: string | null }>()
  let eligibility: Record<string, string> = {}
  try {
    eligibility = JSON.parse(String(row.eligibility_json ?? '{}')) as Record<string, string>
  } catch {
    eligibility = {}
  }
  return {
    name: String(row.name),
    headline: (row.headline as string) ?? null,
    summary: (row.summary as string) ?? null,
    experience: (row.experience as string) ?? null,
    github: (row.github as string) ?? null,
    location: (row.location as string) ?? null,
    skills: (skills.results ?? []).map((s) => s.skill),
    services: (services.results ?? []).map((s) => ({
      service: s.service,
      summary: s.summary,
      evidence: s.evidence,
    })),
    eligibility,
  }
}

const SYSTEM = [
  'You write application material for one specific posting, using only the facts supplied in the user message.',
  'Hard rules:',
  '1. Never invent an employer, role title, date, degree, certification, client name, metric or award.',
  '2. If the posting asks for something the supplied facts do not evidence, do not claim it. Put it in "gaps".',
  '3. Every bullet must trace to a supplied fact: a stated skill, a stated service, a line of stated experience, or a named repository.',
  '4. No hype: never use passionate, leverage, seamless, cutting-edge, synergy, rockstar, ninja, or emoji.',
  '5. Cover letter: at most 220 words, addressed to the organisation by name, one concrete opening sentence tied to their problem, then evidence, then a short close. No invented enthusiasm or familiarity with their internal work.',
  '6. If the supplied experience is thin, write a shorter CV rather than a padded one. Omit a section that has no evidence.',
  '7. Plain direct prose, first person. Use the spelling the posting uses.',
  'Reply with JSON only, exactly these keys:',
  '{"headline":string,"summary":string,"skills":string[],"experience":[{"role":string,"org":string,"period":string|null,"bullets":string[]}],"projects":[{"name":string,"url":string|null,"why":string}],"coverLetter":string,"evidence":[{"claim":string,"source":string}],"gaps":string[]}',
].join('\n')

interface ChatResponse {
  choices?: { message?: { content?: string } }[]
}

function strings(value: unknown, limit: number): string[] {
  return Array.isArray(value) ? value.map(String).map((s) => s.trim()).filter(Boolean).slice(0, limit) : []
}

function clamp(text: unknown, limit: number): string {
  return typeof text === 'string' ? text.trim().slice(0, limit) : ''
}

/**
 * No model key: assemble the kit from the operator's own words instead of writing
 * any. Every line below is copied from the profile, the experience field or a
 * public repository description — nothing is composed to sound like experience
 * the operator did not claim. The notes say so, so the UI cannot imply otherwise.
 */
function composeLocal(
  profile: KitProfile,
  repos: RepoFact[],
  opportunity: { title: string; org: string | null; body: string; pipeline: string },
): Omit<Kit, 'generatedAt' | 'repoCount'> {
  const lines = (profile.experience ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const experience = lines.slice(0, 8).map((line) => {
    const [role, org, period, ...rest] = line.split(/\s+[—–-]\s+/)
    return {
      role: (role ?? line).slice(0, 120),
      org: (org ?? '').slice(0, 120),
      period: period ? period.slice(0, 60) : null,
      bullets: rest.join(' — ').split(/;\s*/).map((s) => s.trim()).filter(Boolean).slice(0, 6),
    }
  })

  const projects = repos.slice(0, 6).map((repo) => ({
    name: repo.name,
    url: repo.url,
    why: repo.description || [repo.language, ...repo.topics].filter(Boolean).join(', ') || 'Public repository.',
  }))

  const org = opportunity.org ?? 'your team'
  const letter = [
    `Dear ${org},`,
    '',
    `I am writing about ${opportunity.title}.`,
    profile.summary ? `\n${profile.summary.trim()}` : '',
    profile.skills.length ? `\nThe skills I can bring to this: ${profile.skills.slice(0, 12).join(', ')}.` : '',
    projects.length
      ? `\nWork you can inspect directly:\n${projects.map((project) => `- ${project.name}${project.url ? ` (${project.url})` : ''}${project.why ? ` — ${project.why}` : ''}`).join('\n')}`
      : '',
    '\nThis draft was assembled from my own profile and public repositories without a writing model, so it is a starting point rather than a finished letter.',
    '',
    profile.name,
  ]
    .filter((line) => line !== '')
    .join('\n')

  return {
    headline: profile.headline || profile.name,
    summary: profile.summary ?? '',
    skills: profile.skills.slice(0, 30),
    experience,
    projects,
    coverLetter: letter.slice(0, 4000),
    evidence: [
      ...profile.skills.slice(0, 10).map((skill) => ({ claim: skill, source: 'profile skills' })),
      ...projects.map((project) => ({ claim: project.name, source: `github.com/${profile.github}/${project.name}` })),
    ].slice(0, 14),
    gaps: [],
    model: 'rules-composer',
    notes: [
      'No model key is configured, so this kit was assembled from your profile verbatim. No sentence here was written for you.',
      repos.length
        ? `${repos.length} public repositories were supplied from github.com/${profile.github}.`
        : profile.github
          ? `No public repositories were returned for github.com/${profile.github}.`
          : 'No GitHub username is set on this profile, so no repositories were supplied.',
    ],
  }
}

async function generate(env: Env, profile: KitProfile, opportunity: {
  title: string
  org: string | null
  body: string
  location: string | null
  pipeline: string
  deadline: number | null
}, repos: RepoFact[]): Promise<Omit<Kit, 'generatedAt' | 'repoCount'>> {
  const key = env.OPENAI_API_KEY
  if (!key) throw new Error('no_model')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45_000)
  try {
    const response = await fetch(`${env.OPENAI_BASE_URL || 'https://freebuff.com/api/v1/paid'}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM },
          {
            role: 'user',
            content: JSON.stringify({
              candidate: {
                name: profile.name,
                headline: profile.headline,
                summary: profile.summary,
                experience_lines: (profile.experience ?? '').split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 20),
                skills: profile.skills.slice(0, 40),
                services: profile.services.slice(0, 20),
                location: profile.location,
                eligibility: profile.eligibility,
              },
              github: {
                login: profile.github,
                repositories: repos.map((r) => ({ name: r.name, description: r.description, language: r.language, topics: r.topics, url: r.url })),
              },
              opportunity: {
                title: opportunity.title,
                organisation: opportunity.org,
                pipeline: opportunity.pipeline,
                location: opportunity.location,
                deadline: opportunity.deadline ? new Date(opportunity.deadline).toISOString().slice(0, 10) : null,
                text: opportunity.body.slice(0, 8000),
              },
            }),
          },
        ],
      }),
    })
    if (!response.ok) throw new Error(`model_${response.status}`)
    const data = (await response.json()) as ChatResponse
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('model_empty')
    const parsed = JSON.parse(content) as Record<string, unknown>

    const experience = Array.isArray(parsed.experience)
      ? (parsed.experience as Record<string, unknown>[])
          .filter((entry) => entry && (entry.role || entry.org))
          .slice(0, 8)
          .map((entry) => ({
            role: clamp(entry.role, 120),
            org: clamp(entry.org, 120),
            period: entry.period ? clamp(entry.period, 60) : null,
            bullets: strings(entry.bullets, 6).map((b) => b.slice(0, 400)),
          }))
      : []

    const projects = Array.isArray(parsed.projects)
      ? (parsed.projects as Record<string, unknown>[])
          .filter((entry) => entry && entry.name)
          .slice(0, 6)
          .map((entry) => ({
            name: clamp(entry.name, 120),
            url: entry.url ? clamp(entry.url, 300) : null,
            why: clamp(entry.why, 400),
          }))
      : []

    const evidence = Array.isArray(parsed.evidence)
      ? (parsed.evidence as Record<string, unknown>[])
          .filter((entry) => entry && entry.claim)
          .slice(0, 14)
          .map((entry) => ({ claim: clamp(entry.claim, 300), source: clamp(entry.source, 200) }))
      : []

    const coverLetter = clamp(parsed.coverLetter, 4000)
    if (!coverLetter) throw new Error('model_shape')

    return {
      headline: clamp(parsed.headline, 160) || profile.headline || profile.name,
      summary: clamp(parsed.summary, 1200),
      skills: strings(parsed.skills, 30).map((s) => s.slice(0, 60)),
      experience,
      projects,
      coverLetter,
      evidence,
      gaps: strings(parsed.gaps, 20).map((s) => s.slice(0, 300)),
      model: env.OPENAI_MODEL || 'gpt-4o-mini',
      notes: [
        repos.length
          ? `${repos.length} public repositories were supplied from github.com/${profile.github}.`
          : profile.github
            ? `No public repositories were returned for github.com/${profile.github}.`
            : 'No GitHub username is set on this profile, so no repositories were supplied.',
      ],
    }
  } finally {
    clearTimeout(timer)
  }
}

kit.get('/:id/kit', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const row = await db
    .prepare(`SELECT content_json, model, created_at FROM documents WHERE owner_sub = ? AND opportunity_id = ? AND kind = 'kit'`)
    .bind(owner, c.req.param('id'))
    .first<{ content_json: string; model: string | null; created_at: number }>()
  if (!row) return privateJson(c, { kit: null })
  try {
    return privateJson(c, { kit: { ...(JSON.parse(row.content_json) as Kit), generatedAt: Number(row.created_at) } })
  } catch {
    return privateJson(c, { kit: null })
  }
})

kit.post('/:id/kit', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const oppId = c.req.param('id')

  const row = await db
    .prepare(`SELECT id, pipeline, title, org, body, location, deadline FROM opportunities WHERE id = ? AND owner_sub = ?`)
    .bind(oppId, owner)
    .first<{ id: string; pipeline: string; title: string; org: string | null; body: string | null; location: string | null; deadline: number | null }>()
  if (!row) return privateJson(c, { error: 'Not found.' }, 404)

  const pipeline = row.pipeline === 'business' ? 'business' : 'individual'
  const profile = await loadKitProfile(db, owner, pipeline)
  if (!profile) return privateJson(c, { error: `Fill the ${pipeline} profile first — a kit cannot be built from nothing.` }, 400)

  const repos = profile.github ? await githubRepos(profile.github) : []
  const opportunity = {
    title: row.title,
    org: row.org,
    body: String(row.body ?? ''),
    location: row.location,
    pipeline,
    deadline: row.deadline,
  }

  let content: Omit<Kit, 'generatedAt' | 'repoCount'>
  if (!c.env.OPENAI_API_KEY) {
    // Honest degradation: a real CV from real material, and the UI is told which
    // one it is looking at.
    content = composeLocal(profile, repos, opportunity)
  } else try {
    content = await generate(c.env, profile, opportunity, repos)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    if (reason === 'no_model') {
      return privateJson(
        c,
        {
          error: 'model_missing',
          message:
            'No model key is configured, so no draft can be written. Set OPENAI_API_KEY for this project and try again. Nothing was generated or invented.',
        },
        503,
      )
    }
    console.error('kit generation failed', reason)
    return privateJson(c, { error: 'kit_failed', message: `The model did not return a usable draft (${reason}). Nothing was stored.` }, 502)
  }

  const stamp = now()
  const payload = JSON.stringify(content)
  await db.batch([
    db
      .prepare(`DELETE FROM documents WHERE owner_sub = ? AND opportunity_id = ? AND kind = 'kit'`)
      .bind(owner, oppId),
    db
      .prepare(`INSERT INTO documents (id, owner_sub, opportunity_id, kind, content_json, model, created_at) VALUES (?,?,?,'kit',?,?,?)`)
      .bind(id(), owner, oppId, payload, content.model, stamp),
    db
      .prepare(
        `INSERT INTO activities (id, owner_sub, opportunity_id, kind, actor, body, created_at)
         VALUES (?,?,?,'drafted','agent',?,?)`,
      )
      .bind(
        id(),
        owner,
        oppId,
        `Application kit drafted with ${content.model} from the posting, the stated profile${repos.length ? ` and ${repos.length} public repositories` : ''}. Not sent anywhere.`,
        stamp,
      ),
  ])

  return privateJson(c, { kit: { ...content, generatedAt: stamp, repoCount: repos.length } })
})
