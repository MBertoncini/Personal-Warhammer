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

import { psychRule } from './psych.js';
import { ruleFor, applies } from './armies.js';

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

  /* Ferite d'urto e pestoni erano la stessa riga, e sono due regole
     diverse che si risolvono in due momenti opposti dell'assalto. Il
     testo che le liste salvate portano con se' lo dice in chiaro:
     l'urto lo fa «un modello che ha caricato muovendo 3″ o piu'» e si
     risolve *prima* delle sfide; il pestone lo fa chiunque sia a
     contatto di basetta e si fa *per ultimo, dopo tutti gli altri
     attacchi, compresi quelli a Iniziativa 1».

     Fuse in un flag solo, un mostro che ha tutte e due ne perdeva una
     — la seconda lettura sovrascriveva la prima — e i pestoni
     arrivavano all'inizio invece che alla fine, cioe' colpivano
     modelli che a quel punto erano gia' a terra. */
  { id:"impact", re:/^impact hits/i,
    what:"ferite d'urto alla carica, senza tirare per colpire",
    on: (f, name) => { f.impact = amount(name) || { perFront: 1 }; } },

  { id:"stomp", re:/^(stomp|thunderstomp)/i,
    what:"pestoni alla fine di tutto, senza tirare per colpire",
    on: (f, name) => { f.stomp = amount(name) || { flat: 1 }; } },

  { id:"hatred", re:/^hatred/i,
    what:"ritira i colpi mancati nel primo assalto",
    on: f => { f.hatred = true; } },

  { id:"battleStandard", re:/^battle standard/i,
    what:"+1 al risultato del combattimento, e si somma allo stendardo",
    on: f => { f.battleStandard = true; } },

  { id:"extraRank", re:/^fight in (an )?extra rank/i,
    what:"combatte una fila in piu'",
    on: f => { f.extraRank = true; } },

  { id:"strikeLast", re:/^strikes? last/i,
    what:"mena per ultimo qualunque sia l'Iniziativa",
    on: f => { f.strikeLast = true; } },

  { id:"strikeFirst", re:/^(always )?strikes? first/i,
    what:"mena per primo qualunque sia l'Iniziativa",
    on: f => { f.strikeFirst = true; } },

  /* Queste due dicevano tutte e due una cosa che nel manuale non c'e'
     piu', e la dicevano con la sicurezza di una riga di codice. Il
     testo vero sta nelle liste salvate, e sono due regole del test di
     rotta a tre esiti:

       Stubborn — «la prima volta che deve fare un test di rotta puo'
       scegliere di non farlo, e ripiega in ordine». Non e' un test al
       Comando pieno: e' saltare il test, una volta per partita.

       Unbreakable — «non deve fare il test di rotta: cede terreno,
       spinta indietro dal nemico». Non e' restare fermi. */
  { id:"stubborn", re:/^stubborn/i,
    what:"una volta per partita puo' saltare il test di rotta e ripiegare in ordine",
    on: f => { f.stubborn = true; } },

  { id:"unbreakable", re:/^unbreakable/i,
    what:"non fa test di rotta: cede terreno e basta",
    on: f => { f.unbreakable = true; } },

  /* Tre regole della Tappa 5 bis. Stanno su unita' di un esercito
     preciso — i Night Goblin, la Temple Guard, il Bastiladon — ma il
     loro testo non nomina nessun esercito, quindi stanno qui e non in un
     file di `dati/eserciti/`: un'unita' di un altro libro che le porta
     le trova gia' pronte.

       Horde — «puo' aumentare di uno il bonus di ranghi massimo che il
       suo tipo di truppa le concede». Sono le Night Goblin Mobs, e il
       quarto rango e' la ragione per cui si schierano da quaranta.

       Shieldwall — «una volta per partita, nel turno in cui e' stata
       caricata, in ordine chiuso e con gli scudi, puo' cedere terreno
       invece di ripiegare in ordine». Il conto la gioca da solo, perche'
       cedere e' sempre meglio; lo scudo in uso e l'ordine chiuso li
       guarda chi gioca.

       Impervious Defence — «i nemici non prendono i punti di fianco o
       di retro per essere a contatto con questo modello». */
  { id:"horde", re:/^horde\b/i,
    what:"un rango in piu' di bonus massimo rispetto al suo tipo di truppa",
    on: f => { f.horde = true; } },

  { id:"shieldwall", re:/^shieldwall/i,
    what:"una volta per partita, se caricata, cede terreno invece di ripiegare in ordine",
    on: f => { f.shieldwall = true; } },

  { id:"impervious", re:/^impervious defen[cs]e/i,
    what:"chi la prende di fianco o di retro non ne ha il bonus nel risultato",
    on: f => { f.impervious = true; } },

  /* Le cinque che hanno portato le liste «fun», dai cataloghi della
     comunita' (Renegades). Il testo per esteso sta dentro le liste, e
     nessuna nomina un esercito: stanno qui come le altre universali.

       Massed Infantry — «se una parte ha Forza d'Unita' piu' alta
       dell'altra e comprende almeno un'unita' con questa regola, prende
       +1 al risultato». Una volta per parte, non una per unita'.

       Parry — «in corpo a corpo, chi usa arma a una mano e scudo
       migliora l'armatura di 1, fino a 3+». Lo scudo il file non lo
       dice: lo dice la scheda di preparazione, o il parser da quando
       lo legge.

       Press of Battle — «tranne nel turno in cui ha caricato, la fila
       che combatte di un'unita' in ordine di combattimento e' profonda
       due ranghi»: la seconda fila mena con tutti i suoi attacchi, e
       l'appoggio viene dalla terza.

       Predatory Fighter — «un attacco in piu' per ogni 6 naturale per
       colpire in corpo a corpo», il modello e non la cavalcatura, e gli
       attacchi nati cosi' non ne generano altri.

       Skink Riders — «gli attacchi contro questa unita' si risolvono
       contro l'Abilita' di Combattimento piu' alta fra cavaliere,
       equipaggio e mostro». */
  { id:"massedInfantry", re:/^massed infantry/i,
    what:"+1 al risultato se la sua parte ha più Forza d'Unità",
    on: f => { f.massedInfantry = true; } },

  { id:"parry", re:/^parry\b/i,
    what:"in mischia, con arma a una mano e scudo, +1 all'armatura (fino a 3+)",
    on: f => { f.parry = true; } },

  { id:"pressOfBattle", re:/^press of battle/i,
    what:"tranne nel turno in cui carica, combatte con due ranghi pieni",
    on: f => { f.pressOfBattle = true; } },

  { id:"predatory", re:/^predatory fighter/i,
    what:"ogni 6 naturale per colpire in mischia dà un attacco in più",
    on: f => { f.predatory = true; } },

  { id:"skinkRiders", re:/^skink riders/i,
    what:"chi la colpisce guarda l'Abilità di Combattimento più alta fra bestia ed equipaggio",
    on: f => { f.skinkRiders = true; } },

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
  /* Paura, Terrore, Frenzy, Stupidita', Sangue Freddo e le altre della
     psicologia stavano qui con una frase sola — «si gioca alla
     dichiarazione della carica». Dalla Tappa 5 si giocano davvero, e la
     riga la scrive `psych.js`, che sa dire dove. */
  { re:/^animosity/i, why:"e' un test di psicologia, prima del contatto" },
  { re:/^magical attacks/i,
    why:"conta contro chi ha regole sugli attacchi magici: nessuna, nel conto di un assalto" },
  { re:/^(skirmish|loose formation|open order|close order)/i, why:"e' una formazione: cambia la sagoma sul tavolo, non i dadi" },
  { re:/^(fly|swiftstride|fast cavalry|move through cover|aquatic|scout|vanguard|ambush|swim)/i,
    why:"riguarda il movimento" },
  { re:/^(requires two hands)/i, why:"e' una scelta di equipaggiamento: decidi tu quale arma impugna" },
  /* Queste quattro non sono piu' «da qualche altra parte» e basta: dalla
     Tappa 4 il posto ce l'hanno, ed e' `shoot.js`. Restano qui perche'
     in un conto di mischia non entrano davvero, ma la riga dice dove
     sono finite invece di lasciarle nel vago. */
  { re:/^(move (and|&) shoot|move or shoot|quick shot|multiple shots|volley fire|cumbersome|ponderous)/i,
    why:"riguarda il tiro: la legge la fase di tiro, non il conto di un assalto" },
  { re:/^(general|rallying cry|arcane vassal|lore of|wizard|channel)/i,
    why:"comando o magia: fuori dal conto di un assalto" },
  { re:/^(large target|unit strength|drop rocks|breath weapon|regenerat)/i,
    why:"non entra nella risoluzione di una mischia" },
  /* Le tre universali che le liste portano e che un tavolo non puo'
     giocare da solo: due sono vincoli su come e' fatta l'unita', la
     terza e' una reazione alla carica che il pannello non offre. */
  { re:/^motley crew/i,
    why:"modelli armati e corazzati in modo diverso nella stessa unità: si tirano a mucchi separati, e il conto usa l'arma e l'armatura della maggioranza" },
  { re:/^loner/i,
    why:"vincolo sui personaggi che si uniscono e sul Generale: si rispetta schierando" },
  { re:/^counter charge/i,
    why:"è una reazione alla carica di cavalleria, carri e mostri: il pannello offre tenere, tirare e fuggire, e questa la muovete voi" },
  /* Le tre che ha portato l'Hell Pit Abomination. La terza e' la piu'
     insidiosa: la riga degli Attacchi dice «D6+1», e il profilo la
     legge come il primo numero che trova — 6 — senza tirare niente.
     Finche' la mischia non tira gli attacchi, lo si dice. */
  { re:/^magic resistance/i,
    why:"toglie dal tiro di lancio degli incantesimi nemici che bersagliano l'unità: né il pannello né l'arbitro la sottraggono ancora" },
  { re:/^random movement/i,
    why:"riguarda il movimento: il Movimento si tira, e l'ispettore lo dice" },
  /* Due vincoli di forma, che si giocano dove i pezzi si uniscono e si
     muovono: `formation.js` li fa rispettare al tavolo, e l'arbitro gira
     il Lumbering dopo aver mosso. */
  { re:/^lumbering/i,
    why:"sempre in ordine chiuso, dopo aver mosso (non caricato, marciato o fuggito) si gira fino a 90° sul posto, e non si unisce a nessuno né ospita personaggi: lo fanno il tavolo e l'arbitro (p. 195)" },
  { re:/^clumsy/i,
    why:"le si unisce solo un personaggio che ha anche lui Clumsy: il tavolo e l'arbitro non offrono gli altri" },
  { re:/^random attacks/i,
    why:"gli Attacchi si tirano a ogni assalto, e il conto non li tira: legge il primo numero della riga («D6+1» vale 6). Correggili a mano nel pannello" },
];

