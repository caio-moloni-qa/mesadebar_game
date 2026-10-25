/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// Every non-test source file under src/core, as raw text.
const coreSources = import.meta.glob<string>(['./**/*.ts', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true });

describe('src/core architecture', () => {
  it('finds the core sources', () => {
    expect(Object.keys(coreSources).length).toBeGreaterThan(5);
  });

  it.each(Object.entries(coreSources))('%s imports no rendering engine', (_path, source) => {
    expect(source).not.toMatch(/from\s+['"](phaser|three)(\/[^'"]*)?['"]/);
  });

  it.each(Object.entries(coreSources))('%s never calls Math.random (use the injected Rng)', (_path, source) => {
    expect(source).not.toMatch(/Math\.random\s*\(/);
  });

  it.each(Object.entries(coreSources))('%s imports nothing outside src/core and src/config', (_path, source) => {
    const relativeImports = [...source.matchAll(/from\s+['"](\.[^'"]*)['"]/g)].map((match) => match[1]);
    relativeImports.forEach((specifier) => {
      expect(specifier).not.toMatch(/\.\.\/(\.\.\/)?(scenes|entities|systems|ui)\b/);
    });
  });
});
