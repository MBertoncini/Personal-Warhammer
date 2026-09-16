/* Schieramento Old World — l'arbitro
 *
 * Tutto quello che c'era prima di questo file sapeva CALCOLARE e non
 * sapeva APPLICARE. `meleeRound` torna dei cloni; `shootRoll` torna un
 * numero di perdite; `chargeOutcome` torna «arriva» o «non arriva». Chi
 * prendeva quei risultati e li scriveva sui pezzi era `deploy.js`, che
 * e' cinquemila righe di pagina: dita, pannelli, disegno. Senza una
 * pagina davanti, l'app non sapeva giocare una partita.
 *
 * Questo modulo e' l'arbitro che mancava. Tiene uno stato, sa in che
 * punto del turno si e', dice QUALI GESTI SONO LEGALI ADESSO, e quando
 * gliene si passa uno tira i dadi, applica le regole e scrive una riga
 * di registro che dice cosa e' successo e da quale pagina viene.
 *
 * Tre cose lo tengono onesto:
 *
 *   NON SA LE REGOLE. Le sanno i moduli — `charge.js`, `combat.js`,
 *   `melee.js`, `shoot.js`, `psych.js`, `victory.js` — e qui si
 *   chiamano. Se una regola e' sbagliata si corregge dove abita, e
 *   l'arbitro non se ne accorge nemmeno.
 *
 *   NON DECIDE. Le decisioni — chi carica chi, dove si muove, a chi si
 *   spara — le prende chi gioca: un umano, un'euristica, un modello di
 *   linguaggio. L'arbitro elenca le mosse legali e applica quella
 *   scelta, e quando chi gioca sbaglia lo dice invece di aggiustare.
 *
 *   DICE COSA NON SA. Le semplificazioni sono elencate in `LIMITI`, e
 *   ognuna esce nel registro la prima volta che conta. Una partita
 *   giocata da un arbitro che tace non insegna niente: quella riga che
 *   dice «qui l'app fa cosi', il manuale direbbe cosi'» e' meta' del
 *   valore di tutto il progetto.
 *
 * Niente DOM, niente archivio, niente rete: entrano due liste, esce una
 * partita.
 */

import { MM, inch } from './util.js';
import { boxCorners, polyDistance, polysOverlap, pointInRect } from './geom.js';
import * as FM from './formation.js';
import * as MV from './movement.js';
import * as CH from './charge.js';
import * as CB from './combat.js';
import * as ML from './melee.js';
import * as SH from './shoot.js';
import * as PS from './psych.js';
import * as VC from './victory.js';
import * as PREP from './prep.js';
import { splitStat, moveInfo } from './profiles.js';
import { roll, leadershipTest, stat, rankBonus } from './rules.js';
import { SCENARIOS, geometry } from './scenarios.js';
import { troopType, unitStrength } from './troops.js';

/* ============================================================
   0 · QUELLO CHE QUESTO ARBITRO NON FA
   Si dichiara qui, in cima, e si stampa nel registro: sono le regole
   che il manuale ha e la partita non gioca. Ognuna e' una riga di
   lavoro futuro, non una scusa.
   ============================================================ */
export const LIMITI = [
  { id:"magia",     what:"la fase di magia non si gioca", page:106,
    why:"generare e lanciare ci sono in `magic.js`, ma servono gli incantesimi scelti prima della partita, e una lista non li porta" },
  { id:"sagome",    what:"le sagome e le macchine da guerra sparano come un'arma normale", page:222,
    why:"deviazione e «sotto in parte» stanno in `shoot.js` e vogliono la posizione modello per modello" },
  { id:"riforma",   what:"nessuno si riforma né gira sul posto per scelta", page:125,
    why:"le manovre ci sono in `charge.js`; qui si avanza, si marcia, si carica e ci si ferma" },
  { id:"sfida",     what:"nessuno lancia sfide", page:210,
    why:"chi la raccoglie e chi la rifiuta è una decisione da tavolo, e l'overkill lo conta già `melee.js`" },
  { id:"oggetti",   what:"gli oggetti magici non fanno niente", page:0,
    why:"i cataloghi li scrivono come testo libero: l'app li mostra e non li applica" },
  { id:"bordo",     what:"chi cede terreno contro il bordo del tavolo si ferma lì", page:134,
    why:"il libro dice dove si ferma chi cede terreno — un'unità, il terreno, un pollice da un nemico — e del bordo non dice niente" },
  { id:"volo",      what:"chi vola si muove del suo volo ma non sorvola niente", page:0,
    why:"il numero lo dà `profiles.js`; sorvolo e atterraggio vogliono la geometria del volo" },
  { id:"seguire",   what:"chi vince segue sempre chi cede terreno, e non segue mai chi ripiega in ordine", page:134,
    why:"seguire o fermarsi è una scelta di chi gioca, e l'arbitro qui non la offre" },
  { id:"ridirezione", what:"chi vede fuggire il bersaglio della carica non la ridirige su un altro", page:121,
    why:"tira comunque, e se non raggiunge chi fugge fa la carica fallita" },
  { id:"attraversare", what:"chi fugge passa attraverso le unità senza il test di Pericolo", page:133,
    why:"il test c'è in `charge.js` (`perilAsk`), ma vuole sapere quali modelli hanno attraversato" },
  { id:"ingombro",  what:"chi trova la strada chiusa si ferma o gira un poco, non aggira l'ostacolo", page:122,
    why:"il percorso è una linea con qualche deviazione, non una ricerca di strada" },
  { id:"generale",  what:"il raggio del Comando del generale è preso di 12″, da controllare sul libro", page:0,
    why:"il numero non è stato letto sul manuale in questa sessione" },
];

/* Le caselle del turno che questo arbitro gioca. Sono meno delle
   sedici di `phases.js`, e la differenza e' dichiarata: qui non c'e'
   la magia, non c'e' la sotto-fase di comando, e le mosse restanti
   sono un passo solo. */
export const CASELLE = [
  { id:"raduno",  fase:"Strategia",     page:117, what:"chi fugge prova a fermarsi" },
  { id:"cariche", fase:"Movimento",     page:118, what:"si dichiarano le cariche, e chi le subisce reagisce" },
  { id:"mosse",   fase:"Movimento",     page:122, what:"chi non ha caricato avanza, marcia o resta fermo" },
  { id:"tiro",    fase:"Tiro",          page:136, what:"chi ha un'arma da tiro sceglie un bersaglio" },
  { id:"mischia", fase:"Corpo a corpo", page:144, what:"ogni combattimento si risolve, con il test di rotta e l'inseguimento" },
];

/* ============================================================
   1 · IL TAVOLO
   ============================================================ */
const r1 = n => Math.round((+n || 0) * 10) / 10;
const alive = u => Math.max(0, (u.models || 0) - (u.lost || 0));
const onBoard = u => u.placed && !u.dead;
const isJoined = u => FM.joinedHost(u) != null;

/* La forma di un'unita' — quanti modelli per fila, quanto e' larga,
   quanto e' profonda — si ricalcola solo quando cambia qualcosa che la
   riguarda. `formation.js` la costruisce modello per modello, ed e' il
   conto piu' caro di tutta la partita: rifarlo a ogni domanda di
   geometria costava piu' di tutto il resto messo insieme. */
const layCache = new Map();
export function layoutOf(u, units = []){
  const chars = FM.attachedTo(units, u);
  const key = [u.name, alive(u), u.models, u.frontage, u.baseW, u.baseH, u.loose ? 1 : 0,
               JSON.stringify(u.form || null), (u.fallen || []).join("."), chars.length].join("|");
  const hit = layCache.get(u.uid);
  if (hit && hit.key === key) return hit.lay;
  const lay = FM.layout(u, { alive: alive(u), attached: chars });
  layCache.set(u.uid, { key, lay });
  return lay;
}
export function boxOf(u, units = []){
  const lay = layoutOf(u, units);
  return { x: u.x, y: u.y, w: lay.w, h: lay.h, rot: u.rot || 0 };
}
export const cornersOf = (u, units = []) => boxCorners(boxOf(u, units));
export const usOf = u => unitStrength(u.troop, u.us, u.models, alive(u), stat((u.stats || {}).W));
/* le ferite gia' prese dal modello che sta ancora in piedi, e quante
   ne ha: un Bastiladon a una ferita dalla fine si scriveva «1/1» */
export const feriteDi = u => ({ prese: Math.max(0, u.wounds || 0), per: CB.combatant(u).w || 1 });

/* Da una lista salvata a un esercito sul tavolo. Le unita' sono quelle
   del file, con addosso i campi che il tavolo aggiunge: dove stanno,
   quanti ne sono caduti, se stanno fuggendo. */
export function armyFrom(lista, army, from = 0){
  /* Tre unita' che si chiamano tutte «Skink Skirmishers» fanno un
     registro in cui non si capisce chi ha sparato: le omonime prendono
     un numero. Il nome del libro resta in `baseName`, che e' quello con
     cui si cercano i profili. */
  const quante = new Map();
  for (const p of lista.units || []) quante.set(p.name, (quante.get(p.name) || 0) + 1);
  const visti = new Map();
  return (lista.units || []).map((p, i) => {
    const n = (visti.get(p.name) || 0) + 1;
    visti.set(p.name, n);
    const name = quante.get(p.name) > 1 ? `${p.name} ${n}` : p.name;
    return {
      uid: from + i + 1, army, ...p, name, baseName: p.name,
      x: 0, y: 0, rot: army === "A" ? 0 : 180,
      placed: false, lost: 0, dead: false, fled: false, wounds: 0,
      fallen: [], effects: [], anchor: null,
    };
  });
}

