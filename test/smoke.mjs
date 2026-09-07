/* Prova di funzionamento: monta la pagina in jsdom, importa una lista
 * finta di New Recruit, la aggancia al catalogo e verifica il matchup.
 * Si lancia con:  node test/smoke.mjs
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
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://example.org/' });
const { window } = dom;

for (const k of ['window', 'document', 'Image', 'FileReader', 'Blob',
                 'HTMLElement', 'Node', 'Element', 'CustomEvent', 'getComputedStyle',
                 'location', 'history', 'btoa', 'atob', 'XMLSerializer']) {
  Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true });
}
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.localStorage = window.localStorage;
globalThis.alert   = m => console.log('  [alert]', m);
globalThis.confirm = () => true;
globalThis.prompt  = () => 'prova';
window.HTMLCanvasElement.prototype.getContext = () => ({ fillRect(){}, drawImage(){}, fillStyle:'' });
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};

const cat = await import('../src/catalog.js');
const lists = await import('../src/lists.js');
const store = await import('../src/store.js');

await cat.initCatalog();
await lists.initLists();

console.log('\ncatalogo');
await cat.upsertEntry({ name: 'Black Orc', faction: 'Orc & Goblin Tribes', baseId: '25x25', owned: 10 });
await cat.upsertEntry({ name: 'Orc Boy',   faction: 'Orc & Goblin Tribes', baseId: '25x25', owned: 24 });
ok('due voci salvate', cat.catalogAll().length === 2);

console.log('\naggancio dei nomi');
ok('"11 Black Orc Mob" -> Black Orc',
   cat.catEntry(cat.matchUnitName('11 Black Orc Mob'))?.name === 'Black Orc');
ok('"25 Orc Mob" -> Orc Boy o niente (non Black Orc)',
   cat.catEntry(cat.matchUnitName('25 Orc Mob'))?.name !== 'Black Orc');
ok('"Bastiladon" non si aggancia a caso', cat.matchUnitName('Bastiladon') === null);
ok('candidati proposti per "Orc Mob"', cat.candidatesFor('Orc Mob').length > 0);

console.log('\nalias imparato');
const orcBoy = cat.catalogAll().find(e => e.name === 'Orc Boy');
await cat.linkAlias(orcBoy.id, '25 Orc Mob');
ok('dopo l\'alias, "25 Orc Mob" -> Orc Boy',
   cat.catEntry(cat.matchUnitName('25 Orc Mob'))?.name === 'Orc Boy');

console.log('\nimport di una lista');
const roster = {
  roster: {
    name: 'Waaagh di prova',
    costs: [{ name: 'pts', value: 300 }],
    forces: [{ name: 'Orcs', catalogueName: 'Orc & Goblin Tribes', selections: [
      { name: '25 Orc Mob', type: 'unit', number: 1,
        categories: [{ name: 'Core', primary: 'true' }],
        costs: [{ name: 'pts', value: 150 }],
        selections: [{ name: 'Orc Boy', type: 'model', number: 25 }],
        profiles: [{ typeName: 'Unit', name: 'Orc Boy',
          characteristics: [{ name: 'M', $text: '4' }, { name: 'WS', $text: '3' }] }] },
      { name: '11 Black Orc Mob', type: 'unit', number: 1,
        categories: [{ name: 'Special', primary: 'true' }],
        costs: [{ name: 'pts', value: 150 }],
        selections: [{ name: 'Black Orc', type: 'model', number: 11 }],
        profiles: [{ typeName: 'Unit', name: 'Black Orc',
          characteristics: [{ name: 'M', $text: '4' }] }] },
    ] }],
  },
};
const list = await lists.importListText(JSON.stringify(roster));
ok('due unita lette', list.units.length === 2);
ok('entrambe agganciate da sole', list.units.every(u => u.catId));
ok('conteggio modelli corretto',
   list.units.find(u => /Black/.test(u.name)).models === 11);

console.log('\ncopertura');
const cov = lists.coverage(list);
ok('nessuna unita orfana', cov.unlinked === 0);
/* 11 Black Orc contro 10 posseduti = 1 mancante,
   25 Orc Boy contro 24 posseduti = 1 mancante */
