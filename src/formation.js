/* Schieramento Old World — formazioni, personaggi, contatti di basetta
 *
 * Fino a ieri un'unita' era un rettangolo: modelli, fronte, e il resto
 * lo faceva la moltiplicazione. Al tavolo pero' due unita' con gli
 * stessi numeri non si mettono mai allo stesso modo: gli
 * schermagliatori si sparpagliano come vuole chi li muove, un
 * reggimento puo' andare in linea, in colonna o a cuneo, e i
 * personaggi stanno DENTRO le unita', in una casella precisa del
 * primo rango.
 *
 * Qui dentro c'e' il posto di ogni singolo modello. Entrano un'unita'
 * e i personaggi che le si sono uniti, esce una lista di caselle
 * («slot»): dove sta ogni base, quanto e' grande, e di chi e'. Da
 * quella lista si ricavano l'ingombro, il disegno sul tavolo, i
 * contatti di basetta e il terreno che l'unita' sta occupando.
 *
 * Niente DOM e niente stato globale: entrano oggetti, escono numeri.
 * Lo usano deploy.js per disegnare, formeditor.js per farlo modificare
 * e battlelog.js per raccontarlo nel report.
 *
 * Coordinate: millimetri, come tutto il tavolo. Le caselle sono
 * relative al CENTRO dell'ingombro attuale dell'unita' (quello vivo:
 * i morti non occupano spazio), con y negativa verso il fronte.
 */

import { MM, inch } from './util.js';
import { boxCorners, polyDistance, closestPoints, toLocal } from './geom.js';
import { TERRAIN } from './terrain.js';

/* mezzo pollice fra una base e l'altra: la spaziatura degli
   schermagliatori che l'app usava gia' prima che le formazioni
   diventassero modificabili */
export const LOOSE_GAP = 12.7;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = v => Math.round(v * 10) / 10;

/* ============================================================
   1 · FORMAZIONI PREDEFINITE
   ============================================================ */

/* In ordine chiuso la formazione e' solo la larghezza di fronte: il
   resto lo decide la griglia. Ogni preset dice quanti modelli mettere
   davanti, dato quanti ne restano in piedi. */
export const RANK_PRESETS = [
  { id:"line",   label:"Linea",      hint:"tutti in un rango solo",        front: n => n },
  { id:"broad",  label:"Due ranghi", hint:"largo e poco profondo",         front: n => Math.ceil(n / 2) },
  { id:"block",  label:"Blocco",     hint:"il compromesso di sempre",      front: n => Math.max(1, Math.round(Math.sqrt(n * 1.6))) },
  { id:"square", label:"Quadrato",   hint:"stessa larghezza e profondita", front: n => Math.max(1, Math.round(Math.sqrt(n))) },
  { id:"column", label:"Colonna",    hint:"stretto, per passare",          front: n => Math.max(1, Math.min(n, Math.round(Math.sqrt(n / 3)))) },
];

/* In formazione sciolta la griglia non c'e': ogni modello ha un posto
   suo. Questi generatori danno il punto di partenza, poi si trascina.
   L'ordine conta: il primo della lista e' il piu' avanzato, l'ultimo
   e' il primo a cadere quando arrivano le perdite. */
export const FREE_PRESETS = [
  { id:"cloud",   label:"Nuvola",     hint:"sparpagliati, come si muovono davvero" },
  { id:"screen",  label:"Schermo",    hint:"una riga larga davanti all'esercito" },
  { id:"checker", label:"Scacchiera", hint:"righe sfalsate, niente in fila" },
  { id:"arc",     label:"Mezzaluna",  hint:"arco convesso verso il nemico" },
  { id:"wedge",   label:"Cuneo",      hint:"a V, la punta davanti" },
  { id:"file",    label:"Fila",       hint:"in colonna per uno" },
  { id:"custom",  label:"Come l'hai messa", hint:"posizioni spostate a mano" },
];

export const presetLabel = f => {
  const list = f.mode === "free" ? FREE_PRESETS : RANK_PRESETS;
  const p = list.find(x => x.id === f.preset);
  return p ? p.label : (f.mode === "free" ? "Sciolta" : "Ranghi");
};

/* ============================================================
   2 · IL CAMPO formation SULL'UNITA'
   Le unita' salvate prima che le formazioni esistessero non ce
   l'hanno: si riempie con i valori che riproducono esattamente il
   disegno di prima, cosi' riaprire un tavolo vecchio non sposta
   niente.
   ============================================================ */
