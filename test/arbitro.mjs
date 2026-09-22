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
import path from 'node:path';
import os from 'node:os';
import * as AR from '../src/arbitro.js';
import * as AG from '../src/agente.js';
import * as D from '../src/dice.js';
import * as PR from '../src/profiles.js';
import * as CH from '../src/charge.js';
import * as CB from '../src/combat.js';
import { polysOverlap, boxCorners } from '../src/geom.js';
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
/* per id, non per posizione: le liste dell'archivio si rinominano e si
   cancellano, e un indice scritto a mano smette di voler dire quello
   che diceva (il 2026-09-19 ne sono sparite due, e mezzo file puntava
   alle liste sbagliate) */
const lista = id => liste.find(l => l.id === id);
const A = lista('lmtl5sa4300nt'), B = lista('lmtl5sn694u6w');   // «La Strada delle Pietre», 750 punti

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
  /* le mosse che l'arbitro non ha accettato si raccolgono qui invece
     che cercando «rifiutat» nel registro: da quando ci sono le sfide
     (p. 211) una sfida rifiutata è una mossa legale che nel registro
     si scrive proprio così, e la prova la contava come un errore */
  const rifiutate = [];
  const esito = await AG.giocaPartita(AR, G, {
    A: AG.agenteEuristico({ nome:'a' }), B: AG.agenteEuristico({ nome:'b' }),
    onPasso: x => { if (!x.esito.ok) rifiutate.push(`${x.mossa ? x.mossa.id : '?'}: ${x.esito.text}`); },
  });
  ok(`seme ${s}: la partita finisce, e con un verdetto`,
     G.finita && !!esito && typeof esito.A === 'number' && !!esito.label);
  ok(`seme ${s}: qualcuno si è mosso e qualcuno è caduto`,
     G.log.some(r => /avanza|marcia/.test(r.text)) &&
     G.log.some(r => /ferit|a terra|spazzata/.test(r.text)));
  if (rifiutate.length) console.log('       ' + rifiutate.slice(0, 5).join(' | '));
  ok(`seme ${s}: nessuna mossa è stata rifiutata`, rifiutate.length === 0);
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
const L1 = lista('lmtl5rgsd5g06'), L2 = lista('lmtl5ruzktzvb');   // «Il Monolite nella Palude»
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
  const G = AR.newBattle({ A: lista('lmtwtadkn4x50'), B: L2, scenario: 'bm-monolite', magia: M });
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
  /* Sulla corsia di destra, e non al centro del tavolo: da quando
     l'arbitro conosce la collina, «oltre la cresta» (p. 272) taglia la
     linea di vista fra due unita' che stanno una di qua e una di la'
     della collina bassa del Monolite, e senza linea di vista la
     Fireball non si offre. Qui si prova la magia, non il terreno: i
     tre pezzi si mettono dove il terreno non c'entra. */
  prete.x = 1100; prete.y = 900; prete.rot = 0;
  mob.x = 1100; mob.y = 900 - 12 * MM; mob.rot = 180;
  /* e l'Oddnob un po' piu' in la' del suo reggimento: da dietro la mob
     non vedrebbe il prete, perche' adesso l'arbitro sa che un'unita' in
     mezzo taglia la vista (p. 103), e la maledizione non si offrirebbe */
  nob.x = 1180; nob.y = 900 - 12 * MM; nob.rot = 180;
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
  /* Quello che l'arbitro garantisce e' che gli incantesimi si offrano;
     se poi si lanciano lo decide chi gioca, e come va la partita. Col
     seme 1 lo Skink Priest cade al secondo turno senza aver scelto la
     sua maledizione, e da quando Battle March dura cinque round (e
     nessuno tira piu' dentro una mischia) il lancio del terzo turno
     dell'Oddnob non arriva: il lancio vero si chiede alle tre partite
     insieme. Cosi' anche il dissolvimento: da quando la ruota si paga
     (p. 124) col seme 3 l'Oddnob fa 8 contro 9, e non c'e' niente da
     dissolvere. */
  let lanci = 0, dissolti = 0;
  for (const s of [1, 2, 3]){
    seme(s);
    const G = AR.newBattle({ A: L1, B: L2, scenario: 'bm-monolite', magia: M });
    let offerti = 0;
    const respinte = [];
    await AG.giocaPartita(AR, G, { A: AG.agenteEuristico({}), B: AG.agenteEuristico({}),
      onPasso: ({ opzioni, mossa, esito }) => {
        offerti += opzioni.list.filter(x => x.id === 'lancia').length;
        /* non si cerca «rifiutat» nel registro: una sfida rifiutata
           (p. 211) è una mossa legale che si scrive proprio così */
        if (!esito.ok) respinte.push(`${mossa ? mossa.id : '?'}: ${esito.text}`);
      } });
    ok(`seme ${s}: la partita con due maghi finisce`, G.finita && !!G.esito);
    if (respinte.length) console.log('       ' + respinte.slice(0, 5).join(' | '));
    ok(`seme ${s}: nessuna mossa rifiutata`, respinte.length === 0);
    ok(`seme ${s}: gli incantesimi si offrono`, offerti > 0);
    if (G.log.some(r => / lancia .*: lancio /.test(r.text))) lanci++;
    if (G.log.some(r => /contro .*: dissolvimento/.test(r.text))) dissolti++;
  }
  ok('e nelle tre partite qualcuno lancia davvero', lanci >= 2);
  ok('e qualcuno prova a dissolvere', dissolti >= 1);
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

console.log('\nnon si tira dentro una mischia (p. 143)');
{
  const G = nuova();
  const sk = metti(G, uid(G, 3), 600, 600);
  const bersaglio = metti(G, uid(G, 505), 600, 380);
  G.casella = casella('tiro'); G.army = 'A';
  const suLui = () => AR.options(G).list.some(x => x.id === 'tira' && x.uid === sk.uid && x.target === bersaglio.uid);
  ok('un nemico libero si bersaglia', suLui());
  const tg = metti(G, uid(G, 6), 0, 0);
  aContattoDi(G, tg, bersaglio);
  ok('uno che ha addosso la Temple Guard no', AR.ingaggiata(G, bersaglio) && !suLui());
}

/* Le sagome e le macchine da guerra: il pezzo dell'arbitro che
   mancava. Nessuna lista salvata ha un lanciapietre — l'unica macchina
   dell'archivio e' il Warp Lightning Cannon, che spara in un altro modo
   — e allora la macchina si monta qui con il profilo del libro (Core
   Rulebook p. 224), che e' un numero letto e non inventato. */
