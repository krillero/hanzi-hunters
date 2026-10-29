#!/usr/bin/env python3
"""Generates the original Hanzi Hunters pixel-art set into public/assets/.

Every sprite is drawn here from rectangles in one shared 20-colour palette, then an
automatic 1px outline pass is applied. Re-run with:  python3 tools/make_pixel_assets.py
Requires Pillow. Output is committed, so Pillow is NOT needed to build or run the game.
"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')

PAL = {
  'K': '#0d1220',  # outline / deepest shadow
  'd': '#1b2a4a', 'b': '#3e78b8', 'B': '#6fa8dc',            # blues (hero cloth)
  's': '#f1c49a', 'S': '#c98f6b',                            # skin
  'h': '#563a32', 'H': '#7a5444',                            # hair / leather
  'w': '#c7d9e8', 'W': '#8196b0',                            # steel
  'g': '#f2c14e', 'G': '#b8893f',                            # gold
  'r': '#c0504d', 'R': '#7e2f3a', 'P': '#e07a6a',           # red (imp, scarf)
  'n': '#2d7e5c', 'm': '#4eb879', 'M': '#80e09a',           # moss / slime green
  'e': '#163b35', 'f': '#ffffff',                            # eye dark / white
  'o': '#ff7b39', 'y': '#ffc15c',                            # fire
  'p': '#4a3a6b', 'q': '#6e5a9a',                            # bat purple
  't': '#182333', 'T': '#1f2d42', 'u': '#2a3a52', 'v': '#3d4f68',  # stone
  'c': '#42634c', 'C': '#5a8a60',                            # wall moss
}
RGB = {k: tuple(int(v[i:i+2], 16) for i in (1, 3, 5)) + (255,) for k, v in PAL.items()}

class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.g = [[None] * w for _ in range(h)]
    def r(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                if 0 <= xx < self.w and 0 <= yy < self.h:
                    self.g[yy][xx] = c
    def p(self, x, y, c): self.r(x, y, 1, 1, c)
    def outline(self, c='K'):
        src = [row[:] for row in self.g]
        for y in range(self.h):
            for x in range(self.w):
                if src[y][x] is None and any(
                    0 <= x+dx < self.w and 0 <= y+dy < self.h and src[y+dy][x+dx] is not None
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    self.g[y][x] = c
        return self
    def image(self):
        im = Image.new('RGBA', (self.w, self.h), (0, 0, 0, 0))
        for y in range(self.h):
            for x in range(self.w):
                if self.g[y][x]: im.putpixel((x, y), RGB[self.g[y][x]])
        return im

def sheet(frames, path):
    w, h = frames[0].w, frames[0].h
    out = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames): out.paste(f.image(), (i * w, 0))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out.save(path)

# ---------------------------------------------------------------- hero 24x24 frames, faces right
def hero(bob=0, attack=False):
    c = Canvas(24, 24)
    y = bob
    # boots + legs
    c.r(7, 19+y, 3, 3, 'd'); c.r(12, 19+y, 3, 3, 'd'); c.r(6, 21+y, 4, 2, 'h'); c.r(12, 21+y, 4, 2, 'h')
    # scarf tail (behind)
    c.r(4, 11+y, 3, 6, 'R'); c.r(4, 11+y, 2, 5, 'r')
    # torso
    c.r(7, 11+y, 8, 8, 'b'); c.r(7, 11+y, 8, 2, 'B'); c.r(13, 13+y, 2, 6, 'd')
    c.r(7, 17+y, 8, 1, 'G'); c.r(10, 17+y, 2, 1, 'g')
    # head
    c.r(7, 3+y, 8, 8, 's'); c.r(7, 9+y, 8, 2, 'S')
    c.r(6, 2+y, 10, 4, 'h'); c.r(6, 4+y, 2, 4, 'h'); c.r(9, 3+y, 4, 1, 'H')
    c.p(11, 7+y, 'e'); c.p(14, 7+y, 'e')
    c.r(7, 11+y, 8, 1, 'r')  # scarf
    if not attack:
        c.r(15, 12+y, 2, 4, 'b'); c.r(15, 15+y, 2, 2, 's')       # arm + hand
        c.r(17, 3+y, 2, 12, 'w'); c.r(17, 3+y, 1, 12, 'f'); c.r(16, 15+y, 4, 1, 'g'); c.r(17, 16+y, 2, 2, 'H')
    else:
        c.r(15, 12+y, 3, 3, 'b'); c.r(17, 13+y, 2, 2, 's')
        c.r(19, 12+y, 4, 2, 'w'); c.r(19, 12+y, 4, 1, 'f'); c.r(18, 11+y, 1, 5, 'g'); c.r(17, 14+y, 2, 2, 'H')
    return c.outline()

sheet([hero(0), hero(1), hero(0, True)], f'{ROOT}/characters/hero.png')

# ---------------------------------------------------------------- slime 16x16
def slime(squash=0):
    c = Canvas(16, 16)
    top = 5 + squash
    rows = [(top, 6), (top+1, 10), (top+2, 12)] + [(y, 14) for y in range(top+3, 14)]
    for y, w in rows: c.r(8 - w // 2, y, w, 1, 'm')
    # shade bottom, highlight top-left
    for y in range(11, 14): c.r(8 - 7, y, 14, 1, 'n') if y == 13 else None
    c.r(2, 12, 12, 1, 'n')
    c.r(5, top+1, 3, 1, 'M'); c.r(4, top+2, 2, 2, 'M')
    c.r(5, top+5, 2, 3, 'e'); c.r(10, top+5, 2, 3, 'e'); c.p(5, top+5, 'f'); c.p(10, top+5, 'f')
    c.r(7, top+8, 3, 1, 'n')
    return c.outline()
sheet([slime(0), slime(1)], f'{ROOT}/enemies/slime.png')

# ---------------------------------------------------------------- imp 16x16
def imp(flap=0):
    c = Canvas(16, 16)
    c.r(5, 5, 6, 7, 'r'); c.r(4, 6, 8, 5, 'r'); c.r(5, 10, 6, 2, 'R')       # body
    c.r(4, 2, 1, 3, 'y'); c.r(11, 2, 1, 3, 'y'); c.r(5, 3, 6, 3, 'r')       # horns, head
    c.r(6, 4, 1, 2, 'y'); c.r(9, 4, 1, 2, 'y')                               # eyes
    c.r(6, 7, 4, 1, 'R'); c.p(7, 7, 'f'); c.p(9, 7, 'f')                      # grin
    c.r(5, 12, 2, 2, 'R'); c.r(9, 12, 2, 2, 'R')                              # feet
    c.r(2, 7 + flap, 2, 3, 'P'); c.r(12, 7 + flap, 2, 3, 'P')                # arms
    c.r(11, 11, 3, 1, 'r'); c.r(13, 9, 1, 3, 'r'); c.p(13, 8, 'o')           # tail
    return c.outline()
sheet([imp(0), imp(1)], f'{ROOT}/enemies/imp.png')

# ---------------------------------------------------------------- bat 16x16
def bat(up=True):
    c = Canvas(16, 16)
    c.r(6, 6, 4, 6, 'p'); c.r(6, 3, 1, 3, 'p'); c.r(9, 3, 1, 3, 'p'); c.r(6, 5, 4, 2, 'p')
    c.p(7, 7, 'r'); c.p(9, 7, 'r'); c.p(7, 10, 'f'); c.p(9, 10, 'f')
    if up:
        c.r(1, 3, 5, 5, 'q'); c.r(10, 3, 5, 5, 'q'); c.r(0, 2, 2, 3, 'q'); c.r(14, 2, 2, 3, 'q'); c.r(2, 7, 4, 1, 'p'); c.r(10, 7, 4, 1, 'p')
    else:
        c.r(1, 8, 5, 5, 'q'); c.r(10, 8, 5, 5, 'q'); c.r(0, 11, 2, 3, 'q'); c.r(14, 11, 2, 3, 'q'); c.r(2, 7, 4, 1, 'p'); c.r(10, 7, 4, 1, 'p')
    return c.outline()
sheet([bat(True), bat(False)], f'{ROOT}/enemies/bat.png')

# ---------------------------------------------------------------- tiles 16x16: floor A, floor B, floor moss, wall brick, wall top
def floor(kind):
    c = Canvas(16, 16)
    c.r(0, 0, 16, 16, 'T'); c.r(0, 0, 16, 1, 'v'); c.r(0, 0, 1, 16, 'v'); c.r(1, 15, 15, 1, 't'); c.r(15, 1, 1, 15, 't')
    c.r(2, 2, 12, 12, 't') if kind == 'b' else c.r(2, 2, 12, 12, 'T')
    if kind == 'a': c.p(5, 6, 'u'); c.p(10, 10, 'u'); c.p(11, 4, 'u')
    if kind == 'b': c.r(4, 5, 3, 1, 'u'); c.p(7, 6, 'u'); c.r(8, 9, 1, 3, 'u'); c.p(9, 12, 'u')
    if kind == 'm':
        c.r(3, 9, 5, 3, 'c'); c.r(4, 8, 3, 1, 'C'); c.r(9, 4, 3, 2, 'c'); c.p(10, 3, 'C'); c.p(6, 11, 'n')
    return c
def wall(top=False):
    c = Canvas(16, 16)
    if top:
        c.r(0, 0, 16, 16, 't'); c.r(0, 13, 16, 3, 'v'); c.r(0, 13, 16, 1, 'u'); c.r(0, 15, 16, 1, 'T')
        return c
    c.r(0, 0, 16, 16, 'T')
    for row, off in ((0, 0), (1, 8), (2, 0), (3, 8)):
        y = row * 4
        c.r(0, y + 3, 16, 1, 't')
        for x in range(-off, 16, 16): c.r(max(0, x + 7), y, 1, 4, 't')
        c.r(0, y, 16, 1, 'u') if row % 2 == 0 else None
    c.r(2, 5, 3, 2, 'c'); c.p(3, 4, 'C'); c.r(11, 9, 3, 2, 'c')
    return c
sheet([floor('a'), floor('b'), floor('m'), wall(), wall(True)], f'{ROOT}/tiles/dungeon.png')

# ---------------------------------------------------------------- torch 16x16 (2 flame frames) and chest (closed/open)
def torch(f):
    c = Canvas(16, 16)
    c.r(7, 8, 2, 7, 'h'); c.r(5, 7, 6, 2, 'G'); c.r(6, 6, 4, 1, 'G')
    if f == 0: c.r(6, 2, 4, 5, 'o'); c.r(7, 1, 2, 2, 'o'); c.r(7, 3, 2, 3, 'y')
    else: c.r(6, 3, 4, 4, 'o'); c.r(8, 1, 2, 3, 'o'); c.r(7, 4, 2, 3, 'y')
    return c.outline()
sheet([torch(0), torch(1)], f'{ROOT}/props/torch.png')

def chest(open_):
    c = Canvas(16, 16)
    c.r(2, 8, 12, 6, 'h'); c.r(2, 8, 12, 1, 'H'); c.r(2, 11, 12, 1, 'G'); c.r(7, 10, 2, 3, 'g')
    if not open_:
        c.r(2, 4, 12, 4, 'H'); c.r(2, 4, 12, 1, 'h'); c.r(2, 6, 12, 1, 'G')
    else:
        c.r(2, 2, 12, 3, 'H'); c.r(2, 2, 12, 1, 'h'); c.r(3, 6, 10, 2, 'y'); c.p(5, 5, 'g'); c.p(9, 4, 'f'); c.p(11, 5, 'g')
    return c.outline()
sheet([chest(False), chest(True)], f'{ROOT}/props/chest.png')

# ---------------------------------------------------------------- UI frame 12x12 (4px 9-slice border, transparent centre)
ui = Canvas(12, 12)
ui.r(0, 0, 12, 12, 'K'); ui.r(1, 1, 10, 10, 'v'); ui.r(2, 2, 8, 8, 'u'); ui.r(3, 3, 6, 6, 'T')
for x, y in ((1, 1), (9, 1), (1, 9), (9, 9)): ui.r(x, y, 2, 2, 'g')
img = ui.image()
for y in range(4, 8):          # transparent centre so the CSS background shows through
    for x in range(4, 8): img.putpixel((x, y), (0, 0, 0, 0))
img.save(f'{ROOT}/ui/panel.png')

# ---------------------------------------------------------------- preview (not shipped: written next to the tool)
if os.environ.get('PREVIEW'):
    prev = Image.new("RGBA", (24*3+32*3+80+32*2+20, 28), (11, 17, 27, 255)); x = 0
    for p in ('characters/hero.png', 'enemies/slime.png', 'enemies/imp.png', 'enemies/bat.png', 'tiles/dungeon.png', 'props/torch.png', 'props/chest.png'):
        im = Image.open(f'{ROOT}/{p}'); prev.paste(im, (x, 0), im); x += im.width + 2
    prev.resize((prev.width * 4, prev.height * 4), Image.NEAREST).save(os.environ['PREVIEW'])
