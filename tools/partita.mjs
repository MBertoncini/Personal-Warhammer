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
 *   node tools/partita.mjs --scenario sxmttrgusdc7c   uno dei tuoi, da dati/scenari.json
 *   node tools/partita.mjs --liste 3,9          per numero (le elenca --liste ?)
 *   node tools/partita.mjs --liste lmtl5r4mb97yl,lmubp01267euf   o per id
 *   node tools/partita.mjs --gemini             se GEMINI_API_KEY è nell'ambiente
 *   node tools/partita.mjs --gemini A           solo l'esercito A è il modello
 *   node tools/partita.mjs --gemini --pausa 8000  più lento, per le quote strette
 *   node tools/partita.mjs --breve              solo il registro, senza i perché
 *   node tools/partita.mjs --html partita.html  la partita DA GUARDARE: una pagina sola
 *   node tools/partita.mjs --archivia           e anche nel diario, dati/partite.json
 *   node tools/partita.mjs --partite 100        cento partite, semi 1..100, e solo il conto
 *   node tools/partita.mjs --partite 100 --estro  e ognuna con un piano diverso dell'euristica
 *   node tools/partita.mjs --partite 300 --estro --heatmap mappa.html   e la mappa, unità per unità
 *   node tools/partita.mjs --partite 150 --specchio   ogni seme due volte, con le liste scambiate di lato:
 *                                               separa quanto vale la lista, il lato e il primo turno
 *   node tools/partita.mjs --ricerca A          la parte A guarda una mossa avanti (src/ricerca.js)
 *   node tools/partita.mjs --partite 100 --specchio --ricerca x   quanto vale guardare avanti, con lo specchio
 *   node tools/partita.mjs --partite 60 --estro --esperimento "Temple Guard"
 *                                               l'esperimento: la stessa partita cinque volte per seme,
 *                                               con quell'unità della lista A in ognuna delle cinque colonne
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
import * as CB from '../src/combat.js';
import * as MG from '../src/magic.js';
import { SCENARIOS } from '../src/scenarios.js';
import * as FM from '../src/formation.js';
import { paginaHTML, fotogramma, coloreTerreno, stessoTavolo, COLORI,
         pezziDellaPagina, fotoDellaCollezione, terrenoDellaPagina } from './replay.mjs';
import { raccoglitore, paginaHeatmap } from './heatmap.mjs';
import * as ARCH from './archivia.mjs';
import * as SE from './serie.mjs';
import { agenteRicerca } from '../src/ricerca.js';

const qui = path.dirname(fileURLToPath(import.meta.url));
const dati = f => JSON.parse(fs.readFileSync(path.join(qui, '..', 'dati', f), 'utf8'));

/* Gli scenari: quelli del regolamento e quelli disegnati sul tavolo
   dell'app, che con l'Archivio arrivano in dati/scenari.json con lo
   stesso id che hanno nell'app. */
const mieiScenari = (() => { try { return dati('scenari.json') || []; } catch (_){ return []; } })();
const TUTTI = { ...SCENARIOS,
  ...Object.fromEntries(mieiScenari.filter(s => s && s.id && s.table && s.deploy)
                                   .map(s => [s.id, { ...s, group: 'Miei scenari' }])) };

/* ---- gli argomenti ----
   Un valore puo' arrivare spezzato dalla shell: «--liste 3, 9» sono due
   parole, «3,» e «9». Prima si leggeva solo la prima, «3,» diventava
   [3, 0] e la partita si giocava contro la lista 0 senza dire niente.
   Adesso le parole fino al prossimo «--» si rimettono insieme, e quelle
   che nessuno legge si dicono. */
const argv = process.argv.slice(2);
const NOTI = ['seme', 'scenario', 'breve', 'gemini', 'html', 'pausa', 'liste', 'archivia', 'partite', 'estro', 'heatmap', 'specchio', 'esperimento', 'ricerca'];
const valori = {};
const ignoti = [];
for (let i = 0; i < argv.length; i++){
  const a = argv[i];
  if (!a.startsWith('--')){ ignoti.push(a); continue; }
  const nome = a.slice(2);
  const parole = [];
  while (i + 1 < argv.length && !argv[i + 1].startsWith('--')) parole.push(argv[++i]);
  if (!NOTI.includes(nome)){ ignoti.push(a); continue; }
  /* solo --liste accetta piu' parole; per gli altri la seconda e'
     un argomento vagante */
  if (nome === 'liste'){ valori[nome] = parole.length ? parole.join('') : true; continue; }
  valori[nome] = parole.length ? parole[0] : true;
  ignoti.push(...parole.slice(1));
}
if (ignoti.length){
  console.error(`Non so cosa farne: ${ignoti.join(' ')}. Gli argomenti che conosco: ${NOTI.map(n => '--' + n).join(' ')}.`);
  process.exit(1);
}
const arg = (nome, def = null) => nome in valori ? valori[nome] : def;
const seme = +arg('seme', 1) || 1;
const scenario = arg('scenario', 'bm-strada');
const breve = !!arg('breve', false);
const gemini = arg('gemini', false);
/* --html scrive la partita da guardare: una pagina sola, senza rete e
   senza chiavi dentro, che si apre con un doppio clic o si pubblica */
