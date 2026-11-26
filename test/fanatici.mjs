/* I Fanatici dei Night Goblin (arbitro.js, «i Fanatici»).
 *
 * La lista di Kevin ha venti Night Goblin con le lance e due Fanatici
 * nascosti dentro: New Recruit li scrive in `crew`. Qui si gioca contro
 * la lista «salamander» e si guarda il registro: escono, girano,
 * attraversano, colpiscono, cadono.
 *
 * Si lancia con:  node test/fanatici.mjs
 */
import fs from 'node:fs';
import * as AR from '../src/arbitro.js';
import * as AG from '../src/agente.js';
import * as D from '../src/dice.js';
import * as PR from '../src/profiles.js';
import * as RP from '../src/replay.js';
import { usaArchivio, OG } from '../src/costruttori.js';
import { spazio } from '../src/spazio.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};
const dati = f => JSON.parse(fs.readFileSync(new URL('../dati/' + f, import.meta.url), 'utf8'));
PR.useProfiles(dati('profili.json'));
const liste = dati('liste.json');
const lista = id => liste.find(l => l.id === id);
const kevin = lista('lmww1uky844go'), salamander = lista('lmwxczrcuex7e');

console.log('quanti ne nasconde chi');
{
  const ng = kevin.units.find(u => u.name === 'Night Goblin Mobs' && u.crew === 2);
  ok('i due Fanatici di Kevin stanno nel reggimento con le lance', AR.fanaticiDi(ng) === 2);
  ok('gli arcieri senza la regola non ne nascondono', kevin.units.filter(u => u !== ng).every(u => AR.fanaticiDi(u) === 0));
  const S = AR.newBattle({ A: kevin, B: salamander, scenario: 'bm-strada' });
  ok('allo schieramento restano nascosti', S.units.find(u => u.nascosti).nascosti === 2 && S.fanatici.length === 0);
}

console.log('\nin partita');
const partite = [];
for (const seme of [1, 2, 3, 4]){
  D.setSource(D.seeded(seme));
  const S = AR.newBattle({ A: kevin, B: salamander, scenario: 'bm-strada' });
  let foto = null;
  const e = await AG.giocaPartita(AR, S, { A: AG.agenteEuristico({ nome: 'A' }), B: AG.agenteEuristico({ nome: 'B' }),
    onPasso: () => { if (!foto && AR.fanaticiVivi(S).length) foto = RP.fotogramma(S, { AR }); } });
  partite.push({ S, e, foto });
}
{
  const righe = partite.flatMap(p => p.S.log.map(r => r.text));
  const liberati = righe.filter(t => /libera un Fanatico/.test(t)).length;
  ok(`si liberano (${liberati} in 4 partite), mai più di due per partita`,
     liberati > 0 && partite.every(p => p.S.fanatici.length <= 2));
  ok('il limite lo dice', partite.some(p => p.S.log.some(r => r.kind === 'limite' && /Fanatici/.test(r.text))));
  ok('girano di 2D6', righe.some(t => /gira la palla e catena: \d \+ \d = \d+″/.test(t)));
  ok('e nel turno dopo in una direzione a caso', righe.some(t => /in una direzione a caso/.test(t)));
  const attraversate = righe.filter(t => /attraversata da Fanatico/.test(t)).length;
  ok(`chi viene attraversato prende i colpi a Forza 5, perforazione 3 (${attraversate} volte)`,
     attraversate > 0 && righe.some(t => /colpi? a Forza 5, perforazione 3/.test(t)));
  ok('e cadono: doppio, terreno, bordo o un altro Fanatico',
     righe.some(t => /(doppio \d|tocca |esce dal tavolo|si impiglia)/.test(t) && /Fanatico/.test(t)));
  ok('tutte le partite arrivano in fondo', partite.every(p => p.e && p.e.label));
  ok('i Fanatici liberati stanno nei fotogrammi della partita da rivedere',
     partite.some(p => p.foto && p.foto.unita.some(u => /^Fanatico/.test(u.n) && u.w === 25)));
}

console.log('\nla copia per guardare avanti');
{
  D.setSource(D.seeded(1));
  const S = AR.newBattle({ A: kevin, B: salamander, scenario: 'bm-strada' });
  S.fanatici.push({ fid: 9001, army: 'A', x: 100, y: 100, vivo: true, nome: 'Fanatico 1' });
  const C = AR.clona(S);
  C.fanatici[0].x = 500; C.fanatici[0].vivo = false;
  ok('la copia ha i suoi Fanatici, e muoverli non tocca la partita vera', S.fanatici[0].x === 100 && S.fanatici[0].vivo);
}

console.log('\nnel Laboratorio');
{
  usaArchivio(liste);
  const con = OG.nightGoblins({ n: 20, spears: true, c: 'sm', fan: 2 });
  const senza = OG.nightGoblins({ n: 20, spears: true, c: 'sm' });
  ok('due Fanatici costano 50 punti in più, come nel file di Kevin', con.pts === senza.pts + 50 && con.pts === 140);
  ok('e portano le loro regole', AR.fanaticiDi(con) === 2 && !AR.fanaticiDi(senza) &&
     !senza.rules.some(r => /fanatic/i.test(r)));
  const catalogo = dati('catalogo.json');
  const S0 = spazio('og', { pool: 'collezione', punti: 1000, catalogo });
  ok('con la collezione, senza Fanatici in vetrina non se ne mettono', S0.voci.find(v => v.k === 'nightGoblins').opz.fan.join() === '0');
  const S1 = spazio('og', { pool: 'collezione', punti: 1000,
    catalogo: [...catalogo, { name: 'Night Goblin Fanatics', faction: 'Orc and Goblin Tribes', owned: 2, baseW: 25, baseH: 25 }] });
  ok('con due Fanatici in vetrina, uno o due', S1.voci.find(v => v.k === 'nightGoblins').opz.fan.join() === '0,1,2');
  ok('con tutte le unità, fino a tre', spazio('og', { pool: 'tutte', punti: 1000 }).voci.find(v => v.k === 'nightGoblins').opz.fan.join() === '0,1,2,3');
}

console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
