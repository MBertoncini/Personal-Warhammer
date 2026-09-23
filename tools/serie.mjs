/* Schieramento Old World — tante partite, e come si leggono
 *
 * `partita.mjs --partite N` giocava N partite con la lista A sempre in
 * basso e sempre prima a muovere. Il risultato mescolava tre cose che
 * al tavolo sono diverse: quanto vale la lista, quanto vale il lato del
 * tavolo (il terreno non e' mai simmetrico) e quanto vale il primo
 * turno. Qui le tre si separano.
 *
 * LO SPECCHIO. Con `specchio` ogni seme si gioca due volte: la prima
 * con la lista x in basso (zona A) e la y in alto, la seconda
 * scambiate, con gli stessi dadi di partenza e lo stesso piano per
 * ciascuna lista. Il lato del tavolo si annulla per costruzione — ogni
 * lista ci passa lo stesso numero di partite — e chi comincia lo
 * decidono i tiri del libro (arbitro.js, CHI COMINCIA). Da una serie a
 * specchio si stimano allora tutte e tre le cose insieme, con una
 * regressione: vedi `analizza`.
 *
 * Le liste qui si chiamano x e y, non A e B: A e B sono le zone del
 * tavolo, e con lo specchio una lista le gira tutte e due.
 *
 * Niente stampa e niente file: entrano le liste, escono le partite e i
 * conti. Chi stampa e' `partita.mjs`.
 */

import * as ST from './statistica.mjs';

const ALTRA = { x: 'y', y: 'x' };

/* Il generatore dell'estro di una lista in una partita: dal seme e
   dalla lista, non dalla zona — cosi' con lo specchio la lista gioca lo
   stesso piano da tutti e due i lati, e senza specchio la lista x ha il
   piano che la parte A aveva prima di questo file. */
export const semeEstro = (s, lista) => ((s * 2654435761) ^ (lista === 'x' ? 0x51ed27 : 0xa3c1f5)) >>> 0;

/* Una serie. `agente(lista, nome, seme)` fa chi gioca; `osservatore`,
   se c'e', vede ogni partita (e' la mappa). */
export async function giocaSerie({ AR, AG, D, liste, nomi, scenario, def, magia, partite, seme = 1,
                                   specchio = false, agente, osservatore = null, primo = 'tira',
                                   avanzamento = null }){
  const tutte = [];
  const giri = specchio ? [0, 1] : [0];
  let fatte = 0;
  for (let i = 0; i < partite; i++){
    const s = seme + i;
    for (const giro of giri){
      const zona = giro === 0 ? { A: 'x', B: 'y' } : { A: 'y', B: 'x' };      // chi sta in quale zona
      const lista = { x: zona.A === 'x' ? 'A' : 'B', y: zona.A === 'y' ? 'A' : 'B' };   // e il contrario
      /* il seme prima della battaglia: anche lo schieramento e i tiri di
         chi comincia vengono dai dadi */
      D.setSource(D.seeded(s));
      const S = AR.newBattle({ A: liste[zona.A], B: liste[zona.B], scenario, def, magia, primo,
                               nomi: { A: nomi[zona.A], B: nomi[zona.B] } });
      const ag = { A: agente(zona.A, nomi[zona.A], s), B: agente(zona.B, nomi[zona.B], s) };
      const ctx = { seme: s, giro, zona, lista };
      if (osservatore) osservatore.nuova(S, ctx);
      /* lo schieramento, fotografato quando finisce: dice se le partite
         cambiano gia' prima del primo dado, o solo dopo */
      let schierati = '';
      const e = await AG.giocaPartita(AR, S, { ...ag, onPasso: () => {
        if (!schierati && !S.schierando)
          schierati = S.units.filter(u => u.placed && !u.dead).map(u => `${u.uid}:${Math.round(u.x)}:${Math.round(u.y)}`).join('|');
        if (osservatore) osservatore.passo(S, ctx);
      } });
      if (osservatore) osservatore.fine(S, e, ctx);
      const diLista = z => z ? zona[z] : null;
      tutte.push({
        seme: s, giro, zona, label: e.label, why: e.why, turno: S.turno, schierati,
        vincitore: diLista(e.winner || null),
        vp: { [zona.A]: e.A, [zona.B]: e.B },
        primo: diLista(S.primo), chiSchiera: diLista(S.chiSchiera), finitoPrima: diLista(S.finitoPrima),
        piano: { [zona.A]: ag.A.piano || null, [zona.B]: ag.B.piano || null },
      });
      fatte++;
      if (avanzamento) avanzamento(fatte, partite * giri.length);
    }
  }
  return tutte;
}

