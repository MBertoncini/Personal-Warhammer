/* Schieramento Old World — il tiro: chi tira, quanto serve, dove cade la sagoma
 *
 * La Tappa 4 del piano. Il tiro c'era gia' a meta': `combat.js` sa
 * tirare una raffica — per colpire, per ferire, salvezza, ferite — e
 * `tactics.js` sa disegnare fin dove arriva un colpo, con le ombre dei
 * boschi ritagliate dentro. Quello che mancava sta tutto prima e tutto
 * dopo quella raffica:
 *
 *   CHI PUO' TIRARE (p. 137) — chi ha caricato, marciato, e' in
 *   mischia o sta fuggendo non tira, e l'arma stessa puo' vietarlo;
 *
 *   QUANTI TIRANO, MODELLO PER MODELLO — non «la prima fila per due»,
 *   ma quanti modelli vedono davvero il bersaglio e ce l'hanno dentro
 *   la gittata: sono due domande geometriche, e il tavolo ha gia' i
 *   pezzi per rispondere;
 *
 *   I MODIFICATORI (p. 138) — mosso, lunga gittata, tira e tieni,
 *   copertura leggera, copertura pesante: cumulativi, e ognuno legato
 *   alla condizione vera invece che a una casella da spuntare;
 *
 *   LE SAGOME (p. 95) — cerchio da 3″, cerchio da 5″, goccia da 8″,
 *   con la regola «sotto del tutto = colpito, sotto in parte = 4+», e
 *   la deviazione che le sposta di N pollici in una direzione;
 *
 *   LE MACCHINE DA GUERRA (pp. 222-229) — il bombardamento del
 *   lanciapietre e la palla di cannone che rimbalza, con il Mancato
 *   Colpo che manda alla tabella dell'arma;
 *
 *   IL TEST DI PANICO (p. 141) — oltre un quarto perso in una fase.
 *
 * Le regole di casa sono quelle di `charge.js` e `melee.js`: niente
 * DOM, niente stato, nessun dado tirato. Entrano punti, poligoni e
 * facce gia' uscite; escono conti, posizioni ed elenchi con la traccia
 * di come sono venuti. Chi tira e' il vassoio, chi scrive e' il
 * motore, chi decide e' chi gioca.
 *
 * Una cosa va detta in cima perche' vale per tutto il file. Le due
 * tabelle del Mancato Colpo sono sei righe ognuna a p. 347, e in casa
 * non c'e' nessun file che le contenga — le liste di New Recruit
 * portano il testo delle regole speciali, non quello delle tabelle del
 * manuale. Qui sotto ci sono le due tabelle vuote e dichiarate tali:
 * l'app tira il D6, dice che faccia e' uscita e dove si legge, e chi
 * trascrive una riga se la ritrova scritta la volta dopo. Inventarle
 * sarebbe stato il modo piu' rapido di far sbagliare un tiro a chi si
 * fida.
 */

import { MM } from './util.js';
import { boxCorners, closestPoints, distPointToBox,
         segIntersectsPoly } from './geom.js';
import { sightBlocked, coverOn } from './tactics.js';
import { IMPOSSIBLE, chance } from './rules.js';

const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rad = d => d * Math.PI / 180;
const cornersOf = o => (o && o.poly) || boxCorners(o.box || o);

/* ============================================================
   0 · LE PAGINE
   Stanno in cima e non sparse nel codice, perche' sono gli unici
   numeri di questo file che vengono da fuori e si controllano con il
   libro aperto.
   ============================================================ */
export const PAGE = {
  shooting:  136,   // la fase di tiro
  who:       137,   // chi puo' tirare e chi no
  mods:      138,   // i modificatori del tiro, cumulativi
  panic:     141,   // il test di Panico oltre un quarto
  templates:  95,   // le sagome e la deviazione
  machines:  222,   // le macchine da guerra
  misfire:   347,   // le due tabelle del Mancato Colpo (Quick Reference)
};

/* ============================================================
   1 · CHI PUO' TIRARE (p. 137)
   Quattro divieti che al tavolo si dimenticano in quest'ordine: si
   marcia e poi ci si ricorda dell'arco, si carica e poi si vorrebbe
   anche tirare. Come `canCharge`, questa non impedisce niente: dice
   di no e dice perche', e chi gioca decide lo stesso.
   ============================================================ */