const html = arg('html', false);
/* quanti millisecondi fra una domanda al modello e l'altra: le quote
   gratuite contano le richieste al minuto, e una partita ne fa un
   centinaio */
const pausa = +arg('pausa', 4500) || 0;
const fileHtml = html === true ? 'partita.html' : html;
/* --archivia mette la partita nel diario, in testa a dati/partite.json
   (o al file che gli si dice): con la Nuvola arriva nella scheda
   Partite dell'app, marcata come simulata */
const archivia = arg('archivia', false);
/* --partite N gioca N partite di fila, una per seme (seme, seme+1, ...),
   e invece del racconto stampa il conto: chi vince quante volte. Solo
   con l'euristica — cento partite di un modello sono diecimila domande
   — e senza pagina ne' diario, che sono di una partita sola. */
const partite = arg('partite', null) === null ? 1 : Math.floor(+arg('partite'));
if (!(partite >= 1)){
  console.error(`--partite vuole un numero intero da 1 in su (è arrivato «${arg('partite')}»).`);
  process.exit(1);
}
if (partite > 1 && (gemini || html || archivia)){
  console.error("--partite con più di una partita gioca solo l'euristica, senza --gemini, --html né --archivia.");
  process.exit(1);
}
/* --estro: l'euristica non gioca sempre lo stesso piano. Senza, due
   partite con semi diversi si schierano identiche e si separano solo
   quando i dadi dicono cose diverse (vedi `pianoDa` in agente.js). */
const estro = !!arg('estro', false);
/* --specchio: ogni seme due volte, la seconda con le liste scambiate di
   lato (tools/serie.mjs). Senza, lista e lato del tavolo sono la stessa
   cosa e nessun conto li puo' separare. */
const specchio = !!arg('specchio', false);
/* --ricerca: chi guarda una mossa avanti (src/ricerca.js). «A» o «B»
   in una partita sola, «x» o «y» in una serie (le liste, non le zone:
   con lo specchio una lista gioca da tutti e due i lati); da solo,
   tutte e due. */
const ricerca = arg('ricerca', false);
const guardaAvanti = t => ricerca === true || ricerca === t ||
  (ricerca === 'A' && t === 'x') || (ricerca === 'B' && t === 'y') || (ricerca === 'x' && t === 'A') || (ricerca === 'y' && t === 'B');
/* --esperimento NOME: un'unita' della lista A, messa in ogni colonna
   con gli stessi dadi (tools/serie.mjs, L'ESPERIMENTO) */
const esperimento = arg('esperimento', false);
if (esperimento && (partite < 3 || esperimento === true)){
  console.error("--esperimento vuole il nome di un'unità della lista A e --partite da 3 in su (i semi).");
  process.exit(1);
}
if (specchio && partite < 2){
  console.error('--specchio va con --partite: una partita sola non ha niente da confrontare.');
  process.exit(1);
}
/* --heatmap mappa.html: le N partite guardate tutte insieme, unità per
   unità — dove parte, dove passa i turni, dove combatte e muore, e come
   va la partita in ciascun caso (tools/heatmap.mjs) */
const heatmap = arg('heatmap', false);
const fileHeatmap = heatmap === true ? 'mappa.html' : heatmap;
if (heatmap && partite < 2){
  console.error('--heatmap guarda tante partite insieme: va con --partite (per esempio --partite 300).');
  process.exit(1);
}
const fileArchivio = archivia === true ? path.join(qui, '..', 'dati', 'partite.json') : archivia;
if (!TUTTI[scenario]){
  console.error(`Scenario «${scenario}» sconosciuto. Ci sono: ${Object.keys(SCENARIOS).join(', ')}` +
                (mieiScenari.length ? `, e i tuoi: ${mieiScenari.map(s => `${s.id} («${s.label}»)`).join(', ')}` : '') +
                ". Uno scenario appena disegnato nell'app arriva in dati/scenari.json solo con l'Archivio.");
  process.exit(1);
}

