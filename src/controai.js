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
 * Per tenerla c'e' «Salva nel diario»: mentre si gioca si registrano i
 * fotogrammi del tavolo (`replay.js`) e le fotografie di ogni mezzo
 * turno (`archivio.js`), e la voce che finisce nella scheda Partite si
 * rivede con la stessa pagina animata di `tools/partita.mjs --html`.
 *
 * AI contro AI e' anche il modo di far girare `tools/partita.mjs` senza
 * terminale — dal telefono, per esempio: lo stesso seme, l'euristica con
 * o senza estro, chi guarda avanti, e la partita si guarda dal vivo con
 * la velocita' che si sceglie, invece di aspettare una pagina alla fine.
 */

import { $, esc } from './util.js';
import * as AR from './arbitro.js';
import * as AG from './agente.js';
import * as D from './dice.js';
import * as RP from './replay.js';
import * as ARCH from './archivio.js';
import { addReport, rivedi } from './reports.js';
import { agenteRicerca } from './ricerca.js';
import * as MG from './magic.js';
import * as PR from './profiles.js';
import * as PREP from './prep.js';
import { SCENARIOS } from './scenarios.js';
import { customScenarioMap } from './scenariokit.js';
import { mostraSfida, chiudiSfida, evidenzia, toast } from './deploy.js';
import { askConfirm } from './uikit.js';
import { rigaHTML, SPIEGA_CSS } from './spiega.js';

const KEY = "tow-gemini-key";
const MODEL = "tow-gemini-model";
const SALTA = "tow-sfida-salta";
const SPIEGA = "tow-sfida-spiega";
const CALMA = "tow-sfida-calma";
const VELOCITA = "tow-sfida-velocita";
/* la velocita' di chi guarda: moltiplica le pause fra una mossa e
   l'altra. «Di corsa» non aspetta niente, ma lascia disegnare il tavolo. */
export const VELOCITA_SCELTE = [[0.25, "lentissima"], [0.5, "lenta"], [1, "normale"], [2, "veloce"], [4, "velocissima"], [0, "di corsa"]];
const velocita = () => { const v = +leggi(VELOCITA, "1"); return VELOCITA_SCELTE.some(([x]) => x === v) ? v : 1; };
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
/* `agenti`: chi gioca ciascuna parte quando non sei tu — "ricerca" (di
   suo senza chiave), "euristica", "estro", "gemini". `seme`: in una
   partita da guardare i dadi vengono dal seme, e la stessa partita si
   rigioca uguale, come con `tools/partita.mjs --seme`. `salva`: alla
   fine finisce da sola nel diario. */
export function startSfida({ listA, listB, mia = "A", scenario = "", agenti = null, seme = null, salva = false } = {}){
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
  /* `mia` vuota: nessuno dei due eserciti e' tuo, e si guarda l'AI
     giocare contro se stessa. E' la partita di `tools/partita.mjs`, ma
     sul tavolo vero e con le schede del perche' che compaiono mentre
     succede, invece che dopo in una pagina da scorrere. */
  const guarda = mia !== "A" && mia !== "B";
  /* il seme vale solo per chi guarda: con te al tavolo i dadi sono
     quelli veri, e un seme li renderebbe prevedibili */
  const conSeme = guarda && seme != null && +seme >= 1 ? Math.floor(+seme) : null;
  if (conSeme != null) D.setSource(D.seeded(conSeme));
  const S = AR.newBattle({ A: listA, B: listB, scenario: sc, def: tuttiGliScenari()[sc], nomi, magia: MG.magicNow() });
  partita = { id: ++serie, S, mia: guarda ? null : mia, attesa: null, pensa: false,
              ultima: null, avvisi, errori: [], agente: null, agenti: null, visto: 0,
              fermo: false, unPasso: false, seme: conSeme, salva: !!salva, tipi: agenti || null,
              liste: { A: listA, B: listB }, storia: [], guardo: null };
  ricorda(partita);
  svuotaPila();
  const lui = mia === "A" ? "B" : "A";
  partita.agente = faiAgente(agenti && !guarda ? agenti[lui] : null, lui, conSeme);
  /* due agenti e non uno: quello che guarda avanti si tiene le sue
     prove, e Gemini la sua conversazione — mescolarle vorrebbe dire
     che un esercito ricorda i pensieri dell'altro */
  if (guarda) partita.agenti = { A: faiAgente(agenti && agenti.A, "A", conSeme),
                                 B: faiAgente(agenti && agenti.B, "B", conSeme) };
  registra(partita);
  mostraSfida(S, { nuova: true });
  if (leggi(SPIEGA, "1") === "1") contenitore();
  renderSfida();
  gira();
}

/* L'estro dell'euristica nasce dal seme e dalla parte, come in
   `tools/partita.mjs`: la partita col seme 42 e l'estro e' la stessa
   qui e nel terminale. */
