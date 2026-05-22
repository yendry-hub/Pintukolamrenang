# ESP8266 Gate Heartbeat Wiring

Sketch utama: `esp8266_gate_heartbeat.ino`

## Pin ESP8266 NodeMCU

| Fungsi | Pin NodeMCU | GPIO | Ke perangkat |
| --- | --- | --- | --- |
| Wiegand D0 | D5 | GPIO14 | Sebury D0 / Data0 |
| Wiegand D1 | D6 | GPIO12 | Sebury D1 / Data1 |
| Relay IN | D1 | GPIO5 | Modul relay input |
| GND | GND | GND | GND Sebury dan GND relay |
| 3V3 | 3V3 | 3.3V | Pull-up jika dibutuhkan |
| VIN / 5V | VIN | 5V | VCC modul relay 5V, jika relay mendukung input 3.3V |

## Catatan Wiring

- Satukan GND ESP8266, GND Sebury, dan GND relay.
- Output Wiegand Sebury umumnya open-collector. Sketch memakai `INPUT_PULLUP` internal ESP8266.
- Jika output Sebury memakai level 5V aktif, gunakan level shifter/opto-isolator sebelum masuk ke pin ESP8266 karena GPIO ESP8266 hanya aman di 3.3V.
- Relay untuk tripod sebaiknya memakai modul relay optocoupler atau transistor driver, bukan langsung dari GPIO.
- Pin relay di sketch adalah `D1 / GPIO5`. Saat response API berisi `OPEN`, pin ini aktif selama 1 detik.
- Jika ESP8266 tidak mendapat konfirmasi `OPEN` dari API dalam 3 detik karena timeout/koneksi gagal, sketch tetap mengaktifkan relay selama 1 detik agar pintu terbuka.
- Saat Sebury mendeteksi kartu dan ESP membaca data Wiegand, ESP akan menyalakan LED bawaan sesaat sebagai tanda momen scan diterima.

## Format Data Kartu

Sketch membaca Wiegand 26-bit atau 34-bit. Bit parity awal/akhir dibuang, lalu data tengah dikirim ke aplikasi sebagai UID hex:

- Wiegand 26-bit: 24 bit data, contoh `12AB34`
- Wiegand 34-bit: 32 bit data, contoh `04A6F02B`

UID yang tersimpan di Firestore `rfidCards` harus sama dengan format hex yang dikirim sketch.
