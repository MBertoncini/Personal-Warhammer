/* Schieramento Old World — le tabelle del manuale, sempre a portata
 *
 * Il simulatore tira da solo, ma chi gioca deve poterne fare a meno:
 * tirare i dadi veri sul tavolo vero e sapere lo stesso a quanto
 * colpisce e a quanto ferisce. Qui ci sono le tre tabelle che si
 * guardano a ogni fase, lette sul libro:
 *
 *   COLPIRE IN MISCHIA (p. 148) — AC di chi colpisce contro AC del
 *   bersaglio, dieci per dieci;
 *
 *   COLPIRE AL TIRO (pp. 138-139) — l'Abilita' Balistica con i suoi
 *   cinque modificatori, il ritiro dell'AB alta e il 7+;
 *
 *   FERIRE (pp. 140 e 149) — Forza contro Resistenza, dieci per dieci.
 *
 * I numeri non stanno scritti qui. Ogni cella chiede a `rules.js`, cioe'
 * alle stesse funzioni con cui il simulatore tira i suoi dadi: una
 * cella sbagliata vorrebbe dire un conto sbagliato, e viceversa. E'
 * l'unico modo perche' la scheda e il motore non si contraddicano mai.
 *
 * Si apre dalla barra del tavolo, oppure toccando un punteggio nel
 * pannello dello scontro o del tiro: in quel caso arriva con i valori
 * gia' scelti, e la cella accesa e' quella del bersaglio che si stava
 * guardando. Una cella si tocca anche nella tabella: sceglie la sua
 * riga e la sua colonna.
 */

import { esc } from './util.js';
import { hitMelee, woundOn, shootTarget, CHART_PAGE as P,
         IMPOSSIBLE, AUTOHIT } from './rules.js';

const R10 = Array.from({ length: 10 }, (_, i) => i + 1);
const SHOOT_ROWS = [0, -1, -2, -3, -4, -5];
const sign = v => v > 0 ? "+" + v : v < 0 ? "−" + Math.abs(v) : "0";

const TABS = [
  ["melee", "Mischia"],
  ["shoot", "Tiro"],
  ["wound", "Ferire"],
];

/* ============================================================
   1 · I MODIFICATORI DEL TIRO (pp. 138-139)
   Cinque, e non si sommano tutti: chi tira e tiene non prende anche la
   lunga gittata, e la copertura e' una sola — la piena vince sulla
   parziale. "Altri" e' tutto quello che il libro dice che puo'
   capitare e questa scheda non nomina.
   ============================================================ */
export const SHOOT_MODS = [
  { id:"moved",   v:-1, label:"ha mosso",           why:"anche per radunarsi o riorganizzarsi" },
  { id:"long",    v:-1, label:"lunga gittata",      why:"oltre metà della gittata dell'arma" },
  { id:"sns",     v:-1, label:"tira e tieni",       why:"e non prende anche la lunga gittata" },
  { id:"partial", v:-1, label:"copertura parziale", why:"fino a metà dei modelli nascosti" },
  { id:"full",    v:-2, label:"copertura piena",    why:"più di metà dei modelli nascosti" },
];

export function shootModTotal(m = {}){
  let total = 0;
  const used = [], skipped = [];
  for (const x of SHOOT_MODS){
    if (!m[x.id]) continue;
    if (x.id === "long" && m.sns){ skipped.push(x); continue; }
    if (x.id === "partial" && m.full){ skipped.push(x); continue; }
    total += x.v; used.push(x);
  }
  total += +m.other || 0;
  return { total, used, skipped };
}

/* ============================================================
   2 · LO STATO DELLA SCHEDA
   Si ricorda l'ultima scheda aperta e gli ultimi valori: al terzo turno
   si riapre sempre la stessa, e ritrovarla com'era e' mezzo gesto in
   meno. Se il browser non concede l'archivio si riparte dai valori di
   un soldato qualunque.
   ============================================================ */
const KEY = "tow-charts";
const defaults = () => ({ tab:"melee", wsA:4, wsD:3, bs:3, mods:{}, s:3, t:3 });
let host = null, st = null;

function load(){
  try { return { ...defaults(), ...(JSON.parse(localStorage.getItem(KEY) || "{}") || {}) }; }
  catch { return defaults(); }
}
function save(){
  try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* e' solo una preferenza */ }
}

