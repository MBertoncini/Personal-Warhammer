/* Schieramento Old World — tipi di elemento scenico
 *
 * Un pezzo di terreno sul tavolo porta due informazioni che il disegno
 * da solo non da', e da quelle due discende quasi tutto il resto del
 * capitolo del terreno (Core Rulebook 2023, pp. 269-270):
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
 * del §1 del piano — l'app propone, non impedisce.
 */

/* ============================================================
   1 · LE SETTE CATEGORIE
   `slow` costa movimento; `worstDie` fa tenere il dado peggiore del
   tiro di carica; `danger` chiede il test di terreno pericoloso;
   `disorder` toglie i ranghi a chi ci sta dentro; `cover` e' il
   riparo dal tiro; `los` taglia la linea di vista.
   ============================================================ */
const CATS = {
  open:      { label:"Aperto",        slow:false, worstDie:false, danger:false, disorder:false, cover:"",     los:false },
  difficult: { label:"Difficile",     slow:true,  worstDie:true,  danger:false, disorder:true,  cover:"",     los:false },
  dangerous: { label:"Pericoloso",    slow:true,  worstDie:true,  danger:true,  disorder:true,  cover:"",     los:false },
  impassable:{ label:"Impassabile",   slow:false, worstDie:false, danger:false, disorder:false, cover:"hard", los:true  },
  lowWall:   { label:"Ostacolo basso",slow:false, worstDie:false, danger:false, disorder:true,  cover:"hard", los:false },
  highWall:  { label:"Ostacolo alto", slow:true,  worstDie:false, danger:false, disorder:true,  cover:"hard", los:true  },
  wood:      { label:"Bosco",         slow:true,  worstDie:true,  danger:false, disorder:true,  cover:"soft", los:"soft" },
};
export const CATEGORIES = CATS;
export const CAT_IDS = Object.keys(CATS);

/* Il bosco ha la penombra: due unita' che stanno tutte e due fuori non
   si vedono attraverso, chi ci sta dentro vede e si fa vedere entro un
   raggio corto. `los:"soft"` e' il segnale che la linea di vista qui
   non e' un si'/no ma dipende da chi guarda e da dove. */
export const WOOD_SIGHT = 3;     // pollici, dentro il bosco

/* ============================================================
   2 · I PEZZI
   `cover` dice quanto ripara chi ci sta dentro o dietro dal tiro:
   niente, leggera (-1 per colpire), pesante (-2). E' l'unica cosa che
   il tipo di elemento sa dire da solo; il resto lo decidono i due
   giocatori guardando il pezzo vero.
   ============================================================ */
const TERRAIN = {
  hill:     { label:"Collina",  color:"var(--t-hill)",     shape:"rect",   pass:"open",     los:false, cover:"",     w:10, h:6,     cat:"open",       natural:true  },
  wood:     { label:"Bosco",    color:"var(--t-wood)",     shape:"rect",   pass:"difficult",los:true,  cover:"soft", w:8,  h:6,     cat:"wood",       natural:true  },
  marsh:    { label:"Palude",   color:"var(--t-marsh)",    shape:"rect",   pass:"difficult",los:false, cover:"",     w:9,  h:5,     cat:"dangerous",  natural:true  },
  ruins:    { label:"Rovine",   color:"var(--t-ruins)",    shape:"rect",   pass:"difficult",los:true,  cover:"hard", w:6,  h:5,     cat:"highWall",   natural:false },
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
export function catOf(t){
  const cfg = TERRAIN[t && t.kind] || {};
  const id = (t && t.cat) || cfg.cat || "open";
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

const TREASURE_CLEAR = 3;      // pollici minimi da ogni elemento scenico
const BM_MAX_SIDE = 12;        // limite Battle March sul lato lungo
export { TERRAIN, TREASURE_CLEAR, BM_MAX_SIDE };
