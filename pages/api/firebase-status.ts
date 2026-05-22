import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Try a simple Firestore operation to validate Admin SDK connectivity
    const db = admin.firestore()
    const collections = await db.listCollections()
    return res.status(200).json({ connected: true, collections: collections.map((c) => c.id) })
  } catch (err: any) {
    console.error('/api/firebase-status error:', err)
    return res.status(200).json({ connected: false, error: err.message || String(err) })
  }
}
