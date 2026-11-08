import { useEffect, useRef, useState } from 'react'
import { adminError } from '../services/adminService.js'

export function useAdminMutation(scope, operation, onComplete) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const mounted = useRef(false), running = useRef(false)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function run(action) {
    if (running.current) return
    running.current = true; setBusy(true); setError('')
    try {
      const data = await action()
      if (mounted.current) onComplete(data)
    } catch (failure) {
      if (mounted.current) setError(adminError(failure, scope, operation))
    } finally {
      running.current = false
      if (mounted.current) setBusy(false)
    }
  }
  return { busy, error, run }
}
