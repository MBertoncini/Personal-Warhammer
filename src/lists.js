/* Schieramento Old World — liste
 *
 * Una lista e' un roster salvato, con ogni unita' agganciata a una
 * voce del catalogo. L'aggancio e' il punto in cui l'app o funziona o
 * diventa lavoro manuale: quando un nome non viene riconosciuto lo
 * chiediamo UNA volta e lo ricordiamo come alias, cosi' il prossimo
 * import di quella lista passa liscio.
 *
 * Le liste arrivano da un file di New Recruit oppure si scrivono qui.
 * La seconda strada non e' un ripiego: al circolo l'avversario arriva
 * con la lista stampata, o scritta a mano, o su un telefono in un
 * formato che non e' il tuo, e senza un modo di batterla dentro l'app
 * in quel momento non serve a niente. Cinque campi bastano — nome,
 * modelli, punti, basetta, fronte: tutto il resto (profilo, regole,
 * armi) e' gia' facoltativo dappertutto nel codice.
 */

import { $, esc } from './util.js';
import { parseAny, parseRoster } from './parser.js';
import { BASES, baseById, defaultFrontage } from './bases.js';
import { askText, askConfirm, askPick, say } from './uikit.js';
import {
  catalogAll, catEntry, matchUnitName, candidatesFor,
  linkAlias, photoFor, upsertEntry, normalize, paintedOf,
  siblingsOf, pickByWeapons, entryLabel,
} from './catalog.js';
import { armiKey, classeDi, assegna } from './armi.js';
import { loadDoc, saveDoc } from './store.js';
import { attachSuggest, closeSuggest } from './suggest.js';
import { emit } from './bus.js';
import * as PREP from './prep.js';
import { loadArmies, armiesNow, coverage as armyCoverage } from './armies.js';
import { loadProfiles, splitStat } from './profiles.js';
import * as PAL from './palmares.js';
import * as MT from './mounts.js';

const LIST_KEY = "lists:all";

let lists = [];
let openId = null;
/* Il filtro dell'elenco. Vive qui e non nel DOM perché un render lo
   butterebbe via, ed è proprio durante un render — hai appena
   agganciato un'unità — che non lo vuoi perdere. */
let view = { q: "", faction: "", outcome: "", mine: "" };

export async function initLists(){
  lists = await loadDoc(LIST_KEY, []) || [];
  /* i file d'esercito: se non arrivano non succede niente, la scheda
     lo dice e il resto funziona */
  await loadArmies();
  /* e i profili che le liste non portano — il Movimento della
     cavalcatura, che per ventitre' unita' delle liste salvate e' la
     differenza fra muoversi e non muoversi */
  await loadProfiles();
  /* e le cavalcature dei personaggi: senza, la tendina non compare e
     il resto funziona */
  await MT.loadMounts();
  await healMounts();
  /* il palmarès: quante partite ha fatto ogni lista e come sono
     andate. Senza, il filtro «quelle che hanno vinto» non esiste. */
  await PAL.initPalmares();
}

const persist = () => saveDoc(LIST_KEY, lists).then(() => emit("lists:changed"));

/* Il personaggio che il file ha esportato montato ma che l'import non
   ha montato — la tabella delle cavalcature non c'era ancora, o la
   lista e' di prima che la firma si riconoscesse. Restava a piedi con
   le regole della bestia addosso: il Grey Seer della Screaming Bell era
   fanteria da 25 mm, e l'IA lo infilava nei Clanrats. Si rimonta a ogni
   caricamento, senza toccare i punti che il file conta gia'. Chi lo ha
   smontato a mano (`piedi`) resta a piedi. */
async function healMounts(){
  if (!MT.mountsNow()) return;
  let changed = false;
  for (const l of lists){
    for (const u of l.units || []){
      if (u.mountId || u.piedi) continue;
      const m = MT.guessMount(u, u.faction || (l.info && l.info.catalogue) || "");
      if (!m) continue;
      MT.mountUnit(u, m, { fromFile: true });
      changed = true;
    }
  }
  if (changed) await persist();
}

export const allLists = () => lists.slice();
export const getList = id => lists.find(l => l.id === id) || null;

const newId = () => "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ============================================================
   1 · IMPORT
   ============================================================ */
export async function importListText(text, { external = false } = {}){
  const raw = parseAny(text);
  if (!raw) throw new Error("Non riesco a leggere questo file.");
  const r = parseRoster(raw);
  if (!r.units.length) throw new Error("Nessuna unit\u00e0 trovata nel file.");

  const list = {
    id: newId(),
    name: r.rosterName || "Lista importata",
    info: { catalogue: r.catalogue, forceName: r.forceName, limit: r.limit },
    points: r.total,
    external: !!external,
    imported: new Date().toISOString(),
    /* una lista esterna non si aggancia alla collezione: l'aggancio
       serve a contare quante miniature ti mancano, e di una lista che
       non e' tua non te ne manca nessuna */
    units: r.units.map(u => ({ ...u, catId: external ? null : matchUnitName(u.name, u.weapons) })),
  };
  /* Il personaggio montato che il file esporta con la basetta e il tipo
     di truppa del cavaliere: si riconosce dalla firma della cavalcatura
     e si monta, senza sommare i punti che il file conta gia'. */
  for (const u of list.units){
    const m = MT.guessMount(u, r.catalogue);
    if (m) MT.mountUnit(u, m, { fromFile: true });
  }
  lists.push(list);
  await persist();
  openId = list.id;
  return list;
}

/* Una lista che arriva già nello schema dell'archivio: quelle trovate
   dalla ricerca (tools/liste/cerca.mjs), che il Laboratorio mostra. Ha
   un id nuovo, perché la stessa ricerca rifatta riusa i suoi; se c'è già
   una lista con le stesse unità non se ne fa una seconda. */
export async function adoptList(src){
  const firma = l => JSON.stringify((l.units || []).map(u => [u.name, u.models, u.pts]));
  const gia = lists.find(l => firma(l) === firma(src) && (l.info || {}).catalogue === (src.info || {}).catalogue);
  if (gia) return { list: gia, nuova: false };
  const list = { ...structuredClone(src), id: newId(), external: false, imported: new Date().toISOString(),
                 units: src.units.map(u => ({ ...structuredClone(u), catId: u.catId || matchUnitName(u.name, u.weapons) })) };
  lists.push(list);
  await persist();
  return { list, nuova: true };
}

/* ============================================================
   1b · LISTE SCRITTE A MANO
   ============================================================ */
