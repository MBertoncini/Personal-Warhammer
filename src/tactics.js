/* Schieramento Old World — aiuti tattici
 *
 * La geometria difficile era gia' fatta per i controlli di legalita':
 * qui si limita a rispondere alle domande che ci si fa davvero prima
 * di muovere. Quanto sono lontano da quella unita', misurato dal
 * bordo e non dal centro? La vedo, o c'e' un bosco in mezzo? Se carico
 * dritto, chi ci finisce dentro?
 *
 * Nessuno stato: entrano box e poligoni, escono numeri e poligoni.
 */

import { CHARGE } from './rules.js';
import { toWorld, polyDistance, closestPoints,
         segIntersectsPoly, segIntersectsCircle,
         rayHitPoly, rayHitCircle, boxRadius } from './geom.js';

const MM = 25.4;

/* Il fronte guarda verso -y nel sistema locale del pezzo: e' lo stesso
   lato su cui il disegno mette la riga bianca. */
export const frontCenter = b => toWorld([0, -b.h / 2], b);

/* Arco frontale alla maniera di Old World: le due rette che partono dal
   centro e passano per gli spigoli anteriori. Quello che sta in mezzo e'
   davanti, il resto e' fianco o retro. */
export function frontArcPoly(b, reach, steps = 14){
  const aR = Math.atan2(-b.h / 2,  b.w / 2);
  const aL = Math.atan2(-b.h / 2, -b.w / 2);
  const pts = [[0, 0]];
  for (let i = 0; i <= steps; i++){
    const a = aR + (aL - aR) * (i / steps);
    pts.push([Math.cos(a) * reach, Math.sin(a) * reach]);
  }
  return pts.map(p => toWorld(p, b));
}

/* distanza bordo-bordo e i due punti dove quella distanza si misura */
export function edgeDistance(polyA, polyB){
  const cp = closestPoints(polyA, polyB);
  return { d: polyDistance(polyA, polyB), a: cp.a, b: cp.b };
}

/* Un elemento scenico blocca la vista se lo dice il suo tipo. Chi ci sta
   dentro non se la blocca da solo: altrimenti un'unita' schierata in un
   bosco non vedrebbe piu' niente, nemmeno quello che ha davanti. */
export function sightBlocked(p, q, pieces){
  for (const it of pieces){
    if (!it.blocks) continue;
    if (it.circle){
      if (it.contains(p) || it.contains(q)) continue;
      if (segIntersectsCircle(p, q, [it.box.x, it.box.y], it.box.w / 2)) return it;
    } else {
      if (it.contains(p) || it.contains(q)) continue;
      if (segIntersectsPoly(p, q, it.poly)) return it;
    }
  }
  return null;
}

/* La riga che serve davvero prima di dichiarare una carica: quanto e'
   lontano ognuno, se lo vedo, e se sta nel mio arco frontale. */
export function survey(unit, targets, { cornersOf, boxOf, sightPieces = [], inch }){
  const myPoly = cornersOf(unit);
  const eye = frontCenter(boxOf(unit));
  return targets.map(t => {
    const poly = cornersOf(t);
    const { d, a, b } = edgeDistance(myPoly, poly);
    const blocker = sightBlocked(eye, closestPoints([eye], poly).b, sightPieces);
    return { unit: t, dist: inch(d), from: a, to: b, blocked: blocker, blockedBy: blocker ? blocker.label : "" };
  }).sort((x, y) => x.dist - y.dist);
}

/* movimento, marcia, carica media, carica massima: i quattro numeri che
   si guardano sempre. Senza M sul profilo non si inventa niente.
   La carica non e' M + 7: e' M piu' il MAGGIORE di due D6 (p. 121),
   quindi M + 4,5 in media e M + 6 al massimo. Chi ha il passo lungo
   aggiunge +D6 al tiro e 3 pollici alla portata massima (p. 178). */
export function movementBands(unit){
  const m = unit.stats && /^\d+$/.test(String(unit.stats.M)) ? +unit.stats.M : 0;
  if (!m) return null;
  const swift = (unit.rules || []).some(r => /swiftstride|fast cavalry|cavalleria veloce|passo lungo/i.test(r));
  const band = swift ? CHARGE.swift : CHARGE.normal;
  return {
    move: m, march: m * 2,
    charge: Math.round((m + band.avg) * 10) / 10,
    chargeMax: m + band.max,
    swift,
  };
}

