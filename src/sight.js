/* Schieramento Old World — la linea di vista del libro
 *
 * Fino a qui la vista la tagliava solo il terreno che «blocca», e da un
 * punto solo: il centro del fronte di chi guarda. Il libro dice quattro
 * cose in piu', e sono quelle che al tavolo decidono se un reggimento
 * si nasconde o no:
 *
 *   MODELLI E UNITA' BLOCCANO SEMPRE LA VISTA (p. 103) — un reggimento
 *   in mezzo e' un muro, e chi c'e' dietro non lo si vede;
 *
 *   IL RIPARO SI CONTA SUI MODELLI (p. 139) — non «c'e' un bosco in
 *   mezzo, quindi −1», ma quanti modelli del bersaglio sono coperti:
 *   fino alla meta' e' riparo parziale (−1), oltre la meta' pieno (−2);
 *
 *   LA COLLINA (p. 271) — chi ci sta tutto sopra vede oltre le unita'
 *   che non ci stanno, e allo stesso modo si fa vedere; e se la collina
 *   sta in mezzo e nessuno dei due ci e' sopra, la vista non passa;
 *
 *   IL BOSCO (p. 270) — due modelli tutti e due fuori non si vedono
 *   attraverso; chi ci sta dentro e' in riparo parziale.
 *
 * E una dagli schermagliatori (p. 184): attraverso un'unita' in ordine
 * sparso si vede, se la linea passa fra una basetta e l'altra.
 *
 * Le linee vanno da centro di basetta a centro di basetta, e quando il
 * centro non si vede si prova con gli spigoli: «una parte qualsiasi del
 * modello» (p. 103). Un modello visto solo di spigolo e' coperto.
 *
 * Niente DOM, niente stato. Entrano punti, poligoni e pezzi di terreno
 * nella forma di `terrainPieces()`; escono si', no e il perche'.
 */

import { segIntersectsPoly, segIntersectsCircle, boxCorners } from './geom.js';

export const PAGE = { sight: 103, cover: 139, woods: 270, hills: 271, skirmish: 184 };

/* ============================================================
   1 · CHE COSA E' UN PEZZO, PER LA VISTA
   `terrainPieces()` porta il tipo e la categoria; i pezzi scritti a
   mano nelle prove portano solo `blocks` e `cover`. Tutti e due i
   vocabolari finiscono in una di quattro parti.
   ============================================================ */
const isHill = it => it.kind === "hill";
const isWood = it => it.kind === "wood" || (it.cat && it.cat.id === "wood");

const crosses = (p, q, it) => it.circle
  ? segIntersectsCircle(p, q, [it.box.x, it.box.y], it.box.w / 2)
  : segIntersectsPoly(p, q, it.poly);

/* dentro un pezzo: il pezzo lo sa da se' (`contains`), un poligono
   nudo si prova con i raggi */
const inside = (pt, it) => it.contains ? it.contains(pt) : pointInPoly(pt, it.poly);

export function pointInPoly(p, poly){
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > p[1]) !== (yj > p[1])) && (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) hit = !hit;
  }
  return hit;
}

/* ============================================================
   2 · SULLA COLLINA
   «Tutta sulla collina» (p. 271) e' la condizione per vedere oltre le
   unita'; «in parte» basta a non farsi scavalcare con lo sguardo. Si
   contano i centri delle basette: e' il modo in cui lo si guarda.
   ============================================================ */
export function hillState(points = [], pieces = []){
  const hills = pieces.filter(isHill);
  if (!points.length || !hills.length) return "";
  const on = points.filter(p => hills.some(h => inside(p, h))).length;
  return on === points.length ? "all" : on ? "part" : "";
}

/* la quota di modelli sulla collina, per il terreno piu' alto (p. 152) */
export function hillShare(points = [], pieces = []){
  const hills = pieces.filter(isHill);
  if (!points.length || !hills.length) return 0;
  return points.filter(p => hills.some(h => inside(p, h))).length / points.length;
}

/* ============================================================
   3 · UNA LINEA
   Da un modello a un punto dell'altro. Torna chi la ferma (`blocked`)
   e chi la copre senza fermarla (`obscured`): un muretto basso non
   toglie la vista ma ripara, un reggimento la toglie e basta.

   `fromHill` e `toHill` sono le unita' di chi guarda e di chi e'
   guardato: "all", "part" o "". `others` sono le unita' in mezzo, con
   il loro poligono, le basette quando stanno in ordine sparso e la
   loro posizione rispetto alle colline.
   ============================================================ */
