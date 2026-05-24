import type { PrintoutConfig } from '@/lib/types'

export interface ReceiptData {
  transactionId: string
  dateTime: Date
  ticketType: string
  price: number
  quantity: number
  total: number
  cardUid: string
  cashierName: string
  paymentMethod: string
}

const DEFAULTS: PrintoutConfig = {
  placeName: 'KOLAM RENANG',
  address: '',
  phone: '',
  headerText: '',
  footerMessage1: 'Terima Kasih',
  footerMessage2: 'Selamat Bersenang-senang'
}

export function generateReceipt(data: ReceiptData, config?: PrintoutConfig): string {
  const { transactionId, dateTime, ticketType, price, quantity, total, cardUid, cashierName, paymentMethod } = data
  const cfg = config || DEFAULTS

  const dateStr = dateTime.toLocaleDateString('id-ID', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  })
  const timeStr = dateTime.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  })

  const W = 32
  const sep = '='.repeat(W)

  const lines: string[] = [
    center(cfg.placeName, W),
    sep,
  ]

  if (cfg.address) {
    cfg.address.split('\n').forEach((l) => lines.push(center(l.trim(), W)))
  }
  if (cfg.phone) {
    lines.push(center(`Telp: ${cfg.phone}`, W))
  }

  lines.push(
    '',
    'BUKTI PEMBAYARAN TIKET',
    sep,
    '',
    formatReceiptLine('ID', transactionId, W),
    formatReceiptLine('Tanggal', dateStr, W),
    formatReceiptLine('Jam', timeStr, W),
  )

  if (cfg.headerText) {
    lines.push('', cfg.headerText, '')
  }

  lines.push(
    '',
    sep,
    '',
    formatReceiptLine('Tiket', ticketType, W),
    formatReceiptLine('Harga', formatCurrency(price), W),
    formatReceiptLine('Jumlah', `${quantity}`, W),
    formatReceiptLine('Total', formatCurrency(total), W),
    formatReceiptLine('Bayar', paymentMethod, W),
    formatReceiptLine('UID', cardUid, W),
    '',
    sep,
    '',
    formatReceiptLine('Petugas', cashierName, W),
    '',
    sep,
    center(cfg.footerMessage1, W),
    center(cfg.footerMessage2, W),
    sep,
    ''
  )

  return lines.join('\n')
}

export function center(text: string, width: number): string {
  const padding = Math.max(0, Math.floor((width - text.length) / 2))
  return ' '.repeat(padding) + text
}

export function formatReceiptLine(label: string, value: string, width: number): string {
  const labelText = `${label}: `
  const available = width - labelText.length
  const wrappedLines = wrapText(value, available)
  return [
    `${labelText}${wrappedLines[0]}`,
    ...wrappedLines.slice(1).map((l) => ' '.repeat(labelText.length) + l)
  ].join('\n')
}

export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text]
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (!cur) { cur = w }
    else if ((cur + ' ' + w).length <= width) { cur += ' ' + w }
    else { lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 0
  }).format(amount)
}
