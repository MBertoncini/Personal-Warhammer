/* La Tappa 3: il corpo a corpo del manuale.
 *
 * Il bonus di Iniziativa della carica, il risultato del combattimento
 * con tutte le sue voci, il test di rotta a tre esiti, l'inseguimento
 * e le sfide. Come `test/movimento.mjs` guarda la carica dal lato del
 * tavolo, questo guarda l'assalto dal lato dei numeri: niente jsdom,
 * niente pagina, solo moduli puri.
 *
 * Si lancia con:  node test/mischia.mjs
 */
import * as ML from '../src/melee.js';
import * as C from '../src/combat.js';
import { readRules } from '../src/rulebook.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;

const unit = (name, st, models, frontage, extra = {}) => ({
  name, stats: st, models, frontage, us: models, weapons: [], rules: [], lost: 0, ...extra });

/* ================================================================= */
console.log('il bonus di Iniziativa della carica (p. 146)');

ok('un pollice intero vale un punto', ML.chargeInitiative(1).bonus === 1);
ok('i mezzi pollici non contano', ML.chargeInitiative(2.9).bonus === 2);
ok('di fronte il tetto e tre', ML.chargeInitiative(9, 'fronte').bonus === 3);
ok('di fianco e di retro e quattro',
   ML.chargeInitiative(9, 'fianco').bonus === 4 && ML.chargeInitiative(9, 'retro').bonus === 4);
ok('e il tetto raggiunto viene detto', ML.chargeInitiative(9, 'fronte').capped === true);
/* la carica disordinata costa esattamente questo bonus: e' la seconda
   meta' di una regola che la Tappa 2 sapeva gia' riconoscere */
ok('la carica disordinata lo azzera',
   ML.chargeInitiative(6, 'fronte', { disordered: true }).bonus === 0);
ok('senza carica non c e niente da sommare', ML.chargeInitiative(0).bonus === 0);

console.log('\nchi mena per primo');
const lento = { i: 2, flags: {} };
const svelto = { i: 4, flags: {} };
ok('a parita di tutto mena il piu svelto', ML.strikeOrder(lento, svelto).first === 'B');
const carica = { i: 2, flags: {}, charged: true, chargeInches: 5, chargeArc: 'fronte' };
ok('ma tre pollici di carica ribaltano l ordine',
   ML.strikeOrder(carica, svelto).first === 'A' && ML.strikeOrder(carica, svelto).a.i === 5);
ok('l arma che colpisce per ultima scavalca tutto',
   ML.strikeOrder({ ...carica, flags: { strikeLast: true } }, svelto).first === 'B');
ok('e quella che colpisce per prima anche',
   ML.strikeOrder(lento, { ...svelto, flags: { strikeLast: true } }).first === 'A');
ok('pari Iniziativa vuol dire insieme', ML.strikeOrder(lento, { i: 2, flags: {} }).together === true);

/* ================================================================= */
console.log('\nil risultato del combattimento');

const base = { wounds: 0, models: 20, frontage: 5, maxRank: 3 };
ok('i ranghi si contano sulle file piene', ML.combatScore(base).rank === 3);
ok('il tipo di truppa mette il tetto', ML.combatScore({ ...base, maxRank: 1 }).rank === 1);
/* pp. 101 e 152: l'ordine di combattimento vale un punto, e mancava */
ok('in ordine di combattimento si prende un punto',
   ML.combatScore({ ...base, combatOrder: true }).order === 1 &&
   ML.combatScore({ ...base, combatOrder: true }).total === ML.combatScore(base).total + 1);
ok('un reggimento largo e in ordine di combattimento',
   ML.inCombatOrder({ models: 20, frontage: 5, rules: [] }) === true);
ok('una colonna no', ML.inCombatOrder({ models: 20, frontage: 2, rules: [] }) === false);
ok('gli schermagliatori no', ML.inCombatOrder({ models: 10, frontage: 5, rules: ['Skirmishers'] }) === false);
ok('un mostro solo si', ML.inCombatOrder({ models: 1, frontage: 1, rules: [] }) === true);
/* il disordine da terreno della Tappa 2 arriva qui, ed e' la prima
   volta che costa qualcosa a qualcuno */
ok('un quarto dei modelli nel bosco toglie i ranghi',
   ML.combatScore({ ...base, disrupted: true }).rank === 0);
ok('lo stendardo vale uno', ML.combatScore({ ...base, standard: true }).std === 1);
ok('lo stendardo da battaglia vale un altro uno, e si sommano',
   ML.combatScore({ ...base, standard: true, battleStandard: true }).total === 3 + 1 + 1);
ok('il fianco vale uno e il retro due',
   ML.combatScore({ ...base, flank: 'flank' }).flank === 1 &&
   ML.combatScore({ ...base, flank: 'rear' }).flank === 2);
ok('fianco e retro da due unita diverse si sommano (p. 153)',
   ML.combatScore({ ...base, flank: 'both' }).flank === 3);
ok('il terreno piu alto vale uno', ML.combatScore({ ...base, highGround: true }).ground === 1);
/* La superiorita' numerica era il bonus dell'edizione di prima, e
   nell'elenco del manuale non c'e': spenta, e dietro una costante sola
   per chi la ritrova sulla pagina. */
ok('essere in piu non vale niente',
   ML.combatScore({ ...base, us: 40 }, { us: 5 }).out === 0 &&
   ML.OUTNUMBER_COUNTS === false);
ok('e il totale e la somma delle voci scritte',
   ML.combatScore({ ...base, wounds: 2, standard: true, flank: 'rear' }).total === 2 + 3 + 1 + 2);

const forte = { ...base, wounds: 4 }, debole = { ...base, models: 5, wounds: 1 };
const cr = ML.combatResult(forte, debole);
ok('vince chi ha il totale piu alto', cr.winner === 'A' && cr.loser === 'B');
ok('e lo scarto e la differenza', cr.diff === ML.combatScore(forte).total - ML.combatScore(debole).total);
const pari = ML.combatResult({ ...base, wounds: 1 }, { ...base, wounds: 1, musician: true });
ok('il musico non aggiunge un punto: rompe la parita',
   pari.loser === 'A' && pari.tie === 'B' && pari.diff === 0);

/* ================================================================= */
console.log('\nil test di rotta a tre esiti (p. 154)');

/* Comando 8: il naturale passa a 8 o meno, il modificato ci aggiunge
   lo scarto del combattimento. */
ok('sotto il Comando anche con lo scarto: cede terreno',
   ML.breakOutcome({ ld: 8, diff: 2, dice: [3, 3] }).outcome === 'give');
ok('naturale si e modificato no: ripiega in ordine',
   ML.breakOutcome({ ld: 8, diff: 3, dice: [4, 4] }).outcome === 'fallBack');
ok('naturale no: rotta',
   ML.breakOutcome({ ld: 8, diff: 0, dice: [5, 5] }).outcome === 'rout');
ok('il doppio uno passa sempre',
   ML.breakOutcome({ ld: 4, diff: 9, dice: [1, 1] }).outcome === 'give');
/* la cosa che i tre esiti cambiano davvero, e che al tavolo sorprende:
   perdere di molto non fa scappare di piu', fa ripiegare invece di
   cedere terreno */
ok('lo scarto non cambia la probabilita di rotta',
   near(ML.breakChances(8, 1).rout, ML.breakChances(8, 8).rout, 1e-9));
ok('ma sposta il cedere terreno sul ripiegare',
   ML.breakChances(8, 1).give > ML.breakChances(8, 8).give &&
   ML.breakChances(8, 8).fallBack > ML.breakChances(8, 1).fallBack);
ok('le tre probabilita fanno uno', (() => {
  const c = ML.breakChances(7, 4);
  return near(c.give + c.fallBack + c.rout, 1, 1e-9);
})());
ok('e sono quelle vere: con Comando 7 e scarto 3 si cede una volta su sei',
   near(ML.breakChances(7, 3).give, 6 / 36, 1e-9));

/* le due regole speciali che saltano il test, e il testo che lo dice
   sta dentro le liste salvate */
const unbr = ML.breakOutcome({ ld: 6, diff: 5, unbreakable: true });
ok('Unbreakable non tira e cede terreno',
   unbr.outcome === 'give' && unbr.tested === false);
