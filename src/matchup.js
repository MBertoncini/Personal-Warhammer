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
import { copyText, shareUrl } from './share.js';
import { catEntry, photoFor, paintedOf } from './catalog.js';
import { allLists, getList } from './lists.js';
import { loadDoc, saveDoc } from './store.js';
import { emit } from './bus.js';
import { snapshot, applySnapshot, loadArmyFromList, renderAll, history } from './deploy.js';

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
    const painted = paintedOf(e);
    return {
      id, entry: e, need: v.need, from: v.from, owned, painted,
      short: Math.max(0, v.need - owned),
      /* da dipingere: solo quello che possiedi già. Quello che non hai
         è un problema diverso e sta nella colonna dello scoperto. */
      toPaint: Math.max(0, Math.min(v.need, owned) - painted),
    };
  }).sort((a, b) => b.short - a.short || b.toPaint - a.toPaint ||
                    (a.entry?.name || "").localeCompare(b.entry?.name || ""));

  return {
    lists, rows, unlinked,
    missing: rows.reduce((s, r) => s + r.short, 0),
    toPaint: rows.reduce((s, r) => s + r.toPaint, 0),
    conflicts: mu.mine === "both" ? rows.filter(r => r.short > 0 && r.from.length > 1) : [],
  };
}

/* ============================================================
   1b · I DUE ESERCITI A CONFRONTO
   Non decide niente, ma sono i numeri che si guardano appena le due
   liste sono sul tavolo: chi ha più corpi, chi più punti per corpo.
   ============================================================ */
export function compare(){
  const out = {};
  for (const [key, id] of [["A", mu.listA], ["B", mu.listB]]){
    const l = getList(id);
    if (!l){ out[key] = null; continue; }
    const units = l.units;
    const cats = {};
    for (const u of units) cats[u.slot || "—"] = (cats[u.slot || "—"] || 0) + (u.pts || 0);
    out[key] = {
      name: l.name,
      units: units.length,
      models: units.reduce((s, u) => s + (u.models || 0), 0),
      pts: units.reduce((s, u) => s + (u.pts || 0), 0),
      us: units.reduce((s, u) => s + (u.us || 0), 0),
      shooters: units.filter(u => u.maxRange > 0).length,
      cats,
    };
  }
  return out;
}

