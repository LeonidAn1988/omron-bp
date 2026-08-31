import { chromium } from 'playwright'
const URL = 'http://localhost:5471'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs, .app', { timeout: 15000 })
await page.waitForTimeout(600)

// посев: только давление и пара лекарств, сахара НЕТ, trackGlucose НЕ ставим
await page.evaluate(async (now) => {
  const DAY = 86400000
  const d = new Date(now); d.setHours(0,0,0,0); const day0 = d.getTime()
  const at = (o,h) => day0 + o*DAY + h*3600000
  const readings = []
  for (let i=-10;i<=0;i++) readings.push({ id:`bp-${i}`, kind:'bp', ts:at(i,8)+600000, user:1, source:'manual', sys:128+((i%7)+7)%7, dia:82+((i%4)+4)%4, bpm:70, ihb:false, mov:false })
  const medicines = [{ id:'m1', name:'Конкор', dose:'5 мг', inn:'Бисопролол', form:'Таблетки', maker:'Мерк', packSize:30, left:12, perDay:null, expires:Date.UTC(2027,4,31), times:['08:00'], perTime:1, taken:[] }]
  const db = await new Promise((res,rej)=>{ const r=indexedDB.open('omron-bp',3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
  await new Promise((res,rej)=>{ const tx=db.transaction(['medicines','readings','meta'],'readwrite')
    medicines.forEach(m=>tx.objectStore('medicines').put(m)); readings.forEach(r=>tx.objectStore('readings').put(r))
    tx.objectStore('meta').put({ onboarded:true }, 'settings')
    tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
  db.close()
}, FROZEN)

await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 15000 })
await page.waitForTimeout(500)

const tabs = async () => page.$$eval('nav.tabs button', els => els.map(e => e.innerText.replace(/\s+/g,' ').trim()))
console.log('ВКЛАДКИ (trackGlucose=false, замеров сахара нет):', JSON.stringify(await tabs()))

// вкладка Давление
await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
await page.waitForTimeout(400)
const cardInfo = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')]
  const c = cards.find(el => /Ведёте ещё и сахар/.test(el.innerText))
  if (!c) return null
  const r = c.getBoundingClientRect()
  const btn = [...c.querySelectorAll('button')].map(b => ({ text: b.innerText.trim(), cls: b.className }))
  return { text: c.innerText.replace(/\s+/g,' ').trim(), topDoc: Math.round(r.top + window.scrollY), h: Math.round(r.height), buttons: btn, docH: Math.round(document.documentElement.scrollHeight), vh: window.innerHeight }
})
console.log('КАРТОЧКА НА «ДАВЛЕНИИ»:', JSON.stringify(cardInfo, null, 1))
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/_gl_bp_bottom.png` })

await browser.close()
