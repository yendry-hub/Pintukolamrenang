import Link from 'next/link'
import { useEffect, useState } from 'react'
import StatusCard from '@/components/StatusCard'
import type { GateStatus, ScanLog } from '@/lib/types'

export default function Home() {
  const [status, setStatus] = useState<GateStatus>({ online: true, lastSeen: null, currentGate: 'Gate-A' })
  const [recent, setRecent] = useState<ScanLog[]>([])
  const [firebaseConnected, setFirebaseConnected] = useState<boolean | null>(null)
  const [firebaseMsg, setFirebaseMsg] = useState<string | null>(null)
  const [gateLoading, setGateLoading] = useState<string | null>(null)
  const [gateFeedback, setGateFeedback] = useState<{ gateId: string; ok: boolean; msg: string } | null>(null)

  const handleOpenGate = async (gateId: string) => {
    setGateLoading(gateId)
    setGateFeedback(null)

    // Fast path: coba langsung ke ESP
    const gateInfo = status.gates?.find((g) => g.gateId === gateId)
    const ip = gateInfo?.ipAddress
    let directOk = false
    if (ip) {
      try {
        const ctrl = new AbortController()
        setTimeout(() => ctrl.abort(), 3000)
        const r = await fetch(`http://${ip}/open`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: 'OPEN', gateId }),
          signal: ctrl.signal,
        })
        directOk = r.ok
      } catch {
        // mixed content atau ESP tidak reachable — lanjut ke slow path
      }
    }

    if (directOk) {
      setGateFeedback({ gateId, ok: true, msg: 'Gate opened!' })
      setGateLoading(null)
      setTimeout(() => setGateFeedback(null), 3000)
      return
    }

    // Slow path: via Firestore (heartbeat, maks 15 detik)
    try {
      const ctrl = new AbortController()
      setTimeout(() => ctrl.abort(), 10000)
      const res = await fetch('/api/open-gate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gateId, secret: 'meristarayakolamrenang' }),
        signal: ctrl.signal
      })
      const data = await res.json()
      if (res.ok) {
        setGateFeedback({ gateId, ok: true, msg: 'Perintah dikirim via heartbeat (maks 15 detik)' })
      } else {
        setGateFeedback({ gateId, ok: false, msg: data.error || 'Gagal' })
      }
    } catch {
      setGateFeedback({ gateId, ok: false, msg: 'Gagal kirim perintah' })
    }
    setGateLoading(null)
    setTimeout(() => setGateFeedback(null), 5000)
  }

  const fetchRecentScans = () => {
    fetch('/api/recent-scans')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.scans)) setRecent(data.scans)
        if (data.status) setStatus(data.status)
      })
      .catch(() => {})
  }

  useEffect(() => {
    fetchRecentScans()
    const interval = setInterval(fetchRecentScans, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const fetchGateStatus = () => {
      fetch('/api/status')
        .then((res) => res.json())
        .then((data) => setStatus(data))
        .catch(() => setStatus((prev) => ({ ...prev, online: false })))
    }

    fetchGateStatus()
    const interval = setInterval(fetchGateStatus, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    fetch('/api/firebase-status')
      .then((res) => res.json())
      .then((data) => {
        setFirebaseConnected(Boolean(data.connected))
        setFirebaseMsg(data.connected ? `Found ${Array.isArray(data.collections) ? data.collections.length : 0} collections` : data.error || 'Not connected')
      })
      .catch((_) => {
        setFirebaseConnected(false)
        setFirebaseMsg('Request failed')
      })
  }, [])

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-slate-500">Waterpark Gate Access</p>
            <h1 className="text-3xl font-semibold tracking-tight">Dashboard Ticketing Kolam Renang</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/login" className="rounded-xl bg-sky-600 px-4 py-2 text-white shadow-soft hover:bg-sky-700">
              Login Admin
            </Link>
            <Link href="/kasir-login" className="rounded-xl bg-emerald-600 px-4 py-2 text-white shadow-soft hover:bg-emerald-700">
              Login Kasir
            </Link>
            <Link href="/admin" className="rounded-xl border border-slate-200 px-4 py-2 text-slate-700 shadow-soft hover:bg-slate-100">
              Buka Dashboard Admin
            </Link>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-3">
          <StatusCard title="Status Gate" value={status.online ? 'Online' : 'Offline'} note={`Gate: ${status.connectedGateNames?.join(', ') || status.connectedGates?.join(', ') || status.currentGate}`}></StatusCard>
          <StatusCard title="Scan Hari Ini" value={`${recent.length}`} note="Data scan terbaru" />
          <StatusCard title="Firebase" value={firebaseConnected == null ? 'Checking...' : firebaseConnected ? 'Connected' : 'Disconnected'} note={firebaseMsg ?? '—'} />
        </div>

        <section className="mt-10 rounded-3xl bg-white p-6 shadow-soft">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">Kontrol Gate</h2>
            <p className="text-sm text-slate-500">Buka gate berdasarkan status koneksi</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {['Gate-A', 'Gate-B'].map((gateId) => {
                const gateInfo = status.gates?.find((g) => g.gateId === gateId)
                const isOnline = gateInfo !== undefined ? gateInfo.online : status.online
                const isLoading = gateLoading === gateId
                const fb = gateFeedback?.gateId === gateId ? gateFeedback : null
                return (
                  <button
                    key={gateId}
                    onClick={() => handleOpenGate(gateId)}
                    disabled={!isOnline || isLoading}
                    className={`rounded-xl px-5 py-3 font-medium transition-all ${
                      !isOnline
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : isLoading
                        ? 'bg-emerald-500 text-white cursor-wait'
                        : fb?.ok
                        ? 'bg-green-600 text-white'
                        : fb
                        ? 'bg-red-500 text-white'
                        : 'bg-emerald-600 text-white shadow-soft hover:bg-emerald-700 active:scale-95'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-300 animate-pulse' : 'bg-slate-400'}`} />
                      {gateInfo?.name || gateId}
                    </div>
                    <span className="block text-[10px] opacity-70">
                      {isLoading ? 'Membuka...' : fb?.msg || (isOnline ? (gateInfo?.ipAddress || 'Online') : 'Offline')}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Riwayat Scan Hari Ini</h2>
              <p className="text-sm text-slate-500">Maksimal 5 data terbaru</p>
            </div>
          </div>

          <div className="space-y-2">
            {recent.slice(0, 5).map((item) => (
              <div key={item.uid + item.scannedAt} className="rounded-3xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">{item.status}</span>
                  <span className="text-sm text-slate-500">{item.ticketType}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-600">
                  <span>{item.uid}</span>
                  <span>{item.gate}</span>
                  <span>{item.scannedAt}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
