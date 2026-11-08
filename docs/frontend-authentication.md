# Đăng nhập và xác thực Frontend

Frontend dùng React, AuthContext, React Router và Axios hiện có. Không đổi API Backend hoặc CORS. Login, Dashboard, History và Admin đã được triển khai. Admin dùng lại guard ADMIN và xác minh lại phiên khi người dùng tự đổi username/role.

## Kết nối

`VITE_API_BASE_URL` mặc định `http://localhost:8080`, mẫu tại `frontend/.env.example`. Vite chạy cổng 5173; origin `http://localhost:5173` đã nằm trong CORS Backend. Biến VITE được đưa vào bundle nên chỉ dùng cho địa chỉ API công khai, tuyệt đối không chứa secret, tài khoản hoặc JWT. Frontend không gọi Node-RED/MQTT.

- POST `/api/auth/login` gửi `{username, password}`; đọc `data.accessToken`, `tokenType`, `expiresIn`, `user` trong wrapper hiện có.
- GET `/api/auth/me` dùng Bearer token để kiểm tra phiên và lấy `{id, username, role}` mới nhất từ MySQL. Danh tính/role hiển thị lấy từ endpoint này, không tin role được giải mã từ JWT hoặc lưu trên trình duyệt.

## Phiên đăng nhập

Access Token lưu trong `sessionStorage` với khóa `smartclass.accessToken`, giúp tải lại trang trong cùng tab. Không lưu mật khẩu, user hoặc role. Khi trình duyệt chặn storage, ứng dụng dùng bộ nhớ và cần đăng nhập lại sau khi tải lại. Token là dữ liệu nhạy cảm; production cần HTTPS và phòng ngừa XSS. Không ghi token vào log hoặc URL.

AuthProvider kiểm tra `/me` sau đăng nhập, khi tải lại và khi tab/cửa sổ được kích hoạt lại. Trong lúc kiểm tra, nội dung bảo vệ chưa được hiển thị. Axios tự gắn Bearer vào request tới Spring Boot và chặn đích khác origin của API đã cấu hình.

HTTP 401 của request có token xóa phiên và đưa về Login. HTTP 401 của chính request đăng nhập chỉ báo sai thông tin. Request cũ trả 401 không được xóa phiên mới. Mốc `exp` được dùng để hẹn giờ đăng xuất trên trình duyệt; kiểm chứng chữ ký và quyền vẫn do Backend quyết định. Không tự làm mới token vì Backend chưa có refresh API.

Mất mạng hoặc lỗi máy chủ khi kiểm tra `/me` không xóa token: hiển thị trạng thái lỗi, cho thử lại hoặc quay lại đăng nhập. HTTP 403 không bị coi là token hết hạn. Logout hủy đăng nhập đang chạy, xóa phiên trình duyệt và ngăn response cũ khôi phục phiên. Backend chưa có blacklist/logout API nên token đã cấp vẫn có hiệu lực tới hạn của Backend; logout không thu hồi token ở thiết bị/tab khác.

## Route và vai trò

| Route | Quyền giao diện |
|---|---|
| `/login` | Khách; người đã đăng nhập được chuyển tới trang phù hợp |
| `/dashboard` | ADMIN, TEACHER, STUDENT |
| `/history` | ADMIN, TEACHER, STUDENT |
| `/admin` | Chỉ ADMIN; vai trò khác thấy thông báo không có quyền |

Menu Quản trị chỉ hiện cho ADMIN. Route bảo vệ giữ địa chỉ đích để quay lại sau đăng nhập; chỉ chấp nhận các route nội bộ đã cho phép và phù hợp role. Điều hướng bằng Back hoặc nhập trực tiếp URL vẫn qua guard. Quyền giao diện không thay thế Spring Security.

Form kiểm tra dữ liệu bắt buộc, tên đăng nhập tối đa 50 ký tự, mật khẩu không quá 72 byte UTF-8. Không trim mật khẩu trước khi gửi. Có hiện/ẩn mật khẩu, thông báo lỗi tiếng Việt, trạng thái đang gửi và chặn gửi trùng. Không hardcode tài khoản hoặc token trong mã ứng dụng.

## Chạy và kiểm thử

Chạy Backend theo [authentication.md](authentication.md), sau đó từ thư mục gốc:

```powershell
cd frontend
npm install
npm run dev
```

Build bằng `npm run build`. Playwright kiểm tra trình duyệt thật với HTTP mock cho các tình huống lỗi/race; mock chỉ có trong `frontend/tests/`, không được đưa vào ứng dụng:

```powershell
npx playwright install chromium
npm test
```

Ba test tích hợp Spring Boot được bỏ qua mặc định. Muốn chạy, khởi động Backend thật tại 8080 và đặt `SMARTCLASS_E2E_BACKEND=1` cùng các biến `AUTH_ADMIN_USERNAME`, `AUTH_ADMIN_PASSWORD`, `AUTH_TEACHER_USERNAME`, `AUTH_TEACHER_PASSWORD`, `AUTH_STUDENT_USERNAME`, `AUTH_STUDENT_PASSWORD` vào môi trường bằng thông tin tài khoản test hợp lệ, rồi chạy `npm test`. Không lưu thông tin này vào repository. Test tích hợp chỉ đăng nhập và đọc `/me`, không CRUD hoặc điều khiển thiết bị. Trace/video tắt để không lưu credentials/token trong artifact.

Kiểm chứng ngày 07/11/2026: `npm install` và `npm run build` thành công; 14 test Chromium chạy đạt, không bỏ qua, gồm ba vai trò đăng nhập thực với Spring Boot 8080/MySQL và kiểm tra CORS từ Frontend 5173. Đã kiểm tra ảnh desktop/mobile và không có lỗi JavaScript chưa xử lý trong các test. Backend kiểm tra tắt seeder/Flyway; dữ liệu chính vẫn có 3 users, 2 devices, 1 telemetry, 1 command log. Các dịch vụ tạm phục vụ kiểm thử đã dừng sau khi hoàn tất.
