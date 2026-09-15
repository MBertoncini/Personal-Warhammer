/* La Tappa 4: il tiro e le macchine da guerra.
 *
 * Chi puo' tirare, quanti tirano modello per modello, i modificatori
 * agganciati alle condizioni vere, il punteggio con l'1 che non
 * colpisce mai, le sagome con la regola del «sotto in parte», la
 * deviazione applicata, il cannone e il lanciapietre, il Panico.
 *
 * Come `test/mischia.mjs`, questo guarda il tiro dal lato dei numeri:
 * niente jsdom, niente pagina, solo moduli puri.
 *
 * Si lancia con:  node test/tiro.mjs
 */
import * as SH from '../src/shoot.js';
import * as C from '../src/combat.js';
import { MM } from '../src/util.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* un pezzo di terreno nella forma che tactics.js si aspetta */
const piece = (x, y, w, h, { blocks = false, cover = '', label = 'Bosco', kind = '' } = {}) => {
  const box = { x: x * MM, y: y * MM, w: w * MM, h: h * MM, rot: 0 };
  const poly = [[box.x - box.w / 2, box.y - box.h / 2], [box.x + box.w / 2, box.y - box.h / 2],
                [box.x + box.w / 2, box.y + box.h / 2], [box.x - box.w / 2, box.y + box.h / 2]];
  return {
    kind, label, blocks, cover, box, poly, circle: false,
    contains: p => Math.abs(p[0] - box.x) <= box.w / 2 && Math.abs(p[1] - box.y) <= box.h / 2,
  };
};
/* un bersaglio: solo il poligono, che e' tutto quello che serve */
const foe = (x, y, w = 4, h = 2) => ({
  poly: [[(x - w / 2) * MM, (y - h / 2) * MM], [(x + w / 2) * MM, (y - h / 2) * MM],
         [(x + w / 2) * MM, (y + h / 2) * MM], [(x - w / 2) * MM, (y + h / 2) * MM]],
});
/* i modelli di chi tira: una griglia di caselle da 20 mm */
const rows = (n, front, x0, y0, step = 1) =>
  Array.from({ length: n }, (_, i) => ({
    cell: i,
    wx: (x0 + (i % front) * step) * MM,
    wy: (y0 + Math.floor(i / front) * step) * MM,
    w: 20, h: 20, wrot: 0,
  }));

/* ================================================================= */
console.log('chi puo tirare (p. 137)');

ok('chi non ha fatto niente tira', SH.canShoot({}).can === true);
ok('chi ha caricato non tira', SH.canShoot({ charged: true }).can === false);
ok('chi ha marciato non tira', SH.canShoot({ marched: true }).can === false);
ok('chi e a contatto non tira', SH.canShoot({ engaged: true }).can === false);
ok('chi fugge non tira', SH.canShoot({ fleeing: true }).can === false);
/* e il divieto che non viene dall unita ma dall arma */
ok('«o si muove o tira» ferma chi ha mosso',
   SH.canShoot({ moved: true, weaponFlags: { moveOrShoot: true } }).can === false);
ok('la stessa arma ferma da fermo non ferma niente',
   SH.canShoot({ moved: false, weaponFlags: { moveOrShoot: true } }).can === true);
/* il perche viene sempre detto: e la regola del paragrafo 1 del piano */
ok('e ogni no dice il suo perche',
   SH.canShoot({ charged: true, marched: true }).why.length === 2);

/* ================================================================= */
console.log('\nquanti tirano, modello per modello');

/* dodici modelli, sei di fronte e due file: di solito tira la prima sola
   (p. 143). L'app ne faceva tirare due. */
const dritto = SH.shooterSurvey({
  cells: rows(12, 6, 0, 0), target: foe(2.5, 10), range: 24, front: 6,
});
ok('di due file tira la prima sola (p. 143)', dritto.n === 6);
ok('e ognuna sa in che fila sta',
   dritto.rows[0].rank === 0 && dritto.rows[11].rank === 1);
ok('e il pannello sa perche la seconda no', dritto.out.rank === 6);