/* ============================================================
   I CONTI DI UNA SERIE
   Tre domande, e una regressione che risponde a tutte e tre insieme:

     vale di piu' la lista x o la y?
     vale di piu' il lato in basso (zona A) o quello in alto?
     quanto vale muovere per primi?

   Si scrive dal punto di vista di x, partita per partita:

     scarto_x = b0 + b1·[x in zona A] + b2·[x muove per prima] + errore

   centrando le due variabili (±½), b0 e' quanto vale x contro y a
   parita' di lato e di turno, b1 quanto vale il lato, b2 il primo
   turno. Lo stesso con la logistica sulla vittoria (i pareggi fuori).
   Senza specchio la colonna del lato e' costante — x sta sempre in
   basso — e la regressione lo dice e la toglie: lista e lato restano
   confusi, che e' esattamente il motivo per cui lo specchio c'e'.
   ============================================================ */
export function analizza(tutte){
  const n = tutte.length;
  const conta = f => tutte.filter(f).length;
  const decise = tutte.filter(p => p.vincitore);
  const out = {
    n, pareggi: n - decise.length,
    vince: { x: conta(p => p.vincitore === 'x'), y: conta(p => p.vincitore === 'y') },
    specchio: tutte.some(p => p.giro === 1),
  };
  out.wilson = { x: ST.wilson(out.vince.x, n), y: ST.wilson(out.vince.y, n) };
  /* le tre cose, a occhio: tra le partite decise, quante ne vince chi
     muove per primo, e quante chi sta in basso */
  const conPrimo = decise.filter(p => p.primo);
  out.primoVince = { k: conPrimo.filter(p => p.vincitore === p.primo).length, n: conPrimo.length };
  out.primoVince.w = ST.wilson(out.primoVince.k, out.primoVince.n);
  out.bassoVince = { k: decise.filter(p => p.vincitore === p.zona.A).length, n: decise.length };
  out.bassoVince.w = ST.wilson(out.bassoVince.k, out.bassoVince.n);
  out.primoDi = { x: conta(p => p.primo === 'x'), y: conta(p => p.primo === 'y') };

  const riga = p => [1, p.zona.A === 'x' ? 0.5 : -0.5, p.primo === 'x' ? 0.5 : p.primo === 'y' ? -0.5 : 0];
  const nomi = ['x contro y, a parità di lato e di turno', 'stare in basso (zona A)', 'muovere per primi'];
  out.scarto = ST.ols(tutte.map(riga), tutte.map(p => p.vp.x - p.vp.y), nomi);
  out.logit = decise.length > 10
    ? ST.logistica(decise.map(riga), decise.map(p => +(p.vincitore === 'x')), nomi)
    : null;
  return out;
}

