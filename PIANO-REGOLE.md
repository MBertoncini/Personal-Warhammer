# Piano: le regole del manuale dentro l'app

> **Cosa è.** Il piano per passare da *simulatore di schieramento con
> qualche conto* a *simulatore di partita*: un'app in cui si importa una
> lista da New Recruit e si gioca davvero — profili, regole speciali,
> equipaggiamento, modificatori, magia, contatti di basetta, tiro,
> terreno — senza tenere a mente il manuale.
>
> **Cosa non è.** Un elenco di funzioni da spuntare. È l'ordine in cui
> vanno fatte le cose e il perché di quell'ordine: quasi ogni pezzo di
> questo lavoro dipende da un pezzo precedente, e sbagliare l'ordine
> vuol dire riscrivere due volte il motore.
>
> Riferimenti per pagina, quando servono a ritrovare la regola. Dal §0
> al §7 il libro è sempre il **Core Rulebook** (edizione 2023); dal §8
> in poi ogni tabella dice il suo. Il testo dei manuali non sta qui:
> sta nei manuali.

---

## 0 · Da dove si parte davvero

Prima di elencare quello che manca, conviene guardare quello che c'è,
perché è molto più di quanto sembri e cambia le priorità.

| C'è già | Dove | Vale per |
|---|---|---|
| Import New Recruit/BattleScribe: profilo, tipo di truppa, taglia, armi (F, PA, gittata, regole), regole dell'unità, comando, basetta, punti, fazione, armatura e salvezze quando dichiarate | `parser.js` | tutto |
| Geometria vera dei pezzi: ingombro reale della formazione, non `larghezza × fronte` | `formation.js` | movimento, contatti, sagome |
| Contatti di basetta con il **lato** toccato | `formation.js`, `deploy.js` | fronte/fianco/retro, risultato del combattimento |
| Ventagli di movimento che conoscono terreno difficile, impassabile, bordo e volo | `tactics.js` | carica, movimento |
| Linea di vista con le ombre degli elementi che bloccano | `tactics.js` | tiro, dichiarazione di carica |
| Punteggi da fare, pool di dadi, ranghi, test di Comando | `rules.js` | tutto |
| Assalto simulato completo con iniziativa, urto, veleno, perfora-armature, colpo mortale, ferite, ranghi, stendardo, fianco, test di rotta | `combat.js` | corpo a corpo |
| Registro delle regole lette dalla lista: applicate / altrove / sconosciute | `rulebook.js` | onestà del conto |
| Dadi veri: D6, D3, artiglieria, deviazione, generatore crittografico, vassoio in 3D | `dice.js`, `dicebox.js` | tutto |
| Turni, fasi, perdite modello per modello, ferite, etichette, contatori, fotografie di fine turno, battle report | `game.js`, `battlelog.js` | il giro della partita |
| Annulla/rifai su tutto lo stato del tavolo | `history.js` | indispensabile a un motore di regole |

**Il pezzo grosso che manca non è nessuna di queste. È il motore**: oggi
ogni conto è una funzione che si chiama a mano da un pannello. Un
simulatore ha bisogno di uno **stato della partita** che avanza per
azioni, di una **coda di effetti** e di regole che si agganciano ai
momenti giusti. Tutto il resto è dati da trascrivere.

---

## 1 · La decisione di fondo, e va presa esplicitamente

Il progetto ha un principio scritto in prima riga: *l'app sa geometria,
quantità e memoria; non sa mai legalità*. Questo piano lo cambia. Vale
la pena cambiarlo con gli occhi aperti, perché quel principio non era un
capriccio: proteggeva da due cose che uccidono le app da tavolo — dare
risposte sbagliate con l'aria di essere sicure, e invecchiare a ogni FAQ.

La forma che conserva il valore del principio e permette comunque di
implementare il manuale è questa:

> **L'app propone, calcola e ricorda. Non impedisce mai.**
> Ogni decisione automatica si vede, si spiega e si scavalca con un clic.

In pratica, tre obblighi per ogni regola implementata:

1. **Tracciabile** — accanto al numero c'è da dove viene: «colpisce a
   4+ (AC 3 contro AC 4, p. 348)», «−1 lunga gittata», «−1 mosso».
   Questa è la funzione che `duel.js` già fa con le regole lette: si
   estende a tutto.
2. **Scavalcabile** — il valore proposto è un campo modificabile. Se al
   tavolo decidete diversamente, l'app registra la vostra versione e va
   avanti senza discutere.
3. **Dichiarata incompleta** — quello che l'app non sa fare non sparisce
   in silenzio: finisce nell'elenco «non applicato», come oggi accade
   per le regole sconosciute.

Con questi tre obblighi si può implementare il manuale intero senza mai
diventare un arbitro che sbaglia in silenzio. Senza, il primo turno in
cui l'app si impunta su una carica legale è l'ultimo in cui la si usa.

---

## 2 · La correzione che viene prima di tutto — fatta

Leggendo il manuale per questo piano erano saltate fuori due cose che
non sono funzioni mancanti ma **numeri sbagliati**. Sono corrette in
`rules.js`, ed erano il vero punto di partenza: ogni cosa che questo
piano propone di costruire sarebbe stata costruita su quei due numeri.

**Il tiro per colpire in mischia.** L'app usava la regola classica di
Warhammer Fantasy: pari abilità 4+, più abile 3+, contro il doppio 5+.
In *The Old World* quella regola non c'è più. C'è una **tabella 10 × 10**
(p. 149, ristampata nel Quick Reference a p. 348) in cui esiste anche il
**2+**, e che si legge così:

| Rapporto fra le due Abilità Combattimento | Serve |
|---|---|
| più del doppio dell'avversario | 2+ |
| più abile, ma non il doppio | 3+ |
| pari, o meno abile ma non meno della metà | 4+ |
| meno della metà dell'avversario | 5+ |

Le celle in cui l'app sbagliava sono ai due estremi, e sbagliava in
tutte e due le direzioni: era **pessimista** contro un nemico molto più
abile e **avara** contro uno molto più scarso.

| Attaccante | Difensore | Manuale | Prima | Adesso |
|---|---|---|---|---|
| AC 2 | AC 4 | 4+ | 5+ | 4+ |
| AC 3 | AC 6 | 4+ | 5+ | 4+ |
| AC 3 | AC 1 | 2+ | 3+ | 2+ |
| AC 5 | AC 2 | 2+ | 3+ | 2+ |

