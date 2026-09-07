# Analisi: cosa mancava e cosa si può ancora migliorare

> **Stato.** Quasi tutto quello che segue è stato implementato. Restano
> aperti solo i punti raccolti in fondo, al §7. Il documento resta com'era
> scritto perché il ragionamento vale più dell'elenco: è il criterio con
> cui decidere anche le prossime.
>
> Fatti: ferite (§1.1), zone disegnate a mano (§1.2), liste e unità
> scritte a mano (§1.3), marcatori liberi (§1.4), etichette libere
> (§1.5), contatori liberi (§1.6), sagome di misura (§1.7), fantasma del
> turno precedente (§1.8), aggancio al contatto (§1.9), finestra
> dell'app al posto dei ventitré dialoghi nativi e scorciatoie nel
> registro (§2.1), raggruppamento della barra del tavolo (§2.2),
> bersagli grandi e menu contestuale sul tocco (§2.3),
> `extras` nei serializzatori (§4) — più **l'ancora di
> movimento**, che nell'analisi non c'era e che è il vero rimedio a «i
> cerchi seguono il pezzo e mentre lo muovo non so più da dove sono
> partito».

Lettura del progetto allo stato di partenza (`f3dcf8c`), con i test che passano.
Scritta dal punto di vista di chi gioca, non di chi legge il codice: la domanda
non è «questo modulo è pulito», è «al tavolo, cosa mi tocca ancora tenere a
mente da solo».

---

## 0 · Il principio che tiene insieme tutto il resto

La scelta di fondo è già quella giusta ed è scritta nei commenti di
`game.js`: **l'app non arbitra**. Vale la pena renderla una regola di
progetto esplicita, perché decide da sola metà delle domande che seguono.

> L'app sa **geometria, quantità e memoria**. Non sa mai **legalità**.

Tutto ciò che è geometria (dove sta un pezzo, quanto è lontano, cosa tocca
cosa) l'app lo calcola bene e non invecchia mai: la geometria non cambia con
le FAQ. Tutto ciò che è quantità (quanti modelli, quanti punti, quante
ferite) è un numero che il giocatore muove. Tutto ciò che è memoria (com'era
il tavolo tre turni fa) è una fotografia.

La conseguenza pratica è che **le funzionalità che danno più libertà sono
quelle generiche**, non quelle specifiche. Un «marcatore con testo libero»
copre obiettivi, segnalini magici, stendardi catturati, «qui è morto il
generale» e dieci cose che non abbiamo previsto. Un «marcatore obiettivo»
copre una cosa sola e domani ne serve un altro.

Le proposte qui sotto sono ordinate su questo criterio: **quanta libertà si
compra per riga scritta**.

---

## 1 · I buchi veri, in ordine di valore

### 1.1 — Le ferite non esistono (il più grosso)

Oggi l'unica perdita che l'app conosce è **il modello tolto**: `setLost()`
alza `u.lost`, `FM.syncFallen()` accorcia il reggimento, e a `lost >= models`
l'unità esce dal campo.

Va benissimo per venti Orc Boyz. Non funziona per **tutto il resto**: un
personaggio è un modello con più ferite, un mostro è un modello con parecchie
ferite, un carro è un modello con le sue. Nel gioco reale quello che si perde
per tre quarti della partita sono **ferite**, non modelli — e l'app non ha
dove metterle. Le uniche opzioni sono «intatto» o «distrutto».

Il rimedio è un numero e basta, coerente col principio:

- un campo `wounds` sull'unità (ferite subite dal modello in cima, o
  cumulative — lo decide il giocatore), con `+` / `−` accanto alle perdite;
- il totale di ferite del profilo l'app lo legge già: `u.stats.W` arriva dal
  parser e finisce nell'ispettore;
- sul tavolo un badge piccolo tipo `2/4` sull'unità, come i numeri;
- va nel registro (`logLine`) e nella fotografia di fine turno, quindi entra
  nel report senza altro lavoro.

Nessuna regola scritta: l'app non sa quando una ferita si perde, sa solo
contarle. Ma senza, il diario di una partita con un drago è muto proprio nel
punto in cui la partita si decide.

