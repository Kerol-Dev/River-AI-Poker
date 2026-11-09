import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
if (process.platform !== 'darwin') {
  console.log('Apple Vision OCR is available on macOS. Web practice remains available.');
  process.exit(0);
}
mkdirSync('native/bin', { recursive: true });
execFileSync(
  'xcrun',
  [
    'swiftc',
    '-O',
    'native/recognize.swift',
    '-o',
    'native/bin/river-ocr',
    '-framework',
    'Vision',
    '-framework',
    'ImageIO',
  ],
  { stdio: 'inherit' },
);
execFileSync('codesign', ['--force', '--sign', '-', 'native/bin/river-ocr'], { stdio: 'inherit' });
console.log('Built local Apple Vision reader.');
