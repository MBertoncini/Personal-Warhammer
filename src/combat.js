/* Schieramento Old World — lo scontro simulato
 *
 * Prende due unita' del tavolo, ne ricava due schiere con i numeri che
 * contano, e le fa combattere un assalto: chi colpisce per primo, quanti
 * dadi, quante ferite passano, chi vince e chi deve tenere i nervi.
 *
 * Due modi di guardarlo, e servono tutti e due. **Tira i dadi** fa un
 * assalto solo e mostra ogni dado: e' quello che si vuole quando lo
 * scontro sta per succedere davvero e si e' curiosi. **Simula** ne fa
 * cinquecento e riporta le percentuali: e' quello che si vuole *prima*
 * di caricare, perche' un assalto solo non dice niente e cinquecento
 * dicono se e' una buona idea.
 *
 * Non arbitra: non sa di magia, di oggetti, di regole d'esercito. E'
 * una stima onesta con i dati che il file della lista contiene, e dice
 * da sola quando un pezzo le manca.
 */

import { hitMelee, woundOn, saveOn, pool, roll, chance, expected, rankBonus,
         stat, weaponStrength, weaponAP, IMPOSSIBLE } from './rules.js';
import { readRules, splitWeaponRules, emptyFlags } from './rulebook.js';
import { troopType, usPerModel } from './troops.js';
import * as ML from './melee.js';
import * as SH from './shoot.js';
import * as PS from './psych.js';

/* ============================================================
   1 · DALL'UNITA' DEL TAVOLO ALLA SCHIERA CHE COMBATTE
   ============================================================ */

/* l'arma da mischia e' quella senza gittata; fra piu' d'una si tiene
   quella che perfora di piu', che e' quella che si userebbe */
export function meleeWeapon(u){
  const list = (u.weapons || []).filter(w => !(stat(w.range) > 0));
  if (!list.length) return null;
  return list.reduce((best, w) => weaponAP(w) > weaponAP(best) ? w : best, list[0]);
}
/* fra le armi da tiro la piu' lunga per prima: e' quella che decide da
   dove si comincia a sparare */
export function rangedWeapons(u){
  return (u.weapons || []).filter(w => stat(w.range) > 0)
    .sort((a, b) => stat(b.range) - stat(a.range));
}

/* Quanti colpi automatici porta una regola che li conta fra parentesi.
   Il numero sta scritto nel nome — "Impact Hits (D3)", "(2)",
   "Stomp Attacks (D3+1)" — e prima veniva ignorato: si contava una
   ferita per modello della prima fila, che per un carro e' generoso e
   per un mostro solo e' assurdo. Quando fra parentesi non c'e' niente
   si torna al vecchio ordine di grandezza. */
function autoHits(a, front){
  if (!a) return 0;
  if (a.flat) return a.flat;
  if (a.die) return roll(a.times || 1).reduce((s, d) => s + 1 + Math.floor((d - 1) * a.die / 6), 0)
                    + (a.plus || 0);
  return front;
}

/* I tre pollici che accendono la carica.
   Il testo di *Impact Hits* e di *Furious Charge* — per esteso dentro
   le liste salvate, e mai letto da nessuno — mette la stessa
   condizione: valgono per un modello che ha caricato muovendo **3″ o
   piu'**. L'app le dava a chiunque avesse caricato, anche a chi era
   arrivato a contatto con mezzo pollice.

   Quanti pollici siano lo sa il tavolo dalla Tappa 2, che li scrive
   sull'unita' quando la carica arriva (`u.charged.inches`). */
export const CHARGE_IMPETUS = 3;
const ranIn = c => !!c.charged && (c.chargeInches || 0) >= CHARGE_IMPETUS;

/* Il sei naturale: quello che accende meta' delle regole speciali. Un 6
   passa sempre, quindi contarli fra i dadi usciti basta e non serve
   sapere quale punteggio servisse. */
const sixes = p => (p.dice || []).filter(v => v === 6).length;

/* La Paura fallita in mischia (Tappa 5): −1 al tiro per colpire contro
   chi la fa. La tabella di p. 149 non chiede mai piu' di 5+, quindi con
   il −1 si arriva al 6+ e non oltre; chi colpisce senza tirare continua
   a non tirare. */
