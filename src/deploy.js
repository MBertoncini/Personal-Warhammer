/* Schieramento Old World — stato del tavolo, pannelli, campo di battaglia */

import { MM, $, SVGNS, esc, inch } from './util.js';
import { BASES, baseById, defaultFrontage } from './bases.js';
import { parseRoster, parseAny } from './parser.js';
import { TERRAIN, TREASURE_CLEAR, BM_MAX_SIDE, catOf } from './terrain.js';
import { R, T, SCENARIOS, geometry } from './scenarios.js';
import { saveDoc, loadDoc } from './store.js';
import { photoForUnit, photoFor, catEntry, matchUnitName } from './catalog.js';
import { rectPoly, pointInRect, boxCorners, polysOverlap,
         distPointToBox, toWorld, toLocal, polyDistance, closestPoints } from './geom.js';
import * as CB from './combat.js';
import * as ML from './melee.js';
import { stat } from './rules.js';
import * as EF from './effects.js';
import { troopType, unitStrength } from './troops.js';
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
import * as CH from './charge.js';
import * as SH from './shoot.js';
import * as SG from './sight.js';
import * as PS from './psych.js';
import * as ARM from './armies.js';
import * as MG from './magic.js';
import { splitWeaponRules } from './rulebook.js';
import { showDiceGroups } from './dicebox.js';
import { chartLink } from './charts.js';
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
  distances:false, arcs:false, move:false, shoot:false,
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
const hostOf = ch => FM.hostUnit(state.units, ch);
const isJoined = u => !!hostOf(u);
const attachedOf = u => FM.attachedTo(state.units, u);

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

/* Il profilo, e da dove viene ogni numero.
   Prima l'ispettore mostrava la riga del file e basta: nove numeri
   senza storia. Adesso passa da `statOf`, che applica gli effetti
   attivi e sa dire chi ha messo quel +1 e fino a quando — e la cella
   che e' stata spostata si vede, invece di somigliare a tutte le
   altre. E' il «fatto quando» della Tappa 0 del piano.

   Quando c'e' la cavalcatura ci sono due righe, perche' il Movimento
   e' della bestia e la Forza e' di chi ci sta sopra, e meta' delle
   regole d'esercito parla a una sola delle due. */
