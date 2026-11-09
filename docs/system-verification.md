# Kiểm thử tích hợp SmartClass IoT

## Tài khoản cá nhân — 09/11/2026

- Backend với MySQL riêng: 143 bài đạt, không bỏ qua. Bảy bài `AccountIntegrationTests` kiểm tra ba vai trò cập nhật đúng hồ sơ của mình, chặn trường danh tính/quyền, kiểm tra liên hệ, yêu cầu mật khẩu cũ, thu hồi mọi token cũ, ADMIN đặt lại mật khẩu và response không cache/không lộ hash.
- Frontend: 89 bài giao diện khác nhau đạt qua lượt toàn bộ và lượt chạy lại 9 bài tài khoản. Đã sửa nhãn truy cập của trường khi có lỗi và giữ thông báo đổi mật khẩu qua chuyển trang. Có kiểm tra lưu/tải lại, giữ dữ liệu khi lỗi, chống gửi lặp, sai mật khẩu cũ và đăng xuất sau đổi mật khẩu.
- Backend thật trên origin 5173: 9 bài tích hợp chỉ đọc đạt, gồm đọc hồ sơ cho ADMIN/TEACHER/STUDENT và 6 bài hồi quy đăng nhập/lịch sử/lịch cá nhân/thông báo. Không đổi thông tin hoặc mật khẩu tài khoản thật để kiểm thử.
- Build Frontend và đóng gói JAR thành công. Backend đã khởi động lại tại 8080 và áp dụng V6; Frontend tại 5173.
- Đã xem ảnh trang tài khoản ở 320 px và desktop 1366 px; không tràn ngang. Vùng tài khoản ở đầu trang mở `/profile` cho cả ba vai trò.
- Giữ nguyên hợp đồng đăng nhập `/api/auth/me`; JWT bổ sung phiên bản thông tin đăng nhập để thu hồi sau đổi/đặt lại mật khẩu. Không sửa MQTT, flow Node-RED, firmware hoặc các bảng dữ liệu IoT.

Hướng dẫn: [tài khoản cá nhân](tai-khoan-ca-nhan.md).

## Lịch giáo viên và thông báo — 09/11/2026

- Backend: toàn bộ 136 bài kiểm thử MySQL trên database `smartclass_verify_*` đạt, không bỏ qua. Chạy lại 14 bài `RoleWorkflowIntegrationTests` sau khi hoàn thiện kiểm tra bộ lọc/ngắn hóa nội dung thông báo cũng đạt.
- Các kiểm thử mới xác minh lịch cá nhân gồm quá khứ/sắp tới, phạm vi chủ lịch, phân trang ổn định và lọc giao ngày; quyền xem/đánh dấu thông báo, thời điểm đọc idempotent, mốc đánh dấu tất cả không tiêu thụ thông báo mới, hết hạn/bảo trì không thông báo lặp và rollback không để lại thông báo.
- Frontend: 80 bài giao diện khác nhau đạt qua lượt toàn bộ và lượt chạy lại 9 bài `teaching-notifications.spec.js` sau khi bổ sung nhãn truy cập rõ ràng cho bộ lọc lịch. Nhóm hồi quy có 79 bài đạt ở lượt đầu, một bài bộ lọc được sửa và đạt ở lượt chạy lại. Các bài tích hợp tùy chọn không tính vào số này.
- Với Backend thật trên origin 5173: 6 bài đạt, gồm đăng nhập/CORS/tải lại/đăng xuất của ba vai trò, Dashboard/History chỉ đọc và lịch cá nhân/thông báo chỉ đọc. CRUD thật tùy chọn trên database test có sẵn chưa bật.
- Đã build Frontend và đóng gói JAR thành công. Backend khởi động lại trên 8080, áp dụng Flyway V5; Frontend hoạt động trên 5173. API thật: ADMIN/TEACHER đọc lịch cá nhân thành công; STUDENT nhận 403; ba vai trò đều đọc được thông báo riêng.
- Đã xem ảnh Lịch của tôi ở 390 px và Thông báo ở 320 px; các bài kiểm thử xác nhận không tràn ngang. Chi tiết/hủy lịch, lỗi đã đọc, thông báo mới đến trong lúc đánh dấu tất cả, điều hướng tới lịch ngoài khoảng mặc định và mở lịch sử sự cố đều được kiểm tra.
- Không tạo lịch/sự cố hoặc thông báo mẫu trên database chính, không gửi lệnh phần cứng. Không thay flow Node-RED, MQTT hoặc firmware. Thông báo chỉ lưu cho sự kiện từ thời điểm triển khai; chưa có email/push hệ điều hành.

