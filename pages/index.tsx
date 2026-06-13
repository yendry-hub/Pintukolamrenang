import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-sky-600">Waterpark Gate Access</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Dashboard Ticketing</h1>
            <p className="mt-2 text-sm text-slate-400">Sistem manajemen tiket dan akses gate.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/login" className="rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-sky-700 hover:shadow-card-hover active:scale-[0.97]">
              Login Admin
            </Link>
            <Link href="/kasir-login" className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-emerald-700 hover:shadow-card-hover active:scale-[0.97]">
              Login Kasir
            </Link>
            <Link href="/superadmin-login" className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-indigo-700 hover:shadow-card-hover active:scale-[0.97]">
              Super Admin
            </Link>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Selamat Datang</h2>
          <p className="mt-2 text-sm text-slate-400">
            Silakan login menggunakan akun yang tersedia untuk mengakses dashboard dan fitur manajemen.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-600">Admin</p>
              <p className="mt-1 text-sm text-sky-800">Monitoring gate, manajemen kartu, laporan penjualan &amp; pengunjung</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Kasir</p>
              <p className="mt-1 text-sm text-emerald-800">Transaksi tiket, kontrol gate, ringkasan harian</p>
            </div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600">Super Admin</p>
              <p className="mt-1 text-sm text-indigo-800">Edit dan hapus data transaksi &amp; scan log</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
