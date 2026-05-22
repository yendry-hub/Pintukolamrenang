import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.split('Bearer ')[1]

  try {
    const decodedToken = await admin.auth().verifyIdToken(token)
    // Optional: check if user is admin
    // if (!decodedToken.admin) return res.status(403).json({ error: 'Forbidden' })

    const db = admin.firestore()
    const snapshot = await db.collection('rfidCards').orderBy('createdAt', 'desc').get()
    
    const cards = snapshot.docs.map(doc => ({
      uid: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
      lastUsedAt: doc.data().lastUsedAt?.toDate?.()?.toISOString() || doc.data().lastUsedAt,
      expiryDate: doc.data().expiryDate?.toDate?.()?.toISOString() || doc.data().expiryDate,
    }))

    return res.status(200).json({ cards })
  } catch (error: any) {
    console.error('get-cards error:', error)
    return res.status(500).json({ error: 'Failed to fetch cards' })
  }
}
