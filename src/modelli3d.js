/* Schieramento Old World — i modelli 3D: dove stanno, chi e' chi, chi va dove
 *
 * Tutto quello che serve alla vista 3D senza three.js: si prova in Node,
 * e lo usano anche il catalogo (per scegliere il modello di una voce) e
 * la pagina della partita da rivedere.
 *
 * DOVE STANNO. I modelli li prepara `tools/modelli-3d.mjs` dentro
 * `modelli-3d/` (che git ignora: sono per uso personale). Si cercano
 * accanto all'app, se la si apre dal server locale, oppure in una
 * cartella scelta a mano che il browser ricorda (Chrome ed Edge).
 *
 * CHI E' CHI. L'indice elenca le pose, una per file. Qui diventano
 * modelli da scegliere: una cartella di Modly e' un modello (le sue pose
 * si alternano nei ranghi), e dentro una cartella ci sono pose che dicono
 * il loro ruolo nel nome — `quarreler_champion`, `warrior_banner`,
 * `hammerers_musician` — e varianti di montaggio, `quarreler_thunderer_build`,
 * che sono un'altra unita' uscita dalla stessa scatola. Una cartella
 * `…-command` porta il gruppo di comando della cartella senza.
 *
 * Un'unita' trova il modello per nome: «Black Orc Mobs» e
 * `orc-and-goblin-tribes-black-orc-mob-2024` hanno le stesse parole, tolti
 * il prefisso della fazione, l'anno e i plurali. Quando il nome non basta
 * lo si sceglie a mano, e la scelta si ricorda (`modelli3d:scelte`): per
 * voce del catalogo, o per nome se l'unita' in collezione non c'e'.
 *
 * CHI VA DOVE. Il gruppo di comando sta al centro del primo rango, come
 * al tavolo; il resto del reggimento alterna le pose da truppa, e se la
 * scatola ne ha con armi diverse prende quelle che l'unita' impugna.
 */

import { loadDoc, saveDoc } from './store.js';

/* ============================================================
   1 · LE PAROLE
   ============================================================ */
const PREFISSI = /^(orc-and-goblin-tribes|orc-goblin-tribes|beastmen-brayherds|dwarf(en)?-mountain-holds|wood-elf-realms|seraphon|skaven|necromunda|gloomspite-gitz|pestilens)-/i;
/* parole che non distinguono niente: il nome della razza (le cartelle
   dei Nani dicono «dwarf» due volte, le liste mai) e quello del tipo di
   reggimento (Gor Herd e la cartella gor-herd sono la stessa cosa,
   ma anche Razorgor Herd e la cartella razorgor) */
const VUOTE = new Set(["and", "of", "the", "on", "with", "dwarf", "wood", "elf", "herd", "mob", "troupe"]);
export function parole(s){
  return String(s).toLowerCase().replace(PREFISSI, "").split(/[^a-z]+/)
    .map(w => w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w)
    .filter(w => w.length > 1 && !VUOTE.has(w));
}

/* `cartelle` puo' essere una lista di nomi o di modelli ({ id, chiave }) */
export function abbina(nome, cartelle){
  const a = new Set(parole(nome));
  if (!a.size) return null;
  let meglio = null, voto = 0;
  for (const c of cartelle){
    const b = new Set(parole(typeof c === "string" ? c : c.chiave));
    let comuni = 0;
    for (const w of a) if (b.has(w)) comuni++;
    const v = comuni / Math.max(a.size, b.size);
    if (v > voto){ voto = v; meglio = typeof c === "string" ? c : c.id; }
  }
  /* tre parole su quattro: «Orc Mobs» non e' «Black Orc Mob», e un
     Orco con la faccia di un Black Orc direbbe una cosa falsa sul tavolo.
     Meglio un blocco onesto, e la scelta fatta a mano. */
  return voto >= 0.75 ? meglio : null;
}

/* ============================================================
   2 · I MODELLI DA SCEGLIERE
   ============================================================ */
const nudo = posa => posa.replace(/^\d+_/, "");
export function ruoloDi(posa){
  const n = nudo(posa).toLowerCase();
  if (/_build$/.test(n)) return "build";
  if (/champion|campione/.test(n)) return "champion";
  if (/banner|standard|stendard/.test(n)) return "standard";
  if (/music|drum|horn/.test(n)) return "musician";
  if (/command/.test(n)) return "comando";
  return "truppa";
}
export const leggibile = s => s.replace(PREFISSI, "").replace(/-\d{4}$/, "").replace(/[-_]+/g, " ").trim()
  .replace(/\b\w/g, c => c.toUpperCase());

