/* Avvia la pagina intera in jsdom e controlla che le quattro schede
 * si disegnino senza errori. Si lancia con:  node test/boot.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import 'fake-indexeddb/auto';

const root = path.resolve(import.meta.dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
                      { pretendToBeVisual: true, url: 'https://example.org/' });
const { window } = dom;

for (const k of ['window', 'document', 'Image', 'FileReader', 'Blob', 'URL',
                 'HTMLElement', 'Node', 'Element', 'SVGElement', 'getComputedStyle',
                 'requestAnimationFrame', 'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true });
}
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.localStorage = window.localStorage;
globalThis.alert = () => {};
globalThis.confirm = () => true;
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
console.log('avvio');
ok('nessun errore in console', errors.length === 0);
ok('la lista d\'esempio e caricata', doc.querySelectorAll('#armies .row').length > 0);
ok('il campo e disegnato', doc.querySelector('#board').children.length > 0);
ok('gli elementi scenici sono a posto', doc.querySelectorAll('#terrain-list .row').length > 0);

console.log('\nanteprime per modello');
const firstRow = doc.querySelector('#armies .row .minis');
ok('la riga mostra un segnaposto per ogni modello', firstRow && firstRow.children.length > 0);

console.log('\nschede');
for (const t of ['catalog', 'lists', 'matchup', 'deploy']) {
  doc.querySelector(`[data-tab="${t}"]`).dispatchEvent(new window.Event('click'));
  const panel = doc.querySelector(`[data-panel="${t}"]`);
  ok(`scheda ${t} visibile e piena`, !panel.hidden && panel.textContent.trim().length > 20);
}
ok('nessun errore dopo il giro delle schede', errors.length === 0);

if (errors.length) console.log('\nerrori:\n  ' + errors.join('\n  '));
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
