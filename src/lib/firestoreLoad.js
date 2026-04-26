// Read swing activities from Firestore. Sorted by `createdAt` (set via serverTimestamp).
// Single-field orderBy avoids needing a composite index.

import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db, authReady } from './firebase.js'

export async function loadSwingActivities() {
  if (!db) return null
  const uid = await authReady
  if (!uid) return null
  try {
    const snap = await getDocs(
      query(collection(db, 'users', uid, 'activities'), orderBy('createdAt', 'asc')),
    )
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    console.log('[Firestore] raw activities', list)
    const swingActivities = list.filter(
      (d) => d.type === 'swing' && Number.isFinite(d.swingCount) && d.date,
    )
    console.log('[Firestore] swing activities', swingActivities)
    console.log('[Firestore] activities loaded', swingActivities.length)
    return swingActivities
  } catch (e) {
    console.error('[Firestore] activities load failed', e)
    return null
  }
}
