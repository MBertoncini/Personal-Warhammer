/* Schieramento Old World — tutte le liste che si possono scrivere
 *
 * Per cercare una lista a macchina serve sapere quali liste esistono. Qui
 * ogni fazione ha le sue VOCI: un'unità di `unita.mjs` con quanti modelli
 * può avere, quali opzioni e quante volte può entrare. Una lista è un
 * elenco di GENI — { k: 'clanrats', n: 40, o: { shields: true, c: 'csm' } }
 * — e da un elenco di geni si costruisce la lista vera, nello schema di
 * dati/liste.json, con la scheda di preparazione già compilata: generale
 * (il Comando più alto), stendardo da battaglia, Livello e dominio dei
 * maghi.
 *
 * Due serbatoi da cui pescare:
 *   - «tutte»: ogni voce che `unita.mjs` sa costruire;
 *   - «collezione»: solo le miniature che hai, contate da
 *     dati/catalogo.json — due reggimenti di Clanrats da 40 ne vogliono 80.
 *
 * Una lista è buona per la ricerca se sta nei punti (e non ne lascia per
 * strada più del margine), ha un generale, rispetta le percentuali della
 * Grand Army (`avvisiComposizione`), i limiti di ogni voce e i vincoli
 * della fazione — Da Boyz per gli Orchi Neri. Le regole che il simulatore
 * gioca a mano (Fanatici, Gigante, Squig) non hanno una voce: sarebbero
 * punti che in una serie non fanno niente.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SK, OG, LZ, da, lista, avvisiComposizione } from './unita.mjs';
import { armiKey, assegna, quanti } from '../../src/armi.js';

const qui = path.dirname(fileURLToPath(import.meta.url));
const dati = f => JSON.parse(fs.readFileSync(path.join(qui, '..', '..', 'dati', f), 'utf8'));

/* i domini che ogni mago può scegliere, dalla tabella dei maghi */
const MAGIA = dati(path.join('magia', 'domini.json'));
const DOMINI = new Set((MAGIA.domini || []).map(d => d.id));
const loriDi = nome => {
  const m = (MAGIA.maghi || []).find(x => x.nomi.includes(nome));
  const l = ((m && m.domini) || []).filter(d => DOMINI.has(d));
  return l.length ? l : ['battle'];
};

export const norm = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

const FRONTI = [null, 5, 6, 7, 8, 10];
const COMANDO = ['', 'sm', 'csm'];
const SI_NO = [false, true];

/* ================= le voci ================= */
const SKAVEN = [
  { k: 'greySeer', pezzo: 'Grey Seer', max: 1, opz: { level: [4, 3] }, crea: SK.greySeer, mago: o => o.level },
  { k: 'seerBell', pezzo: 'Grey Seer', pezzi: () => [['Grey Seer', 1], ['Screaming Bell', 1]], max: 1, opz: { level: [4, 3] },
    crea: SK.seerBell, mago: o => o.level, etichetta: 'Grey Seer sulla Screaming Bell' },
  { k: 'engineer', pezzo: 'Warlock Engineer', max: 2, opz: { level: [2, 1, 0], gun: [null, 'pistol', 'musket'] }, crea: SK.engineer, mago: o => o.level },
  { k: 'plaguePriest', pezzo: 'Plague Priest', max: 1, opz: { level: [2, 1, 0], censer: SI_NO }, crea: SK.plaguePriest, mago: o => o.level },
  { k: 'warlord', pezzo: 'Skaven Warlord', max: 1, opz: { weapon: [null, 'great', 'halberd'], heavy: SI_NO, shield: SI_NO },
    crea: o => SK.capo({ ...o, warlord: true }) },
  { k: 'chieftain', pezzo: 'Skaven Chieftain', max: 2, opz: { weapon: [null, 'great', 'halberd'], heavy: SI_NO, shield: SI_NO, bsb: SI_NO },
    crea: o => SK.capo({ ...o, warlord: false }), bsb: o => o.bsb },
  { k: 'clanrats', pezzo: 'Clanrats', n: [20, 40], opz: { shields: [true, false], spears: SI_NO, c: COMANDO, f: FRONTI }, crea: SK.clanrats },
  { k: 'stormvermin', pezzo: 'Stormvermin', n: [10, 30], opz: { shields: SI_NO, c: COMANDO, f: FRONTI }, crea: SK.stormvermin },
  { k: 'nightRunners', pezzo: 'Night Runners', n: [10, 20], opz: { sling: [true, false] }, crea: SK.nightRunners },
  { k: 'jezzails', pezzo: 'Warplock Jezzails', n: [3, 9], crea: SK.jezzails },
  { k: 'globadiers', pezzo: 'Poisoned Wind Globadiers', n: [2, 10], crea: SK.globadiers },
  { k: 'ratOgres', pezzo: 'Rat Ogres', n: [3, 6], opz: { pm: [1, 2], catcher: SI_NO }, crea: SK.ratOgres },
  { k: 'plagueMonks', pezzo: 'Plague Monks', n: [10, 30], opz: { c: COMANDO, f: FRONTI }, crea: SK.plagueMonks },
  { k: 'wlc', pezzo: 'Warp Lightning Cannon', max: 1, crea: SK.wlc },
  { k: 'hpa', pezzo: 'Hell Pit Abomination', max: 1, crea: () => da('Hell Pit Abomination') },
];