export function canShoot({ charged = false, marched = false, engaged = false,
                           fleeing = false, moved = false, weaponFlags = null,
                           stupid = false } = {}){
  const why = [];
  if (engaged) why.push("e' a contatto di basetta");
  if (fleeing) why.push("sta fuggendo");
  /* la Stupidita' in cui si e' caduti all'inizio del turno: «non tira e
     non lancia incantesimi» fino al proprio turno successivo */
  if (stupid) why.push("e' in preda alla Stupidita'");
  if (charged) why.push("ha caricato in questo turno");
  if (marched) why.push("ha marciato");
  /* Il divieto che non viene dall'unita' ma dall'arma: un jezzail o un
     cannone a spalla o si muove o spara, e lo dice il suo profilo. */
  const f = weaponFlags || {};
  if (moved && f.moveOrShoot) why.push("l'arma e' «o si muove o tira»");
  return { can: !why.length, why, page: PAGE.who };
}

/* ============================================================
   2 · QUANTI TIRANO, MODELLO PER MODELLO
   Il conto di prima era `fronte × 2`: la prima fila e la seconda, e
   basta. E' giusto come tetto e sbagliato come conto, perche' un
   reggimento schierato obliquo dietro una collina ha meta' della sua
   prima fila che il bersaglio non lo vede nemmeno, e l'altra meta'
   fuori gittata di due pollici. Le due domande — lo vedo? ci arrivo? —
   hanno una risposta per modello, e il tavolo ha gia' i pezzi per
   darla: i centri delle basette (`worldCells`), i poligoni dei
   bersagli, i pezzi che fermano la vista.

   `cells` sono i modelli: `{ wx, wy, cell, w, h, rot }`, cioe' quello
   che `formation.js` gia' produce. `front` serve solo a sapere in che
   fila sta ognuno, perche' il tetto delle file resta una regola.
   ============================================================ */
export const RANKS_THAT_SHOOT = 2;     // la prima fila e la seconda

export function rankOf(cell, front){
  return Math.floor(Math.max(0, cell || 0) / Math.max(1, front || 1));
}

/* Una riga per modello: dove sta, in che fila, quanto e' lontano dal
   bersaglio, se lo vede, se ci arriva, e — quando non tira — quale
   delle quattro cose gliel'ha impedito. */
export function shooterSurvey({ cells = [], target = null, pieces = [], range = 0,
                                front = 1, ranks = RANKS_THAT_SHOOT,
                                loose = false, volley = false } = {}){
  const poly = target ? cornersOf(target) : null;
  const blockers = pieces.filter(p => p.blocks);
  /* In formazione sciolta tirano tutti; la salva («volley fire») alza
     il tetto a tutte le file. Senza nessuna delle due, due file. */
  const cap = loose || volley ? Infinity : Math.max(1, ranks);

  const rows = cells.map(c => {
    const eye = [c.wx, c.wy];
    const rank = rankOf(c.cell, front);
    const aim = poly ? closestPoints([eye], poly).b : eye;
    const dist = poly ? Math.hypot(aim[0] - eye[0], aim[1] - eye[1]) / MM : Infinity;
    const blocker = poly ? sightBlocked(eye, aim, blockers) : null;
    const inRank = rank < cap;
    const inRange = range > 0 && dist <= range;
    const sees = !blocker;
    return {
      cell: c.cell, rank, at: eye, aim,
      dist: r2(dist), sees, inRange, inRank,
      blockedBy: blocker ? blocker.label : "",
      long: range > 0 && dist > range / 2,
      cover: poly ? coverOn(eye, aim, pieces) : "",
      can: inRank && inRange && sees,
    };
  });

  const n = rows.filter(r => r.can).length;
  /* Perche' gli altri non tirano, contato per causa: e' la riga che al
     tavolo fa capire se conviene girare il reggimento o spostarlo. */
  const out = {
    rank:    rows.filter(r => !r.inRank).length,
    range:   rows.filter(r => r.inRank && !r.inRange).length,
    sight:   rows.filter(r => r.inRank && r.inRange && !r.sees).length,
  };
  return {
    n, rows, out, cap: cap === Infinity ? rows.length : cap,
    /* La copertura e la lunga gittata sono del bersaglio, non del
       singolo modello: vale quella che vede la maggioranza di chi
       tira davvero, che e' il modo in cui la si guarda al tavolo. */
    long:  majority(rows.filter(r => r.can).map(r => r.long)),
    cover: majorityCover(rows.filter(r => r.can).map(r => r.cover)),
    page: PAGE.shooting,
  };
}

