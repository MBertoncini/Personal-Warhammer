/* Schieramento Old World — il pannello dello scontro
 *
 * Due unita', i dadi, e il conto di fine assalto. Il modulo non sa
 * niente del tavolo: riceve le due unita' e una manciata di callback,
 * e restituisce — se glielo si chiede — le perdite da segnare.
 *
 * I dadi si vedono tutti. Un simulatore che scrive "4 ferite" chiede
 * di essere creduto sulla parola; uno che mostra le facce lo si
 * controlla a occhio, e quando dice una cosa strana si capisce subito
 * se e' stata sfortuna o un numero sbagliato nel profilo.
 */

import { esc } from './util.js';
import * as C from './combat.js';
import { IMPOSSIBLE, AUTOHIT } from './rules.js';
import { showDiceGroups } from './dicebox.js';

let host = null, ctx = null, cur = null;

export function initDuel(el, context){ host = el; ctx = context; }
export const duelOpen = () => !!cur;

/* Le opzioni partono dal profilo e restano modificabili: il file della
   lista non dice chi ha caricato, chi porta lo stendardo, e quasi mai
   che armatura indossa. Quelle tre righe le sa solo chi guarda il tavolo. */
function sideOpts(u, foe){
  const c = C.combatant(u), f = C.combatant(foe);
  return {
    attacks: C.contact(c, f).attacks,
    armour: u.armour || 0, ward: u.ward || 0, regen: u.regen || 0,
    /* lo stendardo adesso arriva dal file quando c'e': era una casella
       da spuntare a mano ogni volta, e il dato stava li' dall'inizio */
    standard: c.standard, charged: false, flank: "",
  };
}

/* Il pannello tiene gli uid, non i due oggetti: un Annulla rifa' le
   unita' da zero e i riferimenti diretti resterebbero appesi a una
   copia vecchia, che e' il modo silenzioso di mostrare numeri finti. */
export function openDuel(a, b){
  cur = { uidA: a.uid, uidB: b.uid, A: sideOpts(a, b), B: sideOpts(b, a), roll: null, odds: null };
  render();
}
export function closeDuel(){ cur = null; render(); }

/* dall'unita' + opzioni alla schiera che combatte */
function sideOf(u, o){
  return C.combatant(u, {
    armour: o.armour, ward: o.ward, regen: o.regen, forcedAttacks: o.attacks,
    standard: o.standard, charged: o.charged, flank: o.flank,
  });
}
const units = () => [ctx.unit(cur.uidA), ctx.unit(cur.uidB)];
function bothSides(){
  const [a, b] = units();
  return [sideOf(a, cur.A), sideOf(b, cur.B)];
}

/* ============================================================
   DISEGNO
   ============================================================ */
const SAVE_OPTS = [[0, "—"], [2, "2+"], [3, "3+"], [4, "4+"], [5, "5+"], [6, "6+"]];
/* "sempre" e' il punteggio di chi non deve tirare: chi ha davanti
   un'Abilita' Combattimento 0 colpisce e basta (p. 98). */
const need = n => n >= IMPOSSIBLE ? "mai" : n <= AUTOHIT ? "sempre" : n + "+";
/* "1 ferite" si legge male: il pannello lo si guarda cento volte per
   partita ed e' il genere di sciatteria che si nota tutte e cento. */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const MAX_DICE = 36;
function diceHTML(dice, target){
  if (!dice.length) return `<span class="nodice">—</span>`;
  const shown = dice.slice(0, MAX_DICE);
  return `<span class="dice">` +
    shown.map(v => `<i class="die${target && v >= target && v > 1 ? " win" : ""}">${v}</i>`).join("") +
    (dice.length > shown.length ? `<i class="die more">+${dice.length - shown.length}</i>` : "") +
    `</span>`;
}

/* ------------------------------------------------------------------
   Gli stessi dadi, ma nel vassoio in tre dimensioni.
   L'assalto tira decine di dadi in cinque o sei mucchi (colpire,
   ferire, armatura, salvezza, rigenerazione) e poi il test di rotta.
   Qui quei mucchi diventano le righe del vassoio: sono gli stessi
   numeri del conto — nessuno viene ritirato — e si vedono cadere prima
   di leggere il risultato, che e' l'unico momento in cui guardare i
   dadi conta qualcosa.
   ------------------------------------------------------------------ */