export function newBattle({ A, B, scenario = "bm-strada", nomi = null } = {}){
  const sc = SCENARIOS[scenario] || SCENARIOS["bm-strada"];
  const [tw, th] = sc.table;
  const W = tw * MM, H = th * MM;
  const geo = geometry(sc.deploy, W, H, (sc.gap || 6) * MM);
  const units = [...armyFrom(A, "A", 0), ...armyFrom(B, "B", 500)];
  const S = {
    scenario, sc, table: { w: W, h: H, wIn: tw, hIn: th },
    zones: geo.zones,
    /* Il terreno nella forma che `charge.js` e `tactics.js` si
       aspettano: la scatola, i quattro angoli e la domanda «questo
       punto ci sta dentro?». E' la stessa che il tavolo passa agli
       aiuti tattici, perche' le regole della vista sono quelle e non
       vanno riscritte qui. */
    terrain: (sc.terrain || []).map((t, i) => {
      const box = { x: t.x * MM, y: t.y * MM, w: (t.w || 2) * MM, h: (t.h || 2) * MM, rot: t.rot || 0 };
      return {
        tid: i + 1, kind: t.kind, label: t.kind, box, poly: boxCorners(box), circle: false,
        x: box.x, y: box.y, w: box.w, h: box.h, rot: box.rot,
        blocks: /wood|monolith|pyramid|ruins/.test(t.kind),
        cover: /wood|ruins|wall/.test(t.kind) ? "leggera" : "",
        contains: p => Math.abs(p[0] - box.x) <= box.w / 2 && Math.abs(p[1] - box.y) <= box.h / 2,
      };
    }),
    units,
    nomi: nomi || { A: A.name || "Esercito A", B: B.name || "Esercito B" },
    punti: { A: (A.units || []).reduce((s, u) => s + (u.pts || 0), 0),
             B: (B.units || []).reduce((s, u) => s + (u.pts || 0), 0) },
    usStart: { A: 0, B: 0 },
    turno: 1, army: "A", casella: 0, schierando: true, primo: "A",
    rounds: 6, finita: false, esito: null,
    log: [], detto: new Set(), pending: null,
  };
  S.usStart.A = totalUS(S, "A");
  S.usStart.B = totalUS(S, "B");
  /* Il generale: quello che la preparazione della lista dice, e se
     tace quello che `prep.js` propone — il personaggio che lo dichiara,
     o il Comando piu' alto. */
  const genDi = (l, from) => {
    const p = PREP.prepOf(l);
    const i = p.general != null ? p.general : PREP.guessGeneral(l);
    return i != null && (l.units || [])[i] ? from + i + 1 : null;
  };
  S.generale = { A: genDi(A, 0), B: genDi(B, 500) };
  return S;
}

/* Il Comando del generale: chi gli sta entro il raggio usa il suo
   valore invece del proprio, se e' piu' alto. Prima l'arbitro non lo
   applicava affatto, e un reggimento a sei pollici dal suo Warboss
   tirava i test di rotta con il proprio Comando 6. Il raggio non e'
   stato letto sul libro in questa sessione: sta in una costante sola,
   ed e' dichiarato fra i limiti (`generale`). Il generale in fuga non
   ispira nessuno. */
export const RAGGIO_GENERALE = 12;
function comandoGenerale(S, u){
  const g = byUid(S, (S.generale || {})[u.army]);
  if (!g || g === u || g.dead || g.fled) return null;
  const host = isJoined(g) ? byUid(S, FM.joinedHost(g)) : g;
  if (!host || !onBoard(host)) return null;
  const d = host === u ? 0 : distanza(S, u, host);
  if (d > RAGGIO_GENERALE) return null;
  const c = CB.combatant(g);
  const ld = +(c.ldBase != null ? c.ldBase : c.ld) || 0;
  return ld ? { ld, nome: g.name, d } : null;
}
/* il Comando con cui l'unita' tira, e da dove viene. `zitto` e' per
   le opzioni, che guardano e non scrivono nel registro. */
function comandoDi(S, u, proprio, { zitto = false } = {}){
  const g = comandoGenerale(S, u);
  if (!g || g.ld <= proprio) return { ld: proprio, why: "" };
  if (!zitto) limite(S, "generale");
  return { ld: g.ld, why: `Comando ${g.ld} di ${g.nome}, a ${g.d}″` };
}

const totalUS = (S, army) => S.units
  .filter(u => u.army === army && !u.dead).reduce((s, u) => s + usOf(u), 0);

/* ============================================================
   2 · IL REGISTRO
   Ogni riga dice chi, cosa, con quali dadi e da che pagina. E' quello
   che resta della partita, ed e' l'unica cosa che una partita giocata
   da due macchine lascia a chi la legge.
   ============================================================ */
function say(S, text, { page = 0, dice = null, groups = null, army = "", kind = "" } = {}){
  const riga = { turno: S.turno, army: army || S.army, casella: CASELLE[S.casella] ? CASELLE[S.casella].id : "",
                 text, page, dice, kind };
  if (groups && groups.length) riga.groups = groups;
  S.log.push(riga);
  return riga;
}
/* un limite si dice una volta sola, quando conta */
function limite(S, id){
  if (S.detto.has(id)) return;
  const l = LIMITI.find(x => x.id === id);
  if (!l) return;
  S.detto.add(id);
  say(S, `[limite] ${l.what}: ${l.why}.`, { page: l.page, kind: "limite" });
}

/* ============================================================
   3 · CHI E' DOVE
   ============================================================ */
export const unitsOf = (S, army) => S.units.filter(u => u.army === army && !u.dead && !isJoined(u));
export const inCampo = (S, army) => unitsOf(S, army).filter(onBoard);
export const nemiciDi = (S, u) => inCampo(S, u.army === "A" ? "B" : "A");

/* I contatti di basetta si guardano decine di volte per mossa — ogni
   opzione di carica, ogni «è ingaggiata?» — e sono un conto fra
   poligoni: calcolarli ogni volta faceva di una partita intera un
   minuto e mezzo. Si ricalcolano quando il tavolo cambia davvero, e la
   firma del tavolo e' dove sta ognuno e quanti ne restano. */
function firma(S){
  let f = "";
  for (const u of S.units){
    if (!u.placed || u.dead) continue;
    f += u.uid + ":" + Math.round(u.x) + "," + Math.round(u.y) + "," + Math.round(u.rot) + "," + (u.lost || 0) + ";";
  }
  return f;
}
export function contatti(S){
  const f = firma(S);
  if (S.cache && S.cache.firma === f) return S.cache.list;
  const list = FM.contactList(S.units.filter(u => !isJoined(u)), x => boxOf(x, S.units));
  S.cache = { firma: f, list };
  return list;
}
export function ingaggiata(S, u){
  return contatti(S).some(c => (c.a === u.uid || c.b === u.uid) &&
    (c.a === u.uid ? c.bArmy : c.aArmy) !== u.army);
}
export function distanza(S, a, b){
  return r1(inch(polyDistance(cornersOf(a, S.units), cornersOf(b, S.units))));
}
export const piuVicino = (S, u, lista = null) => {
  const l = (lista || nemiciDi(S, u)).slice().sort((x, y) => distanza(S, u, x) - distanza(S, u, y));
  return l[0] || null;
};

/* ============================================================
   3 bis · DOVE SI PUO' STARE
   Due unita' non stanno mai una dentro l'altra, e nessuno si ferma a
   meno di un pollice da un nemico con cui non combatte (p. 118). Prima
   l'arbitro spostava i centri in linea retta senza guardare nessuno, e
   una partita finiva con il carro dentro i cinghiali e il Warboss dentro
   il suo reggimento: il disegno era fedele, era il tavolo a essere
   sbagliato.
   ============================================================ */
const dentroTavolo = (S, poly) => poly.every(p =>
  p[0] >= -0.01 && p[1] >= -0.01 && p[0] <= S.table.w + 0.01 && p[1] <= S.table.h + 0.01);
export const sulTavolo = (S, u) => dentroTavolo(S, cornersOf(u, S.units));

/* Chi o cosa impedisce a `u` di stare in `box`. `ignora` sono gli uid
   che non contano (il bersaglio di una carica, chi combatte con lui);
   `unPollice` accende la distanza dai nemici; `bordo` il bordo. Torna
   null quando il posto e' libero. */
export function ingombro(S, u, box, { ignora = [], unPollice = true, bordo = true, gia = null } = {}){
  const poly = boxCorners(box);
  if (bordo && !dentroTavolo(S, poly)) return { chi: null, perche: "il bordo del tavolo" };
  for (const o of S.units){
    if (o === u || !onBoard(o) || isJoined(o) || ignora.includes(o.uid)) continue;
    const q = cornersOf(o, S.units);
    if (polysOverlap(poly, q)) return { chi: o, perche: o.name };
    if (unPollice && o.army !== u.army && !o.fled){
      /* chi parte gia' entro il pollice puo' allontanarsi, non avvicinarsi */
      const soglia = Math.min(MM - 0.5, gia && gia.has(o.uid) ? gia.get(o.uid) - 0.01 : Infinity);
      if (polyDistance(poly, q) < soglia) return { chi: o, perche: `${o.name} a un pollice (p. 118)` };
    }
  }
  return null;
}

/* Il percorso: si avanza a passi in una direzione e ci si ferma
   all'ultimo posto libero. Se la strada dritta si chiude subito si
   prova qualche grado a destra e a sinistra, e vince la direzione che
   avvicina di piu' alla meta. `verso` e' il punto da raggiungere;
   `rot` la rotazione con cui si viaggia. Torna i pollici fatti e,
   quando ci si ferma prima, cosa ha fermato. */
const PASSO = MM / 4;
function percorso(S, u, verso, pollici, { rot = u.rot || 0, ignora = [], unPollice = true,
                                         devia = true, bordo = true } = {}){
  const lay = layoutOf(u, S.units);
  const dx0 = verso[0] - u.x, dy0 = verso[1] - u.y;
  const base = Math.atan2(dy0, dx0);
  const max = Math.max(0, pollici) * MM;
  /* i nemici gia' entro il pollice alla partenza, con la loro distanza */
  const gia = new Map();
  const mio = cornersOf(u, S.units);
  const salta = [...ignora];
  for (const o of S.units){
    if (o === u || !onBoard(o) || isJoined(o)) continue;
    const q = cornersOf(o, S.units);
    /* chi e' gia' sovrapposto — un posto che l'arbitro non dovrebbe piu'
       produrre — non inchioda il pezzo: si lascia andare */
    if (polysOverlap(mio, q)){ salta.push(o.uid); continue; }
    if (unPollice && o.army !== u.army){
      const d = polyDistance(mio, q);
      if (d < MM) gia.set(o.uid, d);
    }
  }
  const opts = { ignora: salta, unPollice, bordo, gia };
  const prova = ang => {
    const cx = Math.cos(ang), cy = Math.sin(ang);
    const at = s => ({ x: u.x + cx * s, y: u.y + cy * s, w: lay.w, h: lay.h, rot });
    let fatto = 0, stop = null;
    for (let s = PASSO; s <= max + 0.01; s += PASSO){
      const b = at(Math.min(s, max));
      const blocco = ingombro(S, u, b, opts);
      if (blocco){ stop = blocco; break; }
      fatto = Math.min(s, max);
    }
    /* l'ultimo quarto di pollice si rifinisce, per arrivare a filo */
    if (stop){
      let lo = fatto, hi = Math.min(fatto + PASSO, max);
      for (let k = 0; k < 6; k++){
        const mid = (lo + hi) / 2;
        if (ingombro(S, u, at(mid), opts)) hi = mid; else lo = mid;
      }
      fatto = lo;
    }
    const p = at(fatto);
    return { x: p.x, y: p.y, mm: fatto, stop, resta: Math.hypot(verso[0] - p.x, verso[1] - p.y), ang };
  };
  let best = prova(base);
  if (devia && best.stop && best.mm < max - 0.5){
    for (const g of [15, -15, 30, -30, 45, -45]){
      const alt = prova(base + g * Math.PI / 180);
      if (alt.resta < best.resta - 1) best = alt;
    }
  }
  return { ...best, pollici: r1(inch(best.mm)) };
}

