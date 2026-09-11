/* La Tappa 2 del piano: il movimento e la carica per davvero.
 * Dichiarazione con arco, vista e distanza; reazioni; il tiro con il
 * terreno; allineamento e ruota; la regola del pollice; fuga,
 * cedimento, ripiegamento e inseguimento.
 * Niente pagina e niente tavolo: entrano scatole, escono numeri.
 * Si lancia con:  node test/movimento.mjs
 */
import * as CH from '../src/charge.js';
import { boxCorners, polyDistance } from '../src/geom.js';

const MM = 25.4;
let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

/* Un'unita' sul tavolo: posizione in pollici, basetta in millimetri,
   fronte verso -y come su tutto il tavolo. */
const unit = (name, xIn, yIn, w, h, rot = 0, extra = {}) => ({
  name, box: { x: xIn * MM, y: yIn * MM, w, h, rot }, ...extra,
});
/* un pezzo di terreno nella forma che il tavolo passa gia' agli aiuti
   tattici, con in piu' la categoria */
const piece = (label, xIn, yIn, wIn, hIn, cat) => {
  const b = { x:xIn * MM, y:yIn * MM, w:wIn * MM, h:hIn * MM, rot:0 };
  return {
    label, blocks: !!(cat && cat.los), cat, box: b, poly: boxCorners(b), circle:false,
    contains: p => Math.abs(p[0] - b.x) <= b.w / 2 && Math.abs(p[1] - b.y) <= b.h / 2,
  };
};
const WOOD = { label:"Bosco", slow:true, worstDie:true, danger:false, disorder:true, cover:"soft", los:"soft" };
const MARSH = { label:"Palude", slow:true, worstDie:true, danger:true, disorder:true, cover:"", los:false };

/* ================================================================= */
console.log('fin dove arriva una carica (pp. 119 e 121)');
{
  /* Due D6 e si tiene il MAGGIORE: uno solo, da 1 a 6. Non la somma —
     era la regola del Warhammer di prima, ed e' la correzione del §2
     del piano. */
  const b = CH.chargeBands(4);
  ok('il massimo e Movimento piu sei, non piu dodici', b.max === 10);
  ok('e la media e Movimento piu quattro e mezzo', b.avg === 8.5);
  ok('il passo lungo alza il massimo di tre pollici (p. 178)',
     CH.chargeBands(4, true).max === 13);
  ok('e alza anche la media di un dado intero',
     near(CH.chargeBands(4, true).avg - b.avg, 3.5, 0.05));
  ok('nel terreno difficile il Movimento cala di uno',
     CH.chargeBands(4, false, true).max === 9);
  ok('e la media si rovescia, perche si tiene il peggiore',
     CH.chargeBands(4, false, true).avg < b.avg - 1);

  ok('un tiro di sei riesce undici volte su trentasei',
     near(CH.chargeChance(6), 11 / 36, 0.001));
  ok('un tiro di due riesce trentacinque volte su trentasei',
     near(CH.chargeChance(2), 35 / 36, 0.001));
  ok('quello che si copre camminando riesce sempre', CH.chargeChance(0) === 1);
  ok('e oltre il sei non riesce mai, senza passo lungo', CH.chargeChance(7) === 0);
  ok('col passo lungo il sette si fa', CH.chargeChance(7, true) > 0);
  ok('e il passo lungo rende ogni punteggio piu facile',
     CH.chargeChance(5, true) > CH.chargeChance(5));
  ok('tenendo il peggiore ogni punteggio diventa piu difficile',
     CH.chargeChance(5, false, true) < CH.chargeChance(5));
}

