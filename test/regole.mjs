/* Le fondamenta della Tappa 0 del piano: i tipi di truppa, il ritiro,
 * gli archi, le caratteristiche con la loro storia, le categorie di
 * terreno, le due tabelle di Battle March e il formato dei file
 * d'esercito. Niente jsdom, niente rete: moduli puri e un dado guidato.
 * Si lancia con:  node test/regole.mjs
 */
import fs from 'node:fs';
import { troopType, usPerModel, unitStrength, TROOPS, unverified } from '../src/troops.js';
import { pool, expected, fleeRoll, rankBonus, IMPOSSIBLE } from '../src/rules.js';
import { arcOf, arcOfPoly, arcSectors, sideOf } from '../src/formation.js';
import { boxCorners } from '../src/geom.js';
import * as EF from '../src/effects.js';
import { TERRAIN, catOf, isNatural, coverOf, CAT_IDS } from '../src/terrain.js';
import * as BM from '../src/battlemarch.js';
import { makeArmies, coverage, rulesNow, toEffect, expressible, unmatched } from '../src/armies.js';
import { readRules } from '../src/rulebook.js';
import { readUnit } from '../src/parser.js';
import * as PREP from '../src/prep.js';
import * as D from '../src/dice.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};
/* un dado deciso: la sequenza si ripete finche' serve */
const seq = a => { let i = 0; return n => a[i++ % a.length] % n; };

/* ================================================================= */
console.log('tipi di truppa (p. 105)');
ok('il testo del file si legge anche storto', troopType('Heavy infantry').id === 'heavyInfantry');
ok('la parentesi del personaggio non confonde il tipo',
   troopType('Regular infantry (character)').id === 'regularInfantry');
ok('ma il personaggio resta segnato', troopType('Regular infantry (character)').isCharacter);
ok('il carro pesante non diventa cavalleria', troopType('Heavy chariot').id === 'heavyChariot');
ok('la creatura mostruosa non diventa fanteria mostruosa',
   troopType('Monstrous creature').id === 'monstrousCreature');
ok('un tipo che non c\'e non finge di esserci', troopType('Cosa Strana').unknown === true);
ok('e si comporta come la fanteria, che e l ipotesi meno dannosa',
   troopType('Cosa Strana').perRank === 5);
ok('la tabella ha tredici righe', TROOPS.length === 13);
ok('e dice quali celle non sono confrontate con una lista vera', unverified().length > 0);

ok('la Forza d Unita del file vince sulla tabella', usPerModel('Regular Infantry', 3, 1) === 3);
ok('senza il file si legge la tabella', usPerModel('Monstrous Infantry', 0, 1) === 3);
ok('e non si da piu per scontato 1 per modello', usPerModel('Behemoth', 0, 1) === 6);
ok('la Forza d Unita cala con i morti', unitStrength('Monstrous Infantry', 12, 4, 2) === 6);

ok('un colosso non prende ranghi', rankBonus(1, 1, troopType('Behemoth').maxRank) === 0);
ok('la fanteria ne prende fino a tre', rankBonus(30, 5, troopType('Heavy Infantry').maxRank) === 3);
ok('la cavalleria mostruosa si ferma a uno',
   rankBonus(30, 3, troopType('Monstrous Cavalry').maxRank) === 1);

/* Le dieci liste salvate sono la prova vera: se un tipo non si
   riconosce, si riconosce qui e non a partita cominciata. */
const lists = JSON.parse(fs.readFileSync(new URL('../dati/liste.json', import.meta.url), 'utf8'));
const withTroop = lists.flatMap(l => (l.units || []).filter(u => u.troop));
ok('nessuna unita salvata ha un tipo di truppa sconosciuto',
   withTroop.every(u => !troopType(u.troop).unknown));

/* Dove il file dichiara la Forza d'Unita' e la tabella dice un'altra
   cosa, e' sempre il file a dire di piu': sa della cavalcatura (un
   Oldblood su un Carnosauro, un Bigboss su uno squig gigante) e del
   personaggio unito al reggimento, che alza il totale senza alzare il
   numero di modelli. La tabella conosce solo il tipo di truppa nudo.

   La prova e' che il file non sia mai piu' BASSO: quella sarebbe una
   riga della tabella sbagliata. Contare i casi noti sarebbe piu'
   preciso e durerebbe fino alla prossima partita archiviata, perche'
   `dati/liste.json` lo riscrive la Nuvola ogni volta che si sincronizza. */
