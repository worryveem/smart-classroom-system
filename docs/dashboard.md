# Dashboard và dữ liệu IoT

Route `/dashboard` dùng Authentication/ProtectedRoute hiện có. React chỉ gọi Spring Boot, không gọi Node-RED hoặc MQTT trực tiếp. Không thay đổi Backend, database, flow hoặc firmware trong giai đoạn này.

## API và cấu hình

| API | Cách sử dụng |
|---|---|
| GET `/api/state` | Đọc trạng thái từ `data` của wrapper; Backend chuyển tiếp nguyên JSON Node-RED |
| GET `/api/telemetry` | Truyền `deviceId`, `limit`, và `from`/`to` nếu chọn khoảng thời gian |
| POST `/api/control` | Chỉ gửi `{target: FAN/LIGHT, action: ON/OFF}` với JWT hiện có |

`VITE_API_BASE_URL` mặc định `http://localhost:8080`. `VITE_SENSOR_DEVICE_ID` mặc định `node1_sensor`; `VITE_ACTUATOR_DEVICE_ID` mặc định `node2_actuator`. Hai ID phải khớp flow và cấu hình Backend. Actuator ID chỉ dùng để nhận diện State/hiển thị; API Control không nhận deviceId và Backend vẫn quyết định thiết bị được điều khiển. Không đưa secret vào biến VITE.

Node-RED hiện offline nên hợp đồng State thực chưa xác minh được. `services/stateAdapter.js` tập trung ánh xạ các dạng rõ ràng: object phẳng có temp/humid/lux/occupancy/FAN/LIGHT; object chứa các record theo khóa device ID; mảng record có device_id; hoặc object có mảng devices. Record theo ID được ưu tiên; không chọn tùy tiện thiết bị đầu tiên trong mảng. Đây là ánh xạ tham chiếu cần đối chiếu lại khi có flow thật.

Record có `device_id` chỉ được ánh xạ cho đúng thiết bị cấu hình. Record theo khóa ID nhưng chứa `device_id` khác bị bỏ qua, gồm cả trạng thái kết nối và AUTO. Chỉ object phẳng không có `device_id` mới được hiểu là trạng thái tổng hợp của cả cảm biến và bộ điều khiển; không dùng trạng thái của thiết bị khác để mở nút điều khiển.

Trường số không hợp lệ/thiếu hiển thị `—`, không đổi null thành 0. PIR nhận boolean hoặc 0/1 tương ứng. FAN/LIGHT nhận boolean, ON/OFF hoặc 0/1 tương ứng. Trạng thái kết nối chỉ lấy từ connected/online hoặc trạng thái Online/Offline của record thiết bị; trạng thái quản trị Active trong MySQL không được xem là bằng chứng thiết bị đang online. Trường kết nối không có hiển thị “Chưa rõ kết nối”.

## Đọc trạng thái và lịch sử

State sử dụng vòng đọc tuần tự: chờ request hoàn tất, sau đó đợi 4 giây trước lượt tiếp theo. Không dùng setInterval chồng request. Yêu cầu làm mới trong lúc đang đọc được gộp; dữ liệu cũ được giữ trong lúc đọc nền. Khi lỗi, hiển thị rõ dữ liệu cũ, cảnh báo và khóa điều khiển. Thiết bị được báo offline cũng không được điều khiển.

Lịch sử đọc độc lập mỗi 30 giây, khi thay khoảng thời gian hoặc khi người dùng bấm tải lại. Không tải lịch sử mỗi lần State cập nhật. Cả hai vòng đọc dừng/hủy request khi unmount hoặc ẩn tab, và đọc lại khi tab hiện. Request State chờ tối đa 22 giây để bao phủ thời gian chờ Node-RED của Backend.

Biểu đồ Recharts có ba đường với công tắc riêng: nhiệt độ/độ ẩm ở trục trái, Lux ở trục phải; tooltip ghi rõ đơn vị và thời điểm. Dữ liệu sắp xếp timestamp rồi id tăng dần, không làm giả hoặc nội suy giá trị thiếu. Timestamp MySQL không có offset được hiểu theo UTC+07:00, không theo múi giờ trình duyệt. Bản ghi thiếu thời gian/giá trị hoặc sai thiết bị bị bỏ qua và có thông báo số lượng.

