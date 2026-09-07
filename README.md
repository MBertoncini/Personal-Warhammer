# Schieramento Old World

Quattro cose che si tengono per mano, per **Warhammer: The Old World**:

**Il principio che tiene insieme tutto.** L'app sa **geometria, quantità e memoria**. Non sa mai **legalità**. Non tira dadi, non risolve combattimenti, non sa se una carica è legale e non conosce la composizione di nessuna lista: quelle sono le cose che il manuale può cambiare, e su cui l'app comincerebbe a discutere coi giocatori. Sa dove stanno i pezzi, quanti sono e com'erano tre turni fa.

Ne discende tutto il resto, a partire dalla regola che le funzionalità **generiche** valgono più di quelle specifiche: un marcatore con testo libero copre obiettivi, segnalini magici, aree di incantesimo e «qui è morto il generale»; un marcatore *obiettivo* copre una cosa sola e domani ne serve un altro.

1. **Catalogo** — la collezione di miniature, una voce per tipo di modello, con quante ne possiedi e una foto.
2. **Liste** — i roster esportati da New Recruit, con ogni unità agganciata a una voce del catalogo.
3. **Matchup e tavolo** — due liste a confronto, la verifica di cosa hai davvero in vetrina, e il simulatore di schieramento con zone, terreno e controlli di legalità.
4. **Partita** — turni, fasi, perdite modello per modello, contatti di basetta e il tavolo in miniatura a ogni turno, per quando lo schieramento è finito e si comincia a giocare.
5. **Partite** — il diario delle battaglie: schieramento, movimento e perdite di ogni unità alla fine di ogni turno, punteggio voce per voce, e l'esportazione del battle report in un formato pensato per essere incollato a un'intelligenza artificiale.

Tutto gira nel browser. Nessun server, nessun account, nessun dato che esce dal dispositivo. Si installa come app e funziona senza rete.

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

Lo stesso vale sul tavolo: *+ Unità a mano* sotto ciascun esercito mette un reggimento in campo senza passare da nessun file.

Ogni unità viene agganciata al catalogo da sola quando il nome combacia: `11 Black Orc Mob` trova `Black Orc` da sé, perché l'aggancio ignora il numero iniziale, le parole di servizio (`mob`, `unit`, `regiment`) e le desinenze plurali.

Quando non combacia, l'unità appare con la spunta gialla *da agganciare* e un menu con i candidati più probabili. **Lo scegli una volta**: la scelta viene salvata come alias sulla voce di catalogo e da lì in poi quel nome si aggancia da solo, in ogni lista futura. Se la voce non esiste ancora, `+ crea voce` la genera già compilata.

### 3. Matchup

Scheda **Matchup**: scegli le due liste e dichiara chi porta le miniature.

- **Solo l'esercito A (o B) è mio** — la verifica confronta quella lista con la collezione.
- **Entrambi dalla mia collezione** — le due liste vengono **sommate** prima del confronto. È il caso in cui giochi in casa con entrambi gli eserciti tuoi: se una voce compare in tutte e due, gli stessi modelli fisici non possono essere schierati due volte, e senza la somma il controllo direbbe di sì a torto.

Il verdetto elenca ogni voce con `richiesti/posseduti`, segna in rosso lo scoperto e in giallo quello che possiedi ma non hai ancora dipinto. Sopra, i due eserciti sono messi **a confronto**: punti, unità, modelli, unit strength, quante unità tirano, punti per unità — chi è in vantaggio su ogni riga è in grassetto.

*Copia cosa manca* mette negli appunti due elenchi in chiaro, **da procurare** e **da dipingere**, da incollare dove vuoi.

*Porta sul tavolo* carica le due liste negli eserciti A e B del simulatore.

### 4. Tavolo

Scenari Battle March e generici, zone di schieramento, terreno con i controlli (tesori a più di 3″ da ogni elemento, nessun pezzo oltre i 12″ sul lato lungo), rotazione, snap a ¼″, misurazione.

**Annulla e ripeti.** `Ctrl+Z` e `Ctrl+Y`, o le due frecce nella barra. Vale per tutto: uno spostamento, una rotazione, un *Schiera tutto* premuto per sbaglio sopra dieci minuti di lavoro, una generazione di terreno, una perdita segnata di troppo. Il tooltip dice sempre cosa si sta per annullare.

**Zoom e scorrimento.** Rotella per ingrandire attorno al puntatore, `Shift`+trascinamento (o trascinare il vuoto) per spostarsi, pizzico a due dita su tablet, `+` `−` `0` da tastiera, *Adatta* per tornare al tavolo intero. Su 96″×48″ senza zoom una basetta da 25 mm è tre pixel.

