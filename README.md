# Schieramento Old World

Quattro cose che si tengono per mano, per **Warhammer: The Old World**:

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

### 2. Importa le liste

Scheda **Liste** → *Importa da New Recruit*. Accetta i `.json` e i `.ros`.

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

**Magnetismo.** Con lo Snap acceso il pezzo trascinato non si aggancia solo alla griglia da ¼″: se si avvicina al fianco o alla linea di un'altra unità **con lo stesso orientamento**, ci si allinea da solo. È il gesto che al tavolo si fa cento volte e a mano non viene mai preciso.

**Maniglia di rotazione.** Sul pezzo selezionato compare un pallino davanti al fronte: trascinandolo si ruota (a scatti di 15° per le unità, 5° per il terreno; `Alt` per la rotazione libera). `[` e `]` — o `Shift`+rotella — cambiano il numero di modelli di fronte.

**Misura degli elementi scenici.** Il bosco di cartone non è mai quello del manuale. Sull'elemento selezionato compaiono tre maniglie quadrate: quella di destra allarga, quella in basso approfondisce, quella d'angolo muove tutti e due i lati insieme; un pezzo tondo ne ha una sola, che è il raggio. Le stesse misure si scrivono in pollici nell'ispettore. Il segnalino del tesoro no: la sua base da 40 mm è quella e resta quella.

**Misura del tavolo.** Oltre ai formati in elenco c'è *Su misura*: due caselle per larghezza e profondità, da 12″ a 144″. Il tavolo della cucina è largo com'è largo, e zone, righelli e controlli di bordo lo seguono.

**Linee di schieramento.** *Dalla mediana* è una casella in cui si scrive il numero, ma la linea si può anche prendere e portare: su ogni zona c'è una pillola con i pollici scritti sopra, e trascinandola le due zone si stringono o si allargano insieme. Con lo Snap acceso si ferma al quarto di pollice.

**Formazione.** Ogni unità ha il suo editor grafico: doppio clic sul pezzo, oppure *Editor della formazione* nell'ispettore. Dentro ci sono due mondi.

- **Ordine chiuso**: la griglia di sempre, con le sagome già pronte (linea, due ranghi, blocco, quadrato, colonna), la larghezza di fronte e la spaziatura fra le basi. L'ultimo rango incompleto si allinea a sinistra o si centra.
- **Formazione sciolta**: la griglia sparisce e ogni base si trascina dove vuoi. I preset (nuvola, schermo, scacchiera, mezzaluna, cuneo, fila) sono il punto di partenza; appena sposti qualcosa la formazione diventa *come l'hai messa* e nessun preset te la tocca più. Le frecce spostano di un millimetro alla volta, `Q` ed `E` ruotano la base selezionata, *Specchia* e *Ruota 90°* girano tutta la schermagliata.

L'ingombro di un'unità non è più una moltiplicazione: è il rettangolo che contiene davvero le basi come stanno. Una schermagliata larga occupa il fronte che occupa, e i controlli di legalità, il magnetismo, le distanze e i contatti lo sanno.

**Personaggi dentro le unità.** Dentro un reggimento ci va quello che al tavolo ci starebbe: i personaggi che il roster dichiara tali, e comunque **ogni unità da un modello solo** — il boss senza slot, il pezzo comprato a parte, la bestia da compagnia — che nell'elenco compare marcata *1 modello*. La spunta nell'ispettore ha l'ultima parola. Si uniscono dall'editor della formazione o dall'ispettore del reggimento. Da quel momento non è più un pezzo suo: prende una casella dentro la formazione (trascina la base con la stella per cambiargliela), si muove col reggimento e nel report risulta dov'è il reggimento. *Sgancia* lo rimette sul tavolo di fianco.

**Aiuti tattici.** *Distanze* misura dal **bordo** verso ogni nemico, come si misura davvero, e segna tratteggiate le linee che un bosco o un monolite interrompono. *Archi* disegna l'arco frontale e la portata di carica (M+7 media, M+12 massima). Chi finisce nell'arco entro la carica è verde.

