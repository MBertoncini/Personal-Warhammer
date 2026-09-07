/* Schieramento Old World — registro della partita e battle report
 *
 * La modalita' partita teneva il conto e poi lo dimenticava: finita la
 * serata restavano un tabellino e un registro di righe sciolte. Quello
 * che serve il giorno dopo e' un'altra cosa — la fotografia di com'era
 * il tavolo alla FINE DI OGNI TURNO: dove stava ogni unita', di quanto
 * si era mossa, quanti modelli aveva perso. E' li' dentro che sta la
 * risposta a "cosa e' andato storto", che non si ricostruisce mai a
 * memoria il martedi' dopo.
 *
 * La fotografia non e' solo «dove»: tiene anche quanto e' grande
 * l'unita' in quel momento (le perdite la accorciano), come e'
 * schierata, chi era a contatto di basetta con chi e da che lato, e
 * quali elementi scenici stava occupando — terreno compreso, che nel
 * frattempo qualcuno puo' aver spostato.
 *
 * Qui non c'e' ne' DOM ne' archivio: entrano lo stato del tavolo e le
 * fotografie, escono numeri e testo. L'archivio e i pannelli stanno in
 * reports.js, la partita in corso in game.js.
 *
 * Il testo esportato e' pensato per essere INCOLLATO A UN'INTELLIGENZA
 * ARTIFICIALE: Markdown, tabelle con intestazioni esplicite, unita' di
 * misura dichiarate una volta in cima e convenzioni scritte invece che
 * sottintese. Un modello che legge questo file deve poter dire in che
 * turno la partita e' girata senza dover indovinare cosa vuol dire una
 * colonna.
 */

import { inch } from './util.js';
import { TERRAIN } from './terrain.js';
import * as FM from './formation.js';
import * as EX from './extras.js';
import { zoneSnapshot, zoneKind } from './zones.js';

const r1 = v => Math.round(v * 10) / 10;
const pad2 = n => String(n).padStart(2, "0");
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const FORMAT = "schieramento-old-world/battle-report/1";

/* modelli ancora in piedi */
export const aliveOf = u => Math.max(0, (u.models || 0) - (u.lost || 0));

/* ============================================================
   1 · SCHEDA DELLA PARTITA
   ============================================================ */
export const emptyMeta = () => ({
  date: today(), place: "", event: "", playerA: "", playerB: "",
  first: "A",              // chi ha giocato il primo turno
  pts: 0,                  // punti concordati; 0 = lo deduce dalle liste
  rounds: 6,               // quanti turni erano previsti
});

export function ensureMeta(m){
  const base = emptyMeta();
  if (!m || typeof m !== "object") return base;
  return { ...base, ...m };
}

/* ============================================================
   2 · FOTOGRAFIE DI FINE TURNO
   Una fotografia e' una riga per unita': dov'e', quanto si e' mossa
   rispetto alla fotografia precedente, quanti modelli ha perso in
   QUESTO turno e quanti gliene restano.
   ============================================================ */

/* Dove sta un'unita', detto a parole. Le coordinate ci sono comunque,
   ma "meta' di B, corsia destra" e' quello che un lettore capisce
   subito — e un'AI che legge il report ragiona su quello. */
export function zoneOf(xIn, yIn, wIn, hIn){
  const lane = xIn < wIn / 3 ? "corsia sinistra"
             : xIn < wIn * 2 / 3 ? "corsia centrale" : "corsia destra";
  /* A schiera in basso (y alto), B in alto (y basso): la mediana e' a meta' */
  const half = yIn > hIn * 0.58 ? "metà di A"
             : yIn < hIn * 0.42 ? "metà di B" : "sulla mediana";
  return `${half} · ${lane}`;
}

/* ------------------------------------------------------------------
   Il tavolo com'e' adesso, letto una volta sola
   Ogni fotografia deve dire tre cose che prima non diceva: quanto e'
   grande adesso ciascuna unita' (le perdite la accorciano), chi sta
   toccando chi, e chi sta dentro quale pezzo di terreno. Sono tutte e
   tre conti sulla stessa geometria, e farli una volta per unita'
   invece che tre e' la differenza fra una fotografia istantanea e una
   che si sente.
   ------------------------------------------------------------------ */
function tableCtx(state){
  const units = state.units || [];
  const alive = u => Math.max(0, (u.models || 0) - (u.lost || 0));
  const hostOf = ch => {
    const id = (ch.join && ch.join.host != null) ? ch.join.host : null;
    if (id == null) return null;
    const h = units.find(u => u.uid === id);
    return (h && !h.dead) ? h : null;
  };
  const attachedTo = u => units.filter(c => {
    const h = c.uid !== u.uid && hostOf(c);
    return h && h.uid === u.uid;
  });
  const info = new Map();
  for (const u of units){
    const lay = FM.layout(u, { alive: Math.max(1, alive(u)), attached: attachedTo(u) });
    info.set(u.uid, {
      lay, host: hostOf(u), chars: attachedTo(u),
      box: FM.boxFromLayout(u, lay),
      cells: FM.worldCells(u, lay),
    });
  }
  const onBoard = units.filter(u => u.placed && !hostOf(u) && !u.dead);
  return { info, hostOf, attachedTo, alive, onBoard, terrain: state.terrain || [] };
}

