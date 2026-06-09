import { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'
import { getTodayStartJakarta, getTodayEndJakarta } from '@/lib/dateUtils'

function getDateRange(filter: string, queryStartDate?: string, queryEndDate?: string) {
  if (queryStartDate && queryEndDate) {
    const end = new Date(queryEndDate)
    end.setDate(end.getDate() + 1)
    return { start: new Date(queryStartDate), end }
  }
  switch (filter) {
    case 'today':
      return { start: getTodayStartJakarta(), end: getTodayEndJakarta() }
    case 'week': {
      const start = getTodayStartJakarta()
      start.setDate(start.getDate() - 7)
      return { start, end: getTodayEndJakarta() }
    }
    case 'month': {
      const start = getTodayStartJakarta()
      start.setDate(1)
      return { start, end: getTodayEndJakarta() }
    }
    default:
      return { start: new Date('2000-01-01'), end: getTodayEndJakarta() }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const admin = initFirebaseAdmin()
  const auth = admin.auth()
  const db = admin.firestore()

  try {
    await auth.verifyIdToken(token)
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const filter = (req.query.filter as string) || 'today'
  const queryStartDate = req.query.startDate as string | undefined
  const queryEndDate = req.query.endDate as string | undefined
  const { start, end } = getDateRange(filter, queryStartDate, queryEndDate)

  // Fetch current ticket prices
  let prices: Record<string, number> = {}
  try {
    const pricesSnap = await db.collection('settings').doc('ticket-prices').get()
    if (pricesSnap.exists) prices = pricesSnap.data()?.prices || {}
  } catch {}

  const snapshot = await db
    .collection('scanLogs')
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(start))
    .where('createdAt', '<', admin.firestore.Timestamp.fromDate(end))
    .orderBy('createdAt', 'desc')
    .get()

  const groups: Record<string, { count: number; items: any[] }> = {}
  const scanLogs: any[] = []

  snapshot.forEach((doc: any) => {
    const data = { id: doc.id, ...doc.data() }
    scanLogs.push(data)
    const type = data.ticketType || 'Unknown'
    if (!groups[type]) groups[type] = { count: 0, items: [] }
    groups[type].count++
    groups[type].items.push(data)
  })

  const total = scanLogs.length
  let grandTotal = 0
  const breakdown = Object.entries(groups)
    .map(([ticketType, info]) => {
      const price = prices[ticketType] || 0
      const totalRevenue = info.count * price
      grandTotal += totalRevenue
      return {
        ticketType,
        count: info.count,
        price,
        totalRevenue,
        percentage: total > 0 ? Math.round((info.count / total) * 100) : 0,
        items: info.items,
      }
    })
    .sort((a, b) => b.count - a.count)

  return res.status(200).json({
    filter,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    generatedAt: new Date().toISOString(),
    summary: { totalVisitors: total, grandTotal },
    breakdown,
  })
}
