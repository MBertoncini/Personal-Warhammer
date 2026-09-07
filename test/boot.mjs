/* Avvia la pagina intera in jsdom e controlla che tutto si regga:
 * le quattro schede, le anteprime, l'annulla, lo zoom, gli aiuti
 * tattici, il ventaglio di movimento, il campo di tiro, lo scontro
 * simulato, la modalita' partita, il terreno casuale e il link.
 * Si lancia con:  node test/boot.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

/* import.meta.dirname vuole Node >= 20.11; questa forma va anche prima */
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
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
const settle = (ms = 60) => new Promise(r => setTimeout(r, ms));

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
for (const t of ['catalog', 'lists', 'matchup', 'deploy']) {
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
  applyBtn = duelHost.querySelector('#d-apply');
}
ok('tirati i dadi si vedono le facce', duelHost.querySelectorAll('.die').length > 0);
ok('e il conto di fine assalto', /Risoluzione/.test(duelHost.textContent));
ok('in venticinque assalti qualcuno cade sempre', !!applyBtn);

const defender = state.units.find(u => u.army === 'B' &&
  new RegExp(u.name.slice(0, 6)).test(duelHost.textContent));
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
ok('nessun errore nello scontro simulato', errors.length === 0);

console.log('\nrighelli');
const rulerCount = () => state.rulers.length;
deploy.act('misura', () => { state.rulers.push([[0, 0], [254, 0]]); });
ok('il righello resta sul tavolo', rulerCount() === 1);
click('#btn-rulers-clear');
ok('e si toglie tutto insieme', rulerCount() === 0);

console.log('\nmodalita partita');
const game = await import('../src/game.js');
click('#g-start');
ok('la partita comincia al turno 1', state.game.on && state.game.turn === 1);
const mob = state.units.find(u => u.models >= 10);
const depth0 = mob.placed ? deploy.effModels(mob) : mob.models;
deploy.act('perdite', () => game.setLost(mob, 5));
ok('i modelli in piedi calano', deploy.effModels(mob) === depth0 - 5);
ok('il tabellino conta i punti persi', game.score()[mob.army].lostPts > 0);
click('#g-next');
ok('la fase avanza', state.game.phase === 1);
deploy.act('distrutta', () => game.destroy(mob));
ok('l\'unita distrutta lascia il campo', mob.dead === true && mob.placed === false);
history.undo();
ok('anche la distruzione si annulla',
   state.units.find(u => u.uid === mob.uid).dead === false);
ok('il registro ha delle righe', state.game.log.length > 0);
ok('nessun errore in partita', errors.length === 0);

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
await settle(120);
ok('lo scenario finisce fra i miei', kit.allCustom().length === 1);
ok('compare nel menu a tendina',
   [...doc.querySelectorAll('#scenario option')].some(o => /prova/i.test(o.textContent)));
await kit.removeCustom(kit.allCustom()[0].id);

console.log('\nlink condiviso');
const share = await import('../src/share.js');
const code = await share.encodeBoard(deploy.snapshot());
ok('il codice sta in un URL', code.length < 40000);
const back = await share.decodeBoard(code);
ok('le unita tornano indietro tutte', back.units.length === state.units.length);
ok('le posizioni sono conservate',
   Math.abs(back.units[0].x - state.units[0].x) < 0.2);
ok('le foto non viaggiano nel link', !/data:image/.test(code));

console.log('\nimmagine del tavolo');
const { inlineSvg } = await import('../src/imgexport.js');
const svgText = inlineSvg(doc.querySelector('#board'));
ok('l\'SVG serializzato non contiene piu var(--...)', !/var\(--/.test(svgText));
ok('ha una dimensione esplicita', /width="\d+"/.test(svgText));

if (errors.length) console.log('\nerrori:\n  ' + errors.join('\n  '));
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
