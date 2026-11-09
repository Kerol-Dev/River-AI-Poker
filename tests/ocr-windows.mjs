// Windows text recognition on a generated table image. Runs only on Windows.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
if (process.platform !== 'win32') {
  console.log('Windows OCR test runs on Windows only; skipped.');
  process.exit(0);
}
const dir = mkdtempSync(path.join(tmpdir(), 'river-win-ocr-'));
try {
  const manifest = path.join(dir, 'manifest.json');
  writeFileSync(manifest, JSON.stringify([path.resolve('tests/fixtures/table-1.png')]));
  let out;
  try {
    out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        'native/windows/recognize.ps1',
        manifest,
      ],
      { encoding: 'utf8' },
    );
  } catch (e) {
    if (e.status === 2) {
      console.log('No Windows OCR language on this machine; skipped.');
      process.exit(0);
    }
    throw e;
  }
  const result = JSON.parse(out);
  const text = (Array.isArray(result) ? result : [result])[0].lines.map((l) => l.text).join(' ');
  assert.match(text, /Pot/i);
  assert.match(text, /12[.,]40/);
  assert.match(text, /Fold/);
  console.log('PASS: Windows text recognition read the generated table:', text);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
