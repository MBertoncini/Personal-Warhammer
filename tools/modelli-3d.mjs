/* Schieramento Old World — i modelli 3D per la vista del tavolo
 *
 * I modelli escono da Modly (immagine → mesh) belli ma enormi: 15-35 MB
 * e uno-due milioni di triangoli a miniatura, solo geometria, niente
 * texture. Un reggimento di venti cosi' non lo regge nessun browser.
 * Ma proprio perche' non hanno texture si possono ridurre quasi gratis:
 * a distanza di tavolo un Black Orc da dodicimila triangoli e uno da
 * due milioni sono la stessa miniatura.
 *
 * Questo script si lancia una volta (e di nuovo quando arrivano modelli
 * nuovi): per ogni posa prende la mesh migliore che c'e', la riduce, le
 * ricalcola le normali, la comprime e la mette in piedi con la basetta
 * centrata sull'origine, il fondo a y=0 e il lato lungo della basetta
 * lungo 1. Cosi' la vista la scala sulla basetta vera dell'unita' senza
 * sapere niente di come era uscita da Modly.
 *
 * Nell'indice si puo' scrivere a mano il `ruolo` di una posa che il nome
 * non dice ("standard", "musician", "champion"): lo script lo conserva.
 *
 * L'uscita va in `modelli-3d/`, che git ignora: i modelli sono per uso
 * personale e non devono finire ne' nel repository ne' nella Nuvola.
 *
 *   node tools/modelli-3d.mjs [--da <cartella armies>] [--fazioni a,b]
 *                             [--triangoli 12000] [--rifai]
 */

import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const DA = arg('--da', 'I:/Warhammer/3d/Modly/armies');
const FAZIONI = arg('--fazioni', '').split(',').filter(Boolean);
const TRIANGOLI = +arg('--triangoli', 12000);
const RIFAI = process.argv.includes('--rifai');
const OUT = path.resolve('modelli-3d');

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

/* la posa migliore: la versione hi3d se c'e', altrimenti quella base */
function sorgente(dir){
  const glb = fs.readdirSync(dir).filter(f => f.endsWith('.glb'));
  return glb.find(f => /hi3d/i.test(f)) || glb.find(f => f === 'model.glb') || glb[0];
}

/* La basetta: i vertici nella fetta piu' bassa del modello. Si prendono
   i percentili e non gli estremi perche' le mesh generate hanno qualche
   scheggia che sporge. */
function misura(pos){
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 1; i < pos.length; i += 3){ if (pos[i] < y0) y0 = pos[i]; if (pos[i] > y1) y1 = pos[i]; }
  const fetta = y0 + (y1 - y0) * 0.02;
  const xs = [], zs = [];
  for (let i = 0; i < pos.length; i += 3) if (pos[i + 1] <= fetta){ xs.push(pos[i]); zs.push(pos[i + 2]); }
  const pc = (a, p) => { a.sort((m, n) => m - n); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
  const bx0 = pc(xs, 0.005), bx1 = pc(xs, 0.995), bz0 = pc(zs, 0.005), bz1 = pc(zs, 0.995);
  return { y0, y1, cx:(bx0 + bx1) / 2, cz:(bz0 + bz1) / 2, bw:bx1 - bx0, bd:bz1 - bz0 };
}

/* ogni vertice prende la somma delle facce che lo toccano, pesate per
   l'area (il prodotto vettoriale non normalizzato lo fa da solo) */
function normaliLisce(pos, idx){
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3){
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]){ n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3){
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}

