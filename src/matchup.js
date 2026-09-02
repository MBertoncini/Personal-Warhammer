/* Schieramento Old World — matchup
 *
 * Due liste messe una contro l'altra. La verifica cambia a seconda
 * di chi porta le miniature:
 *
 *  - "una sola"  : controlli la tua lista contro la collezione.
 *  - "entrambe"  : le due liste sono tue, quindi non possono
 *                  pescare due volte lo stesso modello fisico e la
 *                  domanda va sommata prima di confrontarla.
 *
 * Gli schieramenti salvati stanno qui, appesi al matchup a cui
 * appartengono: erano una quarta sezione a se' e non serviva.
 */

import { $, esc } from './util.js';
import { catEntry, photoFor } from './catalog.js';
import { allLists, getList } from './lists.js';
import { loadDoc, saveDoc } from './store.js';
import { emit } from './bus.js';
import { snapshot, applySnapshot, loadArmyFromList, renderAll } from './deploy.js';

const MU_KEY = "matchup:current";
const DEP_KEY = "deployments:all";

let mu = { listA: null, listB: null, mine: "A", note: "" };
let deployments = [];

export async function initMatchup(){
  mu = await loadDoc(MU_KEY, mu) || mu;
  deployments = await loadDoc(DEP_KEY, []) || [];
}

const persist = () => Promise.all([saveDoc(MU_KEY, mu), saveDoc(DEP_KEY, deployments)])
  .then(() => emit("matchup:changed"));

/* ============================================================
   1 · DISPONIBILITA'
   ============================================================ */
export function availability(){
  const which = mu.mine === "both" ? ["listA", "listB"]
              : mu.mine === "B"    ? ["listB"] : ["listA"];
  const lists = which.map(k => getList(mu[k])).filter(Boolean);
  if (!lists.length) return null;

  const need = new Map();       // catId -> { need, byList: [] }
  let unlinked = 0;
  for (const l of lists){
    for (const u of l.units){
      if (!u.catId) { unlinked++; continue; }
      const cur = need.get(u.catId) || { need: 0, from: [] };
      cur.need += u.models;
      cur.from.push(`${l.name}: ${u.name} \u00d7${u.models}`);
      need.set(u.catId, cur);
    }
  }

  const rows = [...need].map(([id, v]) => {
    const e = catEntry(id);
    const owned = e ? +e.owned || 0 : 0;
    return { id, entry: e, need: v.need, from: v.from, owned, short: Math.max(0, v.need - owned) };
  }).sort((a, b) => b.short - a.short || (a.entry?.name || "").localeCompare(b.entry?.name || ""));

  return {
    lists, rows, unlinked,
    missing: rows.reduce((s, r) => s + r.short, 0),
    conflicts: mu.mine === "both" ? rows.filter(r => r.short > 0 && r.from.length > 1) : [],
  };
}

/* ============================================================
   2 · SCHIERAMENTI SALVATI
   ============================================================ */
export async function saveDeployment(name){
  deployments.push({
    id: "d" + Date.now().toString(36),
    name: name || `Schieramento ${deployments.length + 1}`,
    listA: mu.listA, listB: mu.listB,
    saved: new Date().toISOString(),
    board: snapshot(),
  });
  await persist();
}

export async function loadDeployment(id){
  const d = deployments.find(x => x.id === id);
  if (!d) return;
  applySnapshot(d.board);
  renderAll();
}

export async function removeDeployment(id){
  deployments = deployments.filter(d => d.id !== id);
  await persist();
}

export const allDeployments = () => deployments.slice();

/* ============================================================
   3 · INTERFACCIA
   ============================================================ */
