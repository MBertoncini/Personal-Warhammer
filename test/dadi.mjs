/* I dadi: il generatore e la faccia che il cubo mostra.
 *
 * Il vassoio non decide niente — il risultato esce da `dice.js` — ma
 * deve far vedere la faccia giusta, e per un turno intero ha fatto
 * atterrare ogni raffica sul pallino in mezzo perche' chi gli passava
 * i dadi del tiro mandava solo il valore letto e non la faccia grezza.
 * Il ripiego adesso e' scritto, e questa prova lo tiene scritto.
 *
 * Si lancia con:  node test/dadi.mjs
 */
import * as D from '../src/dice.js';
import { faceOf } from '../src/dicebox.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};

/* ================================================================= */
console.log('la faccia grezza che il cubo deve mostrare');

ok('la faccia dichiarata vince su tutto', faceOf({ raw: 5, value: 2 }) === 5);
ok('senza faccia, per un D6 vale il valore letto', faceOf({ value: 4 }) === 4);
ok('un valore che non e una faccia di dado non si inventa', faceOf({ value: 10 }) === 1);
ok('e nemmeno il Mancato Colpo, che valore non ne ha', faceOf({ value: null }) === 1);
ok('un dado senza niente sopra si posa sull uno', faceOf({}) === 1 && faceOf(null) === 1);
/* il caso che ha prodotto il bug: il tiro passava { value, win } */
ok('i dadi del tiro, senza raw, mostrano il numero uscito',
   [1, 2, 3, 4, 5, 6].every(v => faceOf({ value: v, win: v >= 5 }) === v));
/* e i dadi che arrivano da dice.js la faccia ce l hanno sempre */
ok('ogni dado di dice.js porta la sua faccia',
   D.rollDice({ kind:'d6', n: 20 }).dice.every(d => faceOf(d) === d.raw));
ok('anche il D3, che sulla faccia ha scritto un altro numero',
   D.rollDice({ kind:'d3', n: 20 }).dice.every(d => faceOf(d) === d.raw && d.raw >= 1 && d.raw <= 6));
ok('e il dado di artiglieria, Mancato Colpo compreso',
   D.rollDice({ kind:'artillery', n: 20 }).dice.every(d => faceOf(d) === d.raw));

/* ================================================================= */
console.log('\nil generatore');

D.setSource(null);
const tiri = D.roll(600);
ok('un D6 sta fra uno e sei', tiri.every(v => v >= 1 && v <= 6));
ok('e tutte e sei le facce escono', new Set(tiri).size === 6);

/* la sorgente sostituibile: serve alle altre prove, e deve reggere */
D.setSource(() => 5);
ok('con la sorgente decisa il dado e deciso', D.d6() === 6);
D.setSource(null);

/* il generatore con il seme: le partite si rigiocano da li', e un
   generatore che non tira mai 2, 4 o 6 fa partite finte senza che
   nessuno se ne accorga */
{
  D.setSource(D.seeded(1));
  const conta = [0, 0, 0, 0, 0, 0];
  const N = 60000;
  for (let i = 0; i < N; i++) conta[D.d6() - 1]++;
  ok('con il seme ogni faccia esce una volta su sei (fra 15,5% e 17,8%)',
     conta.every(c => c / N > 0.155 && c / N < 0.178));
  let pari = 0;
  for (let i = 0; i < 6000; i++) if (D.d6() % 2 === 0) pari++;
  ok('e i pari escono quanto i dispari', pari > 2700 && pari < 3300);
  const seq = s => { D.setSource(D.seeded(s)); return D.roll(20).join(''); };
  ok('lo stesso seme dà la stessa sequenza', seq(7) === seq(7));
  ok('un seme diverso ne dà un\'altra', seq(7) !== seq(8));
  D.setSource(D.seeded(3));
  const grandi = Array.from({ length: 2000 }, () => D.randomInt(360));
  ok('e regge anche i numeri grandi, fino a 359', grandi.every(v => v >= 0 && v < 360) && new Set(grandi).size > 300);
  D.setSource(null);
}

const s = D.scatter({ distance:'d6' });
ok('la deviazione torna un grado fra 0 e 359', s.deg >= 0 && s.deg <= 359);
ok('e Colpito! non sposta di un pollice', !s.hit || s.inches === 0);

/* ================================================================= */
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
