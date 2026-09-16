/* Schieramento Old World — la psicologia: Panico, Paura, Terrore, e chi non decide da se'
 *
 * Quasi tutta la psicologia e' una misura di distanza piu' un test di
 * Comando, e l'app fa gia' bene tutte e due le cose. Quello che le
 * mancava era sapere **quando** il test si fa, **chi** ne e' esente, e
 * **cosa succede** se va male — che sono le tre domande che al tavolo
 * si sbagliano, perche' capitano nel mezzo di un'altra cosa: la Paura
 * mentre si dichiara una carica, il Terrore mentre si sceglie la
 * reazione, il Panico mentre si tolgono i modelli di un altro
 * reggimento.
 *
 * Da dove viene quello che c'e' qui. Il testo per esteso di queste
 * regole sta dentro le liste salvate — i file di New Recruit se lo
 * portano dietro, e la Tappa 3 lo ha trovato — e questo modulo e'
 * scritto leggendo quel testo, non il riassunto del piano. Dove il
 * testo non c'e' (la pagina del Panico del manuale base) le costanti
 * dicono `DA_VERIFICARE` invece di prendere in prestito il Warhammer
 * di prima: e' l'errore che le Tappe dalla 0 alla 3 hanno trovato
 * cinque volte.
 *
 * Qui dentro non ci sono dadi tirati, stato o DOM: entrano profili,
 * Forze d'Unita', distanze e facce gia' uscite, escono esiti con la
 * traccia di come sono venuti. Come `charge.js`, `melee.js` e
 * `shoot.js`.
 */

import { flagsOf } from './effects.js';

export const PAGE = {
  panicShooting: 141,   // il quarto perso al tiro
  panic: 160,           // le altre cause (pp. 160-161, dal piano)
  rally: 117,           // il raduno: la quarta sotto-fase della Strategia
  musician: 201,        // il +1 al raduno del musico
};
/* Le regole speciali non hanno una pagina qui: il loro testo sta nella
   lista, ed e' li' che la riga di registro manda a leggerlo. */
export const FROM_LIST = "testo della regola nella lista";

/* ============================================================
   1 · LE REGOLE
   Una riga per regola: come la si riconosce nel file, cosa fa detto in
   una frase, e se entra nel conto di un assalto o si gioca altrove. Il
   registro di `rulebook.js` legge questa tabella per non dire piu'
   «si gioca alla dichiarazione della carica» di una regola che adesso
   si gioca davvero.
   ============================================================ */
export const PSYCH_RULES = [
  /* «Fear of Elves» comincia anche lei con «Fear»: senza l'ancora la
     prima riga se la prendeva, e un Orco diventava uno che fa Paura. */
  { id:"fear", re:/^fear\s*(\(.*\))?$/i, melee:true,
    what:"fa Paura: chi è più piccolo tira per caricarla e per colpirla in mischia" },
  { id:"terror", re:/^terror/i, melee:true,
    what:"fa Terrore: chi viene caricato tira o fugge, chi perde contro di lei ha −1 al test di rotta" },
  { id:"frenzy", re:/^frenzy/i, melee:true,
    what:"+1 Attacchi quando carica, passa Paura, Panico e Terrore, deve caricare e non fugge" },
  { id:"bloodFrenzy", re:/^blood frenzy/i,
    where:"diventa frenetica quando la cavalcatura ferisce: il conto dell'assalto non separa le ferite della bestia da quelle del cavaliere" },
  { id:"stupidity", re:/^stupidity/i,
    where:"test all'inizio del turno: la gioca la prima delle sedici caselle" },
  { id:"impetuous", re:/^impetuous/i,
    where:"test alla dichiarazione delle cariche: se fallisce deve caricare" },
  { id:"immune", re:/^immune to psychology/i,
    where:"passa da sola Paura, Panico e Terrore, e non può fuggire come reazione" },
  { id:"coldBlooded", re:/^cold.?blooded/i,
    where:"sui test di Paura, Panico e Terrore tira un dado in più e scarta il maggiore" },
  { id:"warband", re:/^warband/i, melee:true,
    what:"+ bonus di ranghi al Comando, fino a 10, e ritira il tiro di carica" },
  { id:"ignorePanic", re:/^ignore panic/i,
    where:"niente Panico per le unità amiche che non hanno la stessa regola" },
  { id:"ignoreGoblinPanic", re:/^ignore goblin panic/i,
    where:"niente Panico per quello che succede ai Goblin" },
  { id:"fearOfElves", re:/^fear of elves/i,
    where:"gli Elfi le fanno Paura" },
  { id:"quellImpetuosity", re:/^quell impetuosity/i,
    where:"entro 6″ un'unità impetuosa amica ritira il test fallito: il pannello lo ricorda, il ritiro lo tirate voi" },
  { id:"firstCharge", re:/^first charge/i,
    where:"la prima carica riuscita della partita mette il bersaglio in disordine" },
];

