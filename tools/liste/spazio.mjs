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
  { k: 'blackWarboss', pezzo: 'Black Orc Warboss', max: 1, opz: { great: [true, false] }, crea: OG.blackWarboss, nero: 'boss' },
  { k: 'blackBigboss', pezzo: 'Black Orc Bigboss', max: 1, crea: () => da('Black Orc Bigboss'), nero: 'boss' },
  { k: 'weirdnob', pezzo: 'Orc Weirdnob', max: 1, opz: { l4: [true, false] }, crea: OG.weirdnob, mago: o => o.l4 ? 4 : 3 },
  { k: 'oddnob', pezzo: 'Goblin Oddnob', max: 1, opz: { l4: [true, false] }, crea: OG.oddnob, mago: o => o.l4 ? 4 : 3 },
  { k: 'ngOddnob', pezzo: 'Night Goblin Oddnob', max: 1, crea: () => da('Night Goblin Oddnob'), mago: () => 3 },
  { k: 'ngBigboss', pezzo: 'Night Goblin Bigboss', max: 1, crea: () => da('Night Goblin Bigboss') },
  { k: 'ogdruz', pezzo: 'Ogdruz Swampdigga', max: 1, crea: OG.ogdruz },
  { k: 'orcs', pezzo: 'Orc Mobs', n: [10, 50], opz: { c: COMANDO, spears: SI_NO, big: SI_NO, f: FRONTI }, crea: OG.orcs },
  { k: 'blackOrcs', pezzo: 'Black Orc Mobs', n: [10, 30], opz: { c: COMANDO, great: [true, false], f: FRONTI }, crea: OG.blackOrcs, nero: 'mob' },
  { k: 'nightGoblins', pezzo: 'Night Goblin Mobs', n: [10, 40], opz: { c: COMANDO, spears: SI_NO, f: FRONTI }, crea: OG.nightGoblins },
  { k: 'goblins', pezzo: 'Goblin Mobs', n: [10, 40], opz: { c: COMANDO, spears: SI_NO, f: FRONTI }, crea: OG.goblins },
  { k: 'trolls', pezzo: 'Stone Troll Mobs', n: [1, 6], crea: OG.trolls },
  { k: 'boarBoys', pezzo: 'Orc Boar Boy Mobs', n: [5, 10], opz: { c: COMANDO, spears: [true, false], shields: SI_NO }, crea: OG.boarBoys },
  { k: 'chariot', pezzo: 'Orc Boar Chariots', crea: OG.chariot },
];

const LUCERTOLE = [
  { k: 'oldblood', pezzo: 'Saurus Oldblood', max: 1, opz: { weapon: ['great', 'halberd', null] }, crea: LZ.oldblood },
  /* la cavalcatura è un pezzo a sé: senza il Carnosauro in vetrina non si schiera */
  { k: 'carnoOldblood', pezzo: 'Saurus Oldblood', pezzi: () => [['Saurus Oldblood', 1], ['Carnosaur', 1]], max: 1, crea: LZ.carnoOldblood },
  { k: 'scarVet', pezzo: 'Saurus Scar-Veteran', max: 2, opz: { weapon: ['great', 'halberd', null], bsb: SI_NO }, crea: LZ.scarVet, bsb: o => o.bsb },
  { k: 'priest', pezzo: 'Skink Priest', max: 2, opz: { l2: [true, false] }, crea: LZ.priest, mago: o => o.l2 ? 2 : 1 },
  { k: 'chief', pezzo: 'Skink Chief', max: 2, crea: LZ.chief },
  { k: 'slann', pezzo: 'Slann Mage-Priests', max: 1, crea: () => da('Slann Mage-Priests'), mago: () => 4 },
  { k: 'saurus', pezzo: 'Saurus Warriors', n: [10, 30], opz: { c: COMANDO, f: FRONTI }, crea: LZ.saurus },
  { k: 'templeGuard', pezzo: 'Temple Guard', n: [10, 30], opz: { c: COMANDO, f: FRONTI }, crea: LZ.templeGuard },
  { k: 'skinks', pezzo: 'Skink Skirmishers', n: [10, 20], crea: LZ.skinks },
  { k: 'krox', pezzo: 'Kroxigor', n: [3, 6], opz: { c: ['', 'c'] }, crea: LZ.krox },
  { k: 'bastiladon', pezzo: 'Bastiladon', max: 1, crea: LZ.bastiladon },
  { k: 'terradons', pezzo: 'Terradon Riders', n: [3, 6], crea: LZ.terradons },
  { k: 'coldOnes', pezzo: 'Cold One Riders', n: [5, 10], opz: { c: COMANDO }, crea: LZ.coldOnes },
];

