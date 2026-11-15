import { motion } from 'motion/react'
import { ArrowRight, Database } from 'lucide-react'

export function SignIn() {
  const returnTo = encodeURIComponent(`${window.location.pathname}${window.location.search}`)
  return (
    <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <div className="flex flex-col justify-between p-8 sm:p-12">
        <div className="flex items-center gap-2.5">
          <span className="grid size-6 place-items-center rounded-[4px] bg-fg text-[10px] font-bold text-surface">M</span>
          <span className="text-[12.5px] font-semibold tracking-tight">Opportunity Engine</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-[34ch]"
        >
          <p className="tnum text-[10.5px] uppercase tracking-[0.18em] text-accent">Mitemshub</p>
          <h1 className="mt-2 text-balance text-[34px] font-medium leading-[1.08]">
            Find the demand before it becomes a contract.
          </h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
            Opportunity discovery, qualification and provenance for two pipelines: individual work, and Mitemshub
            engagements. Every row keeps its source.
          </p>
          <a
            href={`/auth/freebuff/signin?returnTo=${returnTo}`}
            className="mt-7 inline-flex h-10 items-center gap-2 rounded-control bg-fg px-4 text-[13.5px] font-medium text-surface transition-colors hover:bg-[#2a2820]"
          >
            <span className="grid size-4.5 place-items-center rounded-[3px] bg-surface text-[10px] font-bold text-fg">F</span>
            Sign in with Freebuff
            <ArrowRight className="size-3.5" />
          </a>
          <p className="mt-3 text-[11.5px] text-faint">Uses your Freebuff account. No separate password.</p>
        </motion.div>

        <p className="text-[11px] text-faint">Mitemshub · internal tooling</p>
      </div>

      <div className="relative hidden overflow-hidden border-l border-line bg-surface lg:block">
        <div className="rule-grid absolute inset-0 opacity-50" />
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="absolute left-10 top-1/2 w-[420px] -translate-y-1/2 rounded-card border border-line bg-surface p-4 shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-line pb-2">
            <p className="tnum text-[10px] uppercase tracking-[0.14em] text-muted">Provenance</p>
            <p className="tnum text-[10px] text-faint">row · 04</p>
          </div>
          <ol className="mt-3 flex flex-col gap-3">
            {[
              ['Source', 'EU TED · tender notice', true],
              ['Fetched', 'published 12 Nov', true],
              ['Normalised', 'identity hash 9f2c1a', true],
              ['Qualified', 'rule score 62/100', true],
              ['Decision', 'awaiting review', false],
            ].map(([label, detail, done]) => (
              <li key={label as string} className="flex items-start gap-2.5">
                <span
                  className={
                    done
                      ? 'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-success/40 bg-success-soft'
                      : 'mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border border-line-strong bg-surface-2'
                  }
                >
                  <span className={done ? 'size-1.5 rounded-full bg-success' : 'size-1.5 rounded-full bg-line-strong'} />
                </span>
                <span>
                  <span className="block text-[12px] font-medium">{label}</span>
                  <span className="block font-mono text-[10.5px] text-faint">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </motion.div>
      </div>
    </div>
  )
}

export function SetupNeeded({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto grid size-10 place-items-center rounded-card bg-surface-2 text-muted">
          <Database className="size-4.5" />
        </div>
        <h1 className="mt-3 text-[19px] font-medium">Storage is not attached</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{message}</p>
        <p className="mt-3 text-[12px] text-faint">
          Add D1 storage named <code className="tnum">DB</code>, then redeploy. Locally, Wrangler provides one
          automatically.
        </p>
      </div>
    </div>
  )
}
