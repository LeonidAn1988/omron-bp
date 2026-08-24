import { chromium } from 'playwright'

const URL = 'http://localhost:5288'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()

const W = Number(process.env.W ?? 360)
const H = Number(process.env.H ?? 780)
const ZOOM = Number(process.env.ZOOM ?? 1)

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: W, height: H },
  locale: 'ru-RU',
  timezoneId: 'Europe/Moscow',
  colorScheme: 'light',
})
const page = await context.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 15000 })
await page.waitForTimeout(400)

await page.evaluate(async (now) => {
  const DAY = 86400000
  const midnight = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime() }
  const day0 = midnight(now)
  const at = (o, h) => day0 + o * DAY + h * 3600000

  const marks = []
  for (let i = -20; i <= 0; i++) {
    if (i !== -5) marks.push(at(i, 8))
    if (i < 0 && i !== -12) marks.push(at(i, 20))
  }
  const medicines = [
    { id:'m1', name:'Конкор', dose:'5 мг', inn:'Бисопролол', form:'Таблетки, покрытые пленочной оболочкой', maker:'Мерк КГаА', packSize:30, left:12, perDay:null, expires:Date.UTC(2027,4,31), times:['08:00','20:00'], perTime:1, meal:'after', taken:marks, leftAt: now-3*DAY },
    { id:'m3', name:'Оциллококцинум', dose:'', kind:2, inn:'', form:'Гранулы гомеопатические', maker:'Лаборатория Буарон', packSize:6, left:4, perDay:null, expires:Date.UTC(2026,8,30) },
  ]
  const readings = []
  for (let i = -29; i <= -1; i++) {
    readings.push({ id:`bp-${i}`, kind:'bp', ts: at(i,8)+600000, user:1, source:'manual',
      sys: 128 + ((i%7)+7)%7, dia: 82 + ((i%4)+4)%4, bpm: 68 + ((i%5)+5)%5, ihb: i%11===0, mov:false })
  }
  // Последнее измерение — гипертонический криз, как описано в находке.
  readings.push({ id:'bp-crisis', kind:'bp', ts: at(0,8)+600000, user:1, source:'manual',
    sys:194, dia:126, bpm:88, ihb:false, mov:false })

  const count = readings.length + medicines.length
  const settings = {
    // копия делалась 9 дней назад и с тех пор появились записи -> warning 'stale'
    backupLastAt: now - 9*DAY,
    backupLastCount: count - 1,
  }

  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('omron-bp', 3)
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  await new Promise((res, rej) => {
    const tx = db.transaction(['medicines','readings','meta'], 'readwrite')
    medicines.forEach((m) => tx.objectStore('medicines').put(m))
    readings.forEach((x) => tx.objectStore('readings').put(x))
    tx.objectStore('meta').put(settings, 'settings')
    tx.oncomplete = res; tx.onerror = () => rej(tx.error)
  })
  db.close()
}, FROZEN)

await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 15000 })
await page.waitForTimeout(600)

if (ZOOM !== 1) {
  await page.evaluate((z) => { document.documentElement.style.fontSize = `${16*z}px` }, ZOOM)
  await page.waitForTimeout(300)
}
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(200)

const info = await page.evaluate(() => {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top + window.scrollY), h: Math.round(r.height), text: (el.textContent||'').slice(0,60).replace(/\s+/g,' ') } }
  const banners = [...document.querySelectorAll('.banner')].map((b) => ({ cls: b.className, ...rect(b) }))
  const lead = document.querySelector('.lead')
  const leadCard = document.querySelector('.lead .card')
  const leadValue = document.querySelector('.lead__value')
  const picker = document.querySelector('.row.no-print')
  const topbar = document.querySelector('.topbar')
  const tabs = document.querySelector('nav.tabs')
  const stack = document.querySelector('.stack')
  return {
    vw: window.innerWidth, vh: window.innerHeight,
    docH: document.documentElement.scrollHeight,
    banners,
    topbar: topbar ? rect(topbar) : null,
    tabs: tabs ? rect(tabs) : null,
    stackTop: stack ? rect(stack).top : null,
    picker: picker ? rect(picker) : null,
    lead: lead ? rect(lead) : null,
    leadCard: leadCard ? rect(leadCard) : null,
    leadValue: leadValue ? rect(leadValue) : null,
  }
})

console.log(JSON.stringify({ W, H, ZOOM, ...info }, null, 2))
await page.screenshot({ path: process.env.SHOT ?? '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/measured.png' })
await browser.close()
