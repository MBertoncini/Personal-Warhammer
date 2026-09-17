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
import * as CB from '../src/combat.js';
import { polysOverlap } from '../src/geom.js';
import { spawnSync } from 'node:child_process';
import * as MG from '../src/magic.js';
import * as EF from '../src/effects.js';
import { MM } from '../src/util.js';

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
const seme = s => D.setSource(D.seeded(s));
/* le caselle per nome: il turno dell'arbitro cresce (la congiurazione
   e' arrivata in testa), e un indice scritto a mano smette di voler dire
   quello che diceva */
const casella = id => AR.CASELLE.findIndex(c => c.id === id);

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
  G.schierando = false; G.casella = AR.CASELLE.findIndex(c => c.id === 'mischia'); G.army = 'B';
  const opts = AR.options(G);
  ok('e il combattimento si offre come uno', opts.list.filter(x => x.id === 'combatti').length === 1);
  const r = AR.apply(G, opts.list[0]);
  ok('si risolve', r.ok);
  ok('e il registro racconta il conto della parte (p. 153)',
     G.log.some(x => /Risultato:/.test(x.text) && x.page === 153));
  ok('una volta sola per turno', !AR.options(G).list.some(x => x.id === 'combatti'));
}

/* ================================================================= */
console.log('\nla magia in partita (pp. 106-111)');
const M = MG.makeMagic(dati('magia/domini.json'));
/* le due liste del Monolite: uno Skink Priest contro un Night Goblin
   Oddnob. Il file non dice il Livello di nessuno dei due, e il libro sì */
