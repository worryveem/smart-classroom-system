# Vận hành phòng học

## Mở rộng Nhà A

Hiện hỗ trợ nhiều phòng tại `/classroom?roomId=...`, mặc định 101. Chỉ 101 có IoT, các phòng còn lại dùng lịch/báo cáo/sự cố riêng và không có dữ liệu cảm biến. POST lịch bổ sung `roomId`, `expectedAttendees`; POST sự cố bổ sung `roomId`. Có kiểm tra sức chứa, trạng thái phòng và trùng lịch của giáo viên giữa các phòng. ADMIN cũng không điều khiển được khi phòng 101 bảo trì. Xem [quản lý Nhà A](building-a.md). Những mô tả một phòng bên dưới là nền tảng V2, áp dụng theo từng phòng trong V3.

## Phạm vi và sử dụng

Mở menu **Vận hành phòng** tại `/classroom`. Chỉ một phòng có phần cứng thật; không tạo dữ liệu cảm biến giả. Giữ nguyên ESP32, MQTT, Mosquitto, flow Node-RED và HTTP State/Control. Các bảng bổ sung thuộc Spring Boot, Node-RED không cần đọc/ghi.

Khởi động lại Backend để Flyway áp dụng V2, không cần biến môi trường mới. Đăng nhập lại nếu JWT secret thay đổi. Không có telemetry thì báo cáo giữ rỗng, hệ thống có thể tạo cảnh báo thiếu dữ liệu.

## Phân quyền

| Chức năng | ADMIN | TEACHER | STUDENT |
|---|---|---|---|
| Xem lịch và cảnh báo | Có | Có | Có |
| Đăng ký lịch | Có | Có | Không |
| Duyệt/từ chối lịch | Có | Không | Không |
| Hủy lịch chưa kết thúc | Mọi lịch | Của mình | Không |
| Điều khiển FAN/LIGHT | Mọi thời điểm | Ca đã duyệt của mình | Không |
| Báo cáo sự cố | Có | Có | Có |
| Xem sự cố và lịch sử xử lý | Tất cả | Của mình | Của mình |
| Cập nhật xử lý sự cố | Có | Không | Không |
| Xác nhận đã xem cảnh báo | Có | Có | Không |
| Xem/xuất báo cáo buổi học | Mọi lịch | Của mình | Không |
| Xem kết quả điều khiển | Tất cả | Của mình | Không |
| Đổi ngưỡng cảnh báo | Có | Không | Không |

## Lịch và quyền điều khiển

Tạo lịch tương lai, kết thúc sau bắt đầu, tối đa 12 giờ; ban đầu `PENDING`. Quản trị viên duyệt sang `APPROVED` hoặc từ chối sang `REJECTED`. Chủ lịch hoặc quản trị viên có thể hủy lịch đang chờ/đã duyệt sang `CANCELLED` khi chưa kết thúc. Không phục hồi lịch đã hủy/từ chối.

Lịch chờ duyệt và đã duyệt đều giữ chỗ. Điều kiện trùng là `starts_at < newEnd AND ends_at > newStart`; cho phép hai ca sát nhau. Khóa dòng cấu hình phòng khi thay đổi lịch để chống hai đăng ký đồng thời. Thời gian nhập dùng UTC+07.

Giáo viên được điều khiển trong `[startsAt, endsAt)` của ca đã duyệt. Dashboard đọc quyền mỗi 15 giây; Backend kiểm tra lại trước khi gửi. Quản trị viên được điều khiển ngoài lịch. Lệnh bị từ chối quyền không chuyển tới Node-RED. Không tự bật/tắt thiết bị khi đến giờ học.

Danh sách mặc định từ đầu ngày 7 ngày trước, trong khoảng 45 ngày. Lọc khoảng tối đa 93 ngày, trả tối đa 500 lịch; giới hạn được thông báo trên giao diện.

## Cảnh báo

Kiểm tra telemetry MySQL thật mỗi 30 giây, bắt đầu sau 15 giây. Cấu hình mặc định: `node1_sensor`, nhiệt độ trên 32 °C, ánh sáng dưới 150 lux khi có người, điều kiện kéo dài qua mẫu đo ít nhất 120 giây, thiếu dữ liệu sau 300 giây.

Cần chuỗi mẫu thỏa điều kiện; khoảng cách giữa các mẫu không lớn hơn thời gian mất dữ liệu. Giá trị thiếu hoặc mẫu không thỏa điều kiện cắt chuỗi. Đây là suy luận qua quan sát, không chứng minh giá trị liên tục giữa các lần đo. Ngưỡng phục vụ quản lý, không phải chuẩn đánh giá sức khỏe.

Mỗi loại chỉ có một cảnh báo đang diễn ra trong luồng xử lý được khóa. Xác nhận đã xem lưu người/thời điểm, không kết thúc cảnh báo. Khi mất dữ liệu, giữ cảnh báo môi trường cũ, không suy luận đã hồi phục. Có dữ liệu đủ gần và không còn thỏa quy tắc thì kết thúc cảnh báo.

