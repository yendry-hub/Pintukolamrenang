#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>
#include <WiFiClientSecure.h>
#include <ESP8266mDNS.h>
#include <ArduinoOTA.h>

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
// Vercel (blokir ESP8266 — gunakan self-host):
//const char* UID_ENDPOINT = "https://pintukolamrenang.vercel.app/api/uid";
//const char* HEARTBEAT_ENDPOINT = "https://pintukolamrenang.vercel.app/api/gate-heartbeat";
//const char* API_HOST = "pintukolamrenang.vercel.app";

const char* UID_ENDPOINT = "https://pintukolamrenang.vercel.app/api/uid";
const char* HEARTBEAT_ENDPOINT = "https://pintukolamrenang.vercel.app/api/gate-heartbeat";
const char* API_HOST = "pintukolamrenang.vercel.app"; // HANYA DOMAIN, TANPA HTTPS / PORT

// Self-host API server (ganti IP_VPS dengan alamat VPS):
//const char* UID_ENDPOINT = "https://IP_VPS:3001/api/uid";
//const char* HEARTBEAT_ENDPOINT = "https://IP_VPS:3001/api/gate-heartbeat";
//const char* API_HOST = "IP_VPS:3001";

// Harus sama dengan ESP_GATE_SECRET di .env.local aplikasi.
const char* GATE_SECRET = "meristarayakolamrenang";

// Identitas gate. Untuk gate lain, ubah menjadi Gate-B, Gate-C, dst.
const char* GATE_ID = "Gate-A";
const char* GATE_NAME = "Gate A - Main Entrance";
const char* FIRMWARE_VERSION = "1.0.0";

// Wiring ESP8266 NodeMCU:
// - Sebury Wiegand D0  -> D5 / GPIO14
// - Sebury Wiegand D1  -> D6 / GPIO12
// - Relay IN           -> D1 / GPIO5
// - Sebury GND, relay GND, ESP GND harus tersambung bersama.
const int WIEGAND_D0_PIN = 14; // NodeMCU D5
const int WIEGAND_D1_PIN = 12; // NodeMCU D6
const int RELAY_PIN = 5;       // NodeMCU D1
const int STATUS_LED_PIN = LED_BUILTIN;
// Banyak modul relay 5V aktif saat input LOW. Jika modul Anda aktif-HIGH,
// ubah RELAY_ACTIVE_LEVEL menjadi HIGH dan RELAY_IDLE_LEVEL menjadi LOW.
const int RELAY_ACTIVE_LEVEL = LOW;
const int RELAY_IDLE_LEVEL = HIGH;
const unsigned long RELAY_OPEN_MS = 3000;
const int RESET_CONFIG_PIN = 0; // Flash button (D3 / GPIO0) — tekan saat boot untuk reset WiFi
const unsigned long UID_CONFIRM_TIMEOUT_MS = 2000;
const unsigned long STATUS_LED_INTERVAL_MS = 5000;
const unsigned long CARD_DETECTED_LED_MS = 120;

void flashCardDetectedLed();
void checkCardLed();
void openGate();
void checkGateClose();
void blinkStatusLedIfDue();

// Cooldown agar kartu yang sama tidak membuka gate berkali-kali.
String lastUid = "";
unsigned long lastScanMillis = 0;
const unsigned long SCAN_COOLDOWN_MS = 5000;

// Ack untuk scan kartu — scan log ditulis hanya setelah ESP konfirmasi gate terbuka
String lastScannedUid = "";
bool pendingScanAck = false;

// Wiegand umumnya selesai mengirim setelah tidak ada pulsa selama 25-50 ms.
volatile unsigned long wiegandData = 0;
volatile int wiegandBitCount = 0;
volatile unsigned long lastWiegandBitMillis = 0;
const unsigned long WIEGAND_FRAME_GAP_MS = 35;

// Heartbeat dikirim berkala agar aplikasi tahu gate masih online.
unsigned long lastHeartbeatMillis = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 15000;
unsigned long lastStatusLedMillis = 0;
unsigned long gateOpenUntil = 0;
unsigned long cardLedUntil = 0;
bool blinkLedOn = false;
unsigned long blinkLedUntil = 0;

void ICACHE_RAM_ATTR handleWiegandD0() {
  wiegandData = (wiegandData << 1);
  wiegandBitCount++;
  lastWiegandBitMillis = millis();
}

void ICACHE_RAM_ATTR handleWiegandD1() {
  wiegandData = (wiegandData << 1) | 1;
  wiegandBitCount++;
  lastWiegandBitMillis = millis();
}

void setup() {
  digitalWrite(RELAY_PIN, RELAY_IDLE_LEVEL);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, RELAY_IDLE_LEVEL);

  Serial.begin(115200);
  Serial.setTimeout(200);

  pinMode(WIEGAND_D0_PIN, INPUT_PULLUP);
  pinMode(WIEGAND_D1_PIN, INPUT_PULLUP);
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, HIGH);
  digitalWrite(STATUS_LED_PIN, LOW);
  delay(120);
  digitalWrite(STATUS_LED_PIN, HIGH);

  attachInterrupt(digitalPinToInterrupt(WIEGAND_D0_PIN), handleWiegandD0, FALLING);
  attachInterrupt(digitalPinToInterrupt(WIEGAND_D1_PIN), handleWiegandD1, FALLING);

  connectToOpenWiFi();

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
  if (WiFi.status() == WL_CONNECTED) ArduinoOTA.handle();
  checkGateClose();
  checkCardLed();
  blinkStatusLedIfDue();

  if (millis() - lastAlivePrintMillis >= 5000) {
    lastAlivePrintMillis = millis();
    Serial.print(".");
  }

  readUidFromWiegand();

  if (millis() - lastHeartbeatMillis >= HEARTBEAT_INTERVAL_MS) {
    if (WiFi.status() == WL_CONNECTED) {
      sendHeartbeat();
    } else {
      Log.println("OFFLINE - tidak ada WiFi terbuka");
      lastHeartbeatMillis = millis();
    }
  }
}