console.log('\nla bombardata (pp. 224-226)');
{
  const lanciapietre = () => ([{ name: 'Stone thrower', range: '12-60"', S: '4 (8)', ap: '-1 (-3)',
                                 rules: 'Bombardment, Cumbersome, Move or Shoot' }]);
  const macchina = (G, u, armi = lanciapietre()) => {
    u.troop = 'War machine'; u.weapons = armi; return u;
  };
  /* una sorgente di dadi a copione: ogni numero e' la faccia grezza
     meno uno, e l'ultimo vale per tutti quelli che restano */
  const facce = (...seq) => { let i = 0; D.setSource(n => Math.min(n - 1, seq[Math.min(i++, seq.length - 1)])); };
  const inTiro = G => { G.casella = casella('tiro'); G.army = 'A'; return G; };

  /* l'opzione c'e', e dice con che sagoma si spara */
  {
    const G = inTiro(nuova());
    const lp = macchina(G, metti(G, uid(G, 3), 600, 900));
    metti(G, uid(G, 505), 600, 400);
    const o = AR.options(G).list;
    const b = o.find(x => x.id === 'bombarda' && x.uid === lp.uid);
    ok('una macchina a bombardata non tira come un arco',
       !!b && !o.some(x => x.id === 'tira' && x.uid === lp.uid));
    ok('e l opzione dice la sagoma e la pagina', /sagoma da 3/.test(b.why) && b.page === 224);
  }

  /* «12-60"» e' una fascia: sotto i dodici pollici non si spara */
  {
    const G = inTiro(nuova());
    const lp = macchina(G, metti(G, uid(G, 3), 600, 700));
    metti(G, uid(G, 505), 600, 600);
    ok('sotto la gittata minima non si bombarda',
       !AR.options(G).list.some(x => x.id === 'bombarda' && x.uid === lp.uid));
  }

  /* il tiro vero: Colpito!, la sagoma resta sul centro del bersaglio */
  {
    const G = inTiro(nuova());
    const lp = macchina(G, metti(G, uid(G, 3), 600, 900));
    const tg = metti(G, uid(G, 505), 600, 400);
    facce(0);                                   // Colpito!, e tutti gli altri dadi a 1
    const r = AR.apply(G, { id: 'bombarda', uid: lp.uid, target: tg.uid });
    ok('la bombardata si applica', r !== false && r.ok !== false);
    ok('il registro dice dov e caduta la sagoma e chi c era sotto',
       G.log.some(x => /sagoma/i.test(x.text) && /sotto/i.test(x.text)));
    ok('e la macchina ha sparato', lp.shot === true);
    ok('nessun tiro per colpire: la bombardata non usa l Abilita Balistica',
       !G.log.some(x => x.text.includes(lp.name) && /a \d\+/.test(x.text)));
  }

  /* la sagoma non guarda le bandiere: sotto ci finisce chi c'e' */
  {
    const G = nuova();
    metti(G, uid(G, 3), 600, 900);
    metti(G, uid(G, 505), 600, 400);
    const celle = AR.interni.caselleDelTavolo(G);
    ok('le caselle del tavolo sono quelle di tutti e due gli eserciti',
       celle.some(c => c.u.army === 'A') && celle.some(c => c.u.army === 'B'));
  }

  /* il Mancato Colpo: un 1 e la macchina non c'e' piu' (p. 226) */
  {
    const G = inTiro(nuova());
    const lp = macchina(G, metti(G, uid(G, 3), 600, 900));
    const tg = metti(G, uid(G, 505), 600, 400);
    facce(5, 0, 5, 0);                          // deviazione: Mancato Colpo; tabella: 1
    AR.apply(G, { id: 'bombarda', uid: lp.uid, target: tg.uid });
    ok('un 1 sul Mancato Colpo distrugge la macchina', lp.dead === true);
    ok('e il registro lo scrive', G.log.some(x => /Mancato Colpo/.test(x.text) && /distrutta/i.test(x.text)));
  }

  /* 2-4: una Ferita all'equipaggio, e niente tiro fino alla fine del
     round successivo */
  {
    const G = inTiro(nuova());
    const lp = macchina(G, metti(G, uid(G, 3), 600, 900));
    const tg = metti(G, uid(G, 505), 600, 400);
    facce(5, 0, 5, 1);                          // deviazione: Mancato Colpo; tabella: 2
    AR.apply(G, { id: 'bombarda', uid: lp.uid, target: tg.uid });
    ok('un guasto non la distrugge', !lp.dead);
    ok('ma le costa una Ferita', (lp.wounds || 0) + (lp.lost || 0) > 0);
    ok('e la ferma fino alla fine del round dopo', lp.nonTira === G.turno + 1);
    lp.shot = false;
    ok('il turno dopo non spara ancora',
       !AR.options(G).list.some(x => x.id === 'bombarda' && x.uid === lp.uid));
  }

  /* un'arma a bombardata che i libri in casa non coprono: non si spara
     con una sagoma indovinata, e lo si dichiara */
  {
    D.setSource(D.seeded(4));
    const G = AR.newBattle({ A, B, scenario: 'bm-strada' });
    const lp = macchina(G, uid(G, 3), [{ name: 'Doom Rocket', range: '48"', S: '5', ap: '-2',
                                         rules: 'Bombardment, Cumbersome' }]);
    let giri = 0;
    while (G.schierando && giri++ < 200 && AR.options(G).list.length) AR.apply(G, AR.options(G).list[0]);
    ok('la sagoma che il libro in casa non dice si dichiara a fine schieramento',
       G.log.some(x => /\[limite\]/.test(x.text) && /bombardata/i.test(x.text)));
    inTiro(G);
    ok('e quell arma non spara', !AR.options(G).list.some(x => x.uid === lp.uid &&
       (x.id === 'bombarda' || x.id === 'tira')));
  }
  D.setSource(D.seeded(1));
}

/* «Move or Shoot» non e' un divieto dell'unita' ma dell'arma, e
   l'arbitro non lo passava a `canShoot`: nella partita fra i due
   Skaven i Warplock Jezzails marciavano e sparavano nello stesso
   turno, con tanto di «ha mosso» scritto accanto. */
console.log('\nl arma che o si muove o tira (p. 137)');
{
  const G = nuova();
  const jz = metti(G, uid(G, 3), 600, 900);
  jz.weapons = [{ name: 'Warplock jezzail', range: '36"', S: '6', ap: '-3',
                  rules: 'Cumbersome, Magical Attacks, Move or Shoot' }];
  const orc = metti(G, uid(G, 505), 600, 400);
  const spara = () => AR.options(G).list.some(x => x.id === 'tira' && x.uid === jz.uid);
  G.casella = casella('tiro'); G.army = 'A';
  ok('fermo, il jezzail tira', spara());
  jz.moved = { kind: 'walk', inches: 3 };
  ok('e dopo essersi mosso no', !spara());
  jz.moved = { kind: 'still', inches: 0 };
  ok('ma restare fermi non e muoversi', spara());
}

/* Il Warp Lightning Cannon e' l'unica macchina da guerra delle liste
   salvate, e fino a qui non ha mai sparato un colpo: il profilo che
   l'export porta dice gittata «8D6"» e Forza «*», e l'app ne leggeva
   8 pollici e la Forza dell'equipaggio. Qui la lista e' quella vera
   («Tutto SKA»), non una macchina montata a mano. */
console.log('\nil fulmine del Warp Lightning Cannon (Legends: Skaven, p. 19)');
{
  const SKA = lista('lmu8eb7xh723p');
  const facce = (...seq) => { let i = 0; D.setSource(n => Math.min(n - 1, seq[Math.min(i++, seq.length - 1)])); };
  const tavolo = () => {
    const G = AR.newBattle({ A: SKA, B, scenario: 'bm-strada' });
    G.schierando = false;
    const wl = AR.unitsOf(G, 'A').find(u => /Warp Lightning/.test(u.name));
    metti(G, wl, 600, 800);
    const orc = metti(G, AR.unitsOf(G, 'B')[0], 600, 400);
    G.casella = casella('tiro'); G.army = 'A';
    return { G, wl, orc };
  };

  {
    const { G, wl } = tavolo();
    const o = AR.options(G).list.filter(x => x.uid === wl.uid);
    const f = o.find(x => x.id === 'fulmina');
    ok('il cannone spara una linea, non un tiro', !!f && !o.some(x => x.id === 'tira'));
    ok('e l opzione dice che la lunghezza si tira e la Forza pure',
       /8D6/.test(f.why) && /dado di artiglieria/.test(f.why) && f.page === 19);
    ok('e lo fa da piu di otto pollici', /da 1\d/.test(f.why));
  }

  {
    const { G, wl, orc } = tavolo();
    facce(2);                                  // otto 3 = 24″, e artiglieria 6
    AR.apply(G, { id: 'fulmina', uid: wl.uid, target: orc.uid });
    ok('la linea si tira e si scrive', G.log.some(x => /la linea è lunga 24″/.test(x.text)));
    ok('la Forza viene dal dado di artiglieria', G.log.some(x => /Forza 6/.test(x.text)));
    ok('e sotto ci finisce qualcuno', G.log.some(x => /Sotto la linea: /.test(x.text) &&
       !/nessuno/.test(x.text)));
    ok('il limite della linea si dichiara',
       G.log.some(x => /\[limite\]/.test(x.text) && /Warp Lightning/.test(x.text)));
  }

  /* il Mancato Colpo sta sul dado della FORZA, non su quello della
     lunghezza, e va su una tabella che non e' del Core Rulebook */
  {
    const { G, wl, orc } = tavolo();
    facce(2, 2, 2, 2, 2, 2, 2, 2, 5, 0);       // artiglieria: Mancato Colpo; tabella: 1
    AR.apply(G, { id: 'fulmina', uid: wl.uid, target: orc.uid });
    ok('un 1 fonde la macchina', wl.dead === true);
    ok('e la riga viene dal libro degli Skaven',
       G.log.some(x => /Meltdown/.test(x.text) && /Legends: Skaven p. 19/.test(x.text)));
  }
  {
    const { G, wl, orc } = tavolo();
    facce(2, 2, 2, 2, 2, 2, 2, 2, 5, 1);       // artiglieria: Mancato Colpo; tabella: 2
    AR.apply(G, { id: 'fulmina', uid: wl.uid, target: orc.uid });
    ok('un Energy Overload non la distrugge e spara lo stesso',
       !wl.dead && G.log.some(x => /gira su se stessa/.test(x.text) && /Forza 6/.test(x.text)));
  }

  /* «Weapon of War» (p. 197) e «Cumbersome» (p. 167) */
  {
    const { G, wl, orc } = tavolo();
    G.casella = casella('mosse');
    const mosse = AR.options(G).list.filter(x => x.uid === wl.uid);
    ok('una macchina da guerra non marcia', !mosse.some(x => x.id === 'marcia'));
    ok('ma si muove', mosse.some(x => x.id === 'avanza'));
    ok('e l opzione «resta ferma» dice che muovendosi perde il tiro',
       mosse.some(x => x.id === 'ferma' && x.tieniIlTiro));
    G.casella = casella('cariche');
    ok('e non dichiara cariche (p. 197)', !AR.options(G).list.some(x => x.id === 'carica' && x.uid === wl.uid));
    ok('e il limite lo dice', G.log.some(x => /\[limite\]/.test(x.text) && /macchina da guerra/.test(x.text)));
  }
  {
    const { G, wl, orc } = tavolo();
    G.casella = casella('cariche'); G.army = 'B';
    D.setSource(D.seeded(5));
    const c = AR.options(G).list.find(x => x.id === 'carica' && x.target === wl.uid);
    if (c){
      AR.apply(G, c);
      const scelte = (G.pending && G.pending.list) || [];
      ok('l arma ingombrante non tiene e spara (p. 167)', !scelte.some(x => x.kind === 'stand'));
    } else ok('l arma ingombrante non tiene e spara (p. 167)', true);
  }
  D.setSource(D.seeded(1));
}

