# Quản lý Nhà A

## Danh mục và phạm vi

Nhà A khởi tạo theo danh mục đã thống nhất: 3 tầng, mỗi tầng 5 phòng, gồm 101–105, 201–205, 301–305. Sức chứa ban đầu 40 chỗ/phòng là cấu hình khởi tạo để quản trị viên điều chỉnh theo thực tế; trang thiết bị ban đầu chưa khai báo. Đây là danh mục phòng, không phải dữ liệu IoT mô phỏng.

Chỉ phòng 101 có phần cứng ESP và được đọc telemetry/điều khiển từ kết nối hiện tại. Những phòng còn lại quản lý lịch, sức chứa, bảo trì và sự cố; số liệu cảm biến luôn `null`, giao diện ghi “Chưa kết nối IoT”. Không dùng dữ liệu phòng 101 thay thế.

## Giao diện

- `/building`: tổng quan toàn Nhà A, dành cho người đã đăng nhập. ADMIN đăng nhập từ trang login không có đường dẫn quay lại sẽ vào trang này.
- `/classroom?roomId=102`: lịch, báo cáo và sự cố của phòng được chọn. Không có `roomId` mặc định là 101 để giữ tương thích.
- `/dashboard`: cảm biến và điều khiển thật của phòng 101, được ghi rõ trong tiêu đề.

Trang Nhà A hiển thị số phòng, số phòng đang có tiết, trống theo lịch, bảo trì/tạm ngưng và lịch chờ duyệt. Mỗi phòng có sức chứa, trang thiết bị, buổi học hiện tại, buổi tiếp theo, số sự cố mở, số lịch chờ và liên kết tới nghiệp vụ riêng. Có thể lọc theo tầng, trạng thái, sức chứa và từ khóa phòng/trang thiết bị.

Tự cập nhật mỗi 15 giây khi tab hiển thị. Nếu tải lỗi, dữ liệu cũ được giữ với thông báo rõ ràng. Phòng 101 ghi thời điểm mẫu đo và phân biệt `ONLINE`, `STALE`, `NO_DATA`. “ONLINE” ở đây là có mẫu telemetry còn mới theo ngưỡng, không phải kết quả ping thiết bị.

## Trạng thái phòng

| Trạng thái | Cách xác định |
|---|---|
| Đang có tiết | Có lịch `APPROVED` tại thời điểm hiện tại |
| Trống theo lịch | Phòng `ACTIVE`, không có lịch đã duyệt đang diễn ra |
| Đang bảo trì | Quản trị viên đặt `MAINTENANCE` |
| Tạm ngưng | Quản trị viên đặt `INACTIVE` |

Trống theo lịch không chứng minh không có người. Lịch `PENDING` không được tính là tiết đang diễn ra, nhưng vẫn giữ chỗ khi tìm phòng. PIR phòng 101 hiển thị riêng. Khi có tín hiệu người và không có tiết đã duyệt, hệ thống đưa ra lưu ý kiểm tra; không kết luận có người sử dụng trái phép.

## Tìm phòng trống và thống kê

Nhập cả giờ bắt đầu/kết thúc theo UTC+07, khoảng lớn hơn 0 và tối đa 31 ngày. Mặc định là từ hiện tại đến một giờ sau. Phòng khả dụng phải `ACTIVE` và không giao với lịch `PENDING` hoặc `APPROVED` trong khoảng chọn. Bộ lọc sức chứa giúp tìm phòng đủ sĩ số.

Tỷ lệ đặt lịch = tổng thời gian lịch đã duyệt giao với khoảng chọn / độ dài khoảng chọn. Đây là tỷ lệ đặt lịch theo thời gian lịch, chưa trừ giờ nghỉ/ngày nghỉ, không phải thời gian có người hoặc tỷ lệ sử dụng điện. Lịch chờ duyệt không được tính vào tỷ lệ.

## Đăng ký và phân quyền

Request đặt lịch bổ sung `roomId`, `expectedAttendees`. Nếu thiếu, mặc định phòng 101, sĩ số 1 để tương thích các client cũ. Sĩ số phải từ 1 đến sức chứa phòng. Không cho đăng ký hoặc duyệt lịch mới ở phòng bảo trì/tạm ngưng.

Chống trùng lịch trong cùng phòng. Hai phòng khác nhau có thể có tiết đồng thời; riêng một TEACHER không thể giữ hai lịch chờ/đã duyệt giao nhau ở hai phòng. ADMIN có thể tạo lịch quản lý tại nhiều phòng đồng thời. Thao tác thay đổi phòng/lịch dùng cùng khóa cấu hình để bảo đảm kiểm tra trùng và cập nhật nhất quán ở quy mô Nhà A.

