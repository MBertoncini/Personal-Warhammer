/* Schieramento Old World — le sedici caselle del turno
 *
 * Il manuale e' esplicito: quattro fasi, ciascuna di quattro sotto-fasi
 * (Core Rulebook 2023, pp. 115-117 la Strategia, 118 il Movimento, 136
 * il Tiro, 144 il Corpo a corpo). Sedici caselle in tutto, sempre nello
 * stesso ordine, e quasi tutte le regole sono attaccate a una casella.
 *
 * L'app conosceva le quattro fasi. Le quattro bastano a dire «a che
 * punto siamo»; non bastano a dire **cosa si puo' fare adesso**, che e'
 * la domanda che al tavolo si sbaglia piu' spesso: un incantesimo di
 * potenziamento lanciato nella fase sbagliata, un tiro dopo aver
 * marciato, il raduno dei fuggitivi che si dimentica ogni singola
 * partita perche' capita all'inizio del turno e la testa e' gia' sulle
 * cariche.
 *
 * Qui dentro non c'e' stato e non c'e' DOM: c'e' la tabella delle
 * sedici caselle, cosa ognuna permette, e i due modi di camminarci
 * sopra — avanti di una casella, o saltando a una qualsiasi.
 *
 * Il permesso non e' un divieto. Il §1 del piano e' netto: l'app
 * propone, non impedisce. Una casella dice cosa ci si aspetta, e
 * un'azione fuori posto passa lo stesso portandosi dietro la nota del
 * perche' era fuori posto. Chi gioca decide; l'app ricorda.
 */

/* ============================================================
   1 · LE QUATTRO FASI E LE LORO QUATTRO CASELLE
   `does` sono i tipi di azione che quella casella si aspetta.
   Il vocabolario delle azioni sta in `engine.js`: qui ci sono solo i
   nomi, perche' la tabella deve poter essere letta accanto al manuale
   senza sapere niente del motore.
   ============================================================ */
export const PHASES = [
  { id:"strategy", label:"Strategia", page:115, steps:[
    { id:"turnStart", label:"Inizio turno",
      what:"gli effetti che scadono, gli imboscati che arrivano",
      does:["note","roll","reserve","expire"] },
    { id:"command", label:"Comando",
      what:"le abilita' di comando usabili adesso, una per modello",
      does:["note","roll","command"] },
    { id:"conjuration", label:"Congiurazione",
      what:"gli incantesimi di potenziamento e di maledizione",
      does:["note","roll","cast","dispel"] },
    { id:"rally", label:"Raduno",
      what:"un test di Comando per ogni unita' in fuga",
      does:["note","roll","rally"] },
  ]},
  { id:"movement", label:"Movimento", page:118, steps:[
    { id:"declare", label:"Dichiarazione cariche",
      what:"si dichiarano le cariche e si scelgono le reazioni",
      does:["note","roll","declareCharge","chargeReaction"] },
    { id:"chargeMoves", label:"Mosse di carica",
      what:"il tiro di carica e i caricanti che arrivano a contatto",
      does:["note","roll","chargeMove","flee"] },
    { id:"compulsory", label:"Mosse obbligate",
      what:"chi fugge, chi e' frenetico, chi non decide da se'",
      does:["note","roll","compulsoryMove","flee"] },
    { id:"remaining", label:"Mosse restanti",
      what:"tutto il resto del movimento, e gli incantesimi di trasporto",
      does:["note","roll","move","march","reform","cast"] },
  ]},
  { id:"shooting", label:"Tiro", page:136, steps:[
    { id:"pick", label:"Scelta e bersaglio",
      what:"chi tira e a cosa: non chi ha caricato, marciato o e' in mischia",
      does:["note","roll","declareShot"] },
    { id:"toHit", label:"Per colpire",
      what:"i modificatori si sommano qui: mosso, lunga gittata, copertura",
      does:["note","roll","toHit"] },
    { id:"toWound", label:"Per ferire e salvezze",
      what:"ferire, armatura, salvezza speciale, rigenerazione",
      does:["note","roll","toWound","save"] },
    { id:"casualties", label:"Perdite e Panico",
      what:"si tolgono i modelli e si tira il Panico oltre un quarto",
      does:["note","roll","loss","wound","panic"] },
  ]},
  { id:"combat", label:"Corpo a corpo", page:144, steps:[
    { id:"fight", label:"Scegli e combatti",
      what:"un combattimento per volta, in ordine di Iniziativa",
      does:["note","roll","fight","toHit","toWound","save","loss","wound","challenge"] },
    { id:"result", label:"Risultato del combattimento",
      what:"ferite, ranghi, stendardo, fianco, retro, terreno piu' alto",
      does:["note","roll","combatResult"] },
    { id:"breakTest", label:"Test di rotta",
      what:"cede terreno, ripiega in ordine, oppure rotta",
      does:["note","roll","breakTest","flee"] },
    { id:"pursuit", label:"Inseguimento",
      what:"inseguimento, sfondamento, unita' travolta",
      does:["note","roll","pursue","overrun"] },
  ]},
];

