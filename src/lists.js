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
import { askText, askConfirm, say } from './uikit.js';
import {
  catalogAll, catEntry, matchUnitName, candidatesFor,
  linkAlias, photoFor, upsertEntry, normalize, paintedOf,
} from './catalog.js';
import { loadDoc, saveDoc } from './store.js';
import { emit } from './bus.js';

const LIST_KEY = "lists:all";

let lists = [];
let openId = null;

export async function initLists(){
  lists = await loadDoc(LIST_KEY, []) || [];
}

const persist = () => saveDoc(LIST_KEY, lists).then(() => emit("lists:changed"));

export const allLists = () => lists.slice();
export const getList = id => lists.find(l => l.id === id) || null;

const newId = () => "l" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ============================================================
   1 · IMPORT
   ============================================================ */
export async function importListText(text){
  const raw = parseAny(text);
  if (!raw) throw new Error("Non riesco a leggere questo file.");
  const r = parseRoster(raw);
  if (!r.units.length) throw new Error("Nessuna unit\u00e0 trovata nel file.");

  const list = {
    id: newId(),
    name: r.rosterName || "Lista importata",
    info: { catalogue: r.catalogue, forceName: r.forceName, limit: r.limit },
    points: r.total,
    imported: new Date().toISOString(),
    units: r.units.map(u => ({ ...u, catId: matchUnitName(u.name) })),
  };
  lists.push(list);
  await persist();
  openId = list.id;
  return list;
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

export async function createList(name){
  const list = {
    id: newId(),
    name: name || "Lista mia",
    info: { catalogue: "", forceName: "scritta a mano", limit: 0 },
    points: 0, byHand: true,
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

export async function renameList(id, name){
  const l = getList(id);
  if (l) { l.name = name; await persist(); }
}

/* ============================================================
   2 · AGGANCIO
   ============================================================ */
export async function linkUnit(listId, unitIndex, catId){
  const l = getList(listId);
  if (!l) return;
  const u = l.units[unitIndex];
  u.catId = catId || null;
  /* sganciare a mano e' una scelta: healLinks non deve disfarla */
  if (catId) delete u.noLink; else u.noLink = true;
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
   del giorno dell'import e le foto aggiunte dopo non si vedono mai. */
export async function healLinks(){
  let changed = false;
  for (const l of lists){
    for (const u of l.units){
      if (u.catId && catEntry(u.catId)) continue;
      if (!u.catId && u.noLink) continue;
      const id = matchUnitName(u.name);
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

/* riepilogo di copertura di una lista rispetto alla collezione */
export function coverage(list){
  const need = new Map();
  let unlinked = 0;
  for (const u of list.units){
    if (!u.catId) { unlinked++; continue; }
    need.set(u.catId, (need.get(u.catId) || 0) + u.models);
  }
  const rows = [...need].map(([id, n]) => {
    const e = catEntry(id);
    const owned = e ? +e.owned || 0 : 0;
    const painted = paintedOf(e);
    return {
      id, entry: e, need: n, owned, painted,
      short: Math.max(0, n - owned),
      /* quante ne resterebbero da dipingere per giocare questa lista:
         non piu' di quante ne possiedi, il resto e' roba da comprare */
      toPaint: Math.max(0, Math.min(n, owned) - painted),
    };
  });
  return {
    rows, unlinked,
    missing: rows.reduce((s, r) => s + r.short, 0),
    toPaint: rows.reduce((s, r) => s + r.toPaint, 0),
  };
}

/* ============================================================
   3 · INTERFACCIA
   ============================================================ */
export function renderLists(){
  const host = $("#lists");
  if (!host) return;

  host.innerHTML = `
    <div class="bar">
      <button class="btn primary" id="ls-import">Importa da New Recruit</button>
      <button class="btn" id="ls-paste">Incolla JSON\u2026</button>
      <button class="btn" id="ls-new" title="Per la lista che l'avversario ti mostra stampata">Nuova lista a mano</button>
      ${openId ? `<button class="btn" id="ls-dup">Duplica questa lista</button>` : ""}
    </div>
    <div id="ls-paste-box" hidden>
      <textarea id="ls-paste-area" rows="5" placeholder="Incolla qui il contenuto del file\u2026"></textarea>
      <button class="btn tiny primary" id="ls-paste-ok" style="margin-top:6px">Importa</button>
    </div>
    <input type="file" id="ls-file" accept=".json,.ros,.xml" hidden>
    <div class="ls-split">
      <div class="ls-side">
        ${lists.length ? lists.map(listRowHTML).join("") : `<p class="empty">Nessuna lista salvata.</p>`}
      </div>
      <div class="ls-detail">${openId ? detailHTML(getList(openId)) : `<p class="empty">Scegli una lista.</p>`}</div>
    </div>`;

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
    try { await importListText($("#ls-paste-area").value); renderLists(); }
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
  const dup = $("#ls-dup");
  if (dup) dup.addEventListener("click", async () => { await duplicateList(openId); renderLists(); });

  host.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => {
    openId = b.dataset.open; renderLists();
  }));
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
}

function listRowHTML(l){
  const c = coverage(l);
  const key = c.unlinked ? "warn" : c.missing ? "bad" : c.toPaint ? "warn" : "ok";
  const txt = c.unlinked ? `${c.unlinked} da agganciare`
            : c.missing ? `mancano ${c.missing}`
            : c.toPaint ? `${c.toPaint} da dipingere` : "completa";
  return `
    <div class="row u-row ${l.id === openId ? "sel" : ""}" data-open="${l.id}">
      <span class="nm"><b><span class="txt">${esc(l.name)}</span></b>
        <span class="mono">${esc(l.info?.catalogue || "")} \u00b7 ${l.units.length} unit\u00e0 \u00b7 ${l.points} pt</span></span>
      <span class="chip ${key}">${txt}</span>
    </div>`;
}

function detailHTML(l){
  if (!l) return `<p class="empty">Lista non trovata.</p>`;
  const cat = catalogAll();
  return `
    <div class="panel-title">${esc(l.name)}
      <button class="btn tiny ghost" data-del="${l.id}" style="color:var(--bad);float:right">Elimina</button></div>
    <p class="note">${esc([l.info?.catalogue, l.info?.forceName,
      l.info?.limit ? "limite " + l.info.limit + " pt" : ""].filter(Boolean).join(" \u00b7 "))}</p>
    <div class="tray">
      ${l.units.map((u, i) => {
        const e = u.catId && catEntry(u.catId);
        const p = e && photoFor(e.id);
        const cands = u.catId ? [] : candidatesFor(u.name, 4);
        const options = cands.length
          ? cands.map(c => `<option value="${c.entry.id}">${esc(c.entry.name)} (${Math.round(c.score * 100)}%)</option>`).join("")
          : "";
        const rest = cat.filter(x => !cands.some(c => c.entry.id === x.id) && x.id !== u.catId)
          .map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join("");
        return `
        <div class="row u-row">
          <span class="nm">
            <b><span class="txt">${esc(u.name)}</span></b>
            <span class="mono">${u.models} modelli \u00b7 ${u.pts} pt</span>
          </span>
          ${e
            ? `<span class="chip ${u.models > (+e.owned || 0) ? "bad" : "ok"}">${u.models}/${e.owned}</span>`
            : `<span class="chip warn">da agganciare</span>`}
          <span class="minis">
            ${p ? Array.from({ length: Math.min(u.models, 24) },
                  () => `<img class="mdl" src="${p}" alt="" loading="lazy">`).join("") : ""}
          </span>
          <select class="link" data-link="${l.id}|${i}">
            <option value="">${e ? esc(e.name) : "\u2014 scegli dal catalogo \u2014"}</option>
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
        </div>`;
      }).join("")}
    </div>
    <div class="addunit">
      <div class="panel-title">Aggiungi un'unità</div>
      <p class="note">Bastano nome, modelli, punti e basetta. Profilo, regole e armi sono facoltativi dappertutto: senza, l'app disegna e conta lo stesso.</p>
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