const semeEstro = (s, tag) => ((s * 2654435761) ^ (tag === "A" ? 0x51ed27 : 0xa3c1f5)) >>> 0;
export const TIPI_AGENTE = [
  ["ricerca", "l'euristica che guarda avanti"],
  ["euristica", "l'euristica"],
  ["estro", "l'euristica con estro"],
  ["gemini", "Gemini (con la chiave)"],
];
export const haChiave = () => !!leggi(KEY);
function faiAgente(tipo = null, tag = "B", seme = null){
  const chiave = leggi(KEY);
  const vuole = tipo || (chiave ? "gemini" : "ricerca");
  /* senza seme — tu al tavolo, coi dadi veri — l'estro ne pesca uno:
     con 1 fisso il piano dell'euristica sarebbe sempre lo stesso */
  const s = seme || 1 + Math.floor(Math.random() * 1e6);
  if (vuole === "euristica") return AG.agenteEuristico({ nome: "l'euristica" });
  if (vuole === "estro")
    return AG.agenteEuristico({ nome: "l'euristica con estro", estro: D.seeded(semeEstro(s, tag)) });
  /* senza chiave, chi guarda una mossa avanti: prova le mosse su una
     copia della partita e sceglie con i numeri (src/ricerca.js). Sei
     volte piu' lento dell'euristica sola, cioe' un attimo per mossa. */
  if (vuole === "ricerca" || !chiave) return agenteRicerca({ AR, nome: "l'euristica che guarda avanti", ...(seme ? { seme } : {}) });
  const nome = "Gemini";
  return AG.agenteGemini({
    apiKey: chiave, model: leggi(MODEL) || MODELLO_DI_SOLITO, nome,
    /* il ritmo: tu sei lento di tuo, ma l'AI fa molte domande di fila
       quando attraversa le caselle in cui ha poco da decidere */
    attesa: 1500, ritenta: 3,
    onError: e => { if (partita) partita.errori.push(e.message); },
  });
}

export function abbandona(){
  if (partita && partita.seme != null) D.setSource(null);
  partita = null;
  esciCinema();
  togliPila();
  chiudiSfida();
  renderSfida();
}
export const inCorso = () => !!partita && !partita.S.finita;
/* la partita dell'arbitro, per chi la guarda da fuori (le prove) */
export const statoSfida = () => partita ? partita.S : null;
/* chi sceglie la mossa di un esercito: il tuo avversario, o in una
   partita da guardare l'agente di quella parte */
const agenteDi = (p, army) => (p.agenti && p.agenti[army]) || p.agente;

/* ============================================================
   2b · AVANTI E INDIETRO NEL TEMPO
   Dopo ogni mossa che cambia il tavolo se ne tiene una fotografia (le
   unita' e basta: e' quello che il tavolo disegna), e con ◀ e ▶ si
   guarda com'era, fino alla prima e di nuovo fino all'ultima. Guardare
   indietro non tocca la partita: l'arbitro resta dov'e', e chi guarda
   l'AI la trova ferma. Da adesso, ▶ gioca la mossa dopo — cosi' si va
   avanti uno stato alla volta fino alla fine della partita.
   ============================================================ */
const copiaUnita = u => {
  const c = { ...u, effects: (u.effects || []).map(e => ({ ...e })), join: u.join ? { ...u.join } : null,
              fallen: Array.isArray(u.fallen) ? u.fallen.slice() : u.fallen,
              formation: u.formation && typeof u.formation === "object" ? structuredClone(u.formation) : u.formation };
  delete c.mago; delete c.prepara;
  return c;
};
const firmaTavolo = S => S.units.map(u => [u.uid, Math.round(u.x), Math.round(u.y), Math.round(u.rot || 0), u.lost || 0,
  u.wounds || 0, u.dead ? 1 : 0, u.fled ? 1 : 0, u.placed ? 1 : 0, u.frontage || 0, u.join ? u.join.host : ""].join(",")).join(";");
function faseDi(S){
  return S.finita ? "fine della partita" : S.preparando ? "incantesimi" : S.schierando ? "schieramento"
       : `turno ${S.turno} · ${S.nomi[S.army]} · ${(AR.CASELLE[S.casella] || {}).fase || ""}`;
}
function ricorda(p){
  const S = p.S, f = firmaTavolo(S), ultima = p.storia[p.storia.length - 1];
  if (ultima && ultima.firma === f){ ultima.fase = faseDi(S); return; }
  p.storia.push({ firma: f, units: S.units.map(copiaUnita), fase: faseDi(S) });
}
/* il tavolo che si vede: quello di adesso, o lo stato che si sta guardando */
function mostra(p){
  if (p.guardo != null && p.storia[p.guardo]) mostraSfida({ units: p.storia[p.guardo].units });
  else mostraSfida(p.S);
}
function vaiA(k){
  const p = partita;
  if (!p || !p.storia.length) return;
  const ultimo = p.storia.length - 1;
  k = Math.max(0, Math.min(ultimo, k));
  p.guardo = k >= ultimo ? null : k;
  mostra(p);
  renderSfida();
}
function indietro(){
  const p = partita;
  if (!p) return;
  if (!p.mia) p.fermo = true;
  vaiA((p.guardo ?? p.storia.length - 1) - 1);
}
function avanti(){
  const p = partita;
  if (!p) return;
  if (p.guardo != null) return vaiA(p.guardo + 1);
  /* gia' al presente: chi guarda gioca la mossa dopo */
  if (!p.mia && !p.S.finita) unPasso();
}
const alPrimo = () => { if (partita && !partita.mia) partita.fermo = true; vaiA(0); };
const alPresente = () => vaiA(Infinity);
function giraFermo(){
  const p = partita;
  if (!p || p.mia || p.S.finita) return;
  if (p.fermo){ p.guardo = null; mostra(p); riprendi(); } else ferma();
}
/* i pulsanti, gli stessi nel pannello e a schermo intero */
function tempoHTML(p, cls = "btn tiny"){
  const n = p.storia.length, k = p.guardo ?? n - 1;
  const fine = p.guardo == null && (p.mia || p.S.finita);
  return `
    <button class="${cls}" data-t="primo" ${k <= 0 ? "disabled" : ""} title="al primo stato (Home)">⏮</button>
    <button class="${cls}" data-t="indietro" ${k <= 0 ? "disabled" : ""} title="uno stato indietro (←)">◀</button>
    <button class="${cls}" data-t="avanti" ${fine || p.gira ? "disabled" : ""}
      title="${p.guardo == null ? "gioca la mossa dopo (→)" : "uno stato avanti (→)"}">▶</button>
    <button class="${cls}" data-t="presente" ${p.guardo == null ? "disabled" : ""} title="torna ad adesso (End)">⏭</button>`;
}
const TEMPO = { primo: alPrimo, indietro, avanti, presente: alPresente };
function agganciaTempo(box){
  box.querySelectorAll("button[data-t]").forEach(b => b.addEventListener("click", e => {
    e.stopPropagation(); TEMPO[b.dataset.t](); svegliaCinema();
  }));
}

