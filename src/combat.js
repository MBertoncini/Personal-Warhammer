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

import { hitMelee, woundOn, saveOn, pool, chance, rankBonus,
         leadershipTest, stat, weaponStrength, weaponAP, IMPOSSIBLE } from './rules.js';

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

const has = (u, re) => (u.rules || []).some(r => re.test(r));

/* Quante ferite d'urto porta una carica: il regolamento le lega al tipo
   di truppa, qui si sta prudenti e se ne conta una per modello della
   prima fila, che e' l'ordine di grandezza giusto. */
const impactHits = (side, front) => has(side, /impact hits|stomp/i) ? front : 0;

/* La schiera: quello che serve a tirare, e niente altro. `over` sono le
   correzioni fatte a mano nel pannello, che vincono sempre sul profilo
   perche' chi guarda il tavolo ne sa piu' del file. */
export function combatant(u, over = {}){
  /* chiamata due volte non ricomincia da capo: una schiera gia' fatta
     torna se stessa con le correzioni sopra */
  if (u && u.ref) return Object.assign({ ...u }, over);
  const st = u.stats || {};
  const melee = meleeWeapon(u);
  const alive = Math.max(0, (u.models || 1) - (u.lost || 0));
  const c = {
    ref: u, name: u.name, army: u.army,
    ws: stat(st.WS), bs: stat(st.BS), s: stat(st.S), t: stat(st.T),
    w: Math.max(1, stat(st.W) || 1), i: stat(st.I), a: Math.max(1, stat(st.A) || 1),
    ld: stat(st.Ld),
    models: Math.max(1, alive), frontage: Math.max(1, u.frontage || 1),
    /* la forza d'unita' per modello: quando cadono i modelli deve calare
       anche lei, altrimenti a fine assalto un reggimento dimezzato
       continuerebbe a contare come "siamo di piu'" */
    usPer: (u.us || u.models || 1) / Math.max(1, u.models || 1),
    armour: u.armour || 0, ward: u.ward || 0,
    ap: melee ? weaponAP(melee) : 0,
    weapon: melee ? melee.name : "",
    loose: !!u.loose, rules: u.rules || [],
    standard: false, charged: false, flank: "", spill: 0,
  };
  if (melee) c.s = weaponStrength(melee, c.s);
  return Object.assign(c, over);
}

/* Quanti si toccano davvero: la prima fila e' larga quanto la piu'
   stretta delle due, e una fila dietro appoggia con un colpo a testa.
   E' l'ordine di grandezza del tavolo, e nel pannello si corregge. */
export function contact(att, def){
  const front = Math.max(1, Math.min(att.frontage, def.frontage, att.models));
  const support = Math.min(front, Math.max(0, att.models - att.frontage));
  return { front, support, attacks: front * att.a + support };
}

/* ============================================================
   2 · UN COLPO
   ============================================================ */