/* le righe da stampare, in italiano, dalla stessa analisi */
export function righeAnalisi(a, nomeDi){
  const r = [];
  const f = x => (x >= 0 ? '+' : '') + Math.round(x);
  const sig = c => c.p < 0.05 ? '' : '  (non distinguibile dal caso)';
  r.push(`  ${nomeDi.x.padEnd(34)} vince ${String(a.vince.x).padStart(4)}  ${ST.pc(a.vince.x / a.n).padStart(4)}   (95%: ${ST.intervallo(a.wilson.x)})`);
  r.push(`  ${nomeDi.y.padEnd(34)} vince ${String(a.vince.y).padStart(4)}  ${ST.pc(a.vince.y / a.n).padStart(4)}   (95%: ${ST.intervallo(a.wilson.y)})`);
  r.push(`  ${'pareggio'.padEnd(34)}       ${String(a.pareggi).padStart(4)}  ${ST.pc(a.pareggi / a.n).padStart(4)}`);
  r.push('');
  r.push(`  chi muove per primo vince ${ST.pc(a.primoVince.w.p)} delle partite decise (95%: ${ST.intervallo(a.primoVince.w)}, su ${a.primoVince.n})` +
         `; ha cominciato ${nomeDi.x} ${a.primoDi.x} volte, ${nomeDi.y} ${a.primoDi.y}`);
  r.push(`  chi sta in basso (zona A) vince ${ST.pc(a.bassoVince.w.p)} delle partite decise (95%: ${ST.intervallo(a.bassoVince.w)})`);
  r.push('');
  r.push('  scarto di punti vittoria, dal punto di vista di ' + nomeDi.x + ' (regressione, errori robusti):');
  for (const c of a.scarto.coef){
    const nome = c.nome === 'x contro y, a parità di lato e di turno' ? `${nomeDi.x} contro ${nomeDi.y}, a parità di lato e turno` : c.nome;
    r.push(`    ${nome.padEnd(64)} ${f(c.stima).padStart(5)} punti  (95%: ${f(c.lo)} … ${f(c.hi)})${sig(c)}`);
  }
  if (a.scarto.tolte.length)
    r.push(`    non stimabili da questa serie: ${a.scarto.tolte.join(', ')}` +
           (a.scarto.tolte.includes('stare in basso (zona A)') ? ' — senza --specchio lista e lato del tavolo restano la stessa cosa' : ''));
  if (a.logit){
    const pr = c => ST.pc(1 / (1 + Math.exp(-c)));
    const b0 = a.logit.coef[0];
    r.push(`  sulla vittoria (logistica): ${nomeDi.x} vince il ${pr(b0.stima)} delle partite decise a parità di lato e di turno` +
           ` (95%: ${pr(b0.lo)}–${pr(b0.hi)})`);
    for (const c of a.logit.coef.slice(1)){
      const orr = Math.exp(c.stima);
      r.push(`    ${c.nome}: le probabilità di vincere si moltiplicano per ${orr.toFixed(2)} (95%: ${Math.exp(c.lo).toFixed(2)}–${Math.exp(c.hi).toFixed(2)})${sig(c)}`);
    }
  }
  return r;
}

/* ============================================================
   QUALI PIANI CONTANO
   Prima: per ogni scelta del piano, le partite divise a meta' sulla
   mediana, una scelta alla volta, dodici righe. Due guai. Il primo sono
   i confronti multipli: su dodici righe una spettacolare esce sempre, e
   la lista contro se stessa ne dava una da 38 punti. Il secondo e' che
   le scelte si guardavano una per una, e l'effetto di una finiva
   attribuito a un'altra che le somigliava in quella serie.

   Adesso una regressione per lista, con tutte le scelte insieme: lo
   scarto di punti di quella lista contro il suo piano, a parita' di
   lato del tavolo. I numeri del piano sono in deviazioni standard —
   «+40 punti» vuol dire «caricare da una soglia piu' alta di una
   deviazione standard vale 40 punti» — e la colonna di partenza e'
   contro «sinistra». Sopra, Benjamini-Hochberg al 10%: una riga che non
   regge lo dice, anche se il suo intervallo da sola sembra lontano da
   zero. Chi comincia NON entra come controllo: dipende dal piano
   (`muoviPrimo`), e controllarlo cancellerebbe proprio l'effetto da
   misurare.
   ============================================================ */
const VOCI_PIANO = [
  { k: 'carica', nome: 'carica da una probabilità più alta', num: true },
  { k: 'marcia', nome: 'marcia solo da più lontano', num: true },
  { k: 'sfida', nome: 'sfida solo se conviene di più', num: true },
  { k: 'scarto', nome: 'sceglie più spesso la seconda mossa', num: true },
  { k: 'tieniTiro', nome: 'resta fermo a tirare' },
  { k: 'unisci', nome: 'capi dentro i reggimenti' },
  { k: 'schieraPrimo', nome: 'vinto il tiro, schiera per primo' },
  { k: 'muoviPrimo', nome: 'vinto il tiro, muove per primo' },
  { k: 'distanze', nome: 'gioca il gioco delle distanze' },
  { k: 'rischio', nome: 'accetta un rischio di carica più alto', num: true },
  { k: 'danno', nome: 'accetta un danno più alto', num: true },
];
const COLONNE_PIANO = ['sinistra', 'centro-sinistra', 'centro', 'centro-destra', 'destra'];

