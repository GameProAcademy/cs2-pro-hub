# CS2 assets (Visual Game Language 2.0)

Owner decision (2026-11-26, "PROMPT MESTRE — VGL 2.0"): for this development phase, use authentic CS2
artwork even where the licence is not open, keeping the source of every file and making it
replaceable. Registry: `src/lib/cs2/assets.ts`. Files: `public/cs2/` (972 KB). No runtime URL.

| Group | Files | Source | Licence / note |
| --- | --- | --- | --- |
| Map emblems | `public/cs2/maps/emblem/<map>.webp` (10, 160 px) | `MurkyYT/cs2-map-icons` `images/<map>.png` | Repo has no licence; images are Valve's property (README) |
| Map art | `public/cs2/maps/art/<map>.webp` (10, 960×540) | same repo, `images/thumbs/<map>_1_png.png` | idem |
| Weapon icons | `public/cs2/weapons/*.svg` (48) | `lexogrine/cs2-react-hud` `src/assets/weapons` | MIT code; icons are CS2 HUD artwork |
| HUD icons, CT/T logos | `public/cs2/hud/*` (18) | `lexogrine/cs2-react-hud` `src/assets/images` | idem |

Rules:

- An asset decorates a value already on screen (a real map, weapon or event) and is `aria-hidden`.
- Ambiguous parser names (`m4a1`, `hkp2000`) get no weapon art.
- Unknown names fall back to the CS2 PRO pictograms (`GameIcon`, `MapTile`).
- **Replacing:** change the path in the registry; screens do not reference files directly.
- **Before a commercial launch:** review these licences or replace the files.
- Radar overviews for the heatmap keep their own registry (`src/lib/spatial/radarAssets.ts`).
