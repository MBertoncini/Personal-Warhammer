/* Schieramento Old World — il perché, sul tavolo
 *
 * Il registro dell'arbitro dice gia' tutto, ma lo dice in una riga:
 * «Clanrats: Comando 7, 2D6 = 9 e con lo scarto di 3 fa 12 → rompe e
 * fugge». Chi guarda la partita per imparare vede i Clanrats scappare
 * e deve andare a cercare, in mezzo a quaranta righe, quella che dice
 * perché. E la riga mescola tre cose diverse che al tavolo si guardano
 * separate: i dadi usciti, il numero da battere, e le cose che hanno
 * spostato l'uno o l'altro — il generale vicino, il bosco, il Terrore,
 * l'incantesimo.
 *
 * Qui la riga diventa una scheda. L'arbitro, accanto al testo, allega
 * una piccola spiegazione strutturata (`x` sulla riga del registro):
 *
 *   k     che cosa e' successo (rotta, carica, tiro, lancio…)
 *   u     a chi; `uid` e' la sua unita', `su` quella che subisce (il
 *         bersaglio del tiro, chi viene caricato): il tavolo le accende
 *   d     i dadi, se non sono quelli della riga; `via` gli indici di
 *         quelli scartati (il minore della carica, il terzo del Cold
 *         Blooded)
 *   tot   la somma dei dadi tenuti
 *   piu   quello che si somma ai dadi: [{ t, v }]
 *   vs    il numero da battere: { t, v, op } con op "<=", ">=", ">"
 *   passi i tiri in fila, per colpire/ferire/salvare: [{ t, serve, d }]
 *   f     il perché: [{ t, f }], dove f e' la fonte — il profilo, il
 *         generale, una regola speciale, il terreno, la magia…
 *   e     com'e' finita, in parole; `ok` se e' andata bene per chi tira
 *
 * Il modulo e' puro: entra la riga, esce un modello e una stringa di
 * HTML. La sfida sul tavolo (`controai.js`) e la partita da guardare
 * (`tools/replay.mjs`) disegnano la stessa scheda con lo stesso CSS,
 * che sta qui per la stessa ragione.
 */

const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ============================================================
   1 · CHE COSA E' SUCCESSO
   L'icona e il titolo di ogni tipo. Le icone sono segni tipografici e
   non disegni: stanno in qualunque carattere, e in una pagina esportata
   senza rete non manca niente.
   ============================================================ */
export const TIPI = {
  rotta:        { i: "⚑", t: "Test di rotta" },
  panico:       { i: "!", t: "Test di Panico" },
  paura:        { i: "!", t: "Test di Paura" },
  terrore:      { i: "!", t: "Test di Terrore" },
  stupidita:    { i: "?", t: "Stupidità" },
  impeto:       { i: "»", t: "Impetuosità" },
  raduno:       { i: "⚐", t: "Test di Raduno" },
  marcia:       { i: "»", t: "Marcia vicino al nemico" },
  carica:       { i: "⚔", t: "Tiro di carica" },
  fuga:         { i: "↯", t: "Fuga" },
  ripiega:      { i: "↩", t: "Ripiega in ordine" },
  movimento:    { i: "⤳", t: "Movimento a caso" },
  terreno:      { i: "▲", t: "Terreno" },
  pericoloso:   { i: "▲", t: "Terreno pericoloso" },
  tiro:         { i: "➶", t: "Tiro" },
  mischia:      { i: "⚔", t: "Colpi in mischia" },
  risultato:    { i: "⚖", t: "Risultato del combattimento" },
  inseguimento: { i: "»", t: "Inseguimento" },
  lancio:       { i: "✦", t: "Lancio" },
  dissolvi:     { i: "✧", t: "Dissolvimento" },
  fiasco:       { i: "✹", t: "Fiasco" },
  primo:        { i: "⚀", t: "Chi comincia" },
  scelta:       { i: "✎", t: "La scelta" },
};

/* Le fonti: da dove viene una cosa che ha cambiato il risultato. Il
   colore del pallino e' quello che al tavolo si riconosce a colpo
   d'occhio — il verde del bosco, il viola della magia. */
export const FONTI = {
  profilo:  "dal profilo",
  generale: "il generale",
  regola:   "regola speciale",
  terreno:  "terreno",
  magia:    "magia",
  mischia:  "combattimento",
  distanza: "distanza",
  stato:    "stato dell'unità",
  dadi:     "dadi",
};