/* ---- i dadi, con il seme: la stessa partita si rigioca uguale ---- */
D.setSource(D.seeded(seme));

/* ---- i file che le liste non portano ---- */
PR.useProfiles(dati('profili.json'));
const idx = dati(path.join('eserciti', 'indice.json'));
ARM.useArmies(ARM.makeArmies((idx.file || []).map(f => dati(path.join('eserciti', f)))));
/* i domini e le schede dei maghi: senza, la magia non si gioca */
const magia = MG.useMagic(MG.makeMagic(dati(path.join('magia', 'domini.json'))));

/* ---- le due liste ---- */
const liste = dati('liste.json');
const scelte = String(arg('liste', '') || '');
if (scelte === '?' || scelte === 'true'){
  liste.forEach((l, i) => {
    const p = PREP.playability(l, { split: PR.splitStat });
    console.log(`${String(i).padStart(2)}  ${l.name.padEnd(30)} ${String(l.points || 0).padStart(4)} pt  ` +
                `${String(l.units.length).padStart(2)} unità  ${l.id}  ${p.can ? '' : '⚠ ' + p.text}`);
  });
  process.exit(0);
}
let iA, iB;
if (scelte){
  /* un numero, o l'id della lista: il comando copiato dalla scheda
     Matchup usa l'id, che non cambia quando l'archivio si riordina */
  const trova = p => /^\d+$/.test(p) ? (+p < liste.length ? +p : -1) : liste.findIndex(l => l.id === p);
  const pezzi = scelte.split(',').map(p => p.trim());
  const indici = pezzi.map(trova);
  if (pezzi.length !== 2 || indici.some(i => i < 0)){
    console.error(`--liste vuole due liste separate da una virgola, per numero (fra 0 e ${liste.length - 1}) o per id ` +
                  `(è arrivato «${scelte}»). Le liste si elencano con --liste ?; una lista appena fatta nell'app ` +
                  "arriva in dati/liste.json solo con l'Archivio.");
    process.exit(1);
  }
  [iA, iB] = indici;
} else {
  /* di suo prende le due liste dello scenario, una per fazione */
  const dello = liste.filter(l => (l.points || 0) === (TUTTI[scenario] || {}).pts);
  const fazioni = [...new Set(dello.map(l => (l.info || {}).catalogue).filter(Boolean))];
  iA = liste.indexOf(dello.find(l => (l.info || {}).catalogue === fazioni[0]));
  iB = liste.indexOf(dello.find(l => (l.info || {}).catalogue === fazioni[1]));
}
const A = liste[iA], B = liste[iB];
if (!A || !B){ console.error('Non trovo le due liste: prova --liste ?'); process.exit(1); }

/* La fazione: la dice il catalogo della lista. Una lista scritta a mano
   non ce l'ha, e allora si guarda chi sono le sue unita' — la fazione
   scritta su ognuna, o quella della tavola dei profili — e se nessuno
   lo sa si dice. */
const fazioneDi = l => {
  const c = (l.info || {}).catalogue;
  if (c) return { nome: c, dedotta: false };
  const voti = new Map();
  for (const u of l.units || []){
    const f = u.faction || (PR.profileFor(u) || {}).faction;
    if (f) voti.set(f, (voti.get(f) || 0) + 1);
  }
  const best = [...voti].sort((a, b) => b[1] - a[1])[0];
  return best ? { nome: best[0], dedotta: true } : { nome: l.name, dedotta: true, ignota: true };
};
const faz = { A: fazioneDi(A), B: fazioneDi(B) };
const puntiDi = l => (l.units || []).reduce((s, u) => s + (u.pts || 0), 0);
console.log(`Liste: A = ${iA} «${A.name}», ${faz.A.nome}, ${puntiDi(A)} pt` +
            `\n       B = ${iB} «${B.name}», ${faz.B.nome}, ${puntiDi(B)} pt`);

/* Gli avvisi non restano in console: finiscono anche in cima alla
   pagina da guardare. Una partita ha girato con un esercito a
   caratteristiche zero, la console lo diceva a meta', e la pagina
   taceva. */
const avvisi = [];
const avvisa = testo => { console.log('⚠  ' + testo); avvisi.push(testo); };

