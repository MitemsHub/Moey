import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Compass, Radar } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { useOpportunities } from '../lib/api'
import { cx } from '../lib/cx'

/** Search and jump. Queries the same list endpoint the table uses, so results
 *  never disagree with what the table would show. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const { data } = useOpportunities({ q: q.trim() || undefined, sort: 'recent' })

  useEffect(() => {
    if (!open) {
      setQ('')
      setActive(0)
    }
  }, [open])

  const shortcuts = useMemo(
    () => [
      { key: 'h', label: 'Signal', detail: 'Overview', to: '/' },
      { key: 'o', label: 'Opportunities', detail: 'All rows', to: '/opportunities' },
      { key: 'l', label: 'Leads', detail: 'Board', to: '/leads' },
      { key: 's', label: 'Sources', detail: 'Adapters and health', to: '/sources' },
      { key: 'p', label: 'Profiles', detail: 'Skills and services', to: '/profiles' },
    ],
    [],
  )

  const results = q.trim()
    ? (data?.items ?? []).map((item) => ({
        key: item.id,
        label: item.title,
        detail: `${item.sourceLabel ?? 'Manual'} · ${item.score ?? '—'}`,
        to: `/opportunities/${item.id}`,
      }))
    : shortcuts.map((s) => ({ key: s.key, label: s.label, detail: s.detail, to: s.to }))

  useEffect(() => setActive(0), [q, results.length])

  function go(to: string) {
    onClose()
    navigate(to)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center bg-fg/25 px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            role="dialog"
            aria-label="Search"
            className="w-full max-w-[560px] overflow-hidden rounded-dialog bg-surface shadow-dialog"
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex h-12 items-center gap-3 border-b border-line px-4">
              <Compass className="size-4 text-faint" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(a + 1, results.length - 1)))
                  if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(a - 1, 0)))
                  if (e.key === 'Enter' && results[active]) go(results[active].to)
                  if (e.key === 'Escape') onClose()
                }}
                placeholder="Search opportunities, or jump to a screen"
                aria-label="Search opportunities"
                className="h-full flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
              />
            </div>
            <ul className="max-h-[50vh] overflow-y-auto p-1.5">
              {results.length === 0 && (
                <li className="px-3 py-8 text-center text-[13px] text-muted">
                  Nothing matches “{q}”. Try a shorter phrase.
                </li>
              )}
              {results.map((item, i) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item.to)}
                    className={cx(
                      'flex h-10 w-full items-center gap-3 rounded-control px-2.5 text-left',
                      i === active && 'bg-surface-2',
                    )}
                  >
                    <Radar className="size-3.5 shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{item.label}</span>
                    <span className="shrink-0 truncate text-[11.5px] text-faint">{item.detail}</span>
                    <ArrowRight className="size-3 shrink-0 text-faint" />
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
