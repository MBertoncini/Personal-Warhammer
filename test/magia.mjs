/* La Tappa 6: la magia, scritta sul libro.
 *
 * I domini, la generazione degli incantesimi, il tiro di lancio con
 * l'invocazione perfetta e il fiasco, il dissolvimento del mago e della
 * sorte, gli effetti che diventano effetti a tempo. Come
 * `test/psicologia.mjs`: niente jsdom, solo moduli puri e i dati veri.
 *
 * Si lancia con:  node test/magia.mjs
 */
import fs from 'node:fs';
import * as MG from '../src/magic.js';
import * as EF from '../src/effects.js';
import * as C from '../src/combat.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};

const doc = JSON.parse(fs.readFileSync(new URL('../dati/magia/domini.json', import.meta.url), 'utf8'));
const M = MG.makeMagic(doc);

/* ================================================================= */
console.log('i domini (pp. 319-335)');
ok('otto domini, come nel libro', M.lores.length === 8);
ok('sette incantesimi ciascuno: sei numerati e la firma',
   M.lores.every(l => l.spells.length === 7 &&
     [0, 1, 2, 3, 4, 5, 6].every(n => l.spells.filter(s => s.n === n).length === 1)));
ok('ogni incantesimo ha tipo, valore di lancio, gittata e pagina',
   M.all.every(s => MG.CAST_STEP[s.type] && s.cv >= 5 && s.range != null && (s.page || s.pdfPage)));
ok('e un effetto: applicabile, oppure a mano con la riga che dice cosa fare',
   M.all.every(s => s.effetto && (s.effetto.colpi || s.effetto.modifiche || s.effetto.modificheDado ||
                                  s.effetto.flag || s.effetto['a mano'])));
ok('un dominio si trova dal nome inglese, italiano o dall id',
   M.lore('Battle Magic').id === 'battle' && M.lore('Magia Waaagh!').id === 'waaagh' && M.lore('dark').id === 'dark');
ok('la firma della Magia da Battaglia e Hammerhand, 7+, in combattimento',
   (s => s.n === 0 && s.cv === 7 && s.range === 'combat' && s.type === 'assailment')(M.spell('hammerhand')));
ok('Fireball: dardo magico 8+ a 24 pollici, 2D6 colpi a Forza 4',
   (s => s.type === 'missile' && s.cv === 8 && s.range === 24 && MG.hitsOf(s).dadi === '2D6' && MG.hitsOf(s).S === 4)(M.spell('Fireball')));
ok('quattro innesti d esercito e un incantesimo vincolato', M.grafts.length === 4 && M.bound.length === 1);
ok('gli innesti li concede la regola del mago',
   M.graftsFor(['Lore of the Horned Rat']).map(g => g.id).join() === 'hornedRat' &&
   M.graftsFor(['Lore Of Lustria'])[0].spells.some(s => s.id === 'apotheosis'));
ok('il Beam of Chotec lo porta il Solar Engine, con Potere 2',
   M.boundFor(['Solar Engine'])[0].potere === 2);

/* ================================================================= */
console.log('\nil mago e i suoi incantesimi (p. 106)');
ok('il Livello viene dalla scheda', MG.levelOf({ rules: [] }, { level: 3 }) === 3);
ok('o dal nome di una regola', MG.levelOf({ rules: ['Level 2 Wizard'] }) === 2);
ok('senza nessuno dei due non si inventa', MG.levelOf({ rules: ['Lore of Gork'] }) === 0);
ok('ma chi ha un dominio e un mago', MG.isWizard({ rules: ['Lore of Gork'] }));
ok('la gittata del dissolvimento: 18 fino al Livello 2, 24 dal 3',
   MG.dispelRange(1) === 18 && MG.dispelRange(2) === 18 && MG.dispelRange(3) === 24 && MG.dispelRange(4) === 24);

const g = MG.generateSpells({ level: 2, dice: [3, 3, 5] });
ok('tanti dadi quanti il Livello, e i doppioni si ritirano',
   g.numbers.join() === '3,5' && g.rerolled.join() === '3' && g.done);
ok('se i dadi non bastano lo dice', MG.generateSpells({ level: 3, dice: [2, 2] }).need === 2);
const swaps = MG.swapOptions(M, 'waaagh', ['Lore of Gork']);
ok('si scambia con la firma, o con gli incantesimi del dominio d esercito',
   swaps[0].id === 'fistOfGork' && swaps.some(s => s.id === 'gazeOfGork'));
