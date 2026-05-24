import type admin from 'firebase-admin'
import type { GateStatus } from '@/lib/types'

const GATE_ONLINE_WINDOW_MS = 15_000

function toDate(value: any): Date | null {
  if (!value) {
    return null
  }
  if (typeof value.toDate === 'function') {
    return value.toDate()
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function getGateStatus(db: admin.firestore.Firestore): Promise<GateStatus> {
  const snap = await db.collection('gateDevices').orderBy('lastSeen', 'desc').limit(20).get()
  const now = Date.now()
  const gates = snap.docs.map((doc) => {
    const data = doc.data()
    const lastSeenDate = toDate(data.lastSeen)
    const online = Boolean(lastSeenDate && now - lastSeenDate.getTime() <= GATE_ONLINE_WINDOW_MS)

    return {
      gateId: String(data.gateId || doc.id),
      name: String(data.name || data.gateId || doc.id),
      online,
      lastSeen: lastSeenDate ? lastSeenDate.toISOString() : null,
      ipAddress: data.ipAddress ? String(data.ipAddress) : null
    }
  })

  const onlineGates = gates.filter((gate) => gate.online)
  const currentGate = onlineGates[0]?.gateId || gates[0]?.gateId || 'Unknown'
  const lastSeen = onlineGates[0]?.lastSeen || gates[0]?.lastSeen || null

  return {
    online: onlineGates.length > 0,
    currentGate,
    lastSeen,
    connectedGates: onlineGates.map((gate) => gate.gateId),
    connectedGateNames: onlineGates.map((gate) => gate.name),
    gates
  }
}
