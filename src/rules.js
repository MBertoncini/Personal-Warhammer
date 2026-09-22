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
 * 2023, p. 148 e Quick Reference p. 348) e non piu' la vecchia regola
 * «pari a 4, piu' abile a 3, contro il doppio a 5».
 *
 * Le pagine sono quelle stampate, lette sul libro: la tabella per
 * colpire in mischia sta a p. 148 e quella per ferire a p. 149 (e a
 * p. 140 nel tiro). Questo file citava 149 e 150, una pagina avanti.
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

/* Il tiro della carica, ed e' la terza tabella che l'app aveva presa
   dal Warhammer di prima. In *The Old World* (p. 121) la carica non e'
   la somma di due dadi: si tirano due D6, si SCARTA il minore, e il
   dado che resta — uno solo, da 1 a 6 — si somma al Movimento. La
   portata massima di carica e' quindi M + 6, non M + 12, e la media e'
   M + 4,47, non M + 7.
   Lo scarto e' enorme e va in tutte e due le direzioni: l'app
   prometteva cariche da dodici pollici che il manuale non concede, e
   scriveva «carica media M + 7» sotto un'unita' che in media arriva a
   due pollici e mezzo di meno.

   Il passo lungo (Swiftstride, p. 178) non tira tre dadi tenendone
   due: aggiunge +D6 al risultato del tiro di carica — e dello stesso
   tiro di fuga e di inseguimento — e alza di 3″ la portata massima.

   Il terreno rovescia la regola invece di cambiarla (p. 128): chi
   attraversa terreno difficile o pericoloso, o scavalca un ostacolo
   basso, scarta il dado MIGLIORE e tiene il peggiore, e per giunta ha
   −1 al Movimento. */
export function chargeResult(dice, { swift = false, worst = false } = {}){
  const pair = [dice[0] || 0, dice[1] || 0];
  const kept = worst ? Math.min(...pair) : Math.max(...pair);
  const dropped = worst ? Math.max(...pair) : Math.min(...pair);
  const bonus = swift && dice[2] ? dice[2] : 0;
  return {
    dice: [...dice], kept: bonus ? [kept, bonus] : [kept], dropped,
    total: kept + bonus, swift, worst,
    why: (worst ? "tengo il peggiore (terreno)" : "tengo il migliore") +
         (bonus ? " · +" + bonus + " passo lungo" : ""),
  };
}

/* Quanti dadi chiedere e come leggerli: due sempre, piu' uno per il
   passo lungo. E' la forma che il motore passa al vassoio. */
export const chargeDice = (swift = false) => (swift ? 3 : 2);

export function chargeRoll(swift = false, worst = false){
  return chargeResult(roll(chargeDice(swift)), { swift, worst });
}

/* Le medie, per chi disegna i cerchi. Il massimo e' quello che serve
   a dire se una carica si puo' dichiarare (p. 119): oltre M + max non
   si dichiara nemmeno. */
export const CHARGE = {
  normal: { avg: 4.47, max: 6 },   // media del maggiore di 2D6: 161/36
  swift:  { avg: 7.97, max: 9 },   // piu' un D6, e +3″ di portata massima
};

/* ============================================================
   2 · QUANTO SERVE PER RIUSCIRE
   Tutte queste funzioni tornano il numero da fare o piu';
   7 vuol dire "non c'e' numero che basti".
   ============================================================ */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const IMPOSSIBLE = 7;

/* Le pagine delle tabelle, in un posto solo: le citano il conto, il
   pannello dello scontro e la scheda delle tabelle. */
export const CHART_PAGE = { melee: 148, wound: 149, woundShoot: 140, shoot: 138, sevenPlus: 139, zero: 97, quick: 347 };

/* Corpo a corpo: la tabella del manuale, riga = Abilita' Combattimento
   di chi mena, colonna = quella di chi para (p. 148).

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

   Chi ha AC 0 non sa difendersi e viene colpito senza tirare (p. 97):
   torna AUTOHIT, che non e' un punteggio da fare ma il segnale che il
   dado non si tira proprio. */
export const AUTOHIT = 0;

