import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from './visual.mjs'
const URL = process.env.URL ?? 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2, ignoreHTTPSErrors: true })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction(['meta'],'readonly'); const g = tx.objectStore('meta').get('settings'); g.onsuccess = () => res(g.result || {}) })
  await new Promise((res, rej) => { const tx = db.transaction(['meta'],'readwrite'); tx.objectStore('meta').put({ ...cur, trackGlucose: true, onboarded: true }, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' })
await settle(page)
await go(page, { tool: 'Настройки' })
await page.waitForTimeout(600)
// вручную вставляем ровно ту разметку, которую даёт <Banner tone="critical"> при failed
const m = await page.evaluate(() => {
  const card = [...document.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent.includes('Сохранность'))
  const stack = card.querySelector(':scope > .stack')
  const b = document.createElement('div')
  b.className = 'banner banner--critical'
  b.innerHTML = '<span class="banner__icon" aria-hidden="true">⚠</span><div><b>Копии перестали сохраняться</b><div style="margin-top:4px">Файл для копий удалён, перемещён или доступ к нему отозван. Выберите файл заново — иначе новые записи останутся только в браузере.</div></div>'
  card.insertBefore(b, stack)
  const r = (el) => el.getBoundingClientRect()
  return {
    headBottom_to_criticalTop: +(r(b).top - r(card.querySelector('.card__head')).bottom).toFixed(2),
    criticalBottom_to_stackTop: +(r(stack).top - r(b).bottom).toFixed(2),
    criticalMargin: getComputedStyle(b).margin,
  }
})
console.log(JSON.stringify(m, null, 2))
const card = page.locator('.card').filter({ hasText: 'Сохранность данных' }).first()
await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(250)
await card.screenshot({ path: `${OUT}/rfban-failed.png` })
await browser.close()