export const psychRule = name => PSYCH_RULES.find(r => r.re.test(String(name || "").trim())) || null;

/* I nomi del file diventano bandierine. Nessuna maggioranza qui: e'
   una lettura, e chi ha le regole — l'unita' o il personaggio unito —
   lo decide `psychOf`. */
export function readPsych(names = []){
  const flags = {}, rules = [];
  for (const raw of names || []){
    const name = String(raw || "").trim();
    const r = psychRule(name);
    if (!r || flags[r.id]) continue;
    flags[r.id] = true;
    rules.push({ id: r.id, name, what: r.what || r.where });
  }
  return { flags, rules };
}

/* ============================================================
   2 · IL PROFILO PSICOLOGICO DI UN'UNITA'
   La domanda che le regole fanno non e' «ha la regola?» ma una di tre,
   e il testo le distingue con cura:

   - **la maggioranza** dei modelli: Immune to Psychology, Frenzy per
     passare i test e per non fuggire, Warband per ritirare la carica.
     I personaggi uniti sono quasi sempre meno dei soldati, quindi la
     maggioranza la fanno le regole dell'unita';
   - **almeno un modello**: Frenzy e Impetuous per dover caricare, e la
     Stupidita' che «e' contagiosa»;
   - **l'unita' stessa**: l'immunita' alla Paura e al Terrore, perche'
     «un'unita' che non fa Paura non ne diventa immune quando un
     personaggio che la fa si unisce». Il personaggio pero' la Paura la
     porta: la frase non servirebbe, se l'unita' non la facesse.

   `joined` sono le regole dei personaggi uniti; `now` serve agli
   effetti a tempo — la Stupidita' in cui si e' caduti, la Frenzy presa
   da una ferita — che scadono.
   ============================================================ */
export function psychOf(u, { joined = [], now = null } = {}){
  const own = readPsych((u && u.rules) || []).flags;
  const chars = (joined || []).map(j => readPsych((j && j.rules) || []).flags);
  const any = id => !!own[id] || chars.some(c => c[id]);
  const eff = flagsOf(u, now).flags;
  const name = String((u && u.name) || "");

  const frenzy = (!!own.frenzy || !!eff.frenzy) && !(u && u.frenzyLost);
  return {
    name,
    causesFear:   any("fear") || any("terror"),
    causesTerror: any("terror"),
    immuneFear:   !!own.fear || !!own.terror,
    immuneTerror: !!own.terror,
    frenzy,
    anyFrenzy:    frenzy || chars.some(c => c.frenzy),
    frenzyLost:   !!(u && u.frenzyLost) && (!!own.frenzy || !!eff.frenzy),
    immune:       !!own.immune,
    coldBlooded:  !!own.coldBlooded,
    stupidity:    any("stupidity"),
    stupid:       !!eff.stupid,
    impetuous:    any("impetuous"),
    warband:      !!own.warband,
    ignorePanic:  !!own.ignorePanic,
    ignoreGoblinPanic: !!own.ignoreGoblinPanic,
    fearsElves:   !!own.fearOfElves,
    quell:        !!own.quellImpetuosity,
    firstCharge:  !!own.firstCharge,
    bloodFrenzy:  !!own.bloodFrenzy,
    /* Chi e' un Elfo e chi e' un Goblin lo dice il nome o la fazione:
       il file non ha un campo per la razza. Per i Goblin il testo di
       *Ignore Goblin Panic* vuole un'unita' «fatta tutta di Goblin», e
       un Orco unito la fa smettere di esserlo. */
    /* «Elven Spearmen», «Dark Elves», «High Elf Realms»: la radice
       inglese e' «el-f» o «el-v», e quella italiana «elf» */
    elf:    /\bel(f|ves\b|ven\b)/i.test(name + " " + ((u && u.faction) || "")),
    goblin: /goblin|gobbo/i.test(name) && !/\borc/i.test(name) &&
            !(joined || []).some(j => /\borc/i.test(String((j && j.name) || ""))),
    rules: readPsych([...((u && u.rules) || []), ...(joined || []).flatMap(j => (j && j.rules) || [])]).rules,
  };
}

