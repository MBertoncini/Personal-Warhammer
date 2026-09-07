/* Schieramento Old World — archivio delle partite (battle report)
 *
 * Una partita registrata serve a due cose, e la seconda e' quella che
 * conta: riguardarla, e farsela spiegare. Il pulsante "Copia per l'AI"
 * mette negli appunti il resoconto intero — liste, schieramento,
 * movimento e perdite turno per turno, punteggio voce per voce — in
 * Markdown, preceduto dalla domanda giusta. Si incolla in chat e si
 * ragiona sul perche' e' andata storta invece di ricordarsela male.
 *
 * Due strade per arrivarci:
 *  - dal tavolo, giocando: la partita fotografa da sola ogni fine turno
 *    e qui si archivia;
 *  - a mano, per una partita giocata altrove: si scelgono due liste
 *    salvate e si compilano i turni, portandosi avanti la situazione
 *    precedente cosi' si scrive solo quello che e' cambiato.
 *
 * I conti stanno in battlelog.js; qui c'e' l'archivio e il pannello.
 */

import { $, esc } from './util.js';
import { loadDoc, saveDoc } from './store.js';
import { emit, on } from './bus.js';
import { askConfirm, say } from './uikit.js';
import { copyText } from './share.js';
import { allLists, getList } from './lists.js';
import { SCENARIOS } from './scenarios.js';
import { customScenarioMap } from './scenariokit.js';
import { state } from './deploy.js';
import * as BL from './battlelog.js';
import { shotFromTurn, shotSVG, shotCaption } from './tableshot.js';

const REP_KEY = "reports:all";

let reports = [];
let openId = null;
let openTurn = 0;          // quale turno e' aperto nell'editor

const allScenarios = () => ({ ...SCENARIOS, ...customScenarioMap() });
const scenarioDef = id => allScenarios()[id] || SCENARIOS.open;

export async function initReports(){
  reports = await loadDoc(REP_KEY, []) || [];
  for (const r of reports) normalize(r);
}

const persist = () => saveDoc(REP_KEY, reports).then(() => emit("reports:changed"));

export const allReports = () => reports.slice();
export const getReport = id => reports.find(r => r.id === id) || null;

const newId = () => "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* un report vecchio o scritto male non deve far esplodere il pannello */
function normalize(rep){
  rep.meta = BL.ensureMeta(rep.meta);
  rep.score = BL.ensureScore(rep.score);
  rep.turns = Array.isArray(rep.turns) ? rep.turns : [];
  rep.roster = rep.roster && rep.roster.A ? rep.roster : { A:[], B:[] };
  rep.armies = rep.armies || { A:{ name:"Esercito A" }, B:{ name:"Esercito B" } };
  rep.table = rep.table || { w:48, h:36, gap:12 };
  rep.scenario = rep.scenario || { id:"open", label:"Battaglia Campale" };
  if (typeof rep.notes !== "string") rep.notes = "";
  return rep;
}

/* ============================================================
   1 · ARCHIVIARE
   ============================================================ */

/* La partita che sta sul tavolo diventa una voce dell'archivio. Il
   tavolo non viene toccato: si puo' archiviare a meta' partita per
   avere una copia e continuare a giocare. */
export async function archiveCurrent(){
  const g = state.game || {};
  if (!g.turns || !g.turns.length)
    throw new Error("Non c'è nessuna partita registrata sul tavolo: comincia una partita nel pannello di sinistra.");
  const rep = BL.buildReport(state, scenarioDef(state.scenario));
  reports.unshift(rep);
  openId = rep.id;
  openTurn = 0;
  await persist();
  return rep;
}

/* Una partita giocata altrove: si parte da due liste salvate, cosi' i
   nomi, i modelli e i punti sono gia' quelli giusti e resta da scrivere
   solo quello che e' successo. */
