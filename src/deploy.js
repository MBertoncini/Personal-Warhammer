/* Schieramento Old World — stato del tavolo, pannelli, campo di battaglia */

import { MM, $, SVGNS, esc, inch } from './util.js';
import { BASES, baseById, defaultFrontage } from './bases.js';
import { parseRoster, parseAny } from './parser.js';
import { TERRAIN, TREASURE_CLEAR, BM_MAX_SIDE } from './terrain.js';
import { R, T, SCENARIOS, geometry } from './scenarios.js';
import { saveDoc, loadDoc } from './store.js';
import { photoForUnit, photoFor, catEntry, matchUnitName } from './catalog.js';
import { rectPoly, pointInRect, boxCorners, polysOverlap,
         distPointToBox, toWorld, toLocal } from './geom.js';
import { createHistory } from './history.js';
import { createView, wireViewGestures } from './view.js';
import * as FM from './formation.js';
import { initFormEditor, openEditor, refreshEditor } from './formeditor.js';
import { exportPNG } from './imgexport.js';
import { shareUrl, decodeBoard, readShareCode, copyText } from './share.js';
import * as G from './game.js';
import { initScenarioKit, customScenarioMap, saveCustom, removeCustom,
         randomTerrain, allCustom } from './scenariokit.js';
import { survey, frontArcPoly, movementBands } from './tactics.js';
import { askText, askConfirm, askPick, showMenu, closeMenu,
         countersHTML, wireCounters, tagsHTML, wireTags } from './uikit.js';
import * as EX from './extras.js';
import * as MV from './movement.js';
import { ZONE_KINDS, zoneKind, makeZone, ensureZone, zoneRect, zoneBox,
         applyZones, hasCustomZones } from './zones.js';

/* Gli scenari sono quelli del manuale piu' quelli salvati dall'utente:
   da qui in giu' non c'e' differenza fra i due. */
const allScenarios = () => ({ ...SCENARIOS, ...customScenarioMap() });
const scenarioDef = id => allScenarios()[id] || SCENARIOS.open;

function currentScenario(){
  const def = scenarioDef(state.scenario);
  const geo = geometry(def.deploy, state.tableW, state.tableH, state.gap);
  /* le zone disegnate a mano vincono su quelle calcolate: da qui in giu'
     nessuno deve sapere da dove arrivano i rettangoli */
  return { ...def, ...applyZones(geo, state.zones) };
}

/* ============================================================
   5 · STATO
   ============================================================ */
const state = {
  armies:{ A:{ id:"A", name:"Esercito A", color:"var(--armyA)", info:null },
           B:{ id:"B", name:"Esercito B", color:"var(--armyB)", info:null } },
  units:[], terrain:[],
  /* i tre tipi di oggetto generici: un marcatore non e' ne' unita' ne'
     terreno e non sa cosa significa quello che tiene; una zona
     disegnata sostituisce la geometria dello scenario */
  markers:[], zones:[],
  scenario:"bm-guado",
  tableW:44 * MM, tableH:30 * MM, gap:6 * MM,
  sel:null,                       // {type:'unit'|'terr', id}
  snap:true, labels:true, ranges:false, measure:false, measurePts:[], photos:true,
  /* righelli lasciati sul tavolo, uno per coppia di punti: la misura
     usa-e-getta serviva a poco, in partita se ne tengono tre o quattro */
  rulers:[],
  /* aiuti tattici sull'unita' selezionata */
  distances:false, arcs:false,
  /* l'ancora di movimento: i cerchi restano dove l'unita' e' partita
     invece di seguirla, che era il motivo per cui non servivano a
     niente proprio mentre la muovevi */
  moveAid:true,
  /* il fantasma dell'ultima fotografia, sotto le unita' di adesso */
  ghost:false,
  /* modalita' «disegna una zona»: il prossimo trascinamento sul vuoto
     diventa un rettangolo invece che uno scorrimento */
  zoning:false, zonePts:null,
  game: G.emptyGame(),
  rawInfo:"",
};
let uidSeq = 1, tidSeq = 1, midSeq = 1, zidSeq = 1;

/* Modelli ancora in piedi: fuori partita sono tutti, in partita sono
   quelli che restano. Il reggimento si accorcia da dietro, come al tavolo. */
const liveModels = u => Math.max(1, (u.models || 1) - (u.lost || 0));
const effModels = u => (state.game.on ? liveModels(u) : (u.models || 1));

/* ---- personaggi uniti alle unita' ----
   Un personaggio agganciato non e' piu' un pezzo suo: sta dentro il
   reggimento, si muove con lui e occupa una casella della sua
   formazione. Se il reggimento muore l'aggancio non vale piu' e il
   personaggio torna a contare da solo. */
function hostOf(ch){
  const id = FM.joinedHost(ch);
  if (id == null) return null;
  const host = state.units.find(u => u.uid === id);
  return host && !host.dead ? host : null;
}
const isJoined = u => !!hostOf(u);
const attachedOf = u => state.units.filter(c => {
  const h = c.uid !== u.uid && hostOf(c);
  return h && h.uid === u.uid;
});

/* Il posto di ogni modello lo calcola formation.js, e non e' gratis:
   qui si tiene il risultato finche' non cambia niente di quello da cui
   dipende. Senza, trascinare un reggimento rifarebbe la formazione di
   tutte le unita' del tavolo a ogni pixel. */
const layCache = new Map();
function layoutOf(u){
  const f = FM.ensureFormation(u);
  const chars = attachedOf(u);
  const key = [
    effModels(u), u.models, u.frontage, u.baseW, u.baseH,
    f.mode, f.preset, f.spacing, f.align, f.rev,
    (u.fallen || []).join("."),
    chars.map(c => `${c.uid}:${c.join?.idx ?? ""}:${c.join?.x ?? ""}:${c.join?.y ?? ""}:${c.baseW}x${c.baseH}`).join("|"),
  ].join("~");
  const hit = layCache.get(u.uid);
  if (hit && hit.key === key) return hit.lay;
  const lay = FM.layout(u, { alive: effModels(u), attached: chars });
  layCache.set(u.uid, { key, lay });
  return lay;
}
const unitW = u => layoutOf(u).w;
const unitD = u => layoutOf(u).h;
const ranksOf = u => layoutOf(u).ranks || 1;

/* -------- geometria --------
   Un solo punto in cui si chiede «che ingombro ha questo pezzo»: le
   unita', il terreno, i marcatori e le zone rispondono tutti qui,
   cosi' trascinamento, selezione e maniglia di rotazione non devono
   sapere con che tipo hanno a che fare. */
function boxOf(o){
  if (o.uid !== undefined) return { x:o.x, y:o.y, w:unitW(o), h:unitD(o), rot:o.rot };
  if (o.mid !== undefined) return EX.markerBox(o);
  if (o.zid !== undefined) return zoneBox(o);
  return FM.terrainBox(o);
}
const corners = o => boxCorners(boxOf(o));
const inRect = pointInRect;

// distanza fra un punto e il bordo di un pezzo (0 se dentro)
const distToPiece = (pt, o) =>
  distPointToBox(pt, boxOf(o), !!(TERRAIN[o.kind] && TERRAIN[o.kind].shape === "circle"));

/* -------- i pezzi generici, cercati per identificatore -------- */
const markerById = id => state.markers.find(m => m.mid === +id) || null;
const zoneById   = id => state.zones.find(z => z.zid === +id) || null;

/* ============================================================
   5b · ANNULLA, RIPETI, INQUADRATURA
   Ogni gesto che cambia il tavolo passa da act(): mette da parte lo
   stato di prima, esegue, ridisegna. E' l'unico posto in cui la rete
   di sicurezza va ricordata, quindi e' difficile dimenticarsela.
   ============================================================ */
const svgEl = $("#board");
const BOARD_PAD = 46;

const baseBox = () => ({
  x: -BOARD_PAD, y: -BOARD_PAD,
  w: state.tableW + BOARD_PAD * 2, h: state.tableH + BOARD_PAD * 2,
});

const view = createView(svgEl, {
  getBase: baseBox,
  onChange: ({ zoom }) => {
    const el = $("#zoom-level");
    if (el) el.textContent = Math.round(zoom * 100) + "%";
    const fitBtn = $("#btn-fit");
    if (fitBtn) fitBtn.classList.toggle("on", Math.abs(zoom - 1) < 0.01);
    /* «Adatta» si accende da qui e non da syncToggle: il pallino del
       menu deve saperlo lo stesso */
    syncMenus();
  },
});

const history = createHistory({
  capture: () => snapshot(),
  restore: s => { applySnapshot(s); renderAll(); },
  onChange: ({ canUndo, canRedo, undoLabel, redoLabel }) => {
    const u = $("#btn-undo"), r = $("#btn-redo");
    if (u){ u.disabled = !canUndo; u.title = canUndo ? `Annulla: ${undoLabel} (Ctrl+Z)` : "Niente da annullare"; }
    if (r){ r.disabled = !canRedo; r.title = canRedo ? `Ripeti: ${redoLabel} (Ctrl+Y)` : "Niente da ripetere"; }
  },
});

/* Da pixel di schermo a unita' del tavolo. Tutto quello che si tocca —
   la maniglia di rotazione, i bersagli dei pezzi piccoli — va misurato
   in pixel e non in millimetri: su un tavolo da 96 pollici una basetta
   da 25 mm e' tre pixel, e un bersaglio proporzionale a lei non si
   prende con il dito. */
const px = n => n / (view.scale() || 1);

/* label: quello che si legge nel tooltip di Annulla.
   coalesce: millisecondi entro cui un gesto continuo (scrivere, tenere
   premuta una freccia) resta un passo solo invece di trenta. */
function act(label, fn, { coalesce = 0, render = true } = {}){
  history.push(label, { coalesce });
  fn();
  if (render) renderAll();
}

/* cambia solo cosa e' selezionato: non e' una modifica del tavolo e
   nella storia non ci deve entrare */
function select(sel){ state.sel = sel; renderAll(); }

function focusUnit(u){
  if (!u || !u.placed) return;
  const xs = corners(u).map(p => p[0]), ys = corners(u).map(p => p[1]);
  /* tetto basso: su una basetta da 30 mm il calcolo chiederebbe il
     massimo ingrandimento, e a quel punto si vede l'unità e nient'altro
     di quello che le sta attorno — che è proprio il motivo per cui ci
     si stava andando */
  view.focus({ x:Math.min(...xs), y:Math.min(...ys),
               w:Math.max(...xs) - Math.min(...xs), h:Math.max(...ys) - Math.min(...ys) }, 2);
}

function zonesFor(army, sc){
  const z = [...(sc.zones[army] || [])];
  for (const a of sc.aux) if (a.army === army) z.push(a.rect);
  return z;
}
const impassable = () => state.terrain.filter(t => TERRAIN[t.kind].pass === "blocked");

function unitStatus(u, sc){
  const host = hostOf(u);
  if (host) return { key:"idle", text:"con " + shortName(host.name) };
  if (!u.placed) return { key:"idle", text:"in riserva" };
  const pts = corners(u);
  if (!pts.every(p => inRect(p, R(0, 0, state.tableW, state.tableH)))) return { key:"bad", text:"fuori tavolo" };
  for (const b of sc.blocked) if (polysOverlap(pts, rectPoly(b))) return { key:"bad", text:"terreno chiuso" };
  for (const t of impassable()) if (polysOverlap(pts, corners(t))) return { key:"bad", text:"su " + TERRAIN[t.kind].label.toLowerCase() };
  for (const o of state.units)
    if (o !== u && o.placed && !isJoined(o) && polysOverlap(pts, corners(o))) return { key:"bad", text:"sovrapposta" };
  const zs = zonesFor(u.army, sc);
  if (zs.length && !pts.every(p => zs.some(z => inRect(p, z)))) return { key:"warn", text:"fuori zona" };
  return { key:"ok", text:"schierata" };
}

// controlli sul terreno: regola dei 12″ e distanza dei tesori
function terrainIssues(){
  const out = new Map();
  const isBM = scenarioDef(state.scenario).group === "Battle March";
  for (const t of state.terrain){
    const cfg = TERRAIN[t.kind];
    const longest = Math.max(t.w ?? cfg.w, t.h ?? cfg.h);
    if (isBM && t.kind !== "treasure" && longest > BM_MAX_SIDE + 0.05)
      out.set(t.tid, { key:"warn", text:`${longest.toFixed(1)}″ > 12″` });
  }
  for (const t of state.terrain){
    if (t.kind !== "treasure") continue;
    let worst = Infinity, who = "";
    for (const o of state.terrain){
      if (o === t || o.kind === "treasure") continue;
      const d = inch(distToPiece([t.x, t.y], o));   // misurata dal centro del segnalino
      if (d < worst) { worst = d; who = TERRAIN[o.kind].label.toLowerCase(); }
    }
    if (worst < TREASURE_CLEAR - 0.05)
      out.set(t.tid, { key:"bad", text:`${Math.max(0, worst).toFixed(1)}″ da ${who}` });
  }
  return out;
}

/* ============================================================
   6 · PANNELLO LATERALE
   ============================================================ */
function reindex(){
  const n = { A:0, B:0 };
  for (const u of state.units) u.idx = ++n[u.army];
}
const selIs = (type, id) => state.sel && state.sel.type === type && state.sel.id === id;

/* ============================================================
   ANTEPRIME DELLE MINIATURE
   Le foto non stanno piu' qui: arrivano dal catalogo della
   collezione (src/catalog.js) tramite photoForUnit().
   ============================================================ */
const MAX_DOTS = 60;   /* quante anteprime disegnare per riga */

/* Prima si ripeteva la stessa foto per ogni modello: venti Orc Mobs
   facevano due righe di quadratini identici, che spingevano in basso
   tutto il pannello per dire una cosa che il testo diceva gia'. Ora la
   riga chiusa mostra una foto e il moltiplicatore; la striscia intera
   resta sull'unita' selezionata, dove serve a contare i modelli.
   (E photoForUnit si chiama UNA volta, non sessanta.) */
function miniStrip(u, { full = false } = {}){
  const p = photoForUnit(u);
  const col = state.armies[u.army].color;
  const cell = () => p
    ? `<img class="mdl" src="${p}" alt="" loading="lazy">`
    : `<span class="mdl ph" style="background:${col}"></span>`;

  const shown = effModels(u);
  if (!full)
    return `<span class="minis">${cell()}<span class="mdl more">×${shown}</span>` +
      (state.game.on && (u.lost || 0) ? `<span class="mdl more lost">−${u.lost}</span>` : "") +
      `</span>`;

  const n = Math.min(shown, MAX_DOTS);
  let out = '<span class="minis">';
  for (let i = 0; i < n; i++) out += cell();
  if (shown > n) out += `<span class="mdl more">+${shown - n}</span>`;
  if (state.game.on && (u.lost || 0)) out += `<span class="mdl more lost">−${u.lost}</span>`;
  return out + "</span>";
}

/* Le unita' sul tavolo si portano dietro il catId del giorno dell'import.
   Se quella voce non esiste piu' (fusa con un doppione) o non c'era ancora,
   si riprova adesso: e' cosi' che una foto aggiunta dopo si vede subito. */
function healLinks(){
  let changed = false;
  for (const u of state.units){
    if (u.catId && catEntry(u.catId)) continue;
    const id = matchUnitName(u.name);
    if (id !== (u.catId || null)){ u.catId = id; changed = true; }
  }
  return changed;
}

function renderArmies(){
  const host = $("#armies");
  host.innerHTML = "";
  const sc = currentScenario();
  for (const id of ["A", "B"]){
    const army = state.armies[id];
    const units = army && state.units.filter(u => u.army === id);
    const wrap = document.createElement("div");
    wrap.style.marginBottom = "16px";

    const head = document.createElement("div");
    head.className = "panel-title";
    head.innerHTML = `<span class="swatch" style="background:${army.color}"></span>Esercito ${id}`;
    wrap.appendChild(head);

    const nameRow = document.createElement("div");
    nameRow.className = "army-head";
    const inp = document.createElement("input");
    inp.type = "text"; inp.value = army.name;
    inp.addEventListener("input", () => { army.name = inp.value; drawBoard(); });
    nameRow.appendChild(inp);
    wrap.appendChild(nameRow);

    const pts = units.reduce((s, u) => s + (u.pts || 0), 0);
    const mdl = units.reduce((s, u) => s + u.models, 0);
    const us  = units.reduce((s, u) => s + (u.us || 0), 0);
    const meta = document.createElement("div");
    meta.className = "readout";
    meta.innerHTML = `<span>${units.length} unità · ${mdl} modelli · US ${us}</span><b>${pts} pt</b>`;
    wrap.appendChild(meta);

    if (army.info){
      const i = army.info;
      const sub = document.createElement("p");
      sub.className = "note";
      sub.style.marginTop = "4px";
      sub.textContent = [i.catalogue, i.forceName, i.limit ? `limite ${i.limit} pt` : ""].filter(Boolean).join(" · ");
      wrap.appendChild(sub);
    }

    const tray = document.createElement("div");
    tray.className = "tray"; tray.style.marginTop = "8px";
    if (!units.length) tray.innerHTML = `<p class="empty">Nessuna lista caricata.</p>`;
    else for (const u of units) tray.appendChild(unitRow(u, sc));
    wrap.appendChild(tray);

    /* Un'unità in più senza passare da un file. Serve quando
       l'avversario arriva con la lista stampata, e serve anche solo
       per provare una cosa: finora l'unico modo di mettere un pezzo
       sul tavolo era importare un roster. */
    const addBtn = document.createElement("button");
    addBtn.className = "btn tiny";
    addBtn.style.marginTop = "6px";
    addBtn.textContent = "+ Unità a mano";
    addBtn.dataset.addunit = id;
    addBtn.title = "Aggiungi un'unità all'Esercito " + id + " senza passare da un file";
    addBtn.addEventListener("click", () => addUnitByHand(id));
    wrap.appendChild(addBtn);

    host.appendChild(wrap);
  }
}

/* Nome, modelli, punti, basetta: cinque campi e l'unità è sul tavolo.
   Tutto il resto del codice tratta profilo, regole e armi come
   facoltativi, quindi non c'è niente da inventare per farla stare in
   piedi. */
async function addUnitByHand(armyId){
  const name = await askText({
    title: "Unità a mano",
    label: "Nome dell'unità. Modelli, punti e basetta si correggono subito dopo nell'ispettore.",
    placeholder: "Black Orc Mob",
  });
  if (name === null || !name.trim()) return;
  act("aggiungi unità", () => {
    const u = {
      uid: uidSeq++, army: armyId, name: name.trim(),
      models: 10, crew: 0,
      baseId: "25x25", baseW: 25, baseH: 25,
      frontage: defaultFrontage("", 10, false), loose: false,
      pts: 0, us: 0, troop: "", unitSize: "", stats: null,
      rules: [], weapons: [], maxRange: 0, slot: "", faction: "",
      catId: matchUnitName(name.trim()),
      x: state.tableW / 2, y: state.tableH / 2, rot: 0, placed: false,
      lost: 0, dead: false, fled: false, fallen: [],
      wounds: 0, tags: [], counters: [], anchor: null,
    };
    state.units.push(u);
    place(u);
    state.sel = { type: "unit", id: u.uid };
  });
}

function catLabel(u){
  const e = u.catId && catEntry(u.catId);
  if (!e) return "non agganciata";
  return `${esc(e.name)} \u00b7 ${e.owned} in collezione`;
}

/* come sta messa l'unita', in tre parole: e' l'informazione che prima
   era sempre e solo «tot di fronte», e adesso non basta piu' */
function formLabel(u){
  const f = FM.ensureFormation(u);
  const chars = attachedOf(u).length;
  const base = f.mode === "ranks"
    ? `${layoutOf(u).front} di fronte`
    : FM.presetLabel(f).toLowerCase();
  return base + (chars ? ` · +${chars} pers.` : "");
}

