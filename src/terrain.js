/* Schieramento Old World — tipi di elemento scenico
 *
 * Un pezzo di terreno sul tavolo porta due informazioni che il disegno
 * da solo non da', e da quelle due discende quasi tutto il resto del
 * capitolo del terreno (Core Rulebook 2023, pp. 269-272, piu' la
 * pagina che dice cosa ne fa il combattimento, p. 159):
 *
 *   la CATEGORIA — aperto, difficile, pericoloso, impassabile,
 *   ostacolo basso, ostacolo alto, bosco — che decide quanto rallenta,
 *   se fa perdere i ranghi, se ripara dal tiro, se taglia la vista;
 *
 *   se e' NATURALE o no, che sembra un dettaglio e non lo e': la
 *   tabella del Terreno Selvaggio di *Battle March* (p. 40) si tira
 *   solo sui terreni naturali, e senza questo campo la regola non si
 *   puo' nemmeno scrivere.
 *
 * Il campo `pass` di prima resta dov'e': ci si appoggiano il ventaglio
 * di movimento, il disegno e il registro, e cambiarlo adesso vorrebbe
 * dire toccare cinque moduli per un rinominamento. `cat` gli sta
 * accanto ed e' piu' fine — `pass:"difficult"` non distingue un bosco
 * da una palude, `cat` si'.
 *
 * Ogni pezzo posato sul tavolo puo' scavalcare tutti e due (`t.cat`,
 * `t.natural`): al tavolo le rovine di un tempio possono essere
 * dichiarate impassabili e un bosco puo' essere finto. E' la regola
 * del §1 del piano — l'app propone, non impedisce. Il libro la dice
 * uguale: i due giocatori si mettono d'accordo prima della partita su
 * che categoria e' un pezzo che ne combina due (p. 271).
 */

/* ============================================================
   1 · LE SETTE CATEGORIE
   `slow` toglie un pollice al Movimento; `worstDie` fa tenere il dado
   peggiore del tiro di carica; `danger` chiede il test di terreno
   pericoloso; `disorder` toglie i ranghi a chi ci sta dentro; `cover`
   e' il riparo dal tiro; `los` taglia la linea di vista; `noEntry` e'
   il terreno in cui non si entra e basta.

   Due righe qui sono state corrette con il libro aperto, e vale la
   pena dire cosa dicevano prima, perche' l'errore era silenzioso.

   L'OSTACOLO BASSO diceva `slow:false, worstDie:false`, cioe' si
   scavalcava gratis. Il libro lo tratta come terreno difficile per il
   movimento (p. 270), e la pagina della carica lo nomina per esteso:
   terreno difficile o pericoloso, *o un ostacolo basso*, fa scartare
   il dado migliore e toglie un pollice al Movimento (p. 128). Un
   muretto in mezzo alla strada cambiava una carica di trenta punti
   percentuali e l'app non lo diceva.

   L'OSTACOLO ALTO diceva `slow:true`, cioe' rallentava come un bosco.
   Il libro lo tratta come terreno IMPASSABILE, per il movimento e per
   il combattimento (pp. 270 e 159): un muro di castello non si
   attraversa piu' lentamente, non si attraversa.
   ============================================================ */
const CATS = {
  open:      { label:"Aperto",        slow:false, worstDie:false, danger:false, disorder:false, noEntry:false, cover:"",     los:false },
  difficult: { label:"Difficile",     slow:true,  worstDie:true,  danger:false, disorder:true,  noEntry:false, cover:"",     los:false },
  dangerous: { label:"Pericoloso",    slow:true,  worstDie:true,  danger:true,  disorder:true,  noEntry:false, cover:"",     los:false },
  impassable:{ label:"Impassabile",   slow:false, worstDie:false, danger:false, disorder:false, noEntry:true,  cover:"hard", los:true  },
  lowWall:   { label:"Ostacolo basso",slow:true,  worstDie:true,  danger:false, disorder:true,  noEntry:false, cover:"hard", los:false },
  highWall:  { label:"Ostacolo alto", slow:false, worstDie:false, danger:false, disorder:false, noEntry:true,  cover:"hard", los:true  },
  wood:      { label:"Bosco",         slow:true,  worstDie:true,  danger:false, disorder:true,  noEntry:false, cover:"soft", los:"soft" },
};
export const CATEGORIES = CATS;
export const CAT_IDS = Object.keys(CATS);