const majority = list => list.length ? list.filter(Boolean).length * 2 > list.length : false;
/* La copertura della maggioranza, non la peggiore. Con la peggiore
   bastava un solo arciere in fondo alla fila che guardasse oltre lo
   spigolo di un muretto per dare la copertura pesante a tutta la
   raffica, e il browser lo ha fatto vedere su quattro bersagli su
   cinque. Pesante se la vede piu' della meta'; leggera se piu' della
   meta' vede un riparo qualsiasi; altrimenti niente. */
const majorityCover = list => {
  if (!list.length) return "";
  const hard = list.filter(c => c === "hard").length;
  const any = list.filter(Boolean).length;
  return hard * 2 > list.length ? "hard" : any * 2 > list.length ? "soft" : "";
};

/* Il tetto di prima, tenuto perche' serve quando i modelli sul tavolo
   non ci sono — una stima, una lista non ancora schierata. Dice di
   essere una stima: e' la differenza fra «non lo so» e «e' cosi'». */
export function shooterCap({ models = 1, lost = 0, frontage = 1, loose = false,
                             volley = false, ranks = RANKS_THAT_SHOOT } = {}){
  const alive = Math.max(0, models - lost);
  if (loose || volley) return alive;
  return Math.min(alive, Math.max(1, frontage) * Math.max(1, ranks));
}

/* ============================================================
   3 · I MODIFICATORI (p. 138)
   Sono cumulativi, e ognuno porta la sua etichetta perche' il pannello
   deve poter dire *perche'* serve un 5. La versione di prima stava in
   `combat.js` e riceveva le caselle spuntate a mano; questa riceve le
   condizioni vere — la riga del `shooterSurvey`, lo stato dell'unita',
   la reazione scelta — e le caselle diventano quello che devono
   essere: uno scavalco, non l'unica fonte.
   ============================================================ */
export const MODS = [
  { id:"long",          v:-1, why:"lunga gittata" },
  { id:"moved",         v:-1, why:"ha mosso" },
  { id:"standAndShoot", v:-1, why:"tira e tiene" },
  { id:"soft",          v:-1, why:"copertura leggera" },
  { id:"hard",          v:-2, why:"copertura pesante" },
  { id:"looseTarget",   v:-1, why:"bersaglio sciolto" },
];
const MOD = Object.fromEntries(MODS.map(m => [m.id, m]));

export function shootMods({ long = false, moved = false, cover = "",
                            looseTarget = false, standAndShoot = false,
                            weaponFlags = null, extra = [] } = {}){
  const f = weaponFlags || {};
  const list = [];
  if (long) list.push({ ...MOD.long });
  /* «Move & Shoot» e' l'arma che il movimento non disturba: toglie
     questo -1 e nient'altro. Il nome lo dice per intero, ed e' una
     delle poche regole d'arma su cui non c'e' niente da verificare. */
  if (moved && !f.moveAndShoot) list.push({ ...MOD.moved });
  if (standAndShoot) list.push({ ...MOD.standAndShoot });
  if (cover === "soft") list.push({ ...MOD.soft });
  if (cover === "hard") list.push({ ...MOD.hard });
  if (looseTarget) list.push({ ...MOD.looseTarget });
  for (const e of extra || []) if (e && e.v) list.push({ ...e });
  return { list, total: list.reduce((s, m) => s + m.v, 0), page: PAGE.mods };
}

/* Dalle condizioni del tavolo ai modificatori, senza passare da
   nessuna casella. E' il pezzo che il §6 del piano chiedeva: «va
   agganciato alle condizioni vere invece che alle caselle». */
export function modsFor({ survey = null, shooter = null, target = null,
                          standAndShoot = false, weaponFlags = null, extra = [] } = {}){
  const s = survey || {};
  const u = shooter || {}, t = target || {};
  const mv = u.moved || null;
  return shootMods({
    long: !!s.long,
    /* Ha mosso davvero: l'ancora di movimento lo sa dalla Tappa 2, e
       una riorganizzazione non e' un movimento come gli altri. */
    moved: !!(mv && mv.inches > 0) || !!u.movedThisTurn,
    cover: s.cover || "",
    looseTarget: !!t.loose,
    standAndShoot, weaponFlags, extra,
  });
}