function unitRow(u, sc){
  const sel = selIs("unit", u.uid);
  const el = document.createElement("div");
  el.className = "row u-row" + (sel ? " sel" : "") + (u.dead ? " dead" : "") + (u.fled ? " fled" : "");
  const st = unitStatus(u, sc);
  el.innerHTML = `
    <span class="nm">
      <b><span class="idx" style="background:${state.armies[u.army].color}">${u.idx}</span><span class="txt">${esc(u.name)}</span></b>
      <span class="mono">${effModels(u)}× ${u.baseW}×${u.baseH} · ${formLabel(u)} · ${inch(unitW(u)).toFixed(1)}×${inch(unitD(u)).toFixed(1)}″ · ${u.pts} pt</span>
    </span>
    <span class="chip ${st.key}">${st.text}</span>
    ${miniStrip(u, { full: sel })}`;
  el.addEventListener("click", () => {
    /* cliccare un'unita' gia' selezionata la inquadra: con lo zoom
       acceso e' il modo piu' corto per andarci sopra */
    if (isJoined(u)) return select({ type:"unit", id:u.uid });
    if (sel && u.placed){ focusUnit(u); return; }
    if (u.placed || u.dead) return select({ type:"unit", id:u.uid });
    act("schiera " + shortName(u.name), () => {
      state.sel = { type:"unit", id:u.uid };
      place(u);
    });
  });
  return el;
}

function renderTerrainList(){
  const host = $("#terrain-list");
  const issues = terrainIssues();
  host.innerHTML = "";
  if (!state.terrain.length){ host.innerHTML = `<p class="empty">Nessun elemento sul tavolo.</p>`; }
  const tray = document.createElement("div");
  tray.className = "tray";
  for (const t of state.terrain){
    const cfg = TERRAIN[t.kind];
    const iss = issues.get(t.tid);
    const el = document.createElement("div");
    el.className = "row" + (selIs("terr", t.tid) ? " sel" : "");
    const dims = t.kind === "treasure" ? "Ø40 mm"
      : cfg.shape === "circle" ? `Ø${(t.w ?? cfg.w).toFixed(1)}″`
      : `${(t.w ?? cfg.w).toFixed(1)}×${(t.h ?? cfg.h).toFixed(1)}″`;
    el.innerHTML = `
      <svg class="mini" viewBox="0 0 26 26" aria-hidden="true">
        ${cfg.shape === "circle" || cfg.shape === "token"
          ? `<circle cx="13" cy="13" r="9" fill="${cfg.color}" opacity=".85"/>`
          : `<rect x="3" y="6" width="20" height="14" rx="2" fill="${cfg.color}" opacity=".85"/>`}
      </svg>
      <span class="nm"><b>${cfg.label}</b><span class="mono">${dims} · ${inch(t.x).toFixed(0)},${inch(t.y).toFixed(0)}″</span></span>
      ${iss ? `<span class="chip ${iss.key}">${iss.text}</span>` : `<span class="chip idle">ok</span>`}`;
    el.addEventListener("click", () => select({ type:"terr", id:t.tid }));
    tray.appendChild(el);
  }
  host.appendChild(tray);

  const warn = $("#terrain-warn");
  const bad = [...issues.values()];
  warn.innerHTML = bad.length
    ? `<div class="warnbox">${bad.filter(b => b.key === "bad").length
        ? "Un tesoro è troppo vicino a un elemento scenico (minimo 3″). " : ""}${
        bad.filter(b => b.key === "warn").length
        ? "Un elemento supera i 12″ consentiti dal Battle March." : ""}</div>`
    : "";
}

/* L'elenco dei pezzi generici. Sul tavolo un marcatore piccolo si
   trova a fatica, e una zona disegnata fuori inquadratura non si trova
   affatto: qui ci sono tutti, con un clic per andarci. */
function renderMarkerList(){
  const host = $("#marker-list");
  if (!host) return;
  const ms = state.markers, zs = state.zones;
  if (!ms.length && !zs.length){
    host.innerHTML = `<p class="empty">Nessun marcatore, nessuna zona disegnata.</p>`;
    return;
  }
  host.innerHTML = `<div class="tray">` +
    ms.map(m => `
      <div class="row${selIs("mark", m.mid) ? " sel" : ""}" data-mgo="${m.mid}">
        <span class="swatch" style="background:${EX.markerColor(m.color)};${EX.markerRound(m) ? "border-radius:50%;" : ""}"></span>
        <span class="nm"><b><span class="txt">${esc(m.label || (m.measure ? "sagoma" : "marcatore"))}</span></b>
          <span class="mono">${m.measure ? "sagoma · " : ""}${EX.markerSize(m)}</span></span>
      </div>`).join("") +
    zs.map(z => `
      <div class="row${selIs("zone", z.zid) ? " sel" : ""}" data-zgo="${z.zid}">
        <span class="swatch" style="background:${zoneFill(z)}"></span>
        <span class="nm"><b><span class="txt">${esc(z.label || zoneKind(z.kind).label)}</span></b>
          <span class="mono">zona · ${inch(z.w).toFixed(0)}″ × ${inch(z.h).toFixed(0)}″</span></span>
      </div>`).join("") + `</div>`;
  host.querySelectorAll("[data-mgo]").forEach(el => el.addEventListener("click", () =>
    select({ type:"mark", id:+el.dataset.mgo })));
  host.querySelectorAll("[data-zgo]").forEach(el => el.addEventListener("click", () =>
    select({ type:"zone", id:+el.dataset.zgo })));
}

function renderInspector(){
  const host = $("#inspector");
  if (!state.sel){ host.innerHTML = `<p class="empty">Clicca un'unità nella lista o un pezzo sul campo.</p>`; return; }
  if (state.sel.type === "terr") return renderTerrainInspector(host);
  if (state.sel.type === "mark") return renderMarkerInspector(host);
  if (state.sel.type === "zone") return renderZoneInspector(host);

  const u = state.units.find(x => x.uid === state.sel.id);
  if (!u){ state.sel = null; return renderInspector(); }
  const sc = currentScenario(), st = unitStatus(u, sc);

  host.innerHTML = `
    <div class="insp">
      <div class="army-head">
        <span class="swatch" style="background:${state.armies[u.army].color}"></span>
        <input type="text" id="i-name" value="${esc(u.name)}">
      </div>
      <p class="note">${[u.troop, u.slot, u.unitSize ? "dimensione " + u.unitSize : ""].filter(Boolean).map(esc).join(" · ") || "—"}</p>
      <div class="photo-box">
        <div class="readout"><span>Catalogo</span><b>${catLabel(u)}</b></div>
        <p class="note">${u.catId
          ? "Le anteprime vengono dalla voce di catalogo. Per cambiare la foto apri la scheda Catalogo."
          : "Nessun aggancio: apri la scheda Liste per collegare questa unit\u00e0 a una voce del catalogo."}</p>
      </div>
      ${u.stats ? `<table class="stats"><thead><tr>${["M","WS","BS","S","T","W","I","A","Ld"].map(k => `<th>${k}</th>`).join("")}</tr></thead>
        <tbody><tr>${["M","WS","BS","S","T","W","I","A","Ld"].map(k => `<td>${esc(u.stats[k] ?? "-")}</td>`).join("")}</tr></tbody></table>` : ""}
      <div class="grid3">
        <label class="field">Modelli<input type="number" id="i-models" min="1" max="200" value="${u.models}"></label>
        <label class="field">Fronte<input type="number" id="i-front" min="1" max="40" value="${u.frontage}"></label>
        <label class="field">Punti<input type="number" id="i-pts" min="0" value="${u.pts || 0}"></label>
      </div>
      <label class="field">Base
        <select id="i-base">
          ${BASES.map(b => `<option value="${b.id}" ${b.id === u.baseId ? "selected" : ""}>${b.label}</option>`).join("")}
          <option value="custom" ${u.baseId === "custom" ? "selected" : ""}>Personalizzata (${u.baseW}×${u.baseH})</option>
        </select>
      </label>
      ${u.baseId === "custom" ? `<div class="grid2">
        <label class="field">Largh. mm<input type="number" id="i-bw" min="5" value="${u.baseW}"></label>
        <label class="field">Prof. mm<input type="number" id="i-bh" min="5" value="${u.baseH}"></label></div>` : ""}
      ${formationBlockHTML(u)}
      <div>
        <div class="readout"><span>Ingombro</span><b>${inch(unitW(u)).toFixed(2)}″ × ${inch(unitD(u)).toFixed(2)}″</b></div>
        ${FM.ensureFormation(u).mode === "ranks"
          ? `<div class="readout"><span>Ranghi</span><b>${ranksOf(u)} × ${layoutOf(u).front}</b></div>` : ""}
        ${u.us ? `<div class="readout"><span>Unit Strength</span><b>${u.us}</b></div>` : ""}
        ${u.crew ? `<div class="readout"><span>Equipaggio</span><b>${u.crew}</b></div>` : ""}
        ${u.maxRange ? `<div class="readout"><span>Tiro più lungo</span><b>${u.maxRange}″</b></div>` : ""}
        <div class="readout"><span>Stato</span><b style="color:var(--${st.key === "idle" ? "muted" : st.key})">${st.text}</b></div>
      </div>
      ${movementBlockHTML(u)}
      ${tagsBlockHTML(u)}
      ${countersBlockHTML(u, "unit")}
      ${u.rules.length ? `<div class="tags">${u.rules.map(r => `<span class="tag">${esc(r)}</span>`).join("")}</div>` : ""}
      ${u.weapons.length ? `<p class="note"><b>Armi:</b> ${u.weapons.map(w => esc(w.name) + (w.range && w.range !== "-" ? ` (${esc(w.range)})` : "")).join(" · ")}</p>` : ""}
      ${gameBlockHTML(u)}
      ${nearbyHTML(u)}
      <div class="grid2"><button class="btn" id="i-rot-l">↺ 90°</button><button class="btn" id="i-rot-r">↻ 90°</button></div>
      <div class="grid2"><button class="btn" id="i-swap">Cambia esercito</button>
        <button class="btn" id="i-recall" ${hostOf(u) ? "disabled title=\"Sganciala dal reggimento per schierarla da sola\"" : ""}>${u.placed ? "Ritira" : "Schiera"}</button></div>
      <button class="btn ghost" id="i-del" style="color:var(--bad)">Rimuovi dalla lista</button>
    </div>`;

  const upd = (fn, label = "modifica") => act(label, fn);
  $("#i-name").addEventListener("input", e => {
    history.push("rinomina", { coalesce: 900 });
    u.name = e.target.value; renderArmies();
  });

  $("#i-models").addEventListener("change", e => upd(() => {
    u.models = Math.max(1, +e.target.value || 1);
    u.frontage = Math.min(u.frontage, u.models);
  }));
  $("#i-front").addEventListener("change", e => upd(() => { u.frontage = Math.max(1, Math.min(+e.target.value || 1, u.models)); }));
  $("#i-pts").addEventListener("change", e => upd(() => { u.pts = Math.max(0, +e.target.value || 0); }));
  $("#i-base").addEventListener("change", e => upd(() => {
    u.baseId = e.target.value;
    const b = baseById(u.baseId);
    if (b) { u.baseW = b.w; u.baseH = b.h; u.frontage = defaultFrontage(u.troop, u.models, u.loose); }
  }));
  if (u.baseId === "custom"){
    $("#i-bw").addEventListener("change", e => upd(() => { u.baseW = Math.max(5, +e.target.value || 25); }));
    $("#i-bh").addEventListener("change", e => upd(() => { u.baseH = Math.max(5, +e.target.value || 25); }));
  }
  $("#i-rot-l").addEventListener("click", () => upd(() => { u.rot = (u.rot + 270) % 360; }, "ruota"));
  $("#i-rot-r").addEventListener("click", () => upd(() => { u.rot = (u.rot + 90) % 360; }, "ruota"));
  $("#i-swap").addEventListener("click", () => upd(() => {
    u.army = u.army === "A" ? "B" : "A";
    /* cambiando bandiera gli agganci non valgono piu': un personaggio
       non resta dentro un reggimento nemico */
    if (FM.joinedHost(u)){ FM.leaveUnit(u); u.placed = true; }
    for (const c of attachedOf(u)){ FM.leaveUnit(c); c.placed = true; c.x = u.x; c.y = u.y; c.rot = u.rot; }
    if (u.placed) place(u);
  }, "cambia esercito"));
  $("#i-recall").addEventListener("click", () => upd(() => {
    if (u.placed){ u.placed = false; MV.clearAnchor(u); } else place(u);
  }, u.placed ? "ritira" : "schiera"));
  $("#i-del").addEventListener("click", () => upd(() => {
    /* chi era unito a lei resta senza reggimento: meglio rimetterlo sul
       tavolo da solo che lasciarlo appeso a un'unita' che non c'e' piu' */
    for (const c of attachedOf(u)){ FM.leaveUnit(c); c.placed = true; c.x = u.x; c.y = u.y; c.rot = u.rot; }
    state.units = state.units.filter(x => x !== u); state.sel = null;
  }, "rimuovi unità"));
  wireFormationControls(u, upd);
  wireGameControls(u, upd);
  wireMovementControls(u, upd);
  wireTagControls(u, upd);
  wireCounterControls($("#inspector"), u, "unit", upd);
}

/* ---- formazione e personaggi ----
   Nell'ispettore ci sta il riassunto e la porta; il mestiere vero lo fa
   l'editor grafico, perche' «dove sta il terzo skink» non e' una cosa
   che si scrive in una casella di testo. */
function formationBlockHTML(u){
  const f = FM.ensureFormation(u);
  const chars = attachedOf(u);
  const host = hostOf(u);
  const free = state.units.filter(c =>
    c.army === u.army && c.uid !== u.uid && !c.dead && FM.isCharacter(c) && !FM.joinedHost(c));
  return `
    <div class="photo-box">
      <div class="readout"><span>Formazione</span>
        <b>${f.mode === "free" ? "sciolta · " + esc(FM.presetLabel(f).toLowerCase())
                               : "ordine chiuso · " + layoutOf(u).front + " di fronte"}</b></div>
      <button class="btn tiny primary" id="i-form" style="width:100%">Editor della formazione…</button>
      <label class="field inline" style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink)">
        <input type="checkbox" id="i-loose" ${u.loose ? "checked" : ""}> schermagliatori (basi distanziate di ½″)
      </label>
      <label class="field inline" style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink)">
        <input type="checkbox" id="i-char" ${FM.isCharacter(u) ? "checked" : ""}> è un personaggio (può unirsi a un reggimento)
      </label>
      ${host
        ? `<div class="readout"><span>Unita a</span><b>${esc(shortName(host.name))}</b></div>
           <button class="btn tiny" id="i-leave" style="width:100%">Sgancia dal reggimento</button>`
        : FM.isCharacter(u)
          ? (free.length || chars.length ? "" : `<p class="note">Personaggio libero: unitelo a un reggimento dall'editor della formazione, o dal reggimento stesso.</p>`)
          : ""}
      ${chars.length ? `<div class="readout"><span>Personaggi dentro</span><b>${chars.map(c => esc(shortName(c.name))).join(", ")}</b></div>` : ""}
      ${!host && !FM.isCharacter(u) && free.length ? `
        <label class="field">Unisci un personaggio
          <select id="i-join">
            <option value="">— nessuno —</option>
            ${free.map(c => `<option value="${c.uid}">${esc(c.name)}</option>`).join("")}
          </select></label>` : ""}
    </div>`;
}

function wireFormationControls(u, upd){
  $("#i-form").addEventListener("click", () => openEditor(u.uid));
  $("#i-loose").addEventListener("change", e => upd(() => {
    u.loose = e.target.checked;
    const f = FM.ensureFormation(u);
    f.spacing = u.loose ? FM.LOOSE_GAP : 0;
    f.rev = (f.rev || 0) + 1;
    if (f.mode === "ranks") u.frontage = defaultFrontage(u.troop, u.models, u.loose);
  }, "formazione"));
  $("#i-char").addEventListener("change", e => upd(() => {
    u.character = e.target.checked;
    /* un personaggio che entra in un reggimento smette di essere un
       pezzo suo: se lo si declassa, l'aggancio non ha piu' senso */
    if (!u.character && FM.joinedHost(u)){ FM.leaveUnit(u); u.placed = true; }
  }, "personaggio"));
  const leave = $("#i-leave");
  if (leave) leave.addEventListener("click", () => upd(() => {
    const host = hostOf(u);
    FM.leaveUnit(u);
    if (host){
      u.placed = true; u.rot = host.rot;
      u.x = host.x + unitW(host) / 2 + u.baseW;
      u.y = host.y;
    }
  }, "sgancia " + shortName(u.name)));
  const join = $("#i-join");
  if (join) join.addEventListener("change", e => {
    const c = state.units.find(x => x.uid === +e.target.value);
    if (c) upd(() => FM.joinUnit(c, u), "unisci " + shortName(c.name));
  });
}

/* ---- perdite e stato dell'unità, solo a partita aperta ---- */
/* ---- movimento: l'ancora ----
   I cerchi c'erano gia' ma erano disegnati attorno all'unita', quindi
   la seguivano: la domanda a cui dovevano rispondere spariva proprio
   mentre la trascinavi. Qui si dichiara da dove sei partito, e da li'
   in poi il numero che leggi e' quello che ti serve. */
function movementBlockHTML(u){
  const b = MV.bandsFor(u);
  const mv = MV.movedFrom(u);
  const band = mv && b ? MV.bandOf(u, mv.dist) : null;
  return `
    <div class="photo-box movebox">
      <div class="readout"><span>Movimento</span><b>${b
        ? `${b.move}″ · marcia ${b.march}″ · carica ${b.charge}/${b.chargeMax}″`
        : "M non dichiarato"}</b></div>
      <label class="field inline" style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink)">
        <span>M a mano</span>
        <input type="number" id="i-move" min="0" max="30" step="1" style="max-width:80px"
               value="${u.moveOverride != null ? u.moveOverride : (MV.moveOf(u) || "")}"
               placeholder="${MV.moveOf(u) || "—"}">
      </label>
      ${mv ? `
        <div class="readout"><span>Mosso dall'ancora</span>
          <b style="color:${band ? band.color : "var(--ink)"}">${mv.dist.toFixed(1)}″${
            b ? ` di ${b.move}″` : ""}${mv.turn ? ` · ${mv.turn}°` : ""}</b></div>
        ${band && band.key !== "none" ? `<p class="note">${esc(band.label)} — spostamento netto fra l'ancora e adesso, non il percorso.</p>` : ""}
        <div class="grid2">
          <button class="btn tiny" id="i-anchor">Riparti da qui</button>
          <button class="btn tiny ghost" id="i-anchor-off">Togli l'ancora</button>
        </div>`
      : `<button class="btn tiny" id="i-anchor" style="width:100%"
            ${u.placed ? "" : "disabled title=\"Schierala prima\""}>Ancora qui</button>`}
    </div>`;
}

function wireMovementControls(u, upd){
  const mi = $("#i-move");
  if (mi) mi.addEventListener("change", e => upd(() => {
    const v = Math.round(+e.target.value || 0);
    u.moveOverride = v > 0 ? v : null;
  }, "movimento"));
  const a = $("#i-anchor");
  if (a) a.addEventListener("click", () => upd(() => MV.setAnchor(u), "ancora"));
  const off = $("#i-anchor-off");
  if (off) off.addEventListener("click", () => upd(() => MV.clearAnchor(u), "ancora"));
}

/* ---- etichette libere ----
   Gli stati cablati sono tre; quelli che ci si dimentica al tavolo sono
   altri e cambiano da un'edizione all'altra. Qui sono parole. */
function tagsBlockHTML(u){
  return tagsHTML(u, "unit", EX.tagVocabulary(state.units));
}
function wireTagControls(u, upd){
  wireTags($("#inspector"), u, "unit", {
    add: (unit, t) => upd(() => { if (EX.addTag(unit, t)) G.logLine(unit.name + ": " + EX.cleanTag(t) + ".", { army: unit.army }); }, "etichetta"),
    remove: (unit, t) => upd(() => { EX.removeTag(unit, t); }, "etichetta"),
    onChange: () => {},
  });
}

/* ---- contatori liberi ---- */
function countersBlockHTML(o, ns){
  const g = state.game || {};
  const armies = g.counters ? [{ counters: g.counters.A }, { counters: g.counters.B }] : [];
  const vocab = EX.counterVocabulary([...state.units, ...armies]);
  return countersHTML(o, ns, {
    title: "Contatori", vocab,
    hint: ns === "unit" ? "Munizioni, cariche, dadi tenuti da parte: un nome e un numero." : "",
  });
}
function wireCounterControls(root, owner, ns, upd){
  wireCounters(root, owner, ns, { onChange: () => upd(() => {}, "contatore") });
}

