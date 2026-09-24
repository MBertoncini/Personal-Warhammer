/* Le armi delle miniature.
 *
 * 25 Orchi con l'arma a una mano e 15 con l'arco da guerra non fanno un
 * reggimento di 35 arcieri — a meno che il catalogo non dica che quelle
 * miniature si schierano anche con altre armi. Lo stesso conto lo fanno
 * la ricerca delle liste sulla collezione e la copertura delle liste
 * nell'app.
 *
 * Si lancia con:  node test/armi.mjs
 */
import 'fake-indexeddb/auto';
import * as A from '../src/armi.js';
import { spazio } from '../tools/liste/spazio.mjs';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};

/* ================================================================= */
console.log('le classi delle armi');

ok('«Warbows» e «warbow» sono la stessa classe', A.armiKey('Warbows') === A.armiKey('warbow') && A.armiKey('Warbows') === 'warbow');
ok('l arma a una mano non distingue niente', A.armiKey('Hand weapons') === '' && A.armiKey('') === '');
const arcieri = [{ name: 'Hand Weapon' }, { name: 'Warbow' }];
ok('gli arcieri portano l arco', A.portaArmi('warbow', arcieri) && !A.portaArmi('shortbow', arcieri));
ok('la classe di un unita e quella delle armi che porta', A.classeDi(arcieri, ['', 'warbow']) === 'warbow');
ok('senza arco resta la base', A.classeDi([{ name: 'Hand Weapon' }], ['', 'warbow']) === '');

/* ================================================================= */
console.log('bastano le miniature?');

const scorte = [{ armi: '', libere: false, n: 25 }, { armi: 'warbow', libere: false, n: 15 }];
const due = new Map([['warbow', 35]]);
let r = A.assegna(due, scorte);
ok('35 arcieri con 15 archi: ne mancano 20', !r.ok && r.manca.get('warbow') === 20);
r = A.assegna(new Map([['warbow', 15], ['', 25]]), scorte);
ok('15 arcieri e 25 con l arma a una mano: ci sono', r.ok);
const magneti = [{ armi: '', libere: true, n: 25 }, { armi: 'warbow', libere: false, n: 15 }];
r = A.assegna(due, magneti);
ok('con le braccia magnetizzate i 25 coprono i 20 che mancano', r.ok && r.prestate.get('warbow') === 20);
r = A.assegna(new Map([['warbow', 35], ['', 10]]), magneti);
ok('ma non due volte: 35 arcieri e altri 10 fanno 45 su 40', !r.ok && r.manca.get('warbow') === 5);
ok('quanti arcieri, da soli: 15 fissi, 40 con i magneti',
   A.quanti('warbow', scorte) === 15 && A.quanti('warbow', magneti) === 40);

/* ================================================================= */
console.log('la ricerca sulla collezione');
{
  const og = (name, owned, x = {}) => ({ name, owned, faction: 'Orc and Goblin Tribes', aliases: [name.toLowerCase()], ...x });
  const catalogo = [og('Orc Mobs', 25), og('Orc Mobs', 15, { armi: 'Warbows' }), og('Night Goblin Mobs', 30, { armi: 'Shortbows' }),
                    og('Orc Warboss', 1)];
  const S = spazio('og', { pool: 'collezione', punti: 800, catalogo });
  const ng = S.voci.find(v => v.k === 'nightGoblins');
  ok('i Night Goblin tutti con l arco: l arco non e piu una scelta', ng && ng.opz.bows.join() === 'true');
  const orcs = S.voci.find(v => v.k === 'orcs');
  ok('gli Orchi possono avere l arco o no', orcs && orcs.opz.bows.length === 2 && orcs.n[1] === 25);
  const capo = { k: 'warboss', o: { great: true, heavy: true } };
  ok('20 Orchi con l arco, con 15 archi, non si schierano',
     S.valida([capo, { k: 'orcs', n: 20, o: { bows: true } }]).some(e => /warbow.*ne servono 20, ne hai 15/.test(e)));
  ok('15 con l arco e 25 senza si',
     !S.valida([capo, { k: 'orcs', n: 15, o: { bows: true } }, { k: 'orcs', n: 25, o: {} }]).some(e => /ne servono/.test(e)));
  let sforano = 0;
  const rnd = (() => { let s = 7; return () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32); })();
  for (let i = 0; i < 20; i++){
    const g = S.casuale(rnd);
    if (!g) continue;
    const archi = g.filter(x => x.k === 'orcs' && x.o.bows).reduce((a, x) => a + x.n, 0);
    const senza = g.filter(x => x.k === 'orcs' && !x.o.bows).reduce((a, x) => a + x.n, 0);
    if (archi > 15 || senza > 25 || g.some(x => x.k === 'nightGoblins' && !x.o.bows)) sforano++;
  }
  ok('le liste a caso rispettano le armi che hai', sforano === 0);

  const M = spazio('og', { pool: 'collezione', punti: 800,
    catalogo: catalogo.map(e => e.armi ? e : { ...e, altreArmi: true }) });
  ok('con i 25 schierabili con altre armi, 35 arcieri si',
     !M.valida([capo, { k: 'orcs', n: 35, o: { bows: true } }]).some(e => /ne servono/.test(e)));
}

