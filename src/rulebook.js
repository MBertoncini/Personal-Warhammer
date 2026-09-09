/* Schieramento Old World — le regole speciali che spostano un dado
 *
 * Le liste di New Recruit portano molte piu' regole di quante un
 * assalto ne usi: schermaglia, volo, paura, stupidita', un dominio di
 * magia. Alcune cambiano davvero il tiro che si sta per fare — il sei
 * naturale che avvelena, la perforazione che migliora, l'attacco in
 * piu' quando si carica — e altre si giocano in momenti che il
 * calcolo di un assalto non attraversa nemmeno.
 *
 * Il punto di questo modulo e' la terza categoria: quelle che l'app
 * non conosce. Una regola non riconosciuta non sparisce, viene
 * elencata. Un conto che dice "sette regole lette, tre applicate,
 * quattro no e sono queste" si sa quanto vale; uno che ne applica tre
 * in silenzio sembra completo e non lo e'.
 *
 * Qui dentro non ci sono dadi tirati ne' stato: entrano nomi di regole
 * scritti dal file, esce un pugno di flag e tre elenchi.
 */

/* il numero fra parentesi: "Armour Bane (1, Cold One only)" -> 1 */
const num = (s, dflt = 1) => {
  const m = /\(\s*(\d+)/.exec(String(s));
  return m ? +m[1] : dflt;
};
/* Il dado fra parentesi: "(D3)" -> un D3, "(2D6)" -> due, "(D3+1)" ->
   un D3 e uno fisso, "(2)" -> due secchi.

   Il "+1" mancava, e non era un caso di scuola: fra le dieci liste
   salvate ci sono "Impact Hits (D3+1)", "Impact Hits (D6+1)" e "Stomp
   Attacks (D3+1)", e tutte e tre cascavano fuori da questa lettura
   finendo nel ripiego «una ferita per modello di fronte» — che per un
   carro e' generoso e per un mostro solo e' assurdo, cioe' esattamente
   l'errore che il ripiego doveva evitare. */
function amount(s){
  const m = /\(\s*(?:(\d+)\s*)?d(\d+)\s*(?:([+-])\s*(\d+)\s*)?\)/i.exec(String(s));
  if (m) return {
    die: +m[2],
    times: m[1] ? +m[1] : 1,
    plus: m[3] ? (m[3] === "-" ? -(+m[4]) : +m[4]) : 0,
  };
  const n = /\(\s*(\d+)\s*\)/.exec(String(s));
  return n ? { flat: +n[1] } : null;
}

/* ============================================================
   1 · QUELLO CHE IL CALCOLO SA FARE
   ============================================================ */
export const RULEBOOK = [
  { id:"furiousCharge", re:/^furious charge/i,
    what:"un attacco in piu' per modello nel turno in cui carica",
    on: f => { f.furiousCharge = true; } },

  { id:"poisoned", re:/^poison(ed)? attacks/i,
    what:"il 6 naturale per colpire da +2 al tiro per ferire",
    on: f => { f.poisoned = true; } },

  { id:"armourBane", re:/^armou?r bane/i,
    what:"il 6 naturale per ferire migliora la perforazione",
    on: (f, name) => { f.armourBane = Math.max(f.armourBane, num(name, 1)); } },

  { id:"killingBlow", re:/^killing blow/i,
    what:"il 6 naturale per ferire salta l'armatura",
    on: f => { f.killingBlow = true; } },

  { id:"obsidian", re:/^obsidian blades/i,
    what:"l'arma a una mano perfora di 1",
    on: f => { f.handWeaponAP = Math.max(f.handWeaponAP, 1); } },

  { id:"impact", re:/^(impact hits|stomp|thunderstomp)/i,
    what:"ferite d'urto alla carica, senza tirare per colpire",
    on: (f, name) => { f.impact = amount(name) || { perFront: 1 }; } },

  { id:"extraRank", re:/^fight in (an )?extra rank/i,
    what:"combatte una fila in piu'",
    on: f => { f.extraRank = true; } },

  { id:"strikeLast", re:/^strikes? last/i,
    what:"mena per ultimo qualunque sia l'Iniziativa",
    on: f => { f.strikeLast = true; } },

  { id:"strikeFirst", re:/^(always )?strikes? first/i,
    what:"mena per primo qualunque sia l'Iniziativa",
    on: f => { f.strikeFirst = true; } },

  { id:"stubborn", re:/^stubborn/i,
    what:"il test di rotta si fa senza lo scarto del combattimento",
    on: f => { f.stubborn = true; } },

  { id:"unbreakable", re:/^unbreakable/i,
    what:"non fa test di rotta",
    on: f => { f.unbreakable = true; } },

  /* Non fa niente qui perche' e' gia' stata fatta: il valore d'armatura
     che arriva dal file la contiene. Sta in elenco lo stesso, altrimenti
     comparirebbe fra le regole che l'app non conosce. */
  { id:"armouredHide", re:/^armou?red hide/i,
    what:"gia' contata dentro il valore d'armatura",
    on: () => {} },
];

/* ============================================================
   2 · QUELLO CHE NON PASSA DI QUI
   Non sono regole ignote: sono regole che si giocano in un momento che
   un assalto simulato non attraversa. Dirlo per esteso vale piu' che
   tacerle, perche' e' la differenza fra "l'app non la conosce" e "non
   c'entra con questo conto".
   ============================================================ */
export const ELSEWHERE = [
  { re:/^cold blooded/i,      why:"vale sui test di Paura, Panico e Terrore, non sul test di rotta" },
  { re:/^(fear|terror)/i,     why:"si gioca alla dichiarazione della carica" },
  { re:/^(stupidity|frenzy|hatred|animosity)/i, why:"e' un test di psicologia, prima del contatto" },
  { re:/^(skirmish|loose formation|open order|close order)/i, why:"e' una formazione: cambia la sagoma sul tavolo, non i dadi" },
  { re:/^(fly|swiftstride|fast cavalry|move through cover|aquatic|scout|vanguard|ambush|swim)/i,
    why:"riguarda il movimento" },
  { re:/^(requires two hands)/i, why:"e' una scelta di equipaggiamento: decidi tu quale arma impugna" },
  { re:/^(move (and|&) shoot|quick shot|multiple shots|volley fire)/i, why:"riguarda il tiro, non la mischia" },
  { re:/^(general|battle standard|rallying cry|arcane vassal|lore of|wizard|channel)/i,
    why:"comando o magia: fuori dal conto di un assalto" },
  { re:/^(large target|unit strength|drop rocks|breath weapon|regenerat)/i,
    why:"non entra nella risoluzione di una mischia" },
];

/* ============================================================
   3 · LA LETTURA
   ============================================================ */
export const emptyFlags = () => ({
  furiousCharge:false, poisoned:false, armourBane:0, killingBlow:false,
  handWeaponAP:0, impact:null, extraRank:false,
  strikeFirst:false, strikeLast:false, stubborn:false, unbreakable:false,
});

/* Le regole dell'arma arrivano come una riga sola, separate da virgola:
   "Armour Bane (1), Requires Two Hands, Strike Last". */
export const splitWeaponRules = s =>
  String(s || "").split(/\s*[,;]\s*/).map(x => x.trim()).filter(Boolean);

/* Molte regole vivono dentro una parentesi che le limita: "Poisoned
   Attacks (javelins only)", "Armour Bane (1, Cold One only)". Applicarle
   sempre vuol dire avvelenare anche i morsi in mischia di uno skink che
   il veleno ce l'ha solo sui giavellotti. Qui si legge il vincolo e lo
   si confronta con l'arma che l'unita' sta davvero impugnando. */
function limitOf(name){
  const par = /\(([^)]*)\)/.exec(name);
  if (!par) return "";
  const inside = par[1].replace(/^\s*\d+\s*,?\s*/, "").trim();
  return /\bonly\b|\bsolo\b|\bsoltanto\b/i.test(inside)
    ? inside.replace(/\bonly\b|\bsolo\b|\bsoltanto\b/ig, "").trim()
    : "";
}
const singular = s => s.replace(/(ies)$/i, "y").replace(/s$/i, "");
function limitMet(limit, weapon){
  if (!limit) return true;
  if (!weapon) return null;                   // non si sa: si applica, ma lo si dice
  const hay = singular(String(weapon).toLowerCase());
  return limit.toLowerCase().split(/\s+/)
    .some(w => w.length >= 3 && hay.includes(singular(w)));
}

/* names: le regole dell'unita'. weapons: quelle dell'arma che sta
   usando davvero, che sono altrettanto vincolanti e prima venivano
   lette e poi buttate. weapon: come si chiama quell'arma. */
export function readRules(names = [], weapons = [], weapon = ""){
  const flags = emptyFlags();
  const applied = [], elsewhere = [], unknown = [];
  const seen = new Set();

  for (const raw of [...names, ...weapons]){
    const name = String(raw || "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    const hit = RULEBOOK.find(r => r.re.test(name));
    if (hit){
      const limit = limitOf(name);
      const met = limitMet(limit, weapon);
      if (met === false){ elsewhere.push({ name, why: "vale solo per " + limit }); continue; }
      hit.on(flags, name);
      applied.push({ name, what: hit.what, caveat: met === null ? "solo per " + limit : "" });
      continue;
    }

    const out = ELSEWHERE.find(r => r.re.test(name));
    if (out) elsewhere.push({ name, why: out.why });
    else unknown.push({ name });
  }
  return { flags, applied, elsewhere, unknown };
}
