import { api } from '../../services/api/client.js'
import { useCallback } from 'react'
import { usePollingResource } from '../dashboard/hooks/usePollingResource.js'

async function fetchPermission(signal, roomId) {
  const { data } = await api.get('/api/classroom/permission', { signal, params: { roomId } })
  if (data.success !== true || typeof data.data?.allowed !== 'boolean') throw new Error('Invalid permission response')
  return data.data
}
export function useControlPermission(roomId = 101) {
  const fetcher = useCallback(signal => fetchPermission(signal, roomId), [roomId])
  return usePollingResource(fetcher, 15000)
}
