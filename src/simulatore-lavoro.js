/* Schieramento Old World — tante partite, senza terminale
 *
 * `tools/partita.mjs --partite N` gioca N partite di euristica, un seme
 * dopo l'altro, e stampa il conto: chi vince quante volte, con che
 * margine, e — con l'estro — quali piani contano. Questo e' lo stesso
 * lavoro, fatto dal browser: dal telefono, al circolo, senza un
 * computer acceso. Il codice delle partite e dei conti e' quello dello
 * strumento (`serie.js`, `heatmap.js`, che `tools/partita.mjs` usa per `--partite`), non una copia.
 *
 * Gira in un Web Worker, perche' cento partite sono qualche decina di
 * secondi di calcolo e la pagina deve restare viva: la barra avanza, il
 * pulsante «Ferma» risponde. Fra una partita e l'altra si lascia un giro
 * al ciclo degli eventi, ed e' li' che arriva il «ferma»: le partite
 * gia' giocate restano, e il conto si fa su quelle.
 *
 * Lo stesso modulo si puo' importare dalla pagina (`giocaTante`), per i
 * browser che i Worker di tipo modulo non li sanno fare: allora gira sul
 * filo principale, piu' lento a rispondere ma con lo stesso risultato.
 */

import * as AR from './arbitro.js';
import * as AG from './agente.js';
import * as D from './dice.js';
import * as PR from './profiles.js';
import * as ARM from './armies.js';
import * as MG from './magic.js';
import * as MT from './mounts.js';
import * as FM from './formation.js';
import { agenteRicerca } from './ricerca.js';
import * as SE from './serie.js';
import { raccoglitore, paginaHeatmap } from './heatmap.js';
import { COLORI, coloreTerreno } from './replay.js';

/* I file che le liste non portano. Nella pagina li ha gia' caricati
   chi l'ha aperta; nel Worker si caricano qui, con gli indirizzi presi
   dal modulo (il Worker non sa dove sta la pagina). */
let pronti = null;
export function caricaDati(){
  if (pronti) return pronti;
  const qui = p => new URL(p, import.meta.url).href;
  pronti = Promise.all([
    PR.loadProfiles(qui('../dati/profili.json')),
    ARM.loadArmies(qui('../dati/eserciti/')),
    MT.loadMounts(qui('../dati/cavalcature.json')),
    MG.loadMagic(qui('../dati/magia/domini.json')),
  ]);
  return pronti;
}

const lascia = () => new Promise(r => setTimeout(r, 0));

/* `opz`: { liste: {x, y}, nomi: {x, y}, scenario, def, partite, seme,
   specchio, estro, ricerca, mappa, titolo }. Torna il testo del conto,
   le righe una per una, e la pagina della mappa se chiesta. */
