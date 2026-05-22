import { openDB } from 'idb'
import { addDoc, collection, getFirestore, serverTimestamp } from 'firebase/firestore'
import { initFirebase } from '@/lib/firebase'
import type { ScanLog } from '@/lib/types'

const DB_NAME = 'kolam-renang-cache'
const DB_VERSION = 2
const STORE_PENDING = 'pendingScans'

async function getDB() {
  return await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains('pendingTransactions')) {
        db.createObjectStore('pendingTransactions', { keyPath: 'id', autoIncrement: true })
      }
    }
  })
}

export async function queueOfflineScan(scan: Omit<ScanLog, 'scannedAt'>) {
  const db = await getDB()
  await db.add(STORE_PENDING, { ...scan, scannedAt: new Date().toISOString() })
}

export async function getPendingScans() {
  const db = await getDB()
  return await db.getAll(STORE_PENDING)
}

export async function removePendingScan(id: number) {
  const db = await getDB()
  await db.delete(STORE_PENDING, id)
}

export async function syncPendingScans() {
  if (!navigator.onLine) return
  const pending = await getPendingScans()
  if (!pending.length) return

  initFirebase()
  const db = getFirestore()
  for (const item of pending) {
    const { id, ...scan } = item
    await addDoc(collection(db, 'scanLogs'), {
      ...scan,
      createdAt: serverTimestamp()
    })
    await removePendingScan(id)
  }
}

export function initOfflineSync() {
  window.addEventListener('online', () => {
    syncPendingScans().catch(console.error)
  })
}
