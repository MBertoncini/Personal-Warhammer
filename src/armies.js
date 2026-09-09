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
 * Quello che il vocabolario non copre non sparisce e non viene
 * inventato: la regola resta nel file con `manuale` e il suo testo, e
 * l'app la mostra dicendo che non la applica. E' l'obbligo numero tre
 * del §1 del piano, e vale piu' di dieci regole applicate male.
 */

/* ============================================================
   1 · IL VOCABOLARIO
   ============================================================ */
export const WHEN = {
  always:  "sempre",
  charge:  "nel turno in cui carica",
  melee:   "in corpo a corpo",
  shoot:   "quando tira",
  command: "nella sotto-fase di comando",
  flee:    "quando fugge",
  psych:   "sui test di psicologia",
  list:    "e' un vincolo di lista, non di tavolo",
};
export const EFFECT_KEYS = ["mods","set","clear","flags","reroll","ap","once"];

/* Una regola e' esprimibile quando dice almeno una cosa che il
   vocabolario conosce. Se dice solo `manuale`, l'app la nomina e si
   ferma li'. */
export const expressible = r => !!r && EFFECT_KEYS.some(k => r[k] != null);

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

/* ============================================================
   3 · DALLA REGOLA DEL FILE ALL'EFFETTO DEL MOTORE
   Torna la forma che `effects.js` sa gia' leggere, cosi' una regola
   d'esercito e un incantesimo sono la stessa cosa per chi legge un
   numero — che e' precisamente il punto.
   ============================================================ */
export function toEffect(rule, army){
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
   4 · L'ONESTA'
   Per ogni esercito: quante regole ci sono, quante l'app sa applicare,
   e quali no con il loro testo. E' la stessa forma che `rulebook.js`
   usa per le regole universali, e finisce nello stesso pannello.
   ============================================================ */
export function coverage(army){
  if (!army) return { name:"", total:0, applied:[], manual:[] };
  const applied = [], manual = [];
  for (const r of army.rules){
    if (expressible(r)) applied.push({ name:r.name, what:r.what || "", page:r.page || 0 });
    else manual.push({ name:r.name, what:r.what || r.manuale || "", page:r.page || 0,
                       why:r.perche || "il vocabolario non la copre: si applica a mano" });
  }
  return { name: army.name, book: army.book || null, total: army.rules.length, applied, manual };
}

/* Le regole della lista che nessuno ha riconosciuto — ne' il registro
   universale ne' il file d'esercito. E' la lista della spesa del §3.4,
   ordinata per quante volte una regola e' comparsa. */
export function unmatched(names = [], army = null, known = () => false){
  const mine = new Set((army ? army.rules : []).map(r => String(r.name || "").toLowerCase()));
  const tally = new Map();
  for (const raw of names){
    const n = String(raw || "").trim();
    if (!n || known(n) || mine.has(n.toLowerCase())) continue;
    tally.set(n, (tally.get(n) || 0) + 1);
  }
  return [...tally.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
