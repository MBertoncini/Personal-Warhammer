/* Schieramento Old World — tu contro l'AI, sul tavolo
 *
 * Le due modalita' che c'erano stavano ai due capi opposti. La partita
 * del tavolo la giochi tu con le miniature, e l'app tiene il conto e non
 * impedisce niente. La partita di `tools/partita.mjs` la giocano due
 * macchine, e la guardi dopo. Questa sta in mezzo: l'arbitro
 * (`arbitro.js`) tiene la partita come nella seconda, il tavolo la
 * mostra come nella prima, e le mosse di una parte le scegli tu.
 *
 * Le scegli fra quelle che l'arbitro dichiara legali — le stesse che
 * vede il modello di linguaggio, con dentro le distanze e le
 * probabilita' gia' fatte — e non trascinando i pezzi. E' una scelta,
 * e va detta: e' il modo in cui le due parti giocano con le stesse
 * regole. Un pezzo spostato a mano sarebbe un tavolo diverso da quello
 * dell'arbitro, e da li' in poi nessuno dei due saprebbe piu' dove sta
 * la verita'.
 *
 * L'altra parte la gioca `agenteGemini`, con la chiave che scrivi qui:
 * resta in questo browser e parte solo verso Google. Senza chiave gioca
 * l'euristica, e il pannello lo dice.
 *
 * La partita vive in questa scheda: ricaricando la pagina si ricomincia.
 */

import { $, esc } from './util.js';
import * as AR from './arbitro.js';
import * as AG from './agente.js';
import * as MG from './magic.js';
import * as PR from './profiles.js';
import * as PREP from './prep.js';
import { SCENARIOS } from './scenarios.js';
import { mostraSfida, chiudiSfida, evidenzia, toast } from './deploy.js';

const KEY = "tow-gemini-key";
const MODEL = "tow-gemini-model";
const SALTA = "tow-sfida-salta";
const MODELLO_DI_SOLITO = "gemini-2.5-flash";

const leggi = (k, d = "") => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const scrivi = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* niente */ } };

let partita = null;
let serie = 0;

/* ============================================================
   1 · GLI SCENARI CHE L'ARBITRO SA GIOCARE
   Quelli con un tavolo e uno schieramento: gli altri sono disegni
   liberi, e l'arbitro non saprebbe dove mettere nessuno.
   ============================================================ */
export const scenariGiocabili = () => Object.entries(SCENARIOS)
  .filter(([, s]) => s.table && s.deploy)
  .map(([id, s]) => ({ id, label: s.label, pts: s.pts || 0, group: s.group || "" }));

/* Lo scenario: quello scelto, se c'e'; altrimenti quello che va con i
   punti delle due liste; altrimenti `riserva` (il tavolo di adesso). */
export function scenarioPer(listA, listB, voluto = "", riserva = ""){
  const tutti = scenariGiocabili();
  const ok = id => id && tutti.some(s => s.id === id);
  if (ok(voluto)) return voluto;
  /* le liste di Battle March si chiamano come la loro mappa */
  const nome = tutti.find(s => [listA, listB].some(l => l && l.name === s.label));
  if (nome) return nome.id;
  const pts = Math.max(listA ? listA.points || 0 : 0, listB ? listB.points || 0 : 0);
  const giusti = tutti.filter(s => s.pts && Math.abs(s.pts - pts) <= 150);
  if (ok(riserva) && giusti.some(s => s.id === riserva)) return riserva;
  const vicino = giusti.sort((a, b) => Math.abs(a.pts - pts) - Math.abs(b.pts - pts))[0];
  return (vicino && vicino.id) || (ok(riserva) ? riserva : "bm-strada");
}

/* ============================================================
   2 · COMINCIARE E FINIRE
   ============================================================ */
export function startSfida({ listA, listB, mia = "A", scenario = "" } = {}){
  if (!listA || !listB) return toast("Servono tutte e due le liste.");
  const avvisi = [];
  for (const [tag, l] of [["A", listA], ["B", listB]]){
    const p = PREP.playability(l, { split: PR.splitStat });
    if (!p.can) avvisi.push(`${tag} «${l.name}»: ${p.text}`);
  }
  const sc = scenarioPer(listA, listB, scenario);
  const nomi = { A: (listA.info && listA.info.catalogue) || listA.name,
                 B: (listB.info && listB.info.catalogue) || listB.name };
  if (nomi.A === nomi.B){ nomi.A += " (A)"; nomi.B += " (B)"; }
  const S = AR.newBattle({ A: listA, B: listB, scenario: sc, nomi, magia: MG.magicNow() });
  partita = { id: ++serie, S, mia: mia === "B" ? "B" : "A", attesa: null, pensa: false,
              ultima: null, avvisi, errori: [], agente: null };
  partita.agente = faiAgente();
  mostraSfida(S, { nuova: true });
  renderSfida();
  gira();
}

