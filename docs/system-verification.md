# Kiểm thử tích hợp SmartClass IoT

Ngày kiểm tra: 08/11/2026. Chưa xác nhận hoàn tất end-to-end với ESP32.

## Lỗi đã sửa

Dashboard từng nhận FAN/LIGHT/AUTO từ record mang `device_id` khác hoặc record theo khóa ID có định danh mâu thuẫn. Đã giới hạn ánh xạ theo đúng thiết bị cấu hình; trạng thái không xác định giữ nút điều khiển bị khóa. Hai kiểm thử hồi quy đã tái hiện lỗi trước khi sửa và đạt sau khi sửa. Không thay đổi API, schema, firmware hoặc flow.

## Phạm vi đã kiểm chứng

| Phạm vi | Kết quả |
|---|---|
| Backend `.\mvnw.cmd clean test` không cấu hình MySQL | 73 đạt, 20 bỏ qua do cần MySQL |
| `backend/scripts/test-mysql.ps1` → `clean verify` với MySQL 9.5 thật | 93 đạt, không bỏ qua; Flyway, JPA, khóa ngoại, Seeder, CRUD, JWT và lịch sử trên database riêng |
| Frontend `npm run build` sau sửa | Thành công |
| Chromium, gồm Backend thật và HTTP mock | 49 đạt qua hai lượt: 43 test dùng HTTP mock, 5 test đọc/đăng nhập với Backend thật và 1 test CRUD thật chạy riêng trên database kiểm thử |
| CRUD Users/Devices qua giao diện thật | Tạo/sửa/xóa đạt; PUT giữ mật khẩu khi không đổi, enum trạng thái khớp; chỉ dọn các bản ghi ngẫu nhiên do chính test tạo |
| HTTP thật tới Backend dùng database chính | Đăng nhập ba role, `/me`, JWT sai/thiếu, phân quyền, CORS, validation và truy vấn lịch sử đạt |
| JWT hết hạn qua HTTP | Backend tạm cổng 8081 phát token 3 giây; token hết hạn trả 401 |
| SQL → HTTP và React đọc API thật | SQL/API khớp định danh, nhiệt độ, độ ẩm, lux, occupancy và timestamp; React tải bản ghi/lịch sử có sẵn, bộ lọc và phân trang đạt. Ánh xạ từng ô và định dạng UTC+07 ở giao diện được kiểm tra bằng HTTP mock |
| Node-RED không kết nối được | State/Control trả 503; không thêm command log, không tự gửi lại |

Các kiểm thử ACK SUCCESS/ACCEPTED/FAILURE/TIMEOUT và ghi đúng một lịch sử dùng HTTP stub Node-RED; phần lưu trữ dùng MySQL thật. Kiểm thử giao diện về polling, payload FAN/LIGHT, loading/rỗng/lỗi, hết phiên và responsive dùng HTTP mock. Các kết quả này không chứng minh thiết bị vật lý hoặc flow thật hoạt động.

Database chính được kiểm tra chỉ đọc với Seeder tắt: 3 users, 2 devices, 1 telemetry và 1 command log `RULE_ENGINE`, Flyway V1. Không DROP database/bảng, không xóa lịch sử. Các database do suite tạo có tiền tố `smartclass_verify_` và được giữ lại.

Sau CRUD thật, database kiểm thử có sẵn vẫn giữ 3 users, 4 devices, 1 telemetry và 1 command log như trước khi chạy. Sau toàn bộ kiểm tra, dữ liệu và số bản ghi của database chính không đổi. Các tiến trình Backend/Vite tạm đã được dừng; dịch vụ MySQL hiện có được giữ nguyên.

## Phần chưa thể kiểm chứng thực tế

- Node-RED cổng 1880 và Mosquitto cổng 1883 không lắng nghe; workspace và thư mục `.node-red` mặc định không có flow để đối chiếu.
- Không có firmware ESP32 trong workspace hoặc kết nối phần cứng đã xác định. Chưa kiểm chứng MQTT topic/JSON, telemetry từ cảm biến, relay thực thi và ACK vật lý.
- Chưa xác minh chủ thể ghi log trong flow thật; Spring Boot ghi lệnh người dùng, Node-RED chỉ được ghi lệnh tự động với `trigger_by=RULE_ENGINE` để tránh trùng. Không tự sửa flow hoặc suy đoán hợp đồng ACK.
- AUTO hiện chỉ đọc từ State; chưa có API chuyển chế độ. Điều kiện Rule Engine thực tế vẫn cần kiểm tra khi có flow/thiết bị.

Khi Node-RED/Mosquitto và phần cứng sẵn sàng, cần đối chiếu flow với [hợp đồng tích hợp](nodered-integration.md), kiểm tra một mẫu cảm biến xuyên suốt và một lệnh điều khiển an toàn kèm ACK/số bản ghi lịch sử trước khi kết luận end-to-end đạt.
