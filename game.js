// のっかりタワー（nokkari-tower）。指を左右に動かして、落ちてくる生き物を水色の板の上に積む
// 仕様の正本: ~/Desktop/claudecode/ideas/nokkari-tower.md
;(() => {
'use strict'
window.__jsUp = true
const D = NT_DATA, A = NT_ATLAS
const $ = s => document.querySelector(s)
const on = (s, f) => $(s).addEventListener('click', f)
const isJa = () => (navigator.language || 'ja').toLowerCase().startsWith('ja')
let lang = 'ja'
try { lang = localStorage.getItem('nt_lang') || (isJa() ? 'ja' : 'en') } catch (e) { lang = isJa() ? 'ja' : 'en' }
const T = () => D.TXT[lang]

// ---- 乱数（種を固定できる） ----
let seedV = (Date.now() % 2147483646) + 1
const R = () => (seedV = seedV * 16807 % 2147483647) / 2147483647
const rr = (a, b) => a + (b - a) * R()
const pick = a => a[Math.floor(R() * a.length)]
const clamp = (v, a, b) => v < a ? a : v > b ? b : v
const lerp = (a, b, k) => a + (b - a) * k
const sgn = v => v < 0 ? -1 : 1

// ---- 音（録音素材） ----
const N = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1))
Snd.def({
  pop: N(3, i => `snd/pop${i}.mp3`), thud: N(3, i => `snd/thud${i}.mp3`), slime: N(3, i => `snd/slime${i}.mp3`), sq: N(3, i => `snd/sq${i}.mp3`),
  fall: ['snd/fall1.mp3', 'snd/fall2.mp3'], splat: ['snd/splat1.mp3', 'snd/splat2.mp3'], swish: ['snd/swish1.mp3', 'snd/swish2.mp3'],
  coin: 'snd/coin.mp3', jgood: 'snd/jgood.mp3', jmeh: 'snd/jmeh.mp3', jrare: 'snd/jrare.mp3', jover: 'snd/jover.mp3',
  click: 'snd/click.mp3', giggle: 'snd/giggle.mp3', cloth: 'snd/cloth.mp3', flap: 'snd/flap.mp3',
})
const LOOPS = { bgmT: 'snd/bgm_title.mp3', bgm: 'snd/bgm_play.mp3', park: 'snd/amb_park.mp3', wind: 'snd/amb_wind.mp3' }
let muted = false
try { muted = localStorage.getItem('nt_mute') === '1' } catch (e) {}
Snd.setMute(muted)
const sfx = (n, o) => Snd.play(n, o)
function loopVol(slot, v, tc = 0.2) { const l = Snd.loops[slot]; if (l && l.g && Snd.ctx) { l.g.gain.cancelScheduledValues(Snd.ctx.currentTime); l.g.gain.setTargetAtTime(Math.max(0.0001, v), Snd.ctx.currentTime, tc) } }
const loopsOn = {}
function loop(slot, vol) { if (vol == null) { if (loopsOn[slot]) { Snd.loop(slot, null); loopsOn[slot] = 0 } return } if (!loopsOn[slot]) { Snd.loop(slot, LOOPS[slot], vol); loopsOn[slot] = 1 } else loopVol(slot, vol) }
function allLoopsOff() { for (const k in loopsOn) loop(k, null) }

// ---- 絵（1枚にまとめた生き物たち） ----
const IMG = new Image()
let imgOk = false
const fr = n => A.f[n]
const aspect = n => fr(n)[3] / fr(n)[2]
// 生き物を1体描く。x,y は画面座標、w は画面での幅。anchor: bottom（足元）/ top（板の上面）/ mid
function spr(c, name, x, y, w, rot = 0, o = {}) {
  if (!imgOk) return
  const f = fr(name), h = w * f[3] / f[2]
  c.save(); c.translate(x, y); if (rot) c.rotate(rot)
  if (o.sx || o.sy) c.scale(o.sx || 1, o.sy || 1)
  if (o.flip) c.scale(-1, 1)
  if (o.alpha != null) c.globalAlpha = o.alpha
  const top = o.anchor === 'top' ? 0 : o.anchor === 'mid' ? -h / 2 : -h
  if (o.gold && GOLD[name]) c.drawImage(GOLD[name], 0, 0, f[2], f[3], -w / 2, top, w, h)
  else c.drawImage(IMG, f[0], f[1], f[2], f[3], -w / 2, top, w, h)
  c.restore()
}
// 金色のプリン（Safari は ctx.filter が効かないので、読み込み時に色を塗り替えた絵を作っておく）
const GOLD = {}
function makeGold() {
  for (const n of ['pud', 'pud_f']) {
    const f = fr(n), c = document.createElement('canvas'); c.width = f[2]; c.height = f[3]
    const g = c.getContext('2d'); g.drawImage(IMG, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3])
    try {
      const d = g.getImageData(0, 0, f[2], f[3]), a = d.data
      for (let i = 0; i < a.length; i += 4) { const r = a[i], gg = a[i + 1], b = a[i + 2]; if (r > 180 && gg > 150 && b < 140) { a[i] = 238; a[i + 1] = Math.round(gg * 0.72); a[i + 2] = 40 } }
      g.putImageData(d, 0, 0)
    } catch (e) {}
    GOLD[n] = c
  }
}
const K = D.KINDS
// 揺れの強さ（sim で決めた値）
const TUNE = { drive: 0.0022, damp: 1.3, stiff: 30, slipAt: 0.42 }
const KH = k => K[k].w * aspect(K[k].f)   // 世界での高さ
const CW = 124                             // 水色の幅（世界）
const CH = () => CW * aspect('carrier')
const BT = () => CH() * 0.97               // 板の上面
const XR = 140                             // 水色が動ける幅（端の子が画面から切れない幅）

// ---- 画面 ----
const cv = $('#cv')
const cx = cv.getContext('2d')
let W = 390, H = 844, DPR = 1, S = 1, GY = 760
function resize() {
  const r = cv.getBoundingClientRect()
  W = Math.max(240, r.width || innerWidth); H = Math.max(320, r.height || innerHeight)
  DPR = Math.min(2, window.devicePixelRatio || 1)
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR)
  GY = H * 0.9
  sizeTitleArt()
}
addEventListener('resize', () => { resize(); if (G.scene === 'end') drawRes() })
const s0 = () => Math.min(W / 390, H / 740)
const sx = wx => W / 2 + wx * S
const sy = wy => GY - (wy - G.camY) * S

// ---- 状態 ----
const G = window.__ntG = { scene: 'title', phase: 'title', t: 0, paused: false, camY: 0, zoom: 1, stack: [], fallers: [], fx: [], ground: [] }
let fid = 0
function reset() {
  Object.assign(G, {
    phase: 'play', t: 0, X: 0, V: 0, TX: 0, Acc: 0, th: 0, om: 0, stack: [], fallers: [], fx: [], ground: [],
    misses: 0, bonus: 0, best: 0, bestSnap: [], peakY: 0, nextSpawn: 0.8, preview: null, starAt: 18, mile: 0,
    wind: { st: 'idle', t: 0, at: 0, dir: 1, f: 0 }, camY: 0, zoom: 1, bub: null, popUntil: 0, caught: 0, lines: 0,
    topX: 0, topY: BT(), topW: CW * 0.95, topAng: 0, Htot: 0, warn: 0, endT: 0, slips: 0, drops: 0, stars: 0, golds: 0, blues: 0, maxTh: 0,
  })
  layout()
}

