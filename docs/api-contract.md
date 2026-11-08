# Hợp đồng API

Sau Prompt 6, các API trong bảng bên dưới đã được triển khai. CRUD Users/Devices chỉ dành cho ADMIN; các API lịch sử yêu cầu JWT hợp lệ. Frontend chỉ gọi Spring Boot tại `http://localhost:8080`.

| Method | Đường dẫn | Mục đích |
|---|---|---|
| POST | /api/auth/login | Đăng nhập |
| GET | /api/auth/me | Người dùng hiện tại |
| GET | /api/state | Trạng thái phòng học |
| POST | /api/control | Gửi lệnh điều khiển |
| GET | /api/telemetry | Dữ liệu cảm biến |
| GET | /api/commands | Lịch sử lệnh |
| GET | /api/devices | Danh sách thiết bị |
| GET | /api/devices/{id} | Chi tiết thiết bị |
| POST | /api/devices | Tạo thiết bị |
| PUT | /api/devices/{id} | Cập nhật thiết bị |
| DELETE | /api/devices/{id} | Xóa thiết bị |
| GET | /api/users | Danh sách người dùng |
| GET | /api/users/{id} | Chi tiết người dùng |
| POST | /api/users | Tạo người dùng |
| PUT | /api/users/{id} | Cập nhật người dùng |
| DELETE | /api/users/{id} | Xóa người dùng |

## API nội bộ Node-RED hiện có

Base URL dự kiến: `http://localhost:1880`. Chỉ Spring Boot giao tiếp API này.

```text
GET  /smarthome/api/state
POST /smarthome/api/cmd
```

Một số flow có `POST /smarthome/api/command` thay cho `/cmd`. Khi tích hợp cần kiểm tra flow hiện tại và dùng đúng đường dẫn, không tự đổi tên API hoặc sửa flow. Prompt 1 chưa gọi hay kiểm chứng API Node-RED.

Chi tiết request/response và JWT của hai API Authentication xem [authentication.md](authentication.md). Các đường dẫn Node-RED vẫn giữ nguyên.

State/Control và cấu hình endpoint/ACK: [nodered-integration.md](nodered-integration.md).

CRUD Users/Devices, validation, phân trang và bảo vệ dữ liệu: [admin-api.md](admin-api.md).

## Truy vấn lịch sử

Hai API chỉ SELECT, không ghi dữ liệu lịch sử và không gọi Node-RED. Gửi `Authorization: Bearer <JWT>`; thiếu hoặc sai token trả 401. Lọc thiết bị không tồn tại hoặc không có dữ liệu trả 200 với danh sách rỗng.

`from`/`to` là thời gian ISO cục bộ, ví dụ `2026-11-01T00:00:00`, cùng quy ước giờ Việt Nam UTC+07:00 của cột MySQL `DATETIME`; không phải thời gian UTC. Có thể dùng riêng từng mốc; cả hai biên đều bao gồm. `from > to`, ngày giờ sai định dạng, chuỗi lọc trống/quá 50 ký tự và giới hạn không hợp lệ trả 400. Không tự cắt hoặc đổi múi giờ dữ liệu. Kết quả luôn có `timestamp`, sắp xếp `timestamp DESC, id DESC`.

### GET /api/telemetry

Tham số tùy chọn: `deviceId`, `from`, `to`, `limit` (mặc định 100, từ 1 đến 1000). SQL áp dụng giới hạn trực tiếp, không tải toàn bộ bảng vào bộ nhớ hoặc chạy COUNT. Kết quả có dạng:

```json
{
  "success": true,
  "message": "Success",
  "data": [
    {"id": 1, "device_id": "node1_sensor", "temp": 29.5, "humid": 71.0, "lux": 230.0, "occupancy": true, "timestamp": "2026-11-07T15:37:05"}
  ]
}
```

`occupancy` được ánh xạ từ MySQL 0/1 thành JSON boolean; các trường cảm biến có thể là `null`. Frontend đọc danh sách tại `data`.

### GET /api/commands

Tham số tùy chọn: `page` (mặc định 0, không âm), `size` (mặc định 20, từ 1 đến 100), `deviceId`, `target` (chính xác `FAN` hoặc `LIGHT`), `triggerBy`, `from`, `to`. Các bộ lọc kết hợp bằng AND; `triggerBy` lọc cùng một cột cho cả username và `RULE_ENGINE`, không thay thế danh tính JWT. So sánh chuỗi tuân theo collation MySQL hiện có. Offset `page * size` phải không vượt quá 2147483647.

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "content": [
      {"id": 1, "device_id": "node2_actuator", "target": "FAN", "action": "ON", "trigger_by": "RULE_ENGINE", "timestamp": "2026-11-07T15:37:05"}
    ],
    "page": 0,
    "size": 20,
    "totalElements": 1,
    "totalPages": 1
  }
}
```

Frontend đọc danh sách tại `data.content`, phân trang tại `data.page`, `data.size`, `data.totalElements`, `data.totalPages`. Trang vượt phạm vi trả `content: []` và giữ tổng số kết quả. Khi không có bản ghi, `totalElements` và `totalPages` đều bằng 0. Phân trang theo offset có thể dịch chuyển giữa các request nếu Node-RED ghi thêm dữ liệu mới.

### Kiểm chứng ngày 07/11/2026

Maven `clean verify` thành công: 80 test, không lỗi, không bỏ qua; kiểm thử lịch sử dùng database MySQL tách biệt. Đã đối chiếu JSON qua HTTP/JWT với 1 bản ghi telemetry và 1 bản ghi lệnh `RULE_ENGINE` hiện có trong `smartclass_db`, kể cả timestamp, bộ lọc và mã lỗi 400/401; dữ liệu lịch sử giữ nguyên sau kiểm tra. Ứng dụng kiểm tra HTTP tắt seeder và Flyway, sau đó đã dừng.

Chưa xác nhận được nguồn ghi từ flow Node-RED thực vì dịch vụ tại `localhost:1880` đang offline. Test sử dụng SQL theo hợp đồng bảng dùng chung để kiểm chứng cách Spring Boot đọc dữ liệu, không khẳng định đã kiểm tra flow thực.
