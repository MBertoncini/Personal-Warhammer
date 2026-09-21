/* Le cavalcature dei personaggi, e le liste rinominate.
 *
 * Un Grey Seer sulla Screaming Bell, uno Skink Priest sull'Ancient
 * Stegadon, un Oldblood sul Carnosauro: cosa cambia nella lista, cosa
 * cambia sul tavolo e cosa cambia nell'assalto. E lo Skink Priest da
 * 290 punti che New Recruit esporta su una basetta da 25 mm, che l'app
 * deve riconoscere senza fargli pagare lo Stegadon due volte.
 *
 * Si lancia con:  node test/cavalcature.mjs
 */
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import * as MT from '../src/mounts.js';
import * as C from '../src/combat.js';
import * as FM from '../src/formation.js';
import * as PAL from '../src/palmares.js';
import * as PREP from '../src/prep.js';
import { moveInfo } from '../src/profiles.js';
import * as L from '../src/lists.js';
import * as AR from '../src/arbitro.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};
const json = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
MT.useMounts(json('../dati/cavalcature.json'));
const saved = json('../dati/liste.json');
const copy = o => JSON.parse(JSON.stringify(o));

/* Grey Seer: Legends: Skaven, p. 7 */
const seer = () => ({
  name: 'Grey Seer', models: 1, pts: 185, troop: 'Regular infantry (character)', slot: 'Characters',
  faction: 'Skaven', baseId: '25x25', baseW: 25, baseH: 25, frontage: 1, loose: false,
  stats: { M:'5', WS:'3', BS:'3', S:'3', T:'4', W:'3', I:'5', A:'2', Ld:'7' },
  rules: ['Lore of the Horned Rat', 'Scurry Away', 'Warband'],
  weapons: [{ name:'Hand weapon', range:'Combat', S:'S', ap:'-', rules:'' }],
  armour: 0, ward: 0, regen: 0, us: 0,
});
const clanrats = () => ({
  name: 'Clanrats', models: 20, troop: 'Regular infantry', frontage: 5,
  stats: { M:'5', WS:'3', BS:'3', S:'3', T:'3', W:'1', I:'4', A:'1', Ld:'5' },
  rules: [], weapons: [{ name:'Hand weapon', range:'Combat', S:'S', ap:'-', rules:'' }],
  armour: 6, ward: 0, regen: 0,
});

/* ================================================================= */
console.log('quale cavalcatura per quale personaggio');

const opts = MT.mountOptions(seer(), 'Skaven');
ok('il Grey Seer ha la Screaming Bell dal libro', opts.book.map(m => m.id).join() === 'screaming-bell');
ok('e la Plague Furnace fra le altre, non fra quelle del libro', opts.other.some(m => m.id === 'plague-furnace'));
ok('niente cavalcature di altri eserciti', opts.other.every(m => m.faction === 'Skaven'));

const priest = { name: 'Skink Priest', faction: 'Lizardmen', models: 1, slot: 'Characters' };
const pOpts = MT.mountOptions(priest);
ok('lo Skink Priest cavalca l Ancient Stegadon, non lo Stegadon (p. 5)',
   pOpts.book.some(m => m.id === 'ancient-stegadon') && !pOpts.book.some(m => m.id === 'stegadon'));
ok('lo Stegadon resta proponibile, fra le altre', pOpts.other.some(m => m.id === 'stegadon'));
ok('lo Skink Chief ha lo Stegadon, il Terradon e il Ripperdactyl',
   ['stegadon', 'terradon', 'ripperdactyl'].every(id =>
     MT.mountOptions({ name: 'Skink Chief', faction: 'Lizardmen' }).book.some(m => m.id === id)));
ok('una lista scritta a mano, senza fazione, propone lo stesso quelle del libro',
   MT.mountOptions({ name: 'Grey Seer' }).book.some(m => m.id === 'screaming-bell'));

/* ================================================================= */
console.log('il Grey Seer sale sulla campana');

