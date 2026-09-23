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
 * l'euristica che guarda una mossa avanti (`ricerca.js`), e il pannello
 * lo dice.
 *
 * La partita vive in questa scheda: ricaricando la pagina si ricomincia.
 */

import { $, esc } from './util.js';
import * as AR from './arbitro.js';
import * as AG from './agente.js';
import { agenteRicerca } from './ricerca.js';
import * as MG from './magic.js';
import * as PR from './profiles.js';
import * as PREP from './prep.js';
import { SCENARIOS } from './scenarios.js';
import { customScenarioMap } from './scenariokit.js';
import { mostraSfida, chiudiSfida, evidenzia, toast } from './deploy.js';
import { rigaHTML, SPIEGA_CSS } from './spiega.js';

const KEY = "tow-gemini-key";
const MODEL = "tow-gemini-model";
const SALTA = "tow-sfida-salta";
const SPIEGA = "tow-sfida-spiega";
const CALMA = "tow-sfida-calma";
const MODELLO_DI_SOLITO = "gemini-2.5-flash";

const leggi = (k, d = "") => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const scrivi = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* niente */ } };

let partita = null;
let serie = 0;

/* ============================================================
   1 · GLI SCENARI CHE L'ARBITRO SA GIOCARE
   Quelli con un tavolo e uno schieramento: gli altri sono disegni
   liberi, e l'arbitro non saprebbe dove mettere nessuno.
   Ci sono anche i tuoi, salvati dal tavolo: hanno la stessa forma.
   ============================================================ */
const tuttiGliScenari = () => ({ ...SCENARIOS, ...customScenarioMap() });

export const scenariGiocabili = () => Object.entries(tuttiGliScenari())
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
  const S = AR.newBattle({ A: listA, B: listB, scenario: sc, def: tuttiGliScenari()[sc], nomi, magia: MG.magicNow() });
  /* `mia` vuota: nessuno dei due eserciti e' tuo, e si guarda l'AI
     giocare contro se stessa. E' la partita di `tools/partita.mjs`, ma
     sul tavolo vero e con le schede del perche' che compaiono mentre
     succede, invece che dopo in una pagina da scorrere. */
  const guarda = mia !== "A" && mia !== "B";
  partita = { id: ++serie, S, mia: guarda ? null : mia, attesa: null, pensa: false,
              ultima: null, avvisi, errori: [], agente: null, agenti: null, visto: 0,
              fermo: false, unPasso: false };
  svuotaPila();
  partita.agente = faiAgente();
  /* due agenti e non uno: quello che guarda avanti si tiene le sue
     prove, e Gemini la sua conversazione — mescolarle vorrebbe dire
     che un esercito ricorda i pensieri dell'altro */
  if (guarda) partita.agenti = { A: faiAgente(), B: faiAgente() };
  mostraSfida(S, { nuova: true });
  renderSfida();
  gira();
}

function faiAgente(){
  const chiave = leggi(KEY);
  const nome = chiave ? "Gemini" : "l'euristica che guarda avanti";
  /* senza chiave, chi guarda una mossa avanti: prova le mosse su una
     copia della partita e sceglie con i numeri (src/ricerca.js). Sei
     volte piu' lento dell'euristica sola, cioe' un attimo per mossa. */
  if (!chiave) return agenteRicerca({ AR, nome });
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
  svuotaPila();
  chiudiSfida();
  renderSfida();
}
export const inCorso = () => !!partita && !partita.S.finita;
/* la partita dell'arbitro, per chi la guarda da fuori (le prove) */
export const statoSfida = () => partita ? partita.S : null;
/* chi sceglie la mossa di un esercito: il tuo avversario, o in una
   partita da guardare l'agente di quella parte */
const agenteDi = (p, army) => (p.agenti && p.agenti[army]) || p.agente;