const stub = ML.breakOutcome({ ld: 6, diff: 5, stubbornNow: true });
ok('Stubborn salta il test e ripiega in ordine',
   stub.outcome === 'fallBack' && stub.tested === false);
ok('e non sono piu quelle di prima nel registro delle regole',
   /saltare il test/.test(readRules(['Stubborn']).applied[0].what) &&
   /cede terreno/.test(readRules(['Unbreakable']).applied[0].what));

/* la Forza d'Unita' piu' che doppia: dedotta dal testo di Stubborn,
   dichiarata come tale */
ok('il doppio di Forza d Unita si riconosce',
   ML.crushingUS(21, 10) === true && ML.crushingUS(20, 10) === false);
const crush = ML.breakOutcome({ ld: 8, diff: 3, dice: [4, 4], crushed: true });
ok('e toglie il ripiegamento in ordine',
   crush.outcome === 'rout' && crush.daVerificare === true);
ok('ma non toglie il cedere terreno',
   ML.breakOutcome({ ld: 8, diff: 1, dice: [3, 3], crushed: true }).outcome === 'give');

/* ================================================================= */
console.log('\ninseguimento e sfondamento (p. 156)');

ok('chi insegue almeno quanto l altro fugge lo travolge',
   ML.pursuitOutcome({ roll: 8, flee: 8 }).caught === true);
ok('un pollice meno e si salva',
   ML.pursuitOutcome({ roll: 7, flee: 8 }).caught === false);
ok('senza piu nessuno davanti si sfonda',
   ML.pursuitOutcome({ roll: 7, wiped: true }).kind === 'overrun');
ok('e chi non insegue non si muove',
   ML.pursuitOutcome({ roll: 7, flee: 3, canPursue: false }).kind === 'none');
/* il tiro e' quello della fuga, non quello della carica: due dadi
   sommati, e il passo lungo ne aggiunge un terzo (p. 178) */
ok('si tirano due dadi e si sommano tutti',
   ML.pursuitDice(false).n === 2 && ML.pursuitDice(false).keep === 2);
ok('e con il passo lungo tre', ML.pursuitDice(true).n === 3 && ML.pursuitDice(true).keep === 3);

/* ================================================================= */
console.log('\nle sfide');

ok('le ferite in piu di quelle che bastavano contano', ML.overkill(5, 2).counted === 3);
ok('quelle che bastavano appena non contano niente', ML.overkill(2, 2).counted === 0);
/* il tetto c'e' ed e' cinque (p. 152): la costante era a zero — nessun
   tetto — con scritto accanto che il numero non era stato letto sul
   libro. Adesso lo e', e otto punti di overkill ne fanno cinque. */
ok('l overkill si ferma a cinque, e lo dice',
   ML.overkill(9, 1).counted === 5 && ML.overkill(9, 1).extra === 8 &&
   ML.overkill(9, 1).capped === true && ML.overkill(9, 1).daVerificare === false &&
   /il tetto è \+5/.test(ML.overkill(9, 1).why));
ok('sotto il tetto si contano tutte', ML.overkill(5, 2).counted === 3);
ok('una sfida rifiutata resta una riga di registro',
   /rifiutata/.test(ML.challenge({ from:'Grimgor', to:'Kroq-Gar', accepted:false }).text));

/* ================================================================= */
console.log('\nl assalto intero, con quello che la Tappa 3 ha cambiato');

const guardia = unit('Guardia del Tempio',
  { M:'4',WS:'4',BS:'0',S:'4',T:'4',W:'1',I:'2',A:'1',Ld:'8' }, 10, 5, { armour: 4 });
const mostro = unit('Carro',
  { M:'8',WS:'3',BS:'0',S:'5',T:'5',W:'4',I:'3',A:'3',Ld:'7' }, 1, 1,
  { armour: 4, rules: ['Impact Hits (D6+1)', 'Stomp Attacks (D3)'] });

const m = C.combatant(mostro, { charged: true, chargeInches: 8 });
ok('urto e pestone convivono su un mostro solo',
   m.flags.impact.die === 6 && m.flags.stomp.die === 3);
const assalto = C.meleeRound(m, C.combatant(guardia));
const labels = assalto.steps.filter(s => s.side === 'A').map(s => s.label);
ok('l urto della carica arriva per primo', labels[0] === 'urto della carica');
ok('e i pestoni per ultimi, dopo tutti gli altri attacchi',
   labels[labels.length - 1] === 'pestoni');
/* la Forza non modificata: l'urto e i pestoni usano quella del
   modello, non quella dell'arma che impugna */
const lancia = C.combatant(unit('Cavalleria',
  { M:'8',WS:'3',BS:'0',S:'3',T:'3',W:'1',I:'3',A:'1',Ld:'7' }, 5, 5,
  { rules: ['Impact Hits (2)'], weapons: [{ name:'Lance', S:'S+2', ap:'-1' }] }),
  { charged: true, chargeInches: 6 });
ok('la lancia alza la Forza dei colpi', lancia.s === 5 && lancia.baseS === 3);
const conLancia = C.meleeRound(lancia, C.combatant(guardia));
ok('ma non quella dell urto',
   conLancia.steps.find(s => s.label === 'urto della carica').strength === 3);

/* l'Odio non e' un test di psicologia: e' un ritiro dei colpi mancati
   nel primo assalto, e prima finiva fra le regole "che si giocano
   altrove" */
const odio = C.combatant(unit('Nani',
  { M:'3',WS:'4',BS:'3',S:'3',T:'4',W:'1',I:'2',A:'1',Ld:'9' }, 20, 5,
  { rules: ['Hatred (Orcs)'] }));
ok('l Odio viene letto e applicato', odio.flags.hatred === true);
ok('e non e piu elencato come psicologia',
   odio.rulesRead.applied.some(x => /Hatred/.test(x.name)));
const colpi = C.strike(odio, C.combatant(guardia), { attacks: 200, round: 1 });
ok('nel primo assalto i mancati si ritirano', colpi.hit.rerolled > 0);
ok('e nel secondo no',
   C.strike(odio, C.combatant(guardia), { attacks: 200, round: 2 }).hit.rerolled === 0);
ok('il ritiro alza la media, e la previsione lo sa',
   C.meleeForecast(odio, C.combatant(guardia)).wounds >
   C.meleeForecast(C.combatant({ ...odio.ref, rules: [] }), C.combatant(guardia)).wounds);

/* la sfida: le ferite in piu' entrano nel risultato */
const eroe = C.combatant(unit('Eroe',
  { M:'4',WS:'6',BS:'0',S:'5',T:'4',W:'2',I:'5',A:'4',Ld:'9' }, 1, 1, { armour: 4 }),
  { forcedAttacks: 4 });
const vittima = C.combatant(unit('Campione',
  { M:'4',WS:'3',BS:'0',S:'3',T:'3',W:'1',I:'2',A:'1',Ld:'7' }, 1, 1),
  { forcedAttacks: 1 });
let visto = false;
for (let i = 0; i < 200 && !visto; i++){
  const s = C.meleeRound(eroe, vittima, { challenge: true });
  if (s.cr.A.overkill > 0) visto = true;
}
ok('in una sfida l overkill finisce nel risultato', visto);

