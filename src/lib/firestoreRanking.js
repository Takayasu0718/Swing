// Friend ranking: aggregate each user's last-7-day swing total from Firestore activities.

import { collection, getDocs } from 'firebase/firestore'
import { db, authReady } from './firebase.js'

async function fetchUserLast7Sum(uid) {
  if (!db || !uid) return 0
  const since = Date.now() - 7 * 24 * 3600 * 1000
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'activities'))
    let total = 0
    snap.docs.forEach((d) => {
      const data = d.data()
      if (data.type !== 'swing') return
      if (!Number.isFinite(data.swingCount)) return
      let ts = null
      if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        ts = data.createdAt.toDate().getTime()
      } else if (data.date) {
        ts = new Date(`${data.date}T12:00:00`).getTime()
      }
      if (ts && ts >= since) total += data.swingCount
    })
    return total
  } catch (e) {
    console.error('[ranking] fetch failed for', uid, e)
    return 0
  }
}

// 各メンバーの直近7日の素振り達成日（YYYY-MM-DD）集合を返す。
async function fetchUserLast7Dates(uid) {
  if (!db || !uid) return new Set()
  const since = Date.now() - 7 * 24 * 3600 * 1000
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'activities'))
    const dates = new Set()
    snap.docs.forEach((d) => {
      const data = d.data()
      if (data.type !== 'swing') return
      let key = null
      if (typeof data.date === 'string') {
        key = data.date
      } else if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        key = data.createdAt.toDate().toISOString().slice(0, 10)
      }
      if (!key) return
      const ts = new Date(`${key}T12:00:00`).getTime()
      if (ts >= since) dates.add(key)
    })
    return dates
  } catch (e) {
    console.error('[stats] fetch dates failed for', uid, e)
    return new Set()
  }
}

// チーム達成率: 本日達成率と直近7日達成率を { todayRate, weekRate } (0..1) で返す。
// uids = 分母に含めるメンバーの uid（体験ロール除外推奨）。
export async function loadTeamAchievementStats(uids) {
  if (!db) return { todayRate: 0, weekRate: 0 }
  await authReady
  if (!Array.isArray(uids) || uids.length === 0) {
    return { todayRate: 0, weekRate: 0 }
  }
  const today = new Date().toISOString().slice(0, 10)
  const memberDateSets = await Promise.all(uids.map((u) => fetchUserLast7Dates(u)))
  const todayAchievers = memberDateSets.filter((s) => s.has(today)).length
  const weekAchievements = memberDateSets.reduce((sum, s) => sum + s.size, 0)
  const n = uids.length
  return {
    todayRate: todayAchievers / n,
    weekRate: weekAchievements / (n * 7),
  }
}

// uids は集計対象（自分含む）の uid 配列。profilesByUid は { uid: { nickname, avatarStamp } } のマップ。
export async function loadFriendRanking(uids, profilesByUid = {}) {
  if (!db) return []
  await authReady
  if (!Array.isArray(uids) || uids.length === 0) return []
  const sums = await Promise.all(uids.map((u) => fetchUserLast7Sum(u)))
  return uids
    .map((uid, i) => {
      const profile = profilesByUid[uid] || {}
      return {
        uid,
        nickname: profile.nickname || uid.slice(0, 6),
        avatarStamp: profile.avatarStamp || '',
        totalSwing: sums[i],
      }
    })
    .sort((a, b) => b.totalSwing - a.totalSwing)
}
