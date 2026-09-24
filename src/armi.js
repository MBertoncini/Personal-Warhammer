/* Schieramento Old World — le armi delle miniature
 *
 * Venticinque Orchi con l'arma a una mano e quindici con l'arco da
 * guerra non sono quaranta Orchi: sono due pezzi. Un reggimento di
 * trentacinque arcieri, con quelle miniature, non si schiera — a meno
 * che le braccia non siano magnetizzate, o al circolo si giochi per
 * procura. Qui si decide chi puo' fare cosa.
 *
 * Ogni voce del catalogo puo' dire le sue armi (`armi`: «Warbows»,
 * «Shortbows»; vuoto = la dotazione di base) e se si possono schierare
 * anche con altre (`altreArmi`). Le voci con lo stesso nome e armi
 * diverse sono pezzi diversi dello stesso tipo.
 *
 * Due domande, e le fanno sia l'app (la copertura delle liste) sia la
 * ricerca delle liste sulla collezione (tools/liste/spazio.mjs):
 *   - di quale classe e' questa unita'? quella delle armi che porta;
 *   - le miniature bastano? ogni classe prende prima le sue, e quelle
 *     che si possono schierare con altre armi coprono il resto.
 *
 * Niente DOM, niente archivio.
 */

const stem = w => w.replace(/(?<=.{3})s$/, "");
/* «hand weapon» e' la dotazione di tutti: non distingue un pezzo */
const BASE = new Set(["hand", "weapon", "and", "with", "con", "e"]);

const words = s => String(s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9\s]/g, " ")
  .split(/\s+/).filter(Boolean).map(stem);

/* La classe delle armi: «Warbows» e «warbow» sono la stessa, e «Hand
   weapons» e' nessuna. Le parole in ordine, perche' «Spear & shield» e
   «Shield & spear» sono lo stesso pezzo. */
export function armiKey(s){
  return [...new Set(words(s).filter(w => !BASE.has(w)))].sort().join(" ");
}

/* l'unita' porta le armi della classe? (le parole della classe stanno
   tutte fra quelle delle sue armi) */
export function portaArmi(key, weapons = []){
  if (!key) return true;
  const have = new Set((weapons || []).flatMap(w => words(typeof w === "string" ? w : w && w.name)));
  return key.split(" ").every(w => have.has(w));
}

/* La classe di un'unita' fra le classi possibili del suo tipo: la piu'
   specifica che porta (due parole battono una), altrimenti la base. */
export function classeDi(weapons, classi = []){
  let best = "", n = 0;
  for (const k of classi){
    if (!k || !portaArmi(k, weapons)) continue;
    const w = k.split(" ").length;
    if (w > n){ best = k; n = w; }
  }
  return best;
}

/* Bastano le miniature?
     serve   Map classe -> quanti modelli
     scorte  [{ armi: classe, libere: bool, n }]
   Ogni classe usa prima le sue miniature fisse, poi le sue libere; le
   libere che avanzano vanno in comune e coprono quello che manca. E'
   la distribuzione migliore: una miniatura fissa serve solo la sua
   classe, e usarla prima non toglie niente a nessuno.
   Ritorna { ok, manca: Map classe -> scoperto, prestate: Map classe ->
   quante prese dalle libere di altre classi }. */
export function assegna(serve, scorte = []){
  const fisse = new Map(), libere = new Map();
  for (const s of scorte){
    const m = s.libere ? libere : fisse;
    m.set(s.armi || "", (m.get(s.armi || "") || 0) + (+s.n || 0));
  }
  const buchi = new Map();
  let comune = 0;
  for (const [k, n] of libere) if (!serve.has(k)) comune += n;
  for (const [k, q] of serve){
    const f = fisse.get(k) || 0, l = libere.get(k) || 0;
    const dopo = q - f;
    if (dopo <= 0){ comune += l; continue; }
    if (dopo <= l){ comune += l - dopo; continue; }
    buchi.set(k, dopo - l);
  }
  const manca = new Map(), prestate = new Map();
  for (const [k, b] of buchi){
    const presi = Math.min(b, comune);
    comune -= presi;
    if (presi) prestate.set(k, presi);
    if (b > presi) manca.set(k, b - presi);
  }
  return { ok: !manca.size, manca, prestate };
}

/* quanti modelli di una classe si potrebbero schierare, da soli */
export function quanti(k, scorte = []){
  return scorte.reduce((s, x) => s + ((x.libere || (x.armi || "") === (k || "")) ? +x.n || 0 : 0), 0);
}
