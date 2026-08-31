import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = 'http://localhost:4399'
const browser = await chromium.launch()

async function prep(width, scale) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await settle(page); await seed(page, FROZEN)
  await page.evaluate((s) => localStorage.setItem('textScale', s), scale)
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
  await page.evaluate(async (s) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp',3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
    const cur = await new Promise((res)=>{ const tx=db.transaction('meta','readonly'); const q=tx.objectStore('meta').get('settings'); q.onsuccess=()=>res(q.result||{}) })
    cur.textScale = s; cur.trackGlucose = true
    await new Promise((res,rej)=>{ const tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
    db.close()
  }, scale)
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
  return { ctx, page }
}

const PROBE = (sel) => {
  const g = document.querySelector(sel)
  if (!g) return { missing: true }
  const gr = g.getBoundingClientRect()
  const vw = document.documentElement.clientWidth
  const btns = [...g.querySelectorAll('button')].map((b) => {
    const r = b.getBoundingClientRect()
    const visL = Math.max(r.left, 0), visR = Math.min(r.right, vw)
    const visW = Math.max(0, visR - visL)
    const cx = (visL + visR) / 2, cy = (r.top + r.bottom) / 2
    const hit = document.elementFromPoint(cx, cy)
    return {
      text: b.textContent.trim(),
      pressed: b.getAttribute('aria-pressed'),
      left: +r.left.toFixed(1), right: +r.right.toFixed(1),
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      visibleW: +visW.toFixed(1),
      clipped: +(r.right - vw).toFixed(1),
      hitIsSelf: hit === b || b.contains(hit),
      tapPoint: [+cx.toFixed(1), +cy.toFixed(1)],
    }
  })
  return {
    vw,
    groupW: +gr.width.toFixed(1), groupRight: +gr.right.toFixed(1),
    docScrollW: document.documentElement.scrollWidth,
    docClientW: document.documentElement.clientWidth,
    bodyScrollW: document.body.scrollWidth,
    pageScrollsX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    rootFontPx: getComputedStyle(document.documentElement).fontSize,
    btns,
  }
}

const out = {}
for (const scale of ['xlarge']) {
  for (const width of [360, 320]) {
    const { ctx, page } = await prep(width, scale)
    const key = `${scale}-${width}`
    out[key] = {}

    // ---- ОТЧЁТ ----
    await go(page, { tool: 'Отчёт' }); await page.waitForTimeout(400)
    out[key].report = await page.evaluate(PROBE, '.segmented.no-print')

    // период до клика
    const periodBefore = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.card *')]
      const el = rows.find((e) => e.textContent.trim().startsWith('за ') && e.children.length === 0)
      return el ? el.textContent.trim().slice(0, 60) : null
    })

    // КЛИК по видимой части обрезанной кнопки «Всё время»
    const last = out[key].report.btns[out[key].report.btns.length - 1]
    let clickErr = null
    try {
      await page.mouse.click(last.tapPoint[0], last.tapPoint[1])
      await page.waitForTimeout(500)
    } catch (e) { clickErr = String(e).slice(0, 120) }

    const after = await page.evaluate(() => {
      const g = document.querySelector('.segmented.no-print')
      const btns = [...g.querySelectorAll('button')].map((b) => ({ t: b.textContent.trim(), p: b.getAttribute('aria-pressed') }))
      const rows = [...document.querySelectorAll('.card *')]
      const el = rows.find((e) => e.textContent.trim().startsWith('за ') && e.children.length === 0)
      return { btns, periodText: el ? el.textContent.trim().slice(0, 80) : null }
    })
    out[key].clickResult = { clickErr, periodBefore, ...after }

    // сколько записей попало в отчёт (значения — не обрезаны ли ЦИФРЫ)
    out[key].reportNumbers = await page.evaluate(() => {
      const bad = []
      document.querySelectorAll('.card, table').forEach(() => {})
      const walk = (n) => {
        if (n.nodeType === 3 && n.textContent.trim()) {
          const rg = document.createRange(); rg.selectNodeContents(n)
          const vw = document.documentElement.clientWidth
          for (const r of rg.getClientRects()) {
            if (r.width > 0 && r.right > vw + 0.5) bad.push({ txt: n.textContent.trim().slice(0, 40), right: +r.right.toFixed(1), vw })
          }
        } else n.childNodes?.forEach(walk)
      }
      walk(document.body)
      return bad
    })

    // печатный вид: попадает ли переключатель в PDF врачу
    await page.emulateMedia({ media: 'print' })
    await page.waitForTimeout(300)
    out[key].printPicker = await page.evaluate(() => {
      const g = document.querySelector('.segmented.no-print')
      if (!g) return { inDom: false }
      const cs = getComputedStyle(g); const r = g.getBoundingClientRect()
      return { inDom: true, display: cs.display, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 }
    })
    await page.emulateMedia({ media: 'screen' })
    await page.waitForTimeout(200)

    // ---- НАСТРОЙКИ: переключатель пользователя ----
    await go(page, { tool: 'Настройки' }); await page.waitForTimeout(400)
    out[key].settings = await page.evaluate(() => {
      const g = [...document.querySelectorAll('.segmented')].find((e) => e.getAttribute('aria-label') === 'Пользователь прибора')
      if (!g) return { missing: true, note: 'скрыт (showUserPicker=false)' }
      const vw = document.documentElement.clientWidth; const r = g.getBoundingClientRect()
      return { groupRight: +r.right.toFixed(1), vw, clipped: +(r.right - vw).toFixed(1),
        btns: [...g.querySelectorAll('button')].map((b) => b.textContent.trim()) }
    })

    // ---- ОБЗОР: альтернативный переключатель периода (--fill) ----
    await go(page, { tab: 'Обзор' }); await page.waitForTimeout(400)
    out[key].overviewPicker = await page.evaluate(PROBE, '.segmented--fill')

    await ctx.close()
  }
}
console.log(JSON.stringify(out, null, 2))
await browser.close()
