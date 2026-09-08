/* Schieramento Old World — archivio su GitHub
 *
 * IndexedDB e' legato al browser: la collezione fotografata sul
 * telefono non esiste sul portatile, e quella di mio fratello non
 * esiste qui. Il backup a mano risolve, ma bisogna ricordarselo.
 *
 * Qui l'archivio diventa file dentro il repository che gia' pubblica
 * l'app: un commit li scrive, un altro dispositivo li rilegge. Non
 * serve un server — l'API di GitHub basta — e la cronologia del
 * repository diventa la cronologia della collezione: se qualcosa si
 * rompe, il commit di ieri e' ancora li'.
 *
 * Il salvataggio e' un commit solo, non uno per file: si creano i
 * blob cambiati, si monta un albero sopra quello remoto e si sposta
 * il ramo. Un file che non e' cambiato non viene nemmeno caricato,
 * perche' la sua sha git la calcoliamo qui.
 *
 * Questo modulo non tocca il DOM: la finestra sta in syncui.js.
 */

import { exportAll, saveDoc, deleteDoc, listKeys } from './store.js';

const API     = "https://api.github.com";
const CFG_KEY = "tow-sync";
const INDEX   = "indice.json";

export const DEFAULTS = {
  owner: "", repo: "", branch: "main", dir: "dati",
  who: "", token: "", auto: false,
  sha: "",   // il commit da cui siamo allineati
  at: "",    // quando
};

/* Le impostazioni stanno in localStorage e non in IndexedDB apposta:
   cosi' il token non finisce nel backup ne', soprattutto, nei file
   che spediamo al repository. Il token resta su questo dispositivo. */
export function loadCfg(){
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(CFG_KEY)) || {}) }; }
  catch (_){ return { ...DEFAULTS }; }
}

export function saveCfg(patch){
  const cfg = { ...loadCfg(), ...patch };
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (_){}
  return cfg;
}

export const cfgReady = cfg => !!(cfg && cfg.owner && cfg.repo && cfg.branch && cfg.token);

const cleanDir = cfg => String(cfg.dir || "dati").replace(/^\/+|\/+$/g, "") || "dati";
const full = (cfg, path) => cleanDir(cfg) + "/" + path;

/* ------------------------------------------------------------------
   1 · Da chiavi dell'archivio a file, e ritorno

   I nomi sono quelli che uno si aspetta aprendo la cartella su
   github.com, non le chiavi interne. Il JSON e' indentato perche'
   cosi' il diff di un commit si legge: si vede quale unita' e'
   cambiata, non una riga lunga tremila caratteri.
   ------------------------------------------------------------------ */
const NAMED = new Map([
  ["catalog:entries",   "catalogo.json"],
  ["lists:all",         "liste.json"],
  ["matchup:current",   "matchup.json"],
  ["deployments:all",   "schieramenti.json"],
  ["reports:all",       "partite.json"],
  ["scenarios:custom",  "scenari.json"],
  ["board:current",     "tavolo.json"],
]);
const BY_PATH = new Map([...NAMED].map(([k, p]) => [p, k]));

const PHOTO = "foto/";
const OTHER = "altro/";

/* Le foto sono immagini vere dentro il repository, non stringhe
   base64 dentro un JSON: si aprono cliccandole, e un commit che ne
   cambia una pesa quella e basta. */
const MIME_EXT = { "image/jpeg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif", "image/avif":"avif" };
const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m]));

const enc = new TextEncoder();
const dec = new TextDecoder();

