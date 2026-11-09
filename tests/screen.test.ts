import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  parseFrame,
  readCards,
  readMoney,
  suggestRegions,
  Frame,
  Region,
  Word,
} from '../src/screen/recognition';
const { validateRegions } = createRequire(import.meta.url)('../electron/screen-reader.cjs');
const roles = ['hole', 'board', 'pot', 'call', 'actions'] as const;
const regions: Region[] = roles.map((role, i) => ({
  id: role,
  role,
  label: role,
  x: 0.1,
  y: 0.1 + i * 0.1,
  width: 0.3,
  height: 0.05,
}));
const word = (text: string, confidence = 1): Word => ({
  text,
  confidence,
  x: 0.1,
  y: 0.1,
  width: 0.2,
  height: 0.03,
});
const frame = (): Frame => ({
  at: 10000,
  sourceId: 'test',
  image: '',
  width: 1000,
  height: 700,
  readings: roles.map((id, i) => ({
    id,
    words: [word(['As Qh', 'Ks 7d 2c', 'Pot: €4.20', 'Call €1.20', 'Fold Call Raise'][i])],
  })),
});
describe('screen-reader confidence and parsing', () => {
  it('reads exact ranks and suits, with symbols or letters', () => {
    assert.deepEqual(readCards('10 ♥ A ♠'), ['Th', 'As']);
    assert.deepEqual(readCards('Ks Qh'), ['Ks', 'Qh']);
    assert.deepEqual(readCards('A ? 10 red'), []);
  });
  it('accepts one clear amount and rejects ambiguous locale or multiple numbers', () => {
    assert.equal(readMoney('Call €1,234.56'), 1234.56);
    assert.equal(readMoney('0'), 0);
    for (const text of ['€1,20', '€1.00 €2.00', 'O.50', 'Pot 5 10'])
      assert.equal(readMoney(text), null);
  });
  it('requires current actions, mapped fields, unique cards and the expected street', () => {
    const r = parseFrame(frame(), regions, 1, 3);
    assert.deepEqual(r.issues, []);
    assert.equal(r.pot, 4.2);
    assert.equal(r.call, 1.2);
    assert.ok(parseFrame(frame(), regions, 1, 0).issues.length);
    assert.ok(parseFrame(frame(), regions.slice(1), 1, 3).issues.length);
    const duplicate = frame();
    duplicate.readings[1].words = [word('As 7d 2c')];
    assert.match(parseFrame(duplicate, regions, 1, 3).issues.join(' '), /twice/);
  });
  it('blocks low confidence, all-ins and advance actions', () => {
    for (const label of ['Check/Fold Call', 'Fold All In']) {
      const f = frame();
      f.readings[4].words = [word(label)];
      assert.ok(parseFrame(f, regions, 1, 3).issues.length);
    }
    const f = frame();
    f.readings[0].words = [word('As Qh', 0.6)];
    assert.match(parseFrame(f, regions, 1, 3).issues.join(' '), /hard to read/);
  });
  it('keeps card equity available while action fields are absent', () => {
    const f = frame();
    f.readings = f.readings.filter((r) => ['hole', 'board'].includes(r.id));
    const r = parseFrame(f, regions, 1, 3);
    assert.deepEqual(r.equityIssues, []);
    assert.ok(r.issues.length > 0);
    f.readings[0].words = [word('As Qh', 0.6)];
    assert.ok(parseFrame(f, regions, 1, 3).equityIssues.length > 0);
  });
  it('suggests only uniquely identified labelled amounts', () => {
    const f = frame();
    f.readings = [{ id: 'scan', words: [word('Pot: 10'), word('Call 2')] }];
    assert.ok(suggestRegions(f).some((r) => r.role === 'pot'));
    f.readings[0].words.push(word('Pot: 20'));
    assert.ok(!suggestRegions(f).some((r) => r.role === 'pot'));
  });
  it('rejects malicious or out-of-bounds capture regions', () => {
    assert.equal(validateRegions(regions).length, 5);
    for (const map of [
      [{ ...regions[0], x: -1 }],
      [{ ...regions[0], width: Infinity }],
      [regions[0], regions[0]],
      [{ ...regions[0], width: 1 }],
      Array(21).fill(regions[0]),
    ])
      assert.throws(() => validateRegions(map));
  });
});
