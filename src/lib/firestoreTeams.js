// Firestore-backed team operations.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore'
import { db, authReady } from './firebase.js'

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export async function createFsTeam({ name, description, prefecture, municipality }) {
  const uid = await authReady
  if (!uid || !db) return null
  try {
    const ref = await addDoc(collection(db, 'teams'), {
      name: (name || '').trim(),
      description: (description || '').trim().slice(0, 50),
      prefecture: prefecture || '',
      municipality: municipality || '',
      captainId: uid,
      memberIds: [uid],
      friendTeamIds: [],
      nextMatch: null,
      matches: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    console.log('[firestoreTeams] created', ref.id)
    return ref.id
  } catch (e) {
    console.error('[firestoreTeams] create failed', e)
    return null
  }
}

export async function listAllFsTeams() {
  if (!db) return []
  await authReady
  try {
    const snap = await getDocs(collection(db, 'teams'))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.error('[firestoreTeams] list failed', e)
    return []
  }
}

export async function getFsTeam(teamId) {
  if (!db || !teamId) return null
  await authReady
  try {
    const snap = await getDoc(doc(db, 'teams', teamId))
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  } catch (e) {
    console.error('[firestoreTeams] get failed', e)
    return null
  }
}

// Real-time list of teams I'm a member of.
export function subscribeMyFsTeams(myUid, callback) {
  if (!db || !myUid) {
    callback([])
    return () => {}
  }
  const q = query(collection(db, 'teams'), where('memberIds', 'array-contains', myUid))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => console.error('[firestoreTeams] listener failed', err),
  )
}

export async function updateFsTeam(teamId, patch) {
  if (!db || !teamId) return
  await authReady
  try {
    await updateDoc(doc(db, 'teams', teamId), { ...patch, updatedAt: serverTimestamp() })
  } catch (e) {
    console.error('[firestoreTeams] update failed', e)
  }
}

export async function addFsTeamMember(teamId, uid) {
  if (!db || !teamId || !uid) return
  await authReady
  try {
    await updateDoc(doc(db, 'teams', teamId), {
      memberIds: arrayUnion(uid),
      updatedAt: serverTimestamp(),
    })
  } catch (e) {
    console.error('[firestoreTeams] addMember failed', e)
  }
}

export async function removeFsTeamMember(teamId, uid) {
  if (!db || !teamId || !uid) return
  await authReady
  try {
    await updateDoc(doc(db, 'teams', teamId), {
      memberIds: arrayRemove(uid),
      updatedAt: serverTimestamp(),
    })
  } catch (e) {
    console.error('[firestoreTeams] removeMember failed', e)
  }
}

export async function addFsMatch(teamId, match) {
  if (!db || !teamId) return
  await authReady
  try {
    const matchRecord = { ...match, id: newId(), createdAt: new Date().toISOString() }
    await updateDoc(doc(db, 'teams', teamId), {
      matches: arrayUnion(matchRecord),
      updatedAt: serverTimestamp(),
    })
  } catch (e) {
    console.error('[firestoreTeams] addMatch failed', e)
  }
}

export async function deleteFsTeam(teamId) {
  if (!db || !teamId) return
  await authReady
  try {
    await deleteDoc(doc(db, 'teams', teamId))
  } catch (e) {
    console.error('[firestoreTeams] delete failed', e)
  }
}