const asDice = (pool, need) => (pool.dice || []).map(v =>
  ({ raw: v, value: v, win: !!(need && v >= need && v > 1) }));

function roundGroups(r, names){
  const out = [];
  const add = (label, p) => {
    /* i tiri impossibili (armatura che non c'e', salvezza che non
       esiste) nel pannello non compaiono: nemmeno qui, o il vassoio si
       riempirebbe di dadi che non possono fare niente */
    if (!p || !(p.dice || []).length || p.need >= IMPOSSIBLE) return;
    out.push({ kind:"d6", label, dice: asDice(p, p.need),
               tail: `${p.hits} su ${p.of}` });
  };
  for (const s of r.steps){
    const who = names[s.side];
    add(`${who} · colpisce ${need(s.hit.need)}`, s.hit);
    add(`${who} · ferisce ${need(s.wound.need)}`, s.wound);
    add(`${who} · armatura ${need(s.save.need)}`, s.save);
    add(`${who} · speciale ${need(s.ward.need)}`, s.ward);
    add(`${who} · rigenera ${need(s.regen.need)}`, s.regen);
  }
  if (r.test && (r.test.dice || []).length)
    out.push({ kind:"d6", label:`${names[r.cr.loser]} · test di rotta`,
               dice: asDice(r.test, 0),
               tail: `${r.test.total} contro ${r.test.target}` });
  return out;
}

/* I due lati si colorano con il colore del loro esercito sul tavolo,
   non con la casella che occupano qui: vedere l'Orc Mob rosso nel
   pannello e blu sul campo è il modo di guardare la riga sbagliata. */
function stepHTML(s, names, tint){
  const col = tint[s.side];
  const line = (what, roll, tail) => `
    <div class="dl">
      <span class="dl-k">${what}</span>
      ${diceHTML(roll.dice, roll.need)}
      <b>${tail}</b>
    </div>`;
  return `
    <div class="duel-step">
      <div class="dl-head"><span class="swatch" style="background:${col}"></span>
        <b>${esc(names[s.side])}</b><span>${s.label}</span>
        <span class="mono">${s.attacks} × F${s.strength}${s.ap ? ` PA${s.ap}` : ""}</span></div>
      ${s.hit.dice.length
        ? line(`colpisce ${need(s.hit.need)}`, s.hit, plural(s.hit.hits, "colpo", "colpi"))
        : `<div class="dl"><span class="dl-k">colpi automatici</span><span class="nodice">—</span><b>${s.hit.hits}</b></div>`}
      ${line(`ferisce ${need(s.wound.need)}`, s.wound, plural(s.wound.hits, "ferita", "ferite"))}
      ${s.save.of && s.save.need < IMPOSSIBLE ? line(`armatura ${need(s.save.need)}`, s.save, plural(s.save.hits, "parata", "parate")) : ""}
      ${s.ward.of && s.ward.need < IMPOSSIBLE ? line(`speciale ${need(s.ward.need)}`, s.ward, plural(s.ward.hits, "parata", "parate")) : ""}
      ${s.regen && s.regen.of && s.regen.need < IMPOSSIBLE ? line(`rigenera ${need(s.regen.need)}`, s.regen, plural(s.regen.hits, "ferita rimarginata", "ferite rimarginate")) : ""}
      ${(s.notes || []).length ? `<p class="note">${s.notes.map(esc).join(" · ")}</p>` : ""}
      <div class="dl total"><span class="dl-k">passano</span><span></span>
        <b>${plural(s.wounds, "ferita", "ferite")} · ${plural(s.kills, "modello a terra", "modelli a terra")}</b></div>
    </div>`;
}

function testHTML(r, names){
  const t = r.test, side = r.cr.loser;
  const ld = side === "A" ? r.a.ld : r.b.ld;
  if (t.unbreakable)
    return `<p class="note"><b>${esc(names[side])}</b> perde di ${r.cr.diff}, ma è
      <b>Unbreakable</b>: non tira nemmeno.</p>`;
  const colour = t.passed ? "ok" : "bad";
  const verdict = t.passed ? (t.insane ? "tiene i nervi, doppio uno" : "tiene i nervi") : "va in rotta";
  /* Il testardo tira al Comando pieno: scrivere lo scarto e poi non
     sottrarlo sembrerebbe un errore di conto, quindi la riga cambia. */
  const conto = t.stubborn
    ? `<b>Stubborn</b>: Comando ${ld} pieno, senza lo scarto di ${r.cr.diff}`
    : `Comando ${ld} − ${r.cr.diff} = ${t.target}`;
  return `<p class="note"><b>${esc(names[side])}</b> perde di ${r.cr.diff}:
    ${conto}, 2D6 = ${t.dice.join(" + ")} = <b>${t.total}</b> →
    <b style="color:var(--${colour})">${verdict}</b>.</p>`;
}

