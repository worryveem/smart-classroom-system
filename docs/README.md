# Tài liệu nộp bài SmartClass IoT

SmartClass IoT kết hợp quản lý phòng học, giám sát môi trường, điều khiển quạt/đèn bằng ESP32 và phân tích AI. Phạm vi tích hợp IoT hiện tại là phòng **101** thuộc Nhà A.

## Tài liệu chính

| Tài liệu | Nội dung |
|---|---|
| [Báo cáo hệ thống](BAO_CAO_HE_THONG.md) | Mục tiêu, kiến trúc, phần cứng, chức năng, dữ liệu, AI và giới hạn |
| [Hướng dẫn chạy và trình diễn](HUONG_DAN_DEMO.md) | Chuẩn bị, trình tự khởi động, kịch bản demo và ghi nhận kiểm thử |
| [Tóm tắt hai node ESP32](Tom_tat_he_thong_2_node_ESP32_va_Dashboard.docx) | Tài liệu Word tham khảo phần cứng và dashboard Node-RED độc lập |

**Phạm vi tài liệu Word:** bản này được giữ nguyên để tham khảo thiết kế hai node và AUTO cục bộ. Địa chỉ IP, đường dẫn dashboard và ngưỡng trong đó thuộc cấu hình cũ. Khi trình bày hệ thống web hiện tại, dùng báo cáo chính và hướng dẫn demo ở trên.

## Tài liệu kỹ thuật

- [README gốc](../README.md): giới thiệu, kiến trúc, cài đặt và API.
- [Phần cứng](../hardware/README.md): linh kiện và tín hiệu nối dây.
- [Firmware](../firmware/README.md): thư viện, cấu hình và nạp chương trình ESP32.
- [Triển khai](../deployment/README.md): cấu hình dịch vụ và flow.
- [Database](../database/README.md): migration, dữ liệu mẫu.
- [Kiểm thử](../tests/README.md): lệnh và kịch bản.

## Hoàn thiện trước khi nộp

1. Bổ sung thông tin sinh viên/nhóm, mã số sinh viên, lớp, học phần và giảng viên theo mẫu của môn học nếu được yêu cầu.
2. Bổ sung ảnh mạch và ảnh giao diện thực tế, kèm điều kiện chạy và thời điểm chụp.
3. Ghi kết quả kiểm thử thực tế theo hướng dẫn demo; phân biệt kiểm thử phần mềm với thử nghiệm có thiết bị thật.
4. Nộp `docs` cùng mã nguồn để các liên kết tương đối hoạt động. Nếu môn học yêu cầu Word/PDF, chuyển báo cáo chính sang định dạng đó và kiểm tra bố cục trước khi nộp.

Không đưa cấu hình cá nhân, mật khẩu Wi-Fi, khóa JWT hoặc dữ liệu tài khoản thực vào gói nộp. Dùng `.env.example` làm mẫu.