function statsBlockHTML(u){
  if (!u.stats) return "";
  const keys = EF.CHARS;
  const cell = k => {
    const s = EF.statOf(u, k);
    const why = s.mods.map(m => (m.set != null ? "= " + m.set : (m.delta > 0 ? "+" : "") + m.delta) +
                                " " + m.from).join(", ");
    return `<td class="${s.changed ? "stat-mod" : ""}"${why ? ` title="${esc(s.base + " base, " + why)}"` : ""}>${s.value || "-"}</td>`;
  };
  const changed = keys.filter(k => EF.statOf(u, k).changed);
  const mount = EF.hasMount(u) ? u.mount : null;
  const troop = troopType(u.troop);
  const alive = Math.max(0, (u.models || 1) - (u.lost || 0));

  /* la larghezza della prima colonna va dichiarata nella riga di
     intestazione: con `table-layout:fixed` sono i primi td a decidere,
     e una `width` messa piu' sotto non la guarda nessuno */
  return `<table class="stats"><thead><tr>${mount ? `<th class="who"></th>` : ""}${keys.map(k => `<th>${k}</th>`).join("")}</tr></thead>
    <tbody>
      <tr>${mount ? `<th class="who">cavaliere</th>` : ""}${keys.map(cell).join("")}</tr>
      ${mount ? `<tr class="mount-row"><th class="who">${esc(mount.name || "cavalcatura")}</th>${
        keys.map(k => `<td>${EF.statOf(u, k, { who:"mount" }).value || "-"}</td>`).join("")}</tr>` : ""}
    </tbody></table>
    ${changed.length ? `<p class="note stat-why">${changed.map(k => esc(EF.explain(u, k))).join(" · ")}</p>` : ""}
    <p class="note">${esc(troop.unknown ? "tipo di truppa non riconosciuto" : troop.label)} · Forza d'Unità ${
      unitStrength(u.troop, u.us, u.models, alive, stat((u.stats || {}).W))}${troop.unknown ? "" : troop.daVerificare ? " (tabella p. 105, cella da verificare)" : ""}</p>`;
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
        ${photoForUnit(u) ? `<img class="insp-photo" src="${photoForUnit(u)}" alt="${esc(u.name)}">` : ""}
        <div class="readout"><span>Catalogo</span><b>${catLabel(u)}</b></div>
        <p class="note">${u.catId
          ? "Le anteprime vengono dalla voce di catalogo. Per cambiare la foto apri la scheda Catalogo."
          : "Nessun aggancio: apri la scheda Liste per collegare questa unit\u00e0 a una voce del catalogo."}</p>
      </div>
      ${statsBlockHTML(u)}
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
        ${(() => { const r = magicReachOf(u); return r
          ? `<div class="readout"><span>Magia più lunga</span><b>${r.range}″ · ${esc(r.name)}</b></div>` : ""; })()}
        <div class="readout"><span>Stato</span><b style="color:var(--${st.key === "idle" ? "muted" : st.key})">${st.text}</b></div>
      </div>
      ${movementBlockHTML(u)}
      ${tagsBlockHTML(u)}
      ${countersBlockHTML(u, "unit")}
      ${u.rules.length ? `<div class="tags">${u.rules.map(r => `<span class="tag">${esc(r)}</span>`).join("")}</div>` : ""}
      ${u.weapons.length ? `<p class="note"><b>Armi:</b> ${u.weapons.map(w => esc(w.name) + (w.range && w.range !== "-" ? ` (${esc(w.range)})` : "")).join(" · ")}</p>` : ""}
      ${defenceHTML(u)}
      ${shootingHTML(u)}
      ${chargeHTML(u)}
      ${psychHTML(u)}
      ${armyBlockHTML(u)}
      ${magicHTML(u)}
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
  $("#i-regen").addEventListener("change", e => upd(() => { u.regen = +e.target.value || 0; }, "rigenerazione"));
  for (const b of host.querySelectorAll("[data-duel]"))
    b.addEventListener("click", () => {
      const foe = state.units.find(x => x.uid === +b.dataset.duel);
      if (foe) openDuel(u, foe);
    });
  /* La bandierina gioca la carica per intero: dichiarazione, reazione,
     tiro e contatto. Ogni passo e' un'azione del motore e si annulla
     da solo. */
  for (const b of host.querySelectorAll("[data-charge]"))
    b.addEventListener("click", () => runCharge(u, b.dataset.charge));
  for (const b of host.querySelectorAll("[data-back]"))
    b.addEventListener("click", () => runBackward(u, b.dataset.back));
  /* I test di psicologia della Tappa 5: ognuno tira dal vassoio, scrive
     la riga e — se va male — porta la conseguenza sul tavolo. */
  for (const b of host.querySelectorAll("[data-psych]"))
    b.addEventListener("click", () => runPsychButton(u, b.dataset.psych));
  /* i gesti d'esercito da una volta per partita (Tappa 5 bis) */
  for (const b of host.querySelectorAll("[data-army]"))
    b.addEventListener("click", () => runArmyAbility(u, b.dataset.army));
  /* la magia (Tappa 6): il mago si prepara, genera, lancia, dissolve */
  wireMagic(host);
  /* L'arco tira la raffica per intero: dichiarazione, dadi, perdite,
     Panico. La sagoma e il bombardamento sono l'altra meta' della
     Tappa 4, quella che non tira per colpire. */
  for (const b of host.querySelectorAll("[data-shoot]"))
    b.addEventListener("click", () => runShot(u, b.dataset.shoot));
  /* il mirino: la seconda pressione sullo stesso gesto lo spegne */
  for (const b of host.querySelectorAll("[data-aim]"))
    b.addEventListener("click", () => {
      const [kind, casterUid, spellId] = b.dataset.aim.split("|");
      const a = aimNow();
      const same = !!a && a.uid === u.uid && a.kind === kind && (kind !== "spell" || a.spellId === spellId);
      aimPick = same ? { uid: u.uid, off: true }
                     : { uid: u.uid, kind, casterUid: casterUid ? +casterUid : null, spellId: spellId || null };
      if (!same) toast("Mira: muovi il puntatore sul tavolo e fai clic su un bersaglio. Esc per togliere.");
      renderInspector(); drawBoard();
    });
  for (const b of host.querySelectorAll("[data-tmpl]"))
    b.addEventListener("click", () => putTemplate(u, b.dataset.tmpl));
  for (const b of host.querySelectorAll("[data-bombard]"))
    b.addEventListener("click", () => runBombard(u));
  for (const b of host.querySelectorAll("[data-tmpl-off]"))
    b.addEventListener("click", () => act("togli la sagoma", () => setTemplate(null)));
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
  /* Dentro un reggimento ci va chi al tavolo ci starebbe: i personaggi
     e ogni pezzo da un modello solo, categoria del roster o no. Il file
     della lista non chiama «character» il boss senza slot, e prima
     quell'unita' non compariva da nessuna parte. */
  const free  = host ? [] : FM.joinCandidates(state.units, u);
  const hosts = host ? [] : FM.hostCandidates(state.units, u);
  /* Due tendine e non una: prima l'aggancio si faceva solo aprendo il
     reggimento, e chi partiva dal personaggio non trovava niente. */
  const pick = (id, label, list, empty) => list.length
    ? `<label class="field">${label}
        <select id="${id}">
          <option value="">— nessuno —</option>
          ${list.map(c => `<option value="${c.uid}">${esc(c.name)}${
            FM.isCharacter(c) ? "" : (c.models || 1) === 1 ? " · 1 modello" : ` · ${c.models} mod.`}</option>`).join("")}
        </select></label>`
    : `<p class="note">${empty}</p>`;
  /* La tendina vuota spariva e basta: adesso dice chi ha lasciato
     fuori e perche', che e' la domanda che si fa chi non trova il suo
     personaggio nell'elenco. */
  const why = list => list.length
    ? " Restano fuori: " + list.map(r => `${esc(shortName(r.name))} (${esc(r.why)})`).join(", ") + "."
    : "";
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
      ${host ? `
        <div class="readout"><span>Unita a</span><b>${esc(shortName(host.name))}</b></div>
        <button class="btn tiny" id="i-leave" style="width:100%">Sgancia dal reggimento</button>` : ""}
      ${chars.length ? `<div class="readout"><span>Personaggi dentro</span><b>${chars.map(c => esc(shortName(c.name))).join(", ")}</b></div>` : ""}
      ${host ? "" : FM.canJoin(u) ? (chars.length
        ? `<p class="note">Sgancia ${chars.map(c => esc(shortName(c.name))).join(", ")} e poi potrai unire questa a un reggimento: dentro un reggimento non ci va un pezzo che ne contiene un altro.</p>`
        : pick("i-host", "Unisci questa a un reggimento", hosts,
               "Nessun reggimento disponibile in questo esercito." + why(FM.hostRefusals(state.units, u)))) : ""}
      ${host || (!free.length && FM.canJoin(u) && !chars.length) ? ""
        : pick("i-join", "Unisci un personaggio o un modello singolo", free,
               "Nessun pezzo libero da unire: dentro un reggimento ci vanno i personaggi e le unità da un modello solo." + why(FM.joinRefusals(state.units, u)))}
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
  const into = $("#i-host");
  if (into) into.addEventListener("change", e => {
    const h = state.units.find(x => x.uid === +e.target.value);
    if (h) upd(() => FM.joinUnit(u, h), "unisci " + shortName(u.name));
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
  /* Il numero che conta non e' la linea d'aria: e' quello che il
     Movimento paga davvero, ruota compresa (p. 124). Un reggimento
     non va in diagonale, e la diagonale che l'app disegnava costava
     zero pollici di troppo. */
  const cost = MV.costFrom(u, unitW(u));
  const band = mv && b ? MV.bandOf(u, cost ? cost.cost : mv.dist) : null;
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
        <div class="readout"><span>Speso dall'ancora</span>
          <b style="color:${band ? band.color : "var(--ink)"}">${(cost ? cost.cost : mv.dist).toFixed(1)}″${
            b ? ` di ${b.move}″` : ""}</b></div>
        ${cost && cost.plan.legs.length ? `
          <p class="note">${esc(cost.plan.label)}: ${cost.plan.legs.map(l =>
            /* il numero non si ripete: «3″ all'indietro» dice già i
               pollici percorsi, e accanto ci va solo quello che
               costano quando è un altro numero */
            `${esc(l.label)}${Math.abs(l.cost - l.inches) > 0.05 || l.id === "wheel"
              ? ` <b>${l.cost.toFixed(1)}″</b>` : ""}`).join(" · ")}${
            cost.plan.note ? ` — ${esc(cost.plan.note)}` : ""}</p>
          ${cost.dist !== cost.cost ? `<p class="note dim">Il metro fra l'ancora e adesso dice ${cost.dist.toFixed(1)}″: la differenza è la ruota, che si paga (p. 124).</p>` : ""}
          ${cost.plans.length > 1 ? `<p class="note dim">Altri modi: ${cost.plans.slice(1).map(p =>
            `${esc(p.label)} ${p.cost.toFixed(1)}″`).join(" · ")}.</p>` : ""}`
        : ""}
        ${band && band.key !== "none" ? `<p class="note">${esc(band.label)} — il conto parte dall'ancora, non dal percorso camminato.</p>` : ""}
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
  /* Tre reti distinte, nell'ordine in cui si tirano: l'armatura la
     buca la perforazione, le altre due no. La rigenerazione arriva dal
     file quando c'e' scritta, e si corregge qui come le altre. */
  return `
    <div class="grid3">
      <label class="field">Armatura${saveSelect("i-armour", u.armour)}</label>
      <label class="field">Salv. speciale${saveSelect("i-ward", u.ward)}</label>
      <label class="field">Rigenera${saveSelect("i-regen", u.regen)}</label>
    </div>`;
}

/* ---- il punteggio del tiro, come si dice al tavolo ----
   «4+», oppure «6·4» quando serve un 7+ e il 6 va seguito da un
   secondo dado (p. 139). Toccandolo si apre la tabella con la stessa
   Abilita' Balistica e gli stessi modificatori spuntati: quelli che la
   scheda non nomina finiscono fra gli altri. */
const hitText = f => f.hitNeed >= 7 ? "mai" : f.hitThen ? `6·${f.hitThen}` : f.hitNeed + "+";
const CHART_MOD = { long:"long", moved:"moved", standAndShoot:"sns", soft:"partial", hard:"full" };
function shootChart(f){
  const mods = {};
  let other = 0;
  for (const m of (f.mods && f.mods.list) || []){
    if (CHART_MOD[m.id]) mods[CHART_MOD[m.id]] = true;
    else other += m.v || 0;
  }
  if (other) mods.other = other;
  return { tab:"shoot", bs: f.bs, mods };
}

/* ---- che cosa arriva a tiro ----
   La domanda non e' "quanto e' lontano" ma "lo prendo?": serve sapere
   insieme gittata, arco, linea di vista e riparo. Se manca uno dei
   quattro il colpo non parte, e la riga dice quale. */
function shootingHTML(u){
  const plan = shootPlanFor(u);
  if (!plan) return "";
  const rows = plan.rows.slice(0, 5);
  const cap = SH.shooterCap({ models: u.models, lost: u.lost || 0, frontage: u.frontage,
                              loose: !!u.loose, volley: !!plan.rules.flags.volleyFire && !plan.moved,
                              hill: plan.hill });
  /* Le regole d'arma che l'app non sa applicare fino in fondo lo
     dicono qui, accanto al numero che influenzerebbero: al tavolo e'
     l'unico posto in cui una riga del genere si legge davvero. */
  const dubbie = plan.rules.applied.filter(a => a.daVerificare);
  return `
    <div>
      <div class="readout"><span>Tiro${plan.weapon ? " · " + esc(plan.weapon.name) : ""}</span>
        <b>${plan.range}″ · fino a ${cap} tiri</b>${aimButton(u, "shoot")}</div>
      ${plan.gate.can ? "" : `<p class="note" style="color:var(--warn)">Non tira: ${esc(plan.gate.why.join("; "))} (p. ${SH.PAGE.who}).</p>`}
      ${rows.length ? rows.map(r => {
        if (!r.canShoot){
          const why = r.blocked ? `dietro ${esc(r.blockedBy.toLowerCase())}`
                    : !r.inArc ? "fuori arco frontale" : "fuori gittata";
          return `<div class="readout near dim"><span>${esc(shortName(r.unit.name))} · ${why}</span>
                    <b>${r.dist.toFixed(1)}″</b></div>`;
        }
        const f = shotOn(u, r, plan);
        const why = f.mods.list.map(m => `${m.v} ${m.why}`).join(", ");
        /* Quanti tirano, e perche' gli altri no: sono le tre cause del
           §2 di `shoot.js`, contate sul tavolo vero. */
        const out = f.survey.out;
        const fuori = [
          out.rank  ? `${out.rank} in coda` : "",
          out.range ? `${out.range} fuori gittata` : "",
          out.sight ? `${out.sight} non lo vedono` : "",
        ].filter(Boolean).join(", ");
        return `<div class="readout near"><span>${esc(shortName(r.unit.name))} · ${r.dist.toFixed(1)}″${why ? ` <span class="dim">(${why})</span>` : ""}</span>
                  <b style="color:var(--ok)">${chartLink(hitText(f), shootChart(f))} · ${f.kills.toFixed(1)}</b>
                  <button class="btn tiny shoot-go" data-shoot="${r.unit.uid}"
                          title="Tira su ${esc(r.unit.name)}: ${f.shots} tiri, ${hitText(f)} per colpire">🏹</button>
                </div>
                <p class="note">${f.shots} tir${f.shots === 1 ? "o" : "i"} da ${f.survey.n} modell${f.survey.n === 1 ? "o" : "i"}${fuori ? ` · ${esc(fuori)}` : ""}${
                  f.survey.coverWhy ? ` · riparo: ${esc(f.survey.coverWhy)} (p. ${SG.PAGE.cover})` : ""}${
                  f.survey.hill ? ` · dalla collina tira anche la seconda fila (p. ${SH.RANK_PAGES.hill})` : ""}${
                  f.survey.volleyOff ? ` · ${esc(f.survey.volleyOff)}` : ""}</p>`;
      }).join("") : `<p class="note">Nessun nemico sul tavolo.</p>`}
      ${plan.machine ? machineHTML(u, plan) : ""}
      ${dubbie.length ? `<p class="note">Da verificare sul libro: ${dubbie.map(a =>
          `<b>${esc(a.name)}</b> — ${esc(a.daVerificare)}`).join(" · ")}</p>` : ""}
      ${plan.shots.nota ? `<p class="note">${esc(plan.shots.nota)}</p>` : ""}
      <p class="note">L'arco apre il tiro: i modelli che tirano davvero, i modificatori, i dadi e le perdite, con il test di Panico oltre un quarto (p. ${SH.PAGE.panic}).</p>
    </div>`;
}

/* ---- la macchina da guerra ----
   Non tira per colpire: piazza una sagoma e devia. I tre pulsanti sono
   le tre sagome del manuale (p. 95); il quarto gesto e' il
   bombardamento, che le mette insieme — si sceglie il punto, si tira
   la deviazione, la sagoma si sposta e sotto ci finisce chi ci
   finisce. */
function machineHTML(u, plan){
  const t = state.extras && state.extras.template;
  const mine = t && t.by === u.uid ? t : null;
  return `
    <div class="readout"><span>Macchina da guerra</span><b>p. ${SH.PAGE.machines}</b></div>
    <div class="grid3">
      ${SH.TEMPLATE_IDS.map(id => `<button class="btn tiny tmpl-go" data-tmpl="${id}"
          title="${esc(SH.TEMPLATES[id].label)}">${id === "teardrop" ? "goccia" : SH.TEMPLATES[id].d + "″"}</button>`).join("")}
    </div>
    <div class="grid2">
      <button class="btn tiny" data-bombard="1" ${mine ? "" : "disabled title=\"Prima posa una sagoma\""}>Bombarda</button>
      <button class="btn tiny" data-tmpl-off="1" ${mine ? "" : "disabled"}>Togli la sagoma</button>
    </div>
    <p class="note">${mine
      ? `Sagoma ${esc(SH.TEMPLATES[mine.id].label.toLowerCase())} sul tavolo. «Bombarda» tira la deviazione, la sposta e conta chi resta sotto: sotto del tutto è colpito, sotto in parte a ${SH.PARTIAL_NEED}+ (p. ${SH.PAGE.templates}).`
      : `Posa una sagoma sul bersaglio, poi bombarda. Il Mancato Colpo tira sulla tabella di p. ${SH.MISFIRE.page}: con 1 la macchina è distrutta, con 2-4 si guasta, con 5-6 salta il tiro.`}</p>`;
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
      <p class="note">${{ open:"Terreno aperto", difficult:"Terreno difficile", obstacle:"Ostacolo", blocked:"Impassabile" }[cfg.pass]}${cfg.los === "crest" ? " · blocca la vista a chi non ci sta sopra, e da sopra si vede oltre le unità (p. 271)"
        : cfg.los ? " · blocca la linea di vista" : ""}</p>
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
    /* e la magia, che e' una gittata come le altre: il Solar Engine di
       un Bastiladon arriva a ventiquattro pollici mentre il suo
       giavellotto ne fa otto, e il cerchio mostrava gli otto */
    const reach = magicReachOf(selUnit);
    if (reach) ring(reach.range, "6 3 1 3", .6, `${shortName(reach.name)} ${reach.range}″`);
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

  /* e sopra i modelli ci va anche la sagoma della macchina da guerra,
     per la stessa ragione: al tavolo il pezzo di plastica si appoggia
     sulle teste, e quello che si vuole vedere e' chi ci sta sotto */
  drawTemplate(svg, g);

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
    /* Lo stato dell'unità, in due parole sopra la testa.
       È il marcatore che al tavolo si appoggia accanto al reggimento:
       chi è in preda alla Stupidità non si muove, non tira e non
       lancia per tutto il turno, e finché la cosa viveva solo dentro
       l'ispettore bisognava selezionare l'unità per scoprirlo — cioè
       proprio quando avevi già deciso di muoverla.
       Generico apposta: la Stupidità è la prima riga, non l'unica. */
    if (state.game.on){
      const marks = stateMarks(u);
      if (marks.length){
        const yb = Math.min(...corners(u).map(p => p[1])) - (EX.woundsOf(u) ? 24 : 6);
        const t = g(lab, "text", { x:u.x, y:yb, "text-anchor":"middle", "font-size":16,
                                   "font-weight":"600",
                                   fill:"var(--warn)", stroke:"var(--paper)", "stroke-width":"2.6",
                                   "paint-order":"stroke" });
        t.textContent = marks.map(m => m.text).join(" · ");
      }
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
  drawAim(svg, g);

  /* ---- il pollice mentre si trascina (p. 118) ----
     Una riga rossa verso ogni nemico nuovo entro 1″: si vede prima di
     lasciare il pezzo, non dopo. */
  if (drag && drag.moved && drag.near0){
    const layer = g(svg, "g", { "pointer-events":"none" });
    for (const n of tooNearFoes(drag.obj).filter(x => !drag.near0.has(x.unit.uid))){
      const pts = closestPoints(corners(drag.obj), corners(n.unit));
      g(layer, "line", { x1:pts.a[0], y1:pts.a[1], x2:pts.b[0], y2:pts.b[1], stroke:"var(--bad)",
                         "stroke-width":3, "stroke-dasharray":"5 4" });
      const t = g(layer, "text", { x:(pts.a[0] + pts.b[0]) / 2, y:(pts.a[1] + pts.b[1]) / 2 - 8,
                                   "text-anchor":"middle", "font-size":14, fill:"var(--bad)" });
      t.textContent = n.gap < 0.05 ? "a contatto senza carica" : `${fmtIn(Math.round(n.gap * 10) / 10)}″ < 1″`;
    }
  }

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
  svgEl.style.cursor = (state.zoning || state.measure || aimNow()) ? "crosshair" : "";

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
/* La sagoma della macchina da guerra: cerchio o goccia, il crocino nel
   punto che si e' scelto e i modelli sotto segnati uno per uno —
   pieno chi e' sotto del tutto, vuoto chi e' sotto solo in parte e
   dovra' tirare il suo 4+ (p. 95). E' la riga che il §9 del piano
   chiede per dire fatta questa tappa: la sagoma si sposta e i modelli
   sotto si elencano. */
function drawTemplate(svg, g){
  const t = templateNow();
  if (!t) return;
  const shape = SH.placeTemplate(t.id, [t.x, t.y], t.angle || 0);
  if (!shape) return;
  const layer = g(svg, "g", { "pointer-events":"none" });
  const col = "var(--warn)";
  if (shape.kind === "circle")
    g(layer, "circle", { cx:shape.c[0], cy:shape.c[1], r:shape.r, fill:col, opacity:.18,
                         stroke:col, "stroke-width":2, "stroke-opacity":.8 });
  else
    g(layer, "polygon", { points: shape.poly.map(p => p.join(",")).join(" "), fill:col,
                          opacity:.18, stroke:col, "stroke-width":2, "stroke-opacity":.8 });
  /* il crocino del centro: una sagoma senza centro non si appoggia */
  for (const [dx, dy] of [[-7, 0], [0, -7]])
    g(layer, "line", { x1:t.x - dx, y1:t.y - dy, x2:t.x + dx, y2:t.y + dy,
                       stroke:col, "stroke-width":1.6, opacity:.9 });

  const cells = [];
  for (const foe of state.units){
    if (!foe.placed || foe.dead || isJoined(foe)) continue;
    for (const c of FM.worldCells(foe, layoutOf(foe))) cells.push(c);
  }
  const under = SH.modelsUnder(cells.map((c, i) => ({ ...c, cell: i })), shape);
  const mark = (list, fill) => {
    for (const i of list){
      const c = cells[i];
      g(layer, "circle", { cx:c.wx, cy:c.wy, r:5, fill, stroke:"var(--paper)", "stroke-width":1.4 });
    }
  };
  mark(under.full, "var(--bad)");
  mark(under.partial, "none");
  const txt = g(layer, "text", { x:t.x, y:t.y - (shape.kind === "circle" ? shape.r : 0) - 10,
                                 "text-anchor":"middle", "font-size":15, fill:col });
  txt.textContent = `${under.full.length} sotto · ${under.partial.length} a ${SH.PARTIAL_NEED}+`;
}

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

  /* quanto e' costato arrivare fin qui: la ruota si paga, e il numero
     che conta e' quello, non la linea d'aria (p. 124) */
  const cost = MV.costFrom(u, w);
  const spent = cost ? cost.cost : mv.dist;

  /* la riga fra dov'eri e dove sei, con il numero al centro. Il colore
     è un semaforo, non un arbitro: l'unità si muove lo stesso. */
  const band = MV.bandOf(u, spent);
  const c = band.key === "none" ? col : band.color;

  /* Il percorso che il reggimento farebbe davvero. La linea dritta fra
     due punti e' una diagonale, e le diagonali al tavolo non esistono:
     si ruota per puntare e poi si cammina. Disegnare la diagonale
     mentre il conto dice un altro numero e' il modo piu' rapido di far
     credere che il conto sia sbagliato. */
  const legs = cost ? cost.plan.legs : [];
  const walks = legs.some(l => l.id === "forward") && legs.some(l => l.id === "wheel");
  if (walks){
    /* il gomito: dall'ancora si punta verso l'arrivo, e da li' si va
       dritti. Sono due segmenti, e il secondo e' la corsa vera. */
    const dx = u.x - a.x, dy = u.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const nose = (unitD(u) / 2) || 0;
    const ex = a.x + (dx / d) * Math.min(nose, d * .35);
    const ey = a.y + (dy / d) * Math.min(nose, d * .35);
    g(layer, "path", { d:`M ${a.x} ${a.y} L ${ex} ${ey} L ${u.x} ${u.y}`,
                       stroke:c, "stroke-width":2.6, "stroke-linejoin":"round" });
    /* l'arco della ruota, attorno all'ancora: e' il pezzo di movimento
       che si paga senza avanzare di un passo */
    const wheelIn = legs.filter(l => l.id === "wheel").reduce((s, l) => s + l.cost, 0);
    if (wheelIn > 0.05){
      const rr = Math.max(18, w / 2);
      g(layer, "circle", { cx:a.x, cy:a.y, r:rr, stroke:c, "stroke-width":2,
                           "stroke-dasharray":"4 4", opacity:.85 });
      const tw = g(layer, "text", { x:a.x, y:a.y - rr - 6, "text-anchor":"middle",
                                    "font-size":13, fill:c,
                                    stroke:"var(--paper)", "stroke-width":"3", "paint-order":"stroke" });
      tw.textContent = `ruota ${wheelIn.toFixed(1)}″`;
    }
  } else {
    g(layer, "line", { x1:a.x, y1:a.y, x2:u.x, y2:u.y, stroke:c, "stroke-width":2.6 });
  }
  g(layer, "circle", { cx:u.x, cy:u.y, r:4.5, fill:c, stroke:"none" });

  /* il cartellino a metà strada, scostato di lato: in mezzo alla riga
     finiva sopra il pezzo o sopra la sua targhetta, cioè proprio sopra
     le due cose che stavi guardando */
  const dx = u.x - a.x, dy = u.y - a.y, len = Math.hypot(dx, dy) || 1;
  const mx = (a.x + u.x) / 2 - (dy / len) * 34;
  const my = (a.y + u.y) / 2 + (dx / len) * 34;
  const txt = b ? `${spent.toFixed(1)}″ di ${b.move}″` : `${spent.toFixed(1)}″`;
  const sub = b
    ? (spent <= b.move ? `restano ${(b.move - spent).toFixed(1)}″` : band.label)
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
      /* La categoria del §8 del piano: e' quella che dice se rallenta,
         se fa tenere il dado peggiore, se chiede il test di terreno
         pericoloso e se toglie i ranghi. `pass` non basta piu' — non
         distingue un bosco da una palude — e la carica ha bisogno di
         saperlo. */
      cat: catOf(t),
      circle, box:b, poly:boxCorners(b),
      contains: p => distPointToBox(p, b, circle) < 0.01,
    };
  });
}
const sightPieces = () => terrainPieces().filter(p => p.blocks);

const enemiesOf = u => state.units.filter(o => o.army !== u.army && o.placed && !o.dead && !isJoined(o));

/* ---- la vista del libro (`sight.js`) ----
   Le unita' sul tavolo come ostacoli, con le basette e la collina sotto
   i piedi. Si rifa' solo quando cambia qualcosa da cui dipende —
   posizioni, modelli in piedi, formazione, terreno — perche' il pannello
   la chiede una volta per nemico e il disegno una volta per pixel. */
let sightCache = { key: "", ctx: null };
function sightNow(){
  const key = state.units.map(o => {
    const f = FM.ensureFormation(o);
    return [o.uid, Math.round(o.x), Math.round(o.y), o.rot || 0, o.placed ? 1 : 0, o.dead ? 1 : 0,
            o.loose ? 1 : 0, effModels(o), o.frontage, f.mode, f.preset, f.spacing,
            FM.joinedHost(o) ?? "", (o.fallen || []).join(".")].join(":");
  }).join("|") + "#" + state.terrain.map(t =>
    [t.kind, Math.round(t.x), Math.round(t.y), t.w, t.h, t.rot || 0].join(":")).join("|");
  if (sightCache.key === key && sightCache.ctx) return sightCache.ctx;
  const terrain = terrainPieces();
  const units = state.units.filter(o => o.placed && !o.dead && !isJoined(o)).map(o => {
    const lay = layoutOf(o), cells = FM.worldCells(o, lay);
    return { uid: o.uid, unit: o, name: o.name, poly: corners(o), cells, front: lay.front,
             loose: !!o.loose, hill: SG.hillState(cells.map(c => [c.wx, c.wy]), terrain) };
  });
  sightCache = { key, ctx: { terrain, units, byUid: new Map(units.map(x => [x.uid, x])) } };
  return sightCache.ctx;
}

/* i modelli che guardano: la prima fila, le prime due sulla collina
   (p. 143); in ordine sparso tutti */
const eyesOf = s => s.cells.filter(c => s.loose || SH.rankOf(c.cell, s.front) < 1 + (s.hill === "all" ? 1 : 0));

/* Chi vede chi, come dice il libro: unita' in mezzo, colline, boschi,
   riparo contato sui modelli coperti. `null` quando uno dei due non e'
   un pezzo del tavolo (un personaggio unito, un'unita' ritirata). */
function lookFor(u, t){
  const S = sightNow(), me = S.byUid.get(u.uid), th = S.byUid.get(t.uid);
  if (!me || !th) return null;
  return SG.unitSight({
    eyes: eyesOf(me).map(c => [c.wx, c.wy]), targets: th.cells,
    terrain: S.terrain, others: S.units.filter(x => x !== me && x !== th),
    fromHill: me.hill, toHill: th.hill,
  });
}

export function surveyFor(u){
  if (!u || !u.placed) return [];
  return survey(u, enemiesOf(u), { cornersOf: corners, boxOf, sightPieces: sightPieces(), inch });
}

/* 8,5 si scrive con la virgola; 8 si scrive 8 e basta */
const fmtIn = n => (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace(".", ",");
const flies = u => (u.rules || []).some(r => /\bfly\b|volan|vola\b/i.test(r));

/* Il piano di tiro: l'arma piu' lunga, e per ogni nemico se lo si vede,
   se e' nell'arco, a che gittata e dietro che riparo.

   Dalla Tappa 4 ci sono due cose in piu', e sono le due che cambiano il
   conto. La prima e' il CANCELLO (p. 137): chi ha caricato, marciato,
   e' a contatto o sta fuggendo non tira, e adesso l'app lo sa da se'
   invece di lasciarlo alla memoria. La seconda e' che i modelli che
   tirano si contano uno per uno, e il conto sta nella riga del singolo
   bersaglio perche' dipende da lui: lo stesso reggimento ne ha otto che
   vedono il bosco a sinistra e tre che vedono la collina a destra. */
export function shootPlanFor(u){
  if (!u || !u.placed) return null;
  const weapon = CB.rangedWeapons(u)[0] || null;
  const range = weapon ? stat(weapon.range) : (u.maxRange || 0);
  if (!range) return null;
  const pieces = terrainPieces();
  const rows = shootingSurvey(u, enemiesOf(u), {
    cornersOf: corners, boxOf, pieces, range, inch, look: t => lookFor(u, t),
  });
  const me = sightNow().byUid.get(u.uid);
  /* Le regole del tiro stanno sull'unita' e sull'arma, e vanno lette
     insieme: il giavellotto porta «Move & Shoot», l'arco corto porta
     «Volley Fire», e nessuna delle due sta fra le regole dell'unita'. */
  const rules = SH.readShooting(
    [...(u.rules || []), ...splitWeaponRules(weapon && weapon.rules)], u.ruleText);
  const lay = layoutOf(u);
  const mv = MV.movedFrom(u);
  const move = MV.moveOf(u);
  const charged = !!(u.moved && u.moved.kind === "charge") || !!u.charged;
  /* La marcia non e' un campo: e' l'ancora di movimento della Tappa 2
     che dice di essere andati oltre il Movimento di profilo. Senza M
     non si dichiara niente, come sempre.

     Il confronto si fa con quello che il movimento e' **costato**,
     ruota compresa: un reggimento largo che gira di novanta gradi e
     poi cammina quattro pollici ha marciato, anche se il metro fra
     l'ancora e adesso ne dice quattro (p. 124). */
  const spent = MV.costFrom(u, lay.w);
  const used = spent ? spent.cost : (mv ? mv.dist : 0);
  const marched = !charged && !!mv && !mv.still && move > 0 && used > move + 0.01;
  return {
    weapon, range, rows, rules, pieces,
    /* tutta sulla collina: tira anche la seconda fila (p. 143) */
    hill: !!me && me.hill === "all",
    cells: FM.worldCells(u, lay), front: lay.front,
    moved: !!(mv && !mv.still), marched, charged,
    shots: SH.shotsPerModel(rules.flags),
    machine: troopType(u.troop).id === "warMachine",
    gate: SH.canShoot({
      charged, marched, engaged: engagedNow(u), fleeing: !!u.fled,
      moved: !!(mv && !mv.still), weaponFlags: rules.flags,
      stupid: psychFor(u).stupid,
    }),
  };
}

/* Quanto costa un colpo su quel bersaglio, modificatori spiegati uno
   per uno: e' la riga che dice *perche'* serve un 5. E quanti modelli
   lo tirano davvero, che e' la riga che dice perche' sono otto e non
   sedici. */
export function shotOn(u, row, plan){
  /* Il bersaglio va passato come poligono del tavolo, non come unita':
     l'unita' non ha larghezza e profondita' sue — le ha la formazione —
     e con l'oggetto grezzo ogni modello risultava fuori gittata. */
  const S = sightNow(), me = S.byUid.get(u.uid), th = S.byUid.get(row.unit.uid);
  const survey = SH.shooterSurvey({
    cells: plan.cells, target: { poly: corners(row.unit), cells: th ? th.cells : null },
    pieces: plan.pieces, range: plan.range, front: plan.front,
    loose: !!u.loose, volley: !!plan.rules.flags.volleyFire, moved: plan.moved,
    others: S.units.filter(x => x !== me && x !== th),
    fromHill: me ? me.hill : "", toHill: th ? th.hill : "",
  });
  const mods = SH.modsFor({
    survey, shooter: { ...u, movedThisTurn: plan.moved }, target: row.unit,
    weaponFlags: plan.rules.flags,
  });
  const weapon = plan.weapon || { range: String(plan.range), S: "", ap: "" };
  const shots = survey.n * plan.shots.n;
  return { survey, mods, shots,
           ...CB.shootForecast(u, row.unit, { weapon, mods: mods.total, shots }) };
}

/* ============================================================
   7c · LA CARICA (Tappa 2)
   La geometria della carica sta in `charge.js` e non sa niente del
   tavolo: qui si tiene insieme quello che le serve — la scatola di
   chi carica, quelle dei nemici, i pezzi di terreno con la loro
   categoria — e si riporta indietro quello che ne esce.

   Il pannello risponde a una domanda sola, quella che al tavolo si fa
   con il metro in mano e la testa nel manuale: **questa carica si puo'
   dichiarare, e con che probabilita' arriva?**
   ============================================================ */
const usOf = u => unitStrength(u.troop, u.us, u.models, effModels(u), stat((u.stats || {}).W));
const engagedNow = u => contactsNow().some(c => (c.a === u.uid || c.b === u.uid) && c.enemy);

/* Il caricante e i bersagli nella forma che `charge.js` vuole: nome,
   scatola, poligono. L'unita' vera viaggia dentro `unit`, cosi' chi
   riceve la riga puo' tornare al pezzo sul tavolo. */
const asPiece = u => ({ name:u.name, box: boxOf(u), poly: corners(u), unit:u, us: usOf(u), loose: !!u.loose });

/* ---- la psicologia (Tappa 5) ----
   Il profilo psicologico di un'unita' con i personaggi che le stanno
   uniti, e gli effetti a tempo letti nel momento vero della partita:
   una Stupidita' scaduta non deve fermare piu' nessuno. */
const effNow = () => ({ turn: state.game.turn || 1, side: state.game.army || "A",
                        round: state.game.turn || 1, phaseIndex: state.game.step || 0 });
const psychFor = u => PS.psychOf(u, { joined: attachedOf(u), now: state.game.on ? effNow() : null });

/* I marcatori di stato: quello che, al tavolo, si appoggia accanto al
   reggimento perche' altrimenti ce se ne dimentica.
   Uno per riga di regola, e nessuno di questi impedisce niente: sono
   promemoria con un nome, e il pannello che li ha messi li toglie. */
function stateMarks(u){
  if (!u || !u.placed || u.dead || isJoined(u)) return [];
  const p = psychFor(u);
  const out = [];
  if (p.stupid) out.push({ id:"stupid", text:"STUPIDA" });
  if (u.fled)   out.push({ id:"fled", text:"in fuga" });
  if (u.disordered) out.push({ id:"disordered", text:"disordinata" });
  if (p.frenzy) out.push({ id:"frenzy", text:"frenetica" });
  return out;
}

/* Un test di Paura per turno: l'esito sta sull'unita', con il turno e la
   parte, cosi' l'annulla lo porta via con il resto. */
const fearTested = u => {
  const f = u && u.fearTest;
  return f && f.turn === state.game.turn && f.side === state.game.army ? f : null;
};

/* Il Comando con cui si tira un test: quello del conto dell'assalto,
   che sa della Warband. L'Impetuosita' lo vuole senza. */
function unitLd(u, { forImpetuous = false } = {}){
  const c = CB.combatant(u, { joined: attachedOf(u) });
  if (forImpetuous)
    return { value: c.ldBase, why: c.psych.warband && c.ld !== c.ldBase ? "senza il bonus della Warband" : "" };
  return { value: c.ld, why: c.ldWhy };
}

/* Gli amici entro una distanza, da bordo a bordo: e' la misura del
   Panico, che al tavolo si fa a occhio e si sbaglia di mezzo pollice
   proprio quando conta. */
function friendsNear(u, inches){
  const poly = corners(u);
  return state.units
    .filter(o => o !== u && o.army === u.army && o.placed && !o.dead && !isJoined(o))
    .map(o => ({ unit:o, name:o.name, dist: inch(polyDistance(poly, corners(o))) }))
    .filter(f => f.dist <= inches + 0.01);
}

const insidePoly = (pt, poly) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/* Le reazioni del bersaglio, con le due frasi che la psicologia
   aggiunge: chi non puo' scegliere la fuga, e chi deve tenere. */
function reactionsOf(r, move){
  const t = r.unit.unit;
  const fl = PS.canFleeReaction(psychFor(t));
  return CH.reactions({
    dist: r.dist, chargerMove: move,
    shots: CB.rangedWeapons(t).length ? CB.shooters(t) : 0,
    engaged: engagedNow(t), fleeing: !!t.fled,
    noFlee: fl.can || fl.hold ? "" : fl.why,
    mustHold: fl.hold ? fl.why : "",
  });
}

export function chargePlanFor(u){
  if (!u || !u.placed || u.dead || isJoined(u)) return null;
  const mb = movementBands(u);
  const move = MV.moveOf(u) || (mb ? mb.move : 0);
  if (!move) return null;                       // senza M non si dichiara niente
  const charger = { ...asPiece(u), move, swift: !!(mb && mb.swift), fly: flies(u) };
  const foes = enemiesOf(u).map(asPiece);
  /* la vista della carica e' la stessa del tiro: unita' in mezzo e
     colline comprese (pp. 103 e 119) */
  const rows = CH.chargeSurvey(charger, foes, { pieces: terrainPieces(), look: t => lookFor(u, t.unit) });
  /* Prima ancora della geometria c'e' lo stato: chi e' in mischia, chi
     sta fuggendo e chi si e' appena radunato non dichiara nessuna
     carica, per quanto bene stia messo sul tavolo (p. 119). */
  const pu = psychFor(u);
  const pre = CH.canCharge({
    engaged: engagedNow(u), fleeing: !!u.fled,
    rallied: !!u.rallied, column: u.formation === "column",
    stupid: pu.stupid,
  });
  return {
    charger, move, swift: charger.swift, pre, psych: pu,
    /* chi deve caricare e chi tira per saperlo (Frenzy, Impetuous): la
       frase compare solo se una carica si puo' davvero dichiarare */
    must: PS.mustCharge({ p: pu, canDeclare: pre.can && rows.some(r => r.can) }),
    march: CH.marchCheck(corners(u), foes.map(f => ({ ...f, fleeing: !!f.unit.fled })),
                         { fly: flies(u) }),
    max: CH.chargeBands(move, charger.swift).max,
    rows: rows.map(r => ({
      ...r,
      unit: r.unit.unit,
      reactions: reactionsOf(r, move),
    })),
  };
}

/* ---- il pannello ----
   Una riga per nemico: quanto e' lontano, cosa serve tirare, quante
   volte su cento arriva, e cosa c'e' in mezzo. Il pulsante gioca la
   carica per intero — dichiarazione, reazione, dadi, spostamento — e
   ogni pezzo finisce nel registro con la sua casella. */
function chargeHTML(u){
  const plan = chargePlanFor(u);
  if (!plan) return "";
  const rows = plan.rows.slice(0, 5);
  return `
    <div>
      <div class="readout"><span>Carica${plan.swift ? " · passo lungo" : ""}</span>
        <b>fino a ${fmtIn(plan.max)}″</b>${aimButton(u, "charge")}</div>
      ${plan.pre.can ? "" : `<p class="note">${esc(u.name)}: ${esc(plan.pre.why.join("; "))}</p>`}
      ${plan.must.why ? `<p class="note" style="color:var(--warn)">${esc(plan.must.why)}.</p>` : ""}
      ${rows.length ? rows.map(r => {
        const t = r.terrain || {};
        const note = [
          t.worstDie ? "dado peggiore" : "",
          t.danger ? "terreno pericoloso" : "",
          t.disorder ? "carica disordinata" : "",
        ].filter(Boolean).join(", ");
        if (!r.can) return `<div class="readout near dim"><span>${esc(shortName(r.target))} · ${esc(r.reasons[0] ? r.reasons[0].text : "")}</span>
                              <b>${r.dist.toFixed(1)}″</b></div>`;
        return `<div class="readout near">
            <span>${esc(shortName(r.target))} · ${r.dist.toFixed(1)}″${
              note ? ` <span class="dim">(${esc(note)})</span>` : ""}</span>
            <b style="color:var(--ok)">${r.need ? r.need + "″ · " + Math.round(r.chance * 100) + "%" : "arriva"}</b>
            <button class="btn tiny charge-go" data-charge="${r.unit.uid}"
                    title="Dichiara la carica su ${esc(r.unit.name)}, tira e portala a contatto">⚑</button>
          </div>`;
      }).join("") : `<p class="note">Nessun nemico sul tavolo.</p>`}
      ${u.charged ? `<div class="readout"><span>Ha caricato</span><b>${esc(u.charged.target)} · ${u.charged.arc}${
        u.disordered ? " · in disordine" : ""}</b></div>` : ""}
      <p class="note">La bandierina gioca la carica: dichiarazione, reazione, tiro e contatto, tutto nel registro.
      Il numero grosso è quanto serve tirare e quante volte su cento esce: due D6 di cui si tiene il maggiore (p. 121).</p>
      <p class="note">${esc(plan.march.why)}</p>
      ${backwardHTML(u)}
    </div>`;
}

/* ---- le quattro mosse all'indietro (pp. 132-134 e 156) ----
   Fuga, cedimento, ripiegamento e inseguimento sono la stessa
   geometria vista quattro volte: una direzione lontano dal nemico piu'
   grosso — in diagonale quando i nemici grossi sono due — e dei
   pollici da fare. Compaiono quando c'e' un nemico da cui allontanarsi,
   perche' senza di lui la direzione non esiste. */
const BACK_KINDS = [
  { id:"give",     label:"Cede 2″" },
  { id:"fallBack", label:"Ripiega" },
  { id:"flee",     label:"Fugge" },
  { id:"pursue",   label:"Insegue" },
];
function backwardHTML(u){
  /* Solo a partita aperta: durante lo schieramento non c'e' niente da
     cui ritirarsi, e quattro pulsanti in piu' sono quattro pulsanti in
     piu' da leggere. */
  if (!state.game.on || !u.placed || u.dead) return "";
  const foes = nearFoes(u);
  if (!foes.length) return "";
  return `
    <div class="chiprow">
      ${BACK_KINDS.map(k => `<button class="btn tiny" data-back="${k.id}"
          title="Lontano da ${esc(foes[0].name)}, come alle pp. 132-134 e 156">${k.label}</button>`).join("")}
    </div>`;
}

/* I nemici da cui ci si allontana: quelli a contatto se ce ne sono,
   altrimenti il piu' vicino. Il manuale lega la direzione alla Forza
   d'Unita', e quella la sa gia' la tabella dei tipi di truppa. */
function nearFoes(u){
  const touching = contactsNow()
    .filter(c => (c.a === u.uid || c.b === u.uid) && c.enemy)
    .map(c => state.units.find(x => x.uid === (c.a === u.uid ? c.b : c.a)))
    .filter(Boolean);
  if (touching.length) return touching.map(asPiece);
  const near = surveyFor(u)[0];
  return near ? [asPiece(near.unit)] : [];
}

const BACK_ACT = { flee:"flee", pursue:"pursue", give:"compulsoryMove", fallBack:"compulsoryMove" };

async function runBackward(u, kind){
  const foes = nearFoes(u);
  if (!foes.length) return toast("Serve un nemico vicino: la direzione si misura da lui.");
  const spec = CH.BACKWARD[kind];
  const action = { type: BACK_ACT[kind], unit:u, army:u.army, why: spec.label.toLowerCase() };

  /* Il cedimento e' di due pollici fissi e non chiede niente; gli
     altri tre passano dal vassoio. Le richieste che il motore conosce
     gia' — la fuga, l'inseguimento — se le fa dare da lui, cosi' gli
     identificatori dei tiri restano quelli del registro. */
  let rolls = null, roll = 0;
  if (kind !== "give"){
    const known = G.engine().asks(action);
    /* Il ripiegamento in ordine non e' una fuga piena: due dadi e si
       tiene il maggiore (p. 134). Il motore non conosce questa mossa,
       quindi la richiesta se la scrive qui — con la regola dentro,
       cosi' il vassoio la spiega mentre i cubi rotolano. */
    const ask = kind === "fallBack"
      ? [{ id:"ripiegamento", kind:"d6", n:2, why:"quanto si ripiega",
           keep:1, drop:"lowest",
           foot:"Dei due si tiene il maggiore (p. 134)." }]
      : known.length ? known
      : [{ id:"ripiegamento", kind:"d6", n:2, why:"quanto si ripiega" }];
    rolls = await G.askRolls(ask, `${spec.label} di ${u.name}`);
    if (!rolls) return;
    roll = Object.values(rolls)[0].total || 0;
  }

  const fb = kind === "flee" ? CB.fleeBonusOf(u) : { mod: 0, why: "" };
  const mv = kind === "pursue"
    ? CH.pursuitMove(boxOf(u), foes[0], { roll })
    : CH.backwardMove(kind, boxOf(u), foes, { roll, mod: fb.mod });
  if (!mv) return;
  const box0 = [u.x, u.y];

  act(spec.label.toLowerCase(), () => {
    G.dispatch({ ...action, text: `${u.name} ${mv.text}${fb.why ? " (" + fb.why + ")" : ""}` }, rolls);
    MV.ensureAnchor(u);
    u.x = mv.to.x; u.y = mv.to.y; u.rot = mv.to.rot;
    u.moved = { kind, inches: mv.inches };
    if (kind === "flee") u.fled = true;
    if (kind === "pursue" || kind === "fallBack") u.fled = false;
    if (mv.nota) G.logLine(u.name + ": " + mv.nota, { army: u.army });
    const fix = CH.nudgeClear({ x:u.x, y:u.y, rot:u.rot }, boxOf(u), enemiesOf(u).map(asPiece));
    if (kind !== "pursue" && fix.moved > 0){
      u.x = fix.x; u.y = fix.y;
      G.logLine(u.name + ": scostata di " + fix.moved.toFixed(1) + "″ per il pollice di p. 118.",
                { army: u.army });
    }
  });
  /* chi fugge passando attraverso i propri amici li manda al Panico
     (Tappa 5) */
  if (kind === "flee") await panicFledThrough(u, box0);
  /* Quanti pollici ha fatto lo deve sapere chi insegue: l'inseguimento
     raggiunge se copre almeno la fuga (p. 156), e senza questo numero
     il confronto non si puo' fare. */
  return mv;
}

/* ---- giocarla ----
   Quattro gesti nell'ordine del manuale, e ognuno e' un'azione del
   motore: si dichiara (p. 119), il bersaglio reagisce (p. 120), si
   tira, e chi arriva si mette a filo. Ogni passo e' annullabile da
   solo, perche' ogni passo passa da `act`. */
async function runCharge(u, uid){
  const plan = chargePlanFor(u);
  const row = plan && plan.rows.find(r => r.unit.uid === +uid);
  if (!row) return;
  const t = row.unit;

  /* 1 · la dichiarazione. La quinta delle sedici caselle e' il posto
     in cui vive: se siamo altrove ci si va, e il registro lo scrive. */
  act("dichiarazione di carica", () => {
    if (state.game.on) G.goStep(4);
    G.dispatch({ type:"declareCharge", unit:u, target:t, army:u.army,
                 text: `${u.name} dichiara la carica su ${t.name} — ${row.why}` });
  });
  if (!row.can) toast("Dichiarata lo stesso: l'app propone, non impedisce.");

  /* 1 bis · la psicologia della dichiarazione (Tappa 5). Prima la Paura
     di chi carica: se il bersaglio la fa ed e' piu' grosso si tira, e
     chi fallisce non carica — resta fermo, ed e' una carica fallita.
     Poi il Terrore di chi e' caricato: se chi carica lo fa, il
     bersaglio tira subito, e chi fallisce deve fuggire. */
  const pu = psychFor(u), pt = psychFor(t);
  const fear = PS.fearCheck({ me: pu, foe: pt, meUS: usOf(u), foeUS: usOf(t),
                              tested: fearTested(u), foeName: t.name });
  if (fear.already && !fear.passed){
    act("carica fallita", () => failCharge(u, t, "ha già fallito il test di Paura in questo turno"));
    return;
  }
  if (fear.must){
    const res = await runPsych(u, "fear", { check: fear, foe: t, at: 4 });
    if (!res) return;
    if (!res.passed){
      act("carica fallita", () => failCharge(u, t, PS.FEAR_FAIL.charge));
      return;
    }
  }
  const canFlee = row.reactions.find(r => r.id === "flee");
  const terror = PS.terrorCheck({ charger: pu, target: pt, canFlee: !!(canFlee && canFlee.can),
                                  chargerName: u.name });
  if (terror.must){
    const res = await runPsych(t, "terror", { check: terror, foe: u, at: 4 });
    if (!res) return;
    if (!res.passed){
      act("reazione alla carica", () => G.dispatch({ type:"chargeReaction", unit:t, kind:"flee", army:t.army,
        text: `${t.name} fallisce il test di Terrore e deve fuggire` }));
      return runFlee(t, u);
    }
  }

  /* 2 · la reazione, che e' del bersaglio e non di chi carica */
  const opts = row.reactions.map(r => ({ id:r.id, label: r.can ? r.label : r.label + " ✕" }));
  const kind = await askPick({
    title: `Reazione di ${t.name}`,
    label: row.reactions.filter(r => !r.can && r.why).map(r => r.label + ": " + r.why).join(" · "),
    options: opts,
  });
  if (!kind) return;
  act("reazione alla carica", () => G.dispatch({ type:"chargeReaction", unit:t, kind, army:t.army }));
  if (kind === "flee") return runFlee(t, u);

  /* 3 · il tiro. Quanti dadi e quale si butta lo ha gia' deciso
     `charge.js` guardando il passo lungo e il terreno attraversato. */
  const spec = row.dice;
  const action = { type:"chargeMove", unit:u, target:t, army:u.army,
                   swift:spec.swift, worst:spec.worst, dice:spec.n,
                   keep:spec.keep, drop:spec.drop, foot:spec.foot };
  let rolls = await G.askRolls(G.engine().asks(action), `Carica di ${u.name}`);
  if (!rolls || !rolls.carica) return;
  /* il Movimento che passa qui e' quello di profilo: il pollice che il
     terreno difficile toglie lo scala chargeOutcome, e scalarlo due
     volte vorrebbe dire una carica corta di un pollice a ogni bosco */
  const outOf = r => CH.chargeOutcome({ dice: r.carica.dice, spec,
                                        move: row.base != null ? row.base : row.move,
                                        dist: row.dist });
  let out = outOf(rolls);
  /* La Warband «puo' ritirare il tiro di carica» (Tappa 5). L'app lo
     propone solo quando serve — la carica e' corta — e il secondo tiro
     vale anche se e' peggiore: un dado non si ritira due volte (p. 93). */
  if (!out.made && pu.warband &&
      await askConfirm(`${u.name} arriva a ${out.reach}″ su ${row.dist.toFixed(1)}″. Warband: ritirare il tiro di carica?`,
                       { title:"Ritiro della carica" })){
    const again = await G.askRolls(G.engine().asks(action), `Carica di ${u.name} · ritiro (Warband)`);
    if (again && again.carica){
      again.carica = { ...again.carica, first: rolls.carica.dice, rerolled: true };
      rolls = again;
      out = outOf(rolls);
    }
  }

  act("mossa di carica", () => {
    if (state.game.on) G.goStep(5);
    G.dispatch({ ...action,
      text: `${u.name} carica ${t.name}: ${out.kept.join(" + ")} = ${out.total}` +
            ` → ${out.reach}″ su ${row.dist.toFixed(1)}″ — ` +
            (out.made ? "a contatto" : `corta di ${out.short}″`) }, rolls);
    MV.ensureAnchor(u);
    if (out.made) landCharge(u, t, row, out);
    else shortCharge(u, t, out);
  });
}

/* Chi arriva si mette a filo della faccia da cui e' venuto, e da li'
   discendono quattro cose che il resto della partita usera': da che
   arco e' arrivato (il bonus di fine combattimento), quanti pollici ha
   percorso (il bonus di Iniziativa della carica, p. 146), se e'
   arrivato in disordine perche' non e' riuscito ad allinearsi, e se ha
   finito la corsa dentro il terreno che toglie i ranghi. Le ultime due
   stanno sulla stessa pagina del manuale (p. 128) ma sono regole
   diverse e costano bonus diversi: tenerle separate e' l'unico modo
   perche' il risultato del combattimento torni. */
function landCharge(u, t, row, out){
  const al = row.align || CH.alignTo(boxOf(u), boxOf(t));
  if (al){ u.x = al.x; u.y = al.y; u.rot = al.rot; }
  u.charged = { target: t.name, uid: t.uid, inches: out.reach, arc: al ? al.arc : "fronte",
                turn: state.game.turn, side: state.game.army };
  u.moved = { kind:"charge", inches: out.reach };

  /* First Charge (Tappa 5): «se la prima carica della partita riesce, il
     bersaglio e' in disordine fino alla fine della fase di combattimento
     di quel turno». Una volta per partita, e lo stato «gia' usata» sta
     sull'unita', dove l'annulla lo trova. */
  if (psychFor(u).firstCharge && EF.spend(u, "firstCharge")){
    t.disrupted = true;
    G.logLine(`${t.name}: in disordine per la prima carica di ${u.name} (First Charge), ` +
              `fino alla fine del corpo a corpo di questo turno.`, { army: u.army });
  }

  /* riesce a mettersi a filo, o c'e' qualcosa in mezzo? */
  const blockedBy = alignBlockers(u, t);
  const dis = CH.disorderedCharge({ aligned: !blockedBy.length, blockedBy });
  u.disordered = dis.disordered;
  if (dis.disordered) G.logLine(u.name + ": " + dis.text, { army: u.army });

  /* i ranghi si contano sui modelli, non sul rettangolo: le basette
     l'app sa dove stanno, e un quarto di modelli nel bosco e' un conto
     esatto invece che una stima */
  const cells = FM.worldCells(u, layoutOf(u)).map(c => [c.wx, c.wy]);
  const dsr = CH.disruptedInTerrain(cells, terrainPieces());
  u.disrupted = dsr.disrupted;
  if (dsr.disrupted) G.logLine(u.name + ": " + dsr.why, { army: u.army });

  /* La carica larga tocca anche il vicino del bersaglio, e il manuale
     vuole che quella carica sia dichiarata: e' l'errore piu' comune
     del movimento, e l'app se ne accorge da sola. */
  const also = CH.alsoInTheWay(corners(u), enemiesOf(u).map(asPiece), { name: t.name });
  if (also.length)
    G.logLine("Arrivando tocca anche " + also.map(a => a.name).join(", ") +
              ": va dichiarata anche quella carica (p. 119).", { army: u.army });
}

/* Cosa impedisce al caricante di mettersi a filo: un altro reggimento
   addosso al punto d'arrivo, o un pezzo che non si attraversa. Il
   bersaglio no: quello lo si sta toccando apposta. */
function alignBlockers(u, t){
  const poly = corners(u);
  const out = [];
  for (const o of state.units){
    if (o === u || o === t || !o.placed || o.dead || isJoined(o)) continue;
    if (polysOverlap(poly, corners(o))) out.push(o.name);
  }
  for (const p of terrainPieces())
    if (p.cat && p.cat.id === "impassable" && polysOverlap(poly, p.poly)) out.push(p.label);
  return out;
}
/* La carica corta non torna indietro: si avanza di quello che i dadi
   hanno detto, e ci si ferma a un pollice buono da chiunque, che e' la
   regola di p. 118. */
function shortCharge(u, t, out){
  const from = boxOf(u);
  const dx = t.x - u.x, dy = t.y - u.y, len = Math.hypot(dx, dy) || 1;
  const step = out.reach * MM;
  const at = { x: u.x + dx / len * step, y: u.y + dy / len * step, rot: u.rot };
  const fix = CH.nudgeClear(at, from, enemiesOf(u).map(asPiece));
  u.x = fix.x; u.y = fix.y;
  u.moved = { kind:"failedCharge", inches: out.reach };
  /* la prima carica della partita e' questa, anche se non e' arrivata */
  if (psychFor(u).firstCharge) EF.spend(u, "firstCharge");
  if (fix.moved > 0)
    G.logLine(u.name + ": scostata di " + fix.moved.toFixed(1) + "″ per il pollice di p. 118.", { army: u.army });
}

/* La fuga come reazione: due dadi, si va via dal piu' grosso e si
   gira le spalle. La direzione e' quella di pp. 154-155, ed e' la
   stessa che useranno il cedimento e il ripiegamento. */
async function runFlee(t, from){
  const rolls = await G.askRolls([{ id:"fuga", kind:"d6", n:2, why:"quanto si fugge" }],
                                 `Fuga di ${t.name}`);
  if (!rolls || !rolls.fuga) return;
  /* la Scurry Away degli Skaven (Tappa 5 bis): +1 al tiro di fuga */
  const fb = CB.fleeBonusOf(t);
  const mv = CH.backwardMove("flee", boxOf(t), [asPiece(from)], { roll: rolls.fuga.total, mod: fb.mod });
  const start = [t.x, t.y];
  act("fuga", () => {
    G.dispatch({ type:"flee", unit:t, army:t.army,
                 text: `${t.name} ${mv.text}${fb.why ? " (" + fb.why + ")" : ""}` }, rolls);
    MV.ensureAnchor(t);
    t.x = mv.to.x; t.y = mv.to.y; t.rot = mv.to.rot;
    t.fled = true;
    t.moved = { kind:"flee", inches: mv.inches };
  });
  await panicFledThrough(t, start);
}

/* ============================================================
   7d · IL TIRO (Tappa 4)
   Il pannello sapeva gia' dire quanti pollici, che punteggio e quante
   perdite in media; quello che non sapeva era *tirare*. L'arco in
   fondo alla riga fa i quattro gesti della fase nell'ordine del
   manuale, e ognuno e' un'azione del motore che si annulla da sola:
   si dichiara il bersaglio (p. 137), si tira la raffica con i
   modificatori che il tavolo ha gia' calcolato (p. 138), si tolgono i
   modelli, e chi ne ha persi piu' di un quarto tira il Panico
   (p. 141).

   I dadi si vedono cadere prima di leggere il conto, come nello
   scontro simulato: al contrario il risultato sarebbe gia' li' e i
   cubi diventerebbero un fregio.
   ============================================================ */
/* `raw` e' la faccia grezza che il cubo deve mostrare, e per un D6 e'
   il valore stesso. Senza, il vassoio leggeva `undefined`, ripiegava
   sull'uno e faceva atterrare tutta la raffica sul pallino in mezzo:
   i numeri erano giusti, le facce dicevano un'altra cosa. */
const asDice = (p, need) => (p.dice || []).map(v =>
  ({ raw:v, value:v, win: need ? v >= need && v > 1 : false }));

function shotGroups(r, who, target){
  const out = [];
  const add = (label, p, need) => {
    if (!p || !(p.dice || []).length || (need || 0) >= 7) return;
    out.push({ kind:"d6", label, dice: asDice(p, need), tail: `${p.hits} su ${p.of}` });
  };
  /* il 7+ sono due mucchi: i 6 del primo tiro, e quei dadi ritirati
     contro il secondo punteggio (p. 139) */
  if (r.hitThen){
    add(`${who} · serve ${r.hitRaw}+, prima i 6`, { dice: r.hit.dice, of: r.hit.of,
        hits: r.follow ? r.follow.of : 0 }, 6);
    add(`${who} · e poi ${r.hitThen}+`, r.follow, r.hitThen);
  } else add(`${who} · colpisce ${r.hitNeed}+`, r.hit, r.hitNeed);
  add(`${who} · ferisce ${r.woundNeed}+`, r.wound, r.woundNeed);
  add(`${target} · armatura ${r.saveNeed}+`, r.save, r.saveNeed);
  add(`${target} · speciale ${r.wardNeed}+`, r.ward, r.wardNeed);
  add(`${target} · rigenera ${r.regenNeed}+`, r.regen, r.regenNeed);
  return out;
}

async function runShot(u, uid){
  const plan = shootPlanFor(u);
  const row = plan && plan.rows.find(r => r.unit.uid === +uid);
  if (!row) return;
  const t = row.unit;
  const f = shotOn(u, row, plan);
  const why = f.mods.list.map(m => `${m.v} ${m.why}`).join(", ");

  /* 1 · la dichiarazione. La nona delle sedici caselle e' il posto in
     cui vive; se siamo altrove ci si va, e il registro lo scrive. */
  act("dichiarazione di tiro", () => {
    if (state.game.on) G.goStep(8);
    G.dispatch({ type:"declareShot", unit:u, target:t, army:u.army,
      weapon: plan.weapon ? plan.weapon.name : "",
      text: `${u.name} prende di mira ${t.name} a ${row.dist.toFixed(1)}″: ` +
            `${f.shots} tir${f.shots === 1 ? "o" : "i"} da ${f.survey.n} modell${f.survey.n === 1 ? "o" : "i"}` +
            (why ? ` (${why})` : "") });
  });
  if (!plan.gate.can) toast("Tira lo stesso: l'app propone, non impedisce.");
  if (!f.shots) return toast("Nessun modello vede il bersaglio a gittata.");

  /* 2 · la raffica, vista cadere */
  const weapon = plan.weapon || { range: String(plan.range), S: "", ap: "" };
  const r = CB.shootRoll(u, t, { weapon, mods: f.mods.total, shots: f.shots });
  await showDiceGroups(shotGroups(r, u.name, t.name), {
    title: `Tiro di ${u.name} su ${t.name}`,
    foot: r.notes.length ? r.notes.join(" · ")
                         : "Gli stessi dadi del conto: nessuno viene ritirato.",
  });

  /* 3 · le tre caselle del tiro, con i dadi che si sono appena visti.
     Rifarli qui vorrebbe dire scrivere nel registro un tiro diverso da
     quello caduto nel vassoio. */
  act("tiro", () => {
    if (state.game.on) G.goStep(9);
    G.dispatch({ type:"toHit", unit:u, army:u.army, need:r.hitNeed, dice:f.shots },
               { colpire: { dice: r.hit.dice, hits: r.hit.hits } });
    if (r.hit.hits){
      if (state.game.on) G.goStep(10);
      G.dispatch({ type:"toWound", unit:u, army:u.army, need:r.woundNeed, dice:r.hit.hits },
                 { ferire: { dice: r.wound.dice, hits: r.wound.hits } });
      if (r.wound.hits && r.saveNeed < 7)
        G.dispatch({ type:"save", unit:t, army:t.army, need:r.saveNeed, dice:r.wound.hits },
                   { salvezza: { dice: r.save.dice, hits: r.save.hits } });
    }
    if (state.game.on) G.goStep(11);
    if (r.kills > 0) G.setLost(t, (t.lost || 0) + r.kills);
    else G.dispatch({ type:"note", army:u.army,
                      text: `${t.name}: nessuna perdita — ${r.wounds} ferit${r.wounds === 1 ? "a" : "e"} passate` });
  });

  /* 4 · il Panico. Il conto si fa sulla Forza d'Unita' quando c'e', e
     l'app sa quanti ne sono partiti meglio di chiunque al tavolo. */
  if (r.kills > 0) await panicCheck(t, r.kills, `il tiro di ${u.name}`, u);
  /* e chi e' rimasto a guardare un'unita' amica spazzata via (Tappa 5) */
  if (t.dead) await panicWave("destroyed", t);
}

/* Il test di Panico oltre un quarto (p. 141). Vive qui e non dentro
   `runShot` perche' la stessa domanda tornera' identica per le altre
   tre cause della Tappa 5: e' una misura piu' un test di Comando. */
async function panicCheck(t, killed, from, source = null){
  const us = unitStrength(t.troop, t.us, t.models, t.models, stat((t.stats || {}).W));
  /* Quanta Forza d'Unita' se ne va con ogni modello: un Rat Ogre ne
     porta via tre, e contare le teste darebbe la risposta sbagliata
     proprio sulle unita' in cui il Panico conta di piu'. */
  const perModel = us / Math.max(1, t.models);
  const chk = SH.panicFromShooting({
    start: t.models, lost: t.lost || 0,
    us, usLost: Math.round(killed * perModel),
    destroyed: !!t.dead,
  });
  if (!chk.must) return;
  /* Da qui in poi e' la stessa sequenza delle altre tre cause (Tappa 5):
     chi e' esente, quanti dadi, l'esito, e la fuga se va male. Prima il
     test si tirava e basta, e la riga non diceva se era passato. */
  await runPanic(t, "casualties", { source, why: `${from}: ${chk.why}`, at: 11 });
}

/* ============================================================
   7d bis · LA PSICOLOGIA (Tappa 5)
   Un test di psicologia e' sempre la stessa sequenza: si decide se va
   fatto e perche' (`psych.js`), si fanno rotolare i dadi che servono —
   tre con Cold Blooded, nessuno per chi passa da solo — si scrive la
   riga con l'esito, e se va male si porta la conseguenza sul tavolo.
   Qui la sequenza c'e' una volta sola, e le cause la chiamano.
   ============================================================ */
async function runPsych(u, kind, { check = null, foe = null, at = null, forImpetuous = false } = {}){
  const p = psychFor(u);
  const k = PS.KINDS[kind];
  const ld = unitLd(u, { forImpetuous });
  const ask = PS.testDice(kind, p);
  let rolls = null;
  if (ask.length){
    rolls = await G.askRolls(ask, `${k.label} di ${u.name}`);
    if (!rolls || !rolls[ask[0].id]) return null;
  }
  const got = rolls ? rolls[ask[0].id] : null;
  const res = PS.psychTest({ kind, ld: ld.value, dice: got ? got.dice : [], p });
  act(k.label, () => {
    if (state.game.on && at != null) G.goStep(at);
    G.dispatch({ type: kind === "panic" ? "panic" : "psych", kind, label: k.label,
      unit:u, army:u.army, ask, auto: res.auto, autoWhy: res.text,
      outcome: res.passed ? "passato" : "fallito",
      text: `${u.name}: ${k.label}` + (check && check.why ? ` (${check.why})` : "") +
            ` — ${res.text}` + (ld.why && !res.auto ? ` [${ld.why}]` : "") +
            (!res.passed && check && check.fail ? ` — ${check.fail}` : "") }, rolls);
    if (kind === "fear")
      u.fearTest = { turn: state.game.turn, side: state.game.army, passed: res.passed, vs: foe ? foe.uid : null };
    if (kind === "stupidity" && !res.passed) EF.addEffect(u, PS.stupidEffect(effNow()));
  });
  return res;
}

/* Il Panico: chi e' esente lo dice `psych.js`, il test lo tira
   `runPsych`, e chi fallisce fugge — dopo averlo chiesto, perche' quella
   conseguenza e' dichiarata da verificare. */
async function runPanic(u, cause, { source = null, why = "", at = null, check = null } = {}){
  const c = check || PS.panicCheck({ cause, me: psychFor(u), source: source ? psychFor(source) : null,
                                     fleeing: !!u.fled, engaged: engagedNow(u),
                                     sourceName: source ? source.name : "" });
  if (!c.must){
    if (c.why) act("niente Panico", () => G.logLine(`${u.name}: niente test di Panico — ${c.why}.`, { army: u.army }));
    return null;
  }
  const res = await runPsych(u, "panic", { check: { ...c, why: why || c.why }, at });
  if (res && !res.passed) await panicFlee(u, source);
  return res;
}

async function panicFlee(u, source){
  const pick = await askPick({
    title: `${u.name} fallisce il Panico`,
    label: "Chi fallisce il Panico fugge, lontano da quello che lo ha causato. " +
           "La regola è dichiarata da verificare sul manuale: decidete voi.",
    options: [{ id:"flee", label:"Fugge" }, { id:"stay", label:"Resta dov'è" }],
  });
  if (!pick) return;
  if (pick !== "flee")
    return act("Panico", () => G.logLine(`${u.name}: fallito il Panico, resta dov'è per scelta dei giocatori.`, { army: u.army }));
  const near = nearFoes(u)[0];
  const from = source || (near && near.unit) || null;
  if (!from) return toast("Serve qualcosa da cui fuggire: la direzione si misura da lì.");
  return runFlee(u, from);
}

/* Tutti quelli che una stessa cosa manda al Panico, uno dopo l'altro:
   gli amici entro 6″ di chi e' stato distrutto o e' andato in rotta.
   Chi non tira lo dice, perche' «e quelli perche' no?» e' la domanda
   che al tavolo si fa sempre. */
async function panicWave(cause, source){
  if (!state.game.on || !source) return;
  const sp = psychFor(source);
  const friends = friendsNear(source, PS.PANIC_RANGE).map(f => ({
    ...f, p: psychFor(f.unit), fleeing: !!f.unit.fled, engaged: engagedNow(f.unit) }));
  const { tests, spared } = PS.panicAround({ cause, source: { ...sp, name: source.name }, friends });
  if (spared.length)
    act("niente Panico", () => {
      for (const s of spared)
        G.logLine(`${s.name}: niente Panico per ${source.name} — ${s.check.why}.`, { army: s.unit.army });
    });
  for (const f of tests) await runPanic(f.unit, cause, { source, check: f.check });
}

/* Chi fugge attraverso un'unita' amica la manda al Panico. Il percorso
   e' il segmento dal centro di partenza a quello d'arrivo, e i pezzi
   sono gli amici con il loro poligono vero. */
async function panicFledThrough(u, from){
  if (!state.game.on || !from) return;
  const pieces = state.units
    .filter(o => o !== u && o.army === u.army && o.placed && !o.dead && !isJoined(o))
    .map(o => { const poly = corners(o); return { unit:o, contains: pt => insidePoly(pt, poly) }; });
  for (const hit of CH.crossed(from, [u.x, u.y], pieces))
    await runPanic(hit.unit, "fledThrough", { source: u });
}

/* I nemici a contatto che fanno Paura e sono piu' grossi: il test di
   Paura in mischia, quando il combattimento viene scelto. */
function fearFoes(u){
  const ids = contactsNow().filter(c => c.enemy && (c.a === u.uid || c.b === u.uid))
                           .map(c => c.a === u.uid ? c.b : c.a);
  const pu = psychFor(u);
  return [...new Set(ids)].map(id => state.units.find(o => o.uid === id)).filter(Boolean)
    .map(foe => ({ foe, check: PS.fearCheck({ me: pu, foe: psychFor(foe), meUS: usOf(u), foeUS: usOf(foe),
                                              when:"combat", tested: fearTested(u), foeName: foe.name }) }))
    .filter(x => x.check.must || x.check.already);
}

function failCharge(u, t, why){
  MV.ensureAnchor(u);
  u.moved = { kind:"failedCharge", inches: 0 };
  if (psychFor(u).firstCharge) EF.spend(u, "firstCharge");
  G.dispatch({ type:"note", army:u.army, text: `${u.name} non carica ${t.name}: ${why}.` });
}

/* Il marcatore della Stupidita'.
 *
 * Il test lo tira `runPsych`, e chi lo fallisce si prende l'effetto.
 * Ma al tavolo la Stupidita' capita anche senza passare di qui: la
 * si è tirata con i dadi veri, o l'ha causata un incantesimo, o
 * semplicemente l'app era chiusa. Senza un modo di dirlo a mano,
 * l'unico stato che l'app conosceva era quello che aveva visto
 * succedere — ed e' lo stesso principio per cui ogni altro numero
 * dell'ispettore si corregge.
 *
 * Dura fino al proprio prossimo inizio di turno, che e' quanto dice
 * la regola: attraversa il turno dell'avversario e scade dove si
 * rifa' il test. Toglierlo e' un gesto solo, e finisce nel registro
 * come tutto il resto.
 */
function markStupid(u, on){
  if (on) EF.addEffect(u, PS.stupidEffect(effNow()));
  else EF.removeEffect(u, "stupidity", "Stupidità");
  G.dispatch({ type:"note", army:u.army,
    text: on ? `${u.name}: segnata in preda alla Stupidità — ${PS.STUPID_LIMITS.join(", ")}.`
             : `${u.name}: non è più in preda alla Stupidità.` });
}

/* Tutti quelli che devono tirarla, uno dopo l'altro. All'inizio del
   turno il promemoria diceva i nomi e poi toccava cercarli sul tavolo
   uno per uno: con sei unita' stupide in lista sono sei selezioni e
   sei pulsanti, ed e' il genere di attrito per cui al tavolo il test
   si salta. */
export function stupidityPending(){
  if (!state.game.on) return [];
  return state.units.filter(u => {
    if (u.army !== state.game.army || !u.placed || u.dead || isJoined(u)) return false;
    const p = psychFor(u);
    /* chi ci e' gia' dentro il test lo ha fatto, e gli e' andato male:
       rifarglielo nello stesso turno sarebbe un secondo tiro gratis */
    if (p.stupid) return false;
    return PS.stupidityCheck({ p, fleeing: !!u.fled, engaged: engagedNow(u) }).must;
  });
}

async function runAllStupidity(){
  const list = stupidityPending();
  if (!list.length) return toast("Nessuno deve tirare la Stupidità adesso.");
  for (const u of list) await runPsychButton(u, "stupidity");
}

/* Il promemoria della prima casella diventa un pulsante.
 *
 * Il registro scriveva già «Da tirare adesso: Stupidità per X, Y, Z»
 * e poi toccava cercarli sul tavolo uno per uno: con tre unità
 * stupide sono tre selezioni e tre pulsanti, ed è esattamente il
 * genere di attrito per cui al tavolo il test si salta — sempre a
 * favore di chi lo salta. Qui c'è un gesto solo, e i dadi sono gli
 * stessi di prima. Chi è già in preda alla Stupidità non ricompare
 * nell'elenco: il test lo ha già fatto e gli è andato male.
 */
function stupidityPrompt(){
  const host = $("#game");
  if (!host) return;
  const old = host.querySelector("#g-stupid-all");
  if (old) old.closest(".stupid-ask").remove();
  if (!state.game.on || state.game.deploying || state.game.step !== 0) return;
  const list = stupidityPending();
  if (!list.length) return;

  const box = document.createElement("div");
  box.className = "stupid-ask";
  box.innerHTML = `
    <p class="note" style="color:var(--warn);margin:0 0 4px">
      <b>Stupidità</b> da tirare: ${esc(list.map(u => u.name).join(", "))}.
      Chi fallisce non si muove, non tira e non lancia fino al suo prossimo turno.</p>
    <button class="btn tiny" id="g-stupid-all" style="width:100%">Tira la Stupidità per tutti (${list.length})</button>`;
  const anchor = host.querySelector(".stepacts") || host.querySelector(".steps");
  if (anchor) anchor.after(box); else host.appendChild(box);
  box.querySelector("#g-stupid-all").addEventListener("click", runAllStupidity);
}

async function runPsychButton(u, kind){
  /* il marcatore non tira niente: dice e basta */
  if (kind === "stupid")   return act("Stupidità", () => markStupid(u, true));
  if (kind === "unstupid") return act("Stupidità", () => markStupid(u, false));
  if (kind === "stupidity"){
    const c = PS.stupidityCheck({ p: psychFor(u), fleeing: !!u.fled, engaged: engagedNow(u) });
    if (!c.must && c.why) toast(c.why + ": si tira lo stesso, lo decidete voi.");
    return runPsych(u, "stupidity", { check: { ...c, fail:"fino al suo prossimo turno: " + PS.STUPID_LIMITS.join(", ") }, at: 0 });
  }
  if (kind === "impetuous")
    return runPsych(u, "impetuous", { check: { why:"Impetuous", fail:"deve dichiarare una carica" },
                                      at: 4, forImpetuous: true });
  if (kind === "fear"){
    const list = fearFoes(u).filter(x => x.check.must);
    if (!list.length) return toast("Nessun nemico a contatto che faccia Paura e sia più grosso.");
    return runPsych(u, "fear", { check: list[0].check, foe: list[0].foe, at: 12 });
  }
  if (kind === "panic"){
    const cause = await askPick({
      title: `Panico di ${u.name}`, label: "Per quale causa?",
      options: Object.values(PS.PANIC_CAUSES).map(c => ({ id:c.id, label:c.label })),
    });
    if (!cause) return;
    const c = PS.PANIC_CAUSES[cause];
    return runPanic(u, cause, { check: { must:true, why: c.label, fail:"fugge" } });
  }
}

/* Il blocco nell'ispettore: le regole di psicologia dell'unita', lo
   stato in cui si trova adesso — in preda alla Stupidita', senza piu'
   Frenzy, con la Paura gia' tirata — e i test che si possono tirare. */
function psychHTML(u){
  if (!u || !u.placed || u.dead || isJoined(u)) return "";
  const p = psychFor(u);
  const lines = [];
  if (p.stupid) lines.push("In preda alla Stupidità fino al suo prossimo turno: " + PS.STUPID_LIMITS.join(", ") + ".");
  if (p.frenzyLost) lines.push("Ha perso la Frenzy perdendo un round di combattimento.");
  const ft = fearTested(u);
  if (ft) lines.push("Test di Paura " + (ft.passed ? "passato" : "fallito") + " in questo turno: non se ne tira un altro.");
  const lead = unitLd(u);
  if (lead.why) lines.push(lead.why + ".");
  if (!p.rules.length && !lines.length && !state.game.on) return "";
  const fearNow = state.game.on ? fearFoes(u).filter(x => x.check.must) : [];
  const btn = (id, label, title) =>
    `<button class="btn tiny" data-psych="${id}" title="${esc(title)}">${label}</button>`;
  const buttons = !state.game.on ? "" : [
    p.stupidity ? btn("stupidity", "Stupidità", "Test di Comando all'inizio del turno: se fallisce resta ferma fino al prossimo") : "",
    /* il marcatore a mano: vale anche per chi la Stupidita' se l'e'
       presa fuori dall'app, e per chi l'ha tirata con i dadi veri */
    p.stupid
      ? `<button class="btn tiny" data-psych="unstupid" title="Toglie il marcatore: l'unità torna a muoversi, tirare e lanciare">Non è più stupida</button>`
      : (p.stupidity ? `<button class="btn tiny" data-psych="stupid" title="Segna l'unità in preda alla Stupidità fino al suo prossimo turno, senza tirare">Segnala stupida</button>` : ""),
    p.impetuous ? btn("impetuous", "Impetuosa", "Test di Comando senza la Warband: se fallisce deve caricare") : "",
    fearNow.length ? btn("fear", "Paura", fearNow[0].check.why) : "",
    btn("panic", "Panico", "Un test di Panico a mano, scegliendo la causa"),
  ].join("");
  return `
    <div class="psych-block">
      <div class="readout"><span>Psicologia</span><b>${p.rules.length
        ? p.rules.map(r => esc(r.name)).join(" · ") : "—"}</b></div>
      ${p.rules.map(r => `<p class="note"><b>${esc(r.name)}</b>: ${esc(r.what || "")}</p>`).join("")}
      ${lines.map(s => `<p class="note" style="color:var(--warn)">${esc(s)}</p>`).join("")}
      ${buttons ? `<div class="chiprow">${buttons}</div>` : ""}
    </div>`;
}

/* ---- le regole d'esercito (Tappa 5 bis) ----
   Quello che il file d'esercito sa dire di quest'unita' e dei personaggi
   che le stanno uniti: le regole che il conto applica da solo, quelle
   che restano a voi con il perche', e i gesti da una volta per partita
   — il Waaagh! — con il pulsante che li tira. Quelle che gioca la
   psicologia stanno gia' nel blocco sopra, e qui non si ripetono. */
function armyRowsOf(x){
  const info = (state.armies[x.army] && state.armies[x.army].info) || {};
  const army = ARM.armyFor(x, info.catalogue || "");
  if (!army) return [];
  return (x.rules || []).map(name => ({ name, rule: ARM.ruleFor(army, name), army, owner: x }))
    .filter(r => r.rule && !r.rule.gioca);
}

function armyBlockHTML(u){
  if (!u || !u.placed || u.dead || isJoined(u)) return "";
  const seen = new Set();
  const rows = [u, ...attachedOf(u)].flatMap(armyRowsOf)
    .filter(r => { const k = r.owner.uid + "|" + r.rule.id; return !seen.has(k) && seen.add(k); });
  if (!rows.length) return "";
  const buttons = !state.game.on ? "" : rows.filter(r => r.rule.once && r.rule.when === "command").map(r => {
    const used = EF.spent(r.owner, r.rule.id);
    return `<button class="btn tiny" data-army="${esc(r.rule.id)}|${r.owner.uid}" ${used ? "disabled" : ""}
      title="${esc(used ? r.owner.name + " l'ha già tentato in questa partita" : r.rule.what || "")}">${esc(r.rule.name)}${
      r.owner !== u ? " · " + esc(r.owner.name) : ""}</button>`;
  }).join("");
  const active = EF.effectsOf(u).filter(e => rows.some(r => r.rule.id === e.id));
  return `
    <div class="army-block">
      <div class="readout"><span>Regole d'esercito</span><b>${esc(rows[0].army.name)}</b></div>
      ${rows.map(r => {
        const on = ARM.applies(r.rule);
        return `<p class="note"><b>${esc(r.name)}</b>${r.owner !== u ? " (" + esc(r.owner.name) + ")" : ""}: ${
          esc(on ? r.rule.what || "" : r.rule.perche || r.rule.what || "")}${on ? "" : ` <span class="dim">— a mano</span>`}</p>`;
      }).join("")}
      ${active.map(e => `<p class="note" style="color:var(--ok)">Attivo: ${esc(e.from)}, fino al suo prossimo inizio turno.</p>`).join("")}
      ${buttons ? `<div class="chiprow">${buttons}</div>` : ""}
    </div>`;
}

/* Il gesto da una volta per partita: un test di Comando del personaggio
   con il suo Comando, nella sotto-fase di comando. Se passa, l'effetto
   va su di lui e — quando la regola lo dice — sull'unita' a cui e'
   unito. Il tentativo si spende comunque: «una volta per partita puo'
   tentare», dice il testo del Waaagh!, e un tentativo fallito e' un
   tentativo. */
async function runArmyAbility(host, key){
  const [id, ownerUid] = String(key).split("|");
  /* `uid` e' un numero e `dataset` torna sempre una stringa: con `===`
     il personaggio non si trovava mai, e il pulsante non faceva niente */
  const owner = state.units.find(o => String(o.uid) === ownerUid);
  const row = owner && armyRowsOf(owner).find(r => r.rule.id === id);
  if (!row) return;
  const { rule, army } = row;
  if (EF.spent(owner, id)) return toast(`${owner.name} ha già tentato ${rule.name} in questa partita.`);
  const rolls = await G.askRolls([{ id:"comando", kind:"d6", n:2, why:`test di Comando per ${rule.name}` }],
                                 `${rule.name} di ${owner.name}`);
  if (!rolls || !rolls.comando) return;
  const res = PS.psychTest({ kind:"", ld: EF.val(owner, "Ld"), dice: rolls.comando.dice || [] });
  const spread = spreadsTo(host, owner, rule.estende);
  const gets = res.passed ? [owner, ...(spread ? [host] : [])] : [];
  act(rule.name, () => {
    if (state.game.on) G.goStep(1);
    EF.spend(owner, id);
    const at = { turn: state.game.turn, side: state.game.army };
    for (const x of gets) EF.addEffect(x, ARM.toEffect(rule, army, { at }));
    G.dispatch({ type:"command", unit: owner, ability: rule.name, army: owner.army,
      text: `${owner.name}: ${rule.name} — ${res.text}` +
            (res.passed ? ` — fino al suo prossimo inizio turno ${gets.map(x => x.name).join(" e ")}: ${rule.effetto || rule.what}`
                        : " — il tentativo della partita è speso") +
            (res.passed && host !== owner && !spread ? ` (non ${host.name}: la regola vale solo per un'unità di Orchi)` : "") },
      rolls);
  });
}

/* A chi si allarga l'effetto: all'unita' ospite, se il nome dice che e'
   quella giusta e nessuno dentro dice il contrario. Per il Waaagh! «di
   soli Orchi», e un Goblin unito la fa smettere di esserlo. */
function spreadsTo(host, owner, rule){
  if (!rule || !host || host === owner) return false;
  const yes = new RegExp(rule.nome, "i"), no = rule.non ? new RegExp(rule.non, "i") : null;
  return yes.test(host.name) && !(no && [host, ...attachedOf(host)].some(x => no.test(x.name)));
}

/* ============================================================
   7d ter · LA MAGIA (Tappa 6)
   Il ciclo del libro (pp. 106-111) portato sul tavolo. Il mago si
   prepara una volta — Livello e dominio, che il file di New Recruit non
   dice — e genera gli incantesimi dal vassoio. In partita ogni
   incantesimo ha il suo pulsante: si sceglie il bersaglio, si tira il
   lancio, il fiasco ha la sua tabella, l'avversario sceglie se e con chi
   dissolvere, e quello che resta in piedi diventa un effetto a tempo o
   una raffica di colpi. Ogni passo e' un'azione del motore, quindi ogni
   passo si annulla da solo.

   `magic.js` sa le regole; qui c'e' solo quello che sa il tavolo: chi e'
   a quanti pollici, chi vede chi, chi combatte con chi.
   ============================================================ */
const MAGIC = () => { const m = MG.magicNow(); return m && m.ok ? m : null; };

/* Quello che la magia ricorda fra un turno e l'altro sta in
   `state.extras`, come la sagoma: cosi' si annulla, si salva e si
   condivide con il resto senza toccare i serializzatori. */
const magicState = () => ({ fated: {}, inPlay: [], ...((state.extras && state.extras.magic) || {}) });
const setMagicState = patch => { state.extras = { ...(state.extras || {}), magic: { ...magicState(), ...patch } }; };
const turnKey = () => "T" + (state.game.turn || 1) + (state.game.army || "A");
const castNow = x => {
  const c = x && x.magic && x.magic.cast;
  return c && c.turn === state.game.turn && c.side === state.game.army ? c : null;
};
const unitByUid = v => state.units.find(o => String(o.uid) === String(v)) || null;
const spellName = id => ((MAGIC() && MAGIC().spell(id)) || {}).name || id;

/* Gli incantesimi vincolati di un pezzo: quelli che le sue regole
   nominano, piu' quelli dichiarati a mano.

   La dichiarazione a mano non e' un ripiego: New Recruit esporta le
   regole dell'unita' base, e l'oggetto che porta l'incantesimo —
   il Solar Engine di un Bastiladon — in due liste su tre non compare
   fra le regole. Senza un modo di dirlo, l'unica magia che l'app
   conosce e' quella che il file si e' ricordato di scrivere. */
const boundOf = x => {
  const M = MAGIC();
  if (!M) return [];
  const own = M.boundFor((x && x.rules) || []);
  const hand = (((x && x.magic) || {}).bound || [])
    .map(id => M.bound.find(b => b.id === id)).filter(Boolean)
    .filter(b => !own.some(o => o.id === b.id));
  return [...own, ...hand];
};

function wizardOf(x){
  const M = MAGIC(), m = (x && x.magic) || {};
  return {
    level: MG.levelOf(x, m), lore: m.lore || "", numbers: m.numbers || [], swaps: m.swaps || [],
    known: M ? MG.knownSpells(M, m.lore, m.numbers || [], m.swaps || []) : [],
    bound: boundOf(x),
    loreObj: M && m.lore ? M.lore(m.lore) : null,
  };
}
const castersIn = u => MAGIC() ? [u, ...attachedOf(u)].filter(x =>
  MG.isWizard(x, x.magic) || boundOf(x).length > 0) : [];

/* Fin dove arriva la magia di quest'unita', e chi ce la porta. E' la
   riga che il cerchio sul tavolo disegna: la gittata di un incantesimo
   e' una proprieta' del profilo come la portata di un arco, e finche'
   la si scopriva solo premendo «mira» il tavolo mostrava il numero
   sbagliato a chi stava decidendo dove mettere il pezzo. */
function magicReachOf(u){
  const M = MAGIC();
  if (!M || !u) return null;
  let best = null;
  for (const x of castersIn(u)){
    const w = wizardOf(x);
    const r = MG.magicRange([...w.known, ...w.bound]);
    if (r && (!best || r.range > best.range)) best = { ...r, who: x.name };
  }
  return best;
}

const rangeTxt = s => s.range === "self" ? "sé" : s.range === "combat" ? "mischia"
  : typeof s.range === "number" ? s.range + "″" : String(s.range);

function magicHTML(u){
  const M = MAGIC();
  if (!M || !u || !u.placed || u.dead || isJoined(u)) return "";
  const casters = castersIn(u);
  if (!casters.length) return "";
  const inPlay = magicState().inPlay.map((e, i) => ({ ...e, i }));
  const line = s => `${esc(s.name)} <span class="dim">· ${MG.TYPE_LABEL[s.type]} · ${s.cv}+${s.cv2 ? "/" + s.cv2 + "+" : ""} · ${esc(rangeTxt(s))}${s.rip ? " · resta in gioco" : ""}${s.bound ? " · vincolato, Potere " + s.potere : ""}</span>`;

  const blocks = casters.map(x => {
    const w = wizardOf(x);
    const setup = [];
    if (MG.isWizard(x, x.magic)){
      if (!w.level || !w.lore)
        setup.push(`<div class="chiprow">
          <select data-mg-level="${x.uid}" title="Il Livello del mago: il file della lista non lo dice">
            <option value="">— Livello —</option>${[1, 2, 3, 4].map(n =>
              `<option value="${n}" ${w.level === n ? "selected" : ""}>Livello ${n}</option>`).join("")}
          </select>
          <select data-mg-lore="${x.uid}" title="Il dominio scelto quando si è scritta la lista (p. 106)">
            <option value="">— dominio —</option>${M.lores.map(l =>
              `<option value="${l.id}" ${w.lore === l.id ? "selected" : ""}>${esc(l.label)}</option>`).join("")}
          </select></div>`);
      else if (!w.numbers.length)
        setup.push(`<div class="chiprow"><button class="btn tiny" data-mg-gen="${x.uid}"
          title="Tanti D6 quanti il Livello, e i doppioni si ritirano (p. 106)">Genera gli incantesimi (${w.level}D6)</button></div>`);
      else {
        const opts = MG.swapOptions(M, w.lore, x.rules || []).filter(o => !w.known.some(k => k.id === o.id));
        if (!w.swaps.length && opts.length)
          setup.push(`<select data-mg-swap="${x.uid}" title="Uno degli incantesimi generati si può scambiare con la firma del dominio, o con un incantesimo del dominio d'esercito (p. 106)">
            <option value="">— scambia un incantesimo —</option>
            ${w.known.flatMap(k => opts.map(o => `<option value="${k.id}|${o.id}">${esc(k.name)} → ${esc(o.name)}</option>`)).join("")}
          </select>`);
      }
    }
    const cs = castNow(x);
    const btn = s => !state.game.on ? "" :
      (typeof s.range === "number" && s.type !== "vortex" ? aimButton(u, "spell", x.uid, s.id) : "") +
      `<button class="btn tiny" data-mg-cast="${x.uid}|${s.id}" title="${esc(s.testo || "")}">${
        cs && cs.ids.includes(s.id) ? "Già tentato" : "Lancia"}</button>`;
    const hand = new Set((((x.magic) || {}).bound) || []);
    const rows = [...w.known, ...w.bound].map(s =>
      `<div class="readout"><span title="${esc(s.testo || "")}">${line(s)}</span>${
        hand.has(s.id) ? `<button class="btn tiny ghost" data-mg-unbind="${x.uid}|${esc(s.id)}"
          title="Toglie l'incantesimo dichiarato a mano">−</button>` : ""}${btn(s)}</div>`).join("");
    /* Dichiarare a mano un incantesimo vincolato. New Recruit esporta
       le regole dell'unita' base, e l'oggetto che porta l'incantesimo
       spesso non ci finisce: in due liste su tre il Bastiladon non ha
       «Solar Engine» fra le regole, e la sua magia non esisteva. */
    const free = M.bound.filter(b => !w.bound.some(o => o.id === b.id));
    if (free.length) setup.push(`<select data-mg-bind="${x.uid}"
      title="Un incantesimo vincolato che il file della lista non ha scritto: l'oggetto che lo porta">
      <option value="">— aggiungi un incantesimo vincolato —</option>
      ${free.map(b => `<option value="${esc(b.id)}">${esc(b.name)} · ${esc(b.regola || "")} · ${esc(rangeTxt(b))}</option>`).join("")}
    </select>`);

    const mine = inPlay.filter(e => e.caster === x.uid);
    return `<div class="readout"><span>Mago</span><b>${esc(x.name)}${w.level ? " · Livello " + w.level : ""}${
        w.loreObj ? " · " + esc(w.loreObj.label) : ""}</b></div>
      ${setup.join("")}${rows}
      ${cs && cs.stop ? `<p class="note" style="color:var(--warn)">Dopo il fiasco non lancia altro in questo turno (p. 109).</p>` : ""}
      ${mine.map(e => `<div class="readout"><span>In gioco: ${esc(spellName(e.spellId))}${
        e.target != null ? " su " + esc((unitByUid(e.target) || {}).name || "?") : ""}</span>
        <button class="btn tiny" data-mg-end="${e.i}" title="Il mago lo termina all'inizio di una sotto-fase qualsiasi (p. 111)">Termina</button></div>`).join("")}`;
  }).join("");

  const foeRip = !state.game.on ? [] : inPlay.filter(e => e.army !== u.army);
  return `
    <div class="magic-block">
      <div class="readout"><span>Magia</span><b>${casters.length > 1 ? casters.length + " maghi" : ""}</b></div>
      ${blocks}
      ${foeRip.map(e => `<div class="readout"><span>Nemico in gioco: ${esc(spellName(e.spellId))}</span>
        <button class="btn tiny" data-mg-dispel="${e.i}"
          title="Nella congiurazione dei turni dopo, contro il valore di lancio (p. 111)">Dissolvi</button></div>`).join("")}
    </div>`;
}

function wireMagic(host){
  const on = (sel, ev, fn) => { for (const el of host.querySelectorAll(sel)) el.addEventListener(ev, () => fn(el)); };
  on("[data-mg-level]", "change", el => {
    const x = unitByUid(el.dataset.mgLevel); if (!x) return;
    act("Livello del mago", () => { x.magic = { ...(x.magic || {}), level: +el.value || 0, numbers: [], swaps: [] }; });
    renderAll();
  });
  on("[data-mg-bind]", "change", el => {
    const x = unitByUid(el.dataset.mgBind);
    if (!x || !el.value) return;
    const id = el.value;
    act("incantesimo vincolato", () => {
      const have = ((x.magic || {}).bound) || [];
      x.magic = { ...(x.magic || {}), bound: have.includes(id) ? have : [...have, id] };
    });
    renderAll();
  });
  on("[data-mg-unbind]", "click", el => {
    const [uid, id] = el.dataset.mgUnbind.split("|");
    const x = unitByUid(uid);
    if (!x) return;
    act("incantesimo vincolato", () => {
      x.magic = { ...(x.magic || {}), bound: (((x.magic) || {}).bound || []).filter(v => v !== id) };
    });
    renderAll();
  });
  on("[data-mg-lore]", "change", el => {
    const x = unitByUid(el.dataset.mgLore); if (!x) return;
    act("dominio del mago", () => { x.magic = { ...(x.magic || {}), lore: el.value, numbers: [], swaps: [] }; });
    renderAll();
  });
  on("[data-mg-gen]", "click", el => runGenerate(unitByUid(el.dataset.mgGen)));
  on("[data-mg-swap]", "change", el => {
    const x = unitByUid(el.dataset.mgSwap); if (!x || !el.value) return;
    const [out, into] = el.value.split("|");
    act("scambio di incantesimo", () => {
      x.magic = { ...(x.magic || {}), swaps: [{ out, into }] };
      G.logLine(`${x.name} scarta ${spellName(out)} e prende ${spellName(into)} (p. 106).`, { army: x.army });
    });
    renderAll();
  });
  on("[data-mg-cast]", "click", el => {
    const [uid, id] = el.dataset.mgCast.split("|");
    runCast(unitByUid(uid), id);
  });
  on("[data-mg-end]", "click", el => endSpell(+el.dataset.mgEnd, "il mago lo termina"));
  on("[data-mg-dispel]", "click", el => runDispelLater(+el.dataset.mgDispel));
}

/* ---- generare (p. 106) ----
   Si tirano tanti D6 quanti il Livello; se esce un doppione il vassoio
   si riapre per i dadi che mancano. Quello che si scrive nel registro
   sono le facce, i doppioni ritirati e gli incantesimi che ne escono. */
async function runGenerate(x){
  const w = x && wizardOf(x);
  if (!w || !w.level || !w.loreObj) return;
  const faces = [];
  let res = MG.generateSpells({ level: w.level, dice: faces });
  for (let guard = 0; !res.done && guard < 12; guard++){
    const r = await G.askRolls([{ id:"incantesimi", kind:"d6", n: res.need,
      why:`incantesimi di ${x.name} (${w.loreObj.label})`, foot:"I doppioni si ritirano (p. 106)." }],
      `Incantesimi di ${x.name}`);
    if (!r || !r.incantesimi) return;
    faces.push(...r.incantesimi.dice);
    res = MG.generateSpells({ level: w.level, dice: faces });
  }
  const known = MG.knownSpells(MAGIC(), w.lore, res.numbers, []);
  act("incantesimi generati", () => {
    x.magic = { ...(x.magic || {}), numbers: res.numbers, swaps: [] };
    G.logLine(`${x.name} genera gli incantesimi: ${faces.join(", ")}` +
      (res.rerolled.length ? ` (doppioni ritirati: ${res.rerolled.join(", ")})` : "") +
      ` — ${known.map(s => s.name).join(", ")}.`, { army: x.army });
  });
}

/* ---- i bersagli (p. 108) ----
   La stessa misura del tiro: distanza da bordo a bordo, arco frontale,
   vista tagliata dagli elementi che la bloccano. Chi non va bene resta
   nell'elenco con il perche', e si puo' scegliere lo stesso. */
function magicTargets(host, sp){
  if (sp.type === "assailment"){
    const ids = contactsNow().filter(c => c.enemy && (c.a === host.uid || c.b === host.uid))
                             .map(c => c.a === host.uid ? c.b : c.a);
    return [...new Set(ids)].map(unitByUid).filter(Boolean)
      .map(unit => ({ unit, dist: 0, check: MG.targetCheck(sp, { touching: true }) }));
  }
  const friendly = sp.type === "enchantment" || sp.type === "conveyance";
  const pool = state.units.filter(o => o.placed && !o.dead && !isJoined(o) &&
                                     (friendly ? o.army === host.army : o.army !== host.army));
  const rows = shootingSurvey(host, pool, { cornersOf: corners, boxOf, pieces: terrainPieces(),
                                            range: typeof sp.range === "number" ? sp.range : 0, inch,
                                            look: t => t === host ? { sees: true, cover: "" } : lookFor(host, t) });
  return rows.map(r => ({
    unit: r.unit, dist: r.dist,
    check: MG.targetCheck(sp, { dist: r.dist, inArc: r.unit === host || r.inArc, engaged: engagedNow(r.unit),
                                friendly, sight: !r.blocked }),
  })).sort((a, b) => (b.check.ok - a.check.ok) || (a.dist - b.dist));
}

/* ---- chi puo' dissolvere (p. 110) ----
   I maghi dell'altra parte entro 18 o 24 pollici dal mago che lancia,
   non in fuga e non in combattimento. */
function dispellersFor(caster){
  const from = corners(hostOf(caster) || caster);
  return state.units.filter(o => o.army !== caster.army && !o.dead && MG.levelOf(o, o.magic) > 0)
    .map(o => {
      const h = hostOf(o) || o;
      const level = MG.levelOf(o, o.magic);
      return { unit: o, level, host: h, dist: h.placed ? inch(polyDistance(corners(h), from)) : 999 };
    })
    .filter(d => d.host.placed && !d.host.fled && !engagedNow(d.host) && d.dist <= MG.dispelRange(d.level) + 0.01)
    .sort((a, b) => b.level - a.level || a.dist - b.dist);
}

async function offerDispel(caster, sp, { total = 0, later = false } = {}){
  const foes = dispellersFor(caster);
  const fatedUsed = !!magicState().fated[turnKey()];
  const options = [
    ...foes.map(f => ({ id: "w" + f.unit.uid, label: `${f.unit.name} · Livello ${f.level} · ${f.dist.toFixed(1)}″` })),
    ...(fatedUsed ? [] : [{ id: "fated", label: "Affidato alla sorte" }]),
    { id: "none", label: "Nessun dissolvimento" },
  ];
  const pick = await askPick({
    title: `${sp.name}: si dissolve?`,
    label: later
      ? `In gioco da un turno prima: si dissolve superando il valore di lancio, ${sp.cv} (p. 111).`
      : `Lanciato con ${total}: per dissolverlo bisogna superarlo (p. 110).` +
        (fatedUsed ? " La sorte è già stata tentata in questo turno." : "") +
        (foes.length ? "" : " Nessun mago nemico è in gittata di dissolvimento."),
    options,
  });
  if (!pick || pick === "none") return null;
  const fated = pick === "fated";
  const f = fated ? null : foes.find(d => "w" + d.unit.uid === pick);
  const rolls = await G.askRolls([{ id:"dissolvimento", kind:"d6", n:2,
    why: fated ? "dissolvimento affidato alla sorte" : `dissolvimento di ${f.unit.name}` }], `Dissolvimento di ${sp.name}`);
  if (!rolls || !rolls.dissolvimento) return null;
  let res = MG.dispelResult({ dice: rolls.dissolvimento.dice, level: f ? f.level : 0, fated,
                              castTotal: total, later, cv: sp.cv });
  let out = null, outRolls = null;
  if (res.outclassed){
    outRolls = await G.askRolls([{ id:"fiasco", kind:"d6", n:2, why:"surclassato: tabella del fiasco (p. 110)" }],
                                `${f.unit.name} è surclassato`);
    if (outRolls && outRolls.fiasco){
      out = MG.miscastRead(outRolls.fiasco.total, { dispel: true });
      if (out.dispelled) res = { ...res, dispelled: true };
    }
  }
  return { res, rolls, by: f ? f.unit : null, fated, out, outRolls };
}

/* La casella in cui il libro mette quel tipo di incantesimo. Se si e'
   gia' nella fase giusta si resta dove si e': un dardo si lancia
   «quando il mago viene scelto», e la casella la sceglie chi gioca. */
function castStepIndex(type){
  const want = MG.CAST_STEP[type];
  const now = G.stepNow();
  if (!want) return null;
  if (now.id === want || now.phaseId === want) return now.index;
  const ph = G.phases();
  for (let pi = 0; pi < ph.length; pi++){
    if (ph[pi].id === want) return pi * 4;
    const si = ph[pi].steps.findIndex(s => s.id === want);
    if (si >= 0) return pi * 4 + si;
  }
  return null;
}

/* ---- lanciare (pp. 108-111) ---- */
async function runCast(caster, spellId, preUid = null){
  const M = MAGIC();
  const sp = M && M.spell(spellId);
  if (!caster || !sp) return;
  const host = hostOf(caster) || caster;
  const w = wizardOf(caster);
  const cs = castNow(caster);
  /* La casella in cui il libro mette l'incantesimo: se sta piu' avanti
     nel turno ci si va, e il lancio non e' fuori posto; se sta piu'
     indietro si resta dove si e' — il turno non torna indietro per un
     incantesimo — e il registro scrive dove andava. Il browser l'ha
     mostrato: una maledizione lanciata dall'inizio del turno finiva
     nella congiurazione con la nota «si lancia nella congiurazione». */
  const idx = state.game.on ? castStepIndex(sp.type) : null;
  const forward = idx != null && idx > (state.game.step || 0);
  const ph = G.phases();
  const step = forward
    ? { id: ph[Math.floor(idx / 4)].steps[idx % 4].id, phaseId: ph[Math.floor(idx / 4)].id }
    : G.stepNow();
  const gate = MG.canCast(sp, { fleeing: !!host.fled, engaged: engagedNow(host),
    castThisTurn: cs ? cs.ids : [], stopped: !!(cs && cs.stop), stepId: step.id, phaseId: step.phaseId,
    stupid: psychFor(host).stupid });

  /* 1 · il bersaglio */
  let target = null, targetWhy = [];
  if (sp.range === "self") target = host;
  else if (sp.type !== "vortex"){
    const rows = magicTargets(host, sp);
    if (!rows.length) return toast(sp.type === "assailment"
      ? `${sp.name}: nessun nemico in combattimento con ${caster.name}.` : `${sp.name}: nessun bersaglio sul tavolo.`);
    const pre = preUid != null ? rows.find(r => r.unit.uid === +preUid) : null;
    const pick = pre ? String(pre.unit.uid) : await askPick({
      title: `${sp.name}: il bersaglio`,
      label: (gate.why.length ? "Attenzione: " + gate.why.join("; ") + ". " : "") +
             "Chi non va bene porta il perché, e si può scegliere lo stesso.",
      options: rows.map(r => ({ id: String(r.unit.uid),
        label: `${r.unit.name}${r.dist ? " · " + r.dist.toFixed(1) + "″" : ""}${r.check.ok ? "" : " — " + r.check.why.join("; ")}` })),
    });
    if (!pick) return;
    const row = rows.find(r => String(r.unit.uid) === pick);
    target = row.unit; targetWhy = row.check.why;
  }

  /* 2 · il tiro di lancio, e il fiasco */
  const rolls = await G.askRolls([{ id:"lancio", kind:"d6", n:2,
    why:`tiro di lancio: ${sp.name} (${sp.cv}+${sp.bound ? ", Potere " + sp.potere : w.level ? ", Livello " + w.level : ""})` }],
    `${sp.name} di ${caster.name}`);
  if (!rolls || !rolls.lancio) return;
  let res = MG.castResult({ dice: rolls.lancio.dice, level: w.level, cv: sp.cv, cv2: sp.cv2 || 0,
                            bound: !!sp.bound, power: sp.potere || 0 });
  let mis = null, misRolls = null;
  if (res.miscast){
    misRolls = await G.askRolls([{ id:"fiasco", kind:"d6", n:2, why:"tabella del fiasco (p. 109)" }], `Fiasco di ${caster.name}`);
    if (misRolls && misRolls.fiasco){
      mis = MG.miscastRead(misRolls.fiasco.total);
      if (mis.cast) res = { ...res, cast: true, perfect: !!mis.perfect, total: mis.atValue ? sp.cv : res.total };
    }
  }

  /* 3 · il dissolvimento, che sceglie l'avversario */
  const disp = res.cast && !res.perfect ? await offerDispel(caster, sp, { total: res.total }) : null;
  const final = res.cast && !(disp && disp.res.dispelled);

  /* 4 · i dadi dell'effetto: il D3 di una maledizione, i colpi di un dardo */
  let rolled = 0, hitRolls = null, hitCount = 0;
  const hits = MG.hitsOf(sp);
  const e = sp.effetto || {};
  if (final && target && e.modificheDado){
    const r = await G.askRolls([{ id:"effetto", kind: /d3/i.test(e.modificheDado.dado) ? "d3" : "d6", n:1,
                                  why:`${sp.name}: ${e.modificheDado.dado}` }], sp.name);
    rolled = r && r.effetto ? r.effetto.total : 0;
  }
  if (final && target && hits){
    const spec = MG.parseDice(hits.dadi);
    if (spec && spec.n){
      hitRolls = await G.askRolls([{ id:"colpi", kind: spec.die === 3 ? "d3" : "d6", n: spec.n,
                                     why:`${sp.name}: ${hits.dadi} colpi` }], sp.name);
      hitCount = hitRolls && hitRolls.colpi ? MG.diceTotal(spec, hitRolls.colpi.dice) : 0;
    } else hitCount = spec ? spec.plus : 0;
  }
  /* I colpi di un incantesimo non tirano per colpire (p. 107): passano
     dalla stessa catena dello scontro con i colpi automatici, e senza
     armatura o rigenerazione quando l'incantesimo lo dice. */
  let volley = null, kills = 0;
  if (final && target && hits && hitCount > 0){
    const def = CB.combatant(target);
    const side = { ...def, armour: hits.noArmour ? 0 : def.armour, regen: hits.noRegen ? 0 : def.regen };
    volley = CB.strike({ name: caster.name }, side, { attacks: hitCount, auto: true, strength: hits.S, ap: hits.AP,
                                                      label: sp.name });
    kills = CB.applyWounds({ ...side, spill: 0 }, volley.wounds);
  }

  act(sp.name, () => {
    if (forward) G.goStep(idx);
    caster.magic = { ...(caster.magic || {}), cast: {
      turn: state.game.turn, side: state.game.army,
      ids: [...(cs ? cs.ids : []), sp.id], stop: !!(cs && cs.stop) || !!(mis && mis.stop) } };
    const notes = [...gate.why, ...targetWhy];
    G.dispatch({ type:"cast", wizard: caster, spell: sp, army: caster.army,
      text: `${caster.name} lancia ${sp.name}${target && target !== host ? " su " + target.name : ""}: ${res.text}` +
            (notes.length ? ` [${notes.join("; ")}]` : "") }, rolls);
    if (mis) G.dispatch({ type:"roll", army: caster.army, why:"tabella del fiasco",
      text: `${caster.name}, fiasco — ${misRolls.fiasco.total}: ${mis.label}, ${mis.text}` }, misRolls);
    if (disp){
      if (disp.fated) setMagicState({ fated: { ...magicState().fated, [turnKey()]: true } });
      G.dispatch({ type:"dispel", spell: sp, army: disp.by ? disp.by.army : (caster.army === "A" ? "B" : "A"),
        text: `${disp.by ? disp.by.name : "La sorte"} contro ${sp.name}: ${disp.res.text}` +
              (disp.out ? ` — ${disp.outRolls.fiasco.total}: ${disp.out.label}, ${disp.out.text}` : "") }, disp.rolls);
    }
    if (!final) return;

    /* l'effetto a tempo, su chi lo riceve */
    const at = { turn: state.game.turn, side: state.game.army };
    const eff = MG.effectOf(sp, { at, rolled, casterName: caster.name });
    const who = sp.range === "self" ? (MG.selfAndUnit(sp) && host !== caster ? [caster, host] : [caster])
              : target ? [target] : [];
    if (eff) for (const x of who){
      if (MG.skipOn(sp, { armour: EF.val(x, "armour") })){
        G.logLine(`${sp.name}: ${x.name} non ha armatura da peggiorare.`, { army: caster.army });
        continue;
      }
      for (const id of MG.cancelled(sp, EF.effectsOf(x))) EF.removeEffect(x, id);
      EF.addEffect(x, eff);
    }
    if (sp.rip) setMagicState({ inPlay: [...magicState().inPlay, {
      spellId: sp.id, caster: caster.uid, target: target ? target.uid : null, army: caster.army,
      cv: sp.cv, total: res.total, perfect: !!res.perfect, turn: state.game.turn, side: state.game.army }] });

    if (volley){
      G.dispatch({ type:"roll", army: caster.army, why: sp.name + ": colpi",
        text: `${target.name}: ${hitCount} colpi a Forza ${hits.S}${hits.AP ? ", perforazione " + hits.AP : ""}` +
              `${hits.noArmour ? ", senza armatura" : ""} — ${volley.wounds} ferit${volley.wounds === 1 ? "a" : "e"}, ` +
              `${kills} modell${kills === 1 ? "o" : "i"} a terra` }, hitRolls);
      if (kills > 0) G.setLost(target, (target.lost || 0) + kills);
    }
    const manual = MG.manualOf(sp);
    if (manual) G.logLine(`${sp.name}, a mano: ${manual}.`, { army: caster.army });
  });
}

/* Un incantesimo che resta in gioco finisce quando il mago lo decide,
   quando il mago muore, o quando qualcuno lo dissolve (p. 111). Con lui
   se ne vanno gli effetti che aveva messo. */
function endSpell(i, why){
  const list = magicState().inPlay;
  const e = list[i];
  if (!e) return;
  act("incantesimo terminato", () => {
    for (const uid of [e.target, e.caster]){
      const x = unitByUid(uid);
      if (x) EF.removeEffect(x, "spell:" + e.spellId);
    }
    setMagicState({ inPlay: list.filter((_, k) => k !== i) });
    G.logLine(`${spellName(e.spellId)}: ${why}.`, { army: e.army });
  });
}

async function runDispelLater(i){
  const e = magicState().inPlay[i];
  const sp = e && MAGIC() && MAGIC().spell(e.spellId);
  const caster = e && unitByUid(e.caster);
  if (!sp || !caster) return;
  if (G.stepNow().id !== "conjuration")
    toast("Un incantesimo in gioco si dissolve nella congiurazione (p. 111): si tira lo stesso, lo decidete voi.");
  const disp = await offerDispel(caster, sp, { later: true });
  if (!disp) return;
  act("dissolvimento", () => {
    if (disp.fated) setMagicState({ fated: { ...magicState().fated, [turnKey()]: true } });
    G.dispatch({ type:"dispel", spell: sp, army: disp.by ? disp.by.army : (caster.army === "A" ? "B" : "A"),
      text: `${disp.by ? disp.by.name : "La sorte"} contro ${sp.name} in gioco: ${disp.res.text}` }, disp.rolls);
  });
  if (disp.res.dispelled) endSpell(i, "dissolto");
}

/* ---- la sagoma sul tavolo ----
   Sta in `state.extras`, che e' il secchio che i tre serializzatori
   copiano alla cieca: cosi' la sagoma si annulla, si salva e si
   condivide come tutto il resto, senza toccare tre moduli. */
const templateNow = () => (state.extras && state.extras.template) || null;

function setTemplate(t){
  state.extras = { ...(state.extras || {}), template: t };
}

function putTemplate(u, id){
  /* Si posa davanti alla bocca dell'arma, a meta' strada dal nemico
     piu' vicino: e' il punto che al tavolo si sceglie per primo, e da
     li' lo si trascina. */
  const near = shootPlanFor(u);
  const row = near && near.rows.find(r => r.canShoot);
  const aim = row ? row.aim : [u.x, u.y - unitD(u)];
  const ang = Math.atan2(aim[1] - u.y, aim[0] - u.x) * 180 / Math.PI;
  act("posa la sagoma", () => {
    setTemplate({ id, x: aim[0], y: aim[1], angle: ang, by: u.uid });
    if (state.game.on) G.goStep(8);
    G.dispatch({ type:"template", unit:u, army:u.army,
      what: SH.TEMPLATES[id].label.toLowerCase(),
      target: row ? row.unit : null });
  });
}

async function runBombard(u){
  const t = templateNow();
  if (!t || t.by !== u.uid) return;
  /* La distanza della deviazione la tira il dado di artiglieria, che e'
     anche il dado che dice il Mancato Colpo: sono lo stesso gesto, e
     per questo il vassoio si apre gia' impostato cosi'. */
  const rolls = await G.askRolls([{ id:"deviazione", kind:"scatter", dist:"artillery",
                                    why:"deviazione della sagoma",
                                    foot:"Il dado di artiglieria dice i pollici; il Mancato Colpo manda alla tabella dell'arma." }],
                                 `Bombardamento di ${u.name}`);
  if (!rolls || !rolls.deviazione) return;
  const d = rolls.deviazione;
  const out = SH.bombard({ aim: [t.x, t.y], template: t.id, angle: t.angle,
                           deg: d.deg || 0, inches: d.inches || 0,
                           hit: !!d.hit, misfire: !!d.misfire });

  if (out.misfire){
    const guasto = await G.askRolls([{ id:"guasto", kind:"d6", n:1, why:"tabella del Mancato Colpo" }],
                                    `Mancato Colpo di ${u.name}`);
    if (!guasto || !guasto.guasto) return;
    const face = (guasto.guasto.dice || [])[0] || 1;
    const read = SH.misfireRead("stone", face);
    act("Mancato Colpo", () => {
      if (state.game.on) G.goStep(9);
      G.dispatch({ type:"misfire", unit:u, army:u.army, text: read.text }, guasto);
    });
    return;
  }

  /* Chi resta sotto: sotto del tutto e' colpito, sotto in parte a 4+.
     I modelli sono quelli veri, basetta per basetta, non il rettangolo
     dell'unita'. */
  const cells = [];
  for (const foe of enemiesOf(u))
    for (const c of FM.worldCells(foe, layoutOf(foe)))
      cells.push({ ...c, foe });
  const under = SH.modelsUnder(cells.map((c, i) => ({ ...c, cell: i })), out.shape);
  let hits = SH.templateHits(under);
  if (under.partial.length){
    const parziali = await G.askRolls([{ id:"parziali", kind:"d6", n: under.partial.length,
                                         need: SH.PARTIAL_NEED, why:"chi e' sotto solo in parte" }],
                                      `Sagoma di ${u.name}`);
    if (parziali && parziali.parziali) hits = SH.templateHits(under, parziali.parziali.dice);
  }

  /* Quanti per unita': la sagoma non conosce i reggimenti, li conosce
     il tavolo. */
  const perUnit = new Map();
  for (const i of hits.cells || []){
    const foe = cells[i].foe;
    perUnit.set(foe, (perUnit.get(foe) || 0) + 1);
  }
  const detta = [...perUnit.entries()].map(([f, n]) => `${f.name}: ${n}`).join(", ");

  act("bombardamento", () => {
    setTemplate({ ...t, x: out.to[0], y: out.to[1] });
    if (state.game.on) G.goStep(9);
    G.dispatch({ type:"scatter", unit:u, army:u.army,
      text: `${out.text} Sotto: ${hits.full} del tutto, ${hits.partial} in parte` +
            (detta ? ` — ${detta}` : " — nessuno") }, rolls);
  });
  if (!perUnit.size) return toast("La sagoma è caduta sul vuoto.");
  act("perdite dalla sagoma", () => {
    if (state.game.on) G.goStep(11);
    for (const [foe, n] of perUnit) G.setLost(foe, (foe.lost || 0) + n);
  });
  for (const [foe, n] of perUnit) await panicCheck(foe, n, `la sagoma di ${u.name}`, u);
  for (const foe of perUnit.keys()) if (foe.dead) await panicWave("destroyed", foe);
}

/* ============================================================
   7e · LA FINE DELL'ASSALTO (Tappa 3)
   Il pannello dello scontro sapeva gia' tirare tutto un assalto e
   contare chi aveva vinto; quello che non sapeva era *portarlo sul
   tavolo*. Le perdite si segnavano con un pulsante, il test di rotta
   restava una frase dentro il pannello, e chi aveva perso lo si
   spostava a mano indovinando quale delle tre mosse all'indietro
   toccasse — con il risultato che nove volte su dieci si sceglieva la
   fuga, che e' la sola che tutti ricordano.

   Qui i quattro gesti tornano nell'ordine del manuale, e ognuno e'
   un'azione del motore: il risultato (p. 152 e dintorni), il test a
   tre esiti (p. 154), la mossa che l'esito impone (pp. 132-134),
   l'inseguimento con l'unita' travolta (p. 156).
   ============================================================ */
async function resolveCombat({ a, b, round }){
  const r = round;
  /* Due strade e non una: o qualcuno ha perso e tira per i nervi, o
     qualcuno non ha piu' nessuno in piedi — e allora non c'e' test da
     fare, c'e' uno sfondamento da tirare (p. 156). La seconda mancava,
     e il pannello scriveva «chi ha vinto sfonda» senza dare il modo di
     farlo. */
  if (!r || (!r.test && !r.wiped)) return;
  const loserTag = r.wiped || r.cr.loser;
  if (!loserTag) return;
  const loser  = loserTag === "A" ? a : b;
  const winner = loserTag === "A" ? b : a;

  /* 1 · le perdite e il conto, in una casella sola: sono la stessa
     cosa vista da due parti, e separarle vorrebbe dire due annulla per
     tornare indietro di un passo. */
  const parts = r.cr[loserTag === "A" ? "B" : "A"].parts
    .map(p => p.v + " " + (p.v === 1 ? p.one : p.many)).join(" + ");
  act("risultato del combattimento", () => {
    /* Le perdite si segnano nella casella in cui si combatte e il conto
       si fa in quella dopo: due caselle diverse, e passarci nell'ordine
       giusto e' la differenza fra un registro pulito e uno in cui ogni
       riga porta la nota «questo di solito si fa altrove». */
    if (state.game.on) G.goStep(12);
    for (const [u, n] of [[a, r.killsA], [b, r.killsB]])
      if (n > 0) G.setLost(u, (u.lost || 0) + n);
    if (state.game.on) G.goStep(13);
    G.dispatch({ type:"combatResult", army: winner.army, diff: r.cr.diff,
      text: winner.name + (r.wiped ? " spazza via " + loser.name : " vince di " + r.cr.diff) +
            (parts ? " (" + parts + ")" : "") });
  });

  /* 1 bis · la Frenzy (Tappa 5): «ogni modello che perde un round di
     combattimento perde subito questa regola». */
  if (!r.wiped && r.cr.loser && PS.losesFrenzy(psychFor(loser)))
    act("Frenzy persa", () => {
      loser.frenzyLost = true;
      G.logLine(`${loser.name} perde il round e con lui la Frenzy.`, { army: loser.army });
    });

  /* 2 · il test. I dadi sono quelli che il pannello ha appena mostrato
     cadere nel vassoio: rifarli qui vorrebbe dire scrivere nel
     registro un tiro diverso da quello che si e' visto. */
  if (r.test) act("test di rotta", () => {
    if (state.game.on) G.goStep(14);
    G.dispatch({ type:"breakTest", unit: loser, army: loser.army, outcome: r.test.outcome,
                 text: loser.name + " perde di " + r.cr.diff + ": " + r.test.text },
               { rotta: { dice: r.test.dice || [], total: r.test.natural || 0 } });
    /* Stubborn e Shieldwall valgono una volta per partita: la spesa sta
       sull'unita', dentro la stessa azione, cosi' l'annulla la riporta
       indietro insieme al test (Tappa 5 bis). */
    if (r.test.stubborn) EF.spend(loser, "stubborn");
    if (r.test.shieldwall) EF.spend(loser, "shieldwall");
  });

  /* 3 · la mossa che l'esito impone. Le tre le sa gia' fare la Tappa
     2: qui cambia solo chi decide quale, e non e' piu' il dito. */
  const mv = r.test && r.test.move ? await runBackward(loser, r.test.move) : null;
  /* chi rompe e fugge dal combattimento manda al Panico gli amici entro
     6″, e chi e' stato spazzato via anche (Tappa 5) */
  if (r.test && r.test.outcome === "rout") await panicWave("broke", loser);
  if (r.wiped) await panicWave("destroyed", loser);

  /* 4 · l'inseguimento. Si insegue chi e' andato in rotta; si sfonda
     quando davanti non e' rimasto nessuno. Raggiunge se copre almeno
     la distanza che l'altro ha fatto fuggendo. */
  const wiped = !!r.wiped || loser.dead;
  if (!wiped && (!r.test || r.test.outcome !== "rout")) return;
  /* Il nome della richiesta non e' un dettaglio: il motore riconosce i
     tiri per identificatore, e l'inseguimento e lo sfondamento — che
     sono lo stesso tiro — nel vocabolario si chiamano in due modi
     diversi. Chiamarli tutti e due «inseguimento» voleva dire uno
     sfondamento che non finiva nel registro e non muoveva nessuno,
     senza nemmeno un errore da leggere. */
  const wanted = wiped ? "sfondamento" : "inseguimento";
  const spec = { ...ML.pursuitDice(MV.swiftOf(winner)), id: wanted,
                 why: wiped ? "quanto sfonda" : "quanto insegue" };
  const rolls = await G.askRolls([spec], `${wiped ? "Sfondamento" : "Inseguimento"} di ${winner.name}`);
  if (!rolls || !rolls[wanted]) return;
  const roll = rolls[wanted].total;
  const out = ML.pursuitOutcome({ roll, flee: mv ? mv.inches : 0, wiped });
  const move = CH.pursuitMove(boxOf(winner), asPiece(loser), { roll });
  act(wiped ? "sfondamento" : "inseguimento", () => {
    if (state.game.on) G.goStep(15);
    G.dispatch({ type: wiped ? "overrun" : "pursue", unit: winner, target: loser,
                 army: winner.army, dice: spec.n, caught: out.caught,
                 text: winner.name + " " + out.text }, rolls);
    if (move){
      MV.ensureAnchor(winner);
      winner.x = move.to.x; winner.y = move.to.y; winner.rot = move.to.rot;
      winner.moved = { kind: wiped ? "overrun" : "pursue", inches: move.inches };
    }
    if (out.caught) G.destroy(loser);
  });
  if (out.caught) await panicWave("destroyed", loser);
}

/* ============================================================
   7e · LA MIRA
   Selezionata un'unita' nella fase di tiro — o nella dichiarazione
   delle cariche, o con il mirino di un incantesimo — una linea segue il
   puntatore dal bordo dell'unita' e dice subito se ci si arriva: verde
   a corta gittata (o una carica che arriva col Movimento), gialla a
   lunga gittata (o una carica che chiede un tiro), rossa oltre la
   portata, grigia tratteggiata quando la vista e' tagliata o si e' fuori
   dall'arco frontale. Sopra un bersaglio il cartellino dice quanti
   tirano, che punteggio serve e perche' — o da che lato si prende il
   nemico caricando — e il clic gioca il gesto. Esc la toglie.

   Le regole sono quelle dei pannelli, non una copia: il cartellino
   legge `shootPlanFor`, `chargePlanFor` e `magicTargets`, e la vista
   dal punto libero e' quella di `sight.js`.
   ============================================================ */
let aimAt = null, aimPick = null, aimRaf = 0;
const r1 = v => Math.round(v * 10) / 10;

/* La mira di adesso: quella scelta col mirino, o quella che la fase
   accende da sola. `aimPick` con `off` e' la mira tolta con Esc, e vale
   finche' non si seleziona un'altra unita'. */
function aimNow(){
  const u = state.sel && state.sel.type === "unit" ? state.units.find(x => x.uid === state.sel.id) : null;
  if (!u || !u.placed || u.dead || isJoined(u)) return null;
  if (aimPick && aimPick.uid === u.uid) return aimPick.off ? null : { ...aimPick, unit: u };
  if (!state.game.on || G.deploying()) return null;
  const now = G.stepNow();
  if (now.phaseId === "shooting" && (CB.rangedWeapons(u).length || u.maxRange)) return { kind: "shoot", uid: u.uid, unit: u };
  if (now.id === "declare" && (MV.moveOf(u) || movementBands(u))) return { kind: "charge", uid: u.uid, unit: u };
  return null;
}

const aimSpellOf = a => { const M = MAGIC(); return (M && a.spellId && M.spell(a.spellId)) || null; };

/* il pezzo sotto il puntatore, fra quelli che quel gesto puo' prendere */
function aimTarget(a, p){
  let pool;
  if (a.kind === "spell"){
    const sp = aimSpellOf(a);
    const friendly = !!sp && (sp.type === "enchantment" || sp.type === "conveyance");
    pool = state.units.filter(o => o.placed && !o.dead && !isJoined(o) && o !== a.unit &&
                                   (friendly ? o.army === a.unit.army : o.army !== a.unit.army));
  } else pool = enemiesOf(a.unit);
  return pool.find(o => SG.pointInPoly(p, corners(o))) || null;
}

/* la vista verso un punto libero: basta un modello della prima fila che
   ci arrivi senza niente in mezzo (p. 103) */
function freeSight(u, p){
  const S = sightNow(), me = S.byUid.get(u.uid);
  if (!me) return null;
  const opts = { terrain: S.terrain, others: S.units.filter(x => x !== me), fromHill: me.hill, toHill: "" };
  let first = null;
  for (const c of eyesOf(me)){
    const look = SG.lookLine([c.wx, c.wy], p, opts);
    if (!look.blocked) return null;
    first = first || look.blocked;
  }
  return first;
}

function aimShot(u, target, dist, p, inArc){
  const plan = shootPlanFor(u);
  if (!plan) return null;
  if (target){
    const row = plan.rows.find(r => r.unit.uid === target.uid);
    if (!row) return null;
    const name = shortName(target.name);
    if (!row.canShoot){
      const why = row.blocked ? `vista tagliata da ${row.blockedBy}` : !row.inArc ? "fuori arco frontale"
                : `fuori gittata: ${fmtIn(r1(row.dist))}″ di ${fmtIn(plan.range)}″`;
      return { tone: row.blocked || !row.inArc ? "blocked" : "far", lines: [name, why, "clic: tira lo stesso"] };
    }
    const f = shotOn(u, row, plan);
    const mods = f.mods.list.map(m => `${m.v} ${m.why}`).join(", ");
    return { tone: row.long ? "long" : "ok", lines: [
      `${name} · ${fmtIn(r1(row.dist))}″ · ${row.long ? "lunga gittata" : "corta gittata"}`,
      `${f.shots} tir${f.shots === 1 ? "o" : "i"} da ${f.survey.n} modell${f.survey.n === 1 ? "o" : "i"} · ${hitText(f)} per colpire`,
      ...(mods ? [mods] : []),
      ...(f.survey.coverWhy ? [`riparo: ${f.survey.coverWhy} (p. ${SG.PAGE.cover})`] : []),
      `≈ ${f.kills.toFixed(1)} perdite · clic per tirare`,
      ...(plan.gate.can ? [] : [`attenzione: ${plan.gate.why.join("; ")}`]),
    ]};
  }
  const head = `${plan.weapon ? plan.weapon.name + " · " : ""}${fmtIn(r1(dist))}″ di ${fmtIn(plan.range)}″`;
  if (!inArc) return { tone: "blocked", lines: [head, "fuori arco frontale"] };
  const blocked = freeSight(u, p);
  if (blocked) return { tone: "blocked", lines: [head, `vista tagliata da ${SG.blockerLabel(blocked)}`] };
  if (dist > plan.range) return { tone: "far", lines: [head, `oltre la gittata di ${fmtIn(r1(dist - plan.range))}″`] };
  if (dist > plan.range / 2) return { tone: "long", lines: [head, "lunga gittata: −1 per colpire"] };
  return { tone: "ok", lines: [head, "corta gittata"] };
}

function aimCharge(u, target, dist, p, inArc){
  const plan = chargePlanFor(u);
  if (!plan) return null;
  const warn = plan.pre.can ? [] : [`attenzione: ${plan.pre.why.join("; ")}`];
  if (target){
    const row = plan.rows.find(r => r.unit.uid === target.uid);
    if (!row) return null;
    const head = `${shortName(target.name)} · ${fmtIn(r1(row.dist))}″ · lo prende di ${row.side} (p. 127)`;
    if (!row.can) return { tone: row.impossible && !row.blocked && row.inArc ? "far" : "blocked",
      lines: [head, row.reasons.map(r => r.text).join("; "), "clic: dichiara lo stesso", ...warn] };
    return { tone: row.need ? "long" : "ok", lines: [head,
      row.need ? `serve ${fmtIn(row.need)}″ di tiro · ${Math.round(row.chance * 100)} volte su 100` : "ci arriva col Movimento",
      "clic per dichiarare la carica", ...warn] };
  }
  const head = `carica · ${fmtIn(r1(dist))}″ di ${fmtIn(plan.max)}″`;
  if (!inArc) return { tone: "blocked", lines: [head, "fuori arco frontale: non si carica"] };
  const blocked = flies(u) ? null : freeSight(u, p);
  if (blocked) return { tone: "blocked", lines: [head, `vista tagliata da ${SG.blockerLabel(blocked)}`] };
  if (dist > plan.max) return { tone: "far", lines: [head, `oltre la carica massima di ${fmtIn(r1(dist - plan.max))}″`] };
  const need = r1(Math.max(0, dist - plan.move));
  if (need > 0) return { tone: "long", lines: [head,
    `serve ${fmtIn(need)}″ di tiro · ${Math.round(CH.chargeChance(need, plan.swift) * 100)} volte su 100`] };
  return { tone: "ok", lines: [head, "ci arriva col Movimento"] };
}

function aimCast(a, host, target, dist, p, inArc){
  const sp = aimSpellOf(a);
  if (!sp) return null;
  const range = typeof sp.range === "number" ? sp.range : 0;
  const head = `${sp.name} · ${fmtIn(r1(dist))}″${range ? " di " + fmtIn(range) + "″" : ""}`;
  if (target){
    const row = magicTargets(host, sp).find(r => r.unit.uid === target.uid);
    if (!row) return { tone: "blocked", lines: [head, "non è un bersaglio per questo incantesimo"] };
    return { tone: row.check.ok ? "ok" : range && row.dist > range ? "far" : "blocked",
             lines: [`${shortName(target.name)} · ${fmtIn(r1(row.dist))}″`,
                     row.check.ok ? "bersaglio valido" : row.check.why.join("; "),
                     `clic per lanciare ${sp.name}`] };
  }
  if (!inArc) return { tone: "blocked", lines: [head, "fuori arco frontale"] };
  const blocked = freeSight(host, p);
  if (blocked) return { tone: "blocked", lines: [head, `vista tagliata da ${SG.blockerLabel(blocked)}`] };
  if (range && dist > range) return { tone: "far", lines: [head, `oltre la gittata di ${fmtIn(r1(dist - range))}″`] };
  return { tone: "ok", lines: [head, "in gittata"] };
}

/* Che cosa dice la mira in un punto del tavolo, in millimetri: la linea
   da disegnare, il colore e il cartellino. Esportata perche' e' quella
   che si prova senza muovere un mouse. */
export function aimVerdict(p){
  const a = aimNow();
  if (!a || !p) return null;
  const u = a.unit;
  const target = aimTarget(a, p);
  const cp = closestPoints(corners(u), target ? corners(target) : [p]);
  const dist = inch(cp.d);
  const inArc = !!u.loose || FM.arcOf(p, boxOf(u)) === "fronte";
  const v = a.kind === "shoot" ? aimShot(u, target, dist, p, inArc)
          : a.kind === "charge" ? aimCharge(u, target, dist, p, inArc)
          : aimCast(a, u, target, dist, p, inArc);
  return v && { ...v, kind: a.kind, from: cp.a, to: target ? cp.b : p, target };
}
export function setAimPoint(p){ aimAt = p; }

const AIM_TONE = { ok: "var(--ok)", long: "var(--warn)", far: "var(--bad)", blocked: "var(--muted)" };

function drawAim(svg, g){
  const v = aimVerdict(aimAt);
  if (!v) return;
  const col = AIM_TONE[v.tone];
  const layer = g(svg, "g", { "pointer-events": "none", class: "aim" });
  if (v.target) g(layer, "polygon", { points: corners(v.target).map(q => q.join(",")).join(" "),
                                      fill: col, "fill-opacity": .14, stroke: col, "stroke-width": px(2) });
  g(layer, "line", { x1: v.from[0], y1: v.from[1], x2: v.to[0], y2: v.to[1], stroke: col,
                     "stroke-width": px(3), "stroke-linecap": "round",
                     "stroke-dasharray": v.tone === "blocked" ? `${px(7)} ${px(6)}` : "none" });
  g(layer, "circle", { cx: v.from[0], cy: v.from[1], r: px(4), fill: col });
  g(layer, "circle", { cx: v.to[0], cy: v.to[1], r: px(6), fill: "none", stroke: col, "stroke-width": px(2) });
  /* il cartellino sta accanto al puntatore, dentro il tavolo */
  const fs = px(13), lh = px(17), pad = px(8);
  const w = Math.max(...v.lines.map(l => l.length)) * fs * 0.56 + pad * 2;
  const h = v.lines.length * lh + pad;
  const x = Math.max(0, Math.min(aimAt[0] + px(18), state.tableW - w));
  const y = Math.max(0, Math.min(aimAt[1] + px(18), state.tableH - h));
  g(layer, "rect", { x, y, width: w, height: h, rx: px(5), fill: "var(--panel)", stroke: col,
                     "stroke-width": px(1.5), opacity: .97 });
  v.lines.forEach((l, i) => {
    const t = g(layer, "text", { x: x + pad, y: y + pad / 2 + lh * (i + 0.75), "font-size": fs,
                                 fill: i ? "var(--muted)" : "var(--ink)", "font-weight": i ? 400 : 600 });
    t.textContent = l;
  });
}

/* il puntatore sul tavolo: si ridisegna una volta per fotogramma */
function trackAim(e){
  const a = aimNow();
  if (!a && !aimAt) return;
  aimAt = a ? toSvg(e) : null;
  if (!aimRaf) aimRaf = requestAnimationFrame(() => { aimRaf = 0; drawBoard(); });
}

/* il mirino nei pannelli: accende la mira di quel gesto, o la spegne */
function aimButton(u, kind, casterUid = "", spellId = ""){
  const a = aimNow();
  const on = !!a && a.uid === u.uid && a.kind === kind && (kind !== "spell" || a.spellId === spellId);
  const what = { shoot: "il tiro", charge: "la carica", spell: "l'incantesimo" }[kind];
  return `<button class="btn tiny${on ? " on" : ""}" data-aim="${kind}|${casterUid}|${spellId}"
    title="Mira: una linea segue il puntatore e dice se ${what} arriva; clic su un bersaglio per giocarlo, Esc per togliere">🎯</button>`;
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
      const box = boxOf(u);
      /* le unita' fanno ombra come il terreno (p. 103), salvo che si
         guardi dalla collina oltre chi non ci sta (p. 271) */
      const S = sightNow(), me = S.byUid.get(u.uid);
      const shade = S.units.filter(x => x !== me && !(me && me.hill === "all" && !x.hill))
        .flatMap(x => x.loose ? x.cells.map(SG.cellPoly) : [x.poly])
        .map(poly => ({ poly, circle: false, contains: () => false }));
      const blockers = [...pieces.filter(p => p.blocks), ...shade];
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
          ? `${hitText(f)} · ${f.kills.toFixed(1)} mod.`
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
  if (state.game.on && state.game.deploying) add("Schieramento", "turn", [], null);
  else if (state.game.on){
    const s = G.score();
    add(`T${state.game.turn} ${G.phaseLabel()}`, "turn", [], null);
    add(`−${s.A.lostPts} / −${s.B.lostPts} pt`, "", [], null);
  }
}
function renderAll(){
  reindex(); syncImportBox(); renderArmies(); renderInspector(); renderTerrainList(); renderMarkerList();
  G.renderGamePanel($("#game"), { esc });
  stupidityPrompt();
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
  /* con le zone disegnate a mano un esercito puo' non averne nessuna:
     l'elenco vuoto e' un caso vero, non un errore, e allora il tavolo
     intero fa da zona */
  const zone = zonesFor(u.army, sc)[0] || R(0, 0, state.tableW, state.tableH);
  u.rot = defaultRot(u.army, sc);
  u.placed = true;
  const [x, y] = findSpot(u, zone, sc);
  u.x = x; u.y = y;
  /* schierare non e' muoversi. Mentre si schiera non c'e' nessun
     movimento da misurare; a partita avviata (un rinforzo che entra)
     l'ancora riparte da dove il pezzo e' appena stato messo, sennò il
     primo movimento risulterebbe misurato dalla riserva */
  if (G.deploying()) MV.clearAnchor(u); else MV.setAnchor(u);
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

  /* modalità «disegna una zona»: il trascinamento sul vuoto diventa un
     rettangolo invece che uno scorrimento. È il gesto con cui qualsiasi
     scenario diventa rappresentabile senza che l'app lo conosca. */
  if (state.zoning){
    state.zonePts = { x0:p[0], y0:p[1], x1:p[0], y1:p[1] };
    try { svgEl.setPointerCapture(e.pointerId); } catch (_) {}
    return;
  }

  /* con la mira accesa il clic su un bersaglio gioca il gesto invece di
     selezionarlo: tiro, carica o incantesimo. Sul resto del tavolo il
     clic fa quello che ha sempre fatto. */
  const aim = e.button === 0 ? aimNow() : null;
  const aimed = aim && aimTarget(aim, p);
  if (aimed){
    aimAt = null;
    if (aim.kind === "shoot") runShot(aim.unit, aimed.uid);
    else if (aim.kind === "charge") runCharge(aim.unit, aimed.uid);
    else runCast(unitByUid(aim.casterUid), aim.spellId, aimed.uid);
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
     un tasto per dirlo. Chi schiera invece sta solo mettendo il pezzo. */
  if (obj.uid !== undefined && !G.deploying()) MV.ensureAnchor(obj);
  drag = { obj, dx: obj.x - p[0], dy: obj.y - p[1], moved:false };
  /* la regola del pollice (p. 118) guarda solo i nemici nuovi: chi era
     gia' a contatto o vicino prima di muoversi non va avvisato di nuovo */
  if (obj.uid !== undefined && !G.deploying())
    drag.near0 = new Set(tooNearFoes(obj).map(n => n.unit.uid));
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
  /* la mira segue il puntatore quando non si sta trascinando niente */
  if (!sizing && !zoneDrag && !state.zonePts && !spin && !drag) trackAim(e);
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
  const release = () => { try { svgEl.releasePointerCapture(e.pointerId); } catch (_) {} };
  if (sizing){ sizing = null; release(); renderAll(); return; }
  if (zoneDrag){ zoneDrag = null; release(); syncTableUI(); renderAll(); return; }
  if (state.zonePts){
    const z = state.zonePts;
    state.zonePts = null;
    release();
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
    release();
    renderAll();
    return;
  }
  if (!drag) return;
  /* Un pezzo toccato e non spostato ha solo cambiato la selezione: il
     passo aperto al pointerdown si toglie, sennò per tornare indietro
     di un movimento vero ne servirebbero due. */
  if (!drag.moved) history.discard();
  /* Il pollice (p. 118): fuori da una carica nessuno finisce entro 1″
     da un nemico, e a contatto ci si arriva caricando. L'app non
     impedisce: lo dice, e il pezzo resta dove l'hai lasciato. */
  if (drag.moved && drag.near0){
    const fresh = tooNearFoes(drag.obj).filter(n => !drag.near0.has(n.unit.uid));
    if (fresh.length){
      const n = fresh[0], me = shortName(drag.obj.name), foe = shortName(n.unit.name);
      toast(n.gap < 0.05
        ? `${me} tocca ${foe} senza caricare: a contatto si arriva con la carica (p. 118). Fianco e retro contano lo stesso.`
        : `${me} è a ${fmtIn(Math.round(n.gap * 10) / 10)}″ da ${foe}: fuori da una carica nessuno si ferma entro 1″ da un nemico (p. 118).`);
    }
  }
  drag = null;
  try { svgEl.releasePointerCapture(e.pointerId); } catch (_) {}
  renderAll();
}

/* i nemici entro un pollice, da bordo a bordo */
function tooNearFoes(u){
  const poly = corners(u);
  return enemiesOf(u)
    .map(o => ({ unit: o, gap: inch(polyDistance(poly, corners(o))) }))
    .filter(n => n.gap < 1 - 0.01)
    .sort((a, b) => a.gap - b.gap);
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
svgEl.addEventListener("pointerleave", () => { if (aimAt){ aimAt = null; drawBoard(); } });

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

  /* Esc toglie la mira, finche' non si sceglie un'altra unita' */
  if (e.key === "Escape"){
    const a = aimNow();
    if (a){ aimPick = { uid: a.uid, off: true }; aimAt = null; renderInspector(); drawBoard(); return; }
  }

  if (!state.sel) return;
  const isUnit = state.sel.type === "unit";
  const obj = selectedObject();
  if (!obj) return;
  const step = e.shiftKey ? MM : MM / 4;
  const turn = isUnit ? 90 : 15;
  /* anche le frecce sono un movimento: l'ancora si mette qui come si
     mette al primo trascinamento */
  if (isUnit && /^Arrow/.test(e.key) && !G.deploying()) MV.ensureAnchor(obj);
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
  act("schiera tutto", () => {
    autoDeploy();
    if (G.deploying()) for (const u of state.units) MV.clearAnchor(u);
    else MV.anchorAll(state.units);
  }, { render:false }));
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
    distances:state.distances, arcs:state.arcs, move:state.move, shoot:state.shoot,
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
  state.move = !!s.move;
  state.shoot = !!s.shoot;
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
  syncTableUI();
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
  /* i domini della magia (Tappa 6): se il file non arriva, il blocco
     della magia non compare e il resto del tavolo funziona */
  await MG.loadMagic();
  fillScenarioSelect();
  G.initGame({ getState: () => state, act });
  initDuel($("#duel"), {
    unit: uid => state.units.find(u => u.uid === uid) || null,
    setSave: (u, key, v) => act({ armour:"armatura", ward:"salvezza speciale", regen:"rigenerazione" }[key] || "salvezza",
                                () => { u[key] = v; }),
    /* Il pannello dello scontro non sa niente del tavolo, ed e' giusto
       cosi': quando l'assalto e' finito chiede a noi di portarne
       l'esito sui pezzi. */
    resolveCombat,
    /* la psicologia che lo scontro sente (Tappa 5): i personaggi uniti,
       e la Paura con l'esito del test gia' tirato in questo turno */
    joined: u => attachedOf(u),
    /* Quanti modelli toccano davvero il nemico. Il conto degli attacchi
       partiva da una stima — la prima fila larga quanto la più stretta
       delle due — e due unità che si incontrano d'angolo si toccano con
       tre modelli mentre la stima ne dava cinque. Le basette lo sanno,
       e stanno tutte qui. */
    touching: (u, foe) => {
      const lay = layoutOf(u);
      return FM.touchingModels(FM.worldCells(u, lay), corners(foe));
    },
    /* Fianco, retro e disordine guardando il tavolo, a ogni round (pp.
       101, 152-153). Il bonus e' della parte: conta chiunque del mio
       esercito tocchi quel nemico, e fianco e retro si sommano se a
       prenderli sono due unita' diverse. Se le due unita' non si toccano
       `flank` resta null e il pannello tiene quello della carica. */
    tableSide: (u, foe) => {
      const pairs = contactsNow().filter(c => c.enemy);
      const touch = (x, y) => pairs.some(c => (c.a === x.uid && c.b === y.uid) || (c.b === x.uid && c.a === y.uid));
      const out = { flank: null, flankWhy: "", disrupted: false, disruptedWhy: "" };
      if (touch(u, foe)){
        const mine = state.units.filter(x => x.army === u.army && x.placed && !x.dead && !isJoined(x) && touch(x, foe))
          .map(x => ({ x, arc: FM.arcOfPoly(corners(x), boxOf(foe)).arc }));
        const flank = mine.some(m => m.arc === "fianco"), rear = mine.some(m => m.arc === "retro");
        out.flank = flank && rear ? "both" : rear ? "rear" : flank ? "flank" : "";
        const side = mine.filter(m => m.arc !== "fronte");
        out.flankWhy = side.length
          ? side.map(m => `${shortName(m.x.name)} sul ${m.arc} di ${shortName(foe.name)}`).join("; ")
          : `${shortName(u.name)} è sul fronte di ${shortName(foe.name)}`;
      }
      /* In disordine chi e' preso sul fianco o sul retro da un'unita' con
         Forza d'Unita' 5 o piu' (p. 101); la fanteria pesante in ordine
         chiuso o aperto regge fino a 10 (p. 191), e gli schermagliatori
         non disordinano nessuno (p. 185). */
      const heavy = troopType(u.troop).id === "heavyInfantry" && !u.loose;
      const need = heavy ? 10 : 5;
      const hit = state.units
        .filter(x => x.army !== u.army && x.placed && !x.dead && !isJoined(x) && !x.loose && touch(u, x))
        .map(x => ({ x, arc: FM.arcOfPoly(corners(x), boxOf(u)).arc, us: usOf(x) }))
        .find(h => h.arc !== "fronte" && h.us >= need);
      if (hit){
        out.disrupted = true;
        out.disruptedWhy = `preso sul ${hit.arc} da ${shortName(hit.x.name)}, Forza d'Unità ${hit.us}` +
          (heavy ? " (la fanteria pesante regge fino a 10)" : "") + " (p. 101)";
      }
      return out;
    },
    /* Il terreno piu' alto: chi ha la prima fila sulla collina e chi no
       (p. 152). Tutti e due sopra, o nessuno, si annullano (p. 153). */
    groundFor: (a, b) => {
      const S = sightNow(), A = S.byUid.get(a.uid), B = S.byUid.get(b.uid);
      if (!A || !B) return { id: "", why: "" };
      const front = s => s.cells.filter(c => s.loose || SH.rankOf(c.cell, s.front) === 0).map(c => [c.wx, c.wy]);
      const ha = SG.hillShare(front(A), S.terrain) > 0.5, hb = SG.hillShare(front(B), S.terrain) > 0.5;
      if (ha === hb) return { id: "", why: ha ? "Tutti e due con la prima fila sulla collina: si annullano (p. 153)." : "" };
      return { id: ha ? "me" : "foe",
               why: `Dal tavolo: ${shortName((ha ? a : b).name)} combatte con la prima fila sulla collina (p. 152).` };
    },
    fearFor: (u, foe) => PS.fearCheck({ me: psychFor(u), foe: psychFor(foe), meUS: usOf(u), foeUS: usOf(foe),
                                        when:"combat", tested: fearTested(u), foeName: foe.name }),
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
         setScenario, refreshLinks, history, view, act, toast, effModels,
         /* esposte perché sono geometria pura e vanno provate: dove
            finisce un pezzo trascinato, e cosa sta sotto una sagoma */
         snapUnit, modelsUnder };
