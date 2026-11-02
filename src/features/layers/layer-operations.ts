import type { Layer, Project } from '../../types/project';

export function createLayer(input: Omit<Layer, 'id'>, id: string = crypto.randomUUID()): Layer { return { ...input, id }; }
export function renameLayer(project: Project, id: string, name: string): Project { const layer = project.layers[id]; if (!layer) return project; return { ...project, layers: { ...project.layers, [id]: { ...layer, name: name.trim() || layer.name } } }; }
export function updateLayer(project: Project, id: string, patch: Partial<Omit<Layer, 'id' | 'assetId'>>): Project {
  const layer = project.layers[id]; if (!layer) return project;
  const next = { ...layer, ...patch };
  next.opacity = clamp(next.opacity, 0, 1); next.scale = clamp(next.scale, 0.01, 20);
  next.x = finite(next.x, layer.x); next.y = finite(next.y, layer.y); next.rotation = finite(next.rotation, layer.rotation); next.depth = finite(next.depth, layer.depth);
  return { ...project, layers: { ...project.layers, [id]: next } };
}
export function reorderLayer(project: Project, id: string, toIndex: number): Project {
  const from = project.layerIds.indexOf(id); if (from < 0) return project;
  const ids = [...project.layerIds]; ids.splice(from, 1); ids.splice(Math.max(0, Math.min(toIndex, ids.length)), 0, id); return { ...project, layerIds: ids };
}
export function moveLayer(project: Project, id: string, direction: -1 | 1): Project { const i = project.layerIds.indexOf(id); if (i < 0 || i + direction < 0 || i + direction >= project.layerIds.length) return project; return reorderLayer(project, id, i + direction); }
export function duplicateLayer(project: Project, id: string, newId: string = crypto.randomUUID()): { project: Project; layerId: string } | undefined {
  const original = project.layers[id]; const index = project.layerIds.indexOf(id);
  if (!original || index < 0 || project.layers[newId]) return undefined;
  const copy = { ...original, id: newId, name: `${original.name} (Copy)` };
  const layerIds = [...project.layerIds]; layerIds.splice(index + 1, 0, newId);
  return { project: { ...project, layerIds, layers: { ...project.layers, [newId]: copy } }, layerId: newId };
}
export function deleteLayer(project: Project, id: string): Project { if (!project.layers[id]) return project; const layers = { ...project.layers }; delete layers[id]; return { ...project, layers, layerIds: project.layerIds.filter((layerId) => layerId !== id) }; }
export function clamp(value: number, min: number, max: number): number { return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min; }
function finite(value: number, fallback: number): number { return Number.isFinite(value) ? value : fallback; }
