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
import * as CB from './combat.js';
import { stat } from './rules.js';
import { initDuel, openDuel, renderDuel } from './duel.js';
import { createHistory } from './history.js';
import { createView, wireViewGestures } from './view.js';
import * as FM from './formation.js';
import { initFormEditor, openEditor, refreshEditor } from './formeditor.js';
import { exportPNG } from './imgexport.js';
import { shareUrl, decodeBoard, readShareCode, copyText } from './share.js';
import * as G from './game.js';
import { initScenarioKit, customScenarioMap, saveCustom, removeCustom,
         randomTerrain, allCustom } from './scenariokit.js';
import { survey, frontArcPoly, movementBands, reachFan, sightFan,
         shootingSurvey } from './tactics.js';

/* Gli scenari sono quelli del manuale piu' quelli salvati dall'utente:
   da qui in giu' non c'e' differenza fra i due. */
const allScenarios = () => ({ ...SCENARIOS, ...customScenarioMap() });
const scenarioDef = id => allScenarios()[id] || SCENARIOS.open;

function currentScenario(){
  const def = scenarioDef(state.scenario);
  const geo = geometry(def.deploy, state.tableW, state.tableH, state.gap);
  return { ...def, ...geo };
}

/* ============================================================
   5 · STATO
   ============================================================ */
const state = {
  armies:{ A:{ id:"A", name:"Esercito A", color:"var(--armyA)", info:null },
           B:{ id:"B", name:"Esercito B", color:"var(--armyB)", info:null } },
  units:[], terrain:[],
  scenario:"bm-guado",
  tableW:44 * MM, tableH:30 * MM, gap:6 * MM,
  sel:null,                       // {type:'unit'|'terr', id}
  snap:true, labels:true, ranges:false, measure:false, measurePts:[], photos:true,
  /* righelli lasciati sul tavolo, uno per coppia di punti: la misura
     usa-e-getta serviva a poco, in partita se ne tengono tre o quattro */
  rulers:[],
  /* aiuti tattici sull'unita' selezionata */
  distances:false, arcs:false, move:false, shoot:false,
  game: G.emptyGame(),
  rawInfo:"",
};
let uidSeq = 1, tidSeq = 1;

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

/* -------- geometria -------- */
function boxOf(o){
  if (o.uid !== undefined) return { x:o.x, y:o.y, w:unitW(o), h:unitD(o), rot:o.rot };
  return FM.terrainBox(o);
}
const corners = o => boxCorners(boxOf(o));
const inRect = pointInRect;

// distanza fra un punto e il bordo di un pezzo (0 se dentro)
const distToPiece = (pt, o) =>
  distPointToBox(pt, boxOf(o), !!(TERRAIN[o.kind] && TERRAIN[o.kind].shape === "circle"));

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
    host.appendChild(wrap);
  }
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

function renderInspector(){
  const host = $("#inspector");
  if (!state.sel){ host.innerHTML = `<p class="empty">Clicca un'unità nella lista o un pezzo sul campo.</p>`; return; }
  if (state.sel.type === "terr") return renderTerrainInspector(host);

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
        ${photoForUnit(u) ? `<img class="insp-photo" src="${photoForUnit(u)}" alt="${esc(u.name)}">` : ""}
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
        ${u.stats && u.stats.M && /\d/.test(u.stats.M) ? `<div class="readout"><span>Movimento / carica</span><b>${u.stats.M}″ · ${+u.stats.M + 7}″ medio · ${+u.stats.M + 12}″ max</b></div>` : ""}
        ${u.maxRange ? `<div class="readout"><span>Tiro più lungo</span><b>${u.maxRange}″</b></div>` : ""}
        <div class="readout"><span>Stato</span><b style="color:var(--${st.key === "idle" ? "muted" : st.key})">${st.text}</b></div>
      </div>
      ${u.rules.length ? `<div class="tags">${u.rules.map(r => `<span class="tag">${esc(r)}</span>`).join("")}</div>` : ""}
      ${u.weapons.length ? `<p class="note"><b>Armi:</b> ${u.weapons.map(w => esc(w.name) + (w.range && w.range !== "-" ? ` (${esc(w.range)})` : "")).join(" · ")}</p>` : ""}
      ${defenceHTML(u)}
      ${shootingHTML(u)}
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
  $("#i-armour").addEventListener("change", e => upd(() => { u.armour = +e.target.value || 0; }, "armatura"));
  $("#i-ward").addEventListener("change", e => upd(() => { u.ward = +e.target.value || 0; }, "salvezza speciale"));
  for (const b of host.querySelectorAll("[data-duel]"))
    b.addEventListener("click", () => {
      const foe = state.units.find(x => x.uid === +b.dataset.duel);
      if (foe) openDuel(u, foe);
    });
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
  $("#i-recall").addEventListener("click", () => upd(() => { if (u.placed) u.placed = false; else place(u); }, u.placed ? "ritira" : "schiera"));
  $("#i-del").addEventListener("click", () => upd(() => {
    /* chi era unito a lei resta senza reggimento: meglio rimetterlo sul
       tavolo da solo che lasciarlo appeso a un'unita' che non c'e' piu' */
    for (const c of attachedOf(u)){ FM.leaveUnit(c); c.placed = true; c.x = u.x; c.y = u.y; c.rot = u.rot; }
    state.units = state.units.filter(x => x !== u); state.sel = null;
  }, "rimuovi unità"));
  wireFormationControls(u, upd);
  wireGameControls(u, upd);
}

/* ---- formazione e personaggi ----
   Nell'ispettore ci sta il riassunto e la porta; il mestiere vero lo fa
   l'editor grafico, perche' «dove sta il terzo skink» non e' una cosa
   che si scrive in una casella di testo. */
