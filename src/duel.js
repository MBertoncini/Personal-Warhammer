/* Schieramento Old World — il pannello dello scontro
 *
 * Due *parti*, i dadi, e il conto di fine assalto. Il modulo non sa
 * niente del tavolo: riceve le unita' e una manciata di callback, e
 * restituisce — se glielo si chiede — le perdite da segnare.
 *
 * Le parti sono elenchi, non due unita': il combattimento a piu' di
 * due e' il normale di Warhammer (p. 153) e il pannello lo apriva a
 * coppie, costringendo a scegliere quale delle tre cariche guardare.
 * Adesso si aggiunge un'unita' per parte con una tendina, e chi la
 * tocca sul tavolo viene proposto per primo.
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
import { chartLink } from './charts.js';

let host = null, ctx = null, cur = null;

export function initDuel(el, context){ host = el; ctx = context; }
export const duelOpen = () => !!cur;

/* Le opzioni partono dal profilo e restano modificabili: il file della
   lista non dice chi ha caricato, chi porta lo stendardo, e quasi mai
   che armatura indossa. Quelle tre righe le sa solo chi guarda il tavolo. */
function sideOpts(u, foe){
  const joined = x => ctx && ctx.joined ? ctx.joined(x) : [];
  const c = C.combatant(u, { joined: joined(u) }), f = C.combatant(foe, { joined: joined(foe) });
  /* La Paura in mischia (Tappa 5): chi ci e' dentro contro un nemico
     piu' grosso che la fa tira quando il combattimento viene scelto, e
     se fallisce ha −1 per colpire. Il test lo tira il tavolo, una volta
     per turno; qui arriva l'esito, e la casella resta spuntabile. */
  const fear = ctx && ctx.fearFor ? ctx.fearFor(u, foe) : null;
  /* Fianco, retro e disordine dal tavolo: chi tocca chi e da che lato,
     a ogni round e non solo nel turno della carica (pp. 101 e 152). Se
     le due unita' non si toccano resta quello che ha detto la carica. */
  const table = ctx && ctx.tableSide ? ctx.tableSide(u, foe) : null;
  return {
    flankWhy: table ? table.flankWhy : "",
    disrupted: !!(table && table.disrupted) || !!c.disrupted,
    disruptedWhy: table && table.disrupted ? table.disruptedWhy : c.disrupted ? "terreno difficile" : "",
    fear, feared: !!(fear && fear.already && !fear.passed),
    attacks: C.contact(c, f).attacks,
    /* dalla schiera e non dall'unita': la salvezza speciale che una
       regola d'esercito fissa (l'Arcane Shield) sta li', e il campo del
       pannello la mostra gia' giusta invece di rimetterla a zero */
    armour: c.armour, ward: c.ward, regen: c.regen,
    /* lo stendardo adesso arriva dal file quando c'e': era una casella
       da spuntare a mano ogni volta, e il dato stava li' dall'inizio */
    standard: c.standard,
    /* e con la Tappa 3 ci arriva anche la carica. Il tavolo sa da che
       faccia e' arrivata e quanti pollici ha percorso: chiederlo di
       nuovo qui era far ripetere a mano una risposta gia' data. */
    charged: c.charged, inches: c.chargeInches,
    flank: table && table.flank != null ? table.flank : c.flank,
    bsb: !!(c.flags && c.flags.battleStandard),
    ground: "", challenge: false,
  };
}

/* Il pannello tiene gli uid, non gli oggetti: un Annulla rifa' le
   unita' da zero e i riferimenti diretti resterebbero appesi a una
   copia vecchia, che e' il modo silenzioso di mostrare numeri finti. */
export function openDuel(a, b){
  /* il terreno piu' alto lo guarda il tavolo: chi combatte con la prima
     fila sulla collina e chi no (p. 152). Resta un menu. */
  const ground = ctx && ctx.groundFor ? ctx.groundFor(a, b) : { id: "", why: "" };
  cur = { A: [], B: [],
          /* il terreno piu' alto e la sfida non sono di una parte sola:
             sono due domande sul combattimento, e si rispondono una
             volta per tutte e due */
          ground: ground.id, groundWhy: ground.why, challenge: false, roll: null, odds: null };
  enter("A", a, b); enter("B", b, a);
  render();
}
export function closeDuel(){ cur = null; render(); }