/* ================================================================= */
console.log('nell app: aggancio e copertura');
{
  const cat = await import('../src/catalog.js');
  const lists = await import('../src/lists.js');
  await cat.initCatalog();
  const base = await cat.upsertEntry({ name: 'Orc Mobs', faction: 'Orc & Goblin Tribes', owned: 25, aliases: ['orc mobs'] });
  const archi = await cat.upsertEntry({ name: 'Orc Mobs', faction: 'Orc & Goblin Tribes', owned: 15, armi: 'Warbows', aliases: ['orc mobs'] });
  ok('due voci con lo stesso nome e armi diverse non sono doppioni', cat.duplicateGroups().length === 0);
  ok('gli arcieri si agganciano alla voce degli archi', cat.matchUnitName('Orc Mobs', arcieri) === archi);
  ok('gli altri alla voce di base', cat.matchUnitName('Orc Mobs', [{ name: 'Hand Weapon' }]) === base);
  ok('il nome della voce dice le armi', cat.entryLabel(cat.catEntry(archi)) === 'Orc Mobs · Warbows');

  const unit = (n, weapons, catId) => ({ name: 'Orc Mobs', models: n, weapons, catId });
  let cov = lists.coverage({ units: [unit(35, arcieri, archi)] });
  ok('35 arcieri su 15 archi: ne mancano 20', cov.missing === 20);
  /* agganciati a mano alla voce di base: contano lo stesso come arcieri */
  cov = lists.coverage({ units: [unit(35, arcieri, base)] });
  ok('anche se agganciati alla voce di base', cov.missing === 20);
  await cat.upsertEntry({ ...cat.catEntry(base), altreArmi: true });
  cov = lists.coverage({ units: [unit(35, arcieri, archi)] });
  ok('con i 25 schierabili con altre armi non manca niente, e se ne prendono 20 in prestito',
     cov.missing === 0 && cov.rows[0].prestate === 20);
  const l = { units: [unit(35, arcieri, archi), unit(10, [{ name: 'Hand Weapon' }], base)] };
  cov = lists.coverage(l);
  ok('ma non due volte', cov.missing === 5);
  ok('e la riga di ogni unita e quella della sua classe',
     cov.rowOf(l.units[0]).id === archi && cov.rowOf(l.units[1]).id === base);

  /* in vetrina solo Night Goblin con l'arco: quelli con le lance sono
     un'altra classe sulla stessa voce, e le due righe non si confondono */
  const ng = await cat.upsertEntry({ name: 'Night Goblin Mobs', faction: 'Orc & Goblin Tribes', owned: 30, armi: 'Shortbows' });
  const g = (n, w) => ({ name: 'Night Goblin Mobs', models: n, weapons: [{ name: 'Hand Weapon' }, { name: w }], catId: ng });
  const gl = { units: [g(20, 'Thrusting Spear'), g(10, 'Shortbow')] };
  cov = lists.coverage(gl);
  ok('20 con le lance e 10 con l arco, con 30 arcieri: mancano i 20 con le lance', cov.missing === 20);
  ok('la riga degli arcieri non dice che ne mancano',
     cov.rowOf(gl.units[1]).short === 0 && cov.rowOf(gl.units[0]).short === 20);
}

/* ================================================================= */
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
