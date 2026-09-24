/* Schieramento Old World — la partita da guardare
 *
 * `tools/partita.mjs` racconta una partita a parole. Questo la disegna:
 * prende le fotografie del tavolo passo per passo e ne fa una pagina
 * sola, senza dipendenze e senza rete, che si apre con un doppio clic o
 * si pubblica su GitHub Pages.
 *
 * Perche' una pagina e non un video: una partita si guarda avanti e
 * indietro. Il momento in cui la carica non arriva lo si vuole rivedere
 * tre volte, e accanto ci deve stare la riga che dice perche' — i dadi
 * usciti, la pagina del manuale, e il perche' tattico di chi ha scelto.
 * Una registrazione non lo permette, una barra sotto al tavolo si'.
 *
 * Il file che esce non contiene chiavi, non chiama nessuno e non sa
 * niente di internet: e' la partita gia' giocata, fotogramma per
 * fotogramma. Si puo' mandare a un amico, tenerla nell'archivio o
 * metterla online senza pensarci.
 *
 * Le schede del perche' (`src/spiega.js`) viaggiano dentro la pagina:
 * il sorgente del modulo si copia nello <script>, e la pagina le
 * disegna da sola dalle spiegazioni dei fotogrammi. Mettere nel file
 * l'HTML gia' fatto di ogni scheda costava megabyte, e avrebbe fatto
 * due disegni della stessa scheda da tenere uguali.
 *
 * Quello che la pagina aggiunge al registro, e che il registro da solo
 * non dice:
 *
 *   LE FOTO DELLA COLLEZIONE — ogni basetta con la sua miniatura, da
 *   `dati/foto/<catId>.jpg`, girata con il reggimento ma sempre in
 *   piedi (un reggimento che guarda in basso non mostra le teste
 *   all'ingiu'), e le basette lunghe — cavalieri, carri, macchine —
 *   con la foto distesa per il lungo;
 *
 *   IL TERRENO DISEGNATO — il bosco con gli alberi, la collina con le
 *   curve di livello, le rovine con i muri rotti — e passandoci sopra
 *   che cos'e' e che cosa fa, con le parole di `terrain.js`;
 *
 *   IL MOVIMENTO — i pezzi scivolano da un fotogramma all'altro invece
 *   di saltare, e chi perde modelli lampeggia;
 *
 *   GLI EFFETTI — frecce, proiettili, massi, fulmini, palle di fuoco,
 *   incantesimi e mischie, letti dai campi `x` (la spiegazione) e `fx`
 *   (l'effetto, `segna()` in arbitro.js) delle righe del registro.
 *
 * Tutto il codice della pagina e' la funzione `cliente` qui sotto,
 * copiata cosi' com'e' nello <script>: e' JavaScript vero, che si
 * legge e si controlla come il resto del progetto, e non una stringa.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPIEGA_CSS } from '../src/spiega.js';
import { troopType } from '../src/troops.js';
import * as TR from '../src/terrain.js';

const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* il modulo delle schede come script qualunque, chiuso in una funzione
   perche' i suoi nomi non urtino quelli della pagina */
function spiegaNellaPagina(){
  const src = fs.readFileSync(new URL('../src/spiega.js', import.meta.url), 'utf8')
    .replace(/^export /gm, "").replace(/<\/script/gi, "<\\/script");
  return `const SP = (() => {\n${src}\nreturn { scheda, schedaHTML, rigaHTML };\n})();`;
}

/* I colori del tavolo vero, così una partita guardata qui e una
   guardata nell'app si somigliano. */
export const COLORI = {
  A: "#c0392b", B: "#2a6fb0",
  tavolo: "#efe7d7", linea: "#cdbfa6",
  wood: "#7a9e6a", hill: "#d8c99a", marsh: "#8fa3a8", ruins: "#b7ada0",
  wall: "#9b8f7d", monolith: "#6f6a64", pyramid: "#c9b489", treasure: "#d8b24a",
  landmark: "#6f6a64",
};

const r1 = v => Math.round(v * 10) / 10;

/* Un fotogramma. `army` e' chi ha appena giocato: lo stato dell'arbitro
   dopo la mossa dice gia' a chi tocca dopo, e durante lo schieramento la
   barra scriveva l'esercito sbagliato accanto a ogni unita' schierata.
   `casella` e `turno` sono quelli in cui la mossa e' stata fatta. */
export function fotogramma(S, { AR, testo = [], chi = "", perche = "", army = null, casella = null, turno = null }){
  const unita = S.units.filter(u => u.placed && !u.dead && AR.unitsOf(S, u.army).includes(u));
  /* i personaggi dentro un reggimento: dove stanno, per gli effetti che
     partono da loro (un mago che lancia sta nel suo reggimento) */
  const ospiti = {};
  if (AR.capiDi) for (const u of unita) for (const c of AR.capiDi(S, u)) ospiti[c.uid] = u.uid;
  return {
    turno: turno != null ? turno : S.turno, army: army || S.army,
    casella: casella != null ? casella : S.schierando ? "schieramento" : (AR.CASELLE[S.casella] || {}).id || "",
    chi, perche, testo,
    ...(Object.keys(ospiti).length ? { ospiti } : {}),
    /* i personaggi uniti viaggiano dentro il reggimento: disegnarli a
       parte vorrebbe dire due rettangoli uno sull'altro */
    unita: unita.map(u => {
      const b = AR.boxOf(u, S.units);
      const fe = AR.feriteDi ? AR.feriteDi(u) : null;
      /* le basette una per una, dove le mette la formazione: la pagina
         ci posa le foto. La stessa forma torna in cento fotogrammi, e
         `paginaHTML` la tiene una volta sola. */
      const lay = AR.layoutOf ? AR.layoutOf(u, S.units) : null;
      const s = lay && lay.slots && lay.slots.length
        ? lay.slots.map(c => [r1(c.x), r1(c.y), r1(c.w), r1(c.h), c.kind === "char" ? 1 : 0, c.catId || "", Math.round(c.rot || 0)])
        : null;
      /* `id` serve alle schede: la scheda accende sul tavolo chi nomina */
      return { id: u.uid, n: u.name, a: u.army, x: Math.round(b.x), y: Math.round(b.y),
               w: Math.round(b.w), h: Math.round(b.h), r: Math.round(u.rot || 0),
               v: Math.max(0, (u.models || 0) - (u.lost || 0)), m: u.models || 0,
               f: u.fled ? 1 : 0,
               c: AR.ingaggiata(S, u) ? 1 : 0,
               /* le ferite del modello in piedi, per chi ne ha piu' di una */
               ...(fe && fe.per > 1 ? { fp: fe.prese, fw: fe.per } : {}),
               ...(s ? { s } : {}),
               ...(u.catId ? { k: u.catId } : {}),
               tp: troopType(u.troop).id };
    }),
  };
}

/* Due fotogrammi in fila senza niente da leggere e con il tavolo uguale
   sono lo stesso fotogramma: il secondo non si tiene. Erano un terzo
   della partita, e con ▶ sembrava che si fosse fermata. */
export function stessoTavolo(a, b){
  return !!a && !!b && JSON.stringify(a.unita) === JSON.stringify(b.unita);
}

/* Chi c'e' in partita, anche i personaggi che non compaiono mai da soli:
   il nome, l'esercito, la faccia nella collezione e che cosa e'. */
export function pezziDellaPagina(S){
  const out = {};
  for (const u of S.units){
    const tt = troopType(u.troop);
    out[u.uid] = { n: u.name, a: u.army, ...(u.catId ? { k: u.catId } : {}), tp: tt.id, tl: tt.label,
                   m: u.models || 1 };
  }
  return out;
}

/* Le foto della collezione, piccole (256 pixel, qualche KB l'una) e
   dentro la pagina: la pagina non chiama nessuno. Solo quelle dei pezzi
   in partita. */
export function fotoDellaCollezione(catIds, cartella = fileURLToPath(new URL('../dati/foto/', import.meta.url))){
  const out = {};
  for (const id of new Set(catIds)){
    if (!id || !/^[\w-]+$/.test(id)) continue;
    try { out[id] = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(cartella, id + '.jpg')).toString('base64'); }
    catch (_){ /* niente foto: la basetta resta del colore dell'esercito */ }
  }
  return out;
}

/* Il terreno come lo disegna la pagina: dove sta, di che tipo e', e la
   frase che dice che cosa fa (la stessa della fotografia che legge chi
   gioca). */
export function terrenoDellaPagina(S){
  return (S.terrain || []).map(t => {
    const cfg = TR.TERRAIN[t.kind] || {};
    const cat = TR.catOf(t);
    return { x: r1(t.x), y: r1(t.y), w: r1(t.w), h: r1(t.h), rot: t.rot || 0,
             colore: coloreTerreno(t.kind), kind: t.kind || "", label: t.label || cfg.label || t.kind || "terreno",
             cat: cat.label || "", forma: cfg.shape || "rect", righe: TR.righeCat(t),
             ...(t.decor ? { decor: 1 } : {}) };
  });
}

/* Le forme delle basette e i dati fissi di ogni pezzo escono dai
   fotogrammi e vanno nell'intestazione: la stessa forma di trenta
   Clanrats tornava identica in cento fotogrammi. */
function compatta(meta, frames){
  const forme = [], indice = new Map();
  const pezzi = { ...(meta.pezzi || {}) };
  const fr = frames.map(f => ({ ...f, unita: (f.unita || []).map(u => {
    const { s, k, tp, ...resto } = u;
    if (s){
      const key = JSON.stringify(s);
      if (!indice.has(key)){ indice.set(key, forme.length); forme.push(s); }
      resto.fo = indice.get(key);
    }
    if (!pezzi[u.id]) pezzi[u.id] = { n: u.n, a: u.a, ...(k ? { k } : {}), ...(tp ? { tp } : {}) };
    return resto;
  }) }));
  return { meta: { ...meta, forme, pezzi }, frames: fr };
}

