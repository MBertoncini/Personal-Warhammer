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
import { MM } from '../src/util.js';
import * as BL from '../src/battlelog.js';
import { TERRAIN } from '../src/terrain.js';

/* lo stato del tavolo come lo tiene la pagina, preso dall'arbitro.
   Lo usa anche `archivia-registro.mjs`, che di partita ha solo il
   registro scritto: la forma dello stato e' la stessa. */
export function statoDi(S, { liste, gioco }){
  const sc = S.sc || {};
  const idx = { A: 0, B: 0 };
  return {
    scenario: S.scenario,
    tableW: S.table.w, tableH: S.table.h, gap: (sc.gap || 6) * MM,
    armies: {
      A: { name: liste.A.name, info: liste.A.info || null },
      B: { name: liste.B.name, info: liste.B.info || null },
    },
    /* copie: `battlelog.js` completa la formazione sull'unita' che
       riceve, e l'arbitro non deve accorgersene */
    units: S.units.map(u => ({ ...u, idx: ++idx[u.army] })),
    terrain: (sc.terrain || []).map((t, i) => ({
      tid: i + 1, kind: t.kind,
      x: t.x * MM, y: t.y * MM,
      w: t.w ?? (TERRAIN[t.kind] || {}).w, h: t.h ?? (TERRAIN[t.kind] || {}).h,
      rot: t.rot || 0,
    })),
    markers: [], zones: [],
    game: gioco,
  };
}

/* Il registro della partita: si chiama dopo ogni passo, e fotografa il
   tavolo quando lo schieramento finisce e quando un mezzo turno passa
   la mano. */
export function registro(S, { liste, meta = {}, notes = "" }){
  const gioco = { meta: BL.ensureMeta(meta), turns: [], score: null, notes, log: [], counters: {} };
  let prima = { schierando: S.schierando, turno: S.turno, army: S.army };
  let eventi = [];
  let chiuso = false;
  const scatta = (n, army) => {
    gioco.turns.push(BL.turnRecord(statoDi(S, { liste, gioco }), { n, army, events: eventi }));
    eventi = [];
  };
  return {
    /* `righe` sono quelle del registro dell'arbitro uscite in questo
       passo; `perche` e' la frase di chi ha scelto, se c'e' */
    passo({ chi = "", perche = "", righe = [] }){
      if (perche) eventi.push(`${chi}: ${perche}`);
      for (const r of righe){
        eventi.push(r.text + (r.page ? ` (p. ${r.page})` : ""));
        gioco.log.unshift({ t: r.turno, army: r.army, phase: r.casella || "", step: r.casella || "",
                            type: r.kind || "note", text: r.text, at: Date.now() });
      }
      if (prima.schierando && !S.schierando){
        gioco.turns.push(BL.deployRecord(statoDi(S, { liste, gioco })));
        gioco.turns[0].events = eventi;
        eventi = [];
      } else if (!prima.schierando && !chiuso &&
                 (S.finita || S.turno !== prima.turno || S.army !== prima.army)){
        /* la partita che finisce sul passaggio di mano ha gia' il turno
           dopo scritto nello stato: la fotografia e' di quello che si
           e' appena chiuso */
        scatta(prima.turno, prima.army);
        chiuso = S.finita;
      }
      if (!chiuso) prima = { schierando: S.schierando, turno: S.turno, army: S.army };
    },
    /* la fotografia dell'ultimo mezzo turno, e il report */
    chiudi({ title = "" } = {}){
      const ultimo = gioco.turns[gioco.turns.length - 1];
      if (chiuso){
        if (eventi.length && ultimo) ultimo.events.push(...eventi);
      } else if (eventi.length || !ultimo || ultimo.n !== prima.turno || ultimo.army !== prima.army)
        scatta(prima.turno, prima.army);
      gioco.log = gioco.log.slice(0, 300);
      return BL.buildReport(statoDi(S, { liste, gioco }), S.sc, { title });
    },
  };
}

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
