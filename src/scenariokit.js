/* Schieramento Old World — scenari propri e terreno casuale
 *
 * I quattro Battle March sono mappe fisse, ed e' giusto cosi'. Ma il
 * tavolo del circolo non e' mai quello del manuale: qui si salva la
 * disposizione che hai davvero, e si genera terreno nuovo che rispetta
 * da solo i vincoli che l'app gia' controlla — nessun pezzo oltre i 12"
 * sul lato lungo, tesori a piu' di 3" da ogni elemento.
 *
 * Il generatore lavora a specchio: quello che mette in una meta' lo
 * ripete ruotato di mezzo giro nell'altra. E' la regola non scritta dei
 * tavoli equi, e toglie di mezzo la discussione su chi ha avuto la
 * collina buona.
 */

import { randomTerrain } from './terreno-casuale.js';
import { loadDoc, saveDoc } from './store.js';

const KEY = "scenarios:custom";

let custom = [];

export async function initScenarioKit(){
  custom = await loadDoc(KEY, []) || [];
  return custom;
}

export const allCustom = () => custom.slice();

/* le voci custom hanno la stessa forma di quelle in scenarios.js, cosi'
   il resto del codice non deve sapere da dove arrivano. Un tavolo
   generato dal Laboratorio per Battle March resta Battle March: il
   formato lo legge victory.js dal gruppo. */
export function customScenarioMap(){
  const out = {};
  for (const s of custom) out[s.id] = { ...s, group: s.formato === "bm" ? "Battle March" : "Miei scenari" };
  return out;
}

const persist = () => saveDoc(KEY, custom);

export async function saveCustom({ name, table, gap, deploy, desc, terrain, id = null, formato = null }){
  const rec = {
    id: id || "sx" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    label: name || "Scenario mio",
    table, gap, deploy: deploy || "pitched battle",
    desc: desc || "Scenario salvato dal tavolo.",
    terrain,
    ...(formato === "bm" ? { formato } : {}),
  };
  const i = custom.findIndex(s => s.id === rec.id);
  if (i >= 0) custom[i] = rec; else custom.push(rec);
  await persist();
  return rec.id;
}

export async function removeCustom(id){
  custom = custom.filter(s => s.id !== id);
  await persist();
}

/* ============================================================
   GENERATORE
   Sta in terreno-casuale.js, con il seme e senza archivio: lo usa
   anche il Laboratorio, nei Web Worker. Qui resta il nome di sempre.
   ============================================================ */
export { randomTerrain };
