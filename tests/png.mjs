// Minimal PNG reader for test fixtures: 8-bit RGB or RGBA, non-interlaced.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
export function readPng(file) {
  const buf = readFileSync(file);
  let pos = 8,
    width = 0,
    height = 0,
    channels = 4;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos),
      type = buf.toString('ascii', pos + 4, pos + 8),
      body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0) throw new Error('Unsupported PNG');
      channels = { 2: 3, 6: 4 }[body[9]];
      if (!channels) throw new Error('Unsupported PNG colour type');
    } else if (type === 'IDAT') idat.push(body);
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels,
    out = new Uint8Array(width * height * 4),
    prev = new Uint8Array(stride),
    line = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0,
        b = prev[x],
        c = x >= channels ? prev[x - channels] : 0;
      const p = a + b - c,
        pa = Math.abs(p - a),
        pb = Math.abs(p - b),
        pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      line[x] = (src[x] + pred) & 255;
    }
    for (let x = 0; x < width; x++) {
      out[(y * width + x) * 4] = line[x * channels];
      out[(y * width + x) * 4 + 1] = line[x * channels + 1];
      out[(y * width + x) * 4 + 2] = line[x * channels + 2];
      out[(y * width + x) * 4 + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    prev.set(line);
  }
  return { width, height, data: out };
}
