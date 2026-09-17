/* Schieramento Old World — un registro scritto altrove, nell'archivio
 *
 * `tools/partita.mjs --archivia` sa mettere nel diario una partita che
 * ha appena giocato: ha lo stato del tavolo sotto mano, e fotografa
 * dove sta ognuno a ogni mezzo turno. La sfida della scheda Matchup
 * (`src/controai.js`) no: la partita vive nella scheda, e quando hai
 * finito resta il registro — le righe dell'arbitro, con la pagina del
 * manuale accanto — e nient'altro.
 *
 * Questo strumento prende QUELLE RIGHE e ne fa una voce del diario.
 * Non inventa il tavolo: le fotografie sono quelle della compilazione
 * a mano (`BL.blankTurn`, la stessa che usa la scheda Partite per una
 * partita giocata con le miniature), cioe' senza posizioni. Quello che
 * dal registro si legge davvero — chi ha perso quanti modelli in che
 * mezzo turno, chi e' caduto, chi e' scappato — quello si ricostruisce,
 * e il punteggio lo rifa' `battlelog.js` da solo.
 *
 * Le posizioni mancanti NON si indovinano: il report lo dice nelle
 * note, perche' un tavolo inventato e' peggio di un tavolo assente.
 *
 * Si lancia cosi':
 *
 *   node tools/archivia-registro.mjs partita.txt --liste 3,4
 *   node tools/archivia-registro.mjs partita.txt --liste 3,4 --mia A
 *   node tools/archivia-registro.mjs partita.txt --liste 3,4 --archivia
 *
 * Senza `--archivia` non scrive niente: stampa quello che ha capito e
 * il punteggio che ne viene, che e' il modo di controllarlo prima di
 * toccare `dati/partite.json`. Se il registro porta nomi che le due
 * liste non hanno, lo dice e si ferma: vuol dire che le liste sono
 * sbagliate, e una partita archiviata contro le liste sbagliate e' una
 * partita finta.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as AR from '../src/arbitro.js';
import * as PR from '../src/profiles.js';
import * as ARM from '../src/armies.js';
import * as MG from '../src/magic.js';
import * as BL from '../src/battlelog.js';
import * as VC from '../src/victory.js';
import { SCENARIOS } from '../src/scenarios.js';
import { statoDi, aggiungi } from './archivia.mjs';

const qui = path.dirname(fileURLToPath(import.meta.url));
const dati = f => JSON.parse(fs.readFileSync(path.join(qui, '..', 'dati', f), 'utf8'));

/* ---- gli argomenti ---- */
const argv = process.argv.slice(2);
const NOTI = ['liste', 'scenario', 'mia', 'tu', 'evento', 'data', 'titolo', 'archivia', 'simulata'];
const valori = {};
const sciolti = [];
for (let i = 0; i < argv.length; i++){
  const a = argv[i];
  if (!a.startsWith('--')){ sciolti.push(a); continue; }
  const nome = a.slice(2);
  const parole = [];
  while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) parole.push(argv[++i]);
  if (!NOTI.includes(nome)){
    console.error(`Non so cosa farne: ${a}. Gli argomenti che conosco: ${NOTI.map(n => '--' + n).join(' ')}.`);
    process.exit(1);
  }
  valori[nome] = parole.length ? (nome === 'liste' ? parole.join('') : parole.join(' ')) : true;
}
const arg = (n, d = null) => n in valori ? valori[n] : d;
const fileRegistro = sciolti[0];
if (!fileRegistro){
  console.error('Serve il file del registro: node tools/archivia-registro.mjs partita.txt --liste 3,4');
  process.exit(1);
}

/* ---- i file che le liste non portano ---- */
PR.useProfiles(dati('profili.json'));
const idx = dati(path.join('eserciti', 'indice.json'));
ARM.useArmies(ARM.makeArmies((idx.file || []).map(f => dati(path.join('eserciti', f)))));
const magia = MG.useMagic(MG.makeMagic(dati(path.join('magia', 'domini.json'))));

