/* Schieramento Old World — i profili che il file della lista non porta
 *
 * New Recruit esporta una riga sola per unita'. Per chi va a cavallo —
 * o su un carro, o dietro una macchina da guerra — quella riga ha il
 * Movimento a «-», ed e' giusto cosi': sul libro il cavaliere ha «-»
 * davvero, perche' il Movimento e' della cavalcatura, che sta sulla
 * riga sotto. Quella riga l'export la butta via.
 *
 * Risultato: ventitre' unita' delle liste salvate non sapevano
 * muoversi. Il README lo dichiarava come limite, e per un simulatore
 * un limite cosi' non e' un limite, e' un blocco.
 *
 * Qui non si inventa niente. Il file `dati/profili.json` porta solo
 * numeri letti sul libro, con il libro e la pagina accanto; chi non
 * c'e' resta senza Movimento, e l'app continua a dirlo invece di
 * disegnare un cerchio a caso.
 *
 * Niente DOM, niente archivio: si carica una volta e si interroga.
 */

let TAVOLA = null;

/* Nel browser arriva da fetch, nelle prove da un import: chi chiama
   passa il file gia' letto, cosi' il modulo resta puro. Se il file non
   arriva non succede niente di grave — si resta senza, e chi non ha il
   Movimento continua a dirlo. */
export async function loadProfiles(url = "dati/profili.json"){
  if (TAVOLA) return TAVOLA;
  try { return useProfiles(await (await fetch(url)).json()); }
  catch { return null; }
}

export function useProfiles(data){
  TAVOLA = data && Array.isArray(data.profili) ? data : null;
  return TAVOLA;
}
export const profilesNow = () => TAVOLA;

const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* Il profilo di un'unita' del tavolo, se la tavola ce l'ha. Si cerca
   per nome — quelli con cui New Recruit la scrive — e la fazione, se
   dichiarata da tutte e due, deve combaciare: due eserciti diversi
   possono chiamare una cavalcatura allo stesso modo. */
export function profileFor(u){
  if (!TAVOLA || !u) return null;
  /* l'arbitro numera le unita' omonime («Skink Skirmishers 2») e tiene
     il nome del libro a parte */
  const nome = norm(u.baseName || u.name);
  if (!nome) return null;
  const fazione = norm(u.faction || u.army || "");
  return TAVOLA.profili.find(p => {
    if (!(p.nomi || []).some(n => norm(n) === nome)) return false;
    if (p.faction && fazione && norm(p.faction) !== fazione) return false;
    return true;
  }) || null;
}

/* Il numero che manca sulla riga dell'unita' e sta su un'altra riga
   del profilo diviso (p. 97): l'Abilita' Combattimento di un carro e'
   dei servitori, il Movimento e' dei cinghiali. Si guardano le righe
   nell'ordine in cui il libro le scrive, e vince la prima che quel
   numero ce l'ha.

   Torna `null` quando non si sa: chi chiama deve poter distinguere
   «non c'e'» da «c'e' ed e' zero», che e' la differenza fra un'unita'
   che non si puo' giocare e una che ha davvero Abilita' Balistica 0. */
export function splitStat(u, key){
  const p = profileFor(u);
  for (const r of (p && p.righe) || []){
    const v = (r.stats || {})[key];
    if (v != null && /^\d+$/.test(String(v))) return +v;
  }
  if (p && key === "M" && +p.M > 0) return +p.M;
  return null;
}

/* «Fly (10)» fra le regole: il numero fra parentesi e' quanto vola, ed
   e' il movimento che quell'unita' fa davvero. Il volo l'app non lo sa
   ancora giocare — niente sorvoli, niente atterraggi — ma il numero si
   legge, e un Terradon che si muove di dieci e' piu' vicino al vero di
   un Terradon che non si muove. */
export function flyOf(u){
  for (const r of (u && u.rules) || []){
    const m = String(r).match(/\bfly\s*\(\s*(\d+)/i) || String(r).match(/\bvolo\s*\(\s*(\d+)/i);
    if (m) return +m[1];
  }
  return 0;
}

/* Quanto si muove, e da dove viene il numero. Torna sempre un oggetto,
   anche quando la risposta e' «non si sa»: chi disegna il cerchio deve
   poter scrivere perche' non lo sta disegnando.

     m       i pollici, 0 se non si sanno
     random  «3D6» quando il Movimento e' un tiro e non un numero
     fly     i pollici di volo, quando vola
     from    la riga del libro da cui viene (la cavalcatura, i serventi)
     why     la frase da mostrare */
export function moveInfo(u){
  const nulla = { m: 0, random: "", fly: 0, from: "", book: "", page: 0, why: "" };
  if (!u) return nulla;
  if (u.moveOverride != null && +u.moveOverride > 0)
    return { ...nulla, m: +u.moveOverride, why: "Movimento corretto a mano" };

  const dal = String((u.stats || {}).M || "").match(/^\d+$/);
  const volo = flyOf(u);
  const p = profileFor(u);

  /* chi vola si muove volando: e' il numero che conta in partita */
  const fly = volo || (p && +p.fly) || 0;
  if (fly)
    return { ...nulla, m: fly, fly,
             from: p ? p.da || "" : "", book: p ? p.libro || "" : "", page: p ? p.pagina || 0 : 0,
             why: `vola di ${fly}″` + (p && p.libro ? ` (${p.libro}, p. ${p.pagina})` : "") };

  if (dal) return { ...nulla, m: +dal[0] };

  if (p){
    if (p.random)
      return { ...nulla, random: p.random, from: p.da || "", book: p.libro || "", page: p.pagina || 0,
               why: `il Movimento è ${p.random}: si tira` +
                    (p.libro ? ` (${p.libro}, p. ${p.pagina})` : "") };
    if (+p.M > 0)
      return { ...nulla, m: +p.M, from: p.da || "", book: p.libro || "", page: p.pagina || 0,
               why: `Movimento ${p.M}″ da ${p.da || "la cavalcatura"}` +
                    (p.libro ? ` (${p.libro}, p. ${p.pagina})` : "") };
  }
  return { ...nulla, why: "il file della lista non porta il Movimento: correggilo a mano" };
}
