import { chromium } from 'playwright'
import { FROZEN, seed, settle, go } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'

const URL = 'http://localhost:5233'
const browser = await chromium.launch()

const widths = [320, 360, 390]
const texts = ['normal', 'large', 'xlarge']
const dens = ['normal', 'compact', 'roomy']

const rows = []
for (const w of widths) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.addInitScript(`{ const t = ${FROZEN}; const D = Date; class F extends D { constructor(...a){ if(!a.length) super(t); else super(...a);} static now(){return t;} } window.Date = F; }`)
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await seed(page, FROZEN)
  for (const text of texts) {
    for (const d of dens) {
      await page.evaluate(([text, d]) => {
        try { text === 'normal' ? localStorage.removeItem('text') : localStorage.setItem('text', text) } catch {}
        try { d === 'normal' ? localStorage.removeItem('density') : localStorage.setItem('density', d) } catch {}
      }, [text, d])
      await page.reload({ waitUntil: 'domcontentloaded' })
      await settle(page)
      await go(page, { tool: 'Настройки' })
      const res = await page.evaluate(() => {
        const h2 = [...document.querySelectorAll('.card h2')].find(x => x.textContent.trim() === 'Разделы')
        const card = h2.closest('.card')
        const stack = card.querySelector('.stack')
        const cs = getComputedStyle(card)
        const cardBox = card.getBoundingClientRect()
        const padR = parseFloat(cs.paddingRight), padL = parseFloat(cs.paddingLeft)
        const contentRight = cardBox.right - padR - parseFloat(cs.borderRightWidth)
        const labels = [...stack.querySelectorAll('label.badge')].map(l => {
          const note = l.querySelector('.fact__note')
          const r = l.getBoundingClientRect()
          const nr = note.getBoundingClientRect()
          return {
            t: l.querySelector('span')?.firstChild?.textContent?.trim(),
            ws: getComputedStyle(l).whiteSpace,
            wsNote: getComputedStyle(note).whiteSpace,
            labRight: +r.right.toFixed(2),
            noteRight: +nr.right.toFixed(2),
            noteScroll: note.scrollWidth,
            noteClient: note.clientWidth,
          }
        })
        return {
          rootFs: getComputedStyle(document.documentElement).fontSize,
          cardRight: +cardBox.right.toFixed(2), contentRight: +contentRight.toFixed(2),
          padL, padR,
          stackScroll: stack.scrollWidth, stackClient: stack.clientWidth,
          cardScroll: card.scrollWidth, cardClient: card.clientWidth,
          docScroll: document.documentElement.scrollWidth, docClient: document.documentElement.clientWidth,
          labels,
        }
      })
      rows.push({ w, text, d, ...res })
    }
  }
  await ctx.close()
}
await browser.close()
console.log(JSON.stringify(rows, null, 1))