**Movimento.** Le statistiche che arrivano dalle liste New Recruit non servono solo a riempire l'ispettore. *Movimento* disegna quattro ventagli — passo, marcia, carica media, carica massima — e li disegna **dove il passo porta davvero**: un cerchio dice che hai 4″, un ventaglio dice che quei 4″ nel bosco diventano 2 e contro la piramide diventano zero. Il terreno difficile costa il doppio, l'impassabile ferma, il bordo del tavolo ferma, e chi vola passa sopra a tutto. Il passo lungo (*Swiftstride*, cavalleria veloce) porta la carica media da M+7 a M+8,5: mezzo pollice, cioè la differenza fra arrivare e non arrivare.

**Tiro.** *Tiro* prende l'arma più lunga del profilo e disegna il **campo di fuoco con le ombre**: un raggio ogni pochi gradi, e dove incontra un bosco o un monolite il raggio finisce lì. Quello che resta chiaro è il cono che si copre davvero; le rientranze sono i posti in cui il nemico si mette per non farsi vedere. La fascia interna è la gittata corta, oltre la metà si tira con il −1. Su ogni nemico compare il **punteggio per colpire** e quanti modelli cadrebbero in media, e chi non si può bersagliare dice perché: *non lo vedo*, *fuori arco*, *fuori gittata*. L'ispettore ripete le stesse righe scrivendo i modificatori uno per uno — lunga gittata, copertura leggera o pesante, bersaglio in formazione sciolta — così si vede *perché* serve un 5.

**Scontro simulato.** Accanto a ogni nemico vicino, nell'ispettore, c'è una spada. Apre un pannello con le due schiere a confronto: profili, quanti modelli si toccano, armatura e salvezza speciale, stendardo, chi ha caricato, se si colpisce di fronte, di fianco o di retro.

- *Tira i dadi* fa **un assalto** e mostra **ogni faccia uscita**: per colpire, per ferire, per salvare. Si mena in ordine di Iniziativa — chi è più svelto toglie modelli prima che gli altri rispondano — e chi carica con l'urto lo porta prima di tutto. Poi il conto di fine assalto (ferite, ranghi, stendardo, chi è in più, il fianco) e il test di Comando di chi ha perso.
- *Simula 500 assalti* rifà lo stesso conto cinquecento volte e riporta le percentuali. È la risposta alla domanda vera, che non è «com'è andata» ma «conviene?»: un assalto solo non dice niente, cinquecento dicono se caricare è una buona idea.
- *Segna le perdite sul tavolo* riporta i modelli caduti sulle due unità, e con la partita aperta i reggimenti **si accorciano da soli**. Vale l'annulla anche per questo.

I dadi si vedono tutti apposta. Un simulatore che scrive «4 ferite» chiede di essere creduto sulla parola; uno che mostra le facce lo si ricontrolla a occhio, e quando dice una cosa strana si capisce subito se è stata sfortuna o un numero sbagliato nel profilo.

**Armatura e salvezza speciale.** Sono le due cose che i file delle liste non contengono, perché in Old World vengono dall'equipaggiamento e dagli oggetti, non dal profilo. Si scelgono una volta nell'ispettore e valgono per il tiro e per lo scontro; senza, le stime sovrastimano le perdite di parecchio. Quando l'export le dichiara — valore d'armatura o punteggio già pronto — il parser le legge da sé.

**Righelli.** *Misura*, due clic, e la misura **resta** sul tavolo; se ne tengono fino a otto. Il tasto `⌫` accanto le toglie tutte.

**Terreno casuale.** Genera una mappa **a specchio** — quello che mette in una metà lo ripete ruotato di mezzo giro nell'altra — rispettando da sola i vincoli che l'app già controlla. *Salva come scenario* mette tavolo, zone e terreno fra i **Miei scenari**, accanto a quelli del manuale.

**Immagine e link.** *Immagine* scarica il tavolo intero come PNG da mandare nel gruppo o stampare. *Link* copia un indirizzo che **contiene** lo schieramento: sta nel frammento dopo il `#`, quindi non arriva a nessun server, e un tavolo con ventiquattro unità occupa meno di un kilobyte. Le foto non ci viaggiano dentro: chi apre il link vede le sue.

Ogni unità nella lista laterale mostra una foto e il moltiplicatore; l'**unità selezionata** apre la striscia intera, un'anteprima per modello.

*Salva schieramento* dalla scheda Matchup archivia la disposizione corrente; la ritrovi in fondo alla stessa scheda.

