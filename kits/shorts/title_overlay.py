#!/usr/bin/env python3
"""Title card overlay: python3 title_overlay.py "<title>" <cover.jpg|W,H> <out.png> [--on-cover]
Wraps the title over 2-3 lines in Comfortaa Bold, as large as fits, white with a dark outline, last line in warm
yellow, over a soft dark gradient at the top. With a cover image the result is the cover itself (thumbnail);
with W,H it is a transparent overlay."""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import os, subprocess
# Comfortaa Bold (rounded, friendly); FLOW_TITLE_FONT overrides, fontconfig finds it elsewhere, any bold sans as a last resort.
FONT = os.environ.get("FLOW_TITLE_FONT") or "/usr/share/fonts/aajohan-comfortaa-fonts/Comfortaa-Bold.otf"
if not os.path.exists(FONT):
    FONT = subprocess.run(["fc-match", "-f", "%{file}", "Comfortaa:bold"], capture_output=True, text=True).stdout.strip() or FONT
title, src, out = sys.argv[1], sys.argv[2], sys.argv[3]
if "," in src and not src.endswith((".jpg", ".png")):
    W, H = map(int, src.split(","))
    base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
else:
    base = Image.open(src).convert("RGBA")
    W, H = base.size

font = lambda s: ImageFont.truetype(FONT, s)
words = title.split()

def splits(n):
    """All ways to cut the words into n consecutive lines."""
    if n == 1:
        yield [words]
        return
    for i in range(1, len(words) - n + 2):
        for rest in splits_from(words[i:], n - 1):
            yield [words[:i]] + rest

def splits_from(ws, n):
    if n == 1:
        yield [ws]
        return
    for i in range(1, len(ws) - n + 2):
        for rest in splits_from(ws[i:], n - 1):
            yield [ws[:i]] + rest

max_w, max_block = W * 0.88, H * 0.21
cands = []
for n in range(2 if len(words) >= 3 else 1, min(3, len(words)) + 1):
    for layout in splits(n):
        lines = [" ".join(l) for l in layout]
        lo, hi = 8, int(W * 0.17)
        while lo < hi:                       # largest size whose widest line and whole block still fit
            mid = (lo + hi + 1) // 2
            f = font(mid)
            widest = max(f.getlength(l) for l in lines)
            block = mid * 1.18 * len(lines)
            if widest <= max_w and block <= max_block:
                lo = mid
            else:
                hi = mid - 1
        cands.append((lo, lines))
# Near-largest sizes only, then the most even lines: no one-word orphans like "The / Youngest in / the Room".
top_size = max(c[0] for c in cands)
near = [c for c in cands if c[0] >= top_size * 0.80]
size, lines = min(near, key=lambda c: (max(font(c[0]).getlength(l) for l in c[1]) - min(font(c[0]).getlength(l) for l in c[1]), -c[0]))
f = font(size)
lh = size * 1.18
top = H * 0.055

# soft scrim so the title reads on any picture
scrim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
px = scrim.load()
fade = int(top + lh * len(lines) + H * 0.06)
for y in range(fade):
    a = int(150 * (1 - y / fade) ** 1.5)
    for x in range(W):
        px[x, y] = (30, 14, 4, a)
base = Image.alpha_composite(base, scrim)

stroke = max(2, round(size * 0.10))
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
text = Image.new("RGBA", (W, H), (0, 0, 0, 0))
td = ImageDraw.Draw(text)
for i, line in enumerate(lines):
    w = f.getlength(line)
    x, y = (W - w) / 2, top + i * lh
    fill = (255, 214, 74, 255) if i == len(lines) - 1 and len(lines) > 1 else (255, 255, 255, 255)
    sd.text((x + size * 0.04, y + size * 0.06), line, font=f, fill=(0, 0, 0, 200), stroke_width=stroke, stroke_fill=(0, 0, 0, 200))
    td.text((x, y), line, font=f, fill=fill, stroke_width=stroke, stroke_fill=(42, 22, 8, 255))
shadow = shadow.filter(ImageFilter.GaussianBlur(size * 0.05))
result = Image.alpha_composite(Image.alpha_composite(base, shadow), text)
result.convert("RGB" if out.endswith(".jpg") else "RGBA").save(out)
print(f"{W}x{H} font {size}px, {len(lines)} lines: {lines}")