function faiAgente(){
  const chiave = leggi(KEY);
  const nome = chiave ? "Gemini" : "l'euristica";
  if (!chiave) return AG.agenteEuristico({ nome });
  return AG.agenteGemini({
    apiKey: chiave, model: leggi(MODEL) || MODELLO_DI_SOLITO, nome,
    /* il ritmo: tu sei lento di tuo, ma l'AI fa molte domande di fila
       quando attraversa le caselle in cui ha poco da decidere */
    attesa: 1500, ritenta: 3,
    onError: e => { if (partita) partita.errori.push(e.message); },
  });
}

export function abbandona(){
  partita = null;
  chiudiSfida();
  renderSfida();
}
export const inCorso = () => !!partita && !partita.S.finita;

/* ============================================================
   3 · IL GIRO
   Si chiede all'arbitro di chi e' la mossa. Se e' dell'AI si aspetta la
   sua risposta e si applica; se e' tua ci si ferma e si mostrano i
   pulsanti. Una casella in cui hai solo «avanti» si passa da sola, se
   lo vuoi: sono una dozzina di clic per turno che non decidono niente.
   ============================================================ */
async function gira(){
  const p = partita;
  if (!p || p.gira) return;
  p.gira = true;
  try {
    let giri = 0;
    while (partita === p && !p.S.finita && giri++ < 400){
      const o = AR.options(p.S);
      if (!o.list.length) break;
      if (o.player === p.mia){
        const soloAvanti = o.list.length === 1 && o.list[0].id === "avanti";
        if (soloAvanti && leggi(SALTA, "1") === "1"){
          applica(p, o, o.list[0], "passa da solo: non c'era niente da scegliere", "tu");
          continue;
        }
        p.attesa = o;
        break;
      }
      p.attesa = null; p.pensa = true;
      renderSfida();
      const ctx = { opzioni: o, fotografia: AR.fotografia(p.S, { per: o.player }),
                    registro: AR.ultimeRighe(p.S, 10), stato: p.S };
      const r = await p.agente.scegli(ctx);
      if (partita !== p) return;          // abbandonata mentre pensava
      p.pensa = false;
      applica(p, o, r && r.scelta, (r && r.perche) || "", "ai");
    }
  } catch (e){
    if (partita === p) p.errori.push(e.message);
  } finally {
    p.gira = false; p.pensa = false;
    if (partita === p){ mostraSfida(p.S); renderSfida(); }
  }
}

function applica(p, o, mossa, perche, chi){
  const r = AR.apply(p.S, mossa);
  if (chi === "ai" && mossa && mossa.id !== "avanti")
    p.ultima = { mossa: AG.descrivi(mossa), perche, ok: r.ok, casella: o.fase };
  if (!r.ok && mossa && mossa.id !== "avanti"){
    /* come nella partita da riga di comando: una mossa rifiutata non
       blocca niente, si passa e si scrive perche' */
    p.errori.push(`mossa rifiutata: ${r.text}`);
    AR.apply(p.S, { id: "avanti" });
  }
  AR.controllaFine(p.S);
  mostraSfida(p.S);
}

/* il tuo clic */
function scegli(i){
  const p = partita;
  if (!p || !p.attesa || p.gira) return;
  const o = p.attesa, mossa = o.list[i];
  if (!mossa) return;
  p.attesa = null;
  applica(p, o, mossa, "", "tu");
  renderSfida();
  gira();
}

/* ============================================================
   4 · IL PANNELLO
   ============================================================ */
const ETICHETTA = {
  schiera: "Schiera", unisci: "Unisci", unisciti: "Unisciti", separa: "Esci dal reggimento",
  dominio: "Dominio", tieni: "Tieni", scambia: "Scambia",
  raduna: "Raduna", carica: "Carica", reazione: "Reagisce", avanza: "Avanza", marcia: "Marcia",
  aggira: "Aggira l’ostacolo",
  gira: "Gira", riforma: "Riforma", indietro: "Indietro", lato: "Di lato", riordina: "Riordina",
  ferma: "Resta ferma", tira: "Tira", lancia: "Lancia", dissolvi: "Dissolvi", lascia: "Lascia",
  combatti: "Combatti", avanti: "Passa",
  sfida: "Lancia la sfida", accetta: "Raccogli la sfida", rifiuta: "Rifiuta la sfida",
  ritira: "Si ritira", nessuna: "Nessuna sfida",
};
const REAZIONE = { hold: "tiene", stand: "tiene e tira", flee: "fugge", fleeing: "sta già fuggendo" };

