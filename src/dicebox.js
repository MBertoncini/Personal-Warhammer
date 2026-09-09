/* Schieramento Old World — il vassoio dei dadi
 *
 * Il tavolo verde dell'app: si sceglie che dado e quanti, si tira, e i
 * cubi rotolano davvero — sei facce, prospettiva, e la faccia giusta
 * che si ferma verso di te.
 *
 * La regola che tiene in piedi tutto: **l'animazione non decide
 * niente**. Il risultato esce prima, da dice.js, con il generatore del
 * browser; il cubo poi si gira per farlo vedere. Il contrario — un dado
 * fisico simulato che si ferma dove capita — sarebbe un generatore
 * scritto per sbaglio, con una distribuzione che nessuno ha
 * controllato. Cosi' invece l'animazione si puo' saltare, rallentare o
 * spegnere del tutto (chi ha chiesto meno movimento al sistema
 * operativo la vede ferma) e i numeri restano identici.
 *
 * Quattro dadi, quattro serie di facce: D6 a pallini, D3 segnato
 * 1,2,3,1,2,3, artiglieria con 2-4-6-8-10 e il Mancato Colpo,
 * deviazione con quattro frecce e due Colpito!. La faccia che il cubo
 * mostra e' sempre la faccia grezza del D6 uscito: quello che c'e'
 * scritto sopra cambia, il dado no.
 *
 * Il vassoio serve anche allo scontro simulato: li' i dadi sono gia'
 * stati tirati e vengono solo mostrati, riga per riga, con il
 * punteggio da fare accanto.
 */

import { esc } from './util.js';
import * as D from './dice.js';

/* ============================================================
   1 · GEOMETRIA DEL CUBO
   Ogni faccia sta al suo posto (1 davanti, 6 dietro, e le opposte
   sommano a sette come su un dado vero). Per far vedere la faccia v
   basta la rotazione inversa di dove l'abbiamo messa.
   ============================================================ */
const LAND = {
  1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180],
};

/* L'inclinazione con cui il cubo si posa. Non e' vezzo: un dado fermo
   perfettamente di faccia e' un quadrato, e si perde il senso del
   volume proprio nell'istante in cui lo si guarda. In piu' le
   giaciture a novanta gradi esatti riducono il riquadro del cubo a una
   riga, e certi browser a quel punto smettono di disegnarlo. Otto
   gradi bastano a tutte e due le cose. */
const REST = "rotateX(-8deg) rotateY(10deg) ";

const PIPS = {
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
};
const pipHTML = v => PIPS[v].map(p => `<i class="pip p${p}"></i>`).join("");

/* Cosa c'e' scritto sulla faccia grezza f (1-6) di un dado di tipo k */
function faceHTML(kind, f){
  if (kind === "d6") return `<span class="pips">${pipHTML(f)}</span>`;
  if (kind === "d3") return `<span class="num">${D.D3_FACES[f - 1]}</span>`;
  if (kind === "artillery"){
    const v = D.ARTILLERY_FACES[f - 1];
    return v === null ? `<span class="mis">✷</span>` : `<span class="num">${v}</span>`;
  }
  /* deviazione: la freccia punta sempre in alto sulla faccia, ed e' il
     cubo a girare — cosi' la direzione che si legge e' quella vera */
  return D.SCATTER_FACES[f - 1] === "hit"
    ? `<span class="hit"><i class="tiny">▲</i>HIT</span>`
    : `<span class="arrow">▲</span>`;
}

/* ============================================================
   2 · IL VASSOIO
   ============================================================ */
let host = null, panel = null;

const reduced = () => {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  catch { return false; }
};

/* La rotolata si puo' spegnere. Non e' una concessione: al terzo turno
   di una partita vera si tirano dieci volte in un minuto, e un secondo
   di cubi che girano dieci volte fa dieci secondi di attesa. Spenta,
   i dadi compaiono gia' fermi sulla faccia giusta e i numeri sono gli
   stessi. Chi ha chiesto meno movimento al sistema operativo la trova
   spenta senza doverlo dire. */
