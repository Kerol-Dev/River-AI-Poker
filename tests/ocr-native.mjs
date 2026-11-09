import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
if (process.platform !== 'darwin') {
  console.log('Native OCR requires macOS; skipped.');
  process.exit(0);
}
const dir = mkdtempSync(path.join(tmpdir(), 'river-ocr-test-'));
try {
  const image = path.join(dir, 'fixture.png'),
    map = path.join(dir, 'map.json');
  execFileSync('xcrun', ['swift', 'tests/ocr-fixture.swift', image]);
  writeFileSync(
    map,
    JSON.stringify([
      { id: 'full', x: 0, y: 0, width: 1, height: 1 },
      { id: 'pot', x: 0, y: 0.42, width: 0.6, height: 0.13 },
    ]),
  );
  const result = JSON.parse(
    execFileSync('native/bin/river-ocr', [image, map], { encoding: 'utf8' }),
  );
  const text = result.readings[0].words.map((w) => w.text).join(' ');
  assert.match(text, /4\.20/);
  assert.match(text, /1\.20/);
  assert.match(text, /Fold/);
  assert.match(result.readings[1].words.map((w) => w.text).join(' '), /4\.20/);
  assert.ok(result.readings[0].words.every((w) => w.confidence >= 0 && w.confidence <= 1));
  console.log('Native Apple Vision recognition and mapped crop passed on a generated fixture.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// Automatic card detection on generated tables: two-colour, four-colour serif with suits beside
// ranks, and a small cream-faced window.
{
  const dir = mkdtempSync(path.join(tmpdir(), 'river-cards-test-'));
  try {
    const map = path.join(dir, 'map.json');
    writeFileSync(map, JSON.stringify([{ id: 'scan', x: 0, y: 0, width: 1, height: 1 }]));
    const expected = {
      1: ['Js', 'Th', '7c', '2d', 'As', 'Kh'],
      2: ['Js', 'Th', '7c', '2d', 'As', 'Kh'],
      3: ['Js', 'Th', '7c', '2d', 'Qd', 'As', 'Kh'],
    };
    for (const style of [1, 2, 3]) {
      const image = path.join(dir, `table-${style}.png`);
      execFileSync('xcrun', ['swift', 'tests/cards-fixture.swift', image, String(style)]);
      const result = JSON.parse(
        execFileSync('native/bin/river-ocr', [image, map, '--cards'], { encoding: 'utf8' }),
      );
      assert.deepEqual(
        result.cards.map((c) => c.rank + c.suit),
        expected[style],
        `card detection, style ${style}`,
      );
    }
    console.log('PASS: native card detection on three generated table styles.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
