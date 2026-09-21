/* Schieramento Old World — le cavalcature dei personaggi
 *
 * Un Grey Seer sulla Screaming Bell non e' un Grey Seer con una regola
 * in piu': e' un altro pezzo. Basetta 60×100 invece di 25×25, carro
 * pesante invece di fanteria, sette Ferite invece di due, un Rat Ogre
 * che mena accanto a lui e una campana che fa Terrore. Tutto quello che
 * il tavolo sa fare — l'ingombro, il Movimento, chi si puo' unire a
 * chi, la Forza d'Unita', l'assalto — passa da quei numeri, e finche'
 * la lista non li cambia il tavolo gioca un Grey Seer a piedi.
 *
 * Due strade portano qui.
 *
 *  - **La scelta a mano**, nella scheda della lista: il personaggio ha
 *    una tendina con le cavalcature che il libro gli concede, e sotto
 *    le altre dell'esercito — l'app propone, non impedisce.
 *  - **Il file di New Recruit**, che esporta il personaggio gia' montato
 *    ma con la basetta e il tipo di truppa del cavaliere: lo Skink
 *    Priest da 290 punti arrivava su una 25×25 con le corna dello
 *    Stegadon fra le armi. La `firma` di ogni cavalcatura lo riconosce,
 *    e montarlo da li' non somma i punti una seconda volta.
 *
 * Montare non butta via niente: quello che il personaggio era a piedi
 * resta in `u.foot`, e smontare lo rimette com'era.
 *
 * I numeri stanno in `dati/cavalcature.json`, letti sui libri con la
 * pagina accanto. Niente DOM, niente archivio: si carica una volta e si
 * interroga, e le prove passano il file gia' letto.
 */

import { BASES } from './bases.js';

let TAVOLA = null;

export async function loadMounts(url = "dati/cavalcature.json"){
  if (TAVOLA) return TAVOLA;
  try { return useMounts(await (await fetch(url)).json()); }
  catch { return null; }
}
export function useMounts(data){
  TAVOLA = data && Array.isArray(data.cavalcature) ? data : null;
  return TAVOLA;
}
export const mountsNow = () => TAVOLA;
export const allMounts = () => (TAVOLA ? TAVOLA.cavalcature.slice() : []);
export const mountById = id => allMounts().find(m => m.id === id) || null;

const norm = s => String(s || "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").trim();
/* «1 Grey Seer», «Grey Seers»: il numero davanti e il plurale non
   cambiano chi e' */
const riderKey = s => norm(s).replace(/^\d+\s+/, "").replace(/s$/, "");

/* ============================================================
   1 · CHI PUO' MONTARE COSA
   ============================================================ */
export const rides = (m, u) =>
  !!m && !!u && (m.cavalieri || []).some(c => riderKey(c) === riderKey(u.baseName || u.name));

/* La fazione, quando la si sa: quella scritta sull'unita' o quella del
   file della lista. Una lista scritta a mano non la porta, e allora non
   si scarta niente. */
function sameFaction(m, faction){
  const f = norm(faction);
  if (!f || !m.faction) return true;
  const g = norm(m.faction);
  return f === g || f.includes(g) || g.includes(f);
}

/* Le cavalcature da proporre a un personaggio, in due gruppi: quelle che
   il libro gli concede e le altre del suo esercito. Il secondo gruppo
   non e' un errore da nascondere: al circolo si gioca anche con le
   proxy e con le regole della casa, e chi sceglie fuori dal libro lo
   vede scritto accanto. */
export function mountOptions(u, faction = ""){
  const f = (u && u.faction) || faction;
  const pool = allMounts().filter(m => sameFaction(m, f));
  return {
    book: pool.filter(m => rides(m, u)),
    other: pool.filter(m => !rides(m, u)),
  };
}

/* ============================================================
   2 · UN PERSONAGGIO CHE IL FILE HA GIA' MONTATO
   ============================================================ */
/* Tutto quello che il file dice di un'unita', in una borsa di nomi:
   regole, armi, e i profili dopo il primo (il primo e' il cavaliere). */
