/* Schieramento Old World — le unità scritte a mano, per provare liste
 *
 * Il modulo vero sta in src/costruttori.js: la ricerca delle liste gira
 * anche dalla pagina (il Laboratorio), e il browser carica come moduli
 * solo i .js di src/. Qui si leggono i file che lì passa la pagina — le
 * liste dell'archivio, da cui si copiano i modelli, e le cavalcature —
 * e si espone tutto come prima.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useMounts } from '../../src/mounts.js';
import { usaArchivio } from '../../src/costruttori.js';

const qui = path.dirname(fileURLToPath(import.meta.url));
const dati = f => JSON.parse(fs.readFileSync(path.join(qui, '..', '..', 'dati', f), 'utf8'));
useMounts(dati('cavalcature.json'));
usaArchivio(dati('liste.json'));

export * from '../../src/costruttori.js';
