import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()

const cases = [
  { text: 'xlarge', density: 'roomy', w: 375 },
  { text: 'xlarge', density: undefined, w: 375 },
  { text: 'normal', density: undefined, w: 375 },
  { text: 'xlarge', density: 'roomy', w: 320 },
]

for (const c of cases) {
  const ctx = await browser.newContext({
    viewport: { width: c.w, height: 900 },
    locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'light', deviceScaleFactor: 3,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  await seed(page, FROZEN)
  await page.evaluate(async ({ t, d }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = t; cur.onboarded = true
    if (d) cur.density = d
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
    localStorage.setItem('textScale', t)
    if (d) localStorage.setItem('density', d)
  }, { t: c.text, d: c.density })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(600)
  await go(page, { tab: 'Давление' })
  await page.waitForTimeout(500)

  const m = await page.evaluate(() => {
    const root = document.documentElement
    const cs = getComputedStyle(root)
    const rows = [...document.querySelectorAll('.readings-table tbody tr:not([data-editor])')]
    // Ink-точная рамка текста внутри элемента: объединение прямоугольников Range
    const inkRect = (el) => {
      if (!el) return null
      const r = document.createRange()
      r.selectNodeContents(el)
      const rs = [...r.getClientRects()]
      if (!rs.length) return null
      return {
        l: Math.min(...rs.map(x=>x.left)), r: Math.max(...rs.map(x=>x.right)),
        t: Math.min(...rs.map(x=>x.top)), b: Math.max(...rs.map(x=>x.bottom)),
      }
    }
    const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l:r.left, r:r.right, t:r.top, b:r.bottom, w:r.width, h:r.height } }

    const out = rows.slice(0, 4).map((tr) => {
      const badge = tr.querySelector("td[data-col='cat'] .badge")
      const badgeText = badge ? [...badge.childNodes].find(n=>n.nodeType===3 && n.textContent.trim()) : null
      const badgeInk = (() => {
        if (!badge) return null
        const r = document.createRange()
        // весь бейдж, включая точку
        r.selectNodeContents(badge)
        const rs = [...r.getClientRects()]
        return rs.length ? { l: Math.min(...rs.map(x=>x.left)), r: Math.max(...rs.map(x=>x.right)) } : null
      })()
      // ink только по текстовому узлу
      let textInk = null
      if (badgeText) {
        const r = document.createRange(); r.selectNode(badgeText)
        const rs = [...r.getClientRects()]
        if (rs.length) textInk = { l: Math.min(...rs.map(x=>x.left)), r: Math.max(...rs.map(x=>x.right)), t: Math.min(...rs.map(x=>x.top)), b: Math.max(...rs.map(x=>x.bottom)) }
      }
      const pencil = tr.querySelector('.row-edit')
      const trash = tr.querySelector('.btn--icon')
      const psvg = pencil?.querySelector('svg')
      const tsvg = trash?.querySelector('svg')
      const del = tr.querySelector("td[data-col='del']")
      const note = tr.querySelector("td[data-col='note']")
      const marks = tr.querySelector("td[data-col='marks']")
      const bpm = tr.querySelector("td[data-col='bpm']")

      // что реально лежит поверх правого края текста бейджа
      let hitAtTextRight = null, hitAtTextRightMinus = null
      if (textInk) {
        const y = (textInk.t + textInk.b) / 2
        const e1 = document.elementFromPoint(Math.min(textInk.r - 1, innerWidth - 1), y)
        hitAtTextRight = e1 ? (e1.className?.baseVal ?? e1.className ?? e1.tagName) + '|' + e1.tagName : null
        const e2 = document.elementFromPoint(Math.max(textInk.l + 2, 0), y)
        hitAtTextRightMinus = e2 ? (e2.className?.baseVal ?? e2.className ?? e2.tagName) + '|' + e2.tagName : null
      }

      return {
        when: tr.querySelector("td[data-col='when']")?.textContent,
        badgeLabel: badge?.textContent?.trim(),
        rowBox: box(tr),
        badgeBox: box(badge),
        badgeInk,
        textInk,
        pencilBox: box(pencil),
        pencilGlyph: box(psvg),
        trashBox: box(trash),
        trashGlyph: box(tsvg),
        delBox: box(del),
        noteBox: box(note), noteInk: inkRect(note),
        marksBox: box(marks), marksInk: inkRect(marks),
        bpmBox: box(bpm), bpmInk: inkRect(bpm),
        hitAtTextRight, hitAtTextRightMinus,
      }
    })

    return {
      dataText: root.getAttribute('data-text'),
      dataDensity: root.getAttribute('data-density'),
      rootFont: cs.fontSize,
      tap: cs.getPropertyValue('--tap'),
      spaceUnit: cs.getPropertyValue('--space-unit'),
      innerWidth,
      rows: out,
    }
  })

  const tag = `${c.text}_${c.density ?? 'default'}_${c.w}`
  console.log(`\n########## ${tag} ##########`)
  console.log(JSON.stringify(m, null, 1))

  // Снимок области списка
  const first = await page.$('.readings-table tbody tr')
  if (first) {
    await first.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    const tbl = await page.$('.readings-table')
    await tbl.screenshot({ path: `${OUT}/pencil_${tag}.png` })
  }
  await ctx.close()
}
await browser.close()
