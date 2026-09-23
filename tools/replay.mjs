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
 */

import fs from 'node:fs';
import { SPIEGA_CSS } from '../src/spiega.js';

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
};

/* Un fotogramma. `army` e' chi ha appena giocato: lo stato dell'arbitro
   dopo la mossa dice gia' a chi tocca dopo, e durante lo schieramento la
   barra scriveva l'esercito sbagliato accanto a ogni unita' schierata.
   `casella` e `turno` sono quelli in cui la mossa e' stata fatta. */
export function fotogramma(S, { AR, testo = [], chi = "", perche = "", army = null, casella = null, turno = null }){
  return {
    turno: turno != null ? turno : S.turno, army: army || S.army,
    casella: casella != null ? casella : S.schierando ? "schieramento" : (AR.CASELLE[S.casella] || {}).id || "",
    chi, perche, testo,
    /* i personaggi uniti viaggiano dentro il reggimento: disegnarli a
       parte vorrebbe dire due rettangoli uno sull'altro */
    unita: S.units.filter(u => u.placed && !u.dead && AR.unitsOf(S, u.army).includes(u)).map(u => {
      const b = AR.boxOf(u, S.units);
      const fe = AR.feriteDi ? AR.feriteDi(u) : null;
      /* `id` serve alle schede: la scheda accende sul tavolo chi nomina */
      return { id: u.uid, n: u.name, a: u.army, x: Math.round(b.x), y: Math.round(b.y),
               w: Math.round(b.w), h: Math.round(b.h), r: Math.round(u.rot || 0),
               v: Math.max(0, (u.models || 0) - (u.lost || 0)), m: u.models || 0,
               f: u.fled ? 1 : 0,
               c: AR.ingaggiata(S, u) ? 1 : 0,
               /* le ferite del modello in piedi, per chi ne ha piu' di una */
               ...(fe && fe.per > 1 ? { fp: fe.prese, fw: fe.per } : {}) };
    }),
  };
}

/* Due fotogrammi in fila senza niente da leggere e con il tavolo uguale
   sono lo stesso fotogramma: il secondo non si tiene. Erano un terzo
   della partita, e con ▶ sembrava che si fosse fermata. */
export function stessoTavolo(a, b){
  return !!a && !!b && JSON.stringify(a.unita) === JSON.stringify(b.unita);
}

export function paginaHTML({ meta, frames }){
  /* il JSON sta dentro <script>: un «</script>» in una frase del modello
     chiuderebbe il blocco. Il segno di minore scritto con la sua
     sequenza unicode e' lo stesso carattere per JSON e nessun tag per
     la pagina. */
  const dati = JSON.stringify({ meta, frames }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="it">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.titolo)}</title>
