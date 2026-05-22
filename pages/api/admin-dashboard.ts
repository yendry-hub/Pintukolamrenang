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
    const decoded = await admin.auth().verifyIdToken(token)
    const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get()
    const role = userDoc.exists ? userDoc.data()?.role : null
    if (!role || !['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      return res.status(403).json({ error: 'Akun tidak memiliki akses admin. Pastikan dokumen users/{uid} berisi role SUPER_ADMIN atau ADMIN.' })
    }
  } catch (error: any) {
    console.error('/api/admin-dashboard token error:', error)
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  try {
    const db = admin.firestore()
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    const rangeStart = new Date(todayStart)
    rangeStart.setDate(todayStart.getDate() - 4)

    const scanLogsQuery = db
      .collection('scanLogs')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(rangeStart))
      .orderBy('createdAt', 'desc')
      .limit(50)

    const [scanLogsSnap, activeMembersSnap] = await Promise.all([
      scanLogsQuery.get(),
      db.collection('rfidCards').where('active', '==', true).get()
    ])

    const status: GateStatus = await getGateStatus(db)
    const hourlyTrend = Array(7).fill(0)
    const dailyTrend = Array(5).fill(0)
    let totalVisitorsToday = 0

    const scanLogs = scanLogsSnap.docs.map((doc) => {
      const data = doc.data() as Record<string, any>
      const scanDate = toDate(data.createdAt || data.scannedAt)
      const hoursAgo = Math.floor((now.getTime() - scanDate.getTime()) / 3600000)
      const scanDay = new Date(scanDate)
      scanDay.setHours(0, 0, 0, 0)
      const dayDiff = Math.floor((todayStart.getTime() - scanDay.getTime()) / 86400000)

      if (scanDate >= todayStart) {
        totalVisitorsToday += 1
      }

      if (hoursAgo >= 0 && hoursAgo < 7) {
        hourlyTrend[6 - hoursAgo] += 1
      }

      if (dayDiff >= 0 && dayDiff < 5) {
        dailyTrend[4 - dayDiff] += 1
      }

      return {
        uid: String(data.uid || 'Unknown'),
        ticketType: ensureTicketType(data.ticketType),
        gate: getGateLabel(String(data.gateId || data.gate || 'Unknown'), status),
        status: String(data.status || 'INVALID') as ScanLog['status'],
        scannedAt: scanDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    })

    const stats: TicketStats = {
      totalVisitorsToday,
      hourlyTrend,
      dailyTrend,
      activeMembers: activeMembersSnap.size
    }

    return res.status(200).json({ status, stats, recentScans: scanLogs })
  } catch (error: any) {
    console.error('/api/admin-dashboard error:', error)
    return res.status(500).json({ error: error?.message || 'Gagal memuat data dashboard' })
  }
}
