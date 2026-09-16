/* L'arbitro e chi gioca.
 *
 * Una partita intera senza pagina: due liste dell'archivio, uno
 * scenario, un seme, e il verdetto. Quello che si prova qui non sono
 * le regole — quelle hanno i loro file — ma le tre cose che l'arbitro
 * deve garantire: che elenchi solo mosse legali, che quello che applica
 * finisca davvero sui pezzi, e che una partita finisca.
 *
 * Si lancia con:  node test/arbitro.mjs
 */
import fs from 'node:fs';
import * as AR from '../src/arbitro.js';
import * as AG from '../src/agente.js';
import * as D from '../src/dice.js';
import * as PR from '../src/profiles.js';
import * as CH from '../src/charge.js';

let fails = 0;
const ok = (label, cond) => {
  console.log((cond ? '  ok   ' : '  FAIL ') + label);
  if (!cond) fails++;
};

const dati = f => JSON.parse(fs.readFileSync(new URL('../dati/' + f, import.meta.url), 'utf8'));
PR.useProfiles(dati('profili.json'));
const liste = dati('liste.json');
const A = liste[3], B = liste[4];       // le due «Strada delle Pietre», 750 punti

/* i dadi con il seme: una prova che tira dadi veri non è una prova */
const seme = s => { let x = s >>> 0 || 1; D.setSource(n => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x % n; }); };

/* ================================================================= */
console.log('il tavolo');
seme(1);
let S = AR.newBattle({ A, B, scenario:'bm-strada', nomi:{ A:'Lucertole', B:'Orchi' } });
ok('le due liste diventano due eserciti',
   AR.unitsOf(S, 'A').length === A.units.length && AR.unitsOf(S, 'B').length === B.units.length);
ok('con il tavolo dello scenario', S.table.wIn === 48 && S.table.hIn === 36);
ok('il terreno dello scenario c e, e sa se blocca la vista',
   S.terrain.length > 5 && S.terrain.some(t => t.blocks) && S.terrain.every(t => typeof t.contains === 'function'));
ok('le due zone di schieramento stanno una per lato',
   S.zones.A[0].y > S.zones.B[0].y);
ok('nessuno è ancora in campo', AR.inCampo(S, 'A').length === 0);
ok('la Forza d Unità di partenza è segnata', S.usStart.A > 0 && S.usStart.B > 0);

/* ================================================================= */
console.log('\nlo schieramento (p. 115)');
let o = AR.options(S);
ok('si comincia schierando', o.fase === 'Schieramento' && o.list.every(x => x.id === 'schiera'));
ok('e i posti sono dentro la zona', o.list.every(x =>
   x.y >= S.zones.A[0].y && x.y <= S.zones.A[0].y + S.zones.A[0].h));
ok('ogni posto dice dov è', o.list.every(x => x.dove && x.why));
const primo = o.list[0];
AR.apply(S, primo);
ok('schierare mette l unità in campo', AR.inCampo(S, 'A').length === 1);
ok('e poi tocca all altro', AR.options(S).player === 'B');
ok('lo stesso posto non si offre due volte',
   !AR.options(S).list.some(x => Math.abs(x.x - primo.x) < 1 && Math.abs(x.y - primo.y) < 1 && x.uid === primo.uid));

/* ================================================================= */
console.log('\nun gesto che non si può fare');
const nada = AR.apply(S, { id:'tira', uid: 9999, target: 9998 });
ok('un gesto illegale non viene applicato di nascosto', nada.ok === false);
ok('e dice perché', /unità sconosciuta/.test(nada.text));
ok('un gesto che non esiste nemmeno', AR.apply(S, { id:'vola' }).ok === false);

/* ================================================================= */
console.log('\nuna partita intera, giocata dall euristica');
for (const s of [1, 7, 19]){
  seme(s);
  const G = AR.newBattle({ A, B, scenario:'bm-strada', nomi:{ A:'Lucertole', B:'Orchi' } });
  const esito = await AG.giocaPartita(AR, G, {
    A: AG.agenteEuristico({ nome:'a' }), B: AG.agenteEuristico({ nome:'b' }),
  });
  ok(`seme ${s}: la partita finisce, e con un verdetto`,
     G.finita && !!esito && typeof esito.A === 'number' && !!esito.label);
  ok(`seme ${s}: qualcuno si è mosso e qualcuno è caduto`,
     G.log.some(r => /avanza|marcia/.test(r.text)) &&
     G.log.some(r => /ferit|a terra|spazzata/.test(r.text)));
  ok(`seme ${s}: nessuna mossa è stata rifiutata`,
     !G.log.some(r => /rifiutat/.test(r.text)));
  ok(`seme ${s}: il registro porta le pagine del manuale`,
     G.log.filter(r => r.page).length > 20);
  /* nessuno finisce dentro un nemico o fuori dal tavolo */
  ok(`seme ${s}: nessuno esce dal tavolo restandoci`,
     AR.inCampo(G, 'A').concat(AR.inCampo(G, 'B'))
       .every(u => u.x >= 0 && u.y >= 0 && u.x <= G.table.w && u.y <= G.table.h));
}