Hướng dẫn và API: [lịch giáo viên và thông báo trong ứng dụng](lich-giao-vien-va-thong-bao.md).

## Sửa nghiệp vụ và giao diện ba vai trò — 08/11/2026

- Backend: toàn bộ 128 bài với MySQL trên database riêng đạt, không bỏ qua. Sau đó nhóm `RoleWorkflowIntegrationTests` và `BuildingMigrationTests` có 8 bài đạt, gồm bài mới bảo vệ thiết bị đang cấu hình; tổng 129 bài khác nhau đạt qua các lượt.
- Frontend: 71 bài giao diện khác nhau đạt qua lượt toàn bộ và lượt chạy lại nhóm History/Overview. Các bài mới bao gồm hàng đợi duyệt có xác nhận, lịch giáo viên trên di động, theo dõi sự cố sinh viên, sửa lịch giữ dữ liệu khi 409, xác nhận hủy lịch khi bảo trì, chặn tab lệnh cho sinh viên và bỏ bộ lọc người gửi khác cho giáo viên. Bài CRUD Backend thật tùy chọn chưa bật trong lượt này.
- Build Frontend và đóng gói Backend thành công; Backend đã khởi động lại trên 8080, áp dụng Flyway V4. Frontend tiếp tục chạy trên 5173.
- API thật sau khởi động: ADMIN/TEACHER đọc workspace và nhật ký theo quyền; STUDENT nhận 403 ở nhật ký lệnh, vẫn đọc được workspace và Tổng quan.
- Đã xem ảnh Tổng quan STUDENT trên desktop và lịch cá nhân TEACHER ở 390 px; không tràn ngang. Quyền/cấu hình phụ của trang phòng không còn chặn tải dữ liệu tab chính.
- Không gửi lệnh vật lý hoặc tạo lịch/sự cố mẫu trên database chính. Các kiểm thử thay đổi nghiệp vụ dùng database `smartclass_verify_*` và Node-RED stub.
- Báo cáo lịch cũ chưa có cấu hình lưu vẫn ghi rõ giới hạn. Luồng Node-RED nhiều ESP, email/push, chuyển lịch đã duyệt hàng loạt và phân trang toàn bộ danh sách chưa nằm trong lượt triển khai; xem [luồng hiện tại](luong-nghiep-vu-theo-vai-tro.md).

## Tổng quan toàn dãy nhà và thiết bị theo phòng — 08/11/2026

- `/dashboard` dùng dữ liệu tổng hợp toàn dãy nhà; trang gốc và mọi vai trò đăng nhập mặc định vào Tổng quan. Giữ các đường dẫn quản lý phòng, lịch, IoT, lịch sử và quản trị.
- Chọn phòng trước khi đọc cảm biến hoặc điều khiển; bảng IoT không còn được gắn trực tiếp vào `/dashboard` với ngữ cảnh 101 mặc định. Metadata phòng bổ sung danh sách thiết bị thuộc phòng; ADMIN có liên kết quản trị giữ bộ lọc phòng.
- Frontend: `npm run build` thành công; toàn bộ lượt Playwright dùng Edge có 64 bài đạt, 6 bài tích hợp tùy chọn bỏ qua. Chạy riêng 5 bài đọc Backend thật trên origin 5173: đăng nhập/CORS/tải lại/đăng xuất cho ADMIN, TEACHER, STUDENT; IoT theo phòng và History đều đạt. Bài CRUD thật vẫn chưa bật trong lượt này.
- Backend: toàn bộ 121 bài với MySQL trên database `smartclass_verify_*` riêng đạt, không bỏ qua. Sau khi bổ sung bài kiểm thử danh sách thiết bị, chạy lại nhóm `RoomIotIntegrationTests`: 6 bài đạt, gồm bài mới; xác minh thiết bị không xuất hiện ở phòng khác và đăng ký thiết bị chưa tích hợp không mở truy cập Node-RED.
- Đóng gói Backend thành công và đã khởi động lại tại 8080. Kiểm tra API thật: Tổng quan có 15 phòng, metadata phòng 101 có 2 thiết bị. Frontend hoạt động tại 5173.
- Đã xem ảnh Tổng quan trên màn hình 390 px, không tràn ngang. Các kiểm thử còn kiểm tra chuyển phòng khi State cũ đang chờ, quyền điều khiển, ACK và chống tự gửi lại lệnh.
- Không gửi lệnh vật lý vào hệ thống chính. Luồng Node-RED vẫn cấu hình một bộ điều khiển với FAN/LIGHT; chưa xác minh mở rộng nhiều bộ điều khiển ESP độc lập hoặc ACK phần cứng thật. Database kiểm thử dùng Node-RED stub.

