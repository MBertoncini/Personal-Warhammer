/* Schieramento Old World — come finisce una partita, e chi l'ha vinta
 *
 * La Tappa 7 del piano. Il report aveva gia' un punteggio, ma era un
 * punteggio del Warhammer di prima: «unita' ridotte a meta'», «quarti
 * di tavolo», e una scala di vittoria proporzionale ai punti giocati
 * che nessun libro stampa. Qui c'e' quello che i libri stampano davvero:
 *
 *   I PUNTI VITTORIA (Core Rulebook p. 286) — un'unita' distrutta o
 *   fuggita dal tavolo vale i suoi punti; una in fuga a fine partita la
 *   meta', arrotondata per eccesso; una ridotta sotto un quarto della
 *   sua Forza d'Unita' iniziale un quarto. Poi il generale, il
 *   portastendardo da battaglia, gli stendardi presi come trofeo;
 *
 *   IL VERDETTO (p. 286) — si vince con almeno 100 punti di scarto, si
 *   stravince con il doppio dei punti, e tutto il resto e' pareggio;
 *
 *   LA DURATA (pp. 286-299) — sei round, oppure un D6 dalla fine del
 *   quinto, oppure fino al punto di rottura;
 *
 *   BATTLE MARCH (pp. 24-27 e 41) — cinque round, generale e stendardi
 *   a meta' prezzo, dieci punti per ogni tesoro e venticinque per il
 *   landmark controllati a fine di ogni turno, e vince chi ne ha di
 *   piu'.
 *
 * Le regole di casa sono quelle di `charge.js` e `psych.js`: niente DOM,
 * niente stato, nessun dado tirato. Entrano punti, stati e facce gia'
 * uscite; escono numeri con la pagina da cui vengono.
 */

/* ============================================================
   0 · LE PAGINE
   ============================================================ */
export const PAGE = {
  vp: 286,          // punti vittoria, verdetto, durata di sei round
  pitched: 287,     // la tabella delle sei battaglie campali
  special: 272,     // le caratteristiche speciali e il loro controllo
  trophies: 200,    // gli stendardi presi come trofeo
  random: 289,      // la durata casuale
  breakpoint: 291,  // il punto di rottura
  bmObjectives: 24, // Battle March: tesori e landmark (il libro a parte)
  bmControl: 25,    // Battle March: il controllo e le proprieta' del landmark
  bmDeploy: 26,     // Battle March: le sei mappe
  bmVictory: 27,    // Battle March: durata e punti vittoria
  bmChaos: 41,      // Battle March: il Caso della Guerra
};

/* ============================================================
   1 · I DUE FORMATI
   Battle March non cambia il modo di contare le unita' — rimanda a
   p. 286 — ma dimezza i bonus, aggiunge gli obiettivi e accorcia la
   partita. E dice «vince chi ha piu' punti», senza lo scarto di cento:
   con eserciti da seicento punti cento punti sono un sesto della
   partita, e il libro lo sa.
   ============================================================ */
export const FORMATS = {
  core: { id:"core", label:"Core Rulebook", rounds:6, margin:100,
          general:100, bsb:50, banner:50, treasure:0, landmark:0,
          page: PAGE.vp },
  bm:   { id:"bm", label:"Battle March", rounds:5, margin:0,
          general:50, bsb:25, banner:25, treasure:10, landmark:25,
          page: PAGE.bmVictory, book:"Battle March" },
};

export const formatFor = scenario =>
  scenario && scenario.group === "Battle March" ? "bm" : "core";

/* Il formato di un report: quello scelto a mano, o quello dello
   scenario. Un report vecchio non ha il campo e prende lo scenario. */
export function formatOf(rep){
  const m = (rep && rep.meta) || {};
  if (FORMATS[m.format]) return m.format;
  return formatFor(rep && rep.scenario);
}

/* I bonus del formato, con l'unico esito del Caso della Guerra che li
   tocca: i Tesori dell'Entroterra fanno valere 20 un tesoro e 50 un
   landmark (p. 41). */
