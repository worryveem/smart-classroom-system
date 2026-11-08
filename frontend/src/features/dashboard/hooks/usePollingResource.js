import { useCallback, useEffect, useRef, useState } from 'react'
import axios from 'axios'

const initial = { data: null, error: null, loading: true, refreshing: false, receivedAt: null }

export function usePollingResource(fetcher, interval) {
  const [resource, setResource] = useState(initial)
  const refreshRef = useRef(() => {})
  useEffect(() => {
    let disposed = false, running = false, queued = false, timer, controller
    setResource(initial)
    async function load() {
      clearTimeout(timer)
      if (disposed || document.visibilityState === 'hidden') return
      if (running) { queued = true; return }
      running = true
      controller = new AbortController()
      setResource(previous => ({ ...previous, refreshing: true }))
      try {
        const data = await fetcher(controller.signal)
        if (!disposed) setResource({ data, error: null, loading: false, refreshing: false, receivedAt: Date.now() })
      } catch (error) {
        if (!disposed && !axios.isCancel(error)) setResource(previous => ({ ...previous, error, loading: false, refreshing: false }))
      } finally {
        running = false
        if (!disposed) {
          setResource(previous => ({ ...previous, refreshing: false }))
          if (document.visibilityState !== 'hidden') {
            if (queued) { queued = false; load() }
            else timer = setTimeout(load, interval)
          }
        }
      }
    }
    function visible() {
      clearTimeout(timer)
      if (document.visibilityState === 'hidden') { queued = false; controller?.abort() }
      else load()
    }
    refreshRef.current = load
    load()
    document.addEventListener('visibilitychange', visible)
    return () => {
      disposed = true
      controller?.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', visible)
      refreshRef.current = () => {}
    }
  }, [fetcher, interval])
  const refresh = useCallback(() => refreshRef.current(), [])
  return { ...resource, refresh }
}
