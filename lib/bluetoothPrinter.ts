import { registerPlugin } from '@capacitor/core'

export interface BluetoothPrinterPlugin {
  listDevices(): Promise<{ devices: { name: string; address: string }[] }>
  connect(options: { address: string }): Promise<void>
  disconnect(): Promise<void>
  printText(options: { text: string }): Promise<void>
  printEscPos(options: { data: number[] }): Promise<void>
  isConnected(): Promise<{ connected: boolean }>
}

const BluetoothPrinter = registerPlugin<BluetoothPrinterPlugin>('BluetoothPrinter', {
  web: () => import('./web').then((m) => new m.BluetoothPrinterWeb()),
})

export default BluetoothPrinter