<style>
  :root{ --sfondo:#f6f1e6; --carta:#fffdf8; --linea:#d8ccb4; --testo:#2b2620; --muto:#7d7264;
         --A:${COLORI.A}; --B:${COLORI.B}; }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--sfondo); color:var(--testo);
        font:15px/1.5 "Iowan Old Style","Palatino Linotype",Georgia,serif; }
  header{ padding:14px 18px 8px; border-bottom:1px solid var(--linea); background:var(--carta); }
  h1{ margin:0 0 4px; font-size:19px; letter-spacing:.2px; }
  .sotto{ color:var(--muto); font-size:13px; }
  .schermo{ display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:0; height:calc(100vh - 78px); }
  @media (max-width:900px){ .schermo{ grid-template-columns:1fr; height:auto; } }
  .tavolo{ padding:12px 14px; display:flex; flex-direction:column; min-width:0; }
  svg{ width:100%; height:auto; background:${COLORI.tavolo}; border:1px solid var(--linea); border-radius:6px; }
  .barra{ display:flex; gap:8px; align-items:center; padding:10px 2px 2px; }
  .barra input[type=range]{ flex:1; }
  button{ font:inherit; padding:4px 10px; border:1px solid var(--linea); background:var(--carta);
          border-radius:5px; cursor:pointer; color:inherit; }
  button:hover{ background:#f0e8d8; }
  .stato{ font-size:13px; color:var(--muto); min-width:170px; }
  .registro{ border-left:1px solid var(--linea); background:var(--carta); overflow:auto; padding:12px 14px; }
  .riga{ padding:6px 0; border-bottom:1px solid #efe6d5; font-size:13.5px; }
  .riga.ora{ background:#fff6de; margin:0 -14px; padding:6px 14px; }
  .perche{ color:var(--muto); font-style:italic; }
  .pag{ color:var(--muto); font-size:12px; }
  .dadi{ font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12px; color:var(--muto); }
  .dadi b{ font-weight:600; font-family:inherit; }
  .limite{ color:#8a5a1c; }
  .mischia{ stroke:#f5c542; stroke-width:4; }
  /* il testo sta nelle coordinate del tavolo, che sono millimetri:
     nove pixel qui sarebbero invisibili, ventidue sono un pollice scarso */
  .nome{ font-size:22px; fill:#fff; paint-order:stroke; stroke:rgba(0,0,0,.55); stroke-width:5px;
         font-family:system-ui,sans-serif; }
  .fuga{ opacity:.45; }
  .avvisi{ margin:8px 0 0; padding:8px 12px; border:1px solid #e0b872; background:#fff4dc;
            border-radius:5px; color:#6b4410; font-size:13px; }
  .avvisi ul{ margin:4px 0 0; padding-left:18px; }
  footer{ padding:10px 18px; color:var(--muto); font-size:12.5px; border-top:1px solid var(--linea); }
  /* le schede del perché: sopra il tavolo quelle del fotogramma, nel
     registro ripiegate sotto la loro riga */
${SPIEGA_CSS}
  .campo-box{ position:relative; }
  .pila{ position:absolute; top:10px; right:10px; width:min(340px, 48%); display:flex; flex-direction:column;
         gap:8px; pointer-events:none; max-height:calc(100% - 20px); overflow:hidden; }
  .pila .sp{ pointer-events:auto; animation:entra .3s ease-out both; }
  .pila .sp:nth-child(2){ animation-delay:.08s; } .pila .sp:nth-child(3){ animation-delay:.16s; }
  .pila .sp:nth-child(4){ animation-delay:.24s; }
  .pila .altre{ align-self:flex-end; font-size:12px; color:var(--muto); background:var(--carta);
                border:1px solid var(--linea); border-radius:999px; padding:2px 10px; pointer-events:auto; }
  @keyframes entra{ from{ opacity:0; transform:translateY(-8px); } to{ opacity:1; transform:none; } }
  @media (prefers-reduced-motion: reduce){ .pila .sp{ animation:none; } }
  @media (max-width:900px){ .pila{ position:static; width:auto; margin-top:10px; max-height:none; } }
  .acceso{ fill:none; stroke:#f5c542; stroke-width:7; stroke-opacity:.9; }
  .acceso.subisce{ stroke:#f5c542; stroke-dasharray:14 8; stroke-opacity:.8; }
  .barra label{ font-size:13px; color:var(--muto); display:flex; gap:4px; align-items:center; white-space:nowrap; }
  .riga details > summary{ cursor:pointer; list-style:none; }
  .riga details > summary::-webkit-details-marker{ display:none; }
  .riga details > summary::after{ content:" · perché?"; color:var(--muto); font-size:12px; }
  .riga details[open] > summary::after{ content:""; }
  .riga details .sp{ margin:6px 0 6px; }
</style>

<header>
  <h1>${esc(meta.titolo)}</h1>
  <div class="sotto">${esc(meta.sotto)}</div>
  ${(meta.avvisi || []).length ? `<div class="avvisi"><b>Da sapere prima di guardarla:</b>
    <ul>${meta.avvisi.map(a => `<li>${esc(a)}</li>`).join("")}</ul></div>` : ""}
</header>

<div class="schermo">
  <div class="tavolo">
    <div class="campo-box">
      <svg id="campo" viewBox="0 0 ${meta.w} ${meta.h}" role="img" aria-label="il tavolo"></svg>
      <div class="pila" id="pila" aria-live="polite"></div>
    </div>
    <div class="barra">
      <button id="via">◀</button>
      <button id="play">▶ Guarda</button>
      <button id="poi">▶</button>
      <input id="cursore" type="range" min="0" max="${frames.length - 1}" value="0">
      <label title="le schede con i dadi, il numero da battere e il perché, sopra il tavolo"><input type="checkbox" id="spiega" checked> perché</label>
      <span class="stato" id="stato"></span>
    </div>
  </div>
  <div class="registro" id="registro"></div>
</div>

<footer>${esc(meta.piede)}</footer>

<script>
const P = ${dati};
const campo = document.getElementById('campo');
const registro = document.getElementById('registro');
const cursore = document.getElementById('cursore');
const stato = document.getElementById('stato');
const MM = 25.4;
/* il testo del registro e i perché vengono da fuori — i nomi delle
   liste, le frasi del modello — e non devono diventare HTML */
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const dadiDi = r => r.g && r.g.length
  ? r.g.map(x => '<b>' + esc(x.w) + '</b> ' + x.d.join(' ')).join(' · ')
  : (r.d || []).join(' ');

/* il terreno non cambia mai: si disegna una volta */
const fondo = P.meta.terreno.map(t =>
  '<g transform="translate(' + t.x + ',' + t.y + ') rotate(' + (t.rot||0) + ')">' +
  '<rect x="' + (-t.w/2) + '" y="' + (-t.h/2) + '" width="' + t.w + '" height="' + t.h +
  '" rx="6" fill="' + (t.colore || '#ccc') + '" fill-opacity=".55" stroke="#b9ab90"/>' +
  '</g>').join('');

const zone = P.meta.zone.map(z =>
  '<rect x="' + z.x + '" y="' + z.y + '" width="' + z.w + '" height="' + z.h +
  '" fill="none" stroke="' + (z.army === 'A' ? 'var(--A)' : 'var(--B)') +
  '" stroke-dasharray="10 8" stroke-opacity=".35"/>').join('');

${spiegaNellaPagina()}
const pila = document.getElementById('pila');
const spiega = document.getElementById('spiega');
/* le schede di un fotogramma: le righe con una spiegazione, e davanti
   il perché di chi ha scelto la mossa, quando l'ha detto */
const schedeDi = f => f.testo.filter(r => r.x);
const sceltaDi = f => f.perche && !/^passa/.test(f.perche)
  ? { x: { k: 'scelta', t: 'Perché questa mossa', u: f.chi || '', testo: f.perche }, army: f.army } : null;
const MOSTRATE = 3;

function disegna(i){
  const f = P.frames[i];
  const schede = schedeDi(f);
  const mostra = spiega.checked;
  /* chi le schede nominano si accende sul tavolo */
  const accesi = new Set(mostra ? schede.map(r => r.x.uid).filter(v => v != null) : []);
  const colpiti = new Set(mostra ? schede.map(r => r.x.su).filter(v => v != null) : []);
  const pezzi = f.unita.map(u => {
    const col = u.a === 'A' ? 'var(--A)' : 'var(--B)';
    return '<g transform="translate(' + u.x + ',' + u.y + ') rotate(' + u.r + ')"' +
      (u.f ? ' class="fuga"' : '') + '>' +
      (accesi.has(u.id) || colpiti.has(u.id) ? '<rect class="acceso' + (accesi.has(u.id) ? '' : ' subisce') +
        '" x="' + (-u.w/2 - 6) + '" y="' + (-u.h/2 - 6) + '" width="' + (u.w + 12) +
        '" height="' + (u.h + 12) + '" rx="6"/>' : '') +
      '<rect x="' + (-u.w/2) + '" y="' + (-u.h/2) + '" width="' + u.w + '" height="' + u.h +
        '" rx="2" fill="' + col + '" fill-opacity=".85"' +
        (u.c ? ' class="mischia"' : ' stroke="#2b2620" stroke-width="1"') + '/>' +
      /* il fronte: la tacca chiara sul lato che guarda il nemico */
      '<rect x="' + (-u.w/2) + '" y="' + (-u.h/2) + '" width="' + u.w + '" height="3" fill="#fff" fill-opacity=".85"/>' +
      '</g>' +
      '<text class="nome" x="' + u.x + '" y="' + (u.y + 8) + '" text-anchor="middle">' +
        esc(u.n) + (u.m > 1 ? ' ' + u.v + '/' + u.m : '') +
        (u.fw ? ' ♥' + (u.fw - u.fp) + '/' + u.fw : '') + (u.f ? ' ⚑' : '') + (u.c ? ' ⚔' : '') + '</text>';
  }).join('');
  campo.innerHTML = zone + fondo + pezzi;

  /* sopra il tavolo le ultime schede del fotogramma; le altre restano
     nel registro, sotto la loro riga */
  const scelta = sceltaDi(f);
  const sopra = (scelta ? [scelta] : []).concat(schede.slice(-MOSTRATE));
  pila.innerHTML = !mostra ? '' :
    sopra.map(r => SP.rigaHTML(r, { army: r.army || f.army })).join('') +
    (schede.length > MOSTRATE ? '<div class="altre">e altre ' + (schede.length - MOSTRATE) + ' nel registro</div>' : '');

  stato.textContent = 'Turno ' + f.turno + ' · ' + f.casella + ' · ha giocato ' +
    (f.chi || (f.army === 'A' ? P.meta.nomi.A : P.meta.nomi.B)) + ' · ' + (i + 1) + '/' + P.frames.length;
  cursore.value = i;

  /* il registro fino a qui, con l'ultimo acceso */
  const html = [];
  for (let k = Math.max(0, i - 40); k <= i; k++){
    const g = P.frames[k];
    if (!g.testo.length && !g.perche) continue;
    html.push('<div class="riga' + (k === i ? ' ora' : '') + '">' +
      (g.perche ? '<div class="perche">' + (g.chi ? esc(g.chi) + ': ' : '') + esc(g.perche) + '</div>' : '') +
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
  const ora = registro.querySelector('.ora');
  if (ora) ora.scrollIntoView({ block:'nearest' });
}

let i = 0, timer = null;
const vai = n => { i = Math.max(0, Math.min(P.frames.length - 1, n)); disegna(i); };
document.getElementById('via').onclick = () => vai(i - 1);
document.getElementById('poi').onclick = () => vai(i + 1);
cursore.oninput = e => vai(+e.target.value);
/* Guardando, un fotogramma con delle schede resta il tempo di leggerle:
   i dadi di un test di rotta non si leggono in quattro decimi. */
const sosta = f => 420 + (spiega.checked ? Math.min(4200, schedeDi(f).length * 1300 + (sceltaDi(f) ? 900 : 0)) : 0);
const play = document.getElementById('play');
const ferma = () => { clearTimeout(timer); timer = null; play.textContent = '▶ Guarda'; };
const avanti = () => {
  if (i >= P.frames.length - 1) return ferma();
  vai(i + 1);
  timer = setTimeout(avanti, sosta(P.frames[i]));
};
play.onclick = () => {
  if (timer) return ferma();
  play.textContent = '❚❚ Ferma';
  timer = setTimeout(avanti, 200);
};
spiega.onchange = () => disegna(i);
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') vai(i + 1);
  if (e.key === 'ArrowLeft') vai(i - 1);
});
disegna(0);
</script>
</html>`;
}

export const coloreTerreno = kind => COLORI[kind] || "#c8bda8";
