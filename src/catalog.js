/* Schieramento Old World — catalogo della collezione
 *
 * Una voce = un TIPO di modello, con quante ne possiedi e una foto.
 * Non una miniatura fisica per voce: i tuoi 24 Orc Boyz sono un mob
 * da 25 in una lista e due mob da 12 in un'altra, quindi l'unico
 * conteggio che regge e' "tipo + quantita'".
 *
 *   { id, name, faction, baseId, baseW, baseH, owned, aliases[], notes }
 *
 * Le foto stanno su chiavi separate ("photo:<id>") cosi' salvare una
 * quantita' non riscrive i megabyte delle immagini.
 */

import { $, esc } from './util.js';
import { BASES, baseById } from './bases.js';
import { loadDoc, saveDoc, deleteDoc, pickImage, shrinkImage, usage } from './store.js';
import { emit } from './bus.js';

const CAT_KEY = "catalog:entries";

let entries = [];
const photos = new Map();   // id -> dataURL, tenuto in memoria per disegnare senza await
let filter = "";
let editing = null;

export const FACTIONS = [
  "Orc & Goblin Tribes", "Lizardmen", "Skaven", "Empire of Man",
  "Kingdom of Bretonnia", "Dwarfen Mountain Holds", "High Elf Realms",
  "Wood Elf Realms", "Warriors of Chaos", "Beastmen Brayherds",
  "Tomb Kings of Khemri", "Vampire Counts", "Altro",
];

/* ============================================================
   1 · CARICAMENTO
   ============================================================ */
export async function initCatalog(){
  entries = await loadDoc(CAT_KEY, []) || [];
  await Promise.all(entries.map(async e => {
    const p = await loadDoc("photo:" + e.id, null);
    if (p) photos.set(e.id, p);
  }));
}

function persist(){
  return saveDoc(CAT_KEY, entries).then(() => emit("catalog:changed"));
}

export const catalogAll = () => entries.slice();
export const catEntry = id => entries.find(e => e.id === id) || null;
export const photoForUnit = u => (u && u.catId ? photos.get(u.catId) || null : null);
export const photoFor = id => photos.get(id) || null;

/* ============================================================
   2 · AGGANCIO NOME -> VOCE DI CATALOGO
   New Recruit scrive "25 Orc Mob", il catalogo dice "Orc Boy".
   Senza un minimo di tolleranza ogni import sarebbe lavoro a mano.
   ============================================================ */
const STOP = new Set([
  "mob", "unit", "unita", "regiment", "reggimento", "warband", "squad",
  "the", "of", "and", "di", "dei", "delle", "da", "with", "con",
]);

const stem = w => w.replace(/z$/, "s").replace(/(?<=.{3})s$/, "");

export function normalize(s){
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^\s*\d+\s*[x\u00d7]?\s*/, "")     // "25 Orc Mob" -> "orc mob"
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const tokens = s => normalize(s).split(" ").filter(w => w && !STOP.has(w)).map(stem);

function score(rawName, entry){
  const a = new Set(tokens(rawName));
  const b = tokens(entry.name);
  if (!a.size || !b.length) return 0;
  const hit = b.filter(w => a.has(w)).length;
  return hit / b.length;           // quanto della voce di catalogo e' coperto
}

/* Due voci sono lo stesso TIPO se nome normalizzato e fazione coincidono.
   La fazione passa dai token perche' New Recruit scrive "Orc and Goblin
   Tribes" e il catalogo "Orc & Goblin Tribes": senza questo ogni import
   creerebbe un doppione. */
const kindKey = (name, faction) => normalize(name) + "|" + tokens(faction).join(" ");
const kindOf  = e => kindKey(e.name, e.faction);

/* Fra voci dello stesso tipo vince quella con la foto, poi la piu' fornita:
   e' l'unica che ha qualcosa da mostrare nelle liste e sul tavolo. */
function bestOf(list){
  return list.slice().sort((a, b) =>
    (photos.has(b.id) ? 1 : 0) - (photos.has(a.id) ? 1 : 0) ||
    (+b.owned || 0) - (+a.owned || 0))[0] || null;
}

/* la voce gia' esistente per questo tipo, se c'e' */
export const findKind = (name, faction) =>
  bestOf(entries.filter(e => kindOf(e) === kindKey(name, faction)));

