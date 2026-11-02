import { getDatabase } from './database';
import type { Project, StoredAsset } from '../types/project';
export async function saveProject(project: Project, assets: StoredAsset[]): Promise<void> {
  const db = await getDatabase(); const tx = db.transaction(['projects', 'assets'], 'readwrite');
  await tx.objectStore('projects').put(project); for (const asset of assets) await tx.objectStore('assets').put(asset); await tx.done;
}
export async function loadProject(id: string): Promise<{ project: Project; assets: StoredAsset[] } | undefined> {
  const db = await getDatabase(); const project = await db.get('projects', id); if (!project) return undefined;
  const assets: StoredAsset[] = []; const ids = new Set<string>(); for (const layerId of project.layerIds) { const layer = project.layers[layerId]; if (!layer || ids.has(layer.assetId)) continue; ids.add(layer.assetId); const asset = await db.get('assets', layer.assetId); if (asset) assets.push(asset); }
  const referenceId = project.reference?.assetId;
  if (referenceId && !ids.has(referenceId)) { const reference = await db.get('assets', referenceId); if (reference) assets.push(reference); }
  return { project, assets };
}
export async function listProjects(): Promise<Project[]> { return (await getDatabase()).getAll('projects'); }
export { resetDatabaseConnection } from './database';
export async function removeAssetIfUnused(assetId: string, project: Project): Promise<void> { if (project.reference?.assetId === assetId || Object.values(project.layers).some((layer) => layer.assetId === assetId)) return; await (await getDatabase()).delete('assets', assetId); }
