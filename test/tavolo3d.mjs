/* Il tavolo 3D senza three.js (src/tavolo3d.js): quanto sale il suolo,
 * dove si appoggia una basetta, chi sta in un bosco, che cosa si legge.
 *
 * La prova che conta e' quella dell'appoggio: una basetta su una
 * collina tocca il suolo e non ci entra. Se il conto della quota e
 * quello della forma disegnata si separassero, le miniature
 * affonderebbero fino alla vita — com'era con la mezza sfera di prima.
 *
 * Si lancia con:  node test/tavolo3d.mjs
 */
import { quota, appoggio, occupati, raggio, bordoCollina, altezzaCollina, profilo,
         etichetta, schedaHTML, terrenoHTML, LASTRA } from '../src/tavolo3d.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};
const vicino = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const collina = { kind: 'hill', forma: 'rect', x: 600, y: 400, w: 254, h: 152, rot: 0 };
const tonda = { kind: 'hill', forma: 'circle', x: 300, y: 300, w: 200, h: 200, rot: 0 };
const bosco = { kind: 'wood', forma: 'circle', x: 900, y: 300, w: 200, h: 160, rot: 30 };
const T = [collina, tonda, bosco];
const H = altezzaCollina(collina);

/* ---- la quota ---- */
ok('il tavolo nudo e\' a quota zero', quota(T, 50, 50) === 0);
ok('la cima della collina e\' alta quanto la collina', vicino(quota(T, 600, 400), H));
ok('la collina ha una cima piatta', vicino(quota(T, 600 + 20, 400), H));
ok('al piede la collina tocca il tavolo', quota(T, 600 + 127 * .999, 400) < .01);
ok('fuori dalla collina il suolo torna piatto', quota(T, 600 + 140, 400) === 0);
ok('la collina scende sempre, dalla cima al piede', (() => {
  let prima = Infinity;
  for (let x = 0; x <= 127; x += 4){ const q = quota(T, 600 + x, 400); if (q > prima + 1e-9) return false; prima = q; }
  return true;
})());
ok('una collina non e\' una montagna: al massimo quattro centimetri', altezzaCollina({ w: 2000, h: 2000 }) === 40);
ok('il profilo vale 1 in cima e 0 sul bordo', profilo(0) === 1 && profilo(1) === 0);
ok('nel bosco si sale sulla sua lastra', quota(T, 900, 300) === LASTRA.wood);

/* la forma che si disegna e' quella che si misura */
ok('il bordo della collina disegnata e\' dove la quota si annulla', [0, .4, .9, 1.6, 2.5, 3.9, 5.2].every(a => {
  const [u, v] = bordoCollina(collina, a);
  return vicino(raggio(collina, collina.x + u * collina.w / 2, collina.y + v * collina.h / 2), 1, 1e-9);
}));
ok('una collina girata di 90 gradi e\' quella lunga per l\'altro verso', (() => {
  const g = { ...collina, rot: 90 }, d = { ...collina, w: collina.h, h: collina.w };
  return [[10, 50], [-40, 20], [60, -60]].every(([dx, dy]) => vicino(quota([g], 600 + dx, 400 + dy), quota([d], 600 + dx, 400 + dy), 1e-9));
})());

/* ---- l'appoggio ---- */
const piano = appoggio(T, 50, 50, 25, 25, 0);
ok('sul tavolo piatto la basetta sta a zero e dritta', piano.z === 0 && piano.gx === 0 && piano.gy === 0);
/* tocca e non entra: il piano della basetta non scende mai sotto il
   suolo, e in almeno un punto lo tocca */
