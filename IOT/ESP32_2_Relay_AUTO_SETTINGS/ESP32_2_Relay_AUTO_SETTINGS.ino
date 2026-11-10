// ESP32 #2: AUTO theo nhiet do/anh sang; nguong dieu chinh qua MQTT va luu NVS.
// Giu dung chan file goc: relay 25/26, UART RX32 / TX33 (TX khong can noi).
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Preferences.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>
#include <freertos/queue.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

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

const char *MQTT_CLIENT_ID = "smarthome-esp32-relay-01";
const char *MQTT_TOPIC_STATE = "smarthome/esp32/relay/state";
const char *MQTT_TOPIC_COMMAND = "smarthome/esp32/relay/cmd";

constexpr uint8_t RELAY_LIGHT = 25;
constexpr uint8_t RELAY_FAN = 26;
constexpr bool RELAY_ACTIVE_HIGH = true; // Doi false neu module kich muc LOW.
constexpr uint8_t RELAY_ON = RELAY_ACTIVE_HIGH ? HIGH : LOW;
constexpr uint8_t RELAY_OFF = RELAY_ACTIVE_HIGH ? LOW : HIGH;
constexpr uint8_t UART_RX = 32;
constexpr uint8_t UART_TX = 33;
constexpr uint32_t UART_BAUD = 9600;
constexpr uint32_t UART_TIMEOUT_MS = 5000;
constexpr uint32_t UART_PARTIAL_TIMEOUT_MS = 300;
// Mac dinh: quat bat khi T >35C, den AUTO tat khi do sang >=70%.
struct AutoSettings {
  float fanThresholdC = 35.0f;
  uint8_t lightOffPercent = 70;
  bool lightAdcHighIsBright = true;
  bool lightRequireMotion = true;
};
struct SettingsRecord {
  uint32_t magic;
  uint16_t version;
  uint16_t reserved;
  float fanThresholdC;
  uint8_t lightOffPercent;
  uint8_t highIsBright;
  uint8_t requireMotion;
  uint8_t padding;
};

enum class ControlMode : uint8_t { AUTO, MANUAL_ON, MANUAL_OFF };
enum class Command : uint8_t {
  LIGHT_ON, LIGHT_OFF, LIGHT_AUTO, FAN_ON, FAN_OFF, FAN_AUTO, ALL_AUTO, ALL_OFF, SETTINGS
};
struct CommandMessage {
  Command kind = Command::ALL_AUTO;
  AutoSettings settings;
  char commandId[33] = "";
};
struct RelayState {
  AutoSettings settings;
  bool settingsPersisted = false;
  bool settingsStorageOK = true;
  bool lightOn = false;
  bool fanOn = false;
  char ackId[33] = "";
  char ackTarget[6] = "";
  char ackAction[4] = "";
  bool uartOK = false;
  bool dhtOK = false;
  bool everReceived = false;
  ControlMode lightMode = ControlMode::AUTO;
  ControlMode fanMode = ControlMode::AUTO;
  float temperature = 0.0f;
  float humidity = 0.0f;
  uint8_t motion = 0;
  uint16_t ldrADC = 0;
  uint8_t lightPercent = 0;
  uint32_t lastPacketAt = 0;
  uint32_t packets = 0;
  uint32_t badPackets = 0;
  uint32_t revision = 1;
};

HardwareSerial SensorUART(2);
RelayState relay;
Preferences preferences;
bool preferencesReady = false;
QueueHandle_t stateQueue = nullptr;
QueueHandle_t commandQueue = nullptr;
char rxLine[100];
size_t rxLength = 0;
bool rxActive = false;
uint32_t lastRxByteAt = 0;
uint32_t lastSnapshotAt = 0;
uint32_t lastDebugAt = 0;

bool settingsEqual(const AutoSettings &a, const AutoSettings &b);
bool storeSettings(const AutoSettings &settings);
bool decodeSettingsCommand(const char *text, CommandMessage &request);
const char *modeText(ControlMode mode);
bool makeStateJSON(const RelayState &s, char *out, size_t capacity);

const char *modeText(ControlMode mode) {
  switch (mode) {
    case ControlMode::AUTO: return "AUTO";
    case ControlMode::MANUAL_ON: return "MANUAL_ON";
    case ControlMode::MANUAL_OFF: return "MANUAL_OFF";
  }
  return "UNKNOWN";
}

