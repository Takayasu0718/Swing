// Firebase bootstrap. Reads config from VITE_FIREBASE_* env vars (.env.local).
// Anonymous sign-in is kicked off as soon as this module is imported, so
// `authReady` resolves before any UI tries to use Firestore.

import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth'
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

// Resolves with the uid (or null) once auth state is known.
let authReadyResolve
const authReady = new Promise((resolve) => {
  authReadyResolve = resolve
})

if (isConfigured) {
  try {
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
    db = getFirestore(app)
    console.log('[firebase] initialized')

    // Kick off anonymous sign-in immediately on module load.
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub()
      if (user) {
        currentUid = user.uid
        console.log('[firebase] auth ready (existing)', user.uid)
        authReadyResolve(user.uid)
        return
      }
      try {
        const cred = await signInAnonymously(auth)
        currentUid = cred.user.uid
        console.log('[firebase] auth ready (anonymous)', cred.user.uid)
        authReadyResolve(cred.user.uid)
      } catch (e) {
        console.error('[firebase] anonymous sign-in failed', e)
        authReadyResolve(null)
      }
    })
  } catch (e) {
    console.warn('[firebase] init failed, continuing on localStorage', e)
    app = null
    auth = null
    db = null
    authReadyResolve(null)
  }
} else {
  console.log('[firebase] disabled (set VITE_FIREBASE_* in .env.local to enable)')
  authReadyResolve(null)
}

export const isFirebaseEnabled = !!app
export { auth, db, authReady }

export function getAuthUid() {
  return currentUid
}

// Back-compat alias: returns the same promise as `authReady`.
export function ensureAnonymousAuth() {
  return authReady
}
