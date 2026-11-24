# Báo cáo hệ thống quản lý phòng học SmartClass IoT

## 1 Giới thiệu và mục tiêu

SmartClass IoT kết hợp quản lý phòng học với giám sát và điều khiển thiết bị qua mạng. Người dùng theo dõi nhiệt độ, độ ẩm, ánh sáng và chuyển động trên giao diện web. Người có quyền có thể điều khiển quạt, đèn và cấu hình tự động hóa. Hai mô hình AI hỗ trợ phát hiện bất thường và ước tính mức sử dụng phòng.

Đề tài hướng tới việc tập trung dữ liệu môi trường, lưu lịch sử, điều khiển theo quyền sử dụng phòng và hỗ trợ quản lý đặt lịch, sự cố, thông báo. Báo cáo trình bày thiết kế đã có trong mã nguồn; kết quả vận hành cần được đối chiếu bằng thử nghiệm thực tế.

## 2 Phạm vi triển khai

Danh mục Nhà A gồm 3 tầng, 15 phòng. Phòng **101** là phòng tích hợp IoT hiện tại với một node cảm biến và một node relay. Những phòng chưa lắp thiết bị không được gán số đo giả. Hệ thống chưa có OTA và chưa có cảm biến dòng điện để xác nhận trạng thái tải.

## 3 Kiến trúc hệ thống

```text
ESP32 cảm biến ── MQTT ──┐
       │ UART           ├── Mosquitto ── Node-RED
ESP32 relay ─── MQTT ───┘                    │
                                   trạng thái và lệnh
                                            │
React ── HTTP và JWT ── Spring Boot ── HTTP ──┘
                              │
                              ├── MySQL ← Node-RED ghi telemetry
                              └── FastAPI và mô hình AI
```

Frontend gửi yêu cầu tới Spring Boot. Backend xác thực JWT, kiểm tra vai trò và quyền theo phòng/lịch, sau đó đọc trạng thái hoặc chuyển lệnh qua Node-RED. Node-RED giao tiếp MQTT với ESP32 và ghi telemetry vào MySQL. Backend đọc lịch sử từ MySQL và gọi FastAPI khi cần phân tích AI.

UART truyền dữ liệu trực tiếp từ node cảm biến sang node relay, phục vụ AUTO cục bộ của firmware. Cơ chế này khác tự động hóa do backend quản lý.

| Thành phần | Công nghệ | Cổng mặc định |
|---|---|---|
| Frontend | React, Vite | 5173 |
| Backend | Java 17 trở lên, Spring Boot | 8080 |
| AI | Python 3.12, FastAPI, scikit-learn 1.6.1 | 8000 |
| Database | MySQL 8, Flyway, JPA | 3306 |
| MQTT | Mosquitto | 1883 |
| Tích hợp IoT | Node-RED, node-red-node-mysql | 1880 |

## 4 Thiết kế phần cứng

| Linh kiện | Số lượng | Nhiệm vụ |
|---|---|---|
| ESP32 | 2 | Thu thập cảm biến và điều khiển relay |
| DHT22 | 1 | Đo nhiệt độ và độ ẩm |
| PIR | 1 | Phát hiện chuyển động |
| Module LDR ngõ AO | 1 | Đọc tín hiệu ánh sáng analog |
| Relay | 2 kênh | Đóng ngắt quạt và đèn |
| Quạt và đèn thử nghiệm | Mỗi loại 1 | Tải điều khiển |

Hệ thống cần nguồn phù hợp, dây nối và máy tính chạy các dịch vụ. Danh sách phản ánh thiết kế firmware; thông số tải và ảnh mô hình cần được ghi theo phần cứng sử dụng thực tế.

| Tín hiệu | Chân GPIO |
|---|---|
| DHT22 DATA vào node cảm biến | GPIO5 |
| PIR OUT vào node cảm biến | GPIO4 |
| LDR AO vào node cảm biến | GPIO34 |
| UART TX node cảm biến sang RX node relay | GPIO1 → GPIO32 |
| Relay đèn | GPIO25 trên node relay |
| Relay quạt | GPIO26 trên node relay |

UART dùng 9600 baud, hai node chung GND. GPIO3 của node cảm biến và GPIO33 của node relay không cần nối trong đường truyền một chiều. GPIO1 dùng chung cổng Serial nên cần chú ý khi nạp và gỡ lỗi. Điện áp AO vào GPIO34 không vượt 3,3 V. Firmware hiện kích relay mức HIGH; cần đối chiếu module thực tế. Đây là sơ đồ tín hiệu, chưa phải sơ đồ điện nguồn và tải.