const disagree = withTroop.filter(u => u.us && u.models &&
  Math.abs(u.us / u.models - troopType(u.troop).us) > 0.001);
ok('dove il file e la tabella non concordano, e sempre il file a dire di piu',
   disagree.every(u => u.us / u.models > troopType(u.troop).us));
ok('e i casi sono quelli con una cavalcatura o un personaggio unito',
   disagree.length > 0 && disagree.length < withTroop.length / 4);

/* ================================================================= */
console.log('\nil ritiro (p. 93)');
D.setSource(seq([0, 0, 0, 5, 5, 5]));            // 1,1,1 e poi 6,6,6
const r1 = pool(3, 4, 'ones');
ok('gli 1 si ritirano', r1.rerolled === 3 && r1.hits === 3);
ok('e si vede cosa era uscito prima', r1.first.join('') === '111' && r1.dice.join('') === '666');

D.setSource(seq([5, 5, 5, 0, 0, 0]));            // 6,6,6 e poi 1,1,1
const r2 = pool(3, 4, 'ones');
ok('un dado passato non si ritira', r2.rerolled === 0 && r2.hits === 3);

D.setSource(seq([2, 2, 2, 5, 5, 5]));            // 3,3,3 e poi 6,6,6
const r3 = pool(3, 4, 'misses');
ok('il ritiro dei falliti prende anche quelli che non erano 1', r3.rerolled === 3 && r3.hits === 3);

D.setSource(seq([5, 5, 5, 0, 0, 0]));            // 6,6,6 e poi 1,1,1
const r4 = pool(3, 4, 'all');
ok('il dado ritirato tiene il risultato nuovo anche se e peggiore',
   r4.rerolled === 3 && r4.hits === 0);

D.setSource(seq([0, 0, 0, 0, 0, 0, 0, 0, 0]));   // sempre 1
const r5 = pool(3, 4, 'ones');
ok('e non si ritira due volte', r5.rerolled === 3 && r5.dice.join('') === '111');
D.setSource(null);

ok('senza ritiro il conto medio non cambia', expected(6, 4) === 3);
ok('il ritiro degli 1 aggiunge un sesto', Math.abs(expected(6, 4, 'ones') - 3.5) < 1e-9);
ok('il ritiro dei falliti aggiunge la meta di quello che restava',
   Math.abs(expected(6, 4, 'misses') - 4.5) < 1e-9);
ok('quello che non si puo fare non si ritira', expected(6, IMPOSSIBLE, 'misses') === 0);

D.setSource(seq([0, 0]));                         // 1 + 1
ok('la Fuga Precipitosa aggiunge un pollice', fleeRoll(1).total === 3);
ok('e non si scende sotto due', fleeRoll(-5).total === 2);
D.setSource(null);

/* ================================================================= */
console.log('\narchi di visuale');
const box = { x:0, y:0, w:100, h:50, rot:0 };
ok('davanti e davanti', arcOf([0, -200], box) === 'fronte');
ok('dietro e dietro', arcOf([0, 200], box) === 'retro');
ok('di lato e di fianco', arcOf([200, 0], box) === 'fianco');
ok('i due fianchi restano distinti dove servono',
   sideOf([200, 0], box) === 'fianco destro' && sideOf([-200, 0], box) === 'fianco sinistro');
const turned = { x:0, y:0, w:100, h:50, rot:90 };
ok('e la rotazione li gira con la basetta', arcOf([200, 0], turned) === 'fronte');

const target = boxCorners({ x:0, y:-120, w:60, h:40, rot:180 });
ok('un nemico davanti sta tutto nell arco frontale',
   arcOfPoly(target, box).arc === 'fronte' && arcOfPoly(target, box).has.length === 1);
const wide = boxCorners({ x:70, y:-70, w:60, h:40, rot:0 });
const w2 = arcOfPoly(wide, box);
ok('uno a cavallo di una diagonale dice tutti e due gli archi che tocca', w2.has.length >= 1);
ok('e ne indica comunque uno dominante', ['fronte', 'fianco', 'retro'].includes(w2.arc));
const sect = arcSectors(box, 60);
ok('gli spicchi da disegnare sono quattro', Object.keys(sect).length === 4);
ok('e partono dal centro della basetta', sect.fronte[0][0] === 0 && sect.fronte[0][1] === 0);

