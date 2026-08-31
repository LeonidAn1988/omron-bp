import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4399'
const SHOT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const cases = [
  { tag: '360-xlarge-roomy', w: 360, scale: 'xlarge', density: 'roomy' },
  { tag: '360-xlarge-normal', w: 360, scale: 'xlarge', density: 'normal' },
  { tag: '360-normal-normal', w: 360, scale: 'normal', density: 'normal' },
]

const browser = await chromium.launch()
for (const c of cases) {
  const ctx = await browser.newContext({ viewport: { width: c.w, height: 915 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 3 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  await seed(page, FROZEN)
  await page.evaluate(async ({ s, d }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s; cur.density = d; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close(); localStorage.setItem('textScale', s); localStorage.setItem('density', d)
  }, { s: c.scale, d: c.density })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(600)

  await go(page, { tab: 'Аптечка' })
  await page.waitForTimeout(500)
  const box = await page.evaluate(() => {
    const g = document.querySelector('.segmented--fill')
    g.scrollIntoView({ block: 'center' })
    const r = g.getBoundingClientRect()
    return { x: 0, y: Math.max(0, r.top - 18), width: document.documentElement.clientWidth, height: r.height + 36 }
  })
  await page.screenshot({ path: `${SHOT}/crop-apt-${c.tag}.png`, clip: box })

  // форма препарата
  await go(page, { tab: 'Аптечка', click: 'Добавить препарат' })
  await page.waitForTimeout(400)
  const chip = page.locator('button.chip', { hasText: 'Утром' }).first()
  await chip.click()
  await page.waitForTimeout(600)
  const box2 = await page.evaluate(() => {
    const g = [...document.querySelectorAll('.segmented')].find((x) => x.getAttribute('aria-label') === 'Отношение к еде')
    if (!g) return null
    g.scrollIntoView({ block: 'center' })
    const r = g.getBoundingClientRect()
    return { x: 0, y: Math.max(0, r.top - 26), width: document.documentElement.clientWidth, height: r.height + 52 }
  })
  if (box2) await page.screenshot({ path: `${SHOT}/crop-meal-${c.tag}.png`, clip: box2 })
  await ctx.close()
}
await browser.close()