## Xử lý xung đột Git — 08/11/2026

- Hợp nhất 34 tệp xung đột, giữ quản lý Nhà A, lịch và vận hành phòng, IoT theo phòng, xác thực, phân quyền, lịch sử và quản trị; kết hợp giao diện mới, phông cục bộ và liên kết bỏ qua điều hướng bằng bàn phím.
- Khôi phục nội dung tài liệu API, kiến trúc và bài kiểm thử Node-RED bị trống trong bản đang hợp nhất. Giữ các kiểm tra lịch đã duyệt và nhật ký lần điều khiển.
- `npm run build`: thành công.
- `backend/mvnw.cmd clean verify`: thành công, đóng gói JAR; 121 bài kiểm thử, 80 đạt, 41 bỏ qua vì chưa cấu hình database kiểm thử MySQL riêng.
- Kiểm thử trình duyệt dùng Edge: 62 bài đạt, 6 bài tích hợp Backend thật bỏ qua vì chưa bật cấu hình tương ứng. Chạy trong `frontend/` với `$env:SMARTCLASS_BROWSER_CHANNEL='msedge'; npm test`. Chromium mặc định của Playwright chưa được cài trong môi trường này.
- Chưa xác minh lại tích hợp MySQL, Node-RED và ESP32 thật trong lượt xử lý xung đột. Các kết quả bên dưới là lịch sử, không thay thế kết quả của lượt này.

## Quản lý Nhà A — 08/11/2026

Kết quả hiện tại sau khi mở rộng Nhà A; các mục V2/Prompt 11 bên dưới là kết quả lịch sử.

| Phạm vi | Kết quả |
|---|---|
| Backend trên MySQL 8 thật, database riêng | 115 test của toàn bộ suite đạt; thêm 1 test nâng cấp V2 lên V3 đạt ở lượt riêng, tổng 116 test |
| Bảo toàn dữ liệu khi nâng cấp | Tạo schema V2 riêng có lịch/sự cố/cảnh báo/lệnh/telemetry, nâng V3, kiểm tra bản ghi nghiệp vụ về 101 và giá trị cũ không đổi |
| Frontend dùng Chrome | 56 test giao diện dùng HTTP mock đạt qua lượt toàn bộ và lượt kiểm tra lại 7 test Nhà A; lỗi nhãn truy cập bộ lọc tầng đã sửa |
| Frontend với Backend thật | 3 test đăng nhập/CORS/tải lại/đăng xuất ADMIN, TEACHER, STUDENT đạt; ADMIN vào Nhà A; tổng 59 test giao diện đạt qua các lượt |
| Các test tích hợp tùy chọn còn lại | CRUD thật trên database test có sẵn, Dashboard thật và History thật chưa bật trong lượt này |
| Build | `npm run build` và `mvnw.cmd -DskipTests package` thành công |
| Database chính và API thật | V3 áp dụng thành công; 15 phòng/3 tầng, chỉ 101 là phòng IoT, 14 phòng còn lại trả `telemetry=null`; quyền điều khiển phòng 102 bị từ chối |
| Kiểm tra bố cục | Đã xem ảnh desktop 1600×1200 và mobile 390×844; không tràn ngang; chuyển từ Nhà A sang lịch phòng 102 đúng ngữ cảnh; không có lỗi JavaScript |

