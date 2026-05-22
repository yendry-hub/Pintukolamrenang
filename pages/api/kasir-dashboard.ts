import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'
import { getGateStatus } from '@/lib/gateDevices'
import type { GateStatus, ScanLog, TicketStats, TicketType } from '@/lib/types'

const admin = initFirebaseAdmin()

function toDate(value: any): Date {
  if (!value) {
    return new Date()
  }
  if (typeof value.toDate === 'function') {
    return value.toDate()
  }
  return new Date(value)
}

function getGateLabel(gateId: string, status: GateStatus): string {
  return status.gates?.find((gate) => gate.gateId === gateId)?.name || gateId
}

function formatScanLog(doc: FirebaseFirestore.QueryDocumentSnapshot, status: GateStatus): ScanLog {
  const data = doc.data() as Record<string, any>
  const createdAt = toDate(data.createdAt || data.scannedAt)
  const gateId = String(data.gateId || data.gate || 'Unknown')

  return {
    uid: String(data.uid || 'Unknown'),
    ticketType: ensureTicketType(data.ticketType),
    gate: getGateLabel(gateId, status),
    status: String(data.status || 'INVALID') as ScanLog['status'],
    scannedAt: createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
}

function ensureTicketType(value: unknown): TicketType {
  const allowed: TicketType[] = ['Tiket Harian', 'Member', 'VIP', 'Paket Keluarga', 'Tiket Anak', 'Tiket Dewasa']
  const ticketType = String(value) as TicketType
  return allowed.includes(ticketType) ? ticketType : 'Tiket Harian'
}

async function authorizeCashier(token: string) {
  const decoded = await admin.auth().verifyIdToken(token)
  const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get()
  const role = userDoc.exists ? userDoc.data()?.role : null
  if (role !== 'KASIR') {
    throw new Error('Forbidden')
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : ''

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    await authorizeCashier(token)
  } catch (error: any) {
    return res.status(error.message === 'Forbidden' ? 403 : 401).json({ error: error.message === 'Forbidden' ? 'Akun tidak memiliki akses kasir. Pastikan dokumen users/{uid} berisi role KASIR.' : error.message || 'Unauthorized' })
  }

  try {
    const db = admin.firestore()
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const [scanLogsSnap, todayScansSnap, activeMembersSnap] = await Promise.all([
      db.collection('scanLogs').orderBy('createdAt', 'desc').limit(25).get(),
      db
        .collection('scanLogs')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(todayStart))
        .get(),
      db.collection('rfidCards').where('active', '==', true).get()
    ])

    const status: GateStatus = await getGateStatus(db)
    const recentScans = scanLogsSnap.docs.map((doc) => formatScanLog(doc, status))
    const totalVisitorsToday = todayScansSnap.size

    const stats: TicketStats = {
      totalVisitorsToday,
      hourlyTrend: Array(7).fill(0),
      dailyTrend: Array(5).fill(0),
      activeMembers: activeMembersSnap.size
    }

    return res.status(200).json({ status, stats, recentScans })
  } catch (error: any) {
    console.error('/api/kasir-dashboard error:', error)
    return res.status(500).json({ error: error?.message || 'Failed to load cashier dashboard' })
  }
}