/* La tastiera: spazio ferma e riparte (chi guarda), le frecce vanno
   avanti e indietro di uno stato, Home ed End ai due capi. Si ascolta
   prima del tavolo, che con le frecce sposterebbe il pezzo acceso —
   una copia che l'arbitro non vede. */
if (typeof document !== "undefined") document.addEventListener("keydown", e => {
  const p = partita;
  if (!p || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/input|select|textarea/i.test(e.target.tagName || "") || e.target.isContentEditable) return;
  const tavolo = document.querySelector('[data-panel="deploy"]');
  if (tavolo && tavolo.hidden) return;
  /* con una finestra aperta sopra (una domanda, l'editor della
     formazione, la partita da rivedere) i tasti sono suoi */
  if (document.querySelector(".dlg-back, .modal-back, .rivedi-velo")) return;
  const fai = e.key === " " && !p.mia ? giraFermo
            : e.key === "ArrowLeft" ? indietro : e.key === "ArrowRight" ? avanti
            : e.key === "Home" ? alPrimo : e.key === "End" ? alPresente : null;
  if (!fai) return;
  e.preventDefault(); e.stopImmediatePropagation();
  fai();
  svegliaCinema();
}, true);

/* i comandi di chi guarda: fermarsi, ripartire, una mossa sola */
function ferma(){ if (partita && !partita.mia){ partita.fermo = true; renderSfida(); } }
function riprendi(){
  if (!partita || partita.mia) return;
  partita.fermo = false;
  if (partita.guardo != null){ partita.guardo = null; mostra(partita); }
  renderSfida(); gira();
}
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
        /* con una mossa a tappe aperta «avanti» la chiuderebbe: si aspetta */
        const aMano = AR.passiPossibili(p.S).some(x => x.inCorso);
        if (soloAvanti && !aMano && leggi(SALTA, "1") === "1"){
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
      const v = velocita();
      /* la velocita' scala le pause di chi guarda; «di corsa» non ne fa,
         ma un giro del browser lo lascia lo stesso, se no il tavolo non
         si disegna finche' la partita non e' finita */
      const ms = v === 0 ? 0 : Math.max(leggere, p.mia ? 0 : calma ? 450 : 120) / (p.mia ? 1 : v);
      if (!p.S.finita){
        if (ms || !p.mia) renderSfida();
        if (ms) await pausa(ms);
        else if (!p.mia) await pausa(0);
        if (partita !== p) return;
      }
    }
  } catch (e){
    if (partita === p) p.errori.push(e.message);
  } finally {
    p.gira = false; p.pensa = false;
    if (partita === p){
      if (p.S.finita) await finita(p);
      mostra(p); renderSfida();
    }
  }
}

/* la partita e' finita: i dadi tornano veri, e se era chiesto si salva */
async function finita(p){
  if (p.chiusa) return;
  p.chiusa = true;
  if (p.seme != null) D.setSource(null);
  if (p.salva && !p.salvata) await salvaNelDiario(p);
}

function applica(p, o, mossa, perche, chi){
  const prima = p.S.log.length;
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
  regista(p, o, mossa, chi === "ai" ? perche : "", prima, r);
  ricorda(p);
  mostra(p);
  /* le schede delle righe nuove, e davanti il perche' dell'AI */
  const scelta = chi === "ai" && mossa && mossa.id !== "avanti" && perche
    ? { x: { k: "scelta", t: "Perché questa mossa", testo: perche,
             u: p.mia ? agenteDi(p, o.player).nome : p.S.nomi[o.player] }, army: o.player } : null;
  return raccogli(p, scelta);
}
const pausa = ms => new Promise(r => setTimeout(r, ms));

/* ============================================================
   3b · LA REGISTRAZIONE
   Due cose per ogni mossa, le stesse di `tools/partita.mjs`: un
   fotogramma del tavolo con le righe nuove del registro (per rivederla
   animata) e il passo del diario (le fotografie di fine mezzo turno, il
   punteggio, il resoconto per l'AI). Costa poco: i fotogrammi senza
   foto stanno in un centinaio di KB per una partita intera.
   ============================================================ */
function registra(p){
  const S = p.S, guarda = !p.mia;
  const chi = t => guarda ? agenteDi(p, t).nome : t === p.mia ? "tu" : p.agente.nome;
  p.rec = {
    frames: [], id: null,
    diario: ARCH.registro(S, { liste: p.liste, meta: {
      event: guarda ? `AI contro AI sul tavolo (${p.seme != null ? "seme " + p.seme : "dadi veri"})`
                    : "Sfida sul tavolo contro l'AI",
      playerA: chi("A"), playerB: chi("B"), mine: p.mia || "",
      pts: (S.sc && S.sc.pts) || 0, rounds: S.rounds,
      ...(guarda ? { simulata: true } : {}), ...(p.seme != null ? { seme: p.seme } : {}),
    } }),
  };
}
function regista(p, o, mossa, perche, prima, esito){
  const rec = p.rec;
  if (!rec) return;
  const S = p.S;
  const righe = S.log.slice(prima);
  const c = o.fase === "Incantesimi" ? "incantesimi" : o.fase === "Schieramento" ? "schieramento" : (o.casella || "");
  const passa = mossa && mossa.id === "avanti";
  const detto = !mossa ? "" : passa ? (perche && o.list.length > 1 ? `passa: ${perche}` : "") : perche;
  try {
    rec.diario.passo({ chi: S.nomi[o.player], perche: detto, righe });
    const testo = righe.map(r => ({ t: r.text, p: r.page || 0, d: r.dice && r.dice.length ? r.dice : null,
                                    ...(r.groups ? { g: r.groups.map(g => ({ w: g.what, d: g.dice })) } : {}),
                                    ...(r.kind ? { k: r.kind } : {}),
                                    ...(r.fx ? { fx: r.fx } : {}),
                                    ...(r.x ? { x: r.x } : {}) }));
    if (esito && !esito.ok && mossa && mossa.id !== "avanti")
      testo.push({ t: `mossa rifiutata dall'arbitro: ${esito.text}`, p: 0, d: null, k: "limite" });
    const f = RP.fotogramma(S, { AR, testo, chi: S.nomi[o.player], perche: detto, army: o.player, casella: c,
                                 turno: righe.length ? righe[0].turno : S.turno });
    if (testo.length || detto || !RP.stessoTavolo(rec.frames[rec.frames.length - 1], f)) rec.frames.push(f);
  } catch (e){
    /* la registrazione non deve mai fermare la partita */
    p.errori.push(`registrazione: ${e.message}`);
  }
}

