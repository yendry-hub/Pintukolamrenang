import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged as firebaseOnAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'YOUR_FIREBASE_API_KEY',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'your-app.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'your-app',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'your-app.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:123456789:web:abcdefg',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined
}

export function initFirebase() {
  if (!getApps().length) {
    initializeApp(firebaseConfig)
  }
}

export function getFirebaseAuth() {
  initFirebase()
  return getAuth()
}

export function getFirebaseFirestore() {
  initFirebase()
  return getFirestore()
}

export async function loginWithEmail(email: string, password: string) {
  const auth = getFirebaseAuth()
  return signInWithEmailAndPassword(auth, email, password)
}

export function onFirebaseAuthStateChanged(callback: (user: ReturnType<typeof getFirebaseAuth>['currentUser']) => void) {
  const auth = getFirebaseAuth()
  return firebaseOnAuthStateChanged(auth, callback)
}

export async function logoutFirebase() {
  const auth = getFirebaseAuth()
  return firebaseSignOut(auth)
}

export async function getFirebaseIdToken() {
  const auth = getFirebaseAuth()
  const user = auth.currentUser
  if (user) {
    return user.getIdToken()
  }

  return new Promise<string>((resolve, reject) => {
    const unsubscribe = firebaseOnAuthStateChanged(
      auth,
      async (nextUser) => {
        if (nextUser) {
          unsubscribe()
          try {
            const token = await nextUser.getIdToken()
            resolve(token)
          } catch (error) {
            reject(error)
          }
        }
      },
      (error) => {
        unsubscribe()
        reject(error)
      }
    )

    setTimeout(() => {
      unsubscribe()
      reject(new Error('Authentication timed out'))
    }, 6000)
  })
}
