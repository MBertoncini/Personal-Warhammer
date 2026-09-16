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
import { flagsOf, spent, val } from './effects.js';
import { woundsOf } from './extras.js';
import { armyFor, meleeBoosts, fleeBonus } from './armies.js';
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
   chi la fa. La tabella di p. 148 non chiede mai piu' di 5+, quindi con
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
  /* Le caratteristiche passano da `effects.js`, con gli effetti a tempo
     sopra: un Word of Pain che toglie un punto di Resistenza deve
     toglierlo ai dadi, non solo alla tabella dell'ispettore. Fino alla
     Tappa 6 la schiera leggeva il profilo grezzo, e gli effetti si
     vedevano scritti e non pesavano su niente. */
  const c = {
    ref: u, name: u.name, army: u.army,
    ws: val(u, "WS"), bs: val(u, "BS"), s: val(u, "S"), t: val(u, "T"),
    w: Math.max(1, val(u, "W") || 1), i: val(u, "I"), a: Math.max(1, val(u, "A") || 1),
    ld: val(u, "Ld"),
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
    usPer: usPerModel(u.troop, u.us, u.models, stat(st.W)),
    troop: troopType(u.troop),
    armour: val(u, "armour"), ward: val(u, "ward"), regen: val(u, "regen"),
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
    /* Le ferite gia' incassate e non ancora diventate un modello a
       terra. Erano sempre zero: un Bastiladon ferito nel round 2
       arrivava al round 3 intero, e le tre ferite passate dal tiro
       sparivano nel nulla. Adesso le porta il tavolo (`u.wounds`) e la
       schiera le trova gia' addosso. */
    spill: woundsOf(u),
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
  /* E il file del suo esercito (Tappa 5 bis), trovato dalla fazione che
     il parser scrive su ogni unita': le regole che nomina smettono di
     essere sconosciute, e quelle che il vocabolario sa dire entrano nel
     conto. */
  const army = armyFor(u);
  const read = readRules(u.rules || [], splitWeaponRules(melee && melee.rules),
                         melee ? melee.name : "", u.ruleText || null, army);
  c.flags = read.flags;
  c.rulesRead = { applied: read.applied, elsewhere: read.elsewhere, unknown: read.unknown };
  c.armyName = army ? army.name : "";

  /* Horde: un rango di bonus in piu' di quanti il tipo di truppa ne
     conceda. Il tetto vive sul tipo di truppa, e la copia serve a non
     alzarlo a tutta la fanteria del tavolo. */
  if (c.flags.horde && c.troop) c.troop = { ...c.troop, maxRank: (c.troop.maxRank || 0) + 1 };

  /* La salvezza speciale che una regola fissa — l'Arcane Shield dello
     Slann — vale se e' migliore di quella del file, che il piu' delle
     volte non la dichiara affatto. */
  const still = meleeBoosts(c.flags.army, { weapon: c.weapon });
  if (still.ward && (!c.ward || still.ward < c.ward)){ c.ward = still.ward; c.wardFrom = still.from.ward; }

  /* Gli effetti a tempo che l'assalto sente: il Waaagh! acceso nella
     sotto-fase di comando vive qui, come un incantesimo. E le due regole
     da una volta per partita gia' spese, che il tavolo ricorda su
     `u.spent` e l'annulla riporta indietro. */
  const ef = flagsOf(u);
  c.eff = ef.flags; c.effWhy = ef.why;
  c.stubbornUsed = spent(u, "stubborn");
  c.shieldwallUsed = spent(u, "shieldwall");

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
  const ranks = c.disrupted ? 0 : rankBonus(c.models, c.frontage,
    c.troop ? c.troop.maxRank : 2, c.troop ? c.troop.perRank : 5);
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
   E' l'ordine di grandezza del tavolo, e nel pannello si corregge.

   `frontage` e' la fetta di prima fila che tocca QUESTO nemico: chi ne
   ha due davanti non mena due volte con tutta la fila, la divide. Senza
   quel numero vale tutta la fila, che e' il caso di un assalto a due. */
export function contact(att, def, { frontage = null } = {}){
  const width = frontage == null ? Math.max(1, att.frontage) : Math.max(0, frontage);
  const front = width <= 0 ? 0 : Math.max(1, Math.min(width, def.frontage, att.models));
  /* Le file d'appoggio: una, oppure due con la lancia che permette di
     combattere in una fila in piu'. Ognuna appoggia con un colpo a
     testa, non con tutti i suoi attacchi. */
  const ranks = att.flags && att.flags.extraRank ? 2 : 1;
  const behind = Math.max(0, att.models - att.frontage);
  const support = Math.min(front * ranks, behind);
  return { front, support, ranks, attacks: front * attacksOf(att) + support };
}

/* La prima fila divisa fra i nemici che ha davanti. Il resto della
   divisione va ai primi dichiarati, che sono quelli piu' al centro; a
   chi resta senza un modello davanti non tocca niente, e allora non
   mena — e' ingaggiato, ma non arriva. */
export function frontShares(frontage, n){
  const w = Math.max(0, Math.floor(+frontage || 0)), k = Math.max(1, n | 0);
  const base = Math.floor(w / k), extra = w - base * k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

/* Un mucchio di colpi automatici — l'urto della carica, i pestoni —
   diviso come le file: si tira una volta sola e poi si spartisce, che
   e' il contrario di tirare un D6 per ogni nemico davanti. */
function spread(n, shares){
  const tot = shares.reduce((s, v) => s + v, 0);
  const out = shares.map(() => 0);
  if (n <= 0 || !out.length) return out;
  if (tot <= 0){ out[0] = n; return out; }
  let left = n;
  shares.forEach((v, i) => { const q = Math.floor(n * v / tot); out[i] = q; left -= q; });
  for (let i = 0; left > 0; i = (i + 1) % out.length){ if (shares[i] > 0){ out[i]++; left--; } }
  return out;
}

/* Chi tocca chi. Una schiera lo dichiara con `vs` — i nomi o le
   posizioni dei nemici che ha davanti — e chi non dichiara niente non
   pone condizioni: tocca chiunque non l'abbia esclusa. In un assalto a
   due nessuno dichiara niente e il risultato e' quello di sempre.

   Il contatto e' reciproco per costruzione: la coppia c'e' se tutte e
   due le parti la ammettono, e una parte che tace ammette tutto. Cosi'
   «io tocco te» basta a legarci quando tu non hai detto niente, e due
   dichiarazioni che si contraddicono non inventano un contatto che
   nessuna delle due afferma.

   Una dichiarazione che non trova nessuno vale come nessuna
   dichiarazione: un nome scritto male non deve far sparire un'unita'
   dal combattimento in silenzio. Restare senza nemici davanti, invece,
   si puo': e' l'unita' che il manuale chiama fuori dal combattimento
   quando i modelli caduti le tolgono il contatto (p. 158). */
export function engagements(A = [], B = []){
  const said = (c, others) => {
    if (c.vs == null) return null;
    const want = [].concat(c.vs);
    const hit = others.map((_, i) => i).filter(i =>
      want.includes(i) || want.includes(others[i].name) || want.includes(others[i].ref));
    return hit.length ? new Set(hit) : null;
  };
  const wantA = A.map(c => said(c, B)), wantB = B.map(c => said(c, A));
  const link = (i, j) => (!wantA[i] || wantA[i].has(j)) && (!wantB[j] || wantB[j].has(i));
  /* Il contatto e' reciproco, il bersaglio no. Un personaggio unito a
     un reggimento «puo' essere colpito solo dagli attacchi diretti
     contro di lui» (p. 209): sta nella mischia, mena, ma chi ha
     davanti lo colpisce solo se lo dice. Per questo le due direzioni si
     calcolano separate — chi mena chi, non chi tocca chi. */
  const mirato = (want, at, foe) => !foe.shielded || (want && want.has(at));
  return {
    A: A.map((_, i) => B.map((_, j) => j).filter(j => link(i, j) && mirato(wantA[i], j, B[j]))),
    B: B.map((_, j) => A.map((_, i) => i).filter(i => link(i, j) && mirato(wantB[j], i, A[i]))),
  };
}

/* Le regole d'esercito di una schiera in questo momento: quelle del
   file, tradotte da `armies.js`, e quelle accese da un effetto a tempo.
   «Ha caricato» qui non vuole i tre pollici dell'urto: la Choppa dice
   «nel turno in cui ha caricato» e basta. */
function boostsOf(att){
  const b = meleeBoosts((att.flags && att.flags.army) || [], { charged: !!att.charged, weapon: att.weapon });
  const e = att.eff || {}, why = att.effWhy || {};
  const by = () => (why.reroll || [])[0] || "effetto";
  if (e.reroll && e.reroll.toHit && !b.rerollHit){ b.rerollHit = e.reroll.toHit; b.from.hit = by(); }
  if (e.reroll && e.reroll.toWound && !b.rerollWound){ b.rerollWound = e.reroll.toWound; b.from.wound = by(); }
  /* la perforazione che un effetto regala: Daemonic Vessel, +1 */
  if (e.ap){ b.ap += +e.ap || 0; b.notes.push(((why.ap || [])[0] || "effetto") + ": perforazione +" + e.ap); }
  return b;
}

/* Quanto in piu' fugge un'unita' del tavolo, e perche': la Scurry Away
   degli Skaven. Sta qui perche' qui si sa trovare l'esercito di
   un'unita'; il tiro lo fa chi muove i pezzi. */
export function fleeBonusOf(u){
  const army = armyFor(u);
  if (!army) return { mod: 0, why: "" };
  return fleeBonus(readRules((u && u.rules) || [], [], "", null, army).flags.army);
}

/* ============================================================
   2 · UN COLPO
   ============================================================ */
export function strike(att, def, { attacks, auto = false, strength, ap, label = "", round = 1 } = {}){
  /* `forcedAttacks` e' il numero corretto a mano nel pannello: chi
     guarda il tavolo vede quanti si toccano meglio di qualsiasi conto */
  const n = Math.max(0, attacks ?? att.forcedAttacks ?? contact(att, def).attacks);
  const f = att.flags || emptyFlags();
  const notes = [];

  /* Le regole d'esercito valgono sui colpi che si tirano con l'arma: la
     Choppa migliora la perforazione «della sua arma», e l'urto e i
     pestoni non passano da un'arma. */
  const boost = auto ? null : boostsOf(att);
  const S = (strength ?? att.s) + (boost ? boost.s : 0);
  const AP = (ap ?? att.ap) + (boost ? boost.ap : 0);
  if (boost) notes.push(...boost.notes, ...boost.off);

  const hitNeed = auto ? 0 : fearful(hitMelee(att.ws, def.ws), att);
  if (!auto && att.feared) notes.push("Paura: −1 per colpire");
  /* L'Odio ritira i colpi mancati, e solo nel primo assalto. Era
     elencato fra le regole «che si giocano altrove — e' un test di
     psicologia»: nel manuale di questa edizione non e' un test, e' un
     ritiro, e il testo che le liste salvate portano con se' lo dice in
     tre righe. Il ritiro vero lo fa `pool`, che sa gia' che un dado
     non si ritira due volte (p. 93). */
  /* l'Odio puo' venire anche da un incantesimo (Battle Lust) */
  const hateful = !auto && (f.hatred || !!(att.eff && att.eff.hatred)) && round === 1;
  /* L'Odio ritira tutti i mancati, e quindi anche gli 1: con lui il
     ritiro degli 1 del Waaagh! non aggiunge niente, perche' un dado non
     si ritira due volte (p. 93). */
  const hitAgain = hateful ? "misses" : (boost && boost.rerollHit) || null;
  const hit = auto ? { dice: [], hits: n, need: 0, of: n } : pool(n, hitNeed, hitAgain);
  if (hit.rerolled) notes.push(hateful
    ? "Odio: " + hit.rerolled + (hit.rerolled === 1 ? " colpo mancato ritirato" : " colpi mancati ritirati")
    : boost.from.hit + ": " + hit.rerolled + (hit.rerolled === 1 ? " 1 per colpire ritirato" : " 1 per colpire ritirati"));

  /* Veleno: il 6 naturale per colpire non ferisce da solo, da' due punti
     al tiro per ferire. Quei colpi si tirano a parte, con il loro
     punteggio, e poi i due tiri si raccontano come uno. */
  const woundNeed = woundOn(S, def.t);
  const venom = f.poisoned ? Math.min(sixes(hit), hit.hits) : 0;
  const venomNeed = Math.max(2, woundNeed - 2);
  const woundAgain = (boost && boost.rerollWound) || null;
  const plain = pool(hit.hits - venom, woundNeed, woundAgain);
  const spiked = venom ? pool(venom, venomNeed, woundAgain) : null;
  const wound = mergePools(plain, spiked);
  const woundRe = (plain.rerolled || 0) + (spiked ? spiked.rerolled || 0 : 0);
  if (woundRe) notes.push(boost.from.wound + ": " + woundRe +
    (woundRe === 1 ? " 1 per ferire ritirato" : " 1 per ferire ritirati"));
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

/* Quanti colpi porta una schiera su ciascuno di quelli che ha davanti,
   e quanta prima fila ci arriva.

   Due casi diversi, e confonderli e' l'errore da cui viene questa
   funzione. Fra due REGGIMENTI la prima fila si divide: chi ne tocca
   due non mena due volte con tutta la fila. Un PERSONAGGIO UNITO
   invece non sta accanto al reggimento, sta *dentro*: non si prende una
   fetta di fronte, si prende dei colpi che qualcuno decide di dirigere
   su di lui (p. 209), e quei colpi escono dal mucchio destinato al
   reggimento che lo ospita — i modelli che menano al capo non stanno
   menando alla truppa.

   Quanti siano lo dice chi combatte con `aimed`; il ripiego e' un
   modello, cioe' quello che al tavolo si fa quasi sempre: il campione
   che si fa avanti contro l'eroe. */
function aimAt(c, foes, side){
  const veri = foes.map((j, k) => ({ j, k })).filter(x => !side[x.j].attached);
  const capi = foes.map((j, k) => ({ j, k })).filter(x =>  side[x.j].attached);
  const budget = foes.map(() => 0), fronts = foes.map(() => 0);
  if (!foes.length) return { budget, fronts };

  if (!veri.length){
    /* davanti c'e' rimasto solo il capo: allora tutta la fila e' sua */
    const q = frontShares(c.frontage, capi.length);
    capi.forEach((x, i) => {
      const ct = contact(c, side[x.j], { frontage: q[i] });
      budget[x.k] = ct.attacks; fronts[x.k] = ct.front;
    });
    return { budget, fronts };
  }

  const q = frontShares(c.frontage, veri.length);
  veri.forEach((x, i) => {
    const ct = contact(c, side[x.j], { frontage: q[i] });
    budget[x.k] = ct.attacks; fronts[x.k] = ct.front;
  });
  let tolti = 0;
  capi.forEach(x => {
    const n = Math.max(0, Math.round(+c.aimed >= 0 ? +c.aimed : attacksOf(c)));
    budget[x.k] = n; fronts[x.k] = n ? 1 : 0;
    tolti += n;
  });
  /* i colpi diretti sul capo li perde il reggimento che lo ospita, che
     e' il primo dei nemici veri */
  if (tolti) budget[veri[0].k] = Math.max(0, budget[veri[0].k] - tolti);
  return { budget, fronts };
}

/* Dalle ferite di un colpo ai modelli a terra, per chi tiene lo stato
   del tavolo. Torna i modelli caduti E le ferite che restano appese:
   chiamarla e buttare via il secondo numero e' il modo di far
   evaporare le ferite, che e' quello che facevano il tiro e la magia —
   tre ferite su un mostro da quattro sparivano senza lasciare traccia.

   `carried` serve a dire «queste le ho gia' contate io»: senza, si
   parte da quelle che l'unita' ha addosso. */
export function woundsToll(u, wounds, { carried = null } = {}){
  const c = combatant(u);
  const side = { ...c, spill: carried == null ? c.spill : Math.max(0, carried) };
  const kills = applyWounds(side, wounds);
  return { kills, left: side.spill, perModel: c.w, models: side.models };
}

/* ============================================================
   3 · UN ASSALTO INTERO, CON QUANTE UNITA' CI SONO DAVVERO
   L'ordine e' quello del manuale, e la Tappa 3 ne ha cambiati due
   pezzi: in cima l'urto della carica vuole i suoi tre pollici, in
   fondo i pestoni arrivano dopo tutti gli altri attacchi — prima
   stavano insieme all'urto, cioe' pestavano modelli che dopo
   sarebbero caduti comunque.

   E da qui l'assalto non e' piu' fra due schiere ma fra due GRUPPI.
   `meleeRound(A, B)` prendeva due unita' e basta, e non era una
   semplificazione innocua: tre unita' che convergono su un reggimento
   sono il normale di Warhammer, non l'eccezione, e in una partita da
   750 punti sono decine di cariche che non si possono rappresentare.
   Adesso entrano due elenchi, si mena in un ordine di Iniziativa solo
   — tutti insieme, non a coppie — e il conto di fine assalto e' quello
   della pagina dei combattimenti multipli (p. 153): i ranghi non si
   sommano, gli stendardi nemmeno, il fianco si conta per nemico.

   Un'unita' sola per parte resta scritta com'era: stessa firma, stessi
   dadi nello stesso ordine, stesso oggetto di ritorno.
   ============================================================ */
/* Il clone di un assalto: le ferite appese se le porta dietro. Prima
   qui c'era `spill: 0`, ed e' il punto esatto in cui le ferite
   evaporavano fra un round e l'altro. */
const clone = c => ({ ...c, spill: c.spill || 0, dealt: 0 });
const usOf = c => (c.usPer || 1) * (c.models || 0);
/* la Forza d'Unita' di una PARTE: la somma di chi e' ancora in piedi
   (p. 154), ed e' quella che decide se il doppio schiaccia */
const sideUS = list => list.reduce((s, c) => s + (c.models > 0 ? usOf(c) : 0), 0);
const asSide = s => (Array.isArray(s) ? s : [s]).filter(Boolean);

export function meleeFight(SA, SB, { round = 1, challenge = false } = {}){
  const startA = asSide(SA), startB = asSide(SB);
  const A = startA.map(clone), B = startB.map(clone);
  const link = engagements(A, B);
  /* ogni schiera con la sua parte, i nemici che tocca, quanti colpi
     porta su ciascuno e quanta prima fila ci arriva */
  const mk = (c, at, tag, foes, side) => ({ c, at, tag, foes, side, ...aimAt(c, foes, side) });
  const all = [...A.map((c, i) => mk(c, i, "A", link.A[i], B)),
               ...B.map((c, i) => mk(c, i, "B", link.B[i], A))];
  A.forEach((c, i) => { c.foes = link.A[i]; });
  B.forEach((c, i) => { c.foes = link.B[i]; });

  const steps = [];
  const done = { A: 0, B: 0 };          // ferite inflitte da ciascuna parte

  /* Calcolare e applicare sono due gesti separati, e devono restarlo:
     chi mena nello stesso scaglione si guarda addosso lo stato di
     PRIMA dello scaglione, altrimenti chi e' scritto per primo
     nell'elenco toglierebbe i colpi a chi mena insieme a lui. */
  const shot = (e, j, opts) => {
    const def = e.side[j];
    if (!def || def.models <= 0 || e.c.models <= 0) return null;
    return { e, def, r: strike(e.c, def, { round, ...opts }) };
  };
  const land = x => {
    if (!x) return;
    const kills = applyWounds(x.def, x.r.wounds);
    x.e.c.dealt += x.r.wounds;
    done[x.e.tag] += x.r.wounds;
    steps.push({ side: x.e.tag, name: x.e.c.name, at: x.e.at, foe: x.def.name,
                 ...x.r, kills, together: !!x.together });
  };
  const blow = (e, j, opts) => land(shot(e, j, opts));

  /* Gli attacchi che questa schiera porta contro QUESTO nemico. Con
     uno solo davanti non si dice niente e vale il conto di sempre —
     compreso il numero corretto a mano nel pannello, che deve
     continuare a vincere su tutto. Con piu' d'uno la fila si divide. */
  const part = (e, k) => e.foes.length === 1 && !e.side[e.foes[0]].attached
    ? {}                                    // un nemico solo: vale il conto di sempre
    : { attacks: e.budget[k] };
  /* Urto della carica e pestoni si possono dirigere su un personaggio
     unito «solo se nel reggimento ci sono meno di cinque modelli di
     truppa» (p. 209): fuori da quel caso arrivano addosso all'unita',
     non a chi ci sta dentro. */
  const sotto = e => e.foes.map((j, k) => k).filter(k => {
    const f = e.side[e.foes[k]];
    return !f.shielded || f.exposed;
  });

  /* prima l'urto della carica, che arriva addosso senza tirare per
     colpire, e solo da chi ha corso almeno tre pollici. Quanti colpi
     siano si tira una volta sola e poi si spartisce fra chi si ha
     davanti: un D6 per ogni nemico sarebbe un urto moltiplicato. */
  for (const e of all){
    if (!ranIn(e.c) || !e.foes.length) continue;
    const dove = sotto(e);
    if (!dove.length) continue;
    const n = autoHits(e.c.flags && e.c.flags.impact, e.fronts.reduce((s, v) => s + v, 0));
    if (!n) continue;
    const split = spread(n, e.fronts.map((v, k) => dove.includes(k) ? v : 0));
    e.foes.forEach((j, k) => { if (split[k]) blow(e, j, {
      attacks: split[k], auto: true, strength: e.c.baseS, label: "urto della carica" }); });
  }

  /* poi si mena, in ordine di Iniziativa — con dentro il bonus della
     carica (p. 146) — salvo chi ha un'arma che decide l'ordine da
     sola. Un ordine solo per tutti quanti, e non due a due. */
  const plan = ML.strikeSteps(all.map(e => e.c));
  for (const step of plan){
    const shots = [];
    for (const at of step.at){
      const e = all[at];
      e.foes.forEach((j, k) => {
        const x = shot(e, j, { label: "colpi", ...part(e, k) });
        if (x) shots.push(Object.assign(x, { together: step.together }));
      });
    }
    shots.forEach(land);
  }

  /* e per ultimi i pestoni: «dopo tutti gli altri attacchi, compresi
     quelli a Iniziativa 1», dice il testo della regola. Non vogliono la
     carica — basta essere a contatto — e usano anche loro la Forza non
     modificata del modello. */
  for (const e of all){
    if (!e.foes.length) continue;
    const dove = sotto(e);
    if (!dove.length) continue;
    const n = autoHits(e.c.flags && e.c.flags.stomp, 1);
    if (!n) continue;
    const split = spread(n, e.fronts.map((v, k) => dove.includes(k) ? v : 0));
    e.foes.forEach((j, k) => { if (split[k]) blow(e, j, {
      attacks: split[k], auto: true, strength: e.c.baseS, label: "pestoni" }); });
  }

  /* L'overkill di una sfida: le ferite in piu' di quelle che
     sarebbero bastate non si perdono, contano nel risultato. Si
     misurano sulle ferite che l'avversario aveva PRIMA, non su quelle
     che gli restano — e il tetto e' +5 (p. 152). */
  if (challenge){
    for (const e of all){
      const from = e.tag === "A" ? startB : startA;
      const left = e.foes.reduce((s, j) =>
        s + ((from[j] || {}).models || 0) * ((from[j] || {}).w || 1), 0);
      e.c.overkill = ML.overkill(e.c.dealt, left).counted;
    }
  }

  const cr = resolution(A, B, done);
  /* una parte e' finita quando non e' rimasto in piedi nessuno, in
     nessuna delle sue unita' */
  const gone = list => list.length > 0 && list.every(c => c.models <= 0);
  const wiped = gone(A) ? "A" : gone(B) ? "B" : "";
  /* Il test di rotta lo tira OGNI unita' della parte che ha perso, una
     per una e con lo stesso scarto: «ciascuna unita' appartenente alla
     parte perdente deve fare un test di rotta» (p. 154). */
  const tests = [];
  if (cr.loser && !wiped){
    const losers = cr.loser === "A" ? A : B;
    const winners = (cr.loser === "A" ? B : A).filter(c => c.models > 0);
    const us = { win: sideUS(winners), lose: sideUS(losers) };
    losers.forEach((c, i) => {
      if (c.models > 0) tests.push({ ...breakFor(c, winners, cr.diff, cr.loser, us), at: i });
    });
  }

  const order = Object.assign({ steps: plan },
    A.length === 1 && B.length === 1 ? ML.strikeOrder(A[0], B[0]) : {});
  const kills = { A: A.map((c, i) => ((startA[i] || {}).models || 0) - c.models),
                  B: B.map((c, i) => ((startB[i] || {}).models || 0) - c.models) };
  const sum = list => list.reduce((s, v) => s + v, 0);
  return { sides: { A, B }, a: A[0], b: B[0], steps, cr, tests, test: tests[0] || null,
           wiped, done, order, round, challenge, kills,
           killsA: sum(kills.A), killsB: sum(kills.B) };
}

/* L'assalto fra due sole schiere, che e' il nome con cui mezza app lo
   chiama: la stessa cosa con un'unita' per parte. */
export function meleeRound(A, B, opts = {}){ return meleeFight(A, B, opts); }

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
function breakFor(side, winners, diff, tag, us = null){
  const f = side.flags || {};
  const won = Array.isArray(winners) ? winners : [winners];
  /* Le due Forze d'Unita' sono quelle delle PARTI, sommate (p. 154):
     chi chiama le porta gia' fatte, e quando non lo fa — un assalto a
     due chiamato da fuori — si ricavano dalle due schiere. */
  const crushed = ML.crushingUS(us ? us.win : won.reduce((s, w) => s + usOf(w), 0),
                                us ? us.lose : usOf(side));
  /* Il Terrore (Tappa 5): se fra chi ha vinto c'e' chi lo fa, chi ha
     perso ha −1 al Comando nel test. Il −1 entra anche nelle
     probabilita', cosi' il numero che il pannello mostra e' quello con
     cui si tira davvero. */
  const terror = PS.terrorBreakMod({ winners: won.map(w => w.psych), loser: side.psych || {} });
  const ldMod = terror.mod;
  /* Shieldwall (Tappa 5 bis): una volta per partita, nel turno in cui e'
     stata caricata. «E' stata caricata» qui e' «qualcuno di quelli che
     hanno vinto ha caricato»; l'ordine chiuso lo dice il tavolo, lo
     scudo in uso lo guarda chi gioca. */
  const shieldwall = !!f.shieldwall && !side.shieldwallUsed && won.some(w => !!w.charged) && !side.loose;
  const chances = ML.breakChances(side.ld, diff, { crushed, ldMod, shieldwall });
  const base = { side: tag, name: side.name || "", chances, crushed, terror: terror.why };
  if (f.unbreakable)
    return { ...base, ...ML.breakOutcome({ ld: side.ld, diff, unbreakable: true }) };
  if (f.stubborn && !side.stubbornUsed && chances.rout > chances.give)
    return { ...base, ...ML.breakOutcome({ ld: side.ld, diff, stubbornNow: true, shieldwall }) };
  return { ...base, ...ML.breakOutcome({ ld: side.ld, diff, dice: roll(2), crushed, ldMod, shieldwall }) };
}

/* Il conto di fine assalto. Le voci sono quelle che al tavolo si
   contano sulle dita, e da questa tappa stanno in `melee.js` insieme
   al resto del combattimento: qui resta la traduzione da schiera a
   scheda, che e' l'unica cosa che sa di `combat.js`. */
export function resolution(a, b, done){
  const A = Array.isArray(a) ? a : [a], B = Array.isArray(b) ? b : [b];
  /* Le ferite di ciascuno: l'assalto le scrive sulla schiera mentre le
     infligge, e chi chiama da fuori con due sole schiere passa ancora i
     due totali. */
  const cards = (side, other, tag) => side.map(c => {
    const hurt = c.dealt != null ? c.dealt : (side.length === 1 && done ? done[tag] || 0 : 0);
    /* chi ha davanti: serve al fianco, che si conta una volta per
       nemico e non una per attaccante (p. 153). Senza contatti
       dichiarati e' il primo dell'altra parte, che in un assalto a due
       e' l'unico. */
    const at = c.foes && c.foes.length ? c.foes[0] : 0;
    const foe = other[at];
    const card = ML.scoreCardOf(c, hurt, { foe: "#" + at });
    /* Impervious Defence e' una regola di chi viene preso di fianco, ma
       toglie il punto a chi lo prende: si scrive sulla scheda dell'altro. */
    if (foe && foe.flags && foe.flags.impervious && card.flank) card.flankDenied = "Impervious Defence";
    return card;
  });
  return ML.combatResult(cards(A, B, "A"), cards(B, A, "B"));
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
    const r = meleeFight(A, B, opts);
    if (r.cr.winner === "A") out.winA++;
    else if (r.cr.winner === "B") out.winB++;
    else out.draw++;
    /* con piu' unita' per parte i test sono piu' d'uno, e contarne uno
       solo perderebbe per strada proprio le unita' in piu' */
    for (const t of r.tests) out[key[t.outcome] + t.side]++;
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
  /* le regole d'esercito entrano nella media come nei dadi veri: gli 1
     ritirati li conta `expected`, la perforazione e la Forza si sommano */
  const boost = boostsOf(att);
  const hChance = f.hatred ? expected(1, h, "misses")
    : boost.rerollHit ? expected(1, h, boost.rerollHit) : chance(h);
  const w = woundOn(att.s + boost.s, def.t);
  const wOne = need => boost.rerollWound ? expected(1, need, boost.rerollWound) : chance(need);
  /* col veleno un colpo su sei ferisce con due punti di sconto: la
     media si fa sui due casi, non su uno */
  const wChance = f.poisoned && h < IMPOSSIBLE
    ? (5 / 6) * wOne(w) + (1 / 6) * wOne(Math.max(2, w - 2))
    : wOne(w);
  const ap = att.ap + boost.ap;
  const sv = saveOn(def.armour, ap);
  const svChance = f.killingBlow ? (5 / 6) * chance(sv)
    : f.armourBane ? (5 / 6) * chance(sv) + (1 / 6) * chance(saveOn(def.armour, ap + f.armourBane))
    : chance(sv);
  const wd = saveOn(def.ward, 0), rg = saveOn(def.regen, 0);
  const wounds = n * hChance * wChance * (1 - svChance) * (1 - chance(wd)) * (1 - chance(rg));
  return { attacks: n, hitNeed: h, woundNeed: w, saveNeed: sv, wardNeed: wd, regenNeed: rg,
           hatred: !!f.hatred, boost, wounds, kills: wounds / def.w };
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
  const hChance = SH.hitChance(need, aim.again, aim.then);
  const wounds = n * hChance * wChance * (1 - chance(sNeed)) * (1 - chance(kNeed)) * (1 - chance(rNeed));
  return { shots: n, hitNeed: need, hitAgain: aim.again, hitThen: aim.then || 0, hitRaw: aim.raw || need,
           bs, strength: S, ap: AP, poisoned: f.poisoned,
           woundNeed: wNeed, saveNeed: sNeed, wardNeed: kNeed, regenNeed: rNeed,
           wounds, kills: wounds / t.w, targetW: t.w,
           /* le ferite che il bersaglio si porta gia' addosso: tre
              ferite passate a un mostro da quattro non sono zero
              perdite, sono tre ferite che aspettano la quarta */
           carried: t.spill || 0, targetModels: t.models };
}

/* e la stessa raffica tirata sul serio */
export function shootRoll(shooter, target, opts){
  const f = shootForecast(shooter, target, opts);
  const notes = [];
  /* Il ritiro dell'Abilita' Balistica alta non e' il ritiro di
     `pool`, ed e' la differenza che conta: li' il dado rifatto si
     confronta con lo stesso punteggio, qui con un SECONDO punteggio,
     piu' alto. Sono due tiri in fila, e vanno scritti come tali. */
  let first = pool(f.shots, f.hitNeed);
  /* Il 7+ (p. 139): il primo tiro cerca i 6 naturali, e quei dadi si
     ritirano contro il secondo punteggio. Colpisce solo chi passa
     tutti e due, e il pannello mostra i due mucchi separati. */
  let follow = null;
  if (f.hitThen && first.hits){
    follow = pool(first.hits, f.hitThen);
    notes.push(`serviva ${f.hitRaw}+: ${first.hits} ${first.hits === 1 ? "sei ritirato" : "sei ritirati"} a ` +
               `${f.hitThen}+, ${follow.hits} colpisc${follow.hits === 1 ? "e" : "ono"}`);
    first = { ...first, hits: follow.hits };
  }
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
  /* Dalle ferite ai modelli a terra, tenendo il resto. Prima era un
     `Math.floor` e basta: il resto spariva, e con un bersaglio da piu'
     ferite sparivano intere raffiche. */
  const tot = (f.carried || 0) + wounds;
  const kills = Math.max(0, Math.min(f.targetModels || 0, Math.floor(tot / f.targetW)));
  return { ...f, notes, hit, follow, wound, save, ward, regen, wounds,
           kills, left: tot - kills * f.targetW };
}