/* ============================================================
   3 · LA LETTURA
   ============================================================ */
export const emptyFlags = () => ({
  furiousCharge:false, poisoned:false, armourBane:0, killingBlow:false,
  handWeaponAP:0, impact:null, stomp:null, extraRank:false, hatred:false,
  strikeFirst:false, strikeLast:false, stubborn:false, unbreakable:false,
  battleStandard:false, horde:false, shieldwall:false, impervious:false,
  massedInfantry:false, parry:false, pressOfBattle:false, predatory:false, skinkRiders:false,
  /* le regole d'esercito riconosciute e applicabili, come stanno nel
     file: `combat.js` le traduce con `meleeBoosts` */
  army:[],
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
   lette e poi buttate. weapon: come si chiama quell'arma.

   `texts` e' il pezzo che mancava, ed era in casa da sempre: i file di
   New Recruit portano il testo per esteso di ogni regola speciale, il
   parser lo legge e lo tiene su `u.ruleText`, e nessuno lo guardava —
   settanta regole del manuale scritte per intero dentro le liste
   salvate. Adesso ogni riga dei tre elenchi se lo porta dietro, e una
   regola che l'app non conosce smette di essere un nome: diventa un
   nome e le sue tre righe di manuale, che al tavolo bastano per
   applicarla a mano. */
/* `army` e' il file d'esercito dell'unita' (Tappa 5 bis). Una regola che
   il registro universale non conosce e che il file nomina non e' piu'
   «sconosciuta»: e' applicata, o e' conosciuta con il perche' non lo
   e'. La differenza che conta al tavolo e' quella fra «l'app non sa
   cosa sia» e «l'app lo sa, e questo lo fate voi». */
export function readRules(names = [], weapons = [], weapon = "", texts = null, army = null){
  const flags = emptyFlags();
  const applied = [], elsewhere = [], unknown = [];
  const seen = new Set();

  for (const raw of [...names, ...weapons]){
    const name = String(raw || "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());

    const text = (texts && texts[name]) || "";

    const hit = RULEBOOK.find(r => r.re.test(name));
    if (hit){
      const limit = limitOf(name);
      const met = limitMet(limit, weapon);
      if (met === false){ elsewhere.push({ name, text, why: "vale solo per " + limit }); continue; }
      hit.on(flags, name);
      applied.push({ name, text, what: hit.what, caveat: met === null ? "solo per " + limit : "" });
      continue;
    }

    /* La psicologia (Tappa 5). Quattro regole entrano nel conto di un
       assalto — la Paura toglie uno per colpire, il Terrore uno al test
       di rotta, la Frenzy aggiunge un attacco, la Warband alza il
       Comando — e le altre si giocano in una casella precisa, che la
       riga nomina invece di dire «altrove». */
    const ps = psychRule(name);
    if (ps){
      if (ps.melee) applied.push({ name, text, what: ps.what, caveat: "" });
      else elsewhere.push({ name, text, why: ps.where });
      continue;
    }

    const ar = army ? ruleFor(army, name) : null;
    if (ar){
      const caveat = ar.daVerificare ? "da verificare: " + ar.daVerificare : "";
      if (applies(ar)){
        applied.push({ name, text, what: ar.what || "", caveat, army: army.name });
        if (!ar.gioca) flags.army.push(ar);
      } else {
        elsewhere.push({ name, text, why: ar.perche || ar.manuale || "si applica a mano", army: army.name });
      }
      continue;
    }

    const out = ELSEWHERE.find(r => r.re.test(name));
    if (out) elsewhere.push({ name, text, why: out.why });
    else unknown.push({ name, text });
  }
  return { flags, applied, elsewhere, unknown };
}

/* ============================================================
   4 · IL CONTATORE DELLE REGOLE CHE L'APP NON CONOSCE
   L'ordine in cui insegnare le prossime regole non lo decide l'indice
   del manuale: lo decidono le partite giocate davvero. Il §3.4 del
   piano chiedeva un contatore persistente, e non serve un file nuovo
   per averlo — le partite archiviate portano con se' le liste con le
   regole di ogni unita', e le liste salvate le portano anche loro.
   Qui si contano, una volta per unita', e si mettono in fila: prima
   quelle viste in piu' partite, poi quelle che stanno in piu' liste.

   `groups` e' un elenco di { kind: "game" | "list", units: [...] }.
   `armyOf(unita', gruppo)` dice il file d'esercito, quando c'e': senza,
   le regole d'esercito tornano tutte sconosciute.
   ============================================================ */
export function tallyUnknown(groups = [], { armyOf = null } = {}){
  const map = new Map();
  for (const g of groups || []){
    const seenHere = new Set();
    for (const u of (g && g.units) || []){
      const r = readRules(u.rules || [], [], "", u.ruleText || null, armyOf ? armyOf(u, g) : null);
      for (const x of r.unknown){
        const e = map.get(x.name) || { name: x.name, text: x.text || "", games: 0, lists: 0, units: 0 };
        if (!e.text && x.text) e.text = x.text;
        e.units++;
        /* una partita o una lista contano una volta sola, anche se la
           regola sta su tre unita' diverse */
        if (!seenHere.has(x.name)){
          seenHere.add(x.name);
          if (g.kind === "game") e.games++; else e.lists++;
        }
        map.set(x.name, e);
      }
    }
  }
  return [...map.values()].sort((a, b) =>
    b.games - a.games || b.lists - a.lists || b.units - a.units || a.name.localeCompare(b.name));
}
