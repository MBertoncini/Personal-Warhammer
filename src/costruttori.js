/* Schieramento Old World — le unità scritte a mano, per provare liste
 *
 * (Stava in tools/liste/unita.mjs: è qui perché la ricerca delle liste
 * gira anche nella pagina, nel Laboratorio, e il browser carica come
 * moduli solo i .js di src/. Lo strumento in tools/ legge i file e
 * chiama `usaArchivio`; la pagina gli passa le liste che ha.)
 *
 * Cercare la lista migliore vuol dire provarne decine, e New Recruit non
 * si apre trenta volte: qui le unità si costruiscono nello schema di
 * dati/liste.json, con il numero di modelli, il comando e le opzioni come
 * argomenti, e i punti contati dal libro.
 *
 * Due modi di costruirle, per una ragione pratica:
 *
 *   - Orchi & Goblin e Lucertole partono dall'unità che l'archivio ha già
 *     importato da New Recruit (quella con più regole scritte), e ne
 *     cambiano solo modelli, punti, comando e armi. Così profili, tipo di
 *     truppa, cavalcatura, catId (la foto della collezione) e testi delle
 *     regole sono quelli veri, e non si ricopiano a mano.
 *   - Gli Skaven sono scritti per intero, profilo per profilo: quando si è
 *     cercata la «Skaven orda» l'archivio non aveva un modello importato
 *     per ognuna delle unità provate.
 *
 * I costi sono quelli stampati: Ravening Hordes per gli Orchi, i due
 * Legends (Lizardmen, Skaven) per gli altri, con la pagina accanto. Dove
 * New Recruit oggi scrive un numero diverso lo si dice (lo Stone Troll).
 *
 * Due cose che il simulatore NON gioca, e che quindi qui non si comprano:
 * l'arma aggiuntiva (il suo «Extra Attacks» non è letto: fra armi che
 * perforano uguale `meleeWeapon` tiene la prima dell'elenco), e per lo
 * stesso motivo l'arma che si vuole impugnare va messa per prima — le
 * lance stanno davanti all'arma a una mano. I Fanatici dei Night Goblin e
 * gli attacchi del Gigante sono regole «a mano» (dati/eserciti): un
 * costruttore per loro misurerebbe punti buttati.
 */
import { mountById, mountUnit } from './mounts.js';

/* Il personaggio montato come lo monta la scheda della lista
   (src/mounts.js): basetta, tipo di truppa, Ferite, righe che menano e
   punti della bestia sommati, dai numeri di dati/cavalcature.json. */
const monta = (u, id) => {
  const m = mountById(id);
  if (!m) throw new Error(`cavalcatura «${id}» sconosciuta`);
  mountUnit(u, m);
  u.ruleText = testiDi(u.rules);
  return u;
};

/* i testi delle regole, presi da tutte le liste importate, e il
   modello di ogni unità: fra le omonime quella con più regole, e a
   parità quella con le regole di Battle March (le importazioni vecchie
   non le portavano). Le cavalcature (src/mounts.js) le carica chi
   chiama, come per il resto dell'app. */
const TESTI = {};
const MODELLI = {};
const peso = u => (u.rules || []).length * 10 + ((u.rules || []).includes('Parry') ? 5 : 0);
export function usaArchivio(archivio = []){
  for (const k of Object.keys(TESTI)) delete TESTI[k];
  for (const k of Object.keys(MODELLI)) delete MODELLI[k];
  for (const l of archivio || []) for (const u of l.units || []){
    for (const [k, v] of Object.entries(u.ruleText || {})) TESTI[k] ||= v;
    if (!MODELLI[u.name] || peso(u) > peso(MODELLI[u.name])) MODELLI[u.name] = u;
  }
  return Object.keys(MODELLI).length;
}

/* c'è un'unità con questo nome da usare come modello? */
export const haModello = nome => !!MODELLI[nome];

const testiDi = rules => Object.fromEntries(rules.filter(r => TESTI[r]).map(r => [r, TESTI[r]]));

/* le regole che New Recruit aggiunge alla fanteria in Battle March */
export const BM = ['Press of Battle', 'Massed Infantry', 'Parry'];
const st = s => { const [M, WS, BS, S, T, W, I, A, Ld] = s.split(' '); return { M, WS, BS, S, T, W, I, A, Ld }; };
const cmd = (c = '') => ({ standard: c.includes('s'), musician: c.includes('m'), champion: c.includes('c') });
/* il comando si scrive come stringa: «csm» = campione, stendardo, musico */
const costoComando = (c, costi) => [...c].reduce((s, k) => s + (costi[k] || 0), 0);
const fronte = n => Math.max(5, Math.ceil(n / 4));

const ARMI = {
  hw: { name: 'Hand Weapon', range: 'Combat', S: 'S', ap: '-', rules: '-' },
  ahw: { name: 'Additional hand weapon', range: 'Combat', S: 'S', ap: '-', rules: 'Extra Attacks (+1), Requires Two Hands' },
  great: { name: 'Great Weapon', range: 'Combat', S: 'S+2', ap: '-2', rules: 'Armour Bane (1), Requires Two Hands, Strike Last' },
  halberd: { name: 'Halberd', range: 'Combat', S: 'S+1', ap: '-1', rules: 'Armour Bane (1), Requires Two Hands' },
  spear: { name: 'Thrusting Spear', range: 'Combat', S: 'S', ap: '-', rules: 'Fight in Extra Rank' },
  cavspear: { name: 'Cavalry Spear', range: 'Combat', S: 'S+1', ap: '-1', rules: 'First Charge' },
  vomit: { name: 'Troll Vomit', range: 'Combat', S: '3', ap: '-2', rules: '-' },
  jezzail: { name: 'Warplock jezzail', range: '36"', S: '6', ap: '-3', rules: 'Cumbersome, Magical Attacks, Move or Shoot' },
  musket: { name: 'Warplock musket', range: '24"', S: '5', ap: '-2', rules: 'Magical Attacks, Ponderous' },
  pistol: { name: 'Warplock pistol', range: '12"', S: '4', ap: '-2', rules: 'Magical Attacks, Quick Shot' },
  sling: { name: 'Sling', range: '18"', S: '3', ap: '-', rules: 'Multiple Shots (2)' },
  globes: { name: 'Poisoned Wind globes', range: '9"', S: '2', ap: '-', rules: 'Move & Shoot, Poisoned Wind, Quick Shot' },
  censer: { name: 'Plague censer', range: 'Combat', S: 'S+2', ap: '-1', rules: 'Poisoned Attacks, Requires Two Hands' },
  wlc: { name: 'Warp Lightning Cannon', range: '8D6"', S: '*', ap: '-3', rules: 'Cumbersome, Lightning Strike, Move or Shoot' },
  catcher: { name: 'Things-catcher', range: 'Combat', S: 'S', ap: '-1', rules: 'Fight in Extra Rank, Killing Blow,Requires Two Hands' },
  /* come le scrive New Recruit nelle liste dell'archivio */
  warbow: { name: 'Warbow', range: '24"', S: 'S', ap: '-', rules: 'Volley Fire' },
  shortbow: { name: 'Shortbow', range: '18"', S: '3', ap: '-', rules: 'Quick Shot, Volley Fire' },
};
const armi = l => l.map(w => typeof w === 'string' ? ARMI[w] : w);
const gittata = ws => Math.max(0, ...ws.map(w => parseInt(w.range) || 0));

/* ---- dal modello importato: Orchi & Goblin, Lucertole ---- */
export function da(nome, o = {}){
  const m = MODELLI[o.modello || nome];
  if (!m) throw new Error(`nell'archivio non c'è nessuna «${o.modello || nome}» da usare come modello`);
  const u = structuredClone(m);
  const n = o.n ?? u.models;
  /* la Forza d'Unità: quella del file per un modello solo (un Behemoth
     ce l'ha a zero e la calcola l'app), in proporzione per i reggimenti.
     In proporzione solo se e' un numero intero a modello: undici Saurus
     con la Forza d'Unita' di quindici (una lista ritoccata nell'app) la
     davano a 1,4 a modello a tutte le liste cercate. E zero resta zero —
     prima diventava uno a modello, e i Boar Boyz valevano la meta'. In
     tutti e due i casi decide la tabella dei tipi di truppa. */
  const usPer = (u.us || 0) / (u.models || 1);
  const intero = usPer > 0 && Math.abs(usPer - Math.round(usPer)) < 0.01;
  Object.assign(u, { models: n, us: u.models === n ? u.us : intero ? Math.round(usPer * n) : 0 });
  u.name = o.name || nome;
  if (o.pts != null) u.pts = o.pts;
  if (o.f) u.frontage = o.f;
  else if (n > 1 && !u.loose) u.frontage = fronte(n);
  if (o.c != null) u.command = cmd(o.c);
  if (o.stats){ u.stats = st(o.stats); if (u.profiles && u.profiles[0]) u.profiles[0].stats = u.stats; }
  if (o.armour != null) u.armour = o.armour;
  /* Parry vuole sapere dello scudo: il file vecchio non lo dice, e
     senza risposta la scheda di preparazione lo chiede */
  if (o.shield != null) u.shield = o.shield;
  else if (u.shield == null && (u.rules || []).includes('Parry')) u.shield = false;
  if (o.weapons) u.weapons = armi(o.weapons);
  if (o.rules) u.rules = [...o.rules];
  for (const r of o.add || []) if (!u.rules.includes(r)) u.rules.push(r);
  if (o.del) u.rules = u.rules.filter(r => !o.del.includes(r));
  if (o.troop) u.troop = o.troop;
  if (o.slot) u.slot = o.slot;
  if (o.unitSize) u.unitSize = o.unitSize;
  if (o.base){ const [w, h] = o.base; Object.assign(u, { baseId: `${w}x${h}`, baseW: w, baseH: h }); }
  if (o.faction) u.faction = o.faction;
  u.maxRange = gittata(u.weapons);
  u.ruleText = testiDi(u.rules);
  return u;
}

/* ---- scritte per intero: Skaven ---- */
const base = o => {
  const u = {
    crew: 0, loose: false, mount: null, profiles: [{ name: o.name, stats: o.stats }],
    command: { standard: false, musician: false, champion: false },
    faction: 'Skaven', ward: 0, regen: 0, ...o,
  };
  u.maxRange = gittata(u.weapons);
  u.catId = (MODELLI[u.name] || {}).catId;
  if (!u.catId) delete u.catId;
  u.ruleText = testiDi(u.rules);
  return u;
};

