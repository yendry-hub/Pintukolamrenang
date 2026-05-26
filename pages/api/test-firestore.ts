import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const results: Record<string, any> = {
    init: !!admin,
    adminReady: admin.apps.length > 0,
  }

  try {
    const db = admin.firestore()
    results.firestoreInit = true

    const testRef = db.collection('_test_connectivity').doc('health')
    await testRef.set({ ok: true, time: new Date().toISOString() }, { merge: true })
    results.firestoreWrite = true

    const snap = await testRef.get()
    results.firestoreRead = snap.exists

    await testRef.delete()
    results.firestoreDelete = true
  } catch (e: any) {
    results.error = e.message || String(e)
    results.errorCode = e.code || null
  }

  return res.status(200).json(results)
}
