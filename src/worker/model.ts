import type { Env } from './env'

/**
 * One place that answers "which model can we actually call, and with what key".
 *
 * The product has to work with no paid credits, so providers are tried in order of
 * reliability and every one of them is a legitimate free or free-tier service with
 * documented terms. Nothing here reverse-engineers a chatbot or routes through a
 * proxy that breaks a provider's terms — those endpoints are the reason the free
 * lists warn about losing access for everyone.
 *
 * All providers except Gemini speak the OpenAI chat-completions shape, so the only
 * differences the caller sees are the base URL, the model name and the auth header.
 */

export type ProviderId =
  | 'freebuff'
  | 'groq'
  | 'openrouter'
  | 'gemini'
  | 'github'
  | 'cerebras'
  | 'llm7'
  | 'pollinations'

export interface ModelChoice {
  id: ProviderId
  label: string
  /** OpenAI-compatible base URL, without `/chat/completions`. Empty for Gemini. */
  baseUrl: string
  /** Full chat-completions URL; some providers do not follow the `/v1` convention. */
  chatUrl: string
  model: string
  /** Empty means no Authorization header is sent at all. */
  key: string
  shape: 'openai' | 'gemini'
  /** True when the provider needs no account at all. */
  keyless: boolean
  jsonMode: boolean
}

/** LLM7 accepts any bearer token for its free tier; a real token lifts the limits. */
const LLM7_PUBLIC_TOKEN = 'unused'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Every provider this deployment could call, most reliable first. The keyless tier is
 * always last: it is a genuine free endpoint, but it rate-limits hard and its model
 * names move, so it may not answer at all.
 */
export function providerChain(env: Env): ModelChoice[] {
  const forced = (env.LLM_PROVIDER ?? '').trim().toLowerCase()
  const candidates: (ModelChoice | null)[] = [
    env.OPENAI_API_KEY
      ? {
          id: 'freebuff',
          label: 'Freebuff API',
          baseUrl: env.OPENAI_BASE_URL || 'https://freebuff.com/api/v1/paid',
          chatUrl: `${env.OPENAI_BASE_URL || 'https://freebuff.com/api/v1/paid'}/chat/completions`,
          model: env.OPENAI_MODEL || 'gpt-4o-mini',
          key: env.OPENAI_API_KEY,
          shape: 'openai',
          keyless: false,
          jsonMode: true,
        }
      : null,
    env.GROQ_API_KEY
      ? {
          id: 'groq',
          label: 'Groq',
          baseUrl: 'https://api.groq.com/openai/v1',
          chatUrl: 'https://api.groq.com/openai/v1/chat/completions',
          model: env.GROQ_MODEL || 'openai/gpt-oss-120b',
          key: env.GROQ_API_KEY,
          shape: 'openai',
          keyless: false,
          jsonMode: true,
        }
      : null,
    env.OPENROUTER_API_KEY
      ? {
          id: 'openrouter',
          label: 'OpenRouter',
          baseUrl: 'https://openrouter.ai/api/v1',
          chatUrl: 'https://openrouter.ai/api/v1/chat/completions',
          model: env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free',
          key: env.OPENROUTER_API_KEY,
          shape: 'openai',
          keyless: false,
          jsonMode: true,
        }
      : null,
    env.GEMINI_API_KEY
      ? {
          id: 'gemini',
          label: 'Google AI Studio',
          baseUrl: GEMINI_BASE,
          chatUrl: GEMINI_BASE,
          // Google retires model ids for new keys without warning (gemini-2.5-flash
          // now 404s), and its prompt ids are fast where the newest is not.
          model: env.GEMINI_MODEL || 'gemini-3-flash-preview',
          key: env.GEMINI_API_KEY,
          shape: 'gemini',
          keyless: false,
          jsonMode: true,
        }
      : null,
    env.GITHUB_TOKEN
      ? {
          id: 'github',
          label: 'GitHub Models',
          baseUrl: 'https://models.github.ai/inference',
          chatUrl: 'https://models.github.ai/inference/chat/completions',
          model: env.GITHUB_MODEL || 'openai/gpt-4o-mini',
          key: env.GITHUB_TOKEN,
          shape: 'openai',
          keyless: false,
          jsonMode: true,
        }
      : null,
    env.CEREBRAS_API_KEY
      ? {
          id: 'cerebras',
          label: 'Cerebras',
          baseUrl: 'https://api.cerebras.ai/v1',
          chatUrl: 'https://api.cerebras.ai/v1/chat/completions',
          model: env.CEREBRAS_MODEL || 'llama-3.3-70b',
          key: env.CEREBRAS_API_KEY,
          shape: 'openai',
          keyless: false,
          jsonMode: true,
        }
      : null,
    // No account needed: the anonymous tier returns a real answer. This is the
    // provider that makes the product usable before any key exists.
    {
      id: 'pollinations',
      label: 'Pollinations',
      baseUrl: 'https://text.pollinations.ai',
      chatUrl: 'https://text.pollinations.ai/openai',
      model: env.POLLINATIONS_MODEL || 'openai-fast',
      key: env.POLLINATIONS_API_KEY ?? '',
      shape: 'openai',
      keyless: !env.POLLINATIONS_API_KEY,
      jsonMode: true,
    },
    // Last resort: also keyless, but in testing it answered once and then rejected
    // the anonymous token or timed out. Kept last so it can never be the assumption.
    {
      id: 'llm7',
      label: 'LLM7',
      baseUrl: 'https://api.llm7.io/v1',
      chatUrl: 'https://api.llm7.io/v1/chat/completions',
      model: env.LLM7_MODEL || 'DeepSeek-V4-Flash-0731',
      key: env.LLM7_TOKEN || LLM7_PUBLIC_TOKEN,
      shape: 'openai',
      keyless: true,
      jsonMode: true,
    },
  ]

  const available = candidates.filter((entry): entry is ModelChoice => Boolean(entry))
  if (!forced) return available
  const chosen = available.find((entry) => entry.id === forced)
  // A forced provider that is not configured is ignored rather than fatal.
  return chosen ? [chosen, ...available.filter((entry) => entry.id !== chosen.id)] : available
}

