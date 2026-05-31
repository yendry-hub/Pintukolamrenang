import type { BluetoothPrinterPlugin } from './bluetoothPrinter'

export class BluetoothPrinterWeb implements BluetoothPrinterPlugin {
  async listDevices() {
    return { devices: [] }
  }

  async connect(_options: { address: string }) {
    console.warn('BluetoothPrinter is not available on web')
  }

  async disconnect() {
    console.warn('BluetoothPrinter is not available on web')
  }

  async printText(_options: { text: string }) {
    console.warn('BluetoothPrinter is not available on web')
  }

  async printEscPos(_options: { data: number[] }) {
    console.warn('BluetoothPrinter is not available on web')
  }

  async isConnected() {
    return { connected: false }
  }
}