const animOn = () => {
  try { return localStorage.getItem("tow-dice-anim") !== "0"; } catch { return true; }
};
export function setAnimation(on){
  try { localStorage.setItem("tow-dice-anim", on ? "1" : "0"); } catch { /* niente */ }
}

function ensureHost(){
  if (host && host.isConnected) return host;
  host = document.getElementById("dicebox");
  if (!host){
    host = document.createElement("div");
    host.id = "dicebox";
    host.className = "dicebox";
    document.body.appendChild(host);
  }
  host.hidden = true;
  return host;
}

export function closeDiceBox(){
  if (!host) return;
  host.hidden = true;
  host.innerHTML = "";
  panel = null;
}

/* ============================================================
   3 · UN GRUPPO DI DADI
   Un gruppo e' una tirata sola: un'etichetta, il punteggio da fare
   quando c'e', e i dadi. Lo scontro simulato ne passa cinque o sei in
   fila (colpire, ferire, salvare) e li fa rotolare insieme.
   ============================================================ */
const MAX_SHOWN = 40;

/* Il risultato non si scrive insieme ai dadi: si scrive quando i dadi
   si sono fermati. Un vassoio che mostra «3 colpi» mentre i cubi
   girano ancora fa girare i cubi per niente — e allora tanto vale la
   riga di numeri di prima. Per questo l'etichetta di destra, i dadi
   accesi e la riga in fondo nascono vuoti e li riempie paintResults. */
function groupHTML(g, i){
  const kind = g.kind || "d6";
  const dice = (g.dice || []).slice(0, MAX_SHOWN);
  const extra = (g.dice || []).length - dice.length;
  return `
    <div class="dice-group" data-g="${i}">
      ${g.label || g.tail ? `<div class="dg-head">
        <span class="dl-k">${esc(g.label || "")}</span>
        <b class="dg-tail" data-tail="${i}"></b></div>` : ""}
      <div class="dice3d">
        ${dice.map((d, j) => `
          <div class="d3d" data-die="${i}.${j}" data-face="${d.raw}"
               ${d.win ? `data-win="1"` : ""}${d.misfire ? ` data-mis="1"` : ""}
               ${kind === "scatter" ? ` data-deg="${d.deg}"` : ""}>
            ${[1, 2, 3, 4, 5, 6].map(f =>
              `<span class="f f${f}">${faceHTML(kind, f)}</span>`).join("")}
          </div>`).join("")}
        ${extra > 0 ? `<span class="d3d-more mono">+${extra}</span>` : ""}
      </div>
    </div>`;
}

/* Quello che si sa solo dopo: i dadi passati che si accendono, il conto
   di ogni riga e la lettura in fondo. */
function paintResults(){
  if (!host || !panel) return;
  for (const el of host.querySelectorAll(".d3d")){
    el.classList.toggle("win", el.dataset.win === "1");
    el.classList.toggle("mis", el.dataset.mis === "1");
  }
  (panel.groups || []).forEach((g, i) => {
    const el = host.querySelector(`[data-tail="${i}"]`);
    if (el) el.textContent = g.tail || "";
  });
  const out = host.querySelector("#dx-out");
  if (out) out.innerHTML = (panel.lines || [])
    .map(l => `<div class="dl-out">${esc(l)}</div>`).join("");
  const arr = host.querySelector("#dx-arrow");
  if (arr){
    arr.hidden = panel.arrow == null;
    arr.innerHTML = panel.arrow == null ? ""
      : `<i style="transform:rotate(${panel.arrow}deg)">↑</i>`;
  }
}

/* La rotolata. Ogni cubo parte da una giacitura a caso e arriva sulla
   faccia decisa: i giri in piu' sono multipli di 360 gradi, quindi non
   spostano di un grado il punto di arrivo.
   Il movimento e' scritto fotogramma per fotogramma invece che
   affidato a una transizione CSS. Una transizione interpola matrici e
   l'ultimo fotogramma lo decide il browser; qui l'ultimo fotogramma e'
   la giacitura d'arrivo esatta, scritta da noi — che e' l'unica che
   deve per forza essere giusta, perche' e' quella che si legge. */
