#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <WiFiClientSecure.h>
#include <ESP8266mDNS.h>
#include <ArduinoOTA.h>
#include <DNSServer.h>
#include <SPI.h>
#include <MFRC522.h>

// Ring buffer untuk log wireless (via browser http://<ip>/log)
#define LOG_RING_SIZE 64
String logRing[LOG_RING_SIZE];
int logRingHead = 0;

void pushLog(const String &s) {
  logRing[logRingHead] = s;
  logRingHead = (logRingHead + 1) % LOG_RING_SIZE;
}

// Forward log ke USB Serial + ring buffer (wireless)
class LogClass : public Print {
public:
  size_t write(uint8_t c) override {
    Serial.write(c);
    _line += (char)c;
    if (c == '\n') {
      pushLog(_line);
      _line = "";
    }
    return 1;
  }
private:
  String _line;
};
LogClass Log;

// Buat server lokal di port 80
ESP8266WebServer server(80);

// Server Next.js. Ganti URL sesuai hasil deploy.
// Vercel (aktif untuk tes):
const char* UID_ENDPOINT = "https://pintukolamrenang.vercel.app/api/uid";
const char* HEARTBEAT_ENDPOINT = "https://pintukolamrenang.vercel.app/api/gate-heartbeat";
const char* BUTTON_ENDPOINT = "https://pintukolamrenang.vercel.app/api/button-trigger";
const char* API_HOST = "pintukolamrenang.vercel.app";

// Self-host API server (ganti IP_VPS dengan alamat VPS):
//const char* UID_ENDPOINT = "https://IP_VPS:3001/api/uid";
//const char* HEARTBEAT_ENDPOINT = "https://IP_VPS:3001/api/gate-heartbeat";
//const char* API_HOST = "IP_VPS:3001";

// Harus sama dengan ESP_GATE_SECRET di .env.local aplikasi.
const char* GATE_SECRET = "meristarayakolamrenang";

// Identitas gate. Untuk gate lain, ubah menjadi Gate-B, Gate-C, dst.
const char* GATE_ID = "Gate-B";
const char* GATE_NAME = "Gate B - Main Entrance";
const char* FIRMWARE_VERSION = "1.0.0";

// Wiring ESP8266 NodeMCU:
// RC522        -> NodeMCU
// SDA (SS)     -> D4 / GPIO2
// SCK          -> D5 / GPIO14
// MOSI         -> D7 / GPIO13
// MISO         -> D6 / GPIO12
// RST          -> D0 / GPIO16
// Relay IN     -> D1 / GPIO5
// GND semua disambungkan bersama.
const int RC522_SS_PIN = 2;    // NodeMCU D4
const int RC522_RST_PIN = 16;  // NodeMCU D0
const int RELAY_PIN = 5;       // NodeMCU D1
const int STATUS_LED_PIN = LED_BUILTIN;
// Banyak modul relay 5V aktif saat input LOW. Jika modul Anda aktif-HIGH,
// ubah RELAY_ACTIVE_LEVEL menjadi HIGH dan RELAY_IDLE_LEVEL menjadi LOW.
const int RELAY_ACTIVE_LEVEL = HIGH;
const int RELAY_IDLE_LEVEL = LOW;
const unsigned long RELAY_OPEN_MS = 3000;
const int RESET_CONFIG_PIN = 0; // Flash button (D3 / GPIO0) — tekan saat boot untuk reset WiFi
const int BUTTON_PIN = 4;       // NodeMCU D2 — saklar fisik optional (kabel panjang)

MFRC522 mfrc522(RC522_SS_PIN, RC522_RST_PIN);
const unsigned long UID_CONFIRM_TIMEOUT_MS = 5000;
const unsigned long STATUS_LED_INTERVAL_MS = 5000;
const unsigned long CARD_DETECTED_LED_MS = 120;

void flashCardDetectedLed();
void checkCardLed();
void checkButtonPress();
void openGate();
void checkGateClose();
void blinkStatusLedIfDue();
void wifiManagerSetup();
void wifiManagerHandleClient();

