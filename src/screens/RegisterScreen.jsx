import { useState } from 'react'
import { users, session } from '../storage/storage.js'
import { STAMPS } from '../storage/stamps.js'
import { ROLES, DAILY_GOAL_OPTIONS, USER_ID_REGEX, USER_ID_RULE } from '../storage/schema.js'
import { onGoalRaised } from '../lib/events.js'
import { authReady } from '../lib/firebase.js'
import { reserveUsername } from '../lib/firestoreUsername.js'
import { useFirestoreFriends } from '../hooks/useFirestoreFriends.jsx'
import { useFirestoreTeams } from '../hooks/useFirestoreTeams.jsx'

export default function RegisterScreen({ onDone, needsUserIdSetup = false }) {
  const current = users.getCurrent()
  const isEdit = !!current
  const { myUid, friendships: fsFriendships } = useFirestoreFriends()
  const { myFsTeam } = useFirestoreTeams()

  const [email, setEmail] = useState(current?.email ?? '')
  const [nickname, setNickname] = useState(current?.nickname ?? '')
  const [userId, setUserId] = useState(current?.userId ?? '')
  const [teamName, setTeamName] = useState(current?.teamName ?? '')
  const [avatarStamp, setAvatarStamp] = useState(current?.avatarStamp ?? STAMPS[0].id)
  const [role, setRole] = useState(current?.role ?? ROLES.PLAYER)
  const [dailyGoal, setDailyGoal] = useState(current?.dailyGoal ?? 50)
  const [advice, setAdvice] = useState(current?.advice ?? '')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (submitting) return
    setError('')
    if (!nickname.trim()) return setError('ニックネームを入力してください')
    const trimmedUserId = userId.trim()
    if (!trimmedUserId) return setError('ユーザーIDを入力してください')
    if (!USER_ID_REGEX.test(trimmedUserId)) return setError(`ユーザーIDは ${USER_ID_RULE} で入力してください`)
    if (!avatarStamp) return setError('プロフィール画像を選択してください')
    if (role === ROLES.PLAYER && !dailyGoal) return setError('目標回数を選択してください')

    setSubmitting(true)
    try {
      // Firestore で一意性を担保（認証済みのとき）
      const authUid = await authReady
      if (authUid) {
        const result = await reserveUsername(trimmedUserId, authUid)
        if (!result.ok) {
          if (result.reason === 'taken') {
            setError('このユーザーIDはすでに使われています')
          } else {
            setError('ユーザーIDの予約に失敗しました。時間をおいて再度お試しください。')
          }
          return
        }
      }

      const data = {
        email: email.trim(),
        nickname: nickname.trim(),
        userId: trimmedUserId,
        userIdLower: trimmedUserId.toLowerCase(),
        teamName: teamName.trim(),
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
        const fsFriendUids = (fsFriendships || [])
          .filter((f) => f.status === 'accepted')
          .map((f) => f.participants?.find((p) => p !== myUid))
          .filter(Boolean)
        const fsTeammateUids = (myFsTeam?.memberIds ?? []).filter((u) => u !== myUid)
        const fsRecipientUids = Array.from(new Set([...fsFriendUids, ...fsTeammateUids]))
        onGoalRaised(savedId, prevGoal, data.dailyGoal, fsRecipientUids, myFsTeam?.id ?? null)
      }
      onDone?.()
    } finally {
      setSubmitting(false)
    }
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

      {needsUserIdSetup && (
        <div className="error" role="alert" style={{ background: '#fff7ed', borderColor: '#fdba74', color: '#9a3412' }}>
          ユーザーIDを設定してください。フレンド検索などで使われます。
        </div>
      )}

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

      <label className="field">
        <span className="field-label">
          ユーザーID <span className="req">*</span>
        </span>
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="例：taro_baseball"
          maxLength={20}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          pattern="[a-zA-Z0-9_-]{3,20}"
        />
        <span className="field-hint">{USER_ID_RULE}（重複不可）</span>
      </label>

      <label className="field">
        <span className="field-label">所属チーム名（任意）</span>
        <input
          type="text"
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          placeholder="例: 桜台サンバード"
          maxLength={30}
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
          <div className="goal-custom-row">
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="9999"
              placeholder="または直接入力"
              value={dailyGoal || ''}
              onChange={(e) => {
                const raw = e.target.value
                if (raw === '') {
                  setDailyGoal(0)
                  return
                }
                const n = parseInt(raw, 10)
                if (Number.isFinite(n) && n > 0) setDailyGoal(n)
              }}
            />
            <span className="goal-custom-unit">回</span>
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

      <button className="submit" onClick={submit} disabled={submitting}>
        {isEdit ? '保存する' : 'はじめる'}
      </button>
    </div>
  )
}
