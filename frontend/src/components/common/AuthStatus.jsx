import { LoaderCircle, ShieldCheck } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'

export default function AuthStatus() {
  const { status, retry, logout } = useAuth()
  return (
    <main className="auth-status-shell">
      <section className="auth-status-card">
        {status === 'error' ? <>
          <ShieldCheck size={36} aria-hidden="true" />
          <h1>Chưa thể xác minh phiên đăng nhập</h1>
          <p role="alert">Không thể kiểm tra tài khoản lúc này. Hãy kiểm tra kết nối và thử lại.</p>
          <button className="primary-button" onClick={retry}>Thử lại</button>
          <button className="text-button" onClick={logout}>Quay lại đăng nhập</button>
        </> : <div role="status" aria-live="polite">
          <LoaderCircle className="spin status-spinner" size={32} aria-hidden="true" />
          <p>Đang xác thực phiên đăng nhập…</p>
        </div>}
      </section>
    </main>
  )
}