export function bonuses(format = "core", chaos = []){
  const f = FORMATS[format] || FORMATS.core;
  const rich = f.id === "bm" && (chaos || []).includes("tesori");
  return {
    general: f.general, bsb: f.bsb, banner: f.banner,
    treasure: rich ? 20 : f.treasure,
    landmark: rich ? 50 : f.landmark,
  };
}

/* ============================================================
   2 · MORTI O FUGGITI (p. 286)
   Tre soglie, e una sola vale per unita': la piu' alta. `share` e'
   quanto resta della Forza d'Unita' iniziale, da 0 a 1.
   ============================================================ */
export const UNDER = 0.25;

export function unitVP({ pts = 0, dead = false, fledOff = false, fleeing = false, share = 1 } = {}){
  const p = Math.max(0, Math.round(+pts || 0));
  if (dead || fledOff)
    return { vp: p, pct: 100, rule: "dead", why: dead ? "distrutta" : "fuggita dal tavolo" };
  if (fleeing)
    return { vp: Math.ceil(p / 2), pct: 50, rule: "fleeing", why: "in fuga a fine partita" };
  if (share < UNDER)
    return { vp: Math.ceil(p / 4), pct: 25, rule: "under25", why: "sotto un quarto della Forza d'Unità" };
  return { vp: 0, pct: 0, rule: "", why: "" };
}

/* Quanto resta della Forza d'Unita'. Per un reggimento sono i modelli;
   per un modello solo con piu' Ferite — un mostro, un personaggio —
   sono le Ferite, perche' la sua Forza d'Unita' e' fatta di quelle
   (p. 105). E' una lettura: la Forza d'Unita' esatta di un reggimento
   con dentro modelli diversi la sa solo chi li conta. */
export function strengthShare({ models = 0, alive = 0, woundsPer = 1, woundsLost = 0 } = {}){
  const n = +models || 0;
  const W = Math.max(1, +woundsPer || 1);
  if (n <= 1 && W > 1) return Math.max(0, W - (+woundsLost || 0)) / W;
  return n ? Math.max(0, +alive || 0) / n : 1;
}

/* ============================================================
   3 · IL VERDETTO (p. 286; Battle March p. 27)
   ============================================================ */
export function victory(A = 0, B = 0, format = "core"){
  const f = FORMATS[format] || FORMATS.core;
  const a = +A || 0, b = +B || 0;
  const top = Math.max(a, b), low = Math.min(a, b);
  const diff = top - low;
  const lead = a === b ? null : a > b ? "A" : "B";
  if (!lead)
    return { winner:null, level:"draw", label:"pareggio", diff, page:f.page, why:"punti pari" };
  if (diff < f.margin)
    return { winner:null, level:"draw", label:"pareggio", diff, page:f.page,
             why:`${diff} punti di scarto, ne servono ${f.margin}` };
  const crushing = top >= 2 * low;
  return {
    winner: lead, level: crushing ? "crushing" : "win",
    label: crushing ? "vittoria schiacciante" : "vittoria",
    diff, page: f.page,
    why: crushing ? "il doppio dei punti dell'avversario"
       : f.margin ? `almeno ${f.margin} punti di scarto` : "più punti dell'avversario",
  };
}

/* ============================================================
   4 · QUANTO DURA (pp. 286, 289, 291; Battle March pp. 27 e 41)
   ============================================================ */
export const LENGTHS = {
  fixed:      { id:"fixed",      label:"Sei round",                         rounds:6, page: PAGE.vp },
  random:     { id:"random",     label:"Casuale: dal quinto round, D6 + round", from:5, need:10, page: PAGE.random },
  breakpoint: { id:"breakpoint", label:"Fino al punto di rottura",          page: PAGE.breakpoint },
  bm:         { id:"bm",         label:"Cinque round (Battle March)",       rounds:5, page: PAGE.bmVictory },
};
export const LENGTH_IDS = Object.keys(LENGTHS);
export const defaultLength = format => format === "bm" ? "bm" : "fixed";

