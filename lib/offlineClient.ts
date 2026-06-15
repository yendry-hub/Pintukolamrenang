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
const DB_VERSION = 4
const STORE_PENDING_TRANSACTIONS = 'pendingTransactions'
const STORE_LOCAL_TRANSACTIONS = 'localTransactions'
const STORE_LOCAL_SCAN_LOGS = 'localScanLogs'
const STORE_LOCAL_CARDS = 'localCards'
const OFFLINE_CREDENTIALS_KEY = 'kolamRenang.offlineCredentials'
const OFFLINE_SESSION_KEY = 'kolamRenang.offlineSession'
const CACHE_PREFIX = 'kolamRenang.cache.'
const CONFIG_CACHE_PREFIX = 'kolamRenang.config.'
const CONFIG_TTL_MS = 60 * 60 * 1000
const DATA_CACHE_PREFIX = 'kolamRenang.data.'
const DATA_CACHE_TTL_MS = 15 * 60 * 1000

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('pendingScans')) {
        db.createObjectStore('pendingScans', { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(STORE_PENDING_TRANSACTIONS)) {
        db.createObjectStore(STORE_PENDING_TRANSACTIONS, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains(STORE_LOCAL_TRANSACTIONS)) {
        const store = db.createObjectStore(STORE_LOCAL_TRANSACTIONS, { keyPath: 'id', autoIncrement: true })
        store.createIndex('createdAt', 'createdAt')
        store.createIndex('synced', 'synced')
      }
      if (!db.objectStoreNames.contains(STORE_LOCAL_SCAN_LOGS)) {
        const store = db.createObjectStore(STORE_LOCAL_SCAN_LOGS, { keyPath: 'id', autoIncrement: true })
        store.createIndex('createdAt', 'createdAt')
        store.createIndex('synced', 'synced')
      }
      if (!db.objectStoreNames.contains(STORE_LOCAL_CARDS)) {
        db.createObjectStore(STORE_LOCAL_CARDS, { keyPath: 'uid' })
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
  const localId = `OFF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
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

let _syncingMutex = false

export async function syncPendingTransactions(getToken: () => Promise<string>) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0
  if (_syncingMutex) return 0

  const pending = await getPendingTransactions()
  if (!pending.length) return 0

  _syncingMutex = true
  const token = await getToken()
  let synced = 0
  const db = await getDB()

  try {
    for (const transaction of pending) {
      const response = await fetch('/api/create-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ...transaction.payload, localId: transaction.localId })
      })

      if (!response.ok) {
        throw new Error('Gagal sinkron transaksi offline')
      }

      if (transaction.id) {
        await db.delete(STORE_PENDING_TRANSACTIONS, transaction.id)
      }
      synced += 1
    }
  } finally {
    _syncingMutex = false
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
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0
  }).format(amount)
}

// ===== LOCAL-FIRST DATA LAYER =====
// Semua transaksi & scan disimpan lokal dulu, sync periodik ke Firestore

export type LocalTransaction = {
  id?: number
  localId: string
  uid: string
  ticketType: string
  price: number
  quantity: number
  total: number
  paymentMethod: string
  receipt: string
  cashierEmail: string | null
  createdAt: string
  synced: number
  transactionId?: string
}

export type LocalScanLog = {
  id?: number
  localId: string
  gateId: string
  uid?: string
  ticketType?: string
  note?: string
  scannedAt: string
  createdAt: string
  status: string
  synced: number
}

export type LocalCard = {
  uid: string
  ticketType?: string
  active?: boolean
  blocked?: boolean
  qtyAkses?: number
  expiryDate?: string
  userName?: string
}

export type LocalDashboardData = {
  stats: {
    totalVisitorsToday: number
    hourlyTrend: number[]
    dailyTrend: number[]
    activeMembers: number
  }
  recentScans: {
    uid: string
    ticketType: string
    gate: string
    status: string
    scannedAt: string
    scannedDate?: string
  }[]
  scanBreakdown: {
    ticketType: string
    count: number
    price: number
    totalRevenue: number
    percentage: number
  }[]
  todayTransactions: {
    transactionId: string
    createdAt: string
    ticketType: string
    quantity: number
    price: number
    total: number
    cashier: string
    paymentMethod: string
  }[]
  todaySummary: {
    transactionCount: number
    revenue: number
  }
}

// --- Config Cache (localStorage with TTL) ---

export function cacheConfig<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${CONFIG_CACHE_PREFIX}${key}`, JSON.stringify({
    value,
    cachedAt: Date.now()
  }))
}

export function getCachedConfig<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`${CONFIG_CACHE_PREFIX}${key}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.cachedAt) return null
    if (Date.now() - parsed.cachedAt > CONFIG_TTL_MS) {
      localStorage.removeItem(`${CONFIG_CACHE_PREFIX}${key}`)
      return null
    }
    return parsed.value as T
  } catch {
    return null
  }
}

export function clearConfigCache(): void {
  if (typeof window === 'undefined') return
  const keys = Object.keys(localStorage).filter(k => k.startsWith(CONFIG_CACHE_PREFIX))
  keys.forEach(k => localStorage.removeItem(k))
}

// --- Data Cache (15-minute TTL for admin dashboard/report data) ---

export function cacheData<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${DATA_CACHE_PREFIX}${key}`, JSON.stringify({
    value,
    cachedAt: Date.now()
  }))
}

