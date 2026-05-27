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

function NavButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
        active
          ? 'bg-sky-50 text-sky-700'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
      }`}
    >
      {label}
    </button>
  )
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
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white text-slate-900">
        <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-card text-slate-900">Memeriksa autentikasi...</div>
      </div>
    )
  }

  const chartMaxValue = Math.max(...stats.hourlyTrend, ...stats.dailyTrend, 1)

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">Admin Dashboard</span>
            <h1 className="mt-1.5 text-2xl font-bold text-slate-900">Monitoring Gate &amp; Ticketing</h1>
            {userEmail ? <p className="mt-1.5 text-sm text-slate-400">Masuk sebagai {userEmail}</p> : null}
            <p className="mt-1 text-xs text-slate-400">{offlineMode ? 'Mode offline aktif' : 'Online'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={fetchConfig} className="rounded-xl bg-white border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 shadow-card transition-all hover:border-slate-300 hover:shadow-card-hover active:scale-[0.97]" title="Refresh data dari server">
              Refresh Data
            </button>
            <button onClick={handleLogout} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-card transition-all hover:border-slate-300 hover:shadow-card-hover active:scale-[0.97]">
              Logout
            </button>
            <Link href="/" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-card transition-all hover:bg-slate-800 hover:shadow-card-hover active:scale-[0.97]">
              Beranda
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-6 md:flex-row">
          {/* Sidebar kiri */}
          <aside className="md:w-56 shrink-0">
            <nav className="rounded-2xl border border-slate-100 bg-white p-2 shadow-card">
              <NavButton label="Dashboard" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
              <NavButton label="Tambah Kasir" active={view === 'kasir'} onClick={() => setView('kasir')} />
              <NavButton label="Management Kartu" active={view === 'kartu'} onClick={() => setView('kartu')} />
              <NavButton label="Grafik Tren" active={view === 'grafik'} onClick={() => setView('grafik')} />
              <NavButton label="Riwayat Transaksi" active={view === 'transaksi'} onClick={() => setView('transaksi')} />
              <NavButton label="Riwayat Scan" active={view === 'riwayat'} onClick={() => setView('riwayat')} />
              <NavButton label="Pengaturan Harga" active={view === 'harga'} onClick={() => setView('harga')} />
              <NavButton label="Custom Print Out" active={view === 'printout'} onClick={() => setView('printout')} />
              <NavButton label="Laporan Penjualan" active={view === 'laporan'} onClick={() => setView('laporan')} />
            </nav>
          </aside>

          {/* Konten utama berubah sesuai view */}
          <section className="flex-1 min-w-0 animate-fade-in">
            {error ? (
              <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800">
                <p className="text-sm font-medium">{error}</p>
              </div>
            ) : null}

            {view === 'dashboard' && (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <StatusCard title="Pengunjung Hari Ini" value={stats.totalVisitorsToday.toString()} note="Statistik realtime" />
                  <StatusCard title="Gate Status" value={status.online ? 'Online' : 'Offline'} note={`Gate: ${status.connectedGateNames?.join(', ') || status.connectedGates?.join(', ') || status.currentGate}`} />
                  <StatusCard title="Members Aktif" value={stats.activeMembers.toString()} note="Data Firestore" />
                  <StatusCard title="Last Seen" value={status.lastSeen ? new Date(status.lastSeen).toLocaleTimeString() : 'Never'} note="Scan terakhir" />
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-3">
                  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
                    <h2 className="text-base font-semibold text-slate-900">Ringkasan</h2>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 mb-5">
                      <div className="rounded-xl bg-sky-50 border border-sky-100 p-3.5">
                        <p className="text-[10px] font-semibold text-sky-600 uppercase tracking-wider">Transaksi Hari Ini</p>
                        <p className="mt-1 text-xl font-bold text-sky-900">{todaySummary.transactionCount}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3.5">
                        <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Pendapatan Hari Ini</p>
                        <p className="mt-1 text-xl font-bold text-emerald-900">Rp {todaySummary.revenue.toLocaleString('id-ID')}</p>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm text-slate-500">
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
                        <span>Total Scan</span>
                        <span className="font-semibold text-slate-700">{recentScans.length}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-2.5">
                        <span>Anggota Aktif</span>
                        <span className="font-semibold text-slate-700">{stats.activeMembers}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card xl:col-span-2">
                    <div className="mb-4">
                      <h2 className="text-base font-semibold text-slate-900">Scan Terbaru</h2>
                      <p className="text-sm text-slate-400">Data langsung dari Firestore</p>
                    </div>

                    {loading ? (
                      <div className="rounded-xl border border-slate-100 p-6 text-sm text-slate-400 text-center">Memuat data...</div>
                    ) : recentScans.length === 0 ? (
                      <div className="rounded-xl border border-slate-100 p-6 text-sm text-slate-400 text-center">Belum ada scan terbaru.</div>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {recentScans.slice(0, 5).map((scan) => (
                          <div key={scan.uid + scan.scannedAt} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                            <span className="font-medium text-sm text-slate-700">{scan.ticketType}</span>
                            <span className="text-xs text-slate-400">{scan.scannedDate ? `${scan.scannedDate} ` : ''}{scan.scannedAt}</span>
                            <span className="ml-auto text-xs text-slate-400">UID: {scan.uid}</span>
                            <span className="text-xs text-slate-400">Gate: {scan.gate}</span>
                            <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Status: {scan.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {view === 'kasir' && (
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card max-w-md">
                <h2 className="text-base font-semibold text-slate-900">Tambah User Kasir</h2>
                <p className="mt-1 text-sm text-slate-400">Buat akun kasir baru dengan email dan password.</p>
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
                  className="mt-5 space-y-4"
                >
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Kasir</label>
                    <input
                      type="text"
                      value={newCashierName}
                      onChange={(event) => setNewCashierName(event.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      placeholder="Nama Kasir"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email Kasir</label>
                    <input
                      type="email"
                      value={newCashierEmail}
                      onChange={(event) => setNewCashierEmail(event.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      placeholder="kasir@waterpark.id"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Password</label>
                    <input
                      type="password"
                      value={newCashierPassword}
                      onChange={(event) => setNewCashierPassword(event.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                  {createError ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{createError}</p> : null}
                  {createMessage ? <p className="rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-600">{createMessage}</p> : null}
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-sky-700 hover:shadow-card-hover active:scale-[0.97]"
                  >
                    Buat Kasir
                  </button>
                </form>
              </div>
            )}

            {view === 'kartu' && <CardManagement ticketTypes={ticketTypes} />}

            {view === 'grafik' && (
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Grafik Tren</h2>
                    <p className="text-sm text-slate-400">7 jam dan 5 hari terakhir</p>
                  </div>
                  <button
                    onClick={fetchDashboard}
                    disabled={loading}
                    className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-card transition-all hover:bg-sky-700 hover:shadow-card-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Refresh
                  </button>
                </div>

                <div className="grid gap-8 md:grid-cols-2">
                  <div>
                    <p className="mb-4 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Hourly Trend</p>
                    <div className="space-y-2">
                      {stats.hourlyTrend.map((value, index) => {
                        const label = index === 6 ? 'Now' : `${6 - index}h`
                        const barWidth = chartMaxValue > 0 ? (value / chartMaxValue) * 100 : 0
                        return (
                          <div key={index} className="flex items-center gap-3">
                            <span className="w-8 text-right text-xs font-medium text-slate-400 shrink-0">{label}</span>
                            <div className="flex-1 h-6 rounded-lg bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-lg bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-500 flex items-center justify-end px-2"
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
                    <p className="mb-4 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Daily Trend</p>
                    <div className="space-y-2">
                      {stats.dailyTrend.map((value, index) => {
                        const label = `${4 - index}d`
                        const barWidth = chartMaxValue > 0 ? (value / chartMaxValue) * 100 : 0
                        return (
                          <div key={index} className="flex items-center gap-3">
                            <span className="w-8 text-right text-xs font-medium text-slate-400 shrink-0">{label}</span>
                            <div className="flex-1 h-6 rounded-lg bg-slate-100 overflow-hidden">
                              <div
                                className="h-full rounded-lg bg-gradient-to-r from-indigo-500 to-indigo-400 transition-all duration-500 flex items-center justify-end px-2"
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
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Riwayat Scan Kartu</h2>
                    <p className="text-sm text-slate-400">Data langsung dari Firestore</p>
                  </div>
                  <button
                    onClick={fetchDashboard}
                    disabled={loading}
                    className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-card transition-all hover:bg-sky-700 active:scale-[0.97] disabled:opacity-50"
                  >
                    {loading ? 'Memuat...' : 'Refresh'}
                  </button>
                </div>

                {loading ? (
                  <div className="rounded-xl border border-slate-100 p-6 text-sm text-slate-400 text-center">Memuat data...</div>
                ) : recentScans.length === 0 ? (
                  <div className="rounded-xl border border-slate-100 p-6 text-sm text-slate-400 text-center">Belum ada scan terbaru.</div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {recentScans.map((scan) => (
                      <div key={scan.uid + scan.scannedAt} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
                        <span className="font-medium text-sm text-slate-700">{scan.ticketType}</span>
                        <span className="text-xs text-slate-400">{scan.scannedDate ? `${scan.scannedDate} ` : ''}{scan.scannedAt}</span>
                        <span className="ml-auto text-xs text-slate-400">UID: {scan.uid}</span>
                        <span className="text-xs text-slate-400">Gate: {scan.gate}</span>
                        <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Status: {scan.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === 'harga' && (
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card max-w-2xl">
                <h2 className="text-base font-semibold text-slate-900 mb-5">Pengaturan Harga Tiket</h2>
                <div className="space-y-3">
                  {(ticketTypes.length ? ticketTypes : DEFAULT_TICKET_TYPES).map((ticketType) => (
                    <div key={ticketType} className="flex items-center gap-4 rounded-xl bg-slate-50/50 border border-slate-100 px-4 py-3">
                      <label className="flex-1 text-sm font-medium text-slate-600 min-w-40">{ticketType}</label>
                      <div className="flex items-center gap-2 w-48">
                        <span className="text-sm text-slate-400">Rp</span>
                        <input
                          type="number"
                          min={0}
                          value={ticketPrices[ticketType]}
                          onChange={(e) => setTicketPrices({
                            ...ticketPrices,
                            [ticketType]: Number(e.target.value)
                          })}
                          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 transition-colors focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {priceMessage ? (
                  <p className={`mt-4 rounded-lg px-3 py-2 text-xs font-medium ${
                    priceMessage.includes('Error') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                  }`}>
                    {priceMessage}
                  </p>
                ) : null}
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={handleSaveTicketPrices}
                    disabled={priceSaving}
                    className="flex-1 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-sky-700 hover:shadow-card-hover active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {priceSaving ? 'Menyimpan...' : 'Simpan Pengaturan Harga'}
                  </button>
                  <button
                    onClick={fetchConfig}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-card transition-all hover:border-slate-300 hover:shadow-card-hover active:scale-[0.97]"
                    title="Muat ulang harga dari database"
                  >
                    Muat Ulang
                  </button>
                </div>
              </div>
            )}

            {view === 'laporan' && (
              <div className="space-y-6 animate-fade-in">
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
                  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">Laporan Penjualan Tiket</h2>
                      <p className="text-sm text-slate-400">Ringkasan pendapatan dan volume tiket</p>
                    </div>
                    <div className="flex bg-slate-100 p-0.5 rounded-lg">
                      {(['today', 'week', 'month', 'all'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setReportFilter(f)}
                          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                            reportFilter === f ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {f === 'today' ? 'Hari Ini' : f === 'week' ? 'Minggu Ini' : f === 'month' ? 'Bulan' : 'Semua'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {reportLoading ? (
                    <div className="py-12 text-center text-sm text-slate-400">Memuat laporan...</div>
                  ) : salesReport ? (
                    <>
                      <div className="grid gap-4 mb-6 sm:grid-cols-3">
                        <div className="rounded-xl bg-sky-50 border border-sky-100 p-4">
                          <p className="text-[10px] font-semibold text-sky-600 uppercase tracking-wider">Total Pendapatan</p>
                          <p className="mt-1 text-2xl font-bold text-sky-900">Rp {salesReport.summary.totalRevenue.toLocaleString()}</p>
                        </div>
                        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                          <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Tiket Terjual</p>
                          <p className="mt-1 text-2xl font-bold text-emerald-900">{salesReport.summary.totalQuantity} Tiket</p>
                        </div>
                        <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Jumlah Transaksi</p>
                          <p className="mt-1 text-2xl font-bold text-amber-900">{salesReport.summary.totalTransactions}</p>
                        </div>
                      </div>

                      {salesReport.ticketTypeBreakdown && salesReport.ticketTypeBreakdown.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-100">
                                <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tipe Tiket</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Jumlah</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Pendapatan</th>
                              </tr>
                            </thead>
                            <tbody>
                              {salesReport.ticketTypeBreakdown.map((item: any, index: number) => (
                                <tr key={index} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                  <td className="py-2.5 px-3 text-slate-700">{item.ticketType}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-600">{item.quantity}</td>
                                  <td className="py-2.5 px-3 text-right font-medium text-slate-700">Rp {item.revenue.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {salesReport.transactions && salesReport.transactions.length > 0 && (
                        <div className="mt-6">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Detail Transaksi</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-100">
                                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tanggal</th>
                                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tiket</th>
                                  <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Kasir</th>
                                </tr>
                              </thead>
                              <tbody>
                                {salesReport.transactions.map((tx: any, index: number) => (
                                  <tr key={index} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                    <td className="py-2.5 px-3 text-xs text-slate-500 font-mono">{tx.transactionId?.slice(0, 12)}</td>
                                    <td className="py-2.5 px-3 text-slate-600">{new Date(tx.createdAt).toLocaleDateString('id-ID')}</td>
                                    <td className="py-2.5 px-3 text-slate-600">{tx.ticketType} x{tx.quantity}</td>
                                    <td className="py-2.5 px-3 text-right font-medium text-slate-700">Rp {tx.total.toLocaleString()}</td>
                                    <td className="py-2.5 px-3 text-slate-500">{tx.cashier || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-12 text-center text-sm text-slate-400">Pilih filter untuk melihat laporan.</div>
                  )}
                </div>
              </div>
            )}

            {view === 'printout' && (
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card max-w-lg">
                <h2 className="text-base font-semibold text-slate-900">Custom Print Out</h2>
                <p className="mt-1 text-sm text-slate-400">Sesuaikan tampilan struk pembayaran.</p>
                <div className="mt-5 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Nama Tempat</label>
                    <input type="text" value={printoutConfig.placeName}
                      onChange={(e) => setPrintoutConfig({ ...printoutConfig, placeName: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition-colors focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Alamat</label>
                    <input type="text" value={printoutConfig.address}
                      onChange={(e) => setPrintoutConfig({ ...printoutConfig, address: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition-colors focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Telepon</label>
                    <input type="text" value={printoutConfig.phone}
                      onChange={(e) => setPrintoutConfig({ ...printoutConfig, phone: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition-colors focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Teks Header</label>
                    <input type="text" value={printoutConfig.headerText}
                      onChange={(e) => setPrintoutConfig({ ...printoutConfig, headerText: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition-colors focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Footer 1</label>
                    <input type="text" value={printoutConfig.footerMessage1}
                      onChange={(e) => setPrintoutConfig({ ...printoutConfig, footerMessage1: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition-colors focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Footer 2</label>
                    <input type="text" value={printoutConfig.footerMessage2}
                      onChange={(e) => setPrintoutConfig({ ...printoutConfig, footerMessage2: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition-colors focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20" />
                  </div>
                </div>
                {printoutMessage ? (
                  <p className="mt-4 rounded-lg px-3 py-2 text-xs font-medium bg-green-50 text-green-600">{printoutMessage}</p>
                ) : null}
                <button onClick={savePrintoutConfig} disabled={printoutSaving}
                  className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-sky-700 hover:shadow-card-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60">
                  {printoutSaving ? 'Menyimpan...' : 'Simpan Pengaturan'}
                </button>
              </div>
            )}

            {view === 'transaksi' && (
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
                <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">Riwayat Transaksi</h2>
                    <p className="text-sm text-slate-400">Data transaksi penjualan tiket</p>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex bg-slate-100 p-0.5 rounded-lg">
                      {(['today', 'week', 'month', 'all'] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => { setTxFilter(f); fetchTransactions(f); }}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                            txFilter === f ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {f === 'today' ? 'Hari Ini' : f === 'week' ? 'Minggu' : f === 'month' ? 'Bulan' : 'Semua'}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => fetchTransactions(txFilter)} disabled={txLoading} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:border-slate-300 active:scale-[0.97]">
                      Refresh
                    </button>
                  </div>
                </div>

                {txLoading ? (
                  <div className="py-12 text-center text-sm text-slate-400">Memuat transaksi...</div>
                ) : transactions.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-400">Belum ada transaksi.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                          <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tanggal</th>
                          <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tiket</th>
                          <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                          <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Kasir</th>
                          <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((tx) => (
                          <tr key={tx.transactionId} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                            <td className="py-2.5 px-3 text-xs text-slate-500 font-mono">{tx.transactionId?.slice(0, 12)}</td>
                            <td className="py-2.5 px-3 text-slate-600">{new Date(tx.createdAt).toLocaleDateString('id-ID')} {new Date(tx.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="py-2.5 px-3 text-slate-600">{tx.ticketType} x{tx.quantity}</td>
                            <td className="py-2.5 px-3 text-right font-medium text-slate-700">Rp {tx.total.toLocaleString('id-ID')}</td>
                            <td className="py-2.5 px-3 text-slate-500">{tx.cashier || '-'}</td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                onClick={() => handlePrintTransaction(tx)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition-all hover:border-slate-300 active:scale-[0.97]"
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
    </div>
  )
}
