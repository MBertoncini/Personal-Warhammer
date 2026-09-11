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
import * as ML from './melee.js';
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
    standard: c.standard,
    /* e con la Tappa 3 ci arriva anche la carica. Il tavolo sa da che
       faccia e' arrivata e quanti pollici ha percorso: chiederlo di
       nuovo qui era far ripetere a mano una risposta gia' data. */
    charged: c.charged, inches: c.chargeInches, flank: c.flank,
    bsb: !!(c.flags && c.flags.battleStandard),
    ground: "", challenge: false,
  };
}

/* Il pannello tiene gli uid, non i due oggetti: un Annulla rifa' le
   unita' da zero e i riferimenti diretti resterebbero appesi a una
   copia vecchia, che e' il modo silenzioso di mostrare numeri finti. */
export function openDuel(a, b){
  cur = { uidA: a.uid, uidB: b.uid, A: sideOpts(a, b), B: sideOpts(b, a),
          /* il terreno piu' alto e la sfida non sono di una parte sola:
             sono due domande sul combattimento, e si rispondono una
             volta per tutte e due */
          ground: "", challenge: false, roll: null, odds: null };
  render();
}
export function closeDuel(){ cur = null; render(); }

/* dall'unita' + opzioni alla schiera che combatte */
function sideOf(u, o, tag){
  const c = C.combatant(u, {
    armour: o.armour, ward: o.ward, regen: o.regen, forcedAttacks: o.attacks,
    standard: o.standard, charged: o.charged, chargeInches: o.inches,
    flank: o.flank, highGround: ML.highGroundFor(cur.ground, tag),
  });
  /* lo stendardo da battaglia lo legge il registro delle regole, ma
     resta spuntabile: nelle liste il portastendardo e' un personaggio
     unito, e chi guarda il tavolo sa se e' ancora in piedi */
  c.flags = { ...c.flags, battleStandard: !!o.bsb };
  return c;
}
const units = () => [ctx.unit(cur.uidA), ctx.unit(cur.uidB)];
function bothSides(){
  const [a, b] = units();
  return [sideOf(a, cur.A, "A"), sideOf(b, cur.B, "B")];
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

/* a capo dentro un attributo `title`: il tooltip del browser li
   rispetta, ed e' l'unico modo di far stare tre paragrafi di manuale
   dentro un'etichetta larga come una parola */
const NL = String.fromCharCode(10);

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
               tail: `${r.test.natural} contro ${r.test.ld}` +
                     (r.test.diff ? ` (e ${r.test.modified} con lo scarto)` : "") });
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
  const colour = t.outcome === "rout" ? "bad" : t.outcome === "give" ? "ok" : "warn";
  /* Le tre probabilita' stanno accanto all'esito perche' un esito solo
     non dice se e' stato fortunato: «ripiega» con il 44% di ripiegare
     e' la normalita', «cede terreno» con l'8% e' uno scampato
     pericolo. Ed e' il numero con cui si decide se giocarsi lo
     Stubborn, che vale una volta per partita. */
  const ch = t.chances;
  const pc = v => Math.round(v * 100) + "%";
  const odds = ch ? `<span class="mono dim">cede ${pc(ch.give)} · ripiega ${pc(ch.fallBack)} · rotta ${pc(ch.rout)}</span>` : "";
  const stub = !t.stubborn && !t.unbreakable && (side === "A" ? r.a : r.b).flags.stubborn
    ? `<p class="note">Ha <b>Stubborn</b>: una volta per partita può saltare il test e ripiegare in ordine.
       Qui non se n'è servita: cedere terreno era più probabile che andarsene.</p>` : "";
  /* L'esito lo dice gia' la frase che `melee.js` scrive, in fondo dopo
     la freccia: qui si colora quel pezzo invece di ripeterlo, che e'
     come si era fatto la prima volta — «va in rotta → va in rotta». */
  const cut = t.text.lastIndexOf("→ ");
  const head = cut < 0 ? t.text : t.text.slice(0, cut + 2);
  const verb = cut < 0 ? t.label.toLowerCase() : t.text.slice(cut + 2);
  return `<p class="note"><b>${esc(names[side])}</b> perde di ${r.cr.diff} (Comando ${ld}):
    ${esc(head)}<b style="color:var(--${colour})">${esc(verb)}</b>. ${odds}</p>
    ${t.daVerificare ? `<p class="note">La riga della Forza d'Unità più che doppia è dedotta dal testo di
      <b>Stubborn</b>, non letta sulla pagina del test: se il manuale dice altro, si cambia
      <span class="mono">CRUSHING_BLOCKS_FALLBACK</span>.</p>` : ""}${stub}`;
}

/* Chi mena per primo. Non e' sempre l'Iniziativa: chi ha caricato ne
   guadagna un punto per pollice intero percorso (p. 146), e un'arma che
   colpisce per ultima scavalca tutto. Vale la pena dirlo per esteso,
   perche' e' la ragione per cui a volte il piu' svelto dei due parte
   dopo — e perche' il bonus della carica e' la novita' che ribalta
   l'ordine in mezza partita.  */
