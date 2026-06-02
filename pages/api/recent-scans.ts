import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'
import { getGateStatus } from '@/lib/gateDevices'
import { getTodayStartJakarta, getTodayEndJakarta } from '@/lib/dateUtils'
import type { GateStatus, ScanLog, TicketType } from '@/lib/types'
import { normalizeTicketType } from '@/lib/ticketTypes'

const admin = initFirebaseAdmin()

function toDate(value: any): Date {
  if (!value) return new Date()
  if (typeof value.toDate === 'function') return value.toDate()
  return new Date(value)
}

function getGateLabel(gateId: string, status: GateStatus): string {
  return status.gates?.find((gate) => gate.gateId === gateId)?.name || gateId
}


export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const db = admin.firestore()
    const status = await getGateStatus(db)
    const todayStart = getTodayStartJakarta()
    const todayEnd = getTodayEndJakarta()

    const snap = await db
      .collection('scanLogs')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(todayStart))
      .where('createdAt', '<', admin.firestore.Timestamp.fromDate(todayEnd))
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get()

    const scans: ScanLog[] = snap.docs.map((doc) => {
      const data = doc.data() as Record<string, any>
      const createdAt = toDate(data.createdAt || data.scannedAt)
      const gateId = String(data.gateId || data.gate || 'Unknown')
      const nowInJakarta = new Date(Date.now() + 7 * 60 * 60 * 1000)
      const scanInJakarta = new Date(createdAt.getTime() + 7 * 60 * 60 * 1000)

      return {
        uid: String(data.uid || 'Unknown'),
        ticketType: normalizeTicketType(data.ticketType),
        gate: getGateLabel(gateId, status),
        status: String(data.status || 'INVALID') as ScanLog['status'],
        scannedAt: createdAt.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }),
        scannedDate: scanInJakarta.getUTCFullYear() !== nowInJakarta.getUTCFullYear() || scanInJakarta.getUTCMonth() !== nowInJakarta.getUTCMonth() || scanInJakarta.getUTCDate() !== nowInJakarta.getUTCDate()
          ? createdAt.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' })
          : undefined
      }
    })

    return res.status(200).json({ scans, status })
  } catch (error: any) {
    console.error('/api/recent-scans error:', error)
    return res.status(500).json({ error: error?.message || 'Failed to load scans' })
  }
}