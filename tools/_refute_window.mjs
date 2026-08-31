/** Насколько широко окно: от первого клика до исчезновения кнопки. */
import { chromium } from 'playwright'
const URL = 'http://localhost:4399'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()
const browser = await chromium.launch()

async function измерить(throttle, шт) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', hasTouch: true })
  const page = await ctx.newPage()
  if (throttle > 1) { const c = await ctx.newCDPSession(page); await c.send('Emulation.setCPUThrottlingRate', { rate: throttle }) }
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.evaluate(async ([now, шт]) => {
    const d = new Date(now); d.setHours(0,0,0,0); const day0 = d.getTime()
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    await new Promise((res, rej) => {
      const tx = db.transaction(['medicines','meta'], 'readwrite')
      tx.objectStore('medicines').clear()
      tx.objectStore('medicines').put({ id: 'met', name: 'Метформин', dose: '850 мг', form: 'Таблетки', packSize: 60, left: 20, perDay: null, expires: Date.UTC(2027,10,30), times: ['08:00','20:00'], perTime: 2, taken: [], since: day0 - 5*86400000 })
      // остальная аптечка — чтобы перерисовка была не игрушечной
      for (let i = 1; i < шт; i++) {
        const marks = []; for (let k = -40; k < 0; k++) marks.push(day0 + k*86400000 + 9*3600000)
        tx.objectStore('medicines').put({ id: 'x'+i, name: 'Препарат '+i, dose: '10 мг', form: 'Таблетки', packSize: 30, left: 25, perDay: null, expires: Date.UTC(2027,4,31), times: ['09:00','21:00'], perTime: 1, taken: marks, since: day0 - 60*86400000 })
      }
      tx.objectStore('meta').put({ onboarded: true }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, [FROZEN, шт])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.getByRole('button', { name: 'Приём' }).first().click()
  await page.waitForTimeout(700)
  const btn = page.locator('.dose', { hasText: 'Метформин' }).locator('button.btn--primary').first()
  await btn.waitFor({ timeout: 10000 })
  const box = await btn.boundingBox()
  const x = box.x + box.width/2, y = box.y + box.height/2

  // проще и честнее: замер через ожидание исчезновения
  const t0 = Date.now()
  await page.mouse.click(x, y)
  await page.waitForFunction(([x,y]) => { const el = document.elementFromPoint(x,y); return !el || el.tagName !== 'BUTTON' }, [x,y], { timeout: 10000, polling: 'raf' })
  const ширина = Date.now() - t0
  await ctx.close()
  return ширина
}

for (const шт of [1, 12]) for (const t of [1, 8, 20]) {
  const пробы = []
  for (let i = 0; i < 2; i++) пробы.push(await измерить(t, шт))
  console.log(`аптечка ${String(шт).padStart(2)} преп.  CPU x${String(t).padStart(2)}  окно, мс: ${пробы.join(', ')}`)
}
await browser.close()
