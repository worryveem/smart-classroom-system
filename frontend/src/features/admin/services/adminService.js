import { usersService } from './usersService.js'
import { devicesService } from './devicesService.js'

export { roles, types, statuses, statusLabels } from './adminContracts.js'
export const services = { users: usersService, devices: devicesService }
export async function fetchAdminList(scope, params, signal) { return services[scope].list(params, signal) }

export function adminError(error, scope, operation) {
  const status = error.response?.status
  const message = error.response?.data?.message
  const known = {
    'Username already exists': 'Tên đăng nhập đã tồn tại. Vui lòng chọn tên khác.',
    'Device already exists': 'Device ID đã tồn tại. Vui lòng chọn mã khác.',
    'Cannot delete the current account': 'Không thể xóa tài khoản đang đăng nhập.',
    'Cannot delete the last ADMIN': 'Không thể xóa ADMIN cuối cùng của hệ thống.',
    'Cannot demote the last ADMIN': 'Không thể hạ quyền ADMIN cuối cùng của hệ thống.',
    'Concurrent update; refresh and try again': 'Dữ liệu đang được cập nhật đồng thời. Hãy tải lại trước khi thử lại.',
  }
  if (status === 409 && known[message]) return known[message]
  if (error.code === 'INVALID_ADMIN_RESPONSE') return 'Dữ liệu trả về chưa đúng hợp đồng. Vui lòng tải lại.'
  if (!status) return operation === 'list' || operation === 'detail'
    ? 'Không kết nối được Backend hoặc yêu cầu hết thời gian chờ. Vui lòng thử lại.'
    : 'Chưa xác định thao tác đã được lưu hay chưa do mất phản hồi. Hãy đóng và làm mới danh sách trước khi thử lại.'
  switch (status) {
    case 400: return 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại các trường trong biểu mẫu.'
    case 401: return 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.'
    case 403: return 'Bạn không có quyền thực hiện thao tác này. Quyền quản trị có thể đã thay đổi.'
    case 404: return 'Bản ghi không còn tồn tại. Hãy đóng và làm mới danh sách.'
    case 409: return scope === 'devices' && operation === 'delete'
      ? 'Không thể xóa thiết bị do ràng buộc dữ liệu, có thể đang có lịch sử cảm biến hoặc điều khiển tham chiếu. Lịch sử được giữ nguyên.'
      : 'Dữ liệu bị trùng hoặc vi phạm quy tắc bảo vệ. Vui lòng tải lại và kiểm tra.'
    default: return operation === 'list' || operation === 'detail' ? 'Chưa tải được dữ liệu từ Backend. Vui lòng thử lại.' : 'Backend chưa xác nhận thao tác. Hãy kiểm tra lại danh sách trước khi gửi lại.'
  }
}

