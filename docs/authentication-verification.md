# Báo cáo Authentication và Authorization — 07/11/2026

## Khảo sát và phạm vi

Kế thừa Backend Spring Boot 3.5.9, Java 17.0.12, package `iot.iot`, BCrypt cost 12. MySQL 9.5.0 localhost:3306 có sẵn smartclass_db, Flyway V1, ba users và hai devices. Workspace chưa có Git repository nên không thể đối chiếu commit/uncommitted changes.

Không sửa Entity/schema/migration V1 hoặc dữ liệu tài khoản, không thay mật khẩu Seeder, không thêm CRUD/IoT Controller, không sửa Frontend/ESP32/Node-RED/Mosquitto.

## File mới

Các đường dẫn Java tính từ `backend/src/main/java/iot/iot/`:

- `controller/AuthController.java`
- `service/AuthService.java`
- `common/ApiResponse.java`
- `dto/request/LoginRequest.java`
- `dto/response/LoginResponse.java`, `UserResponse.java`
- `exception/GlobalExceptionHandler.java`
- `security/SecurityResponseWriter.java`
- `security/config/SecurityConfig.java`, `CorsConfig.java`
- `security/jwt/JwtProperties.java`, `JwtService.java`, `JwtAuthenticationFilter.java`, `JwtAuthenticationEntryPoint.java`
- `security/user/CustomUserDetails.java`, `CustomUserDetailsService.java`

Các file kiểm thử/tài liệu mới:

- `backend/src/test/java/iot/iot/AuthSecurityTests.java`
- `backend/src/test/java/iot/iot/security/jwt/JwtServiceTests.java`
- `backend/scripts/test-auth-http.py`
- `docs/authentication.md`, `docs/authentication-verification.md`

File chỉnh sửa: `backend/pom.xml`, `backend/.env.example`, `backend/src/main/resources/application.yml`; MySqlTestSupport, IotApplicationTests và DataLayerIntegrationTests để cấp khóa riêng trong test; README, architecture, directory-structure, api-contract và database docs để đồng bộ trạng thái/cách chạy.

PasswordHashingConfig và DataSeeder được tái sử dụng, không sửa thuật toán hoặc seed password. Dependency Security/JJWT từ profile cũ được đưa ra cấu hình chính, nâng Spring Security 6.5.11 và JJWT 0.13.0; Data JPA/MySQL/Flyway vẫn hoạt động.

## API thực tế

| Method | Endpoint | Kết quả |
|---|---|---|
| POST | /api/auth/login | PASS — HTTP 200, JWT, role/id/username đúng |
| GET | /api/auth/me | PASS — 200 có token hợp lệ; 401 khi thiếu/sai/hết hạn |

## Kiểm thử tự động

Đã chạy `mvnw.cmd clean test` cho Unit/MockMvc, sau đó script `backend/scripts/test-mysql.ps1` chạy đầy đủ `clean verify` trên database MySQL tách biệt. Lần cuối: **43 tests, 0 failures, 0 errors, 0 skipped**, BUILD SUCCESS và tạo executable JAR.

| Suite | Số test |
|---|---:|
| AuthSecurityTests | 32 |
| JwtServiceTests | 5 |
| DataSeederTests | 3 |
| DeviceStatusConverterTests | 1 |
| DataLayerIntegrationTests | 1 |
| IotApplicationTests | 1 |

Kiểm tra JAR không có ProbeController/test Controller. Test Matrix ADMIN/TEACHER/STUDENT dùng Controller chỉ trong src/test, không triển khai CRUD để kiểm thử.

## Kết quả theo yêu cầu

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Maven Build | PASS | clean verify, 43 tests không skip, JAR tạo thành công |
| BCrypt Verification | PASS | DaoAuthenticationProvider dùng encoder hiện có; login HTTP trên seeded hashes cost 12 |
| ADMIN Login | PASS | HTTP thật 200, role ADMIN, JWT kiểm chứng HMAC độc lập |
| TEACHER Login | PASS | HTTP thật 200, role TEACHER |
| STUDENT Login | PASS | HTTP thật 200, role STUDENT |
| Invalid Password | PASS | 401, response giống username không tồn tại; không trim password |
| JWT Validation | PASS | Đúng chữ ký/issuer/claims; sai chữ ký, tamper, unsigned/malformed/missing claims bị từ chối |
| JWT Expiration | PASS | Test clock TTL 1000ms; chạy JAR với TTL 1000ms, login rồi đợi và GET /me nhận 401 |
| Authenticated Endpoint | PASS | /me trả user từ DB; username/id query không đổi danh tính; token query bị bỏ qua |
| ADMIN Authorization | PASS | MockMvc: ADMIN nhận 200 trên endpoint ADMIN và authenticated |
| TEACHER Authorization | PASS | MockMvc: 403 ADMIN, 200 authenticated |
| STUDENT Authorization | PASS | MockMvc: 403 ADMIN, 200 authenticated |
| CORS | PASS | HTTP/MockMvc preflight đủ 6 methods; localhost:5173 được phép, origin khác bị từ chối |

Bổ sung: anonymous nhận 401 trên endpoint bảo vệ; đổi role/xóa user được mô phỏng tại Repository để xác nhận token cũ không giữ quyền cũ; method security trả 403; request validation trả 400; Content-Type sai trả 415; lỗi hạ tầng được che và trả 500. Không tạo session/Set-Cookie trong các luồng xác thực.

## HTTP thật và bảo toàn dữ liệu

Dùng executable JAR trên 8080 kết nối smartclass_db thực tế, Seeder tắt. Script HTTP không in token/password; xác minh chữ ký HS256 bằng HMAC độc lập, kiểm tra ba logins và /me, sai mật khẩu/tài khoản, token query/malformed/tamper, CORS và giới hạn quyền.

Các API nghiệp vụ chưa có Controller: ADMIN tới /api/users được Security cho qua rồi nhận 404; TEACHER/STUDENT nhận 403. Request đã xác thực tới /api/state nhận 404. HTTP 200 của ma trận quyền được kiểm tra qua Controller chỉ trong test.

Fingerprint users (gồm hash mật khẩu, role, id), devices, số telemetry/command_logs và checksum Flyway V1 trước/sau giống nhau. smartclass_db vẫn có 3 users, 2 devices, 1 telemetry, 1 command log. Không thay đổi dữ liệu tài khoản đang có.

Đã chạy startup không JWT_SECRET và kiểm tra ứng dụng thất bại với lỗi cấu hình rõ ràng. Khóa runtime chỉ phục vụ test được tạo một lần, dùng lại khi restart cho thử expiry rồi xóa sau khi dừng server. Cấu hình mặc định vẫn 7200000ms; không có default secret hoặc cơ chế tự đổi khóa mỗi lần startup.

## Vấn đề và bàn giao

- Không còn lỗi compile/test. Đã dừng Backend kiểm thử; MySQL dịch vụ 3306 vẫn chạy.
- Khi chạy ứng dụng bình thường, người vận hành cần cấu hình JWT_SECRET ổn định và DB_PASSWORD qua môi trường, theo authentication.md. Không ghi secret thật vào repository.
- Cảnh báo Flyway/MySQL 9.5 và integer display width TINYINT(1) từ Prompt 2 vẫn tồn tại; schema validation và hồi quy MySQL thực tế đều đạt.
- Refresh token/blacklist/OAuth2, CRUD và IoT APIs tiếp tục ngoài phạm vi.

Tầng Authentication và Authorization sẵn sàng cho các API nghiệp vụ ở Prompt tiếp theo. Cách thiết lập secret, chạy Windows, Postman và Bearer Token ở [authentication.md](authentication.md).
