import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4321'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

// Правка ровно как её описывает находка:
//   .segmented        -> + flex-wrap: wrap
//   .segmented button -> white-space: normal, min-width: 0, line-height: 1.2
//   .segmented--fill  -> остаётся только width: 100% и flex: 1 1 0
// Значения, которые правка у --fill убирает, возвращаем к базовым — иначе
// накладка не воспроизведёт итоговый CSS.
const PATCH = `
.segmented { flex-wrap: wrap; }
.segmented button { white-space: normal; min-width: 0; line-height: 1.2; }
.segmented--fill { display: inline-flex; width: 100%; }
.segmented--fill button { flex: 1 1 0; padding: 0 var(--space-3); }
`

const MEASURE = () => {
  const doc = document.documentElement
  const groups = [...document.querySelectorAll('.segmented')].map((g) => {
    const r = g.getBoundingClientRect()
    const cs = getComputedStyle(g)
    const btns = [...g.querySelectorAll('button')].map((b) => {
      const br = b.getBoundingClientRect()
      const bs = getComputedStyle(b)
      return {
        t: b.textContent.trim(),
        x: Math.round(br.left),
        r: Math.round(br.right),
        w: Math.round(br.width),
        h: Math.round(br.height),
        clipped: b.scrollWidth - b.clientWidth,
        pad: bs.padding,
        radius: bs.borderRadius,
        borderLeft: bs.borderLeftWidth,
        lines: Math.round(br.height / parseFloat(bs.lineHeight || '1')),
      }
    })
    // Ряды: кнопки с разным top = перенос строк внутри группы
    const tops = [...new Set(btns.map((b) => Math.round(document.querySelector('.segmented') ? 0 : 0)))]
    const realTops = [...new Set([...g.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().top)))]
    return {
      label: g.getAttribute('aria-label'),
      fill: g.className.includes('--fill'),
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      height: Math.round(r.height),
      display: cs.display,
      rows: realTops.length,
      overflowRight: Math.round(r.right) - doc.clientWidth,
      btns,
    }
  })
  return {
    clientWidth: doc.clientWidth,
    scrollWidth: doc.scrollWidth,
    sideScroll: doc.scrollWidth - doc.clientWidth,
    rootFont: getComputedStyle(doc).fontSize,
    groups,
  }
}

const browser = await chromium.launch()
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

const screens = [
  { name: 'otchet', go: { tool: 'Отчёт' } },
  { name: 'nastroyki', go: { tool: 'Настройки' } },
]

for (const phase of ['before', 'after']) {
  if (phase === 'after') await page.addStyleTag({ content: PATCH })
  for (const s of screens) {
    await go(page, s.go)
    await page.waitForTimeout(300)
    const m = await page.evaluate(MEASURE)
    console.log(`\n===== ${phase} / ${s.name} =====`)
    console.log(JSON.stringify(m, null, 1))
    await page.screenshot({ path: `${OUT}/um_${s.name}_${phase}.png`, fullPage: false })
  }
}

await browser.close()
