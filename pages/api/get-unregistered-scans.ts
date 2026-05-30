import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const db = admin.firestore()
    const snap = await db
      .collection('unregisteredScans')
      .orderBy('scannedAt', 'desc')
      .limit(50)
      .get()

    const scans = snap.docs.map(doc => {
      const data = doc.data()
      return {
        uid: doc.id,
        gateId: data.gateId || '',
        scannedAt: data.scannedAt?.toDate?.()?.toISOString() || data.scannedAt || null,
        seenCount: data.seenCount || 1,
      }
    })

    return res.status(200).json({ scans })
  } catch (error: any) {
    console.error('/api/get-unregistered-scans error:', error)
    return res.status(500).json({ error: 'Failed to load' })
  }
}
