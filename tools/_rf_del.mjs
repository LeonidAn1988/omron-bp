/** Проверка находки: подтверждение удаления препарата встаёт ровно под палец? */
import { chromium } from 'playwright'

const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()

async function seed(page, now, scale) {
  await page.evaluate(async ([now, scale]) => {
    const med = {
      id: 'med-1', name: 'Амлодипин', dose: '5 мг', form: 'Таблетки', inn: 'Амлодипин',
      maker: 'Гедеон Рихтер', packSize: 30, left: 12, perDay: 1, expires: now + 400 * 86400000,
      times: ['19:00'], since: now - 30 * 86400000, taken: [],
    }
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('omron-bp', 3)
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
    })
    await new Promise((res, rej) => {
      const tx = db.transaction(['medicines', 'meta'], 'readwrite')
      tx.objectStore('medicines').put(med)
      tx.objectStore('meta').put({ onboarded: true, textScale: scale, density: 'normal' }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, [now, scale])
}

async function medCount(page) {
  return page.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result) })
    const all = await new Promise((res) => { const rq = db.transaction('medicines', 'readonly').objectStore('medicines').getAll(); rq.onsuccess = () => res(rq.result) })
    db.close(); return all.length
  })
}

async function restore(page, now, scale) {
  await seed(page, now, scale)
}

async function openCard(page) {
  await page.waitForSelector('nav.tabs', { timeout: 15000 })
  await page.locator('nav.tabs button', { hasText: 'Аптечка' }).first().click()
  await page.waitForTimeout(400)
  await page.locator('button, [role=button], a').filter({ hasText: 'Амлодипин' }).first().click()
  await page.waitForTimeout(500)
}

async function run(width, scale, label) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow' })
  const page = await context.newPage()
  page.on('pageerror', (e) => console.log('  PAGEERROR:', e.message))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN, scale)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openCard(page)

  const trig = page.locator('button.btn--danger').filter({ hasText: 'Удалить' }).first()
  await trig.scrollIntoViewIfNeeded()
  await page.evaluate(() => window.scrollBy(0, -120))
  await page.waitForTimeout(300)
  const r1 = await trig.boundingBox()
  console.log(`\n=== ${label} (ширина ${width}, шрифт ${scale}) ===`)
  console.log('  «Удалить»          :', JSON.stringify(r1), 'текст:', (await trig.innerText()).trim().replace(/\s+/g,' '))
  const cx = r1.x + r1.width / 2, cy = r1.y + r1.height / 2
  await page.mouse.click(cx, cy)
  await page.waitForTimeout(350)

  const conf = page.locator('button.btn--danger').filter({ hasText: 'насовсем' }).first()
  const r2 = await conf.boundingBox()
  const cancel = page.locator('button.btn').filter({ hasText: 'Отмена' }).first()
  const r3 = await cancel.boundingBox()
  console.log('  «Удалить насовсем» :', JSON.stringify(r2))
  console.log('  «Отмена»           :', JSON.stringify(r3))
  const hit = cx >= r2.x && cx <= r2.x + r2.width && cy >= r2.y && cy <= r2.y + r2.height
  console.log('  точка первого нажатия попадает в подтверждение:', hit)
  console.log('  элемент под этой точкой:', await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y); return el ? (el.closest('button')?.innerText || el.tagName) : 'нет'
  }, [cx, cy]))
  console.log('  disabled у подтверждения:', await conf.isDisabled())
  console.log('  фокус на:', await page.evaluate(() => document.activeElement?.innerText?.trim() || document.activeElement?.tagName))

  // Реальный двойной тап с разными паузами
  for (const gap of [0, 40, 80, 150, 250, 400]) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    if (await medCount(page) === 0) { await restore(page, FROZEN, scale); await page.reload({ waitUntil: 'domcontentloaded' }) }
    await openCard(page)
    const t = page.locator('button.btn--danger').filter({ hasText: 'Удалить' }).first()
    await t.scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, -120))
    await page.waitForTimeout(250)
    const b = await t.boundingBox()
    const px = b.x + b.width / 2, py = b.y + b.height / 2
    await page.mouse.click(px, py)
    if (gap) await page.waitForTimeout(gap)
    await page.mouse.click(px, py)
    await page.waitForTimeout(600)
    const left = await medCount(page)
    console.log(`  два нажатия в одну точку, пауза ${gap} мс → препаратов в базе: ${left}${left === 0 ? '  ← УДАЛЁН' : ''}`)
  }
  await browser.close()
}

await run(412, 'normal', 'обычный размер')
await run(412, 'xlarge', 'очень крупный')
