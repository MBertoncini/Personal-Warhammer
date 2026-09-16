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

## Compito 0 — fatto: i due rami sono riuniti

`main` e `claude/mischia-a-piu-di-due-e-arbitro` avevano scritto in
parallelo due soluzioni allo stesso problema. La fusione sta sul ramo
`claude/fusione-mischia`, e le prove di tutti e due passano. Quello che
è stato deciso, perché non si rifaccia la stessa strada:

- **l'assalto è a gruppi** (`meleeFight`, dal ramo), con un ordine di
  Iniziativa solo per tutti (`ML.strikeSteps`);
- **i personaggi uniti hanno due facce, e servono tutte e due.** La
  schiera ospite porta l'elenco (`retinue`, da `main`) e con quello sa
  che un capo in prima fila **occupa un posto** (p. 207) e se il tavolo
  lo ha visto toccare. Dentro `meleeFight` ogni personaggio dell'elenco
  diventa una schiera `attached` (dal ramo: ferite sue, colpito solo da
  chi ci dirige i colpi, urto e pestoni sotto i cinque modelli, p. 209).
  Se chi chiama l'ha già messa — il pannello e l'arbitro lo fanno — non
  se ne fa una seconda (`withRetinue`), e quelle aggiunte vanno in fondo
  alla parte;
- `contact()` sa tutte e tre le cose: `touching` (misurato), `frontage`
  (la fetta di fila davanti a un nemico, se si stima) e `withChars`; torna
  `troop`, i dadi della sola truppa, che è quello che l'assalto tira con
  il profilo del reggimento;
- con più nemici davanti, `aimAt()` usa **`touchingVs`** (le basette
  contro ciascun nemico, per uid) e divide la fila in parti uguali solo
  quando il tavolo non lo sa dire. Il pannello lo riempie da
  `ctx.touching`, che torna `null` quando due unità non si toccano
  affatto — lì vale la stima, non «zero modelli»;
- **chi tocca il reggimento tocca anche il capo che ci sta dentro**
  (`engagements`): prima un nemico che dichiarava il solo reggimento
  lasciava fuori il personaggio, e il pannello non lo faceva menare;
- la nota del pannello è rimasta, riscritta: la regola di p. 209 la
  applica l'app, **su chi dirigere i colpi** resta a chi gioca;
- nell'arbitro, chi **cede terreno** contro il bordo si ferma lì (il
  libro non lo dice: è dichiarato in `LIMITI`, voce `bordo`), e chi
  **ripiega in ordine** oltre il bordo esce come chi fugge (pp. 132, 134).
  Con i dadi della fusione il seme 7 spingeva un Bastiladon sotto il
  tavolo.

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