/* ================= SKAVEN (Legends: Skaven) ================= */
export const SK = {
  /* p. 15: sulla Screaming Bell, +185. Il Grey Seer della collezione ci
     sta sopra (la sua basetta in vetrina è la 60×100). */
  seerBell: ({ level = 4 } = {}) => monta(SK.greySeer({ level }), 'screaming-bell'),
  greySeer: ({ level = 4 } = {}) => base({
    name: 'Grey Seer', models: 1, baseId: '25x25', baseW: 25, baseH: 25, frontage: 1,
    pts: 185 + (level === 4 ? 30 : 0), us: 1, troop: 'Regular infantry (character)', unitSize: '1',
    stats: st('5 3 3 3 4 3 5 2 7'), armour: 0,
    rules: ['Lore of the Horned Rat', 'Magical Attacks', 'Magic Resistance (-1)', 'Scurry Away', 'Verminous Valour', 'Warband', 'Warpstone Weapons'],
    weapons: armi(['hw']), slot: 'Characters' }),
  engineer: ({ level = 0, gun = null } = {}) => base({
    name: 'Warlock Engineer', models: 1, baseId: '25x25', baseW: 25, baseH: 25, frontage: 1,
    pts: 35 + ({ 0: 0, 1: 40, 2: 70 })[level] + (gun === 'musket' ? 9 : gun === 'pistol' ? 6 : 0), us: 1,
    troop: 'Regular infantry (character)', unitSize: '1', stats: st('5 3 3 3 3 2 4 2 5'), armour: 0,
    rules: ['Lore of the Horned Rat', 'Magical Attacks', 'Scurry Away', 'Verminous Valour', 'Warband', 'Warpstone Weapons'],
    weapons: armi(['hw', ...(gun ? [gun] : [])]), slot: 'Characters' }),
  /* Warlord e Chieftain: armatura leggera di serie (6+), pesante +3 (5+), scudo +2 */
  capo: ({ warlord = true, weapon = null, heavy = false, shield = false, bsb = false } = {}) => base({
    name: warlord ? 'Skaven Warlord' : 'Skaven Chieftain', models: 1, baseId: '25x25', baseW: 25, baseH: 25, frontage: 1,
    pts: (warlord ? 90 : 45) + ({ ahw: 3, great: 4, halberd: 3 }[weapon] || 0) + (heavy ? 3 : 0) + (shield ? 2 : 0) + (bsb ? 25 : 0),
    us: 1, troop: 'Regular infantry (character)', unitSize: '1',
    stats: st(warlord ? '5 6 4 4 4 3 7 4 7' : '5 5 4 4 4 2 6 3 6'),
    armour: (heavy ? 5 : 6) - (shield ? 1 : 0), shield: shield || undefined,
    rules: ['Scurry Away', 'Verminous Valour', 'Warband', 'Warpstone Weapons', ...(bsb ? ['Battle Standard Bearer'] : [])],
    weapons: armi([...(weapon ? [weapon] : []), 'hw']), slot: 'Characters' }),
  clanrats: ({ n = 20, spears = false, shields = false, c = '', f = null } = {}) => base({
    name: 'Clanrats', models: n, baseId: '25x25', baseW: 25, baseH: 25, frontage: f || fronte(n),
    pts: n * (4 + (spears ? 1 : 0) + (shields ? 1 : 0)) + costoComando(c, { c: 7, s: 5, m: 5 }),
    us: n, troop: 'Regular infantry', unitSize: '20-40', stats: st('5 3 3 3 3 1 4 1 4'),
    armour: shields ? 5 : 6, shield: shields,
    rules: ['Close Order', 'Horde', 'Scurry Away', 'Warband', ...BM], command: cmd(c),
    weapons: armi(spears ? ['spear', 'hw'] : ['hw']), slot: 'Core' }),
  stormvermin: ({ n = 20, shields = false, c = '', f = null } = {}) => base({
    name: 'Stormvermin', models: n, baseId: '25x25', baseW: 25, baseH: 25, frontage: f || fronte(n),
    pts: n * (10 + (shields ? 1 : 0)) + costoComando(c, { c: 8, s: 6, m: 6 }),
    us: n, troop: 'Regular infantry', unitSize: '10+', stats: st('5 4 3 3 3 1 5 1 5'),
    armour: shields ? 4 : 5, shield: shields,
    rules: ['Close Order', 'Horde', 'Scurry Away', 'Warband', 'Warpstone Weapons', ...BM], command: cmd(c),
    weapons: armi(['halberd', 'hw']), slot: 'Core' }),
  jezzails: ({ n = 3 } = {}) => base({
    name: 'Warplock Jezzails', models: n, baseId: '25x50', baseW: 25, baseH: 50, frontage: Math.max(3, Math.ceil(n / 2)), loose: true,
    pts: 19 * n, us: n, troop: 'Regular infantry', unitSize: '3+', stats: st('5 3 3 3 3 2 3 2 5'), armour: 0,
    rules: ['Open Order', 'Scurry Away', 'Warband', ...BM], weapons: armi(['hw', 'jezzail']), slot: 'Special' }),
  globadiers: ({ n = 5 } = {}) => base({
    name: 'Poisoned Wind Globadiers', models: n, baseId: '25x25', baseW: 25, baseH: 25, frontage: n, loose: true,
    pts: 10 * n, us: n, troop: 'Regular infantry', unitSize: '2-10', stats: st('5 3 3 3 3 1 4 1 5'), armour: 6,
    rules: ['Scurry Away', 'Skirmishers', 'Warband', ...BM], weapons: armi(['hw', 'globes']), slot: 'Special' }),
  ratOgres: ({ n = 3, pm = 1, catcher = false } = {}) => base({
    name: 'Rat Ogres', models: n, crew: pm, baseId: '50x50', baseW: 50, baseH: 50, frontage: n,
    pts: 48 * n + 5 * pm + (catcher ? 5 : 0), us: n * 3 + pm, troop: 'Monstrous infantry', unitSize: '3+',
    stats: st('6 4 1 5 4 3 4 3 5'), armour: 5,
    profiles: [{ name: 'Rat Ogre', stats: st('6 4 1 5 4 3 4 3 5') }, ...(pm ? [{ name: 'Packmaster', stats: st('6 3 3 3 3 1 4 1 6') }] : [])],
    rules: ['Armour Bane (2)', 'Close Order', 'Fear', 'Frenzy', 'Horde', ...(pm ? ['Safe From Harm', 'Leader Of The Pack', 'Motley Crew'] : []), 'Scurry Away', 'Warband'],
    weapons: armi([...(catcher ? ['catcher'] : []), 'hw']), slot: 'Special' }),
  plagueMonks: ({ n = 20, c = '', f = null } = {}) => base({
    name: 'Plague Monks', models: n, baseId: '25x25', baseW: 25, baseH: 25, frontage: f || fronte(n),
    pts: n * 7 + 6 * c.length, us: n, troop: 'Regular infantry', unitSize: '10+',
    stats: st('5 3 3 3 4 1 3 1 5'), armour: 0,
    rules: ['Close Order', 'Frenzy', 'Horde', 'Scurry Away', 'Warband', ...BM], command: cmd(c),
    weapons: armi(['hw']), slot: 'Special' }),
  plaguePriest: ({ level = 0, censer = false } = {}) => base({
    name: 'Plague Priest', models: 1, baseId: '25x25', baseW: 25, baseH: 25, frontage: 1,
    pts: 60 + ({ 0: 0, 1: 30, 2: 60 })[level] + (censer ? 6 : 0), us: 1, troop: 'Regular infantry (character)', unitSize: '1',
    stats: st('5 5 3 4 5 2 5 3 6'), armour: 0,
    rules: ['Cloud of Flies', 'Frenzy', 'Lore of the Horned Rat', 'Magical Attacks', 'Scurry Away', 'Verminous Valour', 'Warband', 'Warpstone Weapons'],
    weapons: armi([...(censer ? ['censer'] : []), 'hw']), slot: 'Characters' }),
  nightRunners: ({ n = 10, sling = true } = {}) => base({
    name: 'Night Runners', models: n, baseId: '25x25', baseW: 25, baseH: 25, frontage: 5, loose: true,
    pts: n * (7 + (sling ? 2 : 0)), us: n, troop: 'Regular infantry', unitSize: '10+', stats: st('6 3 3 3 3 1 5 1 5'), armour: 0,
    rules: ['Evasive', 'Fire & Flee', 'Scurry Away', 'Skirmishers', ...BM], weapons: armi(['hw', ...(sling ? ['sling'] : [])]), slot: 'Core' }),
  wlc: () => base({
    name: 'Warp Lightning Cannon', models: 1, crew: 1, baseId: '50x100', baseW: 50, baseH: 100, frontage: 1, loose: true,
    pts: 110, us: 4, troop: 'War machine', unitSize: '1', stats: st('- - - - 6 4 - - -'), armour: 6,
    profiles: [{ name: 'Warp Lightning Cannon', stats: st('- - - - 6 4 - - -') }, { name: 'Engineer & Crew', stats: st('5 3 3 3 3 3 3 3 6') }],
    rules: ['Skirmishers'], weapons: armi(['wlc', 'hw']), slot: 'Rare' }),
};

