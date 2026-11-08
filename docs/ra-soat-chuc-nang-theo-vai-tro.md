# Rà soát chức năng theo vai trò

Ngày rà soát: 08/11/2026.

## Cập nhật triển khai

Đã triển khai lượt sửa quyền lịch sử/xác nhận cảnh báo, hạn duyệt và sửa đăng ký, xác nhận xử lý lịch khi bảo trì, lưu cấu hình báo cáo tại thời điểm duyệt, Tổng quan theo công việc của từng vai trò và chọn thiết bị theo phòng. Xem [luồng nghiệp vụ hiện tại](luong-nghiep-vu-theo-vai-tro.md). Những nhận xét bên dưới ghi nhận hiện trạng tại thời điểm rà soát trước lượt sửa; giới hạn điều khiển nhiều ESP, email/push và phân trang toàn bộ danh sách vẫn cần giai đoạn tiếp theo.

## Phạm vi và phương pháp

Đọc mã Frontend, phân quyền và dịch vụ Backend; đăng nhập bằng ba tài khoản development và gọi API chỉ đọc trên Backend tại cổng 8080. Không tạo, sửa, xóa dữ liệu nghiệp vụ hoặc gửi lệnh vật lý trong lượt rà soát này. Các nhận xét về thao tác ghi dựa trên mã nguồn, không phải thử thay đổi dữ liệu chính.

Tài liệu phân biệt hành vi đã xác định với đề xuất chính sách. Việc cho phép mọi tài khoản xem lịch phòng hoặc dữ liệu môi trường có thể là chủ đích; cần thống nhất phạm vi thay vì mặc định kết luận đó là lỗi phân quyền.

## Kiểm tra API thực tế

| API | ADMIN | TEACHER | STUDENT |
|---|---|---|---|
| GET `/api/users` | 200 | 403 | 403 |
| GET `/api/commands?size=1` | 200 | 200 | 200 |
| GET `/api/classroom/bookings?roomId=101` | 200 | 200 | 200 |
| GET `/api/classroom/settings` | 200 | 200 | 200 |
| GET `/api/classroom/attempts?roomId=101` | 200 | 200 | 403 |
| GET `/api/classroom/permission?roomId=101` | Được điều khiển | Không được điều khiển tại thời điểm kiểm tra | Không được điều khiển |
| GET `/api/building/overview` | 200 | 200 | 200 |

HTTP 200 xác nhận endpoint truy cập được, không có nghĩa database hiện tại có bản ghi nhạy cảm. Phạm vi truy vấn toàn hệ thống hoặc theo chủ thể được đối chiếu thêm trong mã dịch vụ.

## Các điểm cần ưu tiên

### 1. Phạm vi lịch sử điều khiển chưa thống nhất

- Ảnh hưởng: TEACHER, STUDENT và ADMIN chịu trách nhiệm quản lý dữ liệu.
- Hiện trạng: `/api/classroom/attempts` giới hạn giáo viên theo `actor_id`, chặn sinh viên. Nhưng `/api/commands` cho mọi tài khoản đăng nhập truy vấn, không tự lọc theo người đang đăng nhập; `triggerBy` chỉ là bộ lọc tùy chọn do người gọi truyền.
- Hệ quả: giới hạn xem ở một trang không áp dụng đồng nhất cho trang Lịch sử. Hai nguồn còn có ý nghĩa khác nhau: nhật ký lệnh đã xác nhận và từng lần thử gửi lệnh.
- Đề xuất: ADMIN xem toàn bộ; TEACHER mặc định xem lệnh của mình/ca được giao; STUDENT chỉ xem dữ liệu môi trường cần thiết. Nếu chủ đích là công khai nhật ký lệnh, cần ghi rõ chính sách và giới hạn thông tin người thực hiện. Áp dụng phạm vi ở Backend.
- Căn cứ: `CommandHistoryService.history`, `CommandHistoryController`, `ClassroomService.attempts`, `SecurityConfig`.

### 2. Giáo viên xác nhận cảnh báo không cần liên quan đến phòng hoặc ca

- Hiện trạng: `ClassroomService.acknowledge` chỉ kiểm tra vai trò khác STUDENT, rồi cập nhật theo ID cảnh báo; không kiểm tra giáo viên có ca tại phòng hoặc được giao phụ trách.
- Hệ quả: giáo viên có thể xác nhận cảnh báo của phòng/ca mình không phụ trách. Nếu dùng dấu xác nhận để theo dõi trách nhiệm, điều này dễ gây hiểu nhầm.
- Đề xuất: ADMIN xác nhận toàn bộ; TEACHER chỉ xác nhận trong phạm vi phụ trách, hoặc lưu riêng từng người đã xem thay vì một dấu xác nhận chung. Xác nhận đã xem tiếp tục khác với kết thúc cảnh báo.
- Đây là quyết định nghiệp vụ cần thống nhất; chưa kết luận là lỗ hổng theo một chính sách đã được phê duyệt.