const fearful = (need, att) => !att || !att.feared || need <= 0 || need >= IMPOSSIBLE
  ? need : Math.min(6, need + 1);

/* due tiri separati raccontati come uno solo, per il pannello */
function mergePools(a, b){
  if (!b) return a;
  if (!a) return b;
  return { dice: [...(a.dice || []), ...(b.dice || [])],
           hits: a.hits + b.hits, need: a.need, of: a.of + b.of };
}

/* La schiera: quello che serve a tirare, e niente altro. `over` sono le
   correzioni fatte a mano nel pannello, che vincono sempre sul profilo
   perche' chi guarda il tavolo ne sa piu' del file. */
export function combatant(u, over = {}){
  /* chiamata due volte non ricomincia da capo: una schiera gia' fatta
     torna se stessa con le correzioni sopra */
  if (u && u.ref){
    const back = Object.assign({ ...u }, over);
    back.flags = back.flags || emptyFlags();
    return back;
  }
  const st = u.stats || {};
  const melee = meleeWeapon(u);
  const alive = Math.max(0, (u.models || 1) - (u.lost || 0));
  /* Quanti pollici ha percorso caricando e da che faccia e' arrivato:
     la Tappa 2 lo scrive qui quando la carica va a segno, e fino alla
     Tappa 3 non lo leggeva nessuno — il pannello ripeteva a mano la
     domanda «ha caricato?» a cui il tavolo aveva gia' risposto. */
  const ch = u.charged && typeof u.charged === "object" ? u.charged : null;
  const c = {
    ref: u, name: u.name, army: u.army,
    ws: stat(st.WS), bs: stat(st.BS), s: stat(st.S), t: stat(st.T),
    w: Math.max(1, stat(st.W) || 1), i: stat(st.I), a: Math.max(1, stat(st.A) || 1),
    ld: stat(st.Ld),
    models: Math.max(1, alive), frontage: Math.max(1, u.frontage || 1),
    /* la forza d'unita' per modello: quando cadono i modelli deve calare
       anche lei, altrimenti a fine assalto un reggimento dimezzato
       continuerebbe a contare come "siamo di piu'".

       Quando il file la dichiara vince il file, sempre: tiene conto
       della cavalcatura e degli oggetti, la tabella no. Quando non la
       dichiara — succede in tutte le liste Skaven salvate — prima si
       dava per scontato 1 per modello, e un Rat Ogre contava come un
       chiavicaro. Adesso il ripiego e' la tabella dei tipi di truppa
       (p. 105), che per la fanteria mostruosa dice 3. */
    usPer: usPerModel(u.troop, u.us, u.models),
    troop: troopType(u.troop),
    armour: u.armour || 0, ward: u.ward || 0, regen: u.regen || 0,
    ap: melee ? weaponAP(melee) : 0,
    weapon: melee ? melee.name : "",
    loose: !!u.loose, rules: u.rules || [],
    standard: !!(u.command && u.command.standard),
    musician: !!(u.command && u.command.musician),
    /* Quello che la carica si e' lasciata dietro, e che adesso pesa in
       tre punti diversi: l'ordine in cui si mena, il bonus di fianco
       del risultato, e i ranghi che il terreno toglie (pp. 128 e 146). */
    charged: !!ch, chargeInches: ch ? (ch.inches || 0) : 0,
    chargeArc: ch ? (ch.arc || "fronte") : "fronte",
    flank: ch ? ML.arcToFlank(ch.arc) : "",
    disordered: !!u.disordered, disrupted: !!u.disrupted,
    highGround: !!u.highGround, overkill: 0,
    spill: 0,
  };
  /* La Forza dell'arma vale per i colpi che si tirano. Le ferite d'urto
     e i pestoni usano la Forza NON modificata del modello — lo dice il
     testo delle due regole — e per averla bisogna tenersela da parte
     prima che la lancia la alzi di due punti. */
  c.baseS = c.s;
  if (melee) c.s = weaponStrength(melee, c.s);

  /* Le regole: quelle dell'unita' e quelle dell'arma che sta davvero
     impugnando. Le seconde stavano nel file da sempre, lette e mai
     usate — ed e' li' che vive meta' di quello che decide un assalto. */
  const read = readRules(u.rules || [], splitWeaponRules(melee && melee.rules),
                         melee ? melee.name : "", u.ruleText || null);
  c.flags = read.flags;
  c.rulesRead = { applied: read.applied, elsewhere: read.elsewhere, unknown: read.unknown };

  /* le lame di ossidiana valgono sull'arma a una mano, non sull'alabarda */
  if (c.flags.handWeaponAP && melee && /hand weapon|arma a una mano/i.test(melee.name))
    c.ap = Math.max(c.ap, c.flags.handWeaponAP);

  /* La psicologia (Tappa 5), nelle tre cose che un assalto sente.

     Il Comando della Warband sale del bonus di ranghi *attuale* — quello
     vero, che il disordine azzera — fino a 10, salvo che l'unita' stia
     fuggendo. E' il numero con cui si tira il test di rotta, e diciotto
     unita' delle liste salvate lo tiravano con due o tre punti di meno.

     La Frenzy da' un attacco in piu' nel turno in cui carica: si
     ricalcola dopo le correzioni del pannello, perche' «ha caricato» e'
     una casella che si spunta. La Paura fallita toglie uno al tiro per
     colpire, e quella la dice il tavolo con `over.feared`. */
  c.psych = PS.psychOf(u, { joined: over.joined || [] });
  const ranks = c.disrupted ? 0 : rankBonus(c.models, c.frontage, c.troop ? c.troop.maxRank : 3);
  const lead = PS.leadershipOf(c.ld, c.psych, { rankBonus: ranks, fleeing: !!u.fled });
  c.ldBase = c.ld; c.ld = lead.value; c.ldWhy = lead.why;
  c.feared = false;

  const out = Object.assign(c, over);
  if (over.frenzyA == null)
    out.frenzyA = PS.frenzyBonus({ p: out.psych, chargedThisTurn: !!out.charged }).a;
  return out;
}