export function paginaHTML({ meta, frames }){
  const dentro = compatta({ foto: {}, ...meta }, frames);
  /* il JSON sta dentro <script>: un «</script>» in una frase del modello
     chiuderebbe il blocco. Il segno di minore scritto con la sua
     sequenza unicode e' lo stesso carattere per JSON e nessun tag per
     la pagina. */
  const dati = JSON.stringify(dentro).replace(/</g, "\\u003c");
  const n = frames.length;
  return `<!doctype html>
<html lang="it">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>${esc(meta.titolo)}</title>
<style>
${CSS}
${SPIEGA_CSS}
</style>

<div class="app">
<header class="testa">
  <div class="titoli">
    <h1>${esc(meta.titolo)}</h1>
    <div class="sotto">${esc(meta.sotto)}</div>
  </div>
  <div class="eserciti">
    <span class="es es-A">${esc((meta.nomi || {}).A || "A")}</span>
    <span class="contro">contro</span>
    <span class="es es-B">${esc((meta.nomi || {}).B || "B")}</span>
  </div>
  ${(meta.avvisi || []).length ? `<details class="avvisi"><summary>Da sapere prima di guardarla (${meta.avvisi.length})</summary>
    <ul>${meta.avvisi.map(a => `<li>${esc(a)}</li>`).join("")}</ul></details>` : ""}
</header>

<main class="schermo">
  <section class="tavolo" aria-label="il tavolo">
    <div class="campo-box" id="campo-box" style="--rapporto:${meta.w} / ${meta.h}">
      <svg id="campo" viewBox="0 0 ${meta.w} ${meta.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="il tavolo">
        <defs id="defs"></defs>
        <rect class="piano" x="0" y="0" width="${meta.w}" height="${meta.h}" rx="10"/>
        <g id="l-griglia"></g><g id="l-zone"></g><g id="l-terreno"></g><g id="l-pezzi"></g>
        <g id="l-nomi"></g><g id="l-fx"></g>
      </svg>
      <div class="pila" id="pila" aria-live="polite"></div>
      <div class="tip" id="tip" role="tooltip" hidden></div>
    </div>
    <div class="comandi">
      <div class="barra">
        <button id="via" title="indietro (←)" aria-label="indietro">◀</button>
        <button id="play" class="primario" title="guarda (spazio)">▶ Guarda</button>
        <button id="poi" title="avanti (→)" aria-label="avanti">▶</button>
        <input id="cursore" type="range" min="0" max="${Math.max(0, n - 1)}" value="0" aria-label="fotogramma">
        <span class="stato" id="stato"></span>
      </div>
      <div class="barra seconda">
        <div class="turni" id="turni" aria-label="vai al turno"></div>
        <label title="velocità"><select id="velocita" aria-label="velocità">
          <option value="0.5">lento</option><option value="1" selected>normale</option><option value="2">veloce</option></select></label>
        <label title="le schede con i dadi, il numero da battere e il perché, sopra il tavolo"><input type="checkbox" id="spiega" checked> perché</label>
        <label title="le foto delle miniature della collezione sulle basette"><input type="checkbox" id="foto" checked> foto</label>
        <label title="frecce, colpi, incantesimi e mischie sul tavolo"><input type="checkbox" id="effetti" checked> effetti</label>
      </div>
    </div>
  </section>
  <aside class="colonna">
    <div class="registro" id="registro" aria-label="il registro"></div>
    <details class="piede"><summary>Quello che questa partita non ha giocato</summary><p>${esc(meta.piede)}</p></details>
  </aside>
</main>
</div>

<script>
const P = ${dati};
${spiegaNellaPagina()}
(${cliente.toString()})();
</script>
</html>`;
}

export const coloreTerreno = kind => COLORI[kind] || "#c8bda8";

/* ============================================================
   LO STILE
   ============================================================ */
const CSS = `
:root{
  --sfondo:#f4efe4; --carta:#fffdf8; --carta-2:#f3ecdd; --linea:#ddd1b9; --linea-forte:#b9ab90;
  --testo:#2b2620; --muto:#74695b; --A:${COLORI.A}; --B:${COLORI.B}; --evid:#fff3cf; --oro:#c99a2e;
  --tavolo:#e9e0cc; --tavolo-bordo:#cdbfa6; --ok:#4a7346; --bad:#a8332a; --ombra:rgba(40,30,10,.14);
  /* i gettoni che leggono le schede del perché (src/spiega.js) */
  --panel:var(--carta); --panel-2:var(--carta-2); --ink:var(--testo); --muted:var(--muto);
  --line:var(--linea); --line-strong:var(--linea-forte); --armyA:var(--A); --armyB:var(--B);
  color-scheme: light;
}
@media (prefers-color-scheme: dark){
  :root{
    --sfondo:#15130f; --carta:#1f1c16; --carta-2:#2a261e; --linea:#3a342a; --linea-forte:#5a5042;
    --testo:#ece4d4; --muto:#a99d89; --A:#e25a4b; --B:#5a9ce0; --evid:#3a3220; --oro:#e0b64a;
    --tavolo:#3b3a2d; --tavolo-bordo:#57523f; --ok:#7fb07a; --bad:#e0766b; --ombra:rgba(0,0,0,.45);
    color-scheme: dark;
  }
}
*{ box-sizing:border-box; }
html,body{ margin:0; }
body{ background:var(--sfondo); color:var(--testo);
      font:15px/1.5 "Iowan Old Style","Palatino Linotype",Georgia,serif; }
button,select,input{ font:inherit; color:inherit; }
.app{ display:grid; grid-template-rows:auto minmax(0,1fr); min-height:100dvh; }

.testa{ display:flex; flex-wrap:wrap; align-items:center; gap:6px 18px; padding:12px 18px 10px;
        border-bottom:1px solid var(--linea); background:var(--carta); }
.titoli{ flex:1 1 420px; min-width:0; }
h1{ margin:0; font-size:19px; letter-spacing:.2px; line-height:1.25; }
.sotto{ color:var(--muto); font-size:13px; }
.eserciti{ display:flex; align-items:center; gap:8px; font:600 13px/1 system-ui,sans-serif; }
.es{ padding:4px 10px; border-radius:999px; color:#fff; }
.es-A{ background:var(--A); } .es-B{ background:var(--B); }
.contro{ color:var(--muto); font-weight:400; }
.avvisi{ flex-basis:100%; padding:6px 12px; border:1px solid #e0b872; background:#fff4dc;
         border-radius:6px; color:#6b4410; font-size:13px; }
@media (prefers-color-scheme: dark){ .avvisi{ background:#2e2616; border-color:#6b5328; color:#e8c98a; } }
.avvisi summary{ cursor:pointer; font-weight:600; }
.avvisi ul{ margin:4px 0 2px; padding-left:18px; }

.schermo{ display:grid; grid-template-columns:minmax(0,1fr) 380px; min-height:0; }
.tavolo{ display:flex; flex-direction:column; min-width:0; min-height:0; padding:12px 16px 10px; gap:8px; }
.campo-box{ position:relative; flex:1 1 auto; min-height:0; }
#campo{ display:block; width:100%; height:100%; }
.piano{ fill:var(--tavolo); stroke:var(--tavolo-bordo); stroke-width:2; }
.colonna{ display:flex; flex-direction:column; min-height:0; border-left:1px solid var(--linea); background:var(--carta); }
@media (min-width:1000px){
  .app{ height:100dvh; }
}
@media (max-width:999px){
  .schermo{ grid-template-columns:1fr; }
  .campo-box{ flex:none; aspect-ratio:var(--rapporto); max-height:72vh; }
  .tavolo{ padding:10px 16px; }
  .colonna{ border-left:0; border-top:1px solid var(--linea); }
  .registro{ max-height:60vh; }
  .comandi{ position:sticky; bottom:0; z-index:4; background:var(--sfondo); padding-bottom:max(6px, env(safe-area-inset-bottom));
            border-top:1px solid var(--linea); margin:0 -16px; padding-left:16px; padding-right:16px; }
}

.comandi{ display:flex; flex-direction:column; gap:6px; }
.barra{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
.barra input[type=range]{ flex:1 1 160px; min-width:120px; accent-color:var(--oro); }
button{ padding:5px 12px; border:1px solid var(--linea-forte); background:var(--carta); border-radius:7px;
        cursor:pointer; min-height:34px; }
button:hover{ background:var(--carta-2); }
button.primario{ background:var(--testo); color:var(--carta); border-color:var(--testo); min-width:96px; }
button:focus-visible, select:focus-visible, input:focus-visible{ outline:2px solid var(--oro); outline-offset:2px; }
.stato{ font-size:13px; color:var(--muto); min-width:0; flex:1 1 220px; }
.seconda{ font-size:13px; color:var(--muto); }
.seconda label{ display:flex; gap:4px; align-items:center; white-space:nowrap; cursor:pointer; }
.seconda select{ padding:3px 6px; border:1px solid var(--linea-forte); border-radius:6px; background:var(--carta); }
.turni{ display:flex; flex-wrap:wrap; gap:4px; flex:1 1 auto; }
.turni button{ min-height:28px; padding:2px 9px; font:600 12px/1 system-ui,sans-serif; border-radius:999px; }
.turni button.ora{ background:var(--oro); border-color:var(--oro); color:#1c160b; }

.registro{ position:relative; flex:1 1 auto; overflow:auto; padding:6px 14px 12px; overscroll-behavior:contain; }
.turno-testa{ position:sticky; top:-6px; z-index:1; margin:8px -14px 0; padding:6px 14px; background:var(--carta-2);
              font:700 12px/1.3 system-ui,sans-serif; letter-spacing:.4px; text-transform:uppercase; color:var(--muto);
              border-bottom:1px solid var(--linea); }
.riga{ padding:7px 0 7px 10px; border-bottom:1px solid var(--linea); font-size:13.5px; border-left:3px solid transparent;
       cursor:pointer; }
.riga.rA{ border-left-color:var(--A); } .riga.rB{ border-left-color:var(--B); }
.riga:hover{ background:var(--carta-2); }
.riga.ora{ background:var(--evid); }
.fase{ font:600 11px/1 system-ui,sans-serif; color:var(--muto); text-transform:uppercase; letter-spacing:.3px; margin-bottom:3px; }
.perche{ color:var(--muto); font-style:italic; }
.pag{ color:var(--muto); font-size:12px; }
.dadi{ font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; color:var(--muto); }
.dadi b{ font-weight:600; font-family:inherit; }
.limite{ color:#8a5a1c; }
@media (prefers-color-scheme: dark){ .limite{ color:#d9a45a; } }
.riga details > summary{ cursor:pointer; list-style:none; }
.riga details > summary::-webkit-details-marker{ display:none; }
.riga details > summary::after{ content:" · perché?"; color:var(--muto); font-size:12px; }
.riga details[open] > summary::after{ content:""; }
.riga details .sp{ margin:6px 0 6px; }
.piede{ border-top:1px solid var(--linea); padding:8px 14px; color:var(--muto); font-size:12.5px; }
.piede summary{ cursor:pointer; }
.piede p{ margin:6px 0 2px; }

/* il tavolo: il testo sta nelle coordinate del tavolo, che sono
   millimetri — la dimensione giusta la mette lo script, secondo quanto
   e' grande il tavolo sullo schermo */
.zona{ fill:none; stroke-dasharray:10 8; stroke-opacity:.45; stroke-width:2; }
.scena{ cursor:help; }
.scena:hover .contorno, .scena.su .contorno{ stroke:var(--oro); stroke-width:4; }
.pezzo{ transition:transform .55s cubic-bezier(.3,.7,.3,1), opacity .4s; cursor:pointer; }
.etichetta{ transition:transform .55s cubic-bezier(.3,.7,.3,1), opacity .4s; pointer-events:none; }
.salto .pezzo, .salto .etichetta{ transition:none; }
.pezzo.nuovo, .etichetta.nuovo{ opacity:0; }
.pezzo.via, .etichetta.via{ opacity:0; }
.pezzo.fuga{ opacity:.55; }
.pezzo .corpo{ stroke:rgba(0,0,0,.45); stroke-width:1; }
.pezzo .bordo{ fill:none; stroke-width:3; }
.pezzo.mischia .bordo{ stroke:#f5c542; stroke-width:5; }
.pezzo .fronte{ fill:#fff; fill-opacity:.9; }
.pezzo .base{ fill:none; stroke:rgba(255,255,255,.45); stroke-width:.8; }
.pezzo .capo{ fill:none; stroke:var(--oro); stroke-width:2.4; }
.pezzo .acceso{ fill:none; stroke:#f5c542; stroke-width:7; stroke-opacity:0; }
.pezzo.acceso .acceso{ stroke-opacity:.9; }
.pezzo.subisce .acceso{ stroke-opacity:.8; stroke-dasharray:14 8; }
.pezzo.colpito .corpo{ animation:colpo .9s ease-out; }
@keyframes colpo{ 0%,100%{ fill-opacity:inherit; } 20%{ fill:#fff; fill-opacity:.95; } 45%{ fill:#ff3b2f; fill-opacity:.9; } }
.pezzo:hover .bordo{ stroke:var(--oro); }
.nome{ fill:#fff; paint-order:stroke; stroke:rgba(0,0,0,.6); stroke-linejoin:round;
       font-family:system-ui,-apple-system,"Segoe UI",sans-serif; font-weight:600; }
.fxt{ font-family:system-ui,sans-serif; font-weight:800; paint-order:stroke; stroke:rgba(0,0,0,.55); stroke-linejoin:round; }
@media (prefers-reduced-motion: reduce){ .pezzo, .etichetta{ transition:none; } .pezzo.colpito .corpo{ animation:none; } }

.tip{ position:absolute; z-index:6; max-width:280px; padding:8px 11px; border-radius:9px; pointer-events:none;
      background:var(--carta); color:var(--testo); border:1px solid var(--linea-forte);
      box-shadow:0 8px 24px var(--ombra); font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif; }
.tip b{ display:block; font-size:14px; margin-bottom:2px; }
.tip .cat{ display:inline-block; margin:2px 0 4px; padding:1px 8px; border-radius:999px; background:var(--carta-2);
           color:var(--muto); font-size:11.5px; font-weight:600; }
.tip ul{ margin:2px 0 0; padding-left:16px; }
.tip .mut{ color:var(--muto); }

/* le schede del perché: sopra il tavolo quelle del fotogramma, nel
   registro ripiegate sotto la loro riga */
.pila{ position:absolute; top:10px; right:10px; width:min(340px, 46%); display:flex; flex-direction:column;
       gap:8px; pointer-events:none; max-height:calc(100% - 20px); overflow:hidden; z-index:3; }
.pila .sp{ pointer-events:auto; animation:entra .3s ease-out both; }
.pila .sp:nth-child(2){ animation-delay:.08s; } .pila .sp:nth-child(3){ animation-delay:.16s; }
.pila .sp:nth-child(4){ animation-delay:.24s; }
.pila .altre{ align-self:flex-end; font-size:12px; color:var(--muto); background:var(--carta);
              border:1px solid var(--linea); border-radius:999px; padding:2px 10px; pointer-events:auto; }
@keyframes entra{ from{ opacity:0; transform:translateY(-8px); } to{ opacity:1; transform:none; } }
@media (prefers-reduced-motion: reduce){ .pila .sp{ animation:none; } }
@media (max-width:999px){ .pila{ position:static; width:auto; margin-top:10px; max-height:none; } }
`;