/* ================= ORCHI & GOBLIN (Ravening Hordes) ================= */
/* i boss di Orchi Neri si costruiscono da quello che l'archivio ha */
const bossNero = () => ['Black Orc Bigboss', 'Black Orc Warboss'].find(haModello) || 'Black Orc Bigboss';
const A_CAVALLO = ['Tusker Charge', 'Armoured Hide', 'Counter Charge', 'Swiftstride'];
export const OG = {
  /* p. 22: 5 pt; Boss +7, stendardo +5, musico +5; lance +1; Frenesia al
     posto dell'armatura leggera +1, Big 'Uns +2, Warpaint +1. Niente scudo.
     Archi da guerra gratis, al posto delle lance: una dotazione sola
     per tutto il reggimento. */
  orcs: ({ n = 20, c = '', spears = false, bows = false, frenzy = false, big = false, paint = false, f } = {}) => da('Orc Mobs', { n, f, c,
    pts: n * (5 + (spears && !bows ? 1 : 0) + (frenzy ? 1 : 0) + (big ? 2 : 0) + (paint ? 1 : 0)) + costoComando(c, { c: 7, s: 5, m: 5 }),
    shield: false, weapons: bows ? ['hw', 'warbow'] : spears ? ['spear', 'hw'] : ['hw'], armour: (frenzy || paint) ? 0 : 6,
    add: [...(frenzy ? ['Frenzy'] : []), ...(big ? ["Big 'Uns"] : []), ...(paint ? ['Warpaint'] : [])] }),
  /* p. 21: 12 pt, armatura a piastre; Boss/stendardo/musico +6; arma grande +2 */
  blackOrcs: ({ n = 10, c = '', great = false, f } = {}) => da('Black Orc Mobs', { n, f, c,
    pts: n * (12 + (great ? 2 : 0)) + costoComando(c, { c: 6, s: 6, m: 6 }), armour: 4, shield: false,
    add: BM, weapons: great ? ['great', 'hw'] : ['hw'] }),
  /* p. 25: 3 pt con scudi, lance +1; Boss +7, stendardo +5, musico +5.
     Oppure archi corti al posto degli scudi, +1: senza scudo niente
     armatura. */
  nightGoblins: ({ n = 20, c = '', spears = false, bows = false, f } = {}) => da('Night Goblin Mobs', { n, f, c,
    pts: n * (3 + ((spears || bows) ? 1 : 0)) + costoComando(c, { c: 7, s: 5, m: 5 }),
    armour: bows ? 0 : 6, shield: !bows, add: BM, weapons: bows ? ['hw', 'shortbow'] : spears ? ['spear', 'hw'] : ['hw'],
    del: ['Release the Fanatics!', 'Fanatic Ball & Chain'] }),
  /* p. 23: 3 pt con scudi, lance +1; Boss +7, stendardo +5, musico +5 */
  goblins: ({ n = 20, c = '', spears = false, f } = {}) => da('Goblin Mobs', { n, f, c,
    pts: n * (3 + (spears ? 1 : 0)) + costoComando(c, { c: 7, s: 5, m: 5 }),
    armour: 6, shield: true, weapons: spears ? ['spear', 'hw'] : ['hw'] }),
  /* p. 28: Stone Troll 45 pt (New Recruit oggi ne scrive 43), da 1 a 9 */
  trolls: ({ n = 3 } = {}) => da('Stone Troll Mobs', { n, f: n, pts: 45 * n, weapons: ['hw', 'vomit'] }),
  /* p. 29: 15 pt, lance da cavalleria +1, scudi +1; Boss +8, stendardo/musico +6 */
  boarBoys: ({ n = 5, c = '', spears = true, shields = false } = {}) => da('Orc Boar Boy Mobs', { n, f: Math.min(n, 5), c,
    pts: n * (15 + (spears ? 1 : 0) + (shields ? 1 : 0)) + costoComando(c, { c: 8, s: 6, m: 6 }),
    weapons: spears ? ['cavspear', 'hw'] : ['hw'], armour: 5 - (shields ? 1 : 0) }),
  chariot: () => da('Orc Boar Chariots', { pts: 90 }),
  /* p. 13: Warboss 110; arma grande +4, armatura pesante +3 */
  warboss: ({ great = true, heavy = true } = {}) => da('Orc Warboss', {
    pts: 110 + (great ? 4 : 0) + (heavy ? 3 : 0), armour: heavy ? 5 : 6, shield: false,
    weapons: great ? ['great', 'hw'] : ['hw'] }),
  /* p. 19: sul War Boar, +16. È il Bigboss della collezione. */
  bigbossBoar: ({ great = false, heavy = true, bsb = false } = {}) => monta(OG.bigboss({ great, heavy, bsb }), 'war-boar'),
  /* p. 16: Night Goblin Bigboss 30, a piedi (quello della collezione sta
     su una 25×25); arma grande +4, armatura leggera +3, scudo +2. Il
     modello importato è sul Giant Cave Squig: si prende la sua metà a
     piedi, e le regole di p. 16. */
  ngBigboss: ({ great = false, light = true, shield = false } = {}) => {
    const u = da('Night Goblin Bigboss');
    const piedi = u.foot || {};
    Object.assign(u, { stats: { ...piedi.stats }, baseId: '25x25', baseW: 25, baseH: 25, troop: 'Regular infantry (character)',
      frontage: 1, loose: false, us: 1, mount: null, foot: undefined, mountId: undefined,
      pts: 30 + (great ? 4 : 0) + (light ? 3 : 0) + (shield ? 2 : 0),
      armour: 7 - (light ? 1 : 0) - (shield ? 1 : 0), shield,
      rules: ['Fear of Elves', 'Hatred (Dwarfs)', 'Rallying Cry', 'Warband'],
      weapons: armi(great ? ['great', 'hw'] : ['hw']) });
    if (u.armour > 6) u.armour = 0;
    delete u.foot; delete u.mountId; delete u.mountPts; delete u.mountFromFile;
    u.maxRange = 0; u.ruleText = testiDi(u.rules);
    return u;
  },
  /* p. 17: Night Goblin Oddnob 130, Livello 3; Livello 4 +30. Il file
     importato portava solo Fear of Elves. */
  ngOddnob: ({ l4 = false } = {}) => da('Night Goblin Oddnob', { pts: 130 + (l4 ? 30 : 0), troop: 'Regular infantry (character)', armour: 0,
    rules: ['Fear of Elves', 'Hatred (Dwarfs)', 'Lore of Mork', 'Warband'] }),
  /* p. 27: Cave Squig 10, Squig Herder 3, almeno un Herder ogni cinque
     Squig. Il motore tiene un profilo per unità: si gioca quello degli
     Squig, che stanno sempre nelle prime file (Huge gob: Forza S, −1,
     Armour Bane 1), con il Comando degli Herder (6). Gli Herder qui
     menano come Squig, e «Squigs Go Wild» resta una regola a mano. */
  squigHerd: ({ n = 10 } = {}) => {
    const herder = Math.ceil(n / 5);
    return da('Night Goblin Squig Herds', { n: n + herder, pts: 10 * n + 3 * herder, stats: '4 4 0 5 3 1 4 2 6',
      troop: 'Regular infantry', armour: 0, shield: false,
      rules: ['Hatred (Dwarfs)', 'Immune To Psychology', 'Impetuous', 'Loner', 'Motley Crew', 'Open Order', 'Skirmishers', 'Squigs Go Wild', 'Warband'],
      weapons: [{ name: 'Huge gob', range: 'Combat', S: 'S', ap: '-1', rules: 'Armour Bane (1)' }] });
  },
  /* p. 32: Squig Hopper 12; il Movimento è 3D6 e si tira (Random
     Movement). In mischia il motore fa menare il solo cavaliere. */
  squigHoppers: ({ n = 5 } = {}) => da('Night Goblin Squig Hopper Mobs', { n, pts: 12 * n,
    add: ['Random Movement', 'Hatred (Dwarfs)', 'Loner', 'Warband'] }),
  /* p. 13: Bigboss 55; stendardo da battaglia +25 (p. 11) */
  bigboss: ({ great = false, heavy = true, bsb = false } = {}) => da('Orc Bigboss', { modello: 'Orc Warboss',
    name: 'Orc Bigboss', stats: '4 5 2 4 5 2 4 3 7',
    pts: 55 + (great ? 4 : 0) + (heavy ? 3 : 0) + (bsb ? 25 : 0), armour: heavy ? 5 : 6, shield: false,
    weapons: great ? ['great', 'hw'] : ['hw'], add: bsb ? ['Battle Standard Bearer'] : [] }),
  /* p. 12: Black Orc Warboss 135, armatura a piastre; arma grande +4. Il
     modello è un boss di Orchi Neri importato, anche a cavallo: via le
     regole del cinghiale. Da Boyz (p. 45) vuole un reggimento di Orchi Neri. */
  blackWarboss: ({ great = true } = {}) => da('Black Orc Warboss', { modello: bossNero(),
    stats: '4 7 3 5 5 3 6 4 9', pts: 135 + (great ? 4 : 0), armour: 4, shield: false,
    troop: 'Heavy Infantry (character)',
    weapons: great ? ['great', 'hw'] : ['hw'], del: A_CAVALLO }),
  /* p. 12: Black Orc Bigboss 75, a piedi. L'unico importato era il
     Bigboss della collezione, che era un Orco sul cinghiale: ora e' un
     Orc Bigboss, e il modello e' il Warboss. */
  blackBigboss: () => da('Black Orc Bigboss', { modello: bossNero(),
    stats: '4 6 3 4 5 2 5 3 8', pts: 75, armour: 4, shield: false,
    troop: 'Heavy Infantry (character)', weapons: ['hw'], del: A_CAVALLO }),
  /* p. 14: Weirdnob 140 (Livello 3), Livello 4 +30: il Livello va anche
     nella scheda di preparazione, perché il file non lo dice */
  weirdnob: ({ l4 = true } = {}) => da('Orc Weirdnob', { pts: 140 + (l4 ? 30 : 0) }),
  /* p. 16: Goblin Oddnob 135, Livello 4 +30 */
  oddnob: ({ l4 = true } = {}) => da('Goblin Oddnob', { pts: 135 + (l4 ? 30 : 0) }),
  ogdruz: () => da('Ogdruz Swampdigga', { pts: 195 }),
};

