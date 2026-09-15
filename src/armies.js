/* Schieramento Old World — le regole d'esercito, che stanno fuori dal codice
 *
 * Il manuale base e' un terzo delle regole che si usano davvero: il
 * resto sta negli army book, e gli army book cambiano. Se le loro
 * regole finiscono dentro il codice, la prima lista nuova lo fa
 * saltare — e' il rischio numero due del §11 del piano.
 *
 * Quindi: un file di dati per esercito, in `dati/eserciti/`, e qui
 * dentro solo il vocabolario che quei file possono usare. Aggiungere
 * un esercito vuol dire aggiungere un file, mai toccare un modulo.
 *
 * Il vocabolario e' volutamente piccolo. Ogni regola dichiara **quando**
 * vale e **cosa fa**, e le cose che sa fare sono sette:
 *
 *   mods    { S:+1, I:-1 }          sposta una caratteristica
 *   set     { ward:6 }              la fissa a un valore
 *   clear   ["armour"]              la azzera
 *   flags   { magicalAttacks:true } accende una bandierina del motore
 *   reroll  { toWound:"ones" }      ritira dei dadi (rules.js, §3)
 *   ap      1                       migliora la perforazione
 *   once    true                    si usa una volta per partita
 *
 * E tre campi che non fanno niente al motore e dicono tutto a chi legge:
 *
 *   nomi         come la scrive New Recruit: e' da qui che la si
 *                riconosce su un'unita'
 *   perche       l'app la conosce e non la applica, e questo e' il
 *                motivo; vince sugli effetti, che restano scritti per
 *                il giorno in cui il motore sapra' farli
 *   gioca        la applica un altro modulo (la psicologia, per ora)
 *   daVerificare nessuna lista salvata la porta per esteso: la riga
 *                viene da un riassunto, non dal testo
 *
 * Quello che il vocabolario non copre non sparisce e non viene
 * inventato: la regola resta nel file con il suo perche', e l'app la
 * mostra dicendo che non la applica. E' l'obbligo numero tre del §1
 * del piano, e vale piu' di dieci regole applicate male.
 */

/* ============================================================
   1 · IL VOCABOLARIO
   ============================================================ */
export const WHEN = {
  always:     "sempre",
  charge:     "nel turno in cui carica",
  melee:      "in corpo a corpo",
  shoot:      "quando tira o gli tirano",
  command:    "nella sotto-fase di comando",
  flee:       "quando fugge",
  psych:      "sui test di psicologia",
  leadership: "sul Comando con cui si tirano i test",
  magic:      "nella magia",
  turnStart:  "all'inizio del turno",
  compulsory: "nelle mosse obbligate",
  list:       "e' un vincolo di lista, non di tavolo",
};
export const EFFECT_KEYS = ["mods","set","clear","flags","reroll","ap","once"];

/* Una regola e' esprimibile quando dice almeno una cosa che il
   vocabolario conosce. Se dice solo il suo perche', l'app la nomina e
   si ferma li'. */
export const expressible = r => !!r && EFFECT_KEYS.some(k => r[k] != null);

/* E si applica quando e' esprimibile e nessuno ha scritto perche' non
   si puo' — oppure quando la applica un altro modulo. La differenza con
   `expressible` e' la Tusker Charge: il file sa dire cosa fa (+1 Forza
   al cinghiale), ma il conto dell'assalto non separa ancora il
   cinghiale dal cavaliere, e dire «applicata» sarebbe mentire. */
export const applies = r => !!r && (!!r.gioca || (expressible(r) && !r.perche));

/* ============================================================
   2 · CARICARE I FILE
   Nel browser arrivano da fetch; nelle prove da import di JSON. Chi
   chiama passa i file gia' letti, cosi' questo modulo resta puro e si
   prova senza rete.
   ============================================================ */
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* Il caricamento vero: l'indice dice quali file ci sono, perche' una
   cartella servita da HTTP non si puo' sfogliare. Se manca la rete o
   manca un file non succede niente di grave — si resta senza regole
   d'esercito, e l'app lo dice invece di rompersi. */
