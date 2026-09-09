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
import { initReports, renderReports } from './reports.js';
import { bootDeploy, renderAll, refreshLinks as refreshBoardLinks, toast } from './deploy.js';
import { exportAll, importAll, requestPersistence } from './store.js';
import { initSync } from './syncui.js';
import { openDiceBox } from './dicebox.js';
import { on } from './bus.js';
import { askConfirm, say } from './uikit.js';

/* ---------- app installabile e utilizzabile senza rete ----------
   Al circolo la rete non c'è quasi mai. In più un sito installato
   ottiene da Chrome ed Edge la persistenza dell'archivio senza
   chiedere niente: è metà del problema dei dati che sparivano. */
function registerWorker(){
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol === "file:") return;      // niente SW su file://
  navigator.serviceWorker.register("./sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller)
          toast("C'è una versione nuova: ricarica la pagina quando vuoi.");
      });
    });
  }).catch(() => { /* pubblicato senza sw.js: pazienza, l'app funziona lo stesso */ });
}

/* ---------- schede ---------- */
const TABS = {
  deploy:  () => renderAll(),
  catalog: () => renderCatalog(),
  lists:   () => renderLists(),
  matchup: () => renderMatchup(),
  report:  () => renderReports(),
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

/* ---------- il pannello del tavolo, a sezioni ----------
   Armate, Partita e Terreno stavano incolonnate una sotto l'altra: la
   colonna era alta il doppio dello schermo e per cambiare uno scenario
   bisognava scorrere oltre venti unità. Adesso se ne vede una per volta
   e il pannello non scorre quasi mai. */
function showSide(name){
  for (const b of document.querySelectorAll("[data-side]"))
    b.classList.toggle("on", b.dataset.side === name);
  for (const s of document.querySelectorAll("[data-sec]"))
    s.hidden = s.dataset.sec !== name;
  localStorage.setItem("tow-side", name);
}
document.querySelectorAll("[data-side]").forEach(b =>
  b.addEventListener("click", () => showSide(b.dataset.side)));
showSide(localStorage.getItem("tow-side") || "armies");

/* ---------- dove sta l'ispettore ----------
   Su uno schermo largo ha una colonna sua, alta quanto la finestra:
   il profilo, le distanze e i comandi si vedono tutti insieme senza
   scorrere. Su uno schermo stretto la colonna non ci sta e torna
   appiccicato in fondo al pannello, com'era prima. */
const inspDock = document.querySelector(".insp-dock");
const inspCol  = document.getElementById("insp-col");
const sideScroll = document.querySelector(".side-scroll");
const wideEnough = window.matchMedia
  ? window.matchMedia("(min-width: 1181px)")
  : { matches: true };
function placeInspector(){
  const wide = wideEnough.matches;
  document.body.classList.toggle("insp-side", wide);
  const host = wide ? inspCol : sideScroll;
  if (inspDock && host && inspDock.parentNode !== host) host.appendChild(inspDock);
}
if (wideEnough.addEventListener) wideEnough.addEventListener("change", placeInspector);
else if (wideEnough.addListener) wideEnough.addListener(placeInspector);
placeInspector();

/* il pannello della partita, sul tavolo, manda qui chi vuole vedere il
   diario delle battaglie: cambiare scheda non e' affare suo */
on("tab:show", name => showTab(name));

/* ---------- il catalogo cambia: prima si ri-aggancia, poi si ridisegna ----------
   Una foto aggiunta adesso, o due voci appena fuse, devono arrivare a liste e
   tavolo senza reimportare niente. */
on("catalog:changed", async () => {
  await healListLinks();
  refreshBoardLinks();
  renderAll(); renderLists(); renderMatchup();
});
on("lists:changed",   () => { renderMatchup(); });

/* ---------- il vassoio dei dadi ----------
   Sta nella barra del tavolo perche' serve in ogni momento della
   partita, non solo dentro uno scontro: un test di comando, la
   deviazione di un lanciapietre, un D3 di ferite d'urto. In partita
   c'e' anche il gemello nel pannello, che scrive il risultato nel
   registro; questo tira e basta. */
$("#btn-dice").addEventListener("click", () => openDiceBox({ title:"Dadi" }));

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
  if (!await askConfirm("Il backup si unisce a quello che c'\u00e8 gi\u00e0: niente viene cancellato.", { title:"Ripristinare?" })) return;
  try {
    await importAll(JSON.parse(await f.text()));
    location.reload();
  } catch (err) { await say("Backup non valido: " + err.message, { title:"Non riesco a leggerlo" }); }
});

/* ---------- avvio ---------- */
(async function start(){
  /* prima di scrivere qualsiasi cosa: chiede al browser di non cancellare
     l'archivio nelle sue pulizie automatiche */
  await requestPersistence();
  await initCatalog();
  await initLists();
  await initMatchup();
  await initReports();
  await healListLinks();   // agganci rimasti indietro da import vecchi
  const boot = await bootDeploy();
  /* un link condiviso porta sempre al tavolo, qualunque scheda fosse
     aperta l'ultima volta */
  showTab(boot && boot.shared ? "deploy" : (localStorage.getItem("tow-tab") || "deploy"));
  initSync();
  registerWorker();
})();
