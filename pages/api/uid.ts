import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { uid, gateId, secret } = req.body || {}

  if (secret !== process.env.ESP_GATE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!uid || !gateId) {
    return res.status(400).json({ error: 'Missing uid or gateId' })
  }

  try {
    const db = admin.firestore()
    const cardRef = db.collection('rfidCards').doc(uid)
    const cardSnap = await cardRef.get()

    if (!cardSnap.exists) {
      return res.status(404).json({ result: 'FAIL', reason: 'UID not registered' })
    }

    const card = cardSnap.data() || {}
    let expiryValid = true
    if (card.expiryDate) {
      if (card.expiryDate.toDate && typeof card.expiryDate.toDate === 'function') {
        expiryValid = card.expiryDate.toDate() > new Date()
      } else {
        expiryValid = new Date(card.expiryDate).getTime() > new Date().getTime()
      }
    }

    const isActive = Boolean(card.active && expiryValid)
    const qtyAkses = card.qtyAkses
    const hasQtyAkses = typeof qtyAkses === 'number'

    let valid: boolean
    if (hasQtyAkses) {
      valid = isActive && qtyAkses > 0 && !card.blocked
    } else {
      valid = isActive && !card.used && !card.blocked
    }

    if (!valid) {
      return res.status(400).json({ result: 'FAIL', reason: card.blocked ? 'Card blocked' : 'Ticket invalid or expired' })
    }

    // Tulis pending scan — pindah ke scanLogs hanya setelah ESP konfirmasi (ack)
    await db.collection('pendingScans').doc(uid).set({
      uid,
      gateId,
      ticketType: card.ticketType ?? 'Unknown',
      scannedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      cardData: card
    })

    // Kurangi qtyAkses atau tandai used
    const updateData: Record<string, any> = {
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
    }
    if (hasQtyAkses) {
      updateData.qtyAkses = admin.firestore.FieldValue.increment(-1)
    } else {
      updateData.used = true
    }
    await cardRef.update(updateData)

    return res.status(200).json({ result: 'OPEN' })
  } catch (error: any) {
    console.error('/api/uid error:', error)
    return res.status(500).json({ error: 'Firebase Admin initialization failed. Check server credentials.' })
  }
}