const bell = MT.mountById('screaming-bell');
const s1 = MT.mountUnit(seer(), bell);
ok('basetta 60×100', s1.baseId === '60x100' && s1.baseW === 60 && s1.baseH === 100);
ok('carro pesante, e resta un personaggio', /heavy chariot/i.test(s1.troop) && PREP.isCharacter(s1));
ok('si muove come la campana: 2', s1.stats.M === '2');
ok('Resistenza la piu alta delle due: 6', s1.stats.T === '6');
ok('Ferite sommate, 3 del Grey Seer e 5 della campana (p. 205)', s1.stats.W === '8');
ok('mena con i suoi due attacchi e la sua Abilita', s1.stats.A === '2' && s1.stats.WS === '3');
ok('i punti della campana si sommano: 185 + 185', s1.pts === 370 && s1.mountPts === 185);
ok('armatura 4+ della campana e speciale 5+', s1.armour === 4 && s1.ward === 5);
ok('le regole della campana valgono per tutto il modello',
   ['Terror', 'Stubborn', 'Impact Hits (D6+1)', 'Scurry Away'].every(r => s1.rules.includes(r)));
ok('l Armour Bane del Rat Ogre resta sulla sua riga, non sul Grey Seer',
   !s1.rules.some(r => /armour bane/i.test(r)));
ok('la Forza d Unita la decide la tabella, non il file', s1.us === 0);
ok('il Movimento dice da dove viene', /Screaming Bell/.test(moveInfo(s1).why) && moveInfo(s1).m === 2);
const rows = MT.attackRows(s1);
ok('mena anche il Rat Ogre: tre attacchi di Forza 5',
   rows.length === 1 && rows[0].chi === 'Rat Ogre Crew' && rows[0].a === 3 && rows[0].s === 5);

const back = MT.dismountUnit(copy(s1));
const fresh = seer();
ok('smontare lo rimette a piedi, com era',
   back.baseId === '25x25' && back.stats.W === '3' && back.pts === 185 && back.troop === fresh.troop &&
   JSON.stringify(back.rules) === JSON.stringify(fresh.rules) && !back.mountId && !back.foot);
const twice = MT.mountUnit(MT.mountUnit(seer(), bell), MT.mountById('plague-furnace'));
ok('cambiare cavalcatura non somma le due bestie', twice.pts === 185 + 170 && twice.stats.W === '8');

/* ================================================================= */
console.log('sul tavolo');

ok('sul carro non entra in un reggimento (Lumbering, p. 195)', !FM.canJoin(s1) && FM.isLumbering(s1));
ok('e nessuno entra in lui', !FM.canHost([s1], s1));
const boss = MT.mountUnit({ name: 'Orc Warboss', faction: 'Orc and Goblin Tribes', models: 1, slot: 'Characters',
  troop: 'Regular Infantry', stats: { M:'4', WS:'5', BS:'3', S:'4', T:'4', W:'3', I:'4', A:'4', Ld:'8' },
  rules: [], weapons: [], armour: 5 }, MT.mountById('war-boar'));
ok('sul cinghiale invece si unisce ancora', FM.canJoin(boss) && !FM.isLumbering(boss));

/* L'Oldblood di «LIZ fun»: il Carnosauro c'e', ma il tipo di truppa e'
   quello del cavaliere. Si schierava dentro gli Skink, che poi facevano
   Terrore in carica. */
const savedOldblood = saved.find(l => l.name === 'LIZ fun').units.find(u => u.name === 'Saurus Oldblood');
ok('nella lista salvata ora e montato sul Carnosauro, e non si unisce',
   savedOldblood.mountId === 'carnosaur' && /behemoth/i.test(savedOldblood.troop) && !FM.canJoin(savedOldblood));
/* smontato torna com'era nel file */
const lizOldblood = MT.dismountUnit(copy(savedOldblood));
const skinks = { name: 'Skink Skirmishers', models: 10, troop: 'Regular infantry', army: 'A', uid: 2, loose: true };
lizOldblood.army = 'A'; lizOldblood.uid = 1;
ok('l Oldblood del file e fanteria sul foglio, ma sul Carnosauro',
   /infantry/i.test(lizOldblood.troop) && !lizOldblood.mountId && lizOldblood.mount.name === 'Carnosaur');
ok('conta la cavalcatura: e un Behemoth', /behemoth/i.test(MT.troopOf(lizOldblood)));
ok('al tavolo non entra negli Skink', FM.isLumbering(lizOldblood) && !FM.canJoin(lizOldblood) &&
   !FM.joinCandidates([lizOldblood, skinks], skinks).length && !FM.hostCandidates([lizOldblood, skinks], lizOldblood).length);
