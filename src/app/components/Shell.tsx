import { Activity, Compass, Menu as MenuIcon, Radar, Settings, SlidersHorizontal, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

import { useMe, useOverview } from '../lib/api'
import { cx } from '../lib/cx'
import { CommandPalette } from './CommandPalette'
import { HealthStrip } from './HealthStrip'

const links = [
  { to: '/', label: 'Signal', icon: Radar, end: true },
  { to: '/opportunities', label: 'Opportunities', icon: Compass },
  { to: '/leads', label: 'Leads', icon: Activity },
  { to: '/sources', label: 'Sources', icon: SlidersHorizontal },
  { to: '/profiles', label: 'Profiles', icon: Users },
]

export function Shell() {
  const { data: me } = useMe()
  const { data: overview } = useOverview()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setMobileOpen(false), [location.pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing = target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
      if (!typing && e.key === '/') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  const rail = (
    <div className="flex h-full flex-col">
      <div className="flex h-[52px] items-center gap-2.5 px-4">
        <span className="grid size-6 place-items-center rounded-[4px] bg-fg text-[10px] font-bold text-surface" aria-hidden>
          M
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] font-semibold leading-tight tracking-tight">Opportunity Engine</span>
          <span className="block truncate text-[10px] uppercase tracking-[0.16em] text-faint">Mitemshub</span>
        </span>
      </div>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="mx-3 mt-1 flex h-8 items-center gap-2 rounded-control border border-line bg-surface px-2.5 text-[12.5px] text-muted transition-colors hover:border-line-strong hover:text-fg"
      >
        <Compass className="size-3.5" />
        <span className="flex-1 text-left">Find anything</span>
        <kbd className="tnum rounded-[3px] border border-line bg-surface-2 px-1 py-0.5 text-[10px] text-faint">
          {isMac ? '⌘' : 'Ctrl'} K
        </kbd>
      </button>

      <nav aria-label="Main" className="mt-5 flex flex-col gap-px px-2">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                'relative flex h-8 items-center gap-2.5 rounded-control px-2.5 text-[13px] transition-colors',
                isActive
                  ? 'bg-surface font-medium text-fg shadow-card before:absolute before:-left-2 before:top-1.5 before:h-5 before:w-[2px] before:bg-accent before:content-[""]'
                  : 'text-muted hover:bg-surface/70 hover:text-fg',
              )
            }
          >
            <Icon className="size-[15px]" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-line px-2 py-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cx(
              'flex h-8 items-center gap-2.5 rounded-control px-2.5 text-[13px] transition-colors',
              isActive ? 'bg-surface font-medium text-fg shadow-card' : 'text-muted hover:bg-surface/70 hover:text-fg',
            )
          }
        >
          <Settings className="size-[15px]" />
          Settings
        </NavLink>
        {me && (
          <div className="mt-1 flex items-center gap-2 rounded-control px-2.5 py-2">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent">
              {(me.user.name ?? me.user.email ?? 'M').slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium leading-tight">{me.user.name ?? 'Signed in'}</span>
              <span className="block truncate text-[10.5px] text-faint">
                {me.capabilities.qualifier === 'model' ? 'Model qualifier' : 'Rules qualifier'}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-full bg-bg">
      <aside className="hidden w-[228px] shrink-0 border-r border-line lg:block">{rail}</aside>

      <div className="fixed inset-x-0 top-0 z-30 flex h-12 items-center justify-between border-b border-line bg-bg px-3 lg:hidden">
        <button type="button" aria-label="Open menu" onClick={() => setMobileOpen(true)} className="grid size-9 place-items-center rounded-control">
          <MenuIcon className="size-5" />
        </button>
        <span className="text-[13px] font-semibold">Opportunity Engine</span>
        <button type="button" aria-label="Search" onClick={() => setPaletteOpen(true)} className="grid size-9 place-items-center rounded-control">
          <Compass className="size-5" />
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-fg/25" />
          <aside className="absolute inset-y-0 left-0 w-[268px] bg-bg shadow-dialog" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              className="absolute right-2 top-2 grid size-8 place-items-center rounded-control"
            >
              <X className="size-4" />
            </button>
            {rail}
          </aside>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col pt-12 lg:pt-0">
        <HealthStrip health={overview?.health} />
        <div id="main-scroll" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

