import { describe, expect, it } from 'vitest'

import type { Env } from '../src/worker/env'
import { hasModel, providerChain, resolveModel } from '../src/worker/model'

const env = (values: Partial<Env>) => values as Env

describe('model provider resolution', () => {
  it('prefers a configured provider over the keyless fallback', () => {
    expect(resolveModel(env({ GROQ_API_KEY: 'test-key' }))?.id).toBe('groq')
  })

  it('orders providers so a paid key beats a free key', () => {
    expect(resolveModel(env({ OPENAI_API_KEY: 'paid', GROQ_API_KEY: 'free' }))?.id).toBe('freebuff')
  })

  it('falls back to the anonymous provider that actually answers when nothing is configured', () => {
    const choice = resolveModel(env({}))
    expect(choice?.id).toBe('pollinations')
    expect(choice?.keyless).toBe(true)
    expect(choice?.key).toBe('')
  })

  it('honours an explicit provider choice', () => {
    const choice = resolveModel(env({ GEMINI_API_KEY: 'g', LLM_PROVIDER: 'gemini' }))
    expect(choice?.id).toBe('gemini')
    expect(choice?.shape).toBe('gemini')
  })

  it('ignores an unknown explicit choice rather than returning nothing', () => {
    expect(resolveModel(env({ LLM_PROVIDER: 'not-a-provider' }))?.id).toBe('pollinations')
  })

  it('always has a provider, because the fallback needs no account', () => {
    expect(hasModel(env({}))).toBe(true)
  })

  it('defaults Gemini to an id measured to answer, not the preview quota trap', () => {
    expect(resolveModel(env({ GEMINI_API_KEY: 'g' }))?.model).toBe('gemini-3.6-flash')
  })

  it('leaves GitHub Models off the chain until GITHUB_MODEL opts in', () => {
    // A token without Models access answers 200 `OK`, so a default-on provider would
    // burn a failing round trip on every draft.
    expect(providerChain(env({ GITHUB_TOKEN: 't' })).map((entry) => entry.id)).not.toContain('github')
    expect(providerChain(env({ GITHUB_TOKEN: 't', GITHUB_MODEL: 'openai/gpt-4o-mini' })).map((entry) => entry.id)).toContain(
      'github',
    )
  })
})
