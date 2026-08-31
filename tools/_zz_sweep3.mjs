import { chromium } from 'playwright'
import { seedAll } from './_zz_seedlib.mjs'
const URL = 'http://localhost:5199'
const FROZEN = new Date('2026-08-31T16:24:00').getTime()
const probe = () => {
  const span = document.createElement('span')
  span.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:-9999px'
  document.body.appendChild(span)
  const need = (txt, el) => { const cs = getComputedStyle(el)
    span.style.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`
    span.textContent = txt; return +span.getBoundingClientRect().width.toFixed(1) }
  const avail = (c) => { const cs = getComputedStyle(c)
    return +(c.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)).toFixed(1) }
  const adh = document.querySelector('.report-adherence')
  const th = adh.querySelectorAll('th')
  const pct = [...adh.querySelectorAll('tbody tr')].map(tr => tr.children[2]).find(c => c.textContent.trim() === '100%')
  const r = { docW: document.documentElement.clientWidth,
    prinyato: { need: need('Принято', th[1]), avail: avail(th[1]) },
    hundred: pct ? { need: need('100%', pct), avail: avail(pct) } : null,
    dozirovka: (() => { const d = document.querySelector('.report-drugs th:nth-child(2)'); return { need: need('Дозировка', d), avail: avail(d) } })() }
  span.remove(); return r
}
for (const [width, dens] of [[365,'roomy'],[370,'roomy'],[375,'roomy'],[378,'roomy'],[375,'normal']]) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 3, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme: 'dark', isMobile: true, hasTouch: true, ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1000)
  await seedAll(page, FROZEN)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs', { timeout: 15000 })
  await page.evaluate((d) => { document.documentElement.setAttribute('data-theme','dark'); document.documentElement.setAttribute('data-text','xlarge'); document.documentElement.setAttribute('data-density', d) }, dens)
  await page.locator('header button', { hasText: 'Отчёт' }).first().click()
  await page.waitForTimeout(500)
  const r = await page.evaluate(probe)
  const f = (o) => o ? `${o.need}/${o.avail} ${o.need <= o.avail + 0.5 ? 'FITS' : 'BREAKS'}` : '—'
  console.log(`docW=${r.docW} dens=${dens}  Принято ${f(r.prinyato)}   100% ${f(r.hundred)}   Дозировка ${f(r.dozirovka)}`)
  await browser.close()
}
