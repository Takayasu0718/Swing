// Firestore-backed team chat. Path: teams/{teamId}/messages/{messageId}.
// 直近 N 件のみ getDocs で 1 ショット取得。古い分は pruneOldChats で削除。

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  getDoc,
  getDocs,
} from 'firebase/firestore'
import { db, authReady } from './firebase.js'
import { createLikeNotification } from './firestoreNotifications.js'

function tsToIso(ts) {
  if (ts && typeof ts.toDate === 'function') return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return null
}

function shapeChat(d, teamId) {
  const data = d.data()
  return {
    id: d.id,
    teamId,
    userId: data.userId,
    content: data.content,
    likeUserIds: data.likeUserIds || [],
    createdAt: tsToIso(data.createdAt) || new Date().toISOString(),
  }
}

// 直近 N 件のチャットを 1 回だけ取得（onSnapshot 不使用）。
// 戻り値の lastDoc を渡して startAfter ベースで続きを取得できる。
// 注意: 取得結果は createdAt 降順（新→古）。表示時に必要なら反転すること。
export async function fetchRecentChats(teamId, limitCount, startAfterDoc = null) {
  if (!db || !teamId || !limitCount) {
    return { items: [], lastDoc: null }
  }
  await authReady
  try {
    const constraints = [orderBy('createdAt', 'desc')]
    if (startAfterDoc) constraints.push(startAfter(startAfterDoc))
    constraints.push(limit(limitCount))
    const q = query(collection(db, 'teams', teamId, 'messages'), ...constraints)
    const snap = await getDocs(q)
    const items = snap.docs.map((d) => shapeChat(d, teamId))
    const lastDoc = snap.docs[snap.docs.length - 1] || null
    return { items, lastDoc }
  } catch (e) {
    console.error('[firestoreChats] fetchRecent failed', e)
    return { items: [], lastDoc: null }
  }
}

// keep 件より古いチームチャットを削除する。チームメンバーのみ実行可能
// （Firestore ルールでチームメンバーに delete 権限が必要）。
export async function pruneOldChats(teamId, keep) {
  if (!db || !teamId || !keep) return
  await authReady
  try {
    const initial = query(
      collection(db, 'teams', teamId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(keep),
    )
    const initialSnap = await getDocs(initial)
    if (initialSnap.docs.length < keep) return
    let cursor = initialSnap.docs[initialSnap.docs.length - 1]
    let totalDeleted = 0
    // 100 件ずつバッチで取得＆削除（暴走防止に最大 10 周）
    for (let i = 0; i < 10; i++) {
      const olderQ = query(
        collection(db, 'teams', teamId, 'messages'),
        orderBy('createdAt', 'desc'),
        startAfter(cursor),
        limit(100),
      )
      const olderSnap = await getDocs(olderQ)
      if (olderSnap.empty) break
      await Promise.all(olderSnap.docs.map((d) => deleteDoc(d.ref)))
      totalDeleted += olderSnap.docs.length
      if (olderSnap.docs.length < 100) break
      cursor = olderSnap.docs[olderSnap.docs.length - 1]
    }
    if (totalDeleted > 0) console.log(`[firestoreChats] pruned ${totalDeleted} old chats`)
  } catch (e) {
    console.error('[firestoreChats] prune failed', e)
  }
}

export async function postFsChat(teamId, content) {
  const uid = await authReady
  if (!uid || !db || !teamId || !content?.trim()) return null
  try {
    const ref = await addDoc(collection(db, 'teams', teamId, 'messages'), {
      userId: uid,
      content: content.trim(),
      likeUserIds: [],
      createdAt: serverTimestamp(),
    })
    console.log('[firestoreChats] posted', ref.id)
    return ref.id
  } catch (e) {
    console.error('[firestoreChats] post failed', e)
    return null
  }
}

// 自分の投稿だけ削除する UI 用。Firestore ルールではチームメンバーなら誰でも
// delete 可能（prune 兼用のため）なので、呼び出し側で投稿者チェックを行うこと。
export async function deleteFsChatMessage(teamId, messageId) {
  if (!db || !teamId || !messageId) return false
  await authReady
  try {
    await deleteDoc(doc(db, 'teams', teamId, 'messages', messageId))
    return true
  } catch (e) {
    console.error('[firestoreChats] delete failed', e)
    return false
  }
}

export async function toggleFsChatLike(teamId, messageId, uid) {
  if (!db || !teamId || !messageId || !uid) return
  await authReady
  try {
    const ref = doc(db, 'teams', teamId, 'messages', messageId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const data = snap.data()
    const liked = (data.likeUserIds || []).includes(uid)
    await updateDoc(ref, {
      likeUserIds: liked ? arrayRemove(uid) : arrayUnion(uid),
    })
    // 「いいね」した瞬間（=未liked→liked）かつ自分のメッセージでない時に通知
    if (!liked && data.userId && data.userId !== uid) {
      await createLikeNotification({
        recipientUid: data.userId,
        likeTargetKey: `chat:${teamId}:${messageId}`,
      })
    }
  } catch (e) {
    console.error('[firestoreChats] toggle like failed', e)
  }
}
