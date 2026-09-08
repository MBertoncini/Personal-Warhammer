/* Schieramento Old World — annulla e ripeti
 *
 * Il tavolo si tocca in continuazione: un trascinamento sbagliato,
 * un "Schiera tutto" premuto per errore su un lavoro di dieci minuti,
 * un Canc su un'unita'. Senza una rete sotto, ogni gesto e' definitivo.
 *
 * Il modello e' quello classico: PRIMA di ogni modifica si mette da
 * parte lo stato attuale. Annulla riporta indietro di uno e sposta lo
 * stato corrente nella pila del ripeti.
 *
 * Gli stati sono copie profonde via JSON: lo snapshot del tavolo e'
 * gia' dati semplici, e una copia per gesto su cinquanta unita' costa
 * meno di un millisecondo.
 */

const clone = v => JSON.parse(JSON.stringify(v));

export function createHistory({ capture, restore, onChange = () => {}, limit = 80 }){
  let undoStack = [];   // [{ label, state }]
  let redoStack = [];
  let lastKey = "", lastAt = 0;
  let muted = 0;

  const changed = () => onChange({
    canUndo: undoStack.length > 0, canRedo: redoStack.length > 0,
    undoLabel: undoStack.length ? undoStack[undoStack.length - 1].label : "",
    redoLabel: redoStack.length ? redoStack[redoStack.length - 1].label : "",
  });

  /* Un gesto continuo (scrivere il nome, tenere premuta una freccia)
     non deve lasciare trenta passi indietro: entro la finestra, con la
     stessa etichetta, il passo gia' aperto basta. */
  function push(label = "modifica", { coalesce = 0 } = {}){
    if (muted) return;
    const now = Date.now();
    if (coalesce && label === lastKey && now - lastAt < coalesce){ lastAt = now; return; }
    lastKey = label; lastAt = now;
    undoStack.push({ label, state: clone(capture()) });
    if (undoStack.length > limit) undoStack.shift();
    redoStack = [];
    changed();
  }

  function undo(){
    if (!undoStack.length) return null;
    const step = undoStack.pop();
    redoStack.push({ label: step.label, state: clone(capture()) });
    muted++; try { restore(step.state); } finally { muted--; }
    lastKey = ""; changed();
    return step.label;
  }

  function redo(){
    if (!redoStack.length) return null;
    const step = redoStack.pop();
    undoStack.push({ label: step.label, state: clone(capture()) });
    muted++; try { restore(step.state); } finally { muted--; }
    lastKey = ""; changed();
    return step.label;
  }

  /* Un gesto cominciato e non fatto: il passo si e' aperto al
     pointerdown, ma il dito si e' alzato senza spostare niente. Senza
     questo resta nella pila un annulla che non annulla nulla, e per
     tornare a prima ne servono due. */
  function discard(){
    if (muted || !undoStack.length) return false;
    undoStack.pop();
    lastKey = ""; changed();
    return true;
  }

  /* per le operazioni che ricostruiscono il mondo da zero (caricare un
     backup, aprire uno schieramento salvato): la storia di prima non
     c'entra piu' niente con quello che si vede */
  function reset(){ undoStack = []; redoStack = []; lastKey = ""; changed(); }

  /* esegue fn senza che le push interne sporchino la storia */
  function silent(fn){ muted++; try { return fn(); } finally { muted--; } }

  return {
    push, undo, redo, reset, silent, discard,
    get canUndo(){ return undoStack.length > 0; },
    get canRedo(){ return redoStack.length > 0; },
    get depth(){ return undoStack.length; },
  };
}
