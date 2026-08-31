/** Проверка находки про удаление препарата: геометрия + настоящий двойной тап. */
import { chromium, devices } from 'playwright'

const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()

async function seed(page, now, scale, density = 'normal') {
  await page.evaluate(async ([now, scale, density]) => {
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
      tx.objectStore('meta').put({ onboarded: true, textScale: scale, density }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, [now, scale, density])
}

async function medCount(page) {
  return page.evaluate(async () => {
    const db = await new Promise((res) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result) })
    const all = await new Promise((res) => { const rq = db.transaction('medicines', 'readonly').objectStore('medicines').getAll(); rq.onsuccess = () => res(rq.result) })
    db.close(); return all.length
  })
}

async function openCard(page) {
  await page.waitForSelector('nav.tabs', { timeout: 15000 })
  await page.locator('nav.tabs button', { hasText: 'Аптечка' }).first().click()
  await page.waitForTimeout(400)
  await page.locator('button, [role=button], a').filter({ hasText: 'Амлодипин' }).first().click()
  await page.waitForTimeout(500)
}

/** Прокрутить так, чтобы кнопка оказалась в середине экрана. */
async function center(page, loc) {
  await loc.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await page.waitForTimeout(250)
}

async function geometry(page, label) {
  const trig = page.locator('button.btn--danger').filter({ hasText: 'Удалить' }).first()
  await center(page, trig)
  const r1 = await trig.boundingBox()
  const cx = r1.x + r1.width / 2, cy = r1.y + r1.height / 2
  await page.mouse.click(cx, cy)
  await page.waitForTimeout(400)
  const conf = page.locator('button.btn--danger').filter({ hasText: 'насовсем' }).first()
  const r2 = await conf.boundingBox()
  const cancel = page.locator('button.btn').filter({ hasText: 'Отмена' }).first()
  const r3 = await cancel.boundingBox()
  const under = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y)
    const b = el && el.closest ? el.closest('button') : null
    return b ? b.innerText.trim().replace(/\s+/g, ' ') : (el ? el.tagName : 'нет')
  }, [cx, cy])
  const hit = cx >= r2.x && cx <= r2.x + r2.width && cy >= r2.y && cy <= r2.y + r2.height
  console.log(`\n--- геометрия: ${label} ---`)
  console.log(`  «Удалить»          x=${r1.x.toFixed(0)} y=${r1.y.toFixed(0)} w=${r1.width.toFixed(0)} h=${r1.height.toFixed(0)}  центр (${cx.toFixed(0)},${cy.toFixed(0)})`)
  console.log(`  «Удалить насовсем» x=${r2.x.toFixed(0)} y=${r2.y.toFixed(0)} w=${r2.width.toFixed(0)} h=${r2.height.toFixed(0)}`)
  console.log(`  «Отмена»           x=${r3.x.toFixed(0)} y=${r3.y.toFixed(0)} w=${r3.width.toFixed(0)} h=${r3.height.toFixed(0)}`)
  console.log(`  точка первого нажатия внутри подтверждения: ${hit}; под точкой: «${under}»`)
  console.log(`  фокус после первого нажатия: «${await page.evaluate(() => (document.activeElement?.innerText || document.activeElement?.tagName || '').trim().replace(/\s+/g, ' '))}»`)
  return { cx, cy, hit }
}

async function tapTest(page, scale, density, useTouch) {
  console.log(`\n--- двойное нажатие (${useTouch ? 'touch' : 'mouse'}), шрифт ${scale}, плотность ${density} ---`)
  for (const gap of [0, 30, 60, 100, 150, 250, 400, 700]) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    if ((await medCount(page)) === 0) { await seed(page, FROZEN, scale, density); await page.reload({ waitUntil: 'domcontentloaded' }) }
    await openCard(page)
    const t = page.locator('button.btn--danger').filter({ hasText: 'Удалить' }).first()
    await center(page, t)
    const b = await t.boundingBox()
    const px = b.x + b.width / 2, py = b.y + b.height / 2
    if (useTouch) {
      await page.touchscreen.tap(px, py)
      if (gap) await page.waitForTimeout(gap)
      await page.touchscreen.tap(px, py)
    } else {
      await page.mouse.click(px, py)
      if (gap) await page.waitForTimeout(gap)
      await page.mouse.click(px, py)
    }
    await page.waitForTimeout(700)
    const left = await medCount(page)
    console.log(`  пауза ${String(gap).padStart(3)} мс → препаратов в базе: ${left}${left === 0 ? '   ← УДАЛЁН' : ''}`)
  }
}

async function run({ width, height, scale, density = 'normal', touch = false, label }) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width, height }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1,
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('  PAGEERROR:', e.message))
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN, scale, density)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await openCard(page)
  console.log(`\n================ ${label} ================`)
  await geometry(page, label)
  await tapTest(page, scale, density, touch)
  await browser.close()
}

await run({ width: 412, height: 915, scale: 'normal', label: 'телефон 412, обычный шрифт, мышь' })
await run({ width: 412, height: 915, scale: 'normal', touch: true, label: 'телефон 412, обычный шрифт, ПАЛЕЦ' })
await run({ width: 412, height: 915, scale: 'xlarge', touch: true, label: 'телефон 412, очень крупный шрифт, ПАЛЕЦ' })
await run({ width: 360, height: 800, scale: 'xlarge', touch: true, label: 'телефон 360, очень крупный шрифт, ПАЛЕЦ' })
await run({ width: 1280, height: 900, scale: 'normal', label: 'ноутбук 1280, мышь' })
