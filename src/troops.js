/* Schieramento Old World — i tipi di truppa (Core Rulebook 2023, p. 105)
 *
 * Una riga per tipo, e da quella riga discendono tre cose che il resto
 * del motore chiede di continuo: quanti modelli fanno una fila piena,
 * fino a quanti ranghi contano nel risultato del combattimento, e
 * quanta Forza d'Unita' vale ogni modello.
 *
 * Da dove vengono i numeri. La colonna della Forza d'Unita' e'
 * verificata sulle dieci liste salvate in `dati/liste.json`: New
 * Recruit la scrive nel file, e per sei tipi su tredici c'e' almeno un
 * esempio vero che la conferma — fanteria 1, cavalleria 2, fanteria e
 * cavalleria mostruosa 3, creatura mostruosa e macchina da guerra 4,
 * colosso 6. Le celle senza esempio nelle liste di casa portano il
 * segno `daVerificare`, e l'app lo dice invece di far finta: e' la
 * regola del §1 del piano, quella che vieta di sbagliare in silenzio.
 *
 * Il nome del tipo arriva dal file come testo libero e non e' pulito:
 * «Heavy Infantry», «Heavy infantry», «Regular infantry (character)».
 * Va normalizzato prima di cercarlo, e la parentesi del personaggio e'
 * un'informazione da tenere, non da buttare.
 */

/* ============================================================
   1 · LA TABELLA
   perRank   quanti modelli fanno una fila che conta
   maxRank   quanti ranghi al massimo danno bonus (0 = non ne danno)
   us        Forza d'Unita' per modello
   ranks     se il tipo si schiera in ranghi
   ============================================================ */
export const TROOPS = [
  { id:"regularInfantry",  label:"Fanteria regolare",    perRank:5, maxRank:3, us:1, ranks:true  },
  { id:"heavyInfantry",    label:"Fanteria pesante",     perRank:5, maxRank:3, us:1, ranks:true  },
  { id:"lightInfantry",    label:"Fanteria leggera",     perRank:5, maxRank:3, us:1, ranks:true,  daVerificare:["us","maxRank"] },
  { id:"monstrousInfantry",label:"Fanteria mostruosa",   perRank:3, maxRank:2, us:3, ranks:true,  daVerificare:["maxRank"] },
  { id:"swarm",            label:"Sciame",               perRank:3, maxRank:0, us:3, ranks:true,  daVerificare:["us","maxRank"] },
  { id:"lightCavalry",     label:"Cavalleria leggera",   perRank:5, maxRank:2, us:2, ranks:true,  daVerificare:["maxRank"] },
  { id:"heavyCavalry",     label:"Cavalleria pesante",   perRank:5, maxRank:2, us:2, ranks:true,  daVerificare:["maxRank"] },
  { id:"monstrousCavalry", label:"Cavalleria mostruosa", perRank:3, maxRank:1, us:3, ranks:true,  daVerificare:["maxRank"] },
  { id:"lightChariot",     label:"Carro leggero",        perRank:1, maxRank:0, us:3, ranks:false, daVerificare:["us"] },
  { id:"heavyChariot",     label:"Carro pesante",        perRank:1, maxRank:0, us:4, ranks:false, daVerificare:["us"] },
  { id:"monstrousCreature",label:"Creatura mostruosa",   perRank:1, maxRank:0, us:4, ranks:false },
  { id:"behemoth",         label:"Colosso",              perRank:1, maxRank:0, us:6, ranks:false },
  { id:"warMachine",       label:"Macchina da guerra",   perRank:1, maxRank:0, us:4, ranks:false },
];

const byId = Object.fromEntries(TROOPS.map(t => [t.id, t]));

/* Il tipo sconosciuto non e' un errore da nascondere: e' una riga in
   piu' nell'elenco delle cose che l'app non sa, e si comporta come la
   fanteria regolare perche' e' l'ipotesi meno dannosa. */
export const UNKNOWN_TROOP = {
  id:"unknown", label:"tipo non riconosciuto",
  perRank:5, maxRank:3, us:1, ranks:true, unknown:true,
};

/* ============================================================
   2 · DAL TESTO DEL FILE ALLA RIGA
   ============================================================ */
/* Le parentesi dicono cose vere — «(character)» marca il personaggio
   che si e' unito a un reggimento — e vanno lette prima di togliere il
   resto. */
const NAMES = [
  [/monstrous\s+(infantry|fanteria)|fanteria\s+mostruosa/i, "monstrousInfantry"],
  [/monstrous\s+cavalry|cavalleria\s+mostruosa/i,           "monstrousCavalry"],
  [/monstrous\s+(creature|beast)|creatura\s+mostruosa/i,    "monstrousCreature"],
  [/behemoth|colosso/i,                                     "behemoth"],
  [/war\s*machine|macchina\s+da\s+guerra/i,                 "warMachine"],
  [/heavy\s+chariot|carro\s+pesante/i,                      "heavyChariot"],
  [/(light\s+)?chariot|carro/i,                             "lightChariot"],
  [/heavy\s+cavalry|cavalleria\s+pesante/i,                 "heavyCavalry"],
  [/light\s+cavalry|cavalleria\s+leggera/i,                 "lightCavalry"],
  [/cavalry|cavalleria|mounted/i,                           "heavyCavalry"],
  [/swarm|sciame/i,                                         "swarm"],
  [/heavy\s+infantry|fanteria\s+pesante/i,                  "heavyInfantry"],
  [/light\s+infantry|fanteria\s+leggera/i,                  "lightInfantry"],
  [/(regular\s+)?infantry|fanteria/i,                       "regularInfantry"],
];

export function troopType(txt){
  const raw = String(txt || "").trim();
  if (!raw) return { ...UNKNOWN_TROOP, raw, isCharacter:false };
  const isCharacter = /\(\s*character\s*\)|\(\s*personaggio\s*\)/i.test(raw);
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
export const usPerModel  = (t, fromFile = 0, models = 1) => {
  const n = Math.max(0, +fromFile || 0), m = Math.max(1, +models || 1);
  return n > 0 ? n / m : troopType(t).us;
};

/* Quanta Forza d'Unita' ha un'unita' adesso: i modelli ancora in piedi
   per il valore di uno. E' il conto che decide chi cede terreno, chi
   controlla un obiettivo e in che direzione si fugge. */
export const unitStrength = (troop, fromFile, models, alive) =>
  Math.round(usPerModel(troop, fromFile, models) * Math.max(0, alive ?? models ?? 0) * 100) / 100;

/* Le celle che nessuna lista di casa conferma: l'app le usa, ma sa
   dire quali sono. Serve al pannello «cosa non e' verificato». */
export const unverified = () => TROOPS
  .filter(t => t.daVerificare)
  .map(t => ({ id:t.id, label:t.label, campi:t.daVerificare }));
