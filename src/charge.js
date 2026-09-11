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
/* Il tiro di carica non e' la somma di due dadi: se ne tirano due, si
   scarta il minore, e il dado che resta — uno solo, da 1 a 6 — si
   somma al Movimento (p. 121). La portata massima e' quindi M + 6.
   Il passo lungo (p. 178) aggiunge un D6 al risultato e 3 pollici alla
   portata massima. Vedi il §2 del piano: l'app sommava i due dadi, che
   e' la regola del Warhammer di prima, e prometteva a una fanteria da
   4 una carica da sedici pollici dove il manuale ne concede dieci. */
export const MAX_CHARGE_ROLL = 6;    // il maggiore di due D6
export const SWIFT_BONUS = 3;        // p. 178: quanto alza la portata massima
export const GIVE_GROUND = 2;        // p. 134: il cedimento e' di due pollici

/* Le tre mosse all'indietro, con la pagina. Il ripiegamento in ordine
   non e' piu' da verificare: il manuale lo scrive in chiaro a p. 134 —
   due D6 scartando il minore, e chi ripiega si raduna da solo a fine
   movimento. Chi ha il passo lungo aggiunge un D6 anche qui. */
export const BACKWARD = {
  flee:     { id:"flee",     label:"Fuga",              dice:"2D6", page:132 },
  give:     { id:"give",     label:"Cede terreno",      fixed:GIVE_GROUND, page:134 },
  fallBack: { id:"fallBack", label:"Ripiega in ordine", dice:"2D6, si tiene il maggiore", page:134,
              keepBest:true,
              nota:"ripiegando in ordine si tiene il dado maggiore, e l'unita' si raduna da sola a fine movimento (p. 134)" },
  pursue:   { id:"pursue",   label:"Inseguimento",      dice:"2D6", page:156 },
};

/* ============================================================
   1 · FIN DOVE ARRIVA UNA CARICA
   Media e massimo, e sono due numeri diversi da quelli che l'app
   scriveva fino alla correzione del §2. La media del maggiore di due
   D6 e' 161/36, cioe' 4,47; quella del minore — il caso del terreno
   difficile — e' 91/36, cioe' 2,53.
   ============================================================ */
export function chargeBands(move, swift = false, worst = false){
  const m = Math.max(1, (+move || 0) - (worst ? 1 : 0));
  const avg = worst ? 91 / 36 : 161 / 36;
  return {
    move: m, base: +move || 0, worst: !!worst, swift: !!swift,
    avg: r1(m + avg + (swift ? 3.5 : 0)),
    max: m + MAX_CHARGE_ROLL + (swift ? SWIFT_BONUS : 0),
  };
}

/* La probabilita' esatta di coprire `need` pollici con il tiro di
   carica: si enumerano le facce, non si stima. Serve a scrivere «ti
   serve un 8: sono due volte su cinque», che e' l'informazione per cui
   uno apre l'app invece del manuale.

   `need` sono i pollici che il TIRO deve fare, cioe' la distanza meno
   il Movimento. Il conto e' sul maggiore di due D6 — sul minore quando
   si passa nel difficile — piu' il dado del passo lungo. */