export async function giocaTante(opz, { avanza = () => {}, fermato = () => false, caricare = true } = {}){
  if (caricare) await caricaDati();
  const magia = MG.magicNow();
  const { liste, nomi, scenario, def, specchio, estro } = opz;
  const partite = Math.max(1, Math.floor(+opz.partite) || 1);
  const seme = Math.max(1, Math.floor(+opz.seme) || 1);
  const guardaAvanti = l => opz.ricerca === true || opz.ricerca === l;
  const agente = (lista, nome, s) => {
    const e = AG.agenteEuristico({
      nome: nome + (estro ? ' (euristica con estro)' : ' (euristica)'),
      estro: estro ? D.seeded(SE.semeEstro(s, lista)) : null,
    });
    return guardaAvanti(lista) ? agenteRicerca({ AR, base: e, nome: nome + ' (guarda avanti)', seme: s }) : e;
  };
  const mappa = opz.mappa ? raccoglitore({ AR, FM, nomiListe: nomi }) : null;
  const tutte = [];
  const quante = partite * (specchio ? 2 : 1);
  const t0 = Date.now();
  for (let i = 0; i < partite; i++){
    if (fermato()) break;
    /* una alla volta: fra l'una e l'altra arriva il «ferma» */
    const una = await SE.giocaSerie({ AR, AG, D, liste, nomi, scenario, def, magia,
                                      partite: 1, seme: seme + i, specchio, osservatore: mappa, agente });
    tutte.push(...una);
    avanza(tutte.length, quante);
    await lascia();
  }
  /* i dadi tornano quelli veri: la serie li ha messi sul seme */
  D.setSource(null);
  if (!tutte.length) return { righe: ['Nessuna partita giocata.'], fatte: 0, quante };

  const an = SE.analizza(tutte);
  const righe = [...SE.righeAnalisi(an, nomi)];
  const media = f => tutte.reduce((s, x) => s + f(x), 0) / tutte.length;
  righe.push(`punti vittoria in media: ${nomi.x} ${media(x => x.vp.x).toFixed(0)}, ${nomi.y} ${media(x => x.vp.y).toFixed(0)}`);
  righe.push(`finita in media al turno ${media(x => x.turno).toFixed(1)}`);
  const perEsito = new Map();
  for (const x of tutte){
    const k = x.vincitore ? `${nomi[x.vincitore]}: ${x.label}` : x.label;
    perEsito.set(k, (perEsito.get(k) || 0) + 1);
  }
  righe.push('', 'come sono finite:');
  for (const [k, n] of [...perEsito].sort((a, b) => b[1] - a[1])) righe.push(`  ${String(n).padStart(4)}  ${k}`);
  const diverse = new Set(tutte.map(x => `${x.vincitore}|${x.vp.x}|${x.vp.y}`)).size;
  righe.push('', `risultati diversi: ${diverse} su ${tutte.length}` +
                  (diverse === 1 ? ' — i dadi non cambiano niente: è sempre la stessa partita' : ''));
  const schieramenti = new Set(tutte.map(x => x.schierati)).size;
  righe.push(`schieramenti diversi: ${schieramenti} su ${tutte.length}` +
             (schieramenti === 1 ? ' — si schiera sempre uguale, e le partite si separano solo ai dadi' : ''));
  const fuori = new Map();
  for (const x of tutte) for (const f of x.fuori || []){
    const k = `${nomi[f.lista]}: ${f.name} (${f.pts} pt)`;
    fuori.set(k, (fuori.get(k) || 0) + 1);
  }
  for (const [k, n] of fuori) righe.push(`⚠ ${k} è rimasta fuori dal tavolo in ${n} partite su ${tutte.length}: non trovava posto nella zona.`);
  if (estro){
    righe.push('', 'quali piani contano (regressione sullo scarto di punti, tutte le scelte insieme):');
    righe.push(...SE.righePiani(SE.analizzaPiani(tutte), nomi));
  }
  /* la partita piu' netta di ciascuno: il seme da guardare dal vivo */
  const netta = t => tutte.filter(x => x.vincitore === t && !x.giro)
    .sort((a, b) => Math.abs(b.vp.x - b.vp.y) - Math.abs(a.vp.x - a.vp.y))[0];
  const nette = {};
  for (const t of ['x', 'y']){
    const x = netta(t);
    if (x){ nette[t] = x.seme; righe.push(`la vittoria più netta di ${nomi[t]}: seme ${x.seme} (${x.vp[t]}–${x.vp[SE.ALTRA[t]]})`); }
  }
  righe.push('', `${tutte.length} partite in ${((Date.now() - t0) / 1000).toFixed(1)} s` +
                 (tutte.length < quante ? ` (fermata dopo ${tutte.length} su ${quante})` : ''));

  let pagina = null;
  if (mappa){
    const d = mappa.dati();
    const avvisi = [];
    if (!estro) avvisi.push("senza l'estro l'euristica si schiera sempre uguale: la mappa dello schieramento ha un posto solo per unità.");
    if (d.meta.terreniDiversi > 1) avvisi.push(`il terreno di questo scenario cambia da una partita all'altra (${d.meta.terreniDiversi} tavoli diversi): quello disegnato è della prima.`);
    if (tutte.length < 200) avvisi.push(`${tutte.length} partite sono poche per una mappa unità per unità: i colori restano chiari quasi ovunque.`);
    pagina = paginaHeatmap({
      dati: d, titolo: `${(def && def.label) || scenario} — ${nomi.x} contro ${nomi.y}: la mappa di ${tutte.length} partite`,
      sotto: `${nomi.x} vince ${an.vince.x}, ${nomi.y} ${an.vince.y}, pareggi ${an.pareggi} · semi ${seme}–${seme + partite - 1}` +
             (specchio ? ' a specchio' : '') + ` · euristica${estro ? ' con estro' : ''}`,
      avvisi, colori: COLORI, coloreTerreno,
    });
  }
  return { righe, fatte: tutte.length, quante, vince: an.vince, pareggi: an.pareggi, nette, pagina };
}

/* ---- il Worker ---- */
const nelLavoro = typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope;
if (nelLavoro){
  let fermo = false;
  self.onmessage = async e => {
    const m = e.data || {};
    if (m.tipo === 'ferma'){ fermo = true; return; }
    if (m.tipo !== 'serie') return;
    fermo = false;
    try {
      const r = await giocaTante(m.opz, {
        avanza: (k, n) => self.postMessage({ tipo: 'avanza', k, n }),
        fermato: () => fermo,
      });
      self.postMessage({ tipo: 'fine', ...r });
    } catch (err){
      self.postMessage({ tipo: 'errore', messaggio: err && err.message ? err.message : String(err) });
    }
  };
}
