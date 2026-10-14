/* Schieramento Old World — il tavolo 3D, senza three.js
 *
 * Le cose della vista 3D (vista3d.js) che sono conti e non disegno, qui
 * perche' si possano provare senza un browser:
 *
 *   - QUANTO SALE IL SUOLO. Una collina e' una cupola dolce con la cima
 *     piatta, e la stessa funzione fa la sua forma e dice a che altezza
 *     sta chi ci cammina sopra: se fossero due conti diversi, le
 *     miniature affonderebbero nell'erba o resterebbero sospese. Boschi,
 *     rovine e paludi hanno una lastra sottile, e chi ci entra ci sale.
 *   - DOVE SI APPOGGIA UNA BASETTA. Su un pendio la basetta si inclina
 *     come la collina sotto di lei (e la miniatura con lei, come al
 *     tavolo vero), e si alza quanto basta perche' nessun punto del
 *     suolo le resti sopra: tocca, non entra.
 *   - CHI STA IN UN BOSCO O FRA LE ROVINE: quei pezzi si fanno
 *     trasparenti, se no gli alberi e i muri nascondono proprio chi ci
 *     combatte dentro.
 *   - CHE COSA SI LEGGE passando sopra un pezzo, e l'etichetta che gli
 *     sta sopra la testa: le stesse cose della partita da rivedere in 2D
 *     (nome, modelli rimasti, ferite, fuga, mischia).
 *
 * Coordinate del tavolo: x e y in millimetri, rotazioni in gradi come il
 * disegno SVG. L'alto (la quota) e' in millimetri.
 */

const RAD = Math.PI / 180;

/* ============================================================
   1 · IL SUOLO
   ============================================================ */

/* le lastre piatte: chi ci sta sopra sale del loro spessore */
export const LASTRA = { wood: 3, ruins: 3, marsh: 1.5 };
/* i pezzi alti in cui si entra: si fanno trasparenti quando c'e' qualcuno */
export const VELABILI = new Set(["wood", "ruins"]);

const tondo = t => t.forma === "circle" || t.forma === "token";

/* quanto e' alta una collina: un pollice abbondante per una collina
   normale, meno per una piccola, mai una montagna. Con la cima piatta
   e i fianchi dolci il pendio resta sotto i trenta gradi circa, e una
   miniatura inclinata come la collina si guarda ancora. */
export const altezzaCollina = t => Math.max(15, Math.min(40, Math.min(t.w, t.h) * .15));
/* la cima piatta, in frazione del raggio */
const CIMA = .25;
/* il profilo della collina: 1 sulla cima, 0 sul bordo, il coseno in
   mezzo (pendenza zero in cima e al piede, niente gradini) */
export const profilo = r => r >= 1 ? 0 : r <= CIMA ? 1 : .5 * (1 + Math.cos(Math.PI * (r - CIMA) / (1 - CIMA)));

/* L'esponente della forma: 2 un'ellisse; 4 un rettangolo dagli angoli
   tondi, che e' come si fa una collina rettangolare; Infinity il
   rettangolo vero, quello delle lastre. */
export function esponente(t){
  if (tondo(t)) return 2;
  return t.kind === "hill" ? 4 : Infinity;
}

/* il punto nelle coordinate del pezzo, da -1 a 1 dentro */
function locale(t, x, y){
  const a = (t.rot || 0) * RAD, dx = x - t.x, dy = y - t.y;
  const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a);
  return [lx / (t.w / 2 || 1), ly / (t.h / 2 || 1)];
}
/* quanto e' lontano dal centro del pezzo: 1 sul bordo, piu' di 1 fuori */
export function raggio(t, x, y){
  const [u, v] = locale(t, x, y), p = esponente(t);
  if (p === 2) return Math.hypot(u, v);
  if (p === Infinity) return Math.max(Math.abs(u), Math.abs(v));
  return Math.pow(u ** 4 + v ** 4, .25);
}

/* La quota del suolo in un punto del tavolo. Dove due pezzi si
   sovrappongono vale il piu' alto. */
export function quota(terreno, x, y){
  let h = 0;
  for (const t of terreno || []){
    if (t.kind === "hill"){
      const r = raggio(t, x, y);
      if (r < 1) h = Math.max(h, altezzaCollina(t) * profilo(r));
    } else if (LASTRA[t.kind] && LASTRA[t.kind] > h && raggio(t, x, y) <= 1) h = LASTRA[t.kind];
  }
  return h;
}

/* La forma della collina per chi la disegna: il punto del bordo
   nella direzione `a` (radianti), in frazione dei semiassi. Con
   l'esponente 4 e' la stessa curva che `raggio` chiama 1. */
export function bordoCollina(t, a){
  const p = esponente(t), c = Math.cos(a), s = Math.sin(a);
  if (p === 2) return [c, s];
  const k = 2 / p;
  return [Math.sign(c) * Math.pow(Math.abs(c), k), Math.sign(s) * Math.pow(Math.abs(s), k)];
}

/* Dove si appoggia una basetta: il centro (x, y), larga `w` lungo il
   fronte e profonda `h`, girata di `rot` gradi. Il suolo si misura in
   nove punti (gli angoli, le meta' dei lati, il centro); la pendenza
   viene dai lati opposti, e la basetta si alza quanto basta perche'
   nessuno dei nove punti le resti sopra. Torna la quota del centro e
   la pendenza nelle coordinate del tavolo (quanto sale per millimetro
   verso x e verso y). */
