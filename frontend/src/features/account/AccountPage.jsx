import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LockKeyhole, RefreshCw, Save, UserRound } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { api } from '../../services/api/client.js'
import { formatTime } from '../../utils/dateTime.js'
import '../notifications/notifications.css'
import './account.css'

const roleLabels = { ADMIN:'Quản trị viên',TEACHER:'Giáo viên',STUDENT:'Học viên' }
const emptyPasswords = { currentPassword:'',newPassword:'',confirmation:'' }
const validPhone = value => !value || /^\+?[0-9]{7,15}$/.test(value.replace(/[\s().-]/g,''))
function errorMessage(error) {
  const text=error.response?.data?.message
  return text && text!=='Invalid request' ? text : error.response?.status===400 ? 'Thông tin chưa hợp lệ. Kiểm tra độ dài và định dạng các trường.' : 'Chưa lưu được thay đổi. Vui lòng thử lại.'
}
function validProfile(data) { return data && Number.isSafeInteger(data.id) && ['ADMIN','TEACHER','STUDENT'].includes(data.role) && ['username','fullName','email','phone'].every(key=>typeof data[key]==='string') }

export default function AccountPage() {
  const auth=useAuth(),navigate=useNavigate()
  const [resource,setResource]=useState({loading:true,data:null,error:''}),[revision,setRevision]=useState(0)
  const [values,setValues]=useState({fullName:'',email:'',phone:''}),[passwords,setPasswords]=useState(emptyPasswords)
  const [errors,setErrors]=useState({}),[passwordErrors,setPasswordErrors]=useState({}),[busy,setBusy]=useState(''),[notice,setNotice]=useState(''),[saveError,setSaveError]=useState(''),[passwordError,setPasswordError]=useState(''),[visible,setVisible]=useState(false)
  const working=useRef(false),firstProfile=useRef(null),firstPassword=useRef(null)
  useEffect(()=>{
    const controller=new AbortController();setResource({loading:true,data:null,error:''});setNotice('');setSaveError('')
    api.get('/api/account/profile',{signal:controller.signal}).then(({data})=>{
      if(!data?.success || !validProfile(data.data))throw new Error('Invalid account profile')
      if(!controller.signal.aborted){setResource({loading:false,data:data.data,error:''});setValues({fullName:data.data.fullName,email:data.data.email,phone:data.data.phone})}
    }).catch(e=>{if(!controller.signal.aborted)setResource({loading:false,data:null,error:e.response?.data?.message || 'Chưa tải được tài khoản. Hãy thử tải lại.'})})
    return ()=>controller.abort()
  },[auth.user.id,revision])
  async function saveProfile(event) {
    event.preventDefault();if(working.current)return
    const next={},body={fullName:values.fullName.trim(),email:values.email.trim(),phone:values.phone.trim()}
    if(body.fullName.length>100 || /[\u0000-\u001f\u007f]/.test(body.fullName))next.fullName='Họ tên tối đa 100 ký tự và không chứa ký tự điều khiển.'
    if(body.email.length>254 || (body.email && !/^[^\s@]+@[^\s@]+$/.test(body.email)))next.email='Nhập địa chỉ email hợp lệ, tối đa 254 ký tự.'
    if(body.phone.length>30 || !validPhone(body.phone))next.phone='Số điện thoại cần 7–15 chữ số, có thể có dấu + ở đầu.'
    setErrors(next);setNotice('');setSaveError('')
    if(Object.keys(next).length){firstProfile.current?.querySelector(`[name="${Object.keys(next)[0]}"]`)?.focus();return}
    working.current=true;setBusy('profile')
    try {
      const {data}=await api.put('/api/account/profile',body)
      if(!data?.success || !validProfile(data.data))throw new Error('Invalid saved profile')
      setResource({loading:false,data:data.data,error:''});setValues({fullName:data.data.fullName,email:data.data.email,phone:data.data.phone});setNotice('Đã lưu thông tin cá nhân.')
    }catch(e){setSaveError(errorMessage(e))}finally{working.current=false;setBusy('')}
  }
  async function changePassword(event) {
    event.preventDefault();if(working.current)return
    const next={}
    if(!passwords.currentPassword.trim())next.currentPassword='Nhập mật khẩu hiện tại.'
    else if(new TextEncoder().encode(passwords.currentPassword).length>72)next.currentPassword='Mật khẩu tối đa 72 byte UTF-8.'
    if(!passwords.newPassword.trim() || passwords.newPassword.length<8 || new TextEncoder().encode(passwords.newPassword).length>72)next.newPassword='Mật khẩu mới từ 8 ký tự và tối đa 72 byte UTF-8.'
    else if(passwords.currentPassword===passwords.newPassword)next.newPassword='Mật khẩu mới phải khác mật khẩu hiện tại.'
    if(passwords.confirmation!==passwords.newPassword)next.confirmation='Mật khẩu xác nhận chưa khớp.'
    setPasswordErrors(next);setPasswordError('')
    if(Object.keys(next).length){event.currentTarget.querySelector(`[name="${Object.keys(next)[0]}"]`)?.focus();return}
    working.current=true;setBusy('password')
    try {
      await api.post('/api/account/password',{currentPassword:passwords.currentPassword,newPassword:passwords.newPassword})
      setPasswords(emptyPasswords);auth.logout('password-changed');navigate('/login',{replace:true,state:{passwordChanged:true}})
    }catch(e){setPasswordError(errorMessage(e))}finally{working.current=false;setBusy('')}
  }
  const profile=resource.data
  return <div className="personal-page account-page">
    <header className="personal-heading"><div><p className="eyebrow">Hồ sơ & bảo mật</p><h1>Tài khoản cá nhân</h1><p>Cập nhật thông tin liên hệ và mật khẩu đăng nhập của bạn.</p></div><button className="secondary-button" disabled={Boolean(busy) || resource.loading} onClick={()=>setRevision(n=>n+1)}><RefreshCw size={16}/>Tải lại tài khoản</button></header>
    {resource.loading && <p role="status">Đang tải thông tin cá nhân…</p>}
    {resource.error && <p className="personal-error" role="alert">{resource.error}</p>}
    {profile && <>
      <section className="account-summary" aria-label="Thông tin tài khoản"><span className="account-profile-avatar" aria-hidden="true">{(profile.fullName || profile.username).slice(0,1).toLocaleUpperCase('vi-VN')}</span><div><h2>{profile.fullName || profile.username}</h2><p>@{profile.username} · {roleLabels[profile.role]}</p></div><span className="account-created">Tham gia {formatTime(profile.createdAt,true)}</span></section>
      <div className="account-columns">
        <section className="account-panel" aria-labelledby="account-profile-title"><header><UserRound size={20}/><h2 id="account-profile-title">Thông tin cơ bản</h2></header><p className="account-note">Các thông tin liên hệ là tùy chọn. Email không thay thế tên đăng nhập.</p>
          <form ref={firstProfile} onSubmit={saveProfile} noValidate>
            <label className="account-field"><span>Tên đăng nhập</span><input value={profile.username} readOnly autoComplete="username"/></label>
            <label className="account-field"><span>Vai trò</span><input value={roleLabels[profile.role]} readOnly/></label>
            <p className="account-note">Tên đăng nhập và vai trò do quản trị viên quản lý.</p>
            {[['fullName','Họ và tên','text','name',100],['email','Email liên hệ','email','email',254],['phone','Số điện thoại','tel','tel',30]].map(([key,label,type,autoComplete,max])=><label className="account-field" key={key}><span>{label}</span><input aria-label={label} name={key} type={type} autoComplete={autoComplete} maxLength={max} value={values[key]} disabled={Boolean(busy)} onChange={e=>{setValues(v=>({...v,[key]:e.target.value}));setErrors(v=>({...v,[key]:''}));setNotice('')}} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key]?`account-${key}-error`:undefined}/>{errors[key] && <small className="field-error" id={`account-${key}-error`} role="alert">{errors[key]}</small>}</label>)}
            {saveError && <p className="personal-error" role="alert">{saveError}</p>}{notice && <p className="account-success" role="status">{notice}</p>}
            <button className="primary-button" disabled={Boolean(busy)}><Save size={16}/>{busy==='profile'?'Đang lưu…':'Lưu thông tin'}</button>
          </form>
        </section>
        <section className="account-panel account-security" aria-labelledby="account-security-title"><header><LockKeyhole size={20}/><h2 id="account-security-title">Đổi mật khẩu</h2></header><p className="account-note">Cần mật khẩu hiện tại để xác nhận. Đổi thành công sẽ đăng xuất các phiên hiện có và yêu cầu đăng nhập lại.</p>
          <form onSubmit={changePassword} noValidate>{[['currentPassword','Mật khẩu hiện tại','current-password'],['newPassword','Mật khẩu mới','new-password'],['confirmation','Xác nhận mật khẩu mới','new-password']].map(([key,label,autoComplete],index)=><label className="account-field" key={key}><span>{label}</span><input aria-label={label} ref={index===0?firstPassword:undefined} name={key} type={visible?'text':'password'} autoComplete={autoComplete} maxLength={72} value={passwords[key]} disabled={Boolean(busy)} onChange={e=>{setPasswords(v=>({...v,[key]:e.target.value}));setPasswordErrors(v=>({...v,[key]:''}))}} aria-invalid={Boolean(passwordErrors[key])} aria-describedby={passwordErrors[key]?`account-${key}-error`:undefined}/>{passwordErrors[key] && <small className="field-error" id={`account-${key}-error`} role="alert">{passwordErrors[key]}</small>}</label>)}
            <button className="account-password-toggle" type="button" aria-pressed={visible} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={16}/>:<Eye size={16}/>} {visible?'Ẩn mật khẩu':'Hiện mật khẩu'}</button>
            <p className="account-note">Từ 8 ký tự, tối đa 72 byte UTF-8. Không dùng lại mật khẩu hiện tại.</p>{passwordError && <p className="personal-error" role="alert">{passwordError}</p>}
            <button className="primary-button" disabled={Boolean(busy)}><LockKeyhole size={16}/>{busy==='password'?'Đang đổi mật khẩu…':'Đổi mật khẩu'}</button>
          </form>
        </section>
      </div>
    </>}
  </div>
}