const OP = { "<=": "≤", ">=": "≥", ">": ">", "<": "<" };

/* ============================================================
   2 · DALLA RIGA ALLA SCHEDA
   ============================================================ */
/* La scheda di una riga del registro, o null se la riga non ne ha una.
   `riga` puo' essere quella dell'arbitro ({ text, dice, page, army, x })
   o quella compatta della partita da guardare ({ t, d, p, x }). */
export function scheda(riga, { army = "" } = {}){
  const r = riga || {};
  const x = r.x;
  if (!x || !x.k) return null;
  const tipo = TIPI[x.k] || { i: "•", t: x.k };
  /* con i passi i dadi stanno gia' ognuno nel suo: la fila intera della
     riga sopra di loro li farebbe vedere due volte */
  const dadi = Array.isArray(x.d) ? x.d : (x.passi && x.passi.length) ? [] : (r.dice || r.d || []);
  return {
    k: x.k, icona: tipo.i, titolo: x.t || tipo.t, chi: x.u || "", uid: x.uid ?? null, su: x.su ?? null,
    army: r.army || army || "",
    dadi: dadi.map(v => +v || 0), via: new Set(x.via || []),
    tot: x.tot, piu: (x.piu || []).filter(m => m && m.v),
    vs: x.vs || null,
    passi: (x.passi || []).filter(p => p && (p.d || []).length),
    fattori: (x.f || []).filter(f => f && f.t),
    esito: x.e || "", ok: x.ok,
    testo: x.testo || "",
    pagina: x.p || r.page || r.p || 0,
  };
}

/* Il totale con i modificatori, quando c'e' qualcosa da sommare. */
export function totale(c){
  if (c.tot == null) return null;
  return c.piu.reduce((s, m) => s + (+m.v || 0), +c.tot || 0);
}

/* ============================================================
   3 · LA SCHEDA IN HTML
   ============================================================ */
const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
/* Un dado: a pallini fino a sei, come quelli veri; un numero se no (un
   D3 letto, un'artiglieria). `stato` e' "si", "no" o "via". */
export function dadoHTML(v, stato = ""){
  const cls = "sp-d" + (stato ? " sp-d-" + stato : "");
  if (Number.isInteger(v) && v >= 1 && v <= 6)
    return `<span class="${cls}" aria-label="${v}">${PIPS[v].map(p => `<i class="sp-p sp-p${p}"></i>`).join("")}</span>`;
  return `<span class="${cls} sp-dn">${esc(v)}</span>`;
}

const segno = v => (v > 0 ? "+" : "−") + Math.abs(v);

function riga_tiro(c){
  if (!c.dadi.length && c.tot == null) return "";
  const pezzi = [];
  if (c.dadi.length)
    pezzi.push(`<span class="sp-dadi">${c.dadi.map((v, i) => dadoHTML(v, c.via.has(i) ? "via" : "")).join("")}</span>`);
  const tot = totale(c);
  if (c.tot != null && (c.dadi.length > 1 || c.via.size || !c.dadi.length))
    pezzi.push(`<span class="sp-eq">=</span><b class="sp-n">${esc(c.tot)}</b>`);
  for (const m of c.piu)
    pezzi.push(`<span class="sp-mod" title="${esc(m.t)}"><b>${segno(+m.v)}</b> ${esc(m.t)}</span>`);
  if (c.piu.length) pezzi.push(`<span class="sp-eq">=</span><b class="sp-n">${esc(tot)}</b>`);
  if (c.vs)
    pezzi.push(`<span class="sp-vs">serve ${OP[c.vs.op] || esc(c.vs.op || "")} <b>${esc(c.vs.v)}</b>` +
               (c.vs.t ? ` <small>${esc(c.vs.t)}</small>` : "") + `</span>`);
  return `<div class="sp-tiro">${pezzi.join("")}</div>`;
}

/* I tiri in fila: una riga per passo, i dadi riusciti accesi. Per un
   tiro salvezza «riuscito» e' il dado che salva: il colore dice chi ha
   avuto fortuna, non chi tirava. */
