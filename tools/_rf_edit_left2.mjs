/** Добавка: чем предзаполнено «Поправить остаток» в карточке? */
import { chromium } from 'playwright'
const URL = 'http://localhost:5199'; const DAY = 86400000
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 412, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200)
const NOW = Date.now()
await page.evaluate(async ([now, DAY]) => {
  const med = { id: 'med-1', name: 'Амлодипин', dose: '5 мг', form: 'Таблетки', inn: 'Амлодипин',
    maker: 'Гедеон Рихтер', packSize: 30, left: 33, leftAt: now - 30 * DAY, perDay: null,
    times: ['08:00'], perTime: 1, expires: Date.UTC(2027, 4, 31), since: now - 60 * DAY, taken: [] }
  const db = await new Promise((res) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result) })
  await new Promise((res) => { const tx = db.transaction(['medicines','meta'],'readwrite')
    tx.objectStore('medicines').clear(); tx.objectStore('medicines').put(med)
    tx.objectStore('meta').put({ onboarded: true, textScale: 'normal', density: 'normal' }, 'settings'); tx.oncomplete = res })
  db.close()
}, [NOW, DAY])
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 15000 })
await page.locator('nav.tabs button', { hasText: 'Аптечка' }).first().click(); await page.waitForTimeout(500)
await page.locator('button, [role=button], a').filter({ hasText: 'Амлодипин' }).first().click(); await page.waitForTimeout(500)
console.log('карточка показывает остаток:', (await page.locator('.detail__row').filter({ hasText: 'Остаток' }).first().innerText()).replace(/\n/g,' / '))
await page.locator('button').filter({ hasText: 'Поправить остаток' }).first().click(); await page.waitForTimeout(400)
const f = page.locator('.numfield').filter({ hasText: 'Сколько осталось' }).locator('input').first()
console.log('поле правки предзаполнено:', JSON.stringify(await f.inputValue()))
await page.locator('button').filter({ hasText: /^Сохранить|^Готово|^ОК/ }).first().click(); await page.waitForTimeout(800)
const rec = await page.evaluate(async () => { const db = await new Promise((r2) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => r2(r.result) })
  const all = await new Promise((r2) => { const rq = db.transaction('medicines','readonly').objectStore('medicines').getAll(); rq.onsuccess = () => r2(rq.result) }); db.close(); return all[0] })
console.log('после «Сохранить» без правки числа:', JSON.stringify({ left: rec.left, leftAtToday: Math.abs(rec.leftAt - Date.now()) < 300000, since: rec.since !== undefined }))
await page.locator('nav.tabs button', { hasText: 'Аптечка' }).first().click(); await page.waitForTimeout(600)
console.log('список:', (await page.locator('body').innerText()).replace(/\n+/g,' | ').slice(0, 420))
await browser.close()