function formationBlockHTML(u){
  const f = FM.ensureFormation(u);
  const chars = attachedOf(u);
  const host = hostOf(u);
  /* Dentro un reggimento ci va chi al tavolo ci starebbe: i personaggi
     e ogni pezzo da un modello solo, categoria del roster o no. Il file
     della lista non chiama «character» il boss senza slot, e prima
     quell'unita' non compariva da nessuna parte. */
  const free = host ? [] : FM.joinCandidates(state.units, u);
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
        : FM.isCharacter(u) && !chars.length
          ? `<p class="note">Personaggio libero: puoi unirlo a un reggimento aprendo il reggimento, oppure scegliere qui chi unire a lui.</p>`
          : ""}
      ${chars.length ? `<div class="readout"><span>Personaggi dentro</span><b>${chars.map(c => esc(shortName(c.name))).join(", ")}</b></div>` : ""}
      ${free.length ? `
        <label class="field">Unisci un personaggio o un modello singolo
          <select id="i-join">
            <option value="">— nessuno —</option>
            ${free.map(c => `<option value="${c.uid}">${esc(c.name)}${FM.isCharacter(c) ? "" : " · 1 modello"}</option>`).join("")}
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
  $("#i-flee").addEventListener("click", () => upd(() => G.flee(u), "rotta"));
  $("#i-dead").addEventListener("click", () =>
    upd(() => (u.dead ? G.revive(u) : G.destroy(u)), u.dead ? "rimetti in gioco" : "distrutta"));
}

/* ---- le due salvezze che i file delle liste non contengono ----
   L'armatura in Old World viene dall'equipaggiamento e non dal profilo,
   e la salvezza speciale dagli oggetti: nessuna delle due arriva
   dall'export. Si scelgono qui una volta e valgono per il tiro e per lo
   scontro, che senza di loro sovrastimano le perdite di parecchio. */
const SAVE_OPTS = [0, 2, 3, 4, 5, 6];
const saveSelect = (id, cur) =>
  `<select id="${id}">${SAVE_OPTS.map(v =>
    `<option value="${v}"${v === (cur || 0) ? " selected" : ""}>${v ? v + "+" : "—"}</option>`).join("")}</select>`;

function defenceHTML(u){
  return `
    <div class="grid2">
      <label class="field">Armatura${saveSelect("i-armour", u.armour)}</label>
      <label class="field">Salv. speciale${saveSelect("i-ward", u.ward)}</label>
    </div>`;
}

/* ---- che cosa arriva a tiro ----
   La domanda non e' "quanto e' lontano" ma "lo prendo?": serve sapere
   insieme gittata, arco, linea di vista e riparo. Se manca uno dei
   quattro il colpo non parte, e la riga dice quale. */
function shootingHTML(u){
  const plan = shootPlanFor(u);
  if (!plan) return "";
  const rows = plan.rows.slice(0, 5);
  const shots = CB.shooters(u);
  return `
    <div>
      <div class="readout"><span>Tiro${plan.weapon ? " · " + esc(plan.weapon.name) : ""}</span>
        <b>${plan.range}″ · ${shots} tiri</b></div>
      ${rows.length ? rows.map(r => {
        if (!r.canShoot){
          const why = r.blocked ? `dietro ${esc(r.blockedBy.toLowerCase())}`
                    : !r.inArc ? "fuori arco frontale" : "fuori gittata";
          return `<div class="readout near dim"><span>${esc(shortName(r.unit.name))} · ${why}</span>
                    <b>${r.dist.toFixed(1)}″</b></div>`;
        }
        const f = shotOn(u, r, plan);
        const why = f.mods.list.map(m => `${m.v} ${m.why}`).join(", ");
        return `<div class="readout near"><span>${esc(shortName(r.unit.name))} · ${r.dist.toFixed(1)}″${why ? ` <span class="dim">(${why})</span>` : ""}</span>
                  <b style="color:var(--ok)">${f.hitNeed >= 7 ? "mai" : f.hitNeed + "+"} · ${f.kills.toFixed(1)}</b></div>`;
      }).join("") : `<p class="note">Nessun nemico sul tavolo.</p>`}
      <p class="note">L'ultima colonna è il punteggio per colpire e i modelli che cadrebbero in media con una raffica.</p>
    </div>`;
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
          <button class="btn tiny duel-go" data-duel="${r.unit.uid}" title="Simula lo scontro con ${esc(r.unit.name)}">⚔</button>
        </div>`).join("")}
      <p class="note">La spada apre lo scontro simulato: dadi, ferite e conto di fine assalto.</p>
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
            <label class="field">${round ? "Diametro ″" : "Larghezza ″"}<input type="number" step="0.25" min="0.25" max="48" id="t-w" value="${(t.w ?? cfg.w)}"></label>
            ${round ? "" : `<label class="field">Profondità ″<input type="number" step="0.25" min="0.25" max="48" id="t-h" value="${(t.h ?? cfg.h)}"></label>`}
          </div>
          <p class="note">Le stesse misure si tirano sul campo: le maniglie quadrate sul bordo del pezzo selezionato allargano il lato, quella d'angolo tutti e due.</p>`}
      <div class="readout"><span>Posizione</span><b>${inch(t.x).toFixed(1)}″ , ${inch(t.y).toFixed(1)}″</b></div>
      ${iss ? `<div class="warnbox">${iss.key === "bad" ? "Troppo vicino: " : "Oltre il limite Battle March: "}${iss.text}</div>` : ""}
      ${t.kind === "treasure" ? "" : `<div class="grid2"><button class="btn" id="t-rot-l">↺ 15°</button><button class="btn" id="t-rot-r">↻ 15°</button></div>`}
      <button class="btn ghost" id="t-del" style="color:var(--bad)">Togli dal tavolo</button>
    </div>`;
  const upd = (fn, label = "terreno") => act(label, fn);
  const side = (v, dflt) => Math.max(0.25, Math.min(48, +v || dflt));
  if ($("#t-w")) $("#t-w").addEventListener("change", e => upd(() => {
    t.w = side(e.target.value, cfg.w);
    if (round) t.h = t.w;
  }));
  if ($("#t-h")) $("#t-h").addEventListener("change", e => upd(() => { t.h = side(e.target.value, cfg.h); }));
  if ($("#t-rot-l")) $("#t-rot-l").addEventListener("click", () => upd(() => { t.rot = ((t.rot || 0) + 345) % 360; }));
  if ($("#t-rot-r")) $("#t-rot-r").addEventListener("click", () => upd(() => { t.rot = ((t.rot || 0) + 15) % 360; }));
  $("#t-del").addEventListener("click", () => upd(() => {
    state.terrain = state.terrain.filter(x => x !== t); state.sel = null;
  }, "togli " + cfg.label.toLowerCase()));
}

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
  for (const id of ["A", "B"]){
    const col = id === "A" ? "var(--armyA)" : "var(--armyB)";
    for (const z of sc.zones[id] || []){
      g(svg, "rect", { x:z.x, y:z.y, width:z.w, height:z.h, fill:col, opacity:".08" });
      g(svg, "rect", { x:z.x, y:z.y, width:z.w, height:z.h, fill:"none", stroke:col, "stroke-width":1.6, opacity:".55" });
      const bottom = (z.y + z.h / 2) > H / 2;
      const t = g(svg, "text", { x:z.x + 10, y: bottom ? z.y + z.h - 12 : z.y + 24, fill:col, "font-size":20, opacity:".7", "letter-spacing":"2.5" });
      t.textContent = (state.armies[id].name || `Esercito ${id}`).toUpperCase();
    }
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
    if (selIs("terr", t.tid)){
      g(gg, "rect", { x:-b.w/2 - 5, y:-b.h/2 - 5, width:b.w + 10, height:b.h + 10, fill:"none",
                      stroke:"var(--accent)", "stroke-width":2, "stroke-dasharray":"7 5" });
      /* Maniglie per la misura del pezzo. Il bosco di cartone non e'
         mai quello del manuale: sul tavolo si mette quello che si ha, e
         il disegno deve dire quanto occupa DAVVERO, se no le distanze
         e i ripari raccontano un'altra partita. Le maniglie stanno nel
         sistema del pezzo, cosi' funzionano anche girato. */
      for (const [hx, hy, mode] of sizeHandles(t, cfg, b)){
        const hh = g(gg, "g", {});
        hh.dataset.size = mode;
        g(hh, "rect", { x:hx - 9, y:hy - 9, width:18, height:18, rx:3,
                        fill:"var(--panel)", stroke:"var(--accent)", "stroke-width":2.2 });
        g(hh, "rect", { x:hx - 3.4, y:hy - 3.4, width:6.8, height:6.8, fill:"var(--accent)" });
      }
    }
  }

  // raggi dell'unità selezionata
  const selUnit = state.sel && state.sel.type === "unit" ? state.units.find(u => u.uid === state.sel.id) : null;
  if (state.ranges && selUnit && selUnit.placed){
    const rg = g(svg, "g", { "pointer-events":"none", fill:"none" });
    const m = selUnit.stats && /^\d+$/.test(String(selUnit.stats.M)) ? +selUnit.stats.M : 0;
    const col = state.armies[selUnit.army].color;
    const ring = (r, dash, op, label) => {
      if (r <= 0) return;
      g(rg, "circle", { cx:selUnit.x, cy:selUnit.y, r:r * MM, stroke:col, "stroke-width":1.4, "stroke-dasharray":dash, opacity:op });
      const t = g(rg, "text", { x:selUnit.x, y:selUnit.y - r * MM - 5, "text-anchor":"middle", "font-size":15, fill:col, opacity:.9 });
      t.textContent = label;
    };
    if (m) { ring(m, "3 5", .55, `mov ${m}″`); ring(m + 7, "10 6", .75, `carica media ${m + 7}″`); }
    if (selUnit.maxRange) ring(selUnit.maxRange, "2 8", .5, `tiro ${selUnit.maxRange}″`);
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

  // numeri e cartellino
  const lab = g(svg, "g", { "pointer-events":"none" });
  for (const u of state.units){
    if (!u.placed || isJoined(u)) continue;
    if (state.labels){
      const t = g(lab, "text", { x:u.x, y:u.y + 12, "text-anchor":"middle", "font-size":34, "font-weight":"500",
                                 fill:"var(--paper)", stroke:"rgba(0,0,0,.3)", "stroke-width":"1", "paint-order":"stroke" });
      t.textContent = String(u.idx);
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

  /* ---- maniglia di rotazione sul pezzo selezionato ----
     Ruotare stava solo su Q/E e sui due bottoni dell'ispettore: è un
     gesto che si fa cento volte per schieramento e vuole il mouse. */
  /* ---- le linee di schieramento si trascinano ----
     «Dalla mediana» e' un numero nella barra, ma al tavolo la linea la
     si guarda, non la si calcola: la pillola sul bordo interno di ogni
     zona la porta avanti e indietro e dice quanti pollici sono. */
  {
    const vertical = sc.deploy === "pass";       // qui le zone stanno a destra e a sinistra
    const zg = g(svg, "g", { class:"zone-grip" });
    for (const id of ["A", "B"]){
      const z = (sc.zones[id] || [])[0];
      if (!z) continue;
      const col = id === "A" ? "var(--armyA)" : "var(--armyB)";
      const near = (a, b2, mid) => Math.abs(a - mid) < Math.abs(b2 - mid) ? a : b2;
      const along = id === "A" ? .82 : .18;      // sfalsate, se no si coprono a vicenda
      const [hx, hy] = vertical
        ? [near(z.x, z.x + z.w, W / 2), z.y + z.h * along]
        : [z.x + z.w * along, near(z.y, z.y + z.h, H / 2)];
      const grip = g(zg, "g", {});
      grip.dataset.zone = id;
      grip.dataset.axis = vertical ? "x" : "y";
      g(grip, "rect", { x:hx - 46, y:hy - 13, width:92, height:26, rx:13,
                        fill:"var(--panel)", stroke:col, "stroke-width":2 });
      const tl = g(grip, "text", { x:hx, y:hy + 6, "text-anchor":"middle", "font-size":16, fill:col });
      tl.textContent = `${vertical ? "↔" : "↕"} ${fmtIn(inch(state.gap))}″`;
    }
  }

  const selObj = selectedObject();
  if (selObj && (selObj.uid === undefined || selObj.placed)){
    const b = boxOf(selObj), hp = handlePos(selObj), fc = toWorld([0, -b.h/2], b);
    const hg = g(svg, "g", { class:"handle" });
    hg.dataset.handle = "1";
    g(hg, "line", { x1:fc[0], y1:fc[1], x2:hp[0], y2:hp[1], stroke:"var(--accent)", "stroke-width":1.6, "stroke-dasharray":"4 3" });
    g(hg, "circle", { cx:hp[0], cy:hp[1], r:11, fill:"var(--panel)", stroke:"var(--accent)", "stroke-width":2.2 });
    g(hg, "circle", { cx:hp[0], cy:hp[1], r:3.4, fill:"var(--accent)" });
  }

  $("#sc-name").textContent = sc.label + (sc.pts ? ` · ${sc.pts} pt` : "");
  $("#sc-desc").textContent = sc.desc || "";
  updateStat(sc);
}

function shortName(n){
  const s = String(n).replace(/\(.*?\)/g, "").trim();
  return s.length > 18 ? s.slice(0, 17) + "…" : s;
}

/* ============================================================
   7b · AIUTI TATTICI
   La geometria c'era gia' per i controlli di legalita': queste sono
   solo le viste che mancavano. Distanze misurate dal BORDO, come si
   misura al tavolo, non dal centro come tornava comodo al codice.
   ============================================================ */
/* Il terreno visto dagli aiuti tattici: non piu' solo "ferma la vista
   si/no", perche' adesso serve anche sapere quanto costa attraversarlo
   e quanto ripara chi ci si mette dietro. Una lista sola per tutti e
   tre gli usi — movimento, tiro, distanze. */
function terrainPieces(){
  return state.terrain.map(t => {
    const cfg = TERRAIN[t.kind];
    const b = boxOf(t), circle = cfg.shape === "circle" || cfg.shape === "token";
    return {
      kind:t.kind, label:cfg.label, blocks:!!cfg.los,
      pass:cfg.pass, cover:cfg.cover || "",
      circle, box:b, poly:boxCorners(b),
      contains: p => distPointToBox(p, b, circle) < 0.01,
    };
  });
}
const sightPieces = () => terrainPieces().filter(p => p.blocks);

const enemiesOf = u => state.units.filter(o => o.army !== u.army && o.placed && !o.dead && !isJoined(o));

export function surveyFor(u){
  if (!u || !u.placed) return [];
  return survey(u, enemiesOf(u), { cornersOf: corners, boxOf, sightPieces: sightPieces(), inch });
}

/* 8,5 si scrive con la virgola; 8 si scrive 8 e basta */
const fmtIn = n => (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace(".", ",");
const flies = u => (u.rules || []).some(r => /\bfly\b|volan|vola\b/i.test(r));

/* Il piano di tiro: l'arma piu' lunga, e per ogni nemico se lo si vede,
   se e' nell'arco, a che gittata e dietro che riparo. */
export function shootPlanFor(u){
  if (!u || !u.placed) return null;
  const weapon = CB.rangedWeapons(u)[0] || null;
  const range = weapon ? stat(weapon.range) : (u.maxRange || 0);
  if (!range) return null;
  const rows = shootingSurvey(u, enemiesOf(u), {
    cornersOf: corners, boxOf, pieces: terrainPieces(), range, inch,
  });
  return { weapon, range, rows };
}

/* Quanto costa un colpo su quel bersaglio, modificatori spiegati uno
   per uno: e' la riga che dice *perche'* serve un 5. */
export function shotOn(u, row, plan){
  const mods = CB.shootMods({ long: row.long, cover: row.cover, looseTarget: row.unit.loose });
  const weapon = plan.weapon || { range: String(plan.range), S: "", ap: "" };
  return { mods, ...CB.shootForecast(u, row.unit, { weapon, mods: mods.total }) };
}

function drawTactics(svg, g, u){
  if (!u || !u.placed) return;
  const col = state.armies[u.army].color;
  const pieces = (state.move || state.shoot) ? terrainPieces() : [];

  /* ---- dove posso arrivare davvero ----
     Un cerchio dice quanto e' lungo il passo, non dove il passo porta:
     questi ventagli entrano nei boschi a meta' velocita', si fermano
     contro la piramide e contro il bordo del tavolo. */
  if (state.move){
    const bands = movementBands(u);
    if (bands){
      const layer = g(svg, "g", { "pointer-events":"none" });
      const box = boxOf(u), fly = flies(u), rays = 36;
      const bounds = { x:0, y:0, w:state.tableW, h:state.tableH };
      const legend = [];
      for (const [reach, label, op, dash] of [
            [bands.chargeMax, `carica max ${fmtIn(bands.chargeMax)}″`, .07, "2 7"],
            [bands.charge,    `carica ${fmtIn(bands.charge)}″`,        .10, "none"],
            [bands.march,     `marcia ${fmtIn(bands.march)}″`,         .09, "7 5"],
            [bands.move,      `movimento ${fmtIn(bands.move)}″`,       .20, "none"]]){
        const poly = reachFan(box, reach * MM, pieces, { fly, bounds, rays });
        g(layer, "polygon", { points: poly.map(p => p.join(",")).join(" "),
                              fill: col, opacity: op, stroke: col, "stroke-width":1.3,
                              "stroke-dasharray": dash, "stroke-opacity":.5 });
        legend.push([poly[1 + Math.round(rays / 2)], label]);
      }
      for (const [p, label] of legend){
        const t = g(layer, "text", { x:p[0], y:p[1] - 5, "text-anchor":"middle",
                                     "font-size":14, fill:col, opacity:.85 });
        t.textContent = label;
      }
      if (fly){
        const t = g(layer, "text", { x:u.x, y:u.y - boxOf(u).h/2 - 12, "text-anchor":"middle",
                                     "font-size":13, fill:col, opacity:.7 });
        t.textContent = "vola: il terreno non la ferma";
      }
    }
  }

  /* ---- fin dove arriva un colpo ----
     Non un settore di cerchio: i boschi e i monoliti ci ritagliano
     dentro le loro ombre, ed e' esattamente li' che il nemico si mette. */
  if (state.shoot){
    const plan = shootPlanFor(u);
    if (plan){
      const layer = g(svg, "g", { "pointer-events":"none" });
      const box = boxOf(u), blockers = pieces.filter(p => p.blocks);
      const fan = r => sightFan(box, r * MM, blockers).map(p => p.join(",")).join(" ");
      g(layer, "polygon", { points: fan(plan.range), fill: col, opacity:.08,
                            stroke: col, "stroke-width":1.2, "stroke-opacity":.45,
                            "stroke-dasharray":"6 5" });
      g(layer, "polygon", { points: fan(plan.range / 2), fill: col, opacity:.08 });

      const tip = toWorld([0, -box.h/2 - plan.range * MM], box);
      const t = g(layer, "text", { x:tip[0], y:tip[1] + 16, "text-anchor":"middle",
                                   "font-size":15, fill:col, opacity:.9 });
      t.textContent = `${plan.weapon ? plan.weapon.name + " · " : ""}${plan.range}″ · corta entro ${fmtIn(plan.range / 2)}″`;

      /* I cartellini vanno sfalsati: quattro reggimenti schierati fianco
         a fianco hanno il punto di mira quasi alla stessa altezza, e
         senza sfalsare si coprono a vicenda proprio quando servono. */
      plan.rows.slice(0, 8).forEach((row, i) => {
        const good = row.canShoot;
        const stroke = good ? "var(--ok)" : "var(--muted)";
        g(layer, "line", { x1:row.from[0], y1:row.from[1], x2:row.aim[0], y2:row.aim[1],
                           stroke, "stroke-width":1.3, opacity: good ? .65 : .3,
                           "stroke-dasharray": good ? "none" : "4 6" });
        const f = shotOn(u, row, plan);
        const label = good
          ? `${f.hitNeed >= 7 ? "mai" : f.hitNeed + "+"} · ${f.kills.toFixed(1)} mod.`
          : row.blocked ? "non lo vedo" : !row.inArc ? "fuori arco" : "fuori gittata";
        const w = label.length * 7.6 + 12;
        /* il cartellino risale verso chi tira, cosi' resta dentro il
           ventaglio invece di finire dietro il bersaglio */
        const k = 0.86 - (i % 3) * 0.06;
        const mx = row.from[0] + (row.aim[0] - row.from[0]) * k;
        const my = row.from[1] + (row.aim[1] - row.from[1]) * k;
        g(layer, "rect", { x:mx - w/2, y:my - 9, width:w, height:18, rx:4,
                           fill:"var(--panel)", stroke, "stroke-width":1, opacity:.96 });
        const lt = g(layer, "text", { x:mx, y:my + 4.5, "text-anchor":"middle", "font-size":12,
                                      fill: good ? "var(--ink)" : "var(--muted)" });
        lt.textContent = label;
      });
    }
  }

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
  reindex(); syncImportBox(); renderArmies(); renderInspector(); renderTerrainList();
  G.renderGamePanel($("#game"), { esc });
  renderDuel();
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
  const zone = (sc.zones[u.army] || [R(0, 0, state.tableW, state.tableH)])[0];
  u.rot = defaultRot(u.army, sc);
  u.placed = true;
  const [x, y] = findSpot(u, zone, sc);
  u.x = x; u.y = y;
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
let drag = null, spin = null, sizing = null, zoneDrag = null;
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

/* la maniglia di rotazione: un pallino davanti al pezzo selezionato */
const HANDLE_OUT = 34;
function handlePos(o){
  const b = boxOf(o);
  return toWorld([0, -b.h / 2 - HANDLE_OUT], b);
}

/* Dove stanno le maniglie della misura, nel sistema del pezzo. Un
   cerchio ha un raggio solo e quindi una maniglia sola; un rettangolo
   ne ha tre — larghezza, profondita' e l'angolo che muove le due
   insieme. Il segnalino del tesoro no: e' una base da 40 mm e resta
   quella. */
const SIZE_OUT = 14;
function sizeHandles(t, cfg, b){
  if (cfg.shape === "token") return [];
  const rx = b.w / 2 + SIZE_OUT, ry = b.h / 2 + SIZE_OUT;
  if (cfg.shape === "circle") return [[rx, 0, "wh"]];
  return [[rx, 0, "w"], [0, ry, "h"], [rx, ry, "wh"]];
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

  /* maniglia della misura di un elemento scenico: si prende lo scarto
     fra il punto toccato e il bordo, cosi' il pezzo non fa un salto al
     primo pixel */
  const sizeGrip = e.target.closest("[data-size]");
  if (sizeGrip){
    const t = selectedTerrain();
    if (t){
      const b = FM.terrainBox(t), [lx, ly] = toLocal(p, b);
      history.push("misura di " + TERRAIN[t.kind].label.toLowerCase());
      sizing = { obj:t, mode: sizeGrip.dataset.size, dx: lx - b.w / 2, dy: ly - b.h / 2 };
      try { svgEl.setPointerCapture(e.pointerId); } catch (_) {}
    }
    return;
  }

  const zoneGrip = e.target.closest("[data-zone]");
  if (zoneGrip){
    history.push("linee di schieramento");
    zoneDrag = { axis: zoneGrip.dataset.axis };
    try { svgEl.setPointerCapture(e.pointerId); } catch (_) {}
    return;
  }

  const host = e.target.closest("[data-uid],[data-tid]");
  if (!host){
    /* il vuoto non deseleziona subito: prima si prova a scorrere, e se
       il dito non si e' mosso allora era davvero un clic a vuoto */
    gestures.beginPan(e);
    return;
  }
  let obj = null;
  if (host.dataset.uid){ obj = state.units.find(x => x.uid === +host.dataset.uid); state.sel = { type:"unit", id:obj.uid }; }
  else { obj = state.terrain.find(x => x.tid === +host.dataset.tid); state.sel = { type:"terr", id:obj.tid }; }
  history.push("sposta " + (obj.uid !== undefined ? shortName(obj.name) : TERRAIN[obj.kind].label.toLowerCase()));
  drag = { obj, dx: obj.x - p[0], dy: obj.y - p[1], moved:false };
  try { svgEl.setPointerCapture(e.pointerId); } catch (_) {}
  renderArmies(); renderInspector(); renderTerrainList(); drawBoard();
});

svgEl.addEventListener("pointermove", e => {
  if (sizing){
    const t = sizing.obj, cfg = TERRAIN[t.kind];
    const [lx, ly] = toLocal(toSvg(e), FM.terrainBox(t));
    /* dal centro al bordo c'e' meta' lato: la misura e' il doppio */
    const side = v => {
      let n = inch(Math.abs(v) * 2);
      if (state.snap) n = Math.round(n * 4) / 4;
      return Math.max(cfg.shape === "wall" ? 0.25 : 1, Math.min(48, n));
    };
    if (sizing.mode !== "h") t.w = side(lx - sizing.dx);
    if (sizing.mode !== "w") t.h = side(ly - sizing.dy);
    if (cfg.shape === "circle") t.h = t.w;
    drawBoard();
    return;
  }
  if (zoneDrag){
    const p = toSvg(e);
    const half = (zoneDrag.axis === "x" ? state.tableW : state.tableH) / 2;
    let gIn = inch(Math.abs(half - p[zoneDrag.axis === "x" ? 0 : 1]));
    if (state.snap) gIn = Math.round(gIn * 4) / 4;
    state.gap = Math.max(0, Math.min(maxGap(), gIn)) * MM;
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
  if (!drag) return;
  const p = toSvg(e);
  let x = snapVal(p[0] + drag.dx), y = snapVal(p[1] + drag.dy);
  if (drag.obj.uid !== undefined) [x, y] = magnetise(drag.obj, x, y);
  drag.obj.x = x; drag.obj.y = y;
  drag.moved = true;
  drawBoard();
});

function endDrag(e){
  const release = () => { try { svgEl.releasePointerCapture(e.pointerId); } catch (_) {} };
  if (sizing){ sizing = null; release(); renderAll(); return; }
  if (zoneDrag){ zoneDrag = null; release(); syncTableUI(); renderAll(); return; }
  if (spin){ spin = null; release(); renderAll(); return; }
  if (!drag) return;
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
  onPanEnd: moved => { if (!moved && !drag && !spin && !sizing && !zoneDrag) select(null); },
});

const selectedUnit = () =>
  state.sel && state.sel.type === "unit" ? state.units.find(u => u.uid === state.sel.id) : null;
const selectedTerrain = () =>
  state.sel && state.sel.type === "terr" ? state.terrain.find(t => t.tid === state.sel.id) : null;
const selectedObject = () => selectedUnit() || selectedTerrain();

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
        else { state.terrain = state.terrain.filter(x => x !== obj); state.sel = null; }
      };
      break;
  }
  if (!change) return;
  e.preventDefault();
  act(label, change, { coalesce: /^(sposta|ruota|fronte)$/.test(label) ? 700 : 0 });
});

function doUndo(){
  const l = history.undo();
  if (l) toast("Annullato: " + l);
  else toast("Non c'è altro da annullare.");
}
function doRedo(){
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

/* ---------- lista d'esempio ----------
   Le armi e le armature ci sono davvero: senza di loro il campo di
   tiro e lo scontro simulato partirebbero vuoti, e il primo giro nel
   tavolo d'esempio è proprio quello in cui si vuole vedere se
   funzionano. Sono numeri verosimili, non profili copiati. */
const WPN = (name, range, S, ap) => ({ name, range, S, ap: ap ? String(ap) : "", rules:"" });
const DEMO = {
  A:{ name:"Uomini Lucertola — Battle March", units:[
    { name:"Saurus Scar-Veteran", models:1, bw:30, bh:30, pts:96, troop:"Heavy infantry", us:1, armour:3,
      stats:{M:"4",WS:"5",BS:"0",S:"5",T:"5",W:"2",I:"3",A:"4",Ld:"8"},
      rules:["Cold Blooded","Furious Charge"], weapons:[WPN("Alabarda","-","+1",1)] },
    { name:"Skink Chief", models:1, bw:25, bh:25, pts:75, troop:"Regular infantry", us:1, armour:6,
      stats:{M:"6",WS:"4",BS:"5",S:"4",T:"3",W:"2",I:"6",A:"3",Ld:"6"},
      rules:["Aquatic","Cold Blooded"], weapons:[WPN("Giavellotto",'12"',"3",0), WPN("Lancia","-","-",0)] },
    { name:"Saurus Warriors", models:12, bw:30, bh:30, pts:194, troop:"Heavy infantry", us:12, armour:4,
      stats:{M:"4",WS:"3",BS:"0",S:"4",T:"4",W:"1",I:"1",A:"2",Ld:"8"},
      rules:["Close Order","Cold Blooded"], weapons:[WPN("Lancia","-","-",0)] },
    { name:"Skink Skirmishers", models:12, bw:25, bh:25, pts:60, troop:"Regular infantry", us:12, armour:0,
      stats:{M:"6",WS:"2",BS:"3",S:"3",T:"2",W:"1",I:"4",A:"1",Ld:"5"},
      rules:["Skirmishers","Move Through Cover"], weapons:[WPN("Giavellotto",'12"',"3",0)] },
    { name:"Bastiladon", models:1, bw:60, bh:100, pts:175, troop:"Monstrous creature", us:4, armour:3,
      stats:{M:"4",WS:"3",BS:"3",S:"4",T:"5",W:"4",I:"1",A:"3",Ld:"7"},
      rules:["Terror","Large Target","Stubborn"], weapons:[WPN("Congegno solare",'24"',"5",2)] },
  ]},
  B:{ name:"Orchi e Goblin — Battle March", units:[
    { name:"Orc Big Boss", models:1, bw:25, bh:25, pts:85, troop:"Regular infantry", us:1, armour:4,
      stats:{M:"4",WS:"5",BS:"3",S:"4",T:"5",W:"2",I:"3",A:"3",Ld:"8"},
      rules:["Choppas"], weapons:[WPN("Spaccaossa","-","-",1)] },
    { name:"Orc Mob", models:20, bw:25, bh:25, pts:180, troop:"Regular infantry", us:20, armour:5,
      stats:{M:"4",WS:"3",BS:"3",S:"3",T:"4",W:"1",I:"2",A:"1",Ld:"7"},
      rules:["Close Order"], weapons:[WPN("Spaccaossa","-","-",0)] },
    { name:"Goblin Archers", models:16, bw:20, bh:20, pts:96, troop:"Regular infantry", us:16, armour:6,
      stats:{M:"4",WS:"2",BS:"3",S:"3",T:"3",W:"1",I:"2",A:"1",Ld:"6"},
      rules:["Close Order"], weapons:[WPN("Arco corto",'18"',"3",0)] },
    { name:"Orc Boar Boyz", models:6, bw:25, bh:50, pts:138, troop:"Heavy cavalry", us:12, armour:4,
      stats:{M:"7",WS:"3",BS:"3",S:"3",T:"4",W:"1",I:"2",A:"1",Ld:"7"},
      rules:["Impact Hits","Swiftstride"], weapons:[WPN("Lancia","-","-",0)] },
    { name:"Snotling Swarms", models:3, bw:40, bh:40, pts:75, troop:"Swarm", us:6, armour:0,
      stats:{M:"4",WS:"2",BS:"0",S:"2",T:"2",W:"3",I:"2",A:"3",Ld:"4"},
      rules:["Immune To Psychology"], weapons:[] },
  ]},
};
$("#btn-demo").addEventListener("click", () => {
  history.push("carica l'esempio");
  state.units = [];
  for (const id of ["A", "B"]){
    state.armies[id].name = DEMO[id].name;
    state.armies[id].info = { catalogue:"esempio", forceName:"Battle March", limit:0, total:0 };
    for (const d of DEMO[id].units){
      const loose = d.rules.some(r => /skirmish/i.test(r));
      const known = BASES.find(b => b.w === d.bw && b.h === d.bh);
      const maxRange = d.weapons.reduce((m, w) => Math.max(m, stat(w.range)), 0);
      state.units.push({
        uid: uidSeq++, army:id, name:d.name, models:d.models, crew:0, catId: matchUnitName(d.name),
        baseId: known ? known.id : "custom", baseW:d.bw, baseH:d.bh,
        frontage: defaultFrontage(d.troop, d.models, loose), loose,
        pts:d.pts, us:d.us, troop:d.troop, unitSize:"", stats:d.stats, rules:d.rules,
        weapons:d.weapons, maxRange, slot:"", faction:"",
        armour:d.armour, ward:0,
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
  syncTableUI();
  if (!keepTerrain && def.terrain) loadTerrain(id);
  else if (!keepTerrain && !def.terrain) { /* gli scenari generici lasciano il terreno com'è */ }
  for (const u of state.units) if (u.placed) place(u);
  view.fit();
  if (render) renderAll();
}
scSel.addEventListener("change", () => act("scenario", () => setScenario(scSel.value, false, { render:false }), { render:true }));

/* ---------- misura del tavolo ----------
   I cinque formati del menu coprono i tornei; il tavolo di casa no.
   Chi ha 52″ per 40″ perche' e' largo cosi' il tavolo della cucina se
   li scrive, e da li' in poi zone, righelli e controlli di bordo
   lavorano su quelle misure come su tutte le altre. */
const TABLE_MIN = 12, TABLE_MAX = 144;
const tableSel = $("#table-size"), tableBox = $("#table-custom");
const tableWIn = $("#table-w"), tableHIn = $("#table-h");
const gapIn = $("#zone-gap");
const inRound = v => Math.round(inch(v) * 100) / 100;   // il quarto di pollice ci sta intero

/* la misura scelta si rilegge sempre dallo stato: se e' una di quelle
   in elenco il menu la mostra, se no il menu dice «su misura» e le due
   caselle si aprono con i numeri veri */
function syncTableUI(){
  const w = inRound(state.tableW), h = inRound(state.tableH);
  const exact = `${Math.round(w)}x${Math.round(h)}`;
  const known = Number.isInteger(w) && Number.isInteger(h) &&
                [...tableSel.options].some(o => o.value === exact);
  tableSel.value = known ? exact : "custom";
  tableBox.hidden = known;
  tableWIn.value = String(w);
  tableHIn.value = String(h);
  gapIn.value = String(inRound(state.gap));
}

/* la profondita' della striscia di schieramento non puo' mangiarsi
   tutto il tavolo: geometry() tiene comunque due pollici, qui si evita
   di scrivere numeri che poi non si vedono */
const maxGap = () => Math.max(0, inch(Math.min(state.tableW, state.tableH)) / 2 - 2);

function setTable(wIn, hIn){
  const clampSide = v => Math.max(TABLE_MIN, Math.min(TABLE_MAX, Math.round((+v || 0) * 2) / 2));
  state.tableW = clampSide(wIn) * MM;
  state.tableH = clampSide(hIn) * MM;
  state.gap = Math.min(state.gap, maxGap() * MM);
  for (const u of state.units) if (u.placed) place(u);
  syncTableUI();
  view.fit();
}

tableSel.addEventListener("change", e => {
  if (e.target.value === "custom"){ tableBox.hidden = false; tableWIn.focus(); return; }
  const [w, h] = e.target.value.split("x").map(Number);
  act("misura del tavolo", () => setTable(w, h));
});
const onTableInput = () => act("misura del tavolo",
  () => setTable(tableWIn.value, tableHIn.value), { coalesce: 700 });
tableWIn.addEventListener("change", onTableInput);
tableHIn.addEventListener("change", onTableInput);

gapIn.addEventListener("change", e => act("linee di schieramento", () => {
  state.gap = Math.max(0, Math.min(maxGap(), +e.target.value || 0)) * MM;
  syncTableUI();
}, { coalesce: 700 }));

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
  ["#btn-move", "move"], ["#btn-shoot", "shoot"],
];
for (const [sel, key] of TOGGLES){
  const b = $(sel);
  if (!b) continue;
  b.addEventListener("click", () => {
    state[key] = !state[key];
    if (key === "measure" && !state.measure) state.measurePts = [];
    b.classList.toggle("on", !!state[key]);
    drawBoard(); save();
  });
  b.classList.toggle("on", !!state[key]);
}
$("#btn-auto").addEventListener("click", () => act("schiera tutto", autoDeploy, { render:false }));
$("#btn-recall").addEventListener("click", () =>
  act("ritira tutto", () => { for (const u of state.units) u.placed = false; }));

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
  const name = prompt("Nome dello scenario:", scenarioDef(state.scenario).label + " (mio)");
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
  });
  fillScenarioSelect();
  state.scenario = id; scSel.value = id;
  renderAll();
  toast("Scenario salvato: lo ritrovi in “Miei scenari”.");
});

$("#btn-scen-del").addEventListener("click", async () => {
  const cur = allCustom().find(s => s.id === state.scenario);
  if (!cur){ toast("Questo non è uno scenario tuo: quelli del manuale restano dove sono."); return; }
  if (!confirm(`Elimino lo scenario “${cur.label}”? Il terreno sul tavolo resta.`)) return;
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

function snapshot(){
  return {
    armies:{ A:{ name:state.armies.A.name, info:state.armies.A.info },
             B:{ name:state.armies.B.name, info:state.armies.B.info } },
    units:state.units, terrain:state.terrain, scenario:state.scenario,
    tableW:state.tableW, tableH:state.tableH, gap:state.gap,
    snap:state.snap, labels:state.labels, ranges:state.ranges, photos:state.photos,
    distances:state.distances, arcs:state.arcs, move:state.move, shoot:state.shoot,
    rulers:state.rulers, game:state.game, sel:state.sel,
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
  uidSeq = Math.max(1, ...state.units.map(u => u.uid || 0)) + 1;
  tidSeq = Math.max(1, ...state.terrain.map(t => t.tid || 0)) + 1;
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
  state.move = !!s.move;
  state.shoot = !!s.shoot;
  state.rulers = Array.isArray(s.rulers) ? s.rulers : [];
  state.game = G.ensureGame(s.game);
  state.sel = s.sel && typeof s.sel === "object" ? s.sel : null;
  state.measurePts = [];
  fillScenarioSelect();
  scSel.value = state.scenario;
  syncTableUI();
  for (const [sel, key] of TOGGLES) $(sel).classList.toggle("on", !!state[key]);
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

window.addEventListener("hashchange", () => {
  const code = readShareCode();
  if (!code) return;
  if (!confirm("Questo link contiene uno schieramento. Lo apro al posto di quello sul tavolo?")) return;
  loadShared(code);
});

async function bootDeploy(){
  const th = localStorage.getItem("tow-theme");
  if (th) document.documentElement.setAttribute("data-theme", th);

  await initScenarioKit();
  fillScenarioSelect();
  G.initGame({ getState: () => state, act });
  initDuel($("#duel"), {
    unit: uid => state.units.find(u => u.uid === uid) || null,
    setSave: (u, key, v) => act(key === "armour" ? "armatura" : "salvezza speciale",
                                () => { u[key] = v; }),
    applyLosses: pairs => {
      act("perdite dallo scontro", () => {
        for (const [u, n] of pairs) if (n > 0) G.setLost(u, (u.lost || 0) + n);
      });
      toast(state.game.on
        ? "Perdite segnate: i reggimenti sul tavolo si sono accorciati."
        : "Perdite segnate. Si vedono sul tavolo dopo «Comincia la partita».");
    },
  });
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
         setScenario, refreshLinks, history, view, act, toast, effModels };