/* ================================================================= */
console.log('\nla dichiarazione: arco, vista, distanza');
{
  /* il caricante guarda verso l alto (fronte = -y), il bersaglio gli
     sta davanti a sei pollici di bordo */
  const orc = unit('Orc Mobs', 0, 0, 5 * MM, 2 * MM, 0, { move:4 });
  const sauri = unit('Saurus Warriors', 0, -8, 5 * MM, 2 * MM, 180);

  const d = CH.declareCharge({ charger: orc, target: sauri });
  ok('la distanza si misura dal bordo, non dal centro', near(d.dist, 6, .1));
  ok('il bersaglio sta nell arco frontale', d.inArc && d.arc === 'fronte');
  ok('la vista e libera', !d.blocked);
  ok('e la carica si puo dichiarare', d.can === true);
  ok('e detto quanto serve tirare', d.need === 2);
  ok('con quante probabilita: un 2 lo fanno trentacinque dadi su trentasei',
     near(d.chance, 35 / 36, .01));

  /* dietro le spalle */
  const back = CH.declareCharge({ charger: orc, target: unit('Skink', 0, 8, 5 * MM, 2 * MM) });
  ok('quello che sta dietro non si carica', back.can === false && !back.inArc);
  ok('e la riga dice da che parte sta', /retro/.test(back.why));

  /* troppo lontano: il manuale vieta di dichiarare una carica che non
     puo riuscire */
  const far = CH.declareCharge({ charger: orc, target: unit('Skink', 0, -30, 5 * MM, 2 * MM) });
  ok('una carica che non puo riuscire non si dichiara', far.impossible && !far.can);
  ok('e la riga dice fin dove arriva davvero', /massimo a 10″/.test(far.why));

  /* un bosco in mezzo */
  const wood = piece('Bosco', 0, -4, 6, 3, { ...WOOD, los:true });
  const blind = CH.declareCharge({ charger: orc, target: sauri, pieces:[wood] });
  ok('un bosco in mezzo taglia la vista', blind.blocked && !blind.can);
  ok('e si sa che cosa la taglia', /bosco/.test(blind.why));
  ok('chi vola non se ne cura',
     CH.declareCharge({ charger:{ ...orc, fly:true }, target: sauri, pieces:[wood] }).can === true);
}

/* ================================================================= */
console.log('\nle reazioni alla carica (p. 120)');
{
  const far = CH.reactions({ dist:8, chargerMove:4, shots:10 });
  ok('tenere la posizione si puo sempre', far[0].can === true);
  ok('a otto pollici si tira e si tiene', far[1].can === true);
  ok('e si puo anche fuggire', far[2].can === true);

  const near2 = CH.reactions({ dist:3, chargerMove:4, shots:10 });
  ok('sotto il Movimento del caricante il tira e tieni non si sceglie', near2[1].can === false);
  ok('e la riga dice perche', /meno del suo Movimento/.test(near2[1].why));

  ok('chi non ha archi non tira', CH.reactions({ dist:8, chargerMove:4, shots:0 })[1].can === false);
  const eng = CH.reactions({ dist:8, chargerMove:4, shots:10, engaged:true });
  ok('chi e gia in combattimento non fugge e non tira',
     eng[1].can === false && eng[2].can === false);
  ok('e chi sta gia fuggendo non fugge di nuovo',
     CH.reactions({ dist:8, chargerMove:4, fleeing:true })[2].can === false);
}

/* ================================================================= */
console.log('\nil tiro di carica e il terreno (pp. 121, 128, 178)');
{
  const plain = CH.chargeDice({});
  ok('sono due dadi e se ne tiene uno', plain.n === 2 && plain.keep === 1);
  ok('e quello che si butta e il minore', plain.drop === 'lowest');
  ok('si tiene il maggiore', CH.keepDice([2, 5], plain).join() === '5');
  ok('a pari si tiene quello', CH.keepDice([3, 3], plain).join() === '3');
  ok('e il dado buttato resta scritto, se no non si controlla a occhio',
     CH.droppedDie([2, 5], plain) === 2);

  const worst = CH.chargeDice({ worst:true });
  ok('nel terreno difficile si butta il maggiore', worst.drop === 'highest');
  ok('e restano sempre due dadi, non tre', worst.n === 2);
  ok('tenendo il peggiore', CH.keepDice([2, 5], worst).join() === '2');

  const swift = CH.chargeDice({ swift:true });
  ok('il passo lungo tira un dado in piu', swift.n === 3);
  ok('ma il terzo non entra nella scelta: si somma',
     CH.keepDice([2, 5, 4], swift).join() === '5,4');
  ok('anche quando si tiene il peggiore',
     CH.keepDice([2, 5, 4], CH.chargeDice({ swift:true, worst:true })).join() === '2,4');
  ok('e il vassoio lo spiega invece di dire una frase generica',
     /si somma/.test(swift.foot) && /peggiore/.test(worst.foot));

  const made = CH.chargeOutcome({ dice:[4, 5], spec:plain, move:4, dist:9 });
  ok('quattro di Movimento e un cinque fanno nove', made.reach === 9);
  ok('e la carica arriva', made.made === true && made.short === 0);
  const missed = CH.chargeOutcome({ dice:[1, 2], spec:plain, move:4, dist:12 });
  ok('un tiro corto resta corto', missed.made === false && missed.short === 6);
  const slow = CH.chargeOutcome({ dice:[2, 5], spec:worst, move:4, dist:9 });
  ok('nel difficile si tiene il due e il Movimento cala di uno',
     slow.reach === 5 && slow.penalty === 1);
  ok('e il Movimento non scende mai sotto uno',
     CH.chargeOutcome({ dice:[1, 1], spec:worst, move:1, dist:9 }).move === 1);
}