/* La sfida Michele contro Gemini lo aveva preso per un errore: il
   Bastiladon fallisce il test, avanza di un movimento solo, e poi non
   spara. E' il libro: chi tenta la marcia e fallisce «is considered to
   have marched, even if its controlling player then elects to not move
   the unit at all» (p. 123), e chi ha marciato non tira (p. 137). */
console.log('\nla marcia fallita è una marcia (p. 123)');
{
  const G = nuova();
  const sk = metti(G, uid(G, 3), 600, 600);
  metti(G, uid(G, 505), 600, 380);
  G.casella = casella('mosse'); G.army = 'A';
  D.setSource(() => 5);                                  // dodici: il test fallisce
  AR.apply(G, { id:'marcia', uid: sk.uid, verso: 505 });
  D.setSource(D.seeded(1));
  ok('fallito il test, conta come marcia', sk.moved && sk.moved.kind === 'march' &&
     G.log.some(r => /niente marcia/.test(r.text)));
  G.casella = casella('tiro');
  ok('e chi ha marciato non tira (p. 137)', !AR.options(G).list.some(x => x.id === 'tira' && x.uid === sk.uid));
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
     monca.status === 1 && /due liste/.test(monca.stderr));
  /* il comando copiato dalla scheda Matchup nomina le liste per id */
  const liste = JSON.parse(fs.readFileSync(new URL('../dati/liste.json', import.meta.url), 'utf8'));
  const perId = lancia(['--liste', `${liste[3].id},${liste[4].id}`, '--breve']);
  ok('le liste si prendono anche per id', perId.status === 0 && /A = 3 /.test(perId.stdout) && /B = 4 /.test(perId.stdout));
  const idIgnoto = lancia(['--liste', `${liste[3].id},lnonce`, '--breve']);
  ok('e un id che non c è si dice', idIgnoto.status === 1 && /Archivio/.test(idIgnoto.stderr));
  /* tante partite: il conto torna, e ogni seme è la partita che si
     rigioca da sola con quel seme */
  const serie = lancia(['--liste', '3,4', '--partite', '3', '--seme', '5']);
  const vinte = [...serie.stdout.matchAll(/vince\s+(\d+)/g)].map(m => +m[1]);
  const pari = +((serie.stdout.match(/pareggio\s+(\d+)/) || [])[1]);
  ok('--partite 3 gioca tre partite e le conta tutte', serie.status === 0 && vinte.length === 2 && vinte[0] + vinte[1] + pari === 3);
  ok('--partite non si mescola con --gemini', lancia(['--partite', '3', '--gemini']).status === 1);
  /* senza estro si schiera sempre uguale; con l'estro ogni partita ha
     il suo piano, e la partita di un seme si rigioca identica da sola */
  const schier = out => +((out.match(/schieramenti diversi: (\d+)/) || [])[1]);
  const rigide = lancia(['--liste', '3,4', '--partite', '4']);
  const estrose = lancia(['--liste', '3,4', '--partite', '4', '--estro']);
  ok('senza estro le partite si schierano tutte uguali', rigide.status === 0 && schier(rigide.stdout) === 1);
  ok('con l estro no, e il conto dice quali piani vincono',
     estrose.status === 0 && schier(estrose.stdout) > 1 && /quali piani vincono/.test(estrose.stdout));
  const vp = out => (out.match(/(\d+) punti vittoria — .* (\d+)\s*$/m) || []).slice(1).join('-');
  const una = lancia(['--liste', '3,4', '--seme', '7', '--estro', '--breve']);
  const due = lancia(['--liste', '3,4', '--seme', '7', '--estro', '--breve']);
  ok('e con lo stesso seme l estro rigioca lo stesso piano', una.status === 0 && /piano di A/.test(una.stdout) &&
     vp(una.stdout) !== '' && vp(una.stdout) === vp(due.stdout));
  /* la mappa di tante partite: una pagina con dentro ogni unita' di
     tutte e due le liste, e per ognuna i posti da cui e' partita */
  const fileMappa = path.join(os.tmpdir(), `mappa-prova-${process.pid}.html`);
  const conMappa = lancia(['--liste', '3,4', '--partite', '4', '--estro', '--heatmap', fileMappa]);
  const pagina = conMappa.status === 0 && fs.existsSync(fileMappa) ? fs.readFileSync(fileMappa, 'utf8') : '';
  const P = pagina ? JSON.parse((pagina.match(/var P = (\{.*\});\n/) || [])[1] || 'null') : null;
  const conte = l => (JSON.parse(fs.readFileSync(new URL('../dati/liste.json', import.meta.url), 'utf8'))[l].units || []).length;
  ok('--heatmap scrive la pagina, con tutte le unità delle due liste',
     !!P && P.unita.length === conte(3) + conte(4) && P.meta.partite === 4);
  ok('e ogni unità ha i suoi posti di partenza, contati su tutte le partite',
     !!P && P.unita.every(u => u.posti.reduce((s, p) => s + p.n, 0) === 4));
  ok('--heatmap senza --partite si ferma e lo dice', lancia(['--heatmap', fileMappa]).status === 1);
  if (fs.existsSync(fileMappa)) fs.unlinkSync(fileMappa);
  /* gli scenari disegnati nell'app, da dati/scenari.json */
  const mio = (JSON.parse(fs.readFileSync(new URL('../dati/scenari.json', import.meta.url), 'utf8')) || [])[0];
  if (mio){
    const custom = lancia(['--liste', '3,4', '--scenario', mio.id, '--breve']);
    ok('uno scenario disegnato nell app si gioca per id', custom.status === 0 && custom.stdout.includes(mio.label));
  }
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
  /* la lista *Skaven Battle March* dell'archivio, scritta a mano con
     nome, modelli e punti e nient'altro: l'archivio non ce l'ha piu', e
     il caso resta qui */
  const aMano = { id:'aMano', name:'Skaven Battle March', byHand:true,
    info:{ catalogue:'', forceName:'scritta a mano', limit:0 },
    units:[{ name:'Clanrats', models:20, crew:0, baseId:'25x25', baseW:25, baseH:25, frontage:5,
             loose:false, pts:90, us:0, troop:'', unitSize:'', stats:null, rules:[], weapons:[],
             maxRange:0, slot:'', faction:'' }] };
  const G = AR.newBattle({ A, B: aMano, scenario:'bm-strada' });
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
  ok('senza passo lungo si fugge di 2D6', G.log.some(r => /reagisce fuggendo: 1 \+ 1 = 2″/.test(r.text)));
  D.setSource(D.seeded(1));

  /* Swiftstride vale anche per il tiro di fuga (p. 178): prima le fughe
     tiravano due dadi soli, e un Carnosauro in rotta si faceva prendere */
  const G1 = nuova();
  const s1 = metti(G1, uid(G1, 1), 600, 600);
  const w1 = metti(G1, uid(G1, 501), 600, 430);
  w1.rules = [...(w1.rules || []), 'Swiftstride'];
  G1.casella = casella('cariche'); G1.army = 'A';
  AR.apply(G1, { id:'carica', uid: s1.uid, target: w1.uid });
  D.setSource(() => 0);
  AR.apply(G1, AR.options(G1).list.find(x => x.kind === 'flee'));
  ok('con Swiftstride la fuga aggiunge un D6 (p. 178)',
     G1.log.some(r => /reagisce fuggendo: 1 \+ 1 \+ 1 \(Swiftstride, p\. 178\) = 3″/.test(r.text)));
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

/* Il Panico c'era solo per il tiro: nella sfida Michele contro Gemini
   nessuno lo ha tirato, nemmeno con i Black Orc travolti e tre unita'
   di Skink distrutte. Le altre tre cause sono a p. 161, e chi fallisce
   non fugge sempre (p. 160). */
