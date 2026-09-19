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
import { boxCorners, polyDistance, polysOverlap, pointInRect, distPointToBox } from './geom.js';
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
import { roll, d3, leadershipTest, stat, rankBonus, woundOn, saveOn, chance as chanceOf } from './rules.js';
import { SCENARIOS, geometry } from './scenarios.js';
import { troopType, unitStrength } from './troops.js';
import { TERRAIN } from './terrain.js';
import { objectiveHolder, OBJECTIVE_RANGE } from './battlemarch.js';

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
  { id:"sagome",    what:"le sagome e le macchine da guerra sparano come un'arma normale", page:222,
    why:"deviazione e «sotto in parte» stanno in `shoot.js` e vogliono la posizione modello per modello" },
  { id:"ruota",     what:"la ruota si paga giusta, ma si fa una volta sola, all'inizio, e sul centro", page:124,
    why:"il libro la fa girare su uno spigolo del fronte e lascia alternare ruote e passi avanti: l'arbitro conta quanto cammina il modello esterno, gira il pezzo sul posto e poi va dritto. Il giro libero dei Lumbering (p. 195) si fa prima di muovere invece che dopo" },
  { id:"manovre",   what:"chi riordina le file o si riforma non usa il resto del movimento, e la riforma tiene il fronte che aveva", page:125,
    why:"il riordino costa metà del Movimento e l'altra metà si potrebbe camminare; la riforma può anche cambiare la formazione. Dopo un giro si va solo dritti" },
  { id:"sfida",     what:"nessuno lancia sfide", page:210,
    why:"chi la raccoglie e chi la rifiuta è una decisione da tavolo, e l'overkill lo conta già `melee.js`" },
  { id:"oggetti",   what:"gli oggetti magici non fanno niente", page:0,
    why:"i cataloghi li scrivono come testo libero: l'app li mostra e non li applica" },
  { id:"trofei",    what:"gli stendardi presi come trofeo non contano nel punteggio", page:200,
    why:"il bonus c'è (25 punti in Battle March, 50 nel Core Rulebook), ma l'arbitro non segna chi ha preso lo stendardo di un'unità travolta" },
  { id:"bordo",     what:"chi cede terreno contro il bordo del tavolo si ferma lì", page:134,
    why:"il libro dice dove si ferma chi cede terreno — un'unità, il terreno, un pollice da un nemico — e del bordo non dice niente" },
  { id:"volo",      what:"chi vola si muove del suo volo ma non sorvola niente", page:0,
    why:"il numero lo dà `profiles.js`; sorvolo e atterraggio vogliono la geometria del volo" },
  { id:"seguire",   what:"chi vince segue sempre chi cede terreno, e non segue mai chi ripiega in ordine", page:134,
    why:"seguire o fermarsi è una scelta di chi gioca, e l'arbitro qui non la offre" },
  { id:"ridirezione", what:"chi vede fuggire il bersaglio della carica non la ridirige su un altro", page:121,
    why:"tira comunque, e se non raggiunge chi fugge fa la carica fallita" },
  { id:"attraversare", what:"chi fugge passa attraverso le unità senza il test di Pericolo", page:133,
    why:"il test c'è in `charge.js` (`perilAsk`), ma vuole sapere quali modelli hanno attraversato" },
  { id:"ingombro",  what:"chi trova la strada chiusa si ferma o gira un poco, non aggira l'ostacolo", page:122,
    why:"il percorso è una linea con qualche deviazione, non una ricerca di strada" },
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
export function newBattle({ A, B, scenario = "bm-strada", nomi = null, magia = null, durata = null } = {}){
  const sc = SCENARIOS[scenario] || SCENARIOS["bm-strada"];
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
       vanno riscritte qui. */
    terrain: (sc.terrain || []).map((t, i) => {
      const box = { x: t.x * MM, y: t.y * MM, w: (t.w || 2) * MM, h: (t.h || 2) * MM, rot: t.rot || 0 };
      return {
        tid: i + 1, kind: t.kind, label: t.kind, box, poly: boxCorners(box), circle: false,
        x: box.x, y: box.y, w: box.w, h: box.h, rot: box.rot,
        blocks: /wood|monolith|pyramid|ruins/.test(t.kind),
        cover: /wood|ruins|wall/.test(t.kind) ? "leggera" : "",
        contains: p => Math.abs(p[0] - box.x) <= box.w / 2 && Math.abs(p[1] - box.y) <= box.h / 2,
      };
    }),
    units,
    nomi: nomi || { A: A.name || "Esercito A", B: B.name || "Esercito B" },
    punti: { A: (A.units || []).reduce((s, u) => s + (u.pts || 0), 0),
             B: (B.units || []).reduce((s, u) => s + (u.pts || 0), 0) },
    usStart: { A: 0, B: 0 },
    turno: 1, army: "A", casella: 0, schierando: true, primo: "A",
    formato, durata: lunga, rounds: VC.roundsFor(lunga) || null, finita: false, esito: null,
    /* chi teneva gli obiettivi alla fine di ogni turno di giocatore:
       e' la forma che `VC.objectivePoints` somma */
    fineTurni: [],
    log: [], detto: new Set(), pending: null,
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
function say(S, text, { page = 0, dice = null, groups = null, army = "", kind = "" } = {}){
  const riga = { turno: S.turno, army: army || S.army, casella: CASELLE[S.casella] ? CASELLE[S.casella].id : "",
                 text, page, dice, kind };
  if (groups && groups.length) riga.groups = groups;
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
const GENERE = { regularInfantry:"fanteria", heavyInfantry:"fanteria", monstrousInfantry:"fanteria",
                 lightCavalry:"cavalleria", heavyCavalry:"cavalleria", monstrousCavalry:"cavalleria" };
const genere = u => GENERE[troopType(u.troop).id] || "";
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
export function ingombro(S, u, box, { ignora = [], unPollice = true, bordo = true, gia = null } = {}){
  const poly = boxCorners(box);
  if (bordo && !dentroTavolo(S, poly)) return { chi: null, perche: "il bordo del tavolo" };
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
   propone tre posti — sinistra, centro, destra — e chi gioca sceglie:
   la geometria resta qui, e chi decide non deve saper contare i
   millimetri.
   ============================================================ */
function zonaDi(S, army){
  const z = (S.zones[army] || [])[0];
  return z || { x: 0, y: 0, w: S.table.w, h: S.table.h };
}

export function postiPer(S, u){
  const z = zonaDi(S, u.army);
  const lay = layoutOf(u, S.units);
  const mie = inCampo(S, u.army);
  const out = [];
  const colonne = ["sinistra", "centro-sinistra", "centro", "centro-destra", "destra"];
  /* La zona in colonne e in file: la prima fila e' quella davanti, cioe'
     dalla parte del nemico, che e' dove al tavolo si mette chi deve
     arrivarci. Le file dietro servono quando la prima e' piena: uno
     schieramento non e' mai una riga sola. */
  const file = Math.max(1, Math.floor(z.h / Math.max(MM, lay.h + MM / 2)));
  for (let f = 0; f < Math.min(file, 3); f++){
    for (let i = 0; i < colonne.length; i++){
      const x = z.x + z.w * (i + 0.5) / colonne.length;
      const passo = lay.h + MM / 2;
      /* A sta in basso e guarda in su: la sua prima fila e' il bordo
         alto della zona. Prima era il contrario, e il capo messo «in
         prima fila» stava sul bordo del tavolo dietro a tutti. */
      const y = u.army === "A"
        ? z.y + lay.h / 2 + MM + f * passo
        : z.y + z.h - lay.h / 2 - MM - f * passo;
      const poly = boxCorners({ x, y, w: lay.w, h: lay.h, rot: u.rot || 0 });
      const libero = !mie.some(o => polyDistance(poly, cornersOf(o, S.units)) < MM / 2) &&
                     x - lay.w / 2 >= z.x - 0.01 && x + lay.w / 2 <= z.x + z.w + 0.01 &&
                     y - lay.h / 2 >= z.y - 0.01 && y + lay.h / 2 <= z.y + z.h + 0.01;
      if (libero) out.push({ id:"schiera", uid: u.uid, x, y, rot: u.rot || 0,
                             dove: colonne[i] + (f ? `, ${f + 1}ª fila` : ""),
                             why: `${colonne[i]}${f ? ", dietro" : ", in prima fila"}` });
    }
  }
  return out;
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
export function options(S){
  if (S.finita) return { player: null, fase: "finita", what: "la partita è finita", list: [] };

  /* prima dello schieramento si generano gli incantesimi (p. 106) */
  if (S.preparando){
    const o = opzioniPreparazione(S);
    if (o) return o;
  }

  if (S.schierando){
    const prossima = daSchierare(S);
    if (!prossima) return { player: S.army, fase: "Schieramento", what: "tutti schierati", list: [{ id:"avanti", why:"si comincia" }] };
    const posti = [...opzioniUnione(S, prossima), ...postiPer(S, prossima)];
    return {
      player: S.army, fase: "Schieramento", page: 115,
      what: `${S.nomi[S.army]} schiera ${prossima.name} (${alive(prossima)} modelli, ${prossima.pts || 0} pt)`,
      unit: prossima.uid,
      list: posti.length ? posti : [{ id:"avanti", why:"non c'è posto per quest'unità nella zona" }],
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

function daSchierare(S){
  /* chi ha rinunciato — perche' nella zona non c'era piu' posto — non
     torna a chiedere: resta fuori dal tavolo, e a fine partita vale
     quello che vale */
  const mie = unitsOf(S, S.army).filter(u => !u.placed && !isJoined(u) && !u.rinuncia);
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
  const me = PS.psychOf(u, { joined: capiDi(S, u) });
  const foe = PS.psychOf(t, { joined: capiDi(S, t) });
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
/* Il test psicologico tirato davvero, con la sua riga di registro. */
function testPsico(S, u, kind, p, perche, page){
  const auto = PS.autoPass(kind, p);
  if (auto.auto){
    say(S, `${u.name}, ${PS.KINDS[kind].label} (${perche}): ${auto.why}.`, { army: u.army, page });
    return { passed: true, auto: true };
  }
  const dadi = roll(PS.coldDice(kind, p) ? 3 : 2);
  const res = PS.psychTest({ kind, ld: ldOf(S, u), dice: dadi, p });
  say(S, `${u.name}, ${PS.KINDS[kind].label} (${perche}): ${res.text}.`, { dice: dadi, army: u.army, page });
  return res;
}

function opzioniCarica(S){
  const out = [];
  for (const u of inCampo(S, S.army)){
    /* chi ha gia' fatto qualcosa in questo turno non dichiara cariche:
       ci e' andata male una volta e basta */
    if (u.fled || u.charged || u.moved || ingaggiata(S, u)) continue;
    /* Miasmic Mirage, Earthen Ramparts: chi ce l'ha addosso non carica */
    if (bandiera(u, "noCharge") || stupida(S, u) || u.unito === chiave(S)) continue;
    const { move } = movimento(S, u);
    if (!move) continue;
    const pu = PS.psychOf(u, { joined: capiDi(S, u) });
    if (pu.anyFrenzy || pu.impetuous) limite(S, "frenesia");
    for (const t of nemiciDi(S, u)){
      const paura = pauraDi(S, u, t, "charge");
      if (paura.already && !paura.passed) continue;
      const d = CH.declareCharge({
        charger: { name: u.name, box: boxOf(u, S.units), move, swift: MV.swiftOf(u), loose: !!u.loose },
        target:  { name: t.name, box: boxOf(t, S.units) },
        pieces: S.terrain,
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
      out.push({ id:"carica", uid: u.uid, target: t.uid, nome: u.name, contro: t.name,
                 why: `${d.dist}″, ${need ? "serve " + need + "″ di tiro" : "ci arriva camminando"}` +
                      (extra ? ` (${extra}″ per trovare posto sulla faccia)` : "") +
                      `, riesce il ${Math.round(chance * 100)}%, la prende di ${d.side}` + nota,
                 chance, page: 119 });
    }
  }
  out.sort((a, b) => b.chance - a.chance);
  return [...out, avanti("basta cariche: si passa al movimento")];
}

/* ---- mosse (p. 122) ---- */
function opzioniMossa(S){
  const out = [];
  for (const u of inCampo(S, S.army)){
    if (u.fled || u.charged || ingaggiata(S, u) || u.moved) continue;
    if (u.unito === chiave(S) || stupida(S, u)) continue;
    const { mv, move } = movimento(S, u);
    if (!move){ continue; }
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
      out.push({ id:"ferma", uid: u.uid, nome: u.name, why: `resta dov'è: ${t.name} è a ${d}″`, page: 122 });
      continue;
    }
    /* la ruota si paga (p. 124), e la dice l'opzione: un reggimento
       che deve girarsi di 45° per guardare il nemico non avanza affatto */
    const rotT = versoDi(t.x - u.x, t.y - u.y);
    const pa = pianoRuota(S, u, rotT, move), pm = pianoRuota(S, u, rotT, move * 2, { marcia: true });
    out.push({ id:"avanza", uid: u.uid, verso: t.uid, nome: u.name, contro: t.name,
               why: `${t.name} è a ${d}″: ${testoRuota(pa, move)}` + (mv.why ? ` (${mv.why})` : ""),
               page: pa.costo ? 124 : 122 });
    if (!bandiera(u, "noMarch")) out.push({ id:"marcia", uid: u.uid, verso: t.uid, nome: u.name, contro: t.name,
               why: `${t.name} è a ${d}″: ${testoRuota(pm, move * 2, "marcia")}` +
                    (d <= CH.MARCH_WATCH ? `, ma a ${CH.MARCH_WATCH}″ da un nemico serve un test di Comando (p. 123)` : ""),
               page: 123 });
    out.push(...opzioniManovra(S, u, t, move));
    out.push({ id:"ferma", uid: u.uid, nome: u.name, why: "resta dov'è: chi non muove spara meglio", page: 138 });
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
const sciolta = u => !!u.loose ||
  (PREP.isCharacter(u) && !!genere(u) && !isJoined(u) && (u.models || 1) === 1);

/* di quanto girarsi per passare da una direzione all'altra, con il
   segno (positivo in senso orario, cioe' verso destra), fra -180 e 180 */
const giroDi = (da, a) => ((((a || 0) - (da || 0)) % 360) + 540) % 360 - 180;
const colonna = (n, f) => Math.ceil(n / Math.max(1, f)) > f;

/* La ruota verso `rot` pagata con `budget` pollici. Costa quanto
   cammina il modello esterno (p. 124), cioe' il fronte per l'angolo in
   radianti; chi non ce la fa ruota quanto puo' e non avanza. I Lumbering
   hanno 90° gratis dopo essersi mossi, se non hanno marciato (p. 195). */
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
    const gate = SH.canShoot({ charged: !!u.charged, marched: !!(u.moved && u.moved.kind === "march"),
                               engaged: ingaggiata(S, u), fleeing: !!u.fled });
    if (!gate.can) continue;
    const arma = armi[0];
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
      out.push({ id:"tira", uid: u.uid, target: t.uid, nome: u.name, contro: t.name,
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
  const p = PS.psychOf(u, { joined: capiDi(S, u) });
  const base = comandoDi(S, u, ldProprio(S, u).ld, { zitto }).ld;
  return PS.leadershipOf(base, p, { fleeing: !!u.fled }).value;
}
/* Il Comando piu' alto fra i modelli dell'unita', capi compresi (p. 97):
   «warriors naturally look to the most steadfast of their number». */
function ldProprio(S, u){
  const c = CB.combatant(u);
  let ld = +(c.ldBase != null ? c.ldBase : c.ld) || 0, chi = "";
  for (const x of capiDi(S, u)){
    const k = CB.combatant(x);
    const v = +(k.ldBase != null ? k.ldBase : k.ld) || 0;
    if (v > ld){ ld = v; chi = x.name; }
  }
  return { ld, chi };
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
  say(S, `${u.name}: Movimento ${mv.random} → ${dadi.join(" + ")} = ${n}″.`,
      { dice: dadi, army: u.army, page: mv.page || 0 });
  return n;
}

function vistaTagliata(S, a, b){
  const from = { x: a.x, y: a.y }, to = { x: b.x, y: b.y };
  return S.terrain.filter(t => t.blocks).some(t => segmentoTocca(from, to, t));
}
function coperturaDi(S, u){
  return S.terrain.some(t => t.cover && pointInRect([u.x, u.y],
    { x: t.x - t.w / 2, y: t.y - t.h / 2, w: t.w, h: t.h }));
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
  return f(S, a);
}
/* si alterna, e chi ha finito lascia continuare l'altro */
function alterna(S){
  S.army = S.army === "A" ? "B" : "A";
  if (!daSchierare(S)){
    S.army = S.army === "A" ? "B" : "A";
    if (!daSchierare(S)) fineSchieramento(S);
  }
}
const SOSPESI = { dissolvi: ["dissolvi", "lascia", "avanti"], assalto: ["lancia", "lascia", "avanti"] };
const no = why => ({ ok: false, text: why });
const si = text => ({ ok: true, text });

const GESTI = {
  /* «avanti» con un dissolvimento o un assalto in sospeso vuol dire
     «non faccio niente»: la partita non salta la domanda, la chiude */
  avanti: (S) => (S.pending && (S.pending.kind === "dissolvi" || S.pending.kind === "assalto"))
    ? GESTI.lascia(S) : si(passo(S)),

  dominio: (S, a) => sceltaDominio(S, a),
  tieni:   (S, a) => tieniIncantesimi(S, a),
  scambia: (S, a) => scambiaIncantesimo(S, a),
  lancia:  (S, a) => lancia(S, a),
  dissolvi:(S, a) => dissolvi(S, a),
  lascia:  (S) => lascia(S),

  schiera: (S, a) => {
    const u = byUid(S, a.uid);
    if (!u || u.placed) return no("quest'unità non è da schierare");
    u.x = a.x; u.y = a.y; u.rot = a.rot != null ? a.rot : u.rot; u.placed = true;
    say(S, `${u.name} si schiera ${a.dove || ""}`.trim() + ".", { army: u.army, page: 115 });
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
    say(S, `${u.name}, raduno: ${res.text}. ${res.then}`, { dice: dadi, army: u.army, page: res.page });
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
    const d = CH.declareCharge({
      charger: { name: u.name, box: boxOf(u, S.units), move, swift: MV.swiftOf(u), loose: !!u.loose },
      target:  { name: t.name, box: boxOf(t, S.units) },
      pieces: S.terrain,
    });
    if (!d || !d.can) return no(`carica impossibile: ${d ? d.why : "?"}`);
    /* la Paura si tira prima di dichiarare (p. 168) */
    const paura = pauraDi(S, u, t, "charge");
    if (paura.already && !paura.passed) return no("ha già fallito la Paura in questo turno");
    if (paura.must){
      const pu = PS.psychOf(u, { joined: capiDi(S, u) });
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
    const r = CH.reactions({ dist: d.dist, chargerMove: move, shots: CB.shooters(t),
                             noFlee: puo.can ? "" : puo.why, mustHold: puo.hold ? puo.why : "",
                             fleeing: !!t.fled, engaged: ingaggiata(S, t) });
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
    const pu = PS.psychOf(u, { joined: capiDi(S, u) });
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
      const dadi = roll(2);
      const via = dadi.reduce((s, v) => s + v, 0) + CB.fleeBonusOf(t).mod;
      say(S, `${t.name} reagisce fuggendo: ${dadi.join(" + ")} = ${via}″ lontano da ${u.name}.`,
          { dice: dadi, army: t.army, page: 120 });
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
  marcia: (S, a) => mossa(S, a, true),
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
    if (stupida(S, u)) return no("è in preda alla Stupidità: non tira");
    const armi = CB.rangedWeapons(u);
    if (!armi.length) return no("non ha armi da tiro");
    tiro(S, u, t, armi[0], {});
    u.shot = true;
    return si("tiro risolto");
  },

  combatti: (S, a) => {
    const g = gruppiInMischia(S)[a.gruppo || 0];
    if (!g) return no("nessun combattimento");
    if (fatto(S, g)) return no("questo combattimento si è già risolto in questo turno");
    return si(avviaCombattimento(S, [...g.A, ...g.B].map(u => u.uid)));
  },
};

/* ---- il movimento vero ---- */
function mossa(S, a, marcia){
  const u = byUid(S, a.uid), t = byUid(S, a.verso);
  if (!u || !t) return no("unità sconosciuta");
  if (u.moved) return no("si è già mossa");
  if (u.unito === chiave(S)) return no("un personaggio le si è unito: non si muove più in questo turno (p. 207)");
  if (stupida(S, u)) return no("è in preda alla Stupidità: non si muove");
  const { move } = movimento(S, u);
  if (!move) return no("non sa di quanto si muove: il profilo non porta il Movimento");
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
          { dice: dadi, army: u.army, page: 123 });
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
function avanzaRuotando(S, u, t, pr, quanti){
  const da = u.rot || 0;
  let rot = pr.rot, resta = pr.resta, bloccata = false;
  if (Math.abs(giroDi(da, rot)) > 0.5 &&
      ingombro(S, u, { ...boxOf(u, S.units), rot }, { unPollice: false, ignora: giaAddosso(S, u) })){
    rot = da; bloccata = true;
    resta = Math.abs(giroDi(da, versoDi(t.x - u.x, t.y - u.y))) <= 90 ? quanti : 0;
  }
  if (!bloccata && Math.abs(pr.giro) >= 0.5 && !pr.sciolta) limite(S, "ruota");
  let p = { x: u.x, y: u.y, mm: 0, pollici: 0, stop: null };
  if (resta > 0.01){
    const a = rot * Math.PI / 180;
    const meta = bloccata ? [u.x + Math.sin(a) * resta * MM, u.y - Math.cos(a) * resta * MM] : [t.x, t.y];
    p = percorso(S, u, meta, resta, { rot, devia: !bloccata });
    if (p.stop && p.pollici < resta - 0.05) limite(S, "ingombro");
  }
  posa(S, u, p.x, p.y, rot);
  return { ...p, bloccata, voluti: resta, giro: bloccata ? 0 : pr.giro };
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

function muoviCarica(S, u, t, d){
  const spec = CH.chargeDice({ swift: MV.swiftOf(u) });
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
        { dice: dadi, army: u.army, page: 121 });
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
        { dice: dadi, army: u.army, page: 121 });
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
      { dice: dadi, army: u.army, page: 121 });
  return "carica a segno";
}

/* La fuga: via dal nemico, girati a guardare dove si va. Chi fugge
   passa attraverso le unita' (p. 133 — il test di Pericolo e' fra i
   limiti), ma non si ferma dentro nessuno: se il punto d'arrivo e'
   occupato va avanti finche' trova posto. Fuori dal tavolo — anche solo
   con un angolo — e' fuori dalla partita (p. 132). */
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
   reazione alla carica sparava senza il suo −1. */
function modificatori(S, u, t, d, gittata, { standAndShoot = false } = {}){
  return SH.shootMods({ long: d > gittata / 2, moved: haMosso(u) && !standAndShoot,
                        cover: coperturaDi(S, t) ? "soft" : "",
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
function tiro(S, u, t, arma, { standAndShoot = false } = {}){
  const d = distanza(S, u, t);
  const gittata = stat(arma.range);
  if (d > gittata){ say(S, `${u.name} non arriva: ${d}″ con una gittata di ${gittata}″.`, { army: u.army }); return; }
  if (sagomaOMacchina(u, arma)) limite(S, "sagome");
  const mods = modificatori(S, u, t, d, gittata, { standAndShoot });
  const r = CB.shootRoll(u, t, { weapon: arma, mods: mods.total });
  /* la Forza d'Unita' com'era all'inizio di questa fase: il quarto del
     Panico si conta su quella, sommando tutti i tiri della fase */
  const fase = faseDi(S);
  inizioFase(S, t);
  const tutti = mucchi(r);
  say(S, `${u.name} tira su ${t.name} con ${arma.name} da ${d}″: ${r.shots} tiri a ${r.hitNeed}+, ` +
         `${r.hit.hits} ${r.hit.hits === 1 ? "colpo" : "colpi"}, ${r.wounds} ferit${r.wounds === 1 ? "a" : "e"}, ${r.kills} a terra` +
         (mods.list && mods.list.length ? ` [${mods.list.map(m => m.why).join(", ")}]` : "") + ".",
      { dice: tutti.flat, groups: tutti.groups, army: u.army, page: 136 });
  /* le perdite dopo la riga del tiro: prima il registro diceva «non
     resta nessuno in piedi» sopra il tiro che li aveva abbattuti */
  perdite(S, t, r.kills, r.left);
  if (r.kills > 0) panico(S, t, `il tiro di ${u.name}`, u);
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
  const p = PS.psychOf(u, { joined: FM.attachedTo(S.units, u) });
  const c = PS.panicCheck({ cause: causa, me: p, dist, sourceUS: fonteUS,
                            source: fonte ? PS.psychOf(fonte) : null,
                            fleeing: !!u.fled, engaged: ingaggiata(S, u),
                            sourceName: perche || (fonte ? fonte.name : "") });
  if (!c || !c.must) return;
  u.panicoFatto = fase;
  if (c.auto){ say(S, `${u.name}: niente Panico — ${c.autoWhy}.`, { army: u.army, page: c.page }); return; }
  const dadi = roll(PS.coldDice("panic", p) ? 3 : 2);
  const res = PS.psychTest({ kind:"panic", ld: ldOf(S, u), dice: dadi, p });
  say(S, `${u.name}, test di Panico (${c.why}): ${res.text}.`, { dice: dadi, army: u.army, page: c.page });
  if (res.passed) return;
  const nemico = (da && !da.dead && da.army !== u.army ? da : null) ||
                 piuVicino(S, u, nemiciDi(S, u).filter(e => !e.fled)) || piuVicino(S, u);
  if (!nemico) return;
  const esito = PS.panicFail({ alive: alive(u), start: u.models || 0 });
  if (esito.outcome === "fallBack"){
    const dd = roll(2);
    const quanto = Math.max(...dd);
    say(S, `${u.name} va nel panico e ripiega in ordine lontano da ${nemico.name} (${esito.why}): ` +
           `${dd.join(", ")}, si tiene il maggiore.`, { dice: dd, army: u.army, page: esito.page });
    indietreggia(S, u, [nemico], quanto, { kind: "fallBack" });
    return;
  }
  const fuga = roll(2);
  const via = fuga.reduce((t, v) => t + v, 0) + CB.fleeBonusOf(u).mod;
  say(S, `${u.name} va nel panico e fugge da ${nemico.name} (${esito.why}): ${fuga.join(" + ")} = ${via}″.`,
      { dice: fuga, army: u.army, page: 132 });
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
      const odds = MG.castOdds({ level: m.level, cv: sp.cv, bound: !!sp.bound, power: sp.potere || 0 });
      const chi = sp.bound ? `Potere ${sp.potere || 0}` : `Livello ${m.level}`;
      for (const b of bersagli(S, u, host, sp, gruppo)){
        const attesa = sp.effetto.colpi && b.t ? attesaColpi(sp, b.t) : 0;
        out.push({ id:"lancia", uid: u.uid, spell: sp.id, target: b.t ? b.t.uid : null,
                   nome: u.name, contro: b.t ? b.t.name : "",
                   why: `${sp.name} (${MG.TYPE_LABEL[sp.type]}, ${sp.cv}+)` +
                        (b.t ? ` su ${b.t.name}` : "") + (b.dist ? ` a ${b.dist}″` : "") +
                        `: con ${chi} riesce il ${pct(odds.cast)}` +
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
  let res = MG.castResult({ dice: dadi, level: m.level, cv: sp.cv, cv2: sp.cv2 || 0,
                            bound: !!sp.bound, power: sp.potere || 0 });
  say(S, `${u.name} lancia ${sp.name}${t && t !== host ? " su " + t.name : ""}: ${res.text}.`,
      { dice: dadi, army: u.army, page: MG.PAGE.casting });
  if (res.miscast){
    const fd = roll(2);
    const mis = MG.miscastRead(fd[0] + fd[1]);
    say(S, `${u.name}, fiasco — ${fd.join(" + ")} = ${mis.total}: ${mis.label}, ${mis.text}.`,
        { dice: fd, army: u.army, page: MG.PAGE.miscast });
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
      { dice: dadi, army: lui, page: MG.PAGE.dispel });
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
function avviaCombattimento(S, uids){
  const g = gruppoCon(S, uids);
  if (!g || fatto(S, g)) return "il combattimento non c'è più";
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
  if (dopo.kind === "combatti") return avviaCombattimento(S, dopo.uids);
  return "";
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
   8 · LA MISCHIA, DALLA PRIMA FERITA ALL'INSEGUIMENTO
   Qui l'arbitro non fa quasi niente: chiama `meleeFight` con i due
   gruppi — che e' esattamente la firma che questa tappa ha cambiato —
   e poi porta sul tavolo quello che torna. Le perdite, i test di rotta
   uno per unita', le mosse all'indietro, l'inseguimento.
   ============================================================ */
function mischia(S, g){
  for (const u of [...g.A, ...g.B]) u.fought = chiave(S);
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
        const res = testPsico(S, u, "fear", PS.psychOf(u, { joined: capiDi(S, u) }), f.why, 168);
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
  const A = g.A.map(u => schieraDi(S, u, { feared: impauriti.has(u.uid) }));
  const B = g.B.map(u => schieraDi(S, u, { feared: impauriti.has(u.uid) }));
  /* i personaggi uniti entrano nel gruppo come schiere loro (p. 209) */
  for (const [lista, sorgente] of [[A, g.A], [B, g.B]]){
    for (const u of sorgente)
      for (const c of FM.attachedTo(S.units, u))
        lista.push(schieraDi(S, c, { attached: true, host: u, feared: impauriti.has(u.uid) }));
  }
  const round = (S.turno * 2) + (S.army === "A" ? 0 : 1);
  const r = CB.meleeFight(A, B, { round });

  /* ogni colpo finisce nel registro, anche quello andato a vuoto: una
     partita che racconta solo i colpi riusciti non insegna a leggere i
     dadi. I dadi sono tutti, ognuno nel suo mucchio: per colpire, per
     ferire, l'armatura, la salvezza speciale, quanti colpi automatici. */
  for (const s of r.steps){
    const tutti = mucchi(s);
    say(S, `${s.name} ${s.label} su ${s.foe}: ${s.attacks} ${s.attacks === 1 ? "attacco" : "attacchi"}, ` +
           (s.hit.dice.length ? `${s.hit.hits} ${s.hit.hits === 1 ? "colpo" : "colpi"}, ` : "") +
           `${s.wounds} ferit${s.wounds === 1 ? "a" : "e"}, ${s.kills} a terra.`,
        { dice: tutti.flat, groups: tutti.groups, army: s.side === "A" ? "A" : "B", page: 144 });
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
      { page: ML.PAGE.multiple });
  for (const u of caduti) say(S, `${u.name}: non resta nessuno in piedi.`, { army: u.army });

  /* i test di rotta, uno per unita' che ha perso (p. 154) */
  for (const t of r.tests || []){
    const c = r.sides[t.side][t.at || 0];
    const u = c && c.ref;
    if (!u || !onBoard(u)) continue;
    const loro = (t.side === "A" ? g.B : g.A).filter(onBoard);
    say(S, `${u.name}: ${t.text}` + (c.ldGen ? ` [${c.ldGen}]` : ""), { dice: t.dice, army: u.army, page: t.page });
    /* chi perde e rompe, o ripiega in ordine, manda al Panico gli
       amici entro 6″ (p. 161): si misura prima che si muova */
    if (t.outcome === "rout" || t.outcome === "fallBack") ondaPanico(S, u, "broke", usConCapi(S, u));
    if (t.outcome === "rout"){
      const vincitore = piuVicino(S, u, loro) || loro[0];
      const dadi = roll(2);
      const via = dadi.reduce((s, v) => s + v, 0) + CB.fleeBonusOf(u).mod;
      say(S, `${u.name} rompe e fugge di ${via}″.`, { dice: dadi, army: u.army, page: 132 });
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
          { dice: dadi, army: u.army, page: 134 });
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
  const c = CB.combatant(u, { joined: FM.attachedTo(S.units, u), feared });
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
      { dice: dadi, army: vincitore.army, page: ML.PAGE.pursuit });
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
function fineSchieramento(S){
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
function inizioTurno(S){
  for (const u of inCampo(S, S.army)){
    const p = PS.psychOf(u, { joined: capiDi(S, u) });
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
    const dadi = roll(2);
    const via = dadi.reduce((s, v) => s + v, 0) + CB.fleeBonusOf(u).mod;
    say(S, `${u.name} non si è radunata e continua a fuggire: ${dadi.join(" + ")} = ${via}″ lontano da ${da.name}.`,
        { dice: dadi, army: u.army, page: 132 });
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
    if (mia){ mia.placed = false; mia.rinuncia = true; }
    S.army = S.army === "A" ? "B" : "A";
    if (!daSchierare(S)){
      S.army = S.army === "A" ? "B" : "A";
      if (!daSchierare(S)){ fineSchieramento(S); return "schieramento finito"; }
    }
    return "passa";
  }
  S.casella++;
  if (S.casella < CASELLE.length){
    if (CASELLE[S.casella].id === "mosse") continuaAFuggire(S);
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
    const fuori = unitsOf(S, army).filter(u => !u.dead && !u.placed).length;
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
      (capiDi(S, u).length ? `, con dentro ${capiDi(S, u).map(c => `${c.name} (Ld ${CB.combatant(c).ld})`).join(" e ")}` : "") +
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
                         testPanico, ondaPanico };