/* ============================================================
   4 · IL PUNTEGGIO PER COLPIRE
   Due regole che il conto di prima non sapeva dire, e sono le due che
   si notano: l'1 naturale non colpisce mai, per quanto bassa sia
   l'Abilita' Balistica del bersaglio; e dall'Abilita' Balistica alta
   in su non si scende sotto il 2+, si guadagna un RITIRO con un
   secondo punteggio.

   Il secondo punteggio e' il numero che questo file non ha modo di
   verificare: il §6 del piano dice «AB 6+ ha il ritiro con un secondo
   punteggio» e non dice quale. La riga sta qui, una sola e dichiarata,
   e chi ha il libro aperto la corregge in un punto invece che in
   cinque.
   ============================================================ */
export const NATURAL_1_MISSES = true;     // p. 138: l'1 non colpisce mai

export const BS_AGAIN = { 6:0, 7:6, 8:5, 9:4, 10:3 };
export const BS_AGAIN_DA_VERIFICARE = true;

export function hitNeed(bs = 0, mod = 0){
  const b = Math.max(0, bs | 0);
  if (!b) return { need: IMPOSSIBLE, again: 0, natural1: NATURAL_1_MISSES,
                   why: "senza Abilita' Balistica non tira", page: PAGE.mods };
  /* Il punteggio base: 7 meno l'Abilita' Balistica, mai meglio del 2+.
     I modificatori lo alzano, e mai oltre il 6 — il 6 e' l'ultima
     faccia, sotto non si va. */
  const base = Math.max(2, 7 - b);
  const need = clamp(base - mod, 2, 6);
  const again = BS_AGAIN[Math.min(b, 10)] || 0;
  return {
    need, again,
    natural1: NATURAL_1_MISSES,
    base, mod,
    daVerificare: again > 0 && BS_AGAIN_DA_VERIFICARE,
    why: `AB ${b}: ${base}+` + (mod ? `, ${mod > 0 ? "+" : ""}${mod} di modificatori` : "") +
         (again ? `, ritiro a ${again}+` : ""),
    page: PAGE.mods,
  };
}

/* Quante volte su cento un singolo tiro colpisce, ritiro compreso.
   Serve alla riga del pannello, che deve dire un numero prima che i
   dadi rotolino. */
export function hitChance(need, again = 0){
  const p = chance(need);
  if (!again) return p;
  const second = chance(again);
  return p + (1 - p) * second;
}

/* ============================================================
   5 · LE SAGOME (p. 95)
   Tre sagome, e una regola sola: sotto del tutto vuol dire colpito,
   sotto in parte vuol dire colpito con un 4+. Il resto e' geometria,
   e la geometria di una sagoma tonda e' l'unica cosa in tutta
   quest'app piu' semplice di una basetta.

   La goccia e' l'eccezione dichiarata. Il piano le da' la lunghezza —
   otto pollici — e non le da' le due larghezze, che sul pezzo di
   plastica vero si misurano con il calibro. Stanno qui come due
   numeri soli, dichiarati da verificare.
   ============================================================ */
export const PARTIAL_NEED = 4;            // sotto in parte: colpito a 4+

export const TEMPLATES = {
  small:    { id:"small",    label:"Sagoma piccola", kind:"circle",   d:3, page:PAGE.templates },
  large:    { id:"large",    label:"Sagoma grande",  kind:"circle",   d:5, page:PAGE.templates },
  teardrop: { id:"teardrop", label:"Goccia",         kind:"teardrop",
              len:8, head:3, tail:1, daVerificare:["head", "tail"], page:PAGE.templates },
};
export const TEMPLATE_IDS = Object.keys(TEMPLATES);

/* Una sagoma piazzata sul tavolo, in millimetri. Il cerchio resta un
   cerchio — provarlo contro una basetta e' un confronto di distanze,
   non un poligono — e la goccia diventa l'involucro convesso dei due
   cerchi che la formano, che e' esattamente la sua forma. */
export function placeTemplate(id, center, angleDeg = 0){
  const spec = TEMPLATES[id];
  if (!spec || !center) return null;
  const c = [center[0], center[1]];
  if (spec.kind === "circle")
    return { id, spec, kind:"circle", c, r: spec.d * MM / 2, angle: angleDeg, page: spec.page };

  /* La goccia parte dalla bocca dell'arma e si allontana: la testa
     larga e' in fondo, la coda stretta e' addosso a chi soffia. */
  const a = rad(angleDeg);
  const dir = [Math.cos(a), Math.sin(a)];
  const tailR = spec.tail * MM / 2, headR = spec.head * MM / 2;
  const tailC = [c[0] + dir[0] * tailR, c[1] + dir[1] * tailR];
  const headC = [c[0] + dir[0] * (spec.len * MM - headR), c[1] + dir[1] * (spec.len * MM - headR)];
  return {
    id, spec, kind:"teardrop", c, angle: angleDeg, page: spec.page,
    tail: { c: tailC, r: tailR }, head: { c: headC, r: headR },
    poly: hullOfTwoCircles(tailC, tailR, headC, headR),
    daVerificare: spec.daVerificare,
  };
}

