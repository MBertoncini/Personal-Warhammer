/* Schieramento Old World — la ricerca delle liste, senza terminale
 *
 * Il giro di generazioni che stava in tools/liste/cerca.mjs, tolto dal
 * terminale perché lo possa lanciare anche la pagina (il Laboratorio).
 * Il racconto di come funziona è rimasto lì, in cima al file; qui si
 * dice solo cosa è cambiato strada facendo.
 *
 * Non sa chi gioca le partite: riceve `gioca({ x, y, scenario, partite,
 * seme })`, che dal terminale sono i worker_threads di motore.mjs e
 * dalla pagina i Web Worker di lab-motore.js. Non sa nemmeno dove vanno
 * i risultati: torna un documento, e chi chiama lo scrive su un file o
 * nell'archivio del browser.
 *
 * Tre ricerche, che rispondono a tre domande diverse:
 *
 *   cercaLista — la lista di una fazione, contro avversari dati.
 *     L'OBIETTIVO si sceglie: «forte» è la lista che vince di più (quella
 *     di sempre); «equilibrata» è quella che contro OGNI avversario sta
 *     più vicina al 50% — non la media: vincere sempre contro uno e
 *     perdere sempre contro l'altro fa 50% e due serate noiose. È la
 *     regola di bilancia.mjs, portata dentro la ricerca.
 *
 *   cercaCoppia — due liste, di due fazioni, che si battono alla pari.
 *     Qui non c'è un avversario fermo: si cercano coppie, e ogni coppia
 *     gioca contro sé stessa. Le figlie cambiano una delle due liste, o
 *     scambiano i compagni fra le coppie migliori. È la domanda di chi
 *     vuole una partita nuova per stasera, non la lista da torneo.
 *
 *   cercaScenario — per due liste date, il tavolo su cui vengono alla
 *     pari: tavoli generati (terreno-casuale.js) con schieramenti,
 *     misure e terreno diversi, giocati tutti, ordinati per equilibrio.
 *
 * In tutte e tre ogni cella si gioca a specchio (lab-partite.js), e i
 * numeri finali vengono da semi mai usati per scegliere: scelta fra
 * tante, la migliore lo è anche un po' per fortuna, e quella fortuna non
 * deve restare nei conti (vedi la memoria del progetto sul rumore).
 */

export const SFORZI = {
  lampo:    { popolazione: 6,  generazioni: 3,  celle: 4,  verifica: 1, finaliste: 2 },
  rapido:   { popolazione: 8,  generazioni: 4,  celle: 8,  verifica: 1, finaliste: 3 },
  normale:  { popolazione: 10, generazioni: 8,  celle: 12, verifica: 2, finaliste: 4 },
  accurato: { popolazione: 14, generazioni: 12, celle: 18, verifica: 4, finaliste: 5 },
};

/* quante partite, per chi deve decidere se lanciarla: ogni cella e ogni
   seme di verifica sono due partite, a specchio */
export const stimaPartite = (p, celleTutte, temi = 0) =>
  2 * ((p.popolazione * p.generazioni + temi) * Math.min(p.celle, celleTutte) + p.finaliste * celleTutte * p.verifica);
export const stimaCoppia = (p, scenari) =>
  2 * (p.popolazione * p.generazioni * Math.min(p.celle, scenari * 2) + p.finaliste * scenari * p.verifica * 2);

