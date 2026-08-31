import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4399'
const SHOT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 360, height: 915 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1000)
await seed(page, FROZEN)
await page.evaluate(async () => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
  const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
  cur.textScale = 'xlarge'; cur.density = 'normal'; cur.trackGlucose = true; cur.onboarded = true
  await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
  db.close(); localStorage.setItem('textScale', 'xlarge')
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 20000 })
await page.waitForTimeout(500)

// --- Форма препарата: добавить время, чтобы появился «Отношение к еде»
await go(page, { tab: 'Аптечка', click: 'Добавить препарат' })
await page.waitForTimeout(400)
const preset = page.locator('button', { hasText: 'Утром' }).first()
if (await preset.count()) { await preset.click(); await page.waitForTimeout(400) }
const m1 = await page.evaluate(() => {
  const g = [...document.querySelectorAll('.segmented')].find((x) => x.getAttribute('aria-label') === 'Отношение к еде')
  if (!g) return null
  const r = g.getBoundingClientRect()
  return {
    vw: document.documentElement.clientWidth, docScrollW: document.documentElement.scrollWidth,
    L: +r.left.toFixed(1), R: +r.right.toFixed(1), W: +r.width.toFixed(1),
    parentW: +g.parentElement.getBoundingClientRect().width.toFixed(1),
    parentCls: g.parentElement.className,
    btns: [...g.querySelectorAll('button')].map((b) => ({ t: b.textContent.trim(), L: +b.getBoundingClientRect().left.toFixed(1), R: +b.getBoundingClientRect().right.toFixed(1) })),
  }
})
console.log('Отношение к еде:', JSON.stringify(m1, null, 1))
await page.screenshot({ path: `${SHOT}/segrep2-medform-360-xl.png`, fullPage: true })

// --- Настройки: подставим группу «Пользователь прибора» такой же разметкой
await go(page, { tool: 'Настройки' })
await page.waitForTimeout(400)
const m2 = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')]
  const card = cards.find((c) => c.querySelector('h2')?.textContent.includes('Пользователи'))
  if (!card) return { err: 'нет карточки', heads: cards.map((c) => c.querySelector('h2')?.textContent) }
  const wrap = document.createElement('div')
  wrap.innerHTML = '<div class="segmented" role="group" aria-label="_test_user"><button>Пользователь 1</button><button>Пользователь 2</button></div>'
  card.insertBefore(wrap, card.children[1] ?? null)
  const g = wrap.firstElementChild
  const r = g.getBoundingClientRect()
  return {
    vw: document.documentElement.clientWidth,
    L: +r.left.toFixed(1), R: +r.right.toFixed(1), W: +r.width.toFixed(1),
    cardW: +card.getBoundingClientRect().width.toFixed(1),
    cardR: +card.getBoundingClientRect().right.toFixed(1),
    btns: [...g.querySelectorAll('button')].map((b) => ({ t: b.textContent, R: +b.getBoundingClientRect().right.toFixed(1) })),
  }
})
console.log('Пользователь прибора (подставлено):', JSON.stringify(m2, null, 1))
await page.screenshot({ path: `${SHOT}/segrep2-settings-360-xl.png`, fullPage: true })

await browser.close()