/* ---- le due liste ---- */
const liste = dati('liste.json');
const scelte = String(arg('liste', '') || '');
if (!/^\d+,\d+$/.test(scelte)){
  console.error('--liste vuole i due numeri delle liste separati da una virgola, A prima di B. ' +
                'Li elenca `node tools/partita.mjs --liste ?`.');
  process.exit(1);
}
const [iA, iB] = scelte.split(',').map(n => +n);
const A = liste[iA], B = liste[iB];
if (!A || !B){ console.error(`Non trovo le liste ${iA} e ${iB}.`); process.exit(1); }

const scenario = arg('scenario', 'bm-strada');
if (!SCENARIOS[scenario]){
  console.error(`Scenario «${scenario}» sconosciuto. Ci sono: ${Object.keys(SCENARIOS).join(', ')}.`);
  process.exit(1);
}
const sc = SCENARIOS[scenario];

/* i nomi con cui l'arbitro scrive il registro: il catalogo della lista,
   come fa `controai.js` */
const nomi = { A: (A.info && A.info.catalogue) || A.name, B: (B.info && B.info.catalogue) || B.name };
if (nomi.A === nomi.B){ nomi.A += ' (A)'; nomi.B += ' (B)'; }

const S = AR.newBattle({ A, B, scenario, nomi, magia });

/* ============================================================
   1 · IL REGISTRO, RIGA PER RIGA
   Ogni riga e' «T<numero> <testo> (p. <pagina>)». Il numero e' il
   round; chi lo sta giocando lo dicono le righe di passaggio di mano.
   ============================================================ */
const testo = fs.readFileSync(path.resolve(fileRegistro), 'utf8');
const righe = testo.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

const tagDi = nome => nome === nomi.A ? 'A' : nome === nomi.B ? 'B' : '';

const schieramento = [];          // le righe prima che cominci il turno 1
const mezzi = [];                 // { n, army, righe: [] }
let corrente = null;
const guasti = [];

const INIZIO = /^Schieramento finito: comincia il turno (\d+), muove (.+)$/;
const TURNO  = /^Turno (\d+): muove (.+)$/;

for (const riga of righe){
  const m = riga.match(/^T(\d+)\s+(.*)$/);
  if (!m){ guasti.push(`riga senza turno: «${riga}»`); continue; }
  /* via le pagine in coda e i punti fermi, a strati: una riga porta la
     pagina della regola dentro la frase e quella del gesto dopo il
     punto — «… dentro Temple Guard (p. 207). (p. 207)» — e togliendone
     una sola resta una parentesi attaccata al nome. Quello che resta e'
     la frase, ed e' su quella che si riconosce chi ha fatto cosa. */
  let testoRiga = m[2], prima;
  do { prima = testoRiga;
       testoRiga = testoRiga.replace(/\s*\(p\.\s*\d+\)\s*$/, '').replace(/\.\s*$/, '');
  } while (testoRiga !== prima);
  const voce = { n: +m[1], testo: testoRiga, intero: riga };

  const inizio = testoRiga.match(INIZIO), turno = testoRiga.match(TURNO);
  if (inizio || turno){
    const [, n, chi] = inizio || turno;
    const army = tagDi(chi);
    if (!army) guasti.push(`«${chi}» non è nessuno dei due eserciti (${nomi.A}, ${nomi.B})`);
    if (inizio) schieramento.push(voce);
    corrente = { n: +n, army, righe: inizio ? [] : [voce] };
    mezzi.push(corrente);
    continue;
  }
  (corrente ? corrente.righe : schieramento).push(voce);
}
if (!mezzi.length){ console.error('Nel registro non trovo nessun turno.'); process.exit(1); }

/* ============================================================
   2 · CHI HA PERSO COSA
   Le righe che tolgono modelli dal tavolo sono quattro, e sono quelle
   che `arbitro.js` scrive: il tiro (p. 136), l'assalto (p. 144), i
   colpi di un incantesimo, e le due frasi che chiudono un'unita'.
   Tutto il resto e' racconto e finisce negli eventi del turno.
   ============================================================ */
/* Il nome si prende per intero, mai a pezzi di frase: una riga come
   «… La raggiunge, e Skink Skirmishers 2 è travolta e distrutta» ha
   davanti alla frase mezza carica, e un gruppo di cattura generoso si
   porta via anche quella. Quindi non si indovina: si cerca, fra i nomi
   che le due liste hanno davvero, quello con cui il pezzo di riga
   finisce — il piu' lungo, che «Stone Troll Mobs 1» e «Stone Troll
   Mobs» non si confondano. */