/* Chi mena per primo. Non e' sempre l'Iniziativa: un'arma che colpisce
   per ultima scavalca il profilo, e vale la pena dirlo perche' e' la
   ragione per cui a volte il piu' svelto dei due parte dopo. */
function orderLine(a, b, names){
  const rank = c => c.flags.strikeFirst ? 2 : c.flags.strikeLast ? 0 : 1;
  const ra = rank(a), rb = rank(b);
  if (ra !== rb){
    const why = [];
    if (a.flags.strikeFirst) why.push(`${esc(names.A)} colpisce per primo`);
    if (b.flags.strikeFirst) why.push(`${esc(names.B)} colpisce per primo`);
    if (a.flags.strikeLast)  why.push(`${esc(names.A)} colpisce per ultimo`);
    if (b.flags.strikeLast)  why.push(`${esc(names.B)} colpisce per ultimo`);
    return `${esc(names[ra > rb ? "A" : "B"])} mena per primo: ${why.join(", ")}, e l'arma scavalca l'Iniziativa.`;
  }
  if (a.i === b.i) return "Stessa Iniziativa: si menano insieme.";
  return `${esc(names[a.i > b.i ? "A" : "B"])} mena per primo (I ${Math.max(a.i, b.i)} contro ${Math.min(a.i, b.i)}).`;
}

/* ------------------------------------------------------------------
   Le regole lette dalla lista, e quali sono entrate nel conto.
   E' la riga che dice quanto vale il risultato: un assalto che applica
   tre regole su sette e lo dice si sa come leggerlo, uno che ne applica
   tre in silenzio sembra completo e non lo e'.
   ------------------------------------------------------------------ */
function rulesHTML(a, b, names, tint){
  const block = (c, tag) => {
    const r = c.rulesRead;
    if (!r || (!r.applied.length && !r.elsewhere.length && !r.unknown.length)) return "";
    const tag2 = (t, cls, title) => `<span class="tag ${cls}" title="${esc(title)}">${esc(t)}</span>`;
    return `
      <div class="readout"><span><span class="swatch" style="background:${tint[tag]}"></span>${esc(names[tag])}</span>
        <b class="mono dim">${r.applied.length} su ${r.applied.length + r.elsewhere.length + r.unknown.length}</b></div>
      <div class="tags">
        ${r.applied.map(x => tag2(x.name + (x.caveat ? " *" : ""), "rule-on", x.what + (x.caveat ? " — " + x.caveat : ""))).join("")}
        ${r.elsewhere.map(x => tag2(x.name, "rule-off", "non entra in questo conto: " + x.why)).join("")}
        ${r.unknown.map(x => tag2(x.name + " ?", "rule-unk", "l'app non conosce questa regola: applicatela voi")).join("")}
      </div>`;
  };
  const body = block(a, "A") + block(b, "B");
  if (!body) return "";
  return `
    <details class="duel-rules">
      <summary class="panel-title">Regole lette dalla lista</summary>
      <p class="note">In pieno quelle che hanno spostato un dado, in grigio quelle che si giocano
      altrove, con il punto interrogativo quelle che l'app non conosce. Passa sopra un'etichetta
      per sapere perché.</p>
      ${body}
    </details>`;
}

function crHTML(r, names, tint){
  const row = (tag, s) => {
    const bits = [[s.wounds, s.wounds === 1 ? "ferita" : "ferite"],
                  [s.rank, s.rank === 1 ? "rango" : "ranghi"],
                  [s.std, "stendardo"], [s.out, "in più"], [s.flank, "fianco"]]
                 .filter(([v]) => v > 0);
    return `<div class="readout"><span><span class="swatch" style="background:${tint[tag]}"></span>${esc(names[tag])}</span>
      <b>${s.total}${bits.length ? ` <span class="mono dim">= ${bits.map(([v, k]) => `${v} ${k}`).join(" + ")}</span>` : ""}</b></div>`;
  };
  return `
    <div class="duel-cr">
      <div class="panel-title">Risoluzione</div>
      ${row("A", r.cr.A)}${row("B", r.cr.B)}
      ${r.wiped
        ? `<p class="note"><b>${esc(names[r.wiped])}</b> non ha più nessuno in piedi: il combattimento finisce qui.</p>`
        : r.test ? testHTML(r, names)
        : `<p class="note">Pareggio: nessuno dei due deve tirare per i nervi.</p>`}
    </div>`;
}