function righe_passi(c){
  if (!c.passi.length) return "";
  return `<div class="sp-passi">${c.passi.map(p => {
    const serve = +p.serve || 0;
    /* `uno`: contano gli 1, e contano male — il terreno pericoloso */
    const quanti = p.uno ? p.d.filter(v => v === 1).length : serve ? p.d.filter(v => v >= serve).length : null;
    const stato = v => p.uno ? (v === 1 ? "ko" : "no") : serve ? (v >= serve ? "si" : "no") : "";
    return `<div class="sp-passo">
      <span class="sp-pt">${esc(p.t)}${serve ? ` <b>${serve}+</b>` : ""}</span>
      <span class="sp-dadi">${p.d.slice(0, 30).map(v => dadoHTML(v, stato(v))).join("")}${p.d.length > 30 ? `<small>+${p.d.length - 30}</small>` : ""}</span>
      ${quanti != null ? `<span class="sp-q">${quanti}</span>` : ""}
    </div>`;
  }).join("")}</div>`;
}

export function schedaHTML(c, { compatta = false } = {}){
  if (!c) return "";
  const esito = c.ok === true ? "sp-ok" : c.ok === false ? "sp-ko" : "sp-neutro";
  const fattori = c.fattori.length ? `<ul class="sp-f">${c.fattori.map(f =>
    `<li class="sp-f-${esc(f.f || "regola")}" title="${esc(FONTI[f.f] || "")}">${esc(f.t)}</li>`).join("")}</ul>` : "";
  return `<article class="sp ${esito}${compatta ? " sp-compatta" : ""}${c.army ? " sp-" + esc(c.army) : ""}"` +
    `${c.uid != null ? ` data-sp-uid="${esc(c.uid)}"` : ""}${c.su != null ? ` data-sp-su="${esc(c.su)}"` : ""}>
    <header><span class="sp-i" aria-hidden="true">${esc(c.icona)}</span>
      <span class="sp-tt">${esc(c.titolo)}</span>
      ${c.chi ? `<span class="sp-chi">${esc(c.chi)}</span>` : ""}</header>
    ${c.testo ? `<p class="sp-testo">${esc(c.testo)}</p>` : ""}
    ${riga_tiro(c)}${righe_passi(c)}${fattori}
    ${c.esito || c.pagina ? `<footer>${c.esito ? `<b class="sp-e">${c.ok === true ? "✓ " : c.ok === false ? "✗ " : ""}${esc(c.esito)}</b>` : "<span></span>"}
      ${c.pagina ? `<span class="sp-pg">p. ${esc(c.pagina)}</span>` : ""}</footer>` : ""}
  </article>`;
}

/* la scorciatoia: dalla riga all'HTML, vuoto se non c'e' niente */
export const rigaHTML = (riga, opts = {}) => schedaHTML(scheda(riga, opts), opts);

/* ============================================================
   4 · LO STILE
   Un foglio solo per le due case. I colori vengono dai gettoni
   dell'app quando ci sono (chiaro e scuro compresi) e da un ripiego
   color carta nella pagina esportata, che non li ha.
   ============================================================ */