const known = MG.knownSpells(M, 'waaagh', [1, 3], [{ out: 'badMoonRizin', into: 'fistOfGork' }]);
ok('e gli incantesimi conosciuti tengono lo scambio',
   known.map(s => s.id).join() === 'vindictiveGlare,fistOfGork');
ok('nessuno conosce due volte lo stesso',
   MG.knownSpells(M, 'waaagh', [1, 3], [{ out: 'badMoonRizin', into: 'vindictiveGlare' }]).length === 2 &&
   MG.knownSpells(M, 'waaagh', [1, 3], [{ out: 'badMoonRizin', into: 'vindictiveGlare' }])[1].id === 'badMoonRizin');

/* ================================================================= */
console.log('\nquando si lancia (p. 108)');
const hex = M.spell('wordOfPain'), fire = M.spell('fireball'), hammer = M.spell('hammerhand');
ok('una maledizione nella congiurazione si', MG.canCast(hex, { stepId: 'conjuration', phaseId: 'strategy' }).can);
ok('un dardo magico nel tiro si', MG.canCast(fire, { stepId: 'pick', phaseId: 'shooting' }).can);
ok('un dardo magico nella congiurazione no, e dice dove',
   MG.canCast(fire, { stepId: 'conjuration', phaseId: 'strategy' }).why.some(w => /fase di tiro/.test(w)));
ok('chi fugge non lancia', MG.canCast(hex, { stepId: 'conjuration', fleeing: true }).why.some(w => /fugge/.test(w)));
ok('in combattimento solo assalti e «self»',
   !MG.canCast(hex, { stepId: 'conjuration', engaged: true }).can &&
   MG.canCast(hammer, { phaseId: 'combat', engaged: true }).can &&
   MG.canCast(M.spell('oakenShield'), { stepId: 'conjuration', engaged: true }).can);
ok('un incantesimo una volta per turno',
   MG.canCast(hex, { stepId: 'conjuration', castThisTurn: ['wordOfPain'] }).why.some(w => /una volta per turno/.test(w)));
ok('e dopo il fiasco basta', MG.canCast(hex, { stepId: 'conjuration', stopped: true }).why.some(w => /fiasco/.test(w)));

ok('una maledizione non va su un amico', MG.targetCheck(hex, { friendly: true, dist: 5 }).why.some(w => /nemiche/.test(w)));
ok('fuori gittata lo dice con i pollici', MG.targetCheck(hex, { dist: 19.2 }).why.some(w => /19\.2″ contro 18″/.test(w)));
ok('un bersaglio in combattimento no, salvo che l incantesimo lo permetta',
   MG.targetCheck(fire, { dist: 10, engaged: true }).ok === false &&
   MG.targetCheck(hex, { dist: 10, engaged: true }).ok === true);
ok('un dardo vuole la vista, una maledizione no',
   !MG.targetCheck(fire, { dist: 10, sight: false }).ok && MG.targetCheck(hex, { dist: 10, sight: false }).ok);
ok('un assalto solo su chi combatte con il mago',
   !MG.targetCheck(hammer, { touching: false }).ok && MG.targetCheck(hammer, { touching: true }).ok);

/* ================================================================= */
console.log('\nil tiro di lancio (pp. 108-109)');
/* l'esempio del libro: Livello 2, 1 e 6, fa 9 */
const es = MG.castResult({ dice: [1, 6], level: 2, cv: 9 });
ok('2D6 piu il Livello: l esempio del libro fa 9, e lancia un 9+', es.total === 9 && es.cast);
ok('sotto il valore non si lancia', !MG.castResult({ dice: [1, 6], level: 1, cv: 9 }).cast);
const perf = MG.castResult({ dice: [6, 6], level: 1, cv: 20 });
ok('il doppio 6 lancia comunque, ed e perfetto', perf.cast && perf.perfect);
const fiasco = MG.castResult({ dice: [1, 1], level: 4, cv: 5 });
ok('il doppio 1 e fiasco anche quando basterebbe', fiasco.miscast && !fiasco.cast);
const legato = MG.castResult({ dice: [1, 1], cv: 9, bound: true, power: 2 });
ok('un incantesimo vincolato somma il Potere e non ha fiasco', legato.total === 4 && !legato.miscast);
ok('ne invocazione perfetta', !MG.castResult({ dice: [6, 6], cv: 9, bound: true, power: 2 }).perfect);
ok('il Drain Magic alza il valore di due',
   MG.castResult({ dice: [3, 4], level: 1, cv: 7 }).cast && !MG.castResult({ dice: [3, 4], level: 1, cv: 7, cvUp: 2 }).cast);
