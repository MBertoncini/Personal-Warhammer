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
import { polysOverlap } from '../src/geom.js';
import { spawnSync } from 'node:child_process';

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
  G2.casella = 1; G2.army = 'A';
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
  G.casella = 2; G.army = 'A';
  AR.apply(G, { id:'ferma', uid: sk.uid });
  G.casella = 3;
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
