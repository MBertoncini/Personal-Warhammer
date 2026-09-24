/* Schieramento Old World — le serie, giocate da processori che restano accesi
 *
 * `valuta.mjs` lancia un processo per ogni serie: ogni volta si rileggono
 * i profili, gli eserciti e i domini, e per le serie corte il tempo se ne
 * va lì. Chi cerca una lista ne gioca migliaia: qui i lavoratori
 * (worker_threads) caricano tutto una volta sola e poi giocano quello che
 * ricevono, una serie per messaggio.
 *
 * La serie è quella di `gioca.mjs`: a specchio, con l'estro, gli stessi
 * semi e la stessa euristica — gli stessi numeri, a parità di liste.
 *
 *   const m = await apriMotore({ lavori: 7 });
 *   const r = await m.gioca({ x: lista, y: lista, scenario: 'bm-strada', partite: 2, seme: 1001 });
 *   // r = { vince: { x, y }, pari, n, vp: { x, y }, fuori: { 'x|Clanrats': 2 } }
 *   await m.chiudi();
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const qui = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.join(qui, '..', '..');
const dati = f => JSON.parse(fs.readFileSync(path.join(REPO, 'dati', f), 'utf8'));

/* i sei scenari con cui sono state cercate le liste di esempi.mjs: tre
   tavoli scritti a mano, due di Battle March e la Battaglia Campale */
export const SEI = ['sxmu9q80qdc65', 'sxprova-profondo', 'sxprova-boschi', 'bm-strada', 'bm-rovine', 'open'];

/* tutti gli scenari giocabili: quelli del codice e quelli salvati
   dall'app in dati/scenari.json, se hanno tavolo e schieramento */
export async function scenariTutti(){
  const { SCENARIOS } = await import('../../src/scenarios.js');
  let miei = [];
  try { miei = dati('scenari.json') || []; } catch (_){ /* nessuno scenario salvato */ }
  return { ...SCENARIOS, ...Object.fromEntries(miei.filter(s => s && s.id && s.table && s.deploy).map(s => [s.id, s])) };
}

/* ---------------- il lavoratore ---------------- */
async function lavora(){
  const AR = await import('../../src/arbitro.js');
  const AG = await import('../../src/agente.js');
  const D = await import('../../src/dice.js');
  const PR = await import('../../src/profiles.js');
  const ARM = await import('../../src/armies.js');
  const MG = await import('../../src/magic.js');
  const SE = await import('../serie.mjs');
  PR.useProfiles(dati('profili.json'));
  ARM.useArmies(ARM.makeArmies(dati(path.join('eserciti', 'indice.json')).file.map(f => dati(path.join('eserciti', f)))));
  const magia = MG.useMagic(MG.makeMagic(dati(path.join('magia', 'domini.json'))));
  const TUTTI = await scenariTutti();

  parentPort.on('message', async ({ id, x, y, scenario, partite, seme }) => {
    try {
      if (!TUTTI[scenario]) throw new Error(`scenario «${scenario}» sconosciuto`);
      const giocate = await SE.giocaSerie({ AR, AG, D, liste: { x, y }, nomi: { x: x.name, y: y.name }, scenario,
        def: TUTTI[scenario], magia, partite, seme, specchio: true,
        agente: (lista, nome, s) => AG.agenteEuristico({ nome, estro: D.seeded(SE.semeEstro(s, lista)) }) });
      const r = { vince: { x: 0, y: 0 }, pari: 0, n: giocate.length, vp: { x: 0, y: 0 }, fuori: {} };
      for (const g of giocate){
        if (g.vincitore) r.vince[g.vincitore]++; else r.pari++;
        r.vp.x += g.vp.x || 0; r.vp.y += g.vp.y || 0;
        for (const f of g.fuori || []) r.fuori[`${f.lista}|${f.name}`] = (r.fuori[`${f.lista}|${f.name}`] || 0) + 1;
      }
      parentPort.postMessage({ id, r });
    } catch (e){
      parentPort.postMessage({ id, errore: String(e && e.stack || e).slice(0, 800) });
    }
  });
  parentPort.postMessage({ pronto: true });
}

if (!isMainThread) await lavora();

/* ---------------- chi distribuisce ---------------- */
export async function apriMotore({ lavori = Math.max(1, os.cpus().length - 1) } = {}){
  const liberi = [], attese = new Map(), coda = [];
  let prossimo = 0;
  const avvia = () => new Promise((res, rej) => {
    const w = new Worker(fileURLToPath(import.meta.url));
    w.on('error', rej);
    w.on('message', m => {
      if (m.pronto){ res(w); return; }
      const a = attese.get(m.id); attese.delete(m.id);
      if (m.errore) a.rej(new Error(m.errore)); else a.res(m.r);
      liberi.push(w); spingi();
    });
  });
  const tutti = await Promise.all(Array.from({ length: lavori }, avvia));
  liberi.push(...tutti);
  function spingi(){
    while (liberi.length && coda.length){
      const w = liberi.pop(), { msg, res, rej } = coda.shift();
      attese.set(msg.id, { res, rej });
      w.postMessage(msg);
    }
  }
  return {
    lavori,
    gioca: job => new Promise((res, rej) => { coda.push({ msg: { ...job, id: ++prossimo }, res, rej }); spingi(); }),
    chiudi: () => Promise.all(tutti.map(w => w.terminate())),
  };
}
