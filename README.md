# Schieramento Old World

Quattro cose che si tengono per mano, per **Warhammer: The Old World**:

**Il principio che tiene insieme tutto.** L'app sa **geometria, quantità e memoria**. Non sa mai **legalità**. I dadi li tira — con il generatore vero del browser, e mostrando ogni faccia uscita — ma non sa se una carica è legale, non decide chi ha ragione e non conosce la composizione di nessuna lista: quelle sono le cose che il manuale può cambiare, e su cui l'app comincerebbe a discutere coi giocatori. Sa dove stanno i pezzi, quanti sono e com'erano tre turni fa.

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

Poi tocca il riquadro della foto e carica un'immagine delle tue miniature dipinte. Viene ridotta a un quadrato da 256 px (~15 KB) prima di essere salvata: le foto da telefono così come sono riempirebbero la quota in poche decine di scatti.

Perché per tipo e non per singola miniatura: i tuoi 24 Orc Boyz sono un mob da 25 in una lista e due mob da 12 in un'altra. L'unico conteggio che regge sotto queste condizioni è *tipo + quantità*.

Il campo **dipinte** serve alla domanda che ci si fa davvero prima di un torneo, che non è "ce le ho?" ma "sono finite?". In cima al catalogo c'è la percentuale sull'intera collezione; nel matchup diventa *quante ne restano da dipingere per giocare proprio questa lista* — contando solo quelle che possiedi già, perché quelle che non hai sono un problema diverso e stanno nella riga dello scoperto.

### 2. Le liste: importate o scritte

Scheda **Liste** → *Importa da New Recruit*. Accetta i `.json` e i `.ros`.

Oppure *Nuova lista a mano*, che non è un ripiego: al circolo l'avversario arriva con la lista **stampata**, o scritta a mano, o sul telefono in un formato che non è il tuo, e in quel momento un'app che sa leggere solo i file non serve a niente. Bastano nome, modelli, punti e basetta; profilo, regole e armi sono facoltativi dappertutto e senza di loro l'app disegna e conta lo stesso. Ogni riga di ogni lista — anche di una importata — si corregge lì sul posto, e *Duplica* fa la variante da ritoccare senza toccare l'originale.

Mentre scrivi il nome, il catalogo si propone da solo: bastano due o tre lettere e sotto il campo compaiono le voci che hai in collezione, con la foto, la fazione e quante ne possiedi. Sceglierne una scrive il nome per intero, porta con sé la basetta di quel tipo e lascia l'unità già agganciata — che è il modo più corto per non ritrovarsi dopo con metà lista *da agganciare* per via di un nome battuto storto. Vale anche sul nome di un'unità già in lista: correggerlo dalla tendina la riaggancia. Con le frecce si scorre, con Invio si sceglie, e se il nome che ti serve non è in collezione continui a scrivere e la tendina sparisce.

Lo stesso vale sul tavolo: *+ Unità a mano* sotto ciascun esercito mette un reggimento in campo senza passare da nessun file.

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

**Personaggi dentro le unità.** Dentro un reggimento ci va quello che al tavolo ci starebbe: i personaggi che il roster dichiara tali, e comunque **ogni unità da un modello solo** — il boss senza slot, il pezzo comprato a parte, la bestia da compagnia — che nell'elenco compare marcata *1 modello*. La spunta nell'ispettore ha l'ultima parola. Si uniscono da tutte e due le parti: sulla scheda del reggimento la tendina *Unisci un personaggio o un modello singolo*, su quella del personaggio la tendina *Unisci questa a un reggimento*, e la stessa cosa dall'editor della formazione. Un pezzo che ne ospita già un altro non si infila da nessuna parte: prima si sgancia chi ha dentro. Quando una tendina resta vuota l'ispettore scrive chi ha lasciato fuori e perché, invece di sparire. Da quel momento non è più un pezzo suo: prende una casella dentro la formazione (trascina la base con la stella per cambiargliela), si muove col reggimento e nel report risulta dov'è il reggimento. *Sgancia* lo rimette sul tavolo di fianco.

