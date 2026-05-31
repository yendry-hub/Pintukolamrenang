import { useState } from 'react'
import { isNativePlatform } from '@/lib/capacitor'

interface Props {
  btConnected: boolean
  btDeviceName: string | null
  btDevices: { name: string; address: string }[]
  btScanning: boolean
  onDevicesChange: (devices: { name: string; address: string }[]) => void
  onConnectedChange: (connected: boolean, address: string | null, name: string | null) => void
  onScanningChange: (scanning: boolean) => void
}

export default function BluetoothPrinterPanel({
  btConnected,
  btDeviceName,
  btDevices,
  btScanning,
  onDevicesChange,
  onConnectedChange,
  onScanningChange,
}: Props) {
  const [showPanel, setShowPanel] = useState(false)

  if (!isNativePlatform()) return null

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="flex w-full items-center justify-between text-sm font-semibold text-slate-700"
      >
        <span className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${btConnected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          Bluetooth Printer
        </span>
        <svg className={`h-4 w-4 transition-transform ${showPanel ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showPanel && (
        <div className="mt-4 space-y-3">
          {btConnected ? (
            <div className="text-xs text-slate-500">
              Terhubung ke: <span className="font-medium text-slate-700">{btDeviceName || 'Printer'}</span>
            </div>
          ) : (
            <p className="text-xs text-slate-400">Bluetooth printer tidak terhubung</p>
          )}

          {!btConnected && (
            <button
              onClick={async () => {
                onScanningChange(true)
                try {
                  const BluetoothPrinter = (await import('@/lib/bluetoothPrinter')).default
                  const result = await BluetoothPrinter.listDevices()
                  onDevicesChange(result.devices)
                  if (result.devices.length === 0) {
                    alert('Tidak ada perangkat Bluetooth yang ter-pair. Pairing dulu di Settings -> Bluetooth.')
                  }
                } catch (err: any) {
                  alert('Gagal memindai: ' + (err?.message || ''))
                } finally {
                  onScanningChange(false)
                }
              }}
              disabled={btScanning}
              className="w-full rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white transition-all hover:bg-slate-700 active:scale-[0.97] disabled:opacity-50"
            >
              {btScanning ? 'Memindai...' : 'Cari Printer Bluetooth'}
            </button>
          )}

          {btDevices.length > 0 && !btConnected && (
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {btDevices.map((d) => (
                <button
                  key={d.address}
                  onClick={async () => {
                    try {
                      const BluetoothPrinter = (await import('@/lib/bluetoothPrinter')).default
                      await BluetoothPrinter.connect({ address: d.address })
                      onConnectedChange(true, d.address, d.name)
                      onDevicesChange([])
                    } catch (err: any) {
                      alert('Gagal konek: ' + (err?.message || ''))
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700 transition-colors hover:border-sky-300"
                >
                  {d.name || 'Unknown'} <span className="ml-1 text-slate-400">{d.address}</span>
                </button>
              ))}
            </div>
          )}

          {btConnected && (
            <button
              onClick={async () => {
                try {
                  const BluetoothPrinter = (await import('@/lib/bluetoothPrinter')).default
                  await BluetoothPrinter.disconnect()
                  onConnectedChange(false, null, null)
                } catch { /* ignore */ }
              }}
              className="w-full rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition-all hover:bg-red-50 active:scale-[0.97]"
            >
              Putuskan Koneksi
            </button>
          )}
        </div>
      )}
    </div>
  )
}
