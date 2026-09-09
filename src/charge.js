/* Schieramento Old World — la carica: dichiararla, arrivarci, tornare indietro
 *
 * La Tappa 2 del piano. Il motore della Tappa 1 sapeva *quando* una
 * carica si dichiara — la quinta delle sedici caselle — ma non sapeva
 * niente di quello che al tavolo si guarda prima di dichiararla: se il
 * bersaglio sta davanti, se lo si vede, se ci si arriva. Le tre
 * domande hanno una risposta geometrica sola, e il tavolo aveva gia'
 * tutti i pezzi per darla: le distanze misurate dal bordo, gli archi
 * di visuale, il terreno con la sua categoria. Mancava il posto in cui
 * metterli insieme.
 *
 * Qui dentro ci sono cinque cose, nell'ordine in cui succedono:
 *
 *   la DICHIARAZIONE (p. 119) — arco frontale, linea di vista,
 *   distanza massima, e il divieto di dichiarare una carica che non
 *   puo' riuscire;
 *
 *   le REAZIONI (p. 120) — tenere, tirare e tenere, fuggire, con la
 *   regola che il *tira e tieni* non si puo' scegliere quando il
 *   caricante e' gia' piu' vicino del proprio Movimento;
 *
 *   il TIRO DI CARICA — due dadi, tre scartando il minore con il passo
 *   lungo, e il dado peggiore quando si attraversa il difficile;
 *
 *   l'ALLINEAMENTO e la RUOTA (§5.2 e §5.3 del piano) — portare il
 *   caricante a filo della faccia da cui e' arrivato, e sapere quanto
 *   e' costato girarsi;
 *
 *   i MOVIMENTI ALL'INDIETRO (pp. 154-155) — fuga, cedimento,
 *   ripiegamento e inseguimento sono la stessa geometria: una
 *   direzione lontano dal nemico piu' forte, e dei pollici da fare.
 *
 * Piu' la regola del pollice (p. 118), che non e' una fase ma un
 * vincolo di piazzamento e vale dappertutto.
 *
 * Niente DOM, niente stato, e nessun dado tirato: entrano scatole e
 * poligoni, escono numeri e posizioni. Chi tira e' il vassoio, chi
 * scrive e' il motore, chi decide e' chi gioca — l'app propone.
 */

import { MM, inch } from './util.js';
import { boxCorners, polyDistance, closestPoints } from './geom.js';
import { arcOfPoly } from './formation.js';
import { sightBlocked, frontCenter } from './tactics.js';

const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const cornersOf = o => (o && o.poly) || boxCorners(o.box || o);
const nameOf = o => (o && (o.name || (o.unit && o.unit.name))) || "";

/* ============================================================
   0 · LE COSTANTI CHE IL MANUALE SCRIVE IN CHIARO
   Stanno qui in cima e non sparse nel codice, perche' sono i numeri
   che si controllano con il libro aperto e sono gli unici di questo
   file che vengono da fuori.
   ============================================================ */
export const ONE_INCH = MM;          // p. 118: nessuno finisce entro 1" da un nemico
export const MAX_CHARGE_ROLL = 12;   // due dadi al massimo fanno 12
export const GIVE_GROUND = 2;        // p. 154: il cedimento e' di due pollici

/* Le tre mosse all'indietro, con la pagina e — dove il piano non lo
   dice — la dichiarazione che il numero va confrontato con il libro.
   E' la regola del §1: mai un numero senza dire da dove viene. */
export const BACKWARD = {
  flee:     { id:"flee",     label:"Fuga",             dice:"2D6", page:154 },
  give:     { id:"give",     label:"Cede terreno",     fixed:GIVE_GROUND, page:154 },
  fallBack: { id:"fallBack", label:"Ripiega in ordine", dice:"2D6", page:154,
              daVerificare:true,
              nota:"quanti dadi fa il ripiegamento va confrontato con il libro (p. 154)" },
  pursue:   { id:"pursue",   label:"Inseguimento",     dice:"2D6", page:155 },
};

/* ============================================================
   1 · FIN DOVE ARRIVA UNA CARICA
   Il massimo e' Movimento piu' dodici, e vale anche per il passo
   lungo: tre dadi scartando il minore non fanno mai piu' di dodici,
   fanno solo dodici piu' spesso. La differenza sta nella media — mezzo
   pollice — e mezzo pollice al tavolo e' una carica che arriva.
   ============================================================ */
