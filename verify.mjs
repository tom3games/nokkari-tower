import './mute-auto.mjs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// のっかりタワーの検証。node verify.mjs
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 6583
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(msg) }
async function open(browser, opts = {}) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  await ctx.addInitScript(() => { try { localStorage.clear() } catch (e) {} })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0); await p.waitForFunction(() => window.__ntReady, null, { timeout: 15000 })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *')) {
    if (el.closest('[hidden]') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    if (el.closest('#bub,#pop')) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('main:not([hidden]) button,main:not([hidden]) canvas,main:not([hidden]) a,.ovl:not([hidden]) button')) { if (!el.offsetParent) continue; const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  return { H, over: over.slice(0, 6) }
})
const variance = (p, sel) => p.evaluate(sel => {
  const c = document.querySelector(sel), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 13) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ }
  return Math.round(s2 / n - (s / n) ** 2)
}, sel)
const SIZES = [[360, 640, 'small'], [390, 844, 'phone'], [430, 932, 'max']]

const browser = await chromium.launch(MUTE_LAUNCH)
const p = await open(browser)
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', JSON.stringify(r)); return r
})
await t('OGP 一式がある', async () => {
  const r = await p.evaluate(() => ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => !!document.querySelector(`meta[property="${k}"]`)).concat(!!document.querySelector('meta[name="twitter:card"]')))
  expect(r.every(Boolean), JSON.stringify(r))
})
await t('ロード画面が消えて、タイトルの絵が描けている', async () => {
  await p.waitForTimeout(500)
  const r = await p.evaluate(() => ({ load: getComputedStyle(document.querySelector('#loading')).display, title: document.querySelector('#tH').textContent }))
  const v = await variance(p, '#tArt')
  expect(r.load === 'none' && r.title.includes('のっかり') && v > 200, JSON.stringify({ ...r, v })); return { v }
})
await t('はじめると遊ぶ画面・音が鳴る呼び出しがある・それでも実際は無音', async () => {
  await p.click('#bStart'); await p.waitForTimeout(300)
  const r = await p.evaluate(() => ({ scene: nt.state().scene, loops: Snd.played['loop:bgm'] || 0, click: Snd.played.click || 0, mute: window.__muteOk() }))
  expect(r.scene === 'play' && r.click >= 1 && r.mute, JSON.stringify(r)); return r
})
await t('指の向きと同じ向きに動く（本物のドラッグ：右へ80px → 右へ、左へ → 左へ）', async () => {
  await p.evaluate(() => { nt.dbg.pause(); nt.start(); nt.dbg.pause(); nt.dbg.step(5) })
  const c = await p.evaluate(() => nt.carrierXY())
  await p.mouse.move(c.x, c.y + 120); await p.mouse.down()
  for (let i = 1; i <= 8; i++) await p.mouse.move(c.x + i * 10, c.y + 120)
  await p.evaluate(() => nt.dbg.step(40))
  const a = await p.evaluate(() => nt.state())
  for (let i = 1; i <= 16; i++) await p.mouse.move(c.x + 80 - i * 10, c.y + 120)
  await p.evaluate(() => nt.dbg.step(40))
  const b = await p.evaluate(() => nt.state())
  await p.mouse.up()
  const c2 = await p.evaluate(() => nt.carrierXY())
  expect(a.X > 60 && b.X < -60 && Math.abs(c2.x - (c.x - 80)) < 6, JSON.stringify({ a: a.X, b: b.X, screen: [c.x, c2.x] })); return { right: a.X, left: b.X }
})
await t('ドラッグして受け止めると1段になる（本物の指の操作で）', async () => {
  await p.evaluate(() => { nt.start(); nt.dbg.pause(); nt.G.nextSpawn = 1e9; nt.dbg.step(2); nt.dbg.drop('cube', 120) })
  const c = await p.evaluate(() => nt.carrierXY())
  await p.mouse.move(c.x, c.y + 120); await p.mouse.down()
  for (let i = 1; i <= 12; i++) await p.mouse.move(c.x + i * 10, c.y + 120)
  await p.mouse.up()
  const r = await p.evaluate(() => { for (let i = 0; i < 400 && nt.G.stack.length === 0 && nt.G.misses === 0; i++) nt.dbg.tick(1); return nt.state() })
  expect(r.n === 1 && r.misses === 0, JSON.stringify(r)); return r
})
await t('動かさなければ同じ物は取れずに「ぼてっ」で1ミス', async () => {
  const r = await p.evaluate(() => { nt.start(); nt.dbg.pause(); nt.G.nextSpawn = 1e9; nt.dbg.step(2); nt.dbg.drop('cube', 130); for (let i = 0; i < 600 && nt.G.misses === 0; i++) nt.dbg.tick(1); return { ...nt.state(), pop: document.querySelector('#pop').textContent } })
  expect(r.n === 0 && r.misses === 1 && r.pop === 'ぼてっ', JSON.stringify(r)); return r
})
await t('速く落ちても、てっぺんをすり抜けない（前のコマとの線分で判定）', async () => {
  const r = await p.evaluate(() => { nt.start(); nt.dbg.pause(); nt.G.nextSpawn = 1e9; nt.dbg.step(2); const id = nt.dbg.drop('cube', 0); const f = nt.G.fallers.find(x => x.id === id); f.vy = -4000; for (let i = 0; i < 60 && !nt.G.stack.length; i++) nt.dbg.tick(1); return nt.state() })
  expect(r.n === 1 && r.misses === 0, JSON.stringify(r)); return r
})
await t('揺れすぎると上の子がすべり落ちて1ミス', async () => {
  const r = await p.evaluate(() => { nt.start(); nt.dbg.pause(); nt.G.nextSpawn = 1e9; nt.dbg.stack(['cube', 'pud', 'tri']); nt.G.th = 0.5; nt.dbg.tick(2); return { ...nt.state(), slips: nt.G.slips } })
  expect(r.n === 2 && r.misses === 1 && r.slips === 1, JSON.stringify(r)); return r
})
await t('2回落とすと崩れて結果の1枚が出る（称号・ボタン・支援リンク）', async () => {
  await p.evaluate(() => { nt.start(); nt.dbg.pause(); nt.dbg.stack(['bean', 'cube', 'pink', 'tri', 'pud', 'cube', 'cube', 'bean', 'cube']); nt.dbg.finish(); nt.dbg.tick(120) })
  const r = await p.evaluate(() => ({ s: nt.state(), res: nt.result(), btn: !document.querySelector('#bAgain').hidden && document.querySelector('#bAgain').textContent, sup: !!document.querySelector('#tmSupport') }))
  const v = await variance(p, '#res')
  await p.screenshot({ path: `${ROOT}/shots/v-end.png` })
  expect(r.s.scene === 'end' && r.res.best === 9 && r.res.rank === '屋根より高い' && r.btn === 'もう一回' && r.sup && v > 300, JSON.stringify({ ...r, v })); return { best: r.res.best, rank: r.res.rank, v }
})
await t('自己ベストが残り、タイトルに出る', async () => {
  const r = await p.evaluate(() => ({ ls: localStorage.getItem('nt_best'), tb: document.querySelector('#tBest').textContent }))
  expect(r.ls === '9' && r.tb.includes('9'), JSON.stringify(r)); return r
})
await t('もう一回で最初から（0段・ミス0）', async () => {
  await p.click('#bAgain'); await p.waitForTimeout(200)
  const r = await p.evaluate(() => nt.state())
  expect(r.scene === 'play' && r.n === 0 && r.misses === 0 && r.best === 0, JSON.stringify(r)); return r
})
await t('何もしない通しは最低の称号（板を運んだだけ）', async () => {
  const rs = await p.evaluate(() => { const out = []; for (let s = 1; s <= 6; s++) { nt.dbg.seed(s * 31); nt.start(); nt.dbg.pause(); let f = 0; while (nt.G.phase === 'play' && f++ < 60 * 120) nt.dbg.tick(1); out.push({ best: nt.G.best, rank: nt.rankOf(nt.G.best).ja }) } return out })
  expect(rs.every(r => r.rank === '板を運んだだけ'), JSON.stringify(rs)); return rs.map(r => r.best).join(',')
})
await t('人の速さの bot は最初の5段を落とさずに積める（12回中10回以上）', async () => {
  const rs = await p.evaluate(() => { const out = []; for (let s = 1; s <= 12; s++) { nt.dbg.seed(s * 77 + 1); nt.start(); nt.dbg.pause(); let rs = s * 99 + 5; const Rb = () => (rs = rs * 16807 % 2147483647) / 2147483647; const bot = nt.makeBot({ react: [0.6, 1.0], err: 14, spd: 380, bal: 50, thr: 0.2 }, Rb); let f = 0; while (nt.G.phase === 'play' && nt.G.stack.length < 5 && f++ < 60 * 120) { bot(1 / 60); nt.dbg.tick(1) } out.push(nt.G.misses === 0 && nt.G.stack.length >= 5) } return out })
  expect(rs.filter(Boolean).length >= 10, JSON.stringify(rs)); return rs.filter(Boolean).length
})
await t('文字は同時に1つまで（吹き出しと大きい文字が重ならない）', async () => {
  const r = await p.evaluate(() => { nt.dbg.seed(5); nt.start(); nt.dbg.pause(); let rs = 7; const Rb = () => (rs = rs * 16807 % 2147483647) / 2147483647; const bot = nt.makeBot({ react: [0.5, 0.9], err: 12, spd: 420, bal: 60, thr: 0.18 }, Rb); let both = 0, bubs = 0, f = 0; while (nt.G.phase === 'play' && f++ < 60 * 200) { bot(1 / 60); nt.dbg.tick(1); if (f % 6 === 0) { nt.dbg.render(); const b = document.querySelector('#bub').classList.contains('on'), pp = nt.G.t < nt.G.popUntil; if (b) bubs++; if (b && pp) both++ } } return { both, bubs } })
  expect(r.both === 0 && r.bubs > 5, JSON.stringify(r)); return r
})
await t('風・パーティー帽の踊り・星・金のプリンが通しの中で起きる', async () => {
  const r = await p.evaluate(() => { const seen = { wind: 0, dance: 0, star: 0, gold: 0, blue2: 0 }; for (let s = 1; s <= 6; s++) { nt.dbg.seed(s * 13); nt.start(); nt.dbg.pause(); let rs = s; const Rb = () => (rs = rs * 16807 % 2147483647) / 2147483647; const bot = nt.makeBot({ react: [0.3, 0.5], err: 5, spd: 600, bal: 60, thr: 0.16, star: true }, Rb); let f = 0; while (nt.G.phase === 'play' && f++ < 60 * 300) { bot(1 / 60); nt.dbg.tick(1); if (nt.G.wind.st === 'blow') seen.wind = 1; if (nt.G.stack.some(p => p.hop > 0)) seen.dance = 1 } seen.star += nt.G.stars; seen.gold += nt.G.golds; seen.blue2 += nt.G.blues } return seen })
  expect(r.wind && r.dance && r.star && r.gold, JSON.stringify(r)); return r
})
await t('ページを離れたら BGM と環境音が止まる', async () => {
  const r = await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); return { away: Snd.away, playing: Snd.playing().length, hide: Snd.life.hide } })
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }) })
  expect(r.away && r.playing === 0 && r.hide >= 1, JSON.stringify(r)); return r
})
await t('英語に切り替えると文言が英語・結果も英語', async () => {
  const q = await open(browser)
  await q.click('#bLang')
  const a = await q.evaluate(() => ({ h: document.querySelector('#tH').textContent, b: document.querySelector('#bStart').textContent }))
  await q.click('#bStart'); await q.evaluate(() => { nt.dbg.pause(); nt.dbg.stack(['cube', 'bean', 'pink']); nt.dbg.finish(); nt.dbg.tick(120) })
  const r = await q.evaluate(() => ({ rank: nt.result().rank, again: document.querySelector('#bAgain').textContent, home: (document.querySelector('#tmHome') || {}).textContent }))
  await q.screenshot({ path: `${ROOT}/shots/v-end-en.png` })
  await q.close()
  expect(a.h.includes('Hop-On') && a.b === 'Load up' && r.rank === 'A few hopped on' && r.again === 'Again', JSON.stringify({ a, r })); return { a, r }
})
await t('遊び方が開いて閉じる', async () => {
  const q = await open(browser)
  await q.click('#bHow'); const a = await q.evaluate(() => !document.querySelector('#how').hidden && document.querySelectorAll('#howBody li').length)
  await q.click('#howClose'); const b = await q.evaluate(() => document.querySelector('#how').hidden)
  await q.close(); expect(a === 4 && b, JSON.stringify({ a, b }))
})
await t('全体でエラーなし', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await p.close()

for (const [w, h, name] of SIZES) {
  const q = await open(browser, { viewport: { width: w, height: h } })
  const views = {}
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await q.click('#bHow'); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` }); await q.click('#howClose')
  await q.click('#bStart'); await q.evaluate(() => { nt.dbg.pause(); nt.dbg.step(60); nt.dbg.stack(['bean', 'cube', 'pink', 'tri']); nt.dbg.step(60) })
  views.play = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-play.png` })
  await q.evaluate(() => { nt.dbg.stack(['cube', 'pud', 'bean', 'cube', 'tri', 'pink', 'cube', 'pud', 'bean', 'cube', 'cube', 'pink', 'bean', 'pud', 'cube', 'tri', 'cube', 'bean', 'cube', 'pud', 'cube']); nt.dbg.finish(); nt.dbg.tick(200) })
  await q.waitForTimeout(600)
  views.end = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-end.png` })
  const sup = await q.evaluate(() => { const a = document.querySelector('#tmSupport').getBoundingClientRect(), h = document.querySelector('#tmHome').getBoundingClientRect(); return { a: Math.round(a.bottom), h: Math.round(h.bottom), H: innerHeight } })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, JSON.stringify(r)) })
  await t(`${name}: 支援と横丁へ戻るも画面内`, async () => { expect(sup.a <= sup.H && sup.h <= sup.H, JSON.stringify(sup)); return sup })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await q.close()
}
await browser.close()
// ---- WebKit（iPhone 相当）でタッチの通し
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: タップで始めて bot で通し、結果まで行ける・無音', async () => {
  await wp.tap('#bStart'); await wp.waitForTimeout(300)
  const r = await wp.evaluate(() => { nt.dbg.pause(); nt.dbg.seed(3); let rs = 3; const Rb = () => (rs = rs * 16807 % 2147483647) / 2147483647; const bot = nt.makeBot({ react: [0.5, 0.9], err: 12, spd: 420, bal: 60, thr: 0.18 }, Rb); let f = 0; while (nt.G.scene === 'play' && f++ < 60 * 400) { bot(1 / 60); nt.dbg.tick(1) } return { scene: nt.G.scene, best: nt.G.best, mute: window.__muteOk(), gold: !!document.querySelector('canvas') } })
  await wp.waitForTimeout(500); await wp.screenshot({ path: `${ROOT}/shots/v-webkit-end.png` })
  expect(r.scene === 'end' && r.best > 5 && r.mute, JSON.stringify(r)); return r
})
await t('WebKit: エラーなし', async () => { expect(wp.errs.length === 0, wp.errs.join('|')) })
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
