/* Schieramento Old World — la mischia: chi mena per primo, chi vince, chi tiene i nervi
 *
 * La Tappa 3 del piano. Il combattimento c'era gia': `combat.js` tira
 * per colpire, per ferire, salva, conta le ferite e le trasforma in
 * modelli a terra. Quello che mancava e' tutto il resto dell'assalto —
 * le quattro cose che stanno fra la p. 144 e la p. 156 e che decidono
 * *come finisce*, non quante ferite passano:
 *
 *   il BONUS DI INIZIATIVA della carica (p. 146) — chi arriva di corsa
 *   mena prima, e quanto prima dipende da quanti pollici interi ha
 *   percorso e da che parte e' arrivato;
 *
 *   il RISULTATO DEL COMBATTIMENTO — ferite, ranghi, stendardo,
 *   stendardo da battaglia, fianco, retro, terreno piu' alto, overkill
 *   nelle sfide;
 *
 *   il TEST DI ROTTA (p. 154) — che nel manuale non ha piu' due esiti
 *   ma tre, e sono tre movimenti diversi sul tavolo;
 *
 *   l'INSEGUIMENTO (p. 156) — inseguire, sfondare, e l'unita' travolta.
 *
 * Il modulo sta accanto a `charge.js` e ha le stesse regole di casa:
 * niente DOM, niente stato, nessun dado tirato. Entrano numeri di
 * profilo e facce gia' uscite, escono punteggi ed esiti con la traccia
 * di come sono venuti. Chi tira e' il vassoio, chi scrive e' il motore,
 * chi decide e' chi gioca.
 */

import { rankBonus } from './rules.js';

/* Le pagine che questo file guarda. Stanno in cima e non sparse nel
   codice perche' sono gli unici numeri che vengono da fuori, e si
   controllano con il libro aperto.

   Del risultato del combattimento non c'e' pagina: il piano elenca le
   voci (§6, «Corpo a corpo») senza dire dove sta la tabella, e
   inventare un numero di pagina e' peggio che non scriverlo — chi va a
   controllare aprirebbe la pagina sbagliata e darebbe la colpa al
   manuale. Le due voci che una pagina ce l'hanno se la portano. */
export const PAGE = {
  fight:       144,   // la fase di corpo a corpo
  chargeI:     146,   // il bonus di Iniziativa della carica
  ranks:       105,   // quanti ranghi concede il tipo di truppa
  disorder:    128,   // carica disordinata e disordine da terreno
  breakTest:   154,   // il test di rotta a tre esiti
  pursuit:     156,   // inseguimento, sfondamento, unita' travolta
};

/* ============================================================
   1 · IL BONUS DI INIZIATIVA DELLA CARICA (p. 146)
   Un pollice intero percorso vale un punto di Iniziativa, fino a un
   tetto che dipende dall'arco: +3 arrivando di fronte, +4 arrivando di
   fianco o di retro. E' una modifica piccola con effetti grandi —
   ribalta l'ordine in cui si mena in quasi ogni carica di cavalleria —
   e fino a qui non c'era: `combat.js` ordinava sull'Iniziativa di
   profilo, cioe' come se nessuno avesse mai caricato.

   I pollici e l'arco li sa gia' il tavolo: la Tappa 2 li scrive
   sull'unita' quando la carica arriva a contatto (`u.charged`). Erano
   li' da allora e non li leggeva nessuno.
   ============================================================ */
export const CHARGE_I_CAP = { fronte:3, fianco:4, retro:4 };

/* Dall'arco della carica alla voce del risultato: sono due vocabolari
   diversi per la stessa cosa — `formation.js` dice «fianco», il conto
   di fine assalto dice `flank` — e tenerli allineati a mano in tre
   punti diversi e' il modo di farli divergere. */
export const arcToFlank = arc => arc === "retro" ? "rear" : arc === "fianco" ? "flank" : "";

