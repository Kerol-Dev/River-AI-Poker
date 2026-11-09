// Packages River for macOS (.app + .dmg) or Windows (app folder + installer .exe).
// macOS:   npm run package:mac   (RIVER_ARCH=arm64|x64, default: this Mac)
// Windows: npm run package:win   (needs Inno Setup 6 for the installer)
import { packager } from '@electron/packager';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';

const platform = process.argv[2] === 'win' ? 'win32' : 'darwin';
const arch = process.env.RIVER_ARCH || (platform === 'win32' ? 'x64' : process.arch);
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const common = {
  dir: '.',
  name: 'River',
  executableName: 'River',
  platform,
  arch,
  out: 'release',
  overwrite: true,
  asar: true,
  prune: true,
  appVersion: version,
  appCopyright: 'Copyright 2026 kerol-dev and River contributors. Apache-2.0.',
  ignore: [
    /^\/src($|\/)/,
    /^\/tests($|\/)/,
    /^\/release($|\/)/,
    /^\/scripts($|\/)/,
    /^\/\.git($|\/)/,
    /^\/\.github($|\/)/,
    /^\/\.claude($|\/)/,
    /^\/artifacts($|\/)/,
    /^\/node_modules($|\/)/,
    /^\/browser-extension($|\/)/,
    /^\/native($|\/)/,
    /^\/docs($|\/)/,
  ],
};
const licences = ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md'];

if (platform === 'darwin') {
  const [target] = await packager({
    ...common,
    appBundleId: 'studio.river.holdem',
    appCategoryType: 'public.app-category.card-games',
    icon: 'public/River.icns',
    extraResource: [
      'browser-extension',
      'native/bin/river-ocr',
      'public/icon-256.png',
      ...licences,
    ],
    extendInfo: {
      NSScreenCaptureUsageDescription:
        'River reads the window you select locally to recognise visible cards and amounts.',
    },
    osxSign: undefined,
  });
  const app = `${target}/River.app`;
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  // Disk image with the app and an Applications shortcut to drag it onto.
  const stage = path.join('release', `dmg-${arch}`);
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  execFileSync('ditto', [app, path.join(stage, 'River.app')]);
  symlinkSync('/Applications', path.join(stage, 'Applications'));
  const dmg = path.join('release', `River-${version}-mac-${arch}.dmg`);
  rmSync(dmg, { force: true });
  execFileSync(
    'hdiutil',
    ['create', '-volname', `River ${version}`, '-srcfolder', stage, '-ov', '-format', 'UDZO', dmg],
    { stdio: 'inherit' },
  );
  rmSync(stage, { recursive: true, force: true });
  console.log(`Built ${app} and ${dmg}`);
} else {
  const [target] = await packager({
    ...common,
    icon: 'public/River.ico',
    win32metadata: {
      CompanyName: 'River contributors',
      FileDescription: 'River · Hold’em Studio',
      ProductName: 'River',
      InternalName: 'River',
      OriginalFilename: 'River.exe',
    },
    extraResource: [
      'browser-extension',
      'native/windows/recognize.ps1',
      'public/icon-256.png',
      ...licences,
    ],
  });
  console.log(`Built ${target}`);
  // Installer: per-user, no administrator rights, Start menu entry and uninstaller.
  const iscc = [
    process.env.ISCC,
    'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe',
    'C:\\Program Files\\Inno Setup 6\\ISCC.exe',
  ].find((p) => p && existsSync(p));
  if (!iscc) {
    console.log(
      'Inno Setup 6 not found; skipped the installer. Install it to build the .exe setup.',
    );
  } else {
    execFileSync(
      iscc,
      [
        `/DAppVersion=${version}`,
        `/DSourceDir=${path.resolve(target)}`,
        `/DOutputDir=${path.resolve('release')}`,
        'scripts/windows/river.iss',
      ],
      { stdio: 'inherit' },
    );
    console.log(`Built release/River-${version}-windows-setup.exe`);
  }
}