/* Modly non sempre chiama «banner» il portastendardo: nella Glade Guard
   e' «02_glade_guard», e finiva sparso nei ranghi. Se la scatola non ha
   uno stendardo dichiarato e una posa e' molto piu' alta delle altre
   (lo stendardo sopra la testa), la si prende per lui. Solo fanteria:
   basette quadrate e modelli piu' alti della basetta — cavalieri, mostri
   e macchine da guerra variano d'altezza per conto loro. E una lancia o
   un'ascia alzata non bastano: serve una volta e mezza abbondante
   l'altezza tipica (Glade Guard 1,9, Bestigor 1,57; gli Slayers con
   l'ascia grande 1,50 restano truppa). Quello che la regola non vede si
   scrive a mano, `ruolo` nell'indice. */
function presumiStendardo(ruoli){
  const t = ruoli.truppa;
  if (ruoli.standard.length || t.length < 3 || t.some(p => p.alto == null)) return;
  if (t.some(p => p.base && Math.min(p.base.w, p.base.d) < .9)) return;
  const alti = t.map(p => p.alto).sort((a, b) => a - b);
  const mediana = alti.length % 2 ? alti[(alti.length - 1) / 2] : (alti[alti.length / 2 - 1] + alti[alti.length / 2]) / 2;
  const top = t.reduce((a, b) => b.alto > a.alto ? b : a);
  if (mediana < 1.1 || top.alto < mediana * 1.55) return;
  ruoli.standard.push(top);
  ruoli.truppa = t.filter(p => p !== top);
}

/* Dall'indice delle pose ai modelli. Ogni modello ha un id (la cartella,
   o `cartella/posa` per una posa sola), un nome da leggere, la chiave su
   cui si abbina il nome e le pose divise per ruolo. */
export function catalogoModelli(indice){
  const per = new Map();
  for (const p of (indice && indice.pose) || []){
    if (!per.has(p.unita)) per.set(p.unita, []);
    per.get(p.unita).push(p);
  }
  const modelli = [], perId = new Map();
  const aggiungi = m => { modelli.push(m); perId.set(m.id, m); return m; };
  for (const [cartella, pose] of per){
    pose.sort((a, b) => a.posa.localeCompare(b.posa));
    const fazione = pose[0].fazione;
    const ruoli = { truppa: [], standard: [], musician: [], champion: [], comando: [] };
    for (const p of pose){
      /* `ruolo` scritto a mano nell'indice vince sul nome della posa */
      const r = p.ruolo || ruoloDi(p.posa);
      if (r === "build"){
        /* «quarreler_thunderer_build»: i Thunderers della scatola dei
           Quarrellers. La parola che distingue e' la penultima. */
        const w = nudo(p.posa).replace(/_build$/i, "").split("_");
        const nome = w[w.length - 1];
        aggiungi({ id: cartella + "/" + p.posa, fazione, cartella, nome: leggibile(nome) + " (" + leggibile(cartella) + ")",
                   chiave: nome, ruoli: { truppa: [p], standard: [], musician: [], champion: [], comando: [] }, auto: true });
      } else ruoli[r].push(p);
    }
    presumiStendardo(ruoli);
    const comando = /-command(-\d{4})?$/i.test(cartella);
    if (!ruoli.truppa.length){
      /* una cartella fatta solo di comando o di personaggi: le sue pose
         valgono come truppa, cosi' scelta a mano mostra qualcosa */
      for (const r of ["comando", "champion", "standard", "musician"]) ruoli.truppa.push(...ruoli[r]);
    }
    aggiungi({ id: cartella, fazione, cartella, nome: leggibile(cartella), chiave: cartella, ruoli,
               auto: !comando, comando });
    /* le pose che si distinguono per nome si possono scegliere da sole:
       il Thane con lo stendardo nella scatola del Re dei Nani */
    const nomi = new Set(pose.map(p => nudo(p.posa).replace(/\d+$/, "")));
    if (pose.length > 1 && nomi.size > 1)
      for (const p of pose) if (!perId.has(cartella + "/" + p.posa))
        aggiungi({ id: cartella + "/" + p.posa, fazione, cartella, posaSola: true,
                   nome: leggibile(cartella) + " · " + leggibile(nudo(p.posa)), chiave: nudo(p.posa),
                   ruoli: { truppa: [p], standard: [], musician: [], champion: [], comando: [] }, auto: false });
  }
  /* il comando di una cartella «x-command» va alla cartella «x» */
  const firma = s => parole(s).sort().join(" ");
  for (const m of modelli) if (m.comando){
    /* per parole e non per nome: «slayer-command» va a «slayers» */
    const cerca = firma(m.id.replace(/-command(?=(-\d{4})?$)/i, ""));
    const base = modelli.find(b => !b.comando && !b.id.includes("/") && firma(b.id) === cerca);
    if (base) base.ruoli.comando.push(...m.ruoli.truppa);
  }
  return { modelli, perId, auto: modelli.filter(m => m.auto) };
}