const L1 = liste[1], L2 = liste[2];
const conScheda = (l, units) => ({ ...l, prep: { general: null, bsb: null, note: '', units } });
{
  seme(1);
  const G = AR.newBattle({ A: L1, B: L2, scenario: 'bm-monolite', magia: M });
  const prete = G.units.find(u => u.name === 'Skink Priest');
  const nob = G.units.find(u => u.name === 'Night Goblin Oddnob');
  ok('i due maghi li riconosce il libro, con il Livello di base',
     prete.mago.level === 1 && nob.mago.level === 3 && /Legends: Lizardmen, p\. 4/.test(prete.mago.da));
  ok('e il Livello che il file non dice è un limite dichiarato', G.log.some(r => /\[limite\] il Livello/.test(r.text)));
  const o = AR.options(G);
  ok('prima di schierare si sceglie il dominio, e sceglie chi schiera quel mago',
     o.fase === 'Incantesimi' && o.player === 'A' && o.list.every(x => x.id === 'dominio') &&
     o.list.map(x => x.lore).join() === 'battle,elementalism,illusion');
  ok('ogni dominio dice quanti incantesimi l app gioca davvero', o.list.every(x => /ne gioca \d su 7/.test(x.why)));
  AR.apply(G, o.list[0]);
  ok('scelto il dominio, gli incantesimi si tirano: uno per Livello',
     prete.mago.lore === 'battle' && prete.mago.known.length === 1 &&
     G.log.some(r => /Skink Priest, Livello 1 .* Battle Magic: \d/.test(r.text) && r.page === 106));
  /* finché ci sono maghi da preparare non si schiera nessuno */
  let passi = 0;
  while (G.preparando && passi++ < 10){ const oo = AR.options(G); AR.apply(G, oo.list[0]); }
  ok('poi il Night Goblin, e solo dopo si schiera',
     nob.mago.known.length === 3 && AR.options(G).fase === 'Schieramento');
  ok('senza Lore of Mork nel file, gli innesti li porta la scheda del libro', nob.mago.regole.includes('Lore of Mork'));
}
{
  /* la scheda di preparazione vince sul libro: Livello, dominio, e gli
     incantesimi già tirati quando li porta come id */
  const A = conScheda(L1, { 1: { level: 2, lore: 'battle', spellIds: ['fireball', 'oakenShield'] } });
  const G = AR.newBattle({ A, B: L2, scenario: 'bm-monolite', magia: M });
  const prete = G.units.find(u => u.name === 'Skink Priest');
  ok('Livello e incantesimi dalla scheda, senza tirare niente',
     prete.mago.level === 2 && prete.mago.known.join() === 'fireball,oakenShield' &&
     /scheda/.test(prete.mago.da));
  const B = conScheda(L2, { 1: { lore: 'illusion' } });
  const H = AR.newBattle({ A: L1, B, scenario: 'bm-monolite', magia: M });
  ok('con il dominio scritto nella scheda non si chiede, si tira',
     H.units.find(u => u.name === 'Night Goblin Oddnob').mago.known.length === 3);
}
{
  const G = AR.newBattle({ A: liste[12], B: L2, scenario: 'bm-monolite', magia: M });
  const w = G.units.find(u => u.name === 'Warlock Engineer');
  ok('un Warlock Engineer senza scheda non è un mago, e lo si dice',
     !(w.mago && w.mago.level) && G.log.some(r => /Warlock Engineer: il libro lo fa mago solo con un'opzione/.test(r.text)));
  MG.useMagic(null);
  /* senza i dati del libro, un mago si riconosce solo da quello che
     dice la scheda: qui il Livello */
  const H = AR.newBattle({ A: conScheda(L1, { 1: { level: 2 } }), B: L2, scenario: 'bm-monolite' });
  ok('senza i domini caricati la magia non si gioca, e lo dice',
     !H.preparando && H.log.some(r => /\[limite\] la magia non si gioca/.test(r.text)) &&
     !H.units.some(u => u.mago));
  ok('e «la fase di magia non si gioca» non è più fra i limiti', !AR.LIMITI.some(l => l.id === 'magia'));
}
{
  /* Un lancio intero con i dadi scelti: Fireball su una mob a dodici
     pollici, il Night Goblin prova a dissolverlo e non ce la fa. */
  const A = conScheda(L1, { 1: { level: 2, lore: 'battle', spellIds: ['fireball', 'oakenShield'] } });
  const B = conScheda(L2, { 1: { lore: 'illusion', spellIds: ['miasmicMirage'] } });
  const G = AR.newBattle({ A, B, scenario: 'bm-monolite', magia: M });
  ok('con gli incantesimi dalla scheda non c è niente da preparare', !G.preparando);
  const prete = G.units.find(u => u.name === 'Skink Priest');
  const mob = G.units.find(u => u.name === 'Night Goblin Mobs');
  const nob = G.units.find(u => u.name === 'Night Goblin Oddnob');
  for (const u of [prete, mob, nob]) u.placed = true;
  prete.x = 600; prete.y = 900; prete.rot = 0;
  mob.x = 600; mob.y = 900 - 12 * MM; mob.rot = 180;
  nob.x = 700; nob.y = 900 - 12 * MM; nob.rot = 180;
  G.schierando = false; G.army = 'A'; G.turno = 1;
  G.casella = AR.CASELLE.findIndex(c => c.id === 'tiro');
  const o = AR.options(G);
  const fuoco = o.list.find(x => x.id === 'lancia' && x.spell === 'fireball' && x.target === mob.uid);
  ok('nel tiro la Fireball si offre, con la probabilità e le perdite attese',
     !!fuoco && fuoco.chance > 0.7 && fuoco.chance < 0.75 && /≈ \d/.test(fuoco.why) && /riesce il 7\d%/.test(fuoco.why));
  ok('un potenziamento nel tiro non si offre (p. 108)', !o.list.some(x => x.spell === 'oakenShield'));

  /* i dadi: 4 e 5 per il lancio, 1 e 2 per il dissolvimento, 3 e 3 per
     i colpi; poi quelli che servono al tiro per ferire */
  const coda = [4, 5, 1, 2, 3, 3];
  D.setSource(n => (coda.length ? coda.shift() : 4) - 1);
  const r = AR.apply(G, fuoco);
  ok('lanciata con 11: 4 + 5 + 2 di Livello',
     r.ok && G.log.some(x => /lancio 4 \+ 5 \+ 2 di Livello = 11 contro 8\+ — lanciato/.test(x.text)));
  const d = AR.options(G);
  ok('e il dissolvimento tocca all altro giocatore, subito', d.player === 'B' && d.fase === 'Magia');
  ok('con il suo mago, la sorte e il lasciar perdere',
     d.list.some(x => x.id === 'dissolvi' && x.uid === nob.uid) && d.list.some(x => x.fato) &&
     d.list.some(x => x.id === 'lascia'));
  ok('mentre si aspetta la risposta non si fa altro',
     AR.apply(G, { id:'tira', uid: prete.uid, target: mob.uid }).ok === false);
  const persi = mob.lost || 0;
  AR.apply(G, d.list.find(x => x.id === 'dissolvi' && x.uid === nob.uid));
  ok('1 + 2 + 3 non supera 11: tiene (p. 110)',
     G.log.some(x => /Night Goblin Oddnob contro Fireball: dissolvimento 1 \+ 2 \+ 3 di Livello = 6 contro 11 — tiene/.test(x.text)));
  ok('e i colpi arrivano: 3 + 3 = 6, senza tirare per colpire',
     G.log.some(x => /Fireball: 2D6 → 3 \+ 3 = 6 colpi/.test(x.text)) &&
     G.log.some(x => /Night Goblin Mobs: 6 colpi a Forza 4/.test(x.text)));
  ok('e i goblin caduti restano caduti', (mob.lost || 0) > persi);
  ok('la domanda è chiusa', !G.pending && AR.options(G).player === 'A');
  ok('e la Fireball non si offre una seconda volta nello stesso turno',
     !AR.options(G).list.some(x => x.spell === 'fireball'));

  /* la maledizione del Night Goblin, nel suo turno: un effetto a tempo
     che l'arbitro mette e poi toglie */
  G.army = 'B'; G.casella = AR.CASELLE.findIndex(c => c.id === 'congiura');
  const mm = AR.options(G).list.find(x => x.spell === 'miasmicMirage' && x.target === prete.uid);
  ok('in congiurazione la maledizione si offre sullo Skink Priest', !!mm);
  coda.push(6, 5);
  AR.apply(G, mm);
  ok('il dissolvimento tocca ad A', AR.options(G).player === 'A');
  AR.apply(G, { id:'lascia' });
  ok('lasciata passare, lo Skink Priest ha il −2 al Movimento e non marcia',
     EF.statOf(prete, 'M').value === 4 && EF.flagsOf(prete).flags.noMarch);
  /* fine turno di B, inizio del turno 2 di A: «fino al tuo prossimo
     inizio turno» vuol dire che tiene ancora, e scade quando torna B */
  G.casella = AR.CASELLE.length - 1; G.primo = 'A';
  AR.apply(G, { id:'avanti' });
  ok('al turno di A il Miasmic Mirage è ancora lì', G.army === 'A' && EF.flagsOf(prete).flags.noMarch);
  G.casella = AR.CASELLE.length - 1;
  AR.apply(G, { id:'avanti' });
  ok('e quando torna B, finisce', G.army === 'B' && !EF.flagsOf(prete).flags.noMarch &&
     G.log.some(x => /finisce Miasmic Mirage/.test(x.text)));
}
{
  /* e una partita intera con due maghi, giocata dall'euristica */
  for (const s of [1, 2, 3]){
    seme(s);
    const G = AR.newBattle({ A: L1, B: L2, scenario: 'bm-monolite', magia: M });
    await AG.giocaPartita(AR, G, { A: AG.agenteEuristico({}), B: AG.agenteEuristico({}) });
    ok(`seme ${s}: la partita con due maghi finisce`, G.finita && !!G.esito);
    ok(`seme ${s}: nessuna mossa rifiutata`, !G.log.some(r => /rifiutat/.test(r.text)));
    ok(`seme ${s}: il registro porta almeno un lancio`, G.log.some(r => / lancia .*: lancio /.test(r.text)));
    if (s > 1) ok(`seme ${s}: e almeno un dissolvimento`, G.log.some(r => /contro .*: dissolvimento/.test(r.text)));
  }
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
/* il ritmo e il ritentare: una partita fa un centinaio di domande di
   fila, e le quote gratuite le contano al minuto */
{
  const S3 = AR.newBattle({ A, B, scenario:'bm-strada' });
  const o3 = AR.options(S3);
  const ctx3 = { opzioni: o3, fotografia: '', registro: '' };
  let quante = 0;
  const dueVolte = async () => {
    quante++;
    if (quante === 1) return { ok:false, status:429, text: async () => 'quota' };
    return { ok:true, json: async () => ({ candidates:[{ content:{ parts:[{ text:'{"scelta":1,"perche":"ok"}' }] } }] }) };
  };
  const dormite = [];
  const paziente = AG.agenteGemini({ apiKey:'x', fetchFn: dueVolte, ritenta: 2,
                                     dormi: ms => { dormite.push(ms); return Promise.resolve(); } });
  const r4 = await paziente.scegli(ctx3);
  ok('un 429 non fa perdere la mossa: si aspetta e si richiede',
     quante === 2 && r4.scelta === o3.list[0] && !r4.errore);
  ok('e l attesa è dichiarata, non istantanea', dormite.length === 1 && dormite[0] >= 1000);

  let chiamate = 0;
  const sempre = async () => { chiamate++; return { ok:false, status:400, text: async () => 'chiave finta' }; };
  const subito = AG.agenteGemini({ apiKey:'x', fetchFn: sempre, ritenta: 3, dormi: () => Promise.resolve() });
  const r5 = await subito.scegli(ctx3);
  ok('ma un errore che non è traffico non si ritenta', chiamate === 1 && !!r5.errore);

  const passi = [];
  const lento = AG.agenteGemini({ apiKey:'x', ritenta: 0, attesa: 5000,
    fetchFn: async () => ({ ok:true, json: async () => ({ candidates:[{ content:{ parts:[{ text:'{"scelta":1}' }] } }] }) }),
    dormi: ms => { passi.push(ms); return Promise.resolve(); } });
  await lento.scegli(ctx3); await lento.scegli(ctx3);
  ok('fra una domanda e l altra passa il tempo che gli si dice',
     passi.length === 1 && passi[0] > 4000);
}


/* =================================================================
   Il tavolo che non si compenetra. Sono le prove dei difetti trovati
   rileggendo la prima partita fra due modelli: ognuna mette i pezzi a
   mano, fa un gesto e guarda dove sono finiti.
   ================================================================= */
const { interni: IN } = AR;
const uid = (G, n) => G.units.find(u => u.uid === n);
const metti = (G, u, x, y, rot = u.army === 'A' ? 0 : 180) => { u.placed = true; u.x = x; u.y = y; u.rot = rot; return u; };
const aContattoDi = (G, u, t) => {
  const al = CH.alignTo(AR.boxOf(u, G.units), AR.boxOf(t, G.units));
  u.x = al.x; u.y = al.y; u.rot = al.rot; return al;
};
const dentro = (G, a, b) => polysOverlap(AR.cornersOf(a, G.units), AR.cornersOf(b, G.units));
const nuova = () => { const G = AR.newBattle({ A, B, scenario:'bm-strada' }); G.schierando = false; return G; };

console.log('\ni nomi uguali');
{
  const G = nuova();
  const sk = AR.unitsOf(G, 'A').filter(u => u.baseName === 'Skink Skirmishers');
  ok('tre unità omonime prendono un numero',
     sk.map(u => u.name).join('|') === 'Skink Skirmishers 1|Skink Skirmishers 2|Skink Skirmishers 3');
  ok('chi è unico resta com è', uid(G, 6).name === 'Temple Guard');
  ok('e il profilo si cerca con il nome del libro',
     PR.moveInfo({ name:'Orc Boar Boy Mobs 2', baseName:'Orc Boar Boy Mobs', stats:{ M:'-' } }).m === 7);
}

console.log('\nil bordo del tavolo (pp. 132, 134)');
{
  const G = nuova();
  const tg = metti(G, uid(G, 6), 600, 450);
  ok('un reggimento al centro è sul tavolo', AR.sulTavolo(G, tg));
  metti(G, tg, 40, 450);
  ok('e con un angolo fuori non lo è più', !AR.sulTavolo(G, tg));
}

console.log('\ncedere terreno e seguire (p. 134)');
{
  const G = nuova();
  const tg = metti(G, uid(G, 6), 600, 500);
  const bo = metti(G, uid(G, 503), 600, 300);
  aContattoDi(G, bo, tg);
  const y0 = tg.y;
  const fatto = IN.indietreggia(G, tg, [bo], 2, { kind:'give' });
  ok('chi cede terreno a mezzo tavolo si sposta davvero di 2″',
     Math.abs((tg.y - y0) - 2 * 25.4) < 1 && G.log.some(r => /cede terreno di 2″/.test(r.text)));
  ok('e resta girato verso il nemico', tg.rot === 0);
  IN.seguire(G, [bo], tg, fatto);
  ok('chi ha vinto lo segue e restano a contatto', AR.ingaggiata(G, tg) && !dentro(G, tg, bo));

  /* un amico subito dietro ferma il passo indietro */
  const G2 = nuova();
  const t2 = metti(G2, uid(G2, 6), 600, 500);
  const sk = metti(G2, uid(G2, 3), 600, 500 + 45 + 31.35 + 10);
  const b2 = metti(G2, uid(G2, 503), 600, 300);
  aContattoDi(G2, b2, t2);
  IN.indietreggia(G2, t2, [b2], 2, { kind:'give' });
  ok('chi ha un amico dietro si ferma contro di lui, e lo dice',
     t2.y - 500 < 2 * 25.4 - 1 && !dentro(G2, t2, sk) &&
     G2.log.some(r => /si ferma contro Skink Skirmishers 1/.test(r.text)));
}

console.log('\nripiegare in ordine (p. 134)');
{
  const G = nuova();
  const tg = metti(G, uid(G, 6), 600, 450);
  const bo = metti(G, uid(G, 503), 600, 250);
  aContattoDi(G, bo, tg);
  IN.indietreggia(G, tg, [bo], 6, { kind:'fallBack' });
  ok('a mezzo tavolo chi ripiega resta in gioco (prima usciva sempre)', !tg.dead && AR.sulTavolo(G, tg));
  const vicino = metti(G, uid(G, 7), 300, G.table.h - 60);
  const orco = metti(G, uid(G, 505), 300, G.table.h - 300);
  aContattoDi(G, orco, vicino);
  IN.indietreggia(G, vicino, [orco], 6, { kind:'fallBack' });
  ok('vicino al bordo esce dal tavolo', vicino.dead && vicino.fledOff);
}

console.log('\nil movimento non attraversa nessuno (p. 118)');
{
  const G = nuova();
  const sv = metti(G, uid(G, 1), 600, 760);
  const bas = metti(G, uid(G, 7), 600, 640);
  const nem = metti(G, uid(G, 505), 600, 150);
  const r = AR.apply(G, { id:'marcia', uid: sv.uid, verso: nem.uid });
  ok('la marcia si fa', r.ok);
  ok('e chi ha un amico davanti non gli finisce dentro', !dentro(G, sv, bas));
  ok('e si sposta lo stesso, girandoci intorno', Math.hypot(sv.x - 600, sv.y - 760) > 25);

  const G2 = nuova();
  const tg = metti(G2, uid(G2, 6), 600, 600);
  const e2 = metti(G2, uid(G2, 505), 600, 380);
  AR.apply(G2, { id:'marcia', uid: tg.uid, verso: e2.uid });
  ok('chi marcia verso un nemico si ferma a un pollice', AR.distanza(G2, tg, e2) >= 0.98 && AR.distanza(G2, tg, e2) < 1.3);
}

console.log('\nla carica che trova il posto occupato');
{
  const G = nuova();
  const bo = metti(G, uid(G, 503), 600, 400);
  const tg = metti(G, uid(G, 6), 600, 600);
  aContattoDi(G, tg, bo);
  const sv = metti(G, uid(G, 1), 560, 700);
  const posto = IN.postoAContatto(G, sv, bo);
  ok('il secondo caricante trova posto sulla stessa faccia', !!posto && !posto.pieno && posto.arc === 'fronte');
  sv.x = posto.x; sv.y = posto.y; sv.rot = posto.rot;
  ok('senza entrare in chi c era già', !dentro(G, sv, tg));
  ok('e a contatto con il bersaglio', AR.distanza(G, sv, bo) < 0.15);

  /* una faccia da 30 mm coperta da un reggimento da 150 non ha posto */
  const G2 = nuova();
  const wb = metti(G2, uid(G2, 501), 600, 400);
  const t2 = metti(G2, uid(G2, 6), 600, 520);
  aContattoDi(G2, t2, wb);
  const s2 = metti(G2, uid(G2, 1), 600, 640);
  G2.casella = casella('cariche'); G2.army = 'A';
  const cariche = AR.options(G2).list.filter(x => x.id === 'carica' && x.uid === s2.uid);
  ok('e una carica senza posto non si offre nemmeno', !cariche.some(x => x.target === wb.uid));
}

console.log('\nla carica su chi è fuggito (p. 121)');
{
  const G = nuova();
  const sv = metti(G, uid(G, 1), 600, 600);
  const wb = metti(G, uid(G, 501), 600, 400);
  const d = CH.declareCharge({ charger: { name: sv.name, box: AR.boxOf(sv, G.units), move: 4 },
                               target: { name: wb.name, box: AR.boxOf(wb, G.units) } });
  IN.fuggi(G, wb, sv, 2);
  D.setSource(() => 5);                                  // tutti sei
  IN.muoviCarica(G, sv, wb, d);
  ok('chi la raggiunge lo stesso la travolge', wb.dead &&
     G.log.some(r => /che fugge.*travolta/.test(r.text)));
  const G2 = nuova();
  const s2 = metti(G2, uid(G2, 1), 600, 600);
  const w2 = metti(G2, uid(G2, 501), 600, 400);
  const d2 = CH.declareCharge({ charger: { name: s2.name, box: AR.boxOf(s2, G2.units), move: 4 },
                                target: { name: w2.name, box: AR.boxOf(w2, G2.units) } });
  IN.fuggi(G2, w2, s2, 12);
  D.setSource(() => 0);                                  // tutti uno
  const y0 = s2.y;
  IN.muoviCarica(G2, s2, w2, d2);
  ok('chi non la raggiunge fa la carica fallita, e si muove', !w2.dead && s2.y < y0 &&
     s2.moved.kind === 'failedCharge');
  D.setSource(D.seeded(1));
}

console.log('\nstare fermi non è muoversi (p. 138)');
{
  const G = nuova();
  const sk = metti(G, uid(G, 3), 600, 600);
  metti(G, uid(G, 505), 600, 380);
  G.casella = casella('mosse'); G.army = 'A';
  AR.apply(G, { id:'ferma', uid: sk.uid });
  G.casella = casella('tiro');
  const tiri = AR.options(G).list.filter(x => x.id === 'tira' && x.uid === sk.uid);
  ok('chi è rimasto fermo tira senza il −1 del movimento', tiri.length && tiri.every(x => !/ha mosso/.test(x.why)));
  ok('e l opzione dice la probabilità di colpire', tiri.every(x => /\d+% a tiro/.test(x.why)));
  sk.moved = { kind:'move', inches: 3 };
  ok('chi ha mosso invece lo prende',
     AR.options(G).list.filter(x => x.id === 'tira' && x.uid === sk.uid).every(x => /ha mosso/.test(x.why)));
}

console.log('\nlo schieramento, la prima fila davanti (p. 115)');
{
  const G = AR.newBattle({ A, B, scenario:'bm-strada' });
  const posti = AR.options(G).list;
  const primi = posti.filter(x => !/fila/.test(x.dove)), dietro = posti.filter(x => /fila/.test(x.dove));
  ok('la prima fila di chi sta in basso è la più alta sul tavolo',
     primi.length && dietro.length && Math.max(...primi.map(x => x.y)) < Math.min(...dietro.map(x => x.y)));
}

console.log('\nil Comando del generale');
{
  const G = nuova();
  ok('il generale si riconosce dalla lista', G.generale.B === 501 && G.generale.A === 1);
  metti(G, uid(G, 501), 600, 300);
  const orco = metti(G, uid(G, 505), 600, 450);
  const g = IN.comandoDi(G, orco, 5);
  ok('chi gli sta vicino tira con il suo Comando', g.ld > 5 && /Black Orc Warboss/.test(g.why));
  metti(G, orco, 600, 880);
  ok('chi è lontano con il proprio', IN.comandoDi(G, orco, 5).ld === 5);
  uid(G, 501).fled = true;
  metti(G, orco, 600, 450);
  ok('e un generale in fuga non ispira nessuno', IN.comandoDi(G, orco, 5).ld === 5);
}

console.log('\nla pagina da guardare');
{
  const RP = await import('../tools/replay.mjs');
  const G = nuova();
  const bas = metti(G, uid(G, 7), 600, 600);
  bas.wounds = 3;
  const f1 = RP.fotogramma(G, { AR, army:'A', chi:'Lucertole' });
  const b = f1.unita.find(u => u.n === 'Bastiladon');
  ok('un mostro solo porta le ferite prese, non solo «1/1»', b.fp === 3 && b.fw > 3);
  ok('e il fotogramma dice chi ha giocato', f1.army === 'A' && f1.chi === 'Lucertole');
  const f2 = RP.fotogramma(G, { AR });
  ok('due fotogrammi con il tavolo uguale si riconoscono', RP.stessoTavolo(f1, f2));
  bas.x += 10;
  ok('e due diversi no', !RP.stessoTavolo(f1, RP.fotogramma(G, { AR })));
  const pagina = RP.paginaHTML({ meta: { titolo:'t', sotto:'', piede:'', w: G.table.w, h: G.table.h,
                                         nomi:{ A:'a', B:'b' }, terreno: [], zone: [] },
                                 frames: [{ ...f1, perche:'<img src=x onerror=alert(1)></script><script>alert(2)',
                                            testo:[{ t:'<b>x</b>', p:1, d:null, g:[{ w:'colpire', d:[1, 6] }] }] }] });
  ok('il testo del registro e i perché passano da esc() prima di diventare pagina',
     /esc\(g\.perche\)/.test(pagina) && /esc\(r\.t\)/.test(pagina) && /esc\(u\.n\)/.test(pagina));
  ok('e i dadi si mostrano a mucchi', /dadiDi/.test(pagina));
  ok('un «</script>» in una frase non chiude il blocco dei dati',
     pagina.split('</script>').length === 2 && !/<img src=x/.test(pagina));
  const dentroP = JSON.parse(pagina.split('\n').find(l => l.startsWith('const P = ')).slice(10).replace(/;\s*$/, ''));
  ok('e i dati si rileggono uguali', /<\/script>/.test(dentroP.frames[0].perche));
}

console.log('\nla partita nel diario');
{
  const ARCH = await import('../tools/archivia.mjs');
  seme(1);
  const G = AR.newBattle({ A, B, scenario:'bm-strada' });
  const diario = ARCH.registro(G, { liste: { A, B }, meta: { simulata: true } });
  let visti = 0;
  await AG.giocaPartita(AR, G, {
    A: AG.agenteEuristico({}), B: AG.agenteEuristico({}),
    onPasso: ({ perche }) => { diario.passo({ chi: 'x', perche, righe: G.log.slice(visti) }); visti = G.log.length; },
  });
  const rep = diario.chiudi({ title: 'prova' });
  const mezzi = rep.turns.filter(t => t.kind === 'turn');
  ok('è un report come quelli dell app', rep.format === 'schieramento-old-world/battle-report/1' && rep.title === 'prova');
  ok('con lo schieramento in testa e le liste', rep.turns[0].kind === 'deploy' &&
     rep.roster.A.length === A.units.length && rep.armies.B.name === B.name);
  ok('una fotografia per ogni mezzo turno, senza buchi né doppioni',
     mezzi.every((t, i) => t.n === Math.floor(i / 2) + 1 && t.army === (i % 2 ? 'B' : 'A')));
  ok('e in ognuna quello che è successo', mezzi.every(t => t.events.length > 0));
  ok('il terreno in pollici, come lo scrive il tavolo', rep.terrain.length && rep.terrain.every(t => t.x <= 48 && t.w < 20));
  ok('e resta marcata come simulata', rep.meta.simulata === true);
}

console.log('\nla riga di comando');
{
  const lancia = args => spawnSync(process.execPath, ['tools/partita.mjs', ...args],
                                   { cwd: new URL('..', import.meta.url), encoding: 'utf8' });
  const spezzata = lancia(['--liste', '3,', '4', '--breve']);
  ok('«--liste 3, 4» si legge come «3,4»', spezzata.status === 0 && /B = 4 /.test(spezzata.stdout));
  const monca = lancia(['--liste', '3,', '--breve']);
  ok('e «--liste 3,» non diventa la lista 0: si ferma e lo dice',
     monca.status === 1 && /due numeri/.test(monca.stderr));
  const ignoto = lancia(['--list', '3,4']);
  ok('un argomento sconosciuto si dice', ignoto.status === 1 && /--list/.test(ignoto.stderr));
}

/* =================================================================
   I difetti trovati rileggendo la seconda e la terza partita fra due
   modelli: una lista scritta a mano che giocava a zero, il raduno che
   non falliva mai, la carica che spariva, il Panico a ogni perdita.
   ================================================================= */
console.log('\nuna lista scritta a mano, sul tavolo');
{
  const G = AR.newBattle({ A, B: liste[9], scenario:'bm-strada' });
  const clan = G.units.find(u => u.baseName === 'Clanrats');
  const c = CB.combatant(clan);
  ok('la lista non porta profili, e la tavola li completa anche sul tavolo (prima: tutto a zero)',
     !clan.stats && c.ws === 3 && c.s === 3 && c.t === 3 && c.ld === 4);
  ok('e sa quanto si muove', PR.moveInfo(clan).m === 5);
  ok('il lato del tavolo non fa da fazione', !!PR.profileFor({ ...clan, army:'B' }));
}

console.log('\nil raduno, una volta per turno (p. 117)');
{
  const G = nuova();
  const sk = metti(G, uid(G, 3), 600, 600);
  metti(G, uid(G, 505), 600, 250);
  sk.fled = true;
  G.casella = casella('raduno'); G.army = 'A';
  const prima = AR.options(G).list.find(x => x.id === 'raduna' && x.uid === sk.uid);
  ok('chi fugge può tentare il raduno', !!prima);
  D.setSource(() => 5);                                  // tutti sei: fallisce
  AR.apply(G, prima);
  ok('fallito, resta in fuga', sk.fled);
  ok('e non si offre di nuovo nello stesso turno',
     !AR.options(G).list.some(x => x.id === 'raduna' && x.uid === sk.uid));
  ok('nemmeno a chi lo chiede lo stesso', AR.apply(G, { id:'raduna', uid: sk.uid }).ok === false);
  D.setSource(() => 0);                                  // tutti uno: fugge di 2″
  const y0 = sk.y;
  AR.apply(G, { id:'avanti' });                          // alle cariche
  AR.apply(G, { id:'avanti' });                          // alle mosse
  ok('e nelle mosse continua a fuggire, lontano dal nemico (p. 132)',
     sk.y > y0 && G.log.some(r => /continua a fuggire: 1 \+ 1/.test(r.text)));
  D.setSource(D.seeded(1));
}

console.log('\nla carica su chi fugge come reazione (pp. 120-121)');
{
  const G = nuova();
  const sv = metti(G, uid(G, 1), 600, 600);
  const wb = metti(G, uid(G, 501), 600, 430);
  G.casella = casella('cariche'); G.army = 'A';
  ok('la carica si dichiara', AR.apply(G, { id:'carica', uid: sv.uid, target: wb.uid }).ok);
  const fuga = AR.options(G).list.find(x => x.kind === 'flee');
  ok('e chi la subisce può fuggire', !!fuga);
  D.setSource(() => 0);
  AR.apply(G, fuga);
  ok('dopo la fuga chi caricava tira lo stesso (prima la carica spariva)',
     G.log.some(r => new RegExp(`${sv.name} carica ${wb.name}`).test(r.text)) &&
     sv.moved && /[cC]harge/.test(sv.moved.kind));
  ok('e non può né dichiarare di nuovo né marciare altrove',
     !AR.options(G).list.some(x => x.uid === sv.uid));
  D.setSource(D.seeded(1));

  const G2 = nuova();
  const s2 = metti(G2, uid(G2, 1), 600, 600);
  const w2 = metti(G2, uid(G2, 501), 600, 430);
  w2.fled = true;
  G2.casella = casella('cariche'); G2.army = 'A';
  AR.apply(G2, { id:'carica', uid: s2.uid, target: w2.uid });
  const r2 = AR.options(G2).list;
  ok('chi sta già fuggendo non «tiene la posizione»', r2.length === 1 && r2[0].kind === 'fleeing');
  AR.apply(G2, r2[0]);
  ok('e il registro lo dice', G2.log.some(r => /sta già fuggendo/.test(r.text)));
}

console.log('\ntira e tiene (p. 120)');
{
  const G = nuova();
  const sv = metti(G, uid(G, 1), 600, 600);
  const ng = metti(G, uid(G, 504), 600, 380);
  G.casella = casella('cariche'); G.army = 'A';
  AR.apply(G, { id:'carica', uid: sv.uid, target: ng.uid });
  const spara = AR.options(G).list.find(x => x.kind === 'stand');
  ok('chi ha un arco può scegliere di tirare e tenere', !!spara);
  AR.apply(G, spara);
  ok('e lo fa davvero (prima teneva e basta)', G.log.some(r => /tiene e spara/.test(r.text)));
}

console.log('\nil Panico, un quarto in una fase (p. 141)');
{
  const G = nuova();
  const tg = metti(G, uid(G, 6), 600, 600);
  metti(G, uid(G, 505), 600, 200);
  G.casella = casella('tiro'); G.army = 'B';
  const test = () => G.log.filter(r => /test di Panico/.test(r.text)).length;
  tg.faseTiro = IN.faseDi(G); tg.usInizioFase = 15; tg.lost = 1;
  IN.panico(G, tg, 'prova');
  ok('un modello su quindici non fa tirare', test() === 0);
  tg.lost = 5;
  IN.panico(G, tg, 'prova');
  ok('cinque sì', test() === 1);
  IN.panico(G, tg, 'prova');
  ok('e una volta sola nella stessa fase', test() === 1);
  tg.fled = false; tg.moved = null; tg.placed = true; tg.x = 600; tg.y = 600;
  G.army = 'A'; G.turno = 2;
  tg.faseTiro = IN.faseDi(G); tg.usInizioFase = 10; tg.lost = 6;
  IN.panico(G, tg, 'prova');
  ok('in una fase dopo, un altro modello solo non lo rifà (prima: sì, per sempre)', test() === 1);
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
console.log('\ni personaggi che si uniscono (pp. 206-208)');
{
  /* dadi fissi: `sei` fa uscire sempre la stessa faccia */
  const sempre = f => D.setSource(() => f - 1);
  const G = AR.newBattle({ A, B, scenario:'bm-strada' });
  /* i reggimenti di A in campo, i personaggi ancora fuori */
  let x = 150;
  for (const u of AR.unitsOf(G, 'A')) if (!AR.puoUnirsi(G, u)){ metti(G, u, x, 650); x += 180; }
  G.army = 'A';
  const o = AR.options(G);
  const vet = uid(G, 1), chief = uid(G, 2), tg = uid(G, 6), sk = uid(G, 3);
  ok('allo schieramento i personaggi vengono dopo i reggimenti', o.unit === vet.uid);
  ok('e possono entrare in un reggimento già in campo',
     o.list.some(x => x.id === 'unisci' && x.host === tg.uid) && o.list.some(x => x.id === 'schiera'));
  ok('solo in chi è del loro genere: la fanteria, non il Bastiladon',
     !o.list.some(x => x.id === 'unisci' && x.host === 7));
  ok('il reggimento più grosso viene prima', o.list[0].host === tg.uid);
  AR.apply(G, o.list.find(x => x.id === 'unisci' && x.host === tg.uid));
  ok('unito: sta dentro la Temple Guard e ha la sua posizione', AR.capiDi(G, tg).includes(vet) && vet.x === tg.x && vet.placed);
  ok('e non è più un pezzo in campo per conto suo', !AR.inCampo(G, 'A').includes(vet));
  ok('lo schieramento alterna come sempre', AR.options(G).player === 'B');
  ok('la Forza d Unità del reggimento conta anche lui (p. 207)', AR.usConCapi(G, tg) === AR.usOf(tg) + AR.usOf(vet));

  /* il Comando piu' alto (p. 97) e il passo del piu' lento (p. 208) */
  G.schierando = false; G.generale = { A: null, B: null };
  metti(G, chief, sk.x, sk.y); chief.join = { host: sk.uid };
  ok('gli Skink con lo Skink Chief dentro usano il suo Comando 6, non il loro 5',
     AR.interni.ldProprio(G, sk).ld === 6 && AR.interni.ldOf(G, sk) === 6);
  const H = AR.newBattle({ A, B, scenario:'bm-strada' }); H.schierando = false;
  const hs = metti(H, uid(H, 3), 600, 600), hv = metti(H, uid(H, 1), 600, 600);
  ok('da soli gli Skink muovono 6″', AR.interni.movimento(H, hs).move === 6);
  hv.join = { host: hs.uid };
  const m = AR.interni.movimento(H, hs);
  ok('con il Saurus dentro vanno al suo passo, 4″ (p. 208)', m.move === 4 && /p\. 208/.test(m.mv.why));

  /* il reggimento abbattuto lascia il capo in piedi */
  metti(H, uid(H, 505), 600, 200);
  const fatto = AR.interni.perdite(H, hs, 10);
  ok('gli Skink cadono tutti', fatto && hs.dead);
  ok('e il Saurus resta, da solo, in campo', !hv.dead && hv.join === null && AR.inCampo(H, 'A').includes(hv));
  ok('e il registro lo dice', H.log.some(r => /resta da solo/.test(r.text)));

  /* il reggimento che fugge fuori dal tavolo si porta via il capo */
  const K = nuova();
  const kt = metti(K, uid(K, 6), 600, 60), kv = metti(K, uid(K, 1), 600, 60);
  kv.join = { host: kt.uid };
  const nemico = metti(K, uid(K, 505), 600, 400);
  sempre(6);
  AR.interni.fuggi(K, kt, nemico, 12);
  ok('chi fugge dal tavolo porta via anche il capo (p. 207)', kt.dead && kv.dead && kv.fledOff);
  ok('e il punteggio conta anche il capo', AR.punteggio(K).B >= (kt.pts || 0) + (kv.pts || 0));
  seme(1);
}
{
  /* unirsi e separarsi nelle mosse restanti (p. 207) */
  const G = nuova();
  const sk = metti(G, uid(G, 3), 600, 700), ch = metti(G, uid(G, 2), 600, 700 + 4 * MM);
  metti(G, uid(G, 505), 600, 150);
  G.army = 'A'; G.casella = casella('mosse');
  let o = AR.options(G);
  const unione = o.list.find(x => x.id === 'unisciti' && x.uid === ch.uid && x.host === sk.uid);
  ok('lo Skink Chief a 4″ può raggiungere gli Skink e unirsi', !!unione && /non si muove più/.test(unione.why));
  AR.apply(G, unione);
  ok('unito', AR.capiDi(G, sk).includes(ch) && ch.x === sk.x);
  o = AR.options(G);
  ok('e gli Skink da lì non si muovono più in questo turno',
     !o.list.some(x => x.uid === sk.uid && /avanza|marcia/.test(x.id)) &&
     AR.apply(G, { id:'avanza', uid: sk.uid, verso: 505 }).ok === false);
  ok('ma non contano come mossi, per il tiro', !sk.moved);

  const H = nuova();
  const hs = metti(H, uid(H, 3), 600, 700), hc = metti(H, uid(H, 2), 600, 700);
  hc.join = { host: hs.uid };
  metti(H, uid(H, 505), 600, 150);
  H.army = 'A'; H.casella = casella('mosse');
  const sep = AR.options(H).list.find(x => x.id === 'separa' && x.uid === hc.uid);
  ok('un capo può uscire dal reggimento prima che si muova', !!sep);
  AR.apply(H, sep);
  ok('esce, e sta accanto senza sovrapporsi', hc.join === null && !dentro(H, hc, hs) && AR.inCampo(H, 'A').includes(hc));
  ok('e il reggimento si muove ancora', AR.options(H).list.some(x => x.id === 'avanza' && x.uid === hs.uid));
}

console.log('\nla Paura (p. 168)');
{
  const G = nuova();
  G.generale = { A: null, B: null };
  const sk = metti(G, uid(G, 3), 600, 600);
  sk.lost = 8;                                   // due Skink: Forza d'Unità 2
  const troll = metti(G, uid(G, 506), 600, 600 - 5 * MM);
  G.army = 'A'; G.casella = casella('cariche');
  const opz = AR.options(G).list.find(x => x.id === 'carica' && x.uid === sk.uid && x.target === troll.uid);
  ok('caricare un Troll più grosso vuole un test di Paura, e la probabilità lo dice',
     !!opz && /test di Paura/.test(opz.why));
  D.setSource(() => 5);                           // sei e sei: 12 contro Comando 5
  const r = AR.apply(G, opz);
  ok('fallito: gli Skink non caricano e restano fermi', r.ok && !G.pending && sk.moved && sk.moved.kind === 'failedCharge');
  ok('e il registro porta il test e la pagina',
     G.log.some(x => /test di Paura/.test(x.text) && x.page === 168) &&
     G.log.some(x => /resta ferma, ed è una carica fallita/.test(x.text)));
  ok('un test per turno: non si riprova', AR.apply(G, opz).ok === false);

  /* chi fa Terrore non teme la Paura: il Bastiladon non tira */
  const H = nuova();
  const bas = metti(H, uid(H, 7), 600, 600);
  metti(H, uid(H, 506), 600, 600 - 5 * MM);
  ok('chi fa Terrore non ha Paura di un Troll',
     AR.interni.pauraDi(H, bas, uid(H, 506), 'charge').must === false);
  ok('e un Troll non teme chi è più piccolo',
     AR.interni.pauraDi(H, uid(H, 506), metti(H, uid(H, 3), 300, 300), 'charge').must === false);

  /* in mischia: chi ha paura colpisce peggio */
  const K = nuova();
  K.generale = { A: null, B: null };
  const ks = metti(K, uid(K, 3), 600, 600); ks.lost = 8;
  const kt = metti(K, uid(K, 506), 600, 400);
  aContattoDi(K, kt, ks);
  K.army = 'B'; K.casella = casella('mischia');
  D.setSource(() => 5);
  const c = AR.options(K).list.find(x => x.id === 'combatti');
  AR.apply(K, c);
  ok('in combattimento gli Skink tirano la Paura, e fallendo hanno −1 per colpire',
     K.log.some(x => /Skink Skirmishers 1, test di Paura/.test(x.text)) &&
     K.log.some(x => /ha paura di Stone Troll Mobs 1: −1 per colpire/.test(x.text)));
  seme(1);
}

console.log('\nil Terrore (p. 179)');
{
  const G = nuova();
  G.generale = { A: null, B: null };
  const bas = metti(G, uid(G, 7), 600, 600);
  /* 50 mm di mezzo Bastiladon, 60 di mezzi Orchi, e tre pollici fra loro */
  const orchi = metti(G, uid(G, 505), 600, 600 - 110 - 3 * MM);
  G.army = 'A'; G.casella = casella('cariche');
  const opz = AR.options(G).list.find(x => x.id === 'carica' && x.uid === bas.uid && x.target === orchi.uid);
  ok('la carica del Bastiladon dice che fa Terrore', !!opz && /fa Terrore/.test(opz.why));
  D.setSource(() => 5);
  AR.apply(G, opz);
  const re = AR.options(G);
  ok('gli Orchi falliscono il Terrore: l unica reazione è fuggire',
     re.player === 'B' && re.list.length === 1 && re.list[0].kind === 'flee' &&
     G.log.some(x => /test di Terrore/.test(x.text) && x.page === 179));
  seme(1);

  /* chi non può fuggire non tira, e non gli si offre la fuga */
  const H = nuova();
  const hb = metti(H, uid(H, 7), 600, 600 - 110 - 3 * MM, 180);
  const ho = metti(H, uid(H, 505), 600, 600, 0);
  H.army = 'B'; H.casella = casella('cariche');
  const c = AR.options(H).list.find(x => x.id === 'carica' && x.uid === ho.uid && x.target === hb.uid);
  ok('gli Orchi possono caricare il Bastiladon', !!c);
  AR.apply(H, c);
  ok('e un Bastiladon Immune to Psychology non può scegliere la fuga',
     !AR.options(H).list.some(x => x.kind === 'flee'));
}

console.log('\nla Stupidità (testo della lista, p. 178)');
{
  const G = nuova();
  const troll = metti(G, uid(G, 506), 600, 300);
  troll.rules = [...troll.rules, 'Stupidity'];
  metti(G, uid(G, 3), 600, 700);
  G.army = 'B'; G.casella = 0;
  D.setSource(() => 5);
  AR.interni.inizioTurno(G);
  ok('all inizio del turno il Troll tira, e fallisce',
     G.log.some(x => /Stone Troll Mobs 1, test di Stupidità/.test(x.text) && x.page === 178) &&
     EF.flagsOf(troll).flags.stupid);
  ok('e si dichiara quale testo si gioca', G.log.some(x => /\[limite\] la Stupidità è quella del testo/.test(x.text)));
  G.casella = casella('mosse');
  ok('stupido: non si muove', !AR.options(G).list.some(x => x.uid === troll.uid));
  G.casella = casella('cariche');
  ok('e non carica', !AR.options(G).list.some(x => x.uid === troll.uid));
  seme(1);
}

console.log('\nle liste grandi');
{
  /* la lista 10 schiera un Bastiladon con il Solar Engine: niente
     Livello, niente scheda da mago, e newBattle cadeva. E le regole
     delle armi sono una stringa: il primo arco con una regola faceva
     cadere il tiro. Nessuna prova le aveva mai messe in campo. */
  const M2 = MG.makeMagic(dati('magia/domini.json'));
  let G = null, errore = '';
  try { G = AR.newBattle({ A: liste[10], B: liste[11], scenario:'bm-strada', magia: M2 }); }
  catch (e){ errore = e.message; }
  ok('la partita fra le liste grandi si prepara', !!G && !errore);
  const bas = G && G.units.find(u => u.mago && u.mago.level === 0 && u.mago.vincolati.includes('beamOfChotec'));
  ok('e il Bastiladon porta il Beam of Chotec, senza Livello', !!bas);
  seme(6);
  G = AR.newBattle({ A: liste[10], B: liste[11], scenario:'bm-strada', magia: M2 });
  try { await AG.giocaPartita(AR, G, { A: AG.agenteEuristico({}), B: AG.agenteEuristico({}) }); }
  catch (e){ errore = e.message; }
  ok('e si gioca fino in fondo', G.finita && !errore);
  const H = AR.newBattle({ A: liste[10], B: liste[11], scenario:'bm-strada', magia: M2 });
  H.schierando = false; H.preparando = false;
  const hb = H.units.find(u => u.mago && u.mago.vincolati.includes('beamOfChotec'));
  metti(H, hb, 600, 700);
  const bersaglio = metti(H, H.units.find(u => u.army === 'B' && u.models > 5), 600, 250);
  H.army = 'A'; H.casella = casella('tiro');
  ok('e nel tiro il Beam of Chotec si offre, con il Potere al posto del Livello',
     AR.options(H).list.some(x => x.id === 'lancia' && x.spell === 'beamOfChotec' && x.target === bersaglio.uid && /Potere 2/.test(x.why)));
}

console.log('\nil Comando del generale (p. 202)');
{
  const G = nuova();
  const sk = metti(G, uid(G, 3), 600, 600);
  const vet = metti(G, uid(G, 1), 600, 600 - 15 * MM);
  G.generale = { A: vet.uid, B: null };
  ok('a 15″ il generale non arriva: 12″', AR.interni.comandoDi(G, sk, 5).ld === 5);
  vet.rules = [...vet.rules, 'Large Target'];
  ok('se è un Large Target arriva a 18″', AR.interni.comandoDi(G, sk, 5).ld === 8 && AR.RAGGIO_GENERALE_GRANDE === 18);
  ok('e il raggio non è più fra i limiti da verificare', !AR.LIMITI.some(l => l.id === 'generale'));
  ok('la psicologia e i personaggi non sono più limiti',
     !AR.LIMITI.some(l => l.id === 'psicologia' || l.id === 'personaggi'));
}

/* ================================================================= */
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