const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+v || 0)));
const LIMITS = { wsA:[0, 10], wsD:[0, 10], bs:[1, 10], s:[1, 10], t:[1, 10] };

/* quello che arriva da fuori si pulisce: sopra il 10 il libro non
   stampa niente e al tavolo si legge l'ultima riga, come fa rules.js */
function clean(opts){
  const out = {};
  if (TABS.some(([id]) => id === opts.tab)) out.tab = opts.tab;
  for (const [k, [lo, hi]] of Object.entries(LIMITS))
    if (opts[k] != null && opts[k] !== "") out[k] = clampTo(opts[k], lo, hi);
  if (opts.mods && typeof opts.mods === "object"){
    out.mods = {};
    for (const x of SHOOT_MODS) if (opts.mods[x.id]) out.mods[x.id] = true;
    if (+opts.mods.other) out.mods.other = Math.round(+opts.mods.other);
  }
  return out;
}

/* ============================================================
   3 · DISEGNO
   ============================================================ */
function ensureHost(){
  if (host && host.isConnected) return host;
  host = document.getElementById("charts");
  if (!host){
    host = document.createElement("div");
    host.id = "charts";
    host.className = "chartbox";
    document.body.appendChild(host);
  }
  host.hidden = true;
  return host;
}

/* il tono della cella: verde dove si passa facile, rosso dove non si
   passa. Serve a trovare la zona a colpo d'occhio, il numero lo dice
   comunque la cella. */
const tone = n => n <= AUTOHIT ? "t2" : n >= IMPOSSIBLE ? "tx" : "t" + n;
const plain = n => ({ text: n >= IMPOSSIBLE ? "–" : n <= AUTOHIT ? "auto" : n + "+", tone: tone(n) });

function pick(key, label, lo, hi){
  const opts = [];
  for (let v = lo; v <= hi; v++)
    opts.push(`<option value="${v}"${+st[key] === v ? " selected" : ""}>${v}</option>`);
  return `<label class="field inline"><span>${label}</span><select data-ckey="${key}">${opts.join("")}</select></label>`;
}

/* L'angolo porta solo la sigla: la frase intera allargava la prima
   colonna, e su un portatile la decima usciva dal riquadro. La frase
   sta nella didascalia, sopra la griglia. */
function grid({ rows, cols, rowKey, colKey, corner, rowHead, colHead, cell, selR, selC, rowLabel = v => v }){
  return `<div class="chart-scroll"><table class="chart">
    <caption>righe: ${rowHead} · colonne: ${colHead}</caption>
    <thead><tr><th class="corner" scope="col" title="${esc(rowHead)} ↓ · ${esc(colHead)} →">${corner}</th>${cols.map(c =>
      `<th scope="col"${c === selC ? ` class="hl-col"` : ""}>${c}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr${r === selR ? ` class="hl-row"` : ""}><th scope="row">${rowLabel(r)}</th>${cols.map(c => {
      const v = cell(r, c);
      const cls = [v.tone, c === selC ? "hl-col" : "", r === selR && c === selC ? "hl" : ""].filter(Boolean).join(" ");
      return `<td class="${cls}" data-r="${r}" data-c="${c}" data-rk="${rowKey}" data-ck="${colKey}">${v.text}</td>`;
    }).join("")}</tr>`).join("")}</tbody>
  </table></div>`;
}

function meleeHTML(){
  const a = st.wsA, d = st.wsD;
  const n = hitMelee(a, d);
  const verdict = n >= IMPOSSIBLE ? "non può colpire" : n <= AUTOHIT ? "colpisce senza tirare" : `colpisce a ${n}+`;
  return `
    <div class="chart-pick">${pick("wsA", "AC di chi colpisce", 0, 10)}${pick("wsD", "AC del bersaglio", 0, 10)}</div>
    <div class="readout chart-verdict"><span>AC ${a} contro AC ${d}</span><b>${verdict}</b></div>
    ${grid({ rows: R10, cols: R10, rowKey:"wsA", colKey:"wsD",
             corner:"AC", rowHead:"AC di chi colpisce", colHead:"AC del bersaglio",
             cell: (r, c) => plain(hitMelee(r, c)), selR: a, selC: d })}
    <ul class="chart-notes">
      <li>Più del doppio dell'AC nemica: <b>2+</b>. Più alta, ma non il doppio: <b>3+</b>. Pari, o più bassa ma non meno della metà: <b>4+</b>. Meno della metà: <b>5+</b>.</li>
      <li>Un 1 naturale manca sempre, un 6 naturale colpisce sempre (p. ${P.melee}).</li>
      <li>Contro AC 0 non si tira: si colpisce e basta (p. ${P.zero}).</li>
      <li>Si tira un dado per ogni Attacco. Chi colpisce ferisce con la Forza dell'arma: scheda <b>Ferire</b>.</li>
    </ul>
    <p class="note">Core Rulebook p. ${P.melee}, ristampata nel riepilogo a p. 348.</p>`;
}

