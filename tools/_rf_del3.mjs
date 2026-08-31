/** Снимки состояний удаления + геометрия «Очистить базу» + сценарий промаха. */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/rfmed'
mkdirSync(OUT, { recursive: true })

async function seed(page, now, scale) {
  await page.evaluate(async ([now, scale]) => {
    const med = {
      id: 'med-1', name: 'Амлодипин', dose: '5 мг', form: 'Таблетки', inn: 'Амлодипин',
      maker: 'Гедеон Рихтер', packSize: 30, left: 12, perDay: 1, expires: now + 400 * 86400000,
      times: ['19:00'], since: now - 30 * 86400000, taken: [],
    }
    const med2 = { id: 'med-2', name: 'Бисопролол', dose: '2,5 мг', form: 'Таблетки', packSize: 30, left: 20, perDay: 1, times: ['08:00'], since: now - 30 * 86400000, taken: [] }
    const ms = []
    for (let i = 0; i < 20; i++) {
      ms.push({ id: 'm' + i, kind: 'bp', at: now - i * 43200000, sys: 130 + (i % 7), dia: 82 + (i % 5), pulse: 70 + (i % 6), user: 1 })
    }
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('omron-bp', 3)
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    await new Promise((res, rej) => {
      const tx = db.transaction(['medicines', 'meta', 'readings'], 'readwrite')
      tx.objectStore('medicines').put(med); tx.objectStore('medicines').put(med2)
      for (const m of ms) tx.objectStore('readings').put(m)
      tx.objectStore('meta').put({ onboarded: true, textScale: scale, density: 'normal' }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, [now, scale])
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await seed(page, FROZEN, 'normal')
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs')

// ── путь до кнопки удаления: сколько шагов
await page.locator('nav.tabs button', { hasText: 'Аптечка' }).first().click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/1-spisok.png` })
await page.locator('button, [role=button], a').filter({ hasText: 'Амлодипин' }).first().click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/2-kartochka-verh.png` })
const trig = page.locator('button.btn--danger').filter({ hasText: 'Удалить' }).first()
await trig.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
await page.waitForTimeout(250)
await page.screenshot({ path: `${OUT}/3-do-nazhatiya.png` })
const scrolled = await page.evaluate(() => Math.round(window.scrollY))
console.log('прокрутка до кнопки «Удалить», px:', scrolled, ' высота страницы:', await page.evaluate(() => document.documentElement.scrollHeight))
const b = await trig.boundingBox()
await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2)
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/4-posle-nazhatiya.png` })

// что видно человеку: изменилась ли строка заметно
console.log('строка после первого нажатия:', (await page.locator('.card .row').last().innerText()).replace(/\s+/g, ' '))

// ── промах: одиночное случайное нажатие ловится?
await page.locator('button.btn').filter({ hasText: 'Отмена' }).first().click()
await page.waitForTimeout(300)
const still = await page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result) })
  const all = await new Promise((res) => { const rq = db.transaction('medicines', 'readonly').objectStore('medicines').getAll(); rq.onsuccess = () => res(rq.result) })
  db.close(); return all.length
})
console.log('после «Отмена» препаратов в базе:', still)

// ── геометрия «Очистить базу» в настройках
await page.locator('nav.tabs button, header button').filter({ hasText: 'Настройки' }).first().click()
await page.waitForTimeout(600)
const clear = page.locator('button.btn--danger').filter({ hasText: 'Очистить базу' }).first()
await clear.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
await page.waitForTimeout(250)
const c1 = await clear.boundingBox()
const ccx = c1.x + c1.width / 2, ccy = c1.y + c1.height / 2
await page.screenshot({ path: `${OUT}/5-ochistit-do.png` })
await page.touchscreen.tap(ccx, ccy)
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/6-ochistit-posle.png` })
const yes = page.locator('button.btn--danger').filter({ hasText: 'Да, удалить' }).first()
const c2 = await yes.boundingBox()
console.log('\n«Очистить базу»   :', JSON.stringify(c1))
console.log('«Да, удалить всё» :', JSON.stringify(c2))
const chit = ccx >= c2.x && ccx <= c2.x + c2.width && ccy >= c2.y && ccy <= c2.y + c2.height
console.log('точка первого нажатия внутри подтверждения:', chit, '; под точкой:', await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); const bt = e && e.closest ? e.closest('button') : null; return bt ? bt.innerText.trim() : (e ? e.tagName : 'нет') }, [ccx, ccy]))

await browser.close()
