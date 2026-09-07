/* I conti del combattimento e la geometria che li serve, senza pagina:
 * niente jsdom, niente IndexedDB, solo moduli puri.
 * Si lancia con:  node test/battle.mjs
 */
import { hitMelee, hitShoot, woundOn, saveOn, chance, pool, rankBonus,
         leadershipTest, chargeRoll, stat, weaponStrength, weaponAP,
         IMPOSSIBLE } from '../src/rules.js';
import * as C from '../src/combat.js';
import { reachFan, sightFan, coverOn, stepCost, movementBands } from '../src/tactics.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/* ================================================================= */
console.log('punteggi da fare');
ok('pari abilita si va a 4', hitMelee(3, 3) === 4);
ok('piu abile si va a 3', hitMelee(4, 3) === 3);
ok('contro il doppio si va a 5', hitMelee(2, 4) === 5);
ok('senza abilita non si colpisce', hitMelee(0, 3) === IMPOSSIBLE);

ok('Forza pari a Resistenza ferisce a 4', woundOn(4, 4) === 4);
ok('un punto di Forza in piu ferisce a 3', woundOn(5, 4) === 3);
ok('due punti in piu feriscono a 2', woundOn(6, 4) === 2);
ok('e tre non fanno meglio di 2', woundOn(7, 4) === 2);
ok('due punti di Resistenza in piu portano a 6', woundOn(3, 5) === 6);
ok('tre restano a 6', woundOn(3, 6) === 6);
ok('quattro non passano piu', woundOn(3, 7) === IMPOSSIBLE);

ok('la perforazione peggiora la salvezza', saveOn(4, 1) === 5);
ok('oltre il 6 non salva piu niente', saveOn(6, 1) === IMPOSSIBLE);
ok('senza armatura non si salva', saveOn(0, 0) === IMPOSSIBLE);
ok('la salvezza non scende sotto il 2', saveOn(2, 0) === 2);

ok('abilita balistica 3 tira a 4', hitShoot(3) === 4);
ok('la lunga gittata la peggiora', hitShoot(3, -1) === 5);
ok('i modificatori non portano oltre il 6', hitShoot(2, -4) === 6);
ok('e non portano sotto il 2', hitShoot(6, 2) === 2);

console.log('\nprobabilita');
ok('un 4+ passa una volta su due', chance(4) === 0.5);
ok('quello che non si puo fare non passa mai', chance(IMPOSSIBLE) === 0);

console.log('\ndadi');
const big = pool(4000, 4);
ok('4000 dadi a 4+ danno circa meta successi', near(big.hits / 4000, 0.5, 0.03));
ok('e sono 4000 facce, tutte fra 1 e 6',
   big.dice.length === 4000 && big.dice.every(v => v >= 1 && v <= 6));
ok('un punteggio impossibile non passa mai', pool(500, IMPOSSIBLE).hits === 0);

let normal = 0, swift = 0;
for (let i = 0; i < 4000; i++){ normal += chargeRoll(false).total; swift += chargeRoll(true).total; }
ok('la carica normale fa in media 7', near(normal / 4000, 7, 0.2));
ok('il passo lungo fa in media 8,5', near(swift / 4000, 8.46, 0.2));
ok('e non supera comunque i 12', chargeRoll(true).total <= 12);

console.log('\nranghi e nervi');
ok('venti in file da cinque danno +3', rankBonus(20, 5) === 3);
ok('il bonus e comunque limitato a 3', rankBonus(60, 5) === 3);
ok('file da due non contano', rankBonus(20, 2) === 0);
ok('una fila sola non da bonus', rankBonus(5, 5) === 0);

let insane = 0, taken = 0;
for (let i = 0; i < 3000; i++){
  const t = leadershipTest(2, 5);          // Comando ridotto al minimo
  if (t.passed) taken++;
  if (t.insane) insane++;
}
ok('con il Comando a 2 si passa solo col doppio uno', taken === insane);
ok('il doppio uno esce circa una volta su 36', near(insane / 3000, 1 / 36, 0.02));

console.log('\nlettura dei profili');
ok('"4" e quattro', stat('4') === 4);
ok('"-" non e niente', stat('-') === 0);
ok('la Forza "As user" e quella di chi impugna', weaponStrength({ S: 'As user' }, 4) === 4);
ok('la Forza "+1" si somma', weaponStrength({ S: '+1' }, 4) === 5);
ok('la Forza "5" e assoluta', weaponStrength({ S: '5' }, 3) === 5);
ok('la perforazione si legge col segno', weaponAP({ ap: '-2' }) === 2);

/* ================================================================= */
console.log('\ndue schiere');
const unit = (name, st, models, frontage, extra = {}) => ({
  name, stats: st, models, frontage, us: models, weapons: [], rules: [], lost: 0, ...extra });

