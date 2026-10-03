/* Il Laboratorio dalla pagina: lo spazio con i limiti per unità, la
 * ricerca (src/cerca.js), i tavoli generati e il formato forzato.
 *
 * Qui non si gioca nessuna partita vera: `gioca` è finto, e decide chi
 * vince dai punti di alcune unità — così si vede se la ricerca va dove
 * deve andare (la più forte, la più equilibrata, la coppia alla pari)
 * in un secondo invece che in un'ora. Le partite vere le misurano le
 * prove della serie e lo strumento.
 *
 * Si lancia con:  node test/laboratorio.mjs
 */
import { spazio } from '../tools/liste/spazio.mjs';
import { cercaLista, cercaCoppia, cercaScenario, torneo, giocaSpezzata, OBIETTIVI, SFORZI, generatore } from '../src/cerca.js';
import { scenarioCasuale, randomTerrain, dadi } from '../src/terreno-casuale.js';
import { conFormato } from '../src/lab-partite.js';
import { formatFor } from '../src/victory.js';
import { TERRAIN, TREASURE_CLEAR } from '../src/terrain.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};
let s = 4242;
const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 2 ** 32);

/* ---------------- i limiti per unità ---------------- */
{
  const S = spazio('skaven', { pool: 'tutte', punti: 1000, limiti: { clanrats: { min: 2, n: [30, 40] }, wlc: { max: 0 }, stormvermin: { max: 1 } } });
  ok('«max: 0» toglie la voce, come il tema', !S.voci.some(v => v.k === 'wlc') && S.escluse.some(e => e.k === 'wlc'));
  ok('il numero di modelli si stringe a quello chiesto', S.voci.find(v => v.k === 'clanrats').n.join('-') === '30-40');
  ok('il tetto di unità si abbassa', S.voci.find(v => v.k === 'stormvermin').max === 1);
  let buone = 0, rispettano = true;
  for (let i = 0; i < 15; i++){
    const g = S.casuale(rnd);
    if (!g) continue;
    buone++;
    const cr = g.filter(x => x.k === 'clanrats');
    if (cr.length < 2 || cr.some(x => x.n < 30 || x.n > 40) || g.some(x => x.k === 'wlc')) rispettano = false;
  }
  ok(`le liste a caso si scrivono lo stesso (${buone} su 15)`, buone >= 10);
  ok('e hanno almeno due reggimenti di Clanrats da 30 a 40, e niente cannone', rispettano);
  let figlie = 0, figlieOk = true;
  const padre = S.casuale(rnd);
  for (let i = 0; i < 20 && padre; i++){
    const f = S.muta(padre, rnd);
    if (!f) continue;
    figlie++;
    if (f.filter(x => x.k === 'clanrats').length < 2) figlieOk = false;
  }
  ok('le figlie non scendono sotto il minimo', figlie > 0 && figlieOk);
  ok('una lista con un reggimento solo non vale', (() => { const g = S.casuale(rnd); const i = g.findIndex(x => x.k === 'clanrats'); g.splice(i, 1); return S.valida(g).some(e => /il tema vuole 2 Clanrats/.test(e)); })());
  const I = spazio('skaven', { pool: 'tutte', punti: 1000, limiti: { clanrats: { n: [50, 60] } } });
  ok('chiedere più modelli di quanti il libro ne permette esclude la voce, e dice perché', I.escluse.some(e => e.k === 'clanrats' && /chiesti 50–60/.test(e.perche)));
  const C = spazio('liz', { pool: 'collezione', punti: 1000, catalogo: [], limiti: { saurus: { min: 1 } } });
  ok('un\'unità voluta che la collezione non ha rende la ricerca impossibile, e lo dice', C.impossibile.some(x => /Saurus Warriors/.test(x)));
}

/* ---------------- la ricerca, con un gioco finto ----------------
   Chi vince lo decidono i punti spesi in Clanrats: un modo semplice di
   avere liste più forti di altre, che la ricerca deve trovare. */
