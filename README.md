# SmartClass IoT

Hệ thống quản lý phòng học, giám sát cảm biến, điều khiển quạt/đèn và phân tích AI. Đây là tài liệu hướng dẫn duy nhất của mã nguồn dự án.

## Kiến trúc

```text
ESP32 cảm biến ── MQTT ──┐
                        ├── Mosquitto ── Node-RED ── Spring Boot ── React
ESP32 relay ──── MQTT ──┘                   │              │
                                           └── MySQL ─────┘
                                                          │
                                                     FastAPI / AI
```

Frontend chỉ gọi backend bằng JWT. Node-RED đọc MQTT, cung cấp trạng thái và chuyển tiếp lệnh; Python chạy model. Toàn bộ quy tắc phân quyền và quyền điều khiển theo ca được kiểm tra ở backend.

Nhà A có 3 tầng, 15 phòng. Hiện chỉ phòng **101** có IoT; không tạo số đo giả cho các phòng chưa lắp thiết bị.

| Thành phần | Công nghệ | Cổng mặc định |
|---|---|---|
| Backend | Java 17 trở lên, Spring Boot, Maven Wrapper | 8080 |
| Frontend | React, Vite, React Router, Lucide, Recharts | 5173 |
| AI | Python 3.12, FastAPI, scikit-learn 1.6.1 | 8000 |
| Database | MySQL 8, Flyway, JPA | 3306 |
| MQTT | Mosquitto | 1883 |
| Tích hợp IoT | Node-RED, node-red-node-mysql | 1880 |

## Cấu trúc mã nguồn

```text
smart-classroom-system-main/
├── README.md
├── backend/
│   ├── src/main/java/iot/iot/
│   │   ├── account/, security/       Hồ sơ, mật khẩu, JWT và phân quyền
│   │   ├── classroom/, notification/ Phòng học, lịch, sự cố và thông báo
│   │   ├── alerts/, ai/             Cảnh báo, tự động hóa, tích hợp AI
│   │   ├── integration/nodered/     HTTP client nội bộ
│   │   └── controller/, service/, repository/, entity/, dto/
│   ├── src/main/resources/db/migration/
│   ├── src/test/java/iot/iot/
│   ├── scripts/                    Công cụ kiểm thử
│   └── mvnw, mvnw.cmd, pom.xml
├── frontend/
│   ├── src/app/, components/, context/, services/
│   ├── src/features/               Các trang theo chức năng
│   ├── src/styles/, assets/, hooks/, utils/
│   └── tests/                      Playwright
├── AI-Service/
│   ├── app.py, anomaly_explanation.py
│   ├── requirements.txt, requirements-dev.txt
│   ├── verify_models.py, test_*.py
│   ├── train_occupancy_adc.py       Công cụ huấn luyện tùy chọn
│   ├── AI1-Service/                Artifact, CSV và biểu đồ bất thường
│   └── AI2_Occupancy/               Artifact, CSV và báo cáo hiện diện
└── IOT/
    ├── ESP32_1_Sensors_MQTT/        DHT, PIR, LDR và UART
    ├── ESP32_2_Relay_AUTO_SETTINGS/ Relay quạt/đèn, cấu hình và ACK
    ├── SmartClass_Backend_Data.json
    ├── SmartClass_Backend_Control.json
    └── *.cjs, *.test.cjs            Hàm Node-RED, quy đổi ánh sáng và kiểm thử
```

`node_modules`, `.venv`, `target`, `dist`, `.runtime` và báo cáo kiểm thử là thư viện hoặc sản phẩm cục bộ, không phải mã nguồn để đưa vào Git. Giữ nguyên migration đã áp dụng; không xóa hoặc chỉnh checksum chỉ vì một giao diện cũ không còn dùng.

## Khởi chạy

### 1. MySQL và backend

Cần MySQL đang chạy. Mở PowerShell tại gốc dự án:

