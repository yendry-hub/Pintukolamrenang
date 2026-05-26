export default async function handler(_req: any, res: any) {
  const results: Record<string, any> = { tests: [] }

  async function test(label: string, url: string) {
    const start = Date.now()
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })
      const elapsed = Date.now() - start
      results.tests.push({ label, status: resp.status, ok: resp.ok, elapsed })
    } catch (e: any) {
      results.tests.push({ label, error: e.message || String(e), elapsed: Date.now() - start })
    }
  }

  await test('Google', 'https://google.com')
  await test('Firestore REST', 'https://firestore.googleapis.com/v1/projects/kolamrenang-d5ffe/databases/(default)')
  await test('Firebase Auth', 'https://identitytoolkit.googleapis.com/v1')

  return res.status(200).json(results)
}
