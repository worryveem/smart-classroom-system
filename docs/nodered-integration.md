# Node-RED State & Control — Prompt 4

Frontend chỉ gọi Spring Boot. Backend chỉ dùng HTTP tới Node-RED; không kết nối MQTT.

## Cấu hình môi trường

| Biến | Mặc định |
|---|---|
| NODERED_BASE_URL | http://localhost:1880 |
| NODERED_STATE_PATH | /smarthome/api/state |
| NODERED_COMMAND_PATH | /smarthome/api/cmd |
| NODERED_CONNECT_TIMEOUT | 3000 milliseconds |
| NODERED_READ_TIMEOUT | 15000 milliseconds |
| NODERED_ACTUATOR_DEVICE_ID | node2_actuator |

Nếu flow thực dùng `/smarthome/api/command`, đặt đúng NODERED_COMMAND_PATH. Client không tự thử endpoint khác, không retry và không theo redirect. Không chuyển Bearer JWT của người dùng sang Node-RED.

## API

- `GET /api/state`: Bearer JWT bắt buộc, trả ApiResponse với toàn bộ JSON object/array Node-RED trong data, không map mất field và không fallback sang telemetry MySQL. Cache-Control: no-store.
- `POST /api/control`: Bearer JWT bắt buộc, body chỉ gồm `{"target":"FAN","action":"ON"}`. target FAN/LIGHT, action ON/OFF. Field lạ, kể cả trigger_by/username/role, bị từ chối 400. Node-RED cũng chỉ nhận target/action.

## Hợp đồng ACK tham chiếu

`msg` hoặc `status` chỉ nhận SUCCESS/ACCEPTED/FAILURE/TIMEOUT; nếu cả hai field có mặt phải giống nhau.

- SUCCESS: bắt buộc device_id/target/action đầy đủ và khớp lệnh, HTTP 200 với status SUCCESS.
- ACCEPTED: xác nhận đã tiếp nhận/publish, HTTP 202 với status ACCEPTED; không khẳng định thiết bị đã thực thi. Các field correlation nếu có vẫn phải khớp.
- FAILURE: HTTP 502, không ghi log.
- TIMEOUT hoặc read/connect timeout: HTTP 504, không có xác nhận thực thi; không tự gửi lại.
- Chỉ HTTP 200/202 hoặc `success:true` mà thiếu trạng thái hợp đồng không được coi là ACK. Response sai JSON, HTTP lỗi/redirect hoặc ACK không khớp trả 502.

Raw response của xác nhận hợp lệ được giữ ở data.node_red_response. Không tự tạo ACK. State/ACK thực tế vẫn cần đối chiếu khi Node-RED hoạt động.

## Ghi lịch sử

Kiểm tra thiết bị tồn tại trước khi gửi. BFF ghi đúng một command_logs cho mỗi request đã được xác nhận ACCEPTED/SUCCESS, với trigger_by từ principal Spring Security và timestamp do MySQL sinh. Không sửa/xóa log RULE_ENGINE. Không có transaction database mở trong lúc HTTP chờ ACK; chỉ việc ghi log có transaction riêng.

Nếu ghi log thất bại sau xác nhận, trả 500 với outcome đã xác nhận, log_status=FAILED và retry_safe=false. Đây là lỗi đồng bộ sau khi lệnh đã được tiếp nhận/thực hiện: không gửi lại để sửa log. Không thể rollback lệnh vật lý bằng transaction MySQL.

Các lỗi: request 400, JWT 401, thiếu quyền 403, thiết bị chưa có 404, database 500, response Node-RED 502, kết nối offline 503, timeout 504. Error response không lộ stack trace hoặc nội dung lỗi nội bộ.

Schema hiện có không có cột outcome; sự tồn tại của command_logs thể hiện xác nhận tiếp nhận/thực hiện, không đủ để phân biệt ACCEPTED và SUCCESS sau này. Không thay schema trong Prompt 4. Không có correlation ID nên không thể bảo đảm exactly-once khi phía gọi tự retry; client Backend không retry tự động.

## Kiểm thử và giới hạn xác minh

Chạy `backend/scripts/test-mysql.ps1` với DB_USERNAME/DB_PASSWORD đã cấu hình. HTTP stub chỉ bind loopback ở cổng ngẫu nhiên; các lệnh test không đến Node-RED/ESP32 thật. Test kiểm tra trạng thái/error/timeout, payload chính xác, số lần gửi, audit và RULE_ENGINE trên database kiểm thử tách biệt.

Khi khảo sát, GET localhost:1880/smarthome/api/state không kết nối được; chưa có flow tại workspace hoặc thư mục .node-red mặc định. Vì vậy chưa xác minh được endpoint command, JSON/ACK hoặc chủ thể ghi log của flow thực. Cần xác nhận flow không ghi thêm bản ghi cho cùng lệnh thủ công nếu BFF là nơi ghi audit; không tự dedup theo thời gian hoặc chỉnh flow. Không có lệnh điều khiển nào được gửi tới thiết bị vật lý.

Kiểm tra hoàn tất 07/11/2026: Maven clean verify thành công, 74 tests, 0 lỗi, 0 skipped; gồm MySQL thật ở database tách biệt và HTTP stub. Đã kiểm tra timeout cả trước headers lẫn khi đọc body. Node-RED thật vẫn chưa khả dụng; không ghi nhận PASS cho JSON/ACK của flow thực.
