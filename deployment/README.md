# Triển khai

1. Chạy MySQL 8 và Mosquitto, cấu hình broker trong mạng ESP32.
2. Chạy backend theo README gốc để Flyway tạo schema.
3. Cài Node-RED và `node-red-node-mysql`. Import một lần `node-red/SmartClass_Backend_Data.json` và `node-red/SmartClass_Backend_Control.json`.
4. Cấu hình MQTT và MySQL trong flow, sau đó Deploy.
5. Chạy AI tại `backend/ai-service/`, frontend tại `frontend/` và nạp sketch trong `firmware/`.

`SmartHome_Dashboard_AUTO_SETTINGS.json` là dashboard tham khảo; tránh import chồng flow gây trùng HTTP route hoặc ghi telemetry lặp. Khi sửa `.cjs`, cập nhật Function tương ứng trong JSON và chạy kiểm thử IoT.

Các lệnh, cổng và cấu hình chi tiết ở README gốc. `.env.example` là mẫu tham khảo, từng dịch vụ cần được cấp biến môi trường riêng.