export function bytesToB64(bytes){
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function b64ToBytes(b64){
  const s = atob(String(b64).replace(/\s+/g, ""));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const textToB64 = t => bytesToB64(enc.encode(t));
const b64ToText = b => dec.decode(b64ToBytes(b));

const isDataUrl = v => typeof v === "string" && /^data:image\/[a-z+]+;base64,/.test(v);

/* chiave dell'archivio -> percorso dentro la cartella */
export function pathOf(key, value){
  if (NAMED.has(key)) return NAMED.get(key);
  if (key.startsWith("photo:")){
    const id = key.slice(6);
    const mime = isDataUrl(value) ? value.slice(5, value.indexOf(";")) : "image/jpeg";
    return PHOTO + encodeURIComponent(id) + "." + (MIME_EXT[mime] || "bin");
  }
  return OTHER + encodeURIComponent(key) + ".json";
}

/* e il contrario, per i file che arrivano da GitHub */
export function keyOf(path){
  if (path === INDEX) return null;
  if (BY_PATH.has(path)) return BY_PATH.get(path);
  if (path.startsWith(PHOTO)){
    const file = path.slice(PHOTO.length);
    const dot = file.lastIndexOf(".");
    return "photo:" + decodeURIComponent(dot < 0 ? file : file.slice(0, dot));
  }
  if (path.startsWith(OTHER)) return decodeURIComponent(path.slice(OTHER.length).replace(/\.json$/, ""));
  return null;   // roba che non abbiamo scritto noi: non la tocchiamo
}

/* L'archivio in memoria diventa un elenco di file, ognuno con il
   contenuto in base64: e' la forma che vuole l'API dei blob, ed e'
   l'unica che regge tanto il JSON quanto un JPEG. */
export function filesFromData(data, { who = "", at = "" } = {}){
  const files = [];
  for (const [key, value] of Object.entries(data || {})){
    if (value === undefined) continue;
    const path = pathOf(key, value);
    if (path.startsWith(PHOTO) && isDataUrl(value))
      files.push({ path, b64: value.slice(value.indexOf(",") + 1) });
    else
      files.push({ path, b64: textToB64(JSON.stringify(value, null, 2) + "\n") });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  /* L'indice non serve all'app: serve a chi apre la cartella e vuole
     sapere chi ha salvato per ultimo, e quando. */
  files.push({ path: INDEX, b64: textToB64(JSON.stringify({
    formato: "tow-old-world/1",
    aggiornato: at || new Date().toISOString(),
    da: who || "",
    file: files.length,
  }, null, 2) + "\n") });
  return files;
}

/* I file letti da GitHub tornano archivio. Un file che non sappiamo
   leggere viene saltato invece di far fallire tutto lo scaricamento. */
export function dataFromFiles(files){
  const data = {}; let index = null; const skipped = [];
  for (const f of files || []){
    if (f.path === INDEX){
      try { index = JSON.parse(b64ToText(f.b64)); } catch (_){}
      continue;
    }
    const key = keyOf(f.path);
    if (!key){ skipped.push(f.path); continue; }
    try {
      if (f.path.startsWith(PHOTO)){
        const ext = f.path.slice(f.path.lastIndexOf(".") + 1).toLowerCase();
        data[key] = "data:" + (EXT_MIME[ext] || "image/jpeg") + ";base64," + String(f.b64).replace(/\s+/g, "");
      } else {
        data[key] = JSON.parse(b64ToText(f.b64));
      }
    } catch (_){ skipped.push(f.path); }
  }
  return { data, index, skipped };
}

/* ------------------------------------------------------------------
   2 · La sha di git, calcolata qui

   git nomina un file con lo sha1 di "blob <lunghezza>\0<contenuto>".
   Calcolandolo prima di parlare con GitHub sappiamo quali file sono
   davvero cambiati: un salvataggio dopo una partita carica il file
   delle partite e nient'altro, non trecento foto identiche.
   ------------------------------------------------------------------ */
export async function blobSha(b64){
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) return null;          // fuori da https: si ricarica tutto, pazienza
  const body = b64ToBytes(b64);
  const head = enc.encode("blob " + body.length + "\0");
  const all = new Uint8Array(head.length + body.length);
  all.set(head); all.set(body, head.length);
  const h = await subtle.digest("SHA-1", all);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------
   3 · Le chiamate a GitHub
   ------------------------------------------------------------------ */
const repoPath = (cfg, tail) =>
  `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}${tail}`;

async function api(cfg, path, { method = "GET", body = null } = {}){
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: {
        "Authorization": "Bearer " + cfg.token,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_){
    throw new Error("Niente rete: GitHub non risponde.");
  }
  if (res.status === 401) throw new Error("Token rifiutato: e' scaduto o e' scritto male.");
  if (res.status === 403 || res.status === 404){
    /* GitHub risponde 404 anche quando il repository esiste ma il
       token non ha il permesso di vederlo: dirlo, invece di far
       cercare un errore di battitura che non c'e'. */
    let msg = "";
    try { msg = (await res.json()).message || ""; } catch (_){}
    throw new Error(`Non ci arrivo (${res.status}): controlla proprietario, repository, ramo e i permessi del token. ${msg}`.trim());
  }
  if (res.status === 409) throw new Error("Il ramo si e' mosso mentre salvavo: riprova.");
  if (!res.ok){
    let msg = "";
    try { msg = (await res.json()).message || ""; } catch (_){}
    throw new Error(`GitHub ha risposto ${res.status}. ${msg}`.trim());
  }
  return res.status === 204 ? null : res.json();
}

/* a chi stiamo scrivendo, e possiamo davvero scriverci */
export async function probe(cfg){
  const repo = await api(cfg, repoPath(cfg, ""));
  const out = {
    repo: repo.full_name,
    privato: !!repo.private,
    scrivibile: !!(repo.permissions && repo.permissions.push),
    ramo: cfg.branch, esiste: true, sha: "",
  };
  try { out.sha = await head(cfg); }
  catch (_){ out.esiste = false; }
  return out;
}

export async function head(cfg){
  let ref;
  try {
    ref = await api(cfg, repoPath(cfg, `/git/ref/heads/${encodeURIComponent(cfg.branch)}`));
  } catch (err){
    /* Un repository appena creato e' vuoto: il ramo non esiste finche'
       non c'e' un commit, e il 404 secco farebbe cercare un errore di
       battitura che non c'e'. */
    if (/\(404\)/.test(err.message))
      throw new Error(`Non trovo il ramo "${cfg.branch}" in ${cfg.owner}/${cfg.repo}. Se il repository e' appena nato dagli un primo commit (su GitHub basta spuntare "Add a README file"); altrimenti controlla nome del ramo, repository e permessi del token.`);
    throw err;
  }
  return ref.object.sha;
}

/* i file nostri gia' presenti in quel commit: percorso -> sha */
async function remoteFiles(cfg, commitSha){
  const commit = await api(cfg, repoPath(cfg, `/git/commits/${commitSha}`));
  const tree = await api(cfg, repoPath(cfg, `/git/trees/${commit.tree.sha}?recursive=1`));
  const dir = cleanDir(cfg) + "/";
  const files = new Map();
  for (const e of tree.tree || [])
    if (e.type === "blob" && e.path.startsWith(dir)) files.set(e.path.slice(dir.length), e.sha);
  return { treeSha: commit.tree.sha, files, troncato: !!tree.truncated };
}

/* ------------------------------------------------------------------
   4 · Salvare: un commit solo
   ------------------------------------------------------------------ */
export class ConflictError extends Error {
  constructor(sha){
    super("Il repository e' andato avanti dall'ultimo scambio: ha salvato qualcun altro.");
    this.name = "ConflictError";
    this.sha = sha;
  }
}

export async function push(cfg, { data = null, force = false, onStep = () => {} } = {}){
  if (!cfgReady(cfg)) throw new Error("Mancano proprietario, repository o token.");
  const dump = data || (await exportAll()).data;

  onStep("guardo il ramo");
  const headSha = await head(cfg);
  if (!force && cfg.sha && cfg.sha !== headSha) throw new ConflictError(headSha);

  const { treeSha, files: remote, troncato } = await remoteFiles(cfg, headSha);
  if (troncato) throw new Error("La cartella e' troppo grande per essere letta in un colpo solo.");

  const at = new Date().toISOString();
  const locals = filesFromData(dump, { who: cfg.who, at });
  const index = locals[locals.length - 1];
  const here = new Set(locals.map(f => f.path));

  /* Prima si guarda cosa e' cambiato davvero: senza questo controllo
     ogni salvataggio farebbe un commit anche solo per riscrivere la
     data dell'indice. */
  const changed = [];
  for (const f of locals){
    if (f.path === INDEX) continue;
    const sha = await blobSha(f.b64);
    if (!sha || remote.get(f.path) !== sha) changed.push(f);
  }
  const removed = [...remote.keys()].filter(p => !here.has(p) && keyOf(p) !== null);

  if (!changed.length && !removed.length){
    saveCfg({ sha: headSha });
    return { commit: headSha, changed: 0, removed: 0, at, vuoto: true, paths: [] };
  }

  const tree = [];
  let n = 0;
  for (const f of [...changed, index]){
    onStep(`carico ${++n}/${changed.length + 1} · ${f.path}`);
    const blob = await api(cfg, repoPath(cfg, "/git/blobs"), {
      method: "POST", body: { content: f.b64, encoding: "base64" },
    });
    tree.push({ path: full(cfg, f.path), mode: "100644", type: "blob", sha: blob.sha });
  }
  for (const p of removed)
    tree.push({ path: full(cfg, p), mode: "100644", type: "blob", sha: null });

  onStep("scrivo il commit");
  const newTree = await api(cfg, repoPath(cfg, "/git/trees"), {
    method: "POST", body: { base_tree: treeSha, tree },
  });
  const commit = await api(cfg, repoPath(cfg, "/git/commits"), {
    method: "POST",
    body: { message: commitMessage(cfg, changed, removed), tree: newTree.sha, parents: [headSha] },
  });

  onStep("sposto il ramo");
  await api(cfg, repoPath(cfg, `/git/refs/heads/${encodeURIComponent(cfg.branch)}`), {
    method: "PATCH", body: { sha: commit.sha, force: false },
  });

  saveCfg({ sha: commit.sha, at });
  return { commit: commit.sha, changed: changed.length, removed: removed.length, at, paths: changed.map(f => f.path) };
}

/* Il messaggio dice cosa e' cambiato: scorrendo la cronologia si
   capisce se quel commit era "ho fotografato gli orchi" o "ho segnato
   una partita", senza aprire il diff. */
function commitMessage(cfg, changed, removed){
  const nice = p => BY_PATH.has(p) ? p.replace(/\.json$/, "")
                  : p.startsWith(PHOTO) ? "foto" : "archivio";
  const what = [...new Set(changed.map(f => nice(f.path)))];
  const testa = what.length ? what.slice(0, 4).join(", ") + (what.length > 4 ? "…" : "") : "pulizia";
  const chi = cfg.who ? ` (${cfg.who})` : "";
  const corpo = [...changed.map(f => "  " + f.path), ...removed.map(p => "  − " + p)]
    .slice(0, 60).join("\n");
  return `Archivio: ${testa}${chi}\n\n${corpo}\n`;
}

/* ------------------------------------------------------------------
   5 · Scaricare

   "unisci" tiene le chiavi che esistono solo qui — una foto scattata
   e non ancora salvata non sparisce. "sostituisci" fa dell'archivio
   locale la copia esatta del repository, che e' quello che serve su
   un dispositivo nuovo.
   ------------------------------------------------------------------ */
export async function pull(cfg, { replace = false, onStep = () => {} } = {}){
  if (!cfgReady(cfg)) throw new Error("Mancano proprietario, repository o token.");

  onStep("guardo il ramo");
  const headSha = await head(cfg);
  const { files: remote, troncato } = await remoteFiles(cfg, headSha);
  if (troncato) throw new Error("La cartella e' troppo grande per essere letta in un colpo solo.");
  if (!remote.size) throw new Error("Nel repository non c'e' ancora un archivio: salva da qui la prima volta.");

  /* i file che abbiamo gia' identici non si riscaricano: sono quasi
     sempre le foto, cioe' tutto il peso */
  const mine = new Map();
  for (const f of filesFromData((await exportAll()).data)) mine.set(f.path, f);

  const got = []; let n = 0;
  for (const [path, sha] of remote){
    if (path !== INDEX && keyOf(path) === null) continue;
    const local = mine.get(path);
    if (local && (await blobSha(local.b64)) === sha){ got.push(local); continue; }
    onStep(`scarico ${++n} · ${path}`);
    const blob = await api(cfg, repoPath(cfg, `/git/blobs/${sha}`));
    got.push({ path, b64: String(blob.content || "").replace(/\s+/g, "") });
  }

  const { data, index, skipped } = dataFromFiles(got);

  onStep("scrivo nell'archivio");
  for (const [k, v] of Object.entries(data)) await saveDoc(k, v);
  let tolti = 0;
  if (replace){
    for (const k of await listKeys())
      if (!(k in data)){ await deleteDoc(k); tolti++; }
  }

  saveCfg({ sha: headSha, at: new Date().toISOString() });
  return { commit: headSha, letti: Object.keys(data).length, tolti, saltati: skipped, indice: index };
}

/* Da mostrare nella finestra: siamo allineati o no? Non scarica
   niente, chiede solo dove sta il ramo. */
export async function status(cfg){
  const out = { pronto: cfgReady(cfg), remoto: "", allineato: null, locale: cfg.sha || "" };
  if (!out.pronto) return out;
  out.remoto = await head(cfg);
  out.allineato = !!cfg.sha && cfg.sha === out.remoto;
  return out;
}