/* Gli attacchi che questo modello porta adesso: la caratteristica del
   profilo piu' quello che la carica furiosa aggiunge — e la carica
   furiosa vuole i suoi tre pollici di corsa, come l'urto. */
const attacksOf = c => (c.a || 1) + (ranIn(c) && c.flags && c.flags.furiousCharge ? 1 : 0) +
                       /* la Frenzy non vuole i tre pollici: le basta aver
                          caricato, o aver inseguito il turno prima */
                       (c.frenzyA || 0);

/* Quanti si toccano davvero: la prima fila e' larga quanto la piu'
   stretta delle due, e una fila dietro appoggia con un colpo a testa.
   E' l'ordine di grandezza del tavolo, e nel pannello si corregge. */
export function contact(att, def){
  const front = Math.max(1, Math.min(att.frontage, def.frontage, att.models));
  /* Le file d'appoggio: una, oppure due con la lancia che permette di
     combattere in una fila in piu'. Ognuna appoggia con un colpo a
     testa, non con tutti i suoi attacchi. */
  const ranks = att.flags && att.flags.extraRank ? 2 : 1;
  const behind = Math.max(0, att.models - att.frontage);
  const support = Math.min(front * ranks, behind);
  return { front, support, ranks, attacks: front * attacksOf(att) + support };
}

/* ============================================================
   2 · UN COLPO
   ============================================================ */
