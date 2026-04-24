import { useState } from 'react'
import { users, missions, settings, __resetAll } from '../storage/storage.js'
import { ROLES, ROLE_LABELS, NOTIFICATION_TYPES } from '../storage/schema.js'
import { getStamp } from '../storage/stamps.js'
import { computeStreak, countAchievementDays } from '../lib/date.js'
import { levelFromDays } from '../lib/dragon.js'
import { ensureDemoTeams } from '../storage/seed.js'

export default function GuardianScreen({ onNavigate }) {
  const [syncedAt, setSyncedAt] = useState(null)
  const user = users.getCurrent()
  if (!user) return null

  const isPlayer = user.role === ROLES.PLAYER
  const userSettings = settings.get(user.id)

  const stats = isPlayer
    ? (() => {
        const ms = missions.listByUser(user.id)
        const days = countAchievementDays(ms)
        return {
          streak: computeStreak(ms),
          achievementDays: days,
          level: levelFromDays(days),
        }
      })()
    : null

  const toggleNotification = (key) => {
    settings.setNotification(user.id, key, !userSettings.notifications[key])
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
            <div className="profile-meta">
              <span className="role-tag">{ROLE_LABELS[user.role]}</span>
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
