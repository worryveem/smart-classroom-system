# Hướng dẫn chạy và trình diễn SmartClass IoT

## 1 Chuẩn bị

Cần Java 17 trở lên, MySQL 8, Node.js `^20.19.0` hoặc từ `22.12.0`, Python 3.12, Mosquitto, Node-RED và `node-red-node-mysql`. AI yêu cầu scikit-learn 1.6.1 để nạp model hiện có.

Demo thiết bị thật cần hai ESP32, cảm biến, relay, quạt/đèn thử nghiệm và mạng mà ESP32 truy cập được MQTT broker. Xem [kết nối tín hiệu](../hardware/README.md) và [nạp firmware](../firmware/README.md). Cấu hình Wi-Fi/MQTT theo mạng thực tế; `localhost` trên ESP32 không trỏ tới máy tính.

Các lệnh đầy đủ, biến môi trường và tài khoản phát triển nằm tại [README dự án](../README.md#khởi-chạy). Không ghi mật khẩu cá nhân vào ảnh chụp hoặc báo cáo.

## 2 Trình tự khởi động

1. Khởi động MySQL và Mosquitto. Kiểm tra ESP32 truy cập được cổng MQTT.
2. Cấp biến môi trường backend theo README, gồm tài khoản database và `JWT_SECRET`. Spring Boot không tự đọc `.env`. Dùng profile `local` khi cần dữ liệu phát triển.
3. Tại `backend`, chạy `./mvnw.cmd spring-boot:run`. Chờ Flyway và backend khởi động thành công.
4. Trong Node-RED, import một lần `SmartClass_Backend_Data.json` và `SmartClass_Backend_Control.json` tại `deployment/node-red/`. Cấu hình MQTT/MySQL rồi Deploy.
5. Nạp đúng sketch và cấp nguồn cho hai ESP32; kiểm tra MQTT và UART.
6. Tại `backend/ai-service`, tạo môi trường theo README nếu chưa có; chạy `.venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 8000`.
7. Tại `frontend`, chạy `npm ci` nếu chưa cài thư viện, cấu hình `.env.local` theo mẫu rồi chạy `npm run dev`.
8. Mở `http://localhost:5173`, đăng nhập và chọn phòng 101.

Chỉ sao chép cấu hình mẫu khi chưa có cấu hình cá nhân. Không import dashboard Node-RED tham khảo chồng lên flow đang chạy.

## 3 Kiểm tra trước khi trình bày

| Thành phần | Dấu hiệu cần quan sát |
|---|---|
| Backend | Đăng nhập được, API xác thực hoạt động |
| AI | `http://127.0.0.1:8000/health` phản hồi; kiểm tra trạng thái model trên web |
| Node-RED | GET `http://localhost:1880/smartclass/api/state` có phản hồi |
| Cảm biến | Đúng ID và thời điểm mẫu; số đo thay đổi theo thử nghiệm |
| Relay | Có kết nối, trạng thái quạt/đèn và phản hồi lệnh |
| Phân quyền | Tài khoản có quyền với phòng 101 tại thời điểm demo |

Nếu thiếu phần cứng hoặc dịch vụ, ghi rõ phần chưa kiểm chứng. Không dùng fixture làm bằng chứng thiết bị đang hoạt động.

## 4 Kịch bản trình diễn

### Bước 1 Giới thiệu

Mở danh sách phòng Nhà A, chỉ rõ phòng 101 có IoT. Trình bày luồng ESP32 → MQTT → Node-RED → backend → web, vai trò MySQL và AI.

### Bước 2 Quan sát cảm biến

Mở trang thiết bị phòng 101. Quan sát số đo và thời điểm cập nhật. Thay đổi ánh sáng lên LDR hoặc di chuyển trước PIR rồi đối chiếu phản hồi. Giải thích ánh sáng là giá trị quy đổi và PIR không đếm người.

### Bước 3 Điều khiển và phân quyền

Dùng tài khoản có quyền gửi một lệnh bật/tắt quạt hoặc đèn. Chờ kết quả, đối chiếu ACK và quan sát tải. Phân biệt `ACCEPTED` với `SUCCESS`. Thử tài khoản không có quyền để kiểm tra backend từ chối. Với giáo viên, cần lịch đã duyệt đang diễn ra ở phòng 101.

### Bước 4 Tự động hóa

Ghi lại cấu hình ban đầu. Bật tự động hóa, chọn ngưỡng phù hợp điều kiện demo và theo dõi lịch sử lệnh. Giải thích khoảng giữ trạng thái giữa ngưỡng bật/tắt. Không bật AUTO từ dashboard cũ đồng thời với backend. Khôi phục cấu hình ban đầu sau thử nghiệm.

### Bước 5 Cảnh báo và AI

Mở cảnh báo và giải thích điều kiện đủ dữ liệu. Chạy phân tích bất thường và ước tính mức sử dụng bằng dữ liệu đang nhận. Đối chiếu đầu vào, nhãn và cảnh báo chất lượng dữ liệu. Nếu kết quả khác quan sát, trình bày giới hạn model; không chọn sẵn nhãn để mô tả như kết quả đo.

### Bước 6 Mất kết nối và lịch sử

Ngắt một node khỏi mạng, chờ quá thời gian nhận biết dữ liệu cũ của flow (khoảng 10 giây). Quan sát trạng thái mất kết nối và số đo không còn được coi là hiện tại. Nếu đang thử tự động hóa, kiểm tra việc dừng khi dữ liệu không hợp lệ. Kết nối lại và xác nhận mẫu mới; mở lịch sử telemetry và lệnh.

## 5 Ghi nhận kiểm thử thực tế

Ghi ngày giờ, phiên bản mã nguồn, môi trường, loại firmware và người thực hiện trong biên bản. Với mỗi trường hợp, ghi kết quả quan sát, đạt/chưa đạt, ảnh hoặc log và nguyên nhân nếu chưa đạt. Bảng này là danh sách cần kiểm chứng, không phải kết quả đã chạy.

| Mã | Trường hợp | Tiêu chí |
|---|---|---|
| KT01 | Đăng nhập và vai trò | Đăng nhập được, quyền phù hợp vai trò |
| KT02 | Cảm biến | Đúng phòng/ID, mẫu mới, phản ứng đúng thao tác thử |
| KT03 | Điều khiển hợp lệ | Có kết quả, đối chiếu ACK và trạng thái GPIO |
| KT04 | Không có quyền | Backend từ chối điều khiển |
| KT05 | Mất kết nối | Báo mất kết nối, không coi dữ liệu cũ là hiện tại |
| KT06 | Tự động hóa | Theo ngưỡng, dừng khi dữ liệu hoặc kết quả lệnh không hợp lệ |
| KT07 | AI | Có đầu vào thực, nhãn và thông tin giới hạn tương ứng |
| KT08 | Lịch sử | Tra cứu được telemetry và kết quả lệnh của phiên thử |

Lệnh kiểm thử phần mềm nằm tại [tests/README.md](../tests/README.md). Ghi riêng bài bị bỏ qua do thiếu điều kiện. Kiểm thử MySQL phải dùng database riêng có tiền tố `smartclass_verify_`.

## 6 Xử lý lỗi khi demo

- Không có số đo: kiểm tra ESP32, MQTT, ID thiết bị, Node-RED và đường dẫn state.
- Node-RED trả 404: đối chiếu `/smartclass/api/state` và `/smarthome/api/cmd` với flow đã import.
- Không điều khiển được: kiểm tra lịch, quyền phòng, kết nối, chế độ tự động và ACK. Không gửi liên tục khi kết quả chưa rõ.
- AI chưa sẵn sàng: kiểm tra Python, artifact, scikit-learn 1.6.1 và `AI_BASE_URL`.
- Thiếu dữ liệu: kiểm tra thời điểm mẫu của cả node cảm biến và relay rồi chờ mẫu mới.
