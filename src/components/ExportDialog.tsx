import { useEffect, useRef, useState } from 'react';
import { CompositionRenderer } from '../engine/CompositionRenderer';
import { useProjectStore } from '../store/project-store';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const [duration, setDuration] = useState(5);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [download, setDownload] = useState('');
  const downloadRef = useRef('');
  useEffect(() => () => { if (downloadRef.current) URL.revokeObjectURL(downloadRef.current); }, []);
  async function start() {
    if (!Number.isInteger(duration) || duration < 1 || duration > 30) { setMessage('Duration must be a whole number from 1 to 30 seconds.'); return; }
    if (downloadRef.current) { URL.revokeObjectURL(downloadRef.current); downloadRef.current = ''; setDownload(''); }
    setBusy(true); setProgress(0); setMessage('Rendering the composition…');
    const errors: string[] = [];
    const renderer = new CompositionRenderer(error => errors.push(error));
    try {
      const { project, assets } = useProjectStore.getState();
      const layers = project.layerIds.map(id => project.layers[id]).filter(Boolean);
      await renderer.initialize(document.createElement('div'));
      await renderer.render(layers, assets, null);
      if (errors.length) throw new Error(errors.join(' '));
      const png = await renderer.exportPng();
      setMessage('Encoding and verifying the MP4…');
      const response = await fetch(`/api/export?duration=${duration}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: png });
      if (!response.ok || !response.body) throw new Error(`Export service unavailable: ${await response.text()}. Start with npm run studio.`);
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let pending = '', complete = false;
      while (true) {
        const { done, value } = await reader.read();
        pending += decoder.decode(value, { stream: !done });
        const lines = pending.split('\n'); pending = lines.pop() ?? '';
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.type === 'error') throw new Error(event.message);
          if (event.type === 'progress') setProgress(event.percent);
          if (event.type === 'complete') {
            const raw = atob(event.video); const bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
            const url = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
            downloadRef.current = url; setDownload(url); setProgress(100); complete = true;
            setMessage('Export complete. FFprobe verified the video.');
          }
        }
        if (done) break;
      }
      if (!complete) throw new Error('The export service disconnected before completion.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Export failed.'); }
    finally { renderer.destroy(); setBusy(false); }
  }
  return <div className="modal-backdrop"><section className="project-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
    <button className="dialog-close" aria-label="Close export" onClick={onClose} disabled={busy}>×</button>
    <h2 id="export-title">Export static composition</h2>
    <p>MP4 · H.264 · 1920 × 1080 · 60 FPS. Animation is not included. Transparent areas are black.</p>
    <label>Duration in seconds <input type="number" aria-label="Export duration" min="1" max="30" step="1" value={duration} disabled={busy} onChange={e=>setDuration(Number(e.target.value))}/></label>
    <button className="dialog-create" type="button" disabled={busy} onClick={() => void start()}>{busy ? 'Exporting…' : 'Export MP4'}</button>
    {(busy || progress > 0) && <progress max="100" value={progress} aria-label="Export progress"/>}
    {message && <p role="status">{message}</p>}
    {download && <a href={download} download="storystudio.mp4">Download MP4</a>}
  </section></div>;
}