export function strike(att, def, { attacks, auto = false, strength, ap, label = "", round = 1 } = {}){
  /* `forcedAttacks` e' il numero corretto a mano nel pannello: chi
     guarda il tavolo vede quanti si toccano meglio di qualsiasi conto */
  const n = Math.max(0, attacks ?? att.forcedAttacks ?? contact(att, def).attacks);
  const S = strength ?? att.s;
  const AP = ap ?? att.ap;

  const f = att.flags || emptyFlags();
  const notes = [];

  const hitNeed = auto ? 0 : fearful(hitMelee(att.ws, def.ws), att);
  if (!auto && att.feared) notes.push("Paura: −1 per colpire");
  /* L'Odio ritira i colpi mancati, e solo nel primo assalto. Era
     elencato fra le regole «che si giocano altrove — e' un test di
     psicologia»: nel manuale di questa edizione non e' un test, e' un
     ritiro, e il testo che le liste salvate portano con se' lo dice in
     tre righe. Il ritiro vero lo fa `pool`, che sa gia' che un dado
     non si ritira due volte (p. 93). */
  const hateful = !auto && f.hatred && round === 1;
  const hit = auto ? { dice: [], hits: n, need: 0, of: n } : pool(n, hitNeed, hateful ? "misses" : null);
  if (hit.rerolled) notes.push("Odio: " + hit.rerolled +
    (hit.rerolled === 1 ? " colpo mancato ritirato" : " colpi mancati ritirati"));

  /* Veleno: il 6 naturale per colpire non ferisce da solo, da' due punti
     al tiro per ferire. Quei colpi si tirano a parte, con il loro
     punteggio, e poi i due tiri si raccontano come uno. */
  const woundNeed = woundOn(S, def.t);
  const venom = f.poisoned ? Math.min(sixes(hit), hit.hits) : 0;
  const venomNeed = Math.max(2, woundNeed - 2);
  const plain = pool(hit.hits - venom, woundNeed);
  const spiked = venom ? pool(venom, venomNeed) : null;
  const wound = mergePools(plain, spiked);
  if (venom) notes.push(venom + (venom === 1 ? " colpo avvelenato feriva" : " colpi avvelenati ferivano")
                        + " a " + venomNeed + "+ invece che a " + woundNeed + "+");

  /* Perfora-armature e colpo mortale guardano lo stesso dado, il 6
     naturale per ferire: il primo migliora la perforazione, il secondo
     salta del tutto l'armatura. */
  const crit = (f.armourBane || f.killingBlow) ? sixes(plain) + (spiked ? sixes(spiked) : 0) : 0;
  const critHits = Math.min(crit, wound.hits);
  const saveNeed = saveOn(def.armour, AP);
  const critNeed = f.killingBlow ? IMPOSSIBLE : saveOn(def.armour, AP + f.armourBane);
  const savePlain = pool(wound.hits - critHits, saveNeed);
  const saveCrit = critHits ? pool(critHits, critNeed) : null;
  const save = mergePools(savePlain, saveCrit);
  if (critHits) notes.push(critHits + (critHits === 1 ? " sei naturale" : " sei naturali")
    + (f.killingBlow ? ": nessuna armatura" : ": armatura a " + (critNeed >= IMPOSSIBLE ? "niente" : critNeed + "+")));
  const through = wound.hits - save.hits;

  /* Salvezza speciale e poi rigenerazione: due reti distinte, e la
     seconda non la buca nessuna perforazione. */
  const wardNeed = saveOn(def.ward, 0);
  const ward = pool(through, wardNeed);
  const left = through - ward.hits;
  const regenNeed = saveOn(def.regen, 0);
  const regen = pool(left, regenNeed);

  return { label, attacks: n, strength: S, ap: AP, notes,
           hit, wound, save, ward, regen, wounds: left - regen.hits };
}

/* le ferite diventano modelli tolti; quelle che non bastano a
   completare un modello restano appese fino alla fine dell'assalto */
export function applyWounds(side, wounds){
  side.spill += wounds;
  const kills = Math.min(side.models, Math.floor(side.spill / side.w));
  side.spill -= kills * side.w;
  side.models -= kills;
  return kills;
}

/* ============================================================
   3 · UN ASSALTO INTERO
   L'ordine e' quello del manuale, e la Tappa 3 ne ha cambiati due
   pezzi: in cima l'urto della carica vuole i suoi tre pollici, in
   fondo i pestoni arrivano dopo tutti gli altri attacchi — prima
   stavano insieme all'urto, cioe' pestavano modelli che dopo
   sarebbero caduti comunque.
   ============================================================ */
const clone = c => ({ ...c, spill: 0 });
const usOf = c => (c.usPer || 1) * (c.models || 0);

