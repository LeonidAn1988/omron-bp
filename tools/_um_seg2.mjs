import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const PATCH = `
.segmented { flex-wrap: wrap; }
.segmented button { white-space: normal; min-width: 0; line-height: 1.2; }
.segmented--fill { display: inline-flex; width: 100%; }
.segmented--fill button { flex: 1 1 0; padding: 0 var(--space-3); }
`

const browser = await chromium.launch()

for (const phase of ['before', 'after']) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    colorScheme: 'dark',
    deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('omron-bp', 3)
      r.onsuccess = () => res(r.result)
      r.onerror = () => rej(r.error)
    })
    const cur = await new Promise((res) => {
      const tx = db.transaction('meta', 'readonly')
      const q = tx.objectStore('meta').get('settings')
      q.onsuccess = () => res(q.result || {})
    })
    cur.textScale = 'xlarge'
    cur.density = 'roomy'
    cur.onboarded = true
    cur.trackGlucose = true
    await new Promise((res, rej) => {
      const tx = db.transaction('meta', 'readwrite')
      tx.objectStore('meta').put(cur, 'settings')
      tx.oncomplete = res
      tx.onerror = () => rej(tx.error)
    })
    db.close()
    localStorage.setItem('textScale', 'xlarge')
    localStorage.setItem('density', 'roomy')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(600)
  if (phase === 'after') await page.addStyleTag({ content: PATCH })

  await go(page, { tool: 'Настройки' })
  await page.waitForTimeout(400)
  for (const label of ['Стартовый экран', 'Размер текста']) {
    const el = page.locator(`.segmented[aria-label="${label}"]`)
    await el.scrollIntoViewIfNeeded()
    await page.waitForTimeout(200)
    const slug = label === 'Стартовый экран' ? 'start' : 'size'
    await el.screenshot({ path: `${OUT}/um_fill_${slug}_${phase}.png` })
  }

  await go(page, { tool: 'Отчёт' })
  await page.waitForTimeout(400)
  const per = page.locator('.segmented[aria-label="Период отчёта"]')
  await per.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  await per.screenshot({ path: `${OUT}/um_period_${phase}.png` })

  await ctx.close()
}
await browser.close()
console.log('ok')
