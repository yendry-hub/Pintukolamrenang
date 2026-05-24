import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'
import type { PrintoutConfig } from '@/lib/types'

const admin = initFirebaseAdmin()
const DEFAULT_CONFIG: PrintoutConfig = {
  placeName: 'KOLAM RENANG',
  address: '',
  phone: '',
  headerText: '',
  footerMessage1: 'Terima Kasih',
  footerMessage2: 'Selamat Bersenang-senang'
}

async function getConfig(db: FirebaseFirestore.Firestore): Promise<PrintoutConfig> {
  const snap = await db.collection('settings').doc('printout').get()
  if (!snap.exists) return DEFAULT_CONFIG
  const data = snap.data() || {}
  return {
    placeName: String(data.placeName || DEFAULT_CONFIG.placeName),
    address: String(data.address || ''),
    phone: String(data.phone || ''),
    headerText: String(data.headerText || ''),
    footerMessage1: String(data.footerMessage1 || DEFAULT_CONFIG.footerMessage1),
    footerMessage2: String(data.footerMessage2 || DEFAULT_CONFIG.footerMessage2)
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
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

  const db = admin.firestore()

  if (req.method === 'GET') {
    const config = await getConfig(db)
    return res.status(200).json({ config })
  }

  if (req.method === 'POST') {
    const { placeName, address, phone, headerText, footerMessage1, footerMessage2 } = req.body || {}

    await db.collection('settings').doc('printout').set(
      {
        placeName: String(placeName || '').trim() || DEFAULT_CONFIG.placeName,
        address: String(address || '').trim(),
        phone: String(phone || '').trim(),
        headerText: String(headerText || '').trim(),
        footerMessage1: String(footerMessage1 || '').trim() || DEFAULT_CONFIG.footerMessage1,
        footerMessage2: String(footerMessage2 || '').trim() || DEFAULT_CONFIG.footerMessage2,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    )

    const updated = await getConfig(db)
    return res.status(200).json({ config: updated, message: 'Printout config saved' })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