Mặc định đọc 50 mẫu mới nhất. Các lựa chọn 1/6/24 giờ truyền from/to theo giờ Việt Nam và giới hạn 500 mẫu; khi chạm giới hạn có cảnh báo rằng biểu đồ có thể chưa bao phủ toàn bộ khoảng. Dữ liệu rỗng và lỗi lịch sử có trạng thái riêng. Thời điểm “Lần đọc thành công” là giờ trình duyệt nhận response, không được ghi thành thời điểm cảm biến đo. Timestamp thiết bị chỉ hiển thị khi State cung cấp.

## Điều khiển và AUTO

Một lệnh chờ phản hồi tại một thời điểm; cả hai cụm FAN/LIGHT bị khóa trong lúc gửi. Không gửi tự động, không retry, không đổi ON/OFF dựa trên nút vừa bấm hoặc ACK. Sau mỗi kết quả đều yêu cầu đọc lại State. Nút tương ứng trạng thái hiện có bị vô hiệu để giảm thao tác trùng.

- SUCCESS: xác nhận thực thi theo hợp đồng Backend; trạng thái thẻ vẫn chờ State.
- ACCEPTED: đã tiếp nhận, chưa khẳng định thiết bị thực thi.
- FAILURE: không có xác nhận thành công; nhắc kiểm tra State trước khi gửi lại.
- TIMEOUT hoặc mất phản hồi: kết quả chưa rõ; không tự gửi lại.
- HTTP 500 kèm outcome SUCCESS/ACCEPTED và log_status FAILED: giữ nguyên outcome đã xác nhận, báo lỗi lưu lịch sử; không gửi lại để sửa log.

Frontend chờ Control tối đa 25 giây, không coi HTTP 2xx thiếu ACK hợp lệ là thành công. Rời trang hủy việc chờ ở trình duyệt nhưng không thu hồi lệnh đã đến Backend/thiết bị.

Không có API bật/tắt AUTO trong Backend hiện tại. Dashboard chỉ đọc AUTO/auto nếu State có trường này; nếu thiếu hiển thị “Chưa có trạng thái”. Không có nút chuyển AUTO, không gửi target AUTO hoặc tự tạo API.

## Kiểm thử và giới hạn xác minh

Playwright kiểm tra dữ liệu cảm biến, thứ tự thời gian/đơn vị, bộ lọc, polling không chồng, pause/resume, unmount, bốn payload điều khiển, ACK và lỗi audit, timeout/mạng không retry, trạng thái cũ, dữ liệu trống, JWT và responsive. HTTP mock chỉ nằm trong tests và không được dùng khi chạy ứng dụng thực. Lệnh điều khiển test chỉ đến HTTP mock, không gửi tới thiết bị vật lý.

Chạy `npm run build` và `npm test` trong frontend. Test tích hợp Backend cần biến môi trường theo [frontend-authentication.md](frontend-authentication.md). Nếu 5173 đang có dịch vụ khác, đặt `SMARTCLASS_E2E_PORT=5174` và cho phép origin kiểm thử này trong biến môi trường CORS của Backend; không dừng dịch vụ khác. Playwright không tự dùng lại server đang chiếm cổng trừ khi đặt rõ `SMARTCLASS_E2E_REUSE=1`.

Blocker hiện tại: chưa kết nối được `localhost:1880`, nên không xác nhận được State/ACK của flow và thiết bị thật. Cần đối chiếu JSON thực với stateAdapter trước khi xác nhận tích hợp vật lý hoàn tất. AUTO vẫn chỉ đọc do chưa có hợp đồng API chuyển chế độ.

Kiểm chứng ngày 08/11/2026: `npm run build` thành công, Dashboard/Recharts đã tách khỏi bundle Login; 23 test Chromium đạt, không bỏ qua. Đã kiểm tra ảnh desktop/mobile, viewport tablet, dữ liệu telemetry MySQL qua Spring Boot thật và lỗi State khi Node-RED offline. Test dùng cổng Frontend 5174 vì 5173 đang thuộc ứng dụng khác; origin này chỉ được thêm bằng tham số khởi động Backend tạm. Không sửa cấu hình Backend đã lưu, không gửi lệnh vật lý. Database chính giữ 3 users, 2 devices, 1 telemetry, 1 command log và Flyway V1. Các dịch vụ kiểm thử tạm đã dừng khi hoàn tất.
