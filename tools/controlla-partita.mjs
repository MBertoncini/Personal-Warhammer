/* Schieramento Old World — il controllo di una partita guardata
 *
 * Una pagina scritta da `partita.mjs --html` contiene la partita intera:
 * dove stava ogni unita' a ogni fotogramma e ogni riga di registro con i
 * suoi dadi. Questo strumento la rilegge e cerca le cose che una partita
 * giusta non fa mai. Sono le anomalie che hanno reso inutile la prima
 * partita fra due modelli:
 *
 *   - dadi che non escono uno su sei (il generatore con il seme era rotto);
 *   - due unita' una dentro l'altra (il movimento non guardava nessuno);
 *   - unita' fuori dal tavolo che restano in gioco;
 *   - chi cede terreno «dopo 0″» e chi ripiega uscendo a mezzo tavolo
 *     (il controllo del bordo leggeva i campi sbagliati);
 *   - «ha mosso» sul tiro di chi era rimasto fermo;
 *   - fotogrammi vuoti uguali al precedente.
 *
 * Si lancia cosi':   node tools/controlla-partita.mjs partita.html
 * Esce con 1 se trova qualcosa, e dice cosa e dove.
 */
import fs from 'node:fs';

const file = process.argv[2] || 'partita.html';
const html = fs.readFileSync(file, 'utf8');
const riga = html.split('\n').find(l => l.startsWith('const P = '));
if (!riga){ console.error(`${file}: non trovo i dati della partita.`); process.exit(2); }
const P = JSON.parse(riga.slice('const P = '.length).replace(/;\s*$/, ''));

const problemi = [];
const dillo = (k, text) => problemi.push(`#${k} ${text}`);

/* ---- la geometria dei rettangoli, come la disegna la pagina ---- */
const angoli = u => {
  const a = u.r * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) =>
    [u.x + i * u.w / 2 * c - j * u.h / 2 * s, u.y + i * u.w / 2 * s + j * u.h / 2 * c]);
};
/* quanto si compenetrano due rettangoli, in millimetri (0 se no) */
function dentro(a, b){
  const A = angoli(a), B = angoli(b);
  let min = Infinity;
  for (const poly of [A, B]){
    for (let i = 0; i < 4; i++){
      const p = poly[i], q = poly[(i + 1) % 4];
      const n = [q[1] - p[1], p[0] - q[0]], l = Math.hypot(...n);
      const pr = P2 => P2.map(v => (v[0] * n[0] + v[1] * n[1]) / l);
      const pa = pr(A), pb = pr(B);
      const o = Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (o <= 0) return 0;
      min = Math.min(min, o);
    }
  }
  return min;
}

/* ---- fotogramma per fotogramma ---- */
const TOLL = 1.5;           // millimetri: sotto, e' arrotondamento
const visti = new Set();
P.frames.forEach((f, k) => {
  const us = f.unita;
  for (let i = 0; i < us.length; i++){
    for (let j = i + 1; j < us.length; j++){
      const d = dentro(us[i], us[j]);
      const chiave = `${us[i].n}|${us[j].n}`;
      if (d > TOLL && !visti.has(chiave)){
        visti.add(chiave);
        dillo(k, `${us[i].n} e ${us[j].n} si sovrappongono di ${d.toFixed(0)} mm`);
      }
    }
    const fuori = angoli(us[i]).some(([x, y]) => x < -TOLL || y < -TOLL ||
                                                 x > P.meta.w + TOLL || y > P.meta.h + TOLL);
    if (fuori) dillo(k, `${us[i].n} sta fuori dal tavolo`);
  }
  for (const r of f.testo){
    /* la distanza dal bordo di un'unita', nel fotogramma prima */
    const margine = nome => {
      const u = (P.frames[k - 1] || f).unita.find(x => x.n === nome);
      if (!u) return null;
      const m = Math.min(...angoli(u).flatMap(([x, y]) => [x, y, P.meta.w - x, P.meta.h - y]));
      return m / 25.4;
    };
    /* cedere terreno di zero si puo', ma solo contro qualcosa: la
       vecchia versione lo scriveva a mezzo tavolo e senza motivo */
    const zero = /^(.*?) (?:arriva al bordo del tavolo e )?(?:si ferma dopo|cede terreno di) 0″(.*)$/.exec(r.t);
    if (zero && !/si ferma contro (?!il bordo)/.test(zero[2])){
      const m = margine(zero[1]);
      if (m == null || m > 3) dillo(k, `cede terreno senza muoversi, lontano dal bordo: «${r.t}»`);
    }
    const esce = /^(.*?) ripiega(?: di ([\d.]+)″)?.*esce dal tavolo/.exec(r.t);
    if (esce){
      /* si esce solo se il tratto fatto arriva al bordo: il margine e'
         quello dell'angolo piu' vicino */
      const m = margine(esce[1]);
      /* le pagine vecchie non scrivevano il tratto: 12″ e' il massimo di 2D6 */
      const tratto = esce[2] != null ? +esce[2] : 12;
      if (m != null && m > tratto + 1) dillo(k, `${esce[1]} esce ripiegando di ${tratto}″ da ${m.toFixed(0)}″ dal bordo`);
    }
  }
  if (k > 0 && !f.testo.length && !f.perche &&
      JSON.stringify(f.unita) === JSON.stringify(P.frames[k - 1].unita))
    dillo(k, 'fotogramma vuoto, uguale al precedente');
});

/* ---- chi e' rimasto fermo e poi tira come se avesse mosso ---- */
const fermi = new Map();
P.frames.forEach((f, k) => {
  for (const r of f.testo){
    const m = /^(.*) resta ferma\./.exec(r.t);
    if (m) fermi.set(m[1], f.turno);
    const t = /^(.*) tira su .*ha mosso/.exec(r.t);
    if (t && fermi.get(t[1]) === f.turno) dillo(k, `${t[1]} è rimasta ferma ma tira con «ha mosso»`);
  }
  if (/raduno/.test(f.casella)) for (const [n, turno] of fermi) if (turno !== f.turno) fermi.delete(n);
});

/* ---- i dadi ---- */
const facce = [0, 0, 0, 0, 0, 0];
for (const f of P.frames) for (const r of f.testo)
  for (const d of (r.g ? r.g.flatMap(x => x.d) : r.d || [])) if (d >= 1 && d <= 6) facce[d - 1]++;
const tot = facce.reduce((s, v) => s + v, 0);
if (tot >= 60){
  /* Chi quadro con cinque gradi di liberta'. Le facce registrate non
     sono tutte tiri liberi — un ritiro sostituisce i dadi falliti, e il
     mucchio che resta pende verso i successi — quindi la soglia e' alta:
     40 con dadi onesti non esce in una vita, e il generatore rotto
     faceva quasi 300. Una faccia che non esce mai si dice comunque. */
  const atteso = tot / 6;
  const chi2 = facce.reduce((s, v) => s + (v - atteso) ** 2 / atteso, 0);
  const manca = tot >= 120 && facce.some(v => v < atteso / 5);
  if (chi2 > 40 || manca)
    problemi.push(`dadi sbilanciati: ${facce.map((v, i) => `${i + 1}:${v}`).join(' ')} (chi² ${chi2.toFixed(1)})`);
}

console.log(`${file}: ${P.frames.length} fotogrammi, ${tot} dadi (${facce.map((v, i) => `${i + 1}:${v}`).join(' ')})`);
if (!problemi.length){ console.log('nessuna anomalia'); process.exit(0); }
console.log(`${problemi.length} anomalie:`);
for (const p of problemi) console.log('  · ' + p);
process.exit(1);