const other = tag => tag === "A" ? "B" : "A";
/* le unita' di una parte, saltando quelle che un Annulla si e' portato
   via: il pannello si chiude solo quando una parte resta vuota */
const unitsOf = tag => cur[tag].map(s => ctx.unit(s.uid)).filter(Boolean);

/* Un'unita' entra nel combattimento con i personaggi che ci stanno
   dentro. Prima non entravano: il pannello contava la psicologia del
   capo unito e non i suoi quattro attacchi, cioe' lo faceva parlare e
   non menare. Adesso ognuno e' una schiera per conto suo — e' l'unico
   modo di dargli ferite sue, che e' quello che il manuale chiede
   (p. 209: le ferite in eccesso non tracimano fra capo e reggimento). */
function enter(tag, u, foe){
  cur[tag].push({ uid: u.uid, o: sideOpts(u, foe) });
  const dentro = ctx && ctx.joined ? ctx.joined(u) : [];
  for (const ch of dentro)
    cur[tag].push({ uid: ch.uid, host: u.uid, attached: true,
                    o: { ...sideOpts(ch, foe), targeted: false } });
}

/* Chi si puo' aggiungere a una parte: tutto quello che il tavolo ha in
   campo di quell'esercito e non e' gia' dentro il pannello. Chi tocca
   davvero il nemico viene per primo e lo dice, perche' fra «sta
   combattendo» e «potrebbe caricare il turno prossimo» c'e' la
   differenza fra arbitrare e chiedersi se conviene. */
function joinable(tag){
  if (!ctx || !ctx.candidates) return [];
  const mine = unitsOf(tag), foes = unitsOf(other(tag));
  if (!mine.length) return [];
  const dentro = new Set([...cur.A, ...cur.B].map(s => s.uid));
  return ctx.candidates(mine[0], foes).filter(x => !dentro.has(x.uid));
}

function addTo(tag, uid){
  const u = ctx.unit(uid);
  if (!u) return;
  const foes = unitsOf(other(tag));
  enter(tag, u, foes[0] || u);
  cur.roll = null; cur.odds = null;
  render();
}
function dropFrom(tag, i){
  const via = cur[tag][i];
  if (!via) return;
  /* l'ultimo reggimento non si toglie: una parte senza nessuno non e'
     una parte. E chi se ne va si porta dietro i suoi capi. */
  if (!via.attached && cur[tag].filter(s => !s.attached).length <= 1) return;
  cur[tag] = cur[tag].filter((s, k) => k !== i && !(via.attached ? false : s.host === via.uid));
  cur.roll = null; cur.odds = null;
  render();
}

/* dall'unita' + opzioni alla schiera che combatte */
function sideOf(u, o, tag, { attached = false, host = null } = {}){
  const c = C.combatant(u, {
    armour: o.armour, ward: o.ward, regen: o.regen, forcedAttacks: o.attacks,
    standard: o.standard, charged: o.charged, chargeInches: o.inches,
    flank: o.flank, highGround: ML.highGroundFor(cur.ground, tag), disrupted: !!o.disrupted,
    feared: !!o.feared, joined: ctx && ctx.joined ? ctx.joined(u) : [],
  });
  /* lo stendardo da battaglia lo legge il registro delle regole, ma
     resta spuntabile: nelle liste il portastendardo e' un personaggio
     unito, e chi guarda il tavolo sa se e' ancora in piedi */
  c.flags = { ...c.flags, battleStandard: !!o.bsb };
  if (attached){
    /* dentro i ranghi di qualcun altro: mena, ma lo colpisce solo chi
       ci dirige i colpi apposta — e urto e pestoni solo se nel
       reggimento restano meno di cinque modelli di truppa (p. 209) */
    c.attached = true; c.shielded = true;
    const h = host ? ctx.unit(host) : null;
    const truppa = h ? Math.max(0, (h.models || 0) - (h.lost || 0)) : 0;
    c.exposed = truppa > 0 && truppa < 5;
    c.hostName = h ? h.name : "";
  }
  return c;
}

/* Le due parti pronte a menare. Chi tocca chi lo dice il tavolo: se le
   unita' sono gia' a contatto, ogni schiera dichiara i nemici che ha
   davvero davanti (`vs`), e chi non ne tocca nessuno — il pannello
   aperto *prima* della carica, per decidere se conviene — non dichiara
   niente, e allora si toccano tutti. */
