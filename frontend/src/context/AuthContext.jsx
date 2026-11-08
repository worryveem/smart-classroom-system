import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import axios from 'axios'
import { currentUserRequest, signInRequest } from '../features/auth/authApi.js'
import { clearAccessToken, getAccessToken, getAuthSnapshot, setAccessToken, subscribeAuth, tokenExpiresAt } from '../features/auth/authSession.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const session = useSyncExternalStore(subscribeAuth, getAuthSnapshot)
  const [auth, setAuth] = useState(() => ({ status: session.token ? 'checking' : 'anonymous', user: null }))
  const [retry, setRetry] = useState(0)
  const loginOperation = useRef(0)
  const loginController = useRef(null)

  useEffect(() => {
    const token = session.token
    if (!token) {
      setAuth({ status: 'anonymous', user: null })
      return
    }
    const expiresAt = tokenExpiresAt(token)
    if (!expiresAt || expiresAt <= Date.now()) {
      clearAccessToken('expired', token)
      return
    }
    let disposed = false
    let controller
    let expiryTimer
    let sequence = 0
    function scheduleExpiry() {
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) clearAccessToken('expired', token)
      else expiryTimer = setTimeout(scheduleExpiry, Math.min(remaining, 2147483647))
    }
    async function verify(background = false) {
      controller?.abort()
      controller = new AbortController()
      const current = ++sequence
      if (!background) setAuth({ status: 'checking', user: null })
      try {
        const user = await currentUserRequest(controller.signal)
        if (!disposed && current === sequence && getAccessToken() === token) setAuth({ status: 'authenticated', user })
      } catch (error) {
        if (disposed || current !== sequence || axios.isCancel(error) || getAccessToken() !== token) return
        // Network/server failures do not mean that credentials are invalid.
        setAuth({ status: 'error', user: null })
      }
    }
    function onVisible() { if (document.visibilityState === 'visible') verify(true) }
    verify()
    scheduleExpiry()
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      disposed = true
      controller?.abort()
      clearTimeout(expiryTimer)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [session.token, retry])

  useEffect(() => () => { loginController.current?.abort(); loginOperation.current++ }, [])

  const login = useCallback(async (username, password) => {
    loginController.current?.abort()
    loginController.current = new AbortController()
    const operation = ++loginOperation.current
    const token = await signInRequest(username, password, loginController.current.signal)
    if (operation !== loginOperation.current) return
    setAuth({ status: 'checking', user: null })
    setAccessToken(token)
  }, [])

  const logout = useCallback(() => {
    loginOperation.current++
    loginController.current?.abort()
    clearAccessToken('logout')
    setAuth({ status: 'anonymous', user: null })
  }, [])

  const currentAuth = session.token ? auth : { status: 'anonymous', user: null }
  const value = { ...currentAuth, reason: session.reason, login, logout, retry: () => setRetry(value => value + 1) }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside AuthProvider')
  return auth
}