/* la collina aggiunge una fila, se l'unita' ci sta tutta sopra */
const dallaCollina = SH.shooterSurvey({
  cells: rows(18, 6, 0, 0), target: foe(2.5, 10), range: 24, front: 6, fromHill: 'all',
});
ok('dalla collina tira anche la seconda fila (p. 143)', dallaCollina.n === 12 && dallaCollina.hill);
ok('e la terza resta fuori', dallaCollina.out.rank === 6);
ok('mezza sulla collina non basta',
   SH.shooterSurvey({ cells: rows(12, 6, 0, 0), target: foe(2.5, 10), range: 24, front: 6,
                      fromHill: 'part' }).n === 6);

/* la salva: meta' di ogni fila dietro la prima, per eccesso (p. 180) */
const salva = SH.shooterSurvey({
  cells: rows(17, 6, 0, 0), target: foe(2.5, 10), range: 24, front: 6, volley: true,
});
ok('con la salva tira meta di ogni fila dietro, per eccesso (p. 180)', salva.n === 6 + 3 + 3);
ok('ma non dopo aver mosso',
   SH.shooterSurvey({ cells: rows(17, 6, 0, 0), target: foe(2.5, 10), range: 24, front: 6,
                      volley: true, moved: true }).n === 6);
/* e la formazione sciolta tira tutta */
ok('in ordine sciolto tirano tutti',
   SH.shooterSurvey({ cells: rows(18, 6, 0, 0), target: foe(2.5, 10),
                      range: 24, front: 6, loose: true }).n === 18);

/* la gittata si misura da OGNI modello, non dal centro dell unita:
   e la meta del punto di questa tappa */
const alLimite = SH.shooterSurvey({
  cells: rows(12, 6, 0, 0), target: foe(2.5, -10.5), range: 10, front: 6, hill: true,
});
ok('la prima fila ci arriva e la seconda no',
   alLimite.n === 6 && alLimite.out.range === 6);

/* e la linea di vista, modello per modello: un monolite davanti a meta
   della fila toglie il tiro solo a quella meta */
const ombra = SH.shooterSurvey({
  cells: rows(6, 6, 0, 0), target: foe(0, 10, 1, 1), range: 24, front: 6,
  pieces: [piece(0, 5, 2, 2, { blocks: true, label: 'Monolite' })],
});
ok('chi ha il monolite davanti non tira', ombra.out.sight > 0);
ok('e chi ce l ha di lato tira', ombra.n > 0);
ok('e la riga dice cosa aveva davanti',
   ombra.rows.some(r => r.blockedBy === 'Monolite'));

/* la lunga gittata e' della maggioranza di chi tira davvero */
ok('oltre meta gittata e lunga gittata',
   SH.shooterSurvey({ cells: rows(6, 6, 0, 0), target: foe(2.5, 14),
                      range: 24, front: 6 }).long === true);
ok('entro meta gittata no',
   SH.shooterSurvey({ cells: rows(6, 6, 0, 0), target: foe(2.5, 8),
                      range: 24, front: 6 }).long === false);

/* Il riparo si conta sui modelli del bersaglio coperti (p. 139): fino
   alla meta' parziale, oltre la meta' pieno. Un bersaglio senza modelli
   conta come un modello solo. */
const fila = { cells: rows(6, 6, 0, 0), range: 24, front: 6 };
/* sei modelli bersaglio in fila, da x 0 a x 5, a dodici pollici */
const sei = { ...foe(2.5, 12, 6, 1), cells: rows(6, 6, 0, 12) };
ok('un muretto davanti a un modello solo non da copertura a tutti',
   SH.shooterSurvey({ ...fila, target: foe(2.5, 10, 6, 2),
                      pieces: [piece(0, 5, 1, 1, { cover: 'hard', label: 'Muretto' })] }).cover === '');
ok('un muretto davanti a tutta la fila si',
   SH.shooterSurvey({ ...fila, target: foe(2.5, 10, 6, 2),
                      pieces: [piece(2.5, 5, 8, 1, { cover: 'hard', label: 'Muretto' })] }).cover === 'hard');
ok('tre modelli su sei nel bosco: riparo parziale (p. 270)',
   SH.shooterSurvey({ ...fila, target: sei,
                      pieces: [piece(1, 12, 3, 2, { kind: 'wood' })] }).cover === 'soft');
ok('quattro su sei: riparo pieno',
   SH.shooterSurvey({ ...fila, target: sei,
                      pieces: [piece(1.5, 12, 4, 2, { kind: 'wood' })] }).cover === 'hard');
