export const formatDateMMDDYYYY = (value, fallback = '-') => {
  if (!value) return fallback

  let date
  if (typeof value === 'string') {
    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch
      date = new Date(Number(year), Number(month) - 1, Number(day))
    } else {
      date = new Date(value)
    }
  } else {
    date = new Date(value)
  }

  if (!date || Number.isNaN(date.getTime())) return fallback

  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${mm}-${dd}-${yyyy}`
}

export const formatDateTimeMMDDYYYY = (value, fallback = '-') => {
  const dateText = formatDateMMDDYYYY(value, fallback)
  if (dateText === fallback) return fallback

  const date = new Date(value)
  if (!date || Number.isNaN(date.getTime())) return dateText

  return `${dateText} ${date.toLocaleTimeString('en-US')}`
}
