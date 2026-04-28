// Firestore-backed notifications. Path: notifications/{notifId}.
// userId = 受信者の uid。fromUserId = 送信者(=書き手)の auth.uid。
// 受信者のみが read/update/delete 可能。書き手は自身の uid でしか create できない。

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
  getDocs,
} from 'firebase/firestore'
import { db, authReady, getAuthUid } from './firebase.js'

function tsToIso(ts) {
  if (ts && typeof ts.toDate === 'function') return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return null
}

export async function createFsNotification(data) {
  if (!db || !data?.userId || !data?.type) return null
  const myUid = await authReady
  if (!myUid) return null
  try {
    const ref = await addDoc(collection(db, 'notifications'), {
      userId: data.userId,
      type: data.type,
      fromUserId: data.fromUserId || myUid,
      content: data.content || '',
      activityId: data.activityId ?? null,
      requestId: data.requestId ?? null,
      likeUserIds: [],
      read: false,
      createdAt: serverTimestamp(),
    })
    return ref.id
  } catch (e) {
    console.error('[firestoreNotifications] create failed', e)
    return null
  }
}

export function subscribeMyFsNotifications(myUid, callback) {
  if (!db || !myUid) {
    callback([])
    return () => {}
  }
  const q = query(collection(db, 'notifications'), where('userId', '==', myUid))
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          source: 'fs',
          userId: data.userId,
          type: data.type,
          fromUserId: data.fromUserId,
          content: data.content,
          activityId: data.activityId ?? null,
          requestId: data.requestId ?? null,
          likeUserIds: data.likeUserIds || [],
          read: !!data.read,
          createdAt: tsToIso(data.createdAt) || new Date().toISOString(),
        }
      })
      items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      callback(items)
    },
    (err) => console.error('[firestoreNotifications] listener failed', err),
  )
}

export async function markReadFsNotification(notifId) {
  if (!db || !notifId) return
  await authReady
  try {
    await updateDoc(doc(db, 'notifications', notifId), { read: true })
  } catch (e) {
    console.error('[firestoreNotifications] markRead failed', e)
  }
}

export async function markAllReadFsNotifications(myUid) {
  if (!db || !myUid) return
  await authReady
  try {
    const snap = await getDocs(
      query(
        collection(db, 'notifications'),
        where('userId', '==', myUid),
        where('read', '==', false),
      ),
    )
    await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { read: true })))
  } catch (e) {
    console.error('[firestoreNotifications] markAllRead failed', e)
  }
}

export async function toggleLikeFsNotification(notifId, uid) {
  if (!db || !notifId || !uid) return
  await authReady
  try {
    const ref = doc(db, 'notifications', notifId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const liked = (snap.data().likeUserIds || []).includes(uid)
    await updateDoc(ref, {
      likeUserIds: liked ? arrayRemove(uid) : arrayUnion(uid),
    })
  } catch (e) {
    console.error('[firestoreNotifications] toggleLike failed', e)
  }
}

export function getMyAuthUid() {
  return getAuthUid()
}
