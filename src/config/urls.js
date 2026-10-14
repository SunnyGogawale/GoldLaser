const mode = import.meta.env.MODE || (import.meta.env.DEV ? 'development' : 'production')

const apiBaseUrls = {
  development: import.meta.env.VITE_API_URL || 'http://localhost:5001',
  staging: import.meta.env.VITE_STAGING_API_URL || import.meta.env.VITE_API_URL || '',
  production: import.meta.env.VITE_PRODUCTION_API_URL || import.meta.env.VITE_API_URL || ''
}

export const APP_ENVIRONMENT = mode
export const API_BASE_URL = apiBaseUrls[mode] ?? import.meta.env.VITE_API_URL ?? ''
export const APP_BASE_URL = typeof window === 'undefined' ? '' : window.location.origin
export const buildApiUrl = (path) => `${API_BASE_URL}${path}`