function gameBlockHTML(u){
  if (!state.game.on) return "";
  return `
    <div class="photo-box">
      <div class="readout"><span>Modelli in piedi</span><b>${G.alive(u)} / ${u.models}</b></div>
      <div class="losses">
        <button class="btn tiny" id="i-loss-m">−1</button>
        <input type="number" id="i-loss" min="0" max="${u.models}" value="${u.lost || 0}">
        <button class="btn tiny" id="i-loss-p">+1</button>
        <span class="mono">perdite</span>
      </div>
      <button class="btn tiny" id="i-loss-pick" style="width:100%">Scegli quali modelli sono caduti…</button>
      <!-- Le ferite erano il buco piu' grosso: per un personaggio, un
           mostro o un carro il modello tolto e' la valuta sbagliata, e
           per tre quarti della partita quello che si perde sono ferite.
           L'app le conta e basta: quando una ferita diventa un modello
           in meno lo decide il giocatore, con il tasto qui sotto. -->
      <div class="losses wounds">
        <button class="btn tiny" id="i-wnd-m">−1</button>
        <input type="number" id="i-wnd" min="0" value="${EX.woundsOf(u)}">
        <button class="btn tiny" id="i-wnd-p">+1</button>
        <span class="mono">ferite${EX.woundPool(u, G.alive(u)) ? " di " + EX.woundPool(u, G.alive(u)) : ""}</span>
      </div>
      ${EX.woundsOf(u) ? `<button class="btn tiny" id="i-wnd-kill" style="width:100%">Le ferite hanno tolto un modello →</button>` : ""}
      <div class="grid2">
        <button class="btn tiny${u.fled ? " on" : ""}" id="i-flee">${u.fled ? "In rotta" : "Segna in rotta"}</button>
        <button class="btn tiny" id="i-dead">${u.dead ? "Rimetti in gioco" : "Distrutta"}</button>
      </div>
      ${contactsHTML(u)}
    </div>`;
}

/* ---- chi sta toccando chi ----
   In partita e' la domanda che viene prima di tutte: questo
   reggimento e' impegnato, e da che lato lo hanno preso. */
function contactsHTML(u){
  if (!u.placed || u.dead) return "";
  const list = contactsNow().filter(c => c.a === u.uid || c.b === u.uid);
  if (!list.length) return `<div class="readout"><span>Contatti</span><b>nessuno</b></div>`;
  return list.map(c => {
    const mine = c.a === u.uid;
    const other = mine ? c.bName : c.aName;
    const side = mine ? c.aSide : c.bSide;
    return `<div class="readout near"><span>${c.enemy ? "" : "alleata · "}${esc(shortName(other))}</span>
      <b style="color:var(--${c.enemy ? "bad" : "muted"})">sul ${side}</b></div>`;
  }).join("");
}

/* i contatti di basetta di adesso, calcolati una volta per disegno */
let contactCache = { at: 0, list: [] };
function contactsNow(){
  const now = drawSeq;
  if (contactCache.at === now) return contactCache.list;
  contactCache = { at: now, list: FM.contactList(state.units.filter(u => !isJoined(u)), boxOf) };
  return contactCache.list;
}

function wireGameControls(u, upd){
  if (!state.game.on) return;
  $("#i-loss-pick").addEventListener("click", () => openEditor(u.uid));
  const set = n => upd(() => G.setLost(u, n), "perdite");
  $("#i-loss").addEventListener("change", e => set(+e.target.value || 0));
  $("#i-loss-m").addEventListener("click", () => set((u.lost || 0) - 1));
  $("#i-loss-p").addEventListener("click", () => set((u.lost || 0) + 1));
  const setW = n => upd(() => G.setWounds(u, n), "ferite");
  $("#i-wnd").addEventListener("change", e => setW(+e.target.value || 0));
  $("#i-wnd-m").addEventListener("click", () => setW(EX.woundsOf(u) - 1));
  $("#i-wnd-p").addEventListener("click", () => setW(EX.woundsOf(u) + 1));
  const wk = $("#i-wnd-kill");
  if (wk) wk.addEventListener("click", () => upd(() => G.woundsToLoss(u), "perdite"));
  $("#i-flee").addEventListener("click", () => upd(() => G.flee(u), "rotta"));
  $("#i-dead").addEventListener("click", () =>
    upd(() => (u.dead ? G.revive(u) : G.destroy(u)), u.dead ? "rimetti in gioco" : "distrutta"));
}

/* ---- chi ho intorno: le tre distanze che si guardano davvero ---- */
function nearbyHTML(u){
  if (!u.placed) return "";
  const rows = surveyFor(u).slice(0, 4);
  if (!rows.length) return "";
  const bands = movementBands(u);
  return `
    <div>
      <div class="readout"><span>Nemico più vicino</span><b>${rows[0].dist.toFixed(1)}″</b></div>
      ${rows.map(r => `
        <div class="readout near${r.blocked ? " dim" : ""}">
          <span>${esc(shortName(r.unit.name))}${r.blocked ? ` · dietro ${esc(r.blockedBy.toLowerCase())}` : ""}</span>
          <b${bands && r.dist <= bands.charge && !r.blocked ? ' style="color:var(--ok)"' : ""}>${r.dist.toFixed(1)}″</b>
        </div>`).join("")}
    </div>`;
}

function renderTerrainInspector(host){
  const t = state.terrain.find(x => x.tid === state.sel.id);
  if (!t){ state.sel = null; return renderInspector(); }
  const cfg = TERRAIN[t.kind];
  const iss = terrainIssues().get(t.tid);
  const round = cfg.shape === "circle" || cfg.shape === "token";
  host.innerHTML = `
    <div class="insp">
      <div class="army-head"><span class="swatch" style="background:${cfg.color}"></span><b>${cfg.label}</b></div>
      <p class="note">${{ open:"Terreno aperto", difficult:"Terreno difficile", obstacle:"Ostacolo", blocked:"Impassabile" }[cfg.pass]}${cfg.los ? " · blocca la linea di vista" : ""}</p>
      ${t.kind === "treasure"
        ? `<p class="note">Base tonda da 40 mm. Il cerchio tratteggiato è il minimo di ${TREASURE_CLEAR}″ da ogni elemento scenico, misurato dal centro del segnalino.</p>`
        : `<div class="grid2">
            <label class="field">${round ? "Diametro ″" : "Larghezza ″"}<input type="number" step="0.5" min="1" max="24" id="t-w" value="${(t.w ?? cfg.w)}"></label>
            ${round ? "" : `<label class="field">Profondità ″<input type="number" step="0.5" min="1" max="24" id="t-h" value="${(t.h ?? cfg.h)}"></label>`}
          </div>`}
      <div class="readout"><span>Posizione</span><b>${inch(t.x).toFixed(1)}″ , ${inch(t.y).toFixed(1)}″</b></div>
      ${iss ? `<div class="warnbox">${iss.key === "bad" ? "Troppo vicino: " : "Oltre il limite Battle March: "}${iss.text}</div>` : ""}
      ${t.kind === "treasure" ? "" : `<div class="grid2"><button class="btn" id="t-rot-l">↺ 15°</button><button class="btn" id="t-rot-r">↻ 15°</button></div>`}
      <button class="btn ghost" id="t-del" style="color:var(--bad)">Togli dal tavolo</button>
    </div>`;
  const upd = (fn, label = "terreno") => act(label, fn);
  if ($("#t-w")) $("#t-w").addEventListener("change", e => upd(() => {
    t.w = Math.max(1, +e.target.value || cfg.w);
    if (round) t.h = t.w;
  }));
  if ($("#t-h")) $("#t-h").addEventListener("change", e => upd(() => { t.h = Math.max(1, +e.target.value || cfg.h); }));
  if ($("#t-rot-l")) $("#t-rot-l").addEventListener("click", () => upd(() => { t.rot = ((t.rot || 0) + 345) % 360; }));
  if ($("#t-rot-r")) $("#t-rot-r").addEventListener("click", () => upd(() => { t.rot = ((t.rot || 0) + 15) % 360; }));
  $("#t-del").addEventListener("click", () => upd(() => {
    state.terrain = state.terrain.filter(x => x !== t); state.sel = null;
  }, "togli " + cfg.label.toLowerCase()));
}

/* ---- marcatori e sagome ----
   Un solo ispettore per tutti e due, perche' sono lo stesso oggetto:
   una sagoma di misura e' un marcatore che non si riempie. Il testo e'
   libero e l'app non lo legge mai. */
function renderMarkerInspector(host){
  const m = markerById(state.sel.id);
  if (!m){ state.sel = null; return renderInspector(); }
  const round = EX.markerRound(m);
  const under = modelsUnder(m);
  host.innerHTML = `
    <div class="insp">
      <div class="army-head">
        <span class="swatch" style="background:${EX.markerColor(m.color)}"></span>
        <input type="text" id="m-label" value="${esc(m.label)}" placeholder="Scrivi cosa rappresenta…">
      </div>
      <p class="note">${m.measure ? "Sagoma di misura: resta sul tavolo e non si riempie." :
        "Marcatore libero. Obiettivo, segnalino, promemoria: lo decidi tu, l'app lo tiene e basta."}</p>
      <div class="grid2">
        <label class="field">Forma
          <select id="m-shape">${EX.MARKER_SHAPES.map(sh =>
            `<option value="${sh.id}" ${sh.id === m.shape ? "selected" : ""}>${sh.label}</option>`).join("")}</select></label>
        <label class="field">Colore
          <select id="m-color">${EX.MARKER_COLORS.map(c =>
            `<option value="${c.id}" ${c.id === m.color ? "selected" : ""}>${c.label}</option>`).join("")}</select></label>
      </div>
      <div class="grid2">
        <label class="field">${round ? "Diametro ″" : "Larghezza ″"}
          <input type="number" step="0.25" min="0.5" max="60" id="m-w" value="${m.w}"></label>
        ${round ? "" : `<label class="field">Profondità ″<input type="number" step="0.25" min="0.5" max="60" id="m-h" value="${m.h}"></label>`}
      </div>
      <label class="field inline" style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink)">
        <input type="checkbox" id="m-measure" ${m.measure ? "checked" : ""}>
        <span>Sagoma di misura (vuota, si vede attraverso)</span>
      </label>
      <div class="readout"><span>Misura</span><b>${EX.markerSize(m)}</b></div>
      <div class="readout"><span>Posizione</span><b>${inch(m.x).toFixed(1)}″ , ${inch(m.y).toFixed(1)}″</b></div>
      ${under.length ? `<div class="readout"><span>Sotto la sagoma</span><b>${under.reduce((n, r) => n + r.n, 0)} modelli</b></div>
        ${under.map(r => `<div class="readout near"><span>${esc(shortName(r.u.name))}</span><b>${r.n}/${r.of}</b></div>`).join("")}`
      : `<p class="note">Nessun modello sotto.</p>`}
      ${round ? "" : `<div class="grid2"><button class="btn" id="m-rot-l">↺ 15°</button><button class="btn" id="m-rot-r">↻ 15°</button></div>`}
      <div class="grid2">
        <button class="btn" id="m-dup">Duplica</button>
        <button class="btn ghost" id="m-del" style="color:var(--bad)">Togli dal tavolo</button>
      </div>
    </div>`;
  const upd = (fn, label = "marcatore") => act(label, fn);
  $("#m-label").addEventListener("input", e => {
    history.push("scrivi sul marcatore", { coalesce: 900 });
    m.label = e.target.value; drawBoard();
  });
  $("#m-shape").addEventListener("change", e => upd(() => {
    const def = EX.shapeDef(e.target.value);
    m.shape = def.id;
    if (EX.markerRound(m)) m.h = m.w;
    else if (!(m.h > 0)) m.h = def.h;
  }));
  $("#m-color").addEventListener("change", e => upd(() => { m.color = e.target.value; }));
  $("#m-w").addEventListener("change", e => upd(() => {
    m.w = Math.max(0.5, +e.target.value || 1);
    if (EX.markerRound(m)) m.h = m.w;
  }));
  if ($("#m-h")) $("#m-h").addEventListener("change", e => upd(() => { m.h = Math.max(0.5, +e.target.value || 1); }));
  $("#m-measure").addEventListener("change", e => upd(() => { m.measure = e.target.checked; }));
  if ($("#m-rot-l")) $("#m-rot-l").addEventListener("click", () => upd(() => { m.rot = ((m.rot || 0) + 345) % 360; }, "ruota"));
  if ($("#m-rot-r")) $("#m-rot-r").addEventListener("click", () => upd(() => { m.rot = ((m.rot || 0) + 15) % 360; }, "ruota"));
  $("#m-dup").addEventListener("click", () => upd(() => {
    const copy = EX.ensureMarker({ ...m, mid: midSeq++ });
    copy.x += MM; copy.y += MM;
    state.markers.push(copy);
    state.sel = { type:"mark", id: copy.mid };
  }, "duplica marcatore"));
  $("#m-del").addEventListener("click", () => upd(() => {
    state.markers = state.markers.filter(x => x !== m); state.sel = null;
  }, "togli marcatore"));
}

/* Quanti modelli stanno sotto una sagoma. E' geometria, quindi e'
   terreno dell'app: quello che poi significhi lo sanno i giocatori. */
function modelsUnder(m){
  const b = EX.markerBox(m);
  const round = EX.markerRound(m);
  const out = [];
  for (const u of state.units){
    if (!u.placed || isJoined(u) || u.dead) continue;
    const cells = FM.worldCells(u, layoutOf(u));
    let n = 0;
    for (const c of cells){
      const [lx, ly] = toLocal([c.wx, c.wy], b);
      if (round ? Math.hypot(lx, ly) <= b.w / 2 : (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2)) n++;
    }
    if (n) out.push({ u, n, of: cells.length });
  }
  return out.sort((a, b2) => b2.n - a.n);
}

/* ---- zone disegnate a mano ---- */
function renderZoneInspector(host){
  const z = zoneById(state.sel.id);
  if (!z){ state.sel = null; return renderInspector(); }
  const k = zoneKind(z.kind);
  host.innerHTML = `
    <div class="insp">
      <div class="army-head">
        <span class="swatch" style="background:${zoneFill(z)}"></span>
        <input type="text" id="z-label" value="${esc(z.label)}" placeholder="Nome della zona…">
      </div>
      <p class="note">Le zone disegnate a mano sostituiscono quelle calcolate dallo scenario. Finché ce n'è almeno una di un esercito, la disposizione del menu non si usa più.</p>
      <label class="field">A chi serve
        <select id="z-kind">${ZONE_KINDS.map(o =>
          `<option value="${o.id}" ${o.id === z.kind ? "selected" : ""}>${o.label}</option>`).join("")}</select></label>
      <div class="grid2">
        <label class="field">Larghezza ″<input type="number" step="0.5" min="1" id="z-w" value="${inch(z.w).toFixed(1)}"></label>
        <label class="field">Profondità ″<input type="number" step="0.5" min="1" id="z-h" value="${inch(z.h).toFixed(1)}"></label>
      </div>
      <div class="readout"><span>Centro</span><b>${inch(z.x).toFixed(1)}″ , ${inch(z.y).toFixed(1)}″</b></div>
      <div class="readout"><span>Tipo</span><b>${esc(k.label)}</b></div>
      <div class="grid2">
        <button class="btn" id="z-full">Tutta la larghezza</button>
        <button class="btn ghost" id="z-del" style="color:var(--bad)">Togli la zona</button>
      </div>
    </div>`;
  const upd = (fn, label = "zona") => act(label, fn);
  $("#z-label").addEventListener("input", e => {
    history.push("nome della zona", { coalesce: 900 });
    z.label = e.target.value; drawBoard();
  });
  $("#z-kind").addEventListener("change", e => upd(() => { z.kind = zoneKind(e.target.value).id; }));
  $("#z-w").addEventListener("change", e => upd(() => { z.w = Math.max(MM, (+e.target.value || 1) * MM); }));
  $("#z-h").addEventListener("change", e => upd(() => { z.h = Math.max(MM, (+e.target.value || 1) * MM); }));
  $("#z-full").addEventListener("click", () => upd(() => { z.w = state.tableW; z.x = state.tableW / 2; }));
  $("#z-del").addEventListener("click", () => upd(() => {
    state.zones = state.zones.filter(x => x !== z); state.sel = null;
  }, "togli zona"));
}

const zoneFill = z => z.kind === "A" ? "var(--armyA)" : z.kind === "B" ? "var(--armyB)"
  : z.kind === "blocked" ? "var(--bad)" : z.kind === "both" ? "var(--accent)" : "var(--muted)";

/* ============================================================
   7 · CAMPO DI BATTAGLIA
   ============================================================ */

/* Foto sulle basi: una <symbol> per foto dentro <defs>, poi un <use>
   per modello. Cosi' il dataURL e' scritto una volta sola invece che
   su ogni base, e il nodo <defs> viene riusato fra un ridisegno e
   l'altro: trascinare un reggimento non ricarica le immagini. */
const XLINK = "http://www.w3.org/1999/xlink";
const setHref = (el, v) => {
  el.setAttribute("href", v);
  el.setAttributeNS(XLINK, "xlink:href", v);   // Safari di qualche anno fa
};

let photoDefs = null, photoDefsKey = "";
let drawSeq = 0;

function photoDefsFor(svg){
  const ids = new Map();
  if (!state.photos) return ids;

  const key = [];
  for (const u of state.units){
    /* anche i personaggi uniti a un reggimento: sul tavolo non sono un
       pezzo a se', ma la loro base dentro il reggimento vuole la sua
       faccia come tutte le altre */
    const onBoard = u.placed || isJoined(u);
    if (!onBoard || !u.catId || ids.has(u.catId)) continue;
    const p = photoForUnit(u);
    if (!p) continue;
    ids.set(u.catId, "ph-" + u.catId);
    key.push(u.catId + ":" + p.length);       // foto cambiata = chiave diversa
  }
  if (!ids.size) return ids;

  const k = key.join("|");
  if (k !== photoDefsKey){
    const defs = document.createElementNS(SVGNS, "defs");
    for (const [catId, id] of ids){
      const sym = document.createElementNS(SVGNS, "symbol");
      sym.setAttribute("id", id);
      sym.setAttribute("viewBox", "0 0 100 100");
      sym.setAttribute("preserveAspectRatio", "xMidYMid slice");
      const im = document.createElementNS(SVGNS, "image");
      im.setAttribute("x", 0); im.setAttribute("y", 0);
      im.setAttribute("width", 100); im.setAttribute("height", 100);
      im.setAttribute("preserveAspectRatio", "xMidYMid slice");
      setHref(im, photoFor(catId));
      sym.appendChild(im);
      defs.appendChild(sym);
    }
    photoDefs = defs;
    photoDefsKey = k;
  }
  svg.appendChild(photoDefs);
  return ids;
}

