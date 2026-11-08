# API quản trị Users và Devices

Toàn bộ `/api/users`, `/api/users/**`, `/api/devices`, `/api/devices/**` yêu cầu JWT của ADMIN. Chưa xác thực hoặc token sai trả 401; TEACHER/STUDENT trả 403. Danh tính thao tác lấy từ SecurityContext, không từ body. Các service cũng kiểm tra quyền ADMIN bằng method security. Không thay đổi schema hoặc lịch sử IoT.

## Quy ước chung

Mỗi nhóm hỗ trợ GET danh sách, GET `/{id}`, POST, PUT `/{id}`, DELETE `/{id}`. Tạo thành công trả 201; GET/PUT/DELETE thành công trả 200; DELETE trả `data: null`. Mọi response dùng `{success, message, data}` và `Cache-Control: no-store`.

Danh sách dùng cùng cấu trúc phân trang như lịch sử lệnh: `data.content`, `data.page`, `data.size`, `data.totalElements`, `data.totalPages`. `page` mặc định 0, không âm; `size` mặc định 20, giới hạn 1–100; offset không vượt quá 2147483647. User sắp xếp theo ID tăng dần, Device theo device ID tăng dần. Không có dữ liệu hoặc trang vượt phạm vi trả danh sách rỗng.

Tham số/body sai trả 400; đối tượng không tồn tại trả 404; trùng định danh, vi phạm khóa ngoại hoặc quy tắc bảo vệ tài khoản trả 409. Body có trường ngoài DTO bị từ chối 400. Enum không nhận giá trị số. Thông báo lỗi không trả password, hash hoặc SQL nội bộ.

## Users

GET `/api/users?username=teacher&page=0&size=20` tìm username chứa chuỗi chỉ định; `%`, `_` được xem là ký tự thường, không phải wildcard do người gọi cung cấp. So sánh tuân theo collation MySQL hiện có. Mỗi bản ghi chỉ có `id`, `username`, `role`, `created_at`.

POST:

```json
{"username":"newteacher","password":"Password@123","role":"TEACHER"}
```

Username bắt buộc, tối đa 50 ký tự, không chứa khoảng trắng; role chính xác `ADMIN`, `TEACHER` hoặc `STUDENT`. Mật khẩu mới từ 8 đến 72 ký tự và không vượt quá 72 byte UTF-8, không được chỉ có khoảng trắng. Mật khẩu dùng PasswordEncoder BCrypt hiện có; DTO không có password hash.

PUT yêu cầu username và role. Password bị bỏ qua, `null`, rỗng hoặc chỉ có khoảng trắng giữ nguyên hash; password mới hợp lệ được mã hóa lại. Không trim mật khẩu trước khi mã hóa. Trùng username kiểm tra theo collation/unique constraint của MySQL, kể cả khác chữ hoa/thường.

Không được tự xóa tài khoản đang đăng nhập hoặc xóa ADMIN cuối cùng. Cũng không cho hạ quyền ADMIN cuối cùng. Các thao tác ghi khóa tập ADMIN theo thứ tự ID trong transaction và kiểm tra lại quyền người thao tác, nhằm giữ ít nhất một ADMIN khi có yêu cầu đồng thời. Lỗi khóa đồng thời trả 409; người thao tác đã mất quyền trả 403.

Đổi username làm token mang username cũ không còn xác thực tài khoản đó. Token bắt buộc có `userId` trùng ID đang lưu; tài khoản mới dùng lại tên cũ không thể dùng token của tài khoản trước. Token trước Prompt 6 cần đăng nhập lại. Không bổ sung blacklist hoặc thay đổi thời hạn JWT.

## Devices

GET `/api/devices?roomId=101&type=SENSOR&status=ACTIVE&page=0&size=20` kết hợp các bộ lọc bằng AND. Có thể dùng `room_id` thay `roomId`; cung cấp cả hai với giá trị khác nhau trả 400.

POST:

```json
{"deviceId":"node3_sensor","roomId":101,"type":"SENSOR","macAddress":"AA:BB:CC:DD:EE:FF","status":"ACTIVE"}
```

Device ID bắt buộc, từ 1 đến 50 ký tự chữ Latin, chữ số, `_` hoặc `-`; không được trùng. Room ID là số nguyên dương. Type chính xác `SENSOR` hoặc `ACTUATOR`. MAC tùy chọn, `null` nếu chưa có; nếu cung cấp phải đúng dạng sáu cặp hex phân cách bằng dấu `:`.

Status nhận `ACTIVE`/`Active`, `OFFLINE`/`Offline`, `SUSPENDED`/`Suspended`. Response dùng tên enum viết hoa; DeviceStatusConverter hiện có ghi MySQL chính xác `Active`, `Offline`, `Suspended`. Các giá trị khác bị từ chối.

Response có `device_id`, `room_id`, `type`, `mac_address`, `status`, `created_at`. PUT yêu cầu roomId, type, status; macAddress bỏ qua hoặc `null` sẽ xóa giá trị MAC. Không chấp nhận deviceId trong body PUT: ID chỉ lấy từ URL và giữ nguyên.

DELETE dùng khóa ngoại `RESTRICT` hiện có làm kiểm tra cuối cùng, kể cả dữ liệu lịch sử được ghi đồng thời. Thiết bị có telemetry hoặc command_logs trả 409; thiết bị và các bản ghi lịch sử được giữ nguyên. Không dùng CASCADE DELETE. POST thiết bị dùng INSERT qua `DeviceInsertRepository`, không dùng merge để ghi đè thiết bị đã được thêm đồng thời.

## Kiểm thử

`AdminApiIntegrationTests` dùng JWT thật, Spring MVC/Security, BCrypt và database MySQL kiểm thử tách biệt, kiểm tra CRUD, bộ lọc/phân trang, validation, phân quyền, bảo vệ lịch sử, nhận diện tài khoản và cập nhật ADMIN đồng thời. Chạy đầy đủ từ gốc workspace bằng `backend/scripts/test-mysql.ps1` sau khi đặt DB_USERNAME/DB_PASSWORD trong môi trường; không thử CRUD trên dữ liệu thực tế.

Kiểm chứng ngày 07/11/2026: Maven `clean verify` thành công, 90 test, không lỗi và không bỏ qua. Script `test-auth-http.py` cũng chạy đạt trên JAR tại cổng kiểm tra 8081: login, JWT/userId, /me, danh sách ADMIN, quyền TEACHER/STUDENT, lỗi 401/403 và CORS. Kiểm tra HTTP chỉ đọc database hiện có, tắt seeder/Flyway; sau kiểm tra ứng dụng tạm đã dừng. Database chính vẫn có 3 users, 2 devices, 1 telemetry, 1 command log; Flyway vẫn ở V1. Toàn bộ CRUD và dữ liệu lịch sử phục vụ test được thực hiện trong database kiểm thử tách biệt.
