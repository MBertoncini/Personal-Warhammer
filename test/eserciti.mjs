/* I tre eserciti scritti dal libro: Uomini Bestia (Ravening Hordes),
 * Elfi Silvani e Nani (Forces of Fantasy).
 *
 * Nessuna lista salvata li schiera: le unità le costruisce
 * src/costruttori.js con i costi stampati, le regole d'esercito stanno
 * in dati/eserciti/, e la ricerca delle liste le pesca da src/spazio.js.
 * Qui si guarda che i costi siano quelli del libro, che le regole che
 * l'app dice di applicare arrivino davvero ai dadi, e che una partita
 * con ognuno dei tre finisca con le regole nuove nel registro.
 *
 * Si lancia con:  node test/eserciti.mjs
 */
import fs from 'node:fs';
import * as C from '../src/combat.js';
import * as RB from '../src/rulebook.js';
import * as ARM from '../src/armies.js';
import * as PR from '../src/profiles.js';
import * as MG from '../src/magic.js';
import * as FM from '../src/formation.js';
import * as SH from '../src/shoot.js';
import * as AR from '../src/arbitro.js';
import * as AG from '../src/agente.js';
import * as D from '../src/dice.js';
import { BH, WE, DW } from '../tools/liste/unita.mjs';
import { spazio } from '../tools/liste/spazio.mjs';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};

const dati = f => JSON.parse(fs.readFileSync(new URL('../dati/' + f, import.meta.url), 'utf8'));
PR.useProfiles(dati('profili.json'));
ARM.useArmies(ARM.makeArmies(dati('eserciti/indice.json').file.map(f => dati('eserciti/' + f))));
MG.useMagic(MG.makeMagic(dati('magia/domini.json')));
const esercito = n => ARM.armiesNow().find(n);
const regola = (n, id) => esercito(n).rules.find(r => r.id === id);
const senza = (u, re) => ({ ...u, rules: u.rules.filter(r => !re.test(r)) });

/* ================================================================= */
console.log('i costi del libro');
ok('un Beastlord con arma grande e armatura pesante: 115 + 4 + 4 (Ravening Hordes p. 92)', BH.capo().pts === 123);
ok('venti Gor con il comando: 7 a testa, 7 + 5 + 5 il comando (p. 97)', BH.gors({ n: 20, c: 'csm' }).pts === 157);
ok('dieci Glade Guard con le Hagbane e stendardo e musico: 13 a testa e 12 (Forces of Fantasy p. 128)',
   WE.gladeGuard({ n: 10, frecce: 'hagbane', c: 'sm' }).pts === 142);
ok('venti Dwarf Warriors con scudi e comando: 9 a testa e 15 (p. 19)',
   DW.warriors({ n: 20, c: 'csm', arma: 'shields' }).pts === 195);
ok('e l armatura pesante con lo scudo fa 4+', DW.warriors({ n: 20, arma: 'shields' }).armour === 4);
ok('lo scudo con l arma grande non si compra e non si paga',
   WE.capo({ great: true, shield: true }).pts === 139 && !WE.capo({ great: true, shield: true }).shield);
ok('la pelle dei Dragon Ogre migliora l armatura di due: leggera 4+, pesante 3+',
   BH.dragonOgres().armour === 4 && BH.dragonOgres({ heavy: true }).armour === 3);
ok('il Grudge Thrower spara a bombardata con la sagoma piccola del lanciapietre (Core p. 224)',
   (b => b && b.known && b.template === 'small')(SH.bombardOf(DW.grudge().weapons[0])));
ok('il Cannon costa 100 punti, e spara la palla di Core p. 226 (Forces of Fantasy p. 31)',
   DW.cannon().pts === 100 && (c => c && c.banda.max === 48)(SH.cannonOf(DW.cannon().weapons[0])));
ok('e la sua palla e Forza 8 con Armour Bane (2) e Multiple Wounds (D3)',
   (w => w.S === '8' && /Armour Bane \(2\)/.test(w.rules) && /Multiple Wounds \(D3\)/.test(w.rules))(DW.cannon().weapons[0]));

