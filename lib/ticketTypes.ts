import type { TicketType } from '@/lib/types'

export const DEFAULT_TICKET_TYPES: TicketType[] = [
  'Tiket Harian',
  'Member',
  'VIP',
  'Paket Keluarga',
  'Tiket Anak',
  'Tiket Dewasa'
]

export function normalizeTicketType(value: unknown): string {
  const rawValue = String(value || '').trim()
  if (!rawValue) return 'Unknown'

  const normalizedDefault = DEFAULT_TICKET_TYPES.find(
    (ticketType) => ticketType.toLowerCase() === rawValue.toLowerCase()
  )

  return normalizedDefault || rawValue
}
