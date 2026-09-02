# Schieramento Old World

Tre cose che si tengono per mano, per **Warhammer: The Old World**:

1. **Catalogo** — la collezione di miniature, una voce per tipo di modello, con quante ne possiedi e una foto.
2. **Liste** — i roster esportati da New Recruit, con ogni unità agganciata a una voce del catalogo.
3. **Matchup e tavolo** — due liste a confronto, la verifica di cosa hai davvero in vetrina, e il simulatore di schieramento con zone, terreno e controlli di legalità.

Tutto gira nel browser. Nessun server, nessun account, nessun dato che esce dal dispositivo.

---

## Come si usa

### 1. Riempi il catalogo

Scheda **Catalogo** → *Nuova voce*. Una voce è un **tipo di modello**, non una miniatura singola:

| Campo | Esempio |
|---|---|
| Nome | `Black Orc` |
| Fazione | `Orc & Goblin Tribes` |
| Quantità posseduta | `12` |
| Basetta | `25×25 — fanteria` |

Poi tocca il riquadro della foto e carica un'immagine delle tue miniature dipinte. Viene ridotta a un quadrato da 256 px (~15 KB) prima di essere salvata: le foto da telefono così come sono riempirebbero la quota in poche decine di scatti.

Perché per tipo e non per singola miniatura: i tuoi 24 Orc Boyz sono un mob da 25 in una lista e due mob da 12 in un'altra. L'unico conteggio che regge sotto queste condizioni è *tipo + quantità*.

### 2. Importa le liste

Scheda **Liste** → *Importa da New Recruit*. Accetta i `.json` e i `.ros`.

Ogni unità viene agganciata al catalogo da sola quando il nome combacia: `11 Black Orc Mob` trova `Black Orc` da sé, perché l'aggancio ignora il numero iniziale, le parole di servizio (`mob`, `unit`, `regiment`) e le desinenze plurali.

Quando non combacia, l'unità appare con la spunta gialla *da agganciare* e un menu con i candidati più probabili. **Lo scegli una volta**: la scelta viene salvata come alias sulla voce di catalogo e da lì in poi quel nome si aggancia da solo, in ogni lista futura. Se la voce non esiste ancora, `+ crea voce` la genera già compilata.

### 3. Matchup

Scheda **Matchup**: scegli le due liste e dichiara chi porta le miniature.

- **Solo l'esercito A (o B) è mio** — la verifica confronta quella lista con la collezione.
- **Entrambi dalla mia collezione** — le due liste vengono **sommate** prima del confronto. È il caso in cui giochi in casa con entrambi gli eserciti tuoi: se una voce compare in tutte e due, gli stessi modelli fisici non possono essere schierati due volte, e senza la somma il controllo direbbe di sì a torto.

Il verdetto elenca ogni voce con `richiesti/posseduti` e segna in rosso lo scoperto.

*Porta sul tavolo* carica le due liste negli eserciti A e B del simulatore.

### 4. Tavolo

Scenari Battle March e generici, zone di schieramento, terreno con i controlli (tesori a più di 3″ da ogni elemento, nessun pezzo oltre i 12″ sul lato lungo), rotazione, snap a ¼″, misurazione.

Ogni unità nella lista laterale mostra **un'anteprima per modello**: 11 Black Orc = 11 anteprime, con la foto presa dal catalogo. Finché la foto non c'è restano quadrati nel colore dell'esercito.

*Salva schieramento* dalla scheda Matchup archivia la disposizione corrente; la ritrovi in fondo alla stessa scheda.

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

Per spostarli usa **Backup** (scarica un JSON con tutto, foto comprese) e **Ripristina** sull'altro dispositivo. Vale anche come copia di sicurezza: `localStorage` e IndexedDB spariscono se cancelli i dati del sito.

---

## Struttura

```
index.html            guscio, schede, contenitori
styles/app.css        tutto il foglio di stile
src/
  util.js             quattro funzioni di servizio
  bases.js            basette e frontage predefinito per tipo di truppa
  parser.js           lettura dei file New Recruit / BattleScribe
  terrain.js          tipi di elemento scenico e loro limiti
  scenarios.js        scenari, zone di schieramento, geometria
  store.js            IndexedDB, ridimensionamento foto, backup
  bus.js              eventi, per non far importare i moduli fra loro
  catalog.js          voci di collezione, foto, aggancio dei nomi
  lists.js            liste salvate e collegamento unità → catalogo
  matchup.js          disponibilità, schieramenti salvati
  deploy.js           stato del tavolo, pannelli, campo di battaglia
  main.js             avvio e schede
test/
  smoke.mjs           catalogo, aggancio, import, copertura, persistenza
  boot.mjs            avvia la pagina intera e gira fra le schede
```

`deploy.js` è grosso perché stato, pannelli e disegno del campo sono davvero un blocco solo: spezzarlo produrrebbe moduli che si importano a vicenda senza guadagnare niente.

### Prove

```bash
npm install
npm test
```

Girano in jsdom con IndexedDB finto, senza browser.

---

## Limiti noti

- L'aggancio automatico è volutamente prudente: se ha un dubbio non decide e chiede. Meglio una spunta gialla che un conteggio sbagliato in silenzio.
- Le anteprime per modello si fermano a 60 per riga; oltre compare `+N`.
- I dati non si sincronizzano fra dispositivi: c'è il backup manuale, non una nuvola.
- Il parser legge quello che New Recruit esporta. Se una lista arriva con basette insolite le stima dal tipo di truppa, e le puoi correggere a mano nell'ispettore.

## Licenza

Codice sotto licenza MIT — vedi [LICENSE](LICENSE).

Warhammer, The Old World e i nomi di fazioni e unità appartengono a Games Workshop Limited. Il progetto non è affiliato né approvato da GW, non contiene regole o profili tratti dalle loro pubblicazioni e non distribuisce immagini dei loro prodotti. Le foto che carichi nel catalogo restano sul tuo dispositivo.
