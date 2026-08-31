/** Многократные попытки поймать двойную отметку живым двойным касанием. */
import { chromium } from 'playwright'

const URL = process.env.URL ?? 'http://localhost:4455'
const GAPS = (process.env.GAPS ?? '40,60,80,100,120').split(',').map(Number)
const N = Number(process.env.N ?? 10)
const CPU = Number(process.env.CPU ?? 1)

const reset = (page) => page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  await new Promise((res, rej) => {
    const tx = db.transaction(['medicines', 'meta'], 'readwrite')
    const st = tx.objectStore('medicines'); st.clear()
    st.put({ id: 'mx', name: 'Метформин', dose: '850 мг', inn: 'Метформин', form: 'Таблетки', maker: 'Гедеон Рихтер',
      packSize: 60, left: 20, perDay: null, times: ['08:00', '20:00'], perTime: 2, taken: [],
      since: Date.now() - 10 * 86400000, leftAt: Date.now() - 3600000 })
    tx.objectStore('meta').put({ onboarded: true }, 'settings')
    tx.oncomplete = res; tx.onerror = () => rej(tx.error)
  })
  db.close()
})

const readMed = (page) => page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const m = await new Promise((res) => { const tx = db.transaction('medicines', 'readonly'); const q = tx.objectStore('medicines').get('mx'); q.onsuccess = () => res(q.result) })
  db.close()
  return { n: (m.taken ?? []).length, left: m.left }
})

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
const page = await ctx.newPage()
if (CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }) }
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)

for (const gap of GAPS) {
  let dup = 0, evening = 0
  const times = []
  for (let i = 0; i < N; i++) {
    await reset(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('nav.tabs', { timeout: 20000 })
    await page.locator('nav.tabs button', { hasText: 'Приём' }).first().click()
    await page.waitForSelector('.card.intake', { timeout: 10000 })
    await page.waitForTimeout(300)
    const btn = page.locator('.card.intake', { hasText: 'Утро' }).locator('.dose', { hasText: 'Метформин' }).locator('button.btn--primary').first()
    const box = await btn.boundingBox()
    const x = box.x + box.width / 2, y = box.y + box.height / 2
    await page.evaluate(() => {
      window.__gone = null
      const card = [...document.querySelectorAll('.card.intake')].find((c) => c.innerText.includes('Утро'))
      window.__t0 = performance.now()
      new MutationObserver(() => {
        const row = [...card.querySelectorAll('.dose')].find((d) => d.innerText.includes('Метформин'))
        if (row && !row.querySelector('button.btn--primary') && window.__gone === null) window.__gone = performance.now() - window.__t0
      }).observe(card, { childList: true, subtree: true, characterData: true })
    })
    await page.mouse.click(x, y)
    await page.waitForTimeout(gap)
    await page.mouse.click(x, y)
    await page.waitForTimeout(1200)
    const t = await page.evaluate(() => window.__gone)
    if (t !== null) times.push(t)
    const med = await readMed(page)
    if (med.n > 1) dup++
    const eveTxt = await page.locator('.card.intake', { hasText: 'Вечер' }).innerText()
    if (eveTxt.includes('принято')) evening++
  }
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : NaN
  console.log(`cpu=x${CPU} gap=${String(gap).padStart(4)}мс: дублей ${dup}/${N}, вечер ложно отмечен ${evening}/${N} (кнопка исчезает в среднем за ${avg}мс)`)
}
await browser.close()
