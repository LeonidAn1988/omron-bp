/** Точная геометрия: видимый глиф карандаша против видимого текста строки. */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-15T10:30:00').getTime()
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/refdel'
mkdirSync(OUT, { recursive: true })

async function seed(page, now, scale, density) {
  await page.evaluate(async ([now, scale, density]) => {
    const DAY = 86400000
    const midnight = (ts) => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime() }
    const day0 = midnight(now)
    const at = (o, h) => day0 + o * DAY + h * 3600000
    const readings = []
    for (let i = -29; i <= 0; i++) {
      readings.push({
        id: `bp-${i}`, kind: 'bp', ts: at(i, 8) + 600000, user: 1, source: 'manual',
        sys: 128 + ((i % 7) + 7) % 7, dia: 82 + ((i % 4) + 4) % 4,
        bpm: 68 + ((i % 5) + 5) % 5, ihb: i % 11 === 0, mov: false,
      })
    }
    // Заведомо длинные подписи категорий: «Высокое нормальное», «Гипертония 1 степени» …
    const extra = [[135, 86], [145, 92], [165, 105], [185, 115], [118, 76], [128, 88]]
    extra.forEach(([sys, dia], k) => readings.push({
      id: `bpx-${k}`, kind: 'bp', ts: at(-40 - k, 9) + 600000, user: 1, source: 'manual',
      sys, dia, bpm: 70, ihb: false, mov: false,
    }))
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    await new Promise((res, rej) => {
      const tx = db.transaction(['readings', 'meta'], 'readwrite')
      readings.forEach((r) => tx.objectStore('readings').put(r))
      tx.objectStore('meta').put({ onboarded: true, textScale: scale, density }, 'settings')
      tx.oncomplete = res; tx.onerror = () => rej(tx.error)
    })
    db.close()
  }, [now, scale, density])
}

