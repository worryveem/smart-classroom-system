import { useEffect, useRef, useState } from 'react'
import axios from 'axios'

export function useQueryResource(scope, params, valid, revision, fetcher) {
  const key = JSON.stringify(params)
  const cache = useRef({})
  const previous = useRef(null)
  const [result, setResult] = useState({ scope, key, data: null, loading: true, error: null, loadedAt: null })
  useEffect(() => {
    let disposed = false
    const controller = new AbortController()
    const cached = cache.current[scope], sameQuery = cached?.key === key
    const old = previous.current
    previous.current = { scope, revision, page: params.page }
    if (!valid) {
      setResult({ scope, key, data: null, loading: false, error: null, loadedAt: null })
      return () => controller.abort()
    }
    if (sameQuery && cached.revision === revision) {
      setResult({ ...cached, scope, loading: false, error: null })
      return () => controller.abort()
    }
    setResult({ scope, key, data: sameQuery ? cached.data : null, loadedAt: sameQuery ? cached.loadedAt : null, loading: true, error: null })
    const delay = old?.scope === scope && old?.revision === revision && old?.page === params.page ? 400 : 0
    const timer = setTimeout(async () => {
      try {
        const data = await fetcher(scope, JSON.parse(key), controller.signal)
        if (disposed) return
        const entry = { key, data, loadedAt: Date.now(), revision }
        cache.current[scope] = entry
        setResult({ ...entry, scope, loading: false, error: null })
      } catch (error) {
        if (disposed || axios.isCancel(error)) return
        setResult({ scope, key, data: sameQuery ? cached.data : null, loadedAt: sameQuery ? cached.loadedAt : null, loading: false, error })
      }
    }, delay)
    return () => { disposed = true; clearTimeout(timer); controller.abort() }
  }, [scope, key, valid, revision, fetcher])
  return result.scope === scope && result.key === key ? result : { data: null, loading: valid, error: null, loadedAt: null }
}
