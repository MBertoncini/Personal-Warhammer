/* Schieramento Old World — terreno e scenari generati
 *
 * Il generatore del terreno casuale stava in scenariokit.js, accanto
 * all'archivio degli scenari salvati, e tirava i dadi con Math.random.
 * Il Laboratorio ne vuole due cose in più: che giri nei Web Worker e dal
 * terminale (qui niente archivio, niente DOM), e che lo stesso seme dia
 * lo stesso tavolo — una ricerca che gioca «il tavolo 4011» lo deve
 * poter rigiocare, e chi lo trova bello lo deve poter salvare uguale.
 *
 * Sopra il terreno c'è lo SCENARIO GENERATO: misura del tavolo,
 * schieramento, quanto è pieno, quanti tesori, se c'è un landmark al
 * centro e con quale formato si gioca. Ogni manopola può essere fissa o
 * «a caso», e il caso viene dal seme. Servono a due domande:
 *
 *   - su che tavolo si gioca bene QUESTA sfida? (cerca.js,
 *     `cercaScenario`): tanti tavoli diversi, giocati tutti;
 *   - una lista è forte o è forte su quei sei tavoli? Una ricerca può
 *     giocare su tavoli generati invece che sui soliti.
 *
 * Le regole del generatore sono quelle di prima: specchio di mezzo giro
 * (nessuno ha la collina buona), lato lungo entro i 12″ del Battle March
 * quando il formato è quello, tesori a più di 3″ da ogni elemento.
 */

import { TERRAIN, TREASURE_CLEAR, BM_MAX_SIDE } from './terrain.js';

const round = v => Math.round(v * 4) / 4;      // al quarto di pollice, come lo snap

/* rettangoli allineati agli assi, in pollici, con un margine attorno */
const box = p => ({ x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h });
function gapBetween(a, b){
  const A = box(a), B = box(b);
  const dx = Math.max(A.x - (B.x + B.w), B.x - (A.x + A.w), 0);
  const dy = Math.max(A.y - (B.y + B.h), B.y - (A.y + A.h), 0);
  return Math.hypot(dx, dy);
}

const KINDS = ["hill", "wood", "wood", "marsh", "ruins", "wall", "hill"];

/* misura d'ingombro tenendo conto della rotazione a 90 gradi */
const span = p => (p.rot === 90 ? { w: p.h, h: p.w } : { w: p.w, h: p.h });

