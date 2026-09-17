/* Schieramento Old World — la magia (Core Rulebook, pp. 106-111 e 319-335)
 *
 * La Tappa 6 del piano, e la prima scritta con il libro aperto invece che
 * con il riassunto: i manuali stanno in Desktop/Warhammer, e le cinque
 * pagine della magia e le diciassette dei domini sono state lette li'.
 *
 * Il ciclo e' quello del libro, in quattro passi che al tavolo si
 * sbagliano sempre nello stesso punto — il momento:
 *
 *   1. prima dello schieramento si GENERANO gli incantesimi: tanti D6
 *      quanti il Livello, i doppioni si ritirano, e uno si puo' scambiare
 *      con la firma del dominio (p. 106) o con un incantesimo del dominio
 *      d'esercito, quando la regola del mago lo concede;
 *   2. ogni tipo si LANCIA in una casella sola: potenziamenti e
 *      maledizioni nella congiurazione, trasporti nelle mosse restanti,
 *      dardi e vortici nel tiro, assalti nella mischia (p. 108);
 *   3. il TIRO DI LANCIO e' 2D6 piu' il Livello contro il valore di
 *      lancio; il doppio 6 naturale e' l'invocazione perfetta, che non si
 *      dissolve, e il doppio 1 e' il fiasco, con la sua tabella (p. 109);
 *   4. chi subisce puo' DISSOLVERE: con un mago entro 18 o 24 pollici, o
 *      affidandosi alla sorte una volta per turno. Il doppio 6 slega
 *      comunque, il doppio 1 di un mago lo fa surclassare (p. 110).
 *
 * Qui dentro non ci sono dadi tirati, stato o DOM: entrano facce gia'
 * uscite, livelli e distanze, escono esiti con la traccia di come sono
 * venuti. Come `charge.js`, `melee.js`, `shoot.js` e `psych.js`.
 */

export const PAGE = {
  generation: 106, categories: 107, casting: 108, miscast: 109,
  bound: 109, dispel: 110, resolution: 111, armour: 111, lores: 319,
};

/* ============================================================
   1 · I DATI
   Stanno in `dati/magia/domini.json`, fuori dal codice come i file
   d'esercito: gli incantesimi sono dati, e un dominio nuovo e' un
   blocco di righe, non un modulo.
   ============================================================ */
let cached = null;
export async function loadMagic(url = "dati/magia/domini.json"){
  if (cached) return cached;
  try { cached = makeMagic(await (await fetch(url)).json()); }
  catch { cached = makeMagic(null); }
  return cached;
}
export const magicNow = () => cached;
export const useMagic = m => { cached = m || null; return cached; };

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function makeMagic(doc){
  const d = doc || {};
  const lores = (d.domini || []).map(l => ({ ...l, spells: (l.spells || []).map(s => ({ ...s, lore: l.id })) }));
  const grafts = (d.innesti || []).map(g => ({ ...g, spells: (g.spells || []).map(s => ({ ...s, lore: g.id, graft: true })) }));
  const bound = (d.vincolati || []).map(s => ({ ...s, bound: true }));
  const all = [...lores.flatMap(l => l.spells), ...grafts.flatMap(g => g.spells), ...bound];
  const types = d.tipi || {};

  const lore = key => {
    const k = norm(key);
    return lores.find(l => [l.id, l.name, l.label].some(x => norm(x) === k)) || null;
  };
  const spell = id => all.find(s => s.id === id) || all.find(s => norm(s.name) === norm(id)) || null;
  /* Gli innesti li concede una regola del mago: «Lore of Gork», «Lore
     Of Lustria». Si confrontano con le regole dell'unita'. */
  const graftsFor = (rules = []) => grafts.filter(g => (rules || []).some(r => norm(r) === norm(g.regola)));
  const boundFor = (rules = []) => bound.filter(b => (rules || []).some(r => norm(r) === norm(b.regola)));
  /* La scheda del mago sul libro, dal nome dell'unita'. Serve perche' il
     file di New Recruit non dice ne' il Livello ne' i domini fra cui si
     sceglie — e i Night Goblin Oddnob delle liste salvate non portano
     nemmeno la regola «Lore of Mork», che sul libro c'e'. */
  const wizards = d.maghi || [];
  const wizardBook = u => wizards.find(w => (w.nomi || []).some(n => norm(n) === norm(u && u.name))) || null;

  return { ok: !!doc, lores, grafts, bound, types, all, lore, spell, graftsFor, boundFor, wizards, wizardBook,
           type: t => types[t] || { label: t, casella: "", bersaglio: "" } };
}