bool settingsEqual(const AutoSettings &a, const AutoSettings &b) {
  return fabsf(a.fanThresholdC - b.fanThresholdC) < 0.01f &&
         a.lightOffPercent == b.lightOffPercent &&
         a.lightAdcHighIsBright == b.lightAdcHighIsBright &&
         a.lightRequireMotion == b.lightRequireMotion;
}

void loadSettings() {
  preferencesReady = preferences.begin("room-auto", false);
  relay.settingsStorageOK = preferencesReady;
  if (!preferencesReady) {
    Serial.println("SETTINGS: NVS unavailable; using defaults");
    return;
  }
  SettingsRecord record{};
  if (preferences.getBytesLength("cfg") != sizeof(record) ||
      preferences.getBytes("cfg", &record, sizeof(record)) != sizeof(record)) return;
  if (record.magic != 0x524F4F4DU || record.version != 1 ||
      !isfinite(record.fanThresholdC) || record.fanThresholdC < 0.0f ||
      record.fanThresholdC > 60.0f || record.lightOffPercent > 100 ||
      record.highIsBright > 1 || record.requireMotion > 1) return;
  relay.settings.fanThresholdC = record.fanThresholdC;
  relay.settings.lightOffPercent = record.lightOffPercent;
  relay.settings.lightAdcHighIsBright = record.highIsBright == 1;
  relay.settings.lightRequireMotion = record.requireMotion == 1;
  relay.settingsPersisted = true;
  Serial.println("SETTINGS: loaded from NVS");
}

bool storeSettings(const AutoSettings &settings) {
  if (relay.settingsPersisted && settingsEqual(settings, relay.settings)) {
    relay.settingsStorageOK = preferencesReady;
    return preferencesReady;
  }
  SettingsRecord record{};
  record.magic = 0x524F4F4DU;
  record.version = 1;
  record.fanThresholdC = settings.fanThresholdC;
  record.lightOffPercent = settings.lightOffPercent;
  record.highIsBright = settings.lightAdcHighIsBright ? 1 : 0;
  record.requireMotion = settings.lightRequireMotion ? 1 : 0;
  bool saved = preferencesReady &&
      preferences.putBytes("cfg", &record, sizeof(record)) == sizeof(record);
  relay.settingsStorageOK = saved;
  if (!saved) {
    Serial.println("SETTINGS ERROR: NVS write failed; previous thresholds kept");
    return false;
  }
  relay.settings = settings;
  relay.settingsPersisted = true;
  Serial.printf("SETTINGS SAVED: fan>%.1fC; lightOff>=%u%%; ADC high=%u; PIR=%u\n",
      settings.fanThresholdC, (unsigned)settings.lightOffPercent,
      settings.lightAdcHighIsBright ? 1U : 0U, settings.lightRequireMotion ? 1U : 0U);
  return true;
}

uint8_t effectiveBrightness() {
  return relay.settings.lightAdcHighIsBright ? relay.lightPercent : 100U - relay.lightPercent;
}

void queueSnapshot() {
  if (stateQueue) xQueueOverwrite(stateQueue, &relay);
  lastSnapshotAt = millis();
}

void applyRelays() {
  bool dark = effectiveBrightness() < relay.settings.lightOffPercent;
  bool motionAllowed = !relay.settings.lightRequireMotion || relay.motion == 1;
  bool autoLight = relay.uartOK && dark && motionAllowed;
  bool autoFan = relay.uartOK && relay.dhtOK &&
                 relay.temperature > relay.settings.fanThresholdC;
  bool light = relay.lightMode == ControlMode::AUTO ? autoLight :
               relay.lightMode == ControlMode::MANUAL_ON;
  bool fan = relay.fanMode == ControlMode::AUTO ? autoFan :
             relay.fanMode == ControlMode::MANUAL_ON;
  if (light != relay.lightOn || fan != relay.fanOn) {
    relay.lightOn = light;
    relay.fanOn = fan;
    ++relay.revision;
    digitalWrite(RELAY_LIGHT, light ? RELAY_ON : RELAY_OFF);
    digitalWrite(RELAY_FAN, fan ? RELAY_ON : RELAY_OFF);
    Serial.printf("RELAY: den=%s quat=%s\n", light ? "ON" : "OFF", fan ? "ON" : "OFF");
  }
}

