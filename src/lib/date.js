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

// 過去含めた最長連続達成日数。
export function computeLongestStreak(userMissions) {
  const dayMs = 24 * 3600 * 1000
  const uniqueDates = Array.from(
    new Set(userMissions.filter((m) => m.completed).map((m) => m.date).filter(Boolean)),
  ).sort()
  let max = 0
  let cur = 0
  let prevTs = null
  for (const d of uniqueDates) {
    const ts = new Date(`${d}T00:00:00`).getTime()
    if (prevTs !== null && Math.round((ts - prevTs) / dayMs) === 1) {
      cur += 1
    } else {
      cur = 1
    }
    if (cur > max) max = cur
    prevTs = ts
  }
  return max
}