export function renderMatchup(){
  const host = $("#matchup");
  if (!host) return;
  const ls = allLists();
  const av = availability();

  const opts = sel => `<option value="">\u2014</option>` +
    ls.map(l => `<option value="${l.id}" ${l.id === sel ? "selected" : ""}>${esc(l.name)}</option>`).join("");

  host.innerHTML = `
    <div class="grid2">
      <label class="field">Esercito A<select id="mu-a">${opts(mu.listA)}</select></label>
      <label class="field">Esercito B<select id="mu-b">${opts(mu.listB)}</select></label>
    </div>
    <label class="field">Chi porta le miniature
      <select id="mu-mine">
        <option value="A"    ${mu.mine === "A"    ? "selected" : ""}>Solo l'esercito A \u00e8 mio</option>
        <option value="B"    ${mu.mine === "B"    ? "selected" : ""}>Solo l'esercito B \u00e8 mio</option>
        <option value="both" ${mu.mine === "both" ? "selected" : ""}>Entrambi dalla mia collezione</option>
      </select>
    </label>

    ${!av ? `<p class="empty">Scegli almeno una lista.</p>` : `
      <div class="readout"><span>Verdetto</span><b style="color:var(--${av.missing ? "bad" : av.unlinked ? "warn" : "ok"})">
        ${av.missing ? `mancano ${av.missing} miniature`
          : av.unlinked ? `${av.unlinked} unit\u00e0 non agganciate` : "tutto disponibile"}</b></div>
      ${mu.mine === "both" ? `<p class="note">Le due liste sono sommate: se una voce compare in entrambe, i modelli non possono essere usati due volte.</p>` : ""}
      <div class="tray" style="margin-top:8px">
        ${av.rows.map(r => `
          <div class="row u-row">
            <span class="nm">
              <b>${r.entry && photoFor(r.entry.id) ? `<img class="mdl" src="${photoFor(r.entry.id)}" alt="">` : ""}
                 <span class="txt">${esc(r.entry?.name || "voce eliminata")}</span></b>
              <span class="mono">${esc(r.from.join(" \u00b7 "))}</span>
            </span>
            <span class="chip ${r.short ? "bad" : "ok"}">${r.need}/${r.owned}</span>
          </div>`).join("") || `<p class="empty">Niente da verificare.</p>`}
      </div>
      <div class="grid2" style="margin-top:8px">
        <button class="btn primary" id="mu-board">Porta sul tavolo</button>
        <button class="btn" id="mu-save">Salva schieramento</button>
      </div>`}

    <div class="panel-title" style="margin-top:16px">Schieramenti salvati</div>
    <div class="tray">
      ${deployments.length ? deployments.map(d => `
        <div class="row u-row">
          <span class="nm"><b><span class="txt">${esc(d.name)}</span></b>
            <span class="mono">${new Date(d.saved).toLocaleDateString("it-IT")} \u00b7 ${d.board.units.length} unit\u00e0</span></span>
          <span style="display:flex;gap:4px">
            <button class="btn tiny" data-load="${d.id}">Apri</button>
            <button class="btn tiny ghost" data-drop="${d.id}" style="color:var(--bad)">\u00d7</button>
          </span>
        </div>`).join("") : `<p class="empty">Nessuno schieramento salvato.</p>`}
    </div>`;

  $("#mu-a").addEventListener("change", async e => { mu.listA = e.target.value || null; await persist(); renderMatchup(); });
  $("#mu-b").addEventListener("change", async e => { mu.listB = e.target.value || null; await persist(); renderMatchup(); });
  $("#mu-mine").addEventListener("change", async e => { mu.mine = e.target.value; await persist(); renderMatchup(); });

  const board = $("#mu-board");
  if (board) board.addEventListener("click", () => {
    if (mu.listA) loadArmyFromList(getList(mu.listA), "A");
    if (mu.listB) loadArmyFromList(getList(mu.listB), "B");
    document.querySelector('[data-tab="deploy"]').click();
  });
  const sv = $("#mu-save");
  if (sv) sv.addEventListener("click", async () => {
    const n = prompt("Nome dello schieramento:", "");
    if (n === null) return;
    await saveDeployment(n.trim());
    renderMatchup();
  });

  host.querySelectorAll("[data-load]").forEach(b => b.addEventListener("click", async () => {
    await loadDeployment(b.dataset.load);
    document.querySelector('[data-tab="deploy"]').click();
  }));
  host.querySelectorAll("[data-drop]").forEach(b => b.addEventListener("click", async () => {
    if (confirm("Elimino questo schieramento?")) { await removeDeployment(b.dataset.drop); renderMatchup(); }
  }));
}
