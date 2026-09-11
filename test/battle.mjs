/* I conti del combattimento e la geometria che li serve, senza pagina:
 * niente jsdom, niente IndexedDB, solo moduli puri.
 * Si lancia con:  node test/battle.mjs
 */
import { hitMelee, hitShoot, woundOn, saveOn, chance, pool, rankBonus,
         leadershipTest, chargeRoll, stat, weaponStrength, weaponAP,
         IMPOSSIBLE, AUTOHIT } from '../src/rules.js';
import * as C from '../src/combat.js';
import * as D from '../src/dice.js';
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
ok('piu del doppio si va a 2', hitMelee(3, 1) === 2);
ok('il doppio esatto resta a 3', hitMelee(4, 2) === 3);
/* le due celle che la vecchia formula sbagliava: contro chi e' molto
   piu' abile la tabella nuova non punisce quanto la regola classica */
ok('AC 2 contro AC 4 colpisce a 4', hitMelee(2, 4) === 4);
ok('AC 3 contro AC 6 colpisce a 4', hitMelee(3, 6) === 4);
ok('meno della meta va a 5', hitMelee(2, 5) === 5);
ok('sopra il dieci si legge l ultima riga', hitMelee(12, 4) === hitMelee(10, 4));
ok('senza abilita non si colpisce', hitMelee(0, 3) === IMPOSSIBLE);
ok('chi non sa difendersi e colpito senza tirare', hitMelee(4, 0) === AUTOHIT);
ok('e quei colpi passano tutti senza dadi',
   pool(10, hitMelee(4, 0)).hits === 10 && pool(10, hitMelee(4, 0)).dice.length === 0);

ok('Forza pari a Resistenza ferisce a 4', woundOn(4, 4) === 4);
ok('un punto di Forza in piu ferisce a 3', woundOn(5, 4) === 3);
ok('due punti in piu feriscono a 2', woundOn(6, 4) === 2);
ok('e tre non fanno meglio di 2', woundOn(7, 4) === 2);
ok('un punto di Resistenza in piu porta a 5', woundOn(4, 5) === 5);
ok('due punti di Resistenza in piu portano a 6', woundOn(3, 5) === 6);
ok('e si resta a 6 fino a cinque punti di scarto', woundOn(3, 8) === 6);
ok('sei punti non passano piu', woundOn(3, 9) === IMPOSSIBLE);

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
ok('la carica normale fa in media 4,5 e non 7', near(normal / 4000, 161 / 36, 0.2));
ok('il passo lungo aggiunge un D6, e fa circa 8', near(swift / 4000, 161 / 36 + 3.5, 0.2));
ok('un tiro senza passo lungo non passa mai il sei',
   Array.from({ length: 200 }, () => chargeRoll(false).total).every(v => v <= 6));
ok('e nel terreno si tiene il peggiore',
   Array.from({ length: 200 }, () => chargeRoll(false, true))
     .every(r => r.total === Math.min(r.dice[0], r.dice[1])));

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
   r.cr.A.total === r.cr.A.parts.reduce((s, p) => s + p.v, 0));
/* i ranghi si contano a fine assalto, sui modelli rimasti: venti in
   file da cinque partono a +3 e scendono man mano che si accorciano.
   Il numero esatto dipende da come sono andati i dadi, quindi si
   controlla che sia quello giusto PER QUEI morti: scritto come
   intervallo fisso, un assalto fortunato faceva fallire la prova una
   volta ogni venti. */
const rimasti = 20 - r.killsB;
ok('gli Orchi contano i ranghi',
   r.cr.B.rank === Math.max(0, Math.min(3, Math.floor(rimasti / 5) - 1)) && r.cr.B.rank >= 1);
ok('e i Saurus, in file da sei, quasi no', r.cr.A.rank <= 1);
/* La superiorita' numerica non e' piu' una voce del risultato: era il
   bonus dell'edizione di prima, e nell'elenco del manuale non c'e'.
   Vedi il §3 di melee.js — si riaccende da una costante sola. */
ok('essere in piu non da piu un punto', r.cr.B.out === 0 && r.cr.A.out === 0);
ok('chi perde tira per i nervi, chi pareggia no',
   r.cr.loser ? (r.test && r.test.side === r.cr.loser) : r.test === null);

