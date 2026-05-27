import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { getFirebaseIdToken, loginWithEmail, onFirebaseAuthStateChanged } from '@/lib/firebase'
import { cacheOfflineCredential, verifyOfflineCredential } from '@/lib/offlineClient'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('superadmin@waterpark.id')
  const [password, setPassword] = useState('password123')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = onFirebaseAuthStateChanged((user) => {
      if (user) {
        router.replace('/admin')
      }
    })
    return unsubscribe
  }, [router])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!navigator.onLine) {
        const verified = await verifyOfflineCredential(email, password, 'admin')
        if (!verified) {
          throw new Error('Login offline gagal. Login online sekali dulu di perangkat ini.')
        }
        router.push('/admin')
        return
      }

      await loginWithEmail(email, password)
      const token = await getFirebaseIdToken()
      const response = await fetch('/api/admin-dashboard', {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error('Akun ini belum memiliki akses admin.')
      }

      await cacheOfflineCredential(email, password, 'admin')
      router.push('/admin')
    } catch (err: any) {
      setError(err?.message || 'Gagal login. Periksa email dan password.')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-700 via-sky-600 to-cyan-600 px-4">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="rounded-2xl border border-white/10 bg-white/95 p-7 shadow-modal backdrop-blur-sm">
          <h1 className="text-2xl font-bold text-slate-900">Login Sistem</h1>
          <p className="mt-1.5 text-sm text-slate-500">Masuk untuk mengelola tiket, transaksi, dan monitoring gate.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</label>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@waterpark.id"
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
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
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-colors focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                required
              />
            </div>

            {error ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-sky-700 hover:shadow-card-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Memproses...' : 'Login'}
            </button>
          </form>

          <div className="mt-6 text-xs text-slate-400">
            Pastikan akun admin sudah dibuat di Firebase Authentication.
          </div>
          <div className="mt-3 text-xs">
            <Link href="/" className="font-medium text-sky-600 hover:text-sky-700">&larr; Kembali ke Beranda</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
