import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from './visual.mjs'
const URL = 'http://localhost:4399'
const browser = await chromium.launch()
async function prep(width, scale, density) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1800)
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
const WHO = (needle) => {
  const vw = document.documentElement.clientWidth
  const res = []
  const walk = (n) => {
    if (n.nodeType === 3 && n.textContent.trim() === needle) {
      const rg = document.createRange(); rg.selectNodeContents(n)
      for (const r of rg.getClientRects()) {
        const p = n.parentElement
        const chain = []
        let q = p
        while (q && q !== document.body) { chain.push(q.tagName.toLowerCase() + (q.className ? '.' + String(q.className).split(' ').join('.') : '')); q = q.parentElement }
        res.push({ right: +r.right.toFixed(1), vw, over: +(r.right - vw).toFixed(1), chain: chain.slice(0,5) })
      }
    } else n.childNodes?.forEach(walk)
  }
  walk(document.body)
  return res
}
for (const [w,s,d] of [[360,'large','roomy'],[360,'small','compact'],[360,'xlarge','roomy']]) {
  const { ctx, page } = await prep(w,s,d)
  // сначала главный экран (давление) — есть ли обрезка ДО отчёта
  const homeScroll = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  const navHome = await page.evaluate(WHO, 'Аптечка')
  await go(page, { tool: 'Отчёт' }); await page.waitForTimeout(350)
  const navReport = await page.evaluate(WHO, 'Аптечка')
  console.log(`--- ${w}/${s}/${d}`)
  console.log(' главный экран scrollW/clientW:', JSON.stringify(homeScroll))
  console.log(' «Аптечка» на главном:', JSON.stringify(navHome))
  console.log(' «Аптечка» в отчёте:', JSON.stringify(navReport))
  await page.screenshot({ path: `/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/_hv_rep_${w}_${s}_${d}.png` })
  await ctx.close()
}
await browser.close()
