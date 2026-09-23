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

## 2 · Le correzioni che vengono prima di tutto — fatte

Leggendo il manuale per questo piano sono saltate fuori tre cose che
non sono funzioni mancanti ma **numeri sbagliati**. Sono corrette in
`rules.js`, ed erano il vero punto di partenza: ogni cosa che questo
piano propone di costruire sarebbe stata costruita su quei tre numeri.
Le prime due si sono viste subito; la terza è emersa solo quando la
Tappa 2 era già scritta, ed è la ragione per cui ogni tappa adesso
comincia rileggendo le pagine che le servono invece di fidarsi di
quello che il piano riassume.

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

**Il tiro di carica.** È la terza, ed è saltata fuori aprendo il
manuale alla pagina della carica *dopo* aver scritto la Tappa 2 — cioè
nel modo peggiore, perché la Tappa 2 ci si era già costruita sopra.
L'app tirava **2D6 e ne sommava i due dadi**: è la regola del Warhammer
di prima. In *The Old World* (p. 121) si tirano due D6, si **scarta il
minore**, e il dado che resta — uno solo, da 1 a 6 — si somma al
Movimento.

| | Prima | Adesso |
|---|---|---|
| carica media di un M 4 | 11″ | 8,5″ |
| carica massima di un M 4 | 16″ | 10″ |
| carica massima di un M 8 | 20″ | 14″ |

Sei pollici di differenza sulla portata massima di una fanteria: è la
distanza a cui si decide se una linea di battaglia è al sicuro o no, e
l'app la sbagliava a ogni turno di ogni partita. Peggio, la sbagliava
mentre scriveva accanto al numero **quante volte su cento la carica
arriva** — una probabilità esatta, enumerata sulle facce, calcolata su
una regola che non esiste. Il §1 chiede che ogni numero sia
tracciabile; la tracciabilità non salva da una tabella sbagliata, e
questo è il quarto errore dello stesso tipo trovato in quattro tappe.

Il passo lungo (Swiftstride, p. 178) è cambiato con lei: non è «tre
dadi tenendo i due migliori», è **+D6 sul risultato** del tiro di
carica, di fuga e di inseguimento, e +3″ sulla portata massima. Nel
vassoio il terzo cubo resta fuori dalla scelta, perché non è un dado da
scartare ma un dado da sommare, e i due gesti non si devono confondere.

Il terreno non cambia la regola: la rovescia (p. 128). Chi attraversa
terreno difficile o pericoloso, o scavalca un ostacolo basso, scarta il
dado **migliore** e tiene il peggiore — gli stessi due dadi, non tre —
e ha −1 al Movimento. Con questo cade anche il `daVerificare` che
`charge.js` si era scritto addosso non sapendo con quanti dadi si
tirasse: adesso si sa.

E una quarta cosa, invisibile finché c'era la terza: `fleeRoll` — quanto
si fugge e quanto si insegue — era scritto appoggiandosi al tiro di
carica. Finché la carica era una somma di due dadi funzionava per caso;
corretta la carica, la fuga sarebbe diventata **il maggiore dei due
dadi invece della loro somma**, cioè metà distanza, e nessuna prova se
ne sarebbe accorta. Adesso il tiro di fuga è due D6 sommati e sta per
conto suo (p. 132), e il ripiegamento in ordine ne scarta uno (p. 134).

Un effetto di lato che non era previsto: con la carica a M + 6 la
**marcia** è diventata il movimento più lungo per quasi tutti, e le
quattro soglie del semaforo — scritte in fila fissa quando la carica
arrivava a M + 12 — rispondevano «carica massima» a un pezzo che stava
semplicemente marciando. Adesso si ordinano per lunghezza.

Le prove di `test/battle.mjs` coprono tutte e tre le tabelle agli
estremi, comprese le quattro celle qui sopra; quelle della carica
stanno anche in `test/movimento.mjs`, che le guarda dal lato del
tavolo.

**E ce n'era una quinta**, trovata nella Tappa 3 e non in `rules.js`:
il **bonus di superiorità numerica** nel risultato del combattimento.
Non sta nell'elenco del §6, che è stato scritto con il manuale
aperto; e la Forza d'Unità salta fuori altrove, nel testo di
*Stubborn*, dove serve a dire che chi ha vinto con più del doppio
toglie all'altro il ripiegamento in ordine. Adesso è spenta dietro
una costante di `melee.js`. Il conto tenuto per esteso — cinque
numeri ereditati dal Warhammer di prima in cinque tappe — è la
ragione per cui ogni tappa comincia rileggendo le pagine che le
servono. E dalla Tappa 3 c'è un posto in più dove leggerle: il testo
per esteso di settanta regole speciali sta dentro le liste salvate,
messo lì da New Recruit, e ha corretto da solo quattro regole che
l'app dichiarava con sicurezza.

**La sesta e la settima le ha trovate il libro vero.** I manuali sono
sul disco (`Desktop\Warhammer`: Core Rulebook, Battle March, Ravening
Hordes, Forces of Fantasy, i due Legends), e nessuna tappa li aveva
aperti. Aprendoli per la magia è saltata fuori la **tabella dei tipi di
truppa** (p. 105), che `troops.js` aveva preso dal riassunto e sbagliava
in quasi ogni colonna: la fanteria prende al massimo **+2** ranghi, non
tre; la cavalleria **+1**, non due; la fanteria pesante conta file da
**quattro**; il carro pesante vale **5** di Forza d'Unità, e un mostro
quanto le sue **Ferite iniziali**. Con lei la regola: una fila conta se
ha i modelli che il tipo chiede — non «almeno tre» per tutti —,
l'ultima fila conta anche incompleta, e una **colonna di marcia** non
prende ranghi (p. 101). La settima è un'assenza: un reggimento in
**ordine di combattimento** prende **+1 al risultato** (pp. 101 e 152),
e l'app non l'ha mai contato. Le liste salvate confermano la tabella
riga per riga: il Doomwheel dichiara 5, lo Slann 5 con cinque Ferite.

Da qui in poi ogni tappa comincia aprendo il libro, non le liste.

**L'ottava e la nona le hanno trovate le tabelle.** Mettendo dentro
l'app le tre tabelle che si guardano a ogni fase — colpire in mischia,
colpire al tiro, ferire — per chi vuole tirare a mano, la pagina del
tiro (p. 138) è stata letta cella per cella. Il ritiro dell'Abilità
Balistica alta, dichiarato da verificare dalla Tappa 4, era sbagliato
di uno scalino: AB 6 ritira a 6+ e AB 10 a 2+, e l'app dava AB 6 senza
ritiro e AB 10 a 3+. E il **7+ per colpire** non è «mai» né 6+: chi
dopo i modificatori dovrebbe fare 7 tira lo stesso, e ogni 6 naturale
si ritira e colpisce con un 4+ (con 8 serve il 5+, con 9 il 6, dal 10
non si colpisce, p. 139). L'app si fermava al 6+, cioè un AB 2 dietro
copertura piena colpiva il doppio di quanto il libro conceda. Le due
tabelle della mischia invece erano giuste; erano sbagliate le loro
pagine, una avanti: p. 148 per colpire e p. 149 per ferire.

La scheda si apre da **▦ Tabelle** nella barra del tavolo, e dal
pannello dello scontro e del tiro toccando un punteggio: arriva con i
valori di quel bersaglio e la cella accesa. Le celle non sono scritte
nella scheda: le chiede a `rules.js`, alle stesse funzioni che tirano i
dadi del simulatore, e le due cose non possono contraddirsi.

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
partite. Da lì si implementa dall'alto. ~~Il contatore~~ c'è dalla
Tappa 5 (`tallyUnknown` in `rulebook.js`, nella scheda Partite), e non
ha chiesto un file nuovo: le partite archiviate portano già dentro le
liste con le regole di ogni unità.

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
   dell'ostacolo difeso; la *carica disordinata* (p. 128) c'è, ed è
   tenuta distinta dal disordine da terreno, che è un'altra regola.
3. ~~**La ruota** (*wheel*) e il pivot~~ — fatto del tutto nella Tappa 8:
   il costo c'era (`wheelCost`: lo spigolo esterno percorre un arco di
   raggio pari al fronte), e adesso si scala da un **budget di
   movimento** (`movePlans`, `moveCost`). Un reggimento non va in
   diagonale: ruota per puntare, poi cammina, e paga tutti e due dal
   Movimento.
4. ~~**Il massimo di carica** e la carica impossibile~~ (p. 119) —
   fatto, e con la probabilità esatta accanto: «serve un 8, sono
   quattordici volte su trentasei», che è l'informazione per cui uno
   apre l'app invece del manuale.
5. ~~**La regola del pollice**~~ (p. 118) — fatta come vincolo
   (`tooClose`) e come scostamento minimo automatico (`nudgeClear`)
   dopo la carica corta, la fuga e il cedimento.
6. ~~**Fuga, cedimento (*Give Ground*, 2″ indietro), ripiegamento e
   inseguimento**~~ — fatti (pp. 132-134 e 156): una direzione lontano dal
   nemico con la Forza d'Unità più alta, in diagonale quando i più
   grossi sono due, e i pollici che il vassoio ha tirato.
7. ~~**Sagome**: cerchio da 3″ e da 5″, goccia da 8″ (p. 95), con la
   regola «sotto del tutto = colpito, sotto in parte = 4+»~~ — fatto
   nella Tappa 4 (`shoot.js`), e con la deviazione che finalmente sposta
   la sagoma sul tavolo. Le due larghezze della goccia sono dichiarate
   da verificare.
8. ~~**Terreno per categoria** (pp. 269-270): aperto, difficile,
   pericoloso, impassabile, ostacolo basso, ostacolo alto, bosco. Ogni
   pezzo di terreno deve dichiarare la sua categoria, e da lì
   discendono: −1 al movimento, la carica che tiene il dado *peggiore*,
   il test di terreno pericoloso, l'unità *disordinata* che perde i
   ranghi, la copertura, e la penombra del bosco che taglia la linea di
   vista fra due unità entrambe fuori dal bosco.~~ — **fatto.**

