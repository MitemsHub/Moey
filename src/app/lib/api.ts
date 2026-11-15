import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  Application,
  ApplicationKit,
  LeadStage,
  Me,
  Opportunity,
  OpportunityDetail,
  OpportunityQuery,
  OpportunityStatus,
  Overview,
  Paged,
  Profile,
  Source,
  SourceRun,
} from '../../shared/types'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: {
      accept: 'application/json',
      ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  if (!response.ok) {
    let message = response.statusText
    let code: string | undefined
    try {
      const body = (await response.json()) as { error?: string; message?: string }
      message = body.message ?? body.error ?? message
      code = body.error
    } catch {
      /* no body */
    }
    throw new ApiError(response.status, message, code)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const useMe = () =>
  useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/me'), retry: false, staleTime: 30_000 })

export const useOverview = () =>
  useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/overview'), refetchInterval: 60_000 })

export const useOpportunities = (query: OpportunityQuery) =>
  useQuery({
    queryKey: ['opportunities', query],
    queryFn: () => {
      const params = new URLSearchParams()
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== '' && value !== null) params.set(key, String(value))
      }
      return api<Paged<Opportunity>>(`/opportunities?${params}`)
    },
    placeholderData: (previous) => previous,
  })

export const useOpportunity = (id: string | undefined) =>
  useQuery({
    queryKey: ['opportunity', id],
    queryFn: () => api<OpportunityDetail>(`/opportunities/${id}`),
    enabled: Boolean(id),
  })

export const useKit = (id: string | undefined) =>
  useQuery({
    queryKey: ['kit', id],
    queryFn: () => api<{ kit: ApplicationKit | null }>(`/opportunities/${id}/kit`),
    enabled: Boolean(id),
  })

export const generateKit = (id: string) =>
  api<{ kit: ApplicationKit }>(`/opportunities/${id}/kit`, { method: 'POST' })

export const useSources = () =>
  useQuery({ queryKey: ['sources'], queryFn: () => api<{ items: (Source & { config: Record<string, unknown>; configHint: string; needs: string | null })[] }>('/sources') })

export const useSourceRuns = () =>
  useQuery({ queryKey: ['source-runs'], queryFn: () => api<{ items: SourceRun[] }>('/sources/runs') })

export const useProfiles = () =>
  useQuery({ queryKey: ['profiles'], queryFn: () => api<{ items: Profile[] }>('/profiles') })

export const useApplications = () =>
  useQuery({ queryKey: ['applications'], queryFn: () => api<{ items: Application[] }>('/applications') })

export function useInvalidate() {
  const client = useQueryClient()
  return (...keys: string[]) => Promise.all(keys.map((key) => client.invalidateQueries({ queryKey: [key] })))
}

export function useApiMutation<TInput, TResult>(
  run: (input: TInput) => Promise<TResult>,
  invalidates: string[],
  options?: {
    onSuccess?: (result: TResult, input: TInput) => void
    onError?: (error: unknown) => void
  },
) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: run,
    onError: (error) => options?.onError?.(error),
    onSuccess: async (result, input) => {
      await invalidate(...invalidates)
      options?.onSuccess?.(result, input)
    },
  })
}

export const setStatus = (id: string, status: OpportunityStatus) =>
  api(`/opportunities/${id}`, { method: 'PATCH', json: { status } })

export const rescore = (id: string) => api(`/opportunities/${id}/score`, { method: 'POST' })

export const track = (id: string) => api(`/opportunities/${id}/apply`, { method: 'POST', json: {} })

export const moveLead = (id: string, stage: LeadStage, position?: number) =>
  api(`/applications/${id}`, { method: 'PATCH', json: { stage, ...(position !== undefined ? { position } : {}) } })

export interface ManualInput {
  title: string
  org?: string
  url?: string
  pipeline: 'individual' | 'business'
  signal: 'explicit' | 'emerging'
  body?: string
  location?: string
  deadline?: string
  compMin?: number
  compMax?: number
}

export const submitManual = (input: ManualInput) =>
  api<{ id: string }>('/opportunities', { method: 'POST', json: input })

export const runSource = (id: string) =>
  api<{ found: number; inserted: number; duplicates: number; errors: number }>(`/sources/${id}/run`, { method: 'POST' })

export const runAllSources = () =>
  api<{ results: { id: string; inserted: number; duplicates: number; error?: string }[] }>('/sources/run-all', {
    method: 'POST',
  })

export const updateSource = (
  id: string,
  input: { enabled?: boolean; config?: Record<string, unknown>; label?: string },
) => api(`/sources/${id}`, { method: 'PATCH', json: input })

export const updateProfile = (
  id: string,
  input: {
    name?: string
    headline?: string
    summary?: string
    location?: string
    capacity?: string
    github?: string
    experience?: string
    eligibility?: Record<string, string>
    skills?: string[]
    services?: { service: string; summary?: string; evidence?: string }[]
  },
) => api(`/profiles/${id}`, { method: 'PATCH', json: input })
