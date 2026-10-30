# Sprite sheet reference (all frames are laid out left→right; scale with integers only)

| File | Frame size | Frames | Used scale |
|---|---|---|---|
| `characters/hero.png` | 24×24 | 0 idle, 1 idle (bob), 2 attack | 2–5× (`height/62`) |
| `enemies/slime.png`, `imp.png`, `bat.png` | 16×16 | 0, 1 idle | actor scale + 1 |
| `tiles/dungeon.png` | 16×16 | 0 floor, 1 floor (cracked), 2 floor (moss), 3 wall brick, 4 wall base | 2× (3× if scene ≥ 250 px tall) |
| `props/torch.png` | 16×16 | 0, 1 flame | tile scale |
| `props/chest.png` | 16×16 | 0 closed, 1 open | actor scale + 1 |
| `ui/panel.png` | 12×12 | 4px 9-slice, transparent centre | CSS `border-image` |

Regenerate everything with `python3 tools/make_pixel_assets.py` (needs Pillow). Palette lives at the top of that file.
