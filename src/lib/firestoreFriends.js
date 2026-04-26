// Firestore-backed friend operations: search, send/accept/decline requests, live subscription.
// Each pair of users gets a single friendship doc with id = `${minUid}_${maxUid}`.

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db, authReady, getAuthUid } from './firebase.js'

function pairId(a, b) {
  return [a, b].sort().join('_')
}

export async function searchAllUsers() {
  if (!db) return []
  await authReady
  try {
    const snap = await getDocs(collection(db, 'users'))
    return snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
  } catch (e) {
    console.error('[firestoreFriends] search failed', e)
    return []
  }
}

export async function fetchUserProfile(uid) {
  if (!db || !uid) return null
  await authReady
  try {
    const snap = await getDoc(doc(db, 'users', uid))
    return snap.exists() ? { uid: snap.id, ...snap.data() } : null
  } catch (e) {
    console.error('[firestoreFriends] fetch profile failed', e)
    return null
  }
}

export async function sendFriendRequestFs(toUid) {
  if (!db || !toUid) return null
  const myUid = await authReady
  if (!myUid || myUid === toUid) return null
  const id = pairId(myUid, toUid)
  try {
    await setDoc(doc(db, 'friendships', id), {
      fromUid: myUid,
      toUid,
      participants: [myUid, toUid],
      status: 'pending',
      createdAt: serverTimestamp(),
    })
    console.log('[firestoreFriends] request sent', id)
    return id
  } catch (e) {
    console.error('[firestoreFriends] send request failed', e)
    return null
  }
}

export async function acceptFriendRequestFs(friendshipId) {
  if (!db || !friendshipId) return
  await authReady
  try {
    await updateDoc(doc(db, 'friendships', friendshipId), {
      status: 'accepted',
      acceptedAt: serverTimestamp(),
    })
    console.log('[firestoreFriends] accepted', friendshipId)
  } catch (e) {
    console.error('[firestoreFriends] accept failed', e)
  }
}

export async function declineFriendRequestFs(friendshipId) {
  if (!db || !friendshipId) return
  await authReady
  try {
    await deleteDoc(doc(db, 'friendships', friendshipId))
    console.log('[firestoreFriends] declined', friendshipId)
  } catch (e) {
    console.error('[firestoreFriends] decline failed', e)
  }
}

// Subscribe to friendships involving the current user. Calls callback with list on every change.
export function subscribeFriendships(myUid, callback) {
  if (!db || !myUid) return () => {}
  const q = query(
    collection(db, 'friendships'),
    where('participants', 'array-contains', myUid),
  )
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      callback(items)
    },
    (err) => {
      console.error('[firestoreFriends] listener failed', err)
    },
  )
}

export function getCurrentAuthUid() {
  return getAuthUid()
}
