import { useCallback } from 'react'
import { fetchTelemetry } from '../services/dashboardService.js'
import { usePollingResource } from './usePollingResource.js'

export function useTelemetry(range, scope) {
  const fetcher = useCallback(signal => fetchTelemetry(range, signal, scope), [range, scope])
  return usePollingResource(fetcher, 30000)
}
