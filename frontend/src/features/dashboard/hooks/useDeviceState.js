import { fetchDeviceState } from '../services/dashboardService.js'
import { usePollingResource } from './usePollingResource.js'

export function useDeviceState() { return usePollingResource(fetchDeviceState, 4000) }
