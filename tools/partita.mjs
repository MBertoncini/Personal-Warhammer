/* Schieramento Old World — una partita intera, dalla lista al verdetto
 *
 * Due liste dell'archivio, uno scenario, un seme, e una partita giocata
 * fino in fondo da chi non c'è: l'euristica di `agente.js`, o due
 * modelli di linguaggio che si affrontano.
 *
 * Si lancia così:
 *
 *   node tools/partita.mjs                      due euristiche
 *   node tools/partita.mjs --seme 42            la stessa partita, sempre uguale
 *   node tools/partita.mjs --scenario bm-rovine
 *   node tools/partita.mjs --liste 3,9          per numero (le elenca --liste ?)
 *   node tools/partita.mjs --gemini             se GEMINI_API_KEY è nell'ambiente
 *   node tools/partita.mjs --gemini A           solo l'esercito A è il modello
 *   node tools/partita.mjs --breve              solo il registro, senza i perché
 *   node tools/partita.mjs --html partita.html  la partita DA GUARDARE: una pagina sola
 *
 * Quello che stampa è pensato per essere LETTO: ogni mossa dice chi ha
 * scelto, perché, e cosa è successo, con la pagina del manuale accanto.
 * È il modo in cui questo progetto insegna il gioco — una partita
 * commentata vale dieci riassunti di regole.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as AR from '../src/arbitro.js';
import * as AG from '../src/agente.js';
import * as D from '../src/dice.js';
import * as PR from '../src/profiles.js';
import * as ARM from '../src/armies.js';
import * as PREP from '../src/prep.js';
import { SCENARIOS } from '../src/scenarios.js';
import { paginaHTML, fotogramma, coloreTerreno } from './replay.mjs';

const qui = path.dirname(fileURLToPath(import.meta.url));
const dati = f => JSON.parse(fs.readFileSync(path.join(qui, '..', 'dati', f), 'utf8'));

/* ---- gli argomenti ---- */
const argv = process.argv.slice(2);
const arg = (nome, def = null) => {
  const i = argv.indexOf('--' + nome);
  if (i < 0) return def;
  const v = argv[i + 1];
  return (v == null || v.startsWith('--')) ? true : v;
};
const seme = +arg('seme', 1) || 1;
const scenario = arg('scenario', 'bm-strada');
const breve = !!arg('breve', false);
const gemini = arg('gemini', false);
/* --html scrive la partita da guardare: una pagina sola, senza rete e
   senza chiavi dentro, che si apre con un doppio clic o si pubblica */
const html = arg('html', false);
const fileHtml = html === true ? 'partita.html' : html;

/* ---- i dadi, con il seme: la stessa partita si rigioca uguale ---- */
let s = seme >>> 0 || 1;
D.setSource(n => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; });

/* ---- i file che le liste non portano ---- */
PR.useProfiles(dati('profili.json'));
const idx = dati(path.join('eserciti', 'indice.json'));
ARM.useArmies(ARM.makeArmies((idx.file || []).map(f => dati(path.join('eserciti', f)))));

/* ---- le due liste ---- */
const liste = dati('liste.json');
const scelte = String(arg('liste', '') || '');
if (scelte === '?' || scelte === 'true'){
  liste.forEach((l, i) => {
    const p = PREP.playability(l, { split: PR.splitStat });
    console.log(`${String(i).padStart(2)}  ${l.name.padEnd(30)} ${String(l.points || 0).padStart(4)} pt  ` +
                `${l.units.length} unità  ${p.can ? '' : '⚠ ' + p.text}`);
  });
  process.exit(0);
}
let [iA, iB] = scelte ? scelte.split(',').map(n => +n) : [];
if (iA == null || Number.isNaN(iA)){
  /* di suo prende le due liste dello scenario, una per fazione */
  const dello = liste.filter(l => (l.points || 0) === (SCENARIOS[scenario] || {}).pts);
  const fazioni = [...new Set(dello.map(l => (l.info || {}).catalogue).filter(Boolean))];
  iA = liste.indexOf(dello.find(l => (l.info || {}).catalogue === fazioni[0]));
  iB = liste.indexOf(dello.find(l => (l.info || {}).catalogue === fazioni[1]));
}
const A = liste[iA], B = liste[iB];
if (!A || !B){ console.error('Non trovo le due liste: prova --liste ?'); process.exit(1); }

/* ---- si può giocare? ---- */
for (const [tag, l] of [['A', A], ['B', B]]){
  const p = PREP.playability(l, { split: PR.splitStat });
  if (!p.can) console.log(`⚠  ${tag} «${l.name}»: ${p.text}\n   La partita si gioca lo stesso, ma quei conti sono finti.\n`);
}

/* ---- gli agenti ---- */
const chiave = process.env.GEMINI_API_KEY || '';
const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const erroriModello = [];
const faiAgente = (tag, nome) => {
  const vuole = gemini === true || gemini === tag;
  if (!vuole) return AG.agenteEuristico({ nome: nome + ' (euristica)' });
  if (!chiave){
    console.log(`⚠  --gemini chiesto ma GEMINI_API_KEY non c'è: ${nome} gioca con l'euristica.`);
    return AG.agenteEuristico({ nome: nome + ' (euristica)' });
  }
  return AG.agenteGemini({ apiKey: chiave, model, nome: nome + ' (' + model + ')',
                           onError: e => erroriModello.push(e.message) });
};

