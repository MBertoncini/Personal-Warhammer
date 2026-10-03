/* Schieramento Old World — la lista cercata a macchina
 *
 *   node tools/liste/cerca.mjs [--fazione skaven|og|liz|tutte] [--pool tutte|collezione|entrambe]
 *        [--punti 800] [--scenari sei|tutti|bm-strada,...] [--contro auto|liz,og,...]
 *        [--sforzo rapido|normale|accurato] [--generazioni 8] [--popolazione 10] [--celle 12]
 *        [--verifica 2] [--finaliste 4] [--max-avversari 10] [--seme 1001] [--lavori 7] [--da-capo]
 *        [--senza-esempi] [--tema nome --con voce,voce|voce --senza voce,voce]
 *        [--obiettivo forte|equilibrata] [--formato scenario|bm|core] [--durata bm|fixed|breakpoint]
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
 * Il giro vero sta in src/cerca.js, perché lo lancia anche la pagina
 * (il Laboratorio): qui restano gli argomenti, gli avversari e il file.
 * L'OBIETTIVO «equilibrata» cerca la lista che contro ogni avversario sta
 * più vicina al 50%, invece di quella che vince di più; FORMATO e DURATA
 * giocano gli scenari col libro base o con Battle March, a scelta.
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
import { SFORZI, stimaPartite, cercaLista, OBIETTIVI, lettura } from '../../src/cerca.js';

const argv = process.argv.slice(2);
const arg = (k, def) => { const i = argv.indexOf('--' + k); return i < 0 ? def : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };

const sforzo = String(arg('sforzo', 'normale'));
if (!SFORZI[sforzo]){ console.error(`Sforzo «${sforzo}»: ${Object.keys(SFORZI).join(', ')}.`); process.exit(1); }
const P = { ...SFORZI[sforzo] };
for (const k of Object.keys(P)) if (arg(k, null) != null) P[k] = Math.max(1, +arg(k));

const punti = +arg('punti', 800);
const seme = +arg('seme', 1001);
const daCapo = arg('da-capo', false) === true;
const esempi = arg('senza-esempi', false) !== true;
const obiettivo = String(arg('obiettivo', 'forte'));
if (!OBIETTIVI[obiettivo]){ console.error(`Obiettivo «${obiettivo}»: ${Object.keys(OBIETTIVI).join(' o ')}.`); process.exit(1); }
const formato = String(arg('formato', 'scenario')), durata = arg('durata', '') === true ? '' : String(arg('durata', ''));
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

const pc = (a, n) => Math.round(100 * a / (n || 1));
const durataS = ms => { const s = Math.round(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`; };

const motore = await apriMotore({ lavori: +arg('lavori', 0) || undefined });
console.log(`${motore.lavori} lavoratori · sforzo ${sforzo}: popolazione ${P.popolazione}, ${P.generazioni} generazioni da ${P.celle} celle, ${P.finaliste} finaliste verificate su ${P.verifica} semi · obiettivo: ${OBIETTIVI[obiettivo].label}`);
const gioca = job => motore.gioca({ ...job, formato, durata });

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

  const etichetta = `${S.fz.sigla} ${pool === 'collezione' ? 'collezione' : 'libera'} ${punti}${tema.nome ? ' ' + tema.nome : ''}`;
  const r = await cercaLista({ S, contro, scenari, P, seme, gioca, obiettivo, esempi,
    prima: !daCapo && leggi(file), etichetta, idBase: `r-${file.replace(/\.json$/, '')}`,
    log: riga => console.log('  ' + riga) });
  if (r.vuota){ console.log(`  ${r.motivo}: salto.`); continue; }
  const { migliori } = r;

  for (const [i, m] of migliori.entries()){
    const v = m.verifica;
    console.log(`  ${i + 1}. ${lettura(v, obiettivo)} (${v.n} partite)  ${m.punti} pt — ${m.descrizione}`);
    if (i === 0){
      console.log('     per avversario: ' + contro.map(a => { const t = v.perAvversario[a.lista.id]; return `${a.lista.name} ${pc(t.w, t.n)}/${pc(t.l, t.n)}`; }).join(', '));
      console.log('     per scenario:   ' + scenari.map(s => { const t = v.perScenario[s]; return `${s} ${pc(t.w, t.n)}/${pc(t.l, t.n)}`; }).join(', '));
      if (Object.keys(v.fuori).length) console.log('     ⚠ rimaste fuori dallo schieramento: ' + Object.entries(v.fuori).map(([k, q]) => `${k} ${q}`).join(', '));
    }
  }
  console.log('  le unità, per media delle liste che le avevano: ' + r.provate.filter(t => t.liste).map(t => `${t.nome} ${t.media}% (${t.liste})`).join(', '));

  scrivi(file, {
    formato: 'tow-ricerca/1', quando: new Date().toISOString(),
    fazione, nome: S.fz.nome + (tema.nome ? ` · ${tema.nome}` : ''), catalogue: S.fz.cat, pool, punti, scenari, seme,
    ...(tema.nome ? { tema } : {}),
    etichette: Object.fromEntries(scenari.map(s => [s, TUTTI[s].label || s])),
    sforzo, parametri: P, obiettivo, gioco: { formato, durata }, partite: r.partite, secondi: Math.round((Date.now() - t0) / 1000),
    unita: S.voci.map(v => v.nome), escluse: S.escluse, esempi,
    provate: r.provate, contro: r.contro, storia: r.storia, migliori,
  });
  console.log(`  scritto dati/ricerche/${file} (${r.partite} partite, ${durataS(Date.now() - t0)})`);
}
await motore.chiudi();
