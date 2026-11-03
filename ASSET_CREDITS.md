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

## Imported source media (`public/sources/`)

| Files | Source | License |
|---|---|---|
| `public/sources/accc-anki/media/*.mp3` | Word recordings of *A Course in Contemporary Chinese* (當代中文課程, National Taiwan Normal University Mandarin Training Center), extracted from the shared Anki deck `A_Course_in_Contemporary_Chinese__B1-B6_Traditional.apkg` (https://ankiweb.net/shared/info/1466478713) by `npm run source:import`. | **Not openly licensed; reuse terms unknown.** Included by decision of the project owner (2026-11-02); no permission from the rights holder is documented here. See `src/content/sources.json` → `accc-anki`. |

Not in this repository: `public/sources/xiehanzi-new-hsk-2025-v24/media/*.mp3` (321 word clips of the Anki-xiehanzi New HSK
2025 package, HSK 1 subdeck). They are extracted only by a local `npm run source:import`, ignored by git and never deployed
(`sources.json` → `"media": "local-only"`): their per-file origin (audio-cmn CC BY-SA, Shtooka/Caen, or gTTS text-to-speech) and
reuse terms are unknown. The source's records, CC-CEDICT definitions (CC BY-SA 4.0) and example sentences (no stated source or
licence) are published with the review screen by decision of the project owner (2026-11-02); see `sources.json`.

Each file is named by its content hash; `public/sources/accc-anki/records.json` maps every file to its source record, and
`src/content/recordings.json` lists the recordings the game actually uses. The deck's font file is not imported.