bool parseNumber(const char *field, float &value) {
  if (!field || !*field) return false;
  char *end = nullptr;
  errno = 0;
  value = strtof(field, &end);
  return end != field && *end == '\0' && errno != ERANGE && isfinite(value);
}

bool parseUnsigned(const char *field, unsigned int maximum, unsigned int &value) {
  if (!field || !*field) return false;
  unsigned long total = 0;
  for (const char *p = field; *p; ++p) {
    if (*p < '0' || *p > '9') return false;
    unsigned int digit = (unsigned int)(*p - '0');
    if (digit > maximum || total > (maximum - digit) / 10U) return false;
    total = total * 10U + digit;
  }
  value = (unsigned int)total;
  return true;
}

bool processPacket(const char *line) {
  // Phai du 6 truong, khong chap nhan thua truong / NaN / so ngoai mien.
  if (strncmp(line, "$DATA,", 6) != 0 || strlen(line) >= sizeof(rxLine)) return false;
  char copy[100];
  strcpy(copy, line + 6);
  char *fields[6];
  fields[0] = copy;
  for (int i = 0; i < 5; ++i) {
    char *comma = strchr(fields[i], ',');
    if (!comma) return false;
    *comma = '\0';
    fields[i + 1] = comma + 1;
  }
  if (strchr(fields[5], ',')) return false;
  float t, h;
  unsigned int m, valid, adc, percent;
  if (!parseNumber(fields[0], t) || !parseNumber(fields[1], h) ||
      !parseUnsigned(fields[2], 1, m) || !parseUnsigned(fields[3], 1, valid) ||
      !parseUnsigned(fields[4], 4095, adc) || !parseUnsigned(fields[5], 100, percent) ||
      t < -40.0f || t > 80.0f || h < 0.0f || h > 100.0f) return false;

  if (!relay.uartOK || relay.dhtOK != (valid == 1) || relay.motion != m) ++relay.revision;
  relay.temperature = t;
  relay.humidity = h;
  relay.motion = (uint8_t)m;
  relay.dhtOK = valid == 1;
  relay.ldrADC = (uint16_t)adc;
  relay.lightPercent = (uint8_t)percent;
  relay.lastPacketAt = millis();
  relay.everReceived = true;
  ++relay.packets;
  if (!relay.uartOK) Serial.println("UART OK: da nhan khung DATA hop le");
  relay.uartOK = true;
  // Khong apply relay tai day: kiem tra timeout voi millis() MOI sau pollUART().
  return true;
}

void pollUART() {
  // Loai frame bi dut giua chung. Khong dung readStringUntil() / delay cho UART.
  uint32_t now = millis();
  if (rxActive && (uint32_t)(now - lastRxByteAt) >= UART_PARTIAL_TIMEOUT_MS) {
    rxActive = false;
    rxLength = 0;
    ++relay.badPackets;
  }
  while (SensorUART.available() > 0) {
    char c = (char)SensorUART.read();
    lastRxByteAt = millis();
    if (c == '$') {
      if (rxActive && rxLength > 0) ++relay.badPackets;
      rxLength = 0;
      rxActive = true;
    }
    if (!rxActive || c == '\r') continue;
    if (c == '\n') {
      rxLine[rxLength] = '\0';
      if (!processPacket(rxLine)) ++relay.badPackets;
      rxActive = false;
      rxLength = 0;
    } else if (c < 32 || c > 126 || rxLength >= sizeof(rxLine) - 1) {
      rxActive = false;
      rxLength = 0;
      ++relay.badPackets;
    } else {
      rxLine[rxLength++] = c;
    }
  }
}

void checkUartTimeout() {
  // QUAN TRONG: doc millis() sau pollUART(), khong truyen vao moc now cu.
  uint32_t now = millis();
  if (relay.uartOK && (uint32_t)(now - relay.lastPacketAt) >= UART_TIMEOUT_MS) {
    relay.uartOK = false;
    ++relay.revision;
    Serial.println("UART TIMEOUT: >5s khong co DATA; AUTO OFF, MANUAL giu lenh");
  }
}

