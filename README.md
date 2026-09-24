# Schieramento Old World

Quattro cose che si tengono per mano, per **Warhammer: The Old World**:

**Il principio che tiene insieme tutto.** *L'app propone, calcola e ricorda. **Non impedisce mai**.*

Per molto tempo la frase era un'altra — «sa geometria, quantità e memoria, non sa mai legalità» — e proteggeva da due cose che uccidono le app da tavolo: dare risposte sbagliate con l'aria di essere sicure, e invecchiare a ogni FAQ. Il [piano regole](PIANO-REGOLE.md) l'ha cambiata a occhi aperti, perché mettere il manuale dentro l'app senza diventare un arbitro che sbaglia in silenzio chiede tre obblighi, non zero regole:

- **tracciabile** — accanto al numero c'è da dove viene: «serve 8,4″ (6,1″ di corsa più 2,3″ di ruota)», «oltre la portata massima di carica: 11,3″ contro 10″ (p. 119)»;
- **scavalcabile** — il pulsante grigio si preme lo stesso, e la tua versione finisce nel registro senza discutere;
- **dichiarata incompleta** — quello che l'app non sa fare non sparisce in silenzio, finisce nell'elenco di quello che non ha applicato.

I dadi li tira con il generatore vero del browser, mostrando ogni faccia uscita. Sa dove stanno i pezzi, quanti sono e com'erano tre turni fa. E tre cose restano ai giocatori per sempre: **le decisioni** (chi carica cosa, quando marciare, se accettare una sfida), **gli accordi** (il manuale stesso, a p. 93, dice che quando due interpretazioni si scontrano si tira un dado e si va avanti), e **il tavolo** — se le miniature stanno mezzo pollice più in là di come le disegna l'app, hanno ragione le miniature.

Ne discende tutto il resto, a partire dalla regola che le funzionalità **generiche** valgono più di quelle specifiche: un marcatore con testo libero copre obiettivi, segnalini magici, aree di incantesimo e «qui è morto il generale»; un marcatore *obiettivo* copre una cosa sola e domani ne serve un altro.

1. **Catalogo** — la collezione di miniature, una voce per tipo di modello, con quante ne possiedi e una foto.
2. **Liste** — i roster esportati da New Recruit, con ogni unità agganciata a una voce del catalogo.
3. **Matchup e tavolo** — due liste a confronto, la verifica di cosa hai davvero in vetrina, e il simulatore di schieramento con zone, terreno e controlli di legalità.
4. **Partita** — turni, fasi, perdite modello per modello, contatti di basetta e il tavolo in miniatura a ogni turno, per quando lo schieramento è finito e si comincia a giocare. Con le statistiche che arrivano dalle liste, il tavolo mostra anche dove si può arrivare, cosa si vede da dove, e come finirebbe un assalto.
5. **Partite** — il diario delle battaglie: schieramento, movimento e perdite di ogni unità alla fine di ogni turno, punteggio voce per voce, e l'esportazione del battle report in un formato pensato per essere incollato a un'intelligenza artificiale.

Tutto gira nel browser. Nessun server, nessun account, nessun dato che esce dal dispositivo. Si installa come app e funziona senza rete. Se l'archivio ti serve su più dispositivi — o in due — c'è la **Nuvola**: un pulsante che scrive collezione, foto, liste, partite e scenari dentro un repository GitHub, con un commit, e li riprende dall'altra parte.

---

## Come si usa

### 1. Riempi il catalogo

Scheda **Catalogo** → *Nuova voce*. Una voce è un **tipo di modello**, non una miniatura singola:

| Campo | Esempio |
|---|---|
| Nome | `Black Orc` |
| Fazione | `Orc & Goblin Tribes` |
| Quantità posseduta | `12` |
| Quante ne hai dipinte | `8` |
| Basetta | `25×25 — fanteria` |

Poi tocca il riquadro della foto e carica un'immagine delle tue miniature dipinte. Ne restano **due copie**, e servono a cose diverse: una miniatura quadrata da 256 px (~15 KB) è quella che l'app disegna dappertutto — i tondi del tavolo, le facce delle liste, gli SVG esportati, la Nuvola — e l'**originale** è quello che riguardi quando vuoi vedere come è venuto il mantello. L'originale si carica solo quando lo apri, non sta mai in memoria con gli altri, e tocca la foto per aprirlo a piena pagina. Il tetto è 2048 px sul lato lungo, perché quattromila pixel dentro IndexedDB sono il modo silenzioso di far buttare via tutto al browser; sotto il tetto il file non si tocca. Chi non li vuole spegne *foto intere* nella barra del catalogo, e restano le miniature di prima.

Perché per tipo e non per singola miniatura: i tuoi 24 Orc Boyz sono un mob da 25 in una lista e due mob da 12 in un'altra. L'unico conteggio che regge sotto queste condizioni è *tipo + quantità*.

Il campo **dipinte** serve alla domanda che ci si fa davvero prima di un torneo, che non è "ce le ho?" ma "sono finite?". In cima al catalogo c'è la percentuale sull'intera collezione; nel matchup diventa *quante ne restano da dipingere per giocare proprio questa lista* — contando solo quelle che possiedi già, perché quelle che non hai sono un problema diverso e stanno nella riga dello scoperto.

### 2. Le liste: importate o scritte

Scheda **Liste** → *Importa da New Recruit*. Accetta i `.json` e i `.ros`.

In cima all'elenco ci sono i **filtri**, e rispondono alle tre domande che al circolo ci si fa davvero: *quali liste hanno i Clanrats?* (la ricerca guarda dentro le unità, non solo nel nome della lista), *quali sono di Ogre?*, *quali hanno vinto?*. L'ultima legge il diario delle partite: ogni lista porta il suo **palmarès** — giocate, vinte, perse, punti fatti e presi — agganciato per nome.

**Rinomina**, accanto al nome della lista aperta, cambia il nome con cui compare nell'elenco, sul tavolo e nelle partite che verranno. Siccome il palmarès si aggancia per nome, una lista che ha già giocato chiede cosa fare delle partite di prima: *restano sue* — hai corretto un refuso, o le hai dato un nome migliore, e la lista è la stessa — oppure *riparte da zero*, perché adesso è un'altra cosa. Nel primo caso la lista si porta dietro i nomi che ha avuto e la scheda lo scrive («prima si chiamava…»); nel diario delle partite non cambia niente in nessuno dei due casi. Una lista che non ha mai giocato non si porta dietro niente: due liste possono chiamarsi «Tutto», e quella rinominata non deve finire a pescare le partite dell'altra. *Duplica* fa una lista nuova, col palmarès vuoto.

*Lista esterna…* è per una lista che non è tua: quella dell'avversario ricopiata dal foglio, una trovata su un forum da provare in una partita finta, una vista a un torneo. Cambia una cosa sola e importante — **non si confronta con la collezione** — perché «mancano 18 modelli» su una lista che non devi comprare è la risposta a una domanda che nessuno ha fatto, e sporca l'unico numero per cui quella colonna esiste. La spunta si mette e si toglie anche dopo, sulla scheda della lista.

Oppure *Nuova lista a mano*, che non è un ripiego: al circolo l'avversario arriva con la lista **stampata**, o scritta a mano, o sul telefono in un formato che non è il tuo, e in quel momento un'app che sa leggere solo i file non serve a niente. Bastano nome, modelli, punti e basetta; profilo, regole e armi sono facoltativi dappertutto e senza di loro l'app disegna e conta lo stesso. Ogni riga di ogni lista — anche di una importata — si corregge lì sul posto, e *Duplica* fa la variante da ritoccare senza toccare l'originale.

Mentre scrivi il nome, il catalogo si propone da solo: bastano due o tre lettere e sotto il campo compaiono le voci che hai in collezione, con la foto, la fazione e quante ne possiedi. Sceglierne una scrive il nome per intero, porta con sé la basetta di quel tipo e lascia l'unità già agganciata — che è il modo più corto per non ritrovarsi dopo con metà lista *da agganciare* per via di un nome battuto storto. Vale anche sul nome di un'unità già in lista: correggerlo dalla tendina la riaggancia. Con le frecce si scorre, con Invio si sceglie, e se il nome che ti serve non è in collezione continui a scrivere e la tendina sparisce.

Lo stesso vale sul tavolo: *+ Unità a mano* sotto ciascun esercito mette un reggimento in campo senza passare da nessun file.

**Le cavalcature dei personaggi.** Sotto ogni personaggio c'è la tendina *Cavalcatura*: in cima quelle che il libro gli concede — la Screaming Bell per il Grey Seer, l'Ancient Stegadon per lo Skink Priest, lo Stegadon, il Terradon e il Ripperdactyl per lo Skink Chief, il cinghiale, il carro e la viverna per il Warboss — e sotto, in un gruppo che lo dice, le altre del suo esercito: l'app propone, non impedisce. Il libro è puntiglioso e l'app lo segue: lo Skink Priest cavalca l'*Ancient* Stegadon, lo Stegadon semplice è del Chief (Legends: Lizardmen, p. 5). Montare cambia tutto quello che il tavolo usa, e lo cambia come dice il Core Rulebook alle pp. 204-205, che distingue tre casi:

| Genere | Esempi | Cosa cambia |
|---|---|---|
| **cavalcatura** | cinghiale, lupo, Cold One, Terradon | tipo di truppa e Movimento della bestia; Resistenza e Ferite salgono solo se la sua riga lo dice («(+1)»); la pelle dura migliora l'armatura del cavaliere |
| **mostro** | Carnosauro, viverna | tipo di truppa della bestia, Resistenza e Ferite migliorate come scrive la riga, armatura la migliore delle due |
| **carro** | Screaming Bell, Plague Furnace, carro dei cinghiali, e gli Stegadon e l'Arachnarok con la regola *Howdah* | le Ferite del personaggio **si sommano** a quelle del carro, si ferisce sulla Resistenza più alta, armatura la migliore delle due |

Il Grey Seer sulla campana diventa così un carro pesante su una basetta 60×100, Movimento 2, Resistenza 6, otto Ferite (tre sue e cinque della campana), armatura 4+ e speciale 5+, con Terrore, Stubborn e l'urto della carica; i 185 punti della campana si sommano ai suoi. Le regole della cavalcatura valgono per tutto il modello — salvo quelle che il libro scrive «solo per la bestia», che restano sulla sua riga — e le sue armi sono sue: le corna dello Stegadon non finiscono in mano al prete. *A piedi* lo rimette com'era, punti compresi. I numeri stanno in `dati/cavalcature.json`, letti su Legends: Skaven, Legends: Lizardmen e Ravening Hordes con la pagina accanto; aggiungerne una vuol dire aggiungere una voce a quel file.

New Recruit un personaggio montato lo esporta **a metà**: le regole e le armi della bestia ci sono, i punti anche, ma la basetta e il tipo di truppa restano quelli del cavaliere — lo Skink Priest da 290 punti arrivava su una 25×25 come fanteria regolare. L'app lo riconosce dalla firma della cavalcatura (le corna, la regola *Howdah*, gli artigli del Carnosauro) e, all'importazione, lo monta da sola **senza sommare i punti un'altra volta**. Nelle liste importate prima, accanto al personaggio compare *sembra su Ancient Stegadon* con il pulsante *Applica*.

Ogni unità viene agganciata al catalogo da sola quando il nome combacia: `11 Black Orc Mob` trova `Black Orc` da sé, perché l'aggancio ignora il numero iniziale, le parole di servizio (`mob`, `unit`, `regiment`) e le desinenze plurali.

Quando non combacia, l'unità appare con la spunta gialla *da agganciare* e un menu con i candidati più probabili. **Lo scegli una volta**: la scelta viene salvata come alias sulla voce di catalogo e da lì in poi quel nome si aggancia da solo, in ogni lista futura. Se la voce non esiste ancora, `+ crea voce` la genera già compilata.

In fondo a ogni lista c'è la **scheda di preparazione**: le cinque cose che il file di New Recruit non dice mai e che servono dal primo turno. Chi è il generale e chi porta lo stendardo da battaglia; quali incantesimi sono usciti (si tirano prima dello schieramento e il file scrive solo il dominio); quale arma impugna chi ne ha due; cosa c'è scritto sugli oggetti magici. Si compila una volta, resta salvata con la lista e viaggia nel backup e nella Nuvola con tutto il resto. Il generale l'app lo propone da sé, dal Comando più alto fra i personaggi, e la domanda che non ha ancora risposta resta scritta con il motivo per cui viene fatta — un elenco di buchi non serve, uno che dice *perché* quel buco conta sì.

Nella stessa scheda compaiono le **regole d'esercito**. Stanno in `dati/eserciti/`, un file per esercito, fuori dal codice: aggiungerne uno vuol dire aggiungere un file e il suo nome nell'indice, mai toccare un modulo, ed è l'unica difesa contro il prossimo army book. Il pannello dice quante ne applica e — soprattutto — **quali no**, con il motivo: le Masse Brulicanti degli Skaven dipendono da chi hai vicino in questo momento e non si possono fissare in un file, il Valore Verminoso è una posizione di modello dentro l'unità. Sono cose che restano in mano tua, e vederle scritte vale più di un numero di copertura.

### 3. Matchup

Scheda **Matchup**: scegli le due liste e dichiara chi porta le miniature.

- **Solo l'esercito A (o B) è mio** — la verifica confronta quella lista con la collezione.
- **Entrambi dalla mia collezione** — le due liste vengono **sommate** prima del confronto. È il caso in cui giochi in casa con entrambi gli eserciti tuoi: se una voce compare in tutte e due, gli stessi modelli fisici non possono essere schierati due volte, e senza la somma il controllo direbbe di sì a torto.

Il verdetto elenca ogni voce con `richiesti/posseduti`, segna in rosso lo scoperto e in giallo quello che possiedi ma non hai ancora dipinto. Sopra, i due eserciti sono messi **a confronto**: punti, unità, modelli, unit strength, quante unità tirano, punti per unità — chi è in vantaggio su ogni riga è in grassetto.

*Copia cosa manca* mette negli appunti due elenchi in chiaro, **da procurare** e **da dipingere**, da incollare dove vuoi.

*Porta sul tavolo* carica le due liste negli eserciti A e B del simulatore.

### 4. Tavolo

Scenari Battle March e generici, zone di schieramento, terreno con i controlli (tesori a più di 3″ da ogni elemento, nessun pezzo oltre i 12″ sul lato lungo), rotazione, snap a ¼″, misurazione.

**La barra.** In vista restano solo i gesti che si fanno mentre giochi: scenario, annulla e ripeti, schiera e ritira, lo snap, lo zoom. Tutto il resto sta in tre menu raggruppati per intenzione — **Aiuti** (ancora di movimento, distanze, archi, raggi di tiro, fantasma, righelli), **Vista** (numeri e foto), **Tavolo** (misure, immagine, link). Il rischio di un menu è nascondere una levetta accesa e dimenticarsela: per questo il pulsante del menu si mette un **pallino** quando dentro c'è qualcosa di acceso.

**Annulla e ripeti.** `Ctrl+Z` e `Ctrl+Y`, o le due frecce nella barra. Vale per tutto: uno spostamento, una rotazione, un *Schiera tutto* premuto per sbaglio sopra dieci minuti di lavoro, una generazione di terreno, una perdita segnata di troppo. Il tooltip dice sempre cosa si sta per annullare.

**Zoom e scorrimento.** Rotella per ingrandire attorno al puntatore, `Shift`+trascinamento (o trascinare il vuoto) per spostarsi, pizzico a due dita su tablet, `+` `−` `0` da tastiera, *Adatta* per tornare al tavolo intero. Su 96″×48″ senza zoom una basetta da 25 mm è tre pixel.

**Magnetismo.** Con lo Snap acceso il pezzo trascinato non si aggancia solo alla griglia da ¼″. Ci sono due agganci e non si contendono lo stesso gesto:

- **In linea**, fra unità con lo **stesso orientamento**: il fianco contro il fianco, i fronti allineati, le seconde linee dritte dietro le prime.
- **Al contatto**, contro un'unità girata diversamente: trascini il caricante vicino alla faccia che ha scelto e ci si appoggia **a filo**, ruotando da sé per metterglisi parallelo. Scorre lungo la faccia finché vuoi, così il centraggio resta tuo.

L'app non decide se la carica è legale. Mette il pezzo dove hai già deciso di metterlo, e lo mette dritto.

**Maniglia di rotazione.** Sul pezzo selezionato compare un pallino davanti al fronte: trascinandolo si ruota (a scatti di 15° per le unità, 5° per il terreno; `Alt` per la rotazione libera). `[` e `]` — o `Shift`+rotella — cambiano il numero di modelli di fronte. Il pallino resta della **stessa misura sullo schermo** a qualsiasi ingrandimento, e la zona che risponde al dito è più larga del segno che si vede.

**Col dito.** Al circolo si gioca su un tablet, e un polpastrello è largo una decina di millimetri: a tavolo intero un reggimento è tre pixel. Sotto ai pezzi c'è un **cuscinetto invisibile** largo almeno quanto un dito. Sta sotto apposta: chi mira preciso prende sempre il pezzo vero, e il cuscinetto raccoglie solo quello che sarebbe finito nel vuoto.

**Menu del pezzo.** Tieni premuto un pezzo — o premi il tasto destro col mouse — e le cose che si fanno sempre arrivano dove sta il dito, senza scendere nell'ispettore: formazione, rotazione di 90°, ancora del movimento, etichetta, ritira. In partita ci sono anche il modello in meno e la ferita. Sul terreno e sui marcatori le voci cambiano di conseguenza. Dove si punta col dito e non col mouse tutti i pulsanti dell'app crescono da soli.