/* ============================================================
   3 · LE SCELTE A MANO
   ============================================================ */
const CHIAVE = "modelli3d:scelte";
let scelte = null;
export async function caricaScelte(){
  if (!scelte) scelte = (await loadDoc(CHIAVE, {})) || {};
  return scelte;
}
/* «Glade Guard 1» e «Glade Guard 2» sono due reggimenti dello stesso
   tipo: il numero che l'app aggiunge ai doppioni non conta */
export const nomeTipo = nome => String(nome || "").trim().replace(/\s+\d+$/, "").toLowerCase();
export const chiaveScelta = (catId, nome) => catId ? "cat:" + catId : "nome:" + nomeTipo(nome);
/* undefined = automatico, "" = nessun modello (il blocco), altrimenti l'id */
export function sceltaPer(catId, nome, mappa = scelte){
  if (!mappa) return undefined;
  const a = mappa[chiaveScelta(catId, nome)];
  if (a !== undefined) return a;
  /* una voce del catalogo senza scelta sua prende quella fatta per nome */
  return catId ? mappa[chiaveScelta(null, nome)] : undefined;
}
export async function salvaScelta(catId, nome, id){
  await caricaScelte();
  const k = chiaveScelta(catId, nome);
  if (id === undefined || id === null) delete scelte[k]; else scelte[k] = id;
  await saveDoc(CHIAVE, { ...scelte });
}

/* il modello di un'unita': quello scelto, o quello che il nome trova */
export function modelloPer(cat, { catId, nome, nomeCatalogo, scelta }){
  if (scelta === "") return null;
  if (scelta && cat.perId.has(scelta)) return cat.perId.get(scelta);
  const id = (nomeCatalogo && abbina(nomeCatalogo, cat.auto)) || abbina(nome, cat.auto);
  return id ? cat.perId.get(id) : null;
}

/* ============================================================
   4 · CHI VA DOVE
   ============================================================ */
/* le armi che si leggono nel nome di una posa, e come le chiama una lista */
const ARMI = [
  [/great_?weapon|gweap/, /great weapon/i],
  [/hweap|hand_?weapon/, /hand weapon/i],
  [/sh(ie|ei)ld/, /shield/i],
  [/spear/, /spear/i],
  [/halberd/, /halberd/i],
  [/crossbow/, /crossbow/i],
  [/handgun/, /handgun/i],
  [/(^|_)bow/, /(^|\s)(long|short|war)?bows?\b/i],
];
function truppaPer(m, armi){
  const t = m.ruoli.truppa;
  if (t.length < 2 || !armi || !armi.length) return t;
  const testo = armi.join(" | ");
  const voto = p => ARMI.reduce((s, [nellaPosa, nellaLista]) =>
    s + (nellaPosa.test(nudo(p.posa).toLowerCase()) ? (nellaLista.test(testo) ? 1 : -1) : 0), 0);
  /* vince chi si accorda meglio, anche di poco: con la sola arma a una
     mano lo scudo vale zero e l'arma grande meno uno */
  const voti = t.map(voto), max = Math.max(...voti);
  return max > Math.min(...voti) ? t.filter((p, i) => voti[i] === max) : t;
}

/* `celle`: { lx, ly, i } in coordinate dell'unita' (y negativa = fronte).
   Ritorna la posa di ogni cella, nello stesso ordine. */
export function posePerCelle(m, celle, { command = null, armi = null } = {}){
  const truppa = truppaPer(m, armi);
  const out = celle.map(c => truppa[Math.abs(c.i || 0) % truppa.length]);
  const ruoli = command ? ["standard", "musician", "champion"].filter(r => command[r]) : [];
  if (!ruoli.length || celle.length < 2) return out;
  /* il primo rango, dal centro verso i lati */
  const fronte = Math.min(...celle.map(c => c.ly));
  const primo = celle.map((c, j) => ({ c, j })).filter(o => Math.abs(o.c.ly - fronte) < 2)
    .sort((a, b) => Math.abs(a.c.lx) - Math.abs(b.c.lx) || a.c.lx - b.c.lx);
  let g = 0;
  ruoli.forEach((r, k) => {
    if (!primo[k]) return;
    const p = m.ruoli[r][0] || (m.ruoli.comando.length ? m.ruoli.comando[g++ % m.ruoli.comando.length] : null);
    if (p) out[primo[k].j] = p;
  });
  return out;
}

