import { useEffect, useState } from 'react'
import { users, missions, settings } from '../storage/storage.js'
import { ROLES, ROLE_LABELS, NOTIFICATION_TYPES, DISPLAY_SETTINGS } from '../storage/schema.js'
import { getStamp } from '../storage/stamps.js'
import { computeStreak, countAchievementDays, computeLongestStreak } from '../lib/date.js'
import { levelFromProgress } from '../lib/dragon.js'
import { ensureDemoTeams } from '../storage/seed.js'
import {
  wipeAllMyFsData,
  fetchMyCaptainTeams,
  signOutAuth,
} from '../lib/firestoreReset.js'
import { auth, signOutUser } from '../lib/firebase.js'
import { wipeAllLocalData } from '../storage/storage.js'
import { setDemoMode, isDemoMode } from '../lib/demoMode.js'
import { setDebug, clearDebug, getCurrentDebug } from '../lib/debugMode.js'
import { useFirestoreTeams } from '../hooks/useFirestoreTeams.jsx'
import { useFirestoreFriends } from '../hooks/useFirestoreFriends.jsx'
import { useDm } from '../hooks/useDm.jsx'
import {
  subscribeTrialRequest,
  subscribeMyParticipation,
  setMyParticipation,
} from '../lib/firestoreTrialRequests.js'
import { fetchMyConversations } from '../lib/firestoreDms.js'

export default function GuardianScreen({ onNavigate, onOpenLegal }) {
  const [syncedAt, setSyncedAt] = useState(null)
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

  const resetAll = async () => {
    if (!confirm('本当にすべてのデータをリセットしますか？\nプロフィール・素振り記録・ミッション履歴・通知・フレンド・アクティビティ・DM などすべてのデータが削除されます。')) return
    // 自分がキャプテンを務めるチームがある場合は譲渡を促して中断
    if (myUid) {
      const captainTeams = await fetchMyCaptainTeams(myUid)
      if (captainTeams.length > 0) {
        alert(`キャプテンを務めているチームが ${captainTeams.length} 件あります。リセット前に他メンバーへキャプテンを譲ってください（チーム画面）。`)
        return
      }
    }
    // Firestore 上の自分のデータを可能な限り削除（best-effort）
    if (myUid) {
      try {
        await wipeAllMyFsData(myUid)
      } catch (e) {
        console.warn('[reset] FS wipe failed', e)
      }
    }
    // Firebase Auth からサインアウトして匿名 uid をリセット
    await signOutAuth()
    // localStorage を完全クリア（Firebase 認証関連も含む）
    try {
      localStorage.clear()
    } catch (e) {
      console.warn('[reset] localStorage.clear failed', e)
    }
    // 新規 uid からスタートさせるため強制リロード
    location.reload()
  }

  const syncData = () => {
    ensureDemoTeams()
    setSyncedAt(new Date())
  }

  // 通常のログアウト。ローカルキャッシュを wipe して reload（hooks の myUid を再取得させる）。
  const handleLogout = async () => {
    if (!confirm('ログアウトしますか？')) return
    try {
      await signOutUser()
    } catch (e) {
      console.warn('[logout] sign out failed', e)
    }
    try {
      wipeAllLocalData()
    } catch (e) {
      console.warn('[logout] wipe local failed', e)
    }
    location.reload()
  }

  return (
    <div className="screen">
      <h1 className="screen-title">設定</h1>

      <section className="info-card">
        <div className="card-title">登録済みのプロフィール</div>
        <div className="profile-row">
          <span className="avatar-big" aria-hidden><img src={getStamp(user.avatarStamp).image} alt="" /></span>
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
                <dt>ユーザーレベル</dt>
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
          <div className="trial-event-type-badge">
            {trialRequest.eventType === 'helper' ? '試合助っ人参加' : '体験会'}
          </div>
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
                    <img src={getStamp(partner?.avatarStamp).image} alt="" />
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
        <div className="card-title">アカウント</div>
        <div className="trial-request-row">
          <b>メールアドレス:</b> {auth?.currentUser?.email || '不明'}
        </div>
        <div className="btn-row" style={{ marginTop: '0.6rem' }}>
          <button className="outline-btn" onClick={handleLogout}>
            ログアウト
          </button>
        </div>
        <div className="empty-txt" style={{ marginTop: '0.4rem' }}>
          別のアカウントを使う場合は、一度ログアウトしてからログイン画面で切り替えてください。
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

      <section className="info-card">
        <div className="card-title">規約・ポリシー</div>
        <div className="btn-row">
          <button className="outline-btn" onClick={() => onOpenLegal?.('terms')}>
            利用規約
          </button>
          <button className="outline-btn" onClick={() => onOpenLegal?.('privacy')}>
            プライバシーポリシー
          </button>
        </div>
      </section>

      <section className="info-card">
        <div className="card-title">お問い合わせ</div>
        <div className="empty-txt">
          ご質問・不具合報告・ご要望は下記からメールでお寄せください。
        </div>
        <a
          className="outline-btn contact-btn"
          href="mailto:t.sasaki@tishiki.tech?subject=Swing%20お問い合わせ"
        >
          お問い合わせはこちら
        </a>
      </section>

      <DebugPanel />
    </div>
  )
}