/* Il bosco ha la penombra (p. 270): due modelli che stanno tutti e due
   fuori si vedono solo se la linea fra le due basette non attraversa
   il bosco; chi ci sta dentro vede e si fa vedere. `los:"soft"` e' il
   segnale che la linea di vista qui non e' un si'/no ma dipende da chi
   guarda e da dove, e il conto lo fa `sight.js`.

   Qui c'era `WOOD_SIGHT = 3`, un raggio di vista di tre pollici dentro
   al bosco. Quel numero e' dell'ottava edizione di Warhammer: il
   capitolo del terreno dell'Old World non lo ha, e nessuno lo
   chiamava. E' stato tolto invece che dichiarato da verificare, perche'
   non c'e' niente da verificare — la regola non esiste. */

/* Le decorazioni del campo di battaglia (pp. 271 e 159): un pezzo largo
   meno di due pollici — una catasta di barili, un pozzo, un cippo — si
   ignora per il movimento e per il combattimento, come se non ci fosse.
   La vista invece la puo' coprire, e per questo `isDecoration` la
   guardano solo le regole di movimento e di combattimento. */
export const DECOR_MAX = 2;      // pollici, lato piu' lungo

/* ============================================================
   2 · I PEZZI
   `cover` dice quanto ripara chi ci sta dentro o dietro dal tiro:
   niente, leggera (-1 per colpire), pesante (-2). E' l'unica cosa che
   il tipo di elemento sa dire da solo; il resto lo decidono i due
   giocatori guardando il pezzo vero.
   ============================================================ */
/* La collina e' terreno aperto ma non trasparente: oltre la cresta la
   vista non passa se nessuno dei due ci sta sopra (p. 272). `los` la
   dice "crest" perche' non e' un muro: chi ci sta sopra vede e si fa
   vedere, e il conto lo fa `sight.js`. */
const TERRAIN = {
  hill:     { label:"Collina",  color:"var(--t-hill)",     shape:"rect",   pass:"open",     los:"crest", cover:"",   w:10, h:6,     cat:"open",       natural:true  },
  wood:     { label:"Bosco",    color:"var(--t-wood)",     shape:"rect",   pass:"difficult",los:true,  cover:"soft", w:8,  h:6,     cat:"wood",       natural:true  },
  marsh:    { label:"Palude",   color:"var(--t-marsh)",    shape:"rect",   pass:"difficult",los:false, cover:"",     w:9,  h:5,     cat:"dangerous",  natural:true  },
  /* Le rovine dicevano `cat:"highWall"`, e con l'ostacolo alto rimesso
     a impassabile (§1) sarebbero diventate invalicabili — mentre il
     pezzo stesso dice `pass:"difficult"` e lo scenario delle Rovine di
     Xhotl ci manda dentro gli schermagliatori. L'ostacolo alto del
     libro e' il muro di castello; un tempio in rovina e' terreno
     difficile che ripara bene, ed e' quello che dice adesso. Chi al
     tavolo ha in mano un pezzo diverso gli mette la sua categoria. */
  ruins:    { label:"Rovine",   color:"var(--t-ruins)",    shape:"rect",   pass:"difficult",los:true,  cover:"hard", w:6,  h:5,     cat:"difficult",  natural:false },
  wall:     { label:"Muretto",  color:"var(--t-wall)",     shape:"wall",   pass:"obstacle", los:false, cover:"hard", w:8,  h:0.8,   cat:"lowWall",    natural:false },
  monolith: { label:"Monolite", color:"var(--t-mono)",     shape:"circle", pass:"blocked",  los:true,  cover:"hard", w:4,  h:4,     cat:"impassable", natural:false },
  pyramid:  { label:"Piramide", color:"var(--t-ruins)",    shape:"rect",   pass:"blocked",  los:true,  cover:"hard", w:8,  h:7,     cat:"impassable", natural:false },
  treasure: { label:"Tesoro",   color:"var(--t-treasure)", shape:"token",  pass:"open",     los:false, cover:"",     w:1.575, h:1.575, cat:"open",     natural:false },
  /* Il *strategic landmark* di Battle March (p. 24): basetta da 100 mm,
     impassabile, blocca la linea di vista, e ha la sua tabella di
     proprieta'. E' l'unico pezzo nuovo che il libro chiede, e sul
     tavolo si comporta come il monolite che l'app disegnava gia'. */
  landmark: { label:"Punto di riferimento", color:"var(--t-mono)", shape:"circle", pass:"blocked", los:true, cover:"hard", w:3.94, h:3.94, cat:"impassable", natural:true, objective:true },
};

