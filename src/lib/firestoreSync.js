// Best-effort dual-write to Firestore. Each call awaits authReady so that
// the anonymous sign-in finishes before we try to use the uid.
// localStorage stays the source of truth for the screens; Firestore writes
// are fire-and-forget. Errors are logged but never thrown.

import { doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db, getAuthUid, authReady } from './firebase.js'

async function ready() {
  if (!db) return null
  await authReady
  return getAuthUid() || auth?.currentUser?.uid || null
}

export async function syncUserProfile(user) {
  if (!user || user.mock) return
  const uid = await ready()
  if (!uid) return
  try {
    await setDoc(
      doc(db, 'users', uid),
      {
        ...user,
        authUid: uid,
        _syncedAt: serverTimestamp(),
      },
      { merge: true },
    )
  } catch (e) {
    console.warn('[firestoreSync] user write failed', e)
  }
}

export async function syncSwingRecord(record) {
  if (!record) return
  const uid = await ready()
  if (!uid) return
  try {
    await setDoc(doc(db, 'users', uid, 'swings', record.id), {
      ...record,
      _syncedAt: serverTimestamp(),
    })
  } catch (e) {
    console.warn('[firestoreSync] swing write failed', e)
  }
}

// users/{uid}/activities に素振り達成を1件追記する。
// フィールド: type='swing', swingCount, date('YYYY-MM-DD'), createdAt(ServerTimestamp)
export async function syncSwingActivity({ swingCount, date }) {
  console.log('[firestoreSync] start', { swingCount, date })
  if (!Number.isFinite(swingCount)) {
    console.warn('[firestoreSync] swingCount invalid, skipping')
    return
  }
  const uid = await ready()
  console.log('[firestoreSync] uid:', uid)
  if (!uid) {
    console.warn('[firestoreSync] uid not ready, skipping activity write')
    return
  }
  const path = `users/${uid}/activities`
  const dateKey = date || new Date().toISOString().slice(0, 10)
  const payload = {
    type: 'swing',
    swingCount,
    date: dateKey,
    createdAt: serverTimestamp(),
  }
  console.log('[firestoreSync] writing to', path, payload)
  try {
    await addDoc(collection(db, 'users', uid, 'activities'), payload)
    console.log('[Firestore] activity saved', { path, swingCount, date: dateKey })
  } catch (e) {
    console.error('[firestoreSync] activity write failed', e)
  }
}
