import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

for (const scale of ['normal','large','xlarge']) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 780 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    colorScheme: 'light', deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.onboarded = true; cur.textScale = s
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close(); localStorage.setItem('textScale', s)
  }, scale)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(400)
  await go(page, { tab: 'Аптечка', click: 'Добавить препарат' })
  await page.waitForTimeout(400)
  const input = page.locator('.suggest input').first()
  await input.click(); await input.fill('Индапамид'); await page.waitForTimeout(900)
  await page.locator('.suggest__item').nth(0).dispatchEvent('mousedown')
  await page.waitForTimeout(500)

  const r = await page.evaluate(() => {
    const de = document.documentElement
    const group = [...document.querySelectorAll('.chips')].find(c => c.getAttribute('aria-label') === 'Формы выпуска из реестра')
    const chips = group ? [...group.querySelectorAll('.chip')] : []
    const vw = de.clientWidth
    const rows = chips.map(c => {
      const txt = c.textContent.trim(); const node = c.firstChild
      const range = document.createRange(); let cut = txt.length
      for (let i = 1; i <= txt.length; i++) { range.setStart(node,0); range.setEnd(node,i); if (range.getBoundingClientRect().right > vw) { cut = i-1; break } }
      const b = c.getBoundingClientRect()
      return { l: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height), vis: txt.slice(0,cut), cut, len: txt.length }
    })
    return { rootFont: getComputedStyle(de).fontSize, vw, sw: de.scrollWidth, rows }
  })
  console.log(`\n##### ${scale} (root ${r.rootFont}) окно ${r.vw}, scrollWidth ${r.sw}`)
  r.rows.forEach(x => console.log(`  x=${x.l} w=${x.w} h=${x.h}  [${x.cut}/${x.len}] «${x.vis}»`))

  // настоящий тап пальцем по длинному чипу в видимой зоне
  const chips = page.locator('.chips[aria-label="Формы выпуска из реестра"] .chip')
  const n = await chips.count()
  const target = chips.nth(n-1)
  const bb = await target.boundingBox()
  await page.touchscreen.tap(Math.min(bb.x + 40, 340), bb.y + bb.height/2)
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => ({
    pressed: [...document.querySelectorAll('.chips[aria-label="Формы выпуска из реестра"] .chip')].filter(c=>c.getAttribute('aria-pressed')==='true').map(c=>c.textContent.trim()),
    echo: [...document.querySelectorAll('.muted')].map(e=>e.textContent.trim()).filter(t=>t.startsWith('Форма:')),
    echoRight: (()=>{const e=[...document.querySelectorAll('.muted')].find(x=>x.textContent.trim().startsWith('Форма:')); return e?Math.round(e.getBoundingClientRect().right):null})(),
    doses: [...document.querySelectorAll('.chips[aria-label="Дозировки из реестра"] .chip')].map(c=>c.textContent.trim()),
  }))
  console.log('  тап пальцем ->', JSON.stringify(after))
  await page.screenshot({ path: `${OUT}/h3_${scale}.png` })
  await ctx.close()
}
await browser.close()