Il punto 8 era il più sottovalutato, e lo è stato fino in fondo: il
campo della categoria c'era dalla Tappa 0 e dalla Tappa 2 la carica lo
leggeva, ma **nessuno tirava il dado che quel campo annunciava**. La
tabella diceva che la palude è pericolosa e la palude non faceva male a
nessuno; l'ostacolo basso diceva di scavalcarsi gratis, mentre il libro
lo tratta da terreno difficile (p. 270), e l'ostacolo alto diceva di
rallentare, mentre è impassabile (pp. 270 e 159). Adesso `terrain.js`
porta le regole e non solo la tabella — `slowMove`, `dangerousAsk`,
`defendedObstacle`, `combatCat`, `isDecoration` — e le leggono tutti e
tre: il pannello, la carica (`charge.js`) e **l'arbitro**, che del
terreno non sapeva niente perché costruiva i pezzi senza categoria.

Quello che il libro ha e qui ancora non c'è, detto per intero:
l'**occupazione** delle *special features* (p. 272) — non carica, 360°,
copertura piena, misure dalla base, una sola unità; il **Disrupted dal
buco** quando l'impassabile impedisce l'allineamento (p. 159); e il
terreno **combinato** su due lati dello stesso pezzo (p. 271), che qui
si risolve dichiarando una categoria sola per pezzo.

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
- ~~Tiro di carica~~. Fatto, e con il manuale in mano invece che con il
  riassunto: due D6 di cui si tiene il **maggiore** (p. 121), il
  **peggiore degli stessi due** attraverso il terreno difficile
  (p. 128), più un D6 per il passo lungo (p. 178). Questa riga del
  piano diceva «2D6» e sottintendeva la somma: vedi il §2.
- ~~Mosse restanti, con il conto di quanti pollici sono stati fatti~~ —
  l'ancora di movimento faceva già esattamente questo — e ~~il test del
  «nemico in vista» prima di marciare~~ (p. 123), che è la riga che fa
  perdere più turni di tiro di qualunque altra. Le obbligate vere
  (frenesia, stupidità) arrivano con la Tappa 5.

### Tiro
- ~~Chi può tirare: non ha caricato, non ha marciato, non è in mischia,
  non è in fuga (p. 137).~~ Fatto nella Tappa 4, e l'arma *Move or
  Shoot* aggiunge il suo divieto a chi ha mosso.
- ~~Chi vede e chi è in gittata, modello per modello.~~ Fatto: ogni
  modello misura la sua distanza e guarda la sua linea di vista, e il
  pannello dice perché gli altri restano fermi.
- ~~Modificatori: mosso, lunga gittata, tira e tieni, copertura
  parziale, copertura piena — cumulativi (p. 138).~~ Fatto, e agganciati
  alle condizioni vere: l'ancora di movimento, la gittata e la copertura
  viste dalla maggioranza di chi tira.
- ~~L'1 naturale non colpisce mai; AB 6+ ha il ritiro con un secondo
  punteggio.~~ Fatto; quale sia il secondo punteggio è dichiarato da
  verificare.
- ~~Perdite e **test di Panico** oltre un quarto (p. 141).~~ Fatto, e
  contato sulla Forza d'Unità invece che sulle teste.
- Macchine da guerra (pp. 222-229): ~~bombardamento con deviazione~~
  fatto; la palla di cannone con rimbalzo è scritta ma non ha ancora il
  suo pulsante; le due tabelle del Mancato Colpo sono vuote finché
  qualcuno non le trascrive da p. 347.

### Corpo a corpo
- Chi combatte: fila che combatte, contatto di basetta, attacchi di
  appoggio (pp. 145-146). L'app conosce già i contatti modello per
  modello: è il posto in cui è più avanti del manuale medio.
- ~~Ordine di Iniziativa **con il bonus della carica** (+1 per pollice
  intero percorso, fino a +3 di fronte e +4 di fianco o di retro,
  p. 146).~~ Fatto nella Tappa 3, e con lui l'urto e la carica furiosa
  che vogliono tre pollici di corsa, e i pestoni che arrivano ultimi.
- ~~Risultato del combattimento: ferite, ranghi (uno per fila piena, con
  il minimo per fila e il massimo dal tipo di truppa, p. 105),
  stendardo, stendardo da battaglia, fianco +1, retro +2, terreno più
  alto +1, *overkill* nelle sfide.~~ Fatto. Ne mancavano tre, e ce
  n'era una di troppo: la superiorità numerica, che questo elenco non
  nomina perché nel manuale non c'è. L'overkill ha anche un tetto, +5,
  ed era l'ultimo numero di questo capitolo che l'app non aveva letto
  sul libro (p. 152).
- ~~**Il combattimento a più di due** (p. 153).~~ Fatto: l'assalto non
  è più fra due schiere ma fra due gruppi. I ranghi non si sommano
  (vale il più alto), gli stendardi valgono uno per parte, il fianco si
  conta una volta per unità nemica, il terreno più alto lo prende una
  parte sola e si annulla in parità; l'ordine di combattimento invece
  si conta per ognuna, e il manuale lo dice con l'esempio. Il test di
  rotta lo tira ogni unità della parte che perde, e la Forza d'Unità
  che decide se il doppio schiaccia è quella delle parti sommate
  (p. 154). Chi ha più nemici davanti divide la sua prima fila fra
  loro, e i colpi automatici — urto e pestoni — si tirano una volta
  sola e si spartiscono. Restano ai giocatori i contatti: chi tocca chi
  lo dice il tavolo con `vs`, e senza dichiarazione si toccano tutti.
- ~~**Test di rotta a tre esiti** (p. 154)~~: fatto, ed è stato il
  cambio di regola vero. Si confronta il tiro naturale e il tiro
  modificato con il Comando, e ne escono *cede terreno*, *ripiega in
  ordine*, *rotta* — le tre mosse all'indietro che la Tappa 2 sapeva
  già fare.
- ~~Inseguimento, sfondamento, unità travolta.~~ Fatto; resta fuori il
  test di trattenuta di chi preferirebbe non inseguire.

- ~~**Il raduno** (p. 117).~~ Fatto: era l'unica regola della
  psicologia che mancava del tutto, e si tirava con il pulsante del
  test di Comando generico — cioè senza i due modificatori che lo
  decidono quasi sempre. Sotto metà dei modelli di partenza −1, sotto
  un quarto passa solo il doppio uno, e il musico vale +1 fino a 10
  (p. 201). Nell'ispettore il pulsante compare per chi sta fuggendo.

### Psicologia
~~Panico (pp. 160-161) con le sue quattro cause ricorrenti — perdite oltre
un quarto della Forza d'Unità, amico vicino distrutto, amico vicino che
lascia il combattimento, unità attraversata da chi fuggiva — più paura,
terrore, odio, stupidità, frenesia.~~ Fatto nella Tappa 5 (`psych.js`).
Erano davvero **misure di distanza più un test di Comando**; quello che
mancava era sapere chi ne è esente e cosa succede dopo, e il testo delle
liste lo dice regola per regola. Restano da verificare tre righe della
pagina del Panico, e restano fuori il Comando del Generale e il ritiro
dello stendardo da battaglia.

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
| Tabelle del Mancato Colpo | 2 | p. 347 | tabelle — *vuote in `shoot.js`, da trascrivere* |
| Tabella del fiasco | 1 | p. 109 | tabella |
| Armi da mischia e da tiro | ~20 | pp. 213-219 | profili |
| Armature ed equipaggiamento | ~10 | pp. 220-221 | profili |
| *Battle March*: due tabelle a D6, sei mappe, oggetti | — | §8.1 | tabelle + dati |
| Regole d'esercito dei tre eserciti di casa | 10 + 5 + Lucertola | §8.2, §8.3 | file per esercito — *fatte per quello che le liste portano; le regole del libro dei Lucertola da trascrivere* |

Le regole speciali e gli incantesimi sono i due mucchi grossi, e sono
anche i due che **si possono fare a fette**: dieci regole per volta,
scelte per frequenza; un dominio per volta, scelto da chi gioca in casa.

E il primo dei due è meno grosso di quanto questa tabella dica. La
Tappa 3 ha scoperto che il **testo per esteso** di una settantina di
quelle regole è già dentro `dati/liste.json`: i file di New Recruit se
lo portano dietro, il parser lo legge da mesi e nessuno lo guardava.
Non si tratta più di trascrivere ottanta regole dal libro, ma di
decidere quali far agganciare al motore — le altre l'app le mostra già
com'erano scritte, e chi gioca le applica a mano sapendo cosa dicono.

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
lì accanto e costava poco. Le due tabelle tirano e dicono cos'è
uscito. L'ordine delle facce, dichiarato da verificare, è stato letto
sul libro nella Tappa 7: il Terreno Selvaggio (p. 40) era giusto, il
Caso della Guerra (p. 41, *The Chaos of War*) aveva il 2 e il 3
scambiati — il 2 è il carro perso, il 3 le munizioni — e un esito già
uscito si ritira invece di prendere il primo rimasto. Il controllo
degli obiettivi è attaccato al tavolo dalla Tappa 7; resta da attaccare
il tiro sul pezzo di terreno e quello del Caso della Guerra.
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
Quello che restava a mano era il gesto sul tavolo: il motore scriveva
che la carica era stata dichiarata e quanto aveva tirato, ma il pezzo lo
spostavi tu. Adesso lo sposta lui: è la Tappa 2, qui sotto.

Una prova nuova che prima non si poteva scrivere: una partita è una
lista di azioni più i dadi fissati, si rigioca identica e si controlla
com'è finita. Sta in fondo a `test/motore.mjs`, ed è la forma che il
§10 chiedeva.

**Tappa 2 — Movimento e carica per davvero. — fatta**
~~Dichiarazione con controllo di visibilità, arco e distanza massima~~;
~~reazioni alla carica~~; ~~allineamento e ruota~~; ~~regola del
pollice~~; ~~carica disordinata~~; ~~terreno che rallenta e che fa
tenere il dado peggiore~~; ~~fuga, cedimento, ripiegamento,
inseguimento~~, più ~~chi può caricare~~, ~~quanto si muove chi non
carica~~ e ~~il test del «nemico in vista»~~ (p. 123). Stanno tutte in
`charge.js`, che di tavolo non sa niente: entrano scatole e poligoni,
escono numeri e posizioni.

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

