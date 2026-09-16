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
 *   node tools/partita.mjs --gemini --pausa 8000  più lento, per le quote strette
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
import { paginaHTML, fotogramma, coloreTerreno, stessoTavolo } from './replay.mjs';

const qui = path.dirname(fileURLToPath(import.meta.url));
const dati = f => JSON.parse(fs.readFileSync(path.join(qui, '..', 'dati', f), 'utf8'));

/* ---- gli argomenti ----
   Un valore puo' arrivare spezzato dalla shell: «--liste 3, 9» sono due
   parole, «3,» e «9». Prima si leggeva solo la prima, «3,» diventava
   [3, 0] e la partita si giocava contro la lista 0 senza dire niente.
   Adesso le parole fino al prossimo «--» si rimettono insieme, e quelle
   che nessuno legge si dicono. */
const argv = process.argv.slice(2);
const NOTI = ['seme', 'scenario', 'breve', 'gemini', 'html', 'pausa', 'liste'];
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

/* ---- i dadi, con il seme: la stessa partita si rigioca uguale ---- */
D.setSource(D.seeded(seme));

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
let iA, iB;
if (scelte){
  const pezzi = scelte.split(',');
  const buoni = pezzi.length === 2 && pezzi.every(p => /^\d+$/.test(p.trim()) && +p < liste.length);
  if (!buoni){
    console.error(`--liste vuole due numeri separati da una virgola, fra 0 e ${liste.length - 1} (è arrivato «${scelte}»). ` +
                  'Le liste si elencano con --liste ?');
    process.exit(1);
  }
  [iA, iB] = pezzi.map(p => +p);
} else {
  /* di suo prende le due liste dello scenario, una per fazione */
  const dello = liste.filter(l => (l.points || 0) === (SCENARIOS[scenario] || {}).pts);
  const fazioni = [...new Set(dello.map(l => (l.info || {}).catalogue).filter(Boolean))];
  iA = liste.indexOf(dello.find(l => (l.info || {}).catalogue === fazioni[0]));
  iB = liste.indexOf(dello.find(l => (l.info || {}).catalogue === fazioni[1]));
}
const A = liste[iA], B = liste[iB];
if (!A || !B){ console.error('Non trovo le due liste: prova --liste ?'); process.exit(1); }
if (!SCENARIOS[scenario]){
  console.error(`Scenario «${scenario}» sconosciuto. Ci sono: ${Object.keys(SCENARIOS).join(', ')}.`);
  process.exit(1);
}

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
for (const t of ['A', 'B']){
  const l = t === 'A' ? A : B;
  if (faz[t].ignota) console.log(`⚠  ${t}: la lista non dice la fazione e le unità non la fanno capire: la chiamo «${l.name}».`);
  else if (faz[t].dedotta) console.log(`⚠  ${t}: la lista non dice la fazione; dalle unità sembra ${faz[t].nome}.`);
}
{
  const pa = puntiDi(A), pb = puntiDi(B);
  if (Math.abs(pa - pb) > 0.1 * Math.max(pa, pb))
    console.log(`⚠  le due liste non si equivalgono: ${pa} contro ${pb} punti.`);
  const pts = (SCENARIOS[scenario] || {}).pts;
  if (pts && (pa > pts * 1.05 || pb > pts * 1.05))
    console.log(`⚠  lo scenario «${scenario}» è pensato per ${pts} punti.`);
}

/* ---- si può giocare? ---- */
for (const [tag, l] of [['A', A], ['B', B]]){
  const p = PREP.playability(l, { split: PR.splitStat });
  if (!p.can) console.log(`⚠  ${tag} «${l.name}»: ${p.text}\n   La partita si gioca lo stesso, ma quei conti sono finti.\n`);
  /* Il profilo lo completa la tavola, il tipo di truppa e le armi no:
     una lista scritta a mano senza questi due gioca con fanteria
     regolare al posto di tutto e non spara mai. */
  const senzaTipo = (l.units || []).filter(u => !String(u.troop || '').trim()).map(u => u.name);
  const senzaArmi = (l.units || []).filter(u => !(u.weapons || []).length).map(u => u.name);
  if (senzaTipo.length)
    console.log(`⚠  ${tag}: ${senzaTipo.length} unità senza tipo di truppa (${[...new Set(senzaTipo)].join(', ')}): ` +
                'contano come fanteria regolare.');
  if (senzaArmi.length === (l.units || []).length)
    console.log(`⚠  ${tag}: nessuna unità ha le armi scritte: nessuno sparerà.`);
}

/* ---- gli agenti ---- */
const chiave = process.env.GEMINI_API_KEY || '';
const model = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const erroriModello = [];
const faiAgente = (tag, nome) => {
  const vuole = gemini === true || gemini === tag;
  if (!vuole) return AG.agenteEuristico({ nome: nome + ' (euristica)' });
  if (!chiave){
    console.log(`⚠  --gemini chiesto ma GEMINI_API_KEY non c'è: ${nome} gioca con l'euristica.`);
    return AG.agenteEuristico({ nome: nome + ' (euristica)' });
  }
  return AG.agenteGemini({ apiKey: chiave, model, nome: nome + ' (' + model + ')',
                           attesa: pausa,
                           onError: e => erroriModello.push(e.message) });
};

const nomi = { A: faz.A.nome, B: faz.B.nome };
if (nomi.A === nomi.B){ nomi.A += ' (A)'; nomi.B += ' (B)'; }
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
  onPasso: ({ player, mossa, perche, esito, opzioni, agente }) => {
    /* la casella e il turno sono quelli in cui la mossa e' stata
       scelta: dopo la mossa l'arbitro puo' essere gia' andato avanti */
    const c = opzioni.fase === 'Schieramento' ? 'schieramento' : (opzioni.casella || '');
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
    if (html){
      const testo = righe.map(r => ({ t: r.text, p: r.page || 0, d: r.dice && r.dice.length ? r.dice : null,
                                      ...(r.groups ? { g: r.groups.map(g => ({ w: g.what, d: g.dice })) } : {}),
                                      ...(r.kind ? { k: r.kind } : {}) }));
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
