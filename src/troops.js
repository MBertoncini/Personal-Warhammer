/* Schieramento Old World — i tipi di truppa (Core Rulebook 2023, p. 105)
 *
 * Una riga per tipo, e da quella riga discendono tre cose che il resto
 * del motore chiede di continuo: quanti modelli deve avere una fila per
 * contare, fino a quanto sale il bonus di ranghi nel risultato del
 * combattimento, e quanta Forza d'Unita' vale ogni modello.
 *
 * Da dove vengono i numeri. Dalla tabella del libro (p. 105, pagina
 * 106 del PDF), letta sul libro. La prima versione di questo file era
 * scritta dal riassunto del piano e sbagliava quasi tutte le colonne:
 * tre ranghi di bonus alla fanteria invece di due, cinque modelli per
 * fila alla fanteria pesante invece di quattro, due ranghi alla
 * cavalleria invece di uno, quattro di Forza d'Unita' al carro pesante
 * invece di cinque, e ai mostri un numero fisso dove il libro dice «come
 * le Ferite iniziali». Le liste salvate lo confermano riga per riga: il
 * Doomwheel dichiara 5, lo Slann 5 con cinque Ferite, il Bastiladon 4
 * con quattro. E' il sesto numero del Warhammer di prima trovato nel
 * motore (§2 del piano).
 *
 * Il nome del tipo arriva dal file come testo libero e non e' pulito:
 * «Heavy Infantry», «Heavy infantry», «Regular infantry (character)».
 * Va normalizzato prima di cercarlo, e la parentesi del personaggio e'
 * un'informazione da tenere, non da buttare.
 */

/* ============================================================
   1 · LA TABELLA
   perRank   quanti modelli deve avere una fila per contare nel bonus
             di ranghi (0 = il tipo non ne prende)
   maxRank   il bonus di ranghi massimo (0 = nessuno)
   us        Forza d'Unita' per modello; `usWounds` quando il libro
             dice «come le Ferite iniziali»
   ranks     se il tipo prende un bonus di ranghi
   ============================================================ */
export const PAGE = 105;

export const TROOPS = [
  { id:"regularInfantry",  label:"Fanteria regolare",    perRank:5, maxRank:2, us:1, ranks:true  },
  { id:"heavyInfantry",    label:"Fanteria pesante",     perRank:4, maxRank:2, us:1, ranks:true  },
  { id:"monstrousInfantry",label:"Fanteria mostruosa",   perRank:3, maxRank:2, us:3, ranks:true  },
  { id:"swarm",            label:"Sciame",               perRank:0, maxRank:0, us:3, ranks:false },
  { id:"lightCavalry",     label:"Cavalleria leggera",   perRank:5, maxRank:1, us:2, ranks:true  },
  { id:"heavyCavalry",     label:"Cavalleria pesante",   perRank:4, maxRank:1, us:2, ranks:true  },
  { id:"monstrousCavalry", label:"Cavalleria mostruosa", perRank:3, maxRank:1, us:3, ranks:true  },
  { id:"warBeasts",        label:"Bestie da guerra",     perRank:5, maxRank:1, us:1, ranks:true  },
  { id:"lightChariot",     label:"Carro leggero",        perRank:3, maxRank:1, us:3, ranks:true  },
  { id:"heavyChariot",     label:"Carro pesante",        perRank:0, maxRank:0, us:5, ranks:false },
  { id:"monstrousCreature",label:"Creatura mostruosa",   perRank:0, maxRank:0, us:0, usWounds:true, ranks:false },
  { id:"behemoth",         label:"Colosso",              perRank:0, maxRank:0, us:0, usWounds:true, ranks:false },
  { id:"warMachine",       label:"Macchina da guerra",   perRank:0, maxRank:0, us:0, usWounds:true, ranks:false },
];

const byId = Object.fromEntries(TROOPS.map(t => [t.id, t]));

/* Il tipo sconosciuto non e' un errore da nascondere: e' una riga in
   piu' nell'elenco delle cose che l'app non sa, e si comporta come la
   fanteria regolare perche' e' l'ipotesi meno dannosa. */
