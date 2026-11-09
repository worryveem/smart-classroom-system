# Database Layer — Prompt 2

## Flyway V6: hồ sơ cá nhân và mật khẩu

V6 thêm `users.full_name`, `email`, `phone`, `credentials_version`. Các bản ghi cũ nhận trường liên hệ rỗng và phiên bản 0; không thay mật khẩu hoặc vai trò đang có. Mỗi lần đổi/đặt lại mật khẩu tăng phiên bản để JWT cũ không còn hợp lệ. Xem [tài khoản cá nhân](tai-khoan-ca-nhan.md).

## Flyway V5: thông báo cá nhân

V5 tạo `app_notifications` với người nhận, loại sự kiện, nội dung, đường dẫn nội bộ, thời điểm tạo/đọc và chỉ mục theo người nhận/chưa đọc. Khóa ngoại tới `users` dùng ON DELETE CASCADE. Thông báo được ghi cùng giao dịch lịch/sự cố, không backfill quyết định cũ và không sửa các bảng IoT. Hợp đồng tại [lịch giáo viên và thông báo](lich-giao-vien-va-thong-bao.md).

## Flyway V4: hạn duyệt và cấu hình theo ca

V4 bổ sung `classroom_bookings.expires_at`, chỉ mục phục vụ hết hạn, trạng thái EXPIRED và bảng `classroom_booking_context` liên kết theo lịch. Không xóa lịch hoặc sửa các bảng IoT do Node-RED sử dụng. Lịch chờ cũ được tính hạn từ ngày tạo và giờ bắt đầu; tác vụ chạy sẽ đánh dấu lịch quá hạn. Lịch đã duyệt cũ không được gán cấu hình quá khứ suy đoán; báo cáo ghi rõ trường hợp chưa có bản cấu hình lưu. Quy tắc tại [luồng nghiệp vụ theo vai trò](luong-nghiep-vu-theo-vai-tro.md).

## Cập nhật schema nghiệp vụ Nhà A

V1 giữ bốn bảng IoT ban đầu. V2 bổ sung sáu bảng vận hành phòng. V3 tạo `classroom_rooms`, `classroom_room_events`, thêm khóa ngoại `room_id` cho dữ liệu nghiệp vụ, gán bản ghi cũ vào 101 và bổ sung `expected_attendees`. Migration không sinh dữ liệu cảm biến và không sửa bảng Node-RED đang dùng. Mô hình hiện tại và quy tắc dữ liệu tại [quản lý Nhà A](building-a.md).

## Cấu hình và khởi động Windows

MySQL cần chạy sẵn. Spring Boot tự tạo `smartclass_db` bằng Connector/J `createDatabaseIfNotExist=true`; không cài/khởi động MySQL server thay người dùng. Tài khoản cần quyền CREATE DATABASE khi database chưa có, cùng quyền DDL cho Flyway và đọc/ghi cho ứng dụng. Sai quyền hoặc kết nối làm startup thất bại với lỗi MySQL; không chuyển sang database khác.

Từ gốc workspace, mở PowerShell:

```powershell
cd backend
$env:DB_HOST = 'localhost'
$env:DB_PORT = '3306'
$env:DB_NAME = 'smartclass_db'
$env:DB_USERNAME = 'root'
$mysqlSecret = Read-Host 'MySQL password' -AsSecureString
$env:DB_PASSWORD = [System.Net.NetworkCredential]::new('', $mysqlSecret).Password
$env:JWT_SECRET = [Environment]::GetEnvironmentVariable('JWT_SECRET', 'User')
$env:SPRING_PROFILES_ACTIVE = 'local'
.\mvnw.cmd spring-boot:run
```

Không lưu mật khẩu MySQL thật vào repository. `backend/.env.example` là danh sách biến tham khảo; Spring Boot không tự đọc `.env`. Có thể dùng file `application-private.yml` bị ignore, dựa trên `application-local.yml.example`, với profiles `local,private`. `application-local.yml` được theo dõi vì chỉ chứa các mật khẩu development công khai; không đặt secret thật trong file này.

| Biến | Mặc định / ý nghĩa |
|---|---|
| DB_HOST | localhost |
| DB_PORT | 3306 |
| DB_NAME | smartclass_db |
| DB_USERNAME | root |
| DB_PASSWORD | Rỗng nếu chưa cung cấp; phải khớp tài khoản MySQL thực tế |
| DB_ALLOW_PUBLIC_KEY_RETRIEVAL | false; local mặc định true cho MySQL development |
| APP_SEED_ENABLED | false ngoài local, true trong local |
| SEED_ADMIN_PASSWORD | Bắt buộc khi tạo admin ngoài local; local có default development |
| SEED_TEACHER_PASSWORD | Tương tự cho teacher |
| SEED_STUDENT_PASSWORD | Tương tự cho student |

