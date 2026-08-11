export function getThreadDayKey(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function formatThreadDayLabel(timestamp: number, labels?: { today: string; yesterday: string; formatDate: (date: Date) => string }) {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (getThreadDayKey(timestamp) === getThreadDayKey(today.getTime())) return labels?.today ?? 'Today'
  if (getThreadDayKey(timestamp) === getThreadDayKey(yesterday.getTime())) return labels?.yesterday ?? 'Yesterday'

  if (labels?.formatDate) return labels.formatDate(date)

  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  })
}
