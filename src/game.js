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
 */

const PHASES = [
  { id:"strategy", label:"Strategia" },
  { id:"movement", label:"Movimento" },
  { id:"shooting", label:"Tiro" },
  { id:"combat",   label:"Corpo a corpo" },
];

export const emptyGame = () => ({ on:false, turn:1, army:"A", phase:0, log:[] });

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
  for (const u of S().units){ u.lost = 0; u.dead = false; u.fled = false; }
  logLine("Inizio della partita.");
}

export function stop(){
  game().on = false;
  logLine("Partita chiusa.");
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
  logLine(u.name + " distrutta.", { army: u.army });
}

export function revive(u){
  u.dead = false; u.lost = 0; u.fled = false;
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
   Pannello
   ------------------------------------------------------------------ */
export function renderGamePanel(host, { esc }){
  if (!host) return;
  const g = game();
  if (!g.on){
    host.innerHTML = '<p class="note">Tiene il conto di turni, fasi e perdite mentre giochi. ' +
      'Le unità si accorciano man mano che togli i modelli, come al tavolo.</p>' +
      '<button class="btn primary" id="g-start">Comincia la partita</button>';
    host.querySelector("#g-start").addEventListener("click", () => ctx.act("inizio partita", start));
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
    <div class="readout"><span><span class="swatch" style="background:var(--armyA)"></span>${esc(names.A)}</span>
      <b>${sc.A.alivePts} pt in campo · −${sc.A.lostPts}</b></div>
    <div class="readout"><span><span class="swatch" style="background:var(--armyB)"></span>${esc(names.B)}</span>
      <b>${sc.B.alivePts} pt in campo · −${sc.B.lostPts}</b></div>
    <div class="grid2" style="margin-top:6px">
      <button class="btn tiny" id="g-note">Annota…</button>
      <button class="btn tiny ghost" id="g-stop" style="color:var(--bad)">Chiudi partita</button>
    </div>
    <div class="gamelog">
      ${g.log.length ? g.log.slice(0, 40).map(l => `
        <div class="logline"><span class="lt mono">T${l.t}</span>
          <span class="swatch" style="background:var(--army${l.army})"></span>
          <span>${esc(l.text)}</span></div>`).join("")
        : `<p class="empty">Nessuna annotazione.</p>`}
    </div>`;

  host.querySelector("#g-next").addEventListener("click", () => ctx.act("fase", () => advance(1)));
  host.querySelector("#g-back").addEventListener("click", () => ctx.act("fase", () => advance(-1)));
  host.querySelectorAll("[data-phase]").forEach(b => b.addEventListener("click", () =>
    ctx.act("fase", () => { game().phase = +b.dataset.phase; })));
  host.querySelector("#g-note").addEventListener("click", () => {
    const t = prompt("Cosa è successo?", "");
    if (t && t.trim()) ctx.act("annotazione", () => logLine(t.trim()));
  });
  host.querySelector("#g-stop").addEventListener("click", () => {
    if (confirm("Chiudo la partita? Il tabellino resta, le perdite anche."))
      ctx.act("fine partita", stop);
  });
}