Giáo viên có lịch tại 102 không được cấp quyền điều khiển ESP 101. Chỉ ca đã duyệt của chính giáo viên tại 101 đang diễn ra mới cấp quyền. ADMIN cũng bị khóa điều khiển khi phòng 101 bảo trì/tạm ngưng. `POST /api/control` vẫn giữ payload `target`, `action`; luôn tác động bộ chấp hành cấu hình hiện có của phòng 101. Giao thức MQTT và Node-RED không thay đổi.

## Quản lý phòng và bảo trì

Chỉ ADMIN được thêm/sửa phòng, sức chứa, tầng, trang thiết bị và trạng thái. Số phòng duy nhất, từ 100 đến 9999, không đổi sau khi tạo. Tầng từ 1 đến 20, sức chứa từ 1 đến 1000; hỗ trợ tối đa 200 phòng.

Bắt buộc ghi lý do khi bảo trì hoặc tạm ngưng. Không xóa phòng có lịch sử; tạm ngưng thay thế thao tác xóa. Mỗi lần tạo/sửa ghi tài khoản, thời điểm và nội dung vào nhật ký phòng. Không được giảm sức chứa xuống dưới sĩ số của lịch chờ/đã duyệt chưa kết thúc.

Khi bảo trì, lịch cũ không tự bị hủy; người quản lý cần xử lý lại lịch hoặc thông báo cho người đăng ký. Trang vẫn hiển thị thông tin lịch nếu có nhưng trạng thái bảo trì được ưu tiên. Không tự phát lệnh IoT khi chuyển trạng thái.

## Tách dữ liệu và di chuyển dữ liệu cũ

Flyway V3 tạo `classroom_rooms`, `classroom_room_events`, thêm `room_id` vào bookings, incidents, alerts và command attempts; bổ sung sĩ số dự kiến. Các bản ghi nghiệp vụ cũ được gán phòng 101. Không sửa V1/V2, không tạo telemetry mẫu, không thay bảng hoặc hợp đồng SQL của Node-RED.

Lịch, sự cố, cảnh báo và kết quả lệnh được lọc theo phòng. Thiết bị gắn vào báo cáo sự cố phải thuộc phòng đó. Cấu hình cảm biến chỉ chấp nhận SENSOR được gán phòng 101; truy vấn tổng quan và báo cáo cũng kiểm tra thiết bị thuộc 101. Phòng chưa có IoT vẫn có báo cáo lịch sử dụng, nhưng thống kê môi trường bằng 0 mẫu và các trung bình `null`.

## API

Đều yêu cầu JWT, dùng wrapper `ApiResponse`, trả `Cache-Control: no-store`.

| Phương thức | Đường dẫn | Chức năng |
|---|---|---|
| GET | `/api/building/overview?from=...&to=...` | Tổng quan, lịch hiện tại/tiếp theo, khả dụng, tỷ lệ đặt lịch và telemetry thật |
| GET | `/api/building/rooms` | Danh mục phòng |
| POST | `/api/building/rooms` | ADMIN tạo phòng |
| PUT | `/api/building/rooms/{id}` | ADMIN sửa phòng |
| GET | `/api/building/rooms/{id}/events` | ADMIN đọc tối đa 100 thay đổi gần nhất |

Request tạo/sửa phòng: `{roomId, name, floor, capacity, equipment, status, note}`. `status` là `ACTIVE`, `MAINTENANCE`, `INACTIVE`.

Các endpoint `/api/classroom/bookings`, `/incidents`, `/alerts`, `/attempts`, `/permission` nhận query `roomId`, mặc định 101. POST booking và incident nhận `roomId` trong body. Quyền đọc báo cáo/sự cố cá nhân tiếp tục được kiểm tra độc lập với query phòng.

## Kiểm tra thủ công

1. Đăng nhập ADMIN, vào Nhà A: thấy 15 phòng; chỉ 101 có khu vực cảm biến.
2. Mở phòng 102, đặt lịch tương lai với sĩ số không vượt 40; ADMIN duyệt lịch. Đến giờ, phòng 102 chuyển “Đang có tiết”, phòng 101 không bị ảnh hưởng.
3. Thử cùng giờ tại cùng phòng: bị chặn. Giáo viên đặt lịch giao nhau ở phòng khác: bị chặn do trùng người dạy. ADMIN đăng ký phòng khác cùng giờ: được phép.
4. Tìm phòng theo khoảng vừa đặt: phòng đã giữ chỗ không nằm trong kết quả khả dụng. Lọc tầng/sức chứa/trang thiết bị.
5. ADMIN đổi phòng 101 sang bảo trì kèm lý do: đăng ký/duyệt mới và điều khiển bị chặn. Khôi phục hoạt động sau khi kiểm tra.
6. Báo cáo phòng 102 không có nhiệt độ phòng 101. Báo sự cố phòng 102 không được gắn `node1_sensor` của phòng 101.

Kiểm thử tự động Backend dùng MySQL riêng `smartclass_verify_*`; Frontend có `tests/building.spec.js` dùng HTTP mock. Kiểm thử giao diện không chứng minh phần cứng thật hoạt động.
