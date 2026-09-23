/* Schieramento Old World — chi guarda una mossa avanti
 *
 * L'euristica (`agente.js`) decide una unita' alla volta con un elenco
 * di regole in fila: la prima che si applica vince. Non si chiede mai
 * «e poi?». Questo agente se lo chiede, per un passo solo, e con i
 * numeri che l'arbitro sa gia' fare:
 *
 *   LE CARICHE si decidono tutte insieme, come un problema di
 *     assegnazione. Per ogni coppia caricatore-bersaglio il guadagno e'
 *     quanto quella carica aggiunge a quelle gia' decise sullo stesso
 *     bersaglio (`scontroDiGruppo`: le ferite si sommano, ranghi e
 *     stendardo no, il fianco una volta per nemico, p. 153), pesato per
 *     la probabilita' che arrivi. Si prende la coppia che rende di piu',
 *     si ricalcola, e cosi' finche' qualcosa rende: e' l'algoritmo
 *     goloso per le funzioni a rendimenti decrescenti, e da' il secondo
 *     caricatore sul reggimento che il primo non basta a rompere invece
 *     di due cariche mediocri su due bersagli.
 *
 *   IL MOVIMENTO, IL TIRO E LE REAZIONI si provano. Per l'unita' che
 *     l'euristica muoverebbe, ogni mossa che l'arbitro le offre si
 *     applica su una copia della partita (`clona`), si lascia rispondere
 *     l'avversario se deve (una reazione alla carica), e la posizione
 *     che ne esce si misura con `valuta`: punteggio, ferite, mischie in
 *     corso e le cariche del turno che viene. Dove ci sono dadi — un
 *     tiro, un test di marcia, la reazione — si campionano poche volte
 *     su una sorgente a parte, e la media decide. La sorgente vera si
 *     rimette dopo: la partita tira gli stessi dadi con o senza chi ci
 *     pensa sopra.
 *
 *   TUTTO IL RESTO — schieramento, magia, sfide — lo fa l'euristica.
 *
 * E' un passo solo, non una ricerca ad albero: una partita dura poco
 * meno di un secondo, e cento simulazioni per ogni decisione la
 * porterebbero a minuti. Il passo solo costa qualche decina di
 * valutazioni per turno, e la differenza con l'euristica la misura
 * `node tools/partita.mjs --partite N --specchio --ricerca x`.
 *
 * Il «perche'» resta quello di un giocatore: la mossa scelta porta i
 * numeri che l'hanno fatta scegliere.
 */

import * as D from './dice.js';
import { agenteEuristico } from './agente.js';

const MOSSE = new Set(["avanza", "accosta", "marcia", "ferma", "aggira", "riforma", "gira", "indietro", "lato", "riordina"]);
const TIRI = new Set(["tira", "bombarda", "fulmina"]);

