import './mute-auto.mjs'
// 台本どおりに進めて撮る。node shot.mjs [幅 高さ]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname, PORT = 6581
mkdirSync(ROOT + '/shots', { recursive: true })
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const w = +(process.argv[2] || 390), h = +(process.argv[3] || 844)
const b = await chromium.launch()
const ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: w, height: h }, deviceScaleFactor: 2 })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__ntReady)
await p.waitForTimeout(600)
await p.screenshot({ path: `shots/title_${w}.png` })
await p.click('#bStart'); await p.evaluate(() => { nt.dbg.pause(); nt.dbg.seed(7) })
await p.evaluate(() => { nt.dbg.step(60); nt.dbg.stack(['bean', 'cube', 'pink']); nt.dbg.step(30); nt.dbg.drop('tri', 20); nt.dbg.step(40) })
await p.screenshot({ path: `shots/play1_${w}.png` })
await p.evaluate(() => { nt.dbg.stack(['cube', 'pud', 'tri', 'bean', 'cube', 'pink', 'pud', 'cube', 'bean', 'tri', 'cube', 'pud', 'blue2', 'cube', 'pink', 'bean', 'gold', 'cube']); nt.G.th = 0.3; nt.dbg.step(90) })
await p.screenshot({ path: `shots/play2_${w}.png` })
await p.evaluate(() => { nt.dbg.stack(Array.from({ length: 30 }, (_, i) => ['cube', 'bean', 'pud', 'tri', 'pink'][i % 5])); nt.dbg.step(200) })
await p.screenshot({ path: `shots/play3_${w}.png` })
await p.evaluate(() => { nt.dbg.finish(); nt.dbg.tick(200) })
await p.waitForTimeout(700)
await p.screenshot({ path: `shots/end_${w}.png` })
console.log(JSON.stringify(await p.evaluate(() => nt.state())), errs)
await b.close(); server.kill()
