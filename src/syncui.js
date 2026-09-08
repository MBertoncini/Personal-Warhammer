/* Schieramento Old World — la finestra dell'archivio su GitHub
 *
 * Il motore sta in sync.js: qui ci sono i campi da riempire una volta
 * sola, i due pulsanti che contano (salva, scarica) e il filo diretto
 * con quello che sta succedendo, perche' un salvataggio che carica
 * trenta foto dura qualche secondo e in silenzio sembrerebbe rotto.
 *
 * Lo scaricamento ricarica la pagina: catalogo, liste e tavolo hanno
 * gia' i loro dati in memoria e riallinearli a mano, uno per uno,
 * sarebbe un modo elaborato di sbagliare.
 */

import { $, esc } from './util.js';
import { on } from './bus.js';
import { toast } from './deploy.js';
import * as S from './sync.js';

let cfg = S.loadCfg();
let busy = false;        // un'operazione alla volta
let line = "";           // l'ultima riga di stato, sotto ai pulsanti
let statusLine = "";     // dove sta il ramo remoto

const short = sha => (sha || "").slice(0, 7);
const when = iso => {
  if (!iso) return "mai";
  const d = new Date(iso);
  return isNaN(d) ? "mai" : d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
};

/* ============================================================
   1 · La finestra
   ============================================================ */
export function openSync(){
  cfg = S.loadCfg();
  render();
  refreshStatus();
}

export function closeSync(){
  const host = $("#sync-modal");
  if (host) host.remove();
  document.removeEventListener("keydown", onKey, true);
}

function onKey(e){
  if (e.key === "Escape" && !busy){ e.preventDefault(); closeSync(); }
}

