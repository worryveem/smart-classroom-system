# Authentication, JWT và phân quyền — Prompt 3

## Cập nhật quyền điều khiển theo ca

Module vận hành phòng bổ sung kiểm tra nghiệp vụ sau xác thực JWT: chỉ phòng 101 có IoT; ADMIN được điều khiển khi phòng hoạt động, TEACHER cần lịch của mình đã duyệt và đang diễn ra tại 101; STUDENT chỉ xem. Phòng bảo trì/tạm ngưng khóa điều khiển với mọi vai trò. API `GET /api/classroom/permission` phục vụ hiển thị; `POST /api/control` luôn kiểm tra lại trước khi gửi lệnh. ADMIN đăng nhập trực tiếp vào tổng quan Nhà A; đường dẫn quay lại cho phép thêm `/building`, `/classroom`. Chi tiết tại [quản lý Nhà A](building-a.md).

## Cơ chế

```text
React -> POST /api/auth/login -> AuthController -> AuthService
  -> AuthenticationManager / DaoAuthenticationProvider
  -> CustomUserDetailsService -> UserRepository -> MySQL users
  -> BCryptPasswordEncoder.matches -> JwtService
  -> JWT + user DTO -> React

React -> Authorization: Bearer JWT -> JwtAuthenticationFilter
  -> verify HS256 / issuer / iat / exp -> UserDetails từ MySQL
  -> ROLE_<role hiện tại trong database> -> SecurityContext -> Protected API
```

Chỉ triển khai Access Token. Không lưu JWT vào database, không dùng session/cookie để xác thực, chưa có refresh token/logout blacklist. Secret không tự sinh khi ứng dụng khởi động. Giữ nguyên schema và BCrypt cost 12 của Seeder Prompt 2.

Token có `iss=smartclass-backend`, `sub`, `userId`, `role`, `iat`, `exp`; không chứa password hash. Chỉ chấp nhận HS256 đã ký, issuer đúng, đủ claims và chưa hết hạn. Không nhận token từ query parameter. Role trong JWT là thông tin tại thời điểm phát hành; Filter nạp lại user và quyền từ MySQL trên mỗi request, đồng thời đối chiếu ID tài khoản. Tài khoản bị xóa sẽ nhận 401; đổi role có hiệu lực ở request tiếp theo.

Prompt 6 bổ sung claim `userId` bắt buộc để token của tài khoản đã xóa/đổi username không xác thực được tài khoản mới dùng lại tên cũ. Token phát hành trước thay đổi này cần đăng nhập lại; không đổi thuật toán, secret, TTL hoặc cơ chế CORS. Đổi mật khẩu không tự thu hồi JWT đã phát hành; token vẫn tuân theo thời hạn hiện có.

Filter chỉ chạy trong Spring Security, không được đăng ký lặp ở servlet container. POST login bỏ qua Bearer cũ để người dùng có thể đăng nhập lại. OPTIONS đi qua CORS trước kiểm tra xác thực. Không trim/chỉnh sửa password trước khi BCrypt xác minh.

## Cấu hình JWT và CORS

| Biến | Ý nghĩa |
|---|---|
| JWT_SECRET | Bắt buộc: Base64 của ít nhất 32 byte ngẫu nhiên mật mã |
| JWT_EXPIRATION | Thời gian sống milliseconds; mặc định 7200000 (2 giờ), tối thiểu 1000 |
| CORS_ALLOWED_ORIGINS | Các origin tin cậy phân cách bằng dấu phẩy; mặc định http://localhost:5173 |

JWT_SECRET thiếu, sai Base64 hoặc quá ngắn khiến startup thất bại với thông báo cấu hình, không in secret. Độ dài chỉ là điều kiện tối thiểu; dùng bộ sinh ngẫu nhiên mật mã, không Base64 một câu mật khẩu dễ đoán. Production giữ secret trong secret manager/môi trường an toàn, dùng HTTPS và danh sách CORS origin chính xác. Không dùng wildcard. CORS allowCredentials=false; chỉ dùng Authorization Bearer.

