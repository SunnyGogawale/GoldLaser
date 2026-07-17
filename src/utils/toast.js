import { toast } from 'react-toastify'

/**
 * Show a success toast notification
 * @param {string} message - The message to display
 * @param {object} options - Additional toast options
 */
export const showSuccessToast = (message, options = {}) => {
  toast.success(message, {
    position: 'top-right',
    autoClose: 3000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options
  })
}

/**
 * Show an error toast notification
 * @param {string} message - The message to display
 * @param {object} options - Additional toast options
 */
export const showErrorToast = (message, options = {}) => {
  toast.error(message, {
    position: 'top-right',
    autoClose: 4000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options
  })
}

/**
 * Show a warning toast notification
 * @param {string} message - The message to display
 * @param {object} options - Additional toast options
 */
export const showWarningToast = (message, options = {}) => {
  toast.warning(message, {
    position: 'top-right',
    autoClose: 3000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options
  })
}

/**
 * Show an info toast notification
 * @param {string} message - The message to display
 * @param {object} options - Additional toast options
 */
export const showInfoToast = (message, options = {}) => {
  toast.info(message, {
    position: 'top-right',
    autoClose: 3000,
    hideProgressBar: false,
    closeOnClick: true,
    pauseOnHover: true,
    draggable: true,
    ...options
  })
}

/**
 * Handle API error and show appropriate toast
 * @param {Error|object} error - The error object or response
 * @param {string} fallbackMessage - Default message if no error message found
 */
export const handleApiError = (error, fallbackMessage = 'An error occurred. Please try again.') => {
  let message = fallbackMessage

  if (error?.message) {
    message = error.message
  } else if (error?.response?.data?.message) {
    message = error.response.data.message
  } else if (error?.response?.data) {
    message = typeof error.response.data === 'string' ? error.response.data : fallbackMessage
  } else if (typeof error === 'string') {
    message = error
  }

  showErrorToast(message)
  return message
}