/* ============================================================
   2 · LE SEDICI IN FILA
   Il turno e' una fila di sedici caselle, e camminarci sopra e' piu'
   semplice che tenere due indici. Le fasi restano perche' il pannello
   le raggruppa e perche' il registro le nomina.
   ============================================================ */
export const STEPS = PHASES.flatMap((p, pi) => p.steps.map((s, si) => ({
  ...s,
  phase: pi, phaseId: p.id, phaseLabel: p.label, page: p.page,
  sub: si,
  index: pi * 4 + si,
  full: p.label + " · " + s.label,
})));

export const STEP_COUNT = STEPS.length;          // sedici

export const stepAt = i => STEPS[((i % STEP_COUNT) + STEP_COUNT) % STEP_COUNT];
export const stepOf = (phase, sub) => stepAt((phase || 0) * 4 + (sub || 0));
export const findStep = id => STEPS.find(s => s.id === id) || null;

/* Avanti o indietro di una casella. Torna anche se il turno e' girato,
   perche' chi chiama deve sapere quando passare la mano: e' l'unico
   punto in cui la fila di sedici diventa un turno vero. */
export function step(i, dir = 1){
  const n = (i || 0) + (dir >= 0 ? 1 : -1);
  return {
    index: ((n % STEP_COUNT) + STEP_COUNT) % STEP_COUNT,
    wrapped: n >= STEP_COUNT ? 1 : n < 0 ? -1 : 0,
  };
}

/* ============================================================
   3 · COSA CI SI ASPETTA QUI
   ============================================================ */
export const allows = (i, type) => stepAt(i).does.includes(type);

/* Dove quel tipo di azione sta di casa. Serve a scrivere la nota:
   non «non puoi», ma «questo di solito si fa in Movimento ·
   Dichiarazione cariche», che e' un'informazione invece di un muro. */
export function homeOf(type){
  const found = STEPS.filter(s => s.does.includes(type));
  return found.length ? found : null;
}

/* La nota per un'azione fuori posto. Torna stringa vuota quando
   l'azione e' dove ci si aspetta: chi chiama la mette nel registro
   senza dover decidere niente. */
export function misplaced(i, type){
  if (allows(i, type)) return "";
  const home = homeOf(type);
  if (!home) return "azione fuori dal vocabolario delle sedici caselle";
  const where = home.map(s => s.full).join(", ");
  return "di solito si fa in " + where + "; siamo in " + stepAt(i).full;
}

/* Tutti i tipi di azione che le sedici caselle nominano: e' il
   vocabolario, e serve a `engine.js` per accorgersi di un tipo scritto
   storto invece di eseguirlo in silenzio. */
export const VOCABULARY = [...new Set(STEPS.flatMap(s => s.does))].sort();
