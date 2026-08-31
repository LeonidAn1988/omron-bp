import { chromium } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'

const URL = process.env.U || 'https://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

for (const [scale, density] of [['normal','normal'],['large','normal'],['xlarge','roomy']]) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 800 }, locale: 'ru-RU',
    timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2,
    ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await seed(page, FROZEN)
  await page.evaluate(async ([s, d]) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s; cur.density = d; cur.trackGlucose = true; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
    localStorage.setItem('textScale', s)
  }, [scale, density])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(600)
  await go(page, { tool: 'Настройки' })
  await page.waitForTimeout(400)

  const m = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.segmented--fill')]
    return groups.map((g) => {
      const gr = g.getBoundingClientRect()
      const card = g.closest('.card')
      const cr = card ? card.getBoundingClientRect() : null
      const cs = card ? getComputedStyle(card) : null
      const inner = cr ? { l: cr.left + parseFloat(cs.paddingLeft), r: cr.right - parseFloat(cs.paddingRight) } : null
      return {
        label: g.getAttribute('aria-label'),
        group: { l: +gr.left.toFixed(1), r: +gr.right.toFixed(1), w: +gr.width.toFixed(1) },
        cardInner: inner ? { l: +inner.l.toFixed(1), r: +inner.r.toFixed(1), w: +(inner.r-inner.l).toFixed(1) } : null,
        groupOverflowsCard: inner ? +(gr.right - inner.r).toFixed(1) : null,
        buttons: [...g.querySelectorAll('button')].map((b) => {
          const br = b.getBoundingClientRect()
          const cs2 = getComputedStyle(b)
          const padL = parseFloat(cs2.paddingLeft), padR = parseFloat(cs2.paddingRight)
          // измеряем реальную «чернильную» ширину текста
          const rng = document.createRange(); rng.selectNodeContents(b)
          const rects = [...rng.getClientRects()]
          const inkL = Math.min(...rects.map(r => r.left)), inkR = Math.max(...rects.map(r => r.right))
          return {
            t: b.textContent.trim(),
            box: { l: +br.left.toFixed(1), r: +br.right.toFixed(1), w: +br.width.toFixed(1) },
            contentBox: { l: +(br.left+padL).toFixed(1), r: +(br.right-padR).toFixed(1) },
            ink: { l: +inkL.toFixed(1), r: +inkR.toFixed(1), w: +(inkR-inkL).toFixed(1) },
            lines: rects.length,
            inkPastBorderRight: +(inkR - br.right).toFixed(1),
            inkPastContentRight: +(inkR - (br.right - padR)).toFixed(1),
            scrollW: b.scrollWidth, clientW: b.clientWidth,
            whiteSpace: cs2.whiteSpace, overflowWrap: cs2.overflowWrap, wordBreak: cs2.wordBreak,
            minWidth: cs2.minWidth, flex: cs2.flex, overflow: cs2.overflow,
          }
        }),
      }
    })
  })
  console.log('###', scale, density, 'rootFont=', await page.evaluate(() => getComputedStyle(document.documentElement).fontSize))
  console.log(JSON.stringify(m, null, 1))
  await page.screenshot({ path: `${OUT}/refseg_${scale}_${density}.png`, fullPage: true })
  await ctx.close()
}
await browser.close()
