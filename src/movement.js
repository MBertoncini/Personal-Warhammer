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
const r1 = n => Math.round(n * 10) / 10;

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
/* La riga che si legge nell'ispettore e nel cartellino sul tavolo:
   «4.7″ di 8″ · nel movimento», o solo «4.7″» se M non si sa. */
export function movedText(u){
  const mv = movedFrom(u);
  if (!mv) return "";
  const b = bandsFor(u);
  const d = mv.dist.toFixed(1) + "″";
  const turn = mv.turn ? ` · ${mv.turn}° di fronte` : "";
  if (!b) return d + turn;
  return `${d} di ${b.move}″${turn}`;
}
