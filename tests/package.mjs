import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const data = await mkdtemp(path.join(tmpdir(), 'river-package-'));
const app = await electron.launch({
  executablePath: path.resolve(
    process.platform === 'win32'
      ? 'release/River-win32-x64/River.exe'
      : `release/River-darwin-${process.arch}/River.app/Contents/MacOS/River`,
  ),
  args: [`--user-data-dir=${data}`],
});
try {
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Your table. In focus.' })).toBeVisible();
  await page.getByRole('button', { name: 'Practice table', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Practice with purpose.' })).toBeVisible();
  await expect(page.locator('.equity-value')).not.toContainText('···', { timeout: 15000 });
  const palette = await page.evaluate(() => ({
    bg: getComputedStyle(document.documentElement).backgroundColor,
    accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  }));
  // "Tide" palette: dark or light, following the system appearance.
  expect([
    ['rgb(15, 18, 21)', '#5AA9FF'],
    ['rgb(243, 245, 248)', '#1D6FE0'],
  ]).toContainEqual([palette.bg, palette.accent.toUpperCase()]);
  await page.getByRole('button', { name: 'Open HUD' }).click();
  const hud = app.windows().find((p) => p !== page) || (await app.waitForEvent('window'));
  await expect(hud.locator('.hud-source')).toContainText('LOCAL SIMULATOR');
  await expect(hud.locator('.equity-value')).not.toContainText('···');
  await page.screenshot({
    path: 'artifacts/river-packaged.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.screenshot({ path: 'artifacts/river-preview.png', animations: 'disabled' });
  await hud.screenshot({ path: 'artifacts/river-hud.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Hand lab' }).click();
  await expect(page.locator('.equity-value')).not.toContainText('···');
  await page.screenshot({
    path: 'artifacts/river-hand-lab.png',
    fullPage: true,
    animations: 'disabled',
  });
  console.log(
    `PASS: standalone ${process.platform === 'win32' ? 'Windows' : process.arch} app, bundled worker, requested palette, native HUD and hand lab.`,
  );
} finally {
  await app.close();
  await rm(data, { recursive: true, force: true });
}
