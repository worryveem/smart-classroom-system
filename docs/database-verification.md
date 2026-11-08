# Báo cáo kiểm thử Database Layer — 07/11/2026

## Môi trường và kiểm tra ban đầu

- Workspace kế thừa Prompt 1, Java 17.0.12, Spring Boot 3.5.9, Maven Wrapper 3.9.10, package `iot.iot`.
- MySQL Community Server 9.5.0 đã chạy tại localhost:3306.
- Dependency do Spring Boot quản lý: Flyway Core/MySQL 11.7.2 và spring-security-crypto 6.5.7.
- Trước khi thay đổi: `smartclass_db` chưa tồn tại, không có bảng hoặc Flyway history trong database này. Tài khoản được cấp có quyền CREATE DATABASE/DDL.
- Không lưu thông tin đăng nhập MySQL thật trong repository; chỉ truyền qua môi trường tiến trình.
- Workspace chưa là Git repository, không có baseline commit để so sánh. Không sửa Frontend/ESP32/Node-RED/Mosquitto.

## Kết quả thực tế

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| MySQL Connection | PASS | Kết nối MySQL 9.5.0 localhost:3306 |
| Database Auto Creation | PASS | Database chưa có trước startup, Connector/J tạo smartclass_db |
| Flyway Migration | PASS | V1 applied, history success=1; lần chạy sau up to date |
| 4 Tables Created | PASS | SHOW TABLES/DESCRIBE: users, devices, telemetry, command_logs; thêm bảng kỹ thuật Flyway |
| Foreign Keys | PASS | Hai FK device_id, DELETE RESTRICT, UPDATE CASCADE; thử xóa thiết bị có lịch sử bị từ chối |
| Indexes | PASS | Kiểm tra PK/username unique và toàn bộ index đơn/composite qua information_schema |
| BCrypt Password | PASS | 3 hash định dạng $2a$12$; integration dùng BCrypt.matches kiểm tra với password development |
| 3 Users Seeder | PASS | admin/ADMIN, teacher/TEACHER, student/STUDENT |
| 2 Devices Seeder | PASS | node1_sensor/SENSOR, node2_actuator/ACTUATOR; phòng 101, Active |
| Seeder Idempotency | PASS | Hai startup đầy đủ; không tăng số lượng; kiểm tra hash không đổi. Integration sửa cấu hình/password rồi restart và xác nhận không ghi đè |
| Node-RED INSERT Compatibility | PASS | Hai SQL mẫu chạy trực tiếp thành công; mặc định timestamp hoạt động |
| JPA Entity Mapping | PASS | Hibernate validate; JPA SELECT đủ bốn Entity; đọc SQL telemetry/command logs và ghi command log qua JPA |
| Maven Build | PASS | clean verify, 6 tests, 0 failures, 0 errors, 0 skipped |

## Phạm vi dữ liệu kiểm thử

- Chạy suite bằng `backend/scripts/test-mysql.ps1` trên MySQL 3306, tạo database tách biệt `smartclass_verify_<GUID>`; không thay thế MySQL bằng H2.
- Integration chạy ứng dụng hai lần trên cùng database, lần nữa với Seeder tắt trên database trống khác; kiểm tra nullable telemetry, occupancy true/false/null, thời gian, repository filters, FK/unique và dữ liệu sau restart.
- Trên `smartclass_db`: chạy JAR hai lần ở profile local, xác nhận migration/seed thực tế; thực thi đúng hai INSERT mẫu bằng mysql CLI.
- Giữ lại 1 telemetry mẫu và 1 command log mẫu trong smartclass_db theo yêu cầu kiểm thử. Không tạo telemetry bằng Seeder.
- Các database kiểm thử được giữ lại, không chạy DROP DATABASE/DROP TABLE và không xóa dữ liệu cũ.

## Cảnh báo thực tế

1. Flyway do Spring Boot 3.5.9 quản lý cảnh báo MySQL 9.5 mới hơn phiên bản được nó công bố kiểm thử. Migration, validate và restart đã chạy thành công trên MySQL 9.5.0; vẫn cần đánh giá nâng Flyway trong một thay đổi riêng trước production.
2. MySQL cảnh báo integer display width bị deprecated do hợp đồng yêu cầu `TINYINT(1)`. Giữ nguyên kiểu hợp đồng; mapping Boolean đã kiểm tra thực tế.
3. Hai lỗi phát hiện trong lúc kiểm thử đã được sửa mà không đổi migration đã áp dụng: timezone session dùng +07:00 thay cho ép tên timezone vào MySQL; occupancy dùng mapping Boolean mặc định tương thích metadata Connector/J.

Chưa triển khai Authentication/JWT/Controller hoặc tích hợp HTTP/MQTT. Database Layer đã có nền tảng cho Prompt 3. Hướng dẫn chạy và tài khoản development ở [database.md](database.md).

## Trạng thái bàn giao

Đã dừng các tiến trình Backend kiểm thử và MySQL tạm 3307; MySQL dịch vụ 3306 vẫn chạy. Thông tin đăng nhập tạm đã được gỡ. Bản JAR cuối đã đóng gói thành công và kiểm tra manifest entry point, migration, profile local. Cấu hình chạy lại ở README/database.md; mật khẩu MySQL cần được cung cấp qua môi trường mỗi phiên.