Nella stessa correzione è entrato l'altro capo della regola: chi ha
**Abilità Combattimento 0 non sa difendersi** e viene colpito senza
tirare (p. 98). Prima l'app gli faceva tirare a 4+; adesso `hitMelee`
torna `AUTOHIT` e il pannello dello scontro scrive «colpi automatici»,
che è la riga che già mostrava per le ferite d'urto.

**La tabella per ferire.** Questo piano diceva che era già giusta. Non
lo era. La formula c'era, ma si fermava troppo presto: l'app dichiarava
impossibile ferire da quattro punti di Resistenza in più, mentre il
manuale (p. 150) tiene il **6+** fino a **cinque** punti di scarto e
vieta solo dal sesto. Una Forza 3 ferisce ancora una Resistenza 8; per
l'app non la scalfiva. È l'errore che pesa di più quando la fanteria di
linea si trova davanti un mostro, cioè quasi ogni partita.

Le prove di `test/battle.mjs` coprono adesso tutte e due le tabelle agli
estremi, comprese le quattro celle qui sopra.

---

## 3 · I dati: da un file New Recruit a un'unità giocabile

### 3.1 · Quello che il file dà

Il parser di oggi già tira fuori: caratteristiche, tipo di truppa,
numero di modelli, basetta, punti, fazione, gruppo di comando, armi con
Forza/PA/gittata/regole, elenco delle regole speciali per nome, e
armatura/salvezza speciale **quando il catalogo le dichiara**.

### 3.2 · Quello che il file non dà mai

Ed è la parte che decide se il simulatore è usabile, perché sono cose
che vanno chieste una volta e ricordate:

- **Chi è il generale** e chi porta lo **stendardo da battaglia** (spesso
  deducibile dalle regole, non sempre).
- **Gli incantesimi generati**: si tirano prima dello schieramento
  (p. 106), il file dice solo il dominio e il livello.
- **Le scelte di equipaggiamento ambigue**: quale arma impugna chi ne ha
  due, se lo scudo è in uso, se l'arma a due mani è quella del turno.
- **Gli oggetti magici** che i cataloghi scrivono come testo libero.
- **Le regole d'esercito** (Army Special Rules): stanno negli army book,
  non nel manuale base.

Serve quindi una **scheda di preparazione della lista**: una schermata
che si compila una volta per lista e resta salvata, con le domande che il
file lascia aperte. È lavoro poco spettacolare e ad altissimo rendimento:
senza, ogni partita comincia con dieci minuti di correzioni a mano.

### 3.3 · La forma di un'unità in partita

Lo stato di oggi (`u.models`, `u.lost`, `u.wounds`, `u.tags`…) va esteso,
non sostituito. Aggiunte necessarie:

```
unit: {
  … quello che c'è già …
  troop:      { category, sub, perRank, maxRank, usPerModel },  // tabella p. 105
  formation:  "close" | "open" | "skirmish" | "column",
  facing:     rad,           // c'è già
  state:      "ready" | "fleeing" | "rallied" | "engaged" | "destroyed",
  moved:      { kind: "none"|"move"|"march"|"charge"|"flee"|"reform", inches },
  fought:     boolean,       // ha già combattuto in questa fase
  charged:    { target, inches, arc },   // serve all'Iniziativa (+1 per pollice)
  disrupted:  boolean,       // terreno difficile, ostacolo a cavallo (p. 269)
  effects:    [ { id, source, until, mods } ],   // incantesimi e regole a tempo
  models:     [ { id, alive, wounds, isChar, profileId } ],  // già in formeditor
}
```

Il campo che porta più valore di tutti è **`effects`**: incantesimi,
maledizioni, benedizioni e regole a tempo sono la ragione per cui a metà
partita nessuno ricorda più i modificatori. Un effetto è `{ chi, cosa,
fino a quando }`, e ogni caratteristica letta dal motore passa da una
funzione `stat(unit, "WS")` che applica gli effetti attivi e sa dire
**da dove viene ogni modificatore**. Questa funzione va scritta presto:
scriverla dopo vuol dire ripassare ogni conto già fatto.

### 3.4 · Il registro delle regole speciali

`rulebook.js` è già il posto giusto, ma oggi conosce undici regole e le
applica solo dentro un assalto. Deve diventare un **registro di regole
agganciate a momenti**:

```
{
  id:    "furiousCharge",
  match: /^furious charge/i,
  what:  "un attacco in più per modello nel turno in cui carica",
  page:  171,
  hooks: { onCharge(ctx){ … }, onAttacks(ctx){ … } },
}
```

Le regole universali del manuale sono un'ottantina (pp. 166-181). Non
vanno fatte tutte: vanno fatte **quelle che compaiono nelle liste che
giochi davvero**, e l'app lo sa già — l'elenco «regole che non conosco»
del pannello dello scontro è, letteralmente, la lista della spesa
ordinata per frequenza. Il primo lavoro è renderla persistente: un
contatore di quante volte ogni regola sconosciuta è comparsa nelle
partite. Da lì si implementa dall'alto.

E una parte della lista si può già leggere adesso, senza aspettare il
contatore: passando `readRules` sulle dieci liste salvate restano fuori
otto nomi, e sono pochi e piccoli — *Immune To Psychology*, *Magical
Attacks*, *Move or Shoot*, *Cumbersome*, *Ponderous*, *First Charge*,
*Lightning Strike*. Undici altri finiscono in «altrove» perché si
giocano in un momento che l'assalto non attraversa. Il registro, in
altre parole, è già quasi in pari con il manuale base: il lavoro grosso
che resta sono le regole d'esercito del §8.

---

## 4 · Il motore: la parte che oggi non c'è

### 4.1 · La macchina delle fasi

Il manuale è esplicito: quattro fasi, ciascuna di quattro sotto-fasi
(pp. 115-117, 118, 136, 144). Sedici caselle in tutto, sempre nello
stesso ordine, e quasi tutte le regole sono attaccate a una casella.
`game.js` oggi conosce le quattro fasi: va portato alle sedici
sotto-fasi, con le regole del passaggio (cosa si può fare qui, cosa no).

| Fase | Sotto-fasi |
|---|---|
| Strategia | inizio turno · comando · congiurazione (incantesimi di potenziamento e maledizione) · raduno dei fuggitivi |
| Movimento | dichiarazione cariche e reazioni · mosse di carica · mosse obbligate · mosse restanti (e incantesimi di trasporto) |
| Tiro | scelta unità e bersaglio · per colpire · per ferire e salvezze · perdite e test di Panico |
| Corpo a corpo | scegli e combatti · risultato del combattimento · test di rotta · inseguimento |

Questa struttura da sola vale metà del progetto: è la cosa che al tavolo
si sbaglia più spesso (incantesimi lanciati nella fase sbagliata, tiro
dopo aver marciato, raduno dimenticato).