export async function newFromLists(idA, idB, { title = "" } = {}){
  const la = getList(idA), lb = getList(idB);
  const sc = scenarioDef(state.scenario);
  const rep = normalize({
    format: BL.FORMAT,
    id: newId(),
    saved: new Date().toISOString(),
    title: title || `${la ? la.name : "Esercito A"} vs ${lb ? lb.name : "Esercito B"}`,
    meta: BL.emptyMeta(),
    scenario: { id: state.scenario, label: sc.label, group: sc.group || "",
                pts: sc.pts || 0, deploy: sc.deploy || "", desc: sc.desc || "" },
    table: { w: sc.table ? sc.table[0] : 48, h: sc.table ? sc.table[1] : 36, gap: sc.gap || 12 },
    armies: { A:{ name: la ? la.name : "Esercito A", info: la ? la.info : null },
              B:{ name: lb ? lb.name : "Esercito B", info: lb ? lb.info : null } },
    terrain: [],
    roster: { A: rosterFromList(la, "A"), B: rosterFromList(lb, "B") },
    turns: [],
    score: BL.emptyScore(),
    notes: "",
    log: [],
  });
  rep.meta.pts = rep.scenario.pts || 0;
  rep.turns.push(blankDeploy(rep));
  rep.turns.push(BL.blankTurn(rep, { n:1, army:"A" }));
  reports.unshift(rep);
  openId = rep.id;
  openTurn = 1;
  await persist();
  return rep;
}

function rosterFromList(list, army){
  return (list ? list.units : []).map((u, i) => ({
    uid: army + (i + 1), idx: i + 1, army, name: u.name,
    troop: u.troop || "", slot: u.slot || "",
    models: u.models || 1, pts: u.pts || 0, us: u.us || 0,
    baseW: u.baseW, baseH: u.baseH, frontage: u.frontage || 1,
    loose: !!u.loose, maxRange: u.maxRange || 0,
    move: u.stats && /^\d+$/.test(String(u.stats.M)) ? +u.stats.M : 0,
    rules: Array.isArray(u.rules) ? u.rules.slice(0, 10) : [],
    weapons: Array.isArray(u.weapons) ? u.weapons.map(w => w.name).slice(0, 6) : [],
  }));
}

function blankDeploy(rep){
  const units = [...rep.roster.A, ...rep.roster.B].map(c => ({
    uid: c.uid, army: c.army, name: c.name, models: c.models,
    alive: c.models, lost: 0, dLost: 0,
    dead: false, fled: false, placed: true,
    x: 0, y: 0, rot: c.army === "A" ? 0 : 180, moved: 0, zone: "",
  }));
  return { kind:"deploy", n:0, army:"", at: Date.now(), units, events: [], note: "" };
}

export async function removeReport(id){
  reports = reports.filter(r => r.id !== id);
  if (openId === id) openId = null;
  await persist();
}

/* ============================================================
   2 · MODIFICHE
   ============================================================ */
function setPath(obj, path, value){
  const parts = path.split(".");
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] ||= {};
  o[parts[parts.length - 1]] = value;
}

function addTurn(rep){
  const last = [...rep.turns].reverse().find(t => t.kind === "turn");
  const next = last
    ? (last.army === "A" ? { n: last.n, army: "B" } : { n: last.n + 1, army: "A" })
    : { n: 1, army: rep.meta.first === "B" ? "B" : "A" };
  rep.turns.push(BL.blankTurn(rep, next));
  openTurn = rep.turns.length - 1;
}

const STATES = [
  { id:"field",   label:"in campo" },
  { id:"fled",    label:"in rotta" },
  { id:"dead",    label:"distrutta" },
  { id:"reserve", label:"in riserva" },
];
const stateId = r => r.dead ? "dead" : r.fled ? "fled" : !r.placed ? "reserve" : "field";

function setUnitState(rep, ti, rec, id){
  const prevLost = lostBefore(rep, ti, rec.uid);
  rec.dead = id === "dead";
  rec.fled = id === "fled";
  rec.placed = id !== "reserve" && id !== "dead";
  /* "distrutta" senza perdite non vuol dire niente: un reggimento
     inseguito fuori dal tavolo conta come annientato, quindi il conto
     dei modelli si allinea da solo. */
  if (id === "dead") rec.dLost = Math.max(rec.dLost || 0, (rec.models || 0) - prevLost);
  BL.recount(rep);
}

function lostBefore(rep, ti, uid){
  for (let i = ti - 1; i >= 0; i--){
    const r = (rep.turns[i].units || []).find(x => x.uid === uid);
    if (r) return r.lost || 0;
  }
  return 0;
}

/* ============================================================
   3 · PANNELLO
   ============================================================ */