export function chargeBands(move, swift = false){
  const m = +move || 0;
  return { move:m, avg: r1(m + (swift ? 8.46 : 7)), max: m + MAX_CHARGE_ROLL, swift:!!swift };
}

/* La probabilita' esatta di coprire `need` pollici con il tiro di
   carica: si enumerano le facce, non si stima. Serve a scrivere «ti
   serve un 8: sono due volte su cinque», che e' l'informazione per cui
   uno apre l'app invece del manuale. */
export function chargeChance(need, swift = false){
  if (need <= 0) return 1;
  if (need > MAX_CHARGE_ROLL) return 0;
  const n = swift ? 3 : 2;
  let good = 0, all = 0;
  const walk = (left, dice) => {
    if (!left){
      all++;
      const kept = [...dice].sort((a, b) => b - a).slice(0, 2);
      if (kept[0] + kept[1] >= need) good++;
      return;
    }
    for (let f = 1; f <= 6; f++) walk(left - 1, [...dice, f]);
  };
  walk(n, []);
  return good / all;
}

/* ============================================================
   2 · LA DICHIARAZIONE (p. 119)
   Tre controlli e un divieto. I tre controlli sono arco frontale,
   linea di vista e distanza; il divieto e' che una carica che non puo'
   riuscire non si dichiara — ed e' l'unico punto di questo file in cui
   il manuale dice davvero «no».
 
   Anche qui pero' l'app non impedisce: torna `can:false` con il
   perche' scritto, e chi gioca sa cosa sta facendo. La differenza fra
   «non puoi» e «guarda che sono quattordici pollici» e' tutta la
   differenza fra un arbitro e un aiuto.
   ============================================================ */
export function declareCharge({ charger, target, pieces = [] } = {}){
  if (!charger || !target || !charger.box || !target.box) return null;
  const bA = charger.box, pA = cornersOf(charger);
  const bB = target.box, pB = cornersOf(target);

  const dist = inch(polyDistance(pA, pB));
  const bands = chargeBands(charger.move, charger.swift);
  const arc = arcOfPoly(pB, bA);
  const inArc = arc.has.includes("fronte");

  /* La vista parte dal centro del fronte, come per il tiro: e' il
     punto da cui l'unita' guarda, e usarne un altro vorrebbe dire
     avere due linee di vista diverse nella stessa app. */
  const eye = frontCenter(bA);
  const aim = closestPoints([eye], pB).b;
  const blocker = charger.fly ? null : sightBlocked(eye, aim, pieces.filter(p => p.blocks));

  const need = Math.max(0, r1(dist - bands.move));
  const chance = need > MAX_CHARGE_ROLL ? 0 : chargeChance(need, charger.swift);
  const impossible = dist > bands.max + 0.01;

  const reasons = [];
  if (!inArc) reasons.push({ id:"arc", text:"il bersaglio non è nell'arco frontale: sta di " + arc.arc });
  if (blocker) reasons.push({ id:"sight", text:"la vista è tagliata da " + (blocker.label || "un elemento scenico").toLowerCase() });
  if (impossible) reasons.push({ id:"far",
    text:"sono " + r1(dist) + "″ e la carica arriva al massimo a " + bands.max + "″ (p. 119)" });

  return {
    charger: nameOf(charger), target: nameOf(target),
    dist: r1(dist), arc: arc.arc, inArc,
    blocked: !!blocker, blockedBy: blocker ? blocker.label : "",
    move: bands.move, max: bands.max, avg: bands.avg, swift: bands.swift,
    need, chance: r2(chance), impossible,
    can: inArc && !blocker && !impossible,
    reasons,
    /* la riga da mettere nel registro, gia' scritta: il motore ci
       aggiunge turno e casella */
    why: reasons.length ? reasons.map(r => r.text).join("; ")
       : "a " + r1(dist) + "″, serve " + (need ? need + "″ di tiro" : "solo muoversi"),
  };
}

/* La carica che ci si trova addosso senza averla dichiarata: al tavolo
   e' l'errore piu' comune del movimento, perche' un caricante largo
   arriva a toccare anche il vicino del bersaglio. Torna le unita' che
   il caricante finirebbe per toccare arrivando li' — vanno dichiarate
   anche loro. */