/* ================= LUCERTOLE (Legends: Lizardmen) ================= */
const SAURI = ['Close Order', 'Cold Blooded', 'Obsidian Blades'];
export const LZ = {
  /* p. 6: 14 pt con scudi e scaglie (armatura pesante); campione, stendardo, musico +7 */
  saurus: ({ n = 20, c = '', f } = {}) => da('Saurus Warriors', { n, f, c,
    pts: 14 * n + 7 * c.length, armour: 4, shield: true, rules: [...SAURI, ...BM], weapons: ['hw'] }),
  /* p. 6: 16 pt, alabarde e scudi; +7 per elemento del comando */
  templeGuard: ({ n = 15, c = '', f } = {}) => da('Temple Guard', { n, f, c,
    pts: 16 * n + 7 * c.length, armour: 4, shield: true,
    rules: [...SAURI, 'Guardians', 'Shieldwall', 'Stubborn', ...BM], weapons: ['halberd', 'hw'] }),
  /* p. 7: 5 pt, giavellotti e scudi gratis */
  skinks: ({ n = 10 } = {}) => da('Skink Skirmishers', { n, f: Math.max(5, Math.ceil(n / 2)), pts: 5 * n }),
  /* p. 8: Kroxigor 49, Ancient +7; armi grandi e scaglie */
  krox: ({ n = 3, c = '' } = {}) => da('Kroxigor', { modello: 'Temple Guard', name: 'Kroxigor', n, f: n, c,
    pts: 49 * n + (c.includes('c') ? 7 : 0), stats: '6 3 0 5 4 3 3 3 7', armour: 5, shield: false,
    troop: 'Monstrous infantry', base: [40, 40], unitSize: '3+',
    rules: ['Aquatic', 'Close Order', 'Cold Blooded', 'Fear', 'Skirmish Screen'], weapons: ['great', 'hw'], slot: 'Special' }),
  /* p. 3: Scar-Veteran 90, Oldblood 140; arma grande +4, alabarda +3;
     stendardo da battaglia +25 (p. 2) */
  scarVet: ({ weapon = 'great', bsb = false } = {}) => da('Saurus Scar-Veteran', {
    pts: 90 + ({ great: 4, halberd: 3 }[weapon] || 0) + (bsb ? 25 : 0), armour: 5, shield: false,
    rules: ['Cold Blooded', 'Furious Charge', 'Obsidian Blades', 'Rallying Cry', ...(bsb ? ['Battle Standard Bearer'] : [])],
    weapons: [...(weapon ? [weapon] : []), 'hw'] }),
  oldblood: ({ weapon = 'great' } = {}) => da('Saurus Oldblood', { modello: 'Saurus Scar-Veteran',
    stats: '4 6 0 5 5 3 3 5 8', pts: 140 + ({ great: 4, halberd: 3 }[weapon] || 0), armour: 5, shield: false,
    rules: ['Cold Blooded', 'Furious Charge', 'Obsidian Blades', 'Rallying Cry'],
    weapons: [...(weapon ? [weapon] : []), 'hw'] }),
  /* pp. 3 e 12: Oldblood sul Carnosauro, 140 + 170. Il modello importato
     è della LIZ fun, che è Renegades: Armoured Hide (2) e Predatory
     Fighter nel Legends non ci sono, e la pelle vale armatura pesante */
  carnoOldblood: () => da('Saurus Oldblood', { pts: 310, armour: 5, faction: 'Lizardmen',
    del: ['Predatory Fighter', 'Armoured Hide (2)', 'General'],
    add: ["Furious Charge (does not apply to this model's mount should it have one)"] }),
  /* p. 4: Skink Priest 60, Livello 2 +30 */
  priest: ({ l2 = true } = {}) => da('Skink Priest', { modello: 'Skink Chief', stats: '6 2 3 3 2 2 4 1 6',
    pts: 60 + (l2 ? 30 : 0), armour: 6, shield: false,
    rules: ['Aquatic', 'Cold Blooded', 'Lore Of Lustria'], weapons: ['hw'] }),
  /* p. 13: sull'Ancient Stegadon, +230 */
  priestSteg: ({ l2 = true } = {}) => monta(LZ.priest({ l2 }), 'ancient-stegadon'),
  /* p. 13: l'Ancient Stegadon da solo, 230 (Rara, 0-1 ogni 1000 punti
     con lo Stegadon, p. 2). La riga della bestia è quella del modello, e
     i cinque Skink dell'equipaggio menano come riga a parte, come fanno
     sotto un personaggio (src/mounts.js): tirano l'arco gigante con la
     loro Abilità Balistica e danno il loro Comando. */
  ancientSteg: () => {
    const m = mountById('ancient-stegadon');
    const bestia = m.righe[0].stats, crew = m.righe.find(r => /crew/i.test(r.chi));
    const u = base({
      name: 'Ancient Stegadon', models: 1, crew: 5, baseId: '60x100', baseW: 60, baseH: 100, frontage: 1,
      pts: 230, us: 0, troop: 'Behemoth', unitSize: '1', faction: 'Lizardmen',
      stats: { ...bestia, BS: crew.stats.BS, Ld: crew.stats.Ld }, armour: 4,
      rules: [...m.regole, 'Poisoned Attacks (javelins only)'], weapons: m.armi.map(w => ({ ...w })), slot: 'Rare' });
    Object.assign(u, { mountId: m.id, mountPts: 0, mountFromFile: true,
      mount: { id: m.id, name: m.nome, genere: m.genere, stats: bestia, row: '', righe: [structuredClone(crew)],
               forzaUrto: +m.forzaUrto || 0, random: '', armour: 4, libro: m.libro, pagina: m.pagina, nota: '' } });
    u.ruleText = testiDi(u.rules);
    return u;
  },
  /* p. 4: Skink Chief 45 */
  chief: () => da('Skink Chief', { pts: 45, weapons: ['hw'], armour: 6 }),
  /* p. 14: Bastiladon 160 */
  bastiladon: () => da('Bastiladon', { pts: 160 }),
  /* p. 10: Terradon Riders 32 */
  terradons: ({ n = 3 } = {}) => da('Terradon Riders', { n, f: Math.min(n, 3), pts: 32 * n }),
  /* p. 10: Cold One Riders 34; campione, stendardo, musico +7 */
  coldOnes: ({ n = 5, c = '' } = {}) => da('Cold One Riders', { n, f: Math.min(n, 5), c, pts: 34 * n + 7 * c.length }),
};

/* ============ GLI ESERCITI SCRITTI DAL LIBRO, SENZA ARCHIVIO ============
   Uomini Bestia (Ravening Hordes), Elfi Silvani e Nani (Forces of
   Fantasy): nessuna lista salvata li schiera, e le unità si scrivono per
   intero come quelle Skaven, profilo per profilo, con la pagina
   stampata accanto. Quello che il simulatore non gioca non si compra:
   l'arma aggiuntiva (il suo attacco in più non è letto), gli oggetti
   magici e runici, le mutazioni, gli Spiriti della Foresta, le regole
   d'agguato (Ambushers, Vanguard: l'arbitro schiera tutto all'inizio).

   Due letture dichiarate, uguali per tutti e tre:
   - un'unità che può stare in ordine aperto (Open Order, p. 182) si
     schiera in ranghi e non sciolta, anche quando ha anche Skirmishers:
     in ranghi prende il bonus di ranghi e la salva degli archi. Il giro
     rapido e i ranghi che il terreno non scompiglia non si giocano;
   - lo scudo con un'arma a due mani non si compra: il libro lo lascia
     contro il tiro, e l'armatura dell'app è una sola. */
const scritta = faction => o => base({ faction, ...o });
/* l'armatura: «light» 6+, «heavy» 5+, «plate» 4+, lo scudo uno in meno,
   e la pelle che migliora di X (Armoured Hide, p. 165) */
const armatura = (tipo, { shield = false, hide = 0 } = {}) => {
  const v = ({ light: 6, heavy: 5, plate: 4 })[tipo] || 7;
  const a = Math.max(2, v - (shield ? 1 : 0) - hide);
  return a >= 7 ? 0 : a;
};
const BASE = (w, h = w) => ({ baseId: `${w}x${h}`, baseW: w, baseH: h });
const pg = o => ({ models: 1, frontage: 1, us: 1, unitSize: '1', slot: 'Characters', ...o });

Object.assign(ARMI, {
  stone: { name: 'Stone thrower', range: '12-60"', S: '4 (8)', ap: '-1 (-3)', rules: 'Bombardment, Cumbersome, Move or Shoot, Multiple Wounds (D3+1)' },
  crossbow: { name: 'Crossbow', range: '30"', S: '4', ap: '-', rules: 'Armour Bane (2), Ponderous' },
  handgun: { name: 'Handgun', range: '24"', S: '4', ap: '-1', rules: 'Armour Bane (1), Ponderous' },
  throwingAxe: { name: 'Throwing axe', range: '9"', S: 'S+1', ap: '-', rules: 'Quick Shot' },
  javelin: { name: 'Javelin', range: '12"', S: 'S', ap: '-', rules: 'Move & Shoot, Quick Shot' },
  throwingSpear: { name: 'Throwing spear', range: 'Combat', S: 'S', ap: '-', rules: 'Fight in Extra Rank' },
  claws: { name: 'Claws (counts as hand weapons)', range: 'Combat', S: 'S', ap: '-', rules: '-' },
  tusks: { name: 'Tusks (counts as a hand weapon)', range: 'Combat', S: 'S', ap: '-', rules: '-' },
  /* Forces of Fantasy: le armi degli Elfi Silvani (p. 147) e dei Nani */
  asraiSpear: { name: 'Asrai spear', range: 'Combat', S: 'S', ap: '-1', rules: 'Fight in Extra Rank' },
  glaive: { name: "Ranger's glaive", range: 'Combat', S: 'S+2', ap: '-2', rules: 'Requires Two Hands' },
  huntingSpear: { name: 'Hunting spear', range: 'Combat', S: 'S+1', ap: '-2', rules: 'Armour Bane (1)' },
  blackbriar: { name: 'Blackbriar javelin', range: '12"', S: 'S', ap: '-1', rules: 'Move & Shoot, Quick Shot' },
  oaken: { name: 'Oaken fists', range: 'Combat', S: 'S', ap: '-2', rules: '-' },
  roots: { name: 'Strangleroots', range: '12"', S: 'S', ap: '-1', rules: 'Multiple Shots (D6+1)' },
  wickedClaws: { name: 'Wicked claws', range: 'Combat', S: 'S', ap: '-2', rules: '-' },
  hammers: { name: 'Great hammers', range: 'Combat', S: 'S+2', ap: '-2', rules: 'Armour Bane (2), Magical Attacks, Requires Two Hands' },
  drakegun: { name: 'Drakegun', range: '18"', S: '5', ap: '-1', rules: 'Armour Bane (2), Dwarf Crafted, Flaming Attacks, Quick Shot' },
  brimstone: { name: 'Brimstone gun', range: '18"', S: '5', ap: '-2', rules: 'Dwarf Crafted, Flaming Attacks, Multiple Shots (D3+1), Quick Shot' },
  clattergun: { name: 'Clattergun', range: '24"', S: '4', ap: '-1', rules: 'Armour Bane (1), Dwarf Crafted, Move & Shoot, Multiple Shots (D6), Quick Shot' },
  cleavers: { name: 'Cleaver-limbs', range: 'Combat', S: 'S', ap: '-2', rules: 'Killing Blow, Monster Slayer' },
});

/* L'arco degli Elfi Silvani (Forces of Fantasy p. 147) con le frecce
   incantate: costano a modello, e cambiano il profilo dell'arco. */