/** The provider that would be tried first. */
export function resolveModel(env: Env): ModelChoice | null {
  return providerChain(env)[0] ?? null
}

export function hasModel(env: Env): boolean {
  return providerChain(env).length > 0
}

export interface ChatRequest {
  system: string
  user: string
  temperature?: number
  maxTokens?: number
  timeoutMs?: number
}

export interface ChatResult {
  text: string
  provider: ProviderId
  providerLabel: string
  model: string
}

interface OpenAiResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[]
  error?: { message?: string }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  error?: { message?: string }
}

/** Pulls the assistant text out of an OpenAI-shaped response body. */
function openAiText(data: unknown): string {
  const parsed = data as OpenAiResponse
  return parsed.choices?.[0]?.message?.content?.trim() ?? ''
}

/**
 * LLM7 renames and retires models. One retry against its live catalogue keeps a
 * working path without pinning a model that will disappear.
 */
async function llm7FallbackModel(baseUrl: string, key: string): Promise<string | null> {
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    const data = (await response.json()) as { data?: { id?: string; modalities?: { input?: string[] } }[] }
    const text = (data.data ?? []).find((entry) => entry.id && (entry.modalities?.input ?? ['text']).includes('text'))
    return text?.id ?? null
  } catch {
    return null
  }
}

/**
 * Sends one chat request and returns the text. Throws with a short reason the caller
 * can surface — never with a key, and never by silently returning an empty draft.
 */
export async function chat(env: Env, request: ChatRequest): Promise<ChatResult> {
  const chain = providerChain(env)
  if (!chain.length) throw new Error('no_provider')

  const failures: string[] = []
  for (const choice of chain) {
    try {
      return await attempt(choice, request)
    } catch (error) {
      // One provider rejecting or timing out must not end the request: the next
      // configured one is tried, and the reason is kept for the caller to report.
      failures.push(error instanceof Error ? error.message : 'unknown')
    }
  }
  throw new Error(failures.join(', ') || 'no_provider')
}