function drawBoard(){
  reindex();
  drawSeq++;                      // i contatti di basetta si ricalcolano una volta per disegno
  const svg = svgEl, sc = currentScenario();
  const W = state.tableW, H = state.tableH;
  /* il riquadro visibile lo decide view.js: qui si disegna e basta,
     sempre nelle stesse coordinate in millimetri */
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  view.apply();
  svg.innerHTML = "";
  const g = (parent, name, attrs = {}) => {
    const e = document.createElementNS(SVGNS, name);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    parent.appendChild(e);
    return e;
  };

  g(svg, "rect", { x:0, y:0, width:W, height:H, fill:"var(--field)", stroke:"var(--line-strong)", "stroke-width":2 });

  const grid = g(svg, "g", { stroke:"var(--field-line)", "stroke-width":.7, opacity:".8" });
  for (let i = 6 * MM; i < W - 1; i += 6 * MM) g(grid, "line", { x1:i, y1:0, x2:i, y2:H });
  for (let i = 6 * MM; i < H - 1; i += 6 * MM) g(grid, "line", { x1:0, y1:i, x2:W, y2:i });
  g(svg, "line", { x1:0, y1:H/2, x2:W, y2:H/2, stroke:"var(--line-strong)", "stroke-width":1.6, "stroke-dasharray":"14 8" });

  if (sc.blocked.length){
    const defs = g(svg, "defs", {});
    const pat = g(defs, "pattern", { id:"hatch", width:18, height:18, patternUnits:"userSpaceOnUse", patternTransform:"rotate(45)" });
    g(pat, "rect", { width:18, height:18, fill:"var(--blocked)", opacity:".65" });
    g(pat, "line", { x1:0, y1:0, x2:0, y2:18, stroke:"var(--line-strong)", "stroke-width":5, opacity:".5" });
    for (const b of sc.blocked){
      g(svg, "rect", { x:b.x, y:b.y, width:b.w, height:b.h, fill:"url(#hatch)" });
      g(svg, "rect", { x:b.x, y:b.y, width:b.w, height:b.h, fill:"none", stroke:"var(--line-strong)", "stroke-width":1.2, "stroke-dasharray":"6 6" });
    }
  }

  // zone di schieramento
  const drawn = hasCustomZones(state.zones);
  if (!drawn) for (const id of ["A", "B"]){
    const col = id === "A" ? "var(--armyA)" : "var(--armyB)";
    for (const z of sc.zones[id] || []){
      g(svg, "rect", { x:z.x, y:z.y, width:z.w, height:z.h, fill:col, opacity:".08" });
      g(svg, "rect", { x:z.x, y:z.y, width:z.w, height:z.h, fill:"none", stroke:col, "stroke-width":1.6, opacity:".55" });
      const bottom = (z.y + z.h / 2) > H / 2;
      const t = g(svg, "text", { x:z.x + 10, y: bottom ? z.y + z.h - 12 : z.y + 24, fill:col, "font-size":20, opacity:".7", "letter-spacing":"2.5" });
      t.textContent = (state.armies[id].name || `Esercito ${id}`).toUpperCase();
    }
  }
  /* Le zone disegnate si disegnano da sole, e con la loro maniglia:
     sono pezzi del tavolo come gli altri, si trascinano e si
     ridimensionano. */
  for (const z of state.zones){
    const col = zoneFill(z);
    const r = zoneRect(z);
    const zg = g(svg, "g", { class:"piece zone" });
    zg.dataset.zid = z.zid;
    /* Il riempimento non si prende: una zona copre mezzo tavolo, e se
       fosse cliccabile per intero non si potrebbe piu' toccare il vuoto
       dentro la propria zona di schieramento. Si prende dal bordo e
       dall'etichetta, che e' dove uno la cerca. */
    g(zg, "rect", { x:r.x, y:r.y, width:r.w, height:r.h, fill:col,
                    opacity: z.kind === "note" ? ".05" : ".09", "pointer-events":"none" });
    g(zg, "rect", { x:r.x, y:r.y, width:r.w, height:r.h, fill:"none", stroke:col,
                    "stroke-width": selIs("zone", z.zid) ? 3 : 1.8,
                    "stroke-dasharray": z.kind === "blocked" ? "4 6" : (z.kind === "note" ? "12 8" : "none"),
                    opacity:".8", "pointer-events":"none" });
    /* il bordo da toccare e' spesso quanto un dito, e invisibile */
    g(zg, "rect", { x:r.x, y:r.y, width:r.w, height:r.h, fill:"none",
                    stroke:"transparent", "stroke-width":px(20), "pointer-events":"stroke" });
    const bottom = (r.y + r.h / 2) > H / 2;
    const t = g(zg, "text", { x:r.x + 10, y: bottom ? r.y + r.h - 12 : r.y + 24, fill:col,
                              "font-size":19, opacity:".85", "letter-spacing":"2" });
    t.textContent = (z.label || zoneKind(z.kind).label).toUpperCase();
  }
  for (const a of sc.aux){
    const col = a.army === "A" ? "var(--armyA)" : "var(--armyB)";
    g(svg, "rect", { x:a.rect.x, y:a.rect.y, width:a.rect.w, height:a.rect.h, fill:col, opacity:".05" });
    g(svg, "rect", { x:a.rect.x, y:a.rect.y, width:a.rect.w, height:a.rect.h, fill:"none", stroke:col, "stroke-width":1.4, "stroke-dasharray":"10 7", opacity:".7" });
    const t = g(svg, "text", { x:a.rect.x + 6, y:a.rect.y + 18, fill:col, "font-size":13, opacity:".75" });
    t.textContent = a.label;
  }

  // terreno
  const issues = terrainIssues();
  const tLayer = g(svg, "g", {});
  for (const t of state.terrain){
    const cfg = TERRAIN[t.kind], b = boxOf(t), iss = issues.get(t.tid);
    const gg = g(tLayer, "g", { transform:`translate(${b.x} ${b.y}) rotate(${b.rot})`, class:"piece" });
    gg.dataset.tid = t.tid;
    const stroke = iss ? (iss.key === "bad" ? "var(--bad)" : "var(--warn)") : cfg.color;
    const sw = iss ? 3 : 1.6;
    if (cfg.shape === "circle"){
      g(gg, "circle", { r:b.w/2, fill:cfg.color, opacity:".78", stroke, "stroke-width":Math.max(sw, 2.2) });
      g(gg, "circle", { r:Math.max(4, b.w/2 - 8), fill:"none", stroke:"var(--paper)", "stroke-width":1.4, opacity:".5" });
    } else if (cfg.shape === "token"){
      g(gg, "circle", { r:TREASURE_CLEAR * MM, fill:"none", stroke:cfg.color,
                        "stroke-width":1, "stroke-dasharray":"5 7", opacity:".35" });
      g(gg, "circle", { r:b.w/2, fill:cfg.color, opacity:".85", stroke, "stroke-width":sw });
    } else if (cfg.shape === "wall"){
      g(gg, "rect", { x:-b.w/2, y:-b.h/2, width:b.w, height:b.h, fill:cfg.color, opacity:".9", stroke, "stroke-width":sw });
    } else {
      g(gg, "rect", { x:-b.w/2, y:-b.h/2, width:b.w, height:b.h, rx:8, fill:cfg.color,
                      opacity: cfg.pass === "blocked" ? ".72" : ".55", stroke, "stroke-width":sw });
      g(gg, "rect", { x:-b.w/2, y:-b.h/2, width:b.w, height:b.h, rx:8, fill:"none",
                      stroke:cfg.color, "stroke-width":2.2, opacity:".95" });
      if (t.kind === "wood"){
        const n = Math.max(3, Math.round(b.w / 40));
        for (let i = 0; i < n; i++){
          const cx = -b.w/2 + b.w * (i + .5) / n;
          g(gg, "circle", { cx, cy:0, r:Math.min(b.h * .34, b.w / n * .38), fill:"var(--paper)", opacity:".28" });
        }
      }
      if (t.kind === "hill"){
        for (const inset of [10, 24]){
          if (b.w - inset * 2 < 12 || b.h - inset * 2 < 10) break;
          g(gg, "rect", { x:-b.w/2 + inset, y:-b.h/2 + inset * .7, width:b.w - inset * 2, height:b.h - inset * 1.4,
                          rx:6, fill:"none", stroke:"var(--paper)", "stroke-width":1.3, opacity:".45" });
        }
      }
      if (t.kind === "marsh"){
        for (let i = 1; i <= 3; i++){
          const y = -b.h/2 + b.h * i / 4;
          g(gg, "line", { x1:-b.w/2 + 8, y1:y, x2:b.w/2 - 8, y2:y, stroke:"var(--paper)",
                          "stroke-width":1.6, "stroke-dasharray":"12 9", opacity:".4" });
        }
      }
      if (t.kind === "ruins" || t.kind === "pyramid"){
        g(gg, "line", { x1:-b.w/2, y1:-b.h/2, x2:b.w/2, y2:b.h/2, stroke:"var(--paper)", "stroke-width":1.3, opacity:".35" });
        g(gg, "line", { x1:b.w/2, y1:-b.h/2, x2:-b.w/2, y2:b.h/2, stroke:"var(--paper)", "stroke-width":1.3, opacity:".35" });
      }
    }
    if (selIs("terr", t.tid))
      g(gg, "rect", { x:-b.w/2 - 5, y:-b.h/2 - 5, width:b.w + 10, height:b.h + 10, fill:"none",
                      stroke:"var(--accent)", "stroke-width":2, "stroke-dasharray":"7 5" });
  }

  /* ---- il piano dei bersagli ----
     Un pezzo piccolo, a tavolo intero, e' largo tre pixel: prenderlo
     col dito e' impossibile e col mouse e' una lotteria. Sotto a tutto
     quello che si vede c'e' un rettangolo invisibile per ogni pezzo,
     largo almeno quanto un polpastrello. Sta SOTTO apposta: chi mira
     preciso prende sempre il pezzo vero, e il cuscinetto raccoglie solo
     quello che sarebbe finito nel vuoto. */
  const HIT_MIN_PX = 34;
  const hits = g(svg, "g", { class:"hits", fill:"none", "pointer-events":"all" });
  const hitPad = (o, key, id) => {
    const bx = boxOf(o);
    const w = Math.max(bx.w, px(HIT_MIN_PX)), h = Math.max(bx.h, px(HIT_MIN_PX));
    if (w <= bx.w && h <= bx.h) return;      // gia' abbastanza grande da sola
    const el = g(hits, "rect", { x:-w / 2, y:-h / 2, width:w, height:h, class:"piece",
                                 transform:`translate(${bx.x} ${bx.y}) rotate(${bx.rot || 0})` });
    el.dataset[key] = id;
  };
  for (const t of state.terrain) hitPad(t, "tid", t.tid);
  for (const m of state.markers) hitPad(m, "mid", m.mid);
  for (const u of state.units) if (u.placed && !isJoined(u)) hitPad(u, "uid", u.uid);

  // marcatori: quelli pieni stanno sotto le unità, le sagome sopra
  drawMarkers(svg, g, false);

  /* il fantasma dell'ultima fotografia: dove stava ogni unità alla
     fine del turno prima. E' il modo di vedere una ruota sul posto,
     che il «mosso» netto non racconta. */
  if (state.ghost) drawGhost(svg, g);

  // raggi dell'unità selezionata: il TIRO segue l'unità, perché si
  // misura da dove sei adesso. Il movimento no: quello sta sull'ancora.
  const selUnit = state.sel && state.sel.type === "unit" ? state.units.find(u => u.uid === state.sel.id) : null;
  if (state.ranges && selUnit && selUnit.placed){
    const rg = g(svg, "g", { "pointer-events":"none", fill:"none" });
    const col = state.armies[selUnit.army].color;
    const ring = (r, dash, op, label) => {
      if (r <= 0) return;
      g(rg, "circle", { cx:selUnit.x, cy:selUnit.y, r:r * MM, stroke:col, "stroke-width":1.4, "stroke-dasharray":dash, opacity:op });
      const t = g(rg, "text", { x:selUnit.x, y:selUnit.y - r * MM - 5, "text-anchor":"middle", "font-size":15, fill:col, opacity:.9 });
      t.textContent = label;
    };
    if (selUnit.maxRange) ring(selUnit.maxRange, "2 8", .55, `tiro ${selUnit.maxRange}″`);
    /* senza ancora i cerchi del movimento restano attorno all'unità:
       meglio di niente, ma è proprio il caso che l'ancora risolve */
    if (!MV.anchorOf(selUnit)){
      const b = MV.bandsFor(selUnit);
      if (b){ ring(b.move, "3 5", .5, `mov ${b.move}″`); ring(b.charge, "10 6", .6, `carica ${b.charge}″`); }
    }
  }

  // unità
  const photoIds = photoDefsFor(svg);
  const layer = g(svg, "g", {});
  for (const u of state.units){
    if (!u.placed || isJoined(u)) continue;
    const st = unitStatus(u, sc), col = state.armies[u.army].color;
    const lay = layoutOf(u);
    const Wu = lay.w, Du = lay.h;
    /* «sparsa» vuol dire che fra una base e l'altra c'e' aria: o
       perche' la formazione e' sciolta, o perche' la spaziatura la
       distanzia. In quel caso il rettangolo dietro serve solo a dire
       quanto spazio occupa l'unita', e il pezzo vero sono le basi. */
    const fu = FM.ensureFormation(u);
    const loose = fu.mode === "free" || fu.spacing > 0.5;
    const gg = g(layer, "g", { transform:`translate(${u.x} ${u.y}) rotate(${u.rot})`, class:"piece" });
    gg.dataset.uid = u.uid;
    g(gg, "rect", { x:-Wu/2, y:-Du/2, width:Wu, height:Du, fill:col,
                    opacity: selIs("unit", u.uid) ? (loose ? ".28" : ".85") : (loose ? ".18" : ".7"),
                    stroke: st.key === "bad" ? "var(--bad)" : (st.key === "warn" ? "var(--warn)" : col),
                    "stroke-width": st.key === "ok" ? 1.4 : 3,
                    "stroke-dasharray": loose ? "8 5" : "none" });

    /* Le basi, una per una, dove le mette la formazione. In ordine
       chiuso e' la griglia di sempre; in formazione sciolta sono
       sparse, e allora il rettangolo dietro serve solo a dire quanto
       spazio occupa l'unita' — sono le basi il pezzo vero. */
    const phId = photoIds.get(u.catId);
    const cells = g(gg, "g", { "pointer-events":"none" });
    for (const s of lay.slots){
      const ph = s.kind === "char" ? photoIds.get(s.catId) : phId;
      const sg = g(cells, "g", { transform:`translate(${s.x} ${s.y}) rotate(${s.rot || 0})` });
      if (loose || s.kind === "char")
        g(sg, "rect", { x:-s.w/2, y:-s.h/2, width:s.w, height:s.h, rx:1.5,
                        fill: s.kind === "char" ? "var(--accent)" : col, opacity: ph ? ".55" : ".85" });
      if (ph){
        /* la foto resta dritta anche col reggimento girato: il fronte
           lo dice gia' la riga bianca sul davanti */
        const use = g(sg, "use", { x:-s.w/2, y:-s.h/2, width:s.w, height:s.h,
                                   transform:`rotate(${-(u.rot + (s.rot || 0))})` });
        setHref(use, "#" + ph);
      }
      g(sg, "rect", { x:-s.w/2, y:-s.h/2, width:s.w, height:s.h, fill:"none",
                      stroke:"var(--paper)", "stroke-width":.8, opacity:".5" });
      g(sg, "line", { x1:-s.w/2, y1:-s.h/2, x2:s.w/2, y2:-s.h/2,
                      stroke:"var(--paper)", "stroke-width":1.4, opacity:".7" });
      if (s.kind === "char")
        g(sg, "circle", { r:Math.min(s.w, s.h) * .22, fill:"none",
                          stroke:"var(--paper)", "stroke-width":1.6, opacity:".9" });
    }
    g(gg, "line", { x1:-Wu/2, y1:-Du/2, x2:Wu/2, y2:-Du/2, stroke:"var(--paper)", "stroke-width":3.5, opacity:".9" });

    /* Il colore dell'esercito va SOPRA le foto: sotto lo coprono, e con
       le foto accese A e B si distinguevano solo dalla posizione. */
    g(gg, "rect", { x:-Wu/2, y:-Du/2, width:Wu, height:Du, fill:"none", stroke:col,
                    "stroke-width":2.6, "stroke-dasharray": loose ? "8 5" : "none",
                    "pointer-events":"none" });
    if (st.key !== "ok")
      g(gg, "rect", { x:-Wu/2 - 2.5, y:-Du/2 - 2.5, width:Wu + 5, height:Du + 5, fill:"none",
                      stroke: st.key === "bad" ? "var(--bad)" : "var(--warn)",
                      "stroke-width":2.4, "pointer-events":"none" });
    if (selIs("unit", u.uid))
      g(gg, "rect", { x:-Wu/2 - 5, y:-Du/2 - 5, width:Wu + 10, height:Du + 10, fill:"none",
                      stroke:"var(--accent)", "stroke-width":2, "stroke-dasharray":"7 5" });
  }

  // le sagome di misura vanno SOPRA i modelli: sul tavolo si appoggiano
  drawMarkers(svg, g, true);

  /* l'ancora di movimento: i cerchi restano dove l'unità è partita */
  if (state.moveAid) drawMoveAid(svg, g, selUnit);

  // numeri e cartellino
  const lab = g(svg, "g", { "pointer-events":"none" });
  for (const u of state.units){
    if (!u.placed || isJoined(u)) continue;
    if (state.labels){
      const t = g(lab, "text", { x:u.x, y:u.y + 12, "text-anchor":"middle", "font-size":34, "font-weight":"500",
                                 fill:"var(--paper)", stroke:"rgba(0,0,0,.3)", "stroke-width":"1", "paint-order":"stroke" });
      t.textContent = String(u.idx);
    }
    /* le etichette libere sotto l'unità: due parole, non un pannello.
       Servono a vedere a colpo d'occhio chi è disordinato o chi ha già
       caricato, senza che l'app sappia cosa vogliano dire. */
    if ((u.tags || []).length){
      const s2 = u.tags.slice(0, 3).join(" · ");
      const yb = Math.max(...corners(u).map(p => p[1])) + 20;
      const t = g(lab, "text", { x:u.x, y:yb, "text-anchor":"middle", "font-size":16,
                                 fill:"var(--accent)", stroke:"var(--paper)", "stroke-width":"2.4",
                                 "paint-order":"stroke", opacity:".95" });
      t.textContent = s2 + (u.tags.length > 3 ? " +" + (u.tags.length - 3) : "");
    }
    if (state.game.on && EX.woundsOf(u)){
      const yb = Math.min(...corners(u).map(p => p[1])) - 6;
      const t = g(lab, "text", { x:u.x, y:yb, "text-anchor":"middle", "font-size":17,
                                 fill:"var(--bad)", stroke:"var(--paper)", "stroke-width":"2.6",
                                 "paint-order":"stroke" });
      t.textContent = "♥ " + EX.woundsOf(u);
    }
    if (selIs("unit", u.uid)){
      const txt = `${u.idx}. ${shortName(u.name)} — ${effModels(u)} mod.` +
                  (state.game.on && u.lost ? ` (−${u.lost})` : "");
      const wBox = txt.length * 12 + 20;
      const yTop = Math.max(-40, Math.min(...corners(u).map(p => p[1])) - 44);
      g(lab, "rect", { x:u.x - wBox/2, y:yTop, width:wBox, height:30, rx:5, fill:"var(--panel)", stroke:"var(--accent)", "stroke-width":1.4 });
      const t2 = g(lab, "text", { x:u.x, y:yTop + 21, "text-anchor":"middle", "font-size":19, fill:"var(--ink)" });
      t2.textContent = txt;
    }
  }

  // righelli
  const ruler = g(svg, "g", { fill:"var(--muted)", "font-size":13, "pointer-events":"none" });
  for (let i = 0; i <= Math.round(inch(W)); i += 6){
    const x = i * MM;
    g(ruler, "line", { x1:x, y1:-6, x2:x, y2:0, stroke:"var(--line-strong)", "stroke-width":1 });
    const t = g(ruler, "text", { x, y:-12, "text-anchor":"middle" }); t.textContent = i;
  }
  for (let i = 0; i <= Math.round(inch(H)); i += 6){
    const y = i * MM;
    g(ruler, "line", { x1:-6, y1:y, x2:0, y2:y, stroke:"var(--line-strong)", "stroke-width":1 });
    const t = g(ruler, "text", { x:-11, y:y + 4, "text-anchor":"end" }); t.textContent = i;
  }

  /* ---- aiuti tattici sull'unità selezionata ---- */
  drawTactics(svg, g, selUnit);

  /* ---- righelli: restano sul tavolo finché non li togli ---- */
  const ruler2 = g(svg, "g", { "pointer-events":"none" });
  const drawRuler = ([p1, p2], live) => {
    const col = live ? "var(--accent)" : "var(--muted)";
    g(ruler2, "line", { x1:p1[0], y1:p1[1], x2:p2[0], y2:p2[1], stroke:col, "stroke-width":2,
                        "stroke-dasharray": live ? "none" : "9 5" });
    g(ruler2, "circle", { cx:p1[0], cy:p1[1], r:4, fill:col });
    g(ruler2, "circle", { cx:p2[0], cy:p2[1], r:4, fill:col });
    const mx = (p1[0]+p2[0])/2, my = (p1[1]+p2[1])/2;
    g(ruler2, "rect", { x:mx - 36, y:my - 27, width:72, height:23, rx:4, fill:"var(--panel)", stroke:col, "stroke-width":1 });
    const t = g(ruler2, "text", { x:mx, y:my - 11, "text-anchor":"middle", "font-size":15, fill:"var(--ink)" });
    t.textContent = (Math.hypot(p2[0]-p1[0], p2[1]-p1[1]) / MM).toFixed(2) + "″";
  };
  for (const r of state.rulers) drawRuler(r, false);
  if (state.measurePts.length === 1){
    const [p1] = state.measurePts;
    g(ruler2, "circle", { cx:p1[0], cy:p1[1], r:5, fill:"none", stroke:"var(--accent)", "stroke-width":2 });
    g(ruler2, "circle", { cx:p1[0], cy:p1[1], r:3, fill:"var(--accent)" });
  }

  /* ---- la zona che si sta disegnando adesso ---- */
  if (state.zonePts){
    const z = state.zonePts;
    g(svg, "rect", { x:Math.min(z.x0, z.x1), y:Math.min(z.y0, z.y1),
                     width:Math.abs(z.x1 - z.x0), height:Math.abs(z.y1 - z.y0),
                     fill:"var(--accent)", "fill-opacity":".1", stroke:"var(--accent)",
                     "stroke-width":2, "stroke-dasharray":"8 6", "pointer-events":"none" });
  }

  /* ---- maniglia di rotazione sul pezzo selezionato ----
     Ruotare stava solo su Q/E e sui due bottoni dell'ispettore: è un
     gesto che si fa cento volte per schieramento e vuole il mouse. */
  const selObj = selectedObject();
  /* le zone non si ruotano: un rettangolo di schieramento storto non
     esiste su nessun tavolo, e la maniglia darebbe solo fastidio */
  if (selObj && selObj.zid === undefined && (selObj.uid === undefined || selObj.placed)){
    const b = boxOf(selObj), hp = handlePos(selObj), fc = toWorld([0, -b.h/2], b);
    const hg = g(svg, "g", { class:"handle" });
    hg.dataset.handle = "1";
    const r = px(11);
    g(hg, "line", { x1:fc[0], y1:fc[1], x2:hp[0], y2:hp[1], stroke:"var(--accent)",
                    "stroke-width":px(1.6), "stroke-dasharray":`${px(4)} ${px(3)}` });
    /* il bersaglio e' piu' largo del pallino: quello che si vede e' un
       segno, quello che si prende col dito e' questo cerchio */
    g(hg, "circle", { cx:hp[0], cy:hp[1], r:px(26), fill:"none", "pointer-events":"all" });
    g(hg, "circle", { cx:hp[0], cy:hp[1], r, fill:"var(--panel)", stroke:"var(--accent)", "stroke-width":px(2.2) });
    g(hg, "circle", { cx:hp[0], cy:hp[1], r:r * .31, fill:"var(--accent)" });
  }

  /* il cursore dice in che modalità sei: disegnare una zona e misurare
     non sono trascinare */
  svgEl.style.cursor = (state.zoning || state.measure) ? "crosshair" : "";

  $("#sc-name").textContent = sc.label + (sc.pts ? ` · ${sc.pts} pt` : "");
  $("#sc-desc").textContent = sc.desc || "";
  updateStat(sc);
}

