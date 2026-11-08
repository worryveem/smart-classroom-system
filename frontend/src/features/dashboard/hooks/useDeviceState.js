import { fetchDeviceState } from '../services/dashboardService.js'
import { useCallback } from 'react'
import { usePollingResource } from './usePollingResource.js'

export function useDeviceState(scope) {
  const fetcher = useCallback(signal => fetchDeviceState(signal, scope), [scope])
  return usePollingResource(fetcher, 4000)
}