/* ============================================================
   2 · IL MAGO
   Il file di New Recruit non dice il Livello ne' il dominio scelto: li
   dice la scheda di preparazione (§3.2 del piano). Quando il nome di una
   regola lo porta — «Level 2 Wizard», «Wizard (3)» — si legge da li'.
   ============================================================ */
export function levelOf(u = {}, prep = {}){
  if (prep && +prep.level > 0) return Math.min(4, +prep.level);
  for (const r of (u && u.rules) || []){
    const m = /level\s*(\d)\s*wizard|wizard\s*\(?\s*(?:level\s*)?(\d)\s*\)?/i.exec(String(r));
    if (m) return Math.min(4, +(m[1] || m[2]));
  }
  return 0;
}
export const isWizard = (u = {}, prep = {}) =>
  levelOf(u, prep) > 0 || !!(prep && (prep.lore || (prep.spellIds || []).length)) ||
  ((u && u.rules) || []).some(r => /\bwizard\b|^lore of/i.test(String(r)));

/* La gittata del dissolvimento dipende dal Livello (p. 110). */
export const dispelRange = level => (+level || 0) >= 3 ? 24 : 18;

/* ------------------------------------------------------------------
   Fin dove arriva la magia di questo pezzo.

   La gittata di un incantesimo e' scritta nell'incantesimo, e fin qui
   la si scopriva solo premendo «mira»: sul tavolo i cerchi di portata
   erano quelli delle armi, e un Bastiladon con il Solar Engine —
   ventiquattro pollici di raggio — mostrava gli otto del suo
   giavellotto. Cioe' il numero sbagliato, proprio a chi stava
   decidendo dove metterlo.

   Qui la gittata torna a essere una proprieta' del **profilo**: entra
   l'elenco degli incantesimi che quel pezzo puo' lanciare — quelli
   generati e quelli vincolati alle sue regole — ed esce il piu'
   lungo, con il nome di chi ce lo porta.

   «self», «mischia» e i vortici non hanno una portata da disegnare e
   restano fuori: un cerchio da zero pollici non dice niente a nessuno.
   ------------------------------------------------------------------ */
export const rangeOf = s => (s && typeof s.range === "number" && s.range > 0) ? s.range : 0;

export function magicRange(spells = []){
  let best = null;
  for (const s of spells || []){
    const r = rangeOf(s);
    if (r > 0 && (!best || r > best.range)) best = { range: r, name: s.name, type: s.type, id: s.id };
  }
  return best;
}

/* ============================================================
   3 · GENERARE GLI INCANTESIMI (p. 106)
   Tanti D6 quanti il Livello, e i doppioni si ritirano. `dice` sono le
   facce uscite nell'ordine: se ne servono di piu' perche' c'e' stato un
   doppione, `need` dice quante altre tirarne.
   ============================================================ */
export function generateSpells({ level = 1, dice = [] } = {}){
  const want = Math.max(0, Math.min(6, +level || 0));
  const got = [], rerolled = [];
  for (const raw of dice || []){
    if (got.length >= want) break;
    const v = +raw;
    if (!(v >= 1 && v <= 6)) continue;
    if (got.includes(v)) { rerolled.push(v); continue; }
    got.push(v);
  }
  return { numbers: got, rerolled, need: Math.max(0, want - got.length), done: got.length >= want };
}