const FRECCE = {
  bodkins: { ap: '-2', rules: [] },
  hagbane: { rules: ['Poisoned Attacks'] },
  moonfire: { rules: ['Flaming Attacks', 'Magical Attacks'] },
  swiftshiver: { rules: ['Multiple Shots (2)'] },
  trueflight: { rules: ['Ignores Cover', 'Quick Shot'] },
};
const COSTO_FRECCE = { bodkins: 2, hagbane: 2, moonfire: 1, swiftshiver: 2, trueflight: 1 };
const arco = frecce => {
  const f = FRECCE[frecce] || { rules: [] };
  return { name: 'Asrai longbow', range: '32"', S: 'S', ap: f.ap || '-',
           rules: ['Armour Bane (1)', 'Volley Fire', ...f.rules].join(', ') };
};

/* ================= UOMINI BESTIA (Ravening Hordes) ================= */
const BESTIA = 'Beastmen Brayherds';
const bm = scritta(BESTIA);
const BRAY = ['Mark of Chaos Undivided', 'Primal Fury', 'Warband'];
export const BH = {
  /* p. 92: Beastlord 115, Wargor 55; arma grande +4; armatura leggera +2
     o pesante +4; scudo +2; stendardo da battaglia +25 (p. 91) */
  capo: ({ beastlord = true, great = true, armour = 'heavy', shield = false, bsb = false } = {}) => {
    const scudo = shield && !great;
    return bm(pg({
      name: beastlord ? 'Beastlord' : 'Wargor', ...BASE(25),
      pts: (beastlord ? 115 : 55) + (great ? 4 : 0) + ({ light: 2, heavy: 4 }[armour] || 0) + (scudo ? 2 : 0) + (bsb ? 25 : 0),
      troop: 'Heavy infantry (character)', stats: st(beastlord ? '5 6 3 5 5 3 5 4 8' : '5 5 3 4 5 2 4 3 7'),
      armour: armatura(armour, { shield: scudo }), shield: scudo || undefined,
      rules: ['Blood Rage', ...(beastlord ? ['Brayhorn (General only)'] : []), 'Foe Render', 'Gaze of the Gods', ...BRAY,
              ...(bsb ? ['Battle Standard Bearer'] : [])],
      weapons: armi([...(great ? ['great'] : []), 'hw']) }));
  },
  /* p. 93: Great Bray-Shaman 150 (Livello 3, +30 il 4), Bray-Shaman 65
     (Livello 1, +30 il 2). Il Braystaff si sceglie a ogni combattimento:
     qui sempre in difesa, arma a una mano e armatura 5+. */
  sciamano: ({ great = true, level = great ? 3 : 1 } = {}) => bm(pg({
    name: great ? 'Great Bray-Shaman' : 'Bray-Shaman', ...BASE(25),
    pts: (great ? 150 : 65) + (level > (great ? 3 : 1) ? 30 : 0),
    troop: 'Regular infantry (character)', stats: st(great ? '5 5 3 4 5 3 4 2 8' : '5 4 3 3 4 2 3 1 7'),
    armour: 5, rules: ['Braystaff', 'Gaze of the Gods', 'Lore of Beasts', ...BRAY],
    weapons: armi([{ name: 'Braystaff (hand weapon)', range: 'Combat', S: 'S', ap: '-', rules: '-' }]) })),
  /* p. 94: Doombull 210, Gorebull 130; arma grande +4; leggera +3,
     pesante +6; scudo +5 */
  toro: ({ doombull = true, great = true, armour = 'heavy', shield = false } = {}) => {
    const scudo = shield && !great;
    return bm(pg({
      name: doombull ? 'Doombull' : 'Gorebull', ...BASE(50), us: 3,
      pts: (doombull ? 210 : 130) + (great ? 4 : 0) + ({ light: 3, heavy: 6 }[armour] || 0) + (scudo ? 5 : 0),
      troop: 'Monstrous infantry (character)', stats: st(doombull ? '6 6 3 6 5 5 5 5 8' : '6 5 3 5 5 4 4 4 7'),
      armour: armatura(armour, { shield: scudo }), shield: scudo || undefined,
      rules: ['Armour Bane (1)', 'Blood Greed', 'Blood Rage', 'Bull-gors', 'Fear', 'Foe Render', 'Gaze of the Gods',
              'Impact Hits (1)', "Slaughterer's Call", ...BRAY],
      weapons: armi([...(great ? ['great'] : []), 'hw']) }));
  },
  /* p. 97: Gor 7, scudi o arma aggiuntiva gratis (qui gli scudi);
     True-horn +7, stendardo +5, musico +5 */
  gors: ({ n = 20, c = '', f = null } = {}) => bm({
    name: 'Gor Herd', models: n, ...BASE(25), frontage: f || fronte(n),
    pts: 7 * n + costoComando(c, { c: 7, s: 5, m: 5 }), us: n, troop: 'Regular infantry', unitSize: '5+',
    stats: st('5 4 2 3 4 1 3 1 6'), armour: 6, shield: true, command: cmd(c),
    rules: ['Bestial Charge', 'Blood Rage', 'Horde', 'Move through Cover', 'Open Order', 'Skirmishers', ...BRAY, ...BM],
    weapons: armi(['hw']), slot: 'Core' }),
  /* p. 98: Ungor 5 con scudi; lance +1, o archi corti al posto degli
     scudi; Half-horn +7, stendardo +5, musico +5 */
  ungors: ({ n = 20, c = '', spears = false, bows = false, f = null } = {}) => bm({
    name: 'Ungor Herd', models: n, ...BASE(25), frontage: f || fronte(n),
    pts: n * (5 + (spears && !bows ? 1 : 0)) + costoComando(c, { c: 7, s: 5, m: 5 }), us: n,
    troop: 'Regular infantry', unitSize: '10+', stats: st('5 3 3 3 3 1 3 1 5'),
    armour: bows ? 0 : 6, shield: !bows, command: cmd(c),
    rules: ['Chariot Runners', 'Horde', 'Move through Cover', 'Open Order', 'Skirmishers', ...BRAY, ...BM],
    weapons: armi(bows ? ['hw', 'shortbow'] : spears ? ['spear', 'hw'] : ['hw']), slot: 'Core' }),
  /* p. 96: Bestigor 13, armi grandi e armatura pesante; Gouge-horn +8,
     stendardo +6, musico +6 */
  bestigors: ({ n = 10, c = '', f = null } = {}) => bm({
    name: 'Bestigor Herd', models: n, ...BASE(30), frontage: f || fronte(n),
    pts: 13 * n + costoComando(c, { c: 8, s: 6, m: 6 }), us: n, troop: 'Heavy infantry', unitSize: '5+',
    stats: st('5 4 3 4 4 1 4 1 7'), armour: 5, shield: false, command: cmd(c),
    rules: ['Blood Rage', 'Close Order', ...BRAY, ...BM], weapons: armi(['great', 'hw']), slot: 'Special' }),
  /* p. 99: Minotaur 47, armi a una mano e armatura leggera; arma grande
     +4 a modello; Bloodkine +6, stendardo +6, musico +6 */
  minotaurs: ({ n = 3, c = '', great = true } = {}) => bm({
    name: 'Minotaur Herd', models: n, ...BASE(50), frontage: n, us: 3 * n,
    pts: n * (47 + (great ? 4 : 0)) + costoComando(c, { c: 6, s: 6, m: 6 }), troop: 'Monstrous infantry', unitSize: '2+',
    stats: st('6 4 3 5 4 3 3 3 7'), armour: 6, shield: false, command: cmd(c),
    rules: ['Blood Greed', 'Blood Rage', 'Bull-gors', 'Close Order', 'Fear', 'Foe Render', 'Impact Hits (1)', 'Motley Crew', ...BRAY],
    weapons: armi([...(great ? ['great'] : []), 'hw']), slot: 'Special' }),
  /* p. 98: Harpy 11, artigli */
  harpies: ({ n = 5 } = {}) => bm({
    name: 'Harpies', models: n, ...BASE(25), frontage: n, loose: true, us: n,
    pts: 11 * n, troop: 'Regular infantry', unitSize: '5+', stats: st('5 3 0 3 3 1 5 2 6'), armour: 0,
    rules: ['Fly (10)', 'Move through Cover', 'Scouts', 'Skirmishers', 'Swiftstride'],
    weapons: armi(['claws']), slot: 'Special' }),
  /* p. 100: Centigor 19, armi a una mano e scudi; lance da cavalleria +1,
     o armi grandi al posto degli scudi +1; asce da lancio o giavellotti
     +1; Gorehoof +8, stendardo +6, musico +6 */
  centigors: ({ n = 5, c = '', arma = 'spear', axes = false } = {}) => bm({
    name: 'Centigor Herd', models: n, ...BASE(30, 60), frontage: Math.min(n, 5), us: 2 * n,
    pts: n * (19 + (arma ? 1 : 0) + (axes ? 1 : 0)) + costoComando(c, { c: 8, s: 6, m: 6 }),
    troop: 'Light cavalry', unitSize: '5+', stats: st('8 4 3 4 4 1 2 1 6'),
    armour: arma === 'great' ? 0 : 6, shield: arma !== 'great', command: cmd(c),
    rules: ['Drunken', 'Fast Cavalry', 'Horde', 'Move through Cover', 'Open Order', 'Skirmishers', 'Stomp Attacks (1)',
            'Swiftstride', ...BRAY],
    weapons: armi([...(arma === 'great' ? ['great'] : arma === 'spear' ? ['cavspear'] : []), 'hw', ...(axes ? ['throwingAxe'] : [])]),
    slot: 'Special' }),
  /* p. 101: Dragon Ogre 56, armi a una mano e armatura leggera, con la
     pelle (Armoured Hide (2)): 4+; armi grandi +4, alabarde +3;
     armatura pesante +3 (3+); Shartak +7 */
  dragonOgres: ({ n = 3, c = '', arma = 'great', heavy = false } = {}) => bm({
    name: 'Dragon Ogres', models: n, ...BASE(50, 75), frontage: n, us: 3 * n,
    pts: n * (56 + ({ great: 4, halberd: 3 }[arma] || 0) + (heavy ? 3 : 0)) + (c.includes('c') ? 7 : 0),
    troop: 'Monstrous cavalry', unitSize: '1-9', stats: st('7 4 2 5 4 4 2 3 8'),
    armour: armatura(heavy ? 'heavy' : 'light', { hide: 2 }), command: cmd(c.includes('c') ? 'c' : ''),
    rules: ['Armour Bane (1)', 'Armoured Hide (2)', 'Close Order', 'Fear', 'Ensorcelled Weapons', 'Immune to Psychology',
            'Stomp Attacks (2)', 'The Quickening Storm'],
    weapons: armi([...(arma ? [arma] : []), 'hw']), slot: 'Special' }),
  /* p. 102: Chaos Warhound 6 */
  hounds: ({ n = 5 } = {}) => bm({
    name: 'Chaos Warhounds', models: n, ...BASE(25, 50), frontage: n, us: n,
    pts: 6 * n, troop: 'War beasts', unitSize: '5+', stats: st('7 4 0 3 3 1 3 1 6'), armour: 0,
    rules: ['Loner', 'Move through Cover', 'Open Order', 'Swiftstride'],
    weapons: armi([{ name: 'Claws and fangs (counts as a hand weapon)', range: 'Combat', S: 'S', ap: '-', rules: '-' }]), slot: 'Core' }),
  /* p. 102: Razorgor 52, zanne e pelle callosa (armatura leggera) */
  razorgors: ({ n = 1 } = {}) => bm({
    name: 'Razorgor Herd', models: n, ...BASE(50, 75), frontage: n, us: n,
    pts: 52 * n, troop: 'War beasts', unitSize: '1+', stats: st('7 3 0 5 5 3 2 4 6'), armour: 6,
    rules: ['Armour Bane (1)', 'Fear', 'Foe Render', 'Impact Hits (D3)', 'Loner', 'Open Order', 'Primal Fury', 'Razor Tusks', 'Swiftstride'],
    weapons: armi(['tusks']), slot: 'Core' }),
  /* p. 103: Tuskgor Chariot 85, Razorgor Chariot 120. Il carro ha «-»
     dove menano l'equipaggio e le bestie: le righe stanno in
     dati/profili.json */
  carro: ({ razorgor = false } = {}) => bm({
    name: razorgor ? 'Razorgor Chariot' : 'Tuskgor Chariot', models: 1, ...BASE(50, 100), frontage: 1, us: 5,
    pts: razorgor ? 120 : 85, troop: 'Heavy chariot', unitSize: '1',
    stats: st(razorgor ? '- - - 5 5 4 - - -' : '- - - 5 4 4 - - -'), armour: 4,
    rules: razorgor
      ? ['Armour Bane (1, Razorgor only)', 'Close Order', 'Fear', 'First Charge', 'Foe Render (Razorgor only)', 'Impact Hits (D6+2)',
         'Mark of Chaos Undivided', 'Primal Fury', 'Razor Tusks']
      : ['Close Order', 'First Charge', 'Impact Hits (D6+1)', 'Mark of Chaos Undivided', 'Primal Fury', 'Razor Tusks', 'Warband'],
    weapons: armi(['hw']), slot: razorgor ? 'Special' : 'Core' }),
  /* p. 110: Ghorgon 245, pelle callosa (leggera) */
  ghorgon: () => bm({
    name: 'Ghorgon', models: 1, ...BASE(60, 100), frontage: 1, us: 0, pts: 245, troop: 'Behemoth', unitSize: '1',
    stats: st('7 4 0 6 6 6 4 5 9'), armour: 6, regen: 6,
    rules: ['Blood Greed', 'Close Order', 'Frenzy', 'Large Target', 'Primal Fury', 'Regeneration (6+)', 'Stomp Attacks (D3)',
            'Stubborn', 'Swallow Whole', 'Terror', 'Timmm-berrr!'],
    weapons: armi(['cleavers']), slot: 'Rare' }),
  /* p. 104: Dragon Ogre Shaggoth 225, arma a una mano e armatura
     leggera con la pelle (4+); arma grande +4, pesante +6 (3+) */
  shaggoth: ({ great = true, heavy = false } = {}) => bm({
    name: 'Dragon Ogre Shaggoth', models: 1, ...BASE(50, 75), frontage: 1, us: 0,
    pts: 225 + (great ? 4 : 0) + (heavy ? 6 : 0), troop: 'Monstrous creature', unitSize: '1',
    stats: st('7 6 2 6 5 6 4 5 9'), armour: armatura(heavy ? 'heavy' : 'light', { hide: 2 }),
    rules: ['Armour Bane (2)', 'Armoured Hide (2)', 'Close Order', 'Ensorcelled Weapons', 'Immune to Psychology', 'Large Target',
            'Stomp Attacks (D3+1)', 'Storm Call', 'Terror', 'The Quickening Storm'],
    weapons: armi([...(great ? ['great'] : []), 'hw']), slot: 'Rare' }),
};

