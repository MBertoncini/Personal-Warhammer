/* Schieramento Old World — la scena: il tavolo dal vivo che si muove
 *
 * Il tavolo si ridisegna da capo a ogni cambiamento (`drawBoard`
 * svuota l'SVG e lo riempie), e per una partita giocata a mano va
 * benissimo: il pezzo lo sposta il dito, e sta dove lo lascia. Ma nella
 * sfida e in AI contro AI i pezzi li muove l'arbitro, e ridisegnando da
 * capo saltavano: un reggimento era qui e un attimo dopo era la', una
 * raffica di frecce era una riga nel registro, un'unita' distrutta
 * spariva senza che nessuno lo vedesse. Chi guarda una partita giocata
 * da due macchine vuole vederla succedere.
 *
 * Qui ci sono tre cose, tutte e tre sopra il disegno e mai dentro:
 *
 *  1. i pezzi che scivolano. Dopo il ridisegno i pezzi sono gia' dove
 *     devono stare; per qualche centinaio di millisecondi li si riporta
 *     indietro e li si accompagna, con la loro etichetta. Un ridisegno a
 *     meta' strada non rompe niente: al fotogramma dopo il pezzo torna
 *     dove era arrivato nel suo viaggio.
 *  2. gli effetti (`fxmotore.js`, lo stesso della partita da rivedere):
 *     uno strato SVG che sopravvive ai ridisegni, perche' lo si stacca e
 *     lo si riattacca invece di ricrearlo.
 *  3. la cornice: il turno e la fase in un cartellino sul tavolo, il
 *     cartello grande quando cambia il turno, e la fine della partita.
 *
 * L'animazione non decide niente: i dadi sono gia' caduti e l'arbitro ha
 * gia' scritto il tavolo. Spenta — dal pannello, o perche' il sistema
 * chiede meno movimento — il tavolo e' quello di sempre.
 */

import { motoreFx } from './fxmotore.js';
import { SVGNS, esc } from './util.js';

let svg = null, strato = null, defs = null, fxm = null;
let acceso = () => true;
/* quanto in fretta va la partita che si guarda: 1 normale, 4 velocissima,
   0 di corsa (niente scivolate) */
let ritmo = 1;

const quieto = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const attiva = () => !!svg && acceso() && !quieto();

export function scenaSu(svgEl, { attivo = () => true } = {}){
  svg = svgEl;
  acceso = attivo;
  strato = document.createElementNS(SVGNS, "g");
  strato.setAttribute("class", "sc-fx");
  strato.setAttribute("pointer-events", "none");
  fxm = motoreFx({
    strato,
    colore: a => a === "B" ? "var(--armyB)" : "var(--armyA)",
    tipoDi: id => (tipi.get(id) || ""),
    attivo: () => acceso(),
  });
  defs = document.createElementNS(SVGNS, "defs");
  defs.innerHTML = fxm.DEFS;
}
/* il tipo di truppa di ogni pezzo, per le bestie che graffiano in mischia */
const tipi = new Map();
export function tipiDiTruppa(coppie){ for (const [id, tp] of coppie) tipi.set(id, tp); }

export function impostaRitmo(v){ ritmo = v; }

/* Alla fine di ogni ridisegno: lo strato degli effetti torna in cima, e
   i pezzi che stanno viaggiando tornano dove erano arrivati. */
export function riattacca(){
  if (!svg || !strato) return;
  svg.appendChild(defs);
  svg.appendChild(strato);
  if (moti.size) passo(performance.now());
}

/* ============================================================
   1 · I PEZZI CHE SCIVOLANO
   ============================================================ */
const moti = new Map();          // uid -> { da, a, t0, ms, entra }
let giro = 0, chiusura = null;

const easeInOut = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const easeOutBack = t => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
/* l'angolo dal lato corto: da 350° a 10° si gira di venti gradi, non di
   trecentoquaranta */
const vicino = (da, a) => { let x = a; while (x - da > 180) x -= 360; while (da - x > 180) x += 360; return x; };

function dove(m, now){
  const t = Math.min(1, (now - m.t0) / m.ms);
  const q = easeInOut(t);
  return { t, x: m.da.x + (m.a.x - m.da.x) * q, y: m.da.y + (m.a.y - m.da.y) * q,
           rot: m.da.rot + (m.a.rot - m.da.rot) * q };
}

/* `prima`: uid -> { x, y, rot } di come stava il tavolo disegnato;
   `dopo`: le unita' di adesso, gia' disegnate. Chi e' nuovo entra
   posandosi; chi e' gia' in viaggio riparte da dove e' arrivato. */
