/* Schieramento Old World — tutte le liste che si possono scrivere
 *
 * Il modulo vero sta in src/spazio.js, perché il Laboratorio cerca le
 * liste anche dalla pagina. Qui si leggono la collezione
 * (dati/catalogo.json, com'era all'ultimo Archivio) e la tabella dei
 * maghi, e si espone tutto come prima.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './unita.mjs';
import { usaDatiSpazio } from '../../src/spazio.js';

const qui = path.dirname(fileURLToPath(import.meta.url));
const dati = f => JSON.parse(fs.readFileSync(path.join(qui, '..', '..', 'dati', f), 'utf8'));
usaDatiSpazio({ catalogo: dati('catalogo.json'), magia: dati(path.join('magia', 'domini.json')) });

export * from '../../src/spazio.js';
