/* Schieramento Old World — il palmarès delle liste
 *
 * La domanda che nessuna scheda sapeva rispondere: **questa lista come
 * va?**. Le partite sono archiviate da sempre, con le due liste, il
 * punteggio e l'esito; ma stanno in un'altra scheda, e per sapere se i
 * tuoi Skaven hanno mai vinto bisognava aprirle una per una.
 *
 * Qui le partite diventano un record per lista: giocate, vinte, perse,
 * pareggiate, e i punti fatti contro quelli presi. Da lì il filtro
 * «tutte quelle che hanno vinto» smette di essere un desiderio.
 *
 * **Come si aggancia una lista a una partita.** Il report si porta
 * dietro il nome dei due eserciti, non l'identificativo delle liste:
 * è nato per essere letto, e un id non lo legge nessuno. Quindi
 * l'aggancio è per nome, normalizzato.
 *
 * Una lista rinominata si porta dietro i nomi che ha avuto
 * (`formerNames`), se chi la rinomina lo vuole: correggere un refuso o
 * dare un nome migliore non cambia la lista, e perdere tre partite per
 * una lettera sarebbe punire chi tiene in ordine l'archivio. Chi invece
 * la rinomina perché adesso è un'altra cosa sceglie di ripartire da
 * zero, e le partite restano nel diario col nome di allora.
 *
 * Il modulo legge l'archivio delle partite dalla sua chiave e non
 * importa `reports.js`: quello importa `lists.js`, e un giro di import
 * fra i tre sarebbe il genere di nodo che si scioglie una volta sola e
 * poi torna.
 */

import { loadDoc } from './store.js';
import { on, emit } from './bus.js';

/* la stessa chiave che scrive reports.js: sta scritta in due posti
   perché l'alternativa è un giro di import fra tre moduli */
const REP_KEY = "reports:all";

let reports = [];
let ready = false;

export async function initPalmares(){
  reports = await loadDoc(REP_KEY, []) || [];
  ready = true;
  /* le partite cambiano nella loro scheda: qui ci si riallinea da soli,
     altrimenti il palmarès resta quello di quando si è aperta l'app */
  on("reports:changed", async () => {
    reports = await loadDoc(REP_KEY, []) || [];
    emit("palmares:changed");
  });
  return reports.length;
}

export const palmaresReady = () => ready;

/* ------------------------------------------------------------------
   Il nome, ridotto a quello che conta.
   «Skaven — Il Guado di Sangue» e «skaven - il guado di sangue» sono
   la stessa lista scritta da due umori diversi.
   ------------------------------------------------------------------ */
export const normName = s => String(s || "")
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const EMPTY = () => ({ played: 0, won: 0, lost: 0, draw: 0, pts: 0, against: 0, last: null, games: [] });

/* ------------------------------------------------------------------
   Il record di una lista.
   `rep.meta.mine` non c'entra: qui la domanda è «come è andata questa
   lista», non «come sono andato io». Una lista che ho prestato a un
   amico che ha vinto ha vinto.
   ------------------------------------------------------------------ */
/* `name` è un nome, o l'elenco dei nomi che la lista ha avuto: quello
   di adesso e quelli di prima. */
export function recordOf(name, list = reports){
  const keys = new Set([].concat(name || []).map(normName).filter(Boolean));
  const out = EMPTY();
  if (!keys.size) return out;
  for (const rep of list || []){
    if (!rep || !rep.armies) continue;
    /* una partita giocata da due modelli (`tools/partita.mjs
       --archivia`) sta nel diario ma non dice come va la lista */
    if (rep.meta && rep.meta.simulata) continue;
    for (const side of ["A", "B"]){
      if (!keys.has(normName((rep.armies[side] || {}).name))) continue;
      const foe = side === "A" ? "B" : "A";
      const sc = scoreOf(rep);
      const mine = sc[side], theirs = sc[foe];
      out.played++;
      out.pts += mine;
      out.against += theirs;
      const how = mine > theirs ? "won" : mine < theirs ? "lost" : "draw";
      out[how]++;
      const when = (rep.meta && rep.meta.date) || "";
      if (!out.last || when > out.last) out.last = when;
      out.games.push({
        id: rep.id, title: rep.title, date: when, side, how,
        mine, theirs, foe: (rep.armies[foe] || {}).name || "",
        turns: (rep.turns || []).filter(t => t.kind === "turn").length,
      });
    }
  }
  out.games.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return out;
}

/* Il punteggio di un report, senza rifare i conti della vittoria: le
   voci sommate sono quelle che il giocatore vede nella scheda. */
function scoreOf(rep){
  const rows = (rep.score && rep.score.rows) || [];
  return {
    A: rows.reduce((s, r) => s + (+r.A || 0), 0),
    B: rows.reduce((s, r) => s + (+r.B || 0), 0),
  };
}

/* I nomi di una lista: quello di adesso e quelli che si è portata dietro
   rinominandola. */
export const namesOf = l => [l && l.name, ...((l && l.formerNames) || [])].filter(Boolean);

/* Il record di tutte le liste passate, in una mappa per id: è quello
   che serve a disegnare l'elenco senza rifare il giro per ognuna. */
export function recordsFor(lists = []){
  const map = new Map();
  for (const l of lists || []) map.set(l.id, recordOf(namesOf(l)));
  return map;
}

/* La riga che si legge sulla scheda: «3 giocate · 2 vinte». Vuota
   quando non c'è niente da dire, perché «0 giocate» è rumore. */
export function recordText(r){
  if (!r || !r.played) return "";
  const bits = [`${r.played} giocat${r.played === 1 ? "a" : "e"}`];
  if (r.won) bits.push(`${r.won} vint${r.won === 1 ? "a" : "e"}`);
  if (r.draw) bits.push(`${r.draw} pari`);
  if (r.lost) bits.push(`${r.lost} pers${r.lost === 1 ? "a" : "e"}`);
  return bits.join(" · ");
}

/* per le prove, e per chi vuole il palmarès di un archivio suo */
export const usePalmares = list => { reports = list || []; ready = true; return reports; };
export const allGames = () => reports.slice();