export function blankUnit({ name = "Unità", models = 1, pts = 0, baseId = "25x25", troop = "" } = {}){
  const b = baseById(baseId) || baseById("25x25");
  return {
    name, models: Math.max(1, Math.round(models)), crew: 0,
    baseId: b.id, baseW: b.w, baseH: b.h,
    frontage: defaultFrontage(troop, models, false),
    loose: false,
    pts: Math.max(0, Math.round(pts)), us: 0,
    troop, unitSize: "", stats: null, rules: [], weapons: [], maxRange: 0,
    slot: "", faction: "",
    catId: matchUnitName(name),
  };
}

/* `external` e' una lista che non e' tua: quella dell'avversario
   ricopiata dal foglio, una trovata su un forum da provare in una
   partita finta, una di un torneo a cui non hai giocato. Cambia una
   cosa sola e importante — **non si confronta con la collezione** —
   perche' «mancano 18 modelli» su una lista che non devi comprare e'
   una risposta a una domanda che nessuno ha fatto, e sporca l'unico
   numero per cui quella colonna esiste. */
export async function createList(name, { external = false } = {}){
  const list = {
    id: newId(),
    name: name || (external ? "Lista esterna" : "Lista mia"),
    info: { catalogue: "", forceName: external ? "esterna" : "scritta a mano", limit: 0 },
    points: 0, byHand: true, external: !!external,
    imported: new Date().toISOString(),
    units: [],
  };
  lists.push(list);
  await persist();
  openId = list.id;
  return list;
}

/* i punti della lista sono la somma di quelli delle unita': una lista
   scritta a mano non ha un totale dichiarato da nessuna parte */
function recount(l){
  l.points = l.units.reduce((s, u) => s + (+u.pts || 0), 0);
}

export async function addUnit(listId, data){
  const l = getList(listId);
  if (!l) return null;
  const u = blankUnit(data);
  /* in una lista esterna l'aggancio non serve e confonde: conterebbe
     le miniature che ti mancano per giocare la lista di un altro */
  if (l.external) u.catId = null;
  l.units.push(u);
  recount(l);
  await persist();
  return u;
}

export async function updateUnit(listId, i, patch){
  const l = getList(listId);
  const u = l && l.units[i];
  if (!u) return;
  Object.assign(u, patch);
  if (patch.baseId){
    const b = baseById(patch.baseId);
    if (b){ u.baseW = b.w; u.baseH = b.h; }
  }
  if (patch.models != null){
    u.models = Math.max(1, Math.round(+patch.models || 1));
    u.frontage = Math.min(u.frontage || 1, u.models);
  }
  if (patch.pts != null) u.pts = Math.max(0, Math.round(+patch.pts || 0));
  recount(l);
  await persist();
}

export async function removeUnit(listId, i){
  const l = getList(listId);
  if (!l || !l.units[i]) return;
  l.units.splice(i, 1);
  recount(l);
  await persist();
}

/* Duplicare e ritoccare e' come si provano le varianti della propria
   lista fra una partita e l'altra. */
export async function duplicateList(id){
  const l = getList(id);
  if (!l) return null;
  const copy = JSON.parse(JSON.stringify(l));
  copy.id = newId();
  copy.name = l.name + " (variante)";
  /* la variante e' un'altra lista: le partite dell'originale restano
     all'originale, altrimenti si conterebbero due volte */
  copy.formerNames = [];
  copy.imported = new Date().toISOString();
  lists.push(copy);
  await persist();
  openId = copy.id;
  return copy;
}

export async function removeList(id){
  lists = lists.filter(l => l.id !== id);
  if (openId === id) openId = null;
  await persist();
}

/* Rinominare. `keepPast` porta con sé le partite giocate con i nomi di
   prima (vedi `palmares.js`); senza, la lista riparte da zero e le
   partite restano nel diario col nome che avevano. */
export async function renameList(id, name, { keepPast = true } = {}){
  const l = getList(id);
  const next = String(name || "").trim();
  if (!l || !next) return null;
  if (keepPast){
    const was = PAL.namesOf(l);
    l.formerNames = [...new Set(was.filter(n => PAL.normName(n) !== PAL.normName(next)))];
  } else l.formerNames = [];
  l.name = next;
  await persist();
  return l;
}

/* ============================================================
   1c · LA CAVALCATURA DI UN PERSONAGGIO
   `mountId` vuoto rimette il personaggio a piedi. `fromFile` e' il
   personaggio che il file di New Recruit ha gia' montato e pagato: si
   sistemano basetta, tipo di truppa e profilo, e i punti restano quelli.
   ============================================================ */
export async function setMount(listId, i, mountId, { fromFile = false } = {}){
  const l = getList(listId);
  const u = l && l.units[i];
  if (!u) return null;
  if (!mountId){ MT.dismountUnit(u); u.piedi = true; }
  else {
    const m = MT.mountById(mountId);
    if (!m) return null;
    MT.mountUnit(u, m, { fromFile });
    delete u.piedi;
  }
  recount(l);
  await persist();
  return u;
}

/* ============================================================
   2 · AGGANCIO
   ============================================================ */
export async function linkUnit(listId, unitIndex, catId){
  const l = getList(listId);
  if (!l) return;
  const u = l.units[unitIndex];
  u.catId = catId || null;
  /* sganciare a mano e' una scelta: healLinks non deve disfarla. E
     nemmeno agganciare a mano: chi mette gli arcieri sulla voce senza
     archi sa quello che fa, e le armi non lo spostano */
  if (catId){ delete u.noLink; u.linkByHand = true; }
  else { u.noLink = true; delete u.linkByHand; }
  if (catId) await linkAlias(catId, u.name);   // impara: non lo richiedera' piu'
  /* lo stesso nome in questa lista si aggancia da solo */
  for (const other of l.units) {
    if (!other.catId && normalize(other.name) === normalize(u.name)) other.catId = catId || null;
  }
  await persist();
}

/* Ri-aggancia quello che si puo' ri-agganciare: unita' rimaste senza voce
   (al momento dell'import il catalogo era vuoto) e unita' che puntano a una
   voce sparita (fusa nel suo doppione). Senza questo l'aggancio resta quello
   del giorno dell'import e le foto aggiunte dopo non si vedono mai.
   E un'unita' agganciata a una voce che ha sorelle con altre armi passa
   a quella armata come lei: la voce degli archi arriva dopo le liste, e
   gli arcieri stavano tutti sulla voce di base. Chi l'ha agganciata a
   mano resta dov'e'. */
export async function healLinks(){
  let changed = false;
  for (const l of lists){
    for (const u of l.units){
      const e = u.catId && catEntry(u.catId);
      if (e){
        if (u.linkByHand || l.external) continue;
        const sis = siblingsOf(e);
        const best = sis.length > 1 ? pickByWeapons(sis, u.weapons) : e;
        if (best && best.id !== e.id){ u.catId = best.id; changed = true; }
        continue;
      }
      if (!u.catId && u.noLink) continue;
      const id = matchUnitName(u.name, u.weapons);
      if (id !== (u.catId || null)){ u.catId = id; changed = true; }
    }
  }
  if (changed) await persist();
  return changed;
}