ok('e nessuno entra in lui', !FM.canHost([lizOldblood], lizOldblood));
ok('per l arbitro non si unisce a nessuno', !AR.puoUnirsi({ units: [lizOldblood, skinks] }, lizOldblood));
MT.useMounts(null);
ok('senza tabella delle cavalcature basta il Large Target', FM.isLumbering(lizOldblood) &&
   !AR.puoUnirsi({ units: [lizOldblood, skinks] }, lizOldblood));
MT.useMounts(json('../dati/cavalcature.json'));
const walker = copy(lizOldblood); walker.mount = null;
walker.rules = walker.rules.filter(r => !/large target/i.test(r));
ok('a piedi resta fanteria e si unisce', !FM.isLumbering(walker) && FM.canJoin(walker) &&
   AR.puoUnirsi({ units: [walker, skinks] }, walker));
ok('cavalleria pesante, Movimento 7, Resistenza e Ferite del cavaliere',
   /heavy cavalry/i.test(boss.troop) && boss.stats.M === '7' && boss.stats.T === '4' && boss.stats.W === '3');
ok('e la pelle dura del cinghiale migliora l armatura di uno', boss.armour === 4);
const squig = MT.mountUnit({ name: 'Night Goblin Bigboss', models: 1, slot: 'Characters', troop: 'Regular Infantry',
  stats: { M:'4', WS:'4', BS:'3', S:'4', T:'3', W:'2', I:'3', A:'3', Ld:'6' }, rules: [], weapons: [] },
  MT.mountById('giant-cave-squig'));
ok('il Movimento del Giant Cave Squig si tira', moveInfo(squig).random === '3D6' && moveInfo(squig).m === 0);
ok('e il suo Movimento sulla riga della bestia non diventa un 3', squig.mount.stats.M === '-');

/* ================================================================= */
console.log('il file di New Recruit che lo esporta gia montato');

const tutto = saved.find(l => l.units.some(u => u.name === 'Skink Priest' && u.pts === 290));
const oldPriest = copy(tutto.units.find(u => u.name === 'Skink Priest' && u.pts === 290));
ok('lo Skink Priest da 290 punti arriva su una 25×25 con le corna fra le armi',
   oldPriest.baseId === '25x25' && oldPriest.weapons.some(w => w.name === 'Great horns'));
const g = MT.guessMount(oldPriest, 'Lizardmen');
ok('l app lo riconosce: Ancient Stegadon, non Stegadon', g && g.id === 'ancient-stegadon');
MT.mountUnit(oldPriest, g, { fromFile: true });
ok('montato dal file i punti restano 290', oldPriest.pts === 290 && oldPriest.mountPts === 0);
ok('basetta 60×100 e colosso', oldPriest.baseId === '60x100' && /behemoth/i.test(oldPriest.troop));
ok('Ferite 2 + 5, Resistenza 6', oldPriest.stats.W === '7' && oldPriest.stats.T === '6');
ok('le corna tornano allo Stegadon', oldPriest.weapons.find(w => w.name === 'Great horns').di === 'Ancient Stegadon');
ok('e il prete mena con la sua arma', C.meleeWeapon(oldPriest).name === 'Hand Weapon');
ok('le regole non si doppiano', oldPriest.rules.filter(r => r === 'Terror').length === 1);

const oldblood = copy(saved.flatMap(l => l.units).find(u => u.name === 'Saurus Oldblood'));
const gc = MT.guessMount(oldblood, 'Lizardmen');
ok('l Oldblood con gli artigli fra le armi e sul Carnosauro', gc && gc.id === 'carnosaur');
MT.mountUnit(oldblood, gc, { fromFile: true });
ok('Resistenza +1 e Ferite +4 (p. 12)', oldblood.stats.T === '6' && oldblood.stats.W === '7');
ok('armatura la migliore delle due', oldblood.armour === 4);

const boyz = copy(saved.flatMap(l => l.units).find(u => u.name === 'Orc Boar Boy Mobs'));
ok('un reggimento di cavalleria non e un capo montato', MT.guessMount({ ...boyz, profiles: [{ name:'Boy' }, { name:'War Boar' }] }) === null);
ok('e un personaggio a piedi non sembra montato',
   MT.guessMount(copy(saved.flatMap(l => l.units).find(u => u.name === 'Black Orc Warboss'))) === null);

/* ================================================================= */
console.log('nell assalto');

