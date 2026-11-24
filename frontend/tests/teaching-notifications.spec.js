import { test, expect } from '@playwright/test'

const origin = `http://localhost:${process.env.SMARTCLASS_E2E_PORT || 5173}`
async function setup(page, role = 'TEACHER') {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = `${encode({ alg: 'HS256' })}.${encode({ sub: 'personal_fixture', userId: 81, role, exp: Math.floor(Date.now()/1000)+3600 })}.test-only`
  await page.addInitScript(token => sessionStorage.setItem('smartclass.accessToken', token), token)
  const state = { calls: [], readFail: false, mutationFail: false, historyFail: false,
    bookings: Array.from({ length: 12 }, (_, i) => ({ id: i+1, owner_id: 81, owner_name: 'personal_fixture', title: `Buổi học ${i+1}`, room_id: i%2 ? 102 : 101, room_status: 'ACTIVE', room_name: `Phòng ${i%2 ? 102 : 101}`, floor_number: 1, expected_attendees: 30, starts_at: i < 3 ? '2026-11-01T08:00:00' : '2030-11-10T08:00:00', ends_at: i < 3 ? '2026-11-01T09:00:00' : '2030-11-10T09:00:00', status: i < 3 ? 'APPROVED' : 'PENDING', expires_at: '2030-11-09T08:00:00', decision_note: '' })),
    notices: [{ id: 6, title: 'Lịch đã được duyệt', message: 'Phòng 101 · Buổi học 1', kind: 'BOOKING_APPROVED', target_path: '/my-schedule?bookingId=1', created_at: '2026-11-09T10:00:00', read_at: null }, { id: 5, title: 'Đăng ký đã hết hạn', message: 'Phòng 102 · Yêu cầu cũ', kind: 'BOOKING_EXPIRED', target_path: '/my-schedule?bookingId=2', created_at: '2026-11-09T09:00:00', read_at: null }],
  }
  await page.route('http://localhost:8080/api/**', async route => {
    const request=route.request(), url=new URL(request.url()), path=url.pathname, method=request.method(), body=request.postDataJSON()
    const headers={ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization,Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,OPTIONS' }
    const reply=(data,status=200,message='Thành công') => route.fulfill({ status, headers, contentType:'application/json', body:JSON.stringify({ success:status<400, data, message }) })
    if(method==='OPTIONS') return reply(null)
    state.calls.push({ path, method, body, params:Object.fromEntries(url.searchParams) })
    if(path==='/api/auth/me') return reply({ id:81,username:'personal_fixture',role })
    if(path==='/api/building/rooms') return reply([{id:101,name:'Phòng 101',floor_number:1,status:'ACTIVE',capacity:40},{id:102,name:'Phòng 102',floor_number:1,status:'ACTIVE',capacity:40}])
    if(path==='/api/notifications/unread-count') return reply({count:state.notices.filter(n=>!n.read_at).length})
    if(path==='/api/notifications' && method==='GET') {
      const rows=state.notices.filter(n=>url.searchParams.get('unreadOnly')!=='true' || !n.read_at)
      return reply({ rows, page:0, size:20, totalPages:rows.length?1:0, totalElements:rows.length, unreadCount:state.notices.filter(n=>!n.read_at).length, latestId:Math.max(0,...state.notices.map(n=>n.id)) })
    }
    if(path==='/api/notifications/read-all') {
      if(state.readFail) return reply(null,503,'Chưa lưu được trạng thái')
      if(state.injectNotice) state.notices.unshift({ ...state.notices[0],id:99,title:'Thông báo vừa đến',read_at:null })
      state.notices.forEach(n=>{if(n.id<=body.upToId)n.read_at='2026-11-09T10:01:00'})
      return reply(null)
    }
    const read=path.match(/^\/api\/notifications\/(\d+)\/read$/)
    if(read) { if(state.readFail)return reply(null,503,'Chưa lưu được trạng thái'); state.notices.find(n=>n.id===Number(read[1])).read_at='2026-11-09T10:01:00';return reply(null) }
    if(path==='/api/teaching/bookings') {
      if(state.historyFail) return reply(null,503,'Chưa tải được lịch')
      const params=Object.fromEntries(url.searchParams), count=Number(params.size), p=Number(params.page)
      const rows=state.bookings.filter(row=>(!params.status || row.status===params.status) && (!params.roomId || row.room_id===Number(params.roomId)) && (params.period!=='PAST' || row.starts_at.startsWith('2026-11-01')) && (params.period!=='UPCOMING' || row.starts_at.startsWith('2030')))
      return reply({ rows:rows.slice(p*count,(p+1)*count),totalElements:rows.length,totalPages:Math.ceil(rows.length/count),page:p,size:count })
    }
    const detail=path.match(/^\/api\/teaching\/bookings\/(\d+)$/)
    if(detail) { const row=state.bookings.find(r=>r.id===Number(detail[1]));return reply(row || null,row?200:404,'Không tìm thấy lịch của bạn') }
    const mutation=path.match(/^\/api\/classroom\/bookings\/(\d+)$/)
    if(mutation) {
      const row=state.bookings.find(r=>r.id===Number(mutation[1]))
      if(method==='GET')return reply(row)
      if(state.mutationFail)return reply(null,409,'Lịch đã thay đổi, vui lòng thử lại')
      Object.assign(row,method==='PATCH'?{status:body.status,decision_note:body.note}:{title:body.title,starts_at:body.startsAt,ends_at:body.endsAt,room_id:body.roomId,expected_attendees:body.expectedAttendees})
      return reply(row)
    }
    if(path.endsWith('/report'))return reply({booking:state.bookings[0],environment:{samples:0,average_temp:null,average_humid:null,average_lux:null},note:'Lịch cũ chưa có cấu hình lưu.'})
    if(path==='/api/classroom/bookings')return reply([])
    if(path==='/api/classroom/permission')return reply({allowed:role==='ADMIN',reason:'Quyền theo ca',canAcknowledge:false})
    if(path==='/api/iot/rooms/101')return reply({id:101,status:'ACTIVE',iotEnabled:true,devices:[],incidentSummary:[]})
    if(path==='/api/classroom/incidents')return reply([])
    if(path==='/api/classroom/incidents/7')return reply({id:7,room_id:101,title:'Đèn hỏng',description:'Đèn đã được kiểm tra',status:'RESOLVED'})
    if(path==='/api/classroom/incidents/7/events')return reply([{id:1,status:'RESOLVED',note:'Đã thay bóng',actor:'admin',created_at:'2026-11-09T10:00:00'}])
    return reply(null,404,'Không tìm thấy')
  })
  return state
}

test('teacher history paginates past registrations and sends explicit filters',async({page})=>{
  const state=await setup(page)
  await page.goto('/my-schedule')
  await expect(page.getByRole('heading',{name:'Lịch của tôi',exact:true})).toBeVisible()
  await expect(page.locator('.teaching-card')).toHaveCount(10)
  await page.getByRole('button',{name:'Sau',exact:true}).click()
  await expect(page.locator('.teaching-card')).toHaveCount(2)
  await page.getByLabel('Khoảng lịch',{exact:true}).selectOption('PAST')
  await page.getByLabel('Trạng thái',{exact:true}).selectOption('APPROVED')
  await page.getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).click()
  await expect(page.locator('.teaching-card')).toHaveCount(3)
  expect(state.calls.filter(c=>c.path==='/api/teaching/bookings').at(-1).params).toMatchObject({page:'0',period:'PAST',status:'APPROVED'})
  await page.getByLabel('Từ ngày',{exact:true}).fill('2026-11-10')
  await page.getByLabel('Đến ngày',{exact:true}).fill('2026-11-09')
  const count=state.calls.filter(c=>c.path==='/api/teaching/bookings').length
  await page.getByRole('button',{name:'Áp dụng bộ lọc',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Ngày kết thúc')
  expect(state.calls.filter(c=>c.path==='/api/teaching/bookings').length).toBe(count)
})

test('personal history recovers after an error and a deep link opens an older report',async({page})=>{
  const state=await setup(page);state.historyFail=true
  await page.goto('/my-schedule?bookingId=12')
  await expect(page.getByRole('region',{name:'Chi tiết lịch đã chọn'})).toContainText('Buổi học 12')
  await expect(page.getByRole('alert')).toContainText('Chưa tải được lịch')
  state.historyFail=false
  await page.getByRole('button',{name:'Làm mới lịch',exact:true}).click()
  await expect(page.locator('.teaching-card')).toHaveCount(10)
  await page.getByRole('button',{name:'Xem báo cáo buổi học',exact:true}).click()
  await expect(page.getByRole('dialog')).toContainText('Chưa có dữ liệu')
  await page.getByRole('dialog').getByRole('button',{name:/Đóng/}).click()
  await page.goto('/my-schedule?bookingId=999')
  await expect(page.getByRole('alert')).toContainText('Không tìm thấy lịch của bạn')
})

test('cancelling a booking requires confirmation and retains the reason on conflict',async({page})=>{
  const state=await setup(page)
  await page.goto('/my-schedule?bookingId=4')
  await page.getByRole('button',{name:'Hủy lịch',exact:true}).click()
  const dialog=page.getByRole('dialog')
  await dialog.getByLabel('Lý do hủy').fill('Đổi buổi học')
  expect(state.calls.some(c=>c.method==='PATCH' && c.path.includes('/bookings/'))).toBe(false)
  state.mutationFail=true
  await dialog.getByRole('button',{name:'Xác nhận hủy',exact:true}).click()
  await expect(dialog.getByRole('alert')).toContainText('Lịch đã thay đổi')
  await expect(dialog.getByLabel('Lý do hủy')).toHaveValue('Đổi buổi học')
  state.mutationFail=false
  await dialog.getByRole('button',{name:'Xác nhận hủy',exact:true}).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('region',{name:'Chi tiết lịch đã chọn'})).toContainText('Đã hủy')
})

test('notification read errors preserve unread status, then opening targets the exact booking',async({page})=>{
  const state=await setup(page)
  await page.goto('/notifications')
  const card=page.getByRole('article',{name:'Lịch đã được duyệt',exact:true})
  await expect(page.getByRole('link',{name:'Thông báo, 2 chưa đọc',exact:true})).toBeVisible()
  state.readFail=true
  await card.getByRole('button',{name:'Đánh dấu đã đọc',exact:true}).click()
  await expect(page.getByRole('alert')).toContainText('Chưa lưu được trạng thái')
  await expect(card).toContainText('Chưa đọc')
  state.readFail=false
  await card.getByRole('button',{name:'Mở nội dung',exact:true}).click()
  await expect(page).toHaveURL(/\/my-schedule\?bookingId=1$/)
  await expect(page.getByRole('region',{name:'Chi tiết lịch đã chọn'})).toContainText('Buổi học 1')
  expect(state.notices.find(n=>n.id===6).read_at).toBeTruthy()
})

test('mark all read uses the loaded watermark and leaves newly arrived items unread',async({page})=>{
  const state=await setup(page);state.injectNotice=true
  await page.goto('/notifications')
  await page.getByLabel('Chỉ chưa đọc',{exact:true}).check()
  await expect(page.locator('.notification-card')).toHaveCount(2)
  await page.getByRole('button',{name:'Đánh dấu tất cả đã đọc',exact:true}).click()
  await expect(page.locator('.notification-card')).toHaveCount(1)
  await expect(page.getByRole('article',{name:'Thông báo vừa đến',exact:true})).toContainText('Chưa đọc')
  expect(state.calls.find(c=>c.path==='/api/notifications/read-all').body).toEqual({upToId:6})
})

for (const role of ['STUDENT','ADMIN']) test(`${role} has notifications but cannot enter personal teacher history`,async({page})=>{
  const state = await setup(page,role)
  await page.goto('/my-schedule')
  await expect(page.getByRole('heading',{name:'Bạn không có quyền truy cập',exact:true})).toBeVisible()
  await expect(page.getByRole('link',{name:'Lịch của tôi',exact:true})).toHaveCount(0)
  expect(state.calls.some(call => call.path.startsWith('/api/teaching/bookings'))).toBe(false)
  await page.getByRole('link',{name:/^Thông báo/}).click()
  await expect(page.getByRole('heading',{name:'Thông báo',exact:true})).toBeVisible()
})

test('teacher history and notifications fit mobile screens',async({page})=>{
  await setup(page)
  await page.setViewportSize({width:390,height:844})
  await page.goto('/my-schedule?bookingId=1')
  await expect(page.locator('.teaching-card')).toHaveCount(10)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:'test-results/teaching-history-mobile.png',fullPage:true})
  await page.setViewportSize({width:320,height:844})
  await page.goto('/notifications')
  await expect(page.locator('.notification-card')).toHaveCount(2)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  await page.screenshot({path:'test-results/notifications-mobile.png',fullPage:true})
})