### 5. Partita

*Comincia la partita*, nel pannello di sinistra. Non arbitra niente e non conosce le regole: tiene il conto di quello che al tavolo si dimentica sempre.

- **Turno e fase** — Strategia, Movimento, Tiro, Corpo a corpo, poi passa la mano; finito il giro il turno cresce.
- **Perdite** — in tre posti: l'ispettore dell'unità, la lista *Perdite* del pannello (tutte le unità in fila, meno due clic per segnare un tiro di archi) e l'editor della formazione, dove si clicca **quale** modello è caduto. Tolti i modelli il reggimento **perde i ranghi di dietro e sul tavolo si accorcia da solo**, come le miniature vere; in formazione sciolta sparisce la base che hai segnato e l'ingombro si richiude su quelle rimaste. Arrivato a zero esce dal campo.
- **Lo schermino** — sopra il tabellino c'è il tavolo in piccolo: quello di adesso, e con le due frecce quello di ogni fine turno già registrato. Serve a vedere quello che si sta raccontando invece di leggerlo in una tabella di coordinate.
- **Tabellino** — quanti punti restano in campo e quanti ne sono andati, per parte, calcolati in proporzione ai modelli persi.
- **Registro** — ogni perdita e ogni annotazione, con turno e fase.
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
- un capitolo per ogni mezzo turno con la situazione di ogni unità a fine turno, i **contatti di basetta** (chi tocca chi, e da che lato: fronte, fianco, retro) e quanti modelli di ciascuna stanno dentro un elemento scenico;
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
  bases.js            basette e frontage predefinito per tipo di truppa
  parser.js           lettura dei file New Recruit / BattleScribe
  terrain.js          tipi di elemento scenico e loro limiti
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
  rules.js            i conti con i dadi: punteggi da fare, ranghi, nervi
  combat.js           lo scontro simulato e la raffica, senza interfaccia
  duel.js             il pannello dello scontro: dadi in chiaro e perdite
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
  battle.mjs          punteggi, dadi, ventagli e ombre, senza pagina
  sync.mjs            archivio su GitHub, contro un GitHub finto in memoria
  boot.mjs            la pagina intera: schede, annulla, zoom, partita, report, link
tools/
  make-icons.mjs      scrive i PNG del manifest senza dipendenze
