/* Due liste dalla stessa parte (src/alleati.js), e le unità nuove della
 * collezione nel Laboratorio.
 *
 * Il 2 contro 1 del circolo — Tommaso e Kevin, 500 punti a testa,
 * contro Michele con 1000 — sta tutto nell'archivio, ed è quello che si
 * gioca qui: la lista unita, i due generali, il punteggio, e una partita
 * intera dell'arbitro.
 *
 * Si lancia con:  node test/alleati.mjs
 */
import fs from 'node:fs';
import * as AR from '../src/arbitro.js';
import * as AG from '../src/agente.js';
import * as D from '../src/dice.js';
import * as PR from '../src/profiles.js';
import * as MV from '../src/movement.js';
import * as SE from '../src/serie.js';
import { unisci, idAlleanza, eAlleanza, partiDi } from '../src/alleati.js';
import { usaArchivio } from '../src/costruttori.js';
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
const tommaso = lista('lmww1t46h12dr'), kevin = lista('lmww1uky844go'), michele = lista('lmww1x3x4zaui');

console.log('due liste diventano una');
{
  const L = unisci(tommaso, kevin);
  ok('le unità una dopo l altra', L.units.length === tommaso.units.length + kevin.units.length &&
     L.units[tommaso.units.length].name === kevin.units[0].name);
  ok('ognuna sa da quale lista viene', L.units.every((u, i) => u.alleato === (i < tommaso.units.length ? 0 : 1)));
  ok('i punti sono la somma', L.points === (tommaso.points || 0) + (kevin.points || 0));
  ok('e il nome le dice tutte e due', L.name === 'Tommaso + Kevin' && L.info.alleati.join() === 'Tommaso,Kevin');
  ok('un contingente per lista, con il suo generale',
     L.alleati.length === 2 && L.alleati[0].general != null && L.alleati[1].general >= tommaso.units.length);
  ok('l id della coppia si riconosce e si divide', eAlleanza(L.id) && partiDi(L.id).join() === [tommaso.id, kevin.id].join() &&
     L.id === idAlleanza(tommaso.id, kevin.id));
  ok('una lista sola resta com e', unisci(tommaso, null) === tommaso);
  ok('le liste di partenza non si toccano', !tommaso.units.some(u => 'alleato' in u));

  /* la scheda di preparazione si rinumera: il capo che la seconda lista
     mette nel suo reggimento 2 sta nel reggimento 2 + n */
  const a = { id: 'a', name: 'Prima', points: 100, units: [{ name: 'Capo', models: 1, pts: 50, slot: 'Characters' }, { name: 'Fanti', models: 10, pts: 50 }],
              prep: { general: 0, bsb: null, units: { 0: { con: 1 } } } };
  const b = { id: 'b', name: 'Seconda', points: 100, units: [{ name: 'Capo B', models: 1, pts: 50, slot: 'Characters' }, { name: 'Fanti B', models: 10, pts: 50 }],
              prep: { general: 0, bsb: 0, units: { 0: { con: 1, level: 2 } } } };
  const U = unisci(a, b);
  ok('la scheda di preparazione si rinumera', U.prep.units[2].con === 3 && U.prep.units[2].level === 2 && U.prep.units[0].con === 1);
  ok('e il generale e lo stendardo della seconda lista anche', U.alleati[1].general === 2 && U.alleati[1].bsb === 2);
}