**Tocca:** `game.js` (nuova funzione gemella di `setLost`), `deploy.js`
(`gameBlockHTML`), `battlelog.js` (`turnRecord` e la tabella dell'andamento),
`reports.js` (partita a mano).

### 1.2 — Le zone di schieramento non si disegnano

`scenarios.js:geometry()` conosce cinque disposizioni: `pitched battle`,
`opposed flanks`, `flank`, `pass`, `meeting engagement`. Uno scenario salvato
(`scenariokit.js:saveCustom`) conserva tavolo, gap e terreno, ma per le zone
salva solo **una di quelle cinque parole**.

Vuol dire che ogni scenario nuovo — uno di un libro, uno di un torneo, uno
inventato al circolo — o rientra in una delle cinque o non si può
rappresentare. Ed è esattamente il tipo di cosa che continuerà a servire per
sempre, una alla volta, per sempre.

Il rimedio toglie il problema per sempre invece di rimandarlo:

- una modalità **«disegna zona»**: trascini un rettangolo sul tavolo, gli dai
  un'etichetta e un proprietario (`A`, `B`, neutra, vietata);
- le zone disegnate stanno in un array nello stato, esattamente come il
  terreno, e sostituiscono l'uscita di `geometry()` quando ci sono;
- `unitStatus()` continua a funzionare identico: già cicla su `zonesFor()` e
  su `sc.blocked`, cambia solo da dove arrivano i rettangoli;
- lo scenario salvato porta con sé le zone, e a quel punto **qualsiasi**
  scenario è rappresentabile senza che l'app ne sappia niente.

È il singolo intervento con il rapporto libertà/righe più alto di tutta
questa lista.

### 1.3 — Una lista si può solo importare

`lists.js` espone `importListText()` e nient'altro che crei una lista. Sul
tavolo, `deploy.js` non ha un pulsante «aggiungi unità»: le unità entrano
solo da `addRoster()`, cioè da un file New Recruit, da un incolla o
dall'esempio.

Al circolo l'avversario arriva con la lista **stampata**, o scritta a mano, o
sul telefono in un formato che non è il tuo. In quel momento l'app non serve
a niente: non c'è modo di mettere dentro sei unità senza scrivere JSON.

Serve poco:

- **Nuova lista vuota** nella scheda Liste, e una riga «aggiungi unità» con i
  cinque campi che contano davvero — nome, modelli, punti, basetta, fronte.
  Tutto il resto (`stats`, `rules`, `weapons`) è già facoltativo dappertutto
  nel codice: l'ispettore fa `${u.stats ? ... : ""}`, `movementBands()` torna
  `null` senza `M`, `nearbyHTML` non se ne accorge;
- lo stesso pulsante sul tavolo, che aggiunge un'unità all'esercito A o B;
- **duplica lista**, per le varianti della propria che si provano fra una
  partita e l'altra.

L'oggetto da creare è già definito: è quello che ritorna
`parser.js:readUnit()`.

### 1.4 — Marcatori liberi sul tavolo

Sul tavolo esistono unità e terreno. Non esiste un terzo tipo di oggetto, e
quel terzo tipo è il jolly che copre tutto quello che non abbiamo previsto:

obiettivi che non siano il tesoro Battle March, segnalini magici, un
promemoria «qui è caduto il portastendardo», l'area di un incantesimo che
resta in gioco, il punto da cui arrivano i rinforzi, il quarto di tavolo
conteso, la nota «da qui in poi terreno difficile perché lo abbiamo deciso
così».

Un solo tipo di dato:

```
{ mid, x, y, rot, shape: 'token'|'rect'|'circle', w, h,
  label: <testo libero>, color, army: 'A'|'B'|null }
```

Trascinabile come tutto il resto (l'interazione in `deploy.js` è già generica
su `obj.x/obj.y`), disegnato con le stesse funzioni del terreno, incluso
nelle fotografie di fine turno e quindi nel report. **Un tipo di dato al posto
di dieci funzionalità.**

### 1.5 — Stati liberi per unità

Oggi gli stati sono tre e sono cablati: `dead`, `fled`, e implicitamente
`!placed`. `reports.js:STATES` li elenca tutti e quattro.

Nel gioco reale gli stati che ti dimentichi sono altri, e cambiano da
edizione a edizione: unità impegnata, disordinata, che ha già caricato, che
ha già tirato, sotto un incantesimo, che ha usato l'oggetto una volta sola,
che deve ancora fare il test.

Il rimedio è lo stesso di sempre: **etichette libere**. Un campo di testo
sull'unità che accetta parole separate, con il completamento automatico
prese dalle etichette che hai già usato in questa partita (nessun dizionario
da mantenere). Sul tavolo diventano due o tre lettere sopra l'unità; nel
report diventano una colonna; in `game.js` diventano una riga di registro
quando le metti o le togli.

I due stati esistenti restano dove sono, perché il punteggio automatico li
legge (`battlelog.js:applyAuto`). Le etichette sono in più, non al posto.

### 1.6 — Contatori liberi

Non c'è nessun posto dove tenere un numero che non sia «modelli» o «punti».
Le risorse della magia, le munizioni contate, i punti comando, le cariche di
un oggetto, i tiri di un pezzo d'artiglieria: tutta roba che al tavolo si
tiene con i dadi girati e si sbaglia.

Un contatore è `{ nome, valore }` con due tasti. Ne servono due livelli:

- **per esercito**, nel pannello Partita accanto al tabellino;
- **per unità**, nell'ispettore sotto le perdite.

I nomi li scrive il giocatore e restano proposti la volta dopo. Ogni
variazione va nel registro con turno e fase, quindi il report racconta anche
questo. Zero regole: l'app non sa cosa conta, sa contare.

### 1.7 — Sagome di misura, non solo righelli

`state.rulers` tiene fino a otto misure punto-punto, ed è ottimo. Manca
l'altra metà di quello che c'è fisicamente su un tavolo: **le sagome**. Un
cerchio di raggio dato, un rettangolo, una goccia.

Servono per la stessa ragione dei righelli — «ci arrivo?», «quanti ne prende
dentro?» — e sono pure geometria: nessuna regola, solo una forma appoggiata
sul tavolo che resta lì e si può trascinare. Il codice che serve è quello
delle sagome del terreno con `pointer-events:none` e un raggio impostabile.

Bonus quasi gratis: sapendo quali basette cadono dentro la sagoma (la
formazione dà già la posizione di ogni modello, `formation.js:layout`),
l'app può dire «12 modelli sotto» senza sapere cosa significhi.

### 1.8 — Il fantasma del turno precedente

Le fotografie di fine turno **contengono già** posizione, rotazione e
ingombro di ogni unità (`battlelog.js:turnRecord`). Non vengono usate sul
tavolo grande: solo nello schermino di `tableshot.js`, in piccolo.

Disegnare l'unità com'era **all'ultima fotografia**, in trasparenza sotto
quella di adesso, costerebbe pochissimo e risolverebbe da sola una delle
limitazioni dichiarate nel README:

> Il *mosso* di un'unità è lo spostamento **netto** fra due fotografie: chi
> avanza e poi ripiega risulta fermo, e una ruota sul posto risulta zero.

Con il fantasma la ruota si **vede**, e non serve misurare il percorso per
capire cosa è successo. È anche il modo naturale di rispondere a «ma di
quanto mi sono mosso?» mentre ti muovi, invece che dopo.

### 1.9 — Il magnetismo non aggancia al contatto

`magnetise()` allinea solo unità con **lo stesso orientamento** — è scritto
sia nel codice che nei limiti noti del README. Ma il gesto che al tavolo si
fa cento volte non è allineare due reggimenti paralleli: è **appoggiare il
caricante contro il bersaglio**, a filo, sulla faccia che ha scelto.

Ed è geometria pura, quindi è terreno dell'app:

- trascini l'unità vicino a un'altra, l'app trova la faccia più vicina
  (fronte, fianco, retro: `formation.js:contactList` sa già distinguerle),
  ruota il caricante per metterlo parallelo a quella faccia e lo appoggia a
  contatto zero;
- il centraggio sulla faccia lo lascia al giocatore, che è la parte dove le
  regole entrano davvero.

L'app non decide se la carica è legale. Mette il pezzo dove il giocatore ha
già deciso di metterlo, e lo mette dritto.

---

## 2 · Interfaccia

### 2.1 — I dialoghi nativi sono ventitré

`prompt()`, `confirm()` e `alert()` compaiono 23 volte fra i moduli. Sono
comodi da scrivere e pessimi da usare: sul telefono coprono lo schermo, in
un'app installata hanno un aspetto estraneo, e `prompt()` in particolare —
usato per **annotare durante la partita** (`game.js:440`) — è il gesto
sbagliato proprio dove serve il gesto giusto.

Due cose:

1. una finestrella dell'app (ne esiste già una: `formeditor.js` apre un
   editor modale) per input e conferme, con lo stile del resto;