export function ensureFormation(u){
  const f = (u.formation && typeof u.formation === "object") ? u.formation : {};
  f.mode    = f.mode === "free" ? "free" : "ranks";
  f.preset  = typeof f.preset === "string" ? f.preset : "block";
  f.spacing = Number.isFinite(f.spacing) ? f.spacing : (u.loose ? LOOSE_GAP : 0);
  f.align   = f.align === "center" ? "center" : "left";
  f.slots   = Array.isArray(f.slots) ? f.slots : null;
  f.rev     = Number.isFinite(f.rev) ? f.rev : 0;
  u.formation = f;
  if (!Array.isArray(u.fallen)) u.fallen = [];
  return f;
}

/* ============================================================
   3 · LE CASELLE
   ============================================================ */

/* ordine chiuso: la griglia di sempre, piu' l'allineamento dell'ultimo
   rango incompleto (a sinistra come prima, oppure centrato) */
function rankCells(u, n, f){
  const sw = u.baseW + f.spacing, sh = u.baseH + f.spacing;
  const front = Math.max(1, Math.min(u.frontage || 1, n));
  const ranks = Math.ceil(n / front);
  const out = [];
  for (let i = 0; i < n; i++){
    const row = Math.floor(i / front), col = i % front;
    const inRow = Math.min(front, n - row * front);
    const off = f.align === "center" ? (front - inRow) * sw / 2 : 0;
    out.push({
      x: -front * sw / 2 + off + col * sw + sw / 2,
      y: -ranks * sh / 2 + row * sh + sh / 2,
      rot: 0,
    });
  }
  return out;
}

/* formazione sciolta: i generatori. Tutti restituiscono n posizioni
   ordinate dal fronte verso il fondo. */
function freeCells(u, n, f){
  const gap = Math.max(f.spacing, 4);
  const sw = u.baseW + gap, sh = u.baseH + gap;
  const front = Math.max(1, Math.min(u.frontage || 1, n));
  const out = [];
  const push = (x, y, rot = 0) => out.push({ x, y, rot });

  switch (f.preset){
    case "screen": {
      for (let i = 0; i < n; i++) push(-((n - 1) / 2) * sw + i * sw, 0);
      break;
    }
    case "file": {
      for (let i = 0; i < n; i++) push(0, -((n - 1) / 2) * sh + i * sh);
      break;
    }
    case "checker": {
      const ranks = Math.ceil(n / front);
      for (let i = 0; i < n; i++){
        const row = Math.floor(i / front), col = i % front;
        push(-((front - 1) / 2) * sw + col * sw + (row % 2 ? sw / 2 : 0),
             -((ranks - 1) / 2) * sh + row * sh);
      }
      break;
    }
    case "arc": {
      const span = Math.max(n - 1, 1);
      const radius = (span * sw) / 1.7;
      for (let i = 0; i < n; i++){
        const t = (i / span - 0.5) * 1.5;          // circa 43 gradi per lato
        push(Math.sin(t) * radius,
             radius - Math.cos(t) * radius - radius * 0.12,
             Math.round(t * 180 / Math.PI));
      }
      break;
    }
    case "wedge": {
      for (let i = 0; i < n; i++){
        const side = i % 2 ? 1 : -1;
        const step = Math.ceil(i / 2);
        push(side * step * sw * 0.75, step * sh * 0.8 - (n > 1 ? sh * 0.4 : 0));
      }
      break;
    }
    default: {                                     // nuvola
      const ranks = Math.ceil(n / front);
      for (let i = 0; i < n; i++){
        const row = Math.floor(i / front), col = i % front;
        /* niente Math.random(): due aperture della stessa app devono
           dare la stessa nuvola, altrimenti l'unita' balla a ogni
           ridisegno */
        const jx = (((i * 37) % 11) - 5) / 5 * sw * 0.28;
        const jy = (((i * 53) % 9) - 4) / 4 * sh * 0.30;
        push(-((front - 1) / 2) * sw + col * sw + jx,
             -((ranks - 1) / 2) * sh + row * sh + jy);
      }
    }
  }
  return out;
}

/* le posizioni di TUTTI i modelli dell'unita', vivi e caduti: e' la
   tavola che l'editor modifica e che si salva sull'unita' */