bool decodeSettingsCommand(const char *text, CommandMessage &request) {
  if (strncmp(text, "SETTINGS,", 9) != 0 || strlen(text) >= 80) return false;
  char copy[80];
  strcpy(copy, text + 9);
  char *fields[4];
  fields[0] = copy;
  for (int i = 0; i < 3; ++i) {
    char *comma = strchr(fields[i], ',');
    if (!comma) return false;
    *comma = '\0';
    fields[i + 1] = comma + 1;
  }
  if (strchr(fields[3], ',')) return false;
  float fan;
  unsigned int light, high, motion;
  if (!parseNumber(fields[0], fan) || fan < 0.0f || fan > 60.0f ||
      !parseUnsigned(fields[1], 100, light) ||
      !parseUnsigned(fields[2], 1, high) || !parseUnsigned(fields[3], 1, motion)) return false;
  request.kind = Command::SETTINGS;
  request.settings.fanThresholdC = roundf(fan * 10.0f) / 10.0f;
  request.settings.lightOffPercent = (uint8_t)light;
  request.settings.lightAdcHighIsBright = high == 1;
  request.settings.lightRequireMotion = motion == 1;
  return true;
}

void mqttCallback(char *topic, uint8_t *payload, unsigned int length) {
  if (strcmp(topic, MQTT_TOPIC_COMMAND) != 0 || length == 0 || length >= 80) return;
  // Khong cho payload co NUL an lenh o phan sau.
  for (unsigned int i = 0; i < length; ++i) if (payload[i] == 0) return;
  char text[80];
  memcpy(text, payload, length);
  text[length] = '\0';
  CommandMessage request;
  // CMD,<32 hex>,FAN_ON/FAN_OFF/LIGHT_ON/LIGHT_OFF: lenh co ACK doi chieu.
  if (strncmp(text, "CMD,", 4) == 0) {
    char *separator = strchr(text + 4, ',');
    if (!separator || separator - (text + 4) != 32) return;
    for (const char *p = text + 4; p < separator; ++p) {
      if (!((*p >= '0' && *p <= '9') || (*p >= 'a' && *p <= 'f'))) return;
    }
    const char *command = separator + 1;
    if (!strcmp(command, "FAN_ON")) request.kind = Command::FAN_ON;
    else if (!strcmp(command, "FAN_OFF")) request.kind = Command::FAN_OFF;
    else if (!strcmp(command, "LIGHT_ON")) request.kind = Command::LIGHT_ON;
    else if (!strcmp(command, "LIGHT_OFF")) request.kind = Command::LIGHT_OFF;
    else return;
    memcpy(request.commandId, text + 4, 32);
    request.commandId[32] = '\0';
    if (xQueueSend(commandQueue, &request, 0) != pdTRUE) Serial.println("MQTT: command queue full");
    return;
  }
  if (strncmp(text, "SETTINGS,", 9) == 0) {
    if (!decodeSettingsCommand(text, request)) {
      Serial.println("MQTT: invalid SETTINGS command");
      return;
    }
    if (xQueueSend(commandQueue, &request, 0) != pdTRUE) Serial.println("MQTT: command queue full");
    return;
  }
  Command &cmd = request.kind;
  if (!strcmp(text, "LIGHT_ON")) cmd = Command::LIGHT_ON;
  else if (!strcmp(text, "LIGHT_OFF")) cmd = Command::LIGHT_OFF;
  else if (!strcmp(text, "LIGHT_AUTO")) cmd = Command::LIGHT_AUTO;
  else if (!strcmp(text, "FAN_ON")) cmd = Command::FAN_ON;
  else if (!strcmp(text, "FAN_OFF")) cmd = Command::FAN_OFF;
  else if (!strcmp(text, "FAN_AUTO")) cmd = Command::FAN_AUTO;
  else if (!strcmp(text, "ALL_AUTO")) cmd = Command::ALL_AUTO;
  else if (!strcmp(text, "ALL_OFF")) cmd = Command::ALL_OFF;
  else { Serial.printf("MQTT: lenh khong hop le: %s\n", text); return; }
  // Callback mang chi gui lenh; loop UART la noi duy nhat ghi trang thai/relay.
  if (xQueueSend(commandQueue, &request, 0) != pdTRUE) Serial.println("MQTT: hang doi lenh day");
}

