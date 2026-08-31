import { chromium } from 'playwright'
import { seed, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()

async function run(drug, scale, W) {
  const ctx = await browser.newContext({
    viewport: { width: W, height: 800 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 2,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
    localStorage.setItem('textScale', s)
  }, scale)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(600)
  await page.locator('nav.tabs button', { hasText: 'Аптечка' }).first().click()
  await page.waitForTimeout(350)
  await page.locator('button', { hasText: 'Добавить препарат' }).first().click()
  await page.waitForTimeout(350)
  const input = page.locator('.suggest input').first()
  await input.click(); await input.fill(drug)
  await page.waitForTimeout(700)
  const n = await page.locator('.suggest__item').count()
  if (!n) { console.log(`${drug}/${scale}/${W}: нет подсказок`); await ctx.close(); return }
  await page.locator('.suggest__item').first().click()
  await page.waitForTimeout(500)

  const m = await page.evaluate(() => {
    const g = document.querySelector('.chips[aria-label="Формы выпуска из реестра"]')
    const inner = g ? Math.round(g.getBoundingClientRect().width) : null
    const chips = g ? [...g.querySelectorAll('.chip')].map(c => ({ t: c.textContent.trim(), len: c.textContent.trim().length, w: Math.round(c.getBoundingClientRect().width) })) : []
    return { rootFont: getComputedStyle(document.documentElement).fontSize, inner, chips, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth }
  })
  console.log(`\n=== ${drug} | scale=${scale} | vw=${W} | rootFont=${m.rootFont} ===`)
  console.log(`доступно внутри карточки: ${m.inner}px; scrollWidth=${m.scrollW} при clientWidth=${m.clientW}`)
  for (const c of m.chips) console.log(`  ${c.w}px  (${c.len} зн.) ${c.w > m.inner ? 'ВЫЛЕЗ на ' + (c.w - m.inner) + 'px' : 'ок'}  «${c.t.slice(0,60)}»`)

  // прокрутка вбок и положение липкой навигации
  const s = await page.evaluate(() => {
    const before = document.querySelector('nav.tabs').getBoundingClientRect()
    window.scrollTo(9999, 0)
    const after = document.querySelector('nav.tabs').getBoundingClientRect()
    return { scrollX: window.scrollX, navBefore: Math.round(before.left) + '..' + Math.round(before.right), navAfter: Math.round(after.left) + '..' + Math.round(after.right), navPos: getComputedStyle(document.querySelector('nav.tabs')).position }
  })
  console.log('  прокрутка вбок:', JSON.stringify(s))
  await page.screenshot({ path: `${OUT}/rf_chip2_${scale}_${W}_scrolled.png` })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `${OUT}/rf_chip2_${scale}_${W}.png` })
  await ctx.close()
}

await run('Смекта', 'normal', 360)
await run('Смекта', 'large', 360)
await run('Аугментин', 'normal', 360)
await run('Экоклав', 'normal', 360)
await run('Конкор', 'normal', 360)
await browser.close()
