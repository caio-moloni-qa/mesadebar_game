import { describe, expect, it } from 'vitest';
import { MAX_INTERNAL_HEIGHT, MAX_INTERNAL_WIDTH, envelopeLayout } from './PixelPipeline';

describe('envelopeLayout', () => {
  it.each([
    [1280, 720], [1920, 1080], [1904, 985], [2560, 1440], [3840, 2160], [3440, 1440], [780, 1688], [1366, 768], [800, 600], [500, 300]
  ])('%i×%i fills the canvas with a whole scale and never shows more than 640×360 texels', (width, height) => {
    const layout = envelopeLayout(width, height);
    expect(Number.isInteger(layout.pixelScale)).toBe(true);
    expect(layout.internalWidth).toBeLessThanOrEqual(MAX_INTERNAL_WIDTH);
    expect(layout.internalHeight).toBeLessThanOrEqual(MAX_INTERNAL_HEIGHT);
    expect(layout.internalWidth * layout.pixelScale).toBeGreaterThanOrEqual(width);
    expect(layout.internalHeight * layout.pixelScale).toBeGreaterThanOrEqual(height);
    expect(layout.originX).toBeLessThanOrEqual(0);
    expect(layout.originY).toBeLessThanOrEqual(0);
    // Overhang is less than one internal pixel per side.
    expect(-layout.originX).toBeLessThan(layout.pixelScale);
    expect(-layout.originY).toBeLessThan(layout.pixelScale);
  });

  it('uses exactly 640×360 at 2×, 3× and 6× of that size', () => {
    expect(envelopeLayout(1280, 720)).toMatchObject({ pixelScale: 2, internalWidth: 640, internalHeight: 360 });
    expect(envelopeLayout(1920, 1080)).toMatchObject({ pixelScale: 3, internalWidth: 640, internalHeight: 360 });
    expect(envelopeLayout(3840, 2160)).toMatchObject({ pixelScale: 6, internalWidth: 640, internalHeight: 360 });
  });

  it('fills a browser-chrome-sized 1080p window at 3× instead of letterboxing at 2×', () => {
    expect(envelopeLayout(1904, 985)).toMatchObject({ pixelScale: 3, internalWidth: 635, internalHeight: 329 });
  });
});
