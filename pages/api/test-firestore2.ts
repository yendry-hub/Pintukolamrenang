import type { NextApiRequest, NextApiResponse } from 'next'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getApps } from 'firebase-admin/app'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

function timeout(ms: number) {
  return new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
  )
}

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const results: Record<string, any> = {
    apps: getApps().length,
    testDefault: {},
    testRest: {},
  }

  // Test 1: Default (gRPC)
  try {
    const db1 = admin.firestore()
    const ref1 = db1.collection('_test').doc('h1')
    await Promise.race([
      ref1.set({ t: Date.now() }, { merge: true }),
      timeout(10000),
    ])
    results.testDefault.ok = true
    await ref1.delete()
  } catch (e: any) {
    results.testDefault.error = e.message || String(e)
  }

  // Test 2: Paksa REST
  try {
    const db2 = getFirestore()
    db2.settings({ preferRest: true })
    const ref2 = db2.collection('_test').doc('h2')
    await Promise.race([
      ref2.set({ t: Date.now() }, { merge: true }),
      timeout(10000),
    ])
    results.testRest.ok = true
    await ref2.delete()
  } catch (e: any) {
    results.testRest.error = e.message || String(e)
  }

  return res.status(200).json(results)
}