// Cooldown agar kartu yang sama tidak membuka gate berkali-kali.
String lastUid = "";
unsigned long lastScanMillis = 0;
const unsigned long SCAN_COOLDOWN_MS = 5000;

// Ack untuk scan kartu — scan log ditulis hanya setelah ESP konfirmasi gate terbuka
String lastScannedUid = "";
bool pendingScanAck = false;

// Heartbeat dikirim berkala agar aplikasi tahu gate masih online.
unsigned long lastHeartbeatMillis = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 15000;
unsigned long lastStatusLedMillis = 0;
unsigned long lastRc522CheckMillis = 0;
const unsigned long RC522_CHECK_INTERVAL_MS = 150;
unsigned long gateOpenUntil = 0;
unsigned long cardLedUntil = 0;
bool blinkLedOn = false;
unsigned long blinkLedUntil = 0;

// Button debounce — saklar fisik opsional
unsigned long lastButtonDebounceMillis = 0;
unsigned long lastButtonCooldownMillis = 0;
const unsigned long BUTTON_DEBOUNCE_MS = 50;
const unsigned long BUTTON_COOLDOWN_MS = 3000;
bool lastButtonState = HIGH;

// ---- WiFi Manager (Captive Portal) ----
#include <EEPROM.h>
#define WIFI_EEPROM_SIZE 128
#define WIFI_EEPROM_MAGIC 0xFE
#define WIFI_AP_SSID "Konfigurasi-Gate"
String wifiManagerSSID = "";
String wifiManagerPassword = "";

DNSServer wifiDns;

bool wifiManagerLoadCreds() {
  EEPROM.begin(WIFI_EEPROM_SIZE);
  byte magic = EEPROM.read(0);
  if (magic != WIFI_EEPROM_MAGIC) { EEPROM.end(); return false; }
  char buf[65];
  for (int i = 0; i < 32; i++) buf[i] = EEPROM.read(1 + i);
  buf[32] = '\0'; wifiManagerSSID = String(buf);
  for (int i = 0; i < 64; i++) buf[i] = EEPROM.read(33 + i);
  buf[64] = '\0'; wifiManagerPassword = String(buf);
  EEPROM.end();
  return true;
}

void wifiManagerSaveCreds(const String &ssid, const String &pass) {
  EEPROM.begin(WIFI_EEPROM_SIZE);
  EEPROM.write(0, WIFI_EEPROM_MAGIC);
  for (int i = 0; i < 32; i++) EEPROM.write(1 + i, i < (int)ssid.length() ? ssid[i] : 0);
  for (int i = 0; i < 64; i++) EEPROM.write(33 + i, i < (int)pass.length() ? pass[i] : 0);
  EEPROM.commit(); EEPROM.end();
}

void wifiManagerClearCreds() {
  EEPROM.begin(WIFI_EEPROM_SIZE);
  EEPROM.write(0, 0);
  EEPROM.commit(); EEPROM.end();
}

