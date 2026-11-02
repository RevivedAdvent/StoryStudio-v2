import { expect, test } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';

test('export service rejects foreign origins and invalid requests', async ({ request }) => {
  const denied = await request.post('/api/export?duration=5', { headers: { origin: 'http://example.invalid', 'content-type': 'image/png' }, data: Buffer.from('not a PNG') });
  expect(denied.status()).toBe(403);
  const invalid = await request.post('/api/export?duration=0', { headers: { origin: `http://127.0.0.1:${process.env.STORYSTUDIO_EXPORT_TEST_PORT ?? 4281}`, 'content-type': 'image/png' }, data: Buffer.from('not a PNG') });
  expect(invalid.status()).toBe(400);
});

test('exports the real Pixi composition as a verified five-second MP4', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(['background.png','foreground.png','character.png','jungle.png'].map(n => path.resolve('test-images', n)));
  await expect(page.getByTestId('layer-row')).toHaveCount(4);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Set as Reference' }).click();
  await (await chooser).setFiles(path.resolve('test-images/reference.png'));
  await page.getByRole('button', { name: 'Arrange Layers' }).click();
  await expect(page.getByText('Arrangement results (4 analysed)')).toBeVisible({ timeout: 90_000 });
  const report = await page.locator('.alignment-controls li').allTextContents();
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'Apply reliable proposals' }).click();
  await expect(page.getByText('Proposals applied.', { exact: false })).toBeVisible();
  // Deliberately try the low-confidence candidates as manual edits, then compare
  // the complete output against the reference separately. They are not auto-applied.
  for (const entry of report.filter(text => text.includes('Manual adjustment recommended'))) {
    const match = entry.match(/^(.+?):.*Candidate: X (-?\d+), Y (-?\d+), scale ([\d.]+)/);
    if (!match) continue;
    await page.getByTestId('layer-row').filter({ hasText: match[1] }).click();
    await page.getByLabel('Position X', { exact: true }).fill(match[2]);
    await page.getByLabel('Position Y', { exact: true }).fill(match[3]);
    await page.getByLabel('Scale', { exact: true }).fill(match[4]);
    console.log(`Manual candidate tried: ${match[1]} x=${match[2]} y=${match[3]} scale=${match[4]}`);
  }
  await page.getByRole('button', { name: /Save/ }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.getByLabel('Show reference overlay').uncheck();
  await page.waitForTimeout(1000);
  // MP4 has an opaque black background, so compare against the preview on black,
  // not against its editor-only checkerboard.
  await page.locator('.canvas-wrap').evaluate(el => { (el as HTMLElement).style.backgroundImage = 'none'; (el as HTMLElement).style.backgroundColor = '#000'; });
  const preview = PNG.sync.read(await page.getByTestId('composition-canvas').screenshot());
  await page.screenshot({ path: 'screenshots/export-composition.png', fullPage: true });
  await page.locator('.canvas-wrap').evaluate(el => { (el as HTMLElement).style.backgroundImage = ''; (el as HTMLElement).style.backgroundColor = ''; });
  // Turn the guide back on: the exported pixels must still be the actual composition.
  await page.getByLabel('Show reference overlay').check();
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByLabel('Export duration')).toHaveValue('5');
  await page.getByRole('button', { name: 'Export MP4' }).click();
  await expect(page.getByText('Export complete. FFprobe verified the video.')).toBeVisible({ timeout: 150_000 });
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download MP4' }).click();
  const file = path.resolve('screenshots/sample-static.mp4');
  await (await download).saveAs(file);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=codec_name,width,height,r_frame_rate,nb_read_frames,duration:format=format_name,duration','-of','json',file], { encoding:'utf8' }));
  console.log('FFprobe:', JSON.stringify(probe));
  expect(probe.streams[0]).toMatchObject({ codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '60/1', nb_read_frames: '300' });
  expect(Number(probe.format.duration)).toBeCloseTo(5, 1);
  const extracted = path.resolve('screenshots/sample-first-frame.png');
  execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-y','-i',file,'-frames:v','1',extracted]);
  const frame = PNG.sync.read(fs.readFileSync(extracted));
  expect([frame.width, frame.height]).toEqual([1920, 1080]);
  let error = 0, count = 0;
  for (let y = 4; y < preview.height - 4; y += 3) for (let x = 4; x < preview.width - 4; x += 3) {
    const i = (y * preview.width + x) * 4;
    const fx = Math.floor((x + 0.5) * frame.width / preview.width), fy = Math.floor((y + 0.5) * frame.height / preview.height);
    const j = (fy * frame.width + fx) * 4;
    for (let c = 0; c < 3; c++) error += Math.abs(preview.data[i + c] - frame.data[j + c]);
    count += 3;
  }
  const mae = error / count; console.log('Preview/video RGB mean absolute error:', mae);
  expect(mae).toBeLessThan(12);
  expect(errors).toEqual([]);
});
