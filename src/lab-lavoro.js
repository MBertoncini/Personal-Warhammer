/* Schieramento Old World — il lavoratore del Laboratorio
 *
 * Un Web Worker che gioca celle (lab-partite.js) una dopo l'altra, come
 * i worker_threads di tools/liste/motore.mjs: i profili, gli eserciti,
 * le cavalcature e i domini si caricano una volta, e poi ogni messaggio
 * è una serie. La pagina ne accende tanti quanti sono i processori meno
 * uno (lab-motore.js), e la ricerca non si accorge di dove gira.
 */

import * as PR from './profiles.js';
import * as ARM from './armies.js';
import * as MG from './magic.js';
import * as MT from './mounts.js';
import { giocaCella } from './lab-partite.js';

let pronti = null;
function caricaDati(){
  if (pronti) return pronti;
  const qui = p => new URL(p, import.meta.url).href;
  pronti = Promise.all([
    PR.loadProfiles(qui('../dati/profili.json')),
    ARM.loadArmies(qui('../dati/eserciti/')),
    MT.loadMounts(qui('../dati/cavalcature.json')),
    MG.loadMagic(qui('../dati/magia/domini.json')),
  ]);
  return pronti;
}

self.onmessage = async e => {
  const m = e.data || {};
  if (m.tipo !== 'cella') return;
  try {
    await caricaDati();
    self.postMessage({ tipo: 'fatto', id: m.id, r: await giocaCella(m.job) });
  } catch (err){
    self.postMessage({ tipo: 'errore', id: m.id, messaggio: String((err && (err.stack || err.message)) || err).slice(0, 800) });
  }
};
self.postMessage({ tipo: 'acceso' });
