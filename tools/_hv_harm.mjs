import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4399'
const browser = await chromium.launch()

async function prep(width, scale, density) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  await seed(page, FROZEN)
  await page.evaluate(([s,d]) => { localStorage.setItem('textScale', s); localStorage.setItem('density', d) }, [scale, density])
  await page.evaluate(async ([s,d]) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp',3); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error) })
    const cur = await new Promise((res)=>{ const tx=db.transaction('meta','readonly'); const q=tx.objectStore('meta').get('settings'); q.onsuccess=()=>res(q.result||{}) })
    cur.textScale = s; cur.density = d; cur.trackGlucose = true; cur.onboarded = true
    await new Promise((res,rej)=>{ const tx=db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete=res; tx.onerror=()=>rej(tx.error) })
    db.close()
  }, [scale, density])
  await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
  return { ctx, page }
}

const CLIPPED2 = () => {
  const vw = document.documentElement.clientWidth
  const scrollableAncestor = (el) => {
    let n = el
    while (n && n !== document.body) {
      const cs = getComputedStyle(n)
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 1) return n
      n = n.parentElement
    }
    return null
  }
  const out = []
  const walk = (n) => {
    if (n.nodeType === 3 && n.textContent.trim()) {
      const rg = document.createRange(); rg.selectNodeContents(n)
      for (const r of rg.getClientRects()) {
        if (r.width > 0 && r.right > vw + 0.5) {
          const p = n.parentElement
          const sc = scrollableAncestor(p)
          out.push({
            txt: n.textContent.trim().slice(0,40),
            right: +r.right.toFixed(1),
            inSeg: !!(p && p.closest('.segmented')),
            insideScroller: sc ? (sc.className || sc.tagName) : null,
            scrollerScrollLeft: sc ? sc.scrollLeft : null,
          })
        }
      }
    } else n.childNodes?.forEach(walk)
  }
  walk(document.body)
  return out
}

const cases = [
  [360,'small','compact'], [360,'large','roomy'], [360,'xlarge','roomy'],
]
const res = {}
for (const [w,s,d] of cases) {
  const { ctx, page } = await prep(w,s,d)
  await go(page, { tool: 'Отчёт' }); await page.waitForTimeout(350)
  const key = `${w}-${s}-${d}`
  res[key] = {}
  res[key].clipped = await page.evaluate(CLIPPED2)

  // 1. можно ли докрутить страницу вбок и нажать «Всё время»
  res[key].reach = await page.evaluate(async () => {
    const de = document.documentElement
    const g = document.querySelector('.segmented.no-print')
    const last = [...g.querySelectorAll('button')].pop()
    const before = last.getAttribute('aria-pressed')
    const maxScroll = de.scrollWidth - de.clientWidth
    window.scrollTo(maxScroll, window.scrollY)
    await new Promise(r => setTimeout(r, 200))
    const r2 = last.getBoundingClientRect()
    const vw = de.clientWidth
    const fullyVisible = r2.left >= -0.5 && r2.right <= vw + 0.5
    const cx = (Math.max(r2.left,0) + Math.min(r2.right,vw))/2, cy = (r2.top+r2.bottom)/2
    const hit = document.elementFromPoint(cx, cy)
    return { maxScroll, scrollXAfter: window.scrollX, fullyVisible, visibleWidth: +(Math.min(r2.right,vw)-Math.max(r2.left,0)).toFixed(1), hitIsButton: hit === last || last.contains(hit), before }
  })

  // клик по видимой части без прокрутки
  await page.evaluate(() => window.scrollTo(0,0))
  await page.waitForTimeout(200)
  const box = await page.evaluate(() => {
    const g = document.querySelector('.segmented.no-print')
    const last = [...g.querySelectorAll('button')].pop()
    const r = last.getBoundingClientRect(); const vw = document.documentElement.clientWidth
    return { x: (Math.max(r.left,0)+Math.min(r.right,vw))/2, y: (r.top+r.bottom)/2 }
  })
  await page.mouse.click(box.x, box.y)
  await page.waitForTimeout(500)
  res[key].afterClickNoScroll = await page.evaluate(() => {
    const g = document.querySelector('.segmented.no-print')
    return [...g.querySelectorAll('button')].map(b => ({ t: b.textContent.trim(), p: b.getAttribute('aria-pressed') }))
  })
  res[key].periodTextAfter = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.report-facts td')].find(e => e.textContent.trim().startsWith('за ') || e.textContent.includes('всё время'))
    return el ? el.textContent.trim().slice(0,90) : null
  })

  // 2. печатный вид — то, что реально уходит врачу
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(400)
  res[key].print = await page.evaluate(() => {
    const g = document.querySelector('.segmented.no-print')
    const cs = g ? getComputedStyle(g) : null
    const de = document.documentElement
    const vw = de.clientWidth
    const bad = []
    const walk = (n) => {
      if (n.nodeType === 3 && n.textContent.trim()) {
        const rg = document.createRange(); rg.selectNodeContents(n)
        for (const r of rg.getClientRects()) if (r.width>0 && r.right > vw + 0.5) bad.push(n.textContent.trim().slice(0,40))
      } else n.childNodes?.forEach(walk)
    }
    walk(document.body)
    return { pickerDisplay: cs ? cs.display : 'absent', docScrollW: de.scrollWidth, docClientW: de.clientWidth, clippedInPrint: bad }
  })
  await page.emulateMedia({ media: 'screen' })
  await ctx.close()
}
console.log(JSON.stringify(res, null, 1))
await browser.close()
