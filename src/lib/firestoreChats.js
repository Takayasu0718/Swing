// Firestore-backed team chat. Path: teams/{teamId}/messages/{messageId}.
// Real-time subscription, post, like toggle. Sorted by createdAt asc.

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  getDoc,
} from 'firebase/firestore'
import { db, authReady } from './firebase.js'

function tsToIso(ts) {
  if (ts && typeof ts.toDate === 'function') return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return null
}

export function subscribeChats(teamId, callback) {
  if (!db || !teamId) {
    callback([])
    return () => {}
  }
  const q = query(
    collection(db, 'teams', teamId, 'messages'),
    orderBy('createdAt', 'asc'),
  )
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          teamId,
          userId: data.userId,
          content: data.content,
          likeUserIds: data.likeUserIds || [],
          createdAt: tsToIso(data.createdAt) || new Date().toISOString(),
        }
      })
      callback(items)
    },
    (err) => console.error('[firestoreChats] listener failed', err),
  )
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

export async function toggleFsChatLike(teamId, messageId, uid) {
  if (!db || !teamId || !messageId || !uid) return
  await authReady
  try {
    const ref = doc(db, 'teams', teamId, 'messages', messageId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const liked = (snap.data().likeUserIds || []).includes(uid)
    await updateDoc(ref, {
      likeUserIds: liked ? arrayRemove(uid) : arrayUnion(uid),
    })
  } catch (e) {
    console.error('[firestoreChats] toggle like failed', e)
  }
}
