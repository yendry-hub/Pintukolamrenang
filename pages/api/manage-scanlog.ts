import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : ''
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    const decoded = await admin.auth().verifyIdToken(token)
    const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get()
    const role = userDoc.exists ? userDoc.data()?.role : null
    if (role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Hanya Super Admin yang bisa melakukan perubahan ini.' })
    }
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const db = admin.firestore()
  const { id, fields } = req.body

  if (!id) return res.status(400).json({ error: 'ID scan log wajib diisi' })

  if (req.method === 'PATCH') {
    if (!fields || typeof fields !== 'object') {
      return res.status(400).json({ error: 'Field perubahan wajib diisi' })
    }
    const allowedFields = ['ticketType', 'gate', 'status', 'uid', 'source']
    const updates: Record<string, any> = {}
    for (const key of allowedFields) {
      if (fields[key] !== undefined) updates[key] = fields[key]
    }
    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp()
    try {
      await db.collection('scanLogs').doc(id).update(updates)
      return res.status(200).json({ success: true })
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Gagal mengupdate scan log' })
    }
  }

  if (req.method === 'DELETE') {
    try {
      await db.collection('scanLogs').doc(id).delete()
      return res.status(200).json({ success: true })
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Gagal menghapus scan log' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