/* l'ultima riga registrata per ogni unita': serve a misurare il
   movimento e a portarsi avanti lo stato nella compilazione a mano */
export function lastRecords(turns){
  const map = new Map();
  for (const t of turns || []) for (const r of t.units || []) map.set(r.uid, r);
  return map;
}

export function unitRecord(u, prev, dims, ctx = null){
  const it = ctx ? ctx.info.get(u.uid) : null;
  const host = it ? it.host : null;
  /* un personaggio unito a un reggimento non ha una posizione sua:
     sta dove sta il reggimento, ed e' li' che il report lo cerca */
  const at = host || u;
  const x = r1(inch(at.x || 0)), y = r1(inch(at.y || 0));
  const lost = Math.min(u.models || 0, u.lost || 0);
  const f = FM.ensureFormation(u);
  const rec = {
    uid: u.uid, idx: u.idx, army: u.army, name: u.name,
    models: u.models || 0,
    alive: u.dead ? 0 : aliveOf(u),
    lost,
    dLost: Math.max(0, lost - (prev ? prev.lost || 0 : 0)),
    dead: !!u.dead, fled: !!u.fled,
    placed: host ? !!host.placed : !!u.placed,
    x, y, rot: Math.round(at.rot || 0),
    /* l'ingombro di ADESSO: le perdite accorciano il reggimento, e una
       fotografia che tiene solo il centro non basta a ridisegnarlo */
    w: it ? r1(inch(it.lay.w)) : 0,
    h: it ? r1(inch(it.lay.h)) : 0,
    form: {
      mode: f.mode, preset: f.preset,
      label: FM.presetLabel(f),
      front: it ? it.lay.front : (u.frontage || 1),
      gap: r1(f.spacing),
    },
    moved: 0,
    /* Le ferite sono l'altra valuta delle perdite: per un personaggio,
       un mostro o un carro sono l'unica. Una fotografia che tiene solo
       i modelli tolti non racconta il turno in cui il drago e' andato
       giu' da sei ferite a una. */
    wounds: EX.woundsOf(u),
    dWounds: Math.max(0, EX.woundsOf(u) - (prev ? prev.wounds || 0 : 0)),
    /* etichette e contatori liberi: l'app non sa cosa vogliano dire e
       li riporta cosi' come sono, che e' esattamente il punto */
    tags: [...(u.tags || [])],
    counters: (u.counters || []).map(c => ({ name:c.name, value:+c.value || 0 })),
    zone: u.dead ? "fuori gioco" : (host ? "con " + host.name : u.placed ? zoneOf(x, y, dims.w, dims.h) : "in riserva"),
  };
  if (host){ rec.withUid = host.uid; rec.withName = host.name; }
  if (it && it.chars.length) rec.chars = it.chars.map(c => c.name);
  if (it && !host && u.placed && !u.dead){
    const on = FM.terrainUnder(it.cells, ctx.terrain);
    if (on.length) rec.terrain = on;
  }
  /* Movimento netto fra due fotografie, non il percorso davvero
     camminato: un'unita' che avanza e torna indietro risulta ferma, e
     va detto nella legenda invece che fatto passare per un totale. */
  if (prev && prev.placed && rec.placed && !rec.dead)
    rec.moved = r1(Math.hypot(rec.x - prev.x, rec.y - prev.y));
  return rec;
}

function dimsOf(state){
  return { w: r1(inch(state.tableW)), h: r1(inch(state.tableH)) };
}

/* la fotografia dello schieramento, prima che si muova qualcosa */
export function deployRecord(state){
  const dims = dimsOf(state);
  const ctx = tableCtx(state);
  return {
    kind: "deploy", n: 0, army: "",
    at: Date.now(),
    units: state.units.map(u => unitRecord(u, null, dims, ctx)),
    /* il terreno viaggia dentro OGNI fotografia, schieramento
       compreso: un muretto spostato a meta' partita cambia il senso di
       tutte le posizioni che vengono dopo, e un report che tiene una
       mappa sola non se ne accorge */
    terrain: FM.terrainSnapshot(state.terrain),
    markers: EX.markerSnapshot(state.markers),
    zones: zoneSnapshot(state.zones),
    counters: countersSnapshot(state.game),
    contacts: contactsNow(ctx),
    events: [], note: "",
  };
}

/* i contatori dei due eserciti in questo momento */
function countersSnapshot(g){
  const c = (g && g.counters) || {};
  const one = list => (list || []).map(x => ({ name:x.name, value:+x.value || 0 }));
  return { A: one(c.A), B: one(c.B) };
}

/* i contatti di basetta del momento, gia' pronti per il report */
function contactsNow(ctx){
  return FM.contactList(ctx.onBoard, u => ctx.info.get(u.uid).box);
}

/* la fotografia di fine turno: n = numero di turno, army = chi lo ha
   appena giocato */