/* ============================================================
   3 · IL TEST
   Due dadi contro il Comando, e il doppio uno passa sempre: e' la riga
   di `leadershipTest` in `rules.js`, qui con le tre regole che la
   cambiano.

   *Immune to Psychology* e *Frenzy* (a maggioranza) passano da sole la
   Paura, il Panico e il Terrore — non gli altri test: il testo lo dice
   apposta, «non rende immuni a nessun altro test di Comando». Quindi
   la Stupidita' e l'Impetuosita' si tirano comunque.

   *Cold Blooded* tira un dado in piu' sugli stessi tre test e scarta
   il maggiore. Non e' un ritiro: sono tre dadi insieme, e il vassoio
   li mostra tutti e tre.
   ============================================================ */
export const KINDS = {
  fear:       { id:"paura",     label:"test di Paura",      psych:true },
  terror:     { id:"terrore",   label:"test di Terrore",    psych:true },
  panic:      { id:"panico",    label:"test di Panico",     psych:true },
  stupidity:  { id:"stupidita", label:"test di Stupidità",  psych:false },
  impetuous:  { id:"impeto",    label:"test di Impetuosità", psych:false },
  /* Il raduno non e' un test di psicologia — nessuna immunita' lo
     salta, il sangue freddo non ci tira tre dadi — ma e' un test di
     Comando come gli altri, e fino a qui non esisteva: chi fuggiva lo
     tirava dal pulsante generico, senza i due modificatori che lo
     decidono quasi sempre. */
  rally:      { id:"raduno",    label:"test di Raduno",     psych:false },
};
const kindOf = k => KINDS[k] || { id:"comando", label:"test di Comando", psych:false };

export function autoPass(kind, p = {}){
  if (!kindOf(kind).psych) return { auto:false, why:"" };
  if (p.immune) return { auto:true, why:"Immune to Psychology: passa senza tirare" };
  if (p.frenzy) return { auto:true, why:"Frenzy: passa senza tirare" };
  return { auto:false, why:"" };
}
export const coldDice = (kind, p = {}) => !!(p.coldBlooded && kindOf(kind).psych);

/* La richiesta per il vassoio, nella forma che il motore conosce. Vuota
   quando il test passa da solo: non si fanno rotolare dadi che non
   decidono niente. */
export function testDice(kind, p = {}){
  if (autoPass(kind, p).auto) return [];
  const k = kindOf(kind);
  const cold = coldDice(kind, p);
  return [{
    id: k.id, kind:"d6", n: cold ? 3 : 2, why: k.label,
    ...(cold ? { keep: 2, drop: "highest", coldBlooded: true,
                 foot: "Cold Blooded: tre dadi, si scarta il maggiore." } : {}),
  }];
}

/* Quali facce contano. Con Cold Blooded i due minori; senza, i primi
   due. Sta scritta una volta, e il vassoio e il test la leggono dallo
   stesso posto. */
export function keptDice(dice = [], cold = false){
  const d = (dice || []).map(v => +v || 0);
  if (cold && d.length >= 3) return d.slice().sort((a, b) => a - b).slice(0, 2);
  return d.slice(0, 2);
}

