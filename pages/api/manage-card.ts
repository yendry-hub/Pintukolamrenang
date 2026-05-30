import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.split('Bearer ')[1]

  try {
    const decodedToken = await admin.auth().verifyIdToken(token)
    
    const db = admin.firestore()
    const { uid, ticketType, active, expiryDate, blocked, used, action } = req.body

    if (req.method === 'POST') {
      if (!uid) return res.status(400).json({ error: 'Missing UID' })

      const cardData: any = {
        ticketType: ticketType || 'Member',
        active: active ?? true,
        blocked: blocked ?? false,
        used: used ?? false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }

      if (req.body.qtyAkses !== undefined) {
        cardData.qtyAkses = parseInt(req.body.qtyAkses, 10) || 0
      }

      if (expiryDate) {
        cardData.expiryDate = admin.firestore.Timestamp.fromDate(new Date(expiryDate))
      }

      const cardRef = db.collection('rfidCards').doc(uid)
      const doc = await cardRef.get()

      if (!doc.exists) {
        cardData.createdAt = admin.firestore.FieldValue.serverTimestamp()
        await cardRef.set(cardData)
      } else {
        await cardRef.update(cardData)
      }

      // Hapus dari daftar kartu tidak terdaftar (jika ada)
      try {
        await db.collection('unregisteredScans').doc(uid).delete()
      } catch (_) {
        // silent
      }

      return res.status(200).json({ success: true, message: 'Card updated successfully' })
    }

    if (req.method === 'DELETE' || (req.method === 'POST' && action === 'delete')) {
      const targetUid = uid || req.query.uid
      if (!targetUid) return res.status(400).json({ error: 'Missing UID' })
      
      await db.collection('rfidCards').doc(targetUid as string).delete()
      return res.status(200).json({ success: true, message: 'Card deleted successfully' })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error: any) {
    console.error('manage-card error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