/* ritorna l'id se l'aggancio e' sicuro, altrimenti null:
   meglio chiedere una volta che sbagliare in silenzio */
export function matchUnitName(name){
  const n = normalize(name);
  if (!n) return null;

  const exact = entries.filter(e =>
    normalize(e.name) === n || (e.aliases || []).includes(n));
  if (exact.length) return bestOf(exact).id;

  /* un tipo = un candidato, altrimenti due doppioni a pari punteggio
     si annullano a vicenda e non aggancia mai niente */
  const byKind = new Map();
  for (const r of candidatesFor(name, 12)){
    const k = kindOf(r.entry);
    if (byKind.has(k)) byKind.get(k).list.push(r.entry);
    else byKind.set(k, { score: r.score, list: [r.entry] });
  }
  const ranked = [...byKind.values()]
    .map(g => ({ entry: bestOf(g.list), score: g.score }))
    .sort((a, b) => b.score - a.score);

  if (ranked.length && ranked[0].score >= 0.75 &&
      (ranked.length < 2 || ranked[0].score - ranked[1].score >= 0.2)) {
    return ranked[0].entry.id;
  }
  return null;
}

export function candidatesFor(name, n = 5){
  return entries
    .map(entry => ({ entry, score: score(name, entry) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/* collega un nome a una voce e ricordalo per sempre */
export async function linkAlias(entryId, rawName){
  const e = catEntry(entryId);
  if (!e) return;
  const n = normalize(rawName);
  e.aliases = e.aliases || [];
  if (n && !e.aliases.includes(n)) e.aliases.push(n);
  await persist();
}

export async function unlinkAlias(entryId, alias){
  const e = catEntry(entryId);
  if (!e) return;
  e.aliases = (e.aliases || []).filter(a => a !== alias);
  await persist();
}

/* ============================================================
   3 · MODIFICA DELLE VOCI
   ============================================================ */
const newId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const sortEntries = () => entries.sort((a, b) =>
  (a.faction || "").localeCompare(b.faction) || a.name.localeCompare(b.name));

/* Ritorna l'id della voce scritta. Con { merge: true } una creazione che
   ricade su un tipo gia' presente somma le quantita' invece di aggiungere
   un doppione: e' il caso di "+ crea voce" premuto da liste diverse. */
export async function upsertEntry(data, { merge = false } = {}){
  const e = data.id && catEntry(data.id);
  if (e){
    Object.assign(e, data);
    sortEntries();
    await persist();
    return e.id;
  }

  const twin = merge ? findKind(data.name, data.faction) : null;
  if (twin){
    twin.owned = (+twin.owned || 0) + (+data.owned || 0);
    twin.aliases = [...new Set([...(twin.aliases || []), ...(data.aliases || [])])];
    sortEntries();
    await persist();
    return twin.id;
  }

  const fresh = {
    id: newId(), name: "Nuova voce", faction: "Altro",
    baseId: "25x25", baseW: 25, baseH: 25, owned: 1, aliases: [], notes: "",
    ...data,
  };
  entries.push(fresh);
  sortEntries();
  await persist();
  return fresh.id;
}

/* ============================================================
   3b · DOPPIONI GIA' IN ARCHIVIO
   Prima che upsertEntry imparasse a fondere, ogni "+ crea voce"
   aggiungeva una voce nuova: quattro "Skink Skirmishers" da 10
   invece di una da 40, con la foto su una sola.
   ============================================================ */
export function duplicateGroups(){
  const by = new Map();
  for (const e of entries){
    const k = kindOf(e);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(e);
  }
  return [...by.values()].filter(g => g.length > 1);
}

/* fonde ogni gruppo di doppioni nella voce migliore.
   Ritorna { groups, removed } — removed serve a chi teneva quegli id. */
export async function mergeDuplicates(){
  const groups = duplicateGroups();
  const removed = [];
  for (const g of groups){
    const keeper = bestOf(g);
    for (const other of g){
      if (other === keeper) continue;
      keeper.owned = (+keeper.owned || 0) + (+other.owned || 0);
      keeper.aliases = [...new Set([...(keeper.aliases || []), ...(other.aliases || [])])];
      if (other.notes && !(keeper.notes || "").includes(other.notes))
        keeper.notes = [keeper.notes, other.notes].filter(Boolean).join(" \u00b7 ");
      /* la foto si perde solo se non ce n'e' nessuna da salvare */
      if (!photos.has(keeper.id) && photos.has(other.id)){
        const data = photos.get(other.id);
        photos.set(keeper.id, data);
        await saveDoc("photo:" + keeper.id, data);
      }
      removed.push(other.id);
    }
  }
  if (!removed.length) return { groups: 0, removed: [] };

  const gone = new Set(removed);
  entries = entries.filter(e => !gone.has(e.id));
  for (const id of removed){
    photos.delete(id);
    await deleteDoc("photo:" + id);
  }
  await persist();
  return { groups: groups.length, removed };
}

export async function removeEntry(id){
  entries = entries.filter(e => e.id !== id);
  photos.delete(id);
  await deleteDoc("photo:" + id);
  await persist();
}

/* separata da setPhoto perche' il picker non si puo' aprire dai test */
export async function setPhotoData(id, data){
  photos.set(id, data);
  await saveDoc("photo:" + id, data);
  emit("catalog:changed");
}

export async function setPhoto(id){
  const f = await pickImage();
  if (!f) return;
  try { await setPhotoData(id, await shrinkImage(f)); }
  catch (_) { alert("Non riesco a leggere questa immagine."); }
}

export async function clearPhoto(id){
  photos.delete(id);
  await deleteDoc("photo:" + id);
  emit("catalog:changed");
}

/* quante miniature di questo tipo servono nelle liste passate */
export function demandFor(id, lists){
  let n = 0;
  for (const l of lists) for (const u of l.units) if (u.catId === id) n += u.models;
  return n;
}

/* ============================================================
   4 · INTERFACCIA
   ============================================================ */
export function renderCatalog(){
  const host = $("#catalog");
  if (!host) return;
  const q = normalize(filter);
  const shown = q ? entries.filter(e =>
    normalize(e.name).includes(q) || normalize(e.faction).includes(q) ||
    (e.aliases || []).some(a => a.includes(q))) : entries;

  const total = entries.reduce((s, e) => s + (+e.owned || 0), 0);
  const dups = duplicateGroups();

  host.innerHTML = `
    <div class="bar">
      <input type="search" id="cat-q" placeholder="Cerca per nome, fazione o alias\u2026" value="${esc(filter)}">
      <button class="btn primary" id="cat-add">Nuova voce</button>
      ${dups.length ? `<button class="btn" id="cat-merge">Unisci doppioni (${dups.length})</button>` : ""}
    </div>
    <p class="note" id="cat-usage">${entries.length} voci \u00b7 ${total} miniature in collezione</p>
    ${editing ? editorHTML() : ""}
    <div class="cat-grid">
      ${shown.map(cardHTML).join("") || `<p class="empty">Nessuna voce. Comincia da "Nuova voce".</p>`}
    </div>`;

  $("#cat-q").addEventListener("input", e => { filter = e.target.value; renderCatalog(); });
  $("#cat-add").addEventListener("click", () => {
    editing = { id: null, name: "", faction: "Orc & Goblin Tribes", baseId: "25x25", owned: 1, aliases: [] };
    renderCatalog();
  });
  const mergeBtn = $("#cat-merge");
  if (mergeBtn) mergeBtn.addEventListener("click", async () => {
    const detail = dups.map(g =>
      `\u2022 ${g.length}\u00d7 ${g[0].name} \u2192 ${g.reduce((n, e) => n + (+e.owned || 0), 0)} in collezione`).join("\n");
    if (!confirm(
      `Unisco i doppioni sommando le quantit\u00e0 e tenendo la foto dove c'\u00e8:\n\n` +
      detail +
      `\n\nLe liste e il tavolo si riagganciano da soli.`)) return;
    await mergeDuplicates();
    renderCatalog();
  });

  host.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => {
    editing = { ...catEntry(b.dataset.edit) };
    renderCatalog();
  }));
  host.querySelectorAll("[data-photo]").forEach(b => b.addEventListener("click", async () => {
    await setPhoto(b.dataset.photo);
    renderCatalog();
  }));

  if (editing) wireEditor();
  showUsage();
}

function cardHTML(e){
  const p = photos.get(e.id);
  return `
    <div class="cat-card">
      <button class="cat-photo" data-photo="${e.id}" title="Cambia foto">
        ${p ? `<img src="${p}" alt="">` : `<span class="ph">+ foto</span>`}
      </button>
      <div class="cat-body">
        <b>${esc(e.name)}</b>
        <span class="mono">${esc(e.faction)} \u00b7 ${e.baseW}\u00d7${e.baseH} mm</span>
        <span class="owned">${e.owned} in collezione</span>
        ${(e.aliases || []).length
          ? `<span class="mono dim">alias: ${e.aliases.map(esc).join(", ")}</span>` : ""}
      </div>
      <button class="btn tiny" data-edit="${e.id}">Modifica</button>
    </div>`;
}

function editorHTML(){
  const e = editing;
  return `
    <div class="editor">
      <div class="panel-title">${e.id ? "Modifica voce" : "Nuova voce"}</div>
      <label class="field">Nome del modello<input type="text" id="ed-name" value="${esc(e.name || "")}" placeholder="Black Orc"></label>
      <div class="grid2">
        <label class="field">Fazione<select id="ed-faction">
          ${FACTIONS.map(f => `<option ${f === e.faction ? "selected" : ""}>${esc(f)}</option>`).join("")}
        </select></label>
        <label class="field">Quantit\u00e0 posseduta<input type="number" id="ed-owned" min="0" max="999" value="${+e.owned || 0}"></label>
      </div>
      <label class="field">Basetta<select id="ed-base">
        ${BASES.map(b => `<option value="${b.id}" ${b.id === e.baseId ? "selected" : ""}>${esc(b.label)}</option>`).join("")}
      </select></label>
      ${(e.aliases || []).length ? `<div class="tags">${e.aliases.map(a =>
        `<span class="tag">${esc(a)}<button data-unalias="${esc(a)}" title="Togli">\u00d7</button></span>`).join("")}</div>` : ""}
      <div class="grid2">
        <button class="btn primary" id="ed-save">Salva</button>
        <button class="btn" id="ed-cancel">Annulla</button>
      </div>
      ${e.id ? `<button class="btn ghost" id="ed-del" style="color:var(--bad)">Elimina voce</button>` : ""}
    </div>`;
}

function wireEditor(){
  $("#ed-cancel").addEventListener("click", () => { editing = null; renderCatalog(); });
  $("#ed-save").addEventListener("click", async () => {
    const b = baseById($("#ed-base").value) || { w: 25, h: 25 };
    const name = $("#ed-name").value.trim();
    if (!name) return alert("Serve un nome.");
    const faction = $("#ed-faction").value;

    /* una seconda voce con lo stesso nome spezza la collezione in due:
       si puo' fare, ma solo dicendolo */
    let merge = false;
    if (!editing.id){
      const twin = findKind(name, faction);
      if (twin) merge = confirm(
        `"${twin.name}" c'\u00e8 gi\u00e0 (${twin.owned} in collezione).\n\n` +
        `OK = sommo le quantit\u00e0 a quella voce.\nAnnulla = creo comunque una voce separata.`);
    }

    await upsertEntry({
      id: editing.id || undefined,
      name, faction,
      baseId: $("#ed-base").value, baseW: b.w, baseH: b.h,
      owned: Math.max(0, +$("#ed-owned").value || 0),
      aliases: editing.aliases || [],
    }, { merge });
    editing = null;
    renderCatalog();
  });
  const del = $("#ed-del");
  if (del) del.addEventListener("click", async () => {
    if (!confirm("Elimino questa voce dal catalogo?")) return;
    await removeEntry(editing.id);
    editing = null;
    renderCatalog();
  });
  document.querySelectorAll("[data-unalias]").forEach(b => b.addEventListener("click", () => {
    editing.aliases = editing.aliases.filter(a => a !== b.dataset.unalias);
    renderCatalog();
  }));
}

async function showUsage(){
  const u = await usage();
  const el = $("#cat-usage");
  if (!u || !el) return;
  const mb = n => (n / 1048576).toFixed(1);
  el.textContent += ` \u00b7 ${mb(u.usage)} MB usati`;
}