```powershell
$env:DB_USERNAME = 'root'
$mysqlSecret = Read-Host 'Mật khẩu MySQL' -AsSecureString
$env:DB_PASSWORD = [System.Net.NetworkCredential]::new('', $mysqlSecret).Password
$env:SPRING_PROFILES_ACTIVE = 'local'

# Tạo khóa cho môi trường phát triển; giữ nguyên khóa giữa các lần chạy nếu muốn giữ phiên đăng nhập.
$keyBytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($keyBytes)
$rng.Dispose()
$env:JWT_SECRET = [Convert]::ToBase64String($keyBytes)

$env:NODERED_BASE_URL = 'http://localhost:1880'
$env:NODERED_STATE_PATH = '/smartclass/api/state'
$env:NODERED_COMMAND_PATH = '/smarthome/api/cmd'
$env:AI_BASE_URL = 'http://127.0.0.1:8000'

cd backend
.\mvnw.cmd spring-boot:run
```

Các đường dẫn Node-RED trên khớp hai flow trong `IOT/`. Backend mặc định dùng database `smartclass_db`; thay `DB_HOST`, `DB_PORT`, `DB_NAME` khi cần. Spring Boot **không tự đọc `.env`**; xem các biến tham khảo trong `backend/.env.example` và đặt trong terminal hoặc cấu hình IDE.

Flyway tạo/cập nhật schema, JPA chỉ validate. Profile `local` có thể seed tài khoản/thiết bị còn thiếu, không tự reset bản ghi đã tồn tại. Đặt `APP_SEED_ENABLED=false` nếu không cần seed. Không bật profile `local` trên môi trường vận hành thật; không lưu mật khẩu hoặc khóa JWT vào Git.

Tài khoản phát triển mặc định, nếu chưa được thay đổi:

| Tên đăng nhập | Vai trò | Mật khẩu phát triển |
|---|---|---|
| admin | ADMIN | Admin@12345 |
| teacher | TEACHER | Teacher@12345 |
| student | STUDENT | Student@12345 |

Có thể thay mật khẩu seed bằng `SEED_ADMIN_PASSWORD`, `SEED_TEACHER_PASSWORD`, `SEED_STUDENT_PASSWORD` trước khi tạo tài khoản. Mật khẩu thật dùng BCrypt. Token lưu theo tab trong `sessionStorage`; đổi mật khẩu làm mất hiệu lực các token cũ. Đổi `JWT_SECRET` yêu cầu đăng nhập lại.

### 2. Frontend

Cần Node.js `^20.19.0` hoặc từ `22.12.0` trở lên. Mở terminal khác:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Mở http://localhost:5173. Chỉ sao chép `.env.example` khi chưa có cấu hình cá nhân. `VITE_API_BASE_URL` mặc định là `http://localhost:8080`; không đặt secret trong biến `VITE_*`. Nếu đổi cổng/origin frontend, cập nhật `CORS_ALLOWED_ORIGINS` ở backend. Khi triển khai SPA cần fallback các đường dẫn về `index.html`.

### 3. Dịch vụ AI

Mở terminal khác:

