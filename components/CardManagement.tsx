import React, { useEffect, useState } from 'react'
import { getFirebaseIdToken } from '@/lib/firebase'

const DEFAULT_TICKET_TYPES: string[] = ['Tiket Harian', 'Member', 'VIP', 'Paket Keluarga', 'Tiket Anak', 'Tiket Dewasa']

type CardData = {
  uid: string
  ticketType: string
  active: boolean
  blocked: boolean
  used: boolean
  qtyAkses?: number
  expiryDate?: string
  createdAt?: string
  updatedAt?: string
  lastUsedAt?: string
}

type Tab = 'list' | 'register'

type Props = {
  ticketTypes?: string[]
}

export default function CardManagement({ ticketTypes: propTicketTypes }: Props) {
  const ticketTypes = propTicketTypes && propTicketTypes.length > 0 ? propTicketTypes : DEFAULT_TICKET_TYPES
  const [tab, setTab] = useState<Tab>('list')
  const [cards, setCards] = useState<CardData[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [unregisteredScans, setUnregisteredScans] = useState<{ uid: string; gateId: string; scannedAt: string | null; seenCount: number }[]>([])

  // Form state for register/edit
  const [formUid, setFormUid] = useState('')
  const [formTicketType, setFormTicketType] = useState<string>('Member')
  const [formQtyAkses, setFormQtyAkses] = useState('')
  const [formActive, setFormActive] = useState(true)
  const [formBlocked, setFormBlocked] = useState(false)
  const [formExpiryDate, setFormExpiryDate] = useState('')
  const [saving, setSaving] = useState(false)

  // Edit state
  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [editTicketType, setEditTicketType] = useState<string>('Member')
  const [editQtyAkses, setEditQtyAkses] = useState('')
  const [editActive, setEditActive] = useState(true)
  const [editBlocked, setEditBlocked] = useState(false)
  const [editExpiryDate, setEditExpiryDate] = useState('')

  const showMessage = (msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(null), 4000)
  }

  const fetchCards = async () => {
    setLoading(true)
    try {
      const token = await getFirebaseIdToken()
      const res = await fetch('/api/get-cards', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Gagal memuat data kartu')
      const data = await res.json()
      setCards(data.cards)
    } catch (err: any) {
      showMessage(err?.message || 'Gagal memuat data kartu', 'error')
    } finally {
      setLoading(false)
    }
  }

  const fetchUnregisteredScans = async () => {
    try {
      const token = await getFirebaseIdToken()
      const res = await fetch('/api/get-unregistered-scans', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setUnregisteredScans(data.scans || [])
      }
    } catch {
      // silent
    }
  }

  useEffect(() => {
    fetchCards()
    fetchUnregisteredScans()
  }, [])

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formUid.trim()) {
      showMessage('UID kartu harus diisi', 'error')
      return
    }
    setSaving(true)
    try {
      const token = await getFirebaseIdToken()
      const body: any = {
        uid: formUid.trim(),
        ticketType: formTicketType,
        active: formActive,
        blocked: formBlocked,
      }
      if (formQtyAkses) {
        body.qtyAkses = parseInt(formQtyAkses, 10) || 0
      }
      if (formExpiryDate) {
        body.expiryDate = formExpiryDate
      }
      const res = await fetch('/api/manage-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal mendaftarkan kartu')
      showMessage(`Kartu ${formUid.trim()} berhasil didaftarkan!`)
      setFormUid('')
      setFormTicketType('Member')
      setFormQtyAkses('')
      setFormActive(true)
      setFormBlocked(false)
      setFormExpiryDate('')
      fetchCards()
      setTab('list')
    } catch (err: any) {
      showMessage(err?.message || 'Gagal mendaftarkan kartu', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!editingUid) return
    setSaving(true)
    try {
      const token = await getFirebaseIdToken()
      const body: any = {
        uid: editingUid,
        ticketType: editTicketType,
        active: editActive,
        blocked: editBlocked,
      }
      if (editQtyAkses) {
        body.qtyAkses = parseInt(editQtyAkses, 10) || 0
      }
      if (editExpiryDate) {
        body.expiryDate = editExpiryDate
      }
      const res = await fetch('/api/manage-card', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal mengupdate kartu')
      showMessage(`Kartu ${editingUid} berhasil diupdate!`)
      setEditingUid(null)
      fetchCards()
    } catch (err: any) {
      showMessage(err?.message || 'Gagal mengupdate kartu', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (uid: string) => {
    if (!window.confirm(`Yakin ingin menghapus kartu ${uid}?`)) return
    try {
      const token = await getFirebaseIdToken()
      const res = await fetch('/api/manage-card', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ uid, action: 'delete' })
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Gagal menghapus kartu')
      }
      showMessage(`Kartu ${uid} berhasil dihapus!`)
      fetchCards()
    } catch (err: any) {
      showMessage(err?.message || 'Gagal menghapus kartu', 'error')
    }
  }

  const startEdit = (card: CardData) => {
    setEditingUid(card.uid)
    setEditTicketType(card.ticketType)
    setEditQtyAkses(card.qtyAkses != null ? String(card.qtyAkses) : '')
    setEditActive(card.active)
    setEditBlocked(card.blocked)
    setEditExpiryDate(card.expiryDate?.split('T')[0] || '')
  }

  const cancelEdit = () => {
    setEditingUid(null)
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('id-ID', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className={`rounded-3xl p-4 text-sm shadow-soft ${
          messageType === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
        }`}>
          {message}
        </div>
      )}

      {/* Tab buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => setTab('list')}
          className={`rounded-2xl px-5 py-2.5 text-sm font-medium transition ${
            tab === 'list' ? 'bg-sky-600 text-white shadow-soft' : 'bg-white text-slate-700 shadow-soft hover:bg-slate-50'
          }`}
        >
          Daftar Kartu
        </button>
        <button
          onClick={() => setTab('register')}
          className={`rounded-2xl px-5 py-2.5 text-sm font-medium transition ${
            tab === 'register' ? 'bg-sky-600 text-white shadow-soft' : 'bg-white text-slate-700 shadow-soft hover:bg-slate-50'
          }`}
        >
          Daftarkan Kartu Baru
        </button>
      </div>

      {/* Kartu terdeteksi (belum terdaftar) */}
      {unregisteredScans.length > 0 && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-amber-900">Kartu Terdeteksi (Belum Terdaftar)</h3>
              <p className="text-xs text-amber-700">Scan kartu berikut muncul di sistem tapi belum punya data anggota. Klik "Daftarkan" untuk isi UID otomatis.</p>
            </div>
            <button onClick={fetchUnregisteredScans} className="rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700">Refresh</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {unregisteredScans.map((s) => (
              <button
                key={s.uid}
                onClick={() => { setFormUid(s.uid); setTab('register') }}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-xs font-mono font-medium text-amber-900 shadow-sm border border-amber-200 hover:bg-amber-100 transition-colors"
              >
                {s.uid}
                <span className="text-[10px] text-amber-500">{s.seenCount}x</span>
                <span className="rounded-md bg-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">Daftarkan</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab: List Cards */}
      {tab === 'list' && (
        <div className="rounded-3xl bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Daftar Kartu RFID</h2>
              <p className="text-sm text-slate-500">Total {cards.length} kartu terdaftar</p>
            </div>
            <button
              onClick={fetchCards}
              disabled={loading}
              className="rounded-2xl bg-sky-600 px-4 py-2 text-sm text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {loading ? 'Memuat...' : 'Refresh'}
            </button>
          </div>

          {loading && cards.length === 0 ? (
            <div className="py-12 text-center text-slate-500">Memuat data kartu...</div>
          ) : cards.length === 0 ? (
            <div className="py-12 text-center text-slate-500">Belum ada kartu terdaftar.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500">
                    <th className="pb-3 font-medium">UID</th>
                    <th className="pb-3 font-medium">Jenis</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Sisa Akses</th>
                    <th className="pb-3 font-medium">Expired</th>
                    <th className="pb-3 font-medium">Terdaftar</th>
                    <th className="pb-3 font-medium text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {cards.map((card) => (
                    <tr key={card.uid}>
                      {editingUid === card.uid ? (
                        <>
                          <td className="py-3 font-mono text-xs">{card.uid}</td>
                          <td className="py-3">
                            <select
                              value={editTicketType}
                              onChange={(e) => setEditTicketType(e.target.value)}
                              className="rounded-xl border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                            >
                              {ticketTypes.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <label className="flex items-center gap-1 text-xs">
                                <input
                                  type="checkbox"
                                  checked={editActive}
                                  onChange={(e) => setEditActive(e.target.checked)}
                                /> Aktif
                              </label>
                              <label className="flex items-center gap-1 text-xs">
                                <input
                                  type="checkbox"
                                  checked={editBlocked}
                                  onChange={(e) => setEditBlocked(e.target.checked)}
                                /> Blokir
                              </label>
                            </div>
                          </td>
                          <td className="py-3">
                            <input
                              type="number"
                              min={0}
                              value={editQtyAkses}
                              onChange={(e) => setEditQtyAkses(e.target.value)}
                              className="w-20 rounded-xl border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                              placeholder="Unlimited"
                            />
                          </td>
                          <td className="py-3">
                            <input
                              type="date"
                              value={editExpiryDate}
                              onChange={(e) => setEditExpiryDate(e.target.value)}
                              className="rounded-xl border border-slate-200 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                          </td>
                          <td className="py-3 text-xs text-slate-500">{formatDate(card.createdAt)}</td>
                          <td className="py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={handleEdit}
                                disabled={saving}
                                className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {saving ? 'Menyimpan...' : 'Simpan'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="rounded-xl bg-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-300"
                              >
                                Batal
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-3 font-mono text-xs font-medium">{card.uid}</td>
                          <td className="py-3">
                            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              card.ticketType === 'Member' ? 'bg-blue-100 text-blue-800' :
                              card.ticketType === 'VIP' ? 'bg-purple-100 text-purple-800' :
                              card.ticketType === 'Paket Keluarga' ? 'bg-amber-100 text-amber-800' :
                              'bg-slate-100 text-slate-800'
                            }`}>
                              {card.ticketType}
                            </span>
                          </td>
                          <td className="py-3">
                            {card.blocked ? (
                              <span className="text-xs font-medium text-red-600">Diblokir</span>
                            ) : card.active ? (
                              <span className="text-xs font-medium text-emerald-600">Aktif</span>
                            ) : (
                              <span className="text-xs font-medium text-slate-400">Nonaktif</span>
                            )}
                          </td>
                          <td className="py-3">
                            <span className="text-xs font-medium">{card.qtyAkses != null ? card.qtyAkses : '∞'}</span>
                          </td>
                          <td className="py-3 text-xs text-slate-500">{card.expiryDate ? formatDate(card.expiryDate) : '-'}</td>
                          <td className="py-3 text-xs text-slate-500">{formatDate(card.createdAt)}</td>
                          <td className="py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => startEdit(card)}
                                className="rounded-xl bg-sky-100 px-3 py-1.5 text-xs text-sky-700 hover:bg-sky-200"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(card.uid)}
                                className="rounded-xl bg-red-100 px-3 py-1.5 text-xs text-red-700 hover:bg-red-200"
                              >
                                Hapus
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Register New Card */}
      {tab === 'register' && (
        <div className="rounded-3xl bg-white p-6 shadow-soft max-w-lg">
          <h2 className="text-lg font-semibold">Daftarkan Kartu Baru</h2>
          <p className="mt-1 text-sm text-slate-500">Masukkan UID kartu RFID dan pilih jenis keanggotaan.</p>
          <form onSubmit={handleRegister} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">UID Kartu</span>
              <input
                type="text"
                value={formUid}
                onChange={(e) => setFormUid(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-slate-300 px-4 py-3 font-mono text-sm focus:border-sky-500 focus:outline-none"
                placeholder="Masukkan UID kartu RFID"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Jenis Keanggotaan</span>
              <select
                value={formTicketType}
                onChange={(e) => setFormTicketType(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm focus:border-sky-500 focus:outline-none"
              >
                {ticketTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Jumlah Akses <span className="text-slate-400">(opsional, kosongi jika tidak terbatas)</span></span>
              <input
                type="number"
                min={0}
                value={formQtyAkses}
                onChange={(e) => setFormQtyAkses(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm focus:border-sky-500 focus:outline-none"
                placeholder="Contoh: 50"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Tanggal Kadaluarsa <span className="text-slate-400">(opsional)</span></span>
              <input
                type="date"
                value={formExpiryDate}
                onChange={(e) => setFormExpiryDate(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm focus:border-sky-500 focus:outline-none"
              />
            </label>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="rounded"
                />
                Aktif
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={formBlocked}
                  onChange={(e) => setFormBlocked(e.target.checked)}
                  className="rounded"
                />
                Blokir
              </label>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-white shadow-soft hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Menyimpan...' : 'Daftarkan Kartu'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
