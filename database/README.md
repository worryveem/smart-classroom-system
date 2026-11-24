# Database

MySQL 8, quản lý schema bằng Flyway. `migrations/` là nguồn chính; Maven đóng gói vào `classpath:db/migration` khi build backend. Chạy backend theo README gốc để áp dụng migration.

Không sửa migration đã áp dụng. Thêm phiên bản tiếp theo (hiện tại là V11) cho thay đổi mới. Dữ liệu mẫu nằm trong `backend/src/main/java/iot/iot/config/DataSeeder.java`, bật bằng profile local. Cấu hình kết nối theo `.env.example` gốc; Spring Boot không tự đọc `.env`.