```powershell
cd AI-Service
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -r requirements-dev.txt
.venv\Scripts\python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Chỉ tạo môi trường khi chưa có `.venv`. Kiểm tra http://127.0.0.1:8000/health và tài liệu API tại `/docs`. Cần đúng scikit-learn **1.6.1** để nạp artifact; không bỏ kiểm tra phiên bản để ép chạy model. Chỉ nạp file model cố định, đáng tin cậy trong dự án. Python và Node-RED nên giới hạn trong loopback hoặc mạng nội bộ có kiểm soát.

### 4. Node-RED và ESP32

1. Cấu hình Wi-Fi và MQTT cho hai ESP32 theo mạng đang dùng, nạp đúng firmware cho từng node.
2. Trong Node-RED, cài `node-red-node-mysql`, import **một lần** `IOT/SmartClass_Backend_Data.json` và `IOT/SmartClass_Backend_Control.json`.
3. Sửa broker MQTT và cấu hình MySQL đúng môi trường. ESP phải truy cập được địa chỉ broker thật; `localhost` trên ESP không trỏ tới máy chủ.
4. Khởi động backend để có schema trước khi Node-RED ghi telemetry. Hai thiết bị mặc định là `node1_sensor`, `node2_actuator`, gắn phòng 101.
5. Deploy flow và kiểm tra kết nối. Không import lặp flow gây trùng HTTP route hoặc ghi lặp telemetry.

Các endpoint Node-RED:

| Phương thức | Đường dẫn | Chức năng |
|---|---|---|
| GET | `/smartclass/api/state` | Trạng thái cảm biến và relay |
| POST | `/smarthome/api/cmd` | Chuyển lệnh FAN/LIGHT từ backend |
| GET | `/smartclass/api/control/status` | Khả năng điều khiển/ACK |

```powershell
Invoke-RestMethod 'http://localhost:1880/smartclass/api/state' | ConvertTo-Json -Depth 5
```

State chứa đúng ID, `temp`, `humid`, `lux`, `occupancy`, `ldr_adc`, trạng thái `FAN`/`LIGHT`, `connected`, `timestamp` và metadata chất lượng ánh sáng. Flow bỏ bản tin retained; sau khoảng 10 giây không nhận MQTT mới, chuyển mất kết nối và trả dữ liệu chính null. Node-RED ghi `telemetry` vào MySQL để backend đọc lịch sử.

Điều khiển có hai mức xác nhận: firmware cũ có thể chỉ trả `ACCEPTED` (đã tiếp nhận, chưa chứng minh thực thi); firmware ACK mới đối chiếu ID/target/action trước khi trả `SUCCESS`. Không tự gửi lại lệnh sau timeout. SUCCESS xác nhận firmware cập nhật GPIO, chưa có cảm biến dòng điện để khẳng định quạt thực sự quay hoặc đèn thực sự sáng. Đường dẫn lệnh không nhận truy cập trực tiếp từ frontend.

Nếu sửa `SmartClass_Backend_Control.cjs`, phải cập nhật mã Function tương ứng trong JSON; kiểm thử kiểm tra hai bản khớp nhau. Không thêm bộ luật điều khiển độc lập trong Node-RED làm cạnh tranh với backend.

## Chức năng và quyền

| Trang | Đường dẫn | Phạm vi |
|---|---|---|
| Tổng quan | `/dashboard` | Tổng quan Nhà A |
| Phòng học | `/building`, `/classroom?roomId=101` | Danh mục, đặt/duyệt lịch, sự cố, báo cáo |
| Thiết bị | `/iot`, `/iot/rooms/101` | Số đo và điều khiển theo quyền |
| Lịch sử | `/history` | Telemetry và kết quả lệnh |
| Lịch của tôi | `/my-schedule` | TEACHER, lịch cá nhân |
| Thông báo | `/notifications` | Thông báo của chính tài khoản |
| Tài khoản | `/profile` | Hồ sơ và đổi mật khẩu |
| Cảnh báo bất thường | `/abnormal-alerts` | ADMIN/TEACHER |
| Gợi ý AI | `/ai` | ADMIN/TEACHER |
| Chế độ tự động | `/automation` | ADMIN/TEACHER; cấu hình theo quyền điều khiển |
| Báo cáo sự cố | `/incidents` | Theo phạm vi tài khoản/vai trò |
| Quản trị | `/admin` | ADMIN, quản lý người dùng và thiết bị |

Giáo viên chỉ điều khiển phòng khi có lịch được duyệt đang diễn ra tại đúng phòng. Admin quản lý theo trạng thái hoạt động của phòng. Xem trang hoặc cảnh báo không tự cấp quyền bật/tắt thiết bị. Backend kiểm tra lại quyền khi thao tác, không chỉ dựa vào menu frontend.

### Tự động hóa và cảnh báo

Cấu hình `room_automation` dùng ngưỡng quạt bật/tắt, đèn bật/tắt và thời gian chờ không chuyển động. Mặc định quạt 30/28 °C, đèn 150/250 lux; giữa hai ngưỡng giữ trạng thái. Tự động hóa cần dữ liệu mới, quyền hợp lệ và kết quả lệnh được xác nhận. Khi mất dữ liệu hoặc kết quả lệnh không rõ, hệ thống dừng tự động thay vì gửi lặp. PIR không đếm người; không phát hiện chuyển động không khẳng định phòng trống.

Trang cảnh báo bổ sung bốn trường hợp: nóng nhưng quạt tắt; nhiệt độ thấp nhưng quạt bật; thiếu sáng nhưng đèn tắt; đủ sáng nhưng đèn bật. Dùng lại ngưỡng đã lưu, cập nhật mỗi 10 giây khi mở trang. Dữ liệu cần mới trong 60 giây, thời điểm cảm biến/relay không lệch quá 30 giây; thiếu dữ liệu trả “Chưa đủ dữ liệu”, không coi là đã bình thường. Trang cảnh báo không tự phát lệnh. Các cảnh báo môi trường và lịch sử cũ trong nghiệp vụ phòng vẫn được giữ riêng.

### Hai model AI

**Model 1 — Isolation Forest:** đầu vào nhiệt độ, độ ẩm, sáng/tối và chuyển động; kết quả `NORMAL`/`ANOMALY`. Python đổi ADC thành boolean theo ngưỡng lựa chọn, mặc định thử 4000 với chiều ADC thấp là sáng. Cần đối chiếu ngưỡng thực tế; ý nghĩa boolean ánh sáng của tập huấn luyện chưa được xác minh hoàn toàn.

Khi cảnh báo, Python thử thay riêng từng đặc trưng bằng giá trị tham chiếu từ các hàng CSV được artifact xem là bình thường. Chỉ hiển thị tối đa hai yếu tố làm điểm quyết định cải thiện; chỉ nói model hết cảnh báo nếu phép thử thật trả `NORMAL`. Đây là giải thích phản ứng cục bộ của model, không phải nguyên nhân sự cố, xác suất hoặc ngưỡng điều khiển. Bản ghi cũ có thể chưa có giải thích.

**Model 2 — Random Forest:** dùng trung bình nhiệt độ/ánh sáng theo cùng thời điểm, max các PIR và giờ địa phương. Công thức gốc dùng 4 nhiệt độ, 4 ánh sáng và 2 PIR; cấu hình hiện tại 1/1/1 nên trung bình bằng chính số đo đó, không nhân bản cảm biến giả. Đầu vào mới được lấy từ Node-RED mỗi lần bấm, không luân phiên kịch bản hoặc chọn nhãn trước.

Nhãn gốc là 0 người → `EMPTY`, 1 người → `LOW`, từ 2 người → `CROWDED`; giao diện hiển thị Trống / Ít người / Đông người. Đây là ước tính, không phải đếm sĩ số. Nhiệt độ ngoài 24,89–26,80 hoặc ánh sáng trên 193,75 thuộc ngoài phạm vi CSV đã kiểm tra, phải hiển thị cảnh báo. Không cắt/ép đầu vào về phạm vi để làm đẹp kết quả.

**Giới hạn ánh sáng:** trường lux hiện có thể là giá trị giả định quy đổi từ LDR, không phải phép đo đã hiệu chuẩn. Metadata gồm `lux_demo`, `lux_estimated`, `lux_quality`. Một số giá trị quy đổi đã được lưu trong telemetry; không coi tất cả lịch sử là phép đo chuẩn. Model 2 và cảnh báo đèn dùng giá trị này nên cần đối chiếu thực tế. Tham khảo bộ dữ liệu gốc [Room Occupancy Estimation](https://www.archive.ics.uci.edu/dataset/864/room%2Boccupancy%2Bestimation).

Công cụ huấn luyện ADC và API quan sát đã có trong mã nguồn nhưng không dùng trên giao diện hiện tại, chưa có model ADC thật được kích hoạt. API demo cũ cũng không được trang AI gọi. Chưa triển khai cập nhật firmware OTA.

## API chính

Các API nghiệp vụ yêu cầu JWT và trả wrapper `success`, `message`, `data`; quyền cụ thể được kiểm tra theo vai trò/phòng/tài khoản.

| Nhóm | Đường dẫn chính |
|---|---|
| Xác thực | POST `/api/auth/login`, GET `/api/auth/me` |
| IoT theo phòng | `/api/iot/rooms/{roomId}`, `/state`, `/telemetry`, `/control` |
| Lịch sử | GET `/api/telemetry`, `/api/commands` |
| Nghiệp vụ phòng | `/api/classroom/bookings`, `/alerts`, `/incidents`, `/settings`, `/permission` |
| Cảnh báo thiết bị | GET `/api/rooms/101/abnormal-alerts` |
| Tự động | GET/PUT `/api/automation` |
| AI | GET `/api/ai/rooms/101/status`, `/history`; POST `/analyze`, `/occupancy-live` trong cùng prefix |
| Hồ sơ | GET/PUT `/api/account/profile`, POST `/api/account/password` |
| Quản trị | `/api/users`, `/api/devices` |

Python có `/health`, `/predict/anomaly/adc`, `/predict/occupancy/live` và các endpoint thử nghiệm/huấn luyện được giữ để tương thích. Chỉ gọi Python từ backend trong luồng ứng dụng.

## Build và kiểm thử

```powershell
# Backend: kiểm thử không cần MySQL riêng; các bài tích hợp có điều kiện có thể được bỏ qua.
cd backend
.\mvnw.cmd test
.\mvnw.cmd -DskipTests package

