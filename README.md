# SmartClass IoT

Đã mở rộng **Nhà A** tại `/building`: 3 tầng, 15 phòng, trạng thái theo lịch, tìm phòng trống, sức chứa, bảo trì và tỷ lệ đặt lịch. Chỉ phòng **101** có ESP thật; phòng khác không tạo chỉ số giả. Mỗi phòng có lịch, báo cáo và sự cố tại `/classroom?roomId=...`. Giáo viên chỉ điều khiển ESP khi có ca đã duyệt ở 101. Khởi động lại Backend để áp dụng Flyway V3. Xem [quản lý Nhà A](docs/building-a.md) và [nghiệp vụ phòng](docs/classroom-operations.md).

Hệ thống IoT Phòng học Thông minh: ESP32, Mosquitto, Node-RED, Spring Boot BFF và React SPA.

```text
ESP32 --MQTT--> Mosquitto --> Node-RED <--HTTP nội bộ--> Spring Boot <--REST/JSON--> React
                                |                          |
                                +-------- MySQL -----------+
```

React chỉ gọi Spring Boot. Đã có API login, /me và JWT; State & Control qua Node-RED; truy vấn Telemetry và lịch sử lệnh từ MySQL. Xem điều kiện tích hợp thực trong tài liệu.

| Thành phần | Công nghệ | Port |
|---|---|---|
| Backend | Java 17, Spring Boot 3.5.9, Maven Wrapper 3.9.10 | 8080 |
| Frontend | React 19, Vite 7, React Router DOM 7, TailwindCSS 4 | 5173 |
| Database | MySQL, smartclass_db, Flyway, JPA validate | 3306 |
| MQTT Broker | Mosquitto | 1883 |
| Middleware | Node-RED | 1880 |

## Cấu trúc và tài liệu

- `backend/`: giữ package `iot.iot`, lớp `IotApplication`, Maven coordinates `cyber:cyber` từ project ban đầu; bổ sung Database Layer.
- `frontend/`: SPA theo feature với Login, Dashboard, History và Admin.
- `docs/`: [kiến trúc](docs/architecture.md), [cấu trúc thư mục](docs/directory-structure.md), [API dự kiến](docs/api-contract.md), [Database Layer và cấu hình](docs/database.md).
- `target/` ở gốc: build output cũ được giữ lại, không dùng cho build mới.

Backend có Web, Data JPA, MySQL Connector/J, Validation, Test, Flyway Core/MySQL, spring-security-crypto dùng BCrypt. Profile `future-integrations` bảo tồn các dependency cũ, chưa kích hoạt. Đã bổ sung Spring Security 6.5.11 và JJWT 0.13.0 ở Prompt 3; dependency ngoài phạm vi còn lại giữ trong profile future-integrations.

## Chạy Backend trên Windows

Cần JDK 17, MySQL đang chạy và tài khoản có quyền tạo database/schema. Từ gốc workspace:

```powershell
cd backend
$env:DB_USERNAME = 'root'
$mysqlSecret = Read-Host 'MySQL password' -AsSecureString
$env:DB_PASSWORD = [System.Net.NetworkCredential]::new('', $mysqlSecret).Password
# Thiết lập JWT_SECRET một lần theo docs/authentication.md trước khi chạy.
$env:JWT_SECRET = [Environment]::GetEnvironmentVariable('JWT_SECRET', 'User')
$env:SPRING_PROFILES_ACTIVE = 'local'
.\mvnw.cmd spring-boot:run
```

Ứng dụng tạo database nếu chưa có, chạy Flyway, validate Entity rồi seed trong profile local. Không tạo lại/xóa dữ liệu hiện có. `/` không có Controller; request chưa đăng nhập nhận 401 từ Security.

Chỉ môi trường local có tài khoản development:

| Username | Role | Mật khẩu development |
|---|---|---|
| admin | ADMIN | Admin@12345 |
| teacher | TEACHER | Teacher@12345 |
| student | STUDENT | Student@12345 |

Có thể thay bằng SEED_ADMIN_PASSWORD, SEED_TEACHER_PASSWORD, SEED_STUDENT_PASSWORD. Seeder bỏ qua bản ghi đã tồn tại, không reset mật khẩu hoặc cấu hình thiết bị. Hai thiết bị mặc định: `node1_sensor` và `node2_actuator`, phòng 101, trạng thái Active.

Production không kích hoạt local và không dùng các mật khẩu development. Ngoài local, Seeder mặc định tắt; bật qua APP_SEED_ENABLED=true thì cần cung cấp mật khẩu cho tài khoản chưa tồn tại. DB_HOST/DB_PORT/DB_NAME mặc định localhost/3306/smartclass_db. Không lưu mật khẩu thật vào Git. `.env.example` chỉ là mẫu tham khảo, Spring Boot không tự nạp.