void handleCommands() {
  CommandMessage request;
  while (commandQueue && xQueueReceive(commandQueue, &request, 0) == pdTRUE) {
    // Backend tiep quan ca hai kenh, giu trang thai kenh khong duoc yeu cau.
    // Khong de AUTO firmware canh tranh voi luat backend.
    if (request.commandId[0]) {
      relay.lightMode = relay.lightOn ? ControlMode::MANUAL_ON : ControlMode::MANUAL_OFF;
      relay.fanMode = relay.fanOn ? ControlMode::MANUAL_ON : ControlMode::MANUAL_OFF;
    }
    relay.ackId[0] = '\0';
    relay.ackTarget[0] = '\0';
    relay.ackAction[0] = '\0';
    switch (request.kind) {
      case Command::LIGHT_ON: relay.lightMode = ControlMode::MANUAL_ON; break;
      case Command::LIGHT_OFF: relay.lightMode = ControlMode::MANUAL_OFF; break;
      case Command::LIGHT_AUTO: relay.lightMode = ControlMode::AUTO; break;
      case Command::FAN_ON: relay.fanMode = ControlMode::MANUAL_ON; break;
      case Command::FAN_OFF: relay.fanMode = ControlMode::MANUAL_OFF; break;
      case Command::FAN_AUTO: relay.fanMode = ControlMode::AUTO; break;
      case Command::ALL_AUTO:
        relay.lightMode = ControlMode::AUTO; relay.fanMode = ControlMode::AUTO; break;
      case Command::ALL_OFF:
        relay.lightMode = ControlMode::MANUAL_OFF; relay.fanMode = ControlMode::MANUAL_OFF; break;
      case Command::SETTINGS: storeSettings(request.settings); break;
    }
    if (request.commandId[0]) {
      // Chi ghi ACK sau khi da cap nhat GPIO, khong ACK khi moi xep hang doi.
      applyRelays();
      strcpy(relay.ackId, request.commandId);
      bool fan = request.kind == Command::FAN_ON || request.kind == Command::FAN_OFF;
      bool on = request.kind == Command::FAN_ON || request.kind == Command::LIGHT_ON;
      strcpy(relay.ackTarget, fan ? "FAN" : "LIGHT");
      strcpy(relay.ackAction, on ? "ON" : "OFF");
    }
    ++relay.revision;
  }
}

bool makeStateJSON(const RelayState &s, char *out, size_t capacity) {
  uint32_t now = millis();
  uint32_t age = s.everReceived ? (uint32_t)(now - s.lastPacketAt) : 0;
  bool fresh = s.uartOK && s.everReceived && age < UART_TIMEOUT_MS;
  char t[20] = "null", h[20] = "null", m[12] = "null";
  char adc[12] = "null", pct[12] = "null", ageText[20] = "null", bright[12] = "null";
  if (s.everReceived) snprintf(ageText, sizeof(ageText), "%lu", (unsigned long)age);
  if (fresh) {
    snprintf(m, sizeof(m), "%u", (unsigned)s.motion);
    snprintf(adc, sizeof(adc), "%u", (unsigned)s.ldrADC);
    snprintf(pct, sizeof(pct), "%u", (unsigned)s.lightPercent);
    unsigned brightness = s.settings.lightAdcHighIsBright ? s.lightPercent : 100U - s.lightPercent;
    snprintf(bright, sizeof(bright), "%u", brightness);
    if (s.dhtOK) {
      snprintf(t, sizeof(t), "%.1f", s.temperature);
      snprintf(h, sizeof(h), "%.1f", s.humidity);
    }
  }
  int n = snprintf(out, capacity,
      "{\"light_on\":%s,\"fan_on\":%s,\"light_mode\":\"%s\",\"fan_mode\":\"%s\","
      "\"uart_ok\":%s,\"dht_ok\":%s,\"temperature\":%s,\"humidity\":%s,\"motion\":%s,"
      "\"ldr_adc\":%s,\"light_percent\":%s,\"brightness_percent\":%s,\"uart_age_ms\":%s,"
      "\"uart_rx_packets\":%lu,\"uart_bad_packets\":%lu,\"uptime_ms\":%lu,\"rssi\":%d,"
      "\"settings_supported\":true,\"fan_threshold_c\":%.1f,\"light_off_percent\":%u,"
      "\"light_adc_high_is_bright\":%s,\"light_require_motion\":%s,"
      "\"settings_persisted\":%s,\"settings_storage_ok\":%s,"
      "\"command_ack_supported\":true,\"command_ack\":{\"id\":\"%s\",\"target\":\"%s\",\"action\":\"%s\"}}",
      s.lightOn ? "true" : "false", s.fanOn ? "true" : "false",
      modeText(s.lightMode), modeText(s.fanMode), fresh ? "true" : "false",
      (fresh && s.dhtOK) ? "true" : "false", t, h, m, adc, pct, bright, ageText,
      (unsigned long)s.packets, (unsigned long)s.badPackets, (unsigned long)now, WiFi.RSSI(),
      s.settings.fanThresholdC, (unsigned)s.settings.lightOffPercent,
      s.settings.lightAdcHighIsBright ? "true" : "false", s.settings.lightRequireMotion ? "true" : "false",
      s.settingsPersisted ? "true" : "false", s.settingsStorageOK ? "true" : "false",
      s.ackId, s.ackTarget, s.ackAction);
  return n > 0 && n < (int)capacity;
}

