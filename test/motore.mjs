/* Il motore delle fasi: le sedici caselle, le azioni come oggetti, i
 * dadi chiesti invece che tirati, le regole in ascolto e il registro
 * che si scrive da solo. Niente jsdom e niente tavolo: il motore vive
 * di tre funzioni — dove siamo, dove andare, dove scrivere — e si prova
 * dandogliele finte.
 * Si lancia con:  node test/motore.mjs
 */
import * as PH from '../src/phases.js';
import { createEngine, ACTIONS, MOMENTS, readRolls } from '../src/engine.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};

/* Un tavolo finto: turno, esercito, casella. È tutto quello che il
   motore ha bisogno di sapere del mondo. */
function bench(){
  const now = { turn:1, side:'A', step:0 };
  const written = [];
  const E = createEngine({
    getNow: () => ({ ...now }),
    setNow: n => Object.assign(now, n),
    write: e => written.push(e),
  });
  return { E, now, written, at: i => { now.step = i; } };
}

/* ================================================================= */
console.log('le sedici caselle (pp. 115-117, 118, 136, 144)');
ok('sono sedici', PH.STEP_COUNT === 16);
ok('quattro fasi da quattro', PH.PHASES.length === 4 && PH.PHASES.every(p => p.steps.length === 4));
ok('e l indice le mette in fila senza buchi',
   PH.STEPS.every((s, i) => s.index === i));
ok('la prima è l inizio del turno', PH.stepAt(0).id === 'turnStart');
ok('l ultima è l inseguimento', PH.stepAt(15).id === 'pursuit');
ok('ogni casella dice a che pagina sta', PH.STEPS.every(s => s.page > 0));
ok('e cosa ci si aspetta che ci succeda', PH.STEPS.every(s => s.what && s.does.length));

ok('la quinta casella è la dichiarazione delle cariche',
   PH.stepAt(4).id === 'declare' && PH.stepAt(4).phaseId === 'movement');
ok('la fase si legge dalla casella', PH.stepAt(9).phase === 2);
ok('avanti dall ultima si torna alla prima girando il turno',
   PH.step(15, 1).index === 0 && PH.step(15, 1).wrapped === 1);
ok('indietro dalla prima si torna all ultima', PH.step(0, -1).index === 15 && PH.step(0, -1).wrapped === -1);
ok('e nel mezzo non gira niente', PH.step(7, 1).wrapped === 0);

console.log('\ncosa ci si aspetta qui');
ok('la carica si dichiara nella casella della dichiarazione', PH.allows(4, 'declareCharge'));
ok('non nel raduno', !PH.allows(3, 'declareCharge'));
ok('una nota va bene in tutte e sedici', PH.STEPS.every(s => s.does.includes('note')));
ok('e un tiro di dadi anche', PH.STEPS.every(s => s.does.includes('roll')));
ok('l azione fuori posto porta la nota di dove sta di casa',
   /Tiro · Scelta e bersaglio/.test(PH.misplaced(4, 'declareShot')));
ok('e di dove siamo adesso', /Movimento · Dichiarazione cariche/.test(PH.misplaced(4, 'declareShot')));
ok('quando è al posto giusto non dice niente', PH.misplaced(4, 'declareCharge') === '');
ok('il vocabolario delle sedici caselle è quello del motore',
   PH.VOCABULARY.every(t => t in ACTIONS));

/* ================================================================= */
console.log('\nle azioni sono oggetti');
{
  const { E, written, at } = bench();
  at(4);
  const r = E.dispatch({ type:'declareCharge', unit:{ name:'Orc Mobs', army:'A' }, target:{ name:'Saurus Warriors' } });
  ok('un azione al posto giusto passa', r.ok === true);
  ok('e scrive una riga che si legge', r.entry.text === 'Orc Mobs dichiara la carica su Saurus Warriors');
  ok('la riga dice in quale casella è successa', r.entry.stepLabel === 'Movimento · Dichiarazione cariche');
  ok('e non ha niente da segnalare', r.entry.note === '');
  ok('il registro la riceve', written.length === 1 && written[0] === r.entry);
  ok('le righe sono numerate in ordine', r.entry.n === 1);

  /* il §1 del piano: propone, non impedisce */
  const out = E.dispatch({ type:'declareShot', unit:{ name:'Skink' }, target:{ name:'Orc Mobs' } });
  ok('un azione fuori casella passa lo stesso', out.ok === true);
  ok('ma si porta dietro la nota del perché era fuori posto', /di solito si fa in Tiro/.test(out.entry.note));
  ok('e la nota finisce nel registro, non in un errore', written.length === 2);

  const bad = E.dispatch({ type:'teleporta' });
  ok('un tipo che non esiste non passa', bad.ok === false);
  ok('perché eseguirlo in silenzio è l unico modo di sbagliare senza accorgersene',
     /sconosciuto/.test(bad.why) && written.length === 2);
}

