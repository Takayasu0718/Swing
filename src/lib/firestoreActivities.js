// Firestore-backed activities. Path: activities/{id}.
// userId = 投稿者の auth uid。teamId はオプション（チーム文脈を持つ活動）。

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  getDoc,
} from 'firebase/firestore'
import { db, authReady } from './firebase.js'
import { createFsNotification } from './firestoreNotifications.js'

async function fetchNickname(uid) {
  if (!db || !uid) return ''
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    return snap.exists() ? snap.data().nickname || '' : ''
  } catch {
    return ''
  }
}

function tsToIso(ts) {
  if (ts && typeof ts.toDate === 'function') return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return null
}

function shape(doc) {
  const data = doc.data()
  return {
    id: doc.id,
    source: 'fs',
    userId: data.userId,
    type: data.type,
    content: data.content || '',
    teamId: data.teamId ?? null,
    likeUserIds: data.likeUserIds || [],
    createdAt: tsToIso(data.createdAt) || new Date().toISOString(),
  }
}

export async function createFsActivity({ type, content, teamId }) {
  if (!db || !type) return null
  const myUid = await authReady
  if (!myUid) return null
  try {
    const ref = await addDoc(collection(db, 'activities'), {
      userId: myUid,
      type,
      content: content || '',
      teamId: teamId || null,
      likeUserIds: [],
      createdAt: serverTimestamp(),
    })
    return ref.id
  } catch (e) {
    console.error('[firestoreActivities] create failed', e)
    return null
  }
}

export function subscribeActivitiesByUids(uids, callback) {
  if (!db || !Array.isArray(uids) || uids.length === 0) {
    callback([])
    return () => {}
  }
  // Firestore `in` allows up to 30 values
  const q = query(collection(db, 'activities'), where('userId', 'in', uids.slice(0, 30)))
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(shape)
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      callback(items)
    },
    (err) => console.error('[firestoreActivities] uids listener failed', err),
  )
}

export function subscribeActivitiesByTeam(teamId, callback) {
  if (!db || !teamId) {
    callback([])
    return () => {}
  }
  const q = query(collection(db, 'activities'), where('teamId', '==', teamId))
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map(shape)
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      callback(items)
    },
    (err) => console.error('[firestoreActivities] team listener failed', err),
  )
}

export async function toggleFsActivityLike(activityId, uid) {
  if (!db || !activityId || !uid) return
  await authReady
  try {
    const ref = doc(db, 'activities', activityId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const data = snap.data()
    const liked = (data.likeUserIds || []).includes(uid)
    await updateDoc(ref, {
      likeUserIds: liked ? arrayRemove(uid) : arrayUnion(uid),
    })
    // 「いいね」した瞬間（unliked → liked）かつ自分の投稿でない時に投稿者へ通知
    if (!liked && data.userId && data.userId !== uid) {
      const likerName = await fetchNickname(uid)
      await createFsNotification({
        userId: data.userId,
        type: 'like',
        content: `${likerName || '誰か'}さんがあなたのアクティビティにいいねしました`,
        activityId,
      })
    }
  } catch (e) {
    console.error('[firestoreActivities] toggleLike failed', e)
  }
}