console.log('\ncolpi corretti a mano');
const few = C.combatant(saurus, { forcedAttacks: 3 });
ok('il numero scritto a mano vince sul conto',
   C.strike(few, b).attacks === 3 && C.meleeForecast(few, b).attacks === 3);

console.log('\nurto della carica');
/* L'urto vuole tre pollici di corsa: lo dice il testo della regola,
   che le liste salvate portano per esteso. Chi arriva a contatto con
   mezzo pollice non urta niente. */
const boarUnit = unit('Boar Boyz', { M:'7',WS:'3',BS:'3',S:'3',T:'4',W:'1',I:'2',A:'1',Ld:'7' },
                      6, 3, { rules: ['Impact Hits'] });
const boars = C.combatant(boarUnit, { charged: true, chargeInches: 5 });
const charge = C.meleeRound(boars, b);
ok('chi carica urta prima di menare', charge.steps[0].label === 'urto della carica');
ok('i colpi d urto non tirano per colpire', charge.steps[0].hit.dice.length === 0);
const nudge = C.meleeRound(C.combatant(boarUnit, { charged: true, chargeInches: 2 }), b);
ok('sotto i tre pollici non c e urto',
   nudge.steps.every(s => s.label !== 'urto della carica'));
/* i tre pollici arrivano dal tavolo: la carica della Tappa 2 li scrive
   sull'unita' insieme alla faccia da cui e' entrata */
const dalTavolo = C.combatant({ ...boarUnit, charged: { target:'Orc Mob', inches: 6.2, arc:'fianco' } });
ok('la carica del tavolo entra nella schiera da sola',
   dalTavolo.charged === true && dalTavolo.chargeInches === 6.2 && dalTavolo.flank === 'flank');

console.log('\ncinquecento assalti');
const o = C.odds(a, b, 500);
ok('vittorie, sconfitte e pareggi fanno cinquecento', o.winA + o.winB + o.draw === 500);
/* I tre esiti del test di rotta si contano separati, e insieme fanno
   le volte in cui quella parte ha perso l'assalto senza essere
   annientata: e' la prova che nessun esito si perde per strada. */
ok('i tre esiti coprono tutte le sconfitte',
   o.giveA + o.fallA + o.routA === o.winB - o.wipeA &&
   o.giveB + o.fallB + o.routB === o.winA - o.wipeB);
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
   bands.move === 4 && bands.march === 8 && bands.charge === 8.5 && bands.chargeMax === 10);
const fast = movementBands({ stats: { M: '7' }, rules: ['Swiftstride'] });
ok('il passo lungo vale un dado in piu di carica', fast.charge === 15 && fast.chargeMax === 16 && fast.swift === true);
ok('senza M sul profilo non si inventa niente',
   movementBands({ stats: { M: '-' }, rules: [] }) === null);

/* ================================================================= */
console.log('\nregole speciali lette dalla lista');
ok('la Forza "S+1" e quella di chi impugna piu uno', weaponStrength({ S: 'S+1' }, 4) === 5);
ok('la Forza "S" e quella di chi impugna', weaponStrength({ S: 'S' }, 4) === 4);
ok('la Forza "S+2" non diventa 2', weaponStrength({ S: 'S+2' }, 5) === 7);

const armed = unit('Guardia', { M:'4',WS:'4',BS:'0',S:'4',T:'4',W:'1',I:'4',A:'1',Ld:'8' }, 10, 5, {
  armour: 4,
  rules: ['Furious Charge', 'Stubborn'],
  weapons: [{ name:'Great Weapon', S:'S+2', ap:'-2', rules:'Armour Bane (1), Strike Last' }],
});
const g = C.combatant(armed);
ok('l arma pesante porta la Forza a 6', g.s === 6);
ok('la perforazione dell arma arriva nella schiera', g.ap === 2);
ok('colpisce per ultimo lo dice la regola dell arma', g.flags.strikeLast === true);
ok('perfora-armature legge il numero fra parentesi', g.flags.armourBane === 1);
ok('la carica furiosa e stata letta', g.flags.furiousCharge === true);
ok('le regole applicate finiscono in elenco', g.rulesRead.applied.length === 4);
ok('e nessuna resta sconosciuta', g.rulesRead.unknown.length === 0);