export function getCachedData<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`${DATA_CACHE_PREFIX}${key}`)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.cachedAt) return null
    if (Date.now() - parsed.cachedAt > DATA_CACHE_TTL_MS) {
      localStorage.removeItem(`${DATA_CACHE_PREFIX}${key}`)
      return null
    }
    return parsed.value as T
  } catch {
    return null
  }
}

export function clearDataCache(): void {
  if (typeof window === 'undefined') return
  const keys = Object.keys(localStorage).filter(k => k.startsWith(DATA_CACHE_PREFIX))
  keys.forEach(k => localStorage.removeItem(k))
}

// --- Local Transaction Storage ---

export async function saveTransactionLocally(
  payload: OfflineTransactionPayload,
  cashierEmail: string | null
): Promise<{ localId: string; receipt: string }> {
  const localId = `LOC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const createdAt = new Date().toISOString()
  const receipt = generateOfflineReceipt({
    receiptId: localId,
    placeName: process.env.NEXT_PUBLIC_PLACE_NAME || 'Kolam Renang',
    dateTime: new Date(createdAt),
    payload,
    cashierName: cashierEmail || 'Kasir'
  })

  const db = await getDB()
  await db.add(STORE_LOCAL_TRANSACTIONS, {
    localId,
    uid: payload.uid,
    ticketType: payload.ticketType,
    price: payload.price,
    quantity: payload.quantity,
    total: payload.total,
    paymentMethod: payload.paymentMethod,
    receipt,
    cashierEmail,
    createdAt,
    synced: 0
  } satisfies LocalTransaction)

  return { localId, receipt }
}

export async function getUnsyncedTransactions(): Promise<LocalTransaction[]> {
  const db = await getDB()
  return db.getAllFromIndex(STORE_LOCAL_TRANSACTIONS, 'synced', 0)
}

export async function markTransactionSynced(localId: string, transactionId?: string): Promise<void> {
  const db = await getDB()
  const all = await db.getAll(STORE_LOCAL_TRANSACTIONS)
  const matching = all.filter(tx => tx.localId === localId)
  for (const tx of matching) {
    if (tx.id) {
      await db.put(STORE_LOCAL_TRANSACTIONS, { ...tx, synced: 1, transactionId })
    }
  }
}

export async function getLocalTodayTransactions(): Promise<LocalTransaction[]> {
  const db = await getDB()
  const todayStart = getTodayStartLocal()
  const todayEnd = getTodayEndLocal()
  const all = await db.getAll(STORE_LOCAL_TRANSACTIONS)
  return all.filter(tx => tx.createdAt >= todayStart && tx.createdAt < todayEnd)
}

// --- Local Scan Log Storage ---

export async function saveScanLogLocally(data: {
  gateId: string
  uid?: string
  ticketType?: string
  note?: string
}): Promise<string> {
  const localId = `SCAN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const now = new Date().toISOString()
  const db = await getDB()
  await db.add(STORE_LOCAL_SCAN_LOGS, {
    localId,
    gateId: data.gateId,
    uid: data.uid || `manual-${Date.now()}`,
    ticketType: data.ticketType || 'Tiket Harian',
    note: data.note || 'manual kasir',
    scannedAt: now,
    createdAt: now,
    status: 'OPEN',
    synced: 0
  } satisfies LocalScanLog)
  return localId
}

export async function getUnsyncedScanLogs(): Promise<LocalScanLog[]> {
  const db = await getDB()
  return db.getAllFromIndex(STORE_LOCAL_SCAN_LOGS, 'synced', 0)
}

