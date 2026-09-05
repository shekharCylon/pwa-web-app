/**
 * Generates the PWA icons as PNGs with no image library — raw pixels through
 * zlib. Run once: `node scripts/generate-icons.mjs`
 */
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const BG = [13, 17, 23];
const FG = [79, 156, 249];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** A bell: elliptical dome, flat base bar, round clapper. */
function isBell(u, v) {
  const dome =
    ((u - 0.5) ** 2) / 0.28 ** 2 + ((v - 0.46) ** 2) / 0.30 ** 2 <= 1 && v <= 0.63;
  const bar = u >= 0.19 && u <= 0.81 && v > 0.63 && v <= 0.71;
  const clapper = (u - 0.5) ** 2 + (v - 0.80) ** 2 <= 0.072 ** 2;
  return dome || bar || clapper;
}

function png(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      // Keep the mark inside the maskable safe zone (centre 80%).
      const su = 0.5 + (u - 0.5) / 0.82;
      const sv = 0.5 + (v - 0.5) / 0.82;
      const on = su >= 0 && su <= 1 && sv >= 0 && sv <= 1 && isBell(su, sv);
      const c = on ? FG : BG;
      raw[p++] = c[0];
      raw[p++] = c[1];
      raw[p++] = c[2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512, 180]) {
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  writeFileSync(`public/${name}`, png(size));
  console.log(`public/${name}  (${size}x${size})`);
}
