/* Schieramento Old World — l'arbitro
 *
 * Tutto quello che c'era prima di questo file sapeva CALCOLARE e non
 * sapeva APPLICARE. `meleeRound` torna dei cloni; `shootRoll` torna un
 * numero di perdite; `chargeOutcome` torna «arriva» o «non arriva». Chi
 * prendeva quei risultati e li scriveva sui pezzi era `deploy.js`, che
 * e' cinquemila righe di pagina: dita, pannelli, disegno. Senza una
 * pagina davanti, l'app non sapeva giocare una partita.
 *
 * Questo modulo e' l'arbitro che mancava. Tiene uno stato, sa in che
 * punto del turno si e', dice QUALI GESTI SONO LEGALI ADESSO, e quando
 * gliene si passa uno tira i dadi, applica le regole e scrive una riga
 * di registro che dice cosa e' successo e da quale pagina viene.
 *
 * Tre cose lo tengono onesto:
 *
 *   NON SA LE REGOLE. Le sanno i moduli — `charge.js`, `combat.js`,
 *   `melee.js`, `shoot.js`, `psych.js`, `victory.js` — e qui si
 *   chiamano. Se una regola e' sbagliata si corregge dove abita, e
 *   l'arbitro non se ne accorge nemmeno.
 *
 *   NON DECIDE. Le decisioni — chi carica chi, dove si muove, a chi si
 *   spara — le prende chi gioca: un umano, un'euristica, un modello di
 *   linguaggio. L'arbitro elenca le mosse legali e applica quella
 *   scelta, e quando chi gioca sbaglia lo dice invece di aggiustare.
 *
 *   DICE COSA NON SA. Le semplificazioni sono elencate in `LIMITI`, e
 *   ognuna esce nel registro la prima volta che conta. Una partita
 *   giocata da un arbitro che tace non insegna niente: quella riga che
 *   dice «qui l'app fa cosi', il manuale direbbe cosi'» e' meta' del
 *   valore di tutto il progetto.
 *
 * Niente DOM, niente archivio, niente rete: entrano due liste, esce una
 * partita.
 */

import { MM, inch } from './util.js';
import { boxCorners, polyDistance, polysOverlap, pointInRect, distPointToBox, boxRadius, toWorld } from './geom.js';
import * as FM from './formation.js';
import * as MV from './movement.js';
import * as CH from './charge.js';
import * as CB from './combat.js';
import * as ML from './melee.js';
import * as SH from './shoot.js';
import * as PS from './psych.js';
import * as VC from './victory.js';
import * as PREP from './prep.js';
import * as MG from './magic.js';
import * as EF from './effects.js';
import { splitStat, moveInfo } from './profiles.js';
import { roll, d3, leadershipTest, stat, rankBonus, woundOn, saveOn, hitMelee, chance as chanceOf } from './rules.js';
/* Il dado di deviazione e quello di artiglieria non passano da
   `rules.js`, che riesporta solo i cubi: la deviazione e' un gesto
   suo — una direzione piu' una distanza — e `dice.js` lo tira gia'
   intero, con il Mancato Colpo dentro (p. 95). */
import { scatter as deviazione, rollDice, contesto as contestoDadi } from './dice.js';
import { SCENARIOS, geometry } from './scenarios.js';
import { troopType, unitStrength } from './troops.js';
import { troopOf } from './mounts.js';
import { readRules, splitWeaponRules } from './rulebook.js';
import { TERRAIN } from './terrain.js';
import * as TR from './terrain.js';
import * as SG from './sight.js';
import * as MN from './minacce.js';
import { objectiveHolder, OBJECTIVE_RANGE, OBJECTIVE_US } from './battlemarch.js';

/* ============================================================
   0 · QUELLO CHE QUESTO ARBITRO NON FA
   Si dichiara qui, in cima, e si stampa nel registro: sono le regole
   che il manuale ha e la partita non gioca. Ognuna e' una riga di
   lavoro futuro, non una scusa.
   ============================================================ */
export const LIMITI = [
  { id:"domini",    what:"la magia non si gioca in questa partita", page:106,
    why:"i domini (`dati/magia/domini.json`) non sono stati passati all'arbitro: chi lo usa li carica con `useMagic` o li dà a `newBattle`" },
  { id:"amano",     what:"gli incantesimi che l'app non sa applicare non si offrono", page:107,
    why:"vortici, trasporti, sagome e linee sono testo da leggere: l'arbitro offre solo quelli che portano colpi con i loro dadi, modifiche o bandierine, e un mago che conosce solo gli altri non lancia" },
  { id:"livello",   what:"il Livello di un mago è quello di base del suo libro", page:106,
    why:"il file di New Recruit non scrive il Livello comprato come opzione: se la scheda di preparazione non lo dice, un Livello pagato in più non si vede" },
  { id:"assalti",   what:"gli assalti si lanciano prima che il combattimento cominci", page:158,
    why:"il libro li vuole al passo d'Iniziativa del mago; e le loro ferite tolgono modelli ma non entrano nel risultato del combattimento, che `meleeFight` conta da sé" },
  { id:"armatura",  what:"un mago con armatura lancia lo stesso", page:111,
    why:"la pelle callosa degli Skink Priest conta come armatura leggera, e letto alla lettera il libro toglierebbe loro il lancio: finché una FAQ non lo chiarisce il divieto non si applica" },
  { id:"sagome",    what:"delle macchine da guerra l'arbitro spara la Bombardata, e non la palla di cannone, la grappola, l'organo e il lanciafiamme", page:226,
    why:"la Bombardata sceglie un punto, devia e guarda chi resta sotto, e quella si gioca (pp. 224-226); la palla di cannone vuole la linea che rimbalza con il «Crunch», e le altre tre vogliono ognuna la sua procedura" },
  { id:"bombardata", what:"un'arma a Bombardata di cui i libri in casa non dicono la sagoma non spara", page:224,
    why:"quale sagoma usa sta nelle Note del profilo, e l'export di New Recruit le butta via: fra la sagoma da tre pollici e quella da cinque ce ne sono due di diametro, e sceglierne una a caso vuol dire sbagliare in silenzio" },
  { id:"macchina", what:"una macchina da guerra non marcia, non carica e non insegue, e si gira gratis", page:197,
    why:"«Weapon of War» (p. 197) le toglie la marcia, la dichiarazione di carica e l'inseguimento, e le lascia il giro libero in qualunque momento del suo turno; quello che l'arbitro non le dà è il giro che NON conta come essersi mossa, e il profilo diviso macchina/equipaggio (p. 97), che l'app tiene in una riga sola" },
  { id:"fulmine",   what:"la linea del Warp Lightning Cannon si punta su un nemico che si vede, e l'Energy Overload la rigira senza ritirarne la lunghezza", page:19,
    why:"il libro dice «draw a straight line, 8D6\" in length, from the model's base edge» e non dice né che serva la linea di vista né che il guasto ritiri la lunghezza (Legends: Skaven, p. 19): l'arbitro mira a un nemico che vede, e sul guasto tiene la linea già tirata e le cambia direzione" },
  { id:"indiretto", what:"la Bombardata si spara sempre a vista", page:225,
    why:"il tiro indiretto non chiede la linea di vista e devia di meno — l'Artiglieria meno l'Abilità Balistica dell'equipaggio — ed è una scelta che si dichiara prima di sparare: l'arbitro non la offre" },
  { id:"ruota",     what:"la ruota si paga giusta, ma si fa una volta sola, all'inizio, e sul centro", page:124,
    why:"il libro la fa girare su uno spigolo del fronte e lascia alternare ruote e passi avanti: l'arbitro conta quanto cammina il modello esterno, gira il pezzo sul posto e poi va dritto. Il giro libero dei Lumbering (p. 195) si fa prima di muovere invece che dopo" },
  { id:"manovre",   what:"chi riordina le file o si riforma non usa il resto del movimento, e la riforma tiene il fronte che aveva", page:125,
    why:"il riordino costa metà del Movimento e l'altra metà si potrebbe camminare; la riforma può anche cambiare la formazione. Dopo un giro si va solo dritti" },
  { id:"vagante",   what:"il Movimento che si tira si gioca nelle mosse, e l'inseguimento non carica", page:176,
    why:"chi ha Random Movement si muove nella casella delle mosse insieme a tutti gli altri, invece che in una sottofase delle mosse obbligatorie tutta sua; va dritto o verso un nemico e, se lo tocca, carica (p. 176). Se invece arriva addosso a un'unità nuova mentre insegue, l'arbitro lo ferma a contatto come fa con tutti, e non conta come carica" },
  { id:"abominio",  what:"gli Abominable Attacks si risolvono prima che si meni", page:144,
    why:"l'Hell Pit Abomination si nutre o travolge prima di tutti gli altri, non al suo passo d'Iniziativa: le ferite che fa entrano nel risultato del combattimento, ma chi cade non mena più. Con Iniziativa 4 è quasi sempre fra i primi" },
  { id:"campioni",  what:"le sfide le lanciano e le raccolgono solo i personaggi, non i campioni d'unità", page:211,
    why:"il libro dice «un personaggio o un campione»; il file di New Recruit segna che il gruppo di comando c'è (`command.champion`) e non dà al campione un profilo suo, e senza profilo non si può duellare" },
  { id:"sciami",    what:"Spawn of Sotek guarisce le ferite appese di uno Jungle Swarm, e non rimette in campo le basette già tolte", page:115,
    why:"il testo dice «regains D3 lost Wounds» e non dice se una basetta tolta torni in piedi: l'arbitro cura quello che il pezzo ha ancora addosso" },
  { id:"ritirato",  what:"chi si ritira da una sfida esce dal combattimento, ma tiene il passo e la Forza d'Unità del reggimento", page:211,
    why:"il libro dice che non dà più niente all'unità, «Comando, regole speciali o qualunque altra cosa»: l'arbitro gli toglie i colpi, il Comando e le regole, e gli lascia quello che non saprebbe togliere senza farlo uscire dal reggimento" },
  { id:"oggetti",   what:"gli oggetti magici non fanno niente", page:0,
    why:"i cataloghi li scrivono come testo libero: l'app li mostra e non li applica" },
  { id:"trofei",    what:"gli stendardi presi come trofeo non contano nel punteggio", page:200,
    why:"il bonus c'è (25 punti in Battle March, 50 nel Core Rulebook), ma l'arbitro non segna chi ha preso lo stendardo di un'unità travolta" },
  { id:"fuori",     what:"un'unità che non trova posto nella sua zona resta fuori dalla partita", page:115,
    why:"l'arbitro prova le cinque colonne, poi i varchi fra le unità già schierate, poi un fronte più largo; se niente basta la lascia fuori e lo scrive nel registro. Non combatte, e nei punti vittoria conta come intera: l'avversario non ne prende. Che cosa dica il manuale di un'unità che nella zona non ci sta non è stato controllato" },
  { id:"bordo",     what:"chi cede terreno contro il bordo del tavolo si ferma lì", page:134,
    why:"il libro dice dove si ferma chi cede terreno — un'unità, il terreno, un pollice da un nemico — e del bordo non dice niente" },
  { id:"volo",      what:"chi vola scavalca il terreno ma non le unità", page:0,
    why:"il numero lo dà `profiles.js`, e il terreno lo ignora — impassabile, difficile, pericoloso, ostacolo difeso; sorvolare le unità e atterrare vogliono la geometria del volo, che non c'è" },
  { id:"pericoloso", what:"il test di terreno pericoloso lo tirano tutti i modelli dell'unità", page:269,
    why:"il libro lo fa tirare a ogni modello che ci comincia, ci passa o ci finisce dentro: l'arbitro misura il percorso con cinque linee — il centro e i quattro angoli — e non sa dire quali modelli ci siano passati davvero, quindi li conta tutti" },
  { id:"cammino",   what:"il terreno attraversato si misura su cinque linee, non sulla sagoma che scorre", page:269,
    why:"«una parte qualsiasi dell'unità» vorrebbe il rettangolo intero trascinato lungo il percorso: l'arbitro guarda il centro e i quattro angoli, che è molto meglio della linea sola di prima e non è ancora la regola" },
  { id:"seguire",   what:"chi vince segue sempre chi cede terreno, e non segue mai chi ripiega in ordine", page:134,
    why:"seguire o fermarsi è una scelta di chi gioca, e l'arbitro qui non la offre" },
  { id:"ridirezione", what:"chi vede fuggire il bersaglio della carica non la ridirige su un altro", page:121,
    why:"tira comunque, e se non raggiunge chi fugge fa la carica fallita" },
  { id:"attraversare", what:"chi fugge passa attraverso le unità senza il test di Pericolo", page:133,
    why:"il test c'è in `charge.js` (`perilAsk`), ma vuole sapere quali modelli hanno attraversato" },
  { id:"ingombro",  what:"chi trova la strada chiusa si ferma, gira un poco, o la aggira scegliendo un varco: nessuno cerca un cammino", page:122,
    why:"il percorso è una linea con qualche deviazione, non una ricerca di strada. Quando la chiude un pezzo impassabile l'arbitro offre i due varchi ai suoi fianchi (p. 270) e chi gioca sceglie — ma guarda un ostacolo solo, quello che ha davanti adesso: un secondo pezzo dietro al primo si scopre arrivandoci" },
  { id:"stupidita", what:"la Stupidità è quella del testo che la lista porta", page:178,
    why:"ferma, niente tiro né magia, e se caricata tiene la posizione; il Core Rulebook a p. 178 ne stampa un'altra versione — si muove in avanti nelle mosse obbligate, non marcia e non carica — e l'arbitro gioca quella della lista, che è la più recente" },
  { id:"frenesia",  what:"chi è frenetico o impetuoso non è obbligato a caricare", page:170,
    why:"`psych.js` sa l'obbligo (`mustCharge`), ma l'arbitro lascia la carica a chi gioca" },
  { id:"genere",    what:"un personaggio a piedi entra solo nella fanteria, uno a cavallo solo nella cavalleria", page:207,
    why:"il libro dice che ci si unisce «salvo che il tipo di truppa lo impedisca» senza fare l'elenco: questa è la lettura dell'app" },
  { id:"solitari",  what:"un personaggio da solo si bersaglia sempre, e non schiva l'inseguimento", page:206,
    why:"la protezione dei 3″ da un reggimento amico e la schivata vogliono il conto dei modelli vicini, che l'arbitro non fa" },
  { id:"pauramischia", what:"chi fallisce la Paura in un combattimento con più nemici ha −1 per colpire contro tutti", page:168,
    why:"il libro lo toglie solo a chi dirige i colpi contro chi fa Paura, e la schiera di `combat.js` ha una bandierina sola" },
];

/* Le caselle del turno che questo arbitro gioca. Sono meno delle
   sedici di `phases.js`, e la differenza e' dichiarata: non c'e' la
   sotto-fase di comando, e le mosse restanti sono un passo solo. La
   magia non ha una casella per se': il libro la sparge nel turno
   (p. 108), e qui sta dove lui la mette — la congiurazione per
   potenziamenti e maledizioni, il tiro per i dardi, la mischia per gli
   assalti. */
export const CASELLE = [
  { id:"congiura", fase:"Strategia",    page:108, what:"i maghi lanciano potenziamenti e maledizioni" },
  { id:"raduno",  fase:"Strategia",     page:117, what:"chi fugge prova a fermarsi" },
  { id:"cariche", fase:"Movimento",     page:118, what:"si dichiarano le cariche, e chi le subisce reagisce" },
  { id:"mosse",   fase:"Movimento",     page:122, what:"chi non ha caricato avanza, marcia, manovra o resta fermo" },
  { id:"tiro",    fase:"Tiro",          page:136, what:"chi ha un'arma da tiro sceglie un bersaglio" },
  { id:"mischia", fase:"Corpo a corpo", page:144, what:"ogni combattimento si risolve, con il test di rotta e l'inseguimento" },
];

/* ============================================================
   1 · IL TAVOLO
   ============================================================ */
const r1 = n => Math.round((+n || 0) * 10) / 10;
const alive = u => Math.max(0, (u.models || 0) - (u.lost || 0));
const onBoard = u => u.placed && !u.dead;
const isJoined = u => FM.joinedHost(u) != null;

/* La forma di un'unita' — quanti modelli per fila, quanto e' larga,
   quanto e' profonda — si ricalcola solo quando cambia qualcosa che la
   riguarda. `formation.js` la costruisce modello per modello, ed e' il
   conto piu' caro di tutta la partita: rifarlo a ogni domanda di
   geometria costava piu' di tutto il resto messo insieme. */
const layCache = new Map();
export function layoutOf(u, units = []){
  const chars = FM.attachedTo(units, u);
  const key = [u.name, alive(u), u.models, u.frontage, u.baseW, u.baseH, u.loose ? 1 : 0,
               JSON.stringify(u.form || null), (u.fallen || []).join("."), chars.length].join("|");
  const hit = layCache.get(u.uid);
  if (hit && hit.key === key) return hit.lay;
  const lay = FM.layout(u, { alive: alive(u), attached: chars });
  layCache.set(u.uid, { key, lay });
  return lay;
}
export function boxOf(u, units = []){
  const lay = layoutOf(u, units);
  return { x: u.x, y: u.y, w: lay.w, h: lay.h, rot: u.rot || 0 };
}
export const cornersOf = (u, units = []) => boxCorners(boxOf(u, units));
export const usOf = u => unitStrength(u.troop, u.us, u.models, alive(u), stat((u.stats || {}).W));
/* le ferite gia' prese dal modello che sta ancora in piedi, e quante
   ne ha: un Bastiladon a una ferita dalla fine si scriveva «1/1» */
export const feriteDi = u => ({ prese: Math.max(0, u.wounds || 0), per: CB.combatant(u).w || 1 });

/* Da una lista salvata a un esercito sul tavolo. Le unita' sono quelle
   del file, con addosso i campi che il tavolo aggiunge: dove stanno,
   quanti ne sono caduti, se stanno fuggendo. */
export function armyFrom(lista, army, from = 0){
  /* Tre unita' che si chiamano tutte «Skink Skirmishers» fanno un
     registro in cui non si capisce chi ha sparato: le omonime prendono
     un numero. Il nome del libro resta in `baseName`, che e' quello con
     cui si cercano i profili. */
  /* le risposte della scheda di preparazione (`prep.js`) viaggiano con
     l'unita': e' li' che stanno il Livello e il dominio di un mago */
  const prep = PREP.prepOf(lista).units || {};
  const quante = new Map();
  for (const p of lista.units || []) quante.set(p.name, (quante.get(p.name) || 0) + 1);
  const visti = new Map();
  return (lista.units || []).map((p, i) => {
    const n = (visti.get(p.name) || 0) + 1;
    visti.set(p.name, n);
    const name = quante.get(p.name) > 1 ? `${p.name} ${n}` : p.name;
    return {
      uid: from + i + 1, army, ...p, name, baseName: p.name,
      x: 0, y: 0, rot: army === "A" ? 0 : 180,
      placed: false, lost: 0, dead: false, fled: false, wounds: 0,
      fallen: [], effects: [], anchor: null,
      prepara: prep[i] || null,
    };
  });
}

/* `magia` e' quello che torna `makeMagic`: senza, vale quello che
   `loadMagic` o `useMagic` hanno lasciato in memoria. */
/* `durata` e' una di `VC.LENGTHS`: senza, quella del formato dello
   scenario — cinque round in Battle March (p. 27), sei nel Core
   Rulebook (p. 286). Il punto di rottura va chiesto: e' la durata di
   uno scenario (p. 291), non una regola di tutte le partite. */
/* `def` e' la scheda dello scenario quando non sta in `SCENARIOS`: gli
   scenari salvati dal tavolo vivono nell'archivio del browser, e
   l'arbitro — che gira anche fuori dal browser — non li va a cercare. */
/* `primo`: "tira" (il libro: due tiri, vedi CHI COMINCIA) oppure "A" o
   "B", per chi vuole una partita in cui quella parte schiera e muove per
   prima comunque — le prove che guardano un gesto preciso, e chi
   rigioca una partita di prima dei tiri. */
export function newBattle({ A, B, scenario = "bm-strada", def = null, nomi = null, magia = null, durata = null,
                            primo = "tira" } = {}){
  const sc = def || SCENARIOS[scenario] || SCENARIOS["bm-strada"];
  const formato = VC.formatFor(sc);
  const lunga = durata === "breakpoint" || durata === "fixed" || durata === "bm" ? durata : VC.defaultLength(formato);
  const [tw, th] = sc.table;
  const W = tw * MM, H = th * MM;
  const geo = geometry(sc.deploy, W, H, (sc.gap || 6) * MM);
  const units = [...armyFrom(A, "A", 0), ...armyFrom(B, "B", 500)];
  const S = {
    scenario, sc, table: { w: W, h: H, wIn: tw, hIn: th },
    zones: geo.zones,
    /* Il terreno nella forma che `charge.js` e `tactics.js` si
       aspettano: la scatola, i quattro angoli e la domanda «questo
       punto ci sta dentro?». E' la stessa che il tavolo passa agli
       aiuti tattici, perche' le regole della vista sono quelle e non
       vanno riscritte qui.

       Quello che qui non c'era, e che e' costato all'arbitro tutto il
       capitolo del terreno, e' la CATEGORIA. `blocks` e `cover` si
       leggevano da due espressioni regolari sul nome del tipo — un
       bosco «blocca», le rovine «riparano leggera» — e il resto (il
       pollice in meno, il dado peggiore, i ranghi persi, il test di
       terreno pericoloso) non si leggeva affatto, perche' non c'era
       niente da cui leggerlo. `catOf` e `coverOf` lo dicono, e lo
       dicono dallo stesso posto da cui lo dice il tavolo. */
    terrain: (sc.terrain || []).map((t, i) => {
      const box = { x: t.x * MM, y: t.y * MM, w: (t.w || 2) * MM, h: (t.h || 2) * MM, rot: t.rot || 0 };
      const cfg = TERRAIN[t.kind] || {};
      const cat = TR.catOf(t);
      return {
        tid: i + 1, kind: t.kind, label: cfg.label || t.kind, box, poly: boxCorners(box), circle: false,
        x: box.x, y: box.y, w: box.w, h: box.h, rot: box.rot,
        cat, natural: TR.isNatural(t),
        /* la larghezza vera, in pollici, sta qui: `w` e `h` di questo
           oggetto sono millimetri, e la regola delle decorazioni si
           misura in pollici (p. 271) */
        decor: TR.isDecoration(t),
        blocks: cfg.los === true,
        cover: TR.coverOf(t),
        contains: p => Math.abs(p[0] - box.x) <= box.w / 2 && Math.abs(p[1] - box.y) <= box.h / 2,
      };
    }),
    units,
    nomi: nomi || { A: A.name || "Esercito A", B: B.name || "Esercito B" },
    punti: { A: (A.units || []).reduce((s, u) => s + (u.pts || 0), 0),
             B: (B.units || []).reduce((s, u) => s + (u.pts || 0), 0) },
    usStart: { A: 0, B: 0 },
    turno: 1, army: primo === "B" ? "B" : "A", casella: 0, schierando: true,
    /* chi comincia: con «tira» lo si sa solo a schieramento finito, e
       fino ad allora e' null; `chiSchiera` e' chi mette la prima unita' */
    primo: primo === "A" || primo === "B" ? primo : null,
    primoFisso: primo === "A" || primo === "B",
    chiSchiera: primo === "A" || primo === "B" ? primo : null,
    finitoPrima: null, tiriPrimo: [],
    formato, durata: lunga, rounds: VC.roundsFor(lunga) || null, finita: false, esito: null,
    /* chi teneva gli obiettivi alla fine di ogni turno di giocatore:
       e' la forma che `VC.objectivePoints` somma */
    fineTurni: [],
    log: [], detto: new Set(), pending: null,
    /* le unita' rimaste fuori dal tavolo allo schieramento, con il
       perche': gli strumenti le stampano (`partita.mjs`, `serie.mjs`) */
    fuori: [],
    /* Le sfide in corso, una per combattimento: i due modelli che si
       sono presi a parte. Restano fra un turno e l'altro perche' il
       libro lo dice — «se sopravvivono tutti e due e il combattimento
       continua, la sfida continua» (p. 212) — e finche' c'e' non se ne
       lancia un'altra in quel combattimento. */
    sfide: [],
    /* la magia che si ricorda fra un gesto e l'altro: chi ha gia'
       tentato la sorte in questo turno, e chi dopo un fiasco non lancia
       o non dissolve piu' (pp. 109-110) */
    magia: { M: null, fato: {}, stop: {} },
    preparando: false,
  };
  S.usStart.A = totalUS(S, "A");
  S.usStart.B = totalUS(S, "B");
  /* Il generale: quello che la preparazione della lista dice, e se
     tace quello che `prep.js` propone — il personaggio che lo dichiara,
     o il Comando piu' alto. */
  const genDi = (l, from) => {
    const p = PREP.prepOf(l);
    const i = p.general != null ? p.general : PREP.guessGeneral(l);
    return i != null && (l.units || [])[i] ? from + i + 1 : null;
  };
  S.generale = { A: genDi(A, 0), B: genDi(B, 500) };
  /* chi porta lo stendardo da battaglia: serve al punteggio, perche'
     perderlo vale punti all'altro (Battle March p. 27, p. 286) */
  const bsbDi = (l, from) => {
    const p = PREP.prepOf(l);
    const i = p.bsb != null ? p.bsb : PREP.guessBsb(l);
    return i != null && (l.units || [])[i] ? from + i + 1 : null;
  };
  S.bsb = { A: bsbDi(A, 0), B: bsbDi(B, 500) };
  const M = magia || MG.magicNow();
  S.magia.M = M && M.ok ? M : null;
  preparaMaghi(S);
  return S;
}

/* Il Comando del generale: chi gli sta entro il raggio usa il suo
   valore invece del proprio, se e' piu' alto. Prima l'arbitro non lo
   applicava affatto, e un reggimento a sei pollici dal suo Warboss
   tirava i test di rotta con il proprio Comando 6. Il raggio e' quello
   di p. 202: 12″ per il generale, qualunque sia il suo Comando, e 18″
   se e' un Large Target. Il generale in fuga non ispira nessuno. */
export const RAGGIO_GENERALE = 12;
/* e 18″ se il generale e' un Large Target o ne cavalca uno (p. 202) */
export const RAGGIO_GENERALE_GRANDE = 18;
const grande = u => ((u && u.rules) || []).some(r => /^large target/i.test(String(r)));
function comandoGenerale(S, u){
  const g = byUid(S, (S.generale || {})[u.army]);
  if (!g || g === u || g.dead || g.fled) return null;
  const host = isJoined(g) ? byUid(S, FM.joinedHost(g)) : g;
  if (!host || !onBoard(host)) return null;
  const d = host === u ? 0 : distanza(S, u, host);
  if (d > (grande(g) ? RAGGIO_GENERALE_GRANDE : RAGGIO_GENERALE)) return null;
  const c = CB.combatant(g);
  const ld = +(c.ldBase != null ? c.ldBase : c.ld) || 0;
  return ld ? { ld, nome: g.name, d } : null;
}
/* il Comando con cui l'unita' tira, e da dove viene. `zitto` e' per
   le opzioni, che guardano e non scrivono nel registro. */
function comandoDi(S, u, proprio, { zitto = false } = {}){
  const g = comandoGenerale(S, u);
  if (!g || g.ld <= proprio) return { ld: proprio, why: "" };
  return { ld: g.ld, why: `Comando ${g.ld} di ${g.nome}, a ${g.d}″` };
}

const totalUS = (S, army) => S.units
  .filter(u => u.army === army && !u.dead).reduce((s, u) => s + usOf(u), 0);

/* ============================================================
   2 · IL REGISTRO
   Ogni riga dice chi, cosa, con quali dadi e da che pagina. E' quello
   che resta della partita, ed e' l'unica cosa che una partita giocata
   da due macchine lascia a chi la legge.
   ============================================================ */
/* `x` e' la spiegazione della riga, per chi guarda la partita e vuole
   sapere perche': i dadi, il numero da battere e le cose che li hanno
   spostati, ognuna con la sua fonte. La forma e' scritta in cima a
   `spiega.js`, che ne fa la scheda sul tavolo. */
function say(S, text, { page = 0, dice = null, groups = null, army = "", kind = "", x = null } = {}){
  const riga = { turno: S.turno, army: army || S.army, casella: CASELLE[S.casella] ? CASELLE[S.casella].id : "",
                 text, page, dice, kind };
  if (groups && groups.length) riga.groups = groups;
  if (x) riga.x = x;
  S.log.push(riga);
  return riga;
}
/* un limite si dice una volta sola, quando conta */
function limite(S, id){
  if (S.detto.has(id)) return;
  const l = LIMITI.find(x => x.id === id);
  if (!l) return;
  S.detto.add(id);
  say(S, `[limite] ${l.what}: ${l.why}.`, { page: l.page, kind: "limite" });
}

/* ============================================================
   3 · CHI E' DOVE
   ============================================================ */
/* I personaggi uniti a un reggimento (p. 207), e chi puo' unirsi a chi. */
export const capiDi = (S, u) => FM.attachedTo(S.units, u);
/* I capi che stanno ancora in prima fila. Chi ha rifiutato una sfida
   si e' ritirato in fondo alle file, e «non conferisce all'unita'
   nessun beneficio in forma di Comando, regole speciali o qualunque
   altra cosa» (p. 211): sparisce da tutti i conti del combattimento.
   Il passo e la Forza d'Unita' gli restano, ed e' il limite `ritirato`. */
export const capiInFila = (S, u) => capiDi(S, u).filter(c => !c.ritiro);
const GENERE = { regularInfantry:"fanteria", heavyInfantry:"fanteria", monstrousInfantry:"fanteria",
                 lightCavalry:"cavalleria", heavyCavalry:"cavalleria", monstrousCavalry:"cavalleria" };
const genere = u => GENERE[troopType(troopOf(u)).id] || "";
const indomito = u => ((u && u.rules) || []).some(r => /^unbreakable/i.test(String(r)));
/* Un personaggio che puo' unirsi: fanteria o cavalleria, un modello
   solo, e non gia' dentro qualcuno (p. 206). I carri e i mostri
   cavalcati no: la loro formazione e' quella della cavalcatura. */
export const puoUnirsi = (S, c) => PREP.isCharacter(c) && !!genere(c) && (c.models || 1) === 1 &&
                                   !c.dead && !isJoined(c);
/* Chi lo puo' ospitare: un reggimento amico dello stesso genere, che
   non sia a sua volta un personaggio (p. 207: due personaggi non fanno
   un'unita'), e con l'Unbreakable uguale (p. 179). */
function puoOspitare(S, c, h){
  if (h === c || h.army !== c.army || h.dead || !onBoard(h) || isJoined(h)) return false;
  if (PREP.isCharacter(h) || genere(h) !== genere(c)) return false;
  /* Lumbering non ospita nessuno (p. 195), e a chi e' Clumsy si unisce
     solo chi e' Clumsy anche lui */
  if (FM.isLumbering(h) || !FM.clumsyOk(c, h)) return false;
  return indomito(h) === indomito(c);
}
/* La Forza d'Unita' con i personaggi dentro (p. 207): e' quella che la
   Paura confronta. */
export const usConCapi = (S, u) => usOf(u) + capiDi(S, u).reduce((t, c) => t + usOf(c), 0);

export const unitsOf = (S, army) => S.units.filter(u => u.army === army && !u.dead && !isJoined(u));
export const inCampo = (S, army) => unitsOf(S, army).filter(onBoard);
export const nemiciDi = (S, u) => inCampo(S, u.army === "A" ? "B" : "A");

/* I contatti di basetta si guardano decine di volte per mossa — ogni
   opzione di carica, ogni «è ingaggiata?» — e sono un conto fra
   poligoni: calcolarli ogni volta faceva di una partita intera un
   minuto e mezzo. Si ricalcolano quando il tavolo cambia davvero, e la
   firma del tavolo e' dove sta ognuno e quanti ne restano. */
function firma(S){
  let f = "";
  for (const u of S.units){
    if (!u.placed || u.dead) continue;
    f += u.uid + ":" + Math.round(u.x) + "," + Math.round(u.y) + "," + Math.round(u.rot) + "," + (u.lost || 0) + ";";
  }
  return f;
}
export function contatti(S){
  const f = firma(S);
  if (S.cache && S.cache.firma === f) return S.cache.list;
  const list = FM.contactList(S.units.filter(u => !isJoined(u)), x => boxOf(x, S.units));
  S.cache = { firma: f, list };
  return list;
}
export function ingaggiata(S, u){
  return contatti(S).some(c => (c.a === u.uid || c.b === u.uid) &&
    (c.a === u.uid ? c.bArmy : c.aArmy) !== u.army);
}
export function distanza(S, a, b){
  return r1(inch(polyDistance(cornersOf(a, S.units), cornersOf(b, S.units))));
}
export const piuVicino = (S, u, lista = null) => {
  const l = (lista || nemiciDi(S, u)).slice().sort((x, y) => distanza(S, u, x) - distanza(S, u, y));
  return l[0] || null;
};

/* ============================================================
   3 bis · DOVE SI PUO' STARE
   Due unita' non stanno mai una dentro l'altra, e nessuno si ferma a
   meno di un pollice da un nemico con cui non combatte (p. 118). Prima
   l'arbitro spostava i centri in linea retta senza guardare nessuno, e
   una partita finiva con il carro dentro i cinghiali e il Warboss dentro
   il suo reggimento: il disegno era fedele, era il tavolo a essere
   sbagliato.
   ============================================================ */
const dentroTavolo = (S, poly) => poly.every(p =>
  p[0] >= -0.01 && p[1] >= -0.01 && p[0] <= S.table.w + 0.01 && p[1] <= S.table.h + 0.01);
export const sulTavolo = (S, u) => dentroTavolo(S, cornersOf(u, S.units));

/* Chi o cosa impedisce a `u` di stare in `box`. `ignora` sono gli uid
   che non contano (il bersaglio di una carica, chi combatte con lui);
   `unPollice` accende la distanza dai nemici; `bordo` il bordo. Torna
   null quando il posto e' libero. */
export function ingombro(S, u, box, { ignora = [], unPollice = true, bordo = true, gia = null,
                                      terreno = true } = {}){
  const poly = boxCorners(box);
  if (bordo && !dentroTavolo(S, poly)) return { chi: null, perche: "il bordo del tavolo" };
  /* Il terreno impassabile (p. 270): «non si attraversa durante la
     battaglia — le unita' devono girarci attorno». Questo controllo non
     c'era affatto: `ingombro` guardava le unita' e il bordo, e nelle
     partite dell'arbitro si camminava dentro il monolite e dentro la
     piramide come se fossero prati. Chi vola lo scavalca, ed e' l'unica
     cosa del volo che l'arbitro fa (vedi il limite `volo`). */
  if (terreno && !vola(u))
    for (const t of S.terrain){
      if (t.decor || !chiusoPer(u, t)) continue;
      /* il pezzo torna insieme al perche': chi offre le mosse deve
         sapere QUALE muro chiude la strada, per poter proporre di
         aggirarlo (`aggiramenti`) invece di riproporre ogni turno una
         marcia da otto pollici che ne fa zero */
      if (polysOverlap(poly, t.poly)) return { chi: null, terreno: t, perche: `${t.label} (p. 270)` };
    }
  for (const o of S.units){
    if (o === u || !onBoard(o) || isJoined(o) || ignora.includes(o.uid)) continue;
    const q = cornersOf(o, S.units);
    if (polysOverlap(poly, q)) return { chi: o, perche: o.name };
    if (unPollice && o.army !== u.army && !o.fled){
      /* chi parte gia' entro il pollice puo' allontanarsi, non avvicinarsi */
      const soglia = Math.min(MM - 0.5, gia && gia.has(o.uid) ? gia.get(o.uid) - 0.01 : Infinity);
      if (polyDistance(poly, q) < soglia) return { chi: o, perche: `${o.name} a un pollice (p. 118)` };
    }
  }
  return null;
}

/* Il percorso: si avanza a passi in una direzione e ci si ferma
   all'ultimo posto libero. Se la strada dritta si chiude subito si
   prova qualche grado a destra e a sinistra, e vince la direzione che
   avvicina di piu' alla meta. `verso` e' il punto da raggiungere;
   `rot` la rotazione con cui si viaggia. Torna i pollici fatti e,
   quando ci si ferma prima, cosa ha fermato. */
const PASSO = MM / 4;
function percorso(S, u, verso, pollici, { rot = u.rot || 0, ignora = [], unPollice = true,
                                         devia = true, bordo = true } = {}){
  const lay = layoutOf(u, S.units);
  const dx0 = verso[0] - u.x, dy0 = verso[1] - u.y;
  const base = Math.atan2(dy0, dx0);
  const max = Math.max(0, pollici) * MM;
  /* i nemici gia' entro il pollice alla partenza, con la loro distanza */
  const gia = new Map();
  const mio = cornersOf(u, S.units);
  const salta = [...ignora];
  for (const o of S.units){
    if (o === u || !onBoard(o) || isJoined(o)) continue;
    const q = cornersOf(o, S.units);
    /* chi e' gia' sovrapposto — un posto che l'arbitro non dovrebbe piu'
       produrre — non inchioda il pezzo: si lascia andare */
    if (polysOverlap(mio, q)){ salta.push(o.uid); continue; }
    if (unPollice && o.army !== u.army){
      const d = polyDistance(mio, q);
      if (d < MM) gia.set(o.uid, d);
    }
  }
  const opts = { ignora: salta, unPollice, bordo, gia };
  const prova = ang => {
    const cx = Math.cos(ang), cy = Math.sin(ang);
    const at = s => ({ x: u.x + cx * s, y: u.y + cy * s, w: lay.w, h: lay.h, rot });
    /* l'ultimo passo arriva fino in fondo: prima il ciclo si fermava
       all'ultimo quarto di pollice intero, e 1,94″ diventavano 1,75 */
    let fatto = 0, stop = null;
    for (let s = PASSO; max > 0.01; s += PASSO){
      const q = Math.min(s, max);
      const blocco = ingombro(S, u, at(q), opts);
      if (blocco){ stop = blocco; break; }
      fatto = q;
      if (q >= max) break;
    }
    /* l'ultimo quarto di pollice si rifinisce, per arrivare a filo */
    if (stop){
      let lo = fatto, hi = Math.min(fatto + PASSO, max);
      for (let k = 0; k < 6; k++){
        const mid = (lo + hi) / 2;
        if (ingombro(S, u, at(mid), opts)) hi = mid; else lo = mid;
      }
      fatto = lo;
    }
    const p = at(fatto);
    return { x: p.x, y: p.y, mm: fatto, stop, resta: Math.hypot(verso[0] - p.x, verso[1] - p.y), ang };
  };
  let best = prova(base);
  if (devia && best.stop && best.mm < max - 0.5){
    for (const g of [15, -15, 30, -30, 45, -45]){
      const alt = prova(base + g * Math.PI / 180);
      if (alt.resta < best.resta - 1) best = alt;
    }
  }
  return { ...best, pollici: r1(inch(best.mm)) };
}

/* sposta il pezzo, e con lui i personaggi che ci stanno dentro. Chi
   fugge fugge con loro (p. 207), e se il reggimento esce dal tavolo o
   viene travolto escono anche loro: sono i casi in cui `u.dead` arriva
   da una fuga. Un reggimento abbattuto nel combattimento invece lascia
   i suoi capi in piedi, e li stacca prima (`perdite`). */
function posa(S, u, x, y, rot = u.rot){
  u.x = x; u.y = y; u.rot = rot;
  for (const c of S.units.filter(o => FM.joinedHost(o) === u.uid && !o.dead)){
    c.x = x; c.y = y; c.rot = rot; c.placed = u.placed; c.fled = u.fled;
    if (u.dead){ c.dead = true; c.fledOff = u.fledOff; }
  }
}

/* ============================================================
   4 · LO SCHIERAMENTO (p. 115)
   A turno, un'unita' per volta, dentro la propria zona. L'arbitro
   propone i posti — cinque colonne, e i varchi quando sono piene — e
   chi gioca sceglie:
   la geometria resta qui, e chi decide non deve saper contare i
   millimetri.
   ============================================================ */
function zonaDi(S, army){
  const z = (S.zones[army] || [])[0];
  return z || { x: 0, y: 0, w: S.table.w, h: S.table.h };
}

/* ---- il terreno di un posto di schieramento (pp. 269-272) ----
   `postiPer` guardava le unita' amiche e i bordi della zona, e il
   terreno no: proponeva «centro, in prima fila» senza dire che al
   centro c'era un monolite. Chi sceglieva ci metteva un reggimento e
   se lo ritrovava murato per tutta la partita — e' la partita del
   2026-09-21, con i Black Orc dietro il monolite.

   Due domande, che al tavolo si fanno guardando il pezzo in mano:
   SU CHE COSA lo poso, e CHE COSA gli si para davanti. Il davanti si
   guarda per dodici pollici — due o tre turni di marcia — e dalla
   FACCIA, non dal centro: il monolite che frega e' quello che il
   fronte trova al primo passo.

   Un posto dentro un pezzo impassabile non si offre affatto: quello
   non e' uno schieramento discutibile, e' una posa illegale (p. 270),
   e per gli scenari di casa non capitava per fortuna e non per
   progetto — le zone stanno lontane dai pezzi centrali, ma un tavolo
   disegnato a mano non lo promette. */
const ORIZZONTE = 12;            // pollici, quanto avanti si guarda

function terrenoDelPosto(S, box, u = null){
  const poly = boxCorners(box);
  const utili = (S.terrain || []).filter(t => !t.decor && t.kind !== "treasure");
  const sotto = utili.filter(t => polysOverlap(poly, t.poly));
  const a = (box.rot || 0) * Math.PI / 180;
  const ux = Math.sin(a), uy = -Math.cos(a);
  const mm = ORIZZONTE * MM;
  /* i tre punti della faccia: i due spigoli davanti e il mezzo */
  const fronte = [[-box.w / 2, -box.h / 2], [0, -box.h / 2], [box.w / 2, -box.h / 2]]
    .map(p => toWorld(p, box));
  const davanti = [];
  for (const p of fronte)
    for (const hit of CH.crossed(p, [p[0] + ux * mm, p[1] + uy * mm], utili)){
      if (sotto.includes(hit) || davanti.includes(hit)) continue;
      davanti.push(hit);
    }
  davanti.sort((x, y) => polyDistance(poly, x.poly) - polyDistance(poly, y.poly));
  const muro = davanti.find(t => chiusoPer(u, t)) || null;
  /* Il pezzo si NOMINA e basta: che cosa fa lo dice la fotografia, una
     volta per tutte, e ripeterlo in ognuno dei quindici posti farebbe
     dell'elenco un muro di testo. Quello che resta e' il tag corto —
     quello che cambia la scelta guardando un posto accanto all'altro. */
  const tag = t => {
    const c = t.cat || {};
    return [c.danger ? "pericoloso" : "", c.disorder ? "niente ranghi" : "",
            t.cover ? "riparo" : "", c.slow ? "−1 al Movimento" : ""].filter(Boolean).join(", ");
  };
  const testo = [
    sotto.length ? `ci si posa dentro ${sotto.map(t =>
      t.label + (tag(t) ? ` (${tag(t)})` : "")).join(" e ")}` : "",
    muro ? `davanti, a ${r1(polyDistance(poly, muro.poly) / MM)}″, c'è ${muro.label}:` +
      ` non si attraversa, e di qui in avanti non si passa (p. 270)` : "",
    !muro && davanti.length ? `davanti, entro ${ORIZZONTE}″: ${davanti.map(t =>
      `${t.label} a ${r1(polyDistance(poly, t.poly) / MM)}″`).join(", ")}` : "",
    !sotto.length && !davanti.length ? "prato aperto davanti e sotto" : "",
  ].filter(Boolean).join("; ");
  return { sotto, davanti, muro, testo };
}

/* ---- dove si posa un'unita' ----
   Prima di tutto le cinque colonne con il nome — sinistra … destra —
   in una, due o tre file: sono i posti che chi gioca legge e sceglie a
   colpo d'occhio, e le partite di sempre si schierano li'.

   Cinque colonne pero' sono cinque posti per fila, e una zona profonda
   sei pollici ha una fila sola: la sesta unita' non trovava posto,
   l'elenco diventava «avanti», e l'unita' spariva senza una riga nel
   registro — non combatteva e non dava punti a nessuno. Le trecento
   partite Skaven contro Lucertole sul «Poligono di tiro» si sono
   giocate cosi', con i Terradon Riders sempre fuori (2026-09-23).

   Quando le colonne sono piene si cercano i VARCHI: si scorre la fila
   da sinistra a destra di un quarto di pollice alla volta, e ogni
   posto libero diventa un'offerta; dopo ognuno si salta di una
   larghezza d'unita', che il posto accanto non la tocchi. E quando
   neanche i varchi bastano si prova un altro fronte, il piu' vicino a
   quello della lista: piu' largo se l'unita' e' troppo PROFONDA —
   trenta Clanrat cinque per sei non stanno in sei pollici — o piu'
   stretto se e' troppo LARGA per il varco che resta. La formazione con
   cui si schiera la sceglie chi gioca, e quella scritta nella lista e'
   la preferita, non un obbligo: e' la lettura dell'app, dal libro non
   ricontrollata. Se non basta niente l'unita' resta fuori, e lo si
   scrive (`passo`, e il limite `fuori`). */
const COLONNE_ZONA = ["sinistra", "centro-sinistra", "centro", "centro-destra", "destra"];

function postiNellaZona(S, u, { varchi = false } = {}){
  const z = zonaDi(S, u.army);
  const lay = layoutOf(u, S.units);
  const mie = inCampo(S, u.army);
  const out = [];
  const passo = lay.h + MM / 2;
  /* La zona in colonne e in file: la prima fila e' quella davanti, cioe'
     dalla parte del nemico, che e' dove al tavolo si mette chi deve
     arrivarci. Le file dietro servono quando la prima e' piena: uno
     schieramento non e' mai una riga sola. Con i varchi le file non si
     fermano a tre: si cerca in tutta la zona. */
  const file = Math.max(1, Math.floor(z.h / Math.max(MM, passo)));
  const posto = (x, f) => {
    /* A sta in basso e guarda in su: la sua prima fila e' il bordo
       alto della zona. Prima era il contrario, e il capo messo «in
       prima fila» stava sul bordo del tavolo dietro a tutti. */
    const y = u.army === "A"
      ? z.y + lay.h / 2 + MM + f * passo
      : z.y + z.h - lay.h / 2 - MM - f * passo;
    const box = { x, y, w: lay.w, h: lay.h, rot: u.rot || 0 };
    const poly = boxCorners(box);
    const libero = !mie.some(o => polyDistance(poly, cornersOf(o, S.units)) < MM / 2) &&
                   x - lay.w / 2 >= z.x - 0.01 && x + lay.w / 2 <= z.x + z.w + 0.01 &&
                   y - lay.h / 2 >= z.y - 0.01 && y + lay.h / 2 <= z.y + z.h + 0.01;
    if (!libero) return null;
    const ter = terrenoDelPosto(S, box, u);
    /* dentro un pezzo impassabile non ci si posa (p. 270) */
    if (ter.sotto.some(t => chiusoPer(u, t))) return null;
    return { y, ter };
  };
  const offerta = (x, f, p, nome, perche) => ({
    id:"schiera", uid: u.uid, x, y: p.y, rot: u.rot || 0,
    dove: nome + (f ? `, ${f + 1}ª fila` : ""),
    murato: !!p.ter.muro,
    why: `${perche}${f ? ", dietro" : ", in prima fila"}` + (p.ter.testo ? ` — ${p.ter.testo}` : ""),
  });
  for (let f = 0; f < (varchi ? file : Math.min(file, 3)); f++){
    if (!varchi){
      /* Le cinque colonne stanno fra i due posti estremi che l'unita'
         puo' avere, non a un decimo di zona dal bordo: «sinistra» e'
         contro il bordo sinistro. Prima, con i centri fissi, fra
         un'unita' e l'altra restavano varchi di quattro o cinque
         pollici — troppo stretti per la sesta, e sprecati ai bordi. */
      const x0 = z.x + lay.w / 2, x1 = Math.max(x0, z.x + z.w - lay.w / 2);
      for (let i = 0; i < COLONNE_ZONA.length; i++){
        const x = x0 + (x1 - x0) * i / (COLONNE_ZONA.length - 1);
        /* larga quanto la zona, le cinque colonne sono un posto solo */
        if (i && x - x0 < 0.01) break;
        const p = posto(x, f);
        if (p) out.push(offerta(x, f, p, COLONNE_ZONA[i], COLONNE_ZONA[i]));
      }
      continue;
    }
    for (let x = z.x + lay.w / 2; x <= z.x + z.w - lay.w / 2 + 0.01; ){
      const p = posto(x, f);
      if (!p){ x += MM / 4; continue; }
      const da = r1(inch(x - z.x));
      out.push(offerta(x, f, p, `a ${da}″ da sinistra`,
        `in un varco a ${da}″ dal bordo sinistro della zona, fra le unità già schierate`));
      x += lay.w + MM / 2;
    }
  }
  return out;
}

/* Chi puo' cambiare fronte allo schieramento: chi ha piu' di un
   modello in file. Anche la formazione sciolta, che i modelli li mette
   dove vuole (p. 185); non la macchina da guerra, che e' un pezzo col
   suo equipaggio. */
const cambiaFronte = u => ensureRanks(u) && !macchina(u) && alive(u) > 1;

/* Il fronte piu' vicino a quello della lista con cui l'unita' trova
   posto: si cambia meno formazione possibile, e a parita' di distanza
   si prova prima il piu' stretto, che tiene i ranghi. */
function postiAltroFronte(S, u){
  if (!cambiaFronte(u)) return [];
  const lay0 = layoutOf(u, S.units), n = lay0.slots.length, f0 = lay0.front;
  const tt = troopType(u.troop);
  const ranghi = f => rankBonus(n, f, tt.maxRank, tt.perRank);
  const fronti = Array.from({ length: n }, (_, i) => i + 1).filter(f => f !== f0)
    .sort((a, b) => Math.abs(a - f0) - Math.abs(b - f0) || a - b);
  const prima = u.frontage;
  try {
    for (const f of fronti){
      u.frontage = f;
      const lay = layoutOf(u, S.units);
      /* stessa larghezza e stessa profondita': non cambia niente */
      if (Math.abs(lay.w - lay0.w) < 0.01 && Math.abs(lay.h - lay0.h) < 0.01) continue;
      let posti = postiNellaZona(S, u);
      if (!posti.length) posti = postiNellaZona(S, u, { varchi: true });
      if (!posti.length) continue;
      const cambio = `con ${f} di fronte invece di ${f0}, su ${lay.ranks} ranghi invece di ${lay0.ranks}` +
        (ranghi(f) !== ranghi(f0) ? ` (bonus di ranghi +${ranghi(f0)} → +${ranghi(f)})` : "") +
        `: com'è nella lista non trova posto nella zona`;
      return posti.map(p => ({ ...p, fronte: f, dove: `${p.dove}, ${f} di fronte`, why: `${cambio}; ${p.why}` }));
    }
  } finally {
    u.frontage = prima;
  }
  return [];
}

/* Perche' un'unita' resta fuori, detto in pollici: e' la riga che
   finisce nel registro e fra i limiti della partita. */
function perchéFuori(S, u){
  const z = zonaDi(S, u.army), lay = layoutOf(u, S.units);
  const spazio = z.h - MM;
  if (lay.h > spazio + 0.01)
    return `è profonda ${r1(inch(lay.h))}″ e la zona, tolto il pollice dal bordo davanti, ne lascia ${r1(inch(spazio))}″` +
           (cambiaFronte(u) ? ", nemmeno cambiando il fronte" : ", e non ha file da allargare");
  return `è larga ${r1(inch(lay.w))}″, e fra le unità già schierate, i bordi e il terreno impassabile non resta un varco così`;
}

export function postiPer(S, u){
  let out = postiNellaZona(S, u);
  if (!out.length) out = postiNellaZona(S, u, { varchi: true });
  if (!out.length) out = postiAltroFronte(S, u);
  /* i posti murati in fondo all'elenco, senza toglierli: al tavolo un
     reggimento dietro il monolite lo si puo' anche volere — ci si
     ripara dal tiro — ma non deve essere la prima riga che si legge */
  return out.sort((a, b) => (a.murato ? 1 : 0) - (b.murato ? 1 : 0));
}

/* Dove un personaggio si puo' unire (p. 207): allo schieramento ogni
   reggimento amico gia' in campo; nelle mosse restanti quelli che
   raggiunge. Il reggimento con il capo dentro si allarga: se cosi' non
   ci sta piu', l'unione non si offre. */
function entraSenzaUrtare(S, c, h){
  const prima = c.join;
  c.join = { host: h.uid };
  const box = boxOf(h, S.units);
  c.join = prima;
  return !ingombro(S, h, box, { unPollice: false, ignora: [c.uid] });
}
export function opzioniUnione(S, c, { pollici = null } = {}){
  if (!puoUnirsi(S, c)) return [];
  const out = [];
  for (const h of inCampo(S, c.army)){
    if (!puoOspitare(S, c, h)) continue;
    if (pollici != null){
      if (h.fled || ingaggiata(S, h) || h.unito === chiave(S)) continue;
      const d = distanza(S, c, h);
      if (d > pollici + 1e-6) continue;
    }
    if (!entraSenzaUrtare(S, c, h)) continue;
    const dentro = capiDi(S, h);
    out.push({ id: pollici != null ? "unisciti" : "unisci", uid: c.uid, host: h.uid, nome: c.name, contro: h.name,
               why: `entra in ${h.name} (${alive(h)} modelli${dentro.length ? ", con " + dentro.map(x => x.name).join(" e ") : ""}): ` +
                    `ne porta la Forza d'Unità a ${usConCapi(S, h) + usOf(c)}, e con lui il reggimento usa il Comando più alto (p. 97)` +
                    (pollici != null ? `; da lì il reggimento non si muove più in questo turno` : ""),
               page: 207 });
  }
  return out.sort((a, b) => alive(byUid(S, b.host)) - alive(byUid(S, a.host)));
}

/* ============================================================
   5 · LE MOSSE LEGALI, ADESSO
   Torna sempre la stessa forma: di chi e' il turno, cosa sta
   succedendo, e l'elenco dei gesti. Ogni gesto porta con se' il
   perche' — quanto dista, che probabilita' ha, cosa dice il manuale —
   perche' chi sceglie deve poter scegliere con cognizione, e perche'
   chi legge la partita dopo deve capire perche' si e' scelto quello.
   ============================================================ */
/* ============================================================
   I CAMPI DI OGNI GESTO
   Il `why` di un'opzione e' una frase da leggere: la legge chi gioca
   al tavolo, la legge il modello di linguaggio. I numeri che servono a
   decidere stanno ANCHE in campi, e chi sceglie a macchina legge
   quelli. Prima l'euristica pescava la distanza con un'espressione
   regolare dentro la frase («è a 8″») e il numero degli incantesimi
   giocabili da «ne gioca 3 su 7»: ritoccare una frase cambiava la
   strategia, e nessuna prova se ne accorgeva.

   Questo e' il contratto: per ogni gesto, i campi che ci sono sempre.
   `test/arbitro.mjs` lo controlla su partite intere. Aggiungere un
   campo qui vuol dire promettere che l'arbitro lo scrive sempre.

     dist      pollici, bordo a bordo, fino al bersaglio (o al nemico
               piu' vicino, per chi si muove o resta fermo)
     pollici   quanti ne fa davvero, ruota e terreno compresi
     chance    probabilita' che riesca, fra 0 e 1
     attesa    perdite che ci si aspetta, gia' pesate per la probabilita'
     need      pollici di tiro che servono alla carica (0: ci arriva camminando)
     lato      da che lato prende il bersaglio: fronte, fianco, retro
     rischio   probabilita' che, fermandosi li', il nemico la carichi il
               turno dopo (minacce.js)
     danno     punti di lista che ci si aspetta di perdere per la carica
               peggiore, gia' pesata per la sua probabilita'
     portata   probabilita' che da li', il turno dopo, carichi lei
     esito     punti di lista che la carica, se arriva, guadagna al primo
               round (scontroAtteso); negativo se ci si perde
     rotta     probabilita' che il bersaglio scappi, se la carica arriva
   ============================================================ */
export const CAMPI = Object.freeze({
  primo:    ["cosa", "chi"],
  schiera:  ["uid", "x", "y", "dove", "murato"],
  dominio:  ["uid", "lore", "giocabili"],
  scambia:  ["uid", "out", "into", "lasciaMuto", "prendeMuto"],
  carica:   ["uid", "target", "chance", "dist", "need", "lato", "esito", "rotta"],
  avanza:   ["uid", "verso", "dist", "pollici", "muro", "rischio", "danno", "portata"],
  accosta:  ["uid", "verso", "dist", "pollici", "fino", "rischio", "danno", "portata"],
  marcia:   ["uid", "verso", "dist", "pollici", "muro", "provaComando", "rischio", "danno", "portata"],
  ferma:    ["uid", "dist"],
  aggira:   ["uid", "verso", "pollici"],
  tira:     ["uid", "target", "dist", "attesa"],
  bombarda: ["uid", "target", "dist", "attesa"],
  fulmina:  ["uid", "target", "dist", "attesa"],
  lancia:   ["uid", "spell", "chance", "attesa"],
  dissolvi: ["chance"],
});

export function options(S){
  if (S.finita) return { player: null, fase: "finita", what: "la partita è finita", list: [] };

  /* prima dello schieramento si generano gli incantesimi (p. 106) */
  if (S.preparando){
    const o = opzioniPreparazione(S);
    if (o) return o;
  }

  /* le due domande di CHI COMINCIA vengono prima di tutto il resto */
  if (S.schierando && !S.chiSchiera && !S.pending) apriSchieramento(S);
  if (S.pending && S.pending.kind === "primo"){
    const p = S.pending;
    return { player: p.lato, fase: p.cosa === "schiera" ? "Schieramento" : "Primo turno", page: p.page,
             what: p.cosa === "schiera"
               ? `${S.nomi[p.lato]} ha vinto il tiro: chi schiera la prima unità?`
               : `${S.nomi[p.lato]} ha vinto il tiro: chi comincia la partita?`,
             list: p.list };
  }

  if (S.schierando){
    const prossima = daSchierare(S);
    if (!prossima) return { player: S.army, fase: "Schieramento", what: "tutti schierati", list: [{ id:"avanti", why:"si comincia" }] };
    const posti = [...opzioniUnione(S, prossima), ...postiPer(S, prossima)];
    return {
      player: S.army, fase: "Schieramento", page: 115,
      what: `${S.nomi[S.army]} schiera ${prossima.name} (${alive(prossima)} modelli, ${prossima.pts || 0} pt)`,
      unit: prossima.uid,
      list: posti.length ? posti
        : [{ id:"avanti", fuori: true,
             why:`${prossima.name} non trova posto nella zona e resta fuori dalla partita: ${perchéFuori(S, prossima)}` }],
    };
  }

  const c = CASELLE[S.casella];
  const base = { player: S.army, fase: c.fase, casella: c.id, page: c.page, what: c.what };

  /* una reazione alla carica sospesa tocca a chi la subisce, e viene
     prima di ogni altra cosa (p. 120) */
  if (S.pending && S.pending.kind === "reazione"){
    const t = byUid(S, S.pending.target), ch = byUid(S, S.pending.charger);
    return { ...base, player: t.army, fase: "Movimento", page: 120,
             what: `${t.name} è caricata da ${ch.name}: come reagisce?`,
             list: S.pending.list };
  }

  /* un incantesimo appena lanciato: il dissolvimento tocca all'altra
     parte, subito (p. 110) */
  if (S.pending && S.pending.kind === "dissolvi"){
    const l = S.pending.lancio;
    const sp = S.magia.M.spell(l.spell), w = byUid(S, l.caster);
    return { ...base, player: altro(l.army), fase: "Magia", page: 110,
             what: `${w.name} ha lanciato ${sp.name} con ${l.total}: lo si prova a dissolvere?`,
             list: S.pending.list };
  }
  /* un combattimento sta per cominciare: i maghi di chi non e' di turno
     possono lanciare i loro assalti (p. 108) */
  if (S.pending && S.pending.kind === "assalto"){
    return { ...base, player: altro(S.army), fase: "Corpo a corpo", page: 158,
             what: "prima che si meni: i tuoi maghi lanciano un assalto?", list: S.pending.list };
  }

  /* una sfida, che si lancia quando il combattimento viene scelto
     (p. 211): prima chi e' di turno, e se non la lancia l'altro */
  if (S.pending && S.pending.kind === "sfida"){
    return { ...base, player: S.pending.lato, fase: "Corpo a corpo", page: SFIDA,
             what: `${S.nomi[S.pending.lato]} può lanciare una sfida prima che si meni`,
             list: S.pending.list };
  }
  if (S.pending && S.pending.kind === "raccogli"){
    const sf = byUid(S, S.pending.sfidante);
    return { ...base, player: S.pending.lato, fase: "Corpo a corpo", page: SFIDA,
             what: `${sf ? sf.name : "qualcuno"} ha lanciato una sfida: chi la raccoglie?`,
             list: S.pending.list };
  }
  if (S.pending && S.pending.kind === "ritira"){
    const sf = byUid(S, S.pending.sfidante);
    return { ...base, player: sf ? sf.army : S.army, fase: "Corpo a corpo", page: SFIDA,
             what: `la sfida di ${sf ? sf.name : "qualcuno"} è stata rifiutata: chi si ritira in fondo alle file?`,
             list: S.pending.list };
  }

  if (S.pending && S.pending.kind === "abominio"){
    const ab = byUid(S, S.pending.uid);
    return { ...base, player: ab ? ab.army : S.army, fase: "Corpo a corpo", page: 144,
             what: `${ab ? ab.name : "l'Abominio"}: attacca normalmente, si nutre o travolge? (Abominable Attacks)`,
             list: S.pending.list };
  }

  if (c.id === "congiura") return { ...base, list: [...opzioniLancio(S, ["enchantment", "hex"]),
                                                   avanti("nessun altro incantesimo")] };
  if (c.id === "raduno")  return { ...base, list: opzioniRaduno(S) };
  if (c.id === "cariche") return { ...base, list: opzioniCarica(S) };
  if (c.id === "mosse")   return { ...base, list: opzioniMossa(S) };
  if (c.id === "tiro")    return { ...base, list: opzioniTiro(S) };
  if (c.id === "mischia") return { ...base, list: opzioniMischia(S) };
  return { ...base, list: [{ id:"avanti", why:"niente da fare" }] };
}

const byUid = (S, uid) => S.units.find(u => u.uid === uid) || null;
const avanti = why => ({ id:"avanti", why });
const altro = army => army === "A" ? "B" : "A";

function daSchierare(S, army = S.army){
  /* chi ha rinunciato — perche' nella zona non c'era piu' posto — non
     torna a chiedere: resta fuori dal tavolo, e a fine partita vale
     quello che vale */
  const mie = unitsOf(S, army).filter(u => !u.placed && !isJoined(u) && !u.rinuncia);
  /* i personaggi che possono unirsi vengono dopo i reggimenti: al
     tavolo ci si unisce «essendo messi con l'unita'» (p. 207), e un
     capo schierato per primo non avrebbe nessuno con cui stare */
  return mie.find(u => !puoUnirsi(S, u)) || mie[0] || null;
}

/* ---- raduno (p. 117) ---- */
function opzioniRaduno(S){
  /* un test per unita' per turno (p. 117): prima chi falliva restava
     nell'elenco e ritirava finche' non gli riusciva, sette volte di
     fila, e radunarsi non falliva mai */
  const fuggono = inCampo(S, S.army).filter(u => u.fled && u.radunoTentato !== chiave(S));
  const list = fuggono.map(u => {
    const lead = PS.rallyLeadership(ldOf(S, u, { zitto: true }), { models: alive(u), start: u.models || 0,
                                                  musician: !!(u.command && u.command.musician) });
    return { id:"raduna", uid: u.uid, nome: u.name,
             why: lead.hopeless ? "si ferma solo con il doppio uno" : `Comando ${lead.value}` +
                  (lead.why.length ? " (" + lead.why.join("; ") + ")" : ""),
             page: PS.PAGE.rally };
  });
  return list.length ? list : [avanti("nessuno sta fuggendo")];
}

/* ---- cariche (p. 118) ---- */
/* La Paura di chi carica (p. 168): un test per turno, contro un nemico
   che la fa ed e' piu' grosso. */
function pauraDi(S, u, t, when){
  const me = PS.psychOf(u, { joined: capiInFila(S, u) });
  /* anche di la' contano i capi in prima fila: chi si e' ritirato non
     fa piu' Paura per conto del suo reggimento (p. 211) */
  const foe = PS.psychOf(t, { joined: capiInFila(S, t) });
  const tested = u.paura && u.paura.key === chiave(S) ? u.paura : null;
  return PS.fearCheck({ me, foe, meUS: usConCapi(S, u), foeUS: usConCapi(S, t), when, tested, foeName: t.name });
}
/* La probabilita' di passare un test di Comando: 2D6 (3D6 tenendo i
   due minori con Cold Blooded) contro il Comando, e il doppio uno
   passa sempre. */
export function passaIl(ld, cold = false){
  const f = [1, 2, 3, 4, 5, 6];
  let si = 0, n = 0;
  for (const a of f) for (const b of f) for (const c of (cold ? f : [0])){
    const k = cold ? [a, b, c].sort((x, y) => x - y).slice(0, 2) : [a, b];
    n++;
    if (k[0] + k[1] <= ld || (k[0] === 1 && k[1] === 1)) si++;
  }
  return si / n;
}
/* Per le schede di `spiega.js`: il tipo di ogni test, e cosa vuol dire
   fallirlo — «fallito» da solo non dice perche' l'unita' adesso scappa. */
const SPIEGA_PSICO = { fear: "paura", terror: "terrore", panic: "panico", stupidity: "stupidita",
                       impetuous: "impeto", rally: "raduno" };
const ESITO_PSICO = { fear: "fallito: ha paura", terror: "fallito: deve fuggire",
                      panic: "fallito: va nel panico", stupidity: "fallito: è in preda alla Stupidità" };
/* Gli indici dei dadi che non contano: tutti meno quelli tenuti, contati
   una volta sola ciascuno (due 3 tenuti su tre 3 ne scartano uno). */
function scartati(dadi, tenuti){
  if (!tenuti || tenuti.length >= dadi.length) return [];
  const resto = [...tenuti], via = [];
  dadi.forEach((v, i) => {
    const j = resto.indexOf(v);
    if (j >= 0) resto.splice(j, 1); else via.push(i);
  });
  return via;
}
/* La scheda di un test di Comando tirato: i dadi, il Comando e da dove
   viene, e cosa vuol dire l'esito. */
function xPsico(S, u, kind, dadi, res, perche){
  return { k: SPIEGA_PSICO[kind] || "panico", u: u.name, uid: u.uid, tot: res.total, via: scartati(dadi, res.kept),
           vs: { v: res.target, op: "<=", t: "Comando" },
           f: [...(perche ? [{ t: perche, f: "stato" }] : []), ...fontiComando(S, u),
               ...(res.cold ? [{ t: "Cold Blooded: tre dadi, si tengono i due più bassi", f: "regola" }] : []),
               ...(res.insane ? [{ t: "doppio uno: passa sempre", f: "dadi" }] : [])],
           e: res.passed ? "passato" : ESITO_PSICO[kind] || "fallito", ok: res.passed };
}
/* La scheda di una fuga: 2D6, il terzo dado dello Swiftstride, e i
   bonus e malus dell'esercito o della macchina da guerra. */
function xFuga(u, dadi, via, { k = "fuga", da = null, perche = "" } = {}){
  const b = CB.fleeBonusOf(u);
  return { k, u: u.name, uid: u.uid, su: da ? da.uid : null, tot: dadi.reduce((s, v) => s + v, 0),
           piu: b.mod ? [{ t: b.why || "bonus di fuga", v: b.mod }] : [],
           f: [...(perche ? [{ t: perche, f: "stato" }] : []),
               { t: "si fugge di 2D6″" + (da ? `, dritti lontano da ${da.name}` : "") + " (p. 132)", f: "regola" },
               ...(dadi.length > 2 ? [{ t: "Swiftstride: un D6 in più (p. 178)", f: "regola" }] : [])],
           e: `fugge di ${via}″`, ok: false };
}
/* Il test psicologico tirato davvero, con la sua riga di registro. */
function testPsico(S, u, kind, p, perche, page){
  const auto = PS.autoPass(kind, p);
  const k = SPIEGA_PSICO[kind] || "panico";
  if (auto.auto){
    say(S, `${u.name}, ${PS.KINDS[kind].label} (${perche}): ${auto.why}.`, { army: u.army, page,
        x: { k, u: u.name, uid: u.uid, f: [{ t: perche, f: "stato" }, { t: auto.why, f: "regola" }],
             e: "passa senza tirare", ok: true } });
    return { passed: true, auto: true };
  }
  const dadi = roll(PS.coldDice(kind, p) ? 3 : 2);
  const res = PS.psychTest({ kind, ld: ldOf(S, u), dice: dadi, p });
  say(S, `${u.name}, ${PS.KINDS[kind].label} (${perche}): ${res.text}.`, { dice: dadi, army: u.army, page,
      x: xPsico(S, u, kind, dadi, res, perche) });
  return res;
}

function opzioniCarica(S){
  const out = [];
  for (const u of inCampo(S, S.army)){
    /* chi ha gia' fatto qualcosa in questo turno non dichiara cariche:
       ci e' andata male una volta e basta */
    if (u.fled || u.charged || u.moved || ingaggiata(S, u)) continue;
    /* una macchina da guerra non dichiara cariche (p. 197) */
    if (macchina(u)){ limite(S, "macchina"); continue; }
    /* e chi si muove di quanto tira non dichiara: carica solo se il suo
       movimento lo porta addosso a qualcuno (p. 176), nelle mosse */
    if (vagante(u)) continue;
    /* Miasmic Mirage, Earthen Ramparts: chi ce l'ha addosso non carica */
    if (bandiera(u, "noCharge") || stupida(S, u) || u.unito === chiave(S)) continue;
    const { move } = movimento(S, u);
    if (!move) continue;
    const pu = PS.psychOf(u, { joined: capiInFila(S, u) });
    if (pu.anyFrenzy || pu.impetuous) limite(S, "frenesia");
    for (const t of nemiciDi(S, u)){
      const paura = pauraDi(S, u, t, "charge");
      if (paura.already && !paura.passed) continue;
      const tc = terrenoDiCarica(S, u, t);
      const d = CH.declareCharge({
        charger: { name: u.name, box: boxOf(u, S.units), move, swift: MV.swiftOf(u), loose: !!u.loose },
        target:  { name: t.name, box: boxOf(t, S.units) },
        pieces: S.terrain, worst: tc.eff.worstDie,
      });
      if (!d || !d.can) continue;
      /* Il posto a contatto c'e'? Una carica su un nemico che ha gia'
         la faccia piena di amici non si offre: prima si offriva con il
         90% e poi falliva «perche' non c'e' posto», un turno buttato.
         Se per arrivare bisogna scorrere lungo la faccia, quei pollici
         entrano nel tiro che serve. */
      const posto = postoAContatto(S, u, t);
      if (!posto || posto.pieno) continue;
      const extra = r1(posto.extra || 0);
      const need = Math.max(0, r1(d.need + extra));
      let chance = extra ? CH.chargeChance(need, MV.swiftOf(u)) : d.chance;
      if (chance <= 0) continue;
      /* la Paura prima di dichiarare: entra nella probabilita' */
      let nota = "";
      if (paura.must && !paura.auto){
        const ok = passaIl(ldOf(S, u, { zitto: true }), PS.coldDice("fear", pu));
        chance *= ok;
        nota = `; prima un test di Paura (${paura.why}), che passa il ${Math.round(ok * 100)}%` +
               ` — se fallisce resta ferma (p. 168)`;
      }
      const pt = PS.psychOf(t, { joined: capiDi(S, t) });
      if (pu.causesTerror && !pt.immuneTerror) nota += `; fa Terrore: ${t.name} tira, e se fallisce deve fuggire (p. 179)`;
      const sc = scontroAtteso(S, u, t, d.side);
      out.push({ id:"carica", uid: u.uid, target: t.uid, nome: u.name, contro: t.name,
                 dist: +d.dist, need, lato: d.side, esito: sc.valore, rotta: Math.round(sc.rottaLui * 100) / 100,
                 why: `${d.dist}″, ${need ? "serve " + need + "″ di tiro" : "ci arriva camminando"}` +
                      (extra ? ` (${extra}″ per trovare posto sulla faccia)` : "") +
                      `, riesce il ${Math.round(chance * 100)}%, la prende di ${d.side}` + nota +
                      `; se arriva, al primo round ${sc.valore >= 0 ? "guadagna" : "perde"} ≈ ${Math.abs(sc.valore)} punti` +
                      (sc.rottaLui > 0.05 ? ` e ${t.name} scappa il ${Math.round(sc.rottaLui * 100)}%` : ""),
                 chance, page: 119 });
    }
  }
  out.sort((a, b) => b.chance - a.chance);
  return [...out, avanti("basta cariche: si passa al movimento")];
}

/* ============================================================
   AGGIRARE QUELLO CHE CHIUDE LA STRADA (p. 270)
   Questa e' la cosa che una partita vera ha mostrato, e che nessuna
   prova aveva preso: un reggimento schierato dietro il monolite ci
   resta tutta la partita.

   L'arbitro il muro lo sapeva — `ingombro` non ci lascia entrare da
   quando c'e' la categoria del terreno — ma lo sapeva solo DOPO. Chi
   sceglieva leggeva «Night Goblin Mobs è a 8″: marcia di 8″», la
   sceglieva, e il tavolo gliene dava zero: il pezzo partiva, toccava il
   monolite al primo passo e si fermava. Poi l'elenco riproponeva la
   stessa riga, identica, e cosi' per sei turni. La deviazione che
   `percorso` ha gia' (±45°) non bastava, e non poteva: un reggimento
   largo cinque pollici contro un monolite largo quattro tocca il
   monolite a qualunque angolo, e la prova «mi avvicina di almeno un
   pollice?» non passava mai.

   Due cose, allora.

   LA STRADA SI PROVA PRIMA DI OFFRIRLA. `stradaVera` fa esattamente il
   conto che `mossa` fara' un attimo dopo — il pollice in meno del
   terreno difficile, la ruota, il percorso con la sua deviazione — e
   non tocca niente. Quando il numero vero e' piu' piccolo di quello
   promesso e la colpa e' di un pezzo di terreno, l'opzione lo dice. E'
   la meta' che conta anche per l'euristica, che la distanza se la legge
   proprio da quella stringa.

   E SI OFFRE DI GIRARCI ATTORNO. Non e' una ricerca di strada — il
   limite `ingombro` resta dichiarato, e l'arbitro continua a non
   sapere navigare un tavolo — e' il passo di lato che fa un giocatore:
   ci si mette di traverso al varco, si paga la ruota (p. 124), e il
   turno dopo si passa. I due varchi si mirano al FIANCO del pezzo e non
   a dietro: puntare dietro da' una diagonale stretta, e una diagonale
   stretta contro un pezzo piu' stretto del reggimento lo tocca lo
   stesso al primo passo.
   ============================================================ */

/* ============================================================
   LE MINACCE E LO SCONTRO ATTESO
   Due domande che l'elenco delle mosse non si faceva, e che al tavolo
   decidono la fase di movimento:

     DOVE ARRIVO, CHI MI CARICA? `minacce.js` risponde con il conto
       della dichiarazione (p. 119) fatto da ogni nemico che il turno
       dopo potra' caricare — arco, vista, distanza, terreno — e la
       probabilita' che ne arrivi almeno uno. E' il campo `rischio`.

     E SE MI CARICA, COME VA? `scontroAtteso` fa il primo round senza
       tirare: le ferite medie dei due lati (`meleeForecast`), il
       risultato con ranghi, stendardo e fianco (`combatScore`, p. 150),
       la probabilita' che chi perde scappi (`breakChances`, p. 154) e
       che l'inseguimento lo prenda. Tutto in punti di lista, che e' la
       moneta dei punti vittoria. E' il campo `danno`: quanto mi aspetto
       di perdere dalla carica peggiore, pesata per la sua probabilita'.

   E la terza, che e' l'altra meta' del gioco delle distanze:

     DA LI' CARICO IO? `portata`, la probabilita' che il turno dopo la
       mia carica arrivi al bersaglio verso cui mi sono mosso.

   Quello che lo scontro atteso non sa, detto una volta: la carica non
   da' l'impeto qui (e' un round medio, non il primo colpo di chi
   arriva), l'ordine d'Iniziativa non toglie attacchi a chi mena dopo,
   e i capi uniti entrano con il reggimento come fa `schieraDi`. E'
   un'indicazione per scegliere, non una previsione da scrivere nel
   registro: nel registro va quello che i dadi fanno.
   ============================================================ */

/* chi, fra le unita' di `army`, il turno dopo potra' dichiarare una
   carica: non chi fugge, combatte, e' una macchina o si muove di quanto
   tira (che non dichiara, p. 176) */
function caricatori(S, army){
  return inCampo(S, army)
    .filter(e => !isJoined(e) && !e.fled && !ingaggiata(S, e) && !macchina(e) && !vagante(e) && !bandiera(e, "noCharge"))
    .map(e => ({ uid: e.uid, name: e.name, box: boxOf(e, S.units), move: movimento(S, e).move,
                 swift: MV.swiftOf(e), loose: !!e.loose, fly: vola(e) }))
    .filter(e => e.move > 0);
}

/* La probabilita' che chi fugge venga preso, a dadi pari: 2D6 contro
   2D6, e l'inseguitore prende con un tiro uguale o piu' alto (p. 156).
   Si conta, non si stima: (1 + P(pari)) / 2, e P(pari) = 146/1296. */
export const PRESO_A_DADI_PARI = (1 + 146 / 1296) / 2;

const scontri = new WeakMap();
const firmaScontro = (S, u) => `${u.uid}:${alive(u)}:${u.wounds || 0}:${capiDi(S, u).map(c => c.uid + "/" + alive(c)).join(",")}`;
export function scontroAtteso(S, att, def, lato = "fronte"){
  let cache = scontri.get(S);
  if (!cache){ cache = new Map(); scontri.set(S, cache); }
  const k = `${firmaScontro(S, att)}|${firmaScontro(S, def)}|${lato}`;
  if (cache.has(k)) return cache.get(k);
  const r = scontroDiGruppo(S, [{ u: att, lato }], def);
  cache.set(k, r);
  return r;
}

/* Piu' caricatori sullo stesso bersaglio: le ferite si sommano, il
   risultato lo conta `sideScore` con le regole del combattimento a piu'
   unita' (p. 153) — i ranghi del migliore e non la somma, uno stendardo
   per parte, il fianco una volta per nemico. Il bersaglio mena contro
   il primo, che e' quello di fronte se c'e'. Serve all'assegnazione
   delle cariche (`ricerca.js`): quanto aggiunge il secondo caricatore
   a quello che il primo fa gia'. */
export function scontroDiGruppo(S, attaccanti, def){
  const lista = attaccanti.filter(a => a && a.u)
    .sort((p, q) => (ML.arcToFlank(p.lato) ? 1 : 0) - (ML.arcToFlank(q.lato) ? 1 : 0));
  if (!lista.length) return { date: 0, prese: 0, diff: 0, rottaLui: 0, rottaMia: 0, valore: 0 };
  const cd = schieraDi(S, def);
  const fer = (c, u) => Math.max(1, alive(u) * (c.w || 1) - (u.wounds || 0));
  const wd = fer(cd, def);
  const schiere = lista.map(a => ({ ...a, c: schieraDi(S, a.u) }));
  const lorde = schiere.map(a => CB.meleeForecast(a.c, cd).wounds);
  const somma = lorde.reduce((s, v) => s + v, 0);
  const date = Math.min(wd, somma), scala = somma > 0 ? date / somma : 0;
  const primo = schiere[0], wa = fer(primo.c, primo.u);
  const prese = Math.min(wa, CB.meleeForecast(cd, primo.c).wounds);
  /* il lato arriva come lo scrive `declareCharge` — fronte, fianco,
     retro — e la scheda del risultato lo vuole come `melee.js` */
  const fianco = l => l === "flank" || l === "rear" ? l : ML.arcToFlank(l);
  const carte = schiere.map((a, i) => ({ ...ML.scoreCardOf(a.c, lorde[i] * scala, { foe: def.uid }), flank: fianco(a.lato) || "" }));
  const cartaD = { ...ML.scoreCardOf(cd, prese), flank: "" };
  const sa = ML.sideScore(carte, [cartaD]).total;
  const sd = ML.sideScore([cartaD], carte).total;
  const diff = sa - sd;
  const rottaLui = diff > 0 ? ML.breakChances(cd.ld, diff).rout : 0;
  const rottaMia = diff < 0 ? ML.breakChances(primo.c.ld, -diff).rout : 0;
  const pa = primo.u.pts || 0, pd = def.pts || 0;
  const valore = (date / wd) * pd - (prese / wa) * pa
               + rottaLui * PRESO_A_DADI_PARI * pd * (1 - date / wd)
               - rottaMia * PRESO_A_DADI_PARI * pa * (1 - prese / wa);
  return { date: r1(date), prese: r1(prese), diff: r1(diff), rottaLui, rottaMia, valore: Math.round(valore) };
}

/* ============================================================
   IL VALORE DI UNA POSIZIONE
   Per guardare avanti (`ricerca.js`) serve un numero che dica quanto
   una posizione e' buona per una parte. E' in punti di lista, la moneta
   dei punti vittoria, ed e' la somma di quattro cose:

     1. il punteggio di adesso (`punteggio`, p. 286): unita' distrutte,
        in fuga, sotto un quarto, generale, stendardo, obiettivi;
     2. le ferite che il punteggio conta solo a gradini: una parte del
        valore di un'unita' mezza morta, che il punteggio vede intera
        finche' non scende sotto il quarto;
     3. i combattimenti gia' ingaggiati: lo scontro atteso di ogni
        coppia a contatto, che si risolvera' in questo turno;
     4. le cariche del prossimo turno: quanto ogni mia unita' si aspetta
        di perdere dalla carica peggiore che il nemico puo' dichiararle,
        e quanto ogni sua dalla mia. Pesa di piu' chi muove per primo;
     5. gli obiettivi (Battle March p. 27): chi ne tiene uno adesso vale
        un turno dei suoi punti, e chi ci sta arrivando ne vale una
        parte. Senza la seconda meta' una mossa che si avvicina a un
        tesoro senza toccarlo valeva zero, e la ricerca lasciava gli
        schermagliatori fermi a guardarlo.

   I pesi sono dell'euristica, non del libro, e stanno in un posto solo
   (`PESI`): chi fa esperimenti li cambia qui. Quello che il valore non
   sa: la magia e il tiro del turno che viene.
   ============================================================ */
export const PESI = Object.freeze({ ferite: 0.5, mischia: 1, prossimo: 1, dopo: 0.5, obiettivi: 1, avvicina: 0.5 });

export function valuta(S, army, pesi = PESI){
  const lui = altro(army);
  const p = punteggio(S);
  let v = (p[army] || 0) - (p[lui] || 0);
  for (const u of S.units){
    if (u.dead || u.fledOff || !u.models) continue;
    const persa = 1 - alive(u) / u.models;
    if (persa > 0) v += (u.army === army ? -1 : 1) * pesi.ferite * persa * (u.pts || 0);
  }
  for (const g of gruppiInMischia(S)){
    const miei = g[army], suoi = g[lui];
    for (const u of miei){
      const e = suoi.find(x => aContatto(S, u, [x]).length) || suoi[0];
      if (e) v += pesi.mischia * scontroAtteso(S, u, e).valore / Math.max(1, miei.length);
    }
  }
  const prossimo = S.army === army ? lui : army;
  const cariche = (chi, su) => {
    const att = caricatori(S, chi);
    let tot = 0;
    for (const t of inCampo(S, su)){
      if (isJoined(t) || t.fled || ingaggiata(S, t)) continue;
      const m = MN.minacciaSu(boxOf(t, S.units), att, S.terrain);
      let peggio = 0;
      for (const c of m.cariche.slice(0, 3)){
        const e = byUid(S, c.uid);
        if (e) peggio = Math.max(peggio, c.chance * Math.max(0, scontroAtteso(S, e, t, c.lato).valore));
      }
      tot += peggio;
    }
    return tot;
  };
  v -= (prossimo === lui ? pesi.prossimo : pesi.dopo) * cariche(lui, army);
  v += (prossimo === army ? pesi.prossimo : pesi.dopo) * cariche(army, lui);

  const pezzi = (S.sc.terrain || []).filter(t => OBIETTIVI[t.kind]);
  if (pezzi.length){
    const b = VC.bonuses(S.formato || VC.formatFor(S.sc));
    const ob = obiettivi(S);
    /* quanto una parte ci sta arrivando: la sua unita' migliore, a
       uno se e' gia' dentro la portata, a zero se le servono piu' di due
       marce */
    const arrivo = (t, side) => {
      let meglio = 0;
      for (const u of inCampo(S, side)){
        if (isJoined(u) || u.fled || usConCapi(S, u) < OBJECTIVE_US) continue;
        const d = distPointToBox([t.x * MM, t.y * MM], boxOf(u, S.units)) / MM;
        const m = moveInfo(u).m || 4;
        meglio = Math.max(meglio, Math.max(0, Math.min(1, 1 - Math.max(0, d - OBJECTIVE_RANGE) / (2 * m))));
      }
      return meglio;
    };
    pezzi.forEach((t, i) => {
      const val = OBIETTIVI[t.kind] === "landmark" ? b.landmark : b.treasure;
      if (!val) return;
      const o = ob[i];
      if (o && o.army) v += (o.army === army ? 1 : -1) * pesi.obiettivi * val;
      v += pesi.avvicina * val * (arrivo(t, army) - arrivo(t, lui));
    });
  }
  return v;
}

/* Una copia della partita su cui provare una mossa senza toccare
   quella vera. Le unita', le domande in sospeso e i conti della magia
   si copiano; il terreno, lo scenario e il libro della magia si
   condividono, perche' nessun gesto li cambia. Il registro della copia
   parte vuoto: quello che succede li' non e' successo. */
export function clona(S){
  return {
    ...S,
    units: structuredClone(S.units),
    log: [], detto: new Set(S.detto),
    pending: S.pending ? structuredClone(S.pending) : null,
    sfide: structuredClone(S.sfide || []),
    fineTurni: structuredClone(S.fineTurni || []),
    tiriPrimo: (S.tiriPrimo || []).slice(),
    esito: S.esito ? { ...S.esito } : null,
    magia: { ...S.magia, fato: { ...S.magia.fato }, stop: { ...S.magia.stop } },
    ombra: true,
  };
}

const pc = x => `${Math.round(100 * x)}%`;

/* Il rischio, il danno e la portata di una scatola dove `u` potrebbe
   fermarsi. `campi` va sull'opzione, `testo` in coda alla frase. */
function guardia(S, u, box, nemici, t, tb, move){
  const m = MN.minacciaSu(box, nemici, S.terrain);
  let danno = 0, peggio = null;
  for (const c of m.cariche.slice(0, 3)){
    const e = byUid(S, c.uid);
    if (!e) continue;
    const v = c.chance * Math.max(0, scontroAtteso(S, e, u, c.lato).valore);
    if (v > danno){ danno = v; peggio = { ...c, e }; }
  }
  const portata = MN.portataDa(box, move, tb, { swift: MV.swiftOf(u), fly: vola(u), pieces: S.terrain });
  const rischio = Math.round(m.p * 100) / 100;
  const testo = !m.cariche.length ? (portata > 0 ? `; da lì nessuno la carica, e lei carica ${t.name} il ${pc(portata)}` : "")
    : `; da lì ${m.cariche.length === 1 ? m.cariche[0].name + " la carica" : "la caricano"} il ${pc(m.p)}` +
      (peggio ? ` (con ${peggio.name} ci perderebbe ≈ ${Math.round(danno / Math.max(0.01, peggio.chance))} punti)` : ", e non le costerebbe") +
      (portata > 0 ? `, lei carica ${t.name} il ${pc(portata)}` : "");
  return { campi: { rischio, danno: Math.round(danno), portata: Math.round(portata * 100) / 100 }, testo };
}

/* Quanti pollici fa davvero, andando verso quel punto. Torna anche il
   piano di ruota e cosa l'ha fermata, e non scrive una riga di
   registro: `TR.slowMove` invece di `rallenta`, `pianoAvanzata`
   invece di `avanzaRuotando`. */
function stradaVera(S, u, meta, { marcia = false, fino = null } = {}){
  const { move: pieno } = movimento(S, u);
  if (!pieno) return null;
  const move = vola(u) ? pieno : TR.slowMove(pieno, pezziSulCammino(S, u, meta, pieno)).move;
  const quanti = fino != null ? Math.min(fino, marcia ? move * 2 : move) : marcia ? move * 2 : move;
  const pr = pianoRuota(S, u, versoDi(meta[0] - u.x, meta[1] - u.y), quanti, { marcia });
  const p = pianoAvanzata(S, u, { x: meta[0], y: meta[1] }, pr, quanti);
  return { pr, quanti, move, pollici: p.pollici, bloccata: p.bloccata,
           stop: p.stop, muro: p.stop && p.stop.terreno ? p.stop.terreno : null,
           /* dove arriva: serve a chiedersi, prima di andarci, chi ci
              puo' caricare (`guardia`) */
           x: p.x, y: p.y, rot: p.rot };
}

/* I due varchi ai lati del pezzo che chiude la strada, nel sistema di
   chi guarda la meta': `avanti` e' il bordo vicino del pezzo, `s` lo
   scostamento di lato, e il reggimento ci passa se gli si lascia la
   sua mezza larghezza piu' mezzo pollice. */
function varchiAiLati(S, u, meta, pezzo){
  const lay = layoutOf(u, S.units);
  const dx = meta[0] - u.x, dy = meta[1] - u.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;                     // la destra di chi guarda avanti
  let avanti = Infinity, smin = 0, smax = 0;
  for (const c of pezzo.poly){
    const ex = c[0] - u.x, ey = c[1] - u.y;
    avanti = Math.min(avanti, ex * ux + ey * uy);
    const s = ex * nx + ey * ny;
    smin = Math.min(smin, s); smax = Math.max(smax, s);
  }
  avanti = Math.max(avanti, MM);               // mai un varco dietro le spalle
  const largo = Math.max(lay.w, lay.h) / 2 + MM / 2;
  const dove = s => [u.x + ux * avanti + nx * s, u.y + uy * avanti + ny * s];
  return [{ verso: "destra", punto: dove(smax + largo) },
          { verso: "sinistra", punto: dove(smin - largo) }];
}

/* Il passo di lato verso il varco (p. 125), provato senza muovere
   niente: e' la mossa di chi sta troppo attaccato al muro per potersi
   girare — ruotare un reggimento largo cinque pollici a un pollice dal
   monolite lo farebbe entrare dentro il monolite, e l'arbitro allora
   non lo gira affatto. Di lato si va a meta' Movimento e senza
   cambiare faccia, e non e' un ripiego: e' quello che fa un giocatore
   al tavolo prima di riprendere la marcia. */
function passoDiLato(S, u, punto, move){
  const a = (u.rot || 0) * Math.PI / 180;
  const destra = [Math.cos(a), Math.sin(a)];
  const lx = (punto[0] - u.x) * destra[0] + (punto[1] - u.y) * destra[1];
  const segno = lx >= 0 ? 1 : -1;
  const quanti = move / 2;
  const p = percorso(S, u, [u.x + destra[0] * segno * quanti * MM, u.y + destra[1] * segno * quanti * MM],
                     quanti, { rot: u.rot || 0, devia: false });
  return { segno, quanti, pollici: p.pollici, verso: segno > 0 ? "destra" : "sinistra" };
}

/* Le mosse per girare attorno al muro: una per lato, e di ognuna si
   offre quella che il tavolo permette davvero — girarsi verso il varco
   e andarci (camminando o marciando), oppure, se girarsi non ci sta,
   il passo di lato. Un lato che non porta da nessuna parte non si
   offre: sarebbe la riga di prima con un nome nuovo. */
function opzioniAggiramento(S, u, t, muro, drittoP){
  const out = [];
  const puoMarciare = !bandiera(u, "noMarch") && !macchina(u);
  const { move } = movimento(S, u);
  for (const { verso, punto } of varchiAiLati(S, u, [t.x, t.y], muro)){
    const a = stradaVera(S, u, punto, { marcia: false });
    const m = puoMarciare ? stradaVera(S, u, punto, { marcia: true }) : null;
    const meglio = m && m.pollici > (a ? a.pollici : 0) + 0.05 ? m : a;
    const g = meglio ? Math.round(Math.abs(meglio.pr.giro)) : 0;
    const gira = meglio && !meglio.bloccata && (meglio.pollici > drittoP + 0.05 || g >= 1);
    if (gira){
      const marcia = meglio === m;
      out.push({
        id:"aggira", uid: u.uid, punto, marcia, verso: t.uid, nome: u.name, contro: t.name,
        dove: `a ${verso} di ${muro.label}`,
        why: (meglio.pr.parziale
              ? `${muro.label} non si attraversa: ci si comincia a girare verso il varco a ${verso},` +
                ` ${g}° adesso e il resto il turno prossimo — la ruota intera costerebbe` +
                ` ${r1(meglio.pr.intera)}″ e il Movimento non basta (p. 124)`
              : `${muro.label} non si attraversa: gli si passa a ${verso}` +
                (g ? `, ruotando di ${g}°` : "") +
                `, ${marcia ? "marciando " : ""}di ${r1(meglio.pollici)}″`),
        pollici: meglio.pollici, page: 270 });
      continue;
    }
    /* girarsi non ci sta: si scivola di lato, e il turno prossimo la
       ruota ci starà perché il muro non sarà più davanti. Il passo di
       lato e' una manovra, e in formazione sciolta non se ne fanno
       (p. 185): offrirlo voleva dire vederselo rifiutare da `manovra` */
    if (sciolta(u)) continue;
    const l = passoDiLato(S, u, punto, move);
    if (l.pollici <= 0.25) continue;
    if (out.some(x => x.lato && x.segno === l.segno)) continue;
    out.push({
      id:"aggira", lato: true, segno: l.segno, pollici: l.pollici,
      uid: u.uid, verso: t.uid, nome: u.name, contro: t.name,
      dove: `di lato a ${l.verso}, verso il fianco di ${muro.label}`,
      why: `${muro.label} non si attraversa e da qui non ci si riesce nemmeno a girare — ruotando,` +
           ` il reggimento ci entrerebbe dentro. Si scivola di lato di ${r1(l.pollici)}″ a ${l.verso}` +
           ` (metà del Movimento, p. 125), e da là il varco si prende`,
      page: 125 });
  }
  return out;
}

/* ---- mosse (p. 122) ---- */
function opzioniMossa(S){
  const out = [];
  for (const u of inCampo(S, S.army)){
    if (u.fled || u.charged || ingaggiata(S, u) || u.moved) continue;
    if (u.unito === chiave(S) || stupida(S, u)) continue;
    const { mv, move } = movimento(S, u);
    if (!move){ continue; }
    if (vagante(u)){ out.push(...opzioniVaga(S, u, move)); continue; }
    /* un personaggio da solo puo' invece unirsi a chi raggiunge */
    if (puoUnirsi(S, u)) out.push(...opzioniUnione(S, u, { pollici: move }));
    const t = piuVicino(S, u);
    if (!t) continue;
    const d = distanza(S, u, t);
    /* a un pollice dal nemico piu' vicino non si avanza verso di lui:
       il pollice (p. 118) ferma il pezzo prima di partire */
    if (d <= 1.05){
      /* girarsi o riordinarsi sul posto invece si puo' */
      out.push(...opzioniManovra(S, u, t, move).filter(x => x.id !== "lato"));
      out.push({ id:"ferma", uid: u.uid, nome: u.name, dist: d, why: `resta dov'è: ${t.name} è a ${d}″`, page: 122 });
      continue;
    }
    /* la ruota si paga (p. 124), e la dice l'opzione: un reggimento
       che deve girarsi di 45° per guardare il nemico non avanza affatto */
    const rotT = versoDi(t.x - u.x, t.y - u.y);
    const pa = pianoRuota(S, u, rotT, move), pm = pianoRuota(S, u, rotT, move * 2, { marcia: true });
    /* la strada dritta, provata: quando un pezzo di terreno la chiude,
       il numero promesso e quello vero sono due numeri diversi, ed e'
       quello vero che va scritto (vedi il blocco sull'aggiramento) */
    const va = stradaVera(S, u, [t.x, t.y], { marcia: false });
    const vm = stradaVera(S, u, [t.x, t.y], { marcia: true });
    /* chi mi puo' caricare dove arrivo, e quanto mi costerebbe; e se da
       li' il turno dopo carico io (vedi LE MINACCE) */
    const nemici = caricatori(S, altro(u.army));
    const tb = boxOf(t, S.units), qui = boxOf(u, S.units);
    const g = v => v ? guardia(S, u, { ...qui, x: v.x, y: v.y, rot: v.rot }, nemici, t, tb, move) : guardia(S, u, qui, nemici, t, tb, move);
    const ga = g(va), gm = g(vm), gf = g(null);
    /* con un trattino e non con un «ma»: la marcia porta gia' il suo
       «ma» per il test di Comando, e due «ma» di fila non si leggono */
    const muroTesto = v => v && v.muro && v.pollici < v.pr.resta - 0.05
      ? ` — però ${v.muro.label} chiude la strada: di pollici ne fa ${r1(v.pollici)} e si ferma lì (p. 270)` : "";
    out.push({ id:"avanza", uid: u.uid, verso: t.uid, nome: u.name, contro: t.name,
               dist: d, pollici: r1(va ? va.pollici : pa.resta), muro: !!(va && va.muro), ...ga.campi,
               why: `${t.name} è a ${d}″: ${testoRuota(pa, move)}` + (mv.why ? ` (${mv.why})` : "") +
                    muroTesto(va) + ga.testo,
               page: va && va.muro ? 270 : pa.costo ? 124 : 122 });
    /* ACCOSTARSI: il gioco delle distanze. Se dove l'avanzata intera
       arriva il nemico carica facile, si offre il punto piu' avanti sul
       percorso — a un quarto, a meta', a tre quarti — dove il rischio
       scende davvero (almeno 15 punti). E' un gesto che il tavolo ha e
       l'elenco non aveva: fermarsi prima. */
    if (va && ga.campi.rischio >= 0.2 && va.pollici > 1){
      let meglio = null;
      for (const f of [0.75, 0.5, 0.25]){
        const fino = r1(va.pollici * f);
        const v = stradaVera(S, u, [t.x, t.y], { marcia: false, fino });
        if (!v) continue;
        const gv = g(v);
        if (gv.campi.rischio <= ga.campi.rischio - 0.15){ meglio = { fino: r1(v.pollici), gv }; break; }
      }
      if (meglio) out.push({ id:"accosta", uid: u.uid, verso: t.uid, nome: u.name, contro: t.name,
        dist: d, pollici: meglio.fino, fino: meglio.fino, muro: false, ...meglio.gv.campi,
        why: `${t.name} è a ${d}″: avanza di ${meglio.fino}″ e si ferma` + meglio.gv.testo +
             ` — con tutti i ${r1(va.pollici)}″ il rischio sarebbe ${pc(ga.campi.rischio)}`,
        page: 122 });
    }
    if (!bandiera(u, "noMarch") && !macchina(u)) out.push({ id:"marcia", uid: u.uid, verso: t.uid, nome: u.name, contro: t.name,
               dist: d, pollici: r1(vm ? vm.pollici : pm.resta), muro: !!(vm && vm.muro), provaComando: d <= CH.MARCH_WATCH,
               ...gm.campi,
               why: `${t.name} è a ${d}″: ${testoRuota(pm, move * 2, "marcia")}` +
                    (d <= CH.MARCH_WATCH ? `, ma a ${CH.MARCH_WATCH}″ da un nemico serve un test di Comando (p. 123)` : "") +
                    muroTesto(vm) + gm.testo,
               page: vm && vm.muro ? 270 : 123 });
    /* e se la strada e' chiusa, si offre di girarci attorno */
    const muro = (va && va.muro) || (vm && vm.muro);
    if (muro) out.push(...opzioniAggiramento(S, u, t, muro, Math.max(va ? va.pollici : 0, vm ? vm.pollici : 0)));
    out.push(...opzioniManovra(S, u, t, move));
    const rf = restareFermo(S, u, d);
    out.push({ id:"ferma", uid: u.uid, nome: u.name, dist: d, ...gf.campi, ...rf, why: rf.why + gf.testo, page: 138 });
  }
  /* i capi escono prima che il reggimento si muova (p. 207): in fondo
     all'elenco, perche' e' la mossa che si fa di rado */
  for (const c of S.units.filter(x => x.army === S.army && isJoined(x) && !x.dead && !x.moved)){
    const h = byUid(S, FM.joinedHost(c));
    if (!h || !onBoard(h) || h.moved || h.fled || ingaggiata(S, h) || h.unito === chiave(S) || stupida(S, h)) continue;
    if (postoFuori(S, c, h)) out.push({ id:"separa", uid: c.uid, nome: c.name, contro: h.name,
      why: `esce da ${h.name} e resta da solo accanto al reggimento; da solo si bersaglia e combatte per conto suo`, page: 207 });
  }
  return [...out, avanti("basta mosse: chi non si è ancora mosso resta dov'è")];
}

/* Il posto accanto al reggimento per un capo che esce: a destra del
   fronte, o a sinistra, a mezzo pollice. */
function postoFuori(S, c, h){
  const prima = c.join;
  c.join = null;
  const bh = boxOf(h, S.units), bc = boxOf(c, S.units);
  c.join = prima;
  const a = (h.rot || 0) * Math.PI / 180;
  const rx = Math.cos(a), ry = Math.sin(a);
  for (const segno of [1, -1]){
    const off = segno * (bh.w / 2 + bc.w / 2 + MM / 2);
    const fx = -Math.sin(a) * (-(bh.h - bc.h) / 2), fy = Math.cos(a) * (-(bh.h - bc.h) / 2);
    const box = { ...bc, x: h.x + rx * off + fx, y: h.y + ry * off + fy, rot: h.rot || 0 };
    c.join = null;
    const blocco = ingombro(S, c, box, { ignora: [h.uid] });
    c.join = prima;
    if (!blocco) return box;
  }
  return null;
}

/* ---- le manovre (pp. 124-125) ----
   Fino a qui chi avanzava si girava verso il nemico gratis, e chi aveva
   il nemico sul fianco non aveva altro modo di guardarlo che avanzare
   di sbieco. Il libro ha sei manovre, una per movimento, e la ruota
   che si paga quanto cammina il modello esterno: un reggimento largo
   che deve girarsi di 45° non avanza affatto. Qui ci sono tutte e sei,
   e ognuna dice che cosa costa prima di sceglierla. `charge.js` le
   elenca con le loro pagine (`MANOEUVRES`), `movement.js` sa quanto
   costa la ruota (`wheelCost`) e il giro (`TURN_COST`). */

/* Chi non manovra affatto: gli schermagliatori, i cui modelli vanno
   dove vogliono «without penalty» (p. 185), e il personaggio da solo,
   che e' sempre in formazione sciolta (p. 205). Per loro girarsi non
   costa niente, e un giro o un riordino non vogliono dire niente. */
const sciolta = u => !!u.loose || macchina(u) ||
  (PREP.isCharacter(u) && !!genere(u) && !isJoined(u) && (u.models || 1) === 1);

/* «Weapon of War» (p. 197), il tipo di truppa e non una regola
   d'arma: una macchina da guerra NON marcia, NON dichiara cariche e
   NON insegue; ha −1 al tiro di fuga; e in cambio «can pivot freely at
   any time during its turn», e girarsi non conta come essersi mossa.
   L'arbitro non ne sapeva niente, e nella partita fra i due Skaven il
   Warp Lightning Cannon marciava al primo turno e caricava al secondo:
   due mosse che il libro non gli lascia fare, e per colpa delle quali
   non ha mai sparato un colpo in nessuna partita. */
const macchina = u => troopType(u && u.troop).id === "warMachine";
export const FUGA_MACCHINA = -1;        // p. 197, al minimo 1

/* di quanto girarsi per passare da una direzione all'altra, con il
   segno (positivo in senso orario, cioe' verso destra), fra -180 e 180 */
const giroDi = (da, a) => ((((a || 0) - (da || 0)) % 360) + 540) % 360 - 180;
const colonna = (n, f) => Math.ceil(n / Math.max(1, f)) > f;

/* La ruota verso `rot` pagata con `budget` pollici. Costa quanto
   cammina il modello esterno (p. 124), cioe' il fronte per l'angolo in
   radianti; chi non ce la fa ruota quanto puo' e non avanza. I Lumbering
   hanno 90° gratis dopo essersi mossi, se non hanno marciato (p. 195). */
/* Chi ha un'arma che «o si muove o tira» e ha gia' qualcuno a tiro non
   deve muoversi: se lo fa, quel turno non spara affatto. L'opzione
   `ferma` lo diceva a tutti con la stessa riga — «chi non muove spara
   meglio», che e' il -1 di p. 138 — e non diceva questa, che non e' un
   -1 ma un turno intero. La marca con un campo suo, perche' l'elenco
   delle mosse non porta le armi: senza, la macchina da guerra avanzava
   di cinque pollici a ogni turno per poi non sparare mai. */
function restareFermo(S, u, d){
  const arma = CB.rangedWeapons(u)[0];
  if (!arma) return { why: "resta dov'è: chi non muove spara meglio (p. 138)" };
  const f = SH.weaponFlagsOf(arma);
  const bomba = SH.bombardOf(arma), linea = SH.lineShotOf(arma);
  const banda = SH.rangeBand(arma);
  const gittata = linea ? (banda.n || 1) * (banda.die || 6) : bomba ? banda.max : stat(arma.range);
  const minima = bomba ? banda.min : 0;
  if (f.moveOrShoot && d <= gittata && d >= minima)
    return { tieniIlTiro: true,
             why: `resta dov'è: ha ${arma.name} a tiro (${d}″ su ${gittata}″) e l'arma o si muove o tira (p. 175)` };
  return { why: "resta dov'è: chi non muove spara meglio (p. 138)" };
}

function pianoRuota(S, u, rot, budget, { marcia = false } = {}){
  const da = u.rot || 0, giro = giroDi(da, rot), ampio = Math.abs(giro);
  const piano = { rot, giro, costo: 0, intera: 0, resta: budget, libero: 0, parziale: false, sciolta: false };
  if (ampio < 0.5) return { ...piano, rot: da, giro: 0 };
  if (sciolta(u)) return { ...piano, sciolta: true };
  const libero = !marcia && FM.isLumbering(u) ? Math.min(90, ampio) : 0;
  const w = boxOf(u, S.units).w;
  const intera = CH.wheelCost(w, ampio - libero);
  if (intera <= budget + 1e-9) return { ...piano, libero, costo: intera, intera, resta: budget - intera };
  const fatti = libero + budget * MM / (w * Math.PI / 180);
  return { ...piano, libero, costo: budget, intera, resta: 0, parziale: true,
           giro: Math.sign(giro) * fatti, rot: ((da + Math.sign(giro) * fatti) % 360 + 360) % 360 };
}

/* La ruota in parole, per l'opzione: «ruota di 20°, che costa 2.1″
   (p. 124), e avanza di 1.9″». */
function testoRuota(pr, pollici, verbo = "avanza"){
  const g = Math.round(Math.abs(pr.giro));
  if (!g) return `${verbo} di ${r1(pollici)}″`;
  if (pr.sciolta) return `${verbo} di ${r1(pollici)}″ girandosi di ${g}° senza costo (formazione sciolta, pp. 185, 205)`;
  if (pr.parziale) return `ruota di ${g}° e non ${verbo}: girarsi del tutto costerebbe ${r1(pr.intera)}″ (p. 124)`;
  const libero = Math.round(pr.libero);
  if (!pr.costo) return `si gira di ${g}° senza costo (Lumbering, p. 195) e ${verbo} di ${r1(pollici)}″`;
  return `ruota di ${g}°` +
    (libero ? `, ${libero} liberi (Lumbering, p. 195) e ${g - libero} che costano ${r1(pr.costo)}″ (p. 124)`
            : `, che costa ${r1(pr.costo)}″ (p. 124)`) + `, e ${verbo} di ${r1(pr.resta)}″`;
}

/* Il giro sul posto (p. 124): i modelli dei ranghi completi girano
   dove stanno, e quelli del rango incompleto vanno in fondo. Di 90° i
   ranghi diventano file: una Temple Guard cinque per tre si ritrova
   tre per cinque, in colonna. Torna null se girata non ci sta. */
function giroSulPosto(S, u, gradi){
  const lay = layoutOf(u, S.units);
  const fronte = Math.abs(gradi) === 90 ? Math.max(1, Math.floor(lay.slots.length / lay.front)) : lay.front;
  const rot = (((u.rot || 0) + gradi) % 360 + 360) % 360;
  const box = conFronte(S, u, fronte, b => ({ ...b, rot }));
  if (ingombro(S, u, box, { unPollice: false })) return null;
  return { rot, fronte, box };
}
/* la scatola che l'unita' avrebbe con un altro fronte, senza toccarla */
function conFronte(S, u, fronte, poi = b => b){
  const prima = u.frontage;
  u.frontage = fronte;
  const box = poi(boxOf(u, S.units));
  u.frontage = prima;
  return box;
}
/* Il riordino tiene ferma la prima fila (p. 125, Fig 125.1-2): i
   modelli si aggiungono ai lati o si tolgono, e dietro si ricompone il
   resto. Il centro quindi si sposta di mezza differenza di profondita'. */
function centroRiordinato(S, u, fronte){
  const h0 = boxOf(u, S.units).h, h1 = conFronte(S, u, fronte).h;
  const v = (h1 - h0) / 2, a = (u.rot || 0) * Math.PI / 180;
  return { x: u.x - Math.sin(a) * v, y: u.y + Math.cos(a) * v };
}

/* La portata di carica di un nemico, per sapere se conviene un passo
   indietro: il suo Movimento piu' sei, piu' tre con il passo lungo
   (p. 121, p. 178). Chi tira il Movimento non ha una portata sola, e
   il dado non si tira per una domanda. */
function portataCarica(S, e){
  const passi = [e, ...capiDi(S, e)].map(x => {
    const m = moveInfo(x).m;
    if (!m) return 0;
    return Math.max(0, m + EF.statOf(x, "M").mods.reduce((t, k) => t + (k.delta || 0), 0));
  }).filter(m => m > 0);
  return passi.length ? CH.chargeBands(Math.min(...passi), MV.swiftOf(e)).max : 0;
}

function opzioniManovra(S, u, t, move){
  if (sciolta(u) || !move) return [];
  const out = [];
  const bu = boxOf(u, S.units), lay = layoutOf(u, S.units);
  const n = lay.slots.length, f0 = lay.front;
  const tt = troopType(u.troop);
  const ranghi = f => rankBonus(n, f, tt.maxRank, tt.perRank);
  const d = distanza(S, u, t);
  const arco = FM.arcOfPoly(cornersOf(t, S.units), bu).arc;
  const a = (u.rot || 0) * Math.PI / 180;
  /* dove sta il nemico rispetto al fronte: positivo a destra */
  const lx = (t.x - u.x) * Math.cos(a) + (t.y - u.y) * Math.sin(a);
  const base = { uid: u.uid, verso: t.uid, nome: u.name, contro: t.name };

  /* il giro (p. 124): per chi ha il nemico sul fianco o alle spalle */
  if (arco !== "fronte"){
    const gradi = arco === "retro" ? 180 : (lx >= 0 ? 90 : -90);
    const g = giroSulPosto(S, u, gradi);
    if (g){
      const costo = move * MV.TURN_COST[Math.abs(gradi)];
      const cambio = g.fronte !== f0
        ? `; il fronte passa da ${f0} a ${g.fronte}` + (colonna(n, g.fronte) ? ", in colonna" : "") +
          `, bonus di ranghi +${ranghi(f0)} → +${ranghi(g.fronte)}` : "";
      out.push({ id:"gira", ...base, gradi, dove: gradi === 180 ? "180°" : `90° a ${gradi > 0 ? "destra" : "sinistra"}`,
        why: `${t.name} le sta ${arco === "retro" ? "alle spalle" : "sul fianco"}, a ${d}″: gira di ` +
             `${Math.abs(gradi)}°${gradi === 180 ? "" : gradi > 0 ? " a destra" : " a sinistra"} ` +
             `(${r1(costo)}″, ${Math.abs(gradi) === 90 ? "un quarto" : "metà"} del Movimento, p. 124)${cambio}, ` +
             `e fa dritta i ${r1(move - costo)}″ che restano`,
        page: 124 });
    }
  }

  /* la riforma (p. 125): girarsi del tutto senza perdere i ranghi, per
     chi non ci riesce ruotando — e costa tutto il movimento. A chi la
     ruota se la puo' permettere non si offre: un Troll che si gira di
     70° con due pollici e poi cammina non ha motivo di stare fermo */
  const rotT = versoDi(t.x - u.x, t.y - u.y);
  const giro = Math.round(Math.abs(giroDi(u.rot, rotT)));
  if (giro >= 1 && pianoRuota(S, u, rotT, move).parziale &&
      !ingombro(S, u, { ...bu, rot: rotT }, { unPollice: false })){
    out.push({ id:"riforma", ...base,
      why: `si gira sul centro verso ${t.name} (${giro}°) tenendo il fronte di ${f0}` +
           (ranghi(f0) ? ` e il bonus di ranghi +${ranghi(f0)}` : "") + `: costa tutto il movimento e non avanza (p. 125)`,
      page: 125 });
  }

  /* indietro (p. 125), a meta' Movimento e sempre girati verso il
     nemico: si offre solo a chi ha davanti qualcuno che lo puo' caricare */
  const m2 = move / 2;
  const minaccia = nemiciDi(S, u).filter(e => !e.fled)
    .map(e => ({ e, d: distanza(S, u, e), portata: portataCarica(S, e) }))
    .filter(x => x.portata && x.d <= x.portata && FM.arcOfPoly(cornersOf(x.e, S.units), bu).arc === "fronte")
    .sort((p, q) => p.d - q.d)[0];
  if (minaccia){
    const { e, d: de, portata } = minaccia;
    out.push({ id:"indietro", uid: u.uid, verso: e.uid, nome: u.name, contro: e.name,
      why: `indietro di ${r1(m2)}″ (metà del Movimento, p. 125), sempre girata verso ${e.name}: ` +
           `è a ${de}″ e in carica arriva a ${portata}″` + (de + m2 > portata ? ", e ne esce" : ", e resta a portata"),
      page: 125 });
  }

  /* di lato (p. 125), a meta' Movimento: per mettersi davanti al nemico
     che si ha di fronte ma spostato. Sotto il mezzo pollice non si
     offre: e' la misura dell'app, non del libro */
  if (arco === "fronte" && Math.abs(lx) > MM / 2){
    const quanto = r1(Math.min(m2, Math.abs(lx) / MM));
    out.push({ id:"lato", ...base, segno: lx > 0 ? 1 : -1, pollici: quanto, dove: lx > 0 ? "a destra" : "a sinistra",
      why: `di lato di ${quanto}″ a ${lx > 0 ? "destra" : "sinistra"}, per mettersi davanti a ${t.name} ` +
           `(di lato si va a metà: al massimo ${r1(m2)}″, p. 125)`,
      page: 125 });
  }

  /* riordinare le file (p. 125): fino a cinque modelli in piu' o in
     meno in prima fila. Si offre il fronte piu' largo, e il piu' stretto
     che resta in ordine di combattimento: una colonna la si fa girando */
  if (n > 1 && ensureRanks(u)){
    const larga = Math.min(f0 + 5, n);
    let stretta = 0;
    for (let f = Math.max(1, f0 - 5); f < f0; f++) if (!colonna(n, f)){ stretta = f; break; }
    for (const f of [larga, stretta]){
      if (!f || f === f0) continue;
      const c = centroRiordinato(S, u, f);
      if (ingombro(S, u, conFronte(S, u, f, b => ({ ...b, ...c })), { unPollice: false })) continue;
      out.push({ id:"riordina", uid: u.uid, nome: u.name, fronte: f, dove: `${f} di fronte`,
        why: `riordina le file: fronte da ${f0} a ${f} (${Math.ceil(n / f)} ranghi), ` +
             `bonus di ranghi +${ranghi(f0)} → +${ranghi(f)}; costa metà del Movimento e resta dov'è (p. 125)`,
        page: 125 });
    }
  }
  return out;
}
const ensureRanks = u => FM.ensureFormation(u).mode === "ranks";

/* Le manovre applicate. Una sola per movimento (p. 124): chi l'ha
   fatta ha `moved`, e non ne sceglie un'altra. */
function manovra(S, a){
  const u = byUid(S, a.uid);
  if (!u) return no("unità sconosciuta");
  if (u.moved) return no("si è già mossa: una manovra sola per movimento (p. 124)");
  if (!onBoard(u) || u.fled || u.charged || ingaggiata(S, u)) return no("non può manovrare adesso");
  if (u.unito === chiave(S)) return no("un personaggio le si è unito: non si muove più in questo turno (p. 207)");
  if (stupida(S, u)) return no("è in preda alla Stupidità: non si muove");
  if (sciolta(u)) return no("in formazione sciolta non si manovra: ogni modello va dove vuole (p. 185)");
  const { move } = movimento(S, u);
  if (!move) return no("non sa di quanto si muove: il profilo non porta il Movimento");
  const r = (u.rot || 0) * Math.PI / 180;
  const avanti = [Math.sin(r), -Math.cos(r)], destra = [Math.cos(r), Math.sin(r)];
  const dritto = (dir, pollici) => {
    const p = percorso(S, u, [u.x + dir[0] * pollici * MM, u.y + dir[1] * pollici * MM], pollici,
                       { rot: u.rot || 0, devia: false });
    posa(S, u, p.x, p.y, u.rot);
    return p;
  };
  const fermo = (p, quanti) => p.stop && p.pollici < quanti - 0.05 ? `, e si ferma: c'è ${p.stop.perche}` : "";
  const f0 = layoutOf(u, S.units).front;

  if (a.id === "gira"){
    const gradi = +a.gradi;
    if (![90, -90, 180].includes(gradi)) return no("si gira di 90° o di 180° (p. 124)");
    const g = giroSulPosto(S, u, gradi);
    if (!g) return no("girata non ci sta: toccherebbe un'altra unità o il bordo");
    const costo = move * MV.TURN_COST[Math.abs(gradi)];
    u.frontage = g.fronte;
    posa(S, u, u.x, u.y, g.rot);
    const ra = g.rot * Math.PI / 180, resta = move - costo;
    let p = { pollici: 0, stop: null };
    if (resta > 0.01){
      p = percorso(S, u, [u.x + Math.sin(ra) * resta * MM, u.y - Math.cos(ra) * resta * MM], resta,
                   { rot: g.rot, devia: false });
      posa(S, u, p.x, p.y, g.rot);
    }
    u.moved = { kind: "turn", inches: p.pollici };
    limite(S, "manovre");
    say(S, `${u.name} gira di ${Math.abs(gradi)}°${gradi === 180 ? "" : gradi > 0 ? " a destra" : " a sinistra"} ` +
           `(${r1(costo)}″)` + (g.fronte !== f0 ? `: il fronte passa da ${f0} a ${g.fronte}` : "") +
           (p.pollici ? `, e avanza dritta di ${p.pollici}″` : "") + fermo(p, resta) + ".",
        { army: u.army, page: 124 });
    return si("girata");
  }

  if (a.id === "riforma"){
    const t = byUid(S, a.verso);
    if (!t) return no("verso chi?");
    const rot = versoDi(t.x - u.x, t.y - u.y);
    if (ingombro(S, u, { ...boxOf(u, S.units), rot }, { unPollice: false }))
      return no("riformata non ci sta: toccherebbe un'altra unità o il bordo");
    const giro = Math.round(Math.abs(giroDi(u.rot, rot)));
    posa(S, u, u.x, u.y, rot);
    /* conta come mossa, anche per il tiro (p. 139: «including rallying and reforming») */
    u.moved = { kind: "reform", inches: 0 };
    limite(S, "manovre");
    say(S, `${u.name} si riforma e si gira di ${giro}° verso ${t.name}, con il fronte di ${f0}: tutto il movimento.`,
        { army: u.army, page: 125 });
    return si("riformata");
  }

  if (a.id === "indietro"){
    const quanti = move / 2;
    const p = dritto([-avanti[0], -avanti[1]], quanti);
    u.moved = { kind: "back", inches: p.pollici };
    say(S, `${u.name} arretra di ${p.pollici}″, sempre girata verso il nemico (metà del Movimento)` +
           fermo(p, quanti) + ".", { army: u.army, page: 125 });
    return si("indietro");
  }

  if (a.id === "lato"){
    const segno = +a.segno > 0 ? 1 : -1;
    const quanti = Math.min(move / 2, +a.pollici > 0 ? +a.pollici : move / 2);
    const p = dritto([destra[0] * segno, destra[1] * segno], quanti);
    u.moved = { kind: "side", inches: p.pollici };
    say(S, `${u.name} si sposta di lato di ${p.pollici}″ a ${segno > 0 ? "destra" : "sinistra"} (metà del Movimento)` +
           fermo(p, quanti) + ".", { army: u.army, page: 125 });
    return si("di lato");
  }

  if (a.id === "riordina"){
    const n = layoutOf(u, S.units).slots.length, f = Math.round(+a.fronte);
    if (!ensureRanks(u) || !(f >= 1 && f <= n) || f === f0 || Math.abs(f - f0) > 5)
      return no("si tolgono o si aggiungono fino a cinque modelli alla prima fila (p. 125)");
    const c = centroRiordinato(S, u, f);
    if (ingombro(S, u, conFronte(S, u, f, b => ({ ...b, ...c })), { unPollice: false }))
      return no("riordinata non ci sta: toccherebbe un'altra unità o il bordo");
    u.frontage = f;
    posa(S, u, c.x, c.y, u.rot);
    u.moved = { kind: "redress", inches: 0 };
    limite(S, "manovre");
    say(S, `${u.name} riordina le file: da ${f0} a ${f} di fronte (metà del Movimento).`, { army: u.army, page: 125 });
    return si("riordinata");
  }
  return no(`manovra sconosciuta: ${a.id}`);
}

/* ---- tiro (p. 136) ---- */
function opzioniTiro(S){
  const out = [];
  for (const u of inCampo(S, S.army)){
    if (u.fled || ingaggiata(S, u) || u.shot || stupida(S, u)) continue;
    const armi = CB.rangedWeapons(u);
    if (!armi.length) continue;
    const arma = armi[0];
    /* «Move or Shoot» non e' un divieto dell'unita' ma dell'arma, e
       l'arbitro non lo passava a `canShoot`: i Warplock Jezzails
       marciavano e sparavano nello stesso turno, e il Warp Lightning
       Cannon pure. La riga delle regole sta sul profilo dell'arma. */
    const gate = SH.canShoot({ charged: !!u.charged, marched: !!(u.moved && u.moved.kind === "march"),
                               engaged: ingaggiata(S, u), fleeing: !!u.fled,
                               moved: haMosso(u), weaponFlags: SH.weaponFlagsOf(arma) });
    if (!gate.can) continue;
    /* una macchina guasta non tira fino alla fine del round successivo
       (p. 226): il divieto vale per la bombardata come per l'arco */
    if (u.nonTira && S.turno <= u.nonTira) continue;
    /* il fulmine e' una linea e non una sagoma: la lunghezza si tira,
       e allora la gittata massima e' quella che i dadi possono dare */
    const fulmine = SH.lineShotOf(arma);
    if (fulmine){
      const massimo = (fulmine.banda.n || 1) * (fulmine.banda.die || 6);
      for (const t of nemiciDi(S, u)){
        if (ingaggiata(S, t)) continue;
        const d = distanza(S, u, t);
        if (d > massimo) continue;
        if (vistaTagliata(S, u, t)) continue;
        const f = previsioneFulmine(S, u, t, arma);
        out.push({ id:"fulmina", uid: u.uid, target: t.uid, nome: u.name, contro: t.name, dist: d,
                   why: `${fulmine.why}, da ${d}″: in media ci finiscono sotto ${f.sotto} ` +
                        `modell${f.sotto === 1 ? "o" : "i"} di ${t.name}, ≈ ${f.kills.toFixed(1)} perdite`,
                   attesa: f.kills, page: fulmine.page });
      }
      continue;
    }
    /* chi spara a bombardata non tira per colpire e non offre «tira»:
       e' un'altra procedura, e il bersaglio e' un punto sul tavolo */
    const bomba = bombardaDi(u, arma);
    if (bomba){
      /* la sagoma che i libri in casa non dicono non si indovina: il
         limite lo dichiara `limitiDiPartenza`, qui non si spara */
      if (!bomba.known) continue;
      for (const t of nemiciDi(S, u)){
        if (ingaggiata(S, t)) continue;
        const d = distanza(S, u, t);
        if (d > bomba.banda.max || d < bomba.banda.min) continue;
        if (vistaTagliata(S, u, t)) continue;
        const f = previsioneBombarda(S, u, t, arma, bomba);
        out.push({ id:"bombarda", uid: u.uid, target: t.uid, nome: u.name, contro: t.name, dist: d,
                   why: `${bomba.why}, da ${d}″: se non devia ci finiscono sotto ${f.sotto} ` +
                        `modell${f.sotto === 1 ? "o" : "i"} di ${t.name}, ≈ ${f.kills.toFixed(1)} perdite`,
                   attesa: f.kills, page: bomba.page });
      }
      continue;
    }
    const gittata = stat(arma.range);
    for (const t of nemiciDi(S, u)){
      /* «units cannot shoot at enemy units that are engaged in combat»
         (p. 143): si guardava se era ingaggiato chi tira, mai chi e'
         bersagliato, e gli Skink tiravano sui Black Orc che la Temple
         Guard aveva addosso */
      if (ingaggiata(S, t)) continue;
      const d = distanza(S, u, t);
      if (d > gittata) continue;
      if (vistaTagliata(S, u, t)) continue;
      const mods = modificatori(S, u, t, d, gittata);
      const f = CB.shootForecast(u, t, { weapon: arma, mods: mods.total });
      /* la probabilita' scritta in chiaro: un modello che legge «6+» e
         basta continua a tirare a vuoto per quattro turni */
      const pc = Math.round(SH.hitChance(f.hitNeed, f.hitAgain, f.hitThen) * 100);
      out.push({ id:"tira", uid: u.uid, target: t.uid, nome: u.name, contro: t.name, dist: d,
                 why: `${f.shots} tiri con ${arma.name} da ${d}″, colpisce a ${f.hitNeed}+ (${pc}% a tiro)` +
                      (mods.list.length ? ` (${mods.list.map(m => m.why).join(", ")})` : "") +
                      `, ≈ ${f.kills.toFixed(1)} perdite`,
                 attesa: f.kills, page: 136 });
    }
  }
  out.push(...opzioniLancio(S, ["missile"]));
  out.sort((a, b) => b.attesa - a.attesa);
  return [...out, avanti("nessun altro tiro")];
}

/* ---- mischia (p. 144) ---- */
function opzioniMischia(S){
  /* Ogni combattimento fa un round per turno (p. 144): quelli gia'
     risolti in questo turno non tornano a chiedere. Senza questa riga
     le stesse due unita' si menavano finche' una moriva, tutto dentro
     lo stesso turno. */
  const gruppi = gruppiInMischia(S).map((g, i) => ({ g, i }))
    .filter(x => !fatto(S, x.g));
  if (!gruppi.length) return [avanti("nessun combattimento da risolvere")];
  const nomi = l => l.map(u => u.name).join(" e ");
  const assalti = gruppi.flatMap(x => opzioniLancio(S, ["assailment"], { gruppo: x.g }));
  return [...assalti,
          ...gruppi.map(x => ({ id:"combatti", gruppo: x.i, nome: nomi(x.g.A), contro: nomi(x.g.B),
                                why: `${nomi(x.g.A)} contro ${nomi(x.g.B)}`, page: 144 })),
          avanti("rimanda i combattimenti")];
}
const chiave = S => `${S.turno}:${S.army}`;
const fatto = (S, g) => [...g.A, ...g.B].some(u => u.fought === chiave(S));

/* I combattimenti in corso: si parte da un contatto fra nemici e si
   tira dentro chiunque tocchi qualcuno di quelli gia' dentro. E' il
   «combattimento» del manuale (p. 153), che e' un gruppo e non una
   coppia. */
export function gruppiInMischia(S){
  const cs = contatti(S).filter(c => c.aArmy !== c.bArmy);
  const visti = new Set(), out = [];
  for (const c of cs){
    if (visti.has(c.a) || visti.has(c.b)) continue;
    const dentro = new Set([c.a, c.b]);
    let cresce = true;
    while (cresce){
      cresce = false;
      for (const x of cs){
        if (dentro.has(x.a) !== dentro.has(x.b)){
          dentro.add(x.a); dentro.add(x.b); cresce = true;
        }
      }
    }
    for (const uid of dentro) visti.add(uid);
    const lista = [...dentro].map(uid => byUid(S, uid)).filter(u => u && onBoard(u));
    out.push({ A: lista.filter(u => u.army === "A"), B: lista.filter(u => u.army === "B") });
  }
  return out.filter(g => g.A.length && g.B.length);
}

/* ============================================================
   6 · I NUMERI CHE SERVONO A DECIDERE
   ============================================================ */
function ldOf(S, u, { zitto = false } = {}){
  const p = PS.psychOf(u, { joined: capiInFila(S, u) });
  const base = comandoDi(S, u, ldProprio(S, u).ld, { zitto }).ld;
  return PS.leadershipOf(base, p, { rankBonus: ranghiAdesso(S, u), fleeing: !!u.fled }).value;
}
/* Il bonus di ranghi che la Warband somma al Comando: quello di adesso,
   che il disordine azzera. Prima `ldOf` non lo passava, e la Warband
   valeva nel test di rotta (`schieraDi`) ma non nel Terrore, nella
   Paura e nel Panico: quaranta Clanrats su quattro ranghi tiravano il
   Terrore del Carnosauro con Comando 4 invece di 7. */
function ranghiAdesso(S, u){
  const c = CB.combatant(u, { joined: capiInFila(S, u) });
  return c.disrupted ? 0 : rankBonus(c.models, c.frontage,
    c.troop ? c.troop.maxRank : 2, c.troop ? c.troop.perRank : 5);
}
/* Il Comando piu' alto fra i modelli dell'unita', capi compresi (p. 97):
   «warriors naturally look to the most steadfast of their number». */
function ldProprio(S, u){
  const c = CB.combatant(u);
  let ld = +(c.ldBase != null ? c.ldBase : c.ld) || 0, chi = "";
  for (const x of capiInFila(S, u)){
    const k = CB.combatant(x);
    const v = +(k.ldBase != null ? k.ldBase : k.ld) || 0;
    if (v > ld){ ld = v; chi = x.name; }
  }
  return { ld, chi };
}
/* Da dove viene il Comando con cui l'unita' tira, per la scheda che lo
   spiega: il suo, quello del capo che ci sta dentro, quello del
   generale vicino, la Warband. Sono le stesse strade di `ldOf`, dette
   una per una — e il generale a cinque pollici e' quasi sempre la
   ragione per cui un reggimento da Comando 5 non scappa. */
function fontiComando(S, u){
  const c = CB.combatant(u);
  const suo = +(c.ldBase != null ? c.ldBase : c.ld) || 0;
  const pr = ldProprio(S, u);
  const out = [{ t: `Comando ${suo} dal profilo`, f: "profilo" }];
  if (pr.chi) out.push({ t: `Comando ${pr.ld} di ${pr.chi}, che ci sta dentro (p. 97)`, f: "regola" });
  const g = comandoDi(S, u, pr.ld, { zitto: true });
  if (g.why) out.push({ t: `${g.why}: si usa il suo (p. 202)`, f: "generale" });
  const w = PS.leadershipOf(g.ld, PS.psychOf(u, { joined: capiInFila(S, u) }),
                            { rankBonus: ranghiAdesso(S, u), fleeing: !!u.fled });
  if (w.mods && w.mods.length) out.push({ t: w.why, f: "regola" });
  return out;
}

/* Il Movimento che si tira (3D6 dei Squig Hopper, del Doomwheel): si
   tira una volta per turno e resta scritto, cosi' la stessa unita' non
   ha due Movimenti diversi nella stessa fase. */
/* Il Movimento che vale adesso: quello del profilo, con sopra le
   maledizioni e i potenziamenti che lo toccano (Storm Call, Miasmic
   Mirage). `moveInfo` legge il file e basta; la differenza la sa
   `effects.js`. */
function movimento(S, u){
  /* con un capo dentro si va al passo del piu' lento (p. 208) */
  const capi = capiDi(S, u);
  if (capi.length){
    const tutti = [movimentoSolo(S, u), ...capi.map(c => movimentoSolo(S, c))];
    const lento = tutti.filter(x => x.move > 0).sort((a, b) => a.move - b.move)[0] || tutti[0];
    return lento === tutti[0] ? lento
      : { ...lento, mv: { ...tutti[0].mv, why: `al passo di ${capi[tutti.indexOf(lento) - 1].name} (p. 208)` } };
  }
  return movimentoSolo(S, u);
}
function movimentoSolo(S, u){
  const mv = moveInfo(u);
  const base = mv.m || (mv.random ? tiraRandom(S, u, mv) : 0);
  if (!base) return { mv, move: 0 };
  const m = EF.statOf(u, "M");
  const delta = m.mods.reduce((t, x) => t + (x.delta || 0), 0);
  return { mv, move: Math.max(0, base + delta), delta };
}
const bandiera = (u, k) => !!EF.flagsOf(u).flags[k];
/* Random Movement (p. 176): chi ce l'ha non marcia e non dichiara
   cariche; si muove di quanto tira, e se tocca un nemico ha caricato */
const vagante = u => (u.rules || []).some(r => /^random movement/i.test(String(r)));
const abominevole = u => (u.rules || []).some(r => /^abominable attacks/i.test(String(r)));
/* In preda alla Stupidita': il reggimento, o quello in cui il capo sta. */
const stupida = (S, u) => bandiera(isJoined(u) ? (byUid(S, FM.joinedHost(u)) || u) : u, "stupid");

function tiraRandom(S, u, mv){
  const key = S.turno + ":" + S.army;
  if (u.randomMove && u.randomMove.key === key) return u.randomMove.n;
  const m = String(mv.random).match(/^(\d+)D(\d+)$/i);
  if (!m) return 0;
  const dadi = roll(+m[1]);
  const n = dadi.reduce((s, v) => s + v, 0);
  u.randomMove = { key, n, dadi };
  /* la scheda risponde a «perche' l'Abominio ha fatto proprio undici
     pollici»: il suo Movimento non e' un numero ma un tiro, e sopra ci
     possono stare gli incantesimi che lo toccano */
  const magie = EF.statOf(u, "M").mods.filter(x => x.delta);
  say(S, `${u.name}: Movimento ${mv.random} → ${dadi.join(" + ")} = ${n}″.`,
      { dice: dadi, army: u.army, page: mv.page || 0,
        x: { k: "movimento", u: u.name, uid: u.uid, tot: n,
             piu: magie.map(x => ({ t: x.from, v: x.delta })),
             f: [{ t: mv.why || `il Movimento è ${mv.random}: si tira a ogni turno`, f: "profilo" },
                 ...(vagante(u) ? [{ t: "Random Movement: non marcia e non dichiara cariche, va di quanto tira; se tocca un nemico lo ha caricato (p. 176)", f: "regola" }] : []),
                 ...magie.map(x => ({ t: `${x.from}: ${x.delta > 0 ? "+" : "−"}${Math.abs(x.delta)}″ al Movimento`, f: "magia" }))],
             e: `si muove fino a ${Math.max(0, n + magie.reduce((s, x) => s + x.delta, 0))}″` } });
  return n;
}

/* ---- il terreno (pp. 269-272, e p. 159 per il combattimento) ----
   Fin qui l'arbitro del terreno sapeva due cose, tutte e due guardando
   un punto solo: se una retta fra i due centri toccava un pezzo che
   «blocca», e se il centro di un'unita' stava dentro un pezzo che
   «ripara». Non sapeva il pollice in meno, il dado peggiore, i ranghi
   persi, il test di terreno pericoloso, la collina. Le regole c'erano
   tutte, scritte in `terrain.js` e in `sight.js`: mancava chi gliele
   chiedesse. */

/* I pezzi che un'unita' tocca stando dove sta: il conto e' sui modelli
   veri, perche' «un quarto dei modelli dentro» (p. 128) non si legge
   su un rettangolo. */
function celleDi(S, u){
  return FM.worldCells(u, layoutOf(u, S.units)).map(c => [c.wx, c.wy]);
}
function pezziSotto(S, u){
  const pts = celleDi(S, u);
  return S.terrain.filter(t => !t.decor && pts.some(p => t.contains(p)));
}

/* Dove sta un'unita', nella forma che serve a misurare un percorso: il
   centro e i quattro angoli. Il libro conta «una parte qualsiasi
   dell'unita'» (p. 269), e una linea sola dal centro non e' una parte
   qualsiasi. */
const postiDi = (S, u) => [[u.x, u.y], ...cornersOf(u, S.units)];

/* I pezzi attraversati andando da un posto all'altro. Resta una stima —
   cinque linee invece di una sagoma che scorre — ed e' molto meno
   grossolana della linea sola di prima. */
function pezziFra(S, da, a){
  const visti = new Set(), out = [];
  for (let i = 0; i < Math.min(da.length, a.length); i++)
    for (const hit of CH.crossed(da[i], a[i], S.terrain)){
      if (visti.has(hit.tid)) continue;
      visti.add(hit.tid); out.push(hit);
    }
  return out;
}

/* I pezzi che si attraverserebbero andando da quella parte per tanti
   pollici: il percorso che si ha in mente prima di muovere, che e'
   quello su cui si decide di quanto ci si puo' muovere. */
function pezziSulCammino(S, u, verso, pollici){
  const dx = verso[0] - u.x, dy = verso[1] - u.y;
  const len = Math.hypot(dx, dy) || 1;
  const mm = Math.max(0, +pollici || 0) * MM;
  const ux = dx / len * mm, uy = dy / len * mm;
  const da = postiDi(S, u);
  return pezziFra(S, da, da.map(p => [p[0] + ux, p[1] + uy]));
}

/* Il pollice in meno (p. 269): si applica al Movimento, non ai pollici
   gia' raddoppiati della marcia, e per questo si passa `move` e non
   `quanti` — una marcia nel bosco ne perde due, ed e' giusto cosi'. */
function rallenta(S, u, verso, pollici){
  const eff = TR.slowMove(pollici, pezziSulCammino(S, u, verso, pollici));
  if (eff.slowed) say(S, `${u.name}: ${eff.text}.`, { army: u.army, page: eff.page,
      x: { k: "terreno", t: "Terreno difficile", u: u.name, uid: u.uid,
           f: [{ t: eff.text, f: "terreno" }], e: `si muove di ${eff.move}″ invece di ${pollici}″`, ok: false } });
  return eff.move;
}

/* Il test di terreno pericoloso (p. 269): un D6 per modello per ogni
   pezzo attraversato, e con un 1 il modello perde una ferita. Lo
   tirano tutti i modelli dell'unita', non solo quelli passati davvero
   dentro: e' la semplificazione dichiarata in `LIMITI`. */
/* Iron Shod Wheels: il carro tratta il difficile come pericoloso, e
   con un 1 perde D3 ferite invece di una. L'ostacolo basso per lui e'
   impassabile, e lo dice `chiusoPer`. */
const ferrate = u => haRegola(u, /^iron shod wheels/i);
const chiusoPer = (u, t) => !!(t.cat && (t.cat.noEntry || (t.cat.id === "lowWall" && ferrate(u))));

function terrenoPericoloso(S, u, pezzi){
  const fer = ferrate(u);
  const ask = TR.dangerousAsk(alive(u), pezzi, { ferrate: fer });
  if (!ask) return 0;
  limite(S, "pericoloso");
  const dadi = roll(ask.n);
  const uni = TR.dangerousLosses(dadi);
  const d3 = fer && uni ? roll(uni) : [];
  const ferite = fer ? d3.reduce((s, d) => s + Math.ceil(d / 2), 0) : uni;
  if (d3.length) dadi.push(...d3);
  /* «perde una ferita», non «cade»: un Troll da tre ferite che mette un
     piede in fallo non muore per una pozzanghera. `woundsToll` fa la
     conversione da ferite a modelli e tiene appeso quello che avanza,
     ed e' la stessa che usano il tiro e la magia. */
  const conto = ferite ? CB.woundsToll(u, ferite, { carried: u.wounds || 0 }) : null;
  say(S, `${u.name} attraversa ${[...new Set(ask.pieces)].join(", ")}: ` +
         `${ask.n} dad${ask.n === 1 ? "o" : "i"} a ${ask.need}+, ` +
         (ferite ? `${ferite} ferit${ferite === 1 ? "a" : "e"}` +
                   (conto.kills ? `, ${conto.kills} a terra` : ", nessuno a terra")
                 : "nessuna ferita") +
         (fer ? ", D3 ferite per ogni 1 (Iron Shod Wheels)" : "") +
         ` (p. ${ask.page}).`,
      { dice: dadi, army: u.army, page: ask.page,
        x: { k: "pericoloso", u: u.name, uid: u.uid, d: [],
             passi: [{ t: "gli 1 feriscono", uno: true, d: dadi.slice(0, ask.n) }],
             f: [{ t: `attraversa ${[...new Set(ask.pieces)].join(", ")}: un D6 per modello, con un 1 perde una ferita`, f: "terreno" },
                 ...(fer ? [{ t: "Iron Shod Wheels: il difficile è pericoloso, e ogni 1 costa D3 ferite", f: "regola" }] : [])],
             e: ferite ? `${ferite} ferit${ferite === 1 ? "a" : "e"}${conto.kills ? `, ${conto.kills} a terra` : ""}` : "nessuna ferita",
             ok: !ferite } });
  if (conto) perdite(S, u, conto.kills, conto.left);
  return ferite;
}

/* Muoversi e pagarne il prezzo: il conto si fa sul percorso VERO, da
   dove si e' partiti a dove si e' finiti, non su quello che si aveva in
   mente. `da` sono i posti di partenza, presi prima di muovere. */
function dopoIlMovimento(S, u, da){
  if (!onBoard(u) || !da) return;
  terrenoPericoloso(S, u, pezziFra(S, da, postiDi(S, u)));
}

/* Chi vola: il numero lo da' `profiles.js` leggendo «Fly (X)». Qui
   serve per l'ostacolo difeso, che chi vola scavalca (p. 270). Il
   sorvolo vero resta fra i limiti dichiarati. */
const vola = u => (moveInfo(u).fly || 0) > 0;

/* Il terreno che una carica attraversa (p. 128), e l'ostacolo che il
   bersaglio difende (p. 270). Sono due cose che si guardano insieme e
   prima del tiro, perche' cambiano il numero con cui si decide se la
   carica si puo' dichiarare: il difficile toglie un pollice al
   Movimento e rovescia il dado, e il muretto difeso non si attraversa
   affatto — quindi non costa niente di quei due, e costa invece il
   bonus di Iniziativa. */
function terrenoDiCarica(S, u, t){
  const muro = CH.defendedLine(boxOf(u, S.units), { box: boxOf(t, S.units), poly: cornersOf(t, S.units) },
                               S.terrain);
  const strada = CH.crossed([u.x, u.y], [t.x, t.y], S.terrain).filter(p => p !== muro);
  return { eff: CH.terrainEffect(strada), muro, strada };
}

/* Chi sta sulla collina, e quanto (p. 272). Serve due volte: alla vista
   — che ci si vede oltre le unita' — e al tiro, che da lassu' ha una
   fila in piu'. Il terreno piu' alto del combattimento (p. 152) si
   conta invece sulla sola prima fila, perche' e' la fila che mena. */
const collineDi = S => S.terrain.filter(t => t.kind === "hill");
function primaFila(S, u){
  const lay = layoutOf(u, S.units);
  return FM.worldCells(u, lay)
    .filter(c => u.loose || SH.rankOf(c.cell, lay.front || 1) === 0)
    .map(c => [c.wx, c.wy]);
}
const sullaCollina = (S, u) => SG.hillState(celleDi(S, u), collineDi(S));
const filaPiuAlta = (S, u) => SG.hillShare(primaFila(S, u), collineDi(S)) > 0.5;

/* Quanti modelli tirano (p. 143), con la FILA IN PIU' di chi sta tutto
   su una collina (p. 272, *Vantage Point*). `shoot.js` sa questa regola
   da sempre; `CB.shooters` chiamava il tetto senza dirgli della
   collina, e un reggimento di arcieri in cima tirava con la stessa
   prima fila di uno in mezzo all'erba. */
const quantiTirano = (S, u) => SH.shooterCap({
  models: u.models || 1, lost: u.lost || 0,
  frontage: u.frontage || 1, loose: !!u.loose,
  hill: sullaCollina(S, u) === "all",
});

/* Le unita' in mezzo, nella forma che `sight.js` vuole: bloccano la
   vista (p. 103), e chi sta tutto su una collina le scavalca con lo
   sguardo (p. 272). */
function altreDi(S, a, b){
  return S.units.filter(o => o !== a && o !== b && onBoard(o) && !isJoined(o)).map(o => ({
    name: o.name, poly: cornersOf(o, S.units), loose: !!o.loose,
    hill: !!sullaCollina(S, o),
  }));
}

/* La vista del libro, quella intera: i modelli e le unita' in mezzo, la
   penombra del bosco, la cresta della collina, e il riparo contato sui
   modelli coperti invece che sul centro (pp. 103, 139, 270, 272). */
function guarda(S, a, b){
  return SG.unitSight({
    eyes: primaFila(S, a),
    targets: FM.worldCells(b, layoutOf(b, S.units)),
    terrain: S.terrain, others: altreDi(S, a, b),
    fromHill: sullaCollina(S, a), toHill: sullaCollina(S, b),
  });
}
function vistaTagliata(S, a, b){ return !guarda(S, a, b).sees; }
function coperturaDi(S, u, da = null){
  return da ? guarda(S, da, u).cover : "";
}
function segmentoTocca(a, b, t){
  const poly = boxCorners({ x: t.x, y: t.y, w: t.w, h: t.h, rot: t.rot || 0 });
  for (let i = 0; i < 24; i++){
    const p = [a.x + (b.x - a.x) * i / 23, a.y + (b.y - a.y) * i / 23];
    if (dentroPoly(p, poly)) return true;
  }
  return false;
}
function dentroPoly(p, poly){
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/* ============================================================
   7 · APPLICARE UN GESTO
   Qui si tirano i dadi e si scrivono i pezzi. Ogni gesto torna
   `{ ok, text }`: quando `ok` e' falso il gesto non era legale, e
   l'arbitro lo dice invece di far finta di averlo fatto — e' la stessa
   onesta' che il resto dell'app ha con i numeri che non sa.
   ============================================================ */
export function apply(S, a){
  if (S.finita) return no("la partita è finita");
  if (!a || !a.id) return no("nessun gesto");
  const f = GESTI[a.id];
  if (!f) return no(`gesto sconosciuto: ${a.id}`);
  /* con una domanda in sospeso si risponde a quella e basta */
  const attesi = S.pending ? SOSPESI[S.pending.kind] : null;
  if (attesi && !attesi.includes(a.id)) return no(`prima si risponde alla domanda in sospeso (${S.pending.kind})`);
  /* il gesto dice ai dadi chi li tira: con una sorgente per gesto
     (`D.seededPerGesto`, gli esperimenti) lo stesso gesto nella stessa
     casella tira gli stessi dadi in partite diverse; con le altre
     sorgenti non cambia niente */
  contestoDadi(`${S.turno}|${S.army}|${S.casella}|${a.id}|${a.uid ?? ""}|${a.target ?? a.verso ?? a.host ?? a.spell ?? ""}|${a.kind ?? a.chi ?? ""}`);
  return f(S, a);
}
/* si alterna, e chi ha finito lascia continuare l'altro */
function alterna(S){
  segnaChiHaFinito(S);
  S.army = S.army === "A" ? "B" : "A";
  if (!daSchierare(S)){
    S.army = S.army === "A" ? "B" : "A";
    if (!daSchierare(S)) fineSchieramento(S);
  }
}
const SOSPESI = { primo: ["primo", "avanti"], dissolvi: ["dissolvi", "lascia", "avanti"], assalto: ["lancia", "lascia", "avanti"],
                  sfida: ["sfida", "nessuna", "avanti"],
                  raccogli: ["accetta", "rifiuta", "avanti"],
                  ritira: ["ritira", "nessuna", "avanti"],
                  abominio: ["abominio", "avanti"] };
const no = why => ({ ok: false, text: why });
const si = text => ({ ok: true, text });

const GESTI = {
  /* «avanti» con un dissolvimento o un assalto in sospeso vuol dire
     «non faccio niente»: la partita non salta la domanda, la chiude */
  avanti: (S) => {
    const k = S.pending ? S.pending.kind : "";
    /* «passo» davanti a chi comincia: chi ha vinto il tiro prende per se' */
    if (k === "primo") return GESTI.primo(S, S.pending.list.find(x => x.chi === S.pending.lato));
    if (k === "dissolvi" || k === "assalto") return GESTI.lascia(S);
    if (k === "sfida" || k === "ritira") return GESTI.nessuna(S);
    /* «passo» davanti agli Abominable Attacks vuol dire attaccare come sempre */
    if (k === "abominio") return sceltaAbominio(S, S.pending.list.find(x => x.scelta === "normali"));
    /* «passo» davanti a una sfida vuol dire raccoglierla: rifiutarla e'
       una scelta che costa un personaggio, e non la si fa per distrazione */
    if (k === "raccogli"){
      const x = S.pending.list.find(y => y.id === "accetta");
      return x ? GESTI.accetta(S, x) : GESTI.rifiuta(S);
    }
    return si(passo(S));
  },

  primo:   (S, a) => sceltaPrimo(S, a),
  dominio: (S, a) => sceltaDominio(S, a),
  vaga:    (S, a) => vaga(S, a),
  abominio:(S, a) => sceltaAbominio(S, a),
  tieni:   (S, a) => tieniIncantesimi(S, a),
  scambia: (S, a) => scambiaIncantesimo(S, a),
  lancia:  (S, a) => lancia(S, a),
  dissolvi:(S, a) => dissolvi(S, a),
  lascia:  (S) => lascia(S),

  schiera: (S, a) => {
    const u = byUid(S, a.uid);
    if (!u || u.placed) return no("quest'unità non è da schierare");
    /* un fronte diverso da quello della lista, quando con quello non
       c'era posto (`postiAltroFronte`) */
    let fronte = "";
    if (a.fronte != null){
      const lay = layoutOf(u, S.units), f = Math.round(+a.fronte);
      if (!cambiaFronte(u) || !(f >= 1 && f <= lay.slots.length))
        return no("quel fronte quest'unità non lo può avere");
      if (f !== lay.front){ fronte = `, con ${f} modelli di fronte invece di ${lay.front}`; u.frontage = f; }
    }
    u.x = a.x; u.y = a.y; u.rot = a.rot != null ? a.rot : u.rot; u.placed = true;
    say(S, `${u.name} si schiera ${a.dove || ""}`.trim() + fronte + ".", { army: u.army, page: 115 });
    /* i personaggi entrano con il reggimento a cui sono uniti */
    for (const c of S.units.filter(x => FM.joinedHost(x) === u.uid)){
      c.x = u.x; c.y = u.y; c.rot = u.rot; c.placed = true;
    }
    alterna(S);
    return si(`${u.name} schierata`);
  },

  /* Unirsi allo schieramento: il capo si mette con il reggimento, ed e'
     la sua mossa di schieramento (p. 207). */
  unisci: (S, a) => {
    const c = byUid(S, a.uid), h = byUid(S, a.host);
    if (!S.schierando || !c || c.placed) return no("si unisce allo schieramento solo chi è ancora da schierare");
    if (!opzioniUnione(S, c).some(x => x.host === a.host)) return no(`${c ? c.name : "?"} non può unirsi a quell'unità`);
    c.join = { host: h.uid };
    c.placed = true;
    posa(S, h, h.x, h.y, h.rot);
    limite(S, "genere");
    say(S, `${c.name} si schiera dentro ${h.name} (p. 207).`, { army: c.army, page: 207 });
    alterna(S);
    return si(`${c.name} unito a ${h.name}`);
  },
  /* Unirsi nelle mosse restanti: il capo raggiunge il reggimento, che da
     li' non si muove piu' in questo turno (p. 207). */
  unisciti: (S, a) => {
    const c = byUid(S, a.uid), h = byUid(S, a.host);
    if (!c || !h || c.moved) return no("questo personaggio non può muoversi adesso");
    const { move } = movimento(S, c);
    if (!opzioniUnione(S, c, { pollici: move }).some(x => x.host === a.host))
      return no(`${c.name} non raggiunge ${h ? h.name : "quell'unità"}`);
    const d = distanza(S, c, h);
    c.join = { host: h.uid };
    c.moved = { kind: "move", inches: d };
    h.unito = chiave(S);
    posa(S, h, h.x, h.y, h.rot);
    limite(S, "genere");
    say(S, `${c.name} percorre ${d}″ e si unisce a ${h.name}` +
           (h.moved ? "" : `, che da qui non si muove più in questo turno`) + " (p. 207).",
        { army: c.army, page: 207 });
    return si(`${c.name} unito a ${h.name}`);
  },
  separa: (S, a) => {
    const c = byUid(S, a.uid);
    const h = c && byUid(S, FM.joinedHost(c));
    if (!c || !h || c.moved) return no("non è unito a nessuno, o si è già mosso");
    if (h.moved || h.unito === chiave(S)) return no("si esce da un reggimento prima che si muova (p. 207)");
    const box = postoFuori(S, c, h);
    if (!box) return no("accanto al reggimento non c'è posto");
    c.join = null;
    c.x = box.x; c.y = box.y; c.rot = box.rot;
    c.moved = { kind: "move", inches: r1(inch(Math.hypot(box.x - h.x, box.y - h.y))) };
    say(S, `${c.name} esce da ${h.name} e resta da solo (p. 207).`, { army: c.army, page: 207 });
    limite(S, "solitari");
    return si(`${c.name} da solo`);
  },

  raduna: (S, a) => {
    const u = byUid(S, a.uid);
    if (!u || !u.fled) return no("non sta fuggendo");
    if (u.radunoTentato === chiave(S)) return no("il test di raduno si tira una volta per turno");
    u.radunoTentato = chiave(S);
    const dadi = roll(2);
    const res = PS.rallyTest({ ld: ldOf(S, u), dice: dadi, models: alive(u), start: u.models || 0,
                               musician: !!(u.command && u.command.musician) });
    if (res.passed){ u.fled = false; u.moved = { kind:"rally", inches: 0 }; }
    say(S, `${u.name}, raduno: ${res.text}. ${res.then}`, { dice: dadi, army: u.army, page: res.page,
        /* sotto un quarto dei modelli il Comando non conta: «serve ≤ 5»
           accanto a un 5 uscito direbbe che doveva radunarsi */
        x: { k: "raduno", u: u.name, uid: u.uid, tot: res.total,
             vs: res.hopeless ? null : { v: res.target, op: "<=", t: "Comando" },
             f: [...fontiComando(S, u), ...(res.why || []).map(t => ({ t, f: "stato" })),
                 ...(res.insane ? [{ t: "doppio uno: si raduna sempre", f: "dadi" }] : [])],
             e: res.passed ? "si raduna" : "continua a fuggire", ok: res.passed } });
    return si(res.text);
  },

  /* La carica: si dichiara, chi la subisce reagisce, e solo dopo si
     tira. I tre passi sono tre momenti diversi del manuale e restano
     tre gesti, perche' fra il primo e il terzo c'e' una decisione che
     non e' di chi carica. */
  carica: (S, a) => {
    const u = byUid(S, a.uid), t = byUid(S, a.target);
    if (!u || !t || !onBoard(u) || !onBoard(t)) return no("unità non in campo");
    if (bandiera(u, "noCharge")) return no("un incantesimo le impedisce di caricare");
    if (stupida(S, u)) return no("è in preda alla Stupidità: non carica");
    if (u.moved || u.charged) return no("si è già mossa in questo turno");
    const { move } = movimento(S, u);
    const tc = terrenoDiCarica(S, u, t);
    const d = CH.declareCharge({
      charger: { name: u.name, box: boxOf(u, S.units), move, swift: MV.swiftOf(u), loose: !!u.loose },
      target:  { name: t.name, box: boxOf(t, S.units) },
      pieces: S.terrain, worst: tc.eff.worstDie,
    });
    if (!d || !d.can) return no(`carica impossibile: ${d ? d.why : "?"}`);
    /* la Paura si tira prima di dichiarare (p. 168) */
    const paura = pauraDi(S, u, t, "charge");
    if (paura.already && !paura.passed) return no("ha già fallito la Paura in questo turno");
    if (paura.must){
      const pu = PS.psychOf(u, { joined: capiInFila(S, u) });
      const res = testPsico(S, u, "fear", pu, paura.why, 168);
      if (!res.auto) u.paura = { key: chiave(S), passed: res.passed };
      if (!res.passed){
        u.moved = { kind: "failedCharge", inches: 0 };
        say(S, `${u.name} non carica ${t.name}: resta ferma, ed è una carica fallita (p. 168).`,
            { army: u.army, page: 168 });
        return si("la Paura la ferma");
      }
    }
    say(S, `${u.name} dichiara la carica su ${t.name}: ${d.why}.`, { army: u.army, page: 119 });
    /* la reazione tocca a chi la subisce, e viene prima del tiro */
    /* Chi non puo' fuggire lo dice `psych.js`. Prima gli si passava un
       `canFlee` che `reactions` non legge, e un reggimento Immune to
       Psychology sceglieva la fuga come chiunque. */
    const pt = PS.psychOf(t, { joined: capiDi(S, t) });
    const puo = PS.canFleeReaction(pt);
    /* «Cumbersome» e «Quick Shot» stanno sul profilo dell'arma e non
       sull'unita', e nessuno le leggeva: il Warp Lightning Cannon
       teneva e sparava in faccia ai Black Orc, che il libro non gli
       lascia fare (p. 167). */
    const armaT = CB.rangedWeapons(t)[0];
    const ft = SH.weaponFlagsOf(armaT);
    const r = CH.reactions({ dist: d.dist, chargerMove: move, shots: quantiTirano(S, t),
                             noFlee: puo.can ? "" : puo.why, mustHold: puo.hold ? puo.why : "",
                             fleeing: !!t.fled, engaged: ingaggiata(S, t),
                             noShoot: ft.cumbersome && !ft.quickShot
                               ? "l'arma è ingombrante: non si alza in faccia a chi carica (p. 167)" : "",
                             anyRange: !!ft.quickShot });
    const scelte = (Array.isArray(r) ? r : (r.list || [])).filter(x => x && x.can !== false);
    S.pending = {
      kind:"reazione", charger: u.uid, target: t.uid, dich: d,
      /* `charge.js` chiama «tira e tiene» `shoot`, l'arbitro e l'agente
         `stand`: senza tradurre, chi sceglieva di sparare si ritrovava a
         tenere la posizione e basta */
      list: scelte.map(x => ({ id:"reazione", kind: x.id === "shoot" ? "stand" : x.id, uid: t.uid, nome: t.name,
                               why: x.why || x.label || x.id, page: 120 })),
    };
    /* chi sta gia' fuggendo non sceglie niente: prima gli si offriva
       «tiene la posizione», e il registro diceva che teneva un'unita'
       in piena fuga */
    if (t.fled)
      S.pending.list = [{ id:"reazione", kind:"fleeing", uid: t.uid, nome: t.name,
                          why:"sta già fuggendo", page:120 }];
    if (!S.pending.list.length)
      S.pending.list = [{ id:"reazione", kind:"hold", uid: t.uid, nome: t.name,
                          why:"tiene la posizione", page:120 }];
    /* il Terrore: il bersaglio tira subito, e se fallisce deve fuggire
       (p. 179). Chi non puo' fuggire non tira nemmeno. */
    const pu = PS.psychOf(u, { joined: capiInFila(S, u) });
    const terrore = PS.terrorCheck({ charger: pu, target: pt, chargerName: u.name,
                                     canFlee: puo.can && !t.fled && !ingaggiata(S, t) });
    if (terrore.must){
      const res = testPsico(S, t, "terror", pt, terrore.why, 179);
      if (!res.passed)
        S.pending.list = [{ id:"reazione", kind:"flee", uid: t.uid, nome: t.name,
                            why:"ha fallito il Terrore: deve fuggire (p. 179)", page:179 }];
    }
    return si(`carica dichiarata su ${t.name}`);
  },

  reazione: (S, a) => {
    const p = S.pending;
    if (!p || p.kind !== "reazione") return no("nessuna carica da subire");
    const u = byUid(S, p.charger), t = byUid(S, p.target);
    S.pending = null;
    if (a.kind === "flee"){
      const { dadi, via, testo } = tiroDiFuga(t);
      say(S, `${t.name} reagisce fuggendo: ${testo} = ${via}″ lontano da ${u.name}.`,
          { dice: dadi, army: t.army, page: 120,
            x: xFuga(t, dadi, via, { da: u, perche: `reazione alla carica di ${u.name} (p. 120)` }) });
      fuggi(S, t, u, via);
      /* La carica non finisce qui: chi caricava tira lo stesso, e o
         raggiunge chi fugge o fa la carica fallita (p. 121). Prima si
         tornava subito, e chi aveva dichiarato restava libero di
         marciare altrove o di dichiarare di nuovo sullo stesso bersaglio. */
      if (u.dead || !onBoard(u)) return si("fuga davanti alla carica");
      return si(muoviCarica(S, u, t, p.dich));
    }
    if (a.kind === "fleeing"){
      say(S, `${t.name} sta già fuggendo: non reagisce, e la carica la insegue.`, { army: t.army, page: 120 });
      return si(muoviCarica(S, u, t, p.dich));
    }
    if (a.kind === "stand"){
      const armi = CB.rangedWeapons(t);
      if (armi.length){
        say(S, `${t.name} tiene e spara (p. 120).`, { army: t.army, page: 120 });
        tiro(S, t, u, armi[0], { standAndShoot: true });
      } else say(S, `${t.name} non ha armi da tiro: tiene la posizione.`, { army: t.army, page: 120 });
    } else {
      say(S, `${t.name} tiene la posizione.`, { army: t.army, page: 120 });
    }
    if (u.dead || !onBoard(u)) return si("chi caricava non c'è più");
    return si(muoviCarica(S, u, t, p.dich));
  },

  avanza: (S, a) => mossa(S, a, false),
  accosta: (S, a) => a.fino == null ? no("accosta vuole di quanto: il campo «fino»") : mossa(S, a, false),
  marcia: (S, a) => mossa(S, a, true),
  /* aggirare e' avanzare, solo verso un varco invece che verso un
     nemico: e' `a.punto` a dirlo, e se il varco si raggiunge marciando
     e' una marcia con tutto quello che comporta (p. 123). Chi e' troppo
     attaccato al muro per girarsi ci scivola accanto, ed e' il passo di
     lato di p. 125 — la stessa manovra, con il perche' scritto meglio. */
  aggira: (S, a) => a.lato ? manovra(S, { ...a, id:"lato" }) : mossa(S, a, !!a.marcia),
  gira:     (S, a) => manovra(S, a),
  riforma:  (S, a) => manovra(S, a),
  indietro: (S, a) => manovra(S, a),
  lato:     (S, a) => manovra(S, a),
  riordina: (S, a) => manovra(S, a),
  /* Stare fermi non e' muoversi: prima «resta ferma» scriveva una mossa
     sull'unita', e il tiro la contava come mossa. Il modello sceglieva
     di stare fermo per tirare meglio e tirava peggio, per quattro turni. */
  ferma:  (S, a) => {
    const u = byUid(S, a.uid);
    if (!u) return no("unità sconosciuta");
    u.moved = { kind:"still", inches: 0 };
    say(S, `${u.name} resta ferma.`, { army: u.army, page: 122 });
    return si("ferma");
  },

  tira: (S, a) => {
    const u = byUid(S, a.uid), t = byUid(S, a.target);
    if (!u || !t) return no("unità sconosciuta");
    if (u.shot) return no("ha già tirato in questo turno");
    if (u.nonTira && S.turno <= u.nonTira) return no(`è guasta: non tira fino alla fine del round ${u.nonTira}`);
    if (stupida(S, u)) return no("è in preda alla Stupidità: non tira");
    const armi = CB.rangedWeapons(u);
    if (!armi.length) return no("non ha armi da tiro");
    if (SH.bombardOf(armi[0])) return no("spara a bombardata: il gesto è «bombarda», non «tira» (p. 224)");
    if (SH.lineShotOf(armi[0])) return no("spara una linea: il gesto è «fulmina», non «tira» (Legends: Skaven, p. 19)");
    tiro(S, u, t, armi[0], {});
    u.shot = true;
    return si("tiro risolto");
  },

  /* il fulmine: una linea tirata per terra, e chi ci sta sotto */
  fulmina: (S, a) => {
    const u = byUid(S, a.uid), t = byUid(S, a.target);
    if (!u || !t) return no("unità sconosciuta");
    if (u.shot) return no("ha già tirato in questo turno");
    if (u.nonTira && S.turno <= u.nonTira) return no(`è guasta: non tira fino alla fine del round ${u.nonTira}`);
    if (stupida(S, u)) return no("è in preda alla Stupidità: non tira");
    const arma = CB.rangedWeapons(u)[0];
    const row = arma && SH.lineShotOf(arma);
    if (!row) return no("non spara una linea");
    fulmina(S, u, t, arma, row);
    u.shot = true;
    return si("fulmine risolto");
  },

  /* la bombardata: niente tiro per colpire, una sagoma che devia */
  bombarda: (S, a) => {
    const u = byUid(S, a.uid), t = byUid(S, a.target);
    if (!u || !t) return no("unità sconosciuta");
    if (u.shot) return no("ha già tirato in questo turno");
    if (u.nonTira && S.turno <= u.nonTira) return no(`è guasta: non tira fino alla fine del round ${u.nonTira}`);
    if (stupida(S, u)) return no("è in preda alla Stupidità: non tira");
    const arma = CB.rangedWeapons(u)[0];
    const row = arma && bombardaDi(u, arma);
    if (!row) return no("non spara a bombardata");
    if (!row.known) return no(row.why);
    bombarda(S, u, t, arma, row);
    u.shot = true;
    return si("bombardata risolta");
  },

  /* ---- le sfide (pp. 211-212) ---- */
  sfida: (S, a) => {
    const p = S.pending;
    if (!p || p.kind !== "sfida") return no("non c'è nessuna sfida da lanciare adesso");
    const c = byUid(S, a.uid);
    if (!c || !p.list.some(x => x.id === "sfida" && x.uid === a.uid))
      return no("quel modello non può lanciare la sfida");
    const uids = p.uids;
    S.pending = null;
    say(S, `${c.name} lancia una sfida (p. 211).`, { army: c.army, page: SFIDA });
    return si(chiediRaccolta(S, uids, c));
  },

  accetta: (S, a) => {
    const p = S.pending;
    if (!p || p.kind !== "raccogli") return no("non c'è nessuna sfida da raccogliere");
    const c = byUid(S, a.uid), sf = byUid(S, p.sfidante);
    if (!c || !sf || !p.list.some(x => x.id === "accetta" && x.uid === a.uid))
      return no("quel modello non può raccogliere la sfida");
    const uids = p.uids;
    S.pending = null;
    S.sfide = S.sfide || [];
    S.sfide.push({ a: sf.army === "A" ? sf.uid : c.uid, b: sf.army === "A" ? c.uid : sf.uid,
                   turno: S.turno });
    say(S, `${ML.challenge({ from: sf.name, to: c.name, accepted: true }).text}: da qui in poi i loro colpi vanno solo l'uno sull'altro, e nessun altro può dirigerli su di loro (p. 212).`,
        { army: sf.army, page: 212 });
    return si(dopoLaSfida(S, uids));
  },

  rifiuta: (S) => {
    const p = S.pending;
    if (!p || p.kind !== "raccogli") return no("non c'è nessuna sfida da rifiutare");
    if (!p.list.some(x => x.id === "rifiuta"))
      return no("questa sfida non si può rifiutare: non c'è dove scappare (p. 212)");
    const sf = byUid(S, p.sfidante), uids = p.uids;
    say(S, `${ML.challenge({ from: sf.name, to: "", accepted: false }).text} (p. 211).`,
        { army: sf.army, page: SFIDA });
    return si(chiediRitiro(S, uids, sf));
  },

  ritira: (S, a) => {
    const p = S.pending;
    if (!p || p.kind !== "ritira") return no("non c'è nessuno da ritirare");
    const c = byUid(S, a.uid), sf = byUid(S, p.sfidante);
    if (!c || !sf || !p.list.some(x => x.id === "ritira" && x.uid === a.uid))
      return no("quel modello non si può ritirare");
    const uids = p.uids;
    S.pending = null;
    const suo = unitaDi(S, sf);
    c.ritiro = { sfidante: sf.uid, ospite: suo ? suo.uid : sf.uid, turno: S.turno };
    limite(S, "ritirato");
    say(S, `${c.name} rifiuta la sfida e si ritira in fondo alle file: non mena, non lo colpisce nessuno, e al suo reggimento non dà più né Comando né regole finché ${sf.name} gli sta addosso (p. 211).`,
        { army: c.army, page: SFIDA });
    return si(dopoLaSfida(S, uids));
  },

  nessuna: (S) => {
    const p = S.pending;
    if (!p) return no("non c'è nessuna domanda in sospeso");
    const uids = p.uids;
    if (p.kind === "sfida"){
      const lato = p.lato;
      S.pending = null;
      if (lato === S.army){
        const q = chiediSfida(S, uids, altro(S.army));
        if (q) return si(q);
      }
      return si(dopoLaSfida(S, uids));
    }
    if (p.kind === "ritira"){
      S.pending = null;
      say(S, "nessuno si ritira: la sfida resta senza risposta (p. 211).", { page: SFIDA });
      return si(dopoLaSfida(S, uids));
    }
    return no("qui non si risponde così");
  },

  combatti: (S, a) => {
    const g = gruppiInMischia(S)[a.gruppo || 0];
    if (!g) return no("nessun combattimento");
    if (fatto(S, g)) return no("questo combattimento si è già risolto in questo turno");
    return si(avviaCombattimento(S, [...g.A, ...g.B].map(u => u.uid)));
  },
};

/* ---- il movimento vero ----
   `a.verso` e' un nemico da raggiungere; `a.punto` e' un posto sul
   tavolo, ed e' quello che usa l'aggiramento — il passo di lato che
   scavalca il monolite non ha un'unita' a cui mirare, ha un varco.
   Da qui in giu' la meta' e' una cosa sola con `x`, `y` e un nome, e
   tutto il resto della funzione non sa quale delle due sia. */
function mossa(S, a, marcia){
  const u = byUid(S, a.uid);
  const t = a.punto ? { x: a.punto[0], y: a.punto[1], name: a.dove || "di lato" }
                    : byUid(S, a.verso);
  if (!u || !t) return no("unità sconosciuta");
  if (u.moved) return no("si è già mossa");
  if (u.unito === chiave(S)) return no("un personaggio le si è unito: non si muove più in questo turno (p. 207)");
  if (stupida(S, u)) return no("è in preda alla Stupidità: non si muove");
  const { move: pieno } = movimento(S, u);
  if (!pieno) return no("non sa di quanto si muove: il profilo non porta il Movimento");
  /* Il terreno difficile toglie UN POLLICE al Movimento, e vale sia a
     cominciarci dentro, sia ad attraversarlo, sia a finirci (p. 269).
     Si toglie qui, prima di raddoppiare per la marcia: il −1 e' su M,
     quindi una marcia nel bosco ne perde due, ed e' quello che dice il
     libro. Prima l'arbitro attraversava una palude alla stessa
     velocita' con cui attraversava un prato. */
  const move = vola(u) ? pieno : rallenta(S, u, [t.x, t.y], pieno);
  let quanti = move;
  if (marcia && bandiera(u, "noMarch")) return no("un incantesimo le impedisce di marciare");
  if (marcia){
    /* Marcia sotto gli occhi del nemico: test di Comando (p. 123). */
    const vicino = nemiciDi(S, u).some(e => distanza(S, u, e) <= CH.MARCH_WATCH);
    if (vicino){
      const dadi = roll(2);
      const ld = ldOf(S, u) + (u.command && u.command.musician ? 1 : 0);
      const tot = dadi.reduce((s, v) => s + v, 0);
      const passa = tot <= ld || (dadi[0] === 1 && dadi[1] === 1);
      say(S, `${u.name} vuole marciare a ${CH.MARCH_WATCH}″ dal nemico: Comando ${ld}, ` +
             `${dadi.join(" + ")} = ${tot} → ${passa ? "marcia" : "niente marcia"}.`,
          { dice: dadi, army: u.army, page: 123,
            x: { k: "marcia", u: u.name, uid: u.uid, tot, vs: { v: ld, op: "<=", t: "Comando" },
                 f: [{ t: `un nemico entro ${CH.MARCH_WATCH}″: per marciare serve un test di Comando (p. 123)`, f: "distanza" },
                     ...fontiComando(S, u),
                     ...(u.command && u.command.musician ? [{ t: "il musico: +1 al Comando", f: "regola" }] : [])],
                 e: passa ? `marcia: ${move * 2}″` : `niente marcia: solo ${move}″`, ok: passa } });
      quanti = passa ? move * 2 : move;
    } else quanti = move * 2;
  }
  /* Il pollice dal nemico (p. 118), le unita' in mezzo e il bordo li
     guarda il percorso: prima si fermava a «distanza meno uno» misurata
     da bordo a bordo, e intanto il centro andava dritto dentro chi
     stava in mezzo. */
  /* La ruota si paga (p. 124): prima si girava gratis verso il nemico,
     e un reggimento largo cinque basette si voltava di 45° e faceva
     ancora tutto il suo Movimento. Anche chi fallisce il test di marcia
     ha marciato, e non ha il giro libero dei Lumbering. */
  /* «accosta»: ci si ferma prima, dove si e' deciso (p. 122: il
     Movimento e' un massimo, non un obbligo) */
  if (a.fino != null && a.fino >= 0) quanti = Math.min(quanti, a.fino);
  const partenza = postiDi(S, u);
  const pr = pianoRuota(S, u, versoDi(t.x - u.x, t.y - u.y), quanti, { marcia });
  const p = avanzaRuotando(S, u, t, pr, quanti);
  /* anche con il test fallito e' una marcia: «it is considered to have
     marched, even if its controlling player then elects to not move the
     unit at all» (p. 123). Quindi non tira. Sembrava un errore, e lo
     era solo per chi non aveva il libro aperto. */
  u.moved = { kind: marcia ? "march" : "move", inches: p.pollici };
  const verbo = marcia ? "marcia" : "avanza";
  const g = Math.round(Math.abs(p.giro));
  const ruota = !g ? ""
    : pr.sciolta ? `si gira di ${g}° senza costo (formazione sciolta) e `
    : pr.costo ? `ruota di ${g}° (${pr.libero ? `${Math.round(pr.libero)} liberi, Lumbering p. 195, e ` : ""}${r1(pr.costo)}″) e `
    : `si gira di ${g}° senza costo (Lumbering, p. 195) e `;
  say(S, `${u.name} ${ruota}` +
         (p.bloccata ? `non ha posto per girarsi: ` : "") +
         (pr.parziale && !p.pollici ? `non ${verbo}: girarsi del tutto costerebbe ${r1(pr.intera)}″, verso ${t.name}`
                                    : `${verbo} di ${p.pollici}″ ${p.bloccata ? "dritta" : "verso " + t.name}`) +
         (p.stop && p.pollici < p.voluti - 0.05 ? `, e si ferma: c'è ${p.stop.perche}` : "") + ".",
      { army: u.army, page: pr.costo && g ? 124 : marcia ? 123 : 122 });
  if (!vola(u)) dopoIlMovimento(S, u, partenza);
  return si("mossa");
}

/* Chi gli sta gia' addosso — un posto che l'arbitro non dovrebbe piu'
   produrre — non gli impedisce di girarsi: e' la stessa indulgenza di
   `percorso`, che altrimenti lo inchioderebbe li' per sempre. */
const giaAddosso = (S, u) => {
  const mio = cornersOf(u, S.units);
  return S.units.filter(o => o !== u && onBoard(o) && !isJoined(o) && polysOverlap(mio, cornersOf(o, S.units)))
    .map(o => o.uid);
};

/* La ruota e poi la corsa. Girarsi non puo' far entrare il pezzo in un
   vicino: se succederebbe non si gira, e chi ha il nemico nella meta'
   davanti va dritto con tutto il movimento — come una fila che avanza
   accanto a un'altra. */
/* La ruota e la corsa CONTATE, senza toccare il tavolo. E' la stessa
   cosa che si faceva qui dentro, staccata dal `posa` e dalle righe di
   registro: serve a poterla chiedere PRIMA di offrire la mossa, e cosi'
   l'elenco smette di promettere otto pollici dove il monolite ne
   lascia zero (`stradaVera`). */
function pianoAvanzata(S, u, t, pr, quanti){
  const da = u.rot || 0;
  let rot = pr.rot, resta = pr.resta, bloccata = false;
  if (Math.abs(giroDi(da, rot)) > 0.5 &&
      ingombro(S, u, { ...boxOf(u, S.units), rot }, { unPollice: false, ignora: giaAddosso(S, u) })){
    rot = da; bloccata = true;
    resta = Math.abs(giroDi(da, versoDi(t.x - u.x, t.y - u.y))) <= 90 ? quanti : 0;
  }
  let p = { x: u.x, y: u.y, mm: 0, pollici: 0, stop: null };
  if (resta > 0.01){
    const a = rot * Math.PI / 180;
    const meta = bloccata ? [u.x + Math.sin(a) * resta * MM, u.y - Math.cos(a) * resta * MM] : [t.x, t.y];
    p = percorso(S, u, meta, resta, { rot, devia: !bloccata });
  }
  return { ...p, rot, bloccata, voluti: resta, giro: bloccata ? 0 : pr.giro };
}

function avanzaRuotando(S, u, t, pr, quanti){
  const p = pianoAvanzata(S, u, t, pr, quanti);
  if (!p.bloccata && Math.abs(pr.giro) >= 0.5 && !pr.sciolta) limite(S, "ruota");
  if (p.stop && p.pollici < p.voluti - 0.05) limite(S, "ingombro");
  posa(S, u, p.x, p.y, p.rot);
  return p;
}

/* Verso il nemico, girandosi a guardarlo: e' il passo della carica
   fallita, che va «wheeling as required» (p. 121), e dell'inseguimento,
   che gira sul centro (p. 156). Qui la rotazione non si paga. Girarsi
   non puo' far entrare il pezzo in un vicino: se succederebbe, si
   viaggia con la rotazione di prima. */
function muoviVerso(S, u, t, pollici, { ignora = [], unPollice = true } = {}){
  const dx = t.x - u.x, dy = t.y - u.y;
  let rot = versoDi(dx, dy);
  if (Math.abs(giroDi(u.rot, rot)) > 0.5 &&
      ingombro(S, u, { ...boxOf(u, S.units), rot }, { ignora, unPollice: false })) rot = u.rot || 0;
  const p = percorso(S, u, [t.x, t.y], pollici, { rot, ignora, unPollice });
  if (p.stop && p.pollici < pollici - 0.05) limite(S, "ingombro");
  posa(S, u, p.x, p.y, rot);
  return p;
}
/* il fronte guarda verso -y quando rot e' 0: e' la convenzione del tavolo */
const versoDi = (dx, dy) => (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;

/* Il posto a contatto. `alignTo` mette il caricante contro la faccia da
   cui arriva; se li' c'e' gia' qualcuno — un altro reggimento che
   combatte con lo stesso bersaglio — si scorre lungo la STESSA faccia
   finche' si trova spazio. Cambiare faccia vorrebbe dire cambiare
   l'arco da cui si e' dichiarata la carica, e quello non si sceglie
   dopo. Torna anche quanto costa in piu' lo scorrere, perche' il tiro
   di carica deve bastare per arrivare dove si arriva davvero. */
function postoAContatto(S, u, t){
  const bu = boxOf(u, S.units), bt = boxOf(t, S.units);
  const al = CH.alignTo(bu, bt);
  if (!al) return null;
  const libero = (x, y) => !ingombro(S, u, { ...bu, x, y, rot: al.rot },
                                     { ignora: [t.uid], unPollice: false, bordo: true });
  const lungo = Math.hypot(al.x - bu.x, al.y - bu.y);
  if (libero(al.x, al.y)) return { ...al, extra: 0 };
  /* la direzione della faccia: perpendicolare alla rotazione di chi
     carica, che guarda dentro la faccia */
  const a = al.rot * Math.PI / 180;
  const tx = Math.cos(a), ty = Math.sin(a);
  const lim = (Math.max(bt.w, bt.h) + bu.w) / 2;
  for (let s = MM / 4; s <= lim; s += MM / 4){
    for (const segno of [1, -1]){
      const x = al.x + tx * s * segno, y = al.y + ty * s * segno;
      if (!libero(x, y)) continue;
      /* ancora a contatto con il bersaglio? */
      const poly = boxCorners({ ...bu, x, y, rot: al.rot });
      if (polyDistance(poly, cornersOf(t, S.units)) > MM * 0.1) continue;
      const extra = Math.max(0, Math.hypot(x - bu.x, y - bu.y) - lungo);
      return { ...al, x, y, extra: inch(extra), scorso: r1(inch(s)) };
    }
  }
  return { ...al, pieno: true };
}

/* La scheda del tiro di carica (p. 121): il dado tenuto e quello
   scartato, il Movimento che si somma, e i pollici che servivano — con
   dentro quello che li ha cambiati, il terreno per primo. */
function xCarica(u, t, { dadi, spec, out, serve, posto, tc, scappato, e, ok }){
  const f = [{ t: spec.why, f: spec.worst ? "terreno" : spec.swift ? "regola" : "dadi" }];
  for (const w of (tc && tc.eff && tc.eff.why) || []) f.push({ t: w, f: "terreno" });
  if (out.penalty) f.push({ t: `terreno difficile: il Movimento perde ${out.penalty}″ (p. 128)`, f: "terreno" });
  if (posto && posto.extra) f.push({ t: `${r1(posto.extra)}″ in più per scorrere lungo la faccia: c'è già qualcuno`, f: "distanza" });
  if (scappato) f.push({ t: `${t.name} è fuggita: la distanza si misura adesso (p. 121)`, f: "stato" });
  return { k: "carica", u: `${u.name} → ${t.name}`, uid: u.uid, su: t.uid, tot: out.total,
           via: scartati(dadi, out.kept),
           piu: [{ t: "Movimento", v: out.move }], vs: { v: serve, op: ">=", t: "pollici" }, f, e, ok };
}
function muoviCarica(S, u, t, d){
  /* Il terreno della carica (p. 128): il dado si rovescia, e il
     Movimento con il pollice in meno sta gia' in `d.move`, perche'
     `declareCharge` lo ha contato quando ha detto che la carica si
     poteva dichiarare. Prima qui si tirava sempre tenendo il maggiore,
     anche attraversando una palude. */
  const tc = terrenoDiCarica(S, u, t);
  const partenza = postiDi(S, u);
  const spec = CH.chargeDice({ swift: MV.swiftOf(u), worst: !!d.worst });
  const dadi = roll(spec.n);
  /* il bersaglio puo' essere scappato: si misura adesso, non alla
     dichiarazione (p. 121) */
  const scappato = !!t.fled;
  if (scappato) limite(S, "ridirezione");
  const dist = scappato ? distanza(S, u, t) : d.dist;
  const posto = scappato ? null : postoAContatto(S, u, t);
  const serve = r1(dist + (posto && posto.extra ? posto.extra : 0));
  const out = CH.chargeOutcome({ dice: dadi, spec, move: d.move, dist: serve });
  /* chi e' fuggito fuori dal tavolo non si raggiunge piu' */
  const uscito = scappato && !!t.dead;
  const arriva = out.made && !uscito && !(posto && posto.pieno) && (scappato || posto);
  if (!arriva){
    /* la carica fallita muove comunque di quello che ha tirato (p. 121),
       e si ferma dove si fermerebbe chiunque */
    const p = muoviVerso(S, u, t, Math.min(out.reach, Math.max(0, dist)), { unPollice: true });
    u.moved = { kind:"failedCharge", inches: p.pollici };
    const perche = uscito ? `ma ${t.name} è già fuori dal tavolo`
      : posto && posto.pieno && out.made
      ? `arriverebbe, ma sulla faccia di ${t.name} non c'è posto`
      : `ne servivano ${serve}${posto && posto.extra ? ` (${r1(posto.extra)} per scorrere lungo la faccia)` : ""}`;
    say(S, `${u.name} carica ${t.name}: ${dadi.join(", ")} → ${out.reach}″, ${perche}. Non arriva, ` +
           `e avanza di ${p.pollici}″.`,
        { dice: dadi, army: u.army, page: 121,
          x: xCarica(u, t, { dadi, spec, out, serve, posto, tc, scappato, ok: false,
                             e: `non arriva (${perche}): carica fallita, avanza di ${p.pollici}″` }) });
    return "carica fallita";
  }
  if (scappato){
    /* Chi e' fuggito davanti alla carica e viene raggiunto lo stesso e'
       travolto: e' la stessa regola dell'inseguimento (p. 156), e il
       caricante finisce dove quello stava. */
    const p = muoviVerso(S, u, t, out.reach, { ignora: [t.uid], unPollice: false });
    const usT = usConCapi(S, t);
    t.dead = true; t.placed = false;
    posa(S, t, t.x, t.y);
    u.moved = { kind:"charge", inches: p.pollici };
    say(S, `${u.name} carica ${t.name} che fugge: ${dadi.join(", ")} → ${out.reach}″ contro ${serve} richiesti. ` +
           `La raggiunge, e ${t.name} è travolta e distrutta.`,
        { dice: dadi, army: u.army, page: 121,
          x: xCarica(u, t, { dadi, spec, out, serve, posto, tc, scappato, ok: true,
                             e: `la raggiunge: ${t.name} travolta e distrutta` }) });
    ondaPanico(S, t, "destroyed", usT);
    return "carica su chi fugge";
  }
  /* E adesso a contatto davvero. Muovere «verso» il bersaglio e
     fermarsi a un decimo di pollice non e' una carica: le basette non
     si toccano, e chi guarda i contatti non vede nessun combattimento. */
  posa(S, u, posto.x, posto.y, posto.rot);
  u.charged = { target: t.name, uid: t.uid, inches: d.dist, arc: posto.arc };
  u.moved = { kind:"charge", inches: serve };
  say(S, `${u.name} carica ${t.name} e arriva: ${dadi.join(", ")} → ${out.reach}″ contro ${serve} richiesti, ` +
         `e la prende di ${posto.arc}` +
         (posto.scorso ? ` (scorre di ${posto.scorso}″ lungo la faccia: c'era già qualcuno)` : "") + ".",
      { dice: dadi, army: u.army, page: 121,
        x: xCarica(u, t, { dadi, spec, out, serve, posto, tc, scappato, ok: true,
                           e: `arriva, e la prende di ${posto.arc}` }) });
  /* L'ostacolo difeso (p. 270): non lo si scavalca, e la carica e'
     disordinata — niente bonus di Iniziativa a fine assalto (p. 146).
     Chi vola ci passa sopra. */
  const dis = CH.disorderedCharge({ defended: tc.muro, fly: vola(u) });
  if (dis.disordered){
    u.disordered = true;
    say(S, `${u.name}: ${dis.text}`, { army: u.army, page: 270 });
  }
  /* e il terreno attraversato presenta il conto, come a ogni movimento */
  terrenoPericoloso(S, u, pezziFra(S, partenza, postiDi(S, u)));
  return "carica a segno";
}

/* ---- il Movimento che si tira (Random Movement, p. 176) ----
   «Whenever a model with this special rule moves (for any reason),
   roll the dice to determine how far it MUST move.» Non marcia, non
   dichiara cariche, puo' ruotare e basta. Se il movimento lo porta a
   contatto con un nemico «counts as having charged»: si allinea, si
   ferma, e chi e' caricato cosi' deve tenere la posizione — niente
   reazione. Prima l'arbitro tirava il 3D6 e poi lo trattava come un
   Movimento qualunque: l'Hell Pit Abomination marciava di 2×3D6,
   dichiarava cariche con 3D6 piu' il dado, e poteva restare ferma.

   Le opzioni: le cariche che il tiro basta a fare, poi la strada verso
   il nemico piu' vicino e quella dritta davanti. «Resta ferma» non
   c'e', e chi passa senza averla mossa la vede muoversi da sola. */
function opzioniVaga(S, u, n){
  const out = [], vicino = piuVicino(S, u, nemiciDi(S, u).filter(e => !e.fled));
  for (const t of nemiciDi(S, u)){
    if (t.fled || isJoined(t)) continue;
    const c = caricaVagando(S, u, t, n);
    if (c) out.push({ id:"vaga", uid: u.uid, verso: t.uid, carica: true, nome: u.name, contro: t.name,
      attesa: 1 / (1 + c.serve),
      why: `il Movimento tirato è ${n}″ e ${t.name} è a ${c.serve}″: ci arriva, e conta come carica ` +
           `(p. 176) — ${t.name} deve tenere la posizione, senza reagire`, page: 176 });
  }
  out.sort((a, b) => b.attesa - a.attesa);
  if (vicino && !out.some(x => x.verso === vicino.uid))
    out.push({ id:"vaga", uid: u.uid, verso: vicino.uid, nome: u.name, contro: vicino.name,
      why: `verso ${vicino.name}, a ${distanza(S, u, vicino)}″: il Movimento tirato è ${n}″, e non basta per arrivarci`, page: 176 });
  out.push({ id:"vaga", uid: u.uid, dritto: true, nome: u.name,
    why: `dritta davanti a sé per ${n}″: il Movimento tirato si fa tutto (p. 176)`, page: 176 });
  return out;
}
/* La carica del movimento tirato: stesso posto a contatto e stessa
   distanza della carica dichiarata, ma senza dado di carica — i
   pollici sono quelli del Movimento tirato. */
function caricaVagando(S, u, t, n){
  const posto = postoAContatto(S, u, t);
  if (!posto || posto.pieno) return null;
  const serve = r1(distanza(S, u, t) + (posto.extra || 0));
  return n + 0.01 >= serve ? { posto, serve } : null;
}
/* La scheda della mossa tirata: i dadi di questo turno, che stanno
   scritti sull'unita' da quando li ha tirati, e quello che l'ha fermata. */
function xVaga(u, n, { vs = null, f = [], e = "", ok } = {}){
  const rm = u.randomMove || {};
  const dadi = rm.dadi || [];
  const magia = n - (rm.n || n);
  return { k: "movimento", t: "Si muove di quanto ha tirato", u: u.name, uid: u.uid, d: dadi,
           tot: dadi.length ? rm.n : n, piu: magia ? [{ t: "incantesimi sul Movimento", v: magia }] : [],
           vs, f: [{ t: "Random Movement: il Movimento si tira, e si fa (p. 176)", f: "regola" }, ...f], e, ok };
}
function vaga(S, a){
  const u = byUid(S, a.uid);
  if (!u || !vagante(u)) return no("non ha il Movimento che si tira");
  if (u.moved) return no("si è già mossa");
  if (u.fled || ingaggiata(S, u)) return no("non si muove adesso");
  const { move: n } = movimento(S, u);
  if (!n) return no("non sa di quanto si muove");
  const partenza = postiDi(S, u);
  limite(S, "vagante");
  if (a.verso != null){
    const t = byUid(S, a.verso);
    if (!t || !onBoard(t)) return no("bersaglio sconosciuto");
    const c = a.carica ? caricaVagando(S, u, t, n) : null;
    if (a.carica && !c) return no(`${n}″ non bastano per arrivare a ${t.name}`);
    if (c){
      posa(S, u, c.posto.x, c.posto.y, c.posto.rot);
      u.charged = { target: t.name, uid: t.uid, inches: c.serve, arc: c.posto.arc, vagando: true };
      u.moved = { kind:"charge", inches: c.serve };
      say(S, `${u.name} si muove di ${n}″ e arriva addosso a ${t.name}, di ${c.posto.arc}: ` +
             `conta come carica, e ${t.name} tiene la posizione (p. 176).`, { army: u.army, page: 176,
          x: xVaga(u, n, { vs: { v: c.serve, op: ">=", t: `pollici fino a ${t.name}` },
                           f: [{ t: "Random Movement: toccare un nemico conta come carica, e lui non può reagire", f: "regola" }],
                           e: `carica ${t.name}, di ${c.posto.arc}`, ok: true }) });
      terrenoPericoloso(S, u, pezziFra(S, partenza, postiDi(S, u)));
      return si("carica vagando");
    }
    const pr = pianoRuota(S, u, versoDi(t.x - u.x, t.y - u.y), n);
    const p = avanzaRuotando(S, u, t, pr, n);
    u.moved = { kind:"move", inches: p.pollici };
    say(S, `${u.name} si muove di ${p.pollici}″ verso ${t.name} (Movimento tirato ${n}″` +
           (p.pollici < n - 0.05 ? `: ${pr.costo ? `ruotare costa ${r1(pr.costo)}″, e ` : ""}si ferma dove non passa` : "") +
           `, p. 176).`, { army: u.army, page: 176,
        x: xVaga(u, n, { f: [{ t: `verso ${t.name}, a ${distanza(S, u, t)}″ adesso`, f: "distanza" },
                             ...(pr.costo ? [{ t: `ruotare costa ${r1(pr.costo)}″ del Movimento`, f: "distanza" }] : []),
                             ...(p.pollici < n - 0.05 ? [{ t: "si ferma dove non passa: un pollice dal nemico, un'altra unità o il bordo", f: "stato" }] : [])],
                         e: `avanza di ${p.pollici}″` }) });
  } else {
    const r = (u.rot || 0) * Math.PI / 180;
    const meta = [u.x + Math.sin(r) * n * MM, u.y - Math.cos(r) * n * MM];
    const p = percorso(S, u, meta, n, { rot: u.rot || 0, devia: false });
    posa(S, u, p.x, p.y, u.rot || 0);
    u.moved = { kind:"move", inches: p.pollici };
    say(S, `${u.name} va dritta di ${p.pollici}″ (Movimento tirato ${n}″` +
           (p.pollici < n - 0.05 && p.stop ? `: si ferma, c'è ${p.stop.perche}` : "") + `, p. 176).`,
        { army: u.army, page: 176,
          x: xVaga(u, n, { f: p.pollici < n - 0.05 && p.stop ? [{ t: `si ferma prima: c'è ${p.stop.perche}`, f: "stato" }] : [],
                           e: `va dritta di ${p.pollici}″` }) });
  }
  if (!vola(u)) dopoIlMovimento(S, u, partenza);
  return si("mossa tirata");
}
/* chi passa le mosse senza aver mosso chi DEVE muoversi: si muove da
   solo, con la prima delle sue opzioni — la carica, se ce n'e' una */
function vaganoDaSoli(S){
  for (const u of inCampo(S, S.army)){
    if (!vagante(u) || u.moved || u.fled || u.charged || ingaggiata(S, u) || isJoined(u)) continue;
    const { move } = movimento(S, u);
    if (!move) continue;
    const o = opzioniVaga(S, u, move)[0];
    if (o) vaga(S, o);
  }
}

/* La fuga: via dal nemico, girati a guardare dove si va. Chi fugge
   passa attraverso le unita' (p. 133 — il test di Pericolo e' fra i
   limiti), ma non si ferma dentro nessuno: se il punto d'arrivo e'
   occupato va avanti finche' trova posto. Fuori dal tavolo — anche solo
   con un angolo — e' fuori dalla partita (p. 132). */
/* Il tiro di fuga (p. 132): 2D6, piu' il D6 del passo lungo — Swiftstride
   vale per la carica, la fuga e l'inseguimento (p. 178), non solo per
   le prime e l'ultima. Lo usano tutte le fughe: reazione, rotta, panico,
   e chi non si raduna e continua a scappare. */
function tiroDiFuga(u){
  const swift = MV.swiftOf(u);
  const dadi = roll(swift ? 3 : 2);
  const via = dadi.reduce((s, v) => s + v, 0) + CB.fleeBonusOf(u).mod;
  const testo = dadi.slice(0, 2).join(" + ") + (swift ? ` + ${dadi[2]} (Swiftstride, p. 178)` : "");
  return { dadi, via, testo };
}

function fuggi(S, u, da, pollici){
  const dx = u.x - da.x, dy = u.y - da.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const rot = versoDi(dx, dy);
  const box = boxOf(u, S.units);
  let mm = pollici * MM;
  const at = s => ({ ...box, x: u.x + ux * s, y: u.y + uy * s, rot });
  const attraversa = S.units.some(o => o !== u && onBoard(o) && !isJoined(o) &&
    polysOverlap(boxCorners({ ...box, x: u.x + ux * mm / 2, y: u.y + uy * mm / 2, rot }), cornersOf(o, S.units)));
  if (attraversa) limite(S, "attraversare");
  while (ingombro(S, u, at(mm), { unPollice: false, bordo: false }) && dentroTavolo(S, boxCorners(at(mm))))
    mm += PASSO;
  const b = at(mm);
  const passati = attraversati(S, u, at, mm);
  const usPrima = usConCapi(S, u);
  u.fled = true;
  u.charged = null;
  u.moved = { kind:"flee", inches: pollici };
  posa(S, u, b.x, b.y, rot);
  if (!dentroTavolo(S, boxCorners(b))){
    u.dead = true; u.placed = false; u.fledOff = true;
    posa(S, u, u.x, u.y, rot);
    say(S, `${u.name} esce dal tavolo e non torna (p. 132).`, { army: u.army, page: 132 });
  } else if (mm > pollici * MM + 0.5)
    say(S, `${u.name} non può fermarsi addosso a un'altra unità: fugge fino a ${r1(inch(mm))}″.`,
        { army: u.army, page: 133 });
  /* prima si muove chi fugge, poi il Panico di chi ha attraversato
     (p. 161); e uscire dal tavolo «counts as having been destroyed»
     (p. 132), cioe' manda al Panico gli amici dove e' uscito */
  for (const o of passati) testPanico(S, o, "fledThrough", { fonte: u });
  if (u.fledOff) ondaPanico(S, u, "destroyed", usPrima);
}

/* ---- il tiro ---- */
/* Ha mosso, per il tiro (p. 138): stare fermi no, radunarsi si' (p. 117). */
const haMosso = u => !!u.moved && u.moved.kind !== "still";
/* I modificatori del tiro, gli stessi del pannello (`SH.modsFor`): il
   bersaglio sciolto e il «tira e tiene» l'arbitro non li passava, e la
   reazione alla carica sparava senza il suo −1.

   Il riparo adesso e' quello del libro (p. 139): non «c'e' un bosco
   addosso al centro del bersaglio, quindi −1», ma quanti modelli del
   bersaglio sono coperti da dove si tira — fino a meta' e' riparo
   parziale, oltre la meta' e' pieno e vale −2. Prima l'arbitro non
   sapeva nemmeno dire −2, e un reggimento dietro un monolite si
   prendeva lo stesso sconto di uno in mezzo all'erba alta. */
function modificatori(S, u, t, d, gittata, { standAndShoot = false } = {}){
  return SH.shootMods({ long: d > gittata / 2, moved: haMosso(u) && !standAndShoot,
                        cover: coperturaDi(S, t, u),
                        looseTarget: !!t.loose, standAndShoot });
}

/* Il limite delle sagome si dice solo quando conta: una macchina da
   guerra, o un'arma che nel nome o nelle regole porta la sagoma. Prima
   usciva al primo giavellotto. */
const RE_SAGOMA = /template|sagoma|cannon|cannone|stone ?thrower|lanciapietre|catapult|mortar|mortaio|lightning|fulmine|flame|fiamm|breath|soffio/i;
function sagomaOMacchina(u, arma){
  if (troopType(u.troop).id === "warMachine") return true;
  /* le regole dell'arma, nel file della lista, sono una stringa sola
     («Multiple Wounds (D3), Poisoned Attacks»): prima la si trattava da
     elenco, e il primo arco con una regola faceva cadere la partita */
  const regole = Array.isArray(arma.rules) ? arma.rules.join(", ") : String(arma.rules || "");
  return RE_SAGOMA.test(arma.name || "") || RE_SAGOMA.test(regole);
}
/* da dove viene ogni modificatore del tiro, per il pallino della scheda */
const FONTE_TIRO = { long: "distanza", moved: "stato", ponderous: "stato", standAndShoot: "stato",
                     soft: "terreno", hard: "terreno", looseTarget: "regola" };
function tiro(S, u, t, arma, { standAndShoot = false } = {}){
  const d = distanza(S, u, t);
  const gittata = stat(arma.range);
  if (d > gittata){ say(S, `${u.name} non arriva: ${d}″ con una gittata di ${gittata}″.`, { army: u.army }); return; }
  /* le armi che hanno una procedura loro non passano di qui: se ci
     arrivassero sparerebbero con i numeri letti male — gittata 8″ per
     un «8D6"», Forza dell'equipaggio per una «*» */
  if (SH.bombardOf(arma) || SH.lineShotOf(arma)){
    say(S, `${u.name} non spara ${arma.name} così: ha una procedura sua.`, { army: u.army, page: 222 });
    return;
  }
  if (sagomaOMacchina(u, arma)) limite(S, "sagome");
  const mods = modificatori(S, u, t, d, gittata, { standAndShoot });
  const r = CB.shootRoll(u, t, { weapon: arma, mods: mods.total, shots: quantiTirano(S, u) });
  /* la Forza d'Unita' com'era all'inizio di questa fase: il quarto del
     Panico si conta su quella, sommando tutti i tiri della fase */
  const fase = faseDi(S);
  inizioFase(S, t);
  const tutti = mucchi(r);
  say(S, `${u.name} tira su ${t.name} con ${arma.name} da ${d}″: ${r.shots} tiri a ${r.hitNeed}+, ` +
         `${r.hit.hits} ${r.hit.hits === 1 ? "colpo" : "colpi"}, ${r.wounds} ferit${r.wounds === 1 ? "a" : "e"}, ${r.kills} a terra` +
         (mods.list && mods.list.length ? ` [${mods.list.map(m => m.why).join(", ")}]` : "") + ".",
      { dice: tutti.flat, groups: tutti.groups, army: u.army, page: 136,
        x: { k: "tiro", u: `${u.name} → ${t.name}`, uid: u.uid, su: t.uid, t: `Tiro · ${arma.name}`,
             passi: passiDi(r),
             f: [{ t: `${d}″ con una gittata di ${gittata}″`, f: "distanza" },
                 ...(mods.list || []).map(m => ({ t: `${m.why}: ${m.v > 0 ? "+" : "−"}${Math.abs(m.v)} per colpire`,
                                                  f: FONTE_TIRO[m.id] || "regola" })),
                 ...(r.notes || []).filter(n => typeof n === "string").map(n => ({ t: n, f: "regola" }))],
             e: `${r.hit.hits} ${r.hit.hits === 1 ? "colpo" : "colpi"}, ${r.wounds} ferit${r.wounds === 1 ? "a" : "e"}, ${r.kills} a terra`,
             ok: r.kills > 0 ? true : undefined } });
  /* le perdite dopo la riga del tiro: prima il registro diceva «non
     resta nessuno in piedi» sopra il tiro che li aveva abbattuti */
  perdite(S, t, r.kills, r.left);
  if (r.kills > 0) panico(S, t, `il tiro di ${u.name}`, u);
}

/* ---- la bombardata (pp. 224-226) ----
   Un lanciapietre non tira per colpire. «This weapon does not use its
   crew's Ballistic Skill»: si sceglie un bersaglio, la sagoma si posa
   sul suo centro, devia di quello che dice il dado di artiglieria, e
   chi resta sotto e' colpito — sotto del tutto sempre, sotto in parte
   con un 4+ (p. 95). E' l'unica cosa del tiro che vuole sapere dove
   sta ogni singolo modello, ed e' per questo che e' arrivata ultima:
   `formation.js` le basette le sa da sempre, nessuno gliele chiedeva.

   Tre cose che al tavolo sono ovvie e nel codice no. La sagoma non
   guarda le bandiere: sotto ci finisce chi c'e', amico o nemico. Il
   personaggio unito a un reggimento, che a un arco non si puo'
   bersagliare (p. 209), sotto la sagoma ci sta come tutti gli altri —
   e infatti la sua basetta e' una casella come le altre. E il modello
   sotto il buco centrale prende il colpo forte, quello scritto fra
   parentesi sul profilo. */

/* Ogni basetta sul tavolo, con addosso di chi e'. I personaggi uniti
   non hanno una casella loro: stanno nella fila del reggimento che li
   ospita, e `layout` gliene da' una marcata `char` con il loro uid —
   per questo la truppa e il capo si distinguono qui e non prima. */
function caselleDelTavolo(S){
  const out = [];
  for (const u of S.units){
    if (!onBoard(u) || isJoined(u)) continue;
    for (const c of FM.worldCells(u, layoutOf(u, S.units)))
      out.push({ ...c, u, cell: out.length });
  }
  return out;
}
/* di chi e' questa basetta: del capo che ci sta sopra, o del reggimento */
const padroneDi = (S, c) => (c.kind === "char" && byUid(S, c.uid)) || c.u;

/* Il Mancato Colpo (p. 226): non e' un tiro fallito, e' un rinvio a
   una tabella. Le due tabelle stanno in `shoot.js`, lette a p. 347; qui
   c'e' quello che succede sul tavolo. */
function mancatoColpo(S, u, kind){
  const dado = roll(1)[0];
  const read = SH.misfireRead(kind, dado);
  say(S, `${u.name}: ${read.text}`, { dice: [dado], army: u.army, page: read.page });
  u.shot = true;
  if (dado === 1){ perdite(S, u, alive(u)); return; }
  if (dado <= 4){
    /* «The crew immediately loses one Wound»: una ferita sola, con il
       resto che resta appeso come tutte le altre. E poi non tira piu'
       fino alla fine del round successivo, che e' due turni di questa
       parte, non due caselle. */
    const t = CB.woundsToll(u, 1, { carried: u.wounds || 0 });
    inizioFase(S, u);
    perdite(S, u, t.kills, t.left);
    if (!u.dead){
      u.nonTira = S.turno + 1;
      say(S, `${u.name} non tira fino alla fine del round ${u.nonTira}.`, { army: u.army, page: 226 });
    }
  }
}

/* Chi spara a bombardata non tira per colpire: quello che gli serve e'
   l'arma, la sagoma che il libro le da', e la fascia di gittata. Torna
   `null` quando l'arma non e' a bombardata. */
function bombardaDi(u, arma){
  const row = SH.bombardOf(arma);
  if (!row) return null;
  return { ...row, banda: SH.rangeBand(arma) };
}

/* Quanto ci si aspetta da una bombardata, per chi deve sceglierla: i
   modelli che la sagoma coprirebbe se non deviasse, e le perdite che
   ne verrebbero. La deviazione non entra nel conto — è il dado, e un
   dado non si prevede — e l'opzione lo dice: «se non devia». */
function previsioneBombarda(S, u, t, arma, row){
  const shape = SH.placeTemplate(row.template, [t.x, t.y], 0);
  const mie = FM.worldCells(t, layoutOf(t, S.units)).map((c, i) => ({ ...c, cell: i }));
  const conto = SH.templateHits(SH.modelsUnder(mie, shape));
  const sotto = conto.full + conto.partial * chanceOf(SH.PARTIAL_NEED);
  const forza = SH.bracket(arma.S), pen = SH.bracket(arma.ap);
  const b = CB.combatant(t);
  const passa = (colpi, S0, AP0) => colpi * chanceOf(woundOn(S0, b.t)) *
    (1 - chanceOf(saveOn(b.armour, Math.abs(AP0)))) *
    (1 - chanceOf(saveOn(b.ward, 0))) * (1 - chanceOf(saveOn(b.regen, 0)));
  const buco = conto.hole != null ? 1 : 0;
  const ferite = passa(Math.max(0, sotto - buco), forza.base, pen.base) +
                 passa(buco, forza.hole, pen.hole);
  return { sotto: Math.round(sotto), kills: ferite / (b.w || 1) };
}

function bombarda(S, u, t, arma, row){
  const banda = row.banda;
  const d = distanza(S, u, t);
  if (d > banda.max || d < banda.min){
    say(S, `${u.name} non arriva: ${d}″ con una gittata di ${banda.min}-${banda.max}″.`, { army: u.army });
    return;
  }
  limite(S, "indiretto");
  /* «The Multiple Wounds special rule applies only to a single model
     whose base lies underneath the central hole» (pp. 224, 228): la
     regola sta sull'arma, e vale per il buco e basta */
  const regole = Array.isArray(arma.rules) ? arma.rules.join(", ") : String(arma.rules || "");
  const multi = readRules([], splitWeaponRules(regole)).flags.multipleWounds;

  /* 1. il punto: il centro del bersaglio (p. 224) */
  const aim = [t.x, t.y];
  /* 2. la deviazione: dado di artiglieria per i pollici, dado di
        deviazione per la direzione, e il Mancato Colpo sta sul primo */
  const dev = deviazione({ distance: "artillery" });
  if (dev.misfire) return mancatoColpo(S, u, row.misfire);
  const out = SH.bombard({ aim, template: row.template, deg: dev.deg, inches: dev.inches, hit: dev.hit });

  /* 3. chi resta sotto, basetta per basetta */
  const celle = caselleDelTavolo(S);
  const sotto = SH.modelsUnder(celle, out.shape);
  const conto = SH.templateHits(sotto);
  const dadi = conto.asks ? roll(conto.asks) : null;
  /* sempre con i dadi, anche zero: senza, `templateHits` fa il conto e
     non dice QUALI basette, e una sagoma con sotto solo modelli coperti
     del tutto — nessuno in parte, nessun dado — non colpiva nessuno */
  const colpi = SH.templateHits(sotto, dadi || []);

  const mucchi = new Map();
  for (const i of colpi.cells || []){
    const c = celle[i];
    const chi = padroneDi(S, c);
    if (!chi || chi.dead) continue;
    const g = mucchi.get(chi.uid) || { u: chi, n: 0, buco: false };
    g.n++;
    if (i === colpi.hole) g.buco = true;
    mucchi.set(chi.uid, g);
  }
  const detta = [...mucchi.values()].map(g => `${g.u.name}: ${g.n}`).join(", ");
  say(S, `${u.name} bombarda ${t.name} con ${arma.name} da ${d}″. ${out.text} ` +
         `Sotto la sagoma: ${colpi.full} del tutto, ${colpi.partial} in parte` +
         (detta ? ` — colpiti ${detta}.` : " — nessuno."),
      { dice: [...(dev.die ? [dev.die.raw] : []), ...(dadi || [])],
        army: u.army, page: row.page });

  /* 4. e i colpi si tirano come tutti gli altri: per ferire, e poi le
        salvezze. La Forza e la perforazione sono quelle del profilo,
        salvo il modello sotto il buco, che prende quelle fra parentesi. */
  const forza = SH.bracket(arma.S), pen = SH.bracket(arma.ap);
  const chiSpara = CB.combatant(u);
  for (const g of mucchi.values()){
    if (g.u.dead) continue;
    const bers = CB.combatant(g.u);
    const normali = g.n - (g.buco ? 1 : 0);
    const uno = normali ? CB.strike(chiSpara, bers, { attacks: normali, auto: true, multi: null,
                            strength: forza.base, ap: Math.abs(pen.base), label: "sagoma" }) : null;
    const forte = g.buco ? CB.strike(chiSpara, bers, { attacks: 1, auto: true, multi,
                            strength: forza.hole, ap: Math.abs(pen.hole), label: "buco centrale" }) : null;
    const ferite = (uno ? uno.wounds : 0) + (forte ? forte.wounds : 0);
    /* la ferita del buco vale quanto il suo dado, quelle della sagoma
       una ciascuna: si mettono in fila e cadono modello per modello */
    const losses = forte && forte.losses ? [...Array(uno ? uno.wounds : 0).fill(1), ...forte.losses] : null;
    const toll = CB.woundsToll(g.u, ferite, { carried: g.u.wounds || 0, losses });
    inizioFase(S, g.u);
    if (g.buco && forza.has)
      say(S, `${g.u.name}: il modello sotto il buco centrale prende Forza ${forza.hole} con ${pen.hole} di penetrazione (p. 224).`,
          { army: g.u.army, page: 224 });
    if (forte && forte.losses)
      say(S, `${g.u.name}: la ferita sotto il buco centrale vale ${forte.losses.join(", ")} (Multiple Wounds, p. 175).`,
          { army: g.u.army, page: 175 });
    say(S, `${u.name} su ${g.u.name}: ${g.n} ${g.n === 1 ? "colpo" : "colpi"} di sagoma, ` +
           `${ferite} ferit${ferite === 1 ? "a" : "e"}, ${toll.kills} a terra.`,
        { army: u.army, page: row.page });
    perdite(S, g.u, toll.kills, toll.left);
    if (toll.kills > 0) panico(S, g.u, `la sagoma di ${u.name}`, u);
  }
}

/* ---- la linea del Warp Lightning Cannon (Legends: Skaven, p. 19) ----
   Non e' una sagoma e non e' un tiro: e' una riga tirata per terra.
   «Draw a straight line, 8D6" in length, from the model's base edge.
   Any model (friend or foe) whose base falls under this line suffers a
   hit, the Strength of which is determined by rolling an Artillery
   dice.» Tre dadi in fila — la lunghezza, la Forza, e semmai la
   tabella — e nessuno di loro e' un tiro per colpire.

   Questa macchina e' l'unica delle liste salvate, e fino a qui giocava
   con i numeri che l'export le dava letti male: gittata 8″ (era «8D6"»)
   e Forza 3, quella dell'equipaggio (era «*»). Non ha mai sparato in
   nessuna partita, perche' 8″ non li fa mai. */

/* il versore da un'unita' verso un'altra, e il punto in cui esce dalla
   sua basetta: il libro fa partire la linea dal BORDO, non dal centro */
function bordoVerso(S, u, dir){
  const b = boxOf(u, S.units);
  const r = boxRadius(b, Math.atan2(dir[1], dir[0]));
  return [u.x + dir[0] * r, u.y + dir[1] * r];
}
const versoreVerso = (u, t) => {
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
};

/* Chi sta sotto la linea, e i colpi che ne vengono. Le caselle della
   macchina stessa restano fuori: la linea parte dal suo bordo, e senza
   questa riga si sparerebbe addosso da sola. */
function colpiInLinea(S, u, da, a, forza, ap, comeMai){
  const celle = caselleDelTavolo(S).filter(c => c.u.uid !== u.uid);
  const sotto = SH.lineUnder(celle, da, a);
  const mucchi = new Map();
  for (const c of sotto.cells){
    const chi = padroneDi(S, c);
    if (!chi || chi.dead) continue;
    const g = mucchi.get(chi.uid) || { u: chi, n: 0 };
    g.n++;
    mucchi.set(chi.uid, g);
  }
  const detta = [...mucchi.values()].map(g => `${g.u.name}: ${g.n}`).join(", ");
  say(S, `${u.name} ${comeMai}: una linea di ${r1(inch(Math.hypot(a[0] - da[0], a[1] - da[1])))}″, ` +
         `Forza ${forza}. Sotto la linea: ${detta || "nessuno"}.`,
      { army: u.army, page: 19 });
  const chiSpara = CB.combatant(u);
  for (const g of mucchi.values()){
    if (g.u.dead) continue;
    const r = CB.strike(chiSpara, CB.combatant(g.u),
                        { attacks: g.n, auto: true, strength: forza, ap, label: "fulmine" });
    const toll = CB.woundsToll(g.u, r.wounds, { carried: g.u.wounds || 0 });
    inizioFase(S, g.u);
    say(S, `${u.name} su ${g.u.name}: ${g.n} ${g.n === 1 ? "colpo" : "colpi"} di Forza ${forza}, ` +
           `${r.wounds} ferit${r.wounds === 1 ? "a" : "e"}, ${toll.kills} a terra.`,
        { army: u.army, page: 19 });
    perdite(S, g.u, toll.kills, toll.left);
    if (toll.kills > 0) panico(S, g.u, `il fulmine di ${u.name}`, u);
  }
}

function fulmina(S, u, t, arma, row){
  limite(S, "fulmine");
  /* 1. la lunghezza si tira: sono 8D6, e sono dadi come tutti gli altri */
  const dadi = roll(row.banda.n || 1);
  const lung = dadi.reduce((x, y) => x + y, 0);
  const dir = versoreVerso(u, t);
  const da = bordoVerso(S, u, dir);
  const a = [da[0] + dir[0] * lung * MM, da[1] + dir[1] * lung * MM];
  say(S, `${u.name} punta ${t.name}: la linea è lunga ${lung}″ (${dadi.join(" + ")}).`,
      { dice: dadi, army: u.army, page: 19 });

  /* 2. la Forza e' un dado di artiglieria, e il Mancato Colpo sta li' */
  const art = rollDice({ kind: "artillery", n: 1 }).dice[0];
  const ap = Math.abs(stat(arma.ap));
  if (!art.misfire) return colpiInLinea(S, u, da, a, art.value, ap, `spara un fulmine su ${t.name}`);

  const dado = roll(1)[0];
  const read = SH.misfireRead(row.misfire, dado);
  say(S, `${u.name}: ${read.text}`, { dice: [art.raw, dado], army: u.army, page: read.page });
  u.shot = true;
  if (dado === 1){ perdite(S, u, alive(u)); return; }
  if (dado <= 4){
    /* Energy Overload: spara lo stesso, con Forza 6 e in una direzione
       a caso. Il libro non dice di ritirare la lunghezza, e l'arbitro
       tiene quella gia' uscita: e' il limite `fulmine`. */
    const dev = deviazione({ distance: "none" });
    const ang = dev.deg * Math.PI / 180;
    const d2 = [Math.cos(ang), Math.sin(ang)];
    const da2 = bordoVerso(S, u, d2);
    const a2 = [da2[0] + d2[0] * lung * MM, da2[1] + d2[1] * lung * MM];
    colpiInLinea(S, u, da2, a2, 6, ap, `gira su se stessa e scarica verso ${dev.compass} (${dev.deg}°)`);
  }
}

/* Quanto ci si aspetta da un fulmine: la lunghezza e la Forza sono
   due dadi, e quello che si puo' dire prima e' la media — 8D6 fanno
   28″, e il dado di artiglieria che non fa Mancato Colpo fa Forza 6. */
function previsioneFulmine(S, u, t, arma){
  const dir = versoreVerso(u, t);
  const da = bordoVerso(S, u, dir);
  const MEDIA = 28, FORZA = 6;
  const a = [da[0] + dir[0] * MEDIA * MM, da[1] + dir[1] * MEDIA * MM];
  const mie = FM.worldCells(t, layoutOf(t, S.units)).map((c, i) => ({ ...c, cell: i }));
  const n = SH.lineUnder(mie, da, a).cells.length;
  const b = CB.combatant(t);
  const ferite = n * chanceOf(woundOn(FORZA, b.t)) *
    (1 - chanceOf(saveOn(b.armour, Math.abs(stat(arma.ap))))) *
    (1 - chanceOf(saveOn(b.ward, 0))) * (1 - chanceOf(saveOn(b.regen, 0)));
  return { sotto: n, kills: (ferite / (b.w || 1)) * (5 / 6) };
}

/* Torna vero se l'unita' e' appena sparita. `zitto` e' per la mischia,
   che lo dice dopo il conto del combattimento e non in mezzo ai colpi. */
function perdite(S, u, kills, left = null, { zitto = false } = {}){
  let sparita = false;
  if (kills > 0){
    const prima = usConCapi(S, u);
    u.lost = Math.min(u.models, (u.lost || 0) + kills);
    if (alive(u) <= 0){
      /* i capi restano in piedi, da soli, dove stava il reggimento: ognuno
         al suo posto nella fila. Prima restavano tutti nel centro, uno
         sopra l'altro, e li separava solo il primo passo che facevano */
      affianca(u, capiDi(S, u), layoutOf(u, S.units));
      for (const c of capiDi(S, u)){
        c.join = null;
        say(S, `${c.name} resta da solo: il suo reggimento non c'è più.`, { army: c.army, page: 206 });
      }
      u.dead = true; u.placed = false; sparita = true;
      posa(S, u, u.x, u.y);
      if (!zitto) say(S, `${u.name}: non resta nessuno in piedi.`, { army: u.army });
      ondaPanico(S, u, "destroyed", prima);
    }
  }
  if (left != null) u.wounds = left;
  return sparita;
}

/* I capi di un reggimento caduto, ognuno al suo posto nella fila e
   accostati con le loro basette vere: la fila del reggimento ha il passo
   delle sue, e un Warboss da 30 mm fra i Night Goblin da 25 sporgeva sul
   vicino. */
function affianca(u, capi, lay){
  const a = (u.rot || 0) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a);
  const posti = lay.slots.filter(sl => sl.kind === "char").sort((p, q) => p.x - q.x);
  let destra = -Infinity;
  for (const sl of posti){
    const c = capi.find(x => x.uid === sl.uid);
    if (!c) continue;
    const w = c.baseW || sl.w || 0;
    const lx = Math.max(sl.x, destra + w / 2);
    destra = lx + w / 2;
    c.x = u.x + lx * cs - sl.y * sn; c.y = u.y + lx * sn + sl.y * cs;
  }
}

/* Il Panico oltre un quarto (p. 141): il conto lo fa `psych.js`, il
   test lo tira qui, e chi fallisce fugge. */
const faseDi = S => `${chiave(S)}:${S.casella}`;
/* La Forza d'Unita' d'inizio fase, fotografata la prima volta che in
   questa fase qualcuno la tocca: e' il numero da cui si conta il
   quarto perso (p. 160). Prima la scattava solo il tiro, e i colpi
   degli incantesimi non mandavano al Panico nessuno. */
function inizioFase(S, u){
  const fase = faseDi(S);
  if (u.faseTiro !== fase){ u.faseTiro = fase; u.usInizioFase = usOf(u); }
}

/* Il quarto perso in UNA fase (pp. 141, 160), come lo conta `shoot.js`.
   Prima si confrontava la forza di partenza della partita con quella
   di adesso: passato il quarto una volta, ogni perdita successiva —
   anche un solo modello, anche turni dopo — rifaceva il test. `da` e'
   il nemico che ha fatto le perdite: chi fallisce fugge da lui. */
function panico(S, u, why, da = null){
  if (u.dead) return;
  const conto = SH.panicFromShooting({ us: u.usInizioFase || 0, usLost: (u.usInizioFase || 0) - usOf(u) });
  if (!conto.must) return;
  testPanico(S, u, "casualties", { perche: why, da });
}

/* Un test di Panico, per qualunque causa (pp. 160-161). Uno per fase,
   anche se le cause sono piu' d'una; non lo fa chi sta caricando, chi
   e' in combattimento e chi fugge gia'. Chi fallisce ripiega in ordine
   se ha ancora piu' della meta' dei modelli d'inizio battaglia, e
   altrimenti fugge — prima fuggiva sempre —, lontano da chi ha fatto le
   perdite o, se la causa e' un amico, dal nemico piu' vicino che non
   stia fuggendo. */
function testPanico(S, u, causa, { perche = "", da = null, fonte = null, dist = 0, fonteUS = null } = {}){
  if (!u || u.dead || !onBoard(u) || isJoined(u)) return;
  const fase = faseDi(S);
  if (u.panicoFatto === fase) return;
  const p = PS.psychOf(u, { joined: capiInFila(S, u) });
  const c = PS.panicCheck({ cause: causa, me: p, dist, sourceUS: fonteUS,
                            source: fonte ? PS.psychOf(fonte) : null,
                            fleeing: !!u.fled, engaged: ingaggiata(S, u),
                            sourceName: perche || (fonte ? fonte.name : "") });
  if (!c || !c.must) return;
  u.panicoFatto = fase;
  if (c.auto){ say(S, `${u.name}: niente Panico — ${c.autoWhy}.`, { army: u.army, page: c.page,
      x: { k: "panico", u: u.name, uid: u.uid, f: [{ t: c.why || "", f: "stato" }, { t: c.autoWhy, f: "regola" }],
           e: "non tira", ok: true } }); return; }
  const dadi = roll(PS.coldDice("panic", p) ? 3 : 2);
  const res = PS.psychTest({ kind:"panic", ld: ldOf(S, u), dice: dadi, p });
  say(S, `${u.name}, test di Panico (${c.why}): ${res.text}.`, { dice: dadi, army: u.army, page: c.page,
      x: xPsico(S, u, "panic", dadi, res, c.why) });
  if (res.passed) return;
  const nemico = (da && !da.dead && da.army !== u.army ? da : null) ||
                 piuVicino(S, u, nemiciDi(S, u).filter(e => !e.fled)) || piuVicino(S, u);
  if (!nemico) return;
  const esito = PS.panicFail({ alive: alive(u), start: u.models || 0 });
  if (esito.outcome === "fallBack"){
    const dd = roll(2);
    const quanto = Math.max(...dd);
    say(S, `${u.name} va nel panico e ripiega in ordine lontano da ${nemico.name} (${esito.why}): ` +
           `${dd.join(", ")}, si tiene il maggiore.`, { dice: dd, army: u.army, page: esito.page,
        x: { k: "ripiega", u: u.name, uid: u.uid, tot: quanto, via: scartati(dd, [quanto]),
             f: [{ t: esito.why, f: "stato" }, { t: "2D6, si tiene il maggiore (p. 134)", f: "regola" }],
             e: `ripiega di ${quanto}″ lontano da ${nemico.name}` } });
    indietreggia(S, u, [nemico], quanto, { kind: "fallBack" });
    return;
  }
  const { dadi: fuga, via, testo } = tiroDiFuga(u);
  say(S, `${u.name} va nel panico e fugge da ${nemico.name} (${esito.why}): ${testo} = ${via}″.`,
      { dice: fuga, army: u.army, page: 132, x: xFuga(u, fuga, via, { da: nemico, perche: "panico: " + esito.why }) });
  fuggi(S, u, nemico, via);
}

/* Gli amici entro 6″ di chi e' stato distrutto o ha perso un
   combattimento (p. 161). `usFonte` e' la sua Forza d'Unita' quando e'
   successo: sotto 5 non spaventa nessuno. La fonte resta dov'era,
   perche' il libro vuole che si misuri da li'. */
function ondaPanico(S, fonte, causa, usFonte){
  if (!fonte || (+usFonte || 0) < PS.PANIC_SOURCE_US) return;
  for (const f of inCampo(S, fonte.army)){
    if (f === fonte) continue;
    const d = distanza(S, fonte, f);
    if (d > PS.PANIC_RANGE) continue;
    testPanico(S, f, causa, { fonte, dist: d, fonteUS: usFonte });
  }
}

/* Chi fugge o ripiega passa attraverso gli amici che ha sul percorso,
   e ognuno di loro fa il Panico (p. 161). Si guarda il percorso a
   passi, dal punto di partenza a quello d'arrivo. */
function attraversati(S, u, at, mm){
  const amici = inCampo(S, u.army).filter(o => o !== u);
  const presi = new Set();
  for (let s = 0; s <= mm; s += PASSO)
    for (const o of amici)
      if (!presi.has(o) && polysOverlap(boxCorners(at(s)), cornersOf(o, S.units))) presi.add(o);
  return [...presi];
}

/* ============================================================
   7 bis · LA MAGIA (pp. 106-111)
   Le regole le sa `magic.js`; qui c'e' quello che sa il tavolo — chi e'
   a quanti pollici, chi combatte con chi — e i tre momenti in cui la
   magia chiede una decisione a chi gioca:

     PRIMA DELLO SCHIERAMENTO si sceglie il dominio, se il file non lo
     dice, e si generano gli incantesimi. Un file di New Recruit dice il
     dominio a volte, il Livello quasi mai, gli incantesimi usciti mai:
     si tirano qui, che e' quello che la regola chiede (p. 106). Se la
     scheda di preparazione li porta come id (`spellIds`), vince lei.
     Poi ognuno puo' scambiarne uno con la firma del dominio.

     NEL TURNO un incantesimo e' una mossa come una carica: chi lancia
     cosa su chi, con la probabilita' gia' fatta.

     SUBITO DOPO il dissolvimento tocca all'altra parte (p. 110), come la
     reazione alla carica tocca a chi la subisce: e' una domanda in
     sospeso (`S.pending`) con il giocatore giusto.

   Questa edizione non ha una riserva di dadi del vento: ogni tentativo
   tira i suoi 2D6, e il limite e' uno per incantesimo per turno, la
   sorte una volta per turno, e il fiasco che chiude il resto (pp. 108-
   110). Chi cercasse i dadi di potere, qui non li trova per questo.
   ============================================================ */
const magico = S => S.magia && S.magia.M;
const ospite = (S, u) => byUid(S, FM.joinedHost(u)) || u;
const pct = x => Math.round(x * 100) + "%";

/* ---- chi e' un mago, e cosa sa ---- */
function preparaMaghi(S){
  const M = magico(S);
  if (!M){
    if (S.units.some(u => MG.isWizard(u, u.prepara || {}))) limite(S, "domini");
    return;
  }
  for (const u of S.units){
    const pr = u.prepara || {};
    const libro = M.wizardBook(u);
    const regole = [...(u.rules || []), ...((libro && libro.regole) || [])];
    const dalFile = MG.levelOf(u, pr);
    const level = dalFile || (libro ? libro.livello : 0);
    const vincolati = M.boundFor(u.rules || []).filter(MG.applies).map(b => b.id);
    if (!level && libro && !dalFile){
      /* il Warlock Engineer e' un mago solo se l'ha pagato, e il file
         non lo dice: senza la scheda, non lo si fa lanciare */
      limite(S, "livello");
      say(S, `${u.name}: il libro lo fa mago solo con un'opzione (${libro.opzione}), e né la lista né la scheda la portano — non lancia.`,
          { army: u.army, page: libro.page });
    }
    if (!level && !vincolati.length) continue;
    /* un pezzo con il solo incantesimo vincolato — il Bastiladon con il
       Solar Engine — non ha Livello, e nemmeno una scheda da mago */
    const da = pr.level ? "dalla scheda di preparazione"
             : dalFile ? "dalle regole della lista"
             : libro ? `dal libro (${libro.libro}, p. ${libro.page})`
             : "un incantesimo vincolato, senza Livello";
    const domini = (pr.lore ? [pr.lore] : ((libro && libro.domini) || []))
      .map(k => M.lore(k)).filter(Boolean).map(l => l.id);
    u.mago = { level, da, regole, domini, vincolati, lore: null, known: [], fase: "pronto",
               cast: null, bound: null };
    if (!level) continue;
    if (!dalFile && libro && libro.opzione) limite(S, "livello");
    if (domini.length === 1) u.mago.lore = domini[0];
    const ids = (pr.spellIds || []).map(id => M.spell(id)).filter(Boolean).map(sp => sp.id);
    if (ids.length && u.mago.lore){
      u.mago.known = ids;
      say(S, `${u.name}, Livello ${level} (${da}): conosce ${ids.map(id => M.spell(id).name).join(", ")}, dalla scheda.`,
          { army: u.army, page: MG.PAGE.generation });
      continue;
    }
    if (!domini.length){
      say(S, `${u.name} è un mago di Livello ${level}, ma nessuno dice di che dominio: non lancia.`,
          { army: u.army, page: MG.PAGE.generation });
      u.mago.level = 0;
      continue;
    }
    u.mago.fase = u.mago.lore ? "genera" : "dominio";
  }
  S.preparando = S.units.some(u => u.mago && u.mago.fase !== "pronto");
  /* chi ha il dominio gia' deciso genera subito, nell'ordine della lista */
  for (const u of S.units) if (u.mago && u.mago.fase === "genera") genera(S, u);
}

function genera(S, u){
  const M = magico(S), m = u.mago;
  const l = M.lore(m.lore);
  const dadi = roll(m.level);
  let res = MG.generateSpells({ level: m.level, dice: dadi });
  /* i doppioni si ritirano finche' servono; il tetto c'e' per una
     sorgente di dadi finta che torna sempre la stessa faccia, e con i
     dadi veri non si tocca mai */
  for (let giri = 0; res.need > 0 && giri < 100; giri++){
    dadi.push(...roll(res.need));
    res = MG.generateSpells({ level: m.level, dice: dadi });
  }
  m.known = MG.knownSpells(M, m.lore, res.numbers).map(sp => sp.id);
  say(S, `${u.name}, Livello ${m.level} (${m.da}), ${l.name}: ${dadi.join(", ")}` +
         (res.rerolled.length ? ` (doppioni ritirati: ${res.rerolled.join(", ")})` : "") +
         ` → ${m.known.map(id => M.spell(id).name).join(", ")}.`,
      { dice: dadi, army: u.army, page: MG.PAGE.generation });
  const scambi = MG.swapOptions(M, m.lore, m.regole).filter(sp => !m.known.includes(sp.id));
  m.fase = scambi.length ? "scambio" : "pronto";
  if (m.fase === "pronto") fineGenerazione(S, u);
}

function fineGenerazione(S, u){
  const M = magico(S), m = u.mago;
  const muti = m.known.filter(id => !MG.applies(M.spell(id)));
  if (muti.length){
    limite(S, "amano");
    say(S, `${u.name}: ${muti.map(id => M.spell(id).name).join(", ")} ` +
           `${muti.length === 1 ? "resta" : "restano"} da leggere sul libro, e l'arbitro non ${muti.length === 1 ? "lo" : "li"} offre.`,
        { army: u.army, page: MG.PAGE.categories });
  }
  if (!S.units.some(x => x.mago && x.mago.fase !== "pronto")){
    S.preparando = false;
    say(S, "Gli incantesimi sono generati: si schiera.", { page: MG.PAGE.generation });
  }
}

const daPreparare = S => S.units.find(u => u.mago && u.mago.fase !== "pronto" && u.mago.fase !== "genera") || null;

function opzioniPreparazione(S){
  const u = daPreparare(S);
  if (!u){ S.preparando = false; return null; }
  const M = magico(S), m = u.mago;
  const base = { player: u.army, fase: "Incantesimi", page: MG.PAGE.generation, unit: u.uid };
  if (m.fase === "dominio"){
    return { ...base, what: `${S.nomi[u.army]}: di che dominio è ${u.name} (Livello ${m.level})?`,
      list: m.domini.map(id => {
        const l = M.lore(id);
        const buoni = l.spells.filter(MG.applies);
        const firma = l.spells.find(sp => sp.n === 0);
        return { id:"dominio", uid: u.uid, lore: id, nome: u.name, contro: l.label || l.name,
                 giocabili: buoni.length,
                 why: `${l.name}: l'app ne gioca ${buoni.length} su 7 (${buoni.map(sp => sp.name).join(", ") || "nessuno"})` +
                      (firma ? `; la firma è ${firma.name}` : ""),
                 page: MG.PAGE.generation };
      }) };
  }
  const nome = id => M.spell(id).name;
  const scambi = MG.swapOptions(M, m.lore, m.regole).filter(sp => !m.known.includes(sp.id));
  return { ...base, what: `${u.name} conosce ${m.known.map(nome).join(", ")}: ne scambia uno?`,
    list: [
      { id:"tieni", uid: u.uid, nome: u.name, why: `tiene ${m.known.map(id => descriviSpell(M.spell(id))).join("; ")}`,
        page: MG.PAGE.generation },
      ...m.known.flatMap(out => scambi.map(into => ({
        id:"scambia", uid: u.uid, out, into: into.id, nome: u.name,
        lasciaMuto: !MG.applies(M.spell(out)), prendeMuto: !MG.applies(into),
        why: `lascia ${descriviSpell(M.spell(out))} e prende ${descriviSpell(into)}`,
        page: MG.PAGE.generation }))),
    ] };
}

/* un incantesimo in una riga, per chi deve scegliere */
function descriviSpell(sp){
  const e = sp.effetto || {};
  const cosa = e.colpi ? `${e.colpi.dadi} colpi a Forza ${e.colpi.S}` + (e.colpi.AP ? `, perforazione ${e.colpi.AP}` : "")
             : sp.testo || "";
  return `${sp.name} (${MG.TYPE_LABEL[sp.type]}, ${sp.cv}+${typeof sp.range === "number" ? ", " + sp.range + "″" : ""}` +
         `${MG.applies(sp) ? "" : ", da leggere sul libro"}): ${cosa}`;
}

function sceltaDominio(S, a){
  const u = byUid(S, a.uid);
  if (!u || !u.mago || u.mago.fase !== "dominio") return no("non c'è un dominio da scegliere");
  if (!u.mago.domini.includes(a.lore)) return no(`${u.name} non può scegliere quel dominio`);
  u.mago.lore = a.lore;
  say(S, `${u.name} sceglie ${magico(S).lore(a.lore).name}.`, { army: u.army, page: MG.PAGE.generation });
  genera(S, u);
  return si("dominio scelto");
}
function tieniIncantesimi(S, a){
  const u = byUid(S, a && a.uid) || daPreparare(S);
  if (!u || !u.mago || u.mago.fase !== "scambio") return no("non c'è niente da tenere");
  u.mago.fase = "pronto";
  fineGenerazione(S, u);
  return si("incantesimi tenuti");
}
function scambiaIncantesimo(S, a){
  const u = byUid(S, a.uid);
  if (!u || !u.mago || u.mago.fase !== "scambio") return no("non c'è niente da scambiare");
  const M = magico(S), m = u.mago;
  const lecito = MG.swapOptions(M, m.lore, m.regole).some(sp => sp.id === a.into);
  if (!m.known.includes(a.out) || !lecito) return no("scambio non concesso (p. 106)");
  m.known = m.known.map(id => id === a.out ? a.into : id);
  say(S, `${u.name} lascia ${M.spell(a.out).name} e prende ${M.spell(a.into).name}.`,
      { army: u.army, page: MG.PAGE.generation });
  m.fase = "pronto";
  fineGenerazione(S, u);
  return si("scambio fatto");
}

/* ---- chi puo' lanciare cosa, adesso ---- */
const maghiDi = (S, army) => S.units.filter(u => u.army === army && u.mago && !u.dead &&
                                                   onBoard(ospite(S, u)) &&
                                                   (u.mago.level > 0 || u.mago.vincolati.length));
const castKey = S => chiave(S);
const giaLanciati = (S, u) => (u.mago.cast && u.mago.cast.key === castKey(S)) ? u.mago.cast.ids : [];
const fermo = (S, army, cosa) => S.magia.stop[cosa + ":" + army] === castKey(S);
const casellaOra = S => (CASELLE[S.casella] || {}).id || "";

function nelArco(S, host, t){
  if (t === host) return true;
  /* Firing Platform: dal carro si tira e si lancia in tutte le direzioni */
  if (haRegola(host, /^firing platform/i)) return true;
  return FM.arcOfPoly(cornersOf(t, S.units), boxOf(host, S.units)).has.includes("fronte");
}

/* Quanto male fanno in media i colpi di un incantesimo su quel
   bersaglio: la stessa catena di `combat.js`, senza il tiro per colpire
   (p. 107). */
function attesaColpi(sp, t){
  const h = sp.effetto.colpi;
  const n = MG.diceMean(MG.parseDice(h.dadi));
  const d = CB.combatant(t);
  const ferisce = chanceOf(woundOn(h.S, d.t));
  const arm = h.noArmour ? 0 : chanceOf(saveOn(d.armour, h.AP || 0));
  const ward = chanceOf(saveOn(d.ward, 0));
  const rig = h.noRegen ? 0 : chanceOf(saveOn(d.regen, 0));
  return n * ferisce * (1 - arm) * (1 - ward) * (1 - rig) / Math.max(1, d.w);
}

function opzioniLancio(S, tipi, { army = S.army, gruppo = null } = {}){
  const M = magico(S);
  if (!M) return [];
  const out = [];
  if (fermo(S, army, "lancio")) return out;
  for (const u of maghiDi(S, army)){
    const host = ospite(S, u), m = u.mago;
    if (gruppo && ![...gruppo.A, ...gruppo.B].includes(host)) continue;
    const ids = [...(m.level > 0 ? m.known : []), ...m.vincolati];
    for (const id of ids){
      const sp = M.spell(id);
      if (!sp || !tipi.includes(sp.type) || !MG.applies(sp)) continue;
      if (sp.bound && m.bound === castKey(S) + ":" + casellaOra(S)) continue;
      const engaged = ingaggiata(S, host);
      const gate = MG.canCast(sp, { fleeing: !!host.fled, engaged, castThisTurn: giaLanciati(S, u),
                                    stepId: MG.CAST_STEP[sp.type], stupid: stupida(S, u) });
      if (!gate.can) continue;
      const chi = sp.bound ? `Potere ${sp.potere || 0}` : `Livello ${m.level}`;
      for (const b of bersagli(S, u, host, sp, gruppo)){
        const mr = resistenza(S, u, b.t);
        const odds = MG.castOdds({ level: m.level, cv: sp.cv, bound: !!sp.bound, power: sp.potere || 0, mod: mr.mod });
        const attesa = sp.effetto.colpi && b.t ? attesaColpi(sp, b.t) : 0;
        out.push({ id:"lancia", uid: u.uid, spell: sp.id, target: b.t ? b.t.uid : null,
                   nome: u.name, contro: b.t ? b.t.name : "",
                   why: `${sp.name} (${MG.TYPE_LABEL[sp.type]}, ${sp.cv}+)` +
                        (b.t ? ` su ${b.t.name}` : "") + (b.dist ? ` a ${b.dist}″` : "") +
                        `: con ${chi}${mr.mod ? `, ${mr.text}` : ""} riesce il ${pct(odds.cast)}` +
                        (odds.miscast ? `, fiasco il ${pct(odds.miscast)}` : "") +
                        (attesa ? `, ≈ ${attesa.toFixed(1)} perdite` : `; ${sp.testo || MG.manualOf(sp)}`),
                   chance: odds.cast, attesa: attesa * odds.cast, page: sp.page || MG.PAGE.casting });
      }
    }
  }
  return out.sort((a, b) => (b.attesa - a.attesa) || (b.chance - a.chance));
}

/* I bersagli legali (p. 108): nell'arco del mago, entro gittata, non in
   combattimento; i dardi vogliono la vista, gli assalti un nemico con
   cui si combatte. Il mago unito misura dal reggimento che lo ospita. */
function bersagli(S, u, host, sp, gruppo){
  if (sp.range === "self") return [{ t: host, dist: 0 }];
  if (sp.type === "assailment"){
    const nemici = contatti(S).filter(c => (c.a === host.uid || c.b === host.uid) &&
                                           (c.a === host.uid ? c.bArmy : c.aArmy) !== host.army)
      .map(c => byUid(S, c.a === host.uid ? c.b : c.a)).filter(t => t && onBoard(t));
    return [...new Set(nemici)].filter(t => !gruppo || [...gruppo.A, ...gruppo.B].includes(t))
      .map(t => ({ t, dist: 0 }));
  }
  const amici = sp.type === "enchantment" || sp.type === "conveyance";
  const pool = amici ? inCampo(S, host.army) : nemiciDi(S, host);
  const out = [];
  for (const t of pool){
    const dist = t === host ? 0 : distanza(S, host, t);
    const check = MG.targetCheck(sp, { dist, inArc: nelArco(S, host, t), engaged: ingaggiata(S, t),
                                       friendly: amici, sight: !vistaTagliata(S, host, t) });
    if (check.ok) out.push({ t, dist });
  }
  return out;
}

/* La Magic Resistance del bersaglio (p. 108), che vale solo contro gli
   incantesimi del nemico: sull'unita' e sui personaggi che ci stanno
   dentro, il piu' alto dei −X. */
function resistenza(S, mago, t){
  if (!t || t.army === mago.army) return MG.magicResistance([]);
  return MG.magicResistance([t, ...capiDi(S, t)]);
}

/* ---- il lancio (pp. 108-109) ---- */
function lancia(S, a){
  const M = magico(S);
  if (!M) return no("la magia non è caricata");
  const u = byUid(S, a.uid), sp = M.spell(a.spell);
  if (!u || !u.mago || !sp) return no("mago o incantesimo sconosciuto");
  /* l'assalto di chi non e' di turno chiude la sua domanda: dopo il
     lancio, e il suo dissolvimento, si torna al combattimento */
  const sospeso = S.pending && S.pending.kind === "assalto" ? S.pending : null;
  if (sospeso) S.pending = null;
  const m = u.mago;
  const sa = [...(m.level > 0 ? m.known : []), ...m.vincolati];
  if (!sa.includes(sp.id)) return no(`${u.name} non conosce ${sp.name}`);
  /* si ricontrolla tutto: chi sceglie puo' aver passato una mossa
     vecchia, e l'arbitro non la applica di nascosto */
  const lecite = opzioniLancio(S, [sp.type], { army: u.army });
  const mossa = lecite.find(x => x.uid === u.uid && x.spell === sp.id && x.target === (a.target ?? null));
  if (!mossa){ S.pending = sospeso || S.pending; return no(`${sp.name} non si può lanciare adesso su quel bersaglio`); }
  const host = ospite(S, u);
  const t = a.target != null ? byUid(S, a.target) : null;

  const ids = giaLanciati(S, u);
  m.cast = { key: castKey(S), ids: [...ids, sp.id] };
  if (sp.bound) m.bound = castKey(S) + ":" + casellaOra(S);
  if (sp.type === "assailment") limite(S, "assalti");
  if (u.armour > 0 && !sp.bound) limite(S, "armatura");

  const dadi = roll(2);
  const mr = resistenza(S, u, t);
  let res = MG.castResult({ dice: dadi, level: m.level, cv: sp.cv, cv2: sp.cv2 || 0,
                            bound: !!sp.bound, power: sp.potere || 0, mod: mr.mod });
  say(S, `${u.name} lancia ${sp.name}${t && t !== host ? " su " + t.name : ""}: ${res.text}` +
         (mr.mod ? ` (${mr.text} di ${mr.who}, p. 108)` : "") + ".",
      { dice: dadi, army: u.army, page: MG.PAGE.casting,
        x: { k: "lancio", t: `Lancio · ${sp.name}`, u: u.name + (t && t !== host ? ` → ${t.name}` : ""), uid: u.uid,
             tot: res.natural,
             piu: [sp.bound ? { t: "Potere", v: sp.potere || 0 } : { t: `Livello ${m.level}`, v: m.level },
                   { t: mr.text ? `${mr.text} di ${mr.who}` : "", v: mr.mod }],
             vs: { v: res.value, op: ">=", t: "valore di lancio" },
             f: [...(sp.bound ? [{ t: "incantesimo vincolato: si somma il Potere, non il Livello", f: "magia" }] : []),
                 ...(mr.mod ? [{ t: `${mr.text}: vale per chi bersaglia ${mr.who} (p. 108)`, f: "regola" }] : []),
                 ...(res.perfect ? [{ t: "doppio 6: invocazione perfetta, non si può dissolvere", f: "dadi" }] : []),
                 ...(res.miscast ? [{ t: "doppio 1: fiasco, si tira sulla tabella", f: "dadi" }] : [])],
             e: res.perfect ? "invocazione perfetta" : res.miscast ? "fiasco" : res.cast ? "lanciato" : "non lanciato",
             ok: res.cast } });
  if (res.miscast){
    const fd = roll(2);
    const mis = MG.miscastRead(fd[0] + fd[1]);
    say(S, `${u.name}, fiasco — ${fd.join(" + ")} = ${mis.total}: ${mis.label}, ${mis.text}.`,
        { dice: fd, army: u.army, page: MG.PAGE.miscast,
          x: { k: "fiasco", u: u.name, uid: u.uid, tot: mis.total,
               f: [{ t: "il doppio 1 al lancio porta alla tabella dei fiaschi: 2D6", f: "magia" }],
               e: `${mis.label}: ${mis.text}`, ok: false } });
    colpiDelFiasco(S, u, mis);
    if (mis.stop) S.magia.stop["lancio:" + u.army] = castKey(S);
    if (mis.cast) res = { ...res, cast: true, perfect: !!mis.perfect, total: mis.atValue ? sp.cv : res.total };
  }
  if (!res.cast) return si(continua(S, a.dopo) || `${sp.name} non lanciato`);

  const lancio = { caster: u.uid, spell: sp.id, target: t ? t.uid : null, total: res.total,
                   perfect: !!res.perfect, army: u.army, dopo: a.dopo || null };
  if (res.perfect) return si(risolvi(S, lancio));
  const list = opzioniDissolvi(S, lancio);
  if (list.length === 1){
    say(S, `${S.nomi[altro(u.army)]} non può provare a dissolvere ${sp.name}: ` +
           `nessun mago a portata, e la sorte è già stata tentata in questo turno.`,
        { army: altro(u.army), page: MG.PAGE.dispel });
    return si(risolvi(S, lancio));
  }
  S.pending = { kind:"dissolvi", lancio, list };
  return si(`${sp.name} lanciato con ${res.total}: tocca a ${S.nomi[altro(u.army)]} dissolverlo`);
}

/* Il fiasco con i colpi: la sagoma centrata sul mago prende almeno lui.
   Chi altro ci sta sotto vuole la posizione modello per modello, e
   quella resta fra i limiti delle sagome. */
function colpiDelFiasco(S, u, row){
  if (!row.hit) return;
  if (row.hit.template) limite(S, "sagome");
  colpisci(S, u, { S: row.hit.S, AP: row.hit.AP }, 1, `${row.label}`, { panico: false });
}

/* ---- il dissolvimento (p. 110) ---- */
function opzioniDissolvi(S, l){
  const M = magico(S), sp = M.spell(l.spell), w = byUid(S, l.caster);
  const lui = altro(l.army), da = ospite(S, w);
  const out = [];
  if (!fermo(S, lui, "dissolvi")){
    for (const d of maghiDi(S, lui)){
      if (!(d.mago.level > 0)) continue;
      const h = ospite(S, d);
      if (h.fled || ingaggiata(S, h) || stupida(S, d)) continue;
      const dist = distanza(S, h, da);
      if (dist > MG.dispelRange(d.mago.level) + 1e-6) continue;
      const odds = MG.dispelOdds({ level: d.mago.level, against: l.total, bound: !!sp.bound });
      out.push({ id:"dissolvi", uid: d.uid, nome: d.name, contro: sp.name,
                 why: `Livello ${d.mago.level} a ${dist}″ (portata ${MG.dispelRange(d.mago.level)}″): ` +
                      `supera ${l.total} il ${pct(odds.dispel)}` +
                      (odds.outclassed ? `, surclassato il ${pct(odds.outclassed)}` : ""),
                 chance: odds.dispel, page: MG.PAGE.dispel });
    }
    if (S.magia.fato[lui] !== castKey(S)){
      const odds = MG.dispelOdds({ fated: true, against: l.total });
      out.push({ id:"dissolvi", fato: true, nome: "la sorte", contro: sp.name,
                 why: `affidato alla sorte, una volta per turno: supera ${l.total} il ${pct(odds.dispel)}, senza rischi`,
                 chance: odds.dispel, page: MG.PAGE.dispel });
    }
  }
  out.sort((a, b) => b.chance - a.chance);
  return [...out, { id:"lascia", why: `non si prova: ${sp.name} passa`, page: MG.PAGE.dispel }];
}

function dissolvi(S, a){
  const p = S.pending;
  if (!p || p.kind !== "dissolvi") return no("non c'è niente da dissolvere");
  const scelta = p.list.find(x => x.id === "dissolvi" && (a.fato ? x.fato : x.uid === a.uid));
  if (!scelta) return no("quel dissolvimento non si può tentare");
  const l = p.lancio, sp = magico(S).spell(l.spell);
  const lui = altro(l.army);
  S.pending = null;
  const d = a.fato ? null : byUid(S, a.uid);
  if (a.fato) S.magia.fato[lui] = castKey(S);
  const dadi = roll(2);
  let res = MG.dispelResult({ dice: dadi, level: d ? d.mago.level : 0, fated: !!a.fato, castTotal: l.total });
  /* un incantesimo vincolato non surclassa nessuno (p. 109) */
  if (sp.bound && res.outclassed) res = { ...res, outclassed: false, dispelled: res.total > res.against };
  say(S, `${d ? d.name : "La sorte"} contro ${sp.name}: ${res.text}.`,
      { dice: dadi, army: lui, page: MG.PAGE.dispel,
        x: { k: "dissolvi", t: `Dissolvimento · ${sp.name}`, u: d ? d.name : "la sorte", uid: d ? d.uid : null,
             tot: res.natural, piu: d ? [{ t: `Livello ${d.mago.level}`, v: d.mago.level }] : [],
             vs: { v: res.against, op: MG.DISPEL_TIES ? ">=" : ">", t: "il lancio" },
             f: [...(a.fato ? [{ t: "affidato alla sorte: niente Livello, una volta per turno", f: "magia" }] : []),
                 ...(sp.bound ? [{ t: "vincolato: non surclassa nessuno (p. 109)", f: "magia" }] : []),
                 ...(res.unbinding ? [{ t: "doppio 6: slegato, dissolto comunque", f: "dadi" }] : []),
                 ...(res.outclassed ? [{ t: "doppio 1: surclassato", f: "dadi" }] : [])],
             e: res.dispelled ? "dissolto" : res.outclassed ? "surclassato" : "l'incantesimo tiene",
             ok: res.dispelled } });
  if (res.outclassed){
    const fd = roll(2);
    const out = MG.miscastRead(fd[0] + fd[1], { dispel: true });
    say(S, `${d.name} è surclassato — ${fd.join(" + ")} = ${out.total}: ${out.label}, ${out.text}.`,
        { dice: fd, army: lui, page: MG.PAGE.dispel });
    colpiDelFiasco(S, d, out);
    if (out.stop) S.magia.stop["dissolvi:" + lui] = castKey(S);
    if (out.dispelled) res = { ...res, dispelled: true };
  }
  if (res.dispelled){
    say(S, `${sp.name} è dissolto e non fa niente.`, { army: lui, page: MG.PAGE.dispel });
    return si(continua(S, l.dopo) || "dissolto");
  }
  return si(risolvi(S, l));
}

function lascia(S){
  const p = S.pending;
  if (!p) return no("non c'è niente da lasciare");
  S.pending = null;
  if (p.kind === "dissolvi") return si(risolvi(S, p.lancio));
  if (p.kind === "assalto"){
    const g = gruppoCon(S, p.uids);
    return si(g ? mischia(S, g) : "il combattimento non c'è più");
  }
  S.pending = p;
  return no("questa domanda non si lascia");
}

/* ---- l'effetto (p. 111) ---- */
function risolvi(S, l){
  const M = magico(S), sp = M.spell(l.spell);
  const w = byUid(S, l.caster), host = ospite(S, w);
  const t = l.target != null ? byUid(S, l.target) : null;
  const e = sp.effetto || {};
  let testo = `${sp.name} fa effetto`;

  if (e.colpi && t && !t.dead){
    const spec = MG.parseDice(e.colpi.dadi);
    const dadi = spec.n ? (spec.die === 3 ? Array.from({ length: spec.n }, () => d3()) : roll(spec.n)) : [];
    const quanti = MG.diceTotal(spec, dadi);
    say(S, `${sp.name}: ${e.colpi.dadi}${dadi.length ? " → " + dadi.join(" + ") + (spec.plus ? " + " + spec.plus : "") : ""} = ${quanti} colpi.`,
        { dice: dadi, army: w.army, page: sp.page || MG.PAGE.resolution });
    colpisci(S, t, e.colpi, quanti, sp.name, { panico: sp.type !== "assailment", da: w });
    testo = `${sp.name}: ${quanti} colpi su ${t.name}`;
  }

  const rolled = e.modificheDado ? d3() : 0;
  const eff = MG.effectOf(sp, { at: { turn: S.turno, side: S.army }, rolled, casterName: w.name });
  if (eff){
    const chi = sp.range === "self"
      ? (MG.selfAndUnit(sp) && host !== w ? [w, host] : [w])
      : t ? [t] : [];
    const presi = [];
    for (const x of chi){
      if (MG.skipOn(sp, { armour: EF.val(x, "armour") })){
        say(S, `${sp.name}: ${x.name} non ha armatura da peggiorare.`, { army: w.army, page: sp.page || 0 });
        continue;
      }
      for (const id of MG.cancelled(sp, EF.effectsOf(x))) EF.removeEffect(x, id);
      EF.addEffect(x, eff);
      presi.push(x.name);
    }
    if (presi.length){
      const mods = Object.entries(eff.mods).map(([k, v]) =>
        typeof v === "object" ? `${EF.DERIVED_LABEL[k] || k} ${v.best || v.set}+` : `${v > 0 ? "+" + v : "−" + Math.abs(v)} ${EF.CHAR_LABEL[k] || EF.DERIVED_LABEL[k] || k}`);
      const flags = Object.entries(eff.flags).map(([k, v]) => k === "ap" ? `+${v} perforazione` : FLAG_LABEL[k] || k);
      const fino = eff.until === "ownTurn" ? "fino al prossimo inizio turno di chi l'ha lanciato"
                 : eff.until === "turn" ? "fino alla fine del turno" : "finché resta in gioco";
      say(S, `${sp.name} su ${presi.join(" e ")}: ${[...mods, ...flags].join(", ")}` +
             (rolled ? ` (D3 = ${rolled})` : "") + `, ${fino}.`,
          { dice: rolled ? [rolled] : null, army: w.army, page: sp.page || MG.PAGE.resolution });
      testo = `${sp.name} su ${presi.join(" e ")}`;
    }
  }
  const aMano = MG.manualOf(sp);
  if (aMano) say(S, `${sp.name}, da leggere sul libro: ${aMano}. L'arbitro non lo applica.`,
                 { army: w.army, page: sp.page || 0, kind: "limite" });
  return continua(S, l.dopo) || testo;
}
const FLAG_LABEL = { noMarch: "non marcia", noCharge: "non carica", frenzy: "Frenesia", hatred: "Odio" };

/* I colpi che non tirano per colpire: un incantesimo, un fiasco. La
   catena e' quella dello scontro, con i colpi automatici, e le ferite
   che non fanno un modello restano appese. */
function colpisci(S, t, h, quanti, fonte, { panico: conPanico = true, da = null } = {}){
  if (!t || t.dead || !(quanti > 0)) return 0;
  const def = CB.combatant(t);
  const side = { ...def, armour: h.noArmour ? 0 : def.armour, regen: h.noRegen ? 0 : def.regen };
  const v = CB.strike({ name: fonte }, side, { attacks: quanti, auto: true, strength: h.S, ap: h.AP || 0, label: fonte });
  const toll = CB.woundsToll(t, v.wounds);
  inizioFase(S, t);
  perdite(S, t, toll.kills, toll.left);
  say(S, `${t.name}: ${quanti} colp${quanti === 1 ? "o" : "i"} a Forza ${h.S}` +
         (h.AP ? `, perforazione ${h.AP}` : "") + (h.noArmour ? ", senza armatura" : "") +
         ` — ${v.wounds} ferit${v.wounds === 1 ? "a" : "e"}, ${toll.kills} a terra.`,
      { dice: v.wound.dice, army: da ? da.army : t.army, page: MG.PAGE.resolution });
  if (conPanico && toll.kills > 0 && !t.dead) panico(S, t, fonte, da);
  return toll.kills;
}

/* ---- i combattimenti che aspettano un assalto ---- */
function gruppoCon(S, uids){
  return gruppiInMischia(S).find(g => [...g.A, ...g.B].some(u => uids.includes(u.uid))) || null;
}
/* Il combattimento scelto, dalla prima domanda ai dadi. Prima la
   sfida (p. 211), che e' la cosa che si fa «quando un combattimento
   viene scelto»; poi gli assalti di chi non e' di turno; poi si mena. */
function avviaCombattimento(S, uids){
  const g = gruppoCon(S, uids);
  if (!g || fatto(S, g)) return "il combattimento non c'è più";
  ripulisciSfide(S);
  /* Un campione d'unita' in questo combattimento e' un modello che sul
     libro potrebbe sfidare e qui non puo': si dice adesso, che e' il
     momento in cui conta. */
  if ([...g.A, ...g.B].some(u => u.command && u.command.champion)) limite(S, "campioni");
  /* «una sola sfida per combattimento», e quella in corso continua
     finche' non si risolve: «To The Death!» (pp. 211-212) */
  if (!sfidaDi(S, g)){
    const q = chiediSfida(S, uids, S.army);
    if (q) return q;
  }
  return dopoLaSfida(S, uids);
}
function dopoLaSfida(S, uids){
  const g = gruppoCon(S, uids);
  if (!g || fatto(S, g)) return "il combattimento non c'è più";
  const q = chiediAbominio(S, uids);
  if (q) return q;
  const dopo = { kind: "combatti", uids };
  const assalti = opzioniLancio(S, ["assailment"], { army: altro(S.army), gruppo: g })
    .map(x => ({ ...x, dopo }));
  if (assalti.length){
    S.pending = { kind: "assalto", uids,
                  list: [...assalti, { id:"lascia", why: "nessun assalto: si combatte", page: 158 }] };
    return `${S.nomi[altro(S.army)]} può lanciare un assalto prima che si meni`;
  }
  return mischia(S, g);
}
/* dopo un incantesimo lanciato dentro un combattimento, il
   combattimento: con un'altra occasione di lanciare, se ne restano */
function continua(S, dopo){
  if (!dopo || S.pending) return "";
  if (dopo.kind === "combatti") return dopoLaSfida(S, dopo.uids);
  return "";
}

/* ---- gli Abominable Attacks (Legends: Skaven, Hell Pit Abomination) ----
   «Instead of attacking normally during the Combat phase, a Hell Pit
   Abomination may choose to make one of the following»: nutrirsi — un
   modello nemico a contatto, un tiro per colpire, e se colpito D3 ferite
   senza armatura (la speciale e la Rigenerazione si tirano) — o la
   valanga di carne: la sagoma piccola col buco sul centro dell'unita'
   bersaglio, e chiunque ci stia sotto, amico o nemico, prende un colpo
   con la Forza dell'Abominio e PA −2. Una domanda per combattimento e
   per turno, a chi possiede l'Abominio, dopo la sfida e prima degli
   assalti. Ogni opzione porta quanto ci si aspetta di fare, e sono in
   ordine: l'euristica prende la prima. */
function chiediAbominio(S, uids){
  const g = gruppoCon(S, uids);
  if (!g) return "";
  for (const [miei, loro] of [[g.A, g.B], [g.B, g.A]]){
    for (const u of miei){
      if (!onBoard(u) || !abominevole(u) || (u.abominio && u.abominio.key === chiave(S))) continue;
      const vivi = loro.filter(onBoard);
      if (!vivi.length) continue;
      S.pending = { kind:"abominio", uid: u.uid, uids, list: opzioniAbominio(S, u, vivi) };
      return `${S.nomi[u.army]} sceglie come attacca ${u.name}`;
    }
  }
  return "";
}
function opzioniAbominio(S, u, loro){
  const me = CB.combatant(u);
  const out = [];
  const davanti = aContatto(S, u, loro);
  const normali = davanti.length ? CB.meleeForecast(me, CB.combatant(davanti[0])) : null;
  out.push({ id:"abominio", uid: u.uid, scelta:"normali", nome: u.name,
             attesa: normali ? normali.wounds : 0,
             why: `attacca normalmente${normali ? `: ${r1(normali.attacks)} attacchi in media, ≈ ${normali.wounds.toFixed(1)} ferite su ${davanti[0].name}` : ""}`,
             page: 176 });
  /* nutrirsi: un modello a contatto, anche un capo che sta nel reggimento */
  for (const t of davanti.flatMap(x => [x, ...capiInFila(S, x)])){
    const d = CB.combatant(t);
    const need = hitMelee(me.ws, d.wsDef || d.ws);
    const salva = (1 - chanceOf(saveOn(d.ward, 0))) * (1 - chanceOf(saveOn(d.regen, 0)));
    const attesa = chanceOf(need) * Math.min(2, d.w) * salva;
    out.push({ id:"abominio", uid: u.uid, scelta:"nutriti", target: t.uid, nome: u.name, contro: t.name, attesa,
               why: `si nutre di un modello di ${t.name}: lo colpisce col ${need}+, e se lo colpisce ` +
                    `D3 ferite senza armatura su quel modello solo (≈ ${attesa.toFixed(1)})`, page: 144 });
  }
  /* la valanga: dove cade la sagoma lo si sa prima, perche' non devia */
  for (const t of loro){
    const v = valanga(S, u, t, { conta: true });
    out.push({ id:"abominio", uid: u.uid, scelta:"valanga", target: t.uid, nome: u.name, contro: t.name,
               attesa: v.attesa,
               why: `valanga di carne su ${t.name}: sagoma piccola sul centro, un colpo di Forza ${v.forza} ` +
                    `e PA −2 a chi ci sta sotto — ${v.nemici} nemici` + (v.amici ? ` e ${v.amici} dei tuoi` : "") +
                    ` (≈ ${v.attesa.toFixed(1)} ferite)`, page: 144 });
  }
  return out.sort((a, b) => b.attesa - a.attesa);
}
function sceltaAbominio(S, a){
  const p = S.pending;
  if (!p || p.kind !== "abominio" || !a) return no("nessuna domanda sugli Abominable Attacks");
  const lecita = p.list.find(x => x.scelta === a.scelta && (x.target ?? null) === (a.target ?? null));
  if (!lecita) return no("scelta non fra quelle offerte");
  const u = byUid(S, p.uid);
  S.pending = null;
  u.abominio = { key: chiave(S), scelta: a.scelta, target: a.target ?? null };
  if (a.scelta === "normali") say(S, `${u.name} attacca normalmente.`, { army: u.army, page: 144 });
  else limite(S, "abominio");
  return si(dopoLaSfida(S, p.uids));
}
/* Nutrirsi: un tiro per colpire, D3 ferite su UN modello — quello che
   avanza oltre le sue Ferite non passa al vicino. Torna le ferite fatte. */
function nutriti(S, u, t){
  const me = CB.combatant(u), d = CB.combatant(t);
  const need = hitMelee(me.ws, d.wsDef || d.ws);
  const colpo = roll(1)[0];
  if (!(colpo >= need && colpo > 1)){
    say(S, `${u.name} prova a nutrirsi di ${t.name}: ${colpo} contro ${need}+, manca.`,
        { dice: [colpo], army: u.army, page: 144,
          x: { k: "mischia", t: "Abominable Attacks · si nutre", u: `${u.name} → ${t.name}`, uid: u.uid,
               passi: [{ t: "colpire", serve: need, d: [colpo] }],
               f: [{ t: `Abilità di Combattimento ${me.ws} contro ${d.wsDef || d.ws}: colpisce a ${need}+`, f: "profilo" }],
               e: "manca", ok: false } });
    return 0;
  }
  const dd = roll(1)[0], quante = 1 + Math.floor((dd - 1) / 2);
  const salvi = roll(quante);
  const ward = saveOn(d.ward, 0), rig = saveOn(d.regen, 0);
  const passano = salvi.filter(v => !((ward < 7 && v >= ward) || (rig < 7 && v >= rig))).length;
  const gia = t.wounds || 0;
  const ferite = Math.min(passano, Math.max(1, d.w - gia));
  const toll = CB.woundsToll(t, ferite, { carried: gia });
  inizioFase(S, t);
  say(S, `${u.name} si nutre di ${t.name}: ${colpo} contro ${need}+, colpito; D3 → ${dd} = ${quante} ` +
         `ferit${quante === 1 ? "a" : "e"} senza armatura` +
         (ward < 7 || rig < 7 ? ` (salvezze ${salvi.join(", ")})` : "") +
         `, ${ferite} su un modello solo, ${toll.kills} a terra.`,
      { dice: [colpo, dd, ...(ward < 7 || rig < 7 ? salvi : [])], army: u.army, page: 144,
        x: { k: "mischia", t: "Abominable Attacks · si nutre", u: `${u.name} → ${t.name}`, uid: u.uid,
             passi: [{ t: "colpire", serve: need, d: [colpo] }, { t: "D3 ferite", d: [quante] },
                     ...(ward < 7 || rig < 7 ? [{ t: "salvezza (salva)", serve: Math.min(ward, rig), d: salvi }] : [])],
             f: [{ t: `Abilità di Combattimento ${me.ws} contro ${d.wsDef || d.ws}: colpisce a ${need}+`, f: "profilo" },
                 { t: "D3 ferite senza tiro armatura, tutte su un modello solo", f: "regola" }],
             e: `${ferite} ferit${ferite === 1 ? "a" : "e"}, ${toll.kills} a terra`, ok: ferite > 0 } });
  perdite(S, t, toll.kills, toll.left);
  return ferite;
}
/* La valanga di carne. Con `conta` non tocca niente e dice quanti sono
   sotto e quante ferite ci si aspettano; senza, tira e toglie. Torna le
   ferite fatte a chi sta in `nemici` (quelli del combattimento, che
   entrano nel risultato). */
function valanga(S, u, t, { conta = false, nemici = [] } = {}){
  const out = SH.bombard({ aim: [t.x, t.y], template: "small", hit: true });
  const celle = caselleDelTavolo(S).filter(c => c.u !== u);
  const cella = i => celle.find(x => x.cell === i);
  const sotto = SH.modelsUnder(celle, out.shape);
  const me = CB.combatant(u);
  const forza = me.baseS || me.s;
  if (conta){
    let attesa = 0, amici = 0, nem = 0;
    const tutte = new Set([...(sotto.full || []), ...(sotto.partial || []), ...(sotto.hole != null ? [sotto.hole] : [])]);
    for (const i of tutte){
      const c = cella(i);
      const chi = c && padroneDi(S, c);
      if (!chi) continue;
      const pieno = (sotto.full || []).includes(i) || i === sotto.hole;
      const d = CB.combatant(chi);
      const f = (pieno ? 1 : 0.5) * chanceOf(woundOn(forza, d.t)) *
                (1 - chanceOf(saveOn(d.armour, 2))) * (1 - chanceOf(saveOn(d.ward, 0))) * (1 - chanceOf(saveOn(d.regen, 0)));
      if (chi.army === u.army){ amici++; attesa -= f; } else { nem++; attesa += f; }
    }
    return { attesa, amici, nemici: nem, forza };
  }
  const conto = SH.templateHits(sotto);
  const dadi = conto.asks ? roll(conto.asks) : null;
  const colpi = dadi ? SH.templateHits(sotto, dadi) : SH.templateHits(sotto, []);
  const mucchi = new Map();
  for (const i of colpi.cells || []){
    const c = cella(i);
    const chi = c && padroneDi(S, c);
    if (!chi || chi.dead) continue;
    const g = mucchi.get(chi.uid) || { u: chi, n: 0 };
    g.n++;
    mucchi.set(chi.uid, g);
  }
  say(S, `${u.name} si abbatte su ${t.name}: valanga di carne, sagoma piccola sul centro. ` +
         `Sotto: ${colpi.full} del tutto, ${colpi.partial} in parte` +
         (mucchi.size ? ` — colpiti ${[...mucchi.values()].map(g => `${g.u.name}: ${g.n}`).join(", ")}.` : " — nessuno."),
      { dice: dadi || [], army: u.army, page: 144 });
  let fatte = 0;
  for (const g of mucchi.values()){
    const d = CB.combatant(g.u);
    const v = CB.strike(me, d, { attacks: g.n, auto: true, strength: forza, ap: 2, label: "valanga di carne" });
    const toll = CB.woundsToll(g.u, v.wounds, { carried: g.u.wounds || 0 });
    inizioFase(S, g.u);
    say(S, `${u.name} su ${g.u.name}: ${g.n} ${g.n === 1 ? "colpo" : "colpi"} a Forza ${forza} e PA −2, ` +
           `${v.wounds} ferit${v.wounds === 1 ? "a" : "e"}, ${toll.kills} a terra.`,
        { army: u.army, page: 144 });
    perdite(S, g.u, toll.kills, toll.left);
    if (nemici.includes(g.u)) fatte += v.wounds;
  }
  return fatte;
}

/* i maghi, per la fotografia */
function rigaMago(S, u){
  const M = magico(S), m = u.mago;
  if (!M || !m) return "";
  const sa = [...(m.level > 0 ? m.known : []), ...m.vincolati].map(id => M.spell(id)).filter(Boolean);
  if (!sa.length) return "";
  const chi = m.level > 0 ? `mago di Livello ${m.level}${m.lore ? ", " + M.lore(m.lore).name : ""}` : "incantesimo vincolato";
  return `      ${u.name}, ${chi}: ${sa.map(sp => sp.name + (MG.applies(sp) ? ` (${MG.TYPE_LABEL[sp.type]} ${sp.cv}+)` : " (da libro)")).join(", ")}` +
         (giaLanciati(S, u).length ? ` — già tentati in questo turno: ${giaLanciati(S, u).map(id => M.spell(id).name).join(", ")}` : "");
}

/* ============================================================
   7 bis · LE SFIDE (pp. 211-212)

   Di una sfida l'app sapeva fare una cosa sola: contare l'overkill.
   Chi la lancia, chi la raccoglie e chi la rifiuta sono decisioni, e
   le decisioni in questo arbitro si offrono — sono tre domande in
   sospeso, come la reazione alla carica e il dissolvimento.

   Le tre domande stanno nell'ordine del libro:

   1. «le sfide si lanciano quando un combattimento viene scelto»
      (p. 211), prima il giocatore di turno e poi l'altro, e una sola
      per combattimento;
   2. chi la subisce nomina chi la raccoglie, se ha qualcuno;
   3. chi rifiuta paga: il giocatore che l'ha lanciata nomina uno dei
      personaggi che avrebbero potuto raccoglierla, e quello **si
      ritira** — esce dal combattimento, non mena, non lo colpisce
      nessuno, e al suo reggimento non da' piu' niente.

   E una sfida cominciata non finisce con il turno: «se sopravvivono
   tutti e due e il combattimento continua, la sfida continua»
   (p. 212). Per questo sta nello stato (`S.sfide`) e non nel gesto.
   ============================================================ */
const SFIDA = 211;

/* Il modello e l'unita' in cui combatte: un capo unito combatte dentro
   il suo reggimento, un personaggio da solo e' l'unita'. */
function unitaDi(S, c){
  if (!c) return null;
  const h = FM.joinedHost(c);
  return h != null ? byUid(S, h) : c;
}
const vivo = u => !!u && !u.dead && alive(u) > 0;
const siToccano = (S, a, b) => !!a && !!b && a.uid !== b.uid && contatti(S).some(x =>
  (x.a === a.uid && x.b === b.uid) || (x.a === b.uid && x.b === a.uid));

/* Chi puo' lanciare o raccogliere una sfida, per una parte di un
   combattimento. «Il modello dev'essere nella prima fila o accanto ad
   essa» (p. 211): l'arbitro non tiene la posizione dentro il
   reggimento, e il libro dice pure che un capo che non e' in prima
   fila ci si sposta quando il combattimento viene scelto (p. 210) —
   quindi vale ogni personaggio delle unita' in mischia, tranne chi si
   e' gia' ritirato. I campioni d'unita' restano fuori, e non per
   scelta: il file dice che il gruppo di comando c'e' e non da' al
   campione un profilo suo (limite `campioni`). */
function sfidanti(S, g, army){
  const out = [];
  for (const u of (army === "A" ? g.A : g.B)){
    if (!onBoard(u) || !vivo(u)) continue;
    if (PREP.isCharacter(u) && !u.ritiro) out.push(u);
    for (const c of capiDi(S, u)) if (!c.ritiro && vivo(c)) out.push(c);
  }
  return out;
}

/* Chi puo' raccogliere la sfida di QUEL modello. Il libro e' preciso:
   «se nell'unita' nemica non ci sono personaggi o campioni, la sfida
   resta senza risposta» (p. 211) — l'unita' nemica, non tutta la parte.
   In un combattimento a piu' di due sono i personaggi delle unita' che
   il reggimento dello sfidante tocca davvero. */
function raccoglitori(S, g, sfidante){
  const suo = unitaDi(S, sfidante);
  const tutti = sfidanti(S, g, altro(sfidante.army));
  const vicini = tutti.filter(c => siToccano(S, unitaDi(S, c), suo));
  return vicini.length ? vicini : [];
}

/* «Talvolta una sfida e' impossibile da rifiutare» (p. 212): chi non
   sta dentro un'unita' o e' l'ultimo modello rimasto, e chi sta in
   un'unita' ingaggiata su tutti e quattro i lati. Il primo caso, qui,
   e' il personaggio da solo: un capo unito lo si stacca appena il
   reggimento cade (`perdite`), e da li' in poi e' un'unita' sua. */
const LATI = ["fronte", "retro", "fianco sinistro", "fianco destro"];
function circondata(S, u){
  const box = boxOf(u, S.units);
  const lati = new Set();
  for (const c of contatti(S)){
    const suo = c.a === u.uid ? c.b : c.b === u.uid ? c.a : null;
    if (suo == null) continue;
    const e = byUid(S, suo);
    if (!e || e.army === u.army) continue;
    /* Il lato lo dice dove sta il nemico INTERO, non il punto in cui le
       due basette si sfiorano. `contatti` porta anche quello (`aSide`),
       ed e' la risposta giusta a un'altra domanda: un reggimento largo
       appoggiato al fianco tocca anche lo spigolo davanti, il punto piu'
       vicino finisce li', e un'unita' presa su tre lati sembrava presa
       su uno. */
    const poly = cornersOf(e, S.units);
    const cx = poly.reduce((t, q) => t + q[0], 0) / poly.length;
    const cy = poly.reduce((t, q) => t + q[1], 0) / poly.length;
    lati.add(FM.sideOf([cx, cy], box));
  }
  return LATI.every(k => lati.has(k));
}
function puoRifiutare(S, c){
  const u = unitaDi(S, c);
  if (!u || u.uid === c.uid) return false;
  if (!vivo(u)) return false;
  return !circondata(S, u);
}

/* La sfida in corso in questo combattimento, se c'e'. */
function sfidaDi(S, g){
  const dentro = new Set([...g.A, ...g.B].map(u => u.uid));
  return (S.sfide || []).find(x => {
    const a = byUid(S, x.a), b = byUid(S, x.b);
    const ua = unitaDi(S, a), ub = unitaDi(S, b);
    return ua && ub && dentro.has(ua.uid) && dentro.has(ub.uid);
  }) || null;
}

/* Le sfide finite e i ritiri scaduti. Una sfida finisce quando uno dei
   due cade o quando le due unita' non si toccano piu'; chi si era
   ritirato torna in prima fila quando la sua unita' non e' piu'
   ingaggiata con il modello che l'aveva sfidato — «finche' la loro
   unita' e' ancora ingaggiata con il modello nemico che ha lanciato la
   sfida» (p. 211). */
function ripulisciSfide(S){
  S.sfide = (S.sfide || []).filter(x => {
    const a = byUid(S, x.a), b = byUid(S, x.b);
    if (!vivo(a) || !vivo(b)) return false;
    return siToccano(S, unitaDi(S, a), unitaDi(S, b));
  });
  for (const c of S.units){
    if (!c.ritiro) continue;
    const sf = byUid(S, c.ritiro.sfidante);
    if (vivo(c) && vivo(sf) && siToccano(S, unitaDi(S, c), unitaDi(S, sf))) continue;
    c.ritiro = null;
    if (!vivo(c)) continue;
    say(S, `${c.name} torna in prima fila: ${sf ? sf.name : "chi lo aveva sfidato"} non gli sta più addosso (p. 211).`,
        { army: c.army, page: SFIDA });
  }
}

/* Quanto promette un duello, in numeri: le ferite che ciascuno si
   aspetta di fare all'altro in un round — con la cavalcatura, le armi
   e le regole che porta addosso — contro quelle che l'altro ha ancora.
   Non e' la probabilita' di vincere la sfida: e' il conto che al tavolo
   si fa guardando i due profili, ed e' quello che serve a decidere se
   lanciarla, se raccoglierla, e se scappare.

   `vantaggio` e' la differenza fra le due: sopra zero il duello
   conviene, sotto zero lo si sta regalando. */
function duelloFra(S, mio, suo){
  const a = schieraDi(S, mio, { attached: isJoined(mio) });
  const b = schieraDi(S, suo, { attached: isJoined(suo) });
  const fa = CB.meleeForecast(a, b).wounds, prende = CB.meleeForecast(b, a).wounds;
  const mie = feriteDi(mio), sue = feriteDi(suo);
  const resta = f => Math.max(1, f.per - f.prese);
  const vantaggio = r1(fa / resta(sue) - prende / resta(mie));
  return {
    fa: r1(fa), prende: r1(prende), vantaggio,
    why: `${mio.name} fa ${r1(fa)} ferite a round a ${suo.name}, che ne ha ${resta(sue)}, e ne prende ${r1(prende)} delle sue ${resta(mie)}`,
  };
}
/* Il duello peggiore fra quelli che possono toccarmi: chi lancia la
   sfida non sceglie chi la raccoglie, e la sceglie l'altro. */
function duelloPeggiore(S, mio, loro){
  const tutti = loro.map(x => duelloFra(S, mio, x));
  return tutti.sort((a, b) => a.vantaggio - b.vantaggio)[0] || null;
}

/* ---- 1. lanciarla ---- */
function chiediSfida(S, uids, lato){
  const g = gruppoCon(S, uids);
  if (!g) return "";
  /* Una sfida che nessuno puo' raccogliere «resta senza risposta»
     (p. 211): e' legale e non cambia niente sul tavolo, e questo
     arbitro non offre gesti che non cambiano niente — come non offre
     gli incantesimi che non saprebbe applicare. Quindi si chiede solo
     a chi ha davanti qualcuno che possa rispondergli. */
  const miei = sfidanti(S, g, lato).map(c => ({ c, loro: raccoglitori(S, g, c) }))
                                   .filter(x => x.loro.length);
  if (!miei.length)
    return lato === S.army ? chiediSfida(S, uids, altro(S.army)) : "";
  S.pending = { kind:"sfida", uids, lato,
    list: [...miei.map(({ c, loro }) => {
             const d = duelloPeggiore(S, c, loro);
             return { id:"sfida", uid: c.uid, nome: c.name,
                      contro: loro.map(x => x.name).join(" o "),
                      vantaggio: d ? d.vantaggio : 0,
                      why: d ? `nel peggiore dei casi ${d.why}` : "",
                      page: SFIDA };
           }),
           { id:"nessuna", vantaggio: 0, why: lato === S.army
               ? "nessuna sfida: la può ancora lanciare l'altro" : "nessuna sfida", page: SFIDA }] };
  return `${S.nomi[lato]} può lanciare una sfida`;
}

/* ---- 2. raccoglierla, o rifiutarla ---- */
function chiediRaccolta(S, uids, sfidante){
  const g = gruppoCon(S, uids);
  const lato = altro(sfidante.army);
  const loro = g ? raccoglitori(S, g, sfidante) : [];
  if (!loro.length){
    /* «se nell'unita' nemica non ci sono personaggi o campioni, la
       sfida resta senza risposta» (p. 211) */
    say(S, `${sfidante.name} lancia una sfida e non c'è nessuno che possa raccoglierla (p. 211).`,
        { army: sfidante.army, page: SFIDA });
    return dopoLaSfida(S, uids);
  }
  /* Rifiutare si puo' solo se nessuno di quelli che potrebbero
     raccoglierla e' con le spalle al muro: chi non puo' scappare «deve
     affrontare la sfida del nemico» (p. 212), e allora il rifiuto non
     e' una risposta che quella parte possa dare. */
  const scappa = loro.every(c => puoRifiutare(S, c));
  S.pending = { kind:"raccogli", uids, sfidante: sfidante.uid, lato,
    list: [...loro.map(c => {
             const d = duelloFra(S, c, sfidante);
             return { id:"accetta", uid: c.uid, nome: c.name, contro: sfidante.name,
                      vantaggio: d.vantaggio, why: d.why, page: 212 };
           }),
           ...(scappa ? [{ id:"rifiuta", contro: sfidante.name,
             why: "nessuno la raccoglie: uno dei personaggi si ritira in fondo alle file e non combatte più",
             page: SFIDA }] : [])] };
  return `${S.nomi[lato]} risponde alla sfida di ${sfidante.name}` +
         (scappa ? "" : ": non c'è dove scappare (p. 212)");
}

/* ---- 3. chi si ritira ---- */
function chiediRitiro(S, uids, sfidante){
  const g = gruppoCon(S, uids);
  /* «uno dei personaggi che avrebbero potuto raccoglierla» (p. 211):
     non uno qualunque della parte */
  const loro = g ? raccoglitori(S, g, sfidante) : [];
  S.pending = { kind:"ritira", uids, sfidante: sfidante.uid,
    list: [...loro.map(c => ({ id:"ritira", uid: c.uid, nome: c.name, contro: sfidante.name,
             ld: CB.combatant(c).ld,
             why: `${c.name} (Comando ${CB.combatant(c).ld}) esce dal combattimento: non mena, non lo colpisce nessuno, e al suo reggimento non dà più né Comando né regole`,
             page: SFIDA })),
           { id:"nessuna", why:"nessuno si ritira", page: SFIDA }] };
  return `${S.nomi[sfidante.army]} sceglie chi si ritira`;
}

/* ============================================================
   8 · LA MISCHIA, DALLA PRIMA FERITA ALL'INSEGUIMENTO
   Qui l'arbitro non fa quasi niente: chiama `meleeFight` con i due
   gruppi — che e' esattamente la firma che questa tappa ha cambiato —
   e poi porta sul tavolo quello che torna. Le perdite, i test di rotta
   uno per unita', le mosse all'indietro, l'inseguimento.
   ============================================================ */
/* IL TERRENO QUANDO SI MENA (p. 159).
   Due voci, e l'arbitro non ne aveva nessuna.

   I RANGHI PERSI: «se un quarto o piu' dei modelli di un'unita' sta nel
   terreno difficile all'inizio della fase di combattimento, l'unita' e'
   Disrupted e non puo' reclamare il bonus dei ranghi». All'inizio della
   fase, non alla fine della carica: un reggimento che si e' fermato in
   un bosco due turni fa li perde ogni volta che mena. E il pericoloso e
   il bosco qui contano come difficile (`combatCat`).

   IL TERRENO PIU' ALTO (p. 152): un punto a chi ha la prima fila piu'
   in alto. Se lo reclamano tutti e due si annulla, e quel conto lo fa
   gia' `melee.js` — qui si dice soltanto chi ce l'ha.

   `combat.js` legge `u.disrupted` e `u.highGround` dalla schiera: le
   due bandierine c'erano da sempre e nessuno le accendeva. */
function terrenoInMischia(S, g){
  const difficile = S.terrain.filter(t => !t.decor && TR.combatCat(t).disorder);
  for (const u of [...g.A, ...g.B]){
    if (!onBoard(u)) continue;
    const d = CH.disruptedInTerrain(celleDi(S, u), difficile);
    if (d.disrupted && !u.disrupted)
      say(S, `${u.name}: ${d.why}`, { army: u.army, page: 159,
          x: { k: "terreno", t: "Scompigliata dal terreno", u: u.name, uid: u.uid,
               f: [{ t: d.why, f: "terreno" }], e: "niente bonus di ranghi in questo combattimento", ok: false } });
    u.disrupted = d.disrupted;

    const alto = filaPiuAlta(S, u);
    if (alto && !u.highGround)
      say(S, `${u.name} combatte con la prima fila sulla collina: +1 al risultato (p. 152).`,
          { army: u.army, page: 152,
            x: { k: "terreno", t: "Terreno più alto", u: u.name, uid: u.uid,
                 f: [{ t: "più di metà della prima fila sta sulla collina", f: "terreno" }],
                 e: "+1 al risultato del combattimento", ok: true } });
    u.highGround = alto;
  }
}

function mischia(S, g){
  for (const u of [...g.A, ...g.B]) u.fought = chiave(S);
  terrenoInMischia(S, g);
  /* La Paura quando il combattimento viene scelto: chi tocca un nemico
     che la fa ed e' piu' grosso tira, una volta per turno, e se
     fallisce ha −1 per colpire (p. 168). */
  const impauriti = new Set();
  for (const [miei, loro] of [[g.A, g.B], [g.B, g.A]]){
    for (const u of miei){
      if (!onBoard(u)) continue;
      const davanti = aContatto(S, u, loro);
      const chi = davanti.find(t => { const f = pauraDi(S, u, t, "combat"); return f.must || (f.already && !f.passed); });
      if (!chi) continue;
      const f = pauraDi(S, u, chi, "combat");
      let passata = f.already ? f.passed : true;
      if (f.must){
        const res = testPsico(S, u, "fear", PS.psychOf(u, { joined: capiInFila(S, u) }), f.why, 168);
        if (!res.auto) u.paura = { key: chiave(S), passed: res.passed };
        passata = res.passed;
      }
      if (!passata){
        impauriti.add(u.uid);
        if (davanti.length > 1) limite(S, "pauramischia");
        say(S, `${u.name} ha paura di ${chi.name}: −1 per colpire (p. 168).`, { army: u.army, page: 168 });
      }
    }
  }
  /* gli Abominable Attacks scelti prima: le ferite che fanno entrano
     nel risultato, e chi le ha fatte non attacca normalmente */
  const abomini = new Map();
  for (const [miei, loro] of [[g.A, g.B], [g.B, g.A]])
    for (const u of miei){
      const ab = u.abominio;
      if (!ab || ab.key !== chiave(S) || ab.scelta === "normali" || !onBoard(u)) continue;
      const t = byUid(S, ab.target);
      if (!t || t.dead){ abomini.set(u.uid, 0); continue; }
      const nemici = loro.flatMap(x => [x, ...capiInFila(S, x)]);
      abomini.set(u.uid, ab.scelta === "nutriti" ? nutriti(S, u, t) : valanga(S, u, t, { nemici }));
    }
  const conAbominio = (u, c) => {
    if (abomini.has(u.uid)){ c.noAttacks = true; c.randomA = null; c.preDealt = abomini.get(u.uid); }
    return c;
  };
  const A = g.A.map(u => conAbominio(u, schieraDi(S, u, { feared: impauriti.has(u.uid) })));
  const B = g.B.map(u => conAbominio(u, schieraDi(S, u, { feared: impauriti.has(u.uid) })));
  /* dove sta ogni modello nelle due parti: serve alla sfida, che e' fra
     due modelli e non fra due unita' */
  const posto = new Map();
  g.A.forEach((u, i) => posto.set(u.uid, i));
  g.B.forEach((u, i) => posto.set(u.uid, i));
  /* i personaggi uniti entrano nel gruppo come schiere loro (p. 209);
     chi si e' ritirato da una sfida non entra affatto (p. 211) */
  for (const [lista, sorgente] of [[A, g.A], [B, g.B]]){
    for (const u of sorgente)
      for (const c of capiInFila(S, u)){
        posto.set(c.uid, lista.length);
        lista.push(schieraDi(S, c, { attached: true, host: u, feared: impauriti.has(u.uid) }));
      }
  }
  /* La sfida, se c'e': i due si menano solo fra loro, in ordine di
     Iniziativa, e nessun altro puo' dirigere i colpi su di loro
     (p. 212). `meleeFight` vuole i due posti nelle due parti. */
  const duello = sfidaDi(S, g);
  const sfida = duello && posto.has(duello.a) && posto.has(duello.b)
    ? { a: posto.get(duello.a), b: posto.get(duello.b) } : null;
  if (sfida){
    const da = byUid(S, duello.a), db = byUid(S, duello.b);
    say(S, `${da.name} e ${db.name} si battono in sfida: i colpi vanno solo fra loro (p. 212).`,
        { army: S.army, page: 212 });
  }
  const round = (S.turno * 2) + (S.army === "A" ? 0 : 1);
  const r = CB.meleeFight(A, B, { round, challenge: sfida || false });

  /* ogni colpo finisce nel registro, anche quello andato a vuoto: una
     partita che racconta solo i colpi riusciti non insegna a leggere i
     dadi. I dadi sono tutti, ognuno nel suo mucchio: per colpire, per
     ferire, l'armatura, la salvezza speciale, quanti colpi automatici. */
  for (const x of r.randomA || [])
    say(S, `${x.name} tira gli attacchi (${x.text}): ${x.dice.join(" + ")} → ${x.attacks} ` +
           `${x.attacks === 1 ? "attacco" : "attacchi"} (Random Attacks).`,
        { dice: x.dice, army: x.side, page: 176 });
  for (const s of r.steps){
    const tutti = mucchi(s);
    say(S, `${s.name} ${s.label} su ${s.foe}: ${s.attacks} ${s.attacks === 1 ? "attacco" : "attacchi"}, ` +
           (s.hit.dice.length ? `${s.hit.hits} ${s.hit.hits === 1 ? "colpo" : "colpi"}, ` : "") +
           `${s.wounds} ferit${s.wounds === 1 ? "a" : "e"}, ${s.kills} a terra.`,
        { dice: tutti.flat, groups: tutti.groups, army: s.side === "A" ? "A" : "B", page: 144,
          x: { k: "mischia", u: `${s.name} → ${s.foe}`,
               passi: passiDi(s), f: (s.notes || []).filter(n => typeof n === "string").map(n => ({ t: n, f: "regola" })),
               e: `${s.wounds} ferit${s.wounds === 1 ? "a" : "e"}, ${s.kills} a terra`, ok: s.kills > 0 ? true : undefined } });
  }

  /* le perdite, unità per unità: chi muore si dice dopo il conto */
  const caduti = [];
  for (const tag of ["A", "B"]){
    const schiere = r.sides[tag];
    schiere.forEach((c, i) => {
      const u = c.ref;
      if (!u) return;
      const kills = r.kills[tag][i] || 0;
      if (perdite(S, u, kills, c.spill || 0, { zitto: true })) caduti.push(u);
    });
  }

  const nomi = l => l.map(u => u.name).join(" e ");
  const parti = sc => sc.parts.map(p => `${p.v} ${p.v === 1 ? p.one : p.many}`).join(" + ");
  say(S, `Risultato: ${nomi(g.A)} ${r.cr.A.total} (${parti(r.cr.A) || "niente"}) contro ` +
         `${nomi(g.B)} ${r.cr.B.total} (${parti(r.cr.B) || "niente"}).` +
         (r.cr.winner ? ` Vince ${r.cr.winner === "A" ? nomi(g.A) : nomi(g.B)} di ${r.cr.diff}.` : " Pareggio."),
      { page: ML.PAGE.multiple, army: r.cr.winner || "",
        x: { k: "risultato", u: `${nomi(g.A)} contro ${nomi(g.B)}`,
             f: [["A", g.A], ["B", g.B]].map(([tag, chi]) => ({
               t: `${nomi(chi)}: ${r.cr[tag].parts.map(p => `${p.v} ${p.v === 1 ? p.one : p.many}`).join(" + ") || "niente"} = ${r.cr[tag].total}`,
               f: "mischia" })).concat(
               [...r.cr.A.parts, ...r.cr.B.parts].some(p => p.id === "ground")
                 ? [{ t: "il terreno più alto vale un punto (p. 152)", f: "terreno" }] : []),
             e: r.cr.winner ? `vince ${r.cr.winner === "A" ? nomi(g.A) : nomi(g.B)} di ${r.cr.diff}` : "pareggio" } });
  for (const u of caduti) say(S, `${u.name}: non resta nessuno in piedi.`, { army: u.army });

  /* i test di rotta, uno per unita' che ha perso (p. 154) */
  for (const t of r.tests || []){
    const c = r.sides[t.side][t.at || 0];
    const u = c && c.ref;
    if (!u || !onBoard(u)) continue;
    const loro = (t.side === "A" ? g.B : g.A).filter(onBoard);
    say(S, `${u.name}: ${t.text}` + (c.ldGen ? ` [${c.ldGen}]` : ""), { dice: t.dice, army: u.army, page: t.page,
        x: xRotta(u, c, t) });
    /* chi perde e rompe, o ripiega in ordine, manda al Panico gli
       amici entro 6″ (p. 161): si misura prima che si muova */
    if (t.outcome === "rout" || t.outcome === "fallBack") ondaPanico(S, u, "broke", usConCapi(S, u));
    if (t.outcome === "rout"){
      const vincitore = piuVicino(S, u, loro) || loro[0];
      const { dadi, via } = tiroDiFuga(u);
      say(S, `${u.name} rompe e fugge di ${via}″.`, { dice: dadi, army: u.army, page: 132,
          x: xFuga(u, dadi, via, { da: vincitore, perche: "ha perso il test di rotta" }) });
      if (vincitore) fuggi(S, u, vincitore, via); else u.fled = true;
      /* e chi ha vinto insegue (p. 156) */
      inseguimento(S, vincitore, u, via);
    } else if (t.outcome === "give"){
      const vicini = aContatto(S, u, loro);
      const fatto = indietreggia(S, u, loro, CH.GIVE_GROUND, { kind: "give" });
      if (fatto) seguire(S, vicini, u, fatto);
    } else if (t.outcome === "fallBack"){
      /* 2D6 e si tiene il maggiore (p. 134): prima si sommavano */
      const dadi = roll(2);
      const quanto = Math.max(...dadi);
      say(S, `${u.name} ripiega in ordine: ${dadi.join(", ")}, si tiene il maggiore.`,
          { dice: dadi, army: u.army, page: 134,
            x: { k: "ripiega", u: u.name, uid: u.uid, tot: quanto, via: scartati(dadi, [quanto]),
                 f: [{ t: "2D6, si tiene il maggiore (p. 134)", f: "regola" }],
                 e: `ripiega di ${quanto}″, girata verso il nemico` } });
      indietreggia(S, u, loro, quanto, { kind: "fallBack" });
      limite(S, "seguire");
    }
  }
  /* chi ha vinto e non ha piu' nessuno davanti sfonda */
  if (r.wiped){
    const vincitori = r.wiped === "A" ? g.B : g.A;
    for (const w of vincitori)
      if (onBoard(w)) say(S, `${w.name} sfonda: davanti non è rimasto nessuno (p. 156).`,
                          { army: w.army, page: 156 });
  }
  return "combattimento risolto";
}

/* La scheda del test di rotta (p. 154). E' quella che risponde a
   «perche' i Clanrats scappano?», e la risposta ha sempre tre pezzi: i
   dadi, lo scarto con cui hanno perso, e il Comando — che spesso non e'
   il loro. Le tre fasce si scrivono, perche' il libro ne ha tre e non
   due: con la somma tiene, con i soli dadi ripiega, sopra scappa. */
function xRotta(u, c, t){
  const base = { k: "rotta", u: u.name, uid: u.uid };
  if (t.unbreakable || t.stubborn)
    return { ...base, f: [{ t: t.text, f: "regola" }], e: t.verb || t.label || "", ok: true };
  const f = [];
  f.push(c.ldGen ? { t: c.ldGen, f: "generale" } : { t: `Comando ${t.ld - (t.ldMod || 0)} dell'unità`, f: "profilo" });
  if (t.terror) f.push({ t: t.terror, f: "regola" });
  if (t.insane) f.push({ t: "doppio uno: tiene i nervi qualunque sia lo scarto", f: "dadi" });
  else if (t.outcome === "give") f.push({ t: `dadi più scarto ${t.modified} entro il Comando ${t.ld}: cede terreno`, f: "mischia" });
  else if (t.outcome === "rout" && !t.keptNerve)
    f.push({ t: `già i soli dadi (${t.natural}) superano il Comando ${t.ld}: va in rotta`, f: "mischia" });
  else if (t.blocked) f.push({ t: "chi ha vinto ha più del doppio della Forza d'Unità: non può ripiegare", f: "mischia" });
  else f.push({ t: `i soli dadi (${t.natural}) stanno nel Comando, con lo scarto no: ripiega in ordine`, f: "mischia" });
  if (t.shieldwall) f.push({ t: "Shieldwall: cede terreno invece di ripiegare", f: "regola" });
  return { ...base, tot: t.natural, piu: t.diff ? [{ t: `perso di ${t.diff}`, v: t.diff }] : [],
           vs: { v: t.ld, op: "<=", t: "Comando" }, f,
           e: t.label || t.verb || "", ok: t.outcome === "give" ? true : t.outcome === "rout" ? false : undefined };
}

/* I tiri in fila di un attacco, per la scheda: colpire, ferire,
   armatura, speciale, rigenerazione. */
function passiDi(s){
  const out = [];
  if (s.autoDice && s.autoDice.length) out.push({ t: "quanti", d: s.autoDice });
  for (const [k, t] of [["hit", "colpire"], ["wound", "ferire"], ["save", "armatura"],
                        ["ward", "speciale"], ["regen", "rigenerazione"]]){
    const p = s[k];
    if (!p || !p.dice || !p.dice.length || +p.need >= 7) continue;
    out.push({ t: k === "save" || k === "ward" || k === "regen" ? t + " (salva)" : t, serve: +p.need || 0, d: p.dice });
  }
  return out;
}

/* I dadi di un colpo, mucchio per mucchio, e tutti in fila per chi
   legge solo la fila. */
function mucchi(s){
  const groups = [];
  if (s.autoDice && s.autoDice.length) groups.push({ what: "quanti", dice: s.autoDice });
  for (const [k, what] of [["hit", "colpire"], ["wound", "ferire"], ["save", "armatura"],
                           ["ward", "speciale"], ["regen", "rigenerazione"]]){
    const p = s[k];
    /* un tiro salvezza che il bersaglio non ha si tira lo stesso a
       7+, e non va mostrato: e' rumore, non un dado della partita */
    if (!p || !p.dice || !p.dice.length || +p.need >= 7) continue;
    groups.push({ what: p.need ? `${what} ${p.need}+` : what, dice: p.dice });
  }
  return { groups, flat: groups.flatMap(x => x.dice) };
}

/* chi, fra i nemici del gruppo, tocca ancora quest'unita' */
function aContatto(S, u, loro){
  const mio = cornersOf(u, S.units);
  return loro.filter(o => polyDistance(mio, cornersOf(o, S.units)) <= MM * 0.15);
}

/* La schiera che combatte, con addosso quello che il tavolo sa: chi ha
   caricato e da che faccia, il terreno, i personaggi uniti. */
function schieraDi(S, u, { attached = false, host = null, feared = false } = {}){
  const c = CB.combatant(u, { joined: capiInFila(S, u), feared });
  /* il test di rotta si tira con il Comando piu' alto fra i modelli
     (p. 97) o con quello del generale, se e' vicino: si rifa' il conto
     della Warband sopra il valore nuovo */
  const proprio = attached ? { ld: +(c.ldBase || c.ld) || 0, chi: "" } : ldProprio(S, u);
  const gen = comandoDi(S, attached && host ? host : u, proprio.ld);
  if (!gen.why && proprio.chi) gen.why = `Comando ${proprio.ld} di ${proprio.chi}, che ci sta dentro (p. 97)`;
  if (gen.why){
    const ranks = c.disrupted ? 0 : rankBonus(c.models, c.frontage,
      c.troop ? c.troop.maxRank : 2, c.troop ? c.troop.perRank : 5);
    const lead = PS.leadershipOf(gen.ld, c.psych, { rankBonus: ranks, fleeing: !!u.fled });
    if (lead.value > c.ld){ c.ld = lead.value; c.ldGen = gen.why; }
  }
  if (attached){
    c.attached = true; c.shielded = true;
    const truppa = host ? alive(host) : 0;
    c.exposed = truppa > 0 && truppa < 5;
  }
  return c;
}

/* Cedere terreno e ripiegare in ordine (p. 134).

   La direzione e' quella di `charge.js`: via dal nemico con la Forza
   d'Unita' piu' alta, e in diagonale quando sono due alla pari.

   Chi CEDE TERRENO si ferma dove il libro dice — un'altra unita', un
   pollice da un nemico — e contro il bordo, che il libro non nomina:
   l'arbitro lo ferma li', ed e' una scelta dichiarata (`bordo`).

   Chi RIPIEGA IN ORDINE «si muove esattamente come un'unita' in fuga»:
   passa attraverso, non si ferma dentro nessuno, e se tocca il bordo
   esce (p. 132). Resta girato verso il nemico e non fugge.

   Prima di questa versione il controllo del bordo leggeva `p.x` e `p.y`
   da angoli che sono coppie `[x, y]`: ogni unita' risultava fuori dal
   tavolo anche al centro, chi cedeva terreno restava fermo e chi
   ripiegava in ordine usciva dalla partita. Una Temple Guard intera e'
   sparita cosi', a mezzo tavolo dal bordo.

   Torna lo spostamento fatto, che serve a chi segue. */
function indietreggia(S, u, nemici, pollici, { kind = "give" } = {}){
  const box = boxOf(u, S.units);
  const dir = CH.awayFrom(box, nemici.map(o => ({ name: o.name, box: boxOf(o, S.units), us: usOf(o) })));
  if (!dir) return null;
  const [ux, uy] = dir.dir;
  const x0 = u.x, y0 = u.y;
  if (kind === "give"){
    const p = percorso(S, u, [u.x + ux * 1000 * MM, u.y + uy * 1000 * MM], pollici,
                       { rot: u.rot || 0, devia: false, bordo: true });
    posa(S, u, p.x, p.y, u.rot);
    const corto = p.pollici < pollici - 0.05;
    if (corto && p.stop && p.stop.chi == null) limite(S, "bordo");
    say(S, `${u.name} cede terreno di ${p.pollici}″` +
           (dir.from.length ? ` lontano da ${dir.from.join(" e ")}` : "") +
           (corto && p.stop ? `: si ferma contro ${p.stop.perche}` : "") + ".",
        { army: u.army, page: 134 });
    return { dx: u.x - x0, dy: u.y - y0 };
  }
  /* ripiegare: come la fuga, senza girarsi */
  let mm = pollici * MM;
  const at = s => ({ ...box, x: x0 + ux * s, y: y0 + uy * s });
  while (ingombro(S, u, at(mm), { unPollice: false, bordo: false }) && dentroTavolo(S, boxCorners(at(mm))))
    mm += PASSO;
  const b = at(mm);
  const passati = attraversati(S, u, at, mm);
  const usPrima = usConCapi(S, u);
  posa(S, u, b.x, b.y, u.rot);
  /* chi ripiega in ordine attraversando un amico lo manda al Panico
     come chi fugge (p. 161) */
  for (const o of passati) testPanico(S, o, "fledThrough", { fonte: u });
  if (!dentroTavolo(S, boxCorners(b))){
    u.dead = true; u.placed = false; u.fledOff = true;
    posa(S, u, u.x, u.y, u.rot);
    say(S, `${u.name} ripiega di ${r1(inch(mm))}″, oltre il bordo, ed esce dal tavolo (pp. 132, 134).`,
        { army: u.army, page: 134 });
    ondaPanico(S, u, "destroyed", usPrima);
    return null;
  }
  say(S, `${u.name} ripiega di ${r1(inch(mm))}″` +
         (dir.from.length ? ` lontano da ${dir.from.join(" e ")}` : "") +
         (mm > pollici * MM + 0.5 ? ", oltre chi aveva dietro" : "") + ".",
      { army: u.army, page: 134 });
  return { dx: u.x - x0, dy: u.y - y0 };
}

/* Chi ha vinto segue chi cede terreno, dello stesso tratto, e il
   combattimento continua al turno dopo senza una carica nuova. Prima
   nessuno seguiva: il vincitore restava fermo, il perdente due pollici
   piu' in la', e al turno dopo lo stesso reggimento «caricava» da
   mezzo pollice. Segue solo chi non ha altri nemici addosso, e solo se
   c'e' posto. */
function seguire(S, vicini, perdente, { dx, dy }){
  if (!onBoard(perdente) || Math.hypot(dx, dy) < 0.5) return;
  limite(S, "seguire");
  for (const w of vicini){
    if (!onBoard(w) || w.fled) continue;
    const altri = aContatto(S, w, nemiciDi(S, w).filter(o => o !== perdente));
    if (altri.length) continue;
    const dove = { ...boxOf(w, S.units), x: w.x + dx, y: w.y + dy };
    const blocco = ingombro(S, w, dove, { ignora: [perdente.uid], unPollice: false });
    if (blocco){
      say(S, `${w.name} non può seguire: c'è ${blocco.perche}.`, { army: w.army, page: 134 });
      continue;
    }
    posa(S, w, dove.x, dove.y, w.rot);
    say(S, `${w.name} segue ${perdente.name} e resta a contatto.`, { army: w.army, page: 134 });
  }
}

/* L'inseguimento (p. 156): chi ha vinto tira, e si muove davvero —
   prima restava fermo anche quando travolgeva. Non insegue chi ha
   ancora un altro nemico addosso. */
function inseguimento(S, vincitore, fuggito, quantoHaFuggito){
  if (!vincitore || !onBoard(vincitore) || vincitore.fled) return;
  /* una macchina da guerra non fa mosse d'inseguimento (p. 197) */
  if (macchina(vincitore)){
    say(S, `${vincitore.name} non insegue: è una macchina da guerra (p. 197).`,
        { army: vincitore.army, page: 197 });
    return;
  }
  const altri = aContatto(S, vincitore, nemiciDi(S, vincitore).filter(o => o !== fuggito));
  if (altri.length){
    say(S, `${vincitore.name} non insegue: combatte ancora con ${altri.map(o => o.name).join(" e ")}.`,
        { army: vincitore.army, page: ML.PAGE.pursuit });
    return;
  }
  const spec = ML.pursuitDice(MV.swiftOf(vincitore));
  const dadi = roll(spec.n);
  const tot = dadi.reduce((s, v) => s + v, 0);
  const out = ML.pursuitOutcome({ roll: tot, flee: quantoHaFuggito, wiped: false });
  const uscita = !!fuggito.fledOff;
  say(S, uscita ? `${vincitore.name} insegue di ${tot}″: ${fuggito.name} è già fuori dal tavolo.`
                : `${vincitore.name} ${out.text}.`,
      { dice: dadi, army: vincitore.army, page: ML.PAGE.pursuit,
        x: { k: "inseguimento", u: `${vincitore.name} → ${fuggito.name}`, uid: vincitore.uid, su: fuggito.uid, tot,
             vs: uscita ? null : { v: quantoHaFuggito, op: ">=", t: `quanto ha fuggito ${fuggito.name}` },
             f: [{ t: "chi insegue tira come chi fugge, e se arriva almeno fin lì lo travolge", f: "regola" },
                 ...(dadi.length > 2 ? [{ t: "Swiftstride: un D6 in più (p. 178)", f: "regola" }] : [])],
             e: uscita ? `${fuggito.name} è già fuori dal tavolo` : out.caught ? `${fuggito.name} travolta e distrutta` : "non la prende",
             ok: uscita ? undefined : !!out.caught } });
  if (out.caught && !uscita){
    const usF = usConCapi(S, fuggito);
    fuggito.dead = true; fuggito.placed = false;
    posa(S, fuggito, fuggito.x, fuggito.y);
    say(S, `${fuggito.name} è travolta e distrutta.`, { army: fuggito.army, page: ML.PAGE.pursuit });
    ondaPanico(S, fuggito, "destroyed", usF);
  }
  /* il passo di chi insegue: verso dove l'altro e' andato, fermandosi
     a contatto con un nemico nuovo se lo incontra */
  const p = muoviVerso(S, vincitore, fuggito, tot, { ignora: [fuggito.uid], unPollice: false });
  if (p.pollici > 0)
    say(S, `${vincitore.name} avanza di ${p.pollici}″ inseguendo` +
           (p.stop && p.stop.chi && p.stop.chi.army !== vincitore.army ? ` e arriva addosso a ${p.stop.chi.name}` : "") + ".",
        { army: vincitore.army, page: ML.PAGE.pursuit });
}


/* ============================================================
   9 · IL TEMPO CHE PASSA
   Le caselle, i turni, e la fine. Un passo avanti si fa quando chi
   gioca ha finito, e l'arbitro non lo fa da solo: la partita e' di chi
   la gioca, anche quando chi la gioca e' una macchina.
   ============================================================ */
/* ============================================================
   CHI COMINCIA (p. 285, p. 289; Battle March pp. 26-27)
   Prima questo pezzo non c'era: A schierava per prima e muoveva per
   prima in ogni partita, e ogni partita fra due macchine lo
   ereditava. Trecento partite dicevano «O&G vince il 75%» e non si
   poteva sapere quanto di quel numero fosse l'esercito e quanto il
   primo turno, che le liste da tiro e da magia pagano care.

   Il libro fa due tiri, e i due manuali li fanno diversi:

     CORE (p. 285) chi vince il primo tiro SCEGLIE chi schiera la
       prima unita'. A schieramento finito (p. 289, ed e' la stessa
       riga in tutti gli scenari del libro) si tira ancora, chi ha
       finito di schierare per primo aggiunge 1, e chi vince muove per
       primo: qui non c'e' scelta.
     BATTLE MARCH (p. 26) chi vince il primo tiro schiera la prima
       unita', senza scegliere; e a schieramento finito (p. 27) chi
       vince il secondo SCEGLIE chi muove per primo, senza +1.

   Le scelte sono gesti, come tutte: l'arbitro le chiede a chi ha
   vinto (`pending.kind === "primo"`), e «passo» vuol dire «io». Lo
   scenario che dice «questo esercito comincia comunque» (p. 289, gli
   Orchi di L'Anguille) non c'e' fra quelli che l'app conosce; chi
   vuole una parte fissa la da' a `newBattle({ primo })`.
   ============================================================ */
export const PAGINE_PRIMO = { core: { schiera: 285, turno: 289 }, bm: { schiera: 26, turno: 27 } };
const libroPrimo = S => S.formato === "bm" ? "bm" : "core";

/* Un tiro a chi fa di piu', rifatto finche' e' pari; `piu` e' chi ha il
   +1 per aver finito di schierare */
function tiroAChiFaDiPiu(S, piu = null){
  const volte = [];
  for (let i = 0; i < 50; i++){
    const [a] = roll(1), [b] = roll(1);
    const ta = a + (piu === "A" ? 1 : 0), tb = b + (piu === "B" ? 1 : 0);
    volte.push({ A: a, B: b });
    if (ta !== tb) return { vince: ta > tb ? "A" : "B", volte, piu };
  }
  return { vince: "A", volte, piu };
}
const scriviTiro = (S, t) => t.volte
  .map(v => `${S.nomi.A} ${v.A}${t.piu === "A" ? "+1" : ""}, ${S.nomi.B} ${v.B}${t.piu === "B" ? "+1" : ""}`)
  .join(" — pari, si ritira: ");

function opzioniPrimo(S, cosa, lato, page){
  const verbo = cosa === "schiera" ? "schiera la prima unità" : "muove per primo";
  return ["A", "B"].map(chi => ({
    id: "primo", cosa, chi, nome: S.nomi[chi],
    why: `${S.nomi[chi]} ${verbo}` + (cosa === "schiera"
      ? (chi === lato ? ": chi finisce di schierare per primo ha +1 al tiro per il primo turno"
                      : ": si schiera vedendo cosa ha già messo l'altro")
      : chi === lato ? ": tira e muove prima che l'altro si sia avvicinato"
                     : ": vede la prima mossa dell'altro, e ha l'ultima parola sugli obiettivi"),
    page }));
}

function apriSchieramento(S){
  const libro = libroPrimo(S), pg = PAGINE_PRIMO[libro];
  const t = tiroAChiFaDiPiu(S);
  S.tiriPrimo.push({ cosa: "schiera", ...t });
  S.army = t.vince;
  if (libro === "bm"){
    S.chiSchiera = t.vince;
    say(S, `Tiro per lo schieramento: ${scriviTiro(S, t)}. ${S.nomi[t.vince]} schiera la prima unità (Battle March p. ${pg.schiera}).`,
        { page: pg.schiera });
    return;
  }
  say(S, `Tiro per lo schieramento: ${scriviTiro(S, t)}. ${S.nomi[t.vince]} sceglie chi schiera la prima unità (p. ${pg.schiera}).`,
      { page: pg.schiera });
  S.pending = { kind: "primo", cosa: "schiera", lato: t.vince, page: pg.schiera,
                list: opzioniPrimo(S, "schiera", t.vince, pg.schiera) };
}

function sceltaPrimo(S, a){
  const p = S.pending;
  if (!p || p.kind !== "primo" || !a || (a.chi !== "A" && a.chi !== "B")) return no("non c'è da scegliere chi comincia");
  S.pending = null;
  const chi = a.chi === p.lato ? "se stesso" : S.nomi[a.chi];
  if (p.cosa === "schiera"){
    S.chiSchiera = a.chi; S.army = a.chi;
    say(S, `${S.nomi[p.lato]} fa schierare per primo ${chi}.`, { army: p.lato, page: p.page });
    return si(`${S.nomi[a.chi]} schiera per primo`);
  }
  S.primo = a.chi;
  say(S, `${S.nomi[p.lato]} fa cominciare ${chi}.`, { army: p.lato, page: p.page });
  iniziaBattaglia(S);
  return si(`${S.nomi[a.chi]} muove per primo`);
}

/* chi finisce di schierare per primo: si guarda ogni volta che una
   parte ha messo qualcosa (o ha rinunciato), prima di passare la mano */
function segnaChiHaFinito(S){
  if (S.finitoPrima) return;
  for (const a of [S.army, altro(S.army)]) if (!daSchierare(S, a)){ S.finitoPrima = a; return; }
}

function fineSchieramento(S){
  if (S.primoFisso) return iniziaBattaglia(S);
  const libro = libroPrimo(S), pg = PAGINE_PRIMO[libro];
  const t = tiroAChiFaDiPiu(S, libro === "core" ? S.finitoPrima : null);
  S.tiriPrimo.push({ cosa: "turno", ...t });
  if (libro === "core"){
    S.primo = t.vince;
    say(S, `Tiro per il primo turno: ${scriviTiro(S, t)}` +
           (S.finitoPrima ? ` (${S.nomi[S.finitoPrima]} ha finito di schierare per primo)` : "") +
           `. Comincia ${S.nomi[t.vince]} (p. ${pg.turno}).`, { page: pg.turno, army: t.vince,
        x: { k: "primo", testo: scriviTiro(S, t),
             f: t.piu ? [{ t: `${S.nomi[t.piu]} ha finito di schierare per primo: +1 al tiro`, f: "regola" }] : [],
             e: `comincia ${S.nomi[t.vince]}` } });
    return iniziaBattaglia(S);
  }
  S.army = t.vince;
  say(S, `Tiro per il primo turno: ${scriviTiro(S, t)}. ${S.nomi[t.vince]} sceglie chi comincia (Battle March p. ${pg.turno}).`,
      { page: pg.turno, army: t.vince,
        x: { k: "primo", testo: scriviTiro(S, t),
             f: t.piu ? [{ t: `${S.nomi[t.piu]} ha finito di schierare per primo: +1 al tiro`, f: "regola" }] : [],
             e: `${S.nomi[t.vince]} sceglie chi comincia` } });
  S.pending = { kind: "primo", cosa: "turno", lato: t.vince, page: pg.turno,
                list: opzioniPrimo(S, "turno", t.vince, pg.turno) };
}

function iniziaBattaglia(S){
  S.schierando = false;
  S.army = S.primo;
  S.casella = 0;
  S.turno = 1;
  for (const u of S.units) u.anchor = null;
  say(S, `Schieramento finito: comincia il turno 1, muove ${S.nomi[S.army]}.`, { page: 115 });
  limitiDiPartenza(S);
  inizioTurno(S);
}

/* La sotto-fase d'inizio turno: il test di Stupidita' di chi ce l'ha,
   salvo che fugga o combatta. Chi fallisce ci resta fino al suo
   prossimo inizio di turno, che e' dove l'effetto scade e il test si
   rifa'. Non e' una scelta: l'arbitro lo tira da solo. */
/* ---- l'Arca di Sotek (Renegades) ----
   Due regole del Bastiladon che non sono gesti ma cose che succedono:
   nessuno le sceglie, e l'arbitro le fa accadere nel loro momento.

   Slithering Serpents: «nella fase di tiro del suo turno, ogni unita'
   nemica entro D6″ da questo modello subisce 2D6 colpi a Forza 2,
   perforazione -, con Poisoned Attacks». Un D6 solo per la distanza,
   2D6 per ciascun nemico dentro. Il veleno resta scritto e non scatta:
   vuole un 6 per colpire, e questi colpi arrivano senza tirare.

   Spawn of Sotek: «nella sotto-fase di comando, con 4+ su un D6, uno
   Jungle Swarm entro 6″ recupera D3 ferite perse». L'arbitro guarisce
   le ferite appese, non rimette in piedi basette gia' tolte: e' il
   limite `sciami`, e finche' nessuna lista schiera Jungle Swarm non
   pesa su niente. */
const haRegola = (u, re) => ((u && u.rules) || []).some(r => re.test(String(r)));

function serpenti(S){
  for (const u of inCampo(S, S.army)){
    if (!haRegola(u, /^slithering serpents/i) || u.serpenti === chiave(S)) continue;
    u.serpenti = chiave(S);
    const [raggio] = roll(1);
    const presi = nemiciDi(S, u).filter(t => distanza(S, u, t) <= raggio);
    say(S, `${u.name}, Slithering Serpents: i serpenti arrivano a ${raggio}″` +
           (presi.length ? `, e prendono ${presi.map(t => t.name).join(", ")}.` : ": nessun nemico così vicino."),
        { dice: [raggio], army: u.army, page: 136 });
    for (const t of presi){
      const dadi = roll(2);
      const n = dadi[0] + dadi[1];
      colpisci(S, t, { S: 2, AP: 0 }, n, "Slithering Serpents", { da: u });
    }
  }
}

function spawnOfSotek(S){
  for (const u of inCampo(S, S.army)){
    if (!haRegola(u, /^spawn of sotek/i)) continue;
    const sciami = inCampo(S, S.army).filter(t => /jungle swarm/i.test(t.baseName || t.name) &&
                                                  (t.wounds || 0) > 0 && distanza(S, u, t) <= 6);
    if (!sciami.length) continue;
    const [d] = roll(1);
    if (d < 4){
      say(S, `${u.name}, Spawn of Sotek: ${d}, niente.`, { dice: [d], army: u.army, page: 115 });
      continue;
    }
    const t = sciami.reduce((a, b) => (b.wounds || 0) > (a.wounds || 0) ? b : a);
    const [g] = roll(1);
    const quante = Math.min(t.wounds || 0, Math.ceil(g / 2));
    t.wounds = (t.wounds || 0) - quante;
    limite(S, "sciami");
    say(S, `${u.name}, Spawn of Sotek: ${d}, e ${t.name} recupera ${quante} ferit${quante === 1 ? "a" : "e"}.`,
        { dice: [d, g], army: u.army, page: 115 });
  }
}

function inizioTurno(S){
  /* Le sfide e i ritiri si rileggono in testa al turno, e non solo
     quando si sceglie un combattimento: uno sfidante puo' essere caduto
     sotto un tiro, e chi si era ritirato deve tornare in prima fila
     appena quel nemico non gli sta piu' addosso (p. 211). Senza questa
     riga il suo Comando restava fuori dai test di Panico di mezzo turno. */
  ripulisciSfide(S);
  spawnOfSotek(S);
  for (const u of inCampo(S, S.army)){
    const p = PS.psychOf(u, { joined: capiInFila(S, u) });
    const c = PS.stupidityCheck({ p, fleeing: !!u.fled, engaged: ingaggiata(S, u) });
    if (!c.must) continue;
    limite(S, "stupidita");
    const res = testPsico(S, u, "stupidity", p, "all'inizio del turno", 178);
    if (!res.passed){
      EF.addEffect(u, PS.stupidEffect({ turn: S.turno, side: S.army }));
      say(S, `${u.name} è in preda alla Stupidità: fino al suo prossimo turno non si muove, non tira, non lancia, e se caricata tiene la posizione.`,
          { army: u.army, page: 178 });
    }
  }
}

/* I limiti che valgono per tutta la partita si dicono subito, se le
   liste li toccano: prima si dicevano solo quelli che scattavano, e
   una partita con un mago e un reggimento di Troll finiva con un piede
   di pagina che non nominava né la magia né la Stupidità. */
function limitiDiPartenza(S){
  const campo = S.units.filter(u => u.placed);
  /* la magia si gioca: quando i domini mancano l'ha gia' detto
     `preparaMaghi`, con il limite «domini» */
  if (campo.some(u => { const p = PS.psychOf(u); return p.frenzy || p.impetuous; })) limite(S, "frenesia");
  if (campo.some(u => puoUnirsi(S, u))) limite(S, "solitari");
  /* una macchina che spara a bombardata e di cui i libri in casa non
     dicono la sagoma non sparerà mai: e' una riga di partita intera,
     e si dice subito invece che a ogni fase di tiro in silenzio */
  if (campo.some(u => CB.rangedWeapons(u).some(w => { const b = SH.bombardOf(w); return b && !b.known; })))
    limite(S, "bombardata");
}

/* Chi non si e' radunato continua a fuggire nelle mosse (p. 132): il
   registro lo prometteva e nessuno lo faceva, e un'unita' che falliva
   il raduno restava ferma dov'era come se niente fosse. Non e' una
   scelta, e non passa da chi gioca. */
function continuaAFuggire(S){
  for (const u of inCampo(S, S.army)){
    if (!u.fled || u.moved) continue;
    const da = piuVicino(S, u);
    if (!da) continue;
    const { dadi, via, testo } = tiroDiFuga(u);
    say(S, `${u.name} non si è radunata e continua a fuggire: ${testo} = ${via}″ lontano da ${da.name}.`,
        { dice: dadi, army: u.army, page: 132,
          x: xFuga(u, dadi, via, { da, perche: "non si è radunata: chi fugge continua a fuggire" }) });
    fuggi(S, u, da, via);
  }
}

function passo(S){
  /* «avanti» mentre si generano gli incantesimi: si tiene quello che e'
     uscito, o si prende il primo dominio dell'elenco — e lo si scrive */
  if (S.preparando){
    const u = daPreparare(S);
    if (u && u.mago.fase === "dominio"){ sceltaDominio(S, { uid: u.uid, lore: u.mago.domini[0] }); return "dominio preso d'ufficio"; }
    if (u){ tieniIncantesimi(S, { uid: u.uid }); return "incantesimi tenuti"; }
    S.preparando = false;
  }
  if (S.schierando){
    /* «avanti» durante lo schieramento vuol dire «questa non la
       schiero»: si passa all'altro, e se nessuno ha piu' niente si
       comincia */
    const mia = daSchierare(S);
    if (mia){
      /* Chi resta fuori si scrive, con il perche' in pollici. Prima
         spariva in silenzio: nessuna riga, e una lista giocava intere
         serie senza un'unita' che nessuno sapeva mancare. */
      const why = postiPer(S, mia).length ? "chi gioca ha scelto di non schierarla" : perchéFuori(S, mia);
      mia.placed = false; mia.rinuncia = true;
      S.fuori.push({ uid: mia.uid, army: mia.army, name: mia.name, pts: mia.pts || 0, why });
      limite(S, "fuori");
      say(S, `${mia.name} (${mia.pts || 0} pt) non si schiera e resta fuori dalla partita: ${why}. ` +
             `Non combatte, e nel conto dei punti vittoria non la perde nessuno.`,
          { army: mia.army, page: 115, kind: "fuori" });
    }
    segnaChiHaFinito(S);
    S.army = S.army === "A" ? "B" : "A";
    if (!daSchierare(S)){
      S.army = S.army === "A" ? "B" : "A";
      if (!daSchierare(S)){ fineSchieramento(S); return "schieramento finito"; }
    }
    return "passa";
  }
  /* chi si muove di quanto tira non puo' restare fermo (p. 176) */
  if (CASELLE[S.casella] && CASELLE[S.casella].id === "mosse") vaganoDaSoli(S);
  S.casella++;
  if (S.casella < CASELLE.length){
    if (CASELLE[S.casella].id === "mosse") continuaAFuggire(S);
    if (CASELLE[S.casella].id === "tiro") serpenti(S);
    return `si passa a: ${CASELLE[S.casella].what}`;
  }

  /* fine del turno di questa parte: si guarda chi tiene gli
     obiettivi (Battle March p. 27, «at the end of each player's turn») */
  segnaObiettivi(S);
  S.casella = 0;
  for (const u of S.units){ u.moved = null; u.shot = false; u.charged = null; u.unito = null; }
  if (S.army !== S.primo){
    S.turno++;
    S.army = S.primo;
  } else {
    S.army = S.army === "A" ? "B" : "A";
  }
  if (S.rounds && S.turno > S.rounds){ fine(S, "sono finiti i turni"); return "partita finita"; }
  /* gli effetti degli incantesimi scadono quando il libro lo dice: a
     fine turno, o al prossimo inizio turno di chi li ha lanciati */
  for (const u of S.units){
    for (const e of EF.sweepExpired(u, { turn: S.turno, side: S.army }))
      say(S, `${u.name}: finisce ${e.from}.`, { army: u.army, page: e.page || MG.PAGE.resolution });
  }
  /* il punto di rottura si guarda adesso, che e' l'inizio di un turno */
  if (controllaFine(S, { inizioTurno: true })) return "partita finita";
  say(S, `Turno ${S.turno}: muove ${S.nomi[S.army]}.`, { page: 114 });
  inizioTurno(S);
  return `turno ${S.turno}, tocca a ${S.nomi[S.army]}`;
}

/* ============================================================
   10 · CHI HA VINTO
   I punti vittoria li conta `victory.js`, che sa il formato: nel Core
   Rulebook servono 100 punti di scarto (p. 286), in Battle March vince
   chi ne ha di piu' (p. 27). Il formato si legge dallo scenario — la
   stringa `S.scenario` non ha il gruppo, e per mesi ogni partita
   Battle March e' stata giudicata con lo scarto del Core Rulebook.

   Sopra i punti delle unita', i bonus del formato: il generale nemico
   caduto, fuggito dal tavolo o in fuga a fine partita, e lo stesso per
   chi porta lo stendardo da battaglia; e gli obiettivi tenuti a fine
   turno. Gli stendardi presi come trofeo l'arbitro non li conta: non
   sa ancora chi li ha presi (limite `trofei`).
   ============================================================ */
const OBIETTIVI = { treasure: "treasure", landmark: "landmark", monolith: "landmark" };

/* Chi tiene ogni obiettivo adesso (Battle March p. 25): la regola sta
   in `battlemarch.js`, qui si misura. Come nel diario, la distanza va
   dal bordo del pezzo al bordo dell'unita', e la Forza d'Unita' conta
   i capi che ci stanno dentro. */
export function obiettivi(S){
  const pezzi = (S.sc.terrain || []).filter(t => OBIETTIVI[t.kind]);
  return pezzi.map(t => {
    const raggio = ((t.w ?? (TERRAIN[t.kind] || {}).w ?? 0) * MM) / 2;
    const vicini = [];
    for (const u of [...inCampo(S, "A"), ...inCampo(S, "B")]){
      const d = Math.max(0, distPointToBox([t.x * MM, t.y * MM], boxOf(u, S.units)) - raggio) / MM;
      if (d > OBJECTIVE_RANGE + 0.01) continue;
      vicini.push({ uid: u.uid, name: u.name, army: u.army, us: usConCapi(S, u), dist: r1(d),
                    fleeing: !!u.fled, stupid: stupida(S, u) });
    }
    const h = objectiveHolder(vicini);
    return { kind: OBIETTIVI[t.kind], army: h.held ? h.army : null, by: h.held ? h.by.name : "" };
  });
}

function segnaObiettivi(S){
  const oggi = obiettivi(S);
  if (!oggi.length) return;
  S.fineTurni.push({ kind: "turn", n: S.turno, army: S.army, objectives: oggi });
  const b = VC.bonuses(S.formato);
  for (const o of oggi){
    const v = o.kind === "landmark" ? b.landmark : b.treasure;
    if (o.army && v)
      say(S, `${o.by} tiene ${o.kind === "landmark" ? "il landmark" : "un tesoro"}: ` +
             `${v} punti vittoria a ${S.nomi[o.army]}.`, { army: o.army, page: 27 });
  }
}

export function punteggio(S){
  const formato = S.formato || VC.formatFor(S.sc);
  const b = VC.bonuses(formato);
  /* i capi uniti contano per conto loro: il loro valore in punti c'e'
     anche quando stanno dentro un reggimento */
  const conta = army => S.units.filter(u => u.army === army).reduce((s, u) => {
    const share = VC.strengthShare({ models: u.models || 0, alive: alive(u),
                                     woundsPer: 1, woundsLost: 0 });
    return s + VC.unitVP({ pts: u.pts || 0, dead: !!u.dead, fledOff: !!u.fledOff,
                           fleeing: !!u.fled, share }).vp;
  }, 0);
  const perso = uid => { const u = uid != null ? byUid(S, uid) : null;
                         return !!u && (u.dead || u.fledOff || u.fled); };
  const bonus = army => {
    const lui = army === "A" ? "B" : "A";
    return (perso((S.generale || {})[lui]) ? b.general : 0) +
           (perso((S.bsb || {})[lui]) ? b.bsb : 0);
  };
  const ob = VC.objectivePoints(S.fineTurni || [], formato);
  /* i punti che ho fatto sono quelli che l'altro ha perso */
  const A = conta("B") + bonus("A") + ob.A, B = conta("A") + bonus("B") + ob.B;
  return { A, B, formato, obiettivi: ob, ...VC.victory(A, B, formato) };
}

export function rotto(S, army){
  return VC.broken(totalUS(S, army), S.usStart[army]);
}

export function fine(S, why, { rotto = null } = {}){
  S.finita = true;
  let p = punteggio(S);
  /* p. 291: «if the game ends with one army having broken, the
     unbroken army achieves a crushing victory» — i punti restano
     scritti, ma il verdetto non lo decidono loro */
  if (rotto){
    const vince = rotto === "A" ? "B" : "A";
    p = { ...p, winner: vince, level: "crushing", label: "vittoria schiacciante", page: VC.PAGE.breakpoint };
  }
  S.esito = { ...p, why };
  say(S, `Partita finita (${why}). ${S.nomi.A} ${p.A} punti vittoria, ${S.nomi.B} ${p.B}. ` +
         (p.winner ? `${S.nomi[p.winner]} vince: ${p.label}.` : `${p.label}.`),
      { page: p.page || 292 });
  return S.esito;
}

/* Si controlla dopo ogni gesto: un esercito che non ha piu' niente in
   campo, o che e' sceso sotto il punto di rottura, ha finito. */
export function controllaFine(S, { inizioTurno = false } = {}){
  if (S.finita || S.schierando) return S.esito;
  for (const army of ["A", "B"]){
    /* chi ha ancora unita' da mettere in campo non ha perso: succede
       in riserva e negli scenari a rinforzi */
    /* chi e' rimasto fuori perche' non c'era posto non arrivera' mai:
       non tiene in vita un esercito che in campo non ha piu' niente */
    const fuori = unitsOf(S, army).filter(u => !u.dead && !u.placed && !u.rinuncia).length;
    if (!inCampo(S, army).length && !fuori)
      return fine(S, `${S.nomi[army]} non ha più nessuno in campo`);
  }
  /* Il punto di rottura esiste solo nella durata che lo chiede
     (p. 291): in Battle March e nei sei round del Core Rulebook si
     gioca fino in fondo, e contano i punti. Prima valeva per tutte le
     partite, e la sfida Michele contro Gemini e' finita cosi' su un
     tavolo che non lo prevedeva.

     Si guarda ALL'INIZIO DI UN TURNO, non appena ci si scende: un
     esercito che scende sotto durante la fase di combattimento finisce
     il suo combattimento, e la partita si ferma dopo. Se si rompono
     tutti e due nello stesso momento, decidono i punti vittoria. */
  if (inizioTurno && S.durata === "breakpoint"){
    const r = { A: rotto(S, "A"), B: rotto(S, "B") };
    const giu = ["A", "B"].filter(x => r[x] && r[x].broken);
    if (giu.length === 2) return fine(S, "tutti e due gli eserciti sono sotto il punto di rottura");
    if (giu.length === 1){
      const x = giu[0];
      return fine(S, `${S.nomi[x]} è sotto il punto di rottura: ` +
                     `Forza d'Unità ${r[x].usNow} contro le ${r[x].bp} che servivano (p. ${r[x].page})`,
                  { rotto: x });
    }
  }
  return null;
}

/* ============================================================
   11 · LA PARTITA VISTA DA CHI DEVE DECIDERE
   Una fotografia in parole: dove sta ognuno, quanto ne resta, chi
   tocca chi. E' quello che si mette davanti a chi gioca — un umano che
   legge, o un modello di linguaggio che deve scegliere una mossa — e
   per tutti e due vale la stessa regola: niente numeri senza unita' di
   misura, niente sigle, e le distanze in pollici come al tavolo.
   ============================================================ */
export function fotografia(S, { per = null } = {}){
  const io = per || S.army, lui = io === "A" ? "B" : "A";
  const riga = u => {
    const mv = moveInfo(u);
    const c = CB.combatant(u);
    const vicino = piuVicino(S, u);
    const effetti = EF.effectsOf(u).map(e => e.from);
    const maghi = [u, ...FM.attachedTo(S.units, u)].map(x => rigaMago(S, x)).filter(Boolean);
    /* com'e' schierata e dove ha il nemico: con le manovre, un nemico
       sul fianco e' una decisione, e chi sceglie deve vederlo */
    const lay = layoutOf(u, S.units);
    const forma = sciolta(u) ? ", in formazione sciolta" : alive(u) > 1 ? `, ${lay.front}×${lay.ranks}` : "";
    const dove = vicino && !sciolta(u) ? FM.arcOfPoly(cornersOf(vicino, S.units), boxOf(u, S.units)).arc : "";
    const lato = { fianco: " sul fianco", retro: " alle spalle" }[dove] || "";
    return `  · ${u.name} — ${alive(u)}/${u.models} modelli${forma}, ${u.pts || 0} pt, ` +
      `M ${mv.m || "?"}, WS ${c.ws}, S ${c.s}, T ${c.t}, Ld ${c.ld}` +
      (u.fled ? ", IN FUGA" : "") +
      (ingaggiata(S, u) ? ", in mischia" : "") +
      (vicino ? `, nemico più vicino ${vicino.name} a ${distanza(S, u, vicino)}″${lato}` : "") +
      (effetti.length ? `, sotto l'effetto di ${effetti.join(", ")}` : "") +
      (capiDi(S, u).length ? `, con dentro ${capiDi(S, u).map(c =>
        `${c.name} (Ld ${CB.combatant(c).ld}${c.ritiro ? ", RITIRATO da una sfida: non mena e non dà niente" : ""})`).join(" e ")}` : "") +
      (maghi.length ? "\n" + maghi.join("\n") : "");
  };
  const mie = inCampo(S, io), sue = inCampo(S, lui);
  const fuori = S.units.filter(u => u.army === io && !u.dead && !u.placed && !isJoined(u));
  const pv = punteggio(S), bn = VC.bonuses(pv.formato);
  const ob = bn.treasure || bn.landmark ? obiettivi(S) : [];
  return [
    (S.rounds ? `Turno ${S.turno} di ${S.rounds}.` : `Turno ${S.turno}: si gioca fino al punto di rottura.`) +
      ` Tavolo ${S.table.wIn}×${S.table.hIn}″, scenario «${S.sc.label}».`,
    `Tu sei ${S.nomi[io]} (${S.punti[io]} punti). L'avversario è ${S.nomi[lui]} (${S.punti[lui]}).`,
    ...ilTerreno(S),
    `Le tue unità in campo:`, ...mie.map(riga),
    fuori.length ? `Ancora da schierare: ${fuori.map(u => u.name).join(", ")}.` : "",
    `Le sue unità in campo:`, ...sue.map(riga),
    `Punti vittoria adesso: tu ${pv[io]}, lui ${pv[lui]}` +
      (pv.formato === "bm" ? " (in Battle March vince chi ne ha di più)." : " (servono 100 punti di scarto)."),
    ob.length ? `Obiettivi: ` + ob.map(o => (o.kind === "landmark" ? "landmark " : "tesoro ") +
      (o.army ? `tenuto da ${o.by} (${o.army === io ? "tuo" : "suo"})` : "libero")).join("; ") +
      `. Chi ne tiene uno alla fine del suo turno prende ${bn.treasure} punti per un tesoro, ${bn.landmark} per il landmark.` : "",
  ].filter(Boolean).join("\n");
}

/* IL TERRENO, NELLA FOTOGRAFIA (pp. 269-272).
   Fin qui la fotografia del tavolo elencava le unita', i profili, le
   distanze, i punti vittoria e gli obiettivi, e dei pezzi posati sul
   tavolo non diceva niente. Chi sceglieva le mosse — l'euristica, o il
   modello di linguaggio — giocava su un prato: non sapeva che al
   centro c'era un monolite, ci schierava dietro un reggimento e ce lo
   lasciava per tutta la partita, perche' di quel muro non aveva mai
   letto una riga.

   Le regole le sapeva gia' l'arbitro, e le sa `terrain.js`: quello che
   mancava era dirle. Le decorazioni (p. 271) stanno in una riga a
   parte, perche' per il movimento e il combattimento non esistono ma
   la vista la coprono lo stesso.

   Le coordinate sono quelle del tavolo e non quelle di chi guarda: i
   due eserciti leggono la stessa fotografia, e girargliela a testa in
   giu' vorrebbe dire scrivere due tavoli diversi e non poter piu'
   confrontare una riga di registro con quello che si legge qui. */
function doveSulTavolo(S, t){
  const x = t.x / S.table.w, y = t.y / S.table.h;
  const col = x < 0.33 ? "a sinistra" : x > 0.67 ? "a destra" : "al centro";
  const fil = y < 0.33 ? "in alto" : y > 0.67 ? "in basso" : "a mezzo tavolo";
  return col === "al centro" && fil === "a mezzo tavolo" ? "al centro del tavolo" : `${col}, ${fil}`;
}

function ilTerreno(S){
  const pezzi = (S.terrain || []).filter(t => !t.decor && t.kind !== "treasure");
  const decori = (S.terrain || []).filter(t => t.decor && t.kind !== "treasure");
  if (!pezzi.length && !decori.length) return [];
  const riga = t =>
    `  · ${t.label} — ${r1(t.w / MM)}×${r1(t.h / MM)}″, ${doveSulTavolo(S, t)}` +
    ` (${r1(t.x / MM)}, ${r1(t.y / MM)}): ${TR.testoCat(t) || "terreno aperto, non fa niente"}.`;
  return [
    `Il terreno sul tavolo (pp. 269-272). Le coordinate sono in pollici dall'angolo in alto a sinistra;` +
      ` un pezzo impassabile va aggirato, e chi gli si ferma dietro non passa piu':`,
    ...pezzi.map(riga),
    decori.length ? `  · decorazioni, che per muoversi e combattere non esistono (p. 271) ma la vista la coprono:` +
      ` ${decori.map(t => t.label).join(", ")}.` : "",
  ].filter(Boolean);
}

/* Il registro in parole, dall'ultima riga indietro: serve a chi entra
   adesso — e un modello di linguaggio entra adesso a ogni mossa. */
export function ultimeRighe(S, n = 12){
  return S.log.slice(-n).map(r =>
    `T${r.turno} ${r.text}` + (r.page ? ` (p. ${r.page})` : "")).join("\n");
}

/* Per le prove: i pezzi del tavolo che nessuna opzione espone da sola,
   e che vanno provati uno per uno con i pezzi messi a mano. */
export const interni = { indietreggia, seguire, fuggi, postoAContatto, percorso, comandoDi, ldOf, muoviCarica,
                         panico, faseDi, continuaAFuggire, perdite, pauraDi, inizioTurno, ldProprio, movimento,
                         caselleDelTavolo,
                         /* il terreno: le prove devono poter chiedere che cosa vede chi
                            guarda e che cosa sta sotto a chi sta fermo */
                         guarda, pezziSotto, pezziSulCammino, rallenta, terrenoInMischia,
                         sullaCollina, filaPiuAlta, quantiTirano, terrenoDiCarica,
                         testPanico, ondaPanico, ripulisciSfide, sfidanti, puoRifiutare };
