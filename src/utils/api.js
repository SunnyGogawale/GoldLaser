import { showErrorToast } from './toast'

export const sanitizeClientErrorMessage = (message, fallbackMessage = 'An error occurred') => {
  if (typeof message !== 'string') return fallbackMessage
  const cleaned = message.trim()
  if (!cleaned) return fallbackMessage
  if (/stack trace|traceback|at\s+/.test(cleaned) || /\/Users\//.test(cleaned) || /\/Applications\//.test(cleaned) || /mongodb|mongoose|mongo|e11000|duplicate key|collection/i.test(cleaned)) {
    return fallbackMessage
  }
  return cleaned
}

const parseJson = (raw) => {
  try {
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const readJsonResponse = async (response, fallbackMessage) => {
  const raw = await response.text()
  const data = parseJson(raw)

  if (!response.ok) {
    const safeMessage = sanitizeClientErrorMessage(data?.message || raw || fallbackMessage || `Request failed (${response.status})`, fallbackMessage)
    throw new Error(safeMessage)
  }

  return data || {}
}

const normalizePdfLogo = (settings = {}) => {
  const logoData = settings.companyLogo
  if (!logoData || /^data:image\/(png|jpe?g);base64,/i.test(logoData)) return Promise.resolve(settings)
  if (typeof Image === 'undefined' || typeof document === 'undefined') return Promise.resolve(settings)

  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => {
      try {
        const maxDimension = 1200
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
        const context = canvas.getContext('2d')
        if (!context) return resolve(settings)

        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve({ ...settings, companyLogo: canvas.toDataURL('image/png') })
      } catch {
        resolve(settings)
      }
    }
    image.onerror = () => resolve(settings)
    image.src = logoData
  })
}

export const refreshCompanySettings = async (apiBaseUrl, cachedSettings = {}) => {
  try {
    const response = await fetch(`${apiBaseUrl}/api/company-settings`)
    const data = await readJsonResponse(response, 'Error fetching company settings')
    return normalizePdfLogo(data.settings || cachedSettings)
  } catch (error) {
    console.warn('Unable to refresh company settings; using cached settings for PDF.', error)
    return normalizePdfLogo(cachedSettings)
  }
}

export const readErrorMessage = async (response, fallbackMessage) => {
  const raw = await response.text().catch(() => '')
  try {
    const data = raw ? JSON.parse(raw) : null
    return sanitizeClientErrorMessage(data?.message || raw || fallbackMessage, fallbackMessage)
  } catch {
    return sanitizeClientErrorMessage(raw || fallbackMessage, fallbackMessage)
  }
}

/**
 * Extract error message from response and show toast
 * @param {Response} response - The API response object
 * @param {string} fallbackMessage - Default message if no error found
 * @returns {Promise<string>} The error message that was displayed
 */
export const readErrorMessageWithToast = async (response, fallbackMessage = 'An error occurred') => {
  const message = await readErrorMessage(response, fallbackMessage)
  showErrorToast(message)
  return message
}

/**
 * Handle fetch errors and show toast notification
 * @param {Error} error - The error object
 * @param {string} fallbackMessage - Default message if error message is empty
 * @returns {string} The error message that was displayed
 */
export const handleFetchError = (error, fallbackMessage = 'An error occurred') => {
  const message = error?.message || fallbackMessage
  showErrorToast(message)
  return message
}