function render(){
  let host = $("#sync-modal");
  if (!host){
    host = document.createElement("div");
    host.id = "sync-modal";
    host.className = "modal-back";
    document.body.appendChild(host);
    document.addEventListener("keydown", onKey, true);
    host.addEventListener("pointerdown", e => { if (e.target === host && !busy) closeSync(); });
  }

  const ready = S.cfgReady(cfg);
  const link = cfg.owner && cfg.repo
    ? `https://github.com/${cfg.owner}/${cfg.repo}/tree/${cfg.branch || "main"}/${(cfg.dir || "dati").replace(/^\/+|\/+$/g, "")}`
    : "";

  host.innerHTML = `
  <div class="modal sync-modal" role="dialog" aria-label="Archivio su GitHub">
    <div class="modal-head">
      <b>Archivio su GitHub</b>
      <span class="mono">${esc(statusLine || (ready ? "…" : "da configurare"))}</span>
      <div class="spacer"></div>
      <button class="btn tiny" id="s-close" ${busy ? "disabled" : ""}>Chiudi</button>
    </div>
    <div class="modal-body sync-body">
      <p class="note">Collezione, foto, liste, partite e scenari finiscono come file dentro un repository:
        un commit li salva, l'altro dispositivo li riprende. La cronologia di GitHub diventa la cronologia
        dell'archivio, quindi anche una cancellazione per sbaglio si recupera dal commit di prima.</p>

      <div class="panel-title">Dove</div>
      <div class="grid2">
        <label class="field">Proprietario<input type="text" id="s-owner" value="${esc(cfg.owner)}" placeholder="nome utente GitHub" autocomplete="off"></label>
        <label class="field">Repository<input type="text" id="s-repo" value="${esc(cfg.repo)}" placeholder="nome-del-repo" autocomplete="off"></label>
      </div>
      <div class="grid3">
        <label class="field">Ramo<input type="text" id="s-branch" value="${esc(cfg.branch)}" autocomplete="off"></label>
        <label class="field">Cartella<input type="text" id="s-dir" value="${esc(cfg.dir)}" autocomplete="off"></label>
        <label class="field">Firma<input type="text" id="s-who" value="${esc(cfg.who)}" placeholder="il tuo nome" autocomplete="off"></label>
      </div>

      <div class="panel-title">Token</div>
      <label class="field">Token di accesso
        <input type="password" id="s-token" value="${esc(cfg.token)}" placeholder="github_pat_…" autocomplete="off" spellcheck="false"></label>
      <p class="note">Serve un <b>fine-grained token</b> con il permesso <b>Contents: Read and write</b> su questo solo repository
        (<span class="mono">github.com → Settings → Developer settings → Personal access tokens</span>).
        Resta su questo dispositivo, dentro il browser: non viene mai scritto nei file che salviamo.
        Se il repository è pubblico, chi lo apre vede la collezione: per l'archivio conviene un repository privato.</p>

      <div class="panel-title">Adesso</div>
      <div class="readout"><span>Ultimo scambio</span><b>${esc(when(cfg.at))}${cfg.sha ? " · " + short(cfg.sha) : ""}</b></div>
      ${link ? `<div class="readout"><span>Cartella</span><b><a href="${esc(link)}" target="_blank" rel="noopener">${esc(link.replace("https://", ""))}</a></b></div>` : ""}

      <div class="bar" style="margin-top:4px">
        <button class="btn primary" id="s-push" ${ready && !busy ? "" : "disabled"}>Salva su GitHub</button>
        <button class="btn" id="s-pull" ${ready && !busy ? "" : "disabled"}>Scarica</button>
        <button class="btn ghost" id="s-replace" ${ready && !busy ? "" : "disabled"} title="Butta via l'archivio locale e ricopialo dal repository">Sostituisci con il repository</button>
        <div class="spacer"></div>
        <button class="btn" id="s-probe" ${ready && !busy ? "" : "disabled"}>Prova</button>
      </div>

      <div class="bar">
        <button class="btn tiny${cfg.auto ? " on" : ""}" id="s-auto" ${ready ? "" : "disabled"}>Salva da sola${cfg.auto ? " · accesa" : ""}</button>
        <span class="note">Un commit qualche minuto dopo l'ultima modifica, quando c'è rete.</span>
      </div>

      <p class="note mono" id="s-log">${esc(line)}</p>
    </div>
  </div>`;

  $("#s-close").addEventListener("click", closeSync);

  const field = (sel, key, reset = false) => {
    const el = $(sel);
    el.addEventListener("change", () => {
      const v = el.value.trim();
      /* cambiare repository, ramo o cartella significa guardare un
         altro archivio: l'allineamento di prima non vale più */
      cfg = S.saveCfg(reset && v !== cfg[key] ? { [key]: v, sha: "", at: "" } : { [key]: v });
      render(); refreshStatus();
    });
  };
  field("#s-owner",  "owner",  true);
  field("#s-repo",   "repo",   true);
  field("#s-branch", "branch", true);
  field("#s-dir",    "dir",    true);
  field("#s-who",    "who");
  field("#s-token",  "token");

  $("#s-push").addEventListener("click", () => doPush());
  $("#s-pull").addEventListener("click", () => doPull(false));
  $("#s-replace").addEventListener("click", () => doPull(true));
  $("#s-probe").addEventListener("click", doProbe);
  $("#s-auto").addEventListener("click", () => {
    cfg = S.saveCfg({ auto: !cfg.auto });
    markButton();
    render();
    if (cfg.auto) armAuto();
  });
}

const log = msg => {
  line = msg;
  const el = $("#s-log");
  if (el) el.textContent = msg;
};

function lock(on){
  busy = on;
  for (const id of ["#s-push", "#s-pull", "#s-replace", "#s-probe", "#s-close"]){
    const el = $(id);
    if (el) el.disabled = on || (id !== "#s-close" && !S.cfgReady(cfg));
  }
}

/* ============================================================
   2 · Le tre azioni
   ============================================================ */
async function refreshStatus(){
  if (!S.cfgReady(cfg)){ statusLine = "da configurare"; return; }
  try {
    const st = await S.status(cfg);
    statusLine = !cfg.sha ? "mai scambiato · remoto " + short(st.remoto)
               : st.allineato ? "allineato · " + short(st.remoto)
               : "il repository è avanti · " + short(st.remoto);
  } catch (err){ statusLine = "non raggiungibile"; }
  const el = $("#sync-modal .modal-head .mono");
  if (el) el.textContent = statusLine;
}

async function doProbe(){
  lock(true); log("chiedo a GitHub…");
  try {
    const p = await S.probe(cfg);
    log(`${p.repo}${p.privato ? " (privato)" : " (pubblico)"} · ramo ${p.ramo} ${p.esiste ? short(p.sha) : "inesistente"} · ${p.scrivibile ? "posso scrivere" : "sola lettura: il token non basta"}`);
  } catch (err){ log(err.message); }
  lock(false);
  refreshStatus();
}

