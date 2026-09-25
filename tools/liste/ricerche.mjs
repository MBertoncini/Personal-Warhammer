/* Schieramento Old World — dove finiscono le ricerche
 *
 * Ogni ricerca scrive un file in dati/ricerche/, uno per fazione,
 * serbatoio (tutte le unità o la collezione), punti e scenari; il torneo
 * fra le liste trovate ne scrive uno per livello di punti. L'indice
 * elenca i file: è quello che legge la scheda Laboratorio dell'app.
 *
 * La Nuvola non li tocca: `sync.js` salta i file che non ha scritto lui,
 * e non li cancella.
 */
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './motore.mjs';

export const CARTELLA = path.join(REPO, 'dati', 'ricerche');

export function scrivi(nome, doc){
  fs.mkdirSync(CARTELLA, { recursive: true });
  fs.writeFileSync(path.join(CARTELLA, nome), JSON.stringify(doc, null, 1) + '\n');
  indicizza();
}

export function leggi(nome){
  try { return JSON.parse(fs.readFileSync(path.join(CARTELLA, nome), 'utf8')); } catch (_){ return null; }
}

export function tutte(){
  if (!fs.existsSync(CARTELLA)) return [];
  return fs.readdirSync(CARTELLA).filter(f => f.endsWith('.json') && f !== 'indice.json')
    .map(f => ({ file: f, doc: leggi(f) })).filter(x => x.doc);
}

/* l'indice: per ogni file quello che serve per decidere se aprirlo */
export function indicizza(){
  const file = tutte().map(({ file, doc }) => ({
    file, formato: doc.formato, quando: doc.quando, punti: doc.punti,
    ...(doc.formato === 'tow-ricerca/1' ? { fazione: doc.fazione, pool: doc.pool, scenari: doc.scenari } : {}),
    ...(doc.formato === 'tow-torneo/1' ? { scenari: doc.scenari.map(s => s.id), liste: doc.liste.length } : {}),
  })).sort((a, b) => a.file.localeCompare(b.file));
  fs.mkdirSync(CARTELLA, { recursive: true });
  fs.writeFileSync(path.join(CARTELLA, 'indice.json'), JSON.stringify({ formato: 'tow-ricerche/1', aggiornato: new Date().toISOString(), file }, null, 1) + '\n');
}

/* il nome del file di una ricerca: i sei scenari non si scrivono, uno
   solo sì, un altro gruppo con quanti sono e un'impronta */
export function nomeRicerca({ fazione, pool, punti, scenari, sei, tema = null }){
  const uguali = sei.length === scenari.length && sei.every(s => scenari.includes(s));
  let coda = '';
  if (!uguali){
    if (scenari.length === 1) coda = '-' + scenari[0];
    else { let h = 0; for (const c of [...scenari].sort().join(',')) h = (h * 31 + c.charCodeAt(0)) >>> 0; coda = `-${scenari.length}sc-${h.toString(36).slice(0, 5)}`; }
  }
  return `${fazione}-${pool}-${punti}${coda}${tema ? '-' + tema : ''}.json`.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/* la migliore di ogni ricerca a questi punti: sono gli avversari delle
   ricerche successive e le liste del torneo */
export function campioni(punti, { tranne = null } = {}){
  return tutte().filter(({ file, doc }) => doc.formato === 'tow-ricerca/1' && doc.punti === punti && file !== tranne && (doc.migliori || []).length)
    .map(({ file, doc }) => ({ file, doc, lista: doc.migliori[0].lista }));
}
