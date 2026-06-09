import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : ''
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const decoded = await admin.auth().verifyIdToken(token)
    const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get()
    const role = userDoc.exists ? userDoc.data()?.role : null
    if (role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Akun tidak memiliki akses Super Admin.' })
    }
    return res.status(200).json({ role, email: decoded.email })
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }
}
