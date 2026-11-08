import { useCallback } from 'react'
import { fetchTelemetry } from '../services/dashboardService.js'
import { usePollingResource } from './usePollingResource.js'

export function useTelemetry(range) {
  const fetcher = useCallback(signal => fetchTelemetry(range, signal), [range])
  return usePollingResource(fetcher, 30000)
}