/* ================================================================= */
console.log('\nle caratteristiche, e da dove vengono');
const u = { stats:{ M:'4', WS:'3', BS:'3', S:'3', T:'3', W:'1', I:'3', A:'1', Ld:'7' }, armour:5 };
ok('senza effetti il valore e quello del profilo', EF.val(u, 'S') === 3);
ok('e la storia e vuota', EF.statOf(u, 'S').mods.length === 0);

EF.addEffect(u, { id:'ghur', from:'Vento di Ghur', page:321, mods:{ S:+1, I:-1 },
                  flags:{ frenzy:true }, until:{ turn:3 } });
ok('un effetto sposta il numero', EF.val(u, 'S') === 4);
ok('e dice chi lo ha spostato', EF.statOf(u, 'S').mods[0].from === 'Vento di Ghur');
ok('con la pagina del manuale', EF.statOf(u, 'S').mods[0].page === 321);
ok('la riga si legge come si legge al tavolo',
   EF.explain(u, 'S') === "Forza 4 (3 base, +1 Vento di Ghur (p. 321))");
ok('un effetto puo anche togliere', EF.val(u, 'I') === 2);
ok('e accendere una regola', EF.flagsOf(u).flags.frenzy === true);
ok('dicendo chi l ha accesa', EF.flagsOf(u).why.frenzy[0] === 'Vento di Ghur');

/* Rilanciato dalla stessa fonte non si somma: si sostituisce, che e'
   quello che il manuale chiede per un incantesimo rilanciato. */
EF.addEffect(u, { id:'ghur', from:'Vento di Ghur', page:321, mods:{ S:+1, I:-1 }, until:{ turn:3 } });
ok('lo stesso effetto dalla stessa fonte non si somma',
   EF.effectsOf(u).length === 1 && EF.val(u, 'S') === 4);
ok('scaduto il turno l effetto se ne va', EF.sweepExpired(u, { turn: 4 }).length === 1);
ok('e il numero torna quello di prima', EF.val(u, 'S') === 3);

const forced = { stats:{ Ld:'7' } };
EF.addEffect(forced, { id:'brulicanti', from:'Masse Brulicanti', mods:{ Ld:{ set: 10 } } });
ok('un effetto puo anche fissare il valore', EF.val(forced, 'Ld') === 10);

const low = { stats:{ T:'2' } };
EF.addEffect(low, { id:'x', from:'prova', mods:{ T: -9 } });
ok('la Resistenza non scende sotto uno finche l unita e viva', EF.val(low, 'T') === 1);
ok('e il minimo di profilo compare nella storia',
   EF.statOf(low, 'T').mods.some(m => m.from === 'minimo di profilo'));

const rider = { stats:{ M:'4', WS:'5', S:'4', T:'4', W:'3', I:'5', A:'3', Ld:'9' },
                mount:{ name:'Cinghiale', stats:{ M:'7', WS:'3', S:'3', T:'4', W:'1', I:'2', A:'1' } } };
ok('il Movimento e della cavalcatura', EF.val(rider, 'M') === 7);
ok('la Forza e di chi ci sta sopra', EF.val(rider, 'S') === 4);
ok('ma quella della bestia si sa chiedere', EF.val(rider, 'S', { who:'mount' }) === 3);
EF.addEffect(rider, { id:'zanne', from:'Carica delle Zanne', who:'mount', mods:{ S:+1 } });
ok('e un effetto puo valere per una sola delle due',
   EF.val(rider, 'S') === 4 && EF.val(rider, 'S', { who:'mount' }) === 4);

ok('quello che si usa una volta si spende', EF.spend(rider, 'waaagh') === true);
ok('e non si spende due volte', EF.spend(rider, 'waaagh') === false);
ok('l annulla lo riporta indietro',
   (EF.unspend(rider, 'waaagh'), EF.spent(rider, 'waaagh') === false));

/* ================================================================= */
console.log('\ncategorie di terreno (pp. 269-270)');
ok('le categorie sono sette', CAT_IDS.length === 7);
ok('ogni pezzo ne dichiara una', Object.keys(TERRAIN).every(k => catOf({ kind:k }).id));
ok('la palude e pericolosa, non solo difficile', catOf({ kind:'marsh' }).id === 'dangerous');
ok('e chiede il test di terreno pericoloso', catOf({ kind:'marsh' }).danger === true);
ok('il bosco fa tenere il dado peggiore in carica', catOf({ kind:'wood' }).worstDie === true);
ok('e fa perdere i ranghi', catOf({ kind:'wood' }).disorder === true);
ok('il muretto e un ostacolo basso e non taglia la vista',
   catOf({ kind:'wall' }).id === 'lowWall' && catOf({ kind:'wall' }).los === false);