ok('mancano 2 miniature in tutto', cov.missing === 2);
ok('lo scoperto e ripartito su due voci', cov.rows.filter(r => r.short).length === 2);

console.log('\ndoppioni');
/* stesso tipo, fazione scritta come la scrive New Recruit:
   deve sommare sulla voce che c'e' gia', non crearne un'altra */
const before = cat.catalogAll().length;
const mergedId = await cat.upsertEntry(
  { name: 'Orc Boy', faction: 'Orc and Goblin Tribes', baseId: '25x25', owned: 6 }, { merge: true });
ok('merge: nessuna voce in piu', cat.catalogAll().length === before);
ok('merge: finisce sulla voce esistente', mergedId === orcBoy.id);
ok('merge: quantita sommate (24 + 6)', cat.catEntry(mergedId).owned === 30);

/* senza merge il doppione si crea (scelta esplicita), poi si fonde a mano */
const dupId = await cat.upsertEntry(
  { name: 'Orc Boy', faction: 'Orc & Goblin Tribes', baseId: '25x25', owned: 5 });
ok('doppione creato di proposito', cat.catalogAll().length === before + 1);
ok('il doppione viene visto', cat.duplicateGroups().length === 1);
const fusione = await cat.mergeDuplicates();
ok('un doppione rimosso', fusione.removed.length === 1 && cat.catalogAll().length === before);
ok('vince la voce piu fornita', cat.catEntry(dupId) === null);
ok('quantita tutte insieme (30 + 5)', cat.catEntry(orcBoy.id).owned === 35);

console.log('\nri-aggancio');
list.units[0].catId = null;
list.units[1].catId = 'voce-sparita';
await lists.healLinks();
ok('unita senza voce riagganciata', !!list.units[0].catId);
ok('voce sparita sostituita', cat.catEntry(list.units[1].catId)?.name === 'Black Orc');
await lists.linkUnit(list.id, 0, null);
await lists.healLinks();
ok('lo sgancio a mano resta', list.units[0].catId === null);

console.log('\npittura');
/* la domanda vera prima di un torneo non e' "ce le ho" ma "sono dipinte" */
const paint = (n) => cat.upsertEntry({ id: orcBoy.id, name: 'Orc Boy',
  faction: 'Orc & Goblin Tribes', baseId: '25x25', baseW: 25, baseH: 25, owned: 35, painted: n });
await paint(12);
ok('le dipinte si salvano', cat.paintedOf(cat.catEntry(orcBoy.id)) === 12);
await paint(99);
ok('non se ne dipingono piu di quante se ne possiedono',
   cat.paintedOf(cat.catEntry(orcBoy.id)) === 35);
await paint(12);
ok('una voce vecchia senza il campo vale zero', cat.paintedOf({ owned: 10 }) === 0);

await lists.linkUnit(list.id, 0, orcBoy.id);
const cov2 = lists.coverage(list);
const orcRow = cov2.rows.find(r => r.id === orcBoy.id);
/* 25 Orc Boy richiesti, 35 posseduti, 12 dipinti -> 13 da dipingere */
ok('da dipingere solo quello che serve, non tutta la collezione', orcRow.toPaint === 13);
ok('il totale da dipingere finisce nella copertura', cov2.toPaint >= orcRow.toPaint);

console.log('\nmatchup');
const mu = await import('../src/matchup.js');
await mu.initMatchup();
ok('il confronto non esplode senza liste scelte', mu.compare().A === null);
ok('la lista della spesa e vuota senza matchup', mu.todoText() === '');

console.log('\nle cose generiche, senza DOM');
const EX = await import('../src/extras.js');
const MV = await import('../src/movement.js');
const ZN = await import('../src/zones.js');

/* etichette: parole, non un elenco chiuso */
const u1 = { name: 'Prova', tags: [] };
EX.addTag(u1, '  Ha  Caricato ');
ok('l etichetta si normalizza da sola', u1.tags[0] === 'ha caricato');
ok('toggle toglie quello che c e', EX.toggleTag(u1, 'ha caricato') === false && u1.tags.length === 0);