const bellSeer = MT.mountUnit(seer(), bell);
const a = C.combatant({ ...bellSeer, charged: { inches: 6, arc: 'fronte' } });
const b = C.combatant(clanrats());
ok('l urto della carica usa la Forza della campana, non quella del Grey Seer', a.autoS === 5);
const fight = C.meleeFight([a], [b]);
const ogre = fight.steps.filter(s => s.mount);
ok('il Rat Ogre mena accanto al Grey Seer', ogre.length === 1 && /Rat Ogre/.test(ogre[0].name) && ogre[0].attacks === 3);
ok('con la sua Forza 5', ogre[0].strength === 5);
ok('e il Grey Seer con la sua', fight.steps.some(s => !s.mount && s.label === 'colpi' && s.side === 'A' && s.strength === 3));
const impact = fight.steps.find(s => s.label === 'urto della carica');
ok('l urto a Forza 5', impact && impact.strength === 5);
ok('il Rat Ogre non tira il test di rotta e non e un bersaglio', fight.sides.A.length === 1);
const fc = C.meleeForecast(a, b);
ok('la previsione somma il Grey Seer e il Rat Ogre',
   (fc.groups || []).some(g => g.mount) && fc.attacks === 2 + 3);
const onFoot = C.meleeFight([C.combatant(seer())], [C.combatant(clanrats())]);
ok('a piedi nessuno mena per lui', !onFoot.steps.some(s => s.mount));

/* ================================================================= */
console.log('rinominare una lista');

PAL.usePalmares([
  { id: 'r1', meta: { date: '2026-09-01' }, armies: { A: { name: 'Ratti di casa' }, B: { name: 'Orchi' } },
    score: { rows: [{ A: 900, B: 300 }] }, turns: [] },
]);
ok('i nomi di una lista sono quello di adesso e quelli di prima',
   PAL.namesOf({ name: 'Nuovo', formerNames: ['Vecchio'] }).join('|') === 'Nuovo|Vecchio');
ok('il palmares si trova anche col nome di prima',
   PAL.recordOf(PAL.namesOf({ name: 'Ratti del Guado', formerNames: ['Ratti di casa'] })).won === 1);
ok('e senza, la lista riparte da zero', PAL.recordOf(PAL.namesOf({ name: 'Ratti del Guado' })).played === 0);

await L.initLists();
PAL.usePalmares([
  { id: 'r1', meta: { date: '2026-09-01' }, armies: { A: { name: 'Ratti di casa' }, B: { name: 'Orchi' } },
    score: { rows: [{ A: 900, B: 300 }] }, turns: [] },
]);
const mine = await L.createList('Ratti di casa');
await L.renameList(mine.id, 'Ratti del Guado');
ok('rinominata, si chiama col nome nuovo', L.getList(mine.id).name === 'Ratti del Guado');
ok('e si porta dietro la partita del nome vecchio',
   PAL.recordOf(PAL.namesOf(L.getList(mine.id))).played === 1);
await L.renameList(mine.id, 'Ratti di casa');
ok('tornare al nome di prima non lo tiene due volte', (L.getList(mine.id).formerNames || []).length === 1 &&
   PAL.recordOf(PAL.namesOf(L.getList(mine.id))).played === 1);
await L.renameList(mine.id, 'Ratti nuovi', { keepPast: false });
ok('chi sceglie di ripartire da zero riparte da zero', PAL.recordOf(PAL.namesOf(L.getList(mine.id))).played === 0);
const dup = await L.duplicateList((await L.renameList(mine.id, 'Ratti di nuovo')).id);
ok('la variante non eredita il palmares', (dup.formerNames || []).length === 0);

/* e la cavalcatura, dalla scheda della lista */
await L.addUnit(mine.id, { name: 'Grey Seer', models: 1, pts: 185 });
const i = L.getList(mine.id).units.length - 1;
L.getList(mine.id).units[i].slot = 'Characters';
L.getList(mine.id).units[i].stats = seer().stats;
await L.setMount(mine.id, i, 'screaming-bell');
ok('dalla scheda: sulla campana, 370 punti e la lista li conta',
   L.getList(mine.id).units[i].pts === 370 && L.getList(mine.id).points === 370);
await L.setMount(mine.id, i, null);
ok('e a piedi di nuovo, 185', L.getList(mine.id).units[i].pts === 185 && L.getList(mine.id).points === 185);

console.log(fails ? `\n${fails} FALLITE` : '\ntutte a posto');
process.exit(fails ? 1 : 0);
