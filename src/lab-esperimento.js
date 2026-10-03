/* Schieramento Old World — il Laboratorio, dalla pagina
 *
 * Prima il Laboratorio leggeva le ricerche fatte nel terminale e
 * scriveva il comando per farne altre. Qui le ricerche si configurano e
 * si lanciano dalla pagina, nei Web Worker (lab-motore.js), con lo
 * stesso giro di generazioni del terminale (cerca.js). Il terminale
 * resta per le ricerche lunghe — una notte intera, con tutti i
 * processori — e i suoi file si leggono come prima.
 *
 * Quattro domande, una per tipo di esperimento:
 *
 *   UNA LISTA      — la migliore di una fazione contro avversari scelti:
 *                    liste dell'archivio, liste trovate, o un
 *                    campionario a caso di un'altra fazione. Più forte o
 *                    più equilibrata;
 *   UNA SFIDA      — due liste, una per parte, che si battono alla pari:
 *                    la partita nuova per stasera;
 *   UN TAVOLO      — due liste date, e il tavolo su cui vengono alla
 *                    pari, fra tavoli generati (terreno-casuale.js);
 *   UN TORNEO      — tutte contro tutte fra liste scelte, su ogni scenario.
 *
 * Ogni parte (la fazione che si cerca, e nella sfida anche l'altra) ha
 * le sue unità, una per riga, con quattro scelte: NO (mai), LIBERA (come
 * capita), SÌ (almeno una) e TANTE (almeno due, e reggimenti grandi), e
 * sotto i numeri per chi li vuole precisi. È il «tema» di cerca.mjs
 * (--con, --senza), scritto unità per unità: src/spazio.js, `limiti`.
 *
 * Il gioco si sceglie: i punti, il formato (Battle March o il libro
 * base, anche contro quello che lo scenario direbbe), la durata, gli
 * scenari — quelli noti e quelli generati col seme.
 *
 * I risultati restano nell'archivio del browser (`lab:esp:<id>`, uno per
 * esperimento), e la Nuvola li porta con sé come il resto.
 */

import { $, esc } from './util.js';
import { allLists, adoptList } from './lists.js';
import { catalogAll } from './catalog.js';
import * as MG from './magic.js';
import { usaArchivio } from './costruttori.js';
import { spazio, FAZIONI, fazioneDi, usaDatiSpazio } from './spazio.js';
import { SFORZI, stimaPartite, stimaCoppia, cercaLista, cercaCoppia, cercaScenario, torneo,
         OBIETTIVI, lettura, generatore } from './cerca.js';
import { apriMotoreWeb, lavoriDefault } from './lab-motore.js';
import { FORMATI, DURATE } from './lab-partite.js';
import { scenarioCasuale, TAVOLI, SCHIERAMENTI, DENSITA, MISCELE, CENTRI } from './terreno-casuale.js';
import { SCENARIOS, geometry } from './scenarios.js';
import { customScenarioMap, saveCustom } from './scenariokit.js';
import { loadDoc, saveDoc, deleteDoc, listKeys } from './store.js';
import { startSfida, inCorso } from './controai.js';
import { emit } from './bus.js';
import { askConfirm } from './uikit.js';

const KEY = "tow-lab-esp";
const PREFISSO = "lab:esp:";
const SEI = ["sxmu9q80qdc65", "sxprova-profondo", "sxprova-boschi", "bm-strada", "bm-rovine", "open"];
export const TIPI = {
  lista:    { label: "Una lista", spiega: "La lista migliore di una fazione contro gli avversari che scegli." },
  coppia:   { label: "Una sfida alla pari", spiega: "Due liste, una per parte, che si battono alla pari: la partita nuova per stasera." },
  scenario: { label: "Un tavolo per una sfida", spiega: "Due liste date, e il tavolo su cui vengono alla pari, fra tavoli generati." },
  torneo:   { label: "Un torneo", spiega: "Tutte contro tutte fra le liste che scegli, su ogni scenario." },
};
const POOL = { collezione: "solo la mia collezione", tutte: "tutte le unità che si sanno costruire" };
const STATI = [["no", "No"], ["libera", "Libera"], ["si", "Sì"], ["tante", "Tante"]];

/* ---------------- la configurazione, ricordata ---------------- */
const parteVuota = fazione => ({ fazione, pool: "collezione", limiti: {} });
const DEFAULT = {
  tipo: "lista", punti: 1000, margine: "",
  A: parteVuota("skaven"), B: parteVuota("liz"),
  avversari: { fonte: "auto", scelte: [], campionario: 6, vicine: true },
  obiettivo: "forte", formato: "scenario", durata: "",
  scenari: SEI.slice(),
  gen: { quanti: 0, seme: 4001, tavolo: "caso", deploy: "caso", densita: "caso", miscela: "caso", centro: "caso", tesori: "caso" },
  sforzo: "rapido", seme: 1001, lavori: 0, esempi: true, varieta: false,
  sfida: { x: "", y: "", tavoli: 12, conScelti: true },
  torneo: { liste: [], semi: 2 },
};
let cfg = structuredClone(DEFAULT);
try {
  const s = JSON.parse(localStorage.getItem(KEY) || "{}");
  cfg = { ...cfg, ...s, A: { ...cfg.A, ...(s.A || {}) }, B: { ...cfg.B, ...(s.B || {}) },
          avversari: { ...cfg.avversari, ...(s.avversari || {}) }, gen: { ...cfg.gen, ...(s.gen || {}) },
          sfida: { ...cfg.sfida, ...(s.sfida || {}) }, torneo: { ...cfg.torneo, ...(s.torneo || {}) } };
} catch { /* la prima volta */ }
const ricorda = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* niente */ } };

/* la velocità vista l'ultima volta, partite al secondo per lavoratore:
   serve alla stima, e la prima volta è quella di un portatile */
const velocita = () => { try { return +localStorage.getItem("tow-lab-vel") || 0.3; } catch { return 0.3; } };
const ricordaVelocita = v => { try { if (v > 0.01 && v < 50) localStorage.setItem("tow-lab-vel", v.toFixed(3)); } catch { /* niente */ } };

/* ---------------- il contesto: liste, collezione, maghi ---------------- */
async function contesto(){
  if (!MG.magicNow()) await MG.loadMagic();
  usaArchivio(allLists());
  const m = MG.magicNow() || {};
  usaDatiSpazio({ catalogo: catalogAll(), magia: { domini: m.lores || [], maghi: m.wizards || [] } });
}
const margineDi = () => cfg.margine === "" || cfg.margine == null ? null : Math.max(0, +cfg.margine || 0);
const spazioDi = (parte, limiti = parte.limiti) =>
  spazio(parte.fazione, { pool: parte.pool, punti: cfg.punti, margine: margineDi(), limiti: limiti || {} });

/* ---------------- gli scenari ---------------- */
const giocabile = s => s && s.table && s.deploy;
function scenariNoti(){
  return Object.entries({ ...SCENARIOS, ...customScenarioMap() }).filter(([, s]) => giocabile(s))
    .map(([id, s]) => ({ id, ...s }));
}
/* i tavoli generati: nella ricerca di un tavolo per una sfida sono
   quanti ne chiede la sfida, altrimenti quelli in più sugli scenari */
const quantiGenerati = () => Math.max(0, (cfg.tipo === "scenario" ? cfg.sfida.tavoli : cfg.gen.quanti) | 0);
const tavoloGenerato = i => scenarioCasuale((cfg.gen.seme | 0) + i, cfg.gen);
const generati = () => cfg.tipo === "scenario" ? [] : Array.from({ length: quantiGenerati() }, (_, i) => tavoloGenerato(i));
/* la mappa id -> scheda di tutto quello che una ricerca gioca */
function scenariDellaRicerca(){
  const noti = Object.fromEntries(scenariNoti().map(s => [s.id, s]));
  const out = {};
  for (const id of cfg.scenari) if (noti[id]) out[id] = noti[id];
  for (const g of generati()) out[g.id] = g;
  return out;
}

/* ---------------- le liste che si possono scegliere ---------------- */
let fileDocs = [];             // dati/ricerche, letti da laboratorio.js
export const usaFileRicerche = docs => { fileDocs = docs || []; };
let miei = null;               // gli esperimenti salvati nel browser

