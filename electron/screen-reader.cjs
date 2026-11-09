const { mkdtemp, writeFile, rm, access } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { detectCards } = require('./card-detect.cjs');
const windows = process.platform === 'win32';
function validateRegions(regions) {
  if (!Array.isArray(regions) || regions.length > 20) throw Error('Map up to 20 regions.');
  const ids = new Set();
  return regions.map((r) => {
    if (
      !r ||
      typeof r.id !== 'string' ||
      r.id.length > 60 ||
      ids.has(r.id) ||
      !['x', 'y', 'width', 'height'].every((k) => Number.isFinite(r[k])) ||
      r.x < 0 ||
      r.y < 0 ||
      r.width < 0.003 ||
      r.height < 0.003 ||
      r.x + r.width > 1.001 ||
      r.y + r.height > 1.001
    )
      throw Error('A mapped region is outside the selected window.');
    ids.add(r.id);
    return { id: r.id, x: r.x, y: r.y, width: r.width, height: r.height };
  });
}
function createScreenReader({
  desktopCapturer,
  systemPreferences,
  app,
  nativeImage,
  ownWindowIds = () => [],
}) {
  let allowed = new Set(),
    busy = false,
    selection = null;
  // macOS: Apple Vision helper (text and cards). Windows: built-in Windows OCR for text and
  // the JavaScript card detector, which uses the same reference shapes.
  const helper = windows
    ? app.isPackaged
      ? path.join(process.resourcesPath, 'recognize.ps1')
      : path.resolve(__dirname, '../native/windows/recognize.ps1')
    : app.isPackaged
      ? path.join(process.resourcesPath, 'river-ocr')
      : path.resolve(__dirname, '../native/bin/river-ocr');
  async function list() {
    if (process.platform !== 'darwin' && !windows)
      throw Error('Screen reading requires macOS or Windows 10/11.');
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    const own = ownWindowIds();
    const rows = sources
      .filter((s) => !own.includes(Number(s.id.split(':')[1])) && !/^River(?: ·| HUD)/.test(s.name))
      .map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.id.startsWith('screen:') ? 'screen' : 'window',
      }));
    allowed = new Set(rows.map((s) => s.id));
    return { sources: rows, permission: systemPreferences.getMediaAccessStatus('screen') };
  }
  async function capture({ sourceId, regions = [], auto = false }) {
    if (!allowed.has(sourceId)) throw Error('Choose an available window first.');
    if (busy) throw Error('A reading is already in progress.');
    const safe = validateRegions(regions);
    busy = true;
    let folder;
    try {
      await access(helper).catch(() => {
        throw Error(
          windows
            ? 'The Windows text recognition script is missing. Reinstall River.'
            : 'OCR helper is missing. Run npm run build:ocr, or use the macOS release.',
        );
      });
      const sources = await desktopCapturer.getSources({
        types: [sourceId.startsWith('screen:') ? 'screen' : 'window'],
        thumbnailSize: { width: 2560, height: 1600 },
        fetchWindowIcons: false,
      });
      const source = sources.find((s) => s.id === sourceId);
      if (!source || source.thumbnail.isEmpty())
        throw Error(
          'This window is unavailable. Check Screen Recording permission, or select the window again.',
        );
      const dimensions = source.thumbnail.getSize();
      if (
        selection &&
        selection.id === sourceId &&
        (selection.width !== dimensions.width || selection.height !== dimensions.height)
      )
        throw Error('Window size changed. Select it again and check your mapping.');
      selection = { id: sourceId, ...dimensions };
      const at = Date.now(),
        png = source.thumbnail.toPNG();
      folder = await mkdtemp(path.join(tmpdir(), 'river-frame-'));
      const frame = path.join(folder, 'frame.png'),
        map = path.join(folder, 'regions.json');
      await writeFile(frame, png, { mode: 0o600 });
      if (windows)
        return {
          ...(await readWindows(source.thumbnail, safe, auto, folder)),
          at,
          sourceId,
          image: 'data:image/png;base64,' + png.toString('base64'),
        };
      await writeFile(
        map,
        JSON.stringify(
          safe.length && !auto ? safe : [{ id: 'scan', x: 0, y: 0, width: 1, height: 1 }],
        ),
        { mode: 0o600 },
      );
      // Automatic mode also finds face-up cards by shape, rank and suit in the whole frame.
      const { stdout } = await run(helper, auto ? [frame, map, '--cards'] : [frame, map], {
        timeout: 12000,
        maxBuffer: 1024 * 1024,
      });
      return {
        ...JSON.parse(stdout),
        at,
        sourceId,
        image: 'data:image/png;base64,' + png.toString('base64'),
      };
    } finally {
      busy = false;
      if (folder) await rm(folder, { recursive: true, force: true });
    }
  }
  // One PowerShell run per frame: every mapped region plus each card rank shape.
  async function readWindows(thumbnail, safe, auto, folder) {
    const { width, height } = thumbnail.getSize();
    const regions = safe.length && !auto ? safe : [{ id: 'scan', x: 0, y: 0, width: 1, height: 1 }];
    const files = [];
    for (const [i, r] of regions.entries()) {
      const rect = {
        x: Math.round(r.x * width),
        y: Math.round(r.y * height),
        width: Math.max(1, Math.round(r.width * width)),
        height: Math.max(1, Math.round(r.height * height)),
      };
      const file = path.join(folder, `region-${i}.png`);
      await writeFile(file, thumbnail.crop(rect).toPNG(), { mode: 0o600 });
      files.push({ file, region: r, rect });
    }
    let lines = [];
    const ocr = async (list) => {
      const glyphFiles = [];
      for (const [i, g] of list.entries()) {
        const bgra = Buffer.alloc(g.width * g.height * 4);
        for (let p = 0; p < g.width * g.height; p++) {
          bgra[p * 4] = bgra[p * 4 + 1] = bgra[p * 4 + 2] = g.data[p];
          bgra[p * 4 + 3] = 255;
        }
        const file = path.join(folder, `glyph-${i}.png`);
        await writeFile(
          file,
          nativeImage.createFromBitmap(bgra, { width: g.width, height: g.height }).toPNG(),
          { mode: 0o600 },
        );
        glyphFiles.push(file);
      }
      lines = await windowsOcr([...files.map((f) => f.file), ...glyphFiles], folder);
      return lines.slice(files.length).map((r) => r.lines.map((l) => l.text).join(' '));
    };
    const cards = auto
      ? await detectCards(
          { ...thumbnail.getSize(), data: thumbnail.toBitmap() },
          { order: 'bgra', ocr },
        )
      : null;
    if (!auto || !lines.length)
      lines = await windowsOcr(
        files.map((f) => f.file),
        folder,
      );
    return {
      width,
      height,
      cards: cards || undefined,
      readings: files.map(({ region, rect }, i) => ({
        id: region.id,
        // Windows OCR reports no per-line confidence; River still requires stable repeats.
        words: (lines[i]?.lines || []).map((l) => ({
          text: l.text,
          confidence: 0.9,
          x: region.x + (l.x / rect.width) * region.width,
          y: region.y + (l.y / rect.height) * region.height,
          width: (l.width / rect.width) * region.width,
          height: (l.height / rect.height) * region.height,
        })),
      })),
    };
  }
  async function windowsOcr(paths, folder) {
    const manifest = path.join(folder, 'manifest.json');
    await writeFile(manifest, JSON.stringify(paths), { mode: 0o600 });
    const { stdout } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helper, manifest],
      { timeout: 20000, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
    ).catch((e) => {
      throw Error(
        (e.stderr || '').trim() || 'Windows text recognition could not finish. Try again.',
      );
    });
    const parsed = JSON.parse(stdout || '[]');
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  return {
    list,
    capture,
    reset: () => {
      selection = null;
    },
  };
}
module.exports = { createScreenReader, validateRegions };
