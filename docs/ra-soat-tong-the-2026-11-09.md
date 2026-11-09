# Rà soát tổng thể chức năng ngày 09/11/2026

## Kết luận

Các luồng chính đã phù hợp cho hệ thống lớp học thử nghiệm: phân quyền theo vai trò, đăng ký/duyệt phòng, lịch giáo viên, quản lý phòng/thiết bị, tra cứu môi trường, báo sự cố, thông báo và tài khoản cá nhân. Chưa nên coi hệ thống đã hoàn thiện vận hành thực tế: phần tự động điều khiển còn thiếu đối chiếu relay và ghi nhận theo ca; AI gợi ý chưa được tích hợp; một số luồng thông báo và cấu hình chưa đồng nhất.

Rà soát gồm đọc mã nguồn hiện tại, chạy bộ kiểm thử và gọi API chỉ đọc trên backend đang chạy bằng ba tài khoản mẫu. Không bật tự động, không gửi lệnh vật lý, không tạo/sửa/xóa dữ liệu nghiệp vụ thật để kiểm tra.

## Các nhóm chức năng

| Nhóm | Đánh giá | Điểm cần giữ hoặc hoàn thiện |
|---|---|---|
| Đăng nhập, phiên và phân quyền | Hợp lý | Backend đọc lại quyền tài khoản; không tin role trong JWT; đổi mật khẩu vô hiệu hóa phiên cũ |
| Hồ sơ và đổi mật khẩu | Hợp lý | Tách thông tin cá nhân khỏi quyền/định danh; kiểm tra mật khẩu hiện tại |
| Quản trị tài khoản | Hợp lý về quyền | Chỉ admin; có bảo vệ admin cuối cùng và không tự xóa tài khoản đang dùng |
| Danh mục phòng và bảo trì | Hợp lý | Hiển thị tác động, yêu cầu xác nhận hủy lịch bị ảnh hưởng, giữ lịch sử |
| Đăng ký, sửa, duyệt và hủy lịch | Hợp lý | Kiểm tra thời gian, trùng phòng/giáo viên, sức chứa và hạn duyệt |
| Lịch của tôi | Phù hợp cho giáo viên | Menu/route đã bỏ admin; thông báo còn đường dẫn cũ cần sửa |
| Báo cáo sự cố | Hợp lý về phạm vi dữ liệu | Admin xem tất cả, tài khoản khác chỉ xem của mình; còn hai form chưa đồng nhất |
| Thông báo | Có ích và có phân quyền | Cần điều hướng theo vai trò cho lịch và liên kết tới trang sự cố mới |
| Lịch sử cảm biến/lệnh | Hợp lý | Học viên không xem lệnh, giáo viên chỉ xem lệnh của mình; thiếu cách xem lệnh tự động trong ca |
| Điều khiển thủ công | Hợp lý trong phạm vi phòng 101 | Kiểm tra ca, phòng/thiết bị, ACK; chặn khi AUTO bật; chưa xác minh phần cứng |
| Điều khiển tự động | Cần ưu tiên hoàn thiện | Đối chiếu State, quyền tắt chế độ, báo cáo theo ca và trạng thái vận hành |
| AI phát hiện bất thường/hiện diện | Mới ở mức API thử nghiệm | Chưa nối frontend/backend; chưa chuẩn hóa đầy đủ đầu vào ESP và xác minh suy luận thật |
| Quản trị thiết bị | Có khoảng trống dữ liệu | Chưa bắt buộc roomId tồn tại trong danh mục; đăng ký thiết bị chưa tạo tích hợp IoT |

## Phát hiện ưu tiên cao

### 1. Tự động dùng lệnh đã xác nhận gần nhất thay cho trạng thái relay hiện tại

