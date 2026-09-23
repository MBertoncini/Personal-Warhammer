/* Schieramento Old World — i conti di chi guarda tante partite
 *
 * Trecento partite dell'euristica sono un campione, e un campione si
 * legge con gli strumenti di un campione. Prima la serie stampava
 * percentuali divise a meta' sulla mediana e la mappa colorava ogni
 * casella per conto suo: la prova della lista contro se stessa ha
 * mostrato «sinistra 24%, centro-sinistra 62%» su una scelta che per
 * costruzione non poteva contare niente. Erano dodici confronti fatti
 * in fila, e su dodici uno spettacolare esce sempre.
 *
 * Qui stanno le cinque cose che servono per non farsi ingannare, tutte
 * senza dipendenze e senza dadi:
 *
 *   `wilson`       l'intervallo di una proporzione, che regge anche a
 *                  zero e a cento per cento;
 *   `ols`          la regressione lineare con gli errori standard —
 *                  sullo scarto di punti vittoria, che dice molto piu'
 *                  di vinto/perso;
 *   `logistica`    la stessa cosa sulla vittoria, con Newton (IRLS);
 *   `restringi`    il restringimento beta-binomiale: una casella con
 *                  quattro partite non puo' gridare quanto una con
 *                  ottanta, e qui si avvicina alla media da sola;
 *   `bh`           Benjamini-Hochberg: di tanti confronti, quali
 *                  reggono controllando la quota di falsi allarmi.
 */

export const Z95 = 1.959963984540054;

/* ---- una proporzione ---- */
export function wilson(k, n, z = Z95){
  if (!n) return { p: NaN, lo: 0, hi: 1 };
  const p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d;
  const m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { p, lo: Math.max(0, c - m), hi: Math.min(1, c + m) };
}
export const pc = x => `${Math.round(100 * x)}%`;
export const intervallo = w => `${Math.round(100 * w.lo)}–${Math.round(100 * w.hi)}%`;

/* ---- la normale: la coda, per i valori p ---- */
export function phi(x){
  /* Abramowitz-Stegun 7.1.26 sull'erf: basta e avanza per un p */
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t *
            Math.exp(-x * x / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
export const pDueCode = z => 2 * (1 - phi(Math.abs(z)));

/* ---- algebra piccola: matrici come array di righe ---- */
function inversa(M){
  const n = M.length;
  const A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]);
  for (let c = 0; c < n; c++){
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;             // singolare: una colonna ripete le altre
    [A[c], A[piv]] = [A[piv], A[c]];
    const v = A[c][c];
    for (let j = 0; j < 2 * n; j++) A[c][j] /= v;
    for (let r = 0; r < n; r++){
      if (r === c) continue;
      const f = A[r][c];
      if (f) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map(r => r.slice(n));
}
const xtwx = (X, w) => {
  const k = X[0].length, M = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < X.length; i++){
    const xi = X[i], wi = w ? w[i] : 1;
    for (let a = 0; a < k; a++){ const v = xi[a] * wi; if (v) for (let b = 0; b < k; b++) M[a][b] += v * xi[b]; }
  }
  return M;
};

/* Una colonna costante o che ripete un'altra rende la matrice
   singolare: si tolgono prima, e si dice quali. Succede davvero —
   un'unita' che parte sempre dalla stessa colonna, un piano che non
   cambia mai. */
function colonneUtili(X, nomi){
  const k = X[0].length, tiene = [];
  for (let j = 0; j < k; j++){
    const prova = [...tiene, j];
    const M = xtwx(X.map(r => prova.map(c => r[c])));
    if (inversa(M)) tiene.push(j);
  }
  return { tiene, tolte: nomi.filter((_, j) => !tiene.includes(j)) };
}

const tabella = (nomi, beta, se) => nomi.map((nome, j) => {
  const z = se[j] > 0 ? beta[j] / se[j] : 0;
  return { nome, stima: beta[j], se: se[j], lo: beta[j] - Z95 * se[j], hi: beta[j] + Z95 * se[j], z, p: pDueCode(z) };
});

/* Minimi quadrati, con l'intercetta messa da chi chiama (una colonna di
   uni). Gli errori standard sono quelli robusti di White (HC1): lo
   scarto di punti di una partita a Old World non e' una campana, e ha
   code grosse — le vittorie schiaccianti. */
export function ols(X, y, nomi){
  const { tiene, tolte } = colonneUtili(X, nomi);
  const Xr = X.map(r => tiene.map(c => r[c])), n = Xr.length, k = tiene.length;
  const inv = inversa(xtwx(Xr));
  const xty = new Array(k).fill(0);
  for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) xty[a] += Xr[i][a] * y[i];
  const beta = inv.map(r => r.reduce((s, v, j) => s + v * xty[j], 0));
  const res = Xr.map((r, i) => y[i] - r.reduce((s, v, j) => s + v * beta[j], 0));
  const meat = xtwx(Xr, res.map(e => e * e));
  const V = inv.map(r => inv[0].map((_, b) => r.reduce((s, v, j) => s + v * meat[j].reduce((t, m, l) => t + m * inv[l][b], 0), 0)));
  const scala = n > k ? n / (n - k) : 1;
  const se = V.map((r, j) => Math.sqrt(Math.max(0, r[j] * scala)));
  return { coef: tabella(tiene.map(c => nomi[c]), beta, se), tolte, n };
}

