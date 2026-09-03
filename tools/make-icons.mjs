/* Genera le icone PNG dell'app.
 *
 * Servono per il manifest: Chrome vuole almeno un PNG da 192 e uno da
 * 512 per considerare il sito installabile, e senza installazione non
 * si ottiene la persistenza automatica dell'archivio.
 *
 * Un PNG a colori pieni e' scrivibile a mano in poche righe: firma,
 * IHDR, IDAT (le righe filtrate, sgonfiate con zlib) e IEND. Cosi' il
 * progetto resta senza dipendenze anche per le icone.
 *
 *   node tools/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const out = path.resolve(here, '..', 'icons');

/* --- CRC32, come lo vuole la specifica PNG --- */
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++){
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf){
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(width, height, rgb){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 2;    // truecolour RGB
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++){
    const row = y * (width * 3 + 1);
    raw[row] = 0;                       // filtro "none"
    for (let x = 0; x < width; x++){
      const i = (y * width + x) * 3;
      raw[row + 1 + x * 3]     = rgb[i];
      raw[row + 1 + x * 3 + 1] = rgb[i + 1];
      raw[row + 1 + x * 3 + 2] = rgb[i + 2];
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* --- il disegno: un tavolo verde con due reggimenti che si guardano --- */
const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const PAPER = hex('#f4f2ec'), FIELD = hex('#ccd0c0'), LINE = hex('#a8ad99');
const ARMY_A = hex('#9c3a2f'), ARMY_B = hex('#2c5c6b'), INK = hex('#1c1b18');

function draw(size, pad){
  const buf = new Uint8Array(size * size * 3);
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 3;
    buf[i] = c[0]; buf[i+1] = c[1]; buf[i+2] = c[2];
  };
  const rect = (x, y, w, h, c) => {
    for (let j = Math.round(y); j < Math.round(y + h); j++)
      for (let i = Math.round(x); i < Math.round(x + w); i++) put(i, j, c);
  };

  rect(0, 0, size, size, PAPER);
  const m = Math.round(size * pad);
  const inner = size - m * 2;
  rect(m, m, inner, inner, FIELD);

  // la mediana tratteggiata
  const midY = m + inner / 2, dash = Math.max(2, Math.round(inner / 22));
  for (let x = m; x < m + inner; x += dash * 2)
    rect(x, midY - Math.max(1, inner / 90), Math.min(dash, m + inner - x), Math.max(2, inner / 45), LINE);

  // due reggimenti: cinque basette di fronte, due ranghi
  const cell = inner / 11, gap = Math.max(1, Math.round(inner / 120));
  const block = (x0, y0, cols, rows, col) => {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        rect(x0 + c * (cell + gap), y0 + r * (cell + gap), cell, cell, col);
  };
  const wBlock = 5 * cell + 4 * gap;
  const left = m + (inner - wBlock) / 2;
  block(left, m + inner * 0.13, 5, 2, ARMY_B);
  block(left, m + inner * 0.60, 5, 2, ARMY_A);

  // cornice
  const bw = Math.max(1, Math.round(size / 64));
  rect(m, m, inner, bw, INK); rect(m, m + inner - bw, inner, bw, INK);
  rect(m, m, bw, inner, INK); rect(m + inner - bw, m, bw, inner, INK);
  return buf;
}

mkdirSync(out, { recursive: true });
const jobs = [
  ['icon-192.png', 192, 0.06],
  ['icon-512.png', 512, 0.06],
  /* maskable: i bordi vengono ritagliati, quindi il disegno sta piu' dentro */
  ['icon-maskable-512.png', 512, 0.18],
];
for (const [name, size, pad] of jobs){
  const file = path.join(out, name);
  writeFileSync(file, png(size, size, draw(size, pad)));
  console.log('scritto', name, size + 'x' + size);
}
