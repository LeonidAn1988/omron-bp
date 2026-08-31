import { chromium } from 'playwright'
import fs from 'node:fs'
const css = fs.readFileSync('/Users/leonidanchevskiy/Claude_Projects/omron/src/app.css','utf8')
const html = `<!doctype html><meta charset=utf-8><style>${css}</style>
<div class="banner banner--warning" style="padding:16px">
 <div class="row">
  <button id="p" class="btn btn--primary">Отправить копию</button>
  <button id="n" class="btn">Настроить</button>
  <button id="s" class="btn btn--sm">Понятно</button>
 </div>
</div>`
const b = await chromium.launch()
const p = await b.newPage({ viewport:{width:375,height:900}, deviceScaleFactor:3.25 })
await p.setContent(html)
const combos = []
for (const text of ['small','normal','large','xlarge'])
  for (const dens of ['compact','normal','roomy'])
    combos.push([text,dens])
const rows = []
for (const [text,dens] of combos) {
  await p.evaluate(([t,d])=>{
    const r=document.documentElement
    if (t==='normal') r.removeAttribute('data-text'); else r.setAttribute('data-text',t)
    if (d==='normal') r.removeAttribute('data-density'); else r.setAttribute('data-density',d)
  },[text,dens])
  const m = await p.evaluate(()=>{
    const g=id=>{const e=document.getElementById(id);const r=e.getBoundingClientRect();
      return {h:+r.height.toFixed(2), fs:getComputedStyle(e).fontSize, mh:getComputedStyle(e).minHeight}}
    return {root:getComputedStyle(document.documentElement).fontSize,
      tap:getComputedStyle(document.documentElement).getPropertyValue('--tap').trim(),
      su:getComputedStyle(document.documentElement).getPropertyValue('--space-unit').trim(),
      p:g('p'), n:g('n'), s:g('s')}
  })
  rows.push({text,dens,...m})
}
for (const r of rows)
  console.log(`text=${r.text.padEnd(7)} dens=${r.dens.padEnd(8)} root=${r.root.padEnd(8)} su=${r.su.padEnd(4)} tapComputed=${(r.n.mh).padEnd(6)} | .btn=${String(r.n.h).padEnd(7)} .btn--primary=${String(r.p.h).padEnd(7)} .btn--sm=${String(r.s.h).padEnd(7)} (min-height ${r.s.mh}, font ${r.s.fs})`)
await b.close()