Các kiểm thử mới bao gồm tách lịch theo phòng, giáo viên không có hai tiết giao nhau, tìm phòng theo khoảng giữ chỗ, tỷ lệ lịch đã duyệt cắt theo khoảng thống kê, sĩ số/sức chứa, quyền quản lý/nhật ký, bảo trì chặn đăng ký/duyệt/điều khiển, báo cáo phòng chưa có IoT và thiết bị của sự cố phải thuộc phòng.

Không thêm lịch/sự cố hoặc telemetry mẫu vào database chính khi kiểm tra giao diện. Danh mục 15 phòng được tạo theo lựa chọn đã thống nhất; sức chứa 40 là cấu hình ban đầu cần quản trị viên kiểm tra lại. V3 không thay bảng IoT V1, Node-RED hoặc firmware. Backend và Vite được giữ chạy trên 8080/5173. Phòng 101 tại thời điểm kiểm tra chưa có mẫu telemetry, hiển thị `NO_DATA`; không tạo chỉ số thay thế.

Chưa kiểm chứng phần cứng/ACK vật lý. Hướng dẫn nghiệp vụ và cách kiểm tra tại [quản lý Nhà A](building-a.md).

## Bổ sung vận hành phòng học — 08/11/2026

Các phần Prompt 11 bên dưới là kết quả trước khi bổ sung module vận hành phòng. Kết quả mới:

| Phạm vi | Kết quả |
|---|---|
| Backend với MySQL thật trên database mới `smartclass_verify_*` | 107 test đạt, không bỏ qua; gồm 14 test mới cho module phòng học |
| Đóng gói Backend | `mvnw.cmd -DskipTests package` thành công sau khi tải dependency đóng gói còn thiếu vào Maven cache; bước test trong lượt `verify` trước đó đã đạt 107 test |
| Frontend dùng Chrome cài sẵn | 49 test đạt, 6 test tích hợp tùy chọn bỏ qua do không cấu hình tài khoản/database test cho trình duyệt |
| Backend thật cổng 8080 | V2 áp dụng thành công lên `smartclass_db`; đăng nhập ba role và đọc lịch/quyền đạt; ADMIN được điều khiển, TEACHER không có ca bị khóa, STUDENT bị khóa |
| React với Backend thật | Đăng nhập ADMIN, mở lịch phòng, xem cảnh báo thiếu dữ liệu và cấu hình đạt; không có lỗi JavaScript; đã xem ảnh desktop/mobile, mobile không tràn ngang |

Test mới kiểm tra trùng lịch đồng thời, duyệt/hủy, thời gian cấp quyền, sự cố và lịch sử xử lý, cảnh báo không trùng/hồi phục, tổng hợp mẫu đo trong ca, không phát lệnh khi lưu lần gửi lỗi, không gửi lại hoặc che kết quả thành công khi cập nhật kết quả lỗi.

Các kiểm thử tạo/sửa nghiệp vụ và dữ liệu cảm biến mẫu chạy trên database riêng. Không tạo lịch/sự cố mẫu hoặc gửi lệnh vật lý vào database chính trong lượt kiểm tra giao diện. Database chính có thêm sáu bảng V2 và cảnh báo thiếu dữ liệu do bộ kiểm tra định kỳ tạo; schema/dữ liệu bốn bảng IoT không bị migration sửa. Seeder tắt khi khởi động lại Backend.

Chưa xác minh phần cứng, ACK vật lý hoặc flow Node-RED thật; không kết luận end-to-end IoT đã đạt. Chi tiết chức năng và giới hạn tại [vận hành phòng học](classroom-operations.md).

Ngày kiểm tra: 08/11/2026. Chưa xác nhận hoàn tất end-to-end với ESP32.

## Lỗi đã sửa

Dashboard từng nhận FAN/LIGHT/AUTO từ record mang `device_id` khác hoặc record theo khóa ID có định danh mâu thuẫn. Đã giới hạn ánh xạ theo đúng thiết bị cấu hình; trạng thái không xác định giữ nút điều khiển bị khóa. Hai kiểm thử hồi quy đã tái hiện lỗi trước khi sửa và đạt sau khi sửa. Không thay đổi API, schema, firmware hoặc flow.