export async function markScanLogSynced(id: number): Promise<void> {
  const db = await getDB()
  const item = await db.get(STORE_LOCAL_SCAN_LOGS, id)
  if (item) {
    await db.put(STORE_LOCAL_SCAN_LOGS, { ...item, synced: 1 })
  }
}

// --- Card Cache ---

export async function cacheCardsLocally(cards: LocalCard[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(STORE_LOCAL_CARDS, 'readwrite')
  await Promise.all([
    tx.store.clear(),
    ...cards.map(card => tx.store.put(card))
  ])
  await tx.done
}

export async function getLocalCardByUid(uid: string): Promise<LocalCard | undefined> {
  const db = await getDB()
  return db.get(STORE_LOCAL_CARDS, uid)
}

export async function getLocalActiveMemberCount(): Promise<number> {
  const db = await getDB()
  const all = await db.getAll(STORE_LOCAL_CARDS)
  return all.filter(c => c.active && !c.blocked).length
}

// --- Date Helpers (client-side, Jakarta/Asia) ---

function getTodayStartLocal(): string {
  const now = new Date()
  const jakartaOffset = 7 * 60 * 60 * 1000
  const jakartaTime = now.getTime() + jakartaOffset
  const jakartaDate = new Date(jakartaTime)
  const startOfDay = new Date(Date.UTC(jakartaDate.getUTCFullYear(), jakartaDate.getUTCMonth(), jakartaDate.getUTCDate()))
  return new Date(startOfDay.getTime() - jakartaOffset).toISOString()
}

function getTodayEndLocal(): string {
  const start = new Date(getTodayStartLocal())
  start.setDate(start.getDate() + 1)
  return start.toISOString()
}

function getDaysAgoLocal(days: number): string {
  const start = new Date(getTodayStartLocal())
  start.setDate(start.getDate() - days)
  return start.toISOString()
}

// --- Local Dashboard Computation ---

export async function computeLocalDashboard(
  prices: Record<string, number>
): Promise<LocalDashboardData> {
  const db = await getDB()
  const todayStart = getTodayStartLocal()
  const todayEnd = getTodayEndLocal()
  const fiveDaysAgo = getDaysAgoLocal(4)

  // Ambil semua data dari IndexedDB
  const allScanLogs = await db.getAll(STORE_LOCAL_SCAN_LOGS)
  const allTransactions = await db.getAll(STORE_LOCAL_TRANSACTIONS)
  const activeMembers = await getLocalActiveMemberCount()

  // Filter hari ini
  const todayScanLogs = allScanLogs.filter(s => s.createdAt >= todayStart && s.createdAt < todayEnd)
  const todayTransactions = allTransactions.filter(tx => tx.createdAt >= todayStart && tx.createdAt < todayEnd)

  // Recent scans (hari ini, diurut descending)
  const recentScans = todayScanLogs
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50)
    .map(s => ({
      uid: s.uid || 'Unknown',
      ticketType: s.ticketType || 'Unknown',
      gate: s.gateId,
      status: s.status,
      scannedAt: new Date(s.scannedAt).toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit'
      }),
      scannedDate: undefined as string | undefined
    }))

  // Total pengunjung hari ini
  const totalVisitorsToday = todayScanLogs.length

  // Hitung hourly trend (7 jam terakhir)
  const hourlyTrend = Array(7).fill(0)
  const nowJakarta = new Date(Date.now() + 7 * 60 * 60 * 1000)
  allScanLogs.forEach(s => {
    const scanDate = new Date(s.createdAt)
    const scanJakarta = new Date(scanDate.getTime() + 7 * 60 * 60 * 1000)
    const hoursAgo = Math.floor((nowJakarta.getTime() - scanJakarta.getTime()) / 3600000)
    if (hoursAgo >= 0 && hoursAgo < 7) {
      hourlyTrend[6 - hoursAgo] += 1
    }
  })

  // Hitung daily trend (5 hari terakhir)
  const dailyTrend = Array(5).fill(0)
  const todayDayStart = new Date(Date.UTC(nowJakarta.getUTCFullYear(), nowJakarta.getUTCMonth(), nowJakarta.getUTCDate()))
  allScanLogs.forEach(s => {
    const scanDate = new Date(s.createdAt)
    const scanJakarta = new Date(scanDate.getTime() + 7 * 60 * 60 * 1000)
    const scanDayStart = new Date(Date.UTC(scanJakarta.getUTCFullYear(), scanJakarta.getUTCMonth(), scanJakarta.getUTCDate()))
    const dayDiff = Math.floor((todayDayStart.getTime() - scanDayStart.getTime()) / 86400000)
    if (dayDiff >= 0 && dayDiff < 5) {
      dailyTrend[4 - dayDiff] += 1
    }
  })

  // Scan breakdown per jenis tiket
  const scanGroupMap: Record<string, number> = {}
  todayScanLogs.forEach(s => {
    const tt = s.ticketType || 'Unknown'
    scanGroupMap[tt] = (scanGroupMap[tt] || 0) + 1
  })
  const totalScans = todayScanLogs.length
  const scanBreakdown = Object.entries(scanGroupMap).map(([ticketType, count]) => {
    const price = prices[ticketType] || 0
    return {
      ticketType,
      count,
      price,
      totalRevenue: price * count,
      percentage: totalScans > 0 ? Math.round((count / totalScans) * 100 * 100) / 100 : 0
    }
  })

  // Transaksi hari ini
  const txMapped = todayTransactions
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(tx => ({
      transactionId: tx.transactionId || tx.localId,
      createdAt: tx.createdAt,
      ticketType: tx.ticketType,
      quantity: tx.quantity,
      price: tx.price,
      total: tx.total,
      cashier: tx.cashierEmail || '',
      paymentMethod: tx.paymentMethod
    }))

  const todaySummary = {
    transactionCount: todayTransactions.length,
    revenue: todayTransactions.reduce((sum, tx) => sum + tx.total, 0)
  }

  return {
    stats: {
      totalVisitorsToday,
      hourlyTrend,
      dailyTrend,
      activeMembers
    },
    recentScans,
    scanBreakdown,
    todayTransactions: txMapped,
    todaySummary
  }
}

