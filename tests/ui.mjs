import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const userData = await mkdtemp(path.join(tmpdir(), 'river-test-'));
await mkdir('artifacts', { recursive: true });
const errors = [];
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
try {
  const page = await app.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.getByRole('heading', { name: 'Your table. In focus.' })).toBeVisible();
  await page.getByRole('button', { name: 'Practice table', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Practice with purpose.' })).toBeVisible();
  await expect(page.locator('.equity-value')).not.toContainText('···', { timeout: 15000 });
  await expect(page.getByRole('button', { name: /^Call 1/ })).toBeEnabled();
  await page.screenshot({ path: 'artifacts/river-desktop.png', fullPage: true });
  await page.getByRole('button', { name: /^Fold/ }).click();
  await expect(page.locator('.result-status')).toContainText('Atlas wins 3');
  await expect(page.locator('.stat-card').nth(0)).toContainText('-1');
  await page.getByRole('button', { name: 'Practice history' }).click();
  await expect(page.locator('.history-row').nth(1)).toContainText('#001');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('DID NOT SHOW');
  await page.getByRole('button', { name: /Study final board/ }).click();
  await expect(page.getByRole('heading', { name: 'Look deeper into your hand.' })).toBeVisible();
  await expect(page.locator('.equity-value')).not.toContainText('···');
  await page.getByRole('button', { name: 'Reset example' }).click();
  await expect(page.locator('.scenario-board .playing-card:not(.empty)')).toHaveCount(3);
  await page.getByLabel('Review an example').selectOption('0');
  await expect(page.locator('.recommended-action')).toHaveText('Fold candidate');
  await expect(page.locator('.study-outcomes')).toContainText('0.0%');
  await expect(page.locator('.study-coach')).toContainText('Your best hand plays the board');
  await page.getByLabel('Review an example').selectOption('1');
  await expect(page.locator('.recommended-action')).toHaveText('Fold candidate');
  await expect(page.locator('.study-coach')).toContainText('backdoor possibilities only');
  await page.screenshot({ path: 'artifacts/river-study-reviewed.png', fullPage: true });
  await page.getByLabel('Review an example').selectOption('2');
  await expect(page.locator('.recommended-action')).toHaveText('Call candidate');
  await page.getByText('Price, assumptions & limits', { exact: true }).click();
  await page.getByLabel('Policy reserve').fill('40');
  await expect(page.locator('.recommended-action')).toHaveText('Fold candidate');
  await page.getByRole('button', { name: 'Use default', exact: true }).click();
  await expect(page.locator('.recommended-action')).toHaveText('Call candidate');
  await page.getByRole('button', { name: 'Reset example' }).click();
  await page.getByRole('button', { name: 'Change hole card 1' }).click();
  await expect(page.getByRole('dialog', { name: 'Pick a card' })).toBeVisible();
  await expect(page.locator('.picker-row button:disabled')).toHaveCount(4);
  await page.getByRole('button', { name: 'K♠', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Tight', exact: true }).click();
  await expect(page.locator('.equity-value')).not.toContainText('···');
  const count = await page.locator('.range-grid .included').count();
  expect(count).toBeGreaterThan(5);
  expect(count).toBeLessThan(55);
  await page.getByRole('button', { name: 'Turn', exact: true }).click();
  await expect(page.locator('.scenario-board .playing-card:not(.empty)')).toHaveCount(4);
  await page.getByRole('button', { name: 'River', exact: true }).click();
  await expect(page.locator('.scenario-board .playing-card:not(.empty)')).toHaveCount(5);
  await page.locator('.scenario-fields select').selectOption('5');
  await expect(page.locator('.equity-value')).not.toContainText('···', { timeout: 15000 });
  await page.screenshot({ path: 'artifacts/river-hand-lab.png', fullPage: true });
  await page.getByRole('button', { name: 'Open HUD' }).click();
  const hud = app.windows().find((w) => w !== page) || (await app.waitForEvent('window'));
  await expect(hud.locator('.hud-source')).toContainText('LOCAL SIMULATOR');
  await expect(hud.locator('.equity-value')).not.toContainText('···');
  expect(
    await app.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.getTitle() === 'River · Hold’em Studio' && w.isAlwaysOnTop())
          ?.isAlwaysOnTop() || BrowserWindow.getAllWindows().some((w) => w.isAlwaysOnTop()),
    ),
  ).toBe(true);
  await hud.screenshot({ path: 'artifacts/river-hud.png' });
  await hud.getByRole('button', { name: 'Close HUD' }).click();
  await page.getByRole('button', { name: 'Preferences' }).click();
  await page.getByLabel('Table pace').selectOption('350');
  await page.getByRole('button', { name: 'Close preferences' }).click();
  await page.getByRole('button', { name: 'Practice table' }).click();
  await page.getByRole('button', { name: /Deal next hand/ }).click();
  await page.getByRole('button', { name: /Autoplay/ }).click();
  await expect(page.locator('.stat-card').nth(1).locator('.stat-value')).not.toHaveText('1', {
    timeout: 30000,
  });
  await page.getByRole('button', { name: /Autoplay/ }).click();
  await expect(page.locator('.autoplay-switch')).not.toHaveClass(/on/);
  await page.getByRole('button', { name: 'Practice history' }).click();
  await page.screenshot({ path: 'artifacts/river-history.png', fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Practice history' }).click();
  expect(await page.locator('.history-row').count()).toBeGreaterThan(2);
  await page.setViewportSize({ width: 880, height: 800 });
  await page.getByRole('button', { name: 'Hand lab' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'artifacts/river-compact.png', fullPage: true });
  expect(errors).toEqual([]);
  console.log(
    'PASS: native launch, equity worker, manual fold, hand persistence, review, card picker, multiway range analysis, floating HUD, autoplay, responsive layout, no renderer errors.',
  );
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}