export function chargeInitiative(inches = 0, arc = "fronte", { disordered = false } = {}){
  const full = Math.max(0, Math.floor(+inches || 0));
  const cap = CHARGE_I_CAP[arc] != null ? CHARGE_I_CAP[arc] : CHARGE_I_CAP.fronte;
  /* La carica disordinata costa esattamente questo bonus (pp. 128 e
     146). E' la seconda meta' di una regola che la Tappa 2 sapeva gia'
     riconoscere sul tavolo e non poteva ancora far pagare a nessuno. */
  const bonus = disordered ? 0 : Math.min(full, cap);
  return {
    bonus, full, cap, arc, disordered: !!disordered,
    capped: !disordered && full > cap,
    page: PAGE.chargeI,
    why: disordered ? "carica disordinata: niente bonus di Iniziativa"
       : bonus ? "+" + bonus + " Iniziativa: " + full + "″ interi di carica" +
                 (full > cap ? ", e di " + arc + " il tetto è +" + cap : "")
       : "",
  };
}

/* ============================================================
   2 · CHI MENA PER PRIMO
   Tre gradini, non uno: un'arma che decide l'ordine da sola scavalca
   qualunque Iniziativa, e solo fra pari gradino si guarda il numero.
   Dentro il numero c'e' adesso il bonus della carica.
   ============================================================ */
export function speedOf(c = {}){
  const f = c.flags || {};
  const charge = c.charged
    ? chargeInitiative(c.chargeInches || 0, c.chargeArc || "fronte", { disordered: !!c.disordered })
    : null;
  const base = +c.i || 0;
  const bonus = charge ? charge.bonus : 0;
  const rank = f.strikeFirst ? 2 : f.strikeLast ? 0 : 1;
  return {
    rank, base, bonus, charge, i: base + bonus,
    why: f.strikeFirst ? "colpisce per primo, e l'arma scavalca l'Iniziativa"
       : f.strikeLast  ? "colpisce per ultimo, e l'arma scavalca l'Iniziativa"
       : charge && charge.why ? charge.why : "",
  };
}

/* Torna chi parte — "A", "B", o niente quando si menano insieme — e i
   due conti per esteso, perche' il pannello deve poter dire *perche'*
   a volte il piu' svelto dei due parte dopo. */
export function strikeOrder(a = {}, b = {}){
  const sa = speedOf(a), sb = speedOf(b);
  const cmp = (sa.rank - sb.rank) || (sa.i - sb.i);
  return { a: sa, b: sb, first: cmp > 0 ? "A" : cmp < 0 ? "B" : "", together: cmp === 0 };
}

/* ============================================================
   3 · IL RISULTATO DEL COMBATTIMENTO
   Le voci sono quelle che al tavolo si contano sulle dita. Tre non
   c'erano: lo stendardo da battaglia, il terreno piu' alto e
   l'overkill delle sfide.
   ============================================================ */

/* E una quarta voce c'era e non dovrebbe esserci.
   `combat.js` dava +1 a chi ha la Forza d'Unita' piu' alta: e' il
   bonus di superiorita' numerica del Warhammer di prima, e nella
   lista del piano — che e' stata scritta leggendo il manuale — non
   compare. E' il quinto numero preso dall'edizione sbagliata dopo il
   tiro per colpire, la tabella per ferire, il tiro di carica e il tiro
   di fuga, e vale la pena contarli: quattro su cinque erano tabelle
   vecchie che l'app aveva ereditato senza controllarle.

   Qui la voce resta, spenta, dietro un interruttore solo: chi apre il
   manuale e ci trova la riga della superiorita' numerica la riaccende
   cambiando questa costante, e non deve cercare altro. La Forza
   d'Unita' continua a servire — decide la direzione di chi fugge e le
   cause del Panico — ma nel conto di fine assalto non entra. */
export const OUTNUMBER_COUNTS = false;

