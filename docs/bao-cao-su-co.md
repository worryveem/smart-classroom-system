# Báo cáo sự cố

Mục “Báo cáo sự cố” trên menu mở trang `/incidents` cho mọi tài khoản đăng nhập.

- ADMIN xem tất cả sự cố của tất cả người báo trên các phòng, lọc theo phòng/trạng thái, phân trang, cập nhật xử lý và xem lịch sử.
- TEACHER và STUDENT chỉ xem báo cáo của chính mình, gửi báo cáo mới và xem lịch sử xử lý; không tự đổi trạng thái.
- Mỗi báo cáo gồm phòng, tiêu đề và mô tả. Form mới không bắt buộc gắn thiết bị; dữ liệu đã có thiết bị vẫn hiển thị định danh.

## API

`GET /api/incidents?page=0&size=10&roomId=101&status=OPEN` trả `rows`, `page`, `size`, `totalElements`, `totalPages`. `roomId` và `status` là tùy chọn. Kích thước trang tối đa 50; trạng thái chỉ nhận OPEN, IN_PROGRESS hoặc RESOLVED. Mặc định admin xem toàn bộ phòng, không bị giới hạn 200 bản ghi như danh sách theo phòng cũ.

Backend lấy tài khoản từ phiên đăng nhập. Với tài khoản không phải ADMIN, cả truy vấn tổng số và truy vấn danh sách đều thêm điều kiện `reporter_id` của chính tài khoản; client không được chọn người báo thay thế.

Tạo báo cáo, đọc chi tiết/lịch sử và cập nhật xử lý tái sử dụng các endpoint `/api/classroom/incidents` hiện có, giữ kiểm tra quyền và thông báo nghiệp vụ. Liên kết trong mỗi báo cáo mở đúng sự cố tại trang phòng. Không đổi schema database.

## Kiểm tra

`IncidentListTests` kiểm tra phạm vi admin/toàn phòng, giới hạn người báo cho giáo viên/học viên và bộ lọc không hợp lệ. `frontend/tests/incidents.spec.js` kiểm tra menu, phân trang/lọc, tạo báo cáo, admin cập nhật/lịch sử, lỗi và màn hình di động với HTTP mock.

Kết quả ngày 09/11/2026: frontend build đạt, 3 kiểm thử backend đạt và 5 kịch bản giao diện đạt (kịch bản bộ lọc được chạy lại sau khi sửa nhãn truy cập). Backend đã được khởi động lại; gọi API danh sách bằng tài khoản admin trên database thật trả thành công. Không tạo dữ liệu sự cố giả trên database thật.
