import { showErrorToast } from './toast'

export const readJsonResponse = async (response, fallbackMessage) => {
  const raw = await response.text()
  let data = null

  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = null
  }

  if (!response.ok) {
    throw new Error(data?.message || raw || fallbackMessage || `Request failed (${response.status})`)
  }

  return data || {}
}

export const readErrorMessage = async (response, fallbackMessage) => {
  const raw = await response.text().catch(() => '')
  try {
    const data = raw ? JSON.parse(raw) : null
    return data?.message || raw || fallbackMessage
  } catch {
    return raw || fallbackMessage
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
