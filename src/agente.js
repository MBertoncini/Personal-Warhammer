/* Schieramento Old World — chi gioca, quando a giocare non c'è nessuno
 *
 * L'arbitro (`arbitro.js`) elenca le mosse legali e applica quella che
 * gli si passa. Questo file contiene chi la sceglie:
 *
 *   `agenteEuristico`  poche righe di buon senso da tavolo. Serve a
 *     provare l'arbitro senza rete, a far girare mille partite in
 *     qualche secondo, e a fare da rete di sicurezza quando il modello
 *     di linguaggio non risponde o risponde male.
 *
 *   `agenteGemini`  un modello di linguaggio che legge la fotografia
 *     del tavolo, l'elenco delle mosse e sceglie. Non gli si chiede di
 *     sapere le regole: gliele si mette davanti gia' applicate — quanto
 *     dista, che probabilita' ha, cosa dice la pagina — e gli si chiede
 *     una cosa sola, quale mossa e perche'.
 *
 * Il «perché» non e' un ornamento. Una partita fra due macchine che
 * dicono solo «unità 3 carica unità 7» non insegna niente a chi legge;
 * una che dice «carico con i Saurus perché arrivo di fianco e i ranghi
 * non contano più» e' una lezione. Per questo ogni agente torna sempre
 * una scelta E una riga di spiegazione, e l'euristica la scrive come la
 * scriverebbe un giocatore.
 *
 * Niente DOM, niente archivio. La rete la tocca solo `agenteGemini`, e
 * solo se gli si da' una chiave.
 */

/* ============================================================
   1 · IL BUON SENSO DA TAVOLO
   Sei regole, nell'ordine in cui un giocatore le applica. Nessuna e'
   furba: servono a giocare una partita sensata, non a vincerla.
   ============================================================ */
export function agenteEuristico({ nome = "euristica" } = {}){
  let colonna = 0;
  return {
    nome,
    async scegli({ opzioni }){
      const l = opzioni.list;
      const primo = id => l.find(x => x.id === id);

      /* SCHIERAMENTO: si sparpaglia invece di ammucchiarsi in un
         angolo, che e' il modo piu' rapido di perdere una partita. */
      if (primo("schiera")){
        const posti = l.filter(x => x.id === "schiera");
        const scelto = posti[colonna++ % posti.length];
        return { scelta: scelto, perche: `la metto ${scelto.dove}: uno schieramento largo non si fa prendere di fianco` };
      }

      /* RADUNO: sempre. Non provarci non ha mai senso. */
      if (primo("raduna")){
        const r = primo("raduna");
        return { scelta: r, perche: `provo a fermare ${r.nome}: ${r.why}` };
      }

      /* CARICHE: quella con la probabilità più alta, e solo se conviene
         davvero. Sotto il cinquanta per cento una carica fallita
         lascia l'unità ferma e scoperta. */
      const cariche = l.filter(x => x.id === "carica");
      if (cariche.length){
        const best = cariche[0];
        if (best.chance >= 0.5)
          return { scelta: best, perche: `carico ${best.contro} con ${best.nome}: ${best.why}` };
      }

      /* REAZIONE: si tiene, e si spara se si può. Fuggire davanti a una
         carica salva l'unità e regala il campo: lo si fa solo con chi
         non sa combattere. */
      if (primo("reazione")){
        const spara = l.find(x => x.kind === "stand");
        const tieni = l.find(x => x.kind === "hold") || l[0];
        const s = spara || tieni;
        return { scelta: s, perche: s.kind === "stand"
          ? "tengo e sparo: una raffica prima del contatto è gratis"
          : "tengo la posizione: fuggire regala il campo" };
      }

      /* MOSSE: si va addosso al nemico. Chi ha un'arma da tiro e ce
         l'ha già a tiro resta fermo, perché chi muove tira peggio. */
      const avanza = l.filter(x => x.id === "avanza");
      if (avanza.length){
        const a = avanza[0];
        const m = l.find(x => x.id === "marcia" && x.uid === a.uid);
        const lontano = /a (\d+(\.\d+)?)″/.exec(a.why);
        const dist = lontano ? +lontano[1] : 0;
        if (m && dist > 14)
          return { scelta: m, perche: `${m.nome} è lontana: marcia, che è il doppio del Movimento` };
        return { scelta: a, perche: `${a.nome} avanza su ${a.contro}: ${a.why}` };
      }

      /* TIRO: il bersaglio su cui ci si aspetta di far male di più. */
      const tiri = l.filter(x => x.id === "tira");
      if (tiri.length){
        const t = tiri[0];
        return { scelta: t, perche: `${t.nome} tira su ${t.contro}: ${t.why}` };
      }

      /* MISCHIA: si risolve. Non c'è niente da decidere. */
      if (primo("combatti")){
        const c = primo("combatti");
        return { scelta: c, perche: `si risolve il combattimento: ${c.why}` };
      }

      return { scelta: primo("avanti") || l[0], perche: "non c'è altro da fare in questa casella" };
    },
  };
}

