import './mute-auto.mjs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// 公開URLの確認。node live.mjs（ログインしていないブラウザで見る）。SKIPGH=1 で GitHub ページの確認を省く
// nokkari-tower __NS__ を置き換え、「遊びの通し」をゲームに合わせて書く
import { chromium, webkit } from 'playwright'
import { execSync } from 'node:child_process'
// 個人のアカウント名は公開リポジトリに書かない。実行時に gh から取る（2026-11-02 live.mjs に名前が文字で入ったまま5本公開していた）
const OWNER = (() => { try { return execSync('gh api user -q .login', { encoding: 'utf8' }).trim().toLowerCase() } catch { return '' } })()
const URL0 = 'https://tom3games.github.io/nokkari-tower/'
const out = []
for (const [name, bt, opts] of [['chromium', chromium, {}], ['webkit', webkit, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const b = await bt.launch(bt === chromium ? MUTE_LAUNCH : {}), ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  // 横丁へ移す転送 script は、横丁に載る前だと 404 へ飛ぶので確認の時だけ外す（配信中の中身そのものを確かめる）
  await ctx.route(u => u.href.startsWith(URL0) && !/\.(js|mp3|png|html)(\?|$)/.test(u.pathname), async route => { const r = await route.fetch(); route.fulfill({ response: r, body: (await r.text()).replace(/<script id="ghMove">[^<]*<\/script>/, '') }) })
  const p = await ctx.newPage()
  const errs = []
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
  p.on('requestfailed', r => errs.push('fail ' + r.url()))
  await p.goto(URL0 + '?t=' + Date.now(), { waitUntil: 'networkidle' })
  await p.waitForFunction(() => window.__ntReady, null, { timeout: 15000 })
  await p.waitForTimeout(600)
  if (bt === webkit) await p.tap('#bStart'); else await p.click('#bStart')
  await p.waitForFunction(() => nt.G.phase === 'play', null, { timeout: 8000 })
  // 本物の指で左右に動かす
  const c = await p.evaluate(() => nt.carrierXY())
  if (bt === webkit) { const s = await p.evaluate(() => nt.state()); void s }
  await p.mouse.move(c.x, c.y + 100); await p.mouse.down(); for (let i = 1; i <= 6; i++) await p.mouse.move(c.x + i * 10, c.y + 100); await p.mouse.up()
  await p.waitForTimeout(300)
  const st = await p.evaluate(() => nt.state()); if (bt !== webkit && st.TX < 30) errs.push('drag ' + st.TX)
  await p.evaluate(() => { nt.dbg.pause(); nt.dbg.stack(['bean', 'cube', 'pink']); nt.dbg.finish(); nt.dbg.tick(200) }); await p.waitForFunction(() => nt.G.scene === 'end', null, { timeout: 8000 })
  await p.screenshot({ path: `shots/live-${name}.png` })
  const og = await (async () => { const r = await fetch(URL0 + 'og.png'); return r.status + ' ' + r.headers.get('content-type') })()   // og:image は横丁の URL。横丁に載る前は github.io の物で確かめる
  out.push(`${name}: og=${og} errors=${errs.length ? errs.join(' | ') : 'none'}`)
  await b.close()
}
if (process.env.SKIPGH) { console.log(out.join('\n')); process.exit(0) }
// ログアウト状態でリポジトリ・更新履歴に個人のIDが出ていないか
const b = await chromium.launch(MUTE_LAUNCH), p = await b.newPage()
for (const u of ['https://github.com/tom3games/nokkari-tower', 'https://github.com/tom3games/nokkari-tower/commits/main']) {
  const res = await p.goto(u, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  out.push(`${u} status=${res.status()} owner=${OWNER && (await p.content()).toLowerCase().includes(OWNER) ? 'FOUND' : 'none'}`)
}
await b.close()
console.log(out.join('\n'))
