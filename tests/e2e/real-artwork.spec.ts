import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const names = ['background.png', 'foreground.png', 'character.png', 'jungle.png'];
const files = names.map(name => path.resolve('test-images', name));
const row = (page: Page, name: string) => page.getByTestId('layer-row').filter({ has: page.getByText(name, { exact: true }) });

async function canvasScreenshot(page: Page) {
  return PNG.sync.read(await page.getByTestId('composition-canvas').screenshot());
}
function pixelDifference(a: PNG, b: PNG): number {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let changed = 0;
  for (let y = 3; y < a.height - 3; y += 2) for (let x = 3; x < a.width - 3; x += 2) {
    const i = (y * a.width + x) * 4;
    if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 24) changed++;
  }
  return changed;
}
async function savedState(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('storystudio-v2'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const tx = db.transaction(['projects', 'assets'], 'readonly');
    const all = <T,>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const projectsRequest = tx.objectStore('projects').getAll(); const assetsRequest = tx.objectStore('assets').getAll();
    const [projects, assets] = await Promise.all([all(projectsRequest), all(assetsRequest)]);
    db.close(); return { projects, assets: assets.map((asset: { id: string; name: string; blob: Blob }) => ({ id: asset.id, name: asset.name, size: asset.blob.size })) };
  });
}

