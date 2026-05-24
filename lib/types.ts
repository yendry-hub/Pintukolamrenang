export type TicketType = 'Tiket Harian' | 'Member' | 'VIP' | 'Paket Keluarga' | 'Tiket Anak' | 'Tiket Dewasa'

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'KASIR' | 'OPERATOR_GATE'

export type GateStatus = {
  online: boolean
  lastSeen: string | null
  currentGate: string
  connectedGates?: string[]
  connectedGateNames?: string[]
  gates?: Array<{
    gateId: string
    name: string
    online: boolean
    lastSeen: string | null
  }>
}

export type ScanLog = {
  uid: string
  ticketType: TicketType
  gate: string
  status: 'VALID' | 'INVALID' | 'NOT_REGISTERED' | 'OFFLINE' | 'EXPIRED'
  scannedAt: string
  scannedDate?: string
}

export type TicketStats = {
  totalVisitorsToday: number
  hourlyTrend: number[]
  dailyTrend: number[]
  activeMembers: number
}

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'

export type Transaction = {
  transactionId: string
  uid: string
  ticketType: TicketType
  price: number
  quantity: number
  total: number
  cashier: string
  paymentMethod: string
  paymentStatus: PaymentStatus
  createdAt: string
  receiptPrinted: boolean
}

export type PrintoutConfig = {
  placeName: string
  address: string
  phone: string
  headerText: string
  footerMessage1: string
  footerMessage2: string
}
