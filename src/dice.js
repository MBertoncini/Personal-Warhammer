/* Schieramento Old World — i dadi veri
 *
 * Un solo posto da cui esce il caso, e nessun DOM: entra la richiesta
 * ("tre D6", "un dado di artiglieria e uno di deviazione") ed escono le
 * facce uscite, gia' lette secondo il manuale.
 *
 * Perche' non Math.random. Non e' pignoleria: Math.random non promette
 * niente sulla qualita' della sequenza, e un simulatore che tira
 * quattrocento dadi a partita ci finisce per fare sopra le statistiche.
 * crypto.getRandomValues e' il generatore che il browser usa per le
 * chiavi, e costa lo stesso. Il resto del modulo serve a non rovinarlo:
 * prendere il resto della divisione di un numero a 32 bit per sei
 * favorisce le prime facce di una briciola, e la briciola si toglie
 * buttando via i numeri che cascano nella coda incompleta.
 *
 * I quattro dadi che il manuale nomina (pagina 93):
 *   D6           le sei facce di sempre;
 *   D3           un D6 dimezzato per eccesso — qui e' un cubo segnato
 *                1,2,3,1,2,3, che e' la stessa cosa e si legge meglio;
 *   artiglieria  2, 4, 6, 8, 10 e Mancato Colpo;
 *   deviazione   quattro frecce e due Colpito!, e sopra il Colpito c'e'
 *                la freccetta che serve al lanciapietre.
 *
 * La direzione di una freccia, al tavolo, e' quella in cui il dado si
 * e' fermato: un angolo qualsiasi, non uno di otto. Qui esce lo stesso,
 * un grado fra 0 e 359, ed e' quello con cui il vassoio gira il cubo —
 * cosi' la freccia che si vede e' la freccia che vale.
 */

/* ============================================================
   1 · IL CASO
   ============================================================ */
/* Sostituibile: le prove hanno bisogno di una sequenza decisa, e un
   modulo che non si lascia guidare si prova solo a occhio. */
let source = null;

/* Un intero fra 0 e n-1, senza il pollice sulla bilancia. I valori
   oltre l'ultimo multiplo intero di n vengono buttati e si ripesca. */
