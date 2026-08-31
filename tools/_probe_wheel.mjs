import { chromium, devices } from 'playwright'
import { seed, go, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'

const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

for (const [scale, density] of [['normal','normal'],['xlarge','normal'],['xlarge','roomy'],['normal','roomy']]) {
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 800 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    colorScheme: 'dark', deviceScaleFactor: 2, hasTouch: true, isMobile: true,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await seed(page, FROZEN)
  await page.evaluate(async ([s,d]) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction('meta','readonly'); const q = tx.objectStore('meta').get('settings'); q.onsuccess = () => res(q.result || {}) })
    cur.textScale = s; cur.density = d; cur.onboarded = true
    await new Promise((res, rej) => { const tx = db.transaction('meta','readwrite'); tx.objectStore('meta').put(cur,'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
    localStorage.setItem('textScale', s); localStorage.setItem('density', d)
  }, [scale, density])
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 20000 })
  await page.waitForTimeout(600)
  await go(page, { tab: 'Давление' })
  await page.waitForTimeout(600)

  const m = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const wheels = [...document.querySelectorAll('.wheel')]
    const info = wheels.map((w) => {
      const box = w.querySelector('.wheel__box').getBoundingClientRect()
      const list = w.querySelector('.wheel__list')
      const items = [...w.querySelectorAll('.wheel__item')]
      const sel = w.querySelector(".wheel__item[data-selected='true']")
      const selR = sel ? sel.getBoundingClientRect() : null
      // видимые элементы и степень обрезки текста
      const vis = items.filter(i => { const r = i.getBoundingClientRect(); return r.right > box.left - 1 && r.left < box.right + 1 && r.bottom > box.top -1 && r.top < box.bottom + 1 })
      const clipped = vis.map(i => {
        const r = i.getBoundingClientRect()
        // ширина глифов: измеряем текстовый узел через Range
        const range = document.createRange(); range.selectNodeContents(i)
        const tr = range.getBoundingClientRect()
        const leftCut = Math.max(0, box.left - tr.left)
        const rightCut = Math.max(0, tr.right - box.right)
        return { t: i.textContent, w: Math.round(r.width), h: Math.round(r.height), glyphW: Math.round(tr.width), leftCut: Math.round(leftCut), rightCut: Math.round(rightCut), sel: i.dataset.selected === 'true' }
      })
      return {
        label: w.querySelector('.wheel__label').textContent.trim(),
        axis: w.className.includes('wheel--x') ? 'x' : 'y',
        box: { w: Math.round(box.width), h: Math.round(box.height) },
        item: selR ? { w: Math.round(selR.width), h: Math.round(selR.height) } : null,
        selClipped: selR ? { left: Math.round(Math.max(0, box.left - selR.left)), right: Math.round(Math.max(0, selR.right - box.right)) } : null,
        visible: clipped,
      }
    })
    return { rootFont: cs.fontSize, tap: cs.getPropertyValue('--tap'), spaceUnit: cs.getPropertyValue('--space-unit'),
      tapPx: (() => { const d = document.createElement('div'); d.style.height='var(--tap)'; document.body.appendChild(d); const h=d.getBoundingClientRect().height; d.remove(); return h })(),
      wheels: info }
  })
  console.log(`\n===== text=${scale} density=${density} =====`)
  console.log(JSON.stringify(m, null, 1))
  await ctx.close()
}
await browser.close()