/* crea al volo una voce di catalogo a partire da un'unita' non agganciata */
export async function entryFromUnit(listId, unitIndex){
  const l = getList(listId);
  const u = l && l.units[unitIndex];
  if (!u) return;
  const id = await upsertEntry({
    name: u.name, faction: u.faction || l.info?.catalogue || "Altro",
    baseId: u.baseId, baseW: u.baseW, baseH: u.baseH,
    owned: u.models, aliases: [normalize(u.name)],
  }, { merge: true });   // se quel tipo c'e' gia', somma invece di duplicare
  if (id) await linkUnit(listId, unitIndex, id);
}

/* La classe delle armi di un'unita' fra le voci del tipo a cui e'
   agganciata, e la voce di quella classe (o la sua, se nessuna). */
function unitClass(u, e){
  const sis = siblingsOf(e);
  const k = classeDi(u.weapons || [], sis.map(x => armiKey(x.armi)));
  return { sis, k, home: sis.find(x => armiKey(x.armi) === k) || e };
}

/* Riepilogo di copertura di una lista rispetto alla collezione.
   Le armi contano (armi.js): un'unita' si conta sulla voce del suo tipo
   armata come lei, e le voci che si possono schierare con altre armi
   coprono quello che manca alle altre. Una riga per tipo e classe di
   armi; `prestate` dice quante vengono da voci sorelle. */
export function coverage(list){
  const types = new Map();   // capofila del tipo -> { sis, serve: Map classe -> modelli, home: Map classe -> voce }
  let unlinked = 0;
  /* una lista esterna non e' in vetrina: niente scoperto, niente da
     dipingere, niente da agganciare */
  if (list && list.external) return { rows: [], unlinked: 0, missing: 0, toPaint: 0, external: true, rowOf: () => null };
  const orphans = new Map();  // voce sparita -> modelli
  for (const u of list.units){
    if (!u.catId) { unlinked++; continue; }
    const e = catEntry(u.catId);
    if (!e){ orphans.set(u.catId, (orphans.get(u.catId) || 0) + u.models); continue; }
    const { sis, k, home } = unitClass(u, e);
    const lead = (sis[0] || e).id;
    if (!types.has(lead)) types.set(lead, { sis, serve: new Map(), home: new Map() });
    const t = types.get(lead);
    t.serve.set(k, (t.serve.get(k) || 0) + u.models);
    if (!t.home.has(k)) t.home.set(k, home);
  }
  /* `armi` e' la classe della riga: due classi possono finire sulla
     stessa voce (i Night Goblin con le lance, quando in vetrina ci sono
     solo quelli con l'arco), e sono due righe */
  const row = (e, id, n, short, prestate, armi = "") => {
    const owned = e ? +e.owned || 0 : 0;
    const painted = paintedOf(e);
    const sue = !e || armiKey(e.armi) === armi;
    return {
      id, entry: e, armi, need: n, owned, painted, short, prestate,
      /* quante ne resterebbero da dipingere per giocare questa lista:
         non piu' di quante ne possiedi, il resto e' roba da comprare.
         Una classe che la voce non ha non si dipinge: si compra. */
      toPaint: sue ? Math.max(0, Math.min(n, owned) - painted) : 0,
    };
  };
  const rows = [...orphans].map(([id, n]) => row(null, id, n, n, 0));
  for (const t of types.values()){
    const r = assegna(t.serve, t.sis.map(x => ({ armi: armiKey(x.armi), libere: !!x.altreArmi, n: +x.owned || 0 })));
    for (const [k, n] of t.serve){
      const e = t.home.get(k);
      rows.push(row(e, e.id, n, r.manca.get(k) || 0, r.prestate.get(k) || 0, k));
    }
  }
  const rowOf = u => {
    const e = u.catId && catEntry(u.catId);
    if (!e) return null;
    const { home, k } = unitClass(u, e);
    return rows.find(x => x.id === home.id && x.armi === k) || null;
  };
  return {
    rows, unlinked, rowOf,
    missing: rows.reduce((s, r) => s + r.short, 0),
    toPaint: rows.reduce((s, r) => s + r.toPaint, 0),
  };
}

/* ============================================================
   3 · INTERFACCIA
   ============================================================ */
/* La barra dei filtri. Le fazioni non sono un elenco scritto a mano:
   sono quelle che stanno davvero nell'archivio, con quante liste per
   ognuna — un menu con dodici fazioni di cui ne hai tre è un menu che
   si legge male. */
/* «Togli i filtri» compare in due posti — nella barra e dentro il
   messaggio di elenco vuoto — e per un attimo ha avuto lo stesso id in
   tutti e due: `querySelector` ne trova uno solo, e quello dentro il
   messaggio era un pulsante che non faceva niente. Che e' peggio di un
   pulsante che non c'e'. */
const emptyFilterHTML = () =>
  `<p class="empty">Nessuna lista con questi filtri. <button class="btn tiny" data-clear="1">Togli i filtri</button></p>`;

function wireClear(host){
  for (const b of host.querySelectorAll("[data-clear]"))
    b.addEventListener("click", () => { view = { q:"", faction:"", outcome:"", mine:"" }; renderLists(); });
}

function wireOpen(host){
  host.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => {
    openId = b.dataset.open; renderLists();
  }));
}

function filterBarHTML(){
  const facts = factionsOf();
  const opt = (v, label, sel) => `<option value="${esc(v)}"${sel === v ? " selected" : ""}>${esc(label)}</option>`;
  const active = view.q || view.faction || view.outcome || view.mine;
  return `
    <div class="bar ls-filters">
      <input type="search" id="ls-q" placeholder="Cerca: nome, esercito, o un'unità dentro (\u00abclanrats\u00bb)"
             value="${esc(view.q)}" style="min-width:220px">
      <select id="ls-faction" title="L'esercito dichiarato nel file">
        ${opt("", "ogni esercito", view.faction)}
        ${facts.map(([f, n]) => opt(f, `${f} (${n})`, view.faction)).join("")}
      </select>
      <select id="ls-outcome" title="Dal diario delle partite: il palmarès di una lista è quello del suo nome">
        ${opt("", "giocate o no", view.outcome)}
        ${opt("won", "hanno vinto", view.outcome)}
        ${opt("lost", "hanno perso", view.outcome)}
        ${opt("played", "già giocate", view.outcome)}
        ${opt("never", "mai giocate", view.outcome)}
      </select>
      <select id="ls-mine" title="Le liste esterne sono quelle che non hai in vetrina">
        ${opt("", "mie ed esterne", view.mine)}
        ${opt("mine", "solo le mie", view.mine)}
        ${opt("ext", "solo le esterne", view.mine)}
      </select>
      ${active ? `<button class="btn tiny ghost" data-clear="1">Togli i filtri</button>` : ""}
    </div>`;
}

