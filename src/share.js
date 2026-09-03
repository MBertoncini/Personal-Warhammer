/* Schieramento Old World — schieramento dentro un link
 *
 * I dati stanno in IndexedDB, cioe' su quel browser e basta. Per
 * mostrare a un avversario come hai schierato non serve pero' una
 * nuvola: uno schieramento senza foto sono due o tre kilobyte, e
 * compressi entrano comodi nel frammento di un URL.
 *
 * Il frammento (dopo il #) non arriva mai al server: anche pubblicando
 * su GitHub Pages, il tavolo che condividi resta fra te e chi apre il
 * link.
 *
 * Formato:  #s=<versione><base64url>
 *   1 = JSON compresso con deflate       (CompressionStream)
 *   0 = JSON in chiaro                   (browser che non ce l'hanno)
 */

const MARK = "#s=";

/* Le foto no: sono megabyte e vivono nel catalogo di chi le ha. Regole
   e armi nemmeno: chi apre il link vuole vedere le posizioni. */
const UNIT_KEEP = [
  "uid", "army", "name", "models", "baseId", "baseW", "baseH", "frontage",
  "loose", "pts", "us", "troop", "maxRange", "stats", "x", "y", "rot",
  "placed", "lost", "dead",
];

export function trimSnapshot(s){
  return {
    v: 1,
    armies: { A: { name: s.armies?.A?.name || "" }, B: { name: s.armies?.B?.name || "" } },
    scenario: s.scenario, tableW: s.tableW, tableH: s.tableH, gap: s.gap,
    labels: s.labels !== false, photos: s.photos !== false,
    terrain: (s.terrain || []).map(t => ({
      tid: t.tid, kind: t.kind,
      x: Math.round(t.x * 10) / 10, y: Math.round(t.y * 10) / 10,
      w: t.w, h: t.h, rot: t.rot || 0,
    })),
    units: (s.units || []).map(u => {
      const o = {};
      for (const k of UNIT_KEEP) if (u[k] !== undefined && u[k] !== null && u[k] !== "") o[k] = u[k];
      o.x = Math.round(u.x * 10) / 10; o.y = Math.round(u.y * 10) / 10;
      o.rules = []; o.weapons = [];      // il resto del codice se li aspetta
      return o;
    }),
  };
}

/* --- base64url a mano ---
   Si potrebbe passare da btoa, ma btoa vuole una stringa binaria e su
   quella strada ci sono due trappole: fromCharCode(...) su qualche
   centinaio di kB fa saltare lo stack, e non tutte le implementazioni
   accettano i byte oltre il 127. Sessanta byte di tabella e il
   problema non si pone piu'. */
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const REV = (() => { const m = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHA.length; i++) m[ALPHA.charCodeAt(i)] = i; return m; })();

function b64(bytes){
  let out = "";
  for (let i = 0; i < bytes.length; i += 3){
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += ALPHA[a >> 2];
    out += ALPHA[((a & 3) << 4) | (b === undefined ? 0 : b >> 4)];
    if (b === undefined) break;
    out += ALPHA[((b & 15) << 2) | (c === undefined ? 0 : c >> 6)];
    if (c === undefined) break;
    out += ALPHA[c & 63];
  }
  return out;      // senza "=": nel frammento di un URL fa solo rumore
}

function unb64(str){
  const clean = str.replace(/[^A-Za-z0-9\-_]/g, "");
  const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let n = 0, acc = 0, bits = 0;
  for (let i = 0; i < clean.length; i++){
    const v = REV[clean.charCodeAt(i)];
    if (v < 0) continue;
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8){ bits -= 8; out[n++] = (acc >> bits) & 0xff; }
  }
  return out.subarray(0, n);
}

async function squeeze(bytes){
  if (typeof CompressionStream === "undefined") return null;
  const cs = new CompressionStream("deflate");
  const w = cs.writable.getWriter();
  w.write(bytes); w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}
async function unsqueeze(bytes){
  const ds = new DecompressionStream("deflate");
  const w = ds.writable.getWriter();
  w.write(bytes); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

export async function encodeBoard(snapshot){
  const json = JSON.stringify(trimSnapshot(snapshot));
  const raw = new TextEncoder().encode(json);
  const packed = await squeeze(raw).catch(() => null);
  return packed && packed.length < raw.length ? "1" + b64(packed) : "0" + b64(raw);
}

export async function decodeBoard(code){
  if (!code) return null;
  const kind = code[0], body = unb64(code.slice(1));
  const raw = kind === "1" ? await unsqueeze(body) : body;
  const obj = JSON.parse(new TextDecoder().decode(raw));
  if (!obj || !Array.isArray(obj.units)) throw new Error("link non valido");
  return obj;
}

export async function shareUrl(snapshot, base){
  const href = base || (location.origin + location.pathname);
  return href + MARK + await encodeBoard(snapshot);
}

/* legge e cancella il frammento: ricaricare la pagina non deve
   riportare a galla uno schieramento che nel frattempo hai cambiato */
export function readShareCode({ consume = true } = {}){
  const h = String(location.hash || "");
  if (!h.startsWith(MARK)) return null;
  const code = h.slice(MARK.length);
  if (consume && history.replaceState)
    history.replaceState(null, "", location.pathname + location.search);
  return code;
}

export async function copyText(text){
  try {
    if (navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand && document.execCommand("copy");
    ta.remove();
    return !!ok;
  } catch (_) { return false; }
}
