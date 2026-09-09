/* Schieramento Old World — lettura dei file New Recruit / BattleScribe */

import { BASES, baseById, defaultFrontage, guessBase } from './bases.js';

/* ============================================================
   2 · PARSER NEW RECRUIT / BATTLESCRIBE
   ============================================================ */
const arr = v => v == null ? [] : (Array.isArray(v) ? v : [v]);
function pick(o, ...keys){
  for (const k of keys){
    if (!o) continue;
    if (o[k] !== undefined && o[k] !== null) return o[k];
    if (o["@" + k] !== undefined && o["@" + k] !== null) return o["@" + k];
  }
  return undefined;
}
function unwrap(v, inner){
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "object" && v[inner] !== undefined) return arr(v[inner]);
  return [v];
}
const kidsOf     = n => unwrap(pick(n, "selections", "selection"), "selection");
const forcesOf   = n => unwrap(pick(n, "forces", "force"), "force");
const profilesOf = n => unwrap(pick(n, "profiles", "profile"), "profile");
const catsOf     = n => unwrap(pick(n, "categories", "category"), "category");
const costsOf    = n => unwrap(pick(n, "costs", "cost"), "cost");
const charsOf    = p => unwrap(pick(p, "characteristics", "characteristic"), "characteristic");
const charVal    = c => String(pick(c, "$text", "text", "value", "#text") ?? "").trim();
const pType      = p => String(pick(p, "typeName", "profileTypeName") || "");

// tutti i profili del nodo e dei discendenti
function allProfiles(node, out = [], d = 0){
  if (!node || d > 8) return out;
  for (const p of profilesOf(node)) out.push(p);
  for (const k of kidsOf(node)) allProfiles(k, out, d + 1);
  return out;
}
/* tutte le caratteristiche di un profilo in una mappa nome -> valore,
   e la ricerca per forma del nome: New Recruit scrive "R" o "Range",
   "S" o "Strength", "AP" o "Armour Piercing" a seconda del catalogo */
function readChars(p){
  const m = {};
  for (const c of charsOf(p)) m[String(pick(c, "name") || "").trim()] = charVal(c);
  return m;
}
function pickChar(map, re){
  for (const [k, v] of Object.entries(map)) if (re.test(k)) return v;
  return "";
}
function charFrom(profiles, typeRe, nameRe){
  for (const p of profiles){
    if (typeRe && !typeRe.test(pType(p))) continue;
    for (const c of charsOf(p)){
      if (nameRe.test(String(pick(c, "name") || ""))){
        const v = charVal(c);
        if (v) return v;
      }
    }
  }
  return "";
}
// somma ricorsiva dei punti (il costo di un'unità è sparso fra modello e opzioni)
function deepCost(node, wanted, d = 0){
  if (!node || d > 9) return 0;
  let sum = 0;
  for (const c of costsOf(node)){
    const nm = String(pick(c, "name", "typeId") || "").toLowerCase();
    const v = Number(pick(c, "value") || 0);
    if (isFinite(v) && wanted.test(nm)) sum += v;
  }
  for (const k of kidsOf(node)) sum += deepCost(k, wanted, d + 1);
  return sum;
}
// conta i modelli: solo le selezioni type="model" (l'equipaggio type="crew" non allarga la base)
function countModels(node, d = 0){
  if (!node || d > 8) return 0;
  let sum = 0;
  for (const k of kidsOf(node)){
    const t = String(pick(k, "type") || "").toLowerCase();
    const num = Number(pick(k, "number") || 1);
    if (t === "model") sum += (isFinite(num) ? num : 1);
    else if (t !== "crew") sum += countModels(k, d + 1);
  }
  return sum;
}
function crewCount(node, d = 0){
  if (!node || d > 8) return 0;
  let sum = 0;
  for (const k of kidsOf(node)){
    const t = String(pick(k, "type") || "").toLowerCase();
    if (t === "crew") sum += Number(pick(k, "number") || 1);
    else sum += crewCount(k, d + 1);
  }
  return sum;
}
function parseBaseSize(txt){
  const m = String(txt).match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!m) return null;
  const w = +m[1], h = +m[2];
  return { w: Math.min(w, h), h: Math.max(w, h) };   // larghezza = lato corto
}

/* ------------------------------------------------------------------
   Armatura, salvezza speciale, rigenerazione
   Nei cataloghi di New Recruit questi tre numeri non stanno quasi mai
   dove uno se li aspetta. L'armatura e' scritta a parole dentro un
   profilo "Armour" ("Armour Value 5+"), lo scudo non ha un valore suo
   ma promette di migliorare quello che c'e', e la pelle dura di un
   mostro e' una regola speciale col numero fra parentesi. Chi cercava
   solo una caratteristica "AV" sul modello trovava zero su tutta la
   lista, e a zero il combattimento fa conti sbagliati.

   La convenzione qui e' la stessa del resto dell'app: il numero e' il
   punteggio da fare col dado, e zero vuol dire che quella salvezza non
   c'e'.
   ------------------------------------------------------------------ */