for (const t of ['A', 'B']){
  const l = t === 'A' ? A : B;
  if (faz[t].ignota) avvisa(`${t}: la lista non dice la fazione e le unità non la fanno capire: la chiamo «${l.name}».`);
  else if (faz[t].dedotta) avvisa(`${t}: la lista «${l.name}» non dice la fazione; dalle unità sembra ${faz[t].nome}.`);
}
{
  const pa = puntiDi(A), pb = puntiDi(B);
  if (Math.abs(pa - pb) > 0.1 * Math.max(pa, pb))
    avvisa(`le due liste non si equivalgono: ${pa} contro ${pb} punti.`);
  const pts = (TUTTI[scenario] || {}).pts;
  if (pts && (pa > pts * 1.05 || pb > pts * 1.05))
    avvisa(`lo scenario «${scenario}» è pensato per ${pts} punti.`);
}

/* ---- si può giocare? ---- */
for (const [tag, l] of [['A', A], ['B', B]]){
  const p = PREP.playability(l, { split: PR.splitStat });
  if (!p.can) avvisa(`${tag} «${l.name}»: ${p.text}. La partita si gioca lo stesso, ma quei conti sono finti.`);
  /* Il profilo lo completa la tavola, il tipo di truppa e le armi no:
     una lista scritta a mano senza questi due gioca con fanteria
     regolare al posto di tutto e non spara mai. */
  const senzaTipo = (l.units || []).filter(u => !String(u.troop || '').trim()).map(u => u.name);
  const senzaArmi = (l.units || []).filter(u => !(u.weapons || []).length).map(u => u.name);
  if (senzaTipo.length)
    avvisa(`${tag}: ${senzaTipo.length} unità senza tipo di truppa (${[...new Set(senzaTipo)].join(', ')}): ` +
           'contano come fanteria regolare.');
  if (senzaArmi.length === (l.units || []).length)
    avvisa(`${tag}: nessuna unità ha le armi scritte: nessuno sparerà.`);
}

/* ---- gli agenti ---- */
const chiave = process.env.GEMINI_API_KEY || '';
const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const erroriModello = [];
/* L'euristica, con o senza estro. Il generatore dell'estro nasce dal
   seme della partita e dalla parte, e non tocca quello dei dadi: la
   partita col seme 42 e l'estro e' la stessa da sola e dentro una serie. */
const euristica = (tag, nome, s) => AG.agenteEuristico({
  nome: nome + (estro ? ' (euristica con estro)' : ' (euristica)'),
  estro: estro ? D.seeded(((s * 2654435761) ^ (tag === 'A' ? 0x51ed27 : 0xa3c1f5)) >>> 0) : null,
});
const faiAgente = (tag, nome) => {
  const vuole = gemini === true || gemini === tag;
  if (!vuole && guardaAvanti(tag))
    return agenteRicerca({ AR, base: euristica(tag, nome, seme), nome: nome + ' (guarda avanti)', seme });
  if (!vuole) return euristica(tag, nome, seme);
  if (!chiave){
    avvisa(`--gemini chiesto ma GEMINI_API_KEY non c'è: ${nome} gioca con l'euristica.`);
    return euristica(tag, nome, seme);
  }
  return AG.agenteGemini({ apiKey: chiave, model, nome: nome + ' (' + model + ')',
                           attesa: pausa,
                           onError: e => erroriModello.push(e.message) });
};

const nomi = { A: faz.A.nome, B: faz.B.nome };
if (nomi.A === nomi.B){ nomi.A += ' (A)'; nomi.B += ' (B)'; }
const S = AR.newBattle({ A, B, scenario, def: TUTTI[scenario], nomi, magia });
const agenti = { A: faiAgente('A', nomi.A), B: faiAgente('B', nomi.B) };
const conModello = Object.values(agenti).some(a => !/euristica/.test(a.nome));

/* Il controllo della lista guarda il file; questo guarda il tavolo, che
   e' quello che si gioca. Un'unita' con Resistenza zero, o senza
   nessuna Abilita', vuol dire un profilo che sul tavolo non si trova. */
for (const tag of ['A', 'B']){
  const zero = AR.unitsOf(S, tag).filter(u => {
    const c = CB.combatant(u);
    return !(c.t > 0) || !(c.ws > 0 || c.bs > 0);
  });
  if (zero.length)
    avvisa(`${tag}: ${zero.length} unità giocano senza profilo (${[...new Set(zero.map(u => u.baseName || u.name))].join(', ')}): ` +
           'Resistenza o Abilità a zero.');
}