const bosco = SH.shooterSurvey({ ...fila, target: sei,
                                 pieces: [piece(2.5, 6, 12, 3, { kind: 'wood', label: 'Bosco' })] });
ok('un bosco in mezzo, con tutti e due fuori, toglie la vista (p. 270)',
   bosco.n === 0 && bosco.out.sight === 6);

/* le unita' bloccano la vista (p. 103), e coprono */
const orchi = (x, y, w, h, hill = '') => ({ name: 'Orc Mob', poly: foe(x, y, w, h).poly, hill });
const dietro = SH.shooterSurvey({ ...fila, target: sei, others: [orchi(2.5, 6, 12, 2)] });
ok('un reggimento in mezzo toglie la vista (p. 103)', dietro.n === 0);
ok('e la riga dice chi', dietro.rows.every(r => r.blockedBy === 'Orc Mob'));
ok('mezzo reggimento davanti al bersaglio e riparo parziale',
   SH.shooterSurvey({ ...fila, target: sei, others: [orchi(1, 10.5, 3, 1)] }).cover === 'soft');

/* la collina (p. 271) */
ok('dalla collina si vede oltre chi non ci sta',
   SH.shooterSurvey({ ...fila, target: sei, others: [orchi(2.5, 6, 12, 2)], fromHill: 'all' }).n === 6);
ok('ma non oltre chi sta sulla collina anche lui',
   SH.shooterSurvey({ ...fila, target: sei, others: [orchi(2.5, 6, 12, 2, 'part')], fromHill: 'all' }).n === 0);
ok('chi sta tutto sulla collina si fa vedere oltre le unita',
   SH.shooterSurvey({ ...fila, target: sei, others: [orchi(2.5, 6, 12, 2)], toHill: 'all' }).n === 6);
ok('una collina in mezzo taglia la vista a chi non ci sta sopra',
   SH.shooterSurvey({ ...fila, target: sei, pieces: [piece(2.5, 6, 12, 3, { kind: 'hill' })] }).n === 0);
ok('ma da sopra la collina si vede',
   SH.shooterSurvey({ ...fila, target: sei, pieces: [piece(2.5, 1, 12, 5, { kind: 'hill' })] }).n === 6);

/* il tetto resta, e si dichiara stima */
ok('senza modelli sul tavolo resta il conto a tetto: una fila',
   SH.shooterCap({ models: 20, frontage: 5 }) === 5);
ok('e non conta i caduti',
   SH.shooterCap({ models: 20, lost: 17, frontage: 5 }) === 3);
ok('dalla collina due file', SH.shooterCap({ models: 20, frontage: 5, hill: true }) === 10);
ok('con la salva meta delle file dietro',
   SH.shooterCap({ models: 20, frontage: 5, volley: true }) === 5 + 3 + 3 + 3);

/* ================================================================= */
console.log('\ni modificatori (p. 138)');

const m = SH.shootMods({ long: true, moved: true, cover: 'hard' });
ok('si sommano', m.total === -4);
ok('e ognuno porta la sua etichetta', m.list.length === 3 && m.list.every(x => x.why));
ok('il tira e tieni vale -1', SH.shootMods({ standAndShoot: true }).total === -1);
ok('la copertura leggera vale -1 e la pesante -2',
   SH.shootMods({ cover: 'soft' }).total === -1 && SH.shootMods({ cover: 'hard' }).total === -2);
/* «Move & Shoot» toglie il -1 del movimento e nient altro */
ok('«Move & Shoot» toglie il -1 del mosso',
   SH.shootMods({ moved: true, weaponFlags: { moveAndShoot: true } }).total === 0);
ok('ma non tocca la lunga gittata',
   SH.shootMods({ moved: true, long: true, weaponFlags: { moveAndShoot: true } }).total === -1);

/* e il pezzo nuovo: i modificatori vengono dalle condizioni vere, non
   dalle caselle spuntate */
const auto = SH.modsFor({
  survey: { long: true, cover: 'soft' },
  shooter: { moved: { kind: 'move', inches: 4 } },
  target: { loose: true },
});
ok('dalle condizioni del tavolo escono quattro modificatori', auto.list.length === 4);
ok('e fanno -4', auto.total === -4);
ok('chi non ha mosso non prende il -1',
   SH.modsFor({ survey: {}, shooter: { moved: { kind: 'reform', inches: 0 } } }).total === 0);