/* ================================================================= */
console.log('\nil motore non tira: chiede');
{
  const { E, at } = bench();
  at(5);
  const a = { type:'chargeMove', unit:{ name:'Orc Mobs', army:'A' }, target:{ name:'Saurus' } };
  const first = E.dispatch(a);
  ok('senza i dadi non succede niente', first.ok === false && first.waiting === true);
  ok('e si sa cosa serve', first.ask.length === 1 && first.ask[0].n === 2 && first.ask[0].kind === 'd6');
  ok('con il motivo scritto sopra', first.ask[0].why === 'tiro di carica');

  const done = E.dispatch(a, { carica:{ dice:[4,5], kept:[4,5], total:9 } });
  ok('con i dadi in mano l azione va a segno', done.ok === true);
  ok('e la riga dice le facce, non solo il totale', /4 \+ 5 = 9/.test(done.entry.text));
  ok('i dadi restano attaccati alla riga', !!done.entry.dice.carica);

  /* il passo lungo chiede tre dadi e ne tiene due */
  const swift = E.dispatch({ type:'chargeMove', unit:{ name:'Lupi' }, swift:true });
  ok('il passo lungo chiede tre dadi', swift.ask[0].n === 3);
  ok('e dice che ne tiene due scartando il minore',
     swift.ask[0].keep === 2 && swift.ask[0].drop === 'lowest');
  const swiftDone = E.dispatch({ type:'chargeMove', unit:{ name:'Lupi' }, swift:true },
                               { carica:{ dice:[2,4,5], kept:[4,5], total:9 } });
  ok('e la riga fa vedere il dado buttato via', /2 \+ 4 \+ 5 \(tengo 4 \+ 5\) = 9/.test(swiftDone.entry.text));

  /* un pugno di dadi non si somma: cinque dadi per colpire non fanno 19 */
  at(12);
  const hits = E.dispatch({ type:'toHit', dice:5, need:4 }, { colpire:{ dice:[1,3,4,5,6], hits:3 } });
  ok('un pugno di dadi dice quanti passano, non la somma',
     /3 passano/.test(hits.entry.text) && !/= 19/.test(hits.entry.text));
  ok('e il punteggio da fare è scritto accanto', /\(4\+\)/.test(hits.entry.text));

  /* il ritiro si vede: prima e dopo */
  const again = E.dispatch({ type:'toWound', dice:3, need:5 },
                           { ferire:{ first:[1,1,4], dice:[6,2,4], rerolled:2, hits:1 } });
  ok('un dado ritirato mostra da dove veniva', /1 \+ 1 \+ 4 → 6 \+ 2 \+ 4/.test(again.entry.text));
}

console.log('\nil ritiro non si fa due volte (p. 93)');
{
  const { E, at } = bench();
  at(12);
  E.dispatch({ type:'toHit', dice:3, need:4 }, { colpire:{ dice:[1,2,3], hits:0 } });
  ok('un tiro non ancora ritirato si può ritirare', E.canReroll('colpire') === true);
  E.dispatch({ type:'toHit', dice:3, need:4 }, { colpire:{ first:[1,2,3], dice:[5,5,5], rerolled:3, hits:3 } });
  ok('quello già ritirato no', E.canReroll('colpire') === false);
  ok('e di un tiro che non è mai stato chiesto non si sa niente', E.canReroll('mai') === false);
}

/* ================================================================= */
console.log('\nle regole sono ascoltatori');
{
  const { E, at } = bench();
  ok('i momenti sono quelli del piano',
     ['onDeclareCharge','onToHit','onToWound','onSave','onCombatResult','onBreakTest','onPanic','onMove','onTerrain']
       .every(m => MOMENTS.includes(m)));
  let boom = false;
  try { E.on('onQualcosa', 'x', () => {}); } catch { boom = true; }
  ok('un momento inventato non si registra in silenzio', boom);

  E.on('onToHit', 'choppas', ctx => ctx.set('reroll1', true, 'Choppas: ritira gli 1'), 'Choppas');
  E.on('onToHit', 'odio', ctx => ctx.add('Odio', 1), 'Odio');
  ok('gli ascoltatori si vedono', E.listening('onToHit').join(',') === 'choppas,odio');

  at(12);
  const r = E.dispatch({ type:'toHit', dice:4, need:4 }, { colpire:{ dice:[1,4,5,6], hits:3 } });
  ok('la regola accende la sua bandierina', r.flags.reroll1 === true);
  ok('e l altra sposta il numero', r.mods[0].from === 'Odio' && r.mods[0].delta === 1);
  ok('ognuna lascia detto che è passata di lì',
     r.trace.length === 2 && r.trace[0].from === 'Choppas' && r.trace[0].at === 'onToHit');
  ok('e la traccia dice cosa ha fatto', /Choppas/.test(r.trace[0].what));
  ok('la traccia finisce nella riga di registro', r.entry.trace.length === 2);

  /* chi non tocca niente non lascia traccia: un registro pieno di
     «non ho fatto niente» non si legge */
  E.on('onSave', 'muta', () => {}, 'Regola muta');
  const q = E.dispatch({ type:'save', dice:1, need:4 }, { salvezza:{ dice:[5], hits:1 } });
  ok('una regola che non cambia niente non sporca la traccia', q.entry.trace === null);

  /* una regola che esplode non deve poter fermare la partita */
  E.on('onPanic', 'rotta', () => { throw new Error('boom'); }, 'Regola rotta');
  at(11);
  const p = E.dispatch({ type:'panic', unit:{ name:'Goblin' } }, { panico:{ dice:[3,4], total:7 } });
  ok('una regola che sbaglia non ferma il motore', p.ok === true);
  ok('e finisce nella traccia segnata come errore',
     p.trace.some(t => t.bad && /boom/.test(t.what)));
}

