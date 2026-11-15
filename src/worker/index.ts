import { Hono } from 'hono'

import { authMode, getAuth, requireUser } from './auth'
import { requireDb } from './db'
import type { AppContext, Env } from './env'
import { applications } from './routes/applications'
import { ingestRoute } from './routes/ingest'
import { kit } from './routes/kit'
import { opportunities } from './routes/opportunities'
import { profiles } from './routes/profiles'
import { sources } from './routes/sources'
import { workspace } from './routes/workspace'

const app = new Hono<AppContext>()

// Public: lets the app know how to sign in, and whether storage is attached,
// before it makes any private call.
app.get('/api/auth/status', (c) => {
  c.header('Cache-Control', 'private, no-store')
  return c.json({
    mode: authMode(c.env, c.req.raw),
    database: Boolean(c.env.DB),
    files: Boolean(c.env.FILES),
    qualifier: c.env.OPENAI_API_KEY ? 'model' : 'rules',
  })
})

app.get('/api/health', (c) => c.json({ ok: true }))

// Bearer-authenticated: the external discovery runner. Mounted before the
// session middleware because it has no session by design.
app.route('/api/ingest', ingestRoute)

const api = new Hono<AppContext>()
api.use('*', requireUser, requireDb)
api.route('/', workspace)
api.route('/opportunities', opportunities)
api.route('/opportunities', kit)
api.route('/sources', sources)
api.route('/profiles', profiles)
api.route('/applications', applications)
app.route('/api', api)

app.onError((error, c) => {
  console.error(error)
  return c.json({ error: 'Something went wrong.' }, 500)
})

app.notFound((c) =>
  c.req.path.startsWith('/api/') ? c.json({ error: 'Not found.' }, 404) : c.env.ASSETS.fetch(c.req.raw),
)

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Sign in with Freebuff owns /auth/freebuff/* and keeps sessions fresh. It
    // wraps the whole app once per isolate; without a client ID the app falls
    // back to the loopback development user (see auth.ts).
    const auth = getAuth(env)
    const handler = (req: Request) => Promise.resolve(app.fetch(req, env, ctx))
    return auth ? auth.wrap(handler)(request) : handler(request)
  },
}
