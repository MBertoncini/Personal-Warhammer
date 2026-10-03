/* Schieramento Old World — una partita dell'arbitro, nel diario
 *
 * Due strade per far diventare voce del diario (`battle-report/1`, la
 * forma che la scheda Partite legge da sempre) una partita che ha
 * tenuto l'arbitro:
 *
 *   `registro` — mentre si gioca. Si chiama dopo ogni passo e fotografa
 *   il tavolo quando lo schieramento finisce e quando un mezzo turno
 *   passa la mano. E' quello che fanno `tools/partita.mjs --archivia` e
 *   la sfida sul tavolo (`controai.js`).
 *
 *   `dalRegistro` — dopo, quando della partita resta solo il testo di
 *   «Copia il registro». Le fotografie sono quelle della compilazione a
 *   mano (`BL.blankTurn`), cioe' senza posizioni: quello che dal
 *   registro si legge davvero — chi ha perso quanti modelli in che mezzo
 *   turno, chi e' caduto, chi e' scappato — si ricostruisce, e il
 *   punteggio lo rifa' `battlelog.js` da solo. Le posizioni NON si
 *   indovinano: un tavolo inventato e' peggio di un tavolo assente.
 *
 * Il report non si costruisce a mano: lo costruisce `battlelog.js`, lo
 * stesso codice che archivia una partita giocata sul tavolo. Quello che
 * serve e' uno «stato del tavolo» come lo tiene la pagina, e la
 * differenza con lo stato dell'arbitro e' piccola: il terreno ha la
 * posizione in millimetri e la misura in pollici, il tavolo ha la sua
 * larghezza e il suo corridoio, e il registro ha le sue righe.
 *
 * Qui non c'e' disco: i due strumenti (`tools/archivia.mjs`,
 * `tools/archivia-registro.mjs`) aggiungono il file, l'app l'archivio.
 */

import { MM } from './util.js';
import * as BL from './battlelog.js';
import * as VC from './victory.js';
import { TERRAIN } from './terrain.js';

/* lo stato del tavolo come lo tiene la pagina, preso dall'arbitro */
export function statoDi(S, { liste, gioco }){
  const sc = S.sc || {};
  const idx = { A: 0, B: 0 };
  return {
    scenario: S.scenario,
    tableW: S.table.w, tableH: S.table.h, gap: (sc.gap || 6) * MM,
    armies: {
      A: { name: liste.A.name, info: liste.A.info || null },
      B: { name: liste.B.name, info: liste.B.info || null },
    },
    /* copie: `battlelog.js` completa la formazione sull'unita' che
       riceve, e l'arbitro non deve accorgersene */
    units: S.units.map(u => ({ ...u, idx: ++idx[u.army] })),
    terrain: (sc.terrain || []).map((t, i) => ({
      tid: i + 1, kind: t.kind,
      x: t.x * MM, y: t.y * MM,
      w: t.w ?? (TERRAIN[t.kind] || {}).w, h: t.h ?? (TERRAIN[t.kind] || {}).h,
      rot: t.rot || 0,
    })),
    markers: [], zones: [],
    game: gioco,
  };
}

/* Il registro della partita: si chiama dopo ogni passo, e fotografa il
   tavolo quando lo schieramento finisce e quando un mezzo turno passa
   la mano.

   `chiudi` non tocca niente: torna il report di adesso, e la partita
   puo' continuare e chiudersi di nuovo. La sfida sul tavolo lo chiede
   ogni volta che premi «Salva nel diario», anche a meta' partita. */