/* i dadi della ricerca: col seme, la stessa ricerca rifatta dà le stesse liste */
export function generatore(seme){
  let stato = seme >>> 0;
  return () => { stato = (stato + 0x6D2B79F5) >>> 0; let t = stato; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const vuoto = () => ({ w: 0, l: 0, d: 0, n: 0 });
export const somma = (a, r) => { a.w += r.vince.x; a.l += r.vince.y; a.d += r.pari; a.n += r.n; return a; };
const aggiungi = (a, b) => { a.w += b.w; a.l += b.l; a.d += b.d; a.n += b.n; return a; };
const pc = (a, n) => Math.round(100 * a / (n || 1));
/* la quota con due partite finte, una vinta e una persa: con poche
   partite resta vicina al 50%, e una lista fortunata una volta non va in
   testa per quello */
const quota = s => (s.w + s.d / 2 + 1) / (s.n + 2);

/* Gli obiettivi. `s` ha i conti di tutte le partite e `per`, quelli
   contro ogni avversario (o scenario, nelle coppie). Più alto è meglio. */
export const OBIETTIVI = {
  forte: { label: "la più forte", punteggio: s => quota(s) },
  equilibrata: { label: "la più equilibrata", punteggio: s => {
    const parti = Object.values(s.per || {}).filter(p => p.n);
    const lontano = parti.length ? parti.reduce((t, p) => t + Math.abs(quota(p) - 0.5), 0) / parti.length : Math.abs(quota(s) - 0.5);
    return 1 - 2 * lontano - 0.2 * s.d / (s.n + 1);
  } },
};
const punteggioDi = obiettivo => (OBIETTIVI[obiettivo] || OBIETTIVI.forte).punteggio;
/* come lo si dice a chi legge */
export const lettura = (s, obiettivo = "forte") => `vince ${pc(s.w, s.n)}% perde ${pc(s.l, s.n)}%` +
  (obiettivo === "equilibrata" ? ` · scarto medio dal 50% ${Math.round(100 * (1 - punteggioDi("equilibrata")(s)) / 2)} punti` : "");

/* Una serie di n semi diventa n lavori da un seme: gli stessi numeri
   (la serie gioca i semi uno dopo l'altro, ognuno dal suo), ma con
   pochi avversari e pochi scenari i lavoratori non restano a guardare. */
export async function giocaSpezzata(gioca, job){
  const n = Math.max(1, job.partite | 0);
  if (n === 1) return gioca(job);
  const rr = await Promise.all(Array.from({ length: n }, (_, i) => gioca({ ...job, partite: 1, seme: job.seme + i })));
  const r = { vince: { x: 0, y: 0 }, pari: 0, n: 0, vp: { x: 0, y: 0 }, fuori: {} };
  for (const q of rr){
    r.vince.x += q.vince.x; r.vince.y += q.vince.y; r.pari += q.pari; r.n += q.n;
    r.vp.x += (q.vp || {}).x || 0; r.vp.y += (q.vp || {}).y || 0;
    for (const [k, v] of Object.entries(q.fuori || {})) r.fuori[k] = (r.fuori[k] || 0) + v;
  }
  return r;
}

/* Un giro al ciclo degli eventi, perché la pagina resti viva. Non con
   setTimeout: con la scheda nascosta il browser lo rallenta fino a una
   volta al minuto, e una ricerca lanciata e lasciata lì non andava più
   avanti. Un messaggio su un MessageChannel non lo rallenta nessuno. */
const lascia = () => new Promise(r => {
  if (typeof MessageChannel === "undefined") return setTimeout(r, 0);
  const c = new MessageChannel();
  c.port1.onmessage = () => { c.port1.close(); r(); };
  c.port2.postMessage(0);
});

/* ============================================================
   1 · LA LISTA DI UNA FAZIONE
   `S`: lo spazio (src/spazio.js). `contro`: [{ lista, fonte, file? }].
   `scenari`: gli id. `prima`: il documento della ricerca di prima con
   gli stessi parametri, da cui ripartire. `log(riga)`, `avanza(fatte,
   stimate)`, `fermato()`: per chi guarda. Chi ferma riceve quello che
   c'è: le migliori fin lì, verificate se la verifica era cominciata.
   ============================================================ */
export async function cercaLista({ S, contro, scenari, P, seme = 1001, gioca, obiettivo = "forte",
                                   prima = null, esempi = true, etichetta = "", idBase = "r-ricerca",
                                   log = () => {}, avanza = () => {}, fermato = () => false }){
  const rnd = generatore(seme);
  const scegli = a => a[Math.floor(rnd() * a.length)];
  const punteggio = punteggioDi(obiettivo);
  const t0 = Date.now();
  const tutteLeCelle = contro.flatMap(a => scenari.map(s => ({ a, s })));
  const stima = stimaPartite(P, tutteLeCelle.length, S.voci.length);
  let partite = 0;

  async function giocaGeni(geni, celle, semeDa, quanti){
    const x = S.costruisci(geni, { id: "cand-" + S.fazione });
    const fatti = await Promise.all(celle.map(({ a, s }) =>
      giocaSpezzata(gioca, { x, y: a.lista, scenario: s, partite: quanti, seme: semeDa }).then(r => ({ a: a.lista.id, s, r }))));
    partite += fatti.reduce((t, f) => t + f.r.n, 0);
    avanza(partite, stima);
    return fatti;
  }
  /* le celle di una generazione: ogni avversario a turno, uno scenario
     a caso che non ha ancora giocato in questa generazione */
  function estrai(k){
    if (k >= tutteLeCelle.length) return tutteLeCelle;
    const ordine = [...contro].sort(() => rnd() - 0.5), usati = new Map(), out = [];
    for (let i = 0; out.length < k && i < 10 * k + 50; i++){
      const a = ordine[i % ordine.length], fatti = usati.get(a) || new Set();
      const liberi = scenari.filter(s => !fatti.has(s));
      if (!liberi.length) continue;
      const s = liberi[Math.floor(rnd() * liberi.length)];
      fatti.add(s); usati.set(a, fatti); out.push({ a, s });
    }
    return out;
  }

  /* la popolazione iniziale */
  const visti = new Map();          // chiave -> { geni, w, l, d, n, per }
  const pop = [];
  const entra = geni => { if (!geni) return false; const k = S.chiave(geni); if (pop.some(g => S.chiave(g) === k)) return false; pop.push(geni); return true; };
  const riprese = [];
  for (const m of (prima && prima.migliori) || []) if (m.geni && !S.valida(m.geni).length && entra(m.geni)) riprese.push(m);
  if (esempi) for (const p of S.partenze) entra(p);
  const temi = [];
  for (const v of [...S.voci].sort(() => rnd() - 0.5)){
    if (pop.some(g => g.some(x => x.k === v.k))) continue;
    if (entra(S.casuale(rnd, { con: v.k }))) temi.push(v.nome);
  }
  /* le liste a caso, finché ne vengono: cinque buchi di fila vogliono
     dire che con questi limiti non se ne scrivono più */
  for (let t = 0, buchi = 0; pop.length < P.popolazione && t < 200 && buchi < 5; t++){
    const g = S.casuale(rnd);
    buchi = g ? 0 : buchi + 1;
    entra(g);
    if (t % 4 === 3) await lascia();
  }
  log(`prima generazione: ${pop.length} liste${esempi && S.partenze.length ? ", con la lista nota" : ""}; a tema: ${temi.join(", ") || "nessuna"}`);
  if (riprese.length) log(`riprende da ${riprese.length} liste della ricerca del ${String(prima.quando).slice(0, 10)}`);
  if (!pop.length) return { vuota: true, motivo: "non riesco a scrivere nessuna lista valida con queste unità", partite };

  const storia = [];
  const E = Math.max(2, Math.ceil(P.popolazione / 3));
  for (let gen = 0; gen < P.generazioni && !fermato(); gen++){
    const semeGen = seme + gen, celle = estrai(P.celle);
    await Promise.all(pop.map(async geni => {
      const k = S.chiave(geni);
      const s = visti.get(k) || { geni, ...vuoto(), per: {} };
      for (const f of await giocaGeni(geni, celle, semeGen, 1)){ somma(s, f.r); somma(s.per[f.a] ||= vuoto(), f.r); }
      visti.set(k, s);
    }));
    const classifica = pop.map(g => visti.get(S.chiave(g))).sort((a, b) => punteggio(b) - punteggio(a));
    const top = classifica[0];
    storia.push({ gen: gen + 1, partite, migliore: Math.round(100 * punteggio(top)), vince: pc(top.w, top.n), n: top.n, lista: S.descrivi(top.geni) });
    log(`gen ${gen + 1}/${P.generazioni} · ${partite} partite · ${Math.round((Date.now() - t0) / 1000)}s · in testa: ${lettura(top, obiettivo)} su ${top.n} — ${S.descrivi(top.geni).replace(/ — \d+ pt/g, "")}`);
    if (gen === P.generazioni - 1) break;
    await lascia();

    /* la generazione dopo: le migliori restano, le altre sono figlie */
    const elite = classifica.slice(0, E).map(s => s.geni);
    pop.length = 0;
    for (const g of elite) pop.push(g);
    const torneo = () => { const a = scegli(elite), b = scegli(elite); return punteggio(visti.get(S.chiave(a))) >= punteggio(visti.get(S.chiave(b))) ? a : b; };
    for (let t = 0, buchi = 0; pop.length < P.popolazione - 1 && t < 300 && buchi < 12; t++){
      const figlia = S.muta(torneo(), rnd);
      buchi = figlia ? 0 : buchi + 1;
      if (figlia && !visti.has(S.chiave(figlia))) entra(figlia);
      if (t % 8 === 7) await lascia();
    }
    for (let t = 0, buchi = 0; pop.length < P.popolazione && t < 50 && buchi < 3; t++){ const c = S.casuale(rnd); buchi = c ? 0 : buchi + 1; if (c && !visti.has(S.chiave(c))) entra(c); }
  }

  /* la verifica, su semi mai usati per scegliere */
  const finaliste = [...visti.values()].filter(s => s.n > 0).sort((a, b) => punteggio(b) - punteggio(a)).slice(0, P.finaliste);
  log(`verifica di ${finaliste.length} finaliste su ${P.verifica} semi nuovi…`);
  const migliori = [];
  for (const s of finaliste){
    if (fermato() && migliori.length) break;
    const v = { ...vuoto(), per: {}, perScenario: {}, perAvversario: {}, celle: {}, fuori: {} };
    for (const f of await giocaGeni(s.geni, tutteLeCelle, 5001, P.verifica)){
      somma(v, f.r);
      somma(v.perScenario[f.s] ||= vuoto(), f.r);
      somma(v.perAvversario[f.a] ||= vuoto(), f.r);
      v.celle[`${f.a}|${f.s}`] = somma(vuoto(), f.r);
      for (const [k, q] of Object.entries(f.r.fuori)) if (k.startsWith("x|")) v.fuori[k.slice(2)] = (v.fuori[k.slice(2)] || 0) + q;
    }
    v.per = v.perAvversario;
    migliori.push({ geni: s.geni, descrizione: S.descrivi(s.geni), punti: S.totale(s.geni),
                    ricerca: { w: s.w, l: s.l, d: s.d, n: s.n }, verifica: v });
  }
  migliori.sort((a, b) => punteggio(b.verifica) - punteggio(a.verifica));
  for (const m of migliori) delete m.verifica.per;
  migliori.forEach((m, i) => { m.lista = S.costruisci(m.geni, { id: `${idBase}-${i + 1}`, name: `${etichetta || S.fz.sigla} · ${i + 1}` }); });

  /* ogni unità, in quante liste provate e come sono andate quelle liste */
  const per = new Map(S.voci.map(v => [v.k, { k: v.k, nome: v.nome, liste: 0, partite: 0, somma: 0 }]));
  for (const s of visti.values()){
    if (!s.n) continue;
    for (const k of new Set(s.geni.map(g => g.k))){
      const t = per.get(k); if (!t) continue;
      t.liste++; t.partite += s.n; t.somma += (s.w + s.d / 2) / s.n;
    }
  }
  const provate = [...per.values()].map(({ somma: x, ...t }) => ({ ...t, media: t.liste ? Math.round(100 * x / t.liste) : null,
    finaliste: migliori.filter(m => m.geni.some(g => g.k === t.k)).length }))
    .sort((a, b) => (b.media ?? -1) - (a.media ?? -1));

  return { migliori, storia, partite, provate, secondi: Math.round((Date.now() - t0) / 1000), fermata: fermato(),
           contro: contro.map(a => ({ id: a.lista.id, name: a.lista.name, catalogue: (a.lista.info || {}).catalogue, points: a.lista.points, fonte: a.fonte, file: a.file })) };
}

/* ============================================================
   2 · LA COPPIA ALLA PARI
   `SA`, `SB`: gli spazi delle due fazioni (o della stessa, con due
   temi). Una coppia è { a: geni, b: geni }. Ogni generazione ogni
   coppia gioca le stesse celle — uno scenario e un seme — e il
   punteggio è l'equilibrio scenario per scenario, con i pareggi che
   pesano: una partita pari per sei turni di stallo non è una bella
   serata. Con `varieta` le coppie con più unità diverse salgono un poco.
   ============================================================ */
export async function cercaCoppia({ SA, SB, scenari, P, seme = 3001, gioca, varieta = 0,
                                    log = () => {}, avanza = () => {}, fermato = () => false, etichette = ["A", "B"] }){
  const rnd = generatore(seme);
  const scegli = a => a[Math.floor(rnd() * a.length)];
  const t0 = Date.now();
  const stima = stimaCoppia(P, scenari.length);
  let partite = 0;
  const chiave = c => SA.chiave(c.a) + "#" + SB.chiave(c.b);
  const diverse = c => new Set([...c.a.map(g => "a" + g.k), ...c.b.map(g => "b" + g.k)]).size;
  const maxDiverse = Math.max(1, SA.voci.length + SB.voci.length);
  const punteggio = s => OBIETTIVI.equilibrata.punteggio(s) + varieta * 0.15 * (s.diverse || 0) / maxDiverse;

  async function giocaCoppia(c, celle, quanti, semeDa){
    const x = SA.costruisci(c.a, { id: "cand-a-" + SA.fazione, name: etichette[0] });
    const y = SB.costruisci(c.b, { id: "cand-b-" + SB.fazione, name: etichette[1] });
    const fatti = await Promise.all(celle.map(({ s, seme: sm }) =>
      giocaSpezzata(gioca, { x, y, scenario: s, partite: quanti, seme: semeDa ?? sm }).then(r => ({ s, r }))));
    partite += fatti.reduce((t, f) => t + f.r.n, 0);
    avanza(partite, stima);
    return fatti;
  }
  const estrai = (k, semeGen) => Array.from({ length: Math.min(k, scenari.length * 2) }, (_, i) => ({ s: scenari[i % scenari.length], seme: semeGen + Math.floor(i / scenari.length) * 97 }))
    .sort(() => rnd() - 0.5);

  const visti = new Map();
  const pop = [];
  const entra = c => { if (!c || !c.a || !c.b) return false; const k = chiave(c); if (pop.some(p => chiave(p) === k)) return false; pop.push(c); return true; };
  for (let t = 0, buchi = 0; pop.length < P.popolazione && t < 200 && buchi < 5; t++){
    const a = SA.casuale(rnd), b = a && SB.casuale(rnd);
    buchi = a && b ? 0 : buchi + 1;
    entra({ a, b });
    if (t % 4 === 3) await lascia();
  }
  log(`prima generazione: ${pop.length} coppie`);
  if (!pop.length) return { vuota: true, motivo: "non riesco a scrivere una coppia di liste valide con queste unità", partite };

  const storia = [];
  const E = Math.max(2, Math.ceil(P.popolazione / 3));
  for (let gen = 0; gen < P.generazioni && !fermato(); gen++){
    const celle = estrai(P.celle, seme + gen * 13);
    await Promise.all(pop.map(async c => {
      const k = chiave(c);
      const s = visti.get(k) || { c, ...vuoto(), per: {}, diverse: diverse(c) };
      for (const f of await giocaCoppia(c, celle, 1)){ somma(s, f.r); somma(s.per[f.s] ||= vuoto(), f.r); }
      visti.set(k, s);
    }));
    const classifica = pop.map(c => visti.get(chiave(c))).sort((a, b) => punteggio(b) - punteggio(a));
    const top = classifica[0];
    storia.push({ gen: gen + 1, partite, migliore: Math.round(100 * punteggio(top)) });
    log(`gen ${gen + 1}/${P.generazioni} · ${partite} partite · ${Math.round((Date.now() - t0) / 1000)}s · in testa: ${pc(top.w, top.n)}–${pc(top.l, top.n)}, pari ${pc(top.d, top.n)}% su ${top.n}`);
    if (gen === P.generazioni - 1) break;
    await lascia();

    const elite = classifica.slice(0, E).map(s => s.c);
    pop.length = 0;
    for (const c of elite) pop.push(c);
    const torneo = () => { const a = scegli(elite), b = scegli(elite); return punteggio(visti.get(chiave(a))) >= punteggio(visti.get(chiave(b))) ? a : b; };
    for (let t = 0; pop.length < P.popolazione - 1 && t < 300; t++){
      const p = torneo(), r = rnd();
      /* chi vince troppo si cambia più spesso: la figlia tocca la lista
         favorita due volte su tre */
      const sp = visti.get(chiave(p)), favA = sp && sp.w >= sp.l;
      const figlia = r < 0.2 ? { a: p.a, b: scegli(elite).b }
        : (r < 0.2 + 0.8 * (favA ? 2 / 3 : 1 / 3)) ? { a: SA.muta(p.a, rnd), b: p.b } : { a: p.a, b: SB.muta(p.b, rnd) };
      if (figlia.a && figlia.b && !visti.has(chiave(figlia))) entra(figlia);
      if (t % 8 === 7) await lascia();
    }
    for (let t = 0, buchi = 0; pop.length < P.popolazione && t < 50 && buchi < 3; t++){ const c = { a: SA.casuale(rnd), b: SB.casuale(rnd) }; buchi = c.a && c.b ? 0 : buchi + 1; if (c.a && c.b && !visti.has(chiave(c))) entra(c); }
  }

  const finaliste = [...visti.values()].filter(s => s.n > 0).sort((a, b) => punteggio(b) - punteggio(a)).slice(0, P.finaliste);
  log(`verifica di ${finaliste.length} coppie su ${P.verifica} semi nuovi per scenario…`);
  const coppie = [];
  for (const [i, s] of finaliste.entries()){
    if (fermato() && coppie.length) break;
    const v = { ...vuoto(), per: {}, fuori: {} };
    const celle = scenari.map(sc => ({ s: sc }));
    for (const f of await giocaCoppia(s.c, celle, P.verifica, 5001)){
      somma(v, f.r); v.per[f.s] = aggiungi(v.per[f.s] || vuoto(), { w: f.r.vince.x, l: f.r.vince.y, d: f.r.pari, n: f.r.n });
      for (const [k, q] of Object.entries(f.r.fuori)) v.fuori[k] = (v.fuori[k] || 0) + q;
    }
    v.diverse = s.diverse;
    coppie.push({ i, a: s.c.a, b: s.c.b, verifica: v, ricerca: { w: s.w, l: s.l, d: s.d, n: s.n } });
  }
  coppie.sort((x, y) => punteggio(y.verifica) - punteggio(x.verifica));
  coppie.forEach((c, i) => {
    c.descrizioneA = SA.descrivi(c.a); c.descrizioneB = SB.descrivi(c.b);
    c.puntiA = SA.totale(c.a); c.puntiB = SB.totale(c.b);
    c.listaA = SA.costruisci(c.a, { id: `r-coppia-${seme}-${i + 1}a`, name: `${etichette[0]} · coppia ${i + 1}` });
    c.listaB = SB.costruisci(c.b, { id: `r-coppia-${seme}-${i + 1}b`, name: `${etichette[1]} · coppia ${i + 1}` });
    /* lo scenario su cui vengono più alla pari */
    const per = Object.entries(c.verifica.per).filter(([, t]) => t.n);
    per.sort(([, p], [, q]) => (Math.abs(quota(p) - 0.5) + 0.1 * p.d / p.n) - (Math.abs(quota(q) - 0.5) + 0.1 * q.d / q.n));
    c.scenarioConsigliato = per.length ? per[0][0] : null;
    delete c.i;
  });
  return { coppie, storia, partite, secondi: Math.round((Date.now() - t0) / 1000), fermata: fermato() };
}

/* ============================================================
   3 · LO SCENARIO PER UNA SFIDA
   `genera(i)` dà la scheda dell'i-esimo tavolo (terreno-casuale.js:
   `scenarioCasuale`). Si generano `quanti` tavoli, si giocano tutti con
   `semi` semi a specchio, e i migliori si rigiocano su semi nuovi. Le
   schede tornano intere: chi chiama le può salvare fra i propri scenari.
   ============================================================ */
export async function cercaScenario({ x, y, genera, quanti = 12, semi = 2, verifica = 3, finalisti = 3, seme = 4001, gioca,
                                      extra = [], log = () => {}, avanza = () => {}, fermato = () => false }){
  const t0 = Date.now();
  const stima = 2 * (quanti + extra.length) * semi + 2 * finalisti * verifica;
  let partite = 0;
  const tavoli = [...extra.map(d => ({ id: d.id, def: d })), ...Array.from({ length: quanti }, (_, i) => {
    const def = genera(i);
    return { id: def.id, def };
  })];
  const giocaSu = async (t, semeDa, n) => {
    const r = await giocaSpezzata(gioca, { x, y, scenario: t.id, def: t.def, partite: n, seme: semeDa });
    partite += r.n; avanza(partite, stima);
    return r;
  };
  const voto = s => Math.abs(quota(s) - 0.5) + 0.1 * s.d / (s.n || 1);
  const conti = await Promise.all(tavoli.map(async t => {
    if (fermato()) return null;
    const s = somma(vuoto(), await giocaSu(t, seme, semi));
    log(`${t.def.label}: ${x.name} ${pc(s.w, s.n)}%, ${y.name} ${pc(s.l, s.n)}%, pari ${pc(s.d, s.n)}%`);
    return { ...t, ricerca: s };
  }));
  const giocati = conti.filter(Boolean).sort((a, b) => voto(a.ricerca) - voto(b.ricerca));
  log(`verifica dei ${Math.min(finalisti, giocati.length)} tavoli più equilibrati su ${verifica} semi nuovi…`);
  const scelti = [];
  for (const t of giocati.slice(0, finalisti)){
    if (fermato() && scelti.length) break;
    scelti.push({ ...t, verifica: somma(vuoto(), await giocaSu(t, 6001, verifica)) });
  }
  scelti.sort((a, b) => voto(a.verifica) - voto(b.verifica));
  return { tavoli: scelti, altri: giocati.slice(finalisti).map(t => ({ id: t.id, def: t.def, ricerca: t.ricerca })),
           partite, secondi: Math.round((Date.now() - t0) / 1000), fermata: fermato() };
}

/* ============================================================
   4 · IL TORNEO
   Tutte contro tutte, su ogni scenario: la tabella del Laboratorio.
   `liste`: [{ id, name, lista, fazione, pool, fonte }]. Due liste della
   stessa fazione fatte con la collezione si giocano lo stesso — la
   tabella le mostra, e la pagina dice che non si schierano insieme.
   ============================================================ */
export async function torneo({ liste, scenari, semi = 2, seme = 7001, gioca, avanza = () => {}, fermato = () => false }){
  const coppie = [];
  for (let i = 0; i < liste.length; i++) for (let j = i + 1; j < liste.length; j++) for (const s of scenari) coppie.push([liste[i], liste[j], s]);
  const totale = coppie.length * semi * 2;
  const celle = {};
  let fatte = 0;
  await Promise.all(coppie.map(async ([a, b, s]) => {
    if (fermato()) return;
    const r = await giocaSpezzata(gioca, { x: a.lista, y: b.lista, scenario: s, partite: semi, seme });
    celle[`${s}|${a.id}|${b.id}`] = { w: r.vince.x, l: r.vince.y, d: r.pari, n: r.n };
    fatte += r.n; avanza(fatte, totale);
  }));
  return { celle, partite: fatte, fermata: fermato() };
}
