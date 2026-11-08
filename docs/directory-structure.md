# Cấu trúc thư mục

```text
smartclass/
├── .agents/
│   └── skill/frontend-design/
│       ├── SKILL.md
│       └── LICENSE.txt
├── backend/
│   ├── pom.xml
│   ├── mvnw, mvnw.cmd, .mvn/wrapper/
│   ├── HELP.md
│   └── src/
│       ├── main/
│       │   ├── java/iot/iot/
│       │   │   ├── IotApplication.java
│       │   │   ├── config/, controller/, service/
│       │   │   ├── repository/, entity/
│       │   │   ├── dto/request/, dto/response/
│       │   │   ├── security/, integration/nodered/
│       │   │   └── exception/, common/
│       │   └── resources/
│       │       ├── application.properties
│       │       ├── application.yml
│       │       └── application-local.yml.example
│       └── test/java/iot/iot/IotApplicationTests.java
├── frontend/
│   ├── package.json, package-lock.json
│   ├── index.html, vite.config.js, .env.example
│   └── src/
│       ├── main.jsx, App.jsx
│       ├── app/router.jsx
│       ├── assets/fonts/
│       ├── components/common/, layout/, ui/
│       ├── features/auth/pages/LoginPage.jsx
│       ├── features/dashboard/pages/DashboardPage.jsx
│       ├── features/history/pages/HistoryPage.jsx
│       ├── features/admin/pages/AdminPage.jsx
│       ├── services/api/client.js
│       ├── hooks/, context/, utils/
│       └── styles/index.css
├── docs/
│   ├── architecture.md
│   ├── directory-structure.md
│   ├── frontend-design.md
│   └── api-contract.md
└── README.md
```

## Skill hỗ trợ thiết kế giao diện