export function strike(att, def, { attacks, auto = false, strength, ap, label = "" } = {}){
  /* `forcedAttacks` e' il numero corretto a mano nel pannello: chi
     guarda il tavolo vede quanti si toccano meglio di qualsiasi conto */
  const n = Math.max(0, attacks ?? att.forcedAttacks ?? contact(att, def).attacks);
  const S = strength ?? att.s;
  const AP = ap ?? att.ap;

  const hitNeed = auto ? 0 : hitMelee(att.ws, def.ws);
  const hit = auto ? { dice: [], hits: n, need: 0, of: n } : pool(n, hitNeed);

  const woundNeed = woundOn(S, def.t);
  const wound = pool(hit.hits, woundNeed);

  const saveNeed = saveOn(def.armour, AP);
  const save = pool(wound.hits, saveNeed);
  const through = wound.hits - save.hits;

  const wardNeed = saveOn(def.ward, 0);
  const ward = pool(through, wardNeed);

  return { label, attacks: n, strength: S, ap: AP,
           hit, wound, save, ward, wounds: through - ward.hits };
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
   ============================================================ */
const clone = c => ({ ...c, spill: 0 });

export function meleeRound(A, B){
  const a = clone(A), b = clone(B);
  const steps = [];
  const done = { A: 0, B: 0 };          // ferite inflitte da ciascuno

  const blow = (att, def, tag, opts) => {
    if (def.models <= 0 || att.models <= 0) return;
    const r = strike(att, def, opts);
    const kills = applyWounds(def, r.wounds);
    done[tag] += r.wounds;
    steps.push({ side: tag, name: att.name, ...r, kills });
  };

  /* prima l'urto della carica, che arriva addosso senza tirare per colpire */
  for (const [att, def, tag] of [[a, b, "A"], [b, a, "B"]]){
    const n = att.charged ? impactHits(att, contact(att, def).front) : 0;
    if (n) blow(att, def, tag, { attacks: n, auto: true, label: "urto della carica" });
  }

  /* poi si mena, in ordine di Iniziativa; a parita' si mena insieme e le
     perdite non tolgono attacchi a nessuno dei due */
  if (a.i === b.i){
    const ra = strike(a, b, { label: "colpi" }), rb = strike(b, a, { label: "colpi" });
    const ka = applyWounds(b, ra.wounds), kb = applyWounds(a, rb.wounds);
    done.A += ra.wounds; done.B += rb.wounds;
    steps.push({ side: "A", name: a.name, ...ra, kills: ka, together: true });
    steps.push({ side: "B", name: b.name, ...rb, kills: kb, together: true });
  } else {
    const first  = a.i > b.i ? ["A", a, b] : ["B", b, a];
    const second = first[0] === "A" ? ["B", b, a] : ["A", a, b];
    blow(first[1],  first[2],  first[0],  { label: "colpi" });
    blow(second[1], second[2], second[0], { label: "colpi" });
  }

  const cr = resolution(a, b, done);
  const wiped = a.models <= 0 ? "A" : b.models <= 0 ? "B" : "";
  let test = null;
  if (!wiped && cr.loser){
    const side = cr.loser === "A" ? a : b;
    test = { side: cr.loser, ...leadershipTest(side.ld, cr.diff) };
  }
  return { a, b, steps, cr, test, wiped, done,
           killsA: A.models - a.models, killsB: B.models - b.models };
}

/* Il conto di fine assalto. Le voci sono quelle che al tavolo si contano
   sulle dita: ferite, ranghi, stendardo, chi e' in piu', il fianco. */
export function resolution(a, b, done){
  const us = c => c.usPer * c.models;
  const score = (me, foe, wounds) => {
    const rank  = rankBonus(me.models, me.frontage);
    const std   = me.standard ? 1 : 0;
    const out   = us(me) > us(foe) ? 1 : 0;
    const flank = me.flank === "rear" ? 2 : me.flank === "flank" ? 1 : 0;
    return { wounds, rank, std, out, flank, total: wounds + rank + std + out + flank };
  };
  const A = score(a, b, done.A), B = score(b, a, done.B);
  const diff = Math.abs(A.total - B.total);
  const loser = A.total === B.total ? "" : (A.total > B.total ? "B" : "A");
  return { A, B, diff, loser, winner: loser ? (loser === "A" ? "B" : "A") : "" };
}

/* ============================================================
   4 · CINQUECENTO ASSALTI
   Un assalto solo non dice niente: i dadi fanno quello che vogliono.
   Ripetuto molte volte diventa la risposta alla domanda vera, che e'
   "conviene?".
   ============================================================ */
export function odds(A, B, n = 500){
  const out = { n, winA: 0, winB: 0, draw: 0, breakA: 0, breakB: 0,
                killsA: 0, killsB: 0, wipeA: 0, wipeB: 0 };
  for (let k = 0; k < n; k++){
    const r = meleeRound(A, B);
    if (r.cr.winner === "A") out.winA++;
    else if (r.cr.winner === "B") out.winB++;
    else out.draw++;
    if (r.test && !r.test.passed) out["break" + r.test.side]++;
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
  const h = hitMelee(att.ws, def.ws), w = woundOn(att.s, def.t);
  const sv = saveOn(def.armour, att.ap), wd = saveOn(def.ward, 0);
  const wounds = n * chance(h) * chance(w) * (1 - chance(sv)) * (1 - chance(wd));
  return { attacks: n, hitNeed: h, woundNeed: w, saveNeed: sv, wardNeed: wd,
           wounds, kills: wounds / def.w };
}

/* ============================================================
   5 · IL TIRO
   Stessa catena, un anello in meno (niente Iniziativa, niente ranghi):
   quanti tirano, con che punteggio, e quanti ne restano a terra.
   ============================================================ */

/* I modificatori che si contano davvero prima di tirare. Ognuno porta la
   sua etichetta, cosi' il pannello puo' dire *perche'* serve un 5. */
export function shootMods({ long = false, moved = false, cover = "", looseTarget = false } = {}){
  const list = [];
  if (long) list.push({ v: -1, why: "lunga gittata" });
  if (moved) list.push({ v: -1, why: "ha mosso" });
  if (cover === "soft") list.push({ v: -1, why: "copertura leggera" });
  if (cover === "hard") list.push({ v: -2, why: "copertura pesante" });
  if (looseTarget) list.push({ v: -1, why: "bersaglio sciolto" });
  return { list, total: list.reduce((s, m) => s + m.v, 0) };
}

/* Quanti modelli possono tirare: la prima fila sempre, la seconda solo
   se c'e'. In formazione sciolta tirano tutti. */
export function shooters(u){
  const alive = Math.max(0, (u.models || 1) - (u.lost || 0));
  if (u.loose) return alive;
  return Math.min(alive, Math.max(1, u.frontage || 1) * 2);
}

export function shootForecast(shooter, target, { weapon, mods = 0, shots } = {}){
  const bs = stat((shooter.stats || {}).BS);
  const n = shots ?? shooters(shooter);
  const need = bs ? Math.max(2, Math.min(6, Math.max(2, 7 - bs) - mods)) : IMPOSSIBLE;
  const S = weaponStrength(weapon, stat((shooter.stats || {}).S));
  const AP = weaponAP(weapon);
  const t = combatant(target);
  const wNeed = woundOn(S, t.t), sNeed = saveOn(t.armour, AP), kNeed = saveOn(t.ward, 0);
  const wounds = n * chance(need) * chance(wNeed) * (1 - chance(sNeed)) * (1 - chance(kNeed));
  return { shots: n, hitNeed: need, strength: S, ap: AP,
           woundNeed: wNeed, saveNeed: sNeed, wardNeed: kNeed,
           wounds, kills: wounds / t.w, targetW: t.w };
}

/* e la stessa raffica tirata sul serio */
export function shootRoll(shooter, target, opts){
  const f = shootForecast(shooter, target, opts);
  const hit = pool(f.shots, f.hitNeed);
  const wound = pool(hit.hits, f.woundNeed);
  const save = pool(wound.hits, f.saveNeed);
  const through = wound.hits - save.hits;
  const ward = pool(through, f.wardNeed);
  const wounds = through - ward.hits;
  return { ...f, hit, wound, save, ward, wounds, kills: Math.floor(wounds / f.targetW) };
}
