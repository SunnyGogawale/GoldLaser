import { DATE_FORMAT } from '../config/date-format'

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

  const mm = String(date.getMonth() + 1).padStart(DATE_FORMAT.monthDigits, '0')
  const dd = String(date.getDate()).padStart(DATE_FORMAT.dayDigits, '0')
  const yyyy = date.getFullYear()
  return `${mm}${DATE_FORMAT.monthDaySeparator}${dd}${DATE_FORMAT.monthDaySeparator}${yyyy}`
}

export const formatDateTimeMMDDYYYY = (value, fallback = '-') => {
  const dateText = formatDateMMDDYYYY(value, fallback)
  if (dateText === fallback) return fallback

  const date = new Date(value)
  if (!date || Number.isNaN(date.getTime())) return dateText

  return `${dateText}${DATE_FORMAT.dateTimeSeparator}${date.toLocaleTimeString('en-US')}`
}
