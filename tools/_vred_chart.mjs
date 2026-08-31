import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/vrchart'

const cases = [
  { tag: 'normal-412', scale: 'normal', density: 'normal', w: 412, base: null },
  { tag: 'xlarge-412', scale: 'xlarge', density: 'normal', w: 412, base: null },
  { tag: 'xlarge-360', scale: 'xlarge', density: 'normal', w: 360, base: null },
  { tag: 'xlarge-320', scale: 'xlarge', density: 'normal', w: 320, base: null },
  { tag: 'xlarge-412-roomy', scale: 'xlarge', density: 'roomy', w: 412, base: null },
  // сверху системное увеличение шрифта браузера (Chrome «очень крупный» = 24px)
  { tag: 'xlarge-412-sys24', scale: 'xlarge', density: 'normal', w: 412, base: 24 },
  { tag: 'normal-412-sys24', scale: 'normal', density: 'normal', w: 412, base: 24 },
]

const browser = await chromium.launch()

for (const c of cases) {
  const ctx = await browser.newContext({
    viewport: { width: c.w, height: 915 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 3,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s.scale; cur.density = s.density; cur.trackGlucose = true; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
    localStorage.setItem('textScale', s.scale)
  }, { scale: c.scale, density: c.density })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(400)
  if (c.base) {
    // Chrome «размер шрифта» задаёт базу, от которой считается % на :root.
    // Воспроизводим итог руками: база × коэффициент data-text.
    const k = { small: 0.9375, normal: 1, large: 1.125, xlarge: 1.3125 }[c.scale]
    await page.evaluate((px) => {
      const s = document.createElement('style')
      s.id = '_sysbase'
      s.textContent = `html{font-size:${px}px !important}`
      document.head.appendChild(s)
    }, +(c.base * k).toFixed(3))
  }
  await go(page, { tab: 'Обзор' })
  await page.waitForTimeout(400)

  const m = await page.evaluate(() => {
    const out = { root: getComputedStyle(document.documentElement).fontSize, charts: [] }
    for (const card of document.querySelectorAll('.card')) {
      const h2 = card.querySelector('h2')
      const svg = card.querySelector('svg')
      if (!svg) continue
      const sr = svg.getBoundingClientRect()
      const texts = [...svg.querySelectorAll('text')].map((t) => {
        const r = t.getBoundingClientRect()
        const b = t.getBBox()
        const cs = getComputedStyle(t)
        return {
          txt: t.textContent.trim(),
          cls: t.getAttribute('class'),
          fs: cs.fontSize,
          rect: { top: +(r.top - sr.top).toFixed(2), bottom: +(r.bottom - sr.top).toFixed(2), left: +(r.left - sr.left).toFixed(2), right: +(r.right - sr.left).toFixed(2) },
          bbox: { y: +b.y.toFixed(2), h: +b.height.toFixed(2) },
        }
      })
      out.charts.push({ title: h2 ? h2.textContent.trim() : '?', svgH: +sr.height.toFixed(1), svgW: +sr.width.toFixed(1), texts })
    }
    return out
  })
  console.log('### ' + c.tag + '  root=' + m.root)
  for (const ch of m.charts) {
    console.log('  -- ' + ch.title + '  svg ' + ch.svgW + 'x' + ch.svgH)
    // подписи оси Y: класс chart__tick, textAnchor=end, левее оси
    const ticks = ch.texts.filter((t) => /^\d+$/.test(t.txt) && t.rect.right < 60)
    ticks.sort((a, b) => a.rect.top - b.rect.top)
    for (let i = 1; i < ticks.length; i++) {
      const gap = +(ticks[i].rect.top - ticks[i - 1].rect.bottom).toFixed(2)
      console.log(`     Y ${ticks[i-1].txt} -> ${ticks[i].txt}: боксы ${ticks[i-1].rect.top}..${ticks[i-1].rect.bottom} / ${ticks[i].rect.top}..${ticks[i].rect.bottom}  зазор ${gap}  fs=${ticks[i].fs}`)
    }
    const xrows = ch.texts.filter((t) => t.rect.bottom > ch.svgH - 60 && !/^\d+$/.test(t.txt))
    for (const t of xrows) console.log(`     X "${t.txt}" ${t.rect.top}..${t.rect.bottom} fs=${t.fs} cls=${t.cls}`)
  }

  // снимки самих графиков
  const cards = await page.locator('.card').all()
  let n = 0
  for (const card of cards) {
    const svg = card.locator('svg')
    if (await svg.count() === 0) continue
    const title = (await card.locator('h2').first().textContent().catch(() => '')) || ('c' + n)
    const safe = title.trim().replace(/[^\wА-Яа-яЁё]+/g, '_')
    await card.screenshot({ path: `${OUT}/${c.tag}__${safe}.png` })
    n++
  }
  await ctx.close()
}
await browser.close()