export function lookLine(p, q, { terrain = [], others = [], fromHill = "", toHill = "" } = {}){
  let blocked = null, obscured = null;
  for (const it of terrain){
    const pIn = inside(p, it), qIn = inside(q, it);
    if (isHill(it)){
      /* oltre la cresta: blocca solo se nessuno dei due ci sta sopra */
      if (!pIn && !qIn && crosses(p, q, it)){ blocked = it; break; }
      continue;
    }
    if (isWood(it)){
      /* chi sta nel bosco e' in riparo parziale; due modelli fuori non
         si vedono attraverso (p. 270) */
      if (qIn){ obscured = obscured || it; continue; }
      if (!pIn && crosses(p, q, it)){ blocked = it; break; }
      continue;
    }
    if (pIn) continue;                        // chi ci sta dentro non se lo conta contro
    if (it.blocks){
      if (qIn){ obscured = obscured || it; continue; }
      if (crosses(p, q, it)){ blocked = it; break; }
      continue;
    }
    if (it.cover && (qIn || crosses(p, q, it))) obscured = obscured || it;
  }
  if (!blocked){
    const overUnits = fromHill === "all" || toHill === "all";
    for (const o of others){
      /* dalla collina si vede oltre chi non ci sta, e chi ci sta tutto
         sopra si vede oltre chi non ci sta (p. 271) */
      if (overUnits && !o.hill) continue;
      const hit = o.loose && o.cells && o.cells.length
        ? o.cells.some(c => segIntersectsPoly(p, q, cellPoly(c)))
        : segIntersectsPoly(p, q, o.poly);
      if (hit){ blocked = { label: o.name || "un'unità", unit: o }; break; }
    }
  }
  return { blocked, obscured: blocked || obscured };
}

export const cellPoly = c => c.poly || boxCorners({ x: c.wx, y: c.wy, w: c.w || 20, h: c.h || 20, rot: c.wrot || 0 });
const centreOf = c => Array.isArray(c) ? c : [c.wx, c.wy];

/* ============================================================
   4 · UNA UNITA' CHE GUARDA UN'ALTRA
   `eyes` sono i modelli che guardano (di solito la prima fila),
   `targets` i modelli guardati. Se il bersaglio arriva senza modelli —
   una prova, un pezzo non ancora formato — si guarda il suo poligono
   come se fosse un modello solo.

   Per ogni modello del bersaglio si tiene il caso migliore fra tutti
   quelli che guardano: libero, coperto, invisibile. Il bersaglio si vede
   se almeno un modello non e' invisibile (p. 103); il riparo e' la quota
   di modelli non liberi (p. 139).
   ============================================================ */
export function unitSight({ eyes = [], targets = [], poly = null, terrain = [], others = [],
                            fromHill = "", toHill = "" } = {}){
  const models = targets.length ? targets
    : poly ? [{ poly, centre: centroid(poly) }] : [];
  const opts = { terrain, others, fromHill, toHill };
  const perEye = eyes.map(() => ({ sees: false, blockedBy: null }));
  let obscured = 0, visible = 0, firstBlock = null;

  for (const m of models){
    const centre = m.centre || centreOf(m);
    const edges = m.poly || cellPoly(m);
    let best = 2;                              // 0 libero, 1 coperto, 2 invisibile
    eyes.forEach((e, k) => {
      const p = centreOf(e);
      let look = lookLine(p, centre, opts);
      let state = look.blocked ? 2 : look.obscured ? 1 : 0;
      if (state === 2){
        for (const q of edges){
          const l = lookLine(p, q, opts);
          if (!l.blocked){ state = 1; look = l; break; }
        }
      }
      if (state < 2) perEye[k].sees = true;
      else if (!perEye[k].blockedBy) perEye[k].blockedBy = look.blocked;
      if (state === 2 && !firstBlock) firstBlock = look.blocked;
      if (state < best) best = state;
    });
    if (best < 2) visible++;
    if (best > 0) obscured++;
  }
  const n = models.length;
  const cover = !n || !obscured ? "" : obscured * 2 <= n ? "soft" : "hard";
  return {
    sees: visible > 0,
    blockedBy: visible ? null : firstBlock,
    perEye, models: n, visible, obscured,
    cover, coverWhy: cover ? `${obscured} modell${obscured === 1 ? "o" : "i"} su ${n} coperti` : "",
    page: PAGE.cover,
  };
}

const centroid = poly => {
  const n = Math.max(1, poly.length);
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
};

/* il nome di chi ferma la vista, come si scrive in una riga */
export const blockerLabel = b => !b ? "" : (b.label || (b.unit && b.unit.name) || "qualcosa");