## 5 Truyền thông và lưu trữ

| Topic MQTT | Vai trò |
|---|---|
| `smarthome/esp32/sensor/state` | Node cảm biến gửi trạng thái |
| `smarthome/esp32/relay/state` | Node relay gửi trạng thái và phản hồi |
| `smarthome/esp32/relay/cmd` | Node relay nhận lệnh |

Hai flow tích hợp chính là `deployment/node-red/SmartClass_Backend_Data.json` và `deployment/node-red/SmartClass_Backend_Control.json`. Chỉ import một lần để tránh trùng route hoặc ghi telemetry lặp.

Node-RED cung cấp GET `/smartclass/api/state`, POST `/smarthome/api/cmd` và GET `/smartclass/api/control/status`. Frontend gọi API backend thay vì truy cập trực tiếp đường điều khiển Node-RED.

Flow loại bỏ bản tin retained. Sau khoảng 10 giây không có MQTT mới, flow đánh dấu mất kết nối và trả số đo chính là null. Dữ liệu gồm ID thiết bị, nhiệt độ, độ ẩm, ánh sáng, ADC LDR, chuyển động, trạng thái quạt/đèn, thời điểm và metadata chất lượng ánh sáng.

MySQL lưu tài khoản, phòng, lịch đặt phòng, thiết bị, telemetry, lịch sử lệnh và các dữ liệu nghiệp vụ liên quan. Flyway quản lý schema tại `database/migrations/`; Maven đóng gói migration vào tài nguyên backend. JPA kiểm tra schema. Không sửa migration đã áp dụng.

Profile `local` có thể tạo dữ liệu phát triển còn thiếu. Hai thiết bị mẫu gắn phòng 101 là `node1_sensor` và `node2_actuator`.

## 6 Chức năng và phân quyền

| Nhóm chức năng | Nội dung |
|---|---|
| Quản lý phòng | Danh mục, đặt và duyệt lịch, thông tin sử dụng |
| Giám sát IoT | Trạng thái kết nối, số đo hiện tại, lịch sử |
| Điều khiển | Bật/tắt quạt và đèn, theo dõi kết quả lệnh |
| Tự động hóa | Ngưỡng thiết bị và thời gian chờ không chuyển động |
| Cảnh báo và AI | Đánh giá bất thường, ước tính mức sử dụng phòng |
| Cá nhân | Lịch giáo viên, thông báo, hồ sơ, đổi mật khẩu |
| Quản trị | Quản lý người dùng và thiết bị |

Hệ thống có ba vai trò ADMIN, TEACHER và STUDENT. Giáo viên chỉ điều khiển khi có lịch đã duyệt đang diễn ra tại đúng phòng. Admin quản lý theo trạng thái hoạt động của phòng. Backend kiểm tra quyền tại thời điểm thao tác; xem được trang hoặc cảnh báo không đồng nghĩa với quyền bật/tắt thiết bị.

API nghiệp vụ sử dụng JWT. Mật khẩu dùng BCrypt; đổi mật khẩu làm mất hiệu lực token cũ. Giao diện lưu token theo tab trong `sessionStorage`.

## 7 Điều khiển và tự động hóa

### Xác nhận lệnh

Backend chuyển lệnh qua Node-RED tới MQTT. Với firmware hỗ trợ ACK, hệ thống đối chiếu ID, target và action trước khi xác nhận `SUCCESS`. Firmware cũ có thể chỉ trả `ACCEPTED`, nghĩa là đã tiếp nhận yêu cầu. Khi timeout, không tự gửi lại vì kết quả thực thi có thể chưa rõ.

`SUCCESS` phản ánh firmware đã cập nhật GPIO. Việc quạt quay hoặc đèn sáng cần được kiểm tra bằng quan sát tải hoặc cảm biến phản hồi.

### Tự động hóa tại backend

Ngưỡng mặc định của quạt là bật/tắt tại 30/28 °C; đèn là 150/250 lux. Giữa hai ngưỡng giữ trạng thái trước để hạn chế đóng ngắt liên tục. Cấu hình còn có thời gian chờ khi không phát hiện chuyển động.

Tự động hóa yêu cầu dữ liệu mới, quyền hợp lệ và kết quả lệnh được xác nhận. Khi dữ liệu cũ hoặc kết quả chưa rõ, hệ thống dừng tự động hóa. Giá trị ánh sáng quy đổi cần được hiệu chuẩn trước khi xem như phép đo lux thực.

### AUTO cục bộ trên ESP32