**Misura degli elementi scenici.** Il bosco di cartone non è mai quello del manuale. Sull'elemento selezionato compaiono tre maniglie quadrate: quella di destra allarga, quella in basso approfondisce, quella d'angolo muove tutti e due i lati insieme; un pezzo tondo ne ha una sola, che è il raggio. Le stesse misure si scrivono in pollici nell'ispettore. Il segnalino del tesoro no: la sua base da 40 mm è quella e resta quella.

**Misura del tavolo.** Oltre ai formati in elenco c'è *Su misura*: due caselle per larghezza e profondità, da 12″ a 144″. Il tavolo della cucina è largo com'è largo, e zone, righelli e controlli di bordo lo seguono.

**Linee di schieramento.** *Dalla mediana* è una casella in cui si scrive il numero, ma la linea si può anche prendere e portare: su ogni zona c'è una pillola con i pollici scritti sopra, e trascinandola le due zone si stringono o si allargano insieme. Con lo Snap acceso si ferma al quarto di pollice.

**Formazione.** Ogni unità ha il suo editor grafico: doppio clic sul pezzo, oppure *Editor della formazione* nell'ispettore. Dentro ci sono due mondi.

- **Ordine chiuso**: la griglia di sempre, con le sagome già pronte (linea, due ranghi, blocco, quadrato, colonna), la larghezza di fronte e la spaziatura fra le basi. L'ultimo rango incompleto si allinea a sinistra o si centra.
- **Formazione sciolta**: la griglia sparisce e ogni base si trascina dove vuoi. I preset (nuvola, schermo, scacchiera, mezzaluna, cuneo, fila) sono il punto di partenza; appena sposti qualcosa la formazione diventa *come l'hai messa* e nessun preset te la tocca più. Le frecce spostano di un millimetro alla volta, `Q` ed `E` ruotano la base selezionata, *Specchia* e *Ruota 90°* girano tutta la schermagliata.

L'ingombro di un'unità non è più una moltiplicazione: è il rettangolo che contiene davvero le basi come stanno. Una schermagliata larga occupa il fronte che occupa, e i controlli di legalità, il magnetismo, le distanze e i contatti lo sanno.

**Personaggi dentro le unità.** Dentro un reggimento ci va quello che al tavolo ci starebbe: i personaggi che il roster dichiara tali, e comunque **ogni unità da un modello solo** — il boss senza slot, il pezzo comprato a parte, la bestia da compagnia — che nell'elenco compare marcata *1 modello*. La spunta nell'ispettore ha l'ultima parola, con un'eccezione che viene dal manuale: carri pesanti, creature mostruose e colossi sono *Lumbering* e non si uniscono a nessuno né ospitano nessuno (p. 195) — il Bastiladon non entra nei Saurus, e un personaggio sulla Screaming Bell o sullo Stegadon nemmeno, perché prende la formazione della cavalcatura (p. 205). Sul cinghiale o sul lupo invece sì, e l'ispettore di un pezzo Lumbering lo scrive invece di mostrare tendine vuote. Si uniscono da tutte e due le parti: sulla scheda del reggimento la tendina *Unisci un personaggio o un modello singolo*, su quella del personaggio la tendina *Unisci questa a un reggimento*, e la stessa cosa dall'editor della formazione. Un pezzo che ne ospita già un altro non si infila da nessuna parte: prima si sgancia chi ha dentro. Quando una tendina resta vuota l'ispettore scrive chi ha lasciato fuori e perché, invece di sparire. Da quel momento non è più un pezzo suo: prende una casella dentro la formazione (trascina la base con la stella per cambiargliela), si muove col reggimento e nel report risulta dov'è il reggimento. *Sgancia* lo rimette sul tavolo di fianco.

**Di quanto mi sto muovendo.** È la domanda del turno, e prima l'app rispondeva male: i cerchi del movimento erano disegnati attorno all'unità, quindi la seguivano, e la risposta spariva proprio mentre la trascinavi.

Adesso c'è l'**ancora**. Il punto da cui l'unità è partita in questo turno resta segnato sul tavolo con la sagoma di dov'era, e i quattro cerchi — *movimento*, *marcia*, *carica media*, *carica massima* — stanno **fermi lì**, non addosso al pezzo. Mentre trascini, una riga fra il punto di partenza e adesso dice **quanti pollici hai fatto**, su quanti ne hai: `4.2″ di 8″ · restano 3.8″`. Il numero è verde dentro il movimento, ambra fin dove il pezzo può arrivare in qualche modo, rosso oltre tutto — un semaforo, non un arbitro: l'unità si muove lo stesso e nessuno ti ferma.

L'ancora si mette da sola al primo spostamento a partita cominciata, e si azzera a ogni *Chiudi il turno*: il turno nuovo riparte da dove sei arrivato. *Riparti da qui* nell'ispettore e il tasto ⚓ nel menu *Aiuti* la rimettono a mano, una o tutte. La levetta **Ancora di movimento**, nel menu *Aiuti*, la spegne.

Le soglie vengono dal manuale: marcia `M×2` (p. 123), carica `M` più il **maggiore di due D6** (p. 121), cioè `M+4,5` in media e `M+6` al massimo. Chi ha il passo lungo aggiunge un D6 al tiro e 3″ alla portata massima (p. 178). Il valore di **M** si legge dal profilo e si corregge a mano nell'ispettore quando il roster sbaglia, o quando una regola lo cambia: l'app non sa perché è cambiato, sa disegnare il cerchio giusto.

Fino a poco fa l'app tirava 2D6 e li **sommava**, che è la regola del Warhammer di prima: prometteva a una fanteria da 4 una carica massima di 16″ dove il manuale ne concede 10. La correzione è raccontata nel [piano regole](PIANO-REGOLE.md), §2. Corretta la carica, la marcia è diventata il movimento più lungo per quasi tutti, e le quattro soglie adesso si ordinano da sole invece di stare nell'ordine in cui sono scritte.

**Il fantasma.** La levetta *Fantasma* disegna sotto le unità dov'erano nell'ultima fotografia di fine turno. È l'unico modo di **vedere** una ruota sul posto, che il «mosso» netto per costruzione racconta come zero.

**Aiuti tattici.** *Distanze* misura dal **bordo** verso ogni nemico, come si misura davvero, e segna tratteggiate le linee che un bosco o un monolite interrompono. *Archi* disegna l'arco frontale e la portata di carica. *Raggi* mostra la gittata di tiro, e quella sì che segue l'unità: si misura da dove sei adesso.

*Minacce* è l'altra metà di *Archi*: *Archi* dice fin dove carichi tu, *Minacce* fin dove caricano loro. Con un'unità selezionata il tavolo si colora di rosso dove, se si fermasse lì girata com'è, almeno un nemico la potrebbe caricare al suo prossimo turno — più scuro, più probabile — e sotto l'unità c'è scritto quanto la caricano dove sta adesso e chi. Il conto è quello della dichiarazione (p. 119) fatto da ogni nemico: arco frontale di chi carica com'è girato adesso, vista, distanza bordo a bordo, il maggiore di due D6 e il minore attraverso il terreno difficile, il passo lungo; con più nemici, la probabilità che ne arrivi almeno uno. Non sa di Paura e Terrore né di chi si metterà in mezzo: dice cosa è possibile, non cosa farà l'avversario. È la domanda che decide la fase di movimento — fermarsi un pollice fuori dalla carica nemica e dentro la propria — e la fa anche l'arbitro sulle mosse che offre (`src/minacce.js`).

**Righelli e sagome.** *Misura*, due clic, e la misura **resta** sul tavolo; se ne tengono fino a otto. Il tasto `⌫` accanto le toglie tutte.

*+ Sagoma* aggiunge l'altra metà di quello che c'è fisicamente su un tavolo: un cerchio, o un rettangolo, da appoggiare **sopra** i modelli. Il raggio lo scegli tu, la sagoma resta dove la metti e si trascina come tutto il resto. Selezionandola, l'ispettore dice **quanti modelli ci stanno sotto**, unità per unità. Cosa significhi poi lo sanno i giocatori: l'app conta e basta.

**Marcatori.** *+ Marcatore* mette sul tavolo un pezzo che non è né unità né terreno, con **testo libero** e un colore. È il jolly, ed è fatto apposta per coprire quello che non abbiamo previsto: obiettivi che non siano il tesoro Battle March, segnalini magici, l'area di un incantesimo che resta in gioco, il punto da cui arrivano i rinforzi, il quarto di tavolo conteso, «qui è caduto il portastendardo». L'etichetta la leggi tu; l'app non la interpreta mai, la disegna, la salva, la mette nel link e la scrive nel report.

**Zone disegnate a mano.** Gli scenari conoscono cinque disposizioni, e per la sesta non c'era niente da fare. *Disegna una zona*, poi trascini il rettangolo sul tavolo e dici di chi è: dell'Esercito A, di B, di tutti e due, area vietata, o solo un promemoria. Quando ce n'è almeno una, **sostituiscono** quelle calcolate dallo scenario, e i controlli di legalità (dentro o fuori zona) guardano le tue. *Salva come scenario* se le porta dietro, insieme al terreno e ai marcatori: da lì in poi qualsiasi scenario — di un libro, di un torneo, inventato al circolo — è rappresentabile senza che l'app ne sappia niente.

**Movimento.** Le statistiche che arrivano dalle liste New Recruit non servono solo a riempire l'ispettore. *Movimento* disegna quattro ventagli — passo, marcia, carica media, carica massima — e li disegna **dove il passo porta davvero**: un cerchio dice che hai 4″, un ventaglio dice che quei 4″ nel bosco diventano 3 e contro la piramide diventano zero. Il terreno difficile **toglie un pollice al Movimento** (p. 269) — non costa il doppio, che era la regola dell'ottava edizione e non di questa, e vale anche solo a sfiorare il bosco con uno spigolo; la marcia ne perde due, perché il meno uno è su M. L'impassabile ferma, il bordo del tavolo ferma, e chi vola passa sopra a tutto. Il passo lungo (*Swiftstride*, cavalleria veloce) aggiunge un D6 intero al tiro di carica — e a quello di fuga e di inseguimento — e 3″ alla portata massima: da M+6 a M+9, cioè la differenza fra arrivare e non arrivare.

**Tiro.** *Tiro* prende l'arma più lunga del profilo e disegna il **campo di fuoco con le ombre**: un raggio ogni pochi gradi, e dove incontra un bosco o un monolite il raggio finisce lì. Quello che resta chiaro è il cono che si copre davvero; le rientranze sono i posti in cui il nemico si mette per non farsi vedere. La fascia interna è la gittata corta, oltre la metà si tira con il −1. Su ogni nemico compare il **punteggio per colpire** e quanti modelli cadrebbero in media, e chi non si può bersagliare dice perché: *non lo vedo*, *fuori arco*, *fuori gittata*. L'ispettore ripete le stesse righe scrivendo i modificatori uno per uno — lunga gittata, copertura leggera o pesante, bersaglio in formazione sciolta — così si vede *perché* serve un 5.

**Il tiro, giocato.** Sotto ogni riga del tiro c'è quello che prima si contava a occhio: quanti modelli tirano davvero su quel nemico, e perché gli altri no — *in coda* oltre la seconda fila, *fuori gittata*, *non lo vedono*. Ogni modello misura la sua distanza e guarda la sua linea di vista, quindi un reggimento obliquo dietro una collina tira con la metà che vede. I modificatori non si spuntano: il −1 del movimento lo dice l'ancora, la lunga gittata e la copertura le dice la maggioranza di chi tira, *Move & Shoot* lo toglie da sé. Chi ha caricato, marciato, è a contatto o sta fuggendo non tira (p. 137), e il pannello lo scrive in arancio prima di lasciarti tirare lo stesso. L'arco in fondo alla riga gioca la fase per intero: dichiara il bersaglio, fa cadere la raffica nel vassoio, toglie i modelli e, se il bersaglio ha perso più di un quarto della sua Forza d'Unità, chiede il test di Panico (p. 141). Ogni passo si annulla da solo.

**Macchine da guerra.** Un'unità di tipo *macchina da guerra* ha le tre sagome del manuale: cerchio da 3″, da 5″ e goccia (p. 95). La sagoma si posa sul nemico più vicino e si disegna sopra i modelli, con un pallino pieno su chi è sotto del tutto e uno vuoto su chi è sotto in parte. *Bombarda* tira la deviazione con il dado di artiglieria, sposta la sagoma, chiede il 4+ di chi è sotto in parte e toglie i modelli unità per unità. Il Mancato Colpo tira il D6 della tabella e dice la faccia e la pagina: le due tabelle di p. 347 non sono ancora trascritte, e l'app non inventa l'esito.

**La carica, giocata.** Sotto il tiro, nell'ispettore, c'è la riga della carica: per ogni nemico quanto è lontano, cosa serve tirare e **quante volte su cento arriva** — la probabilità è contata sulle facce dei dadi, non stimata. Chi non si può caricare dice perché: *non è nell'arco frontale*, *la vista è tagliata dal bosco*, *sono quattordici pollici e la carica arriva al massimo a dieci*. Accanto c'è la bandierina, e la bandierina gioca la carica per intero, nell'ordine del manuale: si dichiara, il bersaglio sceglie la reazione — tenere, tirare e tenere, fuggire, con il *tira e tieni* spento quando il caricante è già più vicino del proprio Movimento — si tira dal vassoio con i dadi che quella carica vuole (due di cui si tiene il maggiore, il peggiore dei due nel terreno difficile, più un D6 col passo lungo), e chi arriva **si mette a filo da solo** sulla faccia da cui è venuto. Se la carica resta corta, l'unità avanza di quello che i dadi hanno detto e si scosta da sola per non finire entro un pollice da un nemico. Ogni passo è una riga di registro e ogni passo si annulla da solo.

**Le quattro mosse all'indietro.** Quando c'è un nemico vicino compaiono quattro pulsanti: *cede 2″*, *ripiega*, *fugge*, *insegue*. Sono la stessa geometria vista quattro volte — lontano dal nemico con la Forza d'Unità più alta, in diagonale quando i più grossi sono due — e l'app la misura invece di farla stimare a occhio. Il cedimento non chiede nemmeno i dadi: sono due pollici fissi. Chi fugge gira le spalle, chi cede terreno e chi ripiega restano girati verso il nemico.

**La psicologia, giocata.** Paura, Terrore, Panico, Stupidità, Frenzy e Impetuosità si tirano nel momento in cui capitano, che è sempre nel mezzo di un'altra cosa. La bandierina della carica, prima della reazione, fa tirare la **Paura** a chi carica un nemico più grosso che la fa — chi fallisce resta fermo, ed è una carica fallita — e il **Terrore** al bersaglio di chi lo fa: chi fallisce fugge. Le reazioni si spengono da sole con il perché accanto: *Immune to Psychology* e la *Frenzy* non fuggono, chi è in preda alla Stupidità tiene. Il test di rotta di chi perde contro chi fa Terrore ha −1, e quello di una *Warband* ha il bonus di ranghi sommato al Comando, fino a 10. Il **Panico** ha le sue quattro cause (pp. 160-161): più di un quarto perso in una fase che non sia il combattimento, un'unità amica con Forza d'Unità 5 o più distrutta entro 6″ — anche uscita dal tavolo fuggendo —, una che perde un combattimento e rompe **o ripiega in ordine** entro 6″, un'unità amica in fuga che ti passa attraverso. L'app misura chi è a 6″, dice chi non tira e perché (*Ignore Panic*, *Ignore Goblin Panic*, sta già fuggendo, è in combattimento), tira per gli altri e, se il test va male, propone quello che dice il libro: con più della metà dei modelli d'inizio battaglia si **ripiega in ordine**, con la metà o meno si fugge, lontano dal nemico più vicino e non dall'amico che è caduto. *Cold Blooded* fa rotolare tre dadi e scarta il maggiore; chi passa da solo non fa rotolare niente. Nell'ispettore c'è il blocco **Psicologia**: le regole dell'unità dette in una riga, lo stato in cui si trova — in preda alla Stupidità fino al suo prossimo turno, senza più Frenzy, con la Paura già tirata — e i pulsanti dei test. All'inizio del turno il registro ricorda chi deve tirare la Stupidità, alla dichiarazione delle cariche chi deve caricare.

**Le regole d'esercito.** Orchi e Goblin, Skaven e Uomini Lucertola hanno ognuno un file in `dati/eserciti/`, e l'app ci trova le regole delle unità dal nome con cui New Recruit le scrive. Quelle che il conto sa fare entrano nei dadi con il loro nome accanto: la *Choppa* in carica ritira gli 1 per ferire e perfora di uno in più, le *Warpstone Weapons* perforano con l'arma a una mano e con l'alabarda no, l'*Arcane Shield* dello Slann dà la salvezza speciale 5+ che il file non dichiara, la *Horde* dei Night Goblin prende il quarto rango, chi carica di fianco un *Impervious Defence* non ne ha il punto, lo *Shieldwall* cede terreno invece di ripiegare una volta per partita, e chi ha la *Scurry Away* fugge con un pollice in più. Nell'ispettore c'è il blocco **Regole d'esercito**: una riga per regola, con *a mano* e il perché accanto a quelle che l'app conosce ma non gioca — gli attacchi del Gigante, i Fanatici, il Comando di Ogdruz prestato ai Troll. Il **Waaagh!** ha il suo pulsante: test di Comando del personaggio dal vassoio, e se passa lui e l'unità di Orchi a cui è unito ritirano gli 1 per colpire e hanno +1 al risultato fino al loro prossimo inizio turno. Il tentativo vale per la partita, e dopo il pulsante resta spento.

