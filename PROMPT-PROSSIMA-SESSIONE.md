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
- **Prove per tutto.** `npm test` (~1850 asserzioni, un minuto o due). Ogni regola
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

- ~~il raggio del Comando del generale~~ — letto: 12″, e 18″ se il
  generale è un Large Target (p. 202). `RAGGIO_GENERALE_GRANDE`;
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

## Compito 0 — fatto: la psicologia e i personaggi uniti in partita

Quello che è stato deciso, perché non si rifaccia la stessa strada:

- **ci si unisce dove lo dice p. 207**: allo schieramento (`unisci`) e
  nelle mosse restanti (`unisciti`), e si esce prima che il reggimento si
  muova (`separa`). `daSchierare` mette in campo prima i reggimenti e poi
  i personaggi, perché un capo schierato per primo non avrebbe nessuno
  con cui stare. Il genere (fanteria con fanteria, cavalleria con
  cavalleria) è una lettura dell'app: limite `genere`;
- **un reggimento con un capo**: Comando più alto fra i modelli
  (`ldProprio`, p. 97), passo del più lento (`movimento`, p. 208), Forza
  d'Unità sommata (`usConCapi`, p. 207). Se fugge fuori dal tavolo o è
  travolto, il capo va con lui (`posa`); se cade in combattimento, il capo
  resta da solo (`perdite` lo stacca). Il punteggio conta anche i capi;
- **Paura** (p. 168): prima di dichiarare (`carica`) e quando il
  combattimento viene scelto (`mischia`), una volta per turno
  (`u.paura`). La probabilità di passarla entra nella carica offerta
  (`passaIl`). In mischia la bandierina `feared` di `combat.js` vale
  contro tutti i nemici: limite `pauramischia`;
- **Terrore** (p. 179): alla dichiarazione, e chi fallisce ha una sola
  reazione, la fuga. `reactions` non leggeva `canFlee`: adesso l'arbitro
  le passa `noFlee` e `mustHold`, e un'unità immune non fugge più;
- **Stupidità**: in `inizioTurno`, con il testo che le liste portano
  (`psych.js`), che **non è quello di p. 178** del Core Rulebook — là si
  muove in avanti e non marcia né carica. Limite `stupidita`. Chi è
  stupido non muove, non carica, non tira, non lancia, non dissolve;
- limiti ancora aperti: `frenesia` (l'obbligo di caricare non è
  imposto), `solitari` (la protezione dei 3″ e la schivata, p. 206).

## Fatto: la sfida sul tavolo, tu contro l'AI

