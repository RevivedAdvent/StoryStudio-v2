import { expect, test } from '@playwright/test';
import path from 'node:path';

test('preview fit follows available space without changing scene; layer fit is separate', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(path.resolve('test-images/character.png'));
  await expect(page.getByTestId('layer-row')).toHaveCount(1);
  const canvas = page.getByTestId('composition-canvas');
  const viewport = page.locator('.canvas-viewport');
  async function dimensions() {
    const canvasBox = await canvas.boundingBox(); const viewportBox = await viewport.boundingBox();
    expect(canvasBox).not.toBeNull(); expect(viewportBox).not.toBeNull();
    return { canvas: canvasBox!, viewport: viewportBox! };
  }
  const before = await dimensions();
  expect(before.canvas.width).toBeLessThanOrEqual(before.viewport.width);
  expect(before.canvas.height).toBeLessThanOrEqual(before.viewport.height);
  expect(before.canvas.width / before.canvas.height).toBeCloseTo(16 / 9, 1);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(async () => (await dimensions()).canvas.width).toBeGreaterThan(before.canvas.width);
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.setViewportSize({ width: 1200, height: 740 });
  await page.getByRole('button', { name: 'Fit composition to view' }).click();
  await expect.poll(async () => (await dimensions()).canvas.width).toBeLessThan(before.canvas.width);
  const after = await dimensions();
  expect(after.canvas.width).toBeLessThanOrEqual(after.viewport.width);
  expect(after.canvas.height).toBeLessThanOrEqual(after.viewport.height);
  // Simulate wider side panels without a window resize; ResizeObserver must refit.
  await page.locator('.workspace').evaluate(element => { (element as HTMLElement).style.gridTemplateColumns = '320px minmax(280px, 1fr) 340px'; });
  await expect.poll(async () => (await dimensions()).canvas.width).toBeLessThan(after.canvas.width);
  const panelResize = await dimensions();
  expect(panelResize.canvas.width).toBeLessThanOrEqual(panelResize.viewport.width);
  expect(panelResize.canvas.height).toBeLessThanOrEqual(panelResize.viewport.height);
  await expect(page.getByLabel('Position X', { exact: true })).toHaveValue('960');
  await expect(page.getByLabel('Scale', { exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Fit layer: contain' }).click();
  await expect(page.getByLabel('Scale', { exact: true })).toHaveValue('1.97');
  await page.getByRole('button', { name: 'Fit layer: cover' }).click();
  await expect(page.getByLabel('Scale', { exact: true })).toHaveValue('2.01');
  await page.getByRole('button', { name: /Save/ }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Scale', { exact: true })).toHaveValue('2.01');
});