2. per il registro, **chip già pronti** invece del campo vuoto: `carica`,
   `in rotta`, `rally`, `generale`, `stendardo`, `incantesimo`. Si tocca uno,
   finisce nel registro con turno e fase, e la riga del report si scrive da
   sola. Chi vuole scrivere a mano scrive lo stesso.

Durante una partita vera nessuno scrive frasi su una tastiera virtuale. Con
i chip il registro si riempie; senza, resta quasi vuoto — e il report vale
quanto il registro che lo alimenta.

### 2.2 — La barra del tavolo ha venti pulsanti in fila

`index.html` mette in `.board-bar` scenario, annulla, ripeti, schiera,
ritira, snap, numeri, foto, raggi, archi, distanze, misura, cancella
righelli, tre di zoom, adatta, immagine, link, tavolo, gap. Su un portatile
va a capo; su tablet è una lotteria.

Raggruppare per intenzione, non per ordine di scrittura:

- **Vista** (zoom, adatta, numeri, foto) in un menù a comparsa;
- **Aiuti** (raggi, archi, distanze, misura, righelli) in un altro;
- in barra restano i cinque che si toccano davvero mentre giochi: annulla,
  ripeti, snap, schiera/ritira, e il selettore di scenario.

I toggle hanno già la classe `.on`: manca `aria-pressed`, che è una riga.

