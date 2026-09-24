/* Schieramento Old World — chi batte chi, scenario per scenario
 *
 *   node tools/liste/torneo.mjs [--punti 800] [--scenari tutti|sei|bm-strada,...] [--semi 5]
 *        [--archivio] [--liste id,id] [--seme 7001] [--lavori 7]
 *
 * Le ricerche dicono quanto vale una lista contro gli avversari con cui è
 * stata cercata. Il torneo risponde all'altra domanda, quella di chi
 * sceglie uno scenario: con quello che ho, su QUESTO tavolo, quali
 * partite vengono equilibrate e quali no?
 *
 * Gioca la migliore di ogni ricerca a questi punti contro tutte le altre,
 * su ogni scenario, a specchio, --semi semi per coppia (le partite sono il
 * doppio: con meno di dieci una casella dice poco). --archivio aggiunge
 * le liste dell'archivio vicine ai punti (±6%), --liste quelle che dici
 * tu. Il risultato va in
 * dati/ricerche/torneo-<punti>.json e la scheda Laboratorio lo disegna
 * come una tabella: righe contro colonne, uno scenario alla volta.
 *
 * Una ricerca rifatta cambia la sua lista migliore: il torneo va rifatto,
 * e la scheda lo dice quando il torneo è più vecchio delle ricerche.
 */
import fs from 'node:fs';
import path from 'node:path';
import { apriMotore, SEI, scenariTutti, REPO } from './motore.mjs';
import { FAZIONI, fazioneDi } from './spazio.mjs';
import { scrivi, campioni } from './ricerche.mjs';

const argv = process.argv.slice(2);
const arg = (k, def) => { const i = argv.indexOf('--' + k); return i < 0 ? def : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };

const punti = +arg('punti', 800), semi = Math.max(1, +arg('semi', 5)), seme = +arg('seme', 7001);
const TUTTI = await scenariTutti();
const sc = String(arg('scenari', 'tutti'));
const scenari = sc === 'sei' ? SEI : sc === 'tutti' ? Object.keys(TUTTI) : sc.split(',');
for (const s of scenari) if (!TUTTI[s]){ console.error(`Scenario «${s}» sconosciuto.`); process.exit(1); }

const archivio = JSON.parse(fs.readFileSync(path.join(REPO, 'dati', 'liste.json'), 'utf8'));
const liste = [];
for (const c of campioni(punti)){
  const d = c.doc, fz = FAZIONI[d.fazione];
  const coda = d.scenari.length === 1 ? ` (${d.scenari[0]})` : d.scenari.length !== SEI.length || !SEI.every(s => d.scenari.includes(s)) ? ` (${d.scenari.length} scenari)` : '';
  liste.push({ id: c.lista.id, name: `${fz.sigla} ${d.pool === 'collezione' ? 'collezione' : 'libera'}${coda}`, fazione: d.fazione,
    pool: d.pool, fonte: 'ricerca', file: c.file, points: c.lista.points, descrizione: d.migliori[0].descrizione, lista: c.lista });
}
const dallArchivio = l => ({ id: l.id, name: l.name, fazione: fazioneDi((l.info || {}).catalogue), pool: 'archivio', fonte: 'archivio',
  points: l.points, descrizione: (l.units || []).map(u => (u.models > 1 ? u.models + ' ' : '') + u.name).join('; '), lista: l });
if (arg('archivio', false) === true)
  for (const l of archivio) if ((l.units || []).length && fazioneDi((l.info || {}).catalogue) && Math.abs(l.points - punti) <= punti * 0.06) liste.push(dallArchivio(l));
if (arg('liste', null)) for (const x of String(arg('liste')).split(',')){
  const l = archivio.find(l => l.id === x || l.name === x);
  if (!l){ console.error(`Non trovo la lista «${x}».`); process.exit(1); }
  liste.push(dallArchivio(l));
}
/* la stessa lista trovata da due ricerche — con tutte le unità e con la
   collezione — gioca una volta sola: contro sé stessa misurerebbe solo
   l'estro dell'euristica, che da solo fa anche otto partite a zero */
const firma = l => JSON.stringify((l.lista.units || []).map(u => [u.name, u.models, u.pts, u.frontage]));
const uniche = [];
for (const l of liste){
  const gia = uniche.find(m => m.id === l.id || firma(m) === firma(l));
  if (!gia){ uniche.push(l); continue; }
  if (gia.id === l.id) continue;
  gia.name += ' = ' + (l.pool === 'collezione' ? 'collezione' : l.name);
  if (l.pool === 'collezione') gia.pool = 'collezione';
}
if (uniche.length < 2){
  console.error(`Servono almeno due liste: a ${punti} punti ci sono ${uniche.length} ricerche. Lancia prima cerca.mjs, o aggiungi --archivio.`);
  process.exit(1);
}

const coppie = [];
for (let i = 0; i < uniche.length; i++) for (let j = i + 1; j < uniche.length; j++) for (const s of scenari) coppie.push([uniche[i], uniche[j], s]);
const totale = coppie.length * semi * 2;
const motore = await apriMotore({ lavori: +arg('lavori', 0) || undefined });
console.log(`${uniche.length} liste, ${scenari.length} scenari, ${semi} semi: ${totale} partite con ${motore.lavori} lavoratori`);
for (const l of uniche) console.log(`  ${l.name.padEnd(28)} ${String(l.points).padStart(4)} pt  ${l.descrizione.replace(/ — \d+ pt/g, '')}`);

const t0 = Date.now();
const celle = {};
let fatte = 0;
await Promise.all(coppie.map(([a, b, s]) => motore.gioca({ x: a.lista, y: b.lista, scenario: s, partite: semi, seme }).then(r => {
  celle[`${s}|${a.id}|${b.id}`] = { w: r.vince.x, l: r.vince.y, d: r.pari, n: r.n };
  fatte += r.n;
  if (process.stdout.isTTY) process.stdout.write(`\r  ${fatte}/${totale} partite, ${Math.round((Date.now() - t0) / 1000)}s`);
}, e => { console.error(`\n${a.name} contro ${b.name} su ${s}: ${e.message.split('\n')[0]}`); })));
if (process.stdout.isTTY) process.stdout.write('\n');
await motore.chiudi();

/* in terminale: per ogni lista, quante ne vince su tutti gli scenari */
const pc = (a, n) => String(Math.round(100 * a / (n || 1))).padStart(3);
for (const a of uniche){
  const t = { w: 0, l: 0, n: 0 };
  for (const [k, c] of Object.entries(celle)){
    const [, x, y] = k.split('|');
    if (x === a.id){ t.w += c.w; t.l += c.l; t.n += c.n; }
    if (y === a.id){ t.w += c.l; t.l += c.w; t.n += c.n; }
  }
  console.log(`  ${a.name.padEnd(28)} vince ${pc(t.w, t.n)}%  perde ${pc(t.l, t.n)}%  (${t.n} partite)`);
}

scrivi(`torneo-${punti}.json`, {
  formato: 'tow-torneo/1', quando: new Date().toISOString(), punti, semi, seme, partite: fatte,
  secondi: Math.round((Date.now() - t0) / 1000),
  scenari: scenari.map(id => ({ id, label: TUTTI[id].label || id, group: TUTTI[id].group || 'Miei', pts: TUTTI[id].pts || null })),
  liste: uniche.map(({ lista, ...l }) => ({ ...l, units: (lista.units || []).length })),
  celle,
});
console.log(`scritto dati/ricerche/torneo-${punti}.json`);
