// teamHandles/{lower} を予約用ドキュメントとして使い、チームID の一意性を担保。
// case-insensitive。所有者は作成者（=キャプテン）の uid。

import { doc, runTransaction } from 'firebase/firestore'
import { db, authReady } from './firebase.js'

export async function reserveTeamHandle(handle, ownerUid) {
  if (!db || !handle || !ownerUid) return { ok: false, reason: 'config' }
  await authReady
  const lower = handle.toLowerCase()
  try {
    return await runTransaction(db, async (txn) => {
      const ref = doc(db, 'teamHandles', lower)
      const snap = await txn.get(ref)
      if (snap.exists()) {
        const data = snap.data()
        if (data.ownerUid !== ownerUid) {
          return { ok: false, reason: 'taken' }
        }
        return { ok: true, reason: 'noop' }
      }
      txn.set(ref, {
        ownerUid,
        handle,
        createdAt: new Date().toISOString(),
      })
      return { ok: true }
    })
  } catch (e) {
    console.error('[firestoreTeamHandle] reserve failed', e)
    return { ok: false, reason: 'error', error: e }
  }
}