const NO_SAVE = 7;
const clampSave = n => (n >= NO_SAVE ? 0 : Math.max(2, Math.min(6, n)));

/* Le descrizioni degli incantesimi promettono salvezze che durano un
   turno: sono effetti, non profilo, e non vanno lette come se l'unita'
   le avesse sempre. */
const isLasting = p => !/^Spell$/i.test(pType(p));

function readArmour(profs, ruleText){
  /* 1 · i cataloghi che scrivono il valore come caratteristica */
  for (const p of profs){
    if (!/^(Model|Unit)$/i.test(pType(p))) continue;
    const m = readChars(p);
    const av = pickChar(m, /^(av|armou?r value)$/i);
    const sv = pickChar(m, /^(sv|save|armou?r save)$/i);
    if (av && /\d/.test(av)) return clampSave(7 - +av.match(/\d+/)[0]);
    if (sv && /\d/.test(sv)) return clampSave(+sv.match(/\d+/)[0]);
  }

  /* 2 · i profili armatura, dove il valore sta dentro la descrizione.
     La ricerca e' ancorata a tutta la descrizione perche' quella dello
     scudo cita un esempio ("un modello con armatura leggera ha valore
     6+") e presa a meta' frase direbbe il numero sbagliato. */
  let value = NO_SAVE, bonus = 0;
  for (const p of profs){
    if (!/^Armour$/i.test(pType(p))) continue;
    const name = String(pick(p, "name") || "");
    const desc = Object.values(readChars(p)).join(" ").trim();
    const exact = desc.match(/^armou?r value\s*(\d)\s*\+?\.?$/i);
    if (exact) value = Math.min(value, +exact[1]);
    else if (/shield|scudo/i.test(name)) bonus += 1;
    else {
      const by = desc.match(/improves? (?:its )?armou?r value by\s*(\d)/i);
      if (by) bonus += +by[1];
    }
  }

  /* 3 · la pelle naturale, che e' una regola e non un pezzo di equipaggiamento */
  for (const name of Object.keys(ruleText)){
    const m = /^armou?red hide\s*\((\d)/i.exec(name.trim());
    if (m) bonus += +m[1];
  }

  return clampSave(value - bonus);
}

/* Salvezza speciale e rigenerazione si trovano solo a parole, e quasi
   sempre dentro il testo di una regola: "5+ ward save", "Regeneration
   (5+)". Si guarda ovunque tranne che negli incantesimi. */
function readSpecialSave(profs, re){
  for (const p of profs){
    if (!isLasting(p)) continue;
    const hay = String(pick(p, "name") || "") + " " + Object.values(readChars(p)).join(" ");
    const m = hay.match(re);
    if (m) return clampSave(+(m[1] || m[2]));
  }
  return 0;
}
const WARD_RE  = /(?:(\d)\s*\+\s*ward save|ward save (?:of )?(?:a )?(\d)\s*\+)/i;
const REGEN_RE = /regenerat\w*\s*\(?\s*(\d)\s*\+/i;

function readUnit(node){
  const profs = allProfiles(node);
  const name  = String(pick(node, "name") || "Unità");
  const troop = charFrom(profs, /^Unit$/i, /^Troop Type$/i) || charFrom(profs, null, /^Troop Type$/i);
  const size  = charFrom(profs, /^Unit$/i, /^Unit Size$/i);
  const baseTxt = charFrom(profs, /^Base$/i, /^Base Size$/i) || charFrom(profs, null, /^Base Size$/i);

  const statNames = ["M","WS","BS","S","T","W","I","A","Ld"];
  let stats = null;
  for (const p of profs){
    if (!/^Model$/i.test(pType(p))) continue;
    const map = {};
    for (const c of charsOf(p)) map[String(pick(c, "name") || "")] = charVal(c);
    if (statNames.every(k => k in map)) { stats = map; break; }
  }

  /* Le regole si tengono tutte. Prima ne passava una manciata scelta da
     un elenco scritto a mano, e tutte le altre sparivano al momento
     dell'importazione: uno Scar-Veteran arrivava sul tavolo senza
     nessuna delle sue sette regole, e quello che non e' stato letto non
     si puo' ne' applicare ne' segnalare come non applicato. Del testo
     si tiene una copia perche' e' li' che stanno i numeri: quanto
     migliora l'armatura, di quanto sale la perforazione, da che punto
     in su un dado conta. */
  const rules = [];
  const ruleText = {};
  for (const p of profs){
    if (!/Special Rule/i.test(pType(p))) continue;
    const n = String(pick(p, "name") || "").trim();
    if (!n) continue;
    if (!rules.includes(n)) rules.push(n);
    const desc = pickChar(readChars(p), /description|descrizione|effect/i);
    if (desc && !ruleText[n]) ruleText[n] = desc;
  }

  /* Stendardo e musico cambiano il conto di fine assalto e stanno nel
     file come profili di comando: leggerli qui evita di doverli
     spuntare a mano ogni volta nel pannello del duello. */
  const command = { standard:false, musician:false, champion:false };
  for (const p of profs){
    if (!/^Command$/i.test(pType(p))) continue;
    const n = String(pick(p, "name") || "");
    if (/standard|stendardo|banner/i.test(n)) command.standard = true;
    if (/music|musico/i.test(n)) command.musician = true;
    if (/champion|campione/i.test(n)) command.champion = true;
  }
  /* Le armi non servono piu' solo a scrivere una riga nell'ispettore:
     con Forza e perforazione il tavolo puo' stimare tiro e mischia. */
  const weapons = [];
  for (const p of profs){
    if (!/weapon/i.test(pType(p))) continue;
    const n = String(pick(p, "name") || "");
    if (!n || weapons.some(w => w.name === n)) continue;
    const m = readChars(p);
    weapons.push({
      name: n,
      range: pickChar(m, /^(r|rng|range)$/i),
      S:     pickChar(m, /^(s|str|strength)$/i),
      ap:    pickChar(m, /^(ap|armou?r piercing|armou?r penetration)$/i),
      rules: pickChar(m, /special|rules/i),
    });
  }
  const maxRange = weapons.reduce((m, w) => {
    const q = String(w.range).match(/(\d+)/);
    return q ? Math.max(m, +q[1]) : m;
  }, 0);

  /* Le tre salvezze. Restano correggibili a mano nell'ispettore: il
     file non sa dell'oggetto magico comprato all'ultimo momento. */
  const armour = readArmour(profs, ruleText);
  const ward   = readSpecialSave(profs, WARD_RE);
  const regen  = readSpecialSave(profs, REGEN_RE);

  const cats = catsOf(node).map(c => String(pick(c, "name") || "")).filter(Boolean);
  const primary = catsOf(node).find(c => pick(c, "primary") === true || pick(c, "primary") === "true");
  const slot = primary ? String(pick(primary, "name") || "") : (cats.find(c => /^(Characters|Core|Special|Rare|Mercenaries)$/i.test(c)) || "");
  const faction = (cats.find(c => /^Faction:/i.test(c)) || "").replace(/^Faction:\s*/i, "");

  let models = countModels(node) || 1;
  const crew = crewCount(node);
  const loose = rules.some(r => /skirmish|schermagl|loose formation|open order/i.test(r));

  const bs = parseBaseSize(baseTxt || "") || baseById(guessBase(troop || name));
  const known = BASES.find(b => b.w === bs.w && b.h === bs.h);

  return {
    name, models, crew,
    baseId: known ? known.id : "custom", baseW: bs.w, baseH: bs.h,
    frontage: defaultFrontage(troop, models, loose),
    loose,
    pts: Math.round(deepCost(node, /(^|[^a-z])(pts|points|punti)([^a-z]|$)/)),
    us: Math.round(deepCost(node, /unit strength/)),
    troop, unitSize: size, stats, rules, ruleText, command, weapons, maxRange, slot, faction,
    armour, ward, regen,
  };
}

function isUnitNode(n){
  const t = String(pick(n, "type") || "").toLowerCase();
  if (t === "unit") return true;
  if (t === "model" || t === "crew" || t === "upgrade") return false;
  return profilesOf(n).some(p => /^Unit$/i.test(pType(p)));
}

function parseRoster(raw){
  const root = raw.roster || raw.Roster || raw;
  const rosterName = String(pick(root, "name") || "Lista importata");
  const forces = forcesOf(root);
  const forceName = forces.length ? String(pick(forces[0], "name") || "") : "";
  const catalogue = forces.length ? String(pick(forces[0], "catalogueName") || "") : "";
  const limit = costsOf(pick(root, "costLimits") ? { costs: pick(root, "costLimits") } : root)
    .filter(c => /pts|points/i.test(String(pick(c, "name") || "")))
    .map(c => Number(pick(c, "value") || 0))[0] || 0;
  const total = costsOf(root).filter(c => /pts|points/i.test(String(pick(c, "name") || "")))
    .map(c => Number(pick(c, "value") || 0))[0] || 0;

  const units = [];
  (function visit(node, d){
    if (!node || typeof node !== "object" || d > 8) return;
    if (isUnitNode(node)) { units.push(readUnit(node)); return; }
    for (const k of kidsOf(node)) visit(k, d + 1);
  })({ selections: forces.length ? forces.flatMap(kidsOf) : kidsOf(root) }, 0);

  return { rosterName, forceName, catalogue, limit, total, units };
}

function xmlToObj(el){
  const o = {};
  for (const a of el.attributes) o[a.name] = a.value;
  const groups = {};
  for (const c of el.children) (groups[c.tagName] ||= []).push(xmlToObj(c));
  for (const [k, v] of Object.entries(groups)) o[k] = v;
  const txt = el.textContent && !el.children.length ? el.textContent.trim() : "";
  if (txt) o.$text = txt;
  return o;
}
function parseAny(text){
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) return JSON.parse(t);
  const doc = new DOMParser().parseFromString(t, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("non è né JSON né XML valido");
  const el = doc.documentElement;
  return { [el.tagName.toLowerCase()]: xmlToObj(el) };
}
export { parseRoster, parseAny, readUnit };
