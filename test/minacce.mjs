/* Dove ti possono caricare (src/minacce.js), e il gioco delle distanze.
 *
 * Prima la geometria pura — un nemico girato verso di te a una distanza
 * nota deve dare esattamente la probabilita' di `chargeChance`; girato
 * dall'altra parte, zero — poi l'arbitro, che scrive `rischio`, `danno`
 * e `portata` sulle mosse e offre di fermarsi prima, e l'euristica, che
 * lo fa quando la carica le costerebbe.
 *
 * Si lancia con:  node test/minacce.mjs
 */
import fs from 'node:fs';
import * as MN from '../src/minacce.js';
import * as CH from '../src/charge.js';
import * as AR from '../src/arbitro.js';
import * as AG from '../src/agente.js';
import * as D from '../src/dice.js';
import * as PR from '../src/profiles.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};
const MM = 25.4;
const vicino = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

console.log('la minaccia di un nemico solo (p. 119)');
{
  /* il nemico guarda in giu' (rot 180), il bersaglio sta 8″ sotto di lui:
     Movimento 4, servono 4″ di tiro — il maggiore di due D6 fa 4 o piu'
     tre volte su quattro */
  const e = { uid: 1, name: 'Orchi', box: { x: 500, y: 200, w: 5 * MM, h: 2 * MM, rot: 180 }, move: 4 };
  const bersaglio = { x: 500, y: 200 + MM + 8 * MM + MM, w: 5 * MM, h: 2 * MM, rot: 0 };
  const c = MN.caricaSu(e, bersaglio);
  ok(`girato verso il bersaglio a 8″: ${c && c.chance} = chargeChance(4) = ${CH.chargeChance(4)}, di fronte`,
     !!c && vicino(c.chance, CH.chargeChance(4), 0.01) && vicino(c.need, 4, 0.05) && c.lato === 'fronte');
  ok('girato dall altra parte non carica: il bersaglio non è nell arco', MN.caricaSu({ ...e, box: { ...e.box, rot: 0 } }, bersaglio) === null);
  ok('oltre la portata massima (M + 6) nemmeno',
     MN.caricaSu(e, { ...bersaglio, y: bersaglio.y + 3 * MM }) === null);
  ok('con il passo lungo sì, e con la probabilità del terzo dado',
     vicino(MN.caricaSu({ ...e, swift: true }, { ...bersaglio, y: bersaglio.y + 3 * MM }).chance,
            CH.chargeChance(7, true), 0.01));
  ok('gli schermagliatori caricano in ogni direzione (p. 184)',
     MN.caricaSu({ ...e, box: { ...e.box, rot: 0 }, loose: true }, bersaglio) !== null);
  /* un bosco in mezzo: il dado peggiore */
  const bosco = { kind: 'wood', label: 'Bosco', box: { x: 500, y: 330, w: 8 * MM, h: 3 * MM, rot: 0 },
                  poly: [[398, 292], [602, 292], [602, 368], [398, 368]], cat: 'difficult', blocks: false,
                  contains: p => Math.abs(p[0] - 500) <= 4 * MM && Math.abs(p[1] - 330) <= 1.5 * MM };
  const nb = MN.caricaSu(e, bersaglio, [bosco]);
  ok(`attraverso il terreno difficile il dado peggiore (${nb ? nb.chance : 'nessuna'} < ${c.chance})`,
     !nb || (nb.worst && nb.chance < c.chance));
}

console.log('\npiù nemici, e la griglia');
{
  const e1 = { uid: 1, name: 'a', box: { x: 400, y: 200, w: 100, h: 50, rot: 180 }, move: 4 };
  const e2 = { uid: 2, name: 'b', box: { x: 600, y: 200, w: 100, h: 50, rot: 180 }, move: 4 };
  const t = { x: 500, y: 200 + 25 + 9 * MM + 25, w: 100, h: 50, rot: 0 };
  const m = MN.minacciaSu(t, [e1, e2]);
  const p1 = MN.caricaSu(e1, t).chance, p2 = MN.caricaSu(e2, t).chance;
  ok('due nemici: almeno uno carica con 1 − (1−p₁)(1−p₂)', vicino(m.p, 1 - (1 - p1) * (1 - p2)) && m.cariche.length === 2);
  const g = MN.griglia({ W: 1000, H: 800, passo: 50, sonda: { w: 100, h: 50, rot: 0 }, enemies: [e1] });
  const cella = (x, y) => g.p[Math.floor(y / 50) * g.cols + Math.floor(x / 50)];
  ok('la griglia è rossa davanti al nemico', cella(400, 350) > 0.9);
  ok('e vuota alle sue spalle, dove non è girato', cella(400, 60) === 0);
  ok('e vuota lontano', cella(900, 780) === 0);
}