const ORCHI = [
  { k: 'warboss', pezzo: 'Orc Warboss', max: 1, opz: { great: [true, false], heavy: [true, false] }, crea: OG.warboss },
  { k: 'bigboss', pezzo: 'Orc Bigboss', max: 2, opz: { great: SI_NO, heavy: [true, false], bsb: SI_NO }, crea: OG.bigboss, bsb: o => o.bsb },
  { k: 'bigbossBoar', pezzo: 'Orc Bigboss', max: 2, opz: { great: SI_NO, heavy: [true, false], bsb: SI_NO }, crea: OG.bigbossBoar, bsb: o => o.bsb,
    etichetta: 'Orc Bigboss sul cinghiale' },
  { k: 'blackWarboss', pezzo: 'Black Orc Warboss', max: 1, opz: { great: [true, false] }, crea: OG.blackWarboss, nero: 'boss' },
  { k: 'blackBigboss', pezzo: 'Black Orc Bigboss', max: 1, crea: OG.blackBigboss, nero: 'boss' },
  { k: 'weirdnob', pezzo: 'Orc Weirdnob', max: 1, opz: { l4: [true, false] }, crea: OG.weirdnob, mago: o => o.l4 ? 4 : 3 },
  { k: 'oddnob', pezzo: 'Goblin Oddnob', max: 1, opz: { l4: [true, false] }, crea: OG.oddnob, mago: o => o.l4 ? 4 : 3 },
  { k: 'ngOddnob', pezzo: 'Night Goblin Oddnob', max: 1, opz: { l4: [false, true] }, crea: OG.ngOddnob, mago: o => o.l4 ? 4 : 3 },
  { k: 'ngBigboss', pezzo: 'Night Goblin Bigboss', max: 1, opz: { great: SI_NO, light: [true, false], shield: SI_NO }, crea: OG.ngBigboss },
  { k: 'ogdruz', pezzo: 'Ogdruz Swampdigga', max: 1, crea: OG.ogdruz },
  /* gli archi sono un pezzo a sé nella collezione: `armi` dice quale (src/armi.js) */
  { k: 'orcs', pezzo: 'Orc Mobs', n: [10, 50], opz: { c: COMANDO, spears: SI_NO, bows: SI_NO, big: SI_NO, f: FRONTI }, crea: OG.orcs,
    armi: o => o.bows ? 'Warbows' : '' },
  { k: 'blackOrcs', pezzo: 'Black Orc Mobs', n: [10, 30], opz: { c: COMANDO, great: [true, false], f: FRONTI }, crea: OG.blackOrcs, nero: 'mob' },
  { k: 'nightGoblins', pezzo: 'Night Goblin Mobs', n: [10, 40], opz: { c: COMANDO, spears: SI_NO, bows: SI_NO, f: FRONTI }, crea: OG.nightGoblins,
    armi: o => o.bows ? 'Shortbows' : '' },
  { k: 'goblins', pezzo: 'Goblin Mobs', n: [10, 40], opz: { c: COMANDO, spears: SI_NO, f: FRONTI }, crea: OG.goblins },
  { k: 'trolls', pezzo: 'Stone Troll Mobs', n: [1, 6], crea: OG.trolls },
  /* una mandria di n Squig porta un Herder ogni cinque (p. 27) */
  { k: 'squigHerd', pezzo: 'Night Goblin Squig Herds', n: [5, 30], pezzi: n => [['Night Goblin Squig Herds', n + Math.ceil(n / 5)]],
    crea: OG.squigHerd, etichetta: 'Cave Squig nella Squig Herd' },
  { k: 'squigHoppers', pezzo: 'Night Goblin Squig Hopper Mobs', n: [5, 10], crea: OG.squigHoppers },
  { k: 'boarBoys', pezzo: 'Orc Boar Boy Mobs', n: [5, 10], opz: { c: COMANDO, spears: [true, false], shields: SI_NO }, crea: OG.boarBoys },
  { k: 'chariot', pezzo: 'Orc Boar Chariots', crea: OG.chariot },
];

const LUCERTOLE = [
  { k: 'oldblood', pezzo: 'Saurus Oldblood', max: 1, opz: { weapon: ['great', 'halberd', null] }, crea: LZ.oldblood },
  /* la cavalcatura è un pezzo a sé: senza il Carnosauro in vetrina non si schiera */
  { k: 'carnoOldblood', pezzo: 'Saurus Oldblood', pezzi: () => [['Saurus Oldblood', 1], ['Carnosaur', 1]], max: 1, crea: LZ.carnoOldblood,
    etichetta: 'Saurus Oldblood sul Carnosauro' },
  { k: 'scarVet', pezzo: 'Saurus Scar-Veteran', max: 2, opz: { weapon: ['great', 'halberd', null], bsb: SI_NO }, crea: LZ.scarVet, bsb: o => o.bsb },
  { k: 'priest', pezzo: 'Skink Priest', max: 2, opz: { l2: [true, false] }, crea: LZ.priest, mago: o => o.l2 ? 2 : 1 },
  { k: 'priestSteg', pezzo: 'Skink Priest', pezzi: () => [['Skink Priest', 1], ['Ancient Stegadon', 1]], max: 1, opz: { l2: [true, false] },
    crea: LZ.priestSteg, mago: o => o.l2 ? 2 : 1, etichetta: "Skink Priest sull'Ancient Stegadon" },
  { k: 'chief', pezzo: 'Skink Chief', max: 2, crea: LZ.chief },
  { k: 'slann', pezzo: 'Slann Mage-Priests', max: 1, crea: () => da('Slann Mage-Priests'), mago: () => 4 },
  { k: 'saurus', pezzo: 'Saurus Warriors', n: [10, 30], opz: { c: COMANDO, f: FRONTI }, crea: LZ.saurus },
  { k: 'templeGuard', pezzo: 'Temple Guard', n: [10, 30], opz: { c: COMANDO, f: FRONTI }, crea: LZ.templeGuard },
  { k: 'skinks', pezzo: 'Skink Skirmishers', n: [10, 20], crea: LZ.skinks },
  { k: 'krox', pezzo: 'Kroxigor', n: [3, 6], opz: { c: ['', 'c'] }, crea: LZ.krox },
  { k: 'bastiladon', pezzo: 'Bastiladon', max: 1, crea: LZ.bastiladon },
  { k: 'ancientSteg', pezzo: 'Ancient Stegadon', max: 1, crea: LZ.ancientSteg },
  { k: 'terradons', pezzo: 'Terradon Riders', n: [3, 6], crea: LZ.terradons },
  { k: 'coldOnes', pezzo: 'Cold One Riders', n: [5, 10], opz: { c: COMANDO }, crea: LZ.coldOnes },
];

