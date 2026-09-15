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
 * Una nota che vale per tutte e due le tabelle. Fino alla Tappa 7 gli
 * esiti stavano nell'ordine in cui il piano li elencava, dichiarato da
 * verificare, perche' il libro in casa non c'era. Letto il libro — che
 * e' fatto di immagini, e si legge con gli occhi — il Terreno Selvaggio
 * era nell'ordine giusto e diceva poco; il Caso della Guerra aveva la
 * faccia 2 e la faccia 3 scambiate, e al posto di ritirare un esito
 * gia' uscito prendeva il primo rimasto. Adesso le righe dicono quello
 * che il libro dice, in breve, e le pagine sono quelle stampate.
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
  ordineDaVerificare: false,
  rows: [
    { id:"roveto",     label:"Roveto",
      what:"terreno difficile; chi ci marcia, carica, fugge o insegue attraverso lo tratta come pericoloso" },
    { id:"difendibile", label:"Posizione difendibile",
      what:"chi lo occupa difende un ostacolo basso, e chi carica un'unità che lo occupa arriva disordinato" },
    { id:"spore",      label:"Spore tossiche",
      what:"ogni modello che finisce il movimento del tutto dentro fa un test di Resistenza, e se lo fallisce perde una Ferita" },
    { id:"magia",      label:"Magia residua",
      what:"le unità dentro hanno Magic Resistance (-1)" },
    { id:"erbe",       label:"Erbe curative",
      what:"subito, e a ogni inizio turno, un modello dentro che non combatte, non fugge e non è stupido recupera una Ferita" },
    { id:"troll",      label:"La tana del Troll",
      what:"un Troll Infuriato (p. 40) carica il fronte di chi l'ha scoperto con Iniziativa 10, e si combatte subito un round" },
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
  ordineDaVerificare: false,
  fromTurn: 2,
  rows: [
    { id:"ventiInstabili", label:"Venti di magia instabili",
      what:"nel tiro di lancio un doppio 1, 2 o 3 naturale è un fiasco, e un doppio 4, 5 o 6 un'invocazione perfetta" },
    { id:"carro",          label:"Un carro bagagli perso",
      what:"una deviazione dal centro del tavolo fino al bordo dice dove arriva; chi vince lo spareggio lo difende, l'altro lo attacca (p. 36)" },
    { id:"munizioni",      label:"Le munizioni si diradano",
      what:"chi ha armi da tiro le usa solo un turno sì e uno no" },
    { id:"tesori",         label:"I tesori dell'entroterra",
      what:"per questa battaglia un tesoro vale 20 punti vittoria e un landmark 50" },
    { id:"seiRound",       label:"Conflitto prolungato",
      what:"la partita dura sei round invece di cinque" },
    { id:"mercenari",      label:"Mercenari erranti",
      what:"chi vince lo spareggio prende dieci Wandering Mercenaries, che entrano come rinforzi da un bordo fuori dalle zone e valgono 50 punti; col pari li prendono tutti e due" },
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
  /* un esito gia' uscito si ritira (p. 41): non si prende il primo
     rimasto, che darebbe ai primi della tabella piu' probabilita' */
  let row = FORTUNES.rows[d6() - 1];
  while (already.includes(row.id)) row = FORTUNES.rows[d6() - 1];
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