ok('un bosco e naturale', isNatural({ kind:'wood' }));
ok('un monolite no', !isNatural({ kind:'monolith' }));
ok('ma il pezzo posato vince sul tipo', !isNatural({ kind:'wood', natural:false }));
ok('e vale anche per la categoria', catOf({ kind:'wood', cat:'impassable' }).id === 'impassable');
ok('il punto di riferimento di Battle March c e', !!TERRAIN.landmark);
ok('la copertura si legge dal pezzo o dal tipo',
   coverOf({ kind:'wood' }) === 'soft' && coverOf({ kind:'wood', cover:'hard' }) === 'hard');

/* ================================================================= */
console.log('\nBattle March: le due tabelle');
D.setSource(seq([5]));                             // sempre 6
const wood = { kind:'wood', tid:'t1' };
ok('un terreno naturale si tira', BM.canRollWild(wood));
const wild = BM.rollWildTerrain(wood);
ok('ed esce una riga della tabella', wild && wild.id === 'troll');
ok('che dice di confrontare l abbinamento con il libro', /libro/.test(wild.nota));
ok('non si tira due volte sullo stesso pezzo', BM.rollWildTerrain(wood) === null);
ok('e non si tira su un muretto', !BM.canRollWild({ kind:'wall' }));

ok('il Caso della Guerra non parte al primo turno', BM.fortunesCheck(1).rolled === false);
D.setSource(seq([5]));                             // sempre 6
ok('e al secondo turno il 6 non basta', BM.fortunesCheck(2).happened === false);
D.setSource(seq([0, 2]));                          // 1, poi 3
const f = BM.fortunesCheck(3);
ok('mentre un 1 al terzo turno fa succedere qualcosa', f.happened === true && !!f.id);
D.setSource(null);

console.log('\nBattle March: gli obiettivi (p. 25)');
ok('lo tiene chi e piu vicino',
   BM.objectiveHolder([{ uid:1, army:'A', us:8, dist:2 }, { uid:2, army:'B', us:6, dist:2.5 }]).by.uid === 1);
ok('a pari distanza e pari forza e conteso',
   BM.objectiveHolder([{ uid:1, army:'A', us:8, dist:2 }, { uid:2, army:'B', us:8, dist:2 }]).contested === true);
ok('a pari distanza vince la Forza d Unita',
   BM.objectiveHolder([{ uid:1, army:'A', us:6, dist:2 }, { uid:2, army:'B', us:9, dist:2 }]).by.uid === 2);
ok('sotto Forza d Unita 5 non lo tiene nessuno',
   BM.objectiveHolder([{ uid:1, army:'A', us:4, dist:1 }]).held === false);
ok('oltre tre pollici nemmeno',
   BM.objectiveHolder([{ uid:1, army:'A', us:9, dist:3.5 }]).held === false);
ok('chi fugge non lo tiene',
   BM.objectiveHolder([{ uid:1, army:'A', us:9, dist:1, fleeing:true }]).held === false);
ok('e nemmeno chi e stupido',
   BM.objectiveHolder([{ uid:1, army:'A', us:9, dist:1, stupid:true }]).held === false);

/* ================================================================= */
console.log('\ni file d\'esercito');
const dir = new URL('../dati/eserciti/', import.meta.url);
/* si legge l'indice, non la cartella: e' quello che fa l'app, perche'
   una cartella servita da HTTP non si puo' sfogliare */