export function psychTest({ kind = "", ld = 0, ldMod = 0, dice = [], p = {} } = {}){
  const k = kindOf(kind);
  const ap = autoPass(kind, p);
  const target = Math.max(2, (+ld || 0) + (+ldMod || 0));
  if (ap.auto)
    return { kind, label: k.label, auto:true, passed:true, dice:[], kept:[], total:0, target,
             insane:false, text: ap.why };
  const cold = coldDice(kind, p);
  const kept = keptDice(dice, cold);
  const total = kept.reduce((s, v) => s + v, 0);
  const insane = kept.length === 2 && kept[0] === 1 && kept[1] === 1;
  const passed = insane || total <= target;
  const faces = (dice || []).join(" + ");
  return {
    kind, label: k.label, auto:false, passed, dice: [...(dice || [])], kept, total, target, insane,
    cold,
    text: "Comando " + target + ", " +
          (cold ? faces + " (Cold Blooded: tengo " + kept.join(" + ") + ")" : faces) +
          " = " + total + (insane ? ", doppio uno" : "") +
          " → " + (passed ? "passato" : "fallito"),
  };
}

/* ============================================================
   4 · IL COMANDO DI UNA WARBAND
   «Salvo che stia fuggendo, una Warband somma al Comando il suo bonus
   di ranghi attuale, fino a Comando 10» — ma non quando fa il test di
   trattenuta, e non quando e' impetuosa e tira per sapere se deve
   caricare. Sono diciotto unita' nelle liste salvate, e ognuna faceva
   test di rotta e di Panico con due o tre punti di Comando di meno.
   ============================================================ */
export const LD_CAP = 10;

export function leadershipOf(ld, p = {}, { rankBonus = 0, fleeing = false,
                                          forImpetuous = false, restraint = false } = {}){
  const base = +ld || 0;
  const rb = Math.max(0, +rankBonus || 0);
  if (!p.warband || !rb || fleeing || forImpetuous || restraint || base >= LD_CAP)
    return { base, value: base, mods: [],
             why: p.warband && (fleeing || forImpetuous || restraint)
               ? "Warband: il bonus di ranghi qui non vale" : "" };
  const value = Math.min(LD_CAP, base + rb);
  return { base, value, mods: [{ from:"Warband", delta: value - base }],
           why: "Comando " + value + " (" + base + " base, +" + (value - base) + " Warband" +
                (base + rb > LD_CAP ? ", fino a 10" : "") + ")" };
}

/* ============================================================
   5 · LA PAURA
   Due momenti, stesse due condizioni: il nemico fa Paura **e** ha una
   Forza d'Unita' piu' alta.

   - Chi vuole caricarlo tira prima di dichiarare. Se fallisce non
     carica: non si muove e conta come una carica fallita.
   - Chi ci e' in combattimento tira quando il suo combattimento viene
     scelto. Se fallisce, chi dirige gli attacchi su di lui ha −1 per
     colpire.

   Un solo test di Paura per turno. Chi fa Paura e' immune alla Paura —
   ma chi fa solo Paura teme chi fa Terrore.
   ============================================================ */
export const FEAR_FAIL = {
  charge: "non carica: resta ferma, ed è una carica fallita",
  combat: "−1 per colpire contro chi fa Paura",
};
export const FEAR_TO_HIT = -1;

export function fearCheck({ me = {}, foe = {}, meUS = 0, foeUS = 0, when = "charge",
                            tested = null, foeName = "" } = {}){
  const who = foeName || foe.name || "il nemico";
  const causes = foe.causesFear || foe.causesTerror || (me.fearsElves && foe.elf);
  if (!causes) return { must:false, why:"" };
  const elves = !foe.causesFear && !foe.causesTerror;
  /* chi fa Paura teme lo stesso chi fa Terrore */
  const immune = me.immuneFear && !(foe.causesTerror && !me.immuneTerror) && !elves;
  if (immune) return { must:false, why:"fa Paura anche lei: non teme " + who };
  if (!((+foeUS || 0) > (+meUS || 0)))
    return { must:false, why: who + " fa Paura, ma con Forza d'Unità " + foeUS + " contro " + meUS + " non è più grossa" };
  if (tested)
    return { must:false, already:true, passed: !!tested.passed,
             why: "un test di Paura per turno: vale quello di prima (" + (tested.passed ? "passato" : "fallito") + ")" };
  const ap = autoPass("fear", me);
  return {
    must:true, auto: ap.auto, autoWhy: ap.why, when,
    fail: FEAR_FAIL[when] || "",
    why: who + (elves ? " è elfica e le fa Paura (Fear of Elves)" : " fa Paura") +
         " ed è più grossa: Forza d'Unità " + foeUS + " contro " + meUS,
  };
}