/* La cella del tiro dice tre cose in poco spazio, con la scrittura del
   libro: «4+» il punteggio, «2+/6+» il ritiro dell'AB alta, «6·4» il
   6 naturale seguito da un 4+. */
function shootCell(t){
  if (t.need >= IMPOSSIBLE) return { text: t.again ? `–/${t.again}+` : "–", tone: "tx" };
  const first = t.then ? `6·${t.then}` : `${t.need}+`;
  return { text: t.again ? `${first}/${t.again}+` : first, tone: t.then ? "t7" : tone(t.need) };
}

function shootVerdict(t){
  if (t.need >= IMPOSSIBLE)
    return `servirebbe ${t.raw}+: non colpisce` + (t.again ? `, ma chi manca ritira a ${t.again}+` : "");
  const first = t.then ? `serve ${t.raw}+: un 6 e poi ${t.then}+` : `colpisce a ${t.need}+`;
  return t.again ? `${first}, chi manca ritira a ${t.again}+` : first;
}

function shootHTML(){
  const bs = st.bs;
  const mods = st.mods || {};
  const { total, used, skipped } = shootModTotal(mods);
  const t = shootTarget(bs, total);
  const others = [];
  for (let v = 2; v >= -5; v--)
    others.push(`<option value="${v}"${(+mods.other || 0) === v ? " selected" : ""}>${sign(v)}</option>`);
  const why = used.map(x => `${sign(x.v)} ${x.label}`).concat(+mods.other ? [`${sign(+mods.other)} altri`] : []);
  return `
    <div class="chart-pick">${pick("bs", "AB di chi tira", 1, 10)}
      <label class="field inline"><span>Altri modificatori</span><select data-cmod="other">${others.join("")}</select></label></div>
    <div class="chart-mods">${SHOOT_MODS.map(x =>
      `<label title="${esc(x.why)}"><input type="checkbox" data-cflag="${x.id}"${mods[x.id] ? " checked" : ""}> ${x.label} <span class="mono">${sign(x.v)}</span></label>`).join("")}</div>
    <div class="readout chart-verdict"><span>AB ${bs}${why.length ? ` (${esc(why.join(", "))})` : ""}</span><b>${esc(shootVerdict(t))}</b></div>
    ${skipped.length ? `<p class="note">${skipped.map(x => x.id === "long"
        ? "La lunga gittata non si somma al tira e tieni (p. " + P.sevenPlus + ")."
        : "Vale la copertura piena, non tutte e due (p. " + P.shoot + ").").join(" ")}</p>` : ""}
    ${grid({ rows: SHOOT_ROWS, cols: R10, rowKey:"mod", colKey:"bs",
             corner:"mod", rowHead:"modificatori", colHead:"Abilità Balistica",
             cell: (m, b) => shootCell(shootTarget(b, m)), selR: total, selC: bs,
             rowLabel: m => sign(m) })}
    <ul class="chart-notes">
      <li>La riga <b>0</b> è la tabella del libro: AB 1-5 colpisce a 6+, 5+, 4+, 3+, 2+ (p. ${P.shoot}).</li>
      <li>Da AB 6 in su si colpisce a 2+ e chi manca ritira: <span class="mono">2+/6+</span> è il ritiro a 6+. I modificatori pesano solo sul primo tiro (p. ${P.shoot}).</li>
      <li>Oltre il 6 non è finita: <span class="mono">6·4</span> è un 6 naturale, e quel dado si ritira e colpisce con un 4+. Serve 7+ → 4+, 8+ → 5+, 9+ → 6; da 10+ non si colpisce (p. ${P.sevenPlus}).</li>
      <li>Un 1 naturale manca sempre (p. ${P.shoot}).</li>
      <li>Chi colpisce ferisce con la Forza dell'arma: scheda <b>Ferire</b>.</li>
    </ul>`;
}

