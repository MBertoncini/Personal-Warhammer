/* Tante partite, e la stessa lista contro se stessa (tools/serie.mjs).
 *
 * La prova della lista contro se stessa e' l'unico controllo che trova
 * le asimmetrie dell'arbitro: se la stessa lista vince piu' spesso da un
 * lato, o la parte A vince piu' della B, la colpa e' del tavolo o delle
 * regole, non delle liste. E' gia' successo — la «prima fila» di A
 * stava sul bordo del tavolo dietro a tutti — e per mesi A ha anche
 * mosso per prima in ogni partita.
 *
 * Si lancia con:  node test/serie.mjs
 */
import fs from 'node:fs';
import * as AR from '../src/arbitro.js';
import * as AG from '../src/agente.js';
import * as D from '../src/dice.js';
import * as PR from '../src/profiles.js';
import * as SE from '../tools/serie.mjs';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};
const dati = f => JSON.parse(fs.readFileSync(new URL('../dati/' + f, import.meta.url), 'utf8'));
PR.useProfiles(dati('profili.json'));
const liste = dati('liste.json');
const lista = id => liste.find(l => l.id === id);
/* «Il Guado di Sangue LIZ», 600 punti e cinque unita': la piu' corta */
const L = lista('lmtl5tddwir1e');
const nomi = { x: 'Lucertole (x)', y: 'Lucertole (y)' };
const euristica = estro => (tag, nome, s) => AG.agenteEuristico({ nome, estro: estro ? D.seeded(SE.semeEstro(s, tag)) : null });

console.log('lo specchio (tools/serie.mjs)');
{
  const tutte = await SE.giocaSerie({ AR, AG, D, liste: { x: L, y: L }, nomi, scenario: 'bm-guado',
                                      partite: 12, seme: 1, specchio: true, agente: euristica(false) });
  ok('ogni seme si gioca due volte', tutte.length === 24);
  ok('e ogni lista sta in basso esattamente metà delle volte',
     tutte.filter(p => p.zona.A === 'x').length === 12 && tutte.filter(p => p.zona.A === 'y').length === 12);
  /* stessa lista, stesso piano, stessi dadi: le due partite di un seme
     sono la stessa partita con le etichette scambiate */
  const coppie = [];
  for (let i = 0; i < tutte.length; i += 2) coppie.push([tutte[i], tutte[i + 1]]);
  ok('stessa lista e niente estro: le due partite di un seme sono la stessa partita a etichette scambiate',
     coppie.every(([a, b]) => a.vp.x === b.vp.y && a.vp.y === b.vp.x &&
                              (a.vincitore ? b.vincitore === SE.ALTRA[a.vincitore] : !b.vincitore)));
  const a = SE.analizza(tutte);
  ok('e allora x vince esattamente quanto y', a.vince.x === a.vince.y);
  ok('con lo specchio il lato del tavolo si stima', !a.scarto.tolte.includes('stare in basso (zona A)'));
  ok('e la differenza fra le due liste uguali è zero', Math.abs(a.scarto.coef[0].stima) < 1e-6);

  const senza = await SE.giocaSerie({ AR, AG, D, liste: { x: L, y: L }, nomi, scenario: 'bm-guado',
                                      partite: 3, seme: 1, specchio: false, agente: euristica(false) });
  ok('senza specchio il lato non si può separare dalla lista, e i conti lo dicono',
     SE.analizza(senza).scarto.tolte.includes('stare in basso (zona A)'));
}

console.log('\nla stessa lista contro se stessa, con l estro');
{
  /* Qui i piani cambiano, e le partite no: sono tutte diverse. La prova
     e' larga apposta — con quaranta partite si vede solo un'asimmetria
     grossa — ma una grossa e' proprio quella che non deve passare. */
  const tutte = await SE.giocaSerie({ AR, AG, D, liste: { x: L, y: L }, nomi, scenario: 'bm-guado',
                                      partite: 20, seme: 101, specchio: true, agente: euristica(true) });
  const a = SE.analizza(tutte);
  const decise = a.n - a.pareggi;
  ok(`chi sta in basso non vince di più per il solo lato (${a.bassoVince.k} su ${decise}, 95%: ${Math.round(100 * a.bassoVince.w.lo)}–${Math.round(100 * a.bassoVince.w.hi)}%)`,
     a.bassoVince.w.lo < 0.5 && a.bassoVince.w.hi > 0.5);
  ok(`i tiri del libro fanno cominciare tutte e due (x ${a.primoDi.x}, y ${a.primoDi.y})`,
     a.primoDi.x >= 8 && a.primoDi.y >= 8);
  ok('e ogni partita sa chi ha cominciato, chi ha schierato e chi ha finito prima',
     tutte.every(p => p.primo && p.chiSchiera && p.finitoPrima));
}

