import { chromium } from 'playwright'
import { seed, settle, FROZEN } from './tools/visual.mjs'
const OUT = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/probe'
const text = process.env.TEXT ?? 'normal', density = process.env.DENS ?? 'normal'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
await page.addInitScript(`const _D=Date; class D extends _D{constructor(...a){if(!a.length)super(${FROZEN});else super(...a)} static now(){return ${FROZEN}}} globalThis.Date=D;`)
await page.goto('http://localhost:5199'); await settle(page); await seed(page, FROZEN); await page.reload(); await settle(page)
await page.evaluate(([t,d])=>{document.documentElement.dataset.text=t;document.documentElement.dataset.density=d},[text,density])
await page.waitForTimeout(300)
await page.locator('nav.tabs button', { hasText: 'Давление' }).first().click(); await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/a-top-${text}-${density}.png` })
// прокрутка на 47px — панель должна отлипнуть
await page.evaluate(()=>scrollTo(0,60)); await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/b-scroll60-${text}-${density}.png` })
// открыть details
await page.evaluate(()=>scrollTo(0,0)); await page.waitForTimeout(300)
await page.locator('form.card summary').click(); await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/c-details-open-${text}-${density}.png` })
console.log(await page.evaluate(()=>{
  const r=e=>{const b=e.getBoundingClientRect();return[+b.top.toFixed(0),+b.bottom.toFixed(0)]}
  const sel=document.querySelector('form.card details select'), inp=document.querySelector('form.card details input')
  return JSON.stringify({scrollY, sel:r(sel), inp:r(inp), actions:r(document.querySelector('.form-actions')), maxScroll:document.documentElement.scrollHeight-innerHeight,
    hitSel:(()=>{const b=sel.getBoundingClientRect();const e=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return e&&e.tagName+'|'+e.className})(),
    hitInp:(()=>{const b=inp.getBoundingClientRect();const e=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);return e&&e.tagName+'|'+e.className})()})
}))
await browser.close()