/* ============================================================
   2 · IL MODELLO DI LINGUAGGIO
   Gli si manda la fotografia del tavolo, le ultime righe di registro e
   l'elenco numerato delle mosse legali; torna un numero e una frase.

   Tre scelte, e vale la pena dirle:

   NON GLI SI CHIEDE DI SAPERE LE REGOLE. Le probabilità, le distanze e
   le pagine sono già dentro l'elenco: il modello sceglie fra mosse che
   l'arbitro ha già dichiarato legali, e non può inventarne una.

   NON GLI SI CHIEDE DI TIRARE I DADI. I dadi li tira l'arbitro, con la
   sorgente di `dice.js`: una partita si può rigiocare dallo stesso
   seme, e la mossa scelta resta una scelta e non un caso.

   SE SBAGLIA, SI DICE. Una risposta fuori elenco non viene aggiustata
   di nascosto: si scrive nel registro che il modello ha risposto male e
   si gioca la mossa dell'euristica, così chi legge la partita sa quale
   riga non l'ha scelta lui.
   ============================================================ */
export const PROMPT = `Sei un giocatore di Warhammer: The Old World. Comandi un esercito in una partita vera.
Ti arriva la situazione del tavolo e l'elenco NUMERATO delle mosse che le regole ti permettono adesso.
Scegli UNA mossa e spiega in una frase perché, come la spiegheresti a chi sta imparando.

Rispondi SOLO con un oggetto JSON su una riga:
{"scelta": <numero>, "perche": "<una frase, in italiano, che dice il perché tattico>"}

Come si ragiona in questo gioco:
- si vince facendo più punti vittoria, e i punti vengono dalle unità nemiche distrutte o in fuga;
- una carica presa di fianco o di retro vale punti nel risultato del combattimento e toglie i ranghi al nemico;
- i ranghi contano: un reggimento largo e profondo vince i combattimenti anche senza uccidere;
- chi perde un combattimento tira un test di rotta, e chi rompe viene inseguito e travolto;
- le unità da tiro non vanno mandate in mischia, e chi spara dopo aver mosso colpisce peggio;
- un'unità sola contro due nemici perde: si arriva in due sullo stesso bersaglio quando si può;
- la mossa «passa» chiude la fase: le unità che non hanno ancora agito in questa fase restano come sono;
- un tiro con una probabilità bassa di colpire vale poco: meglio avvicinarsi o cambiare bersaglio.`;

export function agenteGemini({ apiKey, model = "gemini-3.6-flash", fetchFn = null,
                               nome = "Gemini", riserva = null, onError = null,
                               attesa = 0, ritenta = 3, dormi = null } = {}){
  const rete = fetchFn || (typeof fetch === "function" ? fetch : null);
  const fallback = riserva || agenteEuristico({ nome: nome + " (riserva)" });
  /* Una partita sono un centinaio di domande, e le fa tutte di fila:
     le quote gratuite contano le richieste al minuto, e senza un passo
     fra una e l'altra la partita muore di «429, troppe richieste» a
     meta' del terzo turno. L'attesa e' quel passo; il ritentare e'
     quello che si fa quando il 429 arriva lo stesso. */
  const pausa = dormi || (ms => new Promise(r => setTimeout(r, ms)));
  let ultima = 0;
  return {
    nome, model,
    async scegli(ctx){
      const { opzioni, fotografia, registro } = ctx;
      const l = opzioni.list;
      if (l.length === 1) return { scelta: l[0], perche: "è l'unica mossa possibile" };
      if (!rete || !apiKey){
        const r = await fallback.scegli(ctx);
        return { ...r, perche: r.perche + " [nessuna chiave: gioca l'euristica]" };
      }
      const elenco = l.map((x, i) => `${i + 1}. ${descrivi(x)}`).join("\n");
      const testo = [
        PROMPT, "",
        "=== IL TAVOLO ===", fotografia, "",
        "=== ULTIME COSE SUCCESSE ===", registro || "(niente)", "",
        `=== ADESSO: ${opzioni.fase}${opzioni.what ? " — " + opzioni.what : ""} ===`,
        elenco,
      ].join("\n");
      try {
        if (attesa > 0){
          const passato = Date.now() - ultima;
          if (passato < attesa) await pausa(attesa - passato);
        }
        const scelto = await conRitenta(() => chiedi(rete, apiKey, model, testo), ritenta, pausa);
        ultima = Date.now();
        const n = Math.round(+scelto.scelta);
        if (!(n >= 1 && n <= l.length)) throw new Error(`ha risposto ${scelto.scelta}, fuori dall'elenco di ${l.length}`);
        return { scelta: l[n - 1], perche: String(scelto.perche || "").trim() || "(non ha detto perché)" };
      } catch (e){
        if (onError) onError(e);
        const r = await fallback.scegli(ctx);
        return { ...r, perche: r.perche + ` [il modello non ha scelto: ${e.message}; gioca l'euristica]`,
                 errore: e.message };
      }
    },
  };
}

