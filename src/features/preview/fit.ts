import { COMPOSITION_HEIGHT, COMPOSITION_WIDTH } from '../../types/project';

/** The viewport has a small inset so that the composition border and shadow remain visible. */
export function fitCompositionScale(width: number, height: number): number {
  return Math.max(0, Math.min((width - 12) / COMPOSITION_WIDTH, (height - 12) / COMPOSITION_HEIGHT));
}

export function fitLayerScale(width: number, height: number, compositionWidth: number, compositionHeight: number, mode: 'contain' | 'cover'): number {
  const scales = [compositionWidth / width, compositionHeight / height];
  return mode === 'contain' ? Math.min(...scales) : Math.max(...scales);
}