`.agents/skill/frontend-design/` chứa skill `frontend-design` từ [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design), được giới thiệu trên [skills.sh](https://www.skills.sh/anthropics/skills/frontend-design). `SKILL.md` được chuyển sang tiếng Việt theo quy ước dự án; `LICENSE.txt` giữ nguyên từ nguồn. Skill hướng dẫn lựa chọn định hướng thị giác, kiểu chữ, màu sắc, bố cục và nội dung khi xây dựng hoặc chỉnh sửa giao diện. Đường dẫn `.agents/skill` được dùng theo yêu cầu cài đặt của dự án.

## Backend

Backend gốc được chuyển vào `backend/`, không tạo Backend thứ hai. Giữ `IotApplication` thay vì tạo thêm `SmartClassApplication`. `application.properties` được giữ dưới dạng chú thích; cấu hình chính dùng YAML để tránh giá trị trùng lặp.

| Thư mục | Trách nhiệm dự kiến |
|---|---|
| config | Cấu hình Spring và bean dùng chung |
| controller | REST endpoints của BFF |
| service | Xử lý nghiệp vụ |
| repository | Truy cập dữ liệu qua JPA |
| entity | Mô hình lưu trữ dữ liệu |
| dto/request | Dữ liệu đầu vào và validation |
| dto/response | Dữ liệu trả về Frontend |
| security | Bảo mật, xác thực và phân quyền ở giai đoạn sau |
| integration/nodered | HTTP client tới API nội bộ Node-RED |
| exception | Ngoại lệ và xử lý lỗi tập trung |
| common | Thành phần dùng chung |
| resources | Cấu hình ứng dụng và mẫu local |
| test/java | Kiểm thử Backend; giữ test context gốc |

Sau Prompt 2, entity và repository đã có triển khai. Prompt 3 bổ sung Authentication trong controller/service/security; integration/nodered vẫn dự phòng.

Bổ sung Database Layer:

- `entity/`: User, Device, Telemetry, CommandLog; UserRole, DeviceType, DeviceStatus, DeviceStatusConverter.
- `repository/`: UserRepository, DeviceRepository, TelemetryRepository, CommandLogRepository.
- `config/`: PasswordHashingConfig, SeedProperties, DataSeeder.
- `resources/db/migration/V1__create_initial_schema.sql`: schema chính thức qua Flyway.
- `resources/application-local.yml`: cấu hình public chỉ cho development.
- `backend/.env.example`: mẫu biến môi trường, không được Spring tự nạp.
- `backend/scripts/test-mysql.ps1`: kiểm thử trên MySQL database tách biệt.
- `test/java/iot/iot/`: context, converter/seeder unit tests và DataLayerIntegrationTests.
- `docs/database.md`, `docs/database-verification.md`: cấu hình/contract dữ liệu và kết quả kiểm thử.

## Frontend

`docs/frontend-design.md` mô tả định hướng giao diện, hệ màu, bố cục thích ứng và phạm vi xác minh khi thiết kế lại Frontend theo skill `frontend-design`. CSS dùng chung nằm trong `styles/index.css`; các trang Dashboard, History, Admin và các thành phần Modal/Pagination tiếp tục dùng file CSS tương ứng.

| Thư mục/file | Trách nhiệm |
|---|---|
| main.jsx | Gắn React vào DOM, nạp CSS |
| App.jsx | Gắn AuthProvider và RouterProvider |
| app/router.jsx | Khai báo routes; chuyển `/` và URL không khớp về `/dashboard` |
| assets | Tài nguyên tĩnh; `fonts/` chứa Be Vietnam Pro và giấy phép OFL, được phục vụ từ ứng dụng |
| components/common | PlaceholderPage, guard đăng nhập/role và trạng thái xác thực |
| components/layout | Bố cục, danh tính, menu theo role và Logout |
| components/ui | Thành phần UI cơ bản cho giai đoạn sau |
| features/auth | Login, gọi API Authentication và quản lý token theo tab |
| features/dashboard | Dashboard cảm biến, biểu đồ, polling và điều khiển FAN/LIGHT |
| features/history | Bảng lịch sử Telemetry/Commands, bộ lọc và phân trang Backend |
| features/admin | CRUD Users/Devices, form modal, bảng và phân trang dành ADMIN |
| services/api | Axios client tới Spring Boot, gắn JWT và xử lý 401 |
| hooks | Custom React hooks |
| context | AuthContext quản lý trạng thái đăng nhập tập trung |
| utils | Hàm tiện ích |
| styles | CSS chung; Tailwind v4 dùng `@import "tailwindcss"` |

Thư mục trống dùng `.gitkeep` để giữ cấu trúc. `node_modules`, `dist`, `target` là sản phẩm cài đặt/build. `target/` cũ tại gốc được giữ nguyên; build mới nằm trong `backend/target/`.

## Bổ sung Prompt 3

- `security/config/`: SecurityConfig, CorsConfig.
- `security/jwt/`: JwtProperties, JwtService, JwtAuthenticationFilter, JwtAuthenticationEntryPoint.
- `security/user/`: CustomUserDetails, CustomUserDetailsService.
- `security/SecurityResponseWriter.java`: response lỗi từ filter/security.
- `controller/AuthController.java`, `service/AuthService.java`: login và user hiện tại.
- `dto/request/LoginRequest.java`, `dto/response/LoginResponse.java`, `UserResponse.java`.
- `common/ApiResponse.java`, `exception/GlobalExceptionHandler.java`: response/lỗi thống nhất.
- `test/java/iot/iot/AuthSecurityTests.java`, `security/jwt/JwtServiceTests.java`: kiểm thử bảo mật.
- `scripts/test-auth-http.py`: smoke test HTTP không sửa database.
- `docs/authentication.md`, `authentication-verification.md`: hướng dẫn và kết quả kiểm thử.

Security/Controller/Service hiện có phần Authentication; các API nghiệp vụ vẫn chưa triển khai.

## Bổ sung Prompt 4

`integration/nodered/` có properties, HTTP configuration/client và wire DTO. `controller/` và `service/` bổ sung State/Control cùng CommandAuditService; DTO Control và IntegrationException chuẩn hóa kết quả/lỗi. `docs/nodered-integration.md` mô tả cấu hình/ACK và giới hạn xác minh. Không thay Entity hoặc migration.

## Bổ sung Prompt 5

- `controller/TelemetryController.java`, `CommandHistoryController.java`: hai API GET lịch sử, chuyển query parameters tới service.
- `service/TelemetryService.java`, `CommandHistoryService.java`, `HistoryQueryValidation.java`: truy vấn chỉ đọc, validation và giới hạn kết quả.
- `repository/HistorySpecifications.java`: xây dựng điều kiện lọc động; hai repository hiện có bổ sung `JpaSpecificationExecutor`.
- `dto/response/TelemetryResponse.java`, `CommandHistoryResponse.java`, `HistoryPageResponse.java`: dữ liệu lịch sử và thông tin phân trang, không trả Entity.
- `exception/InvalidHistoryQueryException.java`: lỗi tham số truy vấn trả HTTP 400.
- `test/java/iot/iot/HistoryApiIntegrationTests.java`: JWT, truy vấn lịch sử và dữ liệu SQL trên MySQL tách biệt.

Luồng xử lý: Controller → Service → Repository → MySQL. Không thay đổi Entity, migration hoặc Frontend.

## Bổ sung Prompt 6

- `controller/AdminUserController.java`, `AdminDeviceController.java`: CRUD và tham số HTTP.
- `service/AdminUserService.java`, `AdminDeviceService.java`, `AdminPagination.java`: nghiệp vụ quản trị, transaction và giới hạn phân trang.
- `repository/UserRepository.java`, `DeviceRepository.java`: bổ sung Specification; UserRepository có truy vấn khóa ADMIN. `DeviceInsertRepository.java` thực hiện INSERT thiết bị, tránh merge ghi đè khi trùng ID đồng thời.
- `dto/request/`: CreateUserRequest, UpdateUserRequest, CreateDeviceRequest, UpdateDeviceRequest, DeviceStatusInput.
- `dto/response/`: AdminUserResponse, DeviceResponse; dùng lại HistoryPageResponse.
- `exception/AdminOperationException.java`, `config/JsonValidationConfig.java`: lỗi nghiệp vụ và validation enum.
- `test/java/iot/iot/AdminApiIntegrationTests.java`: kiểm thử CRUD/ADMIN/MySQL tách biệt.
- `docs/admin-api.md`: hợp đồng API quản trị và quy tắc bảo vệ dữ liệu.

SecurityConfig giới hạn Devices cho ADMIN; JWT đối chiếu thêm ID tài khoản. Giữ Entity, Flyway schema, CORS và Frontend hiện có.

## Bổ sung Frontend Login và Authentication

- `frontend/src/context/AuthContext.jsx`: quản lý đăng nhập, kiểm tra phiên, user/role, retry và logout.
- `frontend/src/features/auth/authSession.js`, `authApi.js`, `returnPath.js`: lưu token theo tab, gọi API Authentication và kiểm tra đích điều hướng nội bộ.
- `frontend/src/features/auth/pages/LoginPage.jsx`: form Login responsive, validation và trạng thái lỗi/loading.
- `frontend/src/components/common/ProtectedRoute.jsx`, `AuthStatus.jsx`: guard đăng nhập, guard role và trạng thái kiểm tra phiên.
- `frontend/src/services/api/client.js`: tự gắn JWT, xử lý 401 và giới hạn origin request.
- `frontend/src/components/layout/AppLayout.jsx`: danh tính đăng nhập, menu theo role và nút Logout.
- `frontend/src/app/router.jsx`: Login nằm ngoài layout đã xác thực; Dashboard/History được bảo vệ; Admin chỉ dành ADMIN.
- `frontend/playwright.config.js`, `frontend/tests/auth.spec.js`: kiểm thử trình duyệt và tích hợp Backend tùy chọn.
- `docs/frontend-authentication.md`: cách chạy, luồng xác thực và giới hạn phiên.

Dashboard/History/Admin giữ nội dung placeholder; chưa triển khai CRUD Frontend hoặc dữ liệu IoT thực.

## Bổ sung Prompt 8 — Dashboard

- `frontend/src/features/dashboard/pages/DashboardPage.jsx`: ghép tổng quan cảm biến, lịch sử và điều khiển.
- `components/SensorCard.jsx`, `DeviceStatus.jsx`, `DeviceControl.jsx`, `TelemetryChart.jsx`: thẻ cảm biến, trạng thái/kết nối, lệnh điều khiển và biểu đồ Recharts.
- `hooks/usePollingResource.js`, `useDeviceState.js`, `useTelemetry.js`, `useControl.js`: đọc tuần tự, hủy request và xử lý lệnh không retry.
- `services/dashboardService.js`, `stateAdapter.js`: gọi BFF, ánh xạ State, thời gian/telemetry và ACK.
- `dashboard.css`: bố cục responsive và trạng thái giao diện.
- `frontend/tests/dashboard.spec.js`: kiểm thử Dashboard bằng HTTP mock và test Spring Boot chỉ đọc tùy chọn.
- `frontend/src/app/router.jsx`: tải Dashboard theo nhu cầu để tách Recharts khỏi bundle Login.
- `docs/dashboard.md`: hợp đồng ánh xạ, cấu hình, polling và giới hạn xác minh.

Dashboard đã gọi API thực; History/Admin vẫn là placeholder. Không có mock runtime. AuthContext, JWT interceptor và Backend được kế thừa.

## Bổ sung trang History

- `frontend/src/features/history/pages/HistoryPage.jsx`: hai tab, bộ lọc riêng, nút làm mới và ghép bảng/kết quả.
- `components/TelemetryTable.jsx`, `CommandTable.jsx`: bảng DTO và Badge; `HistoryTableState.jsx` dùng chung Loading/Empty/Error.
- `components/HistoryFilters.jsx`, `HistoryPagination.jsx`: bộ lọc có validation và phân trang do Backend cung cấp.
- `hooks/useHistoryQuery.js`: debounce 400 ms, hủy request cũ, cache một kết quả theo từng tab và làm mới thủ công.
- `services/historyService.js`: query parameters, kiểm tra wrapper/DTO/phân trang và thông báo lỗi.
- `history.css`: giao diện đồng bộ Dashboard và bảng cuộn trên mobile.
- `frontend/src/utils/dateTime.js`: định dạng thời gian UTC+07 dùng chung; Dashboard giữ các export cũ để tương thích.
- `frontend/tests/history.spec.js`: kiểm thử UI, lỗi/race và đọc MySQL qua Backend thật tùy chọn.
- `docs/history.md`: hợp đồng và cách hoạt động trang History.

History đã có triển khai, Admin vẫn là placeholder. Không tạo lại API client, Authentication hoặc Layout.

## Bổ sung Prompt 10 — Frontend Admin

- `frontend/src/features/admin/pages/AdminPage.jsx`: tab Users/Devices, bộ lọc và đồng bộ danh sách sau CRUD.
- `components/ManagementTable.jsx`: hai cấu trúc bảng, Badge và thao tác theo loại bản ghi.
- `components/UserForm.jsx`, `DeviceForm.jsx`, `AdminFormFields.jsx`: form/validation dùng chung trường và nút.
- `components/AdminFormModal.jsx`, `DeleteConfirmModal.jsx`: đọc chi tiết trước sửa và xác nhận xóa.
- `hooks/useAdminMutation.js`: chống gửi trùng, trạng thái gửi/lỗi và chặn cập nhật khi đã unmount.
- `services/usersService.js`, `devicesService.js`: hai nhóm API riêng; `adminContracts.js` kiểm tra/giới hạn DTO, `adminService.js` xử lý lỗi và điều phối danh sách.
- `frontend/src/hooks/useQueryResource.js`: hook truy vấn dùng chung, History gọi lại qua wrapper cũ.
- `frontend/src/components/common/Pagination.jsx`, `Modal.jsx`: phân trang và dialog dùng lại; HistoryPagination giữ wrapper/nhãn cũ.
- `frontend/tests/admin.spec.js`: HTTP mock và CRUD thật tùy chọn trên database kiểm thử tách biệt.
- `docs/frontend-admin.md`: hợp đồng giao diện, validation và cách kiểm thử an toàn với dữ liệu test.

Trang Admin đã triển khai đầy đủ trong phạm vi Users/Devices; các tầng Backend/Database/Node-RED/ESP32 giữ nguyên.

## Kiểm thử tích hợp hệ thống

`docs/system-verification.md` ghi kết quả kiểm thử Prompt 11, lỗi ánh xạ State đã sửa và các phần chưa thể xác minh với Node-RED/MQTT/ESP32 thật. Cấu trúc mã nguồn và schema không thay đổi trong đợt kiểm tra này.
