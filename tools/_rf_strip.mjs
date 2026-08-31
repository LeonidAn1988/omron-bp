import { chromium } from 'playwright'
import { FROZEN, seed, settle, go } from './visual.mjs'

const URL = process.env.URL ?? 'http://localhost:5311'
const VW = Number(process.env.VW || 406)
const VH = 900

async function run(text, density, theme) {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    colorScheme: theme === 'dark' ? 'dark' : 'light',
  })
  const page = await context.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await seed(page, FROZEN)
  // настройки пишем сами: seed кладёт только trackGlucose
  await page.evaluate(async ([t, d, th]) => {
    const db = await new Promise((res, rej) => {
      const q = indexedDB.open('omron-bp', 3)
      q.onsuccess = () => res(q.result)
      q.onerror = () => rej(q.error)
    })
    await new Promise((res, rej) => {
      const tx = db.transaction(['meta'], 'readwrite')
      tx.objectStore('meta').put(
        { trackGlucose: true, onboarded: true, textScale: t || 'normal', density: d || 'normal', theme: th },
        'settings',
      )
      tx.oncomplete = res
      tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, [text, density, theme])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.waitForTimeout(400)
  await go(page, { tab: 'Обзор' })
  await page.waitForTimeout(500)

  const out = await page.evaluate(() => {
    const strip = document.querySelector('.stats-strip')
    if (!strip) return { missing: true, body: document.body.innerText.slice(0, 300) }
    const cs = getComputedStyle(strip)
    const sr = strip.getBoundingClientRect()
    const cells = [...strip.children].map((c) => {
      const label = c.querySelector('.tile__label')
      const value = c.querySelector('.tile__value')
      const r = (el) => {
        if (!el) return null
        const b = el.getBoundingClientRect()
        return { top: +(b.top + window.scrollY).toFixed(1), h: +b.height.toFixed(1), w: +b.width.toFixed(1), left: +(b.left + window.scrollX).toFixed(1) }
      }
      const lcs = label ? getComputedStyle(label) : null
      const lines = label ? Math.round(label.getBoundingClientRect().height / parseFloat(lcs.lineHeight)) : 0
      return {
        label: label ? label.textContent : null,
        labelRect: r(label),
        lh: lcs ? lcs.lineHeight : null,
        fs: lcs ? lcs.fontSize : null,
        lines,
        valueText: value ? value.textContent : null,
        valueRect: r(value),
        cellRect: r(c),
      }
    })
    return {
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
      attrs: document.documentElement.getAttribute('data-text') + '/' + document.documentElement.getAttribute('data-density'),
      spaceUnit: getComputedStyle(document.documentElement).getPropertyValue('--space-unit'),
      gridCols: cs.gridTemplateColumns,
      stripRect: { top: +(sr.top + window.scrollY).toFixed(1), w: +sr.width.toFixed(1), h: +sr.height.toFixed(1) },
      cells,
    }
  })

  await browser.close()
  return out
}

const combos = [
  ['normal', 'normal', 'dark'],
  ['xlarge', 'roomy', 'dark'],
  ['xlarge', 'normal', 'dark'],
  ['normal', 'roomy', 'dark'],
  ['large', 'roomy', 'dark'],
  ['xlarge', 'roomy', 'light'],
  ['xlarge', 'compact', 'dark'],
]
for (const [t, d, th] of combos) {
  const r = await run(t, d, th)
  console.log('\n===== text=' + t + ' density=' + d + ' theme=' + th + ' vw=' + VW + ' =====')
  if (r.missing) { console.log('НЕТ .stats-strip |', r.body); continue }
  console.log('root', r.rootFontSize, '| attrs', r.attrs, '| space-unit', r.spaceUnit.trim(), '| cols', r.gridCols)
  console.log('strip top', r.stripRect.top, 'w', r.stripRect.w, 'h', r.stripRect.h)
  for (const c of r.cells) {
    console.log(`  «${c.label}» lines=${c.lines} lh=${c.lh} fs=${c.fs} labelTop=${c.labelRect.top} labelH=${c.labelRect.h} labelW=${c.labelRect.w}`)
    console.log(`      value «${(c.valueText || '').trim()}» top=${c.valueRect ? c.valueRect.top : null} left=${c.valueRect ? c.valueRect.left : null} | cell top=${c.cellRect.top} left=${c.cellRect.left} h=${c.cellRect.h}`)
  }
}
