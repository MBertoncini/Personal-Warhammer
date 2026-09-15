/* La Tappa 5: la psicologia.
 *
 * Panico con le sue cause, Paura, Terrore, Stupidita', Frenzy,
 * Impetuosita', la Warband che alza il Comando, Cold Blooded e Immune
 * to Psychology che cambiano il test, e il registro delle regole che
 * smette di dire «si gioca altrove» di quello che adesso si gioca.
 *
 * Come `test/tiro.mjs` e `test/mischia.mjs`, guarda dal lato dei
 * numeri: niente jsdom, niente pagina, solo moduli puri. Le frasi fra
 * virgolette nelle etichette sono quelle del testo delle regole che
 * le liste salvate portano con se'.
 *
 * Si lancia con:  node test/psicologia.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as PS from '../src/psych.js';
import * as MG from '../src/magic.js';
import * as C from '../src/combat.js';
import * as CH from '../src/charge.js';
import * as SH from '../src/shoot.js';
import * as EF from '../src/effects.js';
import { readRules, tallyUnknown } from '../src/rulebook.js';
import { createEngine } from '../src/engine.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};

const unit = (rules = [], extra = {}) => ({ name: 'Prova', rules, models: 10, ...extra });
const prof = (rules, opt) => PS.psychOf(unit(rules), opt);
/* una schiera da assalto, con il minimo che `combatant` legge */
const body = (over = {}) => ({
  name: 'Schiera', models: 10, frontage: 5, weapons: [], rules: [],
  stats: { WS: '3', BS: '3', S: '3', T: '3', W: '1', I: '3', A: '1', Ld: '7' },
  ...over,
});

/* ================================================================= */
console.log('le regole lette dalla lista');

ok('«Fear of Elves» non e «Fear»: un Orco non diventa uno che fa Paura',
   PS.psychRule('Fear of Elves').id === 'fearOfElves' && !prof(['Fear of Elves']).causesFear);
ok('chi fa Terrore fa anche Paura', prof(['Terror']).causesFear && prof(['Terror']).causesTerror);
ok('chi fa Paura ne e immune', prof(['Fear']).immuneFear);
ok('un personaggio unito che fa Paura la porta all unita',
   prof([], { joined: [unit(['Fear'])] }).causesFear);
ok('«ma non la rende immune alla Paura»',
   !prof([], { joined: [unit(['Fear'])] }).immuneFear);
ok('«la Stupidita e contagiosa»', prof([], { joined: [unit(['Stupidity'])] }).stupidity);
ok('la Frenzy persa non c e piu', !PS.psychOf(unit(['Frenzy'], { frenzyLost: true })).frenzy);
ok('un reggimento di Goblin e un reggimento di Goblin',
   PS.psychOf({ name: 'Night Goblin Mob', rules: [] }).goblin);
ok('«un Orco unito lo fa smettere di esserlo»',
   !PS.psychOf({ name: 'Goblin Mob', rules: [] }, { joined: [{ name: 'Orc Boss', rules: [] }] }).goblin);

/* ================================================================= */
console.log('\nil test di Comando e le regole che lo cambiano');

const cold = prof(['Cold Blooded']);
ok('Cold Blooded tira tre dadi sul Panico', PS.testDice('panic', cold)[0].n === 3);
ok('«e scarta il maggiore»: 6, 3, 4 fa 7', (() => {
  const t = PS.psychTest({ kind: 'panic', ld: 7, dice: [6, 3, 4], p: cold });
  return t.total === 7 && t.passed && t.kept.join() === '3,4';
})());
ok('ma sulla Stupidita tira due dadi come tutti', PS.testDice('stupidity', cold)[0].n === 2);
const imm = prof(['Immune To Psychology']);
ok('Immune to Psychology non tira il Panico', PS.testDice('panic', imm).length === 0 &&
   PS.psychTest({ kind: 'panic', ld: 3, p: imm }).passed);
ok('«non rende immuni a nessun altro test»: la Stupidita si tira',
   PS.testDice('stupidity', imm).length === 1);
