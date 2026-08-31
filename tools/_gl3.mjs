import { chromium } from 'playwright'
const URL = 'http://localhost:5471'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()

async function seed(page, withGlucose) {
  await page.evaluate(async ({now, withGlucose}) => {
    const DAY = 86400000
    const d = new Date(now); d.setHours(0,0,0,0); const day0 = d.getTime()
    const at = (o,h) => day0 + o*DAY + h*3600000
    const readings = []
    for (let i=-29;i<=0;i++) {
      readings.push({ id:`bp-${i}`, kind:'bp', ts:at(i,8)+600000, user:1, source:'manual', sys:128+((i%7)+7)%7, dia:82, bpm:70, ihb:false, mov:false })
      if (withGlucose && i%2===0) readings.push({ id:`gl-${i}`, kind:'glucose', ts:at(i,7)+300000, user:1, source:'manual', mmol:5.4+(((i%6)+6)%6)*0.4, context: i%4===0?'fasting':'after-meal' })
    }
    const medicines = [{ id:'m1', name:'Конкор', dose:'5 мг', inn:'Бисопролол', form:'Таблетки', maker:'Мерк', packSize:30, left:12, perDay:null, expires:Date.UTC(2027,4,31), times:['08:00'], perTime:1, taken:[] }]
    const db = await new Promise((res,rej)=>{ const r=indexedDB.open('omron-bp',3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
    await new Promise((res,rej)=>{ const tx=db.transaction(['medicines','readings','meta'],'readwrite')
      medicines.forEach(m=>tx.objectStore('medicines').put(m)); readings.forEach(r=>tx.objectStore('readings').put(r))
      tx.objectStore('meta').put({ onboarded:true }, 'settings')
      tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
    db.close()
  }, {now, withGlucose})
}

async function session(withGlucose, fn) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.app', { timeout: 15000 }); await page.waitForTimeout(500)
  await seed(page, withGlucose)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 15000 }); await page.waitForTimeout(500)
  await fn(page)
  await browser.close()
}
const now = FROZEN

// A. 30 замеров давления, сахара нет — где карточка-приглашение
await session(false, async (page) => {
  await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
  await page.waitForTimeout(400)
  const info = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.card')].find(el => /Ведёте ещё и сахар/.test(el.innerText))
    const r = c && c.getBoundingClientRect()
    return c ? { topDoc: Math.round(r.top+window.scrollY), docH: Math.round(document.documentElement.scrollHeight), vh: window.innerHeight } : null
  })
  console.log('A. 30 записей давления, сахара нет — карточка «Ведёте ещё и сахар?»:', JSON.stringify(info),
    info ? ` = ${(info.topDoc/info.vh).toFixed(2)} экрана от верха вкладки` : '')
  await page.evaluate(() => { const c=[...document.querySelectorAll('.card')].find(el=>/Ведёте ещё и сахар/.test(el.innerText)); c.scrollIntoView({block:'center'}) })
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/_gl_invite30.png` })
})

// B. есть замеры сахара -> trackGlucose поднимается сам; выключаем «вести» на живую
await session(true, async (page) => {
  const tabs = () => page.$$eval('nav.tabs button', els => els.map(e => e.innerText.replace(/\s+/g,' ').trim()))
  console.log('B. со старта (замеры сахара есть):', JSON.stringify(await tabs()))
  await page.locator('header button', { hasText: 'Настройки' }).first().click(); await page.waitForTimeout(400)
  const before = await page.evaluate(() => {
    const gh = [...document.querySelectorAll('.card__head')].find(h => /Дневник сахара/.test(h.innerText))
    return gh.querySelector('input').checked })
  console.log('   «вести» при старте:', before)
  await page.evaluate(() => { const gh=[...document.querySelectorAll('.card__head')].find(h=>/Дневник сахара/.test(h.innerText)); gh.querySelector('input').click() })
  await page.waitForTimeout(400)
  const start = await page.$$eval('.segmented[aria-label="Стартовый экран"] button', els=>els.map(e=>e.innerText.trim()))
  console.log('   после снятия «вести»: вкладки =', JSON.stringify(await tabs()), '| стартовый экран =', JSON.stringify(start))
  const secRow = await page.evaluate(() => { const l=[...document.querySelectorAll('label.badge')].find(x=>/^Сахар/.test(x.innerText.trim())); return { checked:l.querySelector('input').checked, disabled:l.querySelector('input').disabled } })
  console.log('   строка «Сахар» в Разделах:', JSON.stringify(secRow))
  // перезагрузка
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 15000 }); await page.waitForTimeout(500)
  await page.locator('header button', { hasText: 'Настройки' }).first().click(); await page.waitForTimeout(400)
  const after = await page.evaluate(() => {
    const gh = [...document.querySelectorAll('.card__head')].find(h => /Дневник сахара/.test(h.innerText))
    return gh.querySelector('input').checked })
  console.log('   после перезагрузки «вести» =', after, '| вкладки =', JSON.stringify(await tabs()))
})
