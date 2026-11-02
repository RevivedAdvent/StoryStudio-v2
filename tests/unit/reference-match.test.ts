import { describe, expect, it } from 'vitest';
import { matchTemplate, sharedOriginError, type Pixels } from '../../src/features/reference/match';

function image(width: number, height: number): Pixels { return { width, height, data: new Uint8ClampedArray(width * height * 4) }; }
function set(p: Pixels, x: number, y: number, r: number, g: number, b: number, a = 255) { const i = (y * p.width + x) * 4; p.data.set([r, g, b, a], i); }
function fixture() {
  const ref = image(80, 60), crop = image(24, 20);
  for (let y = 0; y < 60; y++) for (let x = 0; x < 80; x++) set(ref, x, y, 15, 20, 25);
  for (let y = 2; y < 18; y++) for (let x = 2; x < 22; x++) {
    const r = (x * 83 + y * 17) % 256, g = (x * 47 + y * 89) % 256, b = (x * 19 + y * 71) % 256;
    set(crop, x, y, r, g, b); set(ref, x + 31, y + 23, r, g, b);
  }
  return { ref, crop };
}
describe('masked reference matching', () => {
  it('finds a distinctive cropped transparent layer at known coordinates', () => {
    const { ref, crop } = fixture(); const result = matchTemplate(ref, crop);
    expect(result).not.toBeNull(); expect(result?.manual).toBe(false);
    expect(result?.x).toBe(31); expect(result?.y).toBe(23); expect(result?.scale).toBeCloseTo(1, 2);
    expect(result?.error).toBeLessThan(.01);
    // Compare the reconstructed opaque pixels with the reference, not just the returned coordinates.
    let difference = 0, channels = 0;
    for (let y = 0; y < crop.height; y++) for (let x = 0; x < crop.width; x++) {
      const i = (y * crop.width + x) * 4;
      if (crop.data[i + 3] < 245) continue;
      const j = ((result!.y + y) * ref.width + result!.x + x) * 4;
      for (let c = 0; c < 3; c++) { difference += Math.abs(crop.data[i + c] - ref.data[j + c]); channels++; }
    }
    expect(difference / channels).toBeLessThan(1);
  });
  it('estimates a resized cropped template', () => {
    const ref = image(90, 70), crop = image(24, 20), scale = 1.2;
    for (let y = 0; y < 70; y++) for (let x = 0; x < 90; x++) set(ref, x, y, 8, 12, 20);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 24; x++) set(crop, x, y, Math.floor(x / 4) * 32, Math.floor(y / 4) * 45, ((Math.floor(x / 4) * 37 + Math.floor(y / 4) * 29) % 256));
    for (let y = 0; y < Math.ceil(20 * scale); y++) for (let x = 0; x < Math.ceil(24 * scale); x++) {
      const sx = Math.min(23, Math.floor(x / scale)), sy = Math.min(19, Math.floor(y / scale)), i = (sy * 24 + sx) * 4;
      set(ref, 29 + x, 17 + y, crop.data[i], crop.data[i + 1], crop.data[i + 2]);
    }
    const result = matchTemplate(ref, crop);
    expect(result).not.toBeNull(); expect(result?.manual).toBe(false);
    expect(result!.x).toBeGreaterThanOrEqual(27); expect(result!.x).toBeLessThanOrEqual(31);
    expect(result!.y).toBeGreaterThanOrEqual(15); expect(result!.y).toBeLessThanOrEqual(19);
    expect(result!.scale).toBeGreaterThanOrEqual(1.1); expect(result!.scale).toBeLessThanOrEqual(1.3);
  });
  it('compares a full-canvas transparent layer at the shared origin', () => {
    const { ref, crop } = fixture(); const full = image(ref.width, ref.height);
    for (let y = 0; y < crop.height; y++) for (let x = 0; x < crop.width; x++) {
      const i = (y * crop.width + x) * 4;
      set(full, x + 31, y + 23, crop.data[i], crop.data[i + 1], crop.data[i + 2], crop.data[i + 3]);
    }
    const comparison = sharedOriginError(ref, full);
    expect(comparison?.samples).toBeGreaterThan(20); expect(comparison?.error).toBe(0);
  });
  it('does not claim a uniform image is matched', () => {
    const { ref } = fixture(); const crop = image(20, 20);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) set(crop, x, y, 40, 70, 90);
    expect(matchTemplate(ref, crop)).toBeNull();
  });
});