/* ================================================================= */
console.log('\nle ferite che restano appese');
{
  const prof = { M:'6',WS:'3',BS:'0',S:'5',T:'5',W:'4',I:'2',A:'3',Ld:'8' };
  const mostro = unit('Bastiladon', prof, 1, 1, { armour: 3 });
  ok('senza ferite segnate la schiera parte intera', C.combatant(mostro).spill === 0);
  /* il tavolo segna le ferite sull'unita' (`u.wounds`): la schiera le
     trovava sempre a zero, ed e' il punto in cui evaporavano */
  const ferito = { ...mostro, wounds: 3 };
  ok('le ferite segnate dal tavolo arrivano nella schiera', C.combatant(ferito).spill === 3);
  const toll = C.woundsToll(ferito, 1);
  ok('la quarta ferita stende il modello', toll.kills === 1 && toll.left === 0);
  ok('e la quinta ricomincia ad appendersi',
     C.woundsToll({ ...mostro, wounds: 3, models: 2 }, 2).left === 1);
  ok('mentre senza niente addosso tre ferite su quattro non stendono nessuno',
     C.woundsToll(mostro, 3).kills === 0 && C.woundsToll(mostro, 3).left === 3);
  /* e dentro un assalto: quello che resta appeso torna sulla schiera,
     e chi tiene lo stato lo riscrive sull'unita' */
  const picchiatore = C.combatant(unit('Saurus', { M:'4',WS:'4',BS:'0',S:'4',T:'4',W:'1',I:'2',A:'2',Ld:'8' }, 20, 5));
  let visto = false;
  for (let k = 0; k < 60 && !visto; k++){
    const r = C.meleeFight([picchiatore], [C.combatant(mostro)]);
    const b = r.sides.B[0];
    if (b.models > 0 && b.spill > 0) visto = true;
  }
  ok('a fine assalto le ferite non completate restano sulla schiera', visto);
  /* niente si perde per strada: quelle che aveva addosso piu' quelle
     appena passate fanno i modelli caduti piu' quelle che restano */
  let quadra = true;
  for (let k = 0; k < 40; k++){
    const r = C.meleeFight([picchiatore], [C.combatant({ ...mostro, models: 3, wounds: 3 })]);
    const b = r.sides.B[0];
    const caduti = 3 - b.models;
    if (3 + r.done.A !== caduti * b.w + b.spill) quadra = false;
  }
  ok('e il conto quadra: quelle che aveva piu quelle passate fanno i caduti piu il resto', quadra);
}

/* ================================================================= */
console.log('\nil combattimento a piu di due (p. 153)');
{
  const prof = { M:'4',WS:'3',BS:'3',S:'3',T:'3',W:'1',I:'3',A:'1',Ld:'7' };
  const reg = (name, models, frontage, extra = {}) => unit(name, prof, models, frontage, extra);

  /* chi mena per primo quando sono in tre: un ordine solo, non due a due */
  const passi = ML.strikeSteps([{ i: 2, flags: {} }, { i: 5, flags: {} }, { i: 2, flags: {} }]);
  ok('gli scaglioni vanno dal piu svelto al piu lento',
     passi.length === 2 && passi[0].i === 5 && passi[0].at[0] === 1);
  ok('e chi ha la stessa Iniziativa mena insieme',
     passi[1].at.join(',') === '0,2' && passi[1].together === true);
  const scavalco = ML.strikeSteps([{ i: 1, flags: {} }, { i: 6, flags: { strikeLast: true } }]);
  ok('l arma che colpisce per ultima scavalca l Iniziativa anche qui',
     scavalco.length === 2 && scavalco[0].at[0] === 0 && scavalco[1].at[0] === 1);

  /* la prima fila divisa fra chi si ha davanti */
  ok('cinque di fila contro due nemici fanno tre e due',
     C.frontShares(5, 2).join(',') === '3,2');
  ok('e a chi resta senza modelli davanti non tocca niente',
     C.frontShares(3, 4).join(',') === '1,1,1,0');

  /* chi tocca chi */
  const sol = C.combatant(reg('Uno', 20, 5));
  const due = C.combatant(reg('Due', 10, 5));
  const tre = C.combatant(reg('Tre', 10, 5));
  ok('senza contatti dichiarati tutti toccano tutti',
     JSON.stringify(C.engagements([sol], [due, tre]).A) === '[[0,1]]');
  ok('e la dichiarazione si legge per nome',
     JSON.stringify(C.engagements([{ ...sol, vs: ['Tre'] }], [due, tre]).A) === '[[1]]');
  /* «Niente piu' nemici» (p. 158): restare senza nessuno davanti e' una
     situazione del manuale, non un errore. Chi ci resta non mena e non
     viene menato, ma il suo stendardo e i suoi ranghi contano ancora. */
  ok('e chi resta senza nemici davanti resta senza',
     JSON.stringify(C.engagements([{ ...sol, vs: ['Tre'] }], [due, tre]).B) === '[[],[0]]');
  ok('il contatto e reciproco anche se lo dice uno solo',
     JSON.stringify(C.engagements([sol], [{ ...due, vs: ['Uno'] }, { ...tre, vs: [] }]).B) === '[[0],[0]]');
  ok('un nome scritto male non fa sparire nessuno dal combattimento',
     JSON.stringify(C.engagements([{ ...sol, vs: ['Quattro'] }], [due, tre]).A) === '[[0,1]]');
  ok('la fetta di fila divide gli attacchi, non li raddoppia',
     C.contact(sol, due, { frontage: 3 }).attacks + C.contact(sol, tre, { frontage: 2 }).attacks
     === C.contact(sol, due).attacks);

  /* il conto sul gruppo: quattro voci hanno una regola loro */
  const card = (c, w, foe) => ML.scoreCardOf(c, w, { foe });
  const largo = card(C.combatant(reg('Largo', 20, 5)), 0, '#0');
  const corto = card(C.combatant(reg('Corto', 6, 5)), 0, '#0');
  ok('i ranghi non si sommano: vale il piu alto',
     ML.sideScore([largo, corto]).rank === ML.combatScore(largo).rank &&
     ML.combatScore(largo).rank > ML.combatScore(corto).rank);
  const conStendardo = { ...largo, standard: true }, altroStendardo = { ...corto, standard: true };
  ok('due stendardi valgono uno',
     ML.sideScore([conStendardo, altroStendardo]).std === 1);
  ok('ma lo stendardo da battaglia si somma allo stendardo',
     ML.sideScore([{ ...conStendardo, battleStandard: true }, altroStendardo]).std === 1 &&
     ML.sideScore([{ ...conStendardo, battleStandard: true }, altroStendardo]).bsb === 1);
  ok('l ordine di combattimento invece si conta per ognuna, e il manuale lo dice',
     ML.sideScore([largo, corto]).order === 2);
  ok('le ferite si sommano',
     ML.sideScore([card(C.combatant(reg('A', 5, 5)), 2, '#0'),
                   card(C.combatant(reg('B', 5, 5)), 3, '#0')]).wounds === 5);
  /* il fianco: una volta per nemico, non una per chi attacca */
  const fianco = (nome, foe) => ({ ...card(C.combatant(reg(nome, 5, 5), { flank: 'flank' }), 0, foe),
                                   flank: 'flank' });
  ok('due unita sullo stesso fianco valgono un punto solo',
     ML.sideScore([fianco('X', '#0'), fianco('Y', '#0')]).flank === 1);
  ok('ma sul fianco di due nemici diversi valgono due',
     ML.sideScore([fianco('X', '#0'), fianco('Y', '#1')]).flank === 2);
  ok('e fianco e retro sullo stesso nemico si sommano',
     ML.sideScore([fianco('X', '#0'),
                   { ...card(C.combatant(reg('Y', 5, 5)), 0, '#0'), flank: 'rear' }]).flank === 3);
  /* il terreno piu' alto: uno solo, e se sono in alto tutti e due si annulla */
  const alto = { ...largo, highGround: true };
  ok('il terreno piu alto lo prende una parte sola',
     ML.sideScore([alto, { ...corto, highGround: true }], [largo]).ground === 1);
  ok('e se sono in alto tutte e due si annulla',
     ML.sideScore([alto], [{ ...corto, highGround: true }]).ground === 0 &&
     ML.sideScore([alto], [{ ...corto, highGround: true }]).groundTied === true);
  ok('con una unita per parte il conto del gruppo e quello di sempre',
     ML.sideScore([largo], [corto]).total === ML.combatScore(largo, corto).total);
  ok('e il musico rompe la parita anche quando ce l ha una sola del gruppo (p. 201)',
     ML.combatResult([largo, { ...corto, musician: true }], [largo, corto]).tie === 'A' &&
     ML.combatResult([largo, corto], [largo, corto]).tie === '');

  /* l'assalto vero, in tre */
  const orchi = C.combatant(reg('Orc Mob', 20, 5), { charged: true, chargeInches: 5 });
  const lupi  = C.combatant(unit('Wolf Riders', { ...prof, I:'4' }, 5, 5), { charged: true, chargeInches: 6, flank: 'flank' });
  const saurus = C.combatant(unit('Saurus', { ...prof, T:'4', WS:'4' }, 20, 5,
                                  { armour: 4, command: { standard: true } }));
  const tre1 = C.meleeFight([orchi, lupi], [saurus]);
  ok('in tre si mena in un ordine solo, dal piu svelto al piu lento',
     tre1.order.steps.map(s => s.at.join('')).join('|') === '1|0|2');
  ok('e chi e in mezzo a due nemici divide la sua fila',
     (() => { const suoi = tre1.steps.filter(s => s.side === 'B' && s.label === 'colpi');
       return suoi.length === 2 && suoi.reduce((s, x) => s + x.attacks, 0) ===
              C.contact(saurus, orchi).attacks; })());
  ok('le perdite si segnano unita per unita, e il totale le somma',
     tre1.kills.A.length === 2 && tre1.killsA === tre1.kills.A[0] + tre1.kills.A[1]);
  ok('e ogni colpo dice da chi parte e dove arriva',
     tre1.steps.every(s => s.name && s.foe && s.at != null));

  /* il test di rotta lo tira ogni unita' della parte che perde */
  const guardia3 = () => C.combatant(unit('Guardia', { ...prof, WS:'5', S:'5', A:'2' }, 20, 5, { armour: 3 }));
  let inTre = null;
  for (let k = 0; k < 200 && !inTre; k++){
    const r = C.meleeFight([C.combatant(reg('Leva A', 10, 5)), C.combatant(reg('Leva B', 10, 5))], [guardia3()]);
    if (r.cr.loser === 'A' && r.tests.length === 2) inTre = r;
  }
  ok('ogni unita della parte che perde tira il suo test, con il suo nome',
     !!inTre && inTre.tests.every(t => t.side === 'A') &&
     inTre.tests[0].name !== inTre.tests[1].name);
  let morti = true;
  for (let k = 0; k < 60; k++){
    const r = C.meleeFight([C.combatant(reg('Viva', 10, 5)),
                            { ...C.combatant(reg('Morta', 10, 5)), models: 0 }], [guardia3()]);
    if (r.tests.some(t => t.name === 'Morta') || r.steps.some(s => s.name === 'Morta' || s.foe === 'Morta'))
      morti = false;
  }
  ok('chi non ha piu nessuno in piedi non mena e non tira il test', morti);
  ok('la parte e finita solo quando sono finite tutte le sue unita',
     C.meleeFight([{ ...C.combatant(reg('Viva', 5, 5)) }, { ...C.combatant(reg('Morta', 5, 5)), models: 0 }],
                  [C.combatant(reg('Nemico', 5, 5))]).wiped === '');

  /* l'urto della carica si tira una volta e si divide: un D6 per ogni
     nemico davanti sarebbe un urto moltiplicato */
  const carro = unit('Carro', { M:'8',WS:'3',BS:'0',S:'5',T:'5',W:'4',I:'3',A:'3',Ld:'7' }, 1, 1,
                     { armour: 4, rules: ['Impact Hits (D6+1)'] });
  let urtiOk = true;
  for (let k = 0; k < 60; k++){
    const r = C.meleeFight([C.combatant(carro, { charged: true, chargeInches: 8 })],
                           [C.combatant(reg('Fanti A', 10, 5)), C.combatant(reg('Fanti B', 10, 5))]);
    const urti = r.steps.filter(s => s.label === 'urto della carica')
                        .reduce((s, x) => s + x.attacks, 0);
    if (urti < 2 || urti > 7) urtiOk = false;
  }
  ok('l urto contro due nemici resta un D6+1, diviso fra i due', urtiOk);

  /* e l'assalto a due, chiamato come sempre, torna quello di sempre */
  const a2 = C.meleeRound(C.combatant(reg('Uno', 20, 5)), C.combatant(reg('Due', 20, 5)));
  ok('un assalto a due torna le due schiere e un test solo',
     a2.a && a2.b && !Array.isArray(a2.a) && (a2.test === null || a2.test === a2.tests[0]));
}