function namesOf(u){
  const out = new Set();
  for (const r of (u && u.rules) || []) out.add(norm(r));
  for (const w of (u && u.weapons) || []) out.add(norm(w.name));
  for (const p of ((u && u.profiles) || []).slice(1)) out.add(norm(p.name));
  if (u && u.mount && u.mount.name) out.add(norm(u.mount.name));
  return out;
}

/* Un modello solo, e un personaggio: una mandria di Squig o un
   reggimento di Boar Boyz portano la stessa firma della cavalcatura e
   non sono un capo montato. */
const looksLikeCharacter = u => (u.models || 1) === 1 &&
  (/character|personagg/i.test(u.slot || "") || /\(\s*(named\s+)?character\s*\)/i.test(u.troop || ""));

/* La cavalcatura che il file lascia intravedere, o null. Vince il
   gruppo di nomi piu' lungo che combacia per intero, e a parita' quella
   che il libro concede a quel personaggio: Stegadon e Ancient Stegadon
   hanno le stesse corna, e lo Skink Priest puo' cavalcare solo il
   secondo. */
export function guessMount(u, faction = ""){
  if (!u || u.mountId || !TAVOLA || !looksLikeCharacter(u)) return null;
  const have = namesOf(u);
  if (!have.size) return null;
  const f = u.faction || faction;
  let best = null, bestScore = 0;
  for (const m of allMounts()){
    if (!sameFaction(m, f)) continue;
    let score = 0;
    for (const group of m.firma || []){
      if (group.length && group.every(n => have.has(norm(n)))) score = Math.max(score, group.length);
    }
    if (!score) continue;
    score = score * 2 + (rides(m, u) ? 1 : 0);
    if (score > bestScore){ best = m; bestScore = score; }
  }
  return best;
}

/* Il tipo di truppa che conta al tavolo. Il personaggio montato da qui
   ha gia' quello della cavalcatura; quello che il file porta con la
   cavalcatura accanto ma il tipo del cavaliere («Heavy infantry» per
   un Oldblood sul Carnosauro) no, e finiva dentro gli Skink. Qui vale
   la cavalcatura: quella della tabella, se la si conosce, e se la
   tabella non e' caricata il Large Target, che e' dei mostri (p. 195).
   Il file non si tocca: e' una lettura. */
export function troopOf(u){
  if (!u) return "";
  const troop = u.troop || "";
  if (u.mountId || !u.mount || !u.mount.name || (u.models || 1) !== 1) return troop;
  const m = allMounts().find(x => norm(x.nome) === norm(u.mount.name));
  if (m) return `${m.troop} (character)`;
  if ((u.rules || []).some(r => /^large target/i.test(String(r)))) return "Monstrous creature (character)";
  return troop;
}

/* ============================================================
   3 · MONTARE E SMONTARE
   ============================================================ */
/* Quello che la cavalcatura cambia, e che smontare deve rimettere. */
const FOOT_KEYS = ["stats", "profiles", "mount", "baseId", "baseW", "baseH", "troop", "slot",
                   "frontage", "loose", "rules", "ruleText", "weapons", "maxRange",
                   "armour", "ward", "us", "models"];

const copy = v => v == null ? v : JSON.parse(JSON.stringify(v));
const num = v => { const m = String(v ?? "").match(/^\s*(\d+)/); return m ? +m[1] : 0; };
const clampSave = n => (n >= 7 || n <= 0 ? 0 : Math.max(2, Math.min(6, n)));
/* la salvezza migliore fra due: il numero piu' basso che non sia zero */
const bestSave = (a, b) => (!a ? b || 0 : !b ? a : Math.min(a, b));

/* Il profilo del modello intero. I tre generi del Core Rulebook
   (pp. 204-205) cambiano due righe sole:
     cavalcatura e mostro  Resistenza e Ferite migliorate di quanto dice
                           la riga della bestia («(+1)», «(+4)»)
     carro                 le Ferite del personaggio si sommano a quelle
                           del carro, e si ferisce sulla Resistenza piu'
                           alta delle due
   Il Movimento e' sempre della cavalcatura. Tutto il resto resta del
   cavaliere: si colpisce sulla sua Abilita', e lui mena con i suoi
   Attacchi — quelli della bestia li tirano le righe della cavalcatura. */