// ---- 塔の形（下から順に、ひとつ前の傾きの上に乗せていく） ----
function layout() {
  const st = G.stack, n = st.length
  let H0 = 0; for (const p of st) H0 += p.h * p.ht
  const k = Math.min(1, 520 / Math.max(H0, 1))
  let ang = G.th * 0.06, bx = G.X, by = BT(), cum = 0
  let msum = 2.2, mx = 0
  for (let i = 0; i < n; i++) {
    const p = st[i]
    bx += p.dx * Math.cos(ang); by -= p.dx * Math.sin(ang)
    cum += p.dx
    const s = n > 1 ? 0.25 + 0.75 * i / (n - 1) : 1
    const a = G.th * s * k + (p.tilt || 0)
    p.bx = bx; p.by = by; p.ang = a; p.cum = cum
    msum += p.m; mx += p.m * cum
    const hh = p.h * p.ht
    bx += Math.sin(a) * hh; by += Math.cos(a) * hh
    ang = a
  }
  G.topX = bx; G.topY = by; G.topAng = ang; G.Htot = H0
  G.topW = n ? st[n - 1].w * st[n - 1].top : CW * 0.95
  G.comX = mx / msum
}

// ---- 入力（指の動きと同じ向きに、同じだけ動く） ----
let ptr = null
cv.addEventListener('pointerdown', e => {
  Snd.init(); ptr = { id: e.pointerId, x: e.clientX }
  try { cv.setPointerCapture(e.pointerId) } catch (er) {}
})
cv.addEventListener('pointermove', e => {
  if (G.phase !== 'play') { if (ptr) ptr.x = e.clientX; return }
  if (ptr && ptr.id === e.pointerId) { G.TX = clamp(G.TX + (e.clientX - ptr.x) / S, -XR, XR); ptr.x = e.clientX }
  else if (!ptr && e.pointerType === 'mouse') { if (G.mx != null) G.TX = clamp(G.TX + (e.clientX - G.mx) / S, -XR, XR); G.mx = e.clientX }
})
const up = e => { if (ptr && ptr.id === e.pointerId) ptr = null }
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up)

// ---- 出てくる生き物 ----
function pickKind() {
  const n = G.stack.length
  if (n >= 6 && R() < 1 / 28) return 'gold'
  if (n >= 12 && R() < 1 / 36) return 'blue2'
  const w = [['cube', 30], ['bean', 17], ['tri', 16], ['pud', 18], ['pink', n >= 3 ? 19 : 0]]
  let s = 0; for (const [, v] of w) s += v
  let r = R() * s; for (const [k, v] of w) { if ((r -= v) < 0) return k }
  return 'cube'
}
const fallSpd = () => 150 + Math.min(G.stack.length, 60) * 3.1
const viewTop = () => G.camY + GY / S
const viewBot = () => G.camY - (H - GY) / S
function planSpawn() {
  const n = G.stack.length, spread = 110 + Math.min(n, 30) * 2
  const kind = pickKind()
  // 最初の数個は必ず少し動かさないと取れない位置に落とす（何もしないで積めないように）
  const need = G.topW / 2 + K[kind].w * 0.38 + 10   // これより離れていれば、動かさないと取れない
  let side = R() < 0.5 ? -1 : 1
  if (n < 4 && Math.abs(G.topX + side * need) > XR - 16) side = -side
  const x = clamp(G.topX + side * (n < 4 ? rr(need, need + 30) : rr(spread * 0.2, spread)), -XR + 16, XR - 16)
  G.preview = { kind, x, t: 0.55 }
}
function spawn(kind, x, mode = 'drop') {
  const y0 = Math.min(viewTop() + 20, G.topY + 440)
  const f = { id: ++fid, kind, x, y: y0, vx: 0, vy: mode === 'star' ? -118 : -fallSpd(), rot: rr(-0.25, 0.25), vr: rr(-1, 1), mode, age: 0, flip: R() < 0.5 }
  G.fallers.push(f)
  if (mode === 'drop') { G.drops++; sfx('swish', { vol: 0.35 }) }
  return f
}
const activeDrops = () => G.fallers.filter(f => f.mode === 'drop')

// ---- ことば（同時に1つだけ） ----
function say(text, target, sec = 1.6) {
  if (G.t < G.popUntil) return
  G.bub = { text, target, until: G.t + Math.max(sec, 0.9 + text.length * 0.09) }
}
function pop(text, bad, sec = 1.3) {
  const el = $('#pop'); el.textContent = text; el.className = ''; void el.offsetWidth; el.className = 'on' + (bad ? ' bad' : '')
  G.popUntil = G.t + sec; G.bub = null
}

// ---- 受け止める ----
function land(f) {
  const k = K[f.kind], n = G.stack.length
  const prevAng = G.topAng
  const dx = (f.x - G.topX) / Math.max(0.3, Math.cos(prevAng))
  const p = { id: f.id, kind: f.kind, w: k.w, h: KH(f.kind), ht: k.ht, top: k.top, m: k.mass, dx, flip: f.flip, tilt: rr(-0.05, 0.05), land: G.t, danceAt: G.t + rr(3, 5), hop: 0 }
  G.stack.push(p); G.caught++
  G.om += clamp(dx / 40, -1.2, 1.2) * 0.32 + (R() - 0.5) * 0.06
  layout()
  sfx(k.snd, { vol: 0.8 }); if (f.kind === 'blue2') sfx('cloth', { vol: 0.6 })
  burst(f.x, G.topY - p.h * p.ht, 'dust', 5)
  if (k.bonus) { G.bonus += k.bonus; G.golds++; sfx('jrare', { vol: 0.6 }); pop(T().gold); burst(f.x, G.topY, 'spark', 12) }
  if (f.kind === 'blue2') G.blues++
  const lines = T().say[f.kind]
  if (n === 0 || R() < 0.32 || f.kind === 'blue2' || f.kind === 'gold') say(pick(lines), p)
  const cl = [5, 12, 20, 30, 42, 56, 70]
  if (cl.includes(G.stack.length)) { const L = T().say.carrier; say(L[Math.min(G.lines++, L.length - 1)], 'carrier') }
  hideTut()
  score()
  G.nextSpawn = Math.min(G.nextSpawn, G.t + 0.35)
}
function score() {
  const s = G.stack.length + G.bonus
  if (s > G.best) { G.best = s; G.bestSnap = G.stack.map(p => ({ kind: p.kind, dx: p.dx, flip: p.flip })) }
  $('#hN').innerHTML = `${s}<small>${T().unit}</small>`
}
function miss(kind, why) {
  if (G.phase !== 'play') return
  G.misses++
  sfx('splat', { vol: 0.9 })
  pop(why === 'slip' ? T().slip : T().miss, true)
  drawMisses()
  if (G.misses >= D.MISSES) collapse()
  else G.nextSpawn = Math.min(G.nextSpawn, G.t + 0.9)
}
function drawMisses() { $('#hX').innerHTML = Array.from({ length: D.MISSES }, (_, i) => `<i class="${i < G.misses ? 'on' : ''}"></i>`).join('') }
function slip() {
  const p = G.stack.pop(); if (!p) return
  G.slips++
  const dir = sgn(G.th)
  G.fallers.push({ id: p.id, kind: p.kind, x: p.bx + Math.sin(p.ang) * p.h * 0.5, y: p.by, vx: dir * rr(120, 200), vy: rr(80, 160), rot: p.ang, vr: dir * rr(3, 6), mode: 'lost', age: 0, flip: p.flip })
  G.th *= 0.55; G.om *= 0.3
  layout()
  say(pick(T().say.slip), G.stack[G.stack.length - 1] || 'carrier', 1)
  sfx('fall', { vol: 0.7 })
  miss(p.kind, 'slip')
  score()
}
function collapse() {
  G.phase = 'collapse'; G.endT = G.t
  G.preview = null
  const dir = sgn(G.th || R() - 0.5)
  for (const p of G.stack) G.fallers.push({ id: p.id, kind: p.kind, x: p.bx, y: p.by, vx: dir * rr(40, 220) + rr(-60, 60), vy: rr(60, 260), rot: p.ang, vr: rr(-5, 5), mode: 'lost', age: 0, flip: p.flip, quiet: 1 })
  G.stack = []
  layout()
  sfx('fall', { vol: 0.8 }); sfx('jover', { vol: 0.6, delay: 0.5 })
  Snd.duck(0.3, 2.5)
  pop(T().ending, true, 2)
}