## Kiểm thử Backend

Từ gốc workspace, với DB_USERNAME/DB_PASSWORD đã đặt:

```powershell
.\backend\scripts\test-mysql.ps1
```

Suite dùng các database MySQL mới có tiền tố `smartclass_verify_<GUID>`, kiểm tra migration, mapping, SQL theo hợp đồng Node-RED, restart/Seeder, API và phân quyền. Không xóa database hiện có. `mvnw.cmd clean test` không có cấu hình integration sẽ bỏ qua 20 test cần MySQL; các test JWT/Security vẫn chạy. Xem [tài liệu database](docs/database.md).

## Chạy Frontend trên Windows

Cần Node.js `^20.19.0 || >=22.12.0`, npm. Mở PowerShell tại gốc workspace:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Mở http://localhost:5173. Nếu cổng bận, dùng tạm `npm run dev -- --port 5174` và thêm origin tương ứng vào `CORS_ALLOWED_ORIGINS` của Backend. Frontend gọi API Spring Boot tại 8080. Các route: `/login`, `/building`, `/classroom?roomId=101`, `/dashboard`, `/history`, `/admin`. Trang gốc mở Nhà A; Dashboard chỉ theo dõi IoT phòng 101.

```powershell
npm run build
```

Khi host SPA, cấu hình fallback URL về index.html. Không đặt secret vào biến VITE_*.

## Trạng thái

Prompt 1: cấu trúc Backend/Frontend, placeholder routes và tài liệu đã hoàn thành, Maven/Vite/Chromium đã kiểm tra.

Prompt 2: Flyway schema bốn bảng, Entity/Repository, BCrypt và Seeder. Xem [báo cáo kiểm thử](docs/database-verification.md) để biết kết quả thực tế.

Prompt 3: đã triển khai JWT, Login API, /me và phân quyền. Xem [Authentication](docs/authentication.md) và [báo cáo kiểm thử](docs/authentication-verification.md).

Prompt 4: đã bổ sung GET /api/state, POST /api/control và Node-RED HTTP client/audit. Cấu hình và giới hạn xác minh thực: [Node-RED integration](docs/nodered-integration.md).

Prompt 5: đã bổ sung GET /api/telemetry và GET /api/commands, hỗ trợ lọc thời gian/thiết bị, giới hạn telemetry và phân trang lịch sử lệnh. Cả hai yêu cầu JWT, chỉ đọc MySQL. Tham số và response: [hợp đồng API](docs/api-contract.md#truy-vấn-lịch-sử).

Prompt 6: đã bổ sung CRUD Users/Devices dành riêng cho ADMIN, phân trang/bộ lọc, bảo vệ ADMIN cuối cùng và lịch sử thiết bị. Xem [API quản trị](docs/admin-api.md). JWT trước Prompt 6 cần đăng nhập lại để có claim ID tài khoản.

Frontend đã có giao diện Login, AuthContext, JWT interceptor, kiểm tra phiên khi tải lại, Logout và route theo role. Xem [xác thực Frontend](docs/frontend-authentication.md). Chạy `npm test` trong `frontend/` để kiểm tra trình duyệt; các test Backend thật cần biến môi trường tài khoản test.

Prompt 8: Dashboard có thẻ cảm biến, polling State, biểu đồ Telemetry và điều khiển FAN/LIGHT qua Spring Boot. AUTO chỉ đọc. Xem [Dashboard và giới hạn tích hợp thực](docs/dashboard.md).

History đã có bảng Telemetry/Commands, bộ lọc riêng từng tab, phân trang Commands tại Backend, validation, trạng thái lỗi và bảng cuộn mobile. Xem [trang History](docs/history.md).

Prompt 10: Frontend Admin có CRUD Users/Devices, tìm kiếm/bộ lọc, phân trang, form thêm/sửa và xác nhận xóa dành riêng ADMIN. Xem [Frontend Admin](docs/frontend-admin.md); test CRUD thật chỉ chạy với database kiểm thử tách biệt đã cấu hình.

Prompt 11: đã kiểm tra tích hợp Backend/Frontend/MySQL và sửa ánh xạ State sai thiết bị. Kết quả và giới hạn xác minh: [kiểm thử hệ thống](docs/system-verification.md). Chưa xác minh luồng IoT vật lý vì Node-RED/Mosquitto không khả dụng; workspace không có flow hoặc firmware ESP32. Không sửa các thành phần này. Workspace chưa có `.git`, không thể so sánh với lịch sử commit.
