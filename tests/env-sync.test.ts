import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The local Worker reads `.dev.vars`, which `scripts/sync-env.mjs` generates from
 * `.env`. A provider key that appears in the Worker but not in that list is silently
 * ignored — the operator pastes a correct key and nothing changes. This test exists
 * because that is exactly what happened when the provider registry was added.
 */
describe('local env sync', () => {
  const model = readFileSync(resolve('src/worker/model.ts'), 'utf8')
  const sync = readFileSync(resolve('scripts/sync-env.mjs'), 'utf8')

  const used = [...new Set([...model.matchAll(/\benv\.([A-Z][A-Z0-9_]+)/g)].map((match) => match[1]))]
  const synced = new Set([...sync.matchAll(/'([A-Z][A-Z0-9_]+)'/g)].map((match) => match[1]))

  it('finds the provider variables the Worker reads', () => {
    expect(used.length).toBeGreaterThan(3)
  })

  it('forwards every provider variable from .env into .dev.vars', () => {
    expect(used.filter((key) => !synced.has(key))).toEqual([])
  })
})
