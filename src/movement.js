/* Schieramento Old World — quanto mi sto muovendo, e da dove
 *
 * I cerchi di movimento c'erano gia', ma erano disegnati attorno
 * all'unita': appena la trascinavi si portavano dietro il centro, e la
 * domanda a cui dovevano rispondere — «fin dove posso arrivare?» —
 * spariva proprio nel momento in cui serviva. Il giocatore vedeva un
 * cerchio che lo seguiva e si dimenticava da dove era partito.
 *
 * L'ancora e' la risposta: il punto da cui l'unita' ha cominciato a
 * muoversi in questo turno. I cerchi si disegnano LI' e restano fermi;
 * l'unita' ci esce o non ci esce, e mentre la trascini una riga dice
 * quanti pollici hai gia' fatto.
 *
 * L'ancora si mette da sola al primo spostamento e si azzera a ogni
 * «Chiudi il turno»: il turno nuovo riparte da dove sei arrivato.
 *
 * Le soglie vengono dal manuale: marcia = M x 2 (p. 123), carica = M
 * piu' il maggiore di due D6, cioe' M + 4,5 in media e M + 6 al
 * massimo (p. 121). Il valore di M si legge dal profilo e si corregge
 * a mano nell'ispettore quando il roster sbaglia o quando una regola
 * lo cambia: l'app non sa perche' cambia, sa solo disegnare il
 * cerchio giusto.
 *
 * Nessuno stato interno: entra un'unita', escono numeri.
 */

import { MM, inch } from './util.js';
import { CHARGE } from './rules.js';

/* ------------------------------------------------------------------
   L'ancora
   ------------------------------------------------------------------ */
export const anchorOf = u => (u && u.anchor && typeof u.anchor === "object") ? u.anchor : null;

export function setAnchor(u){
  if (!u || !u.placed || u.dead) return null;
  u.anchor = { x: u.x, y: u.y, rot: u.rot || 0 };
  return u.anchor;
}
export function clearAnchor(u){ if (u) u.anchor = null; }

/* Chi non e' sul tavolo non ha un punto di partenza: l'ancora si toglie
   invece di restare appesa a una posizione che non esiste piu'. */
export function anchorAll(units){
  for (const u of units || []){
    if (u.placed && !u.dead) setAnchor(u);
    else clearAnchor(u);
  }
}

/* Al primo spostamento di un'unita' che non ce l'ha ancora: e' il gesto
   che dice «questo turno parte da qui», e non chiede di premere niente. */
export function ensureAnchor(u){
  return anchorOf(u) || setAnchor(u);
}

/* ------------------------------------------------------------------
   Quanto si e' mosso
   Spostamento netto fra l'ancora e adesso, misurato dal centro, piu'
   il giro di fronte. Non e' il percorso camminato — chi avanza e
   ripiega risulta fermo — ed e' scritto ovunque venga mostrato.
   ------------------------------------------------------------------ */
const degDiff = (a, b) => {
  let d = Math.abs(((a || 0) - (b || 0)) % 360);
  return d > 180 ? 360 - d : d;
};

export function movedFrom(u){
  const a = anchorOf(u);
  if (!a || !u.placed || u.dead) return null;
  const dmm = Math.hypot(u.x - a.x, u.y - a.y);
  return {
    from: a,
    mm: dmm,
    dist: inch(dmm),
    turn: Math.round(degDiff(u.rot, a.rot)),
    still: dmm < MM / 8,
  };
}

/* ==================================================================
   IL BUDGET: quanto costa arrivare fin li'
   ------------------------------------------------------------------
   Fino a qui il movimento era una cosa sola: lo spostamento in linea
   d'aria fra l'ancora e adesso, piu' i gradi di fronte scritti
   accanto come una curiosita'. Al tavolo non funziona cosi', e la
   differenza non e' una sfumatura: **un reggimento non va in
   diagonale**. Va dritto davanti a se', e per puntare da un'altra
   parte deve ruotare — e la ruota si paga, in pollici, dallo stesso
   Movimento con cui poi cammina (p. 124).

   E' la ragione per cui al tavolo le colonne ruotano e le linee no:
   nella ruota lo spigolo esterno percorre un arco di raggio pari al
   fronte, quindi un reggimento largo cinque pollici che gira di
   novanta gradi ne ha gia' spesi quasi otto e non si e' mosso di un
   passo. L'app disegnava un cerchio attorno all'ancora e diceva di
   si' a una diagonale che al tavolo non esiste.

   Qui dentro non si impedisce niente: si dice **quanto costa**, e da
   cosa e' fatto il conto. «8,4″ (6,1″ di corsa piu' 2,3″ di ruota)»
   e' la riga che il piano chiede, ed e' tutto quello che serve —
   il pezzo si sposta lo stesso, e se le miniature dicono un'altra
   cosa hanno ragione le miniature.

   Tutto in **costo contro il Movimento base**: un pollice in avanti
   costa un pollice, uno all'indietro ne costa due (perche' indietro
   si va a meta' velocita', p. 125), e un arco di ruota costa i suoi
   pollici veri. Cosi' i quattro modi di spostarsi si confrontano con
   un numero solo invece che con quattro regole diverse.
   ================================================================== */