export function analizzaPiani(tutte, { q = 0.1 } = {}){
  const out = {};
  for (const L of ['x', 'y']){
    const righe = tutte.filter(p => p.piano[L]);
    if (righe.length < 20){ out[L] = null; continue; }
    const scala = {};
    for (const v of VOCI_PIANO.filter(v => v.num)){
      const m = ST.media(righe.map(p => +p.piano[L][v.k]));
      scala[v.k] = { m: m.m, sd: m.sd || 1 };
    }
    const nomi = ['intercetta', 'stare in basso (zona A)', ...VOCI_PIANO.map(v => v.nome),
                  ...COLONNE_PIANO.slice(1).map(c => `comincia a schierare a ${c} (contro sinistra)`)];
    const X = righe.map(p => {
      const pl = p.piano[L];
      const col = pl.colonne ? pl.colonne[0] : 0;
      return [1, p.zona.A === L ? 0.5 : -0.5,
              ...VOCI_PIANO.map(v => v.num ? (pl[v.k] - scala[v.k].m) / scala[v.k].sd : (pl[v.k] ? 0.5 : -0.5)),
              ...COLONNE_PIANO.slice(1).map((_, i) => +(col === i + 1))];
    });
    const y = righe.map(p => p.vp[L] - p.vp[ALTRA[L]]);
    const r = ST.ols(X, y, nomi);
    const piano = r.coef.filter(c => c.nome !== 'intercetta' && c.nome !== 'stare in basso (zona A)');
    const regge = ST.bh(piano.map(c => c.p), q);
    piano.forEach((c, i) => { c.regge = regge[i]; });
    out[L] = { n: r.n, coef: piano, tolte: r.tolte, q };
  }
  return out;
}

export function righePiani(an, nomeDi){
  const r = [];
  const f = x => (x >= 0 ? '+' : '') + Math.round(x);
  for (const L of ['x', 'y']){
    const a = an[L];
    if (!a){ r.push(`    ${nomeDi[L]}: troppe poche partite per dire qualcosa sul piano`); continue; }
    r.push(`    ${nomeDi[L]} (${a.n} partite):`);
    const ord = a.coef.slice().sort((p, q) => p.p - q.p);
    for (const c of ord)
      r.push(`      ${c.nome.padEnd(56)} ${f(c.stima).padStart(5)} punti  (95%: ${f(c.lo)} … ${f(c.hi)})  ` +
             (c.regge ? 'regge' : c.p < 0.05 ? 'sembra, ma su tanti confronti non regge' : '—'));
    if (a.tolte.length) r.push(`      non stimabili: ${a.tolte.join(', ')} (in questa serie non cambiano mai)`);
  }
  r.push(`    «regge» = sopravvive a Benjamini-Hochberg al ${Math.round(100 * (an.x || an.y || { q: 0.1 }).q)}% su tutte le righe della lista;` +
         ' i numeri sono il meglio PER L’EURISTICA, non per un giocatore.');
  return r;
}

