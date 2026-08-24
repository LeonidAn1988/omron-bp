import { chromium } from 'playwright'
import { seed, settle, FROZEN } from './tools/visual.mjs'
const OUT='/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/probe'
const text=process.env.TEXT??'normal', density=process.env.DENS??'normal', H=+(process.env.H??812)
const browser=await chromium.launch()
const ctx=await browser.newContext({viewport:{width:375,height:H},deviceScaleFactor:2,isMobile:true,hasTouch:true})
const page=await ctx.newPage()
await page.addInitScript(`const _D=Date;class D extends _D{constructor(...a){if(!a.length)super(${FROZEN});else super(...a)} static now(){return ${FROZEN}}} globalThis.Date=D;`)
await page.goto('http://localhost:5199');await settle(page);await seed(page,FROZEN);await page.reload();await settle(page)
await page.evaluate(([t,d])=>{document.documentElement.dataset.text=t;document.documentElement.dataset.density=d},[text,density])
await page.waitForTimeout(300)
await page.locator('nav.tabs button',{hasText:'Давление'}).first().click();await page.waitForTimeout(500)

// выставляем 145/95 стрелками
const spin=page.locator('[role="spinbutton"]')
await spin.nth(0).focus(); for(let i=0;i<25;i++){await page.keyboard.press('ArrowUp')} await page.waitForTimeout(500)
await spin.nth(1).focus(); for(let i=0;i<15;i++){await page.keyboard.press('ArrowUp')} await page.waitForTimeout(500)
await page.evaluate(()=>scrollTo(0,0)); await page.waitForTimeout(300)
console.log('значения:',await page.evaluate(()=>[...document.querySelectorAll('[role="spinbutton"]')].map(e=>e.getAttribute('aria-valuenow'))))
console.log('счётчик до:', await page.locator('.card__head .muted').first().innerText())
await page.screenshot({path:`${OUT}/flow-before-${text}-${density}-${H}.png`})
const geom = async(t)=>console.log(t, await page.evaluate(()=>{
  const r=e=>{if(!e)return null;const b=e.getBoundingClientRect();return[Math.round(b.top),Math.round(b.bottom)]}
  return JSON.stringify({scrollY,card:r(document.querySelector('form.card')),actions:r(document.querySelector('.form-actions')),
   saved:r(document.querySelector('[role=status] .banner--good')),warn:r(document.querySelectorAll('[role=status] .banner')[1]||null),
   hist:r(document.querySelectorAll('.card')[1]), innerH:innerHeight})
}))
await geom('до:')
await page.locator('.form-actions button').first().click()
await page.waitForTimeout(1000)
await page.screenshot({path:`${OUT}/flow-after-${text}-${density}-${H}.png`})
await geom('после:')
console.log('счётчик после:', await page.locator('.card__head .muted').first().innerText())
// небольшая прокрутка
await page.evaluate(()=>scrollBy(0,200));await page.waitForTimeout(400)
await page.screenshot({path:`${OUT}/flow-after-scroll-${text}-${density}-${H}.png`})
await browser.close()
