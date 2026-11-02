import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The app and export API share one loopback origin. No arbitrary paths, codec
// options, or output names are accepted from the browser.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const port = Number(process.env.STORYSTUDIO_PORT ?? 4280);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid STORYSTUDIO_PORT');
const host = `127.0.0.1:${port}`;
let active = false;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
function fail(res, code, message) { res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' }); res.end(message); }
function run(command, args, onData, onSpawn) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    onSpawn?.(child);
    let output = '', error = '';
    child.stdout.on('data', data => { const text = data.toString(); output = (output + text).slice(-1024 * 1024); onData?.(text); });
    child.stderr.on('data', data => { error = (error + data.toString()).slice(-16000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(`${command} failed (${code}): ${error}`)));
  });
}
async function exportVideo(req, res, url) {
  if (req.headers.origin !== `http://${host}` || req.headers['content-type'] !== 'image/png') return fail(res, 403, 'Invalid origin or content type.');
  const duration = Number(url.searchParams.get('duration'));
  if (!Number.isInteger(duration) || duration < 1 || duration > 30) return fail(res, 400, 'Duration must be a whole number from 1 to 30 seconds.');
  if (active) return fail(res, 429, 'Another export is running.');
  active = true;
  let dir; let child; let disconnected = false;
  res.on('close', () => { if (!res.writableEnded) { disconnected = true; child?.kill('SIGTERM'); } });
  try {
    let size = 0; const parts = [];
    for await (const part of req) { size += part.length; if (size > 32 * 1024 * 1024) throw new Error('PNG exceeds 32 MiB.'); parts.push(part); }
    const png = Buffer.concat(parts);
    if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || png.toString('ascii',12,16) !== 'IHDR' || png.readUInt32BE(16) !== 1920 || png.readUInt32BE(20) !== 1080) throw new Error('Expected a 1920 × 1080 PNG.');
    dir = await mkdtemp(path.join(tmpdir(), 'storystudio-export-'));
    const input = path.join(dir, 'frame.png'), output = path.join(dir, 'video.mp4');
    await writeFile(input, png, { flag: 'wx' });
    res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    const frames = duration * 60;
    const send = value => { if (!disconnected) res.write(JSON.stringify(value) + '\n'); };
    send({ type: 'progress', percent: 0 });
    let remainder = '';
    await run('ffmpeg', ['-hide_banner','-loglevel','error','-y','-loop','1','-framerate','60','-i',input,'-frames:v',String(frames),'-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-threads','4','-movflags','+faststart','-progress','pipe:1','-nostats',output], text => {
      remainder += text; const lines = remainder.split('\n'); remainder = lines.pop() ?? '';
      for (const line of lines) if (line.startsWith('frame=')) send({ type: 'progress', percent: Math.min(99, Math.floor(Number(line.slice(6)) / frames * 100)) });
    }, process => { child = process; if (disconnected) child.kill('SIGTERM'); });
    const probe = JSON.parse(await run('ffprobe', ['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=codec_name,width,height,r_frame_rate,nb_read_frames,duration:format=format_name,duration','-of','json',output], undefined, process => { child = process; if (disconnected) child.kill('SIGTERM'); }));
    const stream = probe.streams?.[0];
    const actualDuration = Number(probe.format?.duration);
    if (stream?.codec_name !== 'h264' || stream.width !== 1920 || stream.height !== 1080 || stream.r_frame_rate !== '60/1' || Number(stream.nb_read_frames) !== frames || !Number.isFinite(actualDuration) || Math.abs(actualDuration - duration) > 0.05 || !String(probe.format?.format_name).split(',').includes('mp4')) throw new Error('FFprobe did not confirm the requested output settings.');
    const mp4 = await readFile(output);
    if (mp4.length > 128 * 1024 * 1024) throw new Error('Encoded video exceeds the download limit.');
    send({ type: 'complete', percent: 100, probe, video: mp4.toString('base64') });
    res.end();
  } catch (error) {
    if (!res.headersSent) fail(res, 400, error instanceof Error ? error.message : 'Export failed.');
    else if (!disconnected) { res.write(JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Export failed.' }) + '\n'); res.end(); }
  } finally { child = undefined; if (dir) await rm(dir, { recursive: true, force: true }); active = false; }
}
const server = http.createServer(async (req, res) => {
  if (req.headers.host !== host) return fail(res, 403, 'Invalid host.');
  const url = new URL(req.url ?? '/', `http://${host}`);
  if (url.pathname === '/api/export' && req.method === 'POST') return void exportVideo(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Method not allowed.');
  try {
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(root + path.sep)) return fail(res, 403, 'Invalid path.');
    const contents = await readFile(filename);
    res.writeHead(200, { 'content-type': types[path.extname(filename)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : contents);
  } catch { fail(res, 404, 'Not found. Run npm run build before starting StoryStudio.'); }
});
server.listen(port, '127.0.0.1', () => console.log(`StoryStudio: http://${host}`));
