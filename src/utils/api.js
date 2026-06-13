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