// ---- 演出の粒 ----
function burst(x, y, type, n) {
  for (let i = 0; i < n; i++) {
    const a = rr(0, Math.PI * 2), sp = type === 'dust' ? rr(40, 90) : rr(80, 220)
    G.fx.push({ type, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 + (type === 'dust' ? 20 : 90), t: 0, life: type === 'dust' ? 0.4 : rr(0.7, 1.2), col: pick(['#ff9ec4', '#ffd34d', '#7ec8f0', '#7bd389', '#ff8a3d']), r: rr(0, 6) })
  }
}

// ---- 1コマ（固定60Hz） ----
function update(dt) {
  if (G.scene !== 'play') return
  G.t += dt
  const t = G.t
  // 水色の動き（指の位置へバネで追う）
  if (G.phase === 'play') {
    const k = 320, c = 2 * Math.sqrt(k)
    const acc = clamp(k * (G.TX - G.X) - c * G.V, -5200, 5200)
    G.V = clamp(G.V + acc * dt, -950, 950); G.X += G.V * dt
    if (G.X > XR) { G.X = XR; G.V = Math.min(0, G.V) } if (G.X < -XR) { G.X = -XR; G.V = Math.max(0, G.V) }
    G.Acc = lerp(G.Acc, acc, 0.5)
  } else { G.V *= 0.9; G.Acc = 0 }
  // 揺れ（倒立した塔。下を急に動かすと上が遅れてしなる）
  const st = G.stack, n = st.length
  if (n) {
    let wob = 0; for (const p of st) if (K[p.kind].wobbly) wob++
    const stiff = TUNE.stiff / (1 + n * 0.09) * Math.pow(0.97, wob)
    const unst = 2.2 * Math.min(1, n / 25) + Math.max(0, n - 25) * 0.06
    const lev = 0.45 + Math.min(n, 40) * 0.03
    let al = -G.Acc * TUNE.drive * lev - (stiff - unst) * G.th - TUNE.damp * G.om + (G.comX / 60) * (0.6 + n * 0.035)
    if (G.wind.st === 'blow') al += G.wind.f * 0.9
    G.om += al * dt; G.th += G.om * dt
  } else { G.th *= 0.9; G.om = 0 }
  G.maxTh = Math.max(G.maxTh, Math.abs(G.th))
  layout()
  G.warn = n ? clamp((Math.abs(G.th) - 0.24) / 0.16, 0, 1) : 0
  if (G.phase === 'play' && n && Math.abs(G.th) > TUNE.slipAt) slip()
  // パーティー帽の子が上の方にいると、たまに踊って揺らす
  const n2 = G.stack.length
  if (G.phase === 'play') for (let i = Math.max(0, n2 - 3); i < n2; i++) {
    const p = G.stack[i]
    if (K[p.kind].party && t >= p.danceAt) {
      p.danceAt = t + rr(4.5, 7); p.hop = 0.35
      G.om += (R() < 0.5 ? -1 : 1) * 0.2
      burst(p.bx, p.by + p.h * 0.6, 'conf', 10); sfx('sq', { vol: 0.5, rate: 1.2 })
      if (R() < 0.5) say(pick(T().say.dance), p, 1)
    }
    if (p.hop > 0) p.hop -= dt
  }
  // 風（10段から）
  const w = G.wind
  if (G.phase === 'play' && n >= 10) {
    if (w.st === 'idle' && !w.at) w.at = t + rr(4, 8)
    if (w.st === 'idle' && w.at && t >= w.at) { w.st = 'warn'; w.t = t; w.dir = R() < 0.5 ? -1 : 1; w.f = (0.5 + Math.min(n, 60) * 0.012) * w.dir; loop('wind', 0.5) }
    else if (w.st === 'warn' && t - w.t > 1.2) { w.st = 'blow'; w.t = t }
    else if (w.st === 'blow' && t - w.t > 2.6) { w.st = 'idle'; w.at = t + rr(9, 14); loop('wind', windBase()) }
  }
  // 次の生き物
  if (G.phase === 'play') {
    if (G.preview) { G.preview.t -= dt; if (G.preview.t <= 0) { const pv = G.preview; G.preview = null; spawn(pv.kind, pv.x); const dbl = n >= 25 && R() < 0.3; G.nextSpawn = dbl ? t + 0.9 : Infinity } }
    else if (t >= G.nextSpawn && (activeDrops().length === 0 || G.nextSpawn !== Infinity)) { G.nextSpawn = Infinity; planSpawn() }
    else if (G.nextSpawn === Infinity && !activeDrops().length && !G.fallers.some(f => f.mode === 'pass')) G.nextSpawn = t + 0.5   // 次が出ないまま止まらない保険
    if (n >= 4 && t >= G.starAt) {
      G.starAt = t + rr(16, 24)
      const side = G.topX > 0 ? -1 : 1
      spawn('star', clamp(G.topX + side * rr(110, 160), -XR + 10, XR - 10), 'star')
    }
  }
  // 落ちている物
  const vb = viewBot()
  for (const f of G.fallers) {
    f.age += dt
    const py = f.y
    if (f.mode === 'drop' || f.mode === 'star') {
      if (w.st === 'blow') f.vx = lerp(f.vx, w.f * 70, 0.04); else f.vx *= 0.97
      f.x = clamp(f.x + f.vx * dt, -XR - 30, XR + 30); f.y += f.vy * dt
      f.rot = Math.sin(f.age * 3 + f.id) * 0.18
      if (G.phase === 'play' && py >= G.topY && f.y <= G.topY) {
        const tol = G.topW / 2 + (f.mode === 'star' ? 22 : K[f.kind].w * 0.38)
        if (Math.abs(f.x - G.topX) <= tol) {
          f.dead = 1
          if (f.mode === 'star') { G.bonus += 3; G.stars++; sfx('coin', { vol: 0.7 }); pop(T().star); burst(f.x, G.topY + 10, 'spark', 10); score() }
          else land(f)
          continue
        }
        f.mode = f.mode === 'star' ? 'gone' : 'pass'; f.vr = rr(-3, 3)
      } else if (G.phase === 'play' && f.y < G.topY - 4) { f.mode = f.mode === 'star' ? 'gone' : 'pass'; f.vr = rr(-3, 3) }   // 塔が先に伸びて、てっぺんより下に入った
    } else {
      f.vy -= 1300 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt
    }
    const floor = Math.max(0, vb - 60)
    if (f.y <= floor && f.mode !== 'drop' && f.mode !== 'star') {
      f.dead = 1
      if (f.mode === 'pass') miss(f.kind, 'drop')
      if (f.mode === 'pass' || f.mode === 'lost') {
        if (floor <= 0) { G.ground.push({ kind: f.kind, x: clamp(f.x, -190, 190), rot: sgn(f.vx || 1) * rr(1.2, 1.7), flip: f.flip }); if (!f.quiet) sfx('thud', { vol: 0.8 }) }
      }
    }
    if ((f.mode === 'drop' || f.mode === 'star') && f.y < floor) f.dead = 1
    if (f.mode === 'gone' && f.y < G.topY - 400) f.dead = 1
  }
  G.fallers = G.fallers.filter(f => !f.dead)
  if (G.ground.length > 8) G.ground.shift()
  for (const p of G.fx) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= (p.type === 'dust' ? 0 : 420) * dt; p.r += dt * 6 }
  G.fx = G.fx.filter(p => p.t < p.life)
  // 高さの節目
  G.peakY = Math.max(G.peakY, G.topY)
  const m = D.MILES[G.mile]
  if (m && G.phase === 'play' && G.topY >= m.y) { G.mile++; pop(m[lang]); sfx('jgood', { vol: 0.45 }) }
  // カメラ（塔が伸びたら引き、てっぺんを画面の上の方に置く）
  const zt = clamp(1 - G.Htot / 1800, 0.6, 1)
  G.zoom = lerp(G.zoom, zt, 1 - Math.exp(-2 * dt))
  S = s0() * G.zoom
  const want = G.phase === 'collapse' ? Math.max(0, G.camY - 900 * dt * Math.min(1, (t - G.endT) * 0.8)) : Math.max(0, G.topY + 30 - (GY - H * 0.4) / S)
  G.camY = G.phase === 'collapse' ? want : lerp(G.camY, want, 1 - Math.exp(-3 * dt))
  if (G.phase === 'play') loopVol('park', clamp(0.32 - G.camY / 2400, 0, 0.32))
  if (G.phase === 'play' && G.wind.st === 'idle') loopVol('wind', windBase())
  if (G.bub && t > G.bub.until) G.bub = null
  if (G.phase === 'collapse' && t - G.endT > 2.8) showEnd()
}
const windBase = () => clamp((G.camY - 600) / 3000, 0, 0.3) + 0.0001

