// 5日連続未達成ごとに -1pt のペナルティをバッティングステータス全項目に適用。
// ペナルティ適用回数は user.battingStatusPenaltyCount で重複適用防止。
// 達成すれば claimMission 内でカウンタが 0 にリセットされる。

import { users, missions } from '../storage/storage.js'
import { todayKey } from './date.js'
import { BATTING_STATUS_KEYS, BATTING_PENALTY_INTERVAL_DAYS } from '../storage/schema.js'

function lastAchievementDate(userMissions) {
  const completed = userMissions.filter((m) => m.completed && m.date)
  if (completed.length === 0) return null
  // YYYY-MM-DD は文字列ソートで時系列ソート可能
  return completed.map((m) => m.date).sort().reverse()[0]
}

// 「昨日まで」の連続未達成日数（今日は除外。日が変わってない時に判定するため）
function consecutiveMissedDays(userMissions) {
  const last = lastAchievementDate(userMissions)
  if (!last) return 0 // 達成記録なしならペナルティ対象外
  const lastTs = new Date(`${last}T00:00:00`).getTime()
  const todayTs = new Date(`${todayKey()}T00:00:00`).getTime()
  const dayMs = 24 * 3600 * 1000
  // 例: 最終達成 5/1, 今日 5/8 → 昨日 5/7 → 5/2..5/7 の 6 日間 missed
  const yesterdayTs = todayTs - dayMs
  if (yesterdayTs <= lastTs) return 0
  return Math.round((yesterdayTs - lastTs) / dayMs)
}

export function applyMissPenaltyIfNeeded(userId) {
  if (!userId) return
  const user = users.get(userId)
  if (!user) return
  const ms = missions.listByUser(userId)
  const missed = consecutiveMissedDays(ms)
  const dueCount = Math.floor(missed / BATTING_PENALTY_INTERVAL_DAYS)
  const appliedCount = user.battingStatusPenaltyCount || 0
  if (dueCount <= appliedCount) return
  const pendingPenalty = dueCount - appliedCount
  const deltas = {}
  for (const item of BATTING_STATUS_KEYS) {
    deltas[item.key] = -pendingPenalty // addBattingPoints は 0 で下限クランプ
  }
  users.addBattingPoints(userId, deltas)
  users.setBattingPenaltyCount(userId, dueCount)
  console.log('[battingPenalty] applied', { userId, missed, dueCount, appliedCount, pendingPenalty })
}
