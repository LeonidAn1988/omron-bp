import { chromium } from 'playwright'
import { seed, go, settle, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4833'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/vred_h'
const browser = await chromium.launch()
for (const [w, sc, de] of [[360, 'xlarge', 'roomy'], [393, 'xlarge', 'roomy'], [320, 'xlarge', 'roomy']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 3, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async ([a, b]) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = a; cur.density = b; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, [sc, de])
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
  await go(page, { tab: 'Аптечка' })
  await page.locator('button', { hasText: 'Добавить препарат' }).first().click(); await page.waitForTimeout(500)
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Утро/.test(x.textContent)); b && b.click() })
  await page.waitForTimeout(400)
  const seg = page.locator('.segmented[aria-label="Отношение к еде"]').first()
  await seg.scrollIntoViewIfNeeded(); await page.waitForTimeout(250)
  const geo = await page.evaluate(() => {
    const g = [...document.querySelectorAll('.segmented')].find((e) => e.getAttribute('aria-label') === 'Отношение к еде')
    const card = g.closest('.card'); const cr = card.getBoundingClientRect(); const gr = g.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    return {
      vw, card: [+cr.left.toFixed(1), +cr.right.toFixed(1)], group: [+gr.left.toFixed(1), +gr.right.toFixed(1)],
      pastCard: +(gr.right - cr.right).toFixed(1), pastViewport: +(gr.right - vw).toFixed(1),
      cardOverflowCS: getComputedStyle(card).overflow,
      pageScrollsX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth,
      rowWrap: getComputedStyle(g.parentElement).flexWrap, rowChildrenTops: [...g.parentElement.children].map((c) => +c.getBoundingClientRect().top.toFixed(0)),
      btns: [...g.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); const hit = document.elementFromPoint((Math.max(r.left,0)+Math.min(r.right,vw))/2, (r.top+r.bottom)/2); return { t: b.textContent.trim(), l: +r.left.toFixed(1), r: +r.right.toFixed(1), hitSelf: hit === b || b.contains(hit), hitTag: hit && hit.tagName } }),
    }
  })
  // тап по каждой кнопке
  const taps = []
  for (const t of ['До еды', 'После еды', 'Неважно']) {
    let err = null
    try { await seg.locator('button', { hasText: new RegExp('^' + t + '$') }).first().click({ timeout: 3000 }) } catch (e) { err = String(e).split('\n')[0].slice(0, 90) }
    await page.waitForTimeout(200)
    const p = await page.evaluate(() => [...document.querySelectorAll('.segmented[aria-label="Отношение к еде"] button')].map((b) => [b.textContent.trim(), b.getAttribute('aria-pressed')]))
    taps.push({ t, err, pressed: p })
  }
  console.log('###', w, sc, de); console.log(JSON.stringify({ geo, taps }, null, 2))
  const bb = await seg.boundingBox()
  await page.screenshot({ path: `${OUT}/mealcard-${w}-${sc}-${de}.png`, clip: { x: 0, y: Math.max(0, bb.y - 60), width: w, height: bb.height + 100 } })
  await ctx.close()
}
await browser.close()
