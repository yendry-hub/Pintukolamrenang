import Link from 'next/link'
import { useEffect, useState } from 'react'
import { scanTicket } from '@/lib/scanService'
import StatusCard from '@/components/StatusCard'
import type { GateStatus, ScanLog } from '@/lib/types'

export default function Home() {
  const [status, setStatus] = useState<GateStatus>({ online: true, lastSeen: null, currentGate: 'Gate-A' })
  const [scanQueue, setScanQueue] = useState<number>(0)
  const [recent, setRecent] = useState<ScanLog[]>([])
  const [firebaseConnected, setFirebaseConnected] = useState<boolean | null>(null)
  const [firebaseMsg, setFirebaseMsg] = useState<string | null>(null)

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

  useEffect(() => {
    const interval = setInterval(() => {
      setScanQueue(Math.floor(Math.random() * 5))
      setRecent([
        {
          uid: '04A6F02B88',
          ticketType: 'Tiket Harian',
          gate: 'Gate-A',
          status: 'VALID',
          scannedAt: new Date().toLocaleTimeString()
        }
      ])
    }, 16000)

    return () => clearInterval(interval)
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
          <StatusCard title="Antrian Scan Offline" value={`${scanQueue}`} note="Data lokal menunggu sinkronisasi" />
          <StatusCard title="Firebase" value={firebaseConnected == null ? 'Checking...' : firebaseConnected ? 'Connected' : 'Disconnected'} note={firebaseMsg ?? '—'} />
        </div>

        <section className="mt-10 rounded-3xl bg-white p-6 shadow-soft">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Riwayat Scan Terakhir</h2>
              <p className="text-sm text-slate-500">Data realtime dari Firestore / local queue</p>
            </div>
            <button
              onClick={() => scanTicket('04A6F02B88', 'Gate-A')}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-white hover:bg-emerald-700"
            >
              Test Simulasi Scan
            </button>
          </div>

          <div className="space-y-2">
            {recent.map((item) => (
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