test('actual artwork: import, render, arrange, duplicate and reopen', async ({ page }) => {
  test.setTimeout(120000);
  const missing = files.filter(file => !fs.existsSync(file));
  expect(missing, `Missing required real artwork: ${missing.join(', ')}`).toEqual([]);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');

  // Decode the actual files in the browser before exercising the importer.
  for (const file of files) {
    const base64 = fs.readFileSync(file).toString('base64');
    const decoded = await page.evaluate(async data => {
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      try { const image = new Image(); image.src = url; await image.decode(); return { width: image.naturalWidth, height: image.naturalHeight }; }
      finally { URL.revokeObjectURL(url); }
    }, base64);
    expect(decoded.width, `${path.basename(file)} browser decode width`).toBeGreaterThan(0);
    expect(decoded.height, `${path.basename(file)} browser decode height`).toBeGreaterThan(0);
  }

  await page.getByRole('button', { name: 'Untitled Story' }).click();
  await page.getByLabel('Project name').fill('Real artwork');
  await page.getByRole('button', { name: /Create new project/ }).click();
  await page.locator('input[type=file]').setInputFiles(files);
  await expect(page.getByTestId('layer-row')).toHaveCount(4, { timeout: 30000 });
  for (const name of names) {
    await expect(row(page, name)).toHaveCount(1);
    await expect(row(page, name).locator('img')).toHaveAttribute('src', /^data:image\/png/);
    await expect.poll(() => row(page, name).locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  await expect(page.getByTestId('layer-row').locator('strong')).toHaveText(names);
  // Neutral defaults regardless of filename. Scale may fit oversized artwork.
  for (const name of names) {
    await row(page, name).click();
    await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('960');
    await expect(page.getByLabel('Position Y', { exact: true })).toHaveValue('540');
    await expect(page.getByLabel('Rotation', { exact: true })).toHaveValue('0');
    await expect(page.getByLabel('Opacity', { exact: true })).toHaveValue('100');
    await expect(page.getByLabel('Layer depth', { exact: true })).toHaveValue('0');
    await expect(page.getByRole('switch', { name: 'Visible' })).toHaveAttribute('aria-checked', 'true');
  }

  // Isolate every actual image, and compare real browser-rendered canvas pixels
  // with the all-hidden composition. This catches a blank Pixi canvas.
  for (const name of names) await row(page, name).getByRole('button', { name: 'Hide layer' }).click();
  for (const name of names) {
    await row(page, name).click();
    const empty = await canvasScreenshot(page);
    await row(page, name).getByRole('button', { name: 'Show layer' }).click();
    await expect.poll(async () => pixelDifference(empty, await canvasScreenshot(page)), { timeout: 20000, message: `${name} should render real artwork pixels` }).toBeGreaterThan(2000);
    await row(page, name).getByRole('button', { name: 'Hide layer' }).click();
  }
  for (const name of names) await row(page, name).getByRole('button', { name: 'Show layer' }).click();

  await row(page, names[0]).click();
  await expect(page.getByRole('button', { name: 'Send Backward' })).toBeDisabled();
  await page.getByLabel('Position X', { exact: true }).fill('700');
  await page.getByLabel('Position Y', { exact: true }).fill('400');
  await page.getByRole('button', { name: 'Bring Forward' }).click();
  await expect(page.getByLabel('Layer name')).toHaveValue(names[0]);
  await expect(page.getByTestId('layer-row').locator('strong')).toHaveText([names[1], names[0], names[2], names[3]]);
  await page.getByRole('button', { name: 'Send Backward' }).click();
  await row(page, names[1]).click(); await page.getByLabel('Scale', { exact: true }).fill('0.75');
  await row(page, names[2]).click(); await page.getByLabel('Opacity', { exact: true }).fill('60');
  await row(page, names[3]).click(); await page.getByLabel('Rotation', { exact: true }).fill('12');
  await page.getByLabel('Layer depth', { exact: true }).fill('-7');
  await expect(page.getByRole('button', { name: 'Bring Forward' })).toBeDisabled();
  await page.getByRole('button', { name: 'Send Backward' }).click();
  await page.getByRole('button', { name: 'Duplicate Layer' }).click();
  const copy = `${names[3]} (Copy)`;
  await expect(page.getByLabel('Layer name')).toHaveValue(copy);
  await expect(page.getByLabel('Rotation', { exact: true })).toHaveValue('12');
  await expect(page.getByLabel('Layer depth', { exact: true })).toHaveValue('-7');
  await page.getByLabel('Rotation', { exact: true }).fill('23');
  await row(page, names[3]).click();
  await expect(page.getByLabel('Rotation', { exact: true })).toHaveValue('12');
  const order = [names[0], names[1], names[3], copy, names[2]];
  await expect(page.getByTestId('layer-row').locator('strong')).toHaveText(order);
  await page.screenshot({ path: 'screenshots/real-artwork-arrange.png', fullPage: true });
  await row(page, names[1]).getByRole('button', { name: 'Hide layer' }).click();
  await page.getByRole('button', { name: /Save/ }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  const saved = await savedState(page);
  expect(saved.assets).toHaveLength(4);
  expect(saved.assets.every((asset: { size: number }) => asset.size > 0)).toBe(true);
  const project = saved.projects.find((item: { name: string }) => item.name === 'Real artwork');
  expect(project.layers[project.layerIds[2]].assetId).toBe(project.layers[project.layerIds[3]].assetId);
  expect(project.layerIds[2]).not.toBe(project.layerIds[3]);
  await page.reload();
  await expect(page.getByTestId('layer-row')).toHaveCount(5, { timeout: 30000 });
  await page.getByRole('button', { name: 'Real artwork' }).click();
  await page.getByRole('button', { name: /Real artwork/ }).last().click();
  await expect(page.getByTestId('layer-row').locator('strong')).toHaveText(order);
  await row(page, names[0]).click(); await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('700'); await expect(page.getByLabel('Position Y', { exact: true })).toHaveValue('400');
  await row(page, names[1]).click(); await expect(page.getByLabel('Scale', { exact: true })).toHaveValue('0.75');
  await expect(page.getByRole('switch', { name: 'Visible' })).toHaveAttribute('aria-checked', 'false');
  await row(page, names[2]).click(); await expect(page.getByLabel('Opacity', { exact: true })).toHaveValue('60');
  await row(page, names[3]).click(); await expect(page.getByLabel('Rotation', { exact: true })).toHaveValue('12'); await expect(page.getByLabel('Layer depth', { exact: true })).toHaveValue('-7');
  await row(page, copy).click(); await expect(page.getByLabel('Rotation', { exact: true })).toHaveValue('23');
  await expect(page.getByTestId('layer-row').locator('img')).toHaveCount(5);
  // Verify original artwork actually renders again from the reopened IndexedDB blob.
  for (const name of [names[0], names[2], names[3], copy]) await row(page, name).getByRole('button', { name: 'Hide layer' }).click();
  await row(page, names[1]).click();
  await page.waitForTimeout(500);
  const reopenedEmpty = await canvasScreenshot(page);
  await row(page, names[1]).getByRole('button', { name: 'Show layer' }).click();
  await expect.poll(async () => pixelDifference(reopenedEmpty, await canvasScreenshot(page)), { timeout: 20000 }).toBeGreaterThan(2000);
  expect(errors).toEqual([]);
});
