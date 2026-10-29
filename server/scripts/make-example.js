// Generates client/public/beispiel-tierlist.zip (JSON + small generated PNGs) to try the import.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import AdmZip from 'adm-zip';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** Square PNG with a two-colour diagonal gradient. */
function png(size, [r1, g1, b1], [r2, g2, b2]) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r1 + (r2 - r1) * t;
      raw[o + 1] = g1 + (g2 - g1) * t;
      raw[o + 2] = b1 + (b2 - b1) * t;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const fruits = [
  ['Apfel', 'Knackig, vielseitig, Klassiker.', 'apfel.png', [220, 40, 40], [250, 140, 60], 'Deutschland'],
  ['Banane', 'Praktisch verpackt, ideal für unterwegs.', 'banane.png', [250, 220, 50], [200, 170, 30], 'Ecuador'],
  ['Kiwi', 'Säuerlich und voller Vitamin C.', 'kiwi.png', [120, 180, 60], [90, 60, 30], 'Neuseeland'],
  ['Mango', 'Süß, saftig, tropisch.', 'mango.png', [250, 170, 40], [220, 60, 60], 'Indien'],
  ['Blaubeere', 'Klein, aber oho.', 'blaubeere.png', [60, 70, 180], [30, 30, 90], 'Polen'],
  ['Wassermelone', 'Der Sommer in Fruchtform.', 'wassermelone.png', [40, 150, 60], [240, 70, 90], 'Spanien'],
  ['Zitrone', 'Für Mutige.', 'zitrone.png', [250, 240, 80], [240, 200, 40], 'Italien'],
  ['Erdbeere', 'Botanisch eine Sammelnussfrucht.', 'erdbeere.png', [230, 30, 60], [120, 190, 70], 'Deutschland'],
];

const zip = new AdmZip();
zip.addFile(
  'tierlist.json',
  Buffer.from(
    JSON.stringify(
      {
        title: 'Bestes Obst',
        description: 'Welches Obst ist das beste? Zieht jede Frucht in einen Rang.',
        tiers: [
          { name: 'S', color: '#ff7f7f' },
          { name: 'A', color: '#ffbf7f' },
          { name: 'B', color: '#ffdf7f' },
          { name: 'C', color: '#ffff7f' },
          { name: 'D', color: '#bfff7f' },
        ],
        items: fruits.map(([name, description, image, , , herkunft]) => ({ name, description, image, herkunft })),
      },
      null,
      2,
    ),
  ),
);
for (const [, , file, c1, c2] of fruits) zip.addFile(`bilder/${file}`, png(128, c1, c2));

const out = path.resolve(import.meta.dirname, '../../client/public/beispiel-tierlist.zip');
fs.mkdirSync(path.dirname(out), { recursive: true });
zip.writeZip(out);
console.log(`Wrote ${out}`);
