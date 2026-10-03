/* Schieramento Old World — una partita dell'arbitro, nell'archivio
 *
 * `partita.mjs` gioca una partita e scrive una pagina da guardare. Qui
 * la stessa partita diventa una voce del diario, nella forma che la
 * scheda Partite dell'app legge da sempre (`battle-report/1`): liste,
 * terreno, una fotografia a fine schieramento e una a fine di ogni
 * mezzo turno, il punteggio, il registro.
 *
 * Il report non si costruisce a mano: lo costruisce `battlelog.js`, lo
 * stesso codice che archivia una partita giocata sul tavolo. Quello
 * che serve e' uno «stato del tavolo» come lo tiene la pagina, e la
 * differenza con lo stato dell'arbitro e' piccola: il terreno ha la
 * posizione in millimetri e la misura in pollici, il tavolo ha la sua
 * larghezza e il suo corridoio, e il registro ha le sue righe.
 *
 * Una partita simulata porta `meta.simulata`: il palmarès delle liste
 * non la conta. Due modelli che si affrontano non dicono niente su
 * come va una lista in mano a te.
 */

import fs from 'node:fs';

/* lo stato del tavolo e il registro passo per passo stanno in
   `src/archivio.js`, perche' li usa anche la sfida dell'app */
export { statoDi, registro } from '../src/archivio.js';

/* In testa al diario, come fa l'app con una partita appena archiviata.
   Il file resta indentato come lo scrive la Nuvola, cosi' il diff del
   commit si legge. */
export function aggiungi(file, rep){
  const tutte = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
  if (!Array.isArray(tutte)) throw new Error(`${file} non è un elenco di partite`);
  tutte.unshift(rep);
  fs.writeFileSync(file, JSON.stringify(tutte, null, 2) + String.fromCharCode(10));
  return tutte.length;
}