/* sposta il pezzo, e con lui i personaggi che ci stanno dentro */
function posa(S, u, x, y, rot = u.rot){
  u.x = x; u.y = y; u.rot = rot;
  for (const c of S.units.filter(o => FM.joinedHost(o) === u.uid)){
    c.x = x; c.y = y; c.rot = rot; c.dead = u.dead; c.placed = u.placed; c.fled = u.fled;
  }
}

/* ============================================================
   4 · LO SCHIERAMENTO (p. 115)
   A turno, un'unita' per volta, dentro la propria zona. L'arbitro
   propone tre posti — sinistra, centro, destra — e chi gioca sceglie:
   la geometria resta qui, e chi decide non deve saper contare i
   millimetri.
   ============================================================ */
function zonaDi(S, army){
  const z = (S.zones[army] || [])[0];
  return z || { x: 0, y: 0, w: S.table.w, h: S.table.h };
}

export function postiPer(S, u){
  const z = zonaDi(S, u.army);
  const lay = layoutOf(u, S.units);
  const mie = inCampo(S, u.army);
  const out = [];
  const colonne = ["sinistra", "centro-sinistra", "centro", "centro-destra", "destra"];
  /* La zona in colonne e in file: la prima fila e' quella davanti, cioe'
     dalla parte del nemico, che e' dove al tavolo si mette chi deve
     arrivarci. Le file dietro servono quando la prima e' piena: uno
     schieramento non e' mai una riga sola. */
  const file = Math.max(1, Math.floor(z.h / Math.max(MM, lay.h + MM / 2)));
  for (let f = 0; f < Math.min(file, 3); f++){
    for (let i = 0; i < colonne.length; i++){
      const x = z.x + z.w * (i + 0.5) / colonne.length;
      const passo = lay.h + MM / 2;
      /* A sta in basso e guarda in su: la sua prima fila e' il bordo
         alto della zona. Prima era il contrario, e il capo messo «in
         prima fila» stava sul bordo del tavolo dietro a tutti. */
      const y = u.army === "A"
        ? z.y + lay.h / 2 + MM + f * passo
        : z.y + z.h - lay.h / 2 - MM - f * passo;
      const poly = boxCorners({ x, y, w: lay.w, h: lay.h, rot: u.rot || 0 });
      const libero = !mie.some(o => polyDistance(poly, cornersOf(o, S.units)) < MM / 2) &&
                     x - lay.w / 2 >= z.x - 0.01 && x + lay.w / 2 <= z.x + z.w + 0.01 &&
                     y - lay.h / 2 >= z.y - 0.01 && y + lay.h / 2 <= z.y + z.h + 0.01;
      if (libero) out.push({ id:"schiera", uid: u.uid, x, y, rot: u.rot || 0,
                             dove: colonne[i] + (f ? `, ${f + 1}ª fila` : ""),
                             why: `${colonne[i]}${f ? ", dietro" : ", in prima fila"}` });
    }
  }
  return out;
}

/* ============================================================
   5 · LE MOSSE LEGALI, ADESSO
   Torna sempre la stessa forma: di chi e' il turno, cosa sta
   succedendo, e l'elenco dei gesti. Ogni gesto porta con se' il
   perche' — quanto dista, che probabilita' ha, cosa dice il manuale —
   perche' chi sceglie deve poter scegliere con cognizione, e perche'
   chi legge la partita dopo deve capire perche' si e' scelto quello.
   ============================================================ */
export function options(S){
  if (S.finita) return { player: null, fase: "finita", what: "la partita è finita", list: [] };

  if (S.schierando){
    const prossima = daSchierare(S);
    if (!prossima) return { player: S.army, fase: "Schieramento", what: "tutti schierati", list: [{ id:"avanti", why:"si comincia" }] };
    const posti = postiPer(S, prossima);
    return {
      player: S.army, fase: "Schieramento", page: 115,
      what: `${S.nomi[S.army]} schiera ${prossima.name} (${alive(prossima)} modelli, ${prossima.pts || 0} pt)`,
      unit: prossima.uid,
      list: posti.length ? posti : [{ id:"avanti", why:"non c'è posto per quest'unità nella zona" }],
    };
  }

  const c = CASELLE[S.casella];
  const base = { player: S.army, fase: c.fase, casella: c.id, page: c.page, what: c.what };

  /* una reazione alla carica sospesa tocca a chi la subisce, e viene
     prima di ogni altra cosa (p. 120) */
  if (S.pending && S.pending.kind === "reazione"){
    const t = byUid(S, S.pending.target), ch = byUid(S, S.pending.charger);
    return { ...base, player: t.army, fase: "Movimento", page: 120,
             what: `${t.name} è caricata da ${ch.name}: come reagisce?`,
             list: S.pending.list };
  }

  if (c.id === "raduno")  return { ...base, list: opzioniRaduno(S) };
  if (c.id === "cariche") return { ...base, list: opzioniCarica(S) };
  if (c.id === "mosse")   return { ...base, list: opzioniMossa(S) };
  if (c.id === "tiro")    return { ...base, list: opzioniTiro(S) };
  if (c.id === "mischia") return { ...base, list: opzioniMischia(S) };
  return { ...base, list: [{ id:"avanti", why:"niente da fare" }] };
}

const byUid = (S, uid) => S.units.find(u => u.uid === uid) || null;
const avanti = why => ({ id:"avanti", why });

function daSchierare(S){
  /* chi ha rinunciato — perche' nella zona non c'era piu' posto — non
     torna a chiedere: resta fuori dal tavolo, e a fine partita vale
     quello che vale */
  const mie = unitsOf(S, S.army).filter(u => !u.placed && !isJoined(u) && !u.rinuncia);
  return mie[0] || null;
}

/* ---- raduno (p. 117) ---- */
function opzioniRaduno(S){
  const fuggono = inCampo(S, S.army).filter(u => u.fled);
  const list = fuggono.map(u => {
    const lead = PS.rallyLeadership(ldOf(S, u, { zitto: true }), { models: alive(u), start: u.models || 0,
                                                  musician: !!(u.command && u.command.musician) });
    return { id:"raduna", uid: u.uid, nome: u.name,
             why: lead.hopeless ? "si ferma solo con il doppio uno" : `Comando ${lead.value}` +
                  (lead.why.length ? " (" + lead.why.join("; ") + ")" : ""),
             page: PS.PAGE.rally };
  });
  return list.length ? list : [avanti("nessuno sta fuggendo")];
}

/* ---- cariche (p. 118) ---- */
function opzioniCarica(S){
  const out = [];
  for (const u of inCampo(S, S.army)){
    /* chi ha gia' fatto qualcosa in questo turno non dichiara cariche:
       ci e' andata male una volta e basta */
    if (u.fled || u.charged || u.moved || ingaggiata(S, u)) continue;
    const mv = moveInfo(u);
    const move = mv.m || (mv.random ? tiraRandom(S, u, mv) : 0);
    if (!move) continue;
    for (const t of nemiciDi(S, u)){
      const d = CH.declareCharge({
        charger: { name: u.name, box: boxOf(u, S.units), move, swift: MV.swiftOf(u), loose: !!u.loose },
        target:  { name: t.name, box: boxOf(t, S.units) },
        pieces: S.terrain,
      });
      if (!d || !d.can) continue;
      /* Il posto a contatto c'e'? Una carica su un nemico che ha gia'
         la faccia piena di amici non si offre: prima si offriva con il
         90% e poi falliva «perche' non c'e' posto», un turno buttato.
         Se per arrivare bisogna scorrere lungo la faccia, quei pollici
         entrano nel tiro che serve. */
      const posto = postoAContatto(S, u, t);
      if (!posto || posto.pieno) continue;
      const extra = r1(posto.extra || 0);
      const need = Math.max(0, r1(d.need + extra));
      const chance = extra ? CH.chargeChance(need, MV.swiftOf(u)) : d.chance;
      if (chance <= 0) continue;
      out.push({ id:"carica", uid: u.uid, target: t.uid, nome: u.name, contro: t.name,
                 why: `${d.dist}″, ${need ? "serve " + need + "″ di tiro" : "ci arriva camminando"}` +
                      (extra ? ` (${extra}″ per trovare posto sulla faccia)` : "") +
                      `, riesce il ${Math.round(chance * 100)}%, la prende di ${d.side}`,
                 chance, page: 119 });
    }
  }
  out.sort((a, b) => b.chance - a.chance);
  return [...out, avanti("basta cariche: si passa al movimento")];
}