/* i dadi del generatore: col seme sempre gli stessi */
export function dadi(seme){
  let s = (seme >>> 0) || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Terreno casuale per un tavolo W x H pollici.
 *  - mirror: la meta' inferiore e' la superiore ruotata di mezzo giro
 *  - treasures: quanti segnalini tesoro (0 = nessuno)
 *  - battleMarch: applica il tetto dei 12" sul lato lungo
 *  - kinds: i tipi fra cui pescare (con le ripetizioni come pesi)
 *  - centre: un pezzo al centro del tavolo, prima di tutto il resto
 *  - rnd: i dadi; senza, Math.random
 */
export function randomTerrain(W, H, { pieces = 8, mirror = true, treasures = 3, battleMarch = true,
                                      margin = 2, spacing = 3, kinds = KINDS, centre = null, rnd = Math.random } = {}){
  const r = (a, b) => a + rnd() * (b - a);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const maxSide = battleMarch ? BM_MAX_SIDE : 0;

  /* Un pezzo plausibile: la misura di partenza del suo tipo, scossa del
     30%, con il lato lungo tenuto sotto il limite del Battle March. */
  const makePiece = kind => {
    const cfg = TERRAIN[kind];
    let w = Math.round(r(cfg.w * 0.7, cfg.w * 1.3) * 2) / 2;
    let h = Math.round(r(cfg.h * 0.7, cfg.h * 1.3) * 2) / 2;
    if (maxSide){ w = Math.min(w, maxSide); h = Math.min(h, maxSide); }
    w = Math.min(w, W / 3); h = Math.min(h, H / 3);
    return { kind, w: Math.max(2, w), h: Math.max(1, h), rot: kind === "wall" ? pick([0, 0, 90]) : 0 };
  };

  const placed = [];
  const fits = p => {
    const s = span(p);
    if (p.x - s.w / 2 < margin || p.x + s.w / 2 > W - margin) return false;
    if (p.y - s.h / 2 < margin || p.y + s.h / 2 > H - margin) return false;
    return [...fixed, ...placed].every(q => gapBetween({ ...p, ...span(p) }, { ...q, ...span(q) }) >= spacing);
  };
  /* il pezzo al centro sta da solo: il suo gemello sarebbe lui */
  const fixed = [];
  if (centre && TERRAIN[centre]){
    const c = TERRAIN[centre];
    fixed.push({ kind: centre, x: round(W / 2), y: round(H / 2), w: c.w, h: c.h, rot: 0 });
  }
  const half = mirror ? Math.ceil(pieces / 2) : pieces;

  /* la meta' in cui si semina: con lo specchio solo quella alta, meno
     una fascia sulla mediana perche' il gemello non ci finisca sopra */
  const yTop = margin, yBot = mirror ? H / 2 - spacing / 2 : H - margin;

  for (let i = 0; i < half; i++){
    let ok = null;
    for (let t = 0; t < 120 && !ok; t++){
      const p = makePiece(pick(kinds));
      /* l'ingombro va letto ruotato: un muretto girato di 90 gradi e'
         alto 8" anche se nella scheda h vale 0.8, e seminato con la
         misura sbagliata sfonda la mediana e si scontra col suo gemello */
      const s = span(p);
      const yHi = yBot - s.h / 2;
      if (yHi < yTop + s.h / 2) continue;      // non ci sta nella meta': si riprova
      /* si arrotonda PRIMA di verificare: arrotondare dopo sposta i pezzi
         di un ottavo di pollice e manda a monte proprio le distanze che
         si erano appena controllate */
      p.x = round(r(margin + s.w / 2, W - margin - s.w / 2));
      p.y = round(r(yTop + s.h / 2, yHi));
      if (fits(p)) ok = p;
    }
    if (ok) placed.push(ok);
  }

  const out = [...fixed, ...placed];
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
    const centro = { x: W / 2, y: H / 2 };
    if (wanted % 2 === 1 && clear(centro)) tre.push(centro);
    for (let t = 0; t < 400 && tre.length < wanted; t++){
      const p = { x: round(r(margin + 2, W - margin - 2)), y: round(r(margin + 2, H / 2 - 1)) };
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

/* ============================================================
   LO SCENARIO GENERATO
   ============================================================ */
/* le misure: le due di Battle March (con 6″ fra le zone) e il tavolo
   del libro base (12″) */
export const TAVOLI = {
  piccolo: { label: "44×30 (Battle March piccolo)", table: [44, 30], gap: 6 },
  medio:   { label: "48×36 (Battle March)", table: [48, 36], gap: 6 },
  grande:  { label: "72×48 (Core Rulebook)", table: [72, 48], gap: 12 },
};
/* gli schieramenti che geometry() (scenarios.js) sa disegnare */
export const SCHIERAMENTI = {
  "pitched battle": "Battaglia campale",
  "meeting engagement": "Scontro di incontro",
  "opposed flanks": "Fronti incrociati",
  "flank": "Attacco sul fianco",
  "pass": "Passo di montagna",
};
export const DENSITA = {
  rado:  { label: "rado (4 pezzi)", pezzi: 4 },
  medio: { label: "medio (8 pezzi)", pezzi: 8 },
  fitto: { label: "fitto (12 pezzi)", pezzi: 12 },
};
export const CENTRI = { niente: "niente", monolith: "un monolite", pyramid: "una piramide", hill: "una collina" };
/* i tipi di terreno, a gruppi: chi vuole un tavolo di boschi lo dice */
export const MISCELE = {
  vario:    { label: "vario", kinds: KINDS },
  boschi:   { label: "boschi e paludi", kinds: ["wood", "wood", "wood", "marsh", "marsh", "hill"] },
  rovine:   { label: "rovine e muretti", kinds: ["ruins", "ruins", "wall", "wall", "hill"] },
  aperto:   { label: "aperto, colline", kinds: ["hill", "hill", "hill", "wall"] },
};
const CASO = "caso";
/* i valori di una manopola «a caso»: lo schieramento del passo stretto
   esce meno spesso, perché su un tavolo piccolo è un corridoio */
const SCELTE = {
  tavolo: ["medio", "medio", "grande", "piccolo"],
  deploy: ["pitched battle", "pitched battle", "meeting engagement", "opposed flanks", "flank", "pass"],
  densita: ["rado", "medio", "medio", "fitto"],
  miscela: ["vario", "vario", "boschi", "rovine", "aperto"],
  centro: ["niente", "niente", "monolith", "pyramid", "hill"],
};

/* `p`: { tavolo, deploy, densita, miscela, centro, tesori, formato } —
   ognuno un valore o "caso". Torna la scheda dello scenario, nella forma
   di scenarios.js, con `gen` che dice come è stata fatta. */
export function scenarioCasuale(seme, p = {}){
  const rnd = dadi(seme);
  const scegli = (k, v) => !v || v === CASO ? SCELTE[k][Math.floor(rnd() * SCELTE[k].length)] : v;
  const tavolo = scegli("tavolo", p.tavolo), deploy = scegli("deploy", p.deploy);
  const densita = scegli("densita", p.densita), miscela = scegli("miscela", p.miscela);
  const centro = scegli("centro", p.centro);
  const formato = !p.formato || p.formato === CASO ? (rnd() < 0.5 ? "bm" : "core") : p.formato;
  const tesori = p.tesori == null || p.tesori === CASO ? Math.floor(rnd() * 4) : Math.max(0, p.tesori | 0);
  const T = TAVOLI[tavolo] || TAVOLI.medio;
  const [W, H] = T.table;
  const terrain = randomTerrain(W, H, {
    pieces: (DENSITA[densita] || DENSITA.medio).pezzi, mirror: true, treasures: tesori,
    battleMarch: formato === "bm", kinds: (MISCELE[miscela] || MISCELE.vario).kinds,
    centre: centro !== "niente" ? centro : null, rnd,
  });
  const nome = `${SCHIERAMENTI[deploy] || deploy}, ${miscela === "vario" ? "" : MISCELE[miscela].label + ", "}${densita}` +
               `${centro !== "niente" ? ", " + CENTRI[centro] + " al centro" : ""}`;
  return {
    id: `gen-${seme}`, label: `Tavolo ${seme} · ${nome}`,
    group: formato === "bm" ? "Battle March" : "Generati",
    table: [W, H], gap: T.gap, deploy,
    desc: `Generato dal Laboratorio (seme ${seme}): ${T.label}, ${SCHIERAMENTI[deploy] || deploy}, terreno ${(MISCELE[miscela] || MISCELE.vario).label} ${densita}, ` +
          `${tesori} ${tesori === 1 ? "tesoro" : "tesori"}${centro !== "niente" ? ", " + CENTRI[centro] + " al centro" : ""}, ` +
          `${formato === "bm" ? "regole Battle March" : "regole del Core Rulebook"}.`,
    terrain,
    gen: { seme, tavolo, deploy, densita, miscela, centro, tesori, formato },
  };
}
