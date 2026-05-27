import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { getFirebaseIdToken, logoutFirebase, onFirebaseAuthStateChanged } from '@/lib/firebase'
import {
  cacheJson,
  clearOfflineSession,
  getCachedJson,
  getOfflineSession,
  getPendingTransactions,
  queueOfflineTransaction,
  setOfflineSession,
  syncPendingTransactions
} from '@/lib/offlineClient'
import StatusCard from '@/components/StatusCard'
import type { GateStatus, ScanLog, TicketStats, TicketType } from '@/lib/types'

type KasirDashboardResponse = {
  status: GateStatus
  stats: TicketStats
  recentScans: ScanLog[]
  todaySummary?: {
    transactionCount: number
    revenue: number
  }
}

const initialStats: TicketStats = {
  totalVisitorsToday: 0,
  hourlyTrend: [0, 0, 0, 0, 0, 0, 0],
  dailyTrend: [0, 0, 0, 0, 0],
  activeMembers: 0
}

const DEFAULT_TICKET_TYPES: string[] = ['Tiket Harian', 'Member', 'VIP', 'Paket Keluarga', 'Tiket Anak', 'Tiket Dewasa']
const DEFAULT_PAYMENT_METHODS = ['Tunai', 'Kartu Debit', 'Kartu Kredit', 'E-Wallet']
const DEFAULT_TICKET_PRICES: Record<string, number> = {
  'Tiket Harian': 50000,
  Member: 100000,
  VIP: 75000,
  'Paket Keluarga': 200000,
  'Tiket Anak': 30000,
  'Tiket Dewasa': 50000
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export default function KasirPage() {
  const router = useRouter()
  const [status, setStatus] = useState<GateStatus>({ online: false, lastSeen: null, currentGate: '-' })
  const [recentScans, setRecentScans] = useState<ScanLog[]>([])
  const [stats, setStats] = useState<TicketStats>(initialStats)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [authInitialized, setAuthInitialized] = useState(false)

  const [cardUid, setCardUid] = useState('')
  const [selectedTicketType, setSelectedTicketType] = useState<string>('Tiket Harian')
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('Tunai')
  const [quantity, setQuantity] = useState<number>(1)
  const [transactionLoading, setTransactionLoading] = useState(false)
  const [receipt, setReceipt] = useState<string | null>(null)
  const [view, setView] = useState<'dashboard' | 'transaksi' | 'ringkasan' | 'riwayat' | 'grafik' | 'kontrol-gate'>('dashboard')
  const [ticketPrices, setTicketPrices] = useState<Record<string, number>>(DEFAULT_TICKET_PRICES)
  const [offlineMode, setOfflineMode] = useState(false)
  const [pendingTransactions, setPendingTransactions] = useState(0)
  const [cashierEmail, setCashierEmail] = useState<string | null>(null)
  const [ticketTypes, setTicketTypes] = useState<string[]>([])
  const [paymentMethods, setPaymentMethods] = useState<string[]>([])
  const [todaySummary, setTodaySummary] = useState<{ transactionCount: number; revenue: number }>({ transactionCount: 0, revenue: 0 })
  const [gateLoading, setGateLoading] = useState<string | null>(null)
  const [gateFeedback, setGateFeedback] = useState<{ gateId: string; ok: boolean; msg: string } | null>(null)

  const handleOpenGate = async (gateId: string) => {
    setGateLoading(gateId)
    setGateFeedback(null)

    const gateInfo = status.gates?.find((g) => g.gateId === gateId)
    const ip = gateInfo?.ipAddress
    if (!ip) {
      setGateFeedback({ gateId, ok: false, msg: 'IP tidak diketahui' })
      setGateLoading(null)
      setTimeout(() => setGateFeedback(null), 3000)
      return
    }

    try {
      const ctrl = new AbortController()
      setTimeout(() => ctrl.abort(), 3000)
      const res = await fetch(`http://${ip}/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'OPEN', gateId }),
        signal: ctrl.signal,
      })
      if (res.ok) {
        setGateFeedback({ gateId, ok: true, msg: 'Gate opened!' })
      } else {
        setGateFeedback({ gateId, ok: false, msg: 'ESP rejected' })
      }
    } catch {
      setGateFeedback({ gateId, ok: false, msg: 'ESP tidak terjangkau' })
    }
    setGateLoading(null)
    setTimeout(() => setGateFeedback(null), 3000)
  }

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/get-ticket-config')
      if (res.ok) {
        const data = await res.json()
        if (data.ticketTypes && data.ticketTypes.length > 0) {
          setTicketTypes(data.ticketTypes)
          cacheJson('ticketTypes', data.ticketTypes)
        }
        if (data.paymentMethods && data.paymentMethods.length > 0) {
          setPaymentMethods(data.paymentMethods)
          cacheJson('paymentMethods', data.paymentMethods)
        }
        if (data.prices) {
          setTicketPrices(data.prices)
          cacheJson('ticketPrices', data.prices)
        }
      }
    } catch (err) {
      console.error('Failed to fetch config:', err)
      const cachedTypes = getCachedJson<string[]>('ticketTypes')
      if (cachedTypes) setTicketTypes(cachedTypes)
      const cachedMethods = getCachedJson<string[]>('paymentMethods')
      if (cachedMethods) setPaymentMethods(cachedMethods)
      const cachedPrices = getCachedJson<Record<string, number>>('ticketPrices')
      if (cachedPrices) setTicketPrices(cachedPrices)
    }
  }

  const fetchPrices = async () => {
    try {
      const res = await fetch('/api/get-prices')
      if (res.ok) {
        const data = await res.json()
        console.log('Fetched prices:', data.prices)
        setTicketPrices(data.prices)
        cacheJson('ticketPrices', data.prices)
      }
    } catch (err) {
      console.error('Failed to fetch prices:', err)
      const cachedPrices = getCachedJson<Record<string, number>>('ticketPrices')
      if (cachedPrices) {
        setTicketPrices(cachedPrices)
      }
    }
  }

  useEffect(() => {
    const unsubscribe = onFirebaseAuthStateChanged((user) => {
      setAuthInitialized(true)
      if (!user) {
        const offlineSession = getOfflineSession('kasir')
        if (!offlineSession) {
          router.replace('/kasir-login')
          return
        }

        setOfflineMode(true)
        setCashierEmail(offlineSession.email)
        loadCachedKasirData()
        refreshPendingTransactions()
        return
      }
      setOfflineMode(false)
      setCashierEmail(user.email || null)
      setOfflineSession(user.email || 'kasir', 'kasir', false)
      fetchDashboard()
      fetchConfig()
      syncOfflineTransactions()
    })

    return unsubscribe
  }, [router])

  useEffect(() => {
    const handleOnline = () => {
      setOfflineMode(false)
      syncOfflineTransactions()
      fetchDashboard()
      fetchConfig()
    }
    const handleOffline = () => setOfflineMode(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    refreshPendingTransactions()
    setOfflineMode(!navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (view === 'ringkasan' || view === 'riwayat') {
      fetchDashboard()
    }
  }, [view])

  const loadCachedKasirData = () => {
    const cachedDashboard = getCachedJson<KasirDashboardResponse>('kasirDashboard')
    const cachedPrices = getCachedJson<Record<string, number>>('ticketPrices')

    if (cachedDashboard) {
      setStatus(cachedDashboard.status)
      setStats(cachedDashboard.stats)
      setRecentScans(cachedDashboard.recentScans)
    }
    if (cachedPrices) {
      setTicketPrices(cachedPrices)
    }
    setLoading(false)
    setError('Mode offline aktif. Data dashboard memakai cache terakhir, transaksi baru akan disinkronkan saat online.')
  }

  const refreshPendingTransactions = async () => {
    const pending = await getPendingTransactions()
    setPendingTransactions(pending.length)
  }

  const syncOfflineTransactions = async () => {
    try {
      const synced = await syncPendingTransactions(getFirebaseIdToken)
      if (synced > 0) {
        await refreshPendingTransactions()
        fetchDashboard()
      } else {
        await refreshPendingTransactions()
      }
    } catch (err) {
      console.error('Failed to sync offline transactions:', err)
      await refreshPendingTransactions()
    }
  }

  const fetchDashboard = async () => {
    setLoading(true)
    setError(null)

    try {
      const token = await getFirebaseIdToken()
      const res = await fetch('/api/kasir-dashboard', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (res.status === 401) {
        await logoutFirebase()
        router.replace('/kasir-login')
        return
      }

      const data = await res.json()
      if (res.status === 403) {
        await logoutFirebase()
        router.replace('/kasir-login')
        return
      }

      if (!res.ok) {
        throw new Error(data.error || 'Gagal memuat dashboard kasir')
      }

      const payload = data as KasirDashboardResponse
      setStatus(payload.status)
      setStats(payload.stats)
      setRecentScans(payload.recentScans)
      if (payload.todaySummary) setTodaySummary(payload.todaySummary)
      cacheJson('kasirDashboard', payload)
    } catch (err: any) {
      const cachedDashboard = getCachedJson<KasirDashboardResponse>('kasirDashboard')
      if (cachedDashboard) {
        setStatus(cachedDashboard.status)
        setStats(cachedDashboard.stats)
        setRecentScans(cachedDashboard.recentScans)
        setOfflineMode(true)
        setError('Mode offline aktif. Data dashboard memakai cache terakhir.')
      } else {
        setError(err?.message || 'Terjadi kesalahan memuat dashboard')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTransaction = async (e: FormEvent) => {
    e.preventDefault()
    if (!cardUid.trim()) {
      alert('Masukkan UID kartu')
      return
    }
    if (!quantity || quantity < 1) {
      alert('Jumlah harus minimal 1')
      return
    }

    setTransactionLoading(true)
    const transactionPayload = {
      uid: cardUid,
      ticketType: selectedTicketType as TicketType,
      price: ticketPrices[selectedTicketType],
      quantity,
      total: ticketPrices[selectedTicketType] * quantity,
      paymentMethod: selectedPaymentMethod
    }

    try {
      if (!navigator.onLine || offlineMode) {
        const queued = await queueOfflineTransaction(transactionPayload, cashierEmail)
        setReceipt(queued.receipt)
        setCardUid('')
        setQuantity(1)
        await refreshPendingTransactions()
        alert('Transaksi disimpan offline dan akan disinkronkan saat internet kembali.')
        return
      }

      const token = await getFirebaseIdToken()
      const res = await fetch('/api/create-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(transactionPayload)
      })

      const data = await res.json()
      if (!res.ok) {
        alert('Gagal membuat transaksi: ' + (data.error || 'Terjadi kesalahan'))
        return
      }

      setReceipt(data.receipt)
      setCardUid('')
      setQuantity(1)

      setTimeout(() => {
        fetchDashboard()
      }, 500)
    } catch (err: any) {
      try {
        const queued = await queueOfflineTransaction(transactionPayload, cashierEmail)
        setReceipt(queued.receipt)
        setCardUid('')
        setQuantity(1)
        setOfflineMode(true)
        await refreshPendingTransactions()
        alert('Internet/server tidak tersedia. Transaksi disimpan offline sementara.')
      } catch (queueError: any) {
        alert('Error: ' + (queueError?.message || err?.message || 'Terjadi kesalahan'))
      }
    } finally {
      setTransactionLoading(false)
    }
  }

  const handlePrintReceipt = () => {
    if (!receipt) return
    const printWindow = window.open('', '', 'width=300,height=600')
    if (!printWindow) return

    const escapedReceipt = escapeHtml(receipt)

    printWindow.document.write(`
      <html>
        <head>
          <title>Struk Pembayaran</title>
          <style>
            @page {
              size: 58mm auto;
              margin: 0;
            }
            * {
              box-sizing: border-box;
            }
            html,
            body {
              font-family: 'Courier New', monospace;
              margin: 0;
              padding: 0;
              width: 58mm;
              background: #fff;
            }
            body {
              padding: 2mm;
              color: #000;
              font-size: 10px;
              line-height: 1.25;
            }
            pre {
              margin: 0;
              width: 54mm;
              white-space: pre-wrap;
              word-break: break-word;
            }
          </style>
        </head>
        <body>
          <pre>${escapedReceipt}</pre>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  const handleLogout = async () => {
    clearOfflineSession()
    if (!offlineMode) {
      await logoutFirebase()
    }
    router.replace('/kasir-login')
  }

  if (!authInitialized) {
    return (
      <main className="min-h-screen bg-slate-100 text-slate-900">
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-4 py-8">
          <div className="rounded-3xl bg-white p-8 shadow-soft text-slate-900">Memeriksa autentikasi...</div>
        </div>
      </main>
    )
  }

  const chartMaxValue = Math.max(...stats.hourlyTrend, ...stats.dailyTrend, 1)

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="text-sm uppercase tracking-[0.25em] text-sky-700">Kasir Dashboard</span>
            <h1 className="mt-2 text-3xl font-semibold">Dashboard Kasir</h1>
            <p className="mt-2 text-sm text-slate-500">Buat transaksi dan lihat ringkasan penjualan tiket.</p>
            <p className="mt-2 text-sm text-slate-500">
              {offlineMode ? 'Mode offline aktif' : 'Online'} · {pendingTransactions} transaksi menunggu sinkron
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={fetchConfig} className="rounded-2xl bg-sky-100 px-4 py-2 text-sky-700 shadow-soft hover:bg-sky-200" title="Refresh data dari server">
              Refresh Data
            </button>
            <button onClick={handleLogout} className="rounded-2xl bg-white px-4 py-2 text-slate-700 shadow-soft hover:bg-slate-50">
              Logout
            </button>
            <Link href="/" className="rounded-2xl bg-slate-900 px-4 py-2 text-white shadow-soft hover:bg-slate-800">
              Kembali ke Beranda
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-6 md:flex-row">
          {/* Sidebar kiri */}
          <aside className="md:w-64">
            <div className="rounded-3xl bg-white p-4 shadow-soft">
              <nav className="space-y-2">
                <button
                  onClick={() => setView('dashboard')}
                  className={`w-full text-left rounded-xl px-4 py-2 hover:bg-slate-50 ${view === 'dashboard' ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setView('transaksi')}
                  className={`w-full text-left rounded-xl px-4 py-2 hover:bg-slate-50 ${view === 'transaksi' ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  Transaksi
                </button>
                <button
                  onClick={() => setView('ringkasan')}
                  className={`w-full text-left rounded-xl px-4 py-2 hover:bg-slate-50 ${view === 'ringkasan' ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  Ringkasan
                </button>
                <button
                  onClick={() => setView('riwayat')}
                  className={`w-full text-left rounded-xl px-4 py-2 hover:bg-slate-50 ${view === 'riwayat' ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  Riwayat Scan
                </button>
                <button
                  onClick={() => setView('grafik')}
                  className={`w-full text-left rounded-xl px-4 py-2 hover:bg-slate-50 ${view === 'grafik' ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  Grafik Tren
                </button>
                <button
                  onClick={() => setView('kontrol-gate')}
                  className={`w-full text-left rounded-xl px-4 py-2 hover:bg-slate-50 ${view === 'kontrol-gate' ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  Kontrol Gate
                </button>
              </nav>
            </div>
          </aside>

          {/* Konten utama berubah sesuai view */}
          <section className="flex-1">
            {error ? (
              <div className="mt-2 rounded-3xl bg-amber-50 p-6 text-amber-900 shadow-soft">
                <p className="font-semibold">Gagal memuat dashboard kasir</p>
                <p className="mt-2 text-sm">{error}</p>
              </div>
            ) : null}

            {view === 'dashboard' && (
              <>
                <div className="grid gap-4 xl:grid-cols-4">
                  <StatusCard title="Pengunjung Hari Ini" value={stats.totalVisitorsToday.toString()} note="Ringkasan kasir" />
                  <StatusCard title="Gate Status" value={status.online ? 'Online' : 'Offline'} note={`Gate: ${status.connectedGateNames?.join(', ') || status.connectedGates?.join(', ') || status.currentGate}`} />
                  <StatusCard title="Members Aktif" value={stats.activeMembers.toString()} note="Data Firestore" />
                  <StatusCard title="Last Seen" value={status.lastSeen ? new Date(status.lastSeen).toLocaleTimeString() : 'Never'} note="Scan terakhir" />
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-3">
                  <div className="rounded-3xl bg-white p-6 shadow-soft">
                    <h2 className="text-lg font-semibold">Ringkasan Kasir</h2>
                    <div className="mt-6 space-y-4 text-sm text-slate-600">
                      <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                        <span>Scan terbaru</span>
                        <strong>{recentScans.length}</strong>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                        <span>Jumlah anggota aktif</span>
                        <strong>{stats.activeMembers}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl bg-white p-6 shadow-soft xl:col-span-2">
                    <div className="mb-5 flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold">Riwayat Scan</h2>
                        <p className="text-sm text-slate-500">Scan terbaru untuk kasir</p>
                      </div>
                    </div>

                    {loading ? (
                      <div className="rounded-3xl border border-slate-200 p-6 text-slate-500">Memuat data...</div>
                    ) : recentScans.length === 0 ? (
                      <div className="rounded-3xl border border-slate-200 p-6 text-slate-500">Belum ada scan terbaru.</div>
                    ) : (
                      <div className="space-y-4">
                        {recentScans.map((scan) => (
                          <div key={scan.uid + scan.scannedAt} className="rounded-3xl border border-slate-200 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <span className="font-semibold">{scan.ticketType}</span>
                              <span className="text-sm text-slate-500">{scan.scannedDate ? `${scan.scannedDate} ` : ''}{scan.scannedAt}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
                              <span>UID: {scan.uid}</span>
                              <span>Gate: {scan.gate}</span>
                              <span>Status: <strong>{scan.status}</strong></span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {view === 'transaksi' && (
              <div className="space-y-6">
                {receipt ? (
                  <div className="rounded-3xl bg-green-50 p-6 shadow-soft">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-green-900">Struk Pembayaran</h3>
                      <button
                        onClick={() => setReceipt(null)}
                        className="rounded-2xl bg-green-100 px-3 py-1 text-sm text-green-900 hover:bg-green-200"
                      >
                        Tutup
                      </button>
                    </div>
                    <pre className="mb-4 overflow-auto rounded-2xl bg-white p-4 font-mono text-xs text-slate-900">
                      {receipt}
                    </pre>
                    <button
                      onClick={handlePrintReceipt}
                      className="w-full rounded-2xl bg-green-600 px-4 py-2 text-white hover:bg-green-700"
                    >
                      Cetak Struk
                    </button>
                  </div>
                ) : null}

                <div className="rounded-3xl bg-white p-6 shadow-soft max-w-md">
                  <h2 className="text-lg font-semibold mb-6">Buat Transaksi</h2>
                  <form onSubmit={handleCreateTransaction} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">UID Kartu</label>
                      <input
                        type="text"
                        value={cardUid}
                        onChange={(e) => setCardUid(e.target.value)}
                        placeholder="Scan atau masukkan UID"
                        className="w-full rounded-2xl border border-slate-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        disabled={transactionLoading}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Jenis Tiket</label>
                      <select
                        value={selectedTicketType}
                        onChange={(e) => setSelectedTicketType(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        disabled={transactionLoading}
                      >
                        {(ticketTypes.length ? ticketTypes : DEFAULT_TICKET_TYPES).map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Jumlah</label>
                      <input
                        type="number"
                        min={1}
                        value={quantity}
                        onChange={(e) => setQuantity(Number(e.target.value))}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        disabled={transactionLoading}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Harga / unit</label>
                      <div className="rounded-2xl bg-slate-50 px-4 py-2 font-semibold text-lg text-sky-600">
                        Rp {ticketPrices[selectedTicketType].toLocaleString('id-ID')}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Total</label>
                      <div className="rounded-2xl bg-slate-50 px-4 py-2 font-semibold text-lg text-sky-600">
                        Rp {(ticketPrices[selectedTicketType] * (quantity || 1)).toLocaleString('id-ID')}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Metode Pembayaran</label>
                      <select
                        value={selectedPaymentMethod}
                        onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        disabled={transactionLoading}
                      >
                        {(paymentMethods.length ? paymentMethods : DEFAULT_PAYMENT_METHODS).map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={transactionLoading}
                      className="w-full rounded-2xl bg-sky-600 px-4 py-2 text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {transactionLoading ? 'Memproses...' : 'Proses Pembayaran'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {view === 'ringkasan' && (
              <div className="rounded-3xl bg-white p-6 shadow-soft max-w-lg">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold">Ringkasan Kasir</h2>
                  <button
                    onClick={fetchDashboard}
                    disabled={loading}
                    className="rounded-2xl bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    {loading ? 'Memuat...' : 'Refresh'}
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 mb-6">
                  <div className="rounded-2xl bg-sky-50 border border-sky-100 p-4">
                    <p className="text-xs text-sky-600 uppercase font-bold tracking-wider">Transaksi Hari Ini</p>
                    <p className="text-2xl font-bold text-sky-900">{todaySummary.transactionCount}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
                    <p className="text-xs text-emerald-600 uppercase font-bold tracking-wider">Pendapatan Hari Ini</p>
                    <p className="text-2xl font-bold text-emerald-900">Rp {todaySummary.revenue.toLocaleString('id-ID')}</p>
                  </div>
                </div>
                <div className="space-y-4 text-sm text-slate-600">
                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                    <span>Total Scan</span>
                    <strong>{recentScans.length}</strong>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                    <span>Anggota Aktif</span>
                    <strong>{stats.activeMembers}</strong>
                  </div>
                </div>
              </div>
            )}

            {view === 'riwayat' && (
              <div className="rounded-3xl bg-white p-6 shadow-soft">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Riwayat Scan</h2>
                    <p className="text-sm text-slate-500">Scan terbaru untuk kasir</p>
                  </div>
                  <button
                    onClick={fetchDashboard}
                    disabled={loading}
                    className="rounded-2xl bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    {loading ? 'Memuat...' : 'Refresh'}
                  </button>
                </div>

                {loading ? (
                  <div className="rounded-3xl border border-slate-200 p-6 text-slate-500">Memuat data...</div>
                ) : recentScans.length === 0 ? (
                  <div className="rounded-3xl border border-slate-200 p-6 text-slate-500">Belum ada scan terbaru.</div>
                ) : (
                  <div className="space-y-4">
                    {recentScans.map((scan) => (
                      <div key={scan.uid + scan.scannedAt} className="rounded-3xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <span className="font-semibold">{scan.ticketType}</span>
                          <span className="text-sm text-slate-500">{scan.scannedDate ? `${scan.scannedDate} ` : ''}{scan.scannedAt}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
                          <span>UID: {scan.uid}</span>
                          <span>Gate: {scan.gate}</span>
                          <span>Status: <strong>{scan.status}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === 'grafik' && (
              <div className="rounded-3xl bg-white p-6 shadow-soft">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Grafik Tren</h2>
                    <p className="text-sm text-slate-500">7 jam dan 5 hari terakhir</p>
                  </div>
                  <button
                    onClick={fetchDashboard}
                    disabled={loading}
                    className="rounded-2xl bg-sky-600 px-4 py-2 text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Refresh
                  </button>
                </div>

                <div className="grid gap-8 md:grid-cols-2">
                  <div>
                    <p className="mb-4 text-sm font-semibold text-slate-600 uppercase tracking-wider">Hourly Trend</p>
                    <div className="space-y-3">
                      {stats.hourlyTrend.map((value, index) => {
                        const label = index === 6 ? 'Now' : `${6 - index}h`
                        const barWidth = chartMaxValue > 0 ? (value / chartMaxValue) * 100 : 0
                        return (
                          <div key={index} className="flex items-center gap-3">
                            <span className="w-8 text-right text-xs font-medium text-slate-500 shrink-0">{label}</span>
                            <div className="flex-1 h-7 rounded-xl bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-xl bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-500 flex items-center justify-end px-2"
                                style={{ width: `${Math.max(barWidth, value > 0 ? 8 : 0)}%` }}
                              >
                                {value > 0 && <span className="text-[10px] font-bold text-white drop-shadow-sm">{value}</span>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="mb-4 text-sm font-semibold text-slate-600 uppercase tracking-wider">Daily Trend</p>
                    <div className="space-y-3">
                      {stats.dailyTrend.map((value, index) => {
                        const label = `${4 - index}d`
                        const barWidth = chartMaxValue > 0 ? (value / chartMaxValue) * 100 : 0
                        return (
                          <div key={index} className="flex items-center gap-3">
                            <span className="w-8 text-right text-xs font-medium text-slate-500 shrink-0">{label}</span>
                            <div className="flex-1 h-7 rounded-xl bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-500 flex items-center justify-end px-2"
                                style={{ width: `${Math.max(barWidth, value > 0 ? 8 : 0)}%` }}
                              >
                                {value > 0 && <span className="text-[10px] font-bold text-white drop-shadow-sm">{value}</span>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {view === 'kontrol-gate' && (
              <div className="rounded-3xl bg-white p-6 shadow-soft">
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
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
