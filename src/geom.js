/* Schieramento Old World — geometria pura
 *
 * Stava dentro deploy.js, ma ora la usano anche gli aiuti tattici
 * (linea di vista, distanze, archi di carica) e il generatore di
 * terreno. Qui dentro non c'e' stato: entrano punti e rettangoli,
 * escono numeri.
 *
 * Un "box" e' { x, y, w, h, rot } con x,y al CENTRO e rot in gradi.
 * Un "rect" e' { x, y, w, h } con x,y in ALTO A SINISTRA (le zone).
 */

export const rectPoly = r =>
  [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];

export const pointInRect = (p, r, tol = 0.6) =>
  p[0] >= r.x - tol && p[0] <= r.x + r.w + tol &&
  p[1] >= r.y - tol && p[1] <= r.y + r.h + tol;

/* i quattro angoli di un box ruotato */
export function boxCorners(b){
  const a = (b.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-b.w/2, -b.h/2], [b.w/2, -b.h/2], [b.w/2, b.h/2], [-b.w/2, b.h/2]]
    .map(([px, py]) => [b.x + px * c - py * s, b.y + px * s + py * c]);
}

/* un punto del mondo visto dal sistema di riferimento del box */
export function toLocal(pt, b){
  const a = -(b.rot || 0) * Math.PI / 180;
  const dx = pt[0] - b.x, dy = pt[1] - b.y;
  return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
}

/* ...e il ritorno */
export function toWorld(pt, b){
  const a = (b.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [b.x + pt[0] * c - pt[1] * s, b.y + pt[0] * s + pt[1] * c];
}

/* teorema degli assi separatori: due convessi si toccano solo se
   nessuna delle normali ai lati li separa */
export function polysOverlap(A, B){
  for (const poly of [A, B]){
    for (let i = 0; i < poly.length; i++){
      const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
      const ax = -(p2[1] - p1[1]), ay = p2[0] - p1[0];
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const p of A){ const d = p[0]*ax + p[1]*ay; if (d<minA) minA=d; if (d>maxA) maxA=d; }
      for (const p of B){ const d = p[0]*ax + p[1]*ay; if (d<minB) minB=d; if (d>maxB) maxB=d; }
      if (maxA <= minB + 0.05 || maxB <= minA + 0.05) return false;
    }
  }
  return true;
}

export function pointSegDist(p, a, b){
  const vx = b[0]-a[0], vy = b[1]-a[1];
  const len = vx*vx + vy*vy;
  let t = len ? ((p[0]-a[0])*vx + (p[1]-a[1])*vy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0]+t*vx), p[1] - (a[1]+t*vy));
}

const orient = (a, b, c) => (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);

export function segsCross(p1, p2, p3, p4){
  const d1 = orient(p3, p4, p1), d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3), d4 = orient(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

export function segSegDist(p1, p2, p3, p4){
  if (segsCross(p1, p2, p3, p4)) return 0;
  return Math.min(
    pointSegDist(p1, p3, p4), pointSegDist(p2, p3, p4),
    pointSegDist(p3, p1, p2), pointSegDist(p4, p1, p2));
}

/* distanza bordo a bordo fra due poligoni convessi: 0 se si toccano */
export function polyDistance(A, B){
  if (polysOverlap(A, B)) return 0;
  let best = Infinity;
  for (let i = 0; i < A.length; i++){
    const a1 = A[i], a2 = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++){
      const b1 = B[j], b2 = B[(j + 1) % B.length];
      const d = segSegDist(a1, a2, b1, b2);
      if (d < best) best = d;
    }
  }
  return best;
}

/* distanza fra un punto e il bordo di un box (0 se dentro).
   I pezzi tondi vanno misurati dal centro, non dal rettangolo. */