/* Il Conflitto Prolungato del Caso della Guerra porta Battle March a
   sei round (p. 41). */
export function roundsFor(length = "fixed", chaos = []){
  const L = LENGTHS[length] || LENGTHS.fixed;
  if (L.id === "bm" && (chaos || []).includes("seiRound")) return 6;
  return L.rounds || 0;
}

/* Alla fine di un round: si continua, si finisce, o si tira. Senza il
   dado torna quello che serve tirare; con il dado torna com'e' andata. */
export function endOfRound({ length = "fixed", round = 1, die = 0, chaos = [] } = {}){
  const L = LENGTHS[length] || LENGTHS.fixed;
  const r = +round || 0;
  if (L.id === "breakpoint")
    return { ends:false, roll:false, page:L.page,
             why:"nessun limite di round: all'inizio di ogni turno si guarda il punto di rottura" };
  if (L.id === "random"){
    if (r < L.from)
      return { ends:false, roll:false, page:L.page, why:`round ${r}: si tira dalla fine del round ${L.from}` };
    const need = Math.max(1, L.need - r);
    if (!die)
      return { ends:false, roll:true, need, page:L.page,
               why:`D6 + ${r}: con ${need} o più la battaglia finisce` };
    const total = +die + r;
    return { ends: total >= L.need, roll:true, need, die:+die, total, page:L.page,
             why:`${die} + ${r} = ${total}: ` + (total >= L.need ? "la battaglia finisce" : "si gioca un altro round") };
  }
  const rounds = roundsFor(L.id, chaos);
  const page = L.id === "bm" && rounds === 6 ? PAGE.bmChaos : L.page;
  return { ends: r >= rounds, roll:false, rounds, page,
           why: r >= rounds ? `era l'ultimo dei ${rounds} round` : `round ${r} di ${rounds}` };
}

/* Il punto di rottura (p. 291): un quarto della Forza d'Unita' di tutto
   l'esercito a inizio partita, personaggi compresi, per difetto. Chi
   all'inizio di un turno e' sceso SOTTO si e' rotto, e la partita
   finisce. */
export const breakPoint = usStart => Math.floor(Math.max(0, +usStart || 0) / 4);

export function broken(usNow = 0, usStart = 0){
  const bp = breakPoint(usStart);
  return { broken: (+usNow || 0) < bp, bp, usNow: +usNow || 0, usStart: +usStart || 0, page: PAGE.breakpoint };
}

/* ============================================================
   5 · GLI OBIETTIVI A FINE TURNO (Battle March pp. 25 e 27)
   Chi tiene un tesoro o il landmark alla fine di OGNI turno di
   giocatore incassa il bonus, quindi il conto e' una somma sulle
   fotografie di fine turno. Ogni fotografia porta `objectives`:
   [{ kind:"treasure"|"landmark", army:"A"|"B"|null }], misurati dal
   tavolo con `objectiveHolder` di `battlemarch.js`.
   ============================================================ */
export function objectivePoints(turns = [], format = "core", chaos = []){
  const b = bonuses(format, chaos);
  const out = { A:0, B:0, rows:[] };
  for (const t of turns || []){
    if (!t || t.kind !== "turn" || !Array.isArray(t.objectives)) continue;
    for (const o of t.objectives){
      const v = o.kind === "landmark" ? b.landmark : b.treasure;
      if (!v || (o.army !== "A" && o.army !== "B")) continue;
      out[o.army] += v;
      out.rows.push({ n: t.n, turnOf: t.army, kind: o.kind, army: o.army, vp: v });
    }
  }
  return out;
}

/* ============================================================
   6 · LE TABELLE A D6
   ============================================================ */
/* Le sei battaglie campali (p. 287). `scenario` e' lo scenario
   dell'app che le somiglia, quando c'e'; `lengths` le durate che il
   libro concede. */
