import type { Page, TestInfo } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

export interface PageDiagnostics {
  /** Uncaught exceptions and unhandled promise rejections. Any entry fails a test. */
  errors: string[];
  /** console.error messages. Any entry fails a test. */
  consoleErrors: string[];
  /** console.warn messages. Reported for information only. */
  warnings: string[];
}

/** Attach listeners before navigation so no early failure is missed. */
export function collectDiagnostics(page: Page): PageDiagnostics {
  const diagnostics: PageDiagnostics = { errors: [], consoleErrors: [], warnings: [] };
  page.on('pageerror', error => diagnostics.errors.push(`${error.name}: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
    if (message.type() === 'warning') diagnostics.warnings.push(message.text());
  });
  return diagnostics;
}

/** Browser-side unhandled rejection capture. Installed via addInitScript. */
export async function installRejectionTracking(page: Page): Promise<void> {
  await page.addInitScript(() => {
    (window as unknown as { __unhandled: string[] }).__unhandled = [];
    window.addEventListener('unhandledrejection', event => {
      (window as unknown as { __unhandled: string[] }).__unhandled.push(String(event.reason?.message ?? event.reason));
    });
  });
}

export async function unhandledRejections(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __unhandled?: string[] }).__unhandled ?? []);
}

/** Save a browser-specific screenshot so runs in different browsers do not overwrite each other. */
export async function saveScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<string> {
  const dir = path.resolve('screenshots', testInfo.project.name);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}
