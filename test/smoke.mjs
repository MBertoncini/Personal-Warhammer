/* Prova di funzionamento: monta la pagina in jsdom, importa una lista
 * finta di New Recruit, la aggancia al catalogo e verifica il matchup.
 * Si lancia con:  node test/smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'https://example.org/' });
const { window } = dom;

for (const k of ['window', 'document', 'Image', 'FileReader', 'Blob',
                 'HTMLElement', 'Node', 'Element', 'CustomEvent', 'getComputedStyle']) {
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

console.log('\npersistenza');
await store.saveDoc('prova', { a: 1 });
ok('rilettura da IndexedDB', (await store.loadDoc('prova')).a === 1);
const dump = await store.exportAll();
ok('backup contiene il catalogo', 'catalog:entries' in dump.data);

console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
