import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'
const URL = 'http://localhost:4399'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

async function prep({ width = 375, scale = 'xlarge', density = 'roomy', theme = 'dark' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: theme, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200); await seed(page, FROZEN)
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
  await page.evaluate(async ({ s, d, t }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp',3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
    const cur = await new Promise((res)=>{ const tx=db.transaction('meta','readonly'); const q=tx.objectStore('meta').get('settings'); q.onsuccess=()=>res(q.result||{}) })
    cur.textScale = s; cur.density = d; cur.theme = t; cur.trackGlucose = true
    await new Promise((res,rej)=>{ const tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
    db.close()
  }, { s: scale, d: density, t: theme })
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
  return { ctx, page }
}

const PROBE = () => {
  const out = []
  for (const g of document.querySelectorAll('.segmented--fill')) {
    const gr = g.getBoundingClientRect()
    const btns = [...g.querySelectorAll('button')].map((b) => {
      const r = b.getBoundingClientRect()
      const cs = getComputedStyle(b)
      const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight)
      const contentL = r.left + padL, contentR = r.right - padR
      // ink rect of the text
      const node = [...b.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
      let ink = null
      if (node) {
        const range = document.createRange(); range.selectNodeContents(node)
        const rects = [...range.getClientRects()]
        const l = Math.min(...rects.map(x=>x.left)), rr = Math.max(...rects.map(x=>x.right))
        ink = { left: +l.toFixed(1), right: +rr.toFixed(1), w: +(rr-l).toFixed(1), lines: rects.length }
      }
      // per-character hit test: which characters are covered by a sibling?
      let hidden = []
      if (node) {
        const text = node.textContent
        for (let i = 0; i < text.length; i++) {
          const rg = document.createRange(); rg.setStart(node, i); rg.setEnd(node, i+1)
          const cr = rg.getBoundingClientRect()
          if (!cr.width) continue
          const cx = (cr.left + cr.right)/2, cy = (cr.top + cr.bottom)/2
          const top = document.elementFromPoint(cx, cy)
          if (top !== b && !b.contains(top)) hidden.push({ ch: text[i], i, top: top ? (top.tagName + '.' + top.className + '|' + (top.textContent||'').trim().slice(0,12)) : null })
        }
      }
      return {
        text: b.textContent.trim(),
        pressed: b.getAttribute('aria-pressed'),
        w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        contentW: +(contentR - contentL).toFixed(1),
        scrollW: b.scrollWidth, clientW: b.clientWidth,
        ink,
        overflowL: ink ? +(contentL - ink.left).toFixed(1) : null,
        overflowR: ink ? +(ink.right - contentR).toFixed(1) : null,
        outsideGroupR: ink ? +(ink.right - gr.right).toFixed(1) : null,
        hiddenChars: hidden,
        fontSize: cs.fontSize, wsp: cs.whiteSpace, ow: cs.overflowWrap, ovf: cs.overflow,
      }
    })
    out.push({ label: g.getAttribute('aria-label'), groupW: +gr.width.toFixed(1), groupTop: +gr.top.toFixed(1), btns })
  }
  return { rootFont: getComputedStyle(document.documentElement).fontSize, vw: document.documentElement.clientWidth, groups: out }
}

const results = {}
for (const cfg of [
  { key: 'xlarge-roomy-375', scale: 'xlarge', density: 'roomy', width: 375 },
  { key: 'xlarge-normal-375', scale: 'xlarge', density: 'normal', width: 375 },
  { key: 'normal-normal-375', scale: 'normal', density: 'normal', width: 375 },
  { key: 'xlarge-roomy-360', scale: 'xlarge', density: 'roomy', width: 360 },
]) {
  const { ctx, page } = await prep(cfg)
  // Настройки
  await go(page, { tool: 'Настройки' })
  results[cfg.key] = { settings: await page.evaluate(PROBE) }
  if (cfg.key === 'xlarge-roomy-375') {
    await page.screenshot({ path: `${OUT}/seg_settings_full.png`, fullPage: true })
  }
  // Аптечка
  await page.locator('header button', { hasText: 'Настройки' }).first().click()
  await page.waitForTimeout(200)
  await go(page, { tab: 'Аптечка' })
  results[cfg.key].cabinet = await page.evaluate(PROBE)
  if (cfg.key === 'xlarge-roomy-375') {
    await page.screenshot({ path: `${OUT}/seg_cabinet_full.png`, fullPage: true })
  }
  await ctx.close()
}
console.log(JSON.stringify(results, null, 1))
await browser.close()
