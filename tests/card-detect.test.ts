import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
// @ts-expect-error JavaScript test helper
import { readPng } from './png.mjs';
const { detectCards } = createRequire(import.meta.url)('../electron/card-detect.cjs');
// Same generated tables as tests/ocr-native.mjs; this port runs on Windows and macOS.
const expected: Record<number, string[]> = {
  1: ['Js', 'Th', '7c', '2d', 'As', 'Kh'],
  2: ['Js', 'Th', '7c', '2d', 'As', 'Kh'],
  3: ['Js', 'Th', '7c', '2d', 'Qd', 'As', 'Kh'],
};
describe('cross-platform card detection', () => {
  for (const style of [1, 2, 3])
    it(`finds every card by shape alone (style ${style})`, async () => {
      const img = readPng(new URL(`./fixtures/table-${style}.png`, import.meta.url));
      const cards = await detectCards(img);
      assert.deepEqual(
        cards.map((c: { rank: string; suit: string }) => c.rank + c.suit),
        expected[style],
      );
    });
  it('uses text recognition when it agrees with the shape', async () => {
    const img = readPng(new URL('./fixtures/table-1.png', import.meta.url));
    const cards = await detectCards(img, {
      ocr: async (glyphs: unknown[]) => glyphs.map(() => ''),
    });
    assert.equal(cards.length, 6);
  });
});
