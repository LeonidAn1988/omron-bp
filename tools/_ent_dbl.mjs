/**
 * Опыт: даёт ли двойное нажатие «Добавить» две записи давления.
 * Настоящий браузер, настоящая IndexedDB, настоящие клики.
 */
import { chromium } from 'playwright'

const URL = 'http://localhost:4321'
const GAPS = process.env.GAPS ? process.env.GAPS.split(',').map(Number) : [0, 30, 60, 100, 150, 250, 400]
const CPU = Number(process.env.CPU ?? 1)
const SEED = Number(process.env.SEED ?? 0)   // сколько записей уже в дневнике

const seed = async (page, n) => page.evaluate(async (count) => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  await new Promise((res, rej) => {
    const tx = db.transaction(['readings', 'meta'], 'readwrite')
    const st = tx.objectStore('readings')
    st.clear()
    const base = Date.now() - count * 3600000
    for (let i = 0; i < count; i++) {
      st.put({ kind: 'bp', id: `seed-${i}`, ts: base + i * 3600000, sys: 120 + (i % 20), dia: 78 + (i % 10), bpm: 70, ihb: false, mov: false, user: 1, source: 'manual' })
    }
    tx.objectStore('meta').put({ onboarded: true, trackGlucose: false }, 'settings')
    tx.oncomplete = res; tx.onerror = () => rej(tx.error)
  })
  db.close()
}, n)

const readBp = (page) => page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const all = await new Promise((res) => { const tx = db.transaction('readings', 'readonly'); const q = tx.objectStore('readings').getAll(); q.onsuccess = () => res(q.result) })
  db.close()
  const manual = all.filter((m) => m.kind === 'bp' && String(m.id).startsWith('m-'))
  return { manual: manual.map((m) => ({ id: m.id, ts: m.ts, sys: m.sys, dia: m.dia })), total: all.length }
})

const browser = await chromium.launch()
console.log(`посев=${SEED} записей, cpu=x${CPU}`)
for (const gap of GAPS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
  const page = await ctx.newPage()
  if (CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }) }
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await seed(page, SEED)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
  await page.waitForTimeout(400)

  const form = page.locator('form.card', { hasText: 'Записать измерение' })
  await form.locator('input').first().fill('137')
  await form.locator('input').nth(1).fill('88')
  await page.waitForTimeout(200)

  const btn = form.locator('button[type=submit]', { hasText: 'Добавить' })
  const box = await btn.boundingBox()
  if (!box) { console.log(`gap=${gap}: кнопки нет`); await ctx.close(); continue }
  const x = box.x + box.width / 2, y = box.y + box.height / 2

  // засекаем, через сколько миллисекунд появляется подтверждение «Записано»
  await page.evaluate(() => {
    window.__t0 = performance.now(); window.__ack = null
    window.__obs = new MutationObserver(() => {
      if (window.__ack === null && document.body.innerText.includes('Записано:')) window.__ack = performance.now() - window.__t0
    })
    window.__obs.observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  await page.mouse.click(x, y)
  if (gap > 0) await page.waitForTimeout(gap)
  await page.mouse.click(x, y)          // второй клик ровно в ту же точку
  await page.waitForTimeout(1800)

  const ack = await page.evaluate(() => window.__ack)
  const r = await readBp(page)
  const stamps = r.manual.map((m) => `${m.sys}/${m.dia}@${new Date(m.ts).toTimeString().slice(0, 8)}`)
  console.log(`gap=${String(gap).padStart(3)}мс | ручных записей=${r.manual.length} ${r.manual.length > 1 ? '<<< ДУБЛЬ' : ''} | [${stamps}] | «Записано» через ${ack === null ? '?' : Math.round(ack)}мс`)
  await ctx.close()
}
await browser.close()