function orderLine(a, b, names){
  const o = ML.strikeOrder(a, b);
  const bit = (c, s, tag) => {
    const bits = [];
    if (s.bonus) bits.push(`+${s.bonus} di carica`);
    if (s.charge && s.charge.disordered) bits.push("carica disordinata: niente bonus");
    if (s.charge && s.charge.capped) bits.push(`il tetto di ${esc(s.charge.arc)} è +${s.charge.cap}`);
    return bits.length ? `${esc(names[tag])} ${bits.join(", ")}.` : "";
  };
  const extra = [bit(a, o.a, "A"), bit(b, o.b, "B")].filter(Boolean).join(" ");
  if (o.a.rank !== o.b.rank){
    const who = o.first;
    return `${esc(names[who])} mena per primo: ${esc((who === "A" ? o.a : o.b).why)}. ${extra}`;
  }
  if (o.together) return `Stessa Iniziativa (${o.a.i}): si menano insieme. ${extra}`;
  return `${esc(names[o.first])} mena per primo (I ${Math.max(o.a.i, o.b.i)} contro ${Math.min(o.a.i, o.b.i)}). ${extra}`;
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
    /* Il titolo porta quello che l'app fa di quella regola e, sotto,
       il testo del manuale per esteso quando la lista se lo porta
       dietro — e se lo porta dietro quasi sempre. E' la differenza
       fra «l'app non conosce questa regola» e «l'app non la applica,
       ma eccola, applicatela voi». */
    const tag2 = (t, cls, title, text) => `<span class="tag ${cls}" title="${
      esc(title + (text ? NL + NL + text : ""))}">${esc(t)}</span>`;
    return `
      <div class="readout"><span><span class="swatch" style="background:${tint[tag]}"></span>${esc(names[tag])}</span>
        <b class="mono dim">${r.applied.length} su ${r.applied.length + r.elsewhere.length + r.unknown.length}</b></div>
      <div class="tags">
        ${r.applied.map(x => tag2(x.name + (x.caveat ? " *" : ""), "rule-on", x.what + (x.caveat ? " — " + x.caveat : ""), x.text)).join("")}
        ${r.elsewhere.map(x => tag2(x.name, "rule-off", "non entra in questo conto: " + x.why, x.text)).join("")}
        ${r.unknown.map(x => tag2(x.name + " ?", "rule-unk", "l'app non conosce questa regola: applicatela voi", x.text)).join("")}
      </div>`;
  };
  const body = block(a, "A") + block(b, "B");
  if (!body) return "";
  return `
    <details class="duel-rules">
      <summary class="panel-title">Regole lette dalla lista</summary>
      <p class="note">In pieno quelle che hanno spostato un dado, in grigio quelle che si giocano
      altrove, con il punto interrogativo quelle che l'app non conosce. Passa sopra un'etichetta
      per sapere perché: dove la lista porta il testo del manuale, l'etichetta lo mostra per intero.</p>
      ${body}
    </details>`;
}