/* Da Boyz (Ravening Hordes p. 46): un Boss di Orchi Neri per ogni
   reggimento di Orchi Neri, e viceversa */
const daBoyz = (geni, voce) => {
  const boss = geni.filter(g => voce(g).nero === 'boss').length, mob = geni.filter(g => voce(g).nero === 'mob').length;
  return boss === mob ? [] : [`Da Boyz: ${boss} boss di Orchi Neri e ${mob} reggimenti`];
};

/* le liste già trovate a mano (esempi.mjs), scritte come geni: la
   ricerca parte anche da loro, e deve fare almeno altrettanto */
const G = (k, n, o = {}, lore) => ({ k, ...(n ? { n } : {}), o, ...(lore ? { lore } : {}) });
export const FAZIONI = {
  skaven: { sigla: 'SKA', nome: 'Skaven', cat: 'Skaven', voci: SKAVEN, vincoli: () => [],
    partenze: [[G('greySeer', 0, { level: 4 }, 'battle'), G('clanrats', 40, { shields: true, c: 'csm', f: 8 }),
                G('clanrats', 40, { shields: true, c: 'csm', f: 8 }), G('clanrats', 29, { shields: true, c: 'sm', f: 6 })]] },
  og: { sigla: 'O&G', nome: 'Orchi & Goblin', cat: 'Orc and Goblin Tribes', voci: ORCHI, vincoli: daBoyz,
    partenze: [[G('blackWarboss', 0, { great: true }), G('weirdnob', 0, { l4: true }, 'battle'),
                G('blackOrcs', 10, { c: 'cs', great: true }), G('orcs', 50, { c: 'csm' }), G('orcs', 12, { c: 'sm' })]] },
  liz: { sigla: 'LIZ', nome: 'Lucertole', cat: 'Lizardmen', voci: LUCERTOLE, vincoli: () => [],
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

/* `pool`: 'tutte' o 'collezione'. `catalogo`: le voci di dati/catalogo.json. */
export function spazio(fazione, { pool = 'tutte', punti = 800, margine = null, catalogo = null } = {}){
  const fz = FAZIONI[fazione];
  if (!fz) throw new Error(`Fazione «${fazione}» sconosciuta: ${Object.keys(FAZIONI).join(', ')}.`);
  margine = margine ?? Math.max(20, Math.round(punti * 0.04));

  /* quante miniature hai, per nome (e alias) dentro la fazione */
  const hai = new Map();
  if (pool === 'collezione'){
    for (const e of catalogo || dati('catalogo.json')){
      if (fazioneDi(e.faction) !== fazione) continue;
      for (const nome of new Set([e.name, ...(e.aliases || [])].map(norm))) hai.set(nome, (hai.get(nome) || 0) + (+e.owned || 0));
    }
  }

  /* le voci che si possono costruire davvero: il modello importato
     c'è, e — per la collezione — le miniature pure */
  const voci = [], escluse = [];
  const pezziDi = (v, n) => v.pezzi ? v.pezzi(n) : [[v.pezzo, v.n ? n : 1]];
  for (const v0 of fz.voci){
    let u;
    try { u = v0.crea({ ...Object.fromEntries(Object.entries(v0.opz || {}).map(([k, a]) => [k, a[0]])), ...(v0.n ? { n: v0.n[0] } : {}) }); }
    catch (e){ escluse.push({ k: v0.k, pezzo: v0.pezzo, perche: 'nessun modello importato' }); continue; }
    const v = { ...v0, slot: u.slot, nome: u.name, opz: v0.opz || {} };
    v.max = v0.max ?? MAX[v.slot] ?? 2;
    if (pool === 'collezione'){
      const manca = pezziDi(v, v.n ? v.n[0] : 1).filter(([p, q]) => (hai.get(norm(p)) || 0) < q);
      if (manca.length){ escluse.push({ k: v.k, pezzo: v.pezzo, perche: manca.map(([p, q]) => `${p}: ne hai ${hai.get(norm(p)) || 0}, ne servono ${q}`).join('; ') }); continue; }
      if (v.n) v.n = [v.n[0], Math.min(v.n[1], ...pezziDi(v, 1).map(([p, q]) => Math.floor((hai.get(norm(p)) || 0) / q)))];
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
    const chars = geni.filter(g => isChar(voce(g)));
    if (!chars.some(g => !bsb(g))) err.push('nessun generale');
    if (geni.filter(bsb).length > 1) err.push('due stendardi da battaglia');
    if (geni.length - chars.length < 1) err.push('solo personaggi');
    const pts = totale(geni);
    if (pts > punti) err.push(`${pts} punti su ${punti}`);
    if (pts < punti - margine) err.push(`solo ${pts} punti`);
    err.push(...fz.vincoli(geni, voce));
    if (pool === 'collezione'){
      const serve = new Map();
      for (const g of geni) for (const [p, q] of pezziDi(voce(g), g.n || 1)) serve.set(norm(p), (serve.get(norm(p)) || 0) + q);
      for (const [p, q] of serve) if (q > (hai.get(p) || 0)) err.push(`${p}: ne servono ${q}, ne hai ${hai.get(p) || 0}`);
    }
    if (!err.length){
      err.push(...avvisiComposizione({ points: pts, info: { limit: punti }, units: geni.map(g => ({ slot: voce(g).slot, pts: costo(g) })) }));
    }
    return err;
  }

  /* ---- geni a caso ---- */
  const geneCasuale = (v, rnd) => {
    const g = { k: v.k, o: Object.fromEntries(Object.entries(v.opz).map(([k, a]) => [k, scegli(a, rnd)])) };
    if (v.n) g.n = intero(v.n[0], v.n[1], rnd);
    if (v.mago && v.mago(g.o) > 0) g.lore = scegli(loriDi(v.pezzo), rnd);
    if (g.o.f != null && g.n && g.o.f > g.n) g.o.f = null;
    return g;
  };

  /* i punti che avanzano vanno nei reggimenti, un modello alla volta */
  function riempi(geni, rnd){
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
  /* e se sono troppi, si tolgono: prima modelli, poi unità che non siano personaggi */
  function ripara(geni, rnd){
    let giri = 0;
    while (totale(geni) > punti && giri++ < 500){
      const piccoli = geni.filter(g => voce(g).n && g.n > voce(g).n[0]);
      if (piccoli.length && rnd() < 0.8){ const g = scegli(piccoli, rnd); g.n = Math.max(voce(g).n[0], g.n - intero(1, 4, rnd)); continue; }
      const via = geni.filter(g => !isChar(voce(g)));
      if (via.length > 1) geni.splice(geni.indexOf(scegli(via, rnd)), 1);
      else break;
    }
    return riempi(geni, rnd);
  }

  const personaggi = voci.filter(isChar), truppe = voci.filter(v => !isChar(v));
  const base = truppe.filter(v => v.slot === 'Core');

  function casuale(rnd){
    for (let t = 0; t < 400; t++){
      const geni = [geneCasuale(scegli(personaggi, rnd), rnd)];
      if (rnd() < 0.35) geni.push(geneCasuale(scegli(personaggi, rnd), rnd));
      if (base.length) geni.push(geneCasuale(scegli(base, rnd), rnd));
      for (let prove = 0; prove < 25; prove++){
        const g = geneCasuale(scegli(rnd() < 0.5 && base.length ? base : truppe, rnd), rnd);
        if (totale([...geni, g]) <= punti) geni.push(g);
      }
      ripara(geni, rnd);
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
          geni[geni.indexOf(g)] = geneCasuale(scegli(pari, rnd), rnd);
        } else if (mossa === 'aggiungi'){
          geni.push(geneCasuale(scegli(rnd() < 0.2 ? personaggi : truppe, rnd), rnd));
        } else if (mossa === 'togli' && geni.length > 2){
          geni.splice(geni.indexOf(g), 1);
        }
        if (g.o && g.o.f != null && g.n && g.o.f > g.n) g.o.f = null;
      }
      ripara(geni, rnd);
      if (!valida(geni).length && chiave(geni) !== chiave(padre)) return ordina(geni);
    }
    return null;
  }

  /* ---- a parole, per chi legge ---- */
  const PAROLE = { shields: 'scudi', spears: 'lance', great: 'arma grande', heavy: 'armatura pesante', shield: 'scudo',
    bsb: 'stendardo da battaglia', censer: 'incensiere', catcher: 'Things-catcher', sling: 'fionde', big: "Big 'Uns" };
  function descrivi(geni){
    return ordina(geni).map(g => {
      const v = voce(g), o = g.o || {}, bit = [];
      for (const [k, x] of Object.entries(o)){
        if (x === false || x == null || x === '' || k === 'f' || k === 'l4' || k === 'l2' || k === 'level') continue;
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

  return { fazione, fz, pool, punti, margine, voci, escluse, costruisci, valida, casuale, muta, chiave, totale, descrivi, ordina, partenze };
}
