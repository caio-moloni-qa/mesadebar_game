# Assets pendentes de arte definitiva (temporário)

Levantamento de todos os visuais que hoje são **placeholders** (reaproveitando arte existente, ou gerados via código/script) e deveriam virar sprites dedicados. Nenhuma ferramenta de geração de imagem está disponível nas sessões do Claude Code, então cada item abaixo já tem um prompt pronto pra rodar quando a arte for gerada em outro lugar (Codex CLI com `imagegen`, Midjourney, etc.) — ver `.codex/skills/generate-pixel-*` pra convenções de tamanho/transparência.

## ~~1. Espada Necromante (ataque corpo a corpo do Boss Final) 🗡️~~ — resolvido (2026-08-07)

- Recebeu arte dedicada: `src/assets/weapons/boss-sword-summon.png` (grid de referência 3x3, 1024x1536, não carregado pelo jogo — células espaçadas de forma irregular). O jogo usa `src/assets/weapons/boss-sword-summon-sheet.png`, um recorte derivado gerado por script (3 quadros de 260x480, recortados com precisão de pixel e ancorados no mesmo ponto de base), registrado como `boss-sword-summon` e usado em `BossSystem.telegraphMeleeAttack()`/`resolveMeleeSweep()` (108x200 em tela, preservando a proporção alta/fina da lâmina). Os 3 quadros viram a animação `boss-sword-summon-grow` — a espada nasce como um espinho de energia e cresce até a lâmina sólida (1,5s), e como a animação não repete, o Phaser deixa o sprite parado no último quadro (a lâmina pronta) pelo resto do telegraph/giro. `boss-sword-icon.png` (a versão estática que veio antes) foi descartada. O ajuste manual de rotação (`MELEE_SWORD_ART_TILT`) que compensava a arte antiga desenhada na diagonal também foi removido, já que a arte nova nasce reta.

## 2. Mira do Necro-Beam (lock-on) 🎯

- **Onde**: `BossSystem.ensureBeamReticleTexture()` — ícone que aparece acima da cabeça do jogador durante os 3s de mira antes do disparo do Necro-Beam.
- **Placeholder atual**: gerado 100% em runtime via `Phaser.GameObjects.Graphics` (um anel com uma mira em cruz dentro), 28x28, cor `0x8cffb0` (verde claro). Não existe nenhum arquivo de imagem — é desenhado por código toda vez que o jogo carrega.
- **Categoria/tamanho sugerido**: ícone de VFX/UI, 32x32, fundo transparente.
- **Prompt sugerido**: "Pixel art targeting reticle icon, ghostly green ring with a crosshair inside, necromantic/spectral energy style, glowing edges, 32x32, transparent background, no text or watermark."

## 3. Rastro de Vento do Giro Corpo a Corpo 🌬️

- **Onde**: `BossSystem.createWindTrail()` — partículas que seguem a espada durante o giro de 360° do ataque corpo a corpo do boss.
- **Placeholder atual**: gerado em runtime via `Graphics` (um círculo branco sólido de 8x8), tingido de verde claro (`0xb6ffb0`) e usado como textura de partícula com blend mode ADD. Não existe arquivo de imagem dedicado.
- **Categoria/tamanho sugerido**: textura de partícula/VFX, 16x16, fundo transparente, formato suave (soft glow, não um sprite com contorno definido).
- **Prompt sugerido**: "Small soft glowing particle sprite for a wind/slash trail effect, radial white-to-transparent gradient, usable with additive blending, 16x16, transparent background, no text or watermark."

## 4. Baú de Melhoria (Loot Chest) 🎁

- **Onde**: `LootChest` (`src/entities/LootChest.ts`) — item que Super Esqueleto e Necromante têm 40% de chance de soltar ao morrer (ver `UPGRADE_ODDS_TEMP.md`).
- **Placeholder atual**: `src/assets/pickups/loot-chest.png`, construído à mão via script Node/zlib (sem ferramenta de geração de imagem disponível) — um baú de madeira simples com tampa mais escura, bandas metálicas e uma fechadura dourada, 32x32px, exibido a 46x46 no jogo.
- **Categoria/tamanho sugerido**: ícone de pickup, 32x32 (mesmo padrão da gema/orbe de XP existentes), fundo transparente.
- **Prompt sugerido**: "Pixel art treasure chest icon, aged wooden body with dark wood lid, gold metal trim and a glowing golden lock, medieval fantasy style, slight magical glow around the edges, 32x32, transparent background, no text or watermark."

## 5. Feixe Amplificado (upgrade de projétil) ✨

