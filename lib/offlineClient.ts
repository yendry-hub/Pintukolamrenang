import { openDB } from 'idb'
import type { TicketType } from '@/lib/types'

export type OfflineRole = 'admin' | 'kasir'

export type OfflineTransactionPayload = {
  uid: string
  ticketType: TicketType
  price: number
  quantity: number
  total: number
  paymentMethod: string
}

type OfflineCredential = {
  email: string
  role: OfflineRole
  salt: string
  passwordHash: string
  cachedAt: string
}

type OfflineSession = {
  email: string
  role: OfflineRole
  offline: boolean
  loggedInAt: string
}

type PendingTransaction = {
  id?: number
  localId: string
  payload: OfflineTransactionPayload
  receipt: string
  cashierEmail: string | null
  createdAt: string
}

const DB_NAME = 'kolam-renang-cache'
const DB_VERSION = 2
const STORE_PENDING_TRANSACTIONS = 'pendingTransactions'
const OFFLINE_CREDENTIALS_KEY = 'kolamRenang.offlineCredentials'
const OFFLINE_SESSION_KEY = 'kolamRenang.offlineSession'
const CACHE_PREFIX = 'kolamRenang.cache.'

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('pendingScans')) {
        db.createObjectStore('pendingScans', { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(STORE_PENDING_TRANSACTIONS)) {
        db.createObjectStore(STORE_PENDING_TRANSACTIONS, { keyPath: 'id', autoIncrement: true })
      }
    }
  })
}

function getStoredCredentials(): OfflineCredential[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_CREDENTIALS_KEY) || '[]')
  } catch {
    return []
  }
}

function setStoredCredentials(credentials: OfflineCredential[]) {
  localStorage.setItem(OFFLINE_CREDENTIALS_KEY, JSON.stringify(credentials))
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function randomSalt() {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function hashPassword(password: string, salt: string) {
  if (!crypto.subtle) {
    return btoa(unescape(encodeURIComponent(`${salt}:${password}`)))
  }
  const data = new TextEncoder().encode(`${salt}:${password}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toHex(digest)
}

export async function cacheOfflineCredential(email: string, password: string, role: OfflineRole) {
  const normalizedEmail = email.trim().toLowerCase()
  const salt = randomSalt()
  const passwordHash = await hashPassword(password, salt)
  const credentials = getStoredCredentials().filter(
    (credential) => !(credential.email === normalizedEmail && credential.role === role)
  )

  credentials.push({
    email: normalizedEmail,
    role,
    salt,
    passwordHash,
    cachedAt: new Date().toISOString()
  })

  setStoredCredentials(credentials)
  setOfflineSession(normalizedEmail, role, false)
}

export async function verifyOfflineCredential(email: string, password: string, role: OfflineRole) {
  const normalizedEmail = email.trim().toLowerCase()
  const credential = getStoredCredentials().find(
    (item) => item.email === normalizedEmail && item.role === role
  )

  if (!credential) return false

  const passwordHash = await hashPassword(password, credential.salt)
  const verified = passwordHash === credential.passwordHash
  if (verified) {
    setOfflineSession(normalizedEmail, role, true)
  }

  return verified
}

export function setOfflineSession(email: string, role: OfflineRole, offline: boolean) {
  const session: OfflineSession = {
    email: email.trim().toLowerCase(),
    role,
    offline,
    loggedInAt: new Date().toISOString()
  }
  localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(session))
}

export function getOfflineSession(role?: OfflineRole): OfflineSession | null {
  if (typeof window === 'undefined') return null
  try {
    const session = JSON.parse(localStorage.getItem(OFFLINE_SESSION_KEY) || 'null') as OfflineSession | null
    if (!session) return null
    if (role && session.role !== role) return null
    return session
  } catch {
    return null
  }
}

export function clearOfflineSession() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(OFFLINE_SESSION_KEY)
}

export function cacheJson<T>(key: string, value: T) {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({ value, cachedAt: new Date().toISOString() }))
}

export function getCachedJson<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const cached = JSON.parse(localStorage.getItem(`${CACHE_PREFIX}${key}`) || 'null')
    return cached?.value ?? null
  } catch {
    return null
  }
}

export async function queueOfflineTransaction(
  payload: OfflineTransactionPayload,
  cashierEmail: string | null
) {
  const localId = `OFF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const createdAt = new Date().toISOString()
  const receipt = generateOfflineReceipt({
    receiptId: localId,
    placeName: process.env.NEXT_PUBLIC_PLACE_NAME || 'Kolam Renang',
    dateTime: new Date(createdAt),
    payload,
    cashierName: cashierEmail || 'Kasir Offline'
  })

  const db = await getDB()
  await db.add(STORE_PENDING_TRANSACTIONS, {
    localId,
    payload,
    receipt,
    cashierEmail,
    createdAt
  } satisfies PendingTransaction)

  return { localId, receipt }
}

export async function getPendingTransactions() {
  const db = await getDB()
  return db.getAll(STORE_PENDING_TRANSACTIONS) as Promise<PendingTransaction[]>
}

export async function syncPendingTransactions(getToken: () => Promise<string>) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0

  const pending = await getPendingTransactions()
  if (!pending.length) return 0

  const token = await getToken()
  let synced = 0
  const db = await getDB()

  for (const transaction of pending) {
    const response = await fetch('/api/create-transaction', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(transaction.payload)
    })

    if (!response.ok) {
      throw new Error('Gagal sinkron transaksi offline')
    }

    if (transaction.id) {
      await db.delete(STORE_PENDING_TRANSACTIONS, transaction.id)
    }
    synced += 1
  }

  return synced
}

function generateOfflineReceipt(data: {
  receiptId: string
  placeName: string
  dateTime: Date
  payload: OfflineTransactionPayload
  cashierName: string
}) {
  const lineLength = 32
  const separator = '='.repeat(lineLength)
  const dateStr = data.dateTime.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const timeStr = data.dateTime.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  return [
    center(data.placeName, lineLength),
    separator,
    '',
    'BUKTI PEMBAYARAN TIKET',
    'MODE OFFLINE - BELUM SINKRON',
    separator,
    '',
    formatReceiptLine('No Struk', data.receiptId, lineLength),
    formatReceiptLine('Tanggal', dateStr, lineLength),
    formatReceiptLine('Jam', timeStr, lineLength),
    '',
    separator,
    '',
    formatReceiptLine('Jenis Tiket', data.payload.ticketType, lineLength),
    formatReceiptLine('Jumlah', String(data.payload.quantity), lineLength),
    formatReceiptLine('Harga', formatCurrency(data.payload.price), lineLength),
    formatReceiptLine('Total', formatCurrency(data.payload.total), lineLength),
    formatReceiptLine('UID Kartu', data.payload.uid, lineLength),
    formatReceiptLine('Bayar', data.payload.paymentMethod, lineLength),
    '',
    separator,
    '',
    formatReceiptLine('Petugas', data.cashierName, lineLength),
    '',
    separator,
    center('Terima Kasih', lineLength),
    separator,
    ''
  ].join('\n')
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
  if (width <= 0) return [text]

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

  if (currentLine) lines.push(currentLine)
  return lines
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(amount)
}