/* ================================================================= */
console.log('\ncamminare sulle sedici caselle');
{
  const { E, now } = bench();
  const seen = [];
  E.on('onStepLeave', 'esci', () => seen.push('esci'), 'uscita');
  E.on('onStepEnter', 'entra', () => seen.push('entra'), 'entrata');
  const g = E.goTo(7);
  ok('si va dove si è chiesto', now.step === 7 && g.to === 7);
  ok('e si sa da dove si veniva', g.from === 0);
  ok('uscire e entrare da una casella sono due momenti',
     seen.join(',') === 'esci,entra');
}

/* ================================================================= */
console.log('\nil registro si scrive da solo');
{
  const { E, at } = bench();
  at(0);  E.dispatch({ type:'note', text:'si comincia' });
  at(3);  E.dispatch({ type:'rally', unit:{ name:'Night Goblins' } }, { raduno:{ dice:[2,3], total:5 } });
  at(4);  E.dispatch({ type:'declareCharge', unit:{ name:'Orc Mobs' }, target:{ name:'Skink' } });
  at(5);  E.dispatch({ type:'chargeMove', unit:{ name:'Orc Mobs' } }, { carica:{ dice:[6,5], kept:[6,5], total:11 } });
  at(14); E.dispatch({ type:'breakTest', unit:{ name:'Skink' }, outcome:'rout' },
                     { rotta:{ dice:[6,6], total:12 } });

  ok('cinque azioni fanno cinque righe', E.count === 5);
  const story = E.story();
  ok('e la cronaca si legge come una cronaca',
     story[1] === 'T1 A · Strategia · Raduno · Night Goblins prova a radunarsi: 2 + 3 = 5');
  ok('ogni riga porta il turno e la casella',
     story.every(l => /^T1 A · [^·]+ · /.test(l)));
  ok('la carica dice quanto ha tirato',
     /Orc Mobs carica: 6 \+ 5 = 11/.test(story[3]));
  /* Il test di rotta ha tre esiti (p. 154) e la riga lo deve dire:
     «ha fallito» non basta a sapere dov'e' finito il reggimento. */
  ok('il test di rotta porta i dadi e l esito',
     /Skink: 6 \+ 6 = 12 — va in rotta/.test(story[4]));

  E.clear();
  ok('e il registro si azzera quando comincia una partita nuova', E.count === 0);
}

/* ================================================================= */
console.log('\nuna partita è una lista di azioni');
/* È la prova che il §4.2 del piano prometteva: si rigioca identica
   perché i dadi sono fissati, e si controlla com è finita. */
{
  const { E, now } = bench();
  const script = [
    [0,  { type:'note', text:'primo turno' }, null],
    [3,  { type:'rally', unit:{ name:'Goblin' } }, { raduno:{ dice:[1,2], total:3 } }],
    [4,  { type:'declareCharge', unit:{ name:'Boar Boyz' }, target:{ name:'Skink' } }, null],
    [4,  { type:'chargeReaction', unit:{ name:'Skink' }, kind:'flee' }, null],
    [5,  { type:'chargeMove', unit:{ name:'Boar Boyz' }, swift:true },
         { carica:{ dice:[1,4,6], kept:[4,6], total:10 } }],
    [12, { type:'toHit', dice:10, need:3 }, { colpire:{ dice:[1,2,3,4,5,6,6,5,4,3], hits:7 } }],
    [13, { type:'combatResult', diff:4, text:'gli Orchi vincono di 4' }, null],
    [14, { type:'breakTest', unit:{ name:'Skink' } }, { rotta:{ dice:[5,6], total:11 } }],
  ];
  for (const [step, action, rolls] of script){ now.step = step; E.dispatch(action, rolls); }

  ok('otto azioni fanno otto righe', E.count === 8);
  ok('e la partita si racconta da sola',
     E.story()[3] === 'T1 A · Movimento · Dichiarazione cariche · Skink reagisce: fugge');
  ok('rigiocata con gli stessi dadi finisce identica', (() => {
    const b = bench();
    for (const [step, action, rolls] of script){ b.now.step = step; b.E.dispatch(action, rolls); }
    return b.E.story().join('\n') === E.story().join('\n');
  })());
  ok('nessuna riga è rimasta senza testo', E.entries.every(e => e.text && e.text !== '—'));
}

console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