const perNome = [...S.units].sort((a, b) => b.name.length - a.name.length);
function inCoda(pezzo, dove){
  const t = String(pezzo || '').trim();
  const u = perNome.find(x => t === x.name || t.endsWith(' ' + x.name));
  if (!u) guasti.push(`in «${dove}» non riconosco l'unità: «${t}»`);
  return u || null;
}

/* le righe che tolgono modelli dal tavolo: il tiro (p. 136), l'assalto
   (p. 144) e i colpi di un incantesimo */
const PERSE = [
  { re: /^(.*?) tira su (.+?) con .+? da [\d.]+″: .*?(\d+) a terra(?: \[.*?\])?$/, chi: 2, quanti: 3 },
  { re: /^(.*?) colpi su (.+?): .*?(\d+) a terra$/,                                   chi: 2, quanti: 3 },
  { re: /^(.*?): \d+ colp\S+ a Forza .*?(\d+) a terra$/,                             chi: 1, quanti: 2 },
];
/* e quelle che chiudono un'unita', o la mandano via */
const MORTE = [
  /^(.*?) è travolta e distrutta$/,
  /^(.*?): non resta nessuno in piedi$/,
  /^(.*?) (?:ripiega|fugge) .*oltre il bordo, ed esce dal tavolo$/,
];
const FUGGE  = [/^(.*?) rompe e fugge di/, /^(.*?) va nel panico e fugge/];
const RADUNO = /^(.*?), raduno: /;
/* Chi sta dentro chi (p. 207). Serve a una cosa sola, e pesa: un
   reggimento TRAVOLTO si porta via i capi che ha dentro (`posa` in
   `arbitro.js`), e il registro quei capi non li nomina — sparisce il
   reggimento e basta. Un reggimento abbattuto in combattimento invece
   li lascia in piedi (`perdite` li stacca prima), e infatti la riga e'
   un'altra: «non resta nessuno in piedi». Le due frasi sono due
   destini diversi per chi ci stava dentro. */
const UNISCI  = [/^(.*?) si schiera dentro (.+)$/, /^(.*?) percorre [\d.]+″ e si unisce a (.+?)(?:,.*)?$/];
const SEPARA  = /^(.*?) esce da (?:.+?) e resta da solo/;
const TRAVOLTA = /è travolta e distrutta$|oltre il bordo, ed esce dal tavolo$/;

/* chi sta dentro chi, adesso: si riempie allo schieramento e cambia
   quando qualcuno si unisce o esce */
const dentro = new Map();         // uid del capo -> uid del reggimento

/* le righe in fila come le ha scritte l'arbitro, lo schieramento
   compreso: i capi entrano nei reggimenti prima che cominci il turno 1 */
for (const mezzo of [{ righe: schieramento, perse: new Map(), morti: new Set(), fughe: new Map() }, ...mezzi]){
  mezzo.perse = mezzo.perse || new Map();   // uid -> modelli persi in questo mezzo turno
  mezzo.morti = mezzo.morti || new Set();
  mezzo.fughe = mezzo.fughe || new Map();   // uid -> sta fuggendo sì o no
  for (const r of mezzo.righe){
    for (const re of UNISCI){
      const m = r.testo.match(re);
      if (!m) continue;
      const c = inCoda(m[1], r.testo), h = inCoda(m[2], r.testo);
      if (c && h) dentro.set(c.uid, h.uid);
      break;
    }
    const sep = r.testo.match(SEPARA);
    if (sep){ const c = inCoda(sep[1], r.testo); if (c) dentro.delete(c.uid); }
    for (const p of PERSE){
      const m = r.testo.match(p.re);
      if (!m) continue;
      const u = inCoda(m[p.chi], r.testo);
      const quanti = +m[p.quanti] || 0;
      if (u && quanti) mezzo.perse.set(u.uid, (mezzo.perse.get(u.uid) || 0) + quanti);
      break;
    }
    for (const re of MORTE){
      const m = r.testo.match(re);
      if (!m) continue;
      const u = inCoda(m[1], r.testo);
      if (!u) break;
      mezzo.morti.add(u.uid);
      for (const [capo, host] of [...dentro]){
        if (host !== u.uid) continue;
        if (TRAVOLTA.test(r.testo)) mezzo.morti.add(capo);
        dentro.delete(capo);
      }
      break;
    }
    for (const re of FUGGE){
      const m = r.testo.match(re);
      if (!m) continue;
      const u = inCoda(m[1], r.testo);
      if (u) mezzo.fughe.set(u.uid, true);
      break;
    }
    const rad = r.testo.match(RADUNO);
    if (rad){
      const u = inCoda(rad[1], r.testo);
      /* il raduno riuscito e' quello che non finisce con «continua a fuggire» */
      if (u) mezzo.fughe.set(u.uid, /continua a fuggire/.test(r.testo));
    }
  }
}