const plain = C.combatant(unit('Fanti', { M:'4',WS:'3',BS:'0',S:'3',T:'3',W:'1',I:'3',A:'1',Ld:'7' }, 10, 5));
ok('senza carica gli attacchi sono quelli del profilo', C.contact(g, plain).attacks === 5 * 1 + 5);
g.charged = true; g.chargeInches = 4;
ok('in carica la carica furiosa ne aggiunge uno per modello', C.contact(g, plain).attacks === 5 * 2 + 5);
g.chargeInches = 1;
ok('ma vuole i suoi tre pollici come l urto', C.contact(g, plain).attacks === 5 * 1 + 5);
g.charged = false; g.chargeInches = 0;

/* l'arma che colpisce per ultima scavalca l'Iniziativa, che qui e' la piu alta */
const late = C.meleeRound(g, plain);
ok('chi colpisce per ultimo mena dopo anche con Iniziativa migliore', late.steps[0].side === 'B');

/* il vincolo fra parentesi: il veleno vale solo sui giavellotti, e in
   mischia questo skink impugna l'arma a una mano */
const skink = C.combatant(unit('Skink', { M:'6',WS:'2',BS:'3',S:'3',T:'2',W:'1',I:'4',A:'1',Ld:'5' }, 10, 5, {
  rules: ['Poisoned Attacks (javelins only)'],
  weapons: [{ name:'Hand Weapon', S:'S', ap:'-' }],
}));
ok('il veleno dei giavellotti non avvelena l arma a una mano', skink.flags.poisoned === false);
ok('e viene detto, non taciuto', skink.rulesRead.elsewhere.some(x => /Poisoned/.test(x.name)));

/* rigenerazione: l'ultima rete, dopo la salvezza speciale */
const troll = C.combatant(unit('Troll', { M:'6',WS:'3',BS:'1',S:'5',T:'4',W:'3',I:'1',A:'3',Ld:'4' }, 3, 3, { regen: 4 }));
const blow = C.strike(g, troll, { attacks: 40 });
ok('la rigenerazione tira sulle ferite passate dalla speciale',
   blow.regen.of === blow.wound.hits - blow.save.hits);
ok('e le ferite finali tolgono quelle rimarginate',
   blow.wounds === blow.wound.hits - blow.save.hits - blow.regen.hits);

/* Lo Stubborn non e' piu' «tira al Comando pieno»: il testo della
   regola, che sta dentro le liste salvate, dice un'altra cosa — la
   prima volta che dovrebbe fare il test puo' scegliere di non farlo e
   ripiega in ordine. Perche' i test siano quelli di chi PERDE, il
   testardo qui e' la parte debole: dodici scarsi contro dieci guardie
   con l'arma pesante. */
const weak = unit('Leva testarda', { M:'4',WS:'2',BS:'0',S:'3',T:'3',W:'1',I:'2',A:'1',Ld:'8' }, 12, 4,
                  { armour: 4, rules: ['Stubborn'] });
const stub = [], plainTests = [];
for (let i = 0; i < 200; i++){
  const rr = C.meleeRound(C.combatant(weak), C.combatant(armed));
  if (rr.test && rr.test.side === 'A') stub.push(rr.test);
  const r2 = C.meleeRound(C.combatant({ ...weak, rules: [] }), C.combatant(armed));
  if (r2.test && r2.test.side === 'A') plainTests.push(r2.test);
}
ok('il testardo, quando la rotta e probabile, salta il test e ripiega',
   stub.some(t => t.stubborn && t.outcome === 'fallBack' && !t.dice.length));
ok('e quando non lo e tira come tutti gli altri',
   stub.some(t => !t.stubborn && t.dice.length === 2));
ok('senza Stubborn si tira sempre, con lo scarto addosso',
   plainTests.length > 0 && plainTests.every(t => t.dice.length === 2) &&
   plainTests.some(t => t.diff > 0 && t.modified === t.natural + t.diff));

/* ================================================================= */
console.log('\ni dadi veri');

/* Le facce dei quattro dadi, una per una: con la sorgente guidata si
   controlla la traduzione (faccia grezza -> valore) senza sperare
   nella fortuna. */
const seq = list => { let i = 0; return () => list[i++ % list.length]; };