/* ================================================================= */
console.log('\nl Odio vale contro chi la parentesi nomina (p. 171)');
const ng = { hatred: true, hatredOf: ['Dwarfs'] };
ok('gli odiati dei Night Goblin sono i Nani', RB.odia(ng, { ref: { faction: 'Dwarfen Mountain Holds' } }));
ok('e le Lucertole no', !RB.odia(ng, { ref: { faction: 'Lizardmen' } }));
ok('«Orcs & Goblins» trova il catalogo «Orc and Goblin Tribes»',
   RB.odia(C.combatant(DW.warriors()).flags, { ref: { faction: 'Orc and Goblin Tribes' } }));
const re = C.combatant(DW.capo()).flags;
ok('il Rancore Ancestrale del King odia i personaggi nemici (Forces of Fantasy p. 12)',
   RB.odia(re, { attached: true, ref: { faction: 'Skaven', troop: 'Regular infantry (character)' } }));
ok('e non un reggimento qualunque', !RB.odia(re, { ref: { faction: 'Skaven', troop: 'Regular infantry' } }));
ok('senza parentesi si odia chiunque', RB.odia(RB.readRules(['Hatred']).flags, { ref: { faction: 'Skaven' } }));

/* ================================================================= */
console.log('\nle regole d esercito, nei dadi della mischia');
const bestigor = C.combatant(BH.bestigors({ n: 20 }));
ok('l armatura di gromril ritira gli 1: gli Ironbreakers incassano meno ferite',
   C.meleeForecast(bestigor, C.combatant(DW.ironbreakers({ n: 20 }))).wounds <
   C.meleeForecast(bestigor, C.combatant(senza(DW.ironbreakers({ n: 20 }), /^gromril armour/i))).wounds);
ok('le armi di gromril perforano di 1 con l arma a una mano: i Longbeards si, i Warriors no',
   C.combatant(DW.longbeards()).ap === 1 && C.combatant(DW.warriors()).ap === 0);
ok('lo Slayer ferisce a 4+ anche il Treeman di Resistenza 6 (p. 27)',
   C.meleeForecast(C.combatant(DW.slayers({ great: false })), C.combatant(WE.treeman())).woundNeed === 4);
const nemici = C.combatant({ name: 'Nemici', stats: { M: '5', WS: '4', BS: '3', S: '3', T: '3', W: '1', I: '5', A: '1', Ld: '7' },
  models: 10, frontage: 5, us: 10, weapons: [], rules: [], lost: 0 });
const r1 = C.meleeFight(C.combatant(WE.eternalGuard({ n: 10 })), nemici, { round: 1 });
const r2 = C.meleeFight(C.combatant(WE.eternalGuard({ n: 10 })), nemici, { round: 2 });
ok('gli Elven Reflexes: al primo round l Eternal Guard di Iniziativa 4 mena insieme a chi ne ha 5 (p. 145)',
   r1.order.steps[0].together === true && r1.order.steps[0].i === 5);
ok('e dal secondo mena dopo', r2.order.steps.length === 2 && r2.order.steps[0].at.length === 1 && r2.order.steps[1].i === 4);
ok('e il primo round lo dice l arbitro unità per unità (`primoRound`)',
   C.meleeFight(C.combatant(WE.eternalGuard({ n: 10 }), { primoRound: false }), nemici, { round: 1 }).order.steps.length === 2);
ok('gli Stoic Defenders: caricati, +1 Iniziativa e +1 Attacchi (p. 23)',
   (h => h.i === 4 && h.a === 2)(C.combatant(DW.hammerers(), { caricata: true })) &&
   (h => h.i === 3 && h.a === 1)(C.combatant(DW.hammerers())));
ok('Bull-gors: l urto dei Minotauri perfora di 1 (Ravening Hordes p. 115)', C.combatant(BH.minotaurs()).flags.impactAP === 1);
const zanne = regola('Beastmen Brayherds', 'razorTusks');
ok('la Razor Tusks perfora di 1 in carica con le zanne (p. 116)',
   ARM.meleeBoosts([zanne], { charged: true, weapon: 'Tusks (counts as a hand weapon)' }).ap === 1);