/* ================================================================= */
console.log('\nil capo dentro il reggimento (p. 209)');
{
  const prof = { M:'4',WS:'3',BS:'3',S:'3',T:'3',W:'1',I:'3',A:'1',Ld:'7' };
  const regg = C.combatant(unit('Orc Mob', prof, 20, 5));
  const eroe = C.combatant(unit('Orc Big Boss', { ...prof, WS:'6', S:'5', T:'4', W:'3', A:'4', Ld:'9' }, 1, 1,
                                { armour: 4 }), { attached: true, shielded: true });
  const nemico = C.combatant(unit('Saurus', { ...prof, T:'4' }, 20, 5, { armour: 4 }));

  /* mena: era gia' cosi', ed e' la meta' che funzionava */
  const r = C.meleeFight([regg, eroe], [nemico]);
  ok('il capo unito mena insieme al reggimento',
     r.steps.some(s => s.name === 'Orc Big Boss' && s.label === 'colpi'));
  ok('ma nessuno lo colpisce, se non ci dirige i colpi apposta',
     !r.steps.some(s => s.foe === 'Orc Big Boss'));
  ok('e infatti non prende ferite', r.sides.A[1].models === 1 && r.sides.A[1].spill === 0);

  /* e quando il nemico ce li dirige, muore come tutti */
  const mirato = C.combatant(unit('Saurus', { ...prof, T:'4' }, 20, 5, { armour: 4 }));
  mirato.vs = ['Orc Big Boss'];
  let colpito = false;
  for (let k = 0; k < 40 && !colpito; k++){
    const r2 = C.meleeFight([regg, eroe], [mirato]);
    if (r2.steps.some(s => s.foe === 'Orc Big Boss')) colpito = true;
  }
  ok('chi dirige i colpi sul capo lo colpisce', colpito);

  /* il conto: il capo porta le sue ferite e la sua Forza d Unita,
     non un secondo bonus di ranghi ne un secondo stendardo */
  const card = ML.scoreCardOf(eroe, 2);
  ok('il capo unito non porta ranghi', ML.combatScore(card).rank === 0);
  ok('ne ordine di combattimento', card.combatOrder === false);
  ok('ne il fianco del reggimento',
     ML.scoreCardOf({ ...eroe, flank: 'flank' }, 0).flank === '');
  ok('ma porta le sue ferite', ML.combatScore(card).wounds === 2);
  ok('e lo stendardo da battaglia resta suo (p. 152)',
     ML.scoreCardOf({ ...eroe, flags: { ...eroe.flags, battleStandard: true } }, 0).battleStandard === true);
  const conCapo = ML.sideScore([ML.scoreCardOf(regg, 0, { foe: '#0' }), ML.scoreCardOf(eroe, 0, { foe: '#0' })]);
  const senza = ML.sideScore([ML.scoreCardOf(regg, 0, { foe: '#0' })]);
  ok('e la parte non guadagna punti solo perche il capo e li',
     conCapo.total === senza.total);
  ok('la sua Forza d Unita invece si somma a quella del reggimento (p. 207)',
     conCapo.us === senza.us + eroe.usPer * 1);

  /* urto e pestoni non arrivano al capo, salvo reggimento ridotto */
  const carro = C.combatant(unit('Carro', { M:'8',WS:'3',BS:'0',S:'5',T:'5',W:'4',I:'3',A:'3',Ld:'7' }, 1, 1,
                                 { rules: ['Impact Hits (D6+1)', 'Stomp Attacks (D3)'] }),
                            { charged: true, chargeInches: 8 });
  carro.vs = ['Orc Big Boss', 'Orc Mob'];
  let urtoSulCapo = false;
  for (let k = 0; k < 40; k++){
    const r3 = C.meleeFight([regg, eroe], [carro]);
    if (r3.steps.some(s => s.foe === 'Orc Big Boss' &&
                           (s.label === 'urto della carica' || s.label === 'pestoni'))) urtoSulCapo = true;
  }
  ok('urto e pestoni non si dirigono sul capo con il reggimento intero', !urtoSulCapo);
  let urtoScoperto = false;
  const scoperto = { ...eroe, exposed: true };
  for (let k = 0; k < 40 && !urtoScoperto; k++){
    const r4 = C.meleeFight([regg, scoperto], [carro]);
    if (r4.steps.some(s => s.foe === 'Orc Big Boss' && s.label === 'urto della carica')) urtoScoperto = true;
  }
  ok('ma con meno di cinque modelli di truppa si (p. 209)', urtoScoperto);
}

