import { chromium } from 'playwright'
import { FROZEN, seed, settle, go } from './visual.mjs'

const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const URL = 'http://localhost:5199'

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'ru-RU',
  timezoneId: 'Europe/Moscow',
  colorScheme: 'dark',
})
const page = await context.newPage()
await page.clock.install({ time: new Date(FROZEN) })
await page.goto(URL, { waitUntil: 'domcontentloaded' })
await settle(page)
await seed(page, FROZEN)
await page.reload({ waitUntil: 'domcontentloaded' })
await settle(page)
await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
await page.waitForTimeout(200)

await go(page, { name: 'Обзор', tab: 'Обзор' })
await page.screenshot({ path: `${OUT}/obzor-real.png` })

// Что на самом деле в разметке обзора
const info = await page.evaluate(() => {
  const out = {}
  const lead = document.querySelector('.lead')
  out.leadHTML = lead ? lead.innerText : null
  const val = document.querySelector('.lead__value')
  if (val) {
    const cs = getComputedStyle(val)
    out.leadFontSize = cs.fontSize
    out.leadRect = val.getBoundingClientRect().toJSON()
  }
  const lbl = document.querySelector('.lead .tile__label')
  if (lbl) {
    out.labelText = lbl.textContent
    out.labelFontSize = getComputedStyle(lbl).fontSize
    out.labelRect = lbl.getBoundingClientRect().toJSON()
  }
  const picker = document.querySelector('.seg, .period, [role="group"]')
  out.pickerText = picker ? picker.innerText.replace(/\n/g, ' | ') : null
  if (picker) {
    out.pickerRect = picker.getBoundingClientRect().toJSON()
    out.pickerPosition = getComputedStyle(picker).position
  }
  out.bannerCount = document.querySelectorAll('.banner').length
  out.banners = [...document.querySelectorAll('.banner')].map((b) => b.innerText.replace(/\n/g, ' / '))
  out.fullText = document.querySelector('.stack')?.innerText ?? null
  out.scrollHeight = document.documentElement.scrollHeight
  out.viewport = window.innerHeight
  return out
})
console.log(JSON.stringify(info, null, 2))

// Прокрутка так, чтобы главная цифра оказалась вверху экрана — виден ли ещё период?
await page.evaluate(() => {
  const val = document.querySelector('.lead__value')
  window.scrollBy(0, val.getBoundingClientRect().top - 8)
})
await page.waitForTimeout(200)
await page.screenshot({ path: `${OUT}/obzor-scrolled.png` })

await browser.close()
