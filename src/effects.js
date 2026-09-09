/* Schieramento Old World — le caratteristiche, e da dove vengono
 *
 * A meta' partita nessuno ricorda piu' i modificatori. Non e' una
 * battuta: una benedizione lanciata al secondo turno, una maledizione
 * al terzo, una carica furiosa, un'arma a due mani, il fianco, il
 * terreno — e quando arriva il momento di tirare, la Forza che si usa
 * e' quella che qualcuno si ricorda, non quella vera.
 *
 * Questo modulo e' la risposta, ed e' una funzione sola:
 *
 *     statOf(unit, "S")  ->  { base: 3, value: 4, mods: [ … ] }
 *
 * dove `mods` dice **chi** ha messo quel +1 e **fino a quando**. Il
 * piano lo chiede al §3.3 e insiste che vada scritta presto: ogni
 * conto fatto prima di lei va ripassato dopo.
 *
 * Un effetto e' tre cose — chi, cosa, fino a quando — e niente altro:
 *
 *   { id, from:"Vento di Ghur", page:321,
 *     mods:{ S:+1, I:-1 }, flags:{ frenzy:true },
 *     until:{ turn:3 } }
 *
 * Non ci sono dadi qui dentro, e non c'e' DOM: entra un'unita', esce
 * un numero con la sua storia.
 */

/* ============================================================
   1 · LE CARATTERISTICHE
   ============================================================ */
export const CHARS = ["M","WS","BS","S","T","W","I","A","Ld"];
export const CHAR_LABEL = {
  M:"Movimento", WS:"Abilita' Combattimento", BS:"Abilita' Balistica",
  S:"Forza", T:"Resistenza", W:"Ferite", I:"Iniziativa",
  A:"Attacchi", Ld:"Comando",
};
/* Quelle che non stanno nel profilo ma si comportano allo stesso modo:
   un incantesimo che da' +1 all'armatura non e' diverso da uno che da'
   +1 alla Forza, e chi legge il numero non deve saperlo. */
export const DERIVED = ["armour","ward","regen","us"];
export const DERIVED_LABEL = {
  armour:"Armatura", ward:"Salvezza speciale", regen:"Rigenerazione", us:"Forza d'Unita'",
};

/* Il testo del file diventa numero: "4", "-", "*", "4+". Zero vuol
   dire «non ce l'ha», ed e' diverso da «non lo sappiamo» — ma il file
   non distingue, e fingere di saperlo sarebbe peggio. */
export const num = v => { const m = String(v ?? "").match(/-?\d+/); return m ? +m[0] : 0; };

/* Comando e Ferite non scendono sotto 1 finche' l'unita' e' viva; le
   altre non scendono sotto zero. Il manuale non lascia caratteristiche
   negative in giro. */
const FLOOR = { M:0, WS:0, BS:0, S:0, T:1, W:1, I:0, A:0, Ld:0 };

/* ============================================================
   2 · IL PROFILO DI BASE
   Un modello puo' averne due — il cavaliere e la cavalcatura, il carro
   e le bestie che lo tirano — e meta' delle regole d'esercito dice
   «questo vale per la cavalcatura, non per chi ci sta sopra». Senza il
   profilo diviso quelle regole non si possono nemmeno scrivere: e' la
   ragione per cui il §8.4 del piano lo mette fra le fondamenta.
   ============================================================ */
export function profileOf(u, who = "rider"){
  if (who === "mount") return (u && u.mount && u.mount.stats) || null;
  return (u && u.stats) || null;
}
export const hasMount = u => !!(u && u.mount && u.mount.stats);

/* Quale dei due profili vale per una data caratteristica. Il Movimento
   e' della cavalcatura — un Warboss a piedi fa 4, sul cinghiale fa 7 —
   e tutto il resto e' del cavaliere, che pero' porta anche gli attacchi
   della bestia come colpi a parte. */
export const MOUNT_WINS = ["M"];
export function whoOwns(u, key){
  if (!hasMount(u)) return "rider";
  return MOUNT_WINS.includes(key) ? "mount" : "rider";
}

export function baseOf(u, key){
  if (DERIVED.includes(key)) return +((u || {})[key]) || 0;
  const who = whoOwns(u, key);
  const p = profileOf(u, who) || profileOf(u, "rider") || {};
  return num(p[key]);
}

/* ============================================================
   3 · GLI EFFETTI
   ============================================================ */
export const effectsOf = u => Array.isArray(u && u.effects) ? u.effects : [];

export function addEffect(u, eff){
  if (!u || !eff) return u;
  u.effects = effectsOf(u).slice();
  /* lo stesso effetto dalla stessa fonte non si somma: il manuale dice
     che lo stesso incantesimo non si accumula su un bersaglio */
  const same = u.effects.findIndex(e => e.id && eff.id && e.id === eff.id && e.from === eff.from);
  if (same >= 0) u.effects[same] = { ...eff };
  else u.effects.push({ ...eff });
  return u;
}
export function removeEffect(u, id, from){
  if (!u) return u;
  u.effects = effectsOf(u).filter(e => !(e.id === id && (from == null || e.from === from)));
  return u;
}

/* `until` puo' essere: niente — dura finche' non lo si toglie a mano —
   la parola "combat", "turn" o "round" per le durate corte, oppure un
   momento preciso { turn, phase }. `now` e' il momento della partita, e
   arriva da game.js. */