/* ================================================================= */
console.log('\nil terreno attraversato, e le due regole che non vanno confuse (p. 128)');
{
  const wood = piece('Bosco', 0, -4, 6, 3, WOOD);
  const list = CH.crossed([0, 0], [0, -8 * MM], [wood]);
  ok('il bosco sulla strada si vede', list.length === 1);
  const eff = CH.terrainEffect(list);
  ok('rallenta, fa tenere il peggiore e toglie i ranghi',
     eff.slow && eff.worstDie && eff.disorder && !eff.danger);

  const clear = CH.crossed([0, 0], [8 * MM, 0], [wood]);
  ok('quello che sta da un altra parte non conta', clear.length === 0);

  /* Le due regole stanno sulla stessa pagina e costano bonus diversi.
     La carica disordinata la fa il non riuscire ad allinearsi, non
     l'aver attraversato un bosco: confonderle vuol dire togliere il
     bonus sbagliato a fine assalto. */
  const dis = CH.disorderedCharge({ aligned:false, blockedBy:['Monolite'] });
  ok('chi non riesce ad allinearsi carica disordinato', dis.disordered === true);
  ok('e perde il bonus di Iniziativa, non i ranghi', /Iniziativa/.test(dis.text));
  ok('con dentro cosa era in mezzo', /Monolite/.test(dis.text));
  ok('chi si allinea non e disordinato',
     CH.disorderedCharge({ aligned:true }).disordered === false);
  ok('nemmeno se ha attraversato mezzo bosco per arrivarci',
     CH.disorderedCharge({ aligned:true }).disordered === false);
  ok('anche far allineare il nemico conta',
     CH.disorderedCharge({ aligned:true, madeThemAlign:true }).disordered === true);

  /* I ranghi li toglie dove si FINISCE, e si contano sui modelli. */
  const dentro = [[0, -4 * MM], [MM, -4 * MM], [-MM, -4 * MM], [0, -3 * MM]];
  const fuori  = [[0, 0], [MM, 0], [-MM, 0], [0, MM]];
  ok('un quarto dei modelli nel bosco toglie i ranghi',
     CH.disruptedInTerrain(dentro, [wood]).disrupted === true);
  ok('e dice quanti e dove', /Bosco/.test(CH.disruptedInTerrain(dentro, [wood]).why));
  ok('finire in aperto non li toglie',
     CH.disruptedInTerrain(fuori, [wood]).disrupted === false);
  ok('e sotto un quarto nemmeno',
     CH.disruptedInTerrain([...fuori, ...fuori, ...fuori, [0, -4 * MM]], [wood]).disrupted === false);
  ok('un conteggio stimato lo dichiara',
     /stimato/.test(CH.disruptedInTerrain(dentro, [wood], { exact:false }).why));
}

/* ================================================================= */
console.log('\nl allineamento e la ruota');
{
  /* il bersaglio guarda in alto, il caricante gli arriva da sopra:
     lo prende in faccia e deve girarsi di 180 gradi */
  const target = { x:0, y:0, w:5 * MM, h:2 * MM, rot:0 };
  const charger = { x:0, y:-6 * MM, w:5 * MM, h:2 * MM, rot:0 };
  const a = CH.alignTo(charger, target);
  ok('si arriva sulla faccia da cui si viene', a.side === 'fronte' && a.arc === 'fronte');
  ok('e ci si mette a filo',
     near(polyDistance(boxCorners({ ...charger, x:a.x, y:a.y, rot:a.rot }), boxCorners(target)), 0, .01));
  ok('girati verso il bersaglio', a.rot === 180);
  ok('la ruota e di mezzo giro', a.wheel === 180);
  ok('e costa in pollici quanto e largo il fronte', near(a.wheelCost, 5 * Math.PI, .1));

  /* da destra si prende il fianco */
  const side = CH.alignTo({ x:8 * MM, y:0, w:5 * MM, h:2 * MM, rot:270 }, target);
  ok('chi arriva di lato prende il fianco', side.side === 'fianco destro' && side.arc === 'fianco');
  ok('e si mette a filo anche li',
     near(polyDistance(boxCorners({ x:side.x, y:side.y, w:5 * MM, h:2 * MM, rot:side.rot }),
                       boxCorners(target)), 0, .01));
  ok('senza dover girare, perche era gia giusto', side.wheel === 0);

  ok('una ruota di novanta gradi con un fronte da cento millimetri costa sei pollici e mezzo',
     near(CH.wheelCost(100, 90), 100 * Math.PI / 2 / MM, .01));
  ok('e stare fermi non costa niente', CH.wheelCost(100, 0) === 0);
}

