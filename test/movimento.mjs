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
console.log('fin dove arriva una carica (p. 119)');
{
  const b = CH.chargeBands(4);
  ok('il massimo e Movimento piu dodici', b.max === 16);
  ok('la media di due dadi e sette', b.avg === 11);
  ok('il passo lungo non arriva piu lontano, ci arriva piu spesso',
     CH.chargeBands(4, true).max === 16 && CH.chargeBands(4, true).avg > b.avg);

  ok('un tiro di sette riesce ventuno volte su trentasei',
     near(CH.chargeChance(7), 21 / 36, 0.001));
  ok('il dodici una volta su trentasei', near(CH.chargeChance(12), 1 / 36, 0.001));
  ok('quello che si copre camminando riesce sempre', CH.chargeChance(0) === 1);
  ok('e oltre il dodici non riesce mai', CH.chargeChance(13) === 0);
  ok('il passo lungo rende ogni punteggio piu facile',
     CH.chargeChance(9, true) > CH.chargeChance(9));
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
  ok('con quante probabilita', near(d.chance, 1, .001));

  /* dietro le spalle */
  const back = CH.declareCharge({ charger: orc, target: unit('Skink', 0, 8, 5 * MM, 2 * MM) });
  ok('quello che sta dietro non si carica', back.can === false && !back.inArc);
  ok('e la riga dice da che parte sta', /retro/.test(back.why));

  /* troppo lontano: il manuale vieta di dichiarare una carica che non
     puo riuscire */
  const far = CH.declareCharge({ charger: orc, target: unit('Skink', 0, -30, 5 * MM, 2 * MM) });
  ok('una carica che non puo riuscire non si dichiara', far.impossible && !far.can);
  ok('e la riga dice di quanto si sfora', /massimo a 16″/.test(far.why));

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
console.log('\nil tiro di carica e il terreno');
{
  const plain = CH.chargeDice({});
  ok('normale sono due dadi', plain.n === 2 && plain.drop === null);
  const swift = CH.chargeDice({ swift:true });
  ok('il passo lungo ne tira tre e butta il minore', swift.n === 3 && swift.drop === 'lowest');
  const worst = CH.chargeDice({ worst:true });
  ok('il difficile ne tira tre e butta il maggiore', worst.n === 3 && worst.drop === 'highest');
  ok('e lo dichiara da verificare, perche il piano non dice con quanti dadi',
     worst.daVerificare === true && !swift.daVerificare);

  ok('il passo lungo tiene i due migliori', CH.keepDice([2, 4, 5], swift).join() === '4,5');
  ok('il difficile tiene i due peggiori', CH.keepDice([2, 4, 5], worst).join() === '2,4');
  ok('tutti e due tengono quelli di mezzo',
     CH.keepDice([1, 3, 4, 6], CH.chargeDice({ swift:true, worst:true })).join() === '3,4');

  const made = CH.chargeOutcome({ dice:[4, 5], spec:plain, move:4, dist:9 });
  ok('quattro di Movimento e nove di dadi fanno tredici', made.reach === 13);
  ok('e la carica arriva', made.made === true && made.short === 0);
  const missed = CH.chargeOutcome({ dice:[1, 2], spec:plain, move:4, dist:12 });
  ok('un tiro corto resta corto', missed.made === false && missed.short === 5);
}

/* ================================================================= */
console.log('\nil terreno attraversato (p. 270)');
{
  const wood = piece('Bosco', 0, -4, 6, 3, WOOD);
  const list = CH.crossed([0, 0], [0, -8 * MM], [wood]);
  ok('il bosco sulla strada si vede', list.length === 1);
  const eff = CH.terrainEffect(list);
  ok('rallenta, fa tenere il peggiore e toglie i ranghi',
     eff.slow && eff.worstDie && eff.disorder && !eff.danger);
  const dis = CH.disorderedCharge(list);
  ok('e la carica e disordinata', dis.disordered === true);
  ok('con la pagina scritta accanto', /p\. 270/.test(dis.text));

  const clear = CH.crossed([0, 0], [8 * MM, 0], [wood]);
  ok('quello che sta da un altra parte non conta', clear.length === 0);
  ok('e senza terreno non c e disordine', CH.disorderedCharge(clear).disordered === false);
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
console.log('\nfuga, cedimento, ripiegamento (pp. 154-155)');
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
  ok('il ripiegamento dichiara che i suoi dadi vanno confrontati col libro',
     rip.daVerificare === true && /p\. 154/.test(rip.nota));
  ok('e resta girato verso il nemico', rip.to.rot === 0);

  const ins = CH.pursuitMove(me, grosso, { roll:7 });
  ok('l inseguimento va verso, non lontano', near((ins.to.y - me.y) / MM, -7, .01));
  ok('e non fa mai meno di due pollici', CH.pursuitMove(me, grosso, { roll:0 }).inches === 2);
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
