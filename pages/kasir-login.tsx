import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/router'
import { getFirebaseIdToken, loginWithEmail } from '@/lib/firebase'
import { cacheOfflineCredential, verifyOfflineCredential } from '@/lib/offlineClient'

export default function KasirLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!navigator.onLine) {
        const verified = await verifyOfflineCredential(email, password, 'kasir')
        if (!verified) {
          throw new Error('Login offline gagal. Login online sekali dulu di perangkat ini.')
        }
        router.push('/kasir')
        return
      }

      await loginWithEmail(email, password)
      const token = await getFirebaseIdToken()
      const response = await fetch('/api/kasir-dashboard', {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error('Akun ini belum memiliki akses kasir.')
      }

      await cacheOfflineCredential(email, password, 'kasir')
      router.push('/kasir')
    } catch (err: any) {
      setError(err?.message || 'Gagal login. Periksa email dan password.')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-sky-900 px-4">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="rounded-2xl border border-white/10 bg-white/95 p-7 shadow-modal backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-slate-900">Login Kasir</h1>
          <p className="mt-1.5 text-sm text-slate-500">Masuk sebagai kasir untuk membuka dashboard kasir.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="kasir@waterpark.id"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Password</label>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                required
              />
            </div>

            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-emerald-700 hover:shadow-card-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Memproses...' : 'Login Kasir'}
            </button>
          </form>

          <div className="mt-6 text-xs">
            <Link href="/" className="font-medium text-emerald-600 hover:text-emerald-700">&larr; Kembali ke Beranda</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
