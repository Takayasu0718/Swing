// usernames/{lowercaseUserId} を予約用ドキュメントとして使い、Firestore transaction で
// 一意性を担保する。case-insensitive（"Taro" と "taro" は同一扱い）。

import { doc, runTransaction } from 'firebase/firestore'
import { db, authReady } from './firebase.js'

export async function reserveUsername(userId, ownerUid) {
  if (!db || !userId || !ownerUid) return { ok: false, reason: 'config' }
  await authReady
  const lower = userId.toLowerCase()
  try {
    return await runTransaction(db, async (txn) => {
      const ref = doc(db, 'usernames', lower)
      const snap = await txn.get(ref)
      if (snap.exists()) {
        const data = snap.data()
        if (data.ownerUid !== ownerUid) {
          return { ok: false, reason: 'taken' }
        }
        // 同じユーザーが再投稿（同じ名前のまま再登録）→ 何もしない
        return { ok: true, reason: 'noop' }
      }
      txn.set(ref, {
        ownerUid,
        userId,
        createdAt: new Date().toISOString(),
      })
      return { ok: true }
    })
  } catch (e) {
    console.error('[firestoreUsername] reserve failed', e)
    return { ok: false, reason: 'error', error: e }
  }
}
