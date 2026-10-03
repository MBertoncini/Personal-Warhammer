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
import { aggiungi } from './archivia.mjs';
import { dalRegistro } from '../src/archivio.js';

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
   IL REGISTRO, RIGA PER RIGA
   Il lavoro lo fa `src/archivio.js` (`dalRegistro`), lo stesso che usa
   la scheda Partite dell'app per «Importa un registro». Qui restano gli
   argomenti, il disco e quello che si stampa.
   ============================================================ */
const testo = fs.readFileSync(path.resolve(fileRegistro), 'utf8');
const mia = ['A', 'B'].includes(arg('mia', '')) ? arg('mia') : '';
const tu = arg('tu', 'tu');
const { rep, guasti, mezzi, righe, verdettoArbitro: suo } = dalRegistro({
  S, liste: { A, B }, nomi, sc, testo,
  title: arg('titolo', '') || `${sc.label}: ${nomi.A} contro ${nomi.B}`,
  meta: {
    date: arg('data', BL.today()),
    event: arg('evento', `Sfida sul tavolo contro l'AI (src/controai.js)`),
    playerA: mia === 'A' ? tu : 'Gemini',
    playerB: mia === 'B' ? tu : 'Gemini',
    mine: mia,
    ...(arg('simulata', false) ? { simulata: true } : {}),
  },
});
if (!rep || guasti.length){
  console.error('Il registro non torna con le liste che gli ho dato:');
  for (const g of guasti) console.error('  · ' + g);
  console.error('\nControlla --liste (A prima di B): le elenca `node tools/partita.mjs --liste ?`.');
  process.exit(1);
}

const v = BL.verdict(rep);
/* `verdict` chiama gli eserciti con il nome della LISTA, che in questi
   scenari è il nome della mappa: qui il verdetto lo si scrive con le
   fazioni, che sono quelle con cui il registro racconta la partita */
const chiVince = v.winner ? `${nomi[v.winner]}: ${v.level}` : v.level;
/* Il verdetto che l'arbitro aveva scritto in coda al registro si
   riporta com'è. Se non coincide con questo — e può non coincidere —
   si vedono tutti e due, invece di scegliere di nascosto quale contare. */
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
console.log(`Registro: ${fileRegistro} — ${righe} righe, ${mezzi} mezzi turni.`);
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
