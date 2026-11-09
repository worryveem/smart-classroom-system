# Hợp đồng API

## Nhà A

API danh mục/tổng quan/bảo trì tại `/api/building/*` và các tham số `roomId`, `expectedAttendees` của nghiệp vụ phòng được mô tả trong [quản lý Nhà A](building-a.md#api). Chỉ phòng 101 có IoT; quyền điều khiển không được cấp từ lịch của phòng khác.

## Bổ sung vận hành phòng học

Các API `/api/classroom/*` được mô tả tại [vận hành phòng học](classroom-operations.md#api). `POST /api/control` giữ nguyên payload và response, tác động IoT phòng 101. ADMIN được điều khiển khi phòng hoạt động, TEACHER chỉ trong ca đã duyệt của mình tại 101, STUDENT bị từ chối. Phòng bảo trì/tạm ngưng chặn mọi vai trò. Kiểm tra tại Backend trước khi gửi tới Node-RED.

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
## Bổ sung metadata thiết bị theo phòng

`GET /api/iot/rooms/{roomId}` yêu cầu JWT và trả metadata phòng hiện có cùng mảng `devices`, gồm `device_id`, `type`, `status`. Danh sách chỉ chứa thiết bị có `room_id` trùng phòng đang chọn; không trả MAC hoặc thông tin tài khoản. Phòng không tồn tại trả 404.

`iotEnabled`, `sensorId`, `actuatorId` tiếp tục thể hiện luồng IoT đang được cấu hình. Một thiết bị nằm trong danh sách đăng ký không tự làm `iotEnabled=true`; quyền đọc State và điều khiển vẫn được kiểm tra tại Backend. Tổng quan tại `/dashboard` của Frontend sử dụng `GET /api/building/overview`, không tự đọc State phòng 101.
## Chính sách quyền và API nghiệp vụ cập nhật

- `GET /api/commands`: ADMIN xem toàn hệ thống; TEACHER chỉ xem lệnh của mình, kể cả khi truyền `triggerBy` khác; STUDENT nhận 403.
- `GET /api/classroom/workspace`: công việc theo người đăng nhập; ADMIN nhận lịch chờ duyệt, TEACHER nhận lịch của mình, STUDENT không có danh sách lịch cá nhân. Sự cố được giới hạn theo vai trò.
- `PUT /api/classroom/bookings/{id}`: sửa PENDING còn hạn, chỉ chủ lịch/ADMIN; giữ hạn duyệt cũ hoặc rút ngắn theo giờ bắt đầu mới.
- `GET /api/building/rooms/{id}/impact`: ADMIN xem các lịch bị ảnh hưởng bởi bảo trì/tạm ngưng.
- `PUT /api/building/rooms/{id}?cancelAffectedBookings=true`: xác nhận hủy lịch bị ảnh hưởng cùng giao dịch đổi trạng thái phòng; mặc định không có xác nhận sẽ trả 409 nếu tồn tại lịch.
- `GET /api/classroom/permission`: thêm `canAcknowledge` độc lập với `allowed` gửi lệnh. Backend kiểm tra lại khi xác nhận cảnh báo.
- `GET /api/iot/rooms/{id}`: thêm `incidentSummary` gồm thiết bị, trạng thái và tổng số báo cáo đang mở, không có mô tả/người báo.

Lịch trả thêm `expires_at`, có thể mang trạng thái EXPIRED. Chi tiết [vòng đời lịch và ma trận quyền](luong-nghiep-vu-theo-vai-tro.md).
## Lịch cá nhân và thông báo

`GET /api/teaching/bookings` và `GET /api/teaching/bookings/{id}` dành ADMIN/TEACHER, luôn giới hạn theo chủ lịch là tài khoản đang đăng nhập. Có bộ lọc khoảng ngày, phòng, trạng thái, quá khứ/sắp tới và phân trang.

`GET /api/notifications`, `GET /api/notifications/unread-count`, `PATCH /api/notifications/{id}/read` và `POST /api/notifications/read-all` dành mọi tài khoản đã xác thực, chỉ truy cập thông báo của chính tài khoản. Đánh dấu tất cả nhận `upToId` để giữ thông báo mới đến ở trạng thái chưa đọc.

`GET /api/classroom/bookings/{id}` dành ADMIN hoặc chủ lịch thuộc staff; `GET /api/classroom/incidents/{id}` dành ADMIN hoặc người báo. Các endpoint này phục vụ mở đúng bản ghi từ thông báo, không thay thế kiểm tra quyền.

Chi tiết tham số, phân trang và loại sự kiện tại [lịch giáo viên và thông báo trong ứng dụng](lich-giao-vien-va-thong-bao.md).
## Hồ sơ cá nhân và đổi mật khẩu

Các API yêu cầu JWT, chỉ áp dụng với tài khoản đang đăng nhập:

- GET `/api/account/profile`: trả `id`, `username`, `role`, `fullName`, `email`, `phone`, `createdAt`; không có hash hay phiên bản thông tin đăng nhập.
- PUT `/api/account/profile`: chỉ nhận `{fullName,email,phone}`; không cho đổi role, username hoặc ID qua API này.
- POST `/api/account/password`: nhận `{currentPassword,newPassword}`; sai mật khẩu hiện tại trả 400, đổi thành công trả 200 và mọi JWT cũ của tài khoản không còn hợp lệ ở request tiếp theo.

Quy tắc dữ liệu và phiên đăng nhập tại [tài khoản cá nhân](tai-khoan-ca-nhan.md).