export function renderLists(){
  const host = $("#lists");
  if (!host) return;
  const shown = filterLists();

  host.innerHTML = `
    <div class="bar">
      <button class="btn primary" id="ls-import">Importa da New Recruit</button>
      <button class="btn" id="ls-paste">Incolla JSON\u2026</button>
      <button class="btn" id="ls-new" title="Per la lista che l'avversario ti mostra stampata">Nuova lista a mano</button>
      <button class="btn" id="ls-ext" title="Una lista che non è tua: quella dell'avversario, una da provare in una partita finta, una vista a un torneo. Non si confronta con la collezione.">Lista esterna…</button>
      ${openId ? `<button class="btn" id="ls-dup">Duplica questa lista</button>` : ""}
    </div>
    <div id="ls-paste-box" hidden>
      <textarea id="ls-paste-area" rows="5" placeholder="Incolla qui il contenuto del file\u2026"></textarea>
      <label class="dice-anim" style="margin-top:6px"><input type="checkbox" id="ls-paste-ext"> è una lista esterna (non si confronta con la collezione)</label>
      <button class="btn tiny primary" id="ls-paste-ok" style="margin-top:6px">Importa</button>
    </div>
    <input type="file" id="ls-file" accept=".json,.ros,.xml" hidden>
    ${filterBarHTML()}
    <div class="ls-split">
      <div class="ls-side">
        ${lists.length
          ? (shown.length ? shown.map(listRowHTML).join("")
             : emptyFilterHTML())
          : `<p class="empty">Nessuna lista salvata.</p>`}
      </div>
      <div class="ls-detail">${openId ? detailHTML(getList(openId)) : `<p class="empty">Scegli una lista.</p>`}</div>
    </div>`;

  /* i filtri. Il testo si applica mentre si scrive e non ridisegna il
     campo: rifare l'input a ogni lettera sposta il cursore, ed e' il
     modo piu' rapido di rendere inusabile una ricerca. */
  const qEl = $("#ls-q");
  if (qEl) qEl.addEventListener("input", e => {
    view.q = e.target.value;
    const side = host.querySelector(".ls-side");
    const now = filterLists();
    if (side) side.innerHTML = now.length
      ? now.map(listRowHTML).join("")
      : emptyFilterHTML();
    wireOpen(host);
    wireClear(host);
  });
  for (const [sel, key] of [["#ls-faction", "faction"], ["#ls-outcome", "outcome"], ["#ls-mine", "mine"]]){
    const el = $(sel);
    if (el) el.addEventListener("change", () => { view[key] = el.value; renderLists(); });
  }
  wireClear(host);

  $("#ls-import").addEventListener("click", () => $("#ls-file").click());
  $("#ls-file").addEventListener("change", async e => {
    for (const f of e.target.files) {
      try { await importListText(await f.text()); }
      catch (err) { await say(err.message, { title:"Non riesco a leggerlo" }); }
    }
    e.target.value = "";
    renderLists();
  });
  $("#ls-paste").addEventListener("click", () => {
    const b = $("#ls-paste-box"); b.hidden = !b.hidden;
  });
  $("#ls-paste-ok").addEventListener("click", async () => {
    try {
      await importListText($("#ls-paste-area").value, { external: $("#ls-paste-ext").checked });
      renderLists();
    }
    catch (err) { await say(err.message, { title:"Non riesco a leggerlo" }); }
  });
  $("#ls-new").addEventListener("click", async () => {
    const n = await askText({ title:"Nuova lista a mano",
      label:"Poi ci aggiungi le unità una a una: nome, modelli, punti e basetta.",
      value:"Lista mia", placeholder:"Come si chiama" });
    if (n === null) return;
    await createList(n.trim() || "Lista mia");
    renderLists();
  });
  $("#ls-ext").addEventListener("click", async () => {
    const n = await askText({ title:"Lista esterna",
      label:"Non è tua: non si confronta con la collezione e non chiede cosa ti manca. " +
            "Serve a provarla in una partita finta e a tenere il conto di come vanno le liste degli altri. " +
            "Le unità si aggiungono a mano, oppure si incolla il file con «Incolla JSON».",
      value:"Lista esterna", placeholder:"Come si chiama" });
    if (n === null) return;
    await createList(n.trim() || "Lista esterna", { external: true });
    renderLists();
  });

  const dup = $("#ls-dup");
  if (dup) dup.addEventListener("click", async () => { await duplicateList(openId); renderLists(); });

  wireOpen(host);
  host.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async e => {
    e.stopPropagation();
    if (await askConfirm("La lista sparisce dall'archivio. Gli schieramenti salvati restano dove sono.",
                         { title:"Eliminare la lista?" })){
      await removeList(b.dataset.del); renderLists();
    }
  }));

  /* ---- modifica a mano: vale per qualsiasi lista, anche importata.
     Se New Recruit ha sbagliato una basetta o se aggiungi un'unità
     all'ultimo momento, si corregge qui invece di riesportare. ---- */
  host.querySelectorAll("[data-uf]").forEach(el => el.addEventListener("change", async () => {
    const [id, i, field] = el.dataset.uf.split("|");
    await updateUnit(id, +i, { [field]: el.type === "number" ? +el.value : el.value });
    renderLists();
  }));
  /* La scheda di preparazione. Un campo solo per volta, e si salva
     appena si esce dal campo: chi la compila lo fa mentre monta il
     tavolo, e un pulsante «salva» in fondo si dimentica. */
  host.querySelectorAll("[data-prep]").forEach(el => el.addEventListener("change", async () => {
    const [id, field] = el.dataset.prep.split("|");
    const l = getList(id);
    if (!l) return;
    const v = el.value.trim();
    if (field === "general" || field === "bsb") PREP.setPrep(l, { [field]: v === "" ? null : +v });
    else if (field === "note") PREP.setPrep(l, { note: v });
    else {
      const kind = field[0], i = +field.slice(1);
      if (kind === "p") PREP.setUnitPrep(l, i, { shield: v === "" ? null : v === "1" });
      else PREP.setUnitPrep(l, i, { w:"weapon", s:"spells", i:"items" }[kind]
        ? { [{ w:"weapon", s:"spells", i:"items" }[kind]]: v } : {});
    }
    await persist();
    renderLists();
  }));

  /* rinominare: le partite giocate col nome di prima restano alla lista
     se chi rinomina lo vuole — correggere un refuso non cambia la lista,
     cambiarne la natura sì, e lo sa solo chi la rinomina */
  host.querySelectorAll("[data-ren]").forEach(b => b.addEventListener("click", async () => {
    const l = getList(b.dataset.ren);
    if (!l) return;
    const n = await askText({ title:"Rinomina la lista", label:"Il nome con cui compare nell'elenco, sul tavolo e nel diario delle partite.",
                              value: l.name, placeholder:"Come si chiama" });
    if (n === null || !n.trim() || n.trim() === l.name) return;
    /* Senza partite non c'e' niente da portarsi dietro, e tenere il nome
       vecchio sarebbe un aggancio invisibile: «Tutto» e' il nome di due
       liste, e quella rinominata finirebbe per pescare le partite
       dell'altra. */
    const rec = PAL.recordOf(PAL.namesOf(l));
    let keepPast = false;
    if (rec.played){
      const pick = await askPick({ title:"E le partite già giocate?",
        label:`«${l.name}» ha ${PAL.recordText(rec)}. Il palmarès si aggancia per nome: col nome nuovo, le partite di prima restano sue o la lista riparte da zero? Nel diario non cambia niente in nessuno dei due casi.`,
        options:[{ id:"keep", label:"Restano sue" }, { id:"fresh", label:"Riparte da zero" }] });
      if (!pick) return;
      keepPast = pick === "keep";
    }
    await renameList(l.id, n, { keepPast });
    renderLists();
  }));

  /* la cavalcatura: la tendina, e il pulsante del file gia' montato */
  host.querySelectorAll("[data-mount]").forEach(sel => sel.addEventListener("change", async () => {
    const [id, i] = sel.dataset.mount.split("|");
    await setMount(id, +i, sel.value || null);
    renderLists();
  }));
  host.querySelectorAll("[data-mguess]").forEach(b => b.addEventListener("click", async () => {
    const [id, i, mid] = b.dataset.mguess.split("|");
    await setMount(id, +i, mid, { fromFile: true });
    renderLists();
  }));

  host.querySelectorAll("[data-urm]").forEach(b => b.addEventListener("click", async () => {
    const [id, i] = b.dataset.urm.split("|");
    await removeUnit(id, +i);
    renderLists();
  }));
  const addBtn = $("#ls-add-unit");
  if (addBtn) addBtn.addEventListener("click", async () => {
    const name = $("#ls-add-name").value.trim();
    if (!name){ $("#ls-add-name").focus(); return; }
    await addUnit(openId, {
      name,
      models: +$("#ls-add-models").value || 1,
      pts: +$("#ls-add-pts").value || 0,
      baseId: $("#ls-add-base").value,
    });
    renderLists();
    const again = $("#ls-add-name");
    if (again){ again.value = ""; again.focus(); }
  });
  host.querySelectorAll("[data-link]").forEach(sel => sel.addEventListener("change", async () => {
    const [id, i] = sel.dataset.link.split("|");
    if (sel.value === "__new__") await entryFromUnit(id, +i);
    else await linkUnit(id, +i, sel.value || null);
    renderLists();
  }));

  host.querySelectorAll("[data-ext]").forEach(el => el.addEventListener("change", async () => {
    const l = getList(el.dataset.ext);
    if (!l) return;
    l.external = el.checked;
    /* diventando esterna perde l'aggancio alla collezione, e
       tornando tua se lo riprende: tenerlo a meta' vorrebbe dire una
       lista che conta un po' nella vetrina e un po' no */
    for (const u of l.units) u.catId = l.external ? null : matchUnitName(u.name, u.weapons);
    await persist();
    renderLists();
  }));

  wireSuggest(host);
}

