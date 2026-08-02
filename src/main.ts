import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { PreloadScene } from './scenes/PreloadScene';
import { WeaponSelectionScene } from './scenes/WeaponSelectionScene';
import './style.css';

const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/svg+xml';
favicon.href = new URL('./assets/icons/game-icon.svg', import.meta.url).href;
document.head.appendChild(favicon);

new Phaser.Game({ ...gameConfig, scene: [PreloadScene, MenuScene, WeaponSelectionScene, GameScene] });
