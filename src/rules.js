/* Schieramento Old World — i conti che si fanno con i dadi in mano
 *
 * Solo aritmetica e sei facce: niente DOM, niente stato, niente
 * unita' del tavolo. Entrano due o tre numeri di profilo, esce il
 * punteggio che serve e — quando si tira davvero — l'elenco dei dadi
 * usciti, perche' un simulatore che dice solo "4 ferite" non si sa se
 * crederlo, mentre uno che mostra i dadi lo si controlla a occhio.
 *
 * Dove la relazione e' davvero un conto — lo scarto fra Forza e
 * Resistenza, l'armatura che peggiora con la perforazione — sta scritta
 * come conto. Dove il manuale stampa una tabella che nessuna formula
 * riproduce, sta la tabella: e' il caso del tiro per colpire in
 * mischia, che in The Old World e' una griglia 10 × 10 (Core Rulebook
 * 2023, p. 149 e Quick Reference p. 348) e non piu' la vecchia regola
 * «pari a 4, piu' abile a 3, contro il doppio a 5».
 */

/* ============================================================
   1 · DADI
   Le facce arrivano da dice.js, che le pesca dal generatore del
   browser invece che da Math.random: e' lo stesso caso che tira nel
   vassoio in tre dimensioni, e un simulatore che tira quattrocento
   dadi a partita merita un generatore su cui si possano fare le
   statistiche.
   ============================================================ */
export { d6, d3, roll } from './dice.js';
import { roll } from './dice.js';

/* Il tiro della carica: due dadi, tre scartando il peggiore per chi ha
   il passo lungo. Le medie non sono 7 e 7: la seconda vale mezzo pollice
   in piu', e mezzo pollice al tavolo e' una carica che arriva. */
export function chargeRoll(swift = false){
  const dice = roll(swift ? 3 : 2);
  const kept = [...dice].sort((a, b) => b - a).slice(0, 2);
  return { dice, kept, total: kept[0] + kept[1] };
}
export const CHARGE = {
  normal: { avg: 7,   max: 12 },
  swift:  { avg: 8.5, max: 12 },   // 3D6 scartando il minore: 8,458…
};

/* ============================================================
   2 · QUANTO SERVE PER RIUSCIRE
   Tutte queste funzioni tornano il numero da fare o piu';
   7 vuol dire "non c'e' numero che basti".
   ============================================================ */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const IMPOSSIBLE = 7;

/* Corpo a corpo: la tabella del manuale, riga = Abilita' Combattimento
   di chi mena, colonna = quella di chi para (p. 149).

   Non e' la vecchia regola a tre valori: qui il 2+ esiste, e serve
   essere piu' del doppio dell'avversario per averlo. La griglia
   scritta per esteso e' quella stampata, e si controlla riga per riga
   con il manuale aperto; la forma che le sta sotto e' semplice, e
   vale la pena saperla per leggerla a colpo d'occhio:

     piu' del doppio dell'avversario ...... 2+
     piu' abile, ma non il doppio ......... 3+
     pari abilita', o meno abile ma non
       meno della meta' dell'avversario ... 4+
     meno della meta' dell'avversario ..... 5+

   Chi ha AC 0 non sa difendersi e viene colpito senza tirare (p. 98):
   torna AUTOHIT, che non e' un punteggio da fare ma il segnale che il
   dado non si tira proprio. */
export const AUTOHIT = 0;

const HIT_MELEE = [
  /*  AC avversario  1   2   3   4   5   6   7   8   9  10 */
  /*  1 */          [ 4,  4,  5,  5,  5,  5,  5,  5,  5,  5 ],
  /*  2 */          [ 3,  4,  4,  4,  5,  5,  5,  5,  5,  5 ],
  /*  3 */          [ 2,  3,  4,  4,  4,  4,  5,  5,  5,  5 ],
  /*  4 */          [ 2,  3,  3,  4,  4,  4,  4,  4,  5,  5 ],
  /*  5 */          [ 2,  2,  3,  3,  4,  4,  4,  4,  4,  4 ],
  /*  6 */          [ 2,  2,  3,  3,  3,  4,  4,  4,  4,  4 ],
  /*  7 */          [ 2,  2,  2,  3,  3,  3,  4,  4,  4,  4 ],
  /*  8 */          [ 2,  2,  2,  3,  3,  3,  3,  4,  4,  4 ],
  /*  9 */          [ 2,  2,  2,  2,  3,  3,  3,  3,  4,  4 ],
  /* 10 */          [ 2,  2,  2,  2,  3,  3,  3,  3,  3,  4 ],
];