/* Con cosa si puo' scambiare uno degli incantesimi generati: la firma
   del dominio (p. 106), e gli incantesimi dei domini d'esercito quando la
   regola del mago li concede — «may select instead either the signature
   spell of their chosen Lore of Magic, or one of the spells listed». */
export function swapOptions(magic, loreId, rules = []){
  const l = magic && magic.lore(loreId);
  const out = [];
  if (l){ const sig = l.spells.find(s => s.n === 0); if (sig) out.push(sig); }
  if (magic) for (const g of magic.graftsFor(rules)) out.push(...g.spells);
  return out;
}

/* Gli incantesimi che un mago conosce, dai numeri usciti e dagli
   scambi. Nessun mago conosce due volte lo stesso (p. 319). */
export function knownSpells(magic, loreId, numbers = [], swaps = []){
  const l = magic && magic.lore(loreId);
  if (!l) return [];
  const list = numbers.map(n => l.spells.find(s => s.n === +n)).filter(Boolean);
  for (const { out, into } of swaps || []){
    const i = list.findIndex(s => s.id === out);
    const inc = magic.spell(into);
    if (i >= 0 && inc && !list.some(s => s.id === inc.id)) list[i] = inc;
  }
  return list;
}

/* ============================================================
   4 · QUANDO SI LANCIA (p. 108)
   Il tipo decide la casella. Il motore non impedisce: dice dove il
   libro lo mette, e chi gioca lancia lo stesso se ha deciso cosi'.
   ============================================================ */
export const CAST_STEP = {
  enchantment: "conjuration", hex: "conjuration",
  conveyance: "remaining",
  missile: "shooting", vortex: "shooting",
  assailment: "combat",
};
export const TYPE_LABEL = {
  enchantment: "Potenziamento", hex: "Maledizione", conveyance: "Trasporto",
  missile: "Dardo magico", vortex: "Vortice", assailment: "Assalto",
};

/* `phaseId` e `stepId` sono quelli di `phases.js`. I dardi e i vortici
   si lanciano «quando il mago viene scelto nella fase di tiro», gli
   assalti «quando il mago combatte»: la fase basta, la casella precisa
   la sceglie chi gioca. */
export function whenOk(type, { stepId = "", phaseId = "" } = {}){
  const want = CAST_STEP[type];
  if (!want) return { ok: true, want: "" };
  const ok = want === stepId || want === phaseId;
  return { ok, want };
}

/* Chi puo' lanciare adesso, e perche' no. Tre regole di p. 108: ogni
   incantesimo una volta per turno, chi fugge non lancia, chi e' in
   combattimento lancia solo gli assalti e quelli con gittata «self».
   E una del fiasco: dopo un 8-12 sulla tabella non si lancia piu'
   niente per il resto del turno (p. 109). */
export function canCast(spell, { fleeing = false, engaged = false, castThisTurn = [], stopped = false,
                                  stepId = "", phaseId = "", armoured = false, stupid = false } = {}){
  const why = [];
  if (!spell) return { can: false, why: ["incantesimo sconosciuto"] };
  if (fleeing) why.push("chi fugge non lancia (p. 108)");
  /* La Stupidita' ferma anche la magia. Il tiro e la carica lo
     sapevano da una tappa, il lancio no: un Troll in preda alla
     Stupidita' continuava a lanciare incantesimi come se niente
     fosse, perche' nessuno aveva mai passato il dato fin qui. */
  if (stupid) why.push("è in preda alla Stupidità: non lancia incantesimi");
  if (engaged && spell.type !== "assailment" && spell.range !== "self")
    why.push("in combattimento si lanciano solo gli assalti e gli incantesimi «self» (p. 108)");
  if (!engaged && spell.type === "assailment") why.push("un assalto si lancia solo in combattimento (p. 107)");
  if ((castThisTurn || []).includes(spell.id)) why.push("ogni incantesimo si tenta una volta per turno (p. 108)");
  if (stopped) why.push("dopo il fiasco non si lanciano altri incantesimi in questo turno (p. 109)");
  if (armoured && !spell.bound) why.push("un mago con armatura o scudo non tira ne' lancio ne' dissolvimento (p. 111)");
  const w = whenOk(spell.type, { stepId, phaseId });
  if (!w.ok) why.push(TYPE_LABEL[spell.type] + ": si lancia " + WHEN_TEXT[w.want]);
  return { can: why.length === 0, why };
}
const WHEN_TEXT = {
  conjuration: "nella congiurazione della fase di strategia",
  remaining: "nelle mosse restanti",
  shooting: "nella fase di tiro",
  combat: "nella fase di corpo a corpo",
};

