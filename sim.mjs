import './mute-auto.mjs'
// 遊び方ごとの分布（2回落としたら終わり・時間制限なし）。node sim.mjs [回数=12]。600秒で打ち切り
// human: 人の速さ（気づくまで0.5〜0.9秒・狙いのずれ±12・指は420/秒・揺れ0.18で気づく）/ fast / slow / noBal（揺れを直さない）/ star（星も取りに行く）/ idle（何もしない）/ jerk（急に大きく動かす）
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname, PORT = 6582, N = +(process.argv[2] || 12)
const ONLY = process.argv[3]
const TUNE = process.env.TUNE ? JSON.parse(process.env.TUNE) : null
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } }), p = await ctx.newPage()
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__ntReady)
if (TUNE) await p.evaluate(t => Object.assign(nt.TUNE, t), TUNE)
const BOTS = {
  human: { react: [0.5, 0.9], err: 12, spd: 420, bal: 60, thr: 0.18 },
  fast: { react: [0.3, 0.5], err: 6, spd: 650, bal: 80, thr: 0.12 },
  slow: { react: [0.8, 1.2], err: 18, spd: 300, bal: 40, thr: 0.22 },
  noBal: { react: [0.5, 0.9], err: 12, spd: 420, bal: 0, thr: 1 },
  star: { react: [0.5, 0.9], err: 12, spd: 420, bal: 60, thr: 0.18, star: true },
  jerk: { react: [0.5, 0.9], err: 12, spd: 1400, bal: 60, thr: 0.18 },
  idle: { react: [0.5, 0.9], err: 0, spd: 0, idle: true },
}
const out = {}
for (const [name, cfg] of Object.entries(BOTS)) {
  if (ONLY && !ONLY.split(',').includes(name)) continue
  const rows = []
  for (let s = 1; s <= N; s++) {
    rows.push(await p.evaluate(({ cfg, s }) => {
      nt.dbg.seed(s * 101 + 7); nt.start(); nt.dbg.pause(); const G = nt.G
      let rs = s * 7919 + 13; const Rb = () => (rs = rs * 16807 % 2147483647) / 2147483647
      const bot = nt.makeBot(cfg, Rb)
      let f = 0
      while (G.phase === 'play' && f++ < 60 * 600) { bot(1 / 60); nt.dbg.tick(1) }
      return { best: G.best, n: G.stack.length, slips: G.slips, drops: G.drops, caught: G.caught, stars: G.stars, t: +G.t.toFixed(0), maxTh: +G.maxTh.toFixed(2), ended: G.phase !== 'play' }
    }, { cfg, s }))
  }
  const med = k => rows.map(r => r[k]).sort((a, b) => a - b)[Math.floor(N / 2)]
  out[name] = { medBest: med('best'), min: Math.min(...rows.map(r => r.best)), max: Math.max(...rows.map(r => r.best)), slips: rows.reduce((a, r) => a + r.slips, 0), medSec: med('t'), stars: rows.reduce((a, r) => a + r.stars, 0), ended: rows.filter(r => r.ended).length, bests: rows.map(r => r.best).join(',') }
  console.log(name.padEnd(6), JSON.stringify(out[name]))
}
await b.close(); server.kill()
