/* Schieramento Old World — le unità scritte a mano, per provare liste
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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const qui = path.dirname(fileURLToPath(import.meta.url));
const archivio = JSON.parse(fs.readFileSync(path.join(qui, '..', '..', 'dati', 'liste.json'), 'utf8'));

/* i testi delle regole, presi da tutte le liste importate */
const TESTI = {};
for (const l of archivio) for (const u of l.units || []) for (const [k, v] of Object.entries(u.ruleText || {})) TESTI[k] ||= v;
/* il modello di ogni unità: fra le omonime quella con più regole, e a
   parità quella con le regole di Battle March (le importazioni vecchie
   non le portavano) */
const MODELLI = {};
const peso = u => (u.rules || []).length * 10 + ((u.rules || []).includes('Parry') ? 5 : 0);
for (const l of archivio) for (const u of l.units || [])
  if (!MODELLI[u.name] || peso(u) > peso(MODELLI[u.name])) MODELLI[u.name] = u;

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
};
const armi = l => l.map(w => typeof w === 'string' ? ARMI[w] : w);
const gittata = ws => Math.max(0, ...ws.map(w => parseInt(w.range) || 0));

/* ---- dal modello importato: Orchi & Goblin, Lucertole ---- */
function da(nome, o = {}){
  const m = MODELLI[o.modello || nome];
  if (!m) throw new Error(`nell'archivio non c'è nessuna «${o.modello || nome}» da usare come modello`);
  const u = structuredClone(m);
  const n = o.n ?? u.models;
  /* la Forza d'Unità: quella del file per un modello solo (un Behemoth
     ce l'ha a zero e la calcola l'app), in proporzione per i reggimenti */
  const usPer = (u.us || u.models) / (u.models || 1);
  Object.assign(u, { models: n, us: u.models === n ? u.us : Math.round(usPer * n) });
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
export const OG = {
  /* p. 22: 5 pt; Boss +7, stendardo +5, musico +5; lance +1; Frenesia al
     posto dell'armatura leggera +1, Big 'Uns +2, Warpaint +1. Niente scudo. */
  orcs: ({ n = 20, c = '', spears = false, frenzy = false, big = false, paint = false, f } = {}) => da('Orc Mobs', { n, f, c,
    pts: n * (5 + (spears ? 1 : 0) + (frenzy ? 1 : 0) + (big ? 2 : 0) + (paint ? 1 : 0)) + costoComando(c, { c: 7, s: 5, m: 5 }),
    shield: false, weapons: spears ? ['spear', 'hw'] : ['hw'], armour: (frenzy || paint) ? 0 : 6,
    add: [...(frenzy ? ['Frenzy'] : []), ...(big ? ["Big 'Uns"] : []), ...(paint ? ['Warpaint'] : [])] }),
  /* p. 21: 12 pt, armatura a piastre; Boss/stendardo/musico +6; arma grande +2 */
  blackOrcs: ({ n = 10, c = '', great = false, f } = {}) => da('Black Orc Mobs', { n, f, c,
    pts: n * (12 + (great ? 2 : 0)) + costoComando(c, { c: 6, s: 6, m: 6 }), armour: 4, shield: false,
    add: BM, weapons: great ? ['great', 'hw'] : ['hw'] }),
  /* p. 25: 3 pt con scudi, lance +1; Boss +7, stendardo +5, musico +5 */
  nightGoblins: ({ n = 20, c = '', spears = false, f } = {}) => da('Night Goblin Mobs', { n, f, c,
    pts: n * (3 + (spears ? 1 : 0)) + costoComando(c, { c: 7, s: 5, m: 5 }),
    armour: 6, shield: true, add: BM, weapons: spears ? ['spear', 'hw'] : ['hw'],
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
  /* p. 13: Bigboss 55; stendardo da battaglia +25 (p. 11) */
  bigboss: ({ great = false, heavy = true, bsb = false } = {}) => da('Orc Bigboss', { modello: 'Orc Warboss',
    name: 'Orc Bigboss', stats: '4 5 2 4 5 2 4 3 7',
    pts: 55 + (great ? 4 : 0) + (heavy ? 3 : 0) + (bsb ? 25 : 0), armour: heavy ? 5 : 6, shield: false,
    weapons: great ? ['great', 'hw'] : ['hw'], add: bsb ? ['Battle Standard Bearer'] : [] }),
  /* p. 12: Black Orc Warboss 135, armatura a piastre; arma grande +4. Il
     modello è il Bigboss importato, che era a cavallo: via le regole del
     cinghiale. Da Boyz (p. 45) vuole un reggimento di Orchi Neri. */
  blackWarboss: ({ great = true } = {}) => da('Black Orc Warboss', { modello: 'Black Orc Bigboss',
    stats: '4 7 3 5 5 3 6 4 9', pts: 135 + (great ? 4 : 0), armour: 4, shield: false,
    troop: 'Heavy Infantry (character)',
    weapons: great ? ['great', 'hw'] : ['hw'], del: ['Tusker Charge', 'Armoured Hide', 'Counter Charge', 'Swiftstride'] }),
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
  /* p. 4: Skink Chief 45 */
  chief: () => da('Skink Chief', { pts: 45, weapons: ['hw'], armour: 6 }),
  /* p. 14: Bastiladon 160 */
  bastiladon: () => da('Bastiladon', { pts: 160 }),
  /* p. 10: Terradon Riders 32 */
  terradons: ({ n = 3 } = {}) => da('Terradon Riders', { n, f: Math.min(n, 3), pts: 32 * n }),
  /* p. 10: Cold One Riders 34; campione, stendardo, musico +7 */
  coldOnes: ({ n = 5, c = '' } = {}) => da('Cold One Riders', { n, f: Math.min(n, 5), c, pts: 34 * n + 7 * c.length }),
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