/* ============================================================
   6 · IL TERRORE
   Quando chi fa Terrore dichiara una carica, il bersaglio tira subito:
   se fallisce **deve fuggire**, se passa sceglie la reazione come
   sempre. Chi non puo' scegliere la fuga non tira nemmeno — e' la riga
   in fondo al testo, e toglie il test proprio a chi sarebbe passato da
   solo (immuni e frenetici non fuggono).

   E a fine assalto: se fra i vincitori c'e' chi fa Terrore, chi perde
   ha −1 al Comando nel test di rotta.
   ============================================================ */
export const TERROR_BREAK_MOD = -1;
/* Il testo non dice se chi fa Terrore a sua volta sconti quel −1: dice
   che chi fa Terrore «e' immune al Terrore», e il −1 sta dentro la
   regola del Terrore. Qui lo si legge cosi', e lo si dichiara. */
export const TERROR_MOD_SPARES_TERROR = true;
export const TERROR_MOD_DA_VERIFICARE = true;

export function canFleeReaction(p = {}){
  if (p.immune) return { can:false, why:"Immune to Psychology: non può scegliere la fuga" };
  if (p.frenzy) return { can:false, why:"Frenzy: non può scegliere la fuga" };
  if (p.stupid) return { can:false, why:"è in preda alla Stupidità: deve tenere la posizione", hold:true };
  return { can:true, why:"" };
}

export function terrorCheck({ charger = {}, target = {}, canFlee = true, chargerName = "" } = {}){
  const who = chargerName || charger.name || "chi carica";
  if (!charger.causesTerror) return { must:false, why:"" };
  if (target.immuneTerror) return { must:false, why:"fa Terrore anche lei: non teme " + who };
  if (!canFlee) return { must:false, why: who + " fa Terrore, ma chi non può fuggire non fa il test" };
  const ap = autoPass("terror", target);
  return { must:true, auto: ap.auto, autoWhy: ap.why,
           fail:"deve fuggire", why: who + " fa Terrore e dichiara la carica" };
}

export function terrorBreakMod({ winners = [], loser = {} } = {}){
  const scary = (winners || []).filter(w => w && w.causesTerror);
  if (!scary.length) return { mod: 0, why: "" };
  if (TERROR_MOD_SPARES_TERROR && loser.immuneTerror)
    return { mod: 0, why: "fa Terrore anche lei: niente −1 (da verificare)", daVerificare: true };
  return { mod: TERROR_BREAK_MOD, why: "−1 Terrore (" + scary.map(s => s.name).filter(Boolean).join(", ") + ")" };
}

/* ============================================================
   7 · IL PANICO
   Quattro cause. La prima — un quarto della Forza d'Unita' perso al
   tiro — la conta `shoot.js` dalla Tappa 4. Le altre tre sono misure:
   un'unita' amica distrutta entro 6″, un'unita' amica che rompe e
   fugge dal combattimento entro 6″, un'unita' amica in fuga che ti
   passa attraverso. I 6″ vengono dal testo di *Ignore Panic*, che
   nomina le tre cause per esenzione.

   Quello che il testo delle liste non dice, e che qui e' dichiarato
   invece di preso in prestito:
   ============================================================ */
export const PANIC_RANGE = 6;
/* chi sta gia' fuggendo non ha dove scappare di piu' */
export const PANIC_SKIP_FLEEING = true;
/* chi e' in combattimento non tira il Panico per gli altri */
export const PANIC_SKIP_ENGAGED = true;
/* chi fallisce fugge, lontano da quello che lo ha causato */
export const PANIC_FAIL = "flee";
export const PANIC_DA_VERIFICARE = { engaged: true, fail: true };

export const PANIC_CAUSES = {
  casualties:  { id:"casualties",  label:"più di un quarto perso",          page: PAGE.panicShooting },
  destroyed:   { id:"destroyed",   label:"unità amica distrutta entro 6″",  page: PAGE.panic, range:true },
  broke:       { id:"broke",       label:"unità amica in rotta entro 6″",   page: PAGE.panic, range:true },
  fledThrough: { id:"fledThrough", label:"attraversata da un'unità amica in fuga", page: PAGE.panic },
};