export function baseCells(u, n){
  const f = ensureFormation(u);
  const total = Math.max(1, n ?? (u.models || 1));
  if (f.mode === "free"){
    const gen = freeCells(u, total, f);
    /* se le posizioni salvate sono meno dei modelli (unita' cresciuta
       dopo), le prime restano dove stanno e le nuove arrivano dal
       preset */
    if (f.slots && f.slots.length)
      for (let i = 0; i < f.slots.length && i < total; i++)
        gen[i] = { x:+f.slots[i].x || 0, y:+f.slots[i].y || 0, rot:+f.slots[i].rot || 0 };
    return gen;
  }
  return rankCells(u, total, f);
}

/* ============================================================
   4 · CHI E' CADUTO
   In ordine chiuso il reggimento si accorcia da dietro, come le
   miniature vere: cadono gli ultimi della lista. In formazione
   sciolta invece si toglie il modello che e' stato colpito, e quale
   sia lo decide chi gioca cliccandolo nell'editor.
   ============================================================ */
export function fallenSet(u, alive){
  const total = Math.max(1, u.models || 1);
  const lost = clamp(total - alive, 0, total);
  const set = new Set();
  if (lost <= 0) return set;
  const f = ensureFormation(u);
  if (f.mode === "free" && Array.isArray(u.fallen))
    for (const i of u.fallen){
      if (set.size >= lost) break;
      if (Number.isInteger(i) && i >= 0 && i < total) set.add(i);
    }
  for (let i = total - 1; i >= 0 && set.size < lost; i--) set.add(i);
  return set;
}

/* Segnare un modello come caduto (o rimetterlo in piedi) toccando la
   base nell'editor: torna il nuovo numero di perdite, che chi chiama
   passa a game.js perche' lo scriva nel registro. */
export function toggleFallen(u, i){
  ensureFormation(u);
  const total = Math.max(1, u.models || 1);
  if (!Number.isInteger(i) || i < 0 || i >= total) return u.lost || 0;
  const list = u.fallen.filter(k => Number.isInteger(k) && k >= 0 && k < total);
  const at = list.indexOf(i);
  if (at >= 0) list.splice(at, 1);
  else list.push(i);
  u.fallen = list;
  return clamp(list.length, 0, total);
}

/* Le perdite arrivano anche dall'ispettore, come numero secco: qui la
   lista dei caduti si allinea al conto, riempiendo da dietro. */
export function syncFallen(u, lost){
  ensureFormation(u);
  const total = Math.max(1, u.models || 1);
  const want = clamp(lost, 0, total);
  let list = [...new Set(u.fallen.filter(k => Number.isInteger(k) && k >= 0 && k < total))];
  if (list.length > want) list = list.slice(0, want);
  for (let i = total - 1; i >= 0 && list.length < want; i--) if (!list.includes(i)) list.push(i);
  u.fallen = list;
  return u.fallen;
}

/* ============================================================
   5 · PERSONAGGI UNITI ALL'UNITA'
   ============================================================ */

/* Un personaggio e' quello che il roster mette fra i Characters. Non
   tutti i file lo dicono, pero': dove la categoria manca vale la
   regola che al tavolo si usa a occhio — un modello solo, a piedi o a
   cavallo (un carro o un mostro sono un modello solo anche loro, ma
   dentro un reggimento non ci vanno). La spunta nell'ispettore ha
   comunque l'ultima parola. */
export function isCharacter(u){
  if (typeof u.character === "boolean") return u.character;
  if (/character|personagg|comandante/i.test(u.slot || "")) return true;
  return (u.models || 1) === 1 &&
    /infantry|fanteria|cavalry|cavalleria|mounted/i.test(u.troop || "");
}

export const joinedHost = u => (u.join && u.join.host != null) ? u.join.host : null;

/* Il reggimento in cui il pezzo sta davvero, non l'id scritto sopra.
   Un'unita' eliminata non ospita piu' nessuno, e un id rimasto appeso a
   un'unita' cancellata non vale niente: in tutti e due i casi il
   personaggio e' di nuovo un pezzo suo, e chiunque lo guardi deve
   vederlo cosi'. Prima l'ispettore lo dava per libero e la tendina
   degli agganci no, e il pezzo spariva da tutte e due le liste. */
