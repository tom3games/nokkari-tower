import './mute-auto.mjs'
// SNS 用の画像 og.png（1200x630）。遊んでいる一番おもしろい場面（揺れる高い塔と、落ちてくる三角）＋題名。node og.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
const ROOT = import.meta.dirname, PORT = 6584
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(), p = await (await b.newContext({ locale: 'ja-JP', viewport: { width: 400, height: 800 } })).newPage()
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__ntReady)
const data = await p.evaluate(async () => {
  const W = 1200, H = 630, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d')
  const img = new Image(); img.src = NT_ATLAS.img; await img.decode()
  const F = NT_ATLAS.f, INK = '#2b2b2b'
  const spr = (n, cx, by, w, rot = 0, flip = false, anchor = 'bottom') => { const f = F[n], h = w * f[3] / f[2]; x.save(); x.translate(cx, by); x.rotate(rot); if (flip) x.scale(-1, 1); x.drawImage(img, f[0], f[1], f[2], f[3], -w / 2, anchor === 'mid' ? -h / 2 : -h, w, h); x.restore(); return h }
  const sparkle = (cx, cy, r) => { x.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rad = i % 2 ? r * 0.32 : r; x.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad) } x.closePath(); x.fillStyle = '#ffd34d'; x.fill(); x.lineWidth = 2.5; x.strokeStyle = INK; x.stroke() }
  x.fillStyle = '#fbf5e9'; x.fillRect(0, 0, W, H)
  // 題名
  const FF = (wt, px) => `${wt} ${px}px "M PLUS Rounded 1c",sans-serif`
  await document.fonts.load(FF(800, 100), 'のっかりタワー'); await document.fonts.load(FF(500, 36), 'へんな生き物を、どこまで積める？')
  x.fillStyle = INK; x.font = FF(800, 108); x.fillText('のっかり', 70, 210)
  const tw = x.measureText('タワー').width
  x.fillStyle = '#ffd34d'; x.fillRect(160, 286, tw + 24, 40)
  x.fillStyle = INK; x.fillText('タワー', 170, 330)
  x.font = FF(500, 36); x.fillStyle = '#5f5b54'; x.fillText('へんな生き物を、どこまで積める？', 74, 420)
  x.font = FF(800, 30); x.fillStyle = INK; x.fillText('指を左右に動かして、受け止めるだけ。', 74, 486)
  x.beginPath(); for (let i = 0; i <= 24; i++) { const u = i / 24; x.lineTo(560 + u * 50, 120 + Math.sin(u * Math.PI * 3) * 7) } x.strokeStyle = '#ff9ec4'; x.lineWidth = 5; x.lineCap = 'round'; x.stroke()
  // 揺れる塔
  const gx = 900, gy = 612
  x.strokeStyle = INK; x.lineWidth = 4; x.beginPath(); x.moveTo(700, gy); x.lineTo(1170, gy); x.stroke()
  const s = 0.86
  const ch = spr('carrier_s', gx, gy, 124 * s * 1.04)
  let by = gy - ch * 0.95, bx = gx + 4, ang = 0
  const K = NT_DATA.KINDS
  const list = [['bean', 0], ['cube', 6], ['pud', -4], ['pink', 10], ['cube', 6], ['tri', 8], ['bean', 4], ['cube', 10]]
  list.forEach(([k, dx], i) => {
    const kk = K[k], w = kk.w * s, f = F[i >= list.length - 2 ? kk.ff : kk.f]
    ang = 0.03 + i * 0.022
    bx += dx * s
    const h = spr(i >= list.length - 2 ? kk.ff : kk.f, bx, by, w * (i >= list.length - 2 ? 1.05 : 1), ang, i % 2 === 1)
    const hh = (w * F[kk.f][3] / F[kk.f][2]) * kk.ht
    bx += Math.sin(ang) * hh; by -= Math.cos(ang) * hh
    void f; void h
  })
  // 揺れの線
  x.lineWidth = 4; x.strokeStyle = INK; for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { const yy = by + 70 + i * 14; x.beginPath(); x.moveTo(bx - 10 + sd * 74, yy - 7); x.lineTo(bx - 10 + sd * 86, yy + 7); x.stroke() }
  // 落ちてくる三角と点線
  spr('pud_f', 1110, 140, 76, 0.25)
  x.setLineDash([3, 12]); x.lineWidth = 4; x.beginPath(); x.moveTo(1075, 150); x.quadraticCurveTo(1020, 150, bx + 30, by - 10); x.stroke(); x.setLineDash([])
  // 地面で見ているプリン、落ちた子
  spr('pud', 760, gy, 66)
  sparkle(1150, 300, 12); sparkle(700, 80, 9); sparkle(640, 540, 8)
  return c.toDataURL('image/png')
})
writeFileSync(ROOT + '/og.png', Buffer.from(data.split(',')[1], 'base64'))
console.log('og.png')
await b.close(); server.kill()