/* ---- l'esperimento: una scelta sola, gli stessi dadi ---- */
if (esperimento){
  const cerca = String(esperimento).toLowerCase();
  const indice = (A.units || []).findIndex(u => String(u.name).toLowerCase() === cerca);
  const ind = indice >= 0 ? indice : (A.units || []).findIndex(u => String(u.name).toLowerCase().includes(cerca));
  if (ind < 0){
    console.error(`Nella lista A («${A.name}») non c'è un'unità «${esperimento}». Ci sono: ${(A.units || []).map(u => u.name).join(', ')}.`);
    process.exit(1);
  }
  const sc = TUTTI[scenario];
  console.log(`\nL'esperimento: ${A.units[ind].name} in ognuna delle cinque colonne, ${partite} semi, «${sc.label}»` +
              (estro ? ', euristica con estro' : ', euristica senza estro') + '…');
  const t0 = Date.now();
  const righe = await SE.esperimentoSchieramento({
    AR, AG, D, liste: { x: A, y: B }, nomi: { x: nomi.A, y: nomi.B }, scenario, def: TUTTI[scenario], magia,
    partite, seme, indice: ind,
    agente: (lista, nome, s) => AG.agenteEuristico({ nome, estro: estro ? D.seeded(SE.semeEstro(s, lista)) : null }),
    avanzamento: (k, n) => { if (process.stdout.isTTY) process.stdout.write(`\r  ${k}/${n}`); },
  });
  if (process.stdout.isTTY) process.stdout.write('\r' + ' '.repeat(20) + '\r');
  console.log('═'.repeat(72));
  for (const r of SE.righeEsperimento(SE.analizzaEsperimento(righe), `${A.units[ind].name} di ${nomi.A}`)) console.log(r);
  console.log('═'.repeat(72));
  console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(0);
}