/* ================= ELFI SILVANI (Forces of Fantasy) ================= */
const SILVANI = 'Wood Elf Realms';
const we = scritta(SILVANI);
export const WE = {
  /* p. 120: Glade Lord 135, Glade Captain 70; arma a una mano, arco
     Asrai e armatura leggera; arma grande +4, scudo +2; frecce +6/+3;
     stendardo da battaglia +25 (p. 119) */
  capo: ({ lord = true, great = false, shield = false, frecce = null, bsb = false } = {}) => {
    const scudo = shield && !great;
    return we(pg({
      name: lord ? 'Glade Lord' : 'Glade Captain', ...BASE(25),
      pts: (lord ? 135 : 70) + (great ? 4 : 0) + (scudo ? 2 : 0) + (frecce ? 3 * COSTO_FRECCE[frecce] : 0) + (bsb ? 25 : 0),
      troop: 'Regular infantry (character)', stats: st(lord ? '5 7 7 4 3 3 6 4 10' : '5 6 6 4 3 2 5 3 9'),
      armour: armatura('light', { shield: scudo }), shield: scudo || undefined,
      rules: ['The Arrow of Kurnous', 'Evasive', 'Fire & Flee', 'Ignores Cover', 'Move through Cover', 'Rallying Cry',
              'Strike First', ...(bsb ? ['Battle Standard Bearer'] : [])],
      weapons: armi([...(great ? ['great'] : []), 'hw', arco(frecce)]) }));
  },
  /* p. 121: Spellweaver 155 (Livello 3, +30 il 4), Spellsinger 80
     (Livello 1, +30 il 2); Talismanic Tattoos +15 */
  mago: ({ weaver = true, level = weaver ? 3 : 1, tattoos = false } = {}) => we(pg({
    name: weaver ? 'Spellweaver' : 'Spellsinger', ...BASE(25),
    pts: (weaver ? 155 : 80) + (level > (weaver ? 3 : 1) ? 30 : 0) + (tattoos ? 15 : 0),
    troop: 'Regular infantry (character)', stats: st(weaver ? '5 4 4 3 3 3 4 2 8' : '5 4 4 3 3 2 4 1 8'), armour: 0,
    rules: ['Elven Reflexes', 'Lore of Athel Loren', 'Magical Attacks', 'Move through Cover', ...(tattoos ? ['Talismanic Tattoos'] : [])],
    weapons: armi(['hw']) })),
  /* p. 125: Branchwraith 80 (Livello 1, +30 il 2); arma grande +4 */
  branchwraith: ({ level = 1, great = false } = {}) => we(pg({
    name: 'Branchwraith', ...BASE(30), pts: 80 + (level > 1 ? 30 : 0) + (great ? 4 : 0),
    troop: 'Regular infantry (character)', stats: st('5 6 6 4 4 2 6 2 8'), armour: 6, regen: 6,
    rules: ['Fear', 'Flammable', 'Immune to Psychology', 'Lore of Athel Loren', 'Magical Attacks', 'Move through Cover',
            'Regeneration (6+)', 'Tree Spirit'],
    weapons: armi([...(great ? ['great'] : []), 'hw']) })),
  /* p. 124: Treeman Ancient 265 (Livello 2; +30 il 3, +60 il 4) */
  ancient: ({ level = 2 } = {}) => we(pg({
    name: 'Treeman Ancient', ...BASE(50, 75), us: 0, pts: 265 + (level - 2) * 30,
    troop: 'Behemoth (character)', stats: st('5 5 5 5 6 6 2 3 10'), armour: 4, regen: 5,
    rules: ['Close Order', 'Flammable', 'Immune to Psychology', 'Large Target', 'Lore of Athel Loren', 'Magical Attacks',
            'Move through Cover', 'Regeneration (5+)', 'Stomp Attacks (D3)', 'Stubborn', 'Terror', 'Timmm-berrr!', 'Tree Spirit', 'Tree Whack'],
    weapons: armi(['oaken', 'roots']) })),
  /* p. 128: Glade Guard 11, armi a una mano e archi Asrai; frecce a
     modello; Lord's Bowman, stendardo, musico +6 */
  gladeGuard: ({ n = 10, c = '', frecce = null, f = null } = {}) => we({
    name: 'Glade Guard', models: n, ...BASE(25), frontage: f || fronte(n),
    pts: n * (11 + (frecce ? COSTO_FRECCE[frecce] : 0)) + 6 * c.length, us: n,
    troop: 'Regular infantry', unitSize: '5+', stats: st('5 4 4 3 3 1 4 1 8'), armour: 0, command: cmd(c),
    rules: ['Elven Reflexes', 'Move through Cover', 'Open Order', ...BM], weapons: armi(['hw', arco(frecce)]), slot: 'Core' }),
  /* p. 128: Deepwood Scouts 13, schermagliatori */
  scouts: ({ n = 5, frecce = null } = {}) => we({
    name: 'Deepwood Scouts', models: n, ...BASE(25), frontage: n, loose: true,
    pts: n * (13 + (frecce ? COSTO_FRECCE[frecce] : 0)), us: n, troop: 'Regular infantry', unitSize: '5+',
    stats: st('5 4 4 3 3 1 4 1 8'), armour: 0,
    rules: ['Elven Reflexes', 'Evasive', 'Fire & Flee', 'Move through Cover', 'Scouts', 'Skirmishers', ...BM],
    weapons: armi(['hw', arco(frecce)]), slot: 'Special' }),
  /* p. 129: Eternal Guard 13, lance Asrai e armatura leggera; scudi +1;
     Eternal Warden, stendardo, musico +5 */
  eternalGuard: ({ n = 15, c = '', shields = true, f = null } = {}) => we({
    name: 'Eternal Guard', models: n, ...BASE(25), frontage: f || fronte(n),
    pts: n * (13 + (shields ? 1 : 0)) + 5 * c.length, us: n, troop: 'Regular infantry', unitSize: '5+',
    stats: st('5 5 4 3 3 1 4 1 9'), armour: armatura('light', { shield: shields }), shield: shields, command: cmd(c),
    rules: ['Close Order', 'Elven Reflexes', 'Martial Prowess', 'Move through Cover', 'Stubborn', ...BM],
    weapons: armi(['asraiSpear', 'hw']), slot: 'Core' }),
  /* p. 130: Wildwood Ranger 14, alabarde dei ranger e armatura leggera;
     Warden, stendardo, musico +6 */
  rangers: ({ n = 10, c = '', f = null } = {}) => we({
    name: 'Wildwood Rangers', models: n, ...BASE(25), frontage: f || fronte(n),
    pts: 14 * n + 6 * c.length, us: n, troop: 'Regular infantry', unitSize: '5+',
    stats: st('5 5 4 3 3 1 4 1 9'), armour: 6, shield: false, command: cmd(c),
    rules: ['Close Order', 'Elven Reflexes', 'Guardians of the Wildwood', 'Immune to Psychology', 'Move through Cover', ...BM],
    weapons: armi(['glaive', 'hw']), slot: 'Special' }),
  /* p. 133: Dryad 13, sapwood flesh (armatura leggera); Nymph +5 */
  dryads: ({ n = 10, c = '', f = null } = {}) => we({
    name: 'Dryads', models: n, ...BASE(30), frontage: f || fronte(n),
    pts: 13 * n + (c.includes('c') ? 5 : 0), us: n, troop: 'Regular infantry', unitSize: '5+',
    stats: st('5 4 4 3 4 1 4 2 8'), armour: 6, regen: 6, command: cmd(c.includes('c') ? 'c' : ''),
    rules: ['Fear', 'Flammable', 'Immune to Psychology', 'Magical Attacks', 'Move through Cover', 'Open Order',
            'Regeneration (6+)', 'Skirmishers', 'Stubborn', 'Tree Spirit', ...BM],
    weapons: armi(['hw']), slot: 'Core' }),
  /* p. 133: Tree Kin 51, hardwood flesh (armatura pesante); Elder +7 */
  treeKin: ({ n = 3, c = '' } = {}) => we({
    name: 'Tree Kin', models: n, ...BASE(50), frontage: n, us: 3 * n,
    pts: 51 * n + (c.includes('c') ? 7 : 0), troop: 'Monstrous infantry', unitSize: '2+',
    stats: st('5 4 4 4 5 3 3 3 8'), armour: 5, regen: 5, command: cmd(c.includes('c') ? 'c' : ''),
    rules: ['Armour Bane (2)', 'Close Order', 'Fear', 'Flammable', 'Immune to Psychology', 'Magical Attacks', 'Move through Cover',
            'Regeneration (5+)', 'Stomp Attacks (1)', 'Stubborn', 'Tree Spirit', 'Tree Whack'],
    weapons: armi(['hw']), slot: 'Special' }),
  /* p. 134: Glade Rider 18, lance da cavalleria e archi Asrai; frecce a
     modello; Glade Knight, stendardo, musico +6. Il Movimento e' del
     destriero (dati/profili.json) */
  gladeRiders: ({ n = 5, c = '', frecce = null } = {}) => we({
    name: 'Glade Riders', models: n, ...BASE(30, 60), frontage: Math.min(n, 5), us: 2 * n,
    pts: n * (18 + (frecce ? COSTO_FRECCE[frecce] : 0)) + 6 * c.length, troop: 'Light cavalry', unitSize: '5+',
    stats: st('9 4 4 3 3 1 4 1 8'), armour: 0, command: cmd(c),
    rules: ['Elven Reflexes', 'Fast Cavalry', 'Fire & Flee', 'Open Order', 'Skirmishers', 'Swiftstride'],
    weapons: armi(['cavspear', 'hw', arco(frecce)]), slot: 'Core' }),
  /* p. 135: Sister of the Thorn 24, giavellotti di rovo nero;
     Handmaiden +8, stendardo, musico +6 */
  sisters: ({ n = 5, c = '' } = {}) => we({
    name: 'Sisters of the Thorn', models: n, ...BASE(30, 60), frontage: Math.min(n, 5), us: 2 * n,
    pts: 24 * n + costoComando(c, { c: 8, s: 6, m: 6 }), troop: 'Light cavalry', unitSize: '5+',
    stats: st('8 4 5 3 3 1 4 1 9'), armour: 0, command: cmd(c),
    rules: ['Daughters of Eternity', 'Deepwood Coven', 'Elven Reflexes', 'Fast Cavalry', 'Fire & Flee', 'Move through Cover',
            'Open Order', 'Poisoned Attacks', 'Swiftstride'],
    weapons: armi(['hw', 'blackbriar']), slot: 'Special' }),
  /* p. 136: Wild Rider 27, lance da caccia e armatura leggera; scudi +1;
     Wild Hunter, stendardo, musico +7. La Furious Charge e' dei soli
     cavalieri: la riga del destriero non la porta. */
  wildRiders: ({ n = 5, c = '', shields = false } = {}) => we({
    name: 'Wild Riders', models: n, ...BASE(30, 60), frontage: Math.min(n, 5), us: 2 * n,
    pts: n * (27 + (shields ? 1 : 0)) + 7 * c.length, troop: 'Light cavalry', unitSize: '5+',
    stats: st('9 5 4 4 3 1 5 1 9'), armour: armatura('light', { shield: shields }), shield: shields, command: cmd(c),
    rules: ['Counter Charge', 'Elven Reflexes', 'Fast Cavalry', 'Fear', 'Frenzy', 'Furious Charge', 'Move through Cover',
            'Open Order', 'Swiftstride', 'Talismanic Tattoos'],
    weapons: armi(['huntingSpear', 'hw']), slot: 'Special' }),
  /* p. 137: Warhawk Rider 44, lance da cavalleria e archi Asrai; Wind
     Rider +8. Volano (Fly (10)). */
  warhawks: ({ n = 3, frecce = null } = {}) => we({
    name: 'Warhawk Riders', models: n, ...BASE(50), frontage: n, loose: true, us: 3 * n,
    pts: n * (44 + (frecce ? COSTO_FRECCE[frecce] : 0)), troop: 'Monstrous cavalry', unitSize: '3+',
    stats: st('2 4 4 3 4 2 4 1 8'), armour: 0,
    rules: ['Elven Reflexes', 'Evasive', 'Fear', 'Feigned Flight', 'Fire & Flee', 'Fly (10)', 'Skirmishers', 'Swiftstride'],
    weapons: armi(['cavspear', 'hw', arco(frecce)]), slot: 'Special' }),
  /* p. 140: Treeman 215 */
  treeman: () => we({
    name: 'Treeman', models: 1, ...BASE(50, 75), frontage: 1, us: 0, pts: 215, troop: 'Behemoth', unitSize: '1',
    stats: st('5 6 4 5 6 5 2 5 9'), armour: 4, regen: 5,
    rules: ['Armour Bane (1)', 'Close Order', 'Flammable', 'Immune to Psychology', 'Large Target', 'Magical Attacks', 'Move through Cover',
            'Regeneration (5+)', 'Stomp Attacks (D3)', 'Stubborn', 'Terror', 'Timmm-berrr!', 'Tree Spirit', 'Tree Whack'],
    weapons: armi(['oaken', 'roots']), slot: 'Rare' }),
  /* p. 139: Great Eagle 60 */
  eagle: () => we({
    name: 'Great Eagle', models: 1, ...BASE(50), frontage: 1, us: 0, pts: 60, troop: 'Monstrous creature', unitSize: '1',
    stats: st('2 5 0 4 4 3 4 3 6'), armour: 0,
    rules: ['Close Order', 'Fear', 'Fly (10)', 'Stomp Attacks (1)', 'Swiftstride'],
    weapons: armi(['wickedClaws']), slot: 'Rare' }),
};