/* ---- il catalogo che si propone da solo ----
   Un nome battuto a mano che non combacia con nessuna voce diventa
   subito un'unita' «da agganciare», cioe' lavoro da rifare dopo. Se
   invece la voce si sceglie mentre si scrive, il nome e' quello giusto
   e l'aggancio e' gia' fatto. */
function wireSuggest(host){
  closeSuggest();   // il render ha appena buttato via i campi di prima

  /* riga «Aggiungi un'unita'»: il nome, e con lui la basetta che quel
     tipo ha in collezione, che e' il campo che nessuno ricontrolla */
  attachSuggest($("#ls-add-name"), e => {
    $("#ls-add-name").value = e.name;
    const base = $("#ls-add-base");
    if (base && e.baseId && [...base.options].some(o => o.value === e.baseId)) base.value = e.baseId;
    $("#ls-add-models").focus();
    $("#ls-add-models").select();
  });

  /* nomi delle unita' gia' in lista: correggere il nome qui vale anche
     come aggancio, che e' il motivo per cui di solito lo si corregge */
  host.querySelectorAll('[data-uf$="|name"]').forEach(inp => {
    const [id, i] = inp.dataset.uf.split("|");
    attachSuggest(inp, async e => {
      /* prima il campo, poi l'archivio: l'invio che sceglie dalla tendina
         fa partire subito dopo anche il «change» del campo, e quello
         riscriverebbe il nome monco che c'era scritto a meta' */
      inp.value = e.name;
      await updateUnit(id, +i, { name: e.name });
      await linkUnit(id, +i, e.id);
      renderLists();
    });
  });
}

/* ------------------------------------------------------------------
   La scheda di una lista nell'elenco.

   Prima era una riga: nome, fazione, punti, e una spunta sullo stato
   della collezione. Va bene con cinque liste; con venti serve sapere
   a colpo d'occhio **di che esercito è** e **come è andata**, che sono
   le due domande per cui uno apre l'elenco.

   Le facce delle unità sono le foto della collezione, quattro al
   massimo: è il modo più corto di riconoscere una lista senza
   leggerne il nome, e le foto ci sono già.
   ------------------------------------------------------------------ */
const FACES = 4;