/* ---- mosse (p. 122) ---- */
function opzioniMossa(S){
  const out = [];
  for (const u of inCampo(S, S.army)){
    if (u.fled || u.charged || ingaggiata(S, u) || u.moved) continue;
    const mv = moveInfo(u);
    const move = mv.m || (mv.random ? tiraRandom(S, u, mv) : 0);
    if (!move){ continue; }
    const t = piuVicino(S, u);
    if (!t) continue;
    const d = distanza(S, u, t);
    /* a un pollice dal nemico piu' vicino non si avanza verso di lui:
       il pollice (p. 118) ferma il pezzo prima di partire */
    if (d <= 1.05){
      out.push({ id:"ferma", uid: u.uid, nome: u.name, why: `resta dov'è: ${t.name} è a ${d}″`, page: 122 });
      continue;
    }
    out.push({ id:"avanza", uid: u.uid, verso: t.uid, nome: u.name, contro: t.name,
               why: `${move}″ verso ${t.name}, che è a ${d}″` + (mv.why ? ` (${mv.why})` : ""),
               page: 122 });
    out.push({ id:"marcia", uid: u.uid, verso: t.uid, nome: u.name, contro: t.name,
               why: `${move * 2}″ verso ${t.name}` +
                    (d <= CH.MARCH_WATCH ? `, ma a ${CH.MARCH_WATCH}″ da un nemico serve un test di Comando (p. 123)` : ""),
               page: 123 });
    out.push({ id:"ferma", uid: u.uid, nome: u.name, why: "resta dov'è: chi non muove spara meglio", page: 138 });
  }
  return [...out, avanti("basta mosse: chi non si è ancora mosso resta dov'è")];
}

/* ---- tiro (p. 136) ---- */
function opzioniTiro(S){
  const out = [];
  for (const u of inCampo(S, S.army)){
    if (u.fled || ingaggiata(S, u) || u.shot) continue;
    const armi = CB.rangedWeapons(u);
    if (!armi.length) continue;
    const gate = SH.canShoot({ charged: !!u.charged, marched: !!(u.moved && u.moved.kind === "march"),
                               engaged: ingaggiata(S, u), fleeing: !!u.fled });
    if (!gate.can) continue;
    const arma = armi[0];
    const gittata = stat(arma.range);
    for (const t of nemiciDi(S, u)){
      const d = distanza(S, u, t);
      if (d > gittata) continue;
      if (vistaTagliata(S, u, t)) continue;
      const mods = modificatori(S, u, t, d, gittata);
      const f = CB.shootForecast(u, t, { weapon: arma, mods: mods.total });
      /* la probabilita' scritta in chiaro: un modello che legge «6+» e
         basta continua a tirare a vuoto per quattro turni */
      const pc = Math.round(SH.hitChance(f.hitNeed, f.hitAgain, f.hitThen) * 100);
      out.push({ id:"tira", uid: u.uid, target: t.uid, nome: u.name, contro: t.name,
                 why: `${f.shots} tiri con ${arma.name} da ${d}″, colpisce a ${f.hitNeed}+ (${pc}% a tiro)` +
                      (mods.list.length ? ` (${mods.list.map(m => m.why).join(", ")})` : "") +
                      `, ≈ ${f.kills.toFixed(1)} perdite`,
                 attesa: f.kills, page: 136 });
    }
  }
  out.sort((a, b) => b.attesa - a.attesa);
  return [...out, avanti("nessun altro tiro")];
}

/* ---- mischia (p. 144) ---- */
function opzioniMischia(S){
  /* Ogni combattimento fa un round per turno (p. 144): quelli gia'
     risolti in questo turno non tornano a chiedere. Senza questa riga
     le stesse due unita' si menavano finche' una moriva, tutto dentro
     lo stesso turno. */
  const gruppi = gruppiInMischia(S).map((g, i) => ({ g, i }))
    .filter(x => !fatto(S, x.g));
  if (!gruppi.length) return [avanti("nessun combattimento da risolvere")];
  const nomi = l => l.map(u => u.name).join(" e ");
  return [...gruppi.map(x => ({ id:"combatti", gruppo: x.i, nome: nomi(x.g.A), contro: nomi(x.g.B),
                                why: `${nomi(x.g.A)} contro ${nomi(x.g.B)}`, page: 144 })),
          avanti("rimanda i combattimenti")];
}
const chiave = S => `${S.turno}:${S.army}`;
const fatto = (S, g) => [...g.A, ...g.B].some(u => u.fought === chiave(S));

/* I combattimenti in corso: si parte da un contatto fra nemici e si
   tira dentro chiunque tocchi qualcuno di quelli gia' dentro. E' il
   «combattimento» del manuale (p. 153), che e' un gruppo e non una
   coppia. */
export function gruppiInMischia(S){
  const cs = contatti(S).filter(c => c.aArmy !== c.bArmy);
  const visti = new Set(), out = [];
  for (const c of cs){
    if (visti.has(c.a) || visti.has(c.b)) continue;
    const dentro = new Set([c.a, c.b]);
    let cresce = true;
    while (cresce){
      cresce = false;
      for (const x of cs){
        if (dentro.has(x.a) !== dentro.has(x.b)){
          dentro.add(x.a); dentro.add(x.b); cresce = true;
        }
      }
    }
    for (const uid of dentro) visti.add(uid);
    const lista = [...dentro].map(uid => byUid(S, uid)).filter(u => u && onBoard(u));
    out.push({ A: lista.filter(u => u.army === "A"), B: lista.filter(u => u.army === "B") });
  }
  return out.filter(g => g.A.length && g.B.length);
}

/* ============================================================
   6 · I NUMERI CHE SERVONO A DECIDERE
   ============================================================ */
function ldOf(S, u, { zitto = false } = {}){
  const p = PS.psychOf(u, { joined: FM.attachedTo(S.units, u) });
  const c = CB.combatant(u);
  const base = comandoDi(S, u, +(c.ldBase || c.ld) || 0, { zitto }).ld;
  return PS.leadershipOf(base, p, { fleeing: !!u.fled }).value;
}

/* Il Movimento che si tira (3D6 dei Squig Hopper, del Doomwheel): si
   tira una volta per turno e resta scritto, cosi' la stessa unita' non
   ha due Movimenti diversi nella stessa fase. */
function tiraRandom(S, u, mv){
  const key = S.turno + ":" + S.army;
  if (u.randomMove && u.randomMove.key === key) return u.randomMove.n;
  const m = String(mv.random).match(/^(\d+)D(\d+)$/i);
  if (!m) return 0;
  const dadi = roll(+m[1]);
  const n = dadi.reduce((s, v) => s + v, 0);
  u.randomMove = { key, n, dadi };
  say(S, `${u.name}: Movimento ${mv.random} → ${dadi.join(" + ")} = ${n}″.`,
      { dice: dadi, army: u.army, page: mv.page || 0 });
  return n;
}

