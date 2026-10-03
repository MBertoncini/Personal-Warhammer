/* Schieramento Old World — una cella del laboratorio
 *
 * La ricerca delle liste, il torneo e la ricerca degli scenari fanno
 * tutti la stessa cosa migliaia di volte: due liste, uno scenario, pochi
 * semi, a specchio, l'euristica con l'estro da tutte e due le parti. È
 * la serie di `tools/liste/gioca.mjs`, con gli stessi semi e lo stesso
 * estro: a parità di liste, gli stessi numeri — dal terminale
 * (tools/liste/motore.mjs) e dalla pagina (lab-lavoro.js).
 *
 * Due cose in più che il terminale non chiedeva:
 *
 *   IL FORMATO. Battle March o il Core Rulebook lo dice lo scenario
 *   (victory.js, `formatFor`: il gruppo). Il laboratorio lo vuole
 *   scegliere: le mappe di Battle March giocate col libro base, sei round
 *   e cento punti di scarto, o un tavolo generato giocato come Battle
 *   March, con i tesori che valgono. Si fa cambiando il gruppo alla
 *   scheda dello scenario, che è da dove l'arbitro lo legge.
 *
 *   LA DURATA. Cinque round, sei, o fino al punto di rottura (p. 291):
 *   `newBattle` la sa già, la serie ora la passa.
 *
 * Niente DOM, niente file: dentro le liste e la scheda, fuori i conti.
 */

import * as AR from './arbitro.js';
import * as AG from './agente.js';
import * as D from './dice.js';
import * as MG from './magic.js';
import * as SE from './serie.js';

export const FORMATI = {
  scenario: "come dice lo scenario",
  bm: "Battle March (5 round, tesori, vince chi ha di più)",
  core: "Core Rulebook (6 round, 100 punti di scarto)",
};
export const DURATE = {
  "": "quella del formato",
  bm: "cinque round",
  fixed: "sei round",
  breakpoint: "fino al punto di rottura (p. 291)",
};

/* la scheda dello scenario col formato voluto: è il gruppo che lo dice */
export function conFormato(def, formato = "scenario"){
  if (!def || !formato || formato === "scenario") return def;
  const bm = def.group === "Battle March";
  if (formato === "bm" && !bm) return { ...def, group: "Battle March" };
  if (formato === "core" && bm) return { ...def, group: "Generici" };
  return def;
}

/* `x`, `y`: le liste. `def`: la scheda dello scenario (serve sempre: il
   lavoratore non sa degli scenari salvati né di quelli generati).
   Torna { vince: {x, y}, pari, n, vp: {x, y}, fuori: { 'x|Clanrats': 2 } }. */
export async function giocaCella({ x, y, scenario, def, partite = 1, seme = 1, formato = "scenario", durata = "" }){
  if (!def || !def.table || !def.deploy) throw new Error(`scenario «${scenario}» senza tavolo o schieramento`);
  const giocate = await SE.giocaSerie({ AR, AG, D, liste: { x, y }, nomi: { x: x.name, y: y.name }, scenario,
    def: conFormato(def, formato), magia: MG.magicNow(), partite, seme, specchio: true, durata: durata || null,
    agente: (lista, nome, s) => AG.agenteEuristico({ nome, estro: D.seeded(SE.semeEstro(s, lista)) }) });
  D.setSource(null);
  const r = { vince: { x: 0, y: 0 }, pari: 0, n: giocate.length, vp: { x: 0, y: 0 }, fuori: {} };
  for (const g of giocate){
    if (g.vincitore) r.vince[g.vincitore]++; else r.pari++;
    r.vp.x += g.vp.x || 0; r.vp.y += g.vp.y || 0;
    for (const f of g.fuori || []) r.fuori[`${f.lista}|${f.name}`] = (r.fuori[`${f.lista}|${f.name}`] || 0) + 1;
  }
  return r;
}
