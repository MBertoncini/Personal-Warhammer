/* Schieramento Old World — la lista cercata a macchina
 *
 *   node tools/liste/cerca.mjs [--fazione skaven|og|liz|tutte] [--pool tutte|collezione|entrambe]
 *        [--punti 800] [--scenari sei|tutti|bm-strada,...] [--contro auto|liz,og,...]
 *        [--sforzo rapido|normale|accurato] [--generazioni 8] [--popolazione 10] [--celle 12]
 *        [--verifica 2] [--finaliste 4] [--max-avversari 10] [--seme 1001] [--lavori 7] [--da-capo]
 *        [--senza-esempi] [--tema nome --con voce,voce|voce --senza voce,voce]
 *
 * Quello che valuta.mjs fa a mano — scrivere trenta candidate, giocarle,
 * tenere le migliori, cambiarle un poco e rigiocarle — qui lo fa un giro
 * di generazioni:
 *
 *   1. la popolazione parte dalle migliori della ricerca di prima con gli
 *      stessi parametri (la ricerca riprende da dove era arrivata;
 *      --da-capo la fa ripartire), dalla lista nota di esempi.mjs se in
 *      questo serbatoio si schiera (--senza-esempi la lascia fuori), da
 *      una lista A TEMA per ogni unità che non c'è ancora — costruita
 *      attorno a lei — e da liste a caso. La prima generazione è quindi
 *      più larga delle altre: le liste note erano tutte fanteria, e con
 *      solo loro e il caso i mostri e la cavalleria non entravano quasi
 *      mai nella gara;
 *   2. ogni generazione tutte le candidate giocano le STESSE celle — un
 *      avversario su uno scenario, un seme nuovo, a specchio — estratte
 *      fra tutte le coppie avversario × scenario (--celle, e ogni
 *      avversario almeno una volta se le celle bastano). Giocarle tutte a
 *      ogni generazione costerebbe troppo: su un portatile le partite sono
 *      due o tre al secondo. Le migliori restano e rigiocano anche la
 *      generazione dopo, su celle nuove: i conti si sommano, e una lista
 *      fortunata una volta non resta in testa per quello;
 *   3. le altre si rimpiazzano con figlie delle migliori — un reggimento
 *      più grande, un'opzione, un'unità scambiata, aggiunta o tolta — e
 *      una lista a caso, perché la popolazione non si chiuda su un'idea;
 *   4. alla fine le finaliste si riprovano contro TUTTI gli avversari su
 *      TUTTI gli scenari, con semi mai usati per scegliere (dal 5001), ed
 *      è con quei numeri che si ordinano.
 *
 * Gli avversari («auto»): la migliore di ogni ricerca di un'ALTRA fazione
 * agli stessi punti, e le liste dell'archivio vicine ai punti (±6%), le
 * più vicine prima, fino a --max-avversari. Così le ricerche si
 * rincorrono: la seconda volta ogni fazione gioca contro quello che le
 * altre hanno trovato la prima.
 *
 * Il TEMA (--tema, con --con e --senza) restringe la ricerca a un'idea di
 * lista: `--tema campana --con seerBell,hpa` cerca solo liste con la
 * Screaming Bell e l'Abominio, `--senza wlc` le vieta il cannone. Una
 * ricerca libera trova la lista più forte, e due ricerche libere della
 * stessa fazione trovano la stessa lista: con i temi se ne cercano due
 * diverse, e ognuna gioca contro le migliori degli altri temi.
 *
 * Il risultato va in dati/ricerche/<fazione>-<pool>-<punti>[-<tema>].json, e la
 * scheda Laboratorio dell'app lo legge da lì. Con le liste c'è la
 * tabella delle unità: in quante liste è stata provata ognuna, e come
 * sono andate in media.
 */
import fs from 'node:fs';
import path from 'node:path';
import { apriMotore, SEI, scenariTutti, REPO } from './motore.mjs';
import { spazio, FAZIONI, fazioneDi } from './spazio.mjs';
import { scrivi, leggi, nomeRicerca, campioni } from './ricerche.mjs';

const argv = process.argv.slice(2);
const arg = (k, def) => { const i = argv.indexOf('--' + k); return i < 0 ? def : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };

const SFORZI = {
  rapido:   { popolazione: 8,  generazioni: 4,  celle: 8,  verifica: 1, finaliste: 3 },
  normale:  { popolazione: 10, generazioni: 8,  celle: 12, verifica: 2, finaliste: 4 },
  accurato: { popolazione: 14, generazioni: 12, celle: 18, verifica: 4, finaliste: 5 },
};
/* quante partite, per chi deve decidere se lanciarla: ogni cella e ogni
   seme di verifica sono due partite, a specchio */
const stimaPartite = (p, celleTutte, temi = 0) => 2 * ((p.popolazione * p.generazioni + temi) * Math.min(p.celle, celleTutte) + p.finaliste * celleTutte * p.verifica);
const sforzo = String(arg('sforzo', 'normale'));
if (!SFORZI[sforzo]){ console.error(`Sforzo «${sforzo}»: rapido, normale o accurato.`); process.exit(1); }
const P = { ...SFORZI[sforzo] };
for (const k of Object.keys(P)) if (arg(k, null) != null) P[k] = Math.max(1, +arg(k));

const punti = +arg('punti', 800);
const seme = +arg('seme', 1001);
const daCapo = arg('da-capo', false) === true;
const esempi = arg('senza-esempi', false) !== true;
const fazioni = arg('fazione', 'tutte') === 'tutte' ? Object.keys(FAZIONI) : String(arg('fazione')).split(',');
for (const f of fazioni) if (!FAZIONI[f]){ console.error(`Fazione «${f}»: ${Object.keys(FAZIONI).join(', ')} o tutte.`); process.exit(1); }
const pools = { tutte: ['tutte'], collezione: ['collezione'], entrambe: ['tutte', 'collezione'] }[arg('pool', 'entrambe')];
const lista_ = k => arg(k, null) == null || arg(k) === true ? [] : String(arg(k)).split(',').filter(Boolean);
const tema = { nome: arg('tema', null) === true ? null : arg('tema', null), con: lista_('con'), senza: lista_('senza') };
if ((tema.con.length || tema.senza.length) && !tema.nome){ console.error('--con e --senza vogliono un --tema: è il nome che distingue il file.'); process.exit(1); }
if (!pools){ console.error('--pool: tutte, collezione o entrambe.'); process.exit(1); }

const TUTTI = await scenariTutti();
const sc = String(arg('scenari', 'sei'));
const scenari = sc === 'sei' ? SEI : sc === 'tutti' ? Object.keys(TUTTI) : sc.split(',');
for (const s of scenari) if (!TUTTI[s]){ console.error(`Scenario «${s}» sconosciuto. Ci sono: ${Object.keys(TUTTI).join(', ')}.`); process.exit(1); }

const archivio = JSON.parse(fs.readFileSync(path.join(REPO, 'dati', 'liste.json'), 'utf8'));
const BREVI = { liz: 'lmubp2kimjzhw', og: 'lmucdz1grir4h', skf: 'lmubp01267euf', sko: 'lmuegsxz4wod0' };

/* gli avversari di una ricerca */
function avversari(fileQui, fazioneQui){
  const c = String(arg('contro', 'auto'));
  if (c !== 'auto') return c.split(',').map(x => {
    const l = archivio.find(l => l.id === (BREVI[x] || x) || l.name === x);
    if (!l){ console.error(`Non trovo la lista avversaria «${x}».`); process.exit(1); }
    return { lista: l, fonte: 'archivio' };
  });
  const vicine = archivio.filter(l => (l.units || []).length && fazioneDi((l.info || {}).catalogue) &&
                                      Math.abs(l.points - punti) <= punti * 0.06)
    .sort((a, b) => Math.abs(a.points - punti) - Math.abs(b.points - punti))
    .map(l => ({ lista: l, fonte: 'archivio' }));
  const trovate = campioni(punti, { tranne: fileQui }).filter(c => c.doc.fazione !== fazioneQui)
    .map(c => ({ lista: c.lista, fonte: 'ricerca', file: c.file }));
  const visti = new Set();
  return [...trovate, ...vicine].filter(a => !visti.has(a.lista.id) && visti.add(a.lista.id)).slice(0, +arg('max-avversari', 10));
}

/* i dadi della ricerca: quali mutazioni, quali liste a caso. Col seme,
   la stessa ricerca rifatta dà le stesse liste. */
