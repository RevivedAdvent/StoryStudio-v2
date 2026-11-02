import type { ImageAsset, Layer, Project, StoredAsset } from '../../types/project';
import { createLayer } from '../layers/layer-operations';
import { COMPOSITION_HEIGHT, COMPOSITION_WIDTH } from '../../types/project';
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
export class ImageImportError extends Error {}
export async function importImages(files: File[]): Promise<{ assets: StoredAsset[]; layers: Layer[] }> {
  const assets: StoredAsset[] = []; const layers: Layer[] = [];
  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) throw new ImageImportError(`${file.name}: choose a PNG, JPG, or WebP image.`);
    if (!file.size) throw new ImageImportError(`${file.name}: this file is empty.`);
    const dimensions = await readDimensions(file);
    const scale = Math.min(1, COMPOSITION_WIDTH / dimensions.width, COMPOSITION_HEIGHT / dimensions.height);
    const asset: StoredAsset = { id: crypto.randomUUID(), name: file.name, mimeType: file.type, width: dimensions.width, height: dimensions.height, thumbnail: await makeThumbnail(file, dimensions.width, dimensions.height), blob: file };
    const layer = createLayer({ name: file.name, assetId: asset.id, width: dimensions.width, height: dimensions.height, x: COMPOSITION_WIDTH / 2, y: COMPOSITION_HEIGHT / 2, scale, rotation: 0, opacity: 1, visible: true, locked: false, depth: 0 });
    assets.push(asset); layers.push(layer);
  }
  return { assets, layers };
}
function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => { const url = URL.createObjectURL(file); const image = new Image(); image.onload = () => { URL.revokeObjectURL(url); resolve({ width: image.naturalWidth, height: image.naturalHeight }); }; image.onerror = () => { URL.revokeObjectURL(url); reject(new ImageImportError(`${file.name}: this image could not be opened.`)); }; image.src = url; });
}
async function makeThumbnail(file: File, width: number, height: number): Promise<string> {
  const url = URL.createObjectURL(file);
  try { const image = new Image(); image.src = url; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = 96; canvas.height = 64; const context = canvas.getContext('2d'); if (context) { const scale = Math.min(96 / width, 64 / height); context.drawImage(image, (96 - width * scale) / 2, (64 - height * scale) / 2, width * scale, height * scale); } return canvas.toDataURL('image/png'); } finally { URL.revokeObjectURL(url); }
}
export function appendLayers(project: Project, layers: Layer[]): Project { const records = { ...project.layers }; for (const layer of layers) records[layer.id] = layer; return { ...project, layers: records, layerIds: [...project.layerIds, ...layers.map((layer) => layer.id)] }; }
export type { ImageAsset };