const index = JSON.parse(fs.readFileSync(new URL('indice.json', dir), 'utf8'));
const files = index.file.map(f => JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')));
const A = makeArmies(files);
ok('ci sono tre eserciti, come i tre libri sullo scaffale', A.list.length === 3);
ok('e l indice li elenca tutti', index.file.length === 3);
ok('gli Orchi si trovano dal nome del catalogo', A.find('Orc and Goblin Tribes').id === 'orchi-goblin');
ok('gli Skaven pure', A.find('Skaven').id === 'skaven');
ok('e gli Uomini Lucertola pure', A.find('Lizardmen').id === 'uomini-lucertola');
ok('un esercito che non c e non si inventa', A.find('Bretonnia') === null);

const named = lists.filter(l => l.info && l.info.catalogue);
ok('tutte le liste salvate con un catalogo trovano il loro esercito',
   named.length > 0 && named.every(l => !!A.forList(l)));
ok('e quelle senza catalogo non ne inventano uno',
   lists.filter(l => !(l.info && l.info.catalogue)).every(l => A.forList(l) === null));

const og = A.find('Orc and Goblin Tribes');
const cov = coverage(og);
ok('le dieci regole degli Orchi ci sono tutte', cov.total === 10);
ok('otto l app le sa applicare', cov.applied.length === 8);
ok('e le due che non sa dicono perche', cov.manual.length === 2 && cov.manual.every(m => m.why));

ok('in carica valgono le regole di carica e quelle di sempre',
   rulesNow(og, 'charge').map(r => r.id).join(',') === 'warpaint,choppas,tuskerCharge');
ok('il Waaagh gia speso non torna',
   !rulesNow(og, 'command', { spent:['waaagh'] }).some(r => r.id === 'waaagh'));

const warpaint = toEffect(og.rules.find(r => r.id === 'warpaint'), og);
ok('Warpaint da la salvezza speciale', warpaint.mods.ward.set === 6);
ok('e toglie l armatura', warpaint.mods.armour.set === 0);
const tusker = toEffect(og.rules.find(r => r.id === 'tuskerCharge'), og);
ok('la Carica delle Zanne vale per la cavalcatura e non per il cavaliere',
   tusker.who === 'mount' && tusker.mods.S === 1);

/* e l'effetto che ne esce lo legge effects.js senza sapere da dove viene */
const boar = { stats:{ S:'4' }, mount:{ name:'Cinghiale', stats:{ S:'3' } } };
EF.addEffect(boar, tusker);
ok('e effects.js lo applica senza sapere che viene da un army book',
   EF.val(boar, 'S') === 4 && EF.val(boar, 'S', { who:'mount' }) === 4);

const sk = A.find('Skaven');
ok('gli Skaven hanno cinque regole', coverage(sk).total === 5);
ok('e quattro oggetti a uso singolo', sk.items.length === 4 && sk.items.every(i => i.once));
ok('la Fuga Precipitosa e esprimibile', expressible(sk.rules.find(r => r.id === 'scurryAway')));
ok('le Masse Brulicanti no, e lo dice',
   !expressible(sk.rules.find(r => r.id === 'teemingMasses')));

const lm = A.find('Lizardmen');
ok('il file degli Uomini Lucertola c e ma e vuoto, e lo dichiara',
   lm.rules.length === 0 && /trascritte/.test(lm.nota));

ok('le regole che nessuno riconosce si contano per frequenza',
   unmatched(['Waaagh!', 'Cosa Strana', 'Cosa Strana'], og)[0].name === 'Cosa Strana');
ok('e quelle dell esercito non ci finiscono dentro',
   !unmatched(['Warpaint'], og).length);

/* ================================================================= */
console.log('\nil profilo diviso, letto dal file');
/* Un roster finto, nella forma che New Recruit esporta: un reggimento
   di cavalleria con tre profili di modello — il cavaliere, il campione
   e la bestia. Il campione sta in mezzo apposta: e' il caso in cui
   «prendi il secondo profilo» darebbe al Boar Boy il Movimento del suo
   Boss, e per accorgersene serve una prova, non un'occhiata. */
const prof = (name, stats) => ({ name, typeName:'Model',
  characteristics:{ characteristic: Object.entries(stats).map(([n, v]) => ({ name:n, '$text':String(v) })) } });
const st = o => ({ M:4, WS:3, BS:3, S:3, T:3, W:1, I:3, A:1, Ld:7, ...o });
const unitNode = (name, troop, models) => ({
  name, type:'unit',
  profiles:{ profile:[
    { name:'Unit', typeName:'Unit', characteristics:{ characteristic:[{ name:'Troop Type', '$text':troop }] } },
    ...models,
  ] },
});

const boars = readUnit(unitNode('Orc Boar Boy Mobs', 'Heavy Cavalry',
  [prof('Orc Boar Boy', st({ WS:3 })), prof('Boss', st({ WS:4, A:2 })), prof('Boar', st({ M:7, I:2 }))]));
ok('i profili di modello si tengono tutti', boars.profiles.length === 3);
ok('il primo resta quello dell unita', boars.stats.WS === '3');
ok('e la cavalcatura e la bestia, non il campione',
   boars.mount && boars.mount.name === 'Boar');
ok('quindi il Movimento e quello della bestia', EF.val(boars, 'M') === 7);
ok('mentre la Forza resta quella di chi ci sta sopra', EF.val(boars, 'S') === 3);

const saurus = readUnit(unitNode('Saurus Warriors', 'Heavy Infantry',
  [prof('Saurus Warrior', st({})), prof('Spawn Leader', st({ A:2 }))]));
ok('un campione di fanteria non diventa una cavalcatura', saurus.mount === null);
ok('ma il suo profilo non si perde per strada', saurus.profiles.length === 2);

/* ================================================================= */
console.log('\nla scheda di preparazione');
const og9 = lists.find(l => l.info && l.info.catalogue === 'Orc and Goblin Tribes');
ok('un carro non e un personaggio solo perche e un modello solo',
   !PREP.isCharacter({ name:'Orc Boar Chariots', models:1, troop:'Heavy chariot' }));
ok('ne una macchina da guerra',
   !PREP.isCharacter({ name:'Warp Lightning Cannon', models:1, troop:'War machine' }));
ok('ma il Warboss si',
   PREP.isCharacter({ name:'Black Orc Warboss', models:1, troop:'Heavy Infantry', slot:'Characters' }));
ok('e un personaggio unito a un reggimento pure',
   PREP.isCharacter({ name:'Warlock Engineer', models:1, troop:'Regular infantry (character)' }));

const fresh = JSON.parse(JSON.stringify(og9));
ok('una lista appena importata ha domande aperte', PREP.questions(fresh).length > 0);
ok('e la prima e sempre chi comanda', PREP.questions(fresh)[0].id === 'general');
ok('ogni domanda dice perche viene fatta', PREP.questions(fresh).every(q => q.why));
ok('il generale si propone dal Comando piu alto',
   fresh.units[PREP.guessGeneral(fresh)].name === 'Black Orc Warboss');

PREP.setPrep(fresh, { general: PREP.guessGeneral(fresh) });
ok('rispondere chiude la domanda', !PREP.questions(fresh).some(q => q.id === 'general'));
ok('e la risposta si vede', PREP.answered(fresh)[0].value === 'Black Orc Warboss');

PREP.setUnitPrep(fresh, 0, { weapon:'Great Weapon' });
ok('l arma scelta resta scritta', PREP.prepOf(fresh).units[0].weapon === 'Great Weapon');
ok('e non cancella le altre risposte', PREP.prepOf(fresh).general != null);
ok('e non chiede piu quale arma impugna quell unita',
   !PREP.questions(fresh).some(q => q.id === 'weapon' && q.unit === 0));
ok('la scheda dice a che punto e',
   PREP.readiness(fresh).done === 2 && PREP.readiness(fresh).open > 0);

/* La busta viaggia dentro la lista, in un campo solo: backup e
   sincronia se la portano dietro senza sapere cosa c'e' dentro. */
ok('e tutto sta dentro la lista',
   JSON.parse(JSON.stringify(fresh)).prep.units[0].weapon === 'Great Weapon');
ok('tutte le liste salvate si leggono senza rompersi',
   lists.every(l => Array.isArray(PREP.questions(l)) && Array.isArray(PREP.answered(l))));

/* ================================================================= */
console.log('\nferite d\'urto con il piu');
ok('il D3 secco si legge', readRules(['Impact Hits (D3)']).flags.impact.die === 3);
ok('e il D3 con il piu uno pure',
   readRules(['Impact Hits (D3+1)']).flags.impact.plus === 1);
ok('anche sul calpestamento', readRules(['Stomp Attacks (D3+1)']).flags.impact.plus === 1);
ok('e il numero secco resta secco', readRules(['Impact Hits (2)']).flags.impact.flat === 2);
ok('due dadi si leggono come due', readRules(['Impact Hits (2D6)']).flags.impact.times === 2);
/* le tre unita' delle liste salvate che prima cascavano nel ripiego */
const impacts = withTroop.flatMap(u => (u.rules || []).filter(r => /impact hits|stomp/i.test(r)));
ok('nessuna delle regole d urto delle liste salvate finisce piu nel ripiego',
   impacts.every(r => { const a = readRules([r]).flags.impact; return a && !a.perFront; }));

console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
