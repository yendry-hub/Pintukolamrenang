import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'
import { triggerGateHttp } from '@/lib/gateHttp'

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
    const result = await triggerGateHttp(db, String(gateId))
    if (result.ok) {
      return res.status(200).json({ result: 'OPEN', message: result.msg })
    }
    return res.status(502).json({ result: 'FAIL', reason: result.msg })
  } catch (error: any) {
    console.error('/api/open-gate error:', error)
    return res.status(500).json({ error: error?.message || 'Failed to open gate' })
  }
}