export const RESULT_PARTS = [
  { id:"wounds",   label:"ferite",             one:"ferita",            many:"ferite" },
  { id:"rank",     label:"ranghi",             one:"rango",             many:"ranghi" },
  { id:"std",      label:"stendardo",          one:"stendardo",         many:"stendardi" },
  { id:"bsb",      label:"stendardo da battaglia", one:"stendardo da battaglia", many:"stendardi da battaglia" },
  { id:"flank",    label:"fianco o retro",     one:"fianco",            many:"fianco" },
  { id:"ground",   label:"terreno più alto",  one:"terreno più alto", many:"terreno più alto" },
  { id:"overkill", label:"overkill",           one:"overkill",          many:"overkill" },
  { id:"out",      label:"superiorità numerica", one:"in più",        many:"in più" },
];

/* `me` e' una scheda piatta, non un'unita' del tavolo: cosi' il conto
   si prova con sei numeri scritti a mano e non serve costruire mezzo
   reggimento per controllare che il fianco valga uno.

   { wounds, models, frontage, maxRank, standard, battleStandard,
     flank:""|"flank"|"rear", highGround, overkill, disrupted, us } */
export function combatScore(me = {}, foe = {}){
  const wounds = Math.max(0, +me.wounds || 0);
  /* I ranghi che contano sono al massimo quelli che il tipo di truppa
     concede (p. 105) — tre per la fanteria, nessuno per un mostro
     solo — e chi ha finito la carica con un quarto dei modelli nel
     terreno difficile non ne prende nessuno (p. 128). Anche questa e'
     una regola che la Tappa 2 riconosceva senza poterla far pagare. */
  const cap = me.maxRank != null ? me.maxRank : 3;
  const rank = me.disrupted ? 0 : rankBonus(me.models || 0, me.frontage || 0, cap);
  const std = me.standard ? 1 : 0;
  const bsb = me.battleStandard ? 1 : 0;
  const flank = me.flank === "rear" ? 2 : me.flank === "flank" ? 1 : 0;
  const ground = me.highGround ? 1 : 0;
  const over = Math.max(0, Math.round(+me.overkill || 0));
  const out = OUTNUMBER_COUNTS && (+me.us || 0) > (+foe.us || 0) ? 1 : 0;

  const got = { wounds, rank, std, bsb, flank, ground, overkill: over, out };
  const parts = RESULT_PARTS.filter(p => got[p.id] > 0)
    .map(p => ({ ...p, v: got[p.id] }));
  const total = Object.values(got).reduce((s, v) => s + v, 0);
  return { ...got, parts, total,
           rankCapped: cap, disrupted: !!me.disrupted };
}

/* Il conto delle due parti insieme, con la parita' rotta dal musico:
   il musico non aggiunge un punto, decide un pareggio. Sta nel file
   della lista come profilo di comando. */
export function combatResult(a = {}, b = {}){
  const A = combatScore(a, b), B = combatScore(b, a);
  const diff = Math.abs(A.total - B.total);
  let loser = A.total === B.total ? "" : (A.total > B.total ? "B" : "A");
  let tie = "";
  if (!loser && !!a.musician !== !!b.musician){
    tie = a.musician ? "A" : "B";
    loser = a.musician ? "B" : "A";
  }
  return { A, B, diff, loser, tie, winner: loser ? (loser === "A" ? "B" : "A") : "" };
}

/* ============================================================
   4 · IL TEST DI ROTTA A TRE ESITI (p. 154)
   Qui il manuale ha cambiato regola davvero, e l'app faceva la
   vecchia: «passa o fugge», due esiti, come in tutte le edizioni di
   prima. In *The Old World* si guardano due numeri invece di uno — il
   tiro naturale e il tiro con lo scarto del combattimento addosso — e
   gli esiti sono tre, uno per ogni combinazione che puo' uscire:

     tutti e due sotto il Comando ...... cede terreno (2″, p. 134)
     naturale si', modificato no ....... ripiega in ordine (p. 134)
     naturale no ....................... rotta, e si fugge (p. 132)

   I tre esiti sono esattamente le tre mosse all'indietro che
   `charge.js` sapeva gia' fare dalla Tappa 2 e che finora si
   premevano a mano indovinando quale toccasse. Adesso e' il test a
   dirlo.

   Il terzo caso ha una sola combinazione perche' il tiro modificato
   non e' mai piu' basso del naturale: chi fallisce il naturale ha gia'
   fallito anche l'altro.

   L'ordine dei tre esiti non e' un'opinione: lo dicono due regole
   speciali il cui testo sta dentro le liste salvate. *Shieldwall*
   concede di «cedere terreno invece di ripiegare in ordine», quindi
   cedere e' meglio che ripiegare; *Stubborn* concede di «ripiegare in
   ordine invece di fare il test», quindi ripiegare e' meglio che
   tirare e rischiare la rotta.
   ============================================================ */