```

`deploy.js` resta il modulo grosso perché stato, pannelli e disegno del campo sono davvero un blocco solo. Quello che se n'è potuto staccare è uscito: la geometria (`geom.js`) perché ora la usano anche gli aiuti tattici e il generatore di terreno; la storia, la vista, la partita e gli scenari propri perché non hanno bisogno di sapere niente del tavolo — ricevono dei callback e basta, così la dipendenza va in una direzione sola e non si formano cicli.

### Prove

```bash
npm install
npm test
```

Girano in jsdom con IndexedDB finto, senza browser. `battle.mjs` non ne ha bisogno affatto: prova i conti da solo — i punteggi da fare, che quattromila dadi a 4+ diano circa metà successi, che il passo lungo valga in media mezzo pollice più della carica normale, che il ventaglio si accorci nel bosco e si fermi contro l'impassabile aggirandolo di lato, che dietro un monolite qualche raggio si spenga e di fianco no. `sync.mjs` monta un GitHub finto in memoria — blob, alberi, commit e un ramo — e ci fa sopra il giro completo: salvataggio, secondo salvataggio che non commette niente perché non è cambiato niente, un file cambiato che ne carica uno solo, una foto cancellata che sparisce anche di là, il conflitto quando il ramo si è mosso, e lo scaricamento su un archivio vuoto con le foto che tornano identiche al bit. Controlla anche che la sha calcolata in casa sia quella vera di git. `boot.mjs` avvia davvero la pagina intera e poi la usa: annulla e ripeti, zoom, distanze misurate dal bordo, ventaglio di movimento, campo di tiro con un bosco piantato in mezzo per veder sparire la linea di vista, uno scontro tirato finché qualcuno cade e le sue perdite riportate sul tavolo, righelli, una partita con perdite e unità distrutta, la chiusura di due turni con il movimento misurato in pollici, l'archiviazione del battle report e il suo testo in Markdown, una partita scritta a mano a partire da una lista, terreno casuale (verificando che sia specchiato e che nessun tesoro finisca sotto i 3″), salvataggio di uno scenario proprio, andata e ritorno del link condiviso, serializzazione del PNG e la finestra della Nuvola con le sue impostazioni.

---

## Limiti noti

- L'aggancio automatico è volutamente prudente: se ha un dubbio non decide e chiede. Meglio una spunta gialla che un conteggio sbagliato in silenzio.
- Le anteprime per modello si fermano a 60 per riga; oltre compare `+N`.
- La sincronia su GitHub la lanci tu (o il salvataggio automatico dopo qualche minuto di calma): non è continua e non fonde due modifiche fatte insieme allo stesso file. Chi salva per secondo sceglie se scaricare prima o passare sopra. Per due fratelli che giocano a turno va bene; per una squadra no.
- Senza Nuvola i dati restano legati a quel browser: c'è il backup manuale e il link dello schieramento. Il link porta le posizioni, non la collezione: catalogo e foto restano dove sono.
- La modalità partita **non arbitra**: tiene il conto di turni, fasi e perdite, e non impedisce mosse illegali. Le decisioni restano ai due giocatori, come al tavolo.
- Per lo stesso motivo il punteggio è **mezzo automatico**: l'app somma quello che vede sul tavolo (chi è morto, chi è a metà, chi è in rotta) e lascia a te obiettivi, generale, stendardi e quarti. Non conosce le tabelle di nessuno scenario e non pretende di conoscerle.
- Il *mosso* di un'unità è lo spostamento **netto** fra due fotografie: chi avanza e poi ripiega risulta fermo, e una ruota sul posto risulta zero. Il fronte in gradi c'è, ed è lì che si legge.
- Il registro dei turni si scrive quando premi *Chiudi il turno*: se te ne dimentichi due, quei due turni nel report non esistono. È un diario, non un arbitro che guarda.
- Lo **scontro simulato** è una stima, non un arbitro. Conosce quello che sta nel profilo e i numeri che imposti a mano; non sa niente di magia, oggetti, regole d'esercito, terrore, colpi mortali. Quanti modelli si toccano e quanti colpi porta l'urto della carica sono l'ordine di grandezza giusto, non la misura esatta: si correggono nel pannello, ed è per questo che il campo *Attacchi* è modificabile.
- Il **campo di tiro** guarda dal centro del fronte, non da ogni singola miniatura. Le coperture le decide il tipo di elemento scenico — bosco leggera, rovine e muretti pesante — non il pezzo vero che hai in mano.
- Il **ventaglio di movimento** non fa ruotare l'unità: mostra dove arriva andando avanti nel proprio arco frontale, che è il caso normale. Una riorganizzazione o un giro sul posto restano da immaginare.
- Il magnetismo aggancia solo unità con lo **stesso orientamento**: allineare un reggimento a uno girato di 45° resta lavoro a mano.
- La linea di vista guarda i soli elementi che il tipo dichiara bloccanti (boschi, rovine, monoliti, piramidi) e ignora le regole fini — colline che vedono oltre, unità che fanno da schermo. È un'indicazione, non un arbitro. Vale per le distanze, per il campo di tiro e per la stima delle perdite.
- Il terreno casuale è a specchio per costruzione: è la scelta più difendibile al circolo, ma non riproduce le mappe asimmetriche di uno scenario scritto.
- Il parser legge quello che New Recruit esporta. Se una lista arriva con basette insolite le stima dal tipo di truppa, e le puoi correggere a mano nell'ispettore.

## Licenza

Codice sotto licenza MIT — vedi [LICENSE](LICENSE).

Warhammer, The Old World e i nomi di fazioni e unità appartengono a Games Workshop Limited. Il progetto non è affiliato né approvato da GW, non riproduce testi, tabelle o profili tratti dalle loro pubblicazioni e non distribuisce immagini dei loro prodotti. Le statistiche che vedi nell'app sono quelle contenute nei file che importi tu; gli aiuti tattici e lo scontro simulato le mettono in relazione con dei conti scritti come conti — uno scarto fra due caratteristiche, un numero da eguagliare o superare — e non come tabelle copiate. Le foto che carichi nel catalogo restano sul tuo dispositivo.
