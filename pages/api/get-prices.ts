import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

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

  // Disable caching
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')

  try {
    // Try to get prices from Firestore
    const pricesDoc = await admin.firestore().collection('settings').doc('ticket-prices').get()
    
    console.log('GET /api/get-prices - pricesDoc exists:', pricesDoc.exists)
    console.log('GET /api/get-prices - data:', pricesDoc.data())
    
    if (pricesDoc.exists) {
      const data = pricesDoc.data()
      const prices = data?.prices || DEFAULT_PRICES
      console.log('GET /api/get-prices - returning prices:', prices)
      return res.status(200).json({ prices })
    }
    
    // If not found, return default prices
    console.log('GET /api/get-prices - document not found, returning defaults')
    return res.status(200).json({ prices: DEFAULT_PRICES })
  } catch (error: any) {
    console.error('Error fetching prices:', error)
    // Return default prices on error instead of failing
    return res.status(200).json({ prices: DEFAULT_PRICES })
  }
}
