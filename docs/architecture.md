# Kiến trúc SmartClass IoT

```text
ESP32 Devices
      |
      | MQTT
      v
Mosquitto :1883
      |
      v
Node-RED :1880
      |
      | Internal HTTP API
      v
Spring Boot :8080
      |
      | REST + JSON + JWT
      v
React SPA :5173

         MySQL :3306
          /       \
     Node-RED   Spring Boot
```

Sơ đồ thể hiện các tầng; React gửi request tới Spring Boot, Spring Boot gọi Node-RED và nhận response.

- ESP32 đọc cảm biến và điều khiển Relay.
- Mosquitto là MQTT Broker trung chuyển thông điệp.
- Node-RED xử lý MQTT, Rule Engine, cache trạng thái và lưu telemetry.
- Spring Boot là BFF, quản lý nghiệp vụ, dữ liệu, bảo mật và giao tiếp HTTP nội bộ với Node-RED.
- React hiển thị giao diện và chỉ gọi API Spring Boot. Không gọi trực tiếp Node-RED hoặc MQTT.
- Node-RED và Spring Boot cùng sử dụng MySQL `smartclass_db`. Dự kiến Node-RED ghi telemetry, Spring Boot đọc telemetry và quản lý dữ liệu nghiệp vụ. Schema, command logs và quyền ghi/đọc cụ thể được chốt trong giai đoạn Database để tránh ghi trùng luồng dữ liệu.

## Trạng thái sau Prompt 2

Backend giữ Spring Boot 3.5.9, Java 17 và package `iot.iot`. Flyway quản lý bốn bảng nghiệp vụ users/devices/telemetry/command_logs; Hibernate chỉ validate. Database được Connector/J tự tạo nếu chưa có và tài khoản có quyền. Chi tiết [Database Layer](database.md).

Spring Boot seed ba users (hash BCrypt) và hai devices trong profile local, bỏ qua bản ghi tồn tại. Ở Prompt 2, Security/JWT/Redis được giữ trong profile future-integrations; Prompt 3 đã kích hoạt Security/JWT và tiếp tục để Redis ngoài phạm vi. Phần Authentication được bổ sung ở Prompt 3 bên dưới; các API nghiệp vụ và kết nối Node-RED/MQTT chưa triển khai. Frontend giữ nguyên placeholder từ Prompt 1.

Node-RED được phép INSERT telemetry và command_logs theo hợp đồng SQL chung; Prompt 2 kiểm tra bằng SQL trực tiếp và JPA, không sửa hoặc gọi flow Node-RED. React vẫn chỉ hướng tới BFF. CORS đã bổ sung trong Prompt 3 cho React tại 5173.

## Tham khảo

- [Spring Boot auto-configuration](https://docs.spring.io/spring-boot/reference/using/auto-configuration.html)
- [Tailwind CSS v4 với Vite](https://tailwindcss.com/docs/installation/using-vite)
- [Yêu cầu Node của Vite](https://vite.dev/guide/)

## Bổ sung Prompt 3

Đã có Authentication JWT stateless, login và /me, CORS React 5173. Quyền request lấy từ MySQL mỗi lần; chỉ API users dành ADMIN. Spring Security/JJWT đã được đưa ra khỏi profile future-integrations; Redis và các thư viện chưa dùng vẫn giữ trong profile đó. Không sửa schema hoặc tích hợp Node-RED. Chi tiết [Authentication](authentication.md).

## Trạng thái sau Prompt 6

Spring Boot đã triển khai State/Control qua HTTP nội bộ Node-RED, truy vấn Telemetry/Commands từ MySQL và CRUD Users/Devices. Frontend vẫn giữ các trang placeholder. Luồng quản trị đi qua Controller → Service → Repository → MySQL; chỉ ADMIN được truy cập cả Users và Devices. JWT đối chiếu ID tài khoản và nạp lại quyền từ database mỗi request.

Các transaction quản trị bảo vệ ADMIN cuối cùng và giữ nguyên lịch sử khi thiết bị có tham chiếu; không sửa Flyway schema hoặc dùng CASCADE DELETE. Chi tiết [API quản trị](admin-api.md), [hợp đồng API](api-contract.md), [tích hợp Node-RED](nodered-integration.md).

## Frontend Login và Authentication

React đã có Login, AuthContext, Axios Bearer interceptor và route bảo vệ theo role. Token lưu theo phiên tab; user/role được xác nhận lại qua `/api/auth/me` khi tải trang hoặc kích hoạt tab. Login gọi trực tiếp BFF cổng 8080 theo CORS hiện có, không qua Node-RED. Dashboard/History/Admin vẫn là placeholder. Chi tiết [xác thực Frontend](frontend-authentication.md).

## Bổ sung Prompt 8

Dashboard đã đọc State định kỳ và Telemetry từ Spring Boot, hiển thị cảm biến/biểu đồ, gửi Control FAN/LIGHT theo ACK hiện có. Vòng đọc tuần tự, tạm dừng khi ẩn tab/rời route; không dùng dữ liệu giả khi API lỗi. AUTO chỉ hiển thị nếu State có dữ liệu. Giữ AuthContext và bảo mật hiện có; không sửa tầng Backend/Node-RED/database. Node-RED offline nên ánh xạ State và điều khiển vật lý vẫn cần xác minh. Chi tiết [Dashboard](dashboard.md).

## Trang History

History đã tra cứu Telemetry và Commands qua BFF, tách hai tab có bộ lọc riêng. Commands phân trang tại MySQL qua Backend; Telemetry lấy số bản ghi mới nhất có giới hạn. Frontend hủy request cũ và không polling ở History, dùng chung JWT/Layout và định dạng giờ Việt Nam với Dashboard. Không thay đổi các tầng bên dưới. Chi tiết [History](history.md).

## Prompt 10 — Frontend Admin

React đã có CRUD Users/Devices qua BFF, phân trang server-side, tìm kiếm/bộ lọc, form modal và xác nhận xóa. Guard ADMIN hiện có ngăn người dùng không phù hợp truy cập; Backend tiếp tục quyết định quyền và bảo vệ ADMIN cuối cùng/lịch sử. Frontend ánh xạ DTO/enum đúng hợp đồng, không lưu password_hash. Không sửa API, JWT Backend, schema hoặc middleware. Chi tiết [Frontend Admin](frontend-admin.md).