**Di quanto mi sto muovendo.** È la domanda del turno, e prima l'app rispondeva male: i cerchi del movimento erano disegnati attorno all'unità, quindi la seguivano, e la risposta spariva proprio mentre la trascinavi.

Adesso c'è l'**ancora**. Il punto da cui l'unità è partita in questo turno resta segnato sul tavolo con la sagoma di dov'era, e i quattro cerchi — *movimento*, *marcia*, *carica media*, *carica massima* — stanno **fermi lì**, non addosso al pezzo. Mentre trascini, una riga fra il punto di partenza e adesso dice **quanti pollici hai fatto**, su quanti ne hai: `4.2″ di 8″ · restano 3.8″`. Il numero è verde dentro il movimento, ambra dentro la marcia o la carica, rosso oltre tutto — un semaforo, non un arbitro: l'unità si muove lo stesso e nessuno ti ferma.

L'ancora si mette da sola al primo spostamento, e si azzera a ogni *Chiudi il turno*: il turno nuovo riparte da dove sei arrivato. *Riparti da qui* nell'ispettore e il tasto ⚓ nel menu *Aiuti* la rimettono a mano, una o tutte. La levetta **Ancora di movimento**, nel menu *Aiuti*, la spegne.

Le tre soglie sono la convenzione dell'app, dichiarata e basta: marcia `M×2`, carica media `M+7`, carica massima `M+12`. Il valore di **M** si legge dal profilo e si corregge a mano nell'ispettore quando il roster sbaglia, o quando una regola lo cambia: l'app non sa perché è cambiato, sa disegnare il cerchio giusto.

**Il fantasma.** La levetta *Fantasma* disegna sotto le unità dov'erano nell'ultima fotografia di fine turno. È l'unico modo di **vedere** una ruota sul posto, che il «mosso» netto per costruzione racconta come zero.

**Aiuti tattici.** *Distanze* misura dal **bordo** verso ogni nemico, come si misura davvero, e segna tratteggiate le linee che un bosco o un monolite interrompono. *Archi* disegna l'arco frontale e la portata di carica. *Raggi* mostra la gittata di tiro, e quella sì che segue l'unità: si misura da dove sei adesso.

**Righelli e sagome.** *Misura*, due clic, e la misura **resta** sul tavolo; se ne tengono fino a otto. Il tasto `⌫` accanto le toglie tutte.

*+ Sagoma* aggiunge l'altra metà di quello che c'è fisicamente su un tavolo: un cerchio, o un rettangolo, da appoggiare **sopra** i modelli. Il raggio lo scegli tu, la sagoma resta dove la metti e si trascina come tutto il resto. Selezionandola, l'ispettore dice **quanti modelli ci stanno sotto**, unità per unità. Cosa significhi poi lo sanno i giocatori: l'app conta e basta.

**Marcatori.** *+ Marcatore* mette sul tavolo un pezzo che non è né unità né terreno, con **testo libero** e un colore. È il jolly, ed è fatto apposta per coprire quello che non abbiamo previsto: obiettivi che non siano il tesoro Battle March, segnalini magici, l'area di un incantesimo che resta in gioco, il punto da cui arrivano i rinforzi, il quarto di tavolo conteso, «qui è caduto il portastendardo». L'etichetta la leggi tu; l'app non la interpreta mai, la disegna, la salva, la mette nel link e la scrive nel report.

**Zone disegnate a mano.** Gli scenari conoscono cinque disposizioni, e per la sesta non c'era niente da fare. *Disegna una zona*, poi trascini il rettangolo sul tavolo e dici di chi è: dell'Esercito A, di B, di tutti e due, area vietata, o solo un promemoria. Quando ce n'è almeno una, **sostituiscono** quelle calcolate dallo scenario, e i controlli di legalità (dentro o fuori zona) guardano le tue. *Salva come scenario* se le porta dietro, insieme al terreno e ai marcatori: da lì in poi qualsiasi scenario — di un libro, di un torneo, inventato al circolo — è rappresentabile senza che l'app ne sappia niente.

