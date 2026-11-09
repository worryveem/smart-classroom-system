# Tài khoản cá nhân

Ngày triển khai: 09/11/2026.

## Cách sử dụng

ADMIN, TEACHER và STUDENT đều có thể nhấn vùng tên/ảnh đại diện ở đầu trang để mở `/profile`.

- Cập nhật họ tên, email liên hệ và số điện thoại. Các trường đều tùy chọn và có thể để trống/xóa giá trị.
- Tên đăng nhập và vai trò chỉ đọc; việc đổi hai trường này tiếp tục thuộc quyền ADMIN tại trang quản trị.
- Email chỉ là thông tin liên hệ, chưa có bước xác minh và không dùng để đăng nhập hoặc khôi phục mật khẩu.
- Form đổi mật khẩu riêng, yêu cầu mật khẩu hiện tại, mật khẩu mới và xác nhận mật khẩu mới.
- Khi lưu lỗi, dữ liệu nhập được giữ để sửa hoặc thử lại. Có trạng thái đang tải, thử tải lại và chặn gửi lặp.

## API

| Endpoint | Nội dung |
|---|---|
| GET `/api/account/profile` | Hồ sơ của tài khoản đã xác thực |
| PUT `/api/account/profile` | Chỉ nhận `fullName`, `email`, `phone` |
| POST `/api/account/password` | Chỉ nhận `currentPassword`, `newPassword` |

Không nhận ID tài khoản từ client để xác định người cập nhật. Các trường ngoài hợp đồng như `role`, `username`, `id` hoặc `credentialsVersion` bị từ chối. Response hồ sơ không có mật khẩu, hash hoặc phiên bản thông tin đăng nhập; không cache các response này.

Họ tên tối đa 100 ký tự và không chứa ký tự điều khiển. Email tối đa 254 ký tự và được kiểm tra định dạng. Số điện thoại tối đa 30 ký tự hiển thị, có 7–15 chữ số sau khi bỏ dấu cách/dấu phân cách, cho phép dấu `+` ở đầu. Các giá trị được cắt khoảng trắng ở hai đầu trước khi lưu.

## Đổi mật khẩu và phiên đăng nhập

- Kiểm tra mật khẩu hiện tại bằng BCrypt; không dựa vào password trong JWT hoặc principal đã xóa thông tin bí mật.
- Mật khẩu mới từ 8 ký tự, tối đa 72 byte UTF-8, không được chỉ có khoảng trắng hoặc trùng mật khẩu hiện tại.
- Sai mật khẩu hiện tại trả 400 để người dùng sửa, không làm mất phiên như một lỗi JWT 401.
- Mật khẩu mới được hash, tăng `credentials_version` trong cùng giao dịch. JWT chứa phiên bản tại thời điểm đăng nhập; mỗi request kiểm tra phiên bản hiện tại từ database.
- Đổi mật khẩu thành công làm mọi token cũ của tài khoản không còn hợp lệ. Giao diện xóa phiên hiện tại, chuyển về đăng nhập và hiển thị thông báo thành công. Không trả mật khẩu hay token thay thế trong response.
- ADMIN đặt lại mật khẩu qua chức năng quản trị cũng tăng phiên bản và vô hiệu hóa token cũ. Đổi vai trò không tăng phiên bản; quyền vẫn được nạp lại từ database theo cơ chế sẵn có.
- Token cũ chưa có claim phiên bản chỉ tương thích khi phiên bản tài khoản còn 0. Sau lần đổi mật khẩu, token đó bị từ chối.

## Database và tính nhất quán

Flyway V6 thêm `full_name`, `email`, `phone` với giá trị mặc định rỗng và `credentials_version` mặc định 0 vào `users`. Không sửa tên đăng nhập, vai trò hoặc mật khẩu hiện có khi nâng schema. Không đổi bảng hoặc hợp đồng IoT.

Cập nhật hồ sơ và mật khẩu khóa dòng tài khoản. Cập nhật tài khoản từ ADMIN cũng khóa dòng đích để không ghi đè thông tin liên hệ vừa được người dùng lưu. Các trường liên hệ không được bổ sung vào API danh sách người dùng hoặc dữ liệu công khai.
