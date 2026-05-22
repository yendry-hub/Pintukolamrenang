import { NextApiRequest, NextApiResponse } from 'next'
import * as admin from 'firebase-admin'
import initializeFirebaseAdmin from '@/lib/firebaseAdmin'

interface TransactionRequest {
  uid: string
  ticketType: string
  price: number
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
    // Get Bearer token
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) {
      return res.status(401).json({ success: false, transactionId: '', receipt: '', error: 'Unauthorized' })
    }

    // Verify token
    const decodedToken = await auth.verifyIdToken(token)
    const uid = decodedToken.uid

    // Get user from Firestore
    const userDoc = await db.collection('users').doc(uid).get()
    if (!userDoc.exists) {
      return res.status(403).json({ success: false, transactionId: '', receipt: '', error: 'User document not found' })
    }

    const userData = userDoc.data()
    const userRole = userData?.role

    // Check if user is KASIR
    if (userRole !== 'KASIR') {
      return res.status(403).json({ success: false, transactionId: '', receipt: '', error: 'Unauthorized. Only KASIR can create transactions.' })
    }

    // Get request body
    const { uid: cardUid, ticketType, price, paymentMethod } = req.body as TransactionRequest

    if (!cardUid || !ticketType || !price || !paymentMethod) {
      return res.status(400).json({ success: false, transactionId: '', receipt: '', error: 'Missing required fields' })
    }

    // Create transaction document
    const transactionRef = db.collection('transactions').doc()
    const transactionId = transactionRef.id
    const now = new Date()
    await transactionRef.set({
      transactionId,
      uid: cardUid,
      ticketType,
      price,
      cashier: userData?.name || userData?.email || uid,
      paymentMethod,
      paymentStatus: 'COMPLETED',
      createdAt: admin.firestore.FieldValue.serverTimestamp(), // Simpan sebagai Timestamp
      receiptPrinted: false,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    })

    // Generate receipt
    const receipt = generateReceipt({
      transactionId,
      placeName: process.env.NEXT_PUBLIC_PLACE_NAME || 'Kolam Renang',
      dateTime: now,
      ticketType,
      price,
      cardUid,
      cashierName: userData?.name || userData?.email || uid
    })

    // Update receipt printed flag
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

interface ReceiptData {
  transactionId: string
  placeName: string
  dateTime: Date
  ticketType: string
  price: number
  cardUid: string
  cashierName: string
}

function generateReceipt(data: ReceiptData): string {
  const { transactionId, placeName, dateTime, ticketType, price, cardUid, cashierName } = data

  // Format date and time
  const dateStr = dateTime.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const timeStr = dateTime.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  // Thermal printer format (80mm width = ~32 characters)
  const lineLength = 32
  const separator = '='.repeat(lineLength)

  const receipt = [
    center(placeName, lineLength),
    separator,
    '',
    'BUKTI PEMBAYARAN TIKET',
    separator,
    '',
    formatReceiptLine('ID Transaksi', transactionId, lineLength),
    formatReceiptLine('Tanggal', dateStr, lineLength),
    formatReceiptLine('Jam', timeStr, lineLength),
    '',
    separator,
    '',
    formatReceiptLine('Jenis Tiket', ticketType, lineLength),
    formatReceiptLine('Harga', formatCurrency(price), lineLength),
    formatReceiptLine('UID Kartu', cardUid, lineLength),
    '',
    separator,
    '',
    formatReceiptLine('Petugas', cashierName, lineLength),
    '',
    separator,
    center('Terima Kasih', lineLength),
    center('Selamat Bersenang-senang', lineLength),
    separator,
    ''
  ].join('\n')

  return receipt
}

function center(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2))
  return ' '.repeat(padding) + text
}

function formatReceiptLine(label: string, value: string, width: number): string {
  const labelText = `${label}: `
  const available = width - labelText.length
  const wrappedLines = wrapText(value, available)
  return [
    `${labelText}${wrappedLines[0]}`,
    ...wrappedLines.slice(1).map((line) => ' '.repeat(labelText.length) + line)
  ].join('\n')
}

function wrapText(text: string, width: number): string[] {
  if (width <= 0) {
    return [text]
  }

  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    if (!currentLine) {
      currentLine = word
    } else if ((currentLine + ' ' + word).length <= width) {
      currentLine += ' ' + word
    } else {
      lines.push(currentLine)
      currentLine = word
    }
  }

  if (currentLine) {
    lines.push(currentLine)
  }

  return lines
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount)
}