/* ============================================================
   3 · LEGGERE UN PEZZO POSATO
   Il pezzo vince sul tipo, sempre: al tavolo si decide guardando.
   ============================================================ */
/* `t.cat` arriva in due forme, e vanno bene tutte e due: il nome della
   categoria («difficult»), che e' come lo scrive chi posa un pezzo a
   mano, oppure la categoria gia' letta — l'oggetto che torna di qui —
   che e' come se la tengono il tavolo e l'arbitro, per non rileggerla
   a ogni domanda di geometria.

   Prima questa funzione accettava solo il nome: passandole un pezzo
   dell'arbitro leggeva un oggetto dove si aspettava una stringa, non
   lo trovava nella tabella e rispondeva «terreno aperto». In silenzio,
   e con la categoria giusta scritta un campo piu' in la'. */
export function catOf(t){
  const cfg = TERRAIN[t && t.kind] || {};
  const dichiarata = t && t.cat;
  const id = (dichiarata && typeof dichiarata === "object" ? dichiarata.id : dichiarata)
          || cfg.cat || "open";
  return { id, ...(CATS[id] || CATS.open) };
}
export const isNatural = t => {
  const cfg = TERRAIN[t && t.kind] || {};
  return t && t.natural != null ? !!t.natural : !!cfg.natural;
};
/* la copertura vera: quella del pezzo se l'ha dichiarata, altrimenti
   quella della categoria */
export const coverOf = t => {
  const cfg = TERRAIN[t && t.kind] || {};
  return (t && t.cover) || cfg.cover || catOf(t).cover || "";
};

/* quanto e' largo il pezzo, in pollici, per la regola delle decorazioni.
   `t.decor` lo scavalca: chi tiene i pezzi in millimetri — l'arbitro —
   se lo calcola una volta sola quando li costruisce, e chi al tavolo
   ha un cippo largo tre pollici puo' dire che una decorazione e' lo
   stesso. E' la regola di sempre: il pezzo vince sul tipo. */
export function isDecoration(t){
  if (!t) return false;
  if (t.decor != null) return !!t.decor;
  const cfg = TERRAIN[t.kind] || {};
  const w = +(t.w ?? cfg.w ?? 0) || 0, h = +(t.h ?? cfg.h ?? 0) || 0;
  const side = Math.max(w, h);
  return side > 0 && side < DECOR_MAX;
}

/* La categoria che vale IN COMBATTIMENTO (p. 159). Il libro riduce le
   sette: il pericoloso e il bosco contano come terreno difficile,
   l'ostacolo alto come impassabile, e il resto resta se stesso. Serve
   perche' la domanda di fine carica — questi ranghi li ha o no? — e'
   sulla categoria da combattimento, non su quella da movimento. */
export function combatCat(t){
  const c = catOf(t);
  if (c.id === "dangerous" || c.id === "wood")
    return { ...CATS.difficult, id:"difficult", from: c.id };
  if (c.id === "highWall")
    return { ...CATS.impassable, id:"impassable", from: c.id };
  return { ...c, from: c.id };
}

/* IL PEZZO DETTO IN UNA RIGA.
   La tabella del §1 e' fatta di bandierine, e le bandierine si leggono
   solo se si ha il libro aperto accanto. Qui diventano una frase.

   Serve a chi deve decidere senza il libro: l'elenco delle mosse, il
   posto di schieramento, e soprattutto la fotografia del tavolo che
   `arbitro.js` mette davanti a chi gioca — un umano o un modello di
   linguaggio. La fotografia il terreno non lo nominava affatto: le
   unita', i profili, le distanze, i punti vittoria, e dei sette pezzi
   posati sul tavolo nemmeno una parola. Un monolite impassabile in
   mezzo al campo, per chi sceglieva le mosse, non esisteva — e un
   reggimento schierato dietro ci restava tutta la partita.

   La penombra del bosco e la cresta della collina stanno sul PEZZO e
   non sulla categoria (un bosco e una collina sono tutti e due «open»
   o «wood» ma vedono in modo diverso), e per questo si legge `los` di
   qui e non da `CATS`. */
