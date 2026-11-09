import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
if (process.platform !== 'darwin') {
  console.log('Apple Vision OCR is available on macOS. Web practice remains available.');
  process.exit(0);
}
mkdirSync('native/bin', { recursive: true });
// Universal helper: one binary for Apple Silicon and Intel Macs.
for (const arch of ['arm64', 'x86_64'])
  execFileSync(
    'xcrun',
    [
      'swiftc',
      '-O',
      '-target',
      `${arch}-apple-macos12`,
      'native/recognize.swift',
      '-o',
      `native/bin/river-ocr-${arch}`,
      '-framework',
      'Vision',
      '-framework',
      'ImageIO',
      '-framework',
      'CoreText',
    ],
    { stdio: 'inherit' },
  );
execFileSync(
  'lipo',
  [
    '-create',
    'native/bin/river-ocr-arm64',
    'native/bin/river-ocr-x86_64',
    '-output',
    'native/bin/river-ocr',
  ],
  { stdio: 'inherit' },
);
execFileSync('codesign', ['--force', '--sign', '-', 'native/bin/river-ocr'], { stdio: 'inherit' });
console.log('Built local Apple Vision reader.');
