import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

function image(r: number, g: number, b: number, halfTransparent = false): Buffer {
  const png = new PNG({ width: 700, height: 500 });
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4;
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = halfTransparent && x >= png.width / 2 ? 0 : 255;
  }
  return PNG.sync.write(png);
}
async function pixel(page: Page, compositionX: number, compositionY: number): Promise<number[]> {
  const png = PNG.sync.read(await page.getByTestId('composition-canvas').screenshot());
  const x = Math.floor(compositionX / 1920 * png.width), y = Math.floor(compositionY / 1080 * png.height);
  const i = (y * png.width + x) * 4;
  return Array.from(png.data.subarray(i, i + 3));
}
const red = (rgb: number[]) => rgb[0] > 200 && rgb[1] < 50 && rgb[2] < 50;
const blue = (rgb: number[]) => rgb[2] > 200 && rgb[0] < 50 && rgb[1] < 50;

test('renderer respects stacking, transparency, edits and deletion of a duplicate', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles([
    { name: 'red.png', mimeType: 'image/png', buffer: image(240, 10, 10) },
    { name: 'blue.png', mimeType: 'image/png', buffer: image(10, 10, 240, true) },
  ]);
  await expect(page.getByTestId('layer-row')).toHaveCount(2);
  // Blue is in front, but its right half is transparent so red shows through.
  await expect.poll(async () => blue(await pixel(page, 800, 540))).toBe(true);
  await expect.poll(async () => red(await pixel(page, 1120, 540))).toBe(true);
  await page.getByText('red.png', { exact: true }).click();
  await page.getByRole('button', { name: 'Bring Forward' }).click();
  await expect.poll(async () => red(await pixel(page, 800, 540))).toBe(true);
  await expect(page.getByLabel('Layer name')).toHaveValue('red.png');
  // Exercise property edits against actual pixels, not just input values.
  await page.getByTestId('layer-row').filter({ hasText: 'blue.png' }).getByRole('button', { name: 'Hide layer' }).click();
  await page.getByLabel('Position X', { exact: true }).fill('400');
  await expect.poll(async () => red(await pixel(page, 960, 540))).toBe(false);
  await page.getByLabel('Position X', { exact: true }).fill('960');
  await expect.poll(async () => red(await pixel(page, 1200, 540))).toBe(true);
  await page.getByLabel('Scale', { exact: true }).fill('0.5');
  await expect.poll(async () => red(await pixel(page, 1200, 540))).toBe(false);
  await page.getByLabel('Scale', { exact: true }).fill('1');
  await expect.poll(async () => red(await pixel(page, 960, 850))).toBe(false);
  await page.getByLabel('Rotation', { exact: true }).fill('90');
  await expect.poll(async () => red(await pixel(page, 960, 850))).toBe(true);
  await page.getByLabel('Rotation', { exact: true }).fill('0');
  await page.getByLabel('Opacity', { exact: true }).fill('50');
  await expect.poll(async () => { const p = await pixel(page, 960, 540); return p[0] > 100 && p[0] < 220; }).toBe(true);
  await page.getByLabel('Opacity', { exact: true }).fill('100');
  await page.getByLabel('Layer depth', { exact: true }).fill('25');
  await expect.poll(async () => red(await pixel(page, 960, 540))).toBe(true);
  await page.getByTestId('layer-row').filter({ hasText: 'blue.png' }).getByRole('button', { name: 'Show layer' }).click();
  await page.getByRole('button', { name: 'Send Backward' }).click();
  await expect.poll(async () => blue(await pixel(page, 800, 540))).toBe(true);
  await page.getByRole('button', { name: 'Duplicate Layer' }).click();
  await expect(page.getByLabel('Layer name')).toHaveValue('red.png (Copy)');
  await page.getByLabel('Position X', { exact: true }).fill('400');
  await page.getByText('red.png', { exact: true }).click();
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('960');
  await page.getByText('red.png (Copy)', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete Layer' }).click();
  await expect(page.getByTestId('layer-row')).toHaveCount(2);
  await expect.poll(async () => blue(await pixel(page, 800, 540))).toBe(true);
  await expect.poll(async () => red(await pixel(page, 1120, 540))).toBe(true);
  expect(errors).toEqual([]);
});