export function testoCat(t){
  const c = catOf(t);
  const cfg = TERRAIN[t && t.kind] || {};
  const los = t && t.los != null ? t.los : cfg.los;
  const dice = [];
  if (c.noEntry) dice.push("non si attraversa: ci si gira attorno");
  if (c.slow) dice.push("−1 al Movimento");
  if (c.worstDie) dice.push("chi ci carica dentro tiene il dado peggiore");
  if (c.danger) dice.push("test di terreno pericoloso, un dado per modello");
  if (c.disorder) dice.push("niente ranghi a chi ci combatte dentro");
  const rip = coverOf(t);
  if (rip) dice.push(rip === "hard" ? "riparo pesante, −2 per colpire" : "riparo leggero, −1 per colpire");
  /* Il bosco porta `los:true` sul tipo e `los:"soft"` sulla categoria, e
     non e' una contraddizione: e' la penombra (p. 270), che blocca la
     vista fra due che stanno tutti e due fuori e non blocca niente a
     chi ci sta dentro. La categoria lo dice piu' preciso, e vince. */
  if (c.los === "soft") dice.push("penombra: fra due che stanno fuori la vista non passa");
  else if (los === "crest") dice.push("oltre la cresta non si vede, se nessuno ci sta sopra");
  else if (los === true || c.los === true) dice.push("blocca la linea di vista");
  /* La collina e' terreno aperto, e sarebbe una riga vuota: quello che
     fa lo fa in combattimento, dove la fila piu' alta ne guadagna una
     in piu' (p. 152). Il landmark di Battle March e' un obiettivo. */
  if (cfg.los === "crest") dice.push("chi ci combatte sopra conta una fila in più (p. 152)");
  if (t && (t.objective ?? cfg.objective)) dice.push("è un obiettivo: chi lo tiene a fine turno fa punti");
  return dice.join(", ");
}

/* ============================================================
   4 · LE REGOLE CHE LA CATEGORIA FA SCATTARE
   Fin qui `terrain.js` era una tabella: diceva che la palude e'
   pericolosa e lasciava a qualcun altro il compito di tirare il dado.
   Nessuno lo tirava. Qui sotto ci sono le tre regole che la tabella
   annunciava e che non erano scritte da nessuna parte — il pollice in
   meno, il test di terreno pericoloso, l'ostacolo difeso. Sono
   funzioni pure: entrano pezzi e numeri, escono numeri e il perche'.

   I pezzi arrivano nella forma che il tavolo usa gia' (`terrainPieces()`
   in `deploy.js`, `S.terrain` nell'arbitro): quella forma puo' portare
   la categoria gia' letta in `p.cat`, e se non la porta si legge qui.
   ============================================================ */

export const PAGE = { cats: 269, obstacles: 270, woods: 270, hills: 272,
                      decor: 271, combat: 159, charge: 128 };

const catFor = p => (p && p.cat && p.cat.id) ? p.cat : catOf(p);
const nameOf = p => (p && (p.label || (TERRAIN[p.kind] || {}).label || p.kind)) || "terreno";

/* IL POLLICE IN MENO (p. 269).
   Se una parte qualsiasi dell'unita' si muove attraverso terreno
   difficile, quell'unita' subisce un −1 al Movimento, fino a un minimo
   di 1. Vale se ci comincia, se ci passa in mezzo o se ci finisce —
   quindi il conto non guarda dove si arriva ma cosa si e' toccato — e
   non si somma: due boschi tolgono un pollice, non due.

   La carica questo −1 lo sapeva gia' (`charge.js`, `chargeBands`); il
   movimento normale e la marcia no, e un reggimento attraversava una
   palude alla stessa velocita' con cui attraversava un prato. */
