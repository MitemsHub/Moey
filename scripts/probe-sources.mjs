#!/usr/bin/env node
/**
 * Research probe: which job / gig / freelance endpoints actually answer right now?
 *
 * Run: node scripts/probe-sources.mjs
 *
 * Every result is a live request made today. Nothing here is added to the app — it
 * exists so "this source is usable" is a measurement, not an opinion.
 */
const UA = 'MitemshubOpportunityEngine/1.0 (+source-research)'
const T = 20_000

const PROBES = [
  // --- keyless JSON APIs ---
  { name: 'Remotive', url: 'https://remotive.com/api/remote-jobs?limit=20', count: (d) => d.jobs?.length },
  { name: 'Arbeitnow', url: 'https://www.arbeitnow.com/api/job-board-api', count: (d) => d.data?.length },
  { name: 'Himalayas', url: 'https://himalayas.app/jobs/api?limit=20', count: (d) => d.jobs?.length },
  { name: 'RemoteOK', url: 'https://remoteok.com/api', count: (d) => d.length },
  { name: 'Working Nomads', url: 'https://www.workingnomads.com/api/exposed_jobs/', count: (d) => d.length },
  { name: 'Jobicy', url: 'https://jobicy.com/api/v2/remote-jobs?count=20', count: (d) => d.jobs?.length },
  { name: 'NoFluffJobs', url: 'https://nofluffjobs.com/api/search/posting?page=1&limit=20', count: (d) => d.postings?.length },
  { name: 'Hasjob (IN)', url: 'https://hasjob.co/api/0', count: (d) => d.length },
  { name: 'Freelancer.com', url: 'https://www.freelancer.com/api/projects/0.1/projects/active/?limit=10&job_details=true', count: (d) => d.result?.projects?.length },
  { name: 'Dev.to listings', url: 'https://dev.to/api/listings?per_page=20', count: (d) => d.length },
  { name: 'Stack Exchange', url: 'https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=activity&q=freelance&site=stackoverflow&pagesize=10', count: (d) => d.items?.length },
  { name: 'Mastodon #hiring', url: 'https://mastodon.social/api/v1/timelines/tag/hiring?limit=10', count: (d) => d.length },

  // --- RSS / XML feeds ---
  { name: 'WeWorkRemotely RSS', url: 'https://weworkremotely.com/categories/remote-programming-jobs.rss', xml: true },
  { name: 'Remote.co RSS', url: 'https://remote.co/remote-jobs/feed/', xml: true },
  { name: 'Jobspresso RSS', url: 'https://jobspresso.co/feed/', xml: true },
  { name: 'Nodesk RSS', url: 'https://nodesk.co/remote-jobs/feed.xml', xml: true },

  // --- expected to refuse (kept to document the evidence) ---
  { name: 'Indeed RSS', url: 'https://www.indeed.com/rss?q=developer' },
  { name: 'Indeed robots.txt', url: 'https://www.indeed.com/robots.txt', text: true },
  { name: 'Glassdoor robots.txt', url: 'https://www.glassdoor.com/robots.txt', text: true },
  { name: 'Dice robots.txt', url: 'https://www.dice.com/robots.txt', text: true },
  { name: 'LinkedIn robots.txt', url: 'https://www.linkedin.com/robots.txt', text: true },
]

const countItems = (xml) => (xml.match(/<item[\s>]/g) || []).length + (xml.match(/<entry[\s>]/g) || []).length

for (const probe of PROBES) {
  try {
    const res = await fetch(probe.url, {
      signal: AbortSignal.timeout(T),
      headers: { 'user-agent': UA, accept: probe.xml ? 'application/rss+xml, application/xml, text/xml' : 'application/json, text/plain' },
    })
    const body = await res.text()
    let detail
    if (probe.text) {
      // Show the lines that matter for automated access.
      const hits = body
        .split(/\r?\n/)
        .filter((l) => /^disallow:\s*\/(jobs|job|search|graphql|api)/i.test(l.trim()))
        .slice(0, 3)
      detail = hits.length ? hits.join(' | ') : 'no job-path disallow found'
    } else if (probe.xml) {
      detail = `${countItems(body)} feed items`
    } else if (res.ok) {
      let data
      try {
        data = JSON.parse(body)
      } catch {
        detail = `not JSON (${body.slice(0, 40).replace(/\s+/g, ' ')})`
      }
      if (data !== undefined) {
        const n = probe.count ? probe.count(data) : undefined
        detail = n === undefined ? 'JSON ok, shape unexpected' : `${n} items`
      }
    } else {
      detail = body.slice(0, 60).replace(/\s+/g, ' ')
    }
    const state = res.ok ? 'OPEN  ' : 'BLOCK '
    console.log(`${state} ${String(res.status).padEnd(4)} ${probe.name.padEnd(22)} ${detail}`)
  } catch (error) {
    console.log(`ERROR       ${probe.name.padEnd(22)} ${error.message}`)
  }
}
