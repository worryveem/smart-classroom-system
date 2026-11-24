# Phần cứng

Linh kiện suy ra từ firmware: 2 ESP32 Dev Module, DHT22, PIR, module LDR ngõ AO, 2 kênh relay, quạt/đèn thử nghiệm, nguồn phù hợp và dây nối.

| Tín hiệu | Chân |
|---|---|
| Node cảm biến: DHT22 DATA | GPIO5 |
| Node cảm biến: PIR OUT | GPIO4 |
| Node cảm biến: LDR AO | GPIO34, 0–3,3 V |
| UART cảm biến TX → relay RX | GPIO1 → GPIO32, baud 9600 |
| Node relay: đèn | GPIO25 |
| Node relay: quạt | GPIO26 |

Hai node cần chung GND cho UART. GPIO3 cảm biến và GPIO33 relay không cần nối khi truyền một chiều. GPIO1 dùng chung cổng nạp/Serial, cần lưu ý khi nạp và debug. Relay hiện active HIGH; đối chiếu module thực tế trước khi cấp tải.

Đây là sơ đồ tín hiệu theo firmware, chưa phải sơ đồ điện nguồn/tải đã xác nhận. Chưa có ảnh prototype trong mã nguồn; bổ sung ảnh thực tế tại đây khi có.