if (guasti.length){
  console.error('Il registro non torna con le liste che gli ho dato:');
  for (const g of [...new Set(guasti)]) console.error('  · ' + g);
  console.error('\nControlla --liste (A prima di B): le elenca `node tools/partita.mjs --liste ?`.');
  process.exit(1);
}

/* ============================================================
   3 · IL REPORT
   Prima il report vuoto, che porta il ruolino delle due liste; poi le
   fotografie, una per mezzo turno, riempite con quello che il registro
   dice. `recount` rifa' i progressivi e `applyAuto` il punteggio.
   ============================================================ */
const evento = arg('evento', `Sfida sul tavolo contro l'AI (src/controai.js)`);
const mia = ['A', 'B'].includes(arg('mia', '')) ? arg('mia') : '';
const tu = arg('tu', 'tu');
/* quanti round erano previsti lo dice il formato dello scenario, e in
   Battle March sono cinque, non sei (Battle March p. 27) */
const formato = VC.FORMATS[VC.formatFor(sc)] || VC.FORMATS.core;
const gioco = {
  meta: BL.ensureMeta({
    date: arg('data', BL.today()),
    event: evento,
    playerA: mia === 'A' ? tu : 'Gemini',
    playerB: mia === 'B' ? tu : 'Gemini',
    mine: mia,
    first: mezzi[0].army || 'A',
    pts: sc.pts || 0,
    rounds: formato.rounds || 6,
    ...(arg('simulata', false) ? { simulata: true } : {}),
  }),
  turns: [], score: null, notes: '', log: [], counters: {},
};
const rep = BL.buildReport(statoDi(S, { liste: { A, B }, gioco }), sc,
                           { title: arg('titolo', '') || `${sc.label}: ${nomi.A} contro ${nomi.B}` });

/* La fotografia dello schieramento senza il tavolo: tutti in campo,
   nessuna perdita, e le righe dello schieramento come eventi. Le
   posizioni restano a zero — il registro dice «sinistra», «centro», non
   dice i pollici. */
rep.turns = [{
  kind: 'deploy', n: 0, army: '', at: Date.now(),
  units: [...rep.roster.A, ...rep.roster.B].map(c => ({
    uid: c.uid, army: c.army, name: c.name, models: c.models,
    alive: c.models, lost: 0, dLost: 0, dead: false, fled: false, placed: true,
    x: 0, y: 0, rot: c.army === 'A' ? 0 : 180, moved: 0, zone: '',
  })),
  events: schieramento.map(r => r.intero), note: '',
}];

for (const mezzo of mezzi){
  const t = BL.blankTurn(rep, { n: mezzo.n, army: mezzo.army });
  for (const r of t.units){
    r.dLost = mezzo.perse.get(r.uid) || 0;
    if (mezzo.morti.has(r.uid)) r.dead = true;
    if (mezzo.fughe.has(r.uid)) r.fled = mezzo.fughe.get(r.uid);
    /* un'unità caduta in questo mezzo turno ha perso tutto quello che
       le restava: il registro conta i modelli a terra uno per uno, ma
       chi viene travolto sparisce senza che nessuno li conti */
    if (r.dead) r.dLost = Math.max(r.dLost, (r.models || 0) - (r.lost || 0));
  }
  t.events = mezzo.righe.map(r => r.intero);
  rep.turns.push(t);
}
BL.recount(rep);
BL.applyAuto(rep);

/* il registro sciolto, come lo tiene la scheda Partite: il più recente
   in cima */