/* ============================================================
   L'ESPERIMENTO: UNA SCELTA SOLA, GLI STESSI DADI
   Le mappe e la regressione dei piani GUARDANO partite in cui tutto
   cambia insieme. Qui invece si FA l'esperimento: per ogni seme la
   stessa partita si gioca cinque volte, una per colonna, con l'unita'
   scelta messa li' e tutto il resto uguale — lo stesso piano per
   tutte e due le liste, gli stessi dadi di partenza. E' il disegno a
   blocchi dei numeri casuali comuni:

     scarto(seme, colonna) = μ + α_seme + β_colonna + errore

   e la differenza fra due colonne si misura DENTRO lo stesso seme,
   dove la fortuna della partita (α) si cancella. Quanto si guadagna lo
   dice il conto stesso: la quota di varianza che il seme si porta via.

   I dadi. Con una sequenza unica sarebbero gli stessi solo finche' le
   partite restano uguali: al primo gesto diverso una pesca un dado in
   piu' e da li' tutto e' scalato. La prima prova su dodici semi ha
   dato un seme che spiegava il 13% della varianza, e l'appaiamento
   valeva 1,2 partite indipendenti. Per questo qui i dadi sono PER
   GESTO (`D.seededPerGesto`): ogni gesto — turno, parte, casella, chi,
   contro chi — ha una sequenza sua, e lo stesso gesto tira gli stessi
   dadi in tutte le colonne. Restano diversi i gesti che l'unita'
   spostata cambia davvero, ed e' giusto: sono l'effetto. Sulla stessa
   prova il seme e' passato dal 13% al 21% della varianza: meglio, non
   un miracolo. Il grosso della differenza fra due colonne non e'
   fortuna, e' che l'euristica gioca un'altra partita — e il conto lo
   stampa ogni volta, perche' chi legge sappia quanto vale l'appaiamento
   su quel tavolo.

   Mettere un'unita' in una colonna puo' spostare le altre: se la sua
   colonna era quella che il piano dava a un'altra, quella va nella
   prossima. E' giusto cosi' — e' quello che succede al tavolo — ed e'
   parte dell'effetto che si misura.
   ============================================================ */
const colonnaDi = p => COLONNE_PIANO.indexOf(String(p.dove || '').split(',')[0]);

export async function esperimentoSchieramento({ AR, AG, D, liste, nomi, scenario, def, magia, partite, seme = 1,
                                                agente, indice, colonne = [0, 1, 2, 3, 4], avanzamento = null,
                                                gesto = true }){
  const righe = [];
  let fatte = 0;
  for (let i = 0; i < partite; i++){
    const s = seme + i;
    for (const col of colonne){
      /* un flusso di dadi per gesto: vedi `seededPerGesto` in dice.js */
      D.setSource(gesto ? D.seededPerGesto(s) : D.seeded(s));
      const S = AR.newBattle({ A: liste.x, B: liste.y, scenario, def, magia, nomi: { A: nomi.x, B: nomi.y } });
      const uid = indice + 1;                         // la lista x sta in zona A: uid da 1
      const base = agente('x', nomi.x, s);
      let messa = null;
      /* l'agente della lista x, con una scelta sola cambiata: dove va
         quell'unita'. L'agente di base si interroga lo stesso, perche'
         il suo contatore delle colonne vada avanti come sempre */
      const x = { nome: base.nome, piano: base.piano, async scegli(ctx){
        const r = await base.scegli(ctx);
        const o = ctx.opzioni;
        if (o.unit === uid && o.list.some(q => q.id === 'schiera')){
          const qui = o.list.filter(q => q.id === 'schiera' && colonnaDi(q) === col);
          const p = qui.find(q => !/fila/.test(q.dove)) || qui[0];
          if (p){ messa = p.dove; return { scelta: p, perche: `esperimento: ${p.dove}` }; }
          messa = messa || null;
        }
        return r;
      } };
      const y = agente('y', nomi.y, s);
      const e = await AG.giocaPartita(AR, S, { A: x, B: y });
      righe.push({ seme: s, col, messa, scarto: (e.A || 0) - (e.B || 0), vince: e.winner === 'A' ? 1 : e.winner === 'B' ? 0 : 0.5 });
      fatte++;
      if (avanzamento) avanzamento(fatte, partite * colonne.length);
    }
  }
  return righe;
}

