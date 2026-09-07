/* Schieramento Old World — i conti che si fanno con i dadi in mano
 *
 * Solo aritmetica e sei facce: niente DOM, niente stato, niente
 * unita' del tavolo. Entrano due o tre numeri di profilo, esce il
 * punteggio che serve e — quando si tira davvero — l'elenco dei dadi
 * usciti, perche' un simulatore che dice solo "4 ferite" non si sa se
 * crederlo, mentre uno che mostra i dadi lo si controlla a occhio.
 *
 * Le relazioni sono quelle classiche del sistema, scritte come conti
 * (uno scarto fra due caratteristiche, un numero da eguagliare o
 * superare) e non copiate da nessuna tabella stampata.
 */

/* ============================================================
   1 · DADI
   ============================================================ */
export const d6 = () => 1 + Math.floor(Math.random() * 6);
export const roll = n => Array.from({ length: Math.max(0, n | 0) }, d6);

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

/* Corpo a corpo: pari abilita' si va a 4, chi e' piu' abile va a 3,
   chi ha davanti il doppio della propria abilita' va a 5. */
export function hitMelee(wsA, wsD){
  if (!wsA) return IMPOSSIBLE;
  if (!wsD) return 4;
  if (wsD >= wsA * 2) return 5;
  if (wsA > wsD) return 3;
  return 4;
}

/* Tiro: il punteggio base scende con l'abilita' balistica, poi i
   modificatori lo alzano. `mod` e' la somma dei modificatori con il
   loro segno: -1 lunga gittata, -1 mosso, -1 copertura leggera… */
export function hitShoot(bs, mod = 0){
  if (!bs) return IMPOSSIBLE;
  return clamp(Math.max(2, 7 - bs) - mod, 2, 6);
}

/* Ferire: quattro piu' lo scarto fra Resistenza e Forza. Due punti di
   Forza in piu' non fanno meglio del 2, quattro di Resistenza in piu'
   e non si passa affatto. */
export function woundOn(s, t){
  if (!s || !t) return IMPOSSIBLE;
  const d = t - s;                       // da -1 (Forza un punto sopra) a +3
  if (d <= -2) return 2;
  if (d >= 4) return IMPOSSIBLE;
  return [3, 4, 5, 6, 6][d + 1];
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
/* n dadi contro un punteggio: torna i dadi usciti e quanti sono
   passati. L'1 non passa mai, nemmeno quando servirebbe 1. */
export function pool(n, need){
  const dice = roll(n);
  const hits = need >= IMPOSSIBLE ? 0 : dice.filter(v => v >= need && v > 1).length;
  return { dice, hits, need, of: dice.length };
}
/* quanti ne passerebbero in media */
export const expected = (n, need) => n * chance(need);

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

/* Quanto si fugge, e quanto insegue chi ha vinto */
export const fleeRoll = () => { const r = chargeRoll(false); return { dice: r.dice, total: r.total }; };

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
  if (/^[+-]/.test(raw)) return Math.max(0, userS + stat(raw));
  const n = stat(raw);
  return n || userS;
}
export const weaponAP = w => Math.abs(stat(w && w.ap));