async function attempt(choice: ModelChoice, request: ChatRequest): Promise<ChatResult> {
  const timeout = request.timeoutMs ?? 45_000
  const run = async (model: string): Promise<string> => {
    if (choice.shape === 'gemini') {
      const url = `${choice.baseUrl}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(choice.key)}`
      const response = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(timeout),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: [{ role: 'user', parts: [{ text: request.user }] }],
          generationConfig: {
            temperature: request.temperature ?? 0.2,
            // Gemini counts thinking tokens against this budget, and a reply cut
            // mid-JSON is useless. Give it room; the prompt still bounds the prose.
            maxOutputTokens: Math.max(3000, (request.maxTokens ?? 2048) * 2),
            ...(choice.jsonMode ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      })
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        // A retired model reports NOT_FOUND; that is a naming problem, not an auth
        // problem, so it is worth one retry on the current id.
        if (response.status === 404 && /no longer available|NOT_FOUND/i.test(detail)) {
          throw new Error(`gemini_model_retired`)
        }
        throw new Error(`gemini_${response.status}`)
      }
      const data = (await response.json()) as GeminiResponse & {
        promptFeedback?: { blockReason?: string }
        candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
      }
      const text = (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('').trim()
      if (!text) {
        // A blocked prompt or an empty candidate looks identical to a bad reply, so
        // name the difference for the operator instead of hiding it.
        const reason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? 'no_candidates'
        throw new Error(`gemini_empty_${String(reason).toLowerCase()}`)
      }
      return text
    }

    const response = await fetch(choice.chatUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(timeout),
      headers: {
        'content-type': 'application/json',
        // An empty key means the provider's anonymous tier: send no header at all
        // rather than a broken one.
        ...(choice.key ? { authorization: `Bearer ${choice.key}` } : {}),
      },
      body: JSON.stringify({
        model,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 2048,
        ...(choice.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        // Pollinations serves a reasoning model: without this it spends the whole
        // output budget thinking and returns a token-limit error after ~40s.
        ...(choice.id === 'pollinations' ? { reasoning_effort: 'low' } : {}),
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      }),
    })
    if (!response.ok) throw new Error(`${choice.id}_${response.status}`)
    const data = await response.json()
    const text = openAiText(data)
    if (!text) {
      const message = (data as OpenAiResponse).error?.message ?? ''
      // A retired model is the common failure here, not a bad key.
      if (/unavailable|not found/i.test(message)) throw new Error(`${choice.id}_model_unavailable`)
      throw new Error(`${choice.id}_empty`)
    }
    return text
  }

  try {
    const text = await run(choice.model)
    return { text, provider: choice.id, providerLabel: choice.label, model: choice.model }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    if (choice.id === 'llm7' && reason.endsWith('model_unavailable')) {
      const next = await llm7FallbackModel(choice.baseUrl, choice.key)
      if (next && next !== choice.model) {
        const text = await run(next)
        return { text, provider: choice.id, providerLabel: choice.label, model: next }
      }
    }
    // Google renames models for new accounts, and free quotas are per model: a 429
    // on one id does not mean the account is exhausted. Try the other current ids
    // before giving up on the provider entirely.
    if (choice.id === 'gemini' && (reason === 'gemini_model_retired' || /^gemini_(4\d\d|5\d\d)$/.test(reason))) {
      for (const next of ['gemini-3-flash-preview', 'gemini-3.8-flash', 'gemini-flash-latest']) {
        if (next === choice.model) continue
        try {
          const text = await run(next)
          return { text, provider: choice.id, providerLabel: choice.label, model: next }
        } catch {
          continue
        }
      }
    }
    throw error
  }
}

/** Parses a reply that was asked to be JSON, tolerating fences and preamble. */
function parseReply<T>(text: string, provider: string): T {
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  try {
    return JSON.parse(cleaned) as T
  } catch {
    // Some models prepend a sentence even when asked for JSON. Take the outermost
    // object rather than throwing away a usable draft.
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    // The length is part of the error on purpose: a truncated reply and a prose
    // reply look identical from the outside, and that ambiguity cost a debug cycle.
    if (start === -1 || end <= start) throw new Error(`${provider}_invalid_json(len=${cleaned.length})`)
    try {
      return JSON.parse(cleaned.slice(start, end + 1)) as T
    } catch {
      throw new Error(`${provider}_invalid_json(len=${cleaned.length},tail=${JSON.stringify(cleaned.slice(-40))})`)
    }
  }
}

/**
 * JSON-shaped chat call. Parsing happens per provider, so a reply that cannot be
 * read falls through to the next one instead of ending the request — the failure
 * this was written to fix was Gemini returning truncated JSON and the whole draft
 * dying while two working providers sat unused.
 */
export async function chatJson<T>(env: Env, request: ChatRequest): Promise<{ data: T; result: ChatResult }> {
  const chain = providerChain(env)
  if (!chain.length) throw new Error('no_provider')
  const failures: string[] = []
  for (const choice of chain) {
    try {
      const result = await attempt(choice, request)
      return { data: parseReply<T>(result.text, result.provider), result }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown'
      failures.push(reason)
      // Provider ids and error codes only: never keys or prompt content.
      console.warn(`[model] ${choice.id} failed: ${reason}`)
    }
  }
  throw new Error(failures.join(', ') || 'no_provider')
}
