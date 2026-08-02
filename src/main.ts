import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { PreloadScene } from './scenes/PreloadScene';
import { WeaponSelectionScene } from './scenes/WeaponSelectionScene';
import './style.css';

new Phaser.Game({ ...gameConfig, scene: [PreloadScene, MenuScene, WeaponSelectionScene, GameScene] });