function woundHTML(){
  const s = st.s, t = st.t;
  const n = woundOn(s, t);
  const verdict = n >= IMPOSSIBLE ? "troppo resistente: non ferisce" : `ferisce a ${n}+`;
  return `
    <div class="chart-pick">${pick("s", "Forza dell'arma", 1, 10)}${pick("t", "Resistenza del bersaglio", 1, 10)}</div>
    <div class="readout chart-verdict"><span>F ${s} contro R ${t}</span><b>${verdict}</b></div>
    ${grid({ rows: R10, cols: R10, rowKey:"s", colKey:"t",
             corner:"F \\ R", rowHead:"Forza dell'arma", colHead:"Resistenza del bersaglio",
             cell: (r, c) => plain(woundOn(r, c)), selR: s, selC: t })}
    <ul class="chart-notes">
      <li>La Forza è quella dell'arma: «S+1» si somma a quella di chi la impugna, «As user» è la sua.</li>
      <li>Un 1 naturale non ferisce mai (p. ${P.woundShoot}).</li>
      <li>Con la Forza sei punti o più sotto la Resistenza non si ferisce proprio (p. ${P.woundShoot}).</li>
      <li>Poi l'armatura: peggiora di un punto per ogni punto di perforazione, e un 1 naturale non salva mai (p. ${P.wound}).</li>
    </ul>
    <p class="note">La stessa tabella sta a p. ${P.woundShoot} per il tiro e a p. ${P.wound} per la mischia.</p>`;
}

function render(){
  const h = ensureHost();
  const keep = h.hidden ? 0 : h.scrollTop;
  h.hidden = false;
  h.innerHTML = `
    <div class="chart-card" role="dialog" aria-label="Tabelle del manuale">
      <div class="chart-head">
        <b>Tabelle</b>
        <div class="chart-tabs">${TABS.map(([id, label]) =>
          `<button class="btn tiny${st.tab === id ? " on" : ""}" data-ctab="${id}">${label}</button>`).join("")}</div>
        <span class="spacer"></span>
        <button class="btn tiny ghost" id="ch-close">Chiudi</button>
      </div>
      ${st.tab === "shoot" ? shootHTML() : st.tab === "wound" ? woundHTML() : meleeHTML()}
    </div>`;
  h.scrollTop = keep;
  wire();
}

function wire(){
  const h = host;
  const redo = () => { save(); render(); };
  h.querySelector("#ch-close").addEventListener("click", closeCharts);
  h.querySelectorAll("[data-ctab]").forEach(b => b.addEventListener("click", () => {
    st.tab = b.dataset.ctab; redo();
  }));
  h.querySelectorAll("[data-ckey]").forEach(s => s.addEventListener("change", () => {
    st[s.dataset.ckey] = +s.value; redo();
  }));
  h.querySelectorAll("[data-cflag]").forEach(c => c.addEventListener("change", () => {
    st.mods = { ...(st.mods || {}), [c.dataset.cflag]: c.checked }; redo();
  }));
  const other = h.querySelector("[data-cmod]");
  if (other) other.addEventListener("change", () => {
    st.mods = { ...(st.mods || {}), other: +other.value }; redo();
  });
  /* toccare una cella sceglie la sua riga e la sua colonna. La riga del
     tiro e' un totale di modificatori, non una casella: toccarla toglie
     le spunte e mette il totale fra gli altri. */
  h.querySelectorAll("td[data-r]").forEach(td => td.addEventListener("click", () => {
    const { r, c, rk, ck } = td.dataset;
    if (rk === "mod") st.mods = +r ? { other: +r } : {};
    else st[rk] = +r;
    st[ck] = +c;
    redo();
  }));
}

/* ============================================================
   4 · LE PORTE DI CASA
   ============================================================ */
export function openCharts(opts = {}){
  st = { ...load(), ...clean(opts || {}) };
  save();
  render();
}

export function closeCharts(){
  if (!host) return;
  host.hidden = true;
  host.innerHTML = "";
}

export const chartsOpen = () => !!(host && !host.hidden);

export function toggleCharts(){
  if (chartsOpen()) closeCharts(); else openCharts();
}

/* Il pezzo di HTML che apre la tabella giusta da un punteggio scritto
   altrove: lo scontro e il tiro lo mettono attorno al loro «3+». */
export function chartLink(label, opts){
  return `<button type="button" class="chart-link" data-chart="${esc(JSON.stringify(opts))}" title="Apri la tabella">${label}</button>`;
}