- **Le due regole che stavano una sopra l'altra.** La *carica
  disordinata* e il *disordine da terreno* stanno sulla stessa pagina
  (p. 128) e costano bonus diversi, e il modulo le aveva fuse in una.
  La prima la fa il non riuscire ad allinearsi perché qualcosa è in
  mezzo, e costa il bonus di Iniziativa; la seconda la fa il finire il
  movimento con un quarto dei modelli nel terreno difficile, e costa il
  bonus dei ranghi. Attraversare un bosco per arrivare a contatto non
  provoca nessuna delle due. Adesso sono due funzioni, e i modelli nel
  bosco si contano sulle basette vere invece che sul rettangolo.
- **La faccia da cui si arriva.** L'allineamento non sceglie la faccia
  più vicina ma quella che *guarda* il caricante: su un bersaglio lungo
  sono due facce diverse, e sbagliare qui vuol dire far arrivare di
  fianco una carica frontale — cioè regalare un bonus di combattimento
  che non c'era.
- **Il dado che si tiene, e quale.** Qui la tappa si è dovuta
  correggere da sola. `charge.js` era nato leggendo il piano invece
  del manuale, e il piano riassumeva *cosa* si tiene senza dire con
  quanti dadi: il modulo aveva indovinato «un dado in più, scarta il
  maggiore» e lo aveva dichiarato `daVerificare`. Verificato: il
  manuale (p. 121) tira **due dadi e ne tiene uno**, il maggiore; nel
  terreno difficile tiene il peggiore **degli stessi due** (p. 128), e
  il passo lungo non tira un terzo dado da scartare ma **somma un D6**
  (p. 178). Il `daVerificare` è caduto, e con lui la carica da sedici
  pollici che non esiste — vedi il §2. Il vassoio e il motore leggono
  la stessa regola dallo stesso posto: `keepDice` è scritta una volta,
  e correggerla è stato correggere tutto.
- **Chi altro si finisce per toccare.** Una carica larga arriva a
  sfiorare il vicino del bersaglio, e il manuale vuole che anche quella
  carica sia dichiarata (p. 119). È l'errore più comune del movimento,
  e adesso il registro lo scrive da sé.
- **La direzione di chi scappa.** Fuga, cedimento, ripiegamento e
  inseguimento sono la stessa geometria: lontano dal nemico con la
  Forza d'Unità più alta, in diagonale quando i più grossi sono due
  (pp. 132-134 e 156 — il piano citava pp. 154-155, che sono le pagine
  del test di rotta, non quelle del movimento). Nell'ispettore sono
  quattro pulsanti, e il cedimento non chiede nemmeno i dadi perché è
  di due pollici fissi. Il ripiegamento in ordine non è più da
  verificare: due D6 tenendo il maggiore, e l'unità si raduna da sola
  a fine movimento (p. 134).

Quello che resta fuori, detto per non lasciarlo scoprire a una partita:
~~il costo della ruota si calcola ma non si scala da un budget di
movimento~~ (fatto nella Tappa 8); il *tira e tieni* si può scegliere
ma la raffica va tirata a mano dal pannello del tiro; le mosse obbligate della frenesia e della
stupidità sono della Tappa 5; e il test di terreno pericoloso e quello
di Pericolo di chi attraversa un nemico fuggendo sono scritti
(`perilAsk`) ma non hanno ancora chi li preme.

*Fatto quando*: si gioca un turno di movimento senza aprire il manuale.
**Lo fa** per le cariche e per i movimenti all'indietro. Il resto del
movimento è ancora il dito sul pezzo, con i ventagli che dicono fin
dove — ed è il gesto giusto: al tavolo si aggiusta con le mani.

**Tappa 3 — Il corpo a corpo del manuale. — fatta**
~~Bonus di Iniziativa della carica~~, ~~risultato del combattimento
completo~~, ~~test di rotta a tre esiti~~, ~~inseguimento e
sfondamento~~, ~~sfide~~. Stanno in `melee.js`, che di tavolo non sa
niente come `charge.js`: entrano numeri di profilo e facce gia'
uscite, escono punteggi ed esiti con la traccia di come sono venuti.

Come si vede al tavolo. Il pannello dello scontro ha un pulsante in
piu': **Porta l'esito sul tavolo**. Fa i quattro gesti nell'ordine del
manuale e ognuno e' un'azione del motore, quindi ognuno si annulla da
solo e finisce nel registro con la sua casella: le perdite, il
risultato, il test di rotta, la mossa che l'esito impone, e poi il
tiro d'inseguimento — di sfondamento, se davanti non e' rimasto
nessuno. Chi insegue almeno quanto l'altro ha fuggito lo travolge.

**Il test di rotta a tre esiti** e' il cambio di regola vero, ed e'
quello che il §6 chiedeva di fare presto perche' cambia la fine di
ogni assalto. Si guardano due numeri invece di uno — il tiro naturale
e lo stesso tiro con lo scarto del combattimento addosso — e ne escono
*cede terreno*, *ripiega in ordine*, *rotta*, che sono esattamente le
tre mosse all'indietro che la Tappa 2 sapeva gia' fare e che finora si
premevano a mano indovinando quale toccasse. Una conseguenza che al
tavolo sorprende: la rotta dipende dal tiro **naturale**, quindi non
dallo scarto. Perdere di otto invece che di due non fa scappare di
piu': fa ripiegare invece di cedere terreno.

Quello che questa tappa ha trovato per strada, e non era in programma.
Il primo ritrovamento spiega gli altri.

- **Il manuale era in casa da sempre.** I file di New Recruit portano
  il **testo per esteso** di ogni regola speciale; il parser lo legge
  da mesi, lo tiene su `u.ruleText`, e non lo guardava nessuno. Sono
  settanta regole del Core Rulebook scritte per intero dentro
  `dati/liste.json`. Da questa tappa ogni etichetta del pannello lo
  mostra nel titolo: una regola che l'app non applica smette di essere
  un nome e diventa un nome piu' le sue tre righe di manuale, che al
  tavolo bastano per applicarla a mano. Ed e' con quel testo che sono
  stati corretti i quattro errori qui sotto.
- **Stubborn e Unbreakable erano tutte e due dell'edizione di prima.**
  L'app diceva «il testardo tira al Comando pieno» e «l'incrollabile
  non tira». Il testo dice altro: *Stubborn* e' una scelta che si fa
  **prima** dei dadi e **una volta per partita** — si salta il test e
  si ripiega in ordine; *Unbreakable* non tira e **cede terreno**, non
  resta fermo. Sono due regole del test a tre esiti, e nel test a due
  esiti non si potevano nemmeno scrivere.
- **La superiorita' numerica non e' una voce del risultato.** Era il
  quinto numero preso dal Warhammer di prima dopo il tiro per
  colpire, la tabella per ferire, il tiro di carica e il tiro di
  fuga. Nell'elenco del §6 — scritto leggendo il manuale — non
  compare; e la Forza d'Unita' salta fuori altrove, nel testo di
  *Stubborn*, dove serve a dire che chi ha vinto con piu' del doppio
  toglie il ripiegamento in ordine. La voce resta nel codice, spenta,
  dietro una costante sola.
- **L'urto e il pestone erano lo stesso flag.** `Impact Hits` e
  `Stomp Attacks` finivano nello stesso campo, e un mostro che aveva
  tutte e due ne perdeva una — la seconda lettura sovrascriveva la
  prima. Sono due regole che si risolvono ai due capi opposti
  dell'assalto: l'urto prima di tutto, il pestone «dopo tutti gli
  altri attacchi, compresi quelli a Iniziativa 1». Il pestone
  arrivava all'inizio, cioe' pestava modelli che sarebbero caduti
  comunque.
- **I tre pollici, e la Forza sbagliata.** L'urto e la carica furiosa
  li fa chi ha caricato muovendo **3″ o piu'**: l'app li dava a
  chiunque avesse caricato, anche a chi era arrivato a contatto con
  mezzo pollice. E l'urto usa la Forza **non modificata** del
  modello: un cavaliere piantava l'urto con la Forza della lancia,
  due punti di troppo.
- **L'Odio non e' psicologia.** Stava fra le regole «che si giocano
  altrove — e' un test di psicologia». Non e' un test: e' il ritiro
  dei colpi mancati nel primo assalto, che `pool` sapeva gia' fare
  dalla Tappa 0. Era una riga che l'app diceva con sicurezza e che
  era falsa.

E due cose che la Tappa 2 aveva riconosciuto senza poterle far pagare
a nessuno, perche' il posto in cui costano e' il conto di fine
assalto: la **carica disordinata** adesso toglie davvero il bonus di
Iniziativa, e il **disordine da terreno** toglie davvero i ranghi
(p. 128). Erano scritte sull'unita' dalla tappa scorsa e non le
leggeva nessuno. Lo stesso vale per la carica stessa: `u.charged` — con
i pollici e la faccia da cui e' arrivata — c'era dalla Tappa 2, e il
pannello continuava a chiedere a mano «ha caricato?» a una domanda a
cui il tavolo aveva gia' risposto.

Quello che resta fuori, detto per non lasciarlo scoprire a una
partita: lo **stendardo da battaglia** da' il suo +1 ma non fa ancora
ritirare i test di rotta degli amici nel raggio di comando; il
**terreno piu' alto** e' una tendina da rispondere a mano, perche' il
tavolo non ha le quote; della **sfida** l'app conta l'overkill e tiene
la riga nel registro, ma chi puo' raccoglierla e cosa costa rifiutarla
restano a chi gioca; il **test di trattenuta** prima di inseguire non
c'e'; e la riga della Forza d'Unita' piu' che doppia e' dedotta dal
testo di *Stubborn*, non letta sulla pagina del test — porta
`daVerificare` e si spegne da una costante.

*Fatto quando*: lo scontro simulato smette di essere una stima e
diventa la risoluzione vera, con la traccia di ogni numero. **Lo fa**:
si tira l'assalto, si legge da dove viene ogni punto del risultato, si
preme un pulsante e sul tavolo si muovono i pezzi giusti. Le prove
stanno in `test/mischia.mjs`, che guarda l'assalto dal lato dei numeri
come `test/movimento.mjs` guarda la carica dal lato del tavolo.

