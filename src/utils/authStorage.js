import { API_BASE_URL, apiFetch } from './api'

const AUTH_KEYS = ['userRole', 'userFullName', 'userEmail', 'lastActivityAt']

const storage = () => window.sessionStorage

if (typeof window !== 'undefined') {
  window.sessionStorage.removeItem('token')
  window.localStorage.removeItem('token')
}

export const getAuthValue = (key) => key === 'token' ? '' : storage().getItem(key) || ''

export const setAuthValue = (key, value) => {
  if (key === 'token') return
  storage().setItem(key, String(value ?? ''))
}

export const setAuthSession = ({ role, roll, fullName, email }) => {
  storage().removeItem('token')
  window.localStorage.removeItem('token')
  setAuthValue('userRole', role || roll || 'user')
  setAuthValue('userFullName', fullName)
  setAuthValue('userEmail', email)

  for (const key of AUTH_KEYS) {
    window.localStorage.removeItem(key)
  }
}

export const clearAuthSession = () => {
  for (const key of AUTH_KEYS) {
    storage().removeItem(key)
    window.localStorage.removeItem(key)
  }
  storage().removeItem('token')
  window.localStorage.removeItem('token')
}

export const markSessionActivity = () => {
  setAuthValue('lastActivityAt', Date.now())
}

export const getLastActivityAt = () => Number(getAuthValue('lastActivityAt') || 0)

export const recordLogout = () => {
  apiFetch(`${API_BASE_URL}/api/auth/logout`, {
    method: 'POST',
    keepalive: true
  }).catch(() => {})
}
