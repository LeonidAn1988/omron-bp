import { chromium } from 'playwright'
const URL = process.env.URL ?? 'http://localhost:4455'
const CPU = Number(process.env.CPU ?? 1)
const N = Number(process.env.N ?? 20)
const LO = Number(process.env.LO ?? 90), HI = Number(process.env.HI ?? 400)

const reset = (page) => page.evaluate(async () => {
  const DAY = 86400000
  const midnight = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
  const day0 = midnight(Date.now())
  const at = (o, h) => day0 + o * DAY + h * 3600000
  const marks = (hours) => { const out = []; for (let i = -59; i < 0; i++) for (const h of hours) out.push(at(i, h)); return out }
  const meds = [
    { id: 'm2', name: 'Конкор', dose: '5 мг', times: ['08:00'], perTime: 1, left: 18, taken: marks([8]) },
    { id: 'm3', name: 'Лозартан', dose: '50 мг', times: ['08:00', '20:00'], perTime: 1, left: 22, taken: marks([8, 20]) },
    { id: 'm5', name: 'Кардиомагнил', dose: '75 мг', times: ['08:00'], perTime: 1, left: 30, taken: marks([8]) },
    { id: 'm6', name: 'Тиоктовая', dose: '600 мг', times: ['08:00'], perTime: 1, left: 12, taken: marks([8]) },
    { id: 'mx', name: 'Метформин', dose: '850 мг', times: ['08:00', '20:00'], perTime: 2, left: 20, taken: marks([8, 20]) },
  ]
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  await new Promise((res, rej) => {
    const tx = db.transaction(['medicines', 'meta'], 'readwrite')
    const st = tx.objectStore('medicines'); st.clear()
    for (const m of meds) st.put({ inn: m.name, form: 'Таблетки', maker: 'Озон', packSize: 60, perDay: null, since: day0 - 70 * DAY, leftAt: Date.now() - 3600000, ...m })
    tx.objectStore('meta').put({ onboarded: true }, 'settings')
    tx.oncomplete = res; tx.onerror = () => rej(tx.error)
  })
  db.close()
})
const readAll = (page) => page.evaluate(async () => {
  const midnight = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
  const day0 = midnight(Date.now())
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const all = await new Promise((res) => { const tx = db.transaction('medicines', 'readonly'); const q = tx.objectStore('medicines').getAll(); q.onsuccess = () => res(q.result) })
  db.close()
  return all.map((m) => ({ name: m.name, left: m.left, today: (m.taken ?? []).filter((t) => t >= day0).map((t) => new Date(t).toTimeString().slice(0, 5)) }))
})

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
const page = await ctx.newPage()
if (CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }) }
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)
let dup = 0, wrong = 0, eve = 0
const gaps = []
for (let i = 0; i < N; i++) {
  await reset(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 30000 })
  await page.locator('nav.tabs button', { hasText: 'Приём' }).first().click()
  await page.waitForSelector('.card.intake', { timeout: 20000 })
  await page.waitForTimeout(400)
  const gap = Math.round(LO + Math.random() * (HI - LO)); gaps.push(gap)
  const btn = page.locator('.card.intake', { hasText: 'Утро' }).locator('.dose', { hasText: 'Метформин' }).locator('button.btn--primary').first()
  const box = await btn.boundingBox()
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.click(x, y)
  await page.waitForTimeout(gap)
  await page.mouse.click(x, y)
  await page.waitForTimeout(1500)
  const all = await readAll(page)
  const met = all.find((m) => m.name === 'Метформин')
  if (met.today.filter((h) => h === '08:00').length > 1) dup++
  const others = all.filter((m) => m.name !== 'Метформин' && m.today.length > 0)
  if (others.length) wrong++
  const eveTxt = (await page.locator('.card.intake', { hasText: 'Вечер' }).innerText()).replace(/\s+/g, ' ')
  if (/Метформин 850 мг 2 шт\. ✓ принято/.test(eveTxt)) eve++
  if (i === 0) console.log('после первого опыта:', JSON.stringify(all.map((m) => `${m.name}: [${m.today}] ост.${m.left}`)), '| вечер:', eveTxt)
}
console.log(`cpu=x${CPU}: ${N} двойных касаний, паузы ${LO}–${HI}мс (${gaps.join(',')})`)
console.log(`  двойных отметок: ${dup}/${N}; ложно отмечен вечер: ${eve}/${N}; задет соседний препарат: ${wrong}/${N}`)
await browser.close()
