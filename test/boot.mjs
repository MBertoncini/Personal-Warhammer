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
  /* il tiro passa dal vassoio prima di scrivere il conto: senza
     l'attesa si leggerebbe il pannello di prima */
  await settle(20);
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
const lone = state.units.find(u => u.army === 'A' && (u.models || 1) === 1 &&
                                   !FM.isCharacter(u) && !FM.joinedHost(u));
const bigA = state.units.find(u => u.army === 'A' && u.models > 1 && !FM.joinedHost(u));
ok('c e un pezzo da un modello solo che il roster non chiama personaggio', !!lone && !!bigA);
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
ok('il verdetto dice chi ha vinto e di quanto', vd.winner === 'A' && /vittoria|pareggio/i.test(vd.text));

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
ok('e sopra la marcia diventa carica', MV.bandOf(mover, 17).key === 'chargeMax');
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
deploy.act('fine turno', game.closeTurn);
ok('chiudere il turno rimette le ancore dove sei arrivato',
   game.game().turns.length === before + 1 &&
   Math.abs(MV.anchorOf(mover).x - mover.x) < 0.01);

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
  ok('il piano di carica sa fin dove si arriva', !!plan && plan.max === plan.move + 12);
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
click('#ls-add-unit');
await settle(60);
const written = listsMod.getList(copy.id) || listsMod.getList(handList.id);
const added = written.units[written.units.length - 1];
ok('l unita entra in lista gia agganciata al catalogo',
   added.name === 'Saurus Warriors' && cat.catEntry(added.catId)?.name === 'Saurus Warriors');
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

if (errors.length) console.log('\nerrori:\n  ' + errors.join('\n  '));
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
