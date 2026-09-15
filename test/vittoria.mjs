/* Come finisce una partita e chi l'ha vinta: i punti vittoria, il
 * verdetto, la durata, il punto di rottura e le tabelle a D6 dei due
 * libri (Tappa 7). Solo moduli puri.
 * Si lancia con:  node test/vittoria.mjs
 */
import * as V from '../src/victory.js';
import * as BM from '../src/battlemarch.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};

/* ================================================================= */
console.log('morti o fuggiti (p. 286)');
ok('un unita distrutta vale tutti i suoi punti', V.unitVP({ pts: 351, dead: true }).vp === 351);
ok('e una fuggita dal tavolo anche', V.unitVP({ pts: 120, fledOff: true }).vp === 120);
ok('una in fuga a fine partita vale la meta per eccesso: 351 fa 176',
   V.unitVP({ pts: 351, fleeing: true }).vp === 176);
ok('sotto un quarto della Forza d Unita vale un quarto per eccesso',
   V.unitVP({ pts: 150, share: 0.2 }).vp === 38);
ok('un quarto tondo non basta', V.unitVP({ pts: 150, share: 0.25 }).vp === 0);
ok('ridotta a meta non vale niente: non e una voce del libro', V.unitVP({ pts: 150, share: 0.5 }).vp === 0);
ok('conta la soglia piu alta, una sola', V.unitVP({ pts: 100, fleeing: true, share: 0.1 }).vp === 50);

ok('un reggimento conta i modelli', V.strengthShare({ models: 20, alive: 4 }) === 0.2);
ok('un mostro conta le Ferite', V.strengthShare({ models: 1, alive: 1, woundsPer: 6, woundsLost: 5 }) < 0.25);
ok('e un modello da una Ferita non si riduce', V.strengthShare({ models: 1, alive: 1 }) === 1);

/* ================================================================= */
console.log('\nil verdetto (p. 286; Battle March p. 27)');
ok('con meno di cento punti di scarto e pareggio', V.victory(800, 720).winner === null);
ok('con cento si vince', V.victory(820, 720).winner === 'A' && V.victory(820, 720).level === 'win');
ok('con il doppio si stravince', V.victory(300, 900).level === 'crushing' && V.victory(300, 900).winner === 'B');
ok('in Battle March basta averne di piu', V.victory(310, 290, 'bm').winner === 'A');
ok('ma a pari punti e pareggio anche li', V.victory(300, 300, 'bm').winner === null);

console.log('\ni bonus dei due formati');
ok('il generale vale 100 nel libro base', V.bonuses('core').general === 100);
ok('e 50 in Battle March', V.bonuses('bm').general === 50);
ok('lo stendardo 50 e 25', V.bonuses('core').banner === 50 && V.bonuses('bm').banner === 25);
ok('il tesoro vale 10 a fine turno', V.bonuses('bm').treasure === 10 && V.bonuses('bm').landmark === 25);
ok('e con i Tesori dell entroterra 20 e 50',
   V.bonuses('bm', ['tesori']).treasure === 20 && V.bonuses('bm', ['tesori']).landmark === 50);
ok('il formato viene dallo scenario', V.formatFor({ group: 'Battle March' }) === 'bm' && V.formatFor({ group: 'Generici' }) === 'core');
ok('ma si sceglie a mano', V.formatOf({ meta: { format: 'core' }, scenario: { group: 'Battle March' } }) === 'core');

console.log('\ngli obiettivi sommati sulle fotografie');
const turns = [
  { kind: 'deploy', n: 0 },
  { kind: 'turn', n: 1, army: 'A', objectives: [{ kind: 'treasure', army: 'A' }, { kind: 'treasure', army: null }] },
  { kind: 'turn', n: 1, army: 'B', objectives: [{ kind: 'treasure', army: 'A' }, { kind: 'treasure', army: 'B' }] },
  { kind: 'turn', n: 2, army: 'A', objectives: [{ kind: 'landmark', army: 'B' }] },
];
const pts = V.objectivePoints(turns, 'bm');
ok('ogni fine turno conta, di tutti e due', pts.A === 20 && pts.B === 35);
ok('un obiettivo conteso non vale niente', pts.rows.length === 4);
ok('fuori da Battle March i tesori non danno punti a turno', V.objectivePoints(turns, 'core').A === 0);

/* ================================================================= */
console.log('\nquanto dura');
ok('sei round nel libro base', V.endOfRound({ length: 'fixed', round: 5 }).ends === false &&
   V.endOfRound({ length: 'fixed', round: 6 }).ends === true);
ok('cinque in Battle March', V.endOfRound({ length: 'bm', round: 5 }).ends === true);
ok('e sei con il Conflitto prolungato', V.endOfRound({ length: 'bm', round: 5, chaos: ['seiRound'] }).ends === false);
ok('la durata casuale non tira prima del quinto round', V.endOfRound({ length: 'random', round: 4 }).roll === false);
const q = V.endOfRound({ length: 'random', round: 5 });
ok('al quinto chiede un D6 e serve 5 o piu', q.roll === true && q.need === 5 && q.ends === false);
ok('un 5 al quinto round finisce la battaglia', V.endOfRound({ length: 'random', round: 5, die: 5 }).ends === true);
ok('un 3 al sesto no', V.endOfRound({ length: 'random', round: 6, die: 3 }).ends === false);
ok('il punto di rottura e un quarto per difetto', V.breakPoint(95) === 23);
ok('e si rompe chi scende sotto', V.broken(22, 95).broken === true && V.broken(23, 95).broken === false);

/* ================================================================= */
console.log('\nle tabelle a D6');
ok('sei battaglie campali', V.PITCHED.length === 6 && V.pitchedFor(5).id === 'pass');
ok('il Passo di Montagna ha la durata casuale', V.pitchedFor(5).lengths.includes('random'));
ok('lo scenario dell app trova la sua battaglia', V.pitchedOfScenario('meeting').page === 294);
ok('gli obiettivi di Battle March: 1-2 due tesori, 5-6 il landmark',
   V.byFace(V.BM_OBJECTIVES, 2).id === 'two' && V.byFace(V.BM_OBJECTIVES, 6).id === 'landmark');
ok('il landmark con 3-4 da Frenzy', V.byFace(V.LANDMARK_PROPS, 4).id === 'zeal');
ok('la terza mappa e Opposed Flanks', V.byFace(V.BM_DEPLOY, 3).id === 'opposed');

console.log('\nle due tabelle di Battle March, lette sul libro (pp. 40-41)');
ok('il Terreno Selvaggio non e piu da verificare', BM.WILD_TERRAIN.ordineDaVerificare === false);
ok('e il 6 e la tana del Troll', BM.WILD_TERRAIN.rows[5].id === 'troll');
ok('il Caso della Guerra: il 2 e il carro perso', BM.FORTUNES.rows[1].id === 'carro');
ok('e il 3 le munizioni', BM.FORTUNES.rows[2].id === 'munizioni');
ok('e non e piu da verificare', BM.FORTUNES.ordineDaVerificare === false);
let doppioni = 0;
for (let i = 0; i < 200; i++){
  const f = BM.fortunesCheck(6, ['ventiInstabili', 'carro', 'munizioni', 'tesori', 'seiRound']);
  if (f.happened && f.id !== 'mercenari') doppioni++;
}
ok('un esito gia uscito si ritira invece di ripetersi', doppioni === 0);

console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