async function doPush({ force = false } = {}){
  lock(true);
  try {
    const r = await S.push(cfg, { force, onStep: log });
    cfg = S.loadCfg();
    if (r.vuoto) log("Non è cambiato niente: nessun commit da fare.");
    else {
      log(`Salvato in ${short(r.commit)}: ${r.changed} file scritti${r.removed ? `, ${r.removed} tolti` : ""}.`);
      toast(`Archivio salvato su GitHub · ${r.changed} file`);
    }
  } catch (err){
    if (err instanceof S.ConflictError || err.name === "ConflictError"){
      log(err.message);
      if (confirm("Ha salvato qualcun altro dopo il tuo ultimo scambio.\n\nScaricare prima è più prudente. Se salvi comunque, i file che hai cambiato tu sostituiscono i loro; gli altri restano come stanno.\n\nSalvo comunque?")){
        lock(false);
        return doPush({ force: true });
      }
    } else {
      log(err.message);
      toast("Salvataggio su GitHub non riuscito.");
    }
  }
  lock(false);
  refreshStatus();
}

async function doPull(replace){
  const msg = replace
    ? "Sostituisco l'archivio di questo dispositivo con quello del repository.\n\nQuello che c'è qui e non è ancora stato salvato va perso. Procedo?"
    : "Prendo dal repository catalogo, foto, liste, partite e scenari e li scrivo sopra quelli di qui.\n\nQuello che esiste solo su questo dispositivo resta. Procedo?";
  if (!confirm(msg)) return;

  lock(true);
  try {
    const r = await S.pull(cfg, { replace, onStep: log });
    const chi = r.indice && r.indice.da ? ` (ultimo salvataggio di ${r.indice.da})` : "";
    log(`Scaricati ${r.letti} documenti da ${short(r.commit)}${chi}${r.tolti ? `, ${r.tolti} tolti da qui` : ""}. Ricarico…`);
    setTimeout(() => location.reload(), 700);
  } catch (err){
    log(err.message);
    toast("Scaricamento da GitHub non riuscito.");
    lock(false);
    refreshStatus();
  }
}

/* ============================================================
   3 · Il salvataggio automatico

   store.js segnala ogni scrittura nell'archivio. Un tavolo che si
   sposta ne fa una ogni frazione di secondo, quindi non si salva a
   ogni segnale: si aspetta che le mani si fermino. Il commit poi
   non parte comunque se non è cambiato niente davvero.
   ============================================================ */
const QUIET = 3 * 60 * 1000;      // tre minuti di calma prima di committare
let timer = null, autoBusy = false, lastGripe = "";

function armAuto(){
  clearTimeout(timer);
  timer = setTimeout(runAuto, QUIET);
}

async function runAuto(){
  cfg = S.loadCfg();
  if (!cfg.auto || !S.cfgReady(cfg) || autoBusy || busy) return;
  if (navigator.onLine === false){ armAuto(); return; }   // al circolo non c'è campo
  autoBusy = true;
  try {
    const r = await S.push(cfg, {});
    cfg = S.loadCfg();
    lastGripe = "";
    if (!r.vuoto) toast(`Archivio salvato su GitHub · ${r.changed} file`);
    if ($("#sync-modal")){ log(r.vuoto ? "Niente da salvare." : `Salvato in ${short(r.commit)}.`); refreshStatus(); }
  } catch (err){
    /* Un errore che si ripete — niente rete, token scaduto — non
       merita un avviso ogni tre minuti: lo si dice una volta. */
    if (err.message !== lastGripe){
      lastGripe = err.message;
      toast("Salvataggio automatico fermo: " + err.message);
    }
    if (err.name === "ConflictError") armAuto();   // riprova: intanto uno scarica
  }
  autoBusy = false;
}

/* ============================================================
   4 · Avvio
   ============================================================ */
function markButton(){
  const b = $("#btn-sync");
  if (!b) return;
  b.classList.toggle("on", !!cfg.auto);
  b.title = S.cfgReady(cfg)
    ? (cfg.auto ? "Archivio su GitHub · salvataggio automatico acceso" : "Salva l'archivio su GitHub o riprendilo")
    : "Collega l'archivio a un repository GitHub";
}

export function initSync(){
  cfg = S.loadCfg();
  const btn = $("#btn-sync");
  if (btn) btn.addEventListener("click", openSync);
  markButton();
  on("store:changed", () => { if (cfg.auto) armAuto(); });
}
