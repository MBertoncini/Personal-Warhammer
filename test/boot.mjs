/* Avvia la pagina intera in jsdom e controlla che tutto si regga:
 * le cinque schede, le anteprime, l'annulla, lo zoom, gli aiuti
 * tattici, il ventaglio di movimento, il campo di tiro, lo scontro
 * simulato, la modalita' partita con il registro dei turni e il
 * battle report, il terreno casuale e il link.
 * Si lancia con:  node test/boot.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

/* import.meta.dirname vuole Node >= 20.11; questa forma va anche prima.
   fileURLToPath e non pathname: un percorso con uno spazio dentro
   arriverebbe con %20 e il file non si aprirebbe. */
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
                      { pretendToBeVisual: true, url: 'https://example.org/' });
const { window } = dom;

for (const k of ['window', 'document', 'Image', 'FileReader', 'Blob', 'URL',
                 'HTMLElement', 'Node', 'Element', 'SVGElement', 'getComputedStyle',
                 'requestAnimationFrame', 'cancelAnimationFrame',
                 'location', 'history', 'btoa', 'atob', 'XMLSerializer',
                 'DOMParser', 'Event', 'MouseEvent']) {
  Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true });
}
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.localStorage = window.localStorage;
/* i dadi rotolano per un secondo buono: nella prova si vogliono i
   numeri, non lo spettacolo. La rotolata vera ha una prova sua, in
   fondo, che si aspetta il tempo che ci vuole. */
window.localStorage.setItem('tow-dice-anim', '0');
globalThis.alert = () => {};
globalThis.confirm = () => true;
globalThis.prompt = () => 'Scenario di prova';
window.HTMLCanvasElement.prototype.getContext = () => ({ fillRect(){}, drawImage(){}, fillStyle:'' });
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';

const errors = [];
window.addEventListener('error', e => errors.push(e.message));
const warn = console.warn;
console.warn = (...a) => { errors.push(a.join(' ')); warn(...a); };

