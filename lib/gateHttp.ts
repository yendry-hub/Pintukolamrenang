import type { Firestore } from 'firebase-admin/firestore'

const GATE_OPEN_PATH = process.env.ESP_OPEN_PATH || '/open'
const GATE_OPEN_TIMEOUT = 5000

export async function triggerGateHttp(db: Firestore, gateId: string): Promise<{ ok: boolean; msg: string }> {
  const gateDoc = await db.collection('gateDevices').doc(gateId).get()
  if (!gateDoc.exists) {
    return { ok: false, msg: `Gate ${gateId} not found in Firestore` }
  }

  const gateData = gateDoc.data()
  const ipAddress = gateData?.ipAddress

  if (!ipAddress) {
    return { ok: false, msg: `Gate ${gateId} has no IP address` }
  }

  const url = `http://${ipAddress}${GATE_OPEN_PATH}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), GATE_OPEN_TIMEOUT)

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'OPEN', gateId }),
      signal: controller.signal
    })
    const text = await resp.text()
    if (resp.ok) {
      return { ok: true, msg: `Gate ${gateId} opened` }
    }
    return { ok: false, msg: `Gate responded ${resp.status}: ${text}` }
  } catch (err: any) {
    return { ok: false, msg: `Gate unreachable: ${err?.message}` }
  } finally {
    clearTimeout(timeout)
  }
}