function bothSides(){
  /* le righe sono indicizzate come cur[tag], che puo' avere un buco se
     un'unita' e' sparita: si riallineano sugli uid rimasti */
  const rows = tag => cur[tag].filter(s => ctx.unit(s.uid));
  const rA = rows("A"), rB = rows("B");
  const uA = rA.map(s => ctx.unit(s.uid)), uB = rB.map(s => ctx.unit(s.uid));
  const build = (righe, tag, mieU, foesU, foesR) => righe.map((s, i) => {
    const u = mieU[i];
    const c = sideOf(u, s.o, tag, { attached: !!s.attached, host: s.host });
    c.side = tag;                       // per il blocco delle regole, che le elenca unita' per unita'
    /* Chi ha davanti. Due cose diverse nella stessa riga: i reggimenti
       che tocca sul tavolo, e i capi nemici su cui qualcuno ha deciso
       di dirigere i colpi (p. 209). Senza nessuna delle due si toccano
       tutti, che e' il caso di un assalto a due. */
    const tocca = ctx && ctx.touches && !s.attached
      ? foesU.filter(f => ctx.touches(u, f)) : [];
    const mirati = foesR.map((r, k) => r.attached && r.o.targeted ? foesU[k] : null).filter(Boolean);
    let vs = tocca.length && tocca.length < foesU.length ? tocca : null;
    if (mirati.length){
      vs = [...(vs || foesU.filter((f, k) => !foesR[k].attached)), ...mirati];
      /* quanti colpi ci dirige: lo dice la riga del capo bersagliato, e
         vuoto vuol dire «un modello», il ripiego di `combat.js` */
      const quanti = foesR.find(r => r.attached && r.o.targeted && r.o.aimed != null);
      if (quanti) c.aimed = quanti.o.aimed;
    }
    if (vs) c.vs = vs;
    return c;
  });
  return [build(rA, "A", uA, uB, rB), build(rB, "B", uB, uA, rA)];
}

/* ============================================================
   DISEGNO
   ============================================================ */
const SAVE_OPTS = [[0, "—"], [2, "2+"], [3, "3+"], [4, "4+"], [5, "5+"], [6, "6+"]];
/* "sempre" e' il punteggio di chi non deve tirare: chi ha davanti
   un'Abilita' Combattimento 0 colpisce e basta (p. 97). */
const need = n => n >= IMPOSSIBLE ? "mai" : n <= AUTOHIT ? "sempre" : n + "+";

/* Da un punteggio alla sua tabella: toccare il «3+» apre la scheda con
   le due Abilita' Combattimento, o con Forza e Resistenza, gia'
   scelte. La Forza e' quella con cui il conto ferisce davvero, regole
   d'esercito comprese; la Paura che alza il tiro di uno la tabella non
   la mostra, e il pannello la scrive accanto. */
const meleeChart = (x, y) => ({ tab:"melee", wsA: x.ws, wsD: y.ws });
const woundChart = (x, y, f) => ({ tab:"wound", s: x.s + ((f.boost && f.boost.s) || 0), t: y.t });
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
    /* il nome dell'unita' e non quello della parte: in tre, «Orchi»
       dice quale mucchio si sta guardando e «gli Orchi e i lupi» no */
    const who = s.name || names[s.side];
    add(`${who} · colpisce ${need(s.hit.need)}`, s.hit);
    add(`${who} · ferisce ${need(s.wound.need)}`, s.wound);
    add(`${who} · armatura ${need(s.save.need)}`, s.save);
    add(`${who} · speciale ${need(s.ward.need)}`, s.ward);
    add(`${who} · rigenera ${need(s.regen.need)}`, s.regen);
  }
  for (const t of r.tests || [])
    if ((t.dice || []).length)
      out.push({ kind:"d6", label:`${t.name || names[t.side]} · test di rotta`,
                 dice: asDice(t, 0),
                 tail: `${t.natural} contro ${t.ld}` +
                       (t.diff ? ` (e ${t.modified} con lo scarto)` : "") });
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
        <b>${esc(s.name || names[s.side])}</b><span>${s.label}${
          s.foe ? " su " + esc(s.foe) : ""}</span>
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

/* Un test per ogni unita' della parte che ha perso (p. 154): lo stesso
   scarto, e tre esiti che possono venire diversi — un reggimento cede
   terreno e quello di fianco se ne va. */
function testsHTML(r, names){
  return (r.tests || []).map(t => testHTML(r, t, names)).join("");
}

