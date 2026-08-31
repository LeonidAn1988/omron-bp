import { chromium } from 'playwright'
import { FROZEN, seed, settle, go } from './visual.mjs'

const URL = 'http://localhost:5199'
const VW = 406
const VH = 900

async function run(text, density) {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
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
  await page.evaluate(
    ([t, d]) => {
      document.documentElement.setAttribute('data-theme', 'dark')
      if (t) document.documentElement.setAttribute('data-text', t)
      if (d) document.documentElement.setAttribute('data-density', d)
    },
    [text, density],
  )
  await page.waitForTimeout(300)
  await go(page, { tab: 'Обзор' })
  await page.waitForTimeout(400)

  const out = await page.evaluate((vh) => {
    const res = {}
    const rect = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: Math.round(r.top + window.scrollY), h: Math.round(r.height), w: Math.round(r.width), left: Math.round(r.left) }
    }
    res.rootFontSize = getComputedStyle(document.documentElement).fontSize
    res.docHeight = document.documentElement.scrollHeight
    res.docWidth = document.documentElement.scrollWidth
    res.viewportW = document.documentElement.clientWidth
    res.horizontalOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth

    res.lead = rect('.lead')
    res.leadValue = rect('.lead__value')
    res.statsStrip = rect('.stats-strip')
    res.periodPicker = rect('.segmented')
    res.banners = [...document.querySelectorAll('.banner')].map((b) => {
      const r = b.getBoundingClientRect()
      return {
        title: (b.querySelector('b')?.textContent || b.textContent || '').slice(0, 42),
        top: Math.round(r.top + window.scrollY),
        h: Math.round(r.height),
      }
    })
    // все интерактивные элементы и их размеры
    res.small = []
    for (const el of document.querySelectorAll('button, a, input, select, summary, [role="button"]')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) continue
      if (r.height < 44 || r.width < 44) {
        res.small.push({
          tag: el.tagName,
          cls: el.className.toString().slice(0, 40),
          text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 28),
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
        })
      }
    }
    // текст, вылезающий за контейнер
    res.overflowing = []
    for (const el of document.querySelectorAll('.card, .banner, .stats-strip > div, .segmented, .badge')) {
      if (el.scrollWidth > el.clientWidth + 1) {
        res.overflowing.push({
          cls: el.className.toString().slice(0, 40),
          scrollW: el.scrollWidth,
          clientW: el.clientWidth,
          text: (el.textContent || '').trim().slice(0, 40),
        })
      }
    }
    // шрифты внутри svg-графиков
    res.svgText = [...document.querySelectorAll('svg text')].slice(0, 6).map((t) => ({
      text: (t.textContent || '').slice(0, 20),
      fs: getComputedStyle(t).fontSize,
    }))
    res.charts = [...document.querySelectorAll('.card')].map((c) => {
      const h = c.querySelector('h2')
      const r = c.getBoundingClientRect()
      return { head: h ? h.textContent.slice(0, 30) : '(нет)', top: Math.round(r.top + window.scrollY), h: Math.round(r.height) }
    })
    res.vh = vh
    return res
  }, VH)

  console.log(`\n===== text=${text || 'normal'} density=${density || 'normal'} =====`)
  console.log(JSON.stringify(out, null, 1))

  await page.screenshot({ path: `/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/m_${text || 'norm'}_full.png`, fullPage: true })
  await browser.close()
}

await run(null, null)
await run('xlarge', 'roomy')
