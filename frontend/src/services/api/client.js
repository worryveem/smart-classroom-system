import axios from 'axios'
import { clearAccessToken, getAccessToken, tokenExpiresAt } from '../../features/auth/authSession.js'

// All application requests go through the Spring Boot BFF.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080',
  timeout: 10000,
  withCredentials: false,
})

api.interceptors.request.use(config => {
  const destination = new URL(config.url, config.baseURL || api.defaults.baseURL)
  if (destination.origin !== new URL(api.defaults.baseURL).origin) {
    return Promise.reject(new Error('API requests must use the configured Spring Boot origin'))
  }
  const token = config.skipAuth ? null : getAccessToken()
  if (token) {
    const expiresAt = tokenExpiresAt(token)
    if (!expiresAt || expiresAt <= Date.now()) {
      clearAccessToken('expired', token)
      return Promise.reject(new axios.CanceledError('Session expired'))
    }
    config.headers.set('Authorization', `Bearer ${token}`)
  } else {
    config.headers.delete('Authorization')
  }
  config._authToken = token
  return config
})

api.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && error.config?._authToken) {
    // An old request must not clear a newly established session.
    clearAccessToken('expired', error.config._authToken)
  }
  return Promise.reject(error)
})
