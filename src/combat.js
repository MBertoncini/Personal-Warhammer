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
  /* I personaggi uniti, ognuno con il suo profilo (vedi sotto). Si
     calcolano dopo le correzioni del pannello perche' «ha caricato» e
     «e' disordinata» valgono anche per loro. */
  if (out.retinue == null) out.retinue = retinueOf(over.joined || [], out);
  return out;
}

/* ============================================================
   1b · I PERSONAGGI UNITI
   Un personaggio dentro un reggimento non e' un modello in piu' del
   reggimento: e' un profilo diverso nella stessa scatola. Il capo
   Orco ha quattro Attacchi di Forza 5 dove i suoi ne hanno uno di
   Forza 3, e per tutte le tappe fin qui l'assalto lo ha ignorato —
   i personaggi entravano solo nella psicologia e nel bonus dello
   stendardo, e i loro colpi sparivano.

   Sparivano in un modo che si nota poco e pesa molto: un Big Boss con
   l'ascia in un mob da venti spostava il risultato dell'assalto di due
   o tre punti, e il pannello diceva che il mob aveva perso.

   Qui ognuno diventa una **squadra**: un gruppo con i suoi Attacchi,
   la sua Abilita' Combattimento, la sua Forza, la sua Iniziativa e la
   sua arma. Mena quando tocca a lui, che non e' quando tocca al
   reggimento, e le sue ferite si sommano al conto dell'assalto.

   Quello che resta ai giocatori, ed e' scritto nel pannello: **a chi
   si assegnano le ferite in arrivo**. La Resistenza del personaggio e'
   diversa da quella dei suoi, ma chi incassa il colpo lo decide il
   manuale insieme al giocatore che possiede l'unita' — non un conto.
   ============================================================ */
export function retinueOf(joined = [], host = null){
  const out = [];
  for (const ch of joined || []){
    if (!ch || ch.dead) continue;
    const melee = meleeWeapon(ch);
    const army = armyFor(ch);
    const read = readRules(ch.rules || [], splitWeaponRules(melee && melee.rules),
                           melee ? melee.name : "", ch.ruleText || null, army);
    const baseS = val(ch, "S");
    const g = {
      character: true,
      name: ch.name, ref: ch,
      ws: val(ch, "WS"), i: val(ch, "I"),
      a: Math.max(1, val(ch, "A") || 1),
      baseS, s: melee ? weaponStrength(melee, baseS) : baseS,
      t: val(ch, "T"), w: Math.max(1, val(ch, "W") || 1),
      ap: melee ? weaponAP(melee) : 0,
      weapon: melee ? melee.name : "",
      flags: read.flags,
      models: 1,
      /* la carica e il disordine sono dell'unita' in cui sta: il
         personaggio e' arrivato con lei */
      charged: host ? !!host.charged : false,
      chargeInches: host ? host.chargeInches || 0 : 0,
      chargeArc: host ? host.chargeArc || "fronte" : "fronte",
      disordered: host ? !!host.disordered : false,
      feared: host ? !!host.feared : false,
    };
    g.frenzyA = PS.frenzyBonus({ p: PS.psychOf(ch), chargedThisTurn: !!g.charged }).a;
    out.push(g);
  }
  return out;
}

/* Gli attacchi che questo modello porta adesso: la caratteristica del
   profilo piu' quello che la carica furiosa aggiunge — e la carica
   furiosa vuole i suoi tre pollici di corsa, come l'urto. */
const attacksOf = c => (c.a || 1) + (ranIn(c) && c.flags && c.flags.furiousCharge ? 1 : 0) +
                       /* la Frenzy non vuole i tre pollici: le basta aver
                          caricato, o aver inseguito il turno prima */
                       (c.frenzyA || 0);

/* ------------------------------------------------------------------
   Quanti menano, e con quanti dadi.

   La prima fila e' larga quanto la piu' stretta delle due, e una fila
   dietro appoggia con un colpo a testa. Quello che mancava sono due
   cose che al tavolo si vedono e qui si tiravano a indovinare:

   - **quanti si toccano davvero**. Due reggimenti che si incontrano
     d'angolo si toccano con tre modelli, non con la larghezza piena, e
     `touching` e' il conto che il tavolo sa fare guardando le basette.
     Senza, resta la stima di prima, che e' onesta e generosa.
   - **i personaggi occupano un posto**. Un capo in prima fila non e'
     un modello in piu': e' uno dei posti della fila, con un profilo
     diverso. Contarlo in mezzo ai suoi voleva dire dargli un attacco
     di Forza 3 invece di quattro di Forza 5, e insieme regalare al
     reggimento un modello che non c'e'.

   Torna sempre `attacks` — il totale della truppa, che e' quello che
   il pannello corregge a mano — piu' l'elenco delle squadre che
   menano, una per profilo.
   ------------------------------------------------------------------ */
