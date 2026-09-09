/* Schieramento Old World — Battle March, le due tabelle e gli obiettivi
 *
 * *Battle March – General's Companion* non e' un supplemento di regole
 * speciali: e' il formato di queste partite, quello di nove liste su
 * dieci fra quelle salvate. Qui dentro stanno i tre pezzi che non
 * dipendono da niente altro e si usano ogni sera:
 *
 *   il TERRENO SELVAGGIO (p. 40) — un D6 tirato sul pezzo di terreno
 *   naturale in cui un'unita' finisce il movimento, per scoprire cos'era;
 *
 *   il CASO DELLA GUERRA (p. 41) — dal secondo turno, chi ha cominciato
 *   tira un D6 all'inizio del proprio turno: se esce pari o meno del
 *   numero del turno, succede qualcosa a tutta la partita;
 *
 *   il CONTROLLO DEGLI OBIETTIVI (p. 25) — il conto di fine turno che
 *   dice chi tiene un tesoro, e che al tavolo si sbaglia sempre perche'
 *   e' fatto di distanze e di Forza d'Unita', cioe' di due cose che si
 *   misurano male a occhio e bene con un'app.
 *
 * Una nota che vale per tutte e due le tabelle, e va detta forte.
 * Il piano (§8.1) elenca i sei esiti di ciascuna, ma non dice quale
 * faccia del dado porta a quale: quello sta nel libro. Qui gli esiti
 * stanno nell'ordine in cui il piano li elenca, e ogni tabella lo
 * dichiara con `ordineDaVerificare`. L'app tira, mostra e annota; chi
 * ha il libro aperto corregge l'ordine cambiando una riga di questo
 * file, e chi non ce l'ha vede scritto che l'abbinamento non e' stato
 * confrontato. E' la regola del §1: mai sbagliare in silenzio.
 */

import { d6 } from './dice.js';
import { isNatural, TERRAIN } from './terrain.js';

/* ============================================================
   1 · TERRENO SELVAGGIO (p. 40)
   Si tira una volta sola per pezzo, la prima volta che un'unita' ci
   finisce il movimento sopra. Da li' in poi quel bosco e' quello che e'
   uscito, per tutta la partita e per tutti e due i giocatori.
   ============================================================ */
export const WILD_TERRAIN = {
  page: 40,
  ordineDaVerificare: true,
  rows: [
    { id:"roveto",     label:"Roveto",
      what:"il pezzo diventa terreno difficile per chi lo attraversa" },
    { id:"difendibile", label:"Posizione difendibile",
      what:"chi lo occupa combatte come dietro un ostacolo" },
    { id:"spore",      label:"Spore tossiche",
      what:"il pezzo diventa terreno pericoloso" },
    { id:"magia",      label:"Magia residua",
      what:"chi lo occupa ha un effetto sulla magia" },
    { id:"erbe",       label:"Erbe curative",
      what:"chi lo occupa recupera qualcosa" },
    { id:"troll",      label:"La tana del Troll",
      what:"esce un Troll Infuriato, con il suo profilo dal libro" },
  ],
};

/* Un pezzo si tira solo se e' naturale e non e' ancora stato scoperto.
   Torna null quando non c'e' niente da tirare, cosi' chi chiama non
   deve conoscere le condizioni. */
export function canRollWild(piece){
  if (!piece || piece.wild) return false;
  if (!TERRAIN[piece.kind]) return false;
  return isNatural(piece);
}

export function rollWildTerrain(piece){
  if (!canRollWild(piece)) return null;
  const face = d6();
  const row = WILD_TERRAIN.rows[face - 1];
  const out = {
    face, ...row,
    page: WILD_TERRAIN.page,
    daVerificare: WILD_TERRAIN.ordineDaVerificare,
    nota: WILD_TERRAIN.ordineDaVerificare
      ? "l'abbinamento fra la faccia e l'esito va confrontato con il libro (p. 40)"
      : "",
  };
  piece.wild = out;
  return out;
}

/* ============================================================
   2 · IL CASO DELLA GUERRA (p. 41)
   Dal secondo turno in poi. Il tiro riesce quando esce pari o meno del
   numero del turno: al secondo turno una volta su tre, al sesto sempre.
   Ogni esito dura fino a fine partita, e non se ne tira due volte lo
   stesso.
   ============================================================ */
