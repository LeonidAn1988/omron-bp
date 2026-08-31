/** Опровержение находки: «карандаш и корзина в истории залезают на текст строки». */
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

const R = (e) => { const b = e.getBoundingClientRect(); return { l: +b.left.toFixed(1), r: +b.right.toFixed(1), t: +b.top.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) } }

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
  await page.waitForTimeout(600)
  await page.waitForSelector('.readings-table tr[data-col], .readings-table tbody tr', { timeout: 20000 })

  const data = await page.evaluate(() => {
    const rect = (e) => { const b = e.getBoundingClientRect(); return { l: +b.left.toFixed(1), r: +b.right.toFixed(1), t: +b.top.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) } }
    const cs = getComputedStyle(document.documentElement)
    const tr = document.querySelector('.readings-table tbody tr')
    if (!tr) return { err: 'нет строки' }
    const trs = getComputedStyle(tr)
    const trR = rect(tr)
    const del = tr.querySelector("td[data-col='del']")
    const pencil = tr.querySelector('.row-edit')
    const trash = tr.querySelector('.btn--icon')
    const cat = tr.querySelector("td[data-col='cat']")
    const badge = cat ? cat.querySelector('.badge') : null
    const contentRight = trR.r - parseFloat(trs.paddingRight) - parseFloat(trs.borderRightWidth || 0)

    // текстовые прямоугольники всех видимых ячеек (client rects текста)
    const cells = [...tr.querySelectorAll('td')].filter((td) => getComputedStyle(td).display !== 'none').map((td) => {
      const rng = document.createRange(); rng.selectNodeContents(td)
      const rs = [...rng.getClientRects()].map((b) => ({ l: +b.left.toFixed(1), r: +b.right.toFixed(1), t: +b.top.toFixed(1), b: +b.bottom.toFixed(1) }))
      return { col: td.dataset.col, box: rect(td), text: td.innerText.trim().replace(/\s+/g, ' '), textRects: rs }
    })

    const overlaps = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b
    const pR = pencil ? rect(pencil) : null
    const tR = trash ? rect(trash) : null
    const collisions = []
    for (const c of cells) {
      if (c.col === 'del') continue
      for (const rr of c.textRects) {
        if (overlaps(pR, rr)) collisions.push({ col: c.col, with: 'карандаш', textRect: rr, overlapX: +(rr.r - pR.l).toFixed(1) })
        if (overlaps(tR, rr)) collisions.push({ col: c.col, with: 'корзина', textRect: rr, overlapX: +(rr.r - tR.l).toFixed(1) })
      }
    }

    // что реально лежит под левым краем карандаша, по вертикали центра
    const probe = []
    if (pR) {
      for (const dx of [0.5, 4, 10]) {
        const x = pR.l + dx, y = (pR.t + pR.b) / 2
        const el = document.elementFromPoint(x, y)
        probe.push({ x: +x.toFixed(1), y: +y.toFixed(1), el: el ? (el.className || el.tagName) + ' «' + (el.textContent || '').trim().slice(0, 30) + '»' : 'нет' })
      }
    }

    return {
      rootFont: cs.fontSize,
      tap: cs.getPropertyValue('--tap').trim(),
      spaceUnit: cs.getPropertyValue('--space-unit').trim(),
      trBox: trR,
      trPaddingRight: trs.paddingRight,
      contentRight: +contentRight.toFixed(1),
      delBox: del ? rect(del) : null,
      delDisplay: del ? getComputedStyle(del).display + '/' + getComputedStyle(del).position : null,
      pencil: pR, trash: tR,
      badge: badge ? { ...rect(badge), text: badge.innerText.trim() } : null,
      cells,
      collisions,
      probe,
      pairWidth: pR && tR ? +(tR.r - pR.l).toFixed(1) : null,
      reserved: +parseFloat(trs.paddingRight).toFixed(1),
      overflowIntoContent: pR ? +(contentRight - pR.l).toFixed(1) : null,
    }
  })

  console.log(`\n================ ${label} (ширина ${width}, шрифт ${scale}, плотность ${density}) ================`)
  console.log(JSON.stringify(data, null, 1))

  const tr = page.locator('.readings-table tbody tr').first()
  await tr.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${OUT}/${label}.png` , clip: await (async () => { const b = await tr.boundingBox(); return { x: 0, y: Math.max(0, b.y - 20), width, height: Math.min(300, b.height + 60) } })() })
  await browser.close()
}

await run({ width: 375, scale: 'normal', density: 'normal', label: '375-obychnyi' })
await run({ width: 375, scale: 'xlarge', density: 'normal', label: '375-xlarge' })
await run({ width: 375, scale: 'xlarge', density: 'roomy', label: '375-xlarge-roomy' })
await run({ width: 360, scale: 'xlarge', density: 'roomy', label: '360-xlarge-roomy' })