/* ================================================================= */
console.log('\nil punteggio per colpire');

ok('AB 3 colpisce a 4+', SH.hitNeed(3).need === 4);
ok('AB 5 colpisce a 2+', SH.hitNeed(5).need === 2);
ok('senza AB non si tira', SH.hitNeed(0).need === 7);
ok('i modificatori alzano il punteggio', SH.hitNeed(3, -2).need === 6);
/* le due regole che il conto di prima non sapeva dire */
ok('e mai sotto il 2', SH.hitNeed(5, +3).need === 2);
ok('l 1 naturale non colpisce mai', SH.hitNeed(5).natural1 === true);
/* il 7+ del libro (p. 139): un 6, e poi un secondo dado */
ok('AB 3 con -3 serve 7+: un 6 e poi 4+', SH.hitNeed(3, -3).need === 6 && SH.hitNeed(3, -3).then === 4);
ok('con -4 serve 8+: un 6 e poi 5+', SH.hitNeed(3, -4).then === 5);
ok('con -5 serve 9+: un 6 e poi 6', SH.hitNeed(3, -5).need === 6 && SH.hitNeed(3, -5).then === 6);
ok('da 10+ non si colpisce piu', SH.hitNeed(3, -6).need === 7 && !SH.hitNeed(3, -6).then);
ok('un 7+ colpisce una volta su dodici', near(SH.hitChance(6, 0, 4), 1 / 12, 1e-9));
ok('e il pannello lo manda alla pagina giusta', SH.hitNeed(2, -2).page === 139);
/* il ritiro dell AB alta, letto sul libro (p. 138) */
ok('AB 6 colpisce a 2+ e ritira a 6+', SH.hitNeed(6).need === 2 && SH.hitNeed(6).again === 6);
ok('AB 8 ritira a 4+', SH.hitNeed(8).again === 4);
ok('AB 10 ritira a 2+', SH.hitNeed(10).again === 2);
ok('i modificatori pesano solo sul primo tiro',
   SH.hitNeed(7, -2).need === 4 && SH.hitNeed(7, -2).again === 5);
ok('e non e piu da verificare', !SH.hitNeed(8).daVerificare);
ok('sotto non c e nessun ritiro', SH.hitNeed(4).again === 0);
/* il ritiro vale, ed e un numero che si controlla a mano */
ok('il ritiro alza la probabilita del colpo',
   near(SH.hitChance(2, 5), 5 / 6 + (1 / 6) * (2 / 6), 1e-9));
ok('senza ritiro e la probabilita di sempre', near(SH.hitChance(4, 0), 0.5, 1e-9));

/* ================================================================= */
console.log('\nle sagome (p. 95)');

const piccola = SH.placeTemplate('small', [0, 0]);
ok('la sagoma piccola e tre pollici', near(piccola.r * 2 / MM, 3, 1e-9));
ok('la grande e cinque', near(SH.placeTemplate('large', [0, 0]).r * 2 / MM, 5, 1e-9));
const goccia = SH.placeTemplate('teardrop', [0, 0], 0);
ok('la goccia e un poligono', goccia.kind === 'teardrop' && goccia.poly.length > 8);
ok('lunga otto pollici', near((goccia.head.c[0] + goccia.head.r) / MM, 8, 0.01));
ok('e dichiara quali sue misure sono da verificare',
   Array.isArray(goccia.daVerificare) && goccia.daVerificare.includes('head'));

/* chi sta sotto: del tutto, in parte, o fuori */
const sotto = SH.modelsUnder([
  { cell: 0, wx: 0,        wy: 0, w: 20, h: 20 },     // in mezzo
  { cell: 1, wx: 1.4 * MM, wy: 0, w: 20, h: 20 },     // sul bordo
  { cell: 2, wx: 4 * MM,   wy: 0, w: 20, h: 20 },     // fuori
], piccola);
ok('quello in mezzo e sotto del tutto', sotto.full.includes(0));
ok('quello sul bordo e sotto in parte', sotto.partial.includes(1));
ok('quello lontano e fuori', sotto.out.includes(2));