/* ============================================================
   5 · LA TENDINA DELLA SCELTA
   La usano il pannello della vista 3D e la voce del catalogo.
   ============================================================ */
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* Le opzioni di una scelta: automatico, nessuno, poi i modelli per
   fazione. Le usa anche il catalogo. */
export function opzioniModello(cat, attuale, auto){
  const fazioni = new Map();
  for (const m of cat.modelli){
    if (!fazioni.has(m.fazione)) fazioni.set(m.fazione, []);
    fazioni.get(m.fazione).push(m);
  }
  const sel = v => v === attuale ? " selected" : "";
  return `<option value="auto"${sel(undefined)}>Automatico — ${auto ? esc(auto) : "nessuno trovato"}</option>`
    + `<option value=""${sel("")}>Nessun modello (un blocco)</option>`
    + [...fazioni].map(([f, l]) => `<optgroup label="${esc(leggibile(f))}">`
      + l.sort((a, b) => a.nome.localeCompare(b.nome)).map(m => `<option value="${esc(m.id)}"${sel(m.id)}>${esc(m.nome)}</option>`).join("")
      + `</optgroup>`).join("");
}

/* il nome del modello che l'automatico darebbe, senza la scelta */
export const nomeAutomatico = (cat, t) =>
  modelloPer(cat, { catId: t.catId, nome: t.nome, nomeCatalogo: t.nomeCatalogo })?.nome || null;

/* ============================================================
   6 · DOVE STANNO
   ============================================================ */
/* La cartella scelta a mano si ricorda in un database a parte: un
   handle di cartella non e' un dato dell'archivio, non deve finire nel
   backup ne' nella Nuvola. */
const DB = "tow-modelli-3d";
function idb(mode, fn){
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const t = r.result.transaction("kv", mode), q = fn(t.objectStore("kv"));
      t.oncomplete = () => res(q && q.result);
      t.onerror = () => rej(t.error);
    };
  });
}

async function sorgenteServer(){
  try {
    const r = await fetch("./modelli-3d/indice.json", { cache: "no-store" });
    if (!r.ok) return null;
    const indice = await r.json();
    return { come: "server", indice,
             leggi: f => fetch("./modelli-3d/" + f).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error(f))) };
  } catch { return null; }
}
async function sorgenteCartella(h, chiedi){
  if (!h) return null;
  const perm = { mode: "read" };
  try {
    if ((await h.queryPermission?.(perm)) !== "granted"){
      if (!chiedi || (await h.requestPermission?.(perm)) !== "granted") return null;
    }
  } catch { return null; }
  const file = async rel => {
    const parti = rel.split("/");
    let d = h;
    for (const p of parti.slice(0, -1)) d = await d.getDirectoryHandle(p);
    return (await d.getFileHandle(parti.at(-1))).getFile();
  };
  try {
    const indice = JSON.parse(await (await file("indice.json")).text());
    return { come: "cartella", indice, leggi: async f => (await file(f)).arrayBuffer() };
  } catch { return null; }
}

let sorgente = null;
/* `chiedi`: si puo' chiedere il permesso sulla cartella ricordata (serve
   un clic dell'utente appena prima) */
export async function trovaSorgente({ chiedi = false } = {}){
  if (sorgente) return sorgente;
  let h = null;
  try { h = await idb("readonly", s => s.get("cartella")); } catch { h = null; }
  sorgente = (await sorgenteServer()) || (await sorgenteCartella(h, chiedi));
  return sorgente;
}
export async function scegliCartella(){
  if (!globalThis.showDirectoryPicker)
    throw new Error("Questo browser non sa aprire cartelle: serve Chrome o Edge, oppure l'app aperta dal server locale con i modelli in modelli-3d/.");
  const h = await showDirectoryPicker({ id: "modelli-3d", mode: "read" });
  const s = await sorgenteCartella(h, true);
  if (!s) throw new Error("In questa cartella non c'è indice.json: scegli la cartella modelli-3d preparata da tools/modelli-3d.mjs.");
  await idb("readwrite", st => st.put(h, "cartella"));
  sorgente = s;
  return s;
}