### 3. Lịch chờ duyệt giữ chỗ nhưng chưa có thời hạn xử lý riêng

- Hiện trạng: PENDING và APPROVED đều chặn lịch trùng phòng và trùng giờ của giáo viên. Chưa có trạng thái hết hạn hoặc cơ chế tự giải phóng lịch chờ theo thời hạn duyệt. ADMIN tự tạo lịch cũng nhận PENDING.
- Hệ quả: một yêu cầu chưa được xử lý có thể giữ khung giờ tới hết buổi; giáo viên muốn đổi lịch phải hủy rồi đăng ký lại, có thể mất chỗ. ADMIN cần thêm bước duyệt yêu cầu của chính mình.
- Đề xuất: thêm hạn duyệt, hàng đợi tập trung cho ADMIN, trạng thái hết hạn và thông báo kết quả. Cho sửa lịch đang chờ với kiểm tra trùng trong cùng giao dịch. Quyết định rõ ADMIN đặt lịch là duyệt ngay hay phải qua người duyệt khác.
- Căn cứ: `ClassroomService.rejectOverlap`, `createBooking`, `decide`, schema `classroom_bookings`.

### 4. Bảo trì phòng chưa đi cùng xử lý lịch bị ảnh hưởng

- Hiện trạng: chuyển phòng sang MAINTENANCE/INACTIVE chặn các thao tác đăng ký/duyệt/điều khiển mới; các lịch đã duyệt vẫn giữ nguyên. Giao diện có ghi chú yêu cầu quản trị viên tự xử lý.
- Hệ quả: lịch vẫn hiển thị đã duyệt dù phòng không thể sử dụng; giáo viên chưa có luồng được thông báo hoặc chuyển phòng.
- Đề xuất: trước khi lưu bảo trì, liệt kê lịch bị ảnh hưởng; cho ADMIN lựa chọn giữ để xử lý, hủy có lý do hoặc chuyển phòng với kiểm tra sức chứa và trùng lịch. Không tự hủy lịch mà không có quyết định rõ ràng.
- Căn cứ: `BuildingService.save`, biểu mẫu quản lý phòng tại `BuildingPage`.

### 5. Báo cáo lịch sử phụ thuộc cấu hình thiết bị và ngưỡng hiện tại

- Hiện trạng: báo cáo đọc `classroom_settings` và thiết bị hiện đang thuộc phòng 101 để lấy telemetry; dùng ngưỡng hiện tại để tính số mẫu vượt ngưỡng. Có ghi chú về giới hạn này.
- Hệ quả: thay cảm biến, chuyển thiết bị sang phòng khác hoặc đổi ngưỡng có thể làm báo cáo của một buổi cũ khác đi dù buổi học không thay đổi.
- Đề xuất: lưu lịch sử gán thiết bị theo thời gian và phiên bản ngưỡng; báo cáo theo cấu hình có hiệu lực trong buổi. Tên phòng nên có một nguồn quản lý thống nhất, tránh tách giữa `classroom_rooms.name` và `classroom_settings.name`.
- Căn cứ: `ClassroomService.report`, `updateSettings`, `AdminDeviceService.update`.

### 6. Tổng quan cùng nội dung cho cả ba vai trò chưa hỗ trợ đúng công việc chính

- Hiện trạng: các vai trò cùng xem Tổng quan dãy nhà. Các số lịch chờ/sự cố/cảnh báo là tổng hợp; chưa có hàng đợi xử lý tập trung hoặc trang lịch cá nhân toàn dãy nhà.
- ADMIN: nên thấy ngay lịch chờ duyệt, sự cố cần xử lý, phòng bảo trì ảnh hưởng ca và liên kết tới đúng bộ lọc.
- TEACHER: nên có lịch hôm nay/của tôi, trạng thái yêu cầu, phòng sắp dạy và nút mở thiết bị của ca đang có quyền.
- STUDENT: nên ưu tiên lịch sử dụng phòng được phép xem, tra cứu phòng và báo sự cố; giảm thông tin quản trị không thể thao tác.
- Chưa có mô hình lớp học/ghi danh sinh viên trong luồng đang rà soát, nên chưa thể gọi danh sách lịch phòng là lịch cá nhân của sinh viên.

### 7. Tổng số sự cố không khớp phạm vi danh sách của người xem

- Hiện trạng: Tổng quan cộng sự cố mở của toàn bộ người báo, trong khi TEACHER và STUDENT mở trang Sự cố chỉ xem báo cáo do mình tạo.
- Hệ quả: người dùng thấy phòng có sự cố nhưng danh sách của mình trống, dễ cho rằng hệ thống thiếu dữ liệu; cũng có thể báo trùng sự cố đang được xử lý.
- Đề xuất: tách “Sự cố của tôi” và “Tình trạng phòng”; nếu cho xem sự cố chung, cung cấp thông tin rút gọn về hạng mục và trạng thái, không mặc định công khai mô tả/người báo. ADMIN giữ danh sách đầy đủ.
- Căn cứ: `BuildingService.overview`, `ClassroomService.incidents`, `OverviewPage`, `ClassroomPage`.

