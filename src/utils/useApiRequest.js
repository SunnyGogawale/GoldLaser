import { useCallback, useEffect, useRef, useState } from 'react'
import { APP_CONFIG } from '../config/app-config'

export const DEFAULT_API_DEBOUNCE_MS = APP_CONFIG.apiDebounceMs

export const useDebouncedValue = (value, delay = DEFAULT_API_DEBOUNCE_MS) => {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

export const useLatestAbortController = () => {
  const controllerRef = useRef(null)

  const startRequest = useCallback(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    return controller
  }, [])

  useEffect(() => () => controllerRef.current?.abort(), [])

  return startRequest
}