**Movimento.** Le statistiche che arrivano dalle liste New Recruit non servono solo a riempire l'ispettore. *Movimento* disegna quattro ventagli — passo, marcia, carica media, carica massima — e li disegna **dove il passo porta davvero**: un cerchio dice che hai 4″, un ventaglio dice che quei 4″ nel bosco diventano 2 e contro la piramide diventano zero. Il terreno difficile costa il doppio, l'impassabile ferma, il bordo del tavolo ferma, e chi vola passa sopra a tutto. Il passo lungo (*Swiftstride*, cavalleria veloce) porta la carica media da M+7 a M+8,5: mezzo pollice, cioè la differenza fra arrivare e non arrivare.

**Tiro.** *Tiro* prende l'arma più lunga del profilo e disegna il **campo di fuoco con le ombre**: un raggio ogni pochi gradi, e dove incontra un bosco o un monolite il raggio finisce lì. Quello che resta chiaro è il cono che si copre davvero; le rientranze sono i posti in cui il nemico si mette per non farsi vedere. La fascia interna è la gittata corta, oltre la metà si tira con il −1. Su ogni nemico compare il **punteggio per colpire** e quanti modelli cadrebbero in media, e chi non si può bersagliare dice perché: *non lo vedo*, *fuori arco*, *fuori gittata*. L'ispettore ripete le stesse righe scrivendo i modificatori uno per uno — lunga gittata, copertura leggera o pesante, bersaglio in formazione sciolta — così si vede *perché* serve un 5.

**La carica, giocata.** Sotto il tiro, nell'ispettore, c'è la riga della carica: per ogni nemico quanto è lontano, cosa serve tirare e **quante volte su cento arriva** — la probabilità è contata sulle facce dei dadi, non stimata. Chi non si può caricare dice perché: *non è nell'arco frontale*, *la vista è tagliata dal bosco*, *sono quattordici pollici e la carica arriva al massimo a sedici*. Accanto c'è la bandierina, e la bandierina gioca la carica per intero, nell'ordine del manuale: si dichiara, il bersaglio sceglie la reazione — tenere, tirare e tenere, fuggire, con il *tira e tieni* spento quando il caricante è già più vicino del proprio Movimento — si tira dal vassoio con i dadi che quella carica vuole (tre scartando il minore col passo lungo, uno in più scartando il maggiore nel terreno difficile), e chi arriva **si mette a filo da solo** sulla faccia da cui è venuto. Se la carica resta corta, l'unità avanza di quello che i dadi hanno detto e si scosta da sola per non finire entro un pollice da un nemico. Ogni passo è una riga di registro e ogni passo si annulla da solo.

**Le quattro mosse all'indietro.** Quando c'è un nemico vicino compaiono quattro pulsanti: *cede 2″*, *ripiega*, *fugge*, *insegue*. Sono la stessa geometria vista quattro volte — lontano dal nemico con la Forza d'Unità più alta, in diagonale quando i più grossi sono due — e l'app la misura invece di farla stimare a occhio. Il cedimento non chiede nemmeno i dadi: sono due pollici fissi. Chi fugge gira le spalle, chi cede terreno e chi ripiega restano girati verso il nemico.

**Scontro simulato.** Accanto a ogni nemico vicino, nell'ispettore, c'è una spada. Apre un pannello con le due schiere a confronto: profili, quanti modelli si toccano, armatura e salvezza speciale, stendardo, chi ha caricato, se si colpisce di fronte, di fianco o di retro.

