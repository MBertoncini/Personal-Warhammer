/* Schieramento Old World — modalita' partita
 *
 * Lo schieramento e' il minuto zero: dopo si gioca per tre ore. Questa
 * modalita' non arbitra niente e non conosce le regole — tiene il conto
 * di quello che al tavolo si dimentica sempre: a che turno siamo, di chi
 * e' la fase, quanti modelli sono caduti e quanti punti valevano.
 *
 * Le perdite non sono un numero e basta: tolti i modelli, il reggimento
 * perde i ranghi di dietro e sul tavolo si accorcia da solo, che e'
 * esattamente quello che succede alle miniature vere.
 *
 * Le perdite si segnano da tre posti, e il terzo e' quello che conta
 * quando i modelli non stanno in griglia: la lista di tutte le unita'
 * qui nel pannello, l'ispettore, e l'editor della formazione, dove si
 * clicca QUALE modello e' caduto. Sopra a tutto c'e' lo schermino: il
 * tavolo in piccolo, adesso e a ogni fine turno gia' registrato.
 *
 * A ogni fine turno si scatta una fotografia: dove sta ogni unita', di
 * quanto si e' mossa, quanti modelli ha perso. Le fotografie stanno
 * dentro lo stato del tavolo — quindi si annullano, si salvano e si
 * riaprono come tutto il resto — e diventano il battle report che si
 * archivia nella scheda Partite (reports.js). Il conto lo fa
 * battlelog.js, che di DOM non sa niente.
 */

import * as BL from './battlelog.js';
import * as FM from './formation.js';
import { shotFromTurn, shotSVG, shotCaption } from './tableshot.js';
import { openEditor } from './formeditor.js';
import { emit } from './bus.js';
import { inch } from './util.js';

const PHASES = [
  { id:"strategy", label:"Strategia" },
  { id:"movement", label:"Movimento" },
  { id:"shooting", label:"Tiro" },
  { id:"combat",   label:"Corpo a corpo" },
];

export const emptyGame = () => ({
  on:false, turn:1, army:"A", phase:0, log:[],
  /* il registro della partita: [0] e' lo schieramento, poi una voce per
     turno giocato */
  turns:[], lastCapture:0,
  meta: BL.emptyMeta(), score: BL.emptyScore(), notes:"",
});

/* Le partite salvate prima che esistesse il registro non hanno ne'
   fotografie ne' punteggio: si riempiono i buchi invece di ripartire da
   zero, che vorrebbe dire buttare via il tabellino di una partita in
   corso. */
export function ensureGame(g){
  if (!g || typeof g !== "object") return emptyGame();
  g.log = Array.isArray(g.log) ? g.log : [];
  g.turns = Array.isArray(g.turns) ? g.turns : [];
  g.meta = BL.ensureMeta(g.meta);
  g.score = BL.ensureScore(g.score);
  if (typeof g.notes !== "string") g.notes = "";
  if (typeof g.lastCapture !== "number") g.lastCapture = 0;
  return g;
}

let ctx = null;

export function initGame(c){ ctx = c; }

const S = () => ctx.getState();
export const game = () => { const s = S(); return (s.game ||= emptyGame()); };
export const phases = () => PHASES;
export const phaseLabel = () => PHASES[game().phase].label;

/* quanti modelli restano in piedi */
export const alive = u => Math.max(0, (u.models || 0) - (u.lost || 0));

export function logLine(text, { army = null } = {}){
  const g = game();
  g.log.unshift({ t: g.turn, army: army || g.army, phase: PHASES[g.phase].label, text, at: Date.now() });
  if (g.log.length > 300) g.log.length = 300;
}

export function start(){
  const g = game();
  g.on = true; g.turn = 1; g.army = "A"; g.phase = 0; g.log = [];
  g.turns = []; g.lastCapture = 0;
  g.meta = BL.ensureMeta({ ...g.meta, date: BL.today(), first: "A" });
  g.score = BL.emptyScore();
  g.notes = "";
  for (const u of S().units){ u.lost = 0; u.dead = false; u.fled = false; u.fallen = []; }
  shotAt = null;
  logLine("Inizio della partita.");
  /* la prima fotografia e' lo schieramento: e' il termine di paragone
     di ogni movimento che verra' dopo */
  g.turns.push(BL.deployRecord(S()));
  g.lastCapture = Date.now();
}