export function turnRecord(state, { n, army, events = [], note = "" }){
  const dims = dimsOf(state);
  const ctx = tableCtx(state);
  const prev = lastRecords(state.game && state.game.turns);
  return {
    kind: "turn", n, army,
    at: Date.now(),
    units: state.units.map(u => unitRecord(u, prev.get(u.uid), dims, ctx)),
    terrain: FM.terrainSnapshot(state.terrain),
    markers: EX.markerSnapshot(state.markers),
    zones: zoneSnapshot(state.zones),
    counters: countersSnapshot(state.game),
    contacts: contactsNow(ctx),
    events, note,
  };
}

/* Turno aggiunto a mano, senza tavolo: si porta avanti l'ultima
   situazione nota e si lascia all'utente il compito di correggere
   solo quello che e' cambiato. E' l'unico modo perche' registrare una
   partita giocata altrove non diventi un secondo lavoro. */
export function blankTurn(rep, { n, army }){
  const prev = lastRecords(rep.turns);
  const units = [...rep.roster.A, ...rep.roster.B].map(c => {
    const p = prev.get(c.uid);
    return {
      uid: c.uid, army: c.army, name: c.name,
      models: c.models || 0,
      alive: p ? p.alive : (c.models || 0),
      lost: p ? p.lost : 0,
      dLost: 0,
      dead: p ? !!p.dead : false, fled: p ? !!p.fled : false,
      placed: p ? p.placed !== false : true,
      x: p ? p.x : 0, y: p ? p.y : 0, rot: p ? p.rot : 0,
      moved: 0, zone: p ? p.zone : "",
      wounds: p ? (p.wounds || 0) : 0, dWounds: 0,
      tags: p ? [...(p.tags || [])] : [],
    };
  });
  return { kind: "turn", n, army, at: Date.now(), units, events: [], note: "" };
}

/* Cambiare le perdite in un turno cambia tutti i turni dopo: qui si
   ricalcolano progressivo e superstiti in fila, cosi' correggere un
   numero sbagliato al turno 2 non lascia il resto del registro a
   raccontare un'altra partita. */
export function recount(rep){
  const run = new Map();
  for (const t of rep.turns){
    if (t.kind === "deploy"){
      for (const r of t.units) run.set(r.uid, { lost: r.lost || 0, dead: !!r.dead });
      continue;
    }
    for (const r of t.units){
      const st = run.get(r.uid) || { lost:0, dead:false };
      const lost = Math.max(0, Math.min(r.models || 0, st.lost + (r.dLost || 0)));
      r.lost = lost;
      /* Un'unita' non torna in vita al turno dopo: chi e' morto resta
         morto anche nelle fotografie successive, anche se quelle erano
         gia' state scritte. */
      r.dead = st.dead || !!r.dead || !!(r.models && lost >= r.models);
      r.alive = r.dead ? 0 : Math.max(0, (r.models || 0) - lost);
      if (r.dead){ r.placed = false; r.fled = false; r.wounds = 0; }
      run.set(r.uid, { lost, dead: r.dead });
    }
  }
  return rep;
}

/* ============================================================
   3 · PUNTEGGIO
   L'app non conosce le regole e non vuole conoscerle: propone i conti
   che si possono fare da soli guardando il tavolo (chi e' morto, chi e'
   ridotto a meta', chi e' scappato) e lascia scritti a mano quelli che
   dipendono dallo scenario e dagli accordi — obiettivi, generale,
   stendardi, quarti di tavolo. Ogni riga resta modificabile: il numero
   proposto e' un suggerimento, non un arbitro.
   ============================================================ */
export const SCORE_DEFS = [
  { id:"kill",      label:"Unità nemiche distrutte",             auto:"kill" },
  { id:"halved",    label:"Unità nemiche ridotte a metà o meno", auto:"halved" },
  { id:"fled",      label:"Unità nemiche in rotta a fine partita",auto:"fled" },
  { id:"general",   label:"Generale nemico ucciso",                   auto:null },
  { id:"bsb",       label:"Portastendardo da battaglia",              auto:null },
  { id:"banner",    label:"Stendardi catturati",                      auto:null },
  { id:"objective", label:"Obiettivi controllati",                    auto:null },
  { id:"quarter",   label:"Quarti di tavolo",                         auto:null },
  { id:"bonus",     label:"Bonus di scenario",                        auto:null },
];

export const emptyScore = () => ({
  rows: SCORE_DEFS.map(d => ({ ...d, A:0, B:0, manual:false })),
});

export function ensureScore(s){
  if (!s || !Array.isArray(s.rows) || !s.rows.length) return emptyScore();
  return s;
}

/* la situazione dell'ultima fotografia utile */
export function finalUnits(rep){
  for (let i = (rep.turns || []).length - 1; i >= 0; i--)
    if (rep.turns[i].units && rep.turns[i].units.length) return rep.turns[i].units;
  return [];
}

export function rosterMap(rep){
  const m = new Map();
  for (const a of ["A", "B"]) for (const c of rep.roster[a] || []) m.set(c.uid, c);
  return m;
}

