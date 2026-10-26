# Mesa de Bar — art brief for Codex

One brief, worked through in stages. Finish a stage, check it against its checklist, then start the next. Each stage
lists every file: what it is, its exact size or grid, and **exactly where it lands**.

The game is a 3D survivors-like with a low-poly, pixelated look ("Mesa de Bar", working title VENIVIUM). Medieval dark
fantasy, a tavern between runs. On-screen text in the game is Brazilian Portuguese; **no text, letters, numbers,
logos or watermarks appear in any asset**.

---

## Rules for every stage

1. **Use the repo's skills.** Follow `.codex/skills/generate-pixel-character`, `generate-pixel-weapon`,
   `generate-pixel-upgrade` and `integrate-pixel-assets` where they apply. This brief overrides them only where it is
   more specific.
2. **Never overwrite a file.** If a target name exists, save as `name_v2.png` (then `_v3`, ...) and note it in the
   report (see the end of this brief).
3. **Keep the source.** Every image is saved twice: `<name>-raw.png` (exactly what the generator returned) and
   `<name>.png` (cleaned, cropped, resized to spec). For turnaround sheets the cleaned version is `turnaround.png`.
4. **Transparency is real alpha.** Where a spec says transparent, read the alpha channel of the corner pixels to
   verify it is 0. A grey or checkered background painted into the image is a failure: regenerate, or key it out.
5. **The generator ignores canvas sizes.** It usually returns 1024×1024, 1536×1024 or 1024×1536. Measure what came
   back before cropping, and crop or resize to the spec afterwards.
6. **Grids are exact.** For sprite sheets, every frame stays inside its own cell, nothing crosses a cell edge, and
   every frame keeps the same pivot point (stated per sheet) so the animation doesn't jitter.
7. **Save the prompt you used** next to each output as `<name>-generation-prompt.txt`.
8. **Don't touch code.** This brief produces art files only. Claude Code wires them into the game afterwards.

---

## Stage 1 — Weapon icons (5 files)

Icons for the five new weapons, shown in the hero cards, the HUD's loadout row and the upgrade screens. They sit next
to the existing icons in `src/assets/weapons/` (`sword-icon.png`, `staff-icon.png`, `whip-icon.png`), so match those:
pixel art, 64×64, transparent, the weapon drawn diagonally (handle lower-left, business end upper-right), 1 px dark
outline, a soft highlight, limited palette, readable at 32 px.

**Shared style (paste before each icon):**
```
Pixel-art game weapon icon, 64×64, transparent background (real alpha), single item centered, drawn diagonally
(grip lower-left, business end upper-right), crisp hard-edged pixels, 1px dark outline, limited palette (6–10
colours), soft top-left light, no text, no frame, no background shape, medieval dark-fantasy, matching
src/assets/weapons/sword-icon.png in style and scale.
```

| # | Weapon (in game) | Prompt (after the shared style) | Land at |
|---|---|---|---|
| 1.1 | Martelo de Forja (Brom) | A dwarven forge hammer: short dark-oak haft wrapped in leather, a heavy square iron head with a gold band around it, a few glowing ember flecks on the striking face. | `src/assets/weapons/hammer-icon.png` (+ `hammer-icon-raw.png`) |
| 1.2 | Arco Élfico (Lyra) | An elven longbow of pale curved wood with leaf carvings, green fletched arrow nocked on a taut string, small green gem at the grip. | `src/assets/weapons/bow-icon.png` (+ `-raw`) |
| 1.3 | Moedas Viciadas (Grimbo) | A small leather coin pouch spilling three gold coins in an arc, one coin mid-flip catching the light, a tiny green goblin thumbprint stitched on the pouch. | `src/assets/weapons/coins-icon.png` (+ `-raw`) |
| 1.4 | Bola de Cristal (Zora) | A glowing cyan crystal ball on a small ornate gold stand, swirling mist inside, a soft halo, drawn upright (the one exception to the diagonal rule). | `src/assets/weapons/crystal-icon.png` (+ `-raw`) |
| 1.5 | Mochila de Tralhas (Sergio) | A battered iron frying pan crossed with a green glass bottle and a round red potion flask, as if just pulled out of a traveller's pack. | `src/assets/weapons/pack-icon.png` (+ `-raw`) |

**Checklist:** five 64×64 RGBA PNGs, corners alpha 0, nothing touching the canvas edge, each readable at 32 px.

---