/* ================= NANI (Forces of Fantasy) ================= */
const NANI = 'Dwarfen Mountain Holds';
const dw = scritta(NANI);
const DAWI = ['Hatred (Orcs & Goblins)', 'Resolute'];
export const DW = {
  /* p. 12: King 125, Thane 60, armatura a piastre; arma grande +4,
     scudo +2; stendardo da battaglia +25 (p. 11) */
  capo: ({ king = true, great = true, shield = false, bsb = false } = {}) => {
    const scudo = shield && !great;
    return dw(pg({
      name: king ? 'King' : 'Thane', ...BASE(25),
      pts: (king ? 125 : 60) + (great ? 4 : 0) + (scudo ? 2 : 0) + (bsb ? 25 : 0),
      troop: 'Heavy infantry (character)', stats: st(king ? '3 7 4 4 5 3 4 4 10' : '3 6 4 4 5 2 3 3 9'),
      armour: armatura('plate', { shield: scudo }), shield: scudo || undefined,
      rules: ['Ancestral Grudge', 'Dwarf Crafted', 'Gromril Armour', 'Gromril Weapons', 'Magic Resistance (-1)', 'Rallying Cry',
              'Stubborn', ...DAWI, ...(bsb ? ['Battle Standard Bearer'] : [])],
      weapons: armi([...(great ? ['great'] : []), 'hw']) }));
  },
  /* p. 16: Runelord 120, Runesmith 65, armatura pesante; arma grande +4,
     scudo +2, armatura a piastre +3 */
  runico: ({ lord = false, great = false, shield = true, plate = false } = {}) => {
    const scudo = shield && !great;
    return dw(pg({
      name: lord ? 'Runelord' : 'Runesmith', ...BASE(25),
      pts: (lord ? 120 : 65) + (great ? 4 : 0) + (scudo ? 2 : 0) + (plate ? 3 : 0),
      troop: 'Heavy infantry (character)', stats: st(lord ? '3 6 4 4 5 3 3 3 9' : '3 5 4 4 4 2 2 2 9'),
      armour: armatura(plate ? 'plate' : 'heavy', { shield: scudo }), shield: scudo || undefined,
      rules: ['Armour Bane (1)', 'Forgefire', 'Gromril Armour', 'Gromril Weapons', 'Magic Resistance (-2)', 'Rune Lore', 'Stubborn', ...DAWI],
      weapons: armi([...(great ? ['great'] : []), 'hw']) }));
  },
  /* p. 17: Daemon Slayer 130, Dragon Slayer 70; arma grande +4 */
  slayerEroe: ({ daemon = false, great = true } = {}) => dw(pg({
    name: daemon ? 'Daemon Slayer' : 'Dragon Slayer', ...BASE(25),
    pts: (daemon ? 130 : 70) + (great ? 4 : 0),
    troop: 'Heavy infantry (character)', stats: st(daemon ? '3 7 3 4 5 3 5 4 10' : '3 6 3 4 5 2 4 3 10'), armour: 0,
    rules: ['Deathblow', 'Gromril Weapons', 'Immune to Psychology', 'Killing Blow', 'Loner', 'Magic Resistance (-2)',
            daemon ? 'Slayer of Daemons' : 'Slayer of Dragons', 'Unbreakable', 'Vanguard', ...DAWI],
    weapons: armi([...(great ? ['great'] : []), 'hw']) })),
  /* p. 19: Dwarf Warrior 8, armatura pesante; armi grandi +1, scudi +1;
     Veteran, stendardo, musico +5 */
  warriors: ({ n = 20, c = '', arma = 'shields', f = null } = {}) => dw({
    name: 'Dwarf Warriors', models: n, ...BASE(25), frontage: f || fronte(n),
    pts: n * (8 + (arma ? 1 : 0)) + 5 * c.length, us: n, troop: 'Heavy infantry', unitSize: '5+',
    stats: st('3 4 3 3 4 1 2 1 9'), armour: armatura('heavy', { shield: arma === 'shields' }), shield: arma === 'shields',
    command: cmd(c), rules: ['Close Order', 'Magic Resistance (-1)', 'Shieldwall', ...DAWI, ...BM],
    weapons: armi([...(arma === 'great' ? ['great'] : []), 'hw']), slot: 'Core' }),
  /* p. 20: Longbeard 12, armatura pesante; armi grandi +1, scudi +1;
     Elder, stendardo, musico +6 */
  longbeards: ({ n = 15, c = '', arma = 'shields', f = null } = {}) => dw({
    name: 'Longbeards', models: n, ...BASE(25), frontage: f || fronte(n),
    pts: n * (12 + (arma ? 1 : 0)) + 6 * c.length, us: n, troop: 'Heavy infantry', unitSize: '5+',
    stats: st('3 5 3 4 4 1 2 1 9'), armour: armatura('heavy', { shield: arma === 'shields' }), shield: arma === 'shields',
    command: cmd(c), rules: ['Close Order', 'Gromril Weapons', 'Magic Resistance (-1)', 'Shieldwall', 'Venerable', 'Veteran', ...DAWI, ...BM],
    weapons: armi([...(arma === 'great' ? ['great'] : []), 'hw']), slot: 'Special' }),
  /* p. 21: Quarreller 9, Thunderer 10, armatura pesante; scudi +1;
     Veteran, stendardo, musico +5 */
  tiratori: ({ n = 10, c = '', gun = false, shields = false, f = null } = {}) => dw({
    name: gun ? 'Thunderers' : 'Quarrellers', models: n, ...BASE(25), frontage: f || fronte(n),
    pts: n * ((gun ? 10 : 9) + (shields ? 1 : 0)) + 5 * c.length, us: n, troop: 'Heavy infantry', unitSize: '5+',
    stats: st('3 3 3 3 4 1 2 1 9'), armour: armatura('heavy', { shield: shields }), shield: shields, command: cmd(c),
    rules: ['Close Order', 'Dwarf Crafted', 'Magic Resistance (-1)', ...DAWI, ...BM],
    weapons: armi(['hw', gun ? 'handgun' : 'crossbow']), slot: 'Core' }),
  /* p. 23: Hammerer 16, martelli e armatura pesante; Royal Champion,
     stendardo, musico +7 */
  hammerers: ({ n = 15, c = '', f = null } = {}) => dw({
    name: 'Hammerers', models: n, ...BASE(25), frontage: f || fronte(n),
    pts: 16 * n + 7 * c.length, us: n, troop: 'Heavy infantry', unitSize: '5+',
    stats: st('3 5 3 4 4 1 3 1 9'), armour: 5, shield: false, command: cmd(c),
    rules: ['Close Order', 'Gromril Weapons', 'Magic Resistance (-1)', 'Royal Guard', 'Shieldwall', 'Stoic Defenders', 'Stubborn', ...DAWI, ...BM],
    weapons: armi(['hammers', 'hw']), slot: 'Special' }),
  /* p. 24: Ironbreaker 15, armatura a piastre e scudi; Ironbeard,
     stendardo, musico +7 */
  ironbreakers: ({ n = 15, c = '', f = null } = {}) => dw({
    name: 'Ironbreakers', models: n, ...BASE(25), frontage: f || fronte(n),
    pts: 15 * n + 7 * c.length, us: n, troop: 'Heavy infantry', unitSize: '5+',
    stats: st('3 5 3 4 4 1 2 1 9'), armour: armatura('plate', { shield: true }), shield: true, command: cmd(c),
    rules: ['Close Order', 'Gromril Armour', 'Gromril Weapons', 'Magic Resistance (-1)', 'Regimental Unit', 'Runes of Protection',
            'Shieldwall', 'Stubborn', ...DAWI, ...BM],
    weapons: armi(['hw']), slot: 'Special' }),
  /* p. 25: Irondrake 15, drakegun e armatura a piastre; Ironwarden,
     stendardo, musico +6 */
  irondrakes: ({ n = 10, c = '', f = null } = {}) => dw({
    name: 'Irondrakes', models: n, ...BASE(25), frontage: f || fronte(n),
    pts: 15 * n + 6 * c.length, us: n, troop: 'Heavy infantry', unitSize: '5+',
    stats: st('3 4 4 4 4 1 2 1 9'), armour: 4, shield: false, command: cmd(c),
    rules: ['Close Order', 'Detachment', 'Gromril Armour', 'Magic Resistance (-1)', 'Runes of Warding', 'Stubborn', ...DAWI, ...BM],
    weapons: armi(['hw', 'drakegun']), slot: 'Rare' }),
  /* p. 26: Miner 12, armi grandi e armatura pesante; Prospector,
     stendardo, musico +6 */
  miners: ({ n = 10, c = '', f = null } = {}) => dw({
    name: 'Miners', models: n, ...BASE(25), frontage: f || fronte(n),
    pts: 12 * n + 6 * c.length, us: n, troop: 'Heavy infantry', unitSize: '5+',
    stats: st('3 4 3 3 4 1 2 1 9'), armour: 5, shield: false, command: cmd(c),
    rules: ['Ambushers', 'Close Order', 'Magic Resistance (-1)', 'Vanguard', ...DAWI, ...BM],
    weapons: armi(['great', 'hw']), slot: 'Special' }),
  /* p. 27: Troll Slayer 12; arma grande +2 a modello; stendardo,
     musico +6. Senza campione: i Giant Slayers non si comprano. */
  slayers: ({ n = 10, c = '', great = true, f = null } = {}) => dw({
    name: 'Slayers', models: n, ...BASE(25), frontage: f || fronte(n),
    pts: n * (12 + (great ? 2 : 0)) + 6 * c.replace('c', '').length, us: n, troop: 'Regular infantry', unitSize: '5+',
    stats: st('3 4 3 3 4 1 2 1 10'), armour: 0, command: cmd(c.replace('c', '')),
    rules: ['Deathblow', 'Immune to Psychology', 'Loner', 'Magic Resistance (-2)', 'Motley Crew', 'Open Order', 'Slayer',
            'Unbreakable', ...DAWI, ...BM],
    weapons: armi([...(great ? ['great'] : []), 'hw']), slot: 'Special' }),
  /* p. 28: Gyrocopter 60, armatura a piastre (la fusoliera); il
     cannone a vapore e' un soffio, e l'app non lo tira: qui il
     cannone di zolfo (+5) o la clattergun (+10) */
  gyro: ({ n = 1, gun = 'brimstone' } = {}) => dw({
    name: 'Gyrocopters', models: n, ...BASE(50), frontage: n, loose: true, us: 3 * n,
    pts: n * (60 + (gun === 'clattergun' ? 10 : 5)), troop: 'Monstrous cavalry', unitSize: '1-6',
    stats: st('1 4 3 4 5 3 2 2 9'), armour: 4,
    rules: ['Dive Bomb', 'Fire & Flee', 'Fly (9)', 'Impact Hits (D3)', 'Skirmishers', 'Swiftstride', 'Vanguard'],
    weapons: armi(['hw', gun]), slot: 'Special' }),
  /* p. 30: Grudge Thrower 95, un lanciapietre (Core p. 224). La riga dei
     serventi sta in dati/profili.json, come quella del Warp Lightning
     Cannon. */
  grudge: () => dw({
    name: 'Grudge Thrower', models: 1, crew: 1, ...BASE(50, 75), frontage: 1, loose: true,
    pts: 95, us: 0, troop: 'War machine', unitSize: '1', stats: st('- - - - 7 3 - - -'), armour: 6,
    profiles: [{ name: 'Grudge Thrower', stats: st('- - - - 7 3 - - -') }, { name: 'Dwarf Crew', stats: st('3 3 3 3 4 3 2 3 9') }],
    rules: ['Hatred (Orcs & Goblins)', 'Magic Resistance (-1)', 'Skirmishers', 'Stubborn'],
    weapons: armi(['stone', 'hw']), slot: 'Special' }),
};