await import('../src/main.js');
await new Promise(r => setTimeout(r, 400));   // l'avvio e' asincrono

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};
const doc = window.document;
const click = sel => doc.querySelector(sel).dispatchEvent(new window.Event('click'));
const setField = (sel, v) => {
  const el = doc.querySelector(sel);
  el.value = String(v);
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const settle = (ms = 60) => new Promise(r => setTimeout(r, ms));

/* prompt() e confirm() non ci sono piu': l'app apre una sua finestra.
   Qui si risponde come risponderebbe una persona — si scrive nel campo
   e si preme il tasto. */
const dialogOpen = () => !!doc.querySelector('.dlg-back');
async function answer(value = null){
  await settle(30);
  const back = doc.querySelector('.dlg-back');
  if (!back) return false;
  if (value !== null){
    const inp = back.querySelector('[data-dlg-value]');
    if (inp) inp.value = value;
  }
  back.querySelector('[data-dlg="ok"]').dispatchEvent(new window.Event('click'));
  await settle(30);
  return true;
}

console.log('avvio');
ok('nessun errore in console', errors.length === 0);
ok('la lista d\'esempio e caricata', doc.querySelectorAll('#armies .row').length > 0);
ok('il campo e disegnato', doc.querySelector('#board').children.length > 0);
ok('gli elementi scenici sono a posto', doc.querySelectorAll('#terrain-list .row').length > 0);

console.log('\nanteprime compatte');
const firstRow = doc.querySelector('#armies .row .minis');
ok('la riga chiusa mostra una anteprima e il moltiplicatore',
   firstRow && firstRow.children.length === 2 && /^×\d+$/.test(firstRow.children[1].textContent));

console.log('\nschede');
for (const t of ['catalog', 'lists', 'matchup', 'report', 'deploy']) {
  doc.querySelector(`[data-tab="${t}"]`).dispatchEvent(new window.Event('click'));
  const panel = doc.querySelector(`[data-panel="${t}"]`);
  ok(`scheda ${t} visibile e piena`, !panel.hidden && panel.textContent.trim().length > 20);
}
ok('nessun errore dopo il giro delle schede', errors.length === 0);

console.log('\nfoto sul campo');
/* La lista d'esempio parte con il catalogo vuoto: la voce e la foto
   arrivano dopo, come quando le carichi a mano. Devono comparire sul
   campo senza reimportare niente. */
const cat = await import('../src/catalog.js');
const catId = await cat.upsertEntry(
  { name: 'Saurus Warriors', faction: 'Lizardmen', baseId: '30x30', baseW: 30, baseH: 30, owned: 12 },
  { merge: true });
await cat.setPhotoData(catId, 'data:image/jpeg;base64,AAAA');
await settle(120);

const board = doc.querySelector('#board');
ok('la foto sta nei defs una volta sola', board.querySelectorAll('symbol').length === 1);
ok('una foto per base', board.querySelectorAll('use').length === 12);
ok('le anteprime del pannello si aggiornano', doc.querySelectorAll('#armies .minis img').length > 0);

/* la striscia intera resta all'unita selezionata: e li che serve contarle */
const rows = () => [...doc.querySelectorAll('#armies .row')];
const saurus = rows().find(r => /Saurus Warriors/.test(r.textContent));
saurus.dispatchEvent(new window.Event('click'));
const selMinis = doc.querySelector('#armies .row.sel .minis');
ok('l\'unita selezionata mostra una anteprima per modello',
   selMinis && selMinis.querySelectorAll('img').length === 12);

click('#btn-photos');
ok('la levetta Foto le toglie', board.querySelectorAll('use').length === 0);
click('#btn-photos');
ok('e le rimette', board.querySelectorAll('use').length === 12);
ok('nessun errore con le foto accese', errors.length === 0);

/* ================================================================= */
const deploy = await import('../src/deploy.js');
const { state, history, view } = deploy;

console.log('\nannulla e ripeti');
const target = state.units.find(u => u.placed);
const x0 = target.x;
deploy.act('sposta', () => { target.x = x0 + 100; });
ok('la modifica e applicata', target.x === x0 + 100);
ok('c\'e qualcosa da annullare', history.canUndo === true);
history.undo();
ok('annulla riporta la posizione di prima',
   state.units.find(u => u.uid === target.uid).x === x0);
history.redo();
ok('ripeti la riporta avanti',
   state.units.find(u => u.uid === target.uid).x === x0 + 100);
history.undo();

const placedBefore = state.units.filter(u => u.placed).length;
click('#btn-recall');
ok('"Ritira tutto" svuota il campo', state.units.filter(u => u.placed).length === 0);
history.undo();
ok('...e un annulla lo rimette com\'era',
   state.units.filter(u => u.placed).length === placedBefore);

console.log('\ninquadratura');
const vb = () => doc.querySelector('#board').getAttribute('viewBox').split(' ').map(Number);
const wide = vb()[2];
view.zoomBy(2);
ok('lo zoom stringe il riquadro', vb()[2] < wide * 0.6);
ok('la percentuale e scritta nella barra', /\d+%/.test(doc.querySelector('#zoom-level').textContent));
click('#btn-fit');
ok('"Adatta" torna al tavolo intero', Math.abs(vb()[2] - wide) < 0.01);

console.log('\naiuti tattici');
const mine = state.units.find(u => u.army === 'A' && u.placed);
state.sel = { type: 'unit', id: mine.uid };
const near = deploy.surveyFor(mine);
ok('le distanze verso i nemici sono misurate', near.length > 0);
ok('sono in pollici e ordinate dalla piu vicina',
   near[0].dist >= 0 && near[0].dist <= near[near.length - 1].dist);
ok('la distanza e dal bordo, non dal centro',
   near[0].dist < Math.hypot(near[0].unit.x - mine.x, near[0].unit.y - mine.y) / 25.4);
click('#btn-dist'); click('#btn-arcs');
deploy.renderAll();
ok('archi e distanze si disegnano senza errori', errors.length === 0);
click('#btn-dist'); click('#btn-arcs');
/* le minacce: rosso dove un nemico potrebbe caricare l'unita' scelta,
   e sotto l'unita' quanto la caricano dove sta adesso */
{
  const prima = doc.querySelectorAll('#board rect').length;
  click('#btn-threats');
  deploy.renderAll();
  const scritta = [...doc.querySelectorAll('#board text')].find(t => /ti caricano|nessuno ti carica/.test(t.textContent));
  ok('le minacce si disegnano senza errori, e dicono quanto ti caricano dove sei',
     errors.length === 0 && !!scritta && doc.querySelectorAll('#board rect').length > prima);
  click('#btn-threats');
}

console.log('\nmovimento e tiro');
click('#btn-move');
deploy.renderAll();
ok('il ventaglio di movimento si disegna senza errori', errors.length === 0);
/* quattro fasce: movimento, marcia, carica e carica massima */
ok('e mette sul campo un poligono per fascia',
   doc.querySelectorAll('#board polygon').length >= 4);
click('#btn-move');

const shooter = state.units.find(u => u.placed && u.maxRange > 0);
state.sel = { type: 'unit', id: shooter.uid };
click('#btn-shoot');
deploy.renderAll();
const plan = deploy.shootPlanFor(shooter);
ok('il piano di tiro conosce arma e gittata', !!plan && plan.range > 0);
ok('e per ogni nemico dice se lo prende',
   plan.rows.length > 0 && plan.rows.every(r => typeof r.canShoot === 'boolean'));
ok('la gittata corta e meta di quella lunga',
   plan.rows.every(r => !r.long || r.dist > plan.range / 2));
ok('quello che non si vede non si puo tirare',
   plan.rows.every(r => !(r.blocked && r.canShoot)));

/* un bosco piantato in mezzo deve togliere la vista a qualcuno */
const victim = plan.rows[0].unit;
const mid = { tid: 9001, kind: 'wood', x: (shooter.x + victim.x) / 2, y: (shooter.y + victim.y) / 2,
              w: 10, h: 10, rot: 0 };
deploy.act('bosco di prova', () => { state.terrain.push(mid); });
const shaded = deploy.shootPlanFor(shooter).rows.find(r => r.unit.uid === victim.uid);
ok('il bosco in mezzo interrompe la linea di vista', !!shaded.blocked);
ok('e il bersaglio smette di essere tirabile', shaded.canShoot === false);
history.undo();

/* un reggimento in mezzo toglie la vista come il bosco (p. 103): il
   piu' largo del tavolo, di traverso a meta' strada */
const muro = state.units.filter(u => u.placed && u.uid !== shooter.uid && u.uid !== victim.uid)
  .sort((a, b) => b.frontage * b.baseW - a.frontage * a.baseW)[0];
deploy.act('reggimento in mezzo', () => {
  muro.x = (shooter.x + victim.x) / 2; muro.y = (shooter.y + victim.y) / 2; muro.rot = shooter.rot;
});
const dietroMuro = deploy.shootPlanFor(shooter).rows.find(r => r.unit.uid === victim.uid);
ok('un reggimento in mezzo interrompe la linea di vista (p. 103)', !!dietroMuro.blocked);
ok('e la riga dice chi', dietroMuro.blockedBy === muro.name);
history.undo();

/* dalla collina tira anche la seconda fila (p. 143) */
deploy.act('collina sotto', () => {
  state.terrain.push({ tid: 9002, kind: 'hill', x: shooter.x, y: shooter.y, w: 30, h: 20, rot: 0 });
});
ok('tutta sulla collina, il piano lo sa', deploy.shootPlanFor(shooter).hill === true);
history.undo();
ok('e scesa dalla collina non piu', deploy.shootPlanFor(shooter).hill === false);

/* La mira: una linea che segue il puntatore e dice se il colpo arriva.
   Sul tavolo vuoto i colori sono certi: verde a corta gittata, giallo a
   lunga, rosso oltre, grigio fuori arco. */
{
  const FMy = await import('../src/formation.js');
  state.sel = { type: 'unit', id: shooter.uid };
  deploy.renderAll();
  const mirino = doc.querySelector('#inspector [data-aim^="shoot"]');
  ok('il pannello del tiro ha il mirino', !!mirino);
  mirino.dispatchEvent(new window.Event('click'));
  const gitt = deploy.shootPlanFor(shooter).range;
  deploy.act('tavolo vuoto', () => {
    state.terrain = [];
    for (const o of state.units) if (o.uid !== shooter.uid) o.placed = false;
  });
  const lay = FMy.layout(shooter, { alive: deploy.effModels(shooter) });
  const ang = (shooter.rot || 0) * Math.PI / 180, dir = [Math.sin(ang), -Math.cos(ang)];
  const at = d => [shooter.x + dir[0] * (lay.h / 2 + d * 25.4), shooter.y + dir[1] * (lay.h / 2 + d * 25.4)];
  ok('a corta gittata la mira e verde', deploy.aimVerdict(at(gitt / 4)).tone === 'ok');
  ok('a lunga gittata gialla', deploy.aimVerdict(at(gitt * 0.75)).tone === 'long');
  ok('oltre la gittata rossa', deploy.aimVerdict(at(gitt * 1.5)).tone === 'far');
  ok('e dietro le spalle grigia, fuori arco',
     shooter.loose || /fuori arco/.test(deploy.aimVerdict(at(-gitt / 2 - lay.h / 25.4)).lines.join(' ')));
  deploy.setAimPoint(at(gitt / 4));
  deploy.renderAll();
  ok('la linea si disegna sul tavolo', !!doc.querySelector('#board .aim line'));

  /* sopra un nemico il cartellino dice il tiro e il clic lo gioca */
  /* dopo un Annulla le unita' sono rifatte: si riprende quella viva */
  const bersaglioVivo = state.units.find(o => o.uid === victim.uid);
  deploy.act('bersaglio davanti', () => {
    bersaglioVivo.placed = true; [bersaglioVivo.x, bersaglioVivo.y] = at(gitt / 3);
    bersaglioVivo.rot = ((shooter.rot || 0) + 180) % 360;
  });
  const sopra = deploy.aimVerdict([bersaglioVivo.x, bersaglioVivo.y]);
  ok('sopra un nemico la mira lo riconosce', !!sopra && sopra.target && sopra.target.uid === victim.uid);
  ok('e dice quanti tirano e cosa serve', /per colpire/.test(sopra.lines.join(' ')));

  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  ok('Esc toglie la mira', deploy.aimVerdict(at(gitt / 4)) === null);
  deploy.setAimPoint(null);
  history.undo(); history.undo();
  deploy.renderAll();
}

/* La Tappa 4: il conto dei tiratori e il cancello di p. 137 arrivano
   dal tavolo vero, non da una casella spuntata. */
/* Un bersaglio tirabile con niente in mezzo deve avere qualcuno che
   tira davvero: la versione di prima di questa prova controllava solo
   che il numero esistesse, e non si era accorta che era sempre zero. */
const tirabile = plan.rows.find(r => r.canShoot && !r.blocked);
ok('il piano dice quanti modelli tirano davvero',
   !tirabile || deploy.shotOn(shooter, tirabile, plan).survey.n > 0);
ok('e perche gli altri no',
   ['rank', 'range', 'sight'].every(k => typeof deploy.shotOn(shooter, plan.rows[0], plan).survey.out[k] === 'number'));
ok('chi non ha fatto niente puo tirare', deploy.shootPlanFor(shooter).gate.can === true);
deploy.act('carica finta', () => { shooter.moved = { kind:'charge', inches: 5 }; });
ok('chi ha caricato no', deploy.shootPlanFor(shooter).gate.can === false);
history.undo();

/* la sagoma: si posa, si disegna, e dice chi ci sta sotto */
deploy.renderAll();
const bersaglio = plan.rows[0].unit;
deploy.act('sagoma di prova', () => {
  state.extras = { template: { id:'large', x: bersaglio.x, y: bersaglio.y, angle: 0, by: shooter.uid } };
});
ok('la sagoma finisce sul tavolo', doc.querySelectorAll('#board circle').length > 0);
ok('e dice quanti ci stanno sotto', /sotto/.test(doc.querySelector('#board').textContent));
history.undo();
deploy.renderAll();

click('#btn-shoot');
ok('nessun errore con movimento e tiro accesi', errors.length === 0);

console.log('\nscontro simulato');
const duelHost = doc.querySelector('#duel');
const attacker = state.units.find(u => u.army === 'A' && u.placed && u.models > 4);
state.sel = { type: 'unit', id: attacker.uid };
deploy.renderAll();
const swords = doc.querySelectorAll('#inspector [data-duel]');
ok('l\'ispettore propone lo scontro contro i nemici vicini', swords.length > 0);
swords[0].dispatchEvent(new window.Event('click'));
ok('il pannello dello scontro si apre', duelHost.hidden === false);
ok('mostra le due schiere e la previsione',
   duelHost.querySelectorAll('.duel-side').length === 2 && /in media/.test(duelHost.textContent));

/* si tira finche' qualcuno cade: cosi' la prova vede anche il pulsante
   che riporta le perdite sul tavolo */
let applyBtn = null;
for (let i = 0; i < 25 && !applyBtn; i++){
  duelHost.querySelector('#d-roll').dispatchEvent(new window.Event('click'));
  /* il tiro passa dal vassoio prima di scrivere il conto: senza
     l'attesa si leggerebbe il pannello di prima */
  await settle(20);
  applyBtn = duelHost.querySelector('#d-apply');
}
ok('tirati i dadi si vedono le facce', duelHost.querySelectorAll('.die').length > 0);
ok('e il conto di fine assalto', /Risoluzione/.test(duelHost.textContent));
ok('in venticinque assalti qualcuno cade sempre', !!applyBtn);

/* chi sia il difensore lo dice l'intestazione della seconda parte, non
   il testo del pannello: da quando c'e' la tendina che aggiunge un'unita'
   al combattimento, nel pannello compaiono i nomi di tutto l'esercito */
const headB = duelHost.querySelectorAll('.duel-group')[1].querySelector('.army-head b').textContent;
const defender = state.units.find(u => u.army === 'B' && u.name === headB);
ok('il pannello dice chi e il difensore', !!defender);
const lostBefore = (attacker.lost || 0) + (defender ? defender.lost || 0 : 0);
applyBtn.dispatchEvent(new window.Event('click'));
const lostAfter = (attacker.lost || 0) + (defender ? defender.lost || 0 : 0);
ok('le perdite dello scontro finiscono sulle unita', lostAfter > lostBefore);
history.undo();
ok('e anche quelle si annullano',
   (state.units.find(u => u.uid === attacker.uid).lost || 0) +
   (defender ? state.units.find(u => u.uid === defender.uid).lost || 0 : 0) === lostBefore);

duelHost.querySelector('#d-odds').dispatchEvent(new window.Event('click'));
ok('la simulazione riporta le percentuali', /500 assalti simulati/.test(duelHost.textContent));

/* se una delle due sparisce il pannello si chiude invece di mostrare
   un'unita' che non c'e' piu' */
deploy.act('rimuovi', () => { state.units = state.units.filter(u => u.uid !== attacker.uid); });
ok('l\'unita rimossa chiude il pannello', duelHost.hidden === true);
history.undo();

/* Fianco e retro li guarda il tavolo, a ogni round (p. 152): due unita'
   messe a contatto sul fianco, senza nessuna carica */
{
  const FMx = await import('../src/formation.js');
  const Dx = await import('../src/duel.js');
  const preda = state.units.find(u => u.army === 'B' && u.placed && u.models > 4);
  const lupo = state.units.find(u => u.army === 'A' && u.placed && u.models > 4 && u.uid !== preda.uid);
  deploy.act('sul fianco', () => {
    preda.rot = 0; preda.x = 600; preda.y = 400; lupo.charged = null;
    const lp = FMx.layout(preda, { alive: deploy.effModels(preda) });
    const ll = FMx.layout(lupo, { alive: deploy.effModels(lupo) });
    lupo.rot = 270;                                   // il fronte guarda verso -x
    lupo.x = preda.x + lp.w / 2 + ll.h / 2; lupo.y = preda.y;
  });
  Dx.openDuel(lupo, preda);
  ok('a contatto sul fianco lo scontro lo sa senza carica (p. 152)',
     duelHost.querySelector('#d-flk-A0').value === 'flank');
  ok('e chi e preso di fianco colpisce di fronte', duelHost.querySelector('#d-flk-B0').value === '');
  ok('e il pannello dice da dove lo ha visto', /Dal tavolo/.test(duelHost.textContent));
  Dx.closeDuel();
  history.undo();
}
/* La terza unita' nel pannello (p. 153): il combattimento a piu' di due
   e' il normale del tavolo, e il pannello lo apriva a coppie. */
{
  const Dx = await import('../src/duel.js');
  const preda = state.units.find(u => u.army === 'B' && u.placed && !u.dead && deploy.effModels(u) > 4);
  const primo = state.units.find(u => u.army === 'A' && u.placed && !u.dead && deploy.effModels(u) > 4);
  Dx.openDuel(primo, preda);
  const add = duelHost.querySelector('#d-add-A');
  ok('il pannello propone chi aggiungere alla parte', !!add && add.options.length > 1);
  const altro = state.units.find(u => u.army === 'A' && u.uid !== primo.uid &&
                                 [...add.options].some(o => +o.value === u.uid));
  add.value = String(altro.uid);
  add.dispatchEvent(new window.Event('change'));
  ok('aggiunta, la parte ha due unita e il pannello tre schiere',
     duelHost.querySelectorAll('.duel-side').length === 3);
  ok('e la previsione parla di tutte e due',
     duelHost.textContent.includes(altro.name));
  duelHost.querySelector('#d-roll').dispatchEvent(new window.Event('click'));
  await settle(20);
  const teste = [...duelHost.querySelectorAll('.duel-step .dl-head b')].map(x => x.textContent);
  ok('menano tutte e due, e ogni mucchio di dadi dice di chi e',
     teste.includes(primo.name) && teste.includes(altro.name));
  ok('il conto di fine assalto dice chi ha portato cosa',
     /il fianco una volta per unità nemica/.test(duelHost.textContent));
  duelHost.querySelector('#d-drop-A1').dispatchEvent(new window.Event('click'));
  ok('e la si toglie dal combattimento con una crocetta',
     duelHost.querySelectorAll('.duel-side').length === 2);
  Dx.closeDuel();
}
/* Il capo dentro il reggimento entra nel combattimento con lui (p. 209):
   prima il pannello ne contava la psicologia e non i suoi attacchi. */
{
  const Dx = await import('../src/duel.js');
  const FMx = await import('../src/formation.js');
  const regg = state.units.find(u => u.army === 'A' && u.placed && !u.dead && deploy.effModels(u) > 4);
  const capo = state.units.find(u => u.army === 'A' && !u.dead && u.uid !== regg.uid && FMx.canJoin(u));
  const preda = state.units.find(u => u.army === 'B' && u.placed && !u.dead && deploy.effModels(u) > 4);
  deploy.act('unisci il capo', () => { capo.join = { host: regg.uid }; capo.placed = false; });
  Dx.openDuel(regg, preda);
  const teste = [...duelHost.querySelectorAll('.duel-side .army-head b')].map(x => x.textContent);
  ok('il capo unito entra nel pannello con il suo reggimento', teste.includes(capo.name));
  ok('e la sua riga dice dove sta', /Dentro/.test(duelHost.textContent));
  ok('senza che nessuno lo possa colpire', !!duelHost.querySelector('#d-tgt-A1'));
  duelHost.querySelector('#d-roll').dispatchEvent(new window.Event('click'));
  await settle(20);
  const bersagli = [...duelHost.querySelectorAll('.duel-step .dl-head span')].map(x => x.textContent);
  ok('il capo mena', [...duelHost.querySelectorAll('.duel-step .dl-head b')].map(x => x.textContent).includes(capo.name));
  ok('e nessuno mena a lui', !bersagli.some(t => t.includes('su ' + capo.name)));
  /* finche' non glieli si dirige */
  duelHost.querySelector('#d-tgt-A1').checked = true;
  duelHost.querySelector('#d-tgt-A1').dispatchEvent(new window.Event('change'));
  let visto = false;
  for (let k = 0; k < 10 && !visto; k++){
    duelHost.querySelector('#d-roll').dispatchEvent(new window.Event('click'));
    await settle(20);
    visto = [...duelHost.querySelectorAll('.duel-step .dl-head span')]
      .some(x => x.textContent.includes('su ' + capo.name));
  }
  ok('spuntata la casella, i nemici ce li dirigono', visto);
  Dx.closeDuel();
  history.undo();
}
ok('nessun errore nello scontro simulato', errors.length === 0);

console.log('\nil vassoio dei dadi');
const tray = () => doc.querySelector('#dicebox');
const pickKind = k => tray().querySelector(`[data-kind="${k}"]`).dispatchEvent(new window.Event('click'));
const rollDice = async (ms = 40) => {
  tray().querySelector('#dx-roll').dispatchEvent(new window.Event('click'));
  await settle(ms);
};
click('#btn-dice');
ok('il vassoio si apre dalla barra del tavolo', !!tray() && tray().hidden === false);
ok('e propone i quattro dadi del manuale',
   tray().querySelectorAll('[data-kind]').length === 4);

pickKind('d6');
setField('#dx-n', 5);
setField('#dx-target', 4);
await rollDice();
const cubes = [...tray().querySelectorAll('.d3d')];
ok('cinque D6 sono cinque cubi', cubes.length === 5);
ok('e ogni cubo ha sei facce', cubes.every(c => c.querySelectorAll('.f').length === 6));
/* il controllo che tiene in piedi tutto: il cubo si ferma girato in
   modo da mostrare proprio la faccia uscita, non un'altra */
const LANDING = { 1:'rotateX(0.0deg) rotateY(0.0deg)', 2:'rotateX(0.0deg) rotateY(-90.0deg)',
                  3:'rotateX(-90.0deg) rotateY(0.0deg)', 4:'rotateX(90.0deg) rotateY(0.0deg)',
                  5:'rotateX(0.0deg) rotateY(90.0deg)', 6:'rotateX(0.0deg) rotateY(180.0deg)' };
ok('e si ferma sulla faccia che e uscita davvero',
   cubes.every(c => c.style.transform.includes(LANDING[c.dataset.face])));
ok('i dadi passati si accendono, e sono quelli giusti',
   tray().querySelectorAll('.d3d.win').length ===
   cubes.filter(c => +c.dataset.face >= 4).length);
ok('la riga di lettura dice le facce e il conto',
   /^5D6: .* — \d su 5 a 4\+$/.test(tray().querySelector('.dl-out').textContent));

pickKind('d3');
setField('#dx-n', 3);
await rollDice();
ok('il D3 mostra tre facce sole',
   [...tray().querySelectorAll('.d3d .f1 .num')].every(n => +n.textContent >= 1 && +n.textContent <= 3));
ok('e si legge come D3', /^3D3:/.test(tray().querySelector('.dl-out').textContent));

pickKind('artillery');
setField('#dx-n', 1);
await rollDice();
ok('il dado di artiglieria porta i numeri pari e il Mancato Colpo',
   /Artiglieria: (2|4|6|8|10|Mancato Colpo)/.test(tray().textContent));

pickKind('scatter');
await rollDice();
ok('la deviazione tira due dadi diversi, direzione e distanza',
   tray().querySelectorAll('.dice-group').length === 2);
ok('e la lettura dice dove e di quanto',
   /Deviazione: (Colpito!|\d+″ verso)/.test(tray().querySelector('.dl-out').textContent));

/* con la rotolata accesa il risultato non si scrive prima: i cubi
   girano e la riga arriva dopo. E' l'unica ragione per cui girano. */
const anim = tray().querySelector('#dx-anim');
anim.checked = true;
anim.dispatchEvent(new window.Event('change', { bubbles: true }));
pickKind('d6');
setField('#dx-n', 4);
await rollDice(60);
ok('mentre i dadi rotolano il risultato non c e ancora',
   tray().querySelector('#dx-out').textContent.trim() === '');
await settle(1300);
ok('e quando si fermano compare', /4D6:/.test(tray().querySelector('#dx-out').textContent));
anim.checked = false;
anim.dispatchEvent(new window.Event('change', { bubbles: true }));

tray().querySelector('#dx-close').dispatchEvent(new window.Event('click'));
ok('il vassoio si chiude', tray().hidden === true);
ok('nessun errore attorno ai dadi', errors.length === 0);

console.log('\nle tabelle del manuale');
const charts = () => doc.querySelector('#charts');
const chartPick = (key, v) => {
  const s = charts().querySelector(`[data-ckey="${key}"]`);
  s.value = String(v);
  s.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const chartTab = id => charts().querySelector(`[data-ctab="${id}"]`).dispatchEvent(new window.Event('click'));
const lit = () => charts().querySelector('td.hl').textContent;
window.localStorage.removeItem('tow-charts');
click('#btn-charts');
ok('la scheda si apre dalla barra, accanto ai dadi', !!charts() && charts().hidden === false);
ok('e parte dalla mischia', charts().querySelector('[data-ctab="melee"]').classList.contains('on'));
ok('la cella accesa e AC 4 contro AC 3, a 3+', lit() === '3+');
ok('la griglia e dieci per dieci', charts().querySelectorAll('table.chart tbody td').length === 100);
chartPick('wsA', 7); chartPick('wsD', 3);
ok('piu del doppio colpisce a 2+', lit() === '2+');

chartTab('wound');
chartPick('s', 3); chartPick('t', 9);
ok('F 3 contro R 9 non ferisce', lit() === '–' &&
   /non ferisce/.test(charts().querySelector('.chart-verdict').textContent));
charts().querySelector('td[data-r="4"][data-c="4"]').dispatchEvent(new window.Event('click'));
ok('toccare una cella sceglie la sua riga e la sua colonna',
   lit() === '4+' && /F 4 contro R 4/.test(charts().textContent));

chartTab('shoot');
chartPick('bs', 2);
for (const id of ['moved', 'long']){
  const c = charts().querySelector(`[data-cflag="${id}"]`);
  c.checked = true;
  c.dispatchEvent(new window.Event('change', { bubbles: true }));
}
ok('AB 2 con -2 serve 7+: un 6 e poi 4+', lit() === '6·4' &&
   /un 6 e poi 4\+/.test(charts().querySelector('.chart-verdict').textContent));

/* un punteggio scritto altrove — nello scontro, nel tiro — apre la
   stessa scheda con i suoi valori gia' scelti */
const { chartLink } = await import('../src/charts.js');
const linkBox = doc.createElement('div');
linkBox.innerHTML = chartLink('5+', { tab: 'melee', wsA: 2, wsD: 5 });
doc.body.appendChild(linkBox);
linkBox.querySelector('[data-chart]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
ok('un punteggio toccato apre la sua tabella',
   charts().querySelector('[data-ctab="melee"]').classList.contains('on') && lit() === '5+');
linkBox.remove();
click('#btn-charts');
ok('e il pulsante della barra la richiude', charts().hidden === true);
ok('nessun errore attorno alle tabelle', errors.length === 0);

console.log('\nrighelli');
const rulerCount = () => state.rulers.length;
deploy.act('misura', () => { state.rulers.push([[0, 0], [254, 0]]); });
ok('il righello resta sul tavolo', rulerCount() === 1);
click('#btn-rulers-clear');
ok('e si toglie tutto insieme', rulerCount() === 0);

console.log('\nformazioni');
const FM = await import('../src/formation.js');
const wOf = u => FM.layout(u, { alive: deploy.effModels(u),
                                attached: FM.attachedTo(state.units, u) }).w;

const skirm = state.units.find(u => u.army === 'A' && u.loose);
state.sel = { type: 'unit', id: skirm.uid };
deploy.renderAll();
click('#i-form');
ok('l editor della formazione si apre', !!doc.querySelector('#formation-modal #f-canvas'));
ok('disegna una casella per modello',
   doc.querySelectorAll('#formation-modal .fcell').length === skirm.models);

const wRanks = wOf(skirm);
click('#formation-modal #f-mode-f');
ok('la formazione passa a sciolta', skirm.formation.mode === 'free');
doc.querySelector('#formation-modal [data-preset="screen"]').dispatchEvent(new window.Event('click'));
ok('il preset schermo mette tutti su una riga', wOf(skirm) > wRanks * 1.5);
click('#formation-modal #f-mirror');
ok('toccarla a mano la promuove a "come l hai messa"',
   skirm.formation.preset === 'custom' && skirm.formation.slots.length === skirm.models);
history.undo();
ok('e anche la formazione si annulla',
   state.units.find(u => u.uid === skirm.uid).formation.preset === 'screen');
click('#formation-modal #f-mode-r');
ok('tornando in ordine chiuso le basi si riattaccano',
   ((f) => f.mode === 'ranks' && f.spacing === FM.LOOSE_GAP)(state.units.find(u => u.uid === skirm.uid).formation));
click('#formation-modal #f-mode-f');
click('#formation-modal #f-close');
ok('la finestra si chiude', !doc.querySelector('#formation-modal'));

console.log('\npersonaggi dentro le unita');
const chief = state.units.find(u => u.army === 'A' && FM.isCharacter(u));
ok('un modello solo di fanteria e un personaggio', !!chief);
const regiment = state.units.find(u => u.army === 'A' && u.models >= 10 && !u.loose);
const wBefore = wOf(regiment);
deploy.act('unisci', () => FM.joinUnit(chief, regiment));
deploy.renderAll();
ok('il personaggio non e piu un pezzo suo sul tavolo', chief.placed === false);
const layH = FM.layout(regiment, { alive: regiment.models,
                                   attached: FM.attachedTo(state.units, regiment) });
ok('prende una casella dentro il reggimento',
   layH.slots.some(s => s.kind === 'char' && s.uid === chief.uid));
ok('il reggimento ha una casella in piu', layH.slots.length === regiment.models + 1);
ok('e sul tavolo si allarga', wOf(regiment) >= wBefore);
ok('la lista laterale lo dice', /pers\./.test(doc.querySelector('#armies').textContent));
history.undo();
ok('sganciarlo lo rimette in campo',
   state.units.find(u => u.uid === chief.uid).placed === true);
deploy.act('unisci', () => FM.joinUnit(state.units.find(u => u.uid === chief.uid),
                                       state.units.find(u => u.uid === regiment.uid)));
deploy.renderAll();

/* Il file della lista non chiama «character» tutto quello che al tavolo
   entra in un reggimento: il boss senza slot, il pezzo comprato a
   parte. La regola che tiene e' quanti modelli sono. */
const isLone = u => u.army === 'A' && (u.models || 1) === 1 && !u.dead &&
                    !FM.isCharacter(u) && !FM.joinedHost(u) && !FM.isLumbering(u);
/* il tavolo d'esempio ha solo carri e mostri da un modello: la bestia da
   compagnia la si mette a mano, come al circolo */
if (!state.units.some(isLone)){
  const src = state.units.find(u => u.army === 'A' && (u.models || 1) === 1 && !u.dead);
  state.units.push({ ...JSON.parse(JSON.stringify(src)), uid: 9001, name: 'Bestia da compagnia',
                     troop: 'Monstrous infantry', slot: 'Special', character: false, join: null });
  deploy.renderAll();
}
const lone = state.units.find(isLone);
const bigA = state.units.find(u => u.army === 'A' && u.models > 1 && !FM.joinedHost(u));
ok('c e un pezzo da un modello solo che il roster non chiama personaggio', !!lone && !!bigA);
/* ma un carro pesante o un mostro no, anche da un modello solo: sono
   Lumbering, e non si uniscono a nessuno (p. 195) */
const lumber = state.units.find(u => u.army === 'A' && (u.models || 1) === 1 && FM.isLumbering(u) && !u.dead);
if (lumber && bigA){
  ok('un pezzo Lumbering non entra in un reggimento',
     !FM.joinCandidates(state.units, bigA).some(c => c.uid === lumber.uid));
  ok('e la tendina vuota dice perche',
     FM.joinRefusals(state.units, bigA).some(r => r.uid === lumber.uid && /Lumbering/.test(r.why)));
  ok('e non ospita nessuno', !FM.canHost(state.units, lumber));
}
if (lone && bigA){
  ok('si puo unire lo stesso a un reggimento',
     FM.joinCandidates(state.units, bigA).some(c => c.uid === lone.uid));
  state.sel = { type: 'unit', id: bigA.uid };
  deploy.renderAll();
  ok('e l ispettore lo propone',
     [...doc.querySelectorAll('#i-join option')].some(o => +o.value === lone.uid));
}


/* La strada opposta: prima l'aggancio si faceva solo aprendo il
   reggimento, e chi partiva dal personaggio non trovava nessuna
   tendina. */
const solo = state.units.find(u => u.army === 'B' && FM.canJoin(u) && !FM.hostUnit(state.units, u));
const bigB = state.units.find(u => u.army === 'B' && u.models > 1 && !FM.hostUnit(state.units, u));
ok('c e un personaggio libero nell altro esercito', !!solo && !!bigB);
if (solo && bigB){
  ok('la scheda del personaggio elenca i reggimenti che lo possono ospitare',
     FM.hostCandidates(state.units, solo).some(h => h.uid === bigB.uid));
  state.sel = { type: 'unit', id: solo.uid };
  deploy.renderAll();
  const into = doc.querySelector('#i-host');
  ok('e la tendina c e davvero', !!into &&
     [...into.options].some(o => +o.value === bigB.uid));
  setField('#i-host', String(bigB.uid));
  ok('sceglierlo lo unisce al reggimento',
     FM.hostUnit(state.units, solo)?.uid === bigB.uid);
  history.undo();
  deploy.renderAll();
  ok('e si torna indietro',
     FM.hostUnit(state.units, state.units.find(u => u.uid === solo.uid)) == null);
}

/* Un pezzo dentro un pezzo dentro un pezzo non succede al tavolo: un
   personaggio che ne ospita gia' un altro non si infila da nessuna
   parte, e nessun reggimento se lo prende. */
const singles = state.units.filter(u => u.army === 'A' && (u.models || 1) === 1 &&
                                        !FM.hostUnit(state.units, u) && !FM.hostsAnyone(state.units, u));
const bigB2 = state.units.find(u => u.army === 'A' && u.models > 1 && !FM.hostUnit(state.units, u));
ok('ci sono due pezzi singoli e un reggimento a cui offrirli',
   singles.length >= 2 && !!bigB2);
if (singles.length >= 2 && bigB2){
  const [nester, guest] = singles;
  deploy.act('unisci', () => FM.joinUnit(guest, nester));
  ok('chi ospita non compare fra i candidati di un reggimento',
     !FM.joinCandidates(state.units, bigB2).some(c => c.uid === nester.uid));
  ok('e non gli si offre nessun reggimento da cui farsi ospitare',
     FM.hostCandidates(state.units, nester).length === 0);
  state.sel = { type: 'unit', id: nester.uid };
  deploy.renderAll();
  ok('l ispettore spiega che prima va sganciato',
     !doc.querySelector('#i-host') && /Sgancia .* e poi/.test(doc.querySelector('#inspector').textContent));
  ok('e il reggimento dice chi ha lasciato fuori e perche',
     FM.joinRefusals(state.units, bigB2).some(r => r.uid === nester.uid && /ospita/.test(r.why)));
  deploy.act('sgancia', () => FM.leaveUnit(state.units.find(u => u.uid === guest.uid)));
}

/* Un aggancio appeso a un'unita' morta non vale piu': l'ispettore lo
   dava per libero e la tendina no, e il pezzo spariva da tutte e due. */
const ghostHost = state.units.find(u => u.army === 'B' && u.models > 1 && !FM.hostUnit(state.units, u));
const ghost = state.units.find(u => u.army === 'B' && u.uid !== ghostHost.uid && FM.canJoin(u) &&
                                    !FM.hostUnit(state.units, u) && !FM.hostsAnyone(state.units, u));
if (ghost && ghostHost){
  deploy.act('unisci', () => FM.joinUnit(ghost, ghostHost));
  ghostHost.dead = true;
  ok('se il reggimento muore il personaggio torna libero',
     FM.hostUnit(state.units, ghost) == null);
  const third = state.units.find(u => u.army === 'B' && u.models > 1 && !u.dead &&
                                      u.uid !== ghostHost.uid && !FM.hostUnit(state.units, u));
  ok('e riappare fra i candidati di un reggimento vivo',
     !!third && FM.joinCandidates(state.units, third).some(c => c.uid === ghost.uid));
  ghostHost.dead = false;
  deploy.act('sgancia', () => FM.leaveUnit(ghost));
}

/* La tendina vuota diceva soltanto niente. */
ok('i rifiuti hanno un motivo scritto',
   FM.joinRefusals(state.units, regiment).every(r => typeof r.why === 'string' && r.why.length > 0));

console.log('\nmisure del tavolo, zone e terreno');
setField('#table-size', 'custom');
setField('#table-w', 52);
setField('#table-h', 38);
ok('il tavolo si fa su misura',
   Math.round(state.tableW / 25.4) === 52 && Math.round(state.tableH / 25.4) === 38);
ok('le caselle restano aperte e il menu dice «su misura»',
   doc.querySelector('#table-custom').hidden === false &&
   doc.querySelector('#table-size').value === 'custom');
setField('#zone-gap', 10);
ok('la linea di schieramento si sposta', Math.abs(state.gap / 25.4 - 10) < 0.01);
ok('e sul campo c e una maniglia per esercito',
   doc.querySelectorAll('#board [data-zone]').length === 2);
setField('#table-size', '48x36');
ok('e si torna a una misura da elenco',
   Math.round(state.tableW / 25.4) === 48 && doc.querySelector('#table-custom').hidden === true);

const scenic = state.terrain.find(t => t.kind !== "treasure");
state.sel = { type: 'terr', id: scenic.tid };
deploy.renderAll();
ok('un elemento scenico ha tre maniglie di misura',
   doc.querySelectorAll('#board [data-size]').length === 3);
setField('#t-w', 14.5);
ok('e la misura si scrive anche a mano', scenic.w === 14.5);
const token = state.terrain.find(t => t.kind === 'treasure');
if (token){
  state.sel = { type: 'terr', id: token.tid };
  deploy.renderAll();
  ok('il segnalino del tesoro no: la sua base e quella',
     doc.querySelectorAll('#board [data-size]').length === 0);
}
history.undo();
state.sel = null;
deploy.renderAll();

console.log('\nmodalita partita');
const game = await import('../src/game.js');
click('#g-start');
ok('la partita comincia al turno 1', state.game.on && state.game.turn === 1);
/* Si comincia schierando: mettere e rimettere i pezzi non e' movimento,
   e l'ancora arriva solo con il turno 1. */
ok('e comincia dallo schieramento',
   state.game.deploying === true && /Schieramento finito/.test(doc.querySelector('#game').textContent));
ok('mentre si schiera nessuna unita ha l ancora', state.units.every(u => !u.anchor));
{
  const piece = state.units.find(u => u.placed && !u.dead);
  state.sel = { type: 'unit', id: piece.uid };
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight' }));
  ok('e spostare un pezzo non la mette', !state.units.find(u => u.uid === piece.uid).anchor);
  state.sel = null;
}
click('#g-deployed');
ok('finito lo schieramento le ancore stanno dove sono i pezzi',
   state.game.deploying === false &&
   state.units.filter(u => u.placed && !u.dead).every(u => u.anchor));
click('#g-redeploy');
ok('prima di chiudere un turno si torna a schierare',
   state.game.deploying === true && state.units.every(u => !u.anchor));
click('#g-deployed');
const mob = state.units.find(u => u.models >= 10);
const depth0 = mob.placed ? deploy.effModels(mob) : mob.models;
deploy.act('perdite', () => game.setLost(mob, 5));
ok('i modelli in piedi calano', deploy.effModels(mob) === depth0 - 5);
ok('il tabellino conta i punti persi', game.score()[mob.army].lostPts > 0);
/* Le frecce camminano di casella in casella: sedici ne fanno un turno,
   quattro una fase. Il primo passo resta dentro la Strategia. */
click('#g-next');
ok('la casella avanza', state.game.step === 1);
ok('e la fase resta quella finche le sue quattro non sono finite', state.game.phase === 0);
click('#g-next'); click('#g-next'); click('#g-next');
ok('quattro passi cambiano fase', state.game.step === 4 && state.game.phase === 1);
const panel = () => doc.querySelector('#game');
const hit = sel => panel().querySelector(sel).dispatchEvent(new window.Event('click'));
ok('e il pannello dice in quale casella siamo',
   /Movimento/.test(panel().textContent) && /Dichiarazione cariche/.test(panel().textContent));
hit('[data-phase="3"]');
ok('i quattro pulsanti saltano all inizio della fase',
   state.game.step === 12 && state.game.phase === 3);
hit('[data-step="14"]');
ok('e la striscia sotto va alla casella esatta', state.game.step === 14);
ok('la casella dice cosa ci si aspetta qui',
   /rotta/i.test(panel().querySelector('.stepwhat').textContent));
hit('[data-phase="1"]');

/* Gli effetti a tempo se ne vanno quando si rientra nella prima delle
   sedici caselle, che e' dove il manuale mette il controllo. Prima
   della Tappa 1 non c'era nessun posto in cui attaccarlo. */
{
  const eff = await import('../src/effects.js');
  const vittima = state.units.find(u => !u.dead);
  eff.addEffect(vittima, { id:'prova', from:'incantesimo di prova', mods:{ S:+1 }, until:{ turn: state.game.turn } });
  ok('l effetto vale finche non scade', eff.val(vittima, 'S') > 0);
  state.game.turn += 1;
  hit('[data-phase="0"]');
  ok('rientrando nell inizio turno l effetto scaduto se ne va',
     eff.effectsOf(state.units.find(u => u.uid === vittima.uid)).length === 0);
  ok('e il registro dice quale', state.game.log.some(l => /incantesimo di prova/.test(l.text)));
  state.game.turn -= 1;
}
hit('[data-phase="1"]');
deploy.act('distrutta', () => game.destroy(mob));
ok('l\'unita distrutta lascia il campo', mob.dead === true && mob.placed === false);
history.undo();
ok('anche la distruzione si annulla',
   state.units.find(u => u.uid === mob.uid).dead === false);
ok('il registro ha delle righe', state.game.log.length > 0);
ok('nessun errore in partita', errors.length === 0);

console.log('\nregistro della partita');
const BL = await import('../src/battlelog.js');
ok('lo schieramento e la prima fotografia',
   state.game.turns.length === 1 && state.game.turns[0].kind === 'deploy');

/* i dadi tirati dal pannello non restano nel vassoio: quello che esce
   finisce nel registro con turno e fase, come un'annotazione */
click('#g-dice');
doc.querySelector('#dicebox #dx-roll').dispatchEvent(new window.Event('click'));
await settle(40);
ok('i dadi tirati in partita finiscono nel registro',
   /D\d:/.test(state.game.log[0].text) && state.game.log[0].t === state.game.turn);
doc.querySelector('#dicebox #dx-close').dispatchEvent(new window.Event('click'));

/* sei pollici in avanti e tre modelli persi: il turno deve raccontare
   tutte e due le cose, e tenerle separate dal totale della partita */
const scout = state.units.find(u => u.army === 'A' && u.placed && u.models >= 5);
deploy.act('sposta', () => { scout.x += 25.4 * 6; });
deploy.act('perdite', () => game.setLost(scout, 3));
click('#g-close');
const t1 = state.game.turns[1];
const rec = t1.units.find(r => r.uid === scout.uid);
ok('a fine turno resta una fotografia del tavolo', t1.kind === 'turn' && t1.n === 1 && t1.army === 'A');
ok('il movimento e misurato in pollici', Math.abs(rec.moved - 6) < 0.2);
ok('le perdite del turno sono separate dal totale', rec.dLost === 3 && rec.lost === 3);
ok('la posizione e detta anche a parole', /corsia/.test(rec.zone));
ok('chiudere il turno passa la mano', state.game.army === 'B' && state.game.turn === 1);
click('#g-close');
ok('dopo B ricomincia il turno dopo', state.game.turn === 2 && state.game.army === 'A');
/* Tappa 7: la fotografia dice chi tiene gli obiettivi, e il pannello
   dice quanto dura la battaglia */
const treasures = state.terrain.filter(t => t.kind === 'treasure' || t.kind === 'landmark' || t.kind === 'monolith').length;
ok('la fotografia di fine turno misura gli obiettivi',
   Array.isArray(t1.objectives) && t1.objectives.length === treasures);
ok('e il registro li scrive', !treasures || state.game.log.some(l => /Obiettivi a fine turno/.test(l.text || l)));
ok('il pannello ha la durata della battaglia', !!doc.querySelector('#g-length'));
/* una misura che dice sempre «nessuno» non prova niente: un reggimento
   messo sopra un tesoro lo deve tenere */
const troveP = state.terrain.find(t => t.kind === 'treasure');
const holder = state.units.find(u => u.army === 'A' && u.placed && !u.dead &&
  !(u.join && u.join.host != null) && (u.models || 0) - (u.lost || 0) >= 5);
if (troveP && holder){
  const was = [holder.x, holder.y];
  holder.x = troveP.x; holder.y = troveP.y;
  const recHeld = BL.turnRecord(state, { n: 9, army: 'A' });
  holder.x = was[0]; holder.y = was[1];
  const mine = recHeld.objectives.find(o => o.tid === troveP.tid);
  ok('un reggimento sopra un tesoro lo tiene', !!mine && (mine.army === 'A' || mine.contested));
  ok('e gli altri tesori lontani restano di nessuno',
     recHeld.objectives.filter(o => o.tid !== troveP.tid).every(o => o.army !== 'A' || o.contested === false));
} else ok('c e un tesoro e un reggimento per provare il controllo', false);
history.undo();
ok('anche la fotografia si annulla', state.game.turns.length === 2);

const doomed = state.units.find(u => u.army === 'B' && !u.dead);
deploy.act('distrutta', () => game.destroy(doomed));
click('#g-close');
const preview = BL.buildReport(state, { label: 'Prova', group: '', pts: 0, deploy: '', desc: '' });
const auto = BL.autoValues(preview);
ok('l\'unita distrutta vale punti per l\'avversario', auto.kill.A >= (doomed.pts || 0) && auto.kill.A > 0);
ok('il punteggio automatico finisce nelle righe',
   preview.score.rows.find(r => r.id === 'kill').A === auto.kill.A);
const vd = BL.verdict(preview);
ok('il verdetto e quello del libro: con meno di cento punti di scarto e pareggio',
   vd.winner === (vd.diff >= 100 ? (vd.A > vd.B ? 'A' : 'B') : null) &&
   /vittoria|pareggio/i.test(vd.text) && /p\. 286/.test(vd.text));
ok('le voci del Warhammer di prima non ci sono piu',
   !preview.score.rows.some(r => r.id === 'halved' || r.id === 'quarter') &&
   preview.score.rows.some(r => r.id === 'under25'));

console.log('\nperdite scelte modello per modello');
const sk = state.units.find(u => u.uid === skirm.uid);
const wFull = wOf(sk);
deploy.act('perdita', () => game.setLost(sk, FM.toggleFallen(sk, 0)));
ok('segnare un modello lo conta fra le perdite', sk.lost === 1 && sk.fallen[0] === 0);
ok('e sul tavolo l unita si accorcia', deploy.effModels(sk) === sk.models - 1);
const layLive = FM.layout(sk, { alive: sk.models - 1 });
ok('la casella del caduto sparisce', !layLive.slots.some(s2 => s2.i === 0));
ok('l ingombro si ridisegna sui modelli rimasti', layLive.w !== wFull || layLive.h > 0);
deploy.act('perdita', () => game.setLost(sk, FM.toggleFallen(sk, 0)));
ok('e rimetterlo in piedi lo riporta indietro', sk.lost === 0 && sk.fallen.length === 0);

console.log('\ncontatti di basetta e terreno');
const aa = state.units.find(u => u.army === 'A' && u.placed && !u.dead && !FM.joinedHost(u));
const bb = state.units.find(u => u.army === 'B' && u.placed && !u.dead && !FM.joinedHost(u));
const boxOf = u => FM.layout(u, { alive: deploy.effModels(u),
                                  attached: FM.attachedTo(state.units, u) });
deploy.act('a contatto', () => {
  aa.rot = 0; bb.rot = 0;
  bb.x = aa.x;
  bb.y = aa.y - boxOf(aa).h / 2 - boxOf(bb).h / 2 - 0.4;   // meno di mezzo millimetro: si toccano
});
/* e un pezzo di terreno grande sotto i piedi della prima */
const piece = [...state.terrain].filter(t => t.kind !== 'treasure')
  .sort((p1, p2) => (p2.w * p2.h) - (p1.w * p1.h))[0];
if (piece) deploy.act('nel terreno', () => { piece.x = aa.x; piece.y = aa.y; });
click('#g-close');
const tc = state.game.turns[state.game.turns.length - 1];
const touch = (tc.contacts || []).find(c =>
  (c.a === aa.uid && c.b === bb.uid) || (c.a === bb.uid && c.b === aa.uid));
ok('la fotografia registra i contatti di basetta', !!touch);
ok('e dice da che lato ciascuna e stata presa',
   !!touch && /fronte|retro|fianco/.test(touch.aSide) && /fronte|retro|fianco/.test(touch.bSide));
const recA = tc.units.find(r => r.uid === aa.uid);
ok('ogni unita porta il suo ingombro del momento', recA.w > 0 && recA.h > 0);
ok('e come e schierata', !!recA.form && typeof recA.form.mode === 'string');
ok('il terreno sotto l unita e registrato', !piece || (recA.terrain && recA.terrain.length > 0));
ok('e la posizione del terreno viaggia col turno',
   Array.isArray(tc.terrain) && tc.terrain.length === state.terrain.length);
const depShot = state.game.turns[0];
ok('anche lo schieramento si porta dietro il terreno',
   Array.isArray(depShot.terrain) && depShot.terrain.length > 0);
const joined = tc.units.find(r => r.uid === chief.uid);
ok('il personaggio unito risulta col reggimento',
   !!joined && joined.withUid === regiment.uid && /con /.test(joined.zone));

console.log('\nlo schermino del tavolo');
ok('il pannello disegna il tavolo in piccolo', !!doc.querySelector('#game .tvbox svg'));
ok('e si puo scorrere indietro fra le fotografie', !!doc.querySelector('#game #g-shot-prev'));
click('#g-shot-prev');
ok('scorrendo cambia fotografia senza errori',
   !!doc.querySelector('#game .tvbox svg') && errors.length === 0);
ok('la lista delle perdite e nel pannello', !!doc.querySelector('#game .lossbox [data-lp]'));

console.log('\nbattle report');
const reports = await import('../src/reports.js');
await reports.initReports();
/* quante fotografie sono state scattate finora: scriverne il numero a
   mano rendeva la prova fragile, e ogni turno in piu' aggiunto qui
   sopra la faceva fallire per il motivo sbagliato */
const shots = state.game.turns.filter(t => t.kind === 'turn').length;
const rep = await reports.archiveCurrent();
ok('la partita finisce nell\'archivio', reports.allReports().length === 1);
ok('il report si porta dietro le due liste', rep.roster.A.length > 0 && rep.roster.B.length > 0);
ok('e tutte le fotografie', shots >= 2 && rep.turns.filter(t => t.kind === 'turn').length === shots);

const md = BL.reportMarkdown(rep, { prompt: true });
ok('il testo spiega alla macchina come si legge', /Come leggere questi dati/.test(md));
ok('chiede l\'analisi che serve', /cosa è andato storto/i.test(md));
ok('c\'e un capitolo per ogni mezzo turno',
   /## Turno 1 — gioca /.test(md) && (md.match(/## Turno /g) || []).length === shots);
ok('le liste dicono come e schierata ogni unita', /\| Formazione \|/.test(md));
ok('i contatti di basetta sono nel report', /Contatti di basetta/.test(md));
ok('e il terreno occupato pure', /\| Terreno \|/.test(md));
ok('il terreno dello schieramento e datato', /## Terreno allo schieramento/.test(md));
ok('la legenda spiega le voci nuove',
   /Contatti di basetta/.test(md.slice(0, md.indexOf('## Scheda'))));

/* chi ha giocato: la riga che dice all'AI chi criticare */
ok('senza dirlo, il resoconto non indovina il lato',
   /non ti ho detto quale dei due eserciti/i.test(md) && /\| Ho giocato \| non dichiarato \|/.test(md));
rep.meta.mine = 'A';
const mdMine = BL.reportMarkdown(rep, { prompt: true });
ok('dichiarato il lato, chiede una critica delle mie scelte',
   /\*\*Ho giocato l'Esercito A/.test(mdMine) && /Commenta criticamente le MIE scelte/.test(mdMine));
ok('e nomina l avversario come metro, non come allievo',
   /Dall'altra parte c'era/.test(mdMine) && !/non ti ho detto quale/i.test(mdMine));
ok('la scheda lo scrive accanto agli altri dati',
   /\| Ho giocato \| Esercito A/.test(mdMine));
rep.meta.mine = '';
ok('il JSON si porta dietro tutto',
   /"contacts"/.test(BL.reportJSON(rep)) && /"form"/.test(BL.reportJSON(rep)));
ok('le unita compaiono con nome e perdite', md.includes(scout.name) && /Perdite/.test(md));
ok('il punteggio ha un totale', /\*\*Totale/.test(md));
ok('e le tabelle sono Markdown vero', /\| --- \|/.test(md));
ok('il nome del file e usabile', /^\d{4}-\d\d-\d\d-[a-z0-9-]+\.md$/.test(BL.fileName(rep, 'md')));

doc.querySelector('[data-tab="report"]').dispatchEvent(new window.Event('click'));
ok('la scheda Partite elenca la partita', doc.querySelectorAll('#reports .ls-side .row').length === 1);
doc.querySelector('#reports .ls-side .row').dispatchEvent(new window.Event('click'));
ok('aprendola si vedono i turni', doc.querySelectorAll('#reports [data-turn]').length >= 3);
ok('e il punteggio e modificabile', doc.querySelectorAll('#reports [data-sr]').length > 0);

/* il pannello deve scrivere davvero dentro il report: un turno aperto,
   una perdita corretta a mano, e i superstiti si risistemano */
[...doc.querySelectorAll('#reports [data-turn]')][1].dispatchEvent(new window.Event('click'));
await settle(80);
const lossInput = [...doc.querySelectorAll('#reports input[data-tu]')]
  .find(i => /\|dLost$/.test(i.dataset.tu) && +i.max >= 10);
lossInput.value = '2';
lossInput.dispatchEvent(new window.Event('change'));
await settle(120);
const editedUid = lossInput.dataset.tu.split('|')[1];
const edited = reports.allReports()[0].turns[1].units.find(r => String(r.uid) === editedUid);
ok('una perdita corretta a mano entra nel report',
   edited.dLost === 2 && edited.alive === edited.models - 2);
doc.querySelector('#rp-recalc').dispatchEvent(new window.Event('click'));
await settle(120);
ok('e il punteggio si ricalcola da capo',
   reports.allReports()[0].score.rows.find(r => r.id === 'kill').manual === false);

console.log('\npartita scritta a mano');
const listsMod = await import('../src/lists.js');
const fakeRoster = {
  roster: { name: 'Lista di prova', costs: [{ name: 'pts', value: 300 }],
    forces: [{ name: 'F', catalogueName: 'Lizardmen', selections: [
      { name: '10 Saurus', type: 'unit', number: 1,
        categories: [{ name: 'Core', primary: 'true' }],
        costs: [{ name: 'pts', value: 150 }],
        selections: [{ name: 'Saurus Warrior', type: 'model', number: 10 }] },
      { name: '5 Skinks', type: 'unit', number: 1,
        categories: [{ name: 'Core', primary: 'true' }],
        costs: [{ name: 'pts', value: 50 }],
        selections: [{ name: 'Skink', type: 'model', number: 5 }] },
    ] }] } };
const l1 = await listsMod.importListText(JSON.stringify(fakeRoster));
const manual = await reports.newFromLists(l1.id, l1.id, { title: 'Giocata al circolo' });
ok('la partita a mano parte dalle liste salvate', manual.roster.A.length === 2 && manual.roster.B.length === 2);
ok('parte gia con schieramento e primo turno',
   manual.turns[0].kind === 'deploy' && manual.turns[1].n === 1);
const mrow = manual.turns[1].units[0];
mrow.dLost = 4;
BL.recount(manual);
ok('correggere un turno risistema i superstiti', mrow.alive === mrow.models - 4);
mrow.dLost = mrow.models;
BL.recount(manual);
ok('finiti i modelli l\'unita risulta distrutta', mrow.dead === true && mrow.alive === 0);
ok('il report scritto a mano si esporta lo stesso',
   BL.reportMarkdown(manual).includes('Giocata al circolo'));
ok('nessun errore nel diario', errors.length === 0);

console.log('\nterreno casuale e scenari propri');
const terrBefore = state.terrain.length;
click('#btn-terr-random');
ok('genera una mappa', state.terrain.length > 0);
const issues = [...doc.querySelectorAll('#terrain-list .chip.bad')].length;
ok('nessun tesoro troppo vicino a un elemento', issues === 0);
/* a specchio: ogni pezzo deve avere il suo gemello ruotato di mezzo giro */
const W = state.tableW, H = state.tableH;
const solid = state.terrain.filter(t => t.kind !== 'treasure');
const twinned = solid.every(t => solid.some(o =>
  o !== t && Math.abs(o.x - (W - t.x)) < 0.6 && Math.abs(o.y - (H - t.y)) < 0.6));
ok('la mappa e specchiata: nessuno eredita la collina buona', twinned);
history.undo();
ok('anche il terreno casuale si annulla', state.terrain.length === terrBefore);

const kit = await import('../src/scenariokit.js');
click('#btn-scen-save');
ok('il nome dello scenario lo chiede una finestra dell\'app, non prompt()', await new Promise(async r => { await settle(30); r(dialogOpen()); }));
await answer('Scenario di prova');
await settle(120);
ok('lo scenario finisce fra i miei', kit.allCustom().length === 1);
ok('compare nel menu a tendina',
   [...doc.querySelectorAll('#scenario option')].some(o => /prova/i.test(o.textContent)));
await kit.removeCustom(kit.allCustom()[0].id);

console.log('\nbersagli grandi e menu contestuale');
const svgBoard = doc.querySelector('#board');
const pads = [...svgBoard.querySelectorAll('.hits [data-uid]')];
ok('i pezzi piccoli hanno un cuscinetto da toccare', pads.length > 0);
const padded = pads[0].dataset.uid;
const nodes = [...svgBoard.querySelectorAll(`[data-uid="${padded}"]`)];
ok('il cuscinetto sta SOTTO il pezzo vero, così chi mira preciso lo prende lo stesso',
   nodes.length === 2 && nodes[0].closest('.hits') && !nodes[1].closest('.hits'));
ok('ed è largo almeno quanto un polpastrello',
   +nodes[0].getAttribute('width') >= 34 && +nodes[0].getAttribute('height') >= 34);

/* la maniglia: quello che si vede è un segno, quello che si prende è
   il cerchio invisibile che ci sta attorno */
state.sel = { type: 'unit', id: state.units.find(u => u.placed).uid };
deploy.renderAll();
const handle = [...doc.querySelectorAll('#board .handle circle')];
ok('la maniglia di rotazione ha un bersaglio più largo del pallino',
   handle.length === 3 && +handle[0].getAttribute('r') > +handle[1].getAttribute('r') * 2);

/* un pezzo toccato e non spostato non lascia un annulla che non annulla */
const undoDepth0 = history.depth;
const pezzo = doc.querySelector('#board .piece[data-uid]');
const down = (target, opts = {}) => target.dispatchEvent(
  new window.MouseEvent('pointerdown', { bubbles: true, clientX: 40, clientY: 40, button: 0, ...opts }));
down(pezzo);
svgBoard.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 40, clientY: 40 }));
ok('toccare un pezzo senza spostarlo non sporca la pila dell annulla', history.depth === undoDepth0);

/* pressione lunga: il menu del pezzo arriva dove sta il dito */
down(doc.querySelector('#board .piece[data-uid]'));
await settle(620);
const ctx = doc.querySelector('.ctxmenu');
ok('tenendo premuto si apre il menu del pezzo', !!ctx);
const vociCtx = ctx ? [...ctx.querySelectorAll('[data-ctx]')].map(b => b.textContent) : [];
ok('con le cose che si fanno sempre',
   vociCtx.some(v => /formazione/i.test(v)) && vociCtx.some(v => /Ruota/.test(v)) && vociCtx.some(v => /Ritira|Schiera/.test(v)));
ok('e il menu non lascia in giro un passo di annulla', history.depth === undoDepth0);
const selUid = state.sel.id;
const rot0 = state.units.find(u => u.uid === selUid).rot;
ctx.querySelector('[data-ctx="2"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await settle(40);
ok('e la voce fa davvero quello che dice',
   state.units.find(u => u.uid === selUid).rot === (rot0 + 90) % 360);
ok('poi si chiude da sé', !doc.querySelector('.ctxmenu'));

/* col mouse è il tasto destro */
const terr = doc.querySelector('#board .piece[data-tid]');
down(terr, { button: 2 });
svgBoard.dispatchEvent(new window.Event('contextmenu', { bubbles: true }));
await settle(40);
const ctx2 = doc.querySelector('.ctxmenu');
ok('il tasto destro apre lo stesso menu, con le voci del terreno',
   !!ctx2 && [...ctx2.querySelectorAll('[data-ctx]')].some(b => /Togli dal tavolo/.test(b.textContent)));
doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
await settle(40);
ok('Escape lo chiude', !doc.querySelector('.ctxmenu'));

console.log('\nmenu della barra');
const menus = [...doc.querySelectorAll('.board-bar details.menu')];
ok('la barra ha tre menu invece di ventitre pulsanti', menus.length === 3);
ok('i gesti che si fanno giocando restano fuori',
   ['#btn-undo', '#btn-auto', '#btn-snap', '#btn-fit', '#scenario']
     .every(sel => !doc.querySelector(sel).closest('.menu-pop')));
ok('le levette tattiche stanno dentro un menu',
   ['#btn-dist', '#btn-arcs', '#btn-measure', '#btn-ghost', '#btn-moveaid']
     .every(sel => !!doc.querySelector(sel).closest('.menu-pop')));
const aiuti = doc.querySelector('[data-menu="aiuti"]');
ok('il menu si accorge di quello che ha acceso dentro',
   aiuti.querySelector('summary').classList.contains('has-on'));
doc.querySelector('#btn-moveaid').dispatchEvent(new window.Event('click'));
ok('e se lo spegni il pallino se ne va',
   !aiuti.querySelector('summary').classList.contains('has-on'));
doc.querySelector('#btn-moveaid').dispatchEvent(new window.Event('click'));
ok('acceso, torna', aiuti.querySelector('summary').classList.contains('has-on'));
ok('le levette dichiarano il loro stato anche a chi non vede',
   doc.querySelector('#btn-moveaid').getAttribute('aria-pressed') === 'true' &&
   doc.querySelector('#btn-ghost').getAttribute('aria-pressed') === 'false');
aiuti.open = true;
doc.querySelector('[data-menu="vista"]').open = true;
aiuti.dispatchEvent(new window.Event('toggle'));
doc.querySelector('[data-menu="vista"]').dispatchEvent(new window.Event('toggle'));
ok('se ne apre uno alla volta', menus.filter(m => m.open).length === 1);
doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
ok('Escape li chiude tutti', menus.every(m => !m.open));

console.log('\nferite, etichette, contatori');
const EX = await import('../src/extras.js');
const MV = await import('../src/movement.js');
const mob2 = state.units.find(u => u.placed && !u.dead && u.models > 3);
const lost0 = mob2.lost || 0;
deploy.act('ferite', () => game.setWounds(mob2, 3));
ok('le ferite si contano senza togliere un modello',
   EX.woundsOf(mob2) === 3 && (mob2.lost || 0) === lost0);
ok('le ferite finiscono nel registro', /ferite/.test(game.game().log[0].text));
deploy.act('ferite in perdita', () => game.woundsToLoss(mob2));
ok('diventano un modello in meno solo quando lo dice il giocatore',
   EX.woundsOf(mob2) === 0 && (mob2.lost || 0) === lost0 + 1);

deploy.act('etichetta', () => EX.addTag(mob2, '  Disordinata  '));
ok('le etichette sono parole libere, normalizzate', mob2.tags[0] === 'disordinata');
deploy.act('etichetta', () => EX.addTag(mob2, 'disordinata'));
ok('e non si duplicano', mob2.tags.length === 1);
ok('il dizionario dei suggerimenti cresce da solo',
   EX.tagVocabulary(state.units).includes('disordinata'));
deploy.renderAll();
ok('si vedono sul tavolo sotto l unita',
   /disordinata/.test(doc.querySelector('#board').textContent));

deploy.act('contatore', () => EX.bumpCounter(mob2, 'munizioni', 4));
deploy.act('contatore', () => EX.bumpCounter(mob2, 'munizioni', -1));
ok('un contatore e un nome e un numero',
   EX.findCounter(mob2, 'MUNIZIONI').value === 3);
game.game().counters.A.push({ name: 'dadi', value: 6 });
deploy.renderAll();
ok('i contatori dell esercito stanno nel pannello partita',
   /dadi/.test(doc.querySelector('#game').textContent));

console.log('\nancora di movimento');
const mover = state.units.find(u => u.placed && !u.dead);
mover.moveOverride = 8;
deploy.act('ancora', () => MV.setAnchor(mover));
const anch = { x: mover.x, y: mover.y };
deploy.act('sposta', () => { mover.x += 25.4 * 4; });
const mv = MV.movedFrom(mover);
ok('il movimento si misura dall ancora, non da dove sei adesso',
   Math.abs(mv.dist - 4) < 0.01);
ok('la banda dice che sei ancora dentro il movimento',
   MV.bandOf(mover, mv.dist).key === 'move');
ok('oltre il movimento si entra nella carica', MV.bandOf(mover, 13).key === 'chargeMax');
ok('e la marcia adesso e piu lunga della carica massima', MV.bandOf(mover, 15).key === 'march');
ok('oltre tutto, e oltre', MV.bandOf(mover, 40).key === 'over');
state.sel = { type: 'unit', id: mover.uid };
deploy.renderAll();
const rings = [...doc.querySelectorAll('#board circle')].filter(c =>
  Math.abs(+c.getAttribute('cx') - anch.x) < 0.01 &&
  Math.abs(+c.getAttribute('cy') - anch.y) < 0.01 && +c.getAttribute('r') > 10);
ok('i cerchi restano fermi sull ancora invece di seguire il pezzo', rings.length >= 4);
ok('e la riga dice quanti pollici hai fatto',
   /4\.0″ di 8″/.test(doc.querySelector('#board').textContent));
const before = game.game().turns.length;
deploy.act('carica finta', () => {
  mover.charged = { target: 'qualcuno', uid: -1, inches: 5, arc: 'fianco' };
  mover.moved = { kind: 'charge', inches: 5 };
});
deploy.act('fine turno', game.closeTurn);
ok('chiudere il turno rimette le ancore dove sei arrivato',
   game.game().turns.length === before + 1 &&
   Math.abs(MV.anchorOf(mover).x - mover.x) < 0.01);
ok('e la carica vale solo per il turno in cui e successa',
   mover.charged === null && mover.moved === null);

console.log('\nmarcatori e sagome');
const mk0 = state.markers.length;
click('#btn-mark-add');
ok('un marcatore e un pezzo che non e ne unita ne terreno', state.markers.length === mk0 + 1);
const mark = state.markers[state.markers.length - 1];
deploy.act('scrivi', () => { mark.label = 'obiettivo centrale'; });
click('#btn-shape-add');
const shape = state.markers[state.markers.length - 1];
ok('una sagoma di misura e lo stesso oggetto, vuoto', shape.measure === true);
deploy.act('sposta la sagoma', () => { shape.x = mover.x; shape.y = mover.y; shape.w = 12; shape.h = 12; });
const under = deploy.modelsUnder(shape);
ok('l app sa quanti modelli stanno sotto la sagoma, non cosa significhi',
   under.length > 0 && under[0].n > 0);
deploy.renderAll();
ok('i marcatori compaiono nel pannello',
   /obiettivo centrale/.test(doc.querySelector('#marker-list').textContent));
ok('e sul tavolo', /obiettivo centrale/.test(doc.querySelector('#board').textContent));
state.sel = { type: 'mark', id: mark.mid };
deploy.renderAll();
ok('l ispettore del marcatore si apre e non chiede cosa rappresenti',
   /Marcatore libero/.test(doc.querySelector('#inspector').textContent));
state.sel = { type: 'mark', id: shape.mid };
deploy.renderAll();
ok('quello della sagoma dice quanti modelli ci stanno sotto',
   /Sotto la sagoma/.test(doc.querySelector('#inspector').textContent));

console.log('\nzone disegnate a mano');
const aUnit = state.units.find(u => u.army === 'A' && u.placed && !u.dead);
deploy.act('zona', () => {
  state.zones.push({ zid: 901, kind: 'A', label: 'la mia zona',
                     x: state.tableW / 2, y: state.tableH * 0.15,
                     w: state.tableW * 0.6, h: state.tableH * 0.2 });
});
ok('la zona disegnata sostituisce quella calcolata dallo scenario',
   /fuori zona/.test(doc.querySelector('#armies').textContent));
ok('e compare nell elenco', /la mia zona/.test(doc.querySelector('#marker-list').textContent));
click('#btn-zone-clear');
await settle(30);
ok('togliendola si torna alle zone dello scenario',
   state.zones.length === 0 &&
   !/la mia zona/.test(doc.querySelector('#marker-list').textContent));
deploy.act('zona', () => {
  state.zones.push({ zid: 902, kind: 'A', label: 'zona di prova',
                     x: state.tableW / 2, y: state.tableH * 0.8,
                     w: state.tableW, h: state.tableH * 0.35 });
});

state.sel = { type: 'zone', id: 902 };
deploy.renderAll();
ok('e la zona ha il suo ispettore',
   /A chi serve/.test(doc.querySelector('#inspector').textContent));
state.sel = { type: 'unit', id: mob2.uid };
deploy.renderAll();
const insp = doc.querySelector('#inspector').textContent;
ok('l ispettore dell unita ha etichette, contatori e ancora',
   /Etichette/.test(insp) && /Contatori/.test(insp) && /Movimento/.test(insp));

console.log('\naggancio al contatto');
const placedNow = state.units.filter(u => u.placed);
const [atk, tgt] = placedNow;
const parked = placedNow.slice(2).map(u => { u.placed = false; return u; });
tgt.rot = 0; tgt.x = 500; tgt.y = 500;
atk.rot = 47;
const depth = u => FM.layout(u, { alive: deploy.effModels(u), attached: [] }).h;
const flushY = 500 - (depth(tgt) / 2 + depth(atk) / 2);
const snapped = deploy.snapUnit(atk, 500, flushY - 9);
ok('il caricante si appoggia a filo sulla faccia che ha scelto',
   Math.abs(snapped.y - flushY) < 0.01 && Math.abs(snapped.x - 500) < 0.01);
ok('e ci arriva dritto, non storto come lo hai trascinato', snapped.rot === 180);
const farAway = deploy.snapUnit(atk, 500, flushY - 300);
ok('lontano non aggancia niente e non gira il pezzo', farAway.rot === 47);
for (const u of parked) u.placed = true;

console.log('\nla carica dal pannello (Tappa 2)');
/* Due nemici veri, uno davanti all altro: e la situazione in cui al
   tavolo si tira fuori il metro e si apre il manuale. */
{
  const rossoId = state.units.find(u => u.army === 'A' && u.placed).uid;
  const bluId   = state.units.find(u => u.army === 'B' && u.placed).uid;
  const by = id => state.units.find(u => u.uid === id);
  const parcheggiate = state.units.filter(u => u.placed && u.uid !== rossoId && u.uid !== bluId)
                                  .map(u => { u.placed = false; return u.uid; });
  const rosso = by(rossoId), blu = by(bluId);
  rosso.x = 500; rosso.y = 900; rosso.rot = 0;          // il fronte guarda in alto
  blu.x = 500;   blu.y = 900 - 5 * 25.4; blu.rot = 180;
  rosso.moveOverride = 6;
  state.sel = { type: 'unit', id: rossoId };
  deploy.renderAll();

  const plan = deploy.chargePlanFor(rosso);
  ok('il piano di carica sa fin dove si arriva davvero: M piu sei (p. 121)',
     !!plan && plan.max === plan.move + 6);
  const row = plan.rows.find(r => r.unit.uid === bluId);
  ok('e per ogni nemico dice se la carica si dichiara', !!row && typeof row.can === 'boolean');
  ok('quello che sta davanti si puo caricare', row.can === true && row.inArc === true);
  ok('con il punteggio da fare e la probabilita',
     row.need >= 0 && row.chance > 0 && row.chance <= 1);
  ok('la bandierina compare nell ispettore',
     doc.querySelectorAll('#inspector [data-charge]').length > 0);

  /* l allineamento porta a contatto: e la parte che al tavolo si fa
     con le dita e che l app deve saper proporre */
  const before = { x: rosso.x, y: rosso.y };
  ok('e la carica arriva gia allineata sulla faccia da cui viene',
     row.align && row.align.side === 'fronte' && row.align.wheel === 0);
  ok('senza aver mosso niente: il piano guarda, non tocca',
     rosso.x === before.x && rosso.y === before.y);

  /* girato di spalle non si carica piu */
  rosso.rot = 180;
  const dietro = deploy.chargePlanFor(rosso).rows.find(r => r.unit.uid === bluId);
  ok('chi ha il nemico dietro non lo carica', dietro.can === false && !dietro.inArc);
  rosso.rot = 0;

  /* il cedimento: due pollici indietro, senza dadi e senza girarsi.
     E la mossa che il test di rotta a tre esiti della Tappa 3 chiedera',
     e qui si prova che la direzione la decide il nemico. */
  const primaY = rosso.y;
  deploy.renderAll();
  const cede = doc.querySelector('#inspector [data-back="give"]');
  ok('le mosse all indietro compaiono con un nemico vicino', !!cede);
  cede.dispatchEvent(new window.Event('click'));
  await settle(30);
  ok('cede terreno di due pollici lontano dal nemico',
     Math.abs((by(rossoId).y - primaY) / 25.4 - 2) < 0.05);
  ok('senza girarsi: resta di fronte a chi lo ha spinto', by(rossoId).rot === 0);
  ok('e il registro racconta cosa e successo',
     /cede terreno di 2/.test(JSON.stringify(state.game.log.slice(0, 3))));
  history.undo();

  /* un bosco in mezzo toglie la vista anche alla carica */
  const bosco = { tid: 9101, kind: 'wood', x: 500, y: 900 - 2.5 * 25.4, w: 8, h: 1, rot: 0 };
  deploy.act('bosco di prova', () => { state.terrain.push(bosco); });
  const cieco = deploy.chargePlanFor(by(rossoId)).rows.find(r => r.unit.uid === bluId);
  ok('un bosco in mezzo ferma anche la dichiarazione di carica', cieco.can === false && cieco.blocked);
  history.undo();

  by(rossoId).moveOverride = null;
  for (const id of parcheggiate) by(id).placed = true;
}

console.log('\nla psicologia al tavolo (Tappa 5)');
{
  const G = await import('../src/game.js');
  const EFm = await import('../src/effects.js');
  ok('la partita e aperta', state.game.on === true);
  const aId = state.units.find(u => u.army === 'A' && u.placed && !u.dead).uid;
  const bId = state.units.find(u => u.army === 'B' && u.placed && !u.dead).uid;
  const by = id => state.units.find(u => u.uid === id);
  const parcheggiate = state.units.filter(u => u.placed && u.uid !== aId && u.uid !== bId)
                                  .map(u => { u.placed = false; return u.uid; });
  deploy.act('psicologia di prova', () => {
    const x = by(aId), y = by(bId);
    x.x = 500; x.y = 900; x.rot = 0; x.moveOverride = 6;
    y.x = 500; y.y = 900 - 5 * 25.4; y.rot = 180;
    x.rules = [...(x.rules || []), 'Stupidity'];
    y.rules = [...(y.rules || []), 'Immune To Psychology'];
  });
  state.sel = { type: 'unit', id: aId };
  deploy.renderAll();

  const row = deploy.chargePlanFor(by(aId)).rows.find(r => r.unit.uid === bId);
  const fuga = row.reactions.find(r => r.id === 'flee');
  ok('chi e Immune to Psychology non puo scegliere la fuga, e il perche sta accanto',
     fuga.can === false && /Immune/.test(fuga.why));
  const blocco = doc.querySelector('#inspector .psych-block');
  ok('il blocco della psicologia compare nell ispettore', !!blocco && /Stupidity/.test(blocco.textContent));
  ok('con il test di Stupidita e quello di Panico a portata di dito',
     !!doc.querySelector('#inspector [data-psych="stupidity"]') &&
     !!doc.querySelector('#inspector [data-psych="panic"]'));

const FMx2 = await import('../src/formation.js');
/* Il raduno (p. 117): il pulsante c'è solo per chi sta fuggendo, e
   l'ispettore dice con che Comando si prova — i due modificatori delle
   perdite insostenibili compresi. Il tiro vero lo provano i moduli. */
{
  const fuggiasco = state.units.find(u => u.army === 'A' && u.placed && !u.dead && !FMx2.joinedHost(u));
  state.sel = { type:'unit', id: fuggiasco.uid };
  deploy.renderAll();
  ok('chi non fugge non ha il pulsante del raduno',
     !doc.querySelector('#inspector [data-psych="rally"]'));
  deploy.act('in fuga', () => { fuggiasco.fled = true; });
  deploy.renderAll();
  ok('chi fugge ce l ha', !!doc.querySelector('#inspector [data-psych="rally"]'));
  ok('e l ispettore dice con che Comando si raduna',
     /si raduna con/.test(doc.querySelector('#inspector').textContent));
  if (fuggiasco.models > 2){
    deploy.act('mezza unita', () => { fuggiasco.lost = Math.ceil(fuggiasco.models * 0.6); });
    deploy.renderAll();
    ok('e sotto meta dei modelli il Comando cala, e lo dice',
       /sotto metà dei modelli/.test(doc.querySelector('#inspector').textContent));
    history.undo();
  }
  history.undo();                       // e l'unità torna a non fuggire
  deploy.renderAll();
}

  deploy.act('stupidita di prova', () => {
    EFm.addEffect(by(aId), { id: 'stupidity', from: 'Stupidità', flags: { stupid: true },
                             until: 'ownTurn', at: { turn: state.game.turn, side: by(aId).army } });
  });
  const ferma = deploy.chargePlanFor(by(aId)).pre;
  ok('in preda alla Stupidita non si carica, e lo dice', ferma.can === false &&
     ferma.why.some(w => /Stupidità/.test(w)));

  deploy.act('fine turno', () => G.closeTurn());
  deploy.act('fine turno', () => G.closeTurn());
  ok('due «Chiudi turno» dopo, la Stupidita e scaduta',
     !EFm.effectsOf(by(aId)).some(e => e.id === 'stupidity'));
  ok('e all inizio del suo turno il registro ricorda il test da tirare',
     state.game.log.slice(0, 20).some(l => /Stupidità per/.test(l.text)));
  for (let i = 0; i < 4; i++) history.undo();
  ok('l annulla riporta indietro turni, effetto e regole',
     !(by(aId).rules || []).includes('Stupidity') && !EFm.effectsOf(by(aId)).length);
  for (const id of parcheggiate) by(id).placed = true;
  ok('nessun errore nella psicologia', errors.length === 0);
}

console.log('\nle regole d esercito al tavolo (Tappa 5 bis)');
{
  /* Nel jsdom i file d'esercito non arrivano — il fetch dell'avvio non
     sa leggere un percorso relativo — e l'app lo regge restando senza.
     Qui si caricano dal disco, come fa `test/regole.mjs`. */
  const AR = await import('../src/armies.js');
  const EFm = await import('../src/effects.js');
  const CBm = await import('../src/combat.js');
  const MLm = await import('../src/melee.js');
  const D = await import('../src/dice.js');
  const dir = path.join(root, 'dati', 'eserciti');
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'indice.json'), 'utf8'));
  const prima = AR.armiesNow();
  AR.useArmies(AR.makeArmies(idx.file.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))));

  const aId = state.units.find(u => u.army === 'A' && u.placed && !u.dead).uid;
  const bId = state.units.find(u => u.army === 'B' && u.placed && !u.dead).uid;
  const by = id => state.units.find(u => u.uid === id);
  const parcheggiate = state.units.filter(u => u.placed && u.uid !== aId && u.uid !== bId)
                                  .map(u => { u.placed = false; return u.uid; });
  const regoleA = [...(by(aId).rules || [])];
  deploy.act('eserciti di prova', () => {
    const x = by(aId), y = by(bId);
    x.x = 500; x.y = 900; x.rot = 0;
    y.x = 500; y.y = 900 - 5 * 25.4; y.rot = 180;
    x.faction = 'Orc and Goblin Tribes';
    x.rules = [...(x.rules || []), 'Waaagh!', 'Choppas', 'Da Boyz'];
    y.faction = 'Skaven';
    y.rules = [...(y.rules || []), 'Scurry Away'];
  });
  state.sel = { type: 'unit', id: aId };
  deploy.renderAll();

  const blocco = doc.querySelector('#inspector .army-block');
  ok('il blocco delle regole d esercito compare nell ispettore',
     !!blocco && /Orchi e Goblin/.test(blocco.textContent));
  ok('con quelle che il conto fa da solo e quelle che restano a voi',
     /Choppas/.test(blocco.textContent) && /Da Boyz[^]*a mano/.test(blocco.textContent));
  const waaagh = () => doc.querySelector('#inspector [data-army^="waaagh|"]');
  ok('e il Waaagh! ha il suo pulsante', !!waaagh() && !waaagh().disabled);

  /* il doppio uno passa sempre: con i dadi fissati la prova non dipende
     dalla fortuna */
  D.setSource(() => 0);
  waaagh().dispatchEvent(new window.Event('click'));
  await settle(30);
  ok('il pulsante apre il vassoio con il test di Comando',
     tray().hidden === false && /Waaagh!/.test(tray().textContent));
  tray().querySelector('#dx-roll').dispatchEvent(new window.Event('click'));
  await settle(60);
  ok('il tentativo della partita e speso', EFm.spent(by(aId), 'waaagh'));
  ok('e passato, l effetto sta sull unita', EFm.effectsOf(by(aId)).some(e => e.id === 'waaagh'));
  ok('il registro lo scrive nella sotto-fase di comando',
     /Waaagh!.*passato/.test(state.game.log[0].text) && /Comando/.test(state.game.log[0].step));
  ok('e lo scontro conta il punto in piu',
     MLm.combatScore(MLm.scoreCardOf(CBm.combatant(by(aId)), 0)).rule === 1);
  deploy.renderAll();
  ok('il pulsante adesso e spento', waaagh().disabled === true);

  /* la Scurry Away: la fuga dall ispettore tira due dadi e somma uno */
  state.sel = { type: 'unit', id: bId };
  deploy.renderAll();
  doc.querySelector('#inspector [data-back="flee"]').dispatchEvent(new window.Event('click'));
  await settle(30);
  tray().querySelector('#dx-roll').dispatchEvent(new window.Event('click'));
  await settle(60);
  ok('chi ha la Scurry Away fugge con il suo +1, e il registro lo dice',
     state.game.log.slice(0, 3).some(l => /Scurry Away \+1/.test(l.text)));
  D.setSource(null);
  tray().querySelector('#dx-close').dispatchEvent(new window.Event('click'));

  for (let i = 0; i < 3; i++) history.undo();
  ok('l annulla riporta indietro fuga, Waaagh! speso e regole',
     !EFm.spent(by(aId), 'waaagh') && !EFm.effectsOf(by(aId)).length &&
     JSON.stringify(by(aId).rules || []) === JSON.stringify(regoleA));
  AR.useArmies(prima);
  for (const id of parcheggiate) by(id).placed = true;
  ok('nessun errore attorno alle regole d esercito', errors.length === 0);
}

