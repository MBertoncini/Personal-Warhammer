/* Schieramento Old World — il laboratorio delle liste
 *
 * Le liste cercate a macchina (tools/liste/cerca.mjs) e il torneo fra
 * quelle trovate (tools/liste/torneo.mjs) scrivono i loro file in
 * dati/ricerche/. Questa scheda li legge e risponde alla domanda di chi
 * sceglie uno scenario: su questo tavolo, con quello che ho, quali
 * partite vengono equilibrate e quali a senso unico?
 *
 * Le ricerche non girano qui: una ricerca sono migliaia di partite, e il
 * browser si fermerebbe per un'ora. La scheda scrive il comando, come fa
 * già il Matchup per le partite fra due AI; si lancia nel terminale, e
 * quando ha finito i risultati compaiono qui con «Ricarica».
 */

import { $, esc } from './util.js';
import { copyText } from './share.js';
import { adoptList } from './lists.js';
import { scenariGiocabili } from './controai.js';

const FAZIONI = { skaven: "Skaven", og: "Orchi & Goblin", liz: "Lucertole" };
const POOL = { tutte: "con tutte le unità", collezione: "con la tua collezione", archivio: "dall'archivio" };
/* gli stessi di cerca.mjs: servono per dire quante partite costa */
const SFORZI = {
  rapido:   { popolazione: 8,  generazioni: 4,  celle: 8,  verifica: 1, finaliste: 3 },
  normale:  { popolazione: 10, generazioni: 8,  celle: 12, verifica: 2, finaliste: 4 },
  accurato: { popolazione: 14, generazioni: 12, celle: 18, verifica: 4, finaliste: 5 },
};
const SEI = ["sxmu9q80qdc65", "sxprova-profondo", "sxprova-boschi", "bm-strada", "bm-rovine", "open"];
const TUTTI = "__tutti";
const KEY = "tow-lab";

let v = { punti: 800, scenario: TUTTI, filtro: "tutte", fazione: "tutte", pool: "entrambe", sforzo: "normale", dove: "sei", esempi: "si", capo: "no", sfida: "" };
try { v = { ...v, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { /* la prima volta */ }
const ricorda = () => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* niente */ } };

let docs = null;          // [{ file, doc }] — null finché non si è letto
let caricando = null;

