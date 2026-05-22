# Skema Database Firebase

## Koleksi Firestore

### `rfidCards`
- `uid` (string) - Primary key UID kartu RFID
- `ownerName` (string)
- `ticketType` (string) - `Tiket Harian`, `Member`, `VIP`, `Paket Keluarga`, `Tiket Anak`, `Tiket Dewasa`
- `active` (boolean)
- `used` (boolean)
- `blocked` (boolean)
- `expiryDate` (timestamp)
- `validUntil` (timestamp)
- `lastUsedAt` (timestamp)
- `balance` (number)
- `packageInfo` (map)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

### `scanLogs`
- `uid` (string)
- `gateId` (string)
- `status` (string) - `VALID`, `INVALID`, `NOT_REGISTERED`, `OFFLINE`
- `ticketType` (string)
- `scannedAt` (timestamp)
- `cardData` (map)
- `createdAt` (timestamp)

### `transactions`
- `transactionId` (string)
- `uid` (string)
- `ticketType` (string)
- `price` (number)
- `cashier` (string)
- `paymentMethod` (string)
- `paymentStatus` (string)
- `createdAt` (timestamp)
- `receiptPrinted` (boolean)

### `users`
- `email` (string)
- `name` (string)
- `role` (string) - `SUPER_ADMIN`, `ADMIN`, `KASIR`, `OPERATOR_GATE`
- `createdAt` (timestamp)
- `lastLoginAt` (timestamp)

### `gateDevices`
- `gateId` (string)
- `name` (string)
- `status` (string) - `ONLINE`, `OFFLINE`
- `lastSeen` (timestamp)
- `ipAddress` (string)
- `firmwareVersion` (string)
- `errors` (array)

### `auditLogs`
- `userId` (string)
- `action` (string)
- `resource` (string)
- `details` (map)
- `createdAt` (timestamp)

## Realtime Database (opsional)

Jika ingin menggunakan Realtime Database untuk status gateway dan alarm offline:

```
/gateStatus/{gateId}
  online: true
  lastSeen: 2026-05-19T10:00:00Z
  currentUid: "04A6F02B88"
```

## Indeks Rekomendasi

- `scanLogs` berdasarkan `scannedAt`
- `transactions` berdasarkan `createdAt`
- `rfidCards` berdasarkan `expiryDate` dan `active`