/* la mossa come la legge chi deve sceglierla: cosa fa, contro chi, e
   quello che l'arbitro ha già calcolato */
export function descrivi(x){
  /* «avanti» per l'arbitro vuol dire «ho finito questa casella»; a un
     modello che legge l'italiano sembra «avanza», e sceglierlo al posto
     di una marcia lasciava ferme tutte le unita' non ancora mosse */
  if (x.id === "avanti") return `passa — ${x.why || "nessun'altra mossa in questa fase"}`;
  const chi = x.nome ? ` (${x.nome})` : "";
  const contro = x.contro ? ` contro ${x.contro}` : "";
  const dove = x.dove ? ` ${x.dove}` : "";
  const page = x.page ? ` [p. ${x.page}]` : "";
  return `${x.id}${chi}${contro}${dove} — ${x.why || ""}${page}`;
}

/* «Troppe richieste» e «il servizio e' occupato» non sono errori di chi
   gioca: sono il traffico. Si aspetta e si richiede, con l'attesa che
   raddoppia, e solo dopo si passa la mano all'euristica. */
async function conRitenta(fn, quante, pausa){
  let ultimo = null;
  for (let i = 0; i <= Math.max(0, quante); i++){
    try { return await fn(); }
    catch (e){
      ultimo = e;
      if (!/HTTP (429|500|502|503|504)/.test(e.message)) throw e;
      if (i < quante) await pausa(1500 * Math.pow(2, i));
    }
  }
  throw ultimo;
}

async function chiedi(rete, apiKey, model, testo){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await rete(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: testo }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok){
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const parti = ((data.candidates || [])[0] || {}).content;
  const txt = ((parti && parti.parts) || []).map(p => p.text || "").join("").trim();
  if (!txt) throw new Error("risposta vuota");
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("nessun JSON nella risposta: " + txt.slice(0, 120));
  return JSON.parse(m[0]);
}

/* ============================================================
   3 · LA PARTITA
   Il giro: si chiede all'arbitro cosa si può fare, si chiede a chi
   gioca cosa vuole fare, si applica. Chi guarda riceve ogni passo, e
   può stamparlo, salvarlo o disegnarlo.
   ============================================================ */
export async function giocaPartita(AR, S, { A, B, onPasso = null, maxPassi = 6000 } = {}){
  let passi = 0;
  while (!S.finita && passi < maxPassi){
    const o = AR.options(S);
    if (!o.list.length) break;
    const chi = o.player === "A" ? A : B;
    const ctx = {
      opzioni: o,
      fotografia: AR.fotografia(S, { per: o.player }),
      registro: AR.ultimeRighe(S, 10),
      stato: S,
    };
    const scelta = await chi.scegli(ctx);
    const mossa = scelta && scelta.scelta;
    const r = AR.apply(S, mossa);
    passi++;
    if (onPasso) onPasso({ passo: passi, player: o.player, agente: chi.nome, opzioni: o,
                           mossa, perche: scelta ? scelta.perche : "", esito: r, stato: S });
    if (!r.ok && mossa && mossa.id !== "avanti"){
      /* una mossa rifiutata non blocca la partita: si passa avanti e
         si scrive perché, che è quello che farebbe un arbitro vero */
      AR.apply(S, { id: "avanti" });
    }
    AR.controllaFine(S);
  }
  if (!S.finita) AR.fine(S, "la partita si è fermata: troppi passi");
  return S.esito;
}