/* Regressione logistica con Newton-Raphson. Con poche partite e una
   variabile che separa perfettamente (quella scelta ha sempre vinto) le
   stime scappano all'infinito: una piccola penalita' di cresta le tiene
   al guinzaglio, ed e' la stessa cosa che dire «prima di vedere i dati
   un effetto enorme e' improbabile». */
export function logistica(X, y, nomi, { cresta = 0.1, giri = 50 } = {}){
  const { tiene, tolte } = colonneUtili(X, nomi);
  const Xr = X.map(r => tiene.map(c => r[c])), n = Xr.length, k = tiene.length;
  let beta = new Array(k).fill(0), inv = null;
  for (let g = 0; g < giri; g++){
    const p = Xr.map(r => 1 / (1 + Math.exp(-r.reduce((s, v, j) => s + v * beta[j], 0))));
    const w = p.map(q => Math.max(1e-9, q * (1 - q)));
    const H = xtwx(Xr, w);
    for (let j = 1; j < k; j++) H[j][j] += cresta;           // l'intercetta non si penalizza
    const grad = new Array(k).fill(0);
    for (let i = 0; i < n; i++) for (let a = 0; a < k; a++) grad[a] += Xr[i][a] * (y[i] - p[i]);
    for (let j = 1; j < k; j++) grad[j] -= cresta * beta[j];
    inv = inversa(H);
    if (!inv) break;
    const passo = inv.map(r => r.reduce((s, v, j) => s + v * grad[j], 0));
    beta = beta.map((b, j) => b + passo[j]);
    if (Math.max(...passo.map(Math.abs)) < 1e-8) break;
  }
  const se = inv ? inv.map((r, j) => Math.sqrt(Math.max(0, r[j]))) : beta.map(() => NaN);
  return { coef: tabella(tiene.map(c => nomi[c]), beta, se), tolte, n };
}

/* ---- il restringimento beta-binomiale ----
   Tante proporzioni k_i/n_i della stessa famiglia (i posti di
   un'unita', le caselle di una mappa). Si stima dai dati stessi quanto
   variano davvero intorno alla media — il metodo dei momenti sulla
   beta — e ogni proporzione si avvicina alla media tanto piu' quanto ha
   meno partite: la media a posteriori e' (k + a) / (n + a + b).

   Se le proporzioni non variano piu' di quanto farebbe il caso, la
   varianza vera stimata e' zero e tutte finiscono sulla media: e' la
   risposta giusta, «qui non c'e' niente da vedere». */
export function restringi(gruppi, { media = null } = {}){
  const g = gruppi.filter(x => x.n > 0);
  const N = g.reduce((s, x) => s + x.n, 0);
  const m = media != null ? media : (N ? g.reduce((s, x) => s + x.k, 0) / N : 0.5);
  if (g.length < 2 || m <= 0 || m >= 1){
    return { media: m, forza: Infinity, gruppi: gruppi.map(x => ({ ...x, post: m, sd: 0 })) };
  }
  /* la varianza osservata, pesata, meno quella che darebbe il caso */
  const osservata = g.reduce((s, x) => s + x.n * (x.k / x.n - m) ** 2, 0) / N;
  const dalCaso = m * (1 - m) * g.length / N;
  const vera = Math.max(0, osservata - dalCaso);
  /* a + b = m(1-m)/vera - 1: quante «partite finte» vale la media */
  const forza = vera > 0 ? Math.max(0.5, m * (1 - m) / vera - 1) : 1e6;
  const a = m * forza, b = (1 - m) * forza;
  return {
    media: m, forza,
    gruppi: gruppi.map(x => {
      const A = x.k + a, B = x.n - x.k + b;
      return { ...x, post: A / (A + B), sd: Math.sqrt(A * B / ((A + B) ** 2 * (A + B + 1))) };
    }),
  };
}

/* ---- Benjamini-Hochberg ----
   Dati tanti valori p, quali si tengono con una quota attesa di falsi
   allarmi non oltre q. Torna, per ciascuno, se regge. */
export function bh(ps, q = 0.1){
  const ord = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  let soglia = -1;
  ord.forEach((x, r) => { if (x.p <= q * (r + 1) / ps.length) soglia = r; });
  const regge = new Array(ps.length).fill(false);
  for (let r = 0; r <= soglia; r++) regge[ord[r].i] = true;
  return regge;
}

/* media e deviazione standard, e l'errore standard della media */
export function media(v){
  const n = v.length;
  if (!n) return { m: NaN, sd: NaN, se: NaN, n: 0 };
  const m = v.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)) : 0;
  return { m, sd, se: sd / Math.sqrt(n), n };
}
