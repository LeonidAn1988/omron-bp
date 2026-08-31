import { chromium } from 'playwright'
import { seed, settle, go, FROZEN } from './visual.mjs'

const URL = process.env.URL ?? 'https://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'

const browser = await chromium.launch()
for (const dens of ['normal', 'roomy']) {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow',
    colorScheme: 'light', deviceScaleFactor: 2, ignoreHTTPSErrors: true,
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await seed(page, FROZEN)
  await page.evaluate(async (d) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('omron-bp', 3); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
    const cur = await new Promise((res) => { const tx = db.transaction(['meta'],'readonly'); const g = tx.objectStore('meta').get('settings'); g.onsuccess = () => res(g.result || {}) })
    await new Promise((res, rej) => { const tx = db.transaction(['meta'],'readwrite'); tx.objectStore('meta').put({ ...cur, trackGlucose: true, onboarded: true, density: d }, 'settings'); tx.oncomplete = res; tx.onerror = () => rej(tx.error) })
    db.close()
  }, dens)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await go(page, { tool: 'Настройки' })
  await page.waitForTimeout(600)

  const m = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.card')]
    const card = cards.find((c) => c.querySelector('h2')?.textContent.includes('Сохранность'))
    if (!card) return { err: 'нет карточки', heads: cards.map(c => c.querySelector('h2')?.textContent) }
    const cs = getComputedStyle(document.documentElement)
    const inkBottom = (el) => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let mb = -1e9
      while (w.nextNode()) { const n = w.currentNode; if (!n.nodeValue.trim()) continue
        const r = document.createRange(); r.selectNodeContents(n)
        for (const rect of r.getClientRects()) mb = Math.max(mb, rect.bottom) }
      return mb
    }
    const inkTop = (el) => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let mt = 1e9
      while (w.nextNode()) { const n = w.currentNode; if (!n.nodeValue.trim()) continue
        const r = document.createRange(); r.selectNodeContents(n)
        for (const rect of r.getClientRects()) mt = Math.min(mt, rect.top) }
      return mt
    }
    const kids = [...card.children].map((el) => {
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
      return { cls: el.className || el.tagName, top: +r.top.toFixed(2), bottom: +r.bottom.toFixed(2), mt: s.marginTop, mb: s.marginBottom }
    })
    const gaps = []
    for (let i = 1; i < kids.length; i++) gaps.push({ between: `${kids[i-1].cls} → ${kids[i].cls}`, boxGap: +(kids[i].top - kids[i-1].bottom).toFixed(2) })

    const stack = card.querySelector(':scope > .stack')
    const banner = card.querySelector(':scope > .banner')
    const out = { kids, gaps }
    if (stack && banner) {
      const last = stack.lastElementChild
      out.inkGap_stackText_to_bannerBorder = +(banner.getBoundingClientRect().top - inkBottom(last)).toFixed(2)
      out.inkGap_bannerBorder_to_bannerText = +(inkTop(banner) - banner.getBoundingClientRect().top).toFixed(2)
      // для сравнения — такой же ink-зазор ВНУТРИ .stack между двумя блоками (gap: space-4)
      const items = [...stack.children]
      const inner = []
      for (let i = 1; i < items.length; i++) inner.push(+(inkTop(items[i]) - inkBottom(items[i-1])).toFixed(2))
      out.inkGaps_inside_stack = inner
      out.stackGap = getComputedStyle(stack).rowGap
      out.bannerMargin = getComputedStyle(banner).margin
      out.bannerPadding = getComputedStyle(banner).padding
    }
    out.spaceUnit = cs.getPropertyValue('--space-unit').trim()
    out.space4 = cs.getPropertyValue('--space-4').trim()
    out.density = document.documentElement.dataset.density ?? '(нет)'
    return out
  })
  console.log('###', dens, JSON.stringify(m, null, 2))
  const card = page.locator('.card').filter({ hasText: 'Сохранность данных' }).first()
  await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(250)
  await card.screenshot({ path: `${OUT}/rfban-${dens}.png` })
  await ctx.close()
}
await browser.close()
