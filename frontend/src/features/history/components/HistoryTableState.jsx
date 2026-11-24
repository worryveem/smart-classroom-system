import { History, LoaderCircle } from 'lucide-react'

export default function HistoryTableState({ loading, invalid, error, colSpan }) {
  return <tr><td colSpan={colSpan}><div className="history-table-state" role={loading ? 'status' : undefined}>
    {loading ? <LoaderCircle size={27} className="spin" /> : <History size={30} strokeWidth={1.3} />}
    <h3>{loading ? 'Đang tải lịch sử…' : invalid ? 'Vui lòng kiểm tra bộ lọc' : error ? 'Chưa tải được dữ liệu' : 'Không có dữ liệu phù hợp'}</h3>
    <p>{loading ? 'Đang truy vấn dữ liệu từ hệ thống.' : invalid ? 'Sửa các trường được đánh dấu để tiếp tục tra cứu.' : error ? 'Bạn có thể dùng nút làm mới để thử lại.' : 'Thử thay đổi thiết bị hoặc mở rộng khoảng thời gian.'}</p>
  </div></td></tr>
}
