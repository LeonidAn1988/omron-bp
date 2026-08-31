// Двойное нажатие по МАССОВОЙ кнопке «Принял всё» — эталон из находки.
import { chromium } from 'playwright'
const URL = 'http://localhost:5199'

async function seed(page) {
  await page.evaluate(async () => {
    const DAY = 86_400_000
    const now = Date.now()
    const midnight = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime() }
    const day0 = midnight(now)
    const at = (o, h) => day0 + o * DAY + h * 3_600_000
    const marks = []
    for (let i = -10; i < 0; i++) { marks.push(at(i, 8)) }
    const base = (id, name) => ({
      id, name, dose: '850 мг', inn: name, form: 'Таблетки', maker: 'X',
      packSize: 60, left: 30, perDay: null, expires: Date.UTC(2027, 10, 30),
      times: ['08:00'], perTime: 2, meal: 'after', autoDeduct: false,
      taken: [...marks], leftAt: at(-1, 8) + 60_000, since: at(-30, 0),
    })
    const medicines = [base('a', 'Метформин'), base('b', 'Лозартан'), base('c', 'Конкор')]
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    await new Promise((res, rej) => {
      const tx = db.transaction(['medicines','readings','meta'], 'readwrite')
      tx.objectStore('medicines').clear()
      tx.objectStore('meta').put({ onboarded: true }, 'settings')
      medicines.forEach(m => tx.objectStore('medicines').put(m))
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  })
}
async function dump(page) {
  return page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    const all = await new Promise((res, rej) => {
      const q = db.transaction('medicines').objectStore('medicines').getAll()
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error)
    })
    db.close()
    const midnight = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime() }
    const today = midnight(Date.now())
    return all.map(m => `${m.name}: left=${m.left} отметокСегодня=${(m.taken??[]).filter(t=>t>=today&&t<today+86400000).length}`)
  })
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
const page = await ctx.newPage()
const CPU = Number(process.env.CPU ?? 1)
if (CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }) }
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await seed(page)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 30000 })
await page.waitForTimeout(600)
await page.locator('nav.tabs button', { hasText: 'Приём' }).first().click()
await page.waitForTimeout(600)

console.log('ДО:', JSON.stringify(await dump(page)))
const btn = page.locator('button', { hasText: 'Принял всё' }).first()
const box = await btn.boundingBox()
const GAP = Number(process.env.GAP ?? 0)
await page.mouse.move(box.x + box.width/2, box.y + box.height/2)
await page.mouse.down(); await page.mouse.up()
await page.waitForTimeout(GAP)
await page.mouse.down(); await page.mouse.up()
await page.waitForTimeout(3000)
console.log(`CPU=${CPU}x GAP=${GAP} ПОСЛЕ:`, JSON.stringify(await dump(page)))
await browser.close()
