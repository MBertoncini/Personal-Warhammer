/* Schieramento Old World — la candidata che resta, nell'archivio
 *
 *   node tools/liste/salva.mjs --file tools/liste/esempi.mjs --cand ogOrdaNera
 *
 * Aggiunge le candidate scelte in fondo a dati/liste.json con un id nuovo,
 * lo stesso formato che l'app dà alle liste (`l` + tempo in base 36). La
 * nota e le risposte della scheda di preparazione — generale, stendardo,
 * Livello e dominio dei maghi — viaggiano con la lista: senza, il Livello
 * comprato come opzione non si vede e il mago lancia come uno di base.
 * Con l'Archivio (o la Nuvola) la lista arriva nell'app.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lista, avvisiComposizione } from './unita.mjs';

const qui = path.dirname(fileURLToPath(import.meta.url));
const fileListe = path.join(qui, '..', '..', 'dati', 'liste.json');
const argv = process.argv.slice(2);
const arg = k => { const i = argv.indexOf('--' + k); return i < 0 ? null : argv[i + 1]; };
if (!arg('file') || !arg('cand')){ console.error('Uso: node tools/liste/salva.mjs --file <candidate.mjs> --cand chiave1,chiave2'); process.exit(1); }
const { CANDIDATE } = await import(pathToFileURL(path.resolve(arg('file'))).href);

const archivio = JSON.parse(fs.readFileSync(fileListe, 'utf8'));
for (const k of arg('cand').split(',')){
  if (!CANDIDATE[k]){ console.error(`«${k}» non è fra le candidate.`); process.exit(1); }
  const id = 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const l = lista(CANDIDATE[k], id);
  archivio.push(l);
  const av = avvisiComposizione(l);
  console.log(`${id}  «${l.name}»  ${l.points} pt${av.length ? '  ⚠ ' + av.join(', ') : ''}`);
}
fs.writeFileSync(fileListe, JSON.stringify(archivio, null, 2) + '\n');
