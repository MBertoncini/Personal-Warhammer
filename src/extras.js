/* Schieramento Old World — le cose generiche
 *
 * Il principio del progetto e' che l'app sa geometria, quantita' e
 * memoria, e non sa mai legalita'. Da quel principio discende che le
 * funzionalita' che danno piu' liberta' sono quelle GENERICHE: un
 * marcatore con testo libero copre obiettivi, segnalini magici, aree
 * di incantesimo e «qui e' morto il generale»; un marcatore
 * «obiettivo» copre una cosa sola e domani ne serve un altro.
 *
 * Qui stanno le quattro primitive che fanno da jolly, e nessuna di
 * loro sa cosa significhi quello che tiene:
 *
 *   marcatori   un pezzo sul tavolo che non e' ne' unita' ne' terreno
 *   etichette   parole libere appiccicate a un'unita'
 *   contatori   un nome e un numero, per esercito o per unita'
 *   ferite      il numero che mancava: i modelli non sono l'unica valuta
 *
 * Niente DOM, niente archivio: entrano e escono oggetti semplici.
 * Le misure seguono la convenzione del terreno — x e y in millimetri,
 * larghezza e profondita' in pollici.
 */

import { MM } from './util.js';

/* ============================================================
   1 · MARCATORI
   Un tipo di dato al posto di dieci funzionalita'. Le sagome di
   misura sono lo stesso oggetto con `measure` acceso: un cerchio da
   appoggiare sul tavolo e' un marcatore che non si riempie.
   ============================================================ */
export const MARKER_SHAPES = [
  { id:"token",  label:"Segnalino", w:1.6,  h:1.6 },
  { id:"circle", label:"Cerchio",   w:5,    h:5 },
  { id:"rect",   label:"Rettangolo",w:6,    h:4 },
];

/* Colori scelti perche' si distinguono dai due eserciti e fra loro
   anche sul tavolo scuro. Il nome serve al menu, non al codice. */
export const MARKER_COLORS = [
  { id:"gold",   label:"Oro",     css:"var(--t-treasure)" },
  { id:"accent", label:"Accento", css:"var(--accent)" },
  { id:"ok",     label:"Verde",   css:"var(--ok)" },
  { id:"warn",   label:"Ambra",   css:"var(--warn)" },
  { id:"bad",    label:"Rosso",   css:"var(--bad)" },
  { id:"muted",  label:"Grigio",  css:"var(--muted)" },
  { id:"A",      label:"Esercito A", css:"var(--armyA)" },
  { id:"B",      label:"Esercito B", css:"var(--armyB)" },
];
export const markerColor = id =>
  (MARKER_COLORS.find(c => c.id === id) || MARKER_COLORS[0]).css;

export const shapeDef = id => MARKER_SHAPES.find(s => s.id === id) || MARKER_SHAPES[0];

export function makeMarker({ mid, x, y, shape = "token", label = "", color = "gold",
                             measure = false, w = null, h = null, rot = 0 } = {}){
  const def = shapeDef(shape);
  return {
    mid, x, y, rot,
    shape: def.id,
    w: w ?? def.w,
    h: h ?? (def.id === "circle" || def.id === "token" ? (w ?? def.w) : def.h),
    label: String(label || ""),
    color, measure: !!measure,
  };
}

/* riempie i buchi di un marcatore letto da un salvataggio vecchio o da
   un link, senza buttarlo via per un campo mancante */
export function ensureMarker(m, fallbackId = 0){
  if (!m || typeof m !== "object") return null;
  const def = shapeDef(m.shape);
  return {
    mid: m.mid ?? fallbackId,
    x: +m.x || 0, y: +m.y || 0, rot: +m.rot || 0,
    shape: def.id,
    w: +m.w > 0 ? +m.w : def.w,
    h: +m.h > 0 ? +m.h : (def.id === "rect" ? def.h : (+m.w > 0 ? +m.w : def.w)),
    label: String(m.label || ""),
    color: m.color || "gold",
    measure: !!m.measure,
  };
}

export const markerRound = m => m.shape === "circle" || m.shape === "token";

export function markerBox(m){
  return {
    x: m.x, y: m.y,
    w: (m.w || 1) * MM,
    h: (markerRound(m) ? (m.w || 1) : (m.h || 1)) * MM,
    rot: m.rot || 0,
  };
}

/* Quanto e' larga la sagoma, detto come lo direbbe un giocatore: un
   cerchio si nomina col raggio, un rettangolo con i due lati. */
export function markerSize(m){
  if (markerRound(m)) return `⌀ ${(+m.w).toFixed(1)}″ · raggio ${(m.w / 2).toFixed(1)}″`;
  return `${(+m.w).toFixed(1)}″ × ${(+m.h).toFixed(1)}″`;
}

/* la fotografia dei marcatori, per il report: stessa forma di quella
   del terreno, cosi' chi legge non deve imparare due formati */