`src/controai.js`, dalla scheda Matchup (*Sfida l'AI sul tavolo*) al
pannello **Sfida** del tavolo. L'arbitro tiene la partita, `deploy.js`
la mostra (`mostraSfida`: le unità dell'arbitro diventano quelle del
tavolo; `state.sfida` blocca i trascinamenti e non si salva), le tue
mosse sono i pulsanti delle opzioni dell'arbitro, quelle dell'altro le
sceglie `agenteGemini`. La chiave sta in `localStorage`
(`tow-gemini-key`), mai nei backup. La partita vive nella scheda: non
sopravvive a un ricaricamento — se serve, `S` va reso serializzabile
(`detto` è un `Set`, il terreno ha funzioni `contains`). Prove in
`test/boot.mjs`, sezione «la sfida contro l'AI».

Da fare: salvare la sfida finita nel diario **dall'app** — oggi la
salva `tools/archivia-registro.mjs`, che rilegge il testo di *Copia il
registro* e ne fa una voce di `dati/partite.json` (perdite, cadute,
fughe, i capi che un reggimento travolto si porta via), ma senza le
posizioni, che il registro non scrive. Nella scheda lo stato c'è: basta
chiamare `BL.turnRecord` a ogni passaggio di mano come fa
`tools/archivia.mjs`. E scegliere un bersaglio o un posto cliccando sul
tavolo invece che nell'elenco.

## Quello che è uscito dalla prima sfida vera (Michele contro Gemini)

`dati/partite.json`, *La Strada delle Pietre: Michele (Lizardmen) contro
Gemini (Orchi)*. Quattro round, e cinque cose che l'arbitro sbaglia o
non fa. Sono tutte **verificate nel codice**, non dedotte dal registro:

1. **Il personaggio unito fa il test di rotta per conto suo.**
   `combat.js` mette le schiere `attached` nell'elenco dei perdenti
   (`meleeFight`, la riga `losers.forEach`), e l'arbitro le tratta come
   unità. Nella partita: la Temple Guard si gioca lo Stubborn e ripiega
   in ordine, il suo Saurus Scar-Veteran — il generale — tira da solo,
   va in rotta e se ne va dal tavolo. Un capo unito sta dentro il
   reggimento (p. 207): non tira un test suo e non scappa da solo.
   `scoreCardOf` lo sa già (`const dentro = !!c.attached`), il test no.
   È questo che ha portato i Lizardmen sotto il punto di rottura.
2. **Il punteggio si conta sempre con il formato del Core Rulebook.**
   `arbitro.js`, `punteggio()`: `VC.formatFor(S.scenario)` riceve la
   *stringa* dello scenario, e `formatFor` guarda `scenario.group` —
   vuole l'oggetto, che è `S.sc`. Ogni partita Battle March finisce
   giudicata con lo scarto di 100 punti invece che «vince chi ne ha di
   più» (Battle March p. 27): 382 a 337 è uscito «pareggio», ed è una
   vittoria. Stessa radice: `S.rounds` è 6 fisso (Battle March ne vuole
   5), e gli obiettivi di `victory.js` (`objectivePoints`, i tre tesori
   di questo tavolo) l'arbitro non li conta mai. Da guardare anche il
   §10 di `arbitro.js`, che nel suo commento dice «un esercito sotto il
   punto di rottura ha perso comunque» e poi non lo applica.
3. **Si spara addosso a chi è già in mischia.** `opzioniTiro` guarda se
   è ingaggiato **chi tira**, mai chi è bersagliato: al turno 2 gli
   Skink Skirmishers 3 hanno tirato sui Black Orc Mobs che la Temple
   Guard aveva addosso.
4. **La marcia fallita conta come marcia.** `mossa()` scrive
   `u.moved = { kind:"march" }` anche quando il test di Comando è
   andato male e l'unità ha mosso di un movimento solo. `SH.canShoot`
   blocca chi ha marciato: il Bastiladon, che al turno 3 aveva fallito
   il test, non ha potuto sparare.
5. **Il Panico esiste solo per il tiro.** `psych.js` ha tutte e quattro
   le cause (`PANIC_CAUSES`) e `panicAround` per chiamarle in blocco;
   lo usa solo `deploy.js`. L'arbitro chiama `panico()` dopo un tiro e
   basta: in questa partita nessuno ha tirato il Panico, nemmeno con i
   Black Orc Mobs travolti e tre unità Skink distrutte.

**Da controllare sul libro**, che non è stato:

- si può tirare dopo una carica fallita? (p. 121) `canShoot` non sa che
  cosa sia un `failedCharge`, e al turno 2 gli Skink Skirmishers 3 hanno
  caricato a vuoto e poi tirato;
- chi insegue e arriva addosso a un'unità nuova (p. 156): l'arbitro lo
  fa fermare a contatto e non succede altro — niente carica, niente
  combattimento al turno dopo;
- un tiro che non può andare a segno viene offerto e tirato lo stesso:
  il giavellotto del Bastiladon è uscito due volte «1 tiri a 7+».

**Nei dati**: le liste 3 e 4 si chiamano tutte e due *La Strada delle
Pietre*, e `palmares.js` tiene il record **per nome di lista**: una
partita fra loro due si conta due volte, una vinta e una persa. Adesso
c'è *Rinomina* (vedi sotto), ma i nomi doppi in `dati/liste.json` sono
ancora lì, e sono sei coppie: *Il Guado di Sangue*, *Il Monolite nella
Palude*, *La Strada delle Pietre*, *Le Rovine di Xhotl*, *Tutto*,
*Battle march*. Le rinomina Michele dall'app, non una sessione: sono
sue, e la scelta «le partite restano sue / riparte da zero» è una
domanda a cui sa rispondere solo lui.

## Fatto: i personaggi montati e le liste che si rinominano

`src/mounts.js` e `dati/cavalcature.json`, prove in
`test/cavalcature.mjs`. Quello che è stato deciso:

- **tre generi, come il Core Rulebook alle pp. 204-205**: `cavalcatura`
  (tipo di truppa e Movimento della bestia, R e F solo se la riga dice
  «(+1)»), `mostro` (R e F migliorate come scrive la riga), `carro` (le
  Ferite si sommano, si ferisce sulla R più alta). L'armatura è sempre
  la migliore delle due;
- la tendina **propone e non impedisce**: in cima le cavalcature che il
  libro concede a quel personaggio, sotto le altre dell'esercito;
- **in mischia ogni riga della bestia mena con i suoi numeri**
  (`mountStrikers` in `combat.js`), l'urto e i pestoni con la Forza della
  bestia; le righe della bestia non si colpiscono e non tirano la rotta;
- **i file di New Recruit già montati** si riconoscono dalla `firma` e si
  montano senza sommare i punti due volte; nelle liste vecchie compare
  *sembra su … — Applica*;
- **Lumbering** (p. 195): carri pesanti, mostri e colossi non entrano
  nei reggimenti e non ne ospitano;
- **Rinomina** chiede cosa fare del palmarès se la lista ha già giocato,
  e se lo tiene si porta dietro i nomi di prima (`palmares.js`).

Limiti dichiarati nel README (*Limiti noti*, profilo diviso): la coda
della viverna, il Venom surge dell'Arachnarok, le armi a scelta, la
speciale 5+ della campana contata anche contro la magia. Un reggimento
di **cavalleria** mena ancora con la sola riga del cavaliere.

## Fatto: la Battle march Skaven di Michele entra nelle prove

La lista `lmu8eb7xh723p` (Grey Seer sulla campana, Hell Pit Abomination,
Warp Lightning Cannon) aveva fatto diventare rossa la suite: dieci
regole sconosciute e un'unità in più senza Movimento. Le sei regole
d'unità stanno in `dati/eserciti/skaven.json` (testo della lista, niente
pagina: il libro non è stato aperto), le tre universali nell'`ELSEWHERE`
di `rulebook.js`. **Da fare**, in ordine di quanto pesano:

- **Random Attacks**: la riga «A: D6+1» viene letta da `effects.js` come
  6, senza tirare niente. `rulebook.js` lo dichiara, ma è un numero
  sbagliato che entra nei dadi. La mischia dovrebbe tirare gli attacchi
  a ogni assalto (`contact()` / `attacksOf` in `combat.js`: oggi non
  hanno il generatore in mano) e la previsione usare la distribuzione;
- **Magic Resistance**: `castResult` ha già il posto (`mod`), nessuno ce
  la mette — né il pannello né l'arbitro;
- Blessings of the Horned Rat vale solo contro gli attacchi non magici,
  e l'app la conta sempre (come la speciale della campana).

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

## Compito 2 — le manovre (p. 125) — il prossimo

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