### 4.2 · Azioni, non chiamate di funzione

Ogni cosa che succede diventa un oggetto: `{ type:"declareCharge", unit,
target }`, `{ type:"shoot", unit, target, weapon }`, `{ type:"cast",
wizard, spell, target }`. Il motore le valida, le esegue, produce
**effetti** e **richieste di dado**, e le scrive nel registro.

Tre vantaggi che non si ottengono altrimenti:

- **L'annulla funziona già** (`history.js` fa copie dello stato): una
  partita si riavvolge di tre azioni senza codice nuovo.
- **Il battle report si scrive da solo** e diventa una cronaca vera,
  non un elenco di posizioni.
- **Le prove diventano possibili**: una partita è una lista di azioni,
  quindi una prova è una lista di azioni più i dadi fissati.

### 4.3 · I dadi come parte del motore

Il vassoio appena fatto è già il pezzo giusto: `dice.js` accetta una
sorgente sostituibile (`setSource`), quindi il motore può girare con
dadi decisi per le prove e con il generatore vero in partita. La forma
da adottare: il motore **non tira** — *chiede*. `{ need:"2D6",
why:"carica", who }` esce dal motore, il vassoio lo mostra, il risultato
rientra. Così ogni tiro passa da un posto solo, si vede, si annota nel
registro e si può ritirare quando una regola lo consente (i ritiri sono
una regola a sé, p. 93: un dado non si ritira due volte).

### 4.4 · Le regole come ascoltatori

L'alternativa — condizioni annidate dentro il codice delle fasi — è la
strada che rende impossibile aggiungere un army book. Ogni regola
speciale si registra su uno o più momenti (`onDeclareCharge`,
`onChargeReaction`, `onToHit`, `onToWound`, `onSave`, `onCombatResult`,
`onBreakTest`, `onPanic`, `onMove`, `onTerrain`) e riceve un contesto che
può modificare, lasciando traccia di cosa ha cambiato. La traccia è ciò
che rende ogni numero spiegabile.

---

## 5 · Geometria: cosa manca a quella che c'è

Qui il progetto parte molto avanti. Quello che manca è preciso:

1. ~~**Archi di fronte, fianco e retro** come settori calcolati dalla
   basetta~~ — fatto nella Tappa 0 (`formation.js`), e da lì li legge
   la dichiarazione di carica.
2. ~~**Allineamento della carica**: portare il caricante a contatto e
   ruotarlo a filo del bersaglio~~ — fatto (`charge.js`, `alignTo`): la
   faccia non è la più vicina, è quella che *guarda* il caricante, che
   è cosa diversa su un bersaglio lungo. Resta l'eccezione
   dell'ostacolo difeso; la *carica disordinata* (p. 270) c'è.
3. ~~**La ruota** (*wheel*) e il pivot~~ — il costo c'è
   (`wheelCost`: lo spigolo esterno percorre un arco di raggio pari al
   fronte), e l'allineamento dice di quanti gradi si gira. Quello che
   manca è scalarlo da un budget di movimento.
4. ~~**Il massimo di carica** e la carica impossibile~~ (p. 119) —
   fatto, e con la probabilità esatta accanto: «serve un 8, sono
   quattordici volte su trentasei», che è l'informazione per cui uno
   apre l'app invece del manuale.
5. ~~**La regola del pollice**~~ (p. 118) — fatta come vincolo
   (`tooClose`) e come scostamento minimo automatico (`nudgeClear`)
   dopo la carica corta, la fuga e il cedimento.
6. ~~**Fuga, cedimento (*Give Ground*, 2″ indietro), ripiegamento e
   inseguimento**~~ — fatti (pp. 154-155): una direzione lontano dal
   nemico con la Forza d'Unità più alta, in diagonale quando i più
   grossi sono due, e i pollici che il vassoio ha tirato.
7. **Sagome**: cerchio da 3″ e da 5″, goccia da 8″ (p. 95), con la
   regola «sotto del tutto = colpito, sotto in parte = 4+». La
   deviazione c'è già nel vassoio: manca il pezzo che la applica sul
   tavolo, cioè una sagoma che si sposta di N pollici in una direzione.
8. **Terreno per categoria** (pp. 269-270): aperto, difficile,
   pericoloso, impassabile, ostacolo basso, ostacolo alto, bosco. Oggi i
   tipi di terreno sono grafici e uno o due sono trattati come
   bloccanti. Ogni pezzo di terreno deve dichiarare la sua categoria, e
   da lì discendono: −1 al movimento, la carica che tiene il dado
   *peggiore*, il test di terreno pericoloso, l'unità *disordinata* che
   perde i ranghi, la copertura, e la penombra del bosco che taglia la
   linea di vista fra due unità entrambe fuori dal bosco.

Il punto 8 è il più sottovalutato: quasi tutte le regole di terreno sono
già rappresentabili con quello che l'app disegna, manca solo il campo
che dice **che tipo di terreno è**. Il campo c'è dalla Tappa 0, e dalla
Tappa 2 la carica lo legge: il pezzo attraversato dice se rallenta, se
fa tenere il dado peggiore, se chiede il test di terreno pericoloso e
se fa arrivare in disordine. Restano il punto 7 (le sagome, che sono
della Tappa 4) e le due eccezioni dell'ostacolo difeso.

---

## 6 · Le fasi, una per una

Per ogni fase: cosa l'app può fare da sola, e cosa resta ai giocatori.

### Strategia
- **Inizio turno**: promemoria degli effetti che scadono, arrivo degli
  imboscati (D6 dal secondo round, automatico dal quinto).
- **Comando**: elenco delle abilità usabili adesso, una per modello.
- **Congiurazione**: il ciclo della magia — vedi §6.5.
- **Raduno**: test di Comando per ogni unità in fuga, con i modificatori
  per le perdite (sotto metà: −1; sotto un quarto: passa solo col doppio
  uno, p. 117). L'app sa quanti modelli sono partiti: è un conto che fa
  meglio di chiunque.

### Movimento
- ~~Dichiarazione delle cariche con **controllo di visibilità, arco e
  distanza massima**, e la regola che obbliga a dichiarare la carica
  anche contro le unità che si finirebbe per toccare.~~ Fatto nella
  Tappa 2; il vicino che si finisce per toccare è una riga di registro,
  non un divieto.
- ~~**Reazioni**: tenere, tirare e tenere, fuggire (p. 120), con il
  controllo che il *tira e tieni* non sia possibile sotto la distanza
  pari al Movimento del caricante.~~ Fatto. La raffica del *tira e
  tieni* si tira ancora dal pannello del tiro.