const forza = l => (l.units || []).filter(u => u.name === 'Clanrats').reduce((t, u) => t + u.pts, 0) + (l.forza || 0);
let chiamate = 0;
const finto = async ({ x, y, partite = 1, seme = 1 }) => {
  chiamate++;
  const r = { vince: { x: 0, y: 0 }, pari: 0, n: 0, vp: { x: 0, y: 0 }, fuori: {} };
  const g = generatore(seme * 31 + forza(x));
  for (let i = 0; i < partite * 2; i++){
    const d = forza(x) - forza(y) + (g() - 0.5) * 200;
    if (d > 30) r.vince.x++; else if (d < -30) r.vince.y++; else r.pari++;
    r.n++;
  }
  return r;
};
{
  const S = spazio('skaven', { pool: 'tutte', punti: 1000 });
  const avv = [300, 450].map((f, i) => ({ lista: { id: 'avv' + i, name: 'Avversario ' + i, units: [], forza: f, info: {} }, fonte: 'archivio' }));
  const P = { ...SFORZI.lampo, generazioni: 4 };
  const righe = [];
  const forte = await cercaLista({ S, contro: avv, scenari: ['a', 'b'], P: { ...P, generazioni: 8 }, seme: 11, gioca: finto, log: r => righe.push(r) });
  const best = forte.migliori[0];
  ok('la ricerca torna le finaliste verificate, con la lista costruita', forte.migliori.length >= 1 && best.lista && best.lista.units.length > 0);
  ok('e scrive come va, generazione per generazione', righe.some(r => /^gen 8\/8/.test(r)));
  ok(`la più forte ha tanti Clanrats (${forza(best.lista)} punti, avversari 300 e 450)`, forza(best.lista) >= 450);
  ok('la verifica ha i conti per avversario e per scenario', best.verifica.perAvversario.avv0 && best.verifica.perScenario.b && best.verifica.celle['avv1|a']);
  const eq = await cercaLista({ S, contro: avv, scenari: ['a'], P, seme: 11, gioca: finto, obiettivo: 'equilibrata' });
  const fe = forza(eq.migliori[0].lista);
  ok(`la più equilibrata sta fra i due avversari (${fe} punti di Clanrats, avversari 300 e 450)`, fe > 250 && fe < 520);
  ok('l\'equilibrio vuole tutti gli avversari vicini al 50%, non la media',
     OBIETTIVI.equilibrata.punteggio({ w: 10, l: 10, d: 0, n: 20, per: { a: { w: 10, l: 0, d: 0, n: 10 }, b: { w: 0, l: 10, d: 0, n: 10 } } }) <
     OBIETTIVI.equilibrata.punteggio({ w: 10, l: 10, d: 0, n: 20, per: { a: { w: 5, l: 5, d: 0, n: 10 }, b: { w: 5, l: 5, d: 0, n: 10 } } }));
  let fermo = false;
  const meta = await cercaLista({ S, contro: avv, scenari: ['a'], P: { ...P, generazioni: 10 }, seme: 3, gioca: finto,
    log: r => { if (/^gen 2\//.test(r)) fermo = true; }, fermato: () => fermo });
  ok('fermata, si tiene quello che c\'è: finaliste verificate dopo due generazioni', meta.fermata && meta.storia.length === 2 && meta.migliori.length >= 1);
}
{
  const SA = spazio('skaven', { pool: 'tutte', punti: 800 }), SB = spazio('skaven', { pool: 'tutte', punti: 800 });
  const r = await cercaCoppia({ SA, SB, scenari: ['a', 'b'], P: { ...SFORZI.lampo, generazioni: 4 }, seme: 5, gioca: finto });
  const c = r.coppie[0];
  ok('la coppia torna con tutte e due le liste costruite e descritte', c.listaA.units.length && c.listaB.units.length && c.descrizioneA && c.descrizioneB);
  ok(`e la prima è alla pari (${Math.abs(forza(c.listaA) - forza(c.listaB))} punti di Clanrats di scarto)`, Math.abs(forza(c.listaA) - forza(c.listaB)) < 150);
  ok('con lo scenario su cui giocarla', ['a', 'b'].includes(c.scenarioConsigliato));
}
{
  const x = { id: 'x', name: 'X', units: [], forza: 100 }, y = { id: 'y', name: 'Y', units: [], forza: 100 };
  const gen = i => scenarioCasuale(900 + i, { formato: 'bm' });
  const r = await cercaScenario({ x, y, genera: gen, quanti: 5, semi: 1, verifica: 2, finalisti: 2, seme: 900, gioca: finto });
  ok('la ricerca del tavolo torna i finalisti con la scheda intera', r.tavoli.length === 2 && r.tavoli[0].def.terrain && r.tavoli[0].verifica.n === 4);
  ok('e gli altri provati', r.altri.length === 3);
  const t = await torneo({ liste: [{ id: 'a', lista: x }, { id: 'b', lista: y }, { id: 'c', lista: { ...y, id: 'c', forza: 400 } }], scenari: ['s1', 's2'], semi: 2, gioca: finto });
  ok('il torneo gioca ogni coppia su ogni scenario', Object.keys(t.celle).length === 6 && t.partite === 24);
}
{
  chiamate = 0;
  const r = await giocaSpezzata(finto, { x: { units: [], forza: 1 }, y: { units: [], forza: 1 }, partite: 3, seme: 10 });
  ok('una serie di tre semi diventa tre lavori da un seme, e i conti si sommano', chiamate === 3 && r.n === 6);
}

/* ---------------- i tavoli generati ---------------- */
{
  const a = scenarioCasuale(4011, {}), b = scenarioCasuale(4011, {}), c = scenarioCasuale(4012, {});
  ok('lo stesso seme dà lo stesso tavolo', JSON.stringify(a) === JSON.stringify(b));
  ok('un altro seme, un altro tavolo', JSON.stringify(a.terrain) !== JSON.stringify(c.terrain));
  const f = scenarioCasuale(7, { tavolo: 'grande', deploy: 'pass', densita: 'fitto', miscela: 'boschi', centro: 'monolith', tesori: 3, formato: 'bm' });
  ok('le manopole fisse si rispettano', f.table.join('x') === '72x48' && f.deploy === 'pass' && f.gen.miscela === 'boschi' && f.group === 'Battle March');
  ok('il monolite al centro', f.terrain.some(t => t.kind === 'monolith' && t.x === 36 && t.y === 24));
  ok('i tesori chiesti ci sono', f.terrain.filter(t => t.kind === 'treasure').length === 3);
  const nonTesori = f.terrain.filter(t => t.kind !== 'treasure');
  const lontani = f.terrain.filter(t => t.kind === 'treasure').every(p => nonTesori.every(q => {
    const w = q.rot === 90 ? q.h : q.w, h = q.rot === 90 ? q.w : q.h;
    return Math.hypot(Math.max(Math.abs(p.x - q.x) - w / 2, 0), Math.max(Math.abs(p.y - q.y) - h / 2, 0)) >= TREASURE_CLEAR;
  }));
  ok('e stanno a più di 3″ da ogni elemento (Battle March)', lontani);
  const bm = scenarioCasuale(8, { formato: 'bm', densita: 'fitto' });
  ok('in Battle March nessun pezzo oltre i 12″ sul lato lungo', bm.terrain.every(t => Math.max(t.w, t.h) <= 12));
  ok('i boschi chiesti sono boschi e paludi e colline', f.terrain.filter(t => !['treasure', 'monolith'].includes(t.kind)).every(t => ['wood', 'marsh', 'hill'].includes(t.kind)));
  const sp = scenarioCasuale(9, { centro: 'niente', densita: 'medio' });
  const pezzi = sp.terrain.filter(t => t.kind !== 'treasure');
  const W = sp.table[0], H = sp.table[1];
  ok('il terreno è a specchio di mezzo giro', pezzi.every(p => pezzi.some(q => q.kind === p.kind && Math.abs(q.x - (W - p.x)) < 0.01 && Math.abs(q.y - (H - p.y)) < 0.01)));
  const r1 = randomTerrain(48, 36, { rnd: dadi(5) }), r2 = randomTerrain(48, 36, { rnd: dadi(5) });
  ok('anche il terreno da solo, col seme, viene uguale', JSON.stringify(r1) === JSON.stringify(r2));
  ok('e senza seme lo fa ancora il tavolo (Math.random)', randomTerrain(48, 36).length > 0);
}

/* ---------------- il formato forzato ---------------- */
{
  const strada = { label: 'Strada', group: 'Battle March', table: [48, 36], deploy: 'pitched battle' };
  const campale = { label: 'Campale', group: 'Generici', table: [72, 48], deploy: 'pitched battle' };
  ok('come dice lo scenario: non cambia niente', conFormato(strada, 'scenario') === strada && formatFor(conFormato(campale, 'scenario')) === 'core');
  ok('Battle March giocata col Core Rulebook', formatFor(conFormato(strada, 'core')) === 'core');
  ok('la Battaglia Campale giocata come Battle March', formatFor(conFormato(campale, 'bm')) === 'bm');
  ok('e la scheda originale non si tocca', strada.group === 'Battle March' && campale.group === 'Generici');
}

console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