// ---- 描く ----
const INK = '#2b2b2b'
function skyCol(alt) {
  const stops = [[0, [251, 245, 233]], [700, [251, 245, 233]], [1300, [226, 241, 249]], [2300, [196, 226, 244]], [2900, [64, 70, 120]], [3400, [34, 37, 66]]]
  for (let i = 1; i < stops.length; i++) if (alt <= stops[i][0]) { const [a0, c0] = stops[i - 1], [a1, c1] = stops[i], k = (alt - a0) / (a1 - a0); return c0.map((v, j) => Math.round(lerp(v, c1[j], k))) }
  return stops[stops.length - 1][1]
}
// 背景の物（世界の座標）
const CLOUDS = [[-130, 760, 120], [120, 980, 150], [-40, 1220, 110], [150, 1420, 130], [-150, 1640, 160], [60, 1900, 120], [-110, 2150, 140]]
const STARS = Array.from({ length: 60 }, (_, i) => [((i * 97) % 400) - 200, 2700 + ((i * 263) % 2600), 3 + (i % 3) * 2])
function sparkle(c, x, y, r, col = '#ffd34d') {
  c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rad = i % 2 ? r * 0.32 : r; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad) } c.closePath()
  c.fillStyle = col; c.fill(); c.lineWidth = Math.max(1.2, r * 0.22); c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke()
}
function star5(c, x, y, r, rot = 0) {
  c.beginPath(); for (let i = 0; i < 10; i++) { const a = rot - Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad) } c.closePath()
  c.fillStyle = '#ffd34d'; c.fill(); c.lineWidth = Math.max(1.5, r * 0.16); c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke()
}
function squiggle(c, x, y, len, amp, col, lw) {
  c.beginPath(); for (let i = 0; i <= 24; i++) { const u = i / 24; c.lineTo(x + u * len, y + Math.sin(u * Math.PI * 3) * amp) }
  c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.stroke()
}
function drawWorld() {
  const c = cx
  c.setTransform(DPR, 0, 0, DPR, 0, 0)
  const alt = G.camY + (GY - H / 2) / S
  const col = skyCol(alt)
  c.fillStyle = `rgb(${col})`; c.fillRect(0, 0, W, H)
  const L = Math.max(1.6, 2.6 * S)
  c.lineJoin = 'round'; c.lineCap = 'round'
  // 星と月
  if (alt > 2300) {
    c.globalAlpha = clamp((alt - 2300) / 700, 0, 1)
    for (const [x, y, r] of STARS) { const yy = sy(y); if (yy > -20 && yy < H + 20) sparkle(c, sx(x), yy, r * S * (1 + 0.15 * Math.sin(G.t * 2 + x))) }
    const my = sy(4300); if (my > -200 && my < H + 200) { c.beginPath(); c.arc(sx(-80), my, 90 * S, 0, 7); c.fillStyle = '#ffe9a6'; c.fill(); c.lineWidth = L; c.strokeStyle = INK; c.stroke(); c.beginPath(); c.arc(sx(-110), my - 20 * S, 14 * S, 0, 7); c.arc(sx(-50), my + 30 * S, 9 * S, 0, 7); c.fillStyle = '#f4d77e'; c.fill() }
    c.globalAlpha = 1
  }
  // 雲・鳥・飛行機・気球
  for (const [x, y, w] of CLOUDS) { const yy = sy(y); if (yy > -120 && yy < H + 120) spr(c, 'cloud', sx(x + Math.sin(G.t * 0.2 + y) * 8), yy, w * S, 0, { anchor: 'mid' }) }
  for (let i = 0; i < 3; i++) { const y = 520 + i * 260, x = ((G.t * (30 + i * 12) + i * 170) % 520) - 260; const yy = sy(y + Math.sin(G.t * 3 + i) * 6); if (yy > -60 && yy < H + 60) spr(c, 'bird', sx(x), yy, 40 * S, 0, { anchor: 'mid', flip: true }) }
  { const yy = sy(1780); if (yy > -100 && yy < H + 100) spr(c, 'plane', sx(((G.t * 40) % 700) - 350), yy, 110 * S, -0.05, { anchor: 'mid', flip: true }) }
  { const yy = sy(2350 + Math.sin(G.t * 0.8) * 10); if (yy > -140 && yy < H + 140) spr(c, 'balloon', sx(135), yy, 80 * S, 0, { anchor: 'mid' }) }
  // 地面と町（家・ビル・電柱）
  const g = sy(0)
  if (g < H + 400) {
    c.lineWidth = L; c.strokeStyle = INK
    c.globalAlpha = 0.5   // 町は奥に引く（塔の子と重なっても輪郭が読めるように）
    // ビル
    const bx0 = sx(118), bw = 96 * S, bh = 470 * S
    c.fillStyle = '#fff'; c.fillRect(bx0, g - bh, bw, bh); c.strokeRect(bx0, g - bh, bw, bh)
    c.fillStyle = '#7ec8f0'
    for (let r = 0; r < 11; r++) for (let k = 0; k < 2; k++) { const wx = bx0 + (14 + k * 42) * S, wy = g - bh + (20 + r * 40) * S; c.fillRect(wx, wy, 26 * S, 18 * S); c.strokeRect(wx, wy, 26 * S, 18 * S) }
    // 家
    const hx = sx(-205), hw = 100 * S, hh = 120 * S
    c.fillStyle = '#fff'; c.fillRect(hx, g - hh, hw, hh); c.strokeRect(hx, g - hh, hw, hh)
    c.beginPath(); c.moveTo(hx - 10 * S, g - hh); c.lineTo(hx + hw / 2, g - hh - 70 * S); c.lineTo(hx + hw + 10 * S, g - hh); c.closePath(); c.fillStyle = '#ff8a3d'; c.fill(); c.stroke()
    c.fillStyle = '#ffd34d'; c.fillRect(hx + 56 * S, g - 80 * S, 26 * S, 26 * S); c.strokeRect(hx + 56 * S, g - 80 * S, 26 * S, 26 * S)
    // 電柱と電線
    c.beginPath(); c.moveTo(sx(-88), g); c.lineTo(sx(-88), g - 330 * S); c.moveTo(sx(-108), g - 300 * S); c.lineTo(sx(-68), g - 300 * S); c.stroke()
    c.lineWidth = L * 0.6; c.beginPath(); c.moveTo(sx(-260), g - 280 * S); c.quadraticCurveTo(sx(-170), g - 250 * S, sx(-88), g - 300 * S); c.quadraticCurveTo(sx(20), g - 250 * S, sx(118), g - 290 * S); c.stroke()
    c.globalAlpha = 1
    // 地面
    c.fillStyle = '#f1e6cf'; c.fillRect(0, g, W, H - g + 400)
    c.lineWidth = L; c.beginPath(); c.moveTo(0, g); c.lineTo(W, g); c.stroke()
    c.lineWidth = L * 0.7
    for (const x of [-150, -40, 60, 170]) { const gx = sx(x); c.beginPath(); c.moveTo(gx - 6 * S, g + 9 * S); c.lineTo(gx, g + 3 * S); c.lineTo(gx + 6 * S, g + 9 * S); c.stroke() }
    for (const o of G.ground) spr(c, K[o.kind].ff, sx(o.x), g + 4 * S, K[o.kind].w * 0.9 * S, o.rot, { anchor: 'mid', flip: o.flip })
  }
}
function drawTower() {
  const c = cx
  // 水色
  const bt = sy(BT())
  const cname = G.phase === 'collapse' ? (G.t - G.endT > 0.5 ? 'carrier_down' : 'carrier_s') : (G.warn > 0.6 ? 'carrier_s' : G.warn > 0 || G.stack.length >= 20 ? 'carrier_w' : 'carrier')
  if (cname === 'carrier_down') spr(c, cname, sx(G.X), sy(0), CW * 1.15 * S, 0)
  else {
    // 板の上面をそろえて描く（絵ごとに背の高さが少し違う）
    const ex = cname === 'carrier_s' ? 1.04 : 1
    const bob = Math.sin(G.t * 9) * G.warn * 2
    spr(c, cname, sx(G.X) + bob, bt - 1, CW * ex * S, G.th * 0.06, { anchor: 'top' })
  }
  void bt
  // 積んだ生き物
  const n = G.stack.length
  for (let i = 0; i < n; i++) {
    const p = G.stack[i], k = K[p.kind]
    const panic = G.warn > 0.2 && i >= n - 3
    let name = panic ? k.ff : k.f
    const age = G.t - p.land
    const sq = age < 0.25 ? 1 - Math.sin(age / 0.25 * Math.PI) * 0.18 : 1
    let wob = 1; if (k.wobbly) wob = 1 + Math.sin(G.t * 11 + p.id) * 0.04
    const hop = p.hop > 0 ? Math.sin(p.hop / 0.35 * Math.PI) * 14 : 0
    spr(c, name, sx(p.bx), sy(p.by + hop), p.w * S * (2 - sq) * (2 - wob), p.ang, { sy: sq * wob, flip: p.flip, gold: !!k.gold })
    if (k.gold) sparkle(c, sx(p.bx + Math.cos(G.t * 2 + p.id) * p.w * 0.6), sy(p.by + p.h * 0.7 + Math.sin(G.t * 3) * 10), 7 * S)
  }
  // 揺れの線（ヘッダーと同じ「ゆれてる」印）
  if (G.warn > 0 && n) {
    const p = G.stack[n - 1], x = sx(p.bx + Math.sin(p.ang) * p.h * 0.5), y = sy(p.by + p.h * 0.5), r = p.w * 0.5 * S + 10 * S
    c.strokeStyle = INK; c.lineWidth = Math.max(1.6, 2.4 * S); c.lineCap = 'round'
    const j = Math.sin(G.t * 20) * 2
    for (const sd of [-1, 1]) for (let i = 0; i < 3; i++) { const yy = y + (i - 1) * 9 * S; c.beginPath(); c.moveTo(x + sd * (r + j), yy - 5 * S); c.lineTo(x + sd * (r + 7 * S + j), yy + 5 * S); c.stroke() }
  }
}
function drawFallers() {
  const c = cx
  // 落ちてくる場所の目印（点線）
  const pv = G.preview
  if (pv) {
    const x = sx(pv.x), a = clamp(1 - pv.t / 0.55, 0, 1)
    c.globalAlpha = 0.35 + a * 0.5; c.strokeStyle = INK; c.lineWidth = 2.4; c.setLineDash([2, 9]); c.lineCap = 'round'
    c.beginPath(); c.moveTo(x, 4); c.lineTo(x, 70 + a * 40); c.stroke(); c.setLineDash([])
    c.beginPath(); c.moveTo(x - 7, 70 + a * 40); c.lineTo(x + 7, 70 + a * 40); c.lineTo(x, 82 + a * 40); c.closePath(); c.fillStyle = INK; c.fill()
    c.globalAlpha = 1
  }
  for (const f of G.fallers) {
    const x = sx(f.x), y = sy(f.y)
    if (y < -150 || y > H + 150) continue
    if (f.mode === 'star' || f.mode === 'gone') { star5(c, x, y - 14 * S, 15 * S, f.age * 2); continue }
    const k = K[f.kind]
    if (f.mode === 'drop') {
      // 真下に点線（どこに落ちるか分かる）
      c.globalAlpha = 0.28; c.strokeStyle = INK; c.lineWidth = 2; c.setLineDash([2, 10]); c.beginPath(); c.moveTo(x, y + 4); c.lineTo(x, Math.min(H, sy(G.topY) - 2)); c.stroke(); c.setLineDash([]); c.globalAlpha = 1
    }
    spr(c, k.ff, x, y, k.w * S * 1.05, f.rot, { flip: f.flip, gold: !!k.gold })
    if (k.gold) sparkle(c, x + 30 * S, y - 50 * S, 8 * S)
  }
}
function drawFx() {
  const c = cx
  for (const p of G.fx) {
    const x = sx(p.x), y = sy(p.y), a = 1 - p.t / p.life
    c.globalAlpha = clamp(a * 1.4, 0, 1)
    if (p.type === 'dust') { c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 3 + p.t * 18, 0, 7); c.stroke() }
    else if (p.type === 'spark') sparkle(c, x, y, 7 * S)
    else { c.save(); c.translate(x, y); c.rotate(p.r); c.fillStyle = p.col; c.fillRect(-4, -2.5, 8, 5); c.restore() }
  }
  c.globalAlpha = 1
  // 風（ピンクの波線が横切る）
  const w = G.wind
  if (w.st !== 'idle') {
    const k = w.st === 'warn' ? clamp((G.t - w.t) / 1.2, 0, 1) * 0.5 : 1
    c.globalAlpha = k
    for (let i = 0; i < 5; i++) {
      const sp = w.st === 'blow' ? 340 : 120, ph = ((G.t * sp + i * 160) % (W + 220)) - 110
      const x = w.dir > 0 ? ph - 60 : W - ph - 60, y = H * (0.16 + i * 0.13)
      squiggle(c, x, y, 70, 5, '#ff9ec4', 3.2)
    }
    c.globalAlpha = 1
  }
}
function render() {
  if (G.scene !== 'play') return
  drawWorld(); drawTower(); drawFallers(); drawFx()
  // 吹き出しの位置
  const b = $('#bub')
  if (G.bub) {
    let x, y
    if (G.bub.target === 'carrier') { x = sx(G.X); y = sy(CH()) - 8 }
    else { const p = G.bub.target; if (!G.stack.includes(p)) { G.bub = null } else { x = sx(p.bx + Math.sin(p.ang) * p.h); y = sy(p.by + p.h) - 10 } }
    if (G.bub) {
      if (b.textContent !== G.bub.text) b.textContent = G.bub.text
      const bw = b.offsetWidth || 120
      b.style.left = clamp(x, bw / 2 + 6, W - bw / 2 - 6) + 'px'; b.style.top = clamp(y, 110, H - 20) + 'px'; b.classList.add('on')
    }
  }
  if (!G.bub) b.classList.remove('on')
}

