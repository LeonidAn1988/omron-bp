import { chromium } from 'playwright'
const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-31T16:25:00').getTime()
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const HEIGHT = Number(process.env.H ?? 794)
const TEXT = process.env.TEXT ?? 'xlarge'
const DENS = process.env.DENS ?? 'roomy'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 375, height: HEIGHT }, deviceScaleFactor: 3.25,
  isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
  colorScheme: 'dark', ignoreHTTPSErrors: true,
})
const page = await ctx.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1200)
// настройки как на снимке: 4 вкладки (сахар выключен), онбординг пройден
await page.evaluate(async ([text, dens]) => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  const cur = await new Promise((res) => {
    const tx = db.transaction(['meta'], 'readonly'); const g = tx.objectStore('meta').get('settings')
    g.onsuccess = () => res(g.result || {}); g.onerror = () => res({})
  })
  await new Promise((res, rej) => {
    const tx = db.transaction(['meta'], 'readwrite')
    tx.objectStore('meta').put({ ...cur, trackGlucose: false, onboarded: true, seenIntro: true,
      theme: 'dark', textScale: text, density: dens }, 'settings')
    tx.oncomplete = res; tx.onerror = () => rej(tx.error)
  })
  db.close()
}, [TEXT, DENS])
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav.tabs', { timeout: 15000 })
await page.waitForTimeout(800)

await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
await page.waitForTimeout(500)
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(300)

const info = await page.evaluate(() => {
  const R = (el) => { if (!el) return null; const b = el.getBoundingClientRect()
    return { t: +b.top.toFixed(1), b: +b.bottom.toFixed(1), h: +b.height.toFixed(1) } }
  const form = document.querySelector('form.card')
  const det = form.querySelector('details')
  const sum = det.querySelector('summary')
  const panel = form.querySelector('.form-actions')
  const cs = getComputedStyle(panel)
  // где панель лежала бы без sticky
  const saved = panel.style.position
  panel.style.position = 'static'
  const flow = R(panel)
  const flowSum = R(sum)
  panel.style.position = saved
  const stuck = R(panel)
  const stuckSum = R(sum)
  // что под пальцем в центре подписи
  const sb = sum.getBoundingClientRect()
  const cx = Math.round(sb.left + sb.width / 2), cy = Math.round(sb.top + sb.height / 2)
  const hitEl = document.elementFromPoint(cx, cy)
  const name = (el) => el ? el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().replace(/\s+/g, '.') : '') : null
  return {
    root: { text: document.documentElement.dataset.text, dens: document.documentElement.dataset.density,
      fontSize: getComputedStyle(document.documentElement).fontSize,
      spaceUnit: getComputedStyle(document.documentElement).getPropertyValue('--space-unit').trim() },
    coarse: matchMedia('(pointer: coarse)').matches,
    innerHeight: innerHeight, scrollY: scrollY,
    scrollMax: Math.round(document.documentElement.scrollHeight - innerHeight),
    panelPos: cs.position, panelBottom: cs.bottom, panelZ: cs.zIndex, panelBg: cs.backgroundColor,
    summaryFont: getComputedStyle(sum).fontSize, summaryLH: getComputedStyle(sum).lineHeight,
    когда: R(form.querySelector('.field .btn')),
    summaryStuck: stuckSum, summaryFlow: flowSum,
    panelStuck: stuck, panelFlow: flow,
    shiftUp: +(flow.t - stuck.t).toFixed(1),
    overlap: +(Math.min(stuckSum.b, stuck.b) - Math.max(stuckSum.t, stuck.t)).toFixed(1),
    hit: name(hitEl), hitIsSummary: !!(hitEl && (hitEl === sum || sum.contains(hitEl) || hitEl.contains(sum))),
    cardBottom: R(form).b,
  }
})
console.log(JSON.stringify(info, null, 1))
await page.screenshot({ path: `${OUT}/repro_${TEXT}_${DENS}_${HEIGHT}.png` })
await browser.close()