async function prepara(file, uscita){
  const doc = await io.read(file);
  const prims = doc.getRoot().listMeshes().flatMap(m => m.listPrimitives());
  const prima = prims.reduce((s, p) => s + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, TRIANGOLI / prima), error: 0.01, lockBorder: false }),
    prune(), dedup(),
  );

  /* in piedi sulla basetta, centrata, lato lungo = 1 */
  const tutte = [];
  for (const p of doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()))
    tutte.push(p.getAttribute('POSITION'));
  const unite = Float32Array.from(tutte.flatMap(a => Array.from(a.getArray())));
  const m = misura(unite);
  const s = 1 / Math.max(m.bw, m.bd);
  for (const a of tutte){
    const v = a.getArray();
    for (let i = 0; i < v.length; i += 3){
      v[i] = (v[i] - m.cx) * s; v[i + 1] = (v[i + 1] - m.y0) * s; v[i + 2] = (v[i + 2] - m.cz) * s;
    }
    a.setArray(v);
  }
  for (const n of doc.getRoot().listNodes()){ n.setTranslation([0, 0, 0]); n.setRotation([0, 0, 0, 1]); n.setScale([1, 1, 1]); }

  /* normali lisce, sulla mesh ancora indicizzata: quelle di
     gltf-transform sono piatte e staccano ogni triangolo dai vicini, e
     una scultura da dodicimila triangoli sembrerebbe fatta a faccette */
  for (const p of doc.getRoot().listMeshes().flatMap(m => m.listPrimitives()))
    p.setAttribute('NORMAL', doc.createAccessor().setType('VEC3')
      .setArray(normaliLisce(p.getAttribute('POSITION').getArray(), p.getIndices().getArray()))
      .setBuffer(doc.getRoot().listBuffers()[0]));
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  fs.mkdirSync(path.dirname(uscita), { recursive: true });
  await io.write(uscita, doc);

  const dopo = doc.getRoot().listMeshes().flatMap(m => m.listPrimitives())
    .reduce((t, p) => t + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
  return { prima, dopo, base: { w: +(m.bw * s).toFixed(3), d: +(m.bd * s).toFixed(3) },
           alto: +((m.y1 - m.y0) * s).toFixed(3) };
}

const indicePath = path.join(OUT, 'indice.json');
const vecchio = fs.existsSync(indicePath) ? JSON.parse(fs.readFileSync(indicePath, 'utf8')) : { pose: [] };
const pose = new Map(vecchio.pose.map(p => [p.file, p]));

for (const fazione of fs.readdirSync(DA)){
  if (FAZIONI.length && !FAZIONI.includes(fazione)) continue;
  const fdir = path.join(DA, fazione);
  if (!fs.statSync(fdir).isDirectory()) continue;
  for (const unita of fs.readdirSync(fdir)){
    const udir = path.join(fdir, unita);
    if (!fs.statSync(udir).isDirectory()) continue;
    for (const posa of fs.readdirSync(udir)){
      const pdir = path.join(udir, posa);
      if (!fs.statSync(pdir).isDirectory()) continue;
      const src = sorgente(pdir);
      if (!src) continue;
      const rel = `${fazione}/${unita}/${posa}.glb`;
      const uscita = path.join(OUT, rel);
      if (!RIFAI && pose.has(rel) && fs.existsSync(uscita)) continue;
      const t0 = Date.now();
      try {
        const r = await prepara(path.join(pdir, src), uscita);
        const kb = Math.round(fs.statSync(uscita).size / 1024);
        /* il ruolo scritto a mano nell'indice (stendardo, musico…) resta */
        const ruolo = pose.get(rel)?.ruolo;
        pose.set(rel, { file: rel, fazione, unita, posa, da: src, triangoli: r.dopo, kb, base: r.base, alto: r.alto,
                        ...(ruolo ? { ruolo } : {}) });
        console.log(`${rel}  ${Math.round(r.prima / 1000)}k → ${Math.round(r.dopo / 1000)}k tri, ${kb} KB, base ${r.base.w}×${r.base.d}, alto ${r.alto}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      } catch (e){
        console.log(`${rel}  ERRORE ${e.message}`);
      }
      fs.writeFileSync(indicePath, JSON.stringify({ pose: [...pose.values()] }, null, 1));
    }
  }
}
const tutte = [...pose.values()];
console.log(`\n${tutte.length} pose, ${(tutte.reduce((s, p) => s + p.kb, 0) / 1024).toFixed(1)} MB in tutto`);