/* Il bersaglio (p. 108): nell'arco di vista del mago, entro gittata, non
   in combattimento — salvo che l'incantesimo dica il contrario. I dardi
   vogliono anche la linea di vista (p. 107), gli assalti un nemico con
   cui si combatte. `friendly` e' «il bersaglio e' dei miei». */
export function targetCheck(spell, { dist = 0, inArc = true, engaged = false, friendly = false,
                                      sight = true, touching = false } = {}){
  const why = [];
  if (!spell) return { ok: false, why: ["incantesimo sconosciuto"] };
  const t = spell.type;
  if (spell.range === "self") return { ok: true, why: [] };
  if (t === "vortex") return { ok: true, why: [] };
  if (t === "assailment"){
    if (friendly) why.push("un assalto colpisce solo un nemico");
    if (!touching) why.push("un assalto colpisce solo chi combatte con il mago");
    return { ok: why.length === 0, why };
  }
  const wantsFriend = t === "enchantment" || t === "conveyance";
  if (wantsFriend && !friendly) why.push(TYPE_LABEL[t] + ": solo unità amiche (p. 107)");
  if (!wantsFriend && friendly) why.push(TYPE_LABEL[t] + ": solo unità nemiche (p. 107)");
  if (!inArc) why.push("fuori dall'arco di vista del mago (p. 108)");
  if (typeof spell.range === "number" && dist > spell.range + 1e-6)
    why.push("fuori gittata: " + Math.round(dist * 10) / 10 + "″ contro " + spell.range + "″");
  if (engaged && !spell.engaged) why.push("non si bersaglia un'unità in combattimento (p. 108)");
  if (t === "missile" && !sight) why.push("un dardo magico vuole la linea di vista (p. 107)");
  return { ok: why.length === 0, why };
}

/* ============================================================
   5 · IL TIRO DI LANCIO (pp. 108-109)
   2D6 piu' il Livello contro il valore di lancio. Il doppio 6 naturale
   lancia comunque e non si dissolve; il doppio 1 naturale e' il fiasco,
   qualunque sia il risultato. Un incantesimo vincolato somma il suo
   Livello di Potere e non ha ne' fiasco ne' invocazione perfetta.

   `mod` sono i modificatori al tiro (la Magic Resistance del bersaglio,
   Mob Rule, Syphoned Strength); `cvUp` quelli al valore di lancio (il
   Drain Magic dell'avversario, +2).
   ============================================================ */
export function castResult({ dice = [], level = 0, cv = 0, cv2 = 0, mod = 0, cvUp = 0,
                              bound = false, power = 0 } = {}){
  const faces = (dice || []).slice(0, 2).map(v => +v || 0);
  const natural = faces.reduce((s, v) => s + v, 0);
  const add = bound ? (+power || 0) : (+level || 0);
  const total = natural + add + (+mod || 0);
  const value = (+cv || 0) + (+cvUp || 0);
  const double = faces.length === 2 && faces[0] === faces[1];
  const perfect = !bound && double && faces[0] === 6;
  const miscast = !bound && double && faces[0] === 1;
  const cast = perfect || (!miscast && total >= value);
  const tier2 = cast && cv2 ? total >= cv2 + (+cvUp || 0) : false;
  const bits = [faces.join(" + ") + (add ? " + " + add + (bound ? " di Potere" : " di Livello") : "") +
                (mod ? (mod > 0 ? " + " : " − ") + Math.abs(mod) : "") + " = " + total];
  return {
    faces, natural, total, value, cast, perfect, miscast, bound: !!bound, tier2,
    text: "lancio " + bits[0] + " contro " + value + "+" +
          (perfect ? " — invocazione perfetta, non si dissolve" :
           miscast ? " — doppio 1: fiasco" :
           cast ? " — lanciato" : " — non lanciato"),
  };
}