export function renderReports(){
  const host = $("#reports");
  if (!host) return;
  const rep = openId ? getReport(openId) : null;
  const ls = allLists();
  const shots = (state.game && state.game.turns) || [];
  const played = shots.filter(t => t.kind === "turn").length;

  host.innerHTML = `
    <div class="bar">
      <button class="btn primary" id="rp-archive" ${shots.length ? "" : "disabled"}
        title="${shots.length ? "Salva qui la partita che sta sul tavolo" : "Comincia una partita nel Tavolo per avere qualcosa da archiviare"}">
        Archivia la partita del tavolo${played ? ` (${played} turni)` : shots.length ? " (solo schieramento)" : ""}</button>
      <button class="btn" id="rp-new" ${ls.length ? "" : "disabled"}
        title="${ls.length ? "Registra una partita giocata altrove" : "Servono due liste salvate"}">Nuova partita a mano…</button>
    </div>
    <div id="rp-new-box" hidden>
      <div class="grid3" style="margin-top:8px">
        <label class="field">Esercito A<select id="rp-la">${listOpts(ls)}</select></label>
        <label class="field">Esercito B<select id="rp-lb">${listOpts(ls)}</select></label>
        <label class="field">&nbsp;<button class="btn primary" id="rp-create">Crea</button></label>
      </div>
    </div>
    <div class="ls-split" style="margin-top:10px">
      <div class="ls-side">
        ${reports.length ? reports.map(sideRow).join("") : `<p class="empty">Nessuna partita registrata.</p>`}
      </div>
      <div class="ls-detail">${rep ? detailHTML(rep) : `<p class="empty">Scegli una partita, o archivia quella del tavolo.</p>`}</div>
    </div>`;

  wireTop(host, ls);
  if (rep) wireDetail(host, rep);
}

const listOpts = ls => `<option value="">—</option>` +
  ls.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join("");

function sideRow(r){
  const v = BL.verdict(r);
  const key = !v.winner ? "idle" : v.winner === "A" ? "ok" : "bad";
  return `
    <div class="row u-row ${r.id === openId ? "sel" : ""}" data-open="${r.id}">
      <span class="nm"><b><span class="txt">${esc(r.title)}</span></b>
        <span class="mono">${esc(r.meta.date || "")} · ${r.turns.filter(t => t.kind === "turn").length} turni · ${esc(r.scenario.label || "")}</span></span>
      <span class="chip ${key}">${v.A}–${v.B}</span>
    </div>`;
}

