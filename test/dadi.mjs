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

const s = D.scatter({ distance:'d6' });
ok('la deviazione torna un grado fra 0 e 359', s.deg >= 0 && s.deg <= 359);
ok('e Colpito! non sposta di un pollice', !s.hit || s.inches === 0);

/* ================================================================= */
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
