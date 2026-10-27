/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// Every non-test source file under src/core, as raw text, keyed by its path relative to src/core ('./x/y.ts').
const coreSources = import.meta.glob<string>(['./**/*.ts', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true });

/** Resolves a relative import from a core file to a path relative to src/core ('../config/x' means src/config/x). */
function resolveFromCore(filePath: string, specifier: string): string {
  const parts = filePath.split('/').slice(0, -1);
  specifier.split('/').forEach((segment) => {
    if (segment === '..') {
      if (parts.length > 1 || parts[0] !== '.') parts.pop();
      else parts.splice(0, 1, '..');
    } else if (segment !== '.') parts.push(segment);
  });
  const resolved = parts.join('/');
  return resolved.startsWith('.') ? resolved : `./${resolved}`;
}

describe('src/core architecture', () => {
  it('finds the core sources', () => {
    expect(Object.keys(coreSources).length).toBeGreaterThan(5);
  });

  it('resolves import paths correctly', () => {
    expect(resolveFromCore('./session/GameSession.ts', '../systems/DifficultySystem')).toBe('./systems/DifficultySystem');
    expect(resolveFromCore('./session/GameSession.ts', '../../config/balance')).toBe('../config/balance');
    expect(resolveFromCore('./math.ts', '../systems/EnemySpawnSystem')).toBe('../systems/EnemySpawnSystem');
  });

  it.each(Object.entries(coreSources))('%s imports no rendering engine', (_path, source) => {
    expect(source).not.toMatch(/from\s+['"]three(\/[^'"]*)?['"]/);
  });

  it.each(Object.entries(coreSources))('%s never calls Math.random (use the injected Rng)', (_path, source) => {
    expect(source).not.toMatch(/Math\.random\s*\(/);
  });

  it.each(Object.entries(coreSources))('%s imports nothing outside src/core and src/config', (path, source) => {
    const relativeImports = [...source.matchAll(/from\s+['"](\.[^'"]*)['"]/g)].map((match) => resolveFromCore(path, match[1]));
    relativeImports.forEach((resolved) => {
      if (resolved.startsWith('../')) expect(resolved).toMatch(/^\.\.\/config\//);
    });
  });
});