### 8. Quản lý thiết bị và cấu hình tích hợp IoT vẫn là hai bước tách biệt

- Hiện trạng: ADMIN thêm/chuyển thiết bị trong quản trị; tích hợp IoT, ngưỡng, báo cáo và nhiều chỗ nhận diện phòng vẫn dựa vào 101/cấu hình chung. Danh sách thiết bị theo phòng đã giải thích rằng đăng ký không đồng nghĩa tích hợp.
- Hệ quả: thiết bị mới xuất hiện trong danh sách nhưng chưa xem/điều khiển được; chuyển hoặc đình chỉ thiết bị đang dùng có thể làm luồng phòng mất dữ liệu hoặc khóa điều khiển.
- Đề xuất: mỗi phòng có cấu hình cảm biến, bộ điều khiển và khả năng FAN/LIGHT riêng. Thay đổi thiết bị đang được sử dụng phải hiển thị tác động. Chỉ mở điều khiển nhiều ESP sau khi thống nhất định tuyến theo device ID và xác nhận ACK với Node-RED.
- Đây là giới hạn tích hợp đã biết, chưa phải tính năng điều khiển nhiều thiết bị hoàn chỉnh.

### 9. Tra cứu còn yêu cầu nhớ mã kỹ thuật và chưa giữ đủ ngữ cảnh phòng

- Hiện trạng: History lọc theo device ID/triggerBy bằng ô nhập; báo sự cố nhập mã thiết bị; chưa có bộ lọc phòng xuyên suốt. Lịch phòng tối đa 500 bản ghi, cảnh báo/sự cố/lần điều khiển tối đa 200, chưa phân trang các danh sách này.
- Đề xuất: chọn dãy nhà → tầng → phòng → thiết bị; mở History từ phòng thì giữ bộ lọc; báo sự cố chọn từ thiết bị trong phòng. Khi dữ liệu tăng, thêm phân trang và dấu hiệu rõ khi bị giới hạn.

### 10. Một số trạng thái giao diện chưa khớp điều kiện thao tác thực tế

- Lịch đã hết giờ nhưng còn PENDING/APPROVED vẫn có thể hiện nút hủy/duyệt; Backend từ chối theo thời gian kết thúc. Nên ẩn/khóa và ghi lý do ở giao diện, đồng thời giữ kiểm tra Backend.
- Form đăng ký vẫn hiện khi phòng bảo trì; nên dùng trạng thái phòng để giải thích và khóa gửi sớm.
- Quyền điều khiển tự đọc lại mỗi 15 giây; đầu ca giáo viên có thể phải chờ lượt đọc tiếp theo. Có thể làm mới quyền ngay khi mở ca hoặc làm mới trạng thái, trong khi Backend tiếp tục kiểm tra lại trước khi gửi.
- Việc đổi tab trong trang phòng gọi lại cả settings và permission; một lỗi ở các request phụ có thể làm dữ liệu tab không hiển thị. Nên tải dữ liệu thiết yếu độc lập với phần thông tin phụ.

## Thứ tự đề xuất

1. Thống nhất chính sách xem lịch sử, xem lịch phòng và xác nhận cảnh báo cho TEACHER/STUDENT; áp dụng đồng nhất ở Backend và giao diện.
2. Hoàn thiện vòng đời lịch chờ, lịch hết hạn và bảo trì ảnh hưởng ca; bổ sung hàng đợi cho ADMIN, lịch cá nhân cho TEACHER.
3. Tách cấu hình IoT theo phòng và bảo toàn cấu hình lịch sử trước khi mở rộng nhiều ESP.
4. Tinh chỉnh Tổng quan theo vai trò, bộ lọc theo phòng/thiết bị và các trạng thái thao tác.

## Những ràng buộc nên giữ

- ADMIN mới được CRUD tài khoản/thiết bị và quản lý danh mục phòng; quyền được kiểm tra ở Backend.
- STUDENT không gửi lệnh vật lý, không duyệt lịch, không sửa cấu hình phòng.
- TEACHER chỉ điều khiển khi có lịch của mình đã duyệt và đang trong giờ tại phòng hỗ trợ IoT.
- Phòng bảo trì hoặc thiết bị điều khiển không hợp lệ phải chặn lệnh.
- Phòng chưa tích hợp không đọc dữ liệu hoặc điều khiển phòng khác thay thế.
- Không tự gửi lại lệnh khi timeout; phân biệt tiếp nhận, thực thi và lỗi lưu lịch sử.