export const PITCHED = [
  { face:1, id:"open",       name:"The Plain of L'Anguille", kind:"Battaglia Campale", page:288,
    scenario:"open", lengths:["fixed", "random"], firstBonus:true,
    rules:"nessuna regola speciale" },
  { face:2, id:"breakpoint", name:"The Doom of Odo Todmeyer III", kind:"Punto di Rottura", page:290,
    scenario:"", lengths:["breakpoint"], firstBonus:true,
    rules:"la partita finisce quando un esercito scende sotto un quarto della sua Forza d'Unità: l'altro stravince" },
  { face:3, id:"flank",      name:"The Battle of Pine Crags", kind:"Attacco sul Fianco", page:292,
    scenario:"flank", lengths:["fixed"], firstBonus:false,
    rules:"una forza di fianco fino al 33% dei punti, senza il Generale, schierata dopo sul fianco scelto in segreto" },
  { face:4, id:"meeting",    name:"The Drakwald Forest Incident", kind:"Scontro d'Incontro", page:294,
    scenario:"meeting", lengths:["fixed"], firstBonus:true,
    rules:"un D6 per unità prima di schierare: con 1 resta in riserva ed entra dal secondo turno dal bordo lungo della propria zona" },
  { face:5, id:"pass",       name:"The Battle of Gisoreux Gap", kind:"Passo di Montagna", page:296,
    scenario:"pass", lengths:["random"], firstBonus:true,
    rules:"i bordi lunghi sono impassabili, anche per chi fugge o arriva dalla riserva, salvo Ethereal e Fly" },
  { face:6, id:"command",    name:"The Lonely Tower", kind:"Comando e Controllo", page:298,
    scenario:"", lengths:["fixed", "random"], firstBonus:true,
    rules:"una caratteristica speciale al centro: chi la controlla a fine battaglia prende 200 punti vittoria" },
];
export const pitchedFor = face => PITCHED[Math.max(1, Math.min(6, face | 0)) - 1];
export const pitchedOfScenario = id => PITCHED.find(p => p.scenario && p.scenario === id) || null;

/* Battle March: gli obiettivi (p. 24), le proprieta' del landmark
   (p. 25), le sei mappe (p. 26). */
export const BM_OBJECTIVES = [
  { faces:[1, 2], id:"two",      label:"Due tesori",     what:"sulla linea del centro, 7,5″ sopra e 7,5″ sotto il centro del tavolo" },
  { faces:[3, 4], id:"three",    label:"Tre tesori",     what:"uno al centro e due a 11″ a destra e a sinistra" },
  { faces:[5, 6], id:"landmark", label:"Un landmark",    what:"basetta da 100 mm al centro: impassabile e blocca la vista" },
];
export const LANDMARK_PROPS = [
  { faces:[1, 2], id:"magic",    label:"Magia nell'aria", what:"chi lo controlla ha Magic Resistance (-2)" },
  { faces:[3, 4], id:"zeal",     label:"Zelo ardente",    what:"chi lo controlla ha Frenzy" },
  { faces:[5, 6], id:"stay",     label:"Non ce ne andiamo", what:"chi lo controlla ha Stubborn" },
];
export const BM_DEPLOY = [
  { face:1, id:"pitched",  label:"Pitched Battle",     what:"lungo i bordi lunghi, a 7,5″ dalla linea del centro" },
  { face:2, id:"close",    label:"Close Encounter",    what:"due quarti opposti, fuori da un cerchio di 15″ al centro" },
  { face:3, id:"opposed",  label:"Opposed Flanks",     what:"due cunei lungo i bordi lunghi, profondi 18″ da un lato e niente dall'altro" },
  { face:4, id:"meeting",  label:"Meeting Engagement", what:"a 7,5″ dal centro, e ognuno lascia libere 11″ da un lato" },
  { face:5, id:"pass",     label:"Mountain Pass",      what:"lungo i bordi corti, a 11″ dal centro" },
  { face:6, id:"outflank", label:"Outflank",           what:"due triangoli in angoli opposti, con 22″ di base" },
];
export const byFace = (table, face) =>
  table.find(r => (r.faces || [r.face]).includes(Math.max(1, Math.min(6, face | 0)))) || null;
