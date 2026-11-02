import { describe, expect, it } from 'vitest';
import { fitCompositionScale, fitLayerScale } from '../../src/features/preview/fit';

describe('preview and layer fitting', () => {
  it('fits the composition within either viewport dimension', () => {
    expect(fitCompositionScale(1932, 1092)).toBe(1);
    expect(fitCompositionScale(972, 2000)).toBe(0.5);
    expect(fitCompositionScale(3000, 552)).toBe(0.5);
    expect(fitCompositionScale(0, 0)).toBe(0);
  });
  it('contains or covers without stretching', () => {
    expect(fitLayerScale(1000, 1000, 1920, 1080, 'contain')).toBe(1.08);
    expect(fitLayerScale(1000, 1000, 1920, 1080, 'cover')).toBe(1.92);
  });
});
