import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { Shell } from './components/Shell'
import { Spinner, ToastProvider } from './components/ui'
import { ApiError, useMe } from './lib/api'
import { Leads } from './pages/Leads'
import { OpportunityDetail } from './pages/OpportunityDetail'
import { Opportunities } from './pages/Opportunities'
import { Overview } from './pages/Overview'
import { Profiles } from './pages/Profiles'
import { Settings } from './pages/Settings'
import { SetupNeeded, SignIn } from './pages/SignIn'
import { Sources } from './pages/Sources'

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
})

function Gate() {
  const me = useMe()
  if (me.isLoading) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner />
      </div>
    )
  }
  if (me.error instanceof ApiError) {
    if (me.error.status === 401) return <SignIn />
    if (me.error.status === 503) return <SetupNeeded message={me.error.message} />
  }
  if (me.error) return <SetupNeeded message={me.error.message} />

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Overview />} />
        <Route path="opportunities" element={<Opportunities />} />
        <Route path="opportunities/:id" element={<OpportunityDetail />} />
        <Route path="leads" element={<Leads />} />
        <Route path="sources" element={<Sources />} />
        <Route path="profiles" element={<Profiles />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export function App() {
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BrowserRouter>
          <Gate />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
