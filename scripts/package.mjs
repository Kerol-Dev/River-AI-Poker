import { packager } from '@electron/packager';
import { execFileSync } from 'node:child_process';
const paths = await packager({
  dir: '.',
  name: 'River',
  executableName: 'River',
  platform: 'darwin',
  arch: process.arch,
  out: 'release',
  overwrite: true,
  asar: true,
  prune: true,
  appBundleId: 'studio.river.holdem',
  appCategoryType: 'public.app-category.card-games',
  icon: 'public/River.icns',
  ignore: [
    /^\/src($|\/)/,
    /^\/tests($|\/)/,
    /^\/release($|\/)/,
    /^\/scripts($|\/)/,
    /^\/\.git($|\/)/,
    /^\/artifacts($|\/)/,
    /^\/node_modules($|\/)/,
    /^\/browser-extension($|\/)/,
    /^\/native($|\/)/,
    /^\/docs($|\/)/,
  ],
  extraResource: [
    'browser-extension',
    'native/bin/river-ocr',
    'LICENSE',
    'NOTICE',
    'THIRD_PARTY_NOTICES.md',
  ],
  extendInfo: {
    NSScreenCaptureUsageDescription:
      'River reads the window you select locally to recognise visible cards and amounts.',
  },
  osxSign: undefined,
});
for (const target of paths) {
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', `${target}/River.app`], {
    stdio: 'inherit',
  });
  execFileSync('codesign', ['--verify', '--deep', '--strict', `${target}/River.app`], {
    stdio: 'inherit',
  });
}
console.log(`Built and locally signed ${paths.join(', ')}`);