async function caricaMiei(){
  const keys = (await listKeys(PREFISSO)).sort().reverse();
  miei = (await Promise.all(keys.map(k => loadDoc(k, null)))).filter(Boolean)
    .sort((a, b) => String(b.quando).localeCompare(String(a.quando)));
  return miei;
}
export const esperimenti = () => miei || [];

function listeNote(){
  const out = [], visti = new Set();
  /* `prima`: la migliore della sua ricerca — gli avversari automatici
     prendono solo quelle, come fa il terminale (ricerche.mjs, campioni) */
  const metti = (lista, fonte, prima = false) => {
    if (!lista || !(lista.units || []).length || visti.has(lista.id)) return;
    visti.add(lista.id);
    out.push({ id: lista.id, name: lista.name, fonte, prima, fazione: fazioneDi((lista.info || {}).catalogue), points: lista.points, lista });
  };
  for (const l of allLists()) metti(l, "archivio");
  for (const e of miei || []){
    for (const [i, m] of ((e.lista && e.lista.migliori) || []).entries()) metti(m.lista, "laboratorio", i === 0);
    for (const c of (e.coppia && e.coppia.coppie) || []){ metti(c.listaA, "laboratorio"); metti(c.listaB, "laboratorio"); }
  }
  for (const { doc } of fileDocs) for (const [i, m] of ((doc.formato === "tow-ricerca/1" && doc.migliori) || []).entries()) metti(m.lista, "ricerca", i === 0);
  return out;
}
const SIGLA = f => (FAZIONI[f] || {}).sigla || "?";
const FONTE = { archivio: "archivio", laboratorio: "laboratorio", ricerca: "ricerca" };
const vicina = l => Math.abs((l.points || 0) - cfg.punti) <= cfg.punti * 0.1;

/* ---------------- le unità di una parte ---------------- */
function statoDi(v, lim = {}){
  if (lim.max === 0) return "no";
  if ((lim.min | 0) >= 2 || (v.n && Array.isArray(lim.n) && lim.n[0] > v.n[0])) return "tante";
  if ((lim.min | 0) >= 1) return "si";
  return "libera";
}
function limitePer(v, stato){
  if (stato === "no") return { max: 0 };
  if (stato === "si") return { min: 1 };
  if (stato === "tante"){
    const l = { min: Math.min(v.max, 2) };
    if (v.n) l.n = [Math.ceil((v.n[0] + v.n[1]) / 2), v.n[1]];
    return l;
  }
  return null;
}

