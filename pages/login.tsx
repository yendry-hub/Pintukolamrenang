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
    <main className="min-h-screen bg-gradient-to-br from-sky-700 to-cyan-600 text-white">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <div className="rounded-3xl bg-white p-8 shadow-soft text-slate-900">
          <h1 className="mb-2 text-3xl font-semibold">Login Sistem</h1>
          <p className="mb-4 text-slate-600">Masuk untuk mengelola tiket, transaksi, dan monitoring gate.</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@waterpark.id"
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 focus:border-sky-500 focus:outline-none"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="mt-2 w-full rounded-2xl border border-slate-300 px-4 py-3 focus:border-sky-500 focus:outline-none"
                required
              />
            </label>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-sky-600 px-4 py-3 text-white shadow-soft hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Memproses...' : 'Login'}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-500">
            Pastikan akun admin sudah dibuat di Firebase Authentication.
          </p>
          <div className="mt-6 text-sm text-slate-500">
            <Link href="/" className="text-sky-600 hover:underline">Kembali ke Beranda</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
