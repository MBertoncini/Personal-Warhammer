/* Chi guarda una mossa avanti (src/ricerca.js), e i pezzi dell'arbitro
 * che gli servono: la copia della partita, il valore di una posizione,
 * lo scontro di piu' caricatori sullo stesso bersaglio.
 *
 * Si lancia con:  node test/ricerca.mjs
 */
import fs from 'node:fs';
import * as AR from '../src/arbitro.js';
import * as AG from '../src/agente.js';
import * as D from '../src/dice.js';
import * as PR from '../src/profiles.js';
import { agenteRicerca } from '../src/ricerca.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};
const MM = 25.4;
const dati = f => JSON.parse(fs.readFileSync(new URL('../dati/' + f, import.meta.url), 'utf8'));
PR.useProfiles(dati('profili.json'));
const liste = dati('liste.json');
const A = liste.find(l => l.id === 'lmtl5sa4300nt'), B = liste.find(l => l.id === 'lmtl5sn694u6w');   // «La Strada delle Pietre»
const casella = id => AR.CASELLE.findIndex(c => c.id === id);
const tavolo = posti => {
  const G = AR.newBattle({ A, B, scenario: 'bm-strada', primo: 'A' });
  G.schierando = false;
  for (const [nome, x, y, rot] of posti){
    const u = G.units.find(v => v.name === nome);
    u.placed = true; u.x = x * MM; u.y = y * MM; u.rot = rot;
  }
  return G;
};

console.log('la copia della partita');
{
  const G = tavolo([['Skink Skirmishers 1', 24, 26, 0], ['Black Orc Mobs', 24, 10, 180]]);
  G.casella = casella('mosse'); G.army = 'A';
  const sk = G.units.find(u => u.name === 'Skink Skirmishers 1');
  const prima = { y: sk.y, log: G.log.length, moved: sk.moved };
  const T = AR.clona(G);
  const av = AR.options(T).list.find(x => x.id === 'avanza' && x.uid === sk.uid);
  AR.apply(T, av);
  ok('una mossa sulla copia non tocca la partita vera',
     sk.y === prima.y && G.log.length === prima.log && sk.moved === prima.moved);
  ok('e sulla copia la mossa c è', T.units.find(u => u.uid === sk.uid).y < prima.y && T.log.length > 0);
}

console.log('\nil valore di una posizione');
{
  const G = tavolo([['Skink Skirmishers 1', 24, 26, 0], ['Temple Guard', 12, 28, 0], ['Black Orc Mobs', 24, 10, 180], ['Orc Mobs', 36, 12, 180]]);
  G.casella = casella('mosse'); G.army = 'A';
  const a = AR.valuta(G, 'A'), b = AR.valuta(G, 'B');
  ok(`senza mischie, il valore per una parte è l opposto di quello per l altra (${a.toFixed(1)} e ${b.toFixed(1)})`,
     Math.abs(a + b) < 1e-6);
  const orc = G.units.find(u => u.name === 'Orc Mobs');
  orc.lost = 10;
  ok('un nemico mezzo morto vale di più anche prima che il punteggio lo conti', AR.valuta(G, 'A') > a);
}

console.log('\nlo scontro di più caricatori (p. 153)');
{
  const G = tavolo([['Temple Guard', 24, 26, 0], ['Bastiladon', 30, 26, 0], ['Orc Mobs', 24, 10, 180]]);
  const tg = G.units.find(u => u.name === 'Temple Guard'), bas = G.units.find(u => u.name === 'Bastiladon');
  const orc = G.units.find(u => u.name === 'Orc Mobs');
  const uno = AR.scontroDiGruppo(G, [{ u: tg, lato: 'fronte' }], orc);
  const due = AR.scontroDiGruppo(G, [{ u: tg, lato: 'fronte' }, { u: bas, lato: 'fianco' }], orc);
  ok('da solo è lo stesso conto dello scontro atteso', uno.valore === AR.scontroAtteso(G, tg, orc).valore);
  ok(`in due si fanno più ferite e si vince di più (${uno.date} → ${due.date} ferite, ${uno.diff} → ${due.diff} di risultato)`,
     due.date > uno.date && due.diff > uno.diff && due.rottaLui >= uno.rottaLui);
}

console.log('\nchi guarda avanti');
{
  /* gli Skink a un pollice dai Black Orc: la carica arriva sempre, e ci
     si perde. L'euristica di prima caricava lo stesso; chi guarda avanti
     no. */
  const G = tavolo([['Skink Skirmishers 1', 24, 14.2, 0], ['Black Orc Mobs', 24, 10, 180]]);
  G.casella = casella('cariche'); G.army = 'A';
  const o = AR.options(G);
  const c = o.list.find(x => x.id === 'carica');
  ok(`la carica porta quanto rende (${c && c.esito} punti, arriva il ${c && Math.round(c.chance * 100)}%)`, !!c && c.esito < 0);
  const r = await agenteRicerca({ AR }).scegli({ opzioni: o, stato: G });
  ok(`chi guarda avanti non carica per perderci («${r.scelta.id}»)`, r.scelta.id === 'avanti');
  const e = await AG.agenteEuristico({}).scegli({ opzioni: o, stato: G });
  ok(`e nemmeno l euristica, adesso che legge «esito» («${e.scelta.id}»)`, e.scelta.id !== 'carica');
}
{
  /* la Temple Guard sugli Orc Mobs: rende, e carica */
  const G = tavolo([['Temple Guard', 24, 19, 0], ['Orc Mobs', 24, 10, 180]]);
  G.casella = casella('cariche'); G.army = 'A';
  const o = AR.options(G);
  const r = await agenteRicerca({ AR }).scegli({ opzioni: o, stato: G });
  ok(`quando rende, carica («${r.scelta.id}»: ${String(r.perche).slice(0, 70)}…)`, r.scelta.id === 'carica');
}
{
  /* il movimento provato: gli Skink davanti ai Black Orc non vanno a
     farsi caricare */
  const G = tavolo([['Skink Skirmishers 1', 24, 26, 0], ['Black Orc Mobs', 24, 10, 180]]);
  G.casella = casella('mosse'); G.army = 'A';
  const o = AR.options(G);
  D.setSource(D.seeded(5));
  const r = await agenteRicerca({ AR }).scegli({ opzioni: o, stato: G });
  const dopo = D.roll(6).join();
  D.setSource(D.seeded(5));
  const senza = D.roll(6).join();
  ok(`provando le mosse, gli Skink non avanzano sotto la carica («${r.scelta.id}»)`, r.scelta.id !== 'avanza' && /guardando/.test(r.perche));
  ok('e i dadi della partita vera restano quelli: le prove tirano su una sorgente a parte', dopo === senza);
}
{
  /* una partita intera, e nessuna mossa rifiutata */
  D.setSource(D.seeded(3));
  const G = AR.newBattle({ A, B, scenario: 'bm-strada' });
  const rifiutate = [];
  const e = await AG.giocaPartita(AR, G, { A: agenteRicerca({ AR }), B: AG.agenteEuristico({}),
    onPasso: x => { if (!x.esito.ok) rifiutate.push(`${x.mossa && x.mossa.id}: ${x.esito.text}`); } });
  if (rifiutate.length) console.log('       ' + rifiutate.slice(0, 4).join(' | '));
  ok('una partita intera con chi guarda avanti finisce, e senza mosse rifiutate', G.finita && !!e && rifiutate.length === 0);
}

console.log(fails ? `\n${fails} prove fallite` : '\ntutte le prove passano');
process.exit(fails ? 1 : 0);