ok('la Frenzy passa il Terrore da sola', PS.autoPass('terror', prof(['Frenzy'])).auto);
ok('il doppio uno passa sempre', PS.psychTest({ kind: 'fear', ld: 2, dice: [1, 1] }).passed);
ok('sopra il Comando si fallisce', !PS.psychTest({ kind: 'fear', ld: 7, dice: [5, 4] }).passed);

/* ================================================================= */
console.log('\nla Warband');

const wb = prof(['Warband']);
ok('somma al Comando il bonus di ranghi', PS.leadershipOf(7, wb, { rankBonus: 2 }).value === 9);
ok('«fino a Comando 10»', PS.leadershipOf(9, wb, { rankBonus: 3 }).value === 10);
ok('«salvo che stia fuggendo»', PS.leadershipOf(7, wb, { rankBonus: 2, fleeing: true }).value === 7);
ok('e non quando tira per l Impetuosita', PS.leadershipOf(7, wb, { rankBonus: 2, forImpetuous: true }).value === 7);
ok('chi non e Warband resta com e', PS.leadershipOf(7, prof([]), { rankBonus: 3 }).value === 7);
const orchi = C.combatant(body({ models: 15, rules: ['Warband'], stats: { ...body().stats, Ld: '6' } }));
ok('nel conto dell assalto: quindici Orchi su cinque di fronte tirano la rotta a 8',
   orchi.ld === 8 && orchi.ldBase === 6);
ok('in disordine i ranghi non ci sono, e il Comando non sale',
   C.combatant(body({ models: 15, rules: ['Warband'], disrupted: true, stats: { ...body().stats, Ld: '6' } })).ld === 6);

/* ================================================================= */
console.log('\nla Paura');

const gob = prof([]), troll = prof(['Fear']);
ok('chi e piu piccolo tira per caricare', PS.fearCheck({ me: gob, foe: troll, meUS: 10, foeUS: 12 }).must);
ok('chi e piu grosso no', !PS.fearCheck({ me: gob, foe: troll, meUS: 20, foeUS: 12 }).must);
ok('a pari Forza d Unita nemmeno: deve essere «piu alta»',
   !PS.fearCheck({ me: gob, foe: troll, meUS: 12, foeUS: 12 }).must);
ok('chi fa Paura non la teme', !PS.fearCheck({ me: troll, foe: troll, meUS: 3, foeUS: 12 }).must);
ok('«ma chi fa Paura teme chi fa Terrore»',
   PS.fearCheck({ me: troll, foe: prof(['Terror']), meUS: 3, foeUS: 6 }).must);
{
  const again = PS.fearCheck({ me: gob, foe: troll, meUS: 10, foeUS: 12, tested: { passed: false } });
  ok('«un solo test di Paura per turno»: vale quello di prima', !again.must && again.already && !again.passed);
}
ok('Fear of Elves: gli Elfi fanno Paura',
   PS.fearCheck({ me: prof(['Fear of Elves']), foe: PS.psychOf({ name: 'Elven Spearmen', rules: [] }),
                  meUS: 5, foeUS: 10 }).must);
{
  const a = C.combatant(body()), d = C.combatant(body());
  const pauroso = C.combatant(body(), { feared: true });
  ok('in mischia la Paura fallita toglie uno per colpire: AC 3 contro 3 da 4+ a 5+',
     C.strike(a, d).hit.need === 4 && C.strike(pauroso, d).hit.need === 5);
  ok('e la previsione lo sa', C.meleeForecast(pauroso, d).hitNeed === 5);
}

/* ================================================================= */
console.log('\nil Terrore');