export function analizzaEsperimento(righe, { q = 0.1 } = {}){
  /* solo i semi in cui l'unita' e' andata davvero in ogni colonna: un
     blocco a cui manca una casella non si confronta */
  const perSeme = new Map();
  for (const r of righe) (perSeme.get(r.seme) || perSeme.set(r.seme, []).get(r.seme)).push(r);
  const colonne = [...new Set(righe.map(r => r.col))].sort((a, b) => a - b);
  const blocchi = [...perSeme.values()].filter(b => colonne.every(c => b.some(r => r.col === c && r.messa)));
  const S = blocchi.length, C = colonne.length;
  if (S < 3) return { S, C, colonne: [], scartati: perSeme.size - S };
  const y = blocchi.map(b => colonne.map(c => b.find(r => r.col === c).scarto));
  const mediaSeme = y.map(r => r.reduce((s, v) => s + v, 0) / C);
  const tot = y.flat().reduce((s, v) => s + v, 0) / (S * C);
  const beta = colonne.map((_, j) => y.reduce((s, r, i) => s + (r[j] - mediaSeme[i]), 0) / S);
  let sse = 0, sst = 0;
  for (let i = 0; i < S; i++) for (let j = 0; j < C; j++){
    const e = y[i][j] - mediaSeme[i] - beta[j];
    sse += e * e; sst += (y[i][j] - tot) ** 2;
  }
  const s2 = sse / ((S - 1) * (C - 1));
  const se = Math.sqrt(s2 * (C - 1) / (C * S));
  /* quanto si porta via il seme: la varianza fra semi sul totale */
  const ssSeme = C * mediaSeme.reduce((s, m) => s + (m - tot) ** 2, 0);
  const quotaSeme = sst > 0 ? ssSeme / sst : 0;
  /* la stessa precisione con partite indipendenti: la varianza di una
     colonna fra semi diversi, senza togliere il seme */
  const seIndip = Math.sqrt(colonne.map((_, j) => ST.media(y.map(r => r[j])).sd ** 2).reduce((s, v) => s + v, 0) / C / S);
  const tab = colonne.map((c, j) => {
    const z = se > 0 ? beta[j] / se : 0;
    return { col: c, nome: COLONNE_PIANO[c], media: ST.media(y.map(r => r[j])).m, effetto: beta[j],
             lo: beta[j] - ST.Z95 * se, hi: beta[j] + ST.Z95 * se, p: ST.pDueCode(z),
             vince: blocchi.reduce((s, b) => s + b.find(r => r.col === c).vince, 0) / S };
  });
  const regge = ST.bh(tab.map(t => t.p), q);
  tab.forEach((t, i) => { t.regge = regge[i]; });
  return { S, C, colonne: tab, se, seIndip, quotaSeme, scartati: perSeme.size - S, q };
}

export function righeEsperimento(a, chi){
  const f = x => (x >= 0 ? '+' : '') + Math.round(x);
  const r = [];
  if (!a.colonne.length){
    r.push(`  troppi pochi semi in cui ${chi} è potuta andare in ogni colonna (${a.S}): servono almeno tre blocchi interi`);
    return r;
  }
  r.push(`  ${chi}: ${a.C} colonne × ${a.S} semi, ogni seme con gli stessi dadi di partenza` +
         (a.scartati ? ` (${a.scartati} semi scartati: in qualche colonna non c'era posto)` : ''));
  r.push(`  ${'colonna'.padEnd(16)} ${'scarto medio'.padStart(12)}  ${'vince'.padStart(6)}   rispetto alla media delle colonne, 95%`);
  for (const t of a.colonne)
    r.push(`  ${t.nome.padEnd(16)} ${f(t.media).padStart(12)}  ${ST.pc(t.vince).padStart(6)}   ${f(t.effetto).padStart(5)} punti (${f(t.lo)} … ${f(t.hi)})  ` +
           (t.regge ? 'regge' : t.p < 0.05 ? 'sembra, ma su cinque confronti non regge' : '—'));
  r.push(`  il seme da solo spiega il ${ST.pc(a.quotaSeme)} della varianza: il confronto appaiato ha un errore di ±${Math.round(ST.Z95 * a.se)} punti` +
         ` contro ±${Math.round(ST.Z95 * a.seIndip)} di partite indipendenti` +
         (a.seIndip > 0 ? ` — come giocarne ${Math.max(1, (a.seIndip / Math.max(a.se, 1e-9)) ** 2).toFixed(1)} volte tante` : ''));
  r.push(`  «regge» = sopravvive a Benjamini-Hochberg al ${Math.round(100 * a.q)}%; è il meglio PER L’EURISTICA.`);
  return r;
}

export { ALTRA };