/* ---- tante partite: solo il conto ---- */
if (partite > 1){
  const sc = TUTTI[scenario];
  const quante = partite * (specchio ? 2 : 1);
  console.log(`\n${quante} partite su «${sc.label}», semi ${seme}–${seme + partite - 1}` +
              (specchio ? ', ognuno giocato due volte con le liste scambiate di lato' : '') +
              (ricerca ? ', con chi guarda una mossa avanti' : ', euristica contro euristica') +
              (estro ? ', con l’estro…' : ', senza estro: cambiano solo i dadi…'));
  const t0 = Date.now();
  /* le liste della serie si chiamano x e y: A e B sono le zone, e con
     lo specchio una lista le gira tutte e due */
  const nomeDi = { x: nomi.A.replace(/ \(A\)$/, ' (x)'), y: nomi.B.replace(/ \(B\)$/, ' (y)') };
  const mappa = heatmap ? raccoglitore({ AR, FM, nomiListe: nomeDi }) : null;
  const tutte = await SE.giocaSerie({
    AR, AG, D, liste: { x: A, y: B }, nomi: nomeDi, scenario, def: TUTTI[scenario], magia,
    partite, seme, specchio, osservatore: mappa,
    agente: (lista, nome, s) => {
      const e = AG.agenteEuristico({
        nome: nome + (estro ? ' (euristica con estro)' : ' (euristica)'),
        estro: estro ? D.seeded(SE.semeEstro(s, lista)) : null,
      });
      return guardaAvanti(lista) ? agenteRicerca({ AR, base: e, nome: nome + ' (guarda avanti)', seme: s }) : e;
    },
    avanzamento: (k, n) => { if (process.stdout.isTTY) process.stdout.write(`\r  ${k}/${n}`); },
  });
  if (process.stdout.isTTY) process.stdout.write('\r' + ' '.repeat(20) + '\r');
  if (ricerca) console.log(`  guarda una mossa avanti: ${['x', 'y'].filter(guardaAvanti).map(t => nomeDi[t]).join(' e ')}`);

  const an = SE.analizza(tutte);
  const media = f => (tutte.reduce((s, x) => s + f(x), 0) / tutte.length);
  console.log('═'.repeat(72));
  for (const r of SE.righeAnalisi(an, nomeDi)) console.log(r);
  console.log('═'.repeat(72));
  console.log(`  punti vittoria in media: ${nomeDi.x} ${media(x => x.vp.x).toFixed(0)}, ${nomeDi.y} ${media(x => x.vp.y).toFixed(0)}`);
  console.log(`  finita in media al turno ${media(x => x.turno).toFixed(1)}`);
  const perEsito = new Map();
  for (const x of tutte){
    const k = x.vincitore ? `${nomeDi[x.vincitore]}: ${x.label}` : x.label;
    perEsito.set(k, (perEsito.get(k) || 0) + 1);
  }
  console.log('\n  come sono finite:');
  for (const [k, n] of [...perEsito].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(4)}  ${k}`);
  /* se i dadi non spostano niente, tante partite dicono quanto una */
  const diverse = new Set(tutte.map(x => `${x.vincitore}|${x.vp.x}|${x.vp.y}`)).size;
  console.log(`\n  risultati diversi: ${diverse} su ${tutte.length}` +
              (diverse === 1 ? ' — i dadi non cambiano niente: è sempre la stessa partita' : ''));
  /* le unita' rimaste fuori dal tavolo, contate per lista: 300 partite
     con un'unita' sempre fuori sono 300 partite di un'altra lista */
  const fuori = new Map();
  for (const x of tutte) for (const f of x.fuori || []){
    const k = `${nomeDi[f.lista]}: ${f.name} (${f.pts} pt)`;
    fuori.set(k, (fuori.get(k) || 0) + 1);
  }
  for (const [k, n] of fuori)
    avvisa(`${k} è rimasta fuori dal tavolo in ${n} partite su ${tutte.length}: non trovava posto nella zona.`);
  const schieramenti = new Set(tutte.map(x => x.schierati)).size;
  console.log(`  schieramenti diversi: ${schieramenti} su ${tutte.length}` +
              (schieramenti === 1 ? ' — si schiera sempre uguale, e le partite si separano solo ai dadi' : ''));

  if (estro){
    console.log('\n  quali piani contano (regressione sullo scarto di punti, tutte le scelte insieme):');
    for (const r of SE.righePiani(SE.analizzaPiani(tutte), nomeDi)) console.log(r);
  }
  /* solo le partite del primo giro: in quelle dello specchio le liste
     stanno scambiate, e una partita sola le rimette al loro posto */
  const netta = t => tutte.filter(x => x.vincitore === t && !x.giro).sort((a, b) => Math.abs(b.vp.x - b.vp.y) - Math.abs(a.vp.x - a.vp.y))[0];
  for (const t of ['x', 'y']){
    const x = netta(t);
    if (x){
      console.log(`  la vittoria più netta di ${nomeDi[t]}: seme ${x.seme} (${x.vp[t]}–${x.vp[SE.ALTRA[t]]}) → node tools/partita.mjs ` +
                  `--liste ${A.id},${B.id} --scenario ${scenario} --seme ${x.seme}${estro ? ' --estro' : ''} --html partita.html`);
    }
  }
  if (mappa){
    const d = mappa.dati();
    const avvisiMappa = [...avvisi];
    if (!estro) avvisiMappa.push("senza --estro l'euristica si schiera sempre uguale: la mappa dello schieramento ha un posto solo per unità, e le altre due mostrano solo cosa cambiano i dadi.");
    if (d.meta.terreniDiversi > 1) avvisiMappa.push(`il terreno di questo scenario cambia da una partita all'altra (${d.meta.terreniDiversi} tavoli diversi): quello disegnato è della prima, e le caselle mescolano tavoli diversi.`);
    if (tutte.length < 200) avvisiMappa.push(`${tutte.length} partite sono poche per una mappa unità per unità: i colori restano chiari quasi ovunque, perché la mappa li schiarisce da sola dove le partite non bastano.`);
    const pagina = paginaHeatmap({
      dati: d,
      titolo: `${sc.label} — ${nomeDi.x} contro ${nomeDi.y}: la mappa di ${tutte.length} partite`,
      sotto: `${nomeDi.x} vince ${an.vince.x}, ${nomeDi.y} ${an.vince.y}, pareggi ${an.pareggi} · semi ${seme}–${seme + partite - 1}` +
             (specchio ? ' a specchio' : '') + ` · euristica${estro ? ' con estro' : ''} · ${schieramenti} schieramenti diversi`,
      avvisi: avvisiMappa, colori: COLORI, coloreTerreno,
    });
    fs.writeFileSync(fileHeatmap, pagina);
    console.log(`\n  la mappa: ${fileHeatmap} (${Math.round(pagina.length / 1024)} KB) — si apre con un doppio clic, senza rete`);
  }
  console.log(`\n  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(0);
}

/* ---- l'intestazione ---- */
const sc = TUTTI[scenario];
console.log('═'.repeat(72));
console.log(`  ${sc.label}${sc.pts ? ` — ${sc.pts} punti` : ""}, tavolo ${sc.table[0]}×${sc.table[1]}″` + (sc.group ? ` (${sc.group})` : ""));
console.log(`  ${nomi.A} (${S.punti.A} pt, ${agenti.A.nome})`);
console.log(`  contro ${nomi.B} (${S.punti.B} pt, ${agenti.B.nome})`);
console.log(conModello
  ? `  seme ${seme}: i dadi sono gli stessi, le scelte del modello no`
  : `  seme ${seme}: la stessa partita si rigioca identica`);
if (estro) for (const t of ['A', 'B']){
  const p = agenti[t].piano;
  if (p) console.log(`  piano di ${t}: carica da ${Math.round(p.carica * 100)}%, marcia oltre ${p.marcia}″, ` +
                     `sfida sopra ${p.sfida}, ${p.tieniTiro ? 'resta fermo a tirare' : 'avanza anche a tiro'}, ` +
                     `${p.unisci ? 'capi nei reggimenti' : 'capi da soli'}, comincia a schierare a ${AG.COLONNE[p.colonne[0]]}`);
}
console.log('═'.repeat(72));
if (sc.desc) console.log(`\n${sc.desc}\n`);

/* ---- e si gioca ---- */
let visto = 0, casella = '', daScrivere = '';
const frames = [];
/* l'intestazione della casella si stampa solo se sotto ci finisce
   qualcosa: un turno in cui nessuno spara non deve lasciare un «TIRO»
   vuoto in mezzo al racconto */
const testa = () => { if (daScrivere){ console.log('\n── ' + daScrivere + ' ──'); daScrivere = ''; } };
const diario = archivia ? ARCH.registro(S, {
  liste: { A, B },
  meta: {
    event: `Partita simulata: ${agenti.A.nome} contro ${agenti.B.nome}`,
    playerA: agenti.A.nome, playerB: agenti.B.nome,
    first: S.primo, pts: sc.pts || 0, rounds: S.rounds,
    simulata: true, seme,
  },
}) : null;
const esito = await AG.giocaPartita(AR, S, {
  A: agenti.A, B: agenti.B,
  onPasso: ({ player, mossa, perche, esito, opzioni, agente }) => {
    /* la casella e il turno sono quelli in cui la mossa e' stata
       scelta: dopo la mossa l'arbitro puo' essere gia' andato avanti */
    const c = opzioni.fase === 'Incantesimi' ? 'incantesimi'
            : opzioni.fase === 'Schieramento' ? 'schieramento' : (opzioni.casella || '');
    if (c !== casella){ casella = c; if (!breve) daScrivere = casella.toUpperCase(); }
    /* Passare quando c'era altro da fare e' una scelta, e si scrive col
       suo perche'. Prima il registro taceva: interi turni di movimento
       vuoti, e non si capiva se l'arbitro non offriva niente o se chi
       giocava aveva detto «basta». */
    const passa = mossa && mossa.id === 'avanti';
    const scelta = !passa || opzioni.list.length > 1;
    const detto = !mossa ? '' : passa ? (scelta ? `passa (${opzioni.list.length - 1} mosse possibili): ${perche}` : '') : perche;
    if (!breve && detto){
      testa();
      console.log(`  ${nomi[player]}: ${detto}`);
    }
    if (S.log.length > visto) testa();
    const righe = S.log.slice(visto);
    for (const r of righe){
      const pag = r.page ? `  (p. ${r.page})` : '';
      const dadi = r.groups ? r.groups.map(g => `${g.what} ${g.dice.join(' ')}`).join(' · ') : (r.dice || []).join(' ');
      console.log(`    T${r.turno} · ${r.text}${pag}` + (dadi ? `   [${dadi}]` : ''));
    }
    visto = S.log.length;
    const rifiutata = esito && !esito.ok && mossa && mossa.id !== 'avanti';
    if (rifiutata) console.log(`    ⚠ mossa rifiutata: ${esito.text}`);
    if (diario) diario.passo({ chi: nomi[player], perche: detto, righe });
    if (html){
      const testo = righe.map(r => ({ t: r.text, p: r.page || 0, d: r.dice && r.dice.length ? r.dice : null,
                                      ...(r.groups ? { g: r.groups.map(g => ({ w: g.what, d: g.dice })) } : {}),
                                      ...(r.kind ? { k: r.kind } : {}),
                                      /* l'effetto da disegnare: la freccia, il fulmine, la mischia */
                                      ...(r.fx ? { fx: r.fx } : {}),
                                      /* la spiegazione, che la pagina fa diventare una scheda */
                                      ...(r.x ? { x: r.x } : {}) }));
      if (rifiutata) testo.push({ t: `mossa rifiutata dall'arbitro: ${esito.text}`, p: 0, d: null, k: 'limite' });
      const f = fotogramma(S, { AR, testo, chi: nomi[player], perche: detto, army: player, casella: c,
                                turno: righe.length ? righe[0].turno : S.turno });
      if (testo.length || detto || !stessoTavolo(frames[frames.length - 1], f)) frames.push(f);
    }
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
/* chi e' rimasto fuori si nomina uno per uno: il limite dice la regola,
   qui si dice quanti punti di lista la partita non ha giocato */