export function meleeRound(A, B, { round = 1, challenge = false } = {}){
  const a = clone(A), b = clone(B);
  const steps = [];
  const done = { A: 0, B: 0 };          // ferite inflitte da ciascuno

  const blow = (att, def, tag, opts) => {
    if (def.models <= 0 || att.models <= 0) return;
    const r = strike(att, def, { round, ...opts });
    const kills = applyWounds(def, r.wounds);
    done[tag] += r.wounds;
    steps.push({ side: tag, name: att.name, ...r, kills });
  };
  const pair = [[a, b, "A"], [b, a, "B"]];

  /* prima l'urto della carica, che arriva addosso senza tirare per
     colpire, e solo da chi ha corso almeno tre pollici */
  for (const [att, def, tag] of pair){
    if (!ranIn(att)) continue;
    const n = autoHits(att.flags && att.flags.impact, contact(att, def).front);
    if (n) blow(att, def, tag, { attacks: n, auto: true, strength: att.baseS,
                                 label: "urto della carica" });
  }

  /* poi si mena, in ordine di Iniziativa — con dentro il bonus della
     carica (p. 146), che e' la novita' della Tappa 3 — salvo chi ha
     un'arma che decide l'ordine da sola. */
  const order = ML.strikeOrder(a, b);
  if (order.together){
    const ra = strike(a, b, { label: "colpi", round }), rb = strike(b, a, { label: "colpi", round });
    const ka = applyWounds(b, ra.wounds), kb = applyWounds(a, rb.wounds);
    done.A += ra.wounds; done.B += rb.wounds;
    steps.push({ side: "A", name: a.name, ...ra, kills: ka, together: true });
    steps.push({ side: "B", name: b.name, ...rb, kills: kb, together: true });
  } else {
    const first  = order.first === "A" ? [a, b, "A"] : [b, a, "B"];
    const second = order.first === "A" ? [b, a, "B"] : [a, b, "A"];
    blow(first[0],  first[1],  first[2],  { label: "colpi" });
    blow(second[0], second[1], second[2], { label: "colpi" });
  }

  /* e per ultimi i pestoni: «dopo tutti gli altri attacchi, compresi
     quelli a Iniziativa 1», dice il testo della regola. Non vogliono la
     carica — basta essere a contatto — e usano anche loro la Forza non
     modificata del modello. */
  for (const [att, def, tag] of pair){
    const n = autoHits(att.flags && att.flags.stomp, 1);
    if (n) blow(att, def, tag, { attacks: n, auto: true, strength: att.baseS,
                                 label: "pestoni" });
  }

  /* L'overkill di una sfida: le ferite in piu' di quelle che
     sarebbero bastate non si perdono, contano nel risultato. Si
     misurano sulle ferite che l'avversario aveva PRIMA, non su quelle
     che gli restano. */
  if (challenge){
    a.overkill = ML.overkill(done.A, (B.models || 0) * (B.w || 1)).counted;
    b.overkill = ML.overkill(done.B, (A.models || 0) * (A.w || 1)).counted;
  }

  const cr = resolution(a, b, done);
  const wiped = a.models <= 0 ? "A" : b.models <= 0 ? "B" : "";
  const test = wiped || !cr.loser ? null
    : breakFor(cr.loser === "A" ? a : b, cr.loser === "A" ? b : a, cr.diff, cr.loser);
  return { a, b, steps, cr, test, wiped, done, order, round, challenge,
           killsA: A.models - a.models, killsB: B.models - b.models };
}

/* Il test di rotta di chi ha perso. Tre esiti invece di due (p. 154), e
   due regole speciali che lo saltano in due modi diversi.

   Lo Stubborn e' una scelta e non un tiro: si dichiara *prima* dei
   dadi e una volta sola per partita. Un assalto simulato non sa a che
   punto della partita siamo, quindi qui la condotta e' scritta in
   chiaro, in una riga sola: lo si dichiara quando andarsene e' piu'
   probabile che cedere terreno, cioe' quando il ripiegamento sicuro
   vale piu' della scommessa. Al tavolo la scelta resta di chi gioca,
   con le tre probabilita' sotto gli occhi.

   Da notare, perche' non e' ovvio: la rotta dipende dal tiro naturale
   e quindi NON dallo scarto del combattimento. Perdere di otto invece
   che di due non fa scappare di piu': fa ripiegare invece di cedere
   terreno. E' tutto il senso dei tre esiti. */
