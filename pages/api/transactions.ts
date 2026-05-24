import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'
import { getTodayStartJakarta, getTodayEndJakarta } from '@/lib/dateUtils'
import type { Transaction } from '@/lib/types'

const admin = initFirebaseAdmin()

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
      return res.status(403).json({ error: 'Forbidden' })
    }
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  try {
    const db = admin.firestore()
    const filterType = req.query.filter || 'today'
    const limit = Math.min(Number(req.query.limit) || 100, 500)

    let startDate: Date
    let endDate: Date | null = null

    switch (filterType) {
      case 'today': {
        startDate = getTodayStartJakarta()
        endDate = getTodayEndJakarta()
        break
      }
      case 'week': {
        const now = new Date(Date.now() + 7 * 60 * 60 * 1000)
        const weekAgo = new Date(now.getTime() - 7 * 86400000)
        startDate = new Date(Date.UTC(weekAgo.getUTCFullYear(), weekAgo.getUTCMonth(), weekAgo.getUTCDate()) - 7 * 60 * 60 * 1000)
        endDate = getTodayEndJakarta()
        break
      }
      case 'month': {
        const now = new Date(Date.now() + 7 * 60 * 60 * 1000)
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
        startDate = new Date(monthStart.getTime() - 7 * 60 * 60 * 1000)
        endDate = getTodayEndJakarta()
        break
      }
      case 'all':
        startDate = new Date('2000-01-01')
        break
      default:
        startDate = getTodayStartJakarta()
        endDate = getTodayEndJakarta()
    }

    let query: FirebaseFirestore.Query = db.collection('transactions')

    if (startDate) {
      query = query.where('createdAt', '>=', admin.firestore.Timestamp.fromDate(startDate))
    }
    if (endDate) {
      query = query.where('createdAt', '<', admin.firestore.Timestamp.fromDate(endDate))
    }

    const snap = await query
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()

    const transactions: Transaction[] = snap.docs.map((doc) => {
      const d = doc.data() as Record<string, any>
      const createdAt = d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt)
      return {
        transactionId: String(d.transactionId || doc.id),
        uid: String(d.uid || ''),
        ticketType: String(d.ticketType || 'Unknown') as Transaction['ticketType'],
        price: Number(d.price) || 0,
        quantity: Number(d.quantity) || 1,
        total: Number(d.total) || Number(d.price) || 0,
        cashier: String(d.cashier || ''),
        paymentMethod: String(d.paymentMethod || ''),
        paymentStatus: String(d.paymentStatus || 'COMPLETED') as Transaction['paymentStatus'],
        createdAt: createdAt.toISOString(),
        receiptPrinted: Boolean(d.receiptPrinted)
      }
    })

    return res.status(200).json({ transactions })
  } catch (error: any) {
    console.error('/api/transactions error:', error)
    return res.status(500).json({ error: error?.message || 'Failed to load transactions' })
  }
}