**Magnetismo.** Con lo Snap acceso il pezzo trascinato non si aggancia solo alla griglia da ¼″. Ci sono due agganci e non si contendono lo stesso gesto:

- **In linea**, fra unità con lo **stesso orientamento**: il fianco contro il fianco, i fronti allineati, le seconde linee dritte dietro le prime.
- **Al contatto**, contro un'unità girata diversamente: trascini il caricante vicino alla faccia che ha scelto e ci si appoggia **a filo**, ruotando da sé per metterglisi parallelo. Scorre lungo la faccia finché vuoi, così il centraggio resta tuo.

L'app non decide se la carica è legale. Mette il pezzo dove hai già deciso di metterlo, e lo mette dritto.

**Maniglia di rotazione.** Sul pezzo selezionato compare un pallino davanti al fronte: trascinandolo si ruota (a scatti di 15° per le unità, 5° per il terreno; `Alt` per la rotazione libera). `[` e `]` — o `Shift`+rotella — cambiano il numero di modelli di fronte.

**Formazione.** Ogni unità ha il suo editor grafico: doppio clic sul pezzo, oppure *Editor della formazione* nell'ispettore. Dentro ci sono due mondi.

- **Ordine chiuso**: la griglia di sempre, con le sagome già pronte (linea, due ranghi, blocco, quadrato, colonna), la larghezza di fronte e la spaziatura fra le basi. L'ultimo rango incompleto si allinea a sinistra o si centra.
- **Formazione sciolta**: la griglia sparisce e ogni base si trascina dove vuoi. I preset (nuvola, schermo, scacchiera, mezzaluna, cuneo, fila) sono il punto di partenza; appena sposti qualcosa la formazione diventa *come l'hai messa* e nessun preset te la tocca più. Le frecce spostano di un millimetro alla volta, `Q` ed `E` ruotano la base selezionata, *Specchia* e *Ruota 90°* girano tutta la schermagliata.

L'ingombro di un'unità non è più una moltiplicazione: è il rettangolo che contiene davvero le basi come stanno. Una schermagliata larga occupa il fronte che occupa, e i controlli di legalità, il magnetismo, le distanze e i contatti lo sanno.

**Personaggi dentro le unità.** Un personaggio — lo dice il roster, e dove non lo dice c'è la spunta nell'ispettore — si unisce a un reggimento dall'editor o dall'ispettore del reggimento. Da quel momento non è più un pezzo suo: prende una casella dentro la formazione (trascina la base con la stella per cambiargliela), si muove col reggimento e nel report risulta dov'è il reggimento. *Sgancia* lo rimette sul tavolo di fianco.

**Di quanto mi sto muovendo.** È la domanda del turno, e prima l'app rispondeva male: i cerchi del movimento erano disegnati attorno all'unità, quindi la seguivano, e la risposta spariva proprio mentre la trascinavi.

Adesso c'è l'**ancora**. Il punto da cui l'unità è partita in questo turno resta segnato sul tavolo con la sagoma di dov'era, e i quattro cerchi — *movimento*, *marcia*, *carica media*, *carica massima* — stanno **fermi lì**, non addosso al pezzo. Mentre trascini, una riga fra il punto di partenza e adesso dice **quanti pollici hai fatto**, su quanti ne hai: `4.2″ di 8″ · restano 3.8″`. Il numero è verde dentro il movimento, ambra dentro la marcia o la carica, rosso oltre tutto — un semaforo, non un arbitro: l'unità si muove lo stesso e nessuno ti ferma.

L'ancora si mette da sola al primo spostamento, e si azzera a ogni *Chiudi il turno*: il turno nuovo riparte da dove sei arrivato. *Riparti da qui* nell'ispettore e il tasto ⚓ nella barra la rimettono a mano, una o tutte. La levetta **Movimento** la spegne.

Le tre soglie sono la convenzione dell'app, dichiarata e basta: marcia `M×2`, carica media `M+7`, carica massima `M+12`. Il valore di **M** si legge dal profilo e si corregge a mano nell'ispettore quando il roster sbaglia, o quando una regola lo cambia: l'app non sa perché è cambiato, sa disegnare il cerchio giusto.

**Il fantasma.** La levetta *Fantasma* disegna sotto le unità dov'erano nell'ultima fotografia di fine turno. È l'unico modo di **vedere** una ruota sul posto, che il «mosso» netto per costruzione racconta come zero.

