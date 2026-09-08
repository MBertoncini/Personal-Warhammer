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
click('#g-next');
ok('la fase avanza', state.game.phase === 1);
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
ok('la formazione viaggia nel link',
   back.units.some(u => u.formation && u.formation.mode === 'free'));
ok('e anche i personaggi uniti',
   back.units.some(u => u.join && u.join.host != null));
ok('le foto non viaggiano nel link', !/data:image/.test(code));

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
