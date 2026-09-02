/* Schieramento Old World — scenari e zone di schieramento */

import { MM } from './util.js';

/* ============================================================
   4 · SCENARI
   ============================================================ */
const R = (x, y, w, h) => ({ x, y, w, h });
const T = (kind, x, y, w, h, rot) => ({ kind, x, y, w, h, rot: rot || 0 });

const SCENARIOS = {
  "bm-guado": {
    label:"Il Guado di Sangue", group:"Battle March",
    pts:600, table:[44, 30], gap:6, deploy:"lati lunghi",
    desc:"Centro aperto e conteso, fianchi ingombri. Tre tesori: quello centrale è il più esposto.",
    terrain:[
      T("wood", 12, 7.8, 7, 6), T("wall", 23, 10, 8, 0.8),
      T("wood", 34, 9.5, 8, 6),
      T("treasure", 8, 14), T("treasure", 22, 15), T("treasure", 40.5, 15.2),
      T("hill", 10, 20.2, 11, 6), T("marsh", 32, 20.5, 9, 5), T("ruins", 22, 23.5, 4.5, 4),
    ],
  },
  "bm-monolite": {
    label:"Il Monolite nella Palude", group:"Battle March",
    pts:650, table:[48, 36], gap:6, deploy:"opposed flanks",
    desc:"Un solo obiettivo, il monolite al centro: impassabile e blocca la linea di vista. Le paludi in diagonale rallentano le corsie della cavalleria.",
    terrain:[
      T("wood", 11, 9, 9, 7), T("hill", 24, 5, 12, 6), T("marsh", 34, 10, 10.5, 6),
      T("monolith", 24, 18, 4, 4),
      T("marsh", 14, 26, 12, 7.5), T("wood", 36, 27, 8.5, 9), T("hill", 24, 32, 11.5, 6),
    ],
  },
  "bm-strada": {
    label:"La Strada delle Pietre", group:"Battle March",
    pts:750, table:[48, 36], gap:6, deploy:"pitched battle",
    desc:"La collina centro-sinistra domina il tesoro centrale; il muretto in basso è postazione naturale per gli arcieri, le rovine in alto per gli schermagliatori.",
    terrain:[
      T("ruins", 7, 6.5, 4.5, 4.5), T("ruins", 23, 5.5, 12, 5.5), T("wood", 36, 10.5, 8.5, 7.5),
      T("hill", 12, 18, 12, 6),
      T("treasure", 24, 18), T("treasure", 44, 18), T("treasure", 12, 28),
      T("wall", 23, 29, 11, 0.8), T("wood", 34, 27, 8, 6),
    ],
  },
  "bm-rovine": {
    label:"Le Rovine di Xhotl", group:"Battle March",
    pts:750, table:[48, 36], gap:6, deploy:"meeting engagement",
    desc:"La piramide centrale divide il tavolo in due corsie e i due tesori stanno uno per corsia: nessuno può presidiarli entrambi.",
    terrain:[
      T("marsh", 12, 10, 12, 8), T("treasure", 24, 6), T("wood", 38, 8, 8.5, 5.5),
      T("hill", 4.5, 18, 8, 6), T("pyramid", 24, 18, 8, 7), T("hill", 43.5, 18, 8, 6),
      T("marsh", 36, 26, 10.5, 5), T("wood", 9, 28, 8.5, 6), T("treasure", 24, 30),
    ],
  },
  "open":    { label:"Battaglia Campale", group:"Generici", table:[72,48], gap:12, deploy:"pitched battle",
               desc:"Schieramento alternato per unità; nessuna unità oltre la linea di zona." },
  "meeting": { label:"Scontro di Incontro", group:"Generici", table:[72,48], gap:12, deploy:"meeting engagement",
               desc:"Metà esercito schierato, il resto arriva come rinforzo: tieni le unità in riserva." },
  "flank":   { label:"Attacco sul Fianco", group:"Generici", table:[72,48], gap:12, deploy:"flank",
               desc:"L'Esercito B divide le forze: corpo principale nella zona superiore, distaccamento in arrivo dal bordo laterale." },
  "pass":    { label:"Passo di Montagna", group:"Generici", table:[72,48], gap:12, deploy:"pass",
               desc:"Corridoio praticabile fra due creste invalicabili; gli eserciti entrano dai bordi corti opposti." },
  "cross":   { label:"Fronti Incrociati", group:"Generici", table:[72,48], gap:12, deploy:"opposed flanks",
               desc:"Schieramento in angoli opposti: avanzate diagonali e minacce continue sui fianchi." },
};

function geometry(deploy, W, H, gap){
  const d = Math.max(2 * MM, H / 2 - gap);            // profondità della striscia
  const dx = Math.max(2 * MM, W / 2 - gap);
  switch (deploy){
    case "opposed flanks":
      // ciascuno nella propria metà, ma su fianchi opposti
      return { zones:{ A:[R(W / 2, H - d, W / 2, d)], B:[R(0, 0, W / 2, d)] }, aux:[], blocked:[] };
    case "flank":
      return { zones:{ A:[R(0, H - d, W, d)], B:[R(0, 0, W, d)] },
               aux:[{ army:"B", rect:R(0, d, 12 * MM, H / 2 - d), label:"arrivo dal fianco" }], blocked:[] };
    case "pass": {
      const corridor = 24 * MM, band = (H - corridor) / 2;
      return { zones:{ A:[R(W - dx, band, dx, corridor)], B:[R(0, band, dx, corridor)] },
               aux:[], blocked:[R(0, 0, W, band), R(0, H - band, W, band)] };
    }
    default:
      return { zones:{ A:[R(0, H - d, W, d)], B:[R(0, 0, W, d)] }, aux:[], blocked:[] };
  }
}
export { R, T, SCENARIOS, geometry };
