/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/mesadebar_game/',
  build: {
    rollupOptions: {
      // index.html = the Phaser game; play3d.html = the Three.js migration's vertical slice (THREEJS_3D_MIGRATION_TEMP.md, Etapa 2).
      input: { main: 'index.html', play3d: 'play3d.html' }
    }
  },
  test: {
    // core/architecture.test.ts scans src/core via import.meta.glob; Vitest's on-disk module cache keeps the old glob
    // result, so a newly added core file would silently skip the checks. The suite is tiny — no cache needed.
    fsModuleCache: false
  }
});