/* i comandi di chi guarda: fermarsi, ripartire, una mossa sola */
function ferma(){ if (partita && !partita.mia){ partita.fermo = true; renderSfida(); } }
function riprendi(){ if (partita && !partita.mia){ partita.fermo = false; renderSfida(); gira(); } }
function unPasso(){
  if (!partita || partita.mia || partita.gira) return;
  partita.fermo = true; partita.unPasso = true;
  gira();
}

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
    /* chi guarda non fa niente, e la partita non ha un tetto di mosse:
       si ferma quando e' finita o quando lo chiedi */
    while (partita === p && !p.S.finita && (!p.mia || giri++ < 400)){
      if (!p.mia && p.fermo && !p.unPasso) break;
      const o = AR.options(p.S);
      if (!o.list.length) break;
      /* l'unica mossa possibile e' passare: non c'e' niente da chiedere
         a nessuno, e a Gemini costerebbe una domanda */
      if (!p.mia && o.list.length === 1 && o.list[0].id === "avanti"){
        applica(p, o, o.list[0], "", "ai");
        continue;
      }
      if (o.player === p.mia){
        const soloAvanti = o.list.length === 1 && o.list[0].id === "avanti";
        if (soloAvanti && leggi(SALTA, "1") === "1"){
          applica(p, o, o.list[0], "passa da solo: non c'era niente da scegliere", "tu");
          continue;
        }
        p.attesa = o;
        break;
      }
      p.attesa = null; p.pensa = true; p.chiPensa = o.player;
      renderSfida();
      const ctx = { opzioni: o, fotografia: AR.fotografia(p.S, { per: o.player }),
                    registro: AR.ultimeRighe(p.S, 10), stato: p.S };
      const r = await agenteDi(p, o.player).scegli(ctx);
      if (partita !== p) return;          // abbandonata mentre pensava
      p.pensa = false;
      const schede = applica(p, o, r && r.scelta, (r && r.perche) || "", "ai");
      if (p.unPasso){ p.unPasso = false; break; }
      /* con calma: dopo una mossa dell'AI che ha tirato dadi ci si ferma
         il tempo di leggere le schede, prima che la mossa dopo le copra.
         Senza, l'euristica gioca mezzo turno in un attimo e dal tavolo si
         vedono solo i pezzi arrivati, non il perche'. Chi guarda si
         ferma un attimo anche senza dadi: i pezzi devono vedersi muovere. */
      const calma = leggi(CALMA, "1") === "1";
      const leggere = schede && leggi(SPIEGA, "1") === "1" && calma ? Math.min(4500, 700 + schede * 1100) : 0;
      const ms = Math.max(leggere, p.mia ? 0 : calma ? 450 : 120);
      if (ms && !p.S.finita){
        renderSfida();
        await pausa(ms);
        if (partita !== p) return;
      }
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
    p.ultima = { mossa: AG.descrivi(mossa), perche, ok: r.ok, casella: o.fase, army: o.player };
  if (!r.ok && mossa && mossa.id !== "avanti"){
    /* come nella partita da riga di comando: una mossa rifiutata non
       blocca niente, si passa e si scrive perche' */
    p.errori.push(`mossa rifiutata: ${r.text}`);
    AR.apply(p.S, { id: "avanti" });
  }
  AR.controllaFine(p.S);
  mostraSfida(p.S);
  /* le schede delle righe nuove, e davanti il perche' dell'AI */
  const scelta = chi === "ai" && mossa && mossa.id !== "avanti" && perche
    ? { x: { k: "scelta", t: "Perché questa mossa", testo: perche,
             u: p.mia ? agenteDi(p, o.player).nome : p.S.nomi[o.player] }, army: o.player } : null;
  return raccogli(p, scelta);
}
const pausa = ms => new Promise(r => setTimeout(r, ms));

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
  primo: "Tocca a", schiera: "Schiera", unisci: "Unisci", unisciti: "Unisciti", separa: "Esci dal reggimento",
  dominio: "Dominio", tieni: "Tieni", scambia: "Scambia",
  raduna: "Raduna", carica: "Carica", reazione: "Reagisce", avanza: "Avanza", marcia: "Marcia",
  aggira: "Aggira l’ostacolo",
  gira: "Gira", riforma: "Riforma", indietro: "Indietro", lato: "Di lato", riordina: "Riordina",
  ferma: "Resta ferma", tira: "Tira", lancia: "Lancia", dissolvi: "Dissolvi", lascia: "Lascia",
  combatti: "Combatti", avanti: "Passa",
  sfida: "Lancia la sfida", accetta: "Raccogli la sfida", rifiuta: "Rifiuta la sfida",
  ritira: "Si ritira", nessuna: "Nessuna sfida",
  vaga: "Si muove di quanto ha tirato",
};
/* gli Abominable Attacks sono un gesto solo con tre scelte dentro */
const ABOMINIO = { normali: "Attacca normalmente", nutriti: "Si nutre", valanga: "Valanga di carne" };
const REAZIONE = { hold: "tiene", stand: "tiene e tira", flee: "fugge", fleeing: "sta già fuggendo" };