- ~~Tiro di carica: 2D6 (3D6 scartando il minore col passo lungo, già
  fatto), tenendo il **peggiore** attraverso il terreno difficile.~~
  Fatto, con il numero di dadi del terreno difficile dichiarato da
  verificare.
- Mosse obbligate, poi le restanti, con il conto di quanti pollici sono
  stati fatti — l'ancora di movimento c'è già e fa esattamente questo.
  Le obbligate vere (frenesia, stupidità) arrivano con la Tappa 5.

### Tiro
- Chi può tirare: non ha caricato, non ha marciato, non è in mischia,
  non è in fuga (p. 137).
- Chi vede e chi è in gittata, modello per modello: c'è già il campo di
  tiro, va portato al conteggio per modello.
- Modificatori: mosso, lunga gittata, tira e tieni, copertura parziale,
  copertura piena — cumulativi (p. 138). Il pannello li scrive già uno
  per uno, va agganciato alle condizioni vere invece che alle caselle.
- L'1 naturale non colpisce mai; AB 6+ ha il ritiro con un secondo
  punteggio.
- Perdite e **test di Panico** oltre un quarto (p. 141).
- Macchine da guerra (pp. 222-229): bombardamento con deviazione,
  palla di cannone con rimbalzo, tabelle del Mancato Colpo. Il dado di
  artiglieria e quello di deviazione ci sono già; qui si aggiungono le
  sagome e le due tabelle di guasto.

### Corpo a corpo
- Chi combatte: fila che combatte, contatto di basetta, attacchi di
  appoggio (pp. 145-146). L'app conosce già i contatti modello per
  modello: è il posto in cui è più avanti del manuale medio.
- Ordine di Iniziativa **con il bonus della carica** (+1 per pollice
  intero percorso, fino a +3 di fronte e +4 di fianco o di retro,
  p. 146). Oggi il bonus non c'è: è una modifica piccola con effetti
  grandi.
- Risultato del combattimento: ferite, ranghi (uno per fila piena, con
  il minimo per fila e il massimo dal tipo di truppa, p. 105),
  stendardo, stendardo da battaglia, fianco +1, retro +2, terreno più
  alto +1, *overkill* nelle sfide. Oggi ne mancano tre.
- **Test di rotta a tre esiti** (p. 154): il manuale non ha più «passa o
  fugge». Si confronta il tiro naturale e il tiro modificato con il
  Comando, e ne escono *cede terreno*, *ripiega in ordine*, *rotta*.
  Questo è un cambio di regola vero rispetto a quello che `combat.js`
  fa adesso, e va fatto presto perché cambia la fine di ogni assalto.
- Inseguimento, sfondamento, unità travolta.

### Psicologia
Panico (pp. 160-161) con le sue quattro cause ricorrenti — perdite oltre
un quarto della Forza d'Unità, amico vicino distrutto, amico vicino che
lascia il combattimento, unità attraversata da chi fuggiva — più paura,
terrore, odio, stupidità, frenesia. Sono quasi tutte **misure di
distanza più un test di Comando**: due cose che l'app fa già bene.

### Magia
Il ciclo completo (pp. 106-112): domini e generazione degli incantesimi
prima della partita, sei categorie di incantesimo legate ognuna alla sua
fase, tiro di lancio 2D6 + livello, valore di lancio, **doppio 6 =
invocazione perfetta** (non dissolvibile), **doppio 1 = fiasco** con
tabella, dissolvimento (da mago, con gittata legata al livello, o
*affidato alla sorte*), doppio 6 in dissolvimento che slega comunque, e
gli incantesimi *che restano in gioco* con il dissolvimento nei turni
successivi contro il valore di lancio.

I domini nel manuale base sono otto (pp. 319-335) e ognuno ha sette
incantesimi: **cinquantasei schede** con valore di lancio, gittata,
categoria, durata ed effetto. Sono dati, non codice: vanno in un file
JSON con un piccolo vocabolario di effetti (`+1 Forza fino alla fine del
turno`, `il bersaglio non può marciare`, `D6 colpi a Forza 4`), e gli
effetti che il vocabolario non copre restano testo che l'app mostra e
non applica — dichiarandolo, come sempre.

---

## 7 · Quanto materiale c'è da trascrivere

Perché il piano sia onesto sui tempi, conviene contare i dati:

| Cosa | Quantità | Dove sta | Forma |
|---|---|---|---|
| Tabella per colpire in mischia | 10 × 10 | p. 149 | matrice — *fatta* |
| Tabella per ferire | formula = tabella | p. 150 | *fatta* |
| Tipi di truppa: modelli per fila, ranghi massimi, Forza d'Unità | 13 righe | p. 105 | tabella |
| Categorie di terreno e loro effetti | 7 | pp. 269-270 | tabella + regole |
| Regole speciali universali | ~80 | pp. 166-181 | registro con agganci |
| Incantesimi | 8 domini × 7 | pp. 319-335 | dati + vocabolario di effetti |
| Macchine da guerra | 6 tipi | pp. 223-229 | procedure |
| Tabelle del Mancato Colpo | 2 | p. 347 | tabelle |
| Tabella del fiasco | 1 | p. 109 | tabella |
| Armi da mischia e da tiro | ~20 | pp. 213-219 | profili |
| Armature ed equipaggiamento | ~10 | pp. 220-221 | profili |
| *Battle March*: due tabelle a D6, sei mappe, oggetti | — | §8.1 | tabelle + dati |
| Regole d'esercito dei tre eserciti di casa | 10 + 5 + Lucertola | §8.2, §8.3 | file per esercito |

Le regole speciali e gli incantesimi sono i due mucchi grossi, e sono
anche i due che **si possono fare a fette**: dieci regole per volta,
scelte per frequenza; un dominio per volta, scelto da chi gioca in casa.

Quello che **non** sta nel manuale base — regole d'esercito e oggetti
magici degli army book — deve stare fuori dal codice fin dal primo
giorno: un file di dati per esercito, che si aggiunge senza toccare il
motore. È l'unica difesa contro l'invecchiamento. E non è un pericolo
lontano: quei libri sono già sullo scaffale, ed è il paragrafo che segue.

---

## 8 · I libri nuovi sullo scaffale

Fino a qui il piano parlava del solo manuale base. Adesso accanto ce ne
sono altri tre, e non sono tre libri qualsiasi: sono esattamente i tre
che servono alle partite che si giocano davvero in questa casa. Le
dieci liste salvate in `dati/liste.json` lo dicono senza margine di
dubbio — otto sono *Battle March* fra Orchi e Goblin e Uomini
Lucertola, due sono Skaven — e i tre libri coprono uno per uno quel
triangolo:

| Libro | Cosa porta | A chi serve qui |
|---|---|---|
| *Battle March – General's Companion* | il formato delle partite piccole, con i suoi obiettivi e le sue tabelle | a nove liste su dieci |
| *Ravening Hordes* | quattro liste d'esercito complete, fra cui Orchi e Goblin | a quattro liste |
| *Skaven – Legacy Army List* | la lista Skaven, con regole, oggetti e dominio propri | a due liste |

Sommati al *Legends: Lizardmen* che c'era già, coprono il 100% di quello
che si porta al tavolo. Questo cambia l'ordine del piano: le regole
d'esercito smettono di essere «l'estensione da prevedere» del §7 e
diventano **metà del lavoro utile**.

### 8.1 · Battle March — il formato che si gioca davvero

Non è un supplemento di regole speciali: è il **formato** di queste
partite, scritto per esteso. E l'app lo gioca già a metà senza saperlo,
perché i quattro scenari del gruppo «Battle March» in `scenarios.js`
sono già tavoli piccoli con i tesori sopra, disegnati a mano prima di
avere il libro.

Cosa aggiunge, dal più vicino a essere pronto al più lontano:

| Regola | Pag. | Quanto manca |
|---|---|---|
| **Controllo degli obiettivi**: a fine turno un obiettivo è controllato da una sola unità entro 3″ con Forza d'Unità 5 o più, non in fuga e non stupida; a pari distanza vince la Forza d'Unità, a pari forza è *conteso* | 25 | poco: distanze e Forza d'Unità ci sono già, manca il conto di fine turno |
| **Sei mappe di schieramento** tirate su D6 — campale, incontro ravvicinato, fianchi opposti, scontro d'incontro, passo di montagna, aggiramento | 26-27 | poco: `zones.js` disegna già qualunque zona a mano, e cinque delle sei ci sono |
| **Composizione della lista**: 400-750 punti, minimo due unità non-personaggio, nessuna unità sopra Forza d'Unità 20, tetti al 25% per personaggio, 35% Core, 30% Speciale, 25% Raro, e la deroga «0-X per 1.000 punti» | 23 | è un controllo sulla lista, non sul tavolo: sta nella scheda di preparazione del §3.2 |
| **Obiettivi della partita** tirati su D6: due tesori, tre tesori, oppure un solo *strategic landmark* — basetta da 100 mm, impassabile, blocca la linea di vista — con la sua tabella di proprietà (Resistenza alla Magia, Frenesia, Testardo) | 24-25 | il tesoro c'è; il landmark è un tipo di terreno nuovo, e blocca la vista come il monolite che l'app già disegna |
| **Terreno Selvaggio**: ogni terreno naturale in cui un'unità finisce il movimento si tira un D6 e si scopre cos'era — roveto, posizione difendibile, spore tossiche, magia residua, erbe curative, la tana del Troll (col profilo del Troll Infuriato) | 40 | un D6 attaccato a un pezzo di terreno |
| **Il Caso della Guerra**: dal secondo turno, chi ha cominciato tira un D6 all'inizio del proprio turno; se esce pari o meno del numero del turno, succede qualcosa a tutta la partita — venti di magia instabili, munizioni che si diradano, un carro perso al centro del tavolo, tesori che valgono di più, partita a sei round, mercenari erranti | 41 | tabella + effetti che durano fino a fine partita |
| **Obiettivi secondari**: *Raid & Burn* (distruggere un tesoro tenendolo a contatto per un turno, 30 PV) e i carri bagagli — attacco al convoglio, scorta — con i loro punti vittoria | 36-37 | procedure di fine turno più un pezzo nuovo sul tavolo |
| **Oggetti magici del formato**: cannocchiale, occhio di Numas, mappa, almanacco, tre pergamene, scheggia di wyrdstone | 46-48 | dati |

Due di queste — **Terreno Selvaggio** e **Caso della Guerra** — meritano
di essere fatte *prima* di mezzo motore delle fasi, e non per
importanza: perché sono due tabelle a D6 che l'app può tirare, mostrare
e annotare nel diario senza sapere nient'altro, e perché sono la parte
di partita che al tavolo si dimentica sempre. Sono il caso perfetto
della regola del §1 — l'app propone il tiro, dice cos'è uscito, e chi
gioca decide cosa farne — e costano quanto un pomeriggio.

E c'è una conseguenza che conviene vedere adesso, non dopo. Il punto 8
del §5 diceva che ogni pezzo di terreno deve dichiarare la sua
**categoria** (aperto, difficile, pericoloso, impassabile, ostacolo,
bosco). Il Terreno Selvaggio ne chiede un secondo accanto: **naturale o
no**, perché la tabella si tira solo sui terreni naturali. Due campi,
non uno, e il momento per deciderlo è prima di scrivere il primo.

### 8.2 · Ravening Hordes — il primo army book vero

Quattro liste in un volume: Orchi e Goblin (p. 11), Guerrieri del Caos
(p. 55), Uomini Bestia (p. 91), Re dei Sepolcri (p. 125). Ognuna con la
stessa impalcatura — composizione, profili divisi in sei categorie,
oggetti magici propri, regole d'esercito, un dominio di magia in più —
e qui serve la prima, ma la struttura è la stessa per tutte e quattro,
il che è precisamente il motivo per cui va letta come **formato di
file** e non come contenuto.

Le dieci regole degli Orchi e Goblin (pp. 45-46) sono una lista della
spesa già ordinata, perché mostrano quali *primitive* mancano al motore
più ancora di quali regole:

| Regola | Cosa fa | Cosa chiede al motore |
|---|---|---|
| Warpaint | salvezza speciale 6+, ma niente armatura | niente: `def.ward` c'è già |
| Big 'Uns | +1 Forza in mischia e Perfora-Armature (1) | il modificatore di caratteristica del §3.3; il resto `rulebook.js` lo sa |
| Choppas | in carica, ritira gli 1 naturali per ferire e migliora la perforazione di 1 | **il ritiro** |
| Carica delle Zanne | in carica il cinghiale mena a F+1 e PA -1, il cavaliere no | il **profilo diviso** cavaliere/cavalcatura |
| Waaagh! | una volta per partita, test di Comando nella sotto-fase di comando: ritiro degli 1 per colpire e +1 al risultato del combattimento | la macchina delle fasi, lo stato «già usato», il ritiro |
| Da Boyz | un Boss di Orchi Neri per ogni reggimento di Orchi Neri | vincolo di lista, non di tavolo |
| Paura degli Elfi · Ignora il Panico dei Goblin · Ignora il Panico · Frena l'Impetuosità | psicologia condizionata a chi hai vicino | il sistema di Panico della Tappa 5 |