export function registro(S, { liste, meta = {}, notes = "" }){
  const gioco = { meta: BL.ensureMeta(meta), turns: [], score: null, notes, log: [], counters: {} };
  let prima = { schierando: S.schierando, turno: S.turno, army: S.army };
  let eventi = [];
  let chiuso = false;
  const scatta = (g, n, army, ev) =>
    g.turns.push(BL.turnRecord(statoDi(S, { liste, gioco: g }), { n, army, events: ev }));
  return {
    gioco,
    /* `righe` sono quelle del registro dell'arbitro uscite in questo
       passo; `perche` e' la frase di chi ha scelto, se c'e' */
    passo({ chi = "", perche = "", righe = [] }){
      if (perche) eventi.push(`${chi}: ${perche}`);
      for (const r of righe){
        eventi.push(r.text + (r.page ? ` (p. ${r.page})` : ""));
        gioco.log.unshift({ t: r.turno, army: r.army, phase: r.casella || "", step: r.casella || "",
                            type: r.kind || "note", text: r.text, at: Date.now() });
      }
      if (prima.schierando && !S.schierando){
        gioco.turns.push(BL.deployRecord(statoDi(S, { liste, gioco })));
        gioco.turns[0].events = eventi;
        eventi = [];
      } else if (!prima.schierando && !chiuso &&
                 (S.finita || S.turno !== prima.turno || S.army !== prima.army)){
        /* la partita che finisce sul passaggio di mano ha gia' il turno
           dopo scritto nello stato: la fotografia e' di quello che si
           e' appena chiuso */
        scatta(gioco, prima.turno, prima.army, eventi);
        eventi = [];
        chiuso = S.finita;
      }
      if (!chiuso) prima = { schierando: S.schierando, turno: S.turno, army: S.army };
    },
    /* la fotografia dell'ultimo mezzo turno, e il report */
    chiudi({ title = "", id = "" } = {}){
      const g = { ...gioco, turns: gioco.turns.map(t => ({ ...t, events: (t.events || []).slice() })),
                  log: gioco.log.slice(0, 300) };
      const ultimo = g.turns[g.turns.length - 1];
      if (chiuso){
        if (eventi.length && ultimo) ultimo.events.push(...eventi);
      } else if (!prima.schierando &&
                 (eventi.length || !ultimo || ultimo.n !== prima.turno || ultimo.army !== prima.army))
        scatta(g, prima.turno, prima.army, eventi.slice());
      return BL.buildReport(statoDi(S, { liste, gioco: g }), S.sc, { title, id });
    },
  };
}

/* ============================================================
   DAL TESTO DEL REGISTRO
   Ogni riga e' «T<numero> <testo> (p. <pagina>)», come la scrive «Copia
   il registro» della sfida. Il numero e' il round; chi lo sta giocando
   lo dicono le righe di passaggio di mano.

   `S` e' una partita nuova dell'arbitro con le stesse due liste e gli
   stessi nomi: serve a sapere chi c'e', non dove sta. Torna il report,
   e `guasti`: le righe che non tornano con le liste. Con dei guasti il
   report non va archiviato — vuol dire che le liste sono sbagliate, e
   una partita archiviata contro le liste sbagliate e' una partita finta.
   ============================================================ */
const INIZIO = /^Schieramento finito: comincia il turno (\d+), muove (.+)$/;
const TURNO  = /^Turno (\d+): muove (.+)$/;
/* le righe che tolgono modelli dal tavolo: il tiro (p. 136), l'assalto
   (p. 144) e i colpi di un incantesimo */
const PERSE = [
  { re: /^(.*?) tira su (.+?) con .+? da [\d.]+″: .*?(\d+) a terra(?: \[.*?\])?$/, chi: 2, quanti: 3 },
  { re: /^(.*?) colpi su (.+?): .*?(\d+) a terra$/,                                   chi: 2, quanti: 3 },
  { re: /^(.*?) pestoni su (.+?): .*?(\d+) a terra$/,                                 chi: 2, quanti: 3 },
  { re: /^(.*?): \d+ colp\S+ a Forza .*?(\d+) a terra$/,                             chi: 1, quanti: 2 },
  /* il terreno pericoloso: «X attraversa Palude: 16 dadi a 2+, 2 ferite, 2 a terra» */
  { re: /^(.+?) attraversa .+?: .*?(\d+) a terra(?:,.*)?$/,                          chi: 1, quanti: 2 },
];
/* e quelle che chiudono un'unita', o la mandano via */
const MORTE = [
  /^(.*?) è travolta e distrutta$/,
  /^(.*?): non resta nessuno in piedi$/,
  /^(.*?) (?:ripiega|fugge) .*oltre il bordo, ed esce dal tavolo$/,
  /^(.*?) esce dal tavolo e non torna$/,
];
const FUGGE  = [/^(.*?) rompe e fugge di/, /^(.*?) va nel panico e fugge/];
const RADUNO = /^(.*?), raduno: /;
/* Chi sta dentro chi (p. 207). Un reggimento TRAVOLTO si porta via i
   capi che ha dentro, e il registro quei capi non li nomina; uno
   abbattuto in combattimento li lascia in piedi, e la riga e' un'altra. */