console.log('\nlo schieramento è lo stesso dai due lati');
{
  /* Le due zone di una battaglia campale sono una lo specchio dell'altra:
     i posti che l'arbitro offre a una parte, rovesciati, devono essere
     quelli dell'altra. E' la geometria che la prova della prima fila
     (test/arbitro.mjs) guarda da un lato solo. */
  D.setSource(D.seeded(1));
  const S = AR.newBattle({ A: L, B: L, scenario: 'bm-strada', primo: 'A' });
  const uA = AR.unitsOf(S, 'A')[0], uB = AR.unitsOf(S, 'B')[0];
  const pa = AR.postiPer(S, uA), pb = AR.postiPer(S, uB);
  const H = S.table.h;
  const chiave = p => `${Math.round(p.x)}:${Math.round(p.y)}`;
  const rovesciati = new Set(pb.map(p => chiave({ x: p.x, y: H - p.y })));
  ok(`i posti della zona B, rovesciati, sono quelli della zona A (${pa.length} e ${pb.length})`,
     pa.length === pb.length && pa.every(p => rovesciati.has(chiave(p))));
}

console.log('\ni dadi per gesto (dice.js)');
{
  const a = D.seededPerGesto(9), b = D.seededPerGesto(9);
  a.contesto('carica 3'); const da = [a(6), a(6), a(6)];
  b.contesto('altro'); b(6); b(6); b(6); b(6);           // l'altra partita ha pescato di più altrove
  b.contesto('carica 3'); const db = [b(6), b(6), b(6)];
  ok('lo stesso gesto tira gli stessi dadi, quanti che siano i dadi pescati dagli altri', da.join() === db.join());
  const c = D.seededPerGesto(9);
  c.contesto('carica 4');
  ok('e gesti diversi tirano sequenze diverse', Array.from({ length: 8 }, () => c(6)).join() !==
     (() => { const d = D.seededPerGesto(9); d.contesto('carica 3'); return Array.from({ length: 8 }, () => d(6)).join(); })());
  D.setSource(D.seeded(3)); const x1 = D.roll(3).join();
  D.setSource(D.seeded(3)); D.contesto('qualunque'); const x2 = D.roll(3).join();
  ok('con una sorgente normale il contesto non cambia niente', x1 === x2);
}

console.log('\nl esperimento: il disegno a blocchi');
{
  /* dati finti di cui si sa la risposta: la fortuna del seme è enorme
     (±300), l'effetto delle colonne piccolo e noto (−40, 0, +40) */
  const r = [];
  let k = 1;
  const rnd = () => ((k = (k * 48271) % 2147483647) / 2147483647) - 0.5;
  for (let s = 1; s <= 40; s++){
    const fortuna = 600 * rnd();
    [-40, 0, 40].forEach((eff, col) => r.push({ seme: s, col, messa: 'x', scarto: fortuna + eff + 60 * rnd(), vince: 1 }));
  }
  const a = SE.analizzaEsperimento(r);
  ok(`ritrova gli effetti delle colonne (${a.colonne.map(c => Math.round(c.effetto)).join(', ')} contro −40, 0, +40)`,
     a.colonne.every((c, i) => Math.abs(c.effetto - [-40, 0, 40][i]) < 15));
  ok(`e dice quanto si è portato via il seme (${Math.round(100 * a.quotaSeme)}%)`, a.quotaSeme > 0.8);
  ok(`l appaiamento è molto più preciso delle partite indipendenti (±${Math.round(a.se)} contro ±${Math.round(a.seIndip)})`,
     a.se * 4 < a.seIndip);
  ok('un seme a cui manca una colonna si scarta', SE.analizzaEsperimento(r.filter(x => !(x.seme === 1 && x.col === 2))).scartati === 1);
}
{
  /* e uno vero, piccolo: i Saurus Warriors, tre semi, due colonne */
  const righe = await SE.esperimentoSchieramento({ AR, AG, D, liste: { x: L, y: L }, nomi, scenario: 'bm-guado',
    partite: 3, seme: 1, indice: 2, colonne: [0, 4], agente: euristica(true) });
  ok('l esperimento mette l unità dove deve, in ogni seme', righe.length === 6 &&
     righe.every(r => r.messa && r.messa.startsWith(r.col === 0 ? 'sinistra' : 'destra')));
  const due = await SE.esperimentoSchieramento({ AR, AG, D, liste: { x: L, y: L }, nomi, scenario: 'bm-guado',
    partite: 1, seme: 1, indice: 2, colonne: [0], agente: euristica(true) });
  ok('e la stessa casella si rigioca identica', due[0].scarto === righe[0].scarto);
}

console.log(fails ? `\n${fails} prove fallite` : '\ntutte le prove passano');
process.exit(fails ? 1 : 0);
