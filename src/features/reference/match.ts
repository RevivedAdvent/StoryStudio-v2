export interface Pixels { width: number; height: number; data: Uint8ClampedArray }
export interface Match { x: number; y: number; scale: number; confidence: number; error: number; margin: number; manual: boolean }

type Sample = { x: number; y: number; r: number; g: number; b: number };

/** Dimensions alone do not prove a shared origin. Compare opaque pixels at that origin. */
export function sharedOriginError(reference: Pixels, template: Pixels): { error: number; samples: number } | null {
  if (reference.width !== template.width || reference.height !== template.height) return null;
  let error = 0, samples = 0;
  const step = Math.max(1, Math.ceil(Math.sqrt(template.width * template.height / 1200)));
  for (let y = 0; y < template.height; y += step) for (let x = 0; x < template.width; x += step) {
    const i = (y * template.width + x) * 4;
    if (template.data[i + 3] < 245 || reference.data[i + 3] < 245) continue;
    for (let c = 0; c < 3; c++) error += Math.abs(template.data[i + c] - reference.data[i + c]);
    samples++;
  }
  return samples >= 20 ? { error: error / (samples * 765), samples } : null;
}

/**
 * Search a downsampled reference with opaque template samples. Alpha edges are
 * deliberately excluded: their observed colour depends on the unknown background.
 * This detects visually similar pixels, not semantic object identity.
 */
export function matchTemplate(reference: Pixels, template: Pixels): Match | null {
  const samples: Sample[] = [];
  const step = Math.max(1, Math.ceil(Math.sqrt(template.width * template.height / 400)));
  for (let y = Math.floor(step / 2); y < template.height; y += step) {
    for (let x = Math.floor(step / 2); x < template.width; x += step) {
      const i = (y * template.width + x) * 4;
      if (template.data[i + 3] >= 245) samples.push({ x, y, r: template.data[i], g: template.data[i + 1], b: template.data[i + 2] });
    }
  }
  if (samples.length < 20) return null;
  const mean = samples.reduce((s, p) => s + (p.r + p.g + p.b) / 3, 0) / samples.length;
  const variance = samples.reduce((s, p) => s + Math.abs((p.r + p.g + p.b) / 3 - mean), 0) / samples.length;
  if (variance < 8) return null; // Flat colours are not distinctive enough.
  const scored = samples.filter((_, i) => i % Math.max(1, Math.floor(samples.length / 100)) === 0);
  type Candidate = { x: number; y: number; scale: number; error: number };
  let best: Candidate | undefined;
  const candidates: Candidate[] = [];
  const score = (x: number, y: number, scale: number) => {
    let sum = 0;
    for (const p of scored) {
      const px = x + Math.floor(p.x * scale), py = y + Math.floor(p.y * scale);
      const i = (py * reference.width + px) * 4;
      if (reference.data[i + 3] < 245) { sum += 765; continue; }
      sum += Math.abs(p.r - reference.data[i]) + Math.abs(p.g - reference.data[i + 1]) + Math.abs(p.b - reference.data[i + 2]);
    }
    return sum / (scored.length * 765);
  };
  for (let n = 5; n <= 15; n++) {
    const scale = n / 10;
    const width = Math.ceil(template.width * scale), height = Math.ceil(template.height * scale);
    if (width > reference.width || height > reference.height) continue;
    for (let y = 0; y <= reference.height - height; y++) for (let x = 0; x <= reference.width - width; x++) {
      const candidate = { x, y, scale, error: score(x, y, scale) };
      if (!best || candidate.error < best.error) best = candidate;
      // Keep a small pool of plausible alternatives to assess ambiguity.
      if (candidate.error < 0.2) candidates.push(candidate);
    }
  }
  if (!best) return null;
  const coarse = best;
  for (let n = -4; n <= 4; n++) {
    const scale = coarse.scale + n * 0.02;
    if (scale < 0.5 || scale > 1.5) continue;
    const maxX = reference.width - Math.ceil(template.width * scale), maxY = reference.height - Math.ceil(template.height * scale);
    for (let y = Math.max(0, coarse.y - 4); y <= Math.min(maxY, coarse.y + 4); y++) for (let x = Math.max(0, coarse.x - 4); x <= Math.min(maxX, coarse.x + 4); x++) {
      const candidate = { x, y, scale, error: score(x, y, scale) };
      if (candidate.error < best.error) best = candidate;
    }
  }
  const current = best;
  const alternative = candidates.filter(c => Math.hypot(c.x - current.x, c.y - current.y) > 8).reduce((min, c) => Math.min(min, c.error), 1);
  const margin = alternative - current.error;
  const confidence = Math.max(0, Math.min(1, (1 - current.error * 4) * Math.min(1, Math.max(0, margin) / 0.05)));
  return { ...current, margin, confidence, manual: current.error > 0.08 || margin < 0.025 || confidence < 0.65 };
}