function etichetta(x){
  const cosa = x.id === "reazione" ? `${ETICHETTA.reazione}: ${REAZIONE[x.kind] || x.kind}`
             : x.id === "dissolvi" && x.fato ? "Dissolvi con la sorte"
             : x.id === "abominio" ? ABOMINIO[x.scelta] || "Abominable Attacks"
             : x.id === "vaga" && x.carica ? "Carica col Movimento tirato"
             : x.id === "vaga" && x.dritto ? "Dritta, di quanto ha tirato"
             : ETICHETTA[x.id] || x.id;
  const chi = x.nome && !(x.id === "dissolvi" && x.fato) ? ` · ${x.nome}` : "";
  const dove = x.dove ? ` · ${x.dove}` : "";
  const contro = x.contro ? ` → ${x.contro}` : "";
  return cosa + chi + contro + dove;
}
/* il pezzo da accendere sul tavolo quando ci passi sopra */
const pezzoDi = x => x.target ?? x.host ?? x.verso ?? x.uid ?? null;

function righeRegistro(S, n = 40){
  return S.log.slice(-n).reverse().map(r => {
    const testo = `${esc(r.text)}${r.page ? ` <span class="dim">p. ${r.page}</span>` : ""}`;
    /* la riga con una spiegazione si apre sulla sua scheda: i dadi
       stanno li', e la fila dei numeri non serve piu' */
    return `
    <li class="sf-riga${r.kind === "limite" ? " sf-limite" : ""}">
      <span class="sf-t" style="color:var(--army${r.army === "B" ? "B" : "A"})">T${r.turno}</span>
      ${r.x ? `<details class="sf-perche"><summary>${testo}</summary>${rigaHTML(r, { compatta: true })}</details>`
            : `<span>${testo}</span>
      ${r.dice && r.dice.length ? `<span class="mono dim">[${r.dice.join(" ")}]</span>` : ""}`}
    </li>`;
  }).join("");
}

/* ============================================================
   5 · IL PERCHE' SUL TAVOLO
   Ogni riga del registro che ha una spiegazione (`spiega.js`) diventa
   una scheda sopra il tavolo: i dadi, il numero da battere, e quello
   che li ha spostati. Le schede restano qualche secondo e poi se ne
   vanno; passandoci sopra restano e accendono il pezzo di cui parlano,
   e un clic le fissa finche' non le chiudi.
   ============================================================ */
const VITA = 9000, QUANTE = 3;
let pila = null;

function contenitore(){
  if (pila && pila.isConnected) return pila;
  const campo = document.querySelector(".board-scroll");
  if (!campo) return null;
  if (!document.getElementById("sp-css")){
    const st = document.createElement("style");
    st.id = "sp-css"; st.textContent = SPIEGA_CSS;
    document.head.appendChild(st);
  }
  pila = document.createElement("div");
  pila.className = "sp-pila";
  pila.setAttribute("aria-live", "polite");
  campo.appendChild(pila);
  return pila;
}
function svuotaPila(){ if (pila) pila.innerHTML = ""; }

