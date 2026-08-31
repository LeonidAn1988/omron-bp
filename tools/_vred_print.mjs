import { chromium } from 'playwright'
import { FROZEN, seed, settle, go } from '/Users/leonidanchevskiy/Claude_Projects/omron/tools/visual.mjs'

const URL = 'http://localhost:4291'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad'
const browser = await chromium.launch()

const lum = (c) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
const ratio = (fg, bg) => {
  const a = lum(parse(fg)), b = lum(parse(bg))
  return +(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05))).toFixed(2)
}

for (const mode of ['dark', 'light', 'auto-sysdark', 'auto-syslight']) {
  const colorScheme = mode === 'auto-sysdark' || mode === 'dark' ? 'dark' : 'light'
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, locale: 'ru-RU', timezoneId: 'Europe/Moscow', colorScheme })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(FROZEN) })
  await page.goto(URL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('nav.tabs, .onboarding, main, .app', { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(800)
  await seed(page, FROZEN)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await settle(page)
  await page.evaluate((m) => {
    if (m === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
    else if (m === 'light') document.documentElement.setAttribute('data-theme', 'light')
    else document.documentElement.removeAttribute('data-theme')
  }, mode)
  await page.waitForTimeout(200)
  await go(page, { name: 'Отчёт врачу', tool: 'Отчёт' })

  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(200)

  const data = await page.evaluate(() => {
    const cs = (el) => el ? getComputedStyle(el) : null
    const bodyBg = getComputedStyle(document.body).backgroundColor
    const pick = (sel, n = 3) => [...document.querySelectorAll(sel)].slice(0, n).map((el) => ({
      sel, text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      color: cs(el).color, bg: cs(el).backgroundColor, display: cs(el).display,
      vis: cs(el).visibility, fs: cs(el).fontSize, fw: cs(el).fontWeight,
    }))
    const root = getComputedStyle(document.documentElement)
    const tokens = {}
    for (const t of ['--text-primary', '--text-secondary', '--text-muted', '--critical-text', '--page', '--surface', '--border']) tokens[t] = root.getPropertyValue(t).trim()
    return {
      bodyBg, tokens,
      rows: [
        ...pick('.report-facts th', 2),
        ...pick('.report-facts td', 4),
        ...pick('.report-facts td.wrap', 3),
        ...pick('.critical-text', 2),
        ...pick('.report-table th', 2),
        ...pick('.report-table td', 3),
        ...pick('.readings-table td', 3),
        ...pick('.muted', 3),
        ...pick('h2', 2),
      ],
      criticalCount: document.querySelectorAll('.critical-text').length,
      criticalTexts: [...document.querySelectorAll('.critical-text')].map(e => ({ t: e.innerText.trim().slice(0, 70), noprint: !!e.closest('.no-print'), disp: getComputedStyle(e).display, color: getComputedStyle(e).color })),
    }
  })

  console.log('\n================ mode:', mode, '================')
  console.log('body bg:', data.bodyBg, 'tokens:', JSON.stringify(data.tokens))
  const bg = data.bodyBg === 'rgba(0, 0, 0, 0)' ? 'rgb(255,255,255)' : data.bodyBg
  for (const r of data.rows) {
    if (r.display === 'none' || !r.text) continue
    const eff = r.bg && r.bg !== 'rgba(0, 0, 0, 0)' ? r.bg : bg
    console.log(`  ${String(ratio(r.color, eff)).padStart(6)}:1  ${r.color.padEnd(22)} on ${eff.padEnd(20)} ${r.fs.padStart(8)} w${r.fw}  [${r.sel}] "${r.text}"`)
  }
  console.log('critical:', JSON.stringify(data.criticalTexts))

  await page.pdf({ path: `${OUT}/vred_print_${mode}.pdf`, format: 'A4', printBackground: false })
  await ctx.close()
}
await browser.close()
