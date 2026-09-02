/* Schieramento Old World — avvio
 *
 * Ordine obbligato: prima l'archivio (catalogo, liste, matchup),
 * poi il tavolo. Il tavolo disegna le anteprime pescando dal
 * catalogo, quindi se parte prima si vedono quadrati vuoti.
 */

import { $ } from './util.js';
import { initCatalog, renderCatalog } from './catalog.js';
import { initLists, renderLists, healLinks as healListLinks } from './lists.js';
import { initMatchup, renderMatchup } from './matchup.js';
import { bootDeploy, renderAll, refreshLinks as refreshBoardLinks } from './deploy.js';
import { exportAll, importAll } from './store.js';
import { on } from './bus.js';

/* ---------- schede ---------- */
const TABS = {
  deploy:  () => renderAll(),
  catalog: () => renderCatalog(),
  lists:   () => renderLists(),
  matchup: () => renderMatchup(),
};

function showTab(name){
  for (const b of document.querySelectorAll("[data-tab]"))
    b.classList.toggle("on", b.dataset.tab === name);
  for (const p of document.querySelectorAll("[data-panel]"))
    p.hidden = p.dataset.panel !== name;
  localStorage.setItem("tow-tab", name);
  (TABS[name] || (() => {}))();
}

document.querySelectorAll("[data-tab]").forEach(b =>
  b.addEventListener("click", () => showTab(b.dataset.tab)));

/* ---------- il catalogo cambia: prima si ri-aggancia, poi si ridisegna ----------
   Una foto aggiunta adesso, o due voci appena fuse, devono arrivare a liste e
   tavolo senza reimportare niente. */
on("catalog:changed", async () => {
  await healListLinks();
  refreshBoardLinks();
  renderAll(); renderLists(); renderMatchup();
});
on("lists:changed",   () => { renderMatchup(); });

/* ---------- backup ---------- */
$("#btn-export").addEventListener("click", async () => {
  const dump = await exportAll();
  const blob = new Blob([JSON.stringify(dump)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `old-world-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#btn-import").addEventListener("click", () => $("#file-backup").click());
$("#file-backup").addEventListener("change", async e => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  if (!confirm("Unisco il backup a quello che c'\u00e8 gi\u00e0. Procedo?")) return;
  try {
    await importAll(JSON.parse(await f.text()));
    location.reload();
  } catch (err) { alert("Backup non valido: " + err.message); }
});

/* ---------- avvio ---------- */
(async function start(){
  await initCatalog();
  await initLists();
  await initMatchup();
  await healListLinks();   // agganci rimasti indietro da import vecchi
  await bootDeploy();
  showTab(localStorage.getItem("tow-tab") || "deploy");
})();