/* e la regola: sotto del tutto colpito, sotto in parte a 4+ */
const conteggio = SH.templateHits(sotto);
ok('senza dadi si sa quanti ne servono',
   conteggio.hits === 1 && conteggio.asks === 1 && conteggio.need === 4);
ok('un 4 tiene il parziale', SH.templateHits(sotto, [4]).hits === 2);
ok('un 3 lo perde', SH.templateHits(sotto, [3]).hits === 1);
ok('e l 1 non salva mai nessuno dalla parte sbagliata',
   SH.templateHits(sotto, [1]).hits === 1);

/* ================================================================= */
console.log('\nla deviazione applicata');

const fermo = SH.scatterTo([0, 0], { hit: true, deg: 90, inches: 6 });
ok('Colpito! lascia la sagoma dov e', fermo.moved === 0 && fermo.to[0] === 0);
const via = SH.scatterTo([0, 0], { deg: 0, inches: 4 });
ok('la freccia la sposta di quei pollici', near(via.to[0] / MM, 4, 1e-9));
ok('e nella direzione giusta', near(via.to[1], 0, 1e-9));
const giu = SH.scatterTo([0, 0], { deg: 90, inches: 3 });
ok('novanta gradi e in giu', near(giu.to[1] / MM, 3, 1e-9));

/* ================================================================= */
console.log('\nle macchine da guerra (pp. 222-229)');

const bomba = SH.bombard({ aim: [0, 0], template: 'large', deg: 0, inches: 6 });
ok('il bombardamento sposta la sagoma', near(bomba.to[0] / MM, 6, 1e-9));
ok('e la sagoma nuova sta dove e finita', near(bomba.shape.c[0] / MM, 6, 1e-9));
ok('il Colpito! la lascia sul punto scelto',
   SH.bombard({ aim: [0, 0], hit: true, deg: 0, inches: 6 }).moved === 0);
ok('il Mancato Colpo ferma tutto',
   SH.bombard({ aim: [0, 0], misfire: true }).misfire === true);

const palla = SH.cannonShot({ guess: 20, first: 4, bounce: 6 });
ok('la palla cade oltre la distanza indovinata', palla.land === 24);
ok('e rimbalza ancora piu in la', palla.end === 30);
ok('senza rimbalzo si pianta dov e caduta',
   SH.cannonShot({ guess: 20, first: 4, bounceMisfire: true }).end === 24);
ok('e il Mancato Colpo del primo dado ferma il tiro',
   SH.cannonShot({ guess: 20, firstMisfire: true }).misfire === true);

const linea = SH.cannonLine([0, 0], 0, palla);
ok('la linea arriva fin dove si e fermata', near(linea.to[0] / MM, 30, 1e-6));
ok('e segna anche dove ha toccato terra', near(linea.land[0] / MM, 24, 1e-6));

/* le due tabelle del Mancato Colpo, trascritte da p. 347 */
const guasto = SH.misfireRead('cannon', 3);
ok('un 3 sulla polvere nera e un guasto', guasto.known && /Guasto/.test(guasto.text));
ok('e dice la faccia e la pagina', guasto.face === 3 && /347/.test(guasto.text));
ok('un 1 distrugge la macchina', /distrutta/i.test(SH.misfireRead('stone', 1).text));
ok('un 5 o un 6 fa solo saltare il tiro',
   /non tira in questo turno/.test(SH.misfireRead('stone', 6).what) &&
   !/Ferita/.test(SH.misfireRead('cannon', 5).what));
ok('le due tabelle hanno sei facce piene',
   ['cannon', 'stone'].every(k => SH.MISFIRE[k].length === 6 && SH.MISFIRE[k].every(Boolean)));

/* ================================================================= */
console.log('\nil test di Panico del tiro (p. 141)');

ok('un quarto tondo non basta',
   SH.panicFromShooting({ start: 20, lost: 5 }).must === false);
ok('oltre il quarto si tira',
   SH.panicFromShooting({ start: 20, lost: 6 }).must === true);
/* e si conta la Forza d Unita, non le teste: un Rat Ogre ne vale tre */
const conForza = SH.panicFromShooting({ start: 6, lost: 1, us: 18, usLost: 6 });
ok('con la Forza d Unita si conta quella', conForza.must === true && conForza.of === 18);
ok('e senza si dice che e un ripiego',
   SH.panicFromShooting({ start: 20, lost: 6 }).approx === true);