- Căn cứ: `AutomationService.send`, đoạn so sánh `action.name()` với `fan_action` hoặc `light_action` trước khi gửi lệnh.
- Tình huống: đã gửi ON thành công, sau đó ESP khởi động lại làm relay về OFF. Khi nhiệt độ vẫn cao, hệ thống thấy cache ON nên bỏ qua, dù relay thật có thể đang OFF.
- Đây là rủi ro rút ra từ luồng mã; chưa tái hiện bằng ESP thật. Giới hạn này đã được ghi trong tài liệu tự động nhưng vẫn ảnh hưởng tính đúng khi vận hành.
- Đề xuất: đối chiếu State có định danh/thời gian hợp lệ; phân biệt cấu hình được bật, đang vận hành, đang chờ dữ liệu và kết quả vật lý chưa xác nhận. Không biến việc đối chiếu thành tự gửi lại lệnh timeout chưa rõ kết quả.

### 2. Tắt tự động bị phụ thuộc vào quyền gửi lệnh vật lý và lỗi biểu mẫu

- Backend `AutomationService.save` luôn kiểm tra `classroom.permission(...).allowed`, kể cả `enabled=false`. Quyền này bị từ chối khi phòng bảo trì hoặc actuator không hợp lệ.
- Vì vậy admin có thể không chủ động tắt được cấu hình trong lúc thiết bị bị đình chỉ/offline; cần chờ scheduler phát hiện và dừng. Nếu scheduler bị tắt do cấu hình triển khai, chế độ có thể tiếp tục khóa đường điều khiển thủ công.
- Frontend `AutomationPage` dùng chung biến `unavailable` có `!!error` cho công tắc. Khi đã phát sinh lỗi ngưỡng hoặc tải/lưu, nút tắt bị khóa cho đến khi thử lại, sửa ô hoặc có lượt tải thành công. Việc cho tắt khi ô đang sửa chưa hợp lệ chưa bao phủ trường hợp đã bấm lưu gây lỗi.
- Đề xuất: tách thao tác tắt khỏi lưu ngưỡng; cho admin và người được cấp quyền dừng cấu hình ngay, không yêu cầu thiết bị online. Không gửi lệnh vật lý khi chỉ tắt chế độ. Giữ cơ chế tránh xung đột với lệnh đang xử lý và diễn đạt rõ lệnh nào đã được gửi.

### 3. Lệnh tự động chưa xuất hiện trong báo cáo buổi học

- `AutomationService` gọi `ControlService.automatic`, ghi `command_logs` với người thực hiện RULE_ENGINE.
- Báo cáo buổi học trong `ClassroomService.report` đếm `classroom_command_attempts` theo booking_id. Luồng tự động không tạo bản ghi này và không gắn booking_id.
- Hệ quả: ca đã có quạt/đèn tự động vẫn có thể hiện chưa có lần điều khiển trong báo cáo; giáo viên cũng không thấy RULE_ENGINE trong lịch sử lệnh cá nhân vì backend lọc theo username của giáo viên.
- Đề xuất: lưu nguồn lệnh, người bật chế độ, phòng, ca liên quan, trạng thái gửi/ACK/audit; báo cáo tách thủ công và tự động. Không mở toàn bộ lệnh của người khác cho giáo viên chỉ để xử lý thiếu dữ liệu này.

## Phát hiện cần sửa tiếp

### 4. Thông báo có thể đưa admin vào Lịch của tôi đã bị chặn

- Backend vẫn cho admin tạo lịch của mình. `ClassroomService` gửi thông báo hết hạn/duyệt/hủy tới `/my-schedule?bookingId=...` mà không phân biệt vai trò chủ lịch; `BuildingService` làm tương tự khi hủy do bảo trì.
- Frontend hiện chỉ cho TEACHER mở route này. Vì vậy admin sở hữu lịch nhận được thông báo nhưng mở ra trang không có quyền.
- Đề xuất: thông báo admin mở `/classroom?roomId=...&bookingId=...`; thông báo giáo viên giữ trang cá nhân. Cần xử lý cả thông báo cũ đã lưu.
- API lịch cá nhân vẫn cho admin đọc chính dữ liệu của mình. Đây là khác biệt phạm vi API/giao diện, không phải bằng chứng admin đọc được lịch riêng của người khác qua API này.

