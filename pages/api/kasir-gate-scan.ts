import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'
import { getTodayStartJakarta } from '@/lib/dateUtils'

const admin = initFirebaseAdmin()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { gateId, uid, ticketType, note } = req.body || {}

  if (!gateId) {
    return res.status(400).json({ error: 'Missing gateId' })
  }

  try {
    const db = admin.firestore()

    const scanEntry: Record<string, any> = {
      gate: gateId,
      scannedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      scanDate: getTodayStartJakarta(),
      status: 'OPEN',
      note: note || 'manual kasir'
    }

    if (uid) {
      scanEntry.uid = uid
      const cardRef = db.collection('rfidCards').doc(uid)
      const cardSnap = await cardRef.get()
      if (cardSnap.exists) {
        const card = cardSnap.data() || {}
        scanEntry.ticketType = ticketType || card.ticketType || 'Tiket Harian'
        scanEntry.userName = card.userName || card.name || ''

        // Kurangi qtyAkses jika kartu punya kuota
        if (typeof card.qtyAkses === 'number') {
          await cardRef.update({
            qtyAkses: admin.firestore.FieldValue.increment(-1),
          })
        }
      } else {
        scanEntry.ticketType = ticketType || 'Tiket Harian'
      }
    } else {
      scanEntry.uid = 'manual-' + Date.now()
      scanEntry.ticketType = ticketType || 'Tiket Harian'
    }

    const ref = await db.collection('scanLogs').add(scanEntry)

    return res.status(200).json({ result: 'OK', scanLogId: ref.id })
  } catch (error: any) {
    console.error('/api/kasir-gate-scan error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