export function alsoInTheWay(placedPoly, others = [], exclude = null){
  const out = [];
  for (const o of others){
    if (!o || o === exclude || (exclude && nameOf(o) === nameOf(exclude))) continue;
    const d = polyDistance(placedPoly, cornersOf(o));
    if (d <= ONE_INCH + 0.01) out.push({ unit: o, name: nameOf(o), gap: r1(inch(d)) });
  }
  return out.sort((a, b) => a.gap - b.gap);
}

/* ============================================================
   3 · LE REAZIONI (p. 120)
   Tre, e due hanno una condizione. Il *tira e tieni* non si puo'
   scegliere quando il caricante parte gia' piu' vicino del proprio
   Movimento: e' addosso prima che l'arco sia teso. Fuggire non lo puo'
   fare chi e' gia' impegnato in un combattimento, perche' non ha da
   che parte andare.
   ============================================================ */
export function reactions({ dist = 0, chargerMove = 0, shots = 0,
                            engaged = false, fleeing = false } = {}){
  const tooNear = dist < chargerMove;
  const list = [
    { id:"hold", label:"Tiene la posizione", can:true, why:"" },
    { id:"shoot", label:"Tira e tiene",
      can: shots > 0 && !engaged && !tooNear,
      why: shots <= 0 ? "non ha niente da tirare"
         : engaged ? "è già in combattimento"
         : tooNear ? "il caricante è a " + r1(dist) + "″, meno del suo Movimento (" + chargerMove + "″)"
         : "" },
    { id:"flee", label:"Fugge",
      can: !engaged && !fleeing,
      why: engaged ? "è già in combattimento" : fleeing ? "sta già fuggendo" : "" },
  ];
  return list;
}

/* ============================================================
   4 · IL TIRO DI CARICA E IL TERRENO
   Il passo lungo aggiunge un dado e butta il minore. Il terreno
   difficile fa tenere il *peggiore*: il piano lo dice cosi' e non dice
   con quanti dadi, e questo file non lo inventa — aggiunge un dado e
   scarta il maggiore, che e' la lettura simmetrica al passo lungo, e
   lo dichiara con `daVerificare` perche' chi ha il libro aperto lo
   corregga cambiando una riga.
   ============================================================ */
export function chargeDice({ swift = false, worst = false } = {}){
  const n = 2 + (swift ? 1 : 0) + (worst ? 1 : 0);
  const spec = {
    n, keep: 2,
    drop: worst && !swift ? "highest" : swift && !worst ? "lowest" : worst && swift ? "both" : null,
    swift: !!swift, worst: !!worst,
    daVerificare: !!worst,
    why: worst && swift ? "passo lungo nel terreno difficile: si butta il migliore e il peggiore"
       : worst ? "terreno difficile: si tiene il dado peggiore (p. 270)"
       : swift ? "passo lungo: tre dadi, si butta il minore"
       : "due dadi",
  };
  return spec;
}

/* Quali facce restano, dato quello che e' uscito. Il motore chiede i
   dadi al vassoio e passa di qui per sapere quali contano: cosi' la
   regola del dado peggiore si scrive una volta sola. */
export function keepDice(dice, spec){
  const s = [...(dice || [])].sort((a, b) => a - b);
  if (s.length <= 2) return s;
  if (spec.drop === "highest") return s.slice(0, 2);
  if (spec.drop === "both")    return s.slice(1, -1).slice(0, 2);
  return s.slice(-2);
}

export function chargeOutcome({ dice = [], spec = null, move = 0, dist = 0 } = {}){
  const kept = keepDice(dice, spec || chargeDice({}));
  const total = kept.reduce((s, v) => s + v, 0);
  const reach = (+move || 0) + total;
  return {
    dice: [...dice], kept, total, reach: r1(reach),
    made: reach + 0.01 >= dist,
    short: r1(Math.max(0, dist - reach)),
  };
}

/* ============================================================
   5 · IL TERRENO ATTRAVERSATO
   Il percorso di una carica e' un segmento, e quello che conta e' che
   cosa ci sta in mezzo. I pezzi arrivano nella forma che il tavolo usa
   gia' per il ventaglio di movimento e per il campo di tiro — box,
   poligono, `contains` — con in piu' la categoria del §8 del piano,
   che e' quella che decide tutto il resto.
   ============================================================ */
export function crossed(from, to, pieces = [], samples = 24){
  const hit = [];
  for (const p of pieces){
    if (!p || typeof p.contains !== "function") continue;
    for (let i = 0; i <= samples; i++){
      const t = i / samples;
      const pt = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
      if (p.contains(pt)){ hit.push(p); break; }
    }
  }
  return hit;
}