let cached = null;
export async function loadArmies(base = "dati/eserciti/"){
  if (cached) return cached;
  try {
    const idx = await (await fetch(base + "indice.json")).json();
    const files = await Promise.all((idx.file || []).map(async f => {
      try { return await (await fetch(base + f)).json(); } catch { return null; }
    }));
    cached = makeArmies(files);
  } catch {
    cached = makeArmies([]);
  }
  return cached;
}
export const armiesNow = () => cached;
/* Per le prove, e per chi i file li ha gia' letti da un'altra parte. */
export const useArmies = A => { cached = A || null; return cached; };

export function makeArmies(files = []){
  const list = files.filter(Boolean).map(a => ({
    ...a,
    rules: Array.isArray(a.rules) ? a.rules : [],
    items: Array.isArray(a.items) ? a.items : [],
    keys: [a.id, a.name, ...(a.matches || [])].filter(Boolean).map(norm),
  }));

  /* Il nome dell'esercito arriva dal file della lista come catalogo o
     come fazione, e i due non sono sempre scritti uguale. */
  const find = name => {
    const n = norm(name);
    if (!n) return null;
    return list.find(a => a.keys.some(k => k === n)) ||
           list.find(a => a.keys.some(k => k && (n.includes(k) || k.includes(n)))) || null;
  };

  return { list, find, forList: l => find((l && l.info && l.info.catalogue) || (l && l.army) || "") };
}

/* L'esercito di un'unita' del tavolo: la fazione la scrive il parser su
   ogni unita' importata, quindi la schiera lo trova da sola senza
   sapere di che lista e' figlia. `fallback` e' il catalogo della lista,
   per le unita' scritte a mano che la fazione non ce l'hanno. */
export function armyFor(u, fallback = ""){
  if (!cached) return null;
  return cached.find((u && u.faction) || "") || (fallback ? cached.find(fallback) : null);
}

/* ============================================================
   3 · RICONOSCERE UNA REGOLA SU UN'UNITA'
   New Recruit la scrive in inglese, a volte con una parentesi dietro:
   «Howdah (Lizardmen)». Si confronta con `nomi`, poi con il nome e
   l'identificatore — che e' come si trovavano le regole prima che i
   file le scrivessero in italiano e nessuna combaciasse piu'.
   ============================================================ */
export function ruleFor(army, name){
  if (!army) return null;
  const n = norm(name);
  if (!n) return null;
  const keysOf = r => [...(r.nomi || []), r.name, r.id].filter(Boolean).map(norm);
  return army.rules.find(r => keysOf(r).includes(n)) ||
         /* «Choppas (hand weapons only)»: la parentesi dietro non cambia
            la regola, e un nome che comincia con il nome giusto la trova */
         army.rules.find(r => keysOf(r).some(k => k.length > 3 && n.startsWith(k + " "))) || null;
}

/* ============================================================
   4 · DALLA REGOLA DEL FILE ALL'EFFETTO DEL MOTORE
   Torna la forma che `effects.js` sa gia' leggere, cosi' una regola
   d'esercito e un incantesimo sono la stessa cosa per chi legge un
   numero — che e' precisamente il punto.
   ============================================================ */
export function toEffect(rule, army, extra = {}){
  if (!expressible(rule)) return null;
  const mods = { ...(rule.mods || {}) };
  for (const k of (rule.clear || [])) mods[k] = { set: 0 };
  for (const [k, v] of Object.entries(rule.set || {})) mods[k] = { set: v };
  return {
    id: rule.id,
    from: rule.name + (army && army.name ? " — " + army.name : ""),
    page: rule.page || 0,
    who: rule.who || null,
    mods,
    flags: { ...(rule.flags || {}), ...(rule.reroll ? { reroll: rule.reroll } : {}),
             ...(rule.ap ? { ap: rule.ap } : {}) },
    until: rule.until || null,
    once: !!rule.once,
    when: rule.when || "always",
    ...extra,
  };
}

/* Le regole che valgono adesso: quelle di `when` giusto, piu' quelle
   che valgono sempre. Le regole a uso singolo gia' spese restano fuori,
   ed e' `effects.js` a ricordarsi che sono state spese. */
export function rulesNow(army, when = "always", { spent = [] } = {}){
  if (!army) return [];
  return army.rules.filter(r =>
    (r.when || "always") === when || (when !== "list" && (r.when || "always") === "always"))
    .filter(r => !(r.once && spent.includes(r.id)));
}