/* Quanto vale, per l'avversario, quello che e' successo a ogni unita'.
   Le tre righe automatiche sono le uniche che si leggono dal tavolo
   senza sapere le regole dello scenario. */
export function autoValues(rep){
  const cards = rosterMap(rep);
  const out = { kill:{ A:0, B:0 }, halved:{ A:0, B:0 }, fled:{ A:0, B:0 } };
  for (const r of finalUnits(rep)){
    const card = cards.get(r.uid);
    if (!card) continue;
    const to = r.army === "A" ? "B" : "A";      // incassa l'avversario
    const p = card.pts || 0;
    if (r.dead){ out.kill[to] += p; continue; }
    if (r.fled){ out.fled[to] += p; continue; }
    const models = card.models || r.models || 0;
    if (models && r.alive * 2 <= models) out.halved[to] += Math.round(p / 2);
  }
  return out;
}

/* riscrive le righe automatiche, lasciando stare quelle corrette a mano */
export function applyAuto(rep){
  const v = autoValues(rep);
  for (const row of rep.score.rows){
    if (!row.auto || row.manual || !v[row.auto]) continue;
    row.A = v[row.auto].A;
    row.B = v[row.auto].B;
  }
  return rep;
}

export function totals(rep){
  let A = 0, B = 0;
  for (const r of rep.score.rows){ A += +r.A || 0; B += +r.B || 0; }
  return { A, B, diff: Math.abs(A - B), winner: A === B ? null : (A > B ? "A" : "B") };
}

/* Quanto e' larga la vittoria. Non e' una regola del manuale ma una
   scala proporzionale ai punti giocati: dirlo e' meglio che stampare
   una differenza secca che al torneo non vuol dire niente. */
export function verdict(rep){
  const t = totals(rep);
  const size = +rep.meta.pts || Math.max(
    (rep.roster.A || []).reduce((s, u) => s + (u.pts || 0), 0),
    (rep.roster.B || []).reduce((s, u) => s + (u.pts || 0), 0), 1);
  const share = t.diff / size;
  const level = share < 0.05 ? "pareggio"
              : share < 0.15 ? "vittoria di misura"
              : share < 0.30 ? "vittoria netta" : "vittoria schiacciante";
  const name = w => (w === "A" ? rep.armies.A.name : rep.armies.B.name) || ("Esercito " + w);
  return {
    ...t, size, share, level,
    text: !t.winner || level === "pareggio"
      ? `Pareggio (${t.A} a ${t.B}).`
      : `${level.charAt(0).toUpperCase() + level.slice(1)} di ${name(t.winner)}: ${t.A} a ${t.B}, ${t.diff} punti di scarto su ${size} giocati.`,
  };
}

/* ============================================================
   4 · ANDAMENTO
   La tabella che si guarda per prima: in che turno sono cadute le
   cose. Se la partita e' girata, e' girata in una riga di queste.
   ============================================================ */
export function progress(rep){
  const cards = rosterMap(rep);
  const rows = [];
  for (const t of rep.turns){
    if (t.kind === "deploy") continue;
    const row = { n: t.n, army: t.army, A:{ models:0, pts:0, units:0 }, B:{ models:0, pts:0, units:0 }, moved:{ A:0, B:0 }, movers:{ A:0, B:0 } };
    for (const r of t.units){
      const side = row[r.army];
      if (!side) continue;
      const card = cards.get(r.uid);
      const share = card && card.models ? (card.pts || 0) / card.models : 0;
      side.models += r.dLost || 0;
      side.pts += Math.round(share * (r.dLost || 0));
      if (r.dLost && r.dead) side.units++;
      if (r.moved > 0){ row.moved[r.army] += r.moved; row.movers[r.army]++; }
    }
    rows.push(row);
  }
  return rows;
}

/* ============================================================
   5 · IL REPORT
   ============================================================ */
const unitCard = u => ({
  uid: u.uid, idx: u.idx, army: u.army, name: u.name,
  troop: u.troop || "", slot: u.slot || "",
  models: u.models || 0, pts: u.pts || 0, us: u.us || 0,
  baseW: u.baseW, baseH: u.baseH, frontage: u.frontage,
  loose: !!u.loose, maxRange: u.maxRange || 0,
  /* le ferite del profilo servono a chi legge il report per capire se
     «tre ferite» sono un graffio o quasi la morte */
  wounds: EX.woundsPerModel(u),
  move: (u.moveOverride != null && +u.moveOverride > 0) ? +u.moveOverride
      : (u.stats && /^\d+$/.test(String(u.stats.M)) ? +u.stats.M : 0),
  rules: Array.isArray(u.rules) ? u.rules.slice(0, 10) : [],
  weapons: Array.isArray(u.weapons) ? u.weapons.map(w => w.name).slice(0, 6) : [],
});

/* Il report costruito dal tavolo: liste, scenario, fotografie, punteggio.
   E' la stessa forma che usa l'archivio, cosi' una partita registrata a
   mano e una registrata giocando si esportano con lo stesso codice. */
