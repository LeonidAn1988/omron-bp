/** Замер переполнения .segmented--fill: вред или косметика. */
import { chromium } from 'playwright'
import { seed, go, settle, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4711'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/vrd2'
const browser = await chromium.launch()

const MEASURE = () => {
  const out = []
  for (const seg of document.querySelectorAll('.segmented--fill')) {
    const label = seg.getAttribute('aria-label')
    const btns = [...seg.querySelectorAll('button')]
    const card = seg.closest('.card')
    const cr = card ? card.getBoundingClientRect() : { left: 0, right: innerWidth }
    const cs = card ? getComputedStyle(card) : { paddingLeft: '0px', paddingRight: '0px' }
    const innerL = cr.left + parseFloat(cs.paddingLeft)
    const innerR = cr.right - parseFloat(cs.paddingRight)
    // проверка обрезки: есть ли предок с overflow hidden/clip
    let clipper = null
    for (let el = seg; el && el !== document.documentElement; el = el.parentElement) {
      const o = getComputedStyle(el).overflow
      if (o.includes('hidden') || o.includes('clip') || o.includes('auto') || o.includes('scroll')) {
        clipper = el.className + '|' + o
        break
      }
    }
    const items = btns.map((b) => {
      const bb = b.getBoundingClientRect()
      const rng = document.createRange()
      rng.selectNodeContents(b)
      const rects = [...rng.getClientRects()]
      const tl = Math.min(...rects.map((r) => r.left))
      const trr = Math.max(...rects.map((r) => r.right))
      const bs = getComputedStyle(b)
      const lh = parseFloat(bs.lineHeight)
      const lines = new Set(rects.map((r) => Math.round(r.top))).size
      // hit-test по сетке внутри кнопки
      const cxs = [0.1, 0.25, 0.5, 0.75, 0.9]
      const cys = [0.25, 0.5, 0.75]
      let foreign = 0
      for (const fx of cxs) for (const fy of cys) {
        const el = document.elementFromPoint(bb.left + bb.width * fx, bb.top + bb.height * fy)
        if (!el || (el !== b && !b.contains(el))) foreign++
      }
      // куда попадёт палец, если ткнуть в самый хвост нарисованного текста
      const tailEl = document.elementFromPoint(Math.min(trr - 2, innerWidth - 1), bb.top + bb.height / 2)
      return {
        t: b.textContent.trim(),
        box: [+bb.left.toFixed(1), +bb.right.toFixed(1)],
        w: +bb.width.toFixed(1),
        h: +bb.height.toFixed(1),
        textW: +(trr - tl).toFixed(1),
        overR: +(trr - bb.right).toFixed(1),
        overL: +(bb.left - tl).toFixed(1),
        lines,
        fs: bs.fontSize,
        outOfCardR: +(trr - innerR).toFixed(1),
        outOfViewport: +(trr - innerWidth).toFixed(1),
        foreignHits: foreign,
        tailHit: tailEl ? (tailEl === b || b.contains(tailEl) ? 'self' : (tailEl.tagName + '.' + (tailEl.className || '')) ) : 'none',
      }
    })
    // наложение соседних подписей
    let overlap = 0
    for (let i = 0; i + 1 < btns.length; i++) {
      const a = document.createRange(); a.selectNodeContents(btns[i])
      const b2 = document.createRange(); b2.selectNodeContents(btns[i + 1])
      const ar = a.getBoundingClientRect(), br = b2.getBoundingClientRect()
      overlap = Math.max(overlap, +(ar.right - br.left).toFixed(1))
    }
    out.push({ label, clipper, overlap, items })
  }
  return out
}

const rows = []
for (const scale of ['normal', 'large', 'xlarge']) {
  for (const density of ['normal', 'roomy']) {
    for (const width of [320, 360, 412]) {
      const ctx = await browser.newContext({
        viewport: { width, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
        colorScheme: 'light', deviceScaleFactor: 2, hasTouch: true, isMobile: true,
      })
      const page = await ctx.newPage()
      await page.clock.install({ time: new Date(FROZEN) })
      await page.goto(URL, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1200)
      await seed(page, FROZEN)
      await page.evaluate(async ([sc, de]) => {
        const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
        const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
        cur.textScale = sc; cur.density = de; cur.onboarded = true
        await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
        db.close()
      }, [scale, density])
      await page.reload({ waitUntil: 'domcontentloaded' })
      await settle(page)

      await go(page, { tab: 'Аптечка' })
      const cab = await page.evaluate(MEASURE)
      await page.screenshot({ path: `${OUT}/cab-${width}-${scale}-${density}.png`, clip: { x: 0, y: 0, width, height: 420 } })

      await go(page, { tool: 'Настройки' })
      await page.evaluate(() => {
        const t = [...document.querySelectorAll('.tile__label')].find((e) => e.textContent.includes('Размер текста'))
        if (t) t.scrollIntoView({ block: 'center' })
      })
      await page.waitForTimeout(200)
      const set = await page.evaluate(MEASURE)
      await page.screenshot({ path: `${OUT}/set-${width}-${scale}-${density}.png` })

      rows.push({ width, scale, density, cab, set })
      await ctx.close()
    }
  }
}
await browser.close()
const fs = await import('node:fs')
fs.writeFileSync(`${OUT}/data.json`, JSON.stringify(rows, null, 1))

// краткая сводка
for (const r of rows) {
  for (const grp of [...r.cab, ...r.set]) {
    const bad = grp.items.filter((i) => i.overR > 0.5 || i.overL > 0.5)
    if (bad.length || grp.overlap > 0 || grp.items.some((i) => i.foreignHits) || grp.items.some((i) => i.outOfCardR > 0.5))
      console.log(`${r.width}/${r.scale}/${r.density} «${grp.label}» clip=${grp.clipper} overlapLabels=${grp.overlap}`,
        bad.map((i) => `${i.t}: w=${i.w} textW=${i.textW} L${i.lines} over=${i.overR}/${i.overL} card=${i.outOfCardR} vp=${i.outOfViewport} foreign=${i.foreignHits} tail=${i.tailHit}`).join(' | '))
  }
}