function testHTML(r, t, names){
  const side = t.side;
  const c = (r.sides[side] || [])[t.at || 0] || r.a;
  const ld = c.ld;
  const colour = t.outcome === "rout" ? "bad" : t.outcome === "give" ? "ok" : "warn";
  /* Le tre probabilita' stanno accanto all'esito perche' un esito solo
     non dice se e' stato fortunato: «ripiega» con il 44% di ripiegare
     e' la normalita', «cede terreno» con l'8% e' uno scampato
     pericolo. Ed e' il numero con cui si decide se giocarsi lo
     Stubborn, che vale una volta per partita. */
  const ch = t.chances;
  const pc = v => Math.round(v * 100) + "%";
  const odds = ch ? `<span class="mono dim">cede ${pc(ch.give)} · ripiega ${pc(ch.fallBack)} · rotta ${pc(ch.rout)}</span>` : "";
  const stub = !t.stubborn && !t.unbreakable && c.flags.stubborn
    ? `<p class="note">Ha <b>Stubborn</b>: una volta per partita può saltare il test e ripiegare in ordine.
       Qui non se n'è servita: cedere terreno era più probabile che andarsene.</p>` : "";
  /* L'esito lo dice gia' la frase che `melee.js` scrive, in fondo dopo
     la freccia: qui si colora quel pezzo invece di ripeterlo, che e'
     come si era fatto la prima volta — «va in rotta → va in rotta». */
  const cut = t.text.lastIndexOf("→ ");
  const head = cut < 0 ? t.text : t.text.slice(0, cut + 2);
  const verb = cut < 0 ? t.label.toLowerCase() : t.text.slice(cut + 2);
  /* da dove viene il Comando del test: la Warband che lo alza, il
     Terrore del vincitore che lo abbassa (Tappa 5) */
  const ldWhy = [c.ldWhy, t.terror].filter(Boolean).join("; ");
  return `<p class="note"><b>${esc(t.name || names[side])}</b> perde di ${r.cr.diff} (Comando ${ld}${ldWhy ? " — " + esc(ldWhy) : ""}):
    ${esc(head)}<b style="color:var(--${colour})">${esc(verb)}</b>. ${odds}</p>
    ${t.daVerificare ? `<p class="note">La riga della Forza d'Unità più che doppia è dedotta dal testo di
      <b>Stubborn</b>, non letta sulla pagina del test: se il manuale dice altro, si cambia
      <span class="mono">CRUSHING_BLOCKS_FALLBACK</span>.</p>` : ""}${stub}${t.shieldwall
      ? `<p class="note"><b>Shieldwall</b>: cede terreno invece di ripiegare, e se la gioca per tutta la partita.
         Vale in ordine chiuso e con gli scudi in uso: se non li usava, l'esito è il ripiegamento.</p>` : ""}`;
}

/* Chi mena per primo. Non e' sempre l'Iniziativa: chi ha caricato ne
   guadagna un punto per pollice intero percorso (p. 146), e un'arma che
   colpisce per ultima scavalca tutto. Vale la pena dirlo per esteso,
   perche' e' la ragione per cui a volte il piu' svelto dei due parte
   dopo — e perche' il bonus della carica e' la novita' che ribalta
   l'ordine in mezza partita.  */
