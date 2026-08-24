import { chromium } from 'playwright'
import { seed, settle, FROZEN } from './tools/visual.mjs'
const browser=await chromium.launch()
const rows=[]
for (const H of [667, 740, 812, 844, 915]) {
  for (const [t,d] of [['normal','normal'],['large','normal'],['xlarge','normal'],['xlarge','roomy'],['small','compact']]) {
    const ctx=await browser.newContext({viewport:{width:375,height:H},deviceScaleFactor:2,isMobile:true,hasTouch:true})
    const page=await ctx.newPage()
    await page.addInitScript(`const _D=Date;class D extends _D{constructor(...a){if(!a.length)super(${FROZEN});else super(...a)} static now(){return ${FROZEN}}} globalThis.Date=D;`)
    await page.goto('http://localhost:5199');await settle(page);await seed(page,FROZEN);await page.reload();await settle(page)
    await page.evaluate(([t,d])=>{document.documentElement.dataset.text=t;document.documentElement.dataset.density=d},[t,d])
    await page.waitForTimeout(250)
    await page.locator('nav.tabs button',{hasText:'Давление'}).first().click();await page.waitForTimeout(400)
    const spin=page.locator('[role="spinbutton"]')
    await spin.nth(0).focus(); for(let i=0;i<25;i++) await page.keyboard.press('ArrowUp'); await page.waitForTimeout(400)
    await spin.nth(1).focus(); for(let i=0;i<15;i++) await page.keyboard.press('ArrowUp'); await page.waitForTimeout(400)
    await page.evaluate(()=>scrollTo(0,0)); await page.waitForTimeout(250)
    const before = await page.evaluate(()=>({wheel:[...document.querySelectorAll('[role=spinbutton]')].map(e=>e.getAttribute('aria-valuenow')).join('/'), count:document.querySelectorAll('.card__head .muted')[0].textContent.trim()}))
    await page.locator('.form-actions button').first().click()
    await page.waitForTimeout(900)
    const after = await page.evaluate(()=>{
      const b=document.querySelector('[role=status] .banner--good')
      const r=b?b.getBoundingClientRect():null
      const navTop = document.querySelector('nav.tabs').getBoundingClientRect().top
      const vis = r? Math.max(0, Math.min(r.bottom, navTop) - Math.max(r.top,0)) : 0
      return {scrollY:Math.round(scrollY), banner: r?[Math.round(r.top),Math.round(r.bottom)]:null, visPx: Math.round(vis), navTop:Math.round(navTop),
        wheel:[...document.querySelectorAll('[role=spinbutton]')].map(e=>e.getAttribute('aria-valuenow')).join('/'),
        count:document.querySelectorAll('.card__head .muted')[0].textContent.trim()}
    })
    rows.push({H,t,d,колёса_до:before.wheel,колёса_после:after.wheel,счёт_до:before.count,счёт_после:after.count,баннер:after.banner?after.banner.join('-'):'—',видно_px:after.visPx})
    await ctx.close()
  }
}
console.table(rows)
await browser.close()