Firmware còn hỗ trợ AUTO qua UART: mặc định quạt bật khi nhiệt độ lớn hơn 35 °C; đèn dựa trên ngưỡng ánh sáng 70% và điều kiện PIR. Đây là ngưỡng phần trăm của firmware, khác đơn vị và cơ chế của backend.

Khi nhận lệnh backend có ID, firmware chuyển cả hai kênh sang điều khiển thủ công tương ứng để tránh AUTO cục bộ cạnh tranh. Không thao tác dashboard AUTO cũ đồng thời với phiên demo tự động hóa trên web.

## 8 AI và cảnh báo

### Phát hiện bất thường

Isolation Forest nhận nhiệt độ, độ ẩm, sáng/tối và chuyển động, trả `NORMAL` hoặc `ANOMALY`. ADC được chuyển thành boolean theo ngưỡng cấu hình; ý nghĩa tín hiệu ánh sáng so với tập huấn luyện cần được đối chiếu thực tế.

Phần giải thích thử thay từng đặc trưng bằng giá trị tham chiếu và quan sát điểm quyết định. Kết quả mô tả phản ứng cục bộ của model, không xác định nguyên nhân vật lý hoặc xác suất sự cố.

### Ước tính mức sử dụng phòng

Random Forest sử dụng nhiệt độ/ánh sáng trung bình cùng thời điểm, giá trị PIR tổng hợp và giờ địa phương. Phòng hiện có một cảm biến mỗi loại, không nhân bản số đo để giả lập nhiều vị trí.

Nhãn `EMPTY`, `LOW`, `CROWDED` được hiển thị là Trống, Ít người, Đông người. Đây là ước tính; PIR không đếm sĩ số. Kết quả cần đi kèm cảnh báo nếu đầu vào ngoài phạm vi dữ liệu đã kiểm tra hoặc ánh sáng chưa được hiệu chuẩn.

### Cảnh báo theo quy tắc

Trang cảnh báo thiết bị xét bốn trường hợp: nóng nhưng quạt tắt; nhiệt độ thấp nhưng quạt bật; thiếu sáng nhưng đèn tắt; đủ sáng nhưng đèn bật. Cảnh báo dùng ngưỡng đã lưu và cần dữ liệu mới, đồng bộ thời gian. Thiếu dữ liệu được biểu diễn là chưa đủ dữ liệu. Trang cảnh báo không tự gửi lệnh điều khiển.

## 9 Kiểm thử và đánh giá

Mã nguồn có kiểm thử Java, Playwright, Python và hàm IoT bằng Node.js. Lệnh nằm tại [hướng dẫn kiểm thử](../tests/README.md). Kiểm thử MySQL cần database riêng có tiền tố `smartclass_verify_`.

Playwright mặc định sử dụng API fixture nên không chứng minh kết nối thiết bị thật. `verify_models.py` đối chiếu hành vi artifact với CSV; kết quả khớp không thay thế đánh giá độ chính xác tại phòng thực tế.

Khi nghiệm thu cần ghi riêng kết quả đăng nhập/phân quyền, cảm biến, điều khiển và ACK, mất kết nối, tự động hóa và AI. [Hướng dẫn demo](HUONG_DAN_DEMO.md) cung cấp trình tự và danh sách kiểm tra. Chỉ ghi kết quả đạt sau khi thực hiện và lưu bằng chứng.

## 10 Giới hạn và hướng phát triển

Phần cứng mới tập trung ở phòng 101. Ánh sáng quy đổi từ LDR chưa phải phép đo lux đã hiệu chuẩn; một số dữ liệu lịch sử cũng có thể chứa giá trị quy đổi. PIR không khẳng định phòng trống khi người dùng ngồi yên. Model AI cần được đánh giá trên dữ liệu thực tại nơi triển khai.

Hướng phát triển gồm hiệu chuẩn hoặc thay cảm biến ánh sáng, thu dữ liệu có nhãn để đánh giá AI, bổ sung phản hồi tải, hoàn thiện sơ đồ điện và mở rộng thiết bị sang các phòng khác. OTA chưa được triển khai trong phiên bản hiện tại.

## 11 Tài liệu đối chiếu

- [README dự án](../README.md): cấu hình, lệnh chạy, API và xử lý lỗi.
- [Phần cứng](../hardware/README.md) và [firmware](../firmware/README.md).
- [Triển khai Node-RED](../deployment/README.md) và [cơ sở dữ liệu](../database/README.md).
- Mã AI, artifact và công cụ kiểm chứng tại `backend/ai-service/`.
- File Word trong thư mục `docs` là tài liệu tham khảo dashboard độc lập; cấu hình cũ cần đối chiếu với firmware hiện hành.
