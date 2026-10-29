# Art and asset pipeline

## Goal
Move the current code-drawn prototype toward a consistent 16-bit pixel-art fantasy style while preserving mobile readability. Start with a small, integrated proof of concept instead of producing a large disconnected collection of images.

## Current state
`src/game/PixelScene.ts` creates the dungeon floor, tile lines, small moss/stone details, torches, hero and slime using Phaser `Graphics`. React UI elements are styled in `src/styles.css`; many icon-like details use emoji or Unicode characters. No external production art is bundled at this handoff.

The previously generated promo/mockup is only a design reference. It is not a screenshot of the actual application, and the image should not be sliced up and treated as production-ready UI/sprites.

## Recommended first asset batch
Create or commission these assets in a matching style:

1. **Hero:** idle front/three-quarter view, walk cycle, attack pose; transparent background.
2. **Moss slime:** idle/bounce and hit/death frames; transparent background.
3. **Dungeon tiles:** floor, wall, corner, doorway, edge/transition tiles, moss variation.
4. **Props:** wall torch, chest (closed/open), rocks and a small decorative plant.
5. **UI icons:** sword, shield, potion, coin, book, heart, equipment categories.
6. **UI frame set:** panel edges/corners, normal/pressed/disabled button states, health/XP bar pieces.

Expand to additional enemies only after the first encounter proves the pipeline.

## Art direction
- Cohesive 16-bit pixel-art, not a mixture of vector icons, emoji and realistic imagery.
- Dark cool stone palette, warm orange torch light, restrained moss greens and gold reward accents.
- Silhouettes readable at small sizes.
- Use a consistent logical pixel scale and palette; avoid accidental blur from non-integer scaling where feasible.
- Maintain strong contrast behind Chinese text. Never put busy art directly behind a question or answer label.
- Keep the battle scene decorative/supportive; the Chinese question and options remain the primary interaction.

## Technical integration notes
- Prefer sprite sheets/atlases for animated characters and repeated tiles.
- Add assets under a clearly named directory such as `public/assets/` or `src/assets/`; choose one convention and document it. Vite's `public/` files are referenced from the root URL; imported assets in `src/` are processed by Vite.
- For Phaser textures, preload images/sprite sheets in a `preload()` method and use stable keys. Avoid relying on absolute local filesystem paths.
- Use nearest-neighbor / pixel-art-friendly rendering settings as appropriate, and test at actual device pixel ratios.
- Keep logical scene coordinates responsive. On resize, recalculate/reposition scene elements rather than assuming the original dimensions. Review the existing resize handler before adding new layout behavior.
- Do not use CSS `image-rendering: pixelated` as a substitute for proper source art and texture-scale decisions; it only affects raster rendering behavior.
- Ensure animations and effects are brief and do not block answer input or obscure the word card.
- Add loading/error fallback behavior if assets fail to load.

## File naming and source tracking
Use descriptive lowercase names, for example:

```text
public/assets/
  characters/hero-idle.png
  characters/hero-walk.png
  characters/hero-attack.png
  enemies/moss-slime.png
  tiles/dungeon-atlas.png
  props/torch.png
  props/chest.png
  ui/icon-sword.png
  ui/panel-frame.png
```

If using sprite sheets, include a short README or metadata file describing frame dimensions, frame order, animation names and intended scale. Record each asset's author/source, license, modifications and any required attribution in `ASSET_CREDITS.md`.

## Acceptance checklist for each asset batch
- [ ] All art has a known source and compatible license.
- [ ] Transparent assets have clean edges and no unwanted matte/background.
- [ ] Pixel scale and palette are consistent with existing approved assets.
- [ ] Sprites remain legible at phone display size.
- [ ] No art overlaps the question text or touch targets.
- [ ] Assets load in development and production builds.
- [ ] Mobile and desktop scaling checked.
- [ ] Any new asset dependencies/credits documented.
