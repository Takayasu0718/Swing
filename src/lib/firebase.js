// Firebase bootstrap. Reads config from VITE_FIREBASE_* env vars (.env.local).
// Email/Password 認証のみ。匿名サインインは廃止。
// 初回起動時は onAuthStateChanged が解決した時点で authReady が resolve する
// （未ログインなら null）。

import { initializeApp } from 'firebase/app'
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const isConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId)

let app = null
let auth = null
let db = null
let currentUid = null

// Resolves once initial auth state is known (uid or null).
let authReadyResolve
const authReady = new Promise((resolve) => {
  authReadyResolve = resolve
})
let initialAuthResolved = false

const authStateListeners = new Set()

if (isConfigured) {
  try {
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
    db = getFirestore(app)
    console.log('[firebase] initialized')

    onAuthStateChanged(auth, (user) => {
      currentUid = user?.uid ?? null
      if (!initialAuthResolved) {
        initialAuthResolved = true
        console.log('[firebase] initial auth state', currentUid)
        authReadyResolve(currentUid)
      } else {
        console.log('[firebase] auth state change', currentUid)
      }
      for (const cb of authStateListeners) cb(currentUid)
    })
  } catch (e) {
    console.warn('[firebase] init failed', e)
    app = null
    auth = null
    db = null
    initialAuthResolved = true
    authReadyResolve(null)
  }
} else {
  console.log('[firebase] disabled (set VITE_FIREBASE_* in .env.local to enable)')
  initialAuthResolved = true
  authReadyResolve(null)
}

export const isFirebaseEnabled = !!app
export { auth, db, authReady }

export function getAuthUid() {
  return currentUid
}

// auth state 変化を購読。登録直後にも現在値で 1 回コールバックを発火。
export function subscribeAuthState(callback) {
  authStateListeners.add(callback)
  callback(currentUid)
  return () => authStateListeners.delete(callback)
}

export async function signUpEmail(email, password) {
  if (!auth) throw new Error('Firebase Auth が初期化されていません')
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  return cred.user.uid
}

export async function signInEmail(email, password) {
  if (!auth) throw new Error('Firebase Auth が初期化されていません')
  const cred = await signInWithEmailAndPassword(auth, email, password)
  return cred.user.uid
}

export async function signOutUser() {
  if (!auth) return
  await signOut(auth)
}

export async function sendPasswordReset(email) {
  if (!auth) throw new Error('Firebase Auth が初期化されていません')
  await sendPasswordResetEmail(auth, email)
}

// Back-compat alias used by older callers. Always returns the initial-state promise.
export function ensureAnonymousAuth() {
  return authReady
}