const drago = prof(['Terror']);
ok('quando chi fa Terrore carica, il bersaglio tira', PS.terrorCheck({ charger: drago, target: gob, canFlee: true }).must);
ok('«chi non puo scegliere la fuga non fa il test»', !PS.terrorCheck({ charger: drago, target: gob, canFlee: false }).must);
ok('chi fa Terrore non lo teme', !PS.terrorCheck({ charger: drago, target: drago, canFlee: true }).must);
ok('Immune to Psychology non puo scegliere la fuga', !PS.canFleeReaction(imm).can);
ok('la Frenzy nemmeno', !PS.canFleeReaction(prof(['Frenzy'])).can);
{
  const r = CH.reactions({ dist: 8, chargerMove: 6, shots: 5, noFlee: 'Frenzy: non può scegliere la fuga' });
  ok('e la reazione Fugge si spegne con il perche accanto',
     r.find(x => x.id === 'flee').can === false && /Frenzy/.test(r.find(x => x.id === 'flee').why));
  const s = CH.reactions({ dist: 8, chargerMove: 6, shots: 5, mustHold: 'Stupidità: deve tenere' });
  ok('chi e in preda alla Stupidita puo solo tenere',
     s.filter(x => x.can).map(x => x.id).join() === 'hold');
}
ok('chi perde contro chi fa Terrore ha −1 al test di rotta',
   PS.terrorBreakMod({ winners: [drago], loser: gob }).mod === -1);
{
  /* un mostro che fa Terrore contro dieci goblin: prima o poi vince lui,
     e il test di rotta dei goblin deve portarsi dietro il −1 */
  const mostro = C.combatant(body({ name: 'Drago', models: 1, frontage: 1, rules: ['Terror'],
    stats: { WS: '6', BS: '0', S: '6', T: '6', W: '6', I: '6', A: '6', Ld: '8' } }));
  const goblin = C.combatant(body({ name: 'Goblin', stats: { ...body().stats, WS: '2', Ld: '6' } }));
  let test = null;
  for (let i = 0; i < 80 && !test; i++){
    const r = C.meleeRound(mostro, goblin);
    if (r.test && r.cr.loser === 'B') test = r.test;
  }
  ok('nel test di rotta vero il −1 c e', !!test && test.ldMod === -1);
}

/* ================================================================= */
console.log('\nil Panico');

ok('un amico distrutto entro 6″ manda al Panico', PS.panicCheck({ cause: 'destroyed', me: gob, dist: 4 }).must);
ok('oltre i 6″ no', !PS.panicCheck({ cause: 'destroyed', me: gob, dist: 6.5 }).must);
ok('chi fugge gia non tira', !PS.panicCheck({ cause: 'broke', me: gob, dist: 2, fleeing: true }).must);
ok('Immune to Psychology deve il test ma lo passa senza tirare', (() => {
  const c = PS.panicCheck({ cause: 'destroyed', me: imm, dist: 2 });
  return c.must && c.auto;
})());
const ip = prof(['Ignore Panic']);
ok('Ignore Panic: niente Panico per chi non ha la regola',
   !PS.panicCheck({ cause: 'broke', me: ip, source: gob, dist: 3 }).must);
ok('«che non ha anche lui questa regola»: fra due Ignore Panic il test si fa',
   PS.panicCheck({ cause: 'broke', me: ip, source: prof(['Ignore Panic']), dist: 3 }).must);
ok('Ignore Goblin Panic: per i Goblin niente',
   !PS.panicCheck({ cause: 'fledThrough', me: prof(['Ignore Goblin Panic']),
                    source: PS.psychOf({ name: 'Goblin Wolf Riders', rules: [] }) }).must);
ok('ma per gli Orchi si',
   PS.panicCheck({ cause: 'fledThrough', me: prof(['Ignore Goblin Panic']),
                   source: PS.psychOf({ name: 'Orc Mob', rules: [] }) }).must);
{
  const w = PS.panicAround({ cause: 'destroyed', source: gob, friends: [
    { name: 'vicini', p: gob, dist: 3 }, { name: 'lontani', p: gob, dist: 9 },
    { name: 'in fuga', p: gob, dist: 1, fleeing: true } ] });
  ok('l onda del Panico dice chi tira e chi no, e perche',
     w.tests.map(t => t.name).join() === 'vicini' && w.spared.length === 2 &&
     w.spared.every(s => s.check.why));
}

/* ================================================================= */
console.log('\nla Stupidita');