export function stop(){
  const g = game();
  g.on = false;
  /* l'ultima parola sul tavolo vale quanto un turno: senza questa
     fotografia il punteggio finale non avrebbe da dove leggere chi e'
     rimasto in piedi */
  if (g.turns.length && !g.turns.some(t => t.kind === "turn" && t.n === g.turn && t.army === g.army))
    captureTurn({ closing: true });
  BL.applyAuto(reportView());
  logLine("Partita chiusa.");
}

/* ------------------------------------------------------------------
   Fine turno: la fotografia
   ------------------------------------------------------------------ */

/* Le righe di registro scritte da quando si e' scattata l'ultima
   fotografia: sono i fatti di questo turno, non di tutta la partita. */
function eventsSince(g){
  return g.log.filter(l => l.at > (g.lastCapture || 0)).map(l => l.text).reverse();
}

export function captureTurn({ closing = false } = {}){
  const g = game();
  if (!g.turns.length) g.turns.push(BL.deployRecord(S()));
  g.turns.push(BL.turnRecord(S(), { n: g.turn, army: g.army, events: eventsSince(g) }));
  logLine("Fine del turno " + g.turn + (closing ? " — partita chiusa." : " registrata."));
  g.lastCapture = Date.now();
}

/* "Chiudi turno" e' il gesto vero al tavolo: si registra com'e' finita
   e si passa la mano, senza dover cliccare le quattro fasi. */
export function closeTurn(){
  const g = game();
  captureTurn();
  g.phase = 0;
  if (g.army === "A") g.army = "B";
  else { g.army = "A"; g.turn++; }
}

/* Lo schieramento si aggiusta ancora un momento dopo aver premuto
   "Comincia": finche' non e' stato registrato un turno la fotografia
   iniziale si puo' rifare. */
export function recaptureDeploy(){
  const g = game();
  g.turns = [BL.deployRecord(S())];
  g.lastCapture = Date.now();
  logLine("Schieramento fotografato di nuovo.");
}

export const turnsPlayed = () => game().turns.filter(t => t.kind === "turn").length;

/* La partita in corso vista come un battle report: serve al punteggio
   automatico e all'anteprima, prima ancora che venga archiviata. */
export function reportView(){
  const s = S();
  const g = game();
  return {
    meta: g.meta, score: g.score, turns: g.turns,
    armies: { A:{ name:s.armies.A.name }, B:{ name:s.armies.B.name } },
    roster: {
      A: s.units.filter(u => u.army === "A"),
      B: s.units.filter(u => u.army === "B"),
    },
  };
}

/* avanti di una fase; finite le quattro, passa la mano; tornato ad A,
   il turno cresce di uno */
export function advance(dir = 1){
  const g = game();
  let n = g.phase + dir;
  if (n >= PHASES.length){
    n = 0;
    if (g.army === "A") g.army = "B";
    else { g.army = "A"; g.turn++; }
  } else if (n < 0){
    n = PHASES.length - 1;
    if (g.army === "B") g.army = "A";
    else { g.army = "B"; g.turn = Math.max(1, g.turn - 1); }
  }
  g.phase = n;
  if (dir > 0 && n === 0) logLine("Turno " + g.turn + " — tocca all'esercito " + g.army + ".", { army: g.army });
}

/* ------------------------------------------------------------------
   Perdite
   ------------------------------------------------------------------ */
export function setLost(u, n){
  const before = u.lost || 0;
  const next = Math.max(0, Math.min(u.models, Math.round(n)));
  if (next === before) return;
  u.lost = next;
  /* Quali modelli siano caduti conta: in ordine chiuso cadono gli
     ultimi ranghi, in formazione sciolta quelli che il giocatore ha
     segnato nell'editor. Qui la lista si riallinea al numero. */
  FM.syncFallen(u, u.lost);
  if (u.lost >= u.models){ u.dead = true; u.placed = false; }
  else if (u.dead) u.dead = false;
  const d = u.lost - before;
  logLine(d > 0
    ? u.name + ": " + d + (d === 1 ? " perdita" : " perdite") + " (restano " + alive(u) + ")."
    : u.name + ": " + (-d) + (-d === 1 ? " modello rimesso" : " modelli rimessi") + " in piedi.",
    { army: u.army });
  if (u.dead) logLine(u.name + " annientata.", { army: u.army });
}