/* ================================================================= */
console.log('\nla regola del pollice (p. 118)');
{
  const me = { x:0, y:0, w:5 * MM, h:2 * MM, rot:0 };
  const poly = boxCorners(me);
  const vicino = unit('Skink', 0, -2.5, 5 * MM, 2 * MM);
  const lontano = unit('Kroxigor', 0, -6, 5 * MM, 2 * MM);

  const bad = CH.tooClose(poly, [vicino, lontano]);
  ok('chi sta a meno di un pollice si vede', bad.length === 1 && bad[0].name === 'Skink');
  ok('e si sa di quanto bisogna scostarsi', bad[0].need > 0 && bad[0].need < 1);
  ok('chi e a contatto non conta: quello e un combattimento',
     CH.tooClose(poly, [unit('Saurus', 0, -2, 5 * MM, 2 * MM)]).length === 0);

  const fix = CH.nudgeClear({ x:me.x, y:me.y, rot:0 }, me, [vicino]);
  ok('lo scostamento minimo mette a posto', fix.ok === true);
  ok('e dice di quanto ha spostato', fix.moved > 0 && fix.moved < 1);
  ok('chi era gia a posto non si muove',
     CH.nudgeClear({ x:me.x, y:me.y, rot:0 }, me, [lontano]).moved === 0);
}

/* ================================================================= */
console.log('\nchi altro si finisce per toccare');
{
  const place = boxCorners({ x:0, y:0, w:5 * MM, h:2 * MM, rot:0 });
  const bersaglio = unit('Saurus', 0, -2, 5 * MM, 2 * MM);
  const vicino = unit('Skink', 5.5, 0, 5 * MM, 2 * MM);
  const altrove = unit('Kroxigor', 12, 0, 5 * MM, 2 * MM);
  const list = CH.alsoInTheWay(place, [bersaglio, vicino, altrove], bersaglio);
  ok('il vicino del bersaglio va dichiarato anche lui',
     list.length === 1 && list[0].name === 'Skink');
  ok('e si sa di quanto lo si sfiora', list[0].gap >= 0 && list[0].gap <= 1);
}

/* ================================================================= */
console.log('\nfuga, cedimento, ripiegamento (pp. 132-134 e 156)');
{
  const me = { x:0, y:0, w:5 * MM, h:2 * MM, rot:0 };
  const grosso = unit('Kroxigor', 0, -6, 5 * MM, 2 * MM, 180, { us:9 });
  const piccolo = unit('Skink', -6, 0, 5 * MM, 2 * MM, 90, { us:3 });

  const via = CH.awayFrom(me, [grosso, piccolo]);
  ok('si scappa dal piu grosso', via.from.join() === 'Kroxigor' && via.us === 9);
  ok('dritti nella direzione opposta', near(via.dir[1], 1, .01) && near(via.dir[0], 0, .01));
  ok('e non in diagonale, perche il piu grosso e uno solo', via.diagonal === false);

  const due = CH.awayFrom(me, [grosso, { ...piccolo, us:9 }]);
  ok('a pari Forza d Unita si va in diagonale fra i due', due.diagonal === true);
  ok('cioe a quarantacinque gradi', near(Math.abs(due.deg), 45, 1));

  const cede = CH.backwardMove('give', me, [grosso]);
  ok('il cedimento e di due pollici', cede.inches === 2);
  ok('senza girarsi: si resta di fronte al nemico', cede.to.rot === 0);
  ok('e la riga si legge', /cede terreno di 2″ lontano da Kroxigor/.test(cede.text));

  const fuga = CH.backwardMove('flee', me, [grosso], { roll:8 });
  ok('la fuga e quello che hanno detto i dadi', fuga.inches === 8);
  ok('e chi fugge gira le spalle', fuga.to.rot === 180);
  ok('finendo otto pollici piu in la', near((fuga.to.y - me.y) / MM, 8, .01));

  const rip = CH.backwardMove('fallBack', me, [grosso], { roll:6 });
  ok('il ripiegamento in ordine tiene il dado maggiore, e il libro lo scrive',
     /maggiore/.test(CH.BACKWARD.fallBack.dice) && /134/.test(rip.nota));
  ok('e dice che l unita si raduna da sola', /si raduna/.test(rip.nota));
  ok('e resta girato verso il nemico', rip.to.rot === 0);

  const ins = CH.pursuitMove(me, grosso, { roll:7 });
  ok('l inseguimento va verso, non lontano', near((ins.to.y - me.y) / MM, -7, .01));
  ok('e non fa mai meno di due pollici', CH.pursuitMove(me, grosso, { roll:0 }).inches === 2);
}

