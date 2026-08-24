import { chromium } from 'playwright'
import { seed, settle, FROZEN } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'

const URL = 'http://localhost:5199'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/probe'

const text = process.env.TEXT ?? 'normal'
const density = process.env.DENS ?? 'normal'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
})
const page = await ctx.newPage()
await page.addInitScript(`Date.now = () => ${FROZEN}; const _D = Date; class D extends _D { constructor(...a){ if(!a.length) super(${FROZEN}); else super(...a);} static now(){return ${FROZEN}} } globalThis.Date = D;`)
await page.goto(URL)
await settle(page)
await seed(page, FROZEN)
await page.reload()
await settle(page)

// применяем настройки текста/плотности
await page.evaluate(([t, d]) => {
  document.documentElement.dataset.text = t
  document.documentElement.dataset.density = d
}, [text, density])
await page.waitForTimeout(300)

await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click()
await page.waitForTimeout(400)

const info = async (tag) => page.evaluate((tag) => {
  const q = (s) => document.querySelector(s)
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), h: +b.height.toFixed(1) } }
  const form = q('form.card')
  const details = form && form.querySelector('details')
  const summary = details && details.querySelector('summary')
  const actions = q('.form-actions')
  const cs = actions && getComputedStyle(actions)
  return {
    tag,
    pointerCoarse: matchMedia('(pointer: coarse)').matches,
    innerHeight: innerHeight,
    scrollY: scrollY,
    docScrollHeight: document.documentElement.scrollHeight,
    maxScroll: document.documentElement.scrollHeight - innerHeight,
    form: r(form),
    details: r(details),
    summary: r(summary),
    actions: r(actions),
    actionsPosition: cs && cs.position,
    actionsBottom: cs && cs.bottom,
    tabsTop: r(q('nav.tabs')),
    // что реально лежит в точке центра summary
    hitAtSummary: (() => {
      if (!summary) return null
      const b = summary.getBoundingClientRect()
      const el = document.elementFromPoint(b.left + Math.min(40, b.width/2), b.top + b.height/2)
      return el ? (el.tagName + '.' + el.className + '|' + (el.textContent||'').slice(0,30)) : null
    })(),
    savedBanner: r(document.querySelector('[role="status"] .banner--good')),
    alertBanner: r(document.querySelector('[role="alert"] .banner--critical')),
  }
}, tag)

const results = []
results.push(await info('исходно, до прокрутки'))

// прокрутить страницу вниз до упора
await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
await page.waitForTimeout(400)
results.push(await info('после прокрутки вниз'))
await page.screenshot({ path: `${OUT}/scrolled-${text}-${density}.png` })

// раскрыть details
await page.evaluate(() => { const d = document.querySelector('form.card details'); if (d) d.open = true })
await page.waitForTimeout(300)
await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
await page.waitForTimeout(400)
results.push(await info('details открыт + прокрутка вниз'))
await page.screenshot({ path: `${OUT}/details-${text}-${density}.png` })

// нажать Добавить без значений -> ошибка
await page.locator('.form-actions button').first().click({ force: true })
await page.waitForTimeout(600)
results.push(await info('после пустой отправки (ошибка)'))
await page.screenshot({ path: `${OUT}/error-${text}-${density}.png` })

// теперь заполнить колёса программно нельзя; используем клавиатуру на spinbutton
const spin = page.locator('[role="spinbutton"]')
console.log('spinbuttons:', await spin.count())

// выставить значения через прокрутку колеса
await page.evaluate(() => {
  const wheels = document.querySelectorAll('[role="spinbutton"]')
  return wheels.length
})
// фокус + стрелки
for (let i = 0; i < 2; i++) {
  await spin.nth(i).focus()
  await page.keyboard.press('ArrowUp')
  await page.waitForTimeout(250)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(450)
}
console.log('значения:', await page.evaluate(() => [...document.querySelectorAll('[role="spinbutton"]')].map(e => e.getAttribute('aria-valuenow'))))

await page.locator('.form-actions button').first().click({ force: true })
await page.waitForTimeout(900)
results.push(await info('после успешной записи'))
await page.screenshot({ path: `${OUT}/saved-${text}-${density}.png` })
// и без прокрутки: что видно
await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
await page.waitForTimeout(400)
results.push(await info('после записи + прокрутка вниз'))
await page.screenshot({ path: `${OUT}/saved-scrolled-${text}-${density}.png` })

console.log(JSON.stringify(results, null, 1))
await browser.close()
