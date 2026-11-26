/* Schieramento Old World — due liste dalla stessa parte del tavolo
 *
 * Il 2 contro 1 del circolo: due giocatori con 500 punti a testa contro
 * uno con 1000, o due contro due. Al tavolo ognuno gioca il suo
 * esercito, ma i due eserciti alleati muovono nello stesso turno, sono
 * amici fra loro e vincono o perdono insieme.
 *
 * Il motore conosce due parti, A e B, e una lista per parte. Invece di
 * insegnargli una terza parte, qui due liste diventano una lista sola —
 * le unità una dopo l'altra, le schede di preparazione rinumerate — e
 * la lista unita si porta dietro i suoi CONTINGENTI: chi viene da quale
 * lista, con il suo generale e il suo stendardo da battaglia. Tutto
 * quello che passa una lista (il tavolo, la sfida, le serie, il
 * Laboratorio) passa così anche due liste alleate, senza saperlo.
 *
 * Le due cose che il motore deve sapere le legge da `alleati` e da
 * `alleato` su ogni unità (arbitro.js):
 *   - ogni generale ispira solo le unità della sua lista: il Comando di
 *     un Warboss alleato non arriva ai Saurus (p. 202 vale per «your
 *     army», e l'esercito alleato è un altro);
 *   - ogni generale e ogni stendardo perso valgono punti all'altra
 *     parte, come in una partita normale.
 *
 * Quello che resta ai giocatori, come sempre: chi muove prima fra i due
 * alleati, e se un personaggio può unirsi a un reggimento dell'altro
 * esercito (qui no: un capo si schiera solo nella sua lista).
 */

import { prepOf, guessGeneral, guessBsb } from './prep.js';

export const PREFISSO = "alleati:";

/* l'id di una coppia: le due liste in ordine, così A+B e B+A sono la stessa */
export const idAlleanza = (a, b) => PREFISSO + [a, b].join("+");
export const eAlleanza = id => String(id || "").startsWith(PREFISSO);
export const partiDi = id => eAlleanza(id) ? String(id).slice(PREFISSO.length).split("+").filter(Boolean) : [id];

const fazione = l => (l && l.info && l.info.catalogue) || "";

/* Le due liste diventano una. `nome` è come la si chiama sul tavolo e
   nel diario: di solito «Tizio + Caio». Una lista sola, o una seconda
   vuota, torna com'è. */
export function unisci(prima, seconda, { nome = "" } = {}){
  if (!prima) return seconda || null;
  if (!seconda) return prima;
  const liste = [prima, seconda];
  const units = [], prepUnits = {}, contingenti = [];
  for (const [k, l] of liste.entries()){
    const p = prepOf(l), da = units.length;
    const sposta = i => i == null || i === "" || i === "solo" ? i : +i + da;
    for (const [i, u] of (l.units || []).entries()){
      /* la fazione su ogni unità: con due eserciti diversi è da lì che
         si trovano le regole d'esercito, non dal catalogo della lista */
      units.push({ ...structuredClone(u), faction: u.faction || fazione(l) || undefined, alleato: k });
      const r = (p.units || {})[i];
      if (r) prepUnits[da + i] = r.con != null ? { ...r, con: sposta(r.con) } : { ...r };
    }
    contingenti.push({
      id: l.id || "", name: l.name || `Lista ${k + 1}`, catalogue: fazione(l),
      da, a: units.length, points: puntiDi(l),
      /* se la scheda tace, quello che la scheda proporrebbe per quella
         lista da sola: nella lista unita il Comando più alto sarebbe
         uno solo per due eserciti */
      general: sposta(p.general != null ? p.general : guessGeneral(l)),
      bsb: sposta(p.bsb != null ? p.bsb : guessBsb(l)),
    });
  }
  const p0 = contingenti[0];
  const cat = [...new Set(contingenti.map(c => c.catalogue).filter(Boolean))];
  return {
    id: idAlleanza(prima.id || "a", seconda.id || "b"),
    name: nome || `${prima.name} + ${seconda.name}`,
    points: contingenti.reduce((s, c) => s + c.points, 0),
    /* `alleati` nelle info viaggia con la partita salvata nel diario:
       il palmarès di ognuna delle due liste la conta (palmares.js) */
    info: { ...(prima.info || {}), catalogue: cat.join(" + "), alleati: contingenti.map(c => c.name),
            limit: (+((prima.info || {}).limit) || puntiDi(prima)) + (+((seconda.info || {}).limit) || puntiDi(seconda)) },
    units,
    /* il generale e lo stendardo della prima lista sono quelli «della
       parte», per chi conosce una lista sola; gli altri stanno nei
       contingenti */
    prep: { general: p0.general, bsb: p0.bsb, units: prepUnits, note: "" },
    alleati: contingenti,
    /* è una lista di qualcun altro due volte: la collezione la conta chi
       la sa dividere (matchup.js), non chi guarda la lista */
    external: !!(prima.external && seconda.external),
  };
}

const puntiDi = l => +(l && l.points) || ((l && l.units) || []).reduce((s, u) => s + (+u.pts || 0), 0);

/* «A + B (500 + 500)», per le etichette */
export function descrivi(l){
  if (!l || !l.alleati) return l ? l.name : "";
  return `${l.name} (${l.alleati.map(c => c.points).join(" + ")} pt)`;
}