/* La tabella del fiasco (p. 109). Due righe su cinque fanno lanciare lo
   stesso l'incantesimo, e tutte e due chiudono la magia del turno.

   Il surclassato nel dissolvimento (p. 110) usa la stessa tabella
   «cambiando lancio con dissolvimento e invocazione perfetta con
   slegamento»: letto alla lettera, un 8-9 dissolve e un 10-12 slega, e
   tutti e due chiudono i dissolvimenti del turno. */
export const MISCAST = [
  { from: 2,  to: 4,  id: "cascade",    label: "Dimensional Cascade",
    text: "sagoma da 5 pollici centrata sul mago: chi è sotto, amico o nemico, rischia un colpo a Forza 10 con perforazione 4 (p. 95)",
    hit: { template: 5, S: 10, AP: 4 } },
  { from: 5,  to: 6,  id: "detonation", label: "Calamitous Detonation",
    text: "sagoma da 3 pollici centrata sul mago: chi è sotto rischia un colpo a Forza 6 con perforazione 2 (p. 95)",
    hit: { template: 3, S: 6, AP: 2 } },
  { from: 7,  to: 7,  id: "careless",   label: "Careless Conjuration",
    text: "il mago subisce un colpo a Forza 4 con perforazione 1",
    hit: { wizard: true, S: 4, AP: 1 } },
  { from: 8,  to: 9,  id: "barely",     label: "Barely Controlled Power",
    text: "l'incantesimo è lanciato al suo valore di lancio, ma per il resto del turno non se ne lanciano altri",
    cast: true, atValue: true, stop: true },
  { from: 10, to: 12, id: "drain",      label: "Power Drain",
    text: "l'incantesimo è lanciato con un'invocazione perfetta, ma per il resto del turno non se ne lanciano altri",
    cast: true, perfect: true, stop: true },
];

export function miscastRead(total, { dispel = false } = {}){
  const t = Math.max(2, Math.min(12, +total || 0));
  const row = MISCAST.find(r => t >= r.from && t <= r.to);
  if (!dispel) return { ...row, total: t, page: PAGE.miscast };
  const text = row.id === "barely"
    ? "l'incantesimo è dissolto, ma per il resto del turno non si tentano altri dissolvimenti"
    : row.id === "drain"
      ? "l'incantesimo è slegato, ma per il resto del turno non si tentano altri dissolvimenti"
      : row.text;
  return { ...row, text, total: t, dispelled: !!row.cast, unbinding: !!row.perfect, page: PAGE.dispel };
}

/* ============================================================
   6 · IL DISSOLVIMENTO (p. 110)
   2D6, piu' il Livello se dissolve un mago, niente se ci si affida alla
   sorte. Il libro, a p. 110, dice che si dissolve quando il risultato
   SUPERA il risultato di lancio; il riepilogo di p. 344 dice «uguale o
   superiore». Le due righe dello stesso libro non si accordano, e qui
   vince il testo della regola: la costante qui sotto e' il punto in cui
   cambiarlo, se una FAQ dice altro.

   Un incantesimo che resta in gioco, nei turni successivi, si dissolve
   contro il valore di lancio e non contro il tiro di allora (p. 111), e
   l'invocazione perfetta non lo protegge piu'.
   ============================================================ */
export const DISPEL_TIES = false;

