#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>

const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "http://192.168.1.100:3000/api/uid";
const char* heartbeatUrl = "http://192.168.1.100:3000/api/gate-heartbeat";
const char* secret = "your-gate-secret";
const char* gateId = "Gate-A";
const char* firmwareVersion = "1.0.0";

const int relayPin = D1;
const int relayActiveLevel = LOW;
const int relayIdleLevel = HIGH;
String lastUid = "";
unsigned long lastScanMillis = 0;
unsigned long lastHeartbeatMillis = 0;
const unsigned long scanCooldown = 5000;
const unsigned long heartbeatInterval = 15000;

void setup() {
  digitalWrite(relayPin, relayIdleLevel);
  pinMode(relayPin, OUTPUT);
  digitalWrite(relayPin, relayIdleLevel);
  Serial.begin(115200);
  connectWiFi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    delay(2000);
    return;
  }

  if (millis() - lastHeartbeatMillis >= heartbeatInterval) {
    sendHeartbeat();
  }

  if (Serial.available()) {
    String uid = Serial.readStringUntil('\n');
    uid.trim();

    if (uid.length() == 0) return;
    if (uid == lastUid && millis() - lastScanMillis < scanCooldown) {
      Serial.println("DOUBLE TAP DETECTED");
      return;
    }

    lastUid = uid;
    lastScanMillis = millis();
    sendUid(uid);
  }
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    Serial.print('.');
    delay(500);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected");
    sendHeartbeat();
  } else {
    Serial.println("\nWiFi failed, retrying...");
  }
}

void sendHeartbeat() {
  HTTPClient http;
  http.begin(heartbeatUrl);
  http.addHeader("Content-Type", "application/json");

  String ip = WiFi.localIP().toString();
  String payload = "{\"gateId\":\"" + String(gateId) + "\",\"secret\":\"" + String(secret) + "\",\"ipAddress\":\"" + ip + "\",\"firmwareVersion\":\"" + String(firmwareVersion) + "\"}";
  int httpCode = http.POST(payload);

  if (httpCode == HTTP_CODE_OK) {
    Serial.println("HEARTBEAT OK");
  } else {
    Serial.printf("HEARTBEAT error: %d\n", httpCode);
  }

  lastHeartbeatMillis = millis();
  http.end();
}

void sendUid(const String& uid) {
  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");

  String payload = "{\"uid\":\"" + uid + "\",\"gateId\":\"" + String(gateId) + "\",\"secret\":\"" + secret + "\"}";
  int httpCode = http.POST(payload);

  if (httpCode == HTTP_CODE_OK) {
    String response = http.getString();
    if (response.indexOf("OPEN") >= 0) {
      activateRelay();
    } else {
      Serial.println("ACCESS DENIED: " + response);
    }
  } else {
    Serial.printf("HTTP error: %d\n", httpCode);
  }

  http.end();
}

void activateRelay() {
  digitalWrite(relayPin, relayActiveLevel);
  delay(1000);
  digitalWrite(relayPin, relayIdleLevel);
  Serial.println("TRIPOD OPENED");
}