function vattene(v){
  if (!v.isConnected) return;
  v.classList.add("sp-via");
  setTimeout(() => v.remove(), 260);
}
function aggiungiScheda(riga){
  const html = rigaHTML(riga);
  const box = html && contenitore();
  if (!box) return;
  const v = document.createElement("div");
  v.className = "sp-voce";
  v.innerHTML = `${html}<button class="sp-chiudi" title="Chiudi" aria-label="Chiudi">×</button>`;
  const uid = riga.x && riga.x.uid;
  let timer = setTimeout(() => vattene(v), VITA);
  v.addEventListener("mouseenter", () => {
    clearTimeout(timer);
    if (uid != null) evidenzia(uid);
  });
  v.addEventListener("mouseleave", () => {
    if (!v.classList.contains("sp-fissa")) timer = setTimeout(() => vattene(v), VITA / 2);
  });
  v.addEventListener("click", e => {
    if (e.target.closest(".sp-chiudi")) return vattene(v);
    v.classList.toggle("sp-fissa");
  });
  box.appendChild(v);
  /* le piu' vecchie lasciano il posto, tranne quelle fissate */
  const libere = [...box.children].filter(x => !x.classList.contains("sp-fissa") && !x.classList.contains("sp-via"));
  for (const x of libere.slice(0, Math.max(0, libere.length - QUANTE))) vattene(x);
}

/* le righe nuove del registro, dall'ultima volta: torna quante schede */
function raccogli(p, scelta = null){
  const nuove = p.S.log.slice(p.visto).filter(r => r.x);
  p.visto = p.S.log.length;
  if (leggi(SPIEGA, "1") !== "1") return 0;
  const tutte = (scelta ? [scelta] : []).concat(nuove);
  for (const r of tutte) aggiungiScheda(r);
  /* il perche' della scelta si legge anche lui, ma e' una frase e non
     un tiro: vale poco piu' di mezza scheda */
  return nuove.length + (scelta ? 0.6 : 0);
}

function impostazioni(){
  const chiave = leggi(KEY);
  return `
    <details class="sf-imp" ${chiave ? "" : "open"}>
      <summary class="panel-title">${partita && !partita.mia ? "Chi gioca, da tutte e due le parti" : "Chi gioca contro di te"}</summary>
      <p class="note">${chiave
        ? "Gemini, con la chiave salvata in questo browser."
        : "Nessuna chiave: gioca l'euristica che guarda avanti — le regole di buon senso da tavolo, e ogni mossa provata su una copia della partita prima di farla. Con una chiave di Google AI Studio gioca Gemini."}
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
      <label class="field inline"><input type="checkbox" id="sf-spiega" ${leggi(SPIEGA, "1") === "1" ? "checked" : ""}>
        <span>Spiega sul tavolo i dadi, le regole e il terreno che cambiano un risultato</span></label>
      <label class="field inline"><input type="checkbox" id="sf-calma" ${leggi(CALMA, "1") === "1" ? "checked" : ""}>
        <span>L'AI aspetta qualche secondo dopo ogni mossa con i dadi, per leggere il perché</span></label>
    </details>`;
}

