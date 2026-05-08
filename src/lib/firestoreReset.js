// 全データリセット用ヘルパー。設定画面の「すべてのデータをリセット」から呼ばれる。
// localStorage だけでなく Firestore に残っている自分のデータも削除する。

import {
  collection,
  doc,
  query,
  where,
  getDocs,
  deleteDoc,
  updateDoc,
  arrayRemove,
} from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from './firebase.js'

async function deleteAll(snap) {
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
}

async function deleteSubcollection(uid, name) {
  const snap = await getDocs(collection(db, 'users', uid, name))
  await deleteAll(snap)
}

// 自分がキャプテンを務めるチーム一覧。リセット前のガード用。
export async function fetchMyCaptainTeams(uid) {
  if (!db || !uid) return []
  try {
    const snap = await getDocs(
      query(collection(db, 'teams'), where('captainId', '==', uid)),
    )
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  } catch (e) {
    console.error('[reset] fetch captain teams failed', e)
    return []
  }
}

// 自分の uid に紐づく Firestore データを可能な限り削除する。
// 失敗しても他の削除は続行（best-effort）。キャプテンの場合は呼び出し側で
// 事前に弾くこと（このまま実行するとチームから脱退するだけになる）。
export async function wipeAllMyFsData(uid) {
  if (!db || !uid) return

  // 1. 所属する全チームから脱退
  try {
    const teamsSnap = await getDocs(
      query(collection(db, 'teams'), where('memberIds', 'array-contains', uid)),
    )
    for (const t of teamsSnap.docs) {
      try {
        await updateDoc(t.ref, { memberIds: arrayRemove(uid) })
      } catch (e) {
        console.warn('[reset] leave team failed', t.id, e)
      }
    }
  } catch (e) {
    console.warn('[reset] teams query failed', e)
  }

  // 2. 自分が予約しているハンドル（usernames / teamHandles）
  try {
    const u = await getDocs(
      query(collection(db, 'usernames'), where('ownerUid', '==', uid)),
    )
    await deleteAll(u)
    const t = await getDocs(
      query(collection(db, 'teamHandles'), where('ownerUid', '==', uid)),
    )
    await deleteAll(t)
  } catch (e) {
    console.warn('[reset] handles failed', e)
  }

  // 3. /users/{uid} 配下のサブコレクション + ドキュメント本体
  for (const name of ['activities', 'missions', 'swings']) {
    try {
      await deleteSubcollection(uid, name)
    } catch (e) {
      console.warn('[reset] sub collection failed', name, e)
    }
  }
  try {
    await deleteDoc(doc(db, 'users', uid))
  } catch (e) {
    console.warn('[reset] user doc failed', e)
  }

  // 4. 公開アクティビティ /activities から自分の投稿
  try {
    const snap = await getDocs(
      query(collection(db, 'activities'), where('userId', '==', uid)),
    )
    await deleteAll(snap)
  } catch (e) {
    console.warn('[reset] public activities failed', e)
  }

  // 5. 自分宛通知（受信者なので delete 可能）
  try {
    const snap = await getDocs(
      query(collection(db, 'notifications'), where('userId', '==', uid)),
    )
    await deleteAll(snap)
  } catch (e) {
    console.warn('[reset] notifications failed', e)
  }

  // 6. フレンドシップ（双方の participants に自分が含まれる）
  try {
    const snap = await getDocs(
      query(collection(db, 'friendships'), where('participants', 'array-contains', uid)),
    )
    await deleteAll(snap)
  } catch (e) {
    console.warn('[reset] friendships failed', e)
  }

  // 7. 自分が送信したチーム関連リクエスト
  try {
    const snap = await getDocs(
      query(collection(db, 'teamRequests'), where('fromUid', '==', uid)),
    )
    await deleteAll(snap)
  } catch (e) {
    console.warn('[reset] team requests failed', e)
  }

  // 8. DM の自分の送信メッセージ（dm doc 本体はルール上 delete 不可）
  try {
    const dmsSnap = await getDocs(
      query(collection(db, 'dms'), where('participants', 'array-contains', uid)),
    )
    for (const dmDoc of dmsSnap.docs) {
      try {
        const msgsSnap = await getDocs(
          query(collection(db, 'dms', dmDoc.id, 'messages'), where('senderUid', '==', uid)),
        )
        await deleteAll(msgsSnap)
      } catch (e) {
        console.warn('[reset] dm messages failed', dmDoc.id, e)
      }
    }
  } catch (e) {
    console.warn('[reset] dms failed', e)
  }
}

export async function signOutAuth() {
  if (!auth) return
  try {
    await signOut(auth)
  } catch (e) {
    console.warn('[reset] signOut failed', e)
  }
}