Nếu muốn dùng mật khẩu development mặc định thì để các biến `SEED_*` **chưa được đặt**, không đặt thành chuỗi rỗng. Chuỗi rỗng bị từ chối khi tạo tài khoản. Password BCrypt tối đa 72 byte UTF-8; Seeder từ chối giá trị dài hơn để tránh cắt ngầm.

Production không kích hoạt profile `local`. Seeder mặc định tắt; nếu bật để khởi tạo tài khoản, cung cấp cả ba mật khẩu riêng qua môi trường/secret manager, tuyệt đối không dùng mật khẩu development dưới đây. Sau khởi tạo có thể tắt Seeder.

## Tài khoản và thiết bị development

Chỉ profile `local` có mật khẩu mặc định:

| Username | Role | Mật khẩu development |
|---|---|---|
| admin | ADMIN | Admin@12345 |
| teacher | TEACHER | Teacher@12345 |
| student | STUDENT | Student@12345 |

Mật khẩu được hash BCrypt cost 12 trước khi lưu, không ghi plaintext vào DB hoặc log. Tài khoản được tạo ở Prompt 2; Login API/Authentication đã được bổ sung trong Prompt 3.

| device_id | room_id | type | status |
|---|---:|---|---|
| node1_sensor | 101 | SENSOR | Active |
| node2_actuator | 101 | ACTUATOR | Active |

Seeder là `CommandLineRunner` có transaction, tạo devices trước users, không tạo telemetry giả. Bản ghi tồn tại được bỏ qua, không reset mật khẩu, trạng thái hoặc cấu hình thiết bị. Cấu hình `APP_SEED_ENABLED=false` tắt Seeder. Không chạy đồng thời nhiều instance với Seeder khi bootstrap; triển khai bootstrap một instance rồi tắt Seeder ở các instance còn lại.

## Schema chung cho Spring Boot và Node-RED

Có đúng bốn bảng nghiệp vụ; Flyway tạo thêm bảng kỹ thuật `flyway_schema_history`.

| Bảng | Cột |
|---|---|
| users | id BIGINT PK AUTO_INCREMENT; username VARCHAR(50) NOT NULL UNIQUE; password_hash VARCHAR(255) NOT NULL; role ENUM(ADMIN,TEACHER,STUDENT) NOT NULL; created_at DATETIME DEFAULT CURRENT_TIMESTAMP |
| devices | device_id VARCHAR(50) PK; room_id INT NOT NULL; type ENUM(SENSOR,ACTUATOR) NOT NULL; mac_address VARCHAR(50) NULL; status ENUM(Active,Offline,Suspended) NOT NULL; created_at DATETIME DEFAULT CURRENT_TIMESTAMP |
| telemetry | id BIGINT PK AUTO_INCREMENT; device_id VARCHAR(50) FK NOT NULL; temp/humid/lux DOUBLE NULL; occupancy TINYINT(1) NULL; timestamp DATETIME DEFAULT CURRENT_TIMESTAMP |
| command_logs | id BIGINT PK AUTO_INCREMENT; device_id VARCHAR(50) FK NOT NULL; target/action VARCHAR(20) NOT NULL; trigger_by VARCHAR(50) NOT NULL; timestamp DATETIME DEFAULT CURRENT_TIMESTAMP |

Tất cả bảng InnoDB, `utf8mb4_unicode_ci`. Username có unique index, so sánh theo collation không phân biệt hoa/thường. Occupancy chỉ nhận NULL/0/1. Tên cột `timestamp` được quote bằng backtick trong DDL/JPA, kiểu thật là DATETIME, không phải TIMESTAMP.

Hai FK `device_id` tham chiếu `devices(device_id)`, `ON DELETE RESTRICT ON UPDATE CASCADE`. Không cascade xóa lịch sử. `trigger_by` không có FK tới users để chấp nhận `RULE_ENGINE`.

Index:

- `users`: unique `(username)`.
- `telemetry`: `(device_id)`, `(timestamp)`, `(device_id,timestamp)`.
- `command_logs`: `(device_id)`, `(timestamp)`, `(target)`, `(trigger_by)`, `(device_id,timestamp)`, `(target,timestamp)`, `(trigger_by,timestamp)`, `(target,trigger_by,timestamp)`.

Các cột khóa chính được index tự động. Command target/action giữ VARCHAR đúng hợp đồng; quy ước là FAN/LIGHT và ON/OFF, chưa thêm điều kiện ràng buộc ngoài yêu cầu để bảo toàn khả năng ghi trực tiếp.

## Migration và dữ liệu hiện có

Nguồn DDL chính thức: `backend/src/main/resources/db/migration/V1__create_initial_schema.sql`. Hibernate chỉ `ddl-auto=validate`; không create/update. Flyway `clean-disabled=true`, `baseline-on-migrate=false`, bật checksum validation.