/* Da Boyz (Ravening Hordes p. 46): un Boss di Orchi Neri per ogni
   reggimento di Orchi Neri, e viceversa */
const daBoyz = (geni, voce) => {
  const boss = geni.filter(g => voce(g).nero === 'boss').length, mob = geni.filter(g => voce(g).nero === 'mob').length;
  return boss === mob ? [] : [`Da Boyz: ${boss} boss di Orchi Neri e ${mob} reggimenti`];
};
/* e la metà che manca: chi scrive liste a caso mette un reggimento di
   Orchi Neri senza il suo boss quasi sempre, e la lista si butta */
const daBoyzCompleta = (geni, voce, nuovo) => {
  const conta = r => geni.filter(g => voce(g).nero === r).length;
  for (let giri = 0; giri < 4 && conta('boss') !== conta('mob'); giri++){
    const g = nuovo(conta('boss') < conta('mob') ? 'boss' : 'mob');
    if (!g) break;
    geni.push(g);
  }
};

/* Le righe della Grand Army Composition List che le percentuali non
   dicono: «0-1 per 1.000 punti», «uno per ogni eroe Skink», «solo se
   c'è un Warlock Engineer». Ogni regola conta voci della lista: `al`
   (al massimo), `almeno`, con `per` (ogni 1.000 punti) o `ogni` (per
   ogni voce di quest'altro elenco). Le pagine sono stampate. */
const REGOLE_SKAVEN = [
  { k: ['greySeer', 'seerBell', 'warlord'], al: 1, per: true, t: 'Warlord o Grey Seer, 0-1 ogni 1.000 punti (Legends: Skaven p. 2)' },
  { k: ['engineer', 'plaguePriest'], al: 1, per: true, t: 'Warlock Engineer o Plague Priest, 0-1 ogni 1.000 punti (p. 2)' },
  { k: ['clanrats'], almeno: 1, per: true, t: 'almeno un reggimento di Clanrats ogni 1.000 punti (p. 2)' },
  { k: ['stormvermin'], al: 1, per: true, t: 'Stormvermin, 0-1 ogni 1.000 punti (p. 2)' },
  { k: ['ratOgres'], al: 2, per: true, t: 'Rat Ogres, 0-2 ogni 1.000 punti (p. 2)' },
  { k: ['hpa'], al: 1, per: true, t: 'Hell Pit Abomination, 0-1 ogni 1.000 punti (p. 2)' },
  { k: ['jezzails'], ogni: ['engineer'], t: 'Warplock Jezzails, uno per Warlock Engineer (p. 2)' },
  { k: ['globadiers'], ogni: ['engineer'], t: 'Globadiers, uno per Warlock Engineer (p. 2)' },
  { k: ['plagueMonks'], ogni: ['plaguePriest'], t: 'Plague Monks, uno per Plague Priest (p. 2)' },
  { k: ['wlc', 'doomwheel'], al: 1, per: true, se: ['engineer'], t: 'Doomwheel o Warp Lightning Cannon, 0-1 ogni 1.000 punti e solo con un Warlock Engineer (p. 2)' },
];
const REGOLE_ORCHI = [
  { k: ['warboss', 'blackWarboss', 'weirdnob'], al: 1, per: true, t: 'Black Orc Warboss, Orc Warboss o Orc Weirdnob, 0-1 ogni 1.000 punti (Ravening Hordes p. 11)' },
  { k: ['nightGoblins'], ogni: ['ngBigboss', 'ngOddnob'], t: 'Night Goblin Mobs, uno per capo o sciamano Night Goblin (p. 11)' },
  { k: ['squigHerd'], ogni: ['ngBigboss', 'ngOddnob'], t: 'Squig Herd, una per capo o sciamano Night Goblin (p. 11)' },
  { k: ['squigHoppers'], ogni: ['ngBigboss', 'ngOddnob'], t: 'Squig Hopper, uno per capo o sciamano Night Goblin (p. 11)' },
];
const REGOLE_LUCERTOLE = [
  { k: ['slann'], al: 1, t: 'Slann, 0-1 (Legends: Lizardmen p. 2)' },
  { k: ['oldblood', 'carnoOldblood', 'priest', 'priestSteg'], al: 1, per: true, t: 'Saurus Oldblood o Skink Priest, 0-1 ogni 1.000 punti (p. 2)' },
  { k: ['saurus'], almeno: 1, t: 'almeno un reggimento di Saurus Warriors (p. 2)' },
  { k: ['templeGuard'], al: 1, t: 'Temple Guard, 0-1 (p. 2)' },
  { k: ['terradons'], ogni: ['chief', 'priest', 'priestSteg'], t: 'Terradon Riders, uno per eroe Skink (p. 2)' },
  { k: ['bastiladon'], al: 2, per: true, t: 'Bastiladon, 0-2 ogni 1.000 punti (p. 2)' },
  { k: ['ancientSteg'], al: 1, per: true, t: 'Stegadon, 0-1 ogni 1.000 punti (p. 2)' },
];
function composizione(geni, punti, regole){
  const quanti = ks => geni.filter(g => ks.includes(g.k)).length;
  const mille = Math.max(1, Math.floor(punti / 1000));
  const err = [];
  for (const r of regole){
    const n = quanti(r.k);
    let tetto = r.ogni ? quanti(r.ogni) : r.al != null ? r.al * (r.per ? mille : 1) : Infinity;
    if (r.se && !quanti(r.se)) tetto = 0;
    if (n > tetto) err.push(r.t);
    if (r.almeno && n < r.almeno * (r.per ? mille : 1)) err.push(r.t);
  }
  return err;
}