export function panicCheck({ cause = "destroyed", me = {}, source = null, dist = 0,
                             fleeing = false, engaged = false, sourceName = "" } = {}){
  const c = PANIC_CAUSES[cause] || PANIC_CAUSES.destroyed;
  const src = sourceName || (source && source.name) || "";
  const base = { cause: c.id, label: c.label, page: c.page };
  if (fleeing && PANIC_SKIP_FLEEING) return { ...base, must:false, why:"sta già fuggendo" };
  if (engaged && PANIC_SKIP_ENGAGED && c.id !== "casualties")
    return { ...base, must:false, why:"è in combattimento (da verificare)", daVerificare:true };
  if (c.range && (+dist || 0) > PANIC_RANGE)
    return { ...base, must:false, why: "a " + r1(dist) + "″: oltre i 6″" };
  if (source && c.id !== "casualties"){
    if (me.ignorePanic && !source.ignorePanic)
      return { ...base, must:false, why:"Ignore Panic: " + (src || "quella unità") + " non ha la stessa regola" };
    if (me.ignoreGoblinPanic && source.goblin)
      return { ...base, must:false, why:"Ignore Goblin Panic: " + (src || "sono Goblin") };
  }
  const ap = autoPass("panic", me);
  return {
    ...base, must:true, auto: ap.auto, autoWhy: ap.why, fail: "fugge",
    why: c.label + (src ? " (" + src + (c.range ? ", " + r1(dist) + "″" : "") + ")" : ""),
  };
}

/* Tutti quelli che una stessa cosa manda al Panico, in un colpo. Entra
   l'elenco degli amici con la distanza gia' misurata: la geometria la
   sa il tavolo, qui si decide solo chi tira e chi no — e chi no lo
   dice, perche' «perche' quello non ha tirato?» e' la domanda che si
   fa sempre. */
export function panicAround({ cause = "destroyed", source = null, friends = [] } = {}){
  const tests = [], spared = [];
  for (const f of friends || []){
    const chk = panicCheck({ cause, me: f.p || {}, source, dist: f.dist,
                             fleeing: !!f.fleeing, engaged: !!f.engaged });
    (chk.must ? tests : spared).push({ ...f, check: chk });
  }
  return { tests, spared };
}

/* ============================================================
   8 · LA STUPIDITA'
   All'inizio di ogni proprio turno, salvo che fugga o sia in
   combattimento, l'unita' tira. Se fallisce ci resta fino al proprio
   inizio di turno successivo, e intanto: non si muove (salvo fuggire),
   non tira e non lancia incantesimi, non tenta il dissolvimento da
   mago, e se viene caricata deve tenere la posizione.
   ============================================================ */
export const STUPID_LIMITS = [
  "non si muove, salvo fuggire",
  "non tira e non lancia incantesimi",
  "non tenta il dissolvimento da mago",
  "se caricata, deve tenere la posizione",
];

export function stupidityCheck({ p = {}, fleeing = false, engaged = false } = {}){
  if (!p.stupidity) return { must:false, why:"" };
  if (fleeing) return { must:false, why:"sta fuggendo: niente test di Stupidità" };
  if (engaged) return { must:false, why:"è in combattimento: niente test di Stupidità" };
  return { must:true, why:"Stupidità: test all'inizio del turno" };
}

/* L'effetto, nella forma di `effects.js`: scade al proprio inizio di
   turno successivo, che e' esattamente dove si rifa' il test. */
export function stupidEffect(now = {}){
  return { id:"stupidity", from:"Stupidità", flags:{ stupid:true },
           until:"ownTurn", at:{ turn: now.turn || 1, side: now.side || "A" } };
}

/* ============================================================
   9 · FRENZY E IMPETUOSITA'
   Frenzy: +1 Attacchi nel turno in cui carica e nel turno dopo un
   inseguimento; se puo' dichiarare una carica deve farlo; chi perde un
   round di combattimento la perde. Blood Frenzy la ridà.

   Impetuous: se puo' dichiarare una carica tira il Comando — senza il
   bonus della Warband — e se fallisce deve caricare. Chi e' gia'
   frenetico non tira: deve caricare comunque.
   ============================================================ */
