/* Schieramento Old World — editor grafico della formazione
 *
 * Una finestra sola per un gesto solo: mettere i modelli dove li metti
 * al tavolo. In ordine chiuso si sceglie la sagoma e la larghezza di
 * fronte, e la griglia fa il resto; in formazione sciolta ogni base si
 * trascina dove si vuole, perche' due schermagliature non sono mai
 * uguali e obbligare tutti alla stessa nuvola vorrebbe dire disegnare
 * una cosa e giocarne un'altra.
 *
 * Qui dentro si fanno anche le altre due cose che riguardano la
 * composizione dell'unita' e non la sua posizione sul tavolo:
 *   · unire i personaggi al reggimento e dargli una casella precisa;
 *   · segnare quale modello e' caduto, a partita aperta, invece di
 *     scrivere un numero e lasciare che l'app scelga chi togliere.
 *
 * Non tiene stato del tavolo: riceve da deploy.js come si legge lo
 * stato e come si registra una modifica (act, per l'annulla), e a ogni
 * cambiamento ridisegna se stesso e il campo.
 */

import { $, esc, inch, MM } from './util.js';
import * as F from './formation.js';

let ctx = null;          // { getState, act, renderAll, aliveOf, gameOn, setLost }
let openUid = null;
let selCell = null;      // { kind:"model", i } | { kind:"char", uid }
let markMode = false;    // clic sul modello = segna la perdita
let snapOn = true;
/* Mentre si trascina una base, la finestra NON si puo' ricostruire: il
   nodo che ha catturato il puntatore sparirebbe e il trascinamento
   morirebbe al primo movimento. Ogni modifica passa da act(), che
   ridisegna tutto: questa e' la valvola che tiene fuori la finestra. */
let dragging = false;

export function initFormEditor(c){ ctx = c; }

const S = () => ctx.getState();
const unitById = uid => S().units.find(u => u.uid === uid) || null;
export const isOpen = () => openUid !== null;

/* ============================================================
   1 · APRIRE E CHIUDERE
   ============================================================ */
export function openEditor(uid){
  const u = unitById(uid);
  if (!u) return;
  F.ensureFormation(u);
  openUid = uid;
  selCell = null;
  markMode = false;
  render();
}

export function closeEditor(){
  openUid = null;
  selCell = null;
  const host = $("#formation-modal");
  if (host) host.remove();
  document.removeEventListener("keydown", onKey, true);
}

/* la finestra si riapre da sola quando il tavolo cambia sotto (annulla,
   perdite segnate dall'ispettore): se non c'e' piu' l'unita', si chiude */
export function refreshEditor(){
  if (openUid === null || dragging) return;
  if (!unitById(openUid)) return closeEditor();
  render();
}

function onKey(e){
  if (openUid === null) return;
  if (e.key === "Escape"){ e.preventDefault(); closeEditor(); return; }
  if (/input|select|textarea/i.test(e.target.tagName)) return;
  const u = unitById(openUid);
  if (!u || !selCell || selCell.kind !== "model") return;
  if (F.ensureFormation(u).mode !== "free") return;
  const step = e.shiftKey ? 5 : 1;
  const shift = (dx, dy) => {
    e.preventDefault();
    edit("sposta modello", () => {
      const cells = F.baseCells(u, u.models);
      cells[selCell.i].x += dx;
      cells[selCell.i].y += dy;
      writeSlots(u, cells);
    }, 600);
  };
  switch (e.key){
    case "ArrowLeft":  return shift(-step, 0);
    case "ArrowRight": return shift(step, 0);
    case "ArrowUp":    return shift(0, -step);
    case "ArrowDown":  return shift(0, step);
    case "q": case "Q": return rotateModel(u, -15);
    case "e": case "E": return rotateModel(u, 15);
  }
}

/* ogni modifica passa da qui: entra nella storia dell'annulla,
   ridisegna il tavolo e poi la finestra */
function edit(label, fn, coalesce = 0){
  /* act() ridisegna il tavolo, e ridisegnando chiama refreshEditor():
     la finestra si rifa' da sola, non serve rifarla qui */
  ctx.act(label, fn, { coalesce });
}

/* scrivere le posizioni a mano promuove la formazione a «come l'hai
   messa»: da quel momento nessun preset la sovrascrive piu' da solo */