// --- Periodic Sync ---

let _syncTimer: ReturnType<typeof setInterval> | null = null

export async function syncAllLocalData(getToken: () => Promise<string>): Promise<{
  syncedTx: number
  syncedScans: number
  errors: string[]
}> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { syncedTx: 0, syncedScans: 0, errors: [] }
  }

  const errors: string[] = []
  let syncedTx = 0
  let syncedScans = 0

  // 1. Sync unsynced scan logs
  try {
    const unsyncedScans = await getUnsyncedScanLogs()
    for (const scan of unsyncedScans) {
      try {
        const res = await fetch('/api/kasir-gate-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gateId: scan.gateId,
            uid: scan.uid,
            ticketType: scan.ticketType,
            note: scan.note
          })
        })
        if (res.ok && scan.id) {
          await markScanLogSynced(scan.id)
          syncedScans++
        } else {
          errors.push(`Scan ${scan.localId}: ${res.status}`)
        }
      } catch (e: any) {
        errors.push(`Scan ${scan.localId}: ${e.message}`)
      }
    }
  } catch (e: any) {
    errors.push(`Gagal baca unsynced scan: ${e.message}`)
  }

  // 2. Sync unsynced transactions
  try {
    const token = await getToken()
    const unsyncedTx = await getUnsyncedTransactions()
    for (const tx of unsyncedTx) {
      try {
        const res = await fetch('/api/create-transaction', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            uid: tx.uid,
            ticketType: tx.ticketType,
            price: tx.price,
            quantity: tx.quantity,
            total: tx.total,
            paymentMethod: tx.paymentMethod,
            localId: tx.localId
          })
        })
        if (res.ok) {
          const data = await res.json()
          await markTransactionSynced(tx.localId, data.transactionId)
          syncedTx++
        } else {
          errors.push(`Tx ${tx.localId}: ${res.status}`)
        }
      } catch (e: any) {
        errors.push(`Tx ${tx.localId}: ${e.message}`)
      }
    }
  } catch (e: any) {
    errors.push(`Gagal sync transaksi: ${e.message}`)
  }

  // 3. Refresh card cache
  try {
    const token = await getToken()
    const res = await fetch('/api/get-cards', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (res.ok) {
      const data = await res.json()
      if (data.cards) {
        await cacheCardsLocally(data.cards)
      }
    }
  } catch (e: any) {
    errors.push(`Gagal refresh cards: ${e.message}`)
  }

  return { syncedTx, syncedScans, errors }
}

export function startPeriodicSync(
  intervalMs: number,
  getToken: () => Promise<string>
): () => void {
  stopPeriodicSync()
  _syncTimer = setInterval(async () => {
    await syncAllLocalData(getToken)
  }, intervalMs)
  return stopPeriodicSync
}

export function stopPeriodicSync(): void {
  if (_syncTimer !== null) {
    clearInterval(_syncTimer)
    _syncTimer = null
  }
}
