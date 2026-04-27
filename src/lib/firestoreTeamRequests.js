// Firestore-backed team requests (join, friend_team).

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
} from 'firebase/firestore'
import { db, authReady } from './firebase.js'

export async function sendFsJoinRequest(teamId) {
  const uid = await authReady
  if (!uid || !db || !teamId) return null
  try {
    const dup = await getDocs(
      query(
        collection(db, 'teamRequests'),
        where('teamId', '==', teamId),
        where('fromUid', '==', uid),
        where('kind', '==', 'join'),
        where('status', '==', 'pending'),
      ),
    )
    if (!dup.empty) return dup.docs[0].id
    const ref = await addDoc(collection(db, 'teamRequests'), {
      teamId,
      fromUid: uid,
      fromTeamId: null,
      kind: 'join',
      status: 'pending',
      createdAt: serverTimestamp(),
    })
    console.log('[teamRequests] join sent', ref.id)
    return ref.id
  } catch (e) {
    console.error('[teamRequests] join send failed', e)
    return null
  }
}

export async function sendFsFriendTeamRequest(fromTeamId, toTeamId) {
  const uid = await authReady
  if (!uid || !db || !fromTeamId || !toTeamId || fromTeamId === toTeamId) return null
  try {
    const dup = await getDocs(
      query(
        collection(db, 'teamRequests'),
        where('teamId', '==', toTeamId),
        where('fromTeamId', '==', fromTeamId),
        where('kind', '==', 'friend_team'),
        where('status', '==', 'pending'),
      ),
    )
    if (!dup.empty) return dup.docs[0].id
    const ref = await addDoc(collection(db, 'teamRequests'), {
      teamId: toTeamId,
      fromUid: uid,
      fromTeamId,
      kind: 'friend_team',
      status: 'pending',
      createdAt: serverTimestamp(),
    })
    console.log('[teamRequests] friend_team sent', ref.id)
    return ref.id
  } catch (e) {
    console.error('[teamRequests] friend_team send failed', e)
    return null
  }
}

export async function acceptFsTeamRequest(requestId) {
  if (!db || !requestId) return
  await authReady
  try {
    const reqRef = doc(db, 'teamRequests', requestId)
    const reqSnap = await getDoc(reqRef)
    if (!reqSnap.exists()) return
    const r = reqSnap.data()
    if (r.kind === 'join') {
      await updateDoc(doc(db, 'teams', r.teamId), {
        memberIds: arrayUnion(r.fromUid),
        updatedAt: serverTimestamp(),
      })
    } else if (r.kind === 'friend_team' && r.fromTeamId) {
      await updateDoc(doc(db, 'teams', r.fromTeamId), {
        friendTeamIds: arrayUnion(r.teamId),
        updatedAt: serverTimestamp(),
      })
      await updateDoc(doc(db, 'teams', r.teamId), {
        friendTeamIds: arrayUnion(r.fromTeamId),
        updatedAt: serverTimestamp(),
      })
    }
    await updateDoc(reqRef, { status: 'accepted', processedAt: serverTimestamp() })
    console.log('[teamRequests] accepted', requestId)
  } catch (e) {
    console.error('[teamRequests] accept failed', e)
  }
}

export async function declineFsTeamRequest(requestId) {
  if (!db || !requestId) return
  await authReady
  try {
    await deleteDoc(doc(db, 'teamRequests', requestId))
    console.log('[teamRequests] declined', requestId)
  } catch (e) {
    console.error('[teamRequests] decline failed', e)
  }
}

// Captain subscribes to incoming pending requests for the teams they captain.
export function subscribeIncomingTeamRequests(captainTeamIds, callback) {
  if (!db || !Array.isArray(captainTeamIds) || captainTeamIds.length === 0) {
    callback([])
    return () => {}
  }
  const q = query(
    collection(db, 'teamRequests'),
    where('teamId', 'in', captainTeamIds.slice(0, 30)),
    where('status', '==', 'pending'),
  )
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('[teamRequests] incoming listener failed', err),
  )
}

// Sender subscribes to their own outgoing pending requests.
export function subscribeMyOutgoingTeamRequests(myUid, callback) {
  if (!db || !myUid) {
    callback([])
    return () => {}
  }
  const q = query(
    collection(db, 'teamRequests'),
    where('fromUid', '==', myUid),
    where('status', '==', 'pending'),
  )
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('[teamRequests] outgoing listener failed', err),
  )
}