/* la lista da portarsi dietro: cosa comprare e cosa dipingere */
export function todoText(){
  const av = availability();
  if (!av) return "";
  const buy = av.rows.filter(r => r.short > 0);
  const paint = av.rows.filter(r => r.toPaint > 0);
  const lines = [`Schieramento Old World — ${av.lists.map(l => l.name).join(" vs ")}`, ""];
  if (buy.length){
    lines.push("DA PROCURARE");
    for (const r of buy) lines.push(`  ${r.short}× ${r.entry?.name || "?"} (servono ${r.need}, ne hai ${r.owned})`);
    lines.push("");
  }
  if (paint.length){
    lines.push("DA DIPINGERE");
    for (const r of paint) lines.push(`  ${r.toPaint}× ${r.entry?.name || "?"} (dipinte ${r.painted} su ${r.owned})`);
    lines.push("");
  }
  if (!buy.length && !paint.length) lines.push("Niente da fare: è tutto pronto e dipinto.");
  return lines.join("\n");
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
  /* si riparte da qui: annullare fin dentro il tavolo di prima
     confonderebbe e basta */
  history.reset();
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
function compareHTML(){
  const c = compare();
  if (!c.A || !c.B) return "";
  const line = (label, a, b, fmt = v => v) => {
    const lead = a === b ? "" : (a > b ? "a" : "b");
    return `<tr>
      <td class="${lead === "a" ? "lead" : ""}">${fmt(a)}</td>
      <th>${label}</th>
      <td class="${lead === "b" ? "lead" : ""}">${fmt(b)}</td></tr>`;
  };
  return `
    <div class="vs">
      <div class="vs-head">
        <span><span class="swatch" style="background:var(--armyA)"></span>${esc(c.A.name)}</span>
        <b>a confronto</b>
        <span>${esc(c.B.name)}<span class="swatch" style="background:var(--armyB)"></span></span>
      </div>
      <table class="vs-table">
        ${line("punti", c.A.pts, c.B.pts)}
        ${line("unità", c.A.units, c.B.units)}
        ${line("modelli", c.A.models, c.B.models)}
        ${line("unit strength", c.A.us, c.B.us)}
        ${line("unità che tirano", c.A.shooters, c.B.shooters)}
        ${line("punti per unità", Math.round(c.A.pts / (c.A.units || 1)),
                                  Math.round(c.B.pts / (c.B.units || 1)))}
      </table>
    </div>`;
}

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

    ${compareHTML()}

    ${!av ? `<p class="empty">Scegli almeno una lista.</p>` : `
      <div class="readout"><span>Verdetto</span><b style="color:var(--${av.missing ? "bad" : av.unlinked ? "warn" : "ok"})">
        ${av.missing ? `mancano ${av.missing} miniature`
          : av.unlinked ? `${av.unlinked} unit\u00e0 non agganciate` : "tutto disponibile"}</b></div>
      <div class="readout"><span>Da dipingere per giocarlo</span><b style="color:var(--${av.toPaint ? "warn" : "ok"})">
        ${av.toPaint ? `${av.toPaint} miniature` : "niente, \u00e8 tutto finito"}</b></div>
      ${mu.mine === "both" ? `<p class="note">Le due liste sono sommate: se una voce compare in entrambe, i modelli non possono essere usati due volte.</p>` : ""}
      <div class="tray" style="margin-top:8px">
        ${av.rows.map(r => `
          <div class="row u-row">
            <span class="nm">
              <b>${r.entry && photoFor(r.entry.id) ? `<img class="mdl" src="${photoFor(r.entry.id)}" alt="">` : ""}
                 <span class="txt">${esc(r.entry?.name || "voce eliminata")}</span></b>
              <span class="mono">${esc(r.from.join(" \u00b7 "))}</span>
            </span>
            <span style="display:flex;gap:4px;align-items:center">
              ${r.toPaint ? `<span class="chip warn" title="da dipingere">${r.toPaint} da dipingere</span>` : ""}
              <span class="chip ${r.short ? "bad" : "ok"}" title="servono / possedute">${r.need}/${r.owned}</span>
            </span>
          </div>`).join("") || `<p class="empty">Niente da verificare.</p>`}
      </div>
      <div class="grid2" style="margin-top:8px">
        <button class="btn primary" id="mu-board">Porta sul tavolo</button>
        <button class="btn" id="mu-save">Salva schieramento</button>
      </div>
      <div class="grid2" style="margin-top:6px">
        <button class="btn" id="mu-todo">Copia cosa manca</button>
        <button class="btn" id="mu-link">Copia il link del tavolo</button>
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

  const todo = $("#mu-todo");
  if (todo) todo.addEventListener("click", async () => {
    const ok = await copyText(todoText());
    todo.textContent = ok ? "Copiato ✓" : "Non riesco a copiare";
    setTimeout(() => { todo.textContent = "Copia cosa manca"; }, 2200);
  });

  const link = $("#mu-link");
  if (link) link.addEventListener("click", async () => {
    try {
      const ok = await copyText(await shareUrl(snapshot()));
      link.textContent = ok ? "Link copiato ✓" : "Non riesco a copiare";
    } catch (_) { link.textContent = "Link non riuscito"; }
    setTimeout(() => { link.textContent = "Copia il link del tavolo"; }, 2200);
  });

  host.querySelectorAll("[data-load]").forEach(b => b.addEventListener("click", async () => {
    await loadDeployment(b.dataset.load);
    document.querySelector('[data-tab="deploy"]').click();
  }));
  host.querySelectorAll("[data-drop]").forEach(b => b.addEventListener("click", async () => {
    if (confirm("Elimino questo schieramento?")) { await removeDeployment(b.dataset.drop); renderMatchup(); }
  }));
}
