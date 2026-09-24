/* Schieramento Old World — tante candidate contro tante liste, in parallelo
 *
 *   node tools/liste/valuta.mjs --file tools/liste/esempi.mjs --cand ogOrdaNera,lizGuardia
 *        [--contro liz,og,skf,sko] [--scenari sei] [--partite 16] [--seme 1001] [--lavori 11]
 *
 * Il file delle candidate è un modulo che esporta `CANDIDATE`: per ogni
 * chiave { name, cat, units, prep, note } (vedi esempi.mjs). --cand ne
 * sceglie alcune; senza, le prova tutte. Si scrivono in un file
 * temporaneo e ogni serie la gioca `gioca.mjs` in un processo suo, tanti
 * insieme quanti --lavori: una serie usa un processore solo.
 *
 * --contro vuole liste dell'archivio, per id o per nome, oppure uno dei
 * nomi brevi qui sotto: le quattro liste da 800 punti con cui sono state
 * cercate le liste di esempi.mjs.
 *
 * Quello che si è imparato cercandole, e che il default di questo file
 * ricorda:
 *   - sempre a specchio (gioca.mjs lo fa da sé): lato e primo turno
 *     altrimenti si confondono con la lista;
 *   - sei scenari, non uno: su uno solo una lista può vincere per il
 *     terreno, o perché un'unità avversaria non trova posto;
 *   - fra due serie di semi diversi la stessa lista cambia anche di 10-15
 *     punti percentuali, e tutte le candidate insieme: si sceglie con 16
 *     semi o più, e la vincitrice si riprova su semi mai usati.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lista, avvisiComposizione } from './unita.mjs';

const qui = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(qui, '..', '..');
const BREVI = { liz: 'lmubp2kimjzhw', og: 'lmucdz1grir4h', skf: 'lmubp01267euf', sko: 'lmuegsxz4wod0' };
const SEI = ['sxmu9q80qdc65', 'sxprova-profondo', 'sxprova-boschi', 'bm-strada', 'bm-rovine', 'open'];

const argv = process.argv.slice(2);
const arg = (k, def) => { const i = argv.indexOf('--' + k); return i < 0 ? def : (argv[i + 1] ?? def); };
const file = arg('file', null);
if (!file){ console.error('Serve --file con le candidate (vedi tools/liste/esempi.mjs).'); process.exit(1); }
const { CANDIDATE } = await import(pathToFileURL(path.resolve(file)).href);
const chiavi = String(arg('cand', Object.keys(CANDIDATE).join(','))).split(',').filter(Boolean);
for (const k of chiavi) if (!CANDIDATE[k]){ console.error(`«${k}» non è fra le candidate di ${file}.`); process.exit(1); }
const contro = String(arg('contro', 'liz,og,skf,sko')).split(',').filter(Boolean);
const scenari = arg('scenari', 'sei') === 'sei' ? SEI : String(arg('scenari')).split(',');
const partite = +arg('partite', 16), seme = +arg('seme', 1001);
const lavori = +arg('lavori', Math.max(1, os.cpus().length - 1));

/* le candidate, nel file che leggono i processi */
const candidate = chiavi.map(k => lista(CANDIDATE[k], 'cand-' + k));
for (const l of candidate){
  const av = avvisiComposizione(l);
  console.log(`${l.id.padEnd(22)} ${String(l.points).padStart(4)} pt  ${l.units.map(u => (u.models > 1 ? u.models + ' ' : '') + u.name).join(', ')}` +
              (av.length ? `  ⚠ ${av.join(', ')}` : ''));
}
const tmp = path.join(os.tmpdir(), `candidate-${process.pid}.json`);
fs.writeFileSync(tmp, JSON.stringify(candidate));

const archivio = JSON.parse(fs.readFileSync(path.join(REPO, 'dati', 'liste.json'), 'utf8'));
const avversario = c => BREVI[c] || (archivio.find(l => l.id === c || l.name === c) || {}).id;
for (const c of contro) if (!avversario(c)){ console.error(`Non trovo la lista avversaria «${c}».`); process.exit(1); }

const gioca = (c, o, s) => new Promise(res => {
  const p = spawn(process.execPath, [path.join(qui, 'gioca.mjs'), '--x', 'cand-' + c, '--y', avversario(o), '--scenario', s,
    '--partite', String(partite), '--seme', String(seme), '--candidate', tmp, '--json'], { cwd: REPO });
  let out = '', err = '';
  p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
  p.on('close', () => { try { res({ c, o, s, ...JSON.parse(out.trim().split('\n').pop()) }); } catch (_){ res({ c, o, s, errore: (err || out).slice(0, 600) }); } });
});

const coda = [];
for (const c of chiavi) for (const o of contro) for (const s of scenari) coda.push([c, o, s]);
const fatti = [];
let i = 0;
await Promise.all(Array.from({ length: Math.min(lavori, coda.length) }, async () => {
  while (i < coda.length){ const j = coda[i++]; fatti.push(await gioca(...j)); if (process.stdout.isTTY) process.stdout.write(`\r  ${fatti.length}/${coda.length}`); }
}));
if (process.stdout.isTTY) process.stdout.write('\r' + ' '.repeat(20) + '\r');
fs.rmSync(tmp, { force: true });

const pc = (a, n) => String(Math.round(100 * a / (n || 1))).padStart(3);
const somma = {};
const aggiungi = (k, r) => { const t = somma[k] ||= { w: 0, l: 0, d: 0, peggiore: 1 }; t.w += r.vince.x; t.l += r.vince.y; t.d += r.pari;
  t.peggiore = Math.min(t.peggiore, r.vince.x / r.partite); };
fatti.sort((a, b) => chiavi.indexOf(a.c) - chiavi.indexOf(b.c) || contro.indexOf(a.o) - contro.indexOf(b.o) || scenari.indexOf(a.s) - scenari.indexOf(b.s));
for (const r of fatti){
  if (r.errore){ console.log(`${r.c} contro ${r.o} su ${r.s}: ERRORE\n${r.errore}`); continue; }
  const n = r.partite;
  const f = Object.entries(r.fuori || {}).map(([k, v]) => `${k} fuori ${v}`).join(', ');
  console.log(`${r.c.padEnd(12)} contro ${r.o.padEnd(4)} su ${r.s.padEnd(16)} vince ${pc(r.vince.x, n)}%  perde ${pc(r.vince.y, n)}%  pari ${pc(r.pari, n)}%` +
              `   punti ${r.vp.x}–${r.vp.y}${f ? '   ⚠ ' + f : ''}`);
  aggiungi(r.c, r); aggiungi(r.c + '@' + r.o, r);
}
console.log('\nvinte/perse in percentuale, per avversario:');
for (const c of chiavi) console.log('  ' + c.padEnd(14) + contro.map(o => { const t = somma[c + '@' + o]; if (!t) return ''; const n = t.w + t.l + t.d;
  return `${o} ${pc(t.w, n)}/${pc(t.l, n)}`; }).join('   '));
console.log('\ntutto insieme (e lo scenario-avversario peggiore):');
for (const c of chiavi){ const t = somma[c]; if (!t) continue; const n = t.w + t.l + t.d;
  console.log(`  ${c.padEnd(14)} vince ${pc(t.w, n)}%  perde ${pc(t.l, n)}%  peggiore ${pc(t.peggiore, 1)}%   (${n} partite)`); }