/* Una candidata diventa una lista dell'archivio. `id` lo sceglie chi
   chiama: `cand-…` per le prove, uno nuovo per quella che resta. */
export function lista(c, id){
  const units = c.units;
  return {
    id, name: c.name || id,
    info: { catalogue: c.cat, forceName: 'Battle March', limit: c.limit || 800 },
    points: units.reduce((s, u) => s + u.pts, 0),
    external: false, imported: new Date().toISOString(), units,
    prep: { general: 0, bsb: null, units: {}, ...(c.prep || {}), note: c.note || '' },
    formerNames: [],
  };
}

/* Le percentuali della Grand Army (Core almeno 25%, Personaggi e
   Speciali fino al 50%, Rare fino al 25%), sul limite o sui punti se
   sono di più. Non è il controllo di New Recruit — i limiti 0-1 e le
   regole come Da Boyz restano da guardare — ma prende gli errori
   grossi. */
export function avvisiComposizione(l){
  const units = l.units || [];
  const di = s => units.filter(u => String(u.slot || '').includes(s)).reduce((a, u) => a + u.pts, 0);
  const lim = Math.max(l.points, (l.info || {}).limit || 0);
  const out = [];
  if (di('Characters') > lim * 0.5) out.push(`personaggi ${di('Characters')}`);
  if (di('Core') < l.points * 0.25) out.push(`truppe base solo ${di('Core')}`);
  if (di('Special') > lim * 0.5) out.push(`speciali ${di('Special')}`);
  if (di('Rare') > lim * 0.25) out.push(`rare ${di('Rare')}`);
  return out;
}