export function destroy(u){
  u.lost = u.models; u.dead = true; u.placed = false;
  FM.syncFallen(u, u.lost);
  logLine(u.name + " distrutta.", { army: u.army });
}

export function revive(u){
  u.dead = false; u.lost = 0; u.fled = false;
  u.fallen = [];
  logLine(u.name + " rimessa in gioco.", { army: u.army });
}

export function flee(u){
  u.fled = !u.fled;
  logLine(u.fled ? u.name + " in rotta." : u.name + " si e' riorganizzata.", { army: u.army });
}

/* ------------------------------------------------------------------
   Tabellino: quanto e' costato finora a ciascuno
   ------------------------------------------------------------------ */
export function score(){
  const out = { A:{ lostPts:0, lostModels:0, dead:0, alivePts:0 },
                B:{ lostPts:0, lostModels:0, dead:0, alivePts:0 } };
  for (const u of S().units){
    const row = out[u.army];
    if (!row) continue;
    const share = u.models ? (u.pts || 0) / u.models : 0;
    const lost = u.lost || 0;
    row.lostModels += lost;
    row.lostPts += Math.round(share * lost);
    row.alivePts += Math.round((u.pts || 0) - share * lost);
    if (u.dead) row.dead++;
  }
  return out;
}

/* ------------------------------------------------------------------
   Lo schermino
   Il pannello dice a parole quello che sul tavolo si vede a colpo
   d'occhio, e quando si racconta una partita («a quel punto gli sono
   arrivato sul fianco») quel colpo d'occhio serve. Qui c'e' il tavolo
   in piccolo, com'era alla fine di ogni turno: si scorre indietro coi
   due tasti e si confronta con adesso.
   ------------------------------------------------------------------ */

/* quale fotografia si sta guardando: null = il tavolo adesso */
let shotAt = null;

const shotRep = () => {
  const s = S();
  return {
    table: { w: Math.round(inch(s.tableW) * 10) / 10, h: Math.round(inch(s.tableH) * 10) / 10 },
    terrain: [],
    armies: { A:{ name:s.armies.A.name }, B:{ name:s.armies.B.name } },
  };
};

/* la fotografia di adesso non e' registrata: si scatta al volo, cosi'
   lo schermino segue il tavolo mentre si muove */
const liveTurn = () => {
  const g = game();
  return BL.turnRecord(S(), { n: g.turn, army: g.army });
};

function screenHTML(){
  const g = game();
  const shots = g.turns || [];
  const total = shots.length;                       // 0 = schieramento incluso
  const idx = shotAt == null ? total : Math.max(0, Math.min(shotAt, total - 1));
  const live = shotAt == null;
  const turn = live ? liveTurn() : shots[idx];
  if (!turn) return "";
  const rep = shotRep();
  const shot = shotFromTurn(rep, turn);
  const title = live ? `Adesso · turno ${g.turn} di ${g.army}`
    : (turn.kind === "deploy" ? "Schieramento"
       : `Turno ${turn.n} · giocato da ${turn.army}`);
  return `
    <div class="tvbox">
      <div class="tvhead">
        <button class="btn tiny icon" id="g-shot-prev" ${idx <= 0 && !live ? "disabled" : ""} title="Fotografia precedente">‹</button>
        <span class="mono">${title}</span>
        <button class="btn tiny icon" id="g-shot-next" ${live ? "disabled" : ""} title="Fotografia successiva">›</button>
      </div>
      <div class="tvscreen">${shotSVG(shot, { height: 168 })}</div>
      <div class="tvcap mono">${shotCaption(shot, turn) || "&nbsp;"}</div>
    </div>`;
}

function wireScreen(host){
  const g = game();
  const total = (g.turns || []).length;
  const prev = host.querySelector("#g-shot-prev");
  const next = host.querySelector("#g-shot-next");
  if (prev) prev.addEventListener("click", () => {
    shotAt = shotAt == null ? total - 1 : Math.max(0, shotAt - 1);
    renderGamePanel(host, { esc: hostEsc });
  });
  if (next) next.addEventListener("click", () => {
    if (shotAt == null) return;
    shotAt = shotAt + 1 >= total ? null : shotAt + 1;
    renderGamePanel(host, { esc: hostEsc });
  });
}
let hostEsc = s => String(s);