String wifiManagerHtml() {
  String html = R"rawliteral(
<!DOCTYPE html><html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Konfigurasi WiFi Gate</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:linear-gradient(135deg,#0f172a,#1e293b);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
.card{background:#1e293b;border-radius:16px;padding:32px;width:100%;max-width:460px;box-shadow:0 25px 50px rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.06)}
h1{color:#f1f5f9;font-size:22px;margin-bottom:6px;letter-spacing:-.3px}
p{color:#94a3b8;font-size:14px;margin-bottom:24px}
.form-group{margin-bottom:16px}
label{display:block;color:#cbd5e1;font-size:13px;font-weight:600;margin-bottom:5px}
select,input{width:100%;padding:10px 12px;border-radius:10px;border:1px solid #334155;background:#0f172a;color:#f1f5f9;font-size:15px;outline:0;transition:border-color .2s}
select:focus,input:focus{border-color:#3b82f6}
select option{background:#0f172a}
.btn{width:100%;padding:12px;border-radius:10px;border:0;font-size:15px;font-weight:600;cursor:pointer;transition:background .2s,transform .1s}
.btn-primary{background:#3b82f6;color:#fff}
.btn-primary:hover{background:#2563eb}
.btn-primary:active{transform:scale(.97)}
.btn-success{background:#22c55e;color:#fff;margin-top:16px}
.btn-success:hover{background:#16a34a}
#status{margin-top:16px;padding:12px 16px;border-radius:10px;display:none;font-size:14px}
#status.loading{display:block;background:#1e3a5f;color:#93c5fd}
#status.error{display:block;background:#450a0a;color:#fca5a5}
#status.success{display:block;background:#052e16;color:#86efac}
.loading-spinner{display:inline-block;width:16px;height:16px;border:2px solid #93c5fd;border-top-color:transparent;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;margin-right:8px}
@keyframes spin{to{transform:rotate(360deg)}}
.network-item{padding:10px 12px;margin-bottom:6px;border-radius:10px;background:#0f172a;border:1px solid #1e293b;cursor:pointer;transition:border-color .2s;color:#e2e8f0;font-size:14px}
.network-item:hover{border-color:#3b82f6}
.network-item.selected{border-color:#22c55e;background:#052e16}
.network-item .rssi{float:right;color:#64748b;font-size:12px}
.hidden{display:none}
</style></head>
<body>
<div class="card">
<h1>Konfigurasi WiFi</h1>
<p>Pilih jaringan WiFi untuk gate ini. Jika tidak tersedia, pilih "Pilih jaringan lain..." lalu masukkan SSID manual.</p>
<div class="form-group">
<label for="ssid">Jaringan WiFi</label>
<select id="ssid"><option value="">-- Scan jaringan --</option></select>
</div>
<div id="manual-ssid-group" class="form-group hidden">
<label for="manual-ssid">Nama SSID (manual)</label>
<input id="manual-ssid" placeholder="Masukkan SSID manual">
</div>
<div class="form-group">
<label for="password">Password WiFi</label>
<input id="password" type="text" placeholder="Kosongkan jika tanpa password">
</div>
<button class="btn btn-primary" onclick="doScan()">Scan Jaringan</button>
<button class="btn btn-success" onclick="doSave()">Simpan & Sambungkan</button>
<div id="status"></div>
</div>
<script>
var scanDone=false;
function showStatus(msg,type){var s=document.getElementById('status');s.className=type;s.innerHTML=msg;if(type=='loading')s.style.display='block';else s.style.display='none'}
function showStatusPermanent(msg,type){var s=document.getElementById('status');s.className=type;s.innerHTML=msg;s.style.display='block'}
function doScan(){
  showStatus('<span class="loading-spinner"></span>Memindai jaringan...','loading');
  fetch('/wifi/scan').then(function(r){return r.json()}).then(function(networks){
    var sel=document.getElementById('ssid');sel.innerHTML='<option value="">-- Pilih jaringan --</option>';
    if(networks.length===0){
      var o=document.createElement('option');o.value='__manual__';o.textContent='Tidak ada jaringan — isi manual';sel.appendChild(o);
    }else{
      networks.forEach(function(n){
        var o=document.createElement('option');o.value=n.ssid;
        var lock=n.open?'🔓 ':'🔒 ';o.textContent=lock+n.ssid+' ('+n.rssi+'dBm)';sel.appendChild(o);
      });
      var sep=document.createElement('option');sep.value='__manual__';sep.textContent='--- Pilih jaringan lain... ---';sel.appendChild(sep);
    }
    scanDone=true;
    showStatus('','');
    sel.onchange=function(){
      if(this.value==='__manual__'){document.getElementById('manual-ssid-group').classList.remove('hidden')}
      else{document.getElementById('manual-ssid-group').classList.add('hidden')}
    };
  })['catch'](function(){showStatusPermanent('Gagal scan. Coba lagi.','error')});
}
function doSave(){
  var ssid=document.getElementById('ssid').value;
  if(ssid==='__manual__')ssid=document.getElementById('manual-ssid').value;
  var pass=document.getElementById('password').value;
  if(!ssid){showStatusPermanent('Pilih atau isi SSID terlebih dahulu.','error');return}
  showStatus('<span class="loading-spinner"></span>Menyimpan...','loading');
  fetch('/wifi/save',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'ssid='+encodeURIComponent(ssid)+'&password='+encodeURIComponent(pass)}).then(function(r){return r.text()}).then(function(msg){
    showStatusPermanent(msg,'success');
    setTimeout(function(){location.reload()},3000);
  })['catch'](function(){showStatusPermanent('Gagal menyimpan.','error')});
}
window.onload=function(){setTimeout(doScan,500)};
</script></body></html>
)rawliteral";
  return html;
}

void wifiManagerStartAp() {
  if (WiFi.status() == WL_CONNECTED) {
    WiFi.mode(WIFI_AP_STA);
  } else {
    WiFi.mode(WIFI_AP);
  }
  byte mac[6]; WiFi.macAddress(mac);
  char apSsid[32];
  snprintf(apSsid, sizeof(apSsid), "%s-%02X%02X", WIFI_AP_SSID, mac[4], mac[5]);
  WiFi.softAP(apSsid);
  wifiDns.start(53, "*", WiFi.softAPIP());
  Log.print("AP: ");
  Log.print(apSsid);
  Log.print(" IP: ");
  Log.println(WiFi.softAPIP().toString());

  server.on("/wifi", []() {
    server.send(200, "text/html; charset=utf-8", wifiManagerHtml());
  });
  server.on("/wifi/scan", []() {
    int n = WiFi.scanNetworks();
    String json = "[";
    for (int i = 0; i < n; i++) {
      if (i > 0) json += ",";
      json += "{\"ssid\":\""; json += WiFi.SSID(i); json += "\"";
      json += ",\"rssi\":"; json += WiFi.RSSI(i);
      json += ",\"open\":"; json += (WiFi.encryptionType(i) == ENC_TYPE_NONE ? "true" : "false");
      json += "}";
    }
    json += "]";
    server.send(200, "application/json", json);
  });
  server.on("/wifi/save", HTTP_POST, []() {
    String ssid = server.arg("ssid");
    String pass = server.arg("password");
    ssid.trim(); pass.trim();
    if (ssid.length() == 0) { server.send(400, "text/plain", "SSID tidak boleh kosong."); return; }
    wifiManagerSaveCreds(ssid, pass);
    server.send(200, "text/plain", "Tersimpan! ESP akan restart...");
    delay(1000);
    ESP.restart();
  });
  // Captive portal: redirect all to /wifi
  server.onNotFound([]() {
    server.sendHeader("Location", "/wifi", true);
    server.send(302, "text/plain", "");
  });
}

void wifiManagerSetup() {
  pinMode(RESET_CONFIG_PIN, INPUT_PULLUP);
  bool forceConfig = (digitalRead(RESET_CONFIG_PIN) == LOW);
  if (forceConfig) {
    Log.println("Tombol reset ditekan — hapus kredensial & masuk mode konfigurasi.");
    wifiManagerClearCreds();
  }

  if (wifiManagerLoadCreds() && !forceConfig) {
    Log.print("Kredensial ditemukan. Mencoba konek ke ");
    Log.println(wifiManagerSSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(wifiManagerSSID.c_str(), wifiManagerPassword.c_str());
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
      delay(500); Log.print(".");
    }
    if (WiFi.status() == WL_CONNECTED) {
      Log.println();
      Log.print("Terhubung ke ");
      Log.print(WiFi.SSID());
      Log.print(" IP: ");
      Log.println(WiFi.localIP());
      // AP tetap aktif (STA+AP) agar bisa konfigurasi ulang
      wifiManagerStartAp();
      return;
    }
    Log.println(" gagal. Masuk mode konfigurasi.");
  } else {
    Log.println("Tidak ada kredensial tersimpan. Mode konfigurasi.");
  }

  // Gagal/tidak ada kredensial — AP saja (tanpa STA)
  wifiManagerStartAp();
}

void wifiManagerHandleClient() {
  wifiDns.processNextRequest();
}
// ---- Akhir WiFi Manager ----

void setup() {
  digitalWrite(RELAY_PIN, RELAY_IDLE_LEVEL);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_IDLE_LEVEL);

  Serial.begin(115200);
  Serial.setTimeout(200);
  Serial.println();
  Serial.println("=== BOOT RC522 GATE ===");

  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, HIGH);
  digitalWrite(STATUS_LED_PIN, LOW);
  delay(120);
  digitalWrite(STATUS_LED_PIN, HIGH);

  SPI.begin();
  mfrc522.PCD_Init();
  Log.println("RC522 siap.");

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  lastButtonState = digitalRead(BUTTON_PIN);

  wifiManagerSetup();

  // mDNS — akses via http://gate-a.local/
  if (WiFi.status() == WL_CONNECTED) {
    String hostname = String(GATE_ID);
    hostname.toLowerCase();
    if (MDNS.begin(hostname.c_str())) {
      MDNS.addService("http", "tcp", 80);
      Log.print("mDNS: http://");
      Log.print(hostname);
      Log.println(".local/");
    }
    Log.print("Log: http://");
    Log.print(WiFi.localIP().toString());
    Log.println("/log");

    // OTA — upload sketch via WiFi
    ArduinoOTA.setHostname(GATE_ID);
    ArduinoOTA.setPassword("kolamrenang");
    ArduinoOTA.onStart([]() { Log.println("OTA mulai..."); });
    ArduinoOTA.onEnd([]() { Log.println("\nOTA selesai"); });
    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
      Log.printf("OTA progress: %u%%\r", (progress / (total / 100)));
    });
    ArduinoOTA.onError([](ota_error_t error) {
      Log.printf("OTA error: %u\n", error);
    });
    ArduinoOTA.begin();
    Log.println("OTA siap.");

    // Test koneksi TCP ke server (tanpa TLS)
    WiFiClient tcpTest;
    if (tcpTest.connect(API_HOST, 443)) {
      Log.println("TCP ke server: OK");
      tcpTest.stop();
    } else {
      Log.println("TCP ke server: GAGAL");
    }
  }

  // Endpoint "/log" — lihat log dari browser
  server.on("/log", []() {
    String html = "<!DOCTYPE html><html><head><meta charset='utf-8'><meta http-equiv='refresh' content='2'><title>";
    html += GATE_ID;
    html += " Log</title><style>body{background:#111;color:#0f0;font:13px monospace;padding:10px;white-space:pre-wrap;word-break:break-all}#h{color:#888;margin-bottom:10px}</style></head><body><div id='h'>";
    html += GATE_ID;
    html += " &mdash; <a href='/open' style='color:#0f0' onclick=\"fetch('/open',{method:'POST'});return false\">/open</a></div>";
    int i = logRingHead;
    for (int c = 0; c < LOG_RING_SIZE; c++) {
      html += logRing[i];
      i = (i + 1) % LOG_RING_SIZE;
    }
    html += "</body></html>";
    server.send(200, "text/html; charset=utf-8", html);
  });

  // Endpoint "/open" — buka gate via HTTP POST (dari browser langsung atau Vercel)
  server.on("/open", HTTP_OPTIONS, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    server.send(204);
  });
  server.on("/open", HTTP_POST, []() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    Log.println("Perintah OPEN diterima!");
    server.send(200, "application/json", "{\"status\":\"OK\", \"message\":\"Gate " + String(GATE_ID) + " Opened\"}");
    openGate();
  });

  // Mulai server
  server.begin();
  Log.println("ESP siap.");

}

// Indikator loop hidup — print ke Serial langsung setiap 5 detik
unsigned long lastAlivePrintMillis = 0;

void loop() {
  server.handleClient();
  wifiManagerHandleClient();
  if (WiFi.status() == WL_CONNECTED) ArduinoOTA.handle();
  checkGateClose();
  checkCardLed();
  blinkStatusLedIfDue();
  checkButtonPress();

  if (millis() - lastAlivePrintMillis >= 5000) {
    lastAlivePrintMillis = millis();
    Serial.print(".");
  }

  readUidFromRc522();

  if (millis() - lastHeartbeatMillis >= HEARTBEAT_INTERVAL_MS) {
    if (WiFi.status() == WL_CONNECTED) {
      sendHeartbeat();
    } else {
      Log.println("OFFLINE - tidak ada WiFi terbuka");
      lastHeartbeatMillis = millis();
    }
  }
}

void readUidFromRc522() {
  if (millis() - lastRc522CheckMillis < RC522_CHECK_INTERVAL_MS) {
    return;
  }
  lastRc522CheckMillis = millis();

  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial()) {
    return;
  }

  // Konversi UID byte array ke string hex
  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(mfrc522.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();

  mfrc522.PICC_HaltA();

  if (uid == lastUid && millis() - lastScanMillis < SCAN_COOLDOWN_MS) {
    Log.println("DOUBLE TAP IGNORED");
    return;
  }

  lastUid = uid;
  lastScanMillis = millis();
  Serial.print("KARTU TERBACA: ");
  Serial.println(uid);
  Log.println("=== SCAN ===");
  Log.print("UID: ");
  Log.println(uid);
  Log.println("SENDING...");
  flashCardDetectedLed();
  sendUid(uid);
}

void flashCardDetectedLed() {
  digitalWrite(STATUS_LED_PIN, LOW);
  cardLedUntil = millis() + CARD_DETECTED_LED_MS;
}

void checkCardLed() {
  if (cardLedUntil && millis() >= cardLedUntil) {
    digitalWrite(STATUS_LED_PIN, HIGH);
    cardLedUntil = 0;
  }
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  // Diagnostik: uji TLS ke server lain (google.com)
  WiFiClientSecure diag;
  diag.setInsecure();
  diag.setTimeout(5);
  if (diag.connect("google.com", 443)) {
    diag.print("GET / HTTP/1.1\r\nHost: google.com\r\nConnection: close\r\n\r\n");
    diag.flush();
    delay(200);
    String resp;
    unsigned long t = millis() + 3000;
    while (millis() < t) {
      if (diag.available()) {
        char c = diag.read();
        resp += c;
        t = millis() + 1000;
      } else if (!diag.connected()) {
        delay(50);
        if (!diag.available()) break;
      } else {
        delay(10);
      }
    }
    diag.stop();
    if (resp.indexOf("200 OK") >= 0) {
      Log.println("GOOGLE: OK (ESP TLS jalan)");
    } else if (resp.length() > 0) {
      Log.print("GOOGLE: ");
      Log.println(resp.substring(0, 60));
    } else {
      Log.println("GOOGLE: no response");
    }
  } else {
    Log.println("GOOGLE: TLS gagal total");
  }

  // Heartbeat via HTTPClient (lebih stabil dari raw HTTPS)
  HTTPClient http;
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(10);
  http.begin(client, HEARTBEAT_ENDPOINT);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("User-Agent", "ESP8266-GateSystem");

  String payload = "{";
  payload += "\"gateId\":\"" + String(GATE_ID) + "\",";
  payload += "\"name\":\"" + String(GATE_NAME) + "\",";
  payload += "\"secret\":\"" + String(GATE_SECRET) + "\",";
  payload += "\"ipAddress\":\"" + WiFi.localIP().toString() + "\",";
  payload += "\"firmwareVersion\":\"" + String(FIRMWARE_VERSION) + "\",";
  payload += "\"scanAck\":\"" + String(pendingScanAck ? lastScannedUid : "") + "\"";
  payload += "}";

  int httpCode = http.POST(payload);
  String response = http.getString();

  if (httpCode == HTTP_CODE_OK) {
    Log.println("HEARTBEAT OK: 200");
    pendingScanAck = false;
    if (response.indexOf("\"command\":\"OPEN\"") >= 0) {
      Log.println("COMMAND: OPEN diterima!");
      openGate();
    }
  } else if (httpCode > 0) {
    Log.printf("HEARTBEAT DITOLAK %d: %s\n", httpCode, response.c_str());
  } else {
    Log.printf("HEARTBEAT GAGAL TERKIRIM: %s\n", http.errorToString(httpCode).c_str());
  }

  http.end();
  lastHeartbeatMillis = millis();
}

void sendUid(const String& uid) {
  if (WiFi.status() != WL_CONNECTED) {
    Log.println("SCAN OFFLINE — relay open (fail-open)");
    openGate();
    return;
  }

  HTTPClient http;
  WiFiClientSecure client;

  client.setInsecure();
  client.setTimeout(UID_CONFIRM_TIMEOUT_MS / 1000);
  http.begin(client, UID_ENDPOINT);
  http.setTimeout(UID_CONFIRM_TIMEOUT_MS);
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += "\"uid\":\"" + uid + "\",";
  payload += "\"gateId\":\"" + String(GATE_ID) + "\",";
  payload += "\"secret\":\"" + String(GATE_SECRET) + "\"";
  payload += "}";

  int httpCode = http.POST(payload);
  String response = http.getString();

  Log.print("SCAN RESPONSE ");
  Log.print(httpCode);
  Log.print(": ");
  Log.println(response);
  Log.println("===========");

  if (httpCode == HTTP_CODE_OK && response.indexOf("OPEN") >= 0) {
    openGate();
    lastScannedUid = uid;
    pendingScanAck = true;
  } else if (httpCode <= 0) {
    // Koneksi gagal (timeout/-11 dll) — fail-open, tetap catat scan via heartbeat
    Log.println("NO OPEN CONFIRM WITHIN 2 SECONDS. FAIL-OPEN RELAY.");
    openGate();
    lastScannedUid = uid;
    pendingScanAck = true;
  } else {
    Log.println("SCAN DITOLAK — kartu tidak valid");
  }

  http.end();

  if (httpCode <= 0) {
    // Kirim scanAck segera tanpa menunggu heartbeat berikutnya
    sendHeartbeat();
  }
}

void sendButtonPress() {
  if (WiFi.status() != WL_CONNECTED) {
    Log.println("BUTTON OFFLINE — gate tetap terbuka (fail-open)");
    return;
  }

  HTTPClient http;
  WiFiClientSecure client;
  client.setInsecure();
  client.setTimeout(5);
  http.begin(client, BUTTON_ENDPOINT);
  http.setTimeout(5000);
  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += "\"secret\":\"" + String(GATE_SECRET) + "\",";
  payload += "\"gateId\":\"" + String(GATE_ID) + "\"";
  payload += "}";

  int httpCode = http.POST(payload);
  String response = http.getString();

  Log.print("BUTTON TRIGGER ");
  Log.print(httpCode);
  Log.print(": ");
  Log.println(response);

  http.end();
}

void checkButtonPress() {
  bool btn = digitalRead(BUTTON_PIN);
  unsigned long now = millis();

  if (btn == LOW && lastButtonState == HIGH && now - lastButtonDebounceMillis > BUTTON_DEBOUNCE_MS) {
    lastButtonDebounceMillis = now;
    if (digitalRead(BUTTON_PIN) == LOW && now - lastButtonCooldownMillis > BUTTON_COOLDOWN_MS) {
      Log.println("BUTTON PRESSED — gate dibuka & dikirim ke server");
      flashCardDetectedLed();
      openGate();
      sendButtonPress();
      lastButtonCooldownMillis = now;
    }
  }

  lastButtonState = btn;
}

void openGate() {
  digitalWrite(RELAY_PIN, RELAY_ACTIVE_LEVEL);
  gateOpenUntil = millis() + RELAY_OPEN_MS;
  Log.println("GATE OPENED");
}

void checkGateClose() {
  if (gateOpenUntil && millis() >= gateOpenUntil) {
    digitalWrite(RELAY_PIN, RELAY_IDLE_LEVEL);
    gateOpenUntil = 0;
  }
}

void blinkStatusLedIfDue() {
  if (blinkLedUntil) {
    if (millis() >= blinkLedUntil) {
      digitalWrite(STATUS_LED_PIN, HIGH);
      blinkLedUntil = 0;
      blinkLedOn = false;
    }
    return;
  }
  if (millis() - lastStatusLedMillis < STATUS_LED_INTERVAL_MS) {
    return;
  }
  lastStatusLedMillis = millis();
  digitalWrite(STATUS_LED_PIN, LOW);
  blinkLedOn = true;
  blinkLedUntil = millis() + 120;
}
