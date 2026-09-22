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
- **Prove per tutto.** `npm test` (~2000 asserzioni, un minuto o due). Ogni regola
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

**Nei dati**: la lista *Skaven Battle March*, che non aveva né tipo di
truppa né armi, Michele l'ha tolta (2026-09-19). `partita.mjs` continua
a dire all'avvio se una lista è in quello stato.

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
Gemini (Orchi)*. Quattro round, e cinque cose che sembravano sbagliate.
Quattro sono chiuse, con il libro aperto e le prove rosse prima:

1. ~~**Il personaggio unito fa il test di rotta per conto suo.**~~
   Fatto: in `meleeFight` il test lo tira il reggimento (p. 207), e il
   capo solo se del reggimento non resta nessuno. `combatant()` adesso
   dà al reggimento il Comando più alto fra i modelli (p. 97) anche
   fuori dall'arbitro — il pannello tirava col Comando della truppa.
   Prove in `test/mischia.mjs`.
2. ~~**Il punteggio si conta sempre con il formato del Core Rulebook.**~~
   Fatto: `S.formato` dallo scenario, cinque round in Battle March (p. 27),
   sei nel Core; il generale e lo stendardo da battaglia persi valgono i
   loro bonus (`S.bsb`, da `PREP.guessBsb`); tesori e landmark si contano a
   fine di ogni turno di giocatore (`obiettivi`, `S.fineTurni`, con
   `objectiveHolder`) e stanno nella fotografia per chi gioca. **Il punto
   di rottura non è una regola di tutte le partite**: sul Core Rulebook
   è la durata di uno scenario (p. 291, «There is no turn limit…»), e in
   Battle March non c'è. Adesso vale solo con `newBattle({ durata:
   "breakpoint" })`, e chi si rompe perde con vittoria schiacciante. Gli
   stendardi presi come trofeo restano fuori: limite `trofei`.
3. ~~**Si spara addosso a chi è già in mischia.**~~ Fatto: p. 143.
4. ~~**La marcia fallita conta come marcia.**~~ **Non era un errore**: «if
   a unit attempts an Enemy Sighted test in order to march and fails, it
   is considered to have marched, even if its controlling player then
   elects to not move the unit at all» (p. 123), e chi ha marciato non
   tira (p. 137). Il Bastiladon non poteva sparare. C'è la prova, e un
   commento in `mossa()` perché non lo si «corregga».
5. ~~**Il Panico esiste solo per il tiro.**~~ Fatto, e letto sul libro
   (pp. 160-161), che diceva più del piano: chi fallisce **ripiega in
   ordine** se ha ancora più di metà dei modelli d'inizio battaglia, e
   fugge solo sotto (`PS.panicFail`); chi è in combattimento non tira per
   nessuna causa; la fonte deve avere Forza d'Unità 5 o più; anche chi
   ripiega in ordine dopo una sconfitta manda al Panico, e chi esce dal
   tavolo fuggendo «counts as having been destroyed» (p. 132).
   Nell'arbitro: `testPanico` (uno per fase), `ondaPanico` (gli amici
   entro 6″), `attraversati` (chi fugge o ripiega passando sugli amici).
   Il pannello del tavolo propone l'esito del libro e fugge dal nemico —
   prima fuggiva dall'amico caduto. Anche i colpi degli incantesimi
   adesso contano per il quarto perso (`inizioFase`); prima `colpisci`
   chiamava `panico` con gli argomenti scambiati.

Le partite archiviate prima di queste correzioni hanno il verdetto con
le regole vecchie: la sfida di Michele era una vittoria dei Lizardmen
(382 a 337), e nel diario è un pareggio. Il diario non si riscrive da
solo; se Michele lo vuole, si corregge a mano la voce.

**Da controllare sul libro**:

- si può tirare dopo una carica fallita? p. 137 dice «a unit cannot
  shoot if it charged or marched during the preceding Movement phase»,
  e una carica fallita è una carica dichiarata che si muove: la lettura
  più probabile è che non tiri, ma `canShoot` non sa che cosa sia un
  `failedCharge`. Al turno 2 gli Skink Skirmishers 3 hanno caricato a
  vuoto e poi tirato;
- chi insegue e arriva addosso a un'unità nuova (p. 156): l'arbitro lo
  fa fermare a contatto e non succede altro — niente carica, niente
  combattimento al turno dopo;
- ~~un tiro a 7+~~: è una regola (p. 139, il 6 e poi un altro dado), e il
  giavellotto del Bastiladon lo tirava giusto.

**Nei dati**: le liste 3 e 4 si chiamano tutte e due *La Strada delle
Pietre*, e `palmares.js` tiene il record **per nome di lista**: una
partita fra loro due si conta due volte, una vinta e una persa. Fatto:
con *Rinomina* Michele ha dato a ogni lista l'esercito nel nome (*La
Strada delle Pietre LIZ*, *… O&G*, *Tutto SKA*…), e ne ha tolte due. Le
partite vecchie nel diario portano ancora i nomi di prima: il palmarès
le ritrova solo se, rinominando, si è scelto «restano sue».

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

La lista `lmu8eb7xh723p`, oggi *Tutto SKA* (Grey Seer sulla campana, Hell Pit Abomination,
Warp Lightning Cannon) aveva fatto diventare rossa la suite: dieci
regole sconosciute e un'unità in più senza Movimento. Le sei regole
d'unità stanno in `dati/eserciti/skaven.json` (testo della lista, niente
pagina: il libro non è stato aperto), le tre universali nell'`ELSEWHERE`
di `rulebook.js`. **Da fare**, in ordine di quanto pesano:

- ~~**Random Attacks**~~ — fatto (p. 176): `randomAttacksOf` in
  `combat.js` legge «D6+1», fuori dall'assalto vale la media (4,5),
  dentro `meleeFight` si tira un dado per modello che mena
  (`attacksFor`, ricordato in `rolls` perché la stessa fila si misura
  più volte), e gli effetti sugli Attacchi si sommano al dado.
  `meleeFight` torna `randomA` e l'arbitro lo scrive nel registro.
  Resta al primo numero la riga di un equipaggio o di una cavalcatura
  (`attackRows` in `mounts.js`: i ratti della Doom-Wheel);
- ~~**Abominable Attacks**~~ — fatto nell'arbitro: una domanda in
  sospeso `abominio` a chi possiede l'Abominio, dopo la sfida e prima
  degli assalti (`chiediAbominio`), con tre scelte che portano le ferite
  attese: attaccare normalmente, nutrirsi (`nutriti`: un tiro per
  colpire, D3 ferite senza armatura su un modello solo) o la valanga di
  carne (`valanga`: sagoma piccola sul centro, senza deviazione, Forza
  dell'Abominio e PA −2 a chiunque ci stia sotto). Si risolvono prima
  che si meni (limite `abominio`); le ferite entrano nel risultato con
  `preDealt`, e la schiera non attacca normalmente (`noAttacks` in
  `combat.js`) ma i pestoni restano. Il pannello del tavolo non li offre;
- ~~**Random Movement**~~ (p. 176) — fatto nell'arbitro: niente carica
  dichiarata né marcia né manovre; nelle mosse ci sono solo le opzioni
  `vaga` (la carica, se il Movimento tirato basta, poi verso il nemico
  più vicino, poi dritta), e chi passa senza averla mossa si muove da solo
  (`vaganoDaSoli`). Chi arriva a contatto ha caricato e il bersaglio tiene
  senza reagire. Limite `vagante`: si muove nelle mosse con tutti gli
  altri, e l'inseguimento che tocca un'unità nuova non conta come carica.
  Mancano ancora Too Horrible To Die e Timmm-berrr!;
- ~~**Magic Resistance**~~ — fatto (p. 108): `MG.magicResistance` sulle
  regole dell'unità e dei capi uniti, il −X più alto; solo contro gli
  incantesimi del nemico. La sottraggono `lancia` e `opzioniLancio`
  nell'arbitro (`resistenza`) e il lancio del pannello in `deploy.js`.
  Resta testo la «Magia residua» del terreno selvaggio (Battle March);
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

## Compito 2 — fatto: le manovre (pp. 124-125)

Letto sul libro (pp. 123-125, 185, 195, 205). Quello che è stato deciso,
perché non si rifaccia la stessa strada:

- **la ruota si paga** in `avanza` e `marcia` (`pianoRuota`): quanto
  cammina il modello esterno, cioè il fronte per l'angolo. Chi non ce la
  fa ruota quanto può e non avanza, e l'opzione lo dice prima. Si ruota
  **una volta, all'inizio, sul centro**, poi si va dritti: il libro la fa
  sullo spigolo e lascia alternare ruote e passi (limite `ruota`). Se
  girarsi farebbe entrare il pezzo in un vicino non si gira, e con il
  nemico nella metà davanti si va dritti con tutto il movimento
  (`avanzaRuotando`). La carica fallita e l'inseguimento girano ancora
  gratis (`muoviVerso`): lo dice il libro (pp. 121, 156);
- **chi non manovra** (`sciolta`): gli schermagliatori (p. 185) e il
  personaggio da solo, che è sempre in formazione sciolta (p. 205). I
  Lumbering hanno 90° gratis se non marciano (p. 195), presi prima di
  muoversi invece che dopo;
- le mosse nuove, in `opzioniManovra` e applicate da `manovra`: `gira`
  (¼ o ½ del Movimento, i ranghi diventano file — una Temple Guard 5×3
  diventa 3×5, in colonna — e poi dritti con il resto), `riforma` (sul
  centro, tiene il fronte, tutto il movimento; conta come mossa per il
  tiro, p. 139), `indietro` (metà, solo se un nemico davanti ti può
  caricare: `portataCarica`), `lato` (metà, per mettersi davanti al
  nemico), `riordina` (±5 in prima fila, il fronte più largo e il più
  stretto che resta in ordine di combattimento; la prima fila resta
  ferma). Una manovra per movimento: chi l'ha fatta ha `moved`;
- **la riforma si offre solo a chi non riesce a girarsi ruotando**: al
  primo giro l'euristica faceva riformare i Troll, che con due pollici di
  ruota avrebbero camminato. L'euristica la sceglie quando c'è;
- la fotografia per il modello dice com'è schierata un'unità (`5×3`) e
  se il nemico più vicino sta sul fianco o alle spalle; il prompt dice
  quanto costa girarsi;
- due difetti trovati strada facendo: `percorso` si fermava all'ultimo
  quarto di pollice intero (1,94″ diventavano 1,75), e i capi di un
  reggimento caduto restavano tutti nel centro, uno sopra l'altro
  (`affianca`). `controlla-partita` lo ha trovato col seme 77.

Prove in `test/arbitro.mjs`, sezioni «le manovre» e «i capi di un
reggimento caduto». La prova magica del seme 3 chiedeva un dissolvimento
a ogni partita: con la ruota pagata l'Oddnob fa 8 contro 9 e non lancia,
e adesso il dissolvimento si chiede alle tre partite insieme.

**Resta**, dichiarato in `LIMITI` (`ruota`, `manovre`): più ruote nello
stesso movimento, la ruota sullo spigolo, il resto del movimento dopo un
riordino, la riforma che cambia la formazione, il riposizionamento del
gruppo di comando dopo un giro (p. 198). **Nei dati**: il parser legge
**Open Order** come formazione sciolta (`parser.js`, `loose`), e i
Warplock Jezzails e gli Squig si girano gratis, vedono a 360° e danno −1
a chi li bersaglia. Il libro (p. 183) li vuole in ranghi, con un giro
rapido di 90° dopo essersi mossi (salvo marcia, carica, fuga). Serve un
campo `formation` distinto da `loose`, e tocca tiro, archi e manovre.
Già che ci si è: il −1 al tiro contro gli schermagliatori `shoot.js` lo
dà a ogni unità `loose`, e p. 185 lo dà solo a quelle fatte tutte di
modelli con Forza d'Unità 1.

## Compito 3 — fatto: le sfide (pp. 211-212)

Tre decisioni, e adesso sono tre domande in sospeso come la reazione
alla carica: `sfida`/`nessuna`, `accetta`/`rifiuta`, `ritira`. Quello
che è stato deciso, perché non si rifaccia la stessa strada:

- **il duello sta in `meleeFight`**, e non è un filtro sui colpi: la
  sfida **riscrive l'ingaggio** (`duelLinks`), perché l'ingaggio è già
  la domanda «chi mena a chi». I due si vedono solo fra loro, nessun
  altro li vede, e lo sfidante porta *tutti* i suoi attacchi sul
  rivale invece di spartirsi la prima fila. `challenge` ha due forme e
  vanno tenute tutte e due: `true` è la sfida del pannello delle due
  schiere («conta l'overkill»), `{ a, b }` è quella del manuale;
- **la cavalcatura** segue il cavaliere da sola (eredita `duel` dalla
  riga dell'ospite), e **il rivale già caduto non la ferma** (p. 212):
  quei colpi si tirano, contano per l'overkill (`c.oltre`) e **non**
  entrano nel risultato del combattimento, che conta le ferite perse;
- **l'overkill si misura sulle ferite che il rivale aveva addosso
  all'inizio del round**, profilo meno quelle già prese — prima
  `challenge: true` le sommava su tutto il gruppo nemico;
- **il ritiro toglie quello che si sa togliere** (`capiInFila`): i
  colpi, il Comando (p. 97) e le regole che il capo presta. Il passo e
  la Forza d'Unità gli restano, ed è il limite `ritirato`;
- **rifiutare si può solo se nessuno dei possibili raccoglitori è con
  le spalle al muro** (p. 212: personaggio da solo, o reggimento
  ingaggiato su tutti e quattro i lati). I quattro lati li dice dove
  sta il nemico **intero** e non il punto in cui le basette si
  sfiorano (`circondata`): con il punto più vicino un reggimento preso
  su tre lati risultava preso su uno;
- **una sfida che nessuno può raccogliere non si offre**: è legale e
  «resta senza risposta», e questo arbitro non offre gesti che non
  cambiano niente;
- ogni opzione porta i suoi numeri (`duelloFra`: quante ferite fa,
  quante ne prende, su quante ne restano, e un `vantaggio`), e
  l'euristica di `agente.js` decide con quelli.

Prove in `test/mischia.mjs` («la sfida, come duello vero») e
`test/arbitro.mjs` («le sfide»). Una prova vecchia è stata riscritta:
cercava «rifiutat» nel registro per dire che nessuna mossa era stata
respinta, e una **sfida rifiutata** è una mossa legale che nel registro
si scrive proprio così — adesso le mosse respinte si raccolgono da
`onPasso`, che è quello che la prova voleva sapere.

**Resta**, dichiarato in `LIMITI`:

- `campioni`: il libro fa sfidare «un personaggio **o un campione**», e
  il file di New Recruit segna solo che il gruppo di comando c'è
  (`command.champion`) senza dare al campione un profilo. Senza
  profilo non si duella;
- `ritirato`: il passo e la Forza d'Unità che il ritirato continua a
  dare al reggimento;
- la sfida del **pannello del tavolo** (`duel.js`, la spunta *sfida*) è
  ancora quella che conta e basta: là il combattimento *è* la sfida, e
  non c'è nessun altro da cui distinguere i due. Se un giorno il
  pannello mostrerà anche i reggimenti attorno, vorrà la forma
  `{ a, b }`.

## Compito 4 — fatto a metà: le sagome sparano, e il volo no

`shoot.js` aveva sagome, deviazione e le due tabelle del Mancato Colpo
dalla Tappa 4, e nessuno gliele chiedeva; `formation.js` sapeva dare la
posizione modello per modello da sempre. Adesso l'arbitro le mette
insieme. Quello che è stato deciso, perché non si rifaccia la stessa
strada:

- **la Bombardata** (pp. 224-226): si sceglie un bersaglio, la sagoma si
  posa sul **centro** della sua unità, artiglieria e deviazione la
  spostano, e chi resta sotto è colpito — del tutto sempre, in parte a
  4+ (p. 95). **Niente tiro per colpire**: «this weapon does not use its
  crew's Ballistic Skill». Poi i colpi si tirano per ferire come tutti
  gli altri. Gesto `bombarda`, in `arbitro.js`;
- **la sagoma non guarda le bandiere**: `caselleDelTavolo` prende le
  basette di tutto il tavolo, amiche comprese, e un personaggio unito a
  un reggimento — che a un arco non si potrebbe bersagliare (p. 209) —
  sotto la sagoma è una basetta come le altre, perché `layout` gliene dà
  una marcata `char` con il suo uid;
- **il buco centrale è un PUNTO e non un cerchio.** Il libro gli dà due
  regole — colpito anche se ci sta sotto solo in parte (p. 95), e la
  Forza fra parentesi (p. 224) — e non gli dà un diametro. `modelsUnder`
  torna `hole`: il modello la cui basetta sta sopra il centro della
  sagoma, e se sono due il più vicino di centro («a single model»);
- **una sagoma che i libri in casa non descrivono non si spara.** Quale
  sagoma usa un'arma sta nelle Note del profilo, e l'export le butta
  via: `SH.BOMBARDS` ha i tre pezzi che i libri descrivono (lanciapietre
  3″, mortaio 5″, Plagueclaw 5″), e per gli altri c'è il limite
  `bombardata`. Fra tre pollici e cinque ce ne sono due di diametro;
- **il Warp Lightning Cannon** — l'unica macchina delle liste salvate, e
  non aveva mai sparato un colpo. Non è una sagoma: è una **linea** di
  8D6″ dal bordo della basetta, e chi ci finisce sotto (amico o nemico)
  prende un colpo di Forza pari a un dado di artiglieria (Legends:
  Skaven, p. 19). Gesto `fulmina`, geometria `SH.lineUnder`, e la terza
  tabella del Mancato Colpo in `SH.MISFIRE.warpLightning`.

**Quattro regole lette sul libro**, che valevano in ogni partita e non
solo per le macchine: «Weapon of War» (p. 197 — niente marcia, niente
carica, niente inseguimento, −1 alla fuga, giro gratis); «Move or Shoot»
(p. 174), che è un divieto dell'**arma** e non arrivava a `canShoot`, per
cui i Warplock Jezzails marciavano e sparavano; «Cumbersome» (p. 167 —
niente *tira e tieni*) e «Ponderous»/«Quick Shot» (p. 175), che erano
dichiarate da verificare. **«Quick Shot» non dà tiri in più**: questo
repo lo diceva, ed era un'invenzione del nome.

E due cose dell'euristica: cercava `tira` e basta, così la macchina
restava ferma con la sua opzione in elenco; e non sapeva restare ferma
per sparare, che il commento prometteva da sempre — adesso l'opzione
`ferma` porta `tieniIlTiro` quando muoversi costerebbe il tiro.

### Quello che del Compito 4 resta

- **Il volo**, che è una decisione e non un conto: `profiles.js` dà il
  numero (`Fly (n)`), e sorvolare vuol dire ignorare il terreno e le
  unità in mezzo. Oggi il movimento dell'arbitro è una linea retta.
  Limite `volo`;
- **gli altri quattro modi di sparare di una macchina**: la palla di
  cannone con il rimbalzo e il «Crunch» (p. 226 — la linea `lineUnder`
  c'è già, mancano il tetto di un colpo per rango o per fila e le due
  cose che la fermano di colpo), la grappola, l'organo, il lanciafiamme.
  Limite `sagome`;
- **«Multiple Wounds»** (p. 175), letta e non tirata: ogni ferita non
  salvata ne vale X su **un** modello, e l'eccesso non passa al vicino —
  per questo non si può sommare e dividere, si deve scorrere ferita per
  ferita. Sul lanciapietre vale solo per il modello sotto il buco.
  Limite `ferite`;
- **il tiro indiretto** (p. 225), che è una scelta da dichiarare prima
  di sparare: niente linea di vista, e la deviazione ridotta
  dell'Abilità Balistica dell'equipaggio. Limite `indiretto`;
- **il profilo diviso** di una macchina da guerra (p. 97): Resistenza e
  Ferite dell'equipaggio in combattimento, quelle della macchina fuori,
  e il modello che se ne va se uno dei due arriva a zero. Oggi l'app
  tiene una riga sola. Limite `macchina`, che dice anche l'altra cosa
  che manca: il giro che **non** conta come essersi mossa, che per
  un'arma «o si muove o tira» è la differenza fra sparare e non sparare;
- il pannello del tavolo (`deploy.js`, `runBombard`) conta i colpi di
  sagoma **direttamente come perdite**, senza tirare per ferire né le
  salvezze. L'arbitro li tira; il pannello no.

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
