/* Schieramento Old World — stato del tavolo, pannelli, campo di battaglia */

import { MM, $, SVGNS, esc, inch } from './util.js';
import { BASES, baseById, defaultFrontage } from './bases.js';
import { parseRoster, parseAny } from './parser.js';
import { TERRAIN, TREASURE_CLEAR, BM_MAX_SIDE } from './terrain.js';
import { R, T, SCENARIOS, geometry } from './scenarios.js';
import { saveDoc, loadDoc } from './store.js';
import { photoForUnit, photoFor, catEntry, matchUnitName } from './catalog.js';

function currentScenario(){
  const def = SCENARIOS[state.scenario] || SCENARIOS.open;
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
  rawInfo:"",
};
let uidSeq = 1, tidSeq = 1;

const unitStep = u => u.loose ? 12.7 : 0;                       // spaziatura schermagliatori
const unitW = u => u.frontage * (u.baseW + unitStep(u));
const ranksOf = u => Math.ceil(u.models / u.frontage);
const unitD = u => ranksOf(u) * (u.baseH + unitStep(u));

/* -------- geometria -------- */
function boxOf(o){
  if (o.uid !== undefined) return { x:o.x, y:o.y, w:unitW(o), h:unitD(o), rot:o.rot };
  const cfg = TERRAIN[o.kind];
  const w = (o.w ?? cfg.w) * MM, h = (o.h ?? cfg.h) * MM;
  return { x:o.x, y:o.y, w, h, rot:o.rot || 0 };
}
function corners(o){
  const b = boxOf(o), a = b.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-b.w/2,-b.h/2],[b.w/2,-b.h/2],[b.w/2,b.h/2],[-b.w/2,b.h/2]]
    .map(([px, py]) => [b.x + px*c - py*s, b.y + px*s + py*c]);
}
function polysOverlap(A, B){
  for (const poly of [A, B]){
    for (let i = 0; i < poly.length; i++){
      const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
      const ax = -(p2[1] - p1[1]), ay = p2[0] - p1[0];
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const p of A){ const d = p[0]*ax + p[1]*ay; if (d<minA) minA=d; if (d>maxA) maxA=d; }
      for (const p of B){ const d = p[0]*ax + p[1]*ay; if (d<minB) minB=d; if (d>maxB) maxB=d; }
      if (maxA <= minB + 0.05 || maxB <= minA + 0.05) return false;
    }
  }
  return true;
}
const rectPoly = r => [[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]];
const inRect = (p, r, tol = 0.6) =>
  p[0] >= r.x - tol && p[0] <= r.x + r.w + tol && p[1] >= r.y - tol && p[1] <= r.y + r.h + tol;

// distanza fra un punto e il bordo di un pezzo (0 se dentro)
function distToPiece(pt, o){
  const b = boxOf(o), a = -b.rot * Math.PI / 180;
  const dx = pt[0] - b.x, dy = pt[1] - b.y;
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  if (TERRAIN[o.kind] && TERRAIN[o.kind].shape === "circle")
    return Math.max(0, Math.hypot(lx, ly) - b.w / 2);
  const ox = Math.max(Math.abs(lx) - b.w / 2, 0);
  const oy = Math.max(Math.abs(ly) - b.h / 2, 0);
  return Math.hypot(ox, oy);
}

function zonesFor(army, sc){
  const z = [...(sc.zones[army] || [])];
  for (const a of sc.aux) if (a.army === army) z.push(a.rect);
  return z;
}
const impassable = () => state.terrain.filter(t => TERRAIN[t.kind].pass === "blocked");

