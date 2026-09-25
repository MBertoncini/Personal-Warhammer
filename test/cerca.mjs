/* Lo spazio della ricerca delle liste (tools/liste/spazio.mjs).
 *
 * La ricerca gioca migliaia di partite; qui non se ne gioca nessuna. Si
 * controlla che le liste che scrive a caso o per mutazione siano liste
 * che si possono portare al tavolo: nei punti, con un generale, dentro
 * le percentuali, e — con la collezione — con le miniature che ci sono.
 * La collezione è finta, così la prova non cambia quando cambia la
 * vetrina.
 *
 * Si lancia con:  node test/cerca.mjs
 */
import { spazio, FAZIONI, fazioneDi } from '../tools/liste/spazio.mjs';
import { avvisiComposizione } from '../tools/liste/unita.mjs';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};

let s = 12345;
const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);

/* --- le fazioni dei cataloghi --- */
ok('«Lizardmen - Renegades 2.0» è Lucertole', fazioneDi('Lizardmen - Renegades 2.0') === 'liz');
ok('«Orc & Goblin Tribes» e «Orc and Goblin Tribes» sono la stessa', fazioneDi('Orc & Goblin Tribes') === 'og' && fazioneDi('Orc and Goblin Tribes') === 'og');
ok('un catalogo che non conosciamo non è di nessuno', fazioneDi('Dwarfen Mountain Holds') === null);

/* --- tutte le unità --- */
for (const f of Object.keys(FAZIONI)){
  const S = spazio(f, { pool: 'tutte', punti: 800 });
  let buone = 0, figlie = 0, dentro = true, generale = true, pct = true;
  for (let i = 0; i < 30; i++){
    const g = S.casuale(rnd);
    if (!g) continue;
    buone++;
    const l = S.costruisci(g, { id: 'x' });
    if (l.points > 800 || l.points < 800 - S.margine) dentro = false;
    const gen = l.units[l.prep.general];
    if (!gen || !/Characters/.test(gen.slot) || l.prep.general === l.prep.bsb) generale = false;
    if (avvisiComposizione(l).length) pct = false;
    const m = S.muta(g, rnd);
    if (m && !S.valida(m).length && S.chiave(m) !== S.chiave(g)) figlie++;
  }
  ok(`${f}: trenta liste a caso, tutte scritte`, buone === 30);
  ok(`${f}: nei punti, senza lasciarne per strada più del margine`, dentro);
  ok(`${f}: il generale è un personaggio, e non porta lo stendardo`, generale);
  ok(`${f}: dentro le percentuali della Grand Army`, pct);
  ok(`${f}: le figlie sono liste valide e diverse dalla madre`, figlie >= 25);
  ok(`${f}: la lista nota dell'archivio è fra le partenze`, S.partenze.length === 1);
}

/* --- le liste a tema: ogni unità ne ha una, tranne chi non entra per
   regola (la Hell Pit Abomination costa 210, l'Ancient Stegadon 230, e
   le Rare a 800 punti si fermano a 200) --- */
for (const f of Object.keys(FAZIONI)){
  const S = spazio(f, { pool: 'tutte', punti: 800 });
  const senza = S.voci.filter(v => { const g = S.casuale(rnd, { con: v.k }); return !g || !g.some(x => x.k === v.k); }).map(v => v.k);
  ok(`${f}: una lista a tema per ogni unità${senza.length ? ' (tranne ' + senza.join(', ') + ')' : ''}`,
     senza.every(k => k === 'hpa' || k === 'ancientSteg'));
}

/* --- i maghi portano Livello e dominio nella scheda di preparazione --- */
{
  const S = spazio('skaven', { pool: 'tutte', punti: 800 });
  const l = S.costruisci([{ k: 'greySeer', o: { level: 4 }, lore: 'dark' }, { k: 'clanrats', n: 40, o: { shields: true, c: 'csm', f: 8 } },
                          { k: 'clanrats', n: 40, o: { shields: true, c: 'csm', f: 8 } }, { k: 'clanrats', n: 28, o: { shields: true, c: 'sm', f: 6 } }], { id: 'x' });
  ok('il Grey Seer Livello 4 costa 215 e ha Livello e dominio nella scheda',
     l.units[0].pts === 215 && l.prep.units[0].level === 4 && l.prep.units[0].lore === 'dark');
  ok('i Clanrats hanno il fronte scelto', l.units[1].frontage === 8 && l.units[3].frontage === 6);
}

/* --- Da Boyz --- */
{
  const S = spazio('og', { pool: 'tutte', punti: 800 });
  const senza = [{ k: 'warboss', o: { great: true, heavy: true } }, { k: 'blackOrcs', n: 20, o: { c: 'csm', great: true } },
                 { k: 'orcs', n: 50, o: { c: 'csm' } }, { k: 'orcs', n: 12, o: {} }];
  ok('Orchi Neri senza un boss di Orchi Neri: Da Boyz dice di no', S.valida(senza).some(e => /Da Boyz/.test(e)));
}