/* ================================================================= */
console.log('\nquello che sta intorno alla carica (pp. 101, 119, 123, 125, 133)');
{
  ok('un reggimento fermo puo caricare', CH.canCharge({}).can === true);
  ok('chi sta fuggendo no', CH.canCharge({ fleeing:true }).can === false);
  ok('chi e in mischia no', CH.canCharge({ engaged:true }).can === false);
  ok('chi si e appena radunato no', CH.canCharge({ rallied:true }).can === false);
  ok('e la riga dice sempre perche',
     CH.canCharge({ rallied:true }).why.join(' ').includes('radunata'));
  ok('la colonna di marcia dichiara ma non muove',
     CH.canCharge({ column:true }).can === true &&
     CH.canCharge({ column:true }).canMove === false);

  const me = boxCorners({ x:0, y:0, w:5 * MM, h:2 * MM, rot:0 });
  const vicino = unit('Skink', 0, -6, 5 * MM, 2 * MM, 180);
  const lontano = unit('Skink', 0, -20, 5 * MM, 2 * MM, 180);
  ok('entro otto pollici marciare chiede il test',
     CH.marchCheck(me, [vicino]).needsTest === true);
  ok('e la riga nomina chi si sta guardando',
     /Skink/.test(CH.marchCheck(me, [vicino]).why));
  ok('piu in la si marcia libero', CH.marchCheck(me, [lontano]).needsTest === false);
  ok('chi sta fuggendo non si guarda',
     CH.marchCheck(me, [{ ...vicino, fleeing:true }]).needsTest === false);
  ok('e chi vola non tira il test (p. 170)',
     CH.marchCheck(me, [vicino], { fly:true }).needsTest === false);

  ok('la marcia raddoppia il Movimento', CH.moveAllowance(4, { kind:'march' }).inches === 8);
  ok('in colonna lo triplica',
     CH.moveAllowance(4, { kind:'march', column:true }).inches === 12);
  ok('indietro e di lato si va a meta', CH.moveAllowance(4, { kind:'back' }).inches === 2);
  ok('il terreno difficile toglie un pollice',
     CH.moveAllowance(4, { slow:true }).inches === 3);
  ok('e lo dichiara', /terreno difficile/.test(CH.moveAllowance(4, { slow:true }).why.join(' ')));
  ok('senza Movimento sul profilo non si inventa niente', CH.moveAllowance(0).inches === 0);

  ok('le manovre stanno scritte con la pagina accanto',
     CH.MANOEUVRES.length === 7 && CH.MANOEUVRES.every(m => m.page > 0 && m.cost));
  ok('il test di Pericolo si passa a 4+, uno per modello',
     CH.perilAsk(8).need === 4 && CH.perilAsk(8).n === 8);
}

/* ================================================================= */
console.log('\nla riga che si legge prima di dichiarare');
{
  const orc = unit('Orc Mobs', 0, 0, 5 * MM, 2 * MM, 0, { move:4, swift:false });
  const vicino = unit('Skink', 0, -8, 5 * MM, 2 * MM, 180);
  const dietro = unit('Saurus', 0, 8, 5 * MM, 2 * MM);
  const palude = piece('Palude', 0, -4, 6, 3, MARSH);

  const rows = CH.chargeSurvey(orc, [dietro, vicino], { pieces:[palude] });
  ok('prima quelli che si possono caricare', rows[0].target === 'Skink' && rows[0].can === true);
  ok('la palude sulla strada fa tenere il dado peggiore', rows[0].dice.worst === true);
  ok('e chiede il test di terreno pericoloso', rows[0].terrain.danger === true);
  ok('e la carica arriva gia allineata', rows[0].align && rows[0].align.side === 'fronte');
  ok('quello dietro resta in fondo con il suo perche', rows[1].can === false);
}

console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
