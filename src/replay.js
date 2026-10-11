/* Schieramento Old World — la partita da guardare, il motore
 *
 * Il cuore di `tools/replay.mjs`, senza disco: i fotogrammi presi
 * dall'arbitro, la pagina che li anima e il codice che gira dentro la
 * pagina. Lo usano tutti e due — lo strumento da riga di comando, che
 * scrive la pagina in un file con le foto della cartella, e l'app, che
 * la apre sopra il diario delle partite (`reports.js`) e mentre la sfida
 * si gioca registra i fotogrammi (`controai.js`). Una pagina sola, cosi'
 * una partita guardata da un file e una guardata dall'app sono la
 * stessa cosa.
 *
 * Il resto della storia — perche' una pagina e non un video, le foto,
 * il terreno disegnato, gli effetti — sta in testa a `tools/replay.mjs`.
 */

import { SPIEGA_CSS } from './spiega.js';
import { troopType } from './troops.js';
import * as TR from './terrain.js';
import { motoreFx } from './fxmotore.js';

const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* il modulo delle schede come script qualunque, chiuso in una funzione
   perche' i suoi nomi non urtino quelli della pagina. Il sorgente lo
   passa chi chiama: lo strumento lo legge dal disco, l'app con `fetch`. */
function spiegaNellaPagina(sorgente){
  const src = String(sorgente || "").replace(/^export /gm, "").replace(/<\/script/gi, "<\\/script");
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
export function compatta(meta, frames){
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

/* `spiega` e' il sorgente di `src/spiega.js`. `compattato`: i dati sono
   gia' passati da `compatta` — e' la forma in cui l'app li tiene nel
   diario — e le foto si aggiungono adesso, da chi apre la pagina. */
export function paginaHTML({ meta, frames, spiega = "", compattato = false }){
  const dentro = compattato ? { meta: { foto: {}, ...meta }, frames } : compatta({ foto: {}, ...meta }, frames);
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
      <div class="tip" id="tip" role="tooltip" hidden></div>
    </div>
    <div class="pila" id="pila" aria-live="polite"></div>
    <div class="comandi">
      <div class="barra">
        <button id="via" title="indietro (←)" aria-label="indietro">◀</button>
        <button id="play" class="primario" title="guarda (spazio)">▶ Guarda</button>
        <button id="poi" title="avanti (→)" aria-label="avanti">▶</button>
        <input id="cursore" type="range" min="0" max="${Math.max(0, n - 1)}" value="0" aria-label="fotogramma">
        <span class="stato" id="stato"></span>
        <button id="cinema" title="schermo intero: solo il tavolo e il perché (F)">⛶ Schermo intero</button>
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
${spiegaNellaPagina(spiega)}
${motoreFx.toString()}
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

/* le schede del perché: in una striscia SOTTO il tavolo quelle del
   fotogramma, come i sottotitoli, e nel registro ripiegate sotto la loro
   riga. Prima stavano sopra il campo, in alto a destra, e coprivano
   proprio i pezzi di cui parlavano. La striscia ha un'altezza sua e non
   cambia: il tavolo non salta su e giu' a ogni scheda. */
.pila{ flex:none; height:clamp(92px, 19vh, 176px); display:flex; flex-direction:row; align-items:flex-start;
       gap:8px; overflow-x:auto; overflow-y:hidden; padding:2px 2px 4px; scrollbar-width:thin; }
.pila .sp{ flex:0 0 min(330px, 84%); max-height:100%; overflow:auto; margin:0; animation:entra .3s ease-out both; }
.pila:empty::before{ content:"qui il perché di ogni tiro"; margin:auto; color:var(--muto); font-size:12px; opacity:.6; }
.pila .sp:nth-child(2){ animation-delay:.08s; } .pila .sp:nth-child(3){ animation-delay:.16s; }
.pila .sp:nth-child(4){ animation-delay:.24s; }
.pila .altre{ align-self:center; flex:none; font-size:12px; color:var(--muto); background:var(--carta);
              border:1px solid var(--linea); border-radius:999px; padding:2px 10px; pointer-events:auto; }
@keyframes entra{ from{ opacity:0; transform:translateY(-8px); } to{ opacity:1; transform:none; } }
@media (prefers-reduced-motion: reduce){ .pila .sp{ animation:none; } }

/* SCHERMO INTERO: il tavolo e basta. Via la testata e il registro, i
   comandi in una riga sola in fondo, e quando la partita scorre da sola
   anche quelli spariscono — tornano toccando lo schermo o muovendo il
   mouse. Il resto del buio intorno e' perche' l'occhio stia sul tavolo. */
body.cinema{ background:#13110d; }
body.cinema .testa, body.cinema .colonna{ display:none; }
body.cinema .app{ height:100dvh; }
body.cinema .schermo{ grid-template-columns:1fr; height:100dvh; }
body.cinema .tavolo{ height:100dvh; padding:10px 12px 0; gap:6px; background:#13110d; }
body.cinema .campo-box{ flex:1 1 auto; aspect-ratio:auto; max-height:none; }
body.cinema .pila{ height:clamp(80px, 21vh, 190px); }
body.cinema .pila:empty::before{ color:#a39b8a; }
body.cinema .comandi{ position:static; margin:0 -12px; padding:6px 12px max(8px, env(safe-area-inset-bottom));
  background:#1d1a15; border-top:1px solid #2e2a22; transition:opacity .45s ease; }
body.cinema .stato, body.cinema .seconda{ color:#cfc7b6; }
body.cinema.quieto .comandi{ opacity:0; pointer-events:none; }
body.cinema.quieto{ cursor:none; }
@media (max-width:999px){
  .pila{ height:auto; min-height:84px; max-height:46vh; flex-direction:column; overflow-x:hidden; overflow-y:auto; }
  .pila .sp{ flex:none; max-height:none; }
  body.cinema .pila{ height:clamp(80px, 24vh, 190px); min-height:0; flex-direction:row; overflow-x:auto; overflow-y:hidden; }
  body.cinema .pila .sp{ flex:0 0 min(300px, 86%); max-height:100%; }
}
/* il telefono dritto: il tavolo prende la sua altezza, le schede il resto,
   una sotto l'altra */
@media (orientation:portrait){
  body.cinema .campo-box{ flex:none; aspect-ratio:var(--rapporto); max-height:62vh; }
  body.cinema .pila{ flex:1 1 auto; height:auto; min-height:90px; flex-direction:column; overflow-x:hidden; overflow-y:auto; }
  body.cinema .pila .sp{ flex:none; max-height:none; }
}
/* il telefono girato: il tavolo e' basso, e la striscia gli sta di fianco */
@media (orientation:landscape) and (max-height:560px){
  body.cinema .tavolo{ display:grid; grid-template-columns:minmax(0,1fr) min(300px, 34vw); grid-template-rows:minmax(0,1fr) auto;
    column-gap:10px; }
  body.cinema .campo-box{ grid-column:1; grid-row:1; }
  body.cinema .pila{ grid-column:2; grid-row:1; height:auto; max-height:100%; flex-direction:column; overflow-x:hidden; overflow-y:auto; }
  body.cinema .pila .sp{ flex:none; max-height:none; }
  body.cinema .comandi{ grid-column:1 / -1; grid-row:2; }
}
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
       '<rect x="14" y="3" width="5" height="3" fill="#6a6258" fill-opacity=".45" transform="rotate(20 16 4)"/></pattern>';
  /* i gradienti e il bagliore degli effetti vengono dal motore */
  defs.innerHTML = d + motoreFx().DEFS;

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
    /* la foto gira con la basetta, anche quando il reggimento guarda
       in basso: prima a 90° faceva mezzo giro di colpo per tenere le
       teste in alto, e le foto non seguivano piu' l'unita' */
    let s = '<rect class="acceso" x="' + (-u.w / 2 - 7) + '" y="' + (-u.h / 2 - 7) + '" width="' + (u.w + 14) +
            '" height="' + (u.h + 14) + '" rx="7"/>' +
            '<rect class="corpo" x="' + (-u.w / 2) + '" y="' + (-u.h / 2) + '" width="' + u.w + '" height="' + u.h +
            '" rx="2" fill="' + col + '" fill-opacity="' + (foto && forma ? '.4' : '.85') + '"/>';
    if (forma){
      for (const c of forma){
        const [x, y, w, h, capo, catBase, r] = c;
        /* una basetta senza voce di catalogo prende la foto del pezzo,
           se ne ha una (le foto di riferimento, src/catalog.js) */
        const cat = catBase || (!capo && (PZ[u.id] || {}).k) || '';
        const ph = foto && cat && FOTO[cat];
        s += '<g transform="translate(' + x + ',' + y + ') rotate(' + (r || 0) + ')">';
        if (ph){
          /* le basette lunghe (cavalieri, carri, macchine): la foto e'
             di fianco, e si distende per il lungo con il davanti verso
             il fronte */
          const lunga = h > w * 1.3;
          const iw = lunga ? h : w, ih = lunga ? w : h;
          s += '<use href="#ph-' + cat + '" x="' + (-iw / 2) + '" y="' + (-ih / 2) + '" width="' + iw + '" height="' + ih +
               '"' + (lunga ? ' transform="rotate(-90)"' : '') + '/>' +
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
    return { html: s, key: [u.fo, u.w, u.h, u.a, foto ? 1 : 0].join('|') };
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
     Il motore sta in `src/fxmotore.js`, lo stesso del tavolo dal vivo:
     qui arriva copiato nello <script> accanto a questa funzione.
     ============================================================ */
  const FXM = motoreFx({ strato: lFx, tipoDi: id => (PZ[id] || {}).tp || '',
                         colore: colA, attivo: () => effetti.checked });
  const pulisciFx = FXM.pulisci;
  const giocaEffetti = (f, prima) => FXM.giocaEffetti(f, prima, { ritmo: +velocita.value || 1 });

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
  /* ---- lo schermo intero ----
     Il vero schermo intero quando il browser lo concede (e dentro l'app,
     dove la pagina sta in un riquadro, quando il riquadro lo permette);
     altrimenti — l'iPhone non lo da' a una pagina — la stessa cosa fatta
     con lo stile, che occupa tutta la finestra. Si entra e la partita
     parte; i comandi si nascondono mentre scorre. */
  const btnCinema = $('cinema');
  let quieteTimer = null, veroSchermo = false;
  const inCinema = () => document.body.classList.contains('cinema');
  const sveglia = () => {
    document.body.classList.remove('quieto');
    clearTimeout(quieteTimer);
    if (inCinema()) quieteTimer = setTimeout(() => { if (timer && inCinema()) document.body.classList.add('quieto'); }, 2600);
  };
  const entraCinema = () => {
    document.body.classList.add('cinema');
    btnCinema.textContent = '✕ Esci';
    const el = document.documentElement;
    if (el.requestFullscreen && document.fullscreenEnabled !== false)
      el.requestFullscreen().then(() => { veroSchermo = true; }, () => {});
    if (!timer) play.click();
    sveglia();
  };
  const esciCinema = () => {
    document.body.classList.remove('cinema', 'quieto');
    btnCinema.textContent = '⛶ Schermo intero';
    clearTimeout(quieteTimer);
    if (veroSchermo && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    veroSchermo = false;
  };
  btnCinema.onclick = () => inCinema() ? esciCinema() : entraCinema();
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && veroSchermo){ veroSchermo = false; if (inCinema()) esciCinema(); }
  });
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, sveglia, { passive: true });
  play.addEventListener('click', () => setTimeout(sveglia, 0));

  window.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input[type=range], select')) return;
    if (e.key === 'f' || e.key === 'F'){ e.preventDefault(); btnCinema.click(); }
    if (e.key === 'Escape' && inCinema() && !veroSchermo) esciCinema();
    if (e.key === 'ArrowRight'){ e.preventDefault(); vai(i + 1); }
    if (e.key === 'ArrowLeft'){ e.preventDefault(); vai(i - 1); }
    if (e.key === ' ' && !(e.target.closest && e.target.closest('button, summary'))){ e.preventDefault(); play.click(); }
  });
  vai(0, true);
}