function crHTML(r, names, tint){
  /* Le voci le elenca `melee.js`, con il nome giusto al singolare e al
     plurale: scriverle qui una seconda volta vorrebbe dire due elenchi
     che possono divergere, ed e' successo — il bonus della
     superiorita' numerica e' rimasto nel conto per tre tappe perche'
     stava scritto in due posti e nessuno dei due era il manuale. */
  const row = (tag, sc) => {
    const bits = sc.parts.map(p => `${p.v} ${p.v === 1 ? p.one : p.many}`);
    return `<div class="readout"><span><span class="swatch" style="background:${tint[tag]}"></span>${esc(names[tag])}</span>
      <b>${sc.total}${bits.length ? ` <span class="mono dim">= ${esc(bits.join(" + "))}</span>` : ""}</b></div>`;
  };
  const lost = [r.cr.A, r.cr.B].some(sc => sc.disrupted)
    ? `<p class="note">Chi ha finito la carica con un quarto dei modelli nel terreno difficile non conta i
       ranghi (p. 128): è la seconda metà della regola che il tavolo riconosceva già dalla Tappa 2.</p>` : "";
  return `
    <div class="duel-cr">
      <div class="panel-title">Risoluzione</div>
      ${row("A", r.cr.A)}${row("B", r.cr.B)}
      ${r.cr.tie ? `<p class="note">Pareggio rotto dal musico di <b>${esc(names[r.cr.tie])}</b>.</p>` : ""}
      ${lost}
      ${r.wiped
        ? `<p class="note"><b>${esc(names[r.wiped])}</b> non ha più nessuno in piedi: il combattimento finisce qui,
           e chi ha vinto sfonda invece di inseguire (p. 156).</p>`
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
      <div class="readout"><span>cede terreno</span><b>${pc(o.giveA)} / ${pc(o.giveB)}</b></div>
      <div class="readout"><span>ripiega in ordine</span><b>${pc(o.fallA)} / ${pc(o.fallB)}</b></div>
      <div class="readout"><span>va in rotta</span><b>${pc(o.routA)} / ${pc(o.routB)}</b></div>
      <p class="note">Le due colonne sono nell'ordine ${esc(names.A)} / ${esc(names.B)}. Le ultime tre righe sono
      i tre esiti del test di rotta (p. 154): perdere un assalto non vuol più dire scappare, e la differenza
      fra cedere due pollici e andarsene dal tavolo è quasi tutta la partita.</p>
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
        <label><input type="checkbox" id="d-bsb-${tag}"${o.bsb ? " checked" : ""}> da battaglia</label>
        <label><input type="checkbox" id="d-chg-${tag}"${o.charged ? " checked" : ""}> ha caricato</label>
        ${o.charged ? `<label class="field inline">di
          <input type="number" min="0" max="30" step="0.5" id="d-inc-${tag}" value="${o.inches || 0}">″</label>` : ""}
        <label class="field inline">colpisce di
          <select id="d-flk-${tag}">
            <option value=""${o.flank === "" ? " selected" : ""}>fronte</option>
            <option value="flank"${o.flank === "flank" ? " selected" : ""}>fianco</option>
            <option value="rear"${o.flank === "rear" ? " selected" : ""}>retro</option>
          </select></label>
      </div>
      ${o.charged && (o.inches || 0) < C.CHARGE_IMPETUS
        ? `<p class="note">Sotto i ${C.CHARGE_IMPETUS}″ di corsa non ci sono ferite d'urto né carica furiosa,
           e il bonus di Iniziativa vale un punto per pollice intero.</p>` : ""}
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

      <div class="duel-flags">
        <label class="field inline">terreno
          <select id="d-ground">
            ${ML.HIGH_GROUND.map(g => `<option value="${g.id}"${cur.ground === g.id ? " selected" : ""}>${esc(g.label)}</option>`).join("")}
          </select></label>
        <label title="Le ferite in più di quelle che bastavano contano nel risultato">
          <input type="checkbox" id="d-chal"${cur.challenge ? " checked" : ""}> sfida</label>
      </div>

      <div class="grid2">
        <button class="btn primary" id="d-roll">Tira i dadi</button>
        <button class="btn" id="d-odds">Simula 500 assalti</button>
      </div>

      ${cur.roll ? cur.roll.steps.map(s => stepHTML(s, names, tint)).join("") + crHTML(cur.roll, names, tint) : ""}
      ${cur.roll && (cur.roll.killsA || cur.roll.killsB)
        ? `<button class="btn" id="d-apply">Segna le perdite sul tavolo (−${cur.roll.killsA} / −${cur.roll.killsB})</button>` : ""}
      ${cur.roll && (cur.roll.test || cur.roll.wiped) && ctx.resolveCombat
        ? `<button class="btn primary" id="d-resolve">Porta l'esito sul tavolo: ${
             cur.roll.test ? esc(cur.roll.test.label.toLowerCase()) + " di " + esc(names[cur.roll.cr.loser])
                           : "sfondamento di " + esc(names[cur.roll.wiped === "A" ? "B" : "A"])}</button>
           <p class="note">Segna le perdite, scrive il risultato e il test nel registro con turno e casella,
           e sposta chi ha perso di quanto dice l'esito. Ogni passo è un'azione del motore: si annulla da solo.</p>` : ""}
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
    set(`#d-bsb-${tag}`, el => { o.bsb      = el.checked; });
    set(`#d-chg-${tag}`, el => { o.charged  = el.checked; });
    set(`#d-inc-${tag}`, el => { o.inches   = Math.max(0, +el.value || 0); });
    set(`#d-flk-${tag}`, el => { o.flank    = el.value; });
  }
  const setShared = (sel, fn) => {
    const el = q(sel);
    if (el) el.addEventListener("change", e => { fn(e.target); cur.roll = null; cur.odds = null; render(); });
  };
  setShared("#d-ground", el => { cur.ground = el.value; });
  setShared("#d-chal", el => { cur.challenge = el.checked; });

  q("#d-roll").addEventListener("click", async () => {
    const [x, y] = bothSides();
    const r = C.meleeRound(x, y, { challenge: cur.challenge });
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
    cur.odds = C.odds(x, y, 500, { challenge: cur.challenge }); render();
  });
  const ap = q("#d-apply");
  if (ap) ap.addEventListener("click", () =>
    ctx.applyLosses([[uA, cur.roll.killsA], [uB, cur.roll.killsB]]));
  const rs = q("#d-resolve");
  if (rs) rs.addEventListener("click", async () => {
    await ctx.resolveCombat({ a: uA, b: uB, round: cur.roll, names });
    cur.roll = null; cur.odds = null; render();
  });
}

export { render as renderDuel };
