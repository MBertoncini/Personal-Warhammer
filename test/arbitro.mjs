/* Schieramento Old World — la sonda dell'arbitro
 *
 * Non è una prova, è una domanda: **il giro di turno si chiude da
 * solo?** I pezzi ci sono quasi tutti — `combat.js` risolve un
 * assalto, `psych.js` sa il panico e la rotta, `victory.js` conta i
 * punti, `dice.js` si lascia mettere un generatore con il seme — ma
 * nessuno li ha mai messi in fila senza un umano che prema.
 *
 * **La partita è astratta**: una riga invece di un tavolo. Ogni unità
 * sta a un punto di un segmento, avanza verso il nemico più vicino,
 * tira quando ci arriva, carica quando il dado ce la porta. Niente
 * fronte, niente fianchi, niente ruota, niente terreno, niente magia.
 * Non è il gioco: è lo scheletro, e serve a sapere cosa manca perché
 * lo scheletro regga.
 *
 * Quello che incontra e non sa fare finisce in `buco()`, e alla fine
 * si stampa. **Quel registro è il risultato**: l'elenco di cosa manca
 * per avere un arbitro.
 *
 *   node test/arbitro.mjs            una partita, raccontata
 *   node test/arbitro.mjs 7          la stessa, con il seme 7
 *   node test/arbitro.mjs 1 200      duecento partite, solo i numeri
 */

import { readFileSync } from 'node:fs';
import { setSource } from '../src/dice.js';
import { roll, stat } from '../src/rules.js';
import * as C from '../src/combat.js';
import * as PS from '../src/psych.js';
import * as V from '../src/victory.js';
import * as SH from '../src/shoot.js';
import { makeArmies, useArmies, armyFor, coverage } from '../src/armies.js';

/* ============================================================
   0 · IL CASO CON IL SEME, E IL REGISTRO DEI BUCHI
   ============================================================ */