export function hostUnit(units, ch){
  const id = joinedHost(ch);
  if (id == null) return null;
  const h = (units || []).find(u => u.uid === id);
  return h && !h.dead ? h : null;
}

export const attachedTo = (units, host) =>
  units.filter(c => c.uid !== host.uid && !c.dead && hostUnit(units, c)?.uid === host.uid);

/* ospita gia' qualcuno? */
export const hostsAnyone = (units, u) =>
  (units || []).some(c => c.uid !== u.uid && !c.dead && hostUnit(units, c)?.uid === u.uid);

/* Chi si puo' infilare dentro un'altra unita'. La categoria del roster
   non basta: al tavolo dentro un reggimento ci finiscono anche i pezzi
   che il file non chiama «character» — il boss senza categoria, il
   portastendardo comprato a parte, la bestia da compagnia. La regola
   che tiene e' un'altra: un modello solo ci sta, un reggimento no.
   Questa guarda la forma del pezzo; chi ci sta gia' dentro o chi ci
   tiene dentro qualcun altro lo filtrano i candidati. */
export const canJoin = u => !u.dead && (isCharacter(u) || (u.models || 1) === 1);

/* Chi lo puo' ospitare: chiunque non sia gia' dentro a qualcun altro.
   Un pezzo dentro un pezzo dentro un pezzo non e' una cosa che
   succede al tavolo, e qui non si puo' costruire. */
export const canHost = (units, u) => !u.dead && hostUnit(units, u) == null;

/* i candidati all'aggancio dentro `host`, in ordine di lista */
export const joinCandidates = (units, host) =>
  units.filter(c => c.uid !== host.uid && c.army === host.army &&
                    canJoin(c) && hostUnit(units, c) == null && !hostsAnyone(units, c));

/* la strada opposta: i reggimenti in cui `ch` si puo' infilare. Serve
   alla scheda del personaggio, dove prima c'era solo una riga di testo
   che rimandava altrove. */
export const hostCandidates = (units, ch) =>
  (canJoin(ch) && !hostsAnyone(units, ch))
    ? units.filter(h => h.uid !== ch.uid && h.army === ch.army && canHost(units, h))
    : [];

/* Perche' un pezzo che ti aspettavi non c'e'. La tendina spariva senza
   dire niente e sembrava che la funzione non ci fosse: qui escono i
   quasi-candidati con il motivo, e l'ispettore lo scrive. */
export function joinRefusals(units, host){
  const out = [];
  for (const c of units || []){
    if (c.uid === host.uid || c.army !== host.army) continue;
    if (!(isCharacter(c) || (c.models || 1) === 1)) continue;   // un reggimento non ci sta, e si sa
    if (c.dead){ out.push({ uid:c.uid, name:c.name, why:"è eliminata" }); continue; }
    const h = hostUnit(units, c);
    if (h){
      if (h.uid !== host.uid)                                   // chi e' gia' dentro QUESTO non manca
        out.push({ uid:c.uid, name:c.name, why:`è già dentro ${h.name}` });
      continue;
    }
    if (hostsAnyone(units, c)) out.push({ uid:c.uid, name:c.name, why:"ospita già un personaggio" });
  }
  return out;
}

/* lo stesso, guardando dalla parte del personaggio */
export function hostRefusals(units, ch){
  const out = [];
  if (!canJoin(ch)) return out;
  for (const c of units || []){
    if (c.uid === ch.uid || c.army !== ch.army) continue;
    if (c.dead){ out.push({ uid:c.uid, name:c.name, why:"è eliminata" }); continue; }
    const h = hostUnit(units, c);
    if (h) out.push({ uid:c.uid, name:c.name, why:`è già dentro ${h.name}` });
  }
  return out;
}

/* La casella preferita: il centro del primo rango, che e' dove il
   personaggio si mette nove volte su dieci. */
function defaultSeatIdx(u, n){
  const front = Math.max(1, Math.min(u.frontage || 1, n));
  return Math.min(n - 1, Math.floor((front - 1) / 2));
}

export function joinUnit(ch, host){
  ch.join = { host: host.uid, idx: null, x: null, y: null, rot: null };
  ch.placed = false;
  return ch;
}
export function leaveUnit(ch){ ch.join = null; return ch; }

/* ============================================================
   6 · L'INGOMBRO
   Da qui esce tutto il resto: il rettangolo dell'unita' sul tavolo,
   i controlli di legalita', il magnetismo, i contatti.
   ============================================================ */