- *Tira i dadi* fa **un assalto** e mostra **ogni faccia uscita**: per colpire, per ferire, per salvare. Si mena in ordine di Iniziativa — chi è più svelto toglie modelli prima che gli altri rispondano — e chi carica con l'urto lo porta prima di tutto. Poi il conto di fine assalto (ferite, ranghi, stendardo, chi è in più, il fianco) e il test di Comando di chi ha perso.
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
- **Quello che questa casella si aspetta** — sotto la riga ci sono le azioni della casella: *dichiarazione di carica*, *reazione alla carica*, *test di rotta*, *raduno*. Si premono invece di scriverle. Se servono dei dadi si apre il vassoio già impostato — due D6 per la carica, tre per chi ha il passo lungo — e quello che rotola torna dentro da solo: la riga di registro dice chi, cosa, contro chi, con quali facce e in quale casella. Dove serve un bersaglio c'è la tendina delle unità in campo, il nemico per primo. **Un'azione fuori casella passa lo stesso**, con la nota di dove starebbe di casa: l'app propone, non impedisce.
- **Perdite** — in tre posti: l'ispettore dell'unità, la lista *Perdite* del pannello (tutte le unità in fila, meno due clic per segnare un tiro di archi) e l'editor della formazione, dove si clicca **quale** modello è caduto. Tolti i modelli il reggimento **perde i ranghi di dietro e sul tavolo si accorcia da solo**, come le miniature vere; in formazione sciolta sparisce la base che hai segnato e l'ingombro si richiude su quelle rimaste. Arrivato a zero esce dal campo.
- **Ferite** — il modello tolto non è l'unica valuta, e per un personaggio, un mostro o un carro è quella sbagliata: sono modelli singoli che incassano colpi senza sparire dal tavolo, e per tre quarti della partita quello che si perde sono **ferite**. Il tasto ♥ ne segna una senza togliere niente; il numero si vede sull'unità sul tavolo, accanto al nome nella lista Perdite, e finisce nel report turno per turno. Quando una ferita diventa davvero un modello in meno lo dici tu, con un tasto: l'app non lo deduce, perché per dedurlo dovrebbe conoscere delle regole.
- **Etichette** — parole libere appiccicate a un'unità: *disordinata*, *ha caricato*, *sotto incantesimo*, quello che ti serve. Gli stati che l'app conosce sono tre e sono cablati; quelli che al tavolo ci si dimentica sono altri e cambiano da un'edizione all'altra, quindi qui sono testo. Compaiono sotto l'unità sul tavolo, e il dizionario dei suggerimenti cresce da solo con quello che scrivi: non c'è nessun elenco da mantenere.
- **Contatori** — un nome e un numero, per esercito nel pannello e per unità nell'ispettore. Le risorse della magia, le munizioni contate, i punti comando, le cariche di un oggetto: roba che al tavolo si tiene con i dadi girati e si sbaglia. L'app non sa cosa conta: sa contare.
- **Dadi** — *Tira i dadi* apre il vassoio senza uscire dalla partita, e quello che esce **finisce nel registro** con turno e casella, come un'annotazione scritta a mano. Quando è un'azione a chiedere i dadi il vassoio si apre già impostato, con il motivo scritto nel titolo: il motore non tira mai da sé, chiede. A fine partita il report racconta anche cosa è stato tirato.
- **Lo schermino** — sopra il tabellino c'è il tavolo in piccolo: quello di adesso, e con le due frecce quello di ogni fine turno già registrato. Serve a vedere quello che si sta raccontando invece di leggerlo in una tabella di coordinate.
- **Tabellino** — quanti punti restano in campo e quanti ne sono andati, per parte, calcolati in proporzione ai modelli persi.
- **Registro** — ogni azione, ogni perdita e ogni annotazione, con turno, esercito e **la casella in cui è successa**. Se lo scrive il motore: chi preme *dichiarazione di carica* non scrive niente, e la riga c'è lo stesso con i dadi che sono usciti. *Annulla* porta via la riga insieme all'azione. *Annota* resta per tutto il resto, e apre una finestra con le **scorciatoie** già pronte — carica riuscita, carica fallita, in rotta, rally, incantesimo fermato, generale, stendardo — perché durante una partita vera nessuno scrive frasi su una tastiera virtuale, e un registro vuoto vale un report vuoto. Chi vuole scrivere a mano scrive lo stesso.
- **Chiudi il turno** — il pulsante grosso. Fotografa il tavolo com'è in quel momento e passa la mano. La fotografia tiene, per ogni unità, dove sta, quanto è grande adesso, come è schierata, di quanto si è mossa dal turno prima, quante perdite ha subito in questo turno, in che stato è e dentro quale elemento di terreno si trova. Tiene anche i **contatti di basetta** del momento — chi tocca chi e da che lato — e la **posizione del terreno**, che durante la partita si sposta. È da queste fotografie che nasce il battle report.

