import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = process.env.U || 'http://localhost:5261'
const browser = await chromium.launch()
const out = {}
for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: scheme, deviceScaleFactor: 2, ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await seed(page, FROZEN)
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.onboarded = true; cur.theme = 'auto'
    await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await go(page, { tool: 'Настройки' })
  await page.waitForTimeout(400)

  // доступное имя каждого чекбокса — как его объявит скринридер
  const names = await page.locator('.card', { has: page.locator('h2', { hasText: 'Разделы' }) }).ariaSnapshot()

  // контраст заголовка и пояснения на фоне карточки
  const contrast = await page.evaluate(() => {
    const lum = (c) => { const [r, g, b] = c.match(/\d+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2) }
    const card = [...document.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent.trim() === 'Разделы')
    const bg = getComputedStyle(card).backgroundColor
    const lab = card.querySelector('label')
    const span = lab.querySelector('span'), note = lab.querySelector('.fact__note')
    const box = lab.querySelector('input')
    // то же самое в знакомстве — для сравнения размеров
    return {
      cardBg: bg,
      titleColor: getComputedStyle(span).color, titleContrast: ratio(getComputedStyle(span).color, bg), titleFs: getComputedStyle(span).fontSize,
      noteColor: getComputedStyle(note).color, noteContrast: ratio(getComputedStyle(note).color, bg), noteFs: getComputedStyle(note).fontSize,
      boxAccent: getComputedStyle(box).accentColor,
      tapH: +lab.getBoundingClientRect().height.toFixed(1),
      tapW: +lab.getBoundingClientRect().width.toFixed(1),
      cursor: getComputedStyle(lab).cursor,
      minH: getComputedStyle(lab).minHeight,
    }
  })

  // клавиатура: фокус доходит до каждого чекбокса, пробел переключает
  await page.evaluate(() => { const c = [...document.querySelectorAll('.card')].find((x) => x.querySelector('h2')?.textContent.trim() === 'Разделы'); c.querySelectorAll('input')[3].focus() })
  const beforeKb = await page.evaluate(() => [...document.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent.trim() === 'Разделы').querySelectorAll('input')[3].checked)
  await page.keyboard.press('Space')
  await page.waitForTimeout(150)
  const afterKb = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.card')].find((x) => x.querySelector('h2')?.textContent.trim() === 'Разделы')
    return { third: c.querySelectorAll('input')[3].checked, all: [...c.querySelectorAll('input')].map((i) => i.checked), tabs: [...document.querySelectorAll('nav.tabs button, nav.tabs a')].map((b) => b.textContent.trim()) }
  })

  out[scheme] = { names, contrast, kb: { before: beforeKb, after: afterKb } }
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(out, null, 1))