/* i quattro angoli di una casella, per il riquadro che la contiene */
const cellCorners = s => boxCorners({ x:s.x, y:s.y, w:s.w, h:s.h, rot:s.rot || 0 });

/* alive = quanti modelli dell'unita' sono ancora in piedi;
   attached = i personaggi che le si sono uniti;
   raw = lascia le caselle nel sistema in cui sono scritte invece di
   ricentrarle sull'ingombro vivo. Serve all'editor: li' si trascina e
   si RISCRIVE, e ricentrare a ogni disegno farebbe scivolare la
   formazione di qualche millimetro a ogni modifica. */
export function layout(u, { alive = null, attached = [], raw = false } = {}){
  const f = ensureFormation(u);
  const total = Math.max(1, u.models || 1);
  const live = clamp(alive == null ? total : alive, 0, total);
  const chars = (attached || []).filter(c => c && !c.dead);
  const empty = { slots: [], w: u.baseW, h: u.baseH, front: u.frontage || 1, ranks: 0, origin: { x:0, y:0 } };
  if (live <= 0 && !chars.length) return empty;

  const gone = fallenSet(u, live);
  const liveIdx = [];
  for (let i = 0; i < total; i++) if (!gone.has(i)) liveIdx.push(i);

  const cells = [];
  if (f.mode === "ranks"){
    const n = Math.max(1, live + chars.length);
    const grid = rankCells(u, n, f);
    const seat = new Map();
    for (const c of chars){
      let idx = (c.join && Number.isInteger(c.join.idx)) ? c.join.idx : defaultSeatIdx(u, n);
      idx = clamp(idx, 0, n - 1);
      let guard = 0;
      while (seat.has(idx) && guard++ < n) idx = (idx + 1) % n;
      seat.set(idx, c);
    }
    let m = 0;
    for (let i = 0; i < n; i++){
      const c = seat.get(i);
      if (c){
        cells.push({ ...grid[i], w:c.baseW, h:c.baseH, kind:"char",
                     uid:c.uid, catId:c.catId, name:c.name, idx:c.idx, cell:i });
        continue;
      }
      const mi = liveIdx[m++];
      if (mi === undefined) continue;
      cells.push({ ...grid[i], w:u.baseW, h:u.baseH, kind:"model",
                   uid:u.uid, catId:u.catId, name:u.name, i:mi, cell:i });
    }
  } else {
    const all = baseCells(u, total);
    for (const i of liveIdx)
      cells.push({ ...all[i], w:u.baseW, h:u.baseH, kind:"model",
                   uid:u.uid, catId:u.catId, name:u.name, i, cell:i });
    const frontY = cells.length ? Math.min(...cells.map(s => s.y)) : 0;
    for (const c of chars){
      const j = c.join || {};
      const seat = Number.isFinite(j.x)
        ? { x:j.x, y:j.y, rot:j.rot || 0 }
        : { x:0, y: frontY - (c.baseH + f.spacing) * 0.5, rot:0 };
      cells.push({ ...seat, w:c.baseW, h:c.baseH, kind:"char",
                   uid:c.uid, catId:c.catId, name:c.name, idx:c.idx });
    }
  }
  if (!cells.length) return empty;

  /* il riquadro che le contiene tutte, poi si ricentra: x,y
     dell'unita' restano il centro dell'ingombro vivo, come e' sempre
     stato, cosi' niente di quello che c'era prima cambia significato */
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of cells) for (const [px, py] of cellCorners(s)){
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (!raw) for (const s of cells){ s.x -= cx; s.y -= cy; }

  const front = f.mode === "ranks"
    ? Math.max(1, Math.min(u.frontage || 1, live + chars.length))
    : cells.length;
  return {
    slots: cells,
    w: Math.max(x1 - x0, 1), h: Math.max(y1 - y0, 1),
    front,
    ranks: f.mode === "ranks" ? Math.ceil((live + chars.length) / front) : 1,
    origin: { x: cx, y: cy },
  };
}

/* il rettangolo dell'unita' sul tavolo */
export const boxFromLayout = (u, lay) => ({ x:u.x, y:u.y, w:lay.w, h:lay.h, rot:u.rot || 0 });

/* i centri delle basi in coordinate del tavolo: servono a capire
   quanti modelli stanno dentro un bosco */
