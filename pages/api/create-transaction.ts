import { NextApiRequest, NextApiResponse } from 'next'
import * as admin from 'firebase-admin'
import initializeFirebaseAdmin from '@/lib/firebaseAdmin'
import { generateReceipt } from '@/lib/receipt'
import { normalizeTicketType } from '@/lib/ticketTypes'

interface TransactionRequest {
  uid: string
  ticketType: string
  price: number
  quantity: number
  total: number
  paymentMethod: string
}

interface TransactionResponse {
  success: boolean
  transactionId: string
  receipt: string
  error?: string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TransactionResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, transactionId: '', receipt: '', error: 'Method not allowed' })
  }

  initializeFirebaseAdmin()
  const auth = admin.auth()
  const db = admin.firestore()

  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return res.status(401).json({ success: false, transactionId: '', receipt: '', error: 'Unauthorized' })
    }

    const decodedToken = await auth.verifyIdToken(token)
    const uid = decodedToken.uid

    const userDoc = await db.collection('users').doc(uid).get()
    if (!userDoc.exists) {
      return res.status(403).json({ success: false, transactionId: '', receipt: '', error: 'User document not found' })
    }

    const userData = userDoc.data()
    if (userData?.role !== 'KASIR') {
      return res.status(403).json({ success: false, transactionId: '', receipt: '', error: 'Unauthorized. Only KASIR can create transactions.' })
    }

    const { uid: cardUid, ticketType, price, quantity = 1, total, paymentMethod } = req.body as TransactionRequest
    const normalizedTicketType = normalizeTicketType(ticketType)

    if (!cardUid || !normalizedTicketType || !price || !paymentMethod) {
      return res.status(400).json({ success: false, transactionId: '', receipt: '', error: 'Missing required fields' })
    }

    const transactionRef = db.collection('transactions').doc()
    const transactionId = transactionRef.id
    const now = new Date()
    const totalAmount = total || price * quantity
    const cashierName = userData?.name || userData?.email || uid

    await transactionRef.set({
      transactionId,
      uid: cardUid,
      ticketType: normalizedTicketType,
      price,
      quantity,
      total: totalAmount,
      cashier: cashierName,
      paymentMethod,
      paymentStatus: 'COMPLETED',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      receiptPrinted: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    })

    const printoutSnap = await db.collection('settings').doc('printout').get()
    const printoutCfg = printoutSnap.exists ? (printoutSnap.data() as any) : null
    const receiptCfg = printoutCfg ? {
      placeName: String(printoutCfg.placeName || 'KOLAM RENANG'),
      address: String(printoutCfg.address || ''),
      phone: String(printoutCfg.phone || ''),
      headerText: String(printoutCfg.headerText || ''),
      footerMessage1: String(printoutCfg.footerMessage1 || 'Terima Kasih'),
      footerMessage2: String(printoutCfg.footerMessage2 || 'Selamat Bersenang-senang')
    } : undefined

    const receipt = generateReceipt({
      transactionId,
      dateTime: now,
      ticketType,
      price,
      quantity,
      total: totalAmount,
      cardUid,
      cashierName,
      paymentMethod
    }, receiptCfg)

    await transactionRef.update({ receiptPrinted: true })

    return res.status(200).json({
      success: true,
      transactionId,
      receipt
    })
  } catch (error: any) {
    console.error('Error creating transaction:', error)
    return res.status(500).json({
      success: false,
      transactionId: '',
      receipt: '',
      error: error?.message || 'Failed to create transaction'
    })
  }
}

