import type { Layer, Project, StoredAsset } from '../../types/project';
import { matchTemplate, sharedOriginError, type Pixels } from './match';

export interface AlignmentResult {
  layerId: string; name: string; method: string; x: number; y: number; scale: number;
  confidence: number; manual: boolean; reason: string;
}

async function image(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try { const result = new Image(); result.src = url; await result.decode(); return result; }
  finally { URL.revokeObjectURL(url); }
}
function pixels(source: HTMLImageElement, width: number, height: number): Pixels {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Cannot read image pixels.');
  ctx.drawImage(source, 0, 0, width, height);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

/** Positions are mapped through the same centred contain transform as the guide overlay. */
export async function analyseReference(project: Project, assets: Record<string, StoredAsset>): Promise<AlignmentResult[]> {
  const reference = project.reference && assets[project.reference.assetId];
  if (!reference) throw new Error('Choose a reference image first.');
  const refImage = await image(reference.blob);
  const rasterScale = Math.min(1, 240 / reference.width, 160 / reference.height);
  const refWidth = Math.max(1, Math.round(reference.width * rasterScale));
  const refHeight = Math.max(1, Math.round(reference.height * rasterScale));
  const sx = refWidth / reference.width, sy = refHeight / reference.height;
  const refPixels = pixels(refImage, refWidth, refHeight);
  const sceneScale = Math.min(project.width / reference.width, project.height / reference.height);
  const offsetX = (project.width - reference.width * sceneScale) / 2;
  const offsetY = (project.height - reference.height * sceneScale) / 2;
  const results: AlignmentResult[] = [];
  for (const id of project.layerIds) {
    const layer: Layer = project.layers[id];
    if (!layer) continue;
    const base = { layerId: id, name: layer.name, x: layer.x, y: layer.y, scale: layer.scale, confidence: 0, manual: true };
    const asset = assets[layer.assetId];
    if (layer.locked || !asset) { results.push({ ...base, method: 'Not analysed', reason: layer.locked ? 'Layer is locked.' : 'Asset is missing.' }); continue; }
    if (asset.width === reference.width && asset.height === reference.height) {
      try {
        const comparison = sharedOriginError(refPixels, pixels(await image(asset.blob), refWidth, refHeight));
        const error = comparison?.error ?? 1;
        results.push({ ...base, x: project.width / 2, y: project.height / 2, scale: sceneScale, confidence: Math.max(0, 1 - error * 4), manual: error > 0.08, method: 'Shared canvas coordinates', reason: comparison ? `Same dimensions; shared origin is assumed. Opaque-pixel error ${(error * 100).toFixed(1)}%.` : 'Same dimensions but insufficient opaque pixels to verify a shared origin.' });
      } catch { results.push({ ...base, method: 'Shared canvas coordinates', reason: 'Image decoding or pixel analysis failed.' }); }
      continue;
    }
    // Yield between layers so the browser can paint progress and respond to input.
    await new Promise(resolve => setTimeout(resolve, 0));
    try {
      const img = await image(asset.blob);
      const template = pixels(img, Math.max(1, Math.round(asset.width * sx)), Math.max(1, Math.round(asset.height * sy)));
      const match = matchTemplate(refPixels, template);
      if (!match) { results.push({ ...base, method: 'Masked pixel matching', reason: 'Not enough distinct opaque pixels to match reliably.' }); continue; }
      results.push({ ...base, method: 'Masked pixel matching', x: offsetX + (match.x / sx + asset.width * match.scale / 2) * sceneScale, y: offsetY + (match.y / sy + asset.height * match.scale / 2) * sceneScale, scale: match.scale * sceneScale, confidence: match.confidence, manual: match.manual, reason: `Pixel error ${(match.error * 100).toFixed(1)}%; separation ${(match.margin * 100).toFixed(1)}%.` });
    } catch { results.push({ ...base, method: 'Masked pixel matching', reason: 'Image decoding or pixel analysis failed.' }); }
  }
  return results;
}