export function appoggio(terreno, x, y, w, h, rot = 0){
  if (!terreno || !terreno.length) return { z: 0, gx: 0, gy: 0 };
  const a = rot * RAD, co = Math.cos(a), si = Math.sin(a);
  const q = [];
  let qualcosa = false;
  for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]){
    const lx = i * w / 2, ly = j * h / 2;
    const z = quota(terreno, x + lx * co - ly * si, y + lx * si + ly * co);
    if (z) qualcosa = true;
    q.push({ lx, ly, z });
  }
  if (!qualcosa) return { z: 0, gx: 0, gy: 0 };
  const Q = (i, j) => q[(i + 1) * 3 + (j + 1)].z;
  const sx = w > 0 ? (Q(1, 0) - Q(-1, 0)) / w : 0;
  const sy = h > 0 ? (Q(0, 1) - Q(0, -1)) / h : 0;
  let z = 0;
  for (const p of q) z = Math.max(z, p.z - sx * p.lx - sy * p.ly);
  return { z, gx: sx * co - sy * si, gy: sx * si + sy * co };
}

/* I boschi e le rovine in cui sta qualcuno: gli indici dei pezzi del
   terreno che hanno dentro almeno uno dei punti (i centri delle
   basette). */
export function occupati(terreno, punti){
  const out = new Set();
  (terreno || []).forEach((t, i) => {
    if (!VELABILI.has(t.kind)) return;
    for (const [x, y] of punti) if (raggio(t, x, y) <= 1){ out.add(i); return; }
  });
  return out;
}

/* ============================================================
   2 · CHE COSA SI LEGGE
   `u` e' un'unita' della fotografia della vista: `nome`, `esercito`,
   `celle` (con `char` e `nome` per i personaggi uniti) e `info`, che
   chi chiama riempie con quello che sa:
     vivi, totale     i modelli in piedi e quelli di partenza
     ferite           { prese, per }: del modello in piedi, se ne ha piu' di una
     fuga, mischia    vero o falso
     tipo             «Fanteria», «Cavalleria»...
     stato            le parole del tavolo (Stupidita'...), una lista
   ============================================================ */
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function conti(u){
  const i = u.info || {};
  const truppa = (u.celle || []).filter(c => !c.char).length;
  const vivi = i.vivi != null ? i.vivi : truppa || 1;
  const totale = i.totale != null ? i.totale : vivi;
  const fe = i.ferite && i.ferite.per > 1 ? { restano: Math.max(0, i.ferite.per - (i.ferite.prese || 0)), per: i.ferite.per } : null;
  const capi = (u.celle || []).filter(c => c.char && c.nome).map(c => c.nome);
  return { i, vivi, totale, fe, capi };
}

/* l'etichetta sopra la testa: come il nome sul disegno 2D */
export function etichetta(u){
  const { i, vivi, totale, fe } = conti(u);
  return String(u.nome || "").replace(/\s+\d+$/, "") +
    (totale > 1 ? ` ${vivi}/${totale}` : "") +
    (fe ? ` ♥${fe.restano}/${fe.per}` : "") + (i.fuga ? " ⚑" : "") + (i.mischia ? " ⚔" : "");
}

/* la scheda di chi ci passi sopra. `cella`: la basetta toccata, se e'
   quella di un personaggio si parla di lui e del reggimento che lo
   ospita. `nomi`: i nomi dei due eserciti. */
export function schedaHTML(u, { nomi = {}, cella = null } = {}){
  const { i, vivi, totale, fe, capi } = conti(u);
  const capo = cella && cella.char && cella.nome ? cella.nome : "";
  const stato = [i.fuga ? "in fuga" : "", i.mischia ? "in mischia" : "", ...(i.stato || [])].filter(Boolean);
  const nome = String(u.nome || "").replace(/\s+\d+$/, "");
  return `<b>${esc(capo || nome)}</b>` +
    `<span class="v3d-es v3d-es-${u.esercito === "B" ? "B" : "A"}">${esc(nomi[u.esercito] || "esercito " + u.esercito)}</span>` +
    (capo ? `<div class="v3d-mut">unito a ${esc(nome)}</div>` : "") +
    (i.tipo && !capo ? `<div class="v3d-mut">${esc(i.tipo)}</div>` : "") +
    `<div>${totale > 1 ? `<b>${vivi}</b> modelli su ${totale}${vivi < totale ? ` <span class="v3d-perso">(−${totale - vivi})</span>` : ""}` : "un modello"}` +
    (fe ? `, ferite <b>${fe.restano}</b> su ${fe.per}` : "") + `</div>` +
    (capi.length && !capo ? `<div>con ${capi.map(esc).join(", ")}</div>` : "") +
    (stato.length ? `<div class="v3d-stato-u">${stato.map(esc).join(" · ")}</div>` : "");
}

/* la scheda di un pezzo di terreno: il nome, la categoria e che cosa fa
   (le righe le scrive chi chiama, da terrain.js) */
export function terrenoHTML(t){
  const nome = t.label || t.kind || "terreno";
  const righe = t.righe || [];
  /* la categoria: `categoria` dal tavolo dell'app, `cat` gia' scritta per
     esteso dalla partita da rivedere */
  const cat = t.categoria != null ? t.categoria : t.cat;
  return `<b>${esc(nome)}</b>` + (cat && cat !== nome ? `<span class="v3d-es">${esc(cat)}</span>` : "") +
    (t.decor ? `<div class="v3d-mut">decorazione: si ignora per il movimento e il combattimento</div>` : "") +
    (righe.length ? `<ul>${righe.map(r => `<li>${esc(r)}</li>`).join("")}</ul>` : "");
}
