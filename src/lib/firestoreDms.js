// 1対1 DM。
// パス:
//   dms/{convId}                       … 会話メタ（participants, lastMessage, lastMessageAt,
//                                        lastMessageSenderUid, lastReadAt: { uid: ts })
//   dms/{convId}/messages/{msgId}     … 個別メッセージ（senderUid, content, createdAt, expireAt）
// convId は [uidA, uidB].sort().join('_') で一意。
//
// パフォーマンス方針:
//   - チャット画面表示中のみ subscribeMessages（最新100件）。離脱時 unsubscribe。
//   - 会話一覧は fetchMyConversations（一発 get、リアルタイム購読なし）。
//
// TTL:
//   - 各メッセージに expireAt = createdAt + RETENTION_DAYS を持たせる。
//   - 将来 Firestore Console で expireAt を TTL 対象に指定すれば自動削除可能。
//   - 現状は 10 年（実質無期限）。短くしたい場合は RETENTION_DAYS を変更。

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db, authReady } from './firebase.js'

const RETENTION_DAYS = 365 * 10
const MESSAGE_LIMIT = 100

export function conversationId(uidA, uidB) {
  if (!uidA || !uidB) return null
  return [uidA, uidB].sort().join('_')
}

function tsToIso(ts) {
  if (ts && typeof ts.toDate === 'function') return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return null
}

function shapeMessage(snap) {
  const d = snap.data()
  return {
    id: snap.id,
    senderUid: d.senderUid,
    content: d.content || '',
    createdAt: tsToIso(d.createdAt) || new Date().toISOString(),
  }
}

function shapeConversation(snap) {
  if (!snap.exists()) return null
  const d = snap.data()
  return {
    id: snap.id,
    participants: d.participants || [],
    lastMessage: d.lastMessage || '',
    lastMessageAt: tsToIso(d.lastMessageAt),
    lastMessageSenderUid: d.lastMessageSenderUid || null,
    lastReadAt: Object.fromEntries(
      Object.entries(d.lastReadAt || {}).map(([k, v]) => [k, tsToIso(v)]),
    ),
  }
}

// チャット画面マウント中のみ呼ぶ。返り値の関数で unsubscribe。
export function subscribeMessages(convId, callback) {
  if (!db || !convId) {
    callback([])
    return () => {}
  }
  const q = query(
    collection(db, 'dms', convId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(MESSAGE_LIMIT),
  )
  return onSnapshot(
    q,
    (snap) => {
      // desc で取得 → 古い順に並べ替え
      const items = snap.docs.map(shapeMessage).reverse()
      callback(items)
    },
    (err) => console.error('[dms] messages listener failed', err),
  )
}

// 送信。会話 doc を merge upsert（ルール上、participants を含む先送りが必須）。
export async function sendDmMessage(convId, partnerUid, content) {
  if (!db || !convId || !content?.trim()) return null
  const myUid = await authReady
  if (!myUid) return null
  const trimmed = content.trim().slice(0, 1000)
  try {
    // 1) 会話メタ upsert（メッセージ作成時のルールで participants を読む必要があるので先）
    await setDoc(
      doc(db, 'dms', convId),
      {
        participants: [myUid, partnerUid].sort(),
        lastMessage: trimmed,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderUid: myUid,
        [`lastReadAt.${myUid}`]: serverTimestamp(),
      },
      { merge: true },
    )
    // 2) メッセージ追加
    const expireAt = Timestamp.fromMillis(Date.now() + RETENTION_DAYS * 24 * 3600 * 1000)
    const msgRef = await addDoc(collection(db, 'dms', convId, 'messages'), {
      senderUid: myUid,
      content: trimmed,
      createdAt: serverTimestamp(),
      expireAt,
    })
    return msgRef.id
  } catch (e) {
    console.error('[dms] send failed', e)
    return null
  }
}

// 既読更新（チャット画面開いた瞬間 + 新着到着時に呼ぶ）
export async function markConversationRead(convId) {
  if (!db || !convId) return
  const myUid = await authReady
  if (!myUid) return
  try {
    await setDoc(
      doc(db, 'dms', convId),
      { [`lastReadAt.${myUid}`]: serverTimestamp() },
      { merge: true },
    )
  } catch (e) {
    console.error('[dms] markRead failed', e)
  }
}

// 一覧（保護者画面用、リアルタイムなし）
export async function fetchMyConversations() {
  if (!db) return []
  const myUid = await authReady
  if (!myUid) return []
  try {
    const q = query(
      collection(db, 'dms'),
      where('participants', 'array-contains', myUid),
    )
    const snap = await getDocs(q)
    const list = snap.docs.map((d) => shapeConversation(d)).filter(Boolean)
    list.sort((a, b) => {
      if (!a.lastMessageAt) return 1
      if (!b.lastMessageAt) return -1
      return a.lastMessageAt < b.lastMessageAt ? 1 : -1
    })
    return list
  } catch (e) {
    console.error('[dms] fetch list failed', e)
    return []
  }
}

// 会話メタの軽量リアルタイム購読（バッジ表示用）。
// 会話 doc の更新（新着メッセージ送信時の lastMessageAt 等）にだけ反応するので
// メッセージ全件購読より遥かに安価。アプリ起動中に1個だけ張る前提で使う。
export function subscribeMyConversations(myUid, callback) {
  if (!db || !myUid) {
    callback([])
    return () => {}
  }
  const q = query(collection(db, 'dms'), where('participants', 'array-contains', myUid))
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => shapeConversation(d)).filter(Boolean)
      list.sort((a, b) => {
        if (!a.lastMessageAt) return 1
        if (!b.lastMessageAt) return -1
        return a.lastMessageAt < b.lastMessageAt ? 1 : -1
      })
      callback(list)
    },
    (err) => console.error('[dms] conversations listener failed', err),
  )
}

export async function fetchConversation(convId) {
  if (!db || !convId) return null
  await authReady
  try {
    const snap = await getDoc(doc(db, 'dms', convId))
    return shapeConversation(snap)
  } catch (e) {
    console.error('[dms] fetch conversation failed', e)
    return null
  }
}