export function combinedStats(rider = {}, m = {}){
  const out = { ...(rider || {}) };
  out.M = m.random ? String(m.random) : String(m.M ?? out.M ?? "-");
  if (m.genere === "carro"){
    out.T = String(Math.max(num(out.T), +m.T || 0));
    out.W = String(num(out.W) + (+m.W || 0));
  } else {
    if (m.piuT) out.T = String(num(out.T) + (+m.piuT || 0));
    if (m.piuW) out.W = String(num(out.W) + (+m.piuW || 0));
  }
  return out;
}

/* La riga della bestia che porta il Movimento — sul carro dei cinghiali
   e' quella dei cinghiali, non quella del carro — e che l'ispettore
   mostra sotto il cavaliere. Un Movimento che si tira non e' un numero
   da scrivere in quella casella. */
function beastRow(m){
  const rows = m.righe || [];
  const r = rows.find(x => /^\d+$/.test(String((x.stats || {}).M ?? ""))) || rows[0] || { chi: m.nome, stats: {} };
  const stats = { ...(r.stats || {}) };
  if (m.random) stats.M = "-";
  return { chi: r.chi || m.nome, stats };
}

export function mountUnit(u, m, { fromFile = false } = {}){
  if (!u || !m) return u;
  if (u.foot) dismountUnit(u);
  const foot = {};
  for (const k of FOOT_KEYS) if (u[k] !== undefined) foot[k] = copy(u[k]);
  u.foot = foot;

  const rider = foot.stats || {};
  const beast = beastRow(m);
  const b = m.base || [0, 0];
  const w = Math.min(+b[0] || 25, +b[1] || 25), h = Math.max(+b[0] || 25, +b[1] || 25);
  const known = BASES.find(x => x.w === w && x.h === h);

  u.mountId = m.id;
  u.mountFromFile = !!fromFile;
  u.mountPts = fromFile ? 0 : (+m.punti || 0);
  u.mount = {
    id: m.id, name: m.nome, genere: m.genere, stats: beast.stats, row: beast.chi,
    righe: copy(m.righe || []), forzaUrto: +m.forzaUrto || 0,
    random: m.random || "", armour: clampSave(+m.armatura || 0),
    libro: m.libro || "", pagina: m.pagina || 0, nota: m.nota || "",
  };
  u.stats = combinedStats(rider, m);
  u.profiles = [{ name: u.name, stats: copy(rider) },
                ...(m.righe || []).map(r => ({ name: r.chi, stats: copy(r.stats || {}) }))];

  u.baseId = known ? known.id : "custom";
  u.baseW = w; u.baseH = h;
  u.models = 1; u.frontage = 1; u.loose = false;
  /* «(character)» fra parentesi e' il modo in cui il file stesso dice
     che un pezzo e' un personaggio: un carro pesante senza, per il resto
     dell'app, e' un carro e basta — non comanda, non porta stendardi */
  u.troop = `${m.troop} (character)`;
  if (!String(u.slot || "").trim()) u.slot = "Characters";

  /* le regole di tutto il modello; quelle scritte «solo per la bestia»
     restano sulla riga della bestia (p. 204) */
  const rules = (foot.rules || []).slice();
  const seen = new Set(rules.map(norm));
  for (const r of m.regole || []) if (!seen.has(norm(r))){ rules.push(r); seen.add(norm(r)); }
  u.rules = rules;

  /* Le armi della bestia sono sue, non del cavaliere: si marcano con
     `di`, e la mischia non le mette in mano a lui. Il file di New
     Recruit le mescola a quelle del personaggio — lo Skink Priest
     arrivava con le corna dello Stegadon — e qui si ritrovano. */
  const beastArms = new Set([...(m.armi || []).map(a => norm(a.name)),
                             ...(m.righe || []).filter(r => r.arma).map(r => norm(r.arma.name))]);
  const weapons = (foot.weapons || []).map(wp =>
    beastArms.has(norm(wp.name)) && !/^hand weapon$/i.test(wp.name) ? { ...wp, di: m.nome } : { ...wp });
  for (const a of m.armi || [])
    if (!weapons.some(wp => norm(wp.name) === norm(a.name))) weapons.push({ ...a, di: m.nome });
  u.weapons = weapons;
  u.maxRange = weapons.reduce((mx, wp) => {
    const q = String(wp.range || "").match(/(\d+)/);
    return q ? Math.max(mx, +q[1]) : mx;
  }, 0);

  /* L'armatura. Sul cavallo la pelle dura migliora quella del
     cavaliere (Armoured Hide); sul mostro e sul carro vale la migliore
     delle due (pp. 204-205). Il file che porta gia' la pelle fra le
     regole l'ha gia' contata il parser. */
  let armour = +foot.armour || 0;
  if (m.armaturaPiu && !(fromFile && seenHide(foot)))
    armour = clampSave((armour || 7) - (+m.armaturaPiu || 0));
  u.armour = bestSave(armour, clampSave(+m.armatura || 0));
  u.ward = bestSave(+foot.ward || 0, clampSave(+m.speciale || 0));
  /* la Forza d'Unita' la dice la tabella dei tipi di truppa, con le
     Ferite del modello intero: quella del file era del cavaliere */
  u.us = 0;

  if (!fromFile) u.pts = Math.max(0, (+u.pts || 0) + u.mountPts);
  return u;
}