/* ---------- scheda della partita ---------- */
function detailHTML(rep){
  const v = BL.verdict(rep);
  const sc = allScenarios();
  return `
    <div class="panel-title">Partita
      <button class="btn tiny ghost" data-del="${rep.id}" style="color:var(--bad);float:right">Elimina</button></div>

    <label class="field">Titolo<input type="text" data-f="title" value="${esc(rep.title)}"></label>
    <div class="grid3">
      <label class="field">Data<input type="date" data-f="meta.date" value="${esc(rep.meta.date || "")}"></label>
      <label class="field">Luogo<input type="text" data-f="meta.place" value="${esc(rep.meta.place || "")}"></label>
      <label class="field">Evento<input type="text" data-f="meta.event" value="${esc(rep.meta.event || "")}"></label>
    </div>
    <div class="grid2">
      <label class="field">Esercito A<input type="text" data-f="armies.A.name" value="${esc(rep.armies.A.name || "")}"></label>
      <label class="field">Esercito B<input type="text" data-f="armies.B.name" value="${esc(rep.armies.B.name || "")}"></label>
    </div>
    <div class="grid2">
      <label class="field">Giocatore A<input type="text" data-f="meta.playerA" value="${esc(rep.meta.playerA || "")}"></label>
      <label class="field">Giocatore B<input type="text" data-f="meta.playerB" value="${esc(rep.meta.playerB || "")}"></label>
    </div>
    <label class="field">Scenario
      <select data-f="scenario.id">
        ${Object.entries(sc).map(([id, d]) =>
          `<option value="${id}" ${id === rep.scenario.id ? "selected" : ""}>${esc(d.label)}</option>`).join("")}
      </select></label>
    <div class="grid3">
      <label class="field">Punti concordati<input type="number" min="0" data-f="meta.pts" value="${+rep.meta.pts || 0}"></label>
      <label class="field">Turni previsti<input type="number" min="1" max="12" data-f="meta.rounds" value="${+rep.meta.rounds || 6}"></label>
      <label class="field">Primo turno
        <select data-f="meta.first">
          <option value="A" ${rep.meta.first !== "B" ? "selected" : ""}>Esercito A</option>
          <option value="B" ${rep.meta.first === "B" ? "selected" : ""}>Esercito B</option>
        </select></label>
    </div>

    ${rosterHTML(rep)}
    ${progressHTML(rep)}

    <div class="panel-title" style="margin-top:14px">Turni</div>
    <p class="note">Ogni turno è la situazione <b>a fine turno</b>. Scrivi solo quello che è cambiato: in piedi, perdite e stato si portano avanti da soli, e correggere un numero al turno 2 risistema tutti i turni dopo.</p>
    <div class="tray">${rep.turns.map((t, i) => turnHTML(rep, t, i)).join("")}</div>
    <button class="btn tiny" data-addturn="1" style="margin-top:6px">+ Aggiungi turno</button>

    ${scoreHTML(rep, v)}

    <div class="panel-title" style="margin-top:14px">Note</div>
    <p class="note">Cosa ricordi della partita: la mossa che non torna, il tiro di dadi che ha deciso, il dubbio sulla lista. Finisce nel report.</p>
    <textarea data-f="notes" rows="4" placeholder="Il turno 3 mi ha rotto il fianco sinistro…">${esc(rep.notes || "")}</textarea>

    <div class="panel-title" style="margin-top:14px">Esporta</div>
    <p class="note">«Copia per l'AI» mette negli appunti il report completo in Markdown, con davanti la richiesta di analizzarlo: si incolla in chat e basta.</p>
    <div class="grid2">
      <button class="btn primary" id="rp-copy-ai">Copia per l'AI</button>
      <button class="btn" id="rp-copy-md">Copia il Markdown</button>
    </div>
    <div class="grid2" style="margin-top:6px">
      <button class="btn" id="rp-dl-md">Scarica .md</button>
      <button class="btn" id="rp-dl-json">Scarica .json</button>
    </div>
    <details class="raw" style="margin-top:8px">
      <summary>Anteprima del testo</summary>
      <pre id="rp-preview">${esc(BL.reportMarkdown(rep))}</pre>
    </details>`;
}

function rosterHTML(rep){
  const side = k => {
    const list = rep.roster[k] || [];
    const pts = list.reduce((s, u) => s + (u.pts || 0), 0);
    return `
      <div>
        <div class="readout"><span><span class="swatch" style="background:var(--army${k})"></span>${esc(rep.armies[k].name || "Esercito " + k)}</span>
          <b>${pts} pt · ${list.length} unità</b></div>
        ${list.length ? "" : `<p class="empty">Nessuna unità.</p>`}
      </div>`;
  };
  return `<div class="panel-title" style="margin-top:14px">Liste</div>${side("A")}${side("B")}`;
}

function progressHTML(rep){
  const rows = BL.progress(rep);
  if (!rows.length) return "";
  return `
    <div class="panel-title" style="margin-top:14px">Andamento</div>
    <div class="tablewrap"><table class="grid-table">
      <thead><tr><th>Turno</th><th>Gioca</th><th>Perdite A</th><th>Perdite B</th><th>Unità perse</th></tr></thead>
      <tbody>${rows.map(p => `<tr>
        <td>T${p.n}</td><td>${p.army || "—"}</td>
        <td>${p.A.models} mdl · ${p.A.pts} pt</td>
        <td>${p.B.models} mdl · ${p.B.pts} pt</td>
        <td>${p.A.units || 0} / ${p.B.units || 0}</td></tr>`).join("")}</tbody>
    </table></div>`;
}

