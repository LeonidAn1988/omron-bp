import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { FROZEN, seed } from './visual.mjs'

const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/refut_sticky'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark',
})
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await seed(page, FROZEN)
// онбординг + очень крупный/просторно кладём в те же настройки
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  const cur = await new Promise((res) => {
    const tx = db.transaction(['meta'], 'readonly'); const g = tx.objectStore('meta').get('settings')
    g.onsuccess = () => res(g.result || {})
  })
  await new Promise((res, rej) => {
    const tx = db.transaction(['meta'], 'readwrite')
    tx.objectStore('meta').put({ ...cur, trackGlucose: true, onboarded: true, textScale: 'xlarge', density: 'roomy' }, 'settings')
    tx.oncomplete = res; tx.onerror = () => rej(tx.error)
  })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 15000 })
await page.waitForTimeout(500)
await page.evaluate(() => { document.documentElement.dataset.text = 'xlarge'; document.documentElement.dataset.density = 'roomy' })
await page.waitForTimeout(300)

console.log('data-text =', await page.evaluate(() => document.documentElement.dataset.text), '| density =', await page.evaluate(() => document.documentElement.dataset.density))
console.log('pointer:coarse =', await page.evaluate(() => matchMedia('(pointer: coarse)').matches))

await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
await page.waitForTimeout(400)
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(250)

const geom = async (label) => {
  const r = await page.evaluate(() => {
    const form = document.querySelector('form.card')
    const det = form.querySelector('details')
    const sum = det?.querySelector('summary')
    const panel = form.querySelector('.form-actions')
    const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom) } }
    let hit = null, vis = null
    if (sum) {
      const b = sum.getBoundingClientRect()
      const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2)
      if (y > 0 && y < innerHeight) { const el = document.elementFromPoint(x, y); hit = el ? el.tagName + '.' + (typeof el.className === 'string' ? el.className : '') : null; vis = !!(el && (el === sum || sum.contains(el) || el.contains(sum))) }
      else { hit = 'вне окна'; vis = false }
    }
    const cs = panel ? getComputedStyle(panel) : null
    return { y: Math.round(scrollY), max: Math.round(document.documentElement.scrollHeight - innerHeight),
      summary: box(sum), panel: box(panel), formBottom: Math.round(form.getBoundingClientRect().bottom),
      pos: cs?.position, bot: cs?.bottom, z: cs?.zIndex, bg: cs?.backgroundColor, hit, vis, open: det?.open }
  })
  console.log(label, JSON.stringify(r))
  return r
}

await geom('A закрыт, scroll=0')
await page.locator('form.card summary', { hasText: 'Рука и примечание' }).first().click()
await page.waitForTimeout(600)
await geom('B открыт, scroll=0')
await page.screenshot({ path: `${OUT}/01-scroll0.png` })

let firstVisible = null
for (const y of [0, 20, 40, 60, 80, 100, 120, 140, 160, 200, 240, 300, 400]) {
  await page.evaluate((v) => window.scrollTo(0, v), y)
  await page.waitForTimeout(120)
  const g = await geom(`  scroll=${y}`)
  if (g.vis && !firstVisible) firstVisible = g
}
console.log('>>> SUMMARY ВИДЕН:', firstVisible ? `да, при scrollY=${firstVisible.y}` : 'НИ ПРИ КАКОЙ ПРОКРУТКЕ')

await page.evaluate((v) => window.scrollTo(0, v), firstVisible?.y ?? 0)
await page.waitForTimeout(250)
await page.screenshot({ path: `${OUT}/02-visible.png` })

let clickable
try {
  await page.locator('form.card summary', { hasText: 'Рука и примечание' }).first().click({ timeout: 4000 })
  await page.waitForTimeout(400)
  await page.locator('form.card summary', { hasText: 'Рука и примечание' }).first().click({ timeout: 4000 })
  await page.waitForTimeout(500)
  clickable = 'да, клик прошёл дважды'
} catch (e) { clickable = 'НЕТ: ' + e.message.split('\n')[0] }
console.log('>>> КЛИК ПО SUMMARY:', clickable)

let fields
try {
  await page.locator('form.card details select').first().selectOption('left', { timeout: 4000 })
  await page.locator('form.card details input').first().fill('после лекарства', { timeout: 4000 })
  fields = 'да: ' + await page.locator('form.card details select').first().inputValue() + ' / ' + await page.locator('form.card details input').first().inputValue()
} catch (e) { fields = 'НЕТ: ' + e.message.split('\n')[0] }
console.log('>>> ПОЛЯ РУКА/ПРИМЕЧАНИЕ ДОСТУПНЫ:', fields)
await page.screenshot({ path: `${OUT}/03-fields.png` })

await browser.close()
