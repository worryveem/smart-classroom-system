import { useQueryResource } from '../../../hooks/useQueryResource.js'
import { fetchHistory } from '../services/historyService.js'

export function useHistoryQuery(tab, params, valid, revision) {
  return useQueryResource(tab, params, valid, revision, fetchHistory)
}