function turnHTML(rep, t, i){
  const open = i === openTurn;
  const title = t.kind === "deploy" ? "Schieramento" : `Turno ${t.n} — Esercito ${t.army || "?"}`;
  const lost = (t.units || []).reduce((s, r) => s + (r.dLost || 0), 0);
  const head = `
    <div class="row u-row${open ? " sel" : ""}" data-turn="${i}">
      <span class="nm"><b><span class="txt">${title}</span></b>
        <span class="mono">${t.kind === "deploy" ? (t.units || []).length + " unità in campo"
          : lost + (lost === 1 ? " modello perso" : " modelli persi")}</span></span>
      <span style="display:flex;gap:4px;align-items:center">
        ${t.kind === "turn" ? `<button class="btn tiny ghost" data-delturn="${i}" style="color:var(--bad)" title="Elimina il turno">×</button>` : ""}
        <span class="chip idle">${open ? "aperto" : "apri"}</span>
      </span>
    </div>`;
  if (!open) return head;

  const rows = (t.units || []).filter(r => !goneBefore(rep, i, r.uid));
  /* Il tavolo com'era: una tabella di coordinate non si legge, un
     disegno si'. Compare solo per i turni registrati giocando, gli
     unici che hanno le posizioni. */
  const shot = shotFromTurn(rep, t);
  return head + `
    <div class="turn-edit">
      ${shot.units.length ? `<div class="tvbox">
        <div class="tvscreen">${shotSVG(shot, { height: 240 })}</div>
        <div class="tvcap mono">${esc(shotCaption(shot, t))}</div>
      </div>` : ""}
      ${contactsList(t)}
      <div class="tablewrap"><table class="grid-table">
        <thead><tr><th>Unità</th><th>In piedi</th><th>Perdite</th><th>Ferite</th><th>Mosso ″</th><th>Zona / posizione</th><th>Etichette</th><th>Stato</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr class="${r.dead ? "gone" : ""}">
              <td><span class="swatch" style="background:var(--army${r.army})"></span>${esc(r.name)}</td>
              <td class="mono">${r.alive}/${r.models}</td>
              <td>${t.kind === "deploy" ? "—"
                : `<input type="number" min="0" max="${r.models}" value="${r.dLost || 0}" data-tu="${i}|${r.uid}|dLost">`}</td>
              <!-- le ferite: per un personaggio, un mostro o un carro
                   sono l'unica valuta, e un report a mano senza questa
                   casella non racconta il turno che conta -->
              <td><input type="number" min="0" value="${r.wounds || 0}" data-tu="${i}|${r.uid}|wounds"></td>
              <td>${t.kind === "deploy" ? "—"
                : `<input type="number" min="0" step="0.5" value="${r.moved || 0}" data-tu="${i}|${r.uid}|moved">`}</td>
              <td><input type="text" value="${esc(r.zone || "")}" data-tu="${i}|${r.uid}|zone"
                    placeholder="${r.placed && (r.x || r.y) ? esc(r.x + ", " + r.y) : "dove si trovava"}">
                ${r.terrain && r.terrain.length
                  ? `<span class="mono" style="color:var(--muted)">${esc(r.terrain.map(x => x.label.toLowerCase() + " " + x.models + "/" + x.of).join(", "))}</span>` : ""}</td>
              <td><input type="text" value="${esc((r.tags || []).join(", "))}" data-tu="${i}|${r.uid}|tags"
                    placeholder="disordinata, ha caricato…"></td>
              <td><select data-tu="${i}|${r.uid}|state">
                ${STATES.map(s => `<option value="${s.id}" ${s.id === stateId(r) ? "selected" : ""}>${s.label}</option>`).join("")}
              </select></td>
            </tr>`).join("")}
        </tbody>
      </table></div>
      ${t.events && t.events.length ? `<div class="gamelog">${t.events.map(e =>
        `<div class="logline"><span>${esc(e)}</span></div>`).join("")}</div>` : ""}
      <textarea rows="2" data-tu="${i}||note" placeholder="Cosa è successo in questo turno">${esc(t.note || "")}</textarea>
    </div>`;
}

/* Chi toccava chi, e da che lato. E' il dato che un resoconto scritto
   a mano non ha mai, e senza il quale un turno di combattimenti
   sembra un turno di movimento. */
function contactsList(t){
  const list = (t.contacts || []);
  if (!list.length) return "";
  return `<div class="tablewrap"><table class="grid-table">
    <thead><tr><th>Contatti di basetta</th><th>Lato</th><th>Contro</th><th>Lato</th></tr></thead>
    <tbody>${list.map(c => `<tr${c.enemy ? "" : ' class="gone"'}>
      <td>${esc(c.aName)}</td><td>${esc(c.aSide)}</td>
      <td>${esc(c.bName)}</td><td>${esc(c.bSide)}</td></tr>`).join("")}</tbody>
  </table></div>`;
}

/* un'unita' distrutta prima di questo turno non ha piu' niente da dire */
function goneBefore(rep, ti, uid){
  for (let i = 0; i < ti; i++){
    const r = (rep.turns[i].units || []).find(x => x.uid === uid);
    if (r && r.dead) return true;
  }
  return false;
}

function scoreHTML(rep, v){
  return `
    <div class="panel-title" style="margin-top:14px">Punteggio</div>
    <p class="note">Le prime tre righe le calcola l'app sull'ultima situazione registrata: unità distrutte, ridotte a metà o in rotta. Le altre le sai solo tu — obiettivi, generale, stendardi, quarti di tavolo. Scrivendo un numero a mano su una riga calcolata, quella riga smette di essere ricalcolata.</p>
    <div class="tablewrap"><table class="grid-table score-table">
      <thead><tr><th>Voce</th><th>${esc(rep.armies.A.name || "A")}</th><th>${esc(rep.armies.B.name || "B")}</th><th></th></tr></thead>
      <tbody>
        ${rep.score.rows.map((r, i) => `
          <tr>
            <td>${r.auto ? esc(r.label) : `<input type="text" value="${esc(r.label)}" data-sr="${i}|label">`}</td>
            <td><input type="number" value="${+r.A || 0}" data-sr="${i}|A"></td>
            <td><input type="number" value="${+r.B || 0}" data-sr="${i}|B"></td>
            <td>${r.auto
              ? `<span class="chip ${r.manual ? "warn" : "idle"}" title="${r.manual ? "corretta a mano" : "calcolata dai turni"}">${r.manual ? "a mano" : "auto"}</span>`
              : `<button class="btn tiny ghost" data-srdel="${i}" style="color:var(--bad)">×</button>`}</td>
          </tr>`).join("")}
      </tbody>
    </table></div>
    <div class="grid2" style="margin-top:6px">
      <button class="btn tiny" id="rp-recalc">Ricalcola le voci automatiche</button>
      <button class="btn tiny" id="rp-addrow">+ Voce mia</button>
    </div>
    <div class="readout" style="margin-top:6px"><span>Totale</span><b>${v.A} — ${v.B}</b></div>
    <div class="warnbox" style="border-color:var(--accent)">${esc(v.text)}</div>`;
}

/* ============================================================
   4 · AGGANCI
   ============================================================ */
function wireTop(host, ls){
  const arc = $("#rp-archive");
  arc.addEventListener("click", async () => {
    try { await archiveCurrent(); renderReports(); }
    catch (err){ await say(err.message, { title:"Non ci riesco" }); }
  });
  $("#rp-new").addEventListener("click", () => {
    const b = $("#rp-new-box"); b.hidden = !b.hidden;
  });
  const create = $("#rp-create");
  if (create) create.addEventListener("click", async () => {
    const a = $("#rp-la").value, b = $("#rp-lb").value;
    if (!a && !b) return say("Una partita a mano parte da almeno una lista salvata.", { title:"Scegli una lista" });
    await newFromLists(a, b);
    renderReports();
  });
  host.querySelectorAll("[data-open]").forEach(el => el.addEventListener("click", () => {
    openId = el.dataset.open; openTurn = 0; renderReports();
  }));
}

function wireDetail(host, rep){
  const save = async ({ render = true } = {}) => {
    rep.saved = new Date().toISOString();
    await persist();
    if (render) renderReports();
  };

  host.querySelector("[data-del]").addEventListener("click", async () => {
    if (!await askConfirm("Il report non si recupera.", { title:"Eliminare la partita?" })) return;
    await removeReport(rep.id);
    renderReports();
  });

  /* campi della scheda */
  host.querySelectorAll("[data-f]").forEach(el => el.addEventListener("change", async () => {
    const path = el.dataset.f;
    let value = el.type === "number" ? (+el.value || 0) : el.value;
    if (path === "scenario.id"){
      const d = scenarioDef(value);
      rep.scenario = { id: value, label: d.label, group: d.group || "", pts: d.pts || 0,
                       deploy: d.deploy || "", desc: d.desc || "" };
      if (d.table) rep.table = { w: d.table[0], h: d.table[1], gap: d.gap || rep.table.gap };
    } else setPath(rep, path, value);
    await save({ render: path === "scenario.id" });
  }));

  /* turni */
  host.querySelectorAll("[data-turn]").forEach(el => el.addEventListener("click", e => {
    if (e.target.closest("[data-delturn]")) return;
    const i = +el.dataset.turn;
    openTurn = openTurn === i ? -1 : i;
    renderReports();
  }));
  host.querySelectorAll("[data-delturn]").forEach(el => el.addEventListener("click", async e => {
    e.stopPropagation();
    if (!await askConfirm("Il turno sparisce dal registro e i superstiti dei turni dopo si ricalcolano.", { title:"Eliminare il turno?" })) return;
    rep.turns.splice(+el.dataset.delturn, 1);
    BL.recount(rep); BL.applyAuto(rep);
    openTurn = Math.min(openTurn, rep.turns.length - 1);
    await save();
  }));
  const addT = host.querySelector("[data-addturn]");
  if (addT) addT.addEventListener("click", async () => { addTurn(rep); await save(); });

  host.querySelectorAll("[data-tu]").forEach(el => el.addEventListener("change", async () => {
    const [ti, uid, field] = el.dataset.tu.split("|");
    const t = rep.turns[+ti];
    if (field === "note"){ t.note = el.value; return save({ render: false }); }
    /* gli uid del tavolo sono numeri, quelli scritti a mano stringhe:
       dal DOM tornano sempre stringhe */
    const rec = (t.units || []).find(r => String(r.uid) === uid);
    if (!rec) return;
    if (field === "state") setUnitState(rep, +ti, rec, el.value);
    else if (field === "zone") rec.zone = el.value;
    else if (field === "tags"){
      /* parole libere separate da virgola: l'app non ne conosce
         l'elenco e non deve conoscerlo */
      rec.tags = el.value.split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    }
    else {
      rec[field] = Math.max(0, +el.value || 0);
      if (field === "dLost") BL.recount(rep);
    }
    BL.applyAuto(rep);
    await save({ render: field !== "zone" });
  }));

  /* punteggio */
  host.querySelectorAll("[data-sr]").forEach(el => el.addEventListener("change", async () => {
    const [i, field] = el.dataset.sr.split("|");
    const row = rep.score.rows[+i];
    if (field === "label") row.label = el.value;
    else { row[field] = +el.value || 0; if (row.auto) row.manual = true; }
    await save();
  }));
  host.querySelectorAll("[data-srdel]").forEach(el => el.addEventListener("click", async () => {
    rep.score.rows.splice(+el.dataset.srdel, 1);
    await save();
  }));
  host.querySelector("#rp-recalc").addEventListener("click", async () => {
    for (const r of rep.score.rows) if (r.auto) r.manual = false;
    BL.applyAuto(rep);
    await save();
  });
  host.querySelector("#rp-addrow").addEventListener("click", async () => {
    rep.score.rows.push({ id:"x" + rep.score.rows.length, label:"Voce mia", auto:null, A:0, B:0, manual:true });
    await save();
  });

  /* esportazione */
  const flash = (btn, txt) => {
    const old = btn.textContent;
    btn.textContent = txt;
    setTimeout(() => { btn.textContent = old; }, 2200);
  };
  const copy = async (btn, text) => flash(btn, await copyText(text) ? "Copiato ✓" : "Non riesco a copiare");
  host.querySelector("#rp-copy-ai").addEventListener("click", e =>
    copy(e.currentTarget, BL.reportMarkdown(rep, { prompt: true })));
  host.querySelector("#rp-copy-md").addEventListener("click", e =>
    copy(e.currentTarget, BL.reportMarkdown(rep)));
  host.querySelector("#rp-dl-md").addEventListener("click", () =>
    download(BL.reportMarkdown(rep, { prompt: true }), BL.fileName(rep, "md"), "text/markdown"));
  host.querySelector("#rp-dl-json").addEventListener("click", () =>
    download(BL.reportJSON(rep), BL.fileName(rep, "json"), "application/json"));
}

function download(text, name, type){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* Il pannello della partita, sul tavolo, chiede di archiviare: da li'
   non puo' chiamare questo modulo senza creare un giro di import, e
   allora manda un segnale. */
on("report:archive", async () => {
  try {
    await archiveCurrent();
    emit("tab:show", "report");
    renderReports();
  } catch (err){ await say(err.message, { title:"Non ci riesco" }); }
});
