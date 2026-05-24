import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

const DEFAULT_TICKET_TYPES = ['Tiket Harian', 'Member', 'VIP', 'Paket Keluarga', 'Tiket Anak', 'Tiket Dewasa']
const DEFAULT_PAYMENT_METHODS = ['Tunai', 'Kartu Debit', 'Kartu Kredit', 'E-Wallet']
const DEFAULT_PRICES: Record<string, number> = {
  'Tiket Harian': 50000,
  Member: 100000,
  VIP: 75000,
  'Paket Keluarga': 200000,
  'Tiket Anak': 30000,
  'Tiket Dewasa': 50000
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    const db = admin.firestore()
    const configDoc = await db.collection('settings').doc('ticket-config').get()
    const pricesDoc = await db.collection('settings').doc('ticket-prices').get()

    let ticketTypes = DEFAULT_TICKET_TYPES
    let paymentMethods = DEFAULT_PAYMENT_METHODS
    let prices = DEFAULT_PRICES

    if (configDoc.exists) {
      const data = configDoc.data()
      if (data?.ticketTypes && Array.isArray(data.ticketTypes) && data.ticketTypes.length > 0) {
        ticketTypes = data.ticketTypes
      }
      if (data?.paymentMethods && Array.isArray(data.paymentMethods) && data.paymentMethods.length > 0) {
        paymentMethods = data.paymentMethods
      }
    }

    if (pricesDoc.exists) {
      const data = pricesDoc.data()
      if (data?.prices && typeof data.prices === 'object') {
        prices = data.prices
      }
    }

    return res.status(200).json({ ticketTypes, paymentMethods, prices })
  } catch (error: any) {
    console.error('Error fetching ticket config:', error)
    return res.status(200).json({
      ticketTypes: DEFAULT_TICKET_TYPES,
      paymentMethods: DEFAULT_PAYMENT_METHODS,
      prices: DEFAULT_PRICES
    })
  }
}