/* chi e' stato spazzato via non ha nessuno a cui fare il test */
ok('un unita distrutta non tira il Panico',
   SH.panicFromShooting({ start: 1, lost: 1, destroyed: true }).must === false);

/* ================================================================= */
console.log('\nle regole d arma del tiro');

const lette = SH.readShooting(['Move & Shoot', 'Quick Shot', 'Volley Fire', 'Grugnito Feroce']);
ok('«Move & Shoot» e letta', lette.flags.moveAndShoot === true);
ok('la salva alza il tetto delle file', lette.flags.volleyFire === true);
ok('quello che non si conosce resta in elenco',
   lette.unknown.length === 1 && lette.unknown[0].name === 'Grugnito Feroce');
/* la salva non e' piu' incerta: il libro la scrive a p. 180 */
ok('e l incerta lo dichiara',
   lette.applied.filter(a => a.daVerificare).length === 1);
ok('«Multiple Shots (2)» legge il numero',
   SH.readShooting(['Multiple Shots (2)']).flags.multipleShots === 2);
ok('e diventa due tiri per modello',
   SH.shotsPerModel(SH.readShooting(['Multiple Shots (2)']).flags).n === 2);
ok('«Quick Shot» non viene contato a naso',
   SH.shotsPerModel(SH.readShooting(['Quick Shot']).flags).n === 1);
ok('e lo dice', SH.shotsPerModel(SH.readShooting(['Quick Shot']).flags).nota !== '');

/* ================================================================= */
console.log('\nil vecchio conto continua a tornare');

const arcieri = { name:'Arcieri', stats:{ M:'5',WS:'4',BS:'4',S:'3',T:'3',W:'1',I:'5',A:'1',Ld:'8' },
                  models:16, frontage:8, weapons:[], rules:[], lost:0 };
const bersaglio = { name:'Saurus', stats:{ M:'4',WS:'3',BS:'0',S:'4',T:'4',W:'1',I:'2',A:'1',Ld:'8' },
                    models:20, frontage:5, weapons:[], rules:[], lost:0, armour:4 };
const arco = { name:'Arco', range:'24"', S:'3', ap:'0', rules:'' };
ok('tira la prima fila (p. 143)', C.shooters(arcieri) === 8);
const vicino = C.shootForecast(arcieri, bersaglio, { weapon: arco, mods: 0 });
const lontano = C.shootForecast(arcieri, bersaglio, { weapon: arco, mods: -1 });
ok('il punteggio resta quello di prima', vicino.hitNeed === 3);
ok('e un modificatore lo alza', lontano.hitNeed === 4);
ok('e le ferite scendono di conseguenza', lontano.wounds < vicino.wounds);
/* e il ritiro dell AB alta entra nel conto invece di sparire */
const cecchino = { ...arcieri, stats: { ...arcieri.stats, BS:'8' } };
const conRitiro = C.shootForecast(cecchino, bersaglio, { weapon: arco, mods: -3 });
ok('l AB alta porta il suo secondo punteggio (AB 8 ritira a 4+, p. 138)', conRitiro.hitAgain === 4);
/* e il 7+ entra nel conto invece di diventare un 6+ */
const lontanissimo = C.shootForecast(arcieri, bersaglio, { weapon: arco, mods: -5 });
ok('AB 4 con -5 serve 8+: un 6 e poi 5+', lontanissimo.hitNeed === 6 && lontanissimo.hitThen === 5);
ok('e ferisce meno di un 6+ semplice',
   lontanissimo.wounds < C.shootForecast(arcieri, bersaglio, { weapon: arco, mods: -3 }).wounds);
const raffica = C.shootRoll(arcieri, bersaglio, { weapon: arco, mods: -5 });
ok('la raffica del 7+ ritira solo i 6',
   (raffica.follow ? raffica.follow.of : 0) === raffica.hit.dice.filter(v => v === 6).length);
ok('e colpisce solo chi passa anche il secondo dado',
   raffica.hit.hits === (raffica.follow ? raffica.follow.hits : 0));
ok('e ferisce piu di chi non ce l ha',
   conRitiro.wounds > C.shootForecast({ ...arcieri, stats: { ...arcieri.stats, BS:'5' } },
                                      bersaglio, { weapon: arco, mods: -3 }).wounds);

/* ================================================================= */
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