function shortName(n){
  const s = String(n).replace(/\(.*?\)/g, "").trim();
  return s.length > 18 ? s.slice(0, 17) + "…" : s;
}

/* ============================================================
   7c · MARCATORI, FANTASMA E ANCORA DI MOVIMENTO
   ============================================================ */

/* I marcatori sono l'unico pezzo del tavolo che non ha un significato:
   quello glielo dà chi scrive l'etichetta. Le sagome di misura sono lo
   stesso oggetto senza riempimento, e si disegnano sopra i modelli
   perché sul tavolo ci si appoggiano davvero. */
function drawMarkers(svg, g, measure){
  const list = state.markers.filter(m => !!m.measure === !!measure);
  if (!list.length) return;
  const layer = g(svg, "g", {});
  for (const m of list){
    const b = EX.markerBox(m), col = EX.markerColor(m.color);
    const gg = g(layer, "g", { transform:`translate(${b.x} ${b.y}) rotate(${b.rot})`, class:"piece" });
    gg.dataset.mid = m.mid;
    const sel = selIs("mark", m.mid);
    const sw = sel ? 3 : 2;
    if (EX.markerRound(m)){
      g(gg, "circle", { r:b.w / 2, fill: m.measure ? "none" : col,
                        opacity: m.measure ? 1 : ".8", stroke:col, "stroke-width":sw,
                        "stroke-dasharray": m.measure ? "9 6" : "none" });
      if (m.measure){
        /* una sagoma senza centro non si appoggia: il crocino dice dove
           l'hai messa, ed è quello che si guarda quando si discute */
        g(gg, "line", { x1:-6, y1:0, x2:6, y2:0, stroke:col, "stroke-width":1.6 });
        g(gg, "line", { x1:0, y1:-6, x2:0, y2:6, stroke:col, "stroke-width":1.6 });
        g(gg, "circle", { r:Math.max(2, b.w / 2), fill:col, opacity:".07" });
      }
    } else {
      g(gg, "rect", { x:-b.w / 2, y:-b.h / 2, width:b.w, height:b.h, rx:4,
                      fill: m.measure ? "none" : col, opacity: m.measure ? 1 : ".7",
                      stroke:col, "stroke-width":sw,
                      "stroke-dasharray": m.measure ? "9 6" : "none" });
      if (m.measure) g(gg, "rect", { x:-b.w / 2, y:-b.h / 2, width:b.w, height:b.h, rx:4, fill:col, opacity:".07" });
      /* la riga davanti: un rettangolo appoggiato ha un verso, e senza
         il segno non si capisce da che parte lo hai girato */
      g(gg, "line", { x1:-b.w / 2, y1:-b.h / 2, x2:b.w / 2, y2:-b.h / 2, stroke:col, "stroke-width":3, opacity:".9" });
    }
    if (sel) g(gg, "circle", { r:Math.max(b.w, b.h) / 2 + 7, fill:"none",
                               stroke:"var(--accent)", "stroke-width":2, "stroke-dasharray":"7 5" });
    if (m.label){
      const t = g(layer, "text", { x:m.x, y:m.y + b.h / 2 + 20, "text-anchor":"middle",
                                   "font-size":17, fill:col, stroke:"var(--paper)",
                                   "stroke-width":"2.6", "paint-order":"stroke", "pointer-events":"none" });
      t.textContent = m.label;
    }
  }
}

/* Il fantasma: dove stava ogni unità nell'ultima fotografia. Le
   fotografie c'erano già e non si vedevano sul tavolo grande — e sono
   l'unico modo di vedere una ruota sul posto, che il «mosso» netto per
   costruzione racconta come zero. */
function lastShot(){
  const turns = (state.game && state.game.turns) || [];
  for (let i = turns.length - 1; i >= 0; i--)
    if (turns[i].units && turns[i].units.length) return turns[i];
  return null;
}
function drawGhost(svg, g){
  const shot = lastShot();
  if (!shot) return;
  const layer = g(svg, "g", { "pointer-events":"none" });
  for (const r of shot.units){
    if (!r.placed || r.dead || !r.w || !r.h) continue;
    const col = r.army === "A" ? "var(--armyA)" : "var(--armyB)";
    const w = r.w * MM, h = r.h * MM;
    g(layer, "rect", { x:-w / 2, y:-h / 2, width:w, height:h, rx:3,
                       fill:col, "fill-opacity":".08",
                       stroke:col, "stroke-width":1.6, "stroke-dasharray":"5 6", opacity:".55",
                       transform:`translate(${r.x * MM} ${r.y * MM}) rotate(${r.rot || 0})` });
  }
  const cap = g(svg, "text", { x:6, y:-24, "font-size":15, fill:"var(--muted)", "pointer-events":"none" });
  cap.textContent = shot.kind === "deploy" ? "fantasma: lo schieramento"
    : `fantasma: fine del turno ${shot.n} di ${shot.army}`;
}

/* ------------------------------------------------------------------
   L'ancora di movimento
   I cerchi di movimento erano disegnati attorno all'unità e quindi la
   seguivano: la domanda «fin dove posso arrivare?» spariva proprio nel
   momento in cui la stavi muovendo, e il giocatore si dimenticava da
   dove era partito. Qui i cerchi stanno FERMI sul punto di partenza, e
   una riga con un numero grosso dice quanti pollici hai già fatto.
   ------------------------------------------------------------------ */
function drawMoveAid(svg, g, u){
  if (!u || !u.placed || u.dead) return;
  const a = MV.anchorOf(u);
  if (!a) return;
  const mv = MV.movedFrom(u);
  const b = MV.bandsFor(u);
  const col = state.armies[u.army].color;
  const layer = g(svg, "g", { "pointer-events":"none", fill:"none" });

  /* la sagoma di dov'era: si vede subito se il pezzo è appena
     scivolato o se ha attraversato mezzo tavolo */
  const w = unitW(u), h = unitD(u);
  g(layer, "rect", { x:-w / 2, y:-h / 2, width:w, height:h, rx:3,
                     fill:col, opacity:".1", stroke:col, "stroke-width":1.8,
                     "stroke-dasharray":"6 5",
                     transform:`translate(${a.x} ${a.y}) rotate(${a.rot || 0})` });
  g(layer, "circle", { cx:a.x, cy:a.y, r:4.5, fill:col, opacity:".85", stroke:"none" });

  /* i cerchi, sull'ancora e non sull'unità: è tutta la differenza */
  if (b){
    MV.MOVE_BANDS.forEach((band, i) => {
      const r = b[band.id] * MM;
      if (!(r > 0)) return;
      g(layer, "circle", { cx:a.x, cy:a.y, r, stroke:col, "stroke-width":1.5,
                           "stroke-dasharray":band.dash, opacity:band.op });
      /* ogni etichetta su una sua direzione: marcia e carica media
         cadono a un pollice l'una dall'altra e messe tutte in cima si
         coprivano a vicenda proprio quando servono */
      const ang = (-90 + (i - 1.5) * 26) * Math.PI / 180;
      const t = g(layer, "text", { x:a.x + Math.cos(ang) * r, y:a.y + Math.sin(ang) * r - 5,
                                   "text-anchor":"middle",
                                   "font-size":15, fill:col, opacity:.95,
                                   stroke:"var(--paper)", "stroke-width":"3", "paint-order":"stroke" });
      t.textContent = `${band.label} ${b[band.id]}″`;
    });
  }

  if (!mv || mv.still) return;

  /* la riga fra dov'eri e dove sei, con il numero al centro. Il colore
     è un semaforo, non un arbitro: l'unità si muove lo stesso. */
  const band = MV.bandOf(u, mv.dist);
  const c = band.key === "none" ? col : band.color;
  g(layer, "line", { x1:a.x, y1:a.y, x2:u.x, y2:u.y, stroke:c, "stroke-width":2.6 });
  g(layer, "circle", { cx:u.x, cy:u.y, r:4.5, fill:c, stroke:"none" });

  /* il cartellino a metà strada, scostato di lato: in mezzo alla riga
     finiva sopra il pezzo o sopra la sua targhetta, cioè proprio sopra
     le due cose che stavi guardando */
  const dx = u.x - a.x, dy = u.y - a.y, len = Math.hypot(dx, dy) || 1;
  const mx = (a.x + u.x) / 2 - (dy / len) * 34;
  const my = (a.y + u.y) / 2 + (dx / len) * 34;
  const txt = b ? `${mv.dist.toFixed(1)}″ di ${b.move}″` : `${mv.dist.toFixed(1)}″`;
  const sub = b
    ? (mv.dist <= b.move ? `restano ${(b.move - mv.dist).toFixed(1)}″` : band.label)
    : (mv.turn ? mv.turn + "° di fronte" : "");
  const wBox = Math.max(96, txt.length * 11 + 26);
  g(layer, "rect", { x:mx - wBox / 2, y:my - 34, width:wBox, height: sub ? 44 : 27, rx:6,
                     fill:"var(--panel)", stroke:c, "stroke-width":2, opacity:".97" });
  const t1 = g(layer, "text", { x:mx, y:my - 15, "text-anchor":"middle", "font-size":19,
                                "font-weight":"600", fill:"var(--ink)" });
  t1.textContent = txt;
  if (sub){
    const t2 = g(layer, "text", { x:mx, y:my + 2, "text-anchor":"middle", "font-size":14, fill:c });
    t2.textContent = sub + (mv.turn ? ` · ${mv.turn}°` : "");
  }
}



/* ============================================================
   7b · AIUTI TATTICI
   La geometria c'era gia' per i controlli di legalita': queste sono
   solo le viste che mancavano. Distanze misurate dal BORDO, come si
   misura al tavolo, non dal centro come tornava comodo al codice.
   ============================================================ */
function sightPieces(){
  return state.terrain.filter(t => TERRAIN[t.kind].los).map(t => {
    const b = boxOf(t), circle = TERRAIN[t.kind].shape === "circle";
    const poly = boxCorners(b);
    return {
      blocks:true, circle, box:b, poly, label:TERRAIN[t.kind].label,
      contains: p => circle
        ? Math.hypot(p[0] - b.x, p[1] - b.y) <= b.w / 2
        : polysOverlap([[p[0]-1,p[1]-1],[p[0]+1,p[1]-1],[p[0]+1,p[1]+1],[p[0]-1,p[1]+1]], poly),
    };
  });
}

export function surveyFor(u){
  if (!u || !u.placed) return [];
  const enemies = state.units.filter(o => o.army !== u.army && o.placed && !o.dead && !isJoined(o));
  return survey(u, enemies, { cornersOf: corners, boxOf, sightPieces: sightPieces(), inch });
}

function drawTactics(svg, g, u){
  if (!u || !u.placed) return;
  const col = state.armies[u.army].color;

  /* arco frontale e portata di carica: chi ci finisce dentro lo si può
     caricare senza girare, ed è la domanda che ci si fa per prima */
  if (state.arcs){
    const bands = movementBands(u);
    if (bands){
      const layer = g(svg, "g", { "pointer-events":"none" });
      for (const [reach, op, dash] of [[bands.chargeMax, .10, "none"], [bands.charge, .16, "none"]]){
        const poly = frontArcPoly(boxOf(u), reach * MM);
        g(layer, "polygon", { points: poly.map(p => p.join(",")).join(" "),
                              fill: col, opacity: op, stroke: col, "stroke-width":1.2,
                              "stroke-dasharray": dash, "stroke-opacity":.5 });
      }
      const tip = toWorld([0, -boxOf(u).h/2 - bands.charge * MM], boxOf(u));
      const t = g(layer, "text", { x:tip[0], y:tip[1] - 6, "text-anchor":"middle", "font-size":15, fill:col, opacity:.9 });
      t.textContent = `carica ${bands.charge}″ · max ${bands.chargeMax}″`;
    }
  }

  if (!state.distances) return;
  const layer = g(svg, "g", { "pointer-events":"none" });
  const rows = surveyFor(u);
  const arc = movementBands(u) ? frontArcPoly(boxOf(u), movementBands(u).chargeMax * MM) : null;
  for (const r of rows.slice(0, 8)){
    const inArc = arc && polysOverlap(arc, corners(r.unit));
    const stroke = r.blocked ? "var(--muted)" : (inArc ? "var(--ok)" : col);
    g(layer, "line", { x1:r.from[0], y1:r.from[1], x2:r.to[0], y2:r.to[1],
                       stroke, "stroke-width":1.5, opacity: r.blocked ? .35 : .7,
                       "stroke-dasharray": r.blocked ? "5 6" : "none" });
    /* il cartellino sta vicino al bersaglio, non a metà strada: le
       linee partono tutte dallo stesso punto e a metà i numeri si
       accavallano uno sull'altro */
    const k = 0.78;
    const mx = r.from[0] + (r.to[0] - r.from[0]) * k;
    const my = r.from[1] + (r.to[1] - r.from[1]) * k;
    const label = r.dist.toFixed(1) + "″" + (r.blocked ? " ✕" : "");
    const w = label.length * 9 + 10;
    g(layer, "rect", { x:mx - w/2, y:my - 12, width:w, height:19, rx:4,
                       fill:"var(--panel)", stroke, "stroke-width":1, opacity:.95 });
    const t = g(layer, "text", { x:mx, y:my + 2, "text-anchor":"middle", "font-size":13,
                                 fill: r.blocked ? "var(--muted)" : "var(--ink)" });
    t.textContent = label;
  }
}
/* La riga di stato diceva quanti problemi c'erano ma non dove: per
   trovare l'unità fuori zona toccava scorrere il pannello. Ora ogni
   avviso è un pulsante che seleziona e inquadra il colpevole, e
   ripremendolo si passa al successivo. */
let statCycle = 0;
function updateStat(sc){
  const placed = state.units.filter(u => u.placed && !isJoined(u));
  const bad  = placed.filter(u => unitStatus(u, sc).key === "bad");
  const warn = placed.filter(u => unitStatus(u, sc).key === "warn");
  const terr = [...terrainIssues().keys()];
  const host = $("#stat");
  host.innerHTML = "";

  const add = (txt, cls, list, kind) => {
    /* i contatori di problemi spariscono quando non c'e' niente da
       segnalare; le indicazioni fisse (schierate, turno, punteggio)
       non puntano a nessuna lista e restano sempre */
    if (kind && !list.length) return;
    const el = document.createElement(list.length ? "button" : "span");
    el.className = "statchip" + (cls ? " " + cls : "");
    el.textContent = txt;
    if (list.length){
      el.title = "Vai al primo · ripremi per il successivo";
      el.addEventListener("click", () => {
        const it = list[statCycle++ % list.length];
        if (kind === "unit"){ state.sel = { type:"unit", id:it.uid }; focusUnit(it); }
        else state.sel = { type:"terr", id:it };
        renderAll();
      });
    }
    host.appendChild(el);
  };

  add(`${placed.length}/${state.units.length} schierate`, "", [], null);
  add(`${warn.length} fuori zona`, "warn", warn, "unit");
  add(`${bad.length} in conflitto`, "bad", bad, "unit");
  add(`${terr.length} avvisi terreno`, "warn", terr, "terr");
  if (state.game.on){
    const s = G.score();
    add(`T${state.game.turn} ${G.phaseLabel()}`, "turn", [], null);
    add(`−${s.A.lostPts} / −${s.B.lostPts} pt`, "", [], null);
  }
}
function renderAll(){
  reindex(); syncImportBox(); renderArmies(); renderInspector(); renderTerrainList(); renderMarkerList();
  G.renderGamePanel($("#game"), { esc });
  drawBoard(); refreshEditor(); save();
}

/* ============================================================
   8 · PIAZZAMENTO
   ============================================================ */