function writeSlots(u, cells){
  const f = F.ensureFormation(u);
  f.mode = "free";
  f.preset = "custom";
  f.slots = cells.map(c => ({
    x: Math.round((+c.x || 0) * 10) / 10,
    y: Math.round((+c.y || 0) * 10) / 10,
    rot: Math.round(c.rot || 0),
  }));
  f.rev = (f.rev || 0) + 1;
}

function rotateModel(u, deg){
  edit("ruota modello", () => {
    const cells = F.baseCells(u, u.models);
    const c = cells[selCell.i];
    c.rot = ((((c.rot || 0) + deg) % 360) + 360) % 360;
    writeSlots(u, cells);
  }, 600);
}

/* ============================================================
   2 · IL DISEGNO DELLA FORMAZIONE
   Nell'editor si vedono TUTTI i modelli, anche i caduti: sbiaditi e
   con la croce. Sul tavolo spariscono, ma qui serve poterli rimettere
   in piedi quando si e' segnato quello sbagliato.
   ============================================================ */
function editorCells(u){
  const f = F.ensureFormation(u);
  const total = Math.max(1, u.models || 1);
  const gone = F.fallenSet(u, ctx.aliveOf(u));
  const chars = F.attachedTo(S().units, u);

  /* Coordinate grezze, non ricentrate: qui si disegna quello che poi
     si riscrive, e ricentrare a ogni giro farebbe scivolare la
     formazione di un pelo a ogni trascinamento.
     Il layout a ranghi pieni e' la sagoma dell'unita' intera, quella
     che si sta disegnando, non quella ridotta dalle perdite. */
  const full = F.layout(u, { alive: total, attached: chars, raw: true });
  const cells = full.slots.map(s => ({ ...s, fallen: s.kind === "model" && gone.has(s.i) }));
  /* il riquadro tratteggiato e' l'ingombro VIVO, quello che l'unita'
     occupa sul tavolo adesso: si vede subito quanto si e' accorciata */
  const live = F.layout(u, { alive: ctx.aliveOf(u), attached: chars, raw: true });
  return { cells, full, live, chars };
}

function svgBox(cells, u){
  let x0 = -u.baseW, y0 = -u.baseH, x1 = u.baseW, y1 = u.baseH;
  for (const c of cells){
    const r = Math.max(c.w, c.h) / 2 + 2;
    x0 = Math.min(x0, c.x - r); x1 = Math.max(x1, c.x + r);
    y0 = Math.min(y0, c.y - r); y1 = Math.max(y1, c.y + r);
  }
  const pad = 16;
  return { x: x0 - pad, y: y0 - pad, w: (x1 - x0) + pad * 2, h: (y1 - y0) + pad * 2 };
}

function cellSVG(c, col){
  const sel = selCell && ((selCell.kind === "model" && c.kind === "model" && selCell.i === c.i) ||
                          (selCell.kind === "char"  && c.kind === "char"  && selCell.uid === c.uid));
  const fill = c.kind === "char" ? "var(--accent)" : col;
  const num = c.kind === "char" ? "★" : String((c.i ?? 0) + 1);
  const hw = c.w / 2, hh = c.h / 2;
  return `<g class="fcell${c.fallen ? " gone" : ""}" data-k="${c.kind}" data-i="${c.i ?? ""}" data-uid="${c.uid ?? ""}"
      transform="translate(${c.x} ${c.y}) rotate(${c.rot || 0})">
      <rect x="${-hw}" y="${-hh}" width="${c.w}" height="${c.h}" rx="2"
        fill="${fill}" opacity="${c.fallen ? ".18" : ".78"}"
        stroke="${sel ? "var(--accent)" : fill}" stroke-width="${sel ? 3 : 1}"/>
      <line x1="${-hw}" y1="${-hh}" x2="${hw}" y2="${-hh}" stroke="var(--paper)" stroke-width="2" opacity=".85"/>
      <text y="3.5" text-anchor="middle" font-size="9" fill="var(--paper)" opacity="${c.fallen ? ".45" : ".95"}">${num}</text>
      ${c.fallen ? `<line x1="${-hw}" y1="${-hh}" x2="${hw}" y2="${hh}" stroke="var(--bad)" stroke-width="2.2"/>
        <line x1="${hw}" y1="${-hh}" x2="${-hw}" y2="${hh}" stroke="var(--bad)" stroke-width="2.2"/>` : ""}
    </g>`;
}