/* Cosa fa al caricante quello che ha attraversato. Le quattro colonne
   sono quelle di `terrain.js`: rallenta, fa tenere il dado peggiore,
   chiede il test di terreno pericoloso, toglie i ranghi. */
export function terrainEffect(list = []){
  const out = { slow:false, worstDie:false, danger:false, disorder:false, why:[], pieces:[] };
  for (const p of list){
    const c = p.cat || {};
    out.pieces.push(p.label || p.kind || "");
    if (c.slow)     out.slow = true;
    if (c.worstDie) out.worstDie = true;
    if (c.danger)   out.danger = true;
    if (c.disorder) out.disorder = true;
    if (c.slow || c.worstDie || c.danger || c.disorder)
      out.why.push((p.label || p.kind || "terreno") + ": " + (c.label || "").toLowerCase());
  }
  return out;
}

/* La carica disordinata (p. 270): chi arriva attraverso il difficile,
   scavalcando un ostacolo o girando attorno all'impassabile combatte
   senza i ranghi. Non e' un divieto — la carica si fa lo stesso — e'
   una riga che il registro deve portarsi dietro fino al risultato del
   combattimento, dove pesa. */
export function disorderedCharge(list = []){
  const eff = terrainEffect(list);
  return {
    disordered: eff.disorder,
    why: eff.why,
    text: eff.disorder ? "carica disordinata: " + eff.why.join(", ") + " (p. 270)" : "",
  };
}

/* ============================================================
   6 · L'ALLINEAMENTO E LA RUOTA
   Il caricante non si ferma dove capita: arriva a contatto e si mette
   a filo della faccia da cui e' venuto. La geometria e' quella
   dell'aggancio che il trascinamento fa gia' sul tavolo, tirata fuori
   di li' perche' adesso serve anche senza dito sullo schermo — il
   motore deve poter dire dove finirebbe un pezzo *prima* che qualcuno
   lo muova.
 
   La faccia non e' la piu' vicina: e' quella che guarda il caricante.
   Sono due cose diverse quando il bersaglio e' molto lungo, e sbagliare
   qui vuol dire far arrivare di fianco una carica frontale.
   ============================================================ */
