import { useEffect, useState } from 'react'
import { users, missions, settings, __resetAll } from '../storage/storage.js'
import { ROLES, ROLE_LABELS, NOTIFICATION_TYPES, DISPLAY_SETTINGS } from '../storage/schema.js'
import { getStamp } from '../storage/stamps.js'
import { computeStreak, countAchievementDays, computeLongestStreak } from '../lib/date.js'
import { levelFromProgress } from '../lib/dragon.js'
import { ensureDemoTeams } from '../storage/seed.js'
import { useTheme } from '../hooks/useTheme.jsx'
import { useFirestoreTeams } from '../hooks/useFirestoreTeams.jsx'
import { useFirestoreFriends } from '../hooks/useFirestoreFriends.jsx'
import { useDm } from '../hooks/useDm.jsx'
import {
  subscribeTrialRequest,
  subscribeMyParticipation,
  setMyParticipation,
} from '../lib/firestoreTrialRequests.js'
import { fetchMyConversations } from '../lib/firestoreDms.js'

export default function GuardianScreen({ onNavigate }) {
  const [syncedAt, setSyncedAt] = useState(null)
  const { mode: themeMode, setMode: setThemeMode } = useTheme()
  const { myUid, myFsTeam } = useFirestoreTeams()
  const { allUsers } = useFirestoreFriends()
  const { openDm } = useDm()
  const [trialRequest, setTrialRequest] = useState(null)
  const [participation, setParticipation] = useState(null)
  const [conversations, setConversations] = useState([])
  const user = users.getCurrent()

  // FS チームの体験会・助っ人参加のお願いを購読
  useEffect(() => {
    if (!myFsTeam?.id) return
    return subscribeTrialRequest(myFsTeam.id, setTrialRequest)
  }, [myFsTeam?.id])

  // 自分の参加状態を購読
  useEffect(() => {
    if (!myFsTeam?.id || !myUid) return
    return subscribeMyParticipation(myFsTeam.id, myUid, setParticipation)
  }, [myFsTeam?.id, myUid])

  // DM 会話一覧を一発取得（リアルタイムなし）
  useEffect(() => {
    if (!myUid) return
    let cancelled = false
    fetchMyConversations().then((list) => {
      if (!cancelled) setConversations(list)
    })
    return () => {
      cancelled = true
    }
  }, [myUid])

  if (!user) return null

  const isPlayer = user.role === ROLES.PLAYER
  const isTrial = user.role === ROLES.TRIAL
  const userSettings = settings.get(user.id)

  const stats = isPlayer
    ? (() => {
        const ms = missions.listByUser(user.id)
        const days = countAchievementDays(ms)
        const longestStreak = computeLongestStreak(ms)
        const level = levelFromProgress(days, longestStreak)
        return {
          streak: computeStreak(ms),
          achievementDays: days,
          level,
        }
      })()
    : null

  const toggleNotification = (key) => {
    settings.setNotification(user.id, key, !userSettings.notifications[key])
  }

  const toggleDisplay = (key) => {
    settings.setDisplay(user.id, key, !userSettings.display[key])
  }

  const resetAll = () => {
    if (!confirm('本当にすべてのデータをリセットしますか？\nプロフィール・素振り記録・ミッション履歴がすべて削除されます。')) return
    __resetAll()
  }

  const syncData = () => {
    ensureDemoTeams()
    setSyncedAt(new Date())
  }

  return (
    <div className="screen">
      <h1 className="screen-title">保護者メニュー</h1>

      <section className="info-card">
        <div className="card-title">登録済みのプロフィール</div>
        <div className="profile-row">
          <span className="avatar-big" aria-hidden>{getStamp(user.avatarStamp).label}</span>
          <div className="profile-info">
            <div className="profile-name">{user.nickname}</div>
            {user.userId && <div className="profile-handle">@{user.userId}</div>}
            <div className="profile-meta">
              <span className="role-tag">{ROLE_LABELS[user.role]}</span>
              {user.teamName && <span className="friend-tag">{user.teamName}</span>}
              {user.email && <span className="profile-email">{user.email}</span>}
            </div>
          </div>
        </div>

        {isPlayer && (
          <>
            <dl className="stat-list">
              <div className="stat-row">
                <dt>1日の目標</dt>
                <dd>{user.dailyGoal}回</dd>
              </div>
              <div className="stat-row">
                <dt>連続達成</dt>
                <dd>{stats.streak}日</dd>
              </div>
              <div className="stat-row">
                <dt>累計達成日数</dt>
                <dd>{stats.achievementDays}日</dd>
              </div>
              <div className="stat-row">
                <dt>スイングドラゴン</dt>
                <dd>Lv.{stats.level}</dd>
              </div>
            </dl>
          </>
        )}

        {user.role === ROLES.COACH && user.advice && (
          <div className="advice-preview">
            <div className="advice-name">一言アドバイス</div>
            <div className="advice-text">{user.advice}</div>
          </div>
        )}

        <button className="outline-btn" onClick={() => onNavigate?.('register')}>
          プロフィールを編集
        </button>
      </section>

      {isTrial && trialRequest && myFsTeam?.id && (
        <section className="info-card">
          <div className="card-title">体験会・助っ人参加のお願い</div>
          <div className="trial-request-row"><b>開催日:</b> {trialRequest.date || '未設定'}</div>
          <div className="trial-request-row"><b>場所:</b> {trialRequest.location || '未設定'}</div>
          {trialRequest.notes && (
            <div className="trial-request-notes">{trialRequest.notes}</div>
          )}
          <div className="empty-txt" style={{ marginTop: '0.5rem' }}>
            {participation?.status === 'in'
              ? '参加するとして回答済みです。'
              : participation?.status === 'out'
                ? '不参加として回答済みです。'
                : '参加可否を選択してください'}
          </div>
          <div className="btn-row">
            <button
              className={`role-btn ${participation?.status === 'in' ? 'active' : ''}`}
              onClick={() => setMyParticipation(myFsTeam.id, 'in')}
            >
              参加する
            </button>
            <button
              className={`role-btn ${participation?.status === 'out' ? 'active' : ''}`}
              onClick={() => setMyParticipation(myFsTeam.id, 'out')}
            >
              不参加
            </button>
          </div>
        </section>
      )}

      <section className="info-card">
        <div className="card-title">メッセージ（{conversations.length}）</div>
        {conversations.length === 0 ? (
          <div className="empty-txt">
            まだメッセージはありません。プロフィールの「DM」ボタンから会話を始められます。
          </div>
        ) : (
          <div>
            {conversations.map((c) => {
              const partnerUid = (c.participants || []).find((p) => p !== myUid)
              if (!partnerUid) return null
              const partner = (allUsers || []).find((u) => u.uid === partnerUid)
              const myLastReadAt = c.lastReadAt?.[myUid] || null
              const hasUnread =
                c.lastMessageAt
                && c.lastMessageSenderUid !== myUid
                && (!myLastReadAt || myLastReadAt < c.lastMessageAt)
              return (
                <button
                  key={c.id}
                  type="button"
                  className="dm-row"
                  onClick={() => openDm(partnerUid)}
                >
                  <span className="activity-stamp" aria-hidden>
                    {getStamp(partner?.avatarStamp).label}
                  </span>
                  <div className="dm-row-info">
                    <div className="dm-row-name">
                      {partner?.nickname ?? partnerUid.slice(0, 6)}
                    </div>
                    <div className="dm-row-preview">
                      {c.lastMessageSenderUid === myUid ? 'あなた: ' : ''}
                      {c.lastMessage || '（メッセージなし）'}
                    </div>
                  </div>
                  {hasUnread && <span className="dm-unread-dot" aria-label="未読あり" />}
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="info-card">
        <div className="card-title">通知設定</div>
        <div className="toggle-list">
          {NOTIFICATION_TYPES.map((t) => {
            const on = userSettings.notifications[t.key]
            return (
              <button
                key={t.key}
                type="button"
                className="toggle-row"
                onClick={() => toggleNotification(t.key)}
                aria-pressed={on}
              >
                <span className="toggle-label">{t.label}</span>
                <span className={`toggle ${on ? 'on' : ''}`} aria-hidden>
                  <span className="toggle-knob" />
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="info-card">
        <div className="card-title">表示設定</div>
        <div className="toggle-list">
          {DISPLAY_SETTINGS.map((t) => {
            const on = !!userSettings.display?.[t.key]
            return (
              <button
                key={t.key}
                type="button"
                className="toggle-row"
                onClick={() => toggleDisplay(t.key)}
                aria-pressed={on}
              >
                <span className="toggle-label">{t.label}</span>
                <span className={`toggle ${on ? 'on' : ''}`} aria-hidden>
                  <span className="toggle-knob" />
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="info-card">
        <div className="card-title">テーマ</div>
        <div className="theme-options" role="radiogroup" aria-label="テーマ">
          {[
            { k: 'light', label: 'ライト', icon: '☀️' },
            { k: 'dark', label: 'ダーク', icon: '🌙' },
            { k: 'system', label: 'システム', icon: '🖥️' },
          ].map((opt) => (
            <button
              key={opt.k}
              type="button"
              role="radio"
              aria-checked={themeMode === opt.k}
              className={`theme-option ${themeMode === opt.k ? 'active' : ''}`}
              onClick={() => setThemeMode(opt.k)}
            >
              <span className="theme-option-icon" aria-hidden>{opt.icon}</span>
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="info-card">
        <div className="card-title">データ管理</div>
        <div className="empty-txt">
          新しく追加されたデモチームなどを同期します。既存データは保持されます。
        </div>
        <button className="outline-btn" onClick={syncData}>
          データ更新
        </button>
        {syncedAt && (
          <div className="empty-txt" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            最終更新: {syncedAt.toLocaleTimeString('ja-JP')}
          </div>
        )}
        <div className="empty-txt" style={{ marginTop: '1rem' }}>
          デバイスに保存された情報（プロフィール、素振り記録、ミッション履歴、設定）をすべて削除します。
        </div>
        <button className="danger-btn" onClick={resetAll}>
          すべてのデータをリセット
        </button>
      </section>
    </div>
  )
}