export const SPIEGA_CSS = `
.sp{ --sp-bg: var(--panel, #fffdf8); --sp-ink: var(--ink, #2b2620); --sp-mut: var(--muted, #7d7264);
     --sp-line: var(--line, #d8ccb4); --sp-ok: var(--ok, #4a7346); --sp-bad: var(--bad, #a8332a);
     --sp-soft: var(--panel-2, #f3ecdd); --sp-arm: var(--line-strong, #b9ab90);
     position:relative; background:var(--sp-bg); color:var(--sp-ink); border:1px solid var(--sp-line);
     border-left:4px solid var(--sp-arm); border-radius:10px; padding:8px 10px 7px;
     font:12.5px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; box-shadow:0 1px 2px rgba(0,0,0,.06), 0 8px 22px rgba(0,0,0,.10); }
.sp.sp-A{ --sp-arm: var(--armyA, #c0392b); } .sp.sp-B{ --sp-arm: var(--armyB, #2a6fb0); }
.sp header{ display:flex; align-items:baseline; gap:6px; margin-bottom:4px; min-width:0; }
.sp .sp-i{ display:inline-grid; place-items:center; width:20px; height:20px; border-radius:50%; flex:none;
           background:var(--sp-arm); color:#fff; font-size:12px; font-weight:700; align-self:center; }
.sp .sp-tt{ font-weight:650; white-space:nowrap; }
.sp .sp-chi{ color:var(--sp-mut); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
.sp .sp-testo{ margin:2px 0 4px; font-style:italic; }
.sp .sp-tiro{ display:flex; flex-wrap:wrap; align-items:center; gap:4px 6px; margin:4px 0; }
.sp .sp-dadi{ display:inline-flex; flex-wrap:wrap; gap:3px; }
.sp .sp-d{ display:inline-grid; grid-template:repeat(3,1fr)/repeat(3,1fr); width:20px; height:20px; padding:2.5px;
           border-radius:5px; background:#fbf8f1; border:1px solid #cfc4ae; box-shadow:inset 0 -1.5px 0 rgba(0,0,0,.12); flex:none; }
.sp .sp-d.sp-dn{ display:inline-grid; place-items:center; font:700 11px/1 ui-monospace, Menlo, Consolas, monospace; color:#2b2620; padding:0; }
.sp .sp-p{ width:4px; height:4px; border-radius:50%; background:#2b2620; place-self:center; }
.sp .sp-p1{grid-area:1/1} .sp .sp-p3{grid-area:1/3} .sp .sp-p4{grid-area:2/1} .sp .sp-p5{grid-area:2/2}
.sp .sp-p6{grid-area:2/3} .sp .sp-p7{grid-area:3/1} .sp .sp-p9{grid-area:3/3}
.sp .sp-d-si{ background:#e3f0dc; border-color:#8db27f; }
.sp .sp-d-no{ opacity:.45; }
.sp .sp-d-ko{ background:#f6dcd8; border-color:#c98a80; }
.sp .sp-d-via{ opacity:.35; background:transparent; border-style:dashed; }
.sp .sp-eq{ color:var(--sp-mut); }
.sp .sp-n{ font:700 15px/1 ui-monospace, Menlo, Consolas, monospace; }
.sp .sp-mod{ background:var(--sp-soft); border-radius:999px; padding:1px 8px; white-space:nowrap; max-width:100%;
             overflow:hidden; text-overflow:ellipsis; }
.sp .sp-mod b{ font-family:ui-monospace, Menlo, Consolas, monospace; }
.sp .sp-vs{ margin-left:auto; border:1px solid var(--sp-line); border-radius:6px; padding:1px 7px; white-space:nowrap; }
.sp .sp-vs b{ font:700 14px/1 ui-monospace, Menlo, Consolas, monospace; }
.sp .sp-vs small{ color:var(--sp-mut); }
.sp .sp-passi{ display:flex; flex-direction:column; gap:3px; margin:4px 0; }
.sp .sp-passo{ display:grid; grid-template-columns:86px 1fr auto; align-items:center; gap:6px; }
.sp .sp-pt{ color:var(--sp-mut); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sp .sp-pt b{ color:var(--sp-ink); font-family:ui-monospace, Menlo, Consolas, monospace; }
.sp .sp-q{ font:700 13px/1 ui-monospace, Menlo, Consolas, monospace; min-width:1.5em; text-align:right; }
.sp .sp-passo .sp-d{ width:16px; height:16px; padding:2px; border-radius:4px; }
.sp .sp-passo .sp-p{ width:3px; height:3px; }
.sp .sp-f{ list-style:none; margin:5px 0 2px; padding:0; display:flex; flex-direction:column; gap:2px; }
.sp .sp-f li{ position:relative; padding-left:14px; }
.sp .sp-f li::before{ content:""; position:absolute; left:2px; top:.5em; width:7px; height:7px; border-radius:50%; background:#8d8577; }
.sp .sp-f-generale::before{ background:#b8912a !important; }
.sp .sp-f-regola::before{ background:#3a6ea5 !important; }
.sp .sp-f-terreno::before{ background:#5f8a4c !important; }
.sp .sp-f-magia::before{ background:#8a55b8 !important; }
.sp .sp-f-mischia::before{ background:#b0463a !important; }
.sp .sp-f-distanza::before, .sp .sp-f-stato::before{ background:#8d8577 !important; }
.sp .sp-f-profilo::before{ background:transparent !important; border:1.5px solid #8d8577; width:4px; height:4px; }
.sp footer{ display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-top:5px;
            padding-top:5px; border-top:1px dashed var(--sp-line); }
.sp .sp-e{ font-weight:650; }
.sp.sp-ok .sp-e{ color:var(--sp-ok); } .sp.sp-ko .sp-e{ color:var(--sp-bad); }
.sp .sp-pg{ color:var(--sp-mut); font-size:11px; white-space:nowrap; }
.sp.sp-compatta{ box-shadow:none; padding:6px 8px 5px; }
`;
