# Kiểm thử

Chạy từ gốc dự án:

```powershell
node --test tests/iot/SmartClass_Backend_Control.test.cjs tests/iot/LdrLuxEstimate.test.cjs
Push-Location backend
.\mvnw.cmd test
Pop-Location
Push-Location frontend
npm run build
npx playwright test
Pop-Location
Push-Location backend/ai-service
.venv\Scripts\python -m unittest -v test_app test_training test_anomaly_explanation
.venv\Scripts\python verify_models.py
Pop-Location
```

`iot/` kiểm tra ACK, trạng thái, ánh sáng và đồng bộ `.cjs` với Function trong JSON. Các kiểm thử framework giữ ở `backend/src/test/`, `frontend/tests/`, `backend/ai-service/test_*.py`.

Kịch bản thủ công: nạp hai ESP32; xác nhận MQTT; đối chiếu cảm biến và relay trên web; gửi lệnh theo quyền, kiểm tra ACK; ngắt MQTT để kiểm tra mất kết nối và tự động hóa dừng khi dữ liệu cũ. Cần phần cứng thực tế để xác nhận.

Kiểm thử MySQL cần database riêng có tiền tố `smartclass_verify_`. Playwright cần trình duyệt đã cài; API fixture không chứng minh thiết bị thật đang kết nối. Xem README gốc.
