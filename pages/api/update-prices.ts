import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : ''

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  let decoded: any
  try {
    // Verify token and check admin role
    decoded = await admin.auth().verifyIdToken(token)
    const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get()
    const role = userDoc.exists ? userDoc.data()?.role : null
    if (!role || !['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      return res.status(403).json({ error: 'Akun tidak memiliki akses admin. Pastikan dokumen users/{uid} berisi role SUPER_ADMIN atau ADMIN.' })
    }
  } catch (error: any) {
    console.error('/api/update-prices token error:', error)
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  try {
    // Validate prices
    const { prices } = req.body
    if (!prices || typeof prices !== 'object') {
      return res.status(400).json({ error: 'Invalid prices format' })
    }

    console.log('POST /api/update-prices - saving prices:', prices)

    // Save prices to Firestore
    await admin.firestore().collection('settings').doc('ticket-prices').set(
      {
        prices,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: decoded.uid
      },
      { merge: true }
    )

    console.log('POST /api/update-prices - prices saved successfully')

    return res.status(200).json({ 
      success: true, 
      message: 'Harga tiket berhasil disimpan',
      prices 
    })
  } catch (error: any) {
    console.error('Error updating prices:', error)
    return res.status(500).json({ 
      error: error?.message || 'Gagal menyimpan harga tiket' 
    })
  }
}