export function frenzyBonus({ p = {}, chargedThisTurn = false, followedUpLastTurn = false } = {}){
  if (!p.frenzy) return { a: 0, why: "" };
  if (chargedThisTurn) return { a: 1, why: "Frenzy: +1 Attacchi nel turno in cui carica" };
  if (followedUpLastTurn) return { a: 1, why: "Frenzy: +1 Attacchi nel turno dopo l'inseguimento" };
  return { a: 0, why: "Frenzy: il +1 vale solo caricando o dopo un inseguimento" };
}

export function mustCharge({ p = {}, canDeclare = true } = {}){
  if (!canDeclare) return { must:false, test:false, why:"" };
  if (p.anyFrenzy) return { must:true, test:false, why:"Frenzy: se può dichiarare una carica, deve" };
  if (p.impetuous) return { must:false, test:true,
    why:"Impetuous: test di Comando senza il bonus della Warband; se fallisce deve caricare" +
        (p.quellNear ? " (entro 6″ da Quell Impetuosity: il test fallito si ritira)" : "") };
  return { must:false, test:false, why:"" };
}

/* «Ogni modello che perde un round di combattimento perde subito
   questa regola.» Torna vero quando c'era qualcosa da perdere. */
export const losesFrenzy = (p = {}) => !!p.frenzy;

/* ============================================================
   10 · I PROMEMORIA
   Le due caselle in cui la psicologia si dimentica: l'inizio del turno
   (la Stupidita') e la dichiarazione delle cariche (chi deve caricare
   e chi tira per saperlo). Entra l'elenco delle unita' del giocatore
   di turno con il loro profilo; esce una riga per casella, o niente.
   ============================================================ */
export function reminders(step, units = []){
  const rows = (units || []).filter(x => x && x.p);
  if (step === 0){
    const s = rows.filter(x => stupidityCheck({ p: x.p, fleeing: x.fleeing, engaged: x.engaged }).must);
    return s.length ? "Da tirare adesso: Stupidità per " + s.map(x => x.name).join(", ") + "." : "";
  }
  if (step === 4){
    const must = rows.filter(x => !x.fleeing && !x.engaged && x.p.anyFrenzy);
    const test = rows.filter(x => !x.fleeing && !x.engaged && !x.p.anyFrenzy && x.p.impetuous);
    const bits = [];
    if (must.length) bits.push("devono caricare se possono (Frenzy): " + must.map(x => x.name).join(", "));
    if (test.length) bits.push("tirano per sapere se devono caricare (Impetuous): " + test.map(x => x.name).join(", "));
    return bits.length ? bits.join("; ") + "." : "";
  }
  return "";
}

/* ============================================================
   11 · GLI ASCOLTATORI
   Le regole che il motore chiama da solo quando passa un test di
   psicologia. Non decidono l'esito — quello lo scrive chi tira, con i
   dadi che si sono visti — ma lasciano nella traccia della riga di
   registro **perche'** i dadi erano tre, o perche' non ce n'erano.
   ============================================================ */
export const HOOKS = [
  { moment:"onPsych", id:"psych-auto", from:"Immune to Psychology / Frenzy",
    fn: ctx => { const a = ctx.action || {}; if (a.auto) ctx.set("autoPass", true, a.autoWhy || "passa senza tirare"); } },
  { moment:"onPanic", id:"panic-auto", from:"Immune to Psychology / Frenzy",
    fn: ctx => { const a = ctx.action || {}; if (a.auto) ctx.set("autoPass", true, a.autoWhy || "passa senza tirare"); } },
  { moment:"onPsych", id:"psych-cold", from:"Cold Blooded",
    fn: ctx => { const a = ctx.action || {}; if (a.ask && a.ask.some(q => q.coldBlooded)) ctx.set("coldBlooded", true, "Cold Blooded: tre dadi, si scarta il maggiore"); } },
  { moment:"onPanic", id:"panic-cold", from:"Cold Blooded",
    fn: ctx => { const a = ctx.action || {}; if (a.ask && a.ask.some(q => q.coldBlooded)) ctx.set("coldBlooded", true, "Cold Blooded: tre dadi, si scarta il maggiore"); } },
];