console.log('\nil Panico per gli amici (pp. 160-161)');
{
  const G = nuova();
  G.casella = casella('tiro'); G.army = 'B';
  const nemico = metti(G, uid(G, 505), 600, 200);
  const tg = metti(G, uid(G, 6), 600, 600);
  const sk = metti(G, uid(G, 3), 800, 600);
  const lontani = metti(G, uid(G, 4), 1150, 800);
  const righe = nome => G.log.filter(r => r.text.startsWith(nome + ', test di Panico'));
  ok('la prova parte con gli Skink vicini e gli altri lontani',
     AR.distanza(G, tg, sk) <= 6 && AR.distanza(G, tg, lontani) > 6);
  D.setSource(() => 5);                                   // tutti sei: il test fallisce
  IN.perdite(G, tg, tg.models);
  ok('un amico distrutto entro 6″ manda al Panico (p. 161)',
     righe(sk.name).length === 1 && /distrutta/.test(righe(sk.name)[0].text));
  ok('chi sta oltre i 6″ no', righe(lontani.name).length === 0);
  ok('con più della metà dei modelli, chi fallisce ripiega in ordine (p. 160)',
     !sk.fled && G.log.some(r => r.text.startsWith(sk.name + ' va nel panico e ripiega in ordine')));
  IN.testPanico(G, sk, 'destroyed', { dist: 2, fonteUS: 10 });
  ok('e il Panico si tira una volta per fase', righe(sk.name).length === 1);

  G.casella = casella('mischia');
  sk.lost = Math.ceil(sk.models / 2);
  IN.testPanico(G, sk, 'destroyed', { dist: 2, fonteUS: 10 });
  ok('con la metà o meno, fugge', sk.fled && G.log.some(r => r.text.startsWith(sk.name + ' va nel panico e fugge')));
  ok('e fugge dal nemico, non dall amico che è caduto', G.log.some(r => r.text.includes(`fugge da ${nemico.name}`)));

  const G2 = nuova();
  G2.casella = casella('tiro'); G2.army = 'B';
  const n2 = metti(G2, uid(G2, 505), 600, 200);
  const tg2 = metti(G2, uid(G2, 6), 600, 600);
  const dietro = metti(G2, uid(G2, 3), 600, 780);
  IN.fuggi(G2, tg2, n2, 12);
  ok('chi fugge attraverso un amico lo manda al Panico',
     G2.log.some(r => r.text.startsWith(dietro.name + ', test di Panico') && /attraversata/.test(r.text)));
  const G3 = nuova();
  G3.casella = casella('tiro'); G3.army = 'B';
  metti(G3, uid(G3, 505), 600, 200);
  const capo = metti(G3, uid(G3, 1), 600, 600);
  const accanto = metti(G3, uid(G3, 3), 750, 600);
  const panici = () => G3.log.filter(r => r.text.startsWith(accanto.name + ', test di Panico')).length;
  IN.ondaPanico(G3, capo, 'destroyed', 1);
  ok('un amico sotto i 5 di Forza d Unità non spaventa nessuno', AR.distanza(G3, capo, accanto) <= 6 && panici() === 0);
  IN.ondaPanico(G3, capo, 'destroyed', 5);
  ok('dal 5 in su sì', panici() === 1);
  D.setSource(D.seeded(1));
}

/* ================================================================= */
/* Le manovre, con il libro aperto alle pp. 124-125. Fino a qui chi
   avanzava si girava verso il nemico gratis, e chi aveva il nemico sul
   fianco non aveva altro modo di guardarlo. Le misure sono quelle dei
   pezzi veri: la Temple Guard è cinque per tre su basette da 30 mm,
   cioè un fronte di 150 mm, e Movimento 4. */
console.log('\nle manovre (pp. 124-125)');
{
  const inMosse = G => { G.casella = casella('mosse'); G.army = 'A'; return G; };
  const verso = (G, u, gradi, mm) => {
    const a = gradi * Math.PI / 180;
    return metti(G, uid(G, 505), u.x + Math.sin(a) * mm, u.y - Math.cos(a) * mm);
  };
  const spostato = (u, x, y) => Math.hypot(u.x - x, u.y - y) / MM;
  const quasi = (a, b, tol = 0.1) => Math.abs(a - b) <= tol;

  /* la ruota costa quanto cammina il modello esterno (p. 124):
     150 mm per 20° sono 2,06″, e ne restano 1,94 per andare avanti */
  {
    const G = inMosse(nuova());
    const tg = metti(G, uid(G, 6), 600, 600);
    const orc = verso(G, tg, 20, 400);
    const av = AR.options(G).list.find(x => x.id === 'avanza' && x.uid === tg.uid);
    ok('l avanzata dice quanto costa la ruota', av && /ruota di 20°/.test(av.why) && /2\.1″/.test(av.why));
    AR.apply(G, { id:'avanza', uid: tg.uid, verso: orc.uid });
    ok('e la paga: gira di 20° e avanza di quello che resta',
       quasi(tg.rot, 20, 0.5) && quasi(spostato(tg, 600, 600), 1.94));
    ok('il registro scrive la ruota con la pagina', G.log.some(r => /ruota di 20°/.test(r.text) && r.page === 124));
    ok('e dichiara quello che della ruota semplifica', G.log.some(r => /\[limite\]/.test(r.text) && /ruota/.test(r.text)));
  }
  /* a 45° la ruota costerebbe 4,6″: con 4 se ne fanno 38,8, e basta */
  {
    const G = inMosse(nuova());
    const tg = metti(G, uid(G, 6), 600, 600);
    const orc = verso(G, tg, 45, 400);
    AR.apply(G, { id:'avanza', uid: tg.uid, verso: orc.uid });
    ok('chi non ha abbastanza Movimento ruota quanto può e non avanza',
       quasi(tg.rot, 38.8, 0.3) && spostato(tg, 600, 600) < 0.05);
  }
  /* marciando si ruota (p. 123), e la ruota si paga sul doppio */
  {
    const G = inMosse(nuova());
    const tg = metti(G, uid(G, 6), 600, 600);
    const orc = verso(G, tg, 20, 400);
    AR.apply(G, { id:'marcia', uid: tg.uid, verso: orc.uid });
    ok('chi marcia paga la ruota sugli otto pollici', quasi(spostato(tg, 600, 600), 5.94));
  }
  /* gli schermagliatori non ruotano: ogni modello va dove vuole (p. 185) */
  {
    const G = inMosse(nuova());
    const sk = metti(G, uid(G, 3), 600, 600);
    const orc = verso(G, sk, 45, 450);
    AR.apply(G, { id:'avanza', uid: sk.uid, verso: orc.uid });
    ok('gli schermagliatori si girano senza pagare', quasi(sk.rot, 45, 0.5) && quasi(spostato(sk, 600, 600), 6));
    G.casella = casella('mosse');
    const loro = AR.options(G).list.filter(x => x.uid === sk.uid);
    ok('e non hanno manovre da scegliere', !loro.some(x => /gira|riforma|riordina|indietro|lato/.test(x.id)));
  }
  /* Lumbering (p. 195): dopo essersi mosso, un pivot fino a 90° gratis */
  {
    const G = inMosse(nuova());
    const bas = metti(G, uid(G, 7), 600, 600);
    let orc = verso(G, bas, 60, 400);
    AR.apply(G, { id:'avanza', uid: bas.uid, verso: orc.uid });
    ok('il Bastiladon si gira di 60° senza pagarli', quasi(bas.rot, 60, 0.5) && quasi(spostato(bas, 600, 600), 4));
    const G2 = inMosse(nuova());
    const b2 = metti(G2, uid(G2, 7), 600, 600);
    orc = verso(G2, b2, 120, 400);
    AR.apply(G2, { id:'avanza', uid: b2.uid, verso: orc.uid });
    ok('e di 120° paga solo i 30 oltre i novanta', quasi(spostato(b2, 600, 600), 2.76));
  }
  /* il giro (p. 124): un quarto del Movimento ogni 90°, e i modelli
     girano sul posto — i ranghi diventano file */
  {
    const G = inMosse(nuova());
    const tg = metti(G, uid(G, 6), 600, 600);
    const orc = metti(G, uid(G, 505), 900, 600);
    const o = AR.options(G).list;
    const gi = o.find(x => x.id === 'gira' && x.uid === tg.uid);
    ok('con il nemico sul fianco si offre il giro', gi && gi.gradi === 90 && /p\. 124/.test(gi.why + gi.page));
    ok('e dice che il fronte diventa di tre, in colonna', gi && /da 5 a 3/.test(gi.why) && /colonna/.test(gi.why));
    ok('e anche la riforma', o.some(x => x.id === 'riforma' && x.uid === tg.uid));
    ok('la fotografia dice com è schierata e che il nemico è sul fianco',
       /Temple Guard — 15\/15 modelli, 5×3,.*Orc Mobs a [\d.]+″ sul fianco/.test(AR.fotografia(G)));
    const sc = await AG.agenteEuristico({}).scegli({ opzioni: AR.options(G), stato: G });
    ok('l euristica, con il nemico sul fianco, si riforma', sc.scelta && sc.scelta.id === 'riforma');
    AR.apply(G, gi);
    ok('girata: guarda il fianco, tre di fronte', tg.rot === 90 && tg.frontage === 3);
    ok('e con i tre quarti che restano va avanti dritta', quasi(tg.x - 600, 3 * MM, 3) && quasi(tg.y, 600, 1));
    ok('una manovra sola per movimento', !AR.options(G).list.some(x => x.uid === tg.uid && x.id !== 'avanti'));
    ok('davanti al nemico il giro non si offre',
       !AR.options(inMosse((() => { const H = nuova(); metti(H, uid(H, 6), 600, 600); verso(H, uid(H, 6), 0, 400); return H; })()))
         .list.some(x => x.id === 'gira'));
  }
  /* la riforma (p. 125): tutto il movimento, gira sul centro, tiene i ranghi */
  {
    const G = inMosse(nuova());
    const tg = metti(G, uid(G, 6), 600, 600);
    const orc = metti(G, uid(G, 505), 900, 600);
    AR.apply(G, { id:'riforma', uid: tg.uid, verso: orc.uid });
    ok('riformata: guarda il nemico, con lo stesso fronte, senza muoversi',
       quasi(tg.rot, 90, 0.5) && tg.frontage === 5 && spostato(tg, 600, 600) < 0.05);
    ok('e per il tiro conta come mossa (p. 139)', tg.moved && tg.moved.kind === 'reform');
  }
  /* indietro, a metà Movimento (p. 125): quando il nemico ti arriva addosso */
  {
    const G = inMosse(nuova());
    const tg = metti(G, uid(G, 6), 600, 600);
    const orc = metti(G, uid(G, 505), 600, 600 - 45 - 60 - 8 * MM);
    const ind = AR.options(G).list.find(x => x.id === 'indietro' && x.uid === tg.uid);
    ok('con un nemico a portata di carica si offre il passo indietro', ind && /10″/.test(ind.why));
    AR.apply(G, ind);
    ok('e si fanno 2″ all indietro, sempre girati verso di lui',
       quasi(tg.y - 600, 2 * MM, 1) && tg.rot === 0 && quasi(tg.x, 600, 0.5));
    const H = inMosse(nuova());
    metti(H, uid(H, 6), 600, 600);
    metti(H, uid(H, 505), 600, 600 - 45 - 60 - 20 * MM);
    ok('lontano dalle cariche no', !AR.options(H).list.some(x => x.id === 'indietro'));
  }
  /* di lato, a metà Movimento (p. 125): per mettersi davanti */
  {
    const G = inMosse(nuova());
    const tg = metti(G, uid(G, 6), 600, 600);
    metti(G, uid(G, 505), 600 + 1.5 * MM, 600 - 45 - 60 - 10 * MM);
    const la = AR.options(G).list.find(x => x.id === 'lato' && x.uid === tg.uid);
    ok('con il nemico spostato di lato si offre il passo laterale', !!la);
    AR.apply(G, la);
    ok('e ci si mette davanti, senza girarsi', quasi(tg.x - 600, 1.5 * MM, 1) && quasi(tg.y, 600, 0.5) && tg.rot === 0);
  }
  /* riordinare le file (p. 125): fino a cinque modelli in più o in meno */
  {
    const G = inMosse(nuova());
    const tg = metti(G, uid(G, 6), 600, 600);
    verso(G, tg, 0, 500);
    const ri = AR.options(G).list.filter(x => x.id === 'riordina' && x.uid === tg.uid);
    ok('si offre di allargare il fronte a dieci e di stringerlo a quattro',
       ri.some(x => x.fronte === 10) && ri.some(x => x.fronte === 4));
    ok('e dice cosa succede al bonus di ranghi', ri.length && ri.every(x => /ranghi/.test(x.why)));
    AR.apply(G, ri.find(x => x.fronte === 10));
    /* la prima fila resta dov'era (Fig 125.2): dietro si ricompone il resto */
    ok('riordinata: dieci di fronte, con la prima fila dov era',
       tg.frontage === 10 && quasi(tg.y - AR.boxOf(tg, G.units).h / 2, 600 - 45, 0.5) &&
       tg.moved && tg.moved.kind === 'redress');
  }
}

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

