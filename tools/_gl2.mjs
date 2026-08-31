import { chromium } from 'playwright'
const URL = 'http://localhost:5471'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()

async function seedPage(page) {
  await page.evaluate(async (now) => {
    const DAY = 86400000
    const d = new Date(now); d.setHours(0,0,0,0); const day0 = d.getTime()
    const at = (o,h) => day0 + o*DAY + h*3600000
    const readings = []
    for (let i=-10;i<=0;i++) readings.push({ id:`bp-${i}`, kind:'bp', ts:at(i,8)+600000, user:1, source:'manual', sys:128, dia:82, bpm:70, ihb:false, mov:false })
    const medicines = [{ id:'m1', name:'Конкор', dose:'5 мг', inn:'Бисопролол', form:'Таблетки', maker:'Мерк', packSize:30, left:12, perDay:null, expires:Date.UTC(2027,4,31), times:['08:00'], perTime:1, taken:[] }]
    const db = await new Promise((res,rej)=>{ const r=indexedDB.open('omron-bp',3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
    await new Promise((res,rej)=>{ const tx=db.transaction(['medicines','readings','meta'],'readwrite')
      medicines.forEach(m=>tx.objectStore('medicines').put(m)); readings.forEach(r=>tx.objectStore('readings').put(r))
      tx.objectStore('meta').put({ onboarded:true }, 'settings')
      tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
    db.close()
  }, FROZEN)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.app', { timeout: 15000 }); await page.waitForTimeout(500)
await seedPage(page)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 15000 }); await page.waitForTimeout(500)

const hasInvite = () => page.evaluate(() => [...document.querySelectorAll('.card')].some(el => /Ведёте ещё и сахар/.test(el.innerText)))
const tabs = () => page.$$eval('nav.tabs button', els => els.map(e => e.innerText.replace(/\s+/g,' ').trim()))
const openBp = async () => { await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click(); await page.waitForTimeout(350) }
const openSettings = async () => { await page.locator('header button', { hasText: 'Настройки' }).first().click(); await page.waitForTimeout(400) }

// --- 1. галочка «Сахар» в «Разделах»: состояние и доступность
await openSettings()
const rowState = await page.evaluate(() => {
  const label = [...document.querySelectorAll('label.badge')].find(l => /^Сахар/.test(l.innerText.trim()))
  const inp = label.querySelector('input')
  return { text: label.innerText.replace(/\s+/g,' ').trim(), checked: inp.checked, disabled: inp.disabled }
})
console.log('СТРОКА «Сахар» В РАЗДЕЛАХ:', JSON.stringify(rowState))

// --- 2. геометрия: «Сахар» в Разделах vs «вести» в «Дневнике сахара»
const geom = async (label) => page.evaluate(() => {
  const sec = [...document.querySelectorAll('label.badge')].find(l => /^Сахар/.test(l.innerText.trim()))
  const heads = [...document.querySelectorAll('.card__head')]
  const gh = heads.find(h => /Дневник сахара/.test(h.innerText))
  const vesti = gh ? gh.querySelector('label.badge') : null
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { topDoc: Math.round(r.top + window.scrollY), h: Math.round(r.height), w: Math.round(r.width) } }
  
  const fs = vesti ? getComputedStyle(vesti).fontSize : null
  return { sec: box(sec), vesti: box(vesti), vestiText: vesti ? vesti.innerText.trim() : null, vestiFontSize: fs, docH: Math.round(document.documentElement.scrollHeight), vh: window.innerHeight, scale: document.documentElement.getAttribute('data-scale') || getComputedStyle(document.documentElement).getPropertyValue('--scale') }
})
const gNormal = await geom()
console.log('ГЕОМЕТРИЯ (обычный размер):', JSON.stringify(gNormal))
console.log('  экранов между ними:', ((gNormal.vesti.topDoc - gNormal.sec.topDoc) / gNormal.vh).toFixed(2))

// --- 3. очень крупный размер
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const b = btns.find(x => x.innerText.trim() === 'Очень крупный')
  b.click()
})
await page.waitForTimeout(500)
const gXl = await geom()
console.log('ГЕОМЕТРИЯ (очень крупный):', JSON.stringify(gXl))
console.log('  экранов между ними:', ((gXl.vesti.topDoc - gXl.sec.topDoc) / gXl.vh).toFixed(2))
// вернуть обычный
await page.evaluate(() => { const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Обычный'); b.click() })
await page.waitForTimeout(400)

// --- 4. влияет ли галочка «Сахар» хоть на что-то при trackGlucose=false
await openBp(); console.log('ДО: карточка-приглашение на «Давлении»:', await hasInvite())
await openSettings()
await page.evaluate(() => { const l=[...document.querySelectorAll('label.badge')].find(x=>/^Сахар/.test(x.innerText.trim())); l.querySelector('input').click() })
await page.waitForTimeout(400)
await openBp(); console.log('ПОСЛЕ СНЯТИЯ галочки «Сахар»: карточка-приглашение:', await hasInvite())
await openSettings()
await page.evaluate(() => { const l=[...document.querySelectorAll('label.badge')].find(x=>/^Сахар/.test(x.innerText.trim())); l.querySelector('input').click() })
await page.waitForTimeout(400)
await openBp(); console.log('ПОСЛЕ ВОЗВРАТА галочки «Сахар»: карточка-приглашение:', await hasInvite())

// --- 5. кнопка из карточки включает дневник
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
await page.waitForTimeout(200)
await page.screenshot({ path: `${OUT}/_gl_invite.png` })
await page.locator('button', { hasText: 'Включить дневник сахара' }).first().click()
await page.waitForTimeout(500)
console.log('ВКЛАДКИ ПОСЛЕ КНОПКИ:', JSON.stringify(await tabs()))
await openSettings()
const after = await page.evaluate(() => {
  const gh = [...document.querySelectorAll('.card__head')].find(h => /Дневник сахара/.test(h.innerText))
  return { vesti: gh.querySelector('input').checked }
})
console.log('«вести» после нажатия кнопки:', JSON.stringify(after))
const start = await page.$$eval('.segmented[aria-label="Стартовый экран"] button', els => els.map(e=>e.innerText.trim()))
console.log('«С чего открывать приложение» после включения:', JSON.stringify(start))

await browser.close()