function vistaTagliata(S, a, b){
  const from = { x: a.x, y: a.y }, to = { x: b.x, y: b.y };
  return S.terrain.filter(t => t.blocks).some(t => segmentoTocca(from, to, t));
}
function coperturaDi(S, u){
  return S.terrain.some(t => t.cover && pointInRect([u.x, u.y],
    { x: t.x - t.w / 2, y: t.y - t.h / 2, w: t.w, h: t.h }));
}
function segmentoTocca(a, b, t){
  const poly = boxCorners({ x: t.x, y: t.y, w: t.w, h: t.h, rot: t.rot || 0 });
  for (let i = 0; i < 24; i++){
    const p = [a.x + (b.x - a.x) * i / 23, a.y + (b.y - a.y) * i / 23];
    if (dentroPoly(p, poly)) return true;
  }
  return false;
}
function dentroPoly(p, poly){
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/* ============================================================
   7 · APPLICARE UN GESTO
   Qui si tirano i dadi e si scrivono i pezzi. Ogni gesto torna
   `{ ok, text }`: quando `ok` e' falso il gesto non era legale, e
   l'arbitro lo dice invece di far finta di averlo fatto — e' la stessa
   onesta' che il resto dell'app ha con i numeri che non sa.
   ============================================================ */
export function apply(S, a){
  if (S.finita) return no("la partita è finita");
  if (!a || !a.id) return no("nessun gesto");
  const f = GESTI[a.id];
  if (!f) return no(`gesto sconosciuto: ${a.id}`);
  return f(S, a);
}
const no = why => ({ ok: false, text: why });
const si = text => ({ ok: true, text });

const GESTI = {
  avanti: (S) => si(passo(S)),

  schiera: (S, a) => {
    const u = byUid(S, a.uid);
    if (!u || u.placed) return no("quest'unità non è da schierare");
    u.x = a.x; u.y = a.y; u.rot = a.rot != null ? a.rot : u.rot; u.placed = true;
    say(S, `${u.name} si schiera ${a.dove || ""}`.trim() + ".", { army: u.army, page: 115 });
    /* i personaggi entrano con il reggimento a cui sono uniti */
    for (const c of S.units.filter(x => FM.joinedHost(x) === u.uid)){
      c.x = u.x; c.y = u.y; c.rot = u.rot; c.placed = true;
    }
    /* si alterna, e chi ha finito lascia continuare l'altro */
    S.army = S.army === "A" ? "B" : "A";
    if (!daSchierare(S)){
      S.army = S.army === "A" ? "B" : "A";
      if (!daSchierare(S)) fineSchieramento(S);
    }
    return si(`${u.name} schierata`);
  },

  raduna: (S, a) => {
    const u = byUid(S, a.uid);
    if (!u || !u.fled) return no("non sta fuggendo");
    const dadi = roll(2);
    const res = PS.rallyTest({ ld: ldOf(S, u), dice: dadi, models: alive(u), start: u.models || 0,
                               musician: !!(u.command && u.command.musician) });
    if (res.passed){ u.fled = false; u.moved = { kind:"rally", inches: 0 }; }
    say(S, `${u.name}, raduno: ${res.text}. ${res.then}`, { dice: dadi, army: u.army, page: res.page });
    return si(res.text);
  },

  /* La carica: si dichiara, chi la subisce reagisce, e solo dopo si
     tira. I tre passi sono tre momenti diversi del manuale e restano
     tre gesti, perche' fra il primo e il terzo c'e' una decisione che
     non e' di chi carica. */
  carica: (S, a) => {
    const u = byUid(S, a.uid), t = byUid(S, a.target);
    if (!u || !t || !onBoard(u) || !onBoard(t)) return no("unità non in campo");
    const mv = moveInfo(u);
    const move = mv.m || (mv.random ? tiraRandom(S, u, mv) : 0);
    const d = CH.declareCharge({
      charger: { name: u.name, box: boxOf(u, S.units), move, swift: MV.swiftOf(u), loose: !!u.loose },
      target:  { name: t.name, box: boxOf(t, S.units) },
      pieces: S.terrain,
    });
    if (!d || !d.can) return no(`carica impossibile: ${d ? d.why : "?"}`);
    say(S, `${u.name} dichiara la carica su ${t.name}: ${d.why}.`, { army: u.army, page: 119 });
    /* la reazione tocca a chi la subisce, e viene prima del tiro */
    const r = CH.reactions({ dist: d.dist, chargerMove: move, shots: CB.shooters(t),
                             canFlee: PS.canFleeReaction(PS.psychOf(t, { joined: FM.attachedTo(S.units, t) })),
                             fleeing: !!t.fled, engaged: ingaggiata(S, t) });
    const scelte = (Array.isArray(r) ? r : (r.list || [])).filter(x => x && x.can !== false);
    S.pending = {
      kind:"reazione", charger: u.uid, target: t.uid, dich: d,
      list: scelte.map(x => ({ id:"reazione", kind: x.id, uid: t.uid, nome: t.name,
                               why: x.why || x.label || x.id, page: 120 })),
    };
    if (!S.pending.list.length)
      S.pending.list = [{ id:"reazione", kind:"hold", uid: t.uid, nome: t.name,
                          why:"tiene la posizione", page:120 }];
    return si(`carica dichiarata su ${t.name}`);
  },

  reazione: (S, a) => {
    const p = S.pending;
    if (!p || p.kind !== "reazione") return no("nessuna carica da subire");
    const u = byUid(S, p.charger), t = byUid(S, p.target);
    S.pending = null;
    if (a.kind === "flee"){
      const dadi = roll(2);
      const via = dadi.reduce((s, v) => s + v, 0) + CB.fleeBonusOf(t).mod;
      say(S, `${t.name} reagisce fuggendo: ${dadi.join(" + ")} = ${via}″ lontano da ${u.name}.`,
          { dice: dadi, army: t.army, page: 120 });
      fuggi(S, t, u, via);
      return si("fuga davanti alla carica");
    }
    if (a.kind === "stand"){
      const armi = CB.rangedWeapons(t);
      if (armi.length){
        say(S, `${t.name} tiene e spara (p. 120).`, { army: t.army, page: 120 });
        tiro(S, t, u, armi[0], { standAndShoot: true });
      } else say(S, `${t.name} non ha armi da tiro: tiene la posizione.`, { army: t.army, page: 120 });
    } else {
      say(S, `${t.name} tiene la posizione.`, { army: t.army, page: 120 });
    }
    if (u.dead || !onBoard(u)) return si("chi caricava non c'è più");
    return si(muoviCarica(S, u, t, p.dich));
  },

  avanza: (S, a) => mossa(S, a, false),
  marcia: (S, a) => mossa(S, a, true),
  /* Stare fermi non e' muoversi: prima «resta ferma» scriveva una mossa
     sull'unita', e il tiro la contava come mossa. Il modello sceglieva
     di stare fermo per tirare meglio e tirava peggio, per quattro turni. */
  ferma:  (S, a) => {
    const u = byUid(S, a.uid);
    if (!u) return no("unità sconosciuta");
    u.moved = { kind:"still", inches: 0 };
    say(S, `${u.name} resta ferma.`, { army: u.army, page: 122 });
    return si("ferma");
  },

  tira: (S, a) => {
    const u = byUid(S, a.uid), t = byUid(S, a.target);
    if (!u || !t) return no("unità sconosciuta");
    if (u.shot) return no("ha già tirato in questo turno");
    const armi = CB.rangedWeapons(u);
    if (!armi.length) return no("non ha armi da tiro");
    tiro(S, u, t, armi[0], {});
    u.shot = true;
    return si("tiro risolto");
  },

  combatti: (S, a) => {
    const g = gruppiInMischia(S)[a.gruppo || 0];
    if (!g) return no("nessun combattimento");
    return si(mischia(S, g));
  },
};

/* ---- il movimento vero ---- */
function mossa(S, a, marcia){
  const u = byUid(S, a.uid), t = byUid(S, a.verso);
  if (!u || !t) return no("unità sconosciuta");
  if (u.moved) return no("si è già mossa");
  const mv = moveInfo(u);
  const move = mv.m || (mv.random ? tiraRandom(S, u, mv) : 0);
  if (!move) return no("non sa di quanto si muove: il profilo non porta il Movimento");
  let quanti = move;
  if (marcia){
    /* Marcia sotto gli occhi del nemico: test di Comando (p. 123). */
    const vicino = nemiciDi(S, u).some(e => distanza(S, u, e) <= CH.MARCH_WATCH);
    if (vicino){
      const dadi = roll(2);
      const ld = ldOf(S, u) + (u.command && u.command.musician ? 1 : 0);
      const tot = dadi.reduce((s, v) => s + v, 0);
      const passa = tot <= ld || (dadi[0] === 1 && dadi[1] === 1);
      say(S, `${u.name} vuole marciare a ${CH.MARCH_WATCH}″ dal nemico: Comando ${ld}, ` +
             `${dadi.join(" + ")} = ${tot} → ${passa ? "marcia" : "niente marcia"}.`,
          { dice: dadi, army: u.army, page: 123 });
      quanti = passa ? move * 2 : move;
    } else quanti = move * 2;
  }
  /* Il pollice dal nemico (p. 118), le unita' in mezzo e il bordo li
     guarda il percorso: prima si fermava a «distanza meno uno» misurata
     da bordo a bordo, e intanto il centro andava dritto dentro chi
     stava in mezzo. */
  const p = muoviVerso(S, u, t, quanti);
  u.moved = { kind: marcia ? "march" : "move", inches: p.pollici };
  say(S, `${u.name} ${marcia ? "marcia" : "avanza"} di ${p.pollici}″ verso ${t.name}` +
         (p.stop && p.pollici < quanti - 0.05 ? `, e si ferma: c'è ${p.stop.perche}` : "") + ".",
      { army: u.army, page: marcia ? 123 : 122 });
  return si("mossa");
}

/* Verso il nemico, girandosi a guardarlo. La ruota costa movimento e
   qui non si conta — sta fra i limiti dichiarati — ma girarsi non puo'
   far entrare il pezzo in un vicino: se succederebbe, si viaggia con la
   rotazione di prima. */
function muoviVerso(S, u, t, pollici, { ignora = [], unPollice = true } = {}){
  const dx = t.x - u.x, dy = t.y - u.y;
  let rot = versoDi(dx, dy);
  if (Math.abs(((rot - (u.rot || 0)) % 360 + 540) % 360 - 180) > 0.5){
    limite(S, "riforma");
    if (ingombro(S, u, { ...boxOf(u, S.units), rot }, { ignora, unPollice: false })) rot = u.rot || 0;
  }
  const p = percorso(S, u, [t.x, t.y], pollici, { rot, ignora, unPollice });
  if (p.stop && p.pollici < pollici - 0.05) limite(S, "ingombro");
  posa(S, u, p.x, p.y, rot);
  return p;
}
/* il fronte guarda verso -y quando rot e' 0: e' la convenzione del tavolo */
const versoDi = (dx, dy) => (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;

/* Il posto a contatto. `alignTo` mette il caricante contro la faccia da
   cui arriva; se li' c'e' gia' qualcuno — un altro reggimento che
   combatte con lo stesso bersaglio — si scorre lungo la STESSA faccia
   finche' si trova spazio. Cambiare faccia vorrebbe dire cambiare
   l'arco da cui si e' dichiarata la carica, e quello non si sceglie
   dopo. Torna anche quanto costa in piu' lo scorrere, perche' il tiro
   di carica deve bastare per arrivare dove si arriva davvero. */
function postoAContatto(S, u, t){
  const bu = boxOf(u, S.units), bt = boxOf(t, S.units);
  const al = CH.alignTo(bu, bt);
  if (!al) return null;
  const libero = (x, y) => !ingombro(S, u, { ...bu, x, y, rot: al.rot },
                                     { ignora: [t.uid], unPollice: false, bordo: true });
  const lungo = Math.hypot(al.x - bu.x, al.y - bu.y);
  if (libero(al.x, al.y)) return { ...al, extra: 0 };
  /* la direzione della faccia: perpendicolare alla rotazione di chi
     carica, che guarda dentro la faccia */
  const a = al.rot * Math.PI / 180;
  const tx = Math.cos(a), ty = Math.sin(a);
  const lim = (Math.max(bt.w, bt.h) + bu.w) / 2;
  for (let s = MM / 4; s <= lim; s += MM / 4){
    for (const segno of [1, -1]){
      const x = al.x + tx * s * segno, y = al.y + ty * s * segno;
      if (!libero(x, y)) continue;
      /* ancora a contatto con il bersaglio? */
      const poly = boxCorners({ ...bu, x, y, rot: al.rot });
      if (polyDistance(poly, cornersOf(t, S.units)) > MM * 0.1) continue;
      const extra = Math.max(0, Math.hypot(x - bu.x, y - bu.y) - lungo);
      return { ...al, x, y, extra: inch(extra), scorso: r1(inch(s)) };
    }
  }
  return { ...al, pieno: true };
}

function muoviCarica(S, u, t, d){
  const spec = CH.chargeDice({ swift: MV.swiftOf(u) });
  const dadi = roll(spec.n);
  /* il bersaglio puo' essere scappato: si misura adesso, non alla
     dichiarazione (p. 121) */
  const scappato = !!t.fled;
  if (scappato) limite(S, "ridirezione");
  const dist = scappato ? distanza(S, u, t) : d.dist;
  const posto = scappato ? null : postoAContatto(S, u, t);
  const serve = r1(dist + (posto && posto.extra ? posto.extra : 0));
  const out = CH.chargeOutcome({ dice: dadi, spec, move: d.move, dist: serve });
  /* chi e' fuggito fuori dal tavolo non si raggiunge piu' */
  const uscito = scappato && !!t.dead;
  const arriva = out.made && !uscito && !(posto && posto.pieno) && (scappato || posto);
  if (!arriva){
    /* la carica fallita muove comunque di quello che ha tirato (p. 121),
       e si ferma dove si fermerebbe chiunque */
    const p = muoviVerso(S, u, t, Math.min(out.reach, Math.max(0, dist)), { unPollice: true });
    u.moved = { kind:"failedCharge", inches: p.pollici };
    const perche = uscito ? `ma ${t.name} è già fuori dal tavolo`
      : posto && posto.pieno && out.made
      ? `arriverebbe, ma sulla faccia di ${t.name} non c'è posto`
      : `ne servivano ${serve}${posto && posto.extra ? ` (${r1(posto.extra)} per scorrere lungo la faccia)` : ""}`;
    say(S, `${u.name} carica ${t.name}: ${dadi.join(", ")} → ${out.reach}″, ${perche}. Non arriva, ` +
           `e avanza di ${p.pollici}″.`,
        { dice: dadi, army: u.army, page: 121 });
    return "carica fallita";
  }
  if (scappato){
    /* Chi e' fuggito davanti alla carica e viene raggiunto lo stesso e'
       travolto: e' la stessa regola dell'inseguimento (p. 156), e il
       caricante finisce dove quello stava. */
    const p = muoviVerso(S, u, t, out.reach, { ignora: [t.uid], unPollice: false });
    t.dead = true; t.placed = false;
    posa(S, t, t.x, t.y);
    u.moved = { kind:"charge", inches: p.pollici };
    say(S, `${u.name} carica ${t.name} che fugge: ${dadi.join(", ")} → ${out.reach}″ contro ${serve} richiesti. ` +
           `La raggiunge, e ${t.name} è travolta e distrutta.`,
        { dice: dadi, army: u.army, page: 121 });
    return "carica su chi fugge";
  }
  /* E adesso a contatto davvero. Muovere «verso» il bersaglio e
     fermarsi a un decimo di pollice non e' una carica: le basette non
     si toccano, e chi guarda i contatti non vede nessun combattimento. */
  posa(S, u, posto.x, posto.y, posto.rot);
  u.charged = { target: t.name, uid: t.uid, inches: d.dist, arc: posto.arc };
  u.moved = { kind:"charge", inches: serve };
  say(S, `${u.name} carica ${t.name} e arriva: ${dadi.join(", ")} → ${out.reach}″ contro ${serve} richiesti, ` +
         `e la prende di ${posto.arc}` +
         (posto.scorso ? ` (scorre di ${posto.scorso}″ lungo la faccia: c'era già qualcuno)` : "") + ".",
      { dice: dadi, army: u.army, page: 121 });
  return "carica a segno";
}

/* La fuga: via dal nemico, girati a guardare dove si va. Chi fugge
   passa attraverso le unita' (p. 133 — il test di Pericolo e' fra i
   limiti), ma non si ferma dentro nessuno: se il punto d'arrivo e'
   occupato va avanti finche' trova posto. Fuori dal tavolo — anche solo
   con un angolo — e' fuori dalla partita (p. 132). */
function fuggi(S, u, da, pollici){
  const dx = u.x - da.x, dy = u.y - da.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const rot = versoDi(dx, dy);
  const box = boxOf(u, S.units);
  let mm = pollici * MM;
  const at = s => ({ ...box, x: u.x + ux * s, y: u.y + uy * s, rot });
  const attraversa = S.units.some(o => o !== u && onBoard(o) && !isJoined(o) &&
    polysOverlap(boxCorners({ ...box, x: u.x + ux * mm / 2, y: u.y + uy * mm / 2, rot }), cornersOf(o, S.units)));
  if (attraversa) limite(S, "attraversare");
  while (ingombro(S, u, at(mm), { unPollice: false, bordo: false }) && dentroTavolo(S, boxCorners(at(mm))))
    mm += PASSO;
  const b = at(mm);
  u.fled = true;
  u.charged = null;
  u.moved = { kind:"flee", inches: pollici };
  posa(S, u, b.x, b.y, rot);
  if (!dentroTavolo(S, boxCorners(b))){
    u.dead = true; u.placed = false; u.fledOff = true;
    posa(S, u, u.x, u.y, rot);
    say(S, `${u.name} esce dal tavolo e non torna (p. 132).`, { army: u.army, page: 132 });
  } else if (mm > pollici * MM + 0.5)
    say(S, `${u.name} non può fermarsi addosso a un'altra unità: fugge fino a ${r1(inch(mm))}″.`,
        { army: u.army, page: 133 });
}

/* ---- il tiro ---- */
/* Ha mosso, per il tiro (p. 138): stare fermi no, radunarsi si' (p. 117). */
const haMosso = u => !!u.moved && u.moved.kind !== "still";
/* I modificatori del tiro, gli stessi del pannello (`SH.modsFor`): il
   bersaglio sciolto e il «tira e tiene» l'arbitro non li passava, e la
   reazione alla carica sparava senza il suo −1. */
function modificatori(S, u, t, d, gittata, { standAndShoot = false } = {}){
  return SH.shootMods({ long: d > gittata / 2, moved: haMosso(u) && !standAndShoot,
                        cover: coperturaDi(S, t) ? "soft" : "",
                        looseTarget: !!t.loose, standAndShoot });
}

/* Il limite delle sagome si dice solo quando conta: una macchina da
   guerra, o un'arma che nel nome o nelle regole porta la sagoma. Prima
   usciva al primo giavellotto. */
const RE_SAGOMA = /template|sagoma|cannon|cannone|stone ?thrower|lanciapietre|catapult|mortar|mortaio|lightning|fulmine|flame|fiamm|breath|soffio/i;
function sagomaOMacchina(u, arma){
  if (troopType(u.troop).id === "warMachine") return true;
  return RE_SAGOMA.test(arma.name || "") || (arma.rules || []).some(r => RE_SAGOMA.test(String(r)));
}
function tiro(S, u, t, arma, { standAndShoot = false } = {}){
  const d = distanza(S, u, t);
  const gittata = stat(arma.range);
  if (d > gittata){ say(S, `${u.name} non arriva: ${d}″ con una gittata di ${gittata}″.`, { army: u.army }); return; }
  if (sagomaOMacchina(u, arma)) limite(S, "sagome");
  const mods = modificatori(S, u, t, d, gittata, { standAndShoot });
  const r = CB.shootRoll(u, t, { weapon: arma, mods: mods.total });
  perdite(S, t, r.kills, r.left);
  const tutti = mucchi(r);
  say(S, `${u.name} tira su ${t.name} con ${arma.name} da ${d}″: ${r.shots} tiri a ${r.hitNeed}+, ` +
         `${r.hit.hits} ${r.hit.hits === 1 ? "colpo" : "colpi"}, ${r.wounds} ferit${r.wounds === 1 ? "a" : "e"}, ${r.kills} a terra` +
         (mods.list && mods.list.length ? ` [${mods.list.map(m => m.why).join(", ")}]` : "") + ".",
      { dice: tutti.flat, groups: tutti.groups, army: u.army, page: 136 });
  if (r.kills > 0) panico(S, t, r.kills, `il tiro di ${u.name}`);
}

/* Torna vero se l'unita' e' appena sparita. `zitto` e' per la mischia,
   che lo dice dopo il conto del combattimento e non in mezzo ai colpi. */
function perdite(S, u, kills, left = null, { zitto = false } = {}){
  let sparita = false;
  if (kills > 0){
    u.lost = Math.min(u.models, (u.lost || 0) + kills);
    if (alive(u) <= 0){
      u.dead = true; u.placed = false; sparita = true;
      posa(S, u, u.x, u.y);
      if (!zitto) say(S, `${u.name}: non resta nessuno in piedi.`, { army: u.army });
    }
  }
  if (left != null) u.wounds = left;
  return sparita;
}

/* Il Panico oltre un quarto (p. 141): il conto lo fa `psych.js`, il
   test lo tira qui, e chi fallisce fugge. */
function panico(S, u, persi, why){
  if (u.dead) return;
  /* Il quarto perso si conta sulla Forza d'Unita' di partenza (p. 141):
     e' il conto che il tavolo sbaglia sempre, e qui si fa prima di
     chiedere a `psych.js` se il test si tira. */
  const usPrima = unitStrength(u.troop, u.us, u.models, u.models, stat((u.stats || {}).W));
  const usAdesso = usOf(u);
  if (usPrima - usAdesso <= usPrima / 4) return;
  const p = PS.psychOf(u, { joined: FM.attachedTo(S.units, u) });
  const c = PS.panicCheck({ cause:"casualties", me: p,
                            fleeing: !!u.fled, engaged: ingaggiata(S, u), sourceName: why });
  if (!c || !c.must) return;
  if (c.auto){ say(S, `${u.name}: niente Panico — ${c.autoWhy}.`, { army: u.army, page: c.page }); return; }
  const dadi = roll(PS.coldDice("panic", p) ? 3 : 2);
  const res = PS.psychTest({ kind:"panic", ld: ldOf(S, u), dice: dadi, p });
  say(S, `${u.name}, test di Panico (${c.why}): ${res.text}.`,
      { dice: dadi, army: u.army, page: PS.PAGE.panicShooting });
  if (!res.passed){
    const da = piuVicino(S, u) || u;
    const via = roll(2).reduce((s, v) => s + v, 0);
    fuggi(S, u, da, via);
    say(S, `${u.name} va nel panico e fugge di ${via}″.`, { army: u.army, page: 132 });
  }
}

/* ============================================================
   8 · LA MISCHIA, DALLA PRIMA FERITA ALL'INSEGUIMENTO
   Qui l'arbitro non fa quasi niente: chiama `meleeFight` con i due
   gruppi — che e' esattamente la firma che questa tappa ha cambiato —
   e poi porta sul tavolo quello che torna. Le perdite, i test di rotta
   uno per unita', le mosse all'indietro, l'inseguimento.
   ============================================================ */
function mischia(S, g){
  for (const u of [...g.A, ...g.B]) u.fought = chiave(S);
  const A = g.A.map(u => schieraDi(S, u)), B = g.B.map(u => schieraDi(S, u));
  /* i personaggi uniti entrano nel gruppo come schiere loro (p. 209) */
  for (const [lista, sorgente] of [[A, g.A], [B, g.B]]){
    for (const u of sorgente)
      for (const c of FM.attachedTo(S.units, u))
        lista.push(schieraDi(S, c, { attached: true, host: u }));
  }
  const round = (S.turno * 2) + (S.army === "A" ? 0 : 1);
  const r = CB.meleeFight(A, B, { round });

  /* ogni colpo finisce nel registro, anche quello andato a vuoto: una
     partita che racconta solo i colpi riusciti non insegna a leggere i
     dadi. I dadi sono tutti, ognuno nel suo mucchio: per colpire, per
     ferire, l'armatura, la salvezza speciale, quanti colpi automatici. */
  for (const s of r.steps){
    const tutti = mucchi(s);
    say(S, `${s.name} ${s.label} su ${s.foe}: ${s.attacks} ${s.attacks === 1 ? "attacco" : "attacchi"}, ` +
           (s.hit.dice.length ? `${s.hit.hits} ${s.hit.hits === 1 ? "colpo" : "colpi"}, ` : "") +
           `${s.wounds} ferit${s.wounds === 1 ? "a" : "e"}, ${s.kills} a terra.`,
        { dice: tutti.flat, groups: tutti.groups, army: s.side === "A" ? "A" : "B", page: 144 });
  }

  /* le perdite, unità per unità: chi muore si dice dopo il conto */
  const caduti = [];
  for (const tag of ["A", "B"]){
    const schiere = r.sides[tag];
    schiere.forEach((c, i) => {
      const u = c.ref;
      if (!u) return;
      const kills = r.kills[tag][i] || 0;
      if (perdite(S, u, kills, c.spill || 0, { zitto: true })) caduti.push(u);
    });
  }

  const nomi = l => l.map(u => u.name).join(" e ");
  const parti = sc => sc.parts.map(p => `${p.v} ${p.v === 1 ? p.one : p.many}`).join(" + ");
  say(S, `Risultato: ${nomi(g.A)} ${r.cr.A.total} (${parti(r.cr.A) || "niente"}) contro ` +
         `${nomi(g.B)} ${r.cr.B.total} (${parti(r.cr.B) || "niente"}).` +
         (r.cr.winner ? ` Vince ${r.cr.winner === "A" ? nomi(g.A) : nomi(g.B)} di ${r.cr.diff}.` : " Pareggio."),
      { page: ML.PAGE.multiple });
  for (const u of caduti) say(S, `${u.name}: non resta nessuno in piedi.`, { army: u.army });

  /* i test di rotta, uno per unita' che ha perso (p. 154) */
  for (const t of r.tests || []){
    const c = r.sides[t.side][t.at || 0];
    const u = c && c.ref;
    if (!u || !onBoard(u)) continue;
    const loro = (t.side === "A" ? g.B : g.A).filter(onBoard);
    say(S, `${u.name}: ${t.text}` + (c.ldGen ? ` [${c.ldGen}]` : ""), { dice: t.dice, army: u.army, page: t.page });
    if (t.outcome === "rout"){
      const vincitore = piuVicino(S, u, loro) || loro[0];
      const dadi = roll(2);
      const via = dadi.reduce((s, v) => s + v, 0) + CB.fleeBonusOf(u).mod;
      say(S, `${u.name} rompe e fugge di ${via}″.`, { dice: dadi, army: u.army, page: 132 });
      if (vincitore) fuggi(S, u, vincitore, via); else u.fled = true;
      /* e chi ha vinto insegue (p. 156) */
      inseguimento(S, vincitore, u, via);
    } else if (t.outcome === "give"){
      const vicini = aContatto(S, u, loro);
      const fatto = indietreggia(S, u, loro, CH.GIVE_GROUND, { kind: "give" });
      if (fatto) seguire(S, vicini, u, fatto);
    } else if (t.outcome === "fallBack"){
      /* 2D6 e si tiene il maggiore (p. 134): prima si sommavano */
      const dadi = roll(2);
      const quanto = Math.max(...dadi);
      say(S, `${u.name} ripiega in ordine: ${dadi.join(", ")}, si tiene il maggiore.`,
          { dice: dadi, army: u.army, page: 134 });
      indietreggia(S, u, loro, quanto, { kind: "fallBack" });
      limite(S, "seguire");
    }
  }
  /* chi ha vinto e non ha piu' nessuno davanti sfonda */
  if (r.wiped){
    const vincitori = r.wiped === "A" ? g.B : g.A;
    for (const w of vincitori)
      if (onBoard(w)) say(S, `${w.name} sfonda: davanti non è rimasto nessuno (p. 156).`,
                          { army: w.army, page: 156 });
  }
  return "combattimento risolto";
}

/* I dadi di un colpo, mucchio per mucchio, e tutti in fila per chi
   legge solo la fila. */
function mucchi(s){
  const groups = [];
  if (s.autoDice && s.autoDice.length) groups.push({ what: "quanti", dice: s.autoDice });
  for (const [k, what] of [["hit", "colpire"], ["wound", "ferire"], ["save", "armatura"],
                           ["ward", "speciale"], ["regen", "rigenerazione"]]){
    const p = s[k];
    /* un tiro salvezza che il bersaglio non ha si tira lo stesso a
       7+, e non va mostrato: e' rumore, non un dado della partita */
    if (!p || !p.dice || !p.dice.length || +p.need >= 7) continue;
    groups.push({ what: p.need ? `${what} ${p.need}+` : what, dice: p.dice });
  }
  return { groups, flat: groups.flatMap(x => x.dice) };
}

/* chi, fra i nemici del gruppo, tocca ancora quest'unita' */
function aContatto(S, u, loro){
  const mio = cornersOf(u, S.units);
  return loro.filter(o => polyDistance(mio, cornersOf(o, S.units)) <= MM * 0.15);
}

/* La schiera che combatte, con addosso quello che il tavolo sa: chi ha
   caricato e da che faccia, il terreno, i personaggi uniti. */
function schieraDi(S, u, { attached = false, host = null } = {}){
  const c = CB.combatant(u, { joined: FM.attachedTo(S.units, u) });
  /* il test di rotta si tira con il Comando del generale, se e' vicino:
     si rifa' il conto della Warband sopra il valore nuovo */
  const gen = comandoDi(S, attached && host ? host : u, +(c.ldBase || c.ld) || 0);
  if (gen.why){
    const ranks = c.disrupted ? 0 : rankBonus(c.models, c.frontage,
      c.troop ? c.troop.maxRank : 2, c.troop ? c.troop.perRank : 5);
    const lead = PS.leadershipOf(gen.ld, c.psych, { rankBonus: ranks, fleeing: !!u.fled });
    if (lead.value > c.ld){ c.ld = lead.value; c.ldGen = gen.why; }
  }
  if (attached){
    c.attached = true; c.shielded = true;
    const truppa = host ? alive(host) : 0;
    c.exposed = truppa > 0 && truppa < 5;
  }
  return c;
}

/* Cedere terreno e ripiegare in ordine (p. 134).

   La direzione e' quella di `charge.js`: via dal nemico con la Forza
   d'Unita' piu' alta, e in diagonale quando sono due alla pari.

   Chi CEDE TERRENO si ferma dove il libro dice — un'altra unita', un
   pollice da un nemico — e contro il bordo, che il libro non nomina:
   l'arbitro lo ferma li', ed e' una scelta dichiarata (`bordo`).

   Chi RIPIEGA IN ORDINE «si muove esattamente come un'unita' in fuga»:
   passa attraverso, non si ferma dentro nessuno, e se tocca il bordo
   esce (p. 132). Resta girato verso il nemico e non fugge.

   Prima di questa versione il controllo del bordo leggeva `p.x` e `p.y`
   da angoli che sono coppie `[x, y]`: ogni unita' risultava fuori dal
   tavolo anche al centro, chi cedeva terreno restava fermo e chi
   ripiegava in ordine usciva dalla partita. Una Temple Guard intera e'
   sparita cosi', a mezzo tavolo dal bordo.

   Torna lo spostamento fatto, che serve a chi segue. */
function indietreggia(S, u, nemici, pollici, { kind = "give" } = {}){
  const box = boxOf(u, S.units);
  const dir = CH.awayFrom(box, nemici.map(o => ({ name: o.name, box: boxOf(o, S.units), us: usOf(o) })));
  if (!dir) return null;
  const [ux, uy] = dir.dir;
  const x0 = u.x, y0 = u.y;
  if (kind === "give"){
    const p = percorso(S, u, [u.x + ux * 1000 * MM, u.y + uy * 1000 * MM], pollici,
                       { rot: u.rot || 0, devia: false, bordo: true });
    posa(S, u, p.x, p.y, u.rot);
    const corto = p.pollici < pollici - 0.05;
    if (corto && p.stop && p.stop.chi == null) limite(S, "bordo");
    say(S, `${u.name} cede terreno di ${p.pollici}″` +
           (dir.from.length ? ` lontano da ${dir.from.join(" e ")}` : "") +
           (corto && p.stop ? `: si ferma contro ${p.stop.perche}` : "") + ".",
        { army: u.army, page: 134 });
    return { dx: u.x - x0, dy: u.y - y0 };
  }
  /* ripiegare: come la fuga, senza girarsi */
  let mm = pollici * MM;
  const at = s => ({ ...box, x: x0 + ux * s, y: y0 + uy * s });
  while (ingombro(S, u, at(mm), { unPollice: false, bordo: false }) && dentroTavolo(S, boxCorners(at(mm))))
    mm += PASSO;
  const b = at(mm);
  posa(S, u, b.x, b.y, u.rot);
  if (!dentroTavolo(S, boxCorners(b))){
    u.dead = true; u.placed = false; u.fledOff = true;
    posa(S, u, u.x, u.y, u.rot);
    say(S, `${u.name} ripiega di ${r1(inch(mm))}″, oltre il bordo, ed esce dal tavolo (pp. 132, 134).`,
        { army: u.army, page: 134 });
    return null;
  }
  say(S, `${u.name} ripiega di ${r1(inch(mm))}″` +
         (dir.from.length ? ` lontano da ${dir.from.join(" e ")}` : "") +
         (mm > pollici * MM + 0.5 ? ", oltre chi aveva dietro" : "") + ".",
      { army: u.army, page: 134 });
  return { dx: u.x - x0, dy: u.y - y0 };
}

/* Chi ha vinto segue chi cede terreno, dello stesso tratto, e il
   combattimento continua al turno dopo senza una carica nuova. Prima
   nessuno seguiva: il vincitore restava fermo, il perdente due pollici
   piu' in la', e al turno dopo lo stesso reggimento «caricava» da
   mezzo pollice. Segue solo chi non ha altri nemici addosso, e solo se
   c'e' posto. */
function seguire(S, vicini, perdente, { dx, dy }){
  if (!onBoard(perdente) || Math.hypot(dx, dy) < 0.5) return;
  limite(S, "seguire");
  for (const w of vicini){
    if (!onBoard(w) || w.fled) continue;
    const altri = aContatto(S, w, nemiciDi(S, w).filter(o => o !== perdente));
    if (altri.length) continue;
    const dove = { ...boxOf(w, S.units), x: w.x + dx, y: w.y + dy };
    const blocco = ingombro(S, w, dove, { ignora: [perdente.uid], unPollice: false });
    if (blocco){
      say(S, `${w.name} non può seguire: c'è ${blocco.perche}.`, { army: w.army, page: 134 });
      continue;
    }
    posa(S, w, dove.x, dove.y, w.rot);
    say(S, `${w.name} segue ${perdente.name} e resta a contatto.`, { army: w.army, page: 134 });
  }
}

/* L'inseguimento (p. 156): chi ha vinto tira, e si muove davvero —
   prima restava fermo anche quando travolgeva. Non insegue chi ha
   ancora un altro nemico addosso. */
function inseguimento(S, vincitore, fuggito, quantoHaFuggito){
  if (!vincitore || !onBoard(vincitore) || vincitore.fled) return;
  const altri = aContatto(S, vincitore, nemiciDi(S, vincitore).filter(o => o !== fuggito));
  if (altri.length){
    say(S, `${vincitore.name} non insegue: combatte ancora con ${altri.map(o => o.name).join(" e ")}.`,
        { army: vincitore.army, page: ML.PAGE.pursuit });
    return;
  }
  const spec = ML.pursuitDice(MV.swiftOf(vincitore));
  const dadi = roll(spec.n);
  const tot = dadi.reduce((s, v) => s + v, 0);
  const out = ML.pursuitOutcome({ roll: tot, flee: quantoHaFuggito, wiped: false });
  const uscita = !!fuggito.fledOff;
  say(S, uscita ? `${vincitore.name} insegue di ${tot}″: ${fuggito.name} è già fuori dal tavolo.`
                : `${vincitore.name} ${out.text}.`,
      { dice: dadi, army: vincitore.army, page: ML.PAGE.pursuit });
  if (out.caught && !uscita){
    fuggito.dead = true; fuggito.placed = false;
    posa(S, fuggito, fuggito.x, fuggito.y);
    say(S, `${fuggito.name} è travolta e distrutta.`, { army: fuggito.army, page: ML.PAGE.pursuit });
  }
  /* il passo di chi insegue: verso dove l'altro e' andato, fermandosi
     a contatto con un nemico nuovo se lo incontra */
  const p = muoviVerso(S, vincitore, fuggito, tot, { ignora: [fuggito.uid], unPollice: false });
  if (p.pollici > 0)
    say(S, `${vincitore.name} avanza di ${p.pollici}″ inseguendo` +
           (p.stop && p.stop.chi && p.stop.chi.army !== vincitore.army ? ` e arriva addosso a ${p.stop.chi.name}` : "") + ".",
        { army: vincitore.army, page: ML.PAGE.pursuit });
}


/* ============================================================
   9 · IL TEMPO CHE PASSA
   Le caselle, i turni, e la fine. Un passo avanti si fa quando chi
   gioca ha finito, e l'arbitro non lo fa da solo: la partita e' di chi
   la gioca, anche quando chi la gioca e' una macchina.
   ============================================================ */
function fineSchieramento(S){
  S.schierando = false;
  S.army = S.primo;
  S.casella = 0;
  S.turno = 1;
  for (const u of S.units) u.anchor = null;
  say(S, `Schieramento finito: comincia il turno 1, muove ${S.nomi[S.army]}.`, { page: 115 });
}

function passo(S){
  if (S.schierando){
    /* «avanti» durante lo schieramento vuol dire «questa non la
       schiero»: si passa all'altro, e se nessuno ha piu' niente si
       comincia */
    const mia = daSchierare(S);
    if (mia){ mia.placed = false; mia.rinuncia = true; }
    S.army = S.army === "A" ? "B" : "A";
    if (!daSchierare(S)){
      S.army = S.army === "A" ? "B" : "A";
      if (!daSchierare(S)){ fineSchieramento(S); return "schieramento finito"; }
    }
    return "passa";
  }
  S.casella++;
  if (S.casella < CASELLE.length) return `si passa a: ${CASELLE[S.casella].what}`;

  /* fine del turno di questa parte */
  S.casella = 0;
  for (const u of S.units){ u.moved = null; u.shot = false; u.charged = null; }
  if (S.army !== S.primo){
    S.turno++;
    S.army = S.primo;
  } else {
    S.army = S.army === "A" ? "B" : "A";
  }
  if (S.turno > S.rounds){ fine(S, "sono finiti i turni"); return "partita finita"; }
  /* il punto di rottura si guarda adesso, che e' l'inizio di un turno */
  if (controllaFine(S, { inizioTurno: true })) return "partita finita";
  say(S, `Turno ${S.turno}: muove ${S.nomi[S.army]}.`, { page: 114 });
  return `turno ${S.turno}, tocca a ${S.nomi[S.army]}`;
}

/* ============================================================
   10 · CHI HA VINTO (p. 292)
   I punti vittoria li conta `victory.js`, che sa la tabella del
   margine. Qui si raccolgono le unita' perse e si guarda anche il
   punto di rottura: un esercito sotto un quarto della sua Forza
   d'Unita' di partenza ha perso comunque.
   ============================================================ */
export function punteggio(S){
  const conta = army => S.units.filter(u => u.army === army && !isJoined(u)).reduce((s, u) => {
    const share = VC.strengthShare({ models: u.models || 0, alive: alive(u),
                                     woundsPer: 1, woundsLost: 0 });
    return s + VC.unitVP({ pts: u.pts || 0, dead: !!u.dead, fledOff: !!u.fledOff,
                           fleeing: !!u.fled, share }).vp;
  }, 0);
  /* i punti che ho fatto sono quelli che l'altro ha perso */
  const A = conta("B"), B = conta("A");
  return { A, B, ...VC.victory(A, B, VC.formatFor(S.scenario)) };
}

export function rotto(S, army){
  return VC.broken(totalUS(S, army), S.usStart[army]);
}

export function fine(S, why){
  S.finita = true;
  const p = punteggio(S);
  S.esito = { ...p, why };
  say(S, `Partita finita (${why}). ${S.nomi.A} ${p.A} punti vittoria, ${S.nomi.B} ${p.B}. ` +
         (p.winner ? `${S.nomi[p.winner]} vince: ${p.label}.` : `${p.label}.`),
      { page: VC.PAGE ? VC.PAGE.victory || 292 : 292 });
  return S.esito;
}

/* Si controlla dopo ogni gesto: un esercito che non ha piu' niente in
   campo, o che e' sceso sotto il punto di rottura, ha finito. */
export function controllaFine(S, { inizioTurno = false } = {}){
  if (S.finita || S.schierando) return S.esito;
  for (const army of ["A", "B"]){
    /* chi ha ancora unita' da mettere in campo non ha perso: succede
       in riserva e negli scenari a rinforzi */
    const fuori = unitsOf(S, army).filter(u => !u.dead && !u.placed).length;
    if (!inCampo(S, army).length && !fuori)
      return fine(S, `${S.nomi[army]} non ha più nessuno in campo`);
    /* Il punto di rottura si guarda ALL'INIZIO DI UN TURNO (p. 291),
       non appena ci si scende: un esercito che scende sotto durante la
       fase di combattimento finisce il suo combattimento, e la partita
       si ferma dopo. Guardarlo a ogni gesto chiudeva la partita in
       mezzo a una mischia, lasciando i combattimenti degli altri a
       metà. */
    if (inizioTurno){
      const r = rotto(S, army);
      if (r && r.broken)
        return fine(S, `${S.nomi[army]} è sotto il punto di rottura: ` +
                       `Forza d'Unità ${r.usNow} contro le ${r.bp} che servivano (p. ${r.page})`);
    }
  }
  return null;
}

/* ============================================================
   11 · LA PARTITA VISTA DA CHI DEVE DECIDERE
   Una fotografia in parole: dove sta ognuno, quanto ne resta, chi
   tocca chi. E' quello che si mette davanti a chi gioca — un umano che
   legge, o un modello di linguaggio che deve scegliere una mossa — e
   per tutti e due vale la stessa regola: niente numeri senza unita' di
   misura, niente sigle, e le distanze in pollici come al tavolo.
   ============================================================ */
export function fotografia(S, { per = null } = {}){
  const io = per || S.army, lui = io === "A" ? "B" : "A";
  const riga = u => {
    const mv = moveInfo(u);
    const c = CB.combatant(u);
    const vicino = piuVicino(S, u);
    return `  · ${u.name} — ${alive(u)}/${u.models} modelli, ${u.pts || 0} pt, ` +
      `M ${mv.m || "?"}, WS ${c.ws}, S ${c.s}, T ${c.t}, Ld ${c.ld}` +
      (u.fled ? ", IN FUGA" : "") +
      (ingaggiata(S, u) ? ", in mischia" : "") +
      (vicino ? `, nemico più vicino ${vicino.name} a ${distanza(S, u, vicino)}″` : "");
  };
  const mie = inCampo(S, io), sue = inCampo(S, lui);
  const fuori = S.units.filter(u => u.army === io && !u.dead && !u.placed && !isJoined(u));
  return [
    `Turno ${S.turno} di ${S.rounds}. Tavolo ${S.table.wIn}×${S.table.hIn}″, scenario «${S.sc.label}».`,
    `Tu sei ${S.nomi[io]} (${S.punti[io]} punti). L'avversario è ${S.nomi[lui]} (${S.punti[lui]}).`,
    `Le tue unità in campo:`, ...mie.map(riga),
    fuori.length ? `Ancora da schierare: ${fuori.map(u => u.name).join(", ")}.` : "",
    `Le sue unità in campo:`, ...sue.map(riga),
    `Punti vittoria adesso: tu ${punteggio(S)[io]}, lui ${punteggio(S)[lui]}.`,
  ].filter(Boolean).join("\n");
}

/* Il registro in parole, dall'ultima riga indietro: serve a chi entra
   adesso — e un modello di linguaggio entra adesso a ogni mossa. */
export function ultimeRighe(S, n = 12){
  return S.log.slice(-n).map(r =>
    `T${r.turno} ${r.text}` + (r.page ? ` (p. ${r.page})` : "")).join("\n");
}

/* Per le prove: i pezzi del tavolo che nessuna opzione espone da sola,
   e che vanno provati uno per uno con i pezzi messi a mano. */
export const interni = { indietreggia, seguire, fuggi, postoAContatto, percorso, comandoDi, ldOf, muoviCarica };