Lo schieramento è la fotografia numero zero, scattata quando premi *Comincia*: finché non hai chiuso il primo turno la puoi rifare (*Rifai la foto*), che serve quando ci si accorge di aver premuto Comincia troppo presto.

Anche qui vale l'annulla: una perdita segnata sull'unità sbagliata — o un turno chiuso per sbaglio — si toglie con `Ctrl+Z`.

### 6. Partite

La scheda **Partite** è il diario. Ci si arriva in due modi.

**Dal tavolo.** Finita la partita (o anche a metà), *Archivia il report*: la partita registrata diventa una voce dell'archivio, con liste, terreno, schieramento, tutte le fotografie di fine turno e il registro.

**A mano**, per una partita giocata altrove: *Nuova partita a mano*, si scelgono due liste salvate e si compila. Ogni turno si porta avanti da solo la situazione di quello prima, quindi si scrive **solo quello che è cambiato**: le perdite del turno, i pollici percorsi, chi è andato in rotta. Correggere un numero al turno 2 risistema superstiti e stato di tutti i turni successivi.

**Punteggio.** Tre righe le calcola l'app guardando l'ultima situazione registrata — unità nemiche distrutte, ridotte a metà o meno, in rotta a fine partita — sommando i punti delle liste. Le altre le sai solo tu, e sono quelle che decidono davvero le partite: generale ucciso, portastendardo, stendardi catturati, obiettivi controllati, quarti di tavolo, bonus di scenario. Si scrivono a mano, e se ne aggiungono di proprie. Scrivendo un numero su una riga calcolata, quella riga smette di essere ricalcolata e resta la tua.

Il verdetto (pareggio, vittoria di misura, netta, schiacciante) è **una convenzione dell'app**, proporzionale ai punti giocati: non è una regola del manuale, è un modo di dire quanto è larga la vittoria senza guardare una differenza secca.

**L'esportazione è il punto della scheda.** *Copia per l'AI* mette negli appunti il report intero in Markdown, preceduto dalla richiesta di analizzarlo: si incolla in chat e si chiede cosa è andato storto. Il testo si spiega da solo — dichiara le unità di misura, l'origine degli assi, da che parte schiera ciascuno, che *mosso* è lo spostamento netto e non il percorso, e che il registro è tenuto a mano da un giocatore mentre gioca, quindi può avere buchi. Poi elenca:

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
  movement.js         l'ancora di movimento e le soglie
  zones.js            zone di schieramento disegnate a mano
  bases.js            basette e frontage predefinito per tipo di truppa
  troops.js           i tredici tipi di truppa: modelli per fila, ranghi, Forza d'Unità
  parser.js           lettura dei file New Recruit / BattleScribe
  terrain.js          tipi di elemento scenico, categoria e naturalità
  scenarios.js        scenari, zone di schieramento, geometria
  geom.js             geometria pura: sovrapposizioni, distanze, viste
  store.js            IndexedDB, ridimensionamento foto, backup
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
  armies.js           il vocabolario dei file d'esercito, che stanno in dati/eserciti/
  battlemarch.js      le due tabelle a D6 di Battle March e il controllo degli obiettivi
  combat.js           lo scontro simulato e la raffica, senza interfaccia
  duel.js             il pannello dello scontro: dadi in chiaro e perdite
  formation.js        il posto di ogni modello, personaggi uniti, contatti, terreno occupato
  formeditor.js       la finestra in cui la formazione si disegna a mano
  tableshot.js        il tavolo in miniatura, ricostruito da una fotografia di fine turno
  game.js             turni, fasi, perdite, tabellino, registro
  battlelog.js        fotografie di fine turno, punteggio, report in Markdown
  phases.js           le sedici caselle del turno: cosa ci si aspetta in ognuna
  engine.js           il motore: azioni, dadi chiesti, regole in ascolto, registro
  charge.js           la carica: dichiararla, allinearla, e le mosse all'indietro
  scenariokit.js      scenari propri e generatore di terreno a specchio
  catalog.js          voci di collezione, foto, pittura, aggancio dei nomi
  lists.js            liste salvate e collegamento unità → catalogo
  prep.js             la scheda di preparazione: quello che il file di New Recruit non dice
  matchup.js          disponibilità, confronto, schieramenti salvati
  reports.js          archivio delle partite e scheda Partite
  deploy.js           stato del tavolo, pannelli, campo di battaglia
  main.js             avvio, schede, registrazione del service worker
