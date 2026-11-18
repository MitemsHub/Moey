import { describe, expect, test } from 'vitest'

import { parseDataAnnotationRoles } from '../src/worker/adapters'
import { canonicalTitle, hash, normalise, similarity } from '../src/worker/dedupe'
import { extractSkills, scoreByRules } from '../src/worker/qualify'

const defaults = { pipeline: 'individual' as const, signal: 'explicit' as const, adapter: 'test' }

const profile = {
  kind: 'individual' as const,
  name: 'Test profile',
  headline: null,
  summary: null,
  skills: ['typescript', 'react', 'sql', 'automation'],
  services: ['web development'],
  eligibility: {},
}

const opportunity = (over: Partial<Parameters<typeof scoreByRules>[0]> = {}) => ({
  title: 'Software engineer',
  org: null,
  body: 'Build with React and SQL.',
  location: null,
  remote: true,
  deadline: null,
  publishedAt: Date.now(),
  pipeline: 'individual' as const,
  signal: 'explicit' as const,
  compMin: null,
  compMax: null,
  ...over,
})

describe('normalise', () => {
  test('rejects rows with no title or a non-http link', () => {
    expect(normalise({ externalId: 'a', title: '', url: 'https://x.test' }, defaults)).toBeNull()
    expect(normalise({ externalId: 'b', title: 'Role', url: 'urn:thing' }, defaults)).toBeNull()
  })

  test('strips markup and clamps the body', () => {
    const result = normalise(
      {
        externalId: 'c',
        title: '  Senior  React   Developer ',
        url: 'https://x.test',
        text: '<p>Hello</p><script>bad()</script>',
      },
      defaults,
    )
    expect(result?.title).toBe('Senior React Developer')
    expect(result?.body).toBe('Hello')
  })

  test('adapter prose is stored for the reader but never scored', () => {
    // Bugcrowd's own text plus our explanation, including the disclaimer that tripped
    // the "salary" demand signal on rows that never offered a salary.
    const row = normalise(
      {
        externalId: 'bb1',
        title: 'Test platform bug bounty',
        url: 'https://bugcrowd.test/bb1',
        text:
          'Test our platform. Open bounty programme on Bugcrowd in Cloud. Rewards are paid per valid report; this is not a salary or a fixed contract.',
        scoringText: 'Test our platform',
      },
      defaults,
    )
    expect(row?.body).toContain('not a salary')
    expect(row?.scoringText).toBe('Test our platform')

    const asScored = scoreByRules(opportunity({ title: row!.title, body: row!.scoringText }), profile)
    expect(asScored.rationale).not.toContain('salary')

    // The trap this guards against: feeding the stored body straight back in rewards
    // the word our own disclaimer supplied.
    const asStored = scoreByRules(opportunity({ title: row!.title, body: row!.body }), profile)
    expect(asStored.rationale).toContain('salary')
  })

  test('a row whose text is entirely the source’s keeps that text for scoring', () => {
    const row = normalise(
      { externalId: 'f1', title: 'React developer needed', url: 'https://feed.test/1', text: 'Build with React.' },
      defaults,
    )
    expect(row?.scoringText).toBe('Build with React.')
  })

  test('content hash ignores seniority words and formatting, so re-posts dedupe', () => {
    const a = normalise({ externalId: '1', title: 'Senior React Developer', url: 'https://a.test', org: 'Acme' }, defaults)
    const b = normalise({ externalId: '2', title: 'React Developer (Remote)', url: 'https://b.test', org: 'Acme' }, defaults)
    expect(a?.contentHash).toBe(b?.contentHash)
  })

  test('hash is stable and short', () => {
    expect(hash('abc')).toBe(hash('abc'))
    expect(hash('abc')).not.toBe(hash('abd'))
    expect(hash('abc')).toHaveLength(8)
  })
})

describe('similarity', () => {
  test('matches near-identical titles and separates unrelated ones', () => {
    expect(similarity('Data Analyst', 'Data Analyst')).toBe(1)
    expect(similarity('Senior Data Analyst', 'Data Analyst')).toBeGreaterThanOrEqual(0.6)
    expect(similarity('Data Analyst', 'Brand Designer')).toBe(0)
  })

  test('canonicalTitle removes bracketed noise and seniority', () => {
    expect(canonicalTitle('Lead Platform Engineer [Remote]')).toBe('platform engineer')
  })
})

