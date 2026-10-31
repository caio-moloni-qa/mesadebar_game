import { isRosterId } from './config/tavernRoster';
import { DUELS, DuelId } from './config/tavernBattle';
import { TOWERS, TowerId } from './config/tavernTowers';
import { CHARACTERS, CharacterId } from './config/characters';
import { WEAPONS, WeaponConfig } from './config/weapons';
import { ZoneKind } from './config/arenaLayout';
import { Game3D } from './render/Game3D';
import { loadHeroMeshes } from './render/models/heroMeshes';
import { loadBossMeshes } from './render/models/importedBosses';
import './play3d.css';

// The game's entry point (index.html). Opens on the character/weapon menu. Query params, all optional:
//   ?hero=barbarian|mage|reliquia|fabri (skips the menu)   ?weapon=staff|sword|whip|boomerang|amulet   ?seed=123
//   ?stress=240 (keep N skeletons alive)   ?god=1 (invincible)   ?debug=1 (U/I/O/T/V test keys, see Game3DOptions)
//   F9 in a run: sandbox panel   ?touch=1 (show the joystick off a touch screen)   ?debug=collision (draw collision shapes)   ?zoom=3 (close-up camera for reviewing models)   ?at=ruins|lake|forest|graveyard|camp|meadow (debug start zone)   ?arena=snowfield
//   ?duel=brom|lyra|grimbo|zora|sergio (opens that Taverna em Turnos duel in the tavern; &bet=10 skips Grimbo's question)
const params = new URLSearchParams(window.location.search);
const hero = params.get('hero');
const characterId = hero && hero in CHARACTERS ? (hero as CharacterId) : null;
const seed = Number(params.get('seed')) || undefined;
const stress = Number(params.get('stress')) || undefined;
const weapon = params.get('weapon');
const weaponId = weapon && weapon in WEAPONS ? (weapon as WeaponConfig['id']) : null;
const initialRun = characterId ? { characterId, weaponId: weaponId ?? CHARACTERS[characterId].preferredWeaponId ?? 'staff' } : undefined;

// Imported hero meshes load first (a failed one falls back to the procedural model), then the game starts.
void Promise.all([loadHeroMeshes(), loadBossMeshes()]).then(() => {
  const game = new Game3D(document.getElementById('app')!, { initialRun, seed, stressEnemyCount: stress, invincible: params.get('god') === '1', debug: params.get('debug') === '1', showCollision: params.get('debug') === 'collision', zoom: Number(params.get('zoom')) || undefined, startZone: (params.get('at') as ZoneKind | null) ?? undefined, arena: params.get('arena') ?? undefined, touch: params.get('touch') === '1', duel: (params.get('duel') ?? '') in DUELS ? (params.get('duel') as DuelId) : undefined, duelBet: params.has('bet') ? Number(params.get('bet')) || 0 : undefined, tower: (params.get('tower') ?? '') in TOWERS ? (params.get('tower') as TowerId) : undefined, squad: params.get('squad')?.split(',').filter(isRosterId) });
  // ?debug=1: the running game on window for poking at it from the console / test drivers.
  if (params.get('debug') === '1') Object.assign(window, { __game: game });
});