# Frontend
cd ..\frontend
npm run build
$env:SMARTCLASS_BROWSER_CHANNEL = 'msedge'
$env:SMARTCLASS_E2E_PORT = '5180'
npx playwright test

# Python
cd ..\AI-Service
.venv\Scripts\python -m unittest -v test_app test_training test_anomaly_explanation
.venv\Scripts\python verify_models.py

# Kiểm thử hàm IoT, chạy từ gốc dự án
node --test IOT/SmartClass_Backend_Control.test.cjs IOT/LdrLuxEstimate.test.cjs
```

Playwright cần trình duyệt tương ứng đã cài; biến `SMARTCLASS_BROWSER_CHANNEL=msedge` dùng Edge trên Windows. Mặc định bài kiểm thử giao diện dùng API fixture, không phải chứng minh thiết bị thật đang kết nối.

Kiểm thử MySQL dùng database riêng có tiền tố `smartclass_verify_`, cùng `DB_USERNAME`, `DB_PASSWORD`. Đặt `SMARTCLASS_MYSQL_TEST_URL` hoặc chạy `backend/scripts/test-mysql.ps1` từ gốc. Không trỏ bài kiểm thử vào database ứng dụng. Một số bài thêm hậu tố vào tên database nên cần giữ tên cơ sở ngắn hơn giới hạn 64 ký tự của MySQL.

`verify_models.py` nạp artifact thật, đối chiếu 256 mẫu/model với CSV và kiểm tra nhãn/điểm của các giải thích. Kết quả khớp artifact không chứng minh độ chính xác trên phòng thực tế. Kiểm thử Python dùng dữ liệu tổng hợp không được dùng để kích hoạt model phòng thật.

## Xử lý lỗi thường gặp

- **8080 không phản hồi:** xem log backend, MySQL, khóa JWT và cổng đang bận. `/api/auth/me` không có token trả 401 là hành vi bình thường.
- **Đăng nhập được nhưng không có số đo:** kiểm tra Node-RED/MQTT/ESP, ID thiết bị và đường dẫn State. Frontend không tự tạo số liệu để thay thế.
- **Node-RED trả 404:** đối chiếu `/smartclass/api/state` và `/smarthome/api/cmd`, không dùng lẫn đường dẫn của flow cũ.
- **Không điều khiển được:** kiểm tra quyền theo ca/phòng, trạng thái thiết bị, chế độ tự động và mức hỗ trợ ACK. Không gửi lại liên tục khi kết quả chưa rõ.
- **AI chưa sẵn sàng:** kiểm tra Python, `.venv`, scikit-learn 1.6.1, artifact và `AI_BASE_URL`.
- **Model 2 báo đông dù PIR không chuyển động:** model dùng đồng thời nhiệt độ, ánh sáng, PIR và giờ; PIR không phủ quyết kết quả. Xem số đo, cờ ngoài phạm vi và cảnh báo ánh sáng quy đổi.
- **Cảnh báo thiếu dữ liệu:** kiểm tra thời gian mẫu/kết nối cả cảm biến lẫn relay; không đồng nghĩa điều kiện đã bình thường.

Tài liệu đã được gộp vào README này; log, ảnh QA và báo cáo tạm không phải tài liệu vận hành cần lưu trong mã nguồn.
