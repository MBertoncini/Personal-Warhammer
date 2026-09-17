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
- **Prove per tutto.** `npm test` (~1800 asserzioni, un minuto o due). Ogni regola
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

## Fatto: la prima partita fra due modelli, riletta

La prima partita Gemini contro Gemini (`partita.html`) non valeva come
partita: i dadi con il seme uscivano solo 1, 3 e 5, il controllo del
bordo leggeva `p.x` su angoli che sono `[x, y]` (chi cedeva terreno non
si muoveva, chi ripiegava in ordine usciva a mezzo tavolo), «resta
ferma» contava come movimento per il tiro, e il movimento spostava i
centri senza guardare nessuno. Tutto corretto, con le prove in
`test/arbitro.mjs`; `tools/controlla-partita.mjs` rilegge una pagina e
trova queste anomalie da solo — fallo girare su ogni partita nuova.

**Da controllare sul libro**, perché in quella sessione il manuale non
c'era:

- il raggio del Comando del generale, preso di **12″**
  (`RAGGIO_GENERALE` in `arbitro.js`, dichiarato in `LIMITI`);
- la carica su un bersaglio fuggito: chi lo raggiunge lo travolge,
  chi non lo raggiunge fa la carica fallita (p. 121?). Manca la
  ridirezione (in `LIMITI`);
- chi ripiega in ordine tiene il dado maggiore di 2D6 (`BACKWARD` in
  `charge.js` lo diceva già, l'arbitro sommava);
- gli schermagliatori senza bonus di ranghi: la pagina scritta accanto
  (p. 101) è quella che `inCombatOrder` citava già;
- seguire chi cede terreno: l'arbitro lo fa sempre, e non segue mai chi
  ripiega in ordine. Sul libro è una scelta: andrebbe offerta come mossa;
- i pestoni contro carri e cavalleria: l'arbitro li tira contro tutti.

**Nei dati**: la lista 9 (Skaven Battle March) non ha né tipo di truppa
né armi. `partita.mjs` adesso lo dice all'avvio, e in cima alla pagina;
finché non si corregge, gli Skaven giocano da fanteria regolare e non
sparano. La lista 12 (Battle march, 862 pt) ha tutto.

## Fatto: la seconda e la terza partita, rilette

- **Liste scritte a mano a caratteristiche zero.** `profileFor` usava
  `u.army` come fazione, e sul tavolo `army` è «A» o «B»: la tavola dei
  profili non trovava niente e gli Skaven giocavano con R 0, AC 0, M 0 —
  zero ferite in tutta la partita, nessun turno Skaven. Il controllo della
  lista diceva «tutto giocabile» perché guarda il file, non il tavolo.
  Adesso `partita.mjs` controlla anche il tavolo.
- **Il raduno** si ritentava finché riusciva (sette volte di fila): un
  test per unità per turno, e chi fallisce continua a fuggire nelle mosse.
- **La carica su chi fugge come reazione** spariva: chi caricava non
  tirava e restava libero di marciare o di ridichiarare. Adesso tira.
  Chi è già in fuga non «tiene la posizione»: la carica lo insegue.
- **Tira e tiene** non sparava mai: `charge.js` lo chiama `shoot`,
  l'arbitro cercava `stand`.
- **Il Panico** si contava sulla forza di inizio partita, e passato il
  quarto ogni perdita successiva rifaceva il test. Adesso è il quarto
  perso nella fase, una volta per fase, come in `shoot.js`.
- Paura/Terrore/Stupidità, personaggi uniti e magia si dichiarano a fine
  schieramento quando le liste li toccano.
- `--archivia` mette la partita nel diario (`tools/archivia.mjs`),
  marcata `meta.simulata` e fuori dal palmarès.

**Da controllare sul libro**:

- p. 141: il quarto del Panico è sulla Forza d'Unità **d'inizio fase**?
- se un'unità già in fuga caricata deve fuggire di nuovo (oggi non si
  muove, e la carica la raggiunge o fallisce);
- il bonus di ordine chiuso con più unità per parte: oggi se ne contano
  due («2 ordine di combattimento»);
- un Bastiladon che ripiega in ordine con un 5 è finito 12,3″ più in là
  («oltre chi aveva dietro»): il ripiegamento non dovrebbe fermarsi prima?
- se una carica sul fianco di schermagliatori toglie i ranghi al
  bersaglio (`disrupted` resta sempre falso).

**Nei dati**: l'export di New Recruit perde le regole d'esercito — Cold
Blooded dei Lizardmen, Stupidity e Regeneration dei Troll — e ne porta di
strane (Impact Hits a un Night Goblin Bigboss appiedato). L'arbitro gioca
quello che trova.