**Aiuti tattici.** *Distanze* misura dal **bordo** verso ogni nemico, come si misura davvero, e segna tratteggiate le linee che un bosco o un monolite interrompono. *Archi* disegna l'arco frontale e la portata di carica. *Raggi* mostra la gittata di tiro, e quella sì che segue l'unità: si misura da dove sei adesso.

**Righelli e sagome.** *Misura*, due clic, e la misura **resta** sul tavolo; se ne tengono fino a otto. Il tasto `⌫` accanto le toglie tutte.

*+ Sagoma* aggiunge l'altra metà di quello che c'è fisicamente su un tavolo: un cerchio, o un rettangolo, da appoggiare **sopra** i modelli. Il raggio lo scegli tu, la sagoma resta dove la metti e si trascina come tutto il resto. Selezionandola, l'ispettore dice **quanti modelli ci stanno sotto**, unità per unità. Cosa significhi poi lo sanno i giocatori: l'app conta e basta.

**Marcatori.** *+ Marcatore* mette sul tavolo un pezzo che non è né unità né terreno, con **testo libero** e un colore. È il jolly, ed è fatto apposta per coprire quello che non abbiamo previsto: obiettivi che non siano il tesoro Battle March, segnalini magici, l'area di un incantesimo che resta in gioco, il punto da cui arrivano i rinforzi, il quarto di tavolo conteso, «qui è caduto il portastendardo». L'etichetta la leggi tu; l'app non la interpreta mai, la disegna, la salva, la mette nel link e la scrive nel report.

**Zone disegnate a mano.** Gli scenari conoscono cinque disposizioni, e per la sesta non c'era niente da fare. *Disegna una zona*, poi trascini il rettangolo sul tavolo e dici di chi è: dell'Esercito A, di B, di tutti e due, area vietata, o solo un promemoria. Quando ce n'è almeno una, **sostituiscono** quelle calcolate dallo scenario, e i controlli di legalità (dentro o fuori zona) guardano le tue. *Salva come scenario* se le porta dietro, insieme al terreno e ai marcatori: da lì in poi qualsiasi scenario — di un libro, di un torneo, inventato al circolo — è rappresentabile senza che l'app ne sappia niente.

**Terreno casuale.** Genera una mappa **a specchio** — quello che mette in una metà lo ripete ruotato di mezzo giro nell'altra — rispettando da sola i vincoli che l'app già controlla. *Salva come scenario* mette tavolo, zone e terreno fra i **Miei scenari**, accanto a quelli del manuale.

**Immagine e link.** *Immagine* scarica il tavolo intero come PNG da mandare nel gruppo o stampare. *Link* copia un indirizzo che **contiene** lo schieramento: sta nel frammento dopo il `#`, quindi non arriva a nessun server, e un tavolo con ventiquattro unità occupa meno di un kilobyte. Le foto non ci viaggiano dentro: chi apre il link vede le sue.

Ogni unità nella lista laterale mostra una foto e il moltiplicatore; l'**unità selezionata** apre la striscia intera, un'anteprima per modello.

*Salva schieramento* dalla scheda Matchup archivia la disposizione corrente; la ritrovi in fondo alla stessa scheda.

### 5. Partita

*Comincia la partita*, nel pannello di sinistra. Non arbitra niente e non conosce le regole: tiene il conto di quello che al tavolo si dimentica sempre.