export function expired(e, now){
  const u = e && e.until;
  if (!u || !now) return false;
  if (typeof u === "string"){
    const at = e.at || {};
    if (u === "combat") return !!now.combatOver;
    if (u === "turn")   return now.turn > (at.turn ?? now.turn) || (at.side != null && now.side !== at.side);
    if (u === "round")  return now.round > (at.round ?? now.round);
    return false;
  }
  if (u.turn != null && now.turn > u.turn) return true;
  if (u.turn != null && now.turn === u.turn && u.phase != null && now.phaseIndex > u.phase) return true;
  return false;
}
export function sweepExpired(u, now){
  const before = effectsOf(u);
  const gone = before.filter(e => expired(e, now));
  if (gone.length) u.effects = before.filter(e => !expired(e, now));
  return gone;
}

/* ============================================================
   4 · LA FUNZIONE
   ============================================================ */
/* Torna sempre la stessa forma, anche quando non c'e' niente da dire:
   chi la legge non deve mai chiedersi se il campo esiste.

   `who` serve solo quando c'e' la cavalcatura e si vuole per forza il
   suo numero — «quanto mena il cinghiale», che e' esattamente la
   domanda della Carica delle Zanne degli Orchi. */
export function statOf(u, key, { who = null, now = null } = {}){
  const owner = who || whoOwns(u, key);
  const base = owner === "mount" && hasMount(u)
    ? num((profileOf(u, "mount") || {})[key])
    : baseOf(u, key);
  const mods = [];
  let value = base;

  for (const e of effectsOf(u)){
    if (now && expired(e, now)) continue;
    if (e.who && e.who !== owner) continue;
    const m = e.mods && e.mods[key];
    if (m == null) continue;
    const set = (typeof m === "object" && m.set != null) ? +m.set : null;
    const delta = typeof m === "number" ? m : (+m.add || 0);
    if (set != null){
      mods.push({ from: e.from || e.id || "effetto", delta: set - value, set, page: e.page || 0, until: e.until || null });
      value = set;
    } else if (delta){
      mods.push({ from: e.from || e.id || "effetto", delta, page: e.page || 0, until: e.until || null });
      value += delta;
    }
  }

  const floor = DERIVED.includes(key) ? 0 : (FLOOR[key] ?? 0);
  const capped = base === 0 && !mods.length ? 0 : Math.max(floor, value);
  if (capped !== value) mods.push({ from: "minimo di profilo", delta: capped - value, page: 0, until: null });

  return { key, base, value: capped, mods, owner: hasMount(u) ? owner : "", changed: capped !== base };
}

/* Il numero e basta, per chi non ha bisogno della storia */
export const val = (u, key, opt) => statOf(u, key, opt).value;

/* La storia in una riga, per l'ispettore e per il registro:
   «Forza 4 (3 base, +1 Vento di Ghur)» */
export function explain(u, key, opt){
  const s = statOf(u, key, opt);
  const label = CHAR_LABEL[key] || DERIVED_LABEL[key] || key;
  if (!s.mods.length) return label + " " + s.value;
  const bits = s.mods.map(m => (m.set != null ? "= " + m.set : (m.delta > 0 ? "+" : "") + m.delta) +
                               " " + m.from + (m.page ? " (p. " + m.page + ")" : ""));
  return label + " " + s.value + " (" + s.base + " base, " + bits.join(", ") + ")";
}

/* Tutto il profilo in un colpo, gia' spiegato: e' quello che
   l'ispettore mostra e quello che il registro annota a fine turno. */
export function sheet(u, opt){
  const out = {};
  for (const k of CHARS) out[k] = statOf(u, k, opt);
  for (const k of DERIVED) out[k] = statOf(u, k, opt);
  return out;
}

/* ============================================================
   5 · LE BANDIERINE
   Gli effetti non spostano solo numeri: accendono e spengono regole.
   «non puo' marciare», «ritira gli 1 per colpire», «immune al
   panico». Stessa forma, stessa traccia.
   ============================================================ */
export function flagsOf(u, now = null){
  const flags = {}, why = {};
  for (const e of effectsOf(u)){
    if (now && expired(e, now)) continue;
    for (const [k, v] of Object.entries(e.flags || {})){
      flags[k] = v;
      (why[k] = why[k] || []).push(e.from || e.id || "effetto");
    }
  }
  return { flags, why };
}

/* ============================================================
   6 · QUELLO CHE SI USA UNA VOLTA SOLA
   «Una volta per partita, poi e' finito»: il Waaagh! degli Orchi, la
   Sfera di Ottone e lo Skavenbrew degli Skaven, meta' degli oggetti
   magici di ogni army book. E' uno stato di partita, non una
   caratteristica, e sta qui perche' deve finire nelle copie che fa
   `history.js` — altrimenti l'annulla non lo riporta indietro.
   ============================================================ */
export const spent = (u, id) => !!(u && u.spent && u.spent[id]);
export function spend(u, id){
  if (!u || spent(u, id)) return false;
  u.spent = { ...(u.spent || {}), [id]: true };
  return true;
}
export function unspend(u, id){
  if (!u || !u.spent) return;
  const s = { ...u.spent };
  delete s[id];
  u.spent = s;
}