const r1 = n => Math.round((+n || 0) * 10) / 10;

/* ============================================================
   12 · IL RADUNO (p. 117)
   La quarta sotto-fase della Strategia, e l'unica regola di questo
   file che mancava del tutto: chi fugge tira per fermarsi, e fino a
   qui il tavolo lo faceva con il pulsante del test di Comando
   generico — cioe' senza i due modificatori che decidono quasi ogni
   raduno, e senza il musico.

   Il test e' un normale test di Comando, con addosso le «perdite
   insostenibili»:

     sotto META' dei modelli di partenza ......... −1 al Comando
     sotto UN QUARTO ............................. passa solo con il
                                                   doppio uno naturale

   e il musico che suona la carica al contrario: +1 al Comando, fino a
   10 (p. 201, *Steadying Rhythm*). Quello che succede dopo — riforma
   gratis, niente carica in questo turno, conta come mossa per il tiro
   — non e' un tiro e sta scritto qui accanto perche' chi arbitra lo
   deve ricordare.
   ============================================================ */
export const RALLY_HALF = 0.5;          // sotto meta': -1
export const RALLY_QUARTER = 0.25;      // sotto un quarto: solo doppio uno
export const RALLY_MUSICIAN = 1;        // Steadying Rhythm, fino a Comando 10

/* Quanto vale il Comando di chi prova a radunarsi, e perche'. Entra
   quanti ne restano e quanti erano; esce il numero con la traccia. */
export function rallyLeadership(ld, { models = 0, start = 0, musician = false } = {}){
  const vivi = Math.max(0, Math.round(+models || 0));
  const inizio = Math.max(0, Math.round(+start || 0));
  const quota = inizio > 0 ? vivi / inizio : 1;
  const why = [];
  let value = Math.max(0, +ld || 0);
  const hopeless = inizio > 0 && quota < RALLY_QUARTER;
  if (inizio > 0 && quota < RALLY_HALF && !hopeless){
    value -= 1;
    why.push("sotto metà dei modelli di partenza: −1");
  }
  if (musician){
    const prima = value;
    value = Math.min(LD_CAP, value + RALLY_MUSICIAN);
    if (value > prima) why.push("il musico suona il raduno: +1 (p. " + PAGE.musician + ")");
  }
  return {
    value: Math.max(0, value), base: +ld || 0, quota, hopeless,
    why: hopeless
      ? ["sotto un quarto dei modelli di partenza: si raduna solo con il doppio uno", ...why]
      : why,
    page: PAGE.rally,
  };
}

/* La richiesta per il vassoio: due dadi, sempre. Anche chi e' sotto un
   quarto tira — deve poter uscire il doppio uno. */
export const rallyDice = () => [{ id:"raduno", kind:"d6", n:2, why:"test di Raduno" }];

export function rallyTest({ ld = 0, dice = [], models = 0, start = 0, musician = false } = {}){
  const lead = rallyLeadership(ld, { models, start, musician });
  const faces = (dice || []).map(v => +v || 0).slice(0, 2);
  const total = faces.reduce((s, v) => s + v, 0);
  const insane = faces.length === 2 && faces[0] === 1 && faces[1] === 1;
  const passed = insane || (!lead.hopeless && faces.length === 2 && total <= lead.value);
  return {
    kind:"rally", label:"test di Raduno", passed, dice: faces, total,
    target: lead.value, insane, hopeless: lead.hopeless, why: lead.why, page: PAGE.rally,
    text: (lead.hopeless
            ? "sotto un quarto dei modelli: solo il doppio uno la ferma — " + faces.join(" + ") + " = " + total
            : "Comando " + lead.value + (lead.why.length ? " (" + lead.why.join("; ") + ")" : "") +
              ", " + faces.join(" + ") + " = " + total) +
          (insane ? ", doppio uno" : "") +
          " → " + (passed ? "si raduna" : "continua a fuggire"),
    /* quello che il raduno concede e toglie, e che non e' un tiro */
    then: passed
      ? "riforma gratis (p. 125); non può caricare in questo turno e conta come mossa per il tiro"
      : "continua a fuggire nella fase di movimento (p. 132)",
  };
}