#define NETWORK_LOG(...) Serial.printf(__VA_ARGS__)

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
  if (!mqtt.setBufferSize(1280)) {
    NETWORK_LOG("MQTT: khong du bo nho cho buffer\n");
    vTaskDelete(nullptr);
    return;
  }
  mqtt.setCallback(mqttCallback);

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
          if (!mqtt.subscribe(MQTT_TOPIC_COMMAND, 1)) {
            NETWORK_LOG("MQTT: subscribe that bai, se ket noi lai\n");
            mqtt.disconnect();
          }
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
        RelayState snapshot{};
        if (mqtt.connected() && xQueuePeek(stateQueue, &snapshot, 0) == pdTRUE) {
          now = millis();
          bool changed = snapshot.revision != sentRevision;
          uint32_t elapsed = (uint32_t)(now - lastPublish);
          if (forcePublish || elapsed >= MQTT_INTERVAL_MS ||
              (changed && elapsed >= MQTT_MIN_INTERVAL_MS)) {
            char json[1024];
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
  digitalWrite(RELAY_LIGHT, RELAY_OFF);
  digitalWrite(RELAY_FAN, RELAY_OFF);
  pinMode(RELAY_LIGHT, OUTPUT);
  pinMode(RELAY_FAN, OUTPUT);
  digitalWrite(RELAY_LIGHT, RELAY_OFF);
  digitalWrite(RELAY_FAN, RELAY_OFF);
  Serial.begin(115200);
  loadSettings();
  SensorUART.setRxBufferSize(1024); // Phai goi truoc begin().
  SensorUART.begin(UART_BAUD, SERIAL_8N1, UART_RX, UART_TX);
  stateQueue = xQueueCreate(1, sizeof(RelayState));
  commandQueue = xQueueCreate(8, sizeof(CommandMessage));
  queueSnapshot();
  if (stateQueue && commandQueue) {
    if (xTaskCreatePinnedToCore(networkTask, "relay_mqtt", 6144,
                              nullptr, 1, nullptr, 0) != pdPASS) {
      Serial.println("LOI: khong tao duoc task MQTT; UART van hoat dong");
    }
  } else Serial.println("LOI: khong tao duoc queue; UART van hoat dong");
  Serial.println("ESP32 RELAY READY: RX32 9600 baud, relay25/26, AUTO");
}

void loop() {
  pollUART();
  checkUartTimeout(); // Tu lay millis() MOI sau khi cap nhat lastPacketAt.
  handleCommands();
  applyRelays();
  uint32_t now = millis();
  if ((uint32_t)(now - lastSnapshotAt) >= 100) queueSnapshot();
  if ((uint32_t)(now - lastDebugAt) >= 5000) {
    lastDebugAt = now;
    if (relay.everReceived) {
      Serial.printf("UART %s: age=%lu ms, rx=%lu, bad=%lu; den=%s quat=%s\n",
          relay.uartOK ? "OK" : "LOST", (unsigned long)(now - relay.lastPacketAt),
          (unsigned long)relay.packets, (unsigned long)relay.badPackets,
          relay.lightOn ? "ON" : "OFF", relay.fanOn ? "ON" : "OFF");
    } else Serial.println("UART WAIT: chua co DATA; kiem tra TX1 -> RX32 va GND chung");
  }
  delay(2);
}