console.log('\nl arbitro: due generali da una parte');
{
  const L = unisci(tommaso, kevin);
  const S = AR.newBattle({ A: L, B: michele, scenario: 'bm-strada' });
  ok('un generale per lista', S.generali.A.length === 2 && S.generali.A.every(Boolean) && S.generali.A[0] !== S.generali.A[1]);
  ok('e la parte con una lista sola non ne ha una seconda', S.generali.B.length === 0 && S.generale.B);
  const [g0, g1] = S.generali.A.map(uid => S.units.find(u => u.uid === uid));
  ok('ogni generale è della sua lista', g0.alleato === 0 && g1.alleato === 1);
  /* un capo non entra nei reggimenti dell altra lista */
  const fantiDi = k => S.units.find(u => u.army === 'A' && u.alleato === k && (u.models || 1) > 4 && !/character/i.test(u.slot || ''));
  ok('un capo non si unisce ai reggimenti dell alleato', !AR.stannoInsieme(g0, fantiDi(1)));

  /* il punteggio: morto il generale della seconda lista, l altra parte
     prende il bonus, e morti tutti e due lo prende due volte */
  const prima = AR.punteggio(S).parti.B.generale;
  g1.dead = true;
  const uno = AR.punteggio(S).parti.B.generale;
  g0.dead = true;
  const due = AR.punteggio(S).parti.B.generale;
  ok(`ogni generale perso vale i suoi punti (${prima} → ${uno} → ${due})`, prima === 0 && uno > 0 && due === 2 * uno);
}

console.log('\nuna partita intera, 2 contro 1');
{
  const L = unisci(tommaso, kevin);
  const tutte = await SE.giocaSerie({ AR, AG, D, liste: { x: L, y: michele }, nomi: { x: L.name, y: michele.name },
                                      scenario: 'bm-strada', partite: 1, seme: 3, specchio: true,
                                      agente: (tag, nome) => AG.agenteEuristico({ nome }) });
  ok('si gioca fino in fondo, da tutti e due i lati', tutte.length === 2 && tutte.every(p => p.turno >= 1 && p.label));
  ok('e nessuna unità resta fuori dallo schieramento', tutte.every(p => !p.fuori.length));
}

console.log('\nle unità nuove della collezione nel Laboratorio');
{
  usaArchivio(liste);
  const catalogo = dati('catalogo.json');
  const liz = spazio('liz', { pool: 'collezione', punti: 1000, catalogo });
  const og = spazio('og', { pool: 'collezione', punti: 1000, catalogo });
  for (const k of ['cohorts', 'swarms', 'salamander'])
    ok(`le Lucertole hanno ${k}`, liz.voci.some(v => v.k === k));
  ok('le Salamander sono due, come in vetrina', liz.voci.find(v => v.k === 'salamander').max === 2);
  ok('gli Jungle Swarms fino a sei basette', liz.voci.find(v => v.k === 'swarms').n[1] === 6);
  ok('gli Orchi hanno i Goblin Wolf Rider', og.voci.some(v => v.k === 'wolfRiders'));
  const S = spazio('liz', { pool: 'collezione', punti: 1000, catalogo, limiti: { swarms: { min: 1 }, salamander: { min: 1 }, cohorts: { min: 1 } } });
  let r = 7; const rnd = () => ((r = (r * 1103515245 + 12345) >>> 0) / 2 ** 32);
  const g = S.casuale(rnd);
  const l = g && S.costruisci(g);
  ok('una lista che le vuole si scrive, e vale', !!g && !S.valida(g).length);
  const sw = l && l.units.find(u => u.name === 'Jungle Swarms');
  ok('lo sciame costa 40 a basetta', sw && sw.pts === 40 * sw.models);
  const w = spazio('og', { pool: 'tutte', punti: 1000 }).voci.find(v => v.k === 'wolfRiders').crea({ n: 5, c: 'sm', bows: true });
  ok('i Wolf Rider con stendardo, musico e archi costano come nel file di Tommaso', w.pts === 65);
}

console.log('\nil Movimento dalla riga della cavalcatura che il file porta');
{
  const lupi = kevin.units.find(u => u.name === 'Goblin Wolf Rider Mobs');
  ok('i Goblin Wolf Rider corrono di 9', MV.moveOf(lupi) === 9 && /file/.test(MV.moveDetail(lupi).why));
  ok('e il lupo mena con i suoi numeri', PR.beastRows(lupi).length === 1 && PR.beastRows(lupi)[0].stats.A === 1);
  const boar = liste.flatMap(l => l.units).find(u => u.name === 'Orc Boar Boy Mobs');
  ok('chi sta nella tavola dei profili resta con il libro', /Ravening Hordes/.test(MV.moveDetail(boar).why));
}

console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
