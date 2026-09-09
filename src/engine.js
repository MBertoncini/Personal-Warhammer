/* Schieramento Old World — il motore: azioni, dadi chiesti, registro
 *
 * Fino a qui ogni conto era una funzione chiamata a mano da un
 * pannello. Funziona finche' le cose da fare sono cinque; smette di
 * funzionare quando le regole cominciano a doversi agganciare a un
 * momento preciso del turno, perche' «il momento preciso» non esiste
 * da nessuna parte nel codice — esiste solo nella testa di chi gioca.
 *
 * Qui c'e' l'ossatura, e sono quattro cose.
 *
 * **Le azioni sono oggetti.** `{ type:"declareCharge", unit, target }`,
 * `{ type:"shoot", unit, target }`, `{ type:"cast", wizard, spell }`.
 * Il motore le legge, le controlla contro la casella in cui siamo,
 * chiede i dadi che servono, chiama le regole in ascolto e scrive una
 * riga di registro. Tre cose che non si ottengono altrimenti: l'annulla
 * funziona gia' (`history.js` copia lo stato), il battle report si
 * scrive da solo, e una prova diventa una lista di azioni piu' i dadi
 * fissati.
 *
 * **Il motore non tira: chiede.** Esce `{ need:"2D6", why:"carica" }`,
 * il vassoio lo mostra, il risultato rientra. Cosi' ogni tiro passa da
 * un posto solo, si vede, finisce nel registro, e il ritiro e' una
 * regola sola invece di dieci — un dado non si ritira due volte
 * (p. 93), e il motore lo sa perche' le richieste se le ricorda.
 *
 * **Le regole sono ascoltatori.** Ogni regola si registra su un
 * momento — `onDeclareCharge`, `onToHit`, `onBreakTest` — e riceve un
 * contesto che puo' cambiare, lasciando detto cosa ha cambiato.
 * L'alternativa e' annidare condizioni dentro il codice delle fasi, ed
 * e' la strada che rende impossibile aggiungere un army book.
 *
 * **Non impedisce mai.** Un'azione fuori casella passa lo stesso, con
 * la nota del perche' era fuori posto. E' il §1 del piano, e vale
 * soprattutto qui: il primo turno in cui il motore si impunta su una
 * carica legale e' l'ultimo in cui lo si usa.
 *
 * Niente DOM, niente dadi tirati, nessuna scrittura sullo stato che non
 * passi dalle `ops` che gli vengono date: il motore si prova senza
 * browser e senza tavolo.
 */

import { STEPS, stepAt, allows, misplaced, VOCABULARY } from './phases.js';

/* ============================================================
   1 · I MOMENTI
   Sono i punti in cui una regola puo' mettere il naso. L'elenco e'
   quello del §4.4 del piano, e cresce quando cresce il motore: un
   momento in piu' costa una riga, una condizione annidata dentro una
   fase costa una riscrittura.
   ============================================================ */
export const MOMENTS = [
  "onDeclareCharge", "onChargeReaction", "onChargeMove",
  "onMove", "onTerrain",
  "onToHit", "onToWound", "onSave",
  "onCombatResult", "onBreakTest", "onPanic",
  "onCast", "onDispel", "onRally",
  "onStepEnter", "onStepLeave", "onTurnStart",
];

/* ============================================================
   2 · IL VOCABOLARIO DELLE AZIONI
   Ogni tipo dice tre cose: come si chiama in italiano, quali dadi
   chiede, e su quali momenti passa. Il testo della riga di registro lo
   scrive `line`, che e' l'unica parte che sa qualcosa del gioco.
   ============================================================ */
const nm = x => (x && (x.name || x.label)) || (x != null && x !== "" ? String(x) : "");
/* Quando il bersaglio non e' stato detto, la riga non finisce nel
   vuoto: «dichiara una carica» e' una frase, «dichiara la carica su »
   e' una frase troncata, e nel registro di una partita di tre ore la
   differenza si legge. */
const on = (x, prefix) => nm(x) ? " " + prefix + " " + nm(x) : "";
const d6 = (id, n, why, extra = {}) => ({ id, kind:"d6", n, why, ...extra });

