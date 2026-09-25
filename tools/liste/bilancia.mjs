/* Schieramento Old World — liste che si battono alla pari
 *
 *   node tools/liste/bilancia.mjs [--punti 1000] [--temi fazione:tema,fazione:tema,...]
 *        [--passi 12] [--candidate 8] [--semi 2] [--scenari sei] [--seme 9001]
 *        [--lavori 7] [--da-capo] [--verifica 4] [--semi-tabella 2] [--tabella-salvata] [--solo fazione:tema,...]
 *
 * Le ricerche (cerca.mjs) trovano per ogni tema la lista più forte contro
 * le migliori degli altri temi. Per giocarle fra amici serve un'altra
 * cosa: che nessuna partita sia decisa prima di schierare. Una ricerca che
 * vince il 70% contro tutte è una buona lista e una serata noiosa per chi
 * sta dall'altra parte.
 *
 * Qui le liste migliori dei temi si prendono tutte insieme, e si ritoccano
 * una alla volta finché ognuna vince più o meno quanto perde:
 *
 *   1. si misura la tabella: ogni lista contro ogni lista di un'altra
 *      fazione (due liste della stessa fazione, con la collezione, non si
 *      schierano insieme: hanno bisogno degli stessi modelli), su tutti
 *      gli scenari, a specchio;
 *   2. si sceglie la lista più lontana dal 50%, e se ne provano alcune
 *      varianti (`muta` dello spazio del suo tema: un reggimento più
 *      grande o più piccolo, un'opzione, un'unità scambiata, aggiunta o
 *      tolta) contro le stesse avversarie, sugli stessi semi — così la
 *      differenza fra due varianti è la lista e non i dadi;
 *   3. vince la variante che porta TUTTE le sue partite più vicine al 50%
 *      (non solo la media: vincere sempre contro uno e perdere sempre
 *      contro l'altro fa 50% e due serate noiose), e che resta varia —
 *      almeno quattro unità diverse, e poche partite che finiscono pari;
 *   4. la variante scelta si rigioca su semi nuovi prima di entrare nella
 *      tabella: scelta fra otto, la più vicina al 50% lo è anche un po'
 *      per fortuna, e quella fortuna non deve restare nei conti.
 *
 * Alla fine le liste si giocano tutte contro tutte su --verifica semi mai
 * usati, e la tabella va in dati/ricerche/torneo-<punti>.json come quella
 * del torneo: la scheda Laboratorio la disegna. Il lavoro sta in
 * dati/ricerche/bilancia-<punti>.json, e si riprende da lì (--da-capo lo
 * butta via).
 *
 * I temi di default sono tutte le ricerche a tema a questi punti con la
 * collezione, due per fazione.
 */
import fs from 'node:fs';
import path from 'node:path';
import { apriMotore, SEI, scenariTutti, REPO } from './motore.mjs';
import { spazio, FAZIONI } from './spazio.mjs';
import { scrivi, leggi, tutte } from './ricerche.mjs';

