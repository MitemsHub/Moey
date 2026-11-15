import { useState } from 'react'

import { Badge, Button, ConfirmDialog, Field, Input, PageHeader, useToast } from '../components/ui'
import { api, useApiMutation, useMe } from '../lib/api'

export function Settings() {
  const { data: me } = useMe()
  const toast = useToast()
  const [name, setName] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'clear' | 'restore' | null>(null)

  const rename = useApiMutation((value: string) => api('/workspace', { method: 'PATCH', json: { name: value } }), ['me'], {
    onSuccess: () => toast('Workspace renamed'),
  })
  const reset = useApiMutation(
    (mode: 'clear' | 'restore') => api('/workspace/reset', { method: 'POST', json: { mode } }),
    ['me', 'overview', 'opportunities', 'sources', 'profiles', 'applications'],
    {
      onSuccess: () => {
        setConfirm(null)
        toast('Workspace reset')
      },
    },
  )

  if (!me) return null
  const value = name ?? me.workspace.name

  return (
    <div className="mx-auto max-w-[760px] px-5 py-5 sm:px-7">
      <PageHeader title="Settings" />

      <section className="mt-6">
        <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-muted">Account</h2>
        <div className="mt-2 flex flex-wrap items-center gap-3 rounded-card border border-line p-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
            {(me.user.name ?? me.user.email ?? 'M').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-medium">{me.user.name ?? 'Signed in'}</p>
            {me.user.email && <p className="truncate text-[12px] text-muted">{me.user.email}</p>}
          </div>
          {me.capabilities.auth === 'freebuff' ? (
            <form method="post" action="/auth/freebuff/signout">
              <input type="hidden" name="returnTo" value="/" />
              <Button type="submit" size="sm">
                Sign out
              </Button>
            </form>
          ) : (
            <Badge tone="warning">Development user</Badge>
          )}
        </div>
        {me.capabilities.auth === 'development' && (
          <p className="mt-1.5 text-[11.5px] text-faint">
            Sign in with Freebuff is not configured. Set FREEBUFF_CLIENT_ID to use real accounts.
          </p>
        )}
      </section>

      <section className="mt-7">
        <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-muted">Workspace</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim() && value !== me.workspace.name) rename.mutate(value.trim())
          }}
          className="mt-2 flex items-end gap-2"
        >
          <Field label="Name" className="flex-1">
            <Input value={value} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Button variant="primary" type="submit" loading={rename.isPending} disabled={!value.trim() || value === me.workspace.name}>
            Save
          </Button>
        </form>
      </section>

      <section className="mt-7">
        <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-muted">Capabilities</h2>
        <ul className="mt-2 divide-y divide-line rounded-card border border-line">
          {[
            ['Database', me.capabilities.database, 'D1 via the DB binding'],
            ['File storage', me.capabilities.files, 'R2 via the FILES binding'],
            ['Sign in with Freebuff', me.capabilities.auth === 'freebuff', 'FREEBUFF_CLIENT_ID'],
            ['Model qualifier', me.capabilities.qualifier === 'model', me.capabilities.qualifier === 'model' ? 'OPENAI_API_KEY is set' : 'Rules-only scoring until OPENAI_API_KEY is set'],
            ['External ingest', me.capabilities.ingest, me.capabilities.ingest ? 'INGEST_SECRET is set' : 'Disabled — the GitHub Actions runner cannot push until INGEST_SECRET is set'],
          ].map(([label, ok, detail]) => (
            <li key={label as string} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{label}</span>
                <span className="block text-[11.5px] text-faint">{detail}</span>
              </span>
              <Badge tone={ok ? 'success' : 'neutral'} dot>
                {ok ? 'Ready' : 'Off'}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-7">
        <h2 className="text-[10.5px] uppercase tracking-[0.14em] text-muted">Data</h2>
        <div className="mt-2 divide-y divide-line rounded-card border border-line">
          <div className="flex flex-wrap items-center gap-3 p-3.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">Reset sources and profiles</span>
              <span className="block text-[11.5px] text-muted">
                Re-creates the adapter registry and the two empty profiles. Discovered rows are kept.
              </span>
            </span>
            <Button size="sm" onClick={() => setConfirm('restore')}>
              Reset
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 p-3.5">
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">Clear every opportunity</span>
              <span className="block text-[11.5px] text-muted">
                Deletes opportunities, scores, leads and scan history. Cannot be undone.
              </span>
            </span>
            <Button size="sm" variant="danger" onClick={() => setConfirm('clear')}>
              Clear
            </Button>
          </div>
        </div>
      </section>

      <p className="mt-7 max-w-[75ch] text-[11.5px] leading-relaxed text-faint">
        Secrets are never rendered here — only whether a binding or key is present. Set them in <code>.dev.vars</code> locally
        or in Sites → Secrets on the deployment.
      </p>

      <ConfirmDialog
        open={confirm === 'restore'}
        onClose={() => setConfirm(null)}
        onConfirm={() => reset.mutate('restore')}
        loading={reset.isPending}
        title="Reset the registry?"
        description="Sources and the two profiles are re-created empty. Discovered opportunities are kept."
        confirmLabel="Reset"
      />
      <ConfirmDialog
        open={confirm === 'clear'}
        onClose={() => setConfirm(null)}
        onConfirm={() => reset.mutate('clear')}
        loading={reset.isPending}
        title="Clear every opportunity?"
        description="All opportunities, scores, leads, activities and scan history are deleted."
        confirmLabel="Clear everything"
      />
    </div>
  )
}