export function contact(att, def, { touching = null } = {}){
  const retinue = att.retinue || [];
  /* Il conto del tavolo puo' arrivare come opzione o gia' scritto
     sulla schiera. E' due numeri, non uno: i soldati che toccano e
     **quali** personaggi toccano, perche' un capo in mezzo a una fila
     che sfiora il nemico con lo spigolo puo' benissimo non toccare
     niente, e i suoi quattro attacchi di Forza 5 non li tira. */
  const raw = touching != null ? touching : att.touching;
  const seen = raw && typeof raw === "object" ? raw
             : (+raw > 0 ? { models: +raw, chars: null } : null);
  const measured = !!seen;

  /* la larghezza a contatto: quella vera se il tavolo la sa dire,
     altrimenti la piu' stretta delle due prime file */
  const wide = measured
    ? Math.max(0, Math.min(seen.models, att.frontage, att.models))
    : Math.max(1, Math.min(att.frontage, def.frontage, att.models));

  /* Chi dei personaggi mena. Misurato, sono quelli che il tavolo ha
     visto toccare; stimato, si suppone che stiano in prima fila —
     e allora **occupano un posto** dei soldati invece di aggiungerne
     uno, perche' un capo in una fila da cinque e' uno dei cinque. */
  const fighting = measured
    ? (seen.chars ? retinue.filter(g => seen.chars.includes(g.ref && g.ref.uid)) : [])
    : retinue.slice(0, wide);
  const front = measured ? wide : Math.max(0, wide - fighting.length);

  /* Le file d'appoggio: una, oppure due con la lancia che permette di
     combattere in una fila in piu'. Ognuna appoggia con un colpo a
     testa, non con tutti i suoi attacchi. */
  const ranks = att.flags && att.flags.extraRank ? 2 : 1;
  const behind = Math.max(0, att.models - att.frontage);
  const support = Math.min(Math.max(1, wide) * ranks, behind);

  const groups = [];
  const rankA = front * attacksOf(att) + support;
  if (rankA > 0) groups.push({
    id:"rank", name: att.name, character:false, models: front,
    ws: att.ws, i: att.i, s: att.s, baseS: att.baseS, ap: att.ap,
    flags: att.flags, attacks: rankA, support,
  });
  fighting.forEach((g, k) => groups.push({
    ...g, id:"char" + k, support: 0,
    attacks: (g.a || 1) + (g.frenzyA || 0) +
             (g.charged && (g.chargeInches || 0) >= CHARGE_IMPETUS &&
              g.flags && g.flags.furiousCharge ? 1 : 0),
  }));

  return {
    front, wide, support, ranks, groups,
    inFront: fighting.length,
    /* i personaggi uniti che NON menano: sta scritto, perche' «e il
       capo dov'e' finito?» e' la prima domanda che si fa guardando il
       pannello */
    outOfContact: retinue.filter(g => !fighting.includes(g)).map(g => g.name),
    estimated: !measured,
    attacks: groups.reduce((n, g) => n + g.attacks, 0),
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

/* Da una schiera alle squadre che menano davvero: la truppa e ogni
   personaggio unito che sta in prima fila. Ognuna e' un profilo intero
   nella forma che `strike` si aspetta, cosi' non c'e' un secondo
   percorso per i personaggi — sarebbe il posto dove le regole speciali
   smettono di valere senza che nessuno se ne accorga.

   Le regole d'esercito e gli effetti a tempo restano quelli dell'unita'
   ospite: il Waaagh! acceso vale per il capo come per i suoi, mentre
   l'Odio e il Colpo Mortale sono roba sua e vengono dalle sue righe. */
export function strikersOf(att, def, tag){
  const c = contact(att, def);
  return c.groups.map(g => {
    const forced = g.character ? null : att.forcedAttacks;
    const n = forced != null ? forced : g.attacks;
    const who = g.character
      ? { ...att, name: g.name, ws: g.ws, i: g.i, s: g.s, baseS: g.baseS, ap: g.ap,
          weapon: g.weapon, models: 1, w: g.w,
          /* le sue regole, ma l'esercito dell'unita' in cui sta */
          flags: { ...g.flags, army: (att.flags || {}).army },
          retinue: [], forcedAttacks: null }
      : att;
    return { tag, g: { ...g, attacks: n }, who,
             label: g.character ? `${g.name} (personaggio)` : "colpi" };
  });
}

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
     carica (p. 146) — salvo chi ha un'arma che decide l'ordine da sola.
     Le squadre sono piu' di due: la truppa di ciascuna parte e ogni
     personaggio unito, che ha la sua Iniziativa e quindi il suo posto
     in fila. Chi sta sullo stesso gradino mena insieme, e le ferite di
     un gradino si applicano tutte alla fine di quel gradino: e' la
     regola dei colpi simultanei, ed e' quello che impedisce a un capo
     di uccidere un modello che nello stesso istante lo stava
     colpendo. */
  const order = ML.strikeOrder(a, b);
  const strikers = [
    ...strikersOf(a, b, "A"),
    ...strikersOf(b, a, "B"),
  ].map(x => ({ ...x, sp: ML.speedOf(x.who) }));
  /* prima il gradino dell'arma, poi l'Iniziativa: e' lo stesso ordine
     di `strikeOrder`, aperto a piu' di due contendenti */
  strikers.sort((p, q) => (q.sp.rank - p.sp.rank) || (q.sp.i - p.sp.i));

  let k = 0;
  while (k < strikers.length){
    const lvl = strikers[k].sp;
    const tier = [];
    while (k < strikers.length &&
           strikers[k].sp.rank === lvl.rank && strikers[k].sp.i === lvl.i) tier.push(strikers[k++]);
    const hits = [];
    for (const x of tier){
      const att = x.tag === "A" ? a : b, def = x.tag === "A" ? b : a;
      if (def.models <= 0 || att.models <= 0) continue;
      if (x.g.attacks <= 0) continue;
      hits.push({ x, r: strike(x.who, def, { attacks: x.g.attacks, label: x.label, round }) });
    }
    /* le ferite dopo, tutte insieme: dentro un gradino si mena nello
       stesso momento */
    for (const { x, r } of hits){
      const def = x.tag === "A" ? b : a;
      const kills = applyWounds(def, r.wounds);
      done[x.tag] += r.wounds;
      steps.push({ side: x.tag, name: x.who.name, character: !!x.g.character,
                   ...r, kills, together: tier.length > 1 });
    }
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
  /* Shieldwall (Tappa 5 bis): una volta per partita, nel turno in cui e'
     stata caricata. «E' stata caricata» qui e' «chi ha vinto ha
     caricato», che in un assalto a due e' la stessa cosa; l'ordine
     chiuso lo dice il tavolo, lo scudo in uso lo guarda chi gioca. */
  const shieldwall = !!f.shieldwall && !side.shieldwallUsed && !!winner.charged && !side.loose;
  const chances = ML.breakChances(side.ld, diff, { crushed, ldMod, shieldwall });
  const base = { side: tag, chances, crushed, terror: terror.why };
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
  const ca = ML.scoreCardOf(a, done.A), cb = ML.scoreCardOf(b, done.B);
  /* Impervious Defence e' una regola di chi viene preso di fianco, ma
     toglie il punto a chi lo prende: si scrive sulla scheda dell'altro. */
  if (b.flags && b.flags.impervious && ca.flank) ca.flankDenied = "Impervious Defence";
  if (a.flags && a.flags.impervious && cb.flank) cb.flankDenied = "Impervious Defence";
  return ML.combatResult(ca, cb);
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

/* La stessa cosa senza tirare: quante ferite ci si aspetta in media.
   Con un numero di attacchi dichiarato e' un profilo solo; senza, sono
   tutte le squadre che menano — la truppa e ogni personaggio unito —
   e le medie si sommano. La riga in cima resta quella della truppa,
   perche' e' quella che risponde a «con che punteggio colpisco». */
export function meleeForecast(att, def, attacks){
  if (attacks == null && (att.retinue || []).length){
    const parts = strikersOf(att, def, "A")
      .map(x => ({ x, f: oneForecast(x.who, def, x.g.attacks) }));
    const rank = parts.find(p => !p.x.g.character) || parts[0];
    return {
      ...rank.f,
      attacks: parts.reduce((n, p) => n + p.f.attacks, 0),
      wounds: parts.reduce((n, p) => n + p.f.wounds, 0),
      kills: parts.reduce((n, p) => n + p.f.kills, 0),
      groups: parts.map(p => ({ name: p.x.who.name, character: !!p.x.g.character, ...p.f })),
    };
  }
  return oneForecast(att, def, attacks ?? att.forcedAttacks ?? contact(att, def).attacks);
}

function oneForecast(att, def, n0){
  const n = n0;
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
  return { ...f, notes, hit, follow, wound, save, ward, regen, wounds, kills: Math.floor(wounds / f.targetW) };
}