**Tappa 4 — Tiro e macchine da guerra. — fatta, con due tabelle vuote**
~~Conteggio dei tiratori modello per modello~~, ~~modificatori
automatici~~, ~~sagome sul tavolo~~, ~~deviazione applicata~~,
~~cannone e lanciapietre~~ con le tabelle di guasto *ancora da
trascrivere*, ~~test di Panico~~. Stanno in `shoot.js`, che di tavolo
non sa niente come `charge.js` e `melee.js`: entrano punti, poligoni e
facce già uscite, escono conti e posizioni con la traccia di come sono
venuti.

Come si vede al tavolo. Nel pannello del tiro ogni nemico ha una riga
in più, e sotto la riga c'è quello che prima si contava a occhio:
«8 tiri da 8 modelli · 6 in coda, 2 non lo vedono». In fondo alla riga
c'è l'arco, e l'arco gioca la fase per intero nell'ordine del manuale:
si dichiara il bersaglio (p. 137), la raffica cade nel vassoio con i
modificatori che il tavolo ha già calcolato (p. 138), i modelli si
tolgono, e chi ha perso più di un quarto tira il Panico (p. 141). Ogni
passo è un'azione del motore, e ognuno si annulla da solo.

Una macchina da guerra ha tre pulsanti in più: le tre sagome del
manuale (p. 95). La sagoma si posa sul nemico più vicino, si disegna
sopra i modelli con i pallini pieni su chi è sotto del tutto e vuoti su
chi è sotto in parte, e «Bombarda» tira la deviazione con il dado di
artiglieria, la sposta, chiede i 4+ dei parziali e toglie i modelli
unità per unità. È esattamente il *fatto quando* di questa tappa.

Le cose che questa tappa ha reso spiegabili, e prima non lo erano:

