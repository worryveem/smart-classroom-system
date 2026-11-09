# API gợi ý AI thử nghiệm

`app.py` cung cấp FastAPI cho hai artifact hiện có. API chỉ trả dự đoán và gợi ý tiếng Việt; chưa kết nối MQTT, MySQL, backend hoặc frontend, không điều khiển thiết bị.

## Chạy cục bộ

Dùng Python 3.12, chạy trong thư mục `AI-Service`:

```powershell
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Mở `http://127.0.0.1:8000/docs` để nhập dữ liệu và thử API. `GET /health` trả trạng thái từng model. Model không nạp được sẽ khiến endpoint tương ứng trả HTTP 503; lỗi đầu vào trả HTTP 422. Xem log máy chủ để biết lỗi nạp artifact. Chỉ dùng cục bộ hoặc trong mạng nội bộ có kiểm soát; API chưa có xác thực, backend phải kiểm tra quyền giáo viên/admin trước khi gọi.

Các phiên bản trong `requirements.txt` là môi trường mục tiêu cần kiểm chứng với artifact. Schema AI2 và cảnh báo khi nạp bước `SimpleImputer` của cả hai artifact đều ghi scikit-learn 1.6.1. API từ chối cảnh báo khác phiên bản scikit-learn thay vì âm thầm suy luận. Chỉ nạp file model cố định, đáng tin cậy trong dự án vì pickle có thể thực thi mã.

## Phát hiện bất thường

`POST /predict/anomaly`:

```json
{"temp": 29.5, "humidity": 71.0, "light": false, "motion": true}
```

- `temp`: °C; `humidity`: phần trăm, trong khoảng 0–100.
- `light`, `motion`: bắt buộc là boolean JSON. Không truyền giá trị lux vào `light`.
- Trả `NORMAL` hoặc `ANOMALY`, `decision_score`, `suggestion`, `experimental` và lưu ý giới hạn. Điểm quyết định không phải xác suất.

## Dự đoán mức hiện diện

`POST /predict/occupancy`:

```json
{"temp_mean": 25.2, "light_mean": 62.0, "pir_active": 0, "hour": 10}
```

- `pir_active`: số nguyên 0 hoặc 1; `hour`: số nguyên 0–23.
- Trả nhãn gốc `EMPTY`, `LOW`, `CROWDED`, gợi ý và các lưu ý. Không quy đổi nhãn thành sĩ số hoặc kết luận lớp đông người.
- Đầu vào ngoài phạm vi nhiệt độ 24,89–26,80 hoặc ánh sáng 0–193,75 của CSV được kèm cảnh báo.
- Chưa xác minh được `mean` là trung bình theo thời gian hay theo nhiều cảm biến; chưa xác minh đơn vị ánh sáng và múi giờ huấn luyện. Endpoint này dành cho dữ liệu đã chuẩn hóa theo mô hình, chưa phải dữ liệu ESP thô.

Tất cả trường là bắt buộc; API từ chối trường dư, giá trị không hữu hạn và kiểu dữ liệu sai. Không tự bù dữ liệu thiếu dù artifact có bước imputer.

## Tích hợp ESP sau này

Backend lấy telemetry theo phòng/thiết bị, kiểm tra độ mới và quyền truy cập, chuẩn hóa rồi gọi API này. Với AI1 có thể ánh xạ `humid` sang `humidity`, PIR sang `motion`; cần xác minh cách tạo boolean `light` hoặc huấn luyện lại bằng lux. Với AI2 cần có mã tiền xử lý gốc trước khi tính các đặc trưng `mean`. Không dùng kết quả thử nghiệm để tự động điều khiển.

## Kiểm thử

```powershell
.venv\Scripts\python -m pip install httpx==0.28.1
.venv\Scripts\python -m unittest -v test_app
```

Kiểm thử dùng model giả để kiểm tra hợp đồng HTTP, thứ tự đặc trưng, gợi ý, dữ liệu không hợp lệ và model chưa sẵn sàng. Đây không phải đánh giá độ chính xác hoặc kiểm chứng nạp artifact thật.

Kết quả kiểm tra ngày 09/11/2026: cả 4 kiểm thử đạt trên Python 3.12 có sẵn. Kiểm tra artifact thật trả trạng thái `degraded` vì môi trường có scikit-learn 1.9.0, khác phiên bản 1.6.1 trong artifact. Chưa kiểm chứng suy luận thật; cài môi trường riêng chưa thành công do pip không tìm được gói từ nguồn truy cập được. Cần cài đủ `requirements.txt`, kiểm tra `/health` trả `ready`, rồi đối chiếu dự đoán với CSV mẫu trước khi tích hợp backend.