const nomi = { A: (A.info || {}).catalogue || A.name, B: (B.info || {}).catalogue || B.name };
const S = AR.newBattle({ A, B, scenario, nomi });
const agenti = { A: faiAgente('A', nomi.A), B: faiAgente('B', nomi.B) };

/* ---- l'intestazione ---- */
const sc = SCENARIOS[scenario];
console.log('═'.repeat(72));
console.log(`  ${sc.label} — ${sc.pts || ''} punti, tavolo ${sc.table[0]}×${sc.table[1]}″`);
console.log(`  ${nomi.A} (${S.punti.A} pt, ${agenti.A.nome})`);
console.log(`  contro ${nomi.B} (${S.punti.B} pt, ${agenti.B.nome})`);
console.log(`  seme ${seme}: la stessa partita si rigioca identica`);
console.log('═'.repeat(72));
if (sc.desc) console.log(`\n${sc.desc}\n`);

/* ---- e si gioca ---- */
let visto = 0, casella = '', daScrivere = '';
const frames = [];
/* l'intestazione della casella si stampa solo se sotto ci finisce
   qualcosa: un turno in cui nessuno spara non deve lasciare un «TIRO»
   vuoto in mezzo al racconto */
const testa = () => { if (daScrivere){ console.log('\n── ' + daScrivere + ' ──'); daScrivere = ''; } };
const esito = await AG.giocaPartita(AR, S, {
  A: agenti.A, B: agenti.B,
  onPasso: ({ player, mossa, perche, esito }) => {
    const c = S.schierando ? 'schieramento' : (AR.CASELLE[S.casella] || {}).id;
    if (c !== casella){ casella = c; if (!breve) daScrivere = casella.toUpperCase(); }
    if (!breve && mossa && mossa.id !== 'avanti'){
      testa();
      console.log(`  ${nomi[player]}: ${perche}`);
    }
    if (S.log.length > visto) testa();
    const righe = S.log.slice(visto);
    for (const r of righe){
      const pag = r.page ? `  (p. ${r.page})` : '';
      console.log(`    T${r.turno} · ${r.text}${pag}` + (r.dice ? `   [${r.dice.join(' ')}]` : ''));
    }
    visto = S.log.length;
    if (html) frames.push(fotogramma(S, { AR,
      testo: righe.map(r => ({ t: r.text, p: r.page || 0, d: r.dice || null })),
      chi: nomi[player], perche: mossa && mossa.id !== 'avanti' ? perche : '' }));
    if (esito && !esito.ok) console.log(`    ⚠ mossa rifiutata: ${esito.text}`);
  },
});

/* ---- il verdetto ---- */
console.log('\n' + '═'.repeat(72));
console.log(`  ${esito.why}`);
console.log(`  ${nomi.A} ${esito.A} punti vittoria — ${nomi.B} ${esito.B}`);
console.log(`  ${esito.winner ? nomi[esito.winner] + ': ' + esito.label : esito.label} (${esito.why}, p. ${esito.page})`);
console.log('═'.repeat(72));

const vivi = tag => AR.inCampo(S, tag).map(u =>
  `${u.name} ${Math.max(0, (u.models || 0) - (u.lost || 0))}/${u.models}${u.fled ? ' in fuga' : ''}`).join(', ');
console.log(`\nIn campo alla fine — ${nomi.A}: ${vivi('A') || 'nessuno'}`);
console.log(`                     ${nomi.B}: ${vivi('B') || 'nessuno'}`);

if (S.detto.size){
  console.log('\nQuello che questa partita NON ha giocato:');
  for (const id of S.detto){
    const l = AR.LIMITI.find(x => x.id === id);
    if (l) console.log(`  · ${l.what} — ${l.why}${l.page ? ` (p. ${l.page})` : ''}`);
  }
}
if (html){
  /* Il terreno e le zone non cambiano mai durante la partita: stanno
     nell'intestazione una volta sola, e i fotogrammi portano solo i
     pezzi che si muovono. */
  const pagina = paginaHTML({
    meta: {
      titolo: `${sc.label} — ${nomi.A} contro ${nomi.B}`,
      sotto: `${S.punti.A} contro ${S.punti.B} punti · seme ${seme} · ` +
             `${agenti.A.nome} contro ${agenti.B.nome} · ${esito.winner ? nomi[esito.winner] + ', ' + esito.label : esito.label}`,
      piede: 'Ogni riga porta la pagina del manuale da cui viene. Quello che questa partita non ha giocato: ' +
             ([...S.detto].map(id => (AR.LIMITI.find(x => x.id === id) || {}).what).filter(Boolean).join('; ') || 'niente') + '.',
      w: S.table.w, h: S.table.h, nomi,
      terreno: S.terrain.map(t => ({ x: t.x, y: t.y, w: t.w, h: t.h, rot: t.rot, colore: coloreTerreno(t.kind) })),
      zone: [...(S.zones.A || []).map(z => ({ ...z, army:'A' })), ...(S.zones.B || []).map(z => ({ ...z, army:'B' }))],
    },
    frames,
  });
  fs.writeFileSync(fileHtml, pagina);
  console.log(`\nLa partita da guardare: ${fileHtml} (${frames.length} fotogrammi, ${Math.round(pagina.length / 1024)} KB)`);
  console.log('Aprila con un doppio clic, o mettila online: dentro non c\'è nessuna chiave e non chiama nessuno.');
}
if (erroriModello.length)
  console.log(`\n⚠  il modello non ha scelto ${erroriModello.length} volte: ${[...new Set(erroriModello)].slice(0, 3).join('; ')}`);