const UNISCI  = [/^(.*?) si schiera dentro (.+)$/, /^(.*?) percorre [\d.]+″ e si unisce a (.+?)(?:,.*)?$/];
const SEPARA  = /^(.*?) esce da (?:.+?) e resta da solo/;
const TRAVOLTA = /è travolta e distrutta$|oltre il bordo, ed esce dal tavolo$|esce dal tavolo e non torna$/;

export function dalRegistro({ S, liste, nomi, sc, testo, meta = {}, title = "" }){
  const righe = String(testo || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const tagDi = nome => nome === nomi.A ? "A" : nome === nomi.B ? "B" : "";
  const schieramento = [], mezzi = [], guasti = [];
  let corrente = null;

  for (const riga of righe){
    const m = riga.match(/^T(\d+)\s+(.*)$/);
    if (!m){ guasti.push(`riga senza turno: «${riga}»`); continue; }
    /* via le pagine in coda e i punti fermi, a strati: una riga porta la
       pagina della regola dentro la frase e quella del gesto dopo */
    let t = m[2], prima;
    do { prima = t; t = t.replace(/\s*\(pp?\.\s*[\d, –-]+\)\s*$/, "").replace(/\.\s*$/, ""); } while (t !== prima);
    const voce = { n: +m[1], testo: t, intero: riga };
    const inizio = t.match(INIZIO), turno = t.match(TURNO);
    if (inizio || turno){
      const [, n, chi] = inizio || turno;
      const army = tagDi(chi);
      if (!army) guasti.push(`«${chi}» non è nessuno dei due eserciti (${nomi.A}, ${nomi.B})`);
      if (inizio) schieramento.push(voce);
      corrente = { n: +n, army, righe: inizio ? [] : [voce] };
      mezzi.push(corrente);
      continue;
    }
    (corrente ? corrente.righe : schieramento).push(voce);
  }
  if (!mezzi.length) return { rep: null, guasti: [...guasti, "nel registro non c'è nessun turno"] };

  /* il nome si prende per intero, fra quelli che le liste hanno davvero:
     il piu' lungo con cui il pezzo di riga finisce */
  const perNome = [...S.units].sort((a, b) => b.name.length - a.name.length);
  const inCoda = (pezzo, dove) => {
    const t = String(pezzo || "").trim();
    const u = perNome.find(x => t === x.name || t.endsWith(" " + x.name));
    if (!u) guasti.push(`in «${dove}» non riconosco l'unità: «${t}»`);
    return u || null;
  };

  const dentro = new Map();         // uid del capo -> uid del reggimento
  for (const mezzo of [{ righe: schieramento }, ...mezzi]){
    mezzo.perse = new Map(); mezzo.morti = new Set(); mezzo.fughe = new Map();
    for (const r of mezzo.righe){
      for (const re of UNISCI){
        const m = r.testo.match(re);
        if (!m) continue;
        const c = inCoda(m[1], r.testo), h = inCoda(m[2].replace(/ \(p\. \d+\)$/, ""), r.testo);
        if (c && h) dentro.set(c.uid, h.uid);
        break;
      }
      const sep = r.testo.match(SEPARA);
      if (sep){ const c = inCoda(sep[1], r.testo); if (c) dentro.delete(c.uid); }
      for (const p of PERSE){
        const m = r.testo.match(p.re);
        if (!m) continue;
        const u = inCoda(m[p.chi], r.testo);
        const quanti = +m[p.quanti] || 0;
        if (u && quanti) mezzo.perse.set(u.uid, (mezzo.perse.get(u.uid) || 0) + quanti);
        break;
      }
      for (const re of MORTE){
        const m = r.testo.match(re);
        if (!m) continue;
        const u = inCoda(m[1], r.testo);
        if (!u) break;
        mezzo.morti.add(u.uid);
        for (const [capo, host] of [...dentro]){
          if (host !== u.uid) continue;
          if (TRAVOLTA.test(r.testo)) mezzo.morti.add(capo);
          dentro.delete(capo);
        }
        break;
      }
      for (const re of FUGGE){
        const m = r.testo.match(re);
        if (!m) continue;
        const u = inCoda(m[1], r.testo);
        if (u) mezzo.fughe.set(u.uid, true);
        break;
      }
      const rad = r.testo.match(RADUNO);
      if (rad){
        const u = inCoda(rad[1], r.testo);
        if (u) mezzo.fughe.set(u.uid, /continua a fuggire/.test(r.testo));
      }
    }
  }

  const formato = VC.FORMATS[VC.formatFor(sc)] || VC.FORMATS.core;
  const gioco = {
    meta: BL.ensureMeta({ date: BL.today(), first: mezzi[0].army || "A", pts: sc.pts || 0,
                          rounds: formato.rounds || 6, ...meta }),
    turns: [], score: null, notes: "", log: [], counters: {},
  };
  const rep = BL.buildReport(statoDi(S, { liste, gioco }), sc,
                             { title: title || `${sc.label}: ${nomi.A} contro ${nomi.B}` });
  /* lo schieramento senza il tavolo: tutti in campo, nessuna perdita */
  rep.turns = [{
    kind: "deploy", n: 0, army: "", at: Date.now(),
    units: [...rep.roster.A, ...rep.roster.B].map(c => ({
      uid: c.uid, army: c.army, name: c.name, models: c.models,
      alive: c.models, lost: 0, dLost: 0, dead: false, fled: false, placed: true,
      x: 0, y: 0, rot: c.army === "A" ? 0 : 180, moved: 0, zone: "",
    })),
    events: schieramento.map(r => r.intero), note: "",
  }];
  for (const mezzo of mezzi){
    const t = BL.blankTurn(rep, { n: mezzo.n, army: mezzo.army });
    for (const r of t.units){
      r.dLost = mezzo.perse.get(r.uid) || 0;
      if (mezzo.morti.has(r.uid)) r.dead = true;
      if (mezzo.fughe.has(r.uid)) r.fled = mezzo.fughe.get(r.uid);
      /* chi cade in questo mezzo turno perde tutto quello che gli restava */
      if (r.dead) r.dLost = Math.max(r.dLost, (r.models || 0) - (r.lost || 0));
    }
    t.events = mezzo.righe.map(r => r.intero);
    rep.turns.push(t);
  }
  BL.recount(rep);
  BL.applyAuto(rep);
  rep.log = [];
  for (const mezzo of mezzi)
    for (const r of mezzo.righe)
      rep.log.unshift({ t: mezzo.n, army: mezzo.army, phase: "", step: "", type: "note", text: r.intero, at: Date.now() });
  rep.log = rep.log.slice(0, 200);
  /* il verdetto che l'arbitro aveva scritto in coda si riporta com'e':
     se non coincide con quello rifatto dal ruolino si vedono tutti e due */
  const suo = (mezzi[mezzi.length - 1].righe.find(r => /^Partita finita/.test(r.testo)) || {}).testo || "";
  return { rep, guasti: [...new Set(guasti)], mezzi: mezzi.length, righe: righe.length, verdettoArbitro: suo };
}
