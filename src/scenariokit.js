/* Schieramento Old World — scenari propri e terreno casuale
 *
 * I quattro Battle March sono mappe fisse, ed e' giusto cosi'. Ma il
 * tavolo del circolo non e' mai quello del manuale: qui si salva la
 * disposizione che hai davvero, e si genera terreno nuovo che rispetta
 * da solo i vincoli che l'app gia' controlla — nessun pezzo oltre i 12"
 * sul lato lungo, tesori a piu' di 3" da ogni elemento.
 *
 * Il generatore lavora a specchio: quello che mette in una meta' lo
 * ripete ruotato di mezzo giro nell'altra. E' la regola non scritta dei
 * tavoli equi, e toglie di mezzo la discussione su chi ha avuto la
 * collina buona.
 */

import { TERRAIN, TREASURE_CLEAR, BM_MAX_SIDE } from './terrain.js';
import { loadDoc, saveDoc } from './store.js';

const KEY = "scenarios:custom";

let custom = [];

export async function initScenarioKit(){
  custom = await loadDoc(KEY, []) || [];
  return custom;
}

export const allCustom = () => custom.slice();

/* le voci custom hanno la stessa forma di quelle in scenarios.js, cosi'
   il resto del codice non deve sapere da dove arrivano */
export function customScenarioMap(){
  const out = {};
  for (const s of custom) out[s.id] = { ...s, group: "Miei scenari" };
  return out;
}

const persist = () => saveDoc(KEY, custom);

export async function saveCustom({ name, table, gap, deploy, desc, terrain, id = null }){
  const rec = {
    id: id || "sx" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    label: name || "Scenario mio",
    table, gap, deploy: deploy || "pitched battle",
    desc: desc || "Scenario salvato dal tavolo.",
    terrain,
  };
  const i = custom.findIndex(s => s.id === rec.id);
  if (i >= 0) custom[i] = rec; else custom.push(rec);
  await persist();
  return rec.id;
}

export async function removeCustom(id){
  custom = custom.filter(s => s.id !== id);
  await persist();
}

/* ============================================================
   GENERATORE
   ============================================================ */
const round = v => Math.round(v * 4) / 4;      // al quarto di pollice, come lo snap
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/* rettangoli allineati agli assi, in pollici, con un margine attorno */
const box = p => ({ x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h });
function gapBetween(a, b){
  const A = box(a), B = box(b);
  const dx = Math.max(A.x - (B.x + B.w), B.x - (A.x + A.w), 0);
  const dy = Math.max(A.y - (B.y + B.h), B.y - (A.y + A.h), 0);
  return Math.hypot(dx, dy);
}

const KINDS = ["hill", "wood", "wood", "marsh", "ruins", "wall", "hill"];

/* Un pezzo plausibile: la misura di partenza del suo tipo, scossa del
   30%, con il lato lungo tenuto sotto il limite del Battle March. */
function makePiece(kind, W, H, maxSide){
  const cfg = TERRAIN[kind];
  let w = Math.round(rnd(cfg.w * 0.7, cfg.w * 1.3) * 2) / 2;
  let h = Math.round(rnd(cfg.h * 0.7, cfg.h * 1.3) * 2) / 2;
  if (maxSide){ w = Math.min(w, maxSide); h = Math.min(h, maxSide); }
  w = Math.min(w, W / 3); h = Math.min(h, H / 3);
  return { kind, w: Math.max(2, w), h: Math.max(1, h), rot: kind === "wall" ? pick([0, 0, 90]) : 0 };
}

/* misura d'ingombro tenendo conto della rotazione a 90 gradi */
const span = p => (p.rot === 90 ? { w: p.h, h: p.w } : { w: p.w, h: p.h });

/**
 * Terreno casuale per un tavolo W x H pollici.
 *  - mirror: la meta' inferiore e' la superiore ruotata di mezzo giro
 *  - treasures: quanti segnalini tesoro (0 = nessuno)
 *  - battleMarch: applica il tetto dei 12" sul lato lungo
 */
