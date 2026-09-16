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
 */

const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* I colori del tavolo vero, così una partita guardata qui e una
   guardata nell'app si somigliano. */
const COLORI = {
  A: "#c0392b", B: "#2a6fb0",
  tavolo: "#efe7d7", linea: "#cdbfa6",
  wood: "#7a9e6a", hill: "#d8c99a", marsh: "#8fa3a8", ruins: "#b7ada0",
  wall: "#9b8f7d", monolith: "#6f6a64", pyramid: "#c9b489", treasure: "#d8b24a",
};

export function fotogramma(S, { AR, testo = [], chi = "", perche = "" }){
  return {
    turno: S.turno, army: S.army,
    casella: S.schierando ? "schieramento" : (AR.CASELLE[S.casella] || {}).id || "",
    chi, perche, testo,
    unita: S.units.filter(u => u.placed && !u.dead).map(u => {
      const b = AR.boxOf(u, S.units);
      return { n: u.name, a: u.army, x: Math.round(b.x), y: Math.round(b.y),
               w: Math.round(b.w), h: Math.round(b.h), r: Math.round(u.rot || 0),
               v: Math.max(0, (u.models || 0) - (u.lost || 0)), m: u.models || 0,
               f: u.fled ? 1 : 0 };
    }),
  };
}

export function paginaHTML({ meta, frames }){
  const dati = JSON.stringify({ meta, frames });
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
  /* il testo sta nelle coordinate del tavolo, che sono millimetri:
     nove pixel qui sarebbero invisibili, ventidue sono un pollice scarso */
  .nome{ font-size:22px; fill:#fff; paint-order:stroke; stroke:rgba(0,0,0,.55); stroke-width:5px;
         font-family:system-ui,sans-serif; }
  .fuga{ opacity:.45; }
  footer{ padding:10px 18px; color:var(--muto); font-size:12.5px; border-top:1px solid var(--linea); }
</style>

<header>
  <h1>${esc(meta.titolo)}</h1>
  <div class="sotto">${esc(meta.sotto)}</div>
</header>

<div class="schermo">
  <div class="tavolo">
    <svg id="campo" viewBox="0 0 ${meta.w} ${meta.h}" role="img" aria-label="il tavolo"></svg>
    <div class="barra">
      <button id="via">◀</button>
      <button id="play">▶ Guarda</button>
      <button id="poi">▶</button>
      <input id="cursore" type="range" min="0" max="${frames.length - 1}" value="0">
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

function disegna(i){
  const f = P.frames[i];
  const pezzi = f.unita.map(u => {
    const col = u.a === 'A' ? 'var(--A)' : 'var(--B)';
    return '<g transform="translate(' + u.x + ',' + u.y + ') rotate(' + u.r + ')"' +
      (u.f ? ' class="fuga"' : '') + '>' +
      '<rect x="' + (-u.w/2) + '" y="' + (-u.h/2) + '" width="' + u.w + '" height="' + u.h +
        '" rx="2" fill="' + col + '" fill-opacity=".85" stroke="#2b2620" stroke-width="1"/>' +
      /* il fronte: la tacca chiara sul lato che guarda il nemico */
      '<rect x="' + (-u.w/2) + '" y="' + (-u.h/2) + '" width="' + u.w + '" height="3" fill="#fff" fill-opacity=".85"/>' +
      '</g>' +
      '<text class="nome" x="' + u.x + '" y="' + (u.y + 8) + '" text-anchor="middle">' +
        u.n.replace(/[&<>]/g, '') + ' ' + u.v + '/' + u.m + (u.f ? ' ⚑' : '') + '</text>';
  }).join('');
  campo.innerHTML = zone + fondo + pezzi;

  stato.textContent = 'Turno ' + f.turno + ' · ' + f.casella + ' · ' + (f.army === 'A' ? P.meta.nomi.A : P.meta.nomi.B);
  cursore.value = i;

  /* il registro fino a qui, con l'ultimo acceso */
  const html = [];
  for (let k = Math.max(0, i - 40); k <= i; k++){
    const g = P.frames[k];
    if (!g.testo.length && !g.perche) continue;
    html.push('<div class="riga' + (k === i ? ' ora' : '') + '">' +
      (g.perche ? '<div class="perche">' + (g.chi ? g.chi + ': ' : '') + g.perche + '</div>' : '') +
      g.testo.map(r => '<div>' + r.t +
        (r.p ? ' <span class="pag">(p. ' + r.p + ')</span>' : '') +
        (r.d ? ' <span class="dadi">[' + r.d.join(' ') + ']</span>' : '') + '</div>').join('') +
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
document.getElementById('play').onclick = e => {
  if (timer){ clearInterval(timer); timer = null; e.target.textContent = '▶ Guarda'; return; }
  e.target.textContent = '❚❚ Ferma';
  timer = setInterval(() => {
    if (i >= P.frames.length - 1){ clearInterval(timer); timer = null; e.target.textContent = '▶ Guarda'; return; }
    vai(i + 1);
  }, 420);
};
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') vai(i + 1);
  if (e.key === 'ArrowLeft') vai(i - 1);
});
disegna(0);
</script>
</html>`;
}

export const coloreTerreno = kind => COLORI[kind] || "#c8bda8";
