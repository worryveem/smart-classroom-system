import { useRef, useState } from 'react'
import axios from 'axios'
import { Activity, ArrowRight, Eye, EyeOff, Lightbulb, LockKeyhole, School, ShieldCheck, UserRound, Wifi } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext.jsx'

function loginError(error) {
  const status = error.response?.status
  if (status === 401) return 'Tên đăng nhập hoặc mật khẩu không đúng.'
  if (status === 400) return 'Thông tin đăng nhập không hợp lệ. Vui lòng kiểm tra lại.'
  if (status === 429) return 'Bạn đã thử quá nhiều lần. Vui lòng đợi một lát rồi thử lại.'
  if (!error.response) return 'Không thể kết nối đến hệ thống. Vui lòng kiểm tra kết nối và thử lại.'
  return 'Hệ thống chưa thể đăng nhập lúc này. Vui lòng thử lại sau.'
}

export default function LoginPage() {
  const { login, reason } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const usernameInput = useRef(null)
  const passwordInput = useRef(null)
  const inFlight = useRef(false)

  async function submit(event) {
    event.preventDefault()
    if (inFlight.current) return
    const next = {}
    const name = username.trim()
    if (!name) next.username = 'Vui lòng nhập tên đăng nhập.'
    else if (name.length > 50) next.username = 'Tên đăng nhập không được vượt quá 50 ký tự.'
    if (!password.trim()) next.password = 'Vui lòng nhập mật khẩu.'
    else if (new TextEncoder().encode(password).length > 72) next.password = 'Mật khẩu không được vượt quá 72 byte UTF-8.'
    setErrors(next)
    setError('')
    if (Object.keys(next).length) {
      const field = next.username ? usernameInput : passwordInput
      field.current?.focus()
      return
    }
    inFlight.current = true
    setSubmitting(true)
    try { await login(name, password) }
    catch (failure) { if (!axios.isCancel(failure)) setError(loginError(failure)) }
    finally { inFlight.current = false; setSubmitting(false) }
  }

  return (
    <div className="login-shell">
      <aside className="login-story" aria-label="Giới thiệu SmartClass">
        <a className="brand story-brand" href="/login"><span className="brand-mark"><School size={23} /></span>SmartClass<span className="iot-tag">IoT</span></a>
        <div className="story-copy">
          <p className="story-kicker"><span /> Không gian học tập kết nối</p>
          <h1>Lớp học thông minh.<br /><span>Khởi đầu từ kết nối.</span></h1>
          <p>Một không gian quản lý tập trung cho lớp học, thiết bị và dữ liệu của bạn.</p>
        </div>
        <div className="classroom-visual" aria-hidden="true">
          <div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" />
          <div className="room-board"><School size={38} strokeWidth={1.3} /><span>SMART CLASSROOM</span><div className="board-line" /><div className="board-line short" /></div>
          <div className="room-desk desk-one" /><div className="room-desk desk-two" /><div className="room-desk desk-three" />
          <div className="sensor-node node-one"><Activity size={22} /><span>Cảm biến</span></div>
          <div className="sensor-node node-two"><Lightbulb size={22} /><span>Thiết bị</span></div>
          <div className="sensor-node node-three"><Wifi size={22} /><span>Kết nối</span></div>
        </div>
        <div className="story-footer"><ShieldCheck size={18} /><span>Quản lý tập trung. Truy cập theo vai trò.</span></div>
      </aside>
      <main className="login-main">
        <div className="login-topline"><span>Cổng truy cập hệ thống</span><span className="version-badge">SmartClass IoT</span></div>
        <section className="login-card" aria-labelledby="login-title">
          <span className="welcome-icon"><LockKeyhole size={26} strokeWidth={1.7} /></span>
          <p className="eyebrow">Chào mừng trở lại</p>
          <h2 id="login-title">Đăng nhập SmartClass</h2>
          <p className="login-description">Sử dụng tài khoản được cấp để truy cập không gian lớp học của bạn.</p>
          {reason === 'expired' && <p className="notice" role="status">Phiên đăng nhập đã hết hạn hoặc không còn hợp lệ. Vui lòng đăng nhập lại.</p>}
          {error && <p className="form-alert" role="alert">{error}</p>}
          <form onSubmit={submit} noValidate aria-label="Đăng nhập" aria-busy={submitting}>
            <div className="form-field">
              <label htmlFor="username">Tên đăng nhập</label>
              <div className={`input-wrap ${errors.username ? 'invalid' : ''}`}>
                <UserRound size={19} aria-hidden="true" />
                <input ref={usernameInput} id="username" name="username" autoComplete="username" placeholder="Nhập tên đăng nhập" value={username} maxLength={50} disabled={submitting} required
                  aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? 'username-error' : undefined}
                  onChange={event => { setUsername(event.target.value); setErrors(previous => ({ ...previous, username: '' })); setError('') }} />
              </div>
              {errors.username && <p id="username-error" className="field-error" role="alert">{errors.username}</p>}
            </div>
            <div className="form-field">
              <label htmlFor="password">Mật khẩu</label>
              <div className={`input-wrap ${errors.password ? 'invalid' : ''}`}>
                <LockKeyhole size={19} aria-hidden="true" />
                <input ref={passwordInput} id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Nhập mật khẩu" value={password} maxLength={72} disabled={submitting} required
                  aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined}
                  onChange={event => { setPassword(event.target.value); setErrors(previous => ({ ...previous, password: '' })); setError('') }} />
                <button type="button" className="password-toggle" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible} disabled={submitting} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={19} /> : <Eye size={19} />}</button>
              </div>
              {errors.password && <p id="password-error" className="field-error" role="alert">{errors.password}</p>}
            </div>
            <button type="submit" className="primary-button login-submit" disabled={submitting}>
              {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}<ArrowRight size={19} aria-hidden="true" />
            </button>
          </form>
          <div className="login-help"><ShieldCheck size={18} aria-hidden="true" /><p>Chưa có tài khoản hoặc cần hỗ trợ?<br /><span>Vui lòng liên hệ quản trị viên của bạn.</span></p></div>
        </section>
        <footer className="login-footer">SmartClass IoT <span>•</span> Hệ thống phòng học thông minh</footer>
      </main>
    </div>
  )
}
