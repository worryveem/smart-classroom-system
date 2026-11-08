# Thiết kế giao diện SmartClass

## Định hướng

Giao diện lấy cảm hứng từ phòng điều hành lớp học: ưu tiên đọc môi trường học tập, nhận biết kết nối thiết bị và thực hiện thao tác có xác nhận. Điểm nhận diện chính là vùng điều hướng xanh chàm và sơ đồ lớp học ở trang đăng nhập.

## Hệ giá trị thiết kế

| Vai trò | Màu |
|---|---|
| Điều hướng | `#29347A` |
| Hành động chính | `#4658D6` |
| Nền làm việc | `#F3F5FB` |
| Bề mặt nội dung | `#FFFFFF` |
| Nội dung chính | `#202B45` |
| Điểm nhấn cảm biến nhiệt | `#BF5A36` |

Dùng Be Vietnam Pro cho tiêu đề và nội dung, lưu phông trong dự án để không phụ thuộc dịch vụ phông khi chạy. Tiêu đề chính 32–38 px, nội dung 14–16 px, chú thích 12–13 px; số liệu dùng chữ số có độ rộng cố định. Màu trạng thái luôn đi cùng văn bản, không chỉ dựa vào màu.

## Bố cục

Trên máy tính, điều hướng nằm bên trái; nội dung căn trái và sử dụng toàn bộ vùng còn lại. Dashboard chia vùng biểu đồ lớn và vùng điều khiển thiết bị. Lịch sử và quản trị dành chiều rộng cho bộ lọc và bảng. Trên điện thoại, điều hướng chuyển thành hàng ngang, các vùng nội dung xếp dọc và bảng cuộn trong vùng riêng.

```text
+----------------+----------------------------------------+
| SmartClass     | Ngữ cảnh làm việc          Tài khoản   |
+----------------+----------------------------------------+
| Điều hướng     | Tiêu đề                    Thao tác    |
|                | Trạng thái dữ liệu                     |
|                | Nhiệt độ | Độ ẩm | Ánh sáng | Hiện diện |
|                | Biểu đồ cảm biến       | Điều khiển    |
|                |                        | Quạt, đèn     |
+----------------+----------------------------------------+
```

Đã đối chiếu phương án với yêu cầu: loại bỏ nhãn trang trí phía trên mọi tiêu đề, viền dày và bóng đổ lặp lại trên từng khối. Chỉ vùng dữ liệu có cùng vai trò dùng chung cách trình bày; trạng thái môi trường, điều khiển và bảng dữ liệu có phân cấp riêng. Sơ đồ đăng nhập thể hiện chủ đề lớp học, không hiển thị số liệu hoặc trạng thái kết nối giả.

## Phạm vi chức năng

Giữ nguyên hợp đồng API, xác thực JWT, phân quyền, điều hướng, polling, chống gửi lặp lệnh, xử lý ACK, bộ lọc, phân trang, CRUD và xác nhận xóa. Tất cả trạng thái đang tải, trống, lỗi, dữ liệu cũ và mất quyền phải tiếp tục có thể nhìn thấy và thao tác bằng bàn phím. Chuyển động tôn trọng `prefers-reduced-motion`.

## Xác minh

Kết quả xác minh ngày 08/11/2026:

- `npm run build`: thành công, phông được đóng gói cùng ứng dụng.
- Các nhóm kiểm thử Playwright về Authentication, Admin và History: 31 bài đạt. Nhóm Dashboard chạy lại sau khi bổ sung khoảng đệm trục thời gian: 12 bài đạt. Tổng cộng 43 bài chức năng đạt; không sửa kỳ vọng của bộ kiểm thử.
- 6 bài tích hợp Backend thật được bỏ qua vì chưa bật cấu hình môi trường kiểm thử tương ứng. Các kết quả trên dùng API giả lập trong bộ kiểm thử, chưa xác minh lại toàn bộ hệ thống Backend/Node-RED/ESP32 thật.
- 42 lượt kiểm tra bố cục trên các chiều rộng 320, 390, 760, 768, 1024, 1366 và 1920 px cho Login, Dashboard, hai tab History và hai tab Admin: không tràn ngang toàn trang. Bảng dữ liệu vẫn cuộn trong vùng riêng.
- Đã xem ảnh chụp trên máy tính và điện thoại; hộp thoại thêm thiết bị ở màn hình 320 px giữ được tiêu điểm nhập liệu và đóng bằng Escape.
- `git diff --check`: không có lỗi khoảng trắng. Không thực hiện lệnh tới thiết bị vật lý để xác minh thay đổi giao diện.

Ảnh chụp kiểm tra được lưu tạm trong `frontend/test-results/redesign-*.png`; thư mục kết quả kiểm thử không thuộc mã nguồn được quản lý.