function etichetta(x){
  const cosa = x.id === "reazione" ? `${ETICHETTA.reazione}: ${REAZIONE[x.kind] || x.kind}`
             : x.id === "dissolvi" && x.fato ? "Dissolvi con la sorte"
             : ETICHETTA[x.id] || x.id;
  const chi = x.nome && !(x.id === "dissolvi" && x.fato) ? ` · ${x.nome}` : "";
  const dove = x.dove ? ` · ${x.dove}` : "";
  const contro = x.contro ? ` → ${x.contro}` : "";
  return cosa + chi + contro + dove;
}
/* il pezzo da accendere sul tavolo quando ci passi sopra */
const pezzoDi = x => x.target ?? x.host ?? x.verso ?? x.uid ?? null;

function righeRegistro(S, n = 40){
  return S.log.slice(-n).reverse().map(r => `
    <li class="sf-riga${r.kind === "limite" ? " sf-limite" : ""}">
      <span class="sf-t" style="color:var(--army${r.army === "B" ? "B" : "A"})">T${r.turno}</span>
      <span>${esc(r.text)}${r.page ? ` <span class="dim">p. ${r.page}</span>` : ""}</span>
      ${r.dice && r.dice.length ? `<span class="mono dim">[${r.dice.join(" ")}]</span>` : ""}
    </li>`).join("");
}

function impostazioni(){
  const chiave = leggi(KEY);
  return `
    <details class="sf-imp" ${chiave ? "" : "open"}>
      <summary class="panel-title">Chi gioca contro di te</summary>
      <p class="note">${chiave
        ? "Gemini, con la chiave salvata in questo browser."
        : "Nessuna chiave: gioca l'euristica, sei regole di buon senso da tavolo. Con una chiave di Google AI Studio gioca Gemini."}
        La chiave resta in questo browser, non entra nei backup né nella sincronia, e parte solo verso Google.</p>
      <label class="field"><span>Chiave Gemini</span>
        <input type="password" id="sf-key" autocomplete="off" placeholder="AIza…" value="${esc(chiave)}"></label>
      <label class="field"><span>Modello</span>
        <input type="text" id="sf-model" placeholder="${MODELLO_DI_SOLITO}" value="${esc(leggi(MODEL))}"></label>
      <div class="btn-row">
        <button class="btn tiny primary" id="sf-save">Salva</button>
        ${chiave ? `<button class="btn tiny ghost" id="sf-forget">Dimentica la chiave</button>` : ""}
      </div>
      <label class="field inline"><input type="checkbox" id="sf-salta" ${leggi(SALTA, "1") === "1" ? "checked" : ""}>
        <span>Passa da solo le caselle in cui non ho niente da scegliere</span></label>
    </details>`;
}

