/* I conti di chi guarda tante partite (tools/statistica.mjs).
 *
 * Sono conti senza dadi, e si provano con dati di cui si sa gia' la
 * risposta: una retta che la regressione deve ritrovare, delle
 * proporzioni tutte uguali che il restringimento deve schiacciare sulla
 * media, l'esempio da manuale di Benjamini-Hochberg.
 *
 * Si lancia con:  node test/statistica.mjs
 */
import * as ST from '../tools/statistica.mjs';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};
const vicino = (a, b, tol) => Math.abs(a - b) <= tol;

/* un generatore con il seme, per dati finti che non cambiano */
/* mulberry32: un congruenziale semplice ha i tiri di fila correlati, e
   la regressione ritrovava 95 invece di 100 per colpa del generatore */
const lcg = s => () => {
  s = (s + 0x6D2B79F5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const gauss = r => () => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());

console.log('l intervallo di Wilson');
{
  const w = ST.wilson(50, 100);
  ok('50 su 100: 40–60%', vicino(w.lo, 0.404, 0.002) && vicino(w.hi, 0.596, 0.002));
  const z = ST.wilson(0, 10);
  ok('0 su 10 non dà un intervallo vuoto', z.lo === 0 && z.hi > 0.25);
  ok('e nemmeno 10 su 10', ST.wilson(10, 10).lo < 0.75 && ST.wilson(10, 10).hi > 0.999);
}

console.log('\nla regressione lineare');
{
  const r = lcg(7), g = gauss(r);
  const X = [], y = [];
  for (let i = 0; i < 2000; i++){
    const a = r() < 0.5 ? 0.5 : -0.5, b = g();
    X.push([1, a, b]); y.push(30 + 100 * a - 20 * b + 50 * g());
  }
  const o = ST.ols(X, y, ['c', 'a', 'b']);
  const [c, a, b] = o.coef;
  ok('ritrova l intercetta, 30', vicino(c.stima, 30, 5));
  ok('ritrova la pendenza di a, 100', vicino(a.stima, 100, 10) && a.lo < 100 && a.hi > 100);
  ok('e quella di b, -20', vicino(b.stima, -20, 5));
  ok('l errore standard è quello che deve essere (50 / √2000 · 2 ≈ 2.2)', vicino(a.se, 2.24, 0.4));
  ok('un effetto vero ha un p piccolo', a.p < 1e-6);
  /* una colonna costante in piu': non si stima, e si dice */
  const o2 = ST.ols(X.map(x => [...x, 1]), y, ['c', 'a', 'b', 'costante']);
  ok('una colonna che ripete l intercetta si toglie e si dice', o2.tolte.includes('costante') && o2.coef.length === 3);
}

console.log('\nla regressione logistica');
{
  const r = lcg(11);
  const X = [], y = [];
  for (let i = 0; i < 4000; i++){
    const a = r() < 0.5 ? 0.5 : -0.5;
    const p = 1 / (1 + Math.exp(-(0.3 + 1.2 * a)));
    X.push([1, a]); y.push(+(r() < p));
  }
  const l = ST.logistica(X, y, ['c', 'a'], { cresta: 0 });
  ok('ritrova il logit di base, 0.3', vicino(l.coef[0].stima, 0.3, 0.1));
  ok('e l effetto, 1.2', vicino(l.coef[1].stima, 1.2, 0.15) && l.coef[1].lo < 1.2 && l.coef[1].hi > 1.2);
  /* separazione perfetta: senza cresta scapperebbe all'infinito */
  const s = ST.logistica([[1, 0.5], [1, 0.5], [1, -0.5], [1, -0.5]], [1, 1, 0, 0], ['c', 'a']);
  ok('con la separazione perfetta la cresta tiene la stima finita', Number.isFinite(s.coef[1].stima) && s.coef[1].stima < 20);
}

console.log('\nil restringimento beta-binomiale');
{
  /* dieci posti che sono tutti lo stesso posto: le differenze sono caso */
  const r = lcg(3);
  const uguali = Array.from({ length: 10 }, () => {
    const n = 20; let k = 0;
    for (let i = 0; i < n; i++) k += +(r() < 0.6);
    return { n, k };
  });
  const R = ST.restringi(uguali);
  const spread = Math.max(...R.gruppi.map(x => x.post)) - Math.min(...R.gruppi.map(x => x.post));
  const grezzo = Math.max(...uguali.map(x => x.k / x.n)) - Math.min(...uguali.map(x => x.k / x.n));
  ok(`posti tutti uguali: il restringimento schiaccia le differenze (${grezzo.toFixed(2)} → ${spread.toFixed(3)})`,
     spread < grezzo / 3);
  /* posti davvero diversi, con tante partite: restano diversi */
  const diversi = [0.2, 0.4, 0.6, 0.8].map(p => ({ n: 400, k: Math.round(400 * p) }));
  const D = ST.restringi(diversi);
  ok('posti davvero diversi e ben misurati restano quasi dove sono',
     D.gruppi.every((x, i) => vicino(x.post, [0.2, 0.4, 0.6, 0.8][i], 0.02)));
  /* poche partite contro tante, stessa proporzione grezza */
  const misti = [{ n: 4, k: 4 }, { n: 200, k: 150 }, { n: 200, k: 50 }, { n: 200, k: 100 }];
  const Mi = ST.restringi(misti);
  ok('quattro su quattro torna verso la media più di 150 su 200',
     Mi.gruppi[0].post < 0.95 && Math.abs(Mi.gruppi[0].post - Mi.media) / Math.abs(1 - Mi.media) <
                                 Math.abs(Mi.gruppi[1].post - Mi.media) / Math.abs(0.75 - Mi.media) + 1);
  ok('e l ordine fra quelli ben misurati resta', Mi.gruppi[1].post > Mi.gruppi[3].post && Mi.gruppi[3].post > Mi.gruppi[2].post);
  ok('una media data da fuori si rispetta', ST.restringi(uguali, { media: 0.5 }).media === 0.5);
}

console.log('\nBenjamini-Hochberg');
{
  /* l'esempio dell'articolo del 1995: quindici p, al 5% ne reggono quattro */
  const ps = [0.0001, 0.0004, 0.0019, 0.0095, 0.0201, 0.0278, 0.0298, 0.0344, 0.0459, 0.324, 0.4262, 0.5719, 0.6528, 0.759, 1];
  const r5 = ST.bh(ps, 0.05);
  ok('l esempio di Benjamini e Hochberg: al 5% reggono i primi quattro',
     r5.filter(Boolean).length === 4 && r5.slice(0, 4).every(Boolean));
  ok('dodici p intorno a 0.04 non reggono tutti per caso', ST.bh(Array(12).fill(0.04).concat([0.9]), 0.1).every(x => x) === false);
  ok('l ordine in cui arrivano non conta', ST.bh([0.9, 0.001, 0.5], 0.1).join() === 'false,true,false');
}

console.log(fails ? `\n${fails} prove fallite` : '\ntutte le prove passano');
process.exit(fails ? 1 : 0);