export const BREAK = {
  give:     { id:"give",     label:"Cede terreno",      move:"give",     verb:"cede terreno" },
  fallBack: { id:"fallBack", label:"Ripiega in ordine", move:"fallBack", verb:"ripiega in ordine" },
  rout:     { id:"rout",     label:"Va in rotta",       move:"flee",     verb:"va in rotta" },
};

/* La Forza d'Unita' schiacciante. Non e' una voce del risultato — vedi
   il §3 — ma una condizione del test, e chi lo dice e' il testo di
   *Stubborn*: quella regola vale «anche se la Forza d'Unita' di chi ha
   vinto e' piu' del doppio di quella di chi ha perso», cioe' in un
   caso in cui qualcosa normalmente non si potrebbe fare. La cosa che
   Stubborn concede e' il ripiegamento in ordine, quindi e' quello che
   il doppio toglie: sotto il doppio si ripiega, sopra si scappa.

   Questo e' l'unico punto di questo file dedotto da una regola
   speciale invece che letto sulla pagina del test: porta
   `daVerificare` e si spegne cambiando una costante. */
export const CRUSHING_BLOCKS_FALLBACK = true;
export const crushingUS = (winner = 0, loser = 0) => (+winner || 0) > 2 * (+loser || 0);

export function breakOutcome({ ld = 0, diff = 0, dice = [], ldMod = 0,
                               unbreakable = false, crushed = false,
                               stubbornNow = false } = {}){
  const target = Math.max(2, (+ld || 0) + (+ldMod || 0));
  const diffN = Math.max(0, +diff || 0);

  /* Due scorciatoie che non passano dai dadi, e sono scritte per
     esteso nelle liste salvate.

     *Unbreakable*: «non deve fare il test di rotta. Cede terreno,
     spinta indietro dal nemico». Non e' «tiene la posizione», che e'
     quello che l'app scriveva: l'unita' arretra comunque, solo non
     rischia niente.

     *Stubborn*: «la prima volta che deve fare un test di rotta puo'
     scegliere di non farlo e ripiega in ordine». E' una scelta che si
     fa *prima* dei dadi e una volta sola per partita — non un test al
     Comando pieno, che e' la versione delle edizioni di prima e quella
     che l'app applicava. */
  if (unbreakable)
    return done("give", { unbreakable:true, tested:false, ld:target, diff:diffN,
                          text:"Unbreakable: non tira il test, cede terreno spinta indietro" });
  if (stubbornNow)
    return done("fallBack", { stubborn:true, tested:false, ld:target, diff:diffN,
                              text:"Stubborn: sceglie di non tirare e ripiega in ordine" });

  const faces = (dice || []).map(v => +v || 0);
  const natural = faces.reduce((s, v) => s + v, 0);
  /* Il doppio uno passa sempre, per quanto disperata sia la
     situazione: e' la stessa riga che `leadershipTest` applica da
     sempre, e qui vale su tutti e due i confronti. */
  const insane = faces.length === 2 && faces[0] === 1 && faces[1] === 1;
  const modified = natural + diffN;

  const held = insane || modified <= target;
  const keptNerve = insane || natural <= target;
  const blocked = crushed && CRUSHING_BLOCKS_FALLBACK && !insane;
  const id = held ? "give" : (keptNerve && !blocked) ? "fallBack" : "rout";

  return done(id, {
    tested:true, dice: faces, natural, modified, ld: target, diff: diffN,
    insane, keptNerve, crushed: !!crushed, blocked,
    daVerificare: blocked, ldMod: +ldMod || 0,
    text: (insane ? "doppio uno: tiene i nervi qualunque fosse lo scarto"
                  : "Comando " + target + ", 2D6 = " + natural +
                    (diffN ? " e con lo scarto di " + diffN + " fa " + modified : "")) +
          (blocked ? " — e chi ha vinto ha più del doppio della Forza d'Unità: non si ripiega" : "") +
          " → " + BREAK[id].verb,
  });
}
function done(id, extra){
  return { ...BREAK[id], outcome:id, page: PAGE.breakTest,
           routed: id === "rout", tested:true, unbreakable:false, stubborn:false,
           insane:false, natural:0, modified:0, dice:[], ...extra };
}

