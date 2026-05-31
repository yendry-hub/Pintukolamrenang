import type { NextApiRequest, NextApiResponse } from 'next'
import initFirebaseAdmin from '@/lib/firebaseAdmin'

const admin = initFirebaseAdmin()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : ''

  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  try {
    await admin.auth().verifyIdToken(token)
  } catch {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const db = admin.firestore()
  const { action, name, newName, price, ticketTypes, prices } = req.body

  try {
    const configRef = db.collection('settings').doc('ticket-config')
    const pricesRef = db.collection('settings').doc('ticket-prices')

    if (action === 'batch') {
      if (!Array.isArray(ticketTypes) || !prices || typeof prices !== 'object') {
        return res.status(400).json({ error: 'Invalid format' })
      }
      await configRef.set({ ticketTypes, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
      await pricesRef.set({ prices, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
      return res.status(200).json({ success: true, ticketTypes, prices })
    }

    const configSnap = await configRef.get()
    const pricesSnap = await pricesRef.get()
    let currentTypes: string[] = configSnap.exists ? configSnap.data()?.ticketTypes || [] : []
    let currentPrices: Record<string, number> = pricesSnap.exists ? pricesSnap.data()?.prices || {} : {}

    switch (action) {
      case 'add': {
        if (!name || price === undefined) {
          return res.status(400).json({ error: 'Name and price required' })
        }
        if (currentTypes.includes(name)) {
          return res.status(400).json({ error: 'Tipe tiket sudah ada' })
        }
        currentTypes.push(name)
        currentTypes.sort()
        currentPrices[name] = Number(price)
        break
      }
      case 'update': {
        if (!name || !newName || price === undefined) {
          return res.status(400).json({ error: 'Name, newName, and price required' })
        }
        const idx = currentTypes.indexOf(name)
        if (idx === -1) return res.status(400).json({ error: 'Tipe tiket tidak ditemukan' })
        if (name !== newName && currentTypes.includes(newName)) {
          return res.status(400).json({ error: 'Nama tipe tiket sudah ada' })
        }
        currentTypes[idx] = newName
        const oldPrice = currentPrices[name]
        delete currentPrices[name]
        currentPrices[newName] = Number(price)
        break
      }
      case 'delete': {
        if (!name) return res.status(400).json({ error: 'Name required' })
        currentTypes = currentTypes.filter((t) => t !== name)
        delete currentPrices[name]
        break
      }
      default:
        return res.status(400).json({ error: 'Invalid action' })
    }

    await configRef.set({ ticketTypes: currentTypes, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })
    await pricesRef.set({ prices: currentPrices, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true })

    return res.status(200).json({ success: true, ticketTypes: currentTypes, prices: currentPrices })
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Gagal menyimpan konfigurasi tiket' })
  }
}
