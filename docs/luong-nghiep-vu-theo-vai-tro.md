# Luồng nghiệp vụ và giao diện theo vai trò

## Phạm vi quyền

| Chức năng | ADMIN | TEACHER | STUDENT |
|---|---|---|---|
| Tra cứu phòng, lịch phòng, cảm biến | Có | Có | Có |
| Đăng ký sử dụng phòng | Có, vẫn cần xác nhận duyệt | Có | Không |
| Sửa lịch đang chờ | Mọi lịch | Lịch của mình | Không |
| Duyệt/từ chối lịch | Có | Không | Không |
| Hủy lịch chưa kết thúc | Mọi lịch hợp lệ | Lịch của mình | Không |
| Điều khiển IoT | Theo trạng thái phòng/thiết bị | Ca của mình đã duyệt, đang diễn ra | Không |
| Xem lịch sử lệnh | Toàn hệ thống | Chỉ lệnh do mình thực hiện | Không |
| Xác nhận cảnh báo | Mọi cảnh báo | Phòng có ca của mình đang diễn ra | Không |
| Báo sự cố, xem báo cáo mình gửi | Có | Có | Có |
| Xử lý sự cố | Có | Không | Không |
| Xem báo cáo buổi học | Mọi lịch | Lịch của mình | Không |
| Quản trị phòng/tài khoản/thiết bị | Có | Không | Không |

Lịch sử môi trường và lịch sử dụng phòng là thông tin dùng chung cho tài khoản đăng nhập. Nội dung chi tiết sự cố chỉ dành cho người báo và ADMIN. Tổng hợp tình trạng sự cố phòng chỉ có mã thiết bị, trạng thái và số báo cáo, không có người báo hoặc mô tả riêng.

## Tổng quan theo công việc

- ADMIN: hàng đợi lịch chờ duyệt của toàn dãy nhà, xác nhận duyệt/từ chối trong hộp thoại, sự cố cần xử lý.
- TEACHER: lịch sắp tới của mình, kết quả duyệt/từ chối/hủy, lý do bảo trì và đường dẫn mở thiết bị trong ca đang diễn ra.
- STUDENT: tiến độ sự cố mình đã báo, liên kết tới đúng phòng, tra cứu phòng và môi trường; không có nhật ký điều khiển.
- Các chỉ số công khai của toàn dãy nhà có nhãn rõ phạm vi. Công việc cá nhân tải độc lập với Tổng quan; lỗi một phần không làm mất toàn bộ trang.

`GET /api/classroom/workspace` trả `bookings`, `incidents`, `bookingLimit`, `incidentLimit`. ADMIN nhận lịch còn hạn đang chờ; TEACHER nhận lịch của mình chưa kết thúc; STUDENT không nhận lịch cá nhân vì chưa có mô hình ghi danh lớp. Mỗi danh sách tối đa 100 bản ghi; giao diện hiển thị tối đa 8 sự cố và ghi rõ giới hạn.

## Vòng đời lịch

1. ADMIN hoặc TEACHER tạo lịch ở phòng hoạt động, kiểm tra sức chứa và thời gian tương lai, tối đa 12 giờ.
2. Lịch PENDING giữ chỗ đến thời điểm sớm hơn giữa sau 24 giờ tạo yêu cầu và giờ bắt đầu. `expires_at` được trả cùng lịch.
3. Chỉ chủ lịch hoặc ADMIN sửa lịch PENDING còn hạn bằng `PUT /api/classroom/bookings/{id}`; kiểm tra trùng phòng, trùng giáo viên, sức chứa và thời gian trong cùng giao dịch. Sửa lịch không kéo dài hạn duyệt cũ.
4. ADMIN duyệt hoặc từ chối. Luồng tạo và duyệt vẫn tách hai bước có chủ ý để tránh duyệt ngoài ý muốn. Giao diện có hàng đợi duyệt nhanh kèm hộp thoại xác nhận.
5. Tác vụ mỗi 30 giây chuyển lịch chờ quá hạn thành EXPIRED. Khi tạo, sửa, quyết định lịch, Backend cũng xử lý lịch quá hạn trước khi kiểm tra.
6. Giao diện khóa thao tác đã hết hạn/hết giờ. Backend luôn kiểm tra lại để xử lý trường hợp thời gian hoặc dữ liệu thay đổi sau khi tải trang.

