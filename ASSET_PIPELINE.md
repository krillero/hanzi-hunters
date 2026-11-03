# Art and asset pipeline

## Goal
Grow the small code-generated sprite set into a consistent 16-bit pixel-art fantasy style while preserving mobile readability. Start with a small, integrated proof of concept instead of producing a large disconnected collection of images.

## Current state
A small original sprite set is integrated (all generated from code, see `ASSET_CREDITS.md`):

| What | Files | Made by |
|---|---|---|
| Hero (idle, bob, attack), slime, imp, bat, dungeon tiles, torch, chest, UI panel 9-slice | `public/assets/characters`, `enemies`, `tiles`, `props`, `ui` | `tools/make_pixel_assets.py` |
| Boss sprites: Shield Golem, Echo Wraith, Ink Scribe, Mirror Trickster (recolours of imp / bat / slime); the Cavern Warden reuses the Golem sprite with a gold glow | `public/assets/enemies/{golem,wraith,scribe,trickster}.png` | `tools/make_boss_sprites.py` |

Frame layouts and scales: `public/assets/README.md`. Sprites are loaded in `PixelScene.preload()` (`src/game/PixelScene.ts`). UI icons
are still emoji. The design mockups in `docs/design-references/` are targets, not assets; never slice them into production art.

## Next asset work (when the owner asks for it)
1. Own sprites for the bosses (each currently a recolour) and for the Cavern Warden.
2. Hero walk/hit frames and enemy hit/death frames.
3. More dungeon tiles and props per depth (the five depths share one tileset).
4. UI icons (sword, shield, potion, coin, book, heart) to replace emoji, and a button/bar frame set.

## Art direction
- Cohesive 16-bit pixel-art, not a mixture of vector icons, emoji and realistic imagery.
- Dark cool stone palette, warm orange torch light, restrained moss greens and gold reward accents.
- Silhouettes readable at small sizes.
- Use a consistent logical pixel scale and palette; avoid accidental blur from non-integer scaling where feasible.
- Maintain strong contrast behind Chinese text. Never put busy art directly behind a question or answer label.
- Keep the battle scene decorative/supportive; the Chinese question and options remain the primary interaction.

## Technical integration notes
- Prefer sprite sheets/atlases for animated characters and repeated tiles.
- Assets live in `public/assets/<category>/` (referenced from the site root); keep that convention.
- For Phaser textures, preload images/sprite sheets in a `preload()` method and use stable keys. Avoid relying on absolute local filesystem paths.
- Use nearest-neighbor / pixel-art-friendly rendering settings as appropriate, and test at actual device pixel ratios.
- Keep logical scene coordinates responsive. On resize, recalculate/reposition scene elements rather than assuming the original dimensions (see the resize handling in `PixelScene.ts`).
- Do not use CSS `image-rendering: pixelated` as a substitute for proper source art and texture-scale decisions; it only affects raster rendering behavior.
- Ensure animations and effects are brief and do not block answer input or obscure the word card.
- Add loading/error fallback behavior if assets fail to load.

## File naming and source tracking
Lowercase names, one sprite sheet per character or prop with its frames laid out left to right (the existing convention):

```text
public/assets/
  characters/hero.png      # idle, idle (bob), attack
  enemies/slime.png        # idle frames; bosses: golem.png, wraith.png, scribe.png, trickster.png
  tiles/dungeon.png        # floor variants, wall pieces
  props/torch.png, props/chest.png
  ui/panel.png             # 9-slice used by CSS border-image
```

Describe every sheet's frame size, frame order and scale in `public/assets/README.md`. Record each asset's author/source, license, modifications and any required attribution in `ASSET_CREDITS.md`.

## Acceptance checklist for each asset batch
- [ ] All art has a known source and compatible license.
- [ ] Transparent assets have clean edges and no unwanted matte/background.
- [ ] Pixel scale and palette are consistent with existing approved assets.
- [ ] Sprites remain legible at phone display size.
- [ ] No art overlaps the question text or touch targets.
- [ ] Assets load in development and production builds.
- [ ] Mobile and desktop scaling checked.
- [ ] Any new asset dependencies/credits documented.
