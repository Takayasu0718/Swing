// 20:00 reminder: if today's mission is not completed and the user hasn't been
// reminded yet today, create a notification. Idempotent via localStorage flag.

import { ROLES } from '../storage/schema.js'
import { missions, notifications, settings } from '../storage/storage.js'
import { todayKey } from './date.js'

export const REMINDER_HOUR = 20
const FLAG_PREFIX = 'swing-app:v1:reminder:'

export function maybeFireGoalReminder(user) {
  if (!user || user.role !== ROLES.PLAYER) return
  const now = new Date()
  if (now.getHours() < REMINDER_HOUR) return

  const date = todayKey()
  const mission = missions.get(user.id, date)
  if (mission?.completed) return

  const flagKey = `${FLAG_PREFIX}${user.id}:${date}`
  if (typeof localStorage !== 'undefined' && localStorage.getItem(flagKey)) return

  const userSettings = settings.get(user.id)
  if (userSettings.notifications?.goal_reminder === false) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(flagKey, '1')
    return
  }

  notifications.create({
    userId: user.id,
    type: 'goal_reminder',
    fromUserId: null,
    content: '本日の素振り目標を達成しよう！',
    read: false,
  })
  if (typeof localStorage !== 'undefined') localStorage.setItem(flagKey, '1')
}