function breakFor(side, winner, diff, tag){
  const f = side.flags || {};
  const crushed = ML.crushingUS(usOf(winner), usOf(side));
  /* Il Terrore (Tappa 5): se fra chi ha vinto c'e' chi lo fa, chi ha
     perso ha −1 al Comando nel test. Il −1 entra anche nelle
     probabilita', cosi' il numero che il pannello mostra e' quello con
     cui si tira davvero. */
  const terror = PS.terrorBreakMod({ winners: [winner.psych], loser: side.psych || {} });
  const ldMod = terror.mod;
  const chances = ML.breakChances(side.ld, diff, { crushed, ldMod });
  const base = { side: tag, chances, crushed, terror: terror.why };
  if (f.unbreakable)
    return { ...base, ...ML.breakOutcome({ ld: side.ld, diff, unbreakable: true }) };
  if (f.stubborn && !side.stubbornUsed && chances.rout > chances.give)
    return { ...base, ...ML.breakOutcome({ ld: side.ld, diff, stubbornNow: true }) };
  return { ...base, ...ML.breakOutcome({ ld: side.ld, diff, dice: roll(2), crushed, ldMod }) };
}

/* Il conto di fine assalto. Le voci sono quelle che al tavolo si
   contano sulle dita, e da questa tappa stanno in `melee.js` insieme
   al resto del combattimento: qui resta la traduzione da schiera a
   scheda, che e' l'unica cosa che sa di `combat.js`. */
export function resolution(a, b, done){
  return ML.combatResult(ML.scoreCardOf(a, done.A), ML.scoreCardOf(b, done.B));
}

/* ============================================================
   4 · CINQUECENTO ASSALTI
   Un assalto solo non dice niente: i dadi fanno quello che vogliono.
   Ripetuto molte volte diventa la risposta alla domanda vera, che e'
   "conviene?".
   ============================================================ */
export function odds(A, B, n = 500, opts = {}){
  const out = { n, winA: 0, winB: 0, draw: 0,
                /* i tre esiti del test di rotta, contati a parte: «ha
                   perso» e «se n'e' andata» sono due domande diverse, e
                   fra le due c'e' adesso tutto lo spazio del cedere
                   terreno e del ripiegare in ordine */
                giveA: 0, giveB: 0, fallA: 0, fallB: 0, routA: 0, routB: 0,
                killsA: 0, killsB: 0, wipeA: 0, wipeB: 0 };
  const key = { give: "give", fallBack: "fall", rout: "rout" };
  for (let k = 0; k < n; k++){
    const r = meleeRound(A, B, opts);
    if (r.cr.winner === "A") out.winA++;
    else if (r.cr.winner === "B") out.winB++;
    else out.draw++;
    if (r.test) out[key[r.test.outcome] + r.test.side]++;
    out.killsA += r.killsA; out.killsB += r.killsB;
    if (r.wiped === "A") out.wipeA++;
    if (r.wiped === "B") out.wipeB++;
  }
  out.killsA /= n; out.killsB /= n;
  return out;
}

/* la stessa cosa senza tirare: quante ferite ci si aspetta in media */
export function meleeForecast(att, def, attacks){
  const n = attacks ?? att.forcedAttacks ?? contact(att, def).attacks;
  const f = att.flags || emptyFlags();
  const h = fearful(hitMelee(att.ws, def.ws), att);
  /* Con l'Odio i colpi mancati si ritirano, e la media dei colpi
     andati a segno sale: il conto lo sa gia' fare `expected`, che la
     stessa regola la applica ai dadi veri. */
  const hChance = f.hatred ? expected(1, h, "misses") : chance(h);
  const w = woundOn(att.s, def.t);
  /* col veleno un colpo su sei ferisce con due punti di sconto: la
     media si fa sui due casi, non su uno */
  const wChance = f.poisoned && h < IMPOSSIBLE
    ? (5 / 6) * chance(w) + (1 / 6) * chance(Math.max(2, w - 2))
    : chance(w);
  const sv = saveOn(def.armour, att.ap);
  const svChance = f.killingBlow ? (5 / 6) * chance(sv)
    : f.armourBane ? (5 / 6) * chance(sv) + (1 / 6) * chance(saveOn(def.armour, att.ap + f.armourBane))
    : chance(sv);
  const wd = saveOn(def.ward, 0), rg = saveOn(def.regen, 0);
  const wounds = n * hChance * wChance * (1 - svChance) * (1 - chance(wd)) * (1 - chance(rg));
  return { attacks: n, hitNeed: h, woundNeed: w, saveNeed: sv, wardNeed: wd, regenNeed: rg,
           hatred: !!f.hatred, wounds, kills: wounds / def.w };
}