/* ============================================================
   5 · QUELLO CHE UN ASSALTO SENTE
   Le regole d'esercito di una schiera, tradotte nelle quattro cose che
   il conto di `combat.js` sa gia' fare: ritirare, perforare, alzare la
   Forza, fissare la salvezza speciale. Il conto non sa da che libro
   vengono, ed e' giusto cosi'.

   Le regole «una volta per partita» non passano di qui: si attivano
   con un gesto al tavolo, diventano un effetto a tempo sull'unita', e
   quello `combat.js` lo legge da `effects.js` come un incantesimo.

   `charged` e' «ha caricato in questo turno», senza i tre pollici
   dell'urto: la Choppa li' non li chiede. `weapon` e' il nome dell'arma
   impugnata, per le regole che valgono su una sola. */
const HAND = /hand weapon|arma a una mano/i;

export function meleeBoosts(rules = [], { charged = false, weapon = "" } = {}){
  const out = { rerollHit: null, rerollWound: null, ap: 0, s: 0, ward: 0,
                magical: false, from: {}, notes: [], off: [] };
  for (const r of rules || []){
    if (!applies(r) || r.gioca || r.once) continue;
    const when = r.when || "always";
    if (!["always", "melee", "charge"].includes(when)) continue;
    if (when === "charge" && !charged) continue;
    const f = r.flags || {};
    if (f.handWeaponOnly && !HAND.test(String(weapon || ""))){
      out.off.push(r.name + ": vale solo con l'arma a una mano");
      continue;
    }
    if (r.reroll && r.reroll.toHit){ out.rerollHit = r.reroll.toHit; out.from.hit = r.name; }
    if (r.reroll && r.reroll.toWound){ out.rerollWound = r.reroll.toWound; out.from.wound = r.name; }
    if (r.ap){ out.ap += r.ap; out.notes.push(r.name + ": perforazione +" + r.ap); }
    if (r.mods && r.mods.S){ out.s += r.mods.S; out.notes.push(r.name + ": Forza " + (r.mods.S > 0 ? "+" : "") + r.mods.S); }
    if (r.set && r.set.ward){ out.ward = out.ward ? Math.min(out.ward, r.set.ward) : r.set.ward; out.from.ward = r.name; }
    if (f.magicalAttacks) out.magical = true;
  }
  return out;
}

/* Quanto in piu' si fugge. E' una regola sola oggi — la Scurry Away
   degli Skaven — ma la forma e' quella di ogni bandierina numerica. */
export function fleeBonus(rules = []){
  let mod = 0;
  const why = [];
  for (const r of rules || []){
    if (!applies(r) || !(r.flags && r.flags.fleeBonus)) continue;
    mod += +r.flags.fleeBonus || 0;
    why.push(r.name + " " + (r.flags.fleeBonus > 0 ? "+" : "") + r.flags.fleeBonus);
  }
  return { mod, why: why.join(", ") };
}

/* ============================================================
   6 · L'ONESTA'
   Per ogni esercito: quante regole ci sono, quante l'app sa applicare,
   e quali no con il loro perche'. E' la stessa forma che `rulebook.js`
   usa per le regole universali, e finisce nello stesso pannello. Le
   righe da verificare si contano a parte: «applicata» e «applicata
   leggendo un riassunto» non sono la stessa promessa.
   ============================================================ */
export function coverage(army){
  if (!army) return { name:"", total:0, applied:[], manual:[], unverified:[] };
  const applied = [], manual = [], unverified = [];
  for (const r of army.rules){
    if (applies(r)) applied.push({ name:r.name, what:r.what || "", page:r.page || 0, by: r.gioca || "" });
    else manual.push({ name:r.name, what:r.what || r.manuale || "", page:r.page || 0,
                       why:r.perche || "il vocabolario non la copre: si applica a mano" });
    if (r.daVerificare) unverified.push({ name:r.name, why:r.daVerificare });
  }
  return { name: army.name, book: army.book || null, total: army.rules.length, applied, manual, unverified };
}

/* Le regole della lista che nessuno ha riconosciuto — ne' il registro
   universale ne' il file d'esercito. E' la lista della spesa del §3.4,
   ordinata per quante volte una regola e' comparsa. */
export function unmatched(names = [], army = null, known = () => false){
  const tally = new Map();
  for (const raw of names){
    const n = String(raw || "").trim();
    if (!n || known(n) || ruleFor(army, n)) continue;
    tally.set(n, (tally.get(n) || 0) + 1);
  }
  return [...tally.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
