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

export const readJsonResponse = async (response, fallbackMessage) => {
  const raw = await response.text()
  let data = null

  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = null
  }

  if (!response.ok) {
    const safeMessage = sanitizeClientErrorMessage(data?.message || raw || fallbackMessage || `Request failed (${response.status})`, fallbackMessage)
    throw new Error(safeMessage)
  }

  return data || {}
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
