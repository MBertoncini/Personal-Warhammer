/* Schieramento Old World — i lavoratori del Laboratorio, dalla pagina
 *
 * La stessa forma di `apriMotore` in tools/liste/motore.mjs — `gioca`,
 * `chiudi` — ma con i Web Worker: la ricerca (cerca.js) chiama
 * `gioca(job)` e riceve i conti, senza sapere se gira in un terminale o
 * in una scheda del browser.
 *
 * Quanti lavoratori: i processori meno uno, perché la pagina deve
 * restare viva (la barra avanza, «Ferma» risponde). Un telefono ne ha
 * quattro o otto, un portatile otto o sedici; si sceglie dalla pagina.
 *
 * `annulla` butta via il lavoro in coda e spegne i lavoratori: le
 * promesse aperte si rompono con un errore che dice «annullata», e chi
 * ha lanciato la ricerca lo riconosce. Il «ferma» gentile — finire la
 * generazione e tenere quello che c'è — lo fa la ricerca, non il motore.
 *
 * Senza Worker di tipo modulo (qualche browser vecchio) le celle si
 * giocano qui, una alla volta: lente, ma la ricerca arriva in fondo.
 */

export const lavoriDefault = () => Math.max(1, Math.min(16, ((typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4) - 1));

export class Annullata extends Error { constructor(){ super("ricerca annullata"); this.annullata = true; } }

export async function apriMotoreWeb({ lavori = lavoriDefault(), scenari = {}, formato = "scenario", durata = "" } = {}){
  const liberi = [], attese = new Map(), coda = [];
  const tutti = [];
  let prossimo = 0, spento = false, fatte = 0;

  const accendi = () => new Promise(res => {
    let w;
    try { w = new Worker(new URL("./lab-lavoro.js", import.meta.url), { type: "module" }); }
    catch (_){ res(null); return; }
    const t = setTimeout(() => res(null), 15000);
    w.onmessage = e => {
      const m = e.data || {};
      if (m.tipo === "acceso"){ clearTimeout(t); res(w); return; }
      const a = attese.get(m.id); attese.delete(m.id);
      if (a){ if (m.tipo === "errore") a.rej(new Error(m.messaggio)); else { fatte++; a.res(m.r); } }
      liberi.push(w); spingi();
    };
    w.onerror = e => { clearTimeout(t); res(null); if (e && e.preventDefault) e.preventDefault(); };
  });
  const accesi = (await Promise.all(Array.from({ length: lavori }, accendi))).filter(Boolean);
  tutti.push(...accesi);
  liberi.push(...accesi);

  /* senza lavoratori: qui, una cella dopo l'altra */
  let locale = null;
  if (!tutti.length) locale = await import("./lab-partite.js");

  function spingi(){
    while (!spento && liberi.length && coda.length){
      const w = liberi.pop(), { msg, res, rej } = coda.shift();
      attese.set(msg.id, { res, rej });
      w.postMessage(msg);
    }
  }
  let catena = Promise.resolve();
  const gioca = job => {
    if (spento) return Promise.reject(new Annullata());
    const j = { formato, durata, ...job };
    if (!j.def) j.def = scenari[j.scenario];
    if (locale){
      const p = catena.then(() => { if (spento) throw new Annullata(); return locale.giocaCella(j); }).then(r => { fatte++; return r; });
      catena = p.catch(() => {});
      return p;
    }
    return new Promise((res, rej) => { coda.push({ msg: { tipo: "cella", id: ++prossimo, job: j }, res, rej }); spingi(); });
  };
  const chiudi = () => { spento = true; for (const w of tutti) w.terminate(); };
  return {
    lavori: tutti.length || 1, nelBrowser: !locale,
    gioca,
    get fatte(){ return fatte; },
    get inCoda(){ return coda.length + attese.size; },
    chiudi,
    annulla(){
      chiudi();
      for (const { rej } of coda.splice(0)) rej(new Annullata());
      for (const [, { rej }] of attese) rej(new Annullata());
      attese.clear();
    },
  };
}
