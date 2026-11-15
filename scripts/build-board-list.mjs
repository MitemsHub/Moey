#!/usr/bin/env node
/**
 * Builds a VERIFIED ATS board list from a public company dataset.
 *
 * Source: github.com/Einsteinder/awesome-hiring-companies (data/companies.yml) —
 * about 1,977 companies, each tagged with its ATS platform and slug.
 *
 * The slugs are not all current (the file lists Mistral on Lever, which now 404s),
 * so every token is checked against the live endpoint before it is written out.
 * Coverage equals the verified list; nothing is assumed.
 *
 *   node scripts/build-board-list.mjs            # validate everything
 *   node scripts/build-board-list.mjs --limit 200  # first 200 per platform
 *
 * Output: data/verified-boards.json  { platform: [{ slug, name, jobs }] }
 */
import { mkdirSync, writeFileSync } from 'node:fs'

const SOURCE = 'https://raw.githubusercontent.com/Einsteinder/awesome-hiring-companies/main/data/companies.yml'
const PLATFORMS = ['greenhouse', 'lever', 'ashby']
const CONCURRENCY = 8
const TIMEOUT = 12_000

const LIMIT = (() => {
  const index = process.argv.indexOf('--limit')
  const value = index > -1 ? Number(process.argv[index + 1]) : 0
  return Number.isFinite(value) && value > 0 ? value : Infinity
})()

const ENDPOINTS = {
  greenhouse: (t) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(t)}/jobs`,
  lever: (t) => `https://api.lever.co/v0/postings/${encodeURIComponent(t)}?mode=json`,
  ashby: (t) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(t)}`,
}

console.log('downloading dataset…')
const yaml = await (await fetch(SOURCE, { signal: AbortSignal.timeout(30_000) })).text()

/** Minimal parser for this file's shape: `- name:` blocks with a nested `ats:` map. */
const companies = []
let current = null
for (const line of yaml.split(/\r?\n/)) {
  const name = /^- name:\s*(.+)$/.exec(line)
  if (name) {
    current = { name: name[1].trim(), ats: {} }
    companies.push(current)
    continue
  }
  const ats = /^\s{4}([a-z]+):\s*([A-Za-z0-9._-]+)\s*$/.exec(line)
  if (ats && current && PLATFORMS.includes(ats[1])) current.ats[ats[1]] = ats[2]
}
console.log(`parsed ${companies.length} companies`)

const work = []
for (const company of companies) {
  for (const platform of PLATFORMS) {
    if (company.ats[platform]) work.push({ platform, slug: company.ats[platform], name: company.name })
  }
}

const perPlatform = Object.fromEntries(PLATFORMS.map((p) => [p, 0]))
const selected = work.filter((item) => {
  if (perPlatform[item.platform] >= LIMIT) return false
  perPlatform[item.platform]++
  return true
})
console.log(`checking ${selected.length} slugs (${CONCURRENCY} at a time)…`)

const verified = Object.fromEntries(PLATFORMS.map((p) => [p, []]))
let done = 0
let index = 0

async function worker() {
  while (index < selected.length) {
    const item = selected[index++]
    try {
      const res = await fetch(ENDPOINTS[item.platform](item.slug), {
        signal: AbortSignal.timeout(TIMEOUT),
        headers: { accept: 'application/json', 'user-agent': 'MitemshubOpportunityEngine/1.0' },
      })
      if (res.ok) {
        const data = await res.json()
        const jobs = item.platform === 'lever' ? (Array.isArray(data) ? data.length : 0) : (data.jobs?.length ?? 0)
        if (jobs > 0) verified[item.platform].push({ slug: item.slug, name: item.name, jobs })
      }
    } catch {
      // a dead token is the expected case for a stale dataset
    }
    done++
    if (done % 100 === 0) console.log(`  … ${done}/${selected.length}`)
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker))

for (const platform of PLATFORMS) {
  verified[platform].sort((a, b) => b.jobs - a.jobs)
  console.log(`${platform}: ${verified[platform].length} verified (top: ${verified[platform][0]?.name} ${verified[platform][0]?.jobs} jobs)`)
}

mkdirSync('data', { recursive: true })
writeFileSync('data/verified-boards.json', `${JSON.stringify(verified, null, 2)}\n`)
console.log('wrote data/verified-boards.json')
