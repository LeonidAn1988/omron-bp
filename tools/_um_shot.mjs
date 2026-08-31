import { chromium } from 'playwright'
import { seed } from './visual.mjs'
const URL='http://localhost:8791/'
const FROZEN = new Date('2026-08-15T10:30:00+03:00').getTime()
const SP='/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/'
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
await p.evaluate(()=>{ const g=document.querySelector('[aria-label="Формы выпуска из реестра"]'); g.scrollIntoView({block:'center'}) })
await p.waitForTimeout(300)
await p.screenshot({path:SP+'_um_broken_left.png'})
await p.evaluate(()=>window.scrollTo(document.scrollingElement.scrollWidth, window.scrollY))
await p.waitForTimeout(300)
const nav = await p.evaluate(()=>{ const n=document.querySelector('nav.tabs'); const r=n.getBoundingClientRect(); return {pos:getComputedStyle(n).position, left:Math.round(r.left), right:Math.round(r.right), scrollX:Math.round(window.scrollX)} })
console.log('NAV after horizontal scroll', JSON.stringify(nav))
await p.screenshot({path:SP+'_um_broken_right.png'})
await b.close()
