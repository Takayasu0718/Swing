import { useState } from 'react'
import { users, session } from '../storage/storage.js'
import { STAMPS } from '../storage/stamps.js'
import { ROLES, DAILY_GOAL_OPTIONS } from '../storage/schema.js'
import { onGoalRaised } from '../lib/events.js'

export default function RegisterScreen({ onDone }) {
  const current = users.getCurrent()
  const isEdit = !!current

  const [email, setEmail] = useState(current?.email ?? '')
  const [nickname, setNickname] = useState(current?.nickname ?? '')
  const [avatarStamp, setAvatarStamp] = useState(current?.avatarStamp ?? STAMPS[0].id)
  const [role, setRole] = useState(current?.role ?? ROLES.PLAYER)
  const [dailyGoal, setDailyGoal] = useState(current?.dailyGoal ?? 50)
  const [advice, setAdvice] = useState(current?.advice ?? '')
  const [error, setError] = useState('')

  const submit = () => {
    setError('')
    if (!nickname.trim()) return setError('ニックネームを入力してください')
    if (!avatarStamp) return setError('プロフィール画像を選択してください')
    if (role === ROLES.PLAYER && !dailyGoal) return setError('目標回数を選択してください')

    const data = {
      email: email.trim(),
      nickname: nickname.trim(),
      avatarStamp,
      role,
      dailyGoal: role === ROLES.PLAYER ? dailyGoal : null,
      advice: role === ROLES.COACH ? advice.trim() : '',
    }

    const prevGoal = current?.dailyGoal ?? null
    let savedId
    if (isEdit) {
      users.update(current.id, data)
      savedId = current.id
    } else {
      const u = users.create(data)
      session.setCurrentUser(u.id)
      savedId = u.id
    }

    if (role === ROLES.PLAYER) {
      onGoalRaised(savedId, prevGoal, data.dailyGoal)
    }
    onDone?.()
  }

  return (
    <div className="screen">
      <h1 className="screen-title">{isEdit ? 'プロフィール編集' : 'プロフィール登録'}</h1>

      <label className="field">
        <span className="field-label">メールアドレス</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="example@mail.com"
          autoComplete="email"
        />
      </label>

      <label className="field">
        <span className="field-label">
          ニックネーム <span className="req">*</span>
        </span>
        <input
          type="text"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="例：たろう"
          maxLength={20}
        />
      </label>

      <div className="field">
        <span className="field-label">
          プロフィール画像 <span className="req">*</span>
        </span>
        <div className="stamp-grid">
          {STAMPS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`stamp-btn ${avatarStamp === s.id ? 'active' : ''}`}
              onClick={() => setAvatarStamp(s.id)}
              aria-label={s.name}
            >
              <span className="stamp-emoji">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">
          役割 <span className="req">*</span>
        </span>
        <div className="role-row">
          <button
            type="button"
            className={`role-btn ${role === ROLES.PLAYER ? 'active' : ''}`}
            onClick={() => setRole(ROLES.PLAYER)}
          >
            選手
          </button>
          <button
            type="button"
            className={`role-btn ${role === ROLES.COACH ? 'active' : ''}`}
            onClick={() => setRole(ROLES.COACH)}
          >
            監督・コーチ
          </button>
        </div>
      </div>

      {role === ROLES.PLAYER && (
        <div className="field">
          <span className="field-label">
            1日の目標素振り回数 <span className="req">*</span>
          </span>
          <div className="goal-grid">
            {DAILY_GOAL_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                className={`goal-btn ${dailyGoal === n ? 'active' : ''}`}
                onClick={() => setDailyGoal(n)}
              >
                {n}回
              </button>
            ))}
          </div>
        </div>
      )}

      {role === ROLES.COACH && (
        <label className="field">
          <span className="field-label">一言アドバイス（ホームに表示されます）</span>
          <textarea
            value={advice}
            onChange={(e) => setAdvice(e.target.value)}
            rows={3}
            maxLength={80}
            placeholder="例：毎日コツコツ素振り、積み重ねが力になる！"
          />
        </label>
      )}

      {error && <div className="error">{error}</div>}

      <button className="submit" onClick={submit}>
        {isEdit ? '保存する' : 'はじめる'}
      </button>
    </div>
  )
}
