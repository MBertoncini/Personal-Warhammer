/* Schieramento Old World — la partita da guardare
 *
 * `tools/partita.mjs` racconta una partita a parole. Questo la disegna:
 * prende le fotografie del tavolo passo per passo e ne fa una pagina
 * sola, senza dipendenze e senza rete, che si apre con un doppio clic o
 * si pubblica su GitHub Pages.
 *
 * Perche' una pagina e non un video: una partita si guarda avanti e
 * indietro. Il momento in cui la carica non arriva lo si vuole rivedere
 * tre volte, e accanto ci deve stare la riga che dice perche' — i dadi
 * usciti, la pagina del manuale, e il perche' tattico di chi ha scelto.
 * Una registrazione non lo permette, una barra sotto al tavolo si'.
 *
 * Il file che esce non contiene chiavi, non chiama nessuno e non sa
 * niente di internet: e' la partita gia' giocata, fotogramma per
 * fotogramma. Si puo' mandare a un amico, tenerla nell'archivio o
 * metterla online senza pensarci.
 *
 * Le schede del perche' (`src/spiega.js`) viaggiano dentro la pagina:
 * il sorgente del modulo si copia nello <script>, e la pagina le
 * disegna da sola dalle spiegazioni dei fotogrammi. Mettere nel file
 * l'HTML gia' fatto di ogni scheda costava megabyte, e avrebbe fatto
 * due disegni della stessa scheda da tenere uguali.
 *
 * Quello che la pagina aggiunge al registro, e che il registro da solo
 * non dice:
 *
 *   LE FOTO DELLA COLLEZIONE — ogni basetta con la sua miniatura, da
 *   `dati/foto/<catId>.jpg`, girata con il reggimento ma sempre in
 *   piedi (un reggimento che guarda in basso non mostra le teste
 *   all'ingiu'), e le basette lunghe — cavalieri, carri, macchine —
 *   con la foto distesa per il lungo;
 *
 *   IL TERRENO DISEGNATO — il bosco con gli alberi, la collina con le
 *   curve di livello, le rovine con i muri rotti — e passandoci sopra
 *   che cos'e' e che cosa fa, con le parole di `terrain.js`;
 *
 *   IL MOVIMENTO — i pezzi scivolano da un fotogramma all'altro invece
 *   di saltare, e chi perde modelli lampeggia;
 *
 *   GLI EFFETTI — frecce, proiettili, massi, fulmini, palle di fuoco,
 *   incantesimi e mischie, letti dai campi `x` (la spiegazione) e `fx`
 *   (l'effetto, `segna()` in arbitro.js) delle righe del registro.
 *
 * Tutto il codice della pagina e' la funzione `cliente` qui sotto,
 * copiata cosi' com'e' nello <script>: e' JavaScript vero, che si
 * legge e si controlla come il resto del progetto, e non una stringa.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as RP from '../src/replay.js';

/* Il motore sta in `src/replay.js`, perche' lo usa anche l'app: qui
   restano le due cose che vogliono il disco, le foto della cartella e il
   sorgente delle schede. */
export const { COLORI, coloreTerreno, fotogramma, stessoTavolo, pezziDellaPagina, terrenoDellaPagina, compatta } = RP;

export const paginaHTML = ({ meta, frames }) => RP.paginaHTML({
  meta, frames,
  spiega: fs.readFileSync(new URL('../src/spiega.js', import.meta.url), 'utf8'),
});

/* Le foto della collezione, piccole (256 pixel, qualche KB l'una) e
   dentro la pagina: la pagina non chiama nessuno. Solo quelle dei pezzi
   in partita. */
export function fotoDellaCollezione(catIds, cartella = fileURLToPath(new URL('../dati/foto/', import.meta.url))){
  const out = {};
  for (const id of new Set(catIds)){
    if (!id || !/^[\w-]+$/.test(id)) continue;
    try { out[id] = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(cartella, id + '.jpg')).toString('base64'); }
    catch (_){ /* niente foto: la basetta resta del colore dell'esercito */ }
  }
  return out;
}