/* --- la collezione --- */
{
  const catalogo = [
    { name: 'Clanrats', faction: 'Skaven', owned: 50, aliases: ['clanrats'] },
    { name: 'Grey Seer', faction: 'Skaven', owned: 1 },
    { name: 'Warplock Jezzails', faction: 'Skaven', owned: 3 },
    { name: 'Saurus Warriors', faction: 'Lizardmen', owned: 100 },
  ];
  const S = spazio('skaven', { pool: 'collezione', punti: 500, catalogo });
  ok('con la collezione ci sono solo le unità che hai', S.voci.map(v => v.k).sort().join() === 'clanrats,greySeer,jezzails');
  ok('e chi manca dice perché', S.escluse.some(e => e.k === 'stormvermin' && /ne hai 0/.test(e.perche)));
  ok('un alias uguale al nome non conta le miniature due volte', S.voci.find(v => v.k === 'clanrats').n[1] === 40);
  const due = [{ k: 'greySeer', o: { level: 3 } }, { k: 'clanrats', n: 30, o: {} }, { k: 'clanrats', n: 30, o: {} }];
  ok('due reggimenti da 30 con 50 Clanrats non si schierano', S.valida(due).some(e => /ne servono 60/.test(e)));
  let sforano = 0;
  for (let i = 0; i < 20; i++){
    const g = S.casuale(rnd);
    if (!g){ sforano++; continue; }
    const topi = g.filter(x => x.k === 'clanrats').reduce((a, x) => a + x.n, 0);
    const jez = g.filter(x => x.k === 'jezzails').reduce((a, x) => a + x.n, 0);
    if (topi > 50 || jez > 3) sforano++;
  }
  ok('le liste a caso non usano più miniature di quante ne hai', sforano === 0);
}

/* --- la collezione degli Orchi: poche miniature per voce, e Da Boyz ---
   Il 24/09/2026 la ricerca si fermava qui: le liste a caso mettevano tre
   reggimenti di Goblin con dieci Goblin in vetrina, o gli Orchi Neri
   senza il loro boss, e in quattrocento tentativi non ne usciva una. */
{
  const catalogo = [
    ['Orc Mobs', 25], ['Night Goblin Mobs', 30], ['Goblin Mobs', 10], ['Black Orc Mobs', 11], ['Orc Boar Boy Mobs', 10],
    ['Stone Troll Mobs', 4], ['Orc Boar Chariots', 1], ['Black Orc Warboss', 1], ['Black Orc Bigboss', 1],
    ['Orc Warboss', 1], ['Orc Weirdnob', 1], ['Goblin Oddnob', 1],
  ].map(([name, owned]) => ({ name, owned, faction: 'Orc and Goblin Tribes', aliases: [name.toLowerCase()] }));
  const S = spazio('og', { pool: 'collezione', punti: 800, catalogo });
  let scritte = 0, figlie = 0;
  for (let i = 0; i < 20; i++){
    const g = S.casuale(rnd);
    if (!g) continue;
    scritte++;
    if (S.muta(g, rnd)) figlie++;
  }
  ok('con la collezione degli Orchi si scrivono liste a caso', scritte === 20);
  ok('e hanno figlie', figlie >= 15);
}

/* --- le righe della Grand Army che le percentuali non dicono ---
   Legends: Skaven e Legends: Lizardmen p. 2, Ravening Hordes p. 11 */
{
  const sk = spazio('skaven', { pool: 'tutte', punti: 1000 });
  const topi = { k: 'clanrats', n: 40, o: { shields: true, c: 'csm' } };
  ok('i Jezzail senza un Warlock Engineer non si schierano',
     sk.valida([{ k: 'greySeer', o: { level: 4 }, lore: 'battle' }, topi, { k: 'clanrats', n: 40, o: { shields: true } }, { k: 'jezzails', n: 9, o: {} },
                { k: 'ratOgres', n: 3, o: { pm: 1 } }]).some(e => /Jezzails, uno per Warlock Engineer/.test(e)));
  ok('il cannone nemmeno',
     sk.valida([{ k: 'greySeer', o: { level: 4 }, lore: 'battle' }, topi, { k: 'clanrats', n: 40, o: { shields: true } }, { k: 'wlc', o: {} },
                { k: 'ratOgres', n: 6, o: { pm: 1 } }]).some(e => /Warp Lightning Cannon, 0-1/.test(e)));
  const liz = spazio('liz', { pool: 'tutte', punti: 1000 });
  ok("a 1.000 punti l'Oldblood sul Carnosauro e lo Skink Priest non stanno insieme",
     liz.valida([{ k: 'carnoOldblood', o: {} }, { k: 'priest', o: { l2: true }, lore: 'battle' }, { k: 'saurus', n: 30, o: { c: 'csm' } },
                 { k: 'skinks', n: 20, o: {} }]).some(e => /Oldblood o Skink Priest/.test(e)));
  ok('e senza Saurus Warriors non è una lista',
     liz.valida([{ k: 'oldblood', o: { weapon: 'great' } }, { k: 'templeGuard', n: 30, o: { c: 'csm' } }, { k: 'skinks', n: 20, o: {} },
                 { k: 'bastiladon', o: {} }]).some(e => /Saurus Warriors/.test(e)));
  const og = spazio('og', { pool: 'tutte', punti: 1000 });
  ok('i Night Goblin vogliono un capo o uno sciamano Night Goblin',
     og.valida([{ k: 'warboss', o: { great: true, heavy: true } }, { k: 'nightGoblins', n: 40, o: { c: 'csm' } }, { k: 'orcs', n: 50, o: { c: 'csm' } },
                { k: 'trolls', n: 6, o: {} }]).some(e => /Night Goblin Mobs, uno per/.test(e)));
  let dentro = 0, jez = 0;
  for (let i = 0; i < 20; i++){
    const g = sk.casuale(rnd);
    if (!g) continue;
    dentro++;
    if (g.some(x => x.k === 'jezzails')) jez++;
  }
  ok('le liste a caso Skaven si scrivono lo stesso, e i Jezzail ci entrano col loro Engineer', dentro === 20 && jez > 0);
}

