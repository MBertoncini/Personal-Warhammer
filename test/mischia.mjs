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
ok('e il tetto non c e, ma e detto', ML.overkill(9, 1).counted === 8 && ML.overkill(9, 1).daVerificare === true);
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
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
