#!/usr/bin/env python3
"""Recolours the existing imp and bat sheets into the two boss sprites (original art, same 2-frame 16x16 layout).

  imp.png   -> golem.png     (steel-blue stone body, cyan glowing horns/eyes)
  bat.png   -> wraith.png    (pale ghost wings, translucent, yellow eyes)
  slime.png -> scribe.png    (deep ink-blue blob, gold eyes)
  imp.png   -> trickster.png (magenta body, mint horns, gold glints)

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

SCRIBE = {
    '#4eb879': '#2f4a9a', '#2d7e5c': '#18285e', '#80e09a': '#7d96e6', '#163b35': '#ffd166',
}
TRICKSTER = {
    '#c0504d': '#b04fc4', '#7e2f3a': '#5a2a78', '#e07a6a': '#e0a8f0', '#ffc15c': '#7dffb0', '#ff7b39': '#ffd166',
}

recolour('imp.png', 'golem.png', GOLEM)
recolour('bat.png', 'wraith.png', WRAITH, wing_alpha=215)
recolour('slime.png', 'scribe.png', SCRIBE)
recolour('imp.png', 'trickster.png', TRICKSTER)
