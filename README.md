# Kolam Renang Ticketing System

Sistem ticketing kolam renang modern berbasis web dengan RFID, tripod gate otomatis, Firebase, dan kemampuan offline PWA.

## Fitur Utama

- Aplikasi web modern responsive dengan React / Next.js + TailwindCSS
- Backend & database menggunakan Firebase Firestore dan Firebase Authentication
- Offline-first dengan IndexedDB dan service worker PWA
- Sinkronisasi otomatis saat koneksi internet kembali
- Endpoint HTTP untuk menerima UID RFID dari ESP8266
- Dashboard admin realtime, riwayat scan, dan status gate
- Role management: Super Admin, Admin, Kasir, Operator Gate
- Cetak struk thermal dengan data transaksi rapi

## Struktur Proyek

- `pages/` - Halaman Next.js
- `pages/api/uid.ts` - API gateway untuk menerima UID RFID dari ESP8266
- `lib/` - Helper Firebase, offline sync, dan layanan scan
- `components/` - UI reusable
- `public/` - PWA manifest, service worker, icon
- `docs/` - Dokumentasi skema database dan arsitektur
- `hardware/` - Contoh kode ESP8266

## Setup Cepat

1. Install dependensi:

```bash
npm install
```

2. Buat file environment `.env.local` di root:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=YOUR_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=YOUR_PROJECT.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID=YOUR_APP_ID
ESP_GATE_SECRET=your-gate-secret
NEXT_PUBLIC_ESP_GATE_SECRET=your-gate-secret
```

3. Jalankan development server:

```bash
npm run dev
```

4. Akses aplikasi di `http://localhost:3000`

## Firebase Rules & Auth

Gunakan Firebase Authentication untuk login admin dan kasir.

**Contoh role field di Firestore**:

- `users/{uid}`
  - `role`: `SUPER_ADMIN` | `ADMIN` | `KASIR` | `OPERATOR_GATE`

Simpan audit log aktivitas di `auditLogs`.

## PWA & Offline

- `public/sw.js` meng-cache halaman offline
- `lib/offlineSync.ts` menyimpan scan yang gagal ke IndexedDB
- Saat online kembali, data otomatis di-push ke Firestore

## Contoh API ESP8266

ESP8266 lakukan HTTP POST ke `/api/uid` dengan JSON:

```json
{
  "uid": "04A6F02B88",
  "gateId": "Gate-A",
  "secret": "your-gate-secret"
}
```

API akan merespon dengan `OPEN` atau `FAIL`.

ESP8266 juga mengirim heartbeat berkala ke `/api/gate-heartbeat` agar aplikasi mengetahui gate yang sedang online:

```json
{
  "gateId": "Gate-A",
  "secret": "your-gate-secret",
  "ipAddress": "192.168.1.50",
  "firmwareVersion": "1.0.0"
}
```

API akan menyimpan status perangkat di koleksi Firestore `gateDevices`.

## Dokumen Lengkap

- `docs/database-schema.md`
- `docs/architecture.md`

---

## Catatan

- `pages/admin.tsx` dan `pages/index.tsx` berisi demo layout dashboard.
- Lengkapi autentikasi dan role management menggunakan Firebase Auth.
- Tambahkan chart, export PDF/Excel, dan cetak struk thermal di modul kasir.
