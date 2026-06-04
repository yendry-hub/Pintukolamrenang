import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()
const db = admin.firestore()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { secret, gateId, uid } = req.body || {}

  if (!secret || !gateId) {
    return res.status(400).json({ error: 'secret and gateId required' })
  }

  try {
    // Verify secret
    const settingsSnap = await db.collection('settings').doc('gate-secret').get()
    const expectedSecret = settingsSnap.exists ? settingsSnap.data()?.secret : null
    if (!expectedSecret || secret !== expectedSecret) {
      return res.status(403).json({ error: 'Invalid secret' })
    }

    // Write scan log
    const scanEntry = {
      uid: uid || 'BUTTON',
      ticketType: 'Manual',
      gateId,
      status: 'OPEN',
      source: 'button',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      scannedAt: admin.firestore.FieldValue.serverTimestamp(),
    }

    await db.collection('scanLogs').add(scanEntry)

    console.log(`BUTTON TRIGGER: gate=${gateId} logged`)

    return res.status(200).json({ result: 'OK' })
  } catch (error: any) {
    console.error('/api/button-trigger error:', error)
    return res.status(500).json({ error: error?.message || 'Internal error' })
  }
}