- **Turno e fase** — Strategia, Movimento, Tiro, Corpo a corpo, poi passa la mano; finito il giro il turno cresce.
- **Perdite** — in tre posti: l'ispettore dell'unità, la lista *Perdite* del pannello (tutte le unità in fila, meno due clic per segnare un tiro di archi) e l'editor della formazione, dove si clicca **quale** modello è caduto. Tolti i modelli il reggimento **perde i ranghi di dietro e sul tavolo si accorcia da solo**, come le miniature vere; in formazione sciolta sparisce la base che hai segnato e l'ingombro si richiude su quelle rimaste. Arrivato a zero esce dal campo.
- **Ferite** — il modello tolto non è l'unica valuta, e per un personaggio, un mostro o un carro è quella sbagliata: sono modelli singoli che incassano colpi senza sparire dal tavolo, e per tre quarti della partita quello che si perde sono **ferite**. Il tasto ♥ ne segna una senza togliere niente; il numero si vede sull'unità sul tavolo, accanto al nome nella lista Perdite, e finisce nel report turno per turno. Quando una ferita diventa davvero un modello in meno lo dici tu, con un tasto: l'app non lo deduce, perché per dedurlo dovrebbe conoscere delle regole.
- **Etichette** — parole libere appiccicate a un'unità: *disordinata*, *ha caricato*, *sotto incantesimo*, quello che ti serve. Gli stati che l'app conosce sono tre e sono cablati; quelli che al tavolo ci si dimentica sono altri e cambiano da un'edizione all'altra, quindi qui sono testo. Compaiono sotto l'unità sul tavolo, e il dizionario dei suggerimenti cresce da solo con quello che scrivi: non c'è nessun elenco da mantenere.
- **Contatori** — un nome e un numero, per esercito nel pannello e per unità nell'ispettore. Le risorse della magia, le munizioni contate, i punti comando, le cariche di un oggetto: roba che al tavolo si tiene con i dadi girati e si sbaglia. L'app non sa cosa conta: sa contare.
- **Lo schermino** — sopra il tabellino c'è il tavolo in piccolo: quello di adesso, e con le due frecce quello di ogni fine turno già registrato. Serve a vedere quello che si sta raccontando invece di leggerlo in una tabella di coordinate.
- **Tabellino** — quanti punti restano in campo e quanti ne sono andati, per parte, calcolati in proporzione ai modelli persi.
- **Registro** — ogni perdita e ogni annotazione, con turno e fase. *Annota* apre una finestra con le **scorciatoie** già pronte — carica riuscita, carica fallita, in rotta, rally, incantesimo fermato, generale, stendardo — perché durante una partita vera nessuno scrive frasi su una tastiera virtuale, e un registro vuoto vale un report vuoto. Chi vuole scrivere a mano scrive lo stesso.
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

Quando pubblichi una versione nuova, la prima apertura mostra ancora quella vecchia e avvisa; alla ricarica successiva è aggiornata.

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

Per spostarli usa **Backup** (scarica un JSON con tutto, foto comprese) e **Ripristina** sull'altro dispositivo. Vale anche come copia di sicurezza: `localStorage` e IndexedDB spariscono se cancelli i dati del sito.

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
  extras.js           marcatori, etichette, contatori, ferite — le primitive generiche
  movement.js         l'ancora di movimento e le soglie
  zones.js            zone di schieramento disegnate a mano
  bases.js            basette e frontage predefinito per tipo di truppa
  parser.js           lettura dei file New Recruit / BattleScribe
  terrain.js          tipi di elemento scenico e loro limiti
  scenarios.js        scenari, zone di schieramento, geometria
  geom.js             geometria pura: sovrapposizioni, distanze, viste
  store.js            IndexedDB, ridimensionamento foto, backup
  bus.js              eventi, per non far importare i moduli fra loro
  history.js          annulla e ripeti, su copie dello stato del tavolo
  view.js             zoom, scorrimento, pizzico, inquadratura
  imgexport.js        il tavolo come PNG, con i colori risolti
  share.js            schieramento dentro un link, compresso
  tactics.js          distanze dal bordo, linea di vista, archi di carica
  formation.js        il posto di ogni modello, personaggi uniti, contatti, terreno occupato
  formeditor.js       la finestra in cui la formazione si disegna a mano
  tableshot.js        il tavolo in miniatura, ricostruito da una fotografia di fine turno
  game.js             turni, fasi, perdite, tabellino, registro
  battlelog.js        fotografie di fine turno, punteggio, report in Markdown
  scenariokit.js      scenari propri e generatore di terreno a specchio
  catalog.js          voci di collezione, foto, pittura, aggancio dei nomi
  lists.js            liste salvate e collegamento unità → catalogo
  matchup.js          disponibilità, confronto, schieramenti salvati
  reports.js          archivio delle partite e scheda Partite
  deploy.js           stato del tavolo, pannelli, campo di battaglia
  main.js             avvio, schede, registrazione del service worker
test/
  smoke.mjs           catalogo, aggancio, import, copertura, pittura
  boot.mjs            la pagina intera: schede, annulla, zoom, partita, report, link
tools/
  make-icons.mjs      scrive i PNG del manifest senza dipendenze
