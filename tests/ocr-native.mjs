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
