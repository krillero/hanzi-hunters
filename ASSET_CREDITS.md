# Asset credits and licenses

All art currently in `public/assets/` is **original work created for this project** and is generated
from code by `tools/make_pixel_assets.py` (rectangles in a shared 30-colour palette plus an automatic
1px outline pass). No third-party art, fonts-as-images, or AI-generated imagery is included.

| Files | Source | License |
|---|---|---|
| `characters/hero.png`, `enemies/*.png`, `tiles/dungeon.png`, `props/*.png`, `ui/panel.png` | `tools/make_pixel_assets.py` (this repo) | Same as the project. Treat as CC0 unless the project owner states otherwise. |

Not art, but loaded at runtime: the page requests *DM Mono* and *Manrope* from Google Fonts
(SIL Open Font License). Self-host them before any offline/PWA claims are made.

The concept mockup mentioned in `DEVELOPMENT_BRIEF.md` is **not** used as a source for any asset.