// ---- 時計（固定60Hz・performance.now で数える） ----
let lastT = performance.now(), acc = 0
function frame() {
  requestAnimationFrame(frame)
  const now = performance.now()
  let d = (now - lastT) / 1000; lastT = now
  if (G.paused) return
  if (d > 0.25) d = 0.25
  acc += d
  while (acc >= 1 / 60) { update(1 / 60); acc -= 1 / 60 }
  if (G.scene === 'play') render()
  else if (G.scene === 'title') drawTitleArt()
}

// ---- タイトル ----
const ta = $('#tArt'), tc = ta.getContext('2d')
function sizeTitleArt() { const r = ta.getBoundingClientRect(); if (!r.width) return; ta.width = Math.round(r.width * DPR); ta.height = Math.round(r.height * DPR); ta._w = r.width; ta._h = r.height }
let tt = 0
function drawTitleArt() {
  tt += 1 / 60
  if (!ta._w) sizeTitleArt()
  const w = ta._w, h = ta._h; if (!w || !h) return
  const c = tc; c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, w, h)
  const s = Math.min(w / 330, h / 380)
  const gx = w * 0.5, gy = h - 6 * s
  // 地面の線
  c.strokeStyle = INK; c.lineWidth = 2.2; c.lineCap = 'round'; c.beginPath(); c.moveTo(gx - 150 * s, gy); c.lineTo(gx + 150 * s, gy); c.stroke()
  // 水色と、のっている3人
  const sw = Math.sin(tt * 1.6) * 0.035
  spr(c, 'carrier_w', gx, gy, CW * s, sw * 0.3)
  let y = gy - CW * aspect('carrier_w') * s * 0.97, x = gx, a = sw * 0.3
  for (const [k, dx] of [['bean', -6], ['cube', 10], ['pink', -8]]) {
    const kk = K[k], ww = kk.w * s, hh = ww * aspect(kk.f)
    x += dx * s; a += sw
    spr(c, kk.f, x, y, ww, a)
    x += Math.sin(a) * hh * kk.ht; y -= Math.cos(a) * hh * kk.ht
  }
  // 落ちてくる三角と点線の矢印
  const fy = (tt * 0.35 % 1)
  const tx = gx + 112 * s, ty = h * 0.12 + fy * 30 * s
  c.strokeStyle = INK; c.lineWidth = 2.2; c.setLineDash([2, 8])
  c.beginPath(); c.moveTo(tx - 10 * s, ty + 60 * s); c.quadraticCurveTo(tx - 40 * s, ty + 120 * s, x + 30 * s, y - 30 * s); c.stroke(); c.setLineDash([])
  spr(c, 'tri_f', tx, ty + 50 * s, 64 * s, 0.3 + Math.sin(tt * 4) * 0.1)
  // 地面で見ているプリン
  spr(c, 'pud', gx - 130 * s, gy, 58 * s, -0.05 + Math.sin(tt * 7) * 0.02)
  squiggle(c, gx - 108 * s, gy - 70 * s, 22 * s, 3 * s, '#ff9ec4', 2.6)
}

