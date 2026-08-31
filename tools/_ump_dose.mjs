import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 412, height: 915 },
  locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 3,
})
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close()
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await go(page, { tab: 'Приём' })
await page.waitForTimeout(400)

const probe = () => page.evaluate(() => {
  const px = (el) => { const s = getComputedStyle(el); return { t: el.textContent.trim().slice(0,24), fs: s.fontSize, fw: s.fontWeight, color: s.color, w: Math.round(el.getBoundingClientRect().width) } }
  const cards = [...document.querySelectorAll('.card.intake')]
  return cards.map((c) => ({
    head: px(c.querySelector('h2')),
    headMuted: c.querySelector('.card__head .muted') ? px(c.querySelector('.card__head .muted')) : null,
    rows: [...c.querySelectorAll('.dose')].map((r) => ({
      time: r.querySelector('.dose__time') ? px(r.querySelector('.dose__time')) : null,
      name: r.querySelector('.dose__name') ? px(r.querySelector('.dose__name')) : null,
      amount: r.querySelector('.dose__amount') ? px(r.querySelector('.dose__amount')) : null,
    })),
  }))
})

console.log('=== СЕЙЧАС ===')
console.log(JSON.stringify(await probe(), null, 2))

const card = page.locator('.card.intake').filter({ hasText: 'Вечер' }).first()
await card.screenshot({ path: `${OUT}/ump_before.png` })

// применяем предложенную правку
await page.addStyleTag({ content: `
  .dose__name { font-size: var(--fs-3); }
  .dose__time { font-size: var(--fs-1); font-weight: 500; color: var(--text-secondary); min-width: 4.5em; }
`})
await page.waitForTimeout(200)
console.log('=== ПОСЛЕ ПРАВКИ ===')
console.log(JSON.stringify(await probe(), null, 2))
await card.screenshot({ path: `${OUT}/ump_after.png` })
await page.screenshot({ path: `${OUT}/ump_after_full.png`, fullPage: true })

await browser.close()