for (const f of S.fuori || [])
  avvisa(`${nomi[f.army]}: ${f.name} (${f.pts} pt) è rimasta fuori dal tavolo — ${f.why}.`);
if (erroriModello.length){
  console.log('');
  avvisa(`il modello non ha scelto ${erroriModello.length} volte, e al suo posto ha giocato l'euristica: ` +
         [...new Set(erroriModello)].slice(0, 3).join('; '));
}
if (html){
  /* Il terreno e le zone non cambiano mai durante la partita: stanno
     nell'intestazione una volta sola, e i fotogrammi portano solo i
     pezzi che si muovono. */
  const pagina = paginaHTML({
    meta: {
      titolo: `${sc.label} — ${nomi.A} contro ${nomi.B}`,
      avvisi,
      sotto: `${S.punti.A} contro ${S.punti.B} punti · seme ${seme} · ` +
             `${agenti.A.nome} contro ${agenti.B.nome} · ${esito.winner ? nomi[esito.winner] + ', ' + esito.label : esito.label}`,
      piede: 'Ogni riga porta la pagina del manuale da cui viene. Quello che questa partita non ha giocato: ' +
             ([...S.detto].map(id => (AR.LIMITI.find(x => x.id === id) || {}).what).filter(Boolean).join('; ') || 'niente') + '.',
      w: S.table.w, h: S.table.h, nomi,
      /* il terreno con il suo nome e quello che fa, per chi ci passa
         sopra col mouse */
      terreno: terrenoDellaPagina(S),
      zone: [...(S.zones.A || []).map(z => ({ ...z, army:'A' })), ...(S.zones.B || []).map(z => ({ ...z, army:'B' }))],
      /* chi c'e', personaggi compresi, e le foto della collezione */
      pezzi: pezziDellaPagina(S),
      foto: fotoDellaCollezione(S.units.map(u => u.catId)),
    },
    frames,
  });
  fs.writeFileSync(fileHtml, pagina);
  console.log(`\nLa partita da guardare: ${fileHtml} (${frames.length} fotogrammi, ${Math.round(pagina.length / 1024)} KB)`);
  console.log('Aprila con un doppio clic, o mettila online: dentro non c\'è nessuna chiave e non chiama nessuno.');
}
if (diario){
  const rep = diario.chiudi({ title: `${sc.label}: ${nomi.A} contro ${nomi.B} (simulata)` });
  /* il verdetto dell'arbitro e quello che la partita non ha giocato: il
     punteggio della scheda lo ricalcola l'app dalle fotografie, e le
     due cose possono non coincidere */
  const non = [...S.detto].map(id => (AR.LIMITI.find(x => x.id === id) || {}).what).filter(Boolean);
  rep.notes = [
    `Partita giocata dall'arbitro dell'app (tools/partita.mjs), seme ${seme}: ${agenti.A.nome} contro ${agenti.B.nome}.`,
    `Verdetto dell'arbitro: ${esito.winner ? nomi[esito.winner] + ', ' + esito.label : esito.label} — ` +
      `${nomi.A} ${esito.A} punti vittoria, ${nomi.B} ${esito.B} (${esito.why}).`,
    avvisi.length ? 'Avvisi: ' + avvisi.join(' · ') : '',
    non.length ? 'Quello che questa partita non ha giocato: ' + non.join('; ') + '.' : '',
  ].filter(Boolean).join('\n\n');
  const quante = ARCH.aggiungi(fileArchivio, rep);
  console.log(`\nNel diario: ${fileArchivio} (${rep.turns.length} fotografie, ${quante} partite in tutto).`);
  console.log('Nell\'app arriva con la Nuvola: prima «Salva su GitHub» dall\'app, poi push di questo file, poi «Scarica».');
}
