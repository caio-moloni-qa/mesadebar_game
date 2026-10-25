import { CHARACTERS, CharacterId } from './config/characters';
import { WEAPONS, WeaponConfig } from './config/weapons';
import { Game3D } from './render/Game3D';
import './play3d.css';

// Three.js page (play3d.html). Opens on the character/weapon menu. Query params, all optional:
//   ?hero=barbarian|mage|reliquia|fabri (skips the menu)   ?weapon=staff|sword|whip|boomerang|amulet   ?seed=123
//   ?stress=240 (keep N skeletons alive)   ?god=1 (invincible)   ?debug=1 (U/I/O/T test keys, see Game3DOptions)
const params = new URLSearchParams(window.location.search);
const hero = params.get('hero');
const characterId = hero && hero in CHARACTERS ? (hero as CharacterId) : null;
const seed = Number(params.get('seed')) || undefined;
const stress = Number(params.get('stress')) || undefined;
const weapon = params.get('weapon');
const weaponId = weapon && weapon in WEAPONS ? (weapon as WeaponConfig['id']) : null;
const initialRun = characterId ? { characterId, weaponId: weaponId ?? CHARACTERS[characterId].preferredWeaponId ?? 'staff' } : undefined;

new Game3D(document.getElementById('app')!, { initialRun, seed, stressEnemyCount: stress, invincible: params.get('god') === '1', debug: params.get('debug') === '1' });
