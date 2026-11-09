# Lịch cá nhân giáo viên và thông báo trong ứng dụng

Ngày triển khai: 09/11/2026.

## Lịch của tôi

Trang `/my-schedule` chỉ dành cho TEACHER, luôn lấy lịch thuộc chính tài khoản đang đăng nhập. ADMIN không thấy mục “Lịch của tôi”, không mở được trang này và tiếp tục quản lý lịch toàn dãy nhà qua Tổng quan và trang phòng. API lịch cá nhân hiện giữ khả năng đọc dữ liệu của chính tài khoản ADMIN để tương thích; trang giao diện không sử dụng khả năng này cho admin.

- Xem lịch cũ, lịch đang diễn ra và lịch sắp tới, bao gồm các trạng thái chờ duyệt, đã duyệt, từ chối, đã hủy và hết hạn.
- Lọc theo phòng, khoảng ngày, trạng thái và nhóm đã kết thúc/sắp tới. Bộ lọc áp dụng khi nhấn nút, phân trang 10 lịch mỗi trang.
- Khoảng ngày lấy các lịch giao với khoảng đã chọn theo giờ Việt Nam, tính hết ngày kết thúc. Kết quả sắp theo thời gian giảm dần, riêng nhóm sắp tới tăng dần; ID là khóa phụ để giữ phân trang ổn định.
- Mở chi tiết độc lập bằng `?bookingId=...`, kể cả lịch không nằm trên trang kết quả hiện tại. Có ghi chú quyết định, hạn duyệt, sĩ số và tình trạng phòng.
- Sửa PENDING còn hạn bằng biểu mẫu hiện có, hủy lịch qua hộp thoại xác nhận, mở thiết bị trong ca hợp lệ và đọc báo cáo buổi học. Backend tiếp tục kiểm tra quyền và thời điểm ở mỗi thao tác.
- Có liên kết tới lịch sử lệnh vốn đã giới hạn theo tài khoản giáo viên. STUDENT không có đường dẫn lịch cá nhân giáo viên và bị chặn trực tiếp tại API.

API:

| Endpoint | Nội dung |
|---|---|
| GET `/api/teaching/bookings` | Bộ lọc `page`, `size`, `period=ALL/PAST/UPCOMING`, `status`, `roomId`, `from`, `to`; trả `rows`, `totalElements`, `totalPages`, `page`, `size` |
| GET `/api/teaching/bookings/{id}` | Chi tiết lịch thuộc người đăng nhập; lịch của người khác trả 404 |

Không nhận `ownerId` từ client để quyết định quyền. Kích thước trang tối đa 50, chỉ số trang tối đa 10000. Các thao tác sửa/hủy/báo cáo dùng lại API và quy tắc nghiệp vụ đã có.

## Thông báo cá nhân

Biểu tượng chuông nằm ở đầu trang cho cả ba vai trò, hiển thị số chưa đọc và mở `/notifications`. Danh sách có bộ lọc chưa đọc, phân trang, đánh dấu từng thông báo hoặc tất cả thông báo đã tải là đã đọc. Trạng thái lưu trong MySQL nên vẫn giữ khi tải lại hoặc đăng nhập lại.

Các nguồn thông báo:

| Sự kiện | Người nhận |
|---|---|
| Đăng ký phòng mới hoặc sửa lịch đang chờ | ADMIN |
| Lịch được duyệt, từ chối hoặc hủy | Chủ lịch |
| Lịch bị hủy khi phòng bảo trì/tạm ngưng | Chủ các lịch bị ảnh hưởng |
| Lịch chờ hết hạn | Chủ lịch, một lần khi đổi trạng thái |
| Báo sự cố mới | ADMIN |
| Sự cố đổi trạng thái xử lý | Người đã báo sự cố |

Thông báo được ghi cùng giao dịch với thay đổi nghiệp vụ. Nếu thay đổi bị rollback thì thông báo cũng rollback. Không tạo thông báo lịch sử giả cho các quyết định đã xảy ra trước khi triển khai.

Tác vụ hết hạn chọn và cập nhật cùng một mốc thời gian dưới khóa nghiệp vụ. Chạy tác vụ nhiều lần không tạo lại thông báo cho lịch đã hết hạn. Thao tác bảo trì chỉ thông báo cho các lịch thực sự được đổi trạng thái trong lượt lưu.

## API và quyền riêng tư

| Endpoint | Nội dung |
|---|---|
| GET `/api/notifications` | Danh sách riêng của người đăng nhập, hỗ trợ `page`, `size`, `unreadOnly` |
| GET `/api/notifications/unread-count` | Số chưa đọc riêng của người đăng nhập |
| PATCH `/api/notifications/{id}/read` | Đánh dấu một thông báo thuộc tài khoản; gọi lại giữ nguyên thời điểm đọc đầu tiên |
| POST `/api/notifications/read-all` | Nhận `{ "upToId": ... }`, chỉ đánh dấu các thông báo tới mốc đã tải |

Danh sách trả thêm `unreadCount` và `latestId`. Mốc `latestId` giúp không đánh dấu nhầm thông báo vừa xuất hiện sau khi người dùng tải danh sách. Mọi truy vấn/cập nhật đều giới hạn `recipient_id` từ tài khoản đã xác thực; không tin ID người nhận truyền trong tham số. Truy cập ID thông báo của người khác trả 404.

Flyway V5 tạo bảng `app_notifications`, khóa ngoại tới tài khoản và các chỉ mục cho danh sách/chưa đọc. Xóa tài khoản sẽ xóa thông báo thuộc tài khoản đó; không ảnh hưởng bản ghi lịch/sự cố hiện có. Không thay đổi schema telemetry, command logs, flow Node-RED, MQTT hoặc firmware.

## Điều hướng và giao diện

- Chuông và trang thông báo tự cập nhật mỗi 30 giây khi đang hiển thị; dừng đọc nền khi tab trình duyệt bị ẩn. Sau đánh dấu đã đọc, số trên chuông được làm mới ngay.
- Thông báo của chủ lịch mở chi tiết tại `/my-schedule?bookingId=...`.
- Thông báo duyệt dành ADMIN mở và đánh dấu lịch tương ứng trong trang phòng, kể cả ngoài khoảng lịch mặc định.
- Thông báo sự cố mở đúng phòng, tab sự cố và hộp thoại chi tiết/lịch sử xử lý theo `incidentId`; API chi tiết vẫn kiểm tra người báo hoặc ADMIN.
- Đọc thất bại giữ trạng thái chưa đọc và hiển thị lỗi để thử lại. Đường dẫn mở nội dung chỉ chấp nhận các route nội bộ đã định sẵn.
- Giao diện có trạng thái đang tải, rỗng, lỗi, phân trang, nhãn truy cập và bố cục cho màn hình nhỏ.

Đây là thông báo trong ứng dụng, chưa bao gồm email, push hệ điều hành hoặc WebSocket. Bản lưu bắt đầu từ các sự kiện phát sinh sau khi triển khai; lịch cũ vẫn xem được qua Lịch của tôi.