function cryptoInt(n){
  const c = globalThis.crypto;
  if (!c || !c.getRandomValues) return Math.floor(Math.random() * n);
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;){
    c.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

export function randomInt(n){
  const k = Math.max(1, n | 0);
  return source ? Math.min(k - 1, Math.max(0, source(k) | 0)) : cryptoInt(k);
}

/* setSource(fn) mette una sorgente propria — fn(n) torna 0..n-1;
   setSource(null) rimette quella del browser. */
export function setSource(fn){ source = typeof fn === "function" ? fn : null; }

/* Il generatore vero c'e'? Serve a dirlo nel vassoio invece di far
   finta: senza crypto si tira lo stesso, ma peggio. */
export const trueRandom = () => !!(globalThis.crypto && globalThis.crypto.getRandomValues);

/* ============================================================
   2 · LE FACCE
   Il cubo ha sei facce e la faccia grezza e' sempre un D6: e' quella
   che il vassoio deve far vedere. Cosa ci sta scritto sopra cambia con
   il dado, e la traduzione sta tutta qui.
   ============================================================ */
export const KINDS = ["d6", "d3", "artillery", "scatter"];

export const KIND_LABEL = {
  d6: "D6", d3: "D3", artillery: "Artiglieria", scatter: "Deviazione",
};

/* Il D3: 1,2,3,1,2,3. Il manuale dice di tirare un D6 e dimezzare per
   eccesso, che da' le stesse tre facce con le stesse probabilita'. */
export const D3_FACES = [1, 2, 3, 1, 2, 3];

/* Il dado di artiglieria: cinque numeri pari e il Mancato Colpo. */
export const ARTILLERY_FACES = [2, 4, 6, 8, 10, null];   // null = Mancato Colpo

/* Il dado di deviazione: quattro frecce e due Colpito!, e i due
   Colpito! stanno su facce opposte come sul dado vero (1 e 6). */
export const SCATTER_FACES = ["hit", "arrow", "arrow", "arrow", "arrow", "hit"];

/* i punti cardinali servono a scrivere il risultato, non a calcolarlo:
   la direzione resta il grado */
const COMPASS = ["su", "su-destra", "destra", "giu-destra",
                 "giu", "giu-sinistra", "sinistra", "su-sinistra"];
export const compassOf = deg =>
  COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/* ============================================================
   3 · TIRARE
   Ogni dado torna la faccia grezza (raw, 1-6: quella che il cubo deve
   mostrare) e il valore letto secondo il tipo. Tenere tutte e due non
   e' ridondanza: e' quello che permette di ricontrollare a occhio un
   risultato strano invece di crederci sulla parola.
   ============================================================ */
export const d6 = () => randomInt(6) + 1;
export const d3 = () => D3_FACES[randomInt(6)];
export const roll = n => Array.from({ length: Math.max(0, n | 0) }, d6);

function one(kind){
  const raw = randomInt(6) + 1;
  if (kind === "d3") return { raw, value: D3_FACES[raw - 1] };
  if (kind === "artillery"){
    const v = ARTILLERY_FACES[raw - 1];
    return { raw, value: v, misfire: v === null };
  }
  if (kind === "scatter"){
    const face = SCATTER_FACES[raw - 1];
    /* Anche il Colpito! ha la sua freccetta: il lanciapietre la usa per
       deviare di poco invece che per niente (manuale, pagina 225). */
    return { raw, value: face, hit: face === "hit", deg: randomInt(360) };
  }
  return { raw, value: raw };
}

/* n dadi di un tipo. `target` e' il punteggio da fare o piu': quando
   c'e', ogni dado dice se e' passato e in fondo si trova il conto.
   L'1 non passa mai, che e' la regola dei tiri a bersaglio. */
export function rollDice({ kind = "d6", n = 1, target = 0 } = {}){
  const count = Math.max(1, Math.min(200, n | 0));
  const dice = Array.from({ length: count }, () => one(kind));
  if (target && (kind === "d6" || kind === "d3"))
    for (const d of dice) d.win = d.value >= target && d.raw > 1;
  const values = dice.map(d => d.value).filter(v => typeof v === "number");
  return {
    kind, n: count, target, dice,
    total: kind === "scatter" ? 0 : values.reduce((a, b) => a + b, 0),
    hits: target ? dice.filter(d => d.win).length : 0,
    misfires: dice.filter(d => d.misfire).length,
  };
}

/* ============================================================
   4 · DEVIAZIONE
   Il gesto del manuale (pagina 95) e' sempre lo stesso: un dado di
   deviazione per la direzione e qualcos'altro per la distanza. Colpito!
   vuol dire fermo dov'e'; una freccia vuol dire spostarsi di quei
   pollici in quella direzione.
   ============================================================ */
export function scatter({ distance = "d6" } = {}){
  const die = one("scatter");
  /* `dice` sta a parte perche' il vassoio deve far rotolare i dadi uno
     per uno: il 2D6 e' due cubi, non un numero da sette. */
  const pair = () => { const a = one("d6"), b = one("d6");
                       return { raw: a.raw, value: a.value + b.value, dice: [a, b] }; };
  const dist = distance === "artillery" ? one("artillery")
             : distance === "2d6"       ? pair()
             : distance === "d3"        ? one("d3")
             : distance === "none"      ? { raw: 0, value: 0, dice: [] }
             : one("d6");
  const misfire = !!dist.misfire;
  /* Il Colpito! ferma l'oggetto: la distanza tirata non si applica, ma
     resta scritta perche' certe regole la guardano lo stesso. */
  const inches = misfire || die.hit ? 0 : (dist.value || 0);
  return {
    kind: "scatter", die, dist, misfire,
    hit: die.hit, deg: die.deg, compass: compassOf(die.deg), inches,
  };
}

/* ============================================================
   5 · COME SI LEGGE, IN UNA RIGA
   Serve al registro della partita e al vassoio: la stessa frase, cosi'
   quello che si e' visto tirare e quello che resta scritto combaciano.
   ============================================================ */
export function readOut(r){
  if (!r) return "";
  if (r.kind === "scatter" && r.die){
    if (r.misfire) return "Deviazione: Mancato Colpo sul dado di artiglieria.";
    if (r.hit) return `Deviazione: Colpito! — resta dov'è (freccetta ${r.compass}, ${r.deg}°).`;
    return `Deviazione: ${r.inches}″ verso ${r.compass} (${r.deg}°).`;
  }
  const dice = r.dice || [];
  if (r.kind === "artillery"){
    const parts = dice.map(d => d.misfire ? "Mancato Colpo" : d.value);
    return `Artiglieria: ${parts.join(" + ")}${r.misfires ? "" : ` = ${r.total}`}`;
  }
  const faces = dice.map(d => d.value).join(" + ");
  const head = `${r.n}${KIND_LABEL[r.kind] || "D6"}: ${faces}`;
  if (r.target) return `${head} — ${r.hits} su ${r.n} a ${r.target}+`;
  return r.n > 1 ? `${head} = ${r.total}` : head;
}
