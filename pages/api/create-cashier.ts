import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

async function verifyAdminToken(token: string) {
  const decoded = await admin.auth().verifyIdToken(token)
  const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get()
  const role = userDoc.exists ? userDoc.data()?.role : null
  if (!role || !['SUPER_ADMIN', 'ADMIN'].includes(role)) {
    throw new Error('Forbidden')
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : ''

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    await verifyAdminToken(token)
  } catch (error: any) {
    return res.status(error.message === 'Forbidden' ? 403 : 401).json({ error: error.message || 'Unauthorized' })
  }

  const { email, password, displayName } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }

  try {
    const user = await admin.auth().createUser({
      email,
      password,
      displayName: typeof displayName === 'string' ? displayName : undefined
    })

    await admin.firestore().collection('users').doc(user.uid).set({
      email,
      displayName: displayName || null,
      role: 'KASIR',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    })

    return res.status(200).json({ uid: user.uid, email: user.email })
  } catch (error: any) {
    console.error('/api/create-cashier error:', error)
    return res.status(500).json({ error: error?.message || 'Failed to create cashier user' })
  }
}
