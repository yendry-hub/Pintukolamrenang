import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'
import { getGateStatus } from '@/lib/gateDevices'
import { getTodayStartJakarta, getTodayEndJakarta } from '@/lib/dateUtils'
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
  const nowInJakarta = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const scanInJakarta = new Date(createdAt.getTime() + 7 * 60 * 60 * 1000)

  return {
    uid: String(data.uid || 'Unknown'),
    ticketType: ensureTicketType(data.ticketType),
    gate: getGateLabel(gateId, status),
    status: String(data.status || 'INVALID') as ScanLog['status'],
    scannedAt: createdAt.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }),
    scannedDate: scanInJakarta.getUTCFullYear() !== nowInJakarta.getUTCFullYear() || scanInJakarta.getUTCMonth() !== nowInJakarta.getUTCMonth() || scanInJakarta.getUTCDate() !== nowInJakarta.getUTCDate()
      ? createdAt.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' })
      : undefined
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
    const todayStart = getTodayStartJakarta()
    const todayEnd = getTodayEndJakarta()

    const rangeStart = new Date(todayStart)
    rangeStart.setDate(todayStart.getDate() - 4)

    const [scanLogsSnap, activeMembersSnap, trendSnap] = await Promise.all([
      db
        .collection('scanLogs')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(todayStart))
        .where('createdAt', '<', admin.firestore.Timestamp.fromDate(todayEnd))
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get(),
      db.collection('rfidCards').where('active', '==', true).get(),
      db
        .collection('scanLogs')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(rangeStart))
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get()
    ])

    const status: GateStatus = await getGateStatus(db)
    const recentScans = scanLogsSnap.docs.map((doc) => formatScanLog(doc, status))
    const totalVisitorsToday = scanLogsSnap.size

    const hourlyTrend = Array(7).fill(0)
    const dailyTrend = Array(5).fill(0)
    trendSnap.docs.forEach((doc) => {
      const data = doc.data() as Record<string, any>
      const scanDate = toDate(data.createdAt || data.scannedAt)
      const scanInJakarta = new Date(scanDate.getTime() + 7 * 60 * 60 * 1000)
      const nowInJakarta = new Date(Date.now() + 7 * 60 * 60 * 1000)

      const hoursAgo = Math.floor((nowInJakarta.getTime() - scanInJakarta.getTime()) / 3600000)

      const scanDayStart = new Date(Date.UTC(
        scanInJakarta.getUTCFullYear(),
        scanInJakarta.getUTCMonth(),
        scanInJakarta.getUTCDate()
      ))
      const todayDayStart = new Date(Date.UTC(
        nowInJakarta.getUTCFullYear(),
        nowInJakarta.getUTCMonth(),
        nowInJakarta.getUTCDate()
      ))
      const dayDiff = Math.floor((todayDayStart.getTime() - scanDayStart.getTime()) / 86400000)

      if (hoursAgo >= 0 && hoursAgo < 7) {
        hourlyTrend[6 - hoursAgo] += 1
      }

      if (dayDiff >= 0 && dayDiff < 5) {
        dailyTrend[4 - dayDiff] += 1
      }
    })

    // Fetch today's transaction summary (WIB timezone)
    let todayTransactionCount = 0
    let todayRevenue = 0
    try {
      const todayTransactionsSnap = await db
        .collection('transactions')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(todayStart))
        .where('createdAt', '<', admin.firestore.Timestamp.fromDate(todayEnd))
        .get()

      todayTransactionsSnap.forEach((doc) => {
        const data = doc.data()
        todayTransactionCount++
        todayRevenue += Number(data.total) || Number(data.price) * Number(data.quantity || 1) || 0
      })
    } catch (txErr) {
      console.error('Failed to fetch transactions (index may be missing):', txErr)
    }

    const stats: TicketStats = {
      totalVisitorsToday,
      hourlyTrend,
      dailyTrend,
      activeMembers: activeMembersSnap.size
    }

    return res.status(200).json({
      status,
      stats,
      recentScans,
      todaySummary: {
        transactionCount: todayTransactionCount,
        revenue: todayRevenue
      }
    })
  } catch (error: any) {
    console.error('/api/kasir-dashboard error:', error)
    return res.status(500).json({ error: error?.message || 'Failed to load cashier dashboard' })
  }
}