// SNS 撮影/開発用のデバッグパネル。デモモード切替 + HomeScreen の数値上書き。
// 適用後は localStorage に保存され、リロードして反映する。
function DebugPanel() {
  const cur = getCurrentDebug() || {}
  const [demo, setDemo] = useState(() => isDemoMode())
  const [lv, setLv] = useState(cur.lv ?? '')
  const [streak, setStreak] = useState(cur.streak ?? '')
  const [days, setDays] = useState(cur.days ?? '')
  const [longest, setLongest] = useState(cur.longest ?? '')
  const [next, setNext] = useState(cur.next ?? '')
  const [todaySwing, setTodaySwing] = useState(cur.todayswing ?? '')
  const [totalSwing, setTotalSwing] = useState(cur.totalswing ?? '')
  const [claim, setClaim] = useState(cur.claim === '1')
  const [approve, setApprove] = useState(cur.approve === '1')
  const bsParts = (cur.bs || '').split(',')
  const [bsSpeed, setBsSpeed] = useState(bsParts[0] ?? '')
  const [bsLower, setBsLower] = useState(bsParts[1] ?? '')
  const [bsCourse, setBsCourse] = useState(bsParts[2] ?? '')
  const [bsMeet, setBsMeet] = useState(bsParts[3] ?? '')
  const [bsCustom, setBsCustom] = useState(bsParts[4] ?? '')

  const apply = () => {
    setDemoMode(demo)
    const bs = [bsSpeed, bsLower, bsCourse, bsMeet, bsCustom]
      .map((v) => (v === '' ? '' : String(v)))
      .join(',')
    setDebug({
      lv, streak, days, longest, next,
      todayswing: todaySwing,
      totalswing: totalSwing,
      claim: claim ? '1' : '',
      approve: approve ? '1' : '',
      bs: bs === ',,,,' ? '' : bs,
    })
    window.location.reload()
  }

  const clearAll = () => {
    setDemoMode(false)
    clearDebug()
    window.location.reload()
  }

  return (
    <section className="info-card">
      <details>
        <summary className="card-title" style={{ cursor: 'pointer' }}>
          デバッグ・デモ（撮影用）
        </summary>
        <div className="empty-txt" style={{ marginTop: '0.4rem' }}>
          数値を入力して「適用してリロード」で画面の表示値だけを上書きします。
          サーバーには書き込みません。空欄は本物データを使用。
        </div>

        <label className="legal-consent-row" style={{ marginTop: '0.6rem' }}>
          <input
            type="checkbox"
            checked={demo}
            onChange={(e) => setDemo(e.target.checked)}
          />
          <span className="legal-consent-text">
            デモモード（友達10人 / 通知 / ランキング 等を populated）
          </span>
        </label>

        <DebugRow label="レベル" value={lv} onChange={setLv} placeholder="例: 12" />
        <DebugRow label="連続達成日数" value={streak} onChange={setStreak} placeholder="例: 15" />
        <DebugRow label="累計達成日数" value={days} onChange={setDays} placeholder="例: 85" />
        <DebugRow label="最長連続" value={longest} onChange={setLongest} placeholder="例: 18" />
        <DebugRow label="次レベルまで残り日数" value={next} onChange={setNext} placeholder="0〜3" />
        <DebugRow label="今日の素振り回数" value={todaySwing} onChange={setTodaySwing} placeholder="例: 120" />
        <DebugRow label="累計素振り回数" value={totalSwing} onChange={setTotalSwing} placeholder="例: 2400" />

        <label className="legal-consent-row">
          <input type="checkbox" checked={claim} onChange={(e) => setClaim(e.target.checked)} />
          <span className="legal-consent-text">デイリーミッション 達成済</span>
        </label>
        <label className="legal-consent-row">
          <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} />
          <span className="legal-consent-text">保護者承認 済</span>
        </label>

        <div className="empty-txt" style={{ marginTop: '0.6rem', fontWeight: 700 }}>
          バッティングステータス
        </div>
        <DebugRow label="スピード" value={bsSpeed} onChange={setBsSpeed} placeholder="0〜100" />
        <DebugRow label="下半身" value={bsLower} onChange={setBsLower} placeholder="0〜100" />
        <DebugRow label="コース" value={bsCourse} onChange={setBsCourse} placeholder="0〜100" />
        <DebugRow label="ミート" value={bsMeet} onChange={setBsMeet} placeholder="0〜100" />
        <DebugRow label="カスタム" value={bsCustom} onChange={setBsCustom} placeholder="0〜100" />

        <div className="btn-row" style={{ marginTop: '0.8rem' }}>
          <button className="submit" onClick={apply}>適用してリロード</button>
          <button className="outline-btn" onClick={clearAll}>クリアしてリロード</button>
        </div>
      </details>
    </section>
  )
}

function DebugRow({ label, value, onChange, placeholder }) {
  return (
    <label className="field" style={{ marginTop: '0.4rem' }}>
      <span className="field-label">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}