/* L'involucro convesso di due cerchi: i due archi piu' le due tangenti
   esterne. Sedici punti per arco bastano — la sagoma si disegna e si
   confronta con basette da venti millimetri, non si stampa. */
function hullOfTwoCircles(c1, r1v, c2, r2v, steps = 16){
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1];
  const d = Math.hypot(dx, dy) || 1;
  const base = Math.atan2(dy, dx);
  /* l'angolo a cui la tangente esterna stacca da ciascun cerchio */
  const alpha = Math.acos(clamp((r1v - r2v) / d, -1, 1));
  const arc = (c, r, from, to) => Array.from({ length: steps + 1 }, (_, i) => {
    const t = from + (to - from) * (i / steps);
    return [c[0] + Math.cos(t) * r, c[1] + Math.sin(t) * r];
  });
  return [
    ...arc(c1, r1v, base + alpha, base + 2 * Math.PI - alpha),
    ...arc(c2, r2v, base - alpha, base + alpha),
  ];
}

/* Chi sta sotto, e quanto. Una basetta e' un rettangolo: dentro del
   tutto vuol dire tutti e quattro gli angoli dentro; dentro in parte
   vuol dire che la sagoma e la basetta si toccano. */
export function modelsUnder(cells = [], shape = null){
  if (!shape) return { full: [], partial: [], out: cells.map(c => c.cell), page: PAGE.templates };
  const full = [], partial = [], out = [];
  for (const c of cells){
    const box = { x: c.wx, y: c.wy, w: c.w || MM, h: c.h || MM, rot: c.wrot || c.rot || 0 };
    const pts = boxCorners(box);
    const inside = pts.filter(p => pointIn(shape, p)).length;
    if (inside === pts.length) full.push(c.cell);
    else if (inside > 0 || touches(shape, box, pts)) partial.push(c.cell);
    else out.push(c.cell);
  }
  return { full, partial, out, need: PARTIAL_NEED, page: PAGE.templates };
}

function pointIn(shape, p){
  if (shape.kind === "circle") return Math.hypot(p[0] - shape.c[0], p[1] - shape.c[1]) <= shape.r;
  return inCircle(shape.tail, p) || inCircle(shape.head, p) || pointInPoly(p, shape.poly);
}
const inCircle = (k, p) => Math.hypot(p[0] - k.c[0], p[1] - k.c[1]) <= k.r;