/* La voce del diario, con dentro la partita da rivedere. Si puo' salvare
   anche a meta': la voce e' la stessa, e si aggiorna a ogni salvataggio. */
export async function salvaNelDiario(p = partita){
  if (!p || !p.rec) return null;
  const S = p.S, guarda = !p.mia;
  const sc = S.sc || {};
  const titolo = `${sc.label || S.scenario}: ${S.nomi.A} contro ${S.nomi.B}` +
                 (guarda ? " (AI contro AI)" : "");
  const rep = p.rec.diario.chiudi({ title: titolo, id: p.rec.id || "" });
  const non = [...S.detto].map(id => (AR.LIMITI.find(x => x.id === id) || {}).what).filter(Boolean);
  const esito = S.finita && S.esito ? S.esito : null;
  rep.notes = [
    guarda ? `Partita giocata dall'arbitro dell'app, AI contro AI: ${agenteDi(p, "A").nome} contro ${agenteDi(p, "B").nome}` +
             (p.seme != null ? `, seme ${p.seme} (la stessa con tools/partita.mjs --seme ${p.seme}).` : ", con i dadi veri.")
          : `Sfida sul tavolo: ${S.nomi[p.mia]} l'hai giocato tu, ${S.nomi[p.mia === "A" ? "B" : "A"]} ${p.agente.nome}.`,
    esito ? `Verdetto dell'arbitro: ${esito.winner ? S.nomi[esito.winner] + ", " + esito.label : esito.label} — ` +
            `${S.nomi.A} ${esito.A} punti vittoria, ${S.nomi.B} ${esito.B} (${esito.why}).`
          : `Salvata a metà: turno ${S.turno}${S.rounds ? " di " + S.rounds : ""}.`,
    p.avvisi.length ? "Avvisi: " + p.avvisi.join(" · ") : "",
    non.length ? "Quello che questa partita non ha giocato: " + non.join("; ") + "." : "",
  ].filter(Boolean).join("\n\n");
  /* la partita da rivedere: senza foto, che l'app ha nel catalogo e
     mette dentro quando la si apre */
  const pt = AR.punteggio(S);
  rep.replay = RP.compatta({
    titolo: titolo,
    sotto: `${S.punti.A} contro ${S.punti.B} punti · ${guarda ? `${agenteDi(p, "A").nome} contro ${agenteDi(p, "B").nome}` : `tu con ${S.nomi[p.mia]}`}` +
           (p.seme != null ? ` · seme ${p.seme}` : "") +
           ` · ${esito ? (esito.winner ? S.nomi[esito.winner] + ", " + esito.label : esito.label) : `punti vittoria ${pt.A} a ${pt.B}, a metà`}`,
    avvisi: p.avvisi.slice(),
    piede: "Ogni riga porta la pagina del manuale da cui viene. Quello che questa partita non ha giocato: " +
           (non.join("; ") || "niente") + ".",
    w: S.table.w, h: S.table.h, nomi: { ...S.nomi },
    terreno: RP.terrenoDellaPagina(S),
    zone: [...(S.zones.A || []).map(z => ({ ...z, army: "A" })), ...(S.zones.B || []).map(z => ({ ...z, army: "B" }))],
    pezzi: RP.pezziDellaPagina(S),
  }, p.rec.frames);
  try {
    const salvato = await addReport(rep);
    p.rec.id = salvato.id;
    p.salvata = true;
    toast(`Nel diario delle partite: «${titolo}» (${p.rec.frames.length} fotogrammi).`);
    renderSfida();
    return salvato;
  } catch (e){
    toast("Non riesco a salvarla: " + e.message);
    return null;
  }
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
   3c · MUOVERE A MANO
   Le righe dell'elenco portano una ruota sola, verso il nemico o verso
   un varco. Qui chi gioca compone la mossa come al tavolo: ruote di
   quanti gradi vuole e tratti dritti di quanti pollici vuole, alternati
   (p. 124: la Z per passare da una strettoia di lato), oppure una delle
   manovre in qualunque direzione — girarsi, di lato, indietro,
   riformarsi (pp. 124-125). L'arbitro le misura e le paga come le
   altre: e' il gesto `passi` per le tappe, e quelli delle manovre.
   ============================================================ */
const mano = { uid: null, gradi: 15, pollici: "", lato: "", marcia: false };

function manoHTML(p){
  const S = p.S;
  const chi = AR.passiPossibili(S);
  if (!chi.length) return "";
  const aperta = chi.find(x => x.inCorso);
  if (aperta) mano.uid = aperta.uid;
  if (!chi.some(x => x.uid === mano.uid)) mano.uid = chi[0].uid;
  const u = chi.find(x => x.uid === mano.uid);
  return `
    <details class="sf-mano" ${aperta || mano.aperto ? "open" : ""}>
      <summary class="panel-title">Muovi a mano: ruote, tratti dritti e manovre a scelta</summary>
      <label class="field"><span>Unità</span>
        <select id="sf-m-uid" ${aperta ? "disabled" : ""}>${chi.map(x =>
          `<option value="${x.uid}" ${x.uid === mano.uid ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></label>
      <div class="note"><b>A tappe</b> (p. 124): ruota e vai dritto quante volte vuoi, finché il Movimento basta.
        La ruota costa quanto cammina il modello esterno; marciando si può solo ruotare e andare dritti.
        ${aperta ? `<br><b>${esc(u.nome)}</b>: ${u.speso}″ fatti, <b>restano ${u.resta}″</b> di ${u.budget}″${u.marciando ? " (marcia)" : ""}.` : ""}</div>
      <div class="btn-row sf-m-riga">
        <input type="number" id="sf-m-gradi" min="1" max="180" step="1" value="${mano.gradi}" title="gradi" style="width:64px"><span class="dim">°</span>
        <button class="btn tiny" data-m="ruota" data-s="-1" title="ruota a sinistra">↺ sinistra</button>
        <button class="btn tiny" data-m="ruota" data-s="1" title="ruota a destra">↻ destra</button>
      </div>
      <div class="btn-row sf-m-riga">
        <input type="number" id="sf-m-pollici" min="0.1" step="0.1" value="${esc(mano.pollici)}" placeholder="tutto" title="pollici (vuoto: tutto quello che resta)" style="width:64px"><span class="dim">″</span>
        <button class="btn tiny" data-m="avanti">⬆ dritto</button>
        ${!aperta && u.marcia ? `<label class="dim"><input type="checkbox" id="sf-m-marcia" ${mano.marcia ? "checked" : ""}> marciando</label>` : ""}
      </div>
      ${aperta ? `<div class="btn-row">
        <button class="btn tiny primary" data-m="fine">Fine della mossa</button>
        <button class="btn tiny ghost" data-m="annulla" title="torna al punto di partenza, con tutto il Movimento">Ricomincia</button>
      </div>` : `
      <div class="note"><b>Una manovra</b> (pp. 124-125), al posto della mossa:</div>
      <div class="btn-row sf-m-riga">
        <button class="btn tiny" data-g="gira" data-v="-90">gira 90° a sinistra</button>
        <button class="btn tiny" data-g="gira" data-v="90">gira 90° a destra</button>
        <button class="btn tiny" data-g="gira" data-v="180">gira 180°</button>
      </div>
      <div class="btn-row sf-m-riga">
        <input type="number" id="sf-m-lato" min="0.1" step="0.1" value="${esc(mano.lato)}" placeholder="metà M" title="pollici (vuoto: metà del Movimento)" style="width:64px"><span class="dim">″</span>
        <button class="btn tiny" data-g="lato" data-v="-1">← di lato</button>
        <button class="btn tiny" data-g="lato" data-v="1">di lato →</button>
        <button class="btn tiny" data-g="indietro">⬇ indietro</button>
      </div>
      <div class="btn-row sf-m-riga">
        <button class="btn tiny" data-g="riforma" title="si gira sul centro dei gradi scritti sopra, a sinistra: costa tutto il Movimento" data-v="-1">riforma ↺</button>
        <button class="btn tiny" data-g="riforma" data-v="1" title="si gira sul centro dei gradi scritti sopra, a destra: costa tutto il Movimento">riforma ↻</button>
        <span class="dim">dei gradi scritti sopra, tutto il Movimento</span>
      </div>`}
      <p class="sf-m-esito note" id="sf-m-esito"></p>
    </details>`;
}

function agganciaMano(host, p){
  const box = host.querySelector(".sf-mano");
  if (!box) return;
  box.addEventListener("toggle", () => { mano.aperto = box.open; });
  const sel = box.querySelector("#sf-m-uid");
  if (sel) sel.addEventListener("change", () => { mano.uid = +sel.value; evidenzia(mano.uid); renderSfida(); });
  const leggiCampi = () => {
    mano.gradi = Math.max(1, Math.min(180, Math.round(+box.querySelector("#sf-m-gradi").value || 15)));
    mano.pollici = box.querySelector("#sf-m-pollici").value;
    const l = box.querySelector("#sf-m-lato"); if (l) mano.lato = l.value;
    const m = box.querySelector("#sf-m-marcia"); if (m) mano.marcia = m.checked;
  };
  const fai = gesto => {
    if (!p.attesa || p.gira) return;
    /* non con `applica`: un gesto a mano rifiutato non deve passare la
       casella, deve dire perche' e lasciar riprovare */
    const prima = p.S.log.length;
    const r = AR.apply(p.S, gesto);
    if (!r.ok){
      const e = box.querySelector("#sf-m-esito");
      if (e){ e.textContent = r.text; e.style.color = "var(--bad)"; }
      return;
    }
    AR.controllaFine(p.S);
    regista(p, p.attesa, gesto, "", prima, r);
    ricorda(p); mostra(p); raccogli(p);
    evidenzia(gesto.uid);
    p.attesa = null;
    renderSfida(); gira();
  };
  box.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => {
    leggiCampi();
    const t = b.dataset.m;
    fai({ id: "passi", uid: mano.uid, tipo: t,
          ...(t === "ruota" ? { gradi: mano.gradi * +b.dataset.s } : {}),
          ...(t === "avanti" && +mano.pollici > 0 ? { pollici: +mano.pollici } : {}),
          ...(mano.marcia ? { marcia: true } : {}) });
  }));
  box.querySelectorAll("[data-g]").forEach(b => b.addEventListener("click", () => {
    leggiCampi();
    const t = b.dataset.g, v = +b.dataset.v;
    fai(t === "gira" ? { id: "gira", uid: mano.uid, gradi: v }
      : t === "lato" ? { id: "lato", uid: mano.uid, segno: v, ...(+mano.lato > 0 ? { pollici: +mano.lato } : {}) }
      : t === "indietro" ? { id: "indietro", uid: mano.uid, ...(+mano.lato > 0 ? { pollici: +mano.lato } : {}) }
      : { id: "riforma", uid: mano.uid, giro: mano.gradi * v });
  }));
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
/* chi ha vinto un combattimento: un gesto solo, quattro scelte (p. 156) */
const INSEGUI = { segui: "Segue", insegui: "Insegue", trattieni: "Si trattiene", travolgi: "Sfonda" };
/* gli Abominable Attacks sono un gesto solo con tre scelte dentro */
const ABOMINIO = { normali: "Attacca normalmente", nutriti: "Si nutre", valanga: "Valanga di carne" };
const REAZIONE = { hold: "tiene", stand: "tiene e tira", flee: "fugge", fleeing: "sta già fuggendo" };

function etichetta(x){
  const cosa = x.id === "reazione" ? `${ETICHETTA.reazione}: ${REAZIONE[x.kind] || x.kind}`
             : x.id === "dissolvi" && x.fato ? "Dissolvi con la sorte"
             : x.id === "abominio" ? ABOMINIO[x.scelta] || "Abominable Attacks"
             : x.id === "insegui" ? INSEGUI[x.scelta] || "Insegue"
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

/* La striscia del perche' sta SOTTO il campo, non sopra: le schede in
   alto a destra coprivano proprio i pezzi di cui parlavano, e a schermo
   intero su un telefono coprivano mezzo tavolo. Ha un'altezza fissa,
   cosi' il tavolo non salta a ogni scheda che entra o esce. */
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
  pila.className = "sp-pila sp-striscia";
  pila.setAttribute("aria-live", "polite");
  pila.setAttribute("aria-label", "il perché delle ultime mosse");
  campo.after(pila);
  return pila;
}
function svuotaPila(){ if (pila) pila.innerHTML = ""; }
/* finita la sfida la striscia se ne va, e il tavolo torna grande */
function togliPila(){ if (pila){ pila.remove(); pila = null; } }

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
  /* le piu' vecchie lasciano il posto, tranne quelle fissate; l'ultima
     arrivata resta in vista anche su un telefono stretto */
  const libere = [...box.children].filter(x => !x.classList.contains("sp-fissa") && !x.classList.contains("sp-via"));
  for (const x of libere.slice(0, Math.max(0, libere.length - QUANTE))) vattene(x);
  /* in fondo, dopo che le vecchie se ne sono andate: la striscia scorre
     di lato sul telefono dritto e in giu' a schermo intero */
  const inFondo = () => {
    if (!box.isConnected) return;
    if (typeof box.scrollTo === "function") box.scrollTo({ left: box.scrollWidth, top: box.scrollHeight, behavior: "smooth" });
    else { box.scrollLeft = box.scrollWidth; box.scrollTop = box.scrollHeight; }
  };
  setTimeout(inFondo, 30); setTimeout(inFondo, 320);
}

/* ============================================================
   5b · A SCHERMO INTERO
   Per guardare: solo il tavolo, la striscia del perche' sotto e una
   barra in fondo con il turno, il punteggio, ferma/riprendi e la
   velocita'. Mentre la partita scorre da sola la barra sparisce, e
   torna toccando lo schermo o muovendo il mouse. Il vero schermo
   intero quando il browser lo concede; dove non lo concede (l'iPhone,
   a una pagina) la stessa cosa fatta con lo stile, sopra tutta l'app.
   ============================================================ */
let cinema = false, veroSchermo = false, quiete = null;
const svegliaCinema = () => {
  if (!cinema) return;
  document.body.classList.remove("sfc-quieta");
  clearTimeout(quiete);
  quiete = setTimeout(() => {
    const p = partita;
    if (cinema && p && !p.mia && !p.fermo && !p.S.finita) document.body.classList.add("sfc-quieta");
  }, 2600);
};
export function entraCinema(){
  const wrap = document.querySelector(".board-wrap");
  if (!wrap || !partita) return;
  cinema = true;
  document.body.classList.add("sf-cinema");
  if (leggi(SPIEGA, "1") === "1") contenitore();
  let barra = document.getElementById("sf-cinema-barra");
  if (!barra){
    barra = document.createElement("div");
    barra.id = "sf-cinema-barra";
    barra.className = "sf-cinema-barra";
    wrap.appendChild(barra);
  }
  disegnaCinema();
  pulsanteCinema();
  if (wrap.requestFullscreen && document.fullscreenEnabled !== false)
    wrap.requestFullscreen().then(() => { veroSchermo = true; }, () => {});
  for (const ev of ["pointermove", "pointerdown", "touchstart"]) wrap.addEventListener(ev, svegliaCinema, { passive: true });
  svegliaCinema();
  /* chi entra per guardare vuole vederla andare */
  if (partita && !partita.mia && partita.fermo) riprendi();
}
export function esciCinema(){
  if (!cinema) return;
  cinema = false;
  clearTimeout(quiete);
  document.body.classList.remove("sf-cinema", "sfc-quieta");
  const barra = document.getElementById("sf-cinema-barra");
  if (barra) barra.remove();
  if (veroSchermo && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  veroSchermo = false;
  renderSfida();
}
if (typeof document !== "undefined"){
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && veroSchermo){ veroSchermo = false; esciCinema(); }
  });
  document.addEventListener("keydown", e => {
    if (!cinema) return;
    if (e.key === "Escape" && !veroSchermo) esciCinema();
    else svegliaCinema();
  });
}
function disegnaCinema(){
  const barra = document.getElementById("sf-cinema-barra");
  const p = partita;
  if (!barra || !p) return;
  const S = p.S, pt = AR.punteggio(S);
  const fase = S.finita ? (S.esito && S.esito.winner ? `Ha vinto ${S.nomi[S.esito.winner]}: ${S.esito.label}` : "Partita finita")
             : S.preparando ? "Incantesimi" : S.schierando ? "Schieramento"
             : `Turno ${S.turno}${S.rounds ? "/" + S.rounds : ""} · ${(AR.CASELLE[S.casella] || {}).fase || ""}`;
  const guarda = !p.mia;
  barra.innerHTML = `
    <div class="sfc-info">
      <b class="sfc-es" style="background:var(--armyA)">${esc(S.nomi.A)} ${pt.A}</b>
      <b class="sfc-es" style="background:var(--armyB)">${esc(S.nomi.B)} ${pt.B}</b>
      <span class="sfc-fase">${esc(fase)}${p.pensa && p.chiPensa ? ` · pensa ${esc(S.nomi[p.chiPensa])}` : ""}</span>
    </div>
    <div class="sfc-comandi">
      ${p.storia.length > 1 ? tempoHTML(p) : ""}
      ${guarda && !S.finita ? (p.fermo
        ? `<button class="btn tiny primary" data-c="riprendi">▶</button>
           <button class="btn tiny" data-c="passo" ${p.gira ? "disabled" : ""} title="una mossa">⏭</button>`
        : `<button class="btn tiny" data-c="ferma" title="ferma">❚❚</button>`) : ""}
      ${guarda ? `<select data-c="velocita" aria-label="velocità">${VELOCITA_SCELTE.map(([v, t]) =>
        `<option value="${v}" ${v === velocita() ? "selected" : ""}>${t}</option>`).join("")}</select>` : ""}
      ${S.finita && p.rec && p.rec.frames.length && !p.salvata ? `<button class="btn tiny primary" data-c="salva">Salva nel diario</button>` : ""}
      <button class="btn tiny" data-c="esci" title="esci dallo schermo intero (Esc)">✕</button>
    </div>`;
  const fai = { riprendi, passo: unPasso, ferma, salva: () => salvaNelDiario(p), esci: esciCinema };
  barra.querySelectorAll("button[data-c]").forEach(b => b.addEventListener("click", e => {
    e.stopPropagation(); fai[b.dataset.c](); svegliaCinema();
  }));
  agganciaTempo(barra);
  const vel = barra.querySelector('select[data-c="velocita"]');
  if (vel) vel.addEventListener("change", () => { scrivi(VELOCITA, vel.value === "1" ? "" : vel.value); svegliaCinema(); });
  if (S.finita || p.fermo) document.body.classList.remove("sfc-quieta");
}
/* il pulsante per entrarci, piccolo, nell'angolo del tavolo: su un
   telefono il pannello della sfida sta nel cassetto, e per guardare
   non lo si deve aprire */
function pulsanteCinema(){
  const campo = document.querySelector(".board-scroll");
  let b = document.getElementById("sf-cinema-entra");
  const serve = !!partita && !partita.mia && !cinema;
  if (!serve){ if (b) b.remove(); return; }
  if (!campo || b) return;
  b = document.createElement("button");
  b.id = "sf-cinema-entra";
  b.className = "btn tiny sf-cinema-entra";
  b.title = "Guarda la partita a schermo intero";
  b.textContent = "⛶ Schermo intero";
  b.addEventListener("click", entraCinema);
  campo.appendChild(b);
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
  /* la barra dello schermo intero e il pulsante nell'angolo seguono il
     pannello: si ridisegnano insieme */
  if (cinema) disegnaCinema();
  pulsanteCinema();
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
         <span class="dim">(${agenteDi(p, "A").nome === agenteDi(p, "B").nome
           ? `tutti e due: ${esc(agenteDi(p, "A").nome)}`
           : `${esc(agenteDi(p, "A").nome)} contro ${esc(agenteDi(p, "B").nome)}`})</span></div>`
    : `<div><b style="color:var(--army${p.mia})">Tu: ${esc(S.nomi[p.mia])}</b>
        <span class="dim">contro</span> <b style="color:var(--army${lui})">${esc(S.nomi[lui])}</b>
        <span class="dim">(${esc(p.agente.nome)})</span></div>`;
  const vince = !S.finita || !S.esito.winner ? ""
    : guarda ? `Ha vinto ${S.nomi[S.esito.winner]}: ` : S.esito.winner === p.mia ? "Hai vinto: " : "Ha vinto l'AI: ";
  /* chi guarda: fermarsi, ripartire, una mossa per volta, e quanto in fretta */
  const comandi = guarda && !S.finita ? `
    <div class="btn-row sf-guarda">
      ${p.fermo
        ? `<button class="btn tiny primary" id="sf-riprendi" title="riprendi (spazio)">▶ Riprendi</button>
           <button class="btn tiny" id="sf-passo" ${p.gira ? "disabled" : ""}>Una mossa</button>`
        : `<button class="btn tiny" id="sf-ferma" title="ferma (spazio)">❚❚ Ferma</button>`}
      <label class="sf-vel">velocità
        <select id="sf-velocita">${VELOCITA_SCELTE.map(([v, t]) =>
          `<option value="${v}" ${v === velocita() ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <span class="dim">${p.fermo ? (p.gira ? "sta giocando una mossa…" : "ferma: passa sopra le schede per leggerle")
                                  : "gioca da sola; ferma quando vuoi guardare meglio (spazio)"}</span>
    </div>` : "";
  /* avanti e indietro di uno stato, per tutte e due le partite */
  const k = p.guardo ?? p.storia.length - 1;
  const tempo = p.storia.length > 1 || !guarda ? `
    <div class="btn-row sf-tempo">
      ${tempoHTML(p)}
      <span class="dim">${p.guardo != null
        ? `<b>stai guardando lo stato ${k + 1} di ${p.storia.length}</b> (${esc(p.storia[k].fase)}): il tavolo vero è più avanti`
        : `stato ${k + 1} di ${p.storia.length} · ← → per tornare indietro e avanti${guarda ? ", spazio per fermare" : ""}`}</span>
    </div>` : "";
  const giocate = p.rec ? p.rec.frames.length : 0;
  const chiPensa = guarda && p.chiPensa ? S.nomi[p.chiPensa] : p.agente.nome;
  host.innerHTML = `
    <div class="sf-testa">
      ${testa}
      <div class="mono">${esc(S.sc.label)} · ${esc(fase)} · punti vittoria ${pt[io]} a ${pt[altro]}</div>
    </div>
    ${p.avvisi.length ? `<p class="note warn">${p.avvisi.map(esc).join("<br>")}<br>La partita si gioca lo stesso, ma quei conti sono finti.</p>` : ""}
    ${comandi}
    ${tempo}
    ${p.guardo != null && !guarda && !S.finita ? `
      <p class="note">Le mosse si scelgono dal tavolo di adesso:
        <button class="btn tiny primary" data-t="presente">⏭ Torna ad adesso</button></p>`
    : S.finita ? `
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
        ${manoHTML(p)}
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
      <button class="btn tiny ${S.finita && !p.salvata ? "primary" : ""}" id="sf-salva" ${giocate ? "" : "disabled"}
        title="La partita finisce nella scheda Partite, e da lì si rivede con le animazioni">${
        p.salvata ? (S.finita ? "Nel diario ✓" : "Aggiorna nel diario") : "Salva nel diario"}</button>
      ${p.salvata && p.rec && p.rec.id ? `<button class="btn tiny" id="sf-rivedi">▶ Rivedi</button>` : ""}
      ${guarda ? `<button class="btn tiny" id="sf-cinema" title="Solo il tavolo, a tutto schermo">⛶ Schermo intero</button>` : ""}
      <button class="btn tiny" id="sf-copia">Copia il registro</button>
      <button class="btn tiny ghost" id="sf-basta" style="color:var(--bad)">${S.finita ? "Chiudi la sfida" : "Abbandona"}</button>
    </div>
    ${p.seme != null ? `<p class="note">Dadi dal seme ${p.seme}: la stessa partita si rigioca uguale, anche con
      <span class="mono">tools/partita.mjs --seme ${p.seme}</span>.</p>` : ""}
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
  agganciaTempo(host);
  agganciaMano(host, p);
  for (const [id, fai] of [["#sf-ferma", ferma], ["#sf-riprendi", riprendi], ["#sf-passo", unPasso]]){
    const b = host.querySelector(id);
    if (b) b.addEventListener("click", fai);
  }
  const basta = $("#sf-basta");
  if (basta) basta.addEventListener("click", async () => {
    /* chiudere una partita finita e non salvata la perde: si chiede */
    if (p.rec && p.rec.frames.length && !p.salvata && S.finita &&
        !await askConfirm("La partita non è nel diario: chiudendo la perdi. La chiudo lo stesso?",
                          { title: "Chiudere senza salvare?" })) return;
    abbandona();
  });
  const cin = $("#sf-cinema");
  if (cin) cin.addEventListener("click", entraCinema);
  const salva = $("#sf-salva");
  if (salva) salva.addEventListener("click", () => salvaNelDiario(p));
  const riv = $("#sf-rivedi");
  if (riv) riv.addEventListener("click", () => rivedi(p.rec.id));
  const vel = $("#sf-velocita");
  if (vel) vel.addEventListener("change", () => scrivi(VELOCITA, vel.value === "1" ? "" : vel.value));
  agganciaImpostazioni(host);
}

/* la chiave salvata o dimenticata cambia chi gioca, ma chi aveva scelto
   l'euristica dal Matchup resta con l'euristica: prima ogni Salva
   rimetteva l'avversario di sempre */
function rifaiAgenti(){
  const p = partita;
  if (!p) return;
  const tipo = t => (p.tipi && p.tipi[t]) || null;
  if (p.agenti) p.agenti = { A: faiAgente(tipo("A"), "A", p.seme), B: faiAgente(tipo("B"), "B", p.seme) };
  else { const lui = p.mia === "A" ? "B" : "A"; p.agente = faiAgente(tipo(lui), lui, p.seme); }
}

function agganciaImpostazioni(host){
  const salva = host.querySelector("#sf-save");
  if (salva) salva.addEventListener("click", () => {
    scrivi(KEY, host.querySelector("#sf-key").value.trim());
    scrivi(MODEL, host.querySelector("#sf-model").value.trim());
    /* l'avversario cambia subito, anche a partita in corso */
    rifaiAgenti();
    toast(leggi(KEY) ? "Chiave salvata: gioca Gemini." : "Nessuna chiave: gioca l'euristica che guarda avanti.");
    renderSfida();
  });
  const dimentica = host.querySelector("#sf-forget");
  if (dimentica) dimentica.addEventListener("click", () => {
    scrivi(KEY, ""); rifaiAgenti(); renderSfida();
  });
  const salta = host.querySelector("#sf-salta");
  if (salta) salta.addEventListener("change", () => { scrivi(SALTA, salta.checked ? "1" : "0"); gira(); });
  const spiega = host.querySelector("#sf-spiega");
  if (spiega) spiega.addEventListener("change", () => {
    scrivi(SPIEGA, spiega.checked ? "1" : "0");
    if (!spiega.checked) togliPila(); else if (partita) contenitore();
  });
  const calma = host.querySelector("#sf-calma");
  if (calma) calma.addEventListener("change", () => scrivi(CALMA, calma.checked ? "1" : "0"));
}