describe('qualify', () => {
  test('extractSkills only reports vocabulary hits', () => {
    expect(extractSkills('We need React and SQL skills')).toEqual(expect.arrayContaining(['react', 'sql']))
    expect(extractSkills('We need something else entirely')).toEqual([])
  })

  test('overlap with the profile raises the score and is reported', () => {
    const result = scoreByRules(opportunity(), profile)
    expect(result.matched).toEqual(expect.arrayContaining(['react', 'sql']))
    expect(result.score).toBeGreaterThan(40)
    expect(result.score).toBeLessThanOrEqual(100)
    expect(result.rationale).toContain('matches')
  })

  test('a role with no overlap is capped and says so', () => {
    const result = scoreByRules(
      opportunity({ title: 'Accountant', body: 'Full-time. Salary. Benefits. Kubernetes a plus. Apply now.' }),
      profile,
    )
    expect(result.matched).toEqual([])
    expect(result.score).toBeLessThanOrEqual(22)
    expect(result.rationale).toContain('none of the detected skills')
  })

  test('one body-only match cannot carry a score on its own', () => {
    // "automation" IS in the profile, so this is a real match — but a single
    // incidental mention is not evidence of fit.
    const result = scoreByRules(
      opportunity({ title: 'Accountant', body: 'Full-time. Salary. Benefits. We use automation internally.' }),
      profile,
    )
    expect(result.matched).toEqual(['automation'])
    expect(result.score).toBeLessThanOrEqual(20)
    expect(result.rationale).toContain('not in the title')
  })

  test('a matching role outranks a non-matching one with louder demand language', () => {
    const engineer = scoreByRules(opportunity(), profile)
    const accountant = scoreByRules(
      opportunity({ title: 'Accountant', body: 'Full-time. Salary. Benefits. Apply now. Kubernetes.' }),
      profile,
    )
    expect(engineer.score).toBeGreaterThan(accountant.score)
  })

  test('an emerging signal scores below the same text as an advertised one', () => {
    const explicit = scoreByRules(opportunity(), profile)
    const emerging = scoreByRules(opportunity({ signal: 'emerging' }), profile)
    expect(emerging.score).toBeLessThanOrEqual(explicit.score)
  })

  test('a passed deadline is penalised, not ignored', () => {
    const future = scoreByRules(opportunity({ deadline: Date.now() + 5 * 86400000 }), profile)
    const past = scoreByRules(opportunity({ deadline: Date.now() - 5 * 86400000 }), profile)
    expect(past.score).toBeLessThan(future.score)
    expect(past.rationale).toContain('deadline has passed')
  })

  test('missing eligibility facts are disclosed rather than assumed valid', () => {
    const result = scoreByRules(opportunity(), profile)
    expect(result.rationale).toContain('eligibility facts not set')
  })
})

describe('DataAnnotation sitemap parser', () => {
  const sitemap = (locs: string[]) =>
    `<?xml version="1.0"?><urlset>${locs.map((u) => `<url><loc>${u}</loc></url>`).join('')}</urlset>`

  test('keeps job-board roles, ignores the rest of the site, and dedupes', () => {
    const role = (slug: string) => `https://www.dataannotation.tech/job-board/${slug}`
    const roles = parseDataAnnotationRoles(
      sitemap([
        'https://www.dataannotation.tech/',
        role('software-engineer'),
        role('generalist'),
        `${role('generalist')}/`,
        'https://www.dataannotation.tech/job-board',
        'https://www.dataannotation.tech/privacy',
        // The parser rejects a suspiciously short list; filler keeps this the happy path.
        ...Array.from({ length: 10 }, (_, i) => role(`filler-${i}`)),
      ]),
    )
    const slugs = roles.map((r) => r.slug)

    expect(slugs).toContain('software-engineer')
    expect(slugs).toContain('generalist')
    expect(slugs.filter((s) => s === 'generalist')).toHaveLength(1)
    expect(roles.every((r) => /\/job-board\/[a-z0-9-]+$/i.test(r.url))).toBe(true)
  })

  test('throws when the page shape changes instead of returning nothing', () => {
    expect(() => parseDataAnnotationRoles(sitemap([]))).toThrow(/no longer lists job-board roles/)
    expect(() =>
      parseDataAnnotationRoles(sitemap(['https://www.dataannotation.tech/job-board/software-engineer'])),
    ).toThrow(/parsed 1/)
  })
})

describe('prospect scoring', () => {
  const prospect = (tags: string[]) =>
    opportunity({
      title: 'Amrit — restaurant, website dead',
      body: 'A restaurant recorded in OpenStreetMap.',
      pipeline: 'business',
      signal: 'emerging',
      tags,
    })

  test('phone and address tags each earn contactability points', () => {
    const bare = scoreByRules(prospect(['dead-website']), profile).score
    const address = scoreByRules(prospect(['dead-website', 'has-address']), profile).score
    const both = scoreByRules(prospect(['dead-website', 'has-address', 'has-phone']), profile)

    expect(address - bare).toBe(8)
    expect(both.score - address).toBe(10)
    expect(both.rationale).toContain('phone number is recorded')
    expect(both.rationale).toContain('street address is recorded')
  })

  test('a dead website outranks no website, which outranks social-only', () => {
    const dead = scoreByRules(prospect(['dead-website']), profile).score
    const none = scoreByRules(prospect(['no-website']), profile).score
    const social = scoreByRules(prospect(['social-only']), profile).score

    expect(dead).toBeGreaterThan(none)
    expect(none).toBeGreaterThan(social)
  })

  test('contactability comes from tags, not from body wording', () => {
    const tagged = scoreByRules(prospect(['dead-website', 'has-phone']), profile).score
    const wordingOnly = scoreByRules(
      opportunity({
        title: 'Amrit — restaurant, website dead',
        body: 'Phone recorded: +49 30 1234. Street address recorded.',
        pipeline: 'business',
        signal: 'emerging',
        tags: ['dead-website'],
      }),
      profile,
    ).score

    expect(wordingOnly).toBeLessThan(tagged)
  })

  test('a profile with no matching service is capped instead of flattered', () => {
    const bookkeeper = { ...profile, skills: ['accounting'], services: ['bookkeeping'] }
    const result = scoreByRules(prospect(['dead-website', 'has-phone', 'has-address']), bookkeeper)

    expect(result.score).toBe(25)
    expect(result.rationale).toContain('no web, software or data service')
  })
})