/* ================================================================= */
console.log('\nil capo che occupa un posto, nell assalto a gruppi (p. 207)');
{
  const prof = { M:'4',WS:'3',BS:'3',S:'3',T:'3',W:'1',I:'2',A:'1',Ld:'7' };
  const capoU = unit('Orc Big Boss', { ...prof, WS:'6', S:'5', T:'4', W:'3', I:'4', A:'4', Ld:'9' }, 1, 1,
                     { uid: 42, armour: 4 });
  const mobU = unit('Orc Mob', prof, 20, 5, { uid: 41 });
  const nemico = C.combatant(unit('Saurus', { ...prof, T:'4' }, 20, 5, { armour: 4 }));
  const colpiDi = (r, nome) => r.steps.filter(s => s.name === nome && s.label === 'colpi')
                                      .reduce((n, s) => n + s.attacks, 0);

  /* chi chiama con il reggimento soltanto: il capo diventa una schiera
     unita da se', in fondo alla parte */
  const mob = C.combatant(mobU, { joined: [capoU] });
  const r = C.meleeFight([mob], [nemico]);
  ok('il capo della lista diventa una schiera unita', r.sides.A.length === 2 && r.sides.A[1].attached === true);
  ok('in fondo alla parte, cosi le posizioni di chi chiama restano quelle', r.sides.A[0].name === 'Orc Mob');
  ok('la truppa mena con un posto in meno', colpiDi(r, 'Orc Mob') === 4 * 1 + 5);
  ok('e il capo con i suoi quattro attacchi', colpiDi(r, 'Orc Big Boss') === 4);
  ok('nessuno lo colpisce se non ci dirige i colpi', !r.steps.some(s => s.foe === 'Orc Big Boss'));

  /* chi chiama con il capo gia' messo, come il pannello e l'arbitro:
     non se ne fa un secondo */
  const eroe = C.combatant(capoU, { attached: true, shielded: true });
  const r2 = C.meleeFight([mob, eroe], [nemico]);
  ok('se il capo c e gia non si raddoppia', r2.sides.A.length === 2);
  ok('ma il posto lo occupa lo stesso', colpiDi(r2, 'Orc Mob') === 9 && colpiDi(r2, 'Orc Big Boss') === 4);

  /* il tavolo dice che il nemico tocca il reggimento: il capo ci sta
     dentro, e quindi tocca anche lui — prima il pannello lo lasciava
     fuori dalla mischia senza dirlo */
  const dichiarato = { ...nemico, vs: ['Orc Mob'] };
  const r2b = C.meleeFight([mob, eroe], [dichiarato]);
  ok('chi tocca il reggimento tocca anche il capo che ci sta dentro', colpiDi(r2b, 'Orc Big Boss') === 4);
  ok('ma non lo colpisce per questo', !r2b.steps.some(s => s.foe === 'Orc Big Boss'));

  /* il tavolo ha visto che il capo non tocca: e' nella mischia e non mena */
  const lontano = C.combatant(mobU, { joined: [capoU], touching: { models: 3, chars: [] } });
  const r3 = C.meleeFight([lontano], [nemico]);
  ok('il capo che non tocca non mena', colpiDi(r3, 'Orc Big Boss') === 0);
  ok('e i soldati menano con quelli che toccano davvero', colpiDi(r3, 'Orc Mob') === 3 + 3);

  /* Il capo unito sta dentro il reggimento (p. 207): se la parte
     perde, il test di rotta lo tira il reggimento, e lui va dove va il
     reggimento. Nella sfida Michele contro Gemini la Temple Guard
     ripiegava in ordine con lo Stubborn e il suo Scar-Veteran — il
     generale — tirava da solo, rompeva e lasciava il tavolo. */
  const ogre = C.combatant(unit('Ogri', { ...prof, WS:'4', S:'5', T:'5', W:'3', A:'4', Ld:'8' }, 12, 4));
  let perse = 0, soloIlReggimento = true;
  for (let i = 0; i < 40; i++){
    const rr = C.meleeFight([C.combatant(mobU, { joined: [capoU] })], [ogre]);
    if (rr.cr.loser !== 'A' || rr.wiped) continue;
    perse++;
    if (rr.tests.some(t => rr.sides.A[t.at].attached)) soloIlReggimento = false;
  }
  ok('quando la parte perde, il capo unito non tira un test suo', perse > 0 && soloIlReggimento);
  ok('e il reggimento lo tira con il Comando del capo (p. 97)',
     C.combatant(mobU, { joined: [capoU] }).ld === 9 && C.combatant(mobU).ld === 7);
  /* ma se del reggimento non resta nessuno, il capo e' di nuovo
     un'unita' da sola, e il test lo tira lui */
  const pochi = unit('Orc Mob', prof, 1, 1, { uid: 41 });
  let tiraLui = false;
  for (let i = 0; i < 60 && !tiraLui; i++){
    const rr = C.meleeFight([C.combatant(pochi, { joined: [capoU] })], [ogre]);
    if (rr.cr.loser === 'A' && rr.sides.A[0].models <= 0 && rr.sides.A[1].models > 0)
      tiraLui = rr.tests.some(t => rr.sides.A[t.at].attached);
  }
  ok('se il reggimento non c e piu, il capo il test lo tira', tiraLui);

  /* due nemici davanti, e il tavolo sa quanti ne toccano ciascuno */
  const due = [C.combatant(unit('Fanti A', prof, 10, 5, { uid: 51 })),
               C.combatant(unit('Fanti B', prof, 10, 5, { uid: 52 }))];
  const misurato = C.combatant(mobU, { touchingVs: { 51: { models: 4, chars: [] }, 52: { models: 1, chars: [] } } });
  const r4 = C.meleeFight([misurato], due);
  const su = nome => r4.steps.filter(s => s.name === 'Orc Mob' && s.foe === nome && s.label === 'colpi')
                             .reduce((n, s) => n + s.attacks, 0);
  ok('con le basette contate la fila non si divide a meta', su('Fanti A') === 4 + 4 && su('Fanti B') === 1 + 1);
  const stimato = C.meleeFight([C.combatant(mobU)], due);
  const su2 = nome => stimato.steps.filter(s => s.name === 'Orc Mob' && s.foe === nome && s.label === 'colpi')
                                   .reduce((n, s) => n + s.attacks, 0);
  ok('senza, resta la divisione in parti uguali', su2('Fanti A') === 3 + 3 && su2('Fanti B') === 2 + 2);
}