/* Quanto costa girarsi. La ruota fa perno su uno spigolo di fronte:
   lo spigolo esterno percorre un arco di raggio pari al fronte
   dell'unita', ed e' quell'arco che si paga in pollici (p. 124). */
export function wheelCost(widthMm, deg){
  return inch((+widthMm || 0) * Math.abs(deg || 0) * Math.PI / 180);
}

/* Indietro e di lato si vanno a meta' velocita' (p. 125): un pollice
   percorso ne consuma due di quelli che hai. */
export const HALF_RATE = 2;

/* I giri sul posto costano una frazione del Movimento (p. 124). Un
   angolo che non sia 90 o 180 gradi, sul posto, il manuale non lo
   chiama giro: e' una riorganizzazione, e costa tutto. */
export const TURN_COST = { 90: 1 / 4, 180: 1 / 2 };

const r1 = n => Math.round(n * 10) / 10;
const r2 = n => Math.round(n * 100) / 100;

/* differenza fra due direzioni, con segno, fra -180 e 180 */
function signedDiff(from, to){
  let d = ((+to || 0) - (+from || 0)) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/* La direzione in cui guarda il fronte, in gradi di tavolo. Sul tavolo
   il fronte locale e' -y e la rotazione cresce in senso orario,
   quindi la direzione del moto in avanti e' questa. */
const headingOf = rot => ((+rot || 0) % 360 + 360) % 360;

/* La direzione da un punto all'altro, nella stessa scala. */
function bearing(from, to){
  const dx = to.x - from.x, dy = to.y - from.y;
  if (!dx && !dy) return null;
  /* 0 = verso -y, e cresce in senso orario come `rot` */
  return ((Math.atan2(dx, -dy) * 180 / Math.PI) % 360 + 360) % 360;
}

const leg = (id, label, cost, why, inches = null) =>
  ({ id, label, cost: r2(cost), inches: inches == null ? r2(cost) : r2(inches), why });

/* ------------------------------------------------------------------
   I modi di arrivarci.
   Ognuno e' una fila di manovre con il suo costo; quello che costa
   meno e' quello che al tavolo si farebbe, ed e' quello che l'app
   scrive. Gli altri restano nell'elenco, perche' «ti conviene girare
   invece di ruotare» e' meta' di quello che si impara giocando.
   ------------------------------------------------------------------ */
export function movePlans({ widthMm = 0, move = 0, from, to } = {}){
  if (!from || !to) return [];
  const w = +widthMm || 0;
  const arc = deg => wheelCost(w, deg);
  const dist = inch(Math.hypot(to.x - from.x, to.y - from.y));
  const r0 = headingOf(from.rot), r1deg = headingOf(to.rot);
  const spin = signedDiff(r0, r1deg);            // il fronte, da com'era a com'e'
  const dir = bearing(from, to);                 // dove sta il punto d'arrivo
  const plans = [];

  /* --- fermo, solo girato --- */
  if (dist < 0.05){
    const turn = Math.abs(Math.round(spin));
    if (!turn) return [{ id:"still", label:"fermo", cost:0, legs:[], exact:true }];
    const quarter = Math.abs(turn - 90) <= 2, half = Math.abs(turn - 180) <= 2;
    if (quarter || half){
      const frac = quarter ? TURN_COST[90] : TURN_COST[180];
      plans.push({ id:"turn", label:`giro di ${quarter ? 90 : 180}°`, exact:true,
        cost: r2((+move || 0) * frac),
        legs: [leg("turn", `giro di ${quarter ? 90 : 180}°`, (+move || 0) * frac,
                   `${quarter ? "un quarto" : "metà"} del Movimento (p. 124)`, 0)] });
    }
    /* un angolo qualsiasi sul posto e' una riorganizzazione */
    plans.push({ id:"reform", label:"riorganizzazione", exact:true, cost: r2(+move || 0),
      legs: [leg("reform", `riorganizzazione di ${turn}°`, +move || 0,
                 "tutto il movimento (p. 125)", 0)] });
    /* oppure la ruota, che per un angolo stretto costa meno di tutto */
    plans.push({ id:"wheel", label:"ruota sul posto", exact:false, cost: r2(arc(turn)),
      legs: [leg("wheel", `ruota di ${turn}°`, arc(turn),
                 "l'arco dello spigolo esterno (p. 124)")],
      note:"la ruota sposta anche il pezzo: sul posto è un'approssimazione" });
    return plans.sort((a, b) => a.cost - b.cost);
  }

  /* --- avanti: ruota per puntare, cammina, ruota per allinearti --- */
  const aim = signedDiff(r0, dir);               // quanto girare per avere il punto davanti
  const after = signedDiff(dir, r1deg);          // e quanto ancora per il fronte finale
  {
    const legs = [];
    if (Math.abs(aim) >= 0.5)
      legs.push(leg("wheel", `ruota di ${Math.abs(Math.round(aim))}° per puntare`, arc(aim),
                    "l'arco dello spigolo esterno (p. 124)"));
    legs.push(leg("forward", `${r1(dist)}″ in avanti`, dist, "un pollice per pollice"));
    if (Math.abs(after) >= 0.5)
      legs.push(leg("wheel", `ruota di ${Math.abs(Math.round(after))}° per allinearsi`, arc(after),
                    "l'arco dello spigolo esterno (p. 124)"));
    plans.push({ id:"ahead", label:"ruota e avanti", exact:true,
      cost: r2(legs.reduce((s, l) => s + l.cost, 0)), legs });
  }

  /* --- indietro: senza girarsi, a metà velocità, se il punto sta dietro --- */
  if (Math.abs(aim) >= 135){
    const legs = [leg("back", `${r1(dist)}″ all'indietro`, dist * HALF_RATE,
                      "indietro si va a metà velocità (p. 125)", dist)];
    if (Math.abs(spin) >= 0.5)
      legs.push(leg("wheel", `ruota di ${Math.abs(Math.round(spin))}°`, arc(spin),
                    "l'arco dello spigolo esterno (p. 124)"));
    plans.push({ id:"back", label:"all'indietro", exact: Math.abs(aim) >= 178,
      cost: r2(legs.reduce((s, l) => s + l.cost, 0)), legs,
      note: Math.abs(aim) >= 178 ? "" : "il punto non è esattamente dietro: c'è una diagonale che non esiste" });
  }

  /* --- di lato: il passo laterale, anche lui a metà velocità --- */
  if (Math.abs(Math.abs(aim) - 90) <= 45){
    const legs = [leg("side", `${r1(dist)}″ di lato`, dist * HALF_RATE,
                      "di lato si va a metà velocità (p. 125)", dist)];
    if (Math.abs(spin) >= 0.5)
      legs.push(leg("wheel", `ruota di ${Math.abs(Math.round(spin))}°`, arc(spin),
                    "l'arco dello spigolo esterno (p. 124)"));
    plans.push({ id:"side", label:"di lato", exact: Math.abs(Math.abs(aim) - 90) <= 2,
      cost: r2(legs.reduce((s, l) => s + l.cost, 0)), legs,
      note: Math.abs(Math.abs(aim) - 90) <= 2 ? "" : "il punto non è esattamente di fianco: c'è una diagonale che non esiste" });
  }

  return plans.sort((a, b) => a.cost - b.cost);
}

/* Il conto che si legge: il modo piu' economico, con da cosa e' fatto.
   `dist` resta la linea d'aria, perche' e' quello che si misura con il
   metro, e `cost` e' quello che il Movimento paga davvero. */
export function moveCost({ widthMm = 0, move = 0, from, to } = {}){
  const plans = movePlans({ widthMm, move, from, to });
  if (!plans.length) return null;
  const best = plans[0];
  return {
    cost: best.cost, plan: best, plans,
    dist: r1(inch(Math.hypot(to.x - from.x, to.y - from.y))),
    wheel: r2(best.legs.filter(l => l.id === "wheel").reduce((s, l) => s + l.cost, 0)),
    why: best.legs.map(l => l.label).join(", "),
  };
}

/* Lo stesso conto per un'unita' del tavolo. La larghezza del fronte la
   sa chi disegna — qui non si sa niente di ingombri — e senza si fa
   quello che si puo': la ruota costa zero e si dice. */
export function costFrom(u, widthMm = 0){
  const a = anchorOf(u);
  if (!a || !u.placed || u.dead) return null;
  const c = moveCost({ widthMm, move: moveOf(u), from: a,
                       to: { x: u.x, y: u.y, rot: u.rot || 0 } });
  if (c) c.blind = !widthMm;
  return c;
}

/* ------------------------------------------------------------------
   Le soglie
   Marcia = M x 2 (p. 123). La carica NON e' M + 7: si tirano due D6 e
   si tiene il maggiore (p. 121), quindi M + 4,5 in media e M + 6 al
   massimo — che e' anche il limite oltre il quale la carica non si
   puo' nemmeno dichiarare (p. 119). Il passo lungo aggiunge +D6 al
   tiro e 3 pollici alla portata massima (p. 178).
   ------------------------------------------------------------------ */
export const MOVE_BANDS = [
  { id:"move",      label:"movimento",      of: m => m,                          dash:"none",  op:.85 },
  { id:"march",     label:"marcia",         of: m => m * 2,                      dash:"14 7",  op:.55 },
  { id:"charge",    label:"carica media",   of: (m, s) => r1(m + band(s).avg),   dash:"9 6",   op:.7 },
  { id:"chargeMax", label:"carica massima", of: (m, s) => m + band(s).max,       dash:"3 8",   op:.45 },
];
const band = swift => (swift ? CHARGE.swift : CHARGE.normal);

/* Il passo lungo si legge dalle regole dell'unita': cambia due delle
   quattro soglie, e cambiarle in silenzio sarebbe un cerchio disegnato
   piu' corto di quello che il pezzo puo' fare davvero. */
export const swiftOf = u =>
  (u && u.rules || []).some(r => /swiftstride|fast cavalry|cavalleria veloce|passo lungo/i.test(r));

/* M dal profilo, se e' un numero. Un profilo che dice «*» o «2D6» non
   si inventa: senza M non si disegna niente. */
export function moveOf(u){
  if (!u) return 0;
  if (u.moveOverride != null && +u.moveOverride > 0) return +u.moveOverride;
  const m = u.stats && String(u.stats.M || "").match(/^\d+$/);
  return m ? +m[0] : 0;
}

export function bandsFor(u){
  const m = moveOf(u);
  if (!m) return null;
  const swift = swiftOf(u);
  const out = { m, swift };
  for (const b of MOVE_BANDS) out[b.id] = b.of(m, swift);
  return out;
}

/* La banda in cui cade una distanza: e' quello che colora il numero
   mentre trascini. Verde entro il movimento, ambra fin dove il pezzo
   puo' arrivare in qualche modo, rosso oltre tutto. Nessuna regola:
   e' un semaforo, non un arbitro, e l'unita' si muove lo stesso.

   Le soglie si ordinano invece di stare in fila fissa: da quando la
   carica e' M + 6 e non piu' M + 12, per quasi tutti la marcia e' il
   movimento piu' lungo, e la fila scritta a mano avrebbe risposto
   «carica massima» a un pezzo che stava semplicemente marciando. */
export function bandOf(u, distInches){
  const b = bandsFor(u);
  if (!b) return { key:"none", label:"", color:"var(--muted)", limit:0 };
  const rows = MOVE_BANDS
    .map(x => ({ key:x.id, label:BAND_TEXT[x.id], limit:b[x.id] }))
    .sort((p, q) => p.limit - q.limit);
  for (const r of rows)
    if (distInches <= r.limit + 0.01)
      return { ...r, color: r.key === "move" ? "var(--ok)" : "var(--warn)" };
  return { key:"over", label:"oltre ogni movimento", color:"var(--bad)",
           limit: rows[rows.length - 1].limit };
}
const BAND_TEXT = {
  move:"nel movimento", march:"in marcia",
  charge:"carica media", chargeMax:"carica massima",
};
/* La riga che si legge nell'ispettore e nel cartellino sul tavolo.
   Quando la larghezza del fronte si sa, il numero e' il **costo** e
   non la linea d'aria, e accanto c'e' da dove viene: «8,4″ di 8″
   (6,1″ di corsa più 2,3″ di ruota)». Senza larghezza resta la misura
   di prima, che e' onesta e incompleta invece che sbagliata. */
export function movedText(u, widthMm = 0){
  const mv = movedFrom(u);
  if (!mv) return "";
  const b = bandsFor(u);
  const c = widthMm ? costFrom(u, widthMm) : null;
  const turn = mv.turn ? ` · ${mv.turn}° di fronte` : "";

  if (c && c.wheel > 0.05){
    const walk = (c.cost - c.wheel).toFixed(1);
    const head = `${c.cost.toFixed(1)}″${b ? ` di ${b.move}″` : ""}`;
    return `${head} (${walk}″ di corsa più ${c.wheel.toFixed(1)}″ di ruota)`;
  }
  const n = c ? c.cost : mv.dist;
  const d = n.toFixed(1) + "″";
  if (!b) return d + turn;
  return `${d} di ${b.move}″${turn}`;
}
