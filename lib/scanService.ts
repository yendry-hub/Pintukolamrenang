import { queueOfflineScan } from '@/lib/offlineSync'
import type { ScanLog } from '@/lib/types'

export async function scanTicket(uid: string, gateId: string) {
  const payload = { uid, gateId, secret: process.env.NEXT_PUBLIC_ESP_GATE_SECRET || 'demo-secret' }

  try {
    const res = await fetch('/api/uid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || data.reason || 'Gagal verifikasi')
    }

    return data
  } catch (error) {
    const scan: Omit<ScanLog, 'scannedAt'> = {
      uid,
      ticketType: 'Tiket Harian',
      gate: gateId,
      status: 'OFFLINE'
    }
    await queueOfflineScan(scan)
    return { result: 'QUEUED' }
  }
}