test('admin booking notification focuses a record outside the default calendar range',async({page})=>{
  const state=await setup(page,'ADMIN')
  state.notices[0].target_path='/classroom?roomId=102&bookingId=12'
  await page.goto('/notifications')
  await page.getByRole('article',{name:'Lịch đã được duyệt',exact:true}).getByRole('button',{name:'Mở nội dung',exact:true}).click()
  await expect(page.locator('.classroom-focused')).toContainText('Buổi học 12')
  await expect(page.locator('.classroom-focused')).toContainText('Được mở từ thông báo')
})

test('incident notification opens the protected report and its event history',async({page})=>{
  const state=await setup(page,'STUDENT')
  state.notices[0].target_path='/classroom?roomId=101&tab=incidents&incidentId=7'
  await page.goto('/notifications')
  await page.getByRole('article',{name:'Lịch đã được duyệt',exact:true}).getByRole('button',{name:'Mở nội dung',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'Lịch sử xử lý',exact:true})).toContainText('Đã thay bóng')
  await expect(page.getByRole('dialog')).toContainText('Đèn đã được kiểm tra')
})

test('real personal history and notifications are read without changing business data',async({page})=>{
  test.skip(process.env.SMARTCLASS_E2E_BACKEND!=='1','Enable with a running Backend and test credentials')
  const username=process.env.AUTH_TEACHER_USERNAME,password=process.env.AUTH_TEACHER_PASSWORD
  if(!username || !password)throw new Error('Set teacher test credentials')
  const writes=[]
  page.on('request',request=>{if(request.url().includes('/api/') && !['GET','OPTIONS'].includes(request.method()) && !request.url().endsWith('/api/auth/login'))writes.push(request.url())})
  await page.goto('/my-schedule')
  await page.getByLabel('Tên đăng nhập',{exact:true}).fill(username)
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password)
  const history=page.waitForResponse(response=>response.url().includes('/api/teaching/bookings?') && response.request().method()==='GET')
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click()
  expect((await history).status()).toBe(200)
  await expect(page.getByRole('heading',{name:'Lịch của tôi',exact:true})).toBeVisible()
  const notifications=page.waitForResponse(response=>response.url().includes('/api/notifications?') && response.request().method()==='GET')
  await page.getByRole('link',{name:/^Thông báo/}).click()
  expect((await notifications).status()).toBe(200)
  await expect(page.getByRole('heading',{name:'Thông báo',exact:true})).toBeVisible()
  expect(writes).toEqual([])
})