const stupido = prof(['Stupidity']);
ok('tira all inizio del turno chi non fugge e non combatte', PS.stupidityCheck({ p: stupido }).must);
ok('«salvo che stia fuggendo o sia in combattimento»',
   !PS.stupidityCheck({ p: stupido, engaged: true }).must && !PS.stupidityCheck({ p: stupido, fleeing: true }).must);
{
  const u = unit(['Stupidity']);
  EF.addEffect(u, PS.stupidEffect({ turn: 1, side: 'A' }));
  ok('fallito il test, ci resta', PS.psychOf(u, { now: { turn: 1, side: 'A' } }).stupid);
  ok('anche durante il turno dell avversario', PS.psychOf(u, { now: { turn: 1, side: 'B' } }).stupid);
  ok('«fino al suo prossimo inizio di turno»', !PS.psychOf(u, { now: { turn: 2, side: 'A' } }).stupid);
  ok('e lo spazzino degli effetti la toglie proprio li',
     EF.sweepExpired(u, { turn: 2, side: 'A' }).length === 1 && !EF.effectsOf(u).length);
}
ok('chi e in preda alla Stupidita non tira', SH.canShoot({ stupid: true }).can === false);
ok('e non carica', CH.canCharge({ stupid: true }).can === false);
/* e non lancia: il tiro e la carica lo sapevano, la magia no */
{
  const dardo = { id:'d1', type:'remaining', range:24 };
  const dove = { stepId:'remaining', phaseId:'movement' };
  ok('e non lancia incantesimi',
     MG.canCast(dardo, { ...dove, stupid: true }).can === false);
  ok('e lo dice con la sua ragione',
     /Stupidità/.test(MG.canCast(dardo, { ...dove, stupid: true }).why.join(' ')));
  ok('mentre chi non e stupido lancia', MG.canCast(dardo, dove).can === true);
}

/* ================================================================= */
console.log('\nFrenzy e Impetuous');

const fr = prof(['Frenzy']);
ok('+1 Attacchi nel turno in cui carica', PS.frenzyBonus({ p: fr, chargedThisTurn: true }).a === 1);
ok('e nel turno dopo un inseguimento', PS.frenzyBonus({ p: fr, followedUpLastTurn: true }).a === 1);
ok('altrimenti niente', PS.frenzyBonus({ p: fr }).a === 0);
ok('«se puo dichiarare una carica, deve»', PS.mustCharge({ p: fr }).must);
ok('chi non puo dichiarare non deve niente', !PS.mustCharge({ p: fr, canDeclare: false }).must);
ok('l Impetuosa tira per saperlo', PS.mustCharge({ p: prof(['Impetuous']) }).test);
{
  const d = C.combatant(body());
  const calmi = C.combatant(body({ charged: { inches: 1 } }));
  const furia = C.combatant(body({ rules: ['Frenzy'], charged: { inches: 1 } }));
  ok('nel conto: un attacco in piu per modello, anche con un pollice di corsa',
     C.contact(furia, d).attacks === C.contact(calmi, d).attacks + 5);
  ok('e se nel pannello si toglie «ha caricato» se ne va',
     C.contact(C.combatant(body({ rules: ['Frenzy'], charged: { inches: 1 } }), { charged: false }), d).attacks ===
     C.contact(calmi, d).attacks);
}
ok('«ogni modello che perde un round di combattimento la perde»', PS.losesFrenzy(fr) && !PS.losesFrenzy(gob));

/* ================================================================= */
console.log('\nil registro delle regole');

