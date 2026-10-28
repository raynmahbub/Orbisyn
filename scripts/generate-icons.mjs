#!/usr/bin/env node
/**
 * Icon generator.
 *
 * The app icons are drawn here rather than checked in as opaque binaries, so a
 * change to the brand mark is a reviewable one-line diff and the PNGs can always
 * be regenerated. Usage:
 *
 *   node scripts/generate-icons.mjs
 *
 * Renders the orbit mark — one ring, one core, one satellite — over the dark
 * surface colour, at every size the manifest and iOS ask for, plus the
 * transparent SVG the browser uses as a tab icon.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public');

const COLORS = {
  surfaceTop: [11, 18, 32],
  surfaceBottom: [17, 27, 48],
  ring: [37, 99, 235],
  core: [96, 165, 250],
  satellite: [125, 211, 252],
};

/**
 * Geometry, in fractions of the icon edge. The SVG below and the raster loop
 * read the same numbers, so the two can never drift apart.
 */
const MARK = {
  ringRadius: 0.3,
  ringThickness: 0.055,
  coreRadius: 0.105,
  satelliteRadius: 0.052,
  satelliteAngle: -Math.PI / 5,
};

const SIZES = [
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
];

/** Signed distance from a point to an ellipse ring, normalised by thickness. */
function ringDistance(px, py, cx, cy, radius, thickness) {
  const distance = Math.hypot(px - cx, py - cy) / radius - 1;
  return Math.abs(distance) * radius - thickness / 2;
}

function coverage(px, py, shape) {
  // 3x3 supersampling: enough for smooth edges at these sizes without a
  // dependency on a rasteriser.
  const samples = 3;
  let hits = 0;
  for (let sy = 0; sy < samples; sy += 1) {
    for (let sx = 0; sx < samples; sx += 1) {
      const x = px + (sx + 0.5) / samples;
      const y = py + (sy + 0.5) / samples;
      if (shape(x, y)) hits += 1;
    }
  }
  return hits / (samples * samples);
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const ringRadius = size * MARK.ringRadius;
  const ringThickness = size * MARK.ringThickness;
  const coreRadius = size * MARK.coreRadius;
  const satelliteRadius = size * MARK.satelliteRadius;
  const { satelliteX, satelliteY } = satellitePosition(size, cx, cy, ringRadius);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const ratio = y / (size - 1);

      // Background: vertical gradient between the two surface tokens.
      let r = COLORS.surfaceTop[0] + (COLORS.surfaceBottom[0] - COLORS.surfaceTop[0]) * ratio;
      let g = COLORS.surfaceTop[1] + (COLORS.surfaceBottom[1] - COLORS.surfaceTop[1]) * ratio;
      let b = COLORS.surfaceTop[2] + (COLORS.surfaceBottom[2] - COLORS.surfaceTop[2]) * ratio;

      const ring = coverage(
        x,
        y,
        (sx, sy) => ringDistance(sx, sy, cx, cy, ringRadius, ringThickness) <= 0,
      );
      if (ring > 0) {
        r = mix(r, COLORS.ring[0], ring);
        g = mix(g, COLORS.ring[1], ring);
        b = mix(b, COLORS.ring[2], ring);
      }

      const core = coverage(x, y, (sx, sy) => Math.hypot(sx - cx, sy - cy) <= coreRadius);
      if (core > 0) {
        r = mix(r, COLORS.core[0], core);
        g = mix(g, COLORS.core[1], core);
        b = mix(b, COLORS.core[2], core);
      }

      const satellite = coverage(
        x,
        y,
        (sx, sy) => Math.hypot(sx - satelliteX, sy - satelliteY) <= satelliteRadius,
      );
      if (satellite > 0) {
        r = mix(r, COLORS.satellite[0], satellite);
        g = mix(g, COLORS.satellite[1], satellite);
        b = mix(b, COLORS.satellite[2], satellite);
      }

      pixels[offset] = Math.round(r);
      pixels[offset + 1] = Math.round(g);
      pixels[offset + 2] = Math.round(b);
      pixels[offset + 3] = 255;
    }
  }

  return pixels;
}

function satellitePosition(size, cx, cy, ringRadius) {
  return {
    satelliteX: cx + Math.cos(MARK.satelliteAngle) * ringRadius,
    satelliteY: cy + Math.sin(MARK.satelliteAngle) * ringRadius,
  };
}

function mix(base, overlay, alpha) {
  return base * (1 - alpha) + overlay * alpha;
}

function encodePng(width, height, rgba) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0; // filter type: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }

  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([length, body, crc]);
  };

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let crcTable = null;
function crc32(buffer) {
  if (crcTable === null) {
    crcTable = [];
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc ^ 0xffffffff;
}

/**
 * The same mark as vector, transparent background, for the browser tab. A tab
 * icon is drawn at 16px as often as at 512px, so the ring is slightly thicker
 * here than in the app icon.
 */
function renderSvg() {
  const size = 64;
  const cx = size / 2;
  const cy = size / 2;
  const ringRadius = size * MARK.ringRadius;
  const ringThickness = size * MARK.ringThickness * 1.15;
  const coreRadius = size * MARK.coreRadius;
  const satelliteRadius = size * MARK.satelliteRadius;
  const { satelliteX, satelliteY } = satellitePosition(size, cx, cy, ringRadius);
  const hex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img">',
    '  <title>Orbisyn</title>',
    `  <circle cx="${cx}" cy="${cy}" r="${ringRadius.toFixed(2)}" fill="none" stroke="${hex(COLORS.ring)}" stroke-width="${ringThickness.toFixed(2)}"/>`,
    `  <circle cx="${cx}" cy="${cy}" r="${coreRadius.toFixed(2)}" fill="${hex(COLORS.core)}"/>`,
    `  <circle cx="${satelliteX.toFixed(2)}" cy="${satelliteY.toFixed(2)}" r="${satelliteRadius.toFixed(2)}" fill="${hex(COLORS.satellite)}"/>`,
    '</svg>',
    '',
  ].join('\n');
}

mkdirSync(OUT_DIR, { recursive: true });
for (const { file, size } of SIZES) {
  const png = encodePng(size, size, render(size));
  writeFileSync(join(OUT_DIR, file), png);
  process.stdout.write(`${file} ${size}x${size} ${png.length} bytes\n`);
}

const svg = renderSvg();
writeFileSync(join(OUT_DIR, 'favicon.svg'), svg);
process.stdout.write(`favicon.svg ${svg.length} bytes\n`);
