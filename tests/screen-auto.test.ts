import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { autoRead, cardRows, Frame } from '../src/screen/recognition';
// Recorded output of native/bin/river-ocr --cards on tests/cards-fixture.swift styles 1-3:
// two-colour, serif four-colour with suits beside ranks, and a small cream-faced table.
const frame = (style: number): Frame => ({
  ...JSON.parse(
    readFileSync(new URL(`./fixtures/screen-auto-${style}.json`, import.meta.url), 'utf8'),
  ),
  at: 1000,
  sourceId: 'test',
  image: '',
});
describe('automatic screen reading', () => {
  for (const style of [1, 2]) {
    it(`finds hand, board, pot, call and live buttons without a map (style ${style})`, () => {
      const { reading, regions } = autoRead(frame(style), 2);
      assert.deepEqual(reading.hole, ['As', 'Kh']);
      assert.deepEqual(reading.board, ['Js', 'Th', '7c', '2d']);
      assert.equal(reading.pot, 12.4);
      assert.equal(reading.call, 2);
      assert.deepEqual(reading.actions, ['fold', 'call', 'raise']);
      assert.deepEqual(reading.issues, []);
      assert.deepEqual(reading.equityIssues, []);
      assert.deepEqual(regions.map((r) => r.role).sort(), ['actions', 'board', 'hole', 'pot']);
    });
  }
  it('reads a small window with cream cards and a five-card board', () => {
    const { reading } = autoRead(frame(3), 1);
    assert.deepEqual(reading.board, ['Js', 'Th', '7c', '2d', 'Qd']);
    assert.deepEqual(reading.hole, ['As', 'Kh']);
  });
  it('waits instead of guessing when the buttons are not shown', () => {
    const f = frame(1);
    f.readings = f.readings.map((r) => ({
      ...r,
      words: r.words.filter((w) => !/fold|call|raise/i.test(w.text)),
    }));
    const { reading } = autoRead(f, 1);
    assert.equal(reading.call, null);
    assert.ok(reading.issues.some((i) => /your turn/.test(i)));
    assert.deepEqual(reading.equityIssues, []);
  });
  it('keeps overlapping cards of one hand in one row', () => {
    const rows = cardRows(frame(1).cards!, 1.6);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.cards.length).sort(), [2, 4]);
  });
});