function orderLine(A, B, names){
  const a = A[0], b = B[0];
  /* In tre l'ordine non e' piu' una frase su chi parte per primo: e'
     una fila, e si legge come una fila. Gli scaglioni li fa `melee.js`,
     e chi sta nello stesso scaglione mena insieme. */
  if (A.length > 1 || B.length > 1){
    const tutti = [...A, ...B];
    const passi = ML.strikeSteps(tutti);
    const nome = at => esc(tutti[at].name);
    return "Si mena in quest'ordine: " + passi.map(p =>
      p.at.map(nome).join(" e ") + ` (I ${p.i})`).join(", poi ") + ".";
  }
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
function rulesHTML(tutti, tint){
  const block = c => {
    const tag = c.side;
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
      <div class="readout"><span><span class="swatch" style="background:${tint[tag]}"></span>${esc(c.name)}</span>
        <b class="mono dim">${r.applied.length} su ${r.applied.length + r.elsewhere.length + r.unknown.length}</b></div>
      <div class="tags">
        ${r.applied.map(x => tag2(x.name + (x.caveat ? " *" : ""), "rule-on", x.what + (x.caveat ? " — " + x.caveat : ""), x.text)).join("")}
        ${r.elsewhere.map(x => tag2(x.name, "rule-off", "non entra in questo conto: " + x.why, x.text)).join("")}
        ${r.unknown.map(x => tag2(x.name + " ?", "rule-unk", "l'app non conosce questa regola: applicatela voi", x.text)).join("")}
      </div>`;
  };
  const body = tutti.map(block).join("");
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
    /* In tre il totale della parte non e' la somma delle schede, e
       nasconderlo sarebbe il modo di far sembrare sbagliato un conto
       giusto: sotto la riga si vede chi ha portato cosa, e la pagina
       dice perche' i ranghi non si sommano (p. 153). */
    const chi = sc.count > 1
      ? `<p class="note">${sc.units.map(u => `<b>${esc(u.name)}</b>: ` +
          (u.parts.length ? u.parts.map(p => `${p.v} ${p.v === 1 ? p.one : p.many}`).join(" + ") : "niente"))
          .join(" · ")}. Dei ranghi vale il più alto, gli stendardi contano per uno,
          il fianco una volta per unità nemica (p. 153).</p>` : "";
    return `<div class="readout"><span><span class="swatch" style="background:${tint[tag]}"></span>${esc(names[tag])}</span>
      <b>${sc.total}${bits.length ? ` <span class="mono dim">= ${esc(bits.join(" + "))}</span>` : ""}</b></div>${chi}`;
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
      ${[["A", "B"], ["B", "A"]].filter(([t]) => r.cr[t].flankDenied).map(([t, o]) =>
        `<p class="note"><b>${esc(names[t])}</b> è di fianco o di retro ma non ne prende il punto:
         <b>${esc(names[o])}</b> ha ${esc(r.cr[t].flankDenied)}.</p>`).join("")}
      ${r.wiped
        ? `<p class="note"><b>${esc(names[r.wiped])}</b> non ha più nessuno in piedi: il combattimento finisce qui,
           e chi ha vinto sfonda invece di inseguire (p. 156).</p>`
        : (r.tests || []).length ? testsHTML(r, names)
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

function controls(tag, u, i, quante){
  const row = cur[tag][i], o = row.o;
  const c = C.combatant(u);
  /* un capo dentro un reggimento: le caselle che sono del reggimento —
     stendardo, fianco, disordine — non sono sue, e mostrargliele
     vorrebbe dire contare due volte lo stesso punto (p. 209) */
  const dentro = !!row.attached;
  const host = dentro && row.host != null ? ctx.unit(row.host) : null;
  const truppa = host ? Math.max(0, (host.models || 0) - (host.lost || 0)) : 0;
  tag = tag + i;                       // gli identificatori dei campi: d-att-A0, d-att-A1…
  return `
    <div class="duel-side${dentro ? " duel-joined" : ""}">
      <div class="army-head"><span class="swatch" style="background:var(--army${u.army})"></span>
        <b>${esc(u.name)}</b>
        ${quante > 1 ? `<span class="spacer"></span><button class="btn tiny ghost" id="d-drop-${tag}"
          title="Toglila da questo combattimento">×</button>` : ""}</div>
      ${dentro ? `<p class="note">Dentro <b>${esc(host ? host.name : "il reggimento")}</b>: mena con lui, ma
        lo colpisce solo chi ci dirige i colpi apposta (p. 209). Le ferite non tracimano né in un verso né
        nell'altro.</p>` : ""}
      <div class="mono dim">${["WS","S","T","W","I","A","Ld"].map(k => k + " " + (c[k.toLowerCase()] || "–")).join(" · ")}</div>
      <div class="mono dim">${c.models} in piedi · ${c.frontage} di fronte${c.weapon ? " · " + esc(c.weapon) : ""}</div>
      <div class="grid2">
        <label class="field">Attacchi<input type="number" min="0" max="400" id="d-att-${tag}" value="${o.attacks}"></label>
        <label class="field">Armatura<select id="d-arm-${tag}">${SAVE_OPTS.map(([v, l]) => `<option value="${v}"${v === o.armour ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="field">Speciale<select id="d-wrd-${tag}">${SAVE_OPTS.map(([v, l]) => `<option value="${v}"${v === o.ward ? " selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="field">Rigenera<select id="d-rgn-${tag}">${SAVE_OPTS.map(([v, l]) => `<option value="${v}"${v === o.regen ? " selected" : ""}>${l}</option>`).join("")}</select></label>
      </div>
      <div class="duel-flags">
        ${dentro ? `<label title="Gli attacchi diretti contro di lui da modelli a contatto: finché nessuno ce li dirige, il capo non si può colpire (p. 209)">
            <input type="checkbox" id="d-tgt-${tag}"${o.targeted ? " checked" : ""}> i nemici lo colpiscono</label>
          ${o.targeted ? `<label class="field inline">con
            <input type="number" min="0" max="40" id="d-aim-${tag}" value="${o.aimed == null ? "" : o.aimed}"
              placeholder="un modello"> attacchi</label>` : ""}
          ${truppa > 0 && truppa < 5 ? `<p class="note">Nel reggimento restano ${truppa} modelli di truppa:
            sotto i cinque gli arrivano addosso anche l'urto della carica e i pestoni, e lo si può prendere
            di mira sparando (p. 209).</p>` : ""}` : `
        <label><input type="checkbox" id="d-std-${tag}"${o.standard ? " checked" : ""}> stendardo</label>`}
        <label><input type="checkbox" id="d-bsb-${tag}"${o.bsb ? " checked" : ""}> da battaglia</label>
        <label><input type="checkbox" id="d-chg-${tag}"${o.charged ? " checked" : ""}> ha caricato</label>
        ${(o.fear && (o.fear.must || o.fear.already)) || o.feared
          ? `<label title="${esc(o.fear ? o.fear.why : "")}"><input type="checkbox" id="d-fear-${tag}"${
              o.feared ? " checked" : ""}> Paura fallita (−1 per colpire)</label>` : ""}
        ${o.charged ? `<label class="field inline">di
          <input type="number" min="0" max="30" step="0.5" id="d-inc-${tag}" value="${o.inches || 0}">″</label>` : ""}
        ${dentro ? "" : `<label class="field inline">colpisce di
          <select id="d-flk-${tag}">
            <option value=""${o.flank === "" ? " selected" : ""}>fronte</option>
            <option value="flank"${o.flank === "flank" ? " selected" : ""}>fianco</option>
            <option value="rear"${o.flank === "rear" ? " selected" : ""}>retro</option>
            <option value="both"${o.flank === "both" ? " selected" : ""}>fianco e retro</option>
          </select></label>
        <label title="${esc(o.disruptedWhy || "Preso di fianco o di retro da un'unità con Forza d'Unità 5 o più, o con un quarto dei modelli nel terreno difficile (p. 101)")}">
          <input type="checkbox" id="d-dsr-${tag}"${o.disrupted ? " checked" : ""}> in disordine (niente ranghi)</label>`}
      </div>
      ${o.flankWhy ? `<p class="note">Dal tavolo: ${esc(o.flankWhy)} (p. 152).</p>` : ""}
      ${o.disrupted && o.disruptedWhy ? `<p class="note">In disordine: ${esc(o.disruptedWhy)}.</p>` : ""}
      ${o.charged && (o.inches || 0) < C.CHARGE_IMPETUS
        ? `<p class="note">Sotto i ${C.CHARGE_IMPETUS}″ di corsa non ci sono ferite d'urto né carica furiosa,
           e il bonus di Iniziativa vale un punto per pollice intero.</p>` : ""}
      ${o.fear && o.fear.must
        ? `<p class="note">${esc(o.fear.why)}: il test di Paura si tira quando il combattimento
           viene scelto, una volta per turno — dal pulsante <b>Paura</b> nell'ispettore.</p>` : ""}
    </div>`;
}

/* Il nome di una parte: una sola unita' si chiama con il suo nome, due
   con tutti e due, e da tre in poi si dice la prima e quante sono le
   altre — «gli Orchi e altri 2» sta in una riga e si capisce. */
function sideName(list){
  const n = list.map(u => u.name);
  if (n.length <= 1) return n[0] || "";
  if (n.length === 2) return n[0] + " e " + n[1];
  return n[0] + " e altri " + (n.length - 1);
}

function render(){
  if (!host) return;
  const uA = cur ? unitsOf("A") : [], uB = cur ? unitsOf("B") : [];
  /* un Annulla o una rimozione possono aver portato via un'unita': il
     pannello si chiude quando una delle due parti resta senza nessuno,
     invece di mostrare un combattimento che non c'e' piu' */
  if (!cur || !uA.length || !uB.length){
    cur = null; host.hidden = true; host.innerHTML = ""; return;
  }
  host.hidden = false;
  /* le opzioni seguono le unita' rimaste: se una e' sparita, la sua
     riga di impostazioni va via con lei */
  cur.A = cur.A.filter(s => ctx.unit(s.uid));
  cur.B = cur.B.filter(s => ctx.unit(s.uid));

  const [A, B] = bothSides();
  const a = A[0], b = B[0];
  const names = { A: sideName(uA), B: sideName(uB) };
  const tint  = { A: `var(--army${uA[0].army})`, B: `var(--army${uB[0].army})` };
  const solo = A.length === 1 && B.length === 1;

  /* La previsione, coppia per coppia: ognuno contro il nemico che ha
     davanti, e in cima la somma. Con due sole unita' e' la riga di
     sempre; in tre dice a chi conviene menare chi. */
  const link = C.engagements(A, B);
  const pairs = [];
  A.forEach((c, i) => (link.A[i] || []).forEach((j, k) => pairs.push({ tag:"A", c, foe: B[j],
    f: C.meleeForecast(c, B[j], (link.A[i] || []).length > 1
      ? C.contact(c, B[j], { frontage: C.frontShares(c.frontage, link.A[i].length)[k] }).attacks : undefined) })));
  B.forEach((c, j) => (link.B[j] || []).forEach((i, k) => pairs.push({ tag:"B", c, foe: A[i],
    f: C.meleeForecast(c, A[i], (link.B[j] || []).length > 1
      ? C.contact(c, A[i], { frontage: C.frontShares(c.frontage, link.B[j].length)[k] }).attacks : undefined) })));
  const sum = tag => pairs.filter(p => p.tag === tag).reduce((s, p) => s + p.f.wounds, 0);
  const linea = p => `${esc(p.c.name)} ${solo ? "" : "su " + esc(p.foe.name) + " "}colpisce ${
      chartLink(need(p.f.hitNeed), meleeChart(p.c, p.foe))}, ferisce ${
      chartLink(need(p.f.woundNeed), woundChart(p.c, p.foe, p.f))}${
      p.f.saveNeed < IMPOSSIBLE ? `, armatura ${need(p.f.saveNeed)}` : ""}.`;

  const addBox = tag => {
    const liberi = joinable(tag);
    if (!liberi.length) return "";
    return `<label class="field inline">aggiungi
      <select id="d-add-${tag}">
        <option value="">—</option>
        ${liberi.map(x => `<option value="${x.uid}">${esc(x.name)}${x.touching ? " · a contatto" : ""}</option>`).join("")}
      </select></label>`;
  };

  host.innerHTML = `
    <div class="duel-card">
      <div class="duel-head">
        <b>Scontro simulato</b>
        <span class="spacer"></span>
        <button class="btn tiny" id="d-swap" title="Scambia attaccante e difensore">⇄</button>
        <button class="btn tiny ghost" id="d-close">Chiudi</button>
      </div>

      <div class="duel-sides">
        <div class="duel-group">${uA.map((u, i) => controls("A", u, i, uA.length)).join("")}${addBox("A")}</div>
        <div class="duel-group">${uB.map((u, i) => controls("B", u, i, uB.length)).join("")}${addBox("B")}</div>
      </div>

      <div class="duel-forecast">
        <div class="readout"><span>Senza tirare, in media</span>
          <b>${sum("A").toFixed(1)} ferite ↔ ${sum("B").toFixed(1)}</b></div>
        <p class="note">
          ${pairs.map(linea).join(" ")}
          ${orderLine(A, B, names)}
        </p>
      </div>

      <div class="duel-flags">
        <label class="field inline">terreno
          <select id="d-ground">
            ${ML.HIGH_GROUND.map(g => `<option value="${g.id}"${cur.ground === g.id ? " selected" : ""}>${esc(g.label)}</option>`).join("")}
          </select></label>
        ${cur.groundWhy ? `<span class="note">${esc(cur.groundWhy)}</span>` : ""}
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
      ${cur.roll && ((cur.roll.tests || []).length || cur.roll.wiped) && ctx.resolveCombat
        ? `<button class="btn primary" id="d-resolve">Porta l'esito sul tavolo: ${
             (cur.roll.tests || []).length
               ? esc(cur.roll.tests.map(t => t.label.toLowerCase() + " di " + t.name).join(", "))
               : "sfondamento di " + esc(names[cur.roll.wiped === "A" ? "B" : "A"])}</button>
           <p class="note">Segna le perdite, scrive il risultato e i test nel registro con turno e casella,
           e sposta chi ha perso di quanto dice l'esito. Ogni passo è un'azione del motore: si annulla da solo.</p>` : ""}
      ${cur.odds ? oddsHTML(cur.odds, names, tint) : ""}

      ${rulesHTML([...A, ...B], tint)}

      <p class="note">Stima, non arbitro: legge i profili della lista, le regole che riconosce e i
      numeri che imposti qui. Quello che non ha applicato sta scritto qui sopra. Al tavolo decidete voi.</p>
    </div>`;

  /* ---- fili ---- */
  const q = s => host.querySelector(s);
  q("#d-close").addEventListener("click", closeDuel);
  /* lo scambio riapre il pannello con le parti invertite: si scambiano
     le parti intere, non le due unita' di prima */
  q("#d-swap").addEventListener("click", () => {
    const { A, B } = cur;
    cur = { ...cur, A: B, B: A, roll: null, odds: null };
    render();
  });

  for (const tag of ["A", "B"]){
    const lista = tag === "A" ? uA : uB;
    lista.forEach((u, i) => {
      const o = cur[tag][i].o, id = tag + i;
      const set = (sel, fn) => {
        const el = q(sel);
        if (el) el.addEventListener("change", e => { fn(e.target); cur.roll = null; cur.odds = null; render(); });
      };
      set(`#d-att-${id}`, el => { o.attacks = Math.max(0, +el.value || 0); });
      set(`#d-arm-${id}`, el => { o.armour = +el.value || 0; ctx.setSave(u, "armour", o.armour); });
      set(`#d-wrd-${id}`, el => { o.ward   = +el.value || 0; ctx.setSave(u, "ward", o.ward); });
      set(`#d-rgn-${id}`, el => { o.regen  = +el.value || 0; ctx.setSave(u, "regen", o.regen); });
      set(`#d-std-${id}`, el => { o.standard = el.checked; });
      set(`#d-bsb-${id}`, el => { o.bsb      = el.checked; });
      set(`#d-chg-${id}`, el => { o.charged  = el.checked; });
      set(`#d-fear-${id}`, el => { o.feared  = el.checked; });
      set(`#d-inc-${id}`, el => { o.inches   = Math.max(0, +el.value || 0); });
      set(`#d-flk-${id}`, el => { o.flank    = el.value; });
      set(`#d-dsr-${id}`, el => { o.disrupted = el.checked; });
      /* i colpi diretti sul capo unito: se qualcuno ce li dirige, e
         quanti (vuoto = un modello, che e' quello che si fa al tavolo) */
      set(`#d-tgt-${id}`, el => { o.targeted = el.checked; });
      set(`#d-aim-${id}`, el => { o.aimed = el.value === "" ? null : Math.max(0, +el.value || 0); });
      const via = q(`#d-drop-${id}`);
      if (via) via.addEventListener("click", () => dropFrom(tag, i));
    });
    const piu = q(`#d-add-${tag}`);
    if (piu) piu.addEventListener("change", e => { if (e.target.value) addTo(tag, +e.target.value); });
  }
  const setShared = (sel, fn) => {
    const el = q(sel);
    if (el) el.addEventListener("change", e => { fn(e.target); cur.roll = null; cur.odds = null; render(); });
  };
  setShared("#d-ground", el => { cur.ground = el.value; });
  setShared("#d-chal", el => { cur.challenge = el.checked; });

  q("#d-roll").addEventListener("click", async () => {
    const [x, y] = bothSides();
    const r = C.meleeFight(x, y, { challenge: cur.challenge });
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
  /* le perdite unita' per unita': in tre, «−4» sulla parte non dice a
     chi togliere i modelli */
  /* e con loro le ferite che restano appese, quelle che non hanno
     completato un modello: fra un round e l'altro non evaporano piu' */
  if (ap) ap.addEventListener("click", () =>
    ctx.applyLosses([...uA.map((u, i) => [u, cur.roll.kills.A[i], cur.roll.sides.A[i].spill]),
                     ...uB.map((u, i) => [u, cur.roll.kills.B[i], cur.roll.sides.B[i].spill])]));
  const rs = q("#d-resolve");
  if (rs) rs.addEventListener("click", async () => {
    await ctx.resolveCombat({ A: uA, B: uB, round: cur.roll, names });
    cur.roll = null; cur.odds = null; render();
  });
}

export { render as renderDuel };
