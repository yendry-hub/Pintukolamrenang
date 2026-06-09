import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { getFirebaseIdToken, logoutFirebase, onFirebaseAuthStateChanged } from '@/lib/firebase'

export default function SuperAdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authInitialized, setAuthInitialized] = useState(false)
  const [view, setView] = useState<'penjualan' | 'tiket'>('penjualan')

  // Sales report
  const [salesReport, setSalesReport] = useState<any>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportFilter, setReportFilter] = useState('today')
  const [reportStartDate, setReportStartDate] = useState('')
  const [reportEndDate, setReportEndDate] = useState('')

  // Visitor report
  const [visitorReport, setVisitorReport] = useState<any>(null)
  const [visitorLoading, setVisitorLoading] = useState(false)
  const [visitorFilter, setVisitorFilter] = useState('today')
  const [visitorStartDate, setVisitorStartDate] = useState('')
  const [visitorEndDate, setVisitorEndDate] = useState('')

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editFields, setEditFields] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const fetchSalesReport = async (filter = reportFilter, startDate?: string, endDate?: string) => {
    setReportLoading(true)
    try {
      const token = await getFirebaseIdToken()
      let url = `/api/sales-report?filter=${filter}`
      if (startDate && endDate) {
        url += `&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      }
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401) { await logoutFirebase(); router.replace('/superadmin-login'); return }
      const data = await res.json()
      if (res.ok) setSalesReport(data)
    } catch { showMessage('error', 'Gagal memuat laporan penjualan') }
    finally { setReportLoading(false) }
  }

  const fetchVisitorReport = async (filter = visitorFilter, startDate?: string, endDate?: string) => {
    setVisitorLoading(true)
    setError(null)
    try {
      const token = await getFirebaseIdToken()
      let url = `/api/laporan-pengunjung?filter=${filter}`
      if (startDate && endDate) {
        url += `&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
      }
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 401) { await logoutFirebase(); router.replace('/superadmin-login'); return }
      const data = await res.json()
      if (res.ok) setVisitorReport(data)
      else setError(data.error || 'Gagal memuat laporan pengunjung')
    } catch { setError('Gagal memuat laporan pengunjung') }
    finally { setVisitorLoading(false) }
  }

  useEffect(() => {
    if (view === 'penjualan') fetchSalesReport()
    else fetchVisitorReport()
  }, [view, reportFilter, visitorFilter])

  useEffect(() => {
    const unsubscribe = onFirebaseAuthStateChanged(async (user) => {
      setAuthInitialized(true)
      if (!user) { router.replace('/superadmin-login'); return }

      const checkRole = async () => {
        try {
          const token = await getFirebaseIdToken()
          const res = await fetch('/api/check-superadmin', {
            headers: { Authorization: `Bearer ${token}` }
          })
          if (!res.ok) {
            await logoutFirebase()
            router.replace('/login')
            return
          }
          const data = await res.json()
          setUserEmail(data.email || user.email || null)
          setLoading(false)
        } catch {
          await logoutFirebase()
          router.replace('/login')
        }
      }
      await checkRole()
    })
    return unsubscribe
  }, [router])

  const handleLogout = async () => {
    await logoutFirebase()
    router.replace('/superadmin-login')
  }

  const startEdit = (id: string, fields: Record<string, any>) => {
    setEditingId(id)
    setEditFields({ ...fields })
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditFields({})
  }

  const saveTransaction = async (id: string) => {
    setSaving(true)
    try {
      const token = await getFirebaseIdToken()
      const res = await fetch('/api/manage-transaction', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, fields: editFields })
      })
      const data = await res.json()
      if (res.ok) {
        showMessage('success', 'Transaksi berhasil diperbarui')
        cancelEdit()
        fetchSalesReport()
      } else {
        showMessage('error', data.error || 'Gagal menyimpan')
      }
    } catch { showMessage('error', 'Gagal terhubung ke server') }
    finally { setSaving(false) }
  }

  const deleteTransaction = async (id: string) => {
    if (!confirm('Hapus transaksi ini?')) return
    try {
      const token = await getFirebaseIdToken()
      const res = await fetch('/api/manage-transaction', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id })
      })
      if (res.ok) {
        showMessage('success', 'Transaksi berhasil dihapus')
        fetchSalesReport()
      } else {
        const data = await res.json()
        showMessage('error', data.error || 'Gagal menghapus')
      }
    } catch { showMessage('error', 'Gagal terhubung ke server') }
  }

  const saveScanLog = async (id: string) => {
    setSaving(true)
    try {
      const token = await getFirebaseIdToken()
      const res = await fetch('/api/manage-scanlog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, fields: editFields })
      })
      const data = await res.json()
      if (res.ok) {
        showMessage('success', 'Scan log berhasil diperbarui')
        cancelEdit()
        fetchVisitorReport()
      } else {
        showMessage('error', data.error || 'Gagal menyimpan')
      }
    } catch { showMessage('error', 'Gagal terhubung ke server') }
    finally { setSaving(false) }
  }

  const deleteScanLog = async (id: string) => {
    if (!confirm('Hapus scan log ini?')) return
    try {
      const token = await getFirebaseIdToken()
      const res = await fetch('/api/manage-scanlog', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id })
      })
      if (res.ok) {
        showMessage('success', 'Scan log berhasil dihapus')
        fetchVisitorReport()
      } else {
        const data = await res.json()
        showMessage('error', data.error || 'Gagal menghapus')
      }
    } catch { showMessage('error', 'Gagal terhubung ke server') }
  }

  if (!authInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white text-slate-900">
        <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-card">Memeriksa autentikasi...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-indigo-600">Super Admin Panel</span>
            <h1 className="mt-1.5 text-2xl font-bold text-slate-900">Manajemen Data</h1>
            {userEmail ? <p className="mt-1.5 text-sm text-slate-400">Masuk sebagai {userEmail}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleLogout} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-card transition-all hover:border-slate-300 hover:shadow-card-hover active:scale-[0.97]">
              Logout
            </button>
            <Link href="/" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-card transition-all hover:bg-slate-800 hover:shadow-card-hover active:scale-[0.97]">
              Beranda
            </Link>
          </div>
        </div>

        {message ? (
          <div className={`mb-6 rounded-xl border px-5 py-3 ${
            message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'
          }`}>
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-6 md:flex-row">
          <aside className="md:w-56 shrink-0">
            <nav className="rounded-2xl border border-slate-100 bg-white p-2 shadow-card">
              <button
                onClick={() => setView('penjualan')}
                className={`w-full text-left rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                  view === 'penjualan' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                Laporan Penjualan
              </button>
              <button
                onClick={() => setView('tiket')}
                className={`w-full text-left rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                  view === 'tiket' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                Laporan Tiket
              </button>
            </nav>
          </aside>

          <section className="flex-1 min-w-0 animate-fade-in">
            {error ? (
              <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800">
                <p className="text-sm font-medium">{error}</p>
              </div>
            ) : null}

            {view === 'penjualan' && (
              <div className="space-y-6 animate-fade-in">
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
                  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">Laporan Penjualan Tiket</h2>
                      <p className="text-sm text-slate-400">Ringkasan pendapatan dan volume tiket. Edit/hapus transaksi langsung dari tabel.</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex bg-slate-100 p-0.5 rounded-lg">
                        {(['today', 'week', 'month', 'all'] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => { setReportFilter(f); setReportStartDate(''); setReportEndDate('') }}
                            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                              reportFilter === f && !reportStartDate ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            {f === 'today' ? 'Hari Ini' : f === 'week' ? 'Minggu Ini' : f === 'month' ? 'Bulan' : 'Semua'}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input type="date" value={reportStartDate} onChange={(e) => setReportStartDate(e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                        <span className="text-slate-300 text-xs">—</span>
                        <input type="date" value={reportEndDate} onChange={(e) => setReportEndDate(e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                        <button
                          onClick={() => { if (reportStartDate && reportEndDate) fetchSalesReport('custom', reportStartDate, reportEndDate) }}
                          disabled={!reportStartDate || !reportEndDate}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-indigo-700 active:scale-[0.97] disabled:opacity-40"
                        >
                          Terapkan
                        </button>
                      </div>
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

                      {salesReport.details && salesReport.details.length > 0 && (
                        <div className="overflow-x-auto mb-6">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Rincian per Tipe Tiket</p>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-100">
                                <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tipe Tiket</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Jumlah</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Pendapatan</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Rata-rata</th>
                              </tr>
                            </thead>
                            <tbody>
                              {salesReport.details.map((item: any, index: number) => (
                                <tr key={index} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                  <td className="py-2.5 px-3 text-slate-700">{item.ticketType}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-600">{item.quantity}</td>
                                  <td className="py-2.5 px-3 text-right font-medium text-slate-700">Rp {item.totalRevenue.toLocaleString()}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-500">Rp {Math.round(item.avgPrice).toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {salesReport.transactions && salesReport.transactions.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Detail Transaksi</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-100">
                                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">ID</th>
                                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tanggal</th>
                                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Tiket</th>
                                  <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Qty</th>
                                  <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Harga</th>
                                  <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                                  <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Kasir</th>
                                  <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Aksi</th>
                                </tr>
                              </thead>
                              <tbody>
                                {salesReport.transactions.map((tx: any, index: number) => {
                                  const isEditing = editingId === tx.transactionId
                                  return (
                                    <tr key={tx.transactionId || index} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                      <td className="py-2.5 px-3 text-xs text-slate-500 font-mono">{tx.transactionId?.slice(0, 12)}</td>
                                      {isEditing ? (
                                        <>
                                          <td className="py-2.5 px-3 text-slate-600 text-xs">
                                            {new Date(tx.createdAt).toLocaleDateString('id-ID')}
                                          </td>
                                          <td className="py-2.5 px-3">
                                            <input
                                              type="text"
                                              value={editFields.ticketType || ''}
                                              onChange={(e) => setEditFields({ ...editFields, ticketType: e.target.value })}
                                              className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                                            />
                                          </td>
                                          <td className="py-2.5 px-3 text-right">
                                            <input
                                              type="number"
                                              min={1}
                                              value={editFields.quantity ?? 1}
                                              onChange={(e) => setEditFields({ ...editFields, quantity: Number(e.target.value) })}
                                              className="w-16 rounded border border-slate-200 px-2 py-1 text-xs text-right focus:border-indigo-500 focus:outline-none"
                                            />
                                          </td>
                                          <td className="py-2.5 px-3 text-right">
                                            <input
                                              type="number"
                                              min={0}
                                              value={editFields.price ?? 0}
                                              onChange={(e) => setEditFields({ ...editFields, price: Number(e.target.value) })}
                                              className="w-20 rounded border border-slate-200 px-2 py-1 text-xs text-right focus:border-indigo-500 focus:outline-none"
                                            />
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                                            Rp {((editFields.price ?? 0) * (editFields.quantity ?? 0)).toLocaleString()}
                                          </td>
                                          <td className="py-2.5 px-3">
                                            <input
                                              type="text"
                                              value={editFields.cashier || ''}
                                              onChange={(e) => setEditFields({ ...editFields, cashier: e.target.value })}
                                              className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                                            />
                                          </td>
                                          <td className="py-2.5 px-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                              <button
                                                onClick={() => saveTransaction(tx.transactionId)}
                                                disabled={saving}
                                                className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-all"
                                              >
                                                {saving ? '...' : 'Simpan'}
                                              </button>
                                              <button
                                                onClick={cancelEdit}
                                                className="rounded bg-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-300 transition-all"
                                              >
                                                Batal
                                              </button>
                                            </div>
                                          </td>
                                        </>
                                      ) : (
                                        <>
                                          <td className="py-2.5 px-3 text-slate-600 text-xs">
                                            {new Date(tx.createdAt).toLocaleDateString('id-ID')} {new Date(tx.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                          </td>
                                          <td className="py-2.5 px-3 text-slate-600">{tx.ticketType}</td>
                                          <td className="py-2.5 px-3 text-right text-slate-600">{tx.quantity}</td>
                                          <td className="py-2.5 px-3 text-right text-slate-600">Rp {tx.price.toLocaleString()}</td>
                                          <td className="py-2.5 px-3 text-right font-medium text-slate-700">Rp {tx.total.toLocaleString()}</td>
                                          <td className="py-2.5 px-3 text-slate-500">{tx.cashier || '-'}</td>
                                          <td className="py-2.5 px-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                              <button
                                                onClick={() => startEdit(tx.transactionId, { ticketType: tx.ticketType, quantity: tx.quantity, price: tx.price, cashier: tx.cashier })}
                                                className="rounded bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-indigo-700 transition-all"
                                              >
                                                Edit
                                              </button>
                                              <button
                                                onClick={() => deleteTransaction(tx.transactionId)}
                                                className="rounded bg-red-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-700 transition-all"
                                              >
                                                Hapus
                                              </button>
                                            </div>
                                          </td>
                                        </>
                                      )}
                                    </tr>
                                  )
                                })}
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

            {view === 'tiket' && (
              <div className="space-y-6 animate-fade-in">
                <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
                  <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">Laporan Tiket (Scan Log)</h2>
                      <p className="text-sm text-slate-400">Data scan kartu per tiket. Edit/hapus scan langsung dari tabel.</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex bg-slate-100 p-0.5 rounded-lg">
                        {(['today', 'week', 'month', 'all'] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => { setVisitorFilter(f); setVisitorStartDate(''); setVisitorEndDate('') }}
                            className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                              visitorFilter === f && !visitorStartDate ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            {f === 'today' ? 'Hari Ini' : f === 'week' ? 'Minggu Ini' : f === 'month' ? 'Bulan' : 'Semua'}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input type="date" value={visitorStartDate} onChange={(e) => setVisitorStartDate(e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                        <span className="text-slate-300 text-xs">—</span>
                        <input type="date" value={visitorEndDate} onChange={(e) => setVisitorEndDate(e.target.value)}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                        <button
                          onClick={() => { if (visitorStartDate && visitorEndDate) fetchVisitorReport('custom', visitorStartDate, visitorEndDate) }}
                          disabled={!visitorStartDate || !visitorEndDate}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-indigo-700 active:scale-[0.97] disabled:opacity-40"
                        >
                          Terapkan
                        </button>
                      </div>
                    </div>
                  </div>

                  {visitorLoading ? (
                    <div className="py-12 text-center text-sm text-slate-400">Memuat laporan...</div>
                  ) : visitorReport ? (
                    <>
                      <div className="grid gap-4 mb-6 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl bg-sky-50 border border-sky-100 p-4">
                          <p className="text-[10px] font-semibold text-sky-600 uppercase tracking-wider">Total Pengunjung</p>
                          <p className="mt-1 text-2xl font-bold text-sky-900">{visitorReport.summary.totalVisitors}</p>
                        </div>
                        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
                          <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Jenis Tiket</p>
                          <p className="mt-1 text-2xl font-bold text-emerald-900">{visitorReport.breakdown.length}</p>
                        </div>
                        <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4">
                          <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider">Periode</p>
                          <p className="mt-1 text-lg font-bold text-indigo-900">{new Date(visitorReport.startDate).toLocaleDateString('id-ID')} — {new Date(visitorReport.endDate).toLocaleDateString('id-ID')}</p>
                        </div>
                        <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
                          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Total Pendapatan</p>
                          <p className="mt-1 text-2xl font-bold text-amber-900">Rp {(visitorReport.summary.grandTotal || 0).toLocaleString('id-ID')}</p>
                        </div>
                      </div>

                      {visitorReport.breakdown.length > 0 && (
                        <div className="overflow-x-auto mb-6">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Ringkasan per Jenis Tiket</p>
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-100">
                                <th className="text-left py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Jenis Tiket</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Jumlah</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Harga Tiket</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Total</th>
                                <th className="text-right py-2.5 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Persentase</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visitorReport.breakdown.map((item: any, index: number) => (
                                <tr key={index} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                  <td className="py-2.5 px-3 text-slate-700 font-medium">{item.ticketType}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-600">{item.count}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-600">Rp {item.price.toLocaleString('id-ID')}</td>
                                  <td className="py-2.5 px-3 text-right font-medium text-slate-700">Rp {item.totalRevenue.toLocaleString('id-ID')}</td>
                                  <td className="py-2.5 px-3 text-right text-slate-600">
                                    <span className="inline-flex items-center gap-1.5">
                                      <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${item.percentage}%` }} />
                                      </div>
                                      {item.percentage}%
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-slate-200 bg-slate-50/50">
                                <td className="py-3 px-3 text-sm font-semibold text-slate-800">Total</td>
                                <td className="py-3 px-3 text-right text-sm font-semibold text-slate-800">{visitorReport.summary.totalVisitors}</td>
                                <td className="py-3 px-3 text-right text-sm text-slate-500">—</td>
                                <td className="py-3 px-3 text-right text-sm font-bold text-sky-700">Rp {(visitorReport.summary.grandTotal || 0).toLocaleString('id-ID')}</td>
                                <td className="py-3 px-3"></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      )}

                      {visitorReport.breakdown.map((item: any, index: number) => (
                        <div key={index} className="mt-6">
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{item.ticketType} — {item.count} scan</h3>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-100">
                                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">UID</th>
                                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Gate</th>
                                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Waktu</th>
                                  <th className="text-left py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                                  <th className="text-right py-2 px-3 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Aksi</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.items.slice(0, 50).map((scan: any, si: number) => {
                                  const isEditing = editingId === scan.id
                                  return (
                                    <tr key={scan.id || si} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                      {isEditing ? (
                                        <>
                                          <td className="py-2 px-3">
                                            <input
                                              type="text"
                                              value={editFields.uid || ''}
                                              onChange={(e) => setEditFields({ ...editFields, uid: e.target.value })}
                                              className="w-full rounded border border-slate-200 px-2 py-1 text-xs font-mono focus:border-indigo-500 focus:outline-none"
                                            />
                                          </td>
                                          <td className="py-2 px-3">
                                            <input
                                              type="text"
                                              value={editFields.gate || ''}
                                              onChange={(e) => setEditFields({ ...editFields, gate: e.target.value })}
                                              className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                                            />
                                          </td>
                                          <td className="py-2 px-3 text-xs text-slate-500">
                                            {scan.createdAt?._seconds
                                              ? new Date(scan.createdAt._seconds * 1000).toLocaleString('id-ID')
                                              : scan.scannedAt || '-'}
                                          </td>
                                          <td className="py-2 px-3">
                                            <select
                                              value={editFields.status || ''}
                                              onChange={(e) => setEditFields({ ...editFields, status: e.target.value })}
                                              className="rounded border border-slate-200 px-2 py-1 text-xs focus:border-indigo-500 focus:outline-none"
                                            >
                                              <option value="OPEN">OPEN</option>
                                              <option value="VALID">VALID</option>
                                              <option value="INVALID">INVALID</option>
                                              <option value="REJECTED">REJECTED</option>
                                            </select>
                                          </td>
                                          <td className="py-2 px-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                              <button onClick={() => saveScanLog(scan.id)} disabled={saving}
                                                className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-all">
                                                {saving ? '...' : 'Simpan'}
                                              </button>
                                              <button onClick={cancelEdit}
                                                className="rounded bg-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-300 transition-all">
                                                Batal
                                              </button>
                                            </div>
                                          </td>
                                        </>
                                      ) : (
                                        <>
                                          <td className="py-2 px-3 text-xs text-slate-600 font-mono">{scan.uid}</td>
                                          <td className="py-2 px-3 text-xs text-slate-600">{scan.gate || scan.gateId || '-'}</td>
                                          <td className="py-2 px-3 text-xs text-slate-500">
                                            {scan.createdAt?._seconds
                                              ? new Date(scan.createdAt._seconds * 1000).toLocaleString('id-ID')
                                              : scan.scannedAt || '-'}
                                          </td>
                                          <td className="py-2 px-3 text-xs">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                                              scan.status === 'VALID' || scan.status === 'OPEN' ? 'bg-emerald-50 text-emerald-700' :
                                              scan.status === 'INVALID' ? 'bg-red-50 text-red-700' :
                                              'bg-slate-50 text-slate-500'
                                            }`}>
                                              {scan.status}
                                            </span>
                                          </td>
                                          <td className="py-2 px-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                              <button
                                                onClick={() => startEdit(scan.id, { uid: scan.uid, gate: scan.gate || scan.gateId || '', status: scan.status })}
                                                className="rounded bg-indigo-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-indigo-700 transition-all"
                                              >
                                                Edit
                                              </button>
                                              <button
                                                onClick={() => deleteScanLog(scan.id)}
                                                className="rounded bg-red-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-700 transition-all"
                                              >
                                                Hapus
                                              </button>
                                            </div>
                                          </td>
                                        </>
                                      )}
                                    </tr>
                                  )
                                })}
                                {item.items.length > 50 && (
                                  <tr>
                                    <td colSpan={5} className="py-3 px-3 text-xs text-slate-400 text-center italic">
                                      ... dan {item.items.length - 50} scan lainnya
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="py-12 text-center text-sm text-slate-400">Pilih filter untuk melihat laporan.</div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