ok('e non con l arma grande dell equipaggio, ne fuori dalla carica',
   ARM.meleeBoosts([zanne], { charged: true, weapon: 'Great weapon' }).ap === 0 &&
   ARM.meleeBoosts([zanne], { charged: false, weapon: 'Tusks (counts as a hand weapon)' }).ap === 0);
const razorgor = c => C.mountStrikers(c).find(m => /^Razorgor/.test(m.mountRow));
ok('con la Primal Fury le zanne del Razorgor che tira il carro perforano di 2 (Foe Render «Razorgor only», p. 103)',
   razorgor(C.combatant(BH.carro({ razorgor: true }), { primalFury: true })).ap === 2 &&
   razorgor(C.combatant(BH.carro({ razorgor: true }))).ap === 0);
ok('la Bestial Charge da +1 Forza in carica (p. 97)',
   ARM.meleeBoosts([regola('Beastmen Brayherds', 'bestialCharge')], { charged: true }).s === 1);
ok('Blood Greed: il Ghorgon frenetico che carica ha +2 Attacchi e non +1 (p. 115)',
   C.combatant(BH.ghorgon(), { charged: true }).frenzyA === 2);
ok('i Talismanic Tattoos danno 6+, le Daughters of Eternity 4+, le Runes of Protection 6+',
   C.combatant(WE.wildRiders()).ward === 6 && C.combatant(WE.sisters()).ward === 4 && C.combatant(DW.ironbreakers()).ward === 6);
ok('la lancia da caccia dei Wild Riders si usa solo caricando (p. 136, e Core p. 215)',
   C.combatant(WE.wildRiders()).weapon === 'Hand Weapon' && C.combatant(WE.wildRiders(), { charged: true }).weapon === 'Hunting spear');
ok('Resolute: −1 alla fuga e all inseguimento (Forces of Fantasy p. 39)',
   C.fleeBonusOf(DW.warriors()).mod === -1 && C.pursuitBonusOf(DW.warriors()).mod === -1 &&
   C.pursuitBonusOf(BH.gors()).mod === 0);
ok('le regole che l app non applica dicono tutte perche, nei tre file',
   ['Beastmen Brayherds', 'Wood Elf Realms', 'Dwarfen Mountain Holds'].every(n =>
     ARM.coverage(esercito(n)).manual.every(m => m.why && m.page)));

/* ================================================================= */
console.log('\nchi si unisce a chi');
ok('un Glade Captain non entra fra le Dryads (Tree Spirit, p. 145)', !FM.clumsyOk(WE.capo({ lord: false }), WE.dryads()));
ok('una Branchwraith si', FM.clumsyOk(WE.branchwraith(), WE.dryads()));
ok('e la Branchwraith non entra fra le Glade Guard', !FM.clumsyOk(WE.branchwraith(), WE.gladeGuard()));
ok('il Glade Lord fra le Glade Guard si', FM.clumsyOk(WE.capo(), WE.gladeGuard()));

/* ================================================================= */
console.log('\nla ricerca');
let s0 = 17;
const rnd = () => ((s0 = (s0 * 1103515245 + 12345) >>> 0) / 2 ** 32);
for (const [f, nome] of [['bst', 'Uomini Bestia'], ['we', 'Elfi Silvani'], ['dwf', 'Nani']]){
  const S = spazio(f, { pool: 'tutte', punti: 1000 });
  ok(`${nome}: ogni voce si costruisce`, S.voci.length > 12 && !S.escluse.length);
  const liste = Array.from({ length: 12 }, () => S.casuale(rnd));
  ok(`${nome}: dodici liste a caso, tutte valide e fra 960 e 1000 punti`,
     liste.every(g => g && !S.valida(g).length && S.totale(g) <= 1000 && S.totale(g) >= 960));
  ok(`${nome}: la partenza scritta a mano vale anche lei`, S.partenze.length === 1);
}
const N = spazio('dwf', { pool: 'tutte', punti: 1000 });
const conSlayer = [{ k: 'dragonSlayer', o: { great: true } }, { k: 'thane', o: { weapon: 'great', bsb: false } },
                   { k: 'warriors', n: 30, o: { c: 'csm', arma: 'shields', f: 6 } }, { k: 'thunderers', n: 20, o: { c: 'csm', shields: false, f: 5 } },
                   { k: 'hammerers', n: 16, o: { c: 'csm', f: 4 } }, { k: 'grudge', o: {} }];
