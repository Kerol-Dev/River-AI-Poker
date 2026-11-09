const { mkdtemp, writeFile, rm, access } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
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
function createScreenReader({ desktopCapturer, systemPreferences, app, ownWindowIds = () => [] }) {
  let allowed = new Set(),
    busy = false,
    selection = null;
  const helper = app.isPackaged
    ? path.join(process.resourcesPath, 'river-ocr')
    : path.resolve(__dirname, '../native/bin/river-ocr');
  async function list() {
    if (process.platform !== 'darwin') throw Error('Screen reading currently requires macOS.');
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
  async function capture({ sourceId, regions = [] }) {
    if (!allowed.has(sourceId)) throw Error('Choose an available window first.');
    if (busy) throw Error('A reading is already in progress.');
    const safe = validateRegions(regions);
    busy = true;
    let folder;
    try {
      await access(helper).catch(() => {
        throw Error('OCR helper is missing. Run npm run build:ocr, or use the macOS release.');
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
      await writeFile(
        map,
        JSON.stringify(safe.length ? safe : [{ id: 'scan', x: 0, y: 0, width: 1, height: 1 }]),
        { mode: 0o600 },
      );
      const { stdout } = await run(helper, [frame, map], {
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
  return {
    list,
    capture,
    reset: () => {
      selection = null;
    },
  };
}
module.exports = { createScreenReader, validateRegions };
