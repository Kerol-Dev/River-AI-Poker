import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const pkg = JSON.parse(readFileSync('package.json', 'utf8')),
  manifest = JSON.parse(readFileSync('browser-extension/manifest.json', 'utf8'));
assert.equal(pkg.version, manifest.version, 'App and extension versions must match');
assert.equal(pkg.license, 'Apache-2.0');
for (const name of [
  'LICENSE',
  'NOTICE',
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'docs/architecture.md',
  'docs/getting-started.md',
  'docs/compatibility.md',
  'THIRD_PARTY_NOTICES.md',
  'docs/assets/river-hero.svg',
  'docs/assets/companion.png',
  'docs/assets/screen-reader.png',
])
  assert.ok(existsSync(name), `${name} is required`);
for (const file of manifest.content_scripts.flatMap((s) => s.js))
  assert.ok(existsSync(path.join('browser-extension', file)), `${file} is missing`);
assert.ok(
  !manifest.host_permissions.includes('<all_urls>'),
  'The browser adapter must stay narrowly scoped',
);
for (const file of [
  'electron/main.cjs',
  'electron/preload.cjs',
  'electron/screen-reader.cjs',
  'browser-extension/content.js',
  'browser-extension/panel.js',
  'browser-extension/interface.js',
])
  assert.ok(readFileSync(file, 'utf8').length > 0);
const roots = ['src', 'electron', 'browser-extension', 'native', 'docs', '.github'];
function scan(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.name === 'bin') continue;
    const p = path.join(dir, item.name);
    if (item.isDirectory()) scan(p);
    else if (/\.(?:ts|tsx|js|cjs|mjs|md|yml|json|swift)$/.test(p)) {
      const text = readFileSync(p, 'utf8');
      assert.ok(
        !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text),
        `Private key in ${p}`,
      );
      assert.ok(!/gh[pousr]_[A-Za-z0-9]{30,}/.test(text), `GitHub token in ${p}`);
      assert.ok(!/\/Users\/[^/]+\//.test(text), `Personal absolute path in ${p}`);
    }
  }
}
roots.forEach(scan);
console.log(
  'Release structure, version parity, scoped permissions and credential-pattern checks passed.',
);