export function distPointToBox(pt, b, circle = false){
  const [lx, ly] = toLocal(pt, b);
  if (circle) return Math.max(0, Math.hypot(lx, ly) - b.w / 2);
  const ox = Math.max(Math.abs(lx) - b.w / 2, 0);
  const oy = Math.max(Math.abs(ly) - b.h / 2, 0);
  return Math.hypot(ox, oy);
}

/* il segmento attraversa il poligono? Serve alla linea di vista. */
export function segIntersectsPoly(p, q, poly){
  for (let i = 0; i < poly.length; i++)
    if (segsCross(p, q, poly[i], poly[(i + 1) % poly.length])) return true;
  return false;
}

export function segIntersectsCircle(p, q, c, r){
  return pointSegDist(c, p, q) <= r;
}

/* ------------------------------------------------------------------
   Raggi: dove si ferma la vista
   Per disegnare il campo di tiro con le ombre non basta sapere SE un
   bosco sta in mezzo, serve sapere A CHE DISTANZA. Da qui in giu' `d`
   e' sempre un versore.
   ------------------------------------------------------------------ */
export function rayHitSeg(p, d, a, b){
  const v1 = [p[0] - a[0], p[1] - a[1]];
  const v2 = [b[0] - a[0], b[1] - a[1]];
  const n  = [-d[1], d[0]];
  const den = v2[0] * n[0] + v2[1] * n[1];
  if (Math.abs(den) < 1e-9) return Infinity;             // raggio parallelo al lato
  const t = (v2[0] * v1[1] - v2[1] * v1[0]) / den;       // quanto lontano sul raggio
  const u = (v1[0] * n[0] + v1[1] * n[1]) / den;         // dove sul lato
  return (t >= 0 && u >= 0 && u <= 1) ? t : Infinity;
}

export function rayHitPoly(p, d, poly){
  let best = Infinity;
  for (let i = 0; i < poly.length; i++){
    const t = rayHitSeg(p, d, poly[i], poly[(i + 1) % poly.length]);
    if (t < best) best = t;
  }
  return best;
}

export function rayHitCircle(p, d, c, r){
  const ox = p[0] - c[0], oy = p[1] - c[1];
  const b = ox * d[0] + oy * d[1];
  const disc = b * b - (ox * ox + oy * oy - r * r);
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  if (-b - s >= 0) return -b - s;
  return (-b + s >= 0) ? 0 : Infinity;                   // partenza gia' dentro
}

/* Quanto e' lontano il bordo del box dal suo centro guardando in una
   certa direzione. Serve a far partire i ventagli dal PERIMETRO della
   base e non dal centro: la carica si misura da dove tocca il tavolo. */
export function boxRadius(b, ang){
  const a = ang - (b.rot || 0) * Math.PI / 180;
  const cx = Math.abs(Math.cos(a)), cy = Math.abs(Math.sin(a));
  const tx = cx < 1e-9 ? Infinity : (b.w / 2) / cx;
  const ty = cy < 1e-9 ? Infinity : (b.h / 2) / cy;
  return Math.min(tx, ty);
}

/* i due punti piu' vicini fra due poligoni: per disegnare la linea
   della misura dove la misura avviene davvero */
export function closestPoints(A, B){
  let best = Infinity, pa = A[0], pb = B[0];
  const scan = (P, Q, swap) => {
    for (const p of P){
      for (let j = 0; j < Q.length; j++){
        const a = Q[j], b = Q[(j + 1) % Q.length];
        const vx = b[0]-a[0], vy = b[1]-a[1], len = vx*vx + vy*vy;
        let t = len ? ((p[0]-a[0])*vx + (p[1]-a[1])*vy) / len : 0;
        t = Math.max(0, Math.min(1, t));
        const c = [a[0]+t*vx, a[1]+t*vy];
        const d = Math.hypot(p[0]-c[0], p[1]-c[1]);
        if (d < best){ best = d; pa = swap ? c : p; pb = swap ? p : c; }
      }
    }
  };
  scan(A, B, false); scan(B, A, true);
  return { a: pa, b: pb, d: best };
}