/* ------------------------------------------------------------------
   Perdite di tutte le unita' in un posto solo
   Segnare una perdita voleva dire selezionare l'unita' sul tavolo e
   scendere nell'ispettore: dieci gesti per un tiro di archi. Qui ci
   sono tutte, e il tasto in fondo apre la formazione per dire QUALI
   modelli sono caduti.
   ------------------------------------------------------------------ */
function lossesHTML(esc){
  const s = S();
  const rows = id => s.units
    .filter(u => u.army === id && !FM.joinedHost(u))
    .map(u => {
      const n = alive(u);
      return `<div class="lossrow${u.dead ? " dead" : ""}" data-loss="${u.uid}">
        <span class="nm mono">${esc(shortish(u.name))}</span>
        <b class="mono${n * 2 <= u.models ? " low" : ""}">${n}/${u.models}</b>
        <button class="btn tiny" data-lm="${u.uid}" title="Un modello in meno">−</button>
        <button class="btn tiny" data-lp="${u.uid}" title="Un modello in più">+</button>
        <button class="btn tiny ghost" data-lpick="${u.uid}" title="Scegli quali modelli sono caduti">⁝</button>
      </div>`;
    }).join("");
  return `
    <details class="lossbox">
      <summary class="panel-title">Perdite</summary>
      <p class="note">I tasti tolgono e rimettono un modello. Il terzo apre la formazione: lì si sceglie <b>quale</b> modello è caduto, e l'unità si accorcia di conseguenza.</p>
      ${["A", "B"].map(id => `
        <div class="readout" style="margin-top:6px"><span><span class="swatch" style="background:var(--army${id})"></span>${esc(S().armies[id].name || "Esercito " + id)}</span></div>
        ${rows(id) || `<p class="empty">Nessuna unità.</p>`}`).join("")}
    </details>`;
}
const shortish = n => { const s = String(n).replace(/\(.*?\)/g, "").trim(); return s.length > 20 ? s.slice(0, 19) + "…" : s; };

function wireLosses(host){
  const find = id => S().units.find(u => u.uid === +id);
  host.querySelectorAll("[data-lm]").forEach(b => b.addEventListener("click", () => {
    const u = find(b.dataset.lm);
    if (u) ctx.act("perdite", () => setLost(u, (u.lost || 0) + 1));
  }));
  host.querySelectorAll("[data-lp]").forEach(b => b.addEventListener("click", () => {
    const u = find(b.dataset.lp);
    if (u) ctx.act("perdite", () => setLost(u, (u.lost || 0) - 1));
  }));
  host.querySelectorAll("[data-lpick]").forEach(b => b.addEventListener("click", () => {
    const u = find(b.dataset.lpick);
    if (u) openEditor(u.uid);
  }));
}

/* ------------------------------------------------------------------
   Pannello
   ------------------------------------------------------------------ */