Ne escono tre cose che il piano non aveva nominato:

1. **Il ritiro è una primitiva mancante.** `rules.js` sa tirare un pugno
   di dadi contro un punteggio, non sa ritirarne una parte. Serve a
   Choppas, al Waaagh!, alla Maledizione di Mork, all'Abilità Balistica
   6 e oltre (p. 139), e a un terzo degli oggetti magici di ogni libro.
   È mezza giornata di lavoro adesso e una riscrittura fra sei mesi.
2. **Il profilo diviso** cavaliere/cavalcatura, carro/equipaggio/bestie
   (pp. 193, 195) non è un dettaglio di cavalleria: metà delle regole
   d'esercito dice «questo vale per la cavalcatura, non per chi ci sta
   sopra». Senza, quelle regole non si possono nemmeno scrivere.
3. **I domini in più.** Gork e Mork (p. 47) aggiungono due incantesimi
   ciascuno ai domini del manuale base, con la regola dello scambio:
   un mago può scartare un incantesimo generato a caso e prendere al suo
   posto la firma del dominio *oppure* uno di questi. Non è un nono
   dominio, è un innesto sugli otto — e va previsto nel formato del file
   degli incantesimi del §6, altrimenti lo si rifà.

### 8.3 · Skaven — l'esercito che gioca dall'altra parte

Venticinque pagine, una lista sola, ma le sue cinque regole d'esercito
(p. 23) toccano ognuna una parte diversa del motore, e due toccano
codice che esiste già:

- **Vento Velenoso** — il 6 per ferire riesce sempre, anche contro una
  Resistenza fuori portata, e non concede armatura (speciale e
  rigenerazione sì). È l'eccezione esatta al limite che il §2 ha appena
  corretto: la tabella per ferire adesso si ferma a sei punti di scarto,
  e questa regola la scavalca. In `combat.js` è un pool a parte, come il
  veleno che c'è già.
- **Fuga Precipitosa** — +1 al tiro di fuga. `fleeRoll` in `rules.js`
  oggi non accetta modificatori: una riga.
- **Masse Brulicanti** — a 3″ da un'unità amica il Comando sale del
  bonus di ranghi di quell'unità, fino a 10. Distanza e `rankBonus` ci
  sono entrambi: è il tipo di conto che l'app fa meglio di chiunque al
  tavolo, dove non se lo ricorda nessuno.
- **Valore Verminoso** — il personaggio si ritira nelle file di dietro e
  smette di menare e di essere menato. È una posizione di modello dentro
  l'unità, e `formeditor.js` piazza già i modelli uno per uno.
- **Armi di Warpstone** — l'arma a una mano diventa magica e perfora di
  1. Stessa forma delle Lame d'Ossidiana già in `rulebook.js`: si
  aggiunge accanto.

Gli oggetti magici Skaven (p. 20) portano invece una cosa che il motore
non ha proprio: **l'uso singolo**. Sfera di Ottone, Skalm, Skavenbrew,
gettoni di warpstone — «una volta per partita, poi è finito» è uno stato
di partita, va nell'`unit.effects` del §3.3 e va salvato con il resto,
altrimenti l'annulla non lo riporta indietro.

### 8.4 · Cosa cambia nel piano

Non l'impianto: l'ordine, e in tre punti.

1. **Il formato dei file d'esercito viene prima, non dopo.** Il §7
   diceva che gli army book «devono stare fuori dal codice fin dal primo
   giorno». Adesso ci sono tre libri veri con cui provare quel formato,
   e provarlo su tre eserciti diversi è l'unico modo per sapere se
   regge. Va scritto nella Tappa 0, insieme alle correzioni.
2. **Due tabelle di Battle March salgono in cima.** Terreno Selvaggio e
   Caso della Guerra non dipendono da niente e si usano ogni partita:
   entrano nella Tappa 0, non nella Tappa 7 con gli scenari.
3. **Il ritiro e il profilo diviso entrano fra le fondamenta.** Sono due
   primitive, non due regole, e ogni regola d'esercito scritta prima di
   loro va riscritta dopo.

---

## 9 · Le tappe

Ogni tappa è **giocabile**: alla fine di ognuna la partita si fa,
appoggiandosi al manuale per il resto. Nessuna tappa richiede di
riscrivere la precedente.

**Tappa 0 — Le correzioni e le fondamenta dei dati. — fatta**
~~Tabella per colpire~~ e ~~tabella per ferire~~ (§2); ~~categoria *e
naturalità* su ogni pezzo di terreno~~ (`terrain.js`, sette categorie e
il campo `natural`, tutti e due scavalcabili sul singolo pezzo);
~~tabella dei tipi di truppa~~ (`troops.js`, tredici righe); ~~archi di
fronte, fianco e retro~~ (`formation.js`, e valgono su tutta la sagoma
del nemico, non su un punto); ~~`stat(unit, X)` con gli effetti e la
traccia dei modificatori~~ (`effects.js`); ~~scheda di preparazione
della lista~~ (`prep.js`, dentro il pannello Liste). Più le tre cose che
i libri nuovi avevano spostato in cima (§8.4): ~~il **ritiro** come
primitiva di `rules.js`~~ (`pool(n, need, "ones" | "misses" | "all")`,
con la regola che un dado non si ritira due volte), ~~il **profilo
diviso** cavaliere/cavalcatura~~ (il parser tiene tutti i profili di
modello, non più solo il primo), ~~e il formato del file d'esercito
provato su tre eserciti diversi~~ (`armies.js` e `dati/eserciti/`).
*Fatto quando*: l'ispettore mostra per ogni caratteristica il valore
base, i modificatori attivi e da dove vengono. **Lo fa**: la cella
spostata è sottolineata e porta il perché nel titolo, e sotto la
tabella c'è la riga per esteso — «Forza 4 (3 base, +1 Vento di Ghur
(p. 321))». Con la cavalcatura le righe sono due.

Quello che questa tappa ha trovato per strada, e non era in programma:
- **Le ferite d'urto con il più.** `Impact Hits (D3+1)`, `(D6+1)` e
  `Stomp Attacks (D3+1)` non venivano lette — la parentesi si fermava
  al dado — e finivano nel ripiego «una ferita per modello di fronte»,
  che è proprio l'errore che il ripiego doveva evitare. Sono tre unità
  fra le dieci liste salvate.
- **La Forza d'Unità data per scontata.** Dove il file non la dichiara
  — tutte le liste Skaven — si contava 1 per modello, e un Rat Ogre
  valeva come un chiavicaro. Adesso il ripiego è la tabella p. 105.