## Bảo trì và tạm ngưng

`GET /api/building/rooms/{id}/impact` chỉ dành ADMIN, trả danh sách lịch chờ/đã duyệt chưa kết thúc bị ảnh hưởng.

Khi PUT phòng sang MAINTENANCE/INACTIVE có lịch bị ảnh hưởng, Backend mặc định trả 409. ADMIN phải xem danh sách và chọn xác nhận hủy; giao diện gửi `cancelAffectedBookings=true`. Cập nhật trạng thái phòng và hủy lịch trong cùng giao dịch, giữ bản ghi lịch và lưu lý do vào `decision_note`. Giáo viên thấy trạng thái hủy và lý do trong Lịch của tôi. Đây là thông báo trong ứng dụng, chưa có email/push.

Backend kiểm tra lại danh sách khi lưu, kể cả khi xuất hiện lịch mới sau lượt xem trước. Luồng chuyển lịch sang phòng khác dành cho lịch đang chờ được thực hiện qua chức năng sửa đăng ký; chưa hỗ trợ tự chuyển hàng loạt lịch đã duyệt.

## Cấu hình lịch sử và thiết bị

Flyway V4 bổ sung `expires_at`, trạng thái EXPIRED và bảng `classroom_booking_context`. Khi duyệt, hệ thống lưu cảm biến và ngưỡng vào bản cấu hình theo lịch. Báo cáo ca này dùng cấu hình đã lưu, không lọc lịch sử theo vị trí thiết bị hiện tại.

Các lịch cũ chưa có bản lưu không được tạo cấu hình quá khứ giả định; báo cáo ghi rõ đang dùng cấu hình hiện tại. Tên phòng hiển thị lấy từ danh mục `classroom_rooms`; trường tên trong tab ngưỡng chỉ đọc, đổi tên tại quản lý phòng.

Thiết bị đang được cấu hình cho luồng IoT hoặc cảm biến gắn với ca đã duyệt chưa kết thúc được bảo vệ trước thao tác đổi phòng/loại hoặc xóa. ADMIN vẫn có thể đổi trạng thái quản trị. Trạng thái Active không được dùng làm bằng chứng kết nối trực tiếp.

Quyền xác nhận cảnh báo tách khỏi quyền gửi lệnh: giáo viên có ca đang diễn ra vẫn xác nhận được cảnh báo khi bộ điều khiển đang Offline; không vì vậy được mở điều khiển.

## Tra cứu và biểu mẫu

- Lịch sử có chọn phòng và thiết bị; chọn phòng chỉ là bước lấy danh sách thiết bị, phải chọn thiết bị để áp dụng bộ lọc dữ liệu. Giao diện nêu rõ nếu chưa lọc. Đổi phòng xóa bộ lọc thiết bị của cả hai tab để tránh giữ nhầm ngữ cảnh.
- STUDENT chỉ thấy tab cảm biến. TEACHER không có bộ lọc chọn người gửi khác; Backend luôn ép người thực hiện về tài khoản đang đăng nhập, bất kể tham số từ client.
- Báo sự cố chọn thiết bị đã đăng ký trong phòng, hoặc chọn Toàn phòng. Có tổng hợp sự cố chung để hạn chế báo trùng.
- Biểu mẫu quản trị thiết bị có lựa chọn nhanh tầng/phòng và giải thích đăng ký khác với cấu hình tích hợp.
- Dữ liệu chính của tab phòng tải độc lập với quyền/cấu hình phụ. Lỗi request phụ không chặn tra cứu lịch hoặc sự cố.

## Giới hạn còn lại

- Luồng Node-RED hiện vẫn cấu hình một bộ điều khiển ở phòng 101 với FAN/LIGHT. Điều khiển nhiều ESP độc lập cần thay hợp đồng định tuyến và xác minh ACK/flow thật; không mở quyền dựa trên thao tác đăng ký thiết bị đơn thuần.
- Các danh sách lịch/cảnh báo/sự cố cũ vẫn có giới hạn được ghi trên giao diện; chưa chuyển toàn bộ sang phân trang Backend.
- Không có email/push, chuyển lịch đã duyệt hàng loạt hoặc mô hình ghi danh sinh viên trong phạm vi này.
