import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { uid } = req.query
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ error: 'Missing uid' })
  }

  try {
    const db = admin.firestore()
    const cardSnap = await db.collection('rfidCards').doc(uid).get()

    if (!cardSnap.exists) {
      return res.status(404).json({ error: 'Card not found' })
    }

    const data = cardSnap.data() || {}
    const card = {
      uid: cardSnap.id,
      ticketType: data.ticketType || 'Unknown',
      active: data.active ?? true,
      blocked: data.blocked ?? false,
      qtyAkses: typeof data.qtyAkses === 'number' ? data.qtyAkses : undefined,
      userName: data.userName || data.name || '',
      expiryDate: data.expiryDate?.toDate?.()?.toISOString() || data.expiryDate || null,
    }

    return res.status(200).json({ card })
  } catch (error: any) {
    console.error('/api/get-card error:', error)
    return res.status(500).json({ error: error.message || 'Failed to load card' })
  }
}