export const ACTIONS = {
  note:    { label:"annotazione",
             line: () => "—" },

  /* Il vassoio sa gia' leggere quello che ha tirato — la deviazione, il
     Mancato Colpo, l'artiglieria — e lo scrive meglio di qualunque
     lettura generica. Quando porta il suo testo si tiene quello: il
     motore aggiunge il turno e la casella, che e' la parte che
     mancava. */
  roll:    { label:"tiro di dadi",
             line: (a, r) => a.why ? a.why + ": " + readRolls(r) : readRolls(r) },

  expire:  { label:"effetti scaduti",
             moments:["onTurnStart"],
             line: a => a.gone && a.gone.length
               ? "scadono: " + a.gone.join(", ")
               : "nessun effetto da togliere" },

  reserve: { label:"arrivo dalle riserve",
             needs: () => [d6("arrivo", 1, "arrivo degli imboscati")],
             line: (a, r) => nm(a.unit) + ": arrivo " + readRolls(r) },

  command: { label:"abilita' di comando",
             line: a => nm(a.unit) + " usa " + nm(a.ability) },

  cast:    { label:"lancio",
             moments:["onCast"],
             needs: a => [d6("lancio", a.dice || 2, "tiro di lancio")],
             line: (a, r, ctx) => nm(a.wizard) + " lancia " + nm(a.spell) + ": " + readRolls(r) +
                                  (ctx.flags.perfect ? " — invocazione perfetta" :
                                   ctx.flags.miscast ? " — fiasco" : "") },

  dispel:  { label:"dissolvimento",
             moments:["onDispel"],
             needs: () => [d6("dissolvimento", 2, "tiro di dissolvimento")],
             line: (a, r) => "dissolvimento di " + nm(a.spell) + ": " + readRolls(r) },

  rally:   { label:"raduno",
             moments:["onRally"],
             needs: () => [d6("raduno", 2, "test di Comando per radunarsi")],
             line: (a, r) => nm(a.unit) + " prova a radunarsi: " + readRolls(r) },

  declareCharge:  { label:"dichiarazione di carica",
                    moments:["onDeclareCharge"],
                    line: a => nm(a.target)
                      ? nm(a.unit) + " dichiara la carica su " + nm(a.target)
                      : nm(a.unit) + " dichiara una carica" },

  chargeReaction: { label:"reazione alla carica",
                    moments:["onChargeReaction"],
                    line: a => nm(a.unit) + " reagisce: " + (REACTIONS[a.kind] || nm(a.kind)) },

  chargeMove:     { label:"mossa di carica",
                    moments:["onChargeMove", "onMove"],
                    needs: a => [d6("carica", a.swift ? 3 : 2, "tiro di carica",
                                    { keep:2, drop:"lowest" })],
                    line: (a, r) => nm(a.unit) + " carica: " + readRolls(r) + on(a.target, "verso") },

  compulsoryMove: { label:"mossa obbligata",
                    moments:["onMove"],
                    line: a => nm(a.unit) + ": mossa obbligata" + (a.why ? " (" + a.why + ")" : "") },

  move:    { label:"movimento",
             moments:["onMove", "onTerrain"],
             line: a => nm(a.unit) + " si muove" + (a.inches ? " di " + a.inches + "″" : "") },

  march:   { label:"marcia",
             moments:["onMove", "onTerrain"],
             line: a => nm(a.unit) + " marcia" + (a.inches ? " di " + a.inches + "″" : "") },

  reform:  { label:"riorganizzazione",
             moments:["onMove"],
             line: a => nm(a.unit) + " si riorganizza" },

  flee:    { label:"fuga",
             moments:["onMove"],
             needs: () => [d6("fuga", 2, "quanto si fugge")],
             line: (a, r) => nm(a.unit) + " fugge: " + readRolls(r) },

  declareShot: { label:"dichiarazione di tiro",
                 line: a => (nm(a.target)
                   ? nm(a.unit) + " prende di mira " + nm(a.target)
                   : nm(a.unit) + " si prepara a tirare") +
                   (a.weapon ? " con " + nm(a.weapon) : "") },

  toHit:   { label:"per colpire",
             moments:["onToHit"],
             needs: a => [d6("colpire", a.dice || 1, "per colpire",
                             { need: a.need, again: a.again || null })],
             line: (a, r, ctx) => "per colpire" + needTxt(ctx.need) + ": " + readRolls(r) },

  toWound: { label:"per ferire",
             moments:["onToWound"],
             needs: a => [d6("ferire", a.dice || 1, "per ferire",
                             { need: a.need, again: a.again || null })],
             line: (a, r, ctx) => "per ferire" + needTxt(ctx.need) + ": " + readRolls(r) },

  save:    { label:"salvezza",
             moments:["onSave"],
             needs: a => [d6("salvezza", a.dice || 1, "tiro di salvezza", { need: a.need })],
             line: (a, r, ctx) => "salvezza" + needTxt(ctx.need) + ": " + readRolls(r) },

  fight:   { label:"combattimento",
             line: a => nm(a.b) ? nm(a.a) + " contro " + nm(a.b)
                                : nm(a.a) + " combatte" },

  challenge: { label:"sfida",
               line: a => nm(a.unit) + " lancia una sfida" },

  combatResult: { label:"risultato del combattimento",
                  moments:["onCombatResult"],
                  line: a => a.text || ("scarto di " + (a.diff ?? "?")) },

  breakTest: { label:"test di rotta",
               moments:["onBreakTest"],
               needs: () => [d6("rotta", 2, "test di rotta")],
               line: (a, r) => nm(a.unit) + " tiene i nervi: " + readRolls(r) },

  panic:   { label:"test di Panico",
             moments:["onPanic"],
             needs: () => [d6("panico", 2, "test di Panico")],
             line: (a, r) => nm(a.unit) + " tira il Panico: " + readRolls(r) },

  pursue:  { label:"inseguimento",
             needs: () => [d6("inseguimento", 2, "quanto insegue")],
             line: (a, r) => nm(a.unit) + " insegue: " + readRolls(r) },

  overrun: { label:"sfondamento",
             needs: () => [d6("sfondamento", 2, "quanto sfonda")],
             line: (a, r) => nm(a.unit) + " sfonda: " + readRolls(r) },

  loss:    { label:"perdite",
             line: a => nm(a.unit) + ": " + (a.n || 1) +
                        ((a.n || 1) === 1 ? " perdita" : " perdite") },

  wound:   { label:"ferite",
             line: a => nm(a.unit) + ": " + (a.n || 1) +
                        ((a.n || 1) === 1 ? " ferita" : " ferite") },
};

