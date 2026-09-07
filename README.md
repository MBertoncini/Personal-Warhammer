# Schieramento Old World

Quattro cose che si tengono per mano, per **Warhammer: The Old World**:

1. **Catalogo** — la collezione di miniature, una voce per tipo di modello, con quante ne possiedi e una foto.
2. **Liste** — i roster esportati da New Recruit, con ogni unità agganciata a una voce del catalogo.
3. **Matchup e tavolo** — due liste a confronto, la verifica di cosa hai davvero in vetrina, e il simulatore di schieramento con zone, terreno e controlli di legalità.
4. **Partita** — turni, fasi, perdite e tabellino, per quando lo schieramento è finito e si comincia a giocare. Con le statistiche che arrivano dalle liste, il tavolo mostra anche dove si può arrivare, cosa si vede da dove, e come finirebbe un assalto.

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
- **Perdite** — nell'ispettore dell'unità. Tolti i modelli, il reggimento **perde i ranghi di dietro e sul tavolo si accorcia da solo**, come le miniature vere. Arrivato a zero esce dal campo.
- **Tabellino** — quanti punti restano in campo e quanti ne sono andati, per parte, calcolati in proporzione ai modelli persi.
- **Registro** — ogni perdita e ogni annotazione, con turno e fase.

Anche qui vale l'annulla: una perdita segnata sull'unità sbagliata si toglie con `Ctrl+Z`.

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
  tactics.js          distanze, linea di vista, ventagli di movimento e tiro
  rules.js            i conti con i dadi: punteggi da fare, ranghi, nervi
  combat.js           lo scontro simulato e la raffica, senza interfaccia
  duel.js             il pannello dello scontro: dadi in chiaro e perdite
  game.js             turni, fasi, perdite, tabellino, registro
  scenariokit.js      scenari propri e generatore di terreno a specchio
  catalog.js          voci di collezione, foto, pittura, aggancio dei nomi
  lists.js            liste salvate e collegamento unità → catalogo
  matchup.js          disponibilità, confronto, schieramenti salvati
  deploy.js           stato del tavolo, pannelli, campo di battaglia
  main.js             avvio, schede, registrazione del service worker
test/
  smoke.mjs           catalogo, aggancio, import, copertura, pittura
  battle.mjs          punteggi, dadi, ventagli e ombre, senza pagina
  boot.mjs            la pagina intera: schede, annulla, zoom, partita, link
tools/
  make-icons.mjs      scrive i PNG del manifest senza dipendenze
```

`deploy.js` resta il modulo grosso perché stato, pannelli e disegno del campo sono davvero un blocco solo. Quello che se n'è potuto staccare è uscito: la geometria (`geom.js`) perché ora la usano anche gli aiuti tattici e il generatore di terreno; la storia, la vista, la partita e gli scenari propri perché non hanno bisogno di sapere niente del tavolo — ricevono dei callback e basta, così la dipendenza va in una direzione sola e non si formano cicli.

### Prove

```bash
npm install
npm test
```

Girano in jsdom con IndexedDB finto, senza browser. `battle.mjs` non ne ha bisogno affatto: prova i conti da solo — i punteggi da fare, che quattromila dadi a 4+ diano circa metà successi, che il passo lungo valga in media mezzo pollice più della carica normale, che il ventaglio si accorci nel bosco e si fermi contro l'impassabile aggirandolo di lato, che dietro un monolite qualche raggio si spenga e di fianco no. `boot.mjs` avvia davvero la pagina intera e poi la usa: annulla e ripeti, zoom, distanze misurate dal bordo, ventaglio di movimento, campo di tiro con un bosco piantato in mezzo per veder sparire la linea di vista, uno scontro tirato finché qualcuno cade e le sue perdite riportate sul tavolo, righelli, una partita con perdite e unità distrutta, terreno casuale (verificando che sia specchiato e che nessun tesoro finisca sotto i 3″), salvataggio di uno scenario proprio, andata e ritorno del link condiviso e serializzazione del PNG.

---

## Limiti noti

- L'aggancio automatico è volutamente prudente: se ha un dubbio non decide e chiede. Meglio una spunta gialla che un conteggio sbagliato in silenzio.
- Le anteprime per modello si fermano a 60 per riga; oltre compare `+N`.
- I dati non si sincronizzano fra dispositivi: c'è il backup manuale e il link dello schieramento, non una nuvola. Il link porta le posizioni, non la collezione: catalogo e foto restano dove sono.
- La modalità partita **non arbitra**: tiene il conto di turni, fasi e perdite, e non impedisce mosse illegali. Le decisioni restano ai due giocatori, come al tavolo.
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
