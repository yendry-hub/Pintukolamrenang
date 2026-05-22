import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

function normalizeErrors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((item) => String(item)).slice(0, 20)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { gateId, secret, ipAddress, firmwareVersion, name, errors } = req.body || {}

  if (secret !== process.env.ESP_GATE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!gateId) {
    return res.status(400).json({ error: 'Missing gateId' })
  }

  try {
    const db = admin.firestore()
    const id = String(gateId)
    const remoteAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null

    await db.collection('gateDevices').doc(id).set(
      {
        gateId: id,
        name: name ? String(name) : id,
        status: 'ONLINE',
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        ipAddress: ipAddress ? String(ipAddress) : String(remoteAddress || ''),
        firmwareVersion: firmwareVersion ? String(firmwareVersion) : '',
        errors: normalizeErrors(errors),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    )

    return res.status(200).json({ result: 'OK', gateId: id })
  } catch (error: any) {
    console.error('/api/gate-heartbeat error:', error)
    return res.status(500).json({ error: error?.message || 'Failed to update gate heartbeat' })
  }
}
