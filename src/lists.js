/* Schieramento Old World — liste
 *
 * Una lista e' un roster di New Recruit salvato, con ogni unita'
 * agganciata a una voce del catalogo. L'aggancio e' il punto in cui
 * l'app o funziona o diventa lavoro manuale: quando un nome non
 * viene riconosciuto lo chiediamo UNA volta e lo ricordiamo come
 * alias, cosi' il prossimo import di quella lista passa liscio.
 */

import { $, esc } from './util.js';
import { parseAny, parseRoster } from './parser.js';
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
      catch (err) { alert(err.message); }
    }
    e.target.value = "";
    renderLists();
  });
  $("#ls-paste").addEventListener("click", () => {
    const b = $("#ls-paste-box"); b.hidden = !b.hidden;
  });
  $("#ls-paste-ok").addEventListener("click", async () => {
    try { await importListText($("#ls-paste-area").value); renderLists(); }
    catch (err) { alert(err.message); }
  });

  host.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => {
    openId = b.dataset.open; renderLists();
  }));
  host.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async e => {
    e.stopPropagation();
    if (confirm("Elimino questa lista?")) { await removeList(b.dataset.del); renderLists(); }
  }));
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
        </div>`;
      }).join("")}
    </div>`;
}