function oddsHTML(o, names, tint){
  const pc = n => (100 * n / o.n).toFixed(0) + "%";
  const bar = (a, d, b) => `
    <div class="oddsbar">
      <span style="width:${100*a/o.n}%;background:${tint.A}"></span>
      <span style="width:${100*d/o.n}%;background:var(--line-strong)"></span>
      <span style="width:${100*b/o.n}%;background:${tint.B}"></span>
    </div>`;
  return `
    <div class="duel-cr">
      <div class="panel-title">${o.n} assalti simulati</div>
      ${bar(o.winA, o.draw, o.winB)}
      <div class="readout"><span><span class="swatch" style="background:${tint.A}"></span>${esc(names.A)} vince</span><b>${pc(o.winA)}</b></div>
      <div class="readout"><span>pareggio</span><b>${pc(o.draw)}</b></div>
      <div class="readout"><span><span class="swatch" style="background:${tint.B}"></span>${esc(names.B)} vince</span><b>${pc(o.winB)}</b></div>
      <div class="readout"><span>modelli a terra, in media</span><b>${o.killsB.toFixed(1)} / ${o.killsA.toFixed(1)}</b></div>
      <div class="readout"><span>va in rotta</span><b>${pc(o.breakA)} / ${pc(o.breakB)}</b></div>
      <p class="note">Le due colonne sono nell'ordine ${esc(names.A)} / ${esc(names.B)}. “Va in rotta” conta gli assalti in cui quella parte ha perso <i>e</i> ha fallito il test di Comando.</p>
    </div>`;
}