- **Il tetto delle due file non è un conto.** L'app contava `fronte ×
  2` e basta. È giusto come tetto e sbagliato come conto: un reggimento
  obliquo dietro una collina ha metà della prima fila che il bersaglio
  non lo vede e l'altra metà fuori gittata di due pollici. Adesso ogni
  modello misura la sua distanza e guarda la sua linea di vista, e il
  pannello dice per quale delle tre ragioni gli altri restano fermi.
- **I modificatori venivano dalle caselle.** Il −1 del movimento lo
  spuntava chi si ricordava di aver mosso. Adesso lo dice l'ancora di
  movimento della Tappa 2, la lunga gittata e la copertura le dice la
  maggioranza dei modelli che tirano davvero, e *Move & Shoot* toglie
  il −1 da sé.
- **Il cancello di p. 137.** Chi ha caricato, marciato, è a contatto o
  sta fuggendo non tira, e l'arma *Move or Shoot* non tira dopo aver
  mosso. L'app lo scrive in arancio sopra le righe, e poi lascia tirare
  lo stesso: è il §1.
- **L'Abilità Balistica alta non si fermava al 2+.** Il conto la
  tagliava lì e basta. Adesso porta il ritiro dei mancati con un
  **secondo punteggio**, che non è il ritiro di `pool`: lì il dado
  rifatto si confronta con lo stesso numero, qui con uno più alto. Sono
  due tiri in fila, e la previsione e la raffica li contano tutti e due.
- **Le quattro regole d'arma «altrove».** *Move & Shoot*, *Quick Shot*,
  *Volley Fire* e *Multiple Shots* stavano fra le regole che «riguardano
  il tiro, non la mischia», e nessuno le leggeva. Sono quelle che le
  liste salvate portano davvero sui giavellotti, sugli archi corti e sui
  jezzail, e adesso le legge la fase di tiro.
- **La deviazione del vassoio non spostava niente.** Il vassoio la
  tirava da sempre, e il motore la riceveva come un pugno di facce da
  sommare. Adesso arriva intera — gradi, pollici, Colpito!, Mancato
  Colpo — e il registro scrive «devia di 6″ verso destra» invece di
  «4 + 0 = 4».
- **Due errori li ha trovati solo il tavolo vero.** Le prove passavano,
  e nel browser gli arcieri goblin avevano zero tiratori su bersagli a
  dodici pollici: il bersaglio arrivava al conto come unità grezza, che
  non ha larghezza sua, e ogni modello risultava fuori gittata. Poi,
  sistemato quello, un solo arciere che guardava oltre lo spigolo di un
  muretto dava la copertura pesante a tutta la raffica. Adesso vale la
  copertura della maggioranza, come il paragrafo sopra diceva già, e
  un'unità spazzata via dalla raffica non viene più chiamata al Panico.

Quello che resta fuori, detto per non lasciarlo scoprire a una partita:

- ~~**Le due tabelle del Mancato Colpo sono vuote.**~~ Trascritte da
  p. 347, aperto il libro: sono tre righe ognuna e non sei — 1 la
  macchina è distrutta, 2-4 si guasta e perde una Ferita, 5-6 salta il
  tiro — e quella del «cannone» nel libro è la tabella della polvere
  nera. Il registro scrive adesso la riga vera.
- **Due numeri dichiarati da verificare**: ~~il secondo punteggio
  dell'Abilità Balistica alta~~ (letto a p. 138, ed era sbagliato di uno
  scalino: vedi il §2), e le due larghezze della goccia — il libro
  (p. 95) dice solo «circa otto pollici», e testa e coda si misurano
  sulla sagoma vera. Stanno in una costante ognuna.
- *Quick Shot* e *Volley Fire* sono lette ma non contate fino in fondo:
  la prima non aggiunge tiri finché non si sa quanti, la seconda alza il
  tetto a tutte le file senza il modificatore che forse porta. Il
  pannello lo scrive accanto al numero. *Cumbersome* e *Ponderous* sono
  solo nominate.
- Il **cannone** è scritto — distanza indovinata, primo dado di
  artiglieria, rimbalzo, la linea che la palla percorre — ma sul tavolo
  non ha ancora il suo pulsante: il pannello gioca il bombardamento,
  non la palla. Il *tira e tieni* apre ancora la reazione senza tirare
  la raffica.
- Le altre tre cause del Panico sono della Tappa 5; qui c'è solo quella
  che il tiro produce da sé.

*Fatto quando*: un lanciapietre si risolve dal tavolo, con la sagoma
che si sposta e i modelli sotto elencati. **Lo fa**, e il Mancato Colpo
porta alla pagina giusta invece che a una riga inventata. Le prove
stanno in `test/tiro.mjs`, che guarda il tiro dal lato dei numeri come
`test/mischia.mjs` guarda l'assalto.

**Tappa 5 — Psicologia e le prime venti regole speciali. — fatta, con tre righe da verificare**
~~Panico con le quattro cause~~, ~~paura~~, ~~terrore~~, ~~odio~~ (era già
un ritiro dalla Tappa 3), ~~stupidità~~, ~~frenesia~~; ~~il registro
delle regole con gli agganci~~; ~~il contatore delle regole sconosciute
che decide l'ordine delle prossime~~. Stanno in `psych.js`, che di
tavolo non sa niente come `charge.js`, `melee.js` e `shoot.js`: entrano
profili, Forze d'Unità, distanze e facce già uscite, escono esiti con
la traccia di come sono venuti.

Da dove viene. Questa è la prima tappa scritta *tutta* sul testo delle
liste invece che sul riassunto del piano: Fear, Terror, Frenzy, Blood
Frenzy, Stupidity, Impetuous, Warband, Cold Blooded, Immune to
Psychology, Ignore Panic, Ignore Goblin Panic, Fear of Elves, Quell
Impetuosity e First Charge stanno per esteso in `dati/liste.json`. Le
regole erano venti nel titolo; sono quindici, perché le altre cinque
che le liste portano davvero erano già entrate nelle Tappe 3 e 4. La
pagina del Panico del manuale base invece in casa non c'è, e le tre
cose che servono e che nessun testo di lista dice sono costanti
dichiarate (sotto, *quello che resta fuori*).

Come si vede al tavolo. La bandierina della carica ha due passi in più,
prima della reazione: la **Paura** di chi carica un nemico più grosso
che la fa — chi fallisce non si muove, ed è una carica fallita — e il
**Terrore** del bersaglio di chi lo fa, che se fallisce fugge. Le
reazioni si spengono da sole con il perché accanto. Nell'ispettore c'è
il blocco **Psicologia**: le regole dell'unità in una riga ciascuna, lo
stato in cui si trova, e i pulsanti dei test. Il **Panico** non è più un
tiro che finiva nel registro senza esito: dopo il tiro, dopo una rotta,
dopo un'unità distrutta, dopo una fuga che attraversa un amico, l'app
misura i 6″, scrive chi non tira e perché, tira per gli altri e chiede
se chi ha fallito fugge. All'inizio del turno il registro ricorda la
Stupidità da tirare, alla dichiarazione delle cariche chi deve caricare
e chi tira per saperlo. Il contatore sta nella scheda Partite.

Le regole come ascoltatori, finalmente per davvero: *Cold Blooded* e
l'immunità si agganciano ai momenti `onPanic` e `onPsych` del motore, e
la riga di registro dice nella traccia perché i dadi erano tre, o
perché non ce n'erano.

Quello che questa tappa ha trovato per strada, e non era in programma:

- **La Warband tirava con due o tre punti di Comando in meno.** Il
  testo dice che il bonus di ranghi *attuale* si somma al Comando, fino
  a 10, salvo che l'unità fugga. Diciotto unità delle liste salvate lo
  hanno, e ognuna faceva test di rotta e di Panico con il Comando di
  profilo. Adesso lo conta la schiera di `combat.js`, quindi lo sanno il
  test di rotta, il Panico e il pannello, che scrive da dove viene.
- **Il Panico del tiro non diceva com'era andato.** La Tappa 4 faceva
  rotolare i due dadi e scriveva le facce, e il registro non sapeva se
  il reggimento era rimasto o se n'era andato. Adesso la riga porta
  l'esito, e chi fallisce ha la sua fuga a un clic.
- **«Chiudi turno» saltava la prima casella.** Scriveva l'indice a mano
  invece di entrare nella casella dal motore, e gli effetti a tempo non
  scadevano mai da quel pulsante: una Stupidità presa al primo turno
  sarebbe rimasta per tutta la partita. Adesso ci entra dal motore, come
  le frecce.
- **Il registro diceva mezza verità su Paura e Terrore.** «Si gioca alla
  dichiarazione della carica» era vero per metà: la Paura vale anche in
  mischia (−1 per colpire) e il Terrore anche nel test di rotta (−1 al
  Comando). Tutte e due adesso entrano nel conto di un assalto.
- **«Fear of Elves» comincia con «Fear».** Un'espressione scritta di
  fretta avrebbe fatto di ogni Orco uno che fa Paura. Se n'è accorta la
  prova prima del tavolo.

Quello che resta fuori, detto per non lasciarlo scoprire a una partita:

- **Tre righe da verificare sulla pagina del Panico** (pp. 160-161), che
  in casa non c'è: che chi è in combattimento non tiri il Panico per gli
  altri (`PANIC_SKIP_ENGAGED`), che chi fallisce fugga (`PANIC_FAIL`, e
  per questo l'app lo chiede invece di farlo), e che chi fa Terrore non
  sconti il −1 del Terrore nel test di rotta (`TERROR_MOD_SPARES_TERROR`).
- **Il Comando del Generale e lo stendardo da battaglia.** I test usano
  il Comando dell'unità: *Inspiring Presence* e il ritiro del Panico
  nel raggio dello stendardo sono scritti per esteso nelle liste e non
  ancora contati.
- *Blood Frenzy* è letta e non applicata (il conto non separa le ferite
  della cavalcatura); *Quell Impetuosity* è ricordata e non ritira;
  l'obbligo di caricare di Frenzy e Impetuous è una riga arancione, non
  una carica dichiarata da sola.
- Il +1 Attacchi della Frenzy **dopo un inseguimento** ha la sua
  funzione ma il tavolo non tiene ancora chi ha inseguito il turno
  prima; e quello della carica vale finché la carica resta scritta
  sull'unità, che a fine turno non viene tolta — nel pannello dello
  scontro si toglie la spunta.
- Il disordine di *First Charge* non se ne va da solo a fine corpo a
  corpo, come quello del terreno. Il test di Paura in mischia si tira
  dal pulsante dell'ispettore, non all'apertura dello scontro.

*Fatto quando*: una carica contro un mostro che fa Terrore fa tirare
chi carica e chi è caricato nell'ordine giusto, e un reggimento
distrutto manda al Panico chi gli stava a 6″ senza che nessuno misuri.
**Lo fa**. Le prove stanno in `test/psicologia.mjs`, che guarda la
psicologia dal lato dei numeri come `test/tiro.mjs` guarda il tiro, e
il gesto sul tavolo lo guarda `test/boot.mjs`.

**Tappa 5 bis — Le regole dei tre eserciti di casa. — fatta, con quattro righe da verificare**
~~Le regole degli Orchi e Goblin~~, ~~degli Skaven~~, ~~quelle delle
unità degli Uomini Lucertola~~, ~~l'uso singolo~~. Stanno in
`dati/eserciti/`, come il §7 chiedeva: file di dati, non codice. Il
codice nuovo è il pezzo che mancava fra quei file e il conto, e sta in
`armies.js`: riconoscere una regola dal nome con cui New Recruit la
scrive, e tradurla nelle quattro cose che `combat.js` sapeva già fare —
ritirare, perforare, alzare la Forza, fissare la salvezza speciale.

Da dove viene. La Tappa 0 aveva scritto i file dal riassunto del §8, e
questa tappa li ha riscritti sul testo per esteso che le liste salvate
si portano dietro, come la Tappa 5. Ogni riga dice da dove viene:
`testo: lista` se è stata letta lì, `daVerificare` se nessuna lista la
porta. Una prova controlla che le prime trovino davvero il loro testo
nelle liste e che le seconde davvero no.

Come si vede al tavolo. Nell'ispettore, sotto la Psicologia, c'è il
blocco **Regole d'esercito**: una riga per regola dell'unità e dei
personaggi uniti, con *a mano* e il perché accanto a quelle che l'app
conosce e non gioca. Il **Waaagh!** ha il suo pulsante: test di Comando
del personaggio dal vassoio, nella sotto-fase di comando, e se passa
l'effetto va su di lui e sull'unità di Orchi a cui è unito fino al loro
prossimo inizio turno. Nel pannello dello scontro le regole entrano nei
dadi con il loro nome nelle note — «Choppas: 3 1 per ferire ritirati»
— e nel risultato: la *Horde* prende il quarto rango, l'*Impervious
Defence* toglie il punto di fianco a chi lo prende e il pannello dice
perché, lo *Shieldwall* cede terreno invece di ripiegare. La fuga di chi
ha la *Scurry Away* scrive il suo +1 nel registro.

I nomi che le liste salvate portano e l'app non conosceva erano
trenta. Otto adesso entrano nei conti: *Choppas*, *Waaagh!*, *Scurry
Away*, *Warpstone Weapons*, *Arcane Shield* dai file d'esercito, e
*Horde*, *Shieldwall*, *Impervious Defence* dal registro universale,
perché il loro testo non nomina nessun esercito. Gli altri ventidue
l'app li conosce e non li gioca, e ognuno dice perché.

Quello che questa tappa ha trovato per strada, e non era in programma:

- **I file d'esercito non li leggeva nessuno.** Dalla Tappa 0 stavano in
  `dati/eserciti/` e la scheda di preparazione ne contava le regole;
  `combat.js` non li importava. Il Warpaint era «applicato» in un
  elenco e in nessun dado.
- **E non avrebbero trovato niente.** Le regole avevano i nomi del
  riassunto, in italiano — «Carica delle Zanne», «Frena l'Impetuosità» —
  e le liste le scrivono in inglese. La seconda non esisteva nemmeno:
  è *Quell Impetuosity*, che la Tappa 5 giocava già. Adesso ogni regola
  ha i suoi `nomi`.
- **Lo Stubborn non si spendeva mai.** `combat.js` leggeva
  `stubbornUsed` dalla Tappa 3 e nessuno lo scriveva: al tavolo il
  testardo saltava il test a ogni assalto. Adesso lo Stubborn e lo
  Shieldwall si spendono nella stessa azione del test di rotta, e
  l'annulla li riporta indietro.
- **La salvezza del pannello veniva dall'unità grezza.** Una salvezza
  speciale fissata da una regola sarebbe stata rimessa a zero dal campo
  del pannello. Adesso il campo parte dalla schiera.
- **La Tusker Charge era dichiarata esprimibile, ed era vero**: il
  file sa dire cosa fa. Ma vale per il cinghiale e non per chi lo
  cavalca, e il conto dell'assalto non separa i due profili. Una regola
  che si sa scrivere e non si sa giocare adesso porta il suo `perche`,
  e la scheda la conta fra quelle a mano.

Quello che resta fuori, detto per non lasciarlo scoprire a una partita:

- **Quattro righe da verificare**: *Warpaint* e *Big 'Uns* degli Orchi,
  *Poisoned Wind* e *Teeming Masses* degli Skaven. Nessuna lista salvata
  le porta, e vengono dal riassunto del §8: la scheda della lista lo
  scrive.
- **Il Waaagh! fallito si spende.** Il testo dice «una volta per partita
  può tentare», e l'app legge che il tentativo è la cosa che si fa una
  volta. Se il libro dice altro, è una riga in `runArmyAbility`.
- **Lo Shieldwall non guarda gli scudi.** Il conto controlla che l'unità
  sia stata caricata e non sia in ordine aperto; lo scudo in uso lo
  guarda chi gioca, e il pannello glielo ricorda.
- **Le regole a mano che contano di più**: la *Tusker Charge* e la
  *Howdah* aspettano che l'assalto meni con due profili; il Comando di
  Ogdruz prestato ai Troll aspetta quello del Generale; gli attacchi
  alternativi del Gigante, i Fanatici e gli *Squigs Go Wild* aspettano
  un pulsante loro; *Guardians*, *Safe From Harm* e *Protect Da Boss*
  aspettano un tiro che sappia spostare i colpi da un bersaglio
  all'altro; la *Counter Charge* aspetta una quarta reazione alla carica.
- **Le regole d'esercito vere degli Uomini Lucertola**, quelle del
  libro, non sono trascritte: il file ha solo quelle delle unità
  schierate. E gli oggetti a uso singolo degli Skaven sanno di essere a
  uso singolo, ma non hanno ancora un pulsante.

*Fatto quando*: l'elenco «regole che non conosco» del pannello dello
scontro è vuoto per le dieci liste salvate. **Lo fa**, per le tredici che
ci sono adesso: la prova sta in `test/regole.mjs`, e senza i file
d'esercito le stesse liste tornano a mostrare la *Choppas* fra le ignote.
Le regole nei dadi le guarda `test/mischia.mjs`, il pulsante del Waaagh!
e la fuga sul tavolo `test/boot.mjs`.

**Tappa 6 — Magia. — fatta, con due righe del libro che non si accordano**
~~Generazione degli incantesimi~~, ~~il ciclo di lancio e
dissolvimento~~, ~~fiasco e invocazione perfetta~~, ~~effetti a
tempo~~, ~~incantesimi che restano in gioco~~, e non un dominio per
volta ma ~~tutti e otto~~, con ~~gli innesti degli army book~~ — Gork,
Mork, il Ratto Cornuto e Lustria — e il Beam of Chotec vincolato del
Bastiladon. Le regole stanno in `magic.js`, che di tavolo non sa niente
come `psych.js`; gli incantesimi in `dati/magia/domini.json`, fuori dal
codice come i file d'esercito.

Da dove viene. È la prima tappa scritta con **il libro aperto**: i
manuali sono in `Desktop\Warhammer`, e le pagine della magia (106-111)
e dei domini (319-335) sono state lette lì, non nel riassunto. Le pagine
citate sono quelle stampate, che nel PDF sono una in più.

Come si vede al tavolo. Un'unità con un mago dentro ha il blocco
**Magia** nell'ispettore. Livello e dominio si scelgono lì, perché il
file di New Recruit non li dice; *Genera gli incantesimi* tira i D6 nel
vassoio e lo riapre per i doppioni; una tendina fa lo scambio con la
firma del dominio o con un incantesimo del dominio d'esercito. In
partita ogni incantesimo ha il suo *Lancia*, e il lancio è una
sequenza di azioni del motore, ognuna annullabile: il bersaglio scelto
fra quelli misurati — distanza, arco, vista, in combattimento o no, e
chi non va bene porta il perché —, il tiro di lancio, la tabella del
fiasco, la finestra in cui l'avversario sceglie se dissolvere con un
mago in gittata o con la sorte, e alla fine l'effetto. Se la casella
del libro sta più avanti nel turno il lancio ci va da solo; se sta più
indietro si lancia lo stesso dove si è, e il registro scrive dove
andava — il turno non torna indietro per un incantesimo.

Il browser vero ha giocato il ciclo con i dadi veri: una generazione
con due doppioni ritirati, e un lancio finito in fiasco con la sua riga
della tabella. E ha trovato l'unico errore che le prove non vedevano:
una maledizione lanciata dall'inizio del turno finiva nella
congiurazione portandosi dietro la nota «si lancia nella
congiurazione».

Dei sessantasei incantesimi, **dieci** fanno colpi che l'app risolve da
sola, passando dalla stessa catena dello scontro con i colpi automatici
e senza armatura o rigenerazione quando il testo lo dice; **sedici**
diventano effetti a tempo o bandierine (quattro con una parte a mano);
**quaranta** — sagome, vortici, trasporti, Multiple Wounds, aure nel
raggio di comando — restano a mano, e il registro scrive la riga che
dice cosa fare. Quattordici restano in gioco, hanno *Termina*, e dal
turno dopo si dissolvono contro il valore di lancio.

Quello che questa tappa ha trovato per strada, e non era in programma:

- **Il libro contraddice se stesso sul dissolvimento.** A p. 110 si
  dissolve quando il risultato *supera* il lancio; nel riepilogo di
  p. 344, quando lo *uguaglia o supera*. Vince il testo della regola, e
  la costante `DISPEL_TIES` è il punto in cui cambiarlo se una FAQ dice
  altro.
- **Gli effetti non pesavano sui dadi.** `combatant` leggeva il profilo
  grezzo, e un −1 Resistenza stava scritto nell'ispettore e in nessun
  tiro — valeva anche per gli effetti della Tappa 0. Adesso la schiera
  legge da `effects.js`, e un Word of Pain toglie davvero un punto.
- **Una salvezza regalata sostituiva quella che c'era.** «Gain a 5+
  Ward save» su un'unità con 4+ l'avrebbe peggiorata. `effects.js`
  sa adesso la differenza fra fissare un valore e regalarne uno.
- **Le due correzioni del §2**, la tabella dei tipi di truppa e
  l'ordine di combattimento, sono venute fuori aprendo il libro per
  questa tappa.

Quello che resta fuori, detto per non lasciarlo scoprire a una partita:

- **Le sagome e i vortici** sono tutti a mano: la sagoma della Tappa 4
  sa cadere e deviare, ma non ancora muoversi a ogni inizio turno.
- **Il Drain Magic** è scritto in `castResult` (`cvUp`) e il tavolo non
  lo passa ancora; lo stesso vale per Mob Rule e Syphoned Strength degli
  Orchi. ~~La Magic Resistance~~ la passano il pannello e l'arbitro
  (p. 108).
- **Il mago con l'armatura** non tira (p. 111): `canCast` lo sa, il
  tavolo non glielo dice, perché il file non distingue bene l'armatura
  del mago da quella della cavalcatura.
- **I danni del fiasco** — le due sagome e il colpo a Forza 4 — sono
  scritti nel registro e tirati a mano; un incantesimo in gioco non
  finisce da solo quando il mago muore.
- **La scheda di preparazione della lista** chiede ancora gli
  incantesimi come testo, e non li porta al tavolo: si scelgono
  sull'unità.
- **Gli oggetti arcani** (Power Scroll, Dispel Scroll, Wand of Jet…) e
  il Panico dopo le perdite da un dardo magico non ci sono.

*Fatto quando*: un mago si prepara, genera, lancia e l'avversario
dissolve senza aprire il manuale, e il registro racconta tutto. **Lo
fa**. Le prove stanno in `test/magia.mjs`, che guarda la magia dal lato
dei numeri e dei dati, e il gesto sul tavolo lo guarda `test/boot.mjs`.

**Tappa 7 — Scenari, punti vittoria, fine partita. — fatta per il conto e la durata; mappe e obiettivi secondari restano fuori**
~~I punti vittoria~~, ~~il verdetto~~, ~~la durata variabile e il
punto di rottura~~, ~~le sei battaglie campali come dati~~ (pp. 286-299);
di Battle March ~~il controllo degli obiettivi a fine turno~~, ~~i
bonus dimezzati e i cinque round~~, ~~le tabelle a D6 degli obiettivi,
del landmark e delle mappe~~ (pp. 24-27), e ~~l'ordine delle due tabelle
della Tappa 0 bis~~ (pp. 40-41). Le regole stanno in `victory.js`, che
di tavolo non sa niente come `psych.js`.

Da dove viene. Il Core Rulebook alle pp. 286-299 e *Battle March*
alle pp. 24-27 e 40-41. Il secondo è un PDF fatto di immagini, e per la
prima volta un libro è stato letto con gli occhi invece che estraendo
il testo: le pagine si rendono a mezze pagine e si leggono.

Il numero sbagliato, questa volta, era un intero riquadro. **Il
punteggio del report era del Warhammer di prima**: contava le unità
«ridotte a metà» e i «quarti di tavolo», che in *The Old World* non
esistono, e diceva «vittoria di misura», «netta», «schiacciante» su una
scala proporzionale ai punti giocati che nessun libro stampa. Il libro
(p. 286) dice altro: un'unità distrutta o fuggita dal tavolo vale il
100% dei suoi punti, una in fuga a fine partita il 50%, una sotto un
quarto della Forza d'Unità iniziale il 25%; il generale 100, il
portastendardo da battaglia 50, ogni stendardo preso 50; e **si vince
solo con cento punti di scarto**, si stravince con il doppio, tutto il
resto è pareggio. Battle March (p. 27) dimezza i bonus, fa durare la
partita cinque round, dà 10 punti per ogni tesoro e 25 per il landmark
tenuti alla fine di *ogni* turno di giocatore, e fa vincere chi ne ha di
più, senza lo scarto.

Come si vede al tavolo. Ogni «Chiudi il turno» misura gli obiettivi con
la regola di p. 25 — la unità più vicina entro 3″ con Forza d'Unità 5 o
più, non in fuga e non stupida, a pari distanza la più forte, a pari
forza conteso — e il registro lo scrive con i punti. Nel pannello della
partita c'è la **Durata**: sei round, casuale, fino al punto di rottura,
o i cinque di Battle March, scelta dallo scenario e cambiabile. Alla fine
del round il registro dice se era l'ultimo; con la durata casuale si apre
il vassoio per il D6; con il punto di rottura, all'inizio di ogni turno,
si guarda chi è sceso sotto un quarto della sua Forza d'Unità. Nella
scheda Partite il punteggio ha le voci del libro, si sceglie se contare
come il libro base o come Battle March, e il verdetto cita la pagina.
Le partite archiviate prima tengono quello che era scritto a mano, e le
due voci del Warhammer di prima restano in fondo con il perché nel nome.

Quello che resta fuori, detto per non lasciarlo scoprire a una partita:

- **Le mappe di schieramento** di Battle March (p. 26) e delle battaglie
  campali sono dati, non zone: *Close Encounter*, *Opposed Flanks* e
  *Outflank* hanno cerchi e cunei, e `zones.js` disegna rettangoli. La
  tabella a D6 dice quale mappa, e la zona si disegna a mano.
- **Generale, portastendardo e stendardi presi** sono voci a mano: chi è
  il generale lo dice la scheda della lista e non arriva ancora al
  tavolo, e uno stendardo è un trofeo solo se l'unità è morta in
  combattimento o travolta in fuga (p. 200), cosa che il registro non
  distingue.
- **La Forza d'Unità a fine partita** è letta sui modelli, o sulle Ferite
  di un modello solo: un reggimento con dentro modelli diversi va
  corretto a mano.
- **Gli obiettivi secondari** di Battle March (*Raid & Burn*, i carri
  bagagli, pp. 36-37), le carte segrete e **il tiro del Caso della
  Guerra** all'inizio del turno non sono attaccati; il Caso della Guerra
  che fa valere di più i tesori e quello che allunga la partita si
  scrivono in `meta.chaos` e il conto li sente.
- **La caratteristica speciale** di *Comando e Controllo* (200 punti) e
  il suo controllo a 6″ del libro base (p. 272) non sono misurati: il
  controllo a fine turno misura solo tesori, landmark e monolite.
- **I tetti di composizione** di Battle March restano un controllo da
  fare sulla lista.

*Fatto quando*: una partita finisce e il report dice chi ha vinto e di
quanto secondo il libro. **Lo fa**, con le due voci da scrivere a mano.
Le prove stanno in `test/vittoria.mjs`, e il gesto sul tavolo lo guarda
`test/boot.mjs`.

**Tappa 8 — Il budget del movimento, i personaggi che menano, e l'archivio che risponde. — fatta**

Cinque cose che il piano dichiarava aperte, più due che erano buchi e
basta.

1. **Il budget di movimento.** Il §5.3 di questo piano diceva da due
   tappe: «il costo della ruota si calcola ma non si scala da un budget
   di movimento». Era il buco peggiore, perché produceva un numero
   sbagliato con l'aria di essere giusto: **un reggimento non va in
   diagonale**, e l'app disegnava un cerchio attorno all'ancora e diceva
   di sì a una diagonale che al tavolo non esiste. `movePlans` mette in
   fila i modi di arrivare in un punto — ruota e avanti, all'indietro,
   di lato, giro sul posto — ognuno con il suo costo contro il Movimento
   base: un pollice avanti ne costa uno, uno indietro ne costa due
   (p. 125), un arco di ruota costa i suoi pollici veri (p. 124), un
   giro di 90° un quarto del Movimento e uno di 180° la metà. Il più
   economico è quello che si legge, gli altri restano scritti. Tre
   conseguenze al tavolo: l'ispettore dice «8,4″ di 8″ (6,1″ di corsa
   più 2,3″ di ruota)», il tavolo disegna il gomito vero invece della
   diagonale, e la **marcia si riconosce sul costo** — un reggimento
   largo che gira di novanta gradi e poi fa quattro pollici ha
   marciato, e il pannello del tiro lo sa. `wheelCost` si trasferisce in
   `movement.js` con il resto del budget.

2. **I personaggi uniti menano.** Entravano nella psicologia e nel
   bonus dello stendardo, e i loro colpi sparivano: un Big Boss con
   quattro Attacchi di Forza 5 dentro un mob dove tutti ne hanno uno di
   Forza 3 spostava il risultato dell'assalto di due o tre punti senza
   lasciare traccia. Adesso ognuno è una squadra con il profilo intero,
   e l'ordine di Iniziativa non è più fra due contendenti ma fra tutte
   le squadre in campo, a gradini: chi sta sullo stesso gradino mena
   insieme, e le ferite di un gradino si applicano alla fine di quel
   gradino. Resta ai giocatori **a chi assegnare le ferite in arrivo**,
   che è quello che dice il manuale.

3. **Quanti si toccano davvero.** «La prima fila è larga quanto la più
   stretta delle due» è generoso e quasi sempre giusto di fronte, ma due
   unità che si incontrano d'angolo si toccano con tre modelli e il
   conto ne dava cinque. `touchingModels` conta le basette addosso al
   poligono nemico, e il pannello dichiara se il numero è contato o
   stimato — perché è il numero che moltiplica tutto il resto. Un
   personaggio in prima fila **occupa un posto** invece di aggiungerne
   uno.

4. **La Stupidità diventa un marcatore.** Il test c'era, l'effetto
   c'era, la scadenza giusta pure; mancava vederla. Adesso c'è un
   marcatore sopra il pezzo, un pulsante che la tira per tutti nella
   prima casella del turno, e il marcatore a mano — la Stupidità capita
   anche fuori dall'app. E una regola che mancava: chi ci è dentro
   **non lancia incantesimi**. Il tiro e la carica lo sapevano dalla
   Tappa 5, `canCast` no.

5. **La gittata della magia è una proprietà del profilo.** Esisteva nei
   dati dei vincolati, ma si scopriva solo premendo «mira»: sul tavolo i
   cerchi di portata erano quelli delle armi, e un Bastiladon con il
   Solar Engine — ventiquattro pollici — mostrava gli otto del suo
   giavellotto. `magicRange` risponde a «fin dove arriva la magia di
   questo pezzo», e da lì escono un cerchio, una riga nell'ispettore e
   una colonna nel report. Gli incantesimi vincolati si possono anche
   **dichiarare a mano**: New Recruit esporta le regole dell'unità base
   e l'oggetto che porta l'incantesimo spesso non ci finisce.

E due buchi che non erano regole.

- **Il dado del tiro mostrava sempre l'uno.** Il vassoio gira ogni cubo
  sulla faccia grezza del D6; i dadi della mischia la dichiarano, quelli
  del tiro no — passavano `{ value, win }` — quindi il cubo leggeva
  `undefined` e ripiegava sull'uno. I numeri erano giusti e le facce
  raccontavano un'altra partita, che è il modo più rapido di far perdere
  fiducia a un simulatore che mostra i dadi apposta. Corretto in due
  posti, perché uno solo lascia in piedi la trappola.
- **L'archivio adesso risponde.** Il nuovo `palmares.js` dice come va
  una lista leggendo il diario delle partite, e da lì escono i filtri
  dell'elenco («quali hanno i Clanrats?», «quali di Ogre?», «quali hanno
  vinto?»), le **liste esterne** — quelle che non sono tue e non devono
  comparire nel conto della vetrina — e le **partite senza turni**, che
  è come si archivia un torneo: quattro risultati e nessuna fotografia
  sono un dato completo, non una partita a metà. Il resoconto per l'AI
  chiede **chi hai giocato**, perché una critica ha bisogno di un
  bersaglio; e le foto del catalogo si tengono anche **intere**, non
  solo nella miniatura da 256 px con cui l'app disegna.

*Fatto quando*: si gioca un turno di movimento e il numero che si legge
è quello che il Movimento paga davvero, ruota compresa. **Lo fa.**
Le prove stanno in `test/movimento.mjs` (il budget), `test/battle.mjs`
(i personaggi e i contatti), `test/magia.mjs` (la gittata),
`test/dadi.mjs` (la faccia del cubo) e `test/liste.mjs` (palmarès,
filtri, liste esterne).

Quello che resta fuori, detto per non lasciarlo scoprire a una partita:
il costo decompone lo spostamento in **una manovra più una corsa**, che
è il gesto del tavolo ma non l'unico possibile — chi ruota due volte in
mezzo a un movimento paga più di quanto l'app scrive; la ruota vera fa
perno su uno spigolo e sposta anche il pezzo, mentre qui è contata come
un arco e poi come una corsa; e l'assegnazione delle ferite ai
personaggi resta dei giocatori, come dice il manuale.

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

## 13 · L'arbitro, e due macchine che giocano

Le prime dodici sezioni di questo piano davano per scontato che davanti
all'app ci fosse qualcuno. Una domanda arrivata dopo — *«si può far
giocare due modelli di linguaggio dalla lista al verdetto?»* — ha
mostrato che la distanza da lì era più corta di quanto sembrasse, e che
era fatta di quattro lavori ben definiti:

1. ~~**la mischia a più di due**~~ — fatta: `meleeRound(A, B)` prendeva
   due schiere, adesso `meleeFight` prende due gruppi, e il conto è
   quello di p. 153;
2. ~~**lo stato con le sue azioni**~~ — fatto: `arbitro.js` tiene il
   tavolo, elenca le mosse legali e le applica;
3. ~~**le ferite che persistono**~~ — fatte: `spill` non si azzera più
   fra un round e l'altro, e il tiro e la magia non buttano via il resto;
4. ~~**le ferite dei personaggi**~~ — fatte, ed erano una decisione e
   non un conto: si colpiscono solo dirigendoci i colpi (p. 209), le
   ferite non tracimano, l'urto vuole meno di cinque modelli di truppa.

E tre cose che bloccavano tutto il resto:

- ~~**il Movimento che le liste non portano**~~: ventitré unità su
  centosette non sapevano muoversi, perché il Movimento di chi va a
  cavallo sta sulla riga della cavalcatura e l'export la butta via.
  `dati/profili.json` porta quelle righe, lette sul libro con la pagina
  accanto;
- ~~**le liste che non si possono giocare**~~: una lista scritta a mano
  non ha profili, e l'app la giocava lo stesso — zero contro zero, cento
  per cento di pareggi, nessun avviso. Adesso `prep.js` lo dichiara;
- ~~**il raduno**~~, che è nella sezione della psicologia.

E una quinta, che era la voce più grossa di quelle che l'arbitro
dichiarava e non giocava:

5. ~~**la magia in partita**~~ — fatta. Tre decisioni, perché si
   rifacciano solo se si trova di meglio:
   - **gli incantesimi li tira l'arbitro**, prima dello schieramento,
     che è la regola (p. 106); la scheda di preparazione vince quando li
     porta come id (`spellIds`), e con loro `level` e `lore`. Quello che
     il file non dice — il Livello, i domini fra cui scegliere, la regola
     «Lore of …» che i Night Goblin delle liste salvate non portano — sta
     in `dati/magia/domini.json` alla voce `maghi`, letto sulla scheda di
     ogni mago con libro e pagina. Il Livello comprato come opzione il
     file non lo dice: vale quello di base, e il registro lo dichiara;
   - **non c'è una riserva di dadi del vento.** Il piano la dava per
     scontata; il libro (pp. 108-110) non ce l'ha: ogni tentativo tira i
     suoi 2D6, un incantesimo si tenta una volta per turno, la sorte una
     volta per turno, e il fiasco chiude il resto. Lo stato dell'arbitro
     ricorda solo questo (`S.magia`);
   - **la magia non ha una casella sua**: sta dove il libro la mette —
     una casella di congiurazione prima del raduno, i dardi nel tiro, gli
     assalti in mischia. Il dissolvimento è una domanda in sospeso per
     l'altro giocatore, come la reazione alla carica, e così l'assalto di
     chi non è di turno prima che si meni. L'arbitro offre **solo** gli
     incantesimi che sa applicare (colpi, modifiche, bandierine): gli
     altri sono testo, e un lancio che non cambia niente sul tavolo è un
     dado tirato per finta.

E una sesta, che pesava sull'esito più delle scelte dei modelli:

6. ~~**la psicologia e i personaggi uniti**~~ — fatti. Paura, Terrore e
   Stupidità si tirano (pp. 168, 178-179); i personaggi si uniscono allo
   schieramento o nelle mosse restanti ed escono prima che il reggimento
   si muova (p. 207), e il reggimento usa il loro Comando (p. 97) e il
   loro passo (p. 208). La Stupidità che si gioca è quella del testo delle
   liste, non quella di p. 178, e lo si dichiara.

E una settima, che cambiava la forma di ogni turno:

7. ~~**le manovre**~~ — fatte (pp. 124-125). La ruota si paga quanto
   cammina il modello esterno, e chi non ce la fa ruota quanto può e non
   avanza; gli schermagliatori e i personaggi soli non pagano (pp. 185,
   205), i Lumbering hanno 90° gratis se non marciano (p. 195). Il giro
   costa un quarto o metà del Movimento e fa dei ranghi file; la
   riforma gira sul centro, tiene il fronte e costa tutto; indietro e di
   lato si va a metà; il riordino sposta fino a cinque modelli in prima
   fila. Una manovra per movimento. Le decisioni prese, perché si
   rifacciano solo se si trova di meglio: la ruota si fa **una volta,
   all'inizio, sul centro** (il libro la fa sullo spigolo e lascia
   alternarla con i passi: limite `ruota`); la riforma si offre **solo a
   chi non riesce a girarsi ruotando**, perché a un Troll da una basetta
   una ruota di 70° costa due pollici e fermarsi sarebbe sempre peggio;
   dopo il riordino il resto non si cammina (limite `manovre`).

E un'ottava, che era l'ultima cosa del combattimento che l'app sapeva
contare e non sapeva giocare:

8. ~~**le sfide**~~ — fatte (pp. 211-212). Erano tre decisioni e non un
   conto, e adesso sono tre domande in sospeso come la reazione alla
   carica: si lancia quando il combattimento viene scelto, prima chi è
   di turno e poi l'altro, una sola per combattimento; chi la subisce
   la raccoglie o la rifiuta; chi la rifiuta lascia che l'altro nomini
   il personaggio che **si ritira** in fondo alle file. Le decisioni
   prese, perché si rifacciano solo se si trova di meglio:
   - **i due sfidanti sono due schiere, non due unità.** In
     `meleeFight` la sfida riscrive l'ingaggio — i due si vedono solo
     fra loro e nessun altro li vede — invece di filtrare i colpi dopo,
     perché l'ingaggio è già la domanda «chi mena a chi», ed è quella
     che la sfida cambia. La cavalcatura segue il cavaliere senza che
     nessuno gliene parli, e il rivale già caduto non la ferma (p. 212):
     quei colpi contano per l'overkill e non per il risultato;
   - **il ritiro toglie quello che si sa togliere.** Il libro dice che
     chi si ritira non dà più all'unità «Comando, regole speciali o
     qualunque altra cosa»: l'arbitro gli toglie i colpi, il Comando e
     le regole, e gli lascia il passo e la Forza d'Unità, che non
     saprebbe togliere senza farlo uscire dal reggimento. È il limite
     `ritirato`, e il registro lo dice;
   - **rifiutare si può solo se nessuno è con le spalle al muro.**
     «Nowhere to run» (p. 212) è una regola del modello, ma se uno dei
     possibili raccoglitori non può scappare, il rifiuto non è una
     risposta che quella parte possa dare: chi non può scappare «deve
     affrontare la sfida»;
   - **una sfida che nessuno può raccogliere non si offre.** Sul libro
     è legale e «resta senza risposta»: non cambia niente sul tavolo, e
     questo arbitro non offre gesti che non cambiano niente — come non
     offre gli incantesimi che non saprebbe applicare;
   - **i campioni d'unità restano fuori**, e non per scelta: il file di
     New Recruit dice che il gruppo di comando c'è e non dà al campione
     un profilo suo. Limite `campioni`.

E una nona, che era l'ultima cosa del tiro che l'app sapeva calcolare
e non sapeva giocare:

9. ~~**le sagome e le macchine da guerra**~~ — fatte per la parte che
   il libro chiama **Bombardata** (pp. 224-226). `shoot.js` aveva le
   sagome, la deviazione e le due tabelle del Mancato Colpo dalla
   Tappa 4, e nessuno gliele chiedeva: quello che mancava era la
   posizione **modello per modello**, che `formation.js` sapeva dare
   da sempre (`worldCells`). Le decisioni prese, perché si rifacciano
   solo se si trova di meglio:
   - **la sagoma non guarda le bandiere.** Le caselle che si
     confrontano con la sagoma sono quelle di tutto il tavolo, amiche
     comprese, perché il libro dice «any model whose base lies
     underneath»; e il personaggio unito a un reggimento, che a un
     arco non si può bersagliare (p. 209), sotto la sagoma è una
     basetta come le altre — `layout` gliene dà una marcata `char`, e
     il colpo va a lui e non al reggimento;
   - **il buco centrale è un punto, non un cerchio.** Il libro gli dà
     due regole — è colpito anche se ci sta sotto solo in parte
     (p. 95), e prende la Forza fra parentesi (p. 224) — e non gli dà
     un diametro. L'app prende il modello la cui basetta sta sopra il
     punto centrale della sagoma, che è quello che al tavolo si trova
     con la matita nel buco, e se sono due vince il più vicino di
     centro: il libro dice «a single model»;
   - **una sagoma che il libro in casa non descrive non si spara.**
     Quale sagoma usa un'arma sta nelle Note del profilo e l'export di
     New Recruit le butta via: l'app ha la riga dei tre pezzi che i
     suoi libri descrivono e per gli altri dichiara il limite. Fra tre
     pollici e cinque ce ne sono due di diametro, e indovinare vuol
     dire sbagliare in silenzio;
   - **la gittata si legge come il profilo la scrive.** «12-60"» è una
     fascia con un minimo, e `stat()` ne tornava 12 — un lanciapietre
     che spara a dodici pollici; «8D6"» è una gittata che si tira, e
     ne tornava 8.

   E poi il **Warp Lightning Cannon**, che è l'unica macchina da
   guerra delle liste salvate e non aveva mai sparato un colpo in
   nessuna partita. La sua non è una sagoma: è una **linea** lunga
   8D6″ tirata dal bordo della basetta, e ogni modello che ci finisce
   sotto — amico o nemico — prende un colpo di Forza pari a un dado di
   artiglieria (Legends: Skaven, p. 19). Il Mancato Colpo va su una
   terza tabella, che non è del Core Rulebook.

   Per arrivare a sparare gli servivano quattro regole che l'app non
   aveva o aveva lette male, e sono la parte di questo lavoro che si
   sente di più in una partita qualunque:

   - **«Weapon of War»** (p. 197), che è il tipo di truppa e non
     un'arma: una macchina da guerra non marcia, non dichiara cariche,
     non insegue, e ha −1 al tiro di fuga. L'arbitro la faceva
     marciare al primo turno e caricare al secondo;
   - **«Move or Shoot»** (p. 174), che è un divieto dell'ARMA e non
     dell'unità, e non arrivava a `canShoot`: i Warplock Jezzails
     marciavano e sparavano nello stesso turno, con «ha mosso» scritto
     accanto. E l'euristica non sapeva restare ferma per sparare —
     il commento lo prometteva e il codice non lo faceva —: adesso
     l'opzione «resta ferma» porta un campo suo quando muoversi
     costerebbe il tiro, perché l'elenco delle mosse non porta le armi;
   - **«Cumbersome»** (p. 167), che qui era dichiarata da verificare
     con un onesto «cosa impedisce esattamente», e dice una cosa sola:
     quell'arma non si usa per il *tira e tieni*;
   - **«Ponderous»** e **«Quick Shot»** (p. 175), anche loro da
     verificare: la prima raddoppia il −1 di chi ha mosso, la seconda
     lo toglie e lascia sparare a chi carica da qualunque distanza.
     Questo file diceva che «Quick Shot» desse *tiri in più*, che era
     un'invenzione del nome.

   E l'euristica non conosceva i due gesti nuovi: cercava `tira` e
   basta, e la macchina restava ferma tutta la partita con la sua
   opzione in elenco e nessuno che la prendesse.

E l'arbitro è sceso sul tavolo: la **Sfida** della scheda Matchup fa
giocare una persona contro il modello di linguaggio, con l'arbitro in
mezzo (`controai.js`).

**Chi comincia** (Core pp. 285, 289; Battle March pp. 26-27). L'arbitro
non lo tirava: la parte A schierava per prima e muoveva per prima in
ogni partita, e ogni serie di partite fra due macchine lo ereditava
senza dirlo — il commento di `partita.mjs` sosteneva il contrario. Il
libro fa due tiri, diversi nei due manuali: nel Core chi vince il primo
**sceglie** chi schiera la prima unità (p. 285), e a schieramento
finito si tira ancora con **+1 a chi ha finito di schierare per
primo**, e chi vince comincia senza scegliere (p. 289, la stessa riga
in tutti gli scenari del libro); in Battle March chi vince il primo
schiera per primo senza scegliere (p. 26), e chi vince il secondo
**sceglie** chi comincia, senza +1 (p. 27). Le scelte sono gesti
(`primo`), e «passo» vuol dire «io». Gli scenari del libro che fanno
cominciare un esercito comunque (gli Orchi di L'Anguille, p. 289) non
sono fra quelli dell'app; `newBattle({ primo: "A" })` fissa una parte
per chi ne ha bisogno.

### Cosa resta

- **La magia che resta testo.** Vortici, trasporti, sagome, linee: un
  trentatré dei cinquantasei incantesimi del manuale base: l'arbitro ne
  gioca ventitré. Vogliono la geometria delle sagome
  (la stessa del punto qui sotto) e il movimento fuori turno. Con loro
  gli assalti al passo d'Iniziativa del mago (p. 158), che oggi si
  lanciano prima che si meni, e le ferite degli assalti nel risultato.
- **Il volo**, che vuole una decisione e non un conto: sorvolare
  significa ignorare il terreno e chi sta in mezzo, e oggi il
  movimento dell'arbitro è una linea retta.
- Delle **macchine da guerra**, i quattro modi di sparare che non sono
  la Bombardata: la palla di cannone con il suo rimbalzo e il
  «Crunch», la grappola, l'organo, il lanciafiamme. La palla vuole la
  linea che attraversa il tavolo — `SH.lineUnder` la sa già dare — più
  il tetto di un colpo per rango o per fila e le due cose che la
  fermano di colpo.
- ~~**«Multiple Wounds»**~~ — fatta (p. 175): ogni ferita non salvata
  tira il suo dado e cade su un modello solo, e l'eccesso non passa al
  vicino. `takeWounds` in `combat.js` scorre ferita per ferita e torna
  le ferite **perse** (quelle che il risultato conta, p. 212) e quelle
  **fatte** (l'overkill di un personaggio); le previsioni usano la
  media del dado tagliata alle ferite del modello (`multiMean`). Sulla
  Bombardata vale solo per il buco (pp. 224, 228). E con lei una
  correzione che valeva per tutti: nel risultato entrano le ferite
  **perse** e non quelle non salvate (p. 152), anche senza la regola.
- Il **profilo diviso** di una macchina da guerra (p. 97): Resistenza
  e Ferite dell'equipaggio in combattimento, quelle della macchina
  fuori, e il modello che se ne va se uno dei due arriva a zero.
- **I campioni d'unità**, che il libro lascia sfidare e l'app no,
  perché il file dice solo che il gruppo di comando c'è; e quello che
  il ritiro non toglie — il passo e la Forza d'Unità.
- **L'Open Order** (p. 183), che il parser legge come formazione
  sciolta: i Warplock Jezzails e gli Squig si girano gratis e vedono a
  360°, e il libro li vuole in ranghi, con un giro rapido di 90° dopo
  essersi mossi e senza il −1 al tiro di chi li bersaglia.

Nessuna di queste è un buco silenzioso: stanno in `LIMITI` dentro
`arbitro.js`, e ognuna esce nel registro della partita la prima volta
che conta qualcosa. Una partita giocata da un arbitro che tace non
insegna niente.