/* Quanto vale il test senza tirarlo: le tre probabilita' esatte,
   enumerate sulle trentasei facce come fa `chargeChance`. Serve al
   pannello, che davanti a un assalto deve poter dire «questa qui, se
   perde di tre, una volta su quattro se ne va» — e serve a decidere
   se giocarsi lo Stubborn, che e' una scelta da fare prima dei dadi e
   una volta sola in tutta la partita. */
export function breakChances(ld, diff = 0, { ldMod = 0, crushed = false } = {}){
  const target = Math.max(2, (+ld || 0) + (+ldMod || 0));
  const penalty = Math.max(0, +diff || 0);
  const out = { give:0, fallBack:0, rout:0 };
  for (let a = 1; a <= 6; a++)
    for (let b = 1; b <= 6; b++){
      const nat = a + b, insane = a === 1 && b === 1;
      const blocked = crushed && CRUSHING_BLOCKS_FALLBACK && !insane;
      if (insane || nat + penalty <= target) out.give++;
      else if (nat <= target && !blocked) out.fallBack++;
      else out.rout++;
    }
  return { give: out.give / 36, fallBack: out.fallBack / 36, rout: out.rout / 36,
           ld: target, penalty, crushed: !!crushed };
}

/* ============================================================
   5 · INSEGUIMENTO, SFONDAMENTO, UNITA' TRAVOLTA (p. 156)
   Chi vince e si trova davanti il vuoto va avanti lo stesso: se il
   perdente e' fuggito lo insegue, e se lo raggiunge lo travolge; se il
   perdente non c'e' piu' — annientato sul posto — quello che fa si
   chiama sfondamento.

   Il tiro e' lo stesso della fuga: due D6 sommati, piu' un D6 per il
   passo lungo (p. 178). Non e' il tiro di carica, che di dadi ne
   tiene uno solo — ed e' l'errore che il §2 del piano racconta.
   ============================================================ */
export function pursuitDice(swift = false){
  const n = swift ? 3 : 2;
  return {
    id:"inseguimento", kind:"d6", n, keep:n, drop:"none", swift: !!swift,
    why:"quanto insegue",
    foot: swift ? "Due D6 sommati, piu' il D6 del passo lungo (p. 178)."
                : "Due D6 sommati (p. 156).",
  };
}

export function pursuitOutcome({ roll = 0, flee = 0, wiped = false, canPursue = true } = {}){
  const inches = Math.max(0, +roll || 0);
  if (!canPursue)
    return { kind:"none", caught:false, inches:0, page:PAGE.pursuit,
             text:"non insegue" };
  if (wiped)
    return { kind:"overrun", caught:false, inches, page:PAGE.pursuit,
             text:"sfonda di " + inches + "″: davanti non c'è rimasto nessuno" };
  const away = Math.max(0, +flee || 0);
  const caught = inches >= away;
  return {
    kind:"pursuit", caught, inches, flee: away, page:PAGE.pursuit,
    text: caught
      ? "insegue di " + inches + "″ e raggiunge chi fuggiva di " + away + "″: unità travolta"
      : "insegue di " + inches + "″, chi fuggiva ne fa " + away + "″ e si salva",
  };
}