Nếu database đã có bảng mà chưa có history Flyway: dừng, kiểm tra `SHOW CREATE TABLE`/dữ liệu/backup và lập phương án baseline/adoption riêng. Không tự baseline, không xóa bảng hoặc sửa migration đã áp dụng. Các thay đổi sau dùng V2/V3… Migration MySQL DDL có implicit commit; nếu lỗi giữa chừng cần kiểm tra trạng thái thực tế trước khi tiếp tục, không bật `ddl-auto=update` để né lỗi.

## Ánh xạ Entity và Repository

- `User`: role dùng `@Enumerated(STRING)`, passwordHash map `password_hash`.
- `Device`: type dùng ENUM; `DeviceStatusConverter` chuyển ACTIVE/OFFLINE/SUSPENDED thành Active/Offline/Suspended đúng hợp đồng.
- `Telemetry`: Double nullable, Boolean occupancy; Connector/J báo `TINYINT(1)` là BIT nên dùng mapping Boolean mặc định, không ép JDBC TINYINT.
- `CommandLog`: target/action String tương ứng VARCHAR; triggerBy map `trigger_by`.
- Quan hệ Device là LAZY ManyToOne một chiều, không cascade remove.
- DATETIME dùng LocalDateTime; giá trị thời gian mặc định do MySQL sinh và Hibernate đọc lại sau INSERT.
- Bốn repository dùng JpaRepository. Telemetry/command logs có truy vấn theo thiết bị, thời gian, target/người điều khiển và timestamp giảm dần; thêm id giảm dần để ổn định khi trùng giây. Khoảng thời gian `Between` bao gồm cả hai đầu.

## Thời gian và Unicode

Quy ước DATETIME là giờ Việt Nam. JDBC dùng `serverTimezone=Asia/Ho_Chi_Minh`; Hikari đặt mỗi session `time_zone='+07:00'`, Hibernate dùng `Asia/Ho_Chi_Minh`. Không ép tên timezone vào MySQL nên không cần nạp bảng timezone hệ thống. Node-RED cũng cần dùng session `+07:00` khi tích hợp; Prompt 2 không sửa flow/cấu hình Node-RED.

Connection collation được đặt utf8mb4; các bảng khai báo charset/collation riêng. Khi truyền timestamp thủ công, Node-RED cần truyền giờ Việt Nam nhất quán, không trộn UTC vào DATETIME.

## Câu INSERT tương thích Node-RED

Chạy sau khi Seeder hoàn tất; không có cột bắt buộc bổ sung:

```sql
INSERT INTO telemetry (device_id, temp, humid, lux, occupancy)
VALUES ('node1_sensor', 29.5, 71.0, 230, 1);

INSERT INTO command_logs (device_id, target, action, trigger_by)
VALUES ('node2_actuator', 'FAN', 'ON', 'RULE_ENGINE');
```

Node-RED ghi telemetry; Spring Boot đọc bằng JPA. Cả Node-RED và Spring Boot có thể ghi command_logs; cơ chế phối hợp để tránh ghi hai lần cùng lệnh sẽ được thiết kế ở giai đoạn điều khiển.

## Kiểm thử lặp lại

Với DB_USERNAME/DB_PASSWORD đã đặt trong phiên PowerShell, tại gốc workspace:

```powershell
.\backend\scripts\test-mysql.ps1
```

Script tạo database kiểm thử có tên `smartclass_verify_<GUID>` và các database phụ có hậu tố; không target `smartclass_db`, không DROP dữ liệu. Giữ các database kiểm thử để kiểm tra lại. Quyền CREATE DATABASE cần thiết.

Suite thực sự dùng MySQL: tự tạo database chưa có, Flyway, schema/index/FK, BCrypt, 3 users/2 devices, restart application hai lần, bảo toàn dữ liệu đã sửa, Seeder tắt, hai INSERT Node-RED, JPA đọc/ghi và kiểm tra thời gian/null/occupancy.

`mvnw.cmd clean verify` không có SMARTCLASS_MYSQL_TEST_URL chỉ chạy unit tests và báo SKIPPED cho hai test cần MySQL. Không được coi SKIPPED là kiểm tra database thành công. Không dùng H2 thay MySQL cho ENUM hoặc kiểu Boolean.

Tham khảo: [Connector/J charset](https://dev.mysql.com/doc/connector-j/en/connector-j-reference-charsets.html), [timezone session](https://dev.mysql.com/doc/connector-j/en/connector-j-connp-props-datetime-types-processing.html), [Hibernate mapping](https://docs.hibernate.org/orm/6.6/userguide/html_single/).

## Yêu cầu chạy sau Prompt 3

Backend nay cần JWT_SECRET hợp lệ ngay cả khi chỉ kiểm tra database. Thiết lập khóa ổn định theo [authentication.md](authentication.md). Account development đã có thể dùng login và /me; Seeder và schema không đổi. Script test-mysql.ps1 sử dụng khóa riêng chỉ trong test.