const saurus = unit('Saurus', { M:'4',WS:'3',BS:'0',S:'4',T:'4',W:'1',I:'1',A:'2',Ld:'8' }, 12, 6, { armour: 4 });
const orcs   = unit('Orc Mob', { M:'4',WS:'3',BS:'3',S:'3',T:'4',W:'1',I:'2',A:'1',Ld:'7' }, 20, 5, { armour: 5 });

const a = C.combatant(saurus), b = C.combatant(orcs);
ok('il profilo diventa una schiera', a.ws === 3 && a.t === 4 && a.a === 2 && a.models === 12);
ok('una schiera ripassata resta se stessa', C.combatant(a).models === 12);

const ct = C.contact(a, b);
ok('a contatto va la fila piu stretta delle due', ct.front === 5);
ok('una fila dietro appoggia con un colpo a testa', ct.attacks === 5 * 2 + 5);

console.log('\nun assalto');
const r = C.meleeRound(a, b);
ok('mena per primo chi ha Iniziativa piu alta', r.steps[0].side === 'B');
ok('i dadi tirati sono quanti gli attacchi',
   r.steps.every(s => s.hit.dice.length === 0 || s.hit.dice.length === s.attacks));
ok('non passano piu ferite dei colpi andati a segno',
   r.steps.every(s => s.wounds <= s.wound.hits && s.wound.hits <= s.hit.hits));
ok('le perdite non superano i modelli in campo',
   r.killsA >= 0 && r.killsA <= 12 && r.killsB >= 0 && r.killsB <= 20);
ok('il conto di fine assalto somma le sue voci',
   r.cr.A.total === r.cr.A.wounds + r.cr.A.rank + r.cr.A.std + r.cr.A.out + r.cr.A.flank);
/* i ranghi si contano a fine assalto, sui modelli rimasti: venti in
   file da cinque partono a +3 e scendono man mano che si accorciano */
ok('gli Orchi contano i ranghi e sono in piu',
   r.cr.B.rank >= 2 && r.cr.B.rank <= 3 && r.cr.B.out === 1);
ok('e i Saurus, in file da sei e meno numerosi, no',
   r.cr.A.rank <= 1 && r.cr.A.out === 0);
ok('chi perde tira per i nervi, chi pareggia no',
   r.cr.loser ? (r.test && r.test.side === r.cr.loser) : r.test === null);

console.log('\ncolpi corretti a mano');
const few = C.combatant(saurus, { forcedAttacks: 3 });
ok('il numero scritto a mano vince sul conto',
   C.strike(few, b).attacks === 3 && C.meleeForecast(few, b).attacks === 3);

console.log('\nurto della carica');
const boars = C.combatant(unit('Boar Boyz', { M:'7',WS:'3',BS:'3',S:'3',T:'4',W:'1',I:'2',A:'1',Ld:'7' },
                               6, 3, { rules: ['Impact Hits'] }), { charged: true });
const charge = C.meleeRound(boars, b);
ok('chi carica urta prima di menare', charge.steps[0].label === 'urto della carica');
ok('i colpi d urto non tirano per colpire', charge.steps[0].hit.dice.length === 0);

console.log('\ncinquecento assalti');
const o = C.odds(a, b, 500);
ok('vittorie, sconfitte e pareggi fanno cinquecento', o.winA + o.winB + o.draw === 500);
ok('gli Orchi vincono piu spesso: ranghi e numero', o.winB > o.winA);
const f = C.meleeForecast(a, b);
ok('la media simulata sta vicino alla previsione', near(o.killsB, f.wounds, 0.6));

console.log('\ntiro');
const archers = unit('Goblin Archers', { M:'4',WS:'2',BS:'3',S:'3',T:'3',W:'1',I:'2',A:'1',Ld:'6' }, 16, 8);
ok('tirano le prime due file', C.shooters(archers) === 16);
ok('un reggimento largo poco ne tira meno',
   C.shooters({ ...archers, frontage: 4 }) === 8);
ok('in formazione sciolta tirano tutti',
   C.shooters({ ...archers, loose: true, frontage: 4 }) === 16);

const bow = { name: 'Arco corto', range: '18"', S: '3', ap: '' };
const near18 = C.shootForecast(archers, saurus, { weapon: bow, mods: 0 });
const far18  = C.shootForecast(archers, saurus, { weapon: bow, mods: -1 });
ok('la lunga gittata alza il punteggio da fare', far18.hitNeed === near18.hitNeed + 1);
ok('e quindi le perdite calano', far18.wounds < near18.wounds);
ok('la Forza dell arco batte la Resistenza giusta', near18.woundNeed === woundOn(3, 4));
const shot = C.shootRoll(archers, saurus, { weapon: bow, mods: 0 });
ok('la raffica tira un dado per tiro', shot.hit.dice.length === 16);
ok('e non ferisce piu di quanto colpisca', shot.wound.hits <= shot.hit.hits);