export function scivola(prima, dopo){
  if (!attiva() || ritmo === 0) { moti.clear(); return 0; }
  const now = performance.now();
  let lungo = 0;
  for (const u of dopo){
    const a = { x: u.x, y: u.y, rot: u.rot || 0 };
    const corre = moti.get(u.uid);
    const da = corre ? dove(corre, now) : prima.get(u.uid);
    if (!da){                          // un pezzo che arriva sul tavolo
      const ms = 520 / Math.max(1, ritmo);
      moti.set(u.uid, { da: a, a, t0: now, ms, entra: true });
      lungo = Math.max(lungo, ms);
      continue;
    }
    a.rot = vicino(da.rot, a.rot);
    const d = Math.hypot(a.x - da.x, a.y - da.y), r = Math.abs(a.rot - da.rot);
    if (d < 0.5 && r < 0.5){ if (corre && !corre.entra) moti.delete(u.uid); continue; }
    const ms = Math.min(1100, 260 + d * 0.9 + r * 2.2) / Math.max(1, ritmo);
    moti.set(u.uid, { da: { x: da.x, y: da.y, rot: da.rot }, a, t0: now, ms });
    lungo = Math.max(lungo, ms);
  }
  if (moti.size) avvia();
  return lungo;
}

function avvia(){
  const mio = ++giro;
  const f = now => {
    if (mio !== giro) return;
    if (passo(now)) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
  /* una scheda nascosta non riceve fotogrammi: un timer chiude lo stesso
     e nessun pezzo resta a meta' strada */
  clearTimeout(chiusura);
  const fine = Math.max(...[...moti.values()].map(m => m.t0 + m.ms)) - performance.now();
  chiusura = setTimeout(() => { if (mio === giro) { passo(Infinity); } }, Math.max(0, fine) + 200);
}

const pezzo = uid => svg.querySelector(`.l-units > [data-uid="${uid}"]`);
const etichette = uid => svg.querySelectorAll(`.l-lab [data-of="${uid}"]`);

/* un passo del film: torna vero finche' qualcuno si muove ancora */
function passo(now){
  if (!svg) return false;
  for (const [uid, m] of moti){
    const p = dove(m, now);
    const el = pezzo(uid);
    if (m.entra){
      const s = 1 + 0.35 * (1 - easeOutBack(p.t));
      if (el){
        el.setAttribute("transform", `translate(${m.a.x} ${m.a.y}) rotate(${m.a.rot}) scale(${s})`);
        el.style.opacity = p.t >= 1 ? "" : String(Math.min(1, p.t * 1.6));
      }
      for (const e of etichette(uid)) e.style.opacity = p.t >= 1 ? "" : String(p.t);
    } else {
      if (el) el.setAttribute("transform", `translate(${p.x} ${p.y}) rotate(${p.rot})`);
      const dx = p.x - m.a.x, dy = p.y - m.a.y;
      for (const e of etichette(uid))
        if (p.t >= 1) e.removeAttribute("transform"); else e.setAttribute("transform", `translate(${dx} ${dy})`);
    }
    if (p.t >= 1){
      if (el && m.entra) el.setAttribute("transform", `translate(${m.a.x} ${m.a.y}) rotate(${m.a.rot})`);
      moti.delete(uid);
    }
  }
  return moti.size > 0;
}
export function fermaTutto(){
  giro++;
  if (moti.size) passo(Infinity);
  moti.clear();
  if (fxm) fxm.pulisci();
}

/* ============================================================
   2 · GLI EFFETTI
   ============================================================ */
/* Una mossa dell'arbitro: il fotogramma di adesso e quello prima.
   Torna quanto durano, perche' chi guarda aspetti a passare oltre. */
export function recita(f, prima){
  if (!fxm || !attiva() || ritmo === 0) return 0;
  return fxm.giocaEffetti(f, prima, { ritmo: Math.max(1, ritmo) });
}

/* La partita al tavolo: i dadi li tira chi gioca, e l'app sa che cosa e'
   successo solo quando il registro lo scrive. Un colpo alla volta, e le
   perdite che il ridisegno scopre aspettano che il colpo arrivi. */
let attesaPerdite = 0;
export function colpo(fx, f, prima){
  if (!fx || !fxm || !attiva()) return 0;
  const ms = fxm.gioca(fx, f, prima);
  attesaPerdite = Math.max(attesaPerdite, Math.round(ms * 0.65));
  return ms;
}
let ultima = null, firmaUltima = "";
const firma = f => f.unita.map(u => `${u.id}:${u.v}:${u.fp || 0}`).join(";");
/* Il tavolo di adesso, a ogni ridisegno della partita a mano: chi ha
   perso modelli lampeggia, chi e' sparito si sbriciola. Un salto grosso —
   una partita caricata, un annulla di dieci passi — non e' una
   battaglia, e si salta. */
export function osserva(f){
  if (!f) { ultima = null; firmaUltima = ""; return; }
  const k = firma(f);
  if (k === firmaUltima) return;
  const prima = ultima;
  ultima = f; firmaUltima = k;
  if (!prima || !fxm || !attiva()) return;
  const { dopoFx } = fxm.cambiDi(f, prima);
  if (!dopoFx.length || dopoFx.length > 5) return;
  /* il colpo che li ha fatti cadere parte subito dopo questo ridisegno:
     si aspetta un giro per sapere quanto dura */
  setTimeout(() => {
    const t = attesaPerdite;
    attesaPerdite = 0;
    setTimeout(() => { for (const fx of dopoFx) fxm.gioca(fx, f, prima); }, t);
  }, 0);
}

/* ============================================================
   3 · LA CORNICE
   ============================================================ */
let hud = null, cartello = null, ultimoTurno = "", ultimaFase = "";

function campo(){ return svg && svg.closest(".board-scroll"); }

/* Il cartellino in alto: di chi e' il turno e in che fase siamo, nel
   colore dell'esercito. Chi guarda da lontano non deve leggere il
   pannello per saperlo. */
export function cornice({ turno = "", fase = "", army = "", chi = "", pensa = "", annuncio = true } = {}){
  const box = campo();
  if (!box) return;
  if (!hud || !hud.isConnected){
    hud = document.createElement("div");
    hud.className = "sc-hud";
    hud.setAttribute("aria-live", "polite");
    box.appendChild(hud);
  }
  const col = army === "B" ? "var(--armyB)" : army === "A" ? "var(--armyA)" : "var(--ink)";
  box.style.setProperty("--sc-turno", col);
  box.classList.toggle("sc-di-turno", !!army);
  const nuovaFase = fase !== ultimaFase;
  hud.innerHTML = `
    ${turno ? `<span class="sc-turno">${esc(turno)}</span>` : ""}
    ${chi ? `<span class="sc-chi" style="background:${col}">${esc(chi)}</span>` : ""}
    ${fase ? `<span class="sc-fase">${esc(fase)}</span>` : ""}
    ${pensa ? `<span class="sc-pensa" title="sta scegliendo">${esc(pensa)}<i></i><i></i><i></i></span>` : ""}`;
  if (nuovaFase && attiva()){
    hud.classList.remove("sc-pop");
    void hud.offsetWidth;
    hud.classList.add("sc-pop");
  }
  ultimaFase = fase;
  /* il cartello grande: quando cambia il turno o chi gioca */
  const chiave = `${turno}|${chi}`;
  if (chiave !== ultimoTurno){
    if (annuncio && ultimoTurno && turno && chi) annuncia(turno, chi, col);
    ultimoTurno = chiave;
  }
}
export function togliCornice(){
  if (hud) hud.remove();
  hud = null; ultimoTurno = ""; ultimaFase = "";
  if (cartello) cartello.remove();
  cartello = null;
  const box = campo();
  if (box){ box.classList.remove("sc-di-turno"); box.style.removeProperty("--sc-turno"); }
  for (const c of document.querySelectorAll(".sc-coriandoli")) c.remove();
}

export function annuncia(titolo, sotto, col = "var(--ink)", { ms = 1500, classe = "" } = {}){
  const box = campo();
  if (!box || !attiva() || ritmo === 0) return;
  if (cartello) cartello.remove();
  cartello = document.createElement("div");
  cartello.className = `sc-cartello ${classe}`;
  cartello.style.setProperty("--sc-col", col);
  cartello.style.setProperty("--sc-durata", `${Math.max(500, ms / Math.max(1, ritmo))}ms`);
  cartello.innerHTML = `<div class="sc-c-in"><b>${esc(titolo)}</b>${sotto ? `<span>${esc(sotto)}</span>` : ""}</div>`;
  box.appendChild(cartello);
  const c = cartello;
  setTimeout(() => { if (c.isConnected && !c.classList.contains("sc-resta")) c.remove(); },
             Math.max(500, ms / Math.max(1, ritmo)) + 100);
}

/* La fine: il cartello resta, e piovono i coriandoli nei colori di chi
   ha vinto. Un pareggio non festeggia. */
export function finale({ titolo, sotto = "", army = "", festa = !!army } = {}){
  const box = campo();
  if (!box) return;
  const col = army === "B" ? "var(--armyB)" : army === "A" ? "var(--armyA)" : "var(--ink)";
  if (cartello) cartello.remove();
  cartello = document.createElement("div");
  cartello.className = "sc-cartello sc-resta sc-finale";
  cartello.style.setProperty("--sc-col", col);
  cartello.innerHTML = `<div class="sc-c-in"><b>${esc(titolo)}</b>${sotto ? `<span>${esc(sotto)}</span>` : ""}
    <button type="button" class="btn tiny sc-chiudi" aria-label="Chiudi">×</button></div>`;
  cartello.querySelector(".sc-chiudi").addEventListener("click", () => { cartello.remove(); cartello = null; });
  box.appendChild(cartello);
  if (!festa || !attiva()) return;
  const pioggia = document.createElement("div");
  pioggia.className = "sc-coriandoli";
  const colori = [col, col, "#f5c542", "#fff6c8", col];
  let html = "";
  for (let k = 0; k < 70; k++){
    const x = Math.random() * 100, d = Math.random() * 1.2, dur = 2.2 + Math.random() * 1.8;
    const w = 6 + Math.random() * 6, giro = Math.round(Math.random() * 720 - 360), deriva = Math.round(Math.random() * 80 - 40);
    html += `<i style="left:${x}%;width:${w}px;height:${w * .45}px;background:${colori[k % colori.length]};` +
            `animation-delay:${d}s;animation-duration:${dur}s;--giro:${giro}deg;--deriva:${deriva}px"></i>`;
  }
  pioggia.innerHTML = html;
  box.appendChild(pioggia);
  setTimeout(() => pioggia.remove(), 4600);
}
