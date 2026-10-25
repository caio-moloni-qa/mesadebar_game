import { CHARACTERS, CharacterId } from './config/characters';
import { Game3D } from './render/Game3D';
import './play3d.css';

// Etapa 2 vertical slice entry (play3d.html). Query params, all optional:
//   ?hero=barbarian|mage|reliquia|fabri   ?seed=123   ?stress=240 (keep N skeletons alive)   ?god=1 (invincible)
const params = new URLSearchParams(window.location.search);
const hero = params.get('hero');
const characterId: CharacterId = hero && hero in CHARACTERS ? (hero as CharacterId) : 'mage';
const seed = Number(params.get('seed')) || Math.floor(Math.random() * 2 ** 31);
const stress = Number(params.get('stress')) || undefined;

new Game3D(document.getElementById('app')!, { characterId, seed, stressEnemyCount: stress, invincible: params.get('god') === '1' });