export function alignTo(chargerBox, targetBox, { slide = true } = {}){
  const b = targetBox;
  const a = (b.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const uw = chargerBox.w, uh = chargerBox.h;

  /* le quattro facce con la normale che esce, in coordinate locali */
  const faces = [
    { n:[0, -1], off:b.h / 2, len:b.w, side:"fronte" },
    { n:[0,  1], off:b.h / 2, len:b.w, side:"retro" },
    { n:[-1, 0], off:b.w / 2, len:b.h, side:"fianco sinistro" },
    { n:[1,  0], off:b.w / 2, len:b.h, side:"fianco destro" },
  ];

  /* da che parte sta il caricante, visto dal bersaglio */
  const vx = chargerBox.x - b.x, vy = chargerBox.y - b.y;

  let best = null;
  for (const f of faces){
    const nx = f.n[0] * ca - f.n[1] * sa, ny = f.n[0] * sa + f.n[1] * ca;
    const facing = nx * vx + ny * vy;             // positivo: la faccia guarda il caricante
    const cx = b.x + nx * (f.off + uh / 2), cy = b.y + ny * (f.off + uh / 2);
    const tx = -ny, ty = nx;
    const lim = slide ? Math.max(0, (f.len + uw) / 2 - MM / 4) : 0;
    let t = (chargerBox.x - cx) * tx + (chargerBox.y - cy) * ty;
    t = Math.max(-lim, Math.min(lim, t));
    const px = cx + tx * t, py = cy + ty * t;
    /* il fronte del caricante guarda dentro la faccia: il fronte
       locale e' -y, quindi la rotazione e' questa */
    const rot = ((Math.round(Math.atan2(-nx, ny) * 180 / Math.PI) % 360) + 360) % 360;
    const cand = { x:px, y:py, rot, side:f.side, facing };
    if (!best || cand.facing > best.facing) best = cand;
  }
  if (!best) return null;

  const from = { x: chargerBox.x, y: chargerBox.y, rot: ((chargerBox.rot || 0) % 360 + 360) % 360 };
  const wheel = degDiff(from.rot, best.rot);
  return {
    x: r2(best.x), y: r2(best.y), rot: best.rot,
    side: best.side, arc: best.side === "fronte" || best.side === "retro" ? best.side : "fianco",
    wheel,
    wheelCost: r1(wheelCost(uw, wheel)),
    travel: r1(inch(Math.hypot(best.x - from.x, best.y - from.y))),
  };
}

const degDiff = (a, b) => {
  const d = Math.abs(((a || 0) - (b || 0)) % 360);
  return Math.round(d > 180 ? 360 - d : d);
};

/* Quanto costa girarsi. La ruota fa perno su uno spigolo di fronte:
   lo spigolo esterno percorre un arco di raggio pari al fronte
   dell'unita', ed e' quell'arco che si paga in pollici. Un reggimento
   largo gira caro, ed e' la ragione per cui al tavolo le colonne
   ruotano e le linee no. */
export function wheelCost(widthMm, deg){
  return inch((+widthMm || 0) * Math.abs(deg || 0) * Math.PI / 180);
}

/* ============================================================
   7 · LA REGOLA DEL POLLICE (p. 118)
   Nessuna unita' finisce il movimento entro un pollice da un nemico,
   se non ci va a contatto. Al tavolo e' una misura che si dimentica
   sempre, e in un'app e' due righe: chi e' troppo vicino, e di quanto
   bisogna tirarsi indietro.
   ============================================================ */
export function tooClose(poly, enemies = [], { contactOk = null } = {}){
  const out = [];
  for (const e of enemies){
    if (contactOk && (e === contactOk || nameOf(e) === nameOf(contactOk))) continue;
    const d = polyDistance(poly, cornersOf(e));
    if (d > 0.01 && d < ONE_INCH - 0.01)
      out.push({ unit: e, name: nameOf(e), gap: r1(inch(d)), need: r1(1 - inch(d)) });
  }
  return out.sort((a, b) => a.gap - b.gap);
}

/* Lo scostamento minimo: si torna indietro lungo la direzione da cui
   si e' arrivati fino a stare a un pollice buono. Non e' una regola,
   e' il gesto che si fa con le dita — e farlo fare all'app toglie la
   discussione su chi era piu' vicino. */
export function nudgeClear(place, chargerBox, enemies = [], { step = MM / 8, tries = 40 } = {}){
  let { x, y } = place;
  const rot = place.rot != null ? place.rot : chargerBox.rot || 0;
  const polyAt = (px, py) => boxCorners({ x:px, y:py, w:chargerBox.w, h:chargerBox.h, rot });
  let bad = tooClose(polyAt(x, y), enemies);
  if (!bad.length) return { x:r2(x), y:r2(y), rot, moved:0, ok:true };

  /* la direzione in cui tirarsi indietro e' quella che allontana dal
     piu' vicino */
  let moved = 0;
  for (let i = 0; i < tries && bad.length; i++){
    const near = bad[0];
    const cp = closestPoints(polyAt(x, y), cornersOf(near.unit));
    const dx = cp.a[0] - cp.b[0], dy = cp.a[1] - cp.b[1];
    const len = Math.hypot(dx, dy) || 1;
    x += dx / len * step; y += dy / len * step; moved += step;
    bad = tooClose(polyAt(x, y), enemies);
  }
  return { x:r2(x), y:r2(y), rot, moved: r1(inch(moved)), ok: !bad.length };
}

/* ============================================================
   8 · I MOVIMENTI ALL'INDIETRO (pp. 154-155)
   Fuga, cedimento, ripiegamento e inseguimento sono la stessa cosa
   vista quattro volte: una direzione e dei pollici. La direzione e'
   la parte che al tavolo si sbaglia — «direttamente lontano dal
   nemico» quando il nemico e' uno, «in diagonale» quando sono due — e
   il manuale la lega alla Forza d'Unita': si scappa dal piu' grosso.
   ============================================================ */
export function awayFrom(box, enemies = []){
  const list = (enemies || []).filter(e => e && (e.box || e.poly));
  if (!list.length) return null;

  /* il piu' forte comanda la direzione; a pari Forza d'Unita' contano
     tutti e la direzione e' la loro media, che e' la diagonale del
     manuale */
  const strongest = list.reduce((m, e) => Math.max(m, +e.us || 0), 0);
  const drivers = list.filter(e => (+e.us || 0) === strongest);
  let dx = 0, dy = 0;
  for (const e of drivers){
    const c = e.box ? [e.box.x, e.box.y] : centre(cornersOf(e));
    const vx = box.x - c[0], vy = box.y - c[1];
    const len = Math.hypot(vx, vy) || 1;
    dx += vx / len; dy += vy / len;
  }
  const len = Math.hypot(dx, dy) || 1;
  return {
    dir: [dx / len, dy / len],
    deg: Math.round(Math.atan2(dy, dx) * 180 / Math.PI),
    from: drivers.map(nameOf).filter(Boolean),
    us: strongest,
    diagonal: drivers.length > 1,
  };
}

const centre = poly => {
  const n = Math.max(1, poly.length);
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
};

/* Il pezzo spostato indietro di N pollici in quella direzione. Chi
   fugge gira le spalle — il fronte guarda dove sta andando — chi cede
   terreno e chi ripiega resta girato verso il nemico, che e' la
   differenza fra le tre cose e l'unica ragione per cui il manuale le
   distingue. */
export function backAway(box, dir, inches, { turn = false } = {}){
  const d = dir && dir.dir ? dir.dir : dir;
  if (!d) return null;
  const mm = (+inches || 0) * MM;
  /* il fronte locale e' -y: per guardare dove si sta andando la
     rotazione e' questa, ed e' la stessa formula dell'allineamento
     guardata dall'altra parte */
  const rot = turn
    ? ((Math.round(Math.atan2(d[0], -d[1]) * 180 / Math.PI) % 360) + 360) % 360
    : ((box.rot || 0) % 360 + 360) % 360;
  return { x: r2(box.x + d[0] * mm), y: r2(box.y + d[1] * mm), rot, inches: r1(+inches || 0) };
}

/* Le quattro mosse con il loro nome, i loro pollici e la loro pagina.
   `roll` e' quello che il vassoio ha tirato (nullo per il cedimento,
   che e' fisso). */
export function backwardMove(kind, box, enemies, { roll = 0, mod = 0 } = {}){
  const spec = BACKWARD[kind];
  if (!spec) return null;
  const dir = awayFrom(box, enemies);
  if (!dir) return null;
  const inches = spec.fixed != null ? spec.fixed : Math.max(2, (+roll || 0) + (+mod || 0));
  const to = backAway(box, dir, inches, { turn: kind === "flee" });
  return {
    kind, label: spec.label, page: spec.page,
    daVerificare: !!spec.daVerificare, nota: spec.nota || "",
    dir, inches, to,
    text: spec.label.toLowerCase() + " di " + r1(inches) + "″" +
          (dir.from.length ? " lontano da " + dir.from.join(" e ") : "") +
          (dir.diagonal ? ", in diagonale fra i due" : ""),
  };
}

/* L'inseguimento e' l'unico che va *verso*: stessa direzione, segno
   opposto. Chi insegue si porta dietro il fronte, perche' sta ancora
   andando addosso a qualcuno. */
export function pursuitMove(box, fled, { roll = 0 } = {}){
  const dir = awayFrom(box, [fled]);
  if (!dir) return null;
  const back = [-dir.dir[0], -dir.dir[1]];
  const inches = Math.max(2, +roll || 0);
  return {
    kind:"pursue", label: BACKWARD.pursue.label, page: BACKWARD.pursue.page,
    dir: { ...dir, dir: back }, inches,
    to: backAway(box, back, inches, { turn:true }),
    text: "insegue per " + r1(inches) + "″" + (nameOf(fled) ? " " + nameOf(fled) : ""),
  };
}

/* ============================================================
   9 · LA RIGA CHE SI LEGGE PRIMA DI DICHIARARE
   Tutto quello che sta sopra, per ogni nemico sul tavolo, ordinato
   come si guarda: prima quelli che si possono caricare, poi i piu'
   vicini. E' la stessa forma di `shootingSurvey`, e non e' un caso —
   la domanda e' la stessa cambiata di fase.
   ============================================================ */
export function chargeSurvey(charger, targets = [], { pieces = [] } = {}){
  const rows = [];
  for (const t of targets){
    const d = declareCharge({ charger, target: t, pieces });
    if (!d) continue;
    const eye = frontCenter(charger.box);
    const aim = closestPoints([eye], cornersOf(t)).b;
    const list = crossed(eye, aim, pieces);
    const eff = terrainEffect(list);
    rows.push({
      ...d, unit: t,
      terrain: eff,
      dice: chargeDice({ swift: charger.swift, worst: eff.worstDie }),
      align: alignTo(charger.box, t.box),
    });
  }
  return rows.sort((a, b) => (b.can - a.can) || (a.dist - b.dist));
}
