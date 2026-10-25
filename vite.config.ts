/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/mesadebar_game/',
  test: {
    // core/architecture.test.ts scans src/core via import.meta.glob; Vitest's on-disk module cache keeps the old glob
    // result, so a newly added core file would silently skip the checks. The suite is tiny — no cache needed.
    fsModuleCache: false
  }
});
