// ESP32 #1: DHT + PIR + LDR -> UART -> ESP32 #2; MQTT doc lap.
// ESP32 thuong (ESP32 Dev Module), khong phai ESP32-S3.
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <DHT.h>

// Wi-Fi / MQTT theo anh cau hinh. Khong in mat khau ra Serial.
const char *WIFI_SSID = "LDT";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char *MQTT_HOST = "10.203.24.191";
constexpr uint16_t MQTT_PORT = 1883;
const char *MQTT_USER = "";
const char *MQTT_PASSWORD = "";
constexpr uint32_t WIFI_RETRY_MS = 10000;
constexpr uint32_t MQTT_RETRY_MS = 5000;
constexpr uint32_t MQTT_INTERVAL_MS = 2000;
constexpr uint32_t MQTT_MIN_INTERVAL_MS = 250;

const char *MQTT_CLIENT_ID = "smarthome-esp32-sensor-01";
const char *MQTT_TOPIC_STATE = "smarthome/esp32/sensor/state";

constexpr uint8_t DHT_PIN = 5;
constexpr uint8_t DHT_TYPE = DHT22; // Neu cam bien la DHT11, doi DHT22 -> DHT11.
constexpr uint8_t PIR_PIN = 4;
constexpr uint8_t LDR_PIN = 34; // ADC1; dau AO phai trong 0..3.3V.
constexpr uint8_t UART_RX = 3;  // Khong can noi RX cho truyen mot chieu.
constexpr uint8_t UART_TX = 1;  // Noi sang GPIO32 cua mach relay.
constexpr uint32_t UART_BAUD = 9600;
constexpr uint32_t UART_INTERVAL_MS = 500;
constexpr uint32_t DHT_INTERVAL_MS = 2000;
constexpr uint32_t LDR_INTERVAL_MS = 500;
constexpr uint32_t PIR_WARMUP_MS = 60000;

struct SensorState {
  float temperature = 0.0f;
  float humidity = 0.0f;
  bool dhtOK = false;
  bool pirReady = false;
  uint8_t motion = 0;
  uint16_t ldrADC = 0;
  uint8_t lightPercent = 0;
  uint32_t revision = 1;
  uint32_t uartTxPackets = 0;
};

SensorState sensor;
DHT dht(DHT_PIN, DHT_TYPE);
QueueHandle_t stateQueue = nullptr;
uint32_t startedAt = 0;
uint32_t lastDhtAt = 0;
uint32_t lastLdrAt = 0;
uint32_t lastUartAt = 0;
int lastSentMotion = -1;

// Khai bao ro cac ham dung kieu tu dinh nghia cho Arduino preprocessor.
bool makeStateJSON(const SensorState &s, char *out, size_t capacity);

void queueSnapshot() {
  if (stateQueue) xQueueOverwrite(stateQueue, &sensor);
}

void readDHT() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  bool ok = isfinite(t) && isfinite(h) && t >= -40.0f && t <= 80.0f &&
            h >= 0.0f && h <= 100.0f;
  if (ok != sensor.dhtOK || (ok && (t != sensor.temperature || h != sensor.humidity))) {
    ++sensor.revision;
  }
  sensor.dhtOK = ok;
  if (ok) { sensor.temperature = t; sensor.humidity = h; }
}

void readLDR() {
  uint32_t sum = 0;
  for (uint8_t i = 0; i < 16; ++i) {
    sum += analogRead(LDR_PIN);
    delayMicroseconds(200);
  }
  sensor.ldrADC = (uint16_t)(sum / 16U);
  sensor.lightPercent = (uint8_t)((uint32_t)sensor.ldrADC * 100U / 4095U);
  // Ty le ADC, khong phai lux; chieu sang/toi phu thuoc mach chia ap LDR.
}

void sendUART() {
  // Giu giao thuc cu: $DATA,T,H,M,DHT_OK,ADC,LIGHT_PERCENT\n
  // UART0 CHI gui DATA. Tuyet doi khong them Serial.print debug vao sketch nay.
  char frame[96];
  int n = snprintf(frame, sizeof(frame), "$DATA,%.1f,%.1f,%u,%u,%u,%u\n",
      sensor.temperature, sensor.humidity, (unsigned)sensor.motion,
      sensor.dhtOK ? 1U : 0U, (unsigned)sensor.ldrADC, (unsigned)sensor.lightPercent);
  if (n > 0 && n < (int)sizeof(frame)) {
    Serial.write((const uint8_t *)frame, (size_t)n);
    ++sensor.uartTxPackets;
  }
}

bool makeStateJSON(const SensorState &s, char *out, size_t capacity) {
  char t[20] = "null", h[20] = "null";
  if (s.dhtOK) {
    snprintf(t, sizeof(t), "%.1f", s.temperature);
    snprintf(h, sizeof(h), "%.1f", s.humidity);
  }
  int n = snprintf(out, capacity,
      "{\"temperature\":%s,\"humidity\":%s,\"dht_ok\":%s,"
      "\"motion\":%u,\"pir_ready\":%s,\"ldr_adc\":%u,\"light_percent\":%u,"
      "\"uart_tx_packets\":%lu,\"uptime_ms\":%lu,\"rssi\":%d}",
      t, h, s.dhtOK ? "true" : "false", (unsigned)s.motion,
      s.pirReady ? "true" : "false", (unsigned)s.ldrADC, (unsigned)s.lightPercent,
      (unsigned long)s.uartTxPackets, (unsigned long)millis(), WiFi.RSSI());
  return n > 0 && n < (int)capacity;
}

