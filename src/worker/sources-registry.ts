import { ADAPTERS, getAdapter } from './adapters'
import { now } from './db'

/**
 * Seeds one `sources` row per registered adapter. Adapters that cannot run yet
 * (missing board list or API key) are inserted disabled with health
 * `unconfigured` — visible in the registry with what they need, never silently
 * marked as working.
 */
export async function seedSources(
  db: D1Database,
  ownerSub: string,
  present: ReadonlySet<string> = new Set(),
): Promise<D1PreparedStatement[]> {
  const stamp = now()
  // `present` holds the adapter keys this workspace already has. INSERT OR IGNORE
  // still costs a written row on every attempt, and this runs inside a GET
  // (/api/me), so re-inserting the whole registry on each page load was spending
  // the deployment's daily write allowance for nothing: 18 writes per app load.
  return ADAPTERS.filter((adapter) => !present.has(adapter.key)).map((adapter) => {
    const boardList = DEFAULT_BOARDS[adapter.key] ?? []
    // A board-list adapter with boards configured IS runnable. Leaving it disabled
    // because it "needs configuration" made three working sources read as broken.
    const runnable = adapter.needs === null || (adapter.needs === 'board-list' && boardList.length > 0)
    const config = boardList.length ? JSON.stringify({ boards: boardList }) : '{}'
    return db
      .prepare(
        `INSERT OR IGNORE INTO sources
           (id, owner_sub, adapter, label, kind, pipeline, enabled, config_json, health, last_run_at, last_error, note, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL,?,?)`,
      )
      .bind(
        id(adapter.key, ownerSub),
        ownerSub,
        adapter.key,
        adapter.label,
        adapter.kind,
        adapter.pipeline,
        runnable ? 1 : 0,
        config,
        runnable ? 'idle' : 'unconfigured',
        adapter.note,
        stamp,
      )
  })
}

/** Deterministic id so re-seeding cannot create duplicate source rows. */
function id(adapter: string, ownerSub: string): string {
  return `src_${ownerSub.slice(0, 8)}_${adapter}`
}

/**
 * STARTER board list — extend it. Each token is one employer's public ATS board,
 * verified to return jobs on 2026-11-14. There is no global search across an ATS:
 * coverage equals the list you curate. Being listed here is not endorsement,
 * partnership or a claim of any relationship.
 */
const DEFAULT_BOARDS: Record<string, string[]> = {
  // Drawn from data/verified-boards.json: 1,559 of 1,809 candidate tokens answered
  // the live endpoint on 2026-11-14 (426 Greenhouse, 214 Lever, 919 Ashby). These
  // are the 20 highest-yield per platform; the rest of the verified list is in that
  // file and can be pasted straight into a source config.
  //
  // Each adapter caps a single board at 40 recent roles, so widening this list
  // widens employer coverage instead of multiplying volume.
  greenhouse: [
    'andurilindustries', 'databricks', 'stripe', 'speechify', 'rocketlab', 'axon', 'cloudflare',
    'doordashusa', 'elastic', 'mongodb', 'datadog', 'verkada', 'braze', 'samsara', 'canonical',
    'figma', 'gitlab', 'discord', 'vercel', 'anthropic',
  ],
  lever: [
    'veeva', 'latitudeinc', 'zoox', 'sila', 'paytm', 'gopuff', 'octoenergy', 'lalamove', 'aleph',
    'pigment', 'spear', 'pattern', 'coupa', 'coins', 'extremenetworks', 'ajax', 'lessen', 'ion',
    'pingwind', 'wyetechllc',
  ],
  ashby: [
    'openai', 'airwallex', 'harvey', 'legora', 'applied', 'crusoe', 'saronic', 'clickhouse', 'sierra',
    'skydio', 'ramp', 'notion', 'perplexity', 'linear', 'vanta', 'attio', 'posthog', 'clerk', 'alan', 'finni-health',
  ],
}

export function describeAdapter(adapterKey: string): string {
  const adapter = getAdapter(adapterKey)
  if (!adapter) return 'Unknown adapter'
  return adapter.note
}