/* contatori: un nome e un numero, e nient altro */
const holder = {};
EX.bumpCounter(holder, 'dadi', 6);
EX.bumpCounter(holder, 'Dadi', -2);
ok('il nome del contatore non distingue le maiuscole', holder.counters.length === 1);
ok('e il conto e giusto', EX.findCounter(holder, 'dadi').value === 4);
ok('il dizionario dei contatori si costruisce dall uso',
   EX.counterVocabulary([holder]).includes('dadi'));

/* ferite: l app conta, non deduce */
const hydra = { models: 1, lost: 0, wounds: 4, stats: { W: '6' } };
ok('la riserva di ferite si legge dal profilo', EX.woundPool(hydra, 1) === 6);
ok('e si scrive come la direbbe un giocatore', EX.woundText(hydra, 1) === '4 / 6');
ok('senza profilo si scrive solo il numero',
   EX.woundText({ models: 1, lost: 0, wounds: 2, stats: null }, 1) === '2');

/* marcatori: un tipo solo per dieci funzionalita */
const mk = EX.makeMarker({ mid: 1, x: 0, y: 0, shape: 'circle', w: 5, label: 'obiettivo' });
ok('un cerchio ha profondita uguale al diametro', mk.h === 5);
ok('e si nomina col raggio', /raggio 2\.5″/.test(EX.markerSize(mk)));
ok('un marcatore rotto non fa cadere il tavolo', EX.ensureMarker(null) === null);

/* movimento: le soglie sono una convenzione dichiarata */
const cav = { stats: { M: '8' }, placed: true, x: 0, y: 0, rot: 0 };
const b = MV.bandsFor(cav);
ok('marcia = M x 2', b.march === 16);
ok('carica media = M + 7', b.charge === 15);
ok('senza M non si inventa niente', MV.bandsFor({ stats: { M: '*' } }) === null);
ok('M corretto a mano vince sul profilo', MV.moveOf({ stats: { M: '4' }, moveOverride: 9 }) === 9);
MV.setAnchor(cav);
cav.x = 25.4 * 3; cav.rot = 90;
const moved = MV.movedFrom(cav);
ok('lo spostamento si misura dall ancora', Math.abs(moved.dist - 3) < 0.001);
ok('e il giro di fronte si dice a parte', moved.turn === 90);
MV.clearAnchor(cav);
ok('senza ancora non c e niente da misurare', MV.movedFrom(cav) === null);

/* zone: quelle disegnate vincono su quelle calcolate */
const geo = { zones: { A: [{ x: 0, y: 0, w: 10, h: 10 }], B: [] }, aux: [{ army: 'B', rect: {} }], blocked: [] };
const mine = [ZN.makeZone({ zid: 1, x: 50, y: 50, w: 20, h: 20, kind: 'A' })];
const out = ZN.applyZones(geo, mine);
ok('la zona disegnata sostituisce quella dello scenario', out.zones.A[0].x === 40);
ok('e l arrivo dal fianco dello scenario non vale piu', out.aux.length === 0);
ok('una zona di tutti e due conta per tutti e due',
   ZN.applyZones(geo, [ZN.makeZone({ zid: 2, x: 5, y: 5, w: 4, h: 4, kind: 'both' })]).zones.B.length === 1);
ok('un area vietata si somma invece di sostituire',
   ZN.applyZones(geo, [ZN.makeZone({ zid: 3, x: 5, y: 5, w: 4, h: 4, kind: 'blocked' })]).zones.A[0].w === 10);
ok('un rettangolo di misura zero non diventa una zona',
   ZN.ensureZone({ x: 0, y: 0, w: 0, h: 5 }) === null);

console.log('\npersistenza');
await store.saveDoc('prova', { a: 1 });
ok('rilettura da IndexedDB', (await store.loadDoc('prova')).a === 1);
const dump = await store.exportAll();
ok('backup contiene il catalogo', 'catalog:entries' in dump.data);

console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