function controls(tag, u){
  const o = cur[tag];
  const c = C.combatant(u);
  return `
    <div class="duel-side">
      <div class="army-head"><span class="swatch" style="background:var(--army${u.army})"></span>
        <b>${esc(u.name)}</b></div>
      <div class="mono dim">${["WS","S","T","W","I","A","Ld"].map(k => k + " " + (c[k.toLowerCase()] || "–")).join(" · ")}</div>
      <div class="mono dim">${c.models} in piedi · ${c.frontage} di fronte${c.weapon ? " · " + esc(c.weapon) : ""}</div>
      <div class="grid2">
        <label class="field">Attacchi<input type="number" min="0" max="400" id="d-att-${tag}" value="${o.attacks}"></label>
        <label class="field">Armatura<select id="d-arm-${tag}">${SAVE_OPTS.map(([v, l]) => `<option value="${v}"${v === o.armour ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="field">Speciale<select id="d-wrd-${tag}">${SAVE_OPTS.map(([v, l]) => `<option value="${v}"${v === o.ward ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="field">Rigenera<select id="d-rgn-${tag}">${SAVE_OPTS.map(([v, l]) => `<option value="${v}"${v === o.regen ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <div class="duel-flags">
        <label><input type="checkbox" id="d-std-${tag}"${o.standard ? " checked" : ""}> stendardo</label>
        <label><input type="checkbox" id="d-chg-${tag}"${o.charged ? " checked" : ""}> ha caricato</label>
        <label class="field inline">colpisce di
          <select id="d-flk-${tag}">
            <option value=""${o.flank === "" ? " selected" : ""}>fronte</option>
            <option value="flank"${o.flank === "flank" ? " selected" : ""}>fianco</option>
            <option value="rear"${o.flank === "rear" ? " selected" : ""}>retro</option>
          </select></label>
      </div>
    </div>`;
}

function render(){
  if (!host) return;
  const pair = cur ? units() : null;
  /* un Annulla o una rimozione possono aver portato via una delle due:
     il pannello si chiude invece di mostrare un'unita' che non c'e' piu' */
  if (!cur || !pair[0] || !pair[1]){
    cur = null; host.hidden = true; host.innerHTML = ""; return;
  }
  host.hidden = false;

  const [uA, uB] = pair;
  const [a, b] = bothSides();
  const names = { A: uA.name, B: uB.name };
  const tint  = { A: `var(--army${uA.army})`, B: `var(--army${uB.army})` };
  const fa = C.meleeForecast(a, b), fb = C.meleeForecast(b, a);

  host.innerHTML = `
    <div class="duel-card">
      <div class="duel-head">
        <b>Scontro simulato</b>
        <span class="spacer"></span>
        <button class="btn tiny" id="d-swap" title="Scambia attaccante e difensore">⇄</button>
        <button class="btn tiny ghost" id="d-close">Chiudi</button>
      </div>

      <div class="duel-sides">${controls("A", uA)}${controls("B", uB)}</div>

      <div class="duel-forecast">
        <div class="readout"><span>Senza tirare, in media</span>
          <b>${fa.wounds.toFixed(1)} ferite ↔ ${fb.wounds.toFixed(1)}</b></div>
        <p class="note">
          ${esc(names.A)} colpisce ${need(fa.hitNeed)}, ferisce ${need(fa.woundNeed)}${fa.saveNeed < IMPOSSIBLE ? `, armatura ${need(fa.saveNeed)}` : ""}.
          ${esc(names.B)} colpisce ${need(fb.hitNeed)}, ferisce ${need(fb.woundNeed)}${fb.saveNeed < IMPOSSIBLE ? `, armatura ${need(fb.saveNeed)}` : ""}.
          ${orderLine(a, b, names)}
        </p>
      </div>

      <div class="grid2">
        <button class="btn primary" id="d-roll">Tira i dadi</button>
        <button class="btn" id="d-odds">Simula 500 assalti</button>
      </div>

      ${cur.roll ? cur.roll.steps.map(s => stepHTML(s, names, tint)).join("") + crHTML(cur.roll, names, tint) : ""}
      ${cur.roll && (cur.roll.killsA || cur.roll.killsB)
        ? `<button class="btn" id="d-apply">Segna le perdite sul tavolo (−${cur.roll.killsA} / −${cur.roll.killsB})</button>` : ""}
      ${cur.odds ? oddsHTML(cur.odds, names, tint) : ""}

      ${rulesHTML(a, b, names, tint)}

      <p class="note">Stima, non arbitro: legge i profili della lista, le regole che riconosce e i
      numeri che imposti qui. Quello che non ha applicato sta scritto qui sopra. Al tavolo decidete voi.</p>
    </div>`;

  /* ---- fili ---- */
  const q = s => host.querySelector(s);
  q("#d-close").addEventListener("click", closeDuel);
  q("#d-swap").addEventListener("click", () => openDuel(uB, uA));

  for (const [tag, u] of [["A", uA], ["B", uB]]){
    const o = cur[tag];
    const set = (sel, fn) => {
      const el = q(sel);
      if (el) el.addEventListener("change", e => { fn(e.target); cur.roll = null; cur.odds = null; render(); });
    };
    set(`#d-att-${tag}`, el => { o.attacks = Math.max(0, +el.value || 0); });
    set(`#d-arm-${tag}`, el => { o.armour = +el.value || 0; ctx.setSave(u, "armour", o.armour); });
    set(`#d-wrd-${tag}`, el => { o.ward   = +el.value || 0; ctx.setSave(u, "ward", o.ward); });
    set(`#d-rgn-${tag}`, el => { o.regen  = +el.value || 0; ctx.setSave(u, "regen", o.regen); });
    set(`#d-std-${tag}`, el => { o.standard = el.checked; });
    set(`#d-chg-${tag}`, el => { o.charged  = el.checked; });
    set(`#d-flk-${tag}`, el => { o.flank    = el.value; });
  }

  q("#d-roll").addEventListener("click", async () => {
    const [x, y] = bothSides();
    const r = C.meleeRound(x, y);
    cur.roll = r; cur.odds = null;
    /* prima si vedono cadere, poi si legge il conto: al contrario il
       risultato sarebbe gia' li' e i dadi diventerebbero un fregio */
    await showDiceGroups(roundGroups(r, names), {
      title: "Assalto", foot: "Gli stessi dadi del conto qui sotto: nessuno viene ritirato.",
    });
    render();
  });
  q("#d-odds").addEventListener("click", () => {
    const [x, y] = bothSides();
    cur.odds = C.odds(x, y, 500); render();
  });
  const ap = q("#d-apply");
  if (ap) ap.addEventListener("click", () =>
    ctx.applyLosses([[uA, cur.roll.killsA], [uB, cur.roll.killsB]]));
}

export { render as renderDuel };