export function buildReport(state, scenario, { title = "", id = "" } = {}){
  const g = state.game || {};
  const rep = {
    format: FORMAT,
    id: id || "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    saved: new Date().toISOString(),
    title: title || defaultTitle(state, scenario),
    meta: ensureMeta(g.meta),
    scenario: {
      id: state.scenario,
      label: scenario ? scenario.label : state.scenario,
      group: scenario ? scenario.group || "" : "",
      pts: scenario ? scenario.pts || 0 : 0,
      deploy: scenario ? scenario.deploy || "" : "",
      desc: scenario ? scenario.desc || "" : "",
    },
    table: { w: r1(inch(state.tableW)), h: r1(inch(state.tableH)), gap: r1(inch(state.gap)) },
    armies: {
      A: { name: state.armies.A.name, info: state.armies.A.info || null },
      B: { name: state.armies.B.name, info: state.armies.B.info || null },
    },
    terrain: (state.terrain || []).map(t => {
      const cfg = TERRAIN[t.kind] || {};
      return {
        kind: t.kind, label: cfg.label || t.kind,
        pass: cfg.pass || "", los: !!cfg.los,
        x: r1(inch(t.x)), y: r1(inch(t.y)),
        w: r1(t.w ?? cfg.w ?? 0), h: r1(t.h ?? cfg.h ?? 0),
        rot: Math.round(t.rot || 0),
      };
    }),
    markers: EX.markerSnapshot(state.markers),
    zones: zoneSnapshot(state.zones),
    roster: {
      A: state.units.filter(u => u.army === "A").map(unitCard),
      B: state.units.filter(u => u.army === "B").map(unitCard),
    },
    turns: JSON.parse(JSON.stringify(g.turns || [])),
    score: ensureScore(g.score ? JSON.parse(JSON.stringify(g.score)) : null),
    notes: g.notes || "",
    log: (g.log || []).slice(0, 200),
  };
  if (!rep.meta.pts) rep.meta.pts = rep.scenario.pts || 0;
  return applyAuto(rep);
}

export function defaultTitle(state, scenario){
  const a = state.armies.A.name || "Esercito A";
  const b = state.armies.B.name || "Esercito B";
  return `${scenario ? scenario.label : "Partita"} — ${a} vs ${b}`;
}

/* ============================================================
   6 · ESPORTAZIONE
   ============================================================ */