const mods = C.shootMods({ long: true, cover: 'hard', looseTarget: true });
ok('i modificatori si sommano col loro segno', mods.total === -4);
ok('e ognuno porta la sua spiegazione', mods.list.length === 3);

/* ================================================================= */
console.log('\ndove posso arrivare');
const box = { x: 500, y: 500, w: 100, h: 50, rot: 0 };      // fronte verso -y
const piece = (x, y, w, h, pass, cover = '', blocks = false) => {
  const b = { x, y, w, h, rot: 0 };
  return { box: b, poly: [[x-w/2,y-h/2],[x+w/2,y-h/2],[x+w/2,y+h/2],[x-w/2,y+h/2]],
           circle: false, pass, cover, blocks, label: pass,
           contains: p => Math.abs(p[0]-x) <= w/2 && Math.abs(p[1]-y) <= h/2 };
};
const table = { x: 0, y: 0, w: 1200, h: 800 };
/* Il ventaglio e' [centro, raggio piu' a destra, …, raggio piu' a
   sinistra]: quello dritto davanti e' esattamente quello di mezzo.
   Si misura li', non sul punto piu' avanzato di tutti, perche' i raggi
   obliqui possono girare attorno a un ostacolo stretto. */
const RAYS = 36;
const ahead = fan => 500 - fan[1 + RAYS / 2][1];

const open = reachFan(box, 200, [], { bounds: table, rays: RAYS });
ok('in aperto si arriva a mezza base piu il budget', near(ahead(open), 25 + 200, 1));

const wood = reachFan(box, 200, [piece(500, 380, 300, 200, 'difficult')], { bounds: table, rays: RAYS });
ok('nel bosco si va meno lontano', ahead(wood) < ahead(open) - 40);

const stone = piece(500, 300, 400, 40, 'blocked');
const wall = reachFan(box, 400, [stone], { bounds: table, rays: RAYS });
ok('contro l impassabile ci si ferma davanti', near(ahead(wall), 175, 6));
ok('ma di lato lo si aggira',
   Math.min(...wall.map(p => p[1])) < 500 - ahead(wall) - 50);

const flying = reachFan(box, 400, [stone], { bounds: table, fly: true, rays: RAYS });
ok('chi vola ci passa sopra', near(ahead(flying), 25 + 400, 1));

const edge = reachFan({ ...box, y: 120 }, 400, [], { bounds: table });
ok('il bordo del tavolo ferma tutti', Math.min(...edge.map(p => p[1])) >= -0.01);

ok('in terreno difficile un passo costa il doppio',
   stepCost([500, 380], [piece(500, 380, 300, 200, 'difficult')]) === 2);
ok('e in aperto costa uno', stepCost([500, 700], [piece(500, 380, 300, 200, 'difficult')]) === 1);

console.log('\nfin dove arriva lo sguardo');
const blocker = piece(500, 300, 200, 100, 'blocked', 'hard', true);
const clear = sightFan(box, 400, []);
const shaded = sightFan(box, 400, [blocker]);
const reach = fan => fan.slice(1).map(p => Math.hypot(p[0] - fan[0][0], p[1] - fan[0][1]));
ok('senza ostacoli tutti i raggi arrivano in fondo',
   reach(clear).every(d => near(d, 400, 0.5)));
ok('dietro il bosco qualche raggio si ferma prima',
   reach(shaded).some(d => d < 300));
ok('ma di lato la vista resta piena',
   Math.max(...reach(shaded)) > 399);

console.log('\nripari');
const soft = piece(500, 300, 200, 100, 'difficult', 'soft', true);
const hard = piece(500, 300, 200, 100, 'blocked', 'hard', true);
ok('il bosco in mezzo ripara di poco', coverOn([500, 475], [500, 200], [soft]) === 'soft');
ok('le rovine riparano di piu', coverOn([500, 475], [500, 200], [hard]) === 'hard');
ok('e il riparo piu forte vince', coverOn([500, 475], [500, 200], [soft, hard]) === 'hard');
ok('senza niente in mezzo non si ripara', coverOn([500, 475], [900, 475], [soft]) === '');
ok('chi ci sta dentro non si ripara da se',
   coverOn([500, 300], [500, 200], [soft]) === '');

console.log('\nquanto e lungo il passo');
const bands = movementBands({ stats: { M: '4' }, rules: [] });
ok('movimento, marcia, carica e carica massima',
   bands.move === 4 && bands.march === 8 && bands.charge === 11 && bands.chargeMax === 16);
const fast = movementBands({ stats: { M: '7' }, rules: ['Swiftstride'] });
ok('il passo lungo vale mezzo pollice di carica in piu', fast.charge === 15.5 && fast.swift === true);
ok('senza M sul profilo non si inventa niente',
   movementBands({ stats: { M: '-' }, rules: [] }) === null);

console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