### 2.3 — Il tocco

L'interazione è a `pointer` events e il pizzico c'è (`view.js`), quindi la
base è buona. Mancano due cose che su tablet si sentono:

- **bersagli piccoli**: la maniglia di rotazione è un pallino, e su una
  basetta da 25 mm a zoom medio è quasi invisibile. Un'area di tocco
  invisibile più larga della grafica risolve;
- **nessun menù contestuale**: pressione lunga su un'unità dovrebbe aprire le
  quattro cose che si fanno sempre (ruota, formazione, perdita, ritira) senza
  passare dall'ispettore in fondo al pannello.

### 2.4 — Accessibilità

Tre attributi `aria-` in tutto il progetto. Non è un progetto pubblico e non
è una priorità, ma tre interventi da poche righe:

- `aria-pressed` sui toggle;
- `role="application"` e un'etichetta sull'SVG del tavolo;
- il focus visibile sui pulsanti della barra (adesso lo stile lo mangia).

---

## 3 · Utility che mancano e costano poco

**Scheda riassuntiva stampabile dell'esercito.** `parser.js` legge già
profilo, regole speciali, armi con gittata, basetta e taglia unità. Tutta
questa roba si vede **una unità alla volta**, solo nell'ispettore, solo se
quell'unità è selezionata. Una pagina con tutte le unità di un esercito —
riga di caratteristiche, regole, armi — è quasi solo HTML sopra dati che
esistono, e sostituisce il foglio stampato che ci si porta al tavolo.

**Punti dello scenario contro punti della lista.** `SCENARIOS['bm-guado'].pts`
vale 600 e la somma dei punti della lista è già in `renderArmies()`. Dirlo
prima della partita è aritmetica, non una regola.

**Durata della partita.** Nessuno scenario dichiara quanti turni si giocano e
la partita non sa quando finisce. Un campo «turni previsti» nella scheda
partita, e il pannello che dice «turno 4 di 6», è memoria pura.

**Il registro come esportazione autonoma.** Il report per l'AI è ottimo. Manca
la cosa piccola: copiare **solo** il registro di una partita, o solo la
tabella dell'andamento, per incollarla in chat senza le venti pagine.

**Backup: un promemoria.** I dati stanno in IndexedDB su quel browser e la
persistenza si chiede ma può essere negata (`store.js:requestPersistence`
può tornare `null`). Il catalogo lo scrive nella riga di stato. Manca la
cosa che serve davvero: ricordarsi da soli che l'ultimo backup ha due mesi.
Una data nell'archivio e un avviso dopo N partite archiviate.

---

## 4 · Nota di architettura, prima di aggiungere qualsiasi cosa

`deploy.js` è a 1929 righe e tiene insieme stato, pannello laterale,
ispettore, disegno del campo, interazione, import, controlli e persistenza.
Il README lo giustifica, e per com'è oggi la giustificazione regge.

Il problema è che **quasi tutto quello che c'è qui sopra finirebbe lì
dentro**: i marcatori, le zone disegnate, i contatori, il fantasma, il
contatto magnetico. Prima di cominciare vale la pena staccare due cose che
escono pulite:

- `board.js` — `drawBoard()` e `drawTactics()`, circa 350 righe, che
  ricevono lo stato e disegnano. Non hanno bisogno di sapere altro;