/* ============================================================
   DOVE POSSO ARRIVARE
   Un cerchio dice quanto e' lungo il passo, non dove il passo porta:
   un bosco costa il doppio, una piramide non si attraversa, e il bordo
   del tavolo e' il bordo del tavolo. Qui si cammina davvero, un raggio
   alla volta, spendendo i pollici finche' ce ne sono.
   ============================================================ */

/* Che cosa c'e' dove si e' finiti: aperto, terreno che rallenta,
   terreno in cui non si entra.

   Qui prima c'era `stepCost`, che nel difficile faceva costare il
   passo il DOPPIO. Quella e' la regola dell'ottava edizione di
   Warhammer; l'Old World non la ha. Il libro dice un'altra cosa, e la
   dice in una riga sola: «se una parte qualsiasi dell'unita' si muove
   attraverso terreno difficile, quell'unita' subisce un −1 al
   Movimento, fino a un minimo di 1» (p. 269). Non e' un pedaggio che
   si paga a metri: e' un pollice tolto al passo, una volta, e vale
   anche solo a sfiorare il bosco con un angolo della basetta.

   La differenza si vede: un M4 che entra subito in un bosco arrivava
   a 2″ e il libro gli da' 3″. */
export function stepKind(pt, pieces){
  let kind = "open";
  for (const it of pieces){
    if (!it.contains(pt)) continue;
    if (it.pass === "blocked") return "blocked";
    if (it.pass === "difficult" || it.pass === "obstacle") kind = "slow";
  }
  return kind;
}

/* Quanto costa il terreno difficile, in millimetri di budget. E' il −1
   al Movimento di p. 269, e quindi vale un pollice sulla banda del
   movimento — ma la marcia e' M×2, e un −1 a M ne toglie DUE alla
   marcia. Per questo e' un parametro e non una costante: chi disegna
   la banda sa a che cosa quel budget corrisponde, il ventaglio no. */
export const SLOW_COST = MM;

/* Il ventaglio di quello che si raggiunge con un dato budget di
   movimento. Parte dal PERIMETRO della base, non dal centro: il pollice
   si misura da dove l'unita' tocca il tavolo. Chi vola scavalca tutto. */
export function reachFan(box, budgetMm, pieces, { arc = true, fly = false, rays = 36, step = 5,
                                                  bounds = null, slowCost = SLOW_COST } = {}){
  const hw = box.w / 2, hh = box.h / 2;
  const rot = (box.rot || 0) * Math.PI / 180;
  const a0 = arc ? Math.atan2(-hh,  hw) : -Math.PI;
  const a1 = arc ? Math.atan2(-hh, -hw) :  Math.PI;
  const out = [];
  const inside = p => !bounds ||
    (p[0] >= bounds.x && p[0] <= bounds.x + bounds.w && p[1] >= bounds.y && p[1] <= bounds.y + bounds.h);

  for (let k = 0; k <= rays; k++){
    const la = a0 + (a1 - a0) * (k / rays);
    const wa = la + rot;
    const dx = Math.cos(wa), dy = Math.sin(wa);
    let r = boxRadius(box, wa);                 // si parte dal bordo della base
    let left = budgetMm;
    let slowed = false;                         // il −1 si paga una volta sola
    while (left > 0){
      const adv = Math.min(step, left);
      const probe = [box.x + dx * (r + adv), box.y + dy * (r + adv)];
      if (!inside(probe)) break;
      const kind = fly ? "open" : stepKind(probe, pieces);
      if (kind === "blocked") break;
      /* entrare nel difficile costa il pollice, e non si torna piu'
         indietro: due boschi sullo stesso raggio ne costano uno */
      if (kind === "slow" && !slowed){
        slowed = true;
        left -= slowCost;
        if (left <= 0) break;
        continue;                               // il passo si rifa' col budget nuovo
      }
      if (adv > left){ r += left; left = 0; break; }
      r += adv; left -= adv;
    }
    out.push([box.x + dx * r, box.y + dy * r]);
  }
  if (arc) out.unshift([box.x, box.y]);         // il ventaglio si chiude sul centro
  return out;
}

/* ============================================================
   FIN DOVE ARRIVA LO SGUARDO
   Il campo di tiro non e' un settore di cerchio: i boschi e i monoliti
   ci ritagliano dentro delle ombre, e le ombre sono esattamente il
   posto in cui il nemico si mette. Un raggio per grado: dove incontra
   un pezzo che ferma la vista, il raggio finisce li'.
   ============================================================ */