```

Le quattro primitive generiche stanno in moduli loro perché non sanno niente del tavolo e non devono saperlo: `extras.js` non ha DOM, `movement.js` non ha stato, `zones.js` risponde a una domanda sola. `uikit.js` c'è perché tre pannelli diversi avevano bisogno delle stesse quattro cose — una finestra, i contatori, le etichette, una fila di scorciatoie — e perché `prompt()` e `confirm()` non si usano più da nessuna parte: sul telefono coprono lo schermo, in un'app installata hanno l'aria di un errore, e proprio dove servono davvero (annotare mentre giochi) erano il gesto sbagliato.

`deploy.js` resta il modulo grosso perché stato, pannelli e disegno del campo sono davvero un blocco solo. Quello che se n'è potuto staccare è uscito: la geometria (`geom.js`) perché ora la usano anche gli aiuti tattici e il generatore di terreno; la storia, la vista, la partita e gli scenari propri perché non hanno bisogno di sapere niente del tavolo — ricevono dei callback e basta, così la dipendenza va in una direzione sola e non si formano cicli.

### Prove

```bash
npm install
npm test
```

Girano in jsdom con IndexedDB finto, senza browser. `boot.mjs` avvia davvero la pagina intera e poi la usa: annulla e ripeti, zoom, distanze misurate dal bordo, righelli, una partita con perdite e unità distrutta, la chiusura di due turni con il movimento misurato in pollici, l'archiviazione del battle report e il suo testo in Markdown, una partita scritta a mano a partire da una lista, terreno casuale (verificando che sia specchiato e che nessun tesoro finisca sotto i 3″), salvataggio di uno scenario proprio, andata e ritorno del link condiviso e serializzazione del PNG.

Prova anche le cose nuove dove si vedono davvero: che i cerchi del movimento restino **fermi sull'ancora** invece di seguire il pezzo e che la riga scriva `4.0″ di 8″`; che una ferita non tolga un modello finché non lo dici tu; che il caricante si appoggi a filo e arrivi dritto anche se lo trascinavi storto; che una zona disegnata a mano faccia risultare *fuori zona* un'unità che lo scenario considerava a posto; che marcatori, zone, etichette e ferite sopravvivano al link condiviso e finiscano nel report. `smoke.mjs` prova a parte i moduli senza DOM, dove le regole di conversione si leggono in una riga.

---

## Limiti noti

- L'aggancio automatico è volutamente prudente: se ha un dubbio non decide e chiede. Meglio una spunta gialla che un conteggio sbagliato in silenzio.
- Le anteprime per modello si fermano a 60 per riga; oltre compare `+N`.
- I dati non si sincronizzano fra dispositivi: c'è il backup manuale e il link dello schieramento, non una nuvola. Il link porta le posizioni, non la collezione: catalogo e foto restano dove sono.
- La modalità partita **non conosce le regole**. Non tira dadi, non calcola combattimenti, non impedisce mosse illegali: tiene il conto. Le decisioni restano ai due giocatori, come al tavolo.
- Per lo stesso motivo il punteggio è **mezzo automatico**: l'app somma quello che vede sul tavolo (chi è morto, chi è a metà, chi è in rotta) e lascia a te obiettivi, generale, stendardi e quarti. Non conosce le tabelle di nessuno scenario e non pretende di conoscerle.
- Il *mosso* di un'unità è lo spostamento **netto** fra due fotografie: chi avanza e poi ripiega risulta fermo, e una ruota sul posto risulta zero. Il fronte in gradi c'è, ed è lì che si legge — e il *Fantasma* fa vedere il resto.
- Le soglie di movimento (marcia `M×2`, carica `M+7` e `M+12`) sono **una convenzione dell'app**, non una regola letta da nessun manuale: sono disegnate perché servono a stimare, e M si corregge a mano quando serve.
- Le ferite e le etichette l'app le **conta e le scrive**, non le interpreta: nessuna ferita fa cadere un modello da sola, nessuna etichetta cambia il comportamento di niente.
- Il registro dei turni si scrive quando premi *Chiudi il turno*: se te ne dimentichi due, quei due turni nel report non esistono. È un diario, non un arbitro che guarda.
- L'aggancio al contatto appoggia il caricante **al centro della faccia** e poi lo lascia scorrere: dice dove finisce il pezzo, non se la carica era permessa.
- La linea di vista guarda i soli elementi che il tipo dichiara bloccanti (boschi, rovine, monoliti, piramidi) e ignora le regole fini — colline che vedono oltre, unità che fanno da schermo. È un'indicazione, non un arbitro.
- Il terreno casuale è a specchio per costruzione: è la scelta più difendibile al circolo, ma non riproduce le mappe asimmetriche di uno scenario scritto.
- Il parser legge quello che New Recruit esporta. Se una lista arriva con basette insolite le stima dal tipo di truppa, e le puoi correggere a mano nell'ispettore.

## Licenza

Codice sotto licenza MIT — vedi [LICENSE](LICENSE).

Warhammer, The Old World e i nomi di fazioni e unità appartengono a Games Workshop Limited. Il progetto non è affiliato né approvato da GW, non contiene regole o profili tratti dalle loro pubblicazioni e non distribuisce immagini dei loro prodotti. Le foto che carichi nel catalogo restano sul tuo dispositivo.