export function renderSfida(){
  const host = $("#sfida");
  if (!host) return;
  const p = partita;
  if (!p){
    host.innerHTML = `
      <p class="empty">Nessuna sfida in corso. Si comincia dalla scheda <b>Matchup</b>: scegli le due liste,
        con quale giochi tu, e premi <b>Sfida l'AI sul tavolo</b>.</p>
      <p class="note">L'arbitro tiene la partita e muove i pezzi: tu scegli fra le mosse che il regolamento
        ti permette, con le distanze e le probabilità già fatte, e l'altra parte la sceglie l'AI.</p>
      ${impostazioni()}`;
    agganciaImpostazioni(host);
    return;
  }
  const S = p.S, lui = p.mia === "A" ? "B" : "A";
  const pt = AR.punteggio(S);
  const o = p.attesa;
  const fase = S.finita ? "Partita finita"
             : S.preparando ? "Incantesimi, prima di schierare"
             : S.schierando ? "Schieramento"
             : `Turno ${S.turno}${S.rounds ? " di " + S.rounds : ""} · ${(AR.CASELLE[S.casella] || {}).fase || ""}`;
  host.innerHTML = `
    <div class="sf-testa">
      <div><b style="color:var(--army${p.mia})">Tu: ${esc(S.nomi[p.mia])}</b>
        <span class="dim">contro</span> <b style="color:var(--army${lui})">${esc(S.nomi[lui])}</b>
        <span class="dim">(${esc(p.agente.nome)})</span></div>
      <div class="mono">${esc(S.sc.label)} · ${esc(fase)} · punti vittoria ${pt[p.mia]} a ${pt[lui]}</div>
    </div>
    ${p.avvisi.length ? `<p class="note warn">${p.avvisi.map(esc).join("<br>")}<br>La partita si gioca lo stesso, ma quei conti sono finti.</p>` : ""}
    ${S.finita ? `
      <div class="readout"><span>${esc(S.esito.why)}</span>
        <b>${S.esito.winner ? (S.esito.winner === p.mia ? "Hai vinto" : "Ha vinto l'AI") + ": " + esc(S.esito.label) : esc(S.esito.label)}</b></div>`
    : p.pensa || !o ? `<p class="sf-pensa">${esc(p.agente.nome)} sta scegliendo…</p>`
    : `
      <div class="sf-scelta">
        <div class="sf-cosa">${esc(o.what || "")}${o.page ? ` <span class="dim">p. ${o.page}</span>` : ""}</div>
        <div class="sf-mosse">
          ${o.list.map((x, i) => `
            <button class="btn sf-mossa${x.id === "avanti" ? " ghost" : ""}" data-mossa="${i}"
                    ${pezzoDi(x) != null ? `data-pezzo="${pezzoDi(x)}"` : ""}>
              <b>${esc(etichetta(x))}</b>
              ${x.why ? `<small>${esc(x.why)}${x.page ? ` · p. ${x.page}` : ""}</small>` : ""}
            </button>`).join("")}
        </div>
      </div>`}
    ${p.ultima ? `
      <div class="sf-ai">
        <div class="dim">L'ultima mossa dell'AI (${esc(p.ultima.casella || "")})</div>
        <div><b>${esc(p.ultima.mossa)}</b></div>
        ${p.ultima.perche ? `<blockquote>${esc(p.ultima.perche)}</blockquote>` : ""}
      </div>` : ""}
    ${p.errori.length ? `<details class="sf-err"><summary>${p.errori.length} intoppi con l'AI</summary>
      <ul>${p.errori.slice(-6).map(e => `<li class="mono">${esc(e)}</li>`).join("")}</ul></details>` : ""}
    <div class="panel-title">Registro</div>
    <ol class="sf-registro">${righeRegistro(S)}</ol>
    <div class="btn-row">
      <button class="btn tiny" id="sf-copia">Copia il registro</button>
      <button class="btn tiny ghost" id="sf-basta" style="color:var(--bad)">${S.finita ? "Chiudi la sfida" : "Abbandona"}</button>
    </div>
    ${impostazioni()}`;

  host.querySelectorAll("[data-mossa]").forEach(b => {
    b.addEventListener("click", () => scegli(+b.dataset.mossa));
    if (b.dataset.pezzo) b.addEventListener("mouseenter", () => evidenzia(+b.dataset.pezzo));
  });
  const copia = $("#sf-copia");
  if (copia) copia.addEventListener("click", async () => {
    const testo = S.log.map(r => `T${r.turno} ${r.text}${r.page ? ` (p. ${r.page})` : ""}`).join("\n");
    try { await navigator.clipboard.writeText(testo); copia.textContent = "Copiato ✓"; }
    catch { copia.textContent = "Non riesco a copiare"; }
  });
  const basta = $("#sf-basta");
  if (basta) basta.addEventListener("click", () => abbandona());
  agganciaImpostazioni(host);
}

function agganciaImpostazioni(host){
  const salva = host.querySelector("#sf-save");
  if (salva) salva.addEventListener("click", () => {
    scrivi(KEY, host.querySelector("#sf-key").value.trim());
    scrivi(MODEL, host.querySelector("#sf-model").value.trim());
    /* l'avversario cambia subito, anche a partita in corso */
    if (partita) partita.agente = faiAgente();
    toast(leggi(KEY) ? "Chiave salvata: gioca Gemini." : "Nessuna chiave: gioca l'euristica.");
    renderSfida();
  });
  const dimentica = host.querySelector("#sf-forget");
  if (dimentica) dimentica.addEventListener("click", () => {
    scrivi(KEY, ""); if (partita) partita.agente = faiAgente(); renderSfida();
  });
  const salta = host.querySelector("#sf-salta");
  if (salta) salta.addEventListener("change", () => { scrivi(SALTA, salta.checked ? "1" : "0"); gira(); });
}
