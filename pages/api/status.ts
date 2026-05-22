import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'
import { getGateStatus } from '@/lib/gateDevices'

const admin = initFirebaseAdmin()

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const status = await getGateStatus(admin.firestore())
    return res.status(200).json(status)
  } catch (error: any) {
    console.error('/api/status error:', error)
    return res.status(500).json({ error: error?.message || 'Failed to load gate status' })
  }
}
