import { useEffect, useRef, useState } from 'react';
import { CompositionRenderer } from '../engine/CompositionRenderer';
import { COMPOSITION_HEIGHT, COMPOSITION_WIDTH } from '../types/project';
import { fitCompositionScale } from '../features/preview/fit';
import { useProjectStore } from '../store/project-store';
export function Preview() {
  const host = useRef<HTMLDivElement>(null); const viewport = useRef<HTMLDivElement>(null); const renderer = useRef<CompositionRenderer | null>(null); const [zoom, setZoom] = useState(1); const [fitScale, setFitScale] = useState(0);
  const project = useProjectStore((s) => s.project); const assets = useProjectStore((s) => s.assets); const selected = useProjectStore((s) => s.selectedLayerId);
  const referenceBlob = project.reference ? assets[project.reference.assetId]?.blob : undefined;
  const [referenceUrl, setReferenceUrl] = useState<string>();
  useEffect(() => { if (!referenceBlob) { setReferenceUrl(undefined); return; } const url = URL.createObjectURL(referenceBlob); setReferenceUrl(url); return () => URL.revokeObjectURL(url); }, [referenceBlob]);
  useEffect(() => { let alive = true; const instance = new CompositionRenderer((message) => useProjectStore.getState().setMessage(message)); renderer.current = instance; if (host.current) void instance.initialize(host.current).then(() => { if (alive) void instance.render(Object.values(useProjectStore.getState().project.layers).sort((a,b) => useProjectStore.getState().project.layerIds.indexOf(a.id) - useProjectStore.getState().project.layerIds.indexOf(b.id)), useProjectStore.getState().assets, useProjectStore.getState().selectedLayerId); }); return () => { alive = false; instance.destroy(); renderer.current = null; }; }, []);
  useEffect(() => { const instance = renderer.current; if (instance) void instance.render(project.layerIds.map((id) => project.layers[id]).filter(Boolean), assets, selected); }, [project, assets, selected]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setFitScale(fitCompositionScale(width, height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <section className="preview-area" aria-label="Composition preview"><div className="canvas-meta"><span>1920 × 1080 <i>·</i> 16:9</span><span>60 FPS</span></div><div className="canvas-viewport" ref={viewport}><div className="canvas-wrap" ref={host} style={{ width: COMPOSITION_WIDTH * fitScale * zoom, height: COMPOSITION_HEIGHT * fitScale * zoom }}>{referenceUrl && project.reference?.visible && <img className="reference-overlay" data-testid="reference-overlay" alt="Reference guide overlay" src={referenceUrl} style={{opacity: project.reference.opacity}}/>}{project.layerIds.length === 0 && <div className="canvas-empty"><span className="empty-spark">✳</span><strong>Your scene starts here</strong><span>Import images to begin arranging your composition.</span></div>}</div></div><div className="preview-footer"><span>Composition preview</span><div className="preview-zoom"><button type="button" onClick={() => setZoom(1)} aria-label="Fit composition to view">Fit to view</button><button type="button" aria-label="Zoom out" onClick={() => setZoom(z => Math.max(0.25, z / 1.25))}>−</button><span aria-label="Preview zoom">{Math.round(fitScale * zoom * 100)}%</span><button type="button" aria-label="Zoom in" onClick={() => setZoom(z => Math.min(4, z * 1.25))}>+</button></div></div></section>;
}