/* le liste già trovate a mano (esempi.mjs), scritte come geni: la
   ricerca parte anche da loro, e deve fare almeno altrettanto */
const G = (k, n, o = {}, lore) => ({ k, ...(n ? { n } : {}), o, ...(lore ? { lore } : {}) });
export const FAZIONI = {
  skaven: { sigla: 'SKA', nome: 'Skaven', cat: 'Skaven', voci: SKAVEN, regole: REGOLE_SKAVEN, vincoli: (g, v, p) => composizione(g, p, REGOLE_SKAVEN),
    partenze: [[G('greySeer', 0, { level: 4 }, 'battle'), G('clanrats', 40, { shields: true, c: 'csm', f: 8 }),
                G('clanrats', 40, { shields: true, c: 'csm', f: 8 }), G('clanrats', 29, { shields: true, c: 'sm', f: 6 })]] },
  og: { sigla: 'O&G', nome: 'Orchi & Goblin', cat: 'Orc and Goblin Tribes', voci: ORCHI, regole: REGOLE_ORCHI,
    vincoli: (g, v, p) => [...daBoyz(g, v), ...composizione(g, p, REGOLE_ORCHI)],
    completa: (geni, voce, nuovo) => daBoyzCompleta(geni, voce, nuovo),
    /* la «O&G orda nera» aveva il Weirdnob accanto al Black Orc Warboss,
       e la Grand Army ne concede uno solo dei due fino a 1.000 punti
       (Ravening Hordes p. 11): qui il mago è un Goblin Oddnob */
    partenze: [[G('blackWarboss', 0, { great: true }), G('oddnob', 0, { l4: true }, 'battle'),
                G('blackOrcs', 10, { c: 'cs', great: true }), G('orcs', 50, { c: 'csm' }), G('orcs', 12, { c: 'sm' })]] },
  liz: { sigla: 'LIZ', nome: 'Lucertole', cat: 'Lizardmen', voci: LUCERTOLE, regole: REGOLE_LUCERTOLE, vincoli: (g, v, p) => composizione(g, p, REGOLE_LUCERTOLE),
    partenze: [[G('oldblood', 0, { weapon: 'great' }), G('scarVet', 0, { weapon: 'great', bsb: true }),
                G('templeGuard', 16, { c: 'csm' }), G('saurus', 18, { c: 'cs' })]] },
};
/* a quale fazione appartiene un catalogo: «Lizardmen - Renegades 2.0» è Lucertole */
export const fazioneDi = catalogue => {
  const c = norm(catalogue);
  return Object.keys(FAZIONI).find(f => c.startsWith(norm(FAZIONI[f].cat).slice(0, 9))) || null;
};

/* ================= lo spazio di una ricerca ================= */
const isChar = v => v.slot === 'Characters' || v.slot === 'Named Characters';
const MAX = { Characters: 2, 'Named Characters': 1, Core: 4, Special: 2, Rare: 1 };
const scegli = (a, rnd) => a[Math.floor(rnd() * a.length)];
const intero = (a, b, rnd) => a + Math.floor(rnd() * (b - a + 1));

/* `pool`: 'tutte' o 'collezione'. `catalogo`: le voci di dati/catalogo.json.
   Il TEMA di una ricerca: `con` sono le voci che ogni lista deve avere
   («carnoOldblood», o «wlc|hpa» per una delle due), `senza` quelle che
   non deve avere mai. Serve a cercare due liste diverse della stessa
   fazione — la campana con l'Abominio, la campana con i Jezzail — invece
   della sola più forte, che le ricerche libere trovano tutte uguali. */
