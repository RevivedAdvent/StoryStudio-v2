export const PROJECT_FORMAT_VERSION = 1;
export const COMPOSITION_WIDTH = 1920;
export const COMPOSITION_HEIGHT = 1080;
export const FRAME_RATE = 60;

export interface ImageAsset { id: string; name: string; mimeType: string; width: number; height: number; thumbnail: string; }
export interface Layer {
  id: string; name: string; assetId: string; width: number; height: number;
  x: number; y: number; scale: number; rotation: number; opacity: number;
  visible: boolean; locked: boolean; depth: number;
}
export interface Project {
  id: string; name: string; formatVersion: number; width: number; height: number;
  frameRate: number; layerIds: string[]; layers: Record<string, Layer>; createdAt: number; updatedAt: number;
  /** Optional for compatibility with projects saved before reference guides existed. */
  reference?: { assetId: string; visible: boolean; opacity: number };
}
export interface StoredAsset extends ImageAsset { blob: Blob; }
export interface ProjectBundle { project: Project; assets: StoredAsset[]; }