export function dispelResult({ dice = [], level = 0, fated = false, castTotal = 0, perfect = false,
                                later = false, cv = 0, mod = 0 } = {}){
  const faces = (dice || []).slice(0, 2).map(v => +v || 0);
  const natural = faces.reduce((s, v) => s + v, 0);
  const add = fated ? 0 : (+level || 0);
  const total = natural + add + (+mod || 0);
  const against = later ? (+cv || 0) : (+castTotal || 0);
  const double = faces.length === 2 && faces[0] === faces[1];
  const unbinding = double && faces[0] === 6;
  const outclassed = !fated && double && faces[0] === 1;
  const protectedNow = perfect && !later;
  const beats = DISPEL_TIES ? total >= against : total > against;
  const dispelled = !protectedNow && !outclassed && (unbinding || beats);
  return {
    faces, natural, total, against, dispelled, unbinding: unbinding && !protectedNow, outclassed,
    protectedNow, fated: !!fated,
    text: (protectedNow ? "invocazione perfetta: non si dissolve" :
           (fated ? "dissolvimento affidato alla sorte " : "dissolvimento ") + faces.join(" + ") +
           (add ? " + " + add + " di Livello" : "") + " = " + total + " contro " + against +
           (later ? " (il valore di lancio)" : "") +
           (unbinding ? " — doppio 6: slegato" :
            outclassed ? " — doppio 1: surclassato" :
            dispelled ? " — dissolto" : " — tiene")),
  };
}

/* ============================================================
   7 · GLI EFFETTI
   Dal campo `effetto` dei dati alla forma che `effects.js` sa leggere.
   `colpi` e `modifiche` l'app li applica; tutto il resto e' `a mano`, e
   la riga dice cosa fare invece di tacere.
   ============================================================ */
/* «2D6», «D3+3», «3D3», «1»: quanti dadi, di che tipo, e quanto si
   aggiunge. */
export function parseDice(txt){
  const m = /^\s*(\d*)\s*d\s*(3|6)\s*(?:\+\s*(\d+))?\s*$/i.exec(String(txt || ""));
  if (m) return { n: m[1] ? +m[1] : 1, die: +m[2], plus: m[3] ? +m[3] : 0 };
  const k = /^\s*(\d+)\s*$/.exec(String(txt || ""));
  return k ? { n: 0, die: 0, plus: +k[1] } : null;
}
export const diceTotal = (spec, faces = []) =>
  (faces || []).reduce((s, v) => s + (+v || 0), 0) + ((spec && spec.plus) || 0);

export const hitsOf = spell => (spell && spell.effetto && spell.effetto.colpi) || null;
export const manualOf = spell => (spell && spell.effetto && spell.effetto["a mano"]) || "";

/* L'effetto a tempo. `at` e' il momento del lancio (turno e parte), che
   `effects.js` usa per sapere quando «fino a fine turno» e «fino al tuo
   prossimo inizio turno» sono passati. `rolled` e' il valore del dado
   per le modifiche che ne vogliono uno (−D3 Abilita' Combattimento). */
export function effectOf(spell, { at = null, rolled = 0, casterName = "" } = {}){
  const e = spell && spell.effetto;
  if (!e) return null;
  const mods = {};
  for (const [k, v] of Object.entries(e.modifiche || {})){
    /* La salvezza speciale che un incantesimo da' non peggiora quella
       che l'unita' ha gia': «gain a 5+ Ward save» e' un regalo, non una
       sostituzione. `best` lo dice a `effects.js`. */
    mods[k] = k === "ward" && v && typeof v === "object" && v.set != null ? { best: v.set } : v;
  }
  if (e.modificheDado && rolled){
    const val = (e.modificheDado.segno || 1) * Math.abs(+rolled || 0);
    for (const k of e.modificheDado.chiavi || []) mods[k] = (mods[k] || 0) + val;
  }
  const flags = { ...(e.flag || {}) };
  if (e.ap) flags.ap = e.ap;
  if (!Object.keys(mods).length && !Object.keys(flags).length) return null;
  return {
    id: "spell:" + spell.id,
    from: spell.name + (casterName ? " (" + casterName + ")" : ""),
    page: spell.page || 0,
    kind: spell.type,
    mods, flags,
    until: e.fino || (spell.rip ? null : "turn"),
    rip: !!spell.rip,
    ...(at ? { at } : {}),
  };
}

