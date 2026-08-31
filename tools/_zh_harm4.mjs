/** Худший заявленный случай: 360 + «очень крупный» + «просторно». */
import { chromium } from 'playwright'
import { seed, go, settle, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4711'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()
for (const [w, sc, de, tag] of [[360, 'xlarge', 'roomy', 'worst'], [360, 'normal', 'normal', 'norm']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 1000 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 3, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(900)
  await seed(page, FROZEN)
  await page.evaluate(async ([a, b]) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.onboarded = true; cur.theme = 'dark'; cur.textScale = a; cur.density = b
    await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, [sc, de])
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
  await go(page, { tool: 'Настройки' })
  for (const [lab, nm] of [['Размер текста', 'size'], ['Стартовый экран', 'start']]) {
    const g = page.locator(`.segmented--fill[aria-label="${lab}"]`)
    await g.scrollIntoViewIfNeeded(); await page.waitForTimeout(250)
    const bb = await g.boundingBox()
    await page.screenshot({ path: `${OUT}/zh-${tag}-${nm}.png`, clip: { x: 0, y: Math.max(0, bb.y - 34), width: w, height: bb.height + 44 } })
  }
  // горизонтальная прокрутка страницы?
  console.log(tag, await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })))
  await ctx.close()
}
await browser.close()