**La magia.** Un'unità che ha un mago dentro ha il blocco **Magia** nell'ispettore. Il file di New Recruit non dice né il Livello né il dominio scelto: si scelgono lì, una volta. Poi *Genera gli incantesimi* tira tanti D6 quanti il Livello nel vassoio e fa ritirare i doppioni (p. 106); uno degli incantesimi usciti si può scambiare con la firma del dominio, o con un incantesimo del dominio d'esercito quando il mago ha *Lore of Gork*, *Lore of Mork*, *Lore of the Horned Rat* o *Lore Of Lustria*. In partita ogni incantesimo ha il suo *Lancia*: si sceglie il bersaglio fra quelli che l'app ha misurato — distanza, arco, vista, e chi non va bene porta il perché —, si tirano 2D6 più il Livello contro il valore di lancio, il doppio 6 è un'invocazione perfetta e il doppio 1 apre la tabella del fiasco. L'avversario sceglie se dissolvere, con un mago in gittata (18″, o 24″ dal Livello 3) o affidandosi alla sorte una volta per turno, e se il suo doppio 1 lo fa surclassare la tabella tocca a lui. Quello che resta in piedi si applica da solo quando l'app sa farlo — i colpi di un dardo magico passano dalla stessa catena dello scontro, le maledizioni e i potenziamenti diventano effetti a tempo che i dadi sentono davvero — e quando non sa, il registro scrive cosa fare a mano: le sagome, i vortici, i trasporti. Gli incantesimi che restano in gioco hanno *Termina*, e dal turno dopo l'avversario li può *Dissolvere* contro il valore di lancio. I domini stanno in `dati/magia/domini.json`, letti sul Core Rulebook (pp. 319-335) e sugli army book.

La magia ha una **gittata**, e sul tavolo si vede: un Bastiladon con il Solar Engine arriva a ventiquattro pollici mentre il suo giavellotto ne fa otto, e finché il cerchio disegnava solo le armi mostrava il numero sbagliato proprio a chi stava decidendo dove mettere il pezzo. Adesso c'è un cerchio per la magia accanto a quello del tiro, una riga nell'ispettore e una colonna nel battle report. Gli **incantesimi vincolati** — quelli che un oggetto porta con sé — si riconoscono dalle regole dell'unità, e quando il file non le scrive (New Recruit esporta le regole dell'unità base, e l'oggetto spesso non ci finisce) si dichiarano a mano da un menu.

**Scontro simulato.** Accanto a ogni nemico vicino, nell'ispettore, c'è una spada. Apre un pannello con le due schiere a confronto: profili, quanti modelli si toccano, armatura e salvezza speciale, stendardo e stendardo da battaglia, terreno più alto, sfida. Chi ha caricato e da che faccia è arrivato non si spuntano più a mano: li scrive la carica quando va a segno, e con loro i pollici percorsi.

- *Tira i dadi* fa **un assalto** e mostra **ogni faccia uscita**: per colpire, per ferire, per salvare. Si mena in ordine di Iniziativa, e dentro l'Iniziativa c'è il **bonus della carica**: un punto per ogni pollice intero percorso, fino a +3 arrivando di fronte e +4 di fianco o di retro. È la riga che ribalta l'ordine in mezza partita, perché una cavalleria che ha corso sette pollici mena prima di chiunque. L'urto della carica arriva prima di tutto e vuole i suoi tre pollici di corsa; i pestoni arrivano per ultimi, dopo ogni altro attacco. Poi il conto di fine assalto — ferite, ranghi, stendardo, stendardo da battaglia, fianco, retro, terreno più alto, overkill nelle sfide — e il test di rotta.
- **Il combattimento a più di due** (p. 153). Tre unità che convergono su un reggimento sono il normale di Warhammer, e il motore dell'assalto sapeva rappresentare solo due schiere: adesso entrano due **gruppi**, si mena in un ordine di Iniziativa solo — tutti insieme, non a coppie — e chi ha due nemici davanti divide la sua prima fila fra i due invece di menare due volte con tutta. Il conto di fine assalto è quello della pagina dei combattimenti multipli, dove quattro voci hanno una regola loro: i **ranghi non si sommano** (vale il bonus più alto), gli **stendardi** valgono uno per parte per quanti ne siano, il **fianco** si conta una volta per unità nemica — due unità sullo stesso fianco fanno un punto, una sul fianco e una sul retro ne fanno tre — e il **terreno più alto** lo prende una parte sola, e si annulla se sono in alto tutte e due. L'ordine di combattimento invece si conta per ognuna, come dice il manuale. Il test di rotta lo tira **ogni unità** della parte che perde, con lo stesso scarto, e la Forza d'Unità che decide se il doppio schiaccia è quella delle parti sommate (p. 154). **Nel pannello si aggiunge un'unità per parte con una tendina**, e chi tocca davvero il nemico sul tavolo viene proposto per primo: chi tocca chi lo dice il tavolo, e sotto il risultato si legge chi ha portato cosa.
- **I personaggi uniti menano, e hanno ferite loro** (pp. 207, 209). Un capo dentro un reggimento non è un modello in più: è un profilo diverso nella stessa scatola, e per molto tempo i suoi colpi sparivano — entrava nella psicologia e nello stendardo, e basta. Adesso entra nel pannello con il suo reggimento, con un riquadro suo, e mena quando tocca a lui con i suoi Attacchi, la sua Forza e la sua Iniziativa. In prima fila **occupa un posto** dei soldati invece di aggiungerne uno. Non lo si colpisce se non dirigendogli i colpi apposta, e c'è la casella per farlo; l'urto della carica e i pestoni gli arrivano addosso solo se nel reggimento restano meno di cinque modelli di truppa. Le ferite non tracimano né in un verso né nell'altro: il capo ha le sue, il reggimento le sue.
- **La cavalcatura mena anche lei** (p. 204). Un personaggio montato è un modello solo con un profilo diviso: lui mena con i suoi Attacchi e la sua arma, e accanto a lui ogni riga della cavalcatura mena con i suoi — il Rat Ogre della campana tre attacchi di Forza 5, lo Stegadon con le corna e i suoi cinque Skink, i due cinghiali e i due Orchi del carro — ognuna al suo passo d'Iniziativa. L'urto della carica e i pestoni usano la **Forza della bestia**, non quella del cavaliere. Chi colpisce il modello tira sull'Abilità del personaggio, e le ferite vanno sul modello intero, che le ha già sommate o migliorate come dice il genere della cavalcatura: le righe della bestia non si colpiscono, non tirano il test di rotta e non hanno Forza d'Unità loro. L'ispettore mostra tutte le righe del libro sotto quella del modello, con la frase che dice come si sommano. Il Movimento è quello della bestia e l'ispettore dice da dove viene; quello del Giant Cave Squig si tira. Quello che il file della cavalcatura scrive e l'app non gioca — la campana che suona, il soffio della Plague Furnace, gli artigli del Carnosauro che fanno Ferite Multiple solo ai mostri — sta scritto nell'ispettore e nelle regole d'esercito, *a mano*.
- **Le ferite restano appese.** Tre ferite passate a un mostro da quattro non sono zero perdite: sono tre ferite che aspettano la quarta. Valgono fra un assalto e l'altro, fra il tiro e la mischia, e le scrive sull'unità chi porta l'esito sul tavolo. Prima evaporavano a ogni tiro e a ogni round — su un bersaglio da più ferite spariva l'intera raffica.
- **Il raduno** (p. 117) è una regola e non più un test di Comando generico: sotto metà dei modelli di partenza −1, sotto un quarto passa solo il doppio uno, e il musico suona il raduno per +1 fino a 10 (p. 201). Nell'ispettore, per chi sta fuggendo, c'è il pulsante e la riga che dice con che Comando si prova.
- **L'overkill si ferma a cinque** (p. 152). Il tetto stava nel manuale e la costante lo aspettava dichiarando di non averlo letto: un eroe che fa nove ferite a chi ne aveva una porta cinque punti, non otto.
- **Il test di rotta ha tre esiti, non due** (p. 154). Si guardano due numeri: il tiro naturale e lo stesso tiro con lo scarto del combattimento addosso. Passano tutti e due e l'unità *cede terreno* di due pollici; passa solo il naturale e *ripiega in ordine*; non passa nemmeno quello ed è *rotta*. Perdere di otto invece che di due non fa scappare di più — la rotta dipende dal tiro naturale — fa ripiegare invece di cedere terreno. Accanto all'esito ci sono le tre probabilità esatte, che sono anche il numero con cui si decide se giocarsi lo *Stubborn*.
- *Porta l'esito sul tavolo* fa i quattro gesti nell'ordine del manuale: segna le perdite, scrive il risultato e il test nel registro con turno e casella, **sposta chi ha perso** di quanto dice l'esito, e poi chiede il tiro d'inseguimento — o di sfondamento, se davanti non è rimasto nessuno. Chi insegue almeno quanto l'altro ha fuggito lo travolge. Ogni passo è un'azione del motore: si annulla da solo.
- *Simula 500 assalti* rifà lo stesso conto cinquecento volte e riporta le percentuali. È la risposta alla domanda vera, che non è «com'è andata» ma «conviene?»: un assalto solo non dice niente, cinquecento dicono se caricare è una buona idea.
- *Segna le perdite sul tavolo* riporta i modelli caduti sulle due unità, e con la partita aperta i reggimenti **si accorciano da soli**. Vale l'annulla anche per questo.

I dadi si vedono tutti apposta. Un simulatore che scrive «4 ferite» chiede di essere creduto sulla parola; uno che mostra le facce lo si ricontrolla a occhio, e quando dice una cosa strana si capisce subito se è stata sfortuna o un numero sbagliato nel profilo.

**Il vassoio dei dadi.** *Dadi*, nella barra del tavolo — e *Tira i dadi* nel pannello Partita — apre un vassoio in cui i cubi **rotolano davvero**: sei facce, prospettiva, e la faccia uscita che si ferma verso di te. Ci sono i quattro dadi che il manuale nomina:

| Dado | Facce | A cosa serve |
|---|---|---|
| **D6** | 1-6, a pallini | tutto il resto. Con un punteggio da fare (`4+`) i dadi passati si accendono e in fondo c'è il conto |
| **D3** | 1, 2, 3 | il D6 dimezzato per eccesso del manuale, mostrato già letto |
| **Artiglieria** | 2, 4, 6, 8, 10, Mancato Colpo | macchine da guerra: il Mancato Colpo esce in rosso e ti manda alla tabella dell'arma |
| **Deviazione** | quattro frecce e due Colpito! | direzione. Insieme si tira la distanza — D6, 2D6, D3 o artiglieria — e la riga finale dice **quanti pollici e verso dove**, in gradi |

Due cose non sono dettagli. La prima: **il risultato esce prima dell'animazione**, dal generatore crittografico del browser (`crypto.getRandomValues`, senza lo sbilanciamento del resto della divisione), e i cubi si girano per farlo vedere. Un dado fisico simulato che si ferma dove capita sarebbe un generatore scritto per sbaglio, con una distribuzione che nessuno ha mai controllato. La seconda: **finché i dadi girano il risultato non è scritto**. Compare quando si fermano — altrimenti girerebbero per niente.