/* Chi riceve l'effetto: il bersaglio, oppure il mago e l'unita' a cui e'
   unito per gli incantesimi «self» che lo dicono. */
export const selfAndUnit = spell => !!(spell && spell.effetto && /unit/.test(String(spell.effetto.chi || "")));

/* «If this spell is cast, the effects of any other Hex previously cast
   on the target unit immediately expire» — l'id degli effetti da
   togliere, fra quelli dell'unita'. */
export function cancelled(spell, effects = []){
  const kind = spell && spell.annulla;
  if (!kind) return [];
  return (effects || []).filter(x => x && x.kind === kind && String(x.id).startsWith("spell:") &&
                                     x.id !== "spell:" + spell.id).map(x => x.id);
}

/* Plague of Rust e' «−2 al valore d'armatura»: su chi non ha armatura non
   c'e' niente da peggiorare, e sommare 2 a uno zero regalerebbe una
   salvezza a 2+. */
export const skipOn = (spell, unit = {}) =>
  !!(spell && spell.effetto && spell.effetto.soloConArmatura && !(+unit.armour > 0));

/* ============================================================
   8 · QUELLO CHE SERVE A CHI DECIDE
   L'arbitro offre un incantesimo come offre una carica: con dentro gia'
   quanto serve e che probabilita' ha. I conti sono sui trentasei esiti
   dei due dadi, e seguono le regole di sopra — il doppio 6 che lancia
   sempre, il doppio 1 che va sulla tabella, dove un 8-12 lancia lo
   stesso (p. 109).
   ============================================================ */
const FACES = [1, 2, 3, 4, 5, 6];
const PAIRS = FACES.flatMap(a => FACES.map(b => [a, b]));
/* sulla tabella del fiasco, quanti dei 36 esiti lanciano (o dissolvono)
   lo stesso: 8-9 e 10-12, cioe' 5 + 10 = 15 */
const TABLE_STILL = PAIRS.filter(([a, b]) => a + b >= 8).length / 36;

export function castOdds({ level = 0, cv = 0, mod = 0, cvUp = 0, bound = false, power = 0 } = {}){
  let cast = 0, perfect = 0, miscast = 0;
  for (const dice of PAIRS){
    const r = castResult({ dice, level, cv, mod, cvUp, bound, power });
    if (r.miscast){ miscast++; continue; }
    if (r.cast) cast++;
    if (r.perfect) perfect++;
  }
  return { cast: (cast + miscast * TABLE_STILL) / 36, perfect: perfect / 36, miscast: miscast / 36 };
}

/* `against` e' il risultato di lancio da superare. Il surclassato va
   sulla stessa tabella, e un 8-12 dissolve (p. 110); un incantesimo
   vincolato non surclassa nessuno (p. 109). */
export function dispelOdds({ level = 0, fated = false, against = 0, bound = false } = {}){
  let ok = 0, outclassed = 0;
  for (const dice of PAIRS){
    const r = dispelResult({ dice, level, fated, castTotal: against });
    if (r.outclassed && !bound){ outclassed++; ok += TABLE_STILL; continue; }
    if (r.dispelled || (r.outclassed && bound && r.total > against)) ok++;
  }
  return { dispel: ok / 36, outclassed: outclassed / 36 };
}

/* Quanti colpi porta in media un «2D3», un «D6+1», un «3». */
export function diceMean(spec){
  if (!spec) return 0;
  return (spec.n || 0) * ((spec.die || 0) + 1) / 2 + (spec.plus || 0);
}

/* Un incantesimo che l'app sa applicare da sola: colpi con i dadi scritti,
   o modifiche e bandierine che `effects.js` sa leggere. Tutti gli altri —
   i vortici, i trasporti, le sagome, le linee — sono testo da leggere, e
   un arbitro che li offrisse farebbe tirare un lancio che non cambia
   niente sul tavolo. */
export function applies(spell){
  const e = spell && spell.effetto;
  if (!e) return false;
  if (e.colpi) return !!parseDice(e.colpi.dadi);
  return !!(e.modifiche || e.modificheDado || e.flag);
}