/* ============================================================
   LA PAGINA
   Tutto quello che segue gira nel browser: la funzione si copia nello
   <script> cosi' com'e', e legge `P` (i dati) e `SP` (le schede).
   ============================================================ */
function cliente(){
  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const campo = $('campo'), registro = $('registro'), cursore = $('cursore'), stato = $('stato');
  const box = $('campo-box'), tip = $('tip'), pila = $('pila');
  const lZone = $('l-zone'), lTerreno = $('l-terreno'), lPezzi = $('l-pezzi'), lNomi = $('l-nomi'), lFx = $('l-fx');
  const spiega = $('spiega'), mostraFoto = $('foto'), effetti = $('effetti'), velocita = $('velocita');
  const MM = 25.4;
  const M = P.meta, FORME = M.forme || [], FOTO = M.foto || {}, PZ = M.pezzi || {};
  const W = M.w, H = M.h;
  /* il testo del registro e i perché vengono da fuori — i nomi delle
     liste, le frasi del modello — e non devono diventare HTML */
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const dadiDi = r => r.g && r.g.length
    ? r.g.map(x => '<b>' + esc(x.w) + '</b> ' + x.d.join(' ')).join(' · ')
    : (r.d || []).join(' ');
  const quieto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colA = a => a === 'A' ? 'var(--A)' : 'var(--B)';
  const nomeEsercito = a => (M.nomi || {})[a] || a;

  /* ---- le cose che si disegnano una volta: le foto, i motivi del
     terreno, i bagliori ---- */
  const defs = $('defs');
  let d = '';
  for (const [id, src] of Object.entries(FOTO))
    /* la foto e' un ritratto in studio con la miniatura al centro: il
       riquadro stringe sul modello e lascia fuori lo sfondo grigio */
    d += '<symbol id="ph-' + id + '" viewBox="52 38 152 152" preserveAspectRatio="xMidYMid slice">' +
         '<image href="' + src + '" width="256" height="256"/></symbol>';
  d += '<pattern id="pt-erba" width="22" height="22" patternUnits="userSpaceOnUse">' +
       '<path d="M3 18l2-5M11 9l1-5M17 20l2-4" stroke="#2f5a2a" stroke-opacity=".35" stroke-width="1.4" fill="none"/></pattern>' +
       '<pattern id="pt-canne" width="26" height="20" patternUnits="userSpaceOnUse">' +
       '<path d="M4 17v-9M7 17l2-8M16 12v-8M19 12l2-7" stroke="#3d5a52" stroke-opacity=".6" stroke-width="1.5" fill="none"/>' +
       '<path d="M0 19h9M13 14h10" stroke="#5f7f86" stroke-opacity=".5" stroke-width="1.2"/></pattern>' +
       '<pattern id="pt-pietre" width="30" height="16" patternUnits="userSpaceOnUse">' +
       '<path d="M0 0h30M0 8h30M8 0v8M22 8v8" stroke="#5c5448" stroke-opacity=".45" stroke-width="1.2" fill="none"/></pattern>' +
       '<pattern id="pt-macerie" width="24" height="24" patternUnits="userSpaceOnUse">' +
       '<circle cx="5" cy="6" r="2" fill="#6a6258" fill-opacity=".5"/><circle cx="16" cy="15" r="2.6" fill="#6a6258" fill-opacity=".4"/>' +
       '<rect x="14" y="3" width="5" height="3" fill="#6a6258" fill-opacity=".45" transform="rotate(20 16 4)"/></pattern>' +
       '<radialGradient id="gr-fuoco"><stop offset="0" stop-color="#fffbe0"/><stop offset=".35" stop-color="#ffd23f"/>' +
       '<stop offset=".7" stop-color="#ff7a1a"/><stop offset="1" stop-color="#d4380d" stop-opacity="0"/></radialGradient>' +
       '<radialGradient id="gr-scoppio"><stop offset="0" stop-color="#fff6c8"/><stop offset=".4" stop-color="#ff9a1f" stop-opacity=".9"/>' +
       '<stop offset="1" stop-color="#b3200c" stop-opacity="0"/></radialGradient>' +
       '<radialGradient id="gr-ombra"><stop offset="0" stop-color="#f1d9ff"/><stop offset=".4" stop-color="#9b5cff"/>' +
       '<stop offset="1" stop-color="#3b0f6e" stop-opacity="0"/></radialGradient>' +
       '<radialGradient id="gr-verde"><stop offset="0" stop-color="#f3ffe0"/><stop offset=".4" stop-color="#7cff4f"/>' +
       '<stop offset="1" stop-color="#1f6b12" stop-opacity="0"/></radialGradient>' +
       '<radialGradient id="gr-azzurro"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#6fc3ff"/>' +
       '<stop offset="1" stop-color="#1b4f8a" stop-opacity="0"/></radialGradient>' +
       '<radialGradient id="gr-polvere"><stop offset="0" stop-color="#b09a78" stop-opacity=".7"/>' +
       '<stop offset="1" stop-color="#8a775a" stop-opacity="0"/></radialGradient>' +
       '<filter id="fl-bagliore" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/>' +
       '<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
  defs.innerHTML = d;

  /* ---- il tavolo: la griglia dei piedi, le zone, il terreno ---- */
  let gr = '';
  for (let x = 12 * MM; x < W - 1; x += 12 * MM) gr += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '"/>';
  for (let y = 12 * MM; y < H - 1; y += 12 * MM) gr += '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '"/>';
  $('l-griglia').innerHTML = '<g stroke="currentColor" stroke-opacity=".07" stroke-width="1.5">' + gr + '</g>';
  lZone.innerHTML = (M.zone || []).map(z =>
    '<rect class="zona" x="' + z.x + '" y="' + z.y + '" width="' + z.w + '" height="' + z.h +
    '" stroke="' + colA(z.army) + '"/>').join('');

  /* un generatore fisso: gli alberi di un bosco stanno sempre negli
     stessi posti, fotogramma dopo fotogramma e pagina dopo pagina */
  const semeDi = n => { let s = (n * 2654435761) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
  function scena(t, i){
    const w = t.w, h = t.h, c = t.colore || '#c8bda8', rnd = semeDi(i + 7);
    const tondo = t.forma === 'circle' || t.forma === 'token';
    const rr = Math.min(w, h) / 2;
    let s = '';
    if (t.kind === 'treasure'){
      s += '<circle class="contorno" r="' + rr + '" fill="' + c + '" stroke="#7a5a12" stroke-width="2"/>' +
           '<circle r="' + (rr * .62) + '" fill="none" stroke="#fff3c0" stroke-width="1.6"/>' +
           '<path d="M0 ' + (-rr * .45) + 'L' + (rr * .13) + ' ' + (-rr * .13) + 'L' + (rr * .45) + ' 0L' + (rr * .13) + ' ' + (rr * .13) +
           'L0 ' + (rr * .45) + 'L' + (-rr * .13) + ' ' + (rr * .13) + 'L' + (-rr * .45) + ' 0L' + (-rr * .13) + ' ' + (-rr * .13) + 'Z" fill="#fff3c0"/>';
    } else if (tondo){
      s += '<circle class="contorno" r="' + rr + '" fill="' + c + '" stroke="#3e3a35" stroke-width="2"/>' +
           '<circle r="' + (rr * .7) + '" fill="#8a847c" fill-opacity=".5"/>' +
           '<circle cx="' + (-rr * .25) + '" cy="' + (-rr * .25) + '" r="' + (rr * .25) + '" fill="#fff" fill-opacity=".15"/>';
    } else if (t.kind === 'wood'){
      s += '<rect class="contorno" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h +
           '" rx="' + Math.min(w, h) * .28 + '" fill="' + c + '" fill-opacity=".75" stroke="#4d6b40" stroke-width="2" stroke-dasharray="6 4"/>' +
           '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="' + Math.min(w, h) * .28 + '" fill="url(#pt-erba)"/>';
      const n = Math.max(4, Math.round(w * h / 2600));
      for (let k = 0; k < n; k++){
        const x = (rnd() - .5) * (w - 34), y = (rnd() - .5) * (h - 34), r = 11 + rnd() * 8;
        s += '<circle cx="' + (x + 3) + '" cy="' + (y + 4) + '" r="' + r + '" fill="#000" fill-opacity=".16"/>' +
             '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="#3f6b35"/>' +
             '<circle cx="' + (x - r * .3) + '" cy="' + (y - r * .3) + '" r="' + (r * .55) + '" fill="#5d8f4c"/>';
      }
    } else if (t.kind === 'hill'){
      const R = Math.min(w, h) * .48;
      s += '<rect class="contorno" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h +
           '" rx="' + R + '" fill="' + c + '" stroke="#a8945e" stroke-width="2"/>';
      for (const k of [.72, .45])
        s += '<rect x="' + (-w * k / 2) + '" y="' + (-h * k / 2) + '" width="' + (w * k) + '" height="' + (h * k) +
             '" rx="' + (R * k) + '" fill="#fff" fill-opacity=".12" stroke="#a8945e" stroke-opacity=".7" stroke-width="1.5"/>';
    } else if (t.kind === 'marsh'){
      s += '<rect class="contorno" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h +
           '" rx="' + Math.min(w, h) * .45 + '" fill="' + c + '" fill-opacity=".8" stroke="#5f7f86" stroke-width="2"/>' +
           '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" rx="' + Math.min(w, h) * .45 + '" fill="url(#pt-canne)"/>';
    } else if (t.kind === 'ruins' || t.kind === 'pyramid'){
      s += '<rect class="contorno" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h +
           '" rx="4" fill="' + c + '" fill-opacity=".7" stroke="#7d7466" stroke-width="2"/>' +
           '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" fill="url(#pt-macerie)"/>';
      if (t.kind === 'pyramid')
        s += '<path d="M' + (-w / 2) + ' ' + (-h / 2) + 'L0 0L' + (w / 2) + ' ' + (-h / 2) + 'M' + (-w / 2) + ' ' + (h / 2) + 'L0 0L' + (w / 2) + ' ' + (h / 2) +
             '" stroke="#7d6a45" stroke-width="2" fill="none"/>';
      else {
        /* i muri rotti: due angoli di pietra e qualche blocco caduto */
        const sp = 9;
        s += '<path d="M' + (-w / 2 + 8) + ' ' + (-h / 2 + 30) + 'V' + (-h / 2 + 8) + 'H' + (-w * .05) +
             'M' + (w / 2 - 8) + ' ' + (h / 2 - 34) + 'V' + (h / 2 - 8) + 'H' + (w * .12) +
             '" stroke="#5f574c" stroke-width="' + sp + '" fill="none" stroke-linecap="square"/>' +
             '<path d="M' + (-w / 2 + 8) + ' ' + (-h / 2 + 30) + 'V' + (-h / 2 + 8) + 'H' + (-w * .05) +
             'M' + (w / 2 - 8) + ' ' + (h / 2 - 34) + 'V' + (h / 2 - 8) + 'H' + (w * .12) +
             '" stroke="url(#pt-pietre)" stroke-width="' + sp + '" fill="none"/>';
        for (let k = 0; k < 5; k++)
          s += '<rect x="' + ((rnd() - .5) * w * .7) + '" y="' + ((rnd() - .5) * h * .7) + '" width="' + (6 + rnd() * 6) +
               '" height="' + (5 + rnd() * 4) + '" fill="#6d655a" transform="rotate(' + Math.round(rnd() * 90) + ')"/>';
      }
    } else if (t.kind === 'wall'){
      s += '<rect class="contorno" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + Math.max(h, 8) +
           '" fill="' + c + '" stroke="#5c5448" stroke-width="1.5"/>' +
           '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + Math.max(h, 8) + '" fill="url(#pt-pietre)"/>';
    } else {
      s += '<rect class="contorno" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h +
           '" rx="6" fill="' + c + '" fill-opacity=".6" stroke="#b9ab90" stroke-width="2"/>';
    }
    return '<g class="scena" data-t="' + i + '" transform="translate(' + t.x + ',' + t.y + ') rotate(' + (t.rot || 0) + ')">' + s + '</g>';
  }
  lTerreno.innerHTML = (M.terreno || []).map(scena).join('');

  /* ---- le etichette: grandi quanto serve per leggerle ----
     Il tavolo e' in millimetri e sullo schermo e' grande quanto la
     finestra: su un telefono 22 mm di testo diventavano sei pixel. */
  let corpo = 22;
  function misura(){
    const r = campo.getBoundingClientRect();
    const scala = Math.min(r.width / W, r.height / H) || 1;
    corpo = Math.max(18, Math.min(34, 11 / scala));
    lNomi.style.fontSize = corpo + 'px';
  }
  new ResizeObserver(misura).observe(box);
  misura();

  /* ---- i fotogrammi, le posizioni ---- */
  const posDi = (f, id) => {
    if (!f) return null;
    const u = f.unita.find(x => x.id === id);
    if (u) return u;
    const host = f.ospiti && f.ospiti[id];
    return host != null ? f.unita.find(x => x.id === host) || null : null;
  };

  /* ---- i pezzi: restano gli stessi elementi da un fotogramma
     all'altro, e cambiano solo dove stanno — cosi' scivolano ---- */
  const vivi = new Map();
  const giro = new Map();          // l'ultimo angolo, per non girare dal lato lungo
  function interno(u){
    const col = colA(u.a);
    const forma = u.fo != null ? FORME[u.fo] : null;
    const foto = mostraFoto.checked;
    /* la foto resta in piedi: un reggimento che guarda in basso la
       ruota di mezzo giro, cosi' le teste stanno sempre in alto */
    const rot = ((u.r % 360) + 360) % 360;
    const capovolta = rot > 90 && rot < 270;
    let s = '<rect class="acceso" x="' + (-u.w / 2 - 7) + '" y="' + (-u.h / 2 - 7) + '" width="' + (u.w + 14) +
            '" height="' + (u.h + 14) + '" rx="7"/>' +
            '<rect class="corpo" x="' + (-u.w / 2) + '" y="' + (-u.h / 2) + '" width="' + u.w + '" height="' + u.h +
            '" rx="2" fill="' + col + '" fill-opacity="' + (foto && forma ? '.4' : '.85') + '"/>';
    if (forma){
      for (const c of forma){
        const [x, y, w, h, capo, cat, r] = c;
        const ph = foto && cat && FOTO[cat];
        s += '<g transform="translate(' + x + ',' + y + ') rotate(' + (r || 0) + ')">';
        if (ph){
          /* le basette lunghe (cavalieri, carri, macchine): la foto e'
             di fianco, e si distende per il lungo con il davanti verso
             il fronte */
          const lunga = h > w * 1.3;
          const iw = lunga ? h : w, ih = lunga ? w : h;
          const g = lunga ? -90 : (capovolta ? 180 : 0);
          s += '<use href="#ph-' + cat + '" x="' + (-iw / 2) + '" y="' + (-ih / 2) + '" width="' + iw + '" height="' + ih +
               '" transform="rotate(' + g + ')"/>' +
               '<rect x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w + '" height="' + h + '" fill="' + col + '" fill-opacity=".2"/>';
        }
        s += '<rect class="' + (capo ? 'capo' : 'base') + '" x="' + (-w / 2) + '" y="' + (-h / 2) + '" width="' + w +
             '" height="' + h + '" rx="' + (capo ? 3 : 1) + '"/></g>';
      }
    }
    /* il fronte: la tacca chiara sul lato che guarda il nemico */
    s += '<rect class="fronte" x="' + (-u.w / 2) + '" y="' + (-u.h / 2 - 1.5) + '" width="' + u.w + '" height="4"/>' +
         '<rect class="bordo" x="' + (-u.w / 2) + '" y="' + (-u.h / 2) + '" width="' + u.w + '" height="' + u.h +
         '" rx="2" stroke="' + col + '"/>';
    return { html: s, key: [u.fo, u.w, u.h, u.a, foto ? 1 : 0, capovolta ? 1 : 0].join('|') };
  }
  function angolo(id, r){
    const prima = giro.get(id);
    let a = r;
    if (prima != null){ while (a - prima > 180) a -= 360; while (prima - a > 180) a += 360; }
    giro.set(id, a);
    return a;
  }
  function etichettaDi(u){
    return esc(u.n) + (u.m > 1 ? ' ' + u.v + '/' + u.m : '') +
      (u.fw ? ' ♥' + (u.fw - u.fp) + '/' + u.fw : '') + (u.f ? ' ⚑' : '') + (u.c ? ' ⚔' : '');
  }
  function pezzi(f, prima, accesi, colpiti, salto){
    campo.classList.toggle('salto', salto || quieto());
    const visti = new Set();
    for (const u of f.unita){
      visti.add(u.id);
      let v = vivi.get(u.id);
      const nuovo = !v;
      if (nuovo){
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'pezzo nuovo');
        g.dataset.u = u.id;
        const t = document.createElementNS(NS, 'g');
        t.setAttribute('class', 'etichetta nuovo');
        t.innerHTML = '<text class="nome" text-anchor="middle" dy=".35em"></text>';
        lPezzi.appendChild(g); lNomi.appendChild(t);
        v = { g, t, key: '' };
        vivi.set(u.id, v);
      }
      clearTimeout(v.togli);
      v.g.classList.remove('via'); v.t.classList.remove('via');
      const inn = interno(u);
      if (inn.key !== v.key){ v.g.innerHTML = inn.html; v.key = inn.key; }
      const a = angolo(u.id, u.r);
      v.g.style.transform = 'translate(' + u.x + 'px,' + u.y + 'px) rotate(' + a + 'deg)';
      /* il nome sta sotto il pezzo quando il pezzo e' piccolo, dentro
         quando c'e' posto */
      const dentro = Math.min(u.w, u.h) > corpo * 1.6;
      v.t.style.transform = 'translate(' + u.x + 'px,' + (dentro ? u.y : u.y + Math.max(u.w, u.h) / 2 + corpo * .9) + 'px)';
      v.t.firstChild.innerHTML = etichettaDi(u);
      v.g.classList.toggle('fuga', !!u.f);
      v.g.classList.toggle('mischia', !!u.c);
      v.g.classList.toggle('acceso', accesi.has(u.id));
      v.g.classList.toggle('subisce', !accesi.has(u.id) && colpiti.has(u.id));
      const pu = prima && prima.unita.find(x => x.id === u.id);
      if (!salto && pu && u.v < pu.v){
        v.g.classList.remove('colpito');
        void v.g.getBoundingClientRect();
        setTimeout(() => v.g.classList.add('colpito'), 380);
      }
      /* entra sfumando: con un timer e non con requestAnimationFrame, che
         in una scheda nascosta non arriva mai e lasciava i pezzi
         trasparenti */
      if (nuovo) setTimeout(() => { v.g.classList.remove('nuovo'); v.t.classList.remove('nuovo'); }, 30);
    }
    /* chi non c'e' piu' si spegne, e poi se ne va */
    for (const [id, v] of vivi){
      if (visti.has(id)) continue;
      if (salto || quieto()){ v.g.remove(); v.t.remove(); vivi.delete(id); continue; }
      v.g.classList.add('via'); v.t.classList.add('via');
      v.togli = setTimeout(() => { v.g.remove(); v.t.remove(); vivi.delete(id); }, 900);
    }
  }

  /* ---- passando sopra: che cos'e' ---- */
  let fermo = null;
  function mostraTip(html, ev){
    tip.innerHTML = html;
    tip.hidden = false;
    const r = box.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.max(4, Math.min(r.width - tw - 4, x + 14)) + 'px';
    tip.style.top = (y + th + 18 > r.height ? Math.max(4, y - th - 12) : y + 16) + 'px';
  }
  function testoScena(i){
    const t = M.terreno[i];
    const cose = t.righe || String(t.testo || '').split(', ').filter(Boolean);
    return '<b>' + esc(t.label) + '</b>' + (t.cat && t.cat !== t.label ? '<span class="cat">' + esc(t.cat) + '</span>' : '') +
      (t.decor ? '<div class="mut">decorazione: si ignora per il movimento e il combattimento</div>' : '') +
      (cose.length ? '<ul>' + cose.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul>'
                   : '<div class="mut">terreno aperto: non cambia niente</div>');
  }
  function testoPezzo(id){
    const f = P.frames[i];
    const u = f.unita.find(x => x.id === id);
    if (!u) return '';
    const pz = PZ[id] || {};
    const capi = Object.entries(f.ospiti || {}).filter(([, h]) => h === id).map(([c]) => (PZ[c] || {}).n).filter(Boolean);
    const stato = [u.f ? 'in fuga' : '', u.c ? 'in mischia' : ''].filter(Boolean).join(', ');
    return '<b>' + esc(u.n) + '</b><span class="cat" style="color:#fff;background:' + colA(u.a) + '">' + esc(nomeEsercito(u.a)) + '</span>' +
      (pz.tl ? '<div class="mut">' + esc(pz.tl) + '</div>' : '') +
      '<div>' + (u.m > 1 ? u.v + ' modelli su ' + u.m : 'un modello') +
      (u.fw ? ', ferite ' + (u.fw - u.fp) + ' su ' + u.fw : '') + '</div>' +
      (capi.length ? '<div>con ' + capi.map(esc).join(', ') + '</div>' : '') +
      (stato ? '<div class="mut">' + stato + '</div>' : '');
  }
  function sopra(ev){
    const el = ev.target.closest && ev.target.closest('[data-t],[data-u]');
    if (!el){ if (!fermo) tip.hidden = true; return null; }
    const html = el.dataset.t != null ? testoScena(+el.dataset.t) : testoPezzo(+el.dataset.u);
    if (html) mostraTip(html, ev); else tip.hidden = true;
    return el;
  }
  campo.addEventListener('pointermove', ev => { if (ev.pointerType === 'mouse') sopra(ev); });
  campo.addEventListener('pointerleave', () => { if (!fermo) tip.hidden = true; });
  /* col dito non si passa sopra: si tocca, e un altro tocco chiude */
  campo.addEventListener('pointerdown', ev => {
    if (ev.pointerType === 'mouse') return;
    const el = sopra(ev);
    if (fermo) fermo.classList.remove('su');
    fermo = el && el !== fermo ? el : null;
    if (fermo) fermo.classList.add('su'); else tip.hidden = true;
  });

  /* ============================================================
     GLI EFFETTI
     ============================================================ */
  let turnoFx = 0;
  const pulisciFx = () => { turnoFx++; lFx.textContent = ''; };
  function el(tag, attrs, padre = lFx){
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    padre.appendChild(e);
    return e;
  }
  /* un'animazione: `passo` riceve il tempo da 0 a 1. Se la scheda non
     disegna (e' nascosta, o la finestra e' ridotta) i fotogrammi del
     browser non arrivano: un timer la chiude lo stesso, e niente resta
     appeso sul tavolo a meta' volo. */
  function tween(ms, passo, fine){
    const mio = turnoFx, t0 = performance.now();
    let finita = false;
    const chiudi = () => { if (finita || mio !== turnoFx) return; finita = true; passo(1); if (fine) fine(); };
    const f = now => {
      if (finita || mio !== turnoFx) return;
      const t = Math.min(1, (now - t0) / ms);
      if (t >= 1) return chiudi();
      passo(t);
      requestAnimationFrame(f);
    };
    passo(0);
    requestAnimationFrame(f);
    setTimeout(chiudi, ms + 250);
  }
  const dopo = (ms, fn) => { const mio = turnoFx; setTimeout(() => { if (mio === turnoFx) fn(); }, ms); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - (1 - t) * (1 - t);
  const easeIn = t => t * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const svanisci = (e, ms, da = 1) => tween(ms, t => e.setAttribute('opacity', da * (1 - t)), () => e.remove());

  /* un punto sul bordo del pezzo, dalla parte di chi guarda */
  function bordo(u, verso){
    const dx = verso[0] - u.x, dy = verso[1] - u.y, L = Math.hypot(dx, dy) || 1;
    const a = -u.r * Math.PI / 180;
    const lx = (dx * Math.cos(a) - dy * Math.sin(a)) / L, ly = (dx * Math.sin(a) + dy * Math.cos(a)) / L;
    const k = Math.min(Math.abs(lx) > 1e-6 ? u.w / 2 / Math.abs(lx) : 1e9, Math.abs(ly) > 1e-6 ? u.h / 2 / Math.abs(ly) : 1e9);
    return [u.x + dx / L * k, u.y + dy / L * k];
  }
  /* un punto a caso dentro il pezzo: dove cade la freccia */
  function dentro(u, quanto = .38){
    const lx = rnd(-quanto, quanto) * u.w, ly = rnd(-quanto, quanto) * u.h, a = u.r * Math.PI / 180;
    return [u.x + lx * Math.cos(a) - ly * Math.sin(a), u.y + lx * Math.sin(a) + ly * Math.cos(a)];
  }

  /* ---- i pezzi di un effetto ---- */
  function scintille(p, { n = 7, col = '#ffd23f', r = 22, ms = 380, w = 2.5 } = {}){
    for (let k = 0; k < n; k++){
      const a = rnd(0, Math.PI * 2), l = rnd(r * .5, r);
      const e = el('line', { x1: p[0], y1: p[1], x2: p[0], y2: p[1], stroke: col, 'stroke-width': w, 'stroke-linecap': 'round' });
      tween(ms, t => {
        const q = easeOut(t);
        e.setAttribute('x1', p[0] + Math.cos(a) * l * q * .4); e.setAttribute('y1', p[1] + Math.sin(a) * l * q * .4);
        e.setAttribute('x2', p[0] + Math.cos(a) * l * q); e.setAttribute('y2', p[1] + Math.sin(a) * l * q);
        e.setAttribute('opacity', 1 - t);
      }, () => e.remove());
    }
  }
  function onda(p, { r = 50, col = '#fff', ms = 600, w = 4 } = {}){
    const e = el('circle', { cx: p[0], cy: p[1], r: 1, fill: 'none', stroke: col, 'stroke-width': w });
    tween(ms, t => { e.setAttribute('r', 1 + r * easeOut(t)); e.setAttribute('opacity', 1 - t); }, () => e.remove());
  }
  function scoppio(p, { r = 40, grad = 'gr-scoppio', ms = 650 } = {}){
    const e = el('circle', { cx: p[0], cy: p[1], r: 1, fill: 'url(#' + grad + ')' });
    tween(ms, t => { e.setAttribute('r', 2 + r * easeOut(Math.min(1, t * 1.6))); e.setAttribute('opacity', t < .4 ? 1 : 1 - (t - .4) / .6); }, () => e.remove());
  }
  function fumo(p, { n = 4, r = 18, ms = 1100, col = '#9a9384' } = {}){
    for (let k = 0; k < n; k++){
      const dx = rnd(-10, 10), dy = rnd(-14, -2), e = el('circle', { cx: p[0], cy: p[1], r: 3, fill: col, opacity: .55 });
      tween(ms, t => {
        e.setAttribute('cx', p[0] + dx * t * 2); e.setAttribute('cy', p[1] + dy * t * 2);
        e.setAttribute('r', 3 + r * easeOut(t)); e.setAttribute('opacity', .55 * (1 - t));
      }, () => e.remove());
    }
  }
  function polvere(p, { r = 28, ms = 700 } = {}){
    const e = el('circle', { cx: p[0], cy: p[1], r: 2, fill: 'url(#gr-polvere)' });
    tween(ms, t => { e.setAttribute('r', 2 + r * easeOut(t)); e.setAttribute('opacity', 1 - t); }, () => e.remove());
  }
  function scritta(p, testo, { col = '#fff', ms = 1100, size = 34 } = {}){
    const e = el('text', { x: p[0], y: p[1], 'text-anchor': 'middle', class: 'fxt', fill: col, 'font-size': size, 'stroke-width': 6 });
    e.textContent = testo;
    tween(ms, t => {
      e.setAttribute('y', p[1] - 30 * easeOut(t));
      const s = t < .15 ? .6 + t / .15 * .6 : 1.2 - Math.min(.2, (t - .15));
      e.setAttribute('font-size', size * s);
      e.setAttribute('opacity', t < .7 ? 1 : 1 - (t - .7) / .3);
    }, () => e.remove());
  }
  /* un proiettile che vola: `forma` e' il disegno, orientato lungo +x;
     `arco` lo alza (visto dall'alto: cresce e la sua ombra resta a terra) */
  function volo(da, a, { ms = 600, arco = 0, forma, scia = null, ombra = false, fine = null }){
    const g = el('g', {});
    const om = ombra ? el('ellipse', { rx: 7, ry: 3.5, fill: '#000', opacity: .25 }, g) : null;
    const corpo = el('g', {}, g);
    corpo.innerHTML = forma;
    const ang = Math.atan2(a[1] - da[1], a[0] - da[0]) * 180 / Math.PI;
    let ultimo = 0;
    tween(ms, t => {
      const x = lerp(da[0], a[0], t), y = lerp(da[1], a[1], t);
      const alto = Math.sin(Math.PI * t) * arco;
      if (om){ om.setAttribute('cx', x); om.setAttribute('cy', y); }
      /* l'altezza si vede come un passo verso l'alto e una scala piu' grande */
      const tilt = arco ? Math.atan2(-Math.cos(Math.PI * t) * arco * Math.PI / 60, 1) * 180 / Math.PI * .6 : 0;
      corpo.setAttribute('transform', 'translate(' + x + ',' + (y - alto * .6) + ') rotate(' + (ang + tilt * Math.sign(Math.cos(ang * Math.PI / 180) || 1)) + ') scale(' + (1 + alto / 90) + ')');
      if (scia && t - ultimo > .05){ ultimo = t; scia([x, y - alto * .6], t); }
    }, () => { g.remove(); if (fine) fine(a); });
  }

  const FORME_FX = {
    freccia: '<line x1="-16" y1="0" x2="10" y2="0" stroke="#5a3b1c" stroke-width="2.2"/>' +
             '<path d="M9-4L18 0L9 4Z" fill="#555"/><path d="M-16-4L-11 0L-16 4M-12-4L-7 0L-12 4" stroke="#e8e0d0" stroke-width="1.6" fill="none"/>',
    quadrello: '<line x1="-11" y1="0" x2="8" y2="0" stroke="#3b2a18" stroke-width="2.6"/><path d="M7-4L15 0L7 4Z" fill="#444"/>',
    giavellotto: '<line x1="-24" y1="0" x2="14" y2="0" stroke="#6b4a26" stroke-width="3"/><path d="M13-5L25 0L13 5Z" fill="#666"/>',
    dardone: '<line x1="-34" y1="0" x2="20" y2="0" stroke="#4a3219" stroke-width="5"/><path d="M18-8L36 0L18 8Z" fill="#555"/>' +
             '<path d="M-34-7L-26 0L-34 7" stroke="#bbb" stroke-width="2.5" fill="none"/>',
    pallottola: '<line x1="-26" y1="0" x2="4" y2="0" stroke="#fff3b0" stroke-width="3" stroke-linecap="round" opacity=".85"/><circle r="3" fill="#fff"/>',
    palla: '<circle r="7" fill="#1d1d1d"/><circle cx="-2" cy="-2" r="2.4" fill="#777"/>',
    masso: '<circle r="12" fill="#8c8478"/><circle cx="-3" cy="-4" r="5" fill="#b8b0a2"/><circle cx="4" cy="3" r="3" fill="#5f584e"/>',
    fuoco: '<circle r="13" fill="url(#gr-fuoco)"/>',
    ombra: '<circle r="10" fill="url(#gr-ombra)"/>',
    verde: '<circle r="12" fill="url(#gr-verde)"/>',
    azzurro: '<circle r="10" fill="url(#gr-azzurro)"/>',
  };

  /* che arma e': dal nome, come la chiama la lista */
  function armaDi(nome){
    const n = String(nome || '').toLowerCase();
    if (/lightning|fulmin/.test(n)) return 'fulmine';
    if (/breath|soffio|flame|fiamm|fire|burn|lanciafiamme|warpfire/.test(n)) return 'fiamma';
    if (/cannon|cannone/.test(n)) return 'palla';
    if (/stone|rock|catapult|lobber|trebuchet|diver|mortar|mortaio|lanciapietre|plague claw|globe/.test(n)) return 'masso';
    if (/bolt thrower|chukka|lanciadardi|scorpion|repeater bolt/.test(n)) return 'dardone';
    if (/jezzail|gun|pistol|rifle|musket|blunderbuss|warplock|ratling|archibug|schioppo|moschett/.test(n)) return 'pallottola';
    if (/crossbow|balestra/.test(n)) return 'quadrello';
    if (/javelin|spear|throwing|giavell|lancia|axe|ascia|star|blowpipe|cerbottana|dart/.test(n)) return /blowpipe|cerbottana|dart/.test(n) ? 'quadrello' : 'giavellotto';
    return 'freccia';
  }
  /* che magia e': il colore dal nome, la forma dal tipo */
  function stileMagia(nome, tipo){
    const n = String(nome || '').toLowerCase();
    let col = 'azzurro';
    if (/fire|fiery|flam|burn|sun|pillar|incinerat|fuoco/.test(n)) col = 'fuoco';
    else if (/lightning|storm|tempest|thunder|warp|fulmin/.test(n)) col = 'fulmine';
    else if (/gork|mork|waaagh|'ere we go|green|bad moon/.test(n)) col = 'verde';
    else if (/oak|earth|rampart|leaf|life|shield|saphery|robe/.test(n)) col = 'oro';
    else if (/wind|blast|gust|air|vento/.test(n)) col = 'vento';
    else if (/summon|daemon|dark|doom|death|soul|spirit|shadow|corrupt|pain|curse|spectral|unquiet|gathering|chaos|vessel|vigour|leech|years|cabal|lust/.test(n)) col = 'ombra';
    return { col, tipo: tipo || 'missile' };
  }
  const TINTA = { fuoco: '#ff8a1f', fulmine: '#8dff5a', verde: '#7cff4f', oro: '#ffd86b', vento: '#e8f4ff', ombra: '#b07bff', azzurro: '#6fc3ff' };

  /* ---- gli effetti veri ---- */
  function tiroFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da), su = posDi(f, fx.su) || posDi(prima, fx.su);
    if (!da || !su) return 0;
    const tipo = armaDi(fx.arma);
    const n = Math.max(1, Math.min(8, fx.tiri || 4));
    const partenza = bordo(da, [su.x, su.y]);
    const L = Math.hypot(su.x - partenza[0], su.y - partenza[1]);
    if (tipo === 'fiamma'){
      const bersaglio = bordo(su, partenza);
      for (let k = 0; k < 26; k++) dopo(k * 22, () => {
        const a = [bersaglio[0] + rnd(-su.w / 3, su.w / 3), bersaglio[1] + rnd(-su.h / 3, su.h / 3)];
        const e = el('circle', { cx: partenza[0], cy: partenza[1], r: 5, fill: 'url(#gr-fuoco)' });
        tween(520, t => {
          e.setAttribute('cx', lerp(partenza[0], a[0], t)); e.setAttribute('cy', lerp(partenza[1], a[1], t));
          e.setAttribute('r', 5 + 16 * t); e.setAttribute('opacity', 1 - t * t);
        }, () => e.remove());
      });
      dopo(500, () => fumo([su.x, su.y], { n: 3 }));
      return 1100;
    }
    for (let k = 0; k < n; k++){
      const ritardo = k * (tipo === 'pallottola' ? 160 : tipo === 'freccia' ? 70 : 130);
      const a = dentro(su);
      dopo(ritardo, () => {
        const p0 = [partenza[0] + rnd(-6, 6), partenza[1] + rnd(-6, 6)];
        if (tipo === 'pallottola'){
          scoppio(p0, { r: 16, ms: 220 }); fumo(p0, { n: 2, r: 14 });
          volo(p0, a, { ms: Math.max(140, L * .22), forma: FORME_FX.pallottola, fine: q => scintille(q, { n: 5, r: 14, col: '#fff3b0' }) });
        } else if (tipo === 'palla'){
          scoppio(p0, { r: 26, ms: 280 }); fumo(p0, { n: 5, r: 24 });
          volo(p0, a, { ms: Math.max(260, L * .35), forma: FORME_FX.palla, ombra: true, arco: 10,
                        scia: (q, t) => { if (t > .55 && Math.random() < .5) polvere(q, { r: 14, ms: 500 }); },
                        fine: q => { polvere(q, { r: 36 }); scintille(q, { col: '#6b5a44', n: 8 }); } });
        } else if (tipo === 'masso'){
          fumo(p0, { n: 2 });
          volo(p0, a, { ms: Math.max(700, L * .9), forma: FORME_FX.masso, ombra: true, arco: 70,
                        fine: q => { onda(q, { r: 60, col: '#8a775a', w: 6 }); polvere(q, { r: 55, ms: 900 }); scintille(q, { col: '#7d6b52', n: 10, r: 34 }); } });
        } else {
          const ms = { freccia: Math.max(420, L * .75), giavellotto: Math.max(420, L * .8), quadrello: Math.max(260, L * .4), dardone: Math.max(300, L * .35) }[tipo] || 500;
          const arco = { freccia: 28, giavellotto: 16, quadrello: 4, dardone: 3 }[tipo] || 0;
          volo(p0, a, { ms, arco, forma: FORME_FX[tipo] || FORME_FX.freccia, ombra: arco > 10,
                        fine: q => scintille(q, { n: 3, r: 10, col: '#e8d9b8', w: 2 }) });
        }
      });
    }
    return n * 120 + 900;
  }

  function fulmineFx(fx, f, prima){
    const [p0, p1] = fx.p || [];
    if (!p0 || !p1) return 0;
    /* il fulmine del Warp Lightning Cannon e' verde; quello di un
       incantesimo porta il colore della sua magia */
    const col = fx.col || '#8dff5a';
    const zig = () => {
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), n = Math.max(6, Math.round(L / 28));
      const nx = -(p1[1] - p0[1]) / L, ny = (p1[0] - p0[0]) / L;
      let dd = 'M' + p0[0] + ' ' + p0[1];
      for (let k = 1; k < n; k++){
        const t = k / n, j = rnd(-14, 14);
        dd += 'L' + (lerp(p0[0], p1[0], t) + nx * j) + ' ' + (lerp(p0[1], p1[1], t) + ny * j);
      }
      return dd + 'L' + p1[0] + ' ' + p1[1];
    };
    scoppio(p0, { r: 30, grad: 'gr-verde', ms: 400 });
    for (let k = 0; k < 4; k++) dopo(k * 150, () => {
      const g = el('g', { filter: 'url(#fl-bagliore)' });
      const dd = zig();
      el('path', { d: dd, stroke: col, 'stroke-width': 9, fill: 'none', opacity: .55, 'stroke-linejoin': 'round' }, g);
      el('path', { d: dd, stroke: '#fff', 'stroke-width': 3, fill: 'none', 'stroke-linejoin': 'round' }, g);
      svanisci(g, 260);
    });
    dopo(200, () => { scintille(p1, { col, n: 9, r: 30 }); onda(p1, { r: 40, col }); });
    return 900;
  }

  function sagomaFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da);
    const p = (fx.p || [])[0];
    if (!da || !p) return 0;
    const p0 = bordo(da, p);
    const L = Math.hypot(p[0] - p0[0], p[1] - p0[1]);
    fumo(p0, { n: 3 });
    volo(p0, p, { ms: Math.max(700, L * .9), forma: FORME_FX.masso, ombra: true, arco: 80, fine: q => {
      const c = el('circle', { cx: q[0], cy: q[1], r: fx.r || 40, fill: '#ff9a1f', 'fill-opacity': .35, stroke: '#ffd23f', 'stroke-width': 3 });
      svanisci(c, 1100);
      onda(q, { r: (fx.r || 40) * 1.6, col: '#8a775a', w: 7, ms: 800 });
      polvere(q, { r: (fx.r || 40) * 1.2, ms: 1000 });
      scintille(q, { n: 12, r: (fx.r || 40), col: '#7d6b52' });
    } });
    return Math.max(700, L * .9) + 700;
  }

  /* la runa sotto chi lancia */
  function runa(p, col){
    const g = el('g', { transform: 'translate(' + p[0] + ',' + p[1] + ')' });
    el('circle', { r: 30, fill: 'none', stroke: col, 'stroke-width': 2.5, 'stroke-dasharray': '6 5' }, g);
    el('circle', { r: 20, fill: 'none', stroke: col, 'stroke-width': 1.5, opacity: .7 }, g);
    tween(800, t => { g.setAttribute('transform', 'translate(' + p[0] + ',' + p[1] + ') rotate(' + (t * 120) + ') scale(' + (.6 + .5 * easeOut(t)) + ')'); g.setAttribute('opacity', t < .6 ? 1 : 1 - (t - .6) / .4); }, () => g.remove());
  }
  function aura(u, col){
    const g = el('g', {});
    const r0 = Math.max(u.w, u.h) / 2 + 10;
    for (let k = 0; k < 2; k++) dopo(k * 260, () => onda([u.x, u.y], { r: r0 + 20, col, w: 5, ms: 900 }));
    const cerchio = el('circle', { cx: u.x, cy: u.y, r: r0, fill: col, 'fill-opacity': .12, stroke: col, 'stroke-width': 3, 'stroke-dasharray': '10 7' }, g);
    tween(1400, t => { cerchio.setAttribute('stroke-dashoffset', -t * 80); g.setAttribute('opacity', t < .75 ? 1 : 1 - (t - .75) / .25); }, () => g.remove());
    for (let k = 0; k < 10; k++) dopo(k * 90, () => {
      const p = dentro(u, .45), e = el('circle', { cx: p[0], cy: p[1], r: 3, fill: col });
      tween(900, t => { e.setAttribute('cy', p[1] - 40 * t); e.setAttribute('opacity', 1 - t); }, () => e.remove());
    });
  }
  function maledizione(u, col){
    for (let k = 0; k < 9; k++){
      const a = k / 9 * Math.PI * 2, R = Math.max(u.w, u.h) * .8;
      const e = el('circle', { r: 9, fill: '#2a1240', opacity: .0 });
      tween(1200, t => {
        const q = easeIn(t), rr = R * (1 - q), aa = a + t * 3;
        e.setAttribute('cx', u.x + Math.cos(aa) * rr); e.setAttribute('cy', u.y + Math.sin(aa) * rr);
        e.setAttribute('r', 9 + 10 * q); e.setAttribute('opacity', .75 * Math.sin(Math.PI * t));
      }, () => e.remove());
    }
    dopo(900, () => { scoppio([u.x, u.y], { r: Math.max(u.w, u.h) * .5, grad: 'gr-ombra', ms: 800 }); });
  }
  function vortice(u, col){
    const g = el('g', { transform: 'translate(' + u.x + ',' + u.y + ')' });
    let dd = '';
    for (let k = 0; k < 3; k++){
      const a0 = k * 2.09;
      dd += 'M0 0';
      for (let s = 1; s <= 24; s++){ const a = a0 + s * .26, r = s * 3.2; dd += 'L' + (Math.cos(a) * r).toFixed(1) + ' ' + (Math.sin(a) * r).toFixed(1); }
    }
    el('path', { d: dd, stroke: col, 'stroke-width': 4, fill: 'none', opacity: .85, 'stroke-linecap': 'round' }, g);
    tween(1500, t => { g.setAttribute('transform', 'translate(' + u.x + ',' + u.y + ') rotate(' + (t * 540) + ') scale(' + (.3 + t * .9) + ')'); g.setAttribute('opacity', t < .7 ? 1 : 1 - (t - .7) / .3); }, () => g.remove());
  }

  function magiaFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da);
    const su = posDi(f, fx.su) || posDi(prima, fx.su) || da;
    if (!da) return 0;
    const st = stileMagia(fx.nome, fx.tipo), col = TINTA[st.col] || '#6fc3ff';
    runa([da.x, da.y], col);
    const tipo = st.tipo;
    const stessa = su === da || (su.x === da.x && su.y === da.y);
    if (tipo === 'enchantment' || (stessa && tipo !== 'vortex')){ dopo(350, () => aura(su, col)); return 1700; }
    if (tipo === 'hex'){ dopo(300, () => maledizione(su, col)); return 1800; }
    if (tipo === 'vortex'){ dopo(300, () => vortice(su, col)); return 1900; }
    if (tipo === 'conveyance'){ dopo(300, () => { aura(da, col); }); return 1400; }
    /* i dardi e gli assalti: qualcosa parte da chi lancia e arriva */
    const p0 = bordo(da, [su.x, su.y]), p1 = [su.x, su.y];
    const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    if (st.col === 'fulmine'){
      dopo(300, () => fulmineFx({ p: [p0, bordo(su, p0)], col: /warp/i.test(fx.nome) ? '#8dff5a' : '#bfe7ff' }, f, prima));
      return 1300;
    }
    if (st.col === 'vento'){
      for (let k = 0; k < 4; k++) dopo(300 + k * 110, () => {
        const off = rnd(-su.w / 3, su.w / 3);
        volo([p0[0], p0[1]], [p1[0] + off, p1[1] + rnd(-12, 12)], { ms: Math.max(380, L * .5),
          forma: '<path d="M-6-18Q14 0-6 18" stroke="#e8f4ff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".85"/>' +
                 '<path d="M-22-12Q-6 0-22 12" stroke="#e8f4ff" stroke-width="3" fill="none" stroke-linecap="round" opacity=".5"/>' });
      });
      dopo(300 + Math.max(380, L * .5), () => { onda(p1, { r: 60, col: '#e8f4ff', w: 5 }); polvere(p1, { r: 40 }); });
      return 1500;
    }
    if (st.col === 'ombra' && tipo === 'missile'){
      for (let k = 0; k < 3; k++) dopo(300 + k * 140, () => {
        const a = dentro(su, .3), fase = rnd(0, 6);
        const g = el('g', {}); g.innerHTML = FORME_FX.ombra;
        const ms = Math.max(600, L * .8);
        tween(ms, t => {
          const nx = -(a[1] - p0[1]) / (L || 1), ny = (a[0] - p0[0]) / (L || 1), w = Math.sin(t * Math.PI * 3 + fase) * 22 * (1 - t);
          g.setAttribute('transform', 'translate(' + (lerp(p0[0], a[0], t) + nx * w) + ',' + (lerp(p0[1], a[1], t) + ny * w) + ')');
        }, () => { g.remove(); scoppio(a, { r: 30, grad: 'gr-ombra', ms: 600 }); scintille(a, { col: '#d9b8ff', n: 6 }); });
      });
      return 1800;
    }
    const forma = FORME_FX[st.col === 'oro' ? 'azzurro' : st.col] || FORME_FX.azzurro;
    const grad = { fuoco: 'gr-scoppio', verde: 'gr-verde', ombra: 'gr-ombra' }[st.col] || 'gr-azzurro';
    const ms = tipo === 'assailment' ? 380 : Math.max(520, L * .7);
    dopo(300, () => volo(p0, p1, { ms, forma, scia: (q, t) => {
      const e = el('circle', { cx: q[0] + rnd(-3, 3), cy: q[1] + rnd(-3, 3), r: st.col === 'fuoco' ? 7 : 5, fill: 'url(#' + (st.col === 'fuoco' ? 'gr-fuoco' : grad) + ')' });
      tween(420, s => { e.setAttribute('r', (st.col === 'fuoco' ? 7 : 5) * (1 - s) + 1); e.setAttribute('opacity', 1 - s); }, () => e.remove());
    }, fine: q => {
      scoppio(q, { r: Math.max(su.w, su.h) * .55 + 10, grad });
      scintille(q, { col, n: 10, r: 38 });
      if (st.col === 'fuoco') dopo(250, () => fumo(q, { n: 4, r: 22 }));
    } }));
    return 300 + ms + 800;
  }

  function dissoltoFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da);
    const su = posDi(f, fx.su) || posDi(prima, fx.su) || da;
    const dal = fx.dal != null ? posDi(f, fx.dal) || posDi(prima, fx.dal) : null;
    if (!da) return 0;
    const col = TINTA[stileMagia(fx.nome, fx.tipo).col] || '#6fc3ff';
    runa([da.x, da.y], col);
    if (dal) dopo(150, () => { runa([dal.x, dal.y], '#bfe9ff'); onda([dal.x, dal.y], { r: 50, col: '#bfe9ff' }); });
    const p0 = [da.x, da.y], p1 = su === da ? [da.x, da.y - 60] : [su.x, su.y];
    const q = [lerp(p0[0], p1[0], .5), lerp(p0[1], p1[1], .5)];
    dopo(300, () => volo(p0, q, { ms: 450, forma: '<circle r="9" fill="' + col + '" opacity=".85"/>', fine: z => {
      /* e a meta' strada si rompe */
      for (let k = 0; k < 8; k++){
        const a = rnd(0, Math.PI * 2), e = el('path', { d: 'M0-5L3 0L0 5L-3 0Z', fill: col });
        tween(600, t => { e.setAttribute('transform', 'translate(' + (z[0] + Math.cos(a) * 40 * t) + ',' + (z[1] + Math.sin(a) * 40 * t) + ') rotate(' + (t * 360) + ')'); e.setAttribute('opacity', 1 - t); }, () => e.remove());
      }
      scritta([z[0], z[1] - 10], '✕', { col: '#bfe9ff', size: 30, ms: 900 });
    } }));
    return 1500;
  }

  function fiascoFx(fx, f, prima){
    const da = posDi(f, fx.da) || posDi(prima, fx.da);
    if (!da) return 0;
    const p = [da.x, da.y];
    scoppio(p, { r: 3 * MM / 2 + 30, grad: 'gr-ombra', ms: 800 });
    dopo(120, () => { scoppio(p, { r: 3 * MM / 2, ms: 700 }); onda(p, { r: 3 * MM, col: '#d9b8ff', w: 6 }); scintille(p, { n: 14, r: 60, col: '#ff9a1f' }); });
    dopo(400, () => fumo(p, { n: 5, r: 26, col: '#5b4a6b' }));
    scritta([p[0], p[1] - 40], 'Fiasco!', { col: '#ffd23f', size: 30, ms: 1300 });
    return 1400;
  }

  const BESTIE = /monstrous|behemoth|warBeasts|monstrousCreature|Chariot/;
  function mischiaFx(fx, f, prima){
    const A = (fx.a || []).map(id => posDi(f, id) || posDi(prima, id)).filter(Boolean);
    const B = (fx.b || []).map(id => posDi(f, id) || posDi(prima, id)).filter(Boolean);
    if (!A.length || !B.length) return 0;
    let t0 = 0;
    for (const a of A) for (const b of B){
      const pa = bordo(a, [b.x, b.y]), pb = bordo(b, [a.x, a.y]);
      const c = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
      const dir = Math.atan2(b.y - a.y, b.x - a.x), lato = [-Math.sin(dir), Math.cos(dir)];
      const largo = Math.min(Math.max(a.w, a.h), Math.max(b.w, b.h)) * .45;
      for (let k = 0; k < 5; k++) dopo(t0 + k * 170, () => {
        const off = rnd(-largo, largo), p = [c[0] + lato[0] * off, c[1] + lato[1] * off];
        scintille(p, { n: 6, r: 20, col: k % 2 ? '#fff6c8' : '#ffd23f', ms: 300 });
      });
      dopo(t0, () => scritta([c[0], c[1] - 6], '⚔', { col: '#fff', size: 40, ms: 1000 }));
      /* le bestie graffiano: tre segni sul nemico */
      for (const [chi, su] of [[a, b], [b, a]]){
        const tp = (PZ[chi.id] || {}).tp || '';
        if (!BESTIE.test(tp)) continue;
        dopo(t0 + 250, () => {
          const p = dentro(su, .2), ang = rnd(-40, 40);
          const g = el('g', { transform: 'translate(' + p[0] + ',' + p[1] + ') rotate(' + ang + ')' });
          const tagli = [];
          for (let k = -1; k <= 1; k++){
            const e = el('path', { d: 'M' + (k * 12 - 8) + ' -26Q' + (k * 12 + 6) + ' 0 ' + (k * 12 - 4) + ' 26', stroke: '#ff3b2f',
                                    'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round', 'stroke-dasharray': 60, 'stroke-dashoffset': 60 }, g);
            tagli.push(e);
          }
          tween(260, t => tagli.forEach(e => e.setAttribute('stroke-dashoffset', 60 * (1 - t))), () => svanisci(g, 700));
        });
      }
      t0 += 250;
    }
    return t0 + 1100;
  }

  function caricaFx(fx, f, prima){
    const ora = posDi(f, fx.da), era = posDi(prima, fx.da);
    if (!ora) return 0;
    if (era && Math.hypot(ora.x - era.x, ora.y - era.y) > 10)
      for (let k = 0; k < 6; k++) dopo(k * 80, () => polvere([lerp(era.x, ora.x, k / 6) + rnd(-12, 12), lerp(era.y, ora.y, k / 6) + rnd(-12, 12)], { r: 26, ms: 800 }));
    if (fx.ok){
      const su = posDi(f, fx.su);
      if (su) dopo(520, () => { const p = bordo(ora, [su.x, su.y]); scintille(p, { n: 10, r: 30 }); onda(p, { r: 40, col: '#ffd23f' }); });
    }
    return 1000;
  }
  function paniconeFx(fx, f, prima, testo, col){
    const u = posDi(f, fx.da) || posDi(prima, fx.da);
    if (!u) return 0;
    scritta([u.x, u.y - Math.max(u.w, u.h) / 2 - 10], testo, { col, size: 38, ms: 1200 });
    return 900;
  }
  function fugaFx(fx, f, prima){
    const ora = posDi(f, fx.da), era = posDi(prima, fx.da);
    const u = ora || era;
    if (!u) return 0;
    if (ora && era) for (let k = 0; k < 5; k++) dopo(k * 90, () => polvere([lerp(era.x, ora.x, k / 5), lerp(era.y, ora.y, k / 5)], { r: 22 }));
    scritta([u.x, u.y - Math.max(u.w, u.h) / 2 - 10], '!', { col: '#ffd23f', size: 46, ms: 1200 });
    return 1000;
  }

  /* gli effetti di un fotogramma: quelli scritti dall'arbitro (`fx`) e
     quelli che si leggono dalla spiegazione (`x`) */
  function effettiDi(f){
    const out = [];
    for (const r of f.testo){
      if (r.fx){ out.push(r.fx); continue; }
      const x = r.x;
      if (!x) continue;
      if (x.k === 'tiro' && x.uid != null && x.su != null){
        const tiri = +((/(\d+) tir[io]/.exec(r.t) || [])[1]) || 3;
        out.push({ k: 'tiro', da: x.uid, su: x.su, arma: String(x.t || '').replace(/^Tiro · /, ''), tiri });
      } else if (x.k === 'fiasco') out.push({ k: 'fiasco', da: x.uid });
      else if (x.k === 'carica') out.push({ k: 'carica', da: x.uid, su: x.su, ok: !!x.ok });
      else if (x.k === 'fuga') out.push({ k: 'fuga', da: x.uid });
      else if (/^(panico|paura|terrore|rotta)$/.test(x.k) && x.ok === false) out.push({ k: 'paura', da: x.uid });
    }
    return out;
  }
  const FX = { tiro: tiroFx, fulmine: fulmineFx, sagoma: sagomaFx, magia: magiaFx, dissolto: dissoltoFx,
               fiasco: fiascoFx, mischia: mischiaFx, carica: caricaFx, fuga: fugaFx,
               paura: (fx, f, p) => paniconeFx(fx, f, p, '!', '#ff5a4a') };
  function giocaEffetti(f, prima){
    if (!effetti.checked || quieto()) return 0;
    const lista = effettiDi(f).slice(0, 8);
    let t = 250, fine = 0;
    for (const fx of lista){
      const fn = FX[fx.k];
      if (!fn) continue;
      const parti = t;
      dopo(parti, () => fn(fx, f, prima));
      /* quanto dura lo stima la stessa funzione solo quando parte: qui
         si mette in fila con un passo fisso, e ci si ferma a un tetto */
      t += 650;
      fine = parti + 1400;
    }
    return lista.length ? Math.min(4200, fine) : 0;
  }

  /* ============================================================
     IL REGISTRO, LE SCHEDE, LA BARRA
     ============================================================ */
  const schedeDi = f => f.testo.filter(r => r.x);
  const sceltaDi = f => f.perche && !/^passa/.test(f.perche)
    ? { x: { k: 'scelta', t: 'Perché questa mossa', u: f.chi || '', testo: f.perche }, army: f.army } : null;
  const MOSTRATE = 3;

  /* i turni, per saltarci */
  const turni = [];
  P.frames.forEach((f, k) => { if (!turni.length || turni[turni.length - 1].turno !== f.turno) turni.push({ turno: f.turno, k }); });
  /* l'ultimo fotogramma, quando e' il turno che non si gioca, e' il verdetto */
  $('turni').innerHTML = turni.map(t => '<button data-k="' + t.k + '">' +
    (t.k === P.frames.length - 1 && t.k > 0 ? 'Fine' : 'T' + t.turno) + '</button>').join('');
  $('turni').addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) vai(+b.dataset.k, true); });

  function scriviRegistro(i){
    const html = [];
    let turno = null;
    for (let k = Math.max(0, i - 60); k <= i; k++){
      const g = P.frames[k];
      if (!g.testo.length && !g.perche) continue;
      if (g.turno !== turno){ turno = g.turno; html.push('<div class="turno-testa">Turno ' + turno + '</div>'); }
      html.push('<div class="riga r' + g.army + (k === i ? ' ora' : '') + '" data-k="' + k + '">' +
        '<div class="fase">' + esc(g.casella) + ' · ' + esc(g.chi || nomeEsercito(g.army)) + '</div>' +
        (g.perche ? '<div class="perche">' + esc(g.perche) + '</div>' : '') +
        g.testo.map(r => {
          const riga = esc(r.t) + (r.p ? ' <span class="pag">(p. ' + r.p + ')</span>' : '') +
            ((r.d && r.d.length) || (r.g && r.g.length) ? ' <span class="dadi">[' + dadiDi(r) + ']</span>' : '');
          /* la riga con una spiegazione si apre sulla sua scheda */
          return '<div' + (r.k === 'limite' ? ' class="limite"' : '') + '>' +
            (r.x ? '<details><summary>' + riga + '</summary>' + SP.rigaHTML(r, { army: g.army, compatta: true }) + '</details>' : riga) +
            '</div>';
        }).join('') +
        '</div>');
    }
    registro.innerHTML = html.join('');
    /* scorre il registro e basta: `scrollIntoView` faceva scorrere anche
       la pagina, e sul telefono il tavolo spariva a ogni fotogramma */
    const ora = registro.querySelector('.ora');
    if (ora){
      const top = ora.offsetTop, fondo = top + ora.offsetHeight;
      if (fondo > registro.scrollTop + registro.clientHeight) registro.scrollTop = fondo - registro.clientHeight + 8;
      if (top < registro.scrollTop) registro.scrollTop = top - 8;
    }
  }
  registro.addEventListener('click', ev => {
    if (ev.target.closest('summary, details .sp')) return;
    const r = ev.target.closest('.riga');
    if (r) vai(+r.dataset.k, true);
  });

  let i = 0, timer = null;
  function disegna(i, { salto = false } = {}){
    const f = P.frames[i], prima = P.frames[i - 1] || null;
    const schede = schedeDi(f);
    const mostra = spiega.checked;
    /* chi le schede nominano si accende sul tavolo */
    const accesi = new Set(mostra ? schede.map(r => r.x.uid).filter(v => v != null) : []);
    const colpiti = new Set(mostra ? schede.map(r => r.x.su).filter(v => v != null) : []);
    pulisciFx();
    pezzi(f, salto ? null : prima, accesi, colpiti, salto);
    const durata = salto ? 0 : giocaEffetti(f, prima);

    /* sopra il tavolo le ultime schede del fotogramma; le altre restano
       nel registro, sotto la loro riga */
    const scelta = sceltaDi(f);
    const sopra = (scelta ? [scelta] : []).concat(schede.slice(-MOSTRATE));
    pila.innerHTML = !mostra ? '' :
      sopra.map(r => SP.rigaHTML(r, { army: r.army || f.army })).join('') +
      (schede.length > MOSTRATE ? '<div class="altre">e altre ' + (schede.length - MOSTRATE) + ' nel registro</div>' : '');

    stato.textContent = 'Turno ' + f.turno + ' · ' + f.casella + ' · ' +
      (f.chi || nomeEsercito(f.army)) + ' · ' + (i + 1) + '/' + P.frames.length;
    cursore.value = i;
    for (const b of $('turni').children) b.classList.toggle('ora', +b.dataset.k <= i &&
      !(b.nextElementSibling && +b.nextElementSibling.dataset.k <= i));
    scriviRegistro(i);
    return durata;
  }

  let ultimaDurata = 0;
  const vai = (n, salto = false) => {
    const nuovo = Math.max(0, Math.min(P.frames.length - 1, n));
    const passo = nuovo - i;
    i = nuovo;
    ultimaDurata = disegna(i, { salto: salto || Math.abs(passo) !== 1 });
  };
  $('via').onclick = () => vai(i - 1);
  $('poi').onclick = () => vai(i + 1);
  cursore.oninput = e => vai(+e.target.value, true);
  /* Guardando, un fotogramma con delle schede resta il tempo di leggerle:
     i dadi di un test di rotta non si leggono in quattro decimi. E uno
     con una palla di fuoco resta il tempo di vederla arrivare. */
  const sosta = f => (620 + (spiega.checked ? Math.min(4200, schedeDi(f).length * 1300 + (sceltaDi(f) ? 900 : 0)) : 0)
                     + ultimaDurata * .8) / (+velocita.value || 1);
  const play = $('play');
  const ferma = () => { clearTimeout(timer); timer = null; play.textContent = '▶ Guarda'; };
  const avanti = () => {
    if (i >= P.frames.length - 1) return ferma();
    vai(i + 1);
    timer = setTimeout(avanti, sosta(P.frames[i]));
  };
  play.onclick = () => {
    if (timer) return ferma();
    if (i >= P.frames.length - 1) vai(0, true);
    play.textContent = '❚❚ Ferma';
    timer = setTimeout(avanti, 200);
  };
  spiega.onchange = () => disegna(i, { salto: true });
  mostraFoto.onchange = () => { for (const v of vivi.values()) v.key = ''; disegna(i, { salto: true }); };
  effetti.onchange = () => { if (!effetti.checked) pulisciFx(); };
  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input[type=range], select')) return;
    if (e.key === 'ArrowRight'){ e.preventDefault(); vai(i + 1); }
    if (e.key === 'ArrowLeft'){ e.preventDefault(); vai(i - 1); }
    if (e.key === ' ' && !(e.target.closest && e.target.closest('button, summary'))){ e.preventDefault(); play.click(); }
  });
  vai(0, true);
}