ok('l Apotheosis sa se ha fatto 12', MG.castResult({ dice: [5, 5], level: 2, cv: 10, cv2: 12 }).tier2 &&
   !MG.castResult({ dice: [5, 4], level: 2, cv: 10, cv2: 12 }).tier2);

ok('la tabella del fiasco ha cinque righe da 2 a 12',
   MG.MISCAST.length === 5 && MG.MISCAST[0].from === 2 && MG.MISCAST[4].to === 12);
ok('col 7 il mago prende un colpo a Forza 4', MG.miscastRead(7).id === 'careless' && MG.miscastRead(7).hit.S === 4);
ok('con 8-9 si lancia lo stesso e la magia del turno finisce',
   MG.miscastRead(9).cast && MG.miscastRead(9).stop && !MG.miscastRead(9).perfect);
ok('con 10-12 e un invocazione perfetta', MG.miscastRead(12).perfect && MG.miscastRead(12).stop);
ok('surclassati nel dissolvimento, un 8 dissolve e un 11 slega',
   MG.miscastRead(8, { dispel: true }).dispelled && MG.miscastRead(11, { dispel: true }).unbinding);

/* ================================================================= */
console.log('\nil dissolvimento (p. 110)');
ok('il pari non dissolve: il testo vuole «supera»',
   !MG.dispelResult({ dice: [4, 3], level: 2, castTotal: 9 }).dispelled && MG.DISPEL_TIES === false);
ok('superare si', MG.dispelResult({ dice: [4, 4], level: 2, castTotal: 9 }).dispelled);
ok('la sorte non somma il Livello', !MG.dispelResult({ dice: [4, 4], level: 2, fated: true, castTotal: 9 }).dispelled);
ok('il doppio 6 slega qualunque tiro', MG.dispelResult({ dice: [6, 6], fated: true, castTotal: 20 }).dispelled);
ok('ma non un invocazione perfetta', !MG.dispelResult({ dice: [6, 6], castTotal: 12, perfect: true }).dispelled);
ok('il doppio 1 di un mago lo fa surclassare', MG.dispelResult({ dice: [1, 1], level: 4, castTotal: 2 }).outclassed);
ok('quello della sorte no', !MG.dispelResult({ dice: [1, 1], fated: true, castTotal: 2 }).outclassed);
ok('nei turni dopo si dissolve contro il valore di lancio',
   MG.dispelResult({ dice: [5, 5], later: true, cv: 9, castTotal: 14 }).dispelled);
ok('e l invocazione perfetta non protegge piu',
   MG.dispelResult({ dice: [5, 5], later: true, cv: 9, perfect: true }).dispelled);

/* ================================================================= */
console.log('\ngli effetti (p. 111)');
const at = { turn: 2, side: 'A' };
const pain = MG.effectOf(hex, { at });
ok('Word of Pain: −1 Forza e Resistenza fino al prossimo inizio turno',
   pain.mods.S === -1 && pain.mods.T === -1 && pain.until === 'ownTurn' && pain.kind === 'hex');
ok('Hammerhand non e un effetto: sono colpi', MG.effectOf(hammer) === null &&
   (h => h.dadi === '2D3' && h.S === 4 && h.AP === 2)(MG.hitsOf(hammer)));
const moon = MG.effectOf(M.spell('badMoonRizin'), { at, rolled: 2 });
ok('Bad Moon Rizin toglie il D3 uscito', moon.mods.WS === -2 && moon.mods.I === -2 && moon.until === 'turn');
ok('Oaken Shield va sul mago e sulla sua unita', MG.selfAndUnit(M.spell('oakenShield')));
ok('i dadi si leggono', (d => d.n === 1 && d.die === 3 && d.plus === 3)(MG.parseDice('D3+3')) &&
   (d => d.n === 3 && d.die === 3)(MG.parseDice('3D3')) && MG.diceTotal(MG.parseDice('D6+1'), [4]) === 5);