- `markers.js` — il tipo di dato generico del punto 1.4, con le sue funzioni
  di disegno.

C'è poi un problema di forma che si paga a ogni funzionalità nuova. Lo stato
del tavolo viene serializzato in **quattro posti diversi**, ognuno con la sua
lista di campi:

| dove | cosa fa |
|---|---|
| `deploy.js:snapshot()` | elenco esplicito di chiavi di `state` |
| `share.js:UNIT_KEEP` | elenco esplicito di campi dell'unità |
| `battlelog.js:turnRecord()` | costruisce un record suo |
| `store.js:exportAll()` | copia tutto per chiave (questo va bene) |

Aggiungere un campo nuovo — `wounds`, `tags`, `counters`, `markers` —
significa ricordarsi di **tre elenchi**, e dimenticarne uno non dà errore:
dà un dato che sparisce quando ricarichi, o quando condividi il link, o
quando archivi il report. È il tipo di bug che si scopre a partita finita.

Due modi per toglierlo di mezzo, in ordine di costo:

1. un campo unico `extras` (oggetto libero) su unità e su stato, che i tre
   serializzatori copiano **alla cieca**. Tutte le funzionalità generiche di
   questa analisi ci stanno dentro senza toccare più niente;
2. o, meglio ma più lungo, invertire gli elenchi: dire cosa **non** va
   serializzato invece di cosa va, così il difetto è «salvato di troppo» e
   non «perso in silenzio».

---

## 5 · Cosa non farei

Per chiarezza, visto che sono le richieste che arrivano sempre:

- **risoluzione dei combattimenti, test di rotta, fase magica automatica.**
  Sono le regole con cui l'app comincerebbe a discutere coi giocatori, e
  invecchierebbero a ogni errata;
- **controllo di legalità della lista** (composizione, limiti, oggetti).
  Cambia a ogni pubblicazione e non è mai giusto per tutti i formati;
- **legalità della carica, delle linee di vista fini, dei fiancheggiamenti.**
  L'app già dice le distanze e cosa blocca la vista, e dichiara che è
  un'indicazione. È il livello giusto;
- **un tiradadi** come funzione centrale. Al tavolo i dadi ci sono già. Se
  mai, uno accessorio che scrive il risultato nel registro — ma non è
  urgente;
- **sincronizzazione fra dispositivi.** Vuol dire un server, cioè un account,
  cioè la fine della frase «nessun dato esce dal dispositivo». Il backup e il
  link condiviso coprono i due casi reali.

La regola per decidere in futuro resta quella del punto 0: se la
funzionalità **sa qualcosa che il manuale può cambiare**, non va scritta. Se
sa solo dove stanno i pezzi e quanti sono, va scritta.

---

## 6 · L'ancora di movimento

Non era in questa analisi e vale da sola quanto metà dei punti sopra,
perché risponde alla domanda che si fa a ogni singolo movimento di ogni
singolo turno.

I cerchi di movimento c'erano, ma erano disegnati **attorno all'unità**:
appena la trascinavi si portavano dietro il centro, e la risposta a «fin
dove posso arrivare?» spariva proprio nel momento in cui serviva. Il
giocatore vedeva un cerchio che lo seguiva e si dimenticava da dove era
partito.

L'ancora è il punto da cui l'unità ha cominciato a muoversi in questo
turno. La sagoma di dov'era resta sul tavolo, i quattro cerchi
(movimento, marcia, carica media, carica massima) si disegnano **lì e
restano fermi**, e mentre trascini una riga fra i due punti dice quanti
pollici hai fatto su quanti ne hai, con quanti ne restano. Si mette da
sola al primo spostamento e si azzera a ogni fine turno.

Le tre soglie derivate (`M×2`, `M+7`, `M+12`) sono una convenzione
dichiarata, non una regola letta da un manuale, e M si corregge a mano
nell'ispettore. È il compromesso coerente col §0: l'app disegna un
cerchio, non decide se il movimento era permesso.

---

## 7 · Cosa resta aperto

Non è stato fatto, e ha ancora senso:

- **Scheda riassuntiva stampabile dell'esercito** (§3). Tutti i dati ci
  sono già nel parser, si vedono solo una unità alla volta.
- **Punti dello scenario contro punti della lista**, **durata della
  partita**, **esportazione del solo registro**, **promemoria del
  backup** (§3).
- L'estrazione di `board.js` da `deploy.js` (§4), che nel frattempo è
  cresciuto ancora.
