/* Schieramento Old World — una serie fra due liste, e che fine fanno le unità
 *
 *   node tools/liste/gioca.mjs --x <lista> --y <lista> [--scenario bm-strada] [--partite 20] [--seme 1]
 *                              [--candidate file.json] [--json]
 *
 * Gioca la stessa serie di `partita.mjs --partite N --specchio --estro`
 * — stessi semi, stesso estro, stessa euristica — ma senza passare da
 * dati/liste.json: le liste si cercano anche in `--candidate`, un file
 * con un elenco di liste (quello che scrive `valuta.mjs`). Così provare
 * trenta candidate non tocca l'archivio, che l'app sincronizza.
 *
 * Una lista si dice per id o per nome. Senza --json stampa, per ogni
 * unità, quante volte è stata distrutta o è fuggita, quanti modelli ha
 * perso, e se è rimasta fuori dallo schieramento: è da qui che si capisce
 * PERCHÉ una lista perde, non solo quanto. Con --json scrive una riga
 * sola con i conti, che è quella che legge `valuta.mjs`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as AR from '../../src/arbitro.js';
import * as AG from '../../src/agente.js';
import * as D from '../../src/dice.js';
import * as PR from '../../src/profiles.js';
import * as ARM from '../../src/armies.js';
import * as MG from '../../src/magic.js';
import { SCENARIOS } from '../../src/scenarios.js';
import * as SE from '../serie.mjs';

const qui = path.dirname(fileURLToPath(import.meta.url));
const dati = f => JSON.parse(fs.readFileSync(path.join(qui, '..', '..', 'dati', f), 'utf8'));

const argv = process.argv.slice(2);
const arg = (k, def) => { const i = argv.indexOf('--' + k); return i < 0 ? def : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };

PR.useProfiles(dati('profili.json'));
ARM.useArmies(ARM.makeArmies(dati(path.join('eserciti', 'indice.json')).file.map(f => dati(path.join('eserciti', f)))));
const magia = MG.useMagic(MG.makeMagic(dati(path.join('magia', 'domini.json'))));
const miei = (() => { try { return dati('scenari.json') || []; } catch (_){ return []; } })();
const TUTTI = { ...SCENARIOS, ...Object.fromEntries(miei.filter(s => s && s.id && s.table && s.deploy).map(s => [s.id, s])) };

const scenario = arg('scenario', 'bm-strada');
const partite = +arg('partite', 20), seme = +arg('seme', 1), json = arg('json', false) === true;
if (!TUTTI[scenario]){ console.error(`Scenario «${scenario}» sconosciuto.`); process.exit(1); }

const candidate = arg('candidate', null);
const tutte = [...(candidate ? JSON.parse(fs.readFileSync(candidate, 'utf8')) : []), ...dati('liste.json')];
const trova = chi => tutte.find(l => l.id === chi) || tutte.find(l => l.name === chi);
const liste = { x: trova(arg('x', '')), y: trova(arg('y', '')) };
for (const t of ['x', 'y']) if (!liste[t]){ console.error(`Non trovo la lista «${arg(t, '')}» (--${t}): per id o per nome.`); process.exit(1); }

/* che fine fa ogni unità, e con quale esito della partita */
const unita = {}, perEsito = {}, magie = { x: new Map(), y: new Map() };
const osservatore = {
  nuova(){}, passo(){},
  fine(S, e, ctx){
    const esito = !e.winner ? 'pari' : ctx.zona[e.winner] === 'x' ? 'vinta' : 'persa';
    for (const u of S.units){
      const t = ctx.zona[u.army], k = t + '|' + u.name;
      const s = unita[k] ||= { n: 0, morta: 0, fuggita: 0, persi: 0, tot: 0 };
      s.n++; if (u.dead) s.morta++; else if (u.fled) s.fuggita++;
      s.persi += u.lost || 0; s.tot += u.models || 1;
      const q = perEsito[esito + '|' + k] ||= { n: 0, via: 0 }; q.n++; if (u.dead || u.fled) q.via++;
    }
    for (const r of S.log || []){
      const m = /^(.+?) lancia (.+?):.*— (lanciato|fallito|non lanciato)/.exec(r.text || r.t || '');
      const chi = m && S.units.find(u => u.name === m[1]);
      if (chi){ const t = ctx.zona[chi.army], k = `${m[2]} ${m[3]}`; magie[t].set(k, (magie[t].get(k) || 0) + 1); }
    }
  },
};

const giocate = await SE.giocaSerie({ AR, AG, D, liste, nomi: { x: liste.x.name, y: liste.y.name }, scenario,
  def: TUTTI[scenario], magia, partite, seme, specchio: true, osservatore,
  agente: (lista, nome, s) => AG.agenteEuristico({ nome, estro: D.seeded(SE.semeEstro(s, lista)) }) });

const conta = { x: 0, y: 0, pari: 0 };
for (const g of giocate) g.vincitore ? conta[g.vincitore]++ : conta.pari++;
const media = f => giocate.reduce((a, g) => a + f(g), 0) / giocate.length;
/* chi è rimasto fuori dallo schieramento (p. 115): una serie in cui
   un'unità manca sempre misura un'altra lista */
const fuori = {};
for (const g of giocate) for (const f of g.fuori || []) fuori[`${f.lista}|${f.name}`] = (fuori[`${f.lista}|${f.name}`] || 0) + 1;

if (json){
  console.log(JSON.stringify({ x: liste.x.id, y: liste.y.id, scenario, partite: giocate.length,
    vince: { x: conta.x, y: conta.y }, pari: conta.pari,
    vp: { x: Math.round(media(g => g.vp.x)), y: Math.round(media(g => g.vp.y)) }, fuori }));
  process.exit(0);
}

const pc = (a, b) => String(Math.round(100 * a / (b || 1))).padStart(3) + '%';
console.log(`${liste.x.name} vince ${conta.x}, ${liste.y.name} ${conta.y}, pari ${conta.pari}` +
            ` — punti vittoria ${media(g => g.vp.x).toFixed(0)} a ${media(g => g.vp.y).toFixed(0)}, finita al turno ${media(g => g.turno).toFixed(1)}`);
for (const [k, s] of Object.entries(unita))
  console.log(`  ${k.padEnd(34)} distrutta ${pc(s.morta, s.n)}  in fuga ${pc(s.fuggita, s.n)}  modelli persi ${pc(s.persi, s.tot)}` +
              (fuori[k] ? `  FUORI in ${fuori[k]} partite` : ''));
for (const t of ['x', 'y']) if (magie[t].size)
  console.log(`  magia ${t}: ` + [...magie[t]].map(([k, v]) => `${k} ${v}`).join(', '));
console.log('  distrutta o in fuga, nelle partite vinte e in quelle perse da x:');
for (const k of Object.keys(unita)){
  const v = perEsito['vinta|' + k], p = perEsito['persa|' + k];
  console.log(`    ${k.padEnd(32)} vinte ${v ? pc(v.via, v.n) : '   -'}   perse ${p ? pc(p.via, p.n) : '   -'}`);
}
