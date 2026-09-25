/* Schieramento Old World — la candidata che resta, nell'archivio
 *
 *   node tools/liste/salva.mjs --file tools/liste/esempi.mjs --cand ogOrdaNera
 *   node tools/liste/salva.mjs --bilancia 1000 [--nomi "SKA abominio=La campana e l'Abominio;..."]
 *
 * Aggiunge le candidate scelte in fondo a dati/liste.json con un id nuovo,
 * lo stesso formato che l'app dà alle liste (`l` + tempo in base 36). La
 * nota e le risposte della scheda di preparazione — generale, stendardo,
 * Livello e dominio dei maghi — viaggiano con la lista: senza, il Livello
 * comprato come opzione non si vede e il mago lancia come uno di base.
 * Con l'Archivio (o la Nuvola) la lista arriva nell'app.
 *
 * Con --bilancia le liste sono quelle di dati/ricerche/bilancia-<punti>.json
 * (tools/liste/bilancia.mjs), ricostruite dai loro geni con lo spazio del
 * loro tema; --nomi dà a ognuna il nome con cui compare nell'app.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lista, avvisiComposizione } from './unita.mjs';
import { spazio } from './spazio.mjs';
import { leggi } from './ricerche.mjs';

const qui = path.dirname(fileURLToPath(import.meta.url));
const fileListe = path.join(qui, '..', '..', 'dati', 'liste.json');
const argv = process.argv.slice(2);
const arg = k => { const i = argv.indexOf('--' + k); return i < 0 ? null : argv[i + 1]; };
const nuovoId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const archivio = JSON.parse(fs.readFileSync(fileListe, 'utf8'));
const dire = l => { const av = avvisiComposizione(l); console.log(`${l.id}  «${l.name}»  ${l.points} pt${av.length ? '  ⚠ ' + av.join(', ') : ''}`); };

if (arg('bilancia')){
  const punti = +arg('bilancia');
  const doc = leggi(`bilancia-${punti}.json`);
  if (!doc){ console.error(`Non c'è dati/ricerche/bilancia-${punti}.json: lancia prima bilancia.mjs.`); process.exit(1); }
  const nomi = Object.fromEntries(String(arg('nomi') || '').split(';').filter(Boolean).map(s => s.split('=').map(x => x.trim())));
  const temi = Object.fromEntries(Object.values(leggi('indice.json').file || []).map(f => leggi(f.file))
    .filter(d => d && d.formato === 'tow-ricerca/1' && d.punti === punti && d.tema).map(d => [`${d.fazione}|${d.tema.nome}`, d.tema]));
  for (const b of doc.liste){
    const t = temi[`${b.fazione}|${b.tema}`] || {};
    const S = spazio(b.fazione, { pool: 'collezione', punti, con: t.con || [], senza: t.senza || [] });
    const err = S.valida(b.geni);
    if (err.length){ console.error(`${b.nome}: non vale più (${err.join('; ')}), la salto.`); continue; }
    const l = S.costruisci(b.geni, { id: nuovoId(), name: nomi[b.nome] || `${b.nome} ${punti}` });
    archivio.push(l);
    dire(l);
  }
} else {
  if (!arg('file') || !arg('cand')){ console.error('Uso: node tools/liste/salva.mjs --file <candidate.mjs> --cand chiave1,chiave2  oppure  --bilancia <punti>'); process.exit(1); }
  const { CANDIDATE } = await import(pathToFileURL(path.resolve(arg('file'))).href);
  for (const k of arg('cand').split(',')){
    if (!CANDIDATE[k]){ console.error(`«${k}» non è fra le candidate.`); process.exit(1); }
    const l = lista(CANDIDATE[k], nuovoId());
    archivio.push(l);
    dire(l);
  }
}
fs.writeFileSync(fileListe, JSON.stringify(archivio, null, 2) + '\n');