export function renderGamePanel(host, { esc }){
  if (!host) return;
  hostEsc = esc;
  const g = game();
  const played = turnsPlayed();

  if (!g.on){
    /* Partita chiusa ma registrata: il pannello non torna vuoto, resta
       la porta per archiviare il report o riaprirlo. */
    host.innerHTML =
      '<p class="note">Tiene il conto di turni, fasi e perdite mentre giochi, e a ogni fine turno ' +
      'fotografa il tavolo: posizioni, movimento e perdite di ogni unità. Da quelle fotografie ' +
      'esce il battle report da leggere (o da far leggere) dopo.</p>' +
      '<button class="btn primary" id="g-start">Comincia la partita</button>' +
      (played ? `
        <div class="readout" style="margin-top:8px"><span>Ultima partita</span><b>${played} turni registrati</b></div>
        <div class="grid2" style="margin-top:6px">
          <button class="btn tiny primary" id="g-archive">Archivia il report</button>
          <button class="btn tiny" id="g-open">Apri le partite</button>
        </div>
        <p class="note">Ricominciare una partita cancella queste fotografie: archivia prima.</p>` : "");
    host.querySelector("#g-start").addEventListener("click", () => {
      if (played && !confirm("La partita registrata non è archiviata: ricominciando si perde. Procedo?")) return;
      ctx.act("inizio partita", start);
    });
    const arc = host.querySelector("#g-archive");
    if (arc) arc.addEventListener("click", () => emit("report:archive"));
    const opn = host.querySelector("#g-open");
    if (opn) opn.addEventListener("click", () => emit("tab:show", "report"));
    return;
  }

  const sc = score();
  const names = { A: S().armies.A.name || "Esercito A", B: S().armies.B.name || "Esercito B" };
  host.innerHTML = `
    <div class="turnbar">
      <button class="btn tiny" id="g-back" title="Fase precedente">‹</button>
      <div class="turnbar-mid">
        <b>Turno ${g.turn}</b>
        <span class="swatch" style="background:var(--army${g.army})"></span>
        <span class="tname">${esc(names[g.army])}</span>
      </div>
      <button class="btn tiny primary" id="g-next" title="Fase successiva">›</button>
    </div>
    <div class="phases">
      ${PHASES.map((p, i) => `<button class="btn tiny${i === g.phase ? " on" : ""}" data-phase="${i}">${p.label}</button>`).join("")}
    </div>
    ${screenHTML()}
    <div class="readout"><span><span class="swatch" style="background:var(--armyA)"></span>${esc(names.A)}</span>
      <b>${sc.A.alivePts} pt in campo · −${sc.A.lostPts}</b></div>
    <div class="readout"><span><span class="swatch" style="background:var(--armyB)"></span>${esc(names.B)}</span>
      <b>${sc.B.alivePts} pt in campo · −${sc.B.lostPts}</b></div>
    <button class="btn primary" id="g-close" style="width:100%;margin-top:8px"
      title="Fotografa il tavolo com'è adesso e passa la mano">Chiudi il turno di ${esc(names[g.army])}</button>
    <div class="readout"><span>Registrate</span><b>${played ? played + (played === 1 ? " fotografia" : " fotografie") : "solo lo schieramento"}</b></div>
    <div class="grid2" style="margin-top:6px">
      <button class="btn tiny" id="g-note">Annota…</button>
      <button class="btn tiny" id="g-${played ? "open" : "redeploy"}">${played ? "Apri le partite" : "Rifai la foto"}</button>
    </div>
    <div class="grid2" style="margin-top:6px">
      <button class="btn tiny" id="g-archive">Archivia il report</button>
      <button class="btn tiny ghost" id="g-stop" style="color:var(--bad)">Chiudi partita</button>
    </div>
    ${lossesHTML(esc)}
    <div class="gamelog">
      ${g.log.length ? g.log.slice(0, 40).map(l => `
        <div class="logline"><span class="lt mono">T${l.t}</span>
          <span class="swatch" style="background:var(--army${l.army})"></span>
          <span>${esc(l.text)}</span></div>`).join("")
        : `<p class="empty">Nessuna annotazione.</p>`}
    </div>`;

  wireScreen(host);
  wireLosses(host);
  host.querySelector("#g-next").addEventListener("click", () => ctx.act("fase", () => advance(1)));
  host.querySelector("#g-back").addEventListener("click", () => ctx.act("fase", () => advance(-1)));
  host.querySelectorAll("[data-phase]").forEach(b => b.addEventListener("click", () =>
    ctx.act("fase", () => { game().phase = +b.dataset.phase; })));
  host.querySelector("#g-note").addEventListener("click", () => {
    const t = prompt("Cosa è successo?", "");
    if (t && t.trim()) ctx.act("annotazione", () => logLine(t.trim()));
  });
  host.querySelector("#g-close").addEventListener("click", () => ctx.act("fine turno", closeTurn));
  const redo = host.querySelector("#g-redeploy");
  if (redo) redo.addEventListener("click", () => ctx.act("foto schieramento", recaptureDeploy));
  const opn = host.querySelector("#g-open");
  if (opn) opn.addEventListener("click", () => emit("tab:show", "report"));
  host.querySelector("#g-archive").addEventListener("click", () => emit("report:archive"));
  host.querySelector("#g-stop").addEventListener("click", () => {
    if (confirm("Chiudo la partita? L'ultimo turno viene fotografato e il punteggio ricalcolato."))
      ctx.act("fine partita", stop);
  });
}
