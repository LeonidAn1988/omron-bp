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
    const r = await page.evaluate(()=>{
      const g=e=>{const b=e.getBoundingClientRect();return{t:Math.round(b.top),b:Math.round(b.bottom)}}
      const s=document.querySelector('form.card summary'), a=document.querySelector('.form-actions')
      const S=g(s),A=g(a)
      const hidden = Math.max(0, Math.min(S.b,A.b)-Math.max(S.t,A.t))
      const el=document.elementFromPoint(60, S.t+2)
      return {sum:[S.t,S.b], act:[A.t,A.b], hiddenPx:hidden, visiblePx:(S.b-S.t)-hidden,
        hitTop: el?el.tagName:null, maxScroll: document.documentElement.scrollHeight-innerHeight}
    })
    // прокрутить так, чтобы кнопка отлипла, и проверить summary
    const after = await page.evaluate(async()=>{
      const a=document.querySelector('.form-actions')
      // прокрутка ровно до конца карточки
      const form=document.querySelector('form.card')
      scrollTo(0, scrollY + form.getBoundingClientRect().bottom - innerHeight + 70)
      await new Promise(r=>setTimeout(r,350))
      const s=document.querySelector('form.card summary')
      const S=s.getBoundingClientRect(), A=a.getBoundingClientRect()
      const hidden=Math.max(0, Math.min(S.bottom,A.bottom)-Math.max(S.top,A.top))
      const el=document.elementFromPoint(60, S.top+S.height/2)
      return {scrollY:Math.round(scrollY), hidden:Math.round(hidden), sumTop:Math.round(S.top), hit: el?el.tagName:null}
    })
    rows.push({H,t,d,...r, afterScroll:after})
    await ctx.close()
  }
}
console.table(rows.map(r=>({H:r.H,text:r.t,dens:r.d,summary:r.sum.join('-'),actions:r.act.join('-'),скрыто:r.hiddenPx,видно:r.visiblePx,hit:r.hitTop,'после прокрутки скрыто':r.afterScroll.hidden,'hit после':r.afterScroll.hit})))
await browser.close()
