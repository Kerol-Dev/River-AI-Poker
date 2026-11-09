// The fixture uses a local chrome.runtime mock and cannot reach a poker site.
import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const userData = await mkdtemp(path.join(tmpdir(), 'river-display-test-'));
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    // Expose only this synthetic fixture's shadow tree to test locators.
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
      return attach.call(this, { ...options, mode: 'open' });
    };
  });
  await page.goto(pathToFileURL(path.resolve('tests/reader-preview.html')).href);
  await expect(page.locator('#read-win')).toHaveText('59.0%', { timeout: 15000 });
  await expect(page.locator('#read-tie')).toHaveText('4.0%');
  await expect(page.locator('#read-equity')).toHaveText('61%');
  await expect(page.locator('.action')).toContainText('Call');
  await page.getByRole('button', { name: 'Show opponent turn' }).click();
  await expect(page.locator('.decision-kicker')).toHaveText('WIN CHANCE');
  await expect(page.locator('#read-win')).toHaveText('59.0%');
  await expect(page.locator('#read-tie')).toHaveText('4.0%');
  await page.setViewportSize({ width: 1000, height: 720 });
  const fits = await page
    .locator('.decision-numbers')
    .evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(fits).toBe(true);
  await page.screenshot({ path: 'artifacts/river-reader-outcomes.png' });
  await page.getByRole('tab', { name: 'Session', exact: true }).click();
  await expect(page.locator('.reader-graph')).toBeVisible();
  await page.getByRole('tab', { name: 'Table', exact: true }).click();
  await expect(page.locator('#read-win')).toBeVisible();
  expect(errors).toEqual([]);
  console.log(
    'PASS: synthetic reader outcomes during both turns, compact metric row, tab navigation, no renderer errors. No wager actions exercised.',
  );
} finally {
  await app.close();
  await rm(userData, { recursive: true, force: true });
}