const REACTIONS = {
  hold:"tiene la posizione", shoot:"tira e tiene", flee:"fugge",
};

/* ============================================================
   3 · LEGGERE UN TIRO
   Il registro deve dire le facce, non solo il totale: un simulatore che
   scrive «4 ferite» non si sa se crederlo, uno che mostra i dadi si
   controlla a occhio. La stessa idea di `dice.js`, applicata a quello
   che il motore ha chiesto.
   ============================================================ */
export function readRolls(rolls){
  const list = Object.values(rolls || {});
  if (!list.length) return "—";
  return list.map(readOne).join(" · ");
}
function readOne(r){
  if (!r) return "—";
  const dice = r.dice || [];
  const kept = r.kept && r.kept.length ? r.kept : dice;
  const total = r.total != null ? r.total : kept.reduce((s, v) => s + v, 0);
  let s = dice.join(" + ");
  if (r.first && r.rerolled) s = r.first.join(" + ") + " → " + dice.join(" + ");
  if (kept.length !== dice.length) s += " (tengo " + kept.join(" + ") + ")";
  /* La somma si scrive solo quando vuol dire qualcosa. Un tiro di
     carica e' 4 + 5 = 9; un pugno di dadi per colpire non e' 19, e'
     cinque dadi di cui tre passano — sommarli sarebbe un numero che
     non esiste in nessun punto del manuale. */
  if (r.hits != null) s += " — " + r.hits + (r.hits === 1 ? " passa" : " passano");
  else if (kept.length > 1) s += " = " + total;
  return s;
}
const needTxt = n => n ? " (" + n + "+)" : "";

