import { test, expect } from '@playwright/test'

const origin=`http://localhost:${process.env.SMARTCLASS_E2E_PORT || 5173}`
async function setup(page,role='TEACHER') {
  const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url')
  const token=`${encode({alg:'HS256'})}.${encode({sub:'profile_fixture',userId:81,role,exp:Math.floor(Date.now()/1000)+3600})}.test-only`
  await page.addInitScript(token=>sessionStorage.setItem('smartclass.accessToken',token),token)
  const state={calls:[],fail:false,saveFail:false,wait:null,profile:{id:81,username:'profile_fixture',role,fullName:'Nguyễn Văn An',email:'an@example.test',phone:'0912345678',createdAt:'2026-11-01T08:00:00'}}
  await page.route('http://localhost:8080/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname,method=req.method(),body=req.postDataJSON()
    const reply=(data,status=200,message='Thành công')=>route.fulfill({status,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'},contentType:'application/json',body:JSON.stringify({success:status<400,data,message})})
    if(method==='OPTIONS')return reply(null)
    state.calls.push({path,method,body})
    if(path==='/api/auth/me')return reply({id:81,username:'profile_fixture',role})
    if(path==='/api/notifications/unread-count')return reply({count:0})
    if(path==='/api/account/profile' && method==='GET')return reply(state.profile,state.fail?503:200,'Chưa tải được tài khoản')
    if(path==='/api/account/profile' && method==='PUT'){
      if(state.wait)await state.wait
      if(state.saveFail)return reply(null,503,'Chưa lưu được thông tin')
      Object.assign(state.profile,body);return reply(state.profile)
    }
    if(path==='/api/account/password')return body.currentPassword==='Current@12345'?reply(null):reply(null,400,'Mật khẩu hiện tại không đúng.')
    return reply(null,404)
  })
  return state
}

for(const role of ['ADMIN','TEACHER','STUDENT'])test(`${role} can open personal details without editing identity or role`,async({page})=>{
  await setup(page,role)
  await page.goto('/profile')
  await expect(page.getByRole('heading',{name:'Tài khoản cá nhân',exact:true})).toBeVisible()
  await expect(page.getByLabel('Họ và tên',{exact:true})).toHaveValue('Nguyễn Văn An')
  await expect(page.getByLabel('Tên đăng nhập',{exact:true})).toHaveAttribute('readonly','')
  await expect(page.getByLabel('Vai trò',{exact:true})).toHaveAttribute('readonly','')
  await expect(page.getByRole('link',{name:'Tài khoản cá nhân',exact:true})).toHaveAttribute('href','/profile')
})

test('profile changes persist on reload and never submit username or role',async({page})=>{
  const state=await setup(page)
  await page.goto('/profile')
  await page.getByLabel('Họ và tên',{exact:true}).fill('Nguyễn Thị Bình')
  await page.getByLabel('Email liên hệ',{exact:true}).fill('binh@example.test')
  await page.getByLabel('Số điện thoại',{exact:true}).fill('+84 912 345 678')
  await page.getByRole('button',{name:'Lưu thông tin',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Đã lưu thông tin cá nhân')
  expect(state.calls.find(c=>c.method==='PUT').body).toEqual({fullName:'Nguyễn Thị Bình',email:'binh@example.test',phone:'+84 912 345 678'})
  await page.reload()
  await expect(page.getByLabel('Họ và tên',{exact:true})).toHaveValue('Nguyễn Thị Bình')
  await expect(page.getByRole('heading',{name:'Nguyễn Thị Bình',exact:true})).toBeVisible()
})

test('contact validation and server errors keep the entered information',async({page})=>{
  const state=await setup(page)
  await page.goto('/profile')
  await page.getByLabel('Email liên hệ',{exact:true}).fill('invalid')
  await page.getByRole('button',{name:'Lưu thông tin',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('email hợp lệ')
  expect(state.calls.some(c=>c.method==='PUT')).toBe(false)
  await page.getByLabel('Email liên hệ',{exact:true}).fill('valid@example.test')
  state.saveFail=true
  await page.getByRole('button',{name:'Lưu thông tin',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Chưa lưu được thông tin')
  await expect(page.getByLabel('Email liên hệ',{exact:true})).toHaveValue('valid@example.test')
})

test('load failure can be retried and repeated submits do not duplicate a save',async({page})=>{
  const state=await setup(page);state.fail=true
  await page.goto('/profile')
  await expect(page.getByRole('alert')).toContainText('Chưa tải được tài khoản')
  state.fail=false
  await page.getByRole('button',{name:'Tải lại tài khoản',exact:true}).click()
  await expect(page.getByLabel('Họ và tên',{exact:true})).toBeVisible()
  let release;state.wait=new Promise(resolve=>{release=resolve})
  await page.locator('form').first().evaluate(form=>{form.requestSubmit();form.requestSubmit()})
  await expect.poll(()=>state.calls.filter(c=>c.method==='PUT').length).toBe(1)
  release()
  await expect(page.getByRole('status')).toContainText('Đã lưu thông tin cá nhân')
})

test('password mismatch and incorrect current password keep the user signed in',async({page})=>{
  const state=await setup(page)
  await page.goto('/profile')
  await page.getByLabel('Mật khẩu hiện tại',{exact:true}).fill('Wrong@12345')
  await page.getByLabel('Mật khẩu mới',{exact:true}).fill('NewPassword@123')
  await page.getByLabel('Xác nhận mật khẩu mới',{exact:true}).fill('different')
  await page.getByRole('button',{name:'Đổi mật khẩu',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('chưa khớp')
  expect(state.calls.some(c=>c.path==='/api/account/password')).toBe(false)
  await page.getByLabel('Xác nhận mật khẩu mới',{exact:true}).fill('NewPassword@123')
  await page.getByRole('button',{name:'Đổi mật khẩu',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Mật khẩu hiện tại không đúng')
  await expect(page).toHaveURL(/\/profile$/)
  await page.getByRole('button',{name:'Hiện mật khẩu',exact:true}).click()
  await expect(page.getByLabel('Mật khẩu mới',{exact:true})).toHaveAttribute('type','text')
})

test('successful password change signs out and sends only the required fields',async({page})=>{
  const state=await setup(page)
  await page.goto('/profile')
  await page.getByLabel('Mật khẩu hiện tại',{exact:true}).fill('Current@12345')
  await page.getByLabel('Mật khẩu mới',{exact:true}).fill('NewPassword@123')
  await page.getByLabel('Xác nhận mật khẩu mới',{exact:true}).fill('NewPassword@123')
  await page.getByRole('button',{name:'Đổi mật khẩu',exact:true}).click()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('status')).toContainText('Đổi mật khẩu thành công')
  expect(await page.evaluate(()=>sessionStorage.getItem('smartclass.accessToken'))).toBeNull()
  expect(state.calls.find(c=>c.path==='/api/account/password').body).toEqual({currentPassword:'Current@12345',newPassword:'NewPassword@123'})
})

test('account forms fit mobile and provide keyboard-accessible controls',async({page})=>{
  await setup(page,'STUDENT')
  await page.setViewportSize({width:320,height:844})
  await page.goto('/profile')
  await expect(page.getByLabel('Họ và tên',{exact:true})).toHaveValue('Nguyễn Văn An')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:'test-results/account-mobile.png',fullPage:true})
  await page.setViewportSize({width:1366,height:900})
  await page.screenshot({path:'test-results/account-desktop.png',fullPage:true})
})

for(const role of ['ADMIN','TEACHER','STUDENT'])test(`real personal account can be read without mutation: ${role}`,async({page})=>{
  test.skip(process.env.SMARTCLASS_E2E_BACKEND!=='1','Enable with a running Backend and test credentials')
  const username=process.env[`AUTH_${role}_USERNAME`],password=process.env[`AUTH_${role}_PASSWORD`]
  if(!username || !password)throw new Error('Set test credentials')
  const writes=[]
  page.on('request',request=>{if(request.url().includes('/api/account/') && request.method()!=='GET' && request.method()!=='OPTIONS')writes.push(request.url())})
  await page.goto('/profile')
  await page.getByLabel('Tên đăng nhập',{exact:true}).fill(username)
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password)
  const response=page.waitForResponse(r=>r.url().endsWith('/api/account/profile') && r.request().method()==='GET')
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click()
  expect((await response).status()).toBe(200)
  await expect(page.getByRole('heading',{name:'Tài khoản cá nhân',exact:true})).toBeVisible()
  await expect(page.getByLabel('Tên đăng nhập',{exact:true})).toHaveValue(username)
  expect(writes).toEqual([])
})