function defaultRot(army, sc){
  const own = (sc.zones[army] || [])[0], other = (sc.zones[army === "A" ? "B" : "A"] || [])[0];
  if (!own || !other) return army === "A" ? 0 : 180;
  const dx = (other.x + other.w/2) - (own.x + own.w/2);
  const dy = (other.y + other.h/2) - (own.y + own.h/2);
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 90 : 270;
  return dy > 0 ? 180 : 0;
}
function place(u){
  /* un personaggio unito a un reggimento non si schiera da solo: sta
     dove sta il reggimento */
  if (isJoined(u)) return;
  const sc = currentScenario();
  /* con le zone disegnate a mano un esercito puo' non averne nessuna:
     l'elenco vuoto e' un caso vero, non un errore, e allora il tavolo
     intero fa da zona */
  const zone = zonesFor(u.army, sc)[0] || R(0, 0, state.tableW, state.tableH);
  u.rot = defaultRot(u.army, sc);
  u.placed = true;
  const [x, y] = findSpot(u, zone, sc);
  u.x = x; u.y = y;
  /* schierare non e' muoversi: l'ancora riparte da dove il pezzo e'
     appena stato messo, sennò il primo movimento risulterebbe misurato
     dalla riserva */
  MV.setAnchor(u);
}
function findSpot(u, zone, sc){
  const rot = u.rot % 180 !== 0;
  const w = rot ? unitD(u) : unitW(u), h = rot ? unitW(u) : unitD(u);
  const step = 8;
  for (let y = zone.y + h/2; y <= zone.y + zone.h - h/2 + 1; y += step){
    for (let x = zone.x + w/2; x <= zone.x + zone.w - w/2 + 1; x += step){
      const test = { ...u, x, y };
      let clash = false;
      for (const o of state.units)
        if (o !== u && o.placed && !isJoined(o) && polysOverlap(corners(test), corners(o))) { clash = true; break; }
      if (!clash) for (const b of sc.blocked) if (polysOverlap(corners(test), rectPoly(b))) { clash = true; break; }
      if (!clash) for (const t of impassable()) if (polysOverlap(corners(test), corners(t))) { clash = true; break; }
      if (!clash) return [x, y];
    }
  }
  return [zone.x + zone.w/2, zone.y + zone.h/2];
}
function autoDeploy(){
  const sc = currentScenario();
  for (const id of ["A", "B"]){
    const zone = (sc.zones[id] || [])[0];
    if (!zone) continue;
    const list = state.units.filter(u => u.army === id && !isJoined(u)).sort((a, b) => unitW(b) - unitW(a));
    const rot = defaultRot(id, sc), horiz = rot % 180 === 0;
    const alongMax = horiz ? zone.w : zone.h, acrossMax = horiz ? zone.h : zone.w;
    const gap = 0.5 * MM;
    let cursor = 6, laneStart = 5, laneDepth = 0;
    for (const u of list){
      u.rot = rot; u.placed = true;
      const along = horiz ? unitW(u) : unitD(u), across = horiz ? unitD(u) : unitW(u);
      if (cursor + along > alongMax - 4 && cursor > 6){ cursor = 6; laneStart += laneDepth + gap; laneDepth = 0; }
      laneDepth = Math.max(laneDepth, across);
      const reverse = (rot === 180 || rot === 90);
      let acrossPos = reverse ? acrossMax - laneStart - across/2 : laneStart + across/2;
      acrossPos = Math.max(across/2 + 2, Math.min(acrossPos, acrossMax - across/2 - 2));
      const alongPos = cursor + along/2;
      if (horiz){ u.x = zone.x + alongPos; u.y = zone.y + acrossPos; }
      else      { u.y = zone.y + alongPos; u.x = zone.x + acrossPos; }
      cursor += along + gap;
    }
  }
  // seconda passata: chi resta sovrapposto o sul terreno impassabile viene ricollocato
  for (const u of state.units.filter(x => x.placed && !isJoined(x))){
    if (unitStatus(u, sc).key === "ok") continue;
    const zone = (sc.zones[u.army] || [])[0];
    if (!zone) continue;
    const [x, y] = findSpot(u, zone, sc);
    u.x = x; u.y = y;
  }
  renderAll();
  toast("Schieramento automatico completato — Ctrl+Z se preferivi prima.");
}

/* ============================================================
   9 · INTERAZIONE
   ============================================================ */
let drag = null, spin = null;
const toSvg = evt => view.toBoard(evt);
const snapVal = v => state.snap ? Math.round(v / (MM / 4)) * (MM / 4) : v;

/* ------------------------------------------------------------------
   Magnetismo fra reggimenti
   La griglia da un quarto di pollice non serve a granche': il gesto
   vero del wargame e' mettere due unita' in linea o spalla a spalla, e
   a mano non viene mai preciso. Qui, se il pezzo trascinato si avvicina
   al fianco o alla linea di un'altra unita' con lo stesso orientamento,
   ci si aggancia.
   ------------------------------------------------------------------ */
const MAGNET = MM * 0.35;                     // poco piu' di un terzo di pollice

function magnetise(u, x, y){
  if (!state.snap) return [x, y];
  const rot = ((u.rot % 360) + 360) % 360;
  const a = -rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const toLoc = (px, py) => [px * c - py * s, px * s + py * c];
  const toWld = (px, py) => [px * c + py * s, -px * s + py * c];

  const halfW = unitW(u) / 2, halfD = unitD(u) / 2;
  let [lx, ly] = toLoc(x, y);
  let bestX = null, bestY = null, dX = MAGNET, dY = MAGNET;

  for (const o of state.units){
    if (o === u || !o.placed || o.dead || isJoined(o)) continue;
    if ((((o.rot % 360) + 360) % 360) !== rot) continue;     // solo chi guarda dove guardo io
    const [ox, oy] = toLoc(o.x, o.y);
    const oW = unitW(o) / 2, oD = unitD(o) / 2;

    /* fianco a fianco: il mio bordo destro contro il suo sinistro e
       viceversa, con i fronti allineati */
    for (const cand of [ox - oW - halfW, ox + oW + halfW]){
      const d = Math.abs(lx - cand);
      if (d < dX && Math.abs(ly - oy) < (halfD + oD)){ dX = d; bestX = cand; }
    }
    for (const cand of [oy - oD - halfD, oy + oD + halfD, oy]){
      const d = Math.abs(ly - cand);
      if (d < dY && Math.abs(lx - ox) < (halfW + oW) * 1.6){ dY = d; bestY = cand; }
    }
    /* e l'allineamento dei fianchi, per le seconde linee */
    for (const cand of [ox, ox - oW + halfW, ox + oW - halfW]){
      const d = Math.abs(lx - cand);
      if (d < dX){ dX = d; bestX = cand; }
    }
  }
  if (bestX !== null) lx = bestX;
  if (bestY !== null) ly = bestY;
  if (bestX === null && bestY === null) return [x, y];
  const [wx, wy] = toWld(lx, ly);
  return [bestX !== null ? wx : x, bestY !== null ? wy : y];
}

/* ------------------------------------------------------------------
   Aggancio al contatto
   Il magnetismo di prima allineava solo unita' con lo STESSO
   orientamento, e il gesto che al tavolo si fa cento volte non e'
   allineare due reggimenti paralleli: e' appoggiare il caricante
   contro il bersaglio, a filo, sulla faccia che ha scelto. E' pura
   geometria, quindi e' terreno dell'app.

   L'app non decide se la carica e' legale. Mette il pezzo dove il
   giocatore ha gia' deciso di metterlo, e lo mette dritto.
   ------------------------------------------------------------------ */
const CONTACT_MAGNET = MM * 0.55;

function contactSnap(u, x, y){
  const uw = unitW(u), uh = unitD(u);
  let best = null;
  const myRot = (((u.rot || 0) % 360) + 360) % 360;
  for (const o of state.units){
    if (o === u || !o.placed || o.dead || isJoined(o)) continue;
    /* Chi guarda gia' dove guardo io e' un caso dell'altro magnetismo:
       due reggimenti paralleli si mettono in linea, non uno addosso
       all'altro girato. Cosi' i due agganci non si contendono lo
       stesso gesto. */
    if ((((o.rot || 0) % 360) + 360) % 360 === myRot) continue;
    const b = boxOf(o);
    const a = (b.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    /* le quattro facce del bersaglio, con la normale che esce */
    const faces = [
      [[0, -1], b.h / 2, b.w], [[0, 1], b.h / 2, b.w],
      [[-1, 0], b.w / 2, b.h], [[1, 0], b.w / 2, b.h],
    ];
    for (const [n, off, len] of faces){
      const nx = n[0] * ca - n[1] * sa, ny = n[0] * sa + n[1] * ca;   // normale nel mondo
      const tx = -ny, ty = nx;                                        // tangente della faccia
      /* il centro che il caricante avrebbe stando a filo e centrato:
         la sua profondita' sta tutta fuori dalla faccia */
      const cx = b.x + nx * (off + uh / 2), cy = b.y + ny * (off + uh / 2);
      /* scivolamento lungo la faccia: lo decide il giocatore, e si
         ferma quando i due pezzi non si toccherebbero piu' */
      const lim = Math.max(0, (len + uw) / 2 - MM / 4);
      let t = (x - cx) * tx + (y - cy) * ty;
      t = Math.max(-lim, Math.min(lim, t));
      const px = cx + tx * t, py = cy + ty * t;
      const d = Math.hypot(x - px, y - py);
      if (d < CONTACT_MAGNET && (!best || d < best.d)){
        /* il fronte del caricante guarda dentro la faccia: il fronte
           locale e' -y, quindi la rotazione che serve e' questa */
        const rot = ((Math.round(Math.atan2(-nx, ny) * 180 / Math.PI) % 360) + 360) % 360;
        best = { x:px, y:py, rot, d };
      }
    }
  }
  return best;
}

/* Un solo posto in cui si decide dove finisce davvero un'unita'
   trascinata: griglia, allineamento fra pari e aggancio al contatto. */
function snapUnit(u, x, y){
  if (!state.snap) return { x, y, rot: u.rot };
  /* prima l'aggancio al contatto, che e' il gesto piu' specifico: si
     applica solo a un pezzo orientato diversamente e a filo di una
     faccia. Tutto il resto lo fa l'allineamento fra pari. */
  const c = contactSnap(u, x, y);
  if (c) return c;
  const [ax, ay] = magnetise(u, x, y);
  return { x: ax, y: ay, rot: u.rot };
}

/* la maniglia di rotazione: un pallino davanti al pezzo selezionato,
   tenuto a distanza fissa in PIXEL cosi' non finisce dentro il pezzo
   quando si ingrandisce ne' a mezzo tavolo quando si rimpicciolisce */
const HANDLE_OUT_PX = 40;
function handlePos(o){
  const b = boxOf(o);
  return toWorld([0, -b.h / 2 - px(HANDLE_OUT_PX)], b);
}

svgEl.addEventListener("pointerdown", e => {
  if (e.button === 1 || e.shiftKey) return;         // quello e' scorrimento, se ne occupa view.js
  const p = toSvg(e);

  if (state.measure){
    if (state.measurePts.length >= 2) state.measurePts = [];
    state.measurePts.push(p);
    if (state.measurePts.length === 2){
      act("misura", () => {
        state.rulers.push(state.measurePts.slice());
        if (state.rulers.length > 8) state.rulers.shift();
        state.measurePts = [];
      });
    } else drawBoard();
    return;
  }

  if (e.target.closest("[data-handle]")){
    const obj = selectedObject();
    if (obj){
      history.push("ruota");
      spin = { obj, start: obj.rot || 0 };
      try { svgEl.setPointerCapture(e.pointerId); } catch (_) {}
    }
    return;
  }

  /* modalità «disegna una zona»: il trascinamento sul vuoto diventa un
     rettangolo invece che uno scorrimento. È il gesto con cui qualsiasi
     scenario diventa rappresentabile senza che l'app lo conosca. */
  if (state.zoning){
    state.zonePts = { x0:p[0], y0:p[1], x1:p[0], y1:p[1] };
    try { svgEl.setPointerCapture(e.pointerId); } catch (_) {}
    return;
  }

  const host = e.target.closest("[data-uid],[data-tid],[data-mid],[data-zid]");
  if (!host){
    /* il vuoto non deseleziona subito: prima si prova a scorrere, e se
       il dito non si e' mosso allora era davvero un clic a vuoto */
    gestures.beginPan(e);
    return;
  }
  let obj = null, what = "";
  if (host.dataset.uid){
    obj = state.units.find(x => x.uid === +host.dataset.uid);
    state.sel = { type:"unit", id:obj.uid }; what = shortName(obj.name);
  } else if (host.dataset.mid){
    obj = markerById(host.dataset.mid);
    state.sel = { type:"mark", id:obj.mid }; what = obj.label || "marcatore";
  } else if (host.dataset.zid){
    obj = zoneById(host.dataset.zid);
    state.sel = { type:"zone", id:obj.zid }; what = obj.label || "zona";
  } else {
    obj = state.terrain.find(x => x.tid === +host.dataset.tid);
    state.sel = { type:"terr", id:obj.tid }; what = TERRAIN[obj.kind].label.toLowerCase();
  }
  /* Il tasto destro non trascina: seleziona e basta, e il menu lo apre
     l'evento contextmenu subito dopo. Ci si ricorda QUALE pezzo era,
     perché con il puntatore catturato quell'evento arriva etichettato
     sull'SVG e non sul pezzo, e da lì non si risalirebbe. */
  if (e.button === 2){
    ctxTarget = obj;
    renderArmies(); renderInspector(); renderTerrainList(); drawBoard();
    return;
  }
  ctxTarget = null;

  history.push("sposta " + what);
  /* Il punto di partenza si dichiara da solo al primo spostamento: chi
     muove un'unità sta cominciando il suo movimento, e non deve premere
     un tasto per dirlo. */
  if (obj.uid !== undefined) MV.ensureAnchor(obj);
  drag = { obj, dx: obj.x - p[0], dy: obj.y - p[1], moved:false };
  /* tenendo premuto senza muovere si apre il menu del pezzo: e' il
     tasto destro di chi non ha un tasto destro */
  cancelPress();
  const at = { x: e.clientX, y: e.clientY, id: e.pointerId };
  press = { at, timer: setTimeout(() => {
    press = null;
    try { svgEl.releasePointerCapture(at.id); } catch (_) {}
    openPieceMenu(obj, at.x, at.y, { fromDrag: true });
  }, PRESS_MS) };
  try { svgEl.setPointerCapture(e.pointerId); } catch (_) {}
  renderArmies(); renderInspector(); renderTerrainList(); drawBoard();
});

svgEl.addEventListener("pointermove", e => {
  if (state.zonePts){
    const p = toSvg(e);
    state.zonePts.x1 = p[0]; state.zonePts.y1 = p[1];
    drawBoard();
    return;
  }
  if (spin){
    const p = toSvg(e);
    let deg = Math.atan2(p[1] - spin.obj.y, p[0] - spin.obj.x) * 180 / Math.PI + 90;
    if (!e.altKey) deg = Math.round(deg / (spin.obj.uid !== undefined ? 15 : 5)) * (spin.obj.uid !== undefined ? 15 : 5);
    spin.obj.rot = ((Math.round(deg) % 360) + 360) % 360;
    drawBoard();
    return;
  }
  if (press && Math.hypot(e.clientX - press.at.x, e.clientY - press.at.y) > PRESS_SLOP) cancelPress();
  if (!drag) return;
  const p = toSvg(e);
  let x = snapVal(p[0] + drag.dx), y = snapVal(p[1] + drag.dy);
  if (drag.obj.uid !== undefined){
    const s2 = snapUnit(drag.obj, x, y);
    x = s2.x; y = s2.y; drag.obj.rot = s2.rot;
  }
  drag.obj.x = x; drag.obj.y = y;
  drag.moved = true;
  drawBoard();
});

function endDrag(e){
  if (state.zonePts){
    const z = state.zonePts;
    state.zonePts = null;
    try { svgEl.releasePointerCapture(e.pointerId); } catch (_) {}
    const w = Math.abs(z.x1 - z.x0), h = Math.abs(z.y1 - z.y0);
    /* un tocco non è un rettangolo: sotto il mezzo pollice si fa finta
       di niente invece di lasciare in giro una zona invisibile */
    if (w < MM / 2 || h < MM / 2){ renderAll(); return; }
    act("disegna una zona", () => {
      state.zones.push(makeZone({
        zid: zidSeq++, x:(z.x0 + z.x1) / 2, y:(z.y0 + z.y1) / 2, w, h,
        kind: state.zones.some(q => q.kind === "A") ? "B" : "A",
      }));
      state.sel = { type:"zone", id: state.zones[state.zones.length - 1].zid };
    });
    return;
  }
  cancelPress();
  if (spin){
    /* la maniglia premuta e lasciata dov'era non e' una rotazione */
    if (spin.obj.rot === spin.start) history.discard();
    spin = null;
    try { svgEl.releasePointerCapture(e.pointerId); } catch (_) {}
    renderAll();
    return;
  }
  if (!drag) return;
  /* Un pezzo toccato e non spostato ha solo cambiato la selezione: il
     passo aperto al pointerdown si toglie, sennò per tornare indietro
     di un movimento vero ne servirebbero due. */
  if (!drag.moved) history.discard();
  drag = null;
  try { svgEl.releasePointerCapture(e.pointerId); } catch (_) {}
  renderAll();
}
/* doppio clic su un'unita': la formazione. E' il gesto che ci si
   aspetta da un pezzo composto da tante basette, e risparmia il giro
   dall'ispettore. */
svgEl.addEventListener("dblclick", e => {
  const host = e.target.closest("[data-uid]");
  if (!host) return;
  e.preventDefault();
  openEditor(+host.dataset.uid);
});
svgEl.addEventListener("pointerup", endDrag);
svgEl.addEventListener("pointercancel", endDrag);

/* rotella con Shift sopra un pezzo selezionato: cambia il fronte.
   E' il secondo gesto piu' ripetuto dopo lo spostamento. */
svgEl.addEventListener("wheel", e => {
  if (!e.shiftKey) return;                  // senza Shift la rotella e' lo zoom
  const u = selectedUnit();
  if (!u) return;
  /* stopImmediatePropagation e non stopPropagation: quando la rotella
     arriva sull'SVG stesso, lo zoom di view.js e' un altro ascoltatore
     dello STESSO elemento e la propagazione fermata non lo tocca —
     cambierebbe il fronte e ingrandirebbe insieme */
  e.preventDefault(); e.stopImmediatePropagation();
  act("fronte", () => {
    u.frontage = Math.max(1, Math.min(u.models, u.frontage + (e.deltaY > 0 ? -1 : 1)));
  }, { coalesce: 500 });
}, { passive:false, capture:true });

const gestures = wireViewGestures(svgEl, view, {
  onPanEnd: moved => { if (!moved && !drag && !spin) select(null); },
});

const selectedUnit = () =>
  state.sel && state.sel.type === "unit" ? state.units.find(u => u.uid === state.sel.id) : null;
const selectedTerrain = () =>
  state.sel && state.sel.type === "terr" ? state.terrain.find(t => t.tid === state.sel.id) : null;
const selectedMarker = () =>
  state.sel && state.sel.type === "mark" ? markerById(state.sel.id) : null;
const selectedZone = () =>
  state.sel && state.sel.type === "zone" ? zoneById(state.sel.id) : null;
const selectedObject = () => selectedUnit() || selectedTerrain() || selectedMarker() || selectedZone();

document.addEventListener("keydown", e => {
  if (/input|select|textarea/i.test(e.target.tagName)) return;

  /* annulla e ripeti valgono sempre, anche senza niente selezionato */
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key === "z" || e.key === "Z") && !e.shiftKey){ e.preventDefault(); doUndo(); return; }
  if (mod && ((e.key === "y" || e.key === "Y") || ((e.key === "z" || e.key === "Z") && e.shiftKey))){
    e.preventDefault(); doRedo(); return;
  }
  if (mod) return;

  /* inquadratura */
  if (e.key === "+" || e.key === "="){ e.preventDefault(); view.zoomBy(1.25); return; }
  if (e.key === "-" || e.key === "_"){ e.preventDefault(); view.zoomBy(1 / 1.25); return; }
  if (e.key === "0"){ e.preventDefault(); view.fit(); return; }

  if (!state.sel) return;
  const isUnit = state.sel.type === "unit";
  const obj = selectedObject();
  if (!obj) return;
  const step = e.shiftKey ? MM : MM / 4;
  const turn = isUnit ? 90 : 15;
  /* anche le frecce sono un movimento: l'ancora si mette qui come si
     mette al primo trascinamento */
  if (isUnit && /^Arrow/.test(e.key)) MV.ensureAnchor(obj);
  /* prima si decide cosa fare, poi act() mette da parte lo stato di
     prima e solo dopo esegue: al contrario si salverebbe il tavolo
     gia' modificato e Annulla non tornerebbe da nessuna parte */
  let label = "sposta", change = null;
  switch (e.key){
    case "ArrowLeft":  change = () => { obj.x -= step; }; break;
    case "ArrowRight": change = () => { obj.x += step; }; break;
    case "ArrowUp":    change = () => { obj.y -= step; }; break;
    case "ArrowDown":  change = () => { obj.y += step; }; break;
    case "q": case "Q": label = "ruota"; change = () => { obj.rot = ((obj.rot || 0) + 360 - turn) % 360; }; break;
    case "e": case "E": label = "ruota"; change = () => { obj.rot = ((obj.rot || 0) + turn) % 360; }; break;
    case "[": if (isUnit){ label = "fronte"; change = () => { obj.frontage = Math.max(1, obj.frontage - 1); }; } break;
    case "]": if (isUnit){ label = "fronte"; change = () => { obj.frontage = Math.min(obj.models, obj.frontage + 1); }; } break;
    case "Delete": case "Backspace":
      label = isUnit ? "ritira" : "togli";
      change = () => {
        if (isUnit) obj.placed = false;
        else if (obj.mid !== undefined){ state.markers = state.markers.filter(x => x !== obj); state.sel = null; }
        else if (obj.zid !== undefined){ state.zones = state.zones.filter(x => x !== obj); state.sel = null; }
        else { state.terrain = state.terrain.filter(x => x !== obj); state.sel = null; }
      };
      break;
  }
  if (!change) return;
  e.preventDefault();
  act(label, change, { coalesce: /^(sposta|ruota|fronte)$/.test(label) ? 700 : 0 });
});

