/** Engine-agnostic world constants (no Phaser import) so src/core can read them — config/gameConfig.ts re-exports
 *  them for the existing Phaser call sites. All values are in game units (= the original 2D pixels). */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const WORLD_SIZE = 2800;
export const RUN_DURATION_MS = 300_000;