export function slowMove(move, pieces = []){
  const m = Math.max(0, +move || 0);
  const why = [];
  for (const p of pieces || []){
    if (!p || isDecoration(p)) continue;
    if (!catFor(p).slow) continue;
    const n = nameOf(p);
    if (!why.includes(n)) why.push(n);
  }
  const slowed = why.length > 0;
  const out = slowed ? Math.max(1, m - 1) : m;
  return {
    move: out, base: m, penalty: slowed ? 1 : 0, slowed, pieces: why,
    page: PAGE.cats,
    text: slowed ? `${why.join(", ")}: −1 al Movimento, ${out}″ invece di ${m}″ (p. ${PAGE.cats})` : "",
  };
}

/* IL TEST DI TERRENO PERICOLOSO (p. 269).
   Un D6 per modello, per OGNI elemento pericoloso attraversato in quel
   movimento: 2+ e passa, 1 e il modello perde una ferita. Il libro lo
   dice due volte — nel corpo della regola e nel corsivo sotto — perche'
   e' la parte che al tavolo si dimentica: due paludi sono due tiri per
   modello, non uno.

   Torna la richiesta di dado nella forma che il vassoio si aspetta, la
   stessa del test di Pericolo di chi fugge attraverso un'unita'
   (`charge.js`, `perilAsk`). Le due cose si somigliano e non sono la
   stessa: quella e' a 4+ e sta a p. 133, questa e' a 2+. */
export const DANGER_NEED = 2;

/* `ferrate`: Iron Shod Wheels, i carri che trattano il terreno
   difficile come pericoloso (il bosco e' difficile anche lui) */
export function dangerousAsk(models = 1, pieces = [], { ferrate = false } = {}){
  const n0 = Math.max(0, models | 0);
  const names = [];
  for (const p of pieces || []){
    if (!p || isDecoration(p)) continue;
    const c = catFor(p);
    if (!c.danger && !(ferrate && (c.id === "difficult" || c.id === "wood"))) continue;
    names.push(nameOf(p));
  }
  if (!names.length || !n0) return null;
  return {
    id:"terrenoPericoloso", kind:"d6", n: n0 * names.length, need: DANGER_NEED,
    models: n0, features: names.length, pieces: names,
    page: PAGE.cats,
    why: `test di terreno pericoloso, un dado per modello per ogni pezzo attraversato` +
         ` (${names.join(", ")}): con un 1 il modello perde una ferita (p. ${PAGE.cats})`,
  };
}

/* Quante ferite ha fatto il terreno: gli 1 e nient'altro. Sta qui e non
   in chi tira i dadi perche' la soglia e' una regola, non una scelta. */
export const dangerousLosses = (dice = []) =>
  (dice || []).filter(d => +d < DANGER_NEED).length;

/* L'OSTACOLO BASSO DIFESO (pp. 270 e 159).
   Chi sta dietro un muretto lo difende portandoci contro la prima
   fila. Chi lo carica non lo scavalca: si ferma a contatto dall'altra
   parte — e per questo non prende il dado peggiore, perche' il muretto
   non lo attraversa — ma la sua carica e' disordinata, e perde il
   bonus di Iniziativa (p. 146). Chi vola no: passa sopra e carica
   normale.

   E' l'ultima delle cose che il §5 del piano chiedeva al terreno, e
   l'unica che non era scritta da nessuna parte. */
export function defendedObstacle({ defended = false, fly = false } = {}){
  return {
    defended: !!defended, fly: !!fly,
    disordered: !!defended && !fly,
    /* chi carica un ostacolo difeso non lo attraversa: niente −1 al
       Movimento e niente dado peggiore per quel muretto */
    crosses: !defended,
    why: !defended ? ""
       : fly ? `l'ostacolo e' difeso, ma chi vola ci passa sopra e carica normale (p. ${PAGE.obstacles})`
       : `l'ostacolo basso e' difeso: si arriva a contatto dall'altra parte senza scavalcarlo,` +
         ` e la carica e' disordinata — niente bonus di Iniziativa (p. ${PAGE.obstacles})`,
    page: PAGE.obstacles,
  };
}

const TREASURE_CLEAR = 3;      // pollici minimi da ogni elemento scenico
const BM_MAX_SIDE = 12;        // limite Battle March sul lato lungo
export { TERRAIN, TREASURE_CLEAR, BM_MAX_SIDE };
