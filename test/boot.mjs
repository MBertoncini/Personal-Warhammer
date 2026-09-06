/* Avvia la pagina intera in jsdom e controlla che tutto si regga:
 * le cinque schede, le anteprime, l'annulla, lo zoom, gli aiuti
 * tattici, la modalita' partita con il registro dei turni e il battle
 * report, il terreno casuale e il link.
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

const victim = state.units.find(u => u.army === 'B' && !u.dead);
deploy.act('distrutta', () => game.destroy(victim));
click('#g-close');
const preview = BL.buildReport(state, { label: 'Prova', group: '', pts: 0, deploy: '', desc: '' });
const auto = BL.autoValues(preview);
ok('l\'unita distrutta vale punti per l\'avversario', auto.kill.A >= (victim.pts || 0) && auto.kill.A > 0);
ok('il punteggio automatico finisce nelle righe',
   preview.score.rows.find(r => r.id === 'kill').A === auto.kill.A);
const vd = BL.verdict(preview);
ok('il verdetto dice chi ha vinto e di quanto', vd.winner === 'A' && /vittoria|pareggio/i.test(vd.text));

console.log('\nbattle report');
const reports = await import('../src/reports.js');
await reports.initReports();
const rep = await reports.archiveCurrent();
ok('la partita finisce nell\'archivio', reports.allReports().length === 1);
ok('il report si porta dietro le due liste', rep.roster.A.length > 0 && rep.roster.B.length > 0);
ok('e tutte le fotografie', rep.turns.filter(t => t.kind === 'turn').length === 2);

const md = BL.reportMarkdown(rep, { prompt: true });
ok('il testo spiega alla macchina come si legge', /Come leggere questi dati/.test(md));
ok('chiede l\'analisi che serve', /cosa è andato storto/i.test(md));
ok('c\'e un capitolo per ogni mezzo turno',
   /## Turno 1 — gioca /.test(md) && (md.match(/## Turno /g) || []).length === 2);
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
ok('le foto non viaggiano nel link', !/data:image/.test(code));

console.log('\nimmagine del tavolo');
const { inlineSvg } = await import('../src/imgexport.js');
const svgText = inlineSvg(doc.querySelector('#board'));
ok('l\'SVG serializzato non contiene piu var(--...)', !/var\(--/.test(svgText));
ok('ha una dimensione esplicita', /width="\d+"/.test(svgText));

if (errors.length) console.log('\nerrori:\n  ' + errors.join('\n  '));
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
