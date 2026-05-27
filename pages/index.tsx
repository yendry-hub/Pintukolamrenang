import Link from 'next/link'
import { useEffect, useState } from 'react'
import StatusCard from '@/components/StatusCard'
import type { GateStatus, ScanLog } from '@/lib/types'

export default function Home() {
  const [status, setStatus] = useState<GateStatus>({ online: true, lastSeen: null, currentGate: 'Gate-A' })
  const [recent, setRecent] = useState<ScanLog[]>([])
  const [firebaseConnected, setFirebaseConnected] = useState<boolean | null>(null)
  const [firebaseMsg, setFirebaseMsg] = useState<string | null>(null)
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
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">Waterpark Gate Access</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Dashboard Ticketing</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/login" className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-sky-700 hover:shadow-card-hover active:scale-[0.97]">
              Login Admin
            </Link>
            <Link href="/kasir-login" className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-emerald-700 hover:shadow-card-hover active:scale-[0.97]">
              Login Kasir
            </Link>
            <Link href="/admin" className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 shadow-card transition-all hover:border-slate-300 hover:shadow-card-hover active:scale-[0.97]">
              Dashboard Admin
            </Link>
          </div>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatusCard title="Status Gate" value={status.online ? 'Online' : 'Offline'} note={`Gate: ${status.connectedGateNames?.join(', ') || status.connectedGates?.join(', ') || status.currentGate}`}></StatusCard>
          <StatusCard title="Scan Hari Ini" value={`${recent.length}`} note="Data scan terbaru" />
          <StatusCard title="Firebase" value={firebaseConnected == null ? 'Checking...' : firebaseConnected ? 'Connected' : 'Disconnected'} note={firebaseMsg ?? '—'} />
        </div>

        <section className="mt-8 rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Riwayat Scan Hari Ini</h2>
              <p className="text-sm text-slate-400">Maksimal 5 data terbaru</p>
            </div>
          </div>

          <div className="space-y-2">
            {recent.slice(0, 5).length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Belum ada scan hari ini.</p>
            ) : (
              recent.slice(0, 5).map((item) => (
                <div key={item.uid + item.scannedAt} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{item.status}</span>
                  <span className="text-sm text-slate-500">{item.ticketType}</span>
                  <span className="ml-auto text-xs text-slate-400">{item.uid}</span>
                  <span className="text-xs text-slate-400">{item.gate}</span>
                  <span className="text-xs text-slate-400">{item.scannedAt}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
