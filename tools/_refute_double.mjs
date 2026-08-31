/** Опровержение: реальный двойной тап по «Принял». */
import { chromium } from 'playwright'

const URL = 'http://localhost:4399'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()

const browser = await chromium.launch()

async function прогон(delay, throttle) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', deviceScaleFactor: 2, hasTouch: true,
  })
  const page = await ctx.newPage()
  if (throttle > 1) {
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
  }
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)

  // Ровно тот препарат, о котором говорит находка.
  await page.evaluate(async (now) => {
    const d = new Date(now); d.setHours(0,0,0,0); const day0 = d.getTime()
    const open = () => new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const db = await open()
    await new Promise((res, rej) => {
      const tx = db.transaction(['medicines','meta'], 'readwrite')
      tx.objectStore('medicines').clear()
      tx.objectStore('medicines').put({
        id: 'met', name: 'Метформин', dose: '850 мг', form: 'Таблетки',
        packSize: 60, left: 20, perDay: null, expires: Date.UTC(2027, 10, 30),
        times: ['08:00', '20:00'], perTime: 2, taken: [], since: day0 - 5*86400000,
      })
      for (let i = 1; i < 12; i++) {
        const marks = []; for (let k = -40; k < 0; k++) marks.push(day0 + k*86400000 + 9*3600000)
        tx.objectStore('medicines').put({ id: 'x'+i, name: 'Препарат '+i, dose: '10 мг', form: 'Таблетки', packSize: 30, left: 25, perDay: null, expires: Date.UTC(2027,4,31), times: ['09:00','21:00'], perTime: 1, taken: marks, since: day0 - 60*86400000 })
      }
      tx.objectStore('meta').put({ onboarded: true }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, FROZEN)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.getByRole('button', { name: 'Приём' }).first().click()
  await page.waitForTimeout(600)

  const btn = page.locator('.dose', { hasText: 'Метформин' }).locator('button.btn--primary').first()
  await btn.waitFor({ timeout: 10000 })
  const box = await btn.boundingBox()
  const x = box.x + box.width/2, y = box.y + box.height/2

  // Палец бьёт в одну и ту же точку экрана дважды — что бы там ни оказалось.
  await page.mouse.click(x, y)
  await page.waitForTimeout(delay)
  const всёЕщёКнопка = await page.evaluate(([x,y]) => {
    const el = document.elementFromPoint(x, y)
    return el ? `${el.tagName}.${el.className} «${(el.innerText||'').trim().slice(0,20)}»` : 'ничего'
  }, [x, y])
  await page.mouse.click(x, y)
  await page.waitForTimeout(1500)

  const итог = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const m = await new Promise((res) => { const tx = db.transaction('medicines','readonly'); const q = tx.objectStore('medicines').get('met'); q.onsuccess = () => res(q.result) })
    db.close()
    return { taken: (m.taken||[]).map(t => new Date(t).toTimeString().slice(0,5)), left: m.left }
  })
  const строки = await page.locator('.dose').filter({ hasText: 'Метформин' }).evaluateAll(
    (els) => els.map(e => e.innerText.replace(/\s+/g,' ').trim())
  )
  await ctx.close()
  return { итог, строки, всёЕщёКнопка }
}

for (const throttle of [20]) {
  for (const delay of [80, 120, 160, 200, 300]) {
    const r = await прогон(delay, throttle)
    const дубль = r.итог.taken.length > 1
    console.log(`CPU x${throttle}  пауза ${String(delay).padStart(3)}мс | taken=${JSON.stringify(r.итог.taken)} left=${r.итог.left} | ${дубль ? '### ДУБЛЬ ###' : 'ок'} | под пальцем ко 2-му тапу: ${r.всёЕщёКнопка}`)
    if (дубль) console.log('     строки:', JSON.stringify(r.строки))
  }
}
await browser.close()
