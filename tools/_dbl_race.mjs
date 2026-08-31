/**
 * Опыт: можно ли живым двойным касанием получить две отметки на один приём.
 * Реальный браузер, реальная IndexedDB, реальные клики мышью.
 */
import { chromium } from 'playwright'

const URL = process.env.URL ?? 'http://localhost:4455'
const GAPS = process.env.GAPS ? process.env.GAPS.split(',').map(Number) : [0, 30, 60, 100, 150, 250, 400]
const CPU = Number(process.env.CPU ?? 1)

const seedOne = async (page) => {
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    await new Promise((res, rej) => {
      const tx = db.transaction(['medicines', 'meta'], 'readwrite')
      const st = tx.objectStore('medicines')
      st.clear()
      st.put({
        id: 'mx', name: 'Метформин', dose: '850 мг', inn: 'Метформин', form: 'Таблетки',
        maker: 'Гедеон Рихтер', packSize: 60, left: 20, perDay: null,
        times: ['08:00', '20:00'], perTime: 2, taken: [], since: Date.now() - 10 * 86400000,
        leftAt: Date.now() - 3 * 86400000,
      })
      tx.objectStore('meta').put({ onboarded: true }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  })
}

const readMed = (page) => page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const m = await new Promise((res) => { const tx = db.transaction('medicines', 'readonly'); const q = tx.objectStore('medicines').get('mx'); q.onsuccess = () => res(q.result) })
  db.close()
  const hhmm = (t) => new Date(t).toTimeString().slice(0, 5)
  return { taken: (m.taken ?? []).map(hhmm), left: m.left }
})

const browser = await chromium.launch()
for (const gap of GAPS) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
  const page = await ctx.newPage()
  if (CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }) }
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await seedOne(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.locator('nav.tabs button', { hasText: 'Приём' }).first().click()
  await page.waitForTimeout(500)

  // утренняя строка (08:00) — карточка «Утро»
  const morning = page.locator('.card.intake', { hasText: 'Утро' }).locator('.dose', { hasText: 'Метформин' }).locator('button.btn--primary').first()
  const box = await morning.boundingBox()
  if (!box) { console.log(`gap=${gap}: кнопки нет`); await ctx.close(); continue }
  const x = box.x + box.width / 2, y = box.y + box.height / 2

  // ставим наблюдателя: когда исчезнет кнопка «Принял» в утренней строке
  await page.evaluate(() => {
    window.__t0 = null; window.__gone = null
    const li = [...document.querySelectorAll('.card.intake')].find((c) => c.innerText.includes('Утро'))
    window.__obs = new MutationObserver(() => {
      const row = [...li.querySelectorAll('.dose')].find((d) => d.innerText.includes('Метформин'))
      if (row && !row.querySelector('button.btn--primary') && window.__t0 && window.__gone === null) window.__gone = performance.now() - window.__t0
    })
    window.__obs.observe(li, { childList: true, subtree: true, characterData: true })
  })
  await page.evaluate(() => { window.__t0 = performance.now() })
  await page.mouse.click(x, y)
  await page.waitForTimeout(gap)
  // второй клик ровно в ту же точку — так и падает палец при двойном касании
  await page.mouse.click(x, y)
  await page.waitForTimeout(1500)

  const gone = await page.evaluate(() => window.__gone)
  const med = await readMed(page)
  const cardText = (sel) => page.locator('.card.intake', { hasText: sel }).innerText()
  const morningTxt = (await cardText('Утро')).replace(/\s+/g, ' ')
  const eveningTxt = (await cardText('Вечер')).replace(/\s+/g, ' ')
  console.log(`gap=${String(gap).padStart(3)}мс cpu=x${CPU} | отметки=[${med.taken}] остаток=${med.left} | кнопка пропала через ${gone === null ? '?' : Math.round(gone)}мс`)
  console.log(`         утро:  ${morningTxt}`)
  console.log(`         вечер: ${eveningTxt}`)
  await ctx.close()
}
await browser.close()
