/**
 * Полная аптечка (8 препаратов, 60 дней отметок) — как у настоящего человека.
 * Опыт 1: двойное касание «Принял».
 * Опыт 2: «Принял всё», а следом палец по строке, до которой цикл ещё не дошёл.
 */
import { chromium } from 'playwright'

const URL = process.env.URL ?? 'http://localhost:4455'
const CPU = Number(process.env.CPU ?? 6)
const N = Number(process.env.N ?? 6)
const MODE = process.env.MODE ?? 'dbl'
const GAPS = (process.env.GAPS ?? '80,120,200,300').split(',').map(Number)

const reset = (page) => page.evaluate(async () => {
  const DAY = 86400000
  const midnight = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
  const day0 = midnight(Date.now())
  const at = (o, h) => day0 + o * DAY + h * 3600000
  const marks = (hours, skip = []) => {
    const out = []
    for (let i = -59; i < 0; i++) for (const h of hours) if (!skip.includes(i)) out.push(at(i, h))
    return out
  }
  const meds = [
    { id: 'm1', name: 'Конкор', dose: '5 мг', times: ['08:00'], perTime: 1, left: 18, taken: marks([8]) },
    { id: 'm2', name: 'Лозартан', dose: '50 мг', times: ['08:00', '20:00'], perTime: 1, left: 22, taken: marks([8, 20]) },
    { id: 'm3', name: 'Кардиомагнил', dose: '75 мг', times: ['08:00'], perTime: 1, left: 30, taken: marks([8]) },
    { id: 'm4', name: 'Тиоктовая кислота', dose: '600 мг', times: ['08:00'], perTime: 1, left: 12, taken: marks([8]) },
    { id: 'm5', name: 'Аллопуринол', dose: '100 мг', times: ['08:00'], perTime: 1, left: 25, taken: marks([8]) },
    { id: 'm6', name: 'Пантопразол', dose: '20 мг', times: ['08:00'], perTime: 1, left: 14, taken: marks([8]) },
    { id: 'm7', name: 'Фолиевая кислота', dose: '1 мг', times: ['08:00'], perTime: 1, left: 40, taken: marks([8]) },
    { id: 'm8', name: 'Магний B6', dose: '', times: ['08:00'], perTime: 1, left: 33, taken: marks([8]) },
    { id: 'm9', name: 'Верошпирон', dose: '25 мг', times: ['08:00'], perTime: 1, left: 19, taken: marks([8]) },
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
  const DAY = 86400000
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
const cdp = await ctx.newCDPSession(page)
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)

const prepare = async () => {
  await reset(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 30000 })
  await page.locator('nav.tabs button', { hasText: 'Приём' }).first().click()
  await page.waitForSelector('.card.intake', { timeout: 20000 })
  await page.waitForTimeout(500)
}

for (const gap of GAPS) {
  let dup = 0, falseEvening = 0
  const times = []
  for (let i = 0; i < N; i++) {
    await prepare()
    const card = page.locator('.card.intake', { hasText: 'Утро' })
    const row = card.locator('.dose', { hasText: 'Метформин' })
    const btn = row.locator('button.btn--primary').first()
    const box = await btn.boundingBox()
    const x = box.x + box.width / 2, y = box.y + box.height / 2
    await page.evaluate(() => {
      window.__gone = null
      const c = [...document.querySelectorAll('.card.intake')].find((e) => e.innerText.includes('Утро'))
      window.__t0 = performance.now()
      new MutationObserver(() => {
        const r = [...c.querySelectorAll('.dose')].find((d) => d.innerText.includes('Метформин'))
        if (r && !r.querySelector('button.btn--primary') && window.__gone === null) window.__gone = performance.now() - window.__t0
      }).observe(c, { childList: true, subtree: true, characterData: true })
    })
    if (MODE === 'dbl') {
      await page.mouse.click(x, y)
      await page.waitForTimeout(gap)
      await page.mouse.click(x, y)
    } else {
      // «Принял всё», а через gap мс — палец по строке метформина
      await card.locator('button.btn--primary', { hasText: 'Принял всё' }).click({ noWaitAfter: true })
      await page.waitForTimeout(gap)
      await page.mouse.click(x, y)
    }
    await page.waitForTimeout(2500)
    const t = await page.evaluate(() => window.__gone)
    if (t !== null) times.push(t)
    const all = await readAll(page)
    const met = all.find((m) => m.name === 'Метформин')
    const dupNames = all.filter((m) => m.today.filter((h) => h === '08:00').length > 1).map((m) => m.name)
    const total = all.reduce((a, m) => a + m.today.length, 0)
    if (dupNames.length) { dup++; console.log(`      дубль у: ${dupNames.join(', ')} (всего отметок за день ${total})`) }
    const eve = await page.locator('.card.intake', { hasText: 'Вечер' }).innerText()
    if (/Метформин[\s\S]*?принято/.test(eve.replace(/\s+/g, ' '))) falseEvening++
    if (i === 0) console.log(`   пример: отметки метформина сегодня = [${met.today}] остаток=${met.left}`)
  }
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : NaN
  console.log(`${MODE} cpu=x${CPU} пауза=${String(gap).padStart(4)}мс: дублей ${dup}/${N}, ложный вечер ${falseEvening}/${N}, строка обновляется за ${avg}мс`)
}
await browser.close()