// ---- 画面の出し分け ----
function show(id) { for (const v of ['#vTitle', '#vPlay', '#vEnd']) $(v).hidden = v !== id }
function applyLang() {
  const t = T()
  document.documentElement.lang = lang
  $('#tH').innerHTML = `<span>${t.title[0]}</span><span class="b"><span class="mk">${t.title[1]}</span></span>`
  $('#tSub').textContent = t.sub; $('#bStart').textContent = t.start; $('#bHow').textContent = t.how; $('#bLang').textContent = t.lang
  $('#loadTxt').textContent = t.loading; $('#bAgain').textContent = t.again; $('#bSave').textContent = t.save; $('#bPost').textContent = t.post
  $('#howH').textContent = t.howH; $('#howBody').innerHTML = t.howList.map(s => `<li>${s}</li>`).join(''); $('#howClose').textContent = t.close
  $('#howCred').textContent = lang === 'ja' ? '音: Kenney / rubberduck / Joseph Sardin / SpringySpringo / Almitory ほか（CC0）' : 'Sound: Kenney / rubberduck / Joseph Sardin / SpringySpringo / Almitory and others (CC0)'
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches
  $('#tutT').textContent = fine ? t.tutM : t.tutT
  let b = 0; try { b = +localStorage.getItem('nt_best') || 0 } catch (e) {}
  $('#tBest').textContent = b ? t.best(b) : ''
  if (G.scene === 'end') drawRes()
}
function setMuteIcons() { for (const s of ['#bMute', '#bMute2']) { const el = $(s); el.querySelector('.wave').style.display = muted ? 'none' : ''; el.querySelector('.x').style.display = muted ? '' : 'none' } }
function toggleMute() { muted = !muted; Snd.setMute(muted); try { localStorage.setItem('nt_mute', muted ? '1' : '0') } catch (e) {} setMuteIcons() }
on('#bMute', () => { Snd.init(); toggleMute() }); on('#bMute2', () => { Snd.init(); toggleMute() })
on('#bLang', () => { lang = lang === 'ja' ? 'en' : 'ja'; try { localStorage.setItem('nt_lang', lang) } catch (e) {} applyLang() })
on('#bHow', () => { sfx('click', { vol: 0.5 }); $('#how').hidden = false })
on('#howClose', () => { $('#how').hidden = true })
$('#how').addEventListener('click', e => { if (e.target.id === 'how') $('#how').hidden = true })
on('#bStart', () => { Snd.init(); sfx('click', { vol: 0.6 }); startGame() })
on('#bAgain', () => { Snd.init(); sfx('click', { vol: 0.6 }); startGame() })
document.addEventListener('pointerdown', () => { if (G.scene === 'title' && !loopsOn.bgmT && $('#loading').style.display === 'none') { Snd.init(); loop('bgmT', 0.3) } }, true)