export function renderSfida(){
  const host = $("#sfida");
  if (!host) return;
  const p = partita;
  if (!p){
    host.innerHTML = `
      <p class="empty">Nessuna sfida in corso. Si comincia dalla scheda <b>Matchup</b>: scegli le due liste,
        con quale giochi tu, e premi <b>Sfida l'AI sul tavolo</b>. Se scegli <i>nessuno</i>, l'AI gioca da
        tutte e due le parti e tu guardi.</p>
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
             : S.pending && S.pending.kind === "primo" ? "Chi comincia"
             : S.schierando ? "Schieramento"
             : `Turno ${S.turno}${S.rounds ? " di " + S.rounds : ""} · ${(AR.CASELLE[S.casella] || {}).fase || ""}`;
  const guarda = !p.mia;
  /* chi guarda vede i due eserciti alla pari, A a sinistra */
  const [io, altro] = guarda ? ["A", "B"] : [p.mia, lui];
  const testa = guarda
    ? `<div><b style="color:var(--armyA)">${esc(S.nomi.A)}</b>
         <span class="dim">contro</span> <b style="color:var(--armyB)">${esc(S.nomi.B)}</b>
         <span class="dim">(tutti e due: ${esc(p.agente.nome)})</span></div>`
    : `<div><b style="color:var(--army${p.mia})">Tu: ${esc(S.nomi[p.mia])}</b>
        <span class="dim">contro</span> <b style="color:var(--army${lui})">${esc(S.nomi[lui])}</b>
        <span class="dim">(${esc(p.agente.nome)})</span></div>`;
  const vince = !S.finita || !S.esito.winner ? ""
    : guarda ? `Ha vinto ${S.nomi[S.esito.winner]}: ` : S.esito.winner === p.mia ? "Hai vinto: " : "Ha vinto l'AI: ";
  /* chi guarda: fermarsi, ripartire, una mossa per volta */
  const comandi = guarda && !S.finita ? `
    <div class="btn-row sf-guarda">
      ${p.fermo
        ? `<button class="btn tiny primary" id="sf-riprendi">▶ Riprendi</button>
           <button class="btn tiny" id="sf-passo" ${p.gira ? "disabled" : ""}>Una mossa</button>`
        : `<button class="btn tiny" id="sf-ferma">❚❚ Ferma</button>`}
      <span class="dim">${p.fermo ? (p.gira ? "sta giocando una mossa…" : "ferma: passa sopra le schede per leggerle")
                                  : "gioca da sola; ferma quando vuoi guardare meglio"}</span>
    </div>` : "";
  const chiPensa = guarda && p.chiPensa ? S.nomi[p.chiPensa] : p.agente.nome;
  host.innerHTML = `
    <div class="sf-testa">
      ${testa}
      <div class="mono">${esc(S.sc.label)} · ${esc(fase)} · punti vittoria ${pt[io]} a ${pt[altro]}</div>
    </div>
    ${p.avvisi.length ? `<p class="note warn">${p.avvisi.map(esc).join("<br>")}<br>La partita si gioca lo stesso, ma quei conti sono finti.</p>` : ""}
    ${comandi}
    ${S.finita ? `
      <div class="readout"><span>${esc(S.esito.why)}</span>
        <b>${esc(vince)}${esc(S.esito.label)}</b></div>`
    : guarda ? (p.pensa ? `<p class="sf-pensa">${esc(chiPensa)} sta scegliendo…</p>` : "")
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
        <div class="dim">${guarda && p.ultima.army ? `L'ultima mossa di <b style="color:var(--army${p.ultima.army})">${esc(S.nomi[p.ultima.army])}</b>`
                                                  : "L'ultima mossa dell'AI"} (${esc(p.ultima.casella || "")})</div>
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
  for (const [id, fai] of [["#sf-ferma", ferma], ["#sf-riprendi", riprendi], ["#sf-passo", unPasso]]){
    const b = host.querySelector(id);
    if (b) b.addEventListener("click", fai);
  }
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
    if (partita){ partita.agente = faiAgente(); if (partita.agenti) partita.agenti = { A: faiAgente(), B: faiAgente() }; }
    toast(leggi(KEY) ? "Chiave salvata: gioca Gemini." : "Nessuna chiave: gioca l'euristica che guarda avanti.");
    renderSfida();
  });
  const dimentica = host.querySelector("#sf-forget");
  if (dimentica) dimentica.addEventListener("click", () => {
    scrivi(KEY, ""); if (partita){ partita.agente = faiAgente(); if (partita.agenti) partita.agenti = { A: faiAgente(), B: faiAgente() }; } renderSfida();
  });
  const salta = host.querySelector("#sf-salta");
  if (salta) salta.addEventListener("change", () => { scrivi(SALTA, salta.checked ? "1" : "0"); gira(); });
  const spiega = host.querySelector("#sf-spiega");
  if (spiega) spiega.addEventListener("change", () => {
    scrivi(SPIEGA, spiega.checked ? "1" : "0");
    if (!spiega.checked) svuotaPila();
  });
  const calma = host.querySelector("#sf-calma");
  if (calma) calma.addEventListener("change", () => scrivi(CALMA, calma.checked ? "1" : "0"));
}
