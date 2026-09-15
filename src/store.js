/* Schieramento Old World — archivio locale su IndexedDB
 *
 * localStorage sta in 5 MB e un catalogo di collezione li sfonda.
 * IndexedDB non ha un limite fisso: il browser concede quota in base
 * allo spazio libero del disco, di solito centinaia di MB.
 *
 * Tutto sta in un unico object store chiave -> valore. Le foto hanno
 * una chiave loro ("photo:<id>") cosi' salvare il catalogo non
 * riscrive ogni volta i megabyte delle immagini.
 */

import { emit } from './bus.js';

const DB_NAME = "tow-old-world";
const DB_VER  = 1;
const STORE   = "kv";

let dbPromise = null;

function db(){
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    };
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
  return dbPromise;
}

function tx(mode, fn){
  return db().then(d => new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const r = fn(s);
    t.oncomplete = () => res(r && "result" in r ? r.result : undefined);
    t.onerror    = () => rej(t.error);
    t.onabort    = () => rej(t.error);
  }));
}

export function loadDoc(key, fallback = null){
  return tx("readonly", s => s.get(key))
    .then(v => (v === undefined ? fallback : v))
    .catch(() => fallback);
}

export function saveDoc(key, value){
  return tx("readwrite", s => s.put(value, key))
    .then(() => { emit("store:changed", key); })
    .catch(err => {
      console.warn("salvataggio fallito", key, err);
      throw err;
    });
}

export function deleteDoc(key){
  return tx("readwrite", s => s.delete(key))
    .then(() => { emit("store:changed", key); })
    .catch(() => {});
}

export function listKeys(prefix = ""){
  return tx("readonly", s => s.getAllKeys())
    .then(ks => (ks || []).filter(k => String(k).startsWith(prefix)))
    .catch(() => []);
}

/* quanto spazio stiamo occupando, per mostrarlo nel catalogo */
export async function usage(){
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota };
  } catch (_) { return null; }
}

/* ------------------------------------------------------------------
   Foto: ridimensionate prima di essere salvate. Una foto da telefono
   e' 3-5 MB; qui diventa un quadrato da 256 px, circa 15 KB.
   ------------------------------------------------------------------ */
const THUMB_PX = 256;

export function shrinkImage(file, size = THUMB_PX){
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error("lettura fallita"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error("immagine non valida"));
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = c.height = size;
        const g = c.getContext("2d");
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, size, size);
        const k = Math.min(size / img.width, size / img.height);
        const w = img.width * k, h = img.height * k;
        g.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        res(c.toDataURL("image/jpeg", 0.8));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------
   La stessa foto, intera.
   La miniatura da 256 px e' quello che serve a disegnare: sta in
   memoria per tutte le voci insieme, viaggia dentro gli SVG esportati
   e finisce nel repository della Nuvola. Ma e' anche tutto quello che
   restava di uno scatto fatto apposta per far vedere come e' venuto
   il mantello, ed e' una perdita che non si recupera piu'.

   Cosi' adesso sono due cose distinte: la miniatura per l'app,
   l'originale per gli occhi. L'originale si carica solo quando lo si
   guarda, e non entra in nessuno dei posti dove il peso conta.

   `max` e' un tetto di cortesia sul lato lungo: 0 vuol dire "il file
   com'e'". Sopra il tetto si ridimensiona una volta sola, in JPEG,
   perche' quattromila pixel di lato dentro IndexedDB sono un modo
   silenzioso di riempire la quota e far buttare via tutto al browser.
   ------------------------------------------------------------------ */
export const FULL_MAX_PX = 2048;

export function readImage(file, { max = FULL_MAX_PX } = {}){
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error("lettura fallita"));
    fr.onload = () => {
      const src = fr.result;
      const img = new Image();
      img.onerror = () => rej(new Error("immagine non valida"));
      img.onload = () => {
        const long = Math.max(img.width, img.height);
        /* sotto il tetto non si tocca niente: re-comprimere un file
           gia' buono lo peggiora e basta, e a una PNG toglierebbe
           anche la trasparenza */
        if (!max || long <= max)
          return res({ data: src, w: img.width, h: img.height, resized: false });
        const k = max / long;
        const w = Math.max(1, Math.round(img.width * k));
        const h = Math.max(1, Math.round(img.height * k));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        res({ data: c.toDataURL("image/jpeg", 0.92), w, h, resized: true });
      };
      img.src = src;
    };
    fr.readAsDataURL(file);
  });
}

/* Quanto pesa un dataURL, in byte veri: il base64 gonfia di un terzo,
   e dirlo storto accanto a «quota piena» sarebbe peggio che tacere. */
export function dataUrlBytes(data){
  const s = String(data || "");
  const i = s.indexOf(",");
  if (i < 0) return 0;
  const b64 = s.slice(i + 1);
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(b64.length * 3 / 4) - pad);
}

export function pickImage(){
  return new Promise(res => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "image/*";
    inp.style.display = "none";
    document.body.appendChild(inp);
    inp.addEventListener("change", () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      res(f || null);
    });
    inp.addEventListener("cancel", () => { inp.remove(); res(null); });
    inp.click();
  });
}

/* Archivio persistente: senza questa richiesta il browser considera i
   dati "best effort" e puo' buttarli via da solo (Safari dopo ~7 giorni
   senza visite, Chrome quando il disco va in pressione). Con il permesso
   concesso restano finche' non li cancella l'utente. Va chiesto ad ogni
   avvio: e' idempotente, se il permesso c'e' gia' risponde subito true.
   Su file:// l'API non esiste e torniamo null: nessun errore, ma nemmeno
   nessuna garanzia. */
export async function requestPersistence(){
  if (!navigator.storage || !navigator.storage.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch (_) { return null; }
}

/* Sola lettura: Firefox mostra un permesso quando si chiama persist(),
   quindi per disegnare lo stato nel catalogo si guarda e basta. */
export async function isPersisted(){
  if (!navigator.storage || !navigator.storage.persisted) return null;
  try { return await navigator.storage.persisted(); }
  catch (_) { return null; }
}

/* ------------------------------------------------------------------
   Esporta / importa tutto: serve per spostare la collezione da un
   dispositivo all'altro, visto che IndexedDB e' legato al browser.
   ------------------------------------------------------------------ */
export async function exportAll(){
  const keys = await listKeys();
  const out = {};
  for (const k of keys) out[k] = await loadDoc(k);
  return { format: "tow-old-world/1", exported: new Date().toISOString(), data: out };
}

export async function importAll(dump, { replace = false } = {}){
  if (!dump || dump.format !== "tow-old-world/1") throw new Error("file non riconosciuto");
  if (replace) for (const k of await listKeys()) await deleteDoc(k);
  for (const [k, v] of Object.entries(dump.data || {})) await saveDoc(k, v);
}