export function sightFan(box, rangeMm, blockers, { arc = true, rays = 72, eye = null } = {}){
  const hw = box.w / 2, hh = box.h / 2;
  const rot = (box.rot || 0) * Math.PI / 180;
  const a0 = arc ? Math.atan2(-hh,  hw) : -Math.PI;
  const a1 = arc ? Math.atan2(-hh, -hw) :  Math.PI;
  const o = eye || frontCenter(box);
  /* un pezzo che si ha addosso non fa ombra a se stesso, altrimenti chi
     e' schierato in un bosco non vedrebbe piu' niente */
  const list = blockers.filter(it => !it.contains(o));
  const out = [o];

  for (let k = 0; k <= rays; k++){
    const wa = a0 + (a1 - a0) * (k / rays) + rot;
    const d = [Math.cos(wa), Math.sin(wa)];
    let t = rangeMm;
    for (const it of list){
      const h = it.circle
        ? rayHitCircle(o, d, [it.box.x, it.box.y], it.box.w / 2)
        : rayHitPoly(o, d, it.poly);
      if (h < t) t = h;
    }
    out.push([o[0] + d[0] * t, o[1] + d[1] * t]);
  }
  return out;
}

/* Quanto ripara il terreno fra chi tira e chi prende: vince il riparo
   piu' forte. Chi tira da dentro un pezzo non se lo conta contro. */
export function coverOn(p, q, pieces){
  let best = "";
  for (const it of pieces){
    if (!it.cover || it.contains(p)) continue;
    const crossed = it.contains(q) || (it.circle
      ? segIntersectsCircle(p, q, [it.box.x, it.box.y], it.box.w / 2)
      : segIntersectsPoly(p, q, it.poly));
    if (!crossed) continue;
    if (it.cover === "hard") return "hard";
    best = "soft";
  }
  return best;
}

/* ============================================================
   LA RIGA CHE SI LEGGE PRIMA DI TIRARE
   Per ogni nemico: quanto e' lontano, se lo vedo, se e' nell'arco, se
   e' oltre meta' gittata, e dietro cosa si e' messo.

   `look(t)`, quando c'e', e' la vista del libro (`sight.js`: unita' in
   mezzo, colline, riparo contato sui modelli) e vince sul conto fatto
   qui dal centro del fronte, che resta per chi non ha il tavolo intero.
   Gli schermagliatori guardano tutto intorno (p. 184).
   ============================================================ */
export function shootingSurvey(unit, targets, { cornersOf, boxOf, pieces = [], range = 0, inch, look = null }){
  const b = boxOf(unit);
  const eye = frontCenter(b);
  const myPoly = cornersOf(unit);
  const arc = frontArcPoly(b, (range || 1) * MM + Math.max(b.w, b.h), 24);
  const losPieces = pieces.filter(p => p.blocks);

  return targets.map(t => {
    const poly = cornersOf(t);
    const { d, a, b: to } = edgeDistance(myPoly, poly);
    const dist = inch(d);
    const aim = closestPoints([eye], poly).b;
    const seen = look ? look(t) : null;
    const blocker = seen
      ? (seen.sees ? null : (seen.blockedBy || { label: "qualcosa" }))
      : sightBlocked(eye, aim, losPieces);
    const inArc = !!unit.loose || polysIntersect(arc, poly);
    return {
      unit: t, dist, from: a, to, aim,
      blocked: blocker, blockedBy: blocker ? (blocker.label || "") : "",
      inArc, inRange: range > 0 && dist <= range,
      long: range > 0 && dist > range / 2,
      cover: seen ? seen.cover : coverOn(eye, aim, pieces),
      coverWhy: seen ? seen.coverWhy : "",
      canShoot: range > 0 && dist <= range && inArc && !blocker,
    };
  }).sort((x, y) => (y.canShoot - x.canShoot) || (x.dist - y.dist));
}

/* due poligoni convessi si toccano? (l'arco frontale non e' convesso in
   senso stretto ma e' abbastanza vicino da usare lo stesso teorema) */
function polysIntersect(A, B){
  for (const p of B) if (pointInPoly(p, A)) return true;
  for (const p of A) if (pointInPoly(p, B)) return true;
  for (let i = 0; i < A.length; i++)
    for (let j = 0; j < B.length; j++)
      if (segCross(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
  return false;
}
function pointInPoly(p, poly){
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > p[1]) !== (yj > p[1])) &&
        (p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function segCross(p1, p2, p3, p4){
  const o = (a, b, c) => (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
  const d1 = o(p3,p4,p1), d2 = o(p3,p4,p2), d3 = o(p1,p2,p3), d4 = o(p1,p2,p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