function mulberry32(a){
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const d6  = () => roll(1)[0];
const dd  = () => roll(2).reduce((a, b) => a + b, 0);

const buchi = new Map();
let segna = true;
const buco = (dove, cosa) => {
  if (!segna) return;
  const k = dove + " · " + cosa;
  buchi.set(k, (buchi.get(k) || 0) + 1);
};

/* ============================================================
   1 · I DATI
   ============================================================ */
const leggi = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const liste = leggi('../dati/liste.json');
const idxE  = leggi('../dati/eserciti/indice.json');
useArmies(makeArmies((idxE.file || []).map(f => leggi('../dati/eserciti/' + f))));

const ID_A = process.env.A || 'lmtl5sa4300nt';    // Lucertole, 750
const ID_B = process.env.B || 'lmtl5sn694u6w';    // Orchi, 750
const LISTA_A = liste.find(l => l.id === ID_A);
const LISTA_B = liste.find(l => l.id === ID_B);
if (!LISTA_A || !LISTA_B) throw new Error('le due liste di prova non ci sono più');

const MOV_RIPIEGO = 4;
const GAP = 24;                  // quanto stanno lontani i due schieramenti
const BORDO = 12;                // oltre questo, chi fugge è uscito dal tavolo

const armaTiro = u => (u.weapons || []).find(w => stat(w.range) > 0) || null;

/* ============================================================
   2 · UNA PARTITA
   ============================================================ */
function partita(seme, { muto = false } = {}){
  const rnd = mulberry32(seme);
  setSource(n => Math.floor(rnd() * n));

  const voce = [];
  const dice_ = t => { if (!muto) voce.push(t); };

  function mossa(u){
    const m = stat(u.stats && u.stats.M);
    if (m > 0) return m;
    buco('movimento', 'Movimento non dichiarato (sta sul profilo della cavalcatura): ripiego a ' + MOV_RIPIEGO + '″');
    return MOV_RIPIEGO;
  }

  /* --- lo schieramento, e i personaggi che nessuno unisce ---------- */
  const schiera = (lista, lato, x0) => lista.units.map((u, i) => ({
    ...u,
    uid: lato + i, army: lato,
    lost: 0, dead: false, fleeing: false, fledOff: false,
    x: x0, engaged: null, charged: null, marched: false, mosso: false,
    joined: [], host: null,
  }));

  const campo = { A: schiera(LISTA_A, 'A', 0), B: schiera(LISTA_B, 'B', GAP) };

  /* --- si può giocare questa lista? ------------------------------
     Una lista scritta a mano porta i nomi e i modelli, non i profili:
     serve a schierare, non a combattere. Data in pasto all'assalto non
     fa rumore — nessuno colpisce, nessuno muore, la partita finisce
     zero a zero — ed è il modo peggiore di sbagliare. Il controllo
     costa tre righe e non lo fa nessuno. */
  const senzaProfilo = [];
  for (const lato of ['A', 'B'])
    for (const u of campo[lato]){
      const st = u.stats || {};
      if (!(stat(st.WS) > 0) && !(stat(st.BS) > 0)) senzaProfilo.push(lato + ' · ' + u.name);
    }
  if (senzaProfilo.length)
    buco('giocabilità', senzaProfilo.length + ' unità senza profilo: la partita gira lo stesso e non muore nessuno');

  /* `retinueOf` sa far menare un personaggio dentro un reggimento, ma
     **chi ci va** non lo decide nessun modulo: al tavolo lo decide la
     mano che posa la miniatura. Qui il capo va nel reggimento più
     numeroso del suo esercito, che è la scelta di comodo. */
  buco('schieramento', 'nessuno unisce i personaggi ai reggimenti: è una scelta del giocatore che un arbitro deve prendere');
  for (const lato of ['A', 'B']){
    const capi  = campo[lato].filter(u => u.slot === 'Characters');
    const ospiti = campo[lato].filter(u => u.slot !== 'Characters')
      .sort((a, b) => b.models - a.models);
    if (!ospiti.length) continue;
    capi.forEach((c, k) => {
      const h = ospiti[k % ospiti.length];
      h.joined.push(c); c.host = h;
    });
  }

  const pezzi   = lato => campo[lato].filter(u => !u.host);        // chi sta sul tavolo da solo
  const inPiedi = u => !u.dead && Math.max(0, u.models - u.lost) > 0;
  const vivi    = lato => pezzi(lato).filter(inPiedi);
  const altro   = lato => lato === 'A' ? 'B' : 'A';
  const dist    = (u, v) => Math.abs(u.x - v.x);
  const verso   = (u, v) => Math.sign(v.x - u.x) || 1;
  const schiera_ = u => C.combatant(u, { joined: u.joined.filter(c => !c.dead) });

  const nemicoVicino = u => {
    const loro = vivi(altro(u.army));
    if (!loro.length) return null;
    return loro.reduce((best, v) => dist(u, v) < dist(u, best) ? v : best, loro[0]);
  };

  const usDi = lato => campo[lato].filter(u => !u.dead)
    .reduce((s, u) => s + (u.us || Math.max(0, u.models - u.lost)), 0);
  const usInizio = { A: usDi('A'), B: usDi('B') };

  /* --- applicare quello che è successo ---------------------------- */
  buco('arbitro', 'nessuna funzione applica l\'esito di meleeRound alle unità: meleeRound torna cloni, il riporto è a mano');

  function perdi(u, n, perche){
    if (n <= 0) return 0;
    const prima = Math.max(0, u.models - u.lost);
    u.lost = Math.min(u.models, u.lost + n);
    const ora = Math.max(0, u.models - u.lost);
    if (ora <= 0){
      u.dead = true;
      if (u.engaged){ u.engaged.engaged = null; u.engaged = null; }
      /* e i personaggi che ci stavano dentro? */
      if (u.joined.some(c => !c.dead))
        buco('personaggi', 'reggimento distrutto con dentro un capo: che fine fa non lo dice nessuno');
    }
    dice_(`      ${u.name} perde ${prima - ora} (${perche}) → ${ora}/${u.models}`);
    return prima - ora;
  }

  const sgancia = u => { if (u.engaged){ u.engaged.engaged = null; u.engaged = null; } };

  function fugge(u, pollici, perche){
    u.fleeing = true;
    sgancia(u);
    u.x += (u.army === 'A' ? -1 : +1) * pollici;
    dice_(`      ${u.name} fugge di ${pollici}″ (${perche})`);
    if (u.x < -BORDO || u.x > GAP + BORDO){
      u.fledOff = true; u.dead = true;
      dice_(`      ${u.name} esce dal tavolo`);
    }
  }

  function panico(u, causa, fonte){
    if (!inPiedi(u) || u.fleeing) return;
    const p = PS.psychOf(u, { joined: u.joined });
    const c = PS.panicCheck({
      cause: causa, me: p, source: fonte ? PS.psychOf(fonte, {}) : null,
      dist: fonte ? dist(u, fonte) : 0, fleeing: u.fleeing, engaged: !!u.engaged,
      sourceName: fonte ? fonte.name : '',
    });
    if (!c.must || c.auto) return;
    const t = PS.psychTest({ kind: 'panic', ld: schiera_(u).ld, dice: roll(2), p });
    dice_(`      Panico su ${u.name}: ${t.text}`);
    if (!t.passed) fugge(u, dd(), 'panico');
  }

  /* --- il turno --------------------------------------------------- */
  function turno(lato, round){
    dice_(`\n  — round ${round}, esercito ${lato} —`);

    /* raduno */
    for (const u of vivi(lato)){
      if (!u.fleeing) continue;
      buco('raduno', 'psych.js non ha un tipo «raduno»: cade nel test di Comando generico, senza le sue regole');
      const t = PS.psychTest({ kind: 'rally', ld: schiera_(u).ld, dice: roll(2), p: PS.psychOf(u, {}) });
      dice_(`    raduno di ${u.name}: ${t.text}`);
      if (t.passed) u.fleeing = false; else fugge(u, dd(), 'continua a fuggire');
    }

    /* cariche */
    for (const u of vivi(lato)){
      if (u.fleeing || u.engaged) continue;
      const v = nemicoVicino(u);
      if (!v) continue;
      const m = mossa(u), d = dist(u, v);
      const swift = /swiftstride/i.test((u.rules || []).join(' '));
      if (d > m + (swift ? 9 : 6)) continue;
      if (v.engaged){
        /* Due unità sullo stesso nemico è la cosa più normale del
           mondo, e `meleeRound(A, B)` prende due schiere e basta. */
        buco('mischia', 'combattimento a più di due: meleeRound prende due schiere, non un gruppo — la seconda carica si butta via');
        continue;
      }
      buco('carica', 'nessuna reazione alla carica: charge.js ha reactions() ma vuole il tavolo, qui si tiene sempre la posizione');
      const tiro = d6(), arriva = m + tiro;
      dice_(`    ${u.name} carica ${v.name} a ${d.toFixed(1)}″ (M${m} + ${tiro} = ${arriva}″)`);
      if (arriva >= d){
        u.x = v.x; u.engaged = v; v.engaged = u;
        u.charged = { inches: d, arc: 'fronte' };
        dice_('      va a segno');
      } else {
        u.x += verso(u, v) * Math.min(arriva, Math.max(0, d - 1));
        dice_('      fallita, avanza e basta');
      }
    }

    /* movimento */
    for (const u of vivi(lato)){
      if (u.fleeing || u.engaged || u.charged) continue;
      const v = nemicoVicino(u);
      if (!v) continue;
      const m = mossa(u), d = dist(u, v);
      const arma = armaTiro(u);
      if (arma && d <= stat(arma.range)) continue;        // chi tira si ferma a gittata
      const marcia = d > m * 2 + 1;
      const passo = Math.min(marcia ? m * 2 : m, Math.max(0, d - 1));
      if (passo <= 0) continue;
      u.x += verso(u, v) * passo;
      u.marched = marcia; u.mosso = true;
      dice_(`    ${u.name} avanza di ${passo}″ (${marcia ? 'marcia' : 'passo'})`);
    }

    /* tiro */
    for (const u of vivi(lato)){
      const arma = armaTiro(u);
      if (!arma) continue;
      if (!SH.canShoot({ charged: !!u.charged, marched: u.marched, engaged: !!u.engaged,
                         fleeing: u.fleeing, moved: u.mosso }).can) continue;
      const v = nemicoVicino(u);
      if (!v) continue;
      const g = stat(arma.range), d = dist(u, v);
      if (d > g) continue;
      buco('tiro', 'modificatori: senza tavolo restano lunga gittata e movimento — vista, riparo e schermi non ci sono');
      let mods = 0;
      if (d > g / 2) mods -= 1;
      if (u.mosso) mods -= 1;
      const r = C.shootRoll(u, v, { weapon: arma, mods });
      dice_(`    ${u.name} tira su ${v.name} a ${d.toFixed(1)}″: ${r.shots} colpi a ${r.hitNeed}+, ${r.wounds} ferite`);
      if (r.wounds > r.kills * (r.targetW || 1))
        buco('ferite', 'le ferite che non completano un modello si perdono fra un tiro e l\'altro: nessuno le tiene');
      const start = Math.max(0, v.models - v.lost);
      const persi = perdi(v, r.kills, 'tiro');
      const pan = SH.panicFromShooting({ start, lost: persi, us: start, usLost: persi, destroyed: v.dead });
      if (pan && pan.must) panico(v, 'casualties', u);
      if (v.dead) for (const a of vivi(v.army)) panico(a, 'destroyed', v);
    }

    /* mischia */
    const fatti = new Set();
    for (const u of vivi(lato)){
      if (!u.engaged || fatti.has(u.uid)) continue;
      const v = u.engaged;
      if (!inPiedi(v)){ sgancia(u); continue; }
      fatti.add(u.uid); fatti.add(v.uid);

      const cu = schiera_(u), cv = schiera_(v);
      const capiPrima = u.joined.filter(c => !c.dead).length + v.joined.filter(c => !c.dead).length;
      const r = C.meleeRound(cu, cv, { round });
      dice_(`    mischia: ${u.name} contro ${v.name}`);
      perdi(u, r.killsA, 'mischia');
      perdi(v, r.killsB, 'mischia');
      if (capiPrima)
        buco('personaggi', 'un capo unito mena e non muore mai: applyWounds toglie modelli alla truppa, l\'assegnazione al capo è dei giocatori');
      if ((cu.w > 1 || cv.w > 1))
        buco('ferite', 'lo `spill` riparte da zero a ogni assalto: un mostro ferito guarisce fra un round e l\'altro');

      if (r.wiped){
        const morto = r.wiped === 'A' ? u : v;
        dice_(`      ${morto.name} è spazzata via`);
        for (const a of vivi(morto.army)) panico(a, 'destroyed', morto);
        continue;
      }
      if (!r.test){ dice_('      pari'); continue; }
      const perde = r.test.side === 'A' ? u : v;
      const vince = perde === u ? v : u;
      dice_(`      vince ${vince.name} di ${r.cr.diff} → ${r.test.outcome} per ${perde.name}`);
      if (r.test.outcome === 'rout'){
        const fuga = dd();
        fugge(perde, fuga, 'rotta');
        buco('inseguimento', 'charge.js ha pursuitMove ma vuole due sagome: qui è un confronto di 2D6, e lo sfondamento non esiste');
        const ins = dd();
        if (ins >= fuga && !perde.dead){
          dice_(`      ${vince.name} insegue ${ins}″ e la raggiunge: distrutta`);
          perde.dead = true;
          for (const a of vivi(perde.army)) panico(a, 'destroyed', perde);
        }
      } else if (r.test.outcome === 'fallBack'){
        sgancia(perde);
        perde.x += (perde.army === 'A' ? -1 : +1) * 6;
        dice_('      ripiega in ordine');
      }
    }

    for (const u of campo[lato]){ u.charged = null; u.marched = false; u.mosso = false; }
  }

  /* --- la partita ------------------------------------------------- */
  const ROUNDS = V.roundsFor('bm');
  let round = 1, finita = '';
  for (; round <= ROUNDS && !finita; round++){
    for (const lato of ['A', 'B']){
      /* il punto di rottura, all'inizio del turno (p. 291) */
      const b = V.broken(usDi(lato), usInizio[lato]);
      if (b.broken){ finita = `esercito ${lato} rotto (US ${b.usNow} sotto ${b.bp})`; break; }
      turno(lato, round);
      if (!vivi(altro(lato)).length){ finita = `esercito ${altro(lato)} spazzato via`; break; }
    }
    const fine = V.endOfRound({ length: 'bm', round });
    if (!finita && fine.ends) finita = fine.why;
  }
  const giocati = Math.min(round, ROUNDS);

  /* --- il punteggio ------------------------------------------------ */
  buco('punteggio', 'restano fuori generale, portastendardo, stendardi presi e obiettivi tenuti: è un conto di sole perdite');
  const regala = lato => campo[lato].reduce((s, u) => {
    const alive = Math.max(0, u.models - u.lost);
    const share = V.strengthShare({ models: u.models, alive,
                                    woundsPer: stat(u.stats && u.stats.W) || 1, woundsLost: 0 });
    return s + V.unitVP({ pts: u.pts || 0, dead: u.dead && !u.fledOff, fledOff: u.fledOff,
                          fleeing: u.fleeing, share }).vp;
  }, 0);
  const vpA = regala('B'), vpB = regala('A');
  const esito = V.victory(vpA, vpB, 'bm');

  return { voce, finita, round: giocati, vpA, vpB, esito, nonGiocabili: senzaProfilo.length,
           vivi: { A: vivi('A').length, B: vivi('B').length },
           pezzi: { A: pezzi('A').length, B: pezzi('B').length } };
}

/* ============================================================
   3 · SI GIOCA
   ============================================================ */
const seme = +(process.argv[2] || 1);
const quante = +(process.argv[3] || 1);

const t0 = Date.now();
const prima = partita(seme);
console.log(prima.voce.join('\n'));
console.log('\n════════════════════════════════════════');
console.log(`seme ${seme} · ${prima.finita} · round giocati: ${prima.round}`);
console.log(`  A — ${LISTA_A.name} (${LISTA_A.info.catalogue}): ${prima.vpA} punti vittoria, ${prima.vivi.A}/${prima.pezzi.A} pezzi in piedi`);
console.log(`  B — ${LISTA_B.name} (${LISTA_B.info.catalogue}): ${prima.vpB} punti vittoria, ${prima.vivi.B}/${prima.pezzi.B} pezzi in piedi`);
console.log(`  esito: ${prima.esito.label} — ${prima.esito.why}`);
if (prima.nonGiocabili)
  console.log(`  ATTENZIONE: ${prima.nonGiocabili} unità senza profilo — questa partita non vuol dire niente`);

if (quante > 1){
  segna = false;
  const conta = { A:0, B:0, pari:0 };
  const fini = new Map();
  let round = 0;
  for (let k = 0; k < quante; k++){
    const p = partita(seme + k, { muto: true });
    if (p.esito.winner === 'A') conta.A++;
    else if (p.esito.winner === 'B') conta.B++;
    else conta.pari++;
    round += p.round;
    const key = p.finita.replace(/\(.*\)/, '').trim();
    fini.set(key, (fini.get(key) || 0) + 1);
  }
  const pc = n => (100 * n / quante).toFixed(1) + '%';
  console.log(`\n──── ${quante} partite (${Date.now() - t0} ms) ────`);
  console.log(`  A vince ${pc(conta.A)} · B vince ${pc(conta.B)} · pari ${pc(conta.pari)}`);
  console.log(`  round medi: ${(round / quante).toFixed(1)}`);
  [...fini.entries()].sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`  come finisce: ${String(pc(n)).padStart(6)}  ${k}`));
}

console.log('\n──── i buchi che la sonda ha incontrato (una partita) ────');
[...buchi.entries()].sort((a, b) => b[1] - a[1])
  .forEach(([k, n]) => console.log('  ' + String(n).padStart(4) + '×  ' + k));

console.log('\n──── le regole che le liste portano ────');
for (const [lato, L] of [['A', LISTA_A], ['B', LISTA_B]]){
  const cov = coverage(armyFor(L.units[0], L.info.catalogue));
  console.log(`  ${lato} — ${cov.name || '?'}: ${cov.applied.length} applicate, ${cov.manual.length} a mano, ${cov.unverified.length} da verificare`);
  if (cov.manual.length) console.log('      a mano: ' + cov.manual.map(r => r.name).join(', '));
}