function hideTut() { const el = $('#tut'); if (!el.hidden) { el.style.opacity = '0'; setTimeout(() => { if (G.stack.length) el.hidden = true }, 400) } }
function startGame() {
  G.scene = 'play'; show('#vPlay'); resize(); reset(); S = s0()
  $('#tut').hidden = false; $('#tut').style.opacity = '1'
  drawMisses(); score(); $('#pop').className = ''; G.bub = null
  allLoopsOff(); loop('bgm', 0.26); loop('park', 0.32); loop('wind', 0.0001)
  window.TM && TM.start()
}

// ---- 結果（SNS に貼れる1枚） ----
const rankOf = n => { let r = D.RANKS[0]; for (const k of D.RANKS) if (n >= k.min) r = k; return r }
function drawCard(c, Wc, Hc) {
  const t = T(), n = G.best, rk = rankOf(n)
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.fillStyle = '#fbf5e9'; c.fillRect(0, 0, Wc, Hc)
  const F = (wt, px) => `${wt} ${px}px "M PLUS Rounded 1c","Hiragino Maru Gothic ProN",sans-serif`
  c.fillStyle = INK; c.textBaseline = 'alphabetic'; c.textAlign = 'left'
  c.font = F(800, 46); c.fillText(t.cardTitle, 70, 116)
  squiggle(c, 70 + c.measureText(t.cardTitle).width + 24, 100, 46, 6, '#ff9ec4', 6)
  // 大きい数字と黄色の線
  c.font = F(800, 250); const numW = c.measureText(String(n)).width
  c.fillStyle = '#ffd34d'; c.fillRect(62, 336, numW + 20, 64)
  c.fillStyle = INK; c.fillText(String(n), 70, 390)
  c.font = F(800, 84); c.fillText(lang === 'ja' ? '段' : 'high', 80 + numW, 390)
  c.font = F(800, 50); c.fillText(rk[lang], 72, 488)
  c.font = F(500, 34); c.fillStyle = '#6d6a63'; c.fillText(t.resNote, 74, 546)
  // 塔（まっすぐ立てて描く）
  const snap = G.bestSnap.length ? G.bestSnap : []
  let hsum = 0; for (const p of snap) hsum += KH(p.kind) * K[p.kind].ht
  const towerH = CW * aspect('carrier') * 0.97 + hsum + 40
  const k = Math.min(1.9, (Hc - 230) / towerH, 470 / 200)
  const bxC = Wc - 290, by = Hc - 110
  c.strokeStyle = INK; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(bxC - 230, by); c.lineTo(bxC + 230, by); c.stroke()
  const cn = snap.length >= 20 ? 'carrier_w' : 'carrier'
  spr(c, cn, bxC, by, CW * k)
  let y = by - CW * aspect(cn) * k * 0.97, x = bxC
  for (const p of snap) {
    const kk = K[p.kind], ww = kk.w * k, hh = ww * aspect(kk.f)
    x += p.dx * k
    spr(c, kk.f, x, y, ww, 0, { flip: p.flip, gold: !!kk.gold })
    y -= hh * kk.ht
  }
  // 下で支えた水色のひとこと
  const sayT = rk.say[lang]
  c.font = F(800, 40)
  const lines = wrap(c, sayT, 420)
  const bw = Math.max(...lines.map(l => c.measureText(l).width)) + 56, bh = lines.length * 54 + 36
  const bx = 70, byy = Hc - 300 - bh
  c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 5
  rrect(c, bx, byy, bw, bh, 26); c.fill(); c.stroke()
  c.beginPath(); c.moveTo(bx + bw - 60, byy + bh - 2); c.lineTo(bx + bw - 10, byy + bh + 40); c.lineTo(bx + bw - 100, byy + bh - 2); c.fillStyle = '#fff'; c.fill()
  c.beginPath(); c.moveTo(bx + bw - 60, byy + bh); c.lineTo(bx + bw - 10, byy + bh + 40); c.lineTo(bx + bw - 100, byy + bh); c.stroke()
  c.fillStyle = INK; lines.forEach((l, i) => c.fillText(l, bx + 28, byy + 66 + i * 54))
  c.font = F(500, 28); c.fillStyle = '#6d6a63'; c.fillText(t.resBy, bx + 6, byy + bh + 56)
  c.font = F(800, 28); c.fillStyle = '#6d6a63'; c.fillText('tom3games.com', 70, Hc - 60)
}
function wrap(c, s, maxW) {
  const out = []; let cur = ''
  for (const ch of (lang === 'ja' ? [...s] : s.split(/(?<= )/))) { if (c.measureText(cur + ch).width > maxW && cur) { out.push(cur.trim()); cur = ch } else cur += ch }
  if (cur) out.push(cur.trim()); return out
}
function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath() }
function fitRes() {
  const box = $('#resBox').getBoundingClientRect(), el = $('#res')
  const w = Math.min(box.width, box.height * 0.8)
  el.style.width = w + 'px'; el.style.height = (w * 1.25) + 'px'
}
function drawRes() { const el = $('#res'); drawCard(el.getContext('2d'), el.width, el.height); fitRes() }
function showEnd() {
  G.scene = 'end'; show('#vEnd')
  allLoopsOff(); loop('bgmT', 0.22)
  const n = G.best
  let b = 0; try { b = +localStorage.getItem('nt_best') || 0 } catch (e) {}
  if (n > b) { try { localStorage.setItem('nt_best', String(n)) } catch (e) {} }
  G.result = { best: n, rank: rankOf(n)[lang], newBest: n > b, misses: G.misses, slips: G.slips, stars: G.stars, golds: G.golds, blues: G.blues, t: +G.t.toFixed(1) }
  sfx(n >= 15 ? 'jgood' : 'jmeh', { vol: 0.6, delay: 0.3 })
  drawRes(); const el = $('#res'); el.classList.remove('in'); void el.offsetWidth; el.classList.add('in')
  window.TM && TM.end(n, n >= 15)
  applyLang()
}
on('#bSave', async () => {
  window.TM && TM.share('save')
  const el = $('#res')
  el.toBlob(async blob => {
    if (!blob) return
    const file = new File([blob], 'nokkari-tower.png', { type: 'image/png' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); return } catch (e) { if (e && e.name === 'AbortError') return } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'nokkari-tower.png'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000)
  }, 'image/png')
})
on('#bPost', () => {
  window.TM && TM.share('x')
  const r = G.result || { best: 0, rank: '' }
  const u = 'https://x.com/intent/post?text=' + encodeURIComponent(T().postText(r.best, r.rank)) + '&url=' + encodeURIComponent('https://tom3games.com/play/nokkari-tower/')
  window.open(u, '_blank', 'noopener')
})