test/
  smoke.mjs           catalogo, aggancio, import, copertura, pittura
  battle.mjs          punteggi, dadi, ventagli e ombre, senza pagina
  regole.mjs          tipi di truppa, ritiri, archi, effetti, terreno, file d'esercito
  motore.mjs          le sedici caselle, le azioni, i dadi chiesti, il registro
  movimento.mjs       carica: arco, vista, distanza, reazioni, allineamento, fuga
  sync.mjs            archivio su GitHub, contro un GitHub finto in memoria
  boot.mjs            la pagina intera: schede, annulla, zoom, partita, report, link
tools/
  make-icons.mjs      scrive i PNG del manifest senza dipendenze
dati/
  eserciti/           un file per esercito: regole, oggetti, domini
```

Le quattro primitive generiche stanno in moduli loro perché non sanno niente del tavolo e non devono saperlo: `extras.js` non ha DOM, `movement.js` non ha stato, `zones.js` risponde a una domanda sola. `uikit.js` c'è perché tre pannelli diversi avevano bisogno delle stesse quattro cose — una finestra, i contatori, le etichette, una fila di scorciatoie — e perché `prompt()` e `confirm()` non si usano più da nessuna parte: sul telefono coprono lo schermo, in un'app installata hanno l'aria di un errore, e proprio dove servono davvero (annotare mentre giochi) erano il gesto sbagliato.

`deploy.js` resta il modulo grosso perché stato, pannelli e disegno del campo sono davvero un blocco solo. Quello che se n'è potuto staccare è uscito: la geometria (`geom.js`) perché ora la usano anche gli aiuti tattici e il generatore di terreno; la storia, la vista, la partita e gli scenari propri perché non hanno bisogno di sapere niente del tavolo — ricevono dei callback e basta, così la dipendenza va in una direzione sola e non si formano cicli.

### Prove

```bash
npm install
npm test
```

Girano in jsdom con IndexedDB finto, senza browser. `battle.mjs` non ne ha bisogno affatto: prova i conti da solo — i punteggi da fare, che quattromila dadi a 4+ diano circa metà successi, che il passo lungo valga in media mezzo pollice più della carica normale, che il ventaglio si accorci nel bosco e si fermi contro l'impassabile aggirandolo di lato, che dietro un monolite qualche raggio si spenga e di fianco no. `sync.mjs` monta un GitHub finto in memoria — blob, alberi, commit e un ramo — e ci fa sopra il giro completo: salvataggio, secondo salvataggio che non commette niente perché non è cambiato niente, un file cambiato che ne carica uno solo, una foto cancellata che sparisce anche di là, il conflitto quando il ramo si è mosso, e lo scaricamento su un archivio vuoto con le foto che tornano identiche al bit. Controlla anche che la sha calcolata in casa sia quella vera di git. `boot.mjs` avvia davvero la pagina intera e poi la usa: annulla e ripeti, zoom, distanze misurate dal bordo, ventaglio di movimento, campo di tiro con un bosco piantato in mezzo per veder sparire la linea di vista, uno scontro tirato finché qualcuno cade e le sue perdite riportate sul tavolo, righelli, una partita con perdite e unità distrutta, la chiusura di due turni con il movimento misurato in pollici, l'archiviazione del battle report e il suo testo in Markdown, una partita scritta a mano a partire da una lista, terreno casuale (verificando che sia specchiato e che nessun tesoro finisca sotto i 3″), salvataggio di uno scenario proprio, andata e ritorno del link condiviso, serializzazione del PNG e la finestra della Nuvola con le sue impostazioni.

Sui dadi le prove sono due, e separate. In `battle.mjs`, senza pagina: che ogni faccia grezza diventi il valore giusto sui quattro dadi, che i due Colpito! stiano su facce opposte come sul dado vero, che il Colpito fermi l'oggetto e la freccia lo sposti dei pollici tirati, che il Mancato Colpo blocchi tutto, e che quarantottomila D6 diano sei mucchi che si somigliano. In `boot.mjs`, sulla pagina vera: che otto D6 siano otto cubi da sei facce, che **ogni cubo si fermi girato in modo da mostrare proprio la faccia uscita**, che i dadi accesi siano quelli che hanno passato il punteggio, e che **mentre i dadi rotolano il risultato non sia ancora scritto**.

`movimento.mjs` prova la carica dove la carica è scritta, senza tavolo: che un tiro di sette riesca ventuno volte su trentasei contando le facce; che quello che sta dietro non si carichi e che un bosco in mezzo tolga la vista anche alla dichiarazione; che il *tira e tieni* si spenga sotto il Movimento del caricante; che il passo lungo tenga i due dadi migliori e il terreno difficile i due peggiori; che il caricante si fermi a filo sulla faccia **da cui è venuto** e non su quella più vicina; che chi scappa vada via dal nemico più grosso, e in diagonale quando i più grossi sono due.

Prova anche le cose nuove dove si vedono davvero: che i cerchi del movimento restino **fermi sull'ancora** invece di seguire il pezzo e che la riga scriva `4.0″ di 8″`; che una ferita non tolga un modello finché non lo dici tu; che il caricante si appoggi a filo e arrivi dritto anche se lo trascinavi storto; che una zona disegnata a mano faccia risultare *fuori zona* un'unità che lo scenario considerava a posto; che marcatori, zone, etichette e ferite sopravvivano al link condiviso e finiscano nel report. `smoke.mjs` prova a parte i moduli senza DOM, dove le regole di conversione si leggono in una riga.

---

## Limiti noti

- L'aggancio automatico è volutamente prudente: se ha un dubbio non decide e chiede. Meglio una spunta gialla che un conteggio sbagliato in silenzio.
- Le anteprime per modello si fermano a 60 per riga; oltre compare `+N`.
- La sincronia su GitHub la lanci tu (o il salvataggio automatico dopo qualche minuto di calma): non è continua e non fonde due modifiche fatte insieme allo stesso file. Chi salva per secondo sceglie se scaricare prima o passare sopra. Per due fratelli che giocano a turno va bene; per una squadra no.
- Senza Nuvola i dati restano legati a quel browser: c'è il backup manuale e il link dello schieramento. Il link porta le posizioni, non la collezione: catalogo e foto restano dove sono.
- La modalità partita **non arbitra**: tiene il conto di turni, caselle e perdite, dice cosa ci si aspetta adesso, e non impedisce niente. Le decisioni restano ai due giocatori, come al tavolo.
- Il vassoio dei dadi **non sa cosa stai tirando**: quanti dadi, che dado e che punteggio serve lo dici tu, e i modificatori li fai in testa come al tavolo. Tira, mostra e scrive quello che è uscito — il resto è ancora una decisione dei giocatori.
- Per lo stesso motivo il punteggio è **mezzo automatico**: l'app somma quello che vede sul tavolo (chi è morto, chi è a metà, chi è in rotta) e lascia a te obiettivi, generale, stendardi e quarti. Non conosce le tabelle di nessuno scenario e non pretende di conoscerle.
- Il *mosso* di un'unità è lo spostamento **netto** fra due fotografie: chi avanza e poi ripiega risulta fermo, e una ruota sul posto risulta zero. Il fronte in gradi c'è, ed è lì che si legge — e il *Fantasma* fa vedere il resto.
- Le soglie di movimento (marcia `M×2`, carica `M+7` e `M+12`) sono **una convenzione dell'app**, non una regola letta da nessun manuale: sono disegnate perché servono a stimare, e M si corregge a mano quando serve.
- Le ferite e le etichette l'app le **conta e le scrive**, non le interpreta: nessuna ferita fa cadere un modello da sola, nessuna etichetta cambia il comportamento di niente.
- Il registro dei turni si scrive quando premi *Chiudi il turno*: se te ne dimentichi due, quei due turni nel report non esistono. È un diario, non un arbitro che guarda.
- Lo **scontro simulato** è una stima, non un arbitro. Conosce quello che sta nel profilo e i numeri che imposti a mano; non sa niente di magia, oggetti, regole d'esercito, terrore, colpi mortali. Quanti modelli si toccano e quanti colpi porta l'urto della carica sono l'ordine di grandezza giusto, non la misura esatta: si correggono nel pannello, ed è per questo che il campo *Attacchi* è modificabile.
- Il **campo di tiro** guarda dal centro del fronte, non da ogni singola miniatura. Le coperture le decide il tipo di elemento scenico — bosco leggera, rovine e muretti pesante — non il pezzo vero che hai in mano.
- Il **ventaglio di movimento** non fa ruotare l'unità: mostra dove arriva andando avanti nel proprio arco frontale, che è il caso normale. Una riorganizzazione o un giro sul posto restano da immaginare.
- La **carica** calcola il costo della ruota ma non lo scala da un budget di movimento, e il *tira e tieni* apre la reazione senza tirare la raffica: quella si tira dal pannello del tiro. Il ripiegamento in ordine dice da sé che i suoi dadi vanno confrontati con il libro.
- Il magnetismo aggancia solo unità con lo **stesso orientamento**: allineare un reggimento a uno girato di 45° resta lavoro a mano.
- La linea di vista guarda i soli elementi che il tipo dichiara bloccanti (boschi, rovine, monoliti, piramidi) e ignora le regole fini — colline che vedono oltre, unità che fanno da schermo. È un'indicazione, non un arbitro. Vale per le distanze, per il campo di tiro e per la stima delle perdite.
- L'aggancio al contatto appoggia il caricante **al centro della faccia** e poi lo lascia scorrere: dice dove finisce il pezzo, non se la carica era permessa.
- Il terreno casuale è a specchio per costruzione: è la scelta più difendibile al circolo, ma non riproduce le mappe asimmetriche di uno scenario scritto.
- Il motore delle fasi **sa cosa ci si aspetta in ogni casella, non se una mossa è legale**. Dichiara la carica e scrive quanto hai tirato; se quella carica arrivava o no lo decidi tu, e il pezzo lo sposti tu. Un'azione fuori casella non viene impedita: viene annotata.
- La tabella dei **tipi di truppa** (p. 105) ha tredici righe e la colonna della Forza d'Unità è confrontata con le dieci liste salvate: sei tipi su tredici hanno un esempio vero che la conferma. Le celle senza esempio l'app le usa lo stesso e le dichiara — nell'ispettore compare *cella da verificare*. Quando il file della lista dichiara la Forza d'Unità vince il file, sempre.
- Le due tabelle a D6 di **Battle March** — Terreno Selvaggio e Caso della Guerra — tirano e dicono cos'è uscito, ma l'abbinamento fra la faccia del dado e l'esito **non è confrontato con il libro**: i sei esiti stanno nell'ordine in cui il piano li elenca, e l'app lo scrive ogni volta che tira. Con il libro aperto si corregge cambiando una riga di `battlemarch.js`.
- Il **profilo diviso** cavaliere/cavalcatura si legge dalle liste importate da adesso in poi: quelle già salvate sono state lette quando il parser teneva solo il primo profilo, e vanno reimportate per avere la riga della cavalcatura.
- Il parser legge quello che New Recruit esporta. Se una lista arriva con basette insolite le stima dal tipo di truppa, e le puoi correggere a mano nell'ispettore.

## Licenza

Codice sotto licenza MIT — vedi [LICENSE](LICENSE).

Warhammer, The Old World e i nomi di fazioni e unità appartengono a Games Workshop Limited. Il progetto non è affiliato né approvato da GW, non riproduce testi, tabelle o profili tratti dalle loro pubblicazioni e non distribuisce immagini dei loro prodotti. Le statistiche che vedi nell'app sono quelle contenute nei file che importi tu; gli aiuti tattici e lo scontro simulato le mettono in relazione con dei conti scritti come conti — uno scarto fra due caratteristiche, un numero da eguagliare o superare — e non come tabelle copiate. Le foto che carichi nel catalogo restano sul tuo dispositivo.