D.setSource(seq([0, 1, 2, 3, 4, 5]));   // facce grezze 1..6 in fila
const six = D.rollDice({ kind:'d6', n:6 });
ok('il D6 mostra le sei facce', six.dice.map(d => d.value).join('') === '123456');
ok('e le somma', six.total === 21);

D.setSource(seq([0, 1, 2, 3, 4, 5]));
const three = D.rollDice({ kind:'d3', n:6 });
ok('il D3 e un cubo segnato 1,2,3,1,2,3', three.dice.map(d => d.value).join('') === '123123');

D.setSource(seq([0, 1, 2, 3, 4, 5]));
const arty = D.rollDice({ kind:'artillery', n:6 });
ok('il dado di artiglieria porta 2,4,6,8,10 e il Mancato Colpo',
   arty.dice.map(d => d.misfire ? 'X' : d.value).join(',') === '2,4,6,8,10,X');
ok('e il Mancato Colpo viene contato', arty.misfires === 1);

ok('il dado di deviazione ha quattro frecce e due Colpito',
   D.SCATTER_FACES.filter(f => f === 'hit').length === 2);
ok('e i due Colpito stanno su facce opposte, come sul dado vero',
   D.SCATTER_FACES[0] === 'hit' && D.SCATTER_FACES[5] === 'hit');
/* la faccia grezza 2 e' una freccia, e ogni freccia porta con se' il
   grado in cui il dado si e' fermato */
D.setSource(seq([1, 137]));
const arrow = D.rollDice({ kind:'scatter', n:1 }).dice[0];
ok('la freccia porta la sua direzione', !arrow.hit && arrow.deg === 137);

/* Il punteggio da fare: l'1 non passa mai, nemmeno quando basterebbe. */
D.setSource(seq([0, 3, 5]));
const need2 = D.rollDice({ kind:'d6', n:3, target:2 });
ok('a 2+ passano il 4 e il 6, non l\'1', need2.hits === 2);

/* La deviazione: il Colpito ferma l'oggetto, la freccia lo sposta. */
D.setSource(() => 0);                    // sempre la prima faccia: Colpito!
const stay = D.scatter({ distance:'d6' });
ok('col Colpito l\'oggetto resta dov\'e', stay.hit && stay.inches === 0);
D.setSource(seq([1, 90, 2]));            // freccia, 90 gradi, poi la faccia 3
const moved = D.scatter({ distance:'d6' });
ok('con la freccia si sposta dei pollici tirati', !moved.hit && moved.inches === 3);
ok('e verso destra sono novanta gradi', moved.deg === 90 && moved.compass === 'destra');
ok('e la direzione e un grado, non uno di otto', moved.deg >= 0 && moved.deg < 360);
D.setSource(null);

/* Il 2D6 di distanza sono due cubi, non un numero da sette: il vassoio
   deve poterli far rotolare tutti e due. */
const pair = D.scatter({ distance:'2d6' });
ok('la distanza 2D6 tiene i due dadi separati', pair.dist.dice.length === 2 &&
   pair.dist.value === pair.dist.dice[0].value + pair.dist.dice[1].value);

/* Il Mancato Colpo sulla distanza vince su tutto. */
D.setSource(seq([1, 0, 5]));             // freccia, direzione, poi Mancato Colpo
const jam = D.scatter({ distance:'artillery' });
ok('il Mancato Colpo blocca la deviazione', jam.misfire && jam.inches === 0);
D.setSource(null);

/* Il generatore. Non si prova che sia casuale — non si puo' — ma che
   non abbia il pollice sulla bilancia: quarantottomila dadi devono
   dare sei mucchi che si somigliano, e ottomila e' la media. */
const tally = [0, 0, 0, 0, 0, 0, 0];
for (let i = 0; i < 48000; i++) tally[D.d6()]++;
ok('le sei facce escono tutte piu o meno lo stesso',
   tally.slice(1).every(n => near(n, 8000, 480)));
ok('e nessuna faccia manca', tally.slice(1).every(n => n > 0));
ok('il generatore del browser c\'e', D.trueRandom());

/* La riga che finisce nel registro dice quello che si e' visto. */
D.setSource(seq([3, 3, 3]));
ok('la lettura mette le facce, non solo il totale',
   D.readOut(D.rollDice({ kind:'d6', n:3 })) === '3D6: 4 + 4 + 4 = 12');
D.setSource(null);

console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
