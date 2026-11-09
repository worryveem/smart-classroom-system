# Chế độ tự động quạt và đèn

Trang `/automation` dành cho ADMIN và TEACHER, áp dụng chung cho phòng 101, là phòng duy nhất hiện có luồng IoT. Mặc định tắt. Cấu hình được lưu trong MySQL; tác vụ backend hoạt động kể cả khi đóng trình duyệt.

## Quy tắc điều khiển

- Khi có chuyển động: bật quạt từ 30°C, tắt từ 28°C trở xuống; bật đèn từ 150 lux trở xuống, tắt từ 250 lux. Có thể chỉnh các ngưỡng trên trang.
- Giữa hai ngưỡng: giữ nguyên, không phát lệnh. Mỗi thiết bị cách nhau ít nhất 60 giây giữa hai lần đổi trạng thái.
- Khi không có chuyển động: chỉ tắt cả quạt và đèn sau chuỗi mẫu PIR liên tục đủ thời gian cấu hình, mặc định 300 giây, cho phép 60–3600 giây. Khoảng cách mẫu tối đa 60 giây; mẫu thiếu PIR hoặc có chuyển động làm gián đoạn chuỗi.
- PIR không đo số người. Người ngồi yên có thể không được phát hiện; cần chọn thời gian chờ phù hợp và thử nghiệm thực tế.
- Dùng ngưỡng rõ ràng cho điều khiển; hai model Python thử nghiệm không tham gia quyết định bật/tắt.

## Quyền và trạng thái dừng

Admin được quản lý phòng đang hoạt động; giáo viên cần lịch đã duyệt của mình đang diễn ra tại phòng 101. STUDENT bị chặn ở cả route và API. Tác vụ kiểm tra lại tài khoản, quyền và thiết bị trước khi điều khiển. Khi hết quyền, dừng tự động và giữ nguyên trạng thái thiết bị.

Mẫu cảm biến phải mới trong 60 giây, nhiệt độ/ánh sáng/PIR đầy đủ, thời gian không ở tương lai. Phòng bảo trì, cấu hình thiết bị sai, dữ liệu cũ, yêu cầu Node-RED lỗi hoặc kết quả khác SUCCESS khiến chế độ dừng. Lệnh lỗi không tự gửi lại; cần kiểm tra thiết bị rồi chủ động bật lại.

Tắt tự động không gửi lệnh OFF ngay; thiết bị giữ nguyên trạng thái và trở lại điều khiển thủ công. Khi tự động bật, endpoint thủ công bị chặn. Trang thiết bị hiển thị chế độ lấy từ backend, khóa nút thủ công và liên kết tới cấu hình. Cờ AUTO riêng của Node-RED/ESP không phải nguồn cấu hình này; cần tắt quy tắc tự động độc lập trong flow/firmware để tránh hai bộ điều khiển cạnh tranh.

## API và dữ liệu

GET `/api/automation` trả cấu hình, enabled, canConfigure, permissionReason, message, checked_at và lệnh xác nhận gần nhất. Đây không phải chứng nhận trạng thái vật lý hiện tại của relay.

PUT `/api/automation` nhận:

```json
{"enabled": true, "fanOn": 30, "fanOff": 28, "lightOn": 150, "lightOff": 250, "emptySeconds": 300}
```

Ngưỡng tắt quạt phải nhỏ hơn ngưỡng bật, ngưỡng bật đèn nhỏ hơn ngưỡng tắt. Backend kiểm tra giới hạn và quyền khi lưu. Giáo viên hết ca được xem nhưng không thay cấu hình.

Migration V8 tạo room_automation và một bản ghi tắt cho phòng 101. Giữ nguyên V7 và API `/api/ai/settings` cũ để không thay checksum hoặc xóa dữ liệu đã triển khai; API cũ chỉ lưu lựa chọn gợi ý, không điều khiển phần cứng và không được trang này sử dụng.

Scheduler kiểm tra mỗi 30 giây, sau 15 giây từ lúc khởi động. Tắt bằng app.automation.scheduler-enabled=false; thay chu kỳ bằng app.automation.interval-ms. Cần ít nhất hai kết nối trong pool: một giữ MySQL named lock, một dùng truy vấn/ghi. Khóa gắn database và phòng, ngăn tác vụ, cấu hình và lệnh thủ công cạnh tranh giữa các backend. Không giữ transaction khi chờ HTTP. Yêu cầu gặp khóa bận trả lỗi để thử lại.

Trước khi gửi lệnh lưu in_flight=true; nếu backend gián đoạn trước khi ghi kết quả, lượt sau dừng thay vì gửi lặp. Node-RED phải trả ACK đủ device_id, target, action và msg: SUCCESS. Audit hiện có ghi lệnh với trigger_by=RULE_ENGINE. Nếu ACK hoặc audit không hoàn tất, dừng và yêu cầu kiểm tra.

Không gửi lại trạng thái đã xác nhận gần nhất. Chưa đối chiếu relay với State ở mỗi lượt; nếu ESP khởi động lại hoặc có nguồn điều khiển ngoài backend, cần đối chiếu thực tế rồi tắt/bật lại chế độ.

## Chạy và kiểm thử

Khởi động backend để Flyway áp dụng V8, chạy frontend và mở mục Chế độ tự động. Chỉ bật khi Node-RED, MQTT, ESP và telemetry đã nối đúng thiết bị phòng 101. Phần triển khai này không tự bật chế độ trên hệ thống thật.

```powershell
cd frontend
npm run build
$env:SMARTCLASS_BROWSER_CHANNEL='msedge'
npx playwright test tests/automation.spec.js
```

Kiểm thử giao diện dùng HTTP mock. Backend kiểm tra ngưỡng, cooldown, dữ liệu cũ, quyền hết hạn, chuỗi PIR, lệnh chưa xác nhận và chặn lệnh thủ công. Chưa xác minh phần cứng và migration V8 trên MySQL đang chạy; kiểm thử giả không thay thế kiểm tra thực tế.

Kết quả ngày 09/11/2026: frontend build đạt; 29 kiểm thử backend liên quan đạt. Bảy kiểm thử trang tự động đạt trên Edge. Bộ hồi quy dashboard có 12 kiểm thử khác đạt, một kiểm thử lấy chế độ từ backend đạt sau khi cập nhật fixture theo hợp đồng mới, và một kiểm thử kết nối backend thật được bỏ qua vì chưa cấu hình môi trường tích hợp.
