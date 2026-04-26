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
