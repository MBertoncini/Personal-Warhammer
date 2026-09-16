/* Le liste: il palmarès, i filtri e le liste esterne.
 *
 * Tre domande che al circolo ci si fa davvero — «quali liste hanno i
 * Clanrats?», «quali sono di Skaven?», «quali hanno vinto?» — più la
 * lista che non è tua e non deve comparire nel conto della vetrina.
 *
 * Niente pagina e niente archivio: entrano oggetti, escono elenchi.
 *
 * Si lancia con:  node test/liste.mjs
 */
import * as PAL from '../src/palmares.js';
import { filterLists, factionsOf } from '../src/lists.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};

/* --- l'archivio finto --- */
const lista = (name, cat, units, extra = {}) => ({
  id: 'l' + name, name, points: 1000,
  info: { catalogue: cat }, units: units.map(n => ({ name: n, models: 10, pts: 100 })),
  ...extra,
});
const partita = (a, b, pa, pb, date, turni = 4) => ({
  id: 'r' + a + b + date, title: a + ' vs ' + b,
  meta: { date },
  armies: { A:{ name:a }, B:{ name:b } },
  score: { rows: [{ id:'x', A: pa, B: pb }] },
  turns: Array.from({ length: turni }, () => ({ kind:'turn' })),
});

const liste = [
  lista('Skaven da torneo', 'Skaven', ['20 Clanrats', 'Warplock Jezzails']),
  lista('Ogre pesanti', 'Ogre Kingdoms', ['Ironguts', 'Leadbelchers']),
  lista('Orchi di casa', 'Orc and Goblin Tribes', ['Orc Mob', 'Boar Boyz']),
  lista('Quella del vicino', 'Skaven', ['30 Clanrats'], { external: true }),
  lista('Elfi mai usciti', 'High Elf Realms', ['Spearmen']),
];

PAL.usePalmares([
  partita('Skaven da torneo', 'Orchi di casa', 1200, 800, '2026-03-01'),
  partita('Skaven da torneo', 'Ogre pesanti', 600, 900, '2026-03-02'),
  /* un risultato di torneo, senza nessun turno registrato */
  partita('Ogre pesanti', 'Quella del vicino', 1500, 1500, '2026-04-10', 0),
  /* una partita giocata da due modelli: sta nel diario, non nel palmarès */
  { ...partita('Skaven da torneo', 'Orchi di casa', 100, 900, '2026-05-01'), meta: { date: '2026-05-01', simulata: true } },
]);

/* ================================================================= */
console.log('il palmares di una lista');

const sk = PAL.recordOf('Skaven da torneo');
ok('conta le partite giocate, non quelle simulate', sk.played === 2);
ok('e come sono andate', sk.won === 1 && sk.lost === 1 && sk.draw === 0);
ok('con i punti fatti e quelli presi', sk.pts === 1800 && sk.against === 1700);
ok('la piu recente per prima', sk.games[0].date === '2026-03-02');
ok('e ognuna dice contro chi', sk.games[0].foe === 'Ogre pesanti');
ok('una lista mai giocata non ha palmares', PAL.recordOf('Non esiste').played === 0);

const og = PAL.recordOf('Ogre pesanti');
ok('un pareggio si conta come tale', og.draw === 1 && og.won === 1 && og.lost === 0);
ok('e una partita senza turni conta come le altre',
   og.games.some(g => g.turns === 0) && og.played === 2);

ok('il nome si aggancia a meno di accenti e maiuscole',
   PAL.recordOf('  SKAVEN  DA  TORNEO ').played === 2);
ok('ma non a un nome diverso', PAL.recordOf('Skaven da circolo').played === 0);
ok('la riga che si legge dice quante e quante vinte',
   /2 giocate/.test(PAL.recordText(sk)) && /1 vinta/.test(PAL.recordText(sk)));
ok('e di una mai giocata non dice niente', PAL.recordText(PAL.recordOf('Non esiste')) === '');

/* ================================================================= */
console.log('\ni filtri');

const f = (v) => filterLists(liste, { q:'', faction:'', outcome:'', mine:'', ...v }).map(l => l.name);

ok('senza filtri ci sono tutte', f({}).length === 5);
ok('il testo cerca dentro le unita, non solo nel nome',
   f({ q:'clanrats' }).length === 2 && f({ q:'clanrats' }).includes('Quella del vicino'));
ok('e cerca anche nel nome della lista', f({ q:'torneo' }).join() === 'Skaven da torneo');
ok('due parole vogliono tutte e due', f({ q:'clanrats vicino' }).join() === 'Quella del vicino');
ok('e una parola che non c e non torna niente', f({ q:'zanzare' }).length === 0);

ok('la fazione filtra per esercito dichiarato',
   f({ faction:'Ogre Kingdoms' }).join() === 'Ogre pesanti');
ok('le fazioni sono quelle che ci sono davvero, con quante liste',
   factionsOf(liste).find(([n, c]) => n === 'Skaven')[1] === 2);

ok('«hanno vinto» tiene solo chi ha vinto almeno una volta',
   f({ outcome:'won' }).sort().join() === 'Ogre pesanti,Skaven da torneo');
ok('«hanno perso» e un altro elenco',
   f({ outcome:'lost' }).sort().join() === 'Orchi di casa,Skaven da torneo');
ok('«mai giocate» tiene chi non ha partite', f({ outcome:'never' }).join() === 'Elfi mai usciti');
ok('«gia giocate» tiene le altre', f({ outcome:'played' }).length === 4);

ok('le esterne si separano dalle mie', f({ mine:'ext' }).join() === 'Quella del vicino');
ok('e le mie dalle esterne', f({ mine:'mine' }).length === 4);
ok('i filtri si sommano',
   f({ faction:'Skaven', mine:'mine' }).join() === 'Skaven da torneo');

/* ================================================================= */
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