console.log('\nla magia al tavolo (Tappa 6)');
{
  /* Come i file d'esercito, i domini nel jsdom non arrivano da soli: si
     leggono dal disco. I dadi sono fissati, cosi' la prova racconta
     sempre la stessa partita. */
  const MGm = await import('../src/magic.js');
  const EFm = await import('../src/effects.js');
  const G = await import('../src/game.js');
  const D = await import('../src/dice.js');
  const prima = MGm.magicNow();
  MGm.useMagic(MGm.makeMagic(JSON.parse(fs.readFileSync(path.join(root, 'dati', 'magia', 'domini.json'), 'utf8'))));
  const facce = list => { let i = 0; return () => list[Math.min(i++, list.length - 1)] - 1; };
  const pick = async id => {
    await settle(30);
    const b = doc.querySelector(`.dlg-back [data-pick="${id}"]`);
    if (!b) return false;
    b.dispatchEvent(new window.Event('click'));
    await settle(30);
    return true;
  };
  const tira = async ms => {
    await settle(30);
    tray().querySelector('#dx-roll').dispatchEvent(new window.Event('click'));
    await settle(ms || 60);
  };

  const aId = state.units.find(u => u.army === 'A' && u.placed && !u.dead).uid;
  const bId = state.units.find(u => u.army === 'B' && u.placed && !u.dead).uid;
  const by = id => state.units.find(u => u.uid === id);
  const parcheggiate = state.units.filter(u => u.placed && u.uid !== aId && u.uid !== bId)
                                  .map(u => { u.placed = false; return u.uid; });
  const righe = state.game.log.length;
  deploy.act('mago di prova', () => {
    const x = by(aId), y = by(bId);
    x.x = 500; x.y = 900; x.rot = 0;
    y.x = 500; y.y = 900 - 10 * 25.4; y.rot = 180;
    x.rules = [...(x.rules || []), 'Wizard'];
  });
  state.sel = { type: 'unit', id: aId };
  deploy.renderAll();

  ok('il blocco della magia compare per un mago', !!doc.querySelector('#inspector .magic-block'));
  setField(`#inspector [data-mg-level="${aId}"]`, 2);
  setField(`#inspector [data-mg-lore="${aId}"]`, 'battle');
  await settle(30);
  ok('Livello e dominio si scelgono dall ispettore', by(aId).magic.level === 2 && by(aId).magic.lore === 'battle');

  /* 1, 1: un doppione, e il vassoio si riapre per il dado che manca */
  D.setSource(facce([1, 1, 5]));
  doc.querySelector(`#inspector [data-mg-gen="${aId}"]`).dispatchEvent(new window.Event('click'));
  await tira();
  await tira();
  ok('gli incantesimi si generano, e il doppione si ritira',
     JSON.stringify(by(aId).magic.numbers) === '[1,5]' &&
     state.game.log.slice(0, 3).some(l => /doppioni ritirati: 1/.test(l.text) && /Fireball, Oaken Shield/.test(l.text)));
  deploy.renderAll();
  ok('e ognuno ha il suo pulsante', !!doc.querySelector(`#inspector [data-mg-cast="${aId}|fireball"]`));

  /* Oaken Shield dall'inizio del turno, con un doppio 6: la casella del
     libro (la congiurazione) sta piu' avanti, e il lancio ci va da solo
     senza portarsi dietro la nota «fuori posto». E' l'errore che solo il
     browser aveva visto. */
  deploy.act('inizio turno', () => G.goStep(0));
  deploy.renderAll();
  D.setSource(facce([6, 6]));
  doc.querySelector(`#inspector [data-mg-cast="${aId}|oakenShield"]`).dispatchEvent(new window.Event('click'));
  await tira();
  const avanti = state.game.log[0];
  ok('dall inizio del turno il lancio va da solo nella congiurazione, senza nota',
     state.game.step === 2 && /Oaken Shield/.test(avanti.text) && /Congiurazione/.test(avanti.step) &&
     !/\[/.test(avanti.text));
  ok('il doppio 6 e un invocazione perfetta, e nessuno chiede di dissolverla',
     /invocazione perfetta/.test(avanti.text) && !doc.querySelector('.dlg-back'));
  ok('l effetto sta sul mago', EFm.effectsOf(by(aId)).some(e => e.id === 'spell:oakenShield'));

  /* Fireball nella fase di tiro: bersaglio, 4 + 5 + Livello 2 = 11 contro
     8, nessun dissolvimento, sei e sei fanno dodici colpi */
  deploy.act('fase di tiro', () => G.goStep(8));
  deploy.renderAll();
  D.setSource(facce([4, 5, 6, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]));
  doc.querySelector(`#inspector [data-mg-cast="${aId}|fireball"]`).dispatchEvent(new window.Event('click'));
  ok('il lancio chiede il bersaglio', await pick(String(bId)));
  await tira();
  ok('lanciato, l avversario sceglie se dissolvere', await pick('none'));
  await tira();
  const lanci = state.game.log.slice(0, 6).map(l => l.text).join(' | ');
  ok('il registro scrive il lancio con il suo tiro', /lancia Fireball su .*lancio 4 \+ 5 \+ 2 di Livello = 11 contro 8\+ — lanciato/.test(lanci));
  ok('e i colpi, tirati e risolti', /12 colpi a Forza 4/.test(lanci));
  ok('l incantesimo e tentato per questo turno', castTried(by(aId), 'fireball'));

  /* Oaken Shield di nuovo, adesso dalla fase di tiro: la congiurazione e'
     rimasta indietro, e il turno non torna indietro per un incantesimo.
     Si lancia dove si e', e il registro dice dove andava e che era gia'
     stato tentato. */
  D.setSource(facce([6, 6]));
  deploy.renderAll();
  doc.querySelector(`#inspector [data-mg-cast="${aId}|oakenShield"]`).dispatchEvent(new window.Event('click'));
  await tira();
  const indietro = state.game.log[0];
  ok('dalla fase di tiro non si torna indietro nel turno', state.game.step === 8 && /Oaken Shield/.test(indietro.text));
  ok('e il registro dice dove andava, e che era gia tentato',
     /congiurazione/.test(indietro.text) && /una volta per turno/.test(indietro.text));
  D.setSource(null);

  /* si annulla fino a prima del «mago di prova»: le tendine del Livello e
     del dominio sono azioni che non scrivono righe, e contare le righe
     del registro fermava l'annulla a meta' */
  for (let i = 0; i < 40 && (by(aId).rules || []).includes('Wizard'); i++) history.undo();
  ok('l annulla riporta indietro lanci, effetti e preparazione del mago',
     !(by(aId).rules || []).includes('Wizard') && !by(aId).magic &&
     !EFm.effectsOf(by(aId)).some(e => /^spell:/.test(e.id)) && state.game.log.length === righe);
  MGm.useMagic(prima);
  for (const id of parcheggiate) by(id).placed = true;
  ok('nessun errore attorno alla magia', errors.length === 0);
}
function castTried(x, id){ return !!(x.magic && x.magic.cast && x.magic.cast.ids.includes(id)); }

console.log('\nunita scritte a mano');
const handList = await listsMod.createList('Lista a mano');
await listsMod.addUnit(handList.id, { name: 'Orc Boyz', models: 20, pts: 140, baseId: '25x25' });
ok('una lista si scrive senza nessun file', listsMod.getList(handList.id).units.length === 1);
ok('i punti si sommano da soli', listsMod.getList(handList.id).points === 140);
await listsMod.updateUnit(handList.id, 0, { models: 25 });
ok('e ogni campo si corregge dopo', listsMod.getList(handList.id).units[0].models === 25);
const copy = await listsMod.duplicateList(handList.id);
ok('duplicare una lista da una variante da ritoccare',
   copy.units.length === 1 && copy.id !== handList.id);

/* il catalogo si propone da solo mentre si scrive il nome: e' l'unico
   momento in cui l'aggancio costa zero */
click('[data-tab="lists"]');
listsMod.renderLists();
const addName = doc.querySelector('#ls-add-name');
addName.value = 'sau';
addName.dispatchEvent(new window.Event('input', { bubbles: true }));
const sug = doc.querySelector('.suggest');
ok('scrivendo mezzo nome il catalogo si propone',
   !!sug && /Saurus Warriors/.test(sug.textContent));
sug.querySelector('.sug').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
ok('scegliendo si scrive il nome per intero', addName.value === 'Saurus Warriors');
ok('e viene dietro la basetta che quel tipo ha in collezione',
   doc.querySelector('#ls-add-base').value === '30x30');
ok('la tendina si chiude appena scelto', !doc.querySelector('.suggest'));
/* Una lista scritta a mano non porta profili, e senza profili non si
   può simulare: la scheda lo dice in chiaro invece di far uscire zero
   contro zero (vedi il §4 di prep.js). */
ok('una lista senza profili dice che non si può simulare',
   /Non si può simulare/.test(doc.querySelector('#lists').textContent));
ok('e dice quale unità e perché',
   /Orc Boyz/.test(doc.querySelector('#lists').textContent) &&
   /nessun profilo/.test(doc.querySelector('#lists').textContent));
click('#ls-add-unit');
await settle(60);
const written = listsMod.getList(copy.id) || listsMod.getList(handList.id);
const added = written.units[written.units.length - 1];
ok('l unita entra in lista gia agganciata al catalogo',
   added.name === 'Saurus Warriors' && cat.catEntry(added.catId)?.name === 'Saurus Warriors');
/* i filtri dell'elenco: quelli che rispondono a «quali liste hanno i
   Clanrats?» senza aprirle una per una */
listsMod.renderLists();
const carteTutte = doc.querySelectorAll('#lists .ls-card').length;
ok('le liste si vedono come schede, non come righe', carteTutte > 0);
const q = doc.querySelector('#ls-q');
q.value = 'saurus';
q.dispatchEvent(new window.Event('input', { bubbles: true }));
const carteFiltro = doc.querySelectorAll('#lists .ls-card').length;
ok('il testo filtra l elenco guardando dentro le unita', carteFiltro < carteTutte);
q.value = '';
q.dispatchEvent(new window.Event('input', { bubbles: true }));
ok('e togliendolo tornano tutte',
   doc.querySelectorAll('#lists .ls-card').length === carteTutte);

/* una lista esterna: non è tua e non deve comparire nel conto della vetrina */
const esterna = await listsMod.createList('Quella del vicino', { external: true });
await listsMod.addUnit(esterna.id, { name: 'Saurus Warriors', models: 30, pts: 300 });
ok('una lista esterna non si aggancia alla collezione',
   listsMod.getList(esterna.id).units[0].catId == null);
ok('e non chiede cosa ti manca',
   listsMod.coverage(listsMod.getList(esterna.id)).missing === 0 &&
   listsMod.coverage(listsMod.getList(esterna.id)).external === true);
listsMod.renderLists();
ok('nell elenco si riconosce', !!doc.querySelector('#lists .ls-card.ext'));

const unitsBefore = state.units.length;
doc.querySelector('[data-addunit="B"]').dispatchEvent(new window.Event('click'));
await answer('Reggimento a mano');
ok('e un unita si aggiunge al tavolo senza passare da un roster',
   state.units.length === unitsBefore + 1 &&
   state.units[state.units.length - 1].name === 'Reggimento a mano');

console.log('\nlink condiviso');
const share = await import('../src/share.js');
const code = await share.encodeBoard(deploy.snapshot());
ok('il codice sta in un URL', code.length < 40000);
const back = await share.decodeBoard(code);
ok('le unita tornano indietro tutte', back.units.length === state.units.length);
ok('le posizioni sono conservate',
   Math.abs(back.units[0].x - state.units[0].x) < 0.2);
ok('la formazione viaggia nel link',
   back.units.some(u => u.formation && u.formation.mode === 'free'));
ok('e anche i personaggi uniti',
   back.units.some(u => u.join && u.join.host != null));
ok('le foto non viaggiano nel link', !/data:image/.test(code));
ok('i marcatori viaggiano nel link',
   (back.markers || []).some(m => m.label === 'obiettivo centrale'));
ok('e anche le zone disegnate a mano',
   (back.zones || []).some(z => z.label === 'zona di prova'));
ok('etichette e ferite non si perdono per strada',
   back.units.some(u => (u.tags || []).includes('disordinata')));

console.log('\nil report racconta anche le cose generiche');
const rep2 = BL.buildReport(state, { label: 'Prova', group: '', pts: 0, deploy: '', desc: '' },
                            { title: 'Prova generica' });
const md2 = BL.reportMarkdown(rep2);
ok('le ferite hanno una colonna loro', /\| Ferite \|/.test(md2));
ok('e le etichette pure', /\| Etichette \|/.test(md2));
ok('i marcatori hanno un capitolo', /## Marcatori sul tavolo/.test(md2));
ok('e le zone disegnate anche', /## Zone di schieramento disegnate a mano/.test(md2));
ok('la legenda spiega che sono testo libero del giocatore',
   /l'app non le interpreta/.test(md2));

console.log('\nimmagine del tavolo');
const { inlineSvg } = await import('../src/imgexport.js');
const svgText = inlineSvg(doc.querySelector('#board'));
ok('l\'SVG serializzato non contiene piu var(--...)', !/var\(--/.test(svgText));
ok('ha una dimensione esplicita', /width="\d+"/.test(svgText));

console.log('\nfinestra dell\'archivio su GitHub');
/* nessuna chiamata vera: il finto ramo basta a far vedere alla
   finestra che il repository e raggiungibile */
const chiamate = [];
globalThis.fetch = async url => {
  chiamate.push(String(url));
  return { ok: true, status: 200, json: async () => ({ object: { sha: 'a'.repeat(40) } }) };
};
click('#btn-sync');
await settle(60);
ok('la finestra si apre', !!doc.querySelector('#sync-modal'));
ok('i pulsanti partono spenti finche manca il token',
   doc.querySelector('#s-push').disabled === true);

const scrivi = (sel, v) => {
  const el = doc.querySelector(sel);
  el.value = v;
  el.dispatchEvent(new window.Event('change'));
};
scrivi('#s-owner', 'tizio');
scrivi('#s-repo', 'archivio');
scrivi('#s-token', 'finto');
await settle(60);
const cfgSalvata = JSON.parse(window.localStorage.getItem('tow-sync'));
ok('le impostazioni restano scritte',
   cfgSalvata.owner === 'tizio' && cfgSalvata.repo === 'archivio' && cfgSalvata.branch === 'main');
ok('adesso si puo salvare', doc.querySelector('#s-push').disabled === false);
ok('ha chiesto a GitHub dove sta il ramo',
   chiamate.some(u => /api\.github\.com\/repos\/tizio\/archivio\/git\/ref\/heads\/main/.test(u)));
click('#s-close');
ok('e si chiude', !doc.querySelector('#sync-modal'));
ok('nessun errore attorno alla sincronia', errors.length === 0);
window.localStorage.removeItem('tow-sync');

/* Il guscio che va in cache per l'uso senza rete.
   Un modulo nuovo che nessuno aggiunge a `sw.js` non si vede: l'app
   funziona finché c'è campo, e al circolo — dove il service worker
   serve — si apre rotta. Il conto lo fa la prova, che lo sa fare. */
console.log('\nla sfida contro l\'AI');
{
  const CA = await import('../src/controai.js');
  const DP = await import('../src/deploy.js');
  const liste = JSON.parse(fs.readFileSync(path.join(root, 'dati', 'liste.json'), 'utf8'));
  const [la, lb] = [liste[1], liste[2]];
  ok('lo scenario si prende dal nome delle liste di Battle March',
     CA.scenarioPer(la, lb) === 'bm-monolite' && CA.scenarioPer(la, lb, 'bm-strada') === 'bm-strada');
  ok('e l arbitro sa giocare solo gli scenari con un tavolo e uno schieramento',
     CA.scenariGiocabili().every(s => s.id) && CA.scenariGiocabili().some(s => s.id === 'bm-strada'));
  window.localStorage.removeItem('tow-gemini-key');
  /* l'AI che aspetta di farti leggere le schede e' per chi guarda: qui
     si contano i clic, e trenta millesimi fra uno e l'altro non bastano
     ad aspettare nessuno */
  window.localStorage.setItem('tow-sfida-calma', '0');
  CA.startSfida({ listA: la, listB: lb, mia: 'A' });
  await settle(80);
  ok('la sfida porta sul tavolo le due liste e lo scenario',
     DP.state.sfida === true && DP.state.scenario === 'bm-monolite' &&
     DP.state.units.length === la.units.length + lb.units.length);
  ok('senza chiave gioca l euristica, e il pannello lo dice',
     /l'euristica/.test(doc.querySelector('#sfida .sf-testa').textContent));
  let clic = 0;
  for (let i = 0; i < 40 && !/Turno 2/.test(doc.querySelector('#sfida .sf-testa').textContent); i++){
    const b = [...doc.querySelectorAll('#sfida .sf-mossa')].find(x => !x.classList.contains('ghost')) ||
              doc.querySelector('#sfida .sf-mossa');
    if (!b){ await settle(30); continue; }
    b.dispatchEvent(new window.Event('click'));
    clic++;
    await settle(30);
  }
  ok('le mosse si scelgono con un clic, e la partita arriva al secondo turno',
     clic > 5 && /Turno 2/.test(doc.querySelector('#sfida .sf-testa').textContent));
  ok('il tavolo mostra dove l arbitro ha messo i pezzi',
     DP.state.units.filter(u => u.placed).length >= 10);
  ok('il registro scorre nel pannello', doc.querySelectorAll('#sfida .sf-riga').length > 10);
  ok('le righe con i dadi si aprono sul loro perché', doc.querySelectorAll('#sfida .sf-perche .sp').length > 0);
  ok('e le schede del perché compaiono sopra il tavolo', doc.querySelectorAll('.board-scroll .sp-pila .sp').length > 0);
  /* un pezzo non si trascina: lo muove l'arbitro */
  const u = DP.state.units.find(x => x.placed && !x.join);
  const prima = [u.x, u.y];
  const g = doc.querySelector(`[data-uid="${u.uid}"]`);
  if (g){
    g.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    doc.querySelector('#board').dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 200, clientY: 200 }));
    doc.querySelector('#board').dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 200, clientY: 200 }));
  }
  ok('nella sfida i pezzi non si trascinano', u.x === prima[0] && u.y === prima[1]);
  doc.querySelector('#sf-basta').dispatchEvent(new window.Event('click'));
  await settle(30);
  ok('abbandonata, il tavolo torna libero', DP.state.sfida === false && !CA.inCorso());
  ok('nessun errore nella sfida', errors.length === 0);
}

console.log('\nil guscio per stare senza rete');
{
  const root = path.resolve(here, '..');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const inCache = new Set([...sw.matchAll(/"\.\/(src\/[\w.-]+\.js)"/g)].map(m => m[1]));
  const onDisk = fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.js')).map(f => 'src/' + f);
  const mancanti = onDisk.filter(f => !inCache.has(f));
  const fantasmi = [...inCache].filter(f => !onDisk.includes(f));
  if (mancanti.length) console.log('      mancano: ' + mancanti.join(', '));
  if (fantasmi.length) console.log('      fantasmi: ' + fantasmi.join(', '));
  ok('ogni modulo dell app sta nella cache del service worker', mancanti.length === 0);
  ok('e nella cache non c e niente che non esiste', fantasmi.length === 0);
}

if (errors.length) console.log('\nerrori:\n  ' + errors.join('\n  '));
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