export function randomTerrain(W, H, { pieces = 8, mirror = true, treasures = 3,
                                      battleMarch = true, margin = 2, spacing = 3 } = {}){
  const maxSide = battleMarch ? BM_MAX_SIDE : 0;
  const half = mirror ? Math.ceil(pieces / 2) : pieces;
  const placed = [];

  const fits = p => {
    const s = span(p);
    if (p.x - s.w / 2 < margin || p.x + s.w / 2 > W - margin) return false;
    if (p.y - s.h / 2 < margin || p.y + s.h / 2 > H - margin) return false;
    return placed.every(q => gapBetween({ ...p, ...span(p) }, { ...q, ...span(q) }) >= spacing);
  };

  /* la meta' in cui si semina: con lo specchio solo quella alta, meno
     una fascia sulla mediana perche' il gemello non ci finisca sopra */
  const yTop = margin, yBot = mirror ? H / 2 - spacing / 2 : H - margin;

  for (let i = 0; i < half; i++){
    let ok = null;
    for (let t = 0; t < 120 && !ok; t++){
      const p = makePiece(pick(KINDS), W, H, maxSide);
      /* l'ingombro va letto ruotato: un muretto girato di 90 gradi e'
         alto 8" anche se nella scheda h vale 0.8, e seminato con la
         misura sbagliata sfonda la mediana e si scontra col suo gemello */
      const s = span(p);
      const yHi = yBot - s.h / 2;
      if (yHi < yTop + s.h / 2) continue;      // non ci sta nella meta': si riprova
      /* si arrotonda PRIMA di verificare: arrotondare dopo sposta i pezzi
         di un ottavo di pollice e manda a monte proprio le distanze che
         si erano appena controllate */
      p.x = round(rnd(margin + s.w / 2, W - margin - s.w / 2));
      p.y = round(rnd(yTop + s.h / 2, yHi));
      if (fits(p)) ok = p;
    }
    if (ok) placed.push(ok);
  }

  const out = placed.slice();
  if (mirror) for (const p of placed) out.push({ ...p, x: round(W - p.x), y: round(H - p.y) });

  /* I tesori vengono dopo: devono stare a piu' di 3" da tutto il resto,
     ed e' molto piu' facile trovargli posto che spostare una collina. */
  const tre = [];
  const clear = pt => out.every(p => {
    const s = span(p);
    const dx = Math.max(Math.abs(pt.x - p.x) - s.w / 2, 0);
    const dy = Math.max(Math.abs(pt.y - p.y) - s.h / 2, 0);
    return Math.hypot(dx, dy) >= TREASURE_CLEAR + 0.2;
  }) && tre.every(q => Math.hypot(pt.x - q.x, pt.y - q.y) >= 6);

  const wanted = Math.max(0, treasures);
  if (wanted){
    /* uno al centro, gli altri a coppie speculari: la simmetria del
       tavolo vale soprattutto per gli obiettivi */
    const centre = { x: W / 2, y: H / 2 };
    if (clear(centre)) tre.push(centre);
    for (let t = 0; t < 400 && tre.length < wanted; t++){
      const p = { x: round(rnd(margin + 2, W - margin - 2)), y: round(rnd(margin + 2, H / 2 - 1)) };
      const q = { x: round(W - p.x), y: round(H - p.y) };
      if (clear(p) && clear(q)){
        tre.push(p);
        if (tre.length < wanted) tre.push(q);
      }
    }
  }

  return [
    ...out.map(p => ({ kind: p.kind, x: p.x, y: p.y, w: p.w, h: p.h, rot: p.rot || 0 })),
    ...tre.map(p => ({ kind: "treasure", x: p.x, y: p.y,
                       w: TERRAIN.treasure.w, h: TERRAIN.treasure.h, rot: 0 })),
  ];
}