const argv = process.argv.slice(2);
const arg = (k, def) => { const i = argv.indexOf('--' + k); return i < 0 ? def : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const punti = +arg('punti', 1000);
const passi = +arg('passi', 12), K = +arg('candidate', 8), semi = +arg('semi', 2), semiVerifica = +arg('verifica', 4);
const semeBase = +arg('seme', 9001);
const TUTTI = await scenariTutti();
const sc = String(arg('scenari', 'sei'));
const scenari = sc === 'sei' ? SEI : sc === 'tutti' ? Object.keys(TUTTI) : sc.split(',');
const FILE = `bilancia-${punti}.json`;

/* ---------------- le liste di partenza ---------------- */
const ricerche = tutte().filter(({ doc }) => doc.formato === 'tow-ricerca/1' && doc.punti === punti && doc.pool === 'collezione' && doc.tema && (doc.migliori || []).length);
const scelti = arg('temi', null) ? String(arg('temi')).split(',').map(s => s.split(':')) : null;
const temi = ricerche.filter(({ doc }) => !scelti || scelti.some(([f, t]) => f === doc.fazione && t === doc.tema.nome))
  .map(({ file, doc }) => ({ file, fazione: doc.fazione, tema: doc.tema, geni: doc.migliori[0].geni }))
  .sort((a, b) => Object.keys(FAZIONI).indexOf(a.fazione) - Object.keys(FAZIONI).indexOf(b.fazione) || a.tema.nome.localeCompare(b.tema.nome));
if (temi.length < 2){ console.error(`A ${punti} punti ci sono ${temi.length} ricerche a tema con la collezione: ne servono almeno due di fazioni diverse.`); process.exit(1); }

const prima = arg('da-capo', false) === true ? null : leggi(FILE);
const L = temi.map((t, i) => {
  const S = spazio(t.fazione, { pool: 'collezione', punti, con: t.tema.con || [], senza: t.tema.senza || [] });
  const ripresa = prima && (prima.liste || []).find(x => x.fazione === t.fazione && x.tema === t.tema.nome);
  const geni = ripresa && !S.valida(ripresa.geni).length ? ripresa.geni : t.geni;
  const err = S.valida(geni);
  if (err.length){ console.error(`${t.fazione} «${t.tema.nome}»: la lista di partenza non vale più (${err.join('; ')})`); process.exit(1); }
  return { i, fazione: t.fazione, tema: t.tema.nome, S, geni, nome: `${FAZIONI[t.fazione].sigla} ${t.tema.nome}` };
});
const incrocio = (a, b) => L[a].fazione !== L[b].fazione;
/* --solo: le sole liste che si possono ritoccare; le altre giocano e basta.
   Serve quando un tema è arrivato al suo tetto e il giro continuerebbe a
   sceglierlo perché è il più lontano dal 50%. */
const solo = arg('solo', null) ? String(arg('solo')).split(',').map(s => s.split(':')) : null;

/* ---------------- i conti ---------------- */
const vuoto = () => ({ w: 0, l: 0, d: 0, n: 0 });
const somma = (t, r, giro = false) => { t.w += giro ? r.l : r.w; t.l += giro ? r.w : r.l; t.d += r.d; t.n += r.n; return t; };
const quota = c => c.n ? (c.w + c.d / 2) / c.n : 0.5;
const pc = x => Math.round(100 * x);
/* M[a][b]: le partite di a contro b, dal punto di vista di a */
let M = L.map(() => L.map(() => vuoto()));
const media = a => { const t = vuoto(); L.forEach((_, b) => { if (b !== a && incrocio(a, b)) somma(t, M[a][b]); }); return quota(t); };

/* quanto è lontana dal 50% una lista: la media, e ogni partita presa da
   sola. Le partite contano doppio della media: 50% fatto di 90 e 10 non
   è equilibrio. Poi la varietà, e le partite che finiscono pari (una
   lista che scappa e non combatte fa pari, e annoia). */
const tipi = (S, geni) => new Set(geni.filter(g => !/Characters/.test(S.voce(g).slot)).map(g => g.k)).size;
function distanza(righe, S, geni){
  const tot = righe.reduce((t, r) => somma(t, r), vuoto());
  const coppie = righe.reduce((s, r) => s + (quota(r) - 0.5) ** 2, 0) / Math.max(1, righe.length);
  const pari = tot.n ? tot.d / tot.n : 0;
  return (quota(tot) - 0.5) ** 2 + 2 * coppie + Math.max(0, 4 - tipi(S, geni)) * 0.004 + Math.max(0, pari - 0.2) * 0.05;
}

const motore = await apriMotore({ lavori: +arg('lavori', 0) || undefined });
let giocate = 0;
const t0 = Date.now();
const durata = () => { const s = Math.round((Date.now() - t0) / 1000); return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`; };

/* una lista (con i geni dati) contro le avversarie `contro`, su tutti gli
   scenari, `k` semi a specchio dal seme `seme`: una riga per avversaria */
async function contro(a, geni, avversarie, k, seme){
  const x = L[a].S.costruisci(geni, { id: `b-${a}`, name: L[a].nome });
  const righe = avversarie.map(() => vuoto());
  await Promise.all(avversarie.flatMap((b, j) => scenari.map(s =>
    motore.gioca({ x, y: L[b].lista, scenario: s, partite: k, seme }).then(r => {
      somma(righe[j], { w: r.vince.x, l: r.vince.y, d: r.pari, n: r.n });
      giocate += r.n;
    }))));
  return righe;
}
const costruisci = () => L.forEach(l => { l.lista = l.S.costruisci(l.geni, { id: `b-${l.i}`, name: l.nome }); });

/* la tabella intera, su semi `seme`…: una serie per coppia di liste di
   fazioni diverse e per scenario, e M si riempie dai due lati. Le celle
   per scenario restano per la scheda Laboratorio. */
let perScenario = {};
async function tabella(k, seme){
  costruisci();
  M = L.map(() => L.map(() => vuoto()));
  perScenario = {};
  const lavori = [];
  for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++){
    if (!incrocio(a, b)) continue;
    for (const s of scenari) lavori.push(motore.gioca({ x: L[a].lista, y: L[b].lista, scenario: s, partite: k, seme }).then(r => {
      const c = { w: r.vince.x, l: r.vince.y, d: r.pari, n: r.n };
      somma(M[a][b], c); somma(M[b][a], c, true);
      perScenario[`${s}|b-${a}|b-${b}`] = c;
      giocate += r.n;
    }));
  }
  await Promise.all(lavori);
}
function stampa(titolo){
  console.log(`\n${titolo}  (${giocate} partite, ${durata()})`);
  console.log('                          ' + L.map((_, j) => String(j + 1).padStart(4)).join('') + '   media');
  L.forEach((l, a) => console.log(`  ${String(a + 1).padStart(2)} ${l.nome.padEnd(22)}` +
    L.map((_, b) => a === b || !incrocio(a, b) ? '   ·' : String(pc(quota(M[a][b]))).padStart(4)).join('') + `   ${pc(media(a))}%`));
}
function salva(storia){
  scrivi(FILE, {
    formato: 'tow-bilancia/1', quando: new Date().toISOString(), punti, scenari, semi,
    liste: L.map(l => ({ fazione: l.fazione, tema: l.tema, nome: l.nome, geni: l.geni, descrizione: l.S.descrivi(l.geni), punti: l.S.totale(l.geni),
      media: media(l.i) })),
    matrice: M, storia,
  });
}

/* ---------------- il giro ---------------- */
const storia = (prima && prima.storia) || [];
/* --tabella-salvata: la tabella della volta prima, se le liste sono
   ancora quelle — dopo una verifica grande è il dato migliore che c'è,
   e rigiocarne una piccola lo butterebbe via */
const stesse = prima && Array.isArray(prima.matrice) && prima.matrice.length === L.length &&
  L.every(l => { const r = prima.liste.find(x => x.fazione === l.fazione && x.tema === l.tema); return r && l.S.chiave(r.geni) === l.S.chiave(l.geni); });
if (arg('tabella-salvata', false) === true && stesse){ costruisci(); M = prima.matrice; }
else await tabella(+arg('semi-tabella', semi), semeBase);
stampa('La tabella di partenza');
const tabu = new Map();
for (let p = 0; p < passi; p++){
  /* chi ritoccare: la più lontana dal 50% (media e partite), che non sia
     appena rimasta com'era */
  const lontane = L.map(l => ({ a: l.i, d: distanza(L.filter(b => incrocio(l.i, b.i)).map(b => M[l.i][b.i]), l.S, l.geni) }))
    .filter(x => (solo || (tabu.get(x.a) || 0) <= p) && (!solo || solo.some(([f, t]) => f === L[x.a].fazione && t === L[x.a].tema))).sort((x, y) => y.d - x.d);
  if (!lontane.length) break;
  const a = lontane[0].a, avv = L.filter(b => incrocio(a, b.i)).map(b => b.i);
  const semeP = semeBase + 100 * (p + 1);

  /* la lista com'è e K varianti, sugli stessi semi: quasi tutte a un
     passo o due da lei, qualcuna a due passi da un'altra variante, e
     qualche lista nuova dello stesso tema, perché un ritocco non sposta
     di quaranta punti. Più la lista è lontana dal 50%, più liste nuove:
     a 90% se ne prova una su due. */
  const varianti = [L[a].geni];
  const rnd = mulberry(semeP);
  const quoteNuove = Math.min(0.5, Math.max(0.12, Math.abs(media(a) - 0.5) * 1.25));
  for (let t = 0; varianti.length < K + 1 && t < 200; t++){
    const padre = t % 3 === 2 && varianti.length > 1 ? varianti[1 + Math.floor(rnd() * (varianti.length - 1))] : L[a].geni;
    const g = rnd() < quoteNuove ? L[a].S.casuale(rnd) : L[a].S.muta(padre, rnd);
    if (g && !varianti.some(v => L[a].S.chiave(v) === L[a].S.chiave(g))) varianti.push(g);
  }
  const prove = await Promise.all(varianti.map(async geni => {
    const righe = await contro(a, geni, avv, semi, semeP);
    return { geni, righe, d: distanza(righe, L[a].S, geni) };
  }));
  prove.sort((x, y) => x.d - y.d);
  const ora = prove.find(x => x.geni === L[a].geni);
  const best = prove[0];
  /* la lista com'è ha appena giocato altre partite, su semi nuovi: sono
     numeri buoni quanto quelli della tabella, e si sommano. Senza, una
     lista misurata male al primo giro (Orchi Neri al 70% su 24 partite,
     55% alla seconda misura) restava in cima alle lontane per sempre. */
  avv.forEach((b, j) => { somma(M[a][b], ora.righe[j]); somma(M[b][a], ora.righe[j], true); });
  const riga = r => r.map((c, j) => `${L[avv[j]].nome.split(' ')[0]} ${pc(quota(c))}`).join(', ');
  console.log(`\npasso ${p + 1}/${passi}: ${L[a].nome}, media ${pc(media(a))}% — ${varianti.length - 1} varianti  (${durata()})`);
  console.log(`  com'è:      ${riga(ora.righe)}`);
  if (best === ora || best.d > ora.d - 0.002){
    console.log('  nessuna variante è più vicina al 50%: resta com\'è');
    tabu.set(a, p + 3);
    storia.push({ passo: p + 1, lista: L[a].nome, cambiata: false });
    salva(storia);
    continue;
  }
  /* la scelta si rigioca su semi nuovi: la fortuna di essere la migliore
     fra otto non entra nella tabella */
  const nuove = await contro(a, best.geni, avv, semi, semeP + 50);
  const dNuova = distanza(nuove, L[a].S, best.geni), dVecchia = distanza(avv.map(b => M[a][b]), L[a].S, L[a].geni);
  console.log(`  la migliore: ${riga(best.righe)}  →  rigiocata: ${riga(nuove)}`);
  console.log(`  ${L[a].S.descrivi(best.geni).replace(/ — \d+ pt/g, '')}`);
  if (dNuova >= dVecchia){
    console.log('  rigiocata non tiene: resta com\'è');
    tabu.set(a, p + 2);
    storia.push({ passo: p + 1, lista: L[a].nome, cambiata: false, provata: L[a].S.descrivi(best.geni) });
    salva(storia);
    continue;
  }
  L[a].geni = best.geni;
  L[a].lista = L[a].S.costruisci(best.geni, { id: `b-${a}`, name: L[a].nome });
  avv.forEach((b, j) => { M[a][b] = somma(vuoto(), nuove[j]); M[b][a] = somma(vuoto(), nuove[j], true); });
  storia.push({ passo: p + 1, lista: L[a].nome, cambiata: true, descrizione: L[a].S.descrivi(best.geni), media: media(a) });
  salva(storia);
  stampa(`dopo il passo ${p + 1}`);
}

/* ---------------- la verifica, su semi mai usati ---------------- */
await tabella(semiVerifica, 70001);
stampa(`La verifica, ${semiVerifica} semi a specchio per scenario`);
salva(storia);
for (const l of L) console.log(`\n${l.nome} (${l.S.totale(l.geni)} pt, media ${pc(media(l.i))}%)\n  ${l.S.descrivi(l.geni).replace(/; /g, '\n  ')}`);

/* e la tabella per la scheda Laboratorio, nel formato del torneo: le
   coppie della stessa fazione restano vuote, perché non si schierano.
   Una lista già salvata in archivio (salva.mjs --bilancia) si chiama
   come là: nel Laboratorio si legge «La Campana e l'Abominio», non il
   nome del tema. */
const firma = l => JSON.stringify((l.units || []).map(u => [u.name, u.models, u.pts]));
const archivio = JSON.parse(fs.readFileSync(path.join(REPO, 'dati', 'liste.json'), 'utf8'));
const nomeVero = l => { const f = firma(l.lista); const a = archivio.find(x => firma(x) === f); return a ? a.name : l.nome; };
scrivi(`torneo-${punti}.json`, {
  formato: 'tow-torneo/1', quando: new Date().toISOString(), punti, semi: semiVerifica, seme: 70001, partite: giocate,
  secondi: Math.round((Date.now() - t0) / 1000), bilanciato: true,
  scenari: scenari.map(id => ({ id, label: TUTTI[id].label || id, group: TUTTI[id].group || 'Miei', pts: TUTTI[id].pts || null })),
  liste: L.map(l => ({ id: `b-${l.i}`, name: nomeVero(l), fazione: l.fazione, pool: 'collezione', fonte: 'ricerca', file: FILE,
    points: l.S.totale(l.geni), descrizione: l.S.descrivi(l.geni), units: l.geni.length })),
  celle: perScenario,
});
await motore.chiudi();

function mulberry(s){ let st = s >>> 0; return () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