{
  const r = readRules(['Fear', 'Stupidity', 'Cold Blooded', 'Magical Attacks']);
  ok('la Paura entra nel conto di un assalto', r.applied.some(x => x.name === 'Fear'));
  ok('la Stupidita dice in quale casella si gioca',
     r.elsewhere.some(x => x.name === 'Stupidity' && /inizio del turno/.test(x.why)));
  ok('e nessuna delle quattro resta sconosciuta', r.unknown.length === 0);
}
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const liste = JSON.parse(fs.readFileSync(path.join(here, '..', 'dati', 'liste.json'), 'utf8'));
  const ignote = new Set();
  for (const l of liste) for (const u of l.units || [])
    for (const x of readRules(u.rules || []).unknown) ignote.add(x.name);
  ok('nelle liste salvate nessuna regola di psicologia resta fra le sconosciute',
     ![...ignote].some(n => PS.psychRule(n)));

  /* il contatore: le partite archiviate contano piu' delle liste, e una
     regola su tre unita' della stessa partita conta una partita sola */
  const conta = tallyUnknown([
    { kind: 'game', units: [{ rules: ['Regola Strana'] }, { rules: ['Regola Strana'] }] },
    { kind: 'game', units: [{ rules: ['Regola Strana', 'Altra Regola'] }] },
    { kind: 'list', units: [{ rules: ['Altra Regola'] }, { rules: ['Solo In Lista'] }] },
    { kind: 'list', units: [{ rules: ['Altra Regola', 'Fear'] }] },
  ]);
  ok('il contatore mette in cima la regola vista in piu partite',
     conta[0].name === 'Regola Strana' && conta[0].games === 2 && conta[0].units === 3);
  ok('poi quella che sta in piu liste', conta[1].name === 'Altra Regola' && conta[1].lists === 2);
  ok('e non conta le regole che l app conosce', !conta.some(x => x.name === 'Fear'));
  const vere = tallyUnknown(liste.map(l => ({ kind: 'list', units: l.units })));
  ok('sulle liste salvate il contatore torna un elenco in ordine',
     vere.length > 0 && vere.every((x, i) => i === 0 || vere[i - 1].lists >= x.lists));
}

/* ================================================================= */
console.log('\nil motore');

{
  const E = createEngine({ getNow: () => ({ turn: 1, side: 'A', step: 11 }) });
  for (const h of PS.HOOKS) E.on(h.moment, h.id, h.fn, h.from);
  const ask = PS.testDice('panic', cold);
  const wait = E.dispatch({ type: 'panic', unit: { name: 'Saurus' }, ask });
  ok('il Panico di chi ha Cold Blooded chiede tre dadi', wait.waiting && wait.ask[0].n === 3);
  const res = E.dispatch({ type: 'panic', unit: { name: 'Saurus' }, ask },
                         { panico: { dice: [6, 2, 3], kept: [2, 3], total: 5 } });
  ok('la traccia della riga dice perche erano tre', res.ok && res.trace.some(t => /Cold Blooded/.test(t.what)));
  ok('e la riga mostra i tre dadi e i due tenuti', /6 \+ 2 \+ 3 \(tengo 2 \+ 3\) = 5/.test(res.entry.text));
  const auto = E.dispatch({ type: 'panic', unit: { name: 'Saurus' }, ask: [], auto: true,
                            autoWhy: 'Immune to Psychology: passa senza tirare' });
  ok('chi passa da solo non fa rotolare niente, e lo scrive',
     auto.ok && /senza tirare/.test(auto.entry.text) && auto.trace.some(t => /Immune/.test(t.what)));
}
{
  const E = createEngine({ getNow: () => ({ turn: 1, side: 'A', step: 4 }) });
  const r = E.dispatch({ type: 'psych', kind: 'fear', label: 'test di Paura', unit: { name: 'Goblin' },
                         ask: PS.testDice('fear', gob) }, { paura: { dice: [5, 4], total: 9 } });
  ok('la Paura alla dichiarazione delle cariche e a casa sua', r.ok && !r.entry.note);
  ok('e la riga dice che test era', /Goblin: test di Paura — 5 \+ 4 = 9/.test(r.entry.text));
}

/* ================================================================= */
console.log('\ni promemoria');

ok('all inizio del turno ricorda la Stupidita',
   /Stupidità per Trolls/.test(PS.reminders(0, [{ name: 'Trolls', p: stupido }, { name: 'Goblin', p: gob }])));
ok('ma non a chi fugge', PS.reminders(0, [{ name: 'Trolls', p: stupido, fleeing: true }]) === '');
ok('alla dichiarazione delle cariche ricorda chi deve caricare e chi tira',
   (() => {
     const s = PS.reminders(4, [{ name: 'Fanatici', p: fr }, { name: 'Boyz', p: prof(['Impetuous']) }]);
     return /Frenzy\): Fanatici/.test(s) && /Impetuous\): Boyz/.test(s);
   })());
ok('nelle altre caselle tace', PS.reminders(9, [{ name: 'Trolls', p: stupido }]) === '');

console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