## Phạm vi đã kiểm chứng

| Phạm vi | Kết quả |
|---|---|
| Backend `.\mvnw.cmd clean test` không cấu hình MySQL | 73 đạt, 20 bỏ qua do cần MySQL |
| `backend/scripts/test-mysql.ps1` → `clean verify` với MySQL 9.5 thật | 93 đạt, không bỏ qua; Flyway, JPA, khóa ngoại, Seeder, CRUD, JWT và lịch sử trên database riêng |
| Frontend `npm run build` sau sửa | Thành công |
| Chromium, gồm Backend thật và HTTP mock | 49 đạt qua hai lượt: 43 test dùng HTTP mock, 5 test đọc/đăng nhập với Backend thật và 1 test CRUD thật chạy riêng trên database kiểm thử |
| CRUD Users/Devices qua giao diện thật | Tạo/sửa/xóa đạt; PUT giữ mật khẩu khi không đổi, enum trạng thái khớp; chỉ dọn các bản ghi ngẫu nhiên do chính test tạo |
| HTTP thật tới Backend dùng database chính | Đăng nhập ba role, `/me`, JWT sai/thiếu, phân quyền, CORS, validation và truy vấn lịch sử đạt |
| JWT hết hạn qua HTTP | Backend tạm cổng 8081 phát token 3 giây; token hết hạn trả 401 |
| SQL → HTTP và React đọc API thật | SQL/API khớp định danh, nhiệt độ, độ ẩm, lux, occupancy và timestamp; React tải bản ghi/lịch sử có sẵn, bộ lọc và phân trang đạt. Ánh xạ từng ô và định dạng UTC+07 ở giao diện được kiểm tra bằng HTTP mock |
| Node-RED không kết nối được | State/Control trả 503; không thêm command log, không tự gửi lại |

Các kiểm thử ACK SUCCESS/ACCEPTED/FAILURE/TIMEOUT và ghi đúng một lịch sử dùng HTTP stub Node-RED; phần lưu trữ dùng MySQL thật. Kiểm thử giao diện về polling, payload FAN/LIGHT, loading/rỗng/lỗi, hết phiên và responsive dùng HTTP mock. Các kết quả này không chứng minh thiết bị vật lý hoặc flow thật hoạt động.

Database chính được kiểm tra chỉ đọc với Seeder tắt: 3 users, 2 devices, 1 telemetry và 1 command log `RULE_ENGINE`, Flyway V1. Không DROP database/bảng, không xóa lịch sử. Các database do suite tạo có tiền tố `smartclass_verify_` và được giữ lại.

Sau CRUD thật, database kiểm thử có sẵn vẫn giữ 3 users, 4 devices, 1 telemetry và 1 command log như trước khi chạy. Sau toàn bộ kiểm tra, dữ liệu và số bản ghi của database chính không đổi. Các tiến trình Backend/Vite tạm đã được dừng; dịch vụ MySQL hiện có được giữ nguyên.

## Phần chưa thể kiểm chứng thực tế

- Node-RED cổng 1880 và Mosquitto cổng 1883 không lắng nghe; workspace và thư mục `.node-red` mặc định không có flow để đối chiếu.
- Không có firmware ESP32 trong workspace hoặc kết nối phần cứng đã xác định. Chưa kiểm chứng MQTT topic/JSON, telemetry từ cảm biến, relay thực thi và ACK vật lý.
- Chưa xác minh chủ thể ghi log trong flow thật; Spring Boot ghi lệnh người dùng, Node-RED chỉ được ghi lệnh tự động với `trigger_by=RULE_ENGINE` để tránh trùng. Không tự sửa flow hoặc suy đoán hợp đồng ACK.
- AUTO hiện chỉ đọc từ State; chưa có API chuyển chế độ. Điều kiện Rule Engine thực tế vẫn cần kiểm tra khi có flow/thiết bị.

Khi Node-RED/Mosquitto và phần cứng sẵn sàng, cần đối chiếu flow với [hợp đồng tích hợp](nodered-integration.md), kiểm tra một mẫu cảm biến xuyên suốt và một lệnh điều khiển an toàn kèm ACK/số bản ghi lịch sử trước khi kết luận end-to-end đạt.