// Khong debug tren Serial vi GPIO1 dang truyen khung sang relay.
#define NETWORK_LOG(...) do {} while (0)

// Chi task nay duoc cham vao WiFiClient / PubSubClient.
// connect()/loop()/publish() co the cho mang; loop() UART van chay rieng.
void networkTask(void *) {
  WiFiClient client;
  PubSubClient mqtt(client);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setSocketTimeout(2);
  mqtt.setKeepAlive(15);
  if (!mqtt.setBufferSize(1024)) {
    NETWORK_LOG("MQTT: khong du bo nho cho buffer\n");
    vTaskDelete(nullptr);
    return;
  }
  

  uint32_t lastWifiAttempt = millis();
  uint32_t lastMqttAttempt = millis() - MQTT_RETRY_MS;
  uint32_t lastPublish = millis() - MQTT_INTERVAL_MS;
  uint32_t sentRevision = 0;
  bool forcePublish = true;
  bool wifiWasUp = false;

  for (;;) {
    uint32_t now = millis();
    if (WiFi.status() != WL_CONNECTED) {
      if (wifiWasUp) {
        client.stop();
        wifiWasUp = false;
        NETWORK_LOG("WIFI: mat ket noi, UART van hoat dong\n");
      }
      if ((uint32_t)(now - lastWifiAttempt) >= WIFI_RETRY_MS) {
        WiFi.reconnect();
        lastWifiAttempt = millis();
      }
    } else {
      if (!wifiWasUp) {
        wifiWasUp = true;
        NETWORK_LOG("WIFI CONNECTED: %s\n", WiFi.localIP().toString().c_str());
        lastMqttAttempt = millis() - MQTT_RETRY_MS;
      }
      if (!mqtt.connected() &&
          (uint32_t)(millis() - lastMqttAttempt) >= MQTT_RETRY_MS) {
        bool connected = strlen(MQTT_USER) > 0
            ? mqtt.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASSWORD)
            : mqtt.connect(MQTT_CLIENT_ID);
        lastMqttAttempt = millis(); // Lay lai moc SAU loi goi co the block.
        if (connected) {
          
          if (mqtt.connected()) {
            forcePublish = true;
            NETWORK_LOG("MQTT CONNECTED: %s:%u\n", MQTT_HOST, MQTT_PORT);
          }
        } else {
          NETWORK_LOG("MQTT CONNECT FAIL: %d (UART khong bi dung)\n", mqtt.state());
        }
      }
      if (mqtt.connected()) {
        mqtt.loop();
        SensorState snapshot{};
        if (mqtt.connected() && xQueuePeek(stateQueue, &snapshot, 0) == pdTRUE) {
          now = millis();
          bool changed = snapshot.revision != sentRevision;
          uint32_t elapsed = (uint32_t)(now - lastPublish);
          if (forcePublish || elapsed >= MQTT_INTERVAL_MS ||
              (changed && elapsed >= MQTT_MIN_INTERVAL_MS)) {
            char json[768];
            if (makeStateJSON(snapshot, json, sizeof(json)) &&
                mqtt.publish(MQTT_TOPIC_STATE, json, false)) {
              lastPublish = millis();
              sentRevision = snapshot.revision;
              forcePublish = false;
            }
          }
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void setup() {
  Serial.begin(UART_BAUD, SERIAL_8N1, UART_RX, UART_TX);
  pinMode(PIR_PIN, INPUT);
  pinMode(LDR_PIN, INPUT);
  dht.begin();
  analogReadResolution(12);
  analogSetPinAttenuation(LDR_PIN, ADC_11db);
  readLDR();
  startedAt = millis();
  lastDhtAt = startedAt;
  lastLdrAt = startedAt;
  lastUartAt = startedAt;
  stateQueue = xQueueCreate(1, sizeof(SensorState));
  queueSnapshot();
  // Loi cap phat task mang khong duoc lam dung UART/cam bien.
  if (stateQueue) xTaskCreatePinnedToCore(networkTask, "sensor_mqtt", 6144,
                                        nullptr, 1, nullptr, 0);
}

void loop() {
  uint32_t now = millis();
  bool ready = (uint32_t)(now - startedAt) >= PIR_WARMUP_MS;
  uint8_t motion = (ready && digitalRead(PIR_PIN) == HIGH) ? 1 : 0;
  if (ready != sensor.pirReady || motion != sensor.motion) ++sensor.revision;
  sensor.pirReady = ready;
  sensor.motion = motion;

  if ((uint32_t)(now - lastDhtAt) >= DHT_INTERVAL_MS) {
    readDHT();
    lastDhtAt = millis();
  }
  // readDHT() co the mat thoi gian: lay lai now truoc cac phep tru.
  now = millis();
  if ((uint32_t)(now - lastLdrAt) >= LDR_INTERVAL_MS) {
    readLDR();
    lastLdrAt = millis();
  }
  now = millis();
  if ((uint32_t)(now - lastUartAt) >= UART_INTERVAL_MS ||
      (int)sensor.motion != lastSentMotion) {
    sendUART();
    lastUartAt = millis();
    lastSentMotion = sensor.motion;
    queueSnapshot();
  }
  delay(2);
}