const reggimento = { name: 'Orc Mob', stats: { M: '4', WS: '3', BS: '3', S: '3', T: '4', W: '1', I: '2', A: '1', Ld: '7' },
                     models: 20, frontage: 5, armour: 5, ward: 0, rules: [], weapons: [], lost: 0 };
EF.addEffect(reggimento, pain);
ok('e l effetto sposta la caratteristica vera', EF.val(reggimento, 'T') === 3);
ok('e lo scontro la sente: la schiera ha Resistenza 3', C.combatant(reggimento).t === 3);
const storm = MG.effectOf(M.spell('stormCall'), { at });
ok('Storm Call fa finire le altre maledizioni', MG.cancelled(M.spell('stormCall'), EF.effectsOf(reggimento)).join() === 'spell:wordOfPain' &&
   storm.mods.M === -1);
ok('Plague of Rust su chi non ha armatura non fa niente',
   MG.skipOn(M.spell('plagueOfRust'), { armour: 0 }) && !MG.skipOn(M.spell('plagueOfRust'), { armour: 5 }));

const scudo = MG.effectOf(M.spell('oakenShield'), { at });
const nudo = { stats: {}, ward: 0 }, protetto = { stats: {}, ward: 4 };
EF.addEffect(nudo, scudo); EF.addEffect(protetto, scudo);
ok('la salvezza 5+ regalata vale per chi non ne ha', EF.val(nudo, 'ward') === 5);
ok('e non peggiora un 4+ che c era gia', EF.val(protetto, 'ward') === 4);

const vessel = { ...reggimento, effects: [], weapons: [{ name: 'Hand weapon', range: '' }] };
EF.addEffect(vessel, MG.effectOf(M.spell('daemonicVessel'), { at }));
const cv = C.combatant(vessel), bersaglio = C.combatant({ ...reggimento, effects: [] });
ok('Daemonic Vessel alza Forza e Attacchi, e la perforazione entra nei colpi',
   cv.s === 4 && cv.a === 2 && C.strike(cv, bersaglio, { attacks: 4 }).ap === 1);

/* ================================================================= */
console.log('\nfin dove arriva la magia di un pezzo');
{
  /* Il caso vero: un Bastiladon con il Solar Engine. Il giavellotto
     arriva a otto pollici, il raggio a ventiquattro, e il cerchio sul
     tavolo mostrava gli otto — cioe' il numero sbagliato proprio a chi
     stava decidendo dove metterlo. */
  const regole = ['Close Order', 'Cold Blooded', 'Solar Radiance', 'Solar Engine'];
  const vincolati = M.boundFor(regole);
  ok('la regola dell oggetto porta con se l incantesimo',
     vincolati.length === 1 && vincolati[0].name === 'Beam of Chotec');
  ok('e la sua gittata e quella dell incantesimo, non dell arma',
     MG.magicRange(vincolati).range === 24);
  ok('senza la regola non c e nessun vincolato', M.boundFor(['Close Order']).length === 0);

  ok('la gittata piu lunga vince fra piu incantesimi',
     MG.magicRange([{ name:'corto', range:12 }, { name:'lungo', range:30 }]).range === 30);
  ok('«sé» e «mischia» non sono un cerchio da disegnare',
     MG.magicRange([{ name:'a', range:'self' }, { name:'b', range:'combat' }]) === null);
  ok('e nemmeno una lista vuota', MG.magicRange([]) === null);

  /* e il bersaglio fuori portata lo dice con il numero */
  const sp = vincolati[0];
  ok('a trenta pollici e fuori gittata', MG.targetCheck(sp, { dist: 30 }).ok === false);
  ok('e il perche porta i due numeri',
     /30″ contro 24″/.test(MG.targetCheck(sp, { dist: 30 }).why.join(' ')));
  ok('a dodici ci arriva', MG.targetCheck(sp, { dist: 12 }).ok === true);
  ok('ma un dardo magico vuole vedere il bersaglio (p. 107)',
     MG.targetCheck(sp, { dist: 12, sight: false }).ok === false);
  ok('e si lancia nella fase di tiro', MG.whenOk(sp.type, { phaseId:'shooting' }).ok === true);
}

