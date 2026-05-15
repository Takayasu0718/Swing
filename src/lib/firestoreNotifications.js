// Firestore-backed notifications. Path: notifications/{notifId}.
// userId = 受信者の uid。fromUserId = 送信者(=書き手)の auth.uid。
// 受信者のみが read/update/delete 可能。書き手は自身の uid でしか create できない。

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
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

async function fetchNickname(uid) {
  if (!db || !uid) return ''
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    return snap.exists() ? snap.data().nickname || '' : ''
  } catch {
    return ''
  }
}

// 通知作成。fromUserId は呼出者から受け取らず必ず myUid を使う（なりすまし防止の
// 二重防御。Firestore ルール側でも auth.uid == fromUserId をチェックしているが、
// クライアント側でも同様に保証する）。
export async function createFsNotification(data) {
  if (!db || !data?.userId || !data?.type) return null
  const myUid = await authReady
  if (!myUid) return null
  try {
    const ref = await addDoc(collection(db, 'notifications'), {
      userId: data.userId,
      type: data.type,
      fromUserId: myUid,
      content: data.content || '',
      activityId: data.activityId ?? null,
      requestId: data.requestId ?? null,
      likeTargetKey: data.likeTargetKey ?? null,
      fromUserNickname: data.fromUserNickname ?? null,
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

// アクティビティ / チャット / 通知へのいいね共通の発火点。
// recipientUid に対して「〇〇さんがいいねをくれました」通知を1件作成する。
// likeTargetKey は NotificationScreen 側で同一対象のいいねを集約するためのキー
// （activity:<id> / chat:<teamId>:<msgId> / notif:<id>）。
// 自分自身のものへの like は通知しない。
export async function createLikeNotification({ recipientUid, likeTargetKey }) {
  if (!db || !recipientUid || !likeTargetKey) return null
  const myUid = await authReady
  if (!myUid || myUid === recipientUid) return null
  const nickname = await fetchNickname(myUid)
  return createFsNotification({
    userId: recipientUid,
    type: 'like',
    content: `${nickname || '誰か'}さんがいいねをくれました`,
    likeTargetKey,
    fromUserNickname: nickname || '',
  })
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
          likeTargetKey: data.likeTargetKey ?? null,
          fromUserNickname: data.fromUserNickname ?? null,
          likeUserIds: data.likeUserIds || [],
          read: !!data.read,
          processed: !!data.processed,
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

// 申請系通知（team_join_request / friend_team_request / friend_request）の
// 承認・拒否完了をドキュメントに永続化する。再マウント後もボタンを再表示させないため。
export async function markProcessedFsNotification(notifId) {
  if (!db || !notifId) return
  await authReady
  try {
    await updateDoc(doc(db, 'notifications', notifId), { processed: true })
  } catch (e) {
    console.error('[firestoreNotifications] markProcessed failed', e)
  }
}

export async function deleteFsNotification(notifId) {
  if (!db || !notifId) return
  await authReady
  try {
    await deleteDoc(doc(db, 'notifications', notifId))
  } catch (e) {
    console.error('[firestoreNotifications] delete failed', e)
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
    const data = snap.data()
    const liked = (data.likeUserIds || []).includes(uid)
    await updateDoc(ref, {
      likeUserIds: liked ? arrayRemove(uid) : arrayUnion(uid),
    })
    // 通知（=祝われた本人の出来事）への like を、本人へ通知。
    // 例: MVP_selected の fromUserId = MVP本人。チームメイトの like がここで本人に届く。
    if (!liked && data.fromUserId && data.fromUserId !== uid) {
      await createLikeNotification({
        recipientUid: data.fromUserId,
        likeTargetKey: `notif:${notifId}`,
      })
    }
  } catch (e) {
    console.error('[firestoreNotifications] toggleLike failed', e)
  }
}

export function getMyAuthUid() {
  return getAuthUid()
}
