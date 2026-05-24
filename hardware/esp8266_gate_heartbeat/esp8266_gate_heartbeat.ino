#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WebServer.h>

// Buat server lokal di port 80
ESP8266WebServer server(80);

// WiFi
const char* WIFI_SSID = "Galaxy Tab A7 Lite 4552";
const char* WIFI_PASSWORD = "WhiteKoffie";

// Server Next.js. Ganti IP sesuai alamat laptop/server yang menjalankan aplikasi.
const char* UID_ENDPOINT = "http://10.50.51.17:3000/api/uid";
const char* HEARTBEAT_ENDPOINT = "http://10.50.51.17:3000/api/gate-heartbeat";

// Harus sama dengan ESP_GATE_SECRET di .env.local aplikasi.
const char* GATE_SECRET = "meristarayakolamrenang";

// Identitas gate. Untuk gate lain, ubah menjadi Gate-B, Gate-C, dst.
const char* GATE_ID = "Gate-B";
const char* GATE_NAME = "Gate B - Main Entrance";
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
const unsigned long RELAY_OPEN_MS = 1000;
const unsigned long UID_CONFIRM_TIMEOUT_MS = 2000;
const unsigned long STATUS_LED_INTERVAL_MS = 5000;
const unsigned long CARD_DETECTED_LED_MS = 120;

void flashCardDetectedLed();

// Cooldown agar kartu yang sama tidak membuka gate berkali-kali.
String lastUid = "";
unsigned long lastScanMillis = 0;
const unsigned long SCAN_COOLDOWN_MS = 5000;

// Wiegand umumnya selesai mengirim setelah tidak ada pulsa selama 25-50 ms.
volatile unsigned long wiegandData = 0;
volatile int wiegandBitCount = 0;
volatile unsigned long lastWiegandBitMillis = 0;
const unsigned long WIEGAND_FRAME_GAP_MS = 35;

// Heartbeat dikirim berkala agar aplikasi tahu gate masih online.
unsigned long lastHeartbeatMillis = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 15000;
unsigned long lastStatusLedMillis = 0;

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
  blinkStatusLed();

  attachInterrupt(digitalPinToInterrupt(WIEGAND_D0_PIN), handleWiegandD0, FALLING);
  attachInterrupt(digitalPinToInterrupt(WIEGAND_D1_PIN), handleWiegandD1, FALLING);

  connectWiFi();
  // Membuat endpoint "/open" yang menerima HTTP POST
  server.on("/open", HTTP_POST, []() {
    Serial.println("Perintah OPEN diterima dari Next.js!");
    openGate(); // Memicu optocoupler
    
    // Memberi jawaban balik ke Next.js agar tombol di web tidak loading terus
    server.send(200, "application/json", "{\"status\":\"OK\", \"message\":\"Gate A Opened\"}");
  });

  // Jalankan server
  server.begin();

}

void loop() {
  server.handleClient();
  blinkStatusLedIfDue();
  readUidFromWiegand();

  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    delay(1000);
    return;
  }

  if (millis() - lastHeartbeatMillis >= HEARTBEAT_INTERVAL_MS) {
    sendHeartbeat();
  }
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.print("Connecting WiFi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    Serial.print(".");
    delay(500);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
    sendHeartbeat();
  } else {
    Serial.println();
    Serial.println("WiFi failed. Will retry.");
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
    Serial.print("UNSUPPORTED WIEGAND BITS: ");
    Serial.println(bitCount);
    return;
  }

  if (uid == lastUid && millis() - lastScanMillis < SCAN_COOLDOWN_MS) {
    Serial.println("DOUBLE TAP IGNORED");
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
  delay(CARD_DETECTED_LED_MS);
  digitalWrite(STATUS_LED_PIN, HIGH);
}

void sendHeartbeat() {
  HTTPClient http;
  WiFiClient client;

  client.setTimeout(200); 

  http.begin(client, HEARTBEAT_ENDPOINT);
  http.setTimeout(200);

  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += "\"gateId\":\"" + String(GATE_ID) + "\",";
  payload += "\"name\":\"" + String(GATE_NAME) + "\",";
  payload += "\"secret\":\"" + String(GATE_SECRET) + "\",";
  payload += "\"ipAddress\":\"" + WiFi.localIP().toString() + "\",";
  payload += "\"firmwareVersion\":\"" + String(FIRMWARE_VERSION) + "\"";
  payload += "}";

  int httpCode = http.POST(payload);
  if (httpCode == HTTP_CODE_OK) {
    Serial.println("HEARTBEAT OK");
  } else {
    Serial.print("HEARTBEAT SENT (No wait): ");
    Serial.println(httpCode);
  }

  lastHeartbeatMillis = millis();
  http.end();
}

void sendUid(const String& uid) {
  HTTPClient http;
  WiFiClient client;

  client.setTimeout(UID_CONFIRM_TIMEOUT_MS / 1000);
  http.begin(client, UID_ENDPOINT);
  http.setTimeout(UID_CONFIRM_TIMEOUT_MS);
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

  Serial.print("SCAN RESPONSE ");
  Serial.print(httpCode);
  Serial.print(": ");
  Serial.println(response);

  if (httpCode == HTTP_CODE_OK && response.indexOf("OPEN") >= 0) {
    openGate();
  } else if (httpCode <= 0 || requestTimedOut) {
    Serial.println("NO OPEN CONFIRM WITHIN 2 SECONDS. FAIL-OPEN RELAY.");
    openGate();
  }

  http.end();
}

void openGate() {
  digitalWrite(RELAY_PIN, RELAY_ACTIVE_LEVEL);
  delay(RELAY_OPEN_MS);
  digitalWrite(RELAY_PIN, RELAY_IDLE_LEVEL);
  Serial.println("GATE OPENED");
}

void blinkStatusLedIfDue() {
  if (millis() - lastStatusLedMillis < STATUS_LED_INTERVAL_MS) {
    return;
  }

  lastStatusLedMillis = millis();
  blinkStatusLed();
}

void blinkStatusLed() {
  digitalWrite(STATUS_LED_PIN, LOW);
  delay(120);
  digitalWrite(STATUS_LED_PIN, HIGH);
}