export function hitMelee(wsA, wsD){
  if (!wsA) return IMPOSSIBLE;
  if (!wsD) return AUTOHIT;
  /* sopra il 10 il manuale non stampa piu' niente: si legge l'ultima
     riga o l'ultima colonna, che e' quello che si fa al tavolo */
  return HIT_MELEE[clamp(wsA, 1, 10) - 1][clamp(wsD, 1, 10) - 1];
}

/* Tiro: il punteggio base scende con l'abilita' balistica, poi i
   modificatori lo alzano. `mod` e' la somma dei modificatori con il
   loro segno: -1 lunga gittata, -1 mosso, -1 copertura leggera… */
export function hitShoot(bs, mod = 0){
  if (!bs) return IMPOSSIBLE;
  return clamp(Math.max(2, 7 - bs) - mod, 2, 6);
}

/* Ferire: qui la tabella (p. 150) e' davvero un conto, perche' dipende
   solo dallo scarto fra Resistenza e Forza. Due punti di Forza in piu'
   non fanno meglio del 2; dal secondo punto di Resistenza in piu' si
   resta al 6, e ci si resta a lungo — una Forza 3 ferisce ancora una
   Resistenza 8 — finche' lo scarto arriva a sei e non si passa piu'. */
export function woundOn(s, t){
  if (!s || !t) return IMPOSSIBLE;
  const d = t - s;                       // da -1 (Forza un punto sopra) a +5
  if (d <= -2) return 2;
  if (d >= 6) return IMPOSSIBLE;
  return [3, 4, 5, 6, 6, 6, 6][d + 1];
}

/* Armatura: il valore peggiora di quanto perfora l'arma. Sopra il 6
   non salva piu' niente. */
export function saveOn(base, ap = 0){
  if (!base) return IMPOSSIBLE;
  const n = base + Math.abs(ap || 0);
  return n > 6 ? IMPOSSIBLE : Math.max(2, n);
}

/* la probabilita' di un singolo dado: serve alle stime senza tirare */
export const chance = need => need >= IMPOSSIBLE ? 0 : need <= 1 ? 1 : (7 - need) / 6;

/* ============================================================
   3 · TIRARE UN PUGNO DI DADI
   ============================================================ */
/* Un dado passa quando fa il punteggio, e l'1 non passa mai —
   nemmeno quando servirebbe 1. */
const passes = (v, need) => v >= need && v > 1;

/* n dadi contro un punteggio: torna i dadi usciti e quanti sono
   passati. Con AUTOHIT non si tira: passano tutti e l'elenco dei dadi
   resta vuoto, che e' il modo onesto di dire «qui non c'era niente da
   tirare».

   `again` e' il ritiro (p. 93). Un dado ritirato tiene il risultato
   nuovo anche se e' peggiore, e non si ritira una seconda volta: la
   regola vale per tutti i ritiri che esistono, dalla Choppa degli
   Orchi al Waaagh!, dall'Abilita' Balistica 6 e oltre a un terzo degli
   oggetti magici di ogni army book. Vale la pena averla in un posto
   solo. Le forme che si usano davvero:

     "ones"    ritira gli 1 naturali        — Choppa, Waaagh!, Odio
     "misses"  ritira tutto quello che ha mancato
     una funzione (faccia, passato) => bool, per i casi strani.

   Quello che torna dice anche cosa e' stato ritirato: `first` sono le
   facce del primo tiro, `dice` quelle che valgono, `rerolled` quante
   ne sono state rifatte. Senza, il pannello mostrerebbe dadi che non
   sono quelli che si sono visti cadere. */
function rerollTest(again){
  if (!again) return null;
  if (typeof again === "function") return again;
  if (/^ones?$/i.test(again))   return v => v === 1;
  if (/^miss(es)?$/i.test(again)) return (v, ok) => !ok;
  if (/^all$/i.test(again))     return () => true;
  return null;
}