- **I ranghi senza tetto.** Il massimo di tre valeva per tutti; adesso
  viene dal tipo di truppa, e un colosso non prende ranghi.

**Tappa 0 bis — Le due tabelle di Battle March. — il motore c'è**
Terreno Selvaggio e Caso della Guerra (§8.1) stanno in
`battlemarch.js`, con il controllo degli obiettivi di p. 25 che era
lì accanto e costava poco. Le due tabelle tirano, dicono cos'è uscito
e dichiarano una cosa: il piano elenca i sei esiti di ognuna ma non
dice quale faccia porta a quale, e quello sta nel libro. Gli esiti
stanno nell'ordine in cui il piano li elenca, ogni tabella lo dichiara
con `ordineDaVerificare`, e chi ha il libro aperto corregge l'ordine
cambiando una riga. Resta da attaccarle al tavolo: il tiro sul pezzo di
terreno e la riga nel diario.
*Fatto quando*: si finisce una partita e il diario racconta cosa c'era
in quel bosco e cosa è andato storto al terzo turno.

**Tappa 1 — Il motore delle fasi. — fatta**
~~Le sedici sotto-fasi~~ (`phases.js`: la tabella con la pagina del
manuale, cosa ci si aspetta in ognuna, e i due modi di camminarci
sopra); ~~le azioni come oggetti~~ e ~~la coda degli effetti~~ e ~~le
richieste di dado che passano dal vassoio~~ e ~~il registro che si
scrive da solo~~ (`engine.js`). Nessuna regola nuova, come previsto:
quello che c'era è attaccato sopra.

Come si vede al tavolo. Sotto i quattro pulsanti delle fasi c'è adesso
la striscia delle quattro caselle di quella fase, e sotto ancora la
riga che dice cosa ci si aspetta qui e a che pagina sta. Le frecce ‹ ›
camminano di casella in casella — sedici passi fanno un turno — mentre
i quattro pulsanti saltano all'inizio della fase, che è il gesto di chi
gioca in fretta. Sotto la riga ci sono le azioni che questa casella si
aspetta: si premono invece di scriverle, e la riga di registro se la
scrive il motore. Dove serve un bersaglio c'è la tendina.

Le quattro cose dell'ossatura, e cosa cambia ognuna:

- **Le azioni sono oggetti.** `{ type:"declareCharge", unit, target }`.
  Il motore le controlla contro la casella, chiede i dadi, chiama le
  regole in ascolto, scrive la riga. Fuori casella l'azione passa lo
  stesso con la nota del perché era fuori posto: è il §1, e vale
  soprattutto qui.
- **Il motore non tira: chiede.** Esce `{ need:"2D6", why:"tiro di
  carica" }`, il vassoio si apre già impostato con il turno e la casella
  nel titolo, il risultato rientra. Il vassoio tiene la sua lettura —
  sa dire un Mancato Colpo meglio di qualunque frase generica — e il
  motore ci mette il turno, la casella e la traccia.
- **Le regole sono ascoltatori.** Diciassette momenti, e ognuno riceve
  un contesto che può cambiare lasciando detto cosa ha cambiato. Una
  regola che sbaglia finisce nella traccia segnata come errore e non
  ferma la partita; una che non tocca niente non sporca la traccia.
- **Il registro si scrive da solo.** Ogni riga porta turno, esercito,
  casella e i dadi che sono usciti, e l'annulla la porta via con
  l'azione — verificato sull'app vera, non solo nelle prove.

Il primo ascoltatore vero è già attaccato: gli effetti a tempo del §3.3
scadono rientrando nella prima delle sedici caselle, che è dove il
manuale mette il controllo. Prima non c'era nessun posto in cui
attaccarlo, ed è la ragione per cui a metà partita nessuno ricordava
più i modificatori.

*Fatto quando*: una partita intera si gioca passando di sotto-fase in
sotto-fase, e il registro racconta tutto senza che nessuno scriva
niente a mano. **Lo fa**, per le azioni che le sedici caselle nominano.
Quello che resta a mano è il gesto sul tavolo: il motore scrive che la
carica è stata dichiarata e quanto ha tirato, ma il pezzo lo sposti tu.
È la Tappa 2.

Una prova nuova che prima non si poteva scrivere: una partita è una
lista di azioni più i dadi fissati, si rigioca identica e si controlla
com'è finita. Sta in fondo a `test/motore.mjs`, ed è la forma che il
§10 chiedeva.

**Tappa 2 — Movimento e carica per davvero. — fatta**
~~Dichiarazione con controllo di visibilità, arco e distanza massima~~;
~~reazioni alla carica~~; ~~allineamento e ruota~~; ~~regola del
pollice~~; ~~carica disordinata~~; ~~terreno che rallenta e che fa
tenere il dado peggiore~~; ~~fuga, cedimento, ripiegamento,
inseguimento~~. Stanno tutte in `charge.js`, che di tavolo non sa
niente: entrano scatole e poligoni, escono numeri e posizioni.

Come si vede al tavolo. Nell'ispettore, sotto il tiro, c'è la riga
della carica: per ogni nemico quanto è lontano, cosa serve tirare, **e
quante volte su cento arriva** — la probabilità è enumerata sulle
facce, non stimata. Accanto c'è la bandierina, e la bandierina gioca la
carica per intero nell'ordine del manuale: si dichiara (p. 119), il
bersaglio sceglie la reazione (p. 120), si tira dal vassoio con i dadi
che quella carica vuole, e chi arriva si mette a filo da solo. Ogni
passo è un'azione del motore, quindi ognuno si annulla da solo e ognuno
finisce nel registro con la sua casella.

Le cose che questa tappa ha reso spiegabili, e prima non lo erano:

- **La faccia da cui si arriva.** L'allineamento non sceglie la faccia
  più vicina ma quella che *guarda* il caricante: su un bersaglio lungo
  sono due facce diverse, e sbagliare qui vuol dire far arrivare di
  fianco una carica frontale — cioè regalare un bonus di combattimento
  che non c'era.
- **Il dado peggiore.** Il passo lungo aggiunge un dado e butta il
  minore; il terreno difficile fa tenere il peggiore. Il piano dice
  *cosa* si tiene ma non con quanti dadi: `charge.js` aggiunge un dado
  e scarta il maggiore — la lettura simmetrica al passo lungo — e lo
  dichiara con `daVerificare`, così chi ha il libro aperto corregge una
  riga sola. Il vassoio e il motore leggono la stessa regola dallo
  stesso posto: `keepDice` è scritta una volta.