const l = N.costruisci(conSlayer);
ok('lo Slayer (Comando 10) non e il generale: e Loner (p. 172), e lo e il Thane',
   l.units[l.prep.general].name === 'Thane');
ok('e senza un altro personaggio la lista non ha generale',
   N.valida(conSlayer.filter(g => g.k !== 'thane')).includes('nessun generale'));
const quattro = [...conSlayer.filter(g => g.k !== 'grudge'), { k: 'grudge', o: {} }, { k: 'grudge', o: {} },
                 { k: 'cannon', o: {} }, { k: 'cannon', o: {} }];
ok('Organ Gun 120 e Flame Cannon 125, fra le Rare (Forces of Fantasy p. 31)',
   DW.organ().pts === 120 && DW.flame().pts === 125 && DW.organ().slot === 'Rare' && DW.flame().slot === 'Rare');
ok('l organo e Multi-Barrelled (Core p. 228) e il Flame Cannon spara la colonna di fuoco (p. 229)',
   !!SH.organOf(DW.organ().weapons[0]) && !!SH.flameOf(DW.flame().weapons[0]));
/* il fuoco contro i Troll (p. 169): gli Stone Troll delle liste salvate
   hanno Regeneration (5+) e Flammable, e il drakegun e' infuocato */
{
  const archivio = dati('liste.json');
  const troll = archivio.flatMap(l => l.units).find(u => (u.rules || []).includes('Flammable') && /Troll/.test(u.name));
  const irondrakes = DW.irondrakes({ n: 10 }), balestre = DW.tiratori({ n: 10 });
  const drake = irondrakes.weapons.find(w => /Drakegun/.test(w.name));
  const balestra = balestre.weapons.find(w => /Crossbow/.test(w.name));
  ok('il drakegun toglie la Rigenerazione ai Troll, che sono Flammable',
     !!troll && C.shootForecast(irondrakes, { ...troll, lost: 0 }, { weapon: drake, shots: 10 }).regenNeed >= 7);
  ok('e la balestra no: rigenerano a 5+',
     C.shootForecast(balestre, { ...troll, lost: 0 }, { weapon: balestra, shots: 10 }).regenNeed === 5);
}
/* l'organo tira con l'Abilita' Balistica dell'equipaggio (p. 228): la
   riga della macchina dice «-», e il 3 sta sulla riga dei serventi */
ok('l organo tira con l Abilita Balistica dei serventi, non con il «-» della macchina',
   C.shootForecast({ ...DW.organ(), lost: 0 }, DW.warriors({ n: 20 }), { weapon: DW.organ().weapons[0], shots: 10 }).bs === 3);
{
  const tre = [...conSlayer, { k: 'organ', o: {} }, { k: 'flame', o: {} }, { k: 'organ', o: {} }];
  ok('Organ Gun e Flame Cannon stanno nello stesso 0-2 ogni 1.000 punti (p. 11)',
     N.valida(tre).some(e => /0-2 ogni 1.000/.test(e)) && !N.valida(tre.slice(0, -1)).some(e => /0-2 ogni 1.000/.test(e)));
}
ok('Grudge Thrower e Cannon stanno nello stesso 0-3 ogni 1.000 punti (p. 11)',
   N.valida(quattro).some(e => /0-3 ogni 1.000/.test(e)) &&
   !N.valida(quattro.slice(0, -1)).some(e => /0-3 ogni 1.000/.test(e)));
