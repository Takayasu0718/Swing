export function formatDate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayKey() {
  return formatDate(new Date())
}

export function addDays(date, delta) {
  const d = new Date(date)
  d.setDate(d.getDate() + delta)
  return d
}

// Number of consecutive achievement days ending at today or yesterday.
export function computeStreak(userMissions) {
  const byDate = {}
  for (const m of userMissions) byDate[m.date] = m.completed

  const today = todayKey()
  let cursor = new Date()
  if (!byDate[today]) cursor = addDays(cursor, -1)

  let streak = 0
  while (byDate[formatDate(cursor)]) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

export function countAchievementDays(userMissions) {
  return userMissions.filter((m) => m.completed).length
}
