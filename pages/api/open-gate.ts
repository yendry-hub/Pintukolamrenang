import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { gateId, secret } = req.body || {}

  if (secret !== process.env.ESP_GATE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!gateId) {
    return res.status(400).json({ error: 'Missing gateId' })
  }

  try {
    const db = admin.firestore()
    const id = String(gateId)

    // Cek gate dulu
    const gateDoc = await db.collection('gateDevices').doc(id).get()
    if (!gateDoc.exists) {
      return res.status(404).json({ result: 'FAIL', reason: `Gate ${id} not registered` })
    }

    // Tulis perintah OPEN — nanti diambil ESP saat heartbeat berikutnya
    await db.collection('gateCommands').doc(id).set({
      command: 'OPEN',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    })

    return res.status(200).json({ result: 'OPEN', message: `Command sent to ${id}` })
  } catch (error: any) {
    console.error('/api/open-gate error:', error)
    return res.status(500).json({ error: error?.message || 'Failed to open gate' })
  }
}