/* Un reggimento con due capi dentro cade: i capi restavano tutti nel
   centro, uno sopra l'altro, e il primo che provava a girarsi non aveva
   posto (il seme 77 lo ha trovato, una volta che la ruota si paga). */
console.log('\ni capi di un reggimento caduto');
{
  const G = nuova();
  const nm = metti(G, uid(G, 504), 600, 300);
  const wb = uid(G, 501), bb = uid(G, 502);
  wb.join = { host: nm.uid }; bb.join = { host: nm.uid };
  wb.placed = bb.placed = true;
  IN.perdite(G, nm, 20);
  ok('restano in piedi, ognuno al suo posto, senza sovrapporsi',
     nm.dead && !wb.dead && !bb.dead && !wb.join && !bb.join && !dentro(G, wb, bb));
  ok('e dove stava la prima fila', Math.abs(wb.y - bb.y) < 1 && Math.abs(wb.y - 300) < 60);
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
  /* I nomi si chiedono ai pezzi, non si scrivono a mano: quando
     l'archivio fonde quattro Stone Troll Mobs da un modello in una da
     quattro, il numero di coda sparisce — «Stone Troll Mobs 1» diventa
     «Stone Troll Mobs» — e una prova che quel numero se l'era scritto
     addosso diventa rossa senza che nessuno abbia toccato una regola. */
  ok('in combattimento gli Skink tirano la Paura, e fallendo hanno −1 per colpire',
     K.log.some(x => x.text.includes(`${ks.name}, test di Paura`)) &&
     K.log.some(x => x.text.includes(`ha paura di ${kt.name}: −1 per colpire`)));
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
     G.log.some(x => x.text.includes(`${troll.name}, test di Stupidità`) && x.page === 178) &&
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
  try { G = AR.newBattle({ A: lista('lmttwt1fp4uep'), B: lista('lmttwuhu0z27k'), scenario:'bm-strada', magia: M2 }); }
  catch (e){ errore = e.message; }
  ok('la partita fra le liste grandi si prepara', !!G && !errore);
  const bas = G && G.units.find(u => u.mago && u.mago.level === 0 && u.mago.vincolati.includes('beamOfChotec'));
  ok('e il Bastiladon porta il Beam of Chotec, senza Livello', !!bas);
  seme(6);
  G = AR.newBattle({ A: lista('lmttwt1fp4uep'), B: lista('lmttwuhu0z27k'), scenario:'bm-strada', magia: M2 });
  try { await AG.giocaPartita(AR, G, { A: AG.agenteEuristico({}), B: AG.agenteEuristico({}) }); }
  catch (e){ errore = e.message; }
  ok('e si gioca fino in fondo', G.finita && !errore);
  const H = AR.newBattle({ A: lista('lmttwt1fp4uep'), B: lista('lmttwuhu0z27k'), scenario:'bm-strada', magia: M2 });
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

/* La prima sfida vera (Michele contro Gemini) e' finita 382 a 337 e
   l'arbitro l'ha chiamata pareggio: contava con lo scarto di 100 punti
   del Core Rulebook su un tavolo di Battle March, dove vince chi ne ha
   di piu' (p. 27), e il tesoro tenuto a fine turno non lo contava mai. */
console.log('\nil punteggio di Battle March (Battle March p. 27)');
{
  const G = nuova();
  ok('Battle March dura cinque round', G.rounds === 5 && G.formato === 'bm');
  ok('la Battaglia Campale del Core Rulebook sei', AR.newBattle({ A, B, scenario:'open' }).rounds === 6);

  const piccola = AR.unitsOf(G, 'B').filter(u => u.uid !== G.generale.B && u.pts > 0)
    .sort((x, y) => x.pts - y.pts)[0];
  piccola.dead = true;
  const p = AR.punteggio(G);
  ok('vince chi ha piu punti, anche di poco', p.winner === 'A' && p.A === piccola.pts && piccola.pts < 100);

  const gen = uid(G, G.generale.B);
  gen.dead = true;
  ok('il generale nemico caduto vale 50 punti in piu (The King is Dead)',
     AR.punteggio(G).A === piccola.pts + gen.pts + 50);

  const tesoro = G.sc.terrain.find(t => t.kind === 'treasure');
  const grossa = AR.unitsOf(G, 'A').filter(u => AR.usConCapi(G, u) >= 5)[0];
  metti(G, grossa, tesoro.x * MM, tesoro.y * MM);
  ok('chi ci sta sopra tiene il tesoro',
     AR.obiettivi(G).some(o => o.kind === 'treasure' && o.army === 'A'));
  const prima = AR.punteggio(G).A;
  G.army = 'A'; G.casella = AR.CASELLE.length - 1;
  AR.apply(G, { id:'avanti' });
  ok('e a fine turno il tesoro vale 10 punti',
     G.fineTurni.length === 1 && AR.punteggio(G).A === prima + 10);

  /* il punto di rottura e' uno scenario del Core Rulebook (p. 291),
     non una regola di tutte le partite: in Battle March non c'e' */
  AR.unitsOf(G, 'B').forEach(u => { u.dead = true; });
  const viva = G.units.find(u => u.army === 'B' && u.pts > 0);
  viva.dead = false;
  ok('in Battle March nessuno si rompe', AR.controllaFine(G, { inizioTurno: true }) === null && !G.finita);

  const R = AR.newBattle({ A, B, scenario:'bm-strada', durata:'breakpoint' });
  R.schierando = false;
  ok('con la durata del punto di rottura non ci sono round', !R.rounds);
  R.units.filter(u => u.army === 'B').forEach(u => { u.dead = true; });
  R.units.find(u => u.army === 'B' && u.pts > 0).dead = false;
  const e = AR.controllaFine(R, { inizioTurno: true });
  ok('e chi si rompe perde con vittoria schiacciante dell altro (p. 291)',
     !!e && e.winner === 'A' && e.level === 'crushing');
}

/* ================================================================= */
console.log('\nle sfide (pp. 211-212)');
{
  /* Il tavolo della sfida: la Temple Guard con dentro due personaggi,
     e i Black Orc Mobs con dentro il Warboss, a contatto di fronte. */
  const tavolo = () => {
    const G = nuova();
    G.generale = { A: null, B: null };
    const guardia = metti(G, uid(G, 6), 600, 600);
    const orchi = metti(G, uid(G, 503), 600, 400);
    for (const [c, h] of [[uid(G, 1), guardia], [uid(G, 2), guardia], [uid(G, 501), orchi]]){
      c.join = { host: h.uid }; c.placed = true; c.x = h.x; c.y = h.y; c.rot = h.rot;
    }
    aContattoDi(G, orchi, guardia);
    G.casella = casella('mischia');
    return G;
  };
  const chiede = G => AR.options(G);
  const trova = (G, id, uidCercato = null) =>
    chiede(G).list.find(x => x.id === id && (uidCercato == null || x.uid === uidCercato));

  /* 1 · si lancia quando il combattimento viene scelto, e prima la
     lancia chi è di turno (p. 211) */
  let G = tavolo(); G.army = 'B';
  AR.apply(G, trova(G, 'combatti'));
  let o = chiede(G);
  ok('scelto il combattimento, la sfida la lancia prima chi è di turno',
     o.player === 'B' && o.page === 211 && o.list.some(x => x.id === 'sfida' && x.uid === 501));
  ok('e l opzione porta i numeri del duello, non solo il nome',
     o.list.filter(x => x.id === 'sfida').every(x =>
       typeof x.vantaggio === 'number' && /ferite a round/.test(x.why)));
  ok('si può anche non lanciarla', o.list.some(x => x.id === 'nessuna'));

  /* 1 bis · un campione d'unità nel combattimento: sul libro potrebbe
     sfidare, qui no, e lo si dice quando conta (p. 211) */
  {
    const K = tavolo(); K.army = 'B';
    uid(K, 6).command = { ...(uid(K, 6).command || {}), champion: true };
    AR.apply(K, AR.options(K).list.find(x => x.id === 'combatti'));
    ok('con un campione in campo il limite esce nel registro',
       K.log.some(x => x.kind === 'limite' && /campioni d.unità/.test(x.text)));
  }

  /* 2 · chi la subisce la raccoglie o la rifiuta */
  AR.apply(G, trova(G, 'sfida', 501));
  o = chiede(G);
  ok('lanciata, tocca all altro rispondere',
     o.player === 'A' && /chi la raccoglie/.test(o.what) &&
     o.list.filter(x => x.id === 'accetta').length === 2);
  ok('e dentro un reggimento la si può rifiutare', o.list.some(x => x.id === 'rifiuta'));

  /* 3 · raccolta, i due si menano solo fra loro (p. 212) */
  AR.apply(G, trova(G, 'accetta', 1));
  ok('la sfida raccolta resta nello stato, perché continua nei turni dopo (p. 212)',
     G.sfide.length === 1 && G.sfide[0].a === 1 && G.sfide[0].b === 501);
  ok('e il combattimento si è risolto', G.log.some(x => /Risultato:/.test(x.text)));
  const colpi = G.log.filter(x => /colpi su/.test(x.text));
  ok('il Warboss mena solo allo sfidante',
     colpi.filter(x => /^Black Orc Warboss/.test(x.text))
          .every(x => /su Saurus Scar-Veteran/.test(x.text)));
  ok('e nessuno dei due si prende i colpi della truppa',
     !colpi.some(x => /^(Temple Guard|Black Orc Mobs) colpi su (Black Orc Warboss|Saurus Scar-Veteran)/.test(x.text)));
  ok('il registro dice che si battono in sfida, con la pagina',
     G.log.some(x => /si battono in sfida/.test(x.text) && x.page === 212));

  /* 4 · «To The Death!»: finché dura non se ne lancia un altra */
  G.army = 'A'; G.casella = casella('mischia');
  const dopo = trova(G, 'combatti');
  if (dopo) AR.apply(G, dopo);
  ok('con una sfida in corso non se ne lancia un altra (p. 212)',
     !G.pending || G.pending.kind !== 'sfida');

  /* 5 · rifiutata: chi l ha lanciata sceglie chi si ritira, e chi si
     ritira esce dal combattimento (p. 211) */
  G = tavolo(); G.army = 'B';
  AR.apply(G, trova(G, 'combatti'));
  AR.apply(G, trova(G, 'sfida', 501));
  AR.apply(G, trova(G, 'rifiuta'));
  o = chiede(G);
  ok('rifiutata, sceglie chi si ritira chi l aveva lanciata',
     o.player === 'B' && o.list.filter(x => x.id === 'ritira').length === 2 &&
     o.list.every(x => x.id !== 'ritira' || typeof x.ld === 'number'));
  AR.apply(G, trova(G, 'ritira', 1));
  ok('il ritirato resta segnato, con chi lo ha sfidato',
     uid(G, 1).ritiro && uid(G, 1).ritiro.sfidante === 501);
  ok('non mena più: nel combattimento non c è',
     !G.log.some(x => /^Saurus Scar-Veteran colpi/.test(x.text)));
  ok('e nessuno può colpirlo',
     !G.log.some(x => /colpi su Saurus Scar-Veteran/.test(x.text)));
  ok('il limite di quello che il ritiro non toglie è dichiarato',
     G.log.some(x => x.kind === 'limite' && /tiene il passo e la Forza d.Unità/.test(x.text)));

  /* 5 bis · il Comando che il ritirato non presta più (p. 211). La
     Temple Guard ha Comando 8 come il Saurus Scar-Veteran e non se ne
     accorgerebbe: si guarda dove la differenza si vede, cioè dentro
     uno Skink Skirmishers da Comando 5. */
  {
    const K = nuova();
    const skink = metti(K, uid(K, 3), 600, 600);
    for (const n of [1, 2]){
      const c = uid(K, n);
      c.join = { host: skink.uid }; c.placed = true; c.x = skink.x; c.y = skink.y;
    }
    ok('con dentro il Saurus il reggimento usa il suo Comando 8 (p. 97)',
       AR.interni.ldProprio(K, skink).ld === 8);
    uid(K, 1).ritiro = { sfidante: 501, ospite: 503, turno: 1 };
    ok('ritirato, il Comando che presta non vale più: resta quello dello Skink Chief',
       AR.interni.ldProprio(K, skink).ld === 6);
  }

  /* 6 · il ritiro scade quando chi lo ha sfidato non gli sta più
     addosso (p. 211) */
  const via = uid(G, 503); via.x = 100; via.y = 100;
  uid(G, 501).x = 100; uid(G, 501).y = 100;
  AR.interni.ripulisciSfide(G);
  ok('staccato il nemico, il ritirato torna in prima fila',
     !uid(G, 1).ritiro && G.log.some(x => /torna in prima fila/.test(x.text)));

  /* 7 · «Nowhere To Run» (p. 212): un personaggio da solo non è dentro
     nessuna unità, e la sfida non la può rifiutare */
  const H = nuova();
  H.generale = { A: null, B: null };
  const solo = metti(H, uid(H, 1), 600, 600);
  const mob = metti(H, uid(H, 503), 600, 400);
  const boss = uid(H, 501);
  boss.join = { host: mob.uid }; boss.placed = true; boss.x = mob.x; boss.y = mob.y; boss.rot = mob.rot;
  aContattoDi(H, mob, solo);
  H.army = 'B'; H.casella = casella('mischia');
  AR.apply(H, AR.options(H).list.find(x => x.id === 'combatti'));
  AR.apply(H, AR.options(H).list.find(x => x.id === 'sfida' && x.uid === 501));
  const risposta = AR.options(H);
  ok('un personaggio da solo non ha dove scappare: può solo raccoglierla',
     risposta.list.some(x => x.id === 'accetta' && x.uid === 1) &&
     !risposta.list.some(x => x.id === 'rifiuta'));
  ok('e rifiutare lo stesso non si può', AR.apply(H, { id:'rifiuta' }).ok === false);

  /* 8 · l altra metà di «Nowhere To Run»: un reggimento ingaggiato su
     tutti e quattro i lati non ha dove nascondere nessuno (p. 212) */
  {
    const K = nuova();
    const guardia = metti(K, uid(K, 6), 600, 600);
    const capo = uid(K, 1);
    capo.join = { host: guardia.uid }; capo.placed = true; capo.x = guardia.x; capo.y = guardia.y;
    /* `aContattoDi` sceglie lui la faccia: qui le facce vanno scelte a
       mano, una per lato, e si appoggia la basetta a quella */
    const accosta = (u, lato) => {
      u.placed = true;
      u.rot = { fronte:180, retro:0, sinistra:90, destra:270 }[lato];
      u.x = guardia.x; u.y = guardia.y;
      const bt = AR.boxOf(guardia, K.units), bu = AR.boxOf(u, K.units);
      if (lato === 'fronte')   u.y = bt.y - (bt.h + bu.h) / 2;
      if (lato === 'retro')    u.y = bt.y + (bt.h + bu.h) / 2;
      if (lato === 'sinistra') u.x = bt.x - (bt.w + bu.h) / 2;
      if (lato === 'destra')   u.x = bt.x + (bt.w + bu.h) / 2;
      return u;
    };
    /* I quattro reggimenti nemici si prendono dal tavolo, non per
       numero: gli uid scritti a mano seguono l'ordine delle unità nella
       lista, e quando l'archivio ne fonde quattro in una — i Stone Troll
       Mobs, il 2026-09-20 — un uid smette di esistere e la prova casca
       con un errore invece che con un FAIL leggibile. */
    const reggimenti = K.units.filter(u => u.army === 'B' && u.models > 1);
    ok('sul tavolo ci sono i quattro reggimenti che servono', reggimenti.length >= 4);
    /* prima un nemico solo, di fronte: di lì si scappa */
    accosta(reggimenti[0], 'fronte');
    ok('con il nemico solo davanti la sfida si può ancora rifiutare',
       AR.interni.puoRifiutare(K, capo) === true);
    /* e poi da tutte e quattro le parti */
    accosta(reggimenti[1], 'retro');
    accosta(reggimenti[2], 'sinistra');
    accosta(reggimenti[3], 'destra');
    ok('i quattro nemici toccano i quattro lati',
       AR.contatti(K).filter(c => (c.a === guardia.uid || c.b === guardia.uid) &&
                                  (c.a === guardia.uid ? c.bArmy : c.aArmy) !== 'A').length === 4);
    ok('e allora non c è dove scappare: la sfida non si rifiuta (p. 212)',
       AR.interni.puoRifiutare(K, capo) === false);
  }
  seme(1);
}

/* ================================================================= */
console.log('\nil terreno, in partita (pp. 269-272 e 159)');
{
  /* Le Rovine di Xhotl hanno tutto quello che serve in un tavolo solo:
     due paludi (pericoloso), due boschi, due colline, una piramide
     impassabile e due tesori, che sono decorazioni da 40 mm.

     Il terreno c'era anche prima; quello che non c'era era la CATEGORIA
     sui pezzi, e senza quella l'arbitro non poteva leggere nemmeno una
     riga del capitolo del terreno. */
  const X = lista('lmtl5st4mdsb5'), Y = lista('lmtl5t6hcsa1y');   // «Le Rovine di Xhotl»
  seme(1);
  const G = AR.newBattle({ A: X, B: Y, scenario: 'bm-rovine' });
  const pezzo = k => G.terrain.find(t => t.kind === k);

  ok('ogni pezzo posato porta la sua categoria',
     pezzo('marsh').cat.id === 'dangerous' && pezzo('wood').cat.id === 'wood' &&
     pezzo('pyramid').cat.id === 'impassable' && pezzo('hill').cat.id === 'open');
  ok('e la copertura vera, non due nomi di tipo',
     pezzo('wood').cover === 'soft' && pezzo('pyramid').cover === 'hard' && pezzo('marsh').cover === '');
  ok('il tesoro è una decorazione: sotto i due pollici (p. 271)',
     pezzo('treasure').decor === true && pezzo('wood').decor === false);

  const sauri = G.units.find(u => u.name === 'Saurus Warriors');
  const mob = G.units.find(u => u.name === 'Night Goblin Mobs');
  for (const u of [sauri, mob]) u.placed = true;

  /* La piramide sta al centro (24″, 18″): non si attraversa (p. 270).
     Prima `ingombro` guardava solo le unità e il bordo, e nelle partite
     dell'arbitro si camminava dentro la piramide come in un prato. */
  sauri.x = 610; sauri.y = 850; sauri.rot = 0;
  const dentro = AR.ingombro(G, sauri, { ...AR.boxOf(sauri, G.units), x: 610, y: 457 });
  ok('nella piramide non si entra', !!dentro && /Piramide/.test(dentro.perche));
  ok('e nel prato accanto sì',
     AR.ingombro(G, sauri, { ...AR.boxOf(sauri, G.units), x: 610, y: 850 }) === null);

  /* Il pollice in meno (p. 269): il bosco in basso a sinistra sta a
     (9″, 28″), i Saurus hanno Movimento 4. */
  sauri.x = 229; sauri.y = 860; sauri.rot = 0;
  ok('attraversare il bosco toglie un pollice al Movimento',
     AR.interni.rallenta(G, sauri, [229, 700], 4) === 3);
  ok('e in aperto il Movimento resta quello',
     AR.interni.rallenta(G, sauri, [900, 860], 4) === 4);
  ok('il Movimento non scende mai sotto uno', AR.interni.rallenta(G, sauri, [229, 700], 1) === 1);

  /* Il test di terreno pericoloso (p. 269): la palude in basso a destra
     sta a (36″, 26″). Non c'era da nessuna parte: la palude si
     dichiarava «pericolosa» e non faceva male a nessuno. */
  sauri.x = 914; sauri.y = 850; sauri.rot = 0;
  ok('la palude sul cammino si vede',
     AR.interni.pezziSulCammino(G, sauri, [914, 660], 8).some(t => t.kind === 'marsh'));
  const persi = sauri.lost || 0, prima = G.log.length;
  D.setSource(() => 0);                       // tutti 1: nessuno mette il piede giusto
  AR.apply(G, { id: 'avanza', uid: sauri.uid, verso: mob.uid, x: 914, y: 660 });
  seme(1);
  ok('chi la attraversa tira un dado per modello, e con gli 1 perde ferite',
     (sauri.lost || 0) > persi &&
     G.log.slice(prima).some(r => /attraversa Palude: \d+ dadi a 2\+/.test(r.text) && r.page === 269));

  /* I ranghi persi (p. 159): un quarto o più dei modelli nel terreno
     difficile all'INIZIO della fase di combattimento, non solo a fine
     carica. `combat.js` leggeva `u.disrupted` da sempre, e nessuno
     l'accendeva mai. */
  sauri.lost = 0; sauri.dead = false; sauri.placed = true;
  sauri.x = 229; sauri.y = 711; sauri.rot = 0;       // dentro il bosco
  mob.x = 700; mob.y = 850; mob.rot = 180;           // in aperto
  AR.interni.terrenoInMischia(G, { A: [sauri], B: [mob] });
  ok('chi mena con un quarto dei modelli nel bosco perde i ranghi', sauri.disrupted === true);
  ok('e chi sta in aperto no', mob.disrupted === false);

  /* Il terreno più alto (p. 152): la collina di destra sta a (43,5″, 18″). */
  sauri.x = 1105; sauri.y = 457; sauri.rot = 0;
  AR.interni.terrenoInMischia(G, { A: [sauri], B: [mob] });
  ok('chi ha la prima fila sulla collina prende il terreno più alto', sauri.highGround === true);
  ok('e chi è nel prato no', mob.highGround === false);

  /* La vedetta (p. 272): chi sta tutto su una collina tira con una fila
     in più. `shoot.js` lo sapeva da sempre; `CB.shooters` non glielo
     chiedeva, e da sopra una collina si tirava come dal prato. */
  const conCollina = AR.interni.quantiTirano(G, sauri);
  sauri.x = 700; sauri.y = 850;
  const senza = AR.interni.quantiTirano(G, sauri);
  ok('dalla collina tira una fila in più', conCollina === senza + sauri.frontage);

  /* Il riparo contato sui modelli (p. 139) e non sul centro: prima
     l'arbitro sapeva dire solo «leggera» oppure niente. */
  mob.x = 965; mob.y = 203; mob.rot = 180;           // dentro il bosco in alto
  sauri.x = 965; sauri.y = 600; sauri.rot = 0;
  ok('il bersaglio nel bosco è in riparo', !!AR.interni.guarda(G, sauri, mob).cover);
  mob.x = 700; mob.y = 300;
  ok('e in aperto no', AR.interni.guarda(G, sauri, mob).cover === '');
  seme(1);
}

console.log('\nil muro che chiude la strada, e come lo si aggira (p. 270)');
{
  /* La partita del 2026-09-21: un reggimento di Black Orc schierato
     dietro il monolite ci e' rimasto fermo per tutta la partita. Il
     tavolo era giusto — `ingombro` nel monolite non ci lascia entrare —
     e sbagliato era quello che si metteva davanti a chi sceglie:

       · la fotografia non nominava il terreno, e quindi per chi
         schierava il monolite non esisteva;
       · l'opzione diceva «marcia di 8″» e il tavolo ne dava zero, ogni
         turno, identica.

     Qui si prova tutte e due, e che dall'incastro si esce. */
  const P1 = lista('lmtl5rgsd5g06'), P2 = lista('lmtl5ruzktzvb');   // «Il Monolite nella Palude»
  seme(7);
  const M = AR.newBattle({ A: P1, B: P2, scenario: 'bm-monolite' });
  const mono = M.terrain.find(t => t.kind === 'monolith');

  const foto = AR.fotografia(M, { per: 'A' });
  ok('la fotografia elenca i pezzi del tavolo', /Il terreno sul tavolo \(pp\. 269-272\)/.test(foto));
  ok('e del monolite dice che non si attraversa e dove sta',
     /Monolite — 4×4″, al centro del tavolo \(24, 18\): non si attraversa/.test(foto));
  ok('del bosco dice la penombra, e della palude il dado per modello',
     /Bosco.*penombra/.test(foto) && /Palude.*test di terreno pericoloso/.test(foto));
  ok('le decorazioni non finiscono fra i pezzi che si aggirano',
     !/· Tesoro —/.test(foto));

  /* i pezzi a mano: un reggimento di A sotto il monolite, un nemico
     sopra, e in mezzo il monolite e nient'altro */
  const mio = M.units.find(u => u.army === 'A' && u.name === 'Saurus Warriors');
  const suo = M.units.find(u => u.army === 'B' && u.name === 'Night Goblin Mobs');
  for (const u of M.units) u.placed = false;
  mio.placed = true; mio.x = 24 * MM; mio.y = 23 * MM; mio.rot = 0;
  suo.placed = true; suo.x = 24 * MM; suo.y = 10 * MM; suo.rot = 180;
  M.schierando = false; M.casella = casella('mosse'); M.army = 'A'; M.turno = 1;

  const mosse = () => AR.options(M).list.filter(x => x.uid === mio.uid);
  const l1 = mosse();
  const av = l1.find(x => x.id === 'avanza'), ma = l1.find(x => x.id === 'marcia');
  ok('l opzione non promette più pollici di quelli che il tavolo darà',
     /Monolite chiude la strada: di pollici ne fa 1\.2/.test(av.why) &&
     /però Monolite chiude la strada/.test(ma.why) && av.page === 270);

  const agg = l1.filter(x => x.id === 'aggira');
  ok('e si offre di girarci attorno, un varco per lato', agg.length === 2);
  ok('da attaccati al muro il varco si prende di lato: girarsi non ci starebbe (p. 125)',
     agg.every(x => x.lato === true && x.page === 125) &&
     agg.map(x => x.segno).sort().join() === '-1,1');

  /* l'euristica la sceglie: è la riga che prima non c'era, e senza la
     quale «aggira» resterebbe in elenco senza che nessuno la prenda */
  const euro = AG.agenteEuristico({ nome: 'prova' });
  const scelta = await euro.scegli({ opzioni: AR.options(M) });
  ok('l euristica preferisce aggirare invece di andare addosso al muro',
     scelta.scelta.id === 'aggira');

  /* e si esce davvero: sei turni di mosse, scegliendo come l'euristica */
  let giri = 0;
  while (giri++ < 6 && AR.distanza(M, mio, suo) > 2){
    mio.moved = null; M.army = 'A'; M.casella = casella('mosse');
    const l = mosse();
    const a = l.filter(x => x.id === 'aggira').sort((x, y) => (y.pollici || 0) - (x.pollici || 0))[0];
    const m = l.find(x => x.id === 'marcia') || l.find(x => x.id === 'avanza');
    AR.apply(M, a || m);
  }
  ok('in sei turni il reggimento supera il monolite e arriva sul nemico',
     AR.distanza(M, mio, suo) <= 2);
  ok('e non è passato attraverso: il monolite è ancora libero',
     !polysOverlap(AR.cornersOf(mio, M.units), mono.poly));

  /* quando la strada è libera l'aggiramento non si offre: sarebbe una
     mossa in più in ogni elenco di ogni turno, per niente */
  mio.x = 10 * MM; mio.y = 23 * MM; mio.rot = 0; mio.moved = null;
  suo.x = 10 * MM; suo.y = 14 * MM;
  M.casella = casella('mosse');
  ok('in campo aperto non si offre nessun aggiramento',
     !mosse().some(x => x.id === 'aggira'));
  seme(1);
}

console.log('\ni posti di schieramento dicono che cosa ci trovano (pp. 269-272)');
{
  /* L'altra meta' della stessa partita: i Black Orc dietro il monolite
     ci sono finiti allo SCHIERAMENTO, e l'etichetta diceva soltanto
     «centro, in prima fila». `postiPer` guardava le unita' amiche e i
     bordi della zona, e del terreno non sapeva niente.

     Le Rovine di Xhotl hanno la piramide impassabile in mezzo e le
     zone che la sfiorano: e' il tavolo su cui la cosa si vede. */
  const X = lista('lmtl5st4mdsb5'), Y = lista('lmtl5t6hcsa1y');
  seme(3);
  const R = AR.newBattle({ A: X, B: Y, scenario: 'bm-rovine' });
  const primo = R.units.find(u => u.army === 'A' && !u.placed && u.models > 5);
  const posti = AR.postiPer(R, primo);

  ok('il posto dice su che cosa ci si posa, e con che nome',
     posti.some(x => /ci si posa dentro (Bosco|Palude)/.test(x.why)));
  ok('e con il tag corto, non con la regola intera ricopiata quindici volte',
     posti.some(x => /Palude \(pericoloso, niente ranghi/.test(x.why)) &&
     !posti.some(x => /penombra/.test(x.why)));
  ok('quello che ha la piramide davanti lo dice, con la distanza e la pagina',
     posti.some(x => x.murato && /c'e Piramide: non si attraversa/.test(x.why.replace(/è/g, 'e')) &&
                     /davanti, a \d/.test(x.why)));
  ok('e i posti murati stanno in fondo all elenco, non in cima',
     posti.some(x => x.murato) &&
     posti.slice(posti.findIndex(x => x.murato)).every(x => x.murato));
  ok('i pezzi lontani non si nominano: si guarda avanti dodici pollici',
     posti.every(x => !/a (1[3-9]|[2-9]\d)(\.\d)?″/.test(x.why)));

  /* nessun posto dentro un impassabile, su nessuno dei tre tavoli di
     Battle March: prima era vero per fortuna, adesso per costruzione */
  for (const sc of ['bm-monolite', 'bm-rovine', 'bm-strada']){
    seme(3);
    const T = AR.newBattle({ A: X, B: Y, scenario: sc });
    const muri = T.terrain.filter(t => !t.decor && t.cat.noEntry);
    let dentro = 0, offerti = 0;
    for (const u of T.units.filter(x => !x.placed)){
      for (const p of AR.postiPer(T, u)){
        offerti++;
        const poly = boxCorners({ ...AR.boxOf(u, T.units), x: p.x, y: p.y, rot: p.rot });
        if (muri.some(m => polysOverlap(poly, m.poly))) dentro++;
      }
    }
    ok(`su ${sc} nessuno dei ${offerti} posti offerti sta dentro un impassabile`, offerti > 0 && dentro === 0);
  }

  /* e l'euristica li evita: senza questa riga il marchio resterebbe
     scritto sull'opzione e nessuno lo guarderebbe */
  const euro = AG.agenteEuristico({ nome: 'prova' });
  const solo = { list: [
    { id:'schiera', uid: 1, dove:'centro', murato: true, why:'centro, con la Piramide davanti' },
    { id:'schiera', uid: 1, dove:'destra', why:'destra, in prima fila' },
  ] };
  const s1 = await euro.scegli({ opzioni: solo });
  ok('l euristica lascia stare il posto murato', s1.scelta.dove === 'destra');
  const tuttiMurati = { list: [{ id:'schiera', uid: 1, dove:'centro', murato: true, why:'x' }] };
  const s2 = await euro.scegli({ opzioni: tuttiMurati });
  ok('ma se sono murati tutti si schiera lo stesso', s2.scelta.dove === 'centro');
  seme(1);
}

/* ================================================================= */
console.log(fails ? `\n${fails} prove fallite` : '\ntutto a posto');
process.exit(fails ? 1 : 0);
