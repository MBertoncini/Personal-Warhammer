# Prompt per la prossima sessione

Da incollare all'inizio di una sessione nuova, dopo `cd` nella cartella del
progetto. È scritto per essere letto da chi non c'era: dice dove sta il
lavoro, cosa è già fatto, e cosa fare in che ordine.

---

Stai lavorando su **Schieramento Old World**, un'app statica (HTML + moduli
ES, nessun framework) che è insieme catalogo della collezione, gestore di
liste New Recruit e simulatore di tavolo per *Warhammer: The Old World*.

**Leggi prima queste tre cose, in quest'ordine**, perché contengono le
regole di casa del progetto e la storia di tutte le decisioni prese:

1. `README.md` — cosa fa l'app, com'è strutturata, e la sezione **Limiti
   noti**, che è il contratto di onestà del progetto;
2. `PIANO-REGOLE.md` — il piano di come il manuale entra nell'app, tappa
   per tappa, con le sezioni barrate quando sono fatte. La §13 è lo stato
   di adesso;
3. i commenti in cima ai moduli che tocchi. In questo repo i commenti
   spiegano **perché**, non cosa: se ne trovi uno che dice «prima qui
   c'era X e sbagliava», quella è la memoria del progetto.

## Le regole di casa, in breve

- **Nessun numero inventato.** Ogni numero di regola viene dal manuale, con
  la pagina scritta accanto nel codice (`page: 154`, «(p. 121)»). I manuali
  in PDF stanno in `C:\Users\ilari\Desktop\Warhammer\` — Core Rulebook,
  Ravening Hordes, Forces of Fantasy, Battle March, e i due Legends
  (Lizardmen, Skaven). **La pagina stampata è la pagina del PDF meno uno.**
  Se un numero non l'hai letto sul libro, si dichiara: c'è già la
  convenzione `daVerificare` e la costante messa in un punto solo.
- **Dire quello che non si sa.** Il peggior bug che questo repo abbia avuto
  è stato una lista senza profili che veniva simulata lo stesso: zero
  contro zero, cento per cento di pareggi, nessun avviso. Quando l'app non
  può calcolare qualcosa, lo scrive.
- **I moduli sono puri.** Niente DOM, niente archivio, niente rete fuori da
  `deploy.js` (la pagina), `store.js`/`sync.js` (i dati) e `agente.js` (il
  modello di linguaggio). Entrano numeri, escono numeri con la traccia di
  come sono venuti.
- **Prove per tutto.** `npm test` (~1550 asserzioni, ~2 minuti). Ogni regola
  nuova porta le sue prove nel file della sua fase, con etichette in
  italiano che si leggono come frasi.
- **L'italiano nei commenti e nell'interfaccia**, l'inglese solo nei nomi
  di funzione. Lo stile dei commenti è discorsivo e racconta il perché.

---

## Compito 0 — prima di tutto: due rami che vanno riuniti

`main` su GitHub e il ramo `claude/mischia-a-piu-di-due-e-arbitro`
contengono **due soluzioni diverse allo stesso problema**, scritte in
parallelo da due sessioni che non si sono viste. Vanno fuse a mano: un
merge testuale non basta, perché le due versioni riscrivono le stesse
funzioni con architetture diverse. Comincia da qui, prima di aggiungere
qualunque cosa.

Il conflitto vero è in **`src/combat.js`** (3 blocchi) e **`src/duel.js`**
(1 blocco); gli altri cinque (`README.md`, `package.json`, `src/lists.js`,
`src/deploy.js`, `test/movimento.mjs`) sono unioni banali.

**Cosa c'è su `main`** (commit `7d18a95`, «I personaggi menano, e si contano
i modelli che si toccano davvero»):

- `contact()` torna delle **squadre** (`groups`): la truppa e ogni
  personaggio unito che sta in prima fila, ognuno con il suo profilo
  intero, più `strikersOf()` che le trasforma in colpi;
- un personaggio in prima fila **occupa un posto** dei soldati invece di
  aggiungerne uno (p. 207);
- `touching` / `touchingModels`: il numero dei modelli **davvero** a
  contatto, misurato sul tavolo invece che stimato con «la più stretta
  delle due prime file» — e il pannello dichiara se il numero è contato o
  stimato;
- l'ordine di Iniziativa a gradini fra tutte le squadre, con le ferite
  applicate a fine gradino.

**Cosa c'è sul ramo** (commit `9d6b11b`):

- `meleeFight(A[], B[])`: l'assalto è fra due **gruppi di unità**, non fra
  due schiere — il combattimento multiplo di p. 153, con i ranghi che non
  si sommano, gli stendardi uno per parte, il fianco una volta per unità
  nemica, il terreno più alto che si annulla;
- `engagements()` (chi tocca chi, con `vs` dichiarabile), `frontShares()`
  (la prima fila divisa fra più nemici), `aimAt()` (quanti colpi su chi);
- i personaggi uniti come **schiere loro** con `attached`/`shielded`: non
  si colpiscono se non dirigendoci i colpi apposta, le ferite non
  tracimano, urto e pestoni solo sotto i cinque modelli di truppa (p. 209);
- `ML.strikeSteps()`: l'ordine di Iniziativa fra N schiere, a scaglioni,
  con le ferite applicate a fine scaglione (**è la stessa idea dei gradini
  di `main`**);
- un test di rotta per ogni unità della parte che perde (p. 154);
- e sopra, tre cose nuove che non toccano il conflitto: `src/arbitro.js`
  (l'arbitro senza pagina), `src/agente.js` (euristica + Gemini),
  `tools/partita.mjs` + `tools/replay.mjs` (una partita intera, commentata
  e da guardare).

**La fusione che ha senso** — verificala, non fidarti:

1. tieni l'architettura a **gruppi** del ramo (`meleeFight`), perché
   `strikeSteps` è già la versione a N schiere dei gradini di `main` e
   perché senza gruppi il combattimento multiplo non è rappresentabile;
2. porta dentro **`touching`/`touchingModels`** di `main`: è un numero
   misurato che sostituisce una stima, ed entra in `aimAt()` al posto di
   `frontShares` quando il tavolo sa dire quanti si toccano;
3. porta dentro la regola «**il personaggio occupa un posto**» (p. 207),
   che il ramo non ha: oggi una schiera `attached` aggiunge attacchi senza
   togliere un modello alla fila;
4. per «chi incassa le ferite», `main` lo lascia ai giocatori con una nota
   nel pannello e il ramo applica la regola (p. 209: solo attacchi diretti,
   niente tracimazione). **Tieni la regola** e lascia la nota: le due cose
   non si escono.
5. il pannello (`duel.js`): il ramo ha le parti a gruppi con la tendina che
   aggiunge un'unità, `main` ha le righe per profilo con il numero
   misurato. Servono tutte e due: una riga per profilo **dentro** ogni
   unità del gruppo.

Alla fine devono passare **le prove di tutti e due i rami** — `main` ne ha
di nuove in `test/dadi.mjs`, `test/liste.mjs`, `test/battle.mjs`; il ramo in
`test/mischia.mjs`, `test/arbitro.mjs`, `test/tiro.mjs`,
`test/movimento.mjs`, `test/regole.mjs`, `test/psicologia.mjs`. Il
`package.json` dei due elenca file di prova diversi: il merge è l'unione.

---

## Compito 1 — la magia in partita (p. 106 e seguenti)

È la voce più grossa che l'arbitro dichiara e non gioca, e l'unica che
cambia davvero come finiscono le battaglie.

Quello che **c'è già** in `src/magic.js`: i domini con i loro incantesimi
(`dati/magia/`), la generazione, il tiro di lancio con l'invocazione
perfetta e il fiasco, il dissolvimento, gli effetti a tempo che
`effects.js` applica ai profili, e i colpi che un incantesimo infligge
(già passati per la catena di `combat.js`). Nel tavolo vero (`deploy.js`)
la fase di magia si gioca già a mano.

Quello che **manca** perché l'arbitro possa giocarla:

1. **Gli incantesimi generati.** Un file New Recruit dice il dominio e il
   livello, non quali incantesimi sono usciti (si tirano prima dello
   schieramento, p. 106). `prep.js` li chiede già come domanda aperta e li
   salva come testo libero in `prep.units[i].spells`: servono come **id**,
   non come frase. Due strade, scegli e dichiara: farli tirare all'arbitro
   a inizio partita (è la regola), oppure leggerli dalla scheda quando ci
   sono.
2. **La riserva di dadi del vento di magia.** Guarda sul manuale come si
   generano i dadi di potere e di dissolvimento in questa edizione, e
   mettili nello stato dell'arbitro come una risorsa per turno.
3. **La casella nel turno.** `CASELLE` in `arbitro.js` oggi ha cinque
   voci; la magia ne aggiunge una (e la Congiurazione nella Strategia, se
   decidi di giocarla). Ogni casella nuova vuole le sue `options()` — «chi
   lancia cosa su chi» — e il suo `apply()`.
4. **Le scelte da offrire a chi gioca.** Un incantesimo è una mossa come
   una carica: `{ id:"lancia", uid, spell, target, dadi }` con dentro già
   calcolato quanto serve per lanciarlo e che probabilità c'è, come fa
   `opzioniCarica`. Poi il dissolvimento tocca **all'altro giocatore**:
   l'arbitro sa già passare la scelta all'avversario (guarda come è fatta
   la reazione alla carica, `S.pending`).
5. Togli `magia` da `LIMITI` quando è fatta, e aggiungi i limiti nuovi che
   restano (gli oggetti magici, per esempio, restano fuori).

Prove: `test/magia.mjs` per le regole, `test/arbitro.mjs` per la partita —
lì basta una partita con due maghi che finisca e in cui il registro porti
almeno un lancio e un dissolvimento.

## Compito 2 — le manovre (p. 125)

L'arbitro oggi sa avanzare, marciare, caricare e stare fermo. Il manuale ha
anche riforme, giri sul posto e ruote pagate dal budget di movimento —
`charge.js` le calcola già (`MANOEUVRES`, `wheelCost`, `moveAllowance`) e
nessuno le offre. Sono tre o quattro mosse nuove in `opzioniMossa`, e
cambiano parecchio il gioco: un reggimento che si gira invece di avanzare è
metà della tattica di questo gioco.

## Compito 3 — le sfide (p. 210)

`melee.js` conta già l'overkill (con il tetto di +5 trovato sul libro). Chi
lancia la sfida, chi la raccoglie e chi la rifiuta sono **decisioni**: sono
tre mosse da offrire in `options()` quando in un combattimento ci sono due
personaggi, e il modello di linguaggio le sa valutare bene. Attenzione al
ritiro di chi rifiuta, che toglie il personaggio dal combattimento.

## Compito 4 — sagome, macchine da guerra, volo

`shoot.js` ha già sagome, deviazione, cannone e lanciapietre, e il «sotto in
parte»: quello che manca all'arbitro è la posizione **modello per modello**,
che `formation.js` sa già dare (`layout`, `baseCells`). È il compito più
meccanico dei quattro. Il volo (`profiles.js` dà il numero, `Fly (n)`) vuole
invece una decisione: sorvolare vuol dire ignorare il terreno e le unità in
mezzo, e oggi il movimento è una linea retta.

---

## Come si lavora qui

- `npm test` prima di ogni commit, e le prove nuove **falliscono prima** di
  scrivere il codice che le fa passare — nel senso: scrivi la prova con il
  numero che il libro dice, e guarda che sia rossa.
- `npm run partita` per vedere l'arbitro giocare; `--html partita.html` per
  guardarla; `--seme N` per rigiocare identica quella che ha sbagliato.
- Per provare l'app vera serve un server: `python -m http.server 8123` e poi
  **`http://127.0.0.2:8123`** — non `localhost`, che tiene in cache i moduli
  vecchi e ti fa impazzire per un'ora.
- I messaggi di commit di questo repo raccontano una storia in italiano e
  spiegano il perché, non il cosa. Guarda `git log` prima di scriverne uno.
