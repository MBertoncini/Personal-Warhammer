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

const RULE_KEEP = /skirmish|schermagl|fly|vola|fast cavalry|cavalleria veloce|scout|vanguard|ambush|terror|fear|large target|stubborn|unbreakable|immune to psychology|move through cover|aquatic|swiftstride|first charge|impact hits|stomp|drilled|open order|close order|loose formation/i;

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

  const rules = [];
  for (const p of profs){
    if (!/Special Rule/i.test(pType(p))) continue;
    const n = String(pick(p, "name") || "");
    if (n && RULE_KEEP.test(n) && !rules.includes(n)) rules.push(n);
  }
  const weapons = [];
  for (const p of profs){
    if (!/^Weapon$/i.test(pType(p))) continue;
    const n = String(pick(p, "name") || "");
    let rng = "";
    for (const c of charsOf(p)) if (/^R$/i.test(String(pick(c, "name") || ""))) rng = charVal(c);
    if (n && !weapons.some(w => w.name === n)) weapons.push({ name:n, range:rng });
  }
  const maxRange = weapons.reduce((m, w) => {
    const q = String(w.range).match(/(\d+)/);
    return q ? Math.max(m, +q[1]) : m;
  }, 0);

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
    troop, unitSize: size, stats, rules, weapons, maxRange, slot, faction,
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