async function run({ width, scale, density, label }) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await seed(page, FROZEN, scale, density)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
  await page.waitForTimeout(500)
  // период «Всё время», чтобы попали и старые записи с длинными категориями
  const all = page.locator('button', { hasText: 'Всё время' }).first()
  if (await all.count()) { await all.click(); await page.waitForTimeout(400) }

  const res = await page.evaluate(() => {
    const rc = (e) => { const b = e.getBoundingClientRect(); return { l: +b.left.toFixed(1), r: +b.right.toFixed(1), t: +b.top.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) } }
    const rows = [...document.querySelectorAll('.readings-table tbody tr')].filter((tr) => !tr.dataset.editor)
    const out = []
    for (const tr of rows) {
      const badge = tr.querySelector("td[data-col='cat'] .badge")
      if (!badge) continue
      const pencil = tr.querySelector('.row-edit')
      const svg = pencil ? pencil.querySelector('svg') : null
      const trash = tr.querySelector('.btn--icon')
      const svg2 = trash ? trash.querySelector('svg') : null
      // самый правый видимый текстовый прямоугольник всей строки (кроме колонки действий)
      let maxTextR = -1, maxWho = null, maxRect = null
      for (const td of tr.querySelectorAll('td')) {
        if (td.dataset.col === 'del') continue
        if (getComputedStyle(td).display === 'none') continue
        const rng = document.createRange(); rng.selectNodeContents(td)
        for (const b of rng.getClientRects()) {
          if (b.width === 0) continue
          if (b.right > maxTextR) { maxTextR = b.right; maxWho = td.dataset.col; maxRect = { l: +b.left.toFixed(1), r: +b.right.toFixed(1), t: +b.top.toFixed(1), b: +b.bottom.toFixed(1) } }
        }
      }
      out.push({
        cat: badge.innerText.trim().replace(/\s+/g, ' '),
        val: tr.querySelector("td[data-col='val']")?.innerText.trim(),
        badgeBox: rc(badge),
        pencilBtn: pencil ? rc(pencil) : null,
        pencilGlyph: svg ? rc(svg) : null,
        trashGlyph: svg2 ? rc(svg2) : null,
        rightmostText: { col: maxWho, rect: maxRect },
        gapGlyphToBadge: svg ? +(rc(svg).l - rc(badge).r).toFixed(1) : null,
        gapGlyphToRightmostText: svg && maxRect ? +(rc(svg).l - maxRect.r).toFixed(1) : null,
        badgeVsPencilBoxOverlapX: pencil ? +(rc(badge).r - rc(pencil).l).toFixed(1) : null,
        vertOverlapBadgePencil: pencil ? (rc(badge).t < rc(pencil).b && rc(pencil).t < rc(badge).b) : null,
      })
    }
    const cs = getComputedStyle(document.documentElement)
    return { rootFont: cs.fontSize, spaceUnit: cs.getPropertyValue('--space-unit').trim(), rows: out }
  })

  console.log(`\n============ ${label} (ширина ${width}, шрифт ${scale}, плотность ${density}) ============`)
  console.log('root font', res.rootFont, 'space-unit', res.spaceUnit)
  const seen = new Set()
  for (const r of res.rows) {
    if (seen.has(r.cat)) continue
    seen.add(r.cat)
    console.log(`  «${r.cat}»  ${r.val}`)
    console.log(`     значок: ${r.badgeBox.l}…${r.badgeBox.r}   кнопка-карандаш: ${r.pencilBtn.l}…${r.pencilBtn.r}   глиф карандаша: ${r.pencilGlyph.l}…${r.pencilGlyph.r}`)
    console.log(`     пересечение коробок значка и кнопки по X: ${r.badgeVsPencilBoxOverlapX} (по Y пересекаются: ${r.vertOverlapBadgePencil})`)
    console.log(`     ЗАЗОР глиф↔значок: ${r.gapGlyphToBadge}px;  глиф↔самый правый текст строки (${r.rightmostText.col}): ${r.gapGlyphToRightmostText}px`)
  }

  // самая широкая категория — снимаем крупно
  let worst = null
  for (const r of res.rows) if (!worst || r.badgeBox.r > worst.badgeBox.r) worst = r
  console.log(`  ХУДШИЙ случай: «${worst.cat}» правый край значка ${worst.badgeBox.r}, левый край глифа ${worst.pencilGlyph.l}, зазор ${worst.gapGlyphToBadge}px`)

  const idx = res.rows.indexOf(worst)
  const tr = page.locator('.readings-table tbody tr').nth(idx)
  await tr.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await page.waitForTimeout(250)
  const bb = await tr.boundingBox()
  await page.screenshot({ path: `${OUT}/${label}.png`, clip: { x: 0, y: Math.max(0, bb.y - 10), width, height: Math.min(260, bb.height + 30) } })

  // что под самым правым пикселем текста категории — кнопка или текст?
  const hit = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.readings-table tbody tr')].filter((tr) => !tr.dataset.editor)
    let worst = null
    for (const tr of rows) { const b = tr.querySelector("td[data-col='cat'] .badge"); if (b && (!worst || b.getBoundingClientRect().right > worst.getBoundingClientRect().right)) worst = b }
    const b = worst.getBoundingClientRect()
    const pts = []
    for (const dx of [-2, -8, -20]) {
      const x = b.right + dx, y = (b.top + b.bottom) / 2
      const el = document.elementFromPoint(x, y)
      pts.push({ x: +x.toFixed(1), y: +y.toFixed(1), el: el ? `${el.tagName}.${el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className}` : 'нет', inButton: !!(el && el.closest && el.closest('button')) })
    }
    return { badge: { l: +b.left.toFixed(1), r: +b.right.toFixed(1) }, pts }
  })
  console.log('  проба нажатия по хвосту подписи категории:', JSON.stringify(hit))
  await browser.close()
}

await run({ width: 375, scale: 'normal', density: 'normal', label: 'device-375-obychnyi' })
await run({ width: 300, scale: 'normal', density: 'normal', label: 'device-300-krupnyi' })