### 5. Có thể đăng ký thiết bị với phòng không thuộc danh mục

- `CreateDeviceRequest`/`UpdateDeviceRequest` chỉ yêu cầu roomId dương. `AdminDeviceService` gán trực tiếp roomId, chưa gọi kiểm tra tồn tại phòng. Các migration hiện có không đặt khóa ngoại devices.room_id tới classroom_rooms.
- Ô Room ID vẫn cho nhập tay ngoài danh sách chọn nhanh.
- Hệ quả có thể có thiết bị mang mã phòng không tồn tại, không xuất hiện đúng trong trang theo danh mục phòng.
- Đề xuất: kiểm tra tồn tại phòng ở backend; cân nhắc khóa ngoại sau khi rà dữ liệu cũ. Không thử tạo thiết bị giả trên database thật trong lượt rà soát này.

### 6. AI gợi ý vẫn là thành phần chưa tích hợp

- `AI-Service/app.py` có API thử nghiệm, nhưng chưa có trang kết quả, lịch sử gợi ý, tác vụ gọi model từ backend hoặc phản hồi của giáo viên/admin.
- `light` boolean và lux chưa tương thích trực tiếp; cách tạo các đặc trưng mean chưa được xác minh. Chưa kiểm chứng model thật trong môi trường đúng phiên bản.
- Đề xuất: hiển thị rõ trạng thái chưa kết nối; hoàn thiện hợp đồng dữ liệu trước khi thêm gợi ý. Tách tên gọi AI gợi ý khỏi AUTO theo ngưỡng để người dùng biết từng chức năng làm gì.

### 7. Cảnh báo, Tổng quan và tự động dùng các mốc khác nhau

- Cảnh báo/Tổng quan dùng classroom_settings, mặc định mất dữ liệu sau 300 giây; AUTO dừng khi mẫu quá 60 giây.
- Ngưỡng cảnh báo nhiệt độ mặc định 32°C; tự động bật quạt mặc định 30°C. Việc khác ngưỡng là hợp lý về mục đích, nhưng chưa có màn hình giải thích tập trung.
- Vì vậy Tổng quan có thể còn hiện ONLINE trong khi AUTO đã dừng do dữ liệu cũ. Trạng thái ONLINE được suy ra từ mẫu cảm biến, không phải xác nhận trực tiếp ESP/relay.
- Đề xuất: đặt tên rõ “mẫu còn mới cho giám sát”, “đủ mới cho điều khiển”, “kết nối relay”; trình bày cảnh báo và điều khiển là hai cấu hình khác mục đích.

### 8. Hai nơi báo sự cố có trải nghiệm khác nhau

- Tab sự cố trong trang phòng có chọn thiết bị và tổng hợp sự cố chung để hạn chế báo trùng. Trang `/incidents` mới có phân trang/toàn phòng nhưng form chưa có hai phần này.
- Thông báo và Tổng quan vẫn dẫn về tab phòng cũ, thay vì thống nhất trang danh sách mới. Một số danh sách cũ vẫn giới hạn 100/200/500 bản ghi.
- Đề xuất: dùng chung form báo sự cố và chi tiết, giữ ngữ cảnh phòng/thiết bị; chọn một trang chính cho xử lý. Không cần xóa tab theo phòng nếu nó giữ vai trò xem nhanh.

### 9. Đăng nhập từ đường dẫn tự động không quay về trang vừa mở

- Route `/automation` tồn tại nhưng `returnPath` chưa cho phép đường dẫn này.
- Chạy hàm hiện tại cho ADMIN/TEACHER với `/automation` đều trả `/dashboard`.
- Đề xuất: thêm đường dẫn vào danh sách theo vai trò; STUDENT vẫn không được truy cập. Đây là lỗi điều hướng mức thấp, không phải mở sai quyền.