/* --- com'è montato in vetrina, e i temi --- */
{
  const catalogo = [
    { name: 'Grey Seer', faction: 'Skaven', owned: 1, baseW: 60, baseH: 100 },
    { name: 'Screaming Bell', faction: 'Skaven', owned: 1, baseW: 60, baseH: 100 },
    { name: 'Clanrats', faction: 'Skaven', owned: 60, baseW: 25, baseH: 25 },
    { name: 'Hell Pit Abomination', faction: 'Skaven', owned: 1, baseW: 60, baseH: 100 },
    { name: 'Warlock Engineer', faction: 'Skaven', owned: 1, baseW: 25, baseH: 25 },
    { name: 'Warp Lightning Cannon', faction: 'Skaven', owned: 1, baseW: 50, baseH: 100 },
  ];
  const S = spazio('skaven', { pool: 'collezione', punti: 1000, catalogo });
  ok('il Grey Seer che in vetrina sta sulla campana non si schiera a piedi',
     !S.voci.some(v => v.k === 'greySeer') && S.voci.some(v => v.k === 'seerBell') && S.escluse.some(e => e.k === 'greySeer' && /montato/.test(e.perche)));
  const c = S.costruisci([{ k: 'seerBell', o: { level: 4 }, lore: 'battle' }], { id: 'x' }).units[0];
  ok('sulla campana: 400 punti, carro pesante su 60×100, otto Ferite',
     c.pts === 400 && /Heavy chariot/.test(c.troop) && c.baseW === 60 && c.baseH === 100 && +c.stats.W === 8);
  const T = spazio('skaven', { pool: 'collezione', punti: 1000, catalogo, con: ['seerBell', 'wlc|hpa'], senza: ['engineer'] });
  let tutte = 0, buone = 0;
  for (let i = 0; i < 10; i++){
    const g = T.casuale(rnd);
    if (!g) continue;
    tutte++;
    if (g.some(x => x.k === 'seerBell') && g.some(x => x.k === 'hpa') && !g.some(x => x.k === 'engineer' || x.k === 'wlc')) buone++;
  }
  ok('il tema: la campana e l\'Abominio sempre, e senza Engineer il cannone mai', tutte === 10 && buone === 10);
  ok('una lista fuori tema non vale', T.valida([{ k: 'seerBell', o: { level: 4 }, lore: 'battle' }, { k: 'clanrats', n: 40, o: {} },
                                                { k: 'clanrats', n: 20, o: {} }]).some(e => /il tema vuole/.test(e)));
}
{
  const catalogo = [['Night Goblin Squig Herds', 21], ['Night Goblin Oddnob', 1], ['Night Goblin Mobs', 30], ['Orc Mobs', 25]]
    .map(([name, owned]) => ({ name, owned, faction: 'Orc and Goblin Tribes', baseW: 25, baseH: 25 }));
  const S = spazio('og', { pool: 'collezione', punti: 1000, catalogo });
  ok('ventuno miniature fanno una mandria di 17 Squig e 4 Herder (p. 27)', (S.voci.find(v => v.k === 'squigHerd') || {}).n?.[1] === 17);
  const u = S.costruisci([{ k: 'ngOddnob', o: { l4: false }, lore: 'illusion' }, { k: 'squigHerd', n: 17, o: {} }], { id: 'x' }).units[1];
  ok('e costa 182 punti, con il profilo degli Squig', u.pts === 182 && u.models === 21 && +u.stats.S === 5 && +u.stats.A === 2);
}

/* ================================================================= */
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