let stato = seme >>> 0;
const rnd = () => { stato = (stato + 0x6D2B79F5) >>> 0; let t = stato; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

const punteggio = s => (s.w + s.d / 2 + 1) / (s.n + 2);
const pc = (a, n) => Math.round(100 * a / (n || 1));
const somma = (a, r) => { a.w += r.vince.x; a.l += r.vince.y; a.d += r.pari; a.n += r.n; return a; };
const vuoto = () => ({ w: 0, l: 0, d: 0, n: 0 });
const durata = ms => { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`; };

const motore = await apriMotore({ lavori: +arg('lavori', 0) || undefined });
console.log(`${motore.lavori} lavoratori · sforzo ${sforzo}: popolazione ${P.popolazione}, ${P.generazioni} generazioni da ${P.celle} celle, ${P.finaliste} finaliste verificate su ${P.verifica} semi`);

for (const fazione of fazioni) for (const pool of pools){
  const t0 = Date.now();
  const S = spazio(fazione, { pool, punti, con: tema.con, senza: tema.senza });
  const file = nomeRicerca({ fazione, pool, punti, scenari, sei: SEI, tema: tema.nome });
  const contro = avversari(file, fazione);
  const celleTutte = contro.length * scenari.length;
  console.log(`\n=== ${S.fz.nome}, ${pool === 'collezione' ? 'con la collezione' : 'con tutte le unità'}, ${punti} punti${tema.nome ? ', tema «' + tema.nome + '»' : ''} → dati/ricerche/${file}`);
  if (tema.con.length || tema.senza.length) console.log(`  tema: ${tema.con.length ? 'con ' + tema.con.join(', ') : ''}${tema.con.length && tema.senza.length ? '; ' : ''}${tema.senza.length ? 'senza ' + tema.senza.join(', ') : ''}`);
  console.log(`  unità: ${S.voci.map(v => v.nome).join(', ')}`);
  if (S.escluse.length) console.log(`  fuori: ${S.escluse.map(e => `${e.pezzo} (${e.perche})`).join('; ')}`);
  console.log(`  avversari: ${contro.map(a => a.lista.name + (a.fonte === 'ricerca' ? ' [trovata]' : '')).join(', ')}`);
  console.log(`  scenari: ${scenari.join(', ')} — circa ${stimaPartite(P, celleTutte, S.voci.length)} partite`);
  if (!contro.length){ console.log('  nessun avversario: salto.'); continue; }

  /* chi gioca: una candidata sulle celle date, gli stessi semi per tutte */
  let partite = 0;
  const tutteLeCelle = contro.flatMap(a => scenari.map(s => ({ a, s })));
  async function gioca(geni, celle, semeDa, quanti){
    const x = S.costruisci(geni, { id: 'cand-' + fazione });
    const fatti = await Promise.all(celle.map(({ a, s }) =>
      motore.gioca({ x, y: a.lista, scenario: s, partite: quanti, seme: semeDa }).then(r => ({ a: a.lista.id, s, r }))));
    partite += fatti.reduce((t, f) => t + f.r.n, 0);
    return fatti;
  }
  /* le celle di una generazione: ogni avversario a turno, uno scenario
     a caso che non ha ancora giocato in questa generazione */
  function estrai(k){
    if (k >= tutteLeCelle.length) return tutteLeCelle;
    const ordine = [...contro].sort(() => rnd() - 0.5), usati = new Map(), out = [];
    for (let i = 0; out.length < k; i++){
      const a = ordine[i % ordine.length], fatti = usati.get(a) || new Set();
      const liberi = scenari.filter(s => !fatti.has(s));
      if (!liberi.length) continue;
      const s = liberi[Math.floor(rnd() * liberi.length)];
      fatti.add(s); usati.set(a, fatti); out.push({ a, s });
    }
    return out;
  }

  /* la popolazione iniziale */
  const visti = new Map();          // chiave -> { geni, w, l, d, n }
  const pop = [];
  /* `casuale` e `muta` danno null quando non trovano una lista valida */
  const entra = geni => { if (!geni) return false; const k = S.chiave(geni); if (pop.some(g => S.chiave(g) === k)) return false; pop.push(geni); return true; };
  const prima = !daCapo && leggi(file);
  const riprese = [];
  for (const m of (prima && prima.migliori) || []) if (m.geni && !S.valida(m.geni).length && entra(m.geni)) riprese.push(m);
  if (esempi) for (const p of S.partenze) entra(p);
  /* una lista a tema per ogni unità che nella popolazione non c'è
     ancora: la prima generazione è più larga delle altre, ma nessuna
     unità esce dalla ricerca solo perché il caso non l'ha mai pescata */
  const temi = [];
  for (const v of [...S.voci].sort(() => rnd() - 0.5)){
    if (pop.some(g => g.some(x => x.k === v.k))) continue;
    if (entra(S.casuale(rnd, { con: v.k }))) temi.push(v.nome);
  }
  for (let t = 0; pop.length < P.popolazione && t < 200; t++) entra(S.casuale(rnd));
  console.log(`  prima generazione: ${pop.length} liste${esempi && S.partenze.length ? ', con la lista nota' : ''}; a tema: ${temi.join(', ') || 'nessuna'}`);
  if (riprese.length) console.log(`  riprende da ${riprese.length} liste della ricerca del ${String(prima.quando).slice(0, 10)}`);
  if (!pop.length){ console.log('  non riesco a scrivere nessuna lista valida con queste unità: salto.'); continue; }

  const storia = [];
  const E = Math.max(2, Math.ceil(P.popolazione / 3));
  for (let gen = 0; gen < P.generazioni; gen++){
    const semeGen = seme + gen, celle = estrai(P.celle);
    await Promise.all(pop.map(async geni => {
      const k = S.chiave(geni);
      const s = visti.get(k) || { geni, ...vuoto() };
      for (const f of await gioca(geni, celle, semeGen, 1)) somma(s, f.r);
      visti.set(k, s);
    }));
    const classifica = pop.map(g => visti.get(S.chiave(g))).sort((a, b) => punteggio(b) - punteggio(a));
    const top = classifica[0];
    storia.push({ gen: gen + 1, partite, migliore: Math.round(100 * punteggio(top)), vince: pc(top.w, top.n), n: top.n, lista: S.descrivi(top.geni) });
    console.log(`  gen ${String(gen + 1).padStart(2)}/${P.generazioni}  ${String(partite).padStart(6)} partite  ${durata(Date.now() - t0).padStart(6)}` +
                `  in testa: vince ${pc(top.w, top.n)}% perde ${pc(top.l, top.n)}% su ${top.n} — ${S.descrivi(top.geni).replace(/ — \d+ pt/g, '')}`);
    if (gen === P.generazioni - 1) break;

    /* la generazione dopo: le migliori restano, le altre sono figlie */
    const elite = classifica.slice(0, E).map(s => s.geni);
    pop.length = 0;
    for (const g of elite) pop.push(g);
    const torneo = () => { const a = scegli(elite), b = scegli(elite); return punteggio(visti.get(S.chiave(a))) >= punteggio(visti.get(S.chiave(b))) ? a : b; };
    for (let t = 0; pop.length < P.popolazione - 1 && t < 300; t++){
      const figlia = S.muta(torneo(), rnd);
      if (figlia && !visti.has(S.chiave(figlia))) entra(figlia);
    }
    for (let t = 0; pop.length < P.popolazione && t < 50; t++){ const c = S.casuale(rnd); if (c && !visti.has(S.chiave(c))) entra(c); }
  }

  /* la verifica, su semi mai usati per scegliere */
  const finaliste = [...visti.values()].filter(s => s.n > 0).sort((a, b) => punteggio(b) - punteggio(a)).slice(0, P.finaliste);
  console.log(`  verifica di ${finaliste.length} finaliste su ${P.verifica} semi nuovi…`);
  const migliori = await Promise.all(finaliste.map(async s => {
    const v = { ...vuoto(), perScenario: {}, perAvversario: {}, celle: {}, fuori: {} };
    for (const f of await gioca(s.geni, tutteLeCelle, 5001, P.verifica)){
      somma(v, f.r);
      somma(v.perScenario[f.s] ||= vuoto(), f.r);
      somma(v.perAvversario[f.a] ||= vuoto(), f.r);
      v.celle[`${f.a}|${f.s}`] = somma(vuoto(), f.r);
      for (const [k, q] of Object.entries(f.r.fuori)) if (k.startsWith('x|')) v.fuori[k.slice(2)] = (v.fuori[k.slice(2)] || 0) + q;
    }
    return { geni: s.geni, descrizione: S.descrivi(s.geni), punti: S.totale(s.geni),
             ricerca: { w: s.w, l: s.l, d: s.d, n: s.n }, verifica: v };
  }));
  migliori.sort((a, b) => (b.verifica.w + b.verifica.d / 2) / b.verifica.n - (a.verifica.w + a.verifica.d / 2) / a.verifica.n);
  const etichetta = `${S.fz.sigla} ${pool === 'collezione' ? 'collezione' : 'libera'} ${punti}${tema.nome ? ' ' + tema.nome : ''}`;
  migliori.forEach((m, i) => { m.lista = S.costruisci(m.geni, { id: `r-${file.replace(/\.json$/, '')}-${i + 1}`, name: `${etichetta} · ${i + 1}` }); });

  for (const [i, m] of migliori.entries()){
    const v = m.verifica;
    console.log(`  ${i + 1}. vince ${pc(v.w, v.n)}% perde ${pc(v.l, v.n)}% (${v.n} partite)  ${m.punti} pt — ${m.descrizione}`);
    if (i === 0){
      console.log('     per avversario: ' + contro.map(a => { const t = v.perAvversario[a.lista.id]; return `${a.lista.name} ${pc(t.w, t.n)}/${pc(t.l, t.n)}`; }).join(', '));
      console.log('     per scenario:   ' + scenari.map(s => { const t = v.perScenario[s]; return `${s} ${pc(t.w, t.n)}/${pc(t.l, t.n)}`; }).join(', '));
      if (Object.keys(v.fuori).length) console.log('     ⚠ rimaste fuori dallo schieramento: ' + Object.entries(v.fuori).map(([k, q]) => `${k} ${q}`).join(', '));
    }
  }

  /* ogni unità, in quante liste provate e come sono andate quelle liste:
     dice se un'unità manca dalle migliori perché va male o perché non
     l'ha provata nessuno. La media è fra le liste, non fra le partite:
     altrimenti le migliori, che giocano di più, peserebbero per tutte. */
  function provate(){
    const per = new Map(S.voci.map(v => [v.k, { k: v.k, nome: v.nome, liste: 0, partite: 0, somma: 0 }]));
    for (const s of visti.values()){
      if (!s.n) continue;
      for (const k of new Set(s.geni.map(g => g.k))){
        const t = per.get(k); if (!t) continue;
        t.liste++; t.partite += s.n; t.somma += (s.w + s.d / 2) / s.n;
      }
    }
    return [...per.values()].map(({ somma, ...t }) => ({ ...t, media: t.liste ? Math.round(100 * somma / t.liste) : null,
      finaliste: migliori.filter(m => m.geni.some(g => g.k === t.k)).length }))
      .sort((a, b) => (b.media ?? -1) - (a.media ?? -1));
  }
  const tab = provate();
  console.log('  le unità, per media delle liste che le avevano: ' + tab.filter(t => t.liste).map(t => `${t.nome} ${t.media}% (${t.liste})`).join(', '));

  scrivi(file, {
    formato: 'tow-ricerca/1', quando: new Date().toISOString(),
    fazione, nome: S.fz.nome + (tema.nome ? ` · ${tema.nome}` : ''), catalogue: S.fz.cat, pool, punti, scenari, seme,
    ...(tema.nome ? { tema } : {}),
    etichette: Object.fromEntries(scenari.map(s => [s, TUTTI[s].label || s])),
    sforzo, parametri: P, partite, secondi: Math.round((Date.now() - t0) / 1000),
    unita: S.voci.map(v => v.nome), escluse: S.escluse, esempi,
    provate: provate(),
    contro: contro.map(a => ({ id: a.lista.id, name: a.lista.name, catalogue: (a.lista.info || {}).catalogue, points: a.lista.points, fonte: a.fonte, file: a.file })),
    storia, migliori,
  });
  console.log(`  scritto dati/ricerche/${file} (${partite} partite, ${durata(Date.now() - t0)})`);
}
await motore.chiudi();

function scegli(a){ return a[Math.floor(rnd() * a.length)]; }