export const HIT_MELEE = [
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

/* Tiro: la tabella di p. 138 e le due regole che le stanno accanto.
   `mod` e' la somma dei modificatori con il loro segno: -1 mosso, -1
   lunga gittata, -1 tira e tieni, -1 copertura parziale, -2 piena.

     AB 1 2 3 4 5 ............ 6+ 5+ 4+ 3+ 2+
     AB 6 7 8 9 10 ........... 2+, e chi manca ritira a 6+ 5+ 4+ 3+ 2+

   Sopra l'AB 5 non si colpisce meglio: si guadagna un RITIRO dei
   mancati con un secondo punteggio, e i modificatori pesano solo sul
   primo tiro (p. 138). L'app lo metteva uno scalino piu' in alto — AB 6
   senza ritiro, AB 7 a 6+ — e lo dichiarava da verificare.

   E il 7+ non e' «mai» (p. 139): chi dopo i modificatori dovrebbe fare
   7 tira lo stesso, e ogni 6 naturale si ritira e colpisce con un 4+;
   con 8 serve il 5+, con 9 il 6; dal 10 e' impossibile. L'app si
   fermava al 6+, cioe' faceva colpire un AB 2 con −2 due volte di piu'
   di quanto il libro conceda.

   Torna `need` (il primo dado), `then` (il secondo dado dei 6, per il
   7+), `again` (il ritiro dell'AB alta) e `raw`, il punteggio come lo
   si scrive — «7+» — che e' quello che si cerca nella tabella. */
export const BS_TABLE = { 1:6, 2:5, 3:4, 4:3, 5:2 };
export const BS_REROLL = { 6:6, 7:5, 8:4, 9:3, 10:2 };
export const SEVEN_PLUS = { 7:4, 8:5, 9:6 };

export function shootTarget(bs, mod = 0){
  const b = Math.max(0, bs | 0);
  if (!b) return { need: IMPOSSIBLE, then: 0, again: 0, raw: IMPOSSIBLE, base: IMPOSSIBLE, mod };
  const k = clamp(b, 1, 10);
  const base = BS_TABLE[k] || 2;
  const again = BS_REROLL[k] || 0;
  const raw = Math.max(2, base - (+mod || 0));
  if (raw <= 6)  return { need: raw, then: 0, again, raw, base, mod };
  if (raw >= 10) return { need: IMPOSSIBLE, then: 0, again, raw, base, mod };
  return { need: 6, then: SEVEN_PLUS[raw], again, raw, base, mod };
}

/* Il primo dado e basta, per chi vuole un numero solo: il 7+ torna 6,
   che e' la faccia da cui si parte. Il resto lo sa `shootTarget`. */
export function hitShoot(bs, mod = 0){
  return shootTarget(bs, mod).need;
}

/* La probabilita' di un colpo al tiro, 7+ e ritiro compresi */
export function shootChance(t){
  if (!t) return 0;
  const first = t.need >= IMPOSSIBLE ? 0 : t.then ? (1 / 6) * chance(t.then) : chance(t.need);
  return t.again ? first + (1 - first) * chance(t.again) : first;
}

/* Come si dice un punteggio del tiro: «4+», «6 e poi 4+», «mai» */
export function shootLabel(t){
  if (!t || t.need >= IMPOSSIBLE) return t && t.again ? `mai, ritiro a ${t.again}+` : "mai";
  const first = t.then ? `6 e poi ${t.then}+` : `${t.need}+`;
  return t.again ? `${first}, ritiro a ${t.again}+` : first;
}

/* Ferire: qui la tabella (p. 149, e p. 140 nel tiro) e' davvero un conto, perche' dipende
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
/* Ranghi (pp. 101 e 151): +1 per ogni fila dietro la prima, fino al
   massimo del tipo di truppa. Una fila conta se ha almeno i modelli
   che il tipo chiede (`perRank`: cinque per la fanteria regolare,
   quattro per la pesante, tre per la mostruosa), e l'ultima fila conta
   anche incompleta, purche' ne abbia abbastanza.

   La versione di prima era quella del Warhammer di prima: «file larghe
   almeno tre, fino a tre ranghi», per tutti. E dimenticava la colonna
   di marcia: un'unita' piu' profonda che larga non prende il bonus di
   ranghi (p. 101). */
export function rankBonus(models, frontage, max = 2, perRank = 5){
  if (!perRank || !frontage || frontage < perRank || !max) return 0;
  const full = Math.floor(models / frontage);
  const rest = models - full * frontage;
  const ranks = full + (rest >= perRank ? 1 : 0);
  if (Math.ceil(models / frontage) > frontage) return 0;     // colonna di marcia
  return clamp(ranks - 1, 0, max);
}

/* Test di Comando: due dadi, si passa uguagliando o stando sotto.
   Il doppio uno passa sempre, per quanto disperata sia la situazione. */
export function leadershipTest(ld, penalty = 0){
  const dice = roll(2);
  const total = dice[0] + dice[1];
  const target = Math.max(2, (ld || 0) - Math.max(0, penalty));
  return { dice, total, target, passed: total <= target || total === 2, insane: total === 2 };
}

/* Quanto si fugge, e quanto insegue chi ha vinto: 2D6 pieni, sommati
   (pp. 132 e 156). Non e' il tiro di carica — quello tiene un dado
   solo — e appoggiarlo li' era un errore che si vedeva solo quando la
   carica e' stata corretta: due dadi di fuga diventavano il maggiore
   dei due, cioe' meta' della distanza.

   Il modificatore c'e' perche' esiste chi corre meglio: la Fuga
   Precipitosa degli Skaven da' +1, e senza questo argomento la regola
   non si poteva nemmeno scrivere. Chi ha il passo lungo aggiunge un
   D6 intero (p. 178), e per quello c'e' `tiroDiFuga` in `arbitro.js`.
   Non si scende sotto 2, che e' il minimo di due dadi. */
export const fleeRoll = (mod = 0) => {
  const dice = roll(2);
  const m = +mod || 0;
  return { dice, mod: m, total: Math.max(2, dice[0] + dice[1] + m) };
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
