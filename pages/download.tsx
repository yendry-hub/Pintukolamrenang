const REPO = 'yendry-hub/Pintukolamrenang'
const APK_URL = `https://github.com/${REPO}/releases/latest/download/KolamRenang-debug.apk`

export default function DownloadPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-white p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100">
          <svg className="h-7 w-7 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-slate-900">Download Aplikasi Android</h1>
        <p className="mt-1 text-sm text-slate-400">Aplikasi kasir untuk printer thermal Bluetooth</p>
        <a
          href={APK_URL}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-3 text-sm font-medium text-white shadow-card transition-all hover:bg-sky-700 hover:shadow-card-hover active:scale-[0.97]"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Download APK
        </a>
        <p className="mt-4 text-xs text-slate-400">
          Version terbaru otomatis dari GitHub Actions.
          <br />
          Install APK di HP Android dan buka menu Bluetooth Printer untuk konek ke printer thermal.
        </p>
      </div>
    </div>
  )
}
