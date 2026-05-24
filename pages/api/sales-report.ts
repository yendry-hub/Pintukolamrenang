import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'
import { getTodayStartJakarta, getTodayEndJakarta } from '@/lib/dateUtils'

const admin = initFirebaseAdmin()

interface SalesReportItem {
  ticketType: string
  quantity: number
  totalRevenue: number
  avgPrice: number
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Disable caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : ''

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // Verify token and check admin role
    const decoded = await admin.auth().verifyIdToken(token)
    const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get()
    const role = userDoc.exists ? userDoc.data()?.role : null
    if (!role || !['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      return res.status(403).json({ error: 'Unauthorized' })
    }
  } catch (error: any) {
    console.error('/api/sales-report token error:', error)
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  try {
    // Get filter parameters
    const filterType = req.query.filter || 'today' // today, week, month, all

    // Convert now to Jakarta timezone for date calculations
    const nowInJakarta = new Date(Date.now() + 7 * 60 * 60 * 1000)
    let startDate: Date

    // Calculate start date based on filter (WIB timezone)
    switch (filterType) {
      case 'today':
        startDate = getTodayStartJakarta()
        break
      case 'week': {
        const weekAgoJakarta = new Date(nowInJakarta.getTime() - 7 * 86400000)
        startDate = new Date((weekAgoJakarta.getTime() - 7 * 60 * 60 * 1000))
        break
      }
      case 'month': {
        const monthStart = new Date(Date.UTC(nowInJakarta.getUTCFullYear(), nowInJakarta.getUTCMonth(), 1))
        startDate = new Date(monthStart.getTime() - 7 * 60 * 60 * 1000)
        break
      }
      case 'all':
        startDate = new Date('2000-01-01')
        break
      default:
        startDate = getTodayStartJakarta()
    }

    // Query transactions from Firestore
    const transactionsSnap = await admin
      .firestore()
      .collection('transactions')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
      .get()

    // Process transactions to generate report
    const salesMap: Record<string, { quantity: number; totalRevenue: number; prices: number[] }> = {}

    transactionsSnap.forEach((doc) => {
      const data = doc.data() as any
      // Konversi createdAt ke Date jika itu adalah Timestamp
      const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt)
      const ticketType = data.ticketType || 'Unknown'
      const quantity = data.quantity || 1

      // PERBAIKAN: Gunakan data.price jika data.total tidak ada
      const total = data.total || (data.price * quantity) || 0

      if (!salesMap[ticketType]) {
        salesMap[ticketType] = { quantity: 0, totalRevenue: 0, prices: [] }
      }

      salesMap[ticketType].quantity += quantity
      salesMap[ticketType].totalRevenue += total
      salesMap[ticketType].prices.push(data.price || 0)
    })

    // Convert to report format
    const salesReport: SalesReportItem[] = Object.entries(salesMap).map(([ticketType, data]) => ({
      ticketType,
      quantity: data.quantity,
      totalRevenue: data.totalRevenue,
      avgPrice: data.prices.length > 0 ? data.prices.reduce((a, b) => a + b, 0) / data.prices.length : 0
    }))

    // Calculate totals
    const totalQuantity = salesReport.reduce((sum, item) => sum + item.quantity, 0)
    const totalRevenue = salesReport.reduce((sum, item) => sum + item.totalRevenue, 0)

    console.log(`GET /api/sales-report (${filterType}) - total transactions: ${transactionsSnap.size}, total revenue: ${totalRevenue}`)

    return res.status(200).json({
      filter: filterType,
      startDate,
      generatedAt: new Date(),
      summary: {
        totalTransactions: transactionsSnap.size,
        totalQuantity,
        totalRevenue
      },
      details: salesReport
    })
  } catch (error: any) {
    console.error('Error generating sales report:', error)
    return res.status(500).json({
      error: error?.message || 'Gagal membuat laporan penjualan'
    })
  }
}

