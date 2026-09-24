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

/* ================================================================= */
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