/* ================================================================= */
console.log('\nle regole dei tre eserciti di casa (Tappa 5 bis)');
{
  const fs = await import('node:fs');
  const dir = new URL('../dati/eserciti/', import.meta.url);
  const idx = JSON.parse(fs.readFileSync(new URL('indice.json', dir), 'utf8'));
  const AR = await import('../src/armies.js');
  const EFm = await import('../src/effects.js');
  AR.useArmies(AR.makeArmies(idx.file.map(f => JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')))));

  const prof = { M:'4',WS:'3',BS:'3',S:'3',T:'4',W:'1',I:'2',A:'1',Ld:'7' };
  const hand = [{ name: 'Hand weapon', range: '', S: '', AP: '' }];
  const muro = C.combatant(unit('Muro', { ...prof, WS:'3', T:'3' }, 20, 5));

  const orco = (extra = {}) => unit('Orc Mob', prof, 20, 5,
    { faction: 'Orc and Goblin Tribes', rules: ['Choppas'], weapons: hand, ...extra });
  const carica = C.combatant(orco(), { charged: true, chargeInches: 6 });
  const ferma  = C.combatant(orco());
  ok('la Choppa si riconosce dal file degli Orchi, non e piu sconosciuta',
     ferma.rulesRead.applied.some(x => x.name === 'Choppas') && !ferma.rulesRead.unknown.length);
  const colpiC = C.strike(carica, muro, { attacks: 300 });
  ok('in carica perfora di uno in piu', colpiC.ap === ferma.ap + 1 &&
     colpiC.notes.some(n => /Choppas: perforazione \+1/.test(n)));
  ok('e ritira gli 1 per ferire, e lo scrive', colpiC.notes.some(n => /Choppas: \d+ 1 per ferire ritirat/.test(n)));
  const colpiF = C.strike(ferma, muro, { attacks: 300 });
  ok('senza carica niente', colpiF.ap === ferma.ap && !colpiF.notes.some(n => /Choppas/.test(n)));
  ok('e la previsione la conta', C.meleeForecast(carica, muro, 20).wounds > C.meleeForecast(ferma, muro, 20).wounds);
  ok('l urto non passa dalla Choppa',
     C.strike(carica, muro, { attacks: 10, auto: true, strength: 3 }).ap === ferma.ap);
  ok('senza il file d esercito la Choppa torna sconosciuta',
     C.combatant(orco({ faction: '' })).rulesRead.unknown.some(x => x.name === 'Choppas'));

  const ratto = w => C.combatant(unit('Clanrats', prof, 20, 5,
    { faction: 'Skaven', rules: ['Warpstone Weapons', 'Scurry Away'], weapons: w }));
  ok('le armi di warpstone perforano di uno con l arma a una mano',
     C.strike(ratto(hand), muro, { attacks: 5 }).ap === 1);
  const conAlabarda = ratto([{ name: 'Halberd', range: '', S: 'S+1' }]);
  const alabarda = C.strike(conAlabarda, muro, { attacks: 5 });
  ok('con un alabarda no, e lo dice', alabarda.ap === conAlabarda.ap &&
     alabarda.notes.some(n => /solo con l'arma a una mano/.test(n)));
  ok('la Scurry Away da +1 alla fuga, con il suo nome',
     C.fleeBonusOf({ faction: 'Skaven', rules: ['Scurry Away'] }).mod === 1 &&
     /Scurry Away \+1/.test(C.fleeBonusOf({ faction: 'Skaven', rules: ['Scurry Away'] }).why));
  ok('e chi non ce l ha fugge come sempre', C.fleeBonusOf({ faction: 'Skaven', rules: [] }).mod === 0);

  const slann = C.combatant(unit('Slann', prof, 1, 1, { faction: 'Lizardmen', rules: ['Arcane Shield'] }));
  ok('l Arcane Shield da la salvezza speciale 5+ che il file non dichiara', slann.ward === 5 && slann.wardFrom === 'Arcane Shield');
  const slann4 = C.combatant(unit('Slann', prof, 1, 1, { faction: 'Lizardmen', rules: ['Arcane Shield'], ward: 4 }));
  ok('e non peggiora una salvezza migliore', slann4.ward === 4);

  /* quaranta in file da dieci: quattro file, tre dietro la prima. In
     file da cinque sarebbero una colonna di marcia, che non prende
     ranghi (p. 101). */
  const goblin = h => C.combatant(unit('Night Goblin Mob', prof, 40, 10,
    { troop: 'Regular Infantry', rules: h ? ['Horde'] : [] }));
  ok('Horde alza di uno il tetto dei ranghi', ML.combatScore(ML.scoreCardOf(goblin(true), 0)).rank === 3);
  ok('senza Horde il tetto resta quello della fanteria, +2', ML.combatScore(ML.scoreCardOf(goblin(false), 0)).rank === 2);

  const bastiladon = C.combatant(unit('Bastiladon', prof, 1, 1, { rules: ['Impervious Defence'] }));
  const fianco = C.combatant(unit('Cavalieri', prof, 5, 5), { flank: 'flank' });
  const crI = C.resolution(fianco, bastiladon, { A: 0, B: 0 });
  ok('chi prende di fianco l Impervious Defence non ne ha il punto', crI.A.flank === 0 &&
     crI.A.flankDenied === 'Impervious Defence');
  ok('e contro chi non ce l ha il punto c e',
     C.resolution(fianco, C.combatant(unit('Altro', prof, 1, 1)), { A: 0, B: 0 }).A.flank === 1);

  const scudo = ML.breakOutcome({ ld: 7, diff: 3, dice: [3, 3], shieldwall: true });
  ok('Shieldwall trasforma il ripiegamento in cedimento, e lo scrive',
     scudo.outcome === 'give' && scudo.shieldwall && /Shieldwall/.test(scudo.text));
  ok('ma non tocca la rotta', ML.breakOutcome({ ld: 7, diff: 3, dice: [5, 6], shieldwall: true }).outcome === 'rout');
  ok('e le probabilita lo sanno',
     ML.breakChances(7, 3, { shieldwall: true }).fallBack === 0 &&
     ML.breakChances(7, 3, { shieldwall: true }).give > ML.breakChances(7, 3).give);
  const guardia2 = unit('Temple Guard', prof, 20, 5, { rules: ['Shieldwall'] });
  ok('lo Shieldwall speso non torna', (() => { EFm.spend(guardia2, 'shieldwall');
    return C.combatant(guardia2).shieldwallUsed === true; })());

  const boss = unit('Black Orc Mob', prof, 20, 5, { faction: 'Orc and Goblin Tribes', weapons: hand });
  EFm.addEffect(boss, AR.toEffect(AR.armiesNow().find('Orc and Goblin Tribes').rules.find(r => r.id === 'waaagh'),
                                  AR.armiesNow().find('Orc and Goblin Tribes')));
  const urlando = C.combatant(boss);
  ok('il Waaagh! acceso e un +1 al risultato', ML.combatScore(ML.scoreCardOf(urlando, 0)).rule === 1);
  ok('e ritira gli 1 per colpire, dicendo chi', C.strike(urlando, muro, { attacks: 300 }).notes
     .some(n => /Waaagh! — Orchi e Goblin: \d+ 1 per colpire ritirat/.test(n)));
  AR.useArmies(null);
}

/* ================================================================= */
console.log('\ngli schermagliatori non stanno in file (p. 101)');
{
  const skink = { name:'Skink', models:10, frontage:5, rules:['Move Through Cover', 'Skirmishers'],
                  troop:{ maxRank:2, perRank:5 } };
  const card = ML.scoreCardOf(skink, 1);
  ok('dieci schermagliatori su due file non prendono il bonus di ranghi',
     card.maxRank === 0 && ML.combatScore(card).rank === 0);
  ok('e nemmeno l ordine di combattimento', !card.combatOrder);
  const orchi = ML.scoreCardOf({ ...skink, name:'Orchi', rules:['Close Order'] }, 1);
  ok('dieci fanti in ordine chiuso il rango lo prendono', ML.combatScore(orchi).rank === 1);
}

/* ================================================================= */
console.log('\nla sfida, come duello vero (pp. 211-212)');
{
  /* Le due schiere sono due personaggi uniti a due reggimenti: e' il
     caso normale al tavolo, e l'unico in cui la sfida cambia davvero
     qualcosa — un capo dentro un reggimento, senza sfida, lo colpisce
     solo chi ci dirige i colpi (p. 209), e con la sfida non lo colpisce
     piu' nessuno tranne il rivale. */
  const truppa = st => unit('Truppa', st, 10, 5);
  const capo = (nome, st, extra = {}) => unit(nome, st, 1, 1, extra);
  const stTruppa = { M:'4',WS:'3',BS:'0',S:'3',T:'3',W:'1',I:'3',A:'1',Ld:'7' };
  const stCapo   = { M:'4',WS:'6',BS:'0',S:'5',T:'4',W:'3',I:'6',A:'4',Ld:'9' };
  const stVittima= { M:'4',WS:'3',BS:'0',S:'3',T:'3',W:'2',I:'2',A:'2',Ld:'8' };

  const schiere = () => {
    const rA = C.combatant(truppa(stTruppa));
    const rB = C.combatant(truppa(stTruppa));
    const cA = C.combatant(capo('Kroq-Gar', stCapo));
    const cB = C.combatant(capo('Grimgor', stVittima));
    cA.attached = true; cA.shielded = true; cA.hostAt = 0;
    cB.attached = true; cB.shielded = true; cB.hostAt = 0;
    return { A: [rA, cA], B: [rB, cB] };
  };

  const { A, B } = schiere();
  const duello = C.meleeFight(A, B, { challenge: { a: 1, b: 1 } });
  const colpi = duello.steps;
  const daiDue = colpi.filter(s => s.name === 'Kroq-Gar' || s.name === 'Grimgor');
  ok('i due sfidanti si dirigono i colpi solo addosso (p. 212)',
     daiDue.length > 0 && daiDue.every(s => s.foe === (s.name === 'Kroq-Gar' ? 'Grimgor' : 'Kroq-Gar')));
  ok('e nessun altro mena addosso a loro due',
     !colpi.some(s => s.name === 'Truppa' && (s.foe === 'Kroq-Gar' || s.foe === 'Grimgor')));
  ok('la truppa continua a menare alla truppa',
     colpi.some(s => s.name === 'Truppa' && s.foe === 'Truppa'));
  ok('lo sfidante porta tutti i suoi attacchi, non uno solo',
     (colpi.find(s => s.name === 'Kroq-Gar') || {}).attacks === 4);

  /* l'overkill si conta sulle ferite che il rivale aveva ADDOSSO
     quando la sfida e' cominciata, non su quelle di tutta la sua
     parte: prima `challenge: true` le sommava su tutto il gruppo, e
     un campione da una ferita dentro un reggimento da dieci non
     lasciava mai un punto di overkill */
  let visto = false, senza = false;
  for (let i = 0; i < 300 && !(visto && senza); i++){
    const s = schiere();
    const r = C.meleeFight(s.A, s.B, { challenge: { a: 1, b: 1 } });
    if (r.sides.A[1].overkill > 0) visto = true;
    if (r.sides.A[0].overkill > 0) senza = true;
  }
  ok('chi vince la sfida porta l overkill al suo conto', visto);
  ok('e la truppa, che non duella, non ne porta mai', !senza);

  /* p. 212: la cavalcatura dirige i colpi sul rivale, e se il rivale
     e' gia' caduto li tira lo stesso — contano per l'overkill */
  const dorso = capo('Carnosauro', stCapo,
    { mountId:'carnosauro',
      mount: { name:'Carnosaur', row:'Carnosaur',
               righe:[{ chi:'Carnosaur', n:1, stats:{ WS:'3', S:'7', I:'2', A:'3' } }] } });
  ok('la cavalcatura di chi duella mena al rivale e a nessun altro', (() => {
    const s = schiere();
    s.A[1] = C.combatant(dorso); s.A[1].attached = true; s.A[1].shielded = true; s.A[1].hostAt = 0;
    const r = C.meleeFight(s.A, s.B, { challenge: { a: 1, b: 1 } });
    const righe = r.steps.filter(x => x.mount);
    return righe.length > 0 && righe.every(x => x.foe === 'Grimgor');
  })());

  /* le ferite date a un rivale gia' a terra non gonfiano il risultato:
     contano per l'overkill e basta (p. 212, «this is an exception») */
  ok('un rivale gia caduto non regala ferite al risultato', (() => {
    const s = schiere();
    s.B[1].models = 0;
    const r = C.meleeFight(s.A, s.B, { challenge: { a: 1, b: 1 } });
    return r.sides.A[1].dealt === 0;
  })());
}

/* ================================================================= */
console.log('\nle regole delle liste «fun» (Renegades)');
{
  const D = await import('../src/dice.js');
  const FM = await import('../src/formation.js');
  const st = { WS:'3', BS:'3', S:'3', T:'3', W:'1', I:'3', A:'1', Ld:'6' };
  const hw = [{ name:'Hand Weapon', range:'Combat', S:'S', ap:'-', rules:'-' }];

  const r = readRules(['Massed Infantry', 'Parry', 'Press of Battle', 'Predatory Fighter', 'Skink Riders',
                       'Lumbering', 'Clumsy']);
  ok('nessuna delle sette universali resta sconosciuta', r.unknown.length === 0);
  ok('le cinque di mischia entrano nel conto',
     r.flags.massedInfantry && r.flags.parry && r.flags.pressOfBattle && r.flags.predatory && r.flags.skinkRiders);

  /* Massed Infantry: un punto alla parte con piu' Forza d'Unita', una volta sola */
  const card = (us, massed) => ({ wounds: 0, models: 1, frontage: 1, maxRank: 0, us, massed });
  ok('Massed Infantry vale un punto a chi ha più Forza d Unità',
     ML.combatResult([card(20, true)], [card(10, false)]).A.massed === 1);
  ok('e niente a chi ne ha meno', ML.combatResult([card(10, true)], [card(20, false)]).A.massed === 0);
  ok('e con due unità che la portano il punto resta uno',
     ML.combatResult([card(10, true), card(10, true)], [card(5, false)]).A.massed === 1);

  /* Parry: lo scudo lo dice il file o la scheda, e vale solo in mischia */
  const rats = extra => C.combatant(unit('Clanrats', st, 20, 5, { weapons: hw, rules: ['Parry'], armour: 5, ...extra }));
  ok('Parry con lo scudo porta l armatura da 5+ a 4+', rats({ shield: true }).parryArmour === 4);
  ok('lo scudo può dirlo la scheda di preparazione', rats({ prepara: { shield: true } }).parryArmour === 4);
  ok('senza sapere dello scudo non si applica, e lo dice',
     !rats({}).parryArmour && /scheda di preparazione/.test(rats({}).parryOff));
  ok('e non va oltre il 3+', !C.combatant(unit('X', st, 1, 1, { weapons: hw, rules: ['Parry'], armour: 3, shield: true })).parryArmour);
  D.setSource(() => 3);                                  // tutti quattro
  const foe = C.combatant(unit('Nemico', st, 10, 5, { weapons: hw }));
  const def = rats({ shield: true });
  ok('in mischia il 4 salva con la Parry', C.strike(foe, def, { attacks: 5, melee: true }).wounds === 0);
  ok('fuori dalla mischia no', C.strike(foe, def, { attacks: 5 }).wounds === 5);

  /* Press of Battle: due ranghi pieni, tranne nel turno della carica */
  const press = C.combatant(unit('Clanrats', st, 20, 5, { weapons: hw, rules: ['Press of Battle'] }));
  const other = C.combatant(unit('Nemico', st, 20, 5, { weapons: hw }));
  ok('Press of Battle: la seconda fila mena piena e la terza appoggia',
     C.contact(press, other).troop === 15 && C.contact(press, other).pressed === 5);
  ok('nel turno in cui carica no', C.contact({ ...press, charged: true }, other).troop === 10);
  ok('e gli schermagliatori non stanno in file', C.contact({ ...press, loose: true }, other).troop === 10);

  /* Predatory Fighter: ogni 6 per colpire porta un attacco in piu', che non ne porta altri */
  D.setSource(() => 5);                                  // tutti sei
  const pred = C.combatant(unit('Oldblood', st, 1, 1, { weapons: hw, rules: ['Predatory Fighter'] }));
  ok('Predatory Fighter: quattro sei portano quattro attacchi, e basta',
     C.strike(pred, other, { attacks: 4, melee: true }).hit.of === 8);
  ok('e fuori dalla mischia non c è', C.strike(pred, other, { attacks: 4 }).hit.of === 4);

  /* Skink Riders: si colpisce l'Abilita' piu' alta fra bestia ed equipaggio */
  const bast = C.combatant(unit('Bastiladon', st, 1, 1, { weapons: hw, rules: ['Skink Riders'],
    profiles: [{ name:'Bastiladon', stats:{ WS:'3' } }, { name:'Crew', stats:{ WS:'5' } }] }));
  ok('Skink Riders: chi colpisce guarda l Abilità più alta', bast.wsDef === 5 && bast.ws === 3);
  D.setSource(D.seeded(1));

  /* Lumbering e Clumsy: chi si unisce a chi */
  ok('Lumbering per nome vale anche fuori dai tipi di truppa',
     FM.isLumbering({ troop:'Monstrous infantry', rules:['Lumbering'] }));
  const t = { uid:1, army:'A', name:'Terradon Riders', models:3, rules:['Clumsy'] };
  const skink = { uid:2, army:'A', name:'Skink Chief', models:1, slot:'Characters', rules:[] };
  const volante = { uid:3, army:'A', name:'Skink Chief on Terradon', models:1, slot:'Characters', rules:['Clumsy'] };
  const units = [t, skink, volante];
  ok('Clumsy: a piedi non ci si unisce', !FM.joinCandidates(units, t).includes(skink));
  ok('chi è Clumsy anche lui sì', FM.joinCandidates(units, t).includes(volante));
  ok('e il tavolo dice perché', FM.joinRefusals(units, t).some(x => x.uid === 2 && /Clumsy/.test(x.why)));

  /* lo scudo della Parry: la scheda lo chiede finche' nessuno lo dice */
  const PREP = await import('../src/prep.js');
  const lista = { units: [{ name:'Skink Skirmishers', rules:['Skirmishers', 'Parry'] },
                          { name:'Clanrats', rules:['Parry'], shield: true },
                          { name:'Temple Guard', rules:[] }] };
  ok('la scheda chiede lo scudo a chi ha Parry e un file che tace',
     PREP.questions(lista).filter(q => q.id === 'shield').map(q => q.unit).join() === '0');
  ok('e smette di chiederlo quando ha risposta',
     !PREP.questions({ ...lista, prep: { units: { 0: { shield: false } } } }).some(q => q.id === 'shield'));
}

/* ================================================================= */
console.log('\ngli attacchi che si tirano (Random Attacks, p. 176)');
{
  const D = await import('../src/dice.js');
  /* l'Hell Pit Abomination (Legends: Skaven): la riga dice «D6+1», e
     prima la mischia la leggeva come il primo numero che trovava — 6 */
  const abominio = unit('Hell Pit Abomination',
    { M:'3D6',WS:'3',BS:'1',S:'6',T:'5',W:'6',I:'4',A:'D6+1',Ld:'8' }, 1, 1,
    { armour: 5, rules: ['Random Attacks'] });
  const muro = () => C.combatant(unit('Guardia del Tempio',
    { M:'4',WS:'4',BS:'0',S:'4',T:'4',W:'1',I:'2',A:'1',Ld:'8' }, 20, 5, { armour: 4 }));
  const hp = C.combatant(abominio);
  ok('la riga «D6+1» non vale 6: la schiera sa che si tira',
     !!hp.randomA && hp.randomA.n === 1 && hp.randomA.die === 6 && hp.randomA.plus === 1);
  ok('e in media ne porta 4 e mezzo, che è quello che la previsione conta',
     hp.a === 4.5 && C.meleeForecast(hp, muro()).attacks === 4.5);
  const colpi = r => r.steps.filter(s => s.side === 'A' && s.label === 'colpi')
                            .reduce((n, s) => n + s.attacks, 0);
  D.setSource(() => 0);
  const basso = C.meleeFight(hp, muro());
  ok('con un 1 sul dado mena con 2 attacchi', colpi(basso) === 2);
  ok('e il tiro sta nel risultato, per chi lo racconta',
     basso.randomA.length === 1 && basso.randomA[0].dice.join() === '1' &&
     basso.randomA[0].attacks === 2 && basso.randomA[0].side === 'A');
  D.setSource(n => n - 1);
  ok('con un 6 ne porta 7', colpi(C.meleeFight(hp, muro())) === 7);
  /* si tira a ogni assalto: due assalti di fila non sono lo stesso numero */
  D.setSource(D.seeded(5));
  const visti = new Set();
  for (let k = 0; k < 40; k++) visti.add(colpi(C.meleeFight(hp, muro())));
  ok('si tira a ogni assalto, e i sei esiti escono tutti', [2,3,4,5,6,7].every(n => visti.has(n)) && visti.size === 6);
  /* un effetto sugli Attacchi si somma al tiro, non al 6 */
  D.setSource(() => 0);
  const furioso = C.combatant({ ...abominio, effects: [{ id:'x', from:'prova', mods:{ A: 1 } }] });
  ok('un +1 agli Attacchi si somma al dado', colpi(C.meleeFight(furioso, muro())) === 3);
  ok('chi ha un numero scritto non tira niente',
     C.meleeFight(muro(), C.combatant(abominio)).randomA.every(x => x.side === 'B'));
  D.setSource(D.seeded(1));
}

/* ================================================================= */
console.log('\nle ferite multiple (Multiple Wounds, p. 175)');
{
  const D = await import('../src/dice.js');
  const mw = readRules([], ['Multiple Wounds (D3+1)']).flags.multipleWounds;
  ok('la regola si legge col dado fra parentesi', mw && mw.die === 3 && mw.plus === 1);
  ok('e col numero secco', readRules([], ['Multiple Wounds (2)']).flags.multipleWounds.flat === 2);
  ok('e in mischia non è più sconosciuta',
     readRules([], ['Strike Last', 'Multiple Wounds (D3)']).unknown.length === 0);

  /* ogni ferita cade su un modello: quello che avanza non passa al vicino */
  const tre = () => ({ models: 3, w: 2, spill: 0 });
  let s = tre(), t = C.takeWounds(s, 1, [6]);
  ok('sei ferite su un modello da due ne tolgono uno, e basta', t.kills === 1 && s.models === 2 && s.spill === 0);
  ok('le ferite perse sono due, quelle fatte sei', t.lost === 2 && t.caused === 6);
  s = tre(); t = C.takeWounds(s, 2, [1, 1]);
  ok('due ferite da uno fanno un modello, come sempre', t.kills === 1 && s.spill === 0 && t.lost === 2);
  s = { models: 1, w: 3, spill: 0 }; t = C.takeWounds(s, 2, [2, 2]);
  ok('due da due su un mostro da tre: la seconda lo finisce', t.kills === 1 && t.lost === 3 && t.caused === 4);
  s = { models: 2, w: 3, spill: 1 }; t = C.takeWounds(s, 1, [3]);
  ok('una ferita già addosso conta: tre su chi ne ha due lo abbattono', t.kills === 1 && s.spill === 0 && t.lost === 2);
  s = tre(); t = C.takeWounds(s, 3);
  ok('senza la regola il conto è quello di sempre', t.kills === 1 && s.spill === 1 && t.lost === 3);

  const talons = [{ name:'Slashing talons', range:'Combat', S:'S', ap:'-', rules:'Multiple Wounds (2)' }];
  const carno = () => C.combatant(unit('Carnosauro',
    { M:'7',WS:'4',BS:'0',S:'7',T:'5',W:'5',I:'2',A:'2',Ld:'5' }, 1, 1, { weapons: talons }));
  const bestia = () => C.combatant(unit('Stegadonte',
    { M:'6',WS:'3',BS:'0',S:'5',T:'4',W:'3',I:'1',A:'0',Ld:'5' }, 1, 1));
  D.setSource(() => 5);                                  // tutti sei
  const r = C.strike(carno(), bestia(), { attacks: 2, melee: true });
  ok('il colpo tira il moltiplicatore per ogni ferita non salvata',
     r.wounds === 2 && Array.isArray(r.losses) && r.losses.join() === '2,2');
  const f = C.meleeFight(carno(), bestia());
  ok('due ferite non salvate abbattono un mostro da tre', f.kills.B[0] === 1);
  ok('e nel risultato contano le ferite perse, tre e non quattro (p. 212)', f.done.A === 3);
  const g = C.meleeForecast(carno(), bestia());
  const piatto = C.meleeForecast(C.combatant(unit('Carnosauro',
    { M:'7',WS:'4',BS:'0',S:'7',T:'5',W:'5',I:'2',A:'2',Ld:'5' }, 1, 1,
    { weapons: [{ ...talons[0], rules: '-' }] })), bestia());
  ok('la previsione conta le ferite perse, il doppio', near(g.wounds, 2 * piatto.wounds, 1e-9));
  ok('e su un modello da una ferita non cambia niente',
     near(C.meleeForecast(carno(), C.combatant(unit('Skink', st1(), 10, 5))).wounds,
          C.meleeForecast(C.combatant(unit('Carnosauro',
            { M:'7',WS:'4',BS:'0',S:'7',T:'5',W:'5',I:'2',A:'2',Ld:'5' }, 1, 1,
            { weapons: [{ ...talons[0], rules: '-' }] })), C.combatant(unit('Skink', st1(), 10, 5))).wounds, 1e-9));
  const tol = C.woundsToll(unit('Stegadonte', { W:'3', T:'4' }, 1, 1), 2, { losses: [2, 2] });
  ok('anche il conto del tavolo le sa', tol.kills === 1 && tol.left === 0);

  /* e a distanza: il Giant bow dello Skink Priest sull'howdah */
  const arco = { name:'Giant bow', range:'36"', S:'5', ap:'-2', rules:'Multiple Wounds (D3), Poisoned Attacks' };
  const prete = unit('Skink Priest', { WS:'2',BS:'3',S:'2',T:'2',W:'2',I:'4',A:'1',Ld:'7' }, 1, 1, { weapons: [arco] });
  const tiro = C.shootRoll(prete, bestia(), { weapon: arco, shots: 1 });
  ok('il tiro tira anche lui il moltiplicatore', tiro.wounds === 1 && tiro.losses.join() === '3' && tiro.kills === 1);
  D.setSource(D.seeded(1));
}
function st1(){ return { M:'6',WS:'2',BS:'3',S:'3',T:'2',W:'1',I:'4',A:'1',Ld:'6' }; }

/* ================================================================= */
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