- **Chi altro si finisce per toccare.** Una carica larga arriva a
  sfiorare il vicino del bersaglio, e il manuale vuole che anche quella
  carica sia dichiarata (p. 119). È l'errore più comune del movimento,
  e adesso il registro lo scrive da sé.
- **La direzione di chi scappa.** Fuga, cedimento, ripiegamento e
  inseguimento sono la stessa geometria: lontano dal nemico con la
  Forza d'Unità più alta, in diagonale quando i più grossi sono due
  (pp. 154-155). Nell'ispettore sono quattro pulsanti, e il cedimento
  non chiede nemmeno i dadi perché è di due pollici fissi.

Quello che resta fuori, detto per non lasciarlo scoprire a una partita:
il costo della ruota si calcola ma non si scala da un budget di
movimento; il *tira e tieni* si può scegliere ma la raffica va tirata a
mano dal pannello del tiro; le mosse obbligate della frenesia e della
stupidità sono della Tappa 5; e il ripiegamento in ordine dichiara che
i suoi dadi vanno confrontati con il libro.

*Fatto quando*: si gioca un turno di movimento senza aprire il manuale.
**Lo fa** per le cariche e per i movimenti all'indietro. Il resto del
movimento è ancora il dito sul pezzo, con i ventagli che dicono fin
dove — ed è il gesto giusto: al tavolo si aggiusta con le mani.

**Tappa 3 — Il corpo a corpo del manuale.**
Bonus di Iniziativa della carica, risultato del combattimento completo,
test di rotta a tre esiti, inseguimento e sfondamento, sfide.
*Fatto quando*: lo scontro simulato smette di essere una stima e
diventa la risoluzione vera, con la traccia di ogni numero.

**Tappa 4 — Tiro e macchine da guerra.**
Conteggio dei tiratori modello per modello, modificatori automatici,
sagome sul tavolo, deviazione applicata, cannone e lanciapietre con le
tabelle di guasto, test di Panico.
*Fatto quando*: un lanciapietre si risolve dal tavolo, con la sagoma
che si sposta e i modelli sotto elencati.

**Tappa 5 — Psicologia e le prime venti regole speciali.**
Panico con le quattro cause, paura, terrore, odio, stupidità, frenesia;
il registro delle regole con gli agganci; il contatore delle regole
sconosciute che decide l'ordine delle prossime.

**Tappa 5 bis — Le regole dei tre eserciti di casa.**
Dieci regole per gli Orchi e Goblin, sei per gli Skaven, quelle degli
Uomini Lucertola (§8.2, §8.3). Sono poche perché il grosso del lavoro è
già stato fatto nelle tappe precedenti: qui si scrivono file di dati,
non codice. L'oggetto a **uso singolo** è l'unica cosa nuova.
*Fatto quando*: l'elenco «regole che non conosco» del pannello dello
scontro è vuoto per le dieci liste salvate.

**Tappa 6 — Magia.**
Generazione degli incantesimi, il ciclo di lancio e dissolvimento,
fiasco e invocazione perfetta, effetti a tempo, incantesimi che restano
in gioco, un dominio per volta — e gli innesti degli army book (Gork,
Mork, il Ratto Cornuto) sul formato degli otto domini base, previsti
dal primo giorno e non aggiunti dopo.

**Tappa 7 — Scenari, punti vittoria, fine partita.**
Le sei battaglie campali (pp. 288-299), i punti vittoria, la durata
variabile della partita, e il report che a fine partita dice chi ha
vinto e di quanto secondo lo scenario. Qui rientra il resto di Battle
March: controllo degli obiettivi a fine turno, le sei mappe di
schieramento, gli obiettivi secondari, i tetti di composizione.

---

## 10 · Come si prova

Il progetto ha già l'abitudine giusta (quattro file di prove, jsdom,
niente browser). Il motore ne chiede tre tipi in più:

1. **Partite registrate.** Una partita è una lista di azioni più una
   sequenza di dadi fissata: si rigioca identica e si controlla lo stato
   finale. Dieci partite registrate valgono più di cento prove unitarie,
   e le si ottiene giocando davvero — il registro le scrive già.
2. **Prove di regola.** Per ogni regola implementata, la situazione
   minima in cui cambia qualcosa, e la stessa situazione senza la
   regola. È la forma che `battle.mjs` usa già per il testardo.
3. **Prove di proprietà.** Cose che devono valere sempre: nessuna unità
   finisce entro un pollice da un nemico se non è in contatto; i modelli
   in campo non superano mai quelli della lista; la somma dei punti
   persi e di quelli in campo non cambia; un'azione annullata riporta
   lo stato al bit precedente.

E una regola di igiene: **ogni numero che l'app propone deve poter
essere spiegato dall'app stessa**. Se una spiegazione non si sa
scrivere, quella regola non è pronta per essere automatica.

---

## 11 · I rischi, detti prima

- **L'app che sbaglia con sicurezza.** È il rischio numero uno e la
  ragione dei tre obblighi del §1. Una stima dichiarata tale è utile;
  una regola applicata male e in silenzio fa perdere partite.
- **Gli army book.** Il manuale base è un terzo delle regole che si
  usano davvero. Se il motore non nasce estendibile con file di dati,
  la prima lista con regole d'esercito lo fa saltare.
- **La geometria che diventa un arbitro.** Contatti, ruote e
  allineamenti al millimetro: al tavolo si aggiustano con le mani e un
  po' di buon senso. L'app deve proporre l'allineamento e lasciarlo
  trascinare.
- **Il tempo di gioco.** Un simulatore che chiede sei conferme per
  tirare tre archi è più lento del manuale. Ogni tappa va misurata su
  *quanti clic costa un turno*, non su quante regole conosce.
- **La superficie.** Ottanta regole speciali e cinquantasei incantesimi
  non si finiscono mai del tutto. Per questo l'ordine è dettato dal
  contatore delle regole viste nelle partite vere, e non dall'indice
  del manuale.

---

## 12 · Cosa resta ai giocatori, per sempre

Anche a piano finito, tre cose restano fuori, e vanno scritte nel README
il giorno in cui la prima tappa parte:

- **Le decisioni.** Chi carica cosa, quando marciare, se accettare una
  sfida. L'app calcola le conseguenze, non sceglie.
- **Gli accordi.** Il manuale stesso, alla voce che conta di più
  (p. 93), dice che quando due interpretazioni si scontrano si tira un
  dado e si va avanti. Un'app che non lo permette è più rigida del
  manuale.
- **Il tavolo.** Se le miniature stanno mezzo pollice più in là di come
  le disegna l'app, hanno ragione le miniature.