## Compito 0 — la psicologia e i personaggi uniti in partita

Paura, Terrore e Stupidità hanno i test in `psych.js` e l'arbitro non li
chiama (`LIMITI`, voce `psicologia`); i personaggi non si uniscono mai
alle unità (voce `personaggi`), e in tutte le partite fra modelli sono
morti da soli al primo turno. Sono due buchi che pesano sull'esito più
delle scelte dei modelli.

## Compito 1 — fatto: la magia in partita (pp. 106-111)

L'arbitro la gioca. Quello che è stato deciso, perché non si rifaccia la
stessa strada:

- **gli incantesimi li tira l'arbitro** prima dello schieramento (p. 106),
  in una fase `S.preparando` in cui chi gioca sceglie il dominio e poi se
  scambiare un incantesimo con la firma. La scheda di preparazione vince
  quando c'è: `prep.units[i]` con `level`, `lore` e `spellIds` (id, non
  testo). `armyFrom` la attacca all'unità come `u.prepara`;
- **quello che il file non dice sta sul libro**: `dati/magia/domini.json`
  ha la voce `maghi` — Livello di base, domini fra cui scegliere, regole
  «Lore of …», libro e pagina — per i sei maghi che le liste salvate
  schierano (`M.wizardBook(u)`). Il Livello comprato come opzione il file
  non lo scrive: vale quello di base, ed è il limite `livello`. Il
  Warlock Engineer è mago solo se l'ha pagato, e senza scheda non lancia;
- **non esiste una riserva di dadi del vento** in questa edizione: ogni
  tentativo tira 2D6, un incantesimo una volta per turno, la sorte una
  volta per turno, il fiasco chiude lanci o dissolvimenti del turno.
  `S.magia` ricorda solo questo;
- **la magia sta dove la mette il libro**: una casella `congiura` in
  testa al turno (potenziamenti e maledizioni), i dardi dentro il `tiro`,
  gli assalti dentro la `mischia`. Il **dissolvimento** è un
  `S.pending` di tipo `dissolvi` per l'altro giocatore, e l'assalto di
  chi non è di turno è un `S.pending` di tipo `assalto` che si apre quando
  si sceglie `combatti`. Con una domanda in sospeso `apply` accetta solo
  le risposte a quella (`SOSPESI`);
- **si offre solo quello che l'app sa applicare** (`MG.applies`: colpi con
  i dadi, modifiche, bandierine): 23 incantesimi su 56 del manuale base.
  Gli altri sono il limite `amano`. Le probabilità le fanno
  `MG.castOdds` e `MG.dispelOdds` sui 36 esiti, con la tabella del
  fiasco dentro;
- gli effetti scadono in `passo()` con `EF.sweepExpired`, e il Movimento
  dell'arbitro sente le modifiche (`movimento()`), come `noMarch` e
  `noCharge`;
- limiti nuovi in `LIMITI`: `domini` (dati non caricati), `amano`,
  `livello`, `assalti` (si lanciano prima che si meni, e le loro ferite
  non entrano nel risultato), `armatura` (la pelle callosa degli Skink
  Priest: p. 111 alla lettera li fermerebbe, e non si applica finché una
  FAQ non lo chiarisce).

Quello che **resta** della magia: i 33 incantesimi che sono testo
(vortici, trasporti, sagome, linee — vogliono la geometria del
Compito 4), gli assalti al passo d'Iniziativa del mago (p. 158), la
scheda di preparazione nella pagina che chieda `level`, `lore` e
`spellIds` invece del testo libero di oggi (`prep.js`, `lists.js`), e le
schede `maghi` degli eserciti che le liste salvate non schierano ancora.

Prove: `test/magia.mjs` (probabilità, schede dei maghi) e
`test/arbitro.mjs` (un lancio con i dadi scelti, il dissolvimento, un
effetto che scade al turno giusto, e tre partite fra uno Skink Priest e
un Night Goblin Oddnob sulle liste 1 e 2).

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
  guardarla; `--seme N` per rigiocare identica quella che ha sbagliato;
  `--liste 1,2 --scenario bm-monolite` per una partita con due maghi.
- Per provare l'app vera serve un server: `python -m http.server 8123` e poi
  **`http://127.0.0.2:8123`** — non `localhost`, che tiene in cache i moduli
  vecchi e ti fa impazzire per un'ora.
- I messaggi di commit di questo repo raccontano una storia in italiano e
  spiegano il perché, non il cosa. Guarda `git log` prima di scriverne uno.
