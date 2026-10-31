#!/usr/bin/env python3
"""Recolours the existing imp and bat sheets into the two boss sprites (original art, same 2-frame 16x16 layout).

  imp.png -> golem.png   (steel-blue stone body, cyan glowing horns/eyes)
  bat.png -> wraith.png  (pale ghost wings, translucent, yellow eyes)

Re-run with:  python3 tools/make_boss_sprites.py     (needs Pillow; the PNG output is committed)
Bosses are drawn one tile larger in the game, so they read as bigger than the normal enemies.
"""
import os
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'enemies')
hexrgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))

GOLEM = {  # source colour -> boss colour
    '#c0504d': '#6a88b0', '#7e2f3a': '#34476b', '#e07a6a': '#a9c6e4', '#ffc15c': '#7fe8ff', '#ff7b39': '#3aa6ff',
}
WRAITH = {
    '#6e5a9a': '#cfe9f2', '#4a3a6b': '#6f9db8', '#c0504d': '#ffd166',
}

def recolour(src, dst, table, wing_alpha=255):
    im = Image.open(os.path.join(ROOT, src)).convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            key = '#%02x%02x%02x' % (r, g, b)
            if key in table:
                nr, ng, nb = hexrgb(table[key])
                # translucent body parts make a ghost, but eyes/outline stay solid
                px[x, y] = (nr, ng, nb, wing_alpha if key in ('#6e5a9a', '#4a3a6b') else 255)
    im.save(os.path.join(ROOT, dst))
    print('wrote', dst, im.size)

recolour('imp.png', 'golem.png', GOLEM)
recolour('bat.png', 'wraith.png', WRAITH, wing_alpha=215)