/* ------------------------------------------------------------------
   Menu contestuale
   Per ruotare un pezzo o aprirne la formazione bisognava scendere
   nell'ispettore, che sul telefono vuol dire aprire il cassetto,
   scorrere e tornare indietro — per un gesto che al tavolo si fa cento
   volte. Qui le cose che si fanno sempre arrivano dove sta il dito:
   pressione lunga sul tocco, tasto destro col mouse.

   Le voci sono quelle che valgono per QUEL pezzo, e in partita cambiano:
   fuori partita non si segnano perdite.
   ------------------------------------------------------------------ */
const PRESS_MS = 480;      // quanto dura una "pressione lunga"
const PRESS_SLOP = 10;     // pixel oltre i quali era un trascinamento
let press = null;

function cancelPress(){
  if (!press) return;
  clearTimeout(press.timer);
  press = null;
}

function menuItemsFor(o){
  const upd = (fn, label) => act(label, fn);
  if (o.uid !== undefined){
    const g0 = state.game;
    const items = [
      { label:"Editor della formazione…", run: () => openEditor(o.uid) },
      { label:"↺ Ruota di 90°", run: () => upd(() => { o.rot = (o.rot + 270) % 360; }, "ruota") },
      { label:"↻ Ruota di 90°", run: () => upd(() => { o.rot = (o.rot + 90) % 360; }, "ruota") },
    ];
    if (o.placed) items.push({ label:"⚓ Il movimento riparte da qui", run: () => upd(() => MV.setAnchor(o), "ancora") });
    items.push({ sep:true });
    if (g0.on){
      items.push({ label:"− Un modello", run: () => upd(() => G.setLost(o, (o.lost || 0) + 1), "perdite") });
      items.push({ label:"♥ Una ferita", run: () => upd(() => G.setWounds(o, EX.woundsOf(o) + 1), "ferite") });
    }
    items.push({ label:"Etichetta…", run: async () => {
      const t = await askText({ title:"Etichetta", label:shortName(o.name) + ": una parola, e l'app non la interpreta.",
                                placeholder:"disordinata, ha caricato…" });
      if (t && t.trim()) upd(() => EX.addTag(o, t), "etichetta");
    } });
    items.push({ sep:true });
    items.push({ label: o.placed ? "Ritira dal tavolo" : "Schiera",
                 run: () => upd(() => { if (o.placed){ o.placed = false; MV.clearAnchor(o); } else place(o); },
                                o.placed ? "ritira" : "schiera") });
    return { title: shortName(o.name), items };
  }
  if (o.mid !== undefined){
    return { title: o.label || (o.measure ? "Sagoma" : "Marcatore"), items: [
      { label:"Scrivi cosa rappresenta…", run: async () => {
        const t = await askText({ title:"Marcatore", label:"Il testo lo leggi tu: l'app non lo interpreta mai.",
                                  value:o.label });
        if (t !== null) upd(() => { o.label = t.trim(); }, "marcatore");
      } },
      { label:"↺ Ruota di 15°", run: () => upd(() => { o.rot = ((o.rot || 0) + 345) % 360; }, "ruota") },
      { label:"↻ Ruota di 15°", run: () => upd(() => { o.rot = ((o.rot || 0) + 15) % 360; }, "ruota") },
      { label:"Duplica", run: () => upd(() => {
          const copy = EX.ensureMarker({ ...o, mid: midSeq++ });
          copy.x += MM; copy.y += MM;
          state.markers.push(copy);
          state.sel = { type:"mark", id:copy.mid };
        }, "duplica marcatore") },
      { sep:true },
      { label:"Togli dal tavolo", danger:true,
        run: () => upd(() => { state.markers = state.markers.filter(x => x !== o); state.sel = null; }, "togli marcatore") },
    ] };
  }
  if (o.zid !== undefined){
    return { title: o.label || zoneKind(o.kind).label, items: [
      { label:"Di chi è questa zona…", run: async () => {
        const k = await askPick({ title:"Zona di schieramento", label:"Le zone disegnate sostituiscono quelle dello scenario.",
                                  options: ZONE_KINDS.map(x => ({ id:x.id, label:x.label })) });
        if (k) upd(() => { o.kind = zoneKind(k).id; }, "zona");
      } },
      { label:"Tutta la larghezza del tavolo",
        run: () => upd(() => { o.w = state.tableW; o.x = state.tableW / 2; }, "zona") },
      { sep:true },
      { label:"Togli la zona", danger:true,
        run: () => upd(() => { state.zones = state.zones.filter(x => x !== o); state.sel = null; }, "togli zona") },
    ] };
  }
  const cfg = TERRAIN[o.kind] || {};
  return { title: cfg.label || "Elemento", items: [
    { label:"↺ Ruota di 15°", run: () => upd(() => { o.rot = ((o.rot || 0) + 345) % 360; }, "ruota") },
    { label:"↻ Ruota di 15°", run: () => upd(() => { o.rot = ((o.rot || 0) + 15) % 360; }, "ruota") },
    { sep:true },
    { label:"Togli dal tavolo", danger:true,
      run: () => upd(() => { state.terrain = state.terrain.filter(x => x !== o); state.sel = null; },
                     "togli " + (cfg.label || "elemento").toLowerCase()) },
  ] };
}

/* Il menu si apre AL POSTO del trascinamento: il passo di annulla che
   il pointerdown aveva gia' aperto va tolto, sennò resta un annulla che
   non annulla niente. */
function openPieceMenu(obj, clientX, clientY, { fromDrag = false } = {}){
  if (fromDrag){
    if (drag && !drag.moved) history.discard();
    drag = null;
  }
  cancelPress();
  const { title, items } = menuItemsFor(obj);
  showMenu(clientX, clientY, items, { title });
}

/* la stessa cosa col mouse: tasto destro sopra un pezzo. Il pezzo lo
   ha messo da parte il pointerdown un istante prima. */
let ctxTarget = null;
svgEl.addEventListener("contextmenu", e => {
  const obj = ctxTarget;
  ctxTarget = null;
  if (!obj) return;
  e.preventDefault();
  openPieceMenu(obj, e.clientX, e.clientY);
});

function objFromHost(host){
  if (host.dataset.uid) return state.units.find(x => x.uid === +host.dataset.uid);
  if (host.dataset.mid) return markerById(host.dataset.mid);
  if (host.dataset.zid) return zoneById(host.dataset.zid);
  return state.terrain.find(x => x.tid === +host.dataset.tid);
}
const selFor = o => o.uid !== undefined ? { type:"unit", id:o.uid }
  : o.mid !== undefined ? { type:"mark", id:o.mid }
  : o.zid !== undefined ? { type:"zone", id:o.zid }
  : { type:"terr", id:o.tid };

function doUndo(){
  /* dopo un annulla gli oggetti del tavolo sono altri: un menu aperto
     starebbe parlando di un pezzo che non esiste piu' */
  closeMenu();
  const l = history.undo();
  if (l) toast("Annullato: " + l);
  else toast("Non c'è altro da annullare.");
}
function doRedo(){
  closeMenu();
  const l = history.redo();
  if (l) toast("Rifatto: " + l);
}

/* ============================================================
   10 · IMPORT
   ============================================================ */
function addRoster(parsed, armyId){
  /* importare sostituisce in blocco un esercito: se e' il file
     sbagliato, Ctrl+Z deve riportare indietro quello di prima */
  history.push("importa esercito " + armyId);
  const army = state.armies[armyId];
  // se la lista è intitolata come uno scenario, per l'esercito usiamo la fazione
  const isScenarioTitle = Object.values(SCENARIOS).some(s =>
    s.label.toLowerCase() === String(parsed.rosterName).trim().toLowerCase());
  army.name = (isScenarioTitle && parsed.catalogue) ? parsed.catalogue : (parsed.rosterName || army.name);
  army.info = { catalogue: parsed.catalogue, forceName: parsed.forceName, limit: parsed.limit, total: parsed.total };
  state.units = state.units.filter(u => u.army !== armyId);
  for (const p of parsed.units)
    state.units.push({ uid: uidSeq++, army: armyId, ...p, catId: matchUnitName(p.name),
                       x:0, y:0, rot: armyId === "A" ? 0 : 180, placed:false,
                       lost:0, dead:false, fled:false });

  const sum = parsed.units.reduce((s, u) => s + u.pts, 0);
  state.rawInfo = `[${armyId}] ${parsed.rosterName} — ${parsed.catalogue || "?"} · ${parsed.forceName || "?"}\n` +
    `    ${parsed.units.length} unità · ${sum} pt calcolati` +
    (parsed.total ? ` (il file dichiara ${parsed.total} pt${sum === parsed.total ? " ✓" : " ✗"})` : "") + "\n" +
    parsed.units.map(u =>
      `  • ${u.name} — ${u.models} mod., base ${u.baseW}×${u.baseH}, ${u.pts} pt` +
      (u.troop ? `, ${u.troop}` : "") + (u.us ? `, US ${u.us}` : "") +
      (u.rules.length ? `\n      ${u.rules.join(", ")}` : "")).join("\n") +
    "\n\n" + state.rawInfo;
  $("#raw").textContent = state.rawInfo.slice(0, 9000);
  $("#raw-wrap").hidden = false;

  // il nome della lista spesso è il nome dello scenario
  const match = Object.entries(SCENARIOS).find(([, s]) =>
    s.label.toLowerCase() === String(parsed.rosterName).trim().toLowerCase());
  if (match && state.scenario !== match[0]){
    setScenario(match[0]);
    toast(`Lista “${parsed.rosterName}”: ho impostato lo scenario omonimo.`);
  }
  renderAll();
}
function handleText(text, armyId){
  if (text.slice(0, 2) === "PK"){
    toast("Il .rosz è compresso: esporta in JSON da New Recruit, o rinominalo .zip ed estrai il .ros."); return;
  }
  let parsed;
  try { parsed = parseRoster(parseAny(text)); }
  catch (err){ toast("Non riesco a leggere il file: " + err.message); return; }
  if (!parsed.units.length){
    state.rawInfo = "Nessuna unità riconosciuta.\n\n" + state.rawInfo;
    $("#raw").textContent = state.rawInfo.slice(0, 9000);
    $("#raw-wrap").hidden = false;
    toast("File letto ma nessuna unità riconosciuta — vedi la diagnostica."); return;
  }
  addRoster(parsed, armyId);
  $("#paste-area").value = ""; $("#paste-box").hidden = true;
  toast(`${parsed.units.length} unità importate nell'Esercito ${armyId} — ${parsed.units.reduce((s, u) => s + u.pts, 0)} pt.`);
}
let nextArmy = "A";
function ingestFiles(files){
  const list = [...files].slice(0, 2);
  list.forEach((f, i) => {
    const r = new FileReader();
    r.onload = () => handleText(String(r.result), list.length === 2 ? (i === 0 ? "A" : "B") : nextArmy);
    r.onerror = () => toast("Errore di lettura di " + f.name);
    r.readAsText(f);
  });
  nextArmy = list.length === 1 ? (nextArmy === "A" ? "B" : "A") : "A";
}
const drop = $("#drop");
drop.addEventListener("click", () => $("#file").click());
drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); $("#file").click(); } });
$("#file").addEventListener("change", e => { ingestFiles(e.target.files); e.target.value = ""; });
["dragenter","dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("hot"); }));
["dragleave","drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("hot"); }));
drop.addEventListener("drop", e => { if (e.dataTransfer?.files?.length) ingestFiles(e.dataTransfer.files); });
document.addEventListener("dragover", e => e.preventDefault());
document.addEventListener("drop", e => {
  if (e.dataTransfer?.files?.length && !drop.contains(e.target)){ e.preventDefault(); ingestFiles(e.dataTransfer.files); }
});
$("#btn-paste").addEventListener("click", () => { $("#paste-box").hidden = !$("#paste-box").hidden; });
$("#btn-paste-a").addEventListener("click", () => handleText($("#paste-area").value, "A"));
$("#btn-paste-b").addEventListener("click", () => handleText($("#paste-area").value, "B"));
$("#btn-clear").addEventListener("click", () => act("svuota le liste", () => {
  state.units = []; state.sel = null; state.rawInfo = "";
  state.armies.A = { id:"A", name:"Esercito A", color:"var(--armyA)", info:null };
  state.armies.B = { id:"B", name:"Esercito B", color:"var(--armyB)", info:null };
  $("#raw-wrap").hidden = true;
}));

/* ---------- lista d'esempio ---------- */
const DEMO = {
  A:{ name:"Uomini Lucertola — Battle March", units:[
    ["Saurus Scar-Veteran", 1, 30, 30, 96, "Heavy infantry", 1, {M:"4",WS:"5",BS:"0",S:"5",T:"5",W:"2",I:"3",A:"4",Ld:"8"}, ["Cold Blooded","Furious Charge"], 0],
    ["Skink Chief", 1, 25, 25, 75, "Regular infantry", 1, {M:"6",WS:"4",BS:"5",S:"4",T:"3",W:"2",I:"6",A:"3",Ld:"6"}, ["Aquatic","Cold Blooded"], 12],
    ["Saurus Warriors", 12, 30, 30, 194, "Heavy infantry", 12, {M:"4",WS:"3",BS:"0",S:"4",T:"4",W:"1",I:"1",A:"2",Ld:"8"}, ["Close Order","Cold Blooded"], 0],
    ["Skink Skirmishers", 12, 25, 25, 60, "Regular infantry", 12, {M:"6",WS:"2",BS:"3",S:"3",T:"2",W:"1",I:"4",A:"1",Ld:"5"}, ["Skirmishers","Move Through Cover"], 12],
    ["Bastiladon", 1, 60, 100, 175, "Monstrous creature", 4, {M:"4",WS:"3",BS:"-",S:"4",T:"5",W:"4",I:"1",A:"3",Ld:"-"}, ["Terror","Large Target","Stubborn"], 24],
  ]},
  B:{ name:"Orchi e Goblin — Battle March", units:[
    ["Orc Big Boss", 1, 25, 25, 85, "Regular infantry", 1, {M:"4",WS:"5",BS:"3",S:"4",T:"5",W:"2",I:"3",A:"3",Ld:"8"}, ["Choppas"], 0],
    ["Orc Mob", 20, 25, 25, 180, "Regular infantry", 20, {M:"4",WS:"3",BS:"3",S:"3",T:"4",W:"1",I:"2",A:"1",Ld:"7"}, ["Close Order"], 0],
    ["Goblin Archers", 16, 20, 20, 96, "Regular infantry", 16, {M:"4",WS:"2",BS:"3",S:"3",T:"3",W:"1",I:"2",A:"1",Ld:"6"}, ["Close Order"], 18],
    ["Orc Boar Boyz", 6, 25, 50, 138, "Heavy cavalry", 12, {M:"7",WS:"3",BS:"3",S:"3",T:"4",W:"1",I:"2",A:"1",Ld:"7"}, ["Impact Hits"], 0],
    ["Snotling Swarms", 3, 40, 40, 75, "Swarm", 6, {M:"4",WS:"2",BS:"0",S:"2",T:"2",W:"3",I:"2",A:"3",Ld:"4"}, ["Immune To Psychology"], 0],
  ]},
};
$("#btn-demo").addEventListener("click", () => {
  history.push("carica l'esempio");
  state.units = [];
  for (const id of ["A", "B"]){
    state.armies[id].name = DEMO[id].name;
    state.armies[id].info = { catalogue:"esempio", forceName:"Battle March", limit:0, total:0 };
    for (const [name, models, bw, bh, pts, troop, us, stats, rules, maxRange] of DEMO[id].units){
      const loose = rules.some(r => /skirmish/i.test(r));
      const known = BASES.find(b => b.w === bw && b.h === bh);
      state.units.push({
        uid: uidSeq++, army:id, name, models, crew:0, catId: matchUnitName(name),
        baseId: known ? known.id : "custom", baseW:bw, baseH:bh,
        frontage: defaultFrontage(troop, models, loose), loose,
        pts, us, troop, unitSize:"", stats, rules, weapons:[], maxRange, slot:"", faction:"",
        x:0, y:0, rot: id === "A" ? 0 : 180, placed:false,
        lost:0, dead:false, fled:false,
      });
    }
  }
  autoDeploy();
});

/* ============================================================
   11 · CONTROLLI
   ============================================================ */
const scSel = $("#scenario");
function fillScenarioSelect(){
  const groups = {};
  for (const [id, s] of Object.entries(allScenarios())) (groups[s.group] ||= []).push([id, s]);
  const order = ["Battle March", "Generici", "Miei scenari"];
  const keys = Object.keys(groups).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const keep = scSel.value;
  scSel.innerHTML = keys.map(gname =>
    `<optgroup label="${gname}">${groups[gname].map(([id, s]) =>
      `<option value="${esc(id)}">${esc(s.label)}${s.pts ? ` — ${s.pts} pt` : ""}</option>`).join("")}</optgroup>`).join("");
  if (keep) scSel.value = keep;
}
fillScenarioSelect();

function loadTerrain(id){
  const def = scenarioDef(id);
  state.terrain = (def.terrain || []).map(t => ({
    tid: tidSeq++, kind:t.kind,
    x: t.x * MM, y: t.y * MM,
    w: t.w ?? TERRAIN[t.kind].w, h: t.h ?? TERRAIN[t.kind].h,
    rot: t.rot || 0,
  }));
}
function setScenario(id, keepTerrain, { render = true } = {}){
  const def = scenarioDef(id);
  state.scenario = id;
  state.tableW = def.table[0] * MM;
  state.tableH = def.table[1] * MM;
  state.gap = def.gap * MM;
  fillScenarioSelect();
  scSel.value = id;
  $("#table-size").value = `${def.table[0]}x${def.table[1]}`;
  $("#zone-gap").value = String(def.gap);
  if (!keepTerrain && def.terrain) loadTerrain(id);
  else if (!keepTerrain && !def.terrain) { /* gli scenari generici lasciano il terreno com'è */ }
  /* uno scenario proprio puo' portarsi dietro le zone disegnate: e'
     quello che lo rende capace di rappresentare qualsiasi mappa */
  if (!keepTerrain){
    if (Array.isArray(def.zones)){
      state.zones = def.zones.map((z, i) => ensureZone({
        ...z, x:z.x * MM, y:z.y * MM, w:z.w * MM, h:z.h * MM, zid: zidSeq++,
      }, i + 1)).filter(Boolean);
    } else if (state.zones.length && SCENARIOS[id]) {
      /* tornando a uno scenario del manuale le zone disegnate a mano
         se ne vanno: due verita' diverse sullo stesso tavolo no */
      state.zones = [];
    }
  }
  for (const u of state.units) if (u.placed) place(u);
  view.fit();
  if (render) renderAll();
}
scSel.addEventListener("change", () => act("scenario", () => setScenario(scSel.value, false, { render:false }), { render:true }));
$("#table-size").addEventListener("change", e => act("misura del tavolo", () => {
  const [w, h] = e.target.value.split("x").map(Number);
  state.tableW = w * MM; state.tableH = h * MM;
  for (const u of state.units) if (u.placed) place(u);
  view.fit();
}));
$("#zone-gap").addEventListener("change", e => act("zone", () => { state.gap = +e.target.value * MM; }));

(function fillPalette(){
  const host = $("#palette");
  /* l'HTML ne disegna una copia statica per chi arriva a moduli non
     ancora caricati: senza questa riga restava sotto, muta, e la
     tavolozza appariva doppia */
  host.innerHTML = "";
  for (const [kind, cfg] of Object.entries(TERRAIN)){
    const b = document.createElement("button");
    b.className = "btn tiny";
    b.innerHTML = `<span class="pdot" style="background:${cfg.color};${cfg.shape === "circle" || cfg.shape === "token" ? "border-radius:50%;" : ""}"></span>${cfg.label}`;
    b.addEventListener("click", () => {
      act("aggiungi " + cfg.label.toLowerCase(), () => {
        const t = { tid: tidSeq++, kind, x: state.tableW / 2, y: state.tableH / 2, w: cfg.w, h: cfg.h, rot: 0 };
        // scosta leggermente se il centro è già occupato
        const n = state.terrain.length;
        t.x += (n % 5) * 30 - 60; t.y += Math.floor(n / 5) * 30 - 30;
        state.terrain.push(t);
        state.sel = { type:"terr", id:t.tid };
      });
    });
    host.appendChild(b);
  }
})();
$("#btn-terr-reset").addEventListener("click", () => {
  const def = scenarioDef(state.scenario);
  if (!def.terrain){ toast("Questo scenario non ha una mappa di terreno predefinita."); return; }
  act("terreno dello scenario", () => loadTerrain(state.scenario));
  toast("Terreno riportato alla mappa dello scenario.");
});
$("#btn-terr-clear").addEventListener("click", () =>
  act("svuota il terreno", () => { state.terrain = []; state.sel = null; }));

const TOGGLES = [
  ["#btn-snap", "snap"], ["#btn-labels", "labels"], ["#btn-ranges", "ranges"],
  ["#btn-measure", "measure"], ["#btn-photos", "photos"],
  ["#btn-dist", "distances"], ["#btn-arcs", "arcs"],
  ["#btn-moveaid", "moveAid"], ["#btn-ghost", "ghost"], ["#btn-zone-draw", "zoning"],
];
for (const [sel, key] of TOGGLES){
  const b = $(sel);
  if (!b) continue;
  b.addEventListener("click", () => {
    state[key] = !state[key];
    if (key === "measure" && !state.measure) state.measurePts = [];
    if (key === "zoning" && !state.zoning) state.zonePts = null;
    /* misurare e disegnare una zona sono due modalita' e si escludono:
       tenerle accese insieme vuol dire un clic che non si sa cosa fa */
    if (key === "measure" && state.measure) setToggle("zoning", false);
    if (key === "zoning" && state.zoning) setToggle("measure", false);
    syncToggle(key);
    drawBoard(); save();
    if (key === "zoning" && state.zoning)
      toast("Trascina sul tavolo per disegnare la zona. Poi le dici di chi è.");
  });
  syncToggle(key);
}
function setToggle(key, on){ state[key] = !!on; syncToggle(key); }
function syncToggle(key){
  const pair = TOGGLES.find(t => t[1] === key);
  const b = pair && $(pair[0]);
  if (!b) return;
  b.classList.toggle("on", !!state[key]);
  b.setAttribute("aria-pressed", state[key] ? "true" : "false");
  syncMenus();
}

/* ------------------------------------------------------------------
   I menu della barra
   Ventitre' pulsanti in fila andavano a capo su un portatile ed erano
   una lotteria su tablet. In vista restano i gesti che si fanno
   mentre giochi; il resto sta in tre menu raggruppati per intenzione.

   Il rischio di un menu e' nascondere una levetta accesa e non
   accorgersene piu': per questo il pulsante del menu si mette un
   pallino quando dentro c'e' qualcosa di acceso.
   ------------------------------------------------------------------ */
function barMenus(){
  return [...document.querySelectorAll(".board-bar details.menu")];
}

function closeMenus(except){
  for (const m of barMenus()) if (m !== except) m.open = false;
}

function syncMenus(){
  for (const m of barMenus()){
    const sum = m.querySelector("summary");
    if (sum) sum.classList.toggle("has-on", !!m.querySelector(".menu-pop .btn.on"));
  }
}

(function wireMenus(){
  const toggleIds = new Set(TOGGLES.map(t => t[0].slice(1)));
  for (const m of barMenus()){
    m.addEventListener("toggle", () => {
      if (!m.open) return;
      closeMenus(m);
      /* vicino al bordo destro si apre dall'altra parte, sennò esce
         dallo schermo proprio sui tavoli larghi */
      m.classList.remove("flip");
      const pop = m.querySelector(".menu-pop");
      if (pop && pop.getBoundingClientRect().right > window.innerWidth - 8)
        m.classList.add("flip");
    });
    const pop = m.querySelector(".menu-pop");
    if (pop) pop.addEventListener("click", e => {
      const b = e.target.closest("button");
      /* le levette restano sotto il dito, così se ne accendono due di
         fila; un'azione che fa una cosa sola chiude e ti ridà il tavolo */
      if (b && !toggleIds.has(b.id)) closeMenus(null);
    });
  }
  document.addEventListener("pointerdown", e => {
    if (e.target.closest(".board-bar details.menu")) return;
    closeMenus(null);
  }, true);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenus(null); });
  syncMenus();
})();