/* dal server, mai dalla cache: il file cambia sotto quando finisce una ricerca */
async function carica(){
  const get = async f => {
    const r = await fetch(`dati/ricerche/${f}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  };
  try {
    const idx = await get("indice.json");
    docs = (await Promise.all((idx.file || []).map(async f => ({ file: f.file, doc: await get(f.file).catch(() => null) }))))
      .filter(x => x.doc);
  } catch { docs = []; }
}

/* ---------------- i conti ---------------- */
const pc = (a, n) => Math.round(100 * a / (n || 1));
const vuoto = () => ({ w: 0, l: 0, d: 0, n: 0 });
const add = (t, c, giro = false) => { t.w += giro ? c.l : c.w; t.l += giro ? c.w : c.l; t.d += c.d; t.n += c.n; return t; };

/* la cella di a contro b, dal punto di vista di a: uno scenario o tutti */
function cella(tor, a, b, sc){
  const t = vuoto();
  for (const s of sc === TUTTI ? tor.scenari.map(x => x.id) : [sc]){
    const c = tor.celle[`${s}|${a}|${b}`], r = tor.celle[`${s}|${b}|${a}`];
    if (c) add(t, c); else if (r) add(t, r, true);
  }
  return t;
}

const ricercheA = p => (docs || []).filter(x => x.doc.formato === "tow-ricerca/1" && x.doc.punti === p)
  .sort((a, b) => Object.keys(FAZIONI).indexOf(a.doc.fazione) - Object.keys(FAZIONI).indexOf(b.doc.fazione) || a.doc.pool.localeCompare(b.doc.pool) || a.file.localeCompare(b.file));
const torneoA = p => ((docs || []).find(x => x.doc.formato === "tow-torneo/1" && x.doc.punti === p) || {}).doc || null;
const giorno = iso => iso ? new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
/* gli scenari: quelli che l'app conosce, e quelli dei file — i tuoi,
   salvati dal tavolo, su un altro browser non ci sono ma i file li
   nominano lo stesso */
function scenariNoti(){
  const out = new Map(scenariGiocabili().map(s => [s.id, s]));
  for (const { doc } of docs || []){
    for (const s of doc.formato === "tow-torneo/1" ? doc.scenari : [])
      if (!out.has(s.id)) out.set(s.id, { id: s.id, label: s.label, pts: s.pts || 0, group: s.group });
    for (const [id, label] of Object.entries(doc.etichette || {}))
      if (!out.has(id)) out.set(id, { id, label, pts: 0, group: "Miei" });
  }
  return [...out.values()];
}
const nomeScenario = id => (scenariNoti().find(s => s.id === id) || {}).label || id;

/* ---------------- la tabella ---------------- */
function tabellaHTML(tor){
  const sc = v.scenario;
  if (sc !== TUTTI && !tor.scenari.some(s => s.id === sc))
    return `<p class="empty">Il torneo a ${tor.punti} punti non ha giocato «${esc(nomeScenario(sc))}». Rifallo con lo scenario dentro: il comando è in fondo alla pagina.</p>`;
  const liste = tor.liste.filter(l => v.filtro === "tutte" || (v.filtro === "collezione" ? l.pool === "collezione" : l.fonte === "ricerca"));
  if (liste.length < 2) return `<p class="empty">Con questo filtro restano ${liste.length} liste: ne servono due.</p>`;

  const intestazione = liste.map((l, j) => `<th scope="col" title="${esc(l.name)}"><span class="lab-col">${j + 1}</span></th>`).join("");
  const righe = liste.map((a, i) => {
    const media = vuoto();
    const celle = liste.map(b => {
      if (a.id === b.id) return `<td class="lab-self" aria-label="stessa lista"></td>`;
      const c = cella(tor, a.id, b.id, sc);
      if (!c.n) return `<td class="lab-na">·</td>`;
      add(media, c);
      const m = (c.w - c.l) / c.n;
      const tono = m >= 0 ? "--lab-pos" : "--lab-neg";
      const forza = Math.round(Math.min(1, Math.abs(m)) * 72);
      return `<td class="lab-cell${c.n < 10 ? " lab-poche" : ""}" style="background:color-mix(in oklab, var(${tono}) ${forza}%, var(--lab-mid))"
        title="${esc(a.name)} contro ${esc(b.name)}: vince ${pc(c.w, c.n)}%, perde ${pc(c.l, c.n)}%, pari ${pc(c.d, c.n)}% — ${c.n} partite"
        ><b>${pc(c.w, c.n)}</b><span>${pc(c.l, c.n)}</span></td>`;
    }).join("");
    return `<tr><th scope="row"><span class="lab-col">${i + 1}</span> ${esc(a.name)} <span class="mono">${a.points} pt</span></th>${celle}
      <td class="lab-media mono">${media.n ? pc(media.w, media.n) + "%" : "–"}</td></tr>`;
  }).join("");

  /* le coppie, dalla più equilibrata a quella a senso unico */
  const coppie = [];
  for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++){
    const c = cella(tor, liste[i].id, liste[j].id, sc);
    if (c.n) coppie.push({ a: liste[i], b: liste[j], c, m: (c.w - c.l) / c.n });
  }
  const riga = ({ a, b, c, m }) => {
    const stesse = a.pool === "collezione" && b.pool === "collezione" && a.fazione === b.fazione;
    const chi = Math.abs(m) < 0.15 ? "" : m > 0 ? ` — meglio ${esc(a.name)}` : ` — meglio ${esc(b.name)}`;
    return `<div class="row u-row">
      <span class="nm"><b><span class="txt">${esc(a.name)} contro ${esc(b.name)}</span></b>
        <span class="mono">${esc(a.name)} vince ${pc(c.w, c.n)}%, ${esc(b.name)} ${pc(c.l, c.n)}%, pari ${pc(c.d, c.n)}% · ${c.n} partite${chi}</span></span>
      <span style="display:flex;gap:4px;align-items:center">
        ${stesse ? `<span class="chip warn" title="le due liste pescano dalle stesse miniature">stesse miniature</span>` : ""}
        ${c.n < 10 ? `<span class="chip warn">poche partite</span>` : ""}
        <button class="btn tiny" data-adotta-coppia="${esc(a.id)}|${esc(b.id)}">Nelle mie liste</button>
      </span></div>`;
  };
  /* equilibrata: fra le vinte dell'una e dell'altra meno di 30 punti */
  const pari = coppie.filter(x => Math.abs(x.m) < 0.3).sort((x, y) => Math.abs(x.m) - Math.abs(y.m)).slice(0, 5);
  const storte = [...coppie].sort((x, y) => Math.abs(y.m) - Math.abs(x.m)).filter(x => Math.abs(x.m) >= 0.4).slice(0, 3);

  return `
    <div class="lab-scroll">
      <table class="lab-tab">
        <thead><tr><th scope="col" class="lab-corner">la riga contro la colonna</th>${intestazione}<th scope="col" class="lab-media">media</th></tr></thead>
        <tbody>${righe}</tbody>
      </table>
    </div>
    <div class="lab-legenda">
      <span><i class="lab-sw" style="background:color-mix(in oklab, var(--lab-pos) 72%, var(--lab-mid))"></i> vince la riga</span>
      <span><i class="lab-sw" style="background:var(--lab-mid)"></i> alla pari</span>
      <span><i class="lab-sw" style="background:color-mix(in oklab, var(--lab-neg) 72%, var(--lab-mid))"></i> vince la colonna</span>
    </div>
    <p class="note">In ogni casella le partite vinte dalla riga e, piccole, quelle perse, in percentuale; il resto sono pareggi. In corsivo le caselle con meno di dieci partite: lì il colore dice poco.</p>
    <div class="panel-title">Le partite più equilibrate</div>
    <div class="tray">${pari.map(riga).join("") || `<p class="empty">Nessuna: su questo scenario ogni coppia ha un favorito netto.</p>`}</div>
    ${storte.length ? `<div class="panel-title">A senso unico</div><div class="tray">${storte.map(riga).join("")}</div>` : ""}`;
}

/* ---------------- quale scenario per ogni sfida ----------------
   La tabella dice chi batte chi su uno scenario. Chi deve giocare una
   sfida precisa ha la domanda rovesciata: queste due liste, su quale
   tavolo vengono alla pari? Per ogni coppia una barra per scenario, che
   parte dal 50% e va verso chi è favorito; lo scenario consigliato è il
   più vicino al 50%, e fra due vicini quello con meno pareggi — una
   partita pari per sei turni di stallo non è una bella serata.

   Due liste della stessa fazione fatte con la collezione non si
   giocano: pescano dalle stesse miniature. Qui non compaiono. */
const quota = c => (c.w + c.d / 2) / c.n;
const EQUA = 0.1, EVITA = 0.25;          // entro 10 punti dal 50% è alla pari; oltre 25 è a senso unico
const punteggio = c => Math.abs(quota(c) - 0.5) + 0.1 * c.d / c.n;
const giocabili = (a, b) => !(a.pool === "collezione" && b.pool === "collezione" && a.fazione && a.fazione === b.fazione);

function sfide(tor, liste){
  const out = [];
  for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++){
    const a = liste[i], b = liste[j];
    if (!giocabili(a, b)) continue;
    const per = tor.scenari.map(s => ({ s, c: cella(tor, a.id, b.id, s.id) })).filter(x => x.c.n);
    if (per.length < 2) continue;
    const best = [...per].sort((x, y) => punteggio(x.c) - punteggio(y.c))[0];
    out.push({ a, b, per, best });
  }
  return out;
}

function scenariHTML(tor, elenco){
  const righe = tor.scenari.map(s => {
    let scarto = 0, k = 0; const t = vuoto();
    for (const { per } of elenco){ const x = per.find(p => p.s.id === s.id); if (x){ scarto += Math.abs(quota(x.c) - 0.5); k++; add(t, x.c); } }
    return k ? { s, scarto: 100 * scarto / k, pari: pc(t.d, t.n), n: t.n, k } : null;
  }).filter(Boolean).sort((x, y) => x.scarto - y.scarto);
  if (!righe.length) return "";
  /* la barra piena è 50 punti: il favorito vince sempre */
  const max = 50;
  return `
    <div class="lab-scen" role="list">
      ${righe.map((r, i) => `<div class="lab-scen-riga" role="listitem"
          title="${esc(r.s.label)}: in media il favorito è a ${Math.round(r.scarto)} punti dal 50%, pareggi ${r.pari}% — ${r.k} sfide, ${r.n} partite">
        <span class="lab-scen-nome">${esc(r.s.label)}${i === 0 ? ` <span class="chip ok">il più equilibrato</span>` : ""}</span>
        <span class="lab-scen-track"><i style="width:${(100 * r.scarto / max).toFixed(1)}%"></i></span>
        <span class="lab-scen-val mono">${Math.round(r.scarto)} punti · pari ${r.pari}%</span>
      </div>`).join("")}
    </div>
    <p class="note">Quanto è lontano dal 50%, in media, il favorito di ogni sfida: barra corta, partite equilibrate; la barra piena sarebbe il favorito che vince sempre. I pareggi a parte, perché una partita che finisce pari non è per forza una partita combattuta.</p>`;
}

function sfidaHTML({ a, b, per, best }){
  const qb = quota(best.c), senza = Math.abs(qb - 0.5) > EQUA;
  const favorita = qb >= 0.5 ? a.name : b.name;
  const barra = ({ s, c }) => {
    const q = quota(c), d = q - 0.5, lontano = Math.abs(d) >= EVITA, scelto = s.id === best.s.id;
    const dove = d >= 0 ? `left:50%;width:${(100 * d).toFixed(1)}%` : `left:${(100 * q).toFixed(1)}%;width:${(-100 * d).toFixed(1)}%`;
    return `<div class="lab-sf-riga${scelto ? " lab-sf-scelto" : ""}${lontano ? " lab-sf-evita" : ""}"
        title="${esc(s.label)}: ${esc(a.name)} vince ${pc(c.w, c.n)}%, ${esc(b.name)} ${pc(c.l, c.n)}%, pari ${pc(c.d, c.n)}% — ${c.n} partite">
      <span class="lab-sf-nome">${esc(s.label)}</span>
      <span class="lab-sf-track"><i class="${d >= 0 ? "pos" : "neg"}" style="${dove}"></i></span>
      <span class="lab-sf-val mono">${pc(c.w, c.n)}–${pc(c.l, c.n)}</span>
      <span class="lab-sf-tag">${scelto ? `<span class="chip ok">consigliato</span>` : lontano ? `<span class="chip warn">a senso unico</span>` : ""}</span>
    </div>`;
  };
  return `
    <div class="lab-sf">
      <div class="lab-sf-head">
        <b>${esc(a.name)} <span class="lab-sf-vs">contro</span> ${esc(b.name)}</b>
        <span class="note">${senza
          ? `Nessuno scenario la porta alla pari: ${esc(favorita)} è favorita ovunque. Il meno sbilanciato è <b>${esc(best.s.label)}</b> (${pc(best.c.w, best.c.n)}–${pc(best.c.l, best.c.n)}).`
          : `Giocatela su <b>${esc(best.s.label)}</b>: ${pc(best.c.w, best.c.n)}–${pc(best.c.l, best.c.n)}, pari ${pc(best.c.d, best.c.n)}%.`}</span>
      </div>
      <div class="lab-sf-chiave"><span><i class="lab-sw neg"></i>meglio ${esc(b.name)}</span><span><i class="lab-sw pos"></i>meglio ${esc(a.name)}</span></div>
      ${per.map(barra).join("")}
    </div>`;
}

function sfideHTML(tor){
  if (tor.scenari.length < 2) return "";
  const liste = tor.liste.filter(l => v.filtro === "tutte" || (v.filtro === "collezione" ? l.pool === "collezione" : l.fonte === "ricerca"));
  const tutte = sfide(tor, liste);
  if (!tutte.length) return "";
  const chi = liste.some(l => l.id === v.sfida) ? v.sfida : "";
  const elenco = chi ? tutte.filter(x => x.a.id === chi || x.b.id === chi) : tutte;
  const n = Math.round(tutte.reduce((s, x) => s + x.per.reduce((t, p) => t + p.c.n, 0) / x.per.length, 0) / tutte.length);
  return `
    <div class="panel-title">Gli scenari, dal più equilibrato</div>
    ${scenariHTML(tor, tutte)}
    <div class="panel-title">Quale scenario per ogni sfida</div>
    <div class="bar">
      <label class="field">Le sfide di
        <select id="lab-sfida">
          <option value="">tutte le liste</option>
          ${liste.map(l => `<option value="${esc(l.id)}" ${l.id === chi ? "selected" : ""}>${esc(l.name)}</option>`).join("")}
        </select></label>
    </div>
    <p class="note">Ogni barra parte dal 50% e va verso chi vince più spesso su quello scenario; i numeri sono le vinte dell'una e dell'altra. Ogni barra sono circa ${n} partite: una sola può sbagliare di una decina di punti, e il consiglio vale come tendenza. Le liste della stessa fazione fatte con la collezione non si affrontano, perché usano le stesse miniature.</p>
    <div class="lab-sfide">${elenco.map(sfidaHTML).join("")}</div>`;
}

/* ---------------- le ricerche ---------------- */
function ricercaHTML({ file, doc }){
  const [best, ...altre] = doc.migliori || [];
  if (!best) return "";
  const vv = best.verifica, sc = v.scenario;
  const suScenario = sc !== TUTTI && doc.scenari.includes(sc);
  const perOpp = suScenario ? doc.contro.map(c => ({ c, t: vv.celle[`${c.id}|${sc}`] })).filter(x => x.t) : [];
  const unita = m => `<ul class="lab-unita">${m.descrizione.split("; ").map(u => `<li>${esc(u)}</li>`).join("")}</ul>`;
  return `
    <div class="lab-card">
      <div class="lab-card-head">
        <b>${esc(doc.nome)} · ${POOL[doc.pool] || esc(doc.pool)}</b>
        <span class="mono">${giorno(doc.quando)} · ${esc(doc.sforzo)} · ${doc.partite} partite · ${doc.scenari.length === 1 ? esc(nomeScenario(doc.scenari[0])) : doc.scenari.length + " scenari"}</span>
      </div>
      <div class="readout"><span>La migliore, ${best.punti} pt</span>
        <b>vince ${pc(vv.w, vv.n)}% · perde ${pc(vv.l, vv.n)}% <span class="mono">(${vv.n} partite di verifica)</span></b></div>
      ${suScenario ? `<div class="readout"><span>Su ${esc(nomeScenario(sc))}</span><b>vince ${pc(vv.perScenario[sc].w, vv.perScenario[sc].n)}% · perde ${pc(vv.perScenario[sc].l, vv.perScenario[sc].n)}%</b></div>` :
        sc !== TUTTI ? `<p class="note">Questa ricerca non ha giocato «${esc(nomeScenario(sc))}»: la tabella del torneo sì, se c'era.</p>` : ""}
      ${unita(best)}
      ${perOpp.length ? `<div class="lab-opp">${perOpp.map(({ c, t }) => `<span class="chip ${t.w > t.l ? "ok" : t.w < t.l ? "bad" : ""}" title="${t.n} partite">${esc(c.name)} ${pc(t.w, t.n)}/${pc(t.l, t.n)}</span>`).join("")}</div>` : ""}
      ${Object.keys(vv.fuori || {}).length ? `<p class="note" style="color:var(--warn)">Rimaste fuori dallo schieramento: ${Object.entries(vv.fuori).map(([k, q]) => `${esc(k)} ${q} volte`).join(", ")}.</p>` : ""}
      <div class="grid2"><button class="btn primary" data-adotta="${esc(file)}|0">Aggiungi alle mie liste</button>
        <span class="note" style="align-self:center">Poi la trovi in Liste e nel Matchup.</span></div>
      ${altre.length ? `<details><summary class="note">Le altre finaliste (${altre.length})</summary>
        ${altre.map((m, i) => `<div class="lab-alt"><div class="readout"><span>${m.punti} pt</span><b>vince ${pc(m.verifica.w, m.verifica.n)}% · perde ${pc(m.verifica.l, m.verifica.n)}%</b></div>
          ${unita(m)}<button class="btn tiny" data-adotta="${esc(file)}|${i + 1}">Aggiungi alle mie liste</button></div>`).join("")}</details>` : ""}
      <details><summary class="note">Contro chi ha giocato, e con cosa</summary>
        <p class="note">Avversari: ${doc.contro.map(c => `${esc(c.name)}${c.fonte === "ricerca" ? " (trovata)" : ""}`).join(", ")}.</p>
        <p class="note">Unità provate: ${doc.unita.map(esc).join(", ")}.</p>
        ${doc.escluse.length ? `<p class="note">Rimaste fuori: ${doc.escluse.map(e => `${esc(e.pezzo)} (${esc(e.perche)})`).join("; ")}.</p>` : ""}
        <p class="note">Andamento, la prima in classifica a ogni generazione: ${doc.storia.map(s => `${s.migliore}%`).join(" → ")}.</p>
      </details>
      ${(doc.provate || []).length ? `<details><summary class="note">Le unità: quante volte provate, e come sono andate</summary>
        <p class="note">Per ogni unità, in quante liste la ricerca l'ha messa e la media dei risultati di quelle liste (le vinte, più metà dei pareggi). Un'unità che manca dalle migliori con tante liste alle spalle è andata male; con zero o una non è stata provata abbastanza.</p>
        <div class="tray">${doc.provate.map(t => `<div class="row u-row"><span class="nm"><b><span class="txt">${esc(t.nome)}</span></b>
          <span class="mono">${t.liste ? `${t.liste} liste · ${t.partite} partite${t.finaliste ? ` · in ${t.finaliste} finaliste` : ""}` : "mai provata"}</span></span>
          <span class="chip ${t.media == null ? "idle" : ""}">${t.media == null ? "–" : t.media + "%"}</span></div>`).join("")}</div></details>` : ""}
    </div>`;
}

/* ---------------- i comandi ---------------- */
function comandi(tor){
  const scen = v.dove === "sei" ? SEI : v.dove === "tutti" ? scenariNoti().map(s => s.id) : [v.scenario === TUTTI ? "bm-strada" : v.scenario];
  const arg = v.dove === "sei" ? "" : v.dove === "tutti" ? " --scenari tutti" : ` --scenari ${scen[0]}`;
  const cerca = `node tools/liste/cerca.mjs --fazione ${v.fazione} --pool ${v.pool} --punti ${v.punti}${arg} --sforzo ${v.sforzo}` +
                (v.esempi === "no" ? " --senza-esempi" : "") + (v.capo === "si" ? " --da-capo" : "");
  const nScen = scenariNoti().length;
  const torneo = `node tools/liste/torneo.mjs --punti ${v.punti}`;
  /* la stima: gli avversari sono le liste d'archivio vicine ai punti e le
     migliori delle altre fazioni, fino a dieci */
  const nf = v.fazione === "tutte" ? 3 : 1, np = v.pool === "entrambe" ? 2 : 1;
  const avv = Math.min(10, 6 + (ricercheA(v.punti).length ? 3 : 0));
  const p = SFORZI[v.sforzo], celle = avv * scen.length;
  const perRicerca = 2 * ((p.popolazione * p.generazioni + 12) * Math.min(p.celle, celle) + p.finaliste * celle * p.verifica);
  const quanteDopo = Math.max(ricercheA(v.punti).length, nf * np);
  const perTorneo = quanteDopo * (quanteDopo - 1) / 2 * nScen * 5 * 2;
  const tot = nf * np * perRicerca + perTorneo;
  return { testo: `${cerca}\n${torneo}`, tot, minuti: Math.round(tot / 2.5 / 60), vecchio: tor && ricercheA(v.punti).some(x => x.doc.quando > tor.quando) };
}

function comandiHTML(tor){
  const sel = (id, val, opts) => `<select id="${id}">${opts.map(([k, t]) => `<option value="${k}" ${k === val ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  const c = comandi(tor);
  return `
    <div class="panel-title">Lancia una ricerca</div>
    <p class="note">Nel terminale, dalla cartella del progetto. La ricerca cerca le liste; il torneo le fa giocare tutte contro tutte su ogni scenario ed è la tabella qui sopra. Quando hanno finito, <b>Ricarica</b>.</p>
    <div class="grid2">
      <label class="field">Fazione${sel("lab-fz", v.fazione, [["tutte", "Tutte e tre"], ...Object.entries(FAZIONI)])}</label>
      <label class="field">Unità${sel("lab-pool", v.pool, [["entrambe", "Tutte, e la mia collezione"], ["tutte", "Tutte quelle che si sanno costruire"], ["collezione", "Solo la mia collezione"]])}</label>
      <label class="field">Scenari su cui cercarla${sel("lab-dove", v.dove, [["sei", "I sei di prova (una lista buona ovunque)"], ["questo", "Solo lo scenario scelto"], ["tutti", "Tutti gli scenari"]])}</label>
      <label class="field">Sforzo${sel("lab-sforzo", v.sforzo, [["rapido", "Rapido"], ["normale", "Normale"], ["accurato", "Accurato"]])}</label>
      <label class="field">Liste note (esempi.mjs)${sel("lab-esempi", v.esempi, [["si", "Anche da loro"], ["no", "Senza: solo liste a tema e a caso"]])}</label>
      <label class="field">Ricerca di prima${sel("lab-capo", v.capo, [["no", "Riparti dalle sue migliori"], ["si", "Buttala: da capo"]])}</label>
    </div>
    <pre class="mono lab-cmd" id="lab-cmd">${esc(c.testo)}</pre>
    <p class="note">Circa ${c.tot.toLocaleString("it-IT")} partite in tutto: a due o tre al secondo, ${c.minuti < 90 ? `un'ora scarsa o meno (${c.minuti} minuti)` : `${Math.round(c.minuti / 60)} ore`}.
      Rifare la ricerca riparte dalle liste migliori della volta prima, contro quello che le altre fazioni hanno trovato nel frattempo.
      La collezione è quella di <span class="mono">dati/catalogo.json</span>, cioè com'era all'ultimo Archivio.</p>
    <button class="btn primary" id="lab-copia" style="width:100%">Copia i comandi</button>
    ${c.vecchio ? `<p class="note" style="color:var(--warn)">Il torneo a ${v.punti} punti è più vecchio di almeno una ricerca: la tabella non ha ancora le liste nuove. Basta la seconda riga.</p>` : ""}`;
}

/* ---------------- la scheda ---------------- */
export async function renderLaboratorio(){
  const host = $("#laboratorio");
  if (!host) return;
  if (!docs){
    host.innerHTML = `<p class="empty">Leggo dati/ricerche…</p>`;
    await (caricando ||= carica());
    caricando = null;
  }
  const puntiNoti = [...new Set([...(docs || []).map(x => x.doc.punti), v.punti])].sort((a, b) => a - b);
  const tor = torneoA(v.punti), ric = ricercheA(v.punti);
  const scenari = scenariNoti();
  const sc = scenari.find(s => s.id === v.scenario);
  const conDati = new Set(tor ? tor.scenari.map(s => s.id) : []);

  host.innerHTML = `
    <div class="bar">
      <label class="field">Scenario
        <select id="lab-sc">
          <option value="${TUTTI}" ${v.scenario === TUTTI ? "selected" : ""}>Tutti gli scenari insieme</option>
          ${scenari.map(s => `<option value="${esc(s.id)}" ${s.id === v.scenario ? "selected" : ""}>${esc(s.label)}${s.pts ? ` · ${s.pts} pt` : ""}${tor && !conDati.has(s.id) ? " (non giocato)" : ""}</option>`).join("")}
        </select></label>
      <label class="field">Punti
        <select id="lab-pt">${puntiNoti.map(p => `<option ${p === v.punti ? "selected" : ""}>${p}</option>`).join("")}</select></label>
      <label class="field">Liste
        <select id="lab-filtro">
          <option value="tutte" ${v.filtro === "tutte" ? "selected" : ""}>Tutte</option>
          <option value="collezione" ${v.filtro === "collezione" ? "selected" : ""}>Solo quelle che la mia collezione schiera</option>
          <option value="ricerca" ${v.filtro === "ricerca" ? "selected" : ""}>Solo quelle trovate</option>
        </select></label>
      <button class="btn" id="lab-ricarica" style="align-self:flex-end">Ricarica</button>
    </div>
    ${sc && sc.pts && sc.pts !== v.punti ? `<p class="note">«${esc(sc.label)}» è pensato per ${sc.pts} punti. <button class="btn tiny" id="lab-usa-pt">Guarda a ${sc.pts}</button></p>` : ""}

    <div class="panel-title">Chi batte chi${v.scenario === TUTTI ? ", su tutti gli scenari" : ` su «${esc(sc ? sc.label : v.scenario)}»`}</div>
    ${tor ? `<p class="note mono">torneo del ${giorno(tor.quando)} · ${tor.liste.length} liste · ${tor.partite} partite · ${tor.semi * 2} per coppia e scenario</p>${tabellaHTML(tor)}`
          : `<p class="empty">Non c'è ancora un torneo a ${v.punti} punti${ric.length ? "" : ", e nemmeno una ricerca"}: i comandi sono qui sotto.</p>`}
    ${tor ? sfideHTML(tor) : ""}

    <div class="panel-title">Le liste trovate a ${v.punti} punti</div>
    ${ric.length ? `<div class="lab-cards">${ric.map(ricercaHTML).join("")}</div>` : `<p class="empty">Nessuna ricerca a ${v.punti} punti.</p>`}

    ${comandiHTML(tor)}`;

  const cambia = (id, k, num = false) => { const el = $(id); if (el) el.addEventListener("change", () => { v[k] = num ? +el.value : el.value; ricorda(); renderLaboratorio(); }); };
  cambia("#lab-sc", "scenario"); cambia("#lab-pt", "punti", true); cambia("#lab-filtro", "filtro");
  cambia("#lab-fz", "fazione"); cambia("#lab-pool", "pool"); cambia("#lab-dove", "dove"); cambia("#lab-sforzo", "sforzo");
  cambia("#lab-esempi", "esempi"); cambia("#lab-capo", "capo"); cambia("#lab-sfida", "sfida");
  const usa = $("#lab-usa-pt");
  if (usa) usa.addEventListener("click", () => { v.punti = sc.pts; ricorda(); renderLaboratorio(); });
  $("#lab-ricarica").addEventListener("click", async () => { docs = null; await renderLaboratorio(); });
  $("#lab-copia").addEventListener("click", async e => {
    const ok = await copyText($("#lab-cmd").textContent);
    e.target.textContent = ok ? "Comandi copiati ✓" : "Non riesco a copiare";
    setTimeout(() => { e.target.textContent = "Copia i comandi"; }, 2200);
  });

  /* nelle mie liste: una finalista, o le due liste di una coppia */
  const listaDi = id => {
    for (const { doc } of docs) for (const m of doc.migliori || []) if (m.lista && m.lista.id === id) return m.lista;
    return null;
  };
  const adotta = async (liste, btn) => {
    const fatte = [];
    for (const l of liste) fatte.push(await adoptList(l));
    btn.textContent = fatte.every(f => !f.nuova) ? "Le avevi già ✓" : "Aggiunta ✓";
    btn.disabled = true;
  };
  host.querySelectorAll("[data-adotta]").forEach(b => b.addEventListener("click", () => {
    const [file, i] = b.dataset.adotta.split("|");
    const d = docs.find(x => x.file === file);
    if (d) adotta([d.doc.migliori[+i].lista], b);
  }));
  host.querySelectorAll("[data-adotta-coppia]").forEach(b => {
    const liste = b.dataset.adottaCoppia.split("|").map(listaDi);
    /* le liste dell'archivio sono già nelle tue */
    if (liste.every(l => !l)){ b.remove(); return; }
    b.addEventListener("click", () => adotta(liste.filter(Boolean), b));
  });
}