const ARMY = (rep, k) => rep.armies[k].name || ("Esercito " + k);
const tbl = (head, rows) =>
  [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`,
   ...rows.map(r => `| ${r.join(" | ")} |`)].join("\n");

const models = side =>
  `${side.models} ${side.models === 1 ? "modello" : "modelli"} · ${side.pts} pt`;

const stateOf = r => r.dead ? "distrutta" : r.fled ? "in rotta"
  : !r.placed ? "in riserva" : r.alive * 2 <= r.models ? "sotto metà" : "in campo";

/* Un report scritto a mano non ha coordinate: le colonne della
   posizione restano vuote invece di dichiarare che tutti stavano
   nell'angolo 0,0. */
/* come sta schierata un'unita', in una casella di tabella */
const formText = u => {
  const f = u.form || {};
  if (f.mode === "free") return `sciolta (${(f.label || "libera").toLowerCase()})`;
  return `${u.frontage} di fronte`;
};

/* «8 modelli su 12 nel bosco», che e' come lo direbbe un giocatore */
const terrText = r => (r.terrain && r.terrain.length)
  ? r.terrain.map(t => `${String(t.label).toLowerCase()} ${t.models}/${t.of}`).join(", ")
  : "—";

const sizeText = r => (r.w && r.h) ? `${r.w}×${r.h}″` : "—";
const recForm = r => {
  const f = r.form;
  if (!f) return "—";
  return f.mode === "free" ? `sciolta (${String(f.label || "libera").toLowerCase()})` : `${f.front} di fronte`;
};

const PASS_TXT = { open:"sì", difficult:"terreno difficile", obstacle:"ostacolo", blocked:"impassabile" };
const terrainTable = list => tbl(["Elemento", "Centro (x, y)", "Misure", "Fronte", "Attraversabile"],
  (list || []).map(t => [t.label || t.kind, `${t.x}, ${t.y}`,
    t.w ? `${t.w}″ × ${t.h || t.w}″` : "—",
    (t.rot || 0) + "°",
    (PASS_TXT[t.pass] || "—") + (t.los ? ", blocca la vista" : "")]));

const terrKey = list => JSON.stringify((list || []).map(t => [t.kind, t.x, t.y, t.w, t.h, t.rot]));
const terrMoved = (now, before) => !!(now && now.length) && terrKey(now) !== terrKey(before);

/* I contatti sono la riga che manca a ogni resoconto scritto a mano:
   senza, un turno di combattimenti sembra un turno di movimento. */
function contactsBlock(t, title){
  const list = (t.contacts || []);
  if (!list.length) return [];
  return ["", `**${title}.**`, "",
    tbl(["Unità", "Lato", "Contro", "Lato", "Fra"],
      list.map(c => [c.aName, c.aSide, c.bName, c.bSide, c.enemy ? "nemiche" : "alleate"])), ""];
}

/* «2 (5)»: due ferite in questo turno, cinque in tutto. Senza il
   progressivo non si capisce se il mostro e' quasi giu' o appena
   graffiato. */
const woundText = r => {
  const d = r.dWounds || 0, tot = r.wounds || 0;
  if (!d && !tot) return "—";
  return d ? `${d} (${tot})` : `(${tot})`;
};
const tagText = r => (r.tags && r.tags.length) ? r.tags.join(", ") : "—";

/* i contatori dei due eserciti a fine turno, se ce n'e' qualcuno */
function countersBlock(t){
  const c = t.counters || {};
  const rows = [];
  for (const k of ["A", "B"]) for (const x of c[k] || []) rows.push([k, x.name, x.value]);
  if (!rows.length) return [];
  return ["", "**Contatori a fine turno.**", "", tbl(["Esercito", "Contatore", "Valore"], rows), ""];
}

const hasPos = r => r.placed && !r.dead && (r.x || r.y);
const pos = r => hasPos(r) ? `${r.x}, ${r.y}` : "—";
const facing = r => hasPos(r) ? r.rot + "°" : "—";

export const PROMPT = [
  "Sei un giocatore esperto di Warhammer: The Old World e mi fai da allenatore.",
  "Qui sotto c'è il resoconto completo di una mia partita, esportato dall'app che uso per",
  "schierare: le due liste, lo schieramento iniziale, la posizione e le perdite di ogni",
  "unità alla fine di ogni turno, e il punteggio finale voce per voce.",
  "",
  "Leggilo e dimmi cosa è andato storto: se è un problema di lista, di schieramento, o di",
  "come ho giocato; in quale turno la partita è girata e perché; quali unità non hanno reso",
  "quello che costavano. Nel resoconto trovi anche, per ogni turno, quali unità erano a",
  "contatto di basetta e da che lato, e quali stavano dentro un elemento di terreno.",
  "Se un dato ti manca chiedimelo, non inventarlo: il registro è",
  "tenuto a mano durante la partita e può avere buchi.",
].join("\n");

function legend(rep){
  return [
    `- Misure in pollici. Origine in alto a sinistra di un tavolo ${rep.table.w}″ × ${rep.table.h}″; x cresce verso destra, y verso il basso.`,
    `- L'**Esercito A** schiera in basso (y alto), l'**Esercito B** in alto (y basso). Le zone di schieramento distano ${rep.table.gap}″ dalla mediana.`,
    "- «Corsia» sinistra/centrale/destra: terzi del lato lungo, guardando il tavolo dal lato di A.",
    "- «Fronte» in gradi: 0° guarda verso il bordo di B, 180° verso il bordo di A.",
    "- «Mosso»: distanza in linea d'aria fra il centro dell'unità a fine turno precedente e a fine di questo turno. È lo **spostamento netto**, non il percorso: chi avanza e torna indietro risulta fermo.",
    "- «Perdite»: modelli tolti in QUEL turno. «In piedi»: quanti ne restano.",
    "- «Ferite»: ferite segnate sull'unità in QUEL turno, e fra parentesi il totale accumulato. Sono l'altra valuta delle perdite, e per un personaggio, un mostro o un carro sono l'unica: un modello con più ferite incassa colpi senza sparire dal tavolo. Il giocatore decide quando una ferita diventa un modello in meno; l'app non lo deduce.",
    "- «Etichette»: parole scritte dal giocatore sull'unità (disordinata, ha caricato, sotto incantesimo…). Sono testo libero: l'app non le interpreta e non ne conosce l'elenco. Interpretale nel contesto della partita.",
    "- «Contatori»: coppie nome/numero tenute dal giocatore per un esercito o per un'unità (dadi della magia, munizioni, cariche di un oggetto). Anche questi sono liberi: l'app conta e basta.",
    "- «Marcatori»: pezzi appoggiati sul tavolo che non sono né unità né terreno — obiettivi, segnalini, promemoria. L'etichetta è scritta dal giocatore. Quelli marcati come *sagoma* sono strumenti di misura, non oggetti del gioco.",
    "- «Zone»: se il giocatore le ha disegnate a mano, sostituiscono quelle calcolate dallo scenario. Sono rettangoli con un proprietario dichiarato.",
    "- Ogni turno di gioco compare due volte, una per giocatore: «Turno 2 — gioca B» è la seconda metà del secondo turno.",
    "- Un'unità distrutta compare nel turno in cui muore e poi sparisce dalle tabelle.",
    "- «Formazione»: *ordine chiuso* è il reggimento a ranghi, con la larghezza di fronte indicata; *sciolta* vuol dire che ogni base ha una posizione sua, come gli schermagliatori. L'ingombro riportato è quello attuale, già accorciato dalle perdite.",
    "- Un personaggio **unito** a un reggimento non ha posizione propria: sta dentro il reggimento, e nelle tabelle risulta nella casella del reggimento.",
    "- «Contatti di basetta»: due unità che si toccano. Il lato indicato è quello dell'unità nominata: «fronte», «fianco sinistro», «fianco destro», «retro», guardandola dal suo fronte.",
    "- «Terreno»: quanti modelli dell'unità stanno dentro un elemento scenico, sul totale di quelli in piedi.",
    "- Il terreno è ripetuto a ogni turno perché durante la partita si sposta: le posizioni valgono per QUEL turno.",
    "- Il registro è compilato a mano da un giocatore mentre gioca: può avere turni saltati o numeri approssimati.",
  ].join("\n");
}

export function reportMarkdown(rep, { prompt = false } = {}){
  const out = [];
  const v = verdict(rep);
  const m = rep.meta;

  if (prompt) out.push(PROMPT, "", "---", "");
  out.push(`# ${rep.title}`, "", `<!-- ${FORMAT} -->`, "");
  out.push("## Come leggere questi dati", "", legend(rep), "");

  /* --- scheda --- */
  const ptsA = (rep.roster.A || []).reduce((s, u) => s + (u.pts || 0), 0);
  const ptsB = (rep.roster.B || []).reduce((s, u) => s + (u.pts || 0), 0);
  const played = rep.turns.filter(t => t.kind === "turn");
  out.push("## Scheda", "", tbl(["Voce", "Valore"], [
    ["Data", m.date || "—"],
    ["Luogo", [m.place, m.event].filter(Boolean).join(" · ") || "—"],
    ["Scenario", `${rep.scenario.label}${rep.scenario.group ? " (" + rep.scenario.group + ")" : ""}${rep.scenario.pts ? " — " + rep.scenario.pts + " pt" : ""}`],
    ["Schieramento", rep.scenario.deploy || "—"],
    ["Tavolo", `${rep.table.w}″ × ${rep.table.h}″`],
    ["Punti concordati", m.pts || "—"],
    ["Esercito A", `${ARMY(rep, "A")}${m.playerA ? " — " + m.playerA : ""} — ${ptsA} pt, ${rep.roster.A.length} unità`],
    ["Esercito B", `${ARMY(rep, "B")}${m.playerB ? " — " + m.playerB : ""} — ${ptsB} pt, ${rep.roster.B.length} unità`],
    ["Primo turno", m.first === "B" ? ARMY(rep, "B") : ARMY(rep, "A")],
    ["Turni registrati", played.length + (m.rounds ? " su " + m.rounds + " previsti" : "")],
    ["Esito", v.text],
  ]), "");
  if (rep.scenario.desc) out.push(`> ${rep.scenario.desc}`, "");

  /* --- liste --- */
  out.push("## Liste");
  for (const k of ["A", "B"]){
    const list = rep.roster[k] || [];
    out.push("", `### Esercito ${k} — ${ARMY(rep, k)}` +
      (rep.armies[k].info && rep.armies[k].info.catalogue ? ` (${rep.armies[k].info.catalogue})` : ""), "");
    if (!list.length){ out.push("_Nessuna unità registrata._"); continue; }
    out.push(tbl(["#", "Unità", "Ruolo", "Modelli", "Punti", "US", "Base mm", "Formazione", "M", "Tiro max"],
      list.map(u => [u.idx ?? "", u.name, [u.troop, u.slot].filter(Boolean).join(" / ") || "—",
        u.models, u.pts, u.us || "—", `${u.baseW}×${u.baseH}`, formText(u),
        u.move || "—", u.maxRange ? u.maxRange + "″" : "—"])));
    const withRules = list.filter(u => u.rules.length);
    if (withRules.length){
      out.push("", "Regole speciali dichiarate nel roster:");
      for (const u of withRules) out.push(`- **${u.name}**: ${u.rules.join(", ")}`);
    }
  }
  out.push("");

  /* --- terreno ---
     La mappa non e' una sola: gli elementi si spostano in partita.
     Questa e' quella di riferimento, poi ogni turno dice la sua se e'
     cambiata. */
  const depTerr = (rep.turns.find(t => t.kind === "deploy") || {}).terrain;
  const baseTerr = (depTerr && depTerr.length) ? depTerr : rep.terrain;
  if (baseTerr && baseTerr.length)
    out.push("## Terreno allo schieramento", "", terrainTable(baseTerr), "");

  /* --- marcatori e zone disegnate ---
     Sono i due pezzi di tavolo che l'app non interpreta: qui si
     riportano cosi' come sono, etichetta compresa, perche' chi legge
     ne sa piu' dell'app. */
  const depShot = rep.turns.find(t => t.kind === "deploy") || {};
  const marks = (depShot.markers && depShot.markers.length) ? depShot.markers : rep.markers;
  if (marks && marks.length){
    out.push("## Marcatori sul tavolo", "",
      "Pezzi che non sono né unità né terreno. L'etichetta l'ha scritta il giocatore: l'app non la interpreta.", "",
      tbl(["Etichetta", "Forma", "Centro (x, y)", "Misure", "A cosa serve"],
        marks.map(m => [m.label || "—", m.shape,
          `${m.x}, ${m.y}`,
          m.shape === "rect" ? `${m.w}″ × ${m.h}″` : `⌀ ${m.w}″`,
          m.measure ? "sagoma di misura" : "marcatore di gioco"])), "");
  }
  const zs = (depShot.zones && depShot.zones.length) ? depShot.zones : rep.zones;
  if (zs && zs.length){
    out.push("## Zone di schieramento disegnate a mano", "",
      "Quando ci sono, sostituiscono quelle calcolate dallo scenario.", "",
      tbl(["Zona", "Di chi", "Centro (x, y)", "Misure"],
        zs.map(z => [z.label || "—", zoneKind(z.kind).label, `${z.x}, ${z.y}`, `${z.w}″ × ${z.h}″`])), "");
  }

  /* --- schieramento --- */
  const dep = rep.turns.find(t => t.kind === "deploy");
  if (dep){
    out.push("## Schieramento iniziale", "");
    for (const k of ["A", "B"]){
      const rows = dep.units.filter(r => r.army === k);
      if (!rows.length) continue;
      out.push(`**Esercito ${k} — ${ARMY(rep, k)}**`, "",
        tbl(["Unità", "Centro (x, y)", "Ingombro", "Fronte", "Formazione", "Zona", "Terreno"],
          rows.map(r => [r.name, pos(r), sizeText(r), facing(r), recForm(r),
            r.zone || (r.placed ? "—" : "in riserva"), terrText(r)])), "");
    }
    out.push(...contactsBlock(dep, "Contatti di basetta allo schieramento"));
    if (dep.note) out.push(`Nota sullo schieramento: ${dep.note}`, "");
  }

  /* --- andamento --- */
  const prog = progress(rep);
  if (prog.length){
    out.push("## Andamento turno per turno", "",
      "Perdite subite da ciascun esercito nel turno indicato (modelli, punti persi in proporzione al costo dell'unità, unità annientate).", "",
      tbl(["Turno", "Gioca", "Perdite A", "Perdite B", "Unità perse A", "Unità perse B"],
        prog.map(p => [`T${p.n}`, p.army || "—",
          models(p.A), models(p.B),
          p.A.units || "—", p.B.units || "—"])), "");
  }

  /* --- turni --- */
  const goneBefore = new Set();
  let lastTerr = baseTerr;
  for (const t of rep.turns){
    if (t.kind === "deploy") continue;
    out.push(`## Turno ${t.n}${t.army ? " — gioca " + ARMY(rep, t.army) : ""}`, "");
    const rows = t.units.filter(r => !goneBefore.has(r.uid));
    out.push(tbl(["Unità", "Es.", "In piedi", "Perdite", "Ferite", "Etichette", "Mosso", "Centro (x, y)", "Ingombro", "Fronte", "Formazione", "Zona", "Terreno", "Stato"],
      rows.map(r => [r.name, r.army, `${r.alive}/${r.models}`, r.dLost || "—",
        woundText(r), tagText(r),
        r.moved ? r.moved + "″" : "—", pos(r), sizeText(r), facing(r), recForm(r),
        r.zone || "—", terrText(r), stateOf(r)])));
    out.push(...countersBlock(t));
    out.push(...contactsBlock(t, "Contatti di basetta a fine turno"));
    /* il terreno si ristampa solo se qualcuno lo ha mosso: ripeterlo
       identico dieci volte allungherebbe il report senza dire niente */
    if (terrMoved(t.terrain, lastTerr)){
      out.push("", "Terreno spostato in questo turno:", "", terrainTable(t.terrain));
      lastTerr = t.terrain;
    }
    for (const r of t.units) if (r.dead) goneBefore.add(r.uid);
    if (t.events && t.events.length){
      out.push("", "Registro del turno:");
      for (const e of t.events) out.push(`- ${e}`);
    }
    if (t.note) out.push("", `Nota: ${t.note}`);
    out.push("");
  }

  /* --- punteggio --- */
  out.push("## Punteggio", "",
    "Le prime tre voci sono calcolate dall'app sull'ultima situazione registrata; le altre le ha scritte il giocatore.", "",
    tbl(["Voce", ARMY(rep, "A"), ARMY(rep, "B"), "Origine"],
      rep.score.rows.filter(r => (+r.A || 0) || (+r.B || 0)).map(r =>
        [r.label, +r.A || 0, +r.B || 0, r.auto && !r.manual ? "calcolata" : "a mano"])), "");
  out.push(`**Totale: ${ARMY(rep, "A")} ${v.A} — ${ARMY(rep, "B")} ${v.B}.** ${v.text}`, "");

  if (rep.notes) out.push("## Note del giocatore", "", rep.notes, "");
  if (rep.log && rep.log.length){
    out.push("## Registro completo", "");
    for (const l of [...rep.log].reverse())
      out.push(`- T${l.t} ${l.phase ? "· " + l.phase + " " : ""}· ${l.text}`);
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export const reportJSON = rep => JSON.stringify(rep, null, 2);

/* nome del file, senza caratteri che i sistemi operativi non digeriscono */
export function fileName(rep, ext){
  const slug = (rep.title || "battle-report").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${rep.meta.date || today()}-${slug || "battle-report"}.${ext}`;
}