export const UNKNOWN_TROOP = {
  id:"unknown", label:"tipo non riconosciuto",
  perRank:5, maxRank:2, us:1, ranks:true, unknown:true,
};

/* ============================================================
   2 · DAL TESTO DEL FILE ALLA RIGA
   ============================================================ */
/* Le parentesi dicono cose vere — «(character)» marca il personaggio
   che si e' unito a un reggimento — e vanno lette prima di togliere il
   resto. La «fanteria leggera» nel libro non c'e': se un file la
   scrive, e' fanteria regolare. */
const NAMES = [
  [/monstrous\s+(infantry|fanteria)|fanteria\s+mostruosa/i, "monstrousInfantry"],
  [/monstrous\s+cavalry|cavalleria\s+mostruosa/i,           "monstrousCavalry"],
  [/monstrous\s+(creature|beast)|creatura\s+mostruosa/i,    "monstrousCreature"],
  [/behemoth|colosso/i,                                     "behemoth"],
  [/war\s*machine|macchina\s+da\s+guerra/i,                 "warMachine"],
  [/war\s*beasts?|besti[ae]\s+da\s+guerra/i,                "warBeasts"],
  [/heavy\s+chariot|carro\s+pesante/i,                      "heavyChariot"],
  [/(light\s+)?chariot|carro/i,                             "lightChariot"],
  [/heavy\s+cavalry|cavalleria\s+pesante/i,                 "heavyCavalry"],
  [/light\s+cavalry|cavalleria\s+leggera/i,                 "lightCavalry"],
  [/cavalry|cavalleria|mounted/i,                           "heavyCavalry"],
  [/swarm|sciame/i,                                         "swarm"],
  [/heavy\s+infantry|fanteria\s+pesante/i,                  "heavyInfantry"],
  [/(regular\s+|light\s+)?infantry|fanteria/i,              "regularInfantry"],
];

export function troopType(txt){
  const raw = String(txt || "").trim();
  if (!raw) return { ...UNKNOWN_TROOP, raw, isCharacter:false };
  const isCharacter = /\(\s*(named\s+)?character\s*\)|\(\s*personaggio\s*\)/i.test(raw);
  const clean = raw.replace(/\([^)]*\)/g, " ");
  for (const [re, id] of NAMES) if (re.test(clean)) return { ...byId[id], raw, isCharacter };
  return { ...UNKNOWN_TROOP, raw, isCharacter };
}

/* ============================================================
   3 · LE TRE DOMANDE
   Il file vince sempre sulla tabella quando dice qualcosa: il valore
   scritto nel roster tiene conto della cavalcatura e degli oggetti,
   la tabella no.
   ============================================================ */
export const perRankOf   = t => troopType(t).perRank;
export const maxRankOf   = t => troopType(t).maxRank;

/* `wounds` sono le Ferite iniziali del modello: servono ai tre tipi per
   cui il libro dice «come le Ferite iniziali». Senza, si conta 1, che e'
   il minimo e non finge di sapere. */
export const usPerModel  = (t, fromFile = 0, models = 1, wounds = 0) => {
  const n = Math.max(0, +fromFile || 0), m = Math.max(1, +models || 1);
  if (n > 0) return n / m;
  const row = troopType(t);
  return row.usWounds ? Math.max(1, +wounds || 0) : row.us;
};

/* Quanta Forza d'Unita' ha un'unita' adesso: i modelli ancora in piedi
   per il valore di uno. E' il conto che decide chi cede terreno, chi
   controlla un obiettivo e in che direzione si fugge. */
export const unitStrength = (troop, fromFile, models, alive, wounds = 0) =>
  Math.round(usPerModel(troop, fromFile, models, wounds) * Math.max(0, alive ?? models ?? 0) * 100) / 100;

/* Le celle che il libro non conferma. Dalla lettura della tabella vera
   non ce ne sono piu'; la funzione resta perche' il pannello la chiede,
   e un file d'esercito con un tipo nuovo puo' riaprirla. */
export const unverified = () => TROOPS
  .filter(t => t.daVerificare)
  .map(t => ({ id:t.id, label:t.label, campi:t.daVerificare }));
