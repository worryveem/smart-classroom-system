# Trang History

Route `/history` yêu cầu đăng nhập, dùng lại AuthContext, ProtectedRoute, Layout và Axios/JWT interceptor hiện có. Trang có hai tab giữ bộ lọc riêng: lịch sử cảm biến và lịch sử điều khiển. Không đổi Backend, schema, Node-RED hoặc firmware.

## Hợp đồng API

| Tab | Endpoint | Query parameters | Dữ liệu đọc |
|---|---|---|---|
| Cảm biến | GET `/api/telemetry` | deviceId, from, to, limit | Mảng tại `data` |
| Điều khiển | GET `/api/commands` | page, size, deviceId, target, triggerBy, from, to | `data.content` và page/size/totalElements/totalPages |

Telemetry mặc định lấy tối đa 100 bản ghi mới nhất; cho phép giới hạn 1–1000, không phân trang phía trình duyệt. Khi đủ số lượng giới hạn, hiển thị nhắc thu hẹp bộ lọc hoặc tăng giới hạn; không coi số bản ghi đã tải là tổng lịch sử toàn hệ thống.

Commands dùng page bắt đầu từ 0 và size mặc định 20; giao diện cho chọn 10/20/50/100. Nút phân trang gửi page/size tới Backend, không tải toàn bộ lịch sử về để tự chia trang. Tổng số bản ghi/trang lấy nguyên từ response. Thay bộ lọc hoặc size đưa về page 0; đổi tab giữ bộ lọc và trang đã chọn. Trang vượt phạm vi vẫn cho quay về trang đầu.

## Bộ lọc và hiển thị

Device ID nhập trực tiếp, để trống nghĩa là không lọc. Không gọi `/api/devices` để lấy danh sách vì API đó chỉ dành ADMIN trong khi History dành mọi tài khoản đăng nhập. TriggerBy là username hoặc RULE_ENGINE, không thay thế danh tính JWT. Target dùng FAN/LIGHT hoặc để trống.

Bộ lọc hợp lệ tự áp dụng sau 400 ms ngừng nhập để tránh request mỗi phím gõ. from/to là thời điểm ISO cục bộ theo giờ Việt Nam, gồm giây và có cả hai biên; không chuyển sang múi giờ trình duyệt khi gửi. from phải không lớn hơn to. Trường sai và giới hạn không hợp lệ có lỗi tại chỗ, không gọi API.

Bảng giữ thứ tự mới nhất trước của Backend. Dùng chung `utils/dateTime.js` với Dashboard để hiển thị UTC+07:00 kể cả trình duyệt đặt múi giờ khác. Giá trị số định dạng vi-VN; null là `—`, không chuyển thành 0. PIR true/false/null hiển thị Có người/Không có người/Chưa rõ. ON/OFF và RULE_ENGINE/username có Badge khác nhau. Bảng cuộn ngang trong vùng riêng trên màn hình nhỏ.

## Tải dữ liệu và lỗi

Chỉ tab đang mở mới truy vấn. Không có polling nền. Mỗi tab giữ một kết quả gần nhất theo đúng bộ lọc/trang; chuyển qua lại cùng truy vấn dùng lại kết quả và ghi rõ thời điểm đã tải. Nút Làm mới luôn thực hiện request mới.

Đổi truy vấn/tab hoặc unmount hủy request đang chờ; response cũ không ghi đè kết quả mới. Đổi bộ lọc không hiển thị dữ liệu thuộc bộ lọc cũ. Làm mới cùng bộ lọc giữ kết quả cũ trong lúc tải; nếu lỗi có cảnh báo rõ đây là dữ liệu lần trước. Cache chỉ nằm trong bộ nhớ trang, không lưu lịch sử vào storage.

Có Loading, Empty State, lỗi dữ liệu không đúng hợp đồng, lỗi mạng/timeout và lỗi Backend. HTTP 401 dùng interceptor hiện có để xóa phiên và chuyển Login với thông báo phiên hết hạn; HTTP 403 hoặc lỗi mạng không tự xóa token. Không tạo dữ liệu giả khi API trống/lỗi.

## Kiểm thử

Chạy `npm run build` và `npm test` trong frontend. `tests/history.spec.js` kiểm tra hai bảng, múi giờ Việt Nam khi trình duyệt ở New York, số 0/null/PIR, debounce, khoảng thời gian/giới hạn, kết hợp bộ lọc Commands, phân trang Backend, cache riêng theo tab, request cũ, lỗi API/mạng, JWT và bảng cuộn responsive.

Test Spring Boot thật chỉ đọc dữ liệu MySQL hiện có, bật bằng biến môi trường tài khoản theo [frontend-authentication.md](frontend-authentication.md). HTTP mock chỉ dùng trong tests, không nằm trong mã chạy thực tế. Nếu 5173 bận, dùng SMARTCLASS_E2E_PORT=5174 và origin CORS kiểm thử tương ứng ở tiến trình Backend tạm.

Kiểm chứng ngày 08/11/2026: `npm run build` thành công; toàn bộ 32 test Chromium đạt, không bỏ qua, gồm bộ test Authentication/Dashboard và 9 test History. Hai API History đã đọc từ Spring Boot/MySQL thật, kiểm tra lọc thiết bị/người thực hiện và metadata phân trang. Đã xem ảnh hai tab desktop và bảng cuộn mobile; múi giờ Việt Nam được kiểm tra trong trình duyệt đặt New York. Database chính giữ nguyên 3 users, 2 devices, 1 telemetry, 1 command log và Flyway V1. Không gửi request ghi dữ liệu; Backend tạm tắt seeder/Flyway và chỉ thêm origin 5174 qua tham số tiến trình để kiểm thử. Các dịch vụ kiểm thử tạm đã dừng sau khi hoàn tất.