function boardSVG(u){
  const { cells, live } = editorCells(u);
  const vb = svgBox(cells, u);
  const col = S().armies[u.army].color;
  const grid = [];
  const gstep = MM / 2;                          // mezzo pollice
  for (let x = Math.ceil(vb.x / gstep) * gstep; x < vb.x + vb.w; x += gstep)
    grid.push(`<line x1="${x}" y1="${vb.y}" x2="${x}" y2="${vb.y + vb.h}"/>`);
  for (let y = Math.ceil(vb.y / gstep) * gstep; y < vb.y + vb.h; y += gstep)
    grid.push(`<line x1="${vb.x}" y1="${y}" x2="${vb.x + vb.w}" y2="${y}"/>`);

  return `<svg id="f-canvas" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" preserveAspectRatio="xMidYMid meet">
    <g stroke="var(--field-line)" stroke-width=".5" opacity=".45">${grid.join("")}</g>
    <rect x="${live.origin.x - live.w / 2}" y="${live.origin.y - live.h / 2}" width="${live.w}" height="${live.h}"
      fill="none" stroke="var(--accent)" stroke-width="1.2" stroke-dasharray="6 4" opacity=".65"/>
    <g stroke="var(--muted)" stroke-width="1.4" fill="none">
      <line x1="0" y1="${vb.y + 22}" x2="0" y2="${vb.y + 8}"/>
      <path d="M -4.5 ${vb.y + 13} L 0 ${vb.y + 6} L 4.5 ${vb.y + 13}"/>
    </g>
    <text x="7" y="${vb.y + 16}" font-size="9" fill="var(--muted)">fronte</text>
    ${cells.map(c => cellSVG(c, col)).join("")}
  </svg>`;
}

/* ============================================================
   3 · LA FINESTRA
   ============================================================ */
