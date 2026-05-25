import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

function normalizeErrors(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((item) => String(item)).slice(0, 20)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { gateId, secret, ipAddress, firmwareVersion, name, errors, commandExecuted, scanAck } = req.body || {}

  if (secret !== process.env.ESP_GATE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!gateId) {
    return res.status(400).json({ error: 'Missing gateId' })
  }

  try {
    const db = admin.firestore()
    const id = String(gateId)
    const remoteAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null

    const batch = db.batch()

    batch.set(db.collection('gateDevices').doc(id), {
      gateId: id,
      name: name ? String(name) : id,
      status: 'ONLINE',
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      ipAddress: ipAddress ? String(ipAddress) : String(remoteAddress || ''),
      firmwareVersion: firmwareVersion ? String(firmwareVersion) : '',
      errors: normalizeErrors(errors),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })

    // Hapus command hanya jika ESP sudah konfirmasi
    if (commandExecuted === true) {
      batch.delete(db.collection('gateCommands').doc(id))
    }

    await batch.commit()

    // Pindahkan pendingScan ke scanLogs jika ESP konfirmasi
    if (scanAck) {
      const scanUid = String(scanAck)
      const pendingRef = db.collection('pendingScans').doc(scanUid)
      const pendingSnap = await pendingRef.get()
      if (pendingSnap.exists) {
        const data = pendingSnap.data() || {}
        await db.collection('scanLogs').add({
          uid: scanUid,
          gateId: id,
          status: 'VALID',
          ticketType: data.ticketType ?? 'Unknown',
          scannedAt: data.scannedAt || admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        })
        await pendingRef.delete()
      }
    }

    // Baca perintah baru (kalau belum terhapus oleh ack di atas)
    const body: Record<string, any> = { result: 'OK', gateId: id }
    const cmdSnap = await db.collection('gateCommands').doc(id).get()
    if (cmdSnap.exists) {
      body.command = cmdSnap.data()?.command || null
    }
    return res.status(200).json(body)
  } catch (error: any) {
    console.error('/api/gate-heartbeat error:', error)
    return res.status(500).json({ error: error?.message || 'Failed to update gate heartbeat' })
  }
}