const B = spazio('bst', { pool: 'tutte', punti: 1000 });
ok('un Beastlord e un Doombull insieme a 1.000 punti no (Ravening Hordes p. 91)',
   B.valida([{ k: 'beastlord', o: { weapon: 'great', armour: 'heavy' } }, { k: 'doombull', o: { great: true, armour: 'heavy' } },
             { k: 'gors', n: 40, o: { c: 'csm', f: 8 } }, { k: 'gors', n: 30, o: { c: 'csm', f: 6 } }])
     .some(e => /Beastlord, Great Bray-Shaman o Doombull/.test(e)));

/* ================================================================= */
console.log('\nin partita');
const archivio = dati('liste.json');
const orchi = archivio.find(x => x.id === 'lmugl4zwpzy5r') || archivio.find(x => (x.info || {}).catalogue === 'Orc and Goblin Tribes');
const gioca = async (lista, contro, seme) => {
  D.setSource(D.seeded(seme));
  const G = AR.newBattle({ A: lista, B: contro, scenario: 'bm-strada', nomi: { A: 'nuovi', B: 'vecchi' } });
  const rifiutate = [], perche = [];
  await AG.giocaPartita(AR, G, { A: AG.agenteEuristico({}), B: AG.agenteEuristico({}),
                                 onPasso: p => { if (p.esito && p.esito.ok === false) rifiutate.push(p); perche.push(p.perche || ''); } });
  return { G, perche, testo: G.log.map(r => r.text).join('\n'), rifiutate };
};
const partenza = f => { const S = spazio(f, { pool: 'tutte', punti: 1000 }); return S.costruisci(S.partenze[0], { id: 'prova-' + f }); };
{
  const { G, testo, rifiutate } = await gioca(partenza('bst'), orchi, 11);
  ok('gli Uomini Bestia giocano una partita fino in fondo', G.finita && !rifiutate.some(p => p.mossa && p.mossa.id !== 'avanti'));
  ok('e quando il combattimento viene scelto tirano la Primal Fury', /test di Primal Fury/.test(testo));
}
{
  const { G, testo, rifiutate, perche } = await gioca(partenza('we'), orchi, 11);
  ok('gli Elfi Silvani pure', G.finita && !rifiutate.some(p => p.mossa && p.mossa.id !== 'avanti'));
  ok('e chi ha il nemico a tiro resta fermo, per non tirare con −1 e senza le file dietro (pp. 138, 180)',
     perche.some(x => /Glade Guard[^]*resta dov'è: ha Asrai longbow a tiro[^]*Volley Fire/.test(x)));
  ok('e le Glade Guard tirano con il Volley Fire (p. 180)', /Glade Guard[^\n]*Volley Fire/.test(testo));
}
{
  const { G, testo, rifiutate } = await gioca(partenza('dwf'), orchi, 11);
  ok('e i Nani pure', G.finita && !rifiutate.some(p => p.mossa && p.mossa.id !== 'avanti'));
  /* il numero dopo il nome c'e' quando le macchine sono due: la partenza
     si completa pescando fra le voci, e con il Cannon in elenco ne pesca
     un'altra */
  ok('e il Grudge Thrower bombarda', /Grudge Thrower( \d+)? bombarda/.test(testo));
  /* il diario rifatto dal registro (src/archivio.js) legge anche le
     righe della sagoma: «Grudge Thrower su Orc Mobs: 7 colpi di sagoma,
     … 5 a terra» */
  const ARCH = await import('../src/archivio.js'), BL = await import('../src/battlelog.js');
  const liste = { A: partenza('dwf'), B: orchi };
  const righe = G.log.map(r => `T${r.turno} ${r.text}${r.page ? ` (p. ${r.page})` : ''}`).join('\n');
  const G2 = AR.newBattle({ A: liste.A, B: liste.B, scenario: 'bm-strada', nomi: G.nomi });
  const rifatta = ARCH.dalRegistro({ S: G2, liste, nomi: G.nomi, sc: G.sc, testo: righe });
  const vere = Object.fromEntries(G.units.map(u => [u.uid, u]));
  const storte = BL.finalUnits(rifatta.rep).filter(f => { const u = vere[f.uid]; return u && !u.dead && f.alive !== u.models - (u.lost || 0); });
  ok('e il diario rifatto dal registro conta anche i caduti sotto la sagoma',
     /colpi di sagoma, [^\n]*[1-9]\d* a terra/.test(testo) && !rifatta.guasti.length && !storte.length);
}
/* il Cannon in partita: la stessa partenza con un cannone al posto dei
   Grudge Thrower. Nessuna lista salvata ne ha uno, e senza questa prova
   l'euristica potrebbe lasciarlo fermo con la sua opzione in elenco,
   come succedeva alle macchine prima del gesto «bombarda» */
{
  const S = spazio('dwf', { pool: 'tutte', punti: 1000 });
  const geni = [...S.partenze[0].filter(g => g.k !== 'grudge'), { k: 'cannon', o: {} }];
  const lista = S.costruisci(geni, { id: 'prova-cannone' });
  const { G, testo, rifiutate } = await gioca(lista, orchi, 11);
  ok('i Nani con il Cannon finiscono la partita', G.finita && !rifiutate.some(p => p.mossa && p.mossa.id !== 'avanti'));
  ok('e il Cannon spara la palla: cade, rimbalza, e il registro lo scrive',
     /Cannon( \d+)? spara: cade a \d+″/.test(testo));
  const ARCH = await import('../src/archivio.js'), BL = await import('../src/battlelog.js');
  const liste = { A: lista, B: orchi };
  const righe = G.log.map(r => `T${r.turno} ${r.text}${r.page ? ` (p. ${r.page})` : ''}`).join('\n');
  const G2 = AR.newBattle({ A: liste.A, B: liste.B, scenario: 'bm-strada', nomi: G.nomi });
  const rifatta = ARCH.dalRegistro({ S: G2, liste, nomi: G.nomi, sc: G.sc, testo: righe });
  const vere = Object.fromEntries(G.units.map(u => [u.uid, u]));
  const storte = BL.finalUnits(rifatta.rep).filter(f => { const u = vere[f.uid]; return u && !u.dead && f.alive !== u.models - (u.lost || 0); });
  ok('e il diario rifatto dal registro conta i caduti sotto la palla', !rifatta.guasti.length && !storte.length);
}
/* l'organo e il lanciafiamme in partita, al posto dei Grudge Thrower */
{
  const S = spazio('dwf', { pool: 'tutte', punti: 1000 });
  const geni = [...S.partenze[0].filter(g => g.k !== 'grudge'), { k: 'organ', o: {} }, { k: 'flame', o: {} }];
  const lista = S.costruisci(geni, { id: 'prova-organo' });
  const { G, testo, rifiutate } = await gioca(lista, orchi, 11);
  ok('i Nani con l organo e il lanciafiamme finiscono la partita', G.finita && !rifiutate.some(p => p.mossa && p.mossa.id !== 'avanti'));
  ok('e l organo spara i suoi due dadi di artiglieria, e colpisce con l Abilita Balistica dei serventi',
     /Organ Gun( \d+)?: l'organo tira due dadi di artiglieria/.test(testo) && /tira su [^\n]*con Organ gun[^\n]*tiri a [2-6]\+/.test(testo));
  ok('e il lanciafiamme posa la goccia', /Flame Cannon posa la goccia/.test(testo));
  const ARCH = await import('../src/archivio.js'), BL = await import('../src/battlelog.js');
  const liste = { A: lista, B: orchi };
  const righe = G.log.map(r => `T${r.turno} ${r.text}${r.page ? ` (p. ${r.page})` : ''}`).join('\n');
  const G2 = AR.newBattle({ A: liste.A, B: liste.B, scenario: 'bm-strada', nomi: G.nomi });
  const rifatta = ARCH.dalRegistro({ S: G2, liste, nomi: G.nomi, sc: G.sc, testo: righe });
  const vere = Object.fromEntries(G.units.map(u => [u.uid, u]));
  const storte = BL.finalUnits(rifatta.rep).filter(f => { const u = vere[f.uid]; return u && !u.dead && f.alive !== u.models - (u.lost || 0); });
  ok('e il diario rifatto dal registro conta i caduti dell organo e del fuoco', !rifatta.guasti.length && !storte.length);
}

/* ================================================================= */
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