export function markerSnapshot(list){
  return (list || []).map(m => ({
    mid: m.mid, shape: m.shape, label: m.label || "",
    x: Math.round(m.x / MM * 10) / 10,
    y: Math.round(m.y / MM * 10) / 10,
    w: Math.round((m.w || 0) * 10) / 10,
    h: Math.round((markerRound(m) ? m.w : m.h) * 10) / 10,
    rot: Math.round(m.rot || 0),
    measure: !!m.measure, color: m.color || "",
  }));
}

/* ============================================================
   2 · ETICHETTE
   Gli stati cablati sono tre — distrutta, in rotta, in riserva — e
   nel gioco reale quelli che ci si dimentica sono altri, e cambiano
   da un'edizione all'altra. Qui sono parole, e l'app non sa cosa
   vogliano dire.
   ============================================================ */
export const ensureTags = u => {
  if (!Array.isArray(u.tags)) u.tags = [];
  return u.tags;
};

/* una parola sola, minuscola, senza doppioni: cosi' «Carica» e
   «carica» non diventano due etichette diverse nel giro di tre turni */
export const cleanTag = t => String(t || "").trim().replace(/\s+/g, " ").slice(0, 24).toLowerCase();

export function addTag(u, raw){
  const t = cleanTag(raw);
  if (!t) return false;
  ensureTags(u);
  if (u.tags.includes(t)) return false;
  u.tags.push(t);
  return true;
}
export function removeTag(u, raw){
  const t = cleanTag(raw);
  ensureTags(u);
  const i = u.tags.indexOf(t);
  if (i < 0) return false;
  u.tags.splice(i, 1);
  return true;
}
export function toggleTag(u, raw){
  return u.tags && u.tags.includes(cleanTag(raw)) ? (removeTag(u, raw), false) : (addTag(u, raw), true);
}

/* Le etichette gia' usate in questa partita, le piu' frequenti per
   prime. Sono il dizionario dei suggerimenti, e non c'e' niente da
   mantenere: cresce da solo con quello che scrivi. */
export function tagVocabulary(units){
  const n = new Map();
  for (const u of units || []) for (const t of u.tags || []) n.set(t, (n.get(t) || 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(e => e[0]);
}

/* ============================================================
   3 · CONTATORI
   Le risorse della magia, le munizioni contate, i punti comando, le
   cariche di un oggetto: tutta roba che al tavolo si tiene con i dadi
   girati e si sbaglia. Un contatore e' un nome e un numero.
   ============================================================ */
export const ensureCounters = o => {
  if (!Array.isArray(o.counters)) o.counters = [];
  return o.counters;
};
const cleanName = s => String(s || "").trim().replace(/\s+/g, " ").slice(0, 24);

export function findCounter(o, name){
  const n = cleanName(name).toLowerCase();
  return ensureCounters(o).find(c => String(c.name).toLowerCase() === n) || null;
}
export function setCounter(o, name, value){
  const nm = cleanName(name);
  if (!nm) return null;
  let c = findCounter(o, nm);
  if (!c){ c = { name: nm, value: 0 }; ensureCounters(o).push(c); }
  c.value = Math.round(+value || 0);
  return c;
}
export function bumpCounter(o, name, delta){
  const c = findCounter(o, name) || setCounter(o, name, 0);
  c.value = Math.round((+c.value || 0) + delta);
  return c;
}
export function removeCounter(o, name){
  const list = ensureCounters(o);
  const i = list.findIndex(c => String(c.name).toLowerCase() === cleanName(name).toLowerCase());
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}
export function counterVocabulary(holders){
  const n = new Map();
  for (const h of holders || []){
    const list = h && Array.isArray(h.counters) ? h.counters : [];
    for (const c of list) n.set(c.name, (n.get(c.name) || 0) + 1);
  }
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(e => e[0]);
}

/* ============================================================
   4 · FERITE
   Il buco piu' grosso che aveva l'app: l'unica perdita che conosceva
   era il modello tolto. Va bene per venti Orc Boyz e non funziona per
   niente altro — un personaggio e' un modello con piu' ferite, un
   mostro e' un modello con parecchie, un carro ha le sue. Per tre
   quarti della partita quello che si perde sono ferite.
   Qui l'app conta e basta: non sa quando una ferita si perde, non sa
   quando un modello cade. Il giocatore decide, come al tavolo.
   ============================================================ */
export const woundsOf = u => Math.max(0, Math.round(+(u && u.wounds) || 0));

/* Quante ferite ha il profilo, se il roster lo dice. Serve solo a
   scrivere «2 / 6» invece di «2»: se non si sa, si scrive «2». */
export function woundsPerModel(u){
  const w = u && u.stats && String(u.stats.W || "").match(/^\d+$/);
  return w ? +w[0] : 0;
}
export function woundPool(u, alive){
  const per = woundsPerModel(u);
  if (!per) return 0;
  const n = alive == null ? Math.max(0, (u.models || 0) - (u.lost || 0)) : alive;
  return per * Math.max(0, n);
}
export const woundText = (u, alive) => {
  const pool = woundPool(u, alive);
  return pool ? `${woundsOf(u)} / ${pool}` : String(woundsOf(u));
};
