// 体験会・試合助っ人参加のお願い。
// パス: trialRequests/{teamId}（メイン）+ trialRequests/{teamId}/participants/{uid}
// メインは1チーム1件（teamId=docId）。キャプテンが作成・更新・削除。
// 参加者の参加/不参加は participants サブコレクションに本人だけが書き込む。

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db, authReady } from './firebase.js'
import { createFsNotification } from './firestoreNotifications.js'

function tsToIso(ts) {
  if (ts && typeof ts.toDate === 'function') return ts.toDate().toISOString()
  if (typeof ts === 'string') return ts
  return null
}

function shapeRequest(snap) {
  if (!snap.exists()) return null
  const d = snap.data()
  return {
    teamId: snap.id,
    date: d.date || '',
    location: d.location || '',
    notes: d.notes || '',
    updatedAt: tsToIso(d.updatedAt),
    createdAt: tsToIso(d.createdAt),
  }
}

// 1チーム1件のリクエストを購読
export function subscribeTrialRequest(teamId, callback) {
  if (!db || !teamId) {
    callback(null)
    return () => {}
  }
  const ref = doc(db, 'trialRequests', teamId)
  return onSnapshot(
    ref,
    (snap) => callback(shapeRequest(snap)),
    (err) => console.error('[trialRequests] listener failed', err),
  )
}

// upsert（チームメンバーなら誰でも可）。trialUids には体験ロールメンバーの uid を渡し、
// 通知をその全員に送る（teamName は通知本文に使う）。
// 通知送信前に teams/{teamId}.memberIds を再フェッチし、現在もチームに在籍している
// 体験ユーザーのみに通知を絞り込む（クライアントキャッシュ古化への保険）。
export async function setTrialRequest(teamId, fields, options = {}) {
  if (!db || !teamId) return false
  const myUid = await authReady
  if (!myUid) return false
  const { trialUids = [], teamName = '' } = options
  try {
    const ref = doc(db, 'trialRequests', teamId)
    const existing = await getDoc(ref)
    const payload = {
      teamId,
      date: fields.date || '',
      location: fields.location || '',
      notes: fields.notes || '',
      updatedAt: serverTimestamp(),
    }
    if (!existing.exists()) payload.createdAt = serverTimestamp()
    await setDoc(ref, payload, { merge: true })

    // チーム在籍チェック: memberIds に含まれる uid のみ通知対象
    const teamSnap = await getDoc(doc(db, 'teams', teamId))
    const liveMemberIds = teamSnap.exists() ? (teamSnap.data().memberIds || []) : []
    const recipients = trialUids.filter((uid) => uid && uid !== myUid && liveMemberIds.includes(uid))

    const teamLabel = teamName ? `「${teamName}」` : 'チーム'
    const verb = existing.exists() ? '更新' : '受付開始'
    for (const uid of recipients) {
      await createFsNotification({
        userId: uid,
        type: 'trial_request',
        content: `${teamLabel}の体験会・助っ人参加のお願いが${verb}されました`,
      })
    }
    return true
  } catch (e) {
    console.error('[trialRequests] set failed', e)
    return false
  }
}

export async function deleteTrialRequest(teamId) {
  if (!db || !teamId) return false
  await authReady
  try {
    // participants サブコレクションを先に掃除
    const partsCol = collection(db, 'trialRequests', teamId, 'participants')
    const parts = await getDocs(partsCol)
    await Promise.all(parts.docs.map((d) => deleteDoc(d.ref)))
    await deleteDoc(doc(db, 'trialRequests', teamId))
    return true
  } catch (e) {
    console.error('[trialRequests] delete failed', e)
    return false
  }
}

// 自分の参加状態を購読（uid 単位）
export function subscribeMyParticipation(teamId, uid, callback) {
  if (!db || !teamId || !uid) {
    callback(null)
    return () => {}
  }
  const ref = doc(db, 'trialRequests', teamId, 'participants', uid)
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return callback(null)
      const d = snap.data()
      callback({ uid: snap.id, status: d.status, respondedAt: tsToIso(d.respondedAt) })
    },
    (err) => console.error('[trialRequests] participation listener failed', err),
  )
}

// 参加 / 不参加を保存（本人のみ）
export async function setMyParticipation(teamId, status) {
  if (!db || !teamId || !['in', 'out'].includes(status)) return false
  const uid = await authReady
  if (!uid) return false
  try {
    await setDoc(doc(db, 'trialRequests', teamId, 'participants', uid), {
      status,
      respondedAt: serverTimestamp(),
    })
    return true
  } catch (e) {
    console.error('[trialRequests] set participation failed', e)
    return false
  }
}