Spring Security 6.5.11 và JJWT 0.13.0 được chọn cùng Spring Boot 3.5.9/Java 17. Security được nâng trong cùng nhánh 6.5, gồm bản sửa [CVE-2026-22746](https://spring.io/security/cve-2026-22746/). Tham khảo [DaoAuthenticationProvider](https://docs.spring.io/spring-security/reference/6.5/servlet/authentication/passwords/dao-authentication-provider.html), [JJWT releases](https://github.com/jwtk/jjwt/releases).

## Thiết lập secret một lần trên Windows

Chỉ chạy bước này khi chưa có secret. Không chạy lại mỗi lần khởi động vì đổi khóa sẽ vô hiệu token cũ. Ví dụ lưu secret local vào môi trường người dùng Windows, không ghi vào repository:

```powershell
if (-not [Environment]::GetEnvironmentVariable('JWT_SECRET', 'User')) {
    $jwtKeyBytes = New-Object byte[] 32
    $jwtRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $jwtRng.GetBytes($jwtKeyBytes) } finally { $jwtRng.Dispose() }
    [Environment]::SetEnvironmentVariable('JWT_SECRET', [Convert]::ToBase64String($jwtKeyBytes), 'User')
}
$env:JWT_SECRET = [Environment]::GetEnvironmentVariable('JWT_SECRET', 'User')
```

Không in secret ra console hoặc đưa vào Postman shared environment. Phiên PowerShell/IDE đã mở cần nạp lại biến môi trường hoặc khởi động lại. Ứng dụng không tự đọc `.env`.

## Chạy Backend

Từ gốc dự án, sau khi thiết lập JWT_SECRET:

```powershell
cd backend
$env:DB_USERNAME = 'root'
$mysqlSecret = Read-Host 'MySQL password' -AsSecureString
$env:DB_PASSWORD = [System.Net.NetworkCredential]::new('', $mysqlSecret).Password
$env:JWT_SECRET = [Environment]::GetEnvironmentVariable('JWT_SECRET', 'User')
$env:JWT_EXPIRATION = '7200000'
$env:SPRING_PROFILES_ACTIVE = 'local'
.\mvnw.cmd spring-boot:run
```

DB_HOST/DB_PORT/DB_NAME mặc định localhost/3306/smartclass_db. Thông tin Seeder development xem [database.md](database.md). Tài khoản tồn tại không bị đổi mật khẩu. Ngoài local, Seeder mặc định tắt.

## API đăng nhập và Postman

Tạo biến Postman `baseUrl=http://localhost:8080`, không đặt Authorization cho request login.

```http
POST {{baseUrl}}/api/auth/login
Content-Type: application/json
```

```json
{"username":"admin","password":"Admin@12345"}
```

Password trên chỉ dành cho account development chưa bị thay đổi. Response 200:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "<JWT được cấp>",
    "tokenType": "Bearer",
    "expiresIn": 7200,
    "user": {"id": 1, "username": "admin", "role": "ADMIN"}
  }
}
```

Trong tab Tests/Scripts Post-response có thể lưu token cục bộ mà không log:

```javascript
pm.environment.set('accessToken', pm.response.json().data.accessToken);
```

Không chia sẻ/export môi trường chứa token. API không trả Entity User hoặc password_hash.

## Lấy tài khoản hiện tại

```http
GET {{baseUrl}}/api/auth/me
Authorization: Bearer {{accessToken}}
```

Trong Postman chọn Authorization → Bearer Token → `{{accessToken}}`. Response:

```json
{"success":true,"message":"Get current user successfully","data":{"id":1,"username":"admin","role":"ADMIN"}}
```

Danh tính đến từ SecurityContext đã nạp database, không từ username/id query parameter. Response đăng nhập và /me dùng Cache-Control: no-store.

## Chính sách truy cập

| Endpoint | Chính sách |
|---|---|
| POST /api/auth/login | Public |
| GET /api/auth/me | Đã xác thực |
| /api/state, /api/control, /api/telemetry, /api/commands | Đã xác thực |
| /api/devices và /api/devices/** | ADMIN |
| /api/users và /api/users/** | ADMIN |
| Các URL còn lại | Đã xác thực theo mặc định |

Authorities thống nhất ROLE_ADMIN/ROLE_TEACHER/ROLE_STUDENT, dùng hasRole và bật @EnableMethodSecurity. Chưa có quyền chi tiết cho API nghiệp vụ ngoài chính sách trên.

Sau Prompt 4, login, /me, /api/state và /api/control có Controller thực tế. Các API CRUD chưa triển khai được cấu hình quyền để chuẩn bị giai đoạn sau: ADMIN gọi /api/users khi hợp lệ sẽ qua Security rồi trả 404 vì chưa có Controller; TEACHER/STUDENT nhận 403. Test Controller trả 200 cho ma trận phân quyền chỉ nằm trong src/test, không xuất hiện trong JAR.

CSRF tắt vì xác thực chỉ dùng Bearer header, không session/cookie tự gửi của trình duyệt. Nếu sau này chuyển sang cookie authentication phải đánh giá lại CSRF. HTTP Basic, form login và endpoint logout mặc định bị tắt.

## Lỗi HTTP

| Mã | Trường hợp |
|---|---|
| 400 | JSON sai định dạng, thiếu/blank username/password, username >50 ký tự hoặc password >72 byte UTF-8 |
| 401 | Sai username/password, thiếu token, chữ ký sai, token hết hạn hoặc user đã bị xóa |
| 403 | Đã xác thực nhưng thiếu quyền, hoặc origin CORS không được phép |
| 404 | Request đã qua Security nhưng endpoint chưa triển khai |
| 405 | Method không được Controller hỗ trợ, sau khi qua Security |
| 406 / 415 | Accept hoặc Content-Type không được hỗ trợ |
| 500 | Lỗi máy chủ/database, trả thông báo chung, không stack trace |

Lỗi dùng `{success:false,message:"...",data:null}`. Sai password và username không tồn tại cùng trả `Invalid username or password`, không tiết lộ tài khoản tồn tại. JWT lỗi trả `Unauthorized`. LoginRequest/LoginResponse/JwtProperties có toString che dữ liệu nhạy cảm; framework request debug logging được hạn chế để tránh lộ password/Bearer.

CORS cho phép GET/POST/PUT/PATCH/DELETE/OPTIONS, Authorization và Content-Type, bao gồm header CORS trên response 401 cho origin hợp lệ.

## Kiểm tra hết hạn

Trong môi trường test riêng, đặt JWT_EXPIRATION=1000, khởi động lại, login lấy token và đợi hơn 1 giây rồi gọi /me: nhận 401. Sau kiểm thử khôi phục 7200000 và khởi động lại. Token cũ giữ exp đã được ký; thay đổi TTL không sửa exp của token đã phát hành.

## Kiểm thử tự động và HTTP

```powershell
cd backend
.\mvnw.cmd clean test
```

Unit/Security MockMvc tests không cần MySQL, tự tạo khóa chỉ trong test. Hai test Database được bỏ qua khi không có SMARTCLASS_MYSQL_TEST_URL; không coi SKIPPED là PASS cho Database. Để chạy đầy đủ, từ gốc workspace với DB_USERNAME/DB_PASSWORD đã cấu hình:

```powershell
.\backend\scripts\test-mysql.ps1
```

Script tạo database kiểm thử mới, không ghi/xóa dữ liệu smartclass_db. Test kiểm tra token sai/hết hạn, authority thay đổi/xóa user bằng mock, toàn bộ ma trận quyền, method security, CORS, lỗi và không tạo session.

Với Backend đang chạy tại 8080, từ gốc workspace:

```powershell
python backend/scripts/test-auth-http.py
```

Script HTTP chỉ đọc dữ liệu, không in password/token. Mặc định dùng account development; có thể cung cấp AUTH_ADMIN_PASSWORD/AUTH_TEACHER_PASSWORD/AUTH_STUDENT_PASSWORD nếu account đã đổi mật khẩu. Đặt JWT_SECRET cùng khóa Backend để script kiểm chứng chữ ký HMAC độc lập.

Kiểm tra hết hạn thật bằng HTTP: chạy server test với JWT_EXPIRATION=5000, đặt AUTH_TEST_EXPIRATION=true rồi chạy script; script đợi token hết hạn và yêu cầu /me trả 401. Không dùng TTL ngắn này cho cấu hình bình thường. Kết quả thực tế được ghi tại [authentication-verification.md](authentication-verification.md).