/* ============================================================
   6 · LE SFIDE
   Di una sfida l'app puo' fare una cosa sola bene, e la fa: contare.
   Chi la lancia, chi la raccoglie e chi la rifiuta sono decisioni da
   tavolo, e restano a chi gioca — con la differenza che adesso il
   registro se le ricorda.

   Quello che invece e' un conto e' l'overkill: le ferite in piu' di
   quelle che sarebbero bastate a stendere l'avversario non si perdono,
   contano nel risultato del combattimento. Un eroe che ne fa cinque a
   uno che ne aveva due porta tre punti alla sua parte, ed e' la
   ragione per cui una sfida vinta bene ribalta un assalto perso.
   ============================================================ */

/* Il tetto: il piano nomina l'overkill senza dire se il manuale gliene
   metta uno. Qui non ce n'e', la riga e' una sola e chi trova il tetto
   la cambia in un punto. `daVerificare` dice che questo numero non e'
   stato letto sul libro — la stessa onesta' della tabella dei tipi di
   truppa. */
export const OVERKILL_CAP = 0;          // 0 = nessun tetto

export function overkill(wounds = 0, left = 1, { cap = OVERKILL_CAP } = {}){
  const need = Math.max(0, Math.round(+left || 0));
  const done = Math.max(0, Math.round(+wounds || 0));
  const extra = Math.max(0, done - need);
  const counted = cap > 0 ? Math.min(extra, cap) : extra;
  return {
    wounds: done, need, extra, counted, cap,
    daVerificare: cap === 0,
    nota: cap === 0 ? "se il manuale mette un tetto all'overkill va scritto in OVERKILL_CAP" : "",
    why: counted
      ? counted + " di overkill: " + done + " ferite su " + need + " che bastavano"
      : "",
  };
}

/* La sfida come riga di registro: chi la lancia, chi la raccoglie, e
   cosa l'app non arbitra. Torna sempre, anche quando nessuno accetta,
   perche' una sfida rifiutata e' comunque successa. */
export function challenge({ from = "", to = "", accepted = null } = {}){
  const who = String(from || "qualcuno");
  const whom = String(to || "");
  return {
    from: who, to: whom,
    accepted: accepted === null ? null : !!accepted,
    page: PAGE.fight,
    text: accepted === false
      ? who + " lancia una sfida" + (whom ? " a " + whom : "") + ": rifiutata"
      : accepted === true
        ? who + " e " + (whom || "l'avversario") + " si affrontano in una sfida"
        : who + " lancia una sfida" + (whom ? " a " + whom : ""),
    nota: "chi può raccoglierla e cosa costa rifiutarla lo decidete voi: " +
          "l'app conta le ferite in più (overkill) e tiene la riga nel registro",
  };
}

/* ============================================================
   7 · IL TERRENO PIU' ALTO
   Una voce del risultato che non e' un profilo ne' un dado: e' una
   domanda sul tavolo, e l'unica risposta onesta e' quella di chi lo
   guarda. Qui c'e' solo la forma della risposta, cosi' il pannello e
   il motore la scrivono nello stesso modo.
   ============================================================ */
export const HIGH_GROUND = [
  { id:"", label:"in piano" },
  { id:"me", label:"sono io più in alto" },
  { id:"foe", label:"è il nemico più in alto" },
];
export const highGroundFor = (choice, tag) => choice === (tag === "A" ? "me" : "foe");

/* ============================================================
   8 · LA SCHEDA CHE IL CONTO VUOLE
   Da una schiera di `combat.js` alla scheda piatta del §3. Sta qui e
   non li' perche' e' la traduzione fra due vocabolari, e le traduzioni
   vanno tenute dalla parte di chi le legge.
   ============================================================ */
export function scoreCardOf(c = {}, wounds = 0){
  return {
    wounds,
    models: c.models || 0, frontage: c.frontage || 1,
    maxRank: c.troop ? c.troop.maxRank : 3,
    standard: !!c.standard, battleStandard: !!(c.flags && c.flags.battleStandard),
    flank: c.flank || "", highGround: !!c.highGround,
    overkill: c.overkill || 0, disrupted: !!c.disrupted,
    musician: !!c.musician, us: (c.usPer || 1) * (c.models || 0),
  };
}