/* ============================================================
   5 · IL TIRO
   Stessa catena, un anello in meno (niente Iniziativa, niente ranghi):
   quanti tirano, con che punteggio, e quanti ne restano a terra.
   ============================================================ */

/* I modificatori e il conto dei tiratori stavano qui e adesso stanno in
   `shoot.js`, che e' il posto in cui la fase di tiro abita per intero
   dalla Tappa 4. Restano esportati da qui perche' mezza app li chiama
   con questo nome, ma la regola e' scritta una volta sola: il -1 della
   lunga gittata e il tetto delle due file si correggono in un punto. */
export const shootMods = SH.shootMods;

export const shooters = u => SH.shooterCap({
  models: u.models || 1, lost: u.lost || 0,
  frontage: u.frontage || 1, loose: !!u.loose,
});

export function shootForecast(shooter, target, { weapon, mods = 0, shots } = {}){
  const bs = stat((shooter.stats || {}).BS);
  const n = shots ?? shooters(shooter);
  /* Il punteggio non e' piu' un conto scritto qui: l'1 naturale che non
     colpisce mai e il ritiro dell'Abilita' Balistica alta sono due
     regole, e stanno dove stanno le altre del tiro. */
  const aim = SH.hitNeed(bs, mods);
  const need = aim.need;
  const S = weaponStrength(weapon, stat((shooter.stats || {}).S));
  const AP = weaponAP(weapon);
  const t = combatant(target);
  /* Il veleno vale anche a distanza, e il tiratore lo porta con se' o
     con l'arma: le due liste di regole si leggono insieme. */
  const f = readRules(shooter.rules || [], splitWeaponRules(weapon && weapon.rules), weapon ? weapon.name : "").flags;
  const wNeed = woundOn(S, t.t), sNeed = saveOn(t.armour, AP);
  const kNeed = saveOn(t.ward, 0), rNeed = saveOn(t.regen, 0);
  const wChance = f.poisoned && need < IMPOSSIBLE
    ? (5 / 6) * chance(wNeed) + (1 / 6) * chance(Math.max(2, wNeed - 2))
    : chance(wNeed);
  const hChance = SH.hitChance(need, aim.again);
  const wounds = n * hChance * wChance * (1 - chance(sNeed)) * (1 - chance(kNeed)) * (1 - chance(rNeed));
  return { shots: n, hitNeed: need, hitAgain: aim.again, strength: S, ap: AP, poisoned: f.poisoned,
           woundNeed: wNeed, saveNeed: sNeed, wardNeed: kNeed, regenNeed: rNeed,
           wounds, kills: wounds / t.w, targetW: t.w };
}

/* e la stessa raffica tirata sul serio */
export function shootRoll(shooter, target, opts){
  const f = shootForecast(shooter, target, opts);
  const notes = [];
  /* Il ritiro dell'Abilita' Balistica alta non e' il ritiro di
     `pool`, ed e' la differenza che conta: li' il dado rifatto si
     confronta con lo stesso punteggio, qui con un SECONDO punteggio,
     piu' alto. Sono due tiri in fila, e vanno scritti come tali. */
  const first = pool(f.shots, f.hitNeed);
  const again = f.hitAgain ? pool(first.of - first.hits, f.hitAgain) : null;
  const hit = mergePools(first, again);
  if (again) notes.push((first.of - first.hits) + " mancati ritirati a " + f.hitAgain +
                        "+ (Abilita' Balistica alta): " + again.hits + " passano");

  const venom = f.poisoned ? Math.min(sixes(hit), hit.hits) : 0;
  const venomNeed = Math.max(2, f.woundNeed - 2);
  const plain = pool(hit.hits - venom, f.woundNeed);
  const wound = mergePools(plain, venom ? pool(venom, venomNeed) : null);
  if (venom) notes.push(venom + (venom === 1 ? " colpo avvelenato feriva" : " colpi avvelenati ferivano")
                        + " a " + venomNeed + "+ invece che a " + f.woundNeed + "+");

  const save = pool(wound.hits, f.saveNeed);
  const through = wound.hits - save.hits;
  const ward = pool(through, f.wardNeed);
  const left = through - ward.hits;
  const regen = pool(left, f.regenNeed);
  const wounds = left - regen.hits;
  return { ...f, notes, hit, wound, save, ward, regen, wounds, kills: Math.floor(wounds / f.targetW) };
}