## Stage 2 — Effect sprite sheets (6 files)

Animated effects for the new heroes' abilities. They follow the same rules as the existing sheets in
`src/assets/attacks/` (look at `sword-sweep-sheet_v2.png` and `aura-tick-sheet_v3.png` for the look). Ground effects
are drawn **from directly above** (they're laid flat on the floor in game); billboards are drawn **from the front**.

**Shared style (paste before each sheet):**
```
VFX sprite sheet for a low-poly, pixelated 3D dark-fantasy survivors-like: crisp hard-edged pixel-art effect,
limited palette (4–6 tones), chunky readable shapes, bright core fading to transparent edges, NO soft airbrush blur,
NO photorealism, NO characters, NO weapons, NO text, NO frame borders or grid lines. Transparent background with real
alpha. Every frame stays fully inside its own cell; every frame uses the same pivot point.
```

| # | Effect | Grid / canvas | View and pivot | Frames | Land at |
|---|---|---|---|---|---|
| 2.1 | **Hammer quake** — Brom's shockwave: cracked earth ring bursting out with dust and stone chips. Palette earth brown, dust beige, a thin gold impact flash. | 3×2 on 1536×1024 (cells 512) | Top-down, centre of cell | 1 gold flash point · 2 cracks spread to 40% · 3 ring at 70% with stone chips flying · 4 ring at 90% · 5 dust settling · 6 faint dust | `src/assets/attacks/hammer-quake-sheet.png` |
| 2.2 | **Foam burst** — Brom's barrel exploding: mead foam splashing outward in a ring, bubbles. Palette cream, white, honey amber. | 3×2 on 1536×1024 | Top-down, centre | 1 barrel staves popping · 2 foam blob 30% · 3 splash ring 70% · 4 ring 95% with bubbles · 5 bubbles popping · 6 last droplets | `src/assets/attacks/foam-burst-sheet.png` |
| 2.3 | **Arrow rain impact** — Lyra's volley landing: a circle of green-fletched arrows striking the ground, small leaf-green flashes. | 3×2 on 1536×1024 | Top-down, centre; impacts fill ~90% of the cell | 1 first 3 arrow shadows · 2 arrows striking, green sparks · 3 full volley, ring flash · 4 arrows stuck, sparks fading · 5 arrows fading · 6 faint ring | `src/assets/attacks/arrow-rain-sheet.png` |
| 2.4 | **Fate mark** — Zora's Destino Selado: a violet occult sigil (eye inside a broken circle with tarot-star points) floating over a marked enemy, looping. Palette violet, magenta, pale gold. | 2×2 on 1024×1024 (cells 512) | Front (billboard), centre | 4-frame loop: the sigil slowly rotates and pulses; frame 4 loops back into frame 1 | `src/assets/attacks/fate-mark-sheet.png` |
| 2.5 | **Fate burst** — a marked enemy bursting: violet star-shaped explosion with tarot-card shards. | 3×2 on 1536×1024 | Front (billboard), centre | 1 violet point · 2 starburst · 3 full burst with card shards · 4 ring · 5 sparks · 6 last motes | `src/assets/attacks/fate-burst-sheet.png` |
| 2.6 | **Bottle burst** — Sergio's thrown bottle shattering: green glass shards and a splash of bubbling liquid. Palette bottle green, lime, white glint. | 3×2 on 1536×1024 | Front (billboard), centre | 1 crack flash · 2 glass shards + splash · 3 full splash · 4 droplets falling · 5 puddle mist · 6 last glints | `src/assets/attacks/bottle-burst-sheet.png` |

Each sheet also gets its `-raw.png` and `-generation-prompt.txt`.

**Checklist:** exact canvas sizes (1536×1024 or 1024×1024), clean cell boundaries, consistent pivot, real alpha.

---

## Stage 3 — Hero models: turnaround sheets for Tripo3D (5 heroes)

Concept sheets the user turns into 3D models with Tripo3D. These five heroes play today as simple placeholder figures,
so these sheets give them their real look. The four tavern-regular portraits already exist (the look must match
them): `src/assets/characters/npcs/brom-portrait.png`, `lyra-portrait.png`, `grimbo-portrait.png`, `zora-portrait.png`,
`sergio-portrait.png`.

**Shared style (paste before each hero):**
```
Character turnaround concept sheet for image-to-3D conversion (Tripo3D), for a low-poly, pixelated 3D dark-fantasy
survivors-like. Stylized, chunky, readable shapes, hand-painted flat colours, simple large forms — NOT pixel art, NOT
photorealistic. Exactly THREE full-body views side by side on one 1536×1024 canvas: FRONT (left), RIGHT SIDE (middle),
BACK (right). Same character, same scale, feet on one baseline, orthographic (no perspective), each view centred in
its third with clear empty space between views. Pose: neutral A-pose, arms ~30° down and away from the body, legs
slightly apart, clear gaps between arms and torso and between the legs. Hands EMPTY and open (weapons are made
separately). Flat, even, shadowless lighting. Plain flat light-grey background (#d9d9d9). No text, no labels, no
arrows, no ground plane.
```

Then crop each view on its own (one figure, centred, same height) into `views/front.png`, `views/side.png`,
`views/back.png`.

| # | Hero | Prompt (after the shared style) | Land at |
|---|---|---|---|
| 3.1 | **Brom Barbaferro** — dwarf brewer, tank, ~1.4 m, very stout | Brom Barbaferro, a stout broad-shouldered dwarf (short legs, huge torso), ruddy skin, a huge braided copper-red beard with two braids tied in iron rings, a round riveted iron cap, brown leather shirt under a dark stained leather apron, wide belt with a brass buckle, heavy boots, a small mead keg strapped to the back of his belt. Match brom-portrait.png. | `art-source/3d/brom/turnaround.png` (+ `turnaround-raw.png`), views in `art-source/3d/brom/views/` |
| 3.2 | **Lyra Folhaverde** — elf huntress, ranged, ~1.85 m, slender | Lyra Folhaverde, a slender tall elf huntress, long golden-blonde hair, long pointed ears, emerald eyes, a forest-green hooded cloak (hood down) over a lighter green tunic, brown leather bracers and tall boots, a quiver of green-fletched arrows on her back (the bow is made separately). Match lyra-portrait.png. | `art-source/3d/lyra/…` (same layout) |
| 3.3 | **Grimbo Dedoleve** — goblin gambler, ~1.2 m, small and wiry | Grimbo Dedoleve, a small wiry goblin, bright lime-green skin, enormous pointed ears angled outward, long hooked nose, big yellow eyes, a sly grin with one gold tooth, a battered black top hat with a gold band, a magenta waistcoat over a cream shirt, short trousers, bare green feet, a few coins sewn on the waistcoat. Match grimbo-portrait.png. Ears must not touch the canvas edge. | `art-source/3d/grimbo/…` |
| 3.4 | **Madame Zora** — seer, magic, ~1.75 m | Madame Zora, a mysterious fortune teller, warm brown skin, kohl-lined eyes, a golden-yellow silk headscarf with a trailing tail, large gold hoop earrings, layered gold necklaces, a long deep-violet gown reaching the ankles with a magenta shawl, sandals, small bells on the hem. Match zora-portrait.png. | `art-source/3d/zora/…` |
| 3.5 | **Sergio** — barkeep and merchant, ~1.8 m | Sergio, an older travelling merchant and barkeep, tan skin, bushy white eyebrows, long full white beard, a deep purple hooded robe with bright violet trim and gold sash, a HUGE travel pack on his back (rolled red blanket on top, a frying pan and lantern tied to its sides — all part of the pack, attached to it), sturdy boots. Match sergio-portrait.png and src/assets/characters/npcs/merchant.png. | `art-source/3d/sergio/…` |

**Checklist per hero:** `turnaround-raw.png`, `turnaround.png` (1536×1024, three views), `views/front.png`,
`views/side.png`, `views/back.png`, prompt file. Hands empty, A-pose, gaps between limbs.

> Next step for the user (not Codex): run `views/front|side|back.png` through Tripo3D (multi-view, base colour only,
> 8–12k faces) and save the export as `art-source/3d/<hero>/tripo/raw.glb`. Claude Code takes it from there.

---

## Stage 4 — Signature skins: turnaround sheets for mastery level 10 (9 heroes)

At mastery level 10 every hero unlocks a **signature skin**: a new look built as its own 3D model. Today a recoloured
"Lenda" palette stands in for it. Same turnaround rules and shared style as Stage 3; same hero proportions as their
base model (the skin swaps the outfit, not the body).

| # | Hero → skin name | Prompt (after the shared style) | Land at |
|---|---|---|---|
| 4.1 | Bárbaro → **Senhor da Guerra Glacial** | The barbarian warrior (same build as src/assets/characters/players/barbarian-card-idle.png) as a glacial warlord: white wolf-pelt mantle, armour of blue-white ice shards over dark iron, frost-rimed braided beard, pale glowing cyan runes on the bracers. | `art-source/3d/barbarian-signature/…` |
| 4.2 | Mago → **Arquimago Estelar** | The mage (same build as mage-card-idle.png) as a star archmage: deep navy robes embroidered with gold constellations, a tall pointed hood with a crescent-moon clasp, floating small star motes sewn into the hem, silver trim. | `art-source/3d/mage-signature/…` |
| 4.3 | Relíquia → **Guardião Solar** | The relic hunter (same build as reliquia-card-idle.png) as a sun guardian: white and gold priestly armour, a radiant sun-disc gorget, orange sash, gold filigree gauntlets, a short cape with a sunburst. | `art-source/3d/reliquia-signature/…` |
| 4.4 | Fabri → **Macaco Pirata** | Fabri, the armoured monkey warrior (same build as fabri-card-idle.png), as a pirate captain: red bandana under a black tricorn hat with a gold banana emblem, open navy coat with gold buttons, striped sash, an eyepatch, peg-free normal legs. | `art-source/3d/fabri-signature/…` |
| 4.5 | Brom → **Rei da Forja** | Brom as the forge king: a heavy crown-helm of dark iron with molten-orange cracks, armour plates glowing like cooling metal, beard braids capped with gold, a fur-lined royal mantle. | `art-source/3d/brom-signature/…` |
| 4.6 | Lyra → **Sentinela Lunar** | Lyra as the moon sentinel: silver-white leaf armour, a midnight-blue cloak with a crescent clasp, pale moonlit hair, faint silver tattoos on the cheeks. | `art-source/3d/lyra-signature/…` |
| 4.7 | Grimbo → **Barão do Cassino** | Grimbo as the casino baron: a sharp emerald tailcoat, gold waistcoat with dice buttons, a tall top hat with a playing-card band, a monocle, gold rings on every finger. | `art-source/3d/grimbo-signature/…` |
| 4.8 | Zora → **Oráculo Cósmico** | Madame Zora as the cosmic oracle: a gown of deep space-violet fabric scattered with stars, a headdress of gold planetary rings, a veil of fine gold chains across the forehead, glowing cyan eyes. | `art-source/3d/zora-signature/…` |
| 4.9 | Sergio → **Príncipe Mercador** | Sergio as the merchant prince: rich crimson and gold robes, a jewelled turban instead of the hood, the travel pack replaced by an ornate gilded chest worn on the back, rings and a gold chain of office. | `art-source/3d/sergio-signature/…` |

**Checklist per skin:** same files as Stage 3. Before generating, look at the base hero's existing art so the body,
proportions and silhouette stay recognisable.

---

## Stage 5 (optional) — Weapon models for Tripo3D (5 weapons)

The weapons are simple procedural low-poly models in game today. If you want them as real models too, make one
prop sheet per weapon. Use the same shared style as Stage 3, but with a **single object**: lying flat and horizontal,
side view plus a top view, on one 1536×1024 canvas, on the same light-grey background.

| # | Weapon | Prompt | Land at |
|---|---|---|---|
| 5.1 | Martelo de Forja | Same design as Stage 1.1, as a 3D-modelling reference: dark-oak leather-wrapped haft, square iron head with a gold band. | `art-source/3d/weapons/hammer/sheet.png` (+ `-raw`) |
| 5.2 | Arco Élfico | Same design as 1.2, unstrung-straight side view and a front view. | `art-source/3d/weapons/bow/sheet.png` |
| 5.3 | Moedas Viciadas | The coin pouch from 1.3 plus one large single coin, front and side. | `art-source/3d/weapons/coins/sheet.png` |
| 5.4 | Bola de Cristal | The crystal ball and its gold stand from 1.4, front and top. | `art-source/3d/weapons/crystal/sheet.png` |
| 5.5 | Mochila de Tralhas | Three props side by side: the frying pan, the green bottle and the red potion flask from 1.5. | `art-source/3d/weapons/pack/sheet.png` |

---

## Final step — report

When every stage is done, write `art-source/CODEX_ART_REPORT.md` with one row per file: stage, file path, final size,
whether alpha was verified, any `_v2` renames, and anything that needed a regeneration or manual fix. Claude Code uses
this report to wire everything in.