function unitStatus(u, sc){
  if (!u.placed) return { key:"idle", text:"in riserva" };
  const pts = corners(u);
  if (!pts.every(p => inRect(p, R(0, 0, state.tableW, state.tableH)))) return { key:"bad", text:"fuori tavolo" };
  for (const b of sc.blocked) if (polysOverlap(pts, rectPoly(b))) return { key:"bad", text:"terreno chiuso" };
  for (const t of impassable()) if (polysOverlap(pts, corners(t))) return { key:"bad", text:"su " + TERRAIN[t.kind].label.toLowerCase() };
  for (const o of state.units) if (o !== u && o.placed && polysOverlap(pts, corners(o))) return { key:"bad", text:"sovrapposta" };
  const zs = zonesFor(u.army, sc);
  if (zs.length && !pts.every(p => zs.some(z => inRect(p, z)))) return { key:"warn", text:"fuori zona" };
  return { key:"ok", text:"schierata" };
}

// controlli sul terreno: regola dei 12″ e distanza dei tesori
function terrainIssues(){
  const out = new Map();
  const isBM = (SCENARIOS[state.scenario] || {}).group === "Battle March";
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

/* una anteprima per ogni modello dell'unita' */
function miniStrip(u){
  const n = Math.min(u.models, MAX_DOTS);
  let out = '<span class="minis">';
  for (let i = 0; i < n; i++){
    const p = photoForUnit(u);
    out += p
      ? `<img class="mdl" src="${p}" alt="" loading="lazy">`
      : `<span class="mdl ph" style="background:${state.armies[u.army].color}"></span>`;
  }
  if (u.models > n) out += `<span class="mdl more">+${u.models - n}</span>`;
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

function unitRow(u, sc){
  const el = document.createElement("div");
  el.className = "row" + (selIs("unit", u.uid) ? " sel" : "");
  const st = unitStatus(u, sc);
  el.classList.add("u-row");
  el.innerHTML = `
    <span class="nm">
      <b><span class="idx" style="background:${state.armies[u.army].color}">${u.idx}</span><span class="txt">${esc(u.name)}</span></b>
      <span class="mono">${u.models}× ${u.baseW}×${u.baseH} · ${u.frontage} di fronte · ${inch(unitW(u)).toFixed(1)}×${inch(unitD(u)).toFixed(1)}″ · ${u.pts} pt</span>
    </span>
    <span class="chip ${st.key}">${st.text}</span>
    ${miniStrip(u)}`;
  el.addEventListener("click", () => {
    state.sel = { type:"unit", id:u.uid };
    if (!u.placed) place(u);
    renderAll();
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
    el.addEventListener("click", () => { state.sel = { type:"terr", id:t.tid }; renderAll(); });
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
      <label class="field inline" style="text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink)">
        <input type="checkbox" id="i-loose" ${u.loose ? "checked" : ""}> formazione sciolta (schermagliatori)
      </label>
      <div>
        <div class="readout"><span>Ingombro</span><b>${inch(unitW(u)).toFixed(2)}″ × ${inch(unitD(u)).toFixed(2)}″</b></div>
        <div class="readout"><span>Ranghi</span><b>${ranksOf(u)} × ${u.frontage}</b></div>
        ${u.us ? `<div class="readout"><span>Unit Strength</span><b>${u.us}</b></div>` : ""}
        ${u.crew ? `<div class="readout"><span>Equipaggio</span><b>${u.crew}</b></div>` : ""}
        ${u.stats && u.stats.M && /\d/.test(u.stats.M) ? `<div class="readout"><span>Movimento / carica</span><b>${u.stats.M}″ · ${+u.stats.M + 7}″ medio · ${+u.stats.M + 12}″ max</b></div>` : ""}
        ${u.maxRange ? `<div class="readout"><span>Tiro più lungo</span><b>${u.maxRange}″</b></div>` : ""}
        <div class="readout"><span>Stato</span><b style="color:var(--${st.key === "idle" ? "muted" : st.key})">${st.text}</b></div>
      </div>
      ${u.rules.length ? `<div class="tags">${u.rules.map(r => `<span class="tag">${esc(r)}</span>`).join("")}</div>` : ""}
      ${u.weapons.length ? `<p class="note"><b>Armi:</b> ${u.weapons.map(w => esc(w.name) + (w.range && w.range !== "-" ? ` (${esc(w.range)})` : "")).join(" · ")}</p>` : ""}
      <div class="grid2"><button class="btn" id="i-rot-l">↺ 90°</button><button class="btn" id="i-rot-r">↻ 90°</button></div>
      <div class="grid2"><button class="btn" id="i-swap">Cambia esercito</button>
        <button class="btn" id="i-recall">${u.placed ? "Ritira" : "Schiera"}</button></div>
      <button class="btn ghost" id="i-del" style="color:var(--bad)">Rimuovi dalla lista</button>
    </div>`;

  const upd = fn => { fn(); renderAll(); };
  $("#i-name").addEventListener("input", e => { u.name = e.target.value; renderArmies(); });

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
  $("#i-loose").addEventListener("change", e => upd(() => {
    u.loose = e.target.checked;
    u.frontage = defaultFrontage(u.troop, u.models, u.loose);
  }));
  $("#i-rot-l").addEventListener("click", () => upd(() => { u.rot = (u.rot + 270) % 360; }));
  $("#i-rot-r").addEventListener("click", () => upd(() => { u.rot = (u.rot + 90) % 360; }));
  $("#i-swap").addEventListener("click", () => upd(() => { u.army = u.army === "A" ? "B" : "A"; if (u.placed) place(u); }));
  $("#i-recall").addEventListener("click", () => upd(() => { if (u.placed) u.placed = false; else place(u); }));
  $("#i-del").addEventListener("click", () => upd(() => {
    state.units = state.units.filter(x => x !== u); state.sel = null;
  }));
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
  const upd = fn => { fn(); renderAll(); };
  if ($("#t-w")) $("#t-w").addEventListener("change", e => upd(() => {
    t.w = Math.max(1, +e.target.value || cfg.w);
    if (round) t.h = t.w;
  }));
  if ($("#t-h")) $("#t-h").addEventListener("change", e => upd(() => { t.h = Math.max(1, +e.target.value || cfg.h); }));
  if ($("#t-rot-l")) $("#t-rot-l").addEventListener("click", () => upd(() => { t.rot = ((t.rot || 0) + 345) % 360; }));
  if ($("#t-rot-r")) $("#t-rot-r").addEventListener("click", () => upd(() => { t.rot = ((t.rot || 0) + 15) % 360; }));
  $("#t-del").addEventListener("click", () => upd(() => {
    state.terrain = state.terrain.filter(x => x !== t); state.sel = null;
  }));
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

function photoDefsFor(svg){
  const ids = new Map();
  if (!state.photos) return ids;

  const key = [];
  for (const u of state.units){
    if (!u.placed || !u.catId || ids.has(u.catId)) continue;
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
  const svg = $("#board"), sc = currentScenario();
  const W = state.tableW, H = state.tableH, pad = 46;
  svg.setAttribute("viewBox", `${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
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
    if (selIs("terr", t.tid))
      g(gg, "rect", { x:-b.w/2 - 5, y:-b.h/2 - 5, width:b.w + 10, height:b.h + 10, fill:"none",
                      stroke:"var(--accent)", "stroke-width":2, "stroke-dasharray":"7 5" });
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
    if (!u.placed) continue;
    const st = unitStatus(u, sc), col = state.armies[u.army].color;
    const Wu = unitW(u), Du = unitD(u);
    const gg = g(layer, "g", { transform:`translate(${u.x} ${u.y}) rotate(${u.rot})`, class:"piece" });
    gg.dataset.uid = u.uid;
    g(gg, "rect", { x:-Wu/2, y:-Du/2, width:Wu, height:Du, fill:col,
                    opacity: selIs("unit", u.uid) ? ".85" : ".7",
                    stroke: st.key === "bad" ? "var(--bad)" : (st.key === "warn" ? "var(--warn)" : col),
                    "stroke-width": st.key === "ok" ? 1.4 : 3,
                    "stroke-dasharray": u.loose ? "8 5" : "none" });
    const stepW = u.baseW + unitStep(u), stepH = u.baseH + unitStep(u);

    /* una foto per base. Restano dritte anche se il reggimento e'
       girato: il fronte lo dice gia' la riga bianca sul davanti. */
    const phId = photoIds.get(u.catId);
    if (phId){
      const pad = unitStep(u) / 2;
      const pg = g(gg, "g", { opacity:".93", "pointer-events":"none" });
      for (let i = 0; i < u.models; i++){
        const cx = -Wu/2 + (i % u.frontage) * stepW + pad + u.baseW / 2;
        const cy = -Du/2 + Math.floor(i / u.frontage) * stepH + pad + u.baseH / 2;
        const use = g(pg, "use", { x: cx - u.baseW / 2, y: cy - u.baseH / 2,
                                   width: u.baseW, height: u.baseH,
                                   transform:`rotate(${-u.rot} ${cx} ${cy})` });
        setHref(use, "#" + phId);
      }
    }

    const inner = g(gg, "g", { stroke:"var(--paper)", "stroke-width":.8, opacity:".45" });
    for (let i = 1; i < u.frontage; i++) g(inner, "line", { x1:-Wu/2 + i*stepW, y1:-Du/2, x2:-Wu/2 + i*stepW, y2:Du/2 });
    for (let i = 1; i < ranksOf(u); i++) g(inner, "line", { x1:-Wu/2, y1:-Du/2 + i*stepH, x2:Wu/2, y2:-Du/2 + i*stepH });
    g(gg, "line", { x1:-Wu/2, y1:-Du/2, x2:Wu/2, y2:-Du/2, stroke:"var(--paper)", "stroke-width":3.5, opacity:".9" });
    if (selIs("unit", u.uid))
      g(gg, "rect", { x:-Wu/2 - 4, y:-Du/2 - 4, width:Wu + 8, height:Du + 8, fill:"none",
                      stroke:"var(--accent)", "stroke-width":2, "stroke-dasharray":"7 5" });
  }

  // numeri e cartellino
  const lab = g(svg, "g", { "pointer-events":"none" });
  for (const u of state.units){
    if (!u.placed) continue;
    if (state.labels){
      const t = g(lab, "text", { x:u.x, y:u.y + 12, "text-anchor":"middle", "font-size":34, "font-weight":"500",
                                 fill:"var(--paper)", stroke:"rgba(0,0,0,.3)", "stroke-width":"1", "paint-order":"stroke" });
      t.textContent = String(u.idx);
    }
    if (selIs("unit", u.uid)){
      const txt = `${u.idx}. ${shortName(u.name)} — ${u.models} mod.`;
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

  if (state.measurePts.length){
    const m = g(svg, "g", { "pointer-events":"none" });
    const [p1, p2] = state.measurePts;
    g(m, "circle", { cx:p1[0], cy:p1[1], r:4, fill:"var(--accent)" });
    if (p2){
      g(m, "line", { x1:p1[0], y1:p1[1], x2:p2[0], y2:p2[1], stroke:"var(--accent)", "stroke-width":2 });
      g(m, "circle", { cx:p2[0], cy:p2[1], r:4, fill:"var(--accent)" });
      const mx = (p1[0]+p2[0])/2, my = (p1[1]+p2[1])/2;
      g(m, "rect", { x:mx - 36, y:my - 27, width:72, height:23, rx:4, fill:"var(--panel)", stroke:"var(--accent)", "stroke-width":1 });
      const t = g(m, "text", { x:mx, y:my - 11, "text-anchor":"middle", "font-size":15, fill:"var(--ink)" });
      t.textContent = (Math.hypot(p2[0]-p1[0], p2[1]-p1[1]) / MM).toFixed(2) + "″";
    }
  }

  $("#sc-name").textContent = sc.label + (sc.pts ? ` · ${sc.pts} pt` : "");
  $("#sc-desc").textContent = sc.desc || "";
  updateStat(sc);
}

function shortName(n){
  const s = String(n).replace(/\(.*?\)/g, "").trim();
  return s.length > 18 ? s.slice(0, 17) + "…" : s;
}
function updateStat(sc){
  const placed = state.units.filter(u => u.placed);
  const bad = placed.filter(u => unitStatus(u, sc).key === "bad").length;
  const warn = placed.filter(u => unitStatus(u, sc).key === "warn").length;
  const parts = [`${placed.length}/${state.units.length} schierate`];
  if (warn) parts.push(`${warn} fuori zona`);
  if (bad) parts.push(`${bad} in conflitto`);
  const ti = terrainIssues().size;
  if (ti) parts.push(`${ti} avvisi terreno`);
  $("#stat").textContent = parts.join(" · ");
}
function renderAll(){
  reindex(); renderArmies(); renderInspector(); renderTerrainList(); drawBoard(); save();
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
      for (const o of state.units) if (o !== u && o.placed && polysOverlap(corners(test), corners(o))) { clash = true; break; }
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
    const list = state.units.filter(u => u.army === id).sort((a, b) => unitW(b) - unitW(a));
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
  for (const u of state.units.filter(x => x.placed)){
    if (unitStatus(u, sc).key === "ok") continue;
    const zone = (sc.zones[u.army] || [])[0];
    if (!zone) continue;
    const [x, y] = findSpot(u, zone, sc);
    u.x = x; u.y = y;
  }
  renderAll();
  toast("Schieramento automatico completato — ora sistemalo a mano.");
}

/* ============================================================
   9 · INTERAZIONE
   ============================================================ */
const svgEl = $("#board");
let drag = null;
function toSvg(evt){
  const pt = svgEl.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  const p = pt.matrixTransform(svgEl.getScreenCTM().inverse());
  return [p.x, p.y];
}
const snapVal = v => state.snap ? Math.round(v / (MM / 4)) * (MM / 4) : v;

svgEl.addEventListener("pointerdown", e => {
  const p = toSvg(e);
  if (state.measure){
    if (state.measurePts.length >= 2) state.measurePts = [];
    state.measurePts.push(p); drawBoard(); return;
  }
  const host = e.target.closest("[data-uid],[data-tid]");
  if (!host){ state.sel = null; renderAll(); return; }
  let obj = null;
  if (host.dataset.uid){ obj = state.units.find(x => x.uid === +host.dataset.uid); state.sel = { type:"unit", id:obj.uid }; }
  else { obj = state.terrain.find(x => x.tid === +host.dataset.tid); state.sel = { type:"terr", id:obj.tid }; }
  drag = { obj, dx: obj.x - p[0], dy: obj.y - p[1] };
  svgEl.setPointerCapture(e.pointerId);
  renderArmies(); renderInspector(); renderTerrainList(); drawBoard();
});
svgEl.addEventListener("pointermove", e => {
  if (!drag) return;
  const p = toSvg(e);
  drag.obj.x = snapVal(p[0] + drag.dx);
  drag.obj.y = snapVal(p[1] + drag.dy);
  drawBoard();
});
function endDrag(e){
  if (!drag) return;
  drag = null;
  try { svgEl.releasePointerCapture(e.pointerId); } catch (_) {}
  renderAll();
}
svgEl.addEventListener("pointerup", endDrag);
svgEl.addEventListener("pointercancel", endDrag);

document.addEventListener("keydown", e => {
  if (/input|select|textarea/i.test(e.target.tagName) || !state.sel) return;
  const isUnit = state.sel.type === "unit";
  const obj = isUnit ? state.units.find(x => x.uid === state.sel.id) : state.terrain.find(x => x.tid === state.sel.id);
  if (!obj) return;
  const step = e.shiftKey ? MM : MM / 4;
  const spin = isUnit ? 90 : 15;
  let handled = true;
  switch (e.key){
    case "ArrowLeft":  obj.x -= step; break;
    case "ArrowRight": obj.x += step; break;
    case "ArrowUp":    obj.y -= step; break;
    case "ArrowDown":  obj.y += step; break;
    case "q": case "Q": obj.rot = ((obj.rot || 0) + 360 - spin) % 360; break;
    case "e": case "E": obj.rot = ((obj.rot || 0) + spin) % 360; break;
    case "Delete": case "Backspace":
      if (isUnit) obj.placed = false;
      else { state.terrain = state.terrain.filter(x => x !== obj); state.sel = null; }
      break;
    default: handled = false;
  }
  if (handled){ e.preventDefault(); renderAll(); }
});

/* ============================================================
   10 · IMPORT
   ============================================================ */
function addRoster(parsed, armyId){
  const army = state.armies[armyId];
  // se la lista è intitolata come uno scenario, per l'esercito usiamo la fazione
  const isScenarioTitle = Object.values(SCENARIOS).some(s =>
    s.label.toLowerCase() === String(parsed.rosterName).trim().toLowerCase());
  army.name = (isScenarioTitle && parsed.catalogue) ? parsed.catalogue : (parsed.rosterName || army.name);
  army.info = { catalogue: parsed.catalogue, forceName: parsed.forceName, limit: parsed.limit, total: parsed.total };
  state.units = state.units.filter(u => u.army !== armyId);
  for (const p of parsed.units)
    state.units.push({ uid: uidSeq++, army: armyId, ...p, catId: matchUnitName(p.name), x:0, y:0, rot: armyId === "A" ? 0 : 180, placed:false });

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
$("#btn-clear").addEventListener("click", () => {
  state.units = []; state.sel = null; state.rawInfo = "";
  state.armies.A = { id:"A", name:"Esercito A", color:"var(--armyA)", info:null };
  state.armies.B = { id:"B", name:"Esercito B", color:"var(--armyB)", info:null };
  $("#raw-wrap").hidden = true;
  renderAll();
});

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
      });
    }
  }
  autoDeploy();
});

/* ============================================================
   11 · CONTROLLI
   ============================================================ */
const scSel = $("#scenario");
(function fillScenarios(){
  const groups = {};
  for (const [id, s] of Object.entries(SCENARIOS)) (groups[s.group] ||= []).push([id, s]);
  scSel.innerHTML = Object.entries(groups).map(([gname, items]) =>
    `<optgroup label="${gname}">${items.map(([id, s]) =>
      `<option value="${id}">${s.label}${s.pts ? ` — ${s.pts} pt` : ""}</option>`).join("")}</optgroup>`).join("");
})();

function loadTerrain(id){
  const def = SCENARIOS[id];
  state.terrain = (def.terrain || []).map(t => ({
    tid: tidSeq++, kind:t.kind,
    x: t.x * MM, y: t.y * MM,
    w: t.w ?? TERRAIN[t.kind].w, h: t.h ?? TERRAIN[t.kind].h,
    rot: t.rot || 0,
  }));
}
function setScenario(id, keepTerrain){
  const def = SCENARIOS[id];
  state.scenario = id;
  state.tableW = def.table[0] * MM;
  state.tableH = def.table[1] * MM;
  state.gap = def.gap * MM;
  scSel.value = id;
  $("#table-size").value = `${def.table[0]}x${def.table[1]}`;
  $("#zone-gap").value = String(def.gap);
  if (!keepTerrain && def.terrain) loadTerrain(id);
  else if (!keepTerrain && !def.terrain) { /* gli scenari generici lasciano il terreno com'è */ }
  for (const u of state.units) if (u.placed) place(u);
  renderAll();
}
scSel.addEventListener("change", () => setScenario(scSel.value));
$("#table-size").addEventListener("change", e => {
  const [w, h] = e.target.value.split("x").map(Number);
  state.tableW = w * MM; state.tableH = h * MM;
  for (const u of state.units) if (u.placed) place(u);
  renderAll();
});
$("#zone-gap").addEventListener("change", e => { state.gap = +e.target.value * MM; renderAll(); });

(function fillPalette(){
  const host = $("#palette");
  for (const [kind, cfg] of Object.entries(TERRAIN)){
    const b = document.createElement("button");
    b.className = "btn tiny";
    b.innerHTML = `<span class="pdot" style="background:${cfg.color};${cfg.shape === "circle" || cfg.shape === "token" ? "border-radius:50%;" : ""}"></span>${cfg.label}`;
    b.addEventListener("click", () => {
      const t = { tid: tidSeq++, kind, x: state.tableW / 2, y: state.tableH / 2, w: cfg.w, h: cfg.h, rot: 0 };
      // scosta leggermente se il centro è già occupato
      let n = state.terrain.length;
      t.x += (n % 5) * 30 - 60; t.y += Math.floor(n / 5) * 30 - 30;
      state.terrain.push(t);
      state.sel = { type:"terr", id:t.tid };
      renderAll();
    });
    host.appendChild(b);
  }
})();
$("#btn-terr-reset").addEventListener("click", () => {
  const def = SCENARIOS[state.scenario];
  if (!def.terrain){ toast("Questo scenario non ha una mappa di terreno predefinita."); return; }
  loadTerrain(state.scenario); renderAll();
  toast("Terreno riportato alla mappa dello scenario.");
});
$("#btn-terr-clear").addEventListener("click", () => { state.terrain = []; state.sel = null; renderAll(); });

const toggle = (sel, key) => {
  const b = $(sel);
  const sync = () => b.classList.toggle("on", !!state[key]);
  b.addEventListener("click", () => {
    state[key] = !state[key];
    if (key === "measure" && !state.measure) state.measurePts = [];
    sync(); drawBoard(); save();
  });
  sync();
};
toggle("#btn-snap", "snap"); toggle("#btn-labels", "labels");
toggle("#btn-ranges", "ranges"); toggle("#btn-measure", "measure");
toggle("#btn-photos", "photos");
$("#btn-auto").addEventListener("click", autoDeploy);
$("#btn-recall").addEventListener("click", () => { for (const u of state.units) u.placed = false; renderAll(); });
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
  healLinks();
  state.terrain = Array.isArray(s.terrain) ? s.terrain : [];
  uidSeq = Math.max(1, ...state.units.map(u => u.uid || 0)) + 1;
  tidSeq = Math.max(1, ...state.terrain.map(t => t.tid || 0)) + 1;
  state.scenario = SCENARIOS[s.scenario] ? s.scenario : state.scenario;
  state.tableW = s.tableW || state.tableW;
  state.tableH = s.tableH || state.tableH;
  state.gap = s.gap || state.gap;
  state.snap = s.snap !== false;
  state.labels = s.labels !== false;
  state.ranges = !!s.ranges;
  state.photos = s.photos !== false;
  scSel.value = state.scenario;
  $("#table-size").value = `${Math.round(inch(state.tableW))}x${Math.round(inch(state.tableH))}`;
  $("#zone-gap").value = String(Math.round(inch(state.gap)));
  $("#btn-snap").classList.toggle("on", state.snap);
  $("#btn-labels").classList.toggle("on", state.labels);
  $("#btn-ranges").classList.toggle("on", state.ranges);
  $("#btn-photos").classList.toggle("on", state.photos);
  return true;
}

/* carica una lista salvata dentro un esercito del tavolo */
function loadArmyFromList(list, armyId){
  state.units = state.units.filter(u => u.army !== armyId);
  for (const p of list.units){
    state.units.push({
      uid: uidSeq++, army: armyId, ...p,
      catId: p.catId || matchUnitName(p.name),
      x:0, y:0, rot: armyId === "A" ? 0 : 180, placed:false,
    });
  }
  state.armies[armyId].name = list.name;
  state.armies[armyId].info = list.info || null;
  renderAll();
}

async function bootDeploy(){
  const th = localStorage.getItem("tow-theme");
  if (th) document.documentElement.setAttribute("data-theme", th);
  const saved = await loadDoc(BOARD_KEY, null);
  if (saved && applySnapshot(saved) && state.units.length) renderAll();
  else { setScenario("bm-guado"); $("#btn-demo").click(); }
}

/* chiamata da main.js quando il catalogo cambia */
function refreshLinks(){
  if (healLinks()) save();
}

export { state, renderAll, bootDeploy, loadArmyFromList, snapshot, applySnapshot, setScenario, refreshLinks };