export function spazio(fazione, { pool = 'tutte', punti = 800, margine = null, catalogo = null, con = [], senza = [] } = {}){
  const fz = FAZIONI[fazione];
  if (!fz) throw new Error(`Fazione «${fazione}» sconosciuta: ${Object.keys(FAZIONI).join(', ')}.`);
  margine = margine ?? Math.max(20, Math.round(punti * 0.04));
  const obblighi = con.map(c => String(c).split('|').filter(Boolean)).filter(a => a.length);

  /* Quante miniature hai, per nome (e alias) dentro la fazione, e con
     quali armi: 25 Orchi con l'arma a una mano e 15 con l'arco sono due
     scorte, e un reggimento di arcieri pesca solo dalla seconda — o da
     quelle che il catalogo dice schierabili con altre armi (src/armi.js). */
  const scorte = new Map();
  if (pool === 'collezione'){
    for (const e of catalogo || dati('catalogo.json')){
      if (fazioneDi(e.faction) !== fazione) continue;
      const s = { armi: armiKey(e.armi), libere: !!e.altreArmi, n: +e.owned || 0, area: (+e.baseW || 0) * (+e.baseH || 0) };
      for (const nome of new Set([e.name, ...(e.aliases || [])].map(norm))){
        if (!scorte.has(nome)) scorte.set(nome, []);
        scorte.get(nome).push(s);
      }
    }
  }
  const quantiDi = (p, k = '') => quanti(k, scorte.get(norm(p)) || []);

  /* i pezzi di un'unità: [pezzo, quanti, classe delle armi] */
  const pezziDi = (v, n, o = {}) => v.pezzi ? v.pezzi(n).map(([p, q]) => [p, q, ''])
    : [[v.pezzo, v.n ? n : 1, armiKey(v.armi ? v.armi(o) : '')]];
  const bastano = (v, n, o) => pezziDi(v, n, o).every(([p, q, k]) => quantiDi(p, k) >= q);

  /* le voci che si possono costruire davvero: il modello importato
     c'è, e — per la collezione — le miniature pure */
  const voci = [], escluse = [];
  for (const v0 of fz.voci){
    if (senza.includes(v0.k)){ escluse.push({ k: v0.k, pezzo: v0.pezzo, perche: 'tolta dal tema della ricerca' }); continue; }
    let u;
    try { u = v0.crea({ ...Object.fromEntries(Object.entries(v0.opz || {}).map(([k, a]) => [k, a[0]])), ...(v0.n ? { n: v0.n[0] } : {}) }); }
    catch (e){ escluse.push({ k: v0.k, pezzo: v0.pezzo, perche: 'nessun modello importato' }); continue; }
    const v = { ...v0, slot: u.slot, nome: v0.etichetta || u.name, opz: v0.opz || {} };
    v.max = v0.max ?? MAX[v.slot] ?? 2;
    if (pool === 'collezione'){
      const min = v.n ? v.n[0] : 1;
      /* le opzioni che cambiano le armi restano se ci sono le miniature
         armate così: con i Night Goblin tutti con l'arco, l'arco non è
         più una scelta. Due giri, perché un'opzione si prova con le
         altre già ristrette. */
      const base = Object.fromEntries(Object.entries(v.opz).map(([k, a]) => [k, a[0]]));
      if (v.armi) for (let giro = 0; giro < 2; giro++){
        const opz = {};
        for (const [k, a] of Object.entries(v.opz)){
          const buone = a.filter(x => bastano(v, min, { ...base, [k]: x }));
          opz[k] = buone.length ? buone : a;
          base[k] = opz[k][0];
        }
        v.opz = opz;
      }
      const manca = pezziDi(v, min, base).filter(([p, q, k]) => quantiDi(p, k) < q);
      if (manca.length){ escluse.push({ k: v.k, pezzo: v.pezzo, perche: manca.map(([p, q, k]) =>
        `${p}${k ? ' (' + k + ')' : ''}: ne hai ${quantiDi(p, k)}, ne servono ${q}`).join('; ') }); continue; }
      /* Com'è montato in vetrina. Il Grey Seer della collezione sta sulla
         Screaming Bell e gli Oldblood sul Carnosauro: la basetta del
         catalogo è quella della cavalcatura, e il modello a piedi non
         esiste. Un personaggio la cui basetta in vetrina è più grande di
         quella dell'unità costruita non si schiera così. */
      const [cav] = pezziDi(v, min, base), area = (+u.baseW || 25) * (+u.baseH || 25);
      const scorta = scorte.get(norm(cav[0])) || [];
      if (!v.n && scorta.length && scorta.every(s => s.area > area)){
        escluse.push({ k: v.k, pezzo: v.pezzo, perche: `in vetrina è montato (basetta più grande della ${u.baseW}×${u.baseH})` }); continue;
      }
      if (v.n){
        /* il reggimento più grande che le miniature permettono: con i
           pezzi che crescono a scatti (un Herder ogni cinque Squig) non è
           una divisione */
        const classi = [base, ...Object.entries(v.opz).flatMap(([k, a]) => a.map(x => ({ ...base, [k]: x })))];
        let tetto = min;
        for (let n = v.n[1]; n > min; n--) if (classi.some(o => bastano(v, n, o))){ tetto = n; break; }
        v.n = [v.n[0], Math.min(v.n[1], tetto)];
      }
    }
    voci.push(v);
  }
  const perK = Object.fromEntries(voci.map(v => [v.k, v]));
  const voce = g => perK[g.k];

  /* il costo di un gene, costruendo l'unità una volta sola */
  const memo = new Map();
  const chiaveGene = g => JSON.stringify([g.k, g.n || 0, Object.entries(g.o || {}).sort(), g.lore || '']);
  const unita = g => {
    const k = chiaveGene(g);
    if (!memo.has(k)){
      const v = voce(g), o = { ...g.o };
      if (o.f == null) delete o.f;
      memo.set(k, v.crea({ ...o, ...(v.n ? { n: g.n } : {}) }));
    }
    return structuredClone(memo.get(k));
  };
  const costo = g => { const k = chiaveGene(g); if (!memo.has(k)) unita(g); return memo.get(k).pts; };
  const totale = geni => geni.reduce((s, g) => s + costo(g), 0);
  const chiave = geni => geni.map(chiaveGene).sort().join('|');
  const livello = g => { const v = voce(g); return v.mago ? +v.mago(g.o) || 0 : 0; };
  const bsb = g => { const v = voce(g); return !!(v.bsb && v.bsb(g.o)); };

  /* i personaggi prima, poi gli altri: l'ordine della lista stampata */
  const ordina = geni => [...geni].sort((a, b) => (isChar(voce(b)) - isChar(voce(a))) || fz.voci.findIndex(v => v.k === a.k) - fz.voci.findIndex(v => v.k === b.k));

  function costruisci(geni, { id = 'cand', name = '' } = {}){
    geni = ordina(geni);
    const units = geni.map(unita);
    /* generale: il Comando più alto fra chi non porta lo stendardo */
    let general = -1, bestLd = -1, bsbI = null;
    geni.forEach((g, i) => {
      if (!isChar(voce(g))) return;
      if (bsb(g)){ bsbI = i; return; }
      const ld = +((units[i].stats || {}).Ld) || 0;
      if (ld > bestLd){ bestLd = ld; general = i; }
    });
    const maghi = {};
    geni.forEach((g, i) => { const l = livello(g); if (l > 0) maghi[i] = { level: l, lore: g.lore || loriDi(voce(g).pezzo)[0] }; });
    return lista({ cat: fz.cat, name: name || id, units, limit: punti,
      prep: { general: Math.max(0, general), bsb: bsbI, units: maghi },
      note: descrivi(geni) }, id);
  }

  /* ---- le miniature bastano? ----
     Per ogni pezzo, quanti ne servono per classe di armi; ogni classe
     pesca dalle sue, e quelle schierabili con altre armi coprono il
     resto (src/armi.js). */
  function mancanze(geni){
    if (pool !== 'collezione') return [];
    const serve = new Map();
    for (const g of geni){
      if (!voce(g)) continue;
      for (const [p, q, k] of pezziDi(voce(g), g.n || 1, g.o)){
        if (!serve.has(norm(p))) serve.set(norm(p), new Map());
        const m = serve.get(norm(p));
        m.set(k, (m.get(k) || 0) + q);
      }
    }
    const err = [];
    for (const [p, m] of serve){
      const r = assegna(m, scorte.get(p) || []);
      for (const [k, b] of r.manca) err.push(`${p}${k ? ' (' + k + ')' : ''}: ne servono ${m.get(k)}, ne hai ${m.get(k) - b}`);
    }
    return err;
  }

  /* ---- è una lista che si può giocare? ---- */
  function valida(geni){
    const err = [];
    const conta = {};
    for (const g of geni){
      const v = voce(g);
      if (!v){ err.push(`voce ${g.k} non disponibile`); continue; }
      conta[g.k] = (conta[g.k] || 0) + 1;
      if (v.n && (g.n < v.n[0] || g.n > v.n[1])) err.push(`${v.nome}: ${g.n} modelli`);
    }
    if (err.length) return err;
    for (const [k, c] of Object.entries(conta)) if (c > perK[k].max) err.push(`${perK[k].nome} ×${c}`);
    for (const alt of obblighi) if (!geni.some(g => alt.includes(g.k)))
      err.push(`il tema vuole ${alt.map(k => perK[k] ? perK[k].nome : k).join(' o ')}`);
    const chars = geni.filter(g => isChar(voce(g)));
    if (!chars.some(g => !bsb(g))) err.push('nessun generale');
    if (geni.filter(bsb).length > 1) err.push('due stendardi da battaglia');
    if (geni.length - chars.length < 1) err.push('solo personaggi');
    const pts = totale(geni);
    if (pts > punti) err.push(`${pts} punti su ${punti}`);
    if (pts < punti - margine) err.push(`solo ${pts} punti`);
    err.push(...fz.vincoli(geni, voce, punti));
    err.push(...mancanze(geni));
    if (!err.length){
      err.push(...avvisiComposizione({ points: pts, info: { limit: punti }, units: geni.map(g => ({ slot: voce(g).slot, pts: costo(g) })) }));
    }
    return err;
  }

  /* ---- geni a caso ---- */
  /* quanti modelli di questa voce ci stanno ancora, con le miniature che
     le altre unità della lista hanno già preso (senza collezione: tutti) */
  /* con le armi scelte (`o`): gli arcieri contano solo gli archi */
  const resto = (geni, v, o = {}) => {
    if (pool !== 'collezione') return Infinity;
    for (let n = v.n ? v.n[1] : 1; n >= 1; n--)
      if (!mancanze([...geni, { k: v.k, ...(v.n ? { n } : {}), o }]).length) return n;
    return 0;
  };
  const geneCasuale = (v, rnd, altri = []) => {
    const g = { k: v.k, o: Object.fromEntries(Object.entries(v.opz).map(([k, a]) => [k, scegli(a, rnd)])) };
    const max = Math.min(v.n ? v.n[1] : 1, resto(altri, v, g.o));
    if (max < (v.n ? v.n[0] : 1)) return null;
    if (v.n) g.n = intero(v.n[0], max, rnd);
    if (v.mago && v.mago(g.o) > 0) g.lore = scegli(loriDi(v.pezzo), rnd);
    if (g.o.f != null && g.n && g.o.f > g.n) g.o.f = null;
    return g;
  };

  /* i punti che avanzano vanno nei reggimenti, un modello alla volta */
  /* Prima un'unità nuova, se ci sta: prima questo passo mancava e ogni
     punto avanzato finiva in un modello in più nei reggimenti, cioè
     quasi sempre in fanteria. Poi un modello alla volta, a caso fra chi
     può crescere. */
  function riempi(geni, rnd){
    for (let prove = 0; prove < 6; prove++){
      const g = geneCasuale(scegli(truppe, rnd), rnd, geni);
      if (g && totale([...geni, g]) <= punti && (voce(g).max ?? 9) > geni.filter(x => x.k === g.k).length) geni.push(g);
    }
    const aperti = geni.filter(g => voce(g).n);
    while (aperti.length){
      const i = Math.floor(rnd() * aperti.length), g = aperti[i];
      g.n++;
      if (g.n > voce(g).n[1] || totale(geni) > punti || (pool === 'collezione' && valida(geni).some(e => /ne servono/.test(e)))){
        g.n--; aperti.splice(i, 1);
      }
    }
    return geni;
  }
  /* Il 25% di truppe base. Con un tema che vieta qualcosa, o con poche
     miniature di base in vetrina, le liste a caso non ci arrivavano
     quasi mai: il Black Orc Warboss con i suoi Orchi Neri e i cinghiali
     lascia agli Orchi e ai Goblin il resto, e la ricerca non trovava
     nessuna lista valida in quattrocento tentativi. Qui si fanno
     crescere le truppe base che ci sono, e se non bastano se ne aggiunge
     una, prima di riparare i punti. */
  const puntiBase = geni => geni.filter(g => voce(g).slot === 'Core').reduce((t, g) => t + costo(g), 0);
  function nucleo(geni, rnd){
    for (let giri = 0; giri < 12 && puntiBase(geni) < punti * 0.25; giri++){
      const crescono = geni.filter(g => voce(g).slot === 'Core' && voce(g).n && g.n < voce(g).n[1]);
      if (crescono.length && rnd() < 0.7){
        const g = scegli(crescono, rnd), prima = g.n;
        g.n = Math.min(voce(g).n[1], g.n + intero(2, 8, rnd));
        while (g.n > prima && mancanze(geni).length) g.n--;
        if (g.n > prima) continue;
      }
      const v = base.filter(w => geni.filter(x => x.k === w.k).length < w.max);
      if (v.length) aggiungi(geni, v, rnd);
    }
  }
  /* e se sono troppi, si tolgono: prima modelli, poi unità che non siano
     personaggi — e dalle truppe base solo se restano sopra il 25% */
  function ripara(geni, rnd){
    let giri = 0;
    while (totale(geni) > punti && giri++ < 500){
      const stretto = puntiBase(geni) <= punti * 0.27;
      const piccoli = geni.filter(g => voce(g).n && g.n > voce(g).n[0] && !(stretto && voce(g).slot === 'Core'));
      if (piccoli.length && rnd() < 0.8){ const g = scegli(piccoli, rnd); g.n = Math.max(voce(g).n[0], g.n - intero(1, 4, rnd)); continue; }
      const via = geni.filter(g => !isChar(voce(g)));
      if (via.length > 1) geni.splice(geni.indexOf(scegli(via, rnd)), 1);
      else break;
    }
    return riempi(geni, rnd);
  }

  const personaggi = voci.filter(isChar), truppe = voci.filter(v => !isChar(v));
  const base = truppe.filter(v => v.slot === 'Core');

  /* un gene che rispetta le miniature rimaste, o niente */
  const aggiungi = (geni, scelta, rnd) => { const g = geneCasuale(scegli(scelta, rnd), rnd, geni); if (g) geni.push(g); return g; };
  /* la metà mancante di una coppia che la fazione vuole (Da Boyz) */
  const completa = (geni, rnd) => fz.completa && fz.completa(geni, voce, ruolo => {
    const scelta = voci.filter(w => w.nero === ruolo);
    return scelta.length ? geneCasuale(scegli(scelta, rnd), rnd, geni) : null;
  });

  /* Le unità che ne vogliono un'altra (i Jezzail il Warlock Engineer, i
     Terradon un eroe Skink, p. 2 dei Legends): senza questo passo quasi
     ogni lista a caso con i Jezzail si buttava. Si aggiunge chi manca,
     e se non si può si toglie chi lo chiedeva. */
  function prerequisiti(geni, rnd){
    for (const r of fz.regole || []){
      const req = r.ogni || r.se;
      if (!req) continue;
      for (let giri = 0; giri < 4; giri++){
        const n = geni.filter(g => r.k.includes(g.k)).length;
        if (!n || geni.filter(g => req.includes(g.k)).length >= (r.ogni ? n : 1)) break;
        const possibili = voci.filter(v => req.includes(v.k) && geni.filter(x => x.k === v.k).length < v.max);
        const g = possibili.length ? geneCasuale(scegli(possibili, rnd), rnd, geni) : null;
        if (g) geni.push(g);
        else geni.splice(geni.findIndex(x => r.k.includes(x.k)), 1);
      }
    }
  }

  /* Una lista a caso. Le unità si pescano tutte con la stessa
     probabilità: prima metà delle pescate andava alle truppe base, e le
     liste a caso erano per due terzi fanteria. Una truppa base c'è
     sempre, perché senza il 25% la lista non vale.
     `con`: la voce attorno a cui costruirla — la lista «a tema» con cui
     la ricerca comincia, una per ogni unità, perché nessuna resti fuori
     solo perché nessuno l'ha mai pescata. */
  function casuale(rnd, { con = null } = {}){
    const tema = con && perK[con];
    if (con && !tema) return null;
    for (let t = 0; t < 400; t++){
      const geni = [];
      /* prima quello che il tema vuole */
      for (const alt of obblighi){
        const v = perK[scegli(alt, rnd)];
        if (v && !geni.some(g => alt.includes(g.k))){ const g = geneCasuale(v, rnd, geni); if (g) geni.push(g); }
      }
      if (tema && isChar(tema)){ const g = geneCasuale(tema, rnd, geni); if (g) geni.push(g); }
      else if (!geni.some(g => isChar(voce(g)))) aggiungi(geni, personaggi, rnd);
      if (rnd() < 0.35) aggiungi(geni, personaggi, rnd);
      if (tema && !isChar(tema)){ const g = geneCasuale(tema, rnd, geni); if (g) geni.push(g); }
      if (base.length && !geni.some(g => voce(g).slot === 'Core')) aggiungi(geni, base, rnd);
      for (let prove = 0; prove < 25; prove++){
        const g = geneCasuale(scegli(truppe, rnd), rnd, geni);
        if (g && totale([...geni, g]) <= punti) geni.push(g);
      }
      completa(geni, rnd);
      prerequisiti(geni, rnd);
      nucleo(geni, rnd);
      ripara(geni, rnd);
      if (tema && !geni.some(g => g.k === con)) continue;
      if (!valida(geni).length) return ordina(geni);
    }
    return null;
  }

  /* ---- una mossa sola, o due ---- */
  const MOSSE = ['modelli', 'modelli', 'opzione', 'opzione', 'scambia', 'aggiungi', 'togli', 'dominio'];
  function muta(padre, rnd){
    for (let t = 0; t < 80; t++){
      const geni = structuredClone(padre);
      const quante = rnd() < 0.3 ? 2 : 1;
      for (let m = 0; m < quante; m++){
        const mossa = scegli(MOSSE, rnd), g = scegli(geni, rnd), v = voce(g);
        if (mossa === 'modelli' && v.n){
          g.n = Math.min(v.n[1], Math.max(v.n[0], g.n + (rnd() < 0.5 ? -1 : 1) * intero(1, 8, rnd)));
        } else if (mossa === 'opzione' && Object.keys(v.opz).length){
          const k = scegli(Object.keys(v.opz), rnd);
          g.o[k] = scegli(v.opz[k], rnd);
          if (v.mago){ if (v.mago(g.o) > 0 && !g.lore) g.lore = scegli(loriDi(v.pezzo), rnd); if (!(v.mago(g.o) > 0)) delete g.lore; }
        } else if (mossa === 'dominio' && g.lore){
          g.lore = scegli(loriDi(v.pezzo), rnd);
        } else if (mossa === 'scambia'){
          const pari = voci.filter(w => isChar(w) === isChar(v) && (isChar(v) || w.slot === v.slot || rnd() < 0.4));
          const altri = geni.filter(x => x !== g), nuovo = geneCasuale(scegli(pari, rnd), rnd, altri);
          if (nuovo) geni[geni.indexOf(g)] = nuovo;
        } else if (mossa === 'aggiungi'){
          aggiungi(geni, rnd() < 0.2 ? personaggi : truppe, rnd);
        } else if (mossa === 'togli' && geni.length > 2){
          geni.splice(geni.indexOf(g), 1);
        }
        if (g.o && g.o.f != null && g.n && g.o.f > g.n) g.o.f = null;
      }
      completa(geni, rnd);
      prerequisiti(geni, rnd);
      nucleo(geni, rnd);
      ripara(geni, rnd);
      if (!valida(geni).length && chiave(geni) !== chiave(padre)) return ordina(geni);
    }
    return null;
  }

  /* ---- a parole, per chi legge ---- */
  const PAROLE = { shields: 'scudi', spears: 'lance', bows: 'archi', great: 'arma grande', heavy: 'armatura pesante', shield: 'scudo',
    bsb: 'stendardo da battaglia', censer: 'incensiere', catcher: 'Things-catcher', sling: 'fionde', big: "Big 'Uns" };
  function descrivi(geni){
    return ordina(geni).map(g => {
      const v = voce(g), o = g.o || {}, bit = [];
      for (const [k, x] of Object.entries(o)){
        if (x === false || x == null || x === '' || k === 'f' || k === 'l4' || k === 'l2' || k === 'level') continue;
        if (k === 'spears' && o.bows) continue;   // l'arco prende il posto delle lance
        if (k === 'c') bit.push([...x].map(c => ({ c: 'campione', s: 'stendardo', m: 'musico' })[c]).join(', '));
        else if (k === 'weapon') bit.push(PAROLE[x] || { halberd: 'alabarda' }[x] || x);
        else if (k === 'gun') bit.push({ pistol: 'pistola', musket: 'moschetto' }[x] || x);
        else if (k === 'pm') bit.push(`${x} Packmaster`);
        else if (x === true && PAROLE[k]) bit.push(PAROLE[k]);
      }
      const l = livello(g);
      if (l > 0) bit.unshift(`Livello ${l}${g.lore ? ', ' + g.lore : ''}`);
      if (o.f) bit.push(`fronte ${o.f}`);
      return `${g.n ? g.n + ' ' : ''}${v.nome}${bit.length ? ' (' + bit.join(', ') + ')' : ''} — ${costo(g)} pt`;
    }).join('; ');
  }

  /* le partenze note, se in questo serbatoio sono giocabili: quelle
     dell'archivio sforano di qualche punto, e si limano di un modello */
  let s0 = 7;
  const fisso = () => ((s0 = (s0 * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const partenze = (fz.partenze || []).map(p => structuredClone(p)).filter(p => p.every(voce))
    .map(p => ordina(ripara(p, fisso))).filter(p => !valida(p).length);

  return { fazione, fz, pool, punti, margine, voci, escluse, costruisci, valida, casuale, muta, chiave, totale, descrivi, ordina, partenze, voce };
}
