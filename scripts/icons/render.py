# Render t01 cuts to PNG/ICO with Pillow. Usage: favicons.py <cuts dir> <out dir>
import re, sys, os
from PIL import Image, ImageDraw
cuts, out = sys.argv[1], sys.argv[2]
def rects(path):
    s = open(path).read()
    vb = float(re.search(r'viewBox="0 0 (\d+)', s).group(1))
    rs = []
    for m in re.finditer(r'<rect ([^/]*)/>', s):
        a = dict(re.findall(r'(\w+)="([\d.]+)"', m.group(1)))
        rs.append(tuple(float(a.get(k, 0)) for k in ('x', 'y', 'width', 'height', 'rx')))
    return vb, rs
def draw(path, px, ink=(0, 0, 0, 255), ground=(0, 0, 0, 0), pad=0.0, ss=8):
    vb, rs = rects(path)
    S = px * ss
    im = Image.new('RGBA', (S, S), ground); d = ImageDraw.Draw(im)
    k = S * (1 - 2 * pad) / vb; o = S * pad
    for x, y, w, h, rx in rs:
        box = [o + x * k, o + y * k, o + (x + w) * k - 1, o + (y + h) * k - 1]
        d.rounded_rectangle(box, radius=rx * k, fill=ink) if rx else d.rectangle(box, fill=ink)
    return im.resize((px, px), Image.LANCZOS)
# Pixel cuts at their own size (each is hinted to its grid)
ico = [draw(f'{cuts}/t01-{n}.svg', n, ss=1 if n <= 32 else 8) for n in (16, 32, 48)]
ico[2].save(f'{out}/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])
# Home-screen and manifest icons: light mark on a Graphite tile (iOS fills transparency with black)
paper = (0x15, 0x17, 0x1A, 255)  # Graphite, the page default ground
draw(f'{cuts}/t01-128.svg', 180, ink=(0xF3, 0xF2, 0xF0, 255), ground=paper, pad=0.14).save(f'{out}/apple-touch-icon.png')
for n in (192, 512):
    draw(f'{cuts}/t01-128.svg', n, ink=(0xF3, 0xF2, 0xF0, 255), ground=paper, pad=0.18).save(f'{out}/icon-{n}.png')
print('ok')