export function worldCells(u, lay){
  const a = (u.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return lay.slots.map(sl => ({
    ...sl,
    wx: u.x + sl.x * c - sl.y * s,
    wy: u.y + sl.x * s + sl.y * c,
    wrot: ((u.rot || 0) + (sl.rot || 0)) % 360,
  }));
}

/* ============================================================
   7 · CONTATTI DI BASETTA
   La domanda a cui un report deve saper rispondere e' «chi stava
   attaccato a chi, e da che lato»: e' li' che si decidono i
   combattimenti, e a memoria il giorno dopo non si ricostruisce.
   ============================================================ */
const TOUCH = MM * 0.12;          // poco piu' di un decimo di pollice

export function sideOf(pt, box){
  const [lx, ly] = toLocal(pt, box);
  const nx = Math.abs(lx) / Math.max(box.w / 2, 0.001);
  const ny = Math.abs(ly) / Math.max(box.h / 2, 0.001);
  if (ny >= nx) return ly < 0 ? "fronte" : "retro";
  return lx < 0 ? "fianco sinistro" : "fianco destro";
}

/* ============================================================
   7 bis · ARCHI DI VISUALE
   `sideOf` risponde alla domanda «da che lato mi ha toccato»: e' un
   punto contro un rettangolo, e serve a raccontare un contatto gia'
   avvenuto. L'arco e' la domanda di prima: «quel nemico sta davanti a
   me, di fianco o dietro», e vale su tutta la sagoma del nemico, non
   su un punto.
 
   I settori sono quelli del manuale: le diagonali della basetta
   prolungate all'infinito dal centro tagliano il tavolo in quattro
   spicchi. La prova e' la stessa che `sideOf` fa gia' — la coordinata
   locale divisa per la mezza misura del lato — e questo non e' un
   caso: e' la stessa geometria guardata dai due capi. Tenerle vicine
   e' l'unico modo perche' non divergano.
 
   Serve a tre cose che il piano mette nella stessa tappa: dichiarare
   una carica (si carica solo quello che si ha nell'arco frontale),
   contare il bonus di fianco e di retro a fine assalto, e sapere se
   il caricante e' arrivato da dietro.
   ============================================================ */

/* fronte / fianco / retro, senza distinguere destra e sinistra: e' la
   forma che serve alle regole, mentre `sideOf` tiene i due fianchi
   separati perche' al racconto di un contatto servono */
export const arcOfSide = side => side === "fronte" || side === "retro" ? side : "fianco";
export const arcOf = (pt, box) => arcOfSide(sideOf(pt, box));

/* Un poligono intero contro gli archi di una basetta. Torna gli archi
   che tocca — di solito uno, due quando sta a cavallo di una diagonale
   — e quello dominante, cioe' quello che prende piu' angoli. La
   dichiarazione di carica guarda `has`, il bonus di fine combattimento
   guarda `arc`. */
export function arcOfPoly(poly, box){
  const tally = { fronte:0, fianco:0, retro:0 };
  for (const p of poly) tally[arcOf(p, box)]++;
  /* il centro pesa doppio: un nemico largo che sfiora una diagonale con
     un angolo solo non e' «di fianco», sta ancora davanti */
  const c = arcOf(centroid(poly), box);
  tally[c] += poly.length;
  const has = Object.keys(tally).filter(k => tally[k] > 0);
  const arc = Object.keys(tally).reduce((a, b) => tally[b] > tally[a] ? b : a, "fronte");
  return { arc, has, tally, centre: c };
}
const centroid = poly => {
  const n = Math.max(1, poly.length);
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
};

/* L'arco fra due unita' gia' schierate: `boxOf` e' lo stesso che usa
   `contactList`. Torna dove sta B per A e dove sta A per B, perche'
   servono tutte e due — chi carica deve avere il bersaglio davanti,
   chi lo subisce prende il bonus dal lato da cui e' arrivato. */
export function arcBetween(a, b, boxOf){
  const ba = boxOf(a), bb = boxOf(b);
  return {
    bInA: arcOfPoly(boxCorners(bb), ba),
    aInB: arcOfPoly(boxCorners(ba), bb),
  };
}

/* Gli spicchi da disegnare sul tavolo: quattro triangoli che partono
   dagli angoli della basetta e si allontanano di `len`. Servono al
   ventaglio dell'arco frontale nel pannello di movimento, che oggi
   disegna la portata ma non il limite di visuale. */
export function arcSectors(box, len = 60){
  const c = boxCorners(box);          // orario dal fronte-sinistro
  const [x, y] = [box.x, box.y];
  const far = ([px, py]) => {
    const dx = px - x, dy = py - y, d = Math.hypot(dx, dy) || 1;
    return [x + dx / d * len, y + dy / d * len];
  };
  const wedge = (i, j) => [[x, y], far(c[i]), far(c[j])];
  /* boxCorners torna gli angoli in ordine: 0 fronte-sinistro,
     1 fronte-destro, 2 retro-destro, 3 retro-sinistro */
  return {
    fronte:          wedge(0, 1),
    "fianco destro": wedge(1, 2),
    retro:           wedge(2, 3),
    "fianco sinistro": wedge(3, 0),
  };
}

/* units: quelle sul tavolo; boxOf: come si ricava il rettangolo di
   ognuna (lo sa deploy.js, che tiene le formazioni aggiornate) */
export function contactList(units, boxOf){
  const P = units.filter(u => u.placed && !u.dead)
    .map(u => { const b = boxOf(u); return { u, b, poly: boxCorners(b) }; });
  const out = [];
  for (let i = 0; i < P.length; i++){
    for (let j = i + 1; j < P.length; j++){
      const d = polyDistance(P[i].poly, P[j].poly);
      if (d > TOUCH) continue;
      const cp = closestPoints(P[i].poly, P[j].poly);
      out.push({
        a: P[i].u.uid, b: P[j].u.uid,
        aName: P[i].u.name, bName: P[j].u.name,
        aArmy: P[i].u.army, bArmy: P[j].u.army,
        aSide: sideOf(cp.a, P[i].b), bSide: sideOf(cp.b, P[j].b),
        enemy: P[i].u.army !== P[j].u.army,
        gap: r1(inch(d)),
      });
    }
  }
  return out;
}

/* ============================================================
   8 · TERRENO SOTTO LE UNITA'
   ============================================================ */
export function terrainBox(t){
  const cfg = TERRAIN[t.kind] || {};
  return {
    x: t.x, y: t.y,
    w: (t.w ?? cfg.w ?? 1) * MM,
    h: (t.h ?? cfg.h ?? 1) * MM,
    rot: t.rot || 0,
  };
}
const isRound = t => {
  const cfg = TERRAIN[t.kind];
  return !!cfg && (cfg.shape === "circle" || cfg.shape === "token");
};
function inPiece(pt, t){
  const b = terrainBox(t);
  const [lx, ly] = toLocal(pt, b);
  if (isRound(t)) return Math.hypot(lx, ly) <= b.w / 2;
  return Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2;
}

/* Quanto dell'unita' sta su ogni elemento scenico, contato in modelli:
   «8 skink su 12 nel bosco» dice piu' di una percentuale, ed e' quello
   che si vede guardando il tavolo. */
export function terrainUnder(cells, terrain){
  const out = [];
  const pts = (cells || []).map(c => [c.wx, c.wy]);
  if (!pts.length) return out;
  for (const t of terrain || []){
    const cfg = TERRAIN[t.kind];
    if (!cfg) continue;
    let n = 0;
    for (const p of pts) if (inPiece(p, t)) n++;
    if (!n) continue;
    out.push({
      tid: t.tid, kind: t.kind, label: cfg.label,
      pass: cfg.pass, los: !!cfg.los,
      models: n, of: pts.length,
      how: n === pts.length ? "dentro" : "in parte",
    });
  }
  return out.sort((a, b) => b.models - a.models);
}

/* la fotografia del terreno, da mettere in ogni turno: gli elementi si
   spostano anche a partita cominciata (un muretto tolto, un pezzo
   rimesso dritto) e il report deve dire dov'erano allora */
export function terrainSnapshot(terrain){
  return (terrain || []).map(t => {
    const cfg = TERRAIN[t.kind] || {};
    return {
      tid: t.tid, kind: t.kind, label: cfg.label || t.kind,
      pass: cfg.pass || "", los: !!cfg.los,
      x: r1(inch(t.x)), y: r1(inch(t.y)),
      w: r1(t.w ?? cfg.w ?? 0), h: r1(t.h ?? cfg.h ?? 0),
      rot: Math.round(t.rot || 0),
    };
  });
}