function render(){
  const u = unitById(openUid);
  if (!u) return closeEditor();
  const f = F.ensureFormation(u);
  const alive = ctx.aliveOf(u);
  const chars = F.attachedTo(S().units, u);
  const live = F.layout(u, { alive, attached: chars });
  const free = f.mode === "free";
  const onGame = ctx.gameOn();

  let host = $("#formation-modal");
  if (!host){
    host = document.createElement("div");
    host.id = "formation-modal";
    host.className = "modal-back";
    document.body.appendChild(host);
    document.addEventListener("keydown", onKey, true);
    host.addEventListener("pointerdown", e => { if (e.target === host) closeEditor(); });
  }

  /* dentro un reggimento ci va chi al tavolo ci starebbe: i personaggi
     e, categoria del roster o no, qualunque pezzo da un modello solo */
  const candidates = F.joinCandidates(S().units, u);

  host.innerHTML = `
  <div class="modal" role="dialog" aria-label="Formazione di ${esc(u.name)}">
    <div class="modal-head">
      <span class="swatch" style="background:${S().armies[u.army].color}"></span>
      <b>${esc(u.name)}</b>
      <span class="mono">${alive}/${u.models} modelli · ${inch(live.w).toFixed(2)}×${inch(live.h).toFixed(2)}″</span>
      <div class="spacer"></div>
      <button class="btn tiny" id="f-close">Chiudi</button>
    </div>
    <div class="modal-body">
      <div class="f-side">
        <div class="panel-title">Formazione</div>
        <div class="grid2">
          <button class="btn tiny${free ? "" : " on"}" id="f-mode-r">Ordine chiuso</button>
          <button class="btn tiny${free ? " on" : ""}" id="f-mode-f">Sciolta</button>
        </div>
        <p class="note">${free
          ? "Ogni base si trascina dove vuoi. I preset sono un punto di partenza: appena sposti qualcosa la formazione diventa «come l'hai messa» e non te la tocca più nessuno."
          : "La griglia decide tutto: scegli la sagoma e quanti modelli stanno davanti."}</p>

        <div class="palette">
          ${(free ? F.FREE_PRESETS : F.RANK_PRESETS).map(p =>
            `<button class="btn tiny${f.preset === p.id ? " on" : ""}" data-preset="${p.id}" title="${esc(p.hint)}">${p.label}</button>`).join("")}
        </div>

        <div class="grid2" style="margin-top:8px">
          <label class="field">Fronte<input type="number" min="1" max="60" id="f-front" value="${u.frontage}"></label>
          <label class="field">Spaziatura mm<input type="number" min="0" max="60" step="0.5" id="f-gap" value="${f.spacing}"></label>
        </div>
        ${free ? `
          <div class="grid2" style="margin-top:6px">
            <button class="btn tiny" id="f-mirror">Specchia</button>
            <button class="btn tiny" id="f-turn">Ruota 90°</button>
          </div>
          <div class="grid2" style="margin-top:6px">
            <button class="btn tiny${snapOn ? " on" : ""}" id="f-snap" title="Aggancia alla griglia da mezzo pollice">Aggancia ½″</button>
            <button class="btn tiny" id="f-reflow">Ricompatta</button>
          </div>` : `
          <label class="field" style="margin-top:6px">Ultimo rango
            <select id="f-align">
              <option value="left" ${f.align === "left" ? "selected" : ""}>a sinistra</option>
              <option value="center" ${f.align === "center" ? "selected" : ""}>centrato</option>
            </select></label>`}

        <div class="panel-title" style="margin-top:12px">Personaggi</div>
        <p class="note">Un personaggio unito smette di essere un pezzo a sé: prende una casella dentro il reggimento, si muove con lui e nel report risulta dov'è il reggimento.</p>
        ${chars.length ? chars.map(c => `
          <div class="row">
            <span class="nm"><b><span class="txt">${esc(c.name)}</span></b>
              <span class="mono">${c.baseW}×${c.baseH} mm · ${c.pts} pt${onGame && c.lost ? ` · −${c.lost}` : ""}</span></span>
            <button class="btn tiny ghost" data-leave="${c.uid}">Sgancia</button>
          </div>`).join("") : `<p class="empty">Nessun personaggio unito.</p>`}
        ${candidates.length ? `
          <label class="field" style="margin-top:6px">Unisci un personaggio o un modello singolo
            <select id="f-join">
              <option value="">— scegli —</option>
              ${candidates.map(c => `<option value="${c.uid}">${esc(c.name)}${F.isCharacter(c) ? "" : " · 1 modello"}</option>`).join("")}
            </select></label>`
          : `<p class="note">Nessun pezzo libero da unire in questo esercito: dentro un reggimento ci vanno i personaggi e le unità da un modello solo.</p>`}
        ${chars.length ? `<p class="note">La base con la stella è il personaggio: trascinala per cambiargli posto nella formazione.</p>` : ""}

        ${onGame ? `
          <div class="panel-title" style="margin-top:12px">Perdite</div>
          <div class="readout"><span>Modelli in piedi</span><b>${alive} / ${u.models}</b></div>
          <button class="btn tiny${markMode ? " on primary" : ""}" id="f-mark" style="width:100%;margin-top:6px">
            ${markMode ? "Clicca i modelli caduti · finito" : "Segna le perdite cliccando i modelli"}</button>
          <div class="grid2" style="margin-top:6px">
            <button class="btn tiny" id="f-loss-m">−1 perdita</button>
            <button class="btn tiny" id="f-loss-p">+1 perdita</button>
          </div>
          <p class="note">In ordine chiuso il reggimento perde i ranghi di dietro, come le miniature vere. In formazione sciolta cade il modello che scegli tu e la sagoma si richiude dove capita: è per questo che l'ingombro tratteggiato cambia mentre segni.</p>` : ""}
      </div>

      <div class="f-canvas-wrap">
        ${boardSVG(u)}
        <p class="note">${free
          ? `Trascina le basi. Frecce per lo spostamento fine, <span class="kbd">Q</span>/<span class="kbd">E</span> per ruotare quella selezionata.`
          : `I modelli seguono la griglia: si muove solo il personaggio. Il tratteggio è l'ingombro con cui l'unità sta sul tavolo adesso.`}</p>
      </div>
    </div>
  </div>`;

  wire(host, u, f);
}

/* ============================================================
   4 · I COMANDI
   ============================================================ */
function wire(host, u, f){
  const q = s => host.querySelector(s);
  const bump = () => { f.rev = (f.rev || 0) + 1; };

  q("#f-close").addEventListener("click", closeEditor);

  q("#f-mode-r").addEventListener("click", () => edit("ordine chiuso", () => {
    f.mode = "ranks";
    if (!F.RANK_PRESETS.some(p => p.id === f.preset)) f.preset = "block";
    /* ordine chiuso vuol dire basi che si toccano: la spaziatura della
       formazione sciolta va tolta, se no si torna ai ranghi e i modelli
       restano larghi come prima e sembra che il comando non abbia fatto
       niente. Gli schermagliatori tengono il loro mezzo pollice. */
    f.spacing = u.loose ? F.LOOSE_GAP : 0;
    bump();
  }));
  q("#f-mode-f").addEventListener("click", () => edit("formazione sciolta", () => {
    f.mode = "free";
    if (!F.FREE_PRESETS.some(p => p.id === f.preset)) f.preset = u.loose ? "cloud" : "checker";
    if (!f.spacing) f.spacing = F.LOOSE_GAP;
    f.slots = null;
    bump();
  }));

  host.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => {
    const id = b.dataset.preset;
    edit("formazione " + id, () => {
      f.preset = id;
      if (f.mode === "ranks"){
        const p = F.RANK_PRESETS.find(x => x.id === id);
        if (p) u.frontage = Math.max(1, Math.min(u.models, p.front(u.models)));
      } else if (id !== "custom") f.slots = null;
      bump();
    });
  }));

  q("#f-front").addEventListener("change", e => edit("fronte", () => {
    u.frontage = Math.max(1, Math.min(u.models, +e.target.value || 1));
    bump();
  }));
  q("#f-gap").addEventListener("change", e => edit("spaziatura", () => {
    f.spacing = Math.max(0, Math.min(60, +e.target.value || 0));
    if (f.mode === "free" && f.preset !== "custom") f.slots = null;
    bump();
  }));

  const align = q("#f-align");
  if (align) align.addEventListener("change", e => edit("allineamento", () => {
    f.align = e.target.value === "center" ? "center" : "left";
    bump();
  }));

  const mirror = q("#f-mirror");
  if (mirror) mirror.addEventListener("click", () => edit("specchia la formazione", () => {
    writeSlots(u, F.baseCells(u, u.models).map(c => ({ x:-c.x, y:c.y, rot:-(c.rot || 0) })));
  }));
  const turn = q("#f-turn");
  if (turn) turn.addEventListener("click", () => edit("ruota la formazione", () => {
    writeSlots(u, F.baseCells(u, u.models).map(c => ({ x:-c.y, y:c.x, rot:(c.rot || 0) + 90 })));
  }));
  const snapBtn = q("#f-snap");
  if (snapBtn) snapBtn.addEventListener("click", () => { snapOn = !snapOn; render(); });
  const reflow = q("#f-reflow");
  if (reflow) reflow.addEventListener("click", () => edit("ricompatta", () => {
    f.slots = null;
    if (f.preset === "custom") f.preset = "cloud";
    bump();
  }));

  const join = q("#f-join");
  if (join) join.addEventListener("change", e => {
    const c = unitById(+e.target.value);
    if (!c) return;
    edit("unisci " + c.name, () => F.joinUnit(c, u));
  });
  host.querySelectorAll("[data-leave]").forEach(b => b.addEventListener("click", () => {
    const c = unitById(+b.dataset.leave);
    if (!c) return;
    edit("sgancia " + c.name, () => {
      F.leaveUnit(c);
      /* torna sul tavolo di fianco al reggimento: lasciarlo «in
         riserva» vorrebbe dire farlo sparire senza dirlo */
      const lay = F.layout(u, { alive: ctx.aliveOf(u), attached: F.attachedTo(S().units, u) });
      c.placed = true;
      c.rot = u.rot;
      c.x = u.x + lay.w / 2 + c.baseW;
      c.y = u.y;
    });
  }));

  const mark = q("#f-mark");
  if (mark) mark.addEventListener("click", () => { markMode = !markMode; render(); });
  const lm = q("#f-loss-m"), lp = q("#f-loss-p");
  if (lm) lm.addEventListener("click", () => edit("perdite", () => ctx.setLost(u, (u.lost || 0) - 1)));
  if (lp) lp.addEventListener("click", () => edit("perdite", () => ctx.setLost(u, (u.lost || 0) + 1)));

  wireCanvas(host, u, f);
}

/* ---- trascinamento delle basi ----
   Durante il trascinamento non si rifa' la finestra: si sposta il
   gruppo SVG e basta. Ricostruire l'HTML a ogni pixel butterebbe via
   il nodo che ha catturato il puntatore, e il trascinamento morirebbe
   al primo movimento. */
function wireCanvas(host, u, f){
  const svg = host.querySelector("#f-canvas");
  if (!svg) return;
  const pt = svg.createSVGPoint ? svg.createSVGPoint() : null;
  const toLocal = e => {
    const m = svg.getScreenCTM();
    if (!pt || !m) return [0, 0];
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  const snap = v => snapOn ? Math.round(v / (MM / 2)) * (MM / 2) : Math.round(v * 10) / 10;
  let drag = null;

  svg.addEventListener("pointerdown", e => {
    const g = e.target.closest(".fcell");
    if (!g) return;
    const kind = g.dataset.k;
    const i = g.dataset.i === "" ? null : +g.dataset.i;
    const uid = g.dataset.uid === "" ? null : +g.dataset.uid;

    if (markMode && kind === "model" && i !== null){
      /* In ordine chiuso non si sceglie chi cade: si tolgono i modelli
         da dietro, come al tavolo. Il clic vale allora «uno in meno»,
         e la croce compare in fondo al reggimento. In formazione
         sciolta invece cade proprio quello che hai toccato. */
      if (F.ensureFormation(u).mode === "ranks"){
        const wasGone = F.fallenSet(u, ctx.aliveOf(u)).has(i);
        edit("perdita", () => ctx.setLost(u, (u.lost || 0) + (wasGone ? -1 : 1)));
      } else {
        edit("perdita", () => ctx.setLost(u, F.toggleFallen(u, i)));
      }
      return;
    }
    selCell = kind === "char" ? { kind, uid } : { kind, i };

    if (kind === "char"){
      const c = unitById(uid);
      if (c){ dragging = true; ctx.act("posto del personaggio", () => {}); drag = { kind, c, g }; }
    } else if (f.mode === "free" && i !== null){
      dragging = true;
      ctx.act("sposta modello", () => {});
      drag = { kind, i, g, cells: F.baseCells(u, u.models) };
    }
    if (drag){ try { svg.setPointerCapture(e.pointerId); } catch (_) {} }
    else render();
  });

  svg.addEventListener("pointermove", e => {
    if (!drag) return;
    const [x, y] = toLocal(e);
    if (drag.kind === "model"){
      const c = drag.cells[drag.i];
      c.x = snap(x); c.y = snap(y);
      writeSlots(u, drag.cells);
      drag.g.setAttribute("transform", `translate(${c.x} ${c.y}) rotate(${c.rot || 0})`);
    } else {
      const c = drag.c;
      c.join = c.join || { host: u.uid, idx: null, x: null, y: null, rot: null };
      if (f.mode === "ranks"){
        c.join.idx = nearestCell(u, x, y);
      } else {
        c.join.x = snap(x); c.join.y = snap(y);
        drag.g.setAttribute("transform", `translate(${c.join.x} ${c.join.y}) rotate(${c.join.rot || 0})`);
      }
      f.rev = (f.rev || 0) + 1;
    }
    ctx.renderAll();
  });

  const end = e => {
    if (!drag) return;
    drag = null;
    dragging = false;
    try { svg.releasePointerCapture(e.pointerId); } catch (_) {}
    render();
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
}

/* in ordine chiuso il personaggio non va dove capita: prende la
   casella piu' vicina della griglia */
function nearestCell(u, x, y){
  const chars = F.attachedTo(S().units, u);
  const lay = F.layout(u, { alive: u.models, attached: chars, raw: true });
  const n = Math.max(1, lay.slots.length);
  let best = 0, bd = Infinity;
  for (const s of lay.slots){
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < bd){ bd = d; best = s.cell ?? 0; }
  }
  return Math.max(0, Math.min(n - 1, best));
}