/* la stessa partita con lo stesso seme è la stessa partita */
const gioca = async s => {
  seme(s);
  const G = AR.newBattle({ A, B, scenario:'bm-strada', nomi:{ A:'L', B:'O' } });
  await AG.giocaPartita(AR, G, { A: AG.agenteEuristico({}), B: AG.agenteEuristico({}) });
  return G.log.map(r => r.text).join('|');
};
ok('con lo stesso seme la partita si rigioca identica', (await gioca(4)) === (await gioca(4)));
ok('e con un seme diverso cambia', (await gioca(4)) !== (await gioca(5)));

/* ================================================================= */
console.log('\nil combattimento a più di due, in partita');
{
  seme(3);
  const G = AR.newBattle({ A, B, scenario:'bm-strada' });
  const mie = AR.unitsOf(G, 'A'), sue = AR.unitsOf(G, 'B');
  const preda = mie[2], uno = sue[1], due = sue[2];
  for (const u of [preda, uno, due]) u.placed = true;
  preda.x = 600; preda.y = 600; preda.rot = 0;
  /* due nemici portati a contatto: uno di fronte e uno di fianco */
  for (const [chi, dove] of [[uno, { x: 600, y: 400 }], [due, { x: 400, y: 600 }]]){
    chi.x = dove.x; chi.y = dove.y; chi.rot = 180;
    const al = CH.alignTo(AR.boxOf(chi, G.units), AR.boxOf(preda, G.units));
    chi.x = al.x; chi.y = al.y; chi.rot = al.rot;
  }
  const g = AR.gruppiInMischia(G);
  ok('due che ne toccano una sola fanno un gruppo solo',
     g.length === 1 && g[0].A.length === 1 && g[0].B.length === 2);
  G.schierando = false; G.casella = 4; G.army = 'B';
  const opts = AR.options(G);
  ok('e il combattimento si offre come uno', opts.list.filter(x => x.id === 'combatti').length === 1);
  const r = AR.apply(G, opts.list[0]);
  ok('si risolve', r.ok);
  ok('e il registro racconta il conto della parte (p. 153)',
     G.log.some(x => /Risultato:/.test(x.text) && x.page === 153));
  ok('una volta sola per turno', !AR.options(G).list.some(x => x.id === 'combatti'));
}

/* ================================================================= */
console.log('\nla fotografia che si mette davanti a chi gioca');
seme(2);
S = AR.newBattle({ A, B, scenario:'bm-strada', nomi:{ A:'Lucertole', B:'Orchi' } });
for (let i = 0; i < 6; i++){ const oo = AR.options(S); AR.apply(S, oo.list[0]); }
const foto = AR.fotografia(S, { per: 'A' });
ok('dice di chi è il turno e quanti punti valgono le due parti',
   /Lucertole/.test(foto) && /Orchi/.test(foto) && /punti/.test(foto));
ok('e per ogni unità dice quanti modelli restano e il profilo',
   /modelli/.test(foto) && /WS \d/.test(foto) && /M \d/.test(foto));
ok('con la distanza dal nemico più vicino, in pollici', /a \d+(\.\d+)?″/.test(foto));

/* ================================================================= */
console.log('\nil modello di linguaggio, senza rete');
{
  /* una finta risposta: si prova che l'agente legge il numero e che
     quando sbaglia non aggiusta di nascosto, ma lo dice */
  const finta = risposta => async () => ({
    ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: risposta }] } }] }),
  });
  const S2 = AR.newBattle({ A, B, scenario:'bm-strada' });
  const opzioni = AR.options(S2);
  const ctx = { opzioni, fotografia: AR.fotografia(S2), registro: '' };

  const buono = AG.agenteGemini({ apiKey:'x', fetchFn: finta('{"scelta": 2, "perche": "il centro è la chiave"}') });
  const r1 = await buono.scegli(ctx);
  ok('sceglie la mossa che ha detto', r1.scelta === opzioni.list[1]);
  ok('e porta il suo perché', /la chiave/.test(r1.perche));

  const fuori = AG.agenteGemini({ apiKey:'x', fetchFn: finta('{"scelta": 99}') });
  const r2 = await fuori.scegli(ctx);
  ok('se sceglie fuori elenco non viene aggiustato di nascosto', !!r2.errore);
  ok('gioca l euristica, e lo scrive', /euristica/.test(r2.perche) && opzioni.list.includes(r2.scelta));

  const rotto = AG.agenteGemini({ apiKey:'x', fetchFn: async () => ({ ok:false, status:500, text: async () => 'boom' }) });
  const r3 = await rotto.scegli(ctx);
  ok('e se la rete cade la partita continua lo stesso', opzioni.list.includes(r3.scelta) && /500/.test(r3.perche));

  const senza = AG.agenteGemini({ apiKey:'' });
  ok('senza chiave gioca l euristica e lo dice', /nessuna chiave/.test((await senza.scegli(ctx)).perche));
}

/* ================================================================= */
console.log('\nquello che questo arbitro non fa, detto');
ok('i limiti sono dichiarati uno per uno', AR.LIMITI.length >= 5 && AR.LIMITI.every(l => l.what && l.why));
{
  seme(8);
  const G = AR.newBattle({ A, B, scenario:'bm-strada' });
  await AG.giocaPartita(AR, G, { A: AG.agenteEuristico({}), B: AG.agenteEuristico({}) });
  ok('e quelli che sono capitati finiscono nel registro',
     G.detto.size > 0 && G.log.some(r => /\[limite\]/.test(r.text)));
}

/* ================================================================= */
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
