const AUTH_KEYS = ['token', 'userRole', 'userFullName', 'userEmail', 'lastActivityAt']

const storage = () => window.sessionStorage

export const getAuthValue = (key) => storage().getItem(key) || ''

export const getAuthToken = () => getAuthValue('token')

export const setAuthValue = (key, value) => {
  storage().setItem(key, String(value ?? ''))
}

export const setAuthSession = ({ token, role, fullName, email }) => {
  setAuthValue('token', token)
  setAuthValue('userRole', role)
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
}

export const apiFetch = async (input, init = {}) => {
  const requestInput = input instanceof Request
    ? input.url
    : input instanceof URL
      ? input.href
      : input
  const requestUrl = new URL(
    requestInput,
    window.location.origin
  )
  const configuredApiUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')
  const apiOrigin = new URL(configuredApiUrl || window.location.origin, window.location.origin).origin
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined))
  const token = getAuthToken()

  if (token && requestUrl.origin === apiOrigin && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await globalThis.fetch(input, { ...init, headers })
  if (requestUrl.origin === apiOrigin && response.status === 401 && token) {
    clearAuthSession()
    window.dispatchEvent(new Event('auth:unauthorized'))
  }
  return response
}

export const markSessionActivity = () => {
  setAuthValue('lastActivityAt', Date.now())
}

export const getLastActivityAt = () => Number(getAuthValue('lastActivityAt') || 0)

export const recordLogout = () => {
  const token = getAuthToken()
  if (!token) return

  const apiBaseUrl = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5001' : '')
  fetch(`${apiBaseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    keepalive: true
  }).catch(() => {})
}