export function agenteRicerca({ AR, base = null, nome = "ricerca", campioni = 3, soglia = 5, seme = 1,
                               avversario = null } = {}){
  const euristica = base || agenteEuristico({ nome: nome + " (euristica)" });
  /* chi risponde nelle copie: l'euristica, senza estro, per tutte e due
     le parti — il modello di un avversario ragionevole, non di uno bravo */
  const lui = avversario || agenteEuristico({ nome: "avversario immaginato" });
  let passo = 0;

  /* una copia, la mossa, le risposte dell'avversario fino a quando la
     mano torna a noi (o la domanda in sospeso si chiude) */
  async function prova(S, mossa, me, k){
    const T = AR.clona(S);
    const r = AR.apply(T, mossa);
    if (!r.ok) return null;
    for (let i = 0; i < 12 && !T.finita; i++){
      const o = AR.options(T);
      if (!T.pending || o.player === me) break;
      const s = await lui.scegli({ opzioni: o, stato: T });
      if (!s || !s.scelta || !AR.apply(T, s.scelta).ok) break;
    }
    return AR.valuta(T, me);
  }

  /* la media su qualche dado finto; la sorgente vera si rimette sempre */
  async function media(S, mossa, me){
    const vera = D.getSource();
    const valori = [];
    try {
      for (let k = 0; k < campioni; k++){
        D.setSource(D.seeded(((seme * 7919) ^ (passo * 104729) ^ (k * 1299709)) >>> 0 || 1));
        const v = await prova(S, mossa, me, k);
        if (v != null) valori.push(v);
      }
    } finally { D.setSource(vera); }
    return valori.length ? valori.reduce((s, v) => s + v, 0) / valori.length : null;
  }

  /* ---- le cariche: l'assegnazione golosa ---- */
  function assegna(S, cariche){
    const gruppi = new Map(), prese = new Set(), piano = [];
    for (;;){
      let meglio = null;
      for (const c of cariche){
        if (prese.has(c.uid)) continue;
        const u = S.units.find(x => x.uid === c.uid), t = S.units.find(x => x.uid === c.target);
        if (!u || !t) continue;
        const G = gruppi.get(c.target) || [];
        const prima = G.length ? AR.scontroDiGruppo(S, G, t).valore : 0;
        const dopo = AR.scontroDiGruppo(S, [...G, { u, lato: c.lato }], t).valore;
        const guadagno = c.chance * (dopo - prima);
        if (!meglio || guadagno > meglio.guadagno) meglio = { c, u, guadagno, prima, dopo };
      }
      if (!meglio || meglio.guadagno < soglia) break;
      prese.add(meglio.c.uid);
      gruppi.set(meglio.c.target, [...(gruppi.get(meglio.c.target) || []), { u: meglio.u, lato: meglio.c.lato }]);
      piano.push(meglio);
    }
    return piano;
  }

  return {
    nome, piano: euristica.piano,
    async scegli(ctx){
      const { opzioni: o, stato: S } = ctx;
      passo++;
      const l = o.list;
      if (!S || l.length < 2 || S.schierando || S.preparando) return euristica.scegli(ctx);
      const me = o.player;

      /* LE CARICHE */
      if (o.casella === "cariche" && !S.pending){
        const cariche = l.filter(x => x.id === "carica");
        if (!cariche.length) return euristica.scegli(ctx);
        const piano = assegna(S, cariche);
        if (!piano.length){
          const basta = l.find(x => x.id === "avanti");
          return { scelta: basta, perche: "nessuna carica rende abbastanza: " +
            cariche.slice(0, 2).map(c => `${c.nome} su ${c.contro} ${c.chance > 0 ? "arriva il " + Math.round(c.chance * 100) + "%" : ""} e renderebbe ${c.esito}`).join("; ") };
        }
        const p = piano[0];
        const insieme = piano.filter(x => x.c.target === p.c.target).length > 1;
        return { scelta: p.c, perche: `carico ${p.c.contro} con ${p.c.nome}: arriva il ${Math.round(p.c.chance * 100)}% e ` +
          (p.prima ? `aggiunge ${Math.round(p.dopo - p.prima)} punti a chi ci va già` : `vale ${Math.round(p.dopo)} punti al primo round`) +
          (insieme ? ", e non da sola: ci arriva in due" : "") + ` (${p.c.why})` };
      }

      /* LE REAZIONI */
      if (S.pending && S.pending.kind === "reazione"){
        return scegliProvando(S, l, me, ctx, "reagisce");
      }
      if (S.pending) return euristica.scegli(ctx);

      /* IL MOVIMENTO E IL TIRO: le mosse dell'unita' che l'euristica
         muoverebbe, tutte, provate */
      if (o.casella === "mosse" || o.casella === "tiro"){
        const r = await euristica.scegli(ctx);
        const x = r && r.scelta;
        if (!x || x.id === "avanti" || x.uid == null) return r;
        const tipo = o.casella === "mosse" ? MOSSE : TIRI;
        if (!tipo.has(x.id)) return r;
        const sue = l.filter(y => y.uid === x.uid && tipo.has(y.id));
        if (sue.length < 2) return r;
        return scegliProvando(S, sue, me, ctx, "", x, r);
      }
      return euristica.scegli(ctx);
    },
  };

  async function scegliProvando(S, lista, me, ctx, verbo, suggerita = null, rSugg = null){
    const valutate = [];
    for (const m of lista){
      const v = await media(S, m, me);
      if (v != null) valutate.push({ m, v });
    }
    if (!valutate.length) return rSugg || euristica.scegli(ctx);
    valutate.sort((a, b) => b.v - a.v);
    const top = valutate[0];
    /* a parita' (meno di un punto) si tiene quella dell'euristica: la
       ricerca cambia idea solo quando i numeri lo dicono */
    const sugg = suggerita && valutate.find(x => x.m === suggerita);
    if (sugg && top.v - sugg.v < 1) return { ...rSugg, perche: rSugg.perche + ` [guardando avanti: ${Math.round(sugg.v)}, la migliore]` };
    const altre = valutate.slice(1, 3).map(x => `${x.m.id}${x.m.contro ? " " + x.m.contro : ""} ${Math.round(x.v)}`).join(", ");
    return { scelta: top.m, perche: `${top.m.nome || ""} ${verbo || top.m.id}${top.m.contro ? " (" + top.m.contro + ")" : ""}: ` +
      `guardando un passo avanti vale ${Math.round(top.v)}` + (altre ? `, contro ${altre}` : "") + ` — ${top.m.why || ""}` };
  }
}
