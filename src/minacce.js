/* Schieramento Old World — dove ti possono caricare
 *
 * La domanda che al tavolo decide la fase di movimento non e' «quanto
 * mi avvicino», e' «dove mi fermo»: un pollice fuori dalla carica del
 * nemico e dentro la mia, e il turno dopo carico io. Prima l'app non
 * sapeva nemmeno porsela. L'euristica avanzava verso il nemico piu'
 * vicino di tutto il Movimento, sempre, e chi aveva il Movimento piu'
 * alto non ne ricavava niente: si fermava a portata di carica come
 * tutti gli altri.
 *
 * Questo modulo risponde con i numeri del libro, non con una stima:
 * per un ingombro messo in un punto, la probabilita' che ciascun nemico
 * lo possa caricare al suo prossimo turno. E' `declareCharge` (p. 119),
 * lo stesso conto che l'arbitro fa per le cariche vere — arco frontale
 * di chi carica com'e' girato adesso, vista, distanza bordo a bordo, il
 * maggiore di due D6 (il minore attraverso il terreno difficile), il
 * passo lungo — ripetuto su ogni nemico e combinato:
 *
 *   P(almeno uno carica) = 1 − Π (1 − p_i)
 *
 * che tratta i tiri di carica come indipendenti, ed e' quello che sono.
 *
 * Cosa NON conta, e va detto: la Paura e il Terrore che fermano chi
 * carica (l'arbitro li tira, qui no: la minaccia e' quella di chi
 * PUO' caricare), le unita' amiche che si metteranno in mezzo, e il
 * fatto che il nemico caricherebbe davvero. E' una mappa di cio' che
 * e' possibile, non di cio' che fara'.
 *
 * Niente stato, niente DOM: entrano scatole e numeri, escono numeri.
 * La usano l'arbitro (i campi `rischio` e `portata` delle mosse) e il
 * tavolo (la levetta *Minacce* nel menu Aiuti).
 */

import * as CH from './charge.js';
import { boxCorners } from './geom.js';

const MM = 25.4;

/* il terreno che la carica attraversa: il dado peggiore se c'e' del
   difficile in mezzo (p. 269), come fa l'arbitro per le cariche vere */
function peggiore(da, a, pieces){
  if (!pieces || !pieces.length) return false;
  return !!CH.terrainEffect(CH.crossed(da, a, pieces)).worstDie;
}

/* Un nemico puo' caricare questa scatola? Torna null se no, altrimenti
   la probabilita', i pollici che servono al tiro e da che lato arriva.

   `e`: { uid, name, box, move, swift, loose, fly, canCharge }
   `box`: la scatola bersaglio, { x, y, w, h, rot } in millimetri */
export function caricaSu(e, box, pieces = []){
  if (!e || e.canCharge === false || !(e.move > 0)) return null;
  const worst = e.fly ? false : peggiore([e.box.x, e.box.y], [box.x, box.y], pieces);
  const d = CH.declareCharge({
    charger: { name: e.name, box: e.box, move: e.move, swift: !!e.swift, loose: !!e.loose, fly: !!e.fly },
    target: { name: "qui", box },
    pieces, worst,
  });
  if (!d || !d.can || !(d.chance > 0)) return null;
  return { uid: e.uid, name: e.name, chance: d.chance, need: d.need, dist: d.dist, lato: d.side, worst };
}

export const almenoUno = ps => 1 - ps.reduce((q, p) => q * (1 - Math.max(0, Math.min(1, p))), 1);

/* Tutti i nemici su una scatola: le cariche possibili, dalla piu'
   probabile, e la probabilita' che ne arrivi almeno una. */
export function minacciaSu(box, enemies = [], pieces = []){
  const cariche = enemies.map(e => caricaSu(e, box, pieces)).filter(Boolean)
    .sort((a, b) => b.chance - a.chance);
  return { p: almenoUno(cariche.map(c => c.chance)), cariche };
}

/* La mia carica, il turno dopo, da una scatola verso un bersaglio.
   Chi si ferma dopo essersi girato verso il nemico lo ha nell'arco:
   quello che conta e' la distanza, e il terreno in mezzo. */
export function portataDa(box, move, target, { swift = false, fly = false, pieces = [] } = {}){
  if (!(move > 0) || !target) return 0;
  const worst = fly ? false : peggiore([box.x, box.y], [target.x, target.y], pieces);
  const d = CH.declareCharge({
    charger: { name: "da qui", box, move, swift, loose: true, fly },
    target: { name: "bersaglio", box: target },
    pieces: fly ? [] : pieces, worst,
  });
  return d && !d.impossible && !d.blocked ? d.chance : 0;
}

/* La griglia per il tavolo: in ogni casella una sonda — la scatola
   dell'unita' scelta, o un pollice quadrato — e la minaccia su di
   lei. `passo` in millimetri; `sonda` { w, h, rot }. */
export function griglia({ W, H, passo = 1.5 * MM, sonda = null, enemies = [], pieces = [] }){
  const cols = Math.max(1, Math.ceil(W / passo)), rows = Math.max(1, Math.ceil(H / passo));
  const p = new Float32Array(cols * rows);
  const chi = new Int32Array(cols * rows).fill(-1);
  const s = sonda || { w: MM, h: MM, rot: 0 };
  /* i nemici che non possono caricare nessuno non si guardano nemmeno */
  const attivi = enemies.filter(e => e && e.canCharge !== false && e.move > 0);
  /* un nemico non arriva oltre la sua portata massima piu' mezza
     diagonale: si salta il conto dove non puo' arrivare */
  const R = e => (CH.chargeBands(e.move, e.swift).max * MM) + Math.hypot(e.box.w, e.box.h) / 2 + Math.hypot(s.w, s.h) / 2;
  const raggi = attivi.map(R);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++){
    const box = { x: (c + 0.5) * passo, y: (r + 0.5) * passo, w: s.w, h: s.h, rot: s.rot || 0 };
    const vicini = attivi.filter((e, i) => Math.hypot(e.box.x - box.x, e.box.y - box.y) <= raggi[i]);
    if (!vicini.length) continue;
    const m = minacciaSu(box, vicini, pieces);
    p[r * cols + c] = m.p;
    if (m.cariche.length) chi[r * cols + c] = m.cariche[0].uid;
  }
  return { cols, rows, passo, p, chi };
}

/* Il contorno di una scatola, per chi disegna */
export const angoli = box => boxCorners(box);