- **Onde**: card da melhoria `projectile-wide-bolt` (Cajado/Bumerangue) — "Aumenta o tamanho e a área de impacto dos projéteis mágicos".
- **Placeholder atual**: `src/assets/upgrades/wide-bolt-icon.png`, 64x64 — um triângulo roxo liso simulando um projétil largo, sem detalhamento pixel art real (arquivo de 264 bytes, claramente um placeholder simples, não arte desenhada).
- **Categoria/tamanho sugerido**: ícone de melhoria, 64x64, fundo transparente.
- **Prompt sugerido**: "Pixel art upgrade icon representing a widened magic bolt/projectile, a broad glowing arcane energy shard with a bright core and soft outward glow, purple-blue magical color palette, medieval fantasy style, 64x64, transparent background, no text or watermark."

## 6. Aura de Apodrecimento (Rotten Aura) 🤢

- **Onde**: `Enemy.updateRottenAuraVisual()` / `Enemy.spawnRottenSmoke()` — debuff constante ao redor do Super Esqueleto e do Boss Final (ver `BOSS_REWORK_TEMP.md`).
- **Placeholder atual**: nenhuma arte — o círculo da área é um `Phaser.GameObjects.Arc` sólido cinza-escuro (`0x2b2b2b`, alpha 0,35) com contorno, e a "fumaça" são retângulos pretos lisos de 4x4 (`scene.add.rectangle`) subindo e sumindo. Tudo desenhado por formas geométricas simples, sem nenhum sprite.
- **Categoria/tamanho sugerido**: dois assets separados — (a) um decal de chão circular (textura tileável ou radial, ~128x128, fundo transparente, pra substituir o círculo sólido) e (b) uma textura de partícula de fumaça (~16x16, fundo transparente) pra substituir os retângulos pretos.
- **Prompt sugerido (decal de chão)**: "Pixel art circular ground decal representing a rotten/decaying aura, dark sickly green-gray swirling patches, cracked and corrupted ground texture, radial fade to transparent at the edges, top-down view, 128x128, transparent background, no text or watermark."
- **Prompt sugerido (partícula de fumaça)**: "Small pixel art smoke/rot particle sprite, dark grayish-black wisp, soft irregular blob shape, usable as a rising particle effect, 16x16, transparent background, no text or watermark."

## ~~7. Personagem Fabri (macaco guerreiro) 🐵~~ — resolvido (2026-08-13)

- Recebeu arte dedicada: `src/assets/characters/fabri-walk-sheet.png`. Gerado pelo usuário fora desta sessão (grid 4x4, canvas bruto 1254x1254, mantido como `fabri-walk-sheet-raw.png`) e redimensionado proporcionalmente para 384x384 (96x96 por frame, igual ao padrão dos demais personagens) — como 1254/4 e 384/4 preservam a mesma razão, o reescalonamento simples da imagem inteira manteve o registration point de cada frame já bem alinhado no bruto (feetY e centerX consistentes por linha, medidos programaticamente). Registrado em `PreloadScene.preload()` como `this.load.spritesheet('fabri', ..., { frameWidth: 96, frameHeight: 96 })`.

## ~~8. Bumerangue-Banana do Fabri (arma transformada) 🍌~~ — resolvido (2026-08-13)

- Recebeu arte dedicada: `src/assets/weapons/banana-boomerang-icon.png`. Gerado pelo usuário fora desta sessão (canvas bruto 1254x1254 com o conteúdo já ocupando quase todo o canvas, mantido como `banana-boomerang-icon-raw.png`), recortado para a bounding box alpha (com pequena margem) e redimensionado para 64x64, igual aos demais ícones de arma. Registrado em `PreloadScene.preload()` como `this.load.image('weapon-banana-icon', ...)`.

## ~~9. Casca de banana no chão (armadilha de escorregão do Fabri) 🍌💦~~ — resolvido (2026-08-13)

- Recebeu arte dedicada: `src/assets/weapons/banana-peel-icon.png`. Gerado pelo usuário fora desta sessão (canvas bruto 1254x1254 com a casca já ocupando quase todo o canvas, mantido como `banana-peel-icon-raw.png`), recortado para a bounding box alpha (com pequena margem) e redimensionado para 32x32, igual ao padrão de `exp-crystal.png`/`xp-orb.png`. Registrado em `PreloadScene.preload()` como `this.load.image('banana-peel', ...)`.

---

Nenhum desses placeholders bloqueia gameplay — são só substituições visuais pendentes. Ao gerar a arte real, trocar via `.codex/skills/integrate-pixel-assets/SKILL.md` (registro no preload, texture key, mapeamento de UI).
