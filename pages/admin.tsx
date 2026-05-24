import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import StatusCard from '@/components/StatusCard'
import CardManagement from '@/components/CardManagement'
import { getFirebaseIdToken, logoutFirebase, onFirebaseAuthStateChanged } from '@/lib/firebase'
import { cacheJson, clearOfflineSession, getCachedJson, getOfflineSession, setOfflineSession } from '@/lib/offlineClient'
import type { GateStatus, ScanLog, TicketStats, Transaction, PrintoutConfig } from '@/lib/types'
import { generateReceipt } from '@/lib/receipt'

type AdminDashboardResponse = {
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
const INITIAL_TICKET_PRICES: Record<string, number> = {
  'Tiket Harian': 50000,
  Member: 100000,
  VIP: 75000,
  'Paket Keluarga': 200000,
  'Tiket Anak': 30000,
  'Tiket Dewasa': 50000
}

export default function AdminPage() {
  const router = useRouter()
  const [status, setStatus] = useState<GateStatus>({ online: false, lastSeen: null, currentGate: '-' })
  const [recentScans, setRecentScans] = useState<ScanLog[]>([])
  const [stats, setStats] = useState<TicketStats>(initialStats)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [newCashierName, setNewCashierName] = useState('')
  const [newCashierEmail, setNewCashierEmail] = useState('')
  const [newCashierPassword, setNewCashierPassword] = useState('')
  const [createMessage, setCreateMessage] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [authInitialized, setAuthInitialized] = useState(false)
  const [view, setView] = useState<'dashboard' | 'kasir' | 'kartu' | 'grafik' | 'riwayat' | 'harga' | 'laporan' | 'transaksi' | 'printout'>('dashboard')
  const [ticketPrices, setTicketPrices] = useState<Record<string, number>>(INITIAL_TICKET_PRICES)
  const [priceSaving, setPriceSaving] = useState(false)
  const [priceMessage, setPriceMessage] = useState<string | null>(null)
  const [reportFilter, setReportFilter] = useState<'today' | 'week' | 'month' | 'all'>('today')
  const [salesReport, setSalesReport] = useState<any>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [offlineMode, setOfflineMode] = useState(false)
  const [ticketTypes, setTicketTypes] = useState<string[]>([])
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['Tunai', 'Kartu Debit', 'Kartu Kredit', 'E-Wallet'])
  const [todaySummary, setTodaySummary] = useState<{ transactionCount: number; revenue: number }>({ transactionCount: 0, revenue: 0 })
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [txFilter, setTxFilter] = useState<'today' | 'week' | 'month' | 'all'>('today')
  const [txLoading, setTxLoading] = useState(false)
  const [printReceipt, setPrintReceipt] = useState<string | null>(null)
  const [printoutConfig, setPrintoutConfig] = useState<PrintoutConfig>({
    placeName: 'KOLAM RENANG', address: '', phone: '', headerText: '', footerMessage1: 'Terima Kasih', footerMessage2: 'Selamat Bersenang-senang'
  })
  const [printoutSaving, setPrintoutSaving] = useState(false)
  const [printoutMessage, setPrintoutMessage] = useState<string | null>(null)

  const fetchPrintoutConfig = async () => {
    try {
      const token = await getFirebaseIdToken()
      const res = await fetch('/api/printout-config', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        if (data.config) setPrintoutConfig(data.config)
      }
    } catch {}
  }

  const savePrintoutConfig = async () => {
    setPrintoutSaving(true)
    setPrintoutMessage(null)
    try {
      const token = await getFirebaseIdToken()
      const res = await fetch('/api/printout-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(printoutConfig)
      })
      const data = await res.json()
      if (res.ok) {
        setPrintoutMessage('Konfigurasi tersimpan')
        if (data.config) setPrintoutConfig(data.config)
      } else {
        setPrintoutMessage('Gagal: ' + (data.error || 'Unknown error'))
      }
    } catch {
      setPrintoutMessage('Gagal terhubung ke server')
    } finally {
      setPrintoutSaving(false)
    }
    setTimeout(() => setPrintoutMessage(null), 3000)
  }

  const fetchTransactions = async (filter = txFilter) => {
    setTxLoading(true)
    try {
      const token = await getFirebaseIdToken()
      const res = await fetch(`/api/transactions?filter=${filter}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.status === 401) {
        await logoutFirebase()
        router.replace('/login')
        return
      }
      const data = await res.json()
      if (res.ok) {
        setTransactions(data.transactions)
      }
    } catch {
      setError('Gagal memuat transaksi')
    } finally {
      setTxLoading(false)
    }
  }

  const handlePrintTransaction = async (tx: Transaction) => {
    const date = new Date(tx.createdAt)
    let printoutCfg = undefined
    try {
      const token = await getFirebaseIdToken()
      const cfgRes = await fetch('/api/printout-config', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (cfgRes.ok) {
        const cfgData = await cfgRes.json()
        printoutCfg = cfgData.config
      }
    } catch {}
    const receipt = generateReceipt({
      transactionId: tx.transactionId,
      dateTime: date,
      ticketType: tx.ticketType,
      price: tx.price,
      quantity: tx.quantity,
      total: tx.total,
      cardUid: tx.uid,
      cashierName: tx.cashier,
      paymentMethod: tx.paymentMethod
    }, printoutCfg)
    const printWindow = window.open('', '', 'width=400,height=600')
    if (!printWindow) return
    printWindow.document.write(`
      <html><head><title>Struk ${tx.transactionId}</title>
      <style>
        @page { size: 58mm auto; margin: 0; }
        * { box-sizing: border-box; }
        html,body { font-family:'Courier New',monospace; margin:0; padding:0; width:58mm; background:#fff; }
        body { padding:2mm; color:#000; font-size:10px; line-height:1.25; }
        pre { margin:0; width:54mm; white-space:pre-wrap; word-break:break-word; }
      </style></head><body><pre>${receipt.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c))}</pre></body></html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  useEffect(() => {
    const unsubscribe = onFirebaseAuthStateChanged((user) => {
      setAuthInitialized(true)
      if (!user) {
        const offlineSession = getOfflineSession('admin')
        if (!offlineSession) {
          router.replace('/login')
          return
        }

        setOfflineMode(true)
        setUserEmail(offlineSession.email)
        loadCachedAdminData()
        return
      }
      setOfflineMode(false)
      setUserEmail(user.email || null)
      setOfflineSession(user.email || 'admin', 'admin', false)
      fetchDashboard()
      fetchConfig()
    })

    return unsubscribe
  }, [router])

  useEffect(() => {
    const handleOnline = () => {
      setOfflineMode(false)
      fetchDashboard()
      fetchConfig()
    }
    const handleOffline = () => setOfflineMode(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setOfflineMode(!navigator.onLine)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const loadCachedAdminData = () => {
    const cachedDashboard = getCachedJson<AdminDashboardResponse>('adminDashboard')
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
    setError('Mode offline aktif. Data dashboard memakai cache terakhir.')
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
        console.log('Admin fetched prices:', data.prices)
        setTicketPrices(data.prices)
        cacheJson('ticketPrices', data.prices)
      }
    } catch (err) {
      console.error('Failed to fetch prices in admin:', err)
    const cachedPrices = getCachedJson<Record<string, number>>('ticketPrices')
      if (cachedPrices) {
        setTicketPrices(cachedPrices)
      }
    }
  }

  const fetchDashboard = async () => {
    setLoading(true)
    setError(null)

    try {
      const token = await getFirebaseIdToken()
      const res = await fetch('/api/admin-dashboard', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (res.status === 401) {
        await logoutFirebase()
        router.replace('/login')
        return
      }

      const data = await res.json()
      if (res.status === 403) {
        await logoutFirebase()
        router.replace('/login')
        return
      }

      if (!res.ok) {
        throw new Error(data.error || 'Gagal memuat data dashboard')
      }

      const payload = data as AdminDashboardResponse
      setStatus(payload.status)
      setStats(payload.stats)
      setRecentScans(payload.recentScans)
      if (payload.todaySummary) setTodaySummary(payload.todaySummary)
      cacheJson('adminDashboard', payload)
    } catch (err: any) {
      const cachedDashboard = getCachedJson<AdminDashboardResponse>('adminDashboard')
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

  const fetchSalesReport = async (filter = reportFilter) => {
    setReportLoading(true)
    try {
      const token = await getFirebaseIdToken()
      const res = await fetch(`/api/sales-report?filter=${filter}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        setSalesReport(data)
        cacheJson(`salesReport.${filter}`, data)
      }
    } catch (err) {
      console.error('Failed to fetch sales report:', err)
      const cachedReport = getCachedJson<any>(`salesReport.${filter}`)
      if (cachedReport) {
        setSalesReport(cachedReport)
      }
    } finally {
      setReportLoading(false)
    }
  }

  // Auto-refresh saat view berubah
  useEffect(() => {
    if (view === 'laporan') {
      fetchSalesReport()
    } else if (view === 'riwayat') {
      fetchDashboard()
    } else if (view === 'transaksi') {
      fetchTransactions()
    } else if (view === 'printout') {
      fetchPrintoutConfig()
    }
  }, [view, reportFilter])

  const handleLogout = async () => {
    clearOfflineSession()
    if (!offlineMode) {
      await logoutFirebase()
    }
    router.replace('/login')
  }

  const handleSaveTicketPrices = async () => {
    setPriceSaving(true)
    setPriceMessage(null)
    try {
      if (!navigator.onLine || offlineMode) {
        cacheJson('ticketPrices', ticketPrices)
        setPriceMessage('Harga disimpan lokal. Simpan ulang saat online untuk mengirim ke server.')
        setTimeout(() => setPriceMessage(null), 4000)
        return
      }

      console.log('Saving prices:', ticketPrices)
      const token = await getFirebaseIdToken()
      const res = await fetch('/api/update-prices', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`
                        },
        body: JSON.stringify({ prices: ticketPrices })
      })

      const data = await res.json()
      console.log('Update prices response:', data)
      if (!res.ok) {
        throw new Error(data.error || 'Gagal menyimpan harga')
      }

      setPriceMessage('Harga tiket berhasil disimpan!')
      cacheJson('ticketPrices', ticketPrices)
      setTimeout(() => setPriceMessage(null), 3000)
    } catch (err: any) {
      console.error('Error saving prices:', err)
      setPriceMessage(`Error: ${err?.message || 'Gagal menyimpan harga'}`)
    } finally {
      setPriceSaving(false)
    }
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
            <span className="text-sm uppercase tracking-[0.25em] text-sky-700">Admin Dashboard</span>
            <h1 className="mt-2 text-3xl font-semibold">Monitoring Gate & Ticketing</h1>
            {userEmail ? <p className="mt-2 text-sm text-slate-500">Masuk sebagai {userEmail}</p> : null}
            <p className="mt-2 text-sm text-slate-500">{offlineMode ? 'Mode offline aktif' : 'Online'}</p>
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
                  onClick={() => setView('kasir')}
                  className={`w-full text-left rounded-xl px-4 py-2 hover:bg-slate-50 ${view === 'kasir' ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  Tambah Kasir
                </button>
                <button
                  onClick={() => setView('kartu')}
                  className={`w-full text-left rounded-xl px-4 py-2 hover:bg-slate-50 ${view === 'kartu' ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  Management Kartu
                </button>
                <button
                  onClick={() => setView('grafik')}
                  className={`w-full text-left rounded-xl px-4 py-2 hover:bg-slate-50 ${view === 'grafik' ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  Grafik Tren
                </button>
                <button
                  onClick={() => setView('transaksi')}
                  className={`w-full text-left rounded-xl px-4 py-2 hover:bg-slate-50 ${view === 'transaksi' ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  Riwayat Transaksi
                </button>
                <button
                  onClick={() => setView('riwayat')}
                  className={`w-full text-left rounded-xl px-4 py-2 hover:bg-slate-50 ${view === 'riwayat' ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  Riwayat Scan
                </button>
                <button
                  onClick={() => setView('harga')}
                  className={`w-full text-left rounded-xl px-4 py-2 hover:bg-slate-50 ${view === 'harga' ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  Pengaturan Harga
                </button>
                <button
                  onClick={() => setView('printout')}
                  className={`w-full text-left rounded-xl px-4 py-2 hover:bg-slate-50 ${view === 'printout' ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  Custom Print Out
                </button>
                <button
                  onClick={() => setView('laporan')}
                  className={`w-full text-left rounded-xl px-4 py-2 hover:bg-slate-50 ${view === 'laporan' ? 'bg-slate-100 font-semibold' : ''}`}
                >
                  Laporan Penjualan
                </button>
              </nav>
            </div>
          </aside>

          {/* Konten utama berubah sesuai view */}
          <section className="flex-1">
            {error ? (
              <div className="mb-6 rounded-3xl bg-amber-50 p-6 text-amber-900 shadow-soft">
                <p className="font-semibold">Gagal memuat dashboard</p>
                <p className="mt-2 text-sm">{error}</p>
              </div>
            ) : null}

            {view === 'dashboard' && (
              <>
                <div className="grid gap-4 xl:grid-cols-4">
                  <StatusCard title="Pengunjung Hari Ini" value={stats.totalVisitorsToday.toString()} note="Statistik realtime" />
                  <StatusCard title="Gate Status" value={status.online ? 'Online' : 'Offline'} note={`Gate: ${status.connectedGateNames?.join(', ') || status.connectedGates?.join(', ') || status.currentGate}`} />
                  <StatusCard title="Members Aktif" value={stats.activeMembers.toString()} note="Data Firestore" />
                  <StatusCard title="Last Seen" value={status.lastSeen ? new Date(status.lastSeen).toLocaleTimeString() : 'Never'} note="Scan terakhir" />
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-3">
                  <div className="rounded-3xl bg-white p-6 shadow-soft">
                    <h2 className="text-lg font-semibold">Ringkasan</h2>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 mb-6">
                      <div className="rounded-2xl bg-sky-50 border border-sky-100 p-3">
                        <p className="text-xs text-sky-600 uppercase font-bold tracking-wider">Transaksi Hari Ini</p>
                        <p className="text-xl font-bold text-sky-900">{todaySummary.transactionCount}</p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-3">
                        <p className="text-xs text-emerald-600 uppercase font-bold tracking-wider">Pendapatan Hari Ini</p>
                        <p className="text-xl font-bold text-emerald-900">Rp {todaySummary.revenue.toLocaleString('id-ID')}</p>
                      </div>
                    </div>
                    <div className="space-y-3 text-sm text-slate-600">
                      <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                        <span>Total Scan</span>
                        <strong>{recentScans.length}</strong>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                        <span>Anggota Aktif</span>
                        <strong>{stats.activeMembers}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-3xl bg-white p-6 shadow-soft xl:col-span-2">
                    <div className="mb-5 flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold">Scan Terbaru</h2>
                        <p className="text-sm text-slate-500">Data langsung dari Firestore</p>
                      </div>
                    </div>

                    {loading ? (
                      <div className="rounded-3xl border border-slate-200 p-6 text-slate-500">Memuat data...</div>
                    ) : recentScans.length === 0 ? (
                      <div className="rounded-3xl border border-slate-200 p-6 text-slate-500">Belum ada scan terbaru.</div>
                    ) : (
                      <div className="space-y-4 max-h-96 overflow-y-auto">
                        {recentScans.slice(0, 5).map((scan) => (
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

            {view === 'kasir' && (
              <div className="rounded-3xl bg-white p-6 shadow-soft max-w-md">
                <h2 className="text-lg font-semibold">Tambah User Kasir</h2>
                <p className="mt-2 text-sm text-slate-500">Buat akun kasir baru dengan email dan password.</p>
                <form
                  onSubmit={async (event) => {
                    event.preventDefault()
                    setCreateError(null)
                    setCreateMessage(null)

                    try {
                      const token = await getFirebaseIdToken()
                      const response = await fetch('/api/create-cashier', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`
                        },
                        body: JSON.stringify({
                          email: newCashierEmail,
                          password: newCashierPassword,
                          displayName: newCashierName
                        })
                      })

                      const data = await response.json()
                      if (!response.ok) {
                        throw new Error(data.error || 'Gagal membuat kasir')
                      }

                      setCreateMessage(`Kasir ${data.email} berhasil dibuat.`)
                      setNewCashierName('')
                      setNewCashierEmail('')
                      setNewCashierPassword('')
                    } catch (err: any) {
                      setCreateError(err?.message || 'Gagal membuat kasir')
                    }
                  }}
                  className="mt-6 space-y-4"
                >
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Nama Kasir</span>
                    <input
                      type="text"
                      value={newCashierName}
                      onChange={(event) => setNewCashierName(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 focus:border-sky-500 focus:outline-none"
                      placeholder="Nama Kasir"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Email Kasir</span>
                    <input
                      type="email"
                      value={newCashierEmail}
                      onChange={(event) => setNewCashierEmail(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 focus:border-sky-500 focus:outline-none"
                      placeholder="kasir@waterpark.id"
                      required
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Password</span>
                    <input
                      type="password"
                      value={newCashierPassword}
                      onChange={(event) => setNewCashierPassword(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 focus:border-sky-500 focus:outline-none"
                      placeholder="••••••••"
                      required
                    />
                  </label>
                  {createError ? <p className="text-sm text-red-600">{createError}</p> : null}
                  {createMessage ? <p className="text-sm text-green-600">{createMessage}</p> : null}
                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-white shadow-soft hover:bg-sky-700"
                  >
                    Buat Kasir
                  </button>
                </form>
              </div>
            )}

            {view === 'kartu' && <CardManagement ticketTypes={ticketTypes} />}

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

            {view === 'riwayat' && (
              <div className="rounded-3xl bg-white p-6 shadow-soft">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Riwayat Scan Kartu</h2>
                    <p className="text-sm text-slate-500">Data langsung dari Firestore</p>
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
                  <div className="space-y-4 max-h-96 overflow-y-auto">
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

            {view === 'harga' && (
              <div className="rounded-3xl bg-white p-6 shadow-soft max-w-2xl">
                <h2 className="text-lg font-semibold mb-6">Pengaturan Harga Tiket</h2>
                <div className="space-y-4">
                  {(ticketTypes.length ? ticketTypes : DEFAULT_TICKET_TYPES).map((ticketType) => (
                    <div key={ticketType} className="flex items-center gap-4">
                      <label className="flex-1 text-sm font-medium text-slate-700 min-w-48">{ticketType}</label>
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-slate-600">Rp</span>
                        <input
                          type="number"
                          min={0}
                          value={ticketPrices[ticketType]}
                          onChange={(e) => setTicketPrices({
                            ...ticketPrices,
                            [ticketType]: Number(e.target.value)
                          })}
                          className="flex-1 rounded-2xl border border-slate-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {priceMessage ? (
                  <p className={`mt-4 text-sm ${priceMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                    {priceMessage}
                  </p>
                ) : null}
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={handleSaveTicketPrices}
                    disabled={priceSaving}
                    className="flex-1 rounded-2xl bg-sky-600 px-4 py-3 text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {priceSaving ? 'Menyimpan...' : 'Simpan Pengaturan Harga'}
                  </button>
                  <button
                    onClick={fetchConfig}
                    className="rounded-2xl bg-slate-200 px-4 py-3 text-slate-700 hover:bg-slate-300"
                    title="Muat ulang harga dari database"
                  >
                    Muat Ulang
                  </button>
                </div>
              </div>
            )}

            {view === 'laporan' && (
              <div className="space-y-6">
                <div className="rounded-3xl bg-white p-6 shadow-soft">
                  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold">Laporan Penjualan Tiket</h2>
                      <p className="text-sm text-slate-500">Ringkasan pendapatan dan volume tiket</p>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-2xl">
                      {(['today', 'week', 'month', 'all'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setReportFilter(f)}
                          className={`px-4 py-1.5 text-sm rounded-xl transition-all ${
                            reportFilter === f ? 'bg-white shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {f === 'today' ? 'Hari Ini' : f === 'week' ? 'Minggu Ini' : f === 'month' ? 'Bulan' : 'Semua'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {reportLoading ? (
                    <div className="py-12 text-center text-slate-500">Memuat laporan...</div>
                  ) : salesReport ? (
                    <>
                      <div className="grid gap-4 mb-8 sm:grid-cols-3">
                        <div className="p-4 rounded-2xl bg-sky-50 border border-sky-100">
                          <p className="text-xs text-sky-600 uppercase font-bold tracking-wider">Total Pendapatan</p>
                          <p className="text-2xl font-bold text-sky-900">Rp {salesReport.summary.totalRevenue.toLocaleString()}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                          <p className="text-xs text-emerald-600 uppercase font-bold tracking-wider">Tiket Terjual</p>
                          <p className="text-2xl font-bold text-emerald-900">{salesReport.summary.totalQuantity} Tiket</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-purple-50 border border-purple-100">
                          <p className="text-xs text-purple-600 uppercase font-bold tracking-wider">Total Transaksi</p>
                          <p className="text-2xl font-bold text-purple-900">{salesReport.summary.totalTransactions}</p>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-slate-100 text-sm text-slate-500">
                              <th className="pb-4 font-medium">Jenis Tiket</th>
                              <th className="pb-4 font-medium">Kuantitas</th>
                              <th className="pb-4 font-medium text-right">Total Pendapatan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {salesReport.details.map((item: any) => (
                              <tr key={item.ticketType}>
                                <td className="py-4 font-medium">{item.ticketType}</td>
                                <td className="py-4">{item.quantity}</td>
                                <td className="py-4 text-right font-semibold">Rp {item.totalRevenue.toLocaleString()}</td>
                              </tr>
                            ))}
                            {salesReport.details.length === 0 && (
                              <tr>
                                <td colSpan={3} className="py-8 text-center text-slate-400 italic">Tidak ada data penjualan pada periode ini</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="py-12 text-center text-slate-500">Gagal memuat data. Silakan refresh.</div>
                  )}
                </div>
              </div>
            )}

            {view === 'printout' && (
              <div className="rounded-3xl bg-white p-6 shadow-soft max-w-2xl">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Custom Print Out</h2>
                    <p className="text-sm text-slate-500">Sesuaikan tampilan struk thermal</p>
                  </div>
                  <button
                    onClick={savePrintoutConfig}
                    disabled={printoutSaving}
                    className="rounded-2xl bg-sky-600 px-4 py-2 text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    {printoutSaving ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>

                {printoutMessage && (
                  <div className={`mb-4 rounded-2xl p-3 text-sm ${printoutMessage.includes('Gagal') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                    {printoutMessage}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Nama Tempat</label>
                    <input
                      type="text"
                      value={printoutConfig.placeName}
                      onChange={(e) => setPrintoutConfig({ ...printoutConfig, placeName: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Alamat</label>
                    <textarea
                      rows={2}
                      value={printoutConfig.address}
                      onChange={(e) => setPrintoutConfig({ ...printoutConfig, address: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Telepon</label>
                    <input
                      type="text"
                      value={printoutConfig.phone}
                      onChange={(e) => setPrintoutConfig({ ...printoutConfig, phone: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Teks Header (tambahan)</label>
                    <input
                      type="text"
                      value={printoutConfig.headerText}
                      onChange={(e) => setPrintoutConfig({ ...printoutConfig, headerText: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      placeholder="Contoh: Jam Operasional 08:00 - 17:00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Footer Baris 1</label>
                    <input
                      type="text"
                      value={printoutConfig.footerMessage1}
                      onChange={(e) => setPrintoutConfig({ ...printoutConfig, footerMessage1: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Footer Baris 2</label>
                    <input
                      type="text"
                      value={printoutConfig.footerMessage2}
                      onChange={(e) => setPrintoutConfig({ ...printoutConfig, footerMessage2: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div className="mt-8 rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Pratinjau Header Struk</p>
                  <pre className="font-mono text-xs text-slate-800 bg-white rounded-xl p-3 border border-slate-100 whitespace-pre-wrap">
                    {[printoutConfig.placeName, printoutConfig.address, printoutConfig.phone ? `Telp: ${printoutConfig.phone}` : '', ...(printoutConfig.headerText ? ['', printoutConfig.headerText] : [])].filter(Boolean).join('\n')}
                  </pre>
                </div>
              </div>
            )}

            {view === 'transaksi' && (
              <div className="rounded-3xl bg-white p-6 shadow-soft">
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Riwayat Transaksi</h2>
                    <p className="text-sm text-slate-500">Daftar transaksi pembayaran tiket</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex bg-slate-100 p-1 rounded-2xl">
                      {(['today', 'week', 'month', 'all'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => { setTxFilter(f); fetchTransactions(f) }}
                          className={`px-3 py-1.5 text-sm rounded-xl transition-all ${
                            txFilter === f ? 'bg-white shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {f === 'today' ? 'Hari Ini' : f === 'week' ? 'Minggu' : f === 'month' ? 'Bulan' : 'Semua'}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => fetchTransactions()}
                      className="rounded-2xl bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700"
                    >
                      {txLoading ? 'Memuat...' : 'Refresh'}
                    </button>
                  </div>
                </div>

                {txLoading ? (
                  <div className="py-12 text-center text-slate-500">Memuat transaksi...</div>
                ) : transactions.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 italic">Tidak ada transaksi pada periode ini</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-100 text-sm text-slate-500">
                          <th className="pb-3 font-medium">Waktu</th>
                          <th className="pb-3 font-medium">ID Transaksi</th>
                          <th className="pb-3 font-medium">Tiket</th>
                          <th className="pb-3 font-medium">Qty</th>
                          <th className="pb-3 font-medium text-right">Total</th>
                          <th className="pb-3 font-medium">Kasir</th>
                          <th className="pb-3 font-medium">Status</th>
                          <th className="pb-3 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {transactions.map((tx) => (
                          <tr key={tx.transactionId} className="text-sm hover:bg-slate-50">
                            <td className="py-3 whitespace-nowrap text-slate-500">
                              {new Date(tx.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="py-3 font-mono text-xs max-w-[120px] truncate">{tx.transactionId}</td>
                            <td className="py-3">{tx.ticketType}</td>
                            <td className="py-3">{tx.quantity}</td>
                            <td className="py-3 text-right font-semibold">Rp {tx.total.toLocaleString('id-ID')}</td>
                            <td className="py-3 text-slate-600">{tx.cashier}</td>
                            <td className="py-3">
                              <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                                {tx.paymentStatus}
                              </span>
                            </td>
                            <td className="py-3">
                              <button
                                onClick={() => handlePrintTransaction(tx)}
                                className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-sky-100 hover:text-sky-700 transition-colors"
                              >
                                Cetak
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
