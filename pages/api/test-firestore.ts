import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

function timeout(ms: number) {
  return new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
  )
}

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const results: Record<string, any> = {
    init: !!admin,
    adminReady: admin.apps.length > 0,
    projectId: process.env.FIREBASE_PROJECT_ID || '(not set)',
    hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
    hasApplicationCredentials: !!process.env.GOOGLE_APPLICATION_CREDENTIALS,
  }

  try {
    const db = admin.firestore()
    results.firestoreInit = true

    const testRef = db.collection('_test_connectivity').doc('health')
    await Promise.race([
      testRef.set({ ok: true, time: new Date().toISOString() }, { merge: true }),
      timeout(15000),
    ])
    results.firestoreWrite = true

    const snap = await Promise.race([
      testRef.get(),
      timeout(15000),
    ])
    results.firestoreRead = snap.exists

    await Promise.race([
      testRef.delete(),
      timeout(15000),
    ])
    results.firestoreDelete = true
  } catch (e: any) {
    results.error = e.message || String(e)
    results.errorCode = e.code || null
  }

  return res.status(200).json(results)
}