function touches(shape, box, pts){
  if (shape.kind === "circle")
    return distPointToBox(shape.c, box) <= shape.r;
  /* La goccia tocca la basetta se un suo vertice ci sta dentro o se i
     due bordi si incrociano: la seconda e' il caso della sagoma
     stretta che attraversa una basetta larga senza contenerne un
     angolo. */
  if (shape.poly.some(p => pointInPoly(p, pts))) return true;
  return segIntersectsPoly(shape.tail.c, shape.head.c, pts) ||
         distPointToBox(shape.tail.c, box) <= shape.tail.r ||
         distPointToBox(shape.head.c, box) <= shape.head.r;
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

/* Dalla sagoma ai colpi: quelli sotto del tutto passano, quelli sotto
   in parte passano con un 4+. Le facce arrivano da fuori — le tira il
   vassoio, come tutto il resto — e se non arrivano si torna il conto
   di quanti dadi servono. */
export function templateHits(under, dice = null){
  const full = (under.full || []).length;
  const part = (under.partial || []).length;
  if (!dice) return { hits: full, full, partial: part, need: PARTIAL_NEED,
                      asks: part, page: PAGE.templates };
  const kept = [];
  (under.partial || []).forEach((cell, i) => {
    const face = dice[i];
    if (face != null && face >= PARTIAL_NEED && face > 1) kept.push(cell);
  });
  return {
    hits: full + kept.length, full, partial: part, saved: part - kept.length,
    cells: [...(under.full || []), ...kept],
    need: PARTIAL_NEED, dice, page: PAGE.templates,
  };
}

/* ============================================================
   6 · LA DEVIAZIONE, APPLICATA
   Il vassoio la tira da sempre — dado di deviazione per la direzione,
   artiglieria o D6 per i pollici — e nessuno la applicava: il gesto
   che mancava e' spostare la sagoma di quei pollici in quella
   direzione. Sono due righe, ed e' il pezzo 7 del §5 del piano.
   ============================================================ */
export function scatterTo(center, { deg = 0, inches = 0, hit = false } = {}){
  if (!center) return null;
  if (hit || !inches) return { to: [center[0], center[1]], moved: 0, deg, hit: true };
  const a = rad(deg);
  return {
    to: [center[0] + Math.cos(a) * inches * MM, center[1] + Math.sin(a) * inches * MM],
    moved: r1(inches), deg, hit: false,
  };
}

/* ============================================================
   7 · LE MACCHINE DA GUERRA (pp. 222-229)
   Due procedure, e sono due gesti diversi: il lanciapietre PIAZZA e
   devia, il cannone TIRA una linea e rimbalza. Tutte e due finiscono
   sul Mancato Colpo del dado di artiglieria, che non e' un fallimento
   del tiro ma un rinvio a una tabella.
   ============================================================ */

/* Il bombardamento: si sceglie il punto, si tira la deviazione, la
   sagoma si sposta di quello che e' uscito. Il Colpito! del dado di
   deviazione non e' «fermo dov'e'» per il lanciapietre — anche lui ha
   la sua freccetta, e `dice.js` la tira gia' (p. 225) — ma il pollice
   di scarto lo decide la regola dell'arma, non questo file: qui, se il
   dado dice Colpito!, la sagoma resta dov'era. */
export function bombard({ aim = null, template = "large", deg = 0, inches = 0,
                          hit = false, misfire = false, angle = 0 } = {}){
  if (!aim) return null;
  if (misfire) return { misfire: true, kind:"stone", page: PAGE.machines,
                        text: "Mancato Colpo: si va alla tabella dell'arma." };
  const mv = scatterTo(aim, { deg, inches, hit });
  return {
    misfire: false, kind: "stone",
    aim, to: mv.to, moved: mv.moved, deg, hit: mv.hit,
    shape: placeTemplate(template, mv.to, angle),
    page: PAGE.machines,
    text: mv.hit ? "Colpito!: la sagoma resta dove e' stata messa."
                 : `Devia di ${mv.moved}″ a ${deg}°.`,
  };
}

/* La palla di cannone: si indovina una distanza, il primo dado di
   artiglieria dice di quanto si sbaglia in avanti, il secondo di
   quanto rimbalza oltre. Il Mancato Colpo sul primo ferma tutto; sul
   secondo la palla si pianta dov'e' arrivata, che e' una cosa diversa
   e va detta. */
export function cannonShot({ guess = 0, first = null, bounce = null,
                             firstMisfire = false, bounceMisfire = false } = {}){
  const g = Math.max(0, +guess || 0);
  if (firstMisfire) return { misfire: true, where: "tiro", kind:"cannon",
                             guess: g, page: PAGE.machines,
                             text: "Mancato Colpo: si va alla tabella dell'arma." };
  const over = Math.max(0, +first || 0);
  const land = g + over;
  if (bounceMisfire || bounce == null)
    return { misfire: false, stuck: true, kind:"cannon", guess: g, over, land, end: land,
             page: PAGE.machines,
             text: `Indovinati ${g}″, cade a ${land}″ e si pianta li'.` };
  const roll = Math.max(0, +bounce || 0);
  return {
    misfire: false, stuck: false, kind: "cannon",
    guess: g, over, land, bounce: roll, end: land + roll,
    page: PAGE.machines,
    text: `Indovinati ${g}″, cade a ${land}″ e rimbalza fino a ${land + roll}″.`,
  };
}

/* La linea che la palla percorre sul tavolo, dalla bocca dell'arma
   fino a dove si ferma: chi ci sta sopra lo dice il tavolo, ma il
   segmento lo dice questo file. */
export function cannonLine(from, angleDeg, shot){
  if (!from || !shot || shot.misfire) return null;
  const a = rad(angleDeg);
  const at = d => [from[0] + Math.cos(a) * d * MM, from[1] + Math.sin(a) * d * MM];
  return { from: at(0), land: at(shot.land), to: at(shot.end),
           land_in: shot.land, end_in: shot.end };
}

/* ---- le due tabelle del Mancato Colpo (p. 347) ----
   Vuote, e per una ragione. Ogni altro numero di questo file viene dal
   piano o dal testo che le liste di New Recruit si portano dietro;
   queste dodici righe non vengono da nessuna parte, e riempirle a
   naso vorrebbe dire far saltare un cannone con una regola inventata
   davanti a qualcuno che si fida. Finche' restano vuote l'app tira il
   D6, dice che faccia e' uscita e dove si legge. Trascriverne una e'
   cambiare una stringa. */
export const MISFIRE = {
  page: PAGE.misfire,
  daVerificare: true,
  nota: "Le due tabelle stanno a p. 347, sei righe ognuna. Finche' una riga e' vuota l'app dice la faccia e la pagina, e non inventa l'esito.",
  cannon: ["", "", "", "", "", ""],
  stone:  ["", "", "", "", "", ""],
};

export const MISFIRE_KINDS = {
  cannon: "Cannone",
  stone:  "Lanciapietre",
};

export function misfireRead(kind, face){
  const table = MISFIRE[kind] || [];
  const i = clamp((face | 0) - 1, 0, 5);
  const what = table[i] || "";
  return {
    kind, face: i + 1, what, page: MISFIRE.page,
    known: !!what,
    text: what || `Mancato Colpo, faccia ${i + 1}: la riga sta nella tabella del ${(MISFIRE_KINDS[kind] || kind).toLowerCase()}, p. ${MISFIRE.page}.`,
  };
}

/* ============================================================
   8 · IL TEST DI PANICO DEL TIRO (p. 141)
   Una sola delle quattro cause del §6 — le altre tre sono della Tappa
   5 — ed e' quella che il tiro produce da se': un quarto della forza
   perso in una fase di tiro, e l'unita' tira il Panico. Il conto lo fa
   l'app meglio di chiunque, perche' sa quanti ne sono partiti.
   ============================================================ */
export const PANIC_SHARE = 1 / 4;

export function panicFromShooting({ start = 0, lost = 0, us = 0, usLost = 0, destroyed = false } = {}){
  /* Chi e' stato spazzato via non tira niente: non c'e' nessuno a
     cui far perdere i nervi. Il browser lo ha fatto vedere su un
     personaggio solo, tolto dal tavolo e poi chiamato al Panico. */
  if (destroyed) return { must: false, share: 1, page: PAGE.panic, destroyed: true,
                          why: "distrutta: nessuno a cui fare il test" };
  /* Il manuale conta la Forza d'Unita', non le teste: un Rat Ogre
     perso vale tre chiavicai, e su un'unita' mista contare i modelli
     da' la risposta sbagliata in tutte e due le direzioni. Dove la
     Forza d'Unita' non e' stata passata si ripiega sui modelli e lo si
     dice. */
  const base = us > 0 ? us : start;
  const gone = us > 0 ? usLost : lost;
  if (base <= 0) return { must: false, share: 0, page: PAGE.panic, why: "nessuno da contare" };
  const share = gone / base;
  return {
    must: share > PANIC_SHARE,
    share: r2(share), lost: gone, of: base,
    counted: us > 0 ? "Forza d'Unita'" : "modelli",
    approx: us <= 0,
    page: PAGE.panic,
    why: `${gone} su ${base} ` + (share > PANIC_SHARE
      ? `— piu' di un quarto: test di Panico (p. ${PAGE.panic})`
      : "— sotto il quarto: nessun test"),
  };
}

/* ============================================================
   9 · LE REGOLE D'ARMA CHE RIGUARDANO IL TIRO
   Stavano nell'elenco «si giocano altrove» di `rulebook.js` con la
   nota «riguarda il tiro, non la mischia», che era vera e adesso non
   basta piu': questo e' il tiro. Sono le regole che le dieci liste
   salvate portano davvero — giavellotto, arco corto, jezzail,
   cannone — e non una selezione presa dal manuale a caso.

   Tre sono chiare dal nome e non hanno niente da verificare: «Move or
   Shoot», «Move & Shoot», «Multiple Shots (n)». Due dicono cosa fanno
   ma non con che numeri, e lo dichiarano.
   ============================================================ */
const num = (s, dflt = 1) => {
  const m = /\(\s*(\d+)/.exec(String(s));
  return m ? +m[1] : dflt;
};

export const SHOOTING_RULES = [
  { id:"moveOrShoot", re:/^move or shoot/i,
    what:"o si muove o tira, non tutte e due nello stesso turno",
    on: f => { f.moveOrShoot = true; } },

  { id:"moveAndShoot", re:/^move\s*(and|&)\s*shoot/i,
    what:"puo' tirare anche dopo aver mosso, senza il -1",
    on: f => { f.moveAndShoot = true; } },

  { id:"multipleShots", re:/^multiple shots/i,
    what:"piu' di un tiro per modello",
    on: (f, name) => { f.multipleShots = Math.max(f.multipleShots || 0, num(name, 2)); } },

  { id:"quickShot", re:/^quick shot/i,
    what:"un tiro in piu' per modello",
    daVerificare:"quanti tiri in piu', e a che condizioni",
    on: f => { f.quickShot = true; } },

  { id:"volleyFire", re:/^volley fire/i,
    what:"tirano anche le file oltre la seconda",
    daVerificare:"quante file, e con quale modificatore",
    on: f => { f.volleyFire = true; } },

  { id:"multipleWounds", re:/^multiple wounds/i,
    what:"ogni ferita che passa ne conta piu' di una",
    on: (f, name) => { f.multipleWounds = name; } },

  /* Queste due stanno sui profili delle armi skaven e dicono tutte e
     due qualcosa sul quando si tira, non sul quanto: senza il testo
     del libro l'app le nomina e si ferma li'. */
  { id:"cumbersome", re:/^cumbersome/i,
    what:"arma ingombrante",
    daVerificare:"cosa impedisce esattamente",
    on: f => { f.cumbersome = true; } },

  { id:"ponderous", re:/^ponderous/i,
    what:"arma lenta da usare",
    daVerificare:"cosa impedisce esattamente",
    on: f => { f.ponderous = true; } },
];

export const emptyShootFlags = () => ({
  moveOrShoot:false, moveAndShoot:false, multipleShots:0, quickShot:false,
  volleyFire:false, multipleWounds:"", cumbersome:false, ponderous:false,
});

/* Come `readRules`, e con lo stesso obbligo: quello che non si conosce
   si elenca invece di sparire. `texts` sono i testi per esteso che le
   liste si portano dietro, quando ce n'e' uno. */
export function readShooting(names = [], texts = null){
  const flags = emptyShootFlags();
  const applied = [], unknown = [];
  const seen = new Set();
  for (const raw of names){
    const name = String(raw || "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const text = (texts && texts[name]) || "";
    const hit = SHOOTING_RULES.find(r => r.re.test(name));
    if (hit){
      hit.on(flags, name);
      applied.push({ name, text, what: hit.what, daVerificare: hit.daVerificare || "" });
    } else unknown.push({ name, text });
  }
  return { flags, applied, unknown };
}

/* Quanti tiri fa un modello con quell'arma: uno, o quelli che la
   regola dice. Il tiro in piu' del «Quick Shot» non e' contato finche'
   non si sa quanti sono — contarlo per uno sarebbe indovinare, e si
   indovinerebbe su ogni giavellotto di ogni lista. */
export function shotsPerModel(flags = {}){
  const n = Math.max(1, flags.multipleShots || 1);
  return { n, quickShot: !!flags.quickShot,
           nota: flags.quickShot ? "«Quick Shot» non e' contato: manca quanti tiri in piu' fa." : "" };
}

/* ============================================================
   10 · LA RIGA DEL PANNELLO
   Mettere insieme le nove cose di sopra in una risposta sola: questa
   unita', su questo bersaglio, quanti tiri, con che punteggio, e
   perche'. E' la forma di `chargeSurvey`, e non e' un caso: al tavolo
   la domanda e' la stessa, cambia solo l'arma.
   ============================================================ */
export function shotPlan({ shooter = null, target = null, cells = [], pieces = [],
                           range = 0, front = 1, bs = 0, weaponRules = [],
                           standAndShoot = false, texts = null, state = {} } = {}){
  const read = readShooting(weaponRules, texts);
  const f = read.flags;
  const gate = canShoot({ ...state, moved: !!(state.moved), weaponFlags: f });
  const survey = shooterSurvey({ cells, target, pieces, range, front,
                                 loose: !!(shooter && shooter.loose), volley: f.volleyFire });
  const mods = modsFor({ survey, shooter, target, standAndShoot, weaponFlags: f });
  const per = shotsPerModel(f);
  const need = hitNeed(bs, mods.total);
  return {
    gate, survey, mods, need, rules: read,
    shots: survey.n * per.n, perModel: per,
    chance: hitChance(need.need, need.again),
    page: PAGE.shooting,
  };
}
