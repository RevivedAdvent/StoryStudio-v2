import { useState } from 'react';
import { analyseReference, type AlignmentResult } from '../features/reference/analyse';
import { useProjectStore } from '../store/project-store';
import type { Project } from '../types/project';

type Transform = { id: string; x: number; y: number; scale: number; rotation: number };
function signature(project: Project): string {
  return JSON.stringify([project.id, project.reference?.assetId, project.layerIds, project.layerIds.map(id => project.layers[id])]);
}
export function ReferenceAlignment() {
  const project = useProjectStore(s => s.project);
  const [results, setResults] = useState<AlignmentResult[]>([]);
  const [analysed, setAnalysed] = useState('');
  const [previous, setPrevious] = useState<Transform[]>([]);
  const [previousProject, setPreviousProject] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function analyse() {
    const state = useProjectStore.getState();
    if (!state.project.reference) { setError('Set a reference image first.'); return; }
    setBusy(true); setError(''); setResults([]);
    try { const items = await analyseReference(state.project, state.assets); setResults(items); setAnalysed(signature(state.project)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not analyse images.'); }
    finally { setBusy(false); }
  }
  function apply() {
    const current = useProjectStore.getState().project;
    if (signature(current) !== analysed) { setError('The scene changed since analysis. Analyse again before applying.'); return; }
    const eligible = results.filter(r => !r.manual && !current.layers[r.layerId]?.locked);
    if (!eligible.length) { setError('No sufficiently reliable matches to apply. Adjust the layers manually.'); return; }
    if (!window.confirm(`Apply ${eligible.length} proposed layer transform(s)? Previous transforms can be restored.`)) return;
    const old = eligible.map(r => { const l = current.layers[r.layerId]; return { id: l.id, x: l.x, y: l.y, scale: l.scale, rotation: l.rotation }; });
    for (const result of eligible) useProjectStore.getState().update(result.layerId, { x: result.x, y: result.y, scale: result.scale, rotation: 0 });
    setPrevious(old); setPreviousProject(current.id); setAnalysed(''); setError('Proposals applied. Manual adjustments can be made using layer properties.');
  }
  function restore() {
    if (useProjectStore.getState().project.id !== previousProject) return;
    if (!window.confirm('Restore transforms from before the last arrangement? Subsequent transform edits to those layers will be replaced.')) return;
    for (const { id, ...transform } of previous) {
      const layer = useProjectStore.getState().project.layers[id];
      if (layer && !layer.locked) useProjectStore.getState().update(id, transform);
    }
    setPrevious([]); setError('Previous unlocked layer transforms restored.');
  }
  return <div className="alignment-controls">
    <button type="button" onClick={() => void analyse()} disabled={busy}>{busy ? 'Analysing…' : 'Arrange Layers'}</button>
    {results.length > 0 && <><strong>Arrangement results ({results.length} analysed)</strong><ul>{results.map(result => <li key={result.layerId}><b>{result.name}</b>: {result.manual ? 'Manual adjustment recommended' : result.method} · {Math.round(result.confidence * 100)}%<small>{result.reason}</small>{result.confidence > 0 && <small>Candidate: X {Math.round(result.x)}, Y {Math.round(result.y)}, scale {result.scale.toFixed(2)}</small>}</li>)}</ul><button type="button" onClick={apply} disabled={!analysed}>Apply reliable proposals</button></>}
    {previous.length > 0 && previousProject === project.id && <button type="button" onClick={restore}>Restore previous transforms</button>}
    {error && <p role="status">{error}</p>}
  </div>;
}
