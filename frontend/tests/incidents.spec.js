import { test, expect } from '@playwright/test'

async function setup(page, role='ADMIN') {
  const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
  const token=`${encode({alg:'HS256'})}.${encode({sub:'incident_fixture',userId:81,role,exp:Math.floor(Date.now()/1000)+3600})}.test-only`
  await page.addInitScript(value=>sessionStorage.setItem('smartclass.accessToken',value),token)
  const state={fail:false,saveFail:false,calls:[],rows:Array.from({length:12},(_,i)=>({id:i+1,room_id:i%2?102:101,room_name:`Phòng ${i%2?102:101}`,reporter_id:i%2?82:81,reporter_name:i%2?'other_teacher':'incident_fixture',title:`Sự cố ${i+1}`,description:'Đèn phòng học bị nhấp nháy',status:'OPEN',resolution:'',created_at:'2026-11-09T10:00:00'}))}
  await page.route('http://localhost:8080/api/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method()
    const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'Access-Control-Allow-Origin':`http://localhost:${process.env.SMARTCLASS_E2E_PORT||5173}`,'Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'},body:JSON.stringify({success:status<400,data,message:status<400?'Thành công':'Không thể xử lý yêu cầu'})})
    if(method==='OPTIONS')return reply(null)
    state.calls.push({path,method,body:request.postDataJSON(),params:Object.fromEntries(url.searchParams)})
    if(path==='/api/auth/me')return reply({id:81,username:'incident_fixture',role})
    if(path==='/api/notifications/unread-count')return reply({count:0})
    if(path==='/api/building/rooms')return reply([{id:101,name:'Phòng 101'},{id:102,name:'Phòng 102'}])
    if(path==='/api/incidents'){
      if(state.fail)return reply(null,503)
      const current=Number(url.searchParams.get('page')||0),size=10
      const rows=state.rows.filter(row=>(role==='ADMIN'||row.reporter_id===81)&&(!url.searchParams.get('roomId')||row.room_id===Number(url.searchParams.get('roomId')))&&(!url.searchParams.get('status')||row.status===url.searchParams.get('status')))
      return reply({rows:rows.slice(current*size,(current+1)*size),totalElements:rows.length,totalPages:Math.ceil(rows.length/size),page:current,size})
    }
    if(path==='/api/classroom/incidents'&&method==='POST'){
      if(state.saveFail)return reply(null,503)
      const row={...request.postDataJSON(),room_id:request.postDataJSON().roomId,id:100,reporter_id:81,reporter_name:'incident_fixture',status:'OPEN',created_at:'2026-11-09T11:00:00'};state.rows.unshift(row);return reply(row)
    }
    const match=path.match(/^\/api\/classroom\/incidents\/(\d+)(\/events)?$/)
    if(match){
      const row=state.rows.find(row=>row.id===Number(match[1]))
      if(!row)return reply(null,404)
      if(role!=='ADMIN'&&row.reporter_id!==81)return reply(null,403)
      if(match[2])return reply([{id:1,status:row.status,actor:'admin',note:'Đã tiếp nhận',created_at:row.created_at}])
      if(method==='PATCH'){
        if(role!=='ADMIN')return reply(null,403)
        if(state.saveFail)return reply(null,503)
        Object.assign(row,{status:request.postDataJSON().status,resolution:request.postDataJSON().note})
      }
      return reply(row)
    }
    return reply(null,404)
  })
  return state
}

test('admin sees reports from all rooms with pagination and filters',async({page})=>{
  await setup(page)
  await page.goto('/incidents')
  await expect(page.getByRole('link',{name:'Báo cáo sự cố',exact:true})).toBeVisible()
  await expect(page.locator('.incident-card')).toHaveCount(10)
  await expect(page.getByText('Người báo: other_teacher',{exact:false}).first()).toBeVisible()
  await page.getByRole('button',{name:'Sau',exact:true}).click()
  await expect(page.locator('.incident-card')).toHaveCount(2)
  await page.getByLabel('Phòng học',{exact:true}).selectOption('102')
  await expect(page.locator('.incident-card')).toHaveCount(6)
  await expect(page.locator('.incident-card').first()).toContainText('Phòng 102')
})

for(const role of ['TEACHER','STUDENT'])test(`${role} sees own reports and can create a report`,async({page})=>{
  const state=await setup(page,role)
  await page.goto('/incidents')
  await expect(page.locator('.incident-card')).toHaveCount(6)
  await expect(page.getByRole('button',{name:'Cập nhật xử lý',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Báo sự cố mới',exact:true}).click()
  await page.getByLabel('Phòng xảy ra sự cố').selectOption('102')
  await page.getByLabel('Tiêu đề sự cố').fill('Máy chiếu không hoạt động')
  await page.getByLabel('Mô tả sự cố').fill('Máy chiếu không lên nguồn trong giờ học.')
  await page.getByRole('button',{name:'Gửi báo cáo',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Đã gửi báo cáo')
  await expect(page.locator('.incident-card').first()).toContainText('Máy chiếu không hoạt động')
  expect(state.calls.find(call=>call.method==='POST').body).toEqual({roomId:102,title:'Máy chiếu không hoạt động',description:'Máy chiếu không lên nguồn trong giờ học.'})
})

test('admin updates handling and opens history',async({page})=>{
  const state=await setup(page)
  await page.goto('/incidents')
  await page.getByRole('button',{name:'Cập nhật xử lý',exact:true}).first().click()
  await page.getByLabel('Trạng thái xử lý').selectOption('IN_PROGRESS')
  await page.getByLabel('Ghi chú xử lý').fill('Đã phân công kiểm tra đèn')
  await page.getByRole('button',{name:'Lưu cập nhật',exact:true}).click()
  await expect(page.getByRole('status')).toContainText('Đã cập nhật')
  await expect(page.locator('.incident-card').first()).toContainText('Đang xử lý')
  expect(state.calls.find(call=>call.method==='PATCH').body).toEqual({status:'IN_PROGRESS',note:'Đã phân công kiểm tra đèn'})
  await page.getByRole('button',{name:'Chi tiết & lịch sử',exact:true}).first().click()
  await expect(page.getByRole('dialog')).toContainText('Đã tiếp nhận')
})

test('load retry and failed submit preserve entered report on mobile',async({page})=>{
  const state=await setup(page,'STUDENT');state.fail=true
  await page.setViewportSize({width:390,height:844})
  await page.goto('/incidents')
  await expect(page.getByRole('alert')).toContainText('Không thể xử lý yêu cầu')
  state.fail=false
  await page.getByRole('button',{name:'Thử tải lại',exact:true}).click()
  await expect(page.locator('.incident-card')).toHaveCount(6)
  await page.getByRole('button',{name:'Báo sự cố mới',exact:true}).click()
  await page.getByLabel('Phòng xảy ra sự cố').selectOption('101')
  await page.getByLabel('Tiêu đề sự cố').fill('Quạt không chạy')
  await page.getByLabel('Mô tả sự cố').fill('Đã bật nhưng quạt không quay')
  state.saveFail=true
  await page.getByRole('button',{name:'Gửi báo cáo',exact:true}).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('Tiêu đề sự cố')).toHaveValue('Quạt không chạy')
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