rep.log = [];
for (const mezzo of mezzi)
  for (const r of mezzo.righe)
    rep.log.unshift({ t: mezzo.n, army: mezzo.army, phase: '', step: '',
                      type: 'note', text: r.intero, at: Date.now() });
rep.log = rep.log.slice(0, 200);

const v = BL.verdict(rep);
/* `verdict` chiama gli eserciti con il nome della LISTA, che in questi
   scenari è il nome della mappa: qui il verdetto lo si scrive con le
   fazioni, che sono quelle con cui il registro racconta la partita */
const chiVince = v.winner ? `${nomi[v.winner]}: ${v.level}` : v.level;
/* Il verdetto che l'arbitro aveva scritto in coda al registro si
   riporta com'è. Se non coincide con questo — e può non coincidere —
   si vedono tutti e due, invece di scegliere di nascosto quale contare. */
const suo = (mezzi[mezzi.length - 1].righe.find(r => /^Partita finita/.test(r.testo)) || {}).testo || '';
rep.notes = [
  `Partita giocata sul tavolo dell'app contro l'AI (scheda Matchup, «Sfida l'AI sul tavolo»): ` +
    `le mosse di un esercito le ha scelte chi gioca, quelle dell'altro Gemini, e la partita l'ha tenuta ` +
    `l'arbitro (src/arbitro.js).`,
  `Archiviata dal registro con tools/archivia-registro.mjs: la sfida vive nella scheda e non salva il ` +
    `tavolo, quindi di ogni turno c'è quello che il registro dice — perdite, cadute, fughe, e le righe ` +
    `con la pagina del manuale — e NON ci sono le posizioni. Le coordinate delle fotografie sono a zero: ` +
    `non sono un tavolo, sono un posto vuoto. Neanche gli obiettivi ci sono: chi teneva i tesori alla ` +
    `fine di ogni turno lo dice il tavolo, e il registro non lo scrive.`,
  `Punteggio rifatto dal ruolino: ${nomi.A} ${v.A} — ${nomi.B} ${v.B}. ${chiVince} — ${v.book.why} ` +
    `(${v.format === 'bm' ? 'Battle March ' : ''}p. ${v.book.page}).`,
  suo ? `In coda al registro l'arbitro aveva scritto: «${suo}».` : '',
].filter(Boolean).join('\n\n');

/* ---- quello che si è capito ---- */
console.log(`Registro: ${fileRegistro} — ${righe.length} righe, ${mezzi.length} mezzi turni.`);
console.log(`Liste: A = ${iA} «${A.name}» (${nomi.A}), B = ${iB} «${B.name}» (${nomi.B}).`);
console.log(`Scenario: ${sc.label} (${scenario}), ${sc.pts} punti.`);
console.log('\nCom\'è finita, unità per unità:');
for (const tag of ['A', 'B']){
  console.log(`  ${nomi[tag]}:`);
  for (const c of rep.roster[tag]){
    const r = BL.finalUnits(rep).find(x => x.uid === c.uid) || {};
    console.log(`    ${c.name.padEnd(24)} ${String(r.alive ?? c.models).padStart(3)}/${String(c.models).padEnd(3)}` +
                (r.dead ? '  distrutta' : r.fled ? '  in fuga' : ''));
  }
}
console.log(`\nPunteggio (lo rifà battlelog.js dal ruolino): ${nomi.A} ${v.A} — ${nomi.B} ${v.B}`);
console.log(`  ${chiVince} — ${v.book.why} (${v.format === 'bm' ? 'Battle March ' : ''}p. ${v.book.page})`);
if (suo) console.log(`  in coda al registro l'arbitro aveva scritto: «${suo}»`);

const archivia = arg('archivia', false);
if (!archivia){
  console.log('\nNiente è stato scritto. Con --archivia finisce in dati/partite.json.');
} else {
  const file = archivia === true ? path.join(qui, '..', 'dati', 'partite.json') : archivia;
  const quante = aggiungi(file, rep);
  console.log(`\nNel diario: ${file} (${rep.turns.length} fotografie, ${quante} partite in tutto).`);
  console.log('Nell\'app arriva con la Nuvola: prima «Salva su GitHub» dall\'app, poi push di questo file, poi «Scarica».');
}
