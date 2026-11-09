// Zips the Chrome extension for the release: unzip it and choose Load unpacked in Chrome.
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const manifest = JSON.parse(readFileSync('browser-extension/manifest.json', 'utf8'));
mkdirSync('release', { recursive: true });
const zip = path.resolve('release', `River-${manifest.version}-chrome-extension.zip`);
rmSync(zip, { force: true });
if (process.platform === 'win32')
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path browser-extension -DestinationPath '${zip}'`,
  ]);
else
  execFileSync('zip', ['-r', '-X', zip, 'browser-extension', '-x', '*.DS_Store'], {
    stdio: 'inherit',
  });
console.log(`Built ${zip}`);
