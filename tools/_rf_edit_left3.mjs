/** Последняя деталь: после потери since «Приём» краснеет за прошлые месяцы? */
import { chromium } from 'playwright'
const URL = 'http://localhost:5199'; const DAY = 86400000
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 412, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200)
const NOW = Date.now()
async function put(withSince) {
  await page.evaluate(async ([now, DAY, withSince]) => {
    const med = { id: 'med-1', name: 'Амлодипин', dose: '5 мг', form: 'Таблетки', packSize: 30,
      left: 33, leftAt: now - 30 * DAY, perDay: null, times: ['08:00'], perTime: 1,
      expires: Date.UTC(2027, 4, 31), taken: [] }
    if (withSince) med.since = now - 3 * DAY      // заведён 3 дня назад
    const db = await new Promise((r2) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => r2(r.result) })
    await new Promise((r2) => { const tx = db.transaction(['medicines','meta'],'readwrite')
      tx.objectStore('medicines').clear(); tx.objectStore('medicines').put(med)
      tx.objectStore('meta').put({ onboarded: true, textScale: 'normal', density: 'normal' }, 'settings'); tx.oncomplete = r2 })
    db.close()
  }, [NOW, DAY, withSince])
}
async function missedDays() {
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('nav.tabs', { timeout: 15000 })
  await page.locator('nav.tabs button', { hasText: 'Приём' }).first().click(); await page.waitForTimeout(700)
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('.daystrip__day')]
    const count = (s) => all.filter((el) => el.dataset.status === s).length
    return { всего: all.length, empty: count('empty'), missed: count('missed'), pending: count('pending'), done: count('done'), future: count('future') }
  })
}
await put(true);  console.log('с since (заведён 3 дня назад):', JSON.stringify(await missedDays()))
await put(false); console.log('без since (как после правки) :', JSON.stringify(await missedDays()))
await browser.close()
