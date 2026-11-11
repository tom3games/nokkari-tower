# 生成した3枚のシート（クリーム地・3x2）から背景を抜き、1枚の絵（img/chars.webp）と枠の表（atlas.js）にまとめる。
# 使い方: python3 -I art/atlas.py   （nokkari-tower の直下で）
import json, os
import numpy as np
from PIL import Image

D = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(D)
SHEETS = {
    'a': ['carrier', 'cube', 'bean', 'tri', 'pud', 'pink'],
    'b': ['carrier_s', 'cube_f', 'bean_f', 'tri_f', 'pud_f', 'pink_f'],
    'c': ['carrier_down', 'carrier_w', 'cloud', 'plane', 'balloon', 'bird'],
}
MAXD = {'carrier': 300, 'carrier_s': 300, 'carrier_down': 300, 'carrier_w': 300, 'bean': 300, 'bean_f': 300, 'cloud': 280, 'plane': 260, 'balloon': 240}
# 中に閉じた背景（豆の腕と足の間のすき間）も抜く範囲。シートの座標
HOLES = {'a': [(1024, 0, 1536, 512), (212, 208, 368, 266)], 'b': [(176, 226, 354, 262)], 'c': [(665, 195, 865, 250)]}
INK = np.array([43, 43, 43], np.float32)


def cutout(src):
    a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    border = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    cand = d < 16
    # 外から続いている背景だけ抜く（板・雲・目の白は残す）
    from PIL import ImageDraw
    m = Image.fromarray((cand * 255).astype(np.uint8), 'L').copy()
    for sx in range(0, w, 64):
        for sy in (0, h - 1):
            if m.getpixel((sx, sy)) == 255: ImageDraw.floodfill(m, (sx, sy), 128, thresh=0)
    for sy in range(0, h, 64):
        for sx in (0, w - 1):
            if m.getpixel((sx, sy)) == 255: ImageDraw.floodfill(m, (sx, sy), 128, thresh=0)
    bgm = np.asarray(m) == 128
    for (x0, y0, x1, y1) in HOLES.get(os.path.basename(src)[0], []):
        bgm[y0:y1, x0:x1] |= cand[y0:y1, x0:x1]
    # 縁: 背景のすぐ隣で色の薄い（灰色寄りの）画素は、黒線とクリームの混ざり。黒線の濃さだけ残す
    near = np.zeros_like(bgm)
    for dy in (-2, -1, 0, 1, 2):
        for dx in (-2, -1, 0, 1, 2):
            near |= np.roll(np.roll(bgm, dy, 0), dx, 1)
    L = a.mean(-1)
    sat = a.max(-1) - a.min(-1)
    Lbg = bg.mean()
    alpha = np.where(bgm, 0.0, 1.0)
    fr = near & ~bgm & (sat < 40) & (L > 50)
    af = np.clip((Lbg - L) / (Lbg - 43), 0, 1)
    alpha = np.where(fr, af, alpha)
    rgb = np.where(fr[..., None], INK, a)
    out = np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA'), bg


sprites = {}
for k, names in SHEETS.items():
    im, bg = cutout(os.path.join(D, 'raw', k + '.png'))
    W, H = im.size
    cw, ch = W // 3, H // 2
    for i, n in enumerate(names):
        c = im.crop(((i % 3) * cw, (i // 3) * ch, (i % 3 + 1) * cw, (i // 3 + 1) * ch))
        A = np.asarray(c)[..., 3]
        # 小さな点（ゴミ）を無視して外枠を取る: 行・列ごとに不透明が4画素以上ある所
        rows = np.where((A > 60).sum(1) >= 4)[0]
        cols = np.where((A > 60).sum(0) >= 4)[0]
        c = c.crop((cols[0] - 2, rows[0] - 2, cols[-1] + 3, rows[-1] + 3))
        md = MAXD.get(n, 230)
        s = min(1, md / max(c.size))
        c = c.resize((max(1, round(c.size[0] * s)), max(1, round(c.size[1] * s))), Image.LANCZOS)
        sprites[n] = c
        print(k, n, c.size, 'bg', bg.round())

# 棚詰め
order = sorted(sprites, key=lambda n: -sprites[n].size[1])
AW, pad = 1024, 4
x = y = rowh = 0
pos = {}
for n in order:
    w, h = sprites[n].size
    if x + w + pad > AW:
        x = 0; y += rowh + pad; rowh = 0
    pos[n] = [x, y, w, h]
    x += w + pad; rowh = max(rowh, h)
AH = y + rowh
atlas = Image.new('RGBA', (AW, AH), (0, 0, 0, 0))
for n, (x, y, w, h) in pos.items():
    atlas.paste(sprites[n], (x, y))
os.makedirs(os.path.join(ROOT, 'img'), exist_ok=True)
out = os.path.join(ROOT, 'img', 'chars.webp')
atlas.save(out, quality=88, method=6)
atlas.save(os.path.join(D, 'raw', 'atlas_preview.png'))
with open(os.path.join(ROOT, 'atlas.js'), 'w') as f:
    f.write('// art/atlas.py が書く。手で直さない\nconst NT_ATLAS = ' + json.dumps({'img': 'img/chars.webp', 'w': AW, 'h': AH, 'f': pos}, separators=(',', ':')) + '\n')
print('atlas', AW, AH, os.path.getsize(out) // 1024, 'KB')