const clock = () => (globalThis.performance && performance.now) ? performance.now() : Date.now();

function tumble(root, ms){
  const dice = [...root.querySelectorAll(".d3d")];
  const still = ms <= 0 || !animOn() || reduced();

  const plan = dice.map((el, i) => {
    const face = +el.dataset.face || 1;
    const [lx, ly] = LAND[face] || [0, 0];
    return {
      el, lx, ly,
      yaw: el.dataset.deg != null ? +el.dataset.deg : 0,
      fromX: lx - 360 * (2 + i % 3),
      fromY: ly - 360 * (1 + i % 4),
      drop: 26 + (i % 5) * 6,
      dx: (i % 7) - 3,
      dur: ms + i * 45,
    };
  });

  /* niente opacita' addosso al cubo: un'opacita' diversa da uno
     appiattisce le tre dimensioni (e' una proprieta' di raggruppamento)
     e il cubo torna un quadrato — a volte per sempre, perche' il
     disegno appiattito resta in cache. La comparsa si fa con la caduta
     e basta. */
  const put = (p, x, y, tx, ty) => {
    p.el.style.transform =
      `${REST}translate3d(${tx.toFixed(1)}px,${ty.toFixed(1)}px,0) ` +
      `rotateZ(${p.yaw}deg) rotateX(${x.toFixed(1)}deg) rotateY(${y.toFixed(1)}deg)`;
  };

  if (still){
    for (const p of plan) put(p, p.lx, p.ly, 0, 0);
    return Promise.resolve();
  }

  /* frenata morbida: il dado arriva lungo e si posa, non si schianta */
  const ease = t => 1 - Math.pow(1 - t, 3);
  const t0 = clock();
  for (const p of plan) put(p, p.fromX, p.fromY, p.dx, -p.drop);

  return new Promise(done => {
    const step = () => {
      const now = clock();
      let running = false;
      for (const p of plan){
        const t = Math.min(1, (now - t0) / p.dur);
        if (t < 1) running = true;
        const e = ease(t);
        put(p, p.fromX + (p.lx - p.fromX) * e, p.fromY + (p.ly - p.fromY) * e,
            p.dx * (1 - e), -p.drop * (1 - e));
      }
      if (running) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
}

/* ============================================================
   4 · DISEGNO DEL PANNELLO
   ============================================================ */
const KIND_HINT = {
  d6: "Il dado di sempre. Con un punteggio da fare, i dadi passati si accendono.",
  d3: "Un D6 dimezzato per eccesso: il manuale lo scrive cosí, il cubo lo mostra già letto.",
  artillery: "2, 4, 6, 8, 10 e Mancato Colpo. Il Mancato Colpo manda alla tabella dell'arma.",
  scatter: "Quattro frecce e due Colpito!. La freccia dice la direzione, l'altro dado i pollici.",
};
const DIST = [["none", "nessuna"], ["d6", "D6"], ["2d6", "2D6"], ["d3", "D3"], ["artillery", "artiglieria"]];

function controlsHTML(s){
  const chip = k => `<button class="btn tiny${s.kind === k ? " on" : ""}" data-kind="${k}">${D.KIND_LABEL[k]}</button>`;
  return `
    <div class="dice-ctl">
      <div class="dice-kinds">${D.KINDS.map(chip).join("")}</div>
      ${s.kind === "scatter" ? `
        <label class="field inline"><span>Distanza</span>
          <select id="dx-dist">${DIST.map(([v, l]) =>
            `<option value="${v}"${s.dist === v ? " selected" : ""}>${l}</option>`).join("")}</select></label>`
      : `
        <div class="dice-count">
          <button class="btn tiny icon" id="dx-minus" title="Un dado in meno">−</button>
          <input type="number" id="dx-n" min="1" max="40" step="1" value="${s.n}" title="Quanti dadi">
          <button class="btn tiny icon" id="dx-plus" title="Un dado in più">+</button>
        </div>
        ${s.kind === "artillery" ? "" : `
        <label class="field inline"><span>Riesce a</span>
          <select id="dx-target">
            <option value="0"${!s.target ? " selected" : ""}>—</option>
            ${[2, 3, 4, 5, 6].map(t =>
              `<option value="${t}"${s.target === t ? " selected" : ""}>${t}+</option>`).join("")}
          </select></label>`}`}
      <button class="btn primary" id="dx-roll">Tira</button>
    </div>
    <p class="note">${KIND_HINT[s.kind]}</p>`;
}

function render(){
  const h = ensureHost();
  const s = panel;
  h.hidden = false;
  h.innerHTML = `
    <div class="dice-card" role="dialog" aria-label="Dadi">
      <div class="dice-head">
        <b>${esc(s.title || "Dadi")}</b>
        <span class="spacer"></span>
        ${s.rng ? "" : `<span class="tag rule-unk" title="Il browser non offre crypto.getRandomValues: si tira con Math.random">caso approssimato</span>`}
        <label class="dice-anim" title="Spenta, i dadi compaiono già fermi: stessi numeri, un secondo in meno per tirata">
          <input type="checkbox" id="dx-anim"${animOn() ? " checked" : ""}> rotola</label>
        <button class="btn tiny ghost" id="dx-close">Chiudi</button>
      </div>
      ${s.controls ? controlsHTML(s) : ""}
      <div class="dice-tray" id="dx-tray">
        ${(s.groups || []).map(groupHTML).join("") ||
          `<p class="empty">Scegli il dado e tira.</p>`}
      </div>
      <div class="dice-out" id="dx-out"></div>
      <div class="dice-arrow" id="dx-arrow" hidden></div>
      ${s.foot ? `<p class="note">${esc(s.foot)}</p>` : ""}
    </div>`;
  wire();
}

function wire(){
  const h = host, s = panel;
  const q = sel => h.querySelector(sel);
  q("#dx-close").addEventListener("click", closeDiceBox);
  q("#dx-anim").addEventListener("change", e => setAnimation(e.target.checked));
  if (!s.controls) return;
  h.querySelectorAll("[data-kind]").forEach(b => b.addEventListener("click", () => {
    s.kind = b.dataset.kind;
    if (s.kind === "artillery") s.target = 0;
    s.groups = []; s.lines = []; s.arrow = null;
    remember(); render();
  }));
  const n = q("#dx-n");
  if (n) n.addEventListener("change", () => { s.n = clampN(+n.value); remember(); });
  const minus = q("#dx-minus"), plus = q("#dx-plus");
  if (minus) minus.addEventListener("click", () => { s.n = clampN(s.n - 1); remember(); render(); });
  if (plus)  plus.addEventListener("click", () => { s.n = clampN(s.n + 1); remember(); render(); });
  const tg = q("#dx-target");
  if (tg) tg.addEventListener("change", () => { s.target = +tg.value || 0; remember(); });
  const dx = q("#dx-dist");
  if (dx) dx.addEventListener("change", () => { s.dist = dx.value; remember(); });
  q("#dx-roll").addEventListener("click", () => { if (n) s.n = clampN(+n.value); throwFromPanel(); });
}

const clampN = v => Math.max(1, Math.min(40, v | 0 || 1));

function remember(){
  try {
    localStorage.setItem("tow-dice", JSON.stringify(
      { kind: panel.kind, n: panel.n, target: panel.target, dist: panel.dist }));
  } catch { /* archivio pieno o negato: pazienza, e' solo una preferenza */ }
}
function recall(){
  try { return JSON.parse(localStorage.getItem("tow-dice") || "{}") || {}; }
  catch { return {}; }
}

/* ============================================================
   5 · TIRARE DAL PANNELLO
   ============================================================ */
async function throwFromPanel(){
  const s = panel;
  const res = s.kind === "scatter"
    ? D.scatter({ distance: s.dist })
    : D.rollDice({ kind: s.kind, n: s.n, target: s.target });

  s.groups = groupsOf(res, s);
  s.lines = [D.readOut(res)];
  s.arrow = res.kind === "scatter" && !res.hit && !res.misfire ? res.deg : null;
  s.last = res;
  render();                                   // i cubi, ancora muti
  await tumble(host.querySelector("#dx-tray"), 900);
  paintResults();                             // e adesso cosa e' uscito
  if (typeof s.onResult === "function") s.onResult(res);
  return res;
}

/* Dal risultato ai gruppi da disegnare. La deviazione ne fa due: il
   dado della direzione e quello della distanza, che sono due dadi
   diversi e vederli insieme e' meta' della lettura. */
/* "5D6" e' notazione, "3 × artiglieria" e' italiano: i due dadi
   speciali un numero davanti non lo hanno mai avuto. */
const countLabel = (kind, n) => kind === "d6" || kind === "d3"
  ? `${n}${D.KIND_LABEL[kind]}`
  : `${n} × ${D.KIND_LABEL[kind].toLowerCase()}`;

function groupsOf(res, s){
  if (res.kind !== "scatter" || !res.die)
    return [{
      kind: res.kind, dice: res.dice,
      label: countLabel(res.kind, res.n),
      tail: res.target ? `${res.hits} su ${res.n}` : (res.kind === "artillery" && res.misfires ? "Mancato Colpo" : `= ${res.total}`),
    }];
  const out = [{ kind: "scatter", dice: [res.die], label: "direzione",
                 tail: res.hit ? "Colpito!" : `${res.compass} · ${res.deg}°` }];
  if (s.dist && s.dist !== "none")
    out.push({ kind: s.dist === "artillery" ? "artillery" : s.dist === "2d6" ? "d6" : s.dist,
               dice: res.dist.dice && res.dist.dice.length ? res.dist.dice : [res.dist],
               label: "distanza",
               tail: res.misfire ? "Mancato Colpo" : `${res.dist.value}″` });
  return out;
}

/* ============================================================
   6 · LE PORTE DI CASA
   ============================================================ */
/* Il pannello con i comandi: e' il dado che si tira al tavolo quando
   serve un numero e basta. */
export function openDiceBox(opts = {}){
  const saved = recall();
  panel = {
    controls: opts.controls !== false,
    kind: opts.kind || saved.kind || "d6",
    n: clampN(opts.n || saved.n || 1),
    target: opts.target != null ? opts.target : (saved.target || 0),
    dist: opts.dist || saved.dist || "d6",
    title: opts.title || "Dadi",
    foot: opts.foot || "",
    onResult: opts.onResult,
    groups: [], lines: [], arrow: null,
    rng: D.trueRandom(),
  };
  render();
  if (opts.rollNow) return throwFromPanel();
  return Promise.resolve(null);
}

/* Tira subito, con o senza comandi: la usa chi sa gia' cosa gli serve. */
export function throwDice(spec = {}){
  openDiceBox({ ...spec, rollNow: false });
  return throwFromPanel();
}

/* Mostra dadi gia' tirati altrove. Lo scontro simulato passa di qui:
   i numeri sono quelli del suo conto, il vassoio li fa solo rotolare. */
export async function showDiceGroups(groups, opts = {}){
  panel = {
    controls: false,
    title: opts.title || "Dadi",
    foot: opts.foot || "",
    lines: opts.lines || [],
    arrow: null,
    groups: (groups || []).filter(g => g && (g.dice || []).length),
    rng: D.trueRandom(),
  };
  if (!panel.groups.length) return;
  render();
  await tumble(host.querySelector("#dx-tray"), opts.ms != null ? opts.ms : 800);
  paintResults();
}

export const diceBoxOpen = () => !!(host && !host.hidden);
