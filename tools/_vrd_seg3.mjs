/** Крупные снимки самих переключателей в худших конфигурациях. */
import { chromium } from 'playwright'
import { seed, go, settle, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4711'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/vrd2'
const browser = await chromium.launch()

const CASES = [
  { width: 320, scale: 'xlarge', density: 'roomy' },
  { width: 360, scale: 'xlarge', density: 'roomy' },
  { width: 412, scale: 'xlarge', density: 'roomy' },
  { width: 360, scale: 'normal', density: 'normal' },
]

for (const c of CASES) {
  const ctx = await browser.newContext({
    viewport: { width: c.width, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    colorScheme: 'light', deviceScaleFactor: 3, hasTouch: true, isMobile: true,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async ([sc, de]) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = sc; cur.density = de; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, [c.scale, c.density])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)

  await go(page, { tab: 'Аптечка' })
  const seg = page.locator('.segmented--fill[aria-label="Что показывать"]').first()
  await seg.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  const box = await seg.boundingBox()
  await page.screenshot({
    path: `${OUT}/z-cab-${c.width}-${c.scale}-${c.density}.png`,
    clip: { x: Math.max(0, box.x - 8), y: box.y - 8, width: Math.min(c.width, box.width + 32), height: box.height + 16 },
  })

  // проверка попадания пальца: жмём каждую кнопку и смотрим, что выбралось
  const labels = await seg.locator('button').allTextContents()
  const hits = []
  for (const t of labels) {
    const b = seg.locator('button', { hasText: t }).first()
    const bb = await b.boundingBox()
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2)
    await page.waitForTimeout(150)
    const pressed = await seg.locator('button[aria-pressed="true"]').first().textContent()
    hits.push(`${t}→${pressed}`)
  }
  console.log(`${c.width}/${c.scale}/${c.density} аптечка:`, hits.join(', '))

  await go(page, { tool: 'Настройки' })
  const seg2 = page.locator('.segmented--fill[aria-label="Размер текста"]').first()
  await seg2.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  const box2 = await seg2.boundingBox()
  await page.screenshot({
    path: `${OUT}/z-set-${c.width}-${c.scale}-${c.density}.png`,
    clip: { x: Math.max(0, box2.x - 8), y: box2.y - 8, width: Math.min(c.width, box2.width + 32), height: box2.height + 16 },
  })

  // можно ли вернуться к «Обычный» с крайнего положения
  const before = await page.evaluate(() => document.documentElement.dataset.text || 'normal')
  await seg2.locator('button', { hasText: 'Обычный' }).first().click()
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => document.documentElement.dataset.text || 'normal')
  console.log(`   размер текста: ${before} → нажали «Обычный» → ${after}`)

  await ctx.close()
}
await browser.close()
