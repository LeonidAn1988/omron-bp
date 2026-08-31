import { chromium } from 'playwright'
import { seed } from './visual.mjs'
const URL='http://localhost:8791/'
const FROZEN = new Date('2026-08-15T10:30:00+03:00').getTime()
const SP='/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/'
const PATCHES = {
  'asWritten': `.chip{white-space:normal!important;overflow-wrap:anywhere;max-width:100%;min-height:auto!important;padding:var(--space-2) var(--space-4)!important;}`,
  'btnStyle': `.chip{display:inline-flex;align-items:center;justify-content:center;white-space:normal!important;max-width:100%;text-align:center;}`,
}
for (const [label, css] of Object.entries(PATCHES)) {
  const b = await chromium.launch()
  const ctx = await b.newContext({ viewport:{width:360,height:800}, locale:'ru-RU', timezoneId:'Europe/Moscow', deviceScaleFactor:2 })
  const p = await ctx.newPage()
  await p.goto(URL,{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1200)
  let s=p.locator('button',{hasText:'Пропустить'}); if (await s.count()) { await s.first().click(); await p.waitForTimeout(600) }
  await p.waitForSelector('nav.tabs',{timeout:15000}); await p.waitForTimeout(300)
  await seed(p, FROZEN)
  await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(1200)
  s=p.locator('button',{hasText:'Пропустить'}); if (await s.count()) { await s.first().click(); await p.waitForTimeout(600) }
  await p.waitForSelector('nav.tabs',{timeout:15000}); await p.waitForTimeout(300)
  await p.locator('nav.tabs button',{hasText:'Аптечка'}).first().click(); await p.waitForTimeout(400)
  await p.locator('button',{hasText:'Добавить препарат'}).first().click(); await p.waitForTimeout(500)
  const input = p.locator('input').first(); await input.click(); await p.waitForTimeout(1200)
  await input.fill('Диклофенак'); await p.waitForTimeout(1200)
  await p.locator('[role=option]').first().click(); await p.waitForTimeout(500)
  await p.addStyleTag({content: css}); await p.waitForTimeout(400)
  const r = await p.evaluate(()=>{
    const g=document.querySelector('[aria-label="Формы выпуска из реестра"]')
    const chips=[...document.querySelectorAll('.chip')].map(c=>({t:c.textContent.slice(0,50),w:Math.round(c.getBoundingClientRect().width),h:Math.round(c.getBoundingClientRect().height),r:Math.round(c.getBoundingClientRect().right)}))
    return {iw:window.innerWidth, sw:document.scrollingElement.scrollWidth, minH:Math.min(...chips.map(c=>c.h)), maxR:Math.max(...chips.map(c=>c.r)), chips:chips.slice(0,14)}
  })
  console.log('=== '+label+' === innerWidth', r.iw, 'scrollWidth', r.sw, 'minChipHeight', r.minH, 'maxRight', r.maxR)
  r.chips.forEach(c=>console.log(`  w=${c.w} h=${c.h} r=${c.r} :: ${c.t}`))
  await p.screenshot({path:SP+'_um_fix_'+label+'.png'})
  await b.close()
}
