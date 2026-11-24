# Firmware ESP32

- `ESP32_1_Sensors_MQTT/`: DHT22, PIR, LDR; gửi MQTT và UART.
- `ESP32_2_Relay_AUTO_SETTINGS/`: relay quạt/đèn, cấu hình NVS và ACK.

Mở sketch `.ino` cùng tên thư mục bằng Arduino IDE; chọn ESP32 Dev Module. Cài ESP32 core, PubSubClient, DHT sensor library và phụ thuộc mà Arduino IDE yêu cầu. WiFi và Preferences thuộc ESP32 core.

Cấu hình Wi-Fi và broker trực tiếp trong sketch trước khi nạp; Arduino không tự đọc `.env`. Xem `../hardware/README.md` cho chân nối. Chưa hỗ trợ OTA.
