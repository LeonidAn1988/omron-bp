/** Опровержение находки: правка примечания возвращает старый запас и стирает since? */
import { chromium } from 'playwright'

const URL = 'http://localhost:5199'
const DAY = 86400000

async function seed(page, now) {
  await page.evaluate(async ([now, DAY]) => {
    const med = {
      id: 'med-1', name: 'Амлодипин', dose: '5 мг', form: 'Таблетки', inn: 'Амлодипин',
      maker: 'Гедеон Рихтер', packSize: 30,
      left: 33, leftAt: now - 30 * DAY,          // подтверждено 33 шт. 30 дней назад
      perDay: null, times: ['08:00'], perTime: 1,
      expires: Date.UTC(2027, 4, 31),
      since: now - 60 * DAY,                      // дата заведения
      note: 'старое примечание', taken: [],
    }
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('omron-bp', 3)
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    await new Promise((res, rej) => {
      const tx = db.transaction(['medicines', 'meta'], 'readwrite')
      tx.objectStore('medicines').clear()
      tx.objectStore('medicines').put(med)
      tx.objectStore('meta').put({ onboarded: true, textScale: 'normal', density: 'normal' }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, [now, DAY])
}

async function record(page) {
  return page.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result) })
    const all = await new Promise((res) => { const rq = db.transaction('medicines', 'readonly').objectStore('medicines').getAll(); rq.onsuccess = () => res(rq.result) })
    db.close(); return all[0]
  })
}

async function screenText(page) {
  return (await page.locator('body').innerText()).replace(/\n+/g, ' | ')
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 412, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
const page = await context.newPage()
page.on('pageerror', (e) => console.log('  PAGEERROR:', e.message))
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
const NOW = Date.now()
await seed(page, NOW)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 15000 })
await page.locator('nav.tabs button', { hasText: 'Аптечка' }).first().click()
await page.waitForTimeout(600)

console.log('=== ДО правки ===')
console.log('запись в базе:', JSON.stringify(await record(page)))
console.log('экран Аптечка:', (await screenText(page)).slice(0, 700))

// открываем карточку
await page.locator('button, [role=button], a').filter({ hasText: 'Амлодипин' }).first().click()
await page.waitForTimeout(500)
console.log('\nкарточка:', (await screenText(page)).slice(0, 600))

// «Изменить»
await page.locator('button').filter({ hasText: /^Изменить/ }).first().click()
await page.waitForTimeout(600)
const formText = await screenText(page)
console.log('\n=== ФОРМА «Изменить препарат» ===')
const leftField = page.locator('.numfield').filter({ hasText: 'Осталось' }).locator('input').first()
console.log('всего .numfield в форме:', await page.locator('.numfield').count())
for (const t of await page.locator('.numfield').allInnerTexts()) console.log('   numfield:', t.replace(/\n/g,' / '))
console.log('поле «Осталось» предзаполнено:', JSON.stringify(await leftField.inputValue()))

// правим ТОЛЬКО примечание
const noteField = page.locator('label').filter({ hasText: /Примечание|Заметк/ }).locator('textarea, input').first()
const nCount = await noteField.count()
console.log('поле примечания найдено:', nCount > 0)
if (nCount > 0) { await noteField.fill('после еды'); }

await page.locator('button[type=submit], button').filter({ hasText: /^Сохранить/ }).first().click()
await page.waitForTimeout(900)

console.log('\n=== ПОСЛЕ правки ===')
const after = await record(page)
console.log('запись в базе:', JSON.stringify(after))
console.log('since на месте:', after.since !== undefined, '| left:', after.left, '| leftAt сдвинут на сегодня:', Math.abs(after.leftAt - NOW) < 5 * 60000)
await page.locator('nav.tabs button', { hasText: 'Аптечка' }).first().click()
await page.waitForTimeout(700)
console.log('экран Аптечка:', (await screenText(page)).slice(0, 700))

await browser.close()