void connectToOpenWiFi() {
  Log.println("Mereset memori WiFi...");
  
  // 1. Bersihkan cache WiFi yang nyangkut (Sangat Penting)
  WiFi.disconnect(true);
  delay(1000); 
  
  WiFi.mode(WIFI_STA);

  int n = WiFi.scanNetworks();
  if (n == 0) {
    Log.println("Tidak ada WiFi terdeteksi sama sekali. Jalan offline.");
    return;
  }

  String targetSSID = "";
  for (int i = 0; i < n; ++i) {
    if (WiFi.encryptionType(i) == ENC_TYPE_NONE) {
      targetSSID = WiFi.SSID(i);
      Log.print("Menemukan WiFi terbuka: ");
      Log.println(targetSSID);
      break;
    }
  }

  if (targetSSID == "") {
    Log.println("Tidak ada WiFi terbuka (semua dipassword). Jalan offline.");
    return;
  }

  Log.print("Mencoba menghubungkan ke: ");
  Log.println(targetSSID);

  WiFi.begin(targetSSID.c_str());

  unsigned long start = millis();
  
  // 3. Kita tambah toleransi waktunya menjadi 20 detik
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Log.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Log.println();
    Log.print("Sukses Terhubung! IP: ");
    Log.println(WiFi.localIP());
    sendHeartbeat();
  } else {
    Log.println();
    Log.println("GAGAL: Router/Hotspot menolak ESP8266.");
  }
}

void readUidFromWiegand() {
  if (wiegandBitCount == 0 || millis() - lastWiegandBitMillis < WIEGAND_FRAME_GAP_MS) {
    return;
  }

  noInterrupts();
  unsigned long rawData = wiegandData;
  int bitCount = wiegandBitCount;
  wiegandData = 0;
  wiegandBitCount = 0;
  interrupts();

  String uid = parseWiegandUid(rawData, bitCount);
  if (uid.length() == 0) {
    Log.print("UNSUPPORTED WIEGAND BITS: ");
    Log.println(bitCount);
    return;
  }

  if (uid == lastUid && millis() - lastScanMillis < SCAN_COOLDOWN_MS) {
    Log.println("DOUBLE TAP IGNORED");
    return;
  }

  lastUid = uid;
  lastScanMillis = millis();
  flashCardDetectedLed();
  sendUid(uid);
}

String parseWiegandUid(unsigned long rawData, int bitCount) {
  if (bitCount != 26 && bitCount != 34) {
    return "";
  }

  int dataBits = bitCount - 2;
  unsigned long mask = dataBits >= 32 ? 0xFFFFFFFFUL : ((1UL << dataBits) - 1);
  unsigned long cardData = (rawData >> 1) & mask;

  char uidBuffer[11];
  if (bitCount == 26) {
    snprintf(uidBuffer, sizeof(uidBuffer), "%06lX", cardData);
  } else {
    snprintf(uidBuffer, sizeof(uidBuffer), "%08lX", cardData);
  }

  return String(uidBuffer);
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

  HTTPClient http;
  WiFiClientSecure client;

  // Set insecure untuk mem-bypass verifikasi sertifikat Vercel
  client.setInsecure();
  
  // Set timeout lebih lama (10 detik) untuk mengantisipasi Serverless "Cold Start" dari Vercel
  client.setTimeout(10); 

  http.begin(client, HEARTBEAT_ENDPOINT);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("User-Agent", "ESP8266-GateSystem");

  // Menyusun payload JSON sesuai format asli Anda
  String payload = "{";
  payload += "\"gateId\":\"" + String(GATE_ID) + "\",";
  payload += "\"name\":\"" + String(GATE_NAME) + "\",";
  payload += "\"secret\":\"" + String(GATE_SECRET) + "\",";
  payload += "\"ipAddress\":\"" + WiFi.localIP().toString() + "\",";
  payload += "\"firmwareVersion\":\"" + String(FIRMWARE_VERSION) + "\",";
  payload += "\"commandExecuted\":false,";
  payload += "\"scanAck\":\"" + String(pendingScanAck ? lastScannedUid : "") + "\"";
  payload += "}";

  if (pendingScanAck) pendingScanAck = false;

  // Lakukan POST request
  unsigned long startMillis = millis();
  int httpCode = http.POST(payload);
  String response = http.getString();

  // Evaluasi respons dari Vercel
  if (httpCode == HTTP_CODE_OK) {
    Log.println("HEARTBEAT OK: 200");
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

  unsigned long requestStartMillis = millis();
  int httpCode = http.POST(payload);
  String response = http.getString();
  bool requestTimedOut = millis() - requestStartMillis >= UID_CONFIRM_TIMEOUT_MS;

  Log.print("SCAN RESPONSE ");
  Log.print(httpCode);
  Log.print(": ");
  Log.println(response);

  if (httpCode == HTTP_CODE_OK && response.indexOf("OPEN") >= 0) {
    openGate();
    lastScannedUid = uid;
    pendingScanAck = true;
  } else if (httpCode <= 0 || requestTimedOut) {
    Log.println("NO OPEN CONFIRM WITHIN 2 SECONDS. FAIL-OPEN RELAY.");
    openGate();
  }

  http.end();
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