/* ================================================================= */
console.log('\nquello che serve all arbitro per offrire un incantesimo');
{
  /* Livello 2 contro 8+: servono 6 o piu' su due dadi, 26 esiti su 36;
     il doppio 1 e' fuori, e ci rientra una volta su tre abbondante
     dalla tabella del fiasco (8-12, 15 esiti su 36) */
  const o = MG.castOdds({ level: 2, cv: 8 });
  ok('Livello 2 contro 8+: lancia 26 volte su 36, più il fiasco che lancia lo stesso',
     Math.abs(o.cast - (26 + 15 / 36) / 36) < 1e-9);
  ok('il doppio 1 è il fiasco, una volta su 36', Math.abs(o.miscast - 1 / 36) < 1e-9);
  ok('contro un 20+ lanciano solo il doppio 6 e il fiasco che va bene', Math.abs(MG.castOdds({ level: 1, cv: 20 }).cast - (1 + 15 / 36) / 36) < 1e-9);
  ok('un vincolato non ha fiasco', MG.castOdds({ bound: true, power: 2, cv: 9 }).miscast === 0);

  /* la sorte contro un 9: serve PIU' di 9 (p. 110), cioe' 10, 11 o 12 */
  const f = MG.dispelOdds({ fated: true, against: 9 });
  ok('la sorte contro un 9 dissolve 6 volte su 36, e non surclassa mai',
     Math.abs(f.dispel - 6 / 36) < 1e-9 && f.outclassed === 0);
  const w = MG.dispelOdds({ level: 3, against: 9 });
  ok('un Livello 3 contro un 9 dissolve con 7 o più, e il doppio 1 lo manda sulla tabella',
     Math.abs(w.outclassed - 1 / 36) < 1e-9 && Math.abs(w.dispel - (21 + 15 / 36) / 36) < 1e-9);
  ok('il doppio 6 slega anche contro un 20', Math.abs(MG.dispelOdds({ fated: true, against: 20 }).dispel - 1 / 36) < 1e-9);

  ok('in media 2D3 fa 4 colpi, D6+1 ne fa 4 e mezzo, 3 ne fa 3',
     MG.diceMean(MG.parseDice('2D3')) === 4 && MG.diceMean(MG.parseDice('D6+1')) === 4.5 &&
     MG.diceMean(MG.parseDice('3')) === 3);

  ok('Fireball e Word of Pain l app li applica', MG.applies(M.spell('fireball')) && MG.applies(M.spell('wordOfPain')));
  ok('un vortice e un trasporto no: sono testo da leggere',
     !MG.applies(M.spell('pillarOfFire')) && !MG.applies(M.spell('arcaneUrgency')));
  ok('e nemmeno un dardo che è una linea di 5D6 pollici', !MG.applies(M.spell('gazeOfGork')));
}

console.log('\ni maghi del libro, che il file non descrive');
{
  const nob = M.wizardBook({ name: 'Night Goblin Oddnob' });
  ok('un Night Goblin Oddnob è Livello 3, Illusion o Waaagh! (Ravening Hordes, p. 18)',
     nob && nob.livello === 3 && nob.domini.join() === 'illusion,waaagh' && nob.page === 18);
  ok('e porta Lore of Mork, che la lista salvata non scrive', nob.regole.includes('Lore of Mork'));
  const prete = M.wizardBook({ name: 'Skink Priest' });
  ok('uno Skink Priest è Livello 1 (Legends: Lizardmen, p. 4), e il Livello 2 è un opzione',
     prete.livello === 1 && /Livello 2/.test(prete.opzione) && prete.page === 4);
  ok('lo Slann si trova anche al plurale del file', M.wizardBook({ name: 'Slann Mage-Priests' }).livello === 4);
  ok('un Warlock Engineer è mago solo se l ha pagato', M.wizardBook({ name: 'Warlock Engineer' }).livello === 0);
  ok('ogni dominio nominato esiste', M.wizards.every(w => w.domini.every(d => M.lore(d))));
  ok('ogni scheda dice libro e pagina', M.wizards.every(w => w.libro && w.page > 0));
  ok('e chi non è nel libro non è un mago per sbaglio', M.wizardBook({ name: 'Saurus Warriors' }) === null);
}

/* ================================================================= */
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
