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

import { toWorld, polyDistance, closestPoints,
         segIntersectsPoly, segIntersectsCircle } from './geom.js';

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

/* movimento, carica media, carica massima: i tre cerchi che si guardano
   sempre. Senza M sul profilo non si inventa niente. */
export function movementBands(unit){
  const m = unit.stats && /^\d+$/.test(String(unit.stats.M)) ? +unit.stats.M : 0;
  if (!m) return null;
  return { move: m, charge: m + 7, chargeMax: m + 12 };
}