export function chargeChance(need, swift = false, worst = false){
  if (need <= 0) return 1;
  const cap = MAX_CHARGE_ROLL + (swift ? 6 : 0);
  if (need > cap) return 0;
  let good = 0, all = 0;
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++){
      const kept = worst ? Math.min(a, b) : Math.max(a, b);
      if (!swift){ all++; if (kept >= need) good++; continue; }
      for (let c = 1; c <= 6; c++){ all++; if (kept + c >= need) good++; }
    }
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
export function declareCharge({ charger, target, pieces = [], worst = false } = {}){
  if (!charger || !target || !charger.box || !target.box) return null;
  const bA = charger.box, pA = cornersOf(charger);
  const bB = target.box, pB = cornersOf(target);

  const dist = inch(polyDistance(pA, pB));
  /* il terreno entra qui e non dopo: toglie un pollice al Movimento e
     rovescia il dado, quindi cambia sia la portata massima — che e' il
     numero con cui si decide se la carica si puo' dichiarare — sia la
     probabilita' che arrivi */
  const bands = chargeBands(charger.move, charger.swift, worst);
  const arc = arcOfPoly(pB, bA);
  const inArc = arc.has.includes("fronte");

  /* La vista parte dal centro del fronte, come per il tiro: e' il
     punto da cui l'unita' guarda, e usarne un altro vorrebbe dire
     avere due linee di vista diverse nella stessa app. */
  const eye = frontCenter(bA);
  const aim = closestPoints([eye], pB).b;
  const blocker = charger.fly ? null : sightBlocked(eye, aim, pieces.filter(p => p.blocks));

  const need = Math.max(0, r1(dist - bands.move));
  const chance = chargeChance(need, charger.swift, worst);
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
    move: bands.move, base: bands.base, max: bands.max, avg: bands.avg, swift: bands.swift,
    worst: !!worst, penalty: worst ? 1 : 0,
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
   Due dadi, si tiene il MAGGIORE (p. 121). Il terreno difficile
   rovescia la regola invece di cambiarla: stessi due dadi, si tiene il
   peggiore, e in piu' c'e' −1 al Movimento (p. 128). Il passo lungo
   aggiunge un D6 intero al risultato (p. 178) — un dado che si somma,
   non un dado da scartare, e nel vassoio i due gesti non si devono
   confondere: per questo il terzo cubo non entra nella scelta.
   ============================================================ */
export function chargeDice({ swift = false, worst = false } = {}){
  return {
    n: 2 + (swift ? 1 : 0),
    keep: swift ? 2 : 1,
    drop: worst ? "highest" : "lowest",
    swift: !!swift, worst: !!worst,
    why: worst && swift ? "nel terreno difficile si tiene il peggiore, piu' il D6 del passo lungo"
       : worst ? "terreno difficile: dei due dadi si tiene il peggiore (p. 128)"
       : swift ? "due dadi, si tiene il maggiore, piu' il D6 del passo lungo (p. 178)"
       : "due dadi, si tiene il maggiore (p. 121)",
    foot: worst
      ? "Dei primi due si tiene il peggiore" + (swift ? ", e il terzo si somma." : ".")
      : swift ? "Dei primi due si tiene il maggiore, e il terzo si somma."
              : "Se ne tiene uno, scartando il minore.",
  };
}

/* Quali facce contano, dato quello che e' uscito. I primi due cubi
   sono il tiro di carica e uno dei due si butta; il terzo, quando c'e',
   e' il dado del passo lungo e si somma sempre. Il motore e il vassoio
   passano tutti e due di qui, cosi' la regola sta scritta in un posto
   solo e non puo' divergere. */
export function keepDice(dice, spec = {}){
  const d = (dice || []).map(v => +v || 0);
  if (d.length < 2) return d;
  const pair = [d[0], d[1]];
  const kept = [spec.worst ? Math.min(...pair) : Math.max(...pair)];
  if (spec.swift && d.length > 2) kept.push(d[2]);
  return kept;
}

/* Il dado buttato via, che il registro deve far vedere: un tiro che
   dice «5» senza dire che l'altro era un 2 non si controlla a occhio. */
export const droppedDie = (dice, spec = {}) => {
  const d = (dice || []).map(v => +v || 0);
  if (d.length < 2) return null;
  return spec.worst ? Math.max(d[0], d[1]) : Math.min(d[0], d[1]);
};

export function chargeOutcome({ dice = [], spec = null, move = 0, dist = 0 } = {}){
  const s = spec || chargeDice({});
  const kept = keepDice(dice, s);
  const total = kept.reduce((a, v) => a + v, 0);
  /* il terreno difficile toglie un pollice al Movimento, e non scende
     mai sotto uno (p. 128) */
  const m = Math.max(1, (+move || 0) - (s.worst ? 1 : 0));
  const reach = m + total;
  return {
    dice: [...dice], kept, dropped: droppedDie(dice, s), total,
    move: m, penalty: s.worst ? 1 : 0,
    reach: r1(reach),
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

/* La carica DISORDINATA e il disordine da TERRENO sono due regole
   diverse che stanno sulla stessa pagina (p. 128), e confonderle costa
   il bonus sbagliato al momento sbagliato.

   *Carica disordinata*: il caricante arriva a contatto ma non riesce
   ad allinearsi perche' qualcosa e' in mezzo, e allora e' il bersaglio
   ad allinearsi a lui. Costa il **bonus di Iniziativa** della carica
   (p. 146). Non c'entra niente con l'aver attraversato un bosco.

   *Disordinata per il terreno* (`Disrupted`): l'unita' finisce il
   movimento con un quarto o piu' dei modelli nel terreno difficile, o
   a cavallo di un ostacolo basso. Costa il **bonus dei ranghi**
   (p. 101). Attraversare il bosco senza fermarcisi dentro non la
   provoca: quello che conta e' dove si finisce. */
export function disorderedCharge({ aligned = true, madeThemAlign = false, blockedBy = [] } = {}){
  const why = [];
  if (!aligned)      why.push("non riesce ad allinearsi" +
                              (blockedBy.length ? ": " + blockedBy.join(", ") + " in mezzo" : ""));
  if (madeThemAlign) why.push("e' il bersaglio a doversi allineare a lei");
  return {
    disordered: why.length > 0, why,
    text: why.length ? "carica disordinata: " + why.join(", ") +
                       " — niente bonus di Iniziativa (pp. 128 e 146)" : "",
  };
}

/* Quanti modelli finiscono nel terreno che toglie i ranghi. `points`
   sono i centri delle basette quando chi chiama li sa; se non li sa si
   passa il rettangolo e il conto si dichiara stimato, perche' un conto
   stimato spacciato per esatto e' peggio di nessun conto. */
export function disruptedInTerrain(points = [], pieces = [], { exact = true } = {}){
  if (!points.length) return { disrupted:false, share:0, where:[], exact, why:"" };
  const where = [];
  let inside = 0;
  for (const pt of points){
    let hit = null;
    for (const p of pieces){
      if (!p || typeof p.contains !== "function" || !p.contains(pt)) continue;
      if (p.cat && p.cat.disorder){ hit = p; break; }
    }
    if (hit){ inside++; const n = hit.label || hit.kind; if (!where.includes(n)) where.push(n); }
  }
  const share = inside / points.length;
  return {
    disrupted: share >= 0.25, share: Math.round(share * 100), where, exact,
    why: share >= 0.25
      ? Math.round(share * 100) + "% dei modelli in " + where.join(", ") +
        ": niente bonus dei ranghi (p. 128)" + (exact ? "" : " — conteggio stimato sul rettangolo")
      : "",
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
    /* Prima il terreno, poi la dichiarazione. L'ordine conta: un bosco
       sul percorso toglie un pollice al Movimento e alza di uno il
       punteggio che serve, quindi puo' rendere impossibile una carica
       che in aperto si poteva dichiarare. Calcolarlo dopo vorrebbe
       dire scrivere «si puo'» e poi tirare con altri numeri. */
    const path = crossed([charger.box.x, charger.box.y], [t.box.x, t.box.y], pieces);
    const eff = terrainEffect(path);
    const d = declareCharge({ charger, target: t, pieces, worst: eff.worstDie });
    if (!d) continue;
    rows.push({
      ...d, unit: t,
      terrain: eff,
      dice: chargeDice({ swift: charger.swift, worst: eff.worstDie }),
      align: alignTo(charger.box, t.box),
    });
  }
  return rows.sort((a, b) => (b.can - a.can) || (a.dist - b.dist));
}

/* ============================================================
   10 · QUELLO CHE STA INTORNO ALLA CARICA
   Quattro regole che il manuale mette in pagine diverse ma che al
   tavolo si guardano nello stesso momento: chi puo' caricare, quanto
   si muove chi non carica, cosa costa una manovra, e il test che serve
   per marciare quando il nemico e' vicino.
   ============================================================ */

/* Chi puo' caricare (p. 119). Il manuale distingue fra «non puo'
   dichiarare» e «puo' dichiarare ma non puo' muovere»: la colonna di
   marcia sta nel secondo gruppo (p. 101), ed e' la distinzione che al
   tavolo si sbaglia sempre. */
export function canCharge({ engaged = false, fleeing = false,
                            rallied = false, column = false } = {}){
  const stop = [], slow = [];
  if (engaged) stop.push("è già in combattimento (p. 119)");
  if (fleeing) stop.push("sta fuggendo (p. 119)");
  if (rallied) stop.push("si è radunata in questo turno (p. 119)");
  if (column)  slow.push("in colonna di marcia si dichiara ma non si muove (p. 101)");
  return {
    can: !stop.length,
    canMove: !stop.length && !slow.length,
    why: [...stop, ...slow],
  };
}

/* Marciare a meno di otto pollici da un nemico non in fuga chiede un
   test di Comando, e chi lo fallisce conta comunque come se avesse
   marciato — cioe' non tira (p. 123). E' la riga che fa perdere piu'
   turni di tiro di qualunque altra. Chi vola ne e' esente (p. 170). */
export const MARCH_WATCH = 8;

export function marchCheck(poly, enemies = [], { fly = false } = {}){
  const near = [];
  for (const e of enemies){
    if (!e || e.fleeing) continue;
    if (inch(polyDistance(poly, cornersOf(e))) <= MARCH_WATCH) near.push(nameOf(e));
  }
  return {
    needsTest: !fly && near.length > 0, near, exempt: !!fly,
    why: fly ? "vola: marcia senza test (p. 170)"
       : near.length ? "nemico entro " + MARCH_WATCH + "″ (" + near.join(", ") +
                       "): test di Comando prima di marciare (p. 123)"
       : "nessun nemico entro " + MARCH_WATCH + "″: marcia libera (p. 123)",
  };
}

/* Quanti pollici fa chi non carica (pp. 123, 125, 135). I quattro casi
   stanno su tre pagine diverse; qui stanno in fila, che e' come si
   guardano al tavolo. */
export function moveAllowance(move, { kind = "move", slow = false, column = false } = {}){
  const base = +move || 0;
  if (!base) return { inches:0, base:0, why:["senza Movimento sul profilo non si conta niente"] };
  const why = [];
  let m = base;
  if (slow){ m = Math.max(1, m - 1); why.push("−1 terreno difficile (p. 135)"); }
  let out = m;
  if (kind === "march"){
    out = column ? m * 3 : m * 2;
    why.push(column ? "colonna di marcia: ×3 (p. 101)" : "marcia: ×2 (p. 123)");
  } else if (kind === "back"){ out = m / 2; why.push("all'indietro: metà (p. 125)"); }
  else if (kind === "side"){ out = m / 2; why.push("di lato: metà (p. 125)"); }
  return { inches: r1(out), base, why };
}

/* Le sei manovre con quello che costano (pp. 124-125). Una sola per
   movimento, e nessun modello puo' fare piu' del doppio del proprio
   Movimento. Sono dati e non codice: servono a scriverlo accanto al
   pezzo, non a impedire niente. */
export const MANOEUVRES = [
  { id:"wheel",   label:"ruota",            cost:"quanto cammina il modello esterno",     page:124 },
  { id:"turn90",  label:"giro di 90°",      cost:"un quarto del Movimento",               page:124 },
  { id:"turn180", label:"giro di 180°",     cost:"metà del Movimento",                    page:124 },
  { id:"back",    label:"indietro",         cost:"metà del Movimento",                    page:125 },
  { id:"side",    label:"di lato",          cost:"metà del Movimento",                    page:125 },
  { id:"redress", label:"riordina le file", cost:"metà del Movimento, fino a 5 modelli",  page:125 },
  { id:"reform",  label:"riorganizzazione", cost:"tutto il movimento",                    page:125 },
];

/* Il test di Pericolo di chi ha attraversato un nemico fuggendo: un
   dado per modello, 4+ e passa, 1-3 e perde una ferita (p. 133). */
export const perilAsk = n => ({
  id:"pericolo", kind:"d6", n: Math.max(1, n | 0), need: 4,
  why:"test di Pericolo, uno per modello che ha attraversato (p. 133)",
});
