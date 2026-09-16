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
import { boxCorners, polyDistance, pointInRect } from './geom.js';
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
import { roll, leadershipTest, stat } from './rules.js';
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

/* Da una lista salvata a un esercito sul tavolo. Le unita' sono quelle
   del file, con addosso i campi che il tavolo aggiunge: dove stanno,
   quanti ne sono caduti, se stanno fuggendo. */
export function armyFrom(lista, army, from = 0){
  return (lista.units || []).map((p, i) => ({
    uid: from + i + 1, army, ...p,
    x: 0, y: 0, rot: army === "A" ? 0 : 180,
    placed: false, lost: 0, dead: false, fled: false, wounds: 0,
    fallen: [], effects: [], anchor: null,
  }));
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
  return S;
}

const totalUS = (S, army) => S.units
  .filter(u => u.army === army && !u.dead).reduce((s, u) => s + usOf(u), 0);

/* ============================================================
   2 · IL REGISTRO
   Ogni riga dice chi, cosa, con quali dadi e da che pagina. E' quello
   che resta della partita, ed e' l'unica cosa che una partita giocata
   da due macchine lascia a chi la legge.
   ============================================================ */
function say(S, text, { page = 0, dice = null, army = "", kind = "" } = {}){
  const riga = { turno: S.turno, army: army || S.army, casella: CASELLE[S.casella] ? CASELLE[S.casella].id : "",
                 text, page, dice, kind };
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
      const y = u.army === "A"
        ? z.y + z.h - lay.h / 2 - MM - f * passo
        : z.y + lay.h / 2 + MM + f * passo;
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
    const lead = PS.rallyLeadership(ldOf(S, u), { models: alive(u), start: u.models || 0,
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
      out.push({ id:"carica", uid: u.uid, target: t.uid, nome: u.name, contro: t.name,
                 why: `${d.dist}″, ${d.need ? "serve " + d.need + "″ di tiro" : "ci arriva camminando"}` +
                      `, riesce il ${Math.round(d.chance * 100)}%, la prende di ${d.side}`,
                 chance: d.chance, page: 119 });
    }
  }
  out.sort((a, b) => b.chance - a.chance);
  return [...out, avanti("nessun'altra carica")];
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
    out.push({ id:"avanza", uid: u.uid, verso: t.uid, nome: u.name, contro: t.name,
               why: `${move}″ verso ${t.name}, che è a ${d}″` + (mv.why ? ` (${mv.why})` : ""),
               page: 122 });
    out.push({ id:"marcia", uid: u.uid, verso: t.uid, nome: u.name, contro: t.name,
               why: `${move * 2}″ verso ${t.name}` +
                    (d <= CH.MARCH_WATCH ? `, ma a ${CH.MARCH_WATCH}″ da un nemico serve un test di Comando (p. 123)` : ""),
               page: 123 });
    out.push({ id:"ferma", uid: u.uid, nome: u.name, why: "resta dov'è: chi non muove spara meglio", page: 138 });
  }
  return [...out, avanti("nessun'altra mossa")];
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
      const mods = SH.shootMods({ long: d > gittata / 2, moved: !!u.moved, cover: coperturaDi(S, t) ? "soft" : "" });
      const f = CB.shootForecast(u, t, { weapon: arma, mods: mods.total });
      out.push({ id:"tira", uid: u.uid, target: t.uid, nome: u.name, contro: t.name,
                 why: `${f.shots} tiri con ${arma.name} da ${d}″, colpisce a ${f.hitNeed}+` +
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
function ldOf(S, u){
  const p = PS.psychOf(u, { joined: FM.attachedTo(S.units, u) });
  const c = CB.combatant(u);
  return PS.leadershipOf(c.ldBase || c.ld, p, { fleeing: !!u.fled }).value;
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
  const d = distanza(S, u, t);
  /* non si finisce mai entro un pollice da un nemico (p. 118) */
  const max = Math.max(0, Math.min(quanti, d - 1));
  muoviVerso(S, u, t, max);
  u.moved = { kind: marcia ? "march" : "move", inches: max };
  say(S, `${u.name} ${marcia ? "marcia" : "avanza"} di ${r1(max)}″ verso ${t.name}` +
         (max < quanti ? ", e si ferma a 1″ (p. 118)" : "") + ".",
      { army: u.army, page: marcia ? 123 : 122 });
  return si("mossa");
}

function muoviVerso(S, u, t, pollici){
  const dx = t.x - u.x, dy = t.y - u.y;
  const len = Math.hypot(dx, dy) || 1;
  u.x += dx / len * pollici * MM;
  u.y += dy / len * pollici * MM;
  /* e si gira verso il nemico: la ruota costa movimento, e qui non si
     conta — sta fra i limiti dichiarati */
  limite(S, "riforma");
  u.rot = versoDi(dx, dy);
  for (const c of S.units.filter(x => FM.joinedHost(x) === u.uid)){ c.x = u.x; c.y = u.y; c.rot = u.rot; }
}
/* il fronte guarda verso -y quando rot e' 0: e' la convenzione del tavolo */
const versoDi = (dx, dy) => (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;

function muoviCarica(S, u, t, d){
  const spec = CH.chargeDice({ swift: MV.swiftOf(u) });
  const dadi = roll(spec.n);
  const out = CH.chargeOutcome({ dice: dadi, spec, move: d.move, dist: d.dist });
  if (!out.made){
    /* la carica fallita muove comunque di quello che ha tirato (p. 121) */
    muoviVerso(S, u, t, Math.max(0, Math.min(out.reach, d.dist - 1)));
    u.moved = { kind:"failedCharge", inches: out.reach };
    say(S, `${u.name} carica ${t.name}: ${dadi.join(", ")} → ${out.reach}″, ne servivano ${d.dist}. Non arriva.`,
        { dice: dadi, army: u.army, page: 121 });
    return "carica fallita";
  }
  /* E adesso a contatto davvero. Muovere «verso» il bersaglio e
     fermarsi a un decimo di pollice non e' una carica: le basette non
     si toccano, e chi guarda i contatti non vede nessun combattimento.
     L'allineamento lo sa fare `charge.js`, che mette il caricante
     contro la faccia da cui e' arrivato e lo gira di conseguenza. */
  const al = CH.alignTo(boxOf(u, S.units), boxOf(t, S.units));
  if (al){
    u.x = al.x; u.y = al.y; u.rot = al.rot;
    for (const c of S.units.filter(x => FM.joinedHost(x) === u.uid)){ c.x = u.x; c.y = u.y; c.rot = u.rot; }
  } else muoviVerso(S, u, t, Math.max(0, d.dist));
  u.charged = { target: t.name, uid: t.uid, inches: d.dist, arc: al ? al.arc : d.side };
  u.moved = { kind:"charge", inches: d.dist };
  say(S, `${u.name} carica ${t.name} e arriva: ${dadi.join(", ")} → ${out.reach}″ contro ${d.dist} richiesti, ` +
         `e la prende di ${al ? al.arc : d.side}.`, { dice: dadi, army: u.army, page: 121 });
  return "carica a segno";
}

function fuggi(S, u, da, pollici){
  const dx = u.x - da.x, dy = u.y - da.y;
  const len = Math.hypot(dx, dy) || 1;
  u.x += dx / len * pollici * MM;
  u.y += dy / len * pollici * MM;
  u.fled = true;
  u.charged = null;
  u.moved = { kind:"flee", inches: pollici };
  /* fuori dal tavolo si e' fuori dalla partita (p. 132) */
  if (u.x < 0 || u.y < 0 || u.x > S.table.w || u.y > S.table.h){
    u.dead = true; u.placed = false; u.fledOff = true;
    say(S, `${u.name} esce dal tavolo e non torna (p. 132).`, { army: u.army, page: 132 });
  }
  for (const c of S.units.filter(x => FM.joinedHost(x) === u.uid)){
    c.x = u.x; c.y = u.y; c.fled = u.fled; c.dead = u.dead; c.placed = u.placed;
  }
}

/* ---- il tiro ---- */
function tiro(S, u, t, arma, { standAndShoot = false } = {}){
  const d = distanza(S, u, t);
  const gittata = stat(arma.range);
  if (d > gittata){ say(S, `${u.name} non arriva: ${d}″ con una gittata di ${gittata}″.`, { army: u.army }); return; }
  limite(S, "sagome");
  const mods = SH.shootMods({ long: d > gittata / 2, moved: !!u.moved && !standAndShoot,
                              cover: coperturaDi(S, t) ? "soft" : "" });
  const r = CB.shootRoll(u, t, { weapon: arma, mods: mods.total });
  perdite(S, t, r.kills, r.left);
  say(S, `${u.name} tira su ${t.name} con ${arma.name}: ${r.shots} tiri a ${r.hitNeed}+, ` +
         `${r.hit.hits} colpi, ${r.wounds} ferite, ${r.kills} a terra` +
         (mods.list && mods.list.length ? ` [${mods.list.map(m => m.why).join(", ")}]` : "") + ".",
      { dice: r.hit.dice, army: u.army, page: 136 });
  if (r.kills > 0) panico(S, t, r.kills, `il tiro di ${u.name}`);
}

function perdite(S, u, kills, left = null){
  if (kills > 0){
    u.lost = Math.min(u.models, (u.lost || 0) + kills);
    if (alive(u) <= 0){
      u.dead = true; u.placed = false;
      say(S, `${u.name} è stata spazzata via.`, { army: u.army });
    }
  }
  if (left != null) u.wounds = left;
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
     dadi */
  for (const s of r.steps)
    say(S, `${s.name} ${s.label} su ${s.foe}: ${s.attacks} attacchi, ` +
           (s.hit.dice.length ? `${s.hit.hits} colpi, ` : "") +
           `${s.wounds} ferit${s.wounds === 1 ? "a" : "e"}, ${s.kills} a terra.`,
        { dice: s.hit.dice, army: s.side === "A" ? "A" : "B", page: 144 });

  /* le perdite, unità per unità */
  for (const tag of ["A", "B"]){
    const schiere = r.sides[tag];
    schiere.forEach((c, i) => {
      const u = c.ref;
      if (!u) return;
      const kills = r.kills[tag][i] || 0;
      perdite(S, u, kills, c.spill || 0);
    });
  }

  const nomi = l => l.map(u => u.name).join(" e ");
  const parti = sc => sc.parts.map(p => `${p.v} ${p.v === 1 ? p.one : p.many}`).join(" + ");
  say(S, `Risultato: ${nomi(g.A)} ${r.cr.A.total} (${parti(r.cr.A) || "niente"}) contro ` +
         `${nomi(g.B)} ${r.cr.B.total} (${parti(r.cr.B) || "niente"}).` +
         (r.cr.winner ? ` Vince ${r.cr.winner === "A" ? nomi(g.A) : nomi(g.B)} di ${r.cr.diff}.` : " Pareggio."),
      { page: ML.PAGE.multiple });

  /* i test di rotta, uno per unita' che ha perso (p. 154) */
  for (const t of r.tests || []){
    const c = r.sides[t.side][t.at || 0];
    const u = c && c.ref;
    if (!u) continue;
    say(S, `${u.name}: ${t.text}`, { dice: t.dice, army: u.army, page: t.page });
    if (t.outcome === "rout"){
      const vincitore = piuVicino(S, u, (t.side === "A" ? g.B : g.A)) || (t.side === "A" ? g.B : g.A)[0];
      const dadi = roll(2);
      const via = dadi.reduce((s, v) => s + v, 0) + CB.fleeBonusOf(u).mod;
      fuggi(S, u, vincitore, via);
      say(S, `${u.name} rompe e fugge di ${via}″.`, { dice: dadi, army: u.army, page: 132 });
      /* e chi ha vinto insegue (p. 156) */
      inseguimento(S, vincitore, u, via);
    } else if (t.outcome === "fallBack" || t.outcome === "give"){
      const nemico = piuVicino(S, u, (t.side === "A" ? g.B : g.A));
      const quanto = t.outcome === "give" ? CH.GIVE_GROUND : roll(2).reduce((s, v) => s + v, 0);
      indietreggia(S, u, nemico, quanto, { comeFuga: t.outcome === "fallBack" });
      say(S, `${u.name} ${t.outcome === "give" ? "cede terreno" : "ripiega"} di ${quanto}″.`,
          { army: u.army, page: 134 });
    }
  }
  /* chi ha vinto e non ha piu' nessuno davanti sfonda */
  if (r.wiped){
    const vinti = r.wiped === "A" ? g.A : g.B, vincitori = r.wiped === "A" ? g.B : g.A;
    for (const w of vincitori)
      if (onBoard(w)) say(S, `${w.name} sfonda: davanti non è rimasto nessuno (p. 156).`,
                          { army: w.army, page: 156 });
  }
  return "combattimento risolto";
}

/* La schiera che combatte, con addosso quello che il tavolo sa: chi ha
   caricato e da che faccia, il terreno, i personaggi uniti. */
function schieraDi(S, u, { attached = false, host = null } = {}){
  const c = CB.combatant(u, { joined: FM.attachedTo(S.units, u) });
  if (attached){
    c.attached = true; c.shielded = true;
    const truppa = host ? alive(host) : 0;
    c.exposed = truppa > 0 && truppa < 5;
  }
  return c;
}

/* Cedere terreno e ripiegare in ordine, contro il bordo del tavolo.

   Chi ripiega in ordine «si muove esattamente come un'unita' in fuga»
   (p. 134), e un'unita' in fuga che tocca il bordo esce dalla partita
   (p. 132): qui vale lo stesso. Per chi cede terreno il libro elenca
   dove ci si ferma — un'altra unita', il terreno, un pollice da un
   nemico — e del bordo non dice niente. L'arbitro sceglie di fermarlo
   li', che e' l'unica lettura in cui due pollici di passo indietro non
   buttano fuori un'unita' che il test l'ha passato; ed e' una scelta,
   non una pagina. Prima non si fermava affatto, e un Bastiladon
   spinto indietro due volte finiva sotto il tavolo con i troll dietro. */
const sulTavolo = (S, u) => cornersOf(u, S.units).every(p =>
  p.x >= 0 && p.y >= 0 && p.x <= S.table.w && p.y <= S.table.h);
function indietreggia(S, u, da, pollici, { comeFuga = false } = {}){
  if (!da) return;
  const dx = u.x - da.x, dy = u.y - da.y;
  const len = Math.hypot(dx, dy) || 1;
  const x0 = u.x, y0 = u.y;
  const vai = p => { u.x = x0 + dx / len * p * MM; u.y = y0 + dy / len * p * MM; };
  vai(pollici);
  if (!sulTavolo(S, u)){
    if (comeFuga){
      u.dead = true; u.placed = false; u.fledOff = true;
      say(S, `${u.name} ripiega oltre il bordo ed esce dal tavolo (pp. 132, 134).`, { army: u.army, page: 134 });
    } else {
      /* a decimi di pollice, finche' sta tutta sul tavolo */
      let p = pollici;
      while (p > 0 && !sulTavolo(S, u)){ p = Math.max(0, p - 0.1); vai(p); }
      limite(S, "bordo");
      say(S, `${u.name} arriva al bordo del tavolo e si ferma dopo ${r1(p)}″.`, { army: u.army, page: 134 });
    }
  }
  for (const c of S.units.filter(x => FM.joinedHost(x) === u.uid)){
    c.x = u.x; c.y = u.y; c.dead = u.dead; c.placed = u.placed;
  }
}

function inseguimento(S, vincitore, fuggito, quantoHaFuggito){
  if (!vincitore || !onBoard(vincitore)) return;
  const spec = ML.pursuitDice(MV.swiftOf(vincitore));
  const dadi = roll(spec.n);
  const tot = dadi.reduce((s, v) => s + v, 0);
  const out = ML.pursuitOutcome({ roll: tot, flee: quantoHaFuggito, wiped: false });
  say(S, `${vincitore.name} ${out.text}.`, { dice: dadi, army: vincitore.army, page: ML.PAGE.pursuit });
  if (out.caught){
    fuggito.dead = true; fuggito.placed = false;
    say(S, `${fuggito.name} è travolta e distrutta.`, { army: fuggito.army, page: ML.PAGE.pursuit });
  }
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