/* ---------- marcatori, sagome, zone, ancore ---------- */
function addMarker(opts, label){
  act(label, () => {
    const n = state.markers.length;
    const m = EX.makeMarker({
      mid: midSeq++,
      x: state.tableW / 2 + ((n % 5) - 2) * MM,
      y: state.tableH / 2 + (Math.floor(n / 5) % 5 - 2) * MM,
      ...opts,
    });
    state.markers.push(m);
    state.sel = { type:"mark", id:m.mid };
  });
}
$("#btn-mark-add").addEventListener("click", () =>
  addMarker({ shape:"token", color:"gold", label:"" }, "aggiungi marcatore"));
$("#btn-shape-add").addEventListener("click", () =>
  addMarker({ shape:"circle", color:"accent", measure:true, w:5, label:"" }, "aggiungi sagoma"));
$("#btn-mark-clear").addEventListener("click", async () => {
  if (!state.markers.length){ toast("Non ci sono marcatori sul tavolo."); return; }
  if (!await askConfirm("Tolgo tutti i marcatori e tutte le sagome dal tavolo.", { title:"Togliere i marcatori?" })) return;
  act("togli i marcatori", () => {
    state.markers = [];
    if (state.sel && state.sel.type === "mark") state.sel = null;
  });
});
$("#btn-zone-clear").addEventListener("click", () => {
  if (!state.zones.length){ toast("Le zone sono già quelle dello scenario."); return; }
  act("togli le zone disegnate", () => {
    state.zones = [];
    if (state.sel && state.sel.type === "zone") state.sel = null;
    setToggle("zoning", false);
  });
  toast("Tornate le zone calcolate dallo scenario.");
});
$("#btn-anchor-all").addEventListener("click", () => {
  act("ancore", () => MV.anchorAll(state.units));
  toast("Ancore rimesse: da qui in poi il movimento si misura da adesso.");
});
$("#btn-auto").addEventListener("click", () =>
  act("schiera tutto", () => { autoDeploy(); MV.anchorAll(state.units); }, { render:false }));
$("#btn-recall").addEventListener("click", () =>
  act("ritira tutto", () => { for (const u of state.units){ u.placed = false; MV.clearAnchor(u); } }));

/* ---------- inquadratura ---------- */
$("#btn-zoom-in").addEventListener("click", () => view.zoomBy(1.3));
$("#btn-zoom-out").addEventListener("click", () => view.zoomBy(1 / 1.3));
$("#btn-fit").addEventListener("click", () => view.fit());

/* ---------- annulla / ripeti ---------- */
$("#btn-undo").addEventListener("click", doUndo);
$("#btn-redo").addEventListener("click", doRedo);

/* ---------- righelli ---------- */
$("#btn-rulers-clear").addEventListener("click", () => act("togli i righelli", () => {
  state.rulers = []; state.measurePts = [];
}));

/* ---------- immagine e link ---------- */
$("#btn-png").addEventListener("click", async () => {
  const prevSel = state.sel;
  state.sel = null; drawBoard();                 // niente maniglie nell'immagine
  try {
    await exportPNG(svgEl, {
      box: baseBox(), width: 2400,
      filename: `${(scenarioDef(state.scenario).label || "tavolo").replace(/[^\w\-]+/g, "-").toLowerCase()}.png`,
    });
    toast("Immagine del tavolo scaricata.");
  } catch (err){ toast("Non riesco a creare l'immagine: " + err.message); }
  state.sel = prevSel; drawBoard();
});

$("#btn-share").addEventListener("click", async () => {
  try {
    const url = await shareUrl(snapshot());
    if (url.length > 60000){ toast("Schieramento troppo grande per un link."); return; }
    const ok = await copyText(url);
    toast(ok ? `Link copiato (${(url.length / 1024).toFixed(1)} kB) — le foto restano qui da te.`
             : "Non riesco a copiare: il link è nella barra degli indirizzi.");
    if (!ok) location.hash = url.slice(url.indexOf("#") + 1);
  } catch (err){ toast("Non riesco a creare il link: " + err.message); }
});

/* ---------- terreno casuale e scenari propri ---------- */
$("#btn-terr-random").addEventListener("click", () => {
  const def = scenarioDef(state.scenario);
  act("terreno casuale", () => {
    const list = randomTerrain(inch(state.tableW), inch(state.tableH), {
      pieces: 8, mirror: true, treasures: def.group === "Battle March" ? 3 : 2,
      battleMarch: def.group === "Battle March",
    });
    state.terrain = list.map(t => ({
      tid: tidSeq++, kind:t.kind, x:t.x * MM, y:t.y * MM, w:t.w, h:t.h, rot:t.rot || 0,
    }));
    state.sel = null;
  });
  toast("Terreno generato a specchio: stessi appigli per tutti e due.");
});

$("#btn-scen-save").addEventListener("click", async () => {
  const name = await askText({ title:"Salva lo scenario",
    label:"Tavolo, terreno, marcatori e zone disegnate finiscono fra «Miei scenari».",
    value: scenarioDef(state.scenario).label + " (mio)" });
  if (name === null) return;
  const id = await saveCustom({
    name: name.trim() || "Scenario mio",
    table: [Math.round(inch(state.tableW)), Math.round(inch(state.tableH))],
    gap: Math.round(inch(state.gap)),
    deploy: scenarioDef(state.scenario).deploy,
    desc: "Terreno salvato dal tavolo il " + new Date().toLocaleDateString("it-IT") + ".",
    terrain: state.terrain.map(t => ({
      kind:t.kind, x:+inch(t.x).toFixed(2), y:+inch(t.y).toFixed(2),
      w:t.w, h:t.h, rot:t.rot || 0,
    })),
    zones: state.zones.map(z => ({
      kind:z.kind, label:z.label || "",
      x:+inch(z.x).toFixed(2), y:+inch(z.y).toFixed(2),
      w:+inch(z.w).toFixed(2), h:+inch(z.h).toFixed(2),
    })),
    markers: state.markers.map(m => ({
      shape:m.shape, label:m.label || "", color:m.color, measure:!!m.measure,
      x:+inch(m.x).toFixed(2), y:+inch(m.y).toFixed(2), w:m.w, h:m.h, rot:m.rot || 0,
    })),
  });
  fillScenarioSelect();
  state.scenario = id; scSel.value = id;
  renderAll();
  toast("Scenario salvato: lo ritrovi in “Miei scenari”.");
});

$("#btn-scen-del").addEventListener("click", async () => {
  const cur = allCustom().find(s => s.id === state.scenario);
  if (!cur){ toast("Questo non è uno scenario tuo: quelli del manuale restano dove sono."); return; }
  if (!await askConfirm(`Elimino lo scenario “${cur.label}”. Il terreno sul tavolo resta.`,
                        { title:"Eliminare lo scenario?" })) return;
  await removeCustom(cur.id);
  fillScenarioSelect();
  setScenario("open", true);
  toast("Scenario eliminato.");
});
/* ---------- pannello a scomparsa (tablet e telefono) ---------- */
const drawerBtn = $("#btn-drawer");
if (drawerBtn){
  drawerBtn.addEventListener("click", e => {
    e.stopPropagation();
    document.body.classList.toggle("drawer-open");
  });
  document.addEventListener("click", e => {
    if (!document.body.classList.contains("drawer-open")) return;
    if (e.target.closest("aside") || e.target.closest("#btn-drawer")) return;
    document.body.classList.remove("drawer-open");
  });
}

/* ---------- "Importa liste" si ripiega quando le liste ci sono già ----------
   Occupava il primo schermo per sempre, anche a tavolo pieno. Se però
   l'utente lo apre o lo chiude a mano, da lì in poi decide lui. */
let importBoxTouched = false;
const importBox = $("#import-box");
if (importBox){
  importBox.addEventListener("toggle", () => { importBoxTouched = true; });
}
function syncImportBox(){
  if (!importBox || importBoxTouched) return;
  const want = !state.units.length;
  if (importBox.open !== want) importBox.open = want;
}

$("#btn-theme").addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = cur === "dark" ? "light" : (cur === "light" ? null : "dark");
  if (next) document.documentElement.setAttribute("data-theme", next);
  else document.documentElement.removeAttribute("data-theme");
  try { localStorage.setItem("tow-theme", next || ""); } catch (_) {}
  drawBoard();
});

let toastT;
function toast(msg){
  const el = $("#toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("show"), 3600);
}


/* ============================================================
   12 · PERSISTENZA
   Lo stato del tavolo vive in IndexedDB insieme al resto
   (catalogo, liste, matchup) invece che in localStorage.
   ============================================================ */
const BOARD_KEY = "board:current";
let saveTimer = null;

/* Lo stato del tavolo viene serializzato in tre posti con tre elenchi
   diversi: qui, in share.js e in battlelog.js. Dimenticare un campo
   nuovo in uno dei tre non da' errore — da' un dato che sparisce
   quando ricarichi, o quando condividi il link, o quando archivi il
   report, ed e' il tipo di bug che si scopre a partita finita. Per
   questo esiste `extras`: un secchio libero che i tre serializzatori
   copiano alla cieca, cosi' la prossima cosa generica non costa tre
   modifiche. */
function snapshot(){
  return {
    armies:{ A:{ name:state.armies.A.name, info:state.armies.A.info },
             B:{ name:state.armies.B.name, info:state.armies.B.info } },
    units:state.units, terrain:state.terrain, scenario:state.scenario,
    markers:state.markers, zones:state.zones,
    tableW:state.tableW, tableH:state.tableH, gap:state.gap,
    snap:state.snap, labels:state.labels, ranges:state.ranges, photos:state.photos,
    distances:state.distances, arcs:state.arcs,
    moveAid:state.moveAid, ghost:state.ghost,
    rulers:state.rulers, game:state.game, sel:state.sel,
    extras:state.extras || null,
  };
}
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveDoc(BOARD_KEY, snapshot()); }, 250);
}

function applySnapshot(s){
  if (!s || !Array.isArray(s.units)) return false;
  state.armies.A.name = s.armies?.A?.name || state.armies.A.name;
  state.armies.B.name = s.armies?.B?.name || state.armies.B.name;
  state.armies.A.info = s.armies?.A?.info || null;
  state.armies.B.info = s.armies?.B?.info || null;
  state.units = s.units;
  /* le unita' salvate prima delle formazioni non hanno il campo: si
     riempie con i valori che riproducono il disegno di allora */
  for (const u of state.units) FM.ensureFormation(u);
  layCache.clear();
  healLinks();
  state.terrain = Array.isArray(s.terrain) ? s.terrain : [];
  state.markers = (Array.isArray(s.markers) ? s.markers : [])
    .map((m, i) => EX.ensureMarker(m, i + 1)).filter(Boolean);
  state.zones = (Array.isArray(s.zones) ? s.zones : [])
    .map((z, i) => ensureZone(z, i + 1)).filter(Boolean);
  uidSeq = Math.max(1, ...state.units.map(u => u.uid || 0)) + 1;
  tidSeq = Math.max(1, ...state.terrain.map(t => t.tid || 0)) + 1;
  midSeq = Math.max(1, ...state.markers.map(m => m.mid || 0)) + 1;
  zidSeq = Math.max(1, ...state.zones.map(z => z.zid || 0)) + 1;
  state.scenario = allScenarios()[s.scenario] ? s.scenario : state.scenario;
  state.tableW = s.tableW || state.tableW;
  state.tableH = s.tableH || state.tableH;
  state.gap = s.gap || state.gap;
  state.snap = s.snap !== false;
  state.labels = s.labels !== false;
  state.ranges = !!s.ranges;
  state.photos = s.photos !== false;
  state.distances = !!s.distances;
  state.arcs = !!s.arcs;
  state.moveAid = s.moveAid !== false;
  state.ghost = !!s.ghost;
  state.zoning = false; state.zonePts = null;
  state.extras = s.extras || null;
  state.rulers = Array.isArray(s.rulers) ? s.rulers : [];
  state.game = G.ensureGame(s.game);
  state.sel = s.sel && typeof s.sel === "object" ? s.sel : null;
  state.measurePts = [];
  fillScenarioSelect();
  scSel.value = state.scenario;
  $("#table-size").value = `${Math.round(inch(state.tableW))}x${Math.round(inch(state.tableH))}`;
  $("#zone-gap").value = String(Math.round(inch(state.gap)));
  for (const [, key] of TOGGLES) syncToggle(key);
  return true;
}

/* carica una lista salvata dentro un esercito del tavolo */
function loadArmyFromList(list, armyId){
  history.push("carica " + (list.name || "lista"));
  state.units = state.units.filter(u => u.army !== armyId);
  for (const p of list.units){
    state.units.push({
      uid: uidSeq++, army: armyId, ...p,
      catId: p.catId || matchUnitName(p.name),
      x:0, y:0, rot: armyId === "A" ? 0 : 180, placed:false,
      lost:0, dead:false, fled:false,
    });
  }
  state.armies[armyId].name = list.name;
  state.armies[armyId].info = list.info || null;
  renderAll();
}

/* Incollare un link condiviso in una scheda gia' aperta cambia solo il
   frammento: il browser non ricarica niente e senza questo ascoltatore
   non succederebbe assolutamente nulla. */
async function loadShared(code){
  try {
    const shared = await decodeBoard(code);
    if (!applySnapshot(shared)) throw new Error("schieramento vuoto");
    history.reset(); view.fit(); renderAll();
    toast("Schieramento condiviso caricato — le foto sono quelle del tuo catalogo.");
    return true;
  } catch (err){
    toast("Il link non è leggibile: " + err.message);
    return false;
  }
}

window.addEventListener("hashchange", async () => {
  const code = readShareCode();
  if (!code) return;
  if (!await askConfirm("Questo link contiene uno schieramento. Lo apro al posto di quello che c'è sul tavolo?",
                        { title:"Aprire lo schieramento del link?" })) return;
  loadShared(code);
});

async function bootDeploy(){
  const th = localStorage.getItem("tow-theme");
  if (th) document.documentElement.setAttribute("data-theme", th);

  await initScenarioKit();
  fillScenarioSelect();
  G.initGame({ getState: () => state, act });
  initFormEditor({
    getState: () => state,
    act, renderAll,
    aliveOf: effModels,
    gameOn: () => state.game.on,
    setLost: (u, n) => G.setLost(u, n),
  });

  /* un link condiviso vince sull'ultimo tavolo: se sei arrivato qui da
     un #s=… e' quello che vuoi vedere */
  const code = readShareCode();
  if (code && await loadShared(code)) return { shared: true };

  const saved = await loadDoc(BOARD_KEY, null);
  if (saved && applySnapshot(saved) && state.units.length) renderAll();
  else { setScenario("bm-guado"); $("#btn-demo").click(); }
  history.reset();
  view.fit();
  return { shared: false };
}

/* chiamata da main.js quando il catalogo cambia */
function refreshLinks(){
  if (healLinks()) save();
}

export { state, renderAll, bootDeploy, loadArmyFromList, snapshot, applySnapshot,
         setScenario, refreshLinks, history, view, act, toast, effModels,
         /* esposte perché sono geometria pura e vanno provate: dove
            finisce un pezzo trascinato, e cosa sta sotto una sagoma */
         snapUnit, modelsUnder };