function facesOf(l){
  const out = [];
  for (const u of l.units || []){
    if (out.length >= FACES) break;
    const p = u.catId && photoFor(u.catId);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

/* Il chip di un'unita': i suoi modelli su quanti ne hai. Rosso se alla
   lista mancano miniature di quel tipo armate come lei; giallo se le
   prende in prestito da una voce che si schiera con altre armi; il
   perche' nel title. */
function unitChipHTML(l, u, e){
  const row = coverage(l).rowOf(u);
  const why = [];
  if (row && row.short) why.push(`nella lista ne mancano ${row.short}`);
  if (row && row.prestate) why.push(`${row.prestate} prese da voci che si schierano con altre armi`);
  if (armiKey(e.armi) && !classeDi(u.weapons || [], [armiKey(e.armi)]))
    why.push(`queste miniature hanno ${e.armi}, l'unità no`);
  const key = row && row.short ? "bad" : row && row.prestate ? "warn" : "ok";
  return `<span class="chip ${key}"${why.length ? ` title="${esc(why.join(" · "))}"` : ""}>${
    u.models}/${e.owned}${row && row.prestate ? "+" + row.prestate : ""}</span>`;
}

function listRowHTML(l){
  const ext = !!l.external;
  const c = coverage(l);
  /* una lista esterna non è in vetrina: dirle «mancano 18 modelli» è
     rispondere a una domanda che nessuno ha fatto */
  const key = ext ? "" : c.unlinked ? "warn" : c.missing ? "bad" : c.toPaint ? "warn" : "ok";
  const txt = ext ? "esterna"
            : c.unlinked ? `${c.unlinked} da agganciare`
            : c.missing ? `mancano ${c.missing}`
            : c.toPaint ? `${c.toPaint} da dipingere` : "completa";
  const rec = PAL.recordOf(PAL.namesOf(l));
  const faces = ext ? [] : facesOf(l);
  /* La scheda è due righe e non tre colonne: il nome di una lista è
     lungo («Il Monolite nella Giungla») e la fazione pure, e messi in
     colonna accanto a una spunta finivano tutti e due in puntini —
     cioè proprio le due cose per cui si guarda l'elenco. In fondo,
     sulla larghezza piena, ci stanno. */
  return `
    <div class="ls-card${l.id === openId ? " sel" : ""}${ext ? " ext" : ""}" data-open="${l.id}">
      <div class="ls-faces">${faces.length
        ? faces.map(p => `<img src="${p}" alt="" loading="lazy">`).join("")
        : `<span class="ph">${ext ? "\u2197" : "\u2014"}</span>`}</div>
      <div class="ls-body">
        <b class="ls-name" title="${esc(l.name)}">${esc(l.name)}</b>
        <span class="mono">${esc(l.info?.catalogue || "senza esercito")}</span>
      </div>
      <div class="ls-foot">
        <span class="mono dim">${l.units.length} unit\u00e0 \u00b7 ${l.points} pt</span>
        ${rec.played ? `<span class="ls-rec" title="${esc(PAL.recordText(rec))}">${
          rec.won ? `<span class="w">${rec.won}V</span>` : ""}${
          rec.draw ? `<span class="d">${rec.draw}P</span>` : ""}${
          rec.lost ? `<span class="l">${rec.lost}S</span>` : ""}
          <span class="dim">${rec.pts}\u2013${rec.against}</span></span>`
        : ""}
        <span class="chip ${key}">${txt}</span>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------
   I filtri.
   Tre domande che al circolo ci si fa davvero: «quali liste hanno i
   Clanrats?», «quali sono di Ogre?», «quali hanno vinto?». La prima
   guarda dentro le unità e non solo il nome della lista, che è il
   motivo per cui una ricerca sul nome non bastava.
   ------------------------------------------------------------------ */
const norm = s => String(s || "").toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function factionsOf(all = lists){
  const seen = new Map();
  for (const l of all){
    const f = (l.info && l.info.catalogue) || "";
    if (!f) continue;
    seen.set(f, (seen.get(f) || 0) + 1);
  }
  return [...seen].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function filterLists(all = lists, v = view){
  const q = norm(v.q).trim();
  const words = q ? q.split(/\s+/) : [];
  return all.filter(l => {
    if (v.faction && ((l.info && l.info.catalogue) || "") !== v.faction) return false;
    if (v.mine === "mine" && l.external) return false;
    if (v.mine === "ext" && !l.external) return false;
    if (v.outcome){
      const r = PAL.recordOf(PAL.namesOf(l));
      if (v.outcome === "won" && !r.won) return false;
      if (v.outcome === "lost" && !r.lost) return false;
      if (v.outcome === "played" && !r.played) return false;
      if (v.outcome === "never" && r.played) return false;
    }
    if (!words.length) return true;
    /* il testo cercato dentro tutto quello che una lista sa dire di sé:
       il nome, l'esercito, e i nomi delle unità — «clan rats» */
    const hay = norm([l.name, (l.info && l.info.catalogue) || "",
                      (l.info && l.info.forceName) || "",
                      ...(l.units || []).map(u => u.name)].join(" "));
    return words.every(w => hay.includes(w));
  });
}

/* ============================================================
   3 bis · LA SCHEDA DI PREPARAZIONE
   Le cinque cose che il file di New Recruit non dice mai e che servono
   dal primo turno: chi comanda, chi porta lo stendardo, quali
   incantesimi sono usciti, quale arma impugna chi ne ha due, cosa c'e'
   scritto sugli oggetti magici. Si compila una volta e resta salvata
   con la lista, quindi entra nel backup e nella sincronia senza che
   nessun altro modulo debba saperlo.

   Il pannello mostra prima le domande aperte e poi le risposte gia'
   date: uno che mostra solo i buchi sembra pieno di buchi anche quando
   e' quasi finito.
   ============================================================ */
/* Le regole d'esercito della lista: quante l'app ne applica e quali no.
   Il numero da solo non serve — «tre su cinque» non dice quali due
   restano in mano tua — quindi le due che restano si leggono per nome
   e con il perche'. */
function armyHTML(l){
  const A = armiesNow();
  if (!A) return "";
  const army = A.forList(l);
  if (!army) return `<p class="note">Regole d'esercito: nessun file per «${esc((l.info || {}).catalogue || "?")}». Si aggiunge un file in <code>dati/eserciti/</code> senza toccare il codice.</p>`;
  const c = armyCoverage(army);
  if (!c.total) return `<p class="note">${esc(army.name)}: il file c'è, le regole no. ${esc(army.nota || "")}</p>`;
  return `
    <div class="prep-army">
      <p class="note"><b>${esc(army.name)}</b> · ${c.total} regole d'esercito${
        army.book && army.book.title ? " (" + esc(army.book.title) + ")" : ""}:
        ${c.applied.length} applicate, ${c.manual.length} in mano tua.</p>
      ${c.manual.length ? `<ul class="prep-open">${c.manual.map(m =>
        `<li><b>${esc(m.name)}</b>${m.page ? ` (p. ${m.page})` : ""} — ${esc(m.why)}</li>`).join("")}</ul>` : ""}
      ${c.unverified.length ? `<p class="note">Da verificare sul libro: ${c.unverified.map(m => esc(m.name)).join(", ")} —
        nessuna lista salvata le porta per esteso, e le righe vengono da un riassunto.</p>` : ""}
    </div>`;
}

function prepHTML(l){
  const p = PREP.prepOf(l);
  const open = PREP.questions(l);
  const done = PREP.answered(l);
  const chars = PREP.characters(l);
  const pick = (field, sel, empty) => `
    <select data-prep="${l.id}|${field}">
      <option value="">${empty}</option>
      ${chars.map(c => `<option value="${c.i}" ${String(sel) === String(c.i) ? "selected" : ""}>${esc(c.u.name)}</option>`).join("")}
    </select>`;

  const perUnit = (l.units || []).map((u, i) => {
    const mine = (p.units || {})[i] || {};
    const arms = (u.weapons || []).filter(w => !/\d/.test(String(w.range || "")));
    const wizard = (u.rules || []).some(r => /\bwizard\b|\blore of\b|\bmago\b|level \d/i.test(String(r)));
    const shield = PREP.needsShield(u);
    if (arms.length < 2 && !wizard && !shield && !PREP.isCharacter(u)) return "";
    return `
      <div class="row prep-row">
        <span class="nm"><b>${esc(u.name)}</b></span>
        ${arms.length > 1 ? `<select data-prep="${l.id}|w${i}" title="Arma impugnata">
          <option value="">— quale arma impugna —</option>
          ${arms.map(w => `<option value="${esc(w.name)}" ${mine.weapon === w.name ? "selected" : ""}>${esc(w.name)}</option>`).join("")}
        </select>` : ""}
        ${shield ? `<select data-prep="${l.id}|p${i}" title="Parry: con arma a una mano e scudo, +1 all'armatura in mischia">
          <option value="" ${mine.shield == null ? "selected" : ""}>— ha lo scudo? (Parry) —</option>
          <option value="1" ${mine.shield === true ? "selected" : ""}>con lo scudo</option>
          <option value="0" ${mine.shield === false ? "selected" : ""}>senza scudo</option>
        </select>` : ""}
        ${wizard ? `<input type="text" data-prep="${l.id}|s${i}" placeholder="incantesimi generati (p. 106)" value="${esc(mine.spells || "")}">` : ""}
        ${PREP.isCharacter(u) ? `<input type="text" data-prep="${l.id}|i${i}" placeholder="oggetti magici" value="${esc(mine.items || "")}">` : ""}
      </div>`;
  }).join("");

  /* Si può giocare? La domanda che l'app non si faceva, e che per una
     lista scritta a mano fa la differenza fra una partita e trenta
     pareggi a zero morti (vedi il §4 di `prep.js`). */
  const play = PREP.playability(l, { split: splitStat });

  return `
    <details class="prep" ${open.length || !play.can ? "open" : ""}>
      <summary class="panel-title">Scheda di preparazione
        <span class="chip ${!play.can ? "warn" : open.length ? "warn" : "ok"}">${
          !play.can ? play.bad.length + " senza profilo" : open.length ? open.length + " da decidere" : "a posto"}</span>
      </summary>
      <p class="note">Quello che il file di New Recruit non dice mai. Si compila una volta e resta con la lista.</p>
      ${!play.can ? `<p class="note" style="color:var(--bad)"><b>Non si può simulare tutta:</b> ${esc(play.text)}.
        Senza profilo l'app non tira niente e non lo direbbe: i conti verrebbero zero contro zero.
        Si rimedia reimportando la lista da New Recruit, o aggiungendo il profilo in
        <code>dati/profili.json</code> con il libro e la pagina accanto.</p>`
        : play.fixed.length ? `<p class="note">${esc(play.text)} — i numeri che il file non porta
          (il Movimento della cavalcatura, l'Abilità dei servitori) vengono da
          <code>dati/profili.json</code>, con libro e pagina.</p>` : ""}
      <div class="prep-grid">
        <label class="field">Generale${pick("general", p.general, "— chi comanda —")}</label>
        <label class="field">Stendardo da battaglia${pick("bsb", p.bsb, "— nessuno —")}</label>
      </div>
      ${perUnit}
      ${armyHTML(l)}
      <label class="field">Nota per questa lista
        <input type="text" data-prep="${l.id}|note" value="${esc(p.note || "")}" placeholder="regole d'esercito, accordi presi, quello che serve ricordare">
      </label>
      ${open.length ? `<ul class="prep-open">${open.map(q =>
        `<li><b>${esc(q.what)}</b> — ${esc(q.why)}</li>`).join("")}</ul>` : ""}
      ${done.length ? `<p class="note">Già deciso: ${done.map(d =>
        esc(d.what + " " + d.value)).join(" · ")}</p>` : ""}
    </details>`;
}

/* Il palmarès della lista: com'è andata, partita per partita.
   Sta nella scheda della lista e non solo nel diario perché la domanda
   «questa lista come va?» ci si fa guardando la lista, non scorrendo
   le partite. L'aggancio è per nome — quello di adesso e quelli che la
   lista si è portata dietro rinominandola. */
function palmaresHTML(l){
  const r = PAL.recordOf(PAL.namesOf(l));
  if (!r.played) return `<p class="note dim">Mai giocata. Le partite si segnano nella scheda <b>Partite</b>, e da lì tornano qui.</p>`;
  const row = g => `
    <div class="readout"><span>${esc(g.date || "senza data")} \u00b7 contro ${esc(g.foe || "?")}${
      g.turns ? "" : " <span class=\"dim\">(solo il risultato)</span>"}</span>
      <b style="color:var(--${g.how === "won" ? "ok" : g.how === "lost" ? "bad" : "muted"})">${
        g.how === "won" ? "vinta" : g.how === "lost" ? "persa" : "pari"} ${g.mine}\u2013${g.theirs}</b></div>`;
  return `
    <div class="prep-army">
      <p class="note"><b>${esc(PAL.recordText(r))}</b> \u00b7 ${r.pts} punti fatti, ${r.against} presi.</p>
      ${r.games.slice(0, 6).map(row).join("")}
      ${r.games.length > 6 ? `<p class="note dim">e altre ${r.games.length - 6}.</p>` : ""}
    </div>`;
}

/* ------------------------------------------------------------------
   La cavalcatura, sotto ogni personaggio.
   Prima quelle che il libro gli concede, poi le altre del suo esercito:
   l'app propone, non impedisce, e chi sceglie fuori dal libro lo legge
   scritto nel gruppo. Il personaggio che il file ha esportato gia'
   montato — con le corna dello Stegadon fra le armi ma la basetta da
   25 mm — ha il suo pulsante: un clic e basetta, tipo di truppa e
   profilo tornano quelli veri, senza pagare la bestia due volte.
   ------------------------------------------------------------------ */
function mountHTML(l, u, i){
  if (!MT.mountsNow() || !(PREP.isCharacter(u) || u.mountId)) return "";
  const faction = u.faction || (l.info && l.info.catalogue) || "";
  const { book, other } = MT.mountOptions(u, faction);
  const guess = !u.mountId ? MT.guessMount(u, faction) : null;
  /* uno Slann o un Warlock Engineer non montano niente: una tendina di
     cavalcature che il libro non gli da' sarebbe solo rumore sotto ogni
     personaggio. Compare quando il libro ne concede almeno una, quando
     il file ne lascia intravedere una, o quando ce n'e' gia' una. */
  if (!book.length && !guess && !u.mountId) return "";
  const opt = m => `<option value="${esc(m.id)}"${m.id === u.mountId ? " selected" : ""}>${
    esc(m.nome)} \u00b7 +${m.punti} pt \u00b7 ${esc(m.genere)} (${esc(m.libro)}, p. ${m.pagina})</option>`;
  const known = [...book, ...other].some(m => m.id === u.mountId);
  const cur = u.mountId && !known ? MT.mountById(u.mountId) : null;
  const who = esc(u.baseName || u.name);
  return `
    <div class="umount">
      <label class="field inline">Cavalcatura
        <select data-mount="${l.id}|${i}">
          <option value="">a piedi</option>
          ${cur ? opt(cur) : ""}
          ${book.length ? `<optgroup label="Dal libro, per ${who}">${book.map(opt).join("")}</optgroup>` : ""}
          ${other.length ? `<optgroup label="Altre${faction ? " dell'esercito" : ""} (il libro non le dà a ${who})">${other.map(opt).join("")}</optgroup>` : ""}
        </select>
      </label>
      ${u.mountId ? `<span class="note dim">${u.mountFromFile
          ? "i punti della bestia erano già nel file"
          : "+" + (u.mountPts || 0) + " pt della bestia"}</span>` : ""}
      ${guess ? `<span class="chip warn" title="Il file porta ${esc((guess.firma || []).map(g => g.join(" + ")).join(" / "))} ma la basetta e il tipo di truppa del cavaliere">sembra su ${esc(guess.nome)}</span>
        <button class="btn tiny" data-mguess="${l.id}|${i}|${esc(guess.id)}" title="Basetta, tipo di truppa e profilo della cavalcatura; i punti restano quelli del file">Applica</button>` : ""}
    </div>`;
}

function detailHTML(l){
  if (!l) return `<p class="empty">Lista non trovata.</p>`;
  const cat = catalogAll();
  return `
    <div class="panel-title">${esc(l.name)}
      <button class="btn tiny ghost" data-ren="${l.id}" title="Rinomina la lista">Rinomina</button>
      <button class="btn tiny ghost" data-del="${l.id}" style="color:var(--bad);float:right">Elimina</button></div>
    ${(l.formerNames || []).length ? `<p class="note dim">Prima si chiamava ${(l.formerNames || []).map(n => "«" + esc(n) + "»").join(", ")}: le partite giocate con quei nomi restano sue.</p>` : ""}
    <p class="note">${esc([l.info?.catalogue, l.info?.forceName,
      l.info?.limit ? "limite " + l.info.limit + " pt" : ""].filter(Boolean).join(" \u00b7 "))}</p>
    <label class="dice-anim" title="Una lista esterna non è in vetrina: non si confronta con la collezione e non chiede cosa ti manca">
      <input type="checkbox" data-ext="${l.id}"${l.external ? " checked" : ""}> lista esterna</label>
    ${palmaresHTML(l)}
    <div class="tray">
      ${l.units.map((u, i) => {
        const e = u.catId && catEntry(u.catId);
        const p = e && photoFor(e.id);
        const cands = u.catId ? [] : candidatesFor(u.name, 4);
        const options = cands.length
          ? cands.map(c => `<option value="${c.entry.id}">${esc(entryLabel(c.entry))} (${Math.round(c.score * 100)}%)</option>`).join("")
          : "";
        const rest = cat.filter(x => !cands.some(c => c.entry.id === x.id) && x.id !== u.catId)
          .map(x => `<option value="${x.id}">${esc(entryLabel(x))}</option>`).join("");
        return `
        <div class="row u-row">
          <span class="nm">
            <b><span class="txt">${esc(u.name)}</span></b>
            <span class="mono">${u.models} modelli \u00b7 ${u.pts} pt${
              u.mountId ? " \u00b7 " + esc(MT.mountLabel(u)) : ""}</span>
          </span>
          ${e
            ? unitChipHTML(l, u, e)
            : `<span class="chip warn">da agganciare</span>`}
          <span class="minis">
            ${p ? Array.from({ length: Math.min(u.models, 24) },
                  () => `<img class="mdl" src="${p}" alt="" loading="lazy">`).join("") : ""}
          </span>
          <select class="link" data-link="${l.id}|${i}">
            <option value="">${e ? esc(entryLabel(e)) : "\u2014 scegli dal catalogo \u2014"}</option>
            ${options}${rest}
            <option value="__new__">+ crea voce "${esc(u.name)}"</option>
          </select>
          <div class="uedit">
            <input type="text" data-uf="${l.id}|${i}|name" value="${esc(u.name)}" title="Nome">
            <input type="number" min="1" max="200" data-uf="${l.id}|${i}|models" value="${u.models}" title="Modelli">
            <input type="number" min="0" data-uf="${l.id}|${i}|pts" value="${u.pts || 0}" title="Punti">
            <select data-uf="${l.id}|${i}|baseId" title="Basetta">
              ${BASES.map(b => `<option value="${b.id}" ${b.id === u.baseId ? "selected" : ""}>${esc(b.label)}</option>`).join("")}
              ${u.baseId === "custom" ? `<option value="custom" selected>Personalizzata (${u.baseW}×${u.baseH})</option>` : ""}
            </select>
            <button class="btn tiny ghost" data-urm="${l.id}|${i}" title="Togli dalla lista" style="color:var(--bad)">×</button>
          </div>
          ${mountHTML(l, u, i)}
        </div>`;
      }).join("")}
    </div>
    ${prepHTML(l)}
    <div class="addunit">
      <div class="panel-title">Aggiungi un'unità</div>
      <p class="note">Bastano nome, modelli, punti e basetta. Profilo, regole e armi sono facoltativi dappertutto: senza, l'app disegna e conta lo stesso.</p>
      <p class="note">Mentre scrivi il nome, il catalogo propone le voci che hai in collezione: sceglierne una porta con sé la basetta giusta e l'aggancio già fatto.</p>
      <div class="addrow">
        <input type="text" id="ls-add-name" placeholder="Nome dell'unità">
        <input type="number" id="ls-add-models" min="1" max="200" value="10" title="Modelli">
        <input type="number" id="ls-add-pts" min="0" value="0" title="Punti">
        <select id="ls-add-base">
          ${BASES.map(b => `<option value="${b.id}" ${b.id === "25x25" ? "selected" : ""}>${esc(b.label)}</option>`).join("")}
        </select>
        <button class="btn tiny primary" id="ls-add-unit">Aggiungi</button>
      </div>
    </div>`;
}