function tocca(x, y, w, h, rot){
  const ap = appoggio(T, x, y, w, h, rot);
  const a = rot * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
  let minimo = Infinity;
  for (let i = -1; i <= 1; i += .25) for (let j = -1; j <= 1; j += .25){
    const lx = i * w / 2, ly = j * h / 2;
    const px = x + lx * co - ly * si, py = y + lx * si + ly * co;
    const piano = ap.z + ap.gx * (px - x) + ap.gy * (py - y);
    minimo = Math.min(minimo, piano - quota(T, px, py));
  }
  return { ap, minimo };
}
for (const [x, y, w, h, rot, cosa] of [
  [600 + 70, 400, 25, 25, 0, 'fanteria sul fianco della collina'],
  [600 - 90, 400 + 30, 50, 100, 35, 'un carro di traverso sul pendio'],
  [300 + 80, 300 + 10, 25, 50, 90, 'un cavaliere sul piede della collina tonda'],
  [600 + 118, 400 - 60, 40, 40, 10, 'un mostro a cavallo del bordo'],
]){
  const { ap, minimo } = tocca(x, y, w, h, rot);
  ok(`${cosa}: non entra nella collina (scarto ${minimo.toFixed(2)} mm)`, minimo > -.3);
  ok(`${cosa}: la tocca (${ap.z.toFixed(1)} mm)`, minimo < 1.5 && ap.z > 0);
}
const fianco = appoggio(T, 600 + 70, 400, 25, 25, 0);
ok('sul fianco est la basetta pende verso est', fianco.gx < 0 && Math.abs(fianco.gy) < 1e-9);
const girata = appoggio(T, 600 + 70, 400, 25, 25, 90);
ok('la pendenza non dipende da come e\' girata la basetta', vicino(girata.gx, fianco.gx, 1e-9) && vicino(girata.gy, 0, 1e-9));
ok('il pendio non supera i trentacinque gradi', (() => {
  for (let x = -130; x <= 130; x += 5){
    const a = appoggio(T, 600 + x, 400, 20, 20, 0);
    if (Math.atan(Math.hypot(a.gx, a.gy)) > 35 * Math.PI / 180) return false;
  }
  return true;
})());

/* ---- chi sta nel bosco ---- */
ok('chi sta nel bosco lo fa diventare trasparente', occupati(T, [[900, 300]]).has(2));
ok('chi e\' fuori no', occupati(T, [[900, 420], [50, 50]]).size === 0);
ok('una collina non si fa trasparente', !occupati(T, [[600, 400]]).has(0));
ok('il bosco girato si misura girato', occupati([bosco], [[900 + 90 * Math.cos(Math.PI / 6), 300 + 90 * Math.sin(Math.PI / 6)]]).has(0)
   && !occupati([bosco], [[900 + 90 * Math.cos(Math.PI * 2 / 3), 300 + 90 * Math.sin(Math.PI * 2 / 3)]]).has(0));

/* ---- che cosa si legge ---- */
const clan = { uid: 7, nome: 'Clanrats 2', esercito: 'B',
  celle: [{ char: false }, { char: false }, { char: true, nome: 'Chieftain' }],
  info: { vivi: 14, totale: 20, tipo: 'Fanteria', mischia: true } };
ok('l\'etichetta dice i modelli rimasti come il disegno 2D', etichetta(clan) === 'Clanrats 14/20 ⚔');
ok('le ferite: quelle che restano su quelle che ha', etichetta({ nome: 'Carnosaur', celle: [{}],
  info: { vivi: 1, totale: 1, ferite: { prese: 2, per: 7 }, fuga: true } }) === 'Carnosaur ♥5/7 ⚑');
const scheda = schedaHTML(clan, { nomi: { B: 'Skaven' } });
ok('la scheda dice quanti ne restano e quanti ne sono caduti', scheda.includes('<b>14</b> modelli su 20') && scheda.includes('−6'));
ok('e chi c\'e\' unito, e l\'esercito', scheda.includes('con Chieftain') && scheda.includes('Skaven'));
ok('passando sopra il capo si parla del capo', schedaHTML(clan, { cella: clan.celle[2] }).startsWith('<b>Chieftain</b>'));
ok('senza info i modelli si contano dalle basette', etichetta({ nome: 'Gor', celle: [{}, {}, {}] }) === 'Gor 3/3');
ok('i nomi che vengono da fuori non diventano HTML', !schedaHTML({ nome: '<img>', celle: [] }).includes('<img>'));
ok('il terreno dice che cosa fa', terrenoHTML({ label: 'Bosco', cat: 'Terreno difficile', righe: ['−1 al Movimento'] })
   .includes('<li>−1 al Movimento</li>'));

console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
