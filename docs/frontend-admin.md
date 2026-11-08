# Frontend Admin — Users và Devices

Route `/admin` dùng guard ADMIN, AuthContext, Axios/JWT interceptor và Layout hiện có. TEACHER/STUDENT thấy trang không có quyền truy cập với liên kết về Dashboard; khách được chuyển Login. Backend vẫn xác thực và quyết định quyền ở mọi request. Không sửa JWT, Security Backend hoặc schema.

## API và danh sách

Hai service riêng `usersService.js` và `devicesService.js` gọi GET danh sách, GET chi tiết, POST tạo, PUT cập nhật và DELETE theo endpoint hiện có. Danh sách đọc `data.content`, `page`, `size`, `totalElements`, `totalPages` và phân trang tại Backend; không tải toàn bộ để tự chia trang.

Users tìm theo username. Devices kết hợp roomId, type và status. Đổi bộ lọc/size đưa về trang đầu; nhập liệu được gộp 400 ms, không polling nền. Hai tab giữ bộ lọc riêng, dùng lại kết quả gần nhất khi phù hợp. Làm mới hoặc CRUD thành công tải lại danh sách; nếu xóa bản ghi cuối của trang, trở về trang còn dữ liệu.

DTO User chỉ giữ id, username, role, created_at. Không lưu/hiển thị password_hash kể cả khi response có trường ngoài hợp đồng. Ngày tạo hiển thị giờ Việt Nam. Bảng có vùng cuộn ngang trên mobile.

## Form Users

Form sửa đọc GET `/api/users/{id}` để lấy dữ liệu mới nhất. Username bắt buộc, tối đa 50 ký tự và không có khoảng trắng. Role chỉ ADMIN/TEACHER/STUDENT. Mật khẩu mới từ 8–72 ký tự và không quá 72 byte UTF-8, không chỉ có khoảng trắng.

POST gửi username/password/role. PUT luôn gửi username/role; khi không nhập mật khẩu mới, bỏ hoàn toàn trường password. Không trim mật khẩu. Mật khẩu chỉ ở trạng thái form trong lúc chỉnh sửa, không được lưu vào storage hoặc cache danh sách; đóng form sẽ loại bỏ trạng thái này.

Nút xóa tài khoản đang đăng nhập bị khóa; Backend tiếp tục kiểm tra quy tắc này và ADMIN cuối cùng. Lỗi 409 do trùng username hoặc hạ quyền ADMIN cuối cùng có thông báo tiếng Việt. Nếu cập nhật chính tài khoản đang đăng nhập làm đổi username/role, gọi lại cơ chế xác minh AuthContext: đổi username có thể cần đăng nhập lại, mất role ADMIN sẽ không còn vào trang quản trị.

## Form Devices

Form sửa đọc GET `/api/devices/{id}`. Device ID chỉ tạo mới, từ 1–50 ký tự Latin/số/_/-, bị khóa khi sửa và không gửi trong PUT. Room ID là số nguyên dương trong giới hạn Java Integer. Type chỉ SENSOR/ACTUATOR. MAC tùy chọn, đúng sáu cặp hex phân cách bằng dấu `:`; để trống gửi null, nghĩa là xóa MAC cũ khi cập nhật.

Status hiển thị Active/Offline/Suspended, gửi enum ACTIVE/OFFLINE/SUSPENDED đúng DTO Backend. Response cũng dùng enum viết hoa; converter Backend hiện có ánh xạ xuống giá trị database. Không tự đổi enum hoặc dữ liệu database.

Xóa luôn cần xác nhận. Lỗi 409 do ràng buộc dữ liệu giải thích rằng lịch sử cảm biến/điều khiển có thể đang tham chiếu thiết bị và được giữ nguyên. Không tự xóa lịch sử để xử lý lỗi.

## UX và lỗi

Modal dùng dialog native, giữ focus trong hộp thoại, hỗ trợ Escape khi không gửi request. Form và nút đóng/xóa/lưu bị khóa trong lúc ghi, có chốt chống gửi trùng. Không tự retry request ghi. Thành công hiển thị thông báo và tải lại danh sách theo bộ lọc hiện tại.

Có Loading, Empty, lỗi tải chi tiết/danh sách, lỗi validation, trùng định danh, 404, 409, 403 và mất mạng. 401 dùng interceptor hiện có để xóa phiên/chuyển Login. 403 không tự coi là token hết hạn; cho kiểm tra lại quyền qua AuthContext. Mất phản hồi khi ghi không được báo chắc chắn thất bại: yêu cầu kiểm tra danh sách trước khi gửi lại. Không đưa lỗi SQL/raw response hoặc mật khẩu vào thông báo.

Pagination và hook truy vấn được tách thành thành phần chung để History/Admin sử dụng cùng cơ chế, không tạo lại API client hoặc Authentication.

## Kiểm thử

Chạy `npm run build`, `npm test` trong frontend. `tests/admin.spec.js` kiểm tra ma trận quyền, CRUD, chi tiết trước sửa, password bị bỏ qua khi không đổi, chống gửi trùng, 409/FK, phân trang/bộ lọc, lỗi mạng/401/403, tự đổi role, dialog và responsive. HTTP mock chỉ nằm trong tests, không thay thế API khi chạy thực tế.

Test CRUD thật được bật riêng bằng `SMARTCLASS_E2E_ADMIN_CRUD=1`, yêu cầu `SMARTCLASS_TEST_DATABASE` có tên `smartclass_verify_*_admin`. Người chạy phải bảo đảm Backend đang trỏ đúng database kiểm thử có sẵn này, dùng biến môi trường DB_NAME; không trỏ `smartclass_db`. Không chạy migration hoặc seeder để thiết lập test này. Credentials ADMIN lấy từ AUTH_ADMIN_USERNAME/AUTH_ADMIN_PASSWORD theo môi trường, không hardcode trong mã ứng dụng.

Test thật tạo định danh ngẫu nhiên tiền tố ui_admin_, thao tác qua giao diện/API hiện có, rồi chỉ xóa chính bản ghi đã tạo. Không DROP database, không sửa schema hoặc dữ liệu lịch sử. Test Authentication/History/Dashboard thật dùng cùng Backend kiểm thử và các biến môi trường đã mô tả trong [xác thực Frontend](frontend-authentication.md).

Kiểm chứng ngày 08/11/2026: `npm run build` thành công; toàn bộ 45 test Chromium đạt, không bỏ qua, gồm 13 test Admin và hồi quy các tính năng trước. CRUD Users/Devices thật chạy trên một database kiểm thử có sẵn, xác minh mật khẩu cũ vẫn đăng nhập được sau PUT không có password, Device ID không nằm trong PUT và status trả về đúng enum. Đã xem ảnh bảng desktop và modal mobile. Bản ghi ui_admin_ được xóa hết sau test; database kiểm thử giữ số lượng 3 users, 4 devices, 1 telemetry, 1 command log như trước. Database chính giữ 3 users, 2 devices, 1 telemetry, 1 command log; cả hai vẫn Flyway V1. Backend/Vite tạm đã dừng sau kiểm thử; không sửa file Backend hoặc schema.
