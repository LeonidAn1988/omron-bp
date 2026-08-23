import { chromium } from 'playwright'
const DIR = '/private/tmp/claude-501/-Users-leonidanchevskiy-Claude-Projects-omron/1fdaf5ae-307c-445c-870f-f25a2eef576d/scratchpad/probe'
const b = await chromium.launch()
for (const width of [360, 320, 412]) {
  const p = await b.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 2 })
  await p.goto('file://' + DIR + '/page.html')
  for (const scale of [1.0, 1.15, 1.3, 1.5, 1.8, 2.0]) {
    await p.evaluate((s) => { document.documentElement.style.fontSize = (16 * s) + 'px' }, scale)
    const r = await p.evaluate(() => {
      const seg = document.querySelector('.segmented')
      const row = document.querySelector('.row')
      const app = document.querySelector('.app')
      const rb = seg.getBoundingClientRect()
      const ab = app.getBoundingClientRect()
      const cs = getComputedStyle(app)
      const availLeft = ab.left + parseFloat(cs.paddingLeft)
      const availRight = ab.right - parseFloat(cs.paddingRight)
      const btns = [...seg.querySelectorAll('button')].map(x => ({t:x.textContent, w:+x.getBoundingClientRect().width.toFixed(1), r:+x.getBoundingClientRect().right.toFixed(1)}))
      return {
        segW: +rb.width.toFixed(1), segLeft:+rb.left.toFixed(1), segRight: +rb.right.toFixed(1),
        avail: +(availRight - availLeft).toFixed(1),
        availRight: +availRight.toFixed(1),
        docScrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
        fs: getComputedStyle(seg.querySelector('button')).fontSize,
        btns,
      }
    })
    const over = +(r.segRight - r.availRight).toFixed(1)
    const offscreen = +(r.segRight - r.clientW).toFixed(1)
    console.log(`w=${width} scale=${scale} fs=${r.fs} seg=${r.segW} avail=${r.avail} overflowPastPadding=${over} pastViewport=${offscreen} scrollW=${r.docScrollW}/${r.clientW} last="${r.btns[3].t}" lastRight=${r.btns[3].r}`)
  }
  await p.close()
  console.log('---')
}
await b.close()
