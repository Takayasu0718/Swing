import { useState } from 'react'
import { signUpEmail, signInEmail, sendPasswordReset } from '../lib/firebase.js'

// Firebase Auth エラーコードを日本語へ。
const ERROR_MESSAGES = {
  'auth/invalid-email': 'メールアドレスの形式が正しくありません',
  'auth/missing-email': 'メールアドレスを入力してください',
  'auth/missing-password': 'パスワードを入力してください',
  'auth/weak-password': 'パスワードは6文字以上にしてください',
  'auth/email-already-in-use': 'このメールアドレスは既に登録されています',
  'auth/user-not-found': 'メールアドレスまたはパスワードが違います',
  'auth/wrong-password': 'メールアドレスまたはパスワードが違います',
  'auth/invalid-credential': 'メールアドレスまたはパスワードが違います',
  'auth/too-many-requests': 'リクエストが多すぎます。少し時間をおいて再度お試しください',
  'auth/network-request-failed': 'ネットワークエラーが発生しました',
}

function translateError(e) {
  if (!e) return '不明なエラーが発生しました'
  const code = e.code || ''
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code]
  return e.message || '不明なエラーが発生しました'
}

export default function LoginScreen({ onOpenLegal }) {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  // サインアップ時のみ必須となる規約・プライバシーポリシー同意。
  const [agreedLegal, setAgreedLegal] = useState(false)

  const trimmedEmail = email.trim()

  const submit = async () => {
    if (submitting) return
    setError('')
    setInfo('')
    if (!trimmedEmail) return setError('メールアドレスを入力してください')
    if (mode !== 'reset') {
      if (!password) return setError('パスワードを入力してください')
      if (mode === 'signup' && password.length < 6) {
        return setError('パスワードは6文字以上にしてください')
      }
      if (mode === 'signup' && !agreedLegal) {
        return setError('利用規約・プライバシーポリシーに同意してください')
      }
    }
    setSubmitting(true)
    try {
      if (mode === 'signup') {
        await signUpEmail(trimmedEmail, password)
        // onAuthStateChanged 経由で App.jsx 側のルーティングが切り替わる
      } else if (mode === 'signin') {
        await signInEmail(trimmedEmail, password)
      } else {
        await sendPasswordReset(trimmedEmail)
        setInfo('パスワード再設定メールを送信しました。受信トレイをご確認ください。')
      }
    } catch (e) {
      console.error('[login] failed', e)
      setError(translateError(e))
    } finally {
      setSubmitting(false)
    }
  }

  const switchMode = (next) => {
    setMode(next)
    setError('')
    setInfo('')
  }

  return (
    <div className="screen login-screen">
      <h1 className="screen-title">
        {mode === 'signup' ? 'アカウント作成' : mode === 'reset' ? 'パスワード再設定' : 'ログイン'}
      </h1>

      <section className="info-card">
        <label className="field">
          <span className="field-label">メールアドレス</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        {mode !== 'reset' && (
          <label className="field">
            <span className="field-label">パスワード{mode === 'signup' && ' (6文字以上)'}</span>
            <input
              type="password"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
            />
          </label>
        )}

        {mode === 'signup' && (
          <label className="legal-consent-row">
            <input
              type="checkbox"
              checked={agreedLegal}
              onChange={(e) => setAgreedLegal(e.target.checked)}
            />
            <span className="legal-consent-text">
              <button
                type="button"
                className="link-btn"
                onClick={() => onOpenLegal?.('terms')}
              >
                利用規約
              </button>
              ・
              <button
                type="button"
                className="link-btn"
                onClick={() => onOpenLegal?.('privacy')}
              >
                プライバシーポリシー
              </button>
              に同意します
            </span>
          </label>
        )}

        {error && <div className="form-error">{error}</div>}
        {info && <div className="form-info">{info}</div>}

        <div className="btn-row">
          <button
            className="submit"
            onClick={submit}
            disabled={submitting || (mode === 'signup' && !agreedLegal)}
          >
            {submitting
              ? '送信中…'
              : mode === 'signup'
                ? 'アカウントを作成'
                : mode === 'reset'
                  ? '再設定メールを送信'
                  : 'ログイン'}
          </button>
        </div>

        <div className="login-links">
          {mode === 'signin' && (
            <>
              <button className="link-btn" type="button" onClick={() => switchMode('signup')}>
                新規アカウント作成
              </button>
              <span className="login-sep">/</span>
              <button className="link-btn" type="button" onClick={() => switchMode('reset')}>
                パスワードを忘れた
              </button>
            </>
          )}
          {mode === 'signup' && (
            <button className="link-btn" type="button" onClick={() => switchMode('signin')}>
              既にアカウントをお持ちの方はこちら
            </button>
          )}
          {mode === 'reset' && (
            <button className="link-btn" type="button" onClick={() => switchMode('signin')}>
              ログイン画面に戻る
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