const seenHide = foot => (foot.rules || []).some(r => /^armou?red hide/i.test(String(r)));

export function dismountUnit(u){
  if (!u || !u.foot) return u;
  const back = u.foot;
  const pts = Math.max(0, (+u.pts || 0) - (+u.mountPts || 0));
  for (const k of FOOT_KEYS){
    if (k in back) u[k] = back[k];
    else delete u[k];
  }
  u.pts = pts;
  delete u.foot; delete u.mountId; delete u.mountFromFile; delete u.mountPts;
  if (!u.mount) u.mount = null;
  return u;
}

/* ============================================================
   4 · CHI MENA, SULLA CAVALCATURA
   ============================================================ */
/* Le righe della cavalcatura che hanno Attacchi: il Rat Ogre della
   campana, lo Stegadon e i suoi cinque Skink, i due cinghiali e i due
   Orchi del carro. Ognuna mena con i suoi numeri (p. 204: «il
   personaggio e la cavalcatura usano ciascuno la propria Abilita',
   Forza, Iniziativa e i propri Attacchi, e le proprie armi»).

   Vale per un modello solo. Un reggimento di cavalleria ha la stessa
   riga per ogni modello, e quella il motore non la tira ancora: e'
   scritto nel README, e non si finge qui di averlo fatto.

   Solo le cavalcature montate da qui (`mountId`): quella che il parser
   indovina da un profilo in piu' del file non ha le righe, e tirare a
   caso gli attacchi di un profilo scelto per nome e' peggio che non
   tirarli. */
export function attackRows(u){
  if (!u || !u.mountId || !u.mount || (u.models || 1) !== 1) return [];
  const rows = Array.isArray(u.mount.righe) ? u.mount.righe : [];
  return rows
    .map(r => {
      const s = r.stats || {};
      return {
        chi: r.chi || u.mount.name || "cavalcatura", n: Math.max(1, +r.n || 1),
        /* la riga della bestia e' quella che gli effetti chiamano «mount»:
           la Carica delle Zanne alza la Forza a lei, non all'equipaggio */
        beast: !!u.mount.row && r.chi === u.mount.row,
        ws: num(s.WS), s: num(s.S), i: num(s.I), a: num(s.A),
        arma: r.arma || null, regole: r.regole || [],
      };
    })
    .filter(r => r.a > 0);
}

/* «su Screaming Bell (Legends: Skaven, p. 15)» */
export function mountLabel(u, { book = false } = {}){
  if (!u || !u.mount || !u.mount.name) return "";
  const where = book && u.mount.libro ? ` (${u.mount.libro}${u.mount.pagina ? ", p. " + u.mount.pagina : ""})` : "";
  return `su ${u.mount.name}${where}`;
}
