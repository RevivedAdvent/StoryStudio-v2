import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProject, useProjectStore } from '../../src/store/project-store';
import type { Layer, StoredAsset } from '../../src/types/project';

const layer: Layer = { id: 'one', name: 'Scene.png', assetId: 'asset', width: 100, height: 50, x: 33, y: 44, scale: 1.25, rotation: 25, opacity: .3, visible: false, locked: false, depth: 7 };
const asset: StoredAsset = { id: 'asset', name: 'Scene.png', mimeType: 'image/png', width: 100, height: 50, thumbnail: '', blob: new Blob(['test']) };
beforeEach(() => useProjectStore.getState().setProject({ ...emptyProject(), layerIds: [layer.id], layers: { [layer.id]: layer } }, [asset]));
describe('duplication state', () => {
  it('shares the asset, selects the copy, and keeps both layers independent', () => {
    useProjectStore.getState().duplicate('one');
    const state = useProjectStore.getState(); const copyId = state.selectedLayerId!;
    expect(copyId).not.toBe('one'); expect(state.project.layerIds).toEqual(['one', copyId]);
    expect(state.project.layers[copyId]).toEqual({ ...layer, id: copyId, name: 'Scene.png (Copy)' });
    expect(Object.keys(state.assets)).toEqual(['asset']);
    state.update(copyId, { x: 200, opacity: 1 });
    expect(useProjectStore.getState().project.layers.one).toEqual(layer);
    useProjectStore.getState().remove(copyId);
    expect(useProjectStore.getState().project.layers.one).toEqual(layer);
    expect(useProjectStore.getState().assets.asset).toBe(asset);
  });
  it('keeps selection after moving and prevents out-of-bound moves', () => {
    useProjectStore.getState().duplicate('one'); const id = useProjectStore.getState().selectedLayerId!;
    useProjectStore.getState().move(id, 1); expect(useProjectStore.getState().project.layerIds).toEqual(['one', id]);
    useProjectStore.getState().move(id, -1); expect(useProjectStore.getState().project.layerIds).toEqual([id, 'one']);
    expect(useProjectStore.getState().selectedLayerId).toBe(id);
  });
});
