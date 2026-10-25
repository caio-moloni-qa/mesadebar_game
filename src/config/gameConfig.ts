import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './world';

export { GAME_HEIGHT, GAME_WIDTH, RUN_DURATION_MS, WORLD_SIZE } from './world';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#151b2b',
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.ENVELOP, autoCenter: Phaser.Scale.CENTER_BOTH }
};