/* ============================================================
   4 · IL MOTORE
   `getNow` dice dove siamo — turno, esercito, casella; `setNow` ci
   porta altrove; `write` riceve la riga di registro. Sono tre funzioni
   e nient'altro: il motore non sa cosa c'e' dall'altra parte, e per
   questo si prova con tre righe di finto.
   ============================================================ */
export function createEngine({ getNow, setNow = null, write = null, getState = null } = {}){
  const listeners = new Map();          // momento -> [{id, from, fn}]
  const entries = [];                   // il registro, in ordine
  const asked = new Map();              // id richiesta -> stato del tiro
  let seq = 0;

  const now = () => {
    const n = (getNow && getNow()) || {};
    return { turn: n.turn || 1, side: n.side || "A", step: n.step || 0, ...n };
  };

  /* ---- le regole in ascolto ---------------------------------- */
  function on(moment, id, fn, from = ""){
    if (!MOMENTS.includes(moment)) throw new Error("momento sconosciuto: " + moment);
    const list = listeners.get(moment) || [];
    list.push({ id, fn, from: from || id });
    listeners.set(moment, list);
    return () => off(moment, id);
  }
  function off(moment, id){
    listeners.set(moment, (listeners.get(moment) || []).filter(l => l.id !== id));
  }
  const listening = moment => (listeners.get(moment) || []).map(l => l.id);

  /* Il contesto che gira fra gli ascoltatori. Ognuno puo' cambiarlo, e
     ogni cambiamento lascia una riga in `trace`: e' la traccia che
     rende spiegabile il numero che esce, ed e' l'obbligo numero uno
     del §1 del piano. */
  function fire(moment, ctx){
    for (const l of listeners.get(moment) || []){
      const before = JSON.stringify({ mods: ctx.mods, flags: ctx.flags, need: ctx.need });
      try { l.fn(ctx); }
      catch (e){ ctx.trace.push({ from: l.from, what: "errore: " + e.message, bad: true }); continue; }
      const after = JSON.stringify({ mods: ctx.mods, flags: ctx.flags, need: ctx.need });
      if (before !== after && !ctx.trace.some(t => t.from === l.from && t.at === moment))
        ctx.trace.push({ from: l.from, at: moment, what: ctx.said || "ha cambiato qualcosa" });
      ctx.said = "";
    }
    return ctx;
  }

  /* ---- il controllo ------------------------------------------ */
  /* Non dice mai «no». Dice cosa ci si aspetta qui, e se l'azione e'
     altrove lo scrive. `known` a falso e' l'unico vero errore: un tipo
     scritto storto verrebbe eseguito in silenzio, e sarebbe l'unico
     modo di sbagliare senza accorgersene. */
  function check(action){
    const type = action && action.type;
    const def = ACTIONS[type];
    const at = now().step;
    return {
      type,
      known: !!def,
      inVocabulary: VOCABULARY.includes(type),
      allowed: !!def && allows(at, type),
      note: def ? misplaced(at, type) : "tipo di azione sconosciuto: " + type,
      step: stepAt(at),
    };
  }

  /* ---- i dadi che servono ------------------------------------ */
  function asks(action){
    const def = ACTIONS[action.type];
    if (!def || !def.needs) return [];
    return def.needs(action) || [];
  }

  /* ---- la mossa ---------------------------------------------- */
  /* `rolls` sono i tiri gia' fatti, uno per ogni richiesta: si passano
     alla seconda chiamata. Senza, si torna indietro con l'elenco di
     cosa serve e non succede niente — nessuno stato parcheggiato, che
     e' quello che permette all'annulla di funzionare senza codice. */
  function dispatch(action, rolls = null){
    const c = check(action);
    if (!c.known) return { ok:false, why: c.note, action };

    const want = asks(action);
    const missing = want.filter(w => !(rolls && rolls[w.id]));
    if (missing.length) return { ok:false, waiting:true, ask: missing, action, check: c };

    const ctx = {
      action, rolls: rolls || {}, now: now(),
      state: getState ? getState() : null,
      mods: [], flags: {}, need: action.need || 0,
      trace: [], said: "",
      /* le due cose che un ascoltatore fa piu' spesso */
      add(what, delta){ this.mods.push({ from: what, delta }); this.said = what + " " + (delta > 0 ? "+" : "") + delta; },
      set(flag, v = true, why = ""){ this.flags[flag] = v; this.said = why || flag; },
    };

    const def = ACTIONS[action.type];
    for (const m of def.moments || []) fire(m, ctx);

    const entry = {
      n: ++seq,
      turn: ctx.now.turn, side: ctx.now.side,
      step: ctx.now.step, stepId: c.step.id, stepLabel: c.step.full,
      type: action.type, label: def.label,
      text: safeLine(def, action, ctx.rolls, ctx),
      note: c.note,
      dice: Object.keys(ctx.rolls).length ? ctx.rolls : null,
      mods: ctx.mods.length ? ctx.mods : null,
      trace: ctx.trace.length ? ctx.trace : null,
      army: action.army || (action.unit && action.unit.army) || ctx.now.side,
      at: Date.now(),
    };
    entries.push(entry);
    for (const [id, r] of Object.entries(ctx.rolls)) remember(id, r);
    if (write) write(entry);

    return { ok:true, entry, ctx, trace: ctx.trace, flags: ctx.flags, mods: ctx.mods };
  }

  /* La riga di registro. Chi chiama puo' dettarla — `action.text` vince
     sempre — perche' in tre punti l'app sa gia' dire la cosa meglio di
     una frase generica: il vassoio che ha letto un dado di deviazione,
     le perdite che sanno quanti modelli restano in piedi. Il motore ci
     mette il turno, la casella e la traccia, che e' la parte che
     mancava. E non deve poter cadere: se una `line` sbaglia si scrive
     quello che si sa e si va avanti. */
  function safeLine(def, action, rolls, ctx){
    if (action && typeof action.text === "string" && action.text) return action.text;
    try { return def.line ? def.line(action, rolls, ctx) : def.label; }
    catch { return def.label; }
  }

  /* ---- il ritiro (p. 93) -------------------------------------- */
  /* Il motore si ricorda cosa ha chiesto, e per questo sa dire di no
     alla seconda volta. Senza questa memoria ogni regola che ritira
     dovrebbe tenersela per conto suo, e sarebbero dieci copie della
     stessa regola scritte dieci volte. */
  function remember(id, roll){
    const key = id + "@" + seq;
    asked.set(key, { id, roll, rerolled: !!(roll && roll.rerolled) });
    if (asked.size > 400) asked.delete(asked.keys().next().value);
  }
  function canReroll(id){
    const last = [...asked.values()].reverse().find(a => a.id === id);
    return !!last && !last.rerolled;
  }

  /* ---- camminare sulle sedici caselle ------------------------- */
  /* Cambiare casella e' un'azione come le altre: i due momenti
     `onStepLeave` e `onStepEnter` sono il posto in cui vivranno gli
     effetti che scadono e i promemoria di inizio turno. */
  function goTo(index, { reason = "" } = {}){
    const from = now().step;
    const leaving = { action:{ type:"stepLeave" }, from, mods:[], flags:{}, trace:[], said:"" };
    fire("onStepLeave", leaving);
    if (setNow) setNow({ step: index });
    const entering = { action:{ type:"stepEnter" }, to: index, mods:[], flags:{}, trace:[], said:"" };
    fire("onStepEnter", entering);
    return { from, to: index, reason, trace: [...leaving.trace, ...entering.trace] };
  }

  return {
    on, off, listening, fire,
    check, asks, dispatch, goTo,
    canReroll,
    get entries(){ return entries; },
    get count(){ return entries.length; },
    /* il registro raccontato, per il report: una riga per azione, con
       la casella in cui e' successa */
    story: () => entries.map(e =>
      "T" + e.turn + " " + e.side + " · " + e.stepLabel + " · " + e.text +
      (e.note ? " [" + e.note + "]" : "")),
    clear(){ entries.length = 0; asked.clear(); seq = 0; },
  };
}