## Giới hạn nghiệp vụ cần thể hiện rõ

- PIR phát hiện chuyển động, không đếm người và không khẳng định phòng trống; cần thử với người ngồi yên trước khi dùng chính sách tắt đèn/quạt sau thời gian chờ.
- Hết ca hoặc dừng tự động hiện giữ nguyên trạng thái thiết bị, chưa có quy tắc bàn giao/tắt cuối ca. Cần chọn chính sách vận hành để tránh giáo viên tưởng thiết bị sẽ tự tắt khi hết giờ.
- Chỉ phòng 101 có luồng IoT thực. Thêm thiết bị ở phòng khác chưa đủ để bật điều khiển nhiều phòng.
- Không nên đổi tên menu Tổng quan/Phòng học/Thiết bị chỉ vì có nội dung giao nhau; cần xác định rõ Tổng quan để theo dõi công việc, Phòng học để quản lý lịch/phòng, Thiết bị để xem cảm biến/relay. Có thể đổi Lịch sử thành Lịch sử cảm biến và lệnh để dễ hiểu hơn.

## Thứ tự hoàn thiện đề xuất

1. Quyền tắt AUTO và đối chiếu trạng thái relay; kiểm chứng Node-RED/ESP thật.
2. Ghi nhận lệnh tự động vào báo cáo theo ca và hiển thị lý do dừng.
3. Sửa đường dẫn thông báo admin, kiểm tra phòng khi gán thiết bị và đường dẫn quay lại sau đăng nhập.
4. Thống nhất hai form sự cố và ý nghĩa các trạng thái/ngưỡng giám sát.
5. Tích hợp gợi ý AI sau khi chuẩn hóa đầu vào và xác minh mô hình.

## Xác minh API đang chạy

Đã gọi 13 endpoint chỉ đọc cho mỗi vai trò, tổng cộng 39 lần. Hồ sơ, thông báo, danh sách phòng, Tổng quan, lịch sử cảm biến, workspace và sự cố trả 200 theo quyền. TEACHER/STUDENT bị chặn API quản trị tài khoản; STUDENT bị chặn lịch sử lệnh, lịch giáo viên và cấu hình tự động với 403. Cả ba vai trò nhận 409 khi yêu cầu State phòng 102 chưa tích hợp IoT.

Các kết quả 200 với database ít hoặc không có bản ghi chỉ chứng minh endpoint hoạt động, không tự chứng minh mọi tình huống lọc dữ liệu. Kết luận phân quyền còn dựa trên mã nguồn và kiểm thử riêng.

Chưa kiểm thử vòng kín ESP → MQTT → Node-RED → database → quyết định → relay → ACK/State. Bộ kiểm thử bỏ qua các ca tích hợp chưa cấu hình môi trường; không coi chúng là đã đạt.

## Kết quả kiểm thử trong lượt rà soát

- Backend: `mvnw.cmd -q test` kết thúc thành công; báo cáo Surefire gồm 166 trường hợp, 103 đạt, 63 bỏ qua, không có thất bại/lỗi.
- Frontend: chạy toàn bộ Playwright trên Edge với frontend hiện có ở cổng 5173; 102 đạt, 10 bỏ qua, không có thất bại.
- Python: 4 kiểm thử `test_app` đạt bằng model giả; không chứng minh suy luận model thật.
- Đã kiểm tra trực tiếp hàm điều hướng: ADMIN và TEACHER mở `/automation` trước khi đăng nhập đều được hàm returnPath đưa về `/dashboard`, xác nhận phát hiện số 9.

Kiểm thử xanh phản ánh các kịch bản đang được bao phủ, không phủ nhận các khoảng trống liên kết nghiệp vụ nêu trên. Những tình huống relay khởi động lại, admin mở thông báo lịch của mình và báo cáo ca có lệnh tự động cần thêm kiểm thử hồi quy khi sửa.