// ---- 読み込み（絵・フォント・短い音を先に） ----
async function boot() {
  applyLang(); setMuteIcons(); resize(); drawMisses()
  const list = ['snd/pop1.mp3', 'snd/thud1.mp3', 'snd/slime1.mp3', 'snd/sq1.mp3', 'snd/splat1.mp3', 'snd/swish1.mp3', 'snd/click.mp3']
  let done = 0; const total = list.length + 2, bar = $('#loadBar i')
  const tick = () => { done++; bar.style.width = Math.round(done / total * 100) + '%' }
  const img = new Promise(ok => { IMG.onload = () => { imgOk = true; makeGold(); ok() }; IMG.onerror = () => ok(); IMG.src = A.img + '?v=1' }).then(tick)
  const font = (document.fonts ? Promise.all([document.fonts.load('800 20px "M PLUS Rounded 1c"', 'のっかりタワー段0123456789'), document.fonts.load('500 20px "M PLUS Rounded 1c"', 'あ')]) : Promise.resolve()).catch(() => {}).then(tick)
  const snds = list.map(u => fetch(u).then(r => r.arrayBuffer()).catch(() => {}).then(tick))
  await Promise.race([Promise.all([img, font, ...snds]), new Promise(r => setTimeout(r, 12000))])
  const l = $('#loading'); l.style.opacity = '0'; setTimeout(() => { l.style.display = 'none' }, 380)
  sizeTitleArt()
  window.__ntReady = true
}
requestAnimationFrame(frame)
boot()

// ---- 人の速さで遊ぶ bot（sim と ?demo=1 で使う） ----
// cfg: react 気づくまでの秒[a,b] / err 狙いのずれ / spd 指を動かす速さ（世界/秒）/ bal 揺れに合わせて動かす強さ / thr 揺れに気づく大きさ / star 星を取りに行くか
function makeBot(cfg, rnd = Math.random) {
  const seen = {}
  let goal = 0, balT = 0
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 1.15
  return function step(dt) {
    if (G.phase !== 'play') return
    const t = G.t
    const drops = G.fallers.filter(f => f.mode === 'drop' || (cfg.star && f.mode === 'star'))
    for (const f of drops) if (!seen[f.id]) seen[f.id] = { at: t + cfg.react[0] + (cfg.react[1] - cfg.react[0]) * rnd(), off: gauss() * cfg.err }
    drops.sort((a, b) => (a.y - G.topY) / -a.vy - (b.y - G.topY) / -b.vy)
    const tgt = drops.find(f => seen[f.id].at <= t && f.y > G.topY)
    if (tgt) goal = tgt.x + seen[tgt.id].off - (G.topX - G.X)
    let want = cfg.idle ? G.TX : goal
    // 揺れに気づいたら、傾いた方へ少しずつ動かす
    if (cfg.bal && Math.abs(G.th) > cfg.thr) balT = t + 0.25
    if (cfg.bal && t < balT + (cfg.balLag || 0)) want += sgn(G.th) * cfg.bal
    want = clamp(want, -XR, XR)
    const d = want - G.TX, mx = cfg.spd * dt
    G.TX += clamp(d, -mx, mx)
  }
}

// 実機・シミュレーターでの通し確認用（?demo=1）。本物の pointermove を人の速さで送る。確認中は鳴らさない
if (/[?&]demo=1/.test(location.search)) {
  muted = true; Snd.setMute(true); setMuteIcons()
  const go = () => {
    if (!window.__ntReady) return setTimeout(go, 200)
    $('#bStart').click()
    const bot = makeBot({ react: [0.5, 0.9], err: 12, spd: 420, bal: 60, thr: 0.18, star: false })
    let fx = innerWidth / 2
    const r0 = cv.getBoundingClientRect()
    cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: fx, clientY: r0.top + r0.height * 0.8, pointerId: 9, pointerType: 'touch' }))
    const tick = () => {
      if (G.scene !== 'play') return
      const before = G.TX; bot(1 / 30); const want = G.TX; G.TX = before
      fx += (want - before) * S
      cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: fx, clientY: r0.top + r0.height * 0.8, pointerId: 9, pointerType: 'touch' }))
      setTimeout(tick, 33)
    }
    tick()
  }
  go()
}

// ---- 検証用の窓口 ----
window.nt = {
  G, D, TUNE, start: startGame, result: () => G.result, rankOf, makeBot, layout, lang: () => lang,
  state: () => ({ scene: G.scene, phase: G.phase, t: +G.t.toFixed(2), n: G.stack.length, best: G.best, bonus: G.bonus, misses: G.misses, th: +G.th.toFixed(3), X: +G.X.toFixed(1), TX: +G.TX.toFixed(1), topX: +G.topX.toFixed(1), topY: +G.topY.toFixed(1), camY: +G.camY.toFixed(1), zoom: +G.zoom.toFixed(3), drops: G.fallers.filter(f => f.mode === 'drop').length, wind: G.wind.st, bub: G.bub && G.bub.text }),
  // 画面座標: 水色の位置
  carrierXY: () => { const r = cv.getBoundingClientRect(); return { x: r.left + sx(G.X), y: r.top + sy(CH() * 0.5) } },
  dbg: {
    pause(b = true) { G.paused = b; lastT = performance.now(); acc = 0 },
    step(n = 1) { for (let i = 0; i < n; i++) update(1 / 60); render() },
    tick(n = 1) { for (let i = 0; i < n; i++) update(1 / 60) },
    seed(s) { seedV = (s % 2147483646) + 1 },
    // 台本用: 指定の生き物をその場で積む
    stack(kinds) { for (const k of kinds) land({ id: ++fid, kind: k, x: G.topX + rr(-6, 6), flip: R() < 0.5 }) ; G.fallers = []; G.preview = null },
    drop(kind, dx = 0) { return spawn(kind, G.topX + dx).id },
    finish() { G.misses = D.MISSES - 1; miss('cube', 'drop'); this.tick(200) },
    render, drawRes,
  },
}
})()