Cửa sổ đánh giá lấy tối đa 10.001 mẫu; vượt 10.000 thì bỏ qua đánh giá môi trường thay vì dùng cửa sổ bị cắt. Danh sách tối đa 200 cảnh báo, ưu tiên chưa kết thúc. Tắt bộ kiểm tra bằng `app.classroom.alerts-enabled=false`; đổi chu kỳ qua `app.classroom.alert-interval-ms`.

Đổi mã cảm biến trong tab cấu hình chỉ ảnh hưởng cảnh báo/báo cáo, không tự đổi cấu hình Dashboard hoặc Node-RED.

## Báo cáo và CSV

Đọc telemetry của cảm biến cấu hình trong `[starts_at, ends_at)`: số mẫu, nhiệt độ trung bình/thấp nhất/cao nhất, độ ẩm và ánh sáng trung bình, số mẫu vượt ngưỡng nhiệt hoặc thiếu sáng khi có người. Không có mẫu thì trung bình là `null`, hiển thị “Chưa có dữ liệu”.

Kèm số lệnh theo kết quả và cảnh báo giao với thời gian buổi học. Lệnh giáo viên gắn ca cấp quyền; lệnh quản trị viên gắn ca đã duyệt đang diễn ra nếu có. Tải CSV UTF-8, xử lý giá trị văn bản có thể bị spreadsheet hiểu thành công thức.

Giới hạn: dùng cấu hình ngưỡng/cảm biến hiện tại, chưa lưu ảnh chụp cấu hình theo ca. Chưa suy ra số phút vượt ngưỡng, điện năng, sĩ số hoặc điểm danh. Lệnh cũ không có trạng thái xác nhận không được chuyển thành thành công. Ca chưa kết thúc chỉ báo cáo dữ liệu đã nhận.

## Sự cố

Báo cáo gồm tiêu đề, mô tả, mã thiết bị tùy chọn được kiểm tra tồn tại khi tạo. Quản trị viên đổi `OPEN`, `IN_PROGRESS`, `RESOLVED` với ghi chú bắt buộc. Cho phép mở lại; mỗi thay đổi thêm sự kiện riêng, không ghi đè lịch sử. Xử lý sự cố không tự phát lệnh vật lý.

## Kết quả lệnh

`ClassroomControlService` kiểm tra quyền, ghi `PENDING`, sau đó gọi `ControlService` cũ ngoài transaction. Nếu không ghi được lần gửi thì không phát lệnh. Payload tới Node-RED giữ `target`, `action`.

Kết quả gồm `SUCCESS`, `ACCEPTED`, `FAILURE`, `TIMEOUT`, `UNCONFIRMED` và trạng thái lưu `command_logs`. `ACCEPTED` chưa chứng minh thực thi. Mất kết nối/ACK không tương ứng không được kết luận là thất bại vật lý đã xác nhận. Khi cập nhật kết quả lỗi hoặc tiến trình dừng, giữ `PENDING`, hiển thị “Đang chờ / chưa xác nhận”. Không tự gửi lại. Chưa thêm mã chống trùng tới firmware vì giữ giao thức IoT.

## API

Đều cần JWT, trả `ApiResponse`, header `Cache-Control: no-store`, dưới `/api/classroom`.

| Phương thức | Đường dẫn | Chức năng |
|---|---|---|
| GET / PUT | `/settings` | Đọc/sửa cấu hình |
| GET | `/permission` | Quyền và `bookingId` |
| GET / POST | `/bookings` | Xem/đăng ký lịch; GET có `from`, `to` |
| PATCH | `/bookings/{id}` | Quyết định `{status, note}` |
| GET | `/bookings/{id}/report` | Báo cáo |
| GET | `/alerts` | Cảnh báo |
| POST | `/alerts/{id}/acknowledge` | Xác nhận đã xem |
| GET / POST | `/incidents` | Xem/báo sự cố |
| PATCH | `/incidents/{id}` | Xử lý `{status, note}` |
| GET | `/incidents/{id}/events` | Lịch sử xử lý |
| GET | `/attempts` | Kết quả lệnh |

POST lịch nhận `{title, startsAt, endsAt}`. POST sự cố nhận `{title, description, deviceId}`. PUT cấu hình nhận `{name, sensorDeviceId, temperatureLimit, minimumLux, sustainedSeconds, offlineSeconds}`. Request dùng camelCase, trường database trong response dùng snake_case; quyền dùng `bookingId`.

## Kiểm thử

Backend dùng `backend/scripts/test-mysql.ps1`, tạo database mới `smartclass_verify_*`. Kiểm tra trùng lịch đồng thời, duyệt/hủy, quyền theo ca, sự cố, cảnh báo không trùng/hồi phục, báo cáo thời gian, lỗi lưu kết quả không gây gửi lại.

Frontend dùng `npm test`, bổ sung `tests/classroom.spec.js` và quyền Dashboard. Có thể đặt `$env:SMARTCLASS_BROWSER_CHANNEL='chrome'` để dùng Chrome cài sẵn. Kiểm thử HTTP mock không chứng minh phần cứng hoạt động.
