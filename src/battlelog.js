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

/* l'ultima riga registrata per ogni unita': serve a misurare il
   movimento e a portarsi avanti lo stato nella compilazione a mano */
export function lastRecords(turns){
  const map = new Map();
  for (const t of turns || []) for (const r of t.units || []) map.set(r.uid, r);
  return map;
}

export function unitRecord(u, prev, dims){
  const x = r1(inch(u.x || 0)), y = r1(inch(u.y || 0));
  const lost = Math.min(u.models || 0, u.lost || 0);
  const rec = {
    uid: u.uid, army: u.army, name: u.name,
    models: u.models || 0,
    alive: u.dead ? 0 : aliveOf(u),
    lost,
    dLost: Math.max(0, lost - (prev ? prev.lost || 0 : 0)),
    dead: !!u.dead, fled: !!u.fled, placed: !!u.placed,
    x, y, rot: Math.round(u.rot || 0),
    moved: 0,
    zone: u.dead ? "fuori gioco" : u.placed ? zoneOf(x, y, dims.w, dims.h) : "in riserva",
  };
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
  return {
    kind: "deploy", n: 0, army: "",
    at: Date.now(),
    units: state.units.map(u => unitRecord(u, null, dims)),
    events: [], note: "",
  };
}

/* la fotografia di fine turno: n = numero di turno, army = chi lo ha
   appena giocato */
export function turnRecord(state, { n, army, events = [], note = "" }){
  const dims = dimsOf(state);
  const prev = lastRecords(state.game && state.game.turns);
  return {
    kind: "turn", n, army,
    at: Date.now(),
    units: state.units.map(u => unitRecord(u, prev.get(u.uid), dims)),
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
      if (r.dead){ r.placed = false; r.fled = false; }
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
  move: u.stats && /^\d+$/.test(String(u.stats.M)) ? +u.stats.M : 0,
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
  "quello che costavano. Se un dato ti manca chiedimelo, non inventarlo: il registro è",
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
    "- Ogni turno di gioco compare due volte, una per giocatore: «Turno 2 — gioca B» è la seconda metà del secondo turno.",
    "- Un'unità distrutta compare nel turno in cui muore e poi sparisce dalle tabelle.",
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
    out.push(tbl(["#", "Unità", "Ruolo", "Modelli", "Punti", "US", "Base mm", "Fronte", "M", "Tiro max"],
      list.map(u => [u.idx ?? "", u.name, [u.troop, u.slot].filter(Boolean).join(" / ") || "—",
        u.models, u.pts, u.us || "—", `${u.baseW}×${u.baseH}`, u.frontage,
        u.move || "—", u.maxRange ? u.maxRange + "″" : "—"])));
    const withRules = list.filter(u => u.rules.length);
    if (withRules.length){
      out.push("", "Regole speciali dichiarate nel roster:");
      for (const u of withRules) out.push(`- **${u.name}**: ${u.rules.join(", ")}`);
    }
  }
  out.push("");

  /* --- terreno --- */
  if (rep.terrain && rep.terrain.length){
    out.push("## Terreno", "", tbl(["Elemento", "Centro (x, y)", "Misure", "Attraversabile"],
      rep.terrain.map(t => [t.label || t.kind, `${t.x}, ${t.y}`,
        t.w ? `${t.w}″ × ${t.h || t.w}″` : "—",
        ({ open:"sì", difficult:"terreno difficile", obstacle:"ostacolo", blocked:"impassabile" }[t.pass] || "—") +
        (t.los ? ", blocca la vista" : "")])), "");
  }

  /* --- schieramento --- */
  const dep = rep.turns.find(t => t.kind === "deploy");
  if (dep){
    out.push("## Schieramento iniziale", "");
    for (const k of ["A", "B"]){
      const rows = dep.units.filter(r => r.army === k);
      if (!rows.length) continue;
      out.push(`**Esercito ${k} — ${ARMY(rep, k)}**`, "", tbl(["Unità", "Centro (x, y)", "Fronte", "Zona"],
        rows.map(r => [r.name, pos(r), facing(r), r.zone || (r.placed ? "—" : "in riserva")])), "");
    }
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
  for (const t of rep.turns){
    if (t.kind === "deploy") continue;
    out.push(`## Turno ${t.n}${t.army ? " — gioca " + ARMY(rep, t.army) : ""}`, "");
    const rows = t.units.filter(r => !goneBefore.has(r.uid));
    out.push(tbl(["Unità", "Es.", "In piedi", "Perdite", "Mosso", "Centro (x, y)", "Fronte", "Zona", "Stato"],
      rows.map(r => [r.name, r.army, `${r.alive}/${r.models}`, r.dLost || "—",
        r.moved ? r.moved + "″" : "—", pos(r), facing(r),
        r.zone || "—", stateOf(r)])));
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