**Le tabelle del manuale.** *▦ Tabelle*, accanto ai dadi, apre le tre tabelle che si guardano a ogni fase, lette sul Core Rulebook: **colpire in mischia** (Abilità Combattimento contro Abilità Combattimento, p. 148), **colpire al tiro** (Abilità Balistica con i cinque modificatori, il ritiro dell'AB 6 e oltre e il 7+, pp. 138-139) e **ferire** (Forza contro Resistenza, p. 149). Si scelgono i due valori e la cella giusta si accende, oppure si tocca la cella; sotto ogni tabella ci sono le righe che al tavolo si dimenticano — l'1 naturale, il 6 naturale in mischia, l'AC 0, il tira e tieni che non somma la lunga gittata. Nel pannello dello scontro e nel tiro dell'ispettore **i punteggi si toccano**: il «3+» apre la sua tabella con i valori di quel bersaglio già scelti. Serve a chi tira i dadi veri e vuole sapere a quanto, e a chi vuole sapere da dove viene il numero del simulatore: le celle non sono ricopiate, le chiede alle stesse funzioni che tirano i dadi dell'app.

La rotolata si spegne con la spunta *rotola*: al terzo turno si tira dieci volte al minuto e un secondo per tirata sono dieci secondi di attesa. Spenta, i dadi compaiono già fermi sulla faccia giusta, e i numeri sono gli stessi. Chi ha chiesto al sistema operativo meno animazioni la trova spenta senza doverlo dire.

Anche *Tira i dadi* dello scontro simulato passa di qui: i dadi dell'assalto — colpire, ferire, armatura, salvezza, il test di rotta — rotolano riga per riga **prima** che il pannello scriva il conto. Sono gli stessi dadi del conto: nessuno viene ritirato.

**Armatura e salvezza speciale.** Sono le due cose che i file delle liste non contengono, perché in Old World vengono dall'equipaggiamento e dagli oggetti, non dal profilo. Si scelgono una volta nell'ispettore e valgono per il tiro e per lo scontro; senza, le stime sovrastimano le perdite di parecchio. Quando l'export le dichiara — valore d'armatura o punteggio già pronto — il parser le legge da sé.


**Terreno casuale.** Genera una mappa **a specchio** — quello che mette in una metà lo ripete ruotato di mezzo giro nell'altra — rispettando da sola i vincoli che l'app già controlla. *Salva come scenario* mette tavolo, zone e terreno fra i **Miei scenari**, accanto a quelli del manuale.

**Immagine e link.** *Immagine* scarica il tavolo intero come PNG da mandare nel gruppo o stampare. *Link* copia un indirizzo che **contiene** lo schieramento: sta nel frammento dopo il `#`, quindi non arriva a nessun server, e un tavolo con ventiquattro unità occupa meno di un kilobyte. Le foto non ci viaggiano dentro: chi apre il link vede le sue.

Ogni unità nella lista laterale mostra una foto e il moltiplicatore; l'**unità selezionata** apre la striscia intera, un'anteprima per modello.

*Salva schieramento* dalla scheda Matchup archivia la disposizione corrente; la ritrovi in fondo alla stessa scheda.

### 5. Partita

*Comincia la partita*, nel pannello di sinistra. Non arbitra niente e non conosce le regole: tiene il conto di quello che al tavolo si dimentica sempre.

- **Turno, fase e casella** — le quattro fasi del manuale hanno quattro sotto-fasi ciascuna, sedici caselle in tutto, e quasi tutte le regole sono attaccate a una casella. Sotto i quattro pulsanti delle fasi c'è la striscia delle quattro caselle di quella fase, e sotto ancora la riga che dice cosa ci si aspetta qui e a che pagina sta. Le frecce ‹ › camminano di casella in casella — sedici passi fanno un turno — mentre i quattro pulsanti saltano all'inizio della fase, che è il gesto di chi gioca in fretta. Serve alle cose che al tavolo si sbagliano sempre: l'incantesimo lanciato nella fase sbagliata, il tiro dopo aver marciato, il raduno dei fuggitivi che si dimentica ogni partita perché capita all'inizio del turno e la testa è già sulle cariche.
- **Quello che questa casella si aspetta** — sotto la riga ci sono le azioni della casella: *dichiarazione di carica*, *reazione alla carica*, *test di rotta*, *raduno*. Si premono invece di scriverle. Se servono dei dadi si apre il vassoio già impostato — due D6 per la carica, di cui si tiene il maggiore, e un terzo cubo da sommare per chi ha il passo lungo — e quello che rotola torna dentro da solo: la riga di registro dice chi, cosa, contro chi, con quali facce e in quale casella. Dove serve un bersaglio c'è la tendina delle unità in campo, il nemico per primo. **Un'azione fuori casella passa lo stesso**, con la nota di dove starebbe di casa: l'app propone, non impedisce.
- **Perdite** — in tre posti: l'ispettore dell'unità, la lista *Perdite* del pannello (tutte le unità in fila, meno due clic per segnare un tiro di archi) e l'editor della formazione, dove si clicca **quale** modello è caduto. Tolti i modelli il reggimento **perde i ranghi di dietro e sul tavolo si accorcia da solo**, come le miniature vere; in formazione sciolta sparisce la base che hai segnato e l'ingombro si richiude su quelle rimaste. Arrivato a zero esce dal campo.
- **Ferite** — il modello tolto non è l'unica valuta, e per un personaggio, un mostro o un carro è quella sbagliata: sono modelli singoli che incassano colpi senza sparire dal tavolo, e per tre quarti della partita quello che si perde sono **ferite**. Il tasto ♥ ne segna una senza togliere niente; il numero si vede sull'unità sul tavolo, accanto al nome nella lista Perdite, e finisce nel report turno per turno. Quando una ferita diventa davvero un modello in meno lo dici tu, con un tasto: l'app non lo deduce, perché per dedurlo dovrebbe conoscere delle regole.
- **Quanto costa muoversi** — un reggimento non va in diagonale. Va dritto davanti a sé, e per puntare da un'altra parte deve **ruotare**: la ruota si paga in pollici, dallo stesso Movimento con cui poi cammina (p. 124), ed è la ragione per cui al tavolo le colonne ruotano e le linee no. L'ispettore non dice più la linea d'aria fra l'ancora e adesso: dice quello che il Movimento ha **speso**, e da cosa è fatto — «8,4″ di 8″ (6,1″ di corsa più 2,3″ di ruota)». Il tavolo disegna il gomito vero, punta-e-poi-cammina, invece della diagonale che non esiste. Sotto ci sono gli altri modi di arrivare nello stesso punto con il loro prezzo — all'indietro e di lato si va a metà velocità (p. 125), un giro di 90° costa un quarto del Movimento e uno di 180° la metà (p. 124) — perché «ti conviene girare invece di ruotare» è metà di quello che si impara giocando. E la **marcia** si riconosce sul costo: un reggimento largo che gira di novanta gradi e poi fa quattro pollici ha marciato, e il pannello del tiro lo sa.
- **Stupidità** — nella prima casella del turno, un pulsante la tira per tutti quelli che devono, con i dadi di sempre. Chi fallisce si prende il marcatore **STUPIDA** sopra il pezzo — si vede dal tavolo, senza selezionare niente — e fino al suo prossimo turno non si muove, non tira, non lancia incantesimi e non tenta il dissolvimento. Il marcatore si mette e si toglie anche a mano, perché la Stupidità capita anche fuori dall'app: tirata con i dadi veri, o causata da un incantesimo.
- **Etichette** — parole libere appiccicate a un'unità: *disordinata*, *ha caricato*, *sotto incantesimo*, quello che ti serve. Gli stati che l'app conosce sono tre e sono cablati; quelli che al tavolo ci si dimentica sono altri e cambiano da un'edizione all'altra, quindi qui sono testo. Compaiono sotto l'unità sul tavolo, e il dizionario dei suggerimenti cresce da solo con quello che scrivi: non c'è nessun elenco da mantenere.
- **Contatori** — un nome e un numero, per esercito nel pannello e per unità nell'ispettore. Le risorse della magia, le munizioni contate, i punti comando, le cariche di un oggetto: roba che al tavolo si tiene con i dadi girati e si sbaglia. L'app non sa cosa conta: sa contare.
- **Dadi** — *Tira i dadi* apre il vassoio senza uscire dalla partita, e quello che esce **finisce nel registro** con turno e casella, come un'annotazione scritta a mano. Quando è un'azione a chiedere i dadi il vassoio si apre già impostato, con il motivo scritto nel titolo: il motore non tira mai da sé, chiede. A fine partita il report racconta anche cosa è stato tirato.
- **Lo schermino** — sopra il tabellino c'è il tavolo in piccolo: quello di adesso, e con le due frecce quello di ogni fine turno già registrato. Serve a vedere quello che si sta raccontando invece di leggerlo in una tabella di coordinate.
- **Tabellino** — quanti punti restano in campo e quanti ne sono andati, per parte, calcolati in proporzione ai modelli persi.
- **Registro** — ogni azione, ogni perdita e ogni annotazione, con turno, esercito e **la casella in cui è successa**. Se lo scrive il motore: chi preme *dichiarazione di carica* non scrive niente, e la riga c'è lo stesso con i dadi che sono usciti. *Annulla* porta via la riga insieme all'azione. *Annota* resta per tutto il resto, e apre una finestra con le **scorciatoie** già pronte — carica riuscita, carica fallita, in rotta, rally, incantesimo fermato, generale, stendardo — perché durante una partita vera nessuno scrive frasi su una tastiera virtuale, e un registro vuoto vale un report vuoto. Chi vuole scrivere a mano scrive lo stesso.
- **Chiudi il turno** — il pulsante grosso. Fotografa il tavolo com'è in quel momento e passa la mano. La fotografia tiene, per ogni unità, dove sta, quanto è grande adesso, come è schierata, di quanto si è mossa dal turno prima, quante perdite ha subito in questo turno, in che stato è e dentro quale elemento di terreno si trova. Tiene anche i **contatti di basetta** del momento — chi tocca chi e da che lato — e la **posizione del terreno**, che durante la partita si sposta. È da queste fotografie che nasce il battle report.

*Comincia* non porta al turno 1: porta allo **schieramento**. I pezzi si mettono e si rimettono finché non va bene, e niente di quello che fai sul tavolo è movimento — né ancora, né cerchi, né pollici percorsi; lo stesso vale fuori dalla partita, quando il tavolo è il simulatore di schieramento. *Schieramento finito · comincia il turno 1* scatta la fotografia numero zero e mette le ancore dove stanno i pezzi. Finché non hai chiuso il primo turno puoi *Tornare allo schieramento*, che serve quando ci si accorge di aver cominciato troppo presto.

Anche qui vale l'annulla: una perdita segnata sull'unità sbagliata — o un turno chiuso per sbaglio — si toglie con `Ctrl+Z`.

### 5 bis. Sfida: tu contro l'AI

Nella scheda **Matchup**, con le due liste scelte, *Gioca contro l'AI* chiede con quale esercito giochi e su quale scenario, e *Sfida l'AI sul tavolo* porta la partita sul tavolo con il pannello **Sfida** aperto. È la via di mezzo fra le due modalità che c'erano: la partita la tiene **l'arbitro** (`src/arbitro.js`, quello di *Una partita giocata dall'app*), il tavolo la mostra pezzo per pezzo, e le mosse del tuo esercito **le scegli tu**; quelle dell'altro le sceglie Gemini.

- **Le mosse sono pulsanti**, gli stessi che vede il modello: *Carica · Saurus Warriors → Night Goblin Mobs*, e sotto il perché — quanti pollici, che tiro serve, che probabilità ha, a che pagina sta. Passando sopra un pulsante il pezzo si accende sul tavolo. I pezzi non si trascinano: li muove l'arbitro, e un pezzo spostato a mano sarebbe un tavolo diverso da quello su cui si gioca.
- **Le caselle senza scelte si passano da sole**, se lo lasci spuntato: sono una dozzina di clic a turno che non decidono niente.
- **Il perché sul tavolo.** Ogni volta che un dado, una regola speciale, il terreno o un incantesimo cambiano un risultato, sopra il tavolo compare una scheda: i dadi usciti (quello scartato spento), quello che ci si somma, il numero da battere, e una riga per ogni cosa che li ha spostati, con il pallino del suo colore — il generale vicino, il bosco, il Terrore, lo Swiftstride. *Perché i Clanrats ripiegano?* 3 + 3 = 6, +3 di scarto = 9 contro il Comando 7 del Grey Seer a 5″: i soli dadi stanno nel Comando, con lo scarto no — ripiegano in ordine; un 8 ai dadi sarebbe stato rotta. *Perché l'Abominio fa undici pollici?* Movimento 3D6, 4 + 5 + 2. Passandoci sopra la scheda accende il pezzo di cui parla, un clic la tiene ferma. Vale per le mosse dell'AI e per le tue: l'arbitro tira per tutti e due. **L'AI aspetta qualche secondo** dopo ogni mossa con dei dadi, il tempo di leggere; tutte e due le cose si spengono nelle impostazioni del pannello.
- **L'ultima mossa dell'AI** resta in vista con il suo perché, e sotto scorre il registro con dadi e pagine: le righe con una scheda si aprono con *perché?*. *Copia il registro* lo porta via; *Abbandona* chiude la sfida e lascia il tavolo com'è.
- **Chi gioca contro di te**: Gemini, con una chiave di Google AI Studio scritta nel pannello (e il modello, se non vuoi `gemini-2.5-flash`). La chiave **resta in questo browser** — non entra nei backup né nell'archivio su GitHub — e parte solo verso Google. Senza chiave gioca l'euristica che guarda una mossa avanti (vedi sotto), e il pannello lo dice; se Gemini risponde male o non risponde, quella mossa la gioca l'euristica e il pannello conta gli intoppi.

**AI contro AI, sul tavolo.** In *Giochi con* c'è anche *Nessuno: guardo l'AI contro l'AI*: l'arbitro fa giocare tutti e due gli eserciti a due agenti separati (l'euristica che guarda avanti, o Gemini se c'è la chiave) e tu guardi la partita sul tavolo mentre succede, con le schede del perché di ogni scelta e di ogni tiro. Con *L'AI aspetta* spuntato si ferma il tempo di leggerle; *❚❚ Ferma* la blocca dov'è, *Una mossa* la fa andare avanti di una scelta, *▶ Riprendi* la lascia andare. È la partita di `tools/partita.mjs`, ma guardata dal vivo invece che dopo.

La sfida **vive nella scheda del browser**: ricaricando la pagina si ricomincia.

**Una sfida finita, nel diario.** L'app non la salva da sola: quello che resta quando hai finito è il registro, che *Copia il registro* mette negli appunti. `tools/archivia-registro.mjs` prende quel testo e ne fa una voce di `dati/partite.json`, nella stessa forma di ogni altra partita:

```bash
node tools/archivia-registro.mjs partita.txt --liste 3,4          # cosa ne capisce, senza scrivere
node tools/archivia-registro.mjs partita.txt --liste 3,4 --mia A --tu Michele --archivia
```

Dal registro si leggono le perdite mezzo turno per mezzo turno, chi è caduto, chi è scappato e chi si è radunato — e i capi che un reggimento **travolto** si è portato via, che il registro non nomina (p. 207). Il punteggio non lo copia: lo rifà `battlelog.js` dal ruolino, ed è il modo in cui la ricostruzione si controlla da sola — se i punti non tornano con quelli che l'arbitro aveva scritto, qualcosa non è stato letto. Quello che **non** c'è sono le posizioni: la sfida non salva il tavolo, e le fotografie hanno le coordinate a zero. Sta scritto nelle note della partita, perché un tavolo inventato è peggio di un tavolo assente. Se il registro nomina unità che le due liste non hanno, lo strumento si ferma invece di archiviare una partita finta.

### 6. Partite

La scheda **Partite** è il diario. Ci si arriva in due modi.

**Dal tavolo.** Finita la partita (o anche a metà), *Archivia il report*: la partita registrata diventa una voce dell'archivio, con liste, terreno, schieramento, tutte le fotografie di fine turno e il registro.

**A mano**, per una partita giocata altrove: *Nuova partita a mano*, si scelgono due liste salvate e si compila. Ogni turno si porta avanti da solo la situazione di quello prima, quindi si scrive **solo quello che è cambiato**: le perdite del turno, i pollici percorsi, chi è andato in rotta. Correggere un numero al turno 2 risistema superstiti e stato di tutti i turni successivi.

**Solo il risultato**, per i tornei. Torni a casa con quattro punteggi e nessuna fotografia, e un archivio che pretende i turni ti lascia con un turno vuoto in cima che non compilerai mai — cioè una bugia con l'aria di un lavoro da finire. *Solo il risultato, senza turni* registra chi ha giocato cosa, quando, e come è andata: è un dato completo, non una partita a metà, ed è quello che serve a sapere quali liste reggono. Se poi vuoi raccontarla turno per turno, un pulsante la apre.

**Punteggio.** Tre righe le calcola l'app guardando l'ultima situazione registrata — unità nemiche distrutte, ridotte a metà o meno, in rotta a fine partita — sommando i punti delle liste. Le altre le sai solo tu, e sono quelle che decidono davvero le partite: generale ucciso, portastendardo, stendardi catturati, obiettivi controllati, quarti di tavolo, bonus di scenario. Si scrivono a mano, e se ne aggiungono di proprie. Scrivendo un numero su una riga calcolata, quella riga smette di essere ricalcolata e resta la tua.

Il verdetto (pareggio, vittoria di misura, netta, schiacciante) è **una convenzione dell'app**, proporzionale ai punti giocati: non è una regola del manuale, è un modo di dire quanto è larga la vittoria senza guardare una differenza secca.

**L'esportazione è il punto della scheda.** *Copia per l'AI* mette negli appunti il report intero in Markdown, preceduto dalla richiesta di analizzarlo: si incolla in chat e si chiede cosa è andato storto.

La prima volta chiede una cosa sola: **chi hai giocato?**. Non è una formalità. Un report è la cronaca di due eserciti, e chi lo legge per commentarlo — una persona o un'AI — senza sapere quale dei due sei tu commenta tutti e due con la stessa cortesia: esce un'analisi vera e inutile, perché metà riguarda mosse che non ha fatto nessuno che stia leggendo. Dichiarato il lato, la richiesta cambia mestiere: diventa una critica delle **tue** scelte, con l'avversario nel ruolo di chi te le ha fatte pagare, e il permesso esplicito di non addolcire. La risposta resta salvata nella scheda, e *non lo dico* è una risposta buona che tiene il testo neutro. Il testo si spiega da solo — dichiara le unità di misura, l'origine degli assi, da che parte schiera ciascuno, che *mosso* è lo spostamento netto e non il percorso, e che il registro è tenuto a mano da un giocatore mentre gioca, quindi può avere buchi. Poi elenca:

- la scheda della partita, scenario, tavolo e chi ha giocato per primo;
- le due liste unità per unità, con modelli, punti, basette, formazione, movimento, gittata e regole speciali;
- il terreno allo schieramento, con misure, orientamento e attraversabilità — e di nuovo, in ogni turno in cui qualcuno lo ha spostato;
- lo schieramento iniziale, in coordinate e a parole («metà di B · corsia destra»), con l'ingombro di ogni unità e il terreno che sta occupando;
- l'andamento, cioè quante perdite ha preso ciascuno in quale turno — la tabella da cui si vede subito dove la partita è girata;
- i **marcatori** e le **zone disegnate a mano**, con le etichette che ci hai scritto e la dichiarazione esplicita che l'app non le interpreta;
- un capitolo per ogni mezzo turno con la situazione di ogni unità a fine turno, le **ferite** segnate in quel turno e in tutto, le **etichette** attive, i **contatori** dei due eserciti, i **contatti di basetta** (chi tocca chi, e da che lato: fronte, fianco, retro) e quanti modelli di ciascuna stanno dentro un elemento scenico;
- il punteggio voce per voce e le tue note.

Ci sono anche *Copia il Markdown* senza la richiesta davanti, *Scarica .md* e *Scarica .json* — il JSON è il report intero, per rileggerlo con un programma.

---

## Una partita giocata dall'app

Fin qui l'app sapeva **calcolare** e non sapeva **applicare**: lo scontro simulato ti diceva quante ferite passavano, il motore ti diceva che casella toccava, e a portare i numeri sui pezzi eri sempre tu. `src/arbitro.js` è l'arbitro che mancava. Tiene lo stato di una partita, sa in che punto del turno si è, dice **quali gesti sono legali adesso**, e quando gliene passi uno tira i dadi, applica le regole e scrive una riga di registro con la pagina del manuale accanto.

Non sa le regole: le sanno `charge.js`, `combat.js`, `melee.js`, `shoot.js`, `psych.js`, `magic.js`, `victory.js`, e l'arbitro le chiama. Non decide: le decisioni le prende chi gioca. E dice quello che non fa — le semplificazioni sono elencate in `LIMITI` e finiscono nel registro la prima volta che contano.

Chi gioca sta in `src/agente.js` e `src/ricerca.js`, e può essere tre cose:

- **l'euristica**, regole di buon senso da tavolo in fila: si schiera largo, si raduna sempre, si carica sopra una soglia di probabilità e **solo se la carica rende** (l'arbitro scrive su ogni carica quanti punti guadagna al primo round), chi ha un arco resta fermo, si va addosso a chi è più vicino — ma **non dove il nemico carica e ci si perde**: ogni mossa porta il `rischio` di essere caricati dove arriva, il `danno` che quella carica costerebbe e la `portata` della propria carica il turno dopo, e se serve l'arbitro offre di fermarsi prima (*accosta*). Serve a far girare mille partite in qualche secondo e a fare da rete di sicurezza;
- **l'euristica che guarda una mossa avanti** (`ricerca.js`): le cariche le decide tutte insieme come un problema di assegnazione — il secondo caricatore sul reggimento che il primo non basta a rompere vale più di due cariche mediocri, e il conto lo fa `scontroDiGruppo` con le regole del combattimento a più unità (p. 153) —, e le mosse, i tiri e le reazioni li **prova** su una copia della partita, con qualche dado campionato su una sorgente a parte, e sceglie quella che lascia la posizione migliore secondo `valuta` (punteggio, ferite, mischie in corso, cariche del turno che viene, obiettivi). È un passo solo, non un albero: costa sei volte l'euristica, cioè qualche secondo a partita;
- **un modello di linguaggio**, che legge la fotografia del tavolo, l'elenco numerato delle mosse legali con dentro distanze e probabilità già calcolate, e sceglie — dicendo perché. Non gli si chiede di sapere le regole né di tirare i dadi: sceglie fra mosse che l'arbitro ha già dichiarato legali, e i dadi li tira l'arbitro con il seme.

```bash
npm run partita                       # due euristiche, partita commentata
node tools/partita.mjs --seme 42      # la stessa partita, sempre identica
node tools/partita.mjs --liste ?      # le liste dell'archivio, numerate
node tools/partita.mjs --liste 4,9 --scenario bm-rovine
node tools/partita.mjs --liste lmtl5r4mb97yl,lmubp01267euf   # o per id: il comando che copia la scheda Matchup
node tools/partita.mjs --gemini       # due modelli che si affrontano
node tools/partita.mjs --gemini A     # solo l'esercito A è il modello
node tools/partita.mjs --html partita.html   # la partita da GUARDARE
node tools/partita.mjs --archivia     # e anche nel diario, in testa a dati/partite.json
node tools/partita.mjs --liste 4,9 --partite 100   # cento partite di euristica, solo il conto: chi vince quante volte
node tools/partita.mjs --liste 4,9 --partite 100 --estro   # e ognuna con un piano diverso: dice anche quali piani vincono
node tools/partita.mjs --liste 4,9 --partite 300 --estro --heatmap mappa.html   # la mappa: dove parte, passa e combatte ogni unità, e come va
node tools/partita.mjs --liste 4,9 --partite 150 --specchio   # ogni seme due volte, con le liste scambiate di lato
node tools/partita.mjs --ricerca A    # la parte A guarda una mossa avanti
node tools/partita.mjs --liste 4,4 --partite 100 --specchio --ricerca x   # quanto vale guardare avanti, con la stessa lista
node tools/partita.mjs --liste 4,9 --partite 60 --estro --esperimento "Temple Guard"   # l'esperimento: quell'unità in ogni colonna, stessi dadi
node tools/partita.mjs --scenario sxmttrgusdc7c   # uno scenario disegnato nell'app, da dati/scenari.json
node tools/controlla-partita.mjs partita.html  # e il controllo di quello che è successo
```

All'avvio stampa **quali liste ha preso** — numero, nome, fazione, punti — e avvisa quando i punti non si equivalgono, quando una lista non dice la fazione o quando le sue unità non hanno tipo di truppa o armi. `--liste` vuole due numeri: `--liste 3, 9` con lo spazio va bene, `--liste 3,` si ferma e lo dice (prima diventava «3 contro la lista 0» senza avvisare), e un argomento che non conosce non passa in silenzio.

Con `--html` esce **una pagina sola**, senza dipendenze e senza rete: il tavolo disegnato, una barra per andare avanti e indietro fotogramma per fotogramma, e accanto il registro con i dadi usciti, la pagina del manuale e il perché tattico di chi ha scelto. Si apre con un doppio clic, si manda a un amico, si mette su GitHub Pages — dentro non c'è nessuna chiave e non chiama nessuno. I dadi sono tutti, a mucchi (`colpire 4+ · ferire 3+ · armatura 5+`), le unità in mischia hanno il bordo giallo e ⚔, i modelli singoli dicono le ferite che restano (♥3/4), e le unità con lo stesso nome prendono un numero (`Skink Skirmishers 2`). I fotogrammi in cui non succede niente non si tengono, e quando chi gioca **passa** con altre mosse possibili il perché si legge come quello di ogni altra scelta.

Sopra il tavolo compaiono **le schede del perché**, le stesse della sfida nell'app: per ogni fotogramma il perché di chi ha scelto la mossa e le schede dei tiri che ha fatto fare — test di rotta, carica, tiro, colpi in mischia, risultato del combattimento, fuga, inseguimento, Panico, lancio e dissolvimento, terreno — con le unità di cui parlano accese sul tavolo (a tratto pieno chi agisce, tratteggiata chi subisce). *▶ Guarda* si ferma su un fotogramma quanto serve a leggerle; la spunta *perché* le toglie. Nel registro, ogni riga che ne ha una si apre sulla sua scheda. La pagina porta con sé il sorgente di `src/spiega.js` e le disegna da sola: il file resta leggero, e la scheda è disegnata in un posto solo.

Gli avvisi di partenza — liste senza fazione, senza tipo di truppa o senza armi, unità che **sul tavolo** giocano con Resistenza o Abilità a zero, le volte in cui il modello non ha scelto — non restano in console: stanno anche in cima alla pagina, in un riquadro. Una partita ha girato con un esercito intero a caratteristiche zero, e la console lo diceva a metà mentre la pagina taceva.

Con `--archivia` la partita finisce anche **nel diario**, in testa a `dati/partite.json` (o al file che gli si passa), nella stessa forma di una partita archiviata dal tavolo: liste, terreno, la fotografia dello schieramento e una per ogni mezzo turno con dentro i perché di chi ha scelto e le righe dell'arbitro, e nelle note il verdetto dell'arbitro e quello che la partita non ha giocato. Il report lo costruisce `battlelog.js`, lo stesso codice della pagina (`tools/archivia.mjs` fa solo da ponte). È marcata `meta.simulata`: nella scheda Partite si legge *simulata, fuori dal palmarès*, e il palmarès delle liste non la conta. Per vederla nell'app: dall'app **Salva su GitHub**, poi il push del file, poi **Scarica** — la Nuvola sostituisce `partite.json` intero, quindi una partita archiviata nell'app e non ancora salvata andrebbe persa.

`tools/controlla-partita.mjs` rilegge una pagina e cerca quello che una partita giusta non fa mai: dadi che non escono uno su sei, unità una dentro l'altra o fuori dal tavolo, chi cede terreno di zero pollici a mezzo tavolo, chi ripiega ed esce da lontano, chi resta fermo e tira con «ha mosso», fotogrammi doppi. Esce con 1 se trova qualcosa. È nato rileggendo la prima partita fra due modelli, che aveva tutte queste cose insieme.

Per il modello serve una chiave nell'ambiente — `GEMINI_API_KEY`, e `GEMINI_MODEL` se ne vuoi uno diverso da `gemini-3.6-flash`:

```bash
npm run prova-chiave                  # una domanda sola: la chiave funziona?
GEMINI_API_KEY=... node tools/partita.mjs --gemini
```

Una partita sono un centinaio di domande al modello (circa 55 per parte, ~80 mila token in tutto): fra una e l'altra passano di suo **4,5 secondi**, perché le quote gratuite contano le richieste al minuto — si cambia con `--pausa 8000`, e un «429, troppe richieste» non fa perdere la mossa, si aspetta e si richiede. Senza chiave la partita si gioca lo stesso con l'euristica, e lo scrive. Se il modello risponde male — un numero fuori dall'elenco, la rete che cade — **la mossa non viene aggiustata di nascosto**: si gioca quella dell'euristica e nel registro c'è scritto che non l'ha scelta lui.

**Quello che stampa è pensato per essere letto.** Ogni mossa dice chi ha scelto, perché, e cosa è successo, con la pagina accanto:

```
── CARICHE ──
  Orc and Goblin Tribes: carico Temple Guard con Black Orc Mobs: 4.2″,
    serve solo muoversi, riesce il 100%, la prende di fianco
    T3 · Black Orc Mobs dichiara la carica su Temple Guard: a 4.2″.  (p. 119)
    T3 · Temple Guard tiene la posizione.  (p. 120)
    T3 · Black Orc Mobs carica Temple Guard e arriva: 5, 3 → 9″ contro 4.2
         richiesti, e la prende di fianco.  (p. 121)   [5 3]

── MISCHIA ──
    T3 · Risultato: Temple Guard 2 (1 rango + 1 ordine di combattimento) contro
         Black Orc Warboss e Night Goblin Bigboss 5 (2 ferite + 2 ordine di
         combattimento + 1 fianco). Vince di 3.  (p. 153)
    T3 · Temple Guard: Comando 8, 2D6 = 10 e con lo scarto di 3 fa 13 → va in rotta  (p. 154)
```

Una partita dura quattro o cinque secondi con l'euristica, e finisce con il verdetto del libro: cinque round in Battle March e sei nel Core Rulebook, i punti vittoria con i bonus del generale, dello stendardo da battaglia e degli obiettivi tenuti a fine turno, e il margine del formato — in Battle March vince chi ne ha di più (p. 27), nel Core ne servono cento. Il punto di rottura è la durata di uno scenario del Core Rulebook (p. 291), non di tutte le partite, e si chiede con `durata: "breakpoint"`. In fondo stampa **quello che quella partita non ha giocato**, riga per riga: è la lista della spesa del prossimo pezzo di lavoro.

### Tante partite: come si leggono

Trecento partite dell'euristica sono un campione, e fino a poco fa si leggevano come un verdetto. Tre cose sono cambiate, e vale la pena sapere perché.

**Chi comincia lo decidono i dadi, come nel libro.** Prima la parte A schierava e muoveva per prima in ogni partita, e «O&G vince il 75%» non diceva quanto fosse l'esercito e quanto il primo turno. Adesso ci sono i due tiri: nel Core chi vince il primo sceglie chi schiera la prima unità (p. 285), e a schieramento finito si tira ancora con +1 a chi ha finito di schierare per primo, e chi vince comincia (p. 289); in Battle March chi vince il primo schiera per primo e chi vince il secondo **sceglie** chi comincia (pp. 26-27). Le scelte sono gesti come gli altri, e l'arbitro le chiede.

**Lo specchio separa la lista dal lato.** Con `--specchio` ogni seme si gioca due volte, la seconda con le liste scambiate di posto. Il conto finale non dice più «A vince», dice quanto vale ciascuna lista **a parità di lato e di turno**, quanto vale stare in basso e quanto vale muovere per primi, con una regressione sullo scarto di punti vittoria (errori robusti) e una logistica sulla vittoria. Senza specchio lista e lato restano la stessa cosa, e il conto lo scrive. La prova della lista contro se stessa è in `npm test`: con la stessa lista e senza estro le due partite di un seme devono essere la stessa partita a etichette scambiate, e i posti di schieramento delle due zone devono essere uno lo specchio dell'altro.

**I numeri piccoli non gridano più.** «Quali piani vincono» era una fila di percentuali divise sulla mediana, una scelta alla volta; la lista contro se stessa ne dava una da 38 punti su una scelta che non poteva contare niente — dodici confronti in fila, e uno spettacolare esce sempre. Adesso è una regressione con tutte le scelte insieme e Benjamini-Hochberg sopra: una riga che non regge lo dice. Nella mappa ogni percentuale passa dal **restringimento beta-binomiale** (un posto con quattro partite torna verso la media della sua lista, uno con ottanta resta dov'è), il colore ha una **scala fissa** — pieno a venti punti percentuali — invece di riscalarsi sul massimo, scontri e morti si contano **una volta per partita** e non per mezzo turno, la posizione copre tutte le caselle dell'ingombro, e la croce sta dove l'unità è morta davvero. La mappa del movimento si chiama *Dove sta* e dice di sé che è **descrittiva**: un reggimento sta avanti *perché* sta vincendo, non il contrario. Si sfoglia turno per turno.

**L'esperimento fa quello che la mappa osserva.** `--esperimento "Temple Guard"` gioca ogni seme cinque volte, con quell'unità della lista A in ognuna delle cinque colonne e tutto il resto uguale — lo stesso piano, gli stessi dadi — e confronta le colonne **dentro lo stesso seme**, dove la fortuna della partita si cancella (il disegno a blocchi dei numeri casuali comuni). I dadi sono **per gesto** (`seededPerGesto`): ogni gesto ha la sua sequenza, e lo stesso gesto tira gli stessi dadi in tutte e cinque le partite anche quando le altre hanno pescato di più altrove. Il conto stampa ogni volta quanto il seme si è portato via della varianza e a quante partite indipendenti vale l'appaiamento, perché dipende dal tavolo: sulle prime prove il seme spiegava il 21%, e l'appaiamento valeva poco più di una partita e un terzo.

Tutto quello che si legge qui resta **il meglio per l'euristica**, non per un giocatore bravo: le pagine lo scrivono in fondo.

Il turno che l'arbitro gioca è più corto delle sedici caselle di `phases.js` — congiurazione, raduno, cariche, mosse, tiro, mischia — e la differenza è dichiarata: niente sotto-fase di comando. Tutto il resto è quello vero: le reazioni alla carica, il tiro con i suoi modificatori, il combattimento **a più di due** con il conto di p. 153, le sfide fra personaggi con il ritiro di chi le rifiuta, i tre esiti del test di rotta uno per unità, l'inseguimento che travolge, il Panico con tutte e quattro le sue cause e i suoi due esiti, il raduno con le perdite insostenibili.

**La magia si gioca.** Il file di New Recruit non dice il Livello di un mago, spesso nemmeno il dominio, e mai gli incantesimi usciti: l'arbitro li prende dalla scheda di preparazione quando ci sono (`level`, `lore`, `spellIds`) e altrimenti dalla scheda del mago sul suo libro, che sta in `dati/magia/domini.json` con libro e pagina (un Night Goblin Oddnob è Livello 3, Illusion o Waaagh!, Ravening Hordes p. 18). Prima dello schieramento chi gioca sceglie il dominio, l'arbitro tira gli incantesimi (p. 106) e chi gioca decide se scambiarne uno con la firma. Nel turno un incantesimo è una mossa come una carica — potenziamenti e maledizioni nella congiurazione, dardi nel tiro, assalti in mischia (p. 108) — con dentro la probabilità di lanciarlo e le perdite attese; appena lanciato, **il dissolvimento tocca all'altro giocatore**, con i suoi maghi in gittata o con la sorte una volta per turno, e con la probabilità già fatta. Il fiasco e il surclassamento vanno sulla tabella di p. 109. Questa edizione non ha una riserva di dadi del vento: ogni tentativo tira i suoi 2D6, e l'arbitro non ne inventa una.

```
── TIRO ──
    T1 · Skink Priest lancia Fireball su Night Goblin Mobs: lancio 4 + 5 + 2 di Livello = 11 contro 8+ — lanciato.  (p. 108)
    T1 · Night Goblin Oddnob contro Fireball: dissolvimento 1 + 2 + 3 di Livello = 6 contro 11 — tiene.  (p. 110)
    T1 · Fireball: 2D6 → 3 + 3 = 6 colpi.  (p. 321)
```

`node tools/partita.mjs --liste 1,2 --scenario bm-monolite` fa giocare uno Skink Priest contro un Night Goblin Oddnob.

**I personaggi stanno nei reggimenti.** Allo schieramento prima vanno in campo i reggimenti, poi i personaggi, che possono unirsi a uno dei loro — la fanteria con la fanteria, la cavalleria con la cavalleria — o stare da soli (p. 207); nelle mosse restanti un personaggio da solo può raggiungere un reggimento e unirsi, e quel reggimento non si muove più in quel turno, o uscirne prima che si muova. Il reggimento con dentro un capo usa il Comando più alto fra i suoi modelli (p. 97), va al passo del più lento (p. 208), conta anche la sua Forza d'Unità, e se fugge fuori dal tavolo o viene travolto il capo va con lui; se invece cade nel combattimento il capo resta in piedi, da solo.

**La psicologia si tira.** La **Paura** prima di dichiarare una carica e quando il combattimento viene scelto, una volta per turno, contro chi la fa ed è più grosso (p. 168): chi fallisce non carica, o colpisce con −1. Il **Terrore** quando chi lo fa dichiara la carica: chi fallisce deve fuggire (p. 179). La **Stupidità** all'inizio del turno, con il testo che la lista porta: chi ci cade non si muove, non tira, non lancia, e se caricato tiene la posizione. Chi è Immune to Psychology o frenetico non può scegliere la fuga — prima l'arbitro glielo offriva lo stesso. Il Comando del generale arriva a 12″, a 18″ se è un Large Target (p. 202).

**Il tavolo non si compenetra.** Chi si muove avanza a passi e si ferma all'ultimo posto libero — prima di un'altra unità, a un pollice da un nemico (p. 118), sul bordo — e se la strada dritta è chiusa prova qualche grado di lato. Chi carica si mette sulla faccia da cui arriva e, se lì c'è già qualcuno, scorre lungo la stessa faccia: quei pollici entrano nel tiro che serve, e una carica senza posto non si offre nemmeno. Chi cede terreno si sposta davvero di 2″ (o si ferma contro chi ha dietro, e lo dice), e chi ha vinto lo segue e resta a contatto; chi ripiega in ordine tira 2D6 e tiene il maggiore, e si muove come chi fugge: attraversa, non si ferma dentro nessuno, esce solo se tocca il bordo. Chi insegue si muove anche lui, e chi carica un nemico già fuggito lo travolge se lo raggiunge. Il Comando del generale vale per chi gli sta entro 12″, stare fermi non conta come movimento per il tiro, e gli schermagliatori non prendono il bonus di ranghi.

**Il terreno conta** (pp. 269-272, e p. 159 per il combattimento). Fino a ieri l'arbitro del terreno sapeva due cose, tutte e due guardando un punto solo: se una retta fra due centri toccava un pezzo che `blocca`, e se il centro di un'unità stava dentro un pezzo che ripara. Adesso ogni pezzo posato porta la sua **categoria**, ed è da lì che discende tutto il resto. Il terreno difficile — il bosco, le rovine, la palude, e anche un muretto basso, che il libro tratta come difficile — **toglie un pollice al Movimento** (p. 269), quindi due alla marcia, e in carica fa tenere il **dado peggiore** dei due (p. 128). Il terreno **pericoloso** chiede il suo test: un D6 per modello per ogni pezzo attraversato, e con un 1 il modello perde una ferita — non un modello, una ferita, così un Troll da tre non muore per una pozzanghera. Il terreno **impassabile** non si attraversa: prima nelle partite dell'arbitro si camminava dentro il monolite e dentro la piramide come in un prato. Un quarto o più dei modelli nel difficile **all'inizio del combattimento** costa il bonus dei ranghi (p. 159), e non solo a fine carica. La prima fila su una **collina** vale un punto nel risultato (p. 152) e una fila in più che tira (p. 272), e la collina taglia la vista a chi non ci sta sopra. Chi carica un nemico che **difende un ostacolo basso** non lo scavalca, e la sua carica è disordinata (p. 270) — a meno che voli. Le **decorazioni** sotto i due pollici, come i segnalini del tesoro, si ignorano per movimento e combattimento (p. 271). E la linea di vista è quella del libro: unità in mezzo che fanno da schermo, penombra del bosco, riparo contato sui modelli coperti — leggero fino a metà, pesante oltre. Quello che resta semplificato sta in `LIMITI` e finisce nel registro: il percorso si misura con cinque linee (il centro e i quattro angoli) invece che con la sagoma che scorre, e il test di terreno pericoloso lo tirano tutti i modelli dell'unità invece dei soli che ci sono passati davvero.

**E chi sceglie lo vede** (p. 270). Sapere una regola e dirla a chi decide sono due cose diverse, e una partita vera lo ha mostrato: un reggimento di Black Orc schierato dietro il monolite ci è rimasto fermo per tutta la partita. Il tavolo era giusto — nel monolite non ci si entra da quando i pezzi portano la categoria — e sbagliato era quello che si metteva davanti a chi sceglie. La **fotografia del tavolo** non nominava il terreno affatto: unità, profili, distanze, punti vittoria, e dei sette pezzi posati nemmeno una parola, così che per un modello di linguaggio il monolite non esisteva. E l'opzione di mossa prometteva i pollici del profilo — «marcia di 8″» — dove il tavolo ne dava zero, ogni turno, identica. Adesso la fotografia **elenca i pezzi** con quello che fanno e dove stanno; l'opzione **prova la strada prima di offrirla** e quando un pezzo la chiude lo scrive con i pollici veri; e si offre di **aggirarlo**, un varco per fianco, con la ruota già contata — o, per chi sta troppo attaccato al muro per potersi girare, con il passo di lato di p. 125. I **posti di schieramento** dicono su che cosa ci si posa e che cosa hanno davanti entro dodici pollici, quelli con un impassabile davanti finiscono in fondo all'elenco, e dentro un impassabile non se ne offre nessuno. Non è una ricerca di strada, e il limite resta dichiarato: l'arbitro guarda un ostacolo solo, quello che ha davanti adesso.

**Nessuno resta fuori in silenzio** (p. 115). Trecento partite Skaven contro Lucertole sul «Poligono di tiro» si sono giocate senza i Terradon Riders: la zona profonda sei pollici aveva una fila sola, le cinque colonne dello schieramento erano già prese, e la sesta unità spariva senza una riga nel registro — non combatteva e non dava punti a nessuno. Adesso le cinque colonne vanno da un bordo all'altro della zona, «sinistra» contro il bordo sinistro, così che fra un'unità e l'altra resti spazio; quando sono piene l'arbitro offre i **varchi** fra le unità già schierate; e quando l'unità è troppo profonda o troppo larga per quello che resta prova un **altro fronte**, con il bonus di ranghi prima e dopo scritto accanto (trenta Clanrat cinque per sei, che in sei pollici non stanno, si schierano sei per cinque). Se non basta niente l'unità resta fuori, e lo si scrive: una riga nel registro con il perché in pollici, il limite `fuori`, e un avviso di `partita.mjs` che in una serie conta in quante partite è successo.

**Le manovre si pagano** (pp. 124-125). Chi avanza o marcia verso il nemico **ruota**, e la ruota costa quanto cammina il modello esterno: una Temple Guard larga cinque basette che deve girarsi di 20° spende 2,1″ dei suoi 4 e ne cammina 1,9; a 45° non avanza affatto, e l'opzione lo dice prima di sceglierla. Gli schermagliatori e i personaggi da soli non ruotano — ogni modello va dove vuole (pp. 185, 205) — e un mostro o un carro pesante ha 90° gratis quando non marcia (Lumbering, p. 195). Chi ha il nemico sul fianco o alle spalle può **girarsi** di 90° o 180° per un quarto o metà del Movimento, e poi andare dritto con il resto; di 90° i ranghi diventano file, e un cinque per tre si ritrova tre per cinque, in colonna, senza bonus di ranghi. Oppure si **riforma**: gira sul centro tenendo il fronte, e costa tutto il movimento. Chi ha davanti un nemico che lo può caricare fa un **passo indietro** a metà Movimento, sempre girato verso di lui, e l'opzione dice se ne esce; chi ha il nemico davanti ma spostato si mette **di lato**; e ogni reggimento può **riordinare le file**, cinque modelli in più o in meno in prima fila per metà del Movimento, con il bonus di ranghi prima e dopo scritto accanto. Una manovra sola per movimento. Quello che l'arbitro ne semplifica — la ruota fatta una volta sola, sul centro, all'inizio; il resto del movimento che dopo un riordino non si cammina — sta in `LIMITI` e finisce nel registro.

**Le sfide si lanciano** (pp. 211-212). Quando un combattimento viene scelto, prima che si meni, chi è di turno può mandare avanti un suo personaggio; se non lo fa può farlo l'altro, e una sola sfida per combattimento. Chi la subisce nomina chi la raccoglie — e i due da lì in poi **si menano solo fra loro**, in ordine di Iniziativa, e nessun altro può dirigere i colpi su di loro: la cavalcatura di chi duella va addosso al rivale come il cavaliere, e se il rivale cade prima che la bestia meni i suoi colpi si tirano lo stesso, perché contano per l'**overkill**, le ferite in più di quelle che bastavano, fino a +5 nel risultato. Chi rifiuta paga: il giocatore che l'ha lanciata nomina uno dei personaggi che avrebbero potuto raccoglierla, e quello **si ritira in fondo alle file** — non mena, non lo colpisce nessuno, e al suo reggimento non presta più né Comando né regole speciali finché quel nemico gli sta addosso. Rifiutare non si può sempre: un personaggio da solo, o un reggimento ingaggiato su tutti e quattro i lati, non ha dove scappare (p. 212). E una sfida raccolta non finisce con il turno: se sopravvivono tutti e due, il turno dopo continua. Ogni scelta porta i suoi numeri — quante ferite ci si aspetta di fare al rivale, quante di prenderne, su quante ne restano a ciascuno — perché una sfida è una scommessa e va fatta a occhi aperti.

```
── CORPO A CORPO ──
    T3 · Black Orc Warboss lancia una sfida.  (p. 211)
    T3 · Black Orc Warboss e Saurus Scar-Veteran si affrontano in una sfida: da qui in poi i loro colpi vanno solo l'uno sull'altro.  (p. 212)
    T3 · Black Orc Warboss colpi su Saurus Scar-Veteran: 4 attacchi, 4 colpi, 2 ferite, 1 a terra.  (p. 144)
```

**Le macchine da guerra bombardano** (pp. 224-226). Un lanciapietre non tira per colpire: «this weapon does not use its crew's Ballistic Skill». Si sceglie un bersaglio, la sagoma si posa sul **centro** della sua unità, un dado di artiglieria dice di quanti pollici devia e uno di deviazione in che direzione, e poi si guarda chi è rimasto sotto — **basetta per basetta**, che è l'unica cosa del tiro che vuole sapere dove sta ogni singolo modello, e il motivo per cui questo pezzo è arrivato per ultimo. Sotto del tutto si è colpiti, sotto in parte con un 4+ (p. 95), e il modello che sta **sul buco centrale** è colpito comunque e si prende la Forza e la penetrazione scritte fra parentesi sul profilo: un lanciapietre fa Forza 4 con −1 a tutti e Forza 8 con −3 a lui. Poi i colpi si tirano per ferire e si salvano come qualunque altro. La sagoma non guarda le bandiere: sotto ci finisce chi c'è, amico o nemico, e un personaggio unito a un reggimento — che a un arco non si potrebbe bersagliare (p. 209) — sotto la sagoma ci sta come tutti gli altri. Il **Mancato Colpo** del dado di artiglieria non è un tiro fallito, è un rinvio alla tabella dell'arma (p. 347): con un 1 la macchina è distrutta e si toglie dal tavolo, da 2 a 4 l'equipaggio perde una Ferita e la macchina non tira fino alla fine del round successivo, con 5 o 6 salta solo il tiro. Quale sagoma usa un'arma sta nelle **Note** del profilo, che l'export di New Recruit butta via: l'app ha la riga dei tre pezzi che i libri in casa descrivono — lanciapietre, mortaio, Plagueclaw Catapult — e per gli altri lo dichiara invece di indovinare, perché fra la sagoma da tre pollici e quella da cinque ce ne sono due di diametro.

```
── TIRO ──
    T2 · Stone Thrower bombarda Orc Mobs con Stone thrower da 18.4″. Colpito!: la sagoma resta dov'è stata messa. Sotto la sagoma: 2 del tutto, 10 in parte — colpiti Orc Mobs: 10.  (p. 224)
    T2 · Orc Mobs: il modello sotto il buco centrale prende Forza 8 con -3 di penetrazione (p. 224).
    T2 · Stone Thrower su Orc Mobs: 10 colpi di sagoma, 6 ferite, 6 a terra.  (p. 224)
    T2 · Orc Mobs, test di Panico (più di un quarto perso (la sagoma di Stone Thrower)): Comando 6, 4 + 6 = 10 → fallito.  (p. 141)
```

**E il Warp Lightning Cannon spara** (Legends: Skaven, p. 19). È l'unica macchina da guerra delle liste salvate, e fino a qui non aveva mai tirato un colpo in nessuna partita: il profilo che l'export porta dice gittata «8D6"» e Forza «\*», e l'app ne leggeva otto pollici e la Forza dell'equipaggio — un cannone che sparava a 8″ con Forza 3, e che quindi non sparava mai. La sua regola non è una sagoma: è una **linea** lunga 8D6″ tirata dal bordo della basetta, e ogni modello la cui base ci finisce sotto — amico o nemico — prende un colpo la cui Forza è un dado di artiglieria. Se quel dado fa Mancato Colpo si va sulla **sua** tabella, che non è nel Core Rulebook: con un 1 la macchina e il suo equipaggio esplodono, da 2 a 4 le energie la fanno girare su se stessa e scaricare con Forza 6 in una direzione a caso, con 5 o 6 l'energia si dissipa.

E per arrivare a sparare le servivano altre tre regole che l'app non aveva. **«Weapon of War»** (p. 197) dice che una macchina da guerra non marcia, non dichiara cariche e non insegue, e ha −1 al tiro di fuga: l'arbitro la faceva marciare al primo turno e caricare al secondo. **«Move or Shoot»** (p. 174) è un divieto dell'arma e non dell'unità, e non arrivava a `canShoot`: i Warplock Jezzails marciavano e sparavano nello stesso turno. E **«Cumbersome»** (p. 167) — che qui era dichiarata da verificare, «cosa impedisce esattamente» — dice una cosa sola: quell'arma non si usa per il *tira e tieni*. Con loro sono state lette anche **«Ponderous»**, che raddoppia il −1 di chi ha mosso, e **«Quick Shot»**, che invece lo toglie e lascia sparare a chi carica da qualunque distanza — e che questo file diceva desse *tiri in più*, che era un'invenzione del nome.

```
── TIRO ──
    T3 · Warp Lightning Cannon punta Black Orc Mobs: la linea è lunga 40″ (6 + 6 + 5 + 6 + 3 + 5 + 4 + 5).  (p. 19)
    T3 · Warp Lightning Cannon spara un fulmine su Black Orc Mobs: una linea di 40″, Forza 6. Sotto la linea: Black Orc Mobs: 4, Night Goblin Squig Herds: 2.  (p. 19)
    T3 · Warp Lightning Cannon su Black Orc Mobs: 4 colpi di Forza 6, 2 ferite, 2 a terra.  (p. 19)
    T3 · Warp Lightning Cannon su Night Goblin Squig Herds: 2 colpi di Forza 6, 2 ferite, 2 a terra.  (p. 19)
```

**I dadi con il seme** vengono da `D.seeded(seme)` in `dice.js`, uno solo per tutti. Il generatore che c'era prima — un lineare congruenziale scritto a mano in `partita.mjs` e nelle prove — in JavaScript perdeva i bit bassi: una partita intera di 1, 3 e 5, con un sei ogni trecento dadi. Le partite registrate prima di questa correzione non valgono come partite.

### Cercare una lista

Le liste «Skaven orda», «O&G orda nera» e «LIZ guardia e sangue freddo» non vengono da New Recruit: sono uscite da qualche decina di candidate, ognuna giocata a specchio su sei scenari contro le altre liste da 800 punti dell'archivio. Gli strumenti stanno in `tools/liste/`:

```bash
node tools/liste/valuta.mjs --file tools/liste/esempi.mjs --cand ogOrdaNera,lizGuardia   # contro le quattro liste da 800, sei scenari, 16 semi
node tools/liste/valuta.mjs --file mie.mjs --contro liz,"Skaven fun" --scenari bm-strada,open --partite 8
node tools/liste/gioca.mjs --x lmueliwuvm0ao --y "Skaven fun" --scenario bm-strada   # una serie sola, e che fine fa ogni unità
node tools/liste/salva.mjs --file mie.mjs --cand miaLista   # la candidata che resta, in dati/liste.json
```

Una candidata si scrive con i costruttori di `unita.mjs` — `OG.orcs({ n: 40, c: 'csm' })` sono quaranta Orchi con campione, stendardo e musico, e i punti li conta dal libro — e si prova **senza toccare l'archivio**: `valuta.mjs` la mette in un file temporaneo, e `gioca.mjs` gioca la stessa serie che giocherebbe `partita.mjs --partite N --specchio --estro`, con gli stessi numeri. `esempi.mjs` ha le tre liste dell'archivio riscritte così, con le alternative arrivate vicine e i loro numeri: è il file da copiare per cominciare.

Tre cose imparate cercandole, che i default ricordano. Fra due serie di semi diversi **la stessa lista cambia anche di 10-15 punti**, e tutte le candidate insieme: si sceglie con 16 semi o più e la vincitrice si riprova su semi mai usati. L'**arma aggiuntiva** non si compra: l'arbitro non ne conta l'attacco in più, e fra due armi che perforano uguale impugna la prima dell'elenco. E i **Fanatici** e gli attacchi del **Gigante** sono regole che il tavolo gioca a mano: in una serie sono punti che non fanno niente.

### Cercare una lista a macchina, e il Laboratorio

Quello che si faceva a mano con `valuta.mjs` — scrivere candidate, giocarle, tenere le migliori, cambiarle un poco — lo fa `cerca.mjs` da sé, per ogni fazione e in due serbatoi: **tutte le unità** che `unita.mjs` sa costruire, e **solo la tua collezione**, contata da `dati/catalogo.json` (due reggimenti di Clanrats da 40 ne vogliono 80 in vetrina). Poi `torneo.mjs` fa giocare le liste trovate tutte contro tutte, scenario per scenario, e la scheda **Laboratorio** dell'app lo disegna: scegli lo scenario e la tabella dice quali partite vengono equilibrate e quali a senso unico.

```bash
npm run cerca -- --sforzo rapido                     # le tre fazioni, tutte le unità e la collezione, 800 punti, i sei scenari
npm run cerca -- --fazione skaven --pool collezione --punti 750 --scenari bm-strada
npm run torneo -- --punti 800                        # chi batte chi, su ogni scenario (--archivio aggiunge le liste da 800 dell'archivio)
```

- Una lista è un elenco di **geni** (`spazio.mjs`): un'unità, quanti modelli, le opzioni, il dominio del mago. Da lì si costruisce la lista vera con la scheda di preparazione già compilata: generale (il Comando più alto fra chi non porta lo stendardo), stendardo da battaglia, Livello e dominio. Vale solo se sta nei punti senza lasciarne più del 4%, rispetta le percentuali della Grand Army, i limiti di ogni voce e Da Boyz.
- Ogni generazione **tutte le candidate giocano le stesse celle** — un avversario su uno scenario, un seme nuovo, a specchio — estratte fra tutte le coppie: giocarle tutte ogni volta costerebbe troppo (su un portatile le partite sono due o tre al secondo). Le migliori restano e rigiocano su celle nuove, e i conti si sommano; le altre si rimpiazzano con figlie e con una lista a caso. Alla fine le finaliste giocano **tutte** le celle su semi mai usati per scegliere, ed è con quei numeri che si ordinano.
- Gli avversari sono le liste dell'archivio vicine ai punti e la migliore di ogni ricerca delle altre fazioni: rifare la ricerca riparte dalle liste migliori della volta prima e gioca contro quello che le altre hanno trovato nel frattempo. È il giro da ripetere: ricerca, torneo, ricerca.
- I risultati vanno in `dati/ricerche/` (un file per ricerca, uno per torneo, e l'indice). La Nuvola non li tocca; su GitHub Pages arrivano con un commit. Dal Laboratorio una lista trovata entra nelle tue con **Aggiungi alle mie liste**.
- Lo sforzo: `rapido` (qualche centinaio di partite a ricerca), `normale` (un paio di migliaia), `accurato`. Il Laboratorio scrive il comando e dice quante partite costa.

## Installarla

C'è un manifest e un service worker: Chrome, Edge e Safari propongono **Installa app**. Ne guadagni due cose, e la seconda vale più della prima:

1. al circolo non c'è campo, e l'app si apre lo stesso — il guscio è in cache, i dati sono già locali;
2. un sito installato ottiene da Chrome ed Edge la **persistenza dell'archivio** senza chiedere niente, cioè il browser smette di poter buttare via la collezione nelle sue pulizie automatiche.

Le icone si rigenerano con `npm run icons` (le disegna [`tools/make-icons.mjs`](tools/make-icons.mjs) scrivendo il PNG a mano, così il progetto resta senza dipendenze anche per quelle).

Quando pubblichi una versione nuova basta **una** ricarica. Il service worker chiede prima alla rete il codice dell'app — `index.html`, i moduli, il foglio di stile — e ricade sulla cache solo quando la rete non c'è, che è il motivo per cui esiste. Prima i moduli venivano serviti dalla cache e aggiornati dietro le quinte: `index.html` era già quello nuovo e i moduli quelli di ieri, così metà app faceva una cosa e metà un'altra e i comandi appena aggiunti non rispondevano. Le icone continuano a venire dalla cache, che non cambiano mai.

---

## Pubblicare su GitHub Pages

Il progetto è HTML e moduli ES senza build. Si serve così com'è.

```bash
git init
git add .
git commit -m "Schieramento Old World"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/schieramento-old-world.git
git push -u origin main
```

Poi su GitHub: **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
Dopo un minuto il sito è su `https://TUO-UTENTE.github.io/schieramento-old-world/`.

Da quel momento aggiorni con `git push` e la pagina è già nuova al tavolo.

### In locale

I moduli ES non funzionano aprendo il file con doppio clic (`file://` blocca gli import). Serve un server, anche banale:

```bash
npm start          # oppure: python3 -m http.server 8080
```

e apri `http://localhost:8080`.

---

## Dove finiscono i dati

In **IndexedDB**, nel browser, sotto il dominio da cui apri la pagina. localStorage non basta: sta in 5 MB e un catalogo di collezione li sfonda; IndexedDB riceve quota in base allo spazio libero, di solito centinaia di MB. Il catalogo mostra quanto stai occupando.

Conseguenza da tenere a mente: i dati sono **legati a quel browser su quel dispositivo**. Aprendo la stessa pagina dal telefono trovi un archivio vuoto.

All'avvio la pagina chiede al browser di marcare l'archivio come **persistente**: senza quel permesso i dati sono “best effort” e il browser può buttarli via da solo (Safari dopo ~7 giorni senza visite, Chrome quando il disco va in pressione). Chrome ed Edge lo concedono in automatico ai siti usati spesso o installati, Firefox chiede conferma, e aprendo il file con doppio clic (`file://`) l'API non esiste proprio. Se il permesso manca, la riga di stato del catalogo lo scrive: *archivio non protetto, tieni un Backup*.

Per spostarli a mano usa **Backup** (scarica un JSON con tutto, foto comprese) e **Ripristina** sull'altro dispositivo. Vale anche come copia di sicurezza: `localStorage` e IndexedDB spariscono se cancelli i dati del sito. Per non doverci pensare ogni volta c'è la **Nuvola**, qui sotto.

---

## L'archivio su GitHub

Il pulsante **Nuvola**, in alto a destra, collega l'archivio a un repository. Da quel momento **Salva su GitHub** fa un commit con tutto quello che è cambiato, e **Scarica** riporta qui quello che ha salvato l'altro. Non c'è un server in mezzo: l'app parla direttamente con l'API di GitHub, e la cronologia del repository diventa la cronologia della collezione — una foto cancellata per sbaglio sta ancora nel commit di ieri.

### Prepararlo

1. Su GitHub crea un repository, meglio **privato**: se è pubblico, chi lo apre vede la collezione. Può essere anche quello dell'app, ma quello è pubblico — con GitHub Pages sul piano gratuito deve esserlo — e l'archivio finirebbe in vetrina insieme al sito. Per le foto di casa conviene un secondo repository, privato, che serve solo a questo.
2. **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**. Dai accesso a quel solo repository e, sotto *Repository permissions*, metti **Contents: Read and write**. Nient'altro serve.
3. Nell'app: **Nuvola**, riempi proprietario, repository, ramo, cartella e la tua firma, incolla il token, poi **Prova** per vedere se ci arriva.
4. **Salva su GitHub**. Sull'altro dispositivo, stessi campi e **Sostituisci con il repository**.

Il token resta in `localStorage`, su quel dispositivo, e non finisce mai nei file salvati. Vale per il dispositivo che lo tiene: chi se lo prende può scrivere in quel repository, quindi su un computer non tuo meglio non lasciarcelo.

### Cosa scrive

```
dati/
  catalogo.json       le voci della collezione
  liste.json          le liste importate
  matchup.json        il confronto corrente
  schieramenti.json   gli schieramenti salvati
  partite.json        il diario delle battaglie
  scenari.json        gli scenari tuoi
  tavolo.json         il tavolo com'era l'ultima volta
  foto/<id>.jpg       una foto per file, immagini vere
  indice.json         chi ha salvato per ultimo, e quando
```

I JSON sono indentati apposta: il diff di un commit si legge, si vede quale unità è cambiata. Le foto sono file immagine veri, non base64 dentro un JSON, così si aprono cliccandole e un commit che ne cambia una pesa quella e basta.

Un salvataggio è **un commit solo**, non uno per file, e carica solo i file davvero cambiati: la sha di git la calcola l'app prima di parlare con GitHub, quindi salvare dopo una partita spedisce `partite.json` e nient'altro, non trecento foto identiche. Se non è cambiato niente non fa nemmeno il commit.

### In due

Chi salva per secondo si sente dire che *il repository è andato avanti*: qualcun altro ha committato dopo il suo ultimo scambio. La via pulita è **Scarica** e poi salvare. Volendo si insiste, e allora i file cambiati da te sostituiscono i loro — gli altri restano dove sono, perché il commit si appoggia all'albero remoto.

**Scarica** unisce: quello che esiste solo qui rimane. **Sostituisci con il repository** fa invece dell'archivio locale una copia esatta di quello remoto, che è quello che si vuole su un dispositivo nuovo. Tutti e due ricaricano la pagina quando hanno finito.

**Salva da sola** accende un commit qualche minuto dopo l'ultima modifica, quando c'è rete. Al circolo, senza campo, aspetta e basta; se il token è scaduto lo dice una volta e non insiste.

---

## Struttura

```
index.html            guscio, schede, contenitori
styles/app.css        tutto il foglio di stile
manifest.webmanifest  nome, icone, colori dell'app installata
sw.js                 service worker: guscio in cache, app senza rete
icons/                icone PNG, generate da tools/make-icons.mjs
src/
  util.js             quattro funzioni di servizio
  uikit.js            finestre, contatori, etichette: i mattoni condivisi
  suggest.js          la tendina del catalogo sotto un campo nome
  extras.js           marcatori, etichette, contatori, ferite — le primitive generiche
  movement.js         l'ancora, le soglie, e quanto costa arrivare fin lì (ruota compresa)
  zones.js            zone di schieramento disegnate a mano
  bases.js            basette e frontage predefinito per tipo di truppa
  troops.js           i tredici tipi di truppa: modelli per fila, ranghi, Forza d'Unità
  parser.js           lettura dei file New Recruit / BattleScribe
  terrain.js          tipi di elemento scenico, categoria e naturalità
  scenarios.js        scenari, zone di schieramento, geometria
  geom.js             geometria pura: sovrapposizioni, distanze, viste
  store.js            IndexedDB, miniatura e originale delle foto, backup
  sync.js             l'archivio come file di un repository: commit e scaricamento
  syncui.js           la finestra della Nuvola: campi, pulsanti, salvataggio automatico
  bus.js              eventi, per non far importare i moduli fra loro
  history.js          annulla e ripeti, su copie dello stato del tavolo
  view.js             zoom, scorrimento, pizzico, inquadratura
  imgexport.js        il tavolo come PNG, con i colori risolti
  share.js            schieramento dentro un link, compresso
  tactics.js          distanze, linea di vista, ventagli di movimento e tiro
  dice.js             il caso: D6, D3, artiglieria, deviazione, dal generatore del browser
  dicebox.js          il vassoio in tre dimensioni: cubi che rotolano e si fermano sulla faccia uscita
  rules.js            i conti con i dadi: punteggi da fare, ritiri, ranghi, nervi
  effects.js          le caratteristiche con i modificatori attivi e da dove vengono
  armies.js           i file d'esercito: riconoscere una regola e tradurla in dadi
  battlemarch.js      le due tabelle a D6 di Battle March e il controllo degli obiettivi
  combat.js           lo scontro simulato a gruppi e la raffica, senza interfaccia
  duel.js             il pannello dello scontro: dadi in chiaro e perdite
  formation.js        il posto di ogni modello, personaggi uniti, contatti, terreno occupato
  formeditor.js       la finestra in cui la formazione si disegna a mano
  tableshot.js        il tavolo in miniatura, ricostruito da una fotografia di fine turno
  game.js             turni, fasi, perdite, tabellino, registro
  battlelog.js        fotografie di fine turno, punteggio, report in Markdown
  phases.js           le sedici caselle del turno: cosa ci si aspetta in ognuna
  engine.js           il motore: azioni, dadi chiesti, regole in ascolto, registro
  charge.js           la carica: dichiararla, allinearla, e le mosse all'indietro
  melee.js            la mischia: Iniziativa della carica, risultato (anche a più di due),
                      test di rotta, inseguimento
  shoot.js            il tiro: tiratori modello per modello, modificatori, sagome, macchine, Panico
  psych.js            la psicologia: Paura, Terrore, Panico, Stupidità, Frenzy, e chi ne è esente
  magic.js            la magia: generare, lanciare, fiasco, dissolvere, effetti e colpi
  scenariokit.js      scenari propri e generatore di terreno a specchio
  catalog.js          voci di collezione, foto, pittura, aggancio dei nomi
  lists.js            liste salvate, filtri, liste esterne, collegamento unità → catalogo
  palmares.js         come va una lista: giocate, vinte, perse, punti fatti e presi
  prep.js             la scheda di preparazione: quello che il file di New Recruit non dice
  profiles.js         i profili che la lista non porta: il Movimento della cavalcatura, i servitori
  mounts.js           le cavalcature dei personaggi: chi monta cosa, montare e smontare, chi mena sulla bestia
  arbitro.js          l'arbitro senza pagina: stato, mosse legali, dadi, registro
  agente.js           chi gioca quando non c'è nessuno: euristica e modello di linguaggio
  ricerca.js          chi guarda una mossa avanti: cariche come assegnazione, mosse provate su una copia
  minacce.js          dove ti possono caricare: la dichiarazione di p. 119 fatta da ogni nemico, e la griglia
  controai.js         la sfida sul tavolo: tu contro l'AI, con l'arbitro in mezzo
  spiega.js           il perché di un tiro: dalla riga del registro alla scheda, per la sfida e per la pagina da guardare
  matchup.js          disponibilità, confronto, schieramenti salvati
  laboratorio.js      le liste cercate a macchina e il torneo fra loro: chi batte chi, scenario per scenario
  reports.js          archivio delle partite e scheda Partite
  deploy.js           stato del tavolo, pannelli, campo di battaglia
  main.js             avvio, schede, registrazione del service worker
test/
  smoke.mjs           catalogo, aggancio, import, copertura, pittura
  battle.mjs          punteggi, dadi, ventagli e ombre, senza pagina
  regole.mjs          tipi di truppa, ritiri, archi, effetti, terreno, file d'esercito, nessuna regola ignota
  motore.mjs          le sedici caselle, le azioni, i dadi chiesti, il registro
  movimento.mjs       carica: arco, vista, distanza, reazioni, allineamento, fuga
  mischia.mjs         bonus della carica, risultato, i tre esiti del test di rotta, la sfida e l'overkill, regole d'esercito
  tiro.mjs            tiratori per modello, modificatori, sagome, deviazione, cannone, Panico
  psicologia.mjs      Paura, Terrore, Panico e le sue cause, Stupidità, Frenzy, Warband, il contatore
  cavalcature.mjs     personaggi montati: opzioni del libro, profilo sommato, file già montati, mischia, liste rinominate
  magia.mjs           domini, generazione, lancio, fiasco, dissolvimento, effetti, gittata dal profilo
  dadi.mjs            il generatore, e la faccia su cui il cubo si ferma
  vittoria.mjs        punti vittoria, verdetto, durata, punto di rottura
  liste.mjs           il palmarès di una lista, i filtri dell'elenco, le liste esterne
  arbitro.mjs         una partita intera senza pagina, e chi la gioca; chi comincia; i campi di ogni gesto
  statistica.mjs      Wilson, regressioni, restringimento, Benjamini-Hochberg, su dati di cui si sa la risposta
  serie.mjs           lo specchio, la stessa lista contro se stessa, i dadi per gesto, l'esperimento
  minacce.mjs         le minacce di carica, lo scontro atteso, il gioco delle distanze
  ricerca.mjs         la copia della partita, il valore di una posizione, chi guarda avanti
  sync.mjs            archivio su GitHub, contro un GitHub finto in memoria
  spiega.mjs          le schede del perché, e partite intere in cui ogni scheda deve tornare con i suoi conti
  boot.mjs            la pagina intera: schede, annulla, zoom, partita, report, link
tools/
  make-icons.mjs      scrive i PNG del manifest senza dipendenze
  partita.mjs         una partita intera dalla lista al verdetto, commentata
  prova-chiave.mjs    una domanda sola al modello, per sapere se la chiave funziona
  replay.mjs          la stessa partita da guardare: una pagina sola, con la barra del tempo
  heatmap.mjs         la mappa di tante partite: per ogni unità dove parte, dove sta, combatte e muore
  serie.mjs           tante partite: lo specchio, i conti, quali piani contano, l'esperimento
  statistica.mjs      i conti di un campione: Wilson, regressioni, restringimento, Benjamini-Hochberg
  liste/unita.mjs     le unità scritte a mano per provare liste: Skaven, Orchi & Goblin, Lucertole, con i punti del libro
  liste/gioca.mjs     una serie a specchio fra due liste, anche candidate, e che fine fa ogni unità
  liste/valuta.mjs    tante candidate contro tante liste su più scenari, in parallelo
  liste/salva.mjs     la candidata scelta, in dati/liste.json
  liste/esempi.mjs    le liste da 800 punti cercate così, e le alternative
  liste/spazio.mjs    le liste che si possono scrivere: unità, opzioni, vincoli, collezione
  liste/cerca.mjs     la ricerca a generazioni, per fazione, con tutte le unità o con la collezione
  liste/torneo.mjs    le liste trovate tutte contro tutte, scenario per scenario
  liste/motore.mjs    i lavoratori che giocano le serie senza rilanciare un processo ogni volta
  liste/ricerche.mjs  i file di dati/ricerche/ e il loro indice
dati/
  eserciti/           un file per esercito: regole, oggetti, domini
  profili.json        i profili letti sul libro: cavalcature, servitori, liste scritte a mano
```

Le quattro primitive generiche stanno in moduli loro perché non sanno niente del tavolo e non devono saperlo: `extras.js` non ha DOM, `movement.js` non ha stato, `zones.js` risponde a una domanda sola. `uikit.js` c'è perché tre pannelli diversi avevano bisogno delle stesse quattro cose — una finestra, i contatori, le etichette, una fila di scorciatoie — e perché `prompt()` e `confirm()` non si usano più da nessuna parte: sul telefono coprono lo schermo, in un'app installata hanno l'aria di un errore, e proprio dove servono davvero (annotare mentre giochi) erano il gesto sbagliato.

`deploy.js` resta il modulo grosso perché stato, pannelli e disegno del campo sono davvero un blocco solo. Quello che se n'è potuto staccare è uscito: la geometria (`geom.js`) perché ora la usano anche gli aiuti tattici e il generatore di terreno; la storia, la vista, la partita e gli scenari propri perché non hanno bisogno di sapere niente del tavolo — ricevono dei callback e basta, così la dipendenza va in una direzione sola e non si formano cicli.

### Prove

```bash
npm install
npm test
```

Girano in jsdom con IndexedDB finto, senza browser. `battle.mjs` non ne ha bisogno affatto: prova i conti da solo — i punteggi da fare, che quattromila dadi a 4+ diano circa metà successi, che due dadi di carica tenendo il maggiore facciano in media 4,5 e non 7, che il passo lungo ne aggiunga uno intero, che nel terreno si tenga il peggiore, che il ventaglio si accorci nel bosco e si fermi contro l'impassabile aggirandolo di lato, che dietro un monolite qualche raggio si spenga e di fianco no. `sync.mjs` monta un GitHub finto in memoria — blob, alberi, commit e un ramo — e ci fa sopra il giro completo: salvataggio, secondo salvataggio che non commette niente perché non è cambiato niente, un file cambiato che ne carica uno solo, una foto cancellata che sparisce anche di là, il conflitto quando il ramo si è mosso, e lo scaricamento su un archivio vuoto con le foto che tornano identiche al bit. Controlla anche che la sha calcolata in casa sia quella vera di git. `boot.mjs` avvia davvero la pagina intera e poi la usa: annulla e ripeti, zoom, distanze misurate dal bordo, ventaglio di movimento, campo di tiro con un bosco piantato in mezzo per veder sparire la linea di vista, uno scontro tirato finché qualcuno cade e le sue perdite riportate sul tavolo, righelli, una partita con perdite e unità distrutta, la chiusura di due turni con il movimento misurato in pollici, l'archiviazione del battle report e il suo testo in Markdown, una partita scritta a mano a partire da una lista, terreno casuale (verificando che sia specchiato e che nessun tesoro finisca sotto i 3″), salvataggio di uno scenario proprio, andata e ritorno del link condiviso, serializzazione del PNG e la finestra della Nuvola con le sue impostazioni.

Sui dadi le prove sono due, e separate. In `battle.mjs`, senza pagina: che ogni faccia grezza diventi il valore giusto sui quattro dadi, che i due Colpito! stiano su facce opposte come sul dado vero, che il Colpito fermi l'oggetto e la freccia lo sposti dei pollici tirati, che il Mancato Colpo blocchi tutto, e che quarantottomila D6 diano sei mucchi che si somigliano. In `boot.mjs`, sulla pagina vera: che otto D6 siano otto cubi da sei facce, che **ogni cubo si fermi girato in modo da mostrare proprio la faccia uscita**, che i dadi accesi siano quelli che hanno passato il punteggio, e che **mentre i dadi rotolano il risultato non sia ancora scritto**.

`movimento.mjs` prova la carica dove la carica è scritta, senza tavolo: che un tiro di sei riesca undici volte su trentasei contando le facce; che quello che sta dietro non si carichi e che un bosco in mezzo tolga la vista anche alla dichiarazione; che il *tira e tieni* si spenga sotto il Movimento del caricante; che dei due dadi si tenga il maggiore, il peggiore nel terreno difficile, e che il terzo dado del passo lungo si sommi invece di entrare nella scelta; che la **carica disordinata** e il **disordine da terreno** restino due regole diverse, perché costano bonus diversi; che il caricante si fermi a filo sulla faccia **da cui è venuto** e non su quella più vicina; che chi scappa vada via dal nemico più grosso, e in diagonale quando i più grossi sono due.

Prova anche le cose nuove dove si vedono davvero: che i cerchi del movimento restino **fermi sull'ancora** invece di seguire il pezzo e che la riga scriva `4.0″ di 8″`; che una ferita non tolga un modello finché non lo dici tu; che il caricante si appoggi a filo e arrivi dritto anche se lo trascinavi storto; che una zona disegnata a mano faccia risultare *fuori zona* un'unità che lo scenario considerava a posto; che marcatori, zone, etichette e ferite sopravvivano al link condiviso e finiscano nel report. `smoke.mjs` prova a parte i moduli senza DOM, dove le regole di conversione si leggono in una riga.

---

## Limiti noti

- L'aggancio automatico è volutamente prudente: se ha un dubbio non decide e chiede. Meglio una spunta gialla che un conteggio sbagliato in silenzio.
- Le anteprime per modello si fermano a 60 per riga; oltre compare `+N`.
- La sincronia su GitHub la lanci tu (o il salvataggio automatico dopo qualche minuto di calma): non è continua e non fonde due modifiche fatte insieme allo stesso file. Chi salva per secondo sceglie se scaricare prima o passare sopra. Per due fratelli che giocano a turno va bene; per una squadra no.
- Senza Nuvola i dati restano legati a quel browser: c'è il backup manuale e il link dello schieramento. Il link porta le posizioni, non la collezione: catalogo e foto restano dove sono.
- Di **«Weapon of War»** (p. 197) l'arbitro applica quello che toglie — niente marcia, niente carica, niente inseguimento, −1 al tiro di fuga — e il giro gratis; quello che non gli dà è il giro che **non conta come essersi mossa**, che per un'arma «o si muove o tira» è la differenza fra sparare e non sparare, e il **profilo diviso** macchina/equipaggio (p. 97): il libro vuole la Resistenza e le Ferite dell'equipaggio in combattimento e quelle della macchina fuori, e l'app tiene una riga sola. La **linea** del Warp Lightning Cannon l'arbitro la punta su un nemico che vede, e sull'*Energy Overload* la rigira senza ritirarne la lunghezza: il libro non dice né l'una cosa né l'altra.
- Le **macchine da guerra** l'arbitro le spara a **Bombardata** (pp. 224-226) e non negli altri quattro modi che il libro ha: la palla di cannone che rimbalza con il suo «Crunch», la grappola, l'organo e il lanciafiamme vogliono ognuno la loro procedura, e la palla vuole anche la linea che attraversa il tavolo. Il **tiro indiretto** — niente linea di vista, e una deviazione ridotta dell'Abilità Balistica dell'equipaggio (p. 225) — è una scelta che si dichiara prima di sparare, e l'arbitro non la offre: spara sempre a vista. **«Multiple Wounds»** (p. 175) invece si tira, in mischia, al tiro e sotto il buco della sagoma: ogni ferita non salvata tira il suo dado e cade su un modello solo, senza passare al vicino. Nel risultato del combattimento contano le ferite perse; l'eccesso conta solo per l'overkill di un personaggio. E vale per tutte le ferite, con la regola o senza: nel risultato entrano quelle **perse** (p. 152), e otto ferite su un'unità da due modelli valgono due punti.
- La modalità partita **non arbitra**: tiene il conto di turni, caselle e perdite, dice cosa ci si aspetta adesso, e non impedisce niente. Le decisioni restano ai due giocatori, come al tavolo. L'arbitro vero c'è ma vive fuori dalla pagina (`src/arbitro.js`, vedi *Una partita giocata dall'app*): gioca un turno più corto — niente sotto-fase di comando, niente sagome — e dichiara ogni semplificazione nel registro; quelle che valgono per tutta la partita le dice a fine schieramento, se le liste le toccano. La **Sfida** della scheda Matchup lo porta sul tavolo. E gioca le regole che il file porta: l'export di New Recruit perde quelle d'esercito (Cold Blooded dei Lizardmen, Stupidity e Regeneration dei Troll), e allora non ci sono.
- Il vassoio dei dadi **non sa cosa stai tirando**: quanti dadi, che dado e che punteggio serve lo dici tu, e i modificatori li fai in testa come al tavolo — con le *Tabelle* aperte accanto. Tira, mostra e scrive quello che è uscito — il resto è ancora una decisione dei giocatori.
- Il punteggio è **mezzo automatico**, con le voci del libro (p. 286; Battle March p. 27): l'app somma quello che vede sul tavolo — distrutte o fuggite dal tavolo 100%, in fuga a fine partita 50%, sotto un quarto della Forza d'Unità 25% — e gli obiettivi tenuti a ogni fine turno, e lascia a te generale, portastendardo e stendardi presi. Il verdetto è quello del libro: cento punti di scarto per vincere, il doppio per stravincere; in Battle March basta averne di più. Le mappe di schieramento con cerchi e cunei si disegnano ancora a mano.
- Il *mosso* di un'unità è lo spostamento **netto** fra due fotografie: chi avanza e poi ripiega risulta fermo. Il **costo** invece tiene conto della ruota, e non è la stessa cosa — il fronte in gradi c'è, ed è lì che si legge, e il *Fantasma* fa vedere il resto.
- Il costo del movimento decompone lo spostamento in **una manovra sola più una corsa** (ruota, poi avanti; oppure indietro; oppure di lato), che è il gesto del tavolo e non l'unico possibile: chi ruota due volte in mezzo a un movimento paga di più di quanto l'app scrive. E la ruota vera, che fa perno su uno spigolo, sposta anche il pezzo: qui è contata come un arco e poi come una corsa, che è il modo in cui la si misura al tavolo. Si scavalca come tutto il resto.
- Le soglie di movimento vengono dal manuale (marcia `M×2`, carica `M` più il maggiore di due D6), ma restano **una stima disegnata**: M si corregge a mano quando il roster sbaglia o quando una regola lo cambia.
- Le ferite e le etichette l'app le **conta e le scrive**, non le interpreta: nessuna ferita fa cadere un modello da sola, nessuna etichetta cambia il comportamento di niente.
- Il registro dei turni si scrive quando premi *Chiudi il turno*: se te ne dimentichi due, quei due turni nel report non esistono. È un diario, non un arbitro che guarda.
- Lo **scontro simulato** è una stima, non un arbitro. Conosce quello che sta nel profilo e i numeri che imposti a mano; non sa niente di oggetti magici e terrore. Le regole speciali che non applica non spariscono: restano in elenco, e dove la lista porta con sé il testo del manuale l'etichetta lo mostra per intero, così quella regola la applicate voi. Quanti modelli si toccano lo **conta sulle basette** quando le unità sono sul tavolo, e lo dichiara quando invece lo stima — e conta a parte i personaggi, perché un capo in mezzo a una fila che sfiora il nemico con lo spigolo può benissimo non toccare niente, e in quel caso il pannello scrive che non mena invece di farlo sparire; quanti colpi porta l'urto della carica resta un ordine di grandezza. Il campo *Attacchi* è modificabile, e vale sulla truppa: i personaggi uniti hanno una riga loro.
- **Su chi dirigere i colpi** resta ai giocatori. La regola la applica l'app — un personaggio unito lo colpisce solo chi ci dirige i colpi, e le ferite non tracimano (p. 209) — ma quanti colpi mandare sul capo invece che sulla truppa è una scelta: nel riquadro del personaggio c'è la casella, e senza un numero l'app ne manda quanti ne porta un modello solo, che è il campione che al tavolo si fa avanti.
- Il **campo di tiro** disegnato guarda dal centro del fronte; il conto dei tiratori invece misura modello per modello, e il riparo lo conta sui modelli coperti come dice il libro (p. 139). La copertura di partenza la propone il tipo di elemento scenico — bosco leggera, rovine e muretti pesante — e il pezzo posato sul tavolo la può dichiarare diversa.
- Il **ventaglio di movimento** non fa ruotare l'unità: mostra dove arriva andando avanti nel proprio arco frontale, che è il caso normale. Il costo della ruota lo scrive l'ispettore, che la conta.
- Il *tira e tieni* apre la reazione senza tirare la raffica: quella si tira dal pannello del tiro. Il ripiegamento in ordine dice da sé che i suoi dadi vanno confrontati con il libro.
- Le **due tabelle del Mancato Colpo** (p. 347) sono vuote: l'app tira il D6 e dice dove leggere, non cosa succede. Sono dichiarati da verificare anche il secondo punteggio dell'Abilità Balistica alta e le due larghezze della goccia. Il **cannone** è scritto nel motore ma non ha ancora un pulsante sul tavolo, e *Quick Shot* non aggiunge tiri finché non si sa quanti.
- Il magnetismo aggancia solo unità con lo **stesso orientamento**: allineare un reggimento a uno girato di 45° resta lavoro a mano.
- La linea di vista del pannello e dell'arbitro è quella del libro (`sight.js`): unità in mezzo che fanno da schermo (p. 103), penombra del bosco (p. 270), collina che vede oltre e che taglia la vista oltre la cresta (p. 272), riparo contato sui modelli (p. 139). Le **linee tratteggiate disegnate sul tavolo** — distanze e campo di tiro — restano invece l'indicazione grossolana di prima: guardano dal centro del fronte i soli elementi che il tipo dichiara bloccanti, e non conoscono le colline né le unità in mezzo. Quando le due cose non dicono lo stesso, vale quella del pannello.
- L'allineamento della carica è una **proposta**: il pezzo finisce a filo del lato toccato, scorrendo lungo quel lato per portare più modelli a contatto, e poi si trascina a mano. Al millimetro decidono le miniature.
- Il terreno casuale è a specchio per costruzione: è la scelta più difendibile al circolo, ma non riproduce le mappe asimmetriche di uno scenario scritto.
- Il motore delle fasi sa cosa ci si aspetta in ogni casella, e per il movimento sa anche cosa dice il manuale: se vedi il bersaglio, se ce l'hai davanti, se ci arrivi, cosa può rispondere chi la subisce. **Non impedisce niente**: un'azione fuori casella o una carica fuori regola passano lo stesso, con la nota del perché. Della magia il motore conosce ancora solo il momento in cui succede.
- Il **costo della ruota** sul tavolo si calcola e si scrive, ma non si scala da un budget di movimento: la carica lo usa per dire quanto serve, il trascinamento no. L'arbitro invece lo scala (vedi *Le manovre si pagano*): ruota una volta sola, all'inizio, girando sul centro, e poi va dritto; chi riordina le file non cammina la metà che gli resta, e la riforma tiene il fronte che aveva. La formazione **Open Order** il parser la legge come sciolta: i Warplock Jezzails si girano gratis e hanno l'arco a 360°, mentre il libro (p. 183) li vuole in ranghi con un giro rapido di 90° dopo essersi mossi. E il *tira e tieni* apre la reazione senza tirare la raffica, che si tira dal pannello del tiro.
- La tabella dei **tipi di truppa** (p. 105) ha tredici righe e la colonna della Forza d'Unità è confrontata con le dieci liste salvate: sei tipi su tredici hanno un esempio vero che la conferma. Le celle senza esempio l'app le usa lo stesso e le dichiara — nell'ispettore compare *cella da verificare*. Quando il file della lista dichiara la Forza d'Unità vince il file, sempre.
- Le due tabelle a D6 di **Battle March** — Terreno Selvaggio e Caso della Guerra — tirano e dicono cos'è uscito, ma l'abbinamento fra la faccia del dado e l'esito **non è confrontato con il libro**: i sei esiti stanno nell'ordine in cui il piano li elenca, e l'app lo scrive ogni volta che tira. Con il libro aperto si corregge cambiando una riga di `battlemarch.js`.
- Il **profilo diviso** cavaliere/cavalcatura: il file di New Recruit esporta una riga sola, e per chi va a cavallo quella riga ha il Movimento a «-» — esattamente come sul libro, dove il Movimento è della cavalcatura. Le righe che mancano stanno in `dati/profili.json`, lette sul libro con la pagina accanto: ventitré unità delle liste salvate non sapevano muoversi, e adesso non ne resta nessuna. Quello che quel file **non** recupera è il resto del profilo diviso — un carro mena con i suoi servitori e non con i cinghiali, un Bastiladon con i suoi tre attacchi e non con quelli degli skink: l'app tiene un profilo per modello, e dove quella semplificazione costa qualcosa il file lo scrive in `notaRighe`. Fanno eccezione i **personaggi montati** dalla tendina *Cavalcatura*, che portano tutte le righe del libro e menano con ognuna; un reggimento di cavalleria invece mena ancora con la sola riga del cavaliere. Sulla cavalcatura restano semplificati: la coda velenosa della viverna (i tre attacchi si tirano tutti con gli artigli), il Venom surge dell'Arachnarok, le armi a scelta (giant blowpipes, spidersilk lobber) che si correggono a mano, e la speciale 5+ della campana, che vale solo contro gli attacchi non magici e l'app conta sempre.
- Una **lista senza profili** — scritta a mano nella scheda, con nome e punti e niente altro — non si può simulare: era il modo peggiore di sbagliare che questo archivio conoscesse, perché l'app la giocava lo stesso e usciva zero contro zero, cento per cento di pareggi, nessun avviso. Adesso la scheda di preparazione lo dice in rosso, unità per unità, e dove il libro ha quel profilo `dati/profili.json` lo riempie.
- La **magia dell'arbitro** offre solo gli incantesimi che l'app sa applicare da sola — colpi con i loro dadi, modifiche alle caratteristiche, bandierine come *non marcia* —: vortici, trasporti, sagome e linee restano testo da leggere sul libro, e un mago che conosce solo quelli non lancia. Il **Livello** che il file non dice è quello di base del libro: un Livello comprato come opzione si scrive nella scheda di preparazione, altrimenti non si vede. Gli **assalti** si lanciano prima che il combattimento cominci, non al passo d'Iniziativa del mago (p. 158), e le loro ferite non entrano nel risultato. Il **fiasco** con la sagoma colpisce solo il mago. E il divieto di lanciare con l'armatura (p. 111) non si applica: la pelle callosa degli Skink Priest conta come armatura leggera, e finché una FAQ non lo chiarisce l'app li lascia lanciare. Tutto questo esce nel registro la prima volta che conta.
- **Le sfide** (pp. 211-212) le lanciano e le raccolgono solo i **personaggi**: il libro dice «un personaggio o un campione», ma il file di New Recruit segna soltanto che il gruppo di comando c'è e al campione non dà un profilo suo — senza profilo non si può duellare. Chi **si ritira** dopo averla rifiutata esce dal combattimento e smette di dare all'unità Comando e regole speciali, come dice il libro; il passo e la Forza d'Unità del reggimento invece glieli lascia, perché toglierli vorrebbe dire farlo uscire dal reggimento, e il libro non lo fa uscire. Tutte e due le cose escono nel registro la prima volta che contano.
- **Personaggi e psicologia nell'arbitro.** Un personaggio a piedi entra solo nella fanteria e uno a cavallo solo nella cavalleria: il libro dice «salvo che il tipo di truppa lo impedisca» senza fare l'elenco, e questa è la lettura dell'app. Un personaggio da solo si bersaglia sempre e non schiva l'inseguimento (p. 206). Chi fallisce la Paura in un combattimento con più nemici ha −1 per colpire contro tutti, non solo contro chi fa Paura. La Stupidità è quella del testo che le liste portano, che non è quella stampata a p. 178 del Core Rulebook. Chi è frenetico o impetuoso non è obbligato a caricare.
- **L'Hell Pit Abomination nell'arbitro**: il Movimento tirato (*Random Movement*, p. 176) si fa tutto, senza marcia né carica dichiarata, e se arriva a contatto conta come carica; gli *Abominable Attacks* (nutrirsi o la valanga di carne) si scelgono prima del combattimento e si risolvono prima che si meni, non al passo d'Iniziativa dell'Abominio. Nel pannello del tavolo si giocano ancora a mano, e *Too Horrible To Die* e *Timmm-berrr!* restano testo.
- **Gli Attacchi che si tirano** (*Random Attacks*, p. 176): la mischia li tira a ogni assalto, un dado per modello che mena, e la previsione conta la media — l'Hell Pit Abomination con «D6+1» mena da 2 a 7 attacchi, non più sei sempre. Resta al primo numero della riga la fila di un equipaggio o di una cavalcatura (i ratti «Rats only» della Doom-Wheel), che nessuna lista salvata schiera. La **Magic Resistance** (p. 108) si sottrae al tiro di lancio degli incantesimi nemici, il −X più alto dell'unità e dei capi che ci stanno dentro — nel pannello, nell'arbitro e nella probabilità che l'arbitro offre. La «Magia residua» del terreno selvaggio di Battle March resta testo.
- La **sfida contro l'AI** vive nella scheda: ricaricando la pagina si perde. Le mosse si scelgono dall'elenco dell'arbitro e non trascinando i pezzi.
- Il parser legge quello che New Recruit esporta. Se una lista arriva con basette insolite le stima dal tipo di truppa, e le puoi correggere a mano nell'ispettore.

## Licenza

Codice sotto licenza MIT — vedi [LICENSE](LICENSE).

Warhammer, The Old World e i nomi di fazioni e unità appartengono a Games Workshop Limited. Il progetto non è affiliato né approvato da GW, non riproduce testi, tabelle o profili tratti dalle loro pubblicazioni e non distribuisce immagini dei loro prodotti. Le statistiche che vedi nell'app sono quelle contenute nei file che importi tu; gli aiuti tattici e lo scontro simulato le mettono in relazione con dei conti scritti come conti — uno scarto fra due caratteristiche, un numero da eguagliare o superare — e non come tabelle copiate. Le foto che carichi nel catalogo restano sul tuo dispositivo.