export const FORTUNES = {
  page: 41,
  ordineDaVerificare: true,
  fromTurn: 2,
  rows: [
    { id:"ventiInstabili", label:"Venti di magia instabili",
      what:"i venti di magia cambiano per il resto della partita" },
    { id:"munizioni",      label:"Le munizioni si diradano",
      what:"il tiro peggiora per il resto della partita" },
    { id:"carro",          label:"Un carro perso al centro del tavolo",
      what:"entra in gioco un carro bagagli al centro" },
    { id:"tesori",         label:"I tesori valgono di piu'",
      what:"i punti vittoria degli obiettivi salgono" },
    { id:"seiRound",       label:"Partita a sei round",
      what:"la durata della partita e' fissata a sei round" },
    { id:"mercenari",      label:"Mercenari erranti",
      what:"arrivano mercenari sul tavolo" },
  ],
};

/* `already` sono gli id gia' usciti: la stessa cosa non succede due
   volte, e va tenuta nello stato della partita perche' l'annulla la
   deve riportare indietro. */
export function fortunesCheck(turn, already = []){
  const t = +turn || 0;
  if (t < FORTUNES.fromTurn) return { rolled:false, why:"il Caso della Guerra parte dal secondo turno" };
  const face = d6();
  if (face > t) return { rolled:true, face, need:t, happened:false };

  const left = FORTUNES.rows.filter(r => !already.includes(r.id));
  if (!left.length) return { rolled:true, face, need:t, happened:false, why:"sono usciti tutti" };
  const pick = FORTUNES.rows[d6() - 1];
  const row = already.includes(pick.id) ? left[0] : pick;
  return {
    rolled:true, face, need:t, happened:true, ...row,
    page: FORTUNES.page,
    daVerificare: FORTUNES.ordineDaVerificare,
    nota: FORTUNES.ordineDaVerificare
      ? "l'abbinamento fra la faccia e l'esito va confrontato con il libro (p. 41)"
      : "",
  };
}

/* ============================================================
   3 · CONTROLLO DEGLI OBIETTIVI (p. 25)
   A fine turno un obiettivo e' controllato da **una sola** unita' entro
   tre pollici con Forza d'Unita' 5 o piu', che non sta fuggendo e non e'
   stupida. A pari distanza vince la Forza d'Unita' piu' alta; a pari
   forza l'obiettivo e' conteso e non lo tiene nessuno.
   ============================================================ */
export const OBJECTIVE_RANGE = 3;     // pollici
export const OBJECTIVE_US    = 5;     // Forza d'Unita' minima

/* `near` sono le unita' candidate, gia' misurate da chi conosce il
   tavolo: { uid, name, army, us, dist, fleeing, stupid }. Tenere la
   misura fuori da qui e' quello che rende la regola provabile senza
   costruire mezzo tavolo. */
export function objectiveHolder(near = []){
  const able = near.filter(u =>
    u && !u.fleeing && !u.stupid &&
    (+u.us || 0) >= OBJECTIVE_US &&
    (+u.dist || 0) <= OBJECTIVE_RANGE);

  if (!able.length) return { held:false, why:"nessuna unita' in condizione di tenerlo", candidates:[] };

  const sorted = able.slice().sort((a, b) => (a.dist - b.dist) || (b.us - a.us));
  const best = sorted[0];
  const tied = sorted.filter(u =>
    Math.abs(u.dist - best.dist) < 0.05 && Math.abs(u.us - best.us) < 0.05);

  /* «una sola unita'»: se le prime a pari merito sono di due eserciti
     diversi l'obiettivo e' conteso, se sono dello stesso e' comunque
     conteso perche' il libro chiede che ce ne sia una sola. */
  if (tied.length > 1)
    return { held:false, contested:true, why:"a pari distanza e pari Forza d'Unita'", candidates:tied };

  return { held:true, by:best, army:best.army, candidates:sorted };
}

/* Il giro completo: un obiettivo per volta, e la riga da scrivere nel
   diario. `objectives` sono i pezzi con `objective` o i tesori. */
export function objectiveReport(objectives = [], nearOf = () => []){
  return objectives.map(o => {
    const r = objectableHolder(o, nearOf);
    return { tid:o.tid, label:(TERRAIN[o.kind] || {}).label || o.kind, ...r };
  });
}
const objectableHolder = (o, nearOf) => objectiveHolder(nearOf(o));