export function pool(n, need, again = null){
  if (need <= AUTOHIT) return { dice: [], hits: Math.max(0, n), need, of: Math.max(0, n), first: [], rerolled: 0 };
  const first = roll(n);
  const dead = need >= IMPOSSIBLE;
  const test = rerollTest(again);
  let dice = first, rerolled = 0;
  if (test){
    dice = first.slice();
    const idx = [];
    for (let i = 0; i < dice.length; i++)
      if (test(dice[i], !dead && passes(dice[i], need))) idx.push(i);
    if (idx.length){
      const fresh = roll(idx.length);
      idx.forEach((k, j) => { dice[k] = fresh[j]; });
      rerolled = idx.length;
    }
  }
  const hits = dead ? 0 : dice.filter(v => passes(v, need)).length;
  return { dice, hits, need, of: dice.length, first, rerolled };
}

/* quanti ne passerebbero in media. Con il ritiro degli 1 si aggiunge
   un sesto dei dadi ritirato daccapo; con il ritiro dei falliti, tutta
   la parte fallita. Serve alle stime, che non tirano. */
export function expected(n, need, again = null){
  const p = chance(need);
  if (!again || need <= AUTOHIT || need >= IMPOSSIBLE) return n * p;
  if (/^ones?$/i.test(again))     return n * (p + p / 6);
  if (/^miss(es)?$/i.test(again)) return n * (p + (1 - p) * p);
  if (/^all$/i.test(again))       return n * p;
  return n * p;
}

/* ============================================================
   4 · RISOLUZIONE DEL COMBATTIMENTO
   ============================================================ */
/* Ranghi: uno ogni fila piena dietro la prima, fino a tre, e solo se
   la fila e' larga almeno tre. */
export function rankBonus(models, frontage, max = 3){
  if (!frontage || frontage < 3) return 0;
  return clamp(Math.floor(models / frontage) - 1, 0, max);
}

/* Test di Comando: due dadi, si passa uguagliando o stando sotto.
   Il doppio uno passa sempre, per quanto disperata sia la situazione. */
export function leadershipTest(ld, penalty = 0){
  const dice = roll(2);
  const total = dice[0] + dice[1];
  const target = Math.max(2, (ld || 0) - Math.max(0, penalty));
  return { dice, total, target, passed: total <= target || total === 2, insane: total === 2 };
}

/* Quanto si fugge, e quanto insegue chi ha vinto. Il modificatore c'e'
   perche' esiste chi corre meglio: la Fuga Precipitosa degli Skaven
   da' +1, e senza questo argomento la regola non si poteva nemmeno
   scrivere. Non si scende sotto 2, che e' il minimo di due dadi. */
export const fleeRoll = (mod = 0) => {
  const r = chargeRoll(false);
  return { dice: r.dice, mod: +mod || 0, total: Math.max(2, r.total + (+mod || 0)) };
};

/* ============================================================
   5 · LETTURA DEI PROFILI
   New Recruit scrive le caratteristiche come testo: "4", "-", "*",
   "As user", "+1". Qui si tira fuori il numero quando c'e' e si dice
   onestamente di no quando non c'e'.
   ============================================================ */
export function stat(v){
  const m = String(v ?? "").match(/-?\d+/);
  return m ? +m[0] : 0;
}
/* La Forza di un'arma puo' essere assoluta ("5"), relativa ("+1") o
   quella di chi la impugna ("As user", "-"). */
export function weaponStrength(w, userS){
  const raw = String(w && w.S != null ? w.S : "").trim();
  if (!raw || /^-$/.test(raw) || /user/i.test(raw)) return userS;
  /* "S", "S+1", "S+2": la S sta per la Forza di chi impugna, ed e' la
     forma che usano i cataloghi di New Recruit. Letta come numero dava
     Forza 1 a una lancia da cavalleria e Forza 2 a un'arma pesante:
     tutto il resto del conto veniva dietro sbagliato. */
  const rel = /^s\s*([+-]\s*\d+)?$/i.exec(raw);
  if (rel) return Math.max(0, userS + (rel[1] ? stat(rel[1]) : 0));
  if (/^[+-]/.test(raw)) return Math.max(0, userS + stat(raw));
  const n = stat(raw);
  return n || userS;
}
export const weaponAP = w => Math.abs(stat(w && w.ap));
