/* Schieramento Old World — il simulatore, dalla parte della pagina
 *
 * Accende il lavoro di `simulatore-lavoro.js` in un Web Worker e ne
 * riporta l'avanzamento. Se il browser non sa fare i Worker di tipo
 * modulo, la stessa funzione gira qui, fra un ridisegno e l'altro.
 */

export function avviaSerie(opz, { onAvanza = () => {}, onFine = () => {}, onErrore = () => {} } = {}){
  let w = null, fermo = false, finito = false;
  const chiudi = () => { finito = true; if (w){ w.terminate(); w = null; } };
  try {
    w = new Worker(new URL('./simulatore-lavoro.js', import.meta.url), { type: 'module' });
  } catch (_){ w = null; }
  if (w){
    w.onmessage = e => {
      const m = e.data || {};
      if (m.tipo === 'avanza') onAvanza(m.k, m.n);
      else if (m.tipo === 'fine'){ chiudi(); onFine(m); }
      else if (m.tipo === 'errore'){ chiudi(); onErrore(m.messaggio); }
    };
    w.onerror = e => { if (finito) return; chiudi(); onErrore((e && e.message) || "il simulatore si è fermato"); };
    w.postMessage({ tipo: 'serie', opz });
  } else {
    /* senza Worker: qui, con una pausa fra una partita e l'altra */
    import('./simulatore-lavoro.js')
      .then(L => L.giocaTante(opz, { avanza: onAvanza, fermato: () => fermo, caricare: false }))
      .then(r => { finito = true; onFine(r); }, err => { finito = true; onErrore(err.message || String(err)); });
  }
  return {
    ferma(){ fermo = true; if (w) w.postMessage({ tipo: 'ferma' }); },
    uccidi(){ chiudi(); },
    get finito(){ return finito; },
  };
}
