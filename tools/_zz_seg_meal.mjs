import { chromium } from 'playwright'
import { seed, go, FROZEN } from './visual.mjs'

const URL = 'http://localhost:4399'
const SHOT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const cases = [
  { tag: '360-xlarge-roomy', w: 360, scale: 'xlarge', density: 'roomy' },
  { tag: '360-xlarge-normal', w: 360, scale: 'xlarge', density: 'normal' },
  { tag: '360-normal-normal', w: 360, scale: 'normal', density: 'normal' },
]

const probe = () => {
  const px = (n) => Math.round(n * 100) / 100
  const de = document.documentElement
  const out = { vw: de.clientWidth, docScrollW: de.scrollWidth, bodyScrollW: document.body.scrollWidth, groups: [] }
  for (const g of document.querySelectorAll('.segmented')) {
    const gr = g.getBoundingClientRect()
    const card = g.closest('.card')
    const cr = card ? card.getBoundingClientRect() : null
    const ccs = card ? getComputedStyle(card) : null
    const cardContentR = cr ? cr.right - parseFloat(ccs.paddingRight) - parseFloat(ccs.borderRightWidth) : null
    // ближайший предок, который обрезает или скроллит
    let clip = null
    for (let p = g.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (cs.overflowX !== 'visible') {
        const r = p.getBoundingClientRect()
        clip = { el: p.tagName + '.' + p.className, ovX: cs.overflowX, R: px(r.right), scrollW: p.scrollWidth, clientW: p.clientWidth }
        break
      }
    }
    out.groups.push({
      label: g.getAttribute('aria-label'), cls: g.className,
      L: px(gr.left), R: px(gr.right), W: px(gr.width),
      parentCls: g.parentElement.className,
      parentR: px(g.parentElement.getBoundingClientRect().right),
      parentScrollW: g.parentElement.scrollWidth, parentClientW: g.parentElement.clientWidth,
      cardR: cr ? px(cr.right) : null, cardContentR: cardContentR != null ? px(cardContentR) : null,
      pastCard: cardContentR != null ? px(gr.right - cardContentR) : null,
      pastViewport: px(gr.right - de.clientWidth),
      clip,
      btns: [...g.querySelectorAll('button')].map((b) => {
        const br = b.getBoundingClientRect()
        const r = document.createRange(); r.selectNodeContents(b)
        const tr = r.getBoundingClientRect()
        return { t: b.textContent.trim(), L: px(br.left), R: px(br.right), W: px(br.width), textR: px(tr.right), past: px(tr.right - br.right) }
      }),
    })
  }
  return out
}

const browser = await chromium.launch()
for (const c of cases) {
  const ctx = await browser.newContext({ viewport: { width: c.w, height: 915 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  await seed(page, FROZEN)
  await page.evaluate(async ({ s, d }) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta', 'readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s; cur.density = d; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').put(cur, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close(); localStorage.setItem('textScale', s); localStorage.setItem('density', d)
  }, { s: c.scale, d: c.density })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(600)

  console.log('\n######## ' + c.tag)
  await go(page, { tab: 'Аптечка', click: 'Добавить препарат' })
  await page.waitForTimeout(500)
  const chip = page.locator('button.chip', { hasText: 'Утром' }).first()
  console.log('  чипов «Утром»:', await chip.count())
  await chip.click()
  await page.waitForTimeout(600)
  const m = await page.evaluate(probe)
  console.log(`  vw=${m.vw} docScrollW=${m.docScrollW} bodyScrollW=${m.bodyScrollW}`)
  for (const g of m.groups) {
    console.log(`   «${g.label}» cls="${g.cls}" L=${g.L} R=${g.R} W=${g.W}`)
    console.log(`      родитель .${g.parentCls} R=${g.parentR} scrollW/clientW=${g.parentScrollW}/${g.parentClientW}`)
    console.log(`      карточка content-right=${g.cardContentR}  ЗА КАРТОЧКУ=${g.pastCard}   за вьюпорт=${g.pastViewport}`)
    if (g.clip) console.log(`      обрезает: ${g.clip.el} ovX=${g.clip.ovX} R=${g.clip.R} scrollW/clientW=${g.clip.scrollW}/${g.clip.clientW}`)
    for (const b of g.btns) console.log(`      "${b.t}" [${b.L}..${b.R}] w=${b.W} textR=${b.textR} заКнопку=${b.past}`)
  }
  await page.screenshot({ path: `${SHOT}/zzmeal-${c.tag}.png`, fullPage: true })
  await ctx.close()
}
await browser.close()