console.log('\nlo scontro atteso');
const dati = f => JSON.parse(fs.readFileSync(new URL('../dati/' + f, import.meta.url), 'utf8'));
PR.useProfiles(dati('profili.json'));
const liste = dati('liste.json');
const A = liste.find(l => l.id === 'lmtl5sa4300nt'), B = liste.find(l => l.id === 'lmtl5sn694u6w');
{
  const S = AR.newBattle({ A, B, scenario: 'bm-strada', primo: 'A' });
  for (const u of S.units) u.placed = true;
  const by = n => S.units.find(u => u.name === n);
  const tg = by('Temple Guard'), orc = by('Orc Mobs');
  const a = AR.scontroAtteso(S, tg, orc), b = AR.scontroAtteso(S, orc, tg);
  ok('di fronte, lo scontro è lo stesso visto dai due lati: i valori sono opposti', a.valore === -b.valore && a.diff === -b.diff);
  ok(`la Temple Guard contro gli Orc Mobs vince il round (${a.diff} di risultato, ${a.valore} punti)`, a.diff > 0 && a.valore > 0);
  ok('e chi perde può scappare, chi vince no', a.rottaLui > 0 && a.rottaMia === 0);
  const f = AR.scontroAtteso(S, orc, tg, 'fianco');
  ok('presa di fianco vale di più per chi carica (p. 150)', f.diff > b.diff);
  ok('la probabilità che l inseguimento prenda chi fugge si conta: 2D6 contro 2D6, ≈ 0,556',
     vicino(AR.PRESO_A_DADI_PARI, 0.5563, 0.001));
}

console.log('\nil gioco delle distanze, nell arbitro e nell euristica');
{
  const G = AR.newBattle({ A, B, scenario: 'bm-strada', primo: 'A' });
  G.schierando = false;
  const by = n => G.units.find(u => u.name === n);
  const sk = by('Skink Skirmishers 1'), bo = by('Black Orc Mobs');
  sk.placed = true; sk.x = 24 * MM; sk.y = 26 * MM; sk.rot = 0;
  bo.placed = true; bo.x = 24 * MM; bo.y = 10 * MM; bo.rot = 180;
  G.casella = AR.CASELLE.findIndex(c => c.id === 'mosse'); G.army = 'A';
  const o = AR.options(G).list;
  const av = o.find(x => x.id === 'avanza' && x.uid === sk.uid);
  const fe = o.find(x => x.id === 'ferma' && x.uid === sk.uid);
  const ac = o.find(x => x.id === 'accosta' && x.uid === sk.uid);
  ok(`l avanzata dice chi la carica dove arriva (rischio ${av && av.rischio}, danno ${av && av.danno}, portata ${av && av.portata})`,
     !!av && av.rischio > 0.2 && av.danno > 0 && av.portata > 0 && /la carica il/.test(av.why));
  ok(`restando ferma il rischio è più basso (${fe && fe.rischio})`, !!fe && fe.rischio < av.rischio);
  ok(`e si offre di fermarsi prima, dove il rischio scende (${ac && ac.pollici}″, rischio ${ac && ac.rischio})`,
     !!ac && ac.pollici < av.pollici && ac.rischio <= av.rischio - 0.15 && ac.fino === ac.pollici);
  /* con la soglia del danno sotto quello che costerebbe: il piano fisso
     ne tollera 15, e gli Skink qui ne perderebbero una dozzina */
  const ag = AG.agenteEuristico({ piano: { danno: 5 } });
  const r = await ag.scegli({ opzioni: { player: 'A', list: o.filter(x => x.uid === sk.uid || x.id === 'avanti') } });
  ok(`l euristica non si mette dove la caricano: sceglie «${r.scelta.id}»`, r.scelta.id === 'accosta' || r.scelta.id === 'ferma');
  const prima = sk.y;
  const esito = AR.apply(G, ac);
  ok('e «accosta» porta l unità di quanto ha detto, non di tutto il Movimento',
     esito.ok && vicino((prima - sk.y) / MM, ac.pollici, 0.3));

  /* chi dalla carica non perde niente va avanti: la Temple Guard contro
     gli Orc Mobs, che la caricherebbero per perdere */
  const G2 = AR.newBattle({ A, B, scenario: 'bm-strada', primo: 'A' });
  G2.schierando = false;
  const b2 = n => G2.units.find(u => u.name === n);
  const bas = b2('Temple Guard'), orc = b2('Orc Mobs');
  bas.placed = true; bas.x = 24 * MM; bas.y = 26 * MM; bas.rot = 0;
  orc.placed = true; orc.x = 24 * MM; orc.y = 10 * MM; orc.rot = 180;
  G2.casella = AR.CASELLE.findIndex(c => c.id === 'mosse'); G2.army = 'A';
  const o2 = AR.options(G2).list.filter(x => x.uid === bas.uid || x.id === 'avanti');
  const av2 = o2.find(x => x.id === 'avanza');
  const r2 = await AG.agenteEuristico({ piano: { danno: 5 } }).scegli({ opzioni: { player: 'A', list: o2 } });
  ok(`chi dalla carica non perde niente va avanti lo stesso (danno ${av2 && av2.danno}: «${r2.scelta.id}»)`,
     !!av2 && av2.rischio > 0.2 && av2.danno < 5 && (r2.scelta.id === 'avanza' || r2.scelta.id === 'marcia'));
}

console.log(fails ? `\n${fails} prove fallite` : '\ntutte le prove passano');
process.exit(fails ? 1 : 0);