function parteHTML(chi, titolo){
  const p = cfg[chi];
  let S0;
  try { S0 = spazio(p.fazione, { pool: p.pool, punti: cfg.punti, margine: margineDi() }); }
  catch (e){ return `<p class="empty">${esc(e.message)}</p>`; }
  let S = null, err = "";
  try { S = spazioDi(p); } catch (e){ err = e.message; }
  const righe = S0.voci.map(v => {
    const lim = p.limiti[v.k] || {}, st = statoDi(v, lim);
    const isChar = /Characters/.test(v.slot);
    return `<div class="lab-u${st === "no" ? " lab-u-no" : ""}" data-parte="${chi}" data-k="${esc(v.k)}">
      <span class="lab-u-nome"><b>${esc(v.nome)}</b>
        <span class="mono">${esc(isChar ? "personaggio" : ({ Core: "base", Special: "speciale", Rare: "rara" })[v.slot] || v.slot)} · fino a ${v.max}${v.n ? ` · ${v.n[0]}–${v.n[1]} modelli` : ""}</span></span>
      <span class="group lab-u-stato" role="group" aria-label="${esc(v.nome)}">${STATI.map(([k, t]) =>
        `<button class="btn tiny${st === k ? " on" : ""}" data-stato="${k}" aria-pressed="${st === k}">${t}</button>`).join("")}</span>
      <span class="lab-u-num">
        <label title="quante unità, al minimo e al massimo">unità <input type="number" min="0" max="${v.max}" value="${lim.min ?? ""}" placeholder="0" data-lim="min">–<input type="number" min="0" max="${v.max}" value="${lim.max ?? ""}" placeholder="${v.max}" data-lim="max"></label>
        ${v.n ? `<label title="quanti modelli per reggimento">modelli <input type="number" min="${v.n[0]}" max="${v.n[1]}" value="${(lim.n || [])[0] ?? ""}" placeholder="${v.n[0]}" data-lim="n0">–<input type="number" min="${v.n[0]}" max="${v.n[1]}" value="${(lim.n || [])[1] ?? ""}" placeholder="${v.n[1]}" data-lim="n1"></label>` : ""}
      </span>
    </div>`;
  }).join("");
  const imp = S ? S.impossibile : [];
  return `
    <div class="lab-parte">
      <div class="lab-parte-head">
        <b>${esc(titolo)}</b>
        <label class="field">Fazione<select data-parte-fz="${chi}">${Object.entries(FAZIONI).map(([k, f]) =>
          `<option value="${k}" ${k === p.fazione ? "selected" : ""}>${esc(f.nome)}</option>`).join("")}</select></label>
        <label class="field">Unità<select data-parte-pool="${chi}">${Object.entries(POOL).map(([k, t]) =>
          `<option value="${k}" ${k === p.pool ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
        <button class="btn tiny ghost" data-parte-azzera="${chi}" title="tutte le unità tornano libere">Tutte libere</button>
      </div>
      <p class="note">Per ogni unità: <b>No</b> non entra mai, <b>Libera</b> come capita, <b>Sì</b> almeno una, <b>Tante</b> almeno due e reggimenti grandi. I numeri accanto li precisano; vuoti, vale quello che il libro e le miniature permettono.</p>
      <div class="lab-unita-tab">${righe}</div>
      ${err ? `<p class="note warn">${esc(err)}</p>` : ""}
      ${imp.length ? `<p class="note warn">Con questi limiti non si scrive nessuna lista: ${imp.map(esc).join("; ")}.</p>` : ""}
      ${S0.escluse.length ? `<details><summary class="note">Non disponibili (${S0.escluse.length})</summary>
        <p class="note">${S0.escluse.map(e => `${esc(e.pezzo)}: ${esc(e.perche)}`).join("; ")}.</p></details>` : ""}
    </div>`;
}

/* ---------------- il gioco: punti, formato, scenari ---------------- */
const sel = (id, val, opts, attr = "") => `<select id="${id}" ${attr}>${opts.map(([k, t]) => `<option value="${esc(k)}" ${String(k) === String(val) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
function giocoHTML(){
  const noti = scenariNoti();
  const gruppi = {};
  for (const s of noti) (gruppi[s.group || "Altri"] ||= []).push(s);
  const g = cfg.gen;
  const conCaso = obj => [["caso", "a caso"], ...Object.entries(obj).map(([k, v]) => [k, typeof v === "string" ? v : v.label])];
  const anteprime = Array.from({ length: Math.min(12, quantiGenerati()) }, (_, i) => tavoloGenerato(i));
  const sfida = cfg.tipo === "scenario";
  return `
    <div class="lab-blocco">
      <div class="panel-title">Il gioco</div>
      <div class="lab-campi">
        <label class="field">Punti<input type="number" id="le-punti" min="300" max="5000" step="50" value="${cfg.punti}"></label>
        <label class="field">Lascia per strada al massimo<input type="number" id="le-margine" min="0" max="500" step="5" value="${esc(cfg.margine)}" placeholder="${Math.max(20, Math.round(cfg.punti * 0.04))} punti"></label>
        <label class="field">Formato${sel("le-formato", cfg.formato, Object.entries(FORMATI))}</label>
        <label class="field">Durata${sel("le-durata", cfg.durata, Object.entries(DURATE))}</label>
      </div>
      <div class="chiprow">${[600, 750, 800, 1000, 1250, 1500, 2000].map(p => `<button class="btn tiny${p === cfg.punti ? " on" : ""}" data-punti="${p}">${p}</button>`).join("")}</div>
      <p class="note">Il formato di solito lo dice lo scenario: le mappe di Battle March si giocano con le sue regole — cinque round, i tesori che valgono, vince chi ha più punti — e le altre col Core Rulebook. Qui si può forzare, per vedere quanto cambia.</p>
    </div>
    <div class="lab-blocco">
      <div class="panel-title">Su quali tavoli</div>
      <div class="chiprow">
        <button class="btn tiny" data-scen-preset="sei">I sei di prova</button>
        <button class="btn tiny" data-scen-preset="bm">Solo Battle March</button>
        <button class="btn tiny" data-scen-preset="tutti">Tutti</button>
        <button class="btn tiny ghost" data-scen-preset="nessuno">Nessuno</button>
      </div>
      <div class="lab-scen-scelta">${Object.entries(gruppi).map(([gr, ss]) => `
        <fieldset><legend>${esc(gr)}</legend>${ss.map(s => `<label class="inline"><input type="checkbox" data-scen="${esc(s.id)}" ${cfg.scenari.includes(s.id) ? "checked" : ""}>
          ${esc(s.label)}${s.pts ? ` <span class="mono">${s.pts} pt</span>` : ""} <span class="mono">${s.table[0]}×${s.table[1]}</span></label>`).join("")}</fieldset>`).join("")}
      </div>
      <details class="lab-gen" ${quantiGenerati() || sfida ? "open" : ""}>
        <summary><b>Tavoli generati</b> <span class="note">${sfida ? `${quantiGenerati()} da provare per la sfida, dal seme ${g.seme}` : g.quanti ? `${g.quanti} in più, dal seme ${g.seme}` : "nessuno"}</span></summary>
        <p class="note">Tavoli nuovi, a specchio, fatti dal generatore del terreno con il seme: lo stesso seme dà lo stesso tavolo, e quello che piace si salva fra i tuoi scenari. Ogni manopola fissa o a caso.</p>
        <div class="lab-campi">
          ${sfida ? "" : `<label class="field">Quanti<input type="number" id="le-gen-quanti" min="0" max="30" value="${g.quanti}"></label>`}
          <label class="field">Dal seme<input type="number" id="le-gen-seme" min="1" value="${g.seme}"></label>
          <label class="field">Tavolo${sel("le-gen-tavolo", g.tavolo, conCaso(TAVOLI))}</label>
          <label class="field">Schieramento${sel("le-gen-deploy", g.deploy, conCaso(SCHIERAMENTI))}</label>
          <label class="field">Terreno${sel("le-gen-miscela", g.miscela, conCaso(MISCELE))}</label>
          <label class="field">Quanto pieno${sel("le-gen-densita", g.densita, conCaso(DENSITA))}</label>
          <label class="field">Al centro${sel("le-gen-centro", g.centro, conCaso(CENTRI))}</label>
          <label class="field">Tesori${sel("le-gen-tesori", g.tesori, [["caso", "a caso"], ...[0, 1, 2, 3, 4, 5].map(n => [n, String(n)])])}</label>
        </div>
        ${anteprime.length ? `<div class="lab-anteprime">${anteprime.map(d => `<figure title="${esc(d.desc)}">${svgTavolo(d, 120)}<figcaption>${esc(d.label.replace(/^Tavolo \d+ · /, ""))}</figcaption></figure>`).join("")}</div>` : ""}
      </details>
    </div>`;
}

/* il tavolo in miniatura: zone, terreno, tesori — in pollici */
const TCOL = { hill: "var(--t-hill)", wood: "var(--t-wood)", marsh: "var(--t-marsh)", ruins: "var(--t-ruins)", wall: "var(--t-wall)",
               monolith: "var(--t-mono)", pyramid: "var(--t-ruins)", treasure: "var(--t-treasure)" };
export function svgTavolo(def, larghezza = 160){
  const [W, H] = def.table;
  const k = larghezza / W, alto = Math.round(H * k);
  let zone = "";
  try {
    const geo = geometry(def.deploy, W, H, def.gap || 6);
    for (const [army, rs] of Object.entries(geo.zones)) for (const r of rs)
      zone += `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="var(--army${army})" opacity=".26"/>`;
    for (const a of geo.aux || []) zone += `<rect x="${a.rect.x}" y="${a.rect.y}" width="${a.rect.w}" height="${a.rect.h}" fill="var(--armyB)" opacity=".10"/>`;
    for (const b of geo.blocked || []) zone += `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="var(--blocked)"/>`;
  } catch { /* uno schieramento che non si sa disegnare: il tavolo senza zone */ }
  const pezzi = (def.terrain || []).map(t => {
    const c = TCOL[t.kind] || "var(--muted)";
    if (t.kind === "treasure" || t.kind === "monolith")
      return `<circle cx="${t.x}" cy="${t.y}" r="${Math.max(0.9, t.w / 2)}" fill="${c}" stroke="var(--ink)" stroke-opacity=".45" stroke-width=".3"/>`;
    const w = t.rot === 90 ? t.h : t.w, h = t.rot === 90 ? t.w : t.h;
    return `<rect x="${t.x - w / 2}" y="${t.y - h / 2}" width="${w}" height="${Math.max(0.6, h)}" rx="${t.kind === "wall" ? 0.2 : 1}" fill="${c}" stroke="var(--ink)" stroke-opacity=".45" stroke-width=".3"/>`;
  }).join("");
  return `<svg class="lab-mini" viewBox="0 0 ${W} ${H}" width="${larghezza}" height="${alto}" role="img" aria-label="${esc(def.label || "tavolo")}">
    <rect width="${W}" height="${H}" fill="var(--field)" stroke="var(--field-line)" stroke-width="0.4"/>${zone}${pezzi}</svg>`;
}

/* ---------------- gli avversari, le liste ---------------- */
function scegliListeHTML(id, scelte, { filtroFz = null, titolo = "" } = {}){
  const tutte = listeNote().filter(l => (!cfg.avversari.vicine || vicina(l)) && (!filtroFz || l.fazione !== filtroFz));
  if (!tutte.length) return `<p class="empty">Nessuna lista${cfg.avversari.vicine ? ` vicina ai ${cfg.punti} punti` : ""}.</p>`;
  return `<div class="lab-liste" id="${id}">${tutte.map(l => `<label class="inline lab-lista">
      <input type="checkbox" data-lista="${esc(l.id)}" ${scelte.includes(l.id) ? "checked" : ""}>
      <span><b>${esc(l.name)}</b> <span class="mono">${esc(SIGLA(l.fazione))} · ${l.points} pt · ${FONTE[l.fonte]}</span></span></label>`).join("")}</div>
    ${titolo ? `<p class="note">${titolo}</p>` : ""}`;
}

function avversariHTML(){
  const a = cfg.avversari;
  return `
    <div class="lab-blocco">
      <div class="panel-title">Contro chi</div>
      <div class="group" role="group">${[["auto", "Automatico"], ["scelte", "Liste che scelgo"], ["campionario", "Liste a caso di un'altra fazione"]].map(([k, t]) =>
        `<button class="btn tiny${a.fonte === k ? " on" : ""}" data-avv-fonte="${k}">${t}</button>`).join("")}</div>
      ${a.fonte === "auto" ? `<p class="note">Come fa il terminale: le migliori trovate per le altre fazioni a questi punti, e le liste dell'archivio vicine ai punti, fino a dieci.</p>` : ""}
      ${a.fonte === "scelte" ? `<label class="inline"><input type="checkbox" id="le-vicine" ${a.vicine ? "checked" : ""}> solo quelle vicine ai ${cfg.punti} punti (±10%)</label>
        ${scegliListeHTML("le-avv", a.scelte)}` : ""}
      ${a.fonte === "campionario" ? `<p class="note">Un campionario di liste scritte a caso dalla parte qui sotto, con i suoi limiti: una lista che le batte tutte è forte contro quella fazione, non contro una lista sola.</p>
        <label class="field" style="max-width:200px">Quante liste<input type="number" id="le-camp" min="2" max="16" value="${a.campionario}"></label>
        ${parteHTML("B", "L'altra fazione")}` : ""}
    </div>`;
}

function sfidaHTML(){
  const note = listeNote();
  const opts = [["", "— scegli —"], ...note.map(l => [l.id, `${l.name} · ${SIGLA(l.fazione)} · ${l.points} pt · ${FONTE[l.fonte]}`])];
  return `
    <div class="lab-blocco">
      <div class="panel-title">La sfida</div>
      <div class="lab-campi">
        <label class="field">Una lista${sel("le-sx", cfg.sfida.x, opts)}</label>
        <label class="field">contro${sel("le-sy", cfg.sfida.y, opts)}</label>
        <label class="field">Tavoli generati da provare<input type="number" id="le-sf-tavoli" min="1" max="40" value="${cfg.sfida.tavoli}"></label>
      </div>
      <label class="inline"><input type="checkbox" id="le-sf-scelti" ${cfg.sfida.conScelti ? "checked" : ""}> prova anche gli scenari spuntati qui sotto, per confronto</label>
      <p class="note">I tavoli si generano con le manopole di «Tavoli generati», qui sotto: lasciale a caso per tavoli molto diversi, o fissane qualcuna per variare il resto.</p>
    </div>`;
}

function torneoHTML(){
  return `
    <div class="lab-blocco">
      <div class="panel-title">Chi gioca</div>
      <label class="inline"><input type="checkbox" id="le-vicine" ${cfg.avversari.vicine ? "checked" : ""}> solo liste vicine ai ${cfg.punti} punti (±10%)</label>
      ${scegliListeHTML("le-tor", cfg.torneo.liste)}
      <label class="field" style="max-width:220px">Semi per coppia e scenario<input type="number" id="le-tor-semi" min="1" max="10" value="${cfg.torneo.semi}"></label>
    </div>`;
}

/* ---------------- la ricerca: sforzo, seme, lavoratori ---------------- */
function stima(){
  const nScen = cfg.scenari.length + (cfg.gen.quanti | 0);
  const P = SFORZI[cfg.sforzo] || SFORZI.rapido;
  let n = 0;
  if (cfg.tipo === "lista"){
    const avv = cfg.avversari.fonte === "scelte" ? cfg.avversari.scelte.length : cfg.avversari.fonte === "campionario" ? cfg.avversari.campionario : 8;
    n = stimaPartite(P, avv * nScen, 12);
  } else if (cfg.tipo === "coppia") n = stimaCoppia(P, nScen);
  else if (cfg.tipo === "scenario") n = 2 * ((cfg.sfida.tavoli | 0) + (cfg.sfida.conScelti ? cfg.scenari.length : 0)) * 2 + 2 * 3 * 3;
  else { const k = cfg.torneo.liste.length; n = k * (k - 1) / 2 * nScen * cfg.torneo.semi * 2; }
  const lavori = cfg.lavori || lavoriDefault();
  const sec = n / Math.max(0.05, velocita() * lavori);
  return { n: Math.round(n), lavori, sec };
}
const tempo = s => s < 90 ? `${Math.max(1, Math.round(s))} secondi` : s < 5400 ? `${Math.round(s / 60)} minuti` : `${(s / 3600).toFixed(1)} ore`;

function ricercaHTML(){
  const st = stima();
  const lista = cfg.tipo === "lista", coppia = cfg.tipo === "coppia";
  return `
    <div class="lab-blocco">
      <div class="panel-title">La ricerca</div>
      <div class="lab-campi">
        ${lista ? `<label class="field">Cerca${sel("le-obiettivo", cfg.obiettivo, Object.entries(OBIETTIVI).map(([k, o]) => [k, o.label]))}</label>` : ""}
        ${lista || coppia ? `<label class="field">Sforzo${sel("le-sforzo", cfg.sforzo, Object.keys(SFORZI).map(k => [k, `${k} · ${SFORZI[k].popolazione} liste × ${SFORZI[k].generazioni} generazioni`]))}</label>` : ""}
        <label class="field">Seme<input type="number" id="le-seme" min="1" value="${cfg.seme}"></label>
        <label class="field">Lavoratori<input type="number" id="le-lavori" min="1" max="32" value="${cfg.lavori || ""}" placeholder="${lavoriDefault()}"></label>
      </div>
      ${lista ? `<label class="inline"><input type="checkbox" id="le-esempi" ${cfg.esempi ? "checked" : ""}> parti anche dalla lista nota della fazione, se si può schierare</label>` : ""}
      ${coppia ? `<label class="inline"><input type="checkbox" id="le-varieta" ${cfg.varieta ? "checked" : ""}> premia le coppie con più unità diverse</label>` : ""}
      ${lista && cfg.obiettivo === "equilibrata" ? `<p class="note">«La più equilibrata» cerca la lista che contro <b>ogni</b> avversario sta vicina al 50%, non quella che fa 50% in media vincendo sempre con uno e perdendo sempre con l'altro.</p>` : ""}
      <p class="note">Circa <b>${st.n.toLocaleString("it-IT")}</b> partite: con ${st.lavori} lavoratori, ${tempo(st.sec)}${velocita() !== 0.3 ? " (alla velocità vista l'ultima volta)" : " (stima: la prima ricerca la misura)"}. La pagina può restare aperta su un'altra scheda; chiusa, la ricerca si ferma.</p>
    </div>`;
}

/* ---------------- la corsa: quella in corso ---------------- */
let corsa = null;            // { tipo, motore, log, fatte, stima, t0, fermo, fine, errore }
const logga = riga => { if (!corsa) return; corsa.log.push(riga); if (corsa.log.length > 200) corsa.log.shift(); disegnaCorsa(); };
function disegnaCorsa(){
  const el = $("#le-corsa");
  if (!el || !corsa) return;
  const pc = corsa.stima ? Math.min(100, 100 * corsa.fatte / corsa.stima) : 0;
  const sec = (Date.now() - corsa.t0) / 1000;
  const vel = corsa.fatte / Math.max(1, sec);
  const resta = vel > 0 && corsa.stima > corsa.fatte ? (corsa.stima - corsa.fatte) / vel : 0;
  el.innerHTML = `
    <div class="sim-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pc)}"><i style="width:${pc.toFixed(1)}%"></i></div>
    <p class="note mono">${corsa.fatte.toLocaleString("it-IT")} partite su circa ${corsa.stima.toLocaleString("it-IT")} · ${tempo(sec)}${corsa.fine ? "" : resta ? ` · ne mancano circa ${tempo(resta)}` : ""}${corsa.fermo && !corsa.fine ? " · si ferma alla fine della generazione…" : ""}</p>
    ${corsa.errore ? `<p class="note warn">${esc(corsa.errore)}</p>` : ""}
    <pre class="lab-log">${esc(corsa.log.slice(-14).join("\n"))}</pre>`;
  const btn = $("#le-avvia"), stop = $("#le-ferma"), via = $("#le-annulla");
  if (btn) btn.disabled = !corsa.fine;
  if (stop) stop.hidden = !!corsa.fine;
  if (via) via.hidden = !!corsa.fine;
}

async function avvia(rinfresca){
  if (corsa && !corsa.fine) return;
  await contesto();
  const scen = scenariDellaRicerca();
  const ids = Object.keys(scen);
  const P = { ...(SFORZI[cfg.sforzo] || SFORZI.rapido) };
  corsa = { tipo: cfg.tipo, log: [], fatte: 0, stima: 1, t0: Date.now(), fermo: false, fine: false, motore: null };
  rinfresca();
  /* l'orologio: le partite arrivano a gruppi, e fra un gruppo e l'altro
     la pagina sembrerebbe ferma */
  const orologio = setInterval(() => { if (corsa.fine) clearInterval(orologio); else disegnaCorsa(); }, 1000);
  const errore = msg => { corsa.errore = msg; corsa.fine = true; clearInterval(orologio); disegnaCorsa(); };
  try {
    if (!ids.length && cfg.tipo !== "scenario") return errore("Nessuno scenario: spuntane almeno uno, o chiedi qualche tavolo generato.");
    const piano = await prepara(scen, ids, P);
    if (piano.errore) return errore(piano.errore);
    corsa.motore = await apriMotoreWeb({ lavori: cfg.lavori || lavoriDefault(), scenari: scen, formato: cfg.formato, durata: cfg.durata });
    logga(`${corsa.motore.lavori} lavoratori${corsa.motore.nelBrowser ? "" : " (senza Web Worker: una partita alla volta)"} · ${piano.titolo}`);
    for (const r of piano.righe || []) logga(r);
    corsa.t0 = Date.now();
    const comuni = { gioca: corsa.motore.gioca, log: logga, fermato: () => corsa.fermo,
                     avanza: (f, s) => { corsa.fatte = f; corsa.stima = Math.max(s, f); disegnaCorsa(); } };
    const esito = await piano.lancia(comuni);
    const sec = (Date.now() - corsa.t0) / 1000;
    if (corsa.fatte > 20 && sec > 5) ricordaVelocita(corsa.fatte / sec / corsa.motore.lavori);
    corsa.motore.chiudi();
    if (esito.vuota) return errore(esito.motivo);
    const doc = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), tipo: cfg.tipo, quando: new Date().toISOString(),
                  titolo: piano.titolo, cfg: structuredClone(cfg), partite: esito.partite, secondi: esito.secondi, fermata: !!esito.fermata,
                  scenari: Object.fromEntries(Object.entries(scen).map(([id, d]) => [id, d.gen ? d : { label: d.label, group: d.group, table: d.table }])),
                  ...piano.salva(esito) };
    await saveDoc(PREFISSO + doc.id, doc);
    await caricaMiei();
    corsa.fine = true; corsa.ultimo = doc.id; clearInterval(orologio);
    logga(`fatto: ${esito.partite} partite in ${tempo(esito.secondi || sec)}${esito.fermata ? " (fermata prima della fine)" : ""}. Il risultato è qui sotto.`);
    aperto = doc.id;
    rinfresca();
  } catch (e){
    if (corsa.motore) corsa.motore.chiudi();
    errore(e && e.annullata ? "Annullata: niente di salvato." : `Si è fermata: ${(e && e.message) || e}`);
  }
}

/* che cosa si lancia, per tipo: il titolo, le righe da dire prima, e
   come si salva il risultato */
async function prepara(scen, ids, P){
  const etich = Object.fromEntries(ids.map(id => [id, scen[id].label || id]));
  const note = listeNote();
  const perId = id => note.find(l => l.id === id);

  if (cfg.tipo === "lista"){
    const S = spazioDi(cfg.A);
    if (S.impossibile.length) return { errore: `Con questi limiti non si scrive nessuna lista: ${S.impossibile.join("; ")}.` };
    let contro = [];
    const a = cfg.avversari;
    if (a.fonte === "scelte") contro = a.scelte.map(perId).filter(Boolean).map(l => ({ lista: l.lista, fonte: l.fonte }));
    else if (a.fonte === "campionario"){
      const SB = spazioDi(cfg.B);
      if (SB.impossibile.length) return { errore: `L'altra fazione, con quei limiti, non scrive liste: ${SB.impossibile.join("; ")}.` };
      const rnd = generatore((cfg.seme | 0) + 77), visti = new Set();
      for (let t = 0; contro.length < Math.max(2, a.campionario | 0) && t < 60; t++){
        const g = SB.casuale(rnd);
        if (!g || visti.has(SB.chiave(g))) continue;
        visti.add(SB.chiave(g));
        contro.push({ lista: SB.costruisci(g, { id: `camp-${cfg.B.fazione}-${contro.length + 1}`, name: `${SB.fz.sigla} a caso ${contro.length + 1}` }), fonte: "campionario" });
      }
    } else {
      /* automatico: le migliori delle altre fazioni, poi l'archivio vicino ai punti */
      const trovate = note.filter(l => l.prima && l.fazione && l.fazione !== cfg.A.fazione && Math.abs(l.points - cfg.punti) <= cfg.punti * 0.06);
      const vicine = note.filter(l => l.fonte === "archivio" && l.fazione && Math.abs(l.points - cfg.punti) <= cfg.punti * 0.06)
        .sort((x, y) => Math.abs(x.points - cfg.punti) - Math.abs(y.points - cfg.punti));
      contro = [...trovate, ...vicine].slice(0, 10).map(l => ({ lista: l.lista, fonte: l.fonte }));
    }
    if (!contro.length) return { errore: "Nessun avversario: sceglile, o prova con un campionario a caso di un'altra fazione." };
    const titolo = `${S.fz.nome} (${cfg.A.pool === "collezione" ? "collezione" : "tutte le unità"}), ${OBIETTIVI[cfg.obiettivo].label}, contro ${contro.length} ${contro.length === 1 ? "lista" : "liste"} · ${cfg.punti} pt`;
    return {
      titolo,
      righe: [`unità: ${S.voci.map(v => v.nome).join(", ")}`, `avversari: ${contro.map(c => c.lista.name).join(", ")}`, `scenari: ${ids.map(i => etich[i]).join(", ")}`],
      lancia: c => cercaLista({ S, contro, scenari: ids, P, seme: cfg.seme, obiettivo: cfg.obiettivo, esempi: cfg.esempi,
                                 etichetta: `${S.fz.sigla} lab ${cfg.punti}`, idBase: `r-lab-${Date.now().toString(36)}`, ...c }),
      salva: r => ({ lista: { fazione: cfg.A.fazione, nome: S.fz.nome, pool: cfg.A.pool, punti: cfg.punti, scenari: ids, etichette: etich,
                              obiettivo: cfg.obiettivo, unita: S.voci.map(v => v.nome), escluse: S.escluse, migliori: r.migliori,
                              provate: r.provate, contro: r.contro, storia: r.storia, limiti: cfg.A.limiti } }),
    };
  }

  if (cfg.tipo === "coppia"){
    const SA = spazioDi(cfg.A), SB = spazioDi(cfg.B);
    for (const [S, chi] of [[SA, "La prima parte"], [SB, "La seconda parte"]])
      if (S.impossibile.length) return { errore: `${chi}, con quei limiti, non scrive liste: ${S.impossibile.join("; ")}.` };
    const etichette = [`${SA.fz.sigla} lab`, `${SB.fz.sigla} lab`];
    return {
      titolo: `${SA.fz.nome} contro ${SB.fz.nome}, alla pari · ${cfg.punti} pt`,
      righe: [`scenari: ${ids.map(i => etich[i]).join(", ")}`],
      lancia: c => cercaCoppia({ SA, SB, scenari: ids, P, seme: cfg.seme, varieta: cfg.varieta ? 1 : 0, etichette, ...c }),
      salva: r => ({ coppia: { fazioni: [cfg.A.fazione, cfg.B.fazione], punti: cfg.punti, scenari: ids, etichette: etich, coppie: r.coppie, storia: r.storia } }),
    };
  }

  if (cfg.tipo === "scenario"){
    const x = perId(cfg.sfida.x), y = perId(cfg.sfida.y);
    if (!x || !y) return { errore: "Scegli le due liste della sfida." };
    const extra = cfg.sfida.conScelti ? cfg.scenari.map(id => scen[id]).filter(d => d && !d.gen).map(d => ({ ...d, id: Object.keys(scen).find(k => scen[k] === d) })) : [];
    const quanti = Math.max(1, cfg.sfida.tavoli | 0);
    const genera = i => tavoloGenerato(i);
    return {
      titolo: `Il tavolo per ${x.name} contro ${y.name}`,
      righe: [`${quanti} tavoli generati dal seme ${cfg.gen.seme}${extra.length ? `, più ${extra.length} scenari scelti` : ""}`],
      lancia: c => cercaScenario({ x: x.lista, y: y.lista, genera, quanti, semi: 2, verifica: 3, finalisti: 3, seme: cfg.seme, extra, ...c }),
      salva: r => ({ tavolo: { x: { id: x.id, name: x.name, fazione: x.fazione }, y: { id: y.id, name: y.name, fazione: y.fazione },
                               liste: { x: x.lista, y: y.lista }, tavoli: r.tavoli, altri: r.altri } }),
    };
  }

  /* il torneo */
  const scelte = cfg.torneo.liste.map(perId).filter(Boolean);
  if (scelte.length < 2) return { errore: "Servono almeno due liste per un torneo." };
  const liste = scelte.map(l => ({ id: l.id, name: l.name, lista: l.lista, fazione: l.fazione, pool: l.fonte === "archivio" ? "archivio" : "collezione", fonte: l.fonte, points: l.points }));
  return {
    titolo: `Torneo fra ${liste.length} liste · ${cfg.punti} pt`,
    righe: [`scenari: ${ids.map(i => etich[i]).join(", ")}`],
    lancia: c => torneo({ liste, scenari: ids, semi: Math.max(1, cfg.torneo.semi | 0), seme: cfg.seme, ...c }),
    salva: r => ({ torneo: { formato: "tow-torneo/1", quando: new Date().toISOString(), punti: cfg.punti, semi: cfg.torneo.semi, partite: r.partite,
                             scenari: ids.map(id => ({ id, label: etich[id], group: scen[id].group || "", pts: scen[id].pts || null })),
                             liste: liste.map(({ lista, ...l }) => ({ ...l, lista })), celle: r.celle } }),
  };
}

/* ---------------- i risultati ---------------- */
let aperto = null;
const pc = (a, n) => Math.round(100 * a / (n || 1));
const quota = c => (c.w + c.d / 2) / (c.n || 1);
const unitaUL = d => `<ul class="lab-unita">${String(d || "").split("; ").map(u => `<li>${esc(u)}</li>`).join("")}</ul>`;
const giorno = iso => iso ? new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const nomeSc = (doc, id) => ((doc.scenari || {})[id] || {}).label || id;

function barraScenari(doc, per, nomi){
  const righe = Object.entries(per).filter(([, c]) => c.n).map(([id, c]) => {
    const q = quota(c), d = q - 0.5;
    const dove = d >= 0 ? `left:50%;width:${(100 * d).toFixed(1)}%` : `left:${(100 * q).toFixed(1)}%;width:${(-100 * d).toFixed(1)}%`;
    return `<div class="lab-sf-riga${Math.abs(d) >= 0.25 ? " lab-sf-evita" : ""}" title="${esc(nomeSc(doc, id))}: ${esc(nomi[0])} vince ${pc(c.w, c.n)}%, ${esc(nomi[1])} ${pc(c.l, c.n)}%, pari ${pc(c.d, c.n)}% — ${c.n} partite">
      <span class="lab-sf-nome">${esc(nomeSc(doc, id))}</span>
      <span class="lab-sf-track"><i class="${d >= 0 ? "pos" : "neg"}" style="${dove}"></i></span>
      <span class="lab-sf-val mono">${pc(c.w, c.n)}–${pc(c.l, c.n)}</span><span class="lab-sf-tag"></span></div>`;
  }).join("");
  return `<div class="lab-sf-chiave"><span><i class="lab-sw neg"></i>meglio ${esc(nomi[1])}</span><span><i class="lab-sw pos"></i>meglio ${esc(nomi[0])}</span></div>${righe}`;
}

function risultatoLista(doc){
  const r = doc.lista, ob = r.obiettivo || "forte";
  return `${(r.migliori || []).map((m, i) => `
    <div class="lab-alt">
      <div class="readout"><span>${i === 0 ? "La migliore" : `La ${i + 1}ª`}, ${m.punti} pt</span><b>${esc(lettura(m.verifica, ob))} <span class="mono">(${m.verifica.n} partite di verifica)</span></b></div>
      ${unitaUL(m.descrizione)}
      ${i === 0 && r.contro ? `<div class="lab-opp">${r.contro.map(c => { const t = m.verifica.perAvversario[c.id]; return t ? `<span class="chip ${t.w > t.l ? "ok" : t.w < t.l ? "bad" : ""}" title="${t.n} partite">${esc(c.name)} ${pc(t.w, t.n)}/${pc(t.l, t.n)}</span>` : ""; }).join("")}</div>` : ""}
      ${i === 0 ? `<details><summary class="note">Scenario per scenario</summary>${barraScenari(doc, m.verifica.perScenario, [m.lista.name, "gli avversari"])}</details>` : ""}
      ${Object.keys(m.verifica.fuori || {}).length ? `<p class="note warn">Rimaste fuori dallo schieramento: ${Object.entries(m.verifica.fuori).map(([k, q]) => `${esc(k)} ${q} volte`).join(", ")}.</p>` : ""}
      <button class="btn tiny${i === 0 ? " primary" : ""}" data-le-adotta="${esc(doc.id)}|${i}">Aggiungi alle mie liste</button>
    </div>`).join("")}
    ${(r.provate || []).length ? `<details><summary class="note">Le unità: quante volte provate, e come sono andate</summary>
      <div class="tray">${r.provate.map(t => `<div class="row u-row"><span class="nm"><b><span class="txt">${esc(t.nome)}</span></b>
        <span class="mono">${t.liste ? `${t.liste} liste · ${t.partite} partite${t.finaliste ? ` · in ${t.finaliste} finaliste` : ""}` : "mai provata"}</span></span>
        <span class="chip ${t.media == null ? "idle" : ""}">${t.media == null ? "–" : t.media + "%"}</span></div>`).join("")}</div></details>` : ""}
    <details><summary class="note">Andamento e avversari</summary>
      <p class="note">Avversari: ${(r.contro || []).map(c => esc(c.name)).join(", ")}.</p>
      <p class="note">La prima in classifica a ogni generazione: ${(r.storia || []).map(s => `${s.migliore}`).join(" → ")}.</p></details>`;
}

/* quanto sta lontano dal 50%, in media, scenario per scenario: è quello
   che ordina le coppie — 50% in totale vincendo tutto su un tavolo e
   perdendo tutto sull'altro non è una sfida alla pari */
const scartoMedio = v => { const p = Object.values(v.per || {}).filter(c => c.n); return p.length ? Math.round(100 * p.reduce((t, c) => t + Math.abs(quota(c) - 0.5), 0) / p.length) : 0; };

function risultatoCoppia(doc){
  const r = doc.coppia;
  return (r.coppie || []).map((c, i) => {
    const v = c.verifica, sc = c.scenarioConsigliato;
    const nomi = [c.listaA.name, c.listaB.name];
    return `<div class="lab-alt">
      <div class="readout"><span>Coppia ${i + 1}: ${c.puntiA} contro ${c.puntiB} pt</span><b>${pc(v.w, v.n)}–${pc(v.l, v.n)}, pari ${pc(v.d, v.n)}% · scarto per scenario ${scartoMedio(v)} punti <span class="mono">(${v.n} partite)</span></b></div>
      <div class="lab-coppia"><div><b>${esc(nomi[0])}</b>${unitaUL(c.descrizioneA)}</div><div><b>${esc(nomi[1])}</b>${unitaUL(c.descrizioneB)}</div></div>
      ${sc ? `<p class="note">Giocatela su <b>${esc(nomeSc(doc, sc))}</b>: lì sono più alla pari.</p>` : ""}
      <details><summary class="note">Scenario per scenario</summary>${barraScenari(doc, v.per, nomi)}</details>
      <div class="btn-row">
        <button class="btn tiny${i === 0 ? " primary" : ""}" data-le-coppia="${esc(doc.id)}|${i}">Tutte e due nelle mie liste</button>
        <button class="btn tiny" data-le-guarda="${esc(doc.id)}|${i}" title="L'euristica contro sé stessa, sul tavolo vero">Guardala giocare</button>
      </div></div>`;
  }).join("");
}

function risultatoTavolo(doc){
  const r = doc.tavolo, nomi = [r.x.name, r.y.name];
  const riga = (t, i, tutto) => {
    const v = t.verifica || t.ricerca;
    return `<div class="lab-tavolo">
      ${svgTavolo(t.def, 180)}
      <div class="lab-tavolo-testo">
        <b>${esc(t.def.label)}</b>${i === 0 && tutto ? ` <span class="chip ok">il più equilibrato</span>` : ""}
        <span class="note">${esc(t.def.desc || "")}</span>
        <span class="mono">${esc(nomi[0])} ${pc(v.w, v.n)}% · ${esc(nomi[1])} ${pc(v.l, v.n)}% · pari ${pc(v.d, v.n)}% — ${v.n} partite</span>
        ${t.def.gen ? `<button class="btn tiny" data-le-salvasc="${esc(doc.id)}|${esc(t.id)}">Salva fra i miei scenari</button>` : ""}
      </div></div>`;
  };
  return `${(r.tavoli || []).map((t, i) => riga(t, i, true)).join("")}
    ${(r.altri || []).length ? `<details><summary class="note">Gli altri tavoli provati (${r.altri.length})</summary>${r.altri.map((t, i) => riga(t, i + 9, false)).join("")}</details>` : ""}`;
}

function risultatoTorneo(doc){
  const t = doc.torneo, liste = t.liste;
  const cella = (a, b) => {
    const s = { w: 0, l: 0, d: 0, n: 0 };
    for (const sc of t.scenari){
      const c = t.celle[`${sc.id}|${a}|${b}`], r = t.celle[`${sc.id}|${b}|${a}`];
      if (c){ s.w += c.w; s.l += c.l; s.d += c.d; s.n += c.n; } else if (r){ s.w += r.l; s.l += r.w; s.d += r.d; s.n += r.n; }
    }
    return s;
  };
  return `<div class="lab-scroll"><table class="lab-tab"><thead><tr><th class="lab-corner">la riga contro la colonna</th>
    ${liste.map((l, j) => `<th title="${esc(l.name)}"><span class="lab-col">${j + 1}</span></th>`).join("")}</tr></thead><tbody>
    ${liste.map((a, i) => `<tr><th scope="row"><span class="lab-col">${i + 1}</span> ${esc(a.name)} <span class="mono">${a.points} pt</span></th>${liste.map(b => {
      if (a.id === b.id) return `<td class="lab-self"></td>`;
      const c = cella(a.id, b.id); if (!c.n) return `<td class="lab-na">·</td>`;
      const m = (c.w - c.l) / c.n;
      return `<td class="lab-cell" style="background:color-mix(in oklab, var(${m >= 0 ? "--lab-pos" : "--lab-neg"}) ${Math.round(Math.min(1, Math.abs(m)) * 72)}%, var(--lab-mid))"
        title="${esc(a.name)} contro ${esc(b.name)}: ${pc(c.w, c.n)}–${pc(c.l, c.n)}, pari ${pc(c.d, c.n)}% — ${c.n} partite"><b>${pc(c.w, c.n)}</b><span>${pc(c.l, c.n)}</span></td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>
    <p class="note">In ogni casella le vinte della riga e, piccole, le perse, su tutti gli scenari. Questo torneo si legge anche nella tabella in cima alla scheda «Ricerche del progetto», scenario per scenario.</p>`;
}

function esperimentiHTML(){
  const tutti = esperimenti();
  if (!tutti.length) return `<p class="empty">Nessun esperimento ancora: configurane uno qui sopra e premi «Avvia».</p>`;
  return tutti.map(doc => {
    const ap = doc.id === aperto;
    const corpo = !ap ? "" : doc.tipo === "lista" ? risultatoLista(doc) : doc.tipo === "coppia" ? risultatoCoppia(doc)
      : doc.tipo === "scenario" ? risultatoTavolo(doc) : risultatoTorneo(doc);
    return `<div class="lab-card${ap ? " lab-aperto" : ""}">
      <div class="lab-card-head">
        <button class="lab-titolo" data-le-apri="${esc(doc.id)}" aria-expanded="${ap}"><b>${esc(doc.titolo)}</b></button>
        <span class="mono">${esc((TIPI[doc.tipo] || {}).label || doc.tipo)} · ${giorno(doc.quando)} · ${doc.partite} partite${doc.fermata ? " · fermata prima" : ""}
          ${doc.cfg && doc.cfg.formato !== "scenario" ? ` · ${esc(doc.cfg.formato === "bm" ? "Battle March" : "Core Rulebook")}` : ""}</span>
      </div>
      ${corpo}
      ${ap ? `<div class="btn-row"><button class="btn tiny ghost" data-le-ripeti="${esc(doc.id)}">Rimetti questa configurazione</button>
        <button class="btn tiny ghost" data-le-via="${esc(doc.id)}">Cancella</button></div>` : ""}
    </div>`;
  }).join("");
}

/* ---------------- la scheda ---------------- */
export async function renderEsperimento(host, rinfresca){
  if (!miei) await caricaMiei();
  await contesto();
  const t = cfg.tipo;
  host.innerHTML = `
    <div class="lab-tipi" role="radiogroup" aria-label="Cosa cercare">${Object.entries(TIPI).map(([k, x]) => `
      <button class="lab-tipo${k === t ? " on" : ""}" role="radio" aria-checked="${k === t}" data-le-tipo="${k}"><b>${esc(x.label)}</b><span>${esc(x.spiega)}</span></button>`).join("")}
    </div>
    ${t === "lista" ? `<div class="lab-blocco"><div class="panel-title">La lista da cercare</div>${parteHTML("A", "La fazione")}</div>${avversariHTML()}` : ""}
    ${t === "coppia" ? `<div class="lab-blocco"><div class="panel-title">Le due parti</div><div class="lab-due">${parteHTML("A", "Una parte")}${parteHTML("B", "L'altra")}</div>
      <p class="note">Le due parti possono essere della stessa fazione: con la collezione le miniature sono le stesse, e al tavolo vero non si schierano insieme.</p></div>` : ""}
    ${t === "scenario" ? sfidaHTML() : ""}
    ${t === "torneo" ? torneoHTML() : ""}
    ${giocoHTML()}
    ${ricercaHTML()}
    <div class="lab-blocco lab-via">
      <div class="btn-row">
        <button class="btn primary" id="le-avvia" ${corsa && !corsa.fine ? "disabled" : ""}>Avvia</button>
        <button class="btn" id="le-ferma" ${corsa && !corsa.fine ? "" : "hidden"} title="Finisce la generazione in corso, verifica quello che c'è e lo salva">Ferma e tieni</button>
        <button class="btn ghost" id="le-annulla" ${corsa && !corsa.fine ? "" : "hidden"}>Annulla</button>
        <span class="note lab-stima">${(() => { const st = stima(); return `circa ${st.n.toLocaleString("it-IT")} partite · ${tempo(st.sec)}`; })()}</span>
      </div>
      <div id="le-corsa" aria-live="polite"></div>
    </div>
    <div class="panel-title">I tuoi esperimenti</div>
    <div class="lab-cards lab-esp">${esperimentiHTML()}</div>`;
  disegnaCorsa();
  collega(host, rinfresca);
}

function collega(host, rinfresca){
  const salvaE = () => { ricorda(); rinfresca(); };
  const val = (id, f) => { const el = $(id); if (el) el.addEventListener("change", () => { f(el); salvaE(); }); };
  host.querySelectorAll("[data-le-tipo]").forEach(b => b.addEventListener("click", () => { cfg.tipo = b.dataset.leTipo; salvaE(); }));

  /* le parti */
  host.querySelectorAll("[data-parte-fz]").forEach(s => s.addEventListener("change", () => { const p = cfg[s.dataset.parteFz]; p.fazione = s.value; p.limiti = {}; salvaE(); }));
  host.querySelectorAll("[data-parte-pool]").forEach(s => s.addEventListener("change", () => { cfg[s.dataset.partePool].pool = s.value; salvaE(); }));
  host.querySelectorAll("[data-parte-azzera]").forEach(b => b.addEventListener("click", () => { cfg[b.dataset.parteAzzera].limiti = {}; salvaE(); }));
  const voci = {};
  const vociDi = chi => voci[chi] ||= (() => { const p = cfg[chi]; try { return spazio(p.fazione, { pool: p.pool, punti: cfg.punti, margine: margineDi() }).voci; } catch { return []; } })();
  host.querySelectorAll(".lab-u").forEach(r => {
    const p = cfg[r.dataset.parte], k = r.dataset.k;
    const v = vociDi(r.dataset.parte).find(x => x.k === k) || null;
    r.querySelectorAll("[data-stato]").forEach(b => b.addEventListener("click", () => {
      const l = v ? limitePer(v, b.dataset.stato) : null;
      if (l) p.limiti[k] = l; else delete p.limiti[k];
      salvaE();
    }));
    r.querySelectorAll("[data-lim]").forEach(inp => inp.addEventListener("change", () => {
      const l = { ...(p.limiti[k] || {}) }, x = inp.value === "" ? null : Math.max(0, +inp.value | 0);
      const q = inp.dataset.lim;
      if (q === "min" || q === "max"){ if (x == null) delete l[q]; else l[q] = x; }
      else {
        const n = [...(l.n || [v && v.n ? v.n[0] : 0, v && v.n ? v.n[1] : 0])];
        n[q === "n0" ? 0 : 1] = x == null ? (v && v.n ? v.n[q === "n0" ? 0 : 1] : 0) : x;
        if (v && v.n && n[0] === v.n[0] && n[1] === v.n[1]) delete l.n; else l.n = n;
      }
      if (Object.keys(l).length) p.limiti[k] = l; else delete p.limiti[k];
      salvaE();
    }));
  });

  /* avversari, sfida, torneo */
  host.querySelectorAll("[data-avv-fonte]").forEach(b => b.addEventListener("click", () => { cfg.avversari.fonte = b.dataset.avvFonte; salvaE(); }));
  val("#le-vicine", el => { cfg.avversari.vicine = el.checked; });
  val("#le-camp", el => { cfg.avversari.campionario = Math.max(2, Math.min(16, +el.value | 0)); });
  const spunte = (sel, arr) => host.querySelectorAll(`${sel} [data-lista]`).forEach(c => c.addEventListener("change", () => {
    const i = arr.indexOf(c.dataset.lista);
    if (c.checked && i < 0) arr.push(c.dataset.lista); if (!c.checked && i >= 0) arr.splice(i, 1);
    ricorda(); rinfresca();
  }));
  spunte("#le-avv", cfg.avversari.scelte); spunte("#le-tor", cfg.torneo.liste);
  val("#le-sx", el => { cfg.sfida.x = el.value; }); val("#le-sy", el => { cfg.sfida.y = el.value; });
  val("#le-sf-tavoli", el => { cfg.sfida.tavoli = Math.max(1, Math.min(40, +el.value | 0)); });
  val("#le-sf-scelti", el => { cfg.sfida.conScelti = el.checked; });
  val("#le-tor-semi", el => { cfg.torneo.semi = Math.max(1, Math.min(10, +el.value | 0)); });

  /* il gioco */
  val("#le-punti", el => { cfg.punti = Math.max(300, Math.min(5000, +el.value | 0)); });
  val("#le-margine", el => { cfg.margine = el.value === "" ? "" : Math.max(0, +el.value | 0); });
  val("#le-formato", el => { cfg.formato = el.value; }); val("#le-durata", el => { cfg.durata = el.value; });
  host.querySelectorAll("[data-punti]").forEach(b => b.addEventListener("click", () => { cfg.punti = +b.dataset.punti; salvaE(); }));
  host.querySelectorAll("[data-scen]").forEach(c => c.addEventListener("change", () => {
    const i = cfg.scenari.indexOf(c.dataset.scen);
    if (c.checked && i < 0) cfg.scenari.push(c.dataset.scen); if (!c.checked && i >= 0) cfg.scenari.splice(i, 1);
    salvaE();
  }));
  host.querySelectorAll("[data-scen-preset]").forEach(b => b.addEventListener("click", () => {
    const noti = scenariNoti(), q = b.dataset.scenPreset;
    cfg.scenari = q === "sei" ? SEI.filter(id => noti.some(s => s.id === id)) : q === "bm" ? noti.filter(s => s.group === "Battle March").map(s => s.id)
      : q === "tutti" ? noti.map(s => s.id) : [];
    salvaE();
  }));
  val("#le-gen-quanti", el => { cfg.gen.quanti = Math.max(0, Math.min(30, +el.value | 0)); });
  val("#le-gen-seme", el => { cfg.gen.seme = Math.max(1, +el.value | 0); });
  for (const k of ["tavolo", "deploy", "miscela", "densita", "centro", "tesori"])
    val(`#le-gen-${k}`, el => { cfg.gen[k] = el.value === "caso" ? "caso" : k === "tesori" ? +el.value : el.value; });

  /* la ricerca */
  val("#le-obiettivo", el => { cfg.obiettivo = el.value; }); val("#le-sforzo", el => { cfg.sforzo = el.value; });
  val("#le-seme", el => { cfg.seme = Math.max(1, +el.value | 0); });
  val("#le-lavori", el => { cfg.lavori = el.value === "" ? 0 : Math.max(1, Math.min(32, +el.value | 0)); });
  val("#le-esempi", el => { cfg.esempi = el.checked; }); val("#le-varieta", el => { cfg.varieta = el.checked; });

  /* la corsa */
  $("#le-avvia").addEventListener("click", () => avvia(rinfresca));
  const ferma = $("#le-ferma"), annulla = $("#le-annulla");
  if (ferma) ferma.addEventListener("click", () => { if (corsa){ corsa.fermo = true; disegnaCorsa(); } });
  if (annulla) annulla.addEventListener("click", () => { if (corsa && corsa.motore) corsa.motore.annulla(); });

  /* i risultati */
  const doc = id => esperimenti().find(d => d.id === id);
  host.querySelectorAll("[data-le-apri]").forEach(b => b.addEventListener("click", () => { aperto = aperto === b.dataset.leApri ? null : b.dataset.leApri; rinfresca(); }));
  host.querySelectorAll("[data-le-via]").forEach(b => b.addEventListener("click", async () => {
    if (!await askConfirm("Cancello questo esperimento? Le liste che hai già aggiunto alle tue restano.", { title: "Cancellare?", ok: "Cancella", danger: true })) return;
    await deleteDoc(PREFISSO + b.dataset.leVia); await caricaMiei(); rinfresca();
  }));
  host.querySelectorAll("[data-le-ripeti]").forEach(b => b.addEventListener("click", () => {
    const d = doc(b.dataset.leRipeti); if (!d || !d.cfg) return;
    cfg = { ...structuredClone(DEFAULT), ...structuredClone(d.cfg) }; salvaE();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  const fatto = (btn, testo) => { btn.textContent = testo; btn.disabled = true; };
  host.querySelectorAll("[data-le-adotta]").forEach(b => b.addEventListener("click", async () => {
    const [id, i] = b.dataset.leAdotta.split("|"), d = doc(id);
    const r = await adoptList(d.lista.migliori[+i].lista);
    fatto(b, r.nuova ? "Aggiunta ✓" : "L'avevi già ✓");
  }));
  host.querySelectorAll("[data-le-coppia]").forEach(b => b.addEventListener("click", async () => {
    const [id, i] = b.dataset.leCoppia.split("|"), c = doc(id).coppia.coppie[+i];
    const r = [await adoptList(c.listaA), await adoptList(c.listaB)];
    fatto(b, r.every(x => !x.nuova) ? "Le avevi già ✓" : "Aggiunte ✓");
  }));
  host.querySelectorAll("[data-le-guarda]").forEach(b => b.addEventListener("click", async () => {
    const [id, i] = b.dataset.leGuarda.split("|"), d = doc(id), c = d.coppia.coppie[+i];
    let sc = c.scenarioConsigliato;
    const def = (d.scenari || {})[sc];
    if (def && def.gen){
      if (!await askConfirm(`«${def.label}» è un tavolo generato: per giocarci lo salvo fra i tuoi scenari.`, { title: "Salvare il tavolo?", ok: "Salva e gioca" })) return;
      sc = await saveCustom({ name: def.label, table: def.table, gap: def.gap, deploy: def.deploy, desc: def.desc, terrain: def.terrain, formato: def.gen.formato });
    }
    if (inCorso() && !await askConfirm("C'è già una sfida in corso: la abbandono e ne comincio un'altra?", { title: "Nuova partita?" })) return;
    startSfida({ listA: c.listaA, listB: c.listaB, mia: "guarda", scenario: sc || "", seme: d.cfg ? d.cfg.seme : 1 });
    emit("sfida:show");
  }));
  host.querySelectorAll("[data-le-salvasc]").forEach(b => b.addEventListener("click", async () => {
    const [id, sid] = b.dataset.leSalvasc.split("|"), d = doc(id);
    const t = [...(d.tavolo.tavoli || []), ...(d.tavolo.altri || [])].find(x => x.id === sid);
    if (!t) return;
    const def = t.def;
    await saveCustom({ name: def.label, table: def.table, gap: def.gap, deploy: def.deploy, desc: def.desc, terrain: def.terrain, formato: (def.gen || {}).formato });
    fatto(b, "Salvato ✓");
  }));
}

/* i tornei del laboratorio, per la tabella grande di laboratorio.js */
export const torneiLocali = () => esperimenti().filter(d => d.tipo === "torneo" && d.torneo).map(d => d.torneo);
