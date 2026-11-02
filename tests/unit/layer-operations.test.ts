import { describe, expect, it } from 'vitest';
import type { Layer, Project } from '../../src/types/project';
import { createLayer, deleteLayer, duplicateLayer, moveLayer, renameLayer, reorderLayer, updateLayer } from '../../src/features/layers/layer-operations';
const seed = (id: string): Layer => createLayer({ name: id, assetId: 'asset', width: 200, height: 100, x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, visible: true, locked: false, depth: 0 }, id);
const project = (): Project => { const a = seed('a'), b = seed('b'); return { id: 'p', name: 'Test', formatVersion: 1, width: 1920, height: 1080, frameRate: 60, layerIds: ['a', 'b'], layers: { a, b }, createdAt: 1, updatedAt: 1 }; };
describe('layer operations', () => {
 it('creates layers with unique stable ids', () => { expect(createLayer(seed('x'))).not.toHaveProperty('id', 'x'); expect(createLayer(seed('x')).id).not.toBe(createLayer(seed('x')).id); });
 it('renames layers but preserves on empty input', () => { expect(renameLayer(project(), 'a', 'Forest').layers.a.name).toBe('Forest'); expect(renameLayer(project(), 'a', ' ').layers.a.name).toBe('a'); });
 it('reorders layers consistently', () => { expect(moveLayer(project(), 'a', 1).layerIds).toEqual(['b', 'a']); expect(reorderLayer(project(), 'a', 99).layerIds).toEqual(['b', 'a']); });
 it('stops at either end without changing the project', () => { const p = project(); expect(moveLayer(p, 'a', -1)).toBe(p); expect(moveLayer(p, 'b', 1)).toBe(p); expect(moveLayer(p, 'missing', 1)).toBe(p); });
 it('duplicates an independent layer directly in front while reusing its asset', () => { const p = updateLayer(project(), 'a', { x: 123, y: 45, scale: 2, rotation: 14, opacity: 0.4, depth: -5, visible: false, locked: true }); const result = duplicateLayer(p, 'a', 'copy')!; expect(result.project.layerIds).toEqual(['a', 'copy', 'b']); expect(result.project.layers.copy).toEqual({ ...p.layers.a, id: 'copy', name: 'a (Copy)' }); const changed = updateLayer(result.project, 'copy', { x: 999 }); expect(changed.layers.a.x).toBe(123); const deleted = deleteLayer(changed, 'copy'); expect(deleted.layers.a).toEqual(p.layers.a); expect(duplicateLayer(p, 'missing')).toBeUndefined(); expect(duplicateLayer(p, 'a', 'b')).toBeUndefined(); });
 it('updates transforms and clamps opacity and scale', () => { const next = updateLayer(project(), 'a', { x: 40, y: 50, rotation: 14, scale: 0, opacity: 2, depth: -4 }); expect(next.layers.a).toMatchObject({ x: 40, y: 50, rotation: 14, scale: .01, opacity: 1, depth: -4 }); expect(project().layers.b.x).toBe(0); });
 it('toggles visibility and lock state', () => { expect(updateLayer(project(), 'a', { visible: false, locked: true }).layers.a).toMatchObject({ visible: false, locked: true }); });
 it('deletes only the requested layer', () => { const next = deleteLayer(project(), 'a'); expect(next.layerIds).toEqual(['b']); expect(next.layers.a).toBeUndefined(); });
 it('leaves project intact for unknown layer operations', () => { expect(deleteLayer(project(), 'missing').layerIds).toEqual(['a','b']); });
});
